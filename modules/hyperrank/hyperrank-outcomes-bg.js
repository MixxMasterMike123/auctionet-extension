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
// Relist tracking ("life" number): unsold Auctionet items relist up to 3x
// under the SAME item id, with a later ends_at each time. Both arms track how
// many extra lives an item has had via a `relistCount` field (0 = still on
// its first life), bumped by checkRelist() whenever a still-live lookup finds
// ends_at has jumped >24h past what was last seen (a real relist, not a minor
// bid-driven end-time extension). Treated entries keep this on
// `hyperrankedItems[id].relistCount`/`.lastKnownEndsAt`; control entries keep
// it on the existing `rescueObserved[id].relistCount`/`.endsAt` (shared with
// admin-dashboard.js's own independent relist detection on the same fields).
// relistCount is copied onto the outcome record when it finalizes, so the
// scoreboard can split sold/unsold by life number. Old records without this
// field are treated as relistCount 0 everywhere it's read.
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
const MAX_FETCHES_PER_RUN = 40;
const FETCH_SPACING_MS = 500;
// Auctions run 8-10 days, so a treated item whose end time we don't know yet
// cannot have ended within a week of its hyperrank — skip it until then
// rather than spending a fetch to learn it's still live.
const MIN_TREATED_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const LOST_AFTER_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
// Unsold items vanish from the public API entirely (sold ones appear in the
// is=ended archive). An item still missing 45 days after its hyperrank has
// certainly ended — record it as inferred-unsold rather than dropping it,
// otherwise the scoreboard's sold-rate only counts found (= sold) outcomes.
const UNSOLD_INFER_AFTER_MS = 45 * 24 * 60 * 60 * 1000; // 45 days
const FETCH_TIMEOUT_MS = 10000;
// How far back an archive-confirmed-unsold outcome is still worth re-checking
// for a relist. Auctionet relists fairly promptly after an unsold ending, so
// a relist that hasn't shown up within 60 days of the original ending is
// unlikely to ever show up — stop spending budget on it after that.
const RELIST_RECHECK_WINDOW_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

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
    hyperrankTs: hyperrankTs ?? null,
    // Number of lives observed beyond the first (see checkRelist below).
    // Old entries predate this field — default to 0 everywhere it's read.
    relistCount: (typeof entry === 'object' && entry && Number.isFinite(entry.relistCount)) ? entry.relistCount : 0,
    // When this record was last confirmed against the API — local-only
    // bookkeeping (not synced to the Worker) used to rotate the archive-
    // unsold relist re-check (see recheckArchivedUnsold) oldest-first rather
    // than hammering the same items every run.
    checkedAt: Date.now()
  };
}

// Relist detection shared by both arms: unsold items keep their id and come
// back with a later ends_at (up to 3 lives, reserve may drop — see
// admin-dashboard.js's upsertRescueObserved, which independently detects the
// same signal from the Räddningslistan scrape side, on the SAME `endsAt`/
// `relistCount` fields for control records). Here we detect it from the
// collector's OWN still-live lookups, so an item's relistCount stays accurate
// even if it never re-enters the rescue window. A jump must be >24h past the
// previously stored end time to count as a genuine new life — small jumps
// are just bid-driven end-time extensions ("snipe protection"), not a
// relist. Mutates `record` in place (record.relistCount, record[endsAtField])
// and returns true if it changed. `endsAtField` lets treated entries (which
// have no pre-existing endsAt field) use `lastKnownEndsAt` while control
// entries (`rescueObserved`) reuse their existing `endsAt` field.
function checkRelist(record, liveEndsAtSec, endsAtField = 'lastKnownEndsAt') {
  if (typeof liveEndsAtSec !== 'number') return false;
  const liveEndsAtMs = liveEndsAtSec * 1000;
  const priorEndsAt = record[endsAtField];
  const isRelist = typeof priorEndsAt === 'number' && liveEndsAtMs > priorEndsAt + 24 * 3600 * 1000;
  if (isRelist) {
    record.relistCount = (Number.isFinite(record.relistCount) ? record.relistCount : 0) + 1;
  }
  if (priorEndsAt !== liveEndsAtMs) {
    record[endsAtField] = liveEndsAtMs;
    return true;
  }
  return isRelist;
}

// Persists only the entries this run touched, onto a fresh read of the key.
// Both maps the collector stamps (hyperrankedItems, rescueObserved) are also
// read-modify-written by page scripts while a run is in flight (~30-60 s of
// spaced fetches); writing the run's stale snapshot back would drop whatever
// they added in between. An id the other writer removed meanwhile is
// re-added — harmless, it gets pruned again on the next pass.
async function mergeEntriesInto(key, snapshot, touchedIds) {
  if (!touchedIds || touchedIds.size === 0) return;
  const fresh = (await chrome.storage.local.get(key))[key] || {};
  for (const id of touchedIds) {
    if (snapshot[id] !== undefined) fresh[id] = snapshot[id];
  }
  await chrome.storage.local.set({ [key]: fresh });
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
// was spent (whether or not it produced a recorded outcome). Mutates
// `hyperrankedItems[itemId]` in place (normalizing legacy bare-number entries
// to objects) when a relist is detected on a still-live lookup, and sets
// budget.itemsChanged so the caller knows to persist HYPERRANK_ITEMS_KEY too.
async function processPendingEntry(itemId, entry, outcomes, budget, hyperrankedItems, observed = {}) {
  if (budgetRemaining(budget) <= 0) return false;

  const hyperrankTs = typeof entry === 'number' ? entry : entry?.ts;

  // Normalize legacy bare-number entries to objects so there's somewhere to
  // keep lastCheckedAt/relistCount/lastKnownEndsAt. Stamp lastCheckedAt BEFORE
  // the lookup so an item that yields nothing (not found yet, still live,
  // fetch error) rotates to the back of the queue instead of hogging the
  // head of it every run — see collectHyperrankOutcomes' pending ordering.
  const normalized = (typeof entry === 'object' && entry) ? entry : { ts: hyperrankTs };
  normalized.lastCheckedAt = Date.now();
  // A treated item's relists are detected in TWO places: this collector's own
  // live lookups (checkRelist below → normalized.relistCount) and the
  // Räddningslistan re-sighting in admin-dashboard.js (→ rescueObserved[id]
  // .relistCount, for BOTH parities). Take the max so a relist the dashboard
  // saw but this collector didn't (starved queue, no earlier live lookup)
  // still lands on the outcome — otherwise treated relist sales get filed
  // under "sold 1st attempt" (observed 2026-09-03: 0 treated 2nd/3rd-life
  // sales vs 6 control, on comparable volumes).
  const listRelistCount = Number.isFinite(observed?.[itemId]?.relistCount) ? observed[itemId].relistCount : 0;
  if (listRelistCount > (Number.isFinite(normalized.relistCount) ? normalized.relistCount : 0)) {
    normalized.relistCount = listRelistCount;
  }
  hyperrankedItems[itemId] = normalized;
  budget.itemsChanged = true;
  (budget.touchedItems ||= new Set()).add(String(itemId));

  try {
    budget.fetches++;
    const result = await lookupItem(itemId);

    if (result) {
      if (result.ended) {
        outcomes[itemId] = buildOutcomeRecord(itemId, result.item, normalized, result.sold);
        budget.recorded++;
        budget.changed = true;
      } else {
        // Still live — record its end time (so the next runs skip it until
        // it has actually ended) and check whether this is a NEW life
        // (relisted after a prior unsold ending) rather than the same
        // auction still running.
        checkRelist(normalized, result.item.ends_at);
      }
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
          baselineVisits: normalized.visits ?? null,
          hyperrankTs,
          relistCount: Number.isFinite(normalized.relistCount) ? normalized.relistCount : 0
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
    const stored = await chrome.storage.local.get([HYPERRANK_ITEMS_KEY, HYPERRANK_OUTCOMES_KEY, RESCUE_OBSERVED_KEY]);
    const hyperrankedItems = stored[HYPERRANK_ITEMS_KEY] || {};
    const outcomes = stored[HYPERRANK_OUTCOMES_KEY] || {};
    const observed = stored[RESCUE_OBSERVED_KEY] || {};
    const nowTs = Date.now();

    // Pending = treated items without an outcome that can plausibly have
    // ended. Two things went wrong before (observed 2026-09-02: 206 ended
    // treated items with no outcome vs 9 controls):
    //   1. Every treated item was pending, including ones still live, and
    //      items the API doesn't return at all (withdrawn / archive gap)
    //      stayed pending for 45 days without recording anything.
    //   2. Object.entries walks numeric-string keys in ascending id order,
    //      so the same ~10 oldest null-returning items were fetched every
    //      run, exhausted the treated budget, and nothing behind them was
    //      ever looked up — head-of-line blocking for weeks.
    // Fix: skip items known to still be live (end time from the item's
    // Räddningslistan record, or lastKnownEndsAt from an earlier live
    // lookup), skip unknown-end-time items younger than a week, and walk
    // the rest oldest-checked-first so every item gets its turn.
    const pending = Object.entries(hyperrankedItems)
      .filter(([itemId]) => !outcomes[itemId])
      .map(([itemId, entry]) => {
        const obj = (entry && typeof entry === 'object') ? entry : null;
        const ts = obj ? (obj.ts ?? null) : (typeof entry === 'number' ? entry : null);
        const knownEndsAt = (obj && Number.isFinite(obj.lastKnownEndsAt)) ? obj.lastKnownEndsAt
          : (Number.isFinite(observed[itemId]?.endsAt) ? observed[itemId].endsAt : null);
        const lastCheckedAt = (obj && Number.isFinite(obj.lastCheckedAt)) ? obj.lastCheckedAt : 0;
        return { itemId, entry, ts, knownEndsAt, lastCheckedAt };
      })
      .filter(p => {
        if (p.knownEndsAt !== null) return p.knownEndsAt <= nowTs;
        return !p.ts || (nowTs - p.ts) >= MIN_TREATED_AGE_MS;
      })
      // Oldest-checked first; among equals, items with a known end time
      // (certainly ended) before unknown-end-time ones (probably ended),
      // then earliest-ended first.
      .sort((a, b) => (a.lastCheckedAt - b.lastCheckedAt)
        || ((a.knownEndsAt === null) - (b.knownEndsAt === null))
        || ((a.knownEndsAt ?? a.ts ?? 0) - (b.knownEndsAt ?? b.ts ?? 0)));

    // Fair-share guard: reserve up to half the budget for the control pass when
    // it has ended items waiting. With a long treated backlog, "controls get
    // the leftovers" starved them indefinitely (observed 2026-07-24: 17 ended
    // controls, 0 recorded, while ~80 pending treated ate every run's budget).
    let controlReserve = 0;
    try {
      const cStored = await chrome.storage.local.get([RESCUE_CONTROL_OUTCOMES_KEY]);
      const cObserved = observed;
      const cOutcomes = cStored[RESCUE_CONTROL_OUTCOMES_KEY] || {};
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
      let itemsChanged = false;

      for (const { itemId, entry } of pending) {
        if (budgetRemaining(budget) <= controlReserve) break;
        const spent = await processPendingEntry(itemId, entry, outcomes, budget, hyperrankedItems, observed);
        if (budget.changed) changed = true;
        if (budget.itemsChanged) itemsChanged = true;
        if (spent && budgetRemaining(budget) > 0) {
          await sleep(FETCH_SPACING_MS);
        }
      }

      if (changed) {
        await chrome.storage.local.set({ [HYPERRANK_OUTCOMES_KEY]: outcomes });
      }
      // lastCheckedAt / relist bumps land directly on hyperrankedItems entries
      // — persist separately since it's a different key. Merge onto a FRESH
      // read rather than writing our minutes-old snapshot back: the edit page
      // (content-script.js) also read-modify-writes this key, and a hyperrank
      // applied while this run was fetching would otherwise be wiped.
      if (itemsChanged) {
        await mergeEntriesInto(HYPERRANK_ITEMS_KEY, hyperrankedItems, budget.touchedItems);
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

  // Lowest priority of all: re-check archive-confirmed-unsold outcomes for a
  // relist, using whatever budget neither the treated nor control pass spent.
  // See recheckArchivedUnsold for why this is needed (an unsold-then-relisted
  // item must re-enter the normal pending flow, not sit forever counted as
  // "never sold").
  let recheckResult = { checked: 0, recorded: 0 };
  try {
    recheckResult = await recheckArchivedUnsold(budget);
  } catch (e) {
    console.warn('[HyperrankOutcomes] Relist re-check run failed:', e.message);
  }

  return {
    checked: treatedResult.checked + controlResult.checked + recheckResult.checked,
    recorded: treatedResult.recorded + controlResult.recorded,
    changed: (treatedResult.recorded + controlResult.recorded) > 0 || recheckResult.recorded > 0,
    treated: treatedResult,
    control: controlResult,
    relistRecheck: recheckResult
  };
}

// ─── Relist re-check for archive-confirmed-unsold outcomes ─────────────
// Problem: once an item is found in the is=ended archive with state 'unsold'
// (sold: false, NOT inferredUnsold — see buildOutcomeRecord/the control ended
// branch above), the normal passes stop following it forever, because it now
// has a recorded outcome and no longer appears in `pending`. But Auctionet
// relists unsold items up to 3x under the SAME item id — if that happens, the
// item may go on to sell on a later life, and "aldrig sålda" on the
// scoreboard would overcount it as never-sold indefinitely.
//
// This pass re-queries the public API for exactly those confirmed-unsold
// outcomes (both arms), lowest priority of the whole run (only spends
// whatever budget the normal pending passes above didn't use). If the item
// is found LIVE again with ends_at clearly past the recorded endedAt (>24h,
// same "genuine new life, not a snipe-protection extension" rule as
// checkRelist elsewhere in this file), it relisted:
//   1. Bump relistCount on the SOURCE entry (hyperrankedItems[id] for
//      treated, rescueObserved[id] for control) so the eventual new outcome
//      carries the right life number.
//   2. Delete the stale outcome record so the item re-enters the normal
//      pending queue and gets tracked through to its next real outcome.
// If not found live, or found still-ended (archive lookup just reconfirms
// the same unsold state), do nothing — retry naturally on a later run, until
// the item falls outside RELIST_RECHECK_WINDOW_MS.
//
// Rotation: candidates are sorted oldest-checked-first (falling back to
// endedAt for pre-checkedAt records) so a long backlog cycles through
// everything eventually rather than re-hammering the same few items query
// after query. Only ever consumes leftover budget — never competes with the
// normal treated/control passes for fetches.
async function recheckArchivedUnsold(budget) {
  if (budgetRemaining(budget) <= 0) return { checked: 0, recorded: 0 };

  const stored = await chrome.storage.local.get([
    HYPERRANK_ITEMS_KEY,
    HYPERRANK_OUTCOMES_KEY,
    RESCUE_OBSERVED_KEY,
    RESCUE_CONTROL_OUTCOMES_KEY
  ]);
  const hyperrankedItems = stored[HYPERRANK_ITEMS_KEY] || {};
  const outcomes = stored[HYPERRANK_OUTCOMES_KEY] || {};
  const observed = stored[RESCUE_OBSERVED_KEY] || {};
  const controlOutcomes = stored[RESCUE_CONTROL_OUTCOMES_KEY] || {};

  const now = Date.now();
  const isEligible = (o) => {
    if (!o || o.sold !== false || o.inferredUnsold || o.lost) return false;
    const n = Number.isFinite(o.relistCount) ? o.relistCount : 0;
    if (n >= 3) return false;
    const recentAnchor = Number.isFinite(o.checkedAt) ? o.checkedAt : o.endedAt;
    if (!Number.isFinite(recentAnchor)) return false; // no usable timestamp — skip rather than guess
    return (now - recentAnchor) <= RELIST_RECHECK_WINDOW_MS;
  };

  const treatedCandidates = Object.entries(outcomes)
    .filter(([, o]) => isEligible(o))
    .map(([itemId, o]) => ({ itemId, o, arm: 'treated' }));
  const controlCandidates = Object.entries(controlOutcomes)
    .filter(([, o]) => isEligible(o))
    .map(([itemId, o]) => ({ itemId, o, arm: 'control' }));

  const candidates = [...treatedCandidates, ...controlCandidates].sort((a, b) => {
    const aTs = Number.isFinite(a.o.checkedAt) ? a.o.checkedAt : (a.o.endedAt ?? 0);
    const bTs = Number.isFinite(b.o.checkedAt) ? b.o.checkedAt : (b.o.endedAt ?? 0);
    return aTs - bTs; // oldest-checked-first
  });

  if (candidates.length === 0) return { checked: 0, recorded: 0 };

  const startFetches = budget.fetches;
  let recorded = 0;
  let outcomesChanged = false;
  let controlOutcomesChanged = false;
  let itemsChanged = false;
  let observedChanged = false;
  const touchedItems = new Set();
  const touchedObserved = new Set();

  for (const { itemId, o, arm } of candidates) {
    if (budgetRemaining(budget) <= 0) break;

    try {
      budget.fetches++;
      const result = await lookupItem(itemId);
      let deletedOutcome = false;

      // Only a still-LIVE sighting with a clearly later ends_at counts as a
      // relist — "found ended again" (result.ended) just reconfirms the same
      // unsold outcome and needs no action; "not found" is equally a no-op.
      if (result && !result.ended && typeof result.item.ends_at === 'number') {
        const liveEndsAtMs = result.item.ends_at * 1000;
        const priorEndedAt = Number.isFinite(o.endedAt) ? o.endedAt : 0;
        const isRelist = liveEndsAtMs > priorEndedAt + 24 * 3600 * 1000;

        if (isRelist) {
          if (arm === 'treated') {
            const sourceEntry = (hyperrankedItems[itemId] && typeof hyperrankedItems[itemId] === 'object')
              ? hyperrankedItems[itemId]
              : { ts: (typeof hyperrankedItems[itemId] === 'number') ? hyperrankedItems[itemId] : null };
            sourceEntry.relistCount = (Number.isFinite(sourceEntry.relistCount) ? sourceEntry.relistCount : 0) + 1;
            sourceEntry.lastKnownEndsAt = liveEndsAtMs;
            hyperrankedItems[itemId] = sourceEntry;
            itemsChanged = true;
            touchedItems.add(String(itemId));

            delete outcomes[itemId];
            outcomesChanged = true;
            deletedOutcome = true;
          } else {
            const sourceEntry = observed[itemId] || {};
            sourceEntry.relistCount = (Number.isFinite(sourceEntry.relistCount) ? sourceEntry.relistCount : 0) + 1;
            sourceEntry.endsAt = liveEndsAtMs;
            observed[itemId] = sourceEntry;
            observedChanged = true;
            touchedObserved.add(String(itemId));

            delete controlOutcomes[itemId];
            controlOutcomesChanged = true;
            deletedOutcome = true;
          }
          recorded++;
        }
        // else: still live but same auction (unlikely for a confirmed-ended
        // record, but possible if the archive lookup was stale) — no-op,
        // retry next run.
      }
      // else: not found, or found still-ended — no-op, retry next run until
      // the recheck window closes.

      // Bump checkedAt on every surviving record so the oldest-checked-first
      // sort actually rotates through the backlog across runs, instead of
      // re-checking the same oldest items every time and starving the rest.
      if (!deletedOutcome) {
        o.checkedAt = now;
        if (arm === 'treated') outcomesChanged = true;
        else controlOutcomesChanged = true;
      }
    } catch (e) {
      console.warn('[HyperrankOutcomes] Relist re-check lookup failed for item', itemId, e.message);
    }

    if (budgetRemaining(budget) > 0) {
      await sleep(FETCH_SPACING_MS);
    }
  }

  if (outcomesChanged) {
    await chrome.storage.local.set({ [HYPERRANK_OUTCOMES_KEY]: outcomes });
  }
  if (controlOutcomesChanged) {
    await chrome.storage.local.set({ [RESCUE_CONTROL_OUTCOMES_KEY]: controlOutcomes });
  }
  if (itemsChanged) {
    await mergeEntriesInto(HYPERRANK_ITEMS_KEY, hyperrankedItems, touchedItems);
  }
  if (observedChanged) {
    await mergeEntriesInto(RESCUE_OBSERVED_KEY, observed, touchedObserved);
  }

  return { checked: budget.fetches - startFetches, recorded };
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
  // Oldest-checked first (never-checked = 0 sorts to the front), so items
  // the API returns nothing for don't hog the head of the queue — same
  // rotation as the treated pass. lastCheckedAt is local bookkeeping only
  // (buildRescueObservedRows doesn't sync it).
  }).sort(([, a], [, b]) => (Number.isFinite(a.lastCheckedAt) ? a.lastCheckedAt : 0)
    - (Number.isFinite(b.lastCheckedAt) ? b.lastCheckedAt : 0));

  if (pending.length === 0) return { checked: 0, recorded: 0 };

  const startFetches = budget.fetches;
  let recorded = 0;
  let changed = false;
  let observedChanged = false;
  const touchedObserved = new Set();

  for (const [itemId, entry] of pending) {
    if (budgetRemaining(budget) <= 0) break;

    // Reuse the hyperrankTs-shaped age thresholds against endsAt instead —
    // a control item was never hyperranked, so "time since it should have
    // ended" is the equivalent clock for the same inferred-unsold/lost rules.
    const endsAt = entry.endsAt;
    // relistCount for a control item lives on its `rescueObserved` record —
    // admin-dashboard.js's own Räddningslistan-rescrape path already bumps it
    // there; checkRelist below adds a second detection path (this collector's
    // own live-lookup) onto the SAME field, so either one catches a relist.
    const relistCount = Number.isFinite(entry.relistCount) ? entry.relistCount : 0;

    entry.lastCheckedAt = now;
    observed[itemId] = entry;
    observedChanged = true;
    touchedObserved.add(String(itemId));

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
            estimate: typeof result.item.estimate === 'number' ? result.item.estimate : (entry.estimate ?? null),
            relistCount,
            // See buildOutcomeRecord's checkedAt comment — same local-only
            // rotation bookkeeping, mirrored here for the control side.
            checkedAt: now
          };
          changed = true;
          recorded++;
        } else if (checkRelist(entry, result.item.ends_at, 'endsAt')) {
          // Still live, but ends_at jumped >24h past what we had on file —
          // this is a NEW life, not the same auction still running. Bump
          // relistCount on the observed record so it's ready whenever this
          // item's outcome eventually finalizes.
          observed[itemId] = entry;
          observedChanged = true;
        }
        // else: still live, same auction — skip, retry next run.
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
            estimate: entry.estimate ?? null,
            relistCount
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
  // Merge, don't overwrite — admin-dashboard.js's upsertRescueObserved
  // read-modify-writes this key every 5 min and would lose newly listed items
  // if we wrote our snapshot back (see mergeEntriesInto).
  if (observedChanged) {
    await mergeEntriesInto(RESCUE_OBSERVED_KEY, observed, touchedObserved);
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
    recordedAt: o.checkedAt ?? o.hyperrankTs ?? Date.now(),
    relistCount: Number.isFinite(o.relistCount) ? o.relistCount : 0
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
    recordedAt: o.checkedAt ?? Date.now(),
    relistCount: Number.isFinite(o.relistCount) ? o.relistCount : 0
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
