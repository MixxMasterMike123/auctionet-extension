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

// Runs one collection pass: for every hyperranked item without a recorded
// outcome (and not already marked lost), check if it has ended and record
// the result. Fail-soft throughout — a single bad fetch never aborts the run.
export async function collectHyperrankOutcomes() {
  try {
    const stored = await chrome.storage.local.get([HYPERRANK_ITEMS_KEY, HYPERRANK_OUTCOMES_KEY]);
    const hyperrankedItems = stored[HYPERRANK_ITEMS_KEY] || {};
    const outcomes = stored[HYPERRANK_OUTCOMES_KEY] || {};

    const pending = Object.entries(hyperrankedItems).filter(([itemId]) => !outcomes[itemId]);
    if (pending.length === 0) return { checked: 0, recorded: 0 };

    let fetches = 0;
    let recorded = 0;
    let changed = false;

    for (const [itemId, entry] of pending) {
      if (fetches >= MAX_FETCHES_PER_RUN) break;

      const hyperrankTs = typeof entry === 'number' ? entry : entry?.ts;

      try {
        fetches++;
        const result = await lookupItem(itemId);

        if (result) {
          if (result.ended) {
            outcomes[itemId] = buildOutcomeRecord(itemId, result.item, entry, result.sold);
            changed = true;
            recorded++;
          }
          // else: still live — skip, retry next run.
        } else {
          // Not found anywhere. Sold items surface in the is=ended archive;
          // unsold ones are dropped from the public API entirely. After the
          // 45-day window (any auction has long ended, and a sale would have
          // been indexed) record inferred-unsold so the sold-rate isn't biased
          // toward found (= sold) outcomes. 90 days = give up entirely.
          if (hyperrankTs && (Date.now() - hyperrankTs) > LOST_AFTER_MS) {
            outcomes[itemId] = { itemId: String(itemId), lost: true, checkedAt: Date.now() };
            changed = true;
            recorded++;
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
            changed = true;
            recorded++;
          }
        }
      } catch (e) {
        console.warn('[HyperrankOutcomes] Lookup failed for item', itemId, e.message);
      }

      if (fetches < pending.length && fetches < MAX_FETCHES_PER_RUN) {
        await sleep(FETCH_SPACING_MS);
      }
    }

    if (changed) {
      await chrome.storage.local.set({ [HYPERRANK_OUTCOMES_KEY]: outcomes });
    }

    return { checked: fetches, recorded };
  } catch (e) {
    console.warn('[HyperrankOutcomes] Collection run failed:', e.message);
    return { checked: 0, recorded: 0 };
  }
}
