// hyperrank-outcomes-bg.js — background-service-worker collector for HYPERRANK
// outcome tracking. Runs periodically (wired via chrome.alarms in background.js,
// same pattern as the publication scanner / dashboard snapshot alarms).
//
// Reads `hyperrankedItems` (written by content-script.js when the ⚡ HYPERRANK
// button is used: { [itemId]: { ts, visits, followers } | legacy bare number })
// and, for every entry that doesn't yet have a recorded outcome in
// `hyperrankOutcomes`, checks whether the item has ended and — if so — records
// the auction result.
//
// Also runs the CONTROL side of the Räddningslistan A/B comparison: reads
// `rescueObserved` (written by admin-dashboard.js's upsertRescueObserved on
// every Räddningslistan fetch — every zero-bid/≤72h item seen, tagged by
// item-id parity as 'treat' or 'control') and records outcomes for ended
// 'control'-parity items (odd id, never hyperranked) into a separate
// `rescueControlOutcomes` key, using the exact same lookup/sold/inferred-
// unsold/lost rules. Items that started as control candidates but were later
// actually hyperranked are excluded (they belong to the treated flow, tracked
// via `hyperrankedItems`/`hyperrankOutcomes` instead). Both passes share one
// fetch budget per alarm run (MAX_FETCHES_PER_RUN total, treated items first).
//
// Storage: chrome.storage.local, per-machine (this is a single-pilot-machine
// dataset for now). If multiple machines ever need to share one dataset, the
// natural home is the existing Cloudflare Worker + D1 backend (see
// workers/outlet-api and the spellcheck Worker for the established pattern) —
// not attempted here to keep this pilot simple.
//
// ─── Verified Auctionet public API shapes (2026-07-20, live curl checks) ───
// - There is NO per-id endpoint (`/api/v2/items/<id>.json` → 404).
// - `items.json?q=<id>` finds the item ONLY while it is still live/published
//   (or within a short post-end grace window) — once fully ended it drops out.
// - `items.json?is=ended&q=<id>` finds the item once Auctionet has finalized
//   it as sold. Every `is=ended` item observed had state:"sold", hammered:false,
//   reserve_met:true and a non-empty `bids` array — Auctionet does not appear
//   to surface "ended without a sale" items through `is=ended` at all (those
//   items simply stop appearing in the public API once their `ends_at` passes
//   with no winning bid — matches the "recalled/unsold" items handled by the
//   separate SaS Outlet flow). So: found via is=ended -> sold; not found in
//   either lookup once `ends_at` has passed -> treat as ended-unsold.
// - `state=` as a query filter is NOT respected by the API (returns the same
//   default page regardless of value) — never rely on it.
// - `bids` is an array of { id, bidder, amount, your_bid, reserve_met, auto,
//   timestamp }, sorted DESCENDING by amount/recency — bids[0] is the winning
//   bid, bids[0].amount is the hammer amount. `timestamp` is epoch SECONDS.
// - There is no separate `hammer_price` field; `hammered` is a distinct legacy
//   boolean (observed always false in current sold items) — do not treat it as
//   the sold/unsold signal. Use `state === 'sold'` (via is=ended) instead.

const HYPERRANK_ITEMS_KEY = 'hyperrankedItems';
const HYPERRANK_OUTCOMES_KEY = 'hyperrankOutcomes';
// Control side of the A/B comparison (Räddningslistan item-id-parity protocol —
// see admin-dashboard.js upsertRescueObserved/rescueParity). Written by
// admin-dashboard.js on every Räddningslistan fetch; read here to find the
// odd-id ("control", left untouched) items whose auctions have ended so we
// can record what happened to them without any hyperrank intervention.
const RESCUE_OBSERVED_KEY = 'rescueObserved';
const RESCUE_CONTROL_OUTCOMES_KEY = 'rescueControlOutcomes';
const MAX_FETCHES_PER_RUN = 20;
const FETCH_SPACING_MS = 500;
const LOST_AFTER_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
// Unsold items vanish from the public API entirely (sold ones appear in the
// is=ended archive). An item still missing 45 days after its hyperrank has
// certainly ended — record it as inferred-unsold rather than dropping it,
// otherwise the scoreboard's sold-rate only counts found (= sold) outcomes.
const UNSOLD_INFER_AFTER_MS = 45 * 24 * 60 * 60 * 1000; // 45 days
const FETCH_TIMEOUT_MS = 10000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) return null;
    return await resp.json();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Looks up a single item by id. Tries the live/default scope first (cheap,
// covers the common "still running" case), then falls back to is=ended for
// items that have finished and sold. Returns { item, ended, sold } or null
// if not found in either (caller decides lost/unsold based on age).
async function lookupItem(itemId) {
  const liveData = await fetchJson(`https://auctionet.com/api/v2/items.json?q=${encodeURIComponent(itemId)}`);
  const liveItem = liveData?.items?.find(it => String(it.id) === String(itemId));
  if (liveItem) {
    return { item: liveItem, ended: false, sold: false };
  }

  const endedData = await fetchJson(`https://auctionet.com/api/v2/items.json?is=ended&q=${encodeURIComponent(itemId)}`);
  const endedItem = endedData?.items?.find(it => String(it.id) === String(itemId));
  if (endedItem) {
    return { item: endedItem, ended: true, sold: endedItem.state === 'sold' };
  }

  return null; // Not found anywhere — either not ended-with-a-sale, or gone.
}

// Builds the outcome record from a confirmed-ended item + the original
// hyperrank log entry. Bids are sorted descending by Auctionet already;
// bids[0] is the winning/highest bid.
function buildOutcomeRecord(itemId, item, entry, sold) {
  const bids = Array.isArray(item.bids) ? item.bids : [];
  const hyperrankTs = typeof entry === 'number' ? entry : entry?.ts;
  const hyperrankTsSec = hyperrankTs ? hyperrankTs / 1000 : null;
  const bidsAfterHyperrank = hyperrankTsSec
    ? bids.filter(b => typeof b.timestamp === 'number' && b.timestamp > hyperrankTsSec).length
    : null;

  return {
    itemId: String(itemId),
    endedAt: item.ends_at ? item.ends_at * 1000 : Date.now(),
    sold: !!sold,
    finalBidCount: bids.length,
    bidsAfterHyperrank,
    highestBid: bids.length > 0 ? bids[0].amount : null,
    estimate: typeof item.estimate === 'number' ? item.estimate : null,
    baselineVisits: typeof entry === 'object' && entry ? (entry.visits ?? null) : null,
    hyperrankTs: hyperrankTs ?? null
  };
}

// Shared per-run fetch budget helper — both the treated-items pass and the
// control-items pass draw from the same counter object so the combined total
// never exceeds MAX_FETCHES_PER_RUN across a single alarm firing. Treated
// items are processed first and therefore get priority on the budget.
function budgetRemaining(budget) {
  return MAX_FETCHES_PER_RUN - budget.fetches;
}

// Processes one pending entry (itemId + its baseline entry) against the
// shared budget, writing into `outcomes` on success. Returns true if a fetch
// was spent (whether or not it produced a recorded outcome).
async function processPendingEntry(itemId, entry, outcomes, budget) {
  if (budgetRemaining(budget) <= 0) return false;

  const hyperrankTs = typeof entry === 'number' ? entry : entry?.ts;

  try {
    budget.fetches++;
    const result = await lookupItem(itemId);

    if (result) {
      if (result.ended) {
        outcomes[itemId] = buildOutcomeRecord(itemId, result.item, entry, result.sold);
        budget.recorded++;
        budget.changed = true;
      }
      // else: still live — skip, retry next run.
    } else {
      // Not found anywhere. Ended items usually surface in the is=ended
      // archive (state 'sold' OR 'unsold' — verified 2026-07-24), but items
      // can still drop out of the public API (withdrawn, relist gap, archive
      // lag). After the 45-day window record inferred-unsold so the sold-rate
      // isn't biased toward found (= mostly sold) outcomes. 90 days = give up.
      if (hyperrankTs && (Date.now() - hyperrankTs) > LOST_AFTER_MS) {
        outcomes[itemId] = { itemId: String(itemId), lost: true, checkedAt: Date.now() };
        budget.recorded++;
        budget.changed = true;
      } else if (hyperrankTs && (Date.now() - hyperrankTs) > UNSOLD_INFER_AFTER_MS) {
        outcomes[itemId] = {
          itemId: String(itemId),
          endedAt: null,
          sold: false,
          inferredUnsold: true,
          finalBidCount: null,
          bidsAfterHyperrank: null,
          highestBid: null,
          estimate: null,
          baselineVisits: (entry && typeof entry === 'object') ? entry.visits ?? null : null,
          hyperrankTs
        };
        budget.recorded++;
        budget.changed = true;
      }
    }
  } catch (e) {
    console.warn('[HyperrankOutcomes] Lookup failed for item', itemId, e.message);
  }

  return true;
}

// Runs one collection pass: for every hyperranked item without a recorded
// outcome (and not already marked lost), check if it has ended and record
// the result. Fail-soft throughout — a single bad fetch never aborts the run.
//
// Also drives the control-side collection (see collectRescueControlOutcomes
// below) from the SAME run, sharing one fetch budget across both — treated
// items are processed first and get priority, control items spend whatever
// budget is left over.
export async function collectHyperrankOutcomes() {
  const budget = { fetches: 0, recorded: 0, changed: false };
  let treatedResult = { checked: 0, recorded: 0 };
  let controlResult = { checked: 0, recorded: 0 };

  try {
    const stored = await chrome.storage.local.get([HYPERRANK_ITEMS_KEY, HYPERRANK_OUTCOMES_KEY]);
    const hyperrankedItems = stored[HYPERRANK_ITEMS_KEY] || {};
    const outcomes = stored[HYPERRANK_OUTCOMES_KEY] || {};

    const pending = Object.entries(hyperrankedItems).filter(([itemId]) => !outcomes[itemId]);

    // Fair-share guard: reserve up to half the budget for the control pass when
    // it has ended items waiting. With a long treated backlog, "controls get
    // the leftovers" starved them indefinitely (observed 2026-07-24: 17 ended
    // controls, 0 recorded, while ~80 pending treated ate every run's budget).
    let controlReserve = 0;
    try {
      const cStored = await chrome.storage.local.get([RESCUE_OBSERVED_KEY, RESCUE_CONTROL_OUTCOMES_KEY]);
      const cObserved = cStored[RESCUE_OBSERVED_KEY] || {};
      const cOutcomes = cStored[RESCUE_CONTROL_OUTCOMES_KEY] || {};
      const nowTs = Date.now();
      const controlsPending = Object.entries(cObserved).filter(([id, e]) =>
        !cOutcomes[id] && !hyperrankedItems[id]
        && e && typeof e.endsAt === 'number' && e.endsAt <= nowTs).length;
      controlReserve = Math.min(controlsPending, Math.floor(MAX_FETCHES_PER_RUN / 2));
    } catch (e) {
      console.warn('[HyperrankOutcomes] Control-reserve check failed:', e.message);
    }

    if (pending.length > 0) {
      const startFetches = budget.fetches;
      let changed = false;

      for (const [itemId, entry] of pending) {
        if (budgetRemaining(budget) <= controlReserve) break;
        const spent = await processPendingEntry(itemId, entry, outcomes, budget);
        if (budget.changed) changed = true;
        if (spent && budgetRemaining(budget) > 0) {
          await sleep(FETCH_SPACING_MS);
        }
      }

      if (changed) {
        await chrome.storage.local.set({ [HYPERRANK_OUTCOMES_KEY]: outcomes });
      }
      treatedResult = { checked: budget.fetches - startFetches, recorded: budget.recorded };
    }
  } catch (e) {
    console.warn('[HyperrankOutcomes] Collection run failed:', e.message);
  }

  // Control pass reuses whatever budget the treated pass didn't spend.
  try {
    controlResult = await collectRescueControlOutcomes(budget);
  } catch (e) {
    console.warn('[HyperrankOutcomes] Control collection run failed:', e.message);
  }

  return {
    checked: treatedResult.checked + controlResult.checked,
    recorded: treatedResult.recorded + controlResult.recorded,
    changed: (treatedResult.recorded + controlResult.recorded) > 0,
    treated: treatedResult,
    control: controlResult
  };
}

// ─── Control-side outcomes (untreated Räddningslistan items) ───────────
// Follows `rescueObserved` entries (written by admin-dashboard.js on every
// Räddningslistan fetch — { [itemId]: { firstSeenTs, endsAt, estimate, parity } })
// whose endsAt has passed and that don't yet have a recorded outcome in
// `rescueControlOutcomes`. Any itemId that shows up in `hyperrankedItems` is
// excluded here — an item observed as a control candidate but later actually
// hyperranked belongs to the treated flow above, not the control side, since
// it no longer represents "no intervention".
//
// Reuses the exact same lookup + ended/sold/inferred-unsold/lost logic as the
// treated pass (see lookupItem/buildOutcomeRecord and the age thresholds
// above) so the two sides of the A/B comparison are built from identical rules.
async function collectRescueControlOutcomes(budget) {
  if (budgetRemaining(budget) <= 0) return { checked: 0, recorded: 0 };

  const stored = await chrome.storage.local.get([RESCUE_OBSERVED_KEY, RESCUE_CONTROL_OUTCOMES_KEY, HYPERRANK_ITEMS_KEY]);
  const observed = stored[RESCUE_OBSERVED_KEY] || {};
  const controlOutcomes = stored[RESCUE_CONTROL_OUTCOMES_KEY] || {};
  const hyperrankedItems = stored[HYPERRANK_ITEMS_KEY] || {};

  const now = Date.now();
  const pending = Object.entries(observed).filter(([itemId, entry]) => {
    if (controlOutcomes[itemId]) return false; // already recorded
    if (hyperrankedItems[itemId]) return false; // actually treated -> belongs to the other flow
    if (!entry || typeof entry.endsAt !== 'number' || entry.endsAt > now) return false; // not ended yet
    return true;
  });

  if (pending.length === 0) return { checked: 0, recorded: 0 };

  const startFetches = budget.fetches;
  let recorded = 0;
  let changed = false;

  for (const [itemId, entry] of pending) {
    if (budgetRemaining(budget) <= 0) break;

    // Reuse the hyperrankTs-shaped age thresholds against endsAt instead —
    // a control item was never hyperranked, so "time since it should have
    // ended" is the equivalent clock for the same inferred-unsold/lost rules.
    const endsAt = entry.endsAt;

    try {
      budget.fetches++;
      const result = await lookupItem(itemId);

      if (result) {
        if (result.ended) {
          const bids = Array.isArray(result.item.bids) ? result.item.bids : [];
          controlOutcomes[itemId] = {
            itemId: String(itemId),
            endedAt: result.item.ends_at ? result.item.ends_at * 1000 : endsAt,
            sold: !!result.sold,
            finalBidCount: bids.length,
            highestBid: bids.length > 0 ? bids[0].amount : null,
            estimate: typeof result.item.estimate === 'number' ? result.item.estimate : (entry.estimate ?? null)
          };
          changed = true;
          recorded++;
        }
        // else: still live — skip, retry next run.
      } else {
        if ((now - endsAt) > LOST_AFTER_MS) {
          controlOutcomes[itemId] = { itemId: String(itemId), lost: true, checkedAt: now };
          changed = true;
          recorded++;
        } else if ((now - endsAt) > UNSOLD_INFER_AFTER_MS) {
          controlOutcomes[itemId] = {
            itemId: String(itemId),
            endedAt: null,
            sold: false,
            inferredUnsold: true,
            finalBidCount: null,
            highestBid: null,
            estimate: entry.estimate ?? null
          };
          changed = true;
          recorded++;
        }
      }
    } catch (e) {
      console.warn('[HyperrankOutcomes] Control lookup failed for item', itemId, e.message);
    }

    if (budgetRemaining(budget) > 0) {
      await sleep(FETCH_SPACING_MS);
    }
  }

  if (changed) {
    await chrome.storage.local.set({ [RESCUE_CONTROL_OUTCOMES_KEY]: controlOutcomes });
  }

  return { checked: budget.fetches - startFetches, recorded };
}

// ─── Shared-backend sync (Cloudflare Worker + D1) ──────────────────────
// Pushes the FULL current local state to the sas-hyperrank-api Worker so
// two pilot machines (Micke + Anders) merge into one dataset instead of
// each holding a separate chrome.storage.local copy. Fail-soft throughout —
// no token configured, or the Worker being unreachable, never breaks the
// local collector; this is purely additive.
//
// Uses globalThis.__hyperrankApiFetch, exposed by background.js (same
// service worker, same pattern as globalThis.__spellcheckFetch for the
// publication scanner) — keeps the bearer token out of this module.
const HYPERRANK_MACHINE_LABEL_KEY = 'hyperrankMachineLabel';

function buildTreatmentRows(hyperrankedItems, machine) {
  return Object.entries(hyperrankedItems).map(([itemId, entry]) => {
    const isObject = entry && typeof entry === 'object';
    return {
      itemId: String(itemId),
      ts: isObject ? (entry.ts ?? null) : (typeof entry === 'number' ? entry : null),
      mode: isObject ? (entry.mode ?? null) : null,
      visits: isObject ? (entry.visits ?? null) : null,
      followers: isObject ? (entry.followers ?? null) : null,
      machine
    };
  });
}

function buildOutcomeRows(hyperrankOutcomes, rescueControlOutcomes) {
  const treated = Object.entries(hyperrankOutcomes).map(([itemId, o]) => ({
    itemId: String(itemId),
    arm: 'treated',
    endedAt: o.endedAt ?? null,
    sold: !!o.sold,
    inferredUnsold: !!o.inferredUnsold,
    lost: !!o.lost,
    finalBidCount: o.finalBidCount ?? null,
    bidsAfterHyperrank: o.bidsAfterHyperrank ?? null,
    highestBid: o.highestBid ?? null,
    estimate: o.estimate ?? null,
    recordedAt: o.checkedAt ?? o.hyperrankTs ?? Date.now()
  }));
  const control = Object.entries(rescueControlOutcomes).map(([itemId, o]) => ({
    itemId: String(itemId),
    arm: 'control',
    endedAt: o.endedAt ?? null,
    sold: !!o.sold,
    inferredUnsold: !!o.inferredUnsold,
    lost: !!o.lost,
    finalBidCount: o.finalBidCount ?? null,
    bidsAfterHyperrank: null,
    highestBid: o.highestBid ?? null,
    estimate: o.estimate ?? null,
    recordedAt: o.checkedAt ?? Date.now()
  }));
  return [...treated, ...control];
}

function buildRescueObservedRows(rescueObserved) {
  return Object.entries(rescueObserved).map(([itemId, entry]) => ({
    itemId: String(itemId),
    firstSeenTs: entry?.firstSeenTs ?? null,
    endsAt: entry?.endsAt ?? null,
    estimate: entry?.estimate ?? null,
    parity: entry?.parity ?? null,
    protocolViolation: !!entry?.protocolViolation,
    relistCount: Number.isFinite(entry?.relistCount) ? entry.relistCount : 0
  }));
}

// Pushes the full current local state through the sync. Skips silently if
// no token is configured (checked indirectly via the fetch throwing) or if
// the Worker call fails for any reason — this must never surface an error
// to the alarm-driven caller.
export async function syncHyperrankData() {
  if (typeof globalThis.__hyperrankApiFetch !== 'function') return { skipped: true };

  try {
    const stored = await chrome.storage.local.get([
      HYPERRANK_ITEMS_KEY,
      HYPERRANK_OUTCOMES_KEY,
      RESCUE_OBSERVED_KEY,
      RESCUE_CONTROL_OUTCOMES_KEY,
      HYPERRANK_MACHINE_LABEL_KEY
    ]);
    const hyperrankedItems = stored[HYPERRANK_ITEMS_KEY] || {};
    const hyperrankOutcomes = stored[HYPERRANK_OUTCOMES_KEY] || {};
    const rescueObserved = stored[RESCUE_OBSERVED_KEY] || {};
    const rescueControlOutcomes = stored[RESCUE_CONTROL_OUTCOMES_KEY] || {};
    const machine = stored[HYPERRANK_MACHINE_LABEL_KEY] || 'okänd';

    const payload = {
      treatments: buildTreatmentRows(hyperrankedItems, machine),
      outcomes: buildOutcomeRows(hyperrankOutcomes, rescueControlOutcomes),
      rescueObserved: buildRescueObservedRows(rescueObserved)
    };

    // Nothing to push — skip the network call entirely.
    if (payload.treatments.length === 0 && payload.outcomes.length === 0 && payload.rescueObserved.length === 0) {
      return { skipped: true };
    }

    return await globalThis.__hyperrankApiFetch('POST', '/sync', payload);
  } catch (e) {
    // No token configured throws 'HYPERRANK-synk ej konfigurerad' — treat
    // that the same as any other fail-soft skip.
    console.warn('[HyperrankOutcomes] Sync push skipped/failed:', e.message);
    return { skipped: true, error: e.message };
  }
}
