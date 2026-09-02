// HYPERRANK experiment sync API — Cloudflare Worker + D1
//
// Merges the HYPERRANK treatment log + auction outcomes + Räddningslistan A/B
// controls across pilot machines (Micke + Anders), which previously lived
// only in per-machine chrome.storage.local (see modules/hyperrank/
// hyperrank-outcomes-bg.js and admin-dashboard.js). This Worker is the shared
// backend both machines push their full local state to and read the merged
// scoreboard from.
//
// Auth: every endpoint except /health requires
//   Authorization: Bearer <SYNC_TOKEN>   (wrangler secret)
//
// Schema source of truth: schema.sql in this directory.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200) {
  return new Response(data === null ? '' : JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function err(message, status = 400) {
  return json({ error: message }, status);
}

function nowIso() {
  return new Date().toISOString();
}

// ─── Sync (upsert) ──────────────────────────────────────────────────────────

async function upsertTreatments(db, treatments) {
  if (!Array.isArray(treatments) || treatments.length === 0) return 0;
  const stmts = treatments
    .filter((t) => t && t.itemId != null)
    .map((t) =>
      db
        .prepare(
          `INSERT INTO treatments (item_id, ts, mode, visits, followers, machine)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(item_id) DO UPDATE SET
             ts = excluded.ts,
             mode = excluded.mode,
             visits = excluded.visits,
             followers = excluded.followers,
             machine = excluded.machine`
        )
        .bind(
          String(t.itemId),
          Number.isFinite(t.ts) ? t.ts : null,
          t.mode ?? null,
          Number.isFinite(t.visits) ? t.visits : null,
          Number.isFinite(t.followers) ? t.followers : null,
          t.machine ?? null
        )
    );
  if (stmts.length === 0) return 0;
  await db.batch(stmts);
  return stmts.length;
}

// Outcomes: prefer non-lost over lost on conflict — a `lost` row (we gave up
// looking) must never clobber a real recorded outcome from another machine
// that actually found the item, and vice versa a later `lost` shouldn't
// downgrade an already-resolved outcome either. We implement "prefer
// non-lost" by only overwriting an existing `lost` row, or writing into an
// empty slot; a non-lost incoming row always wins over whatever is there.
//
// relist_count uses MAX() rather than a straight overwrite: each machine's
// collector only sees relists via its OWN still-live lookups (see
// hyperrank-outcomes-bg.js checkRelist()), so one machine may have observed
// more lives than another for the same item. The highest count any machine
// has seen is the true count.
async function upsertOutcomes(db, outcomes) {
  if (!Array.isArray(outcomes) || outcomes.length === 0) return 0;
  const stmts = outcomes
    .filter((o) => o && o.itemId != null && (o.arm === 'treated' || o.arm === 'control'))
    .map((o) => {
      const lost = o.lost ? 1 : 0;
      return db
        .prepare(
          `INSERT INTO outcomes (
             item_id, arm, ended_at, sold, inferred_unsold, lost,
             final_bid_count, bids_after_hyperrank, highest_bid, estimate, recorded_at, relist_count
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(item_id) DO UPDATE SET
             arm = excluded.arm,
             ended_at = excluded.ended_at,
             sold = excluded.sold,
             inferred_unsold = excluded.inferred_unsold,
             lost = excluded.lost,
             final_bid_count = excluded.final_bid_count,
             bids_after_hyperrank = excluded.bids_after_hyperrank,
             highest_bid = excluded.highest_bid,
             estimate = excluded.estimate,
             recorded_at = excluded.recorded_at,
             relist_count = MAX(IFNULL(outcomes.relist_count, 0), excluded.relist_count)
           WHERE outcomes.lost = 1 OR excluded.lost = 0`
        )
        .bind(
          String(o.itemId),
          o.arm,
          Number.isFinite(o.endedAt) ? o.endedAt : null,
          o.sold ? 1 : 0,
          o.inferredUnsold ? 1 : 0,
          lost,
          Number.isFinite(o.finalBidCount) ? o.finalBidCount : null,
          Number.isFinite(o.bidsAfterHyperrank) ? o.bidsAfterHyperrank : null,
          Number.isFinite(o.highestBid) ? o.highestBid : null,
          Number.isFinite(o.estimate) ? o.estimate : null,
          Number.isFinite(o.recordedAt) ? o.recordedAt : Date.now(),
          Number.isFinite(o.relistCount) ? o.relistCount : 0
        );
    });
  if (stmts.length === 0) return 0;
  await db.batch(stmts);
  return stmts.length;
}

async function upsertRescueObserved(db, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const stmts = rows
    .filter((r) => r && r.itemId != null)
    .map((r) =>
      db
        .prepare(
          `INSERT INTO rescue_observed (item_id, first_seen_ts, ends_at, estimate, parity, protocol_violation, relist_count)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(item_id) DO UPDATE SET
             first_seen_ts = excluded.first_seen_ts,
             ends_at = excluded.ends_at,
             estimate = excluded.estimate,
             parity = excluded.parity,
             -- sticky/max: once flagged as a violation never un-flag, and keep the
             -- highest life-count any machine has observed (another machine's
             -- sync won't know about this one's override or observed relists)
             protocol_violation = MAX(IFNULL(rescue_observed.protocol_violation, 0), excluded.protocol_violation),
             relist_count = MAX(IFNULL(rescue_observed.relist_count, 0), excluded.relist_count)`
        )
        .bind(
          String(r.itemId),
          Number.isFinite(r.firstSeenTs) ? r.firstSeenTs : null,
          Number.isFinite(r.endsAt) ? r.endsAt : null,
          Number.isFinite(r.estimate) ? r.estimate : null,
          r.parity ?? null,
          r.protocolViolation ? 1 : 0,
          Number.isFinite(r.relistCount) ? r.relistCount : 0
        )
    );
  if (stmts.length === 0) return 0;
  await db.batch(stmts);
  return stmts.length;
}

async function handleSync(db, body) {
  const treatments = await upsertTreatments(db, body.treatments);
  const outcomes = await upsertOutcomes(db, body.outcomes);
  const rescueObserved = await upsertRescueObserved(db, body.rescueObserved);
  return json({ ok: true, treatments, outcomes, rescueObserved, syncedAt: nowIso() });
}

// ─── Aggregate (merged scoreboard) ─────────────────────────────────────────

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Buckets a set of ended outcomes (already filtered to one arm) by
// relist_count into { sold, unsold } per life bucket: 0 = first listing,
// 1 = one relist, 2 = two relists, "3+" = three or more (Auctionet caps
// relists at 3, but bucket defensively in case that ever changes). Rows
// missing relist_count (pre-migration / pre-tracking data) fall into
// bucket 0 — old records are treated as first-life everywhere.
function lifeSplit(outcomeRows) {
  const buckets = { 0: { sold: 0, unsold: 0 }, 1: { sold: 0, unsold: 0 }, 2: { sold: 0, unsold: 0 }, '3+': { sold: 0, unsold: 0 } };
  for (const o of outcomeRows) {
    const n = Number.isFinite(o.relist_count) ? o.relist_count : 0;
    const key = n >= 3 ? '3+' : n;
    buckets[key][o.sold ? 'sold' : 'unsold']++;
  }
  return buckets;
}

async function handleAggregate(db) {
  const [{ count: totalTreated }] = (
    await db.prepare('SELECT COUNT(*) as count FROM treatments').all()
  ).results;

  const outcomeRows = (
    await db
      .prepare(
        // relist_count = the higher of the outcome's own count and the
        // rescue_observed count: the extension's Räddningslistan re-sighting
        // bumps rescue_observed for both arms, but treated outcomes synced
        // before 2026-09-03 only carried the collector's own (starved) count
        // — so this join also corrects already-stored treated records.
        `SELECT o.item_id, o.arm, o.sold, o.inferred_unsold, o.bids_after_hyperrank, o.highest_bid, o.estimate,
                MAX(IFNULL(o.relist_count, 0), IFNULL(r.relist_count, 0)) AS relist_count
         FROM outcomes o LEFT JOIN rescue_observed r ON r.item_id = o.item_id
         WHERE o.lost = 0 OR o.lost IS NULL`
      )
      .all()
  ).results;

  const treatedOutcomes = outcomeRows.filter((o) => o.arm === 'treated');
  const controlOutcomes = outcomeRows.filter((o) => o.arm === 'control');

  const endedWithOutcome = treatedOutcomes.length;
  const gotBidsAfter = treatedOutcomes.filter(
    (o) => typeof o.bids_after_hyperrank === 'number' && o.bids_after_hyperrank > 0
  ).length;
  const sold = treatedOutcomes.filter((o) => !!o.sold).length;

  const ratios = treatedOutcomes
    .filter((o) => typeof o.highest_bid === 'number' && o.highest_bid > 0 && typeof o.estimate === 'number' && o.estimate > 0)
    .map((o) => o.highest_bid / o.estimate);
  const medianRatio = median(ratios);

  // Rescue A/B: treated-side = outcomes with arm='treated' AND item_id in
  // rescue_observed; control-side = arm='control'. Same counting rules as the
  // extension (lost excluded already above; inferred_unsold counts as
  // ended+unsold, i.e. included in the denominator, excluded from `sold`).
  // Protocol violations (control items hyperranked anyway) are excluded from
  // BOTH arms: they were assigned to control but no longer represent "no
  // intervention", and they weren't randomly assigned to treat either.
  const rescueObservedRows = (
    await db.prepare('SELECT item_id, protocol_violation FROM rescue_observed').all()
  ).results;
  const rescueObservedIds = new Set(
    rescueObservedRows.filter((r) => !r.protocol_violation).map((r) => r.item_id)
  );
  const violatedIds = new Set(
    rescueObservedRows.filter((r) => !!r.protocol_violation).map((r) => r.item_id)
  );

  const abTreated = treatedOutcomes.filter((o) => rescueObservedIds.has(o.item_id));
  const abControl = controlOutcomes.filter((o) => !violatedIds.has(o.item_id));

  let abComparison = null;
  if (abTreated.length > 0 && abControl.length > 0) {
    const treatedSold = abTreated.filter((o) => !!o.sold).length;
    const controlSold = abControl.filter((o) => !!o.sold).length;
    abComparison = {
      treatedSold,
      treatedEnded: abTreated.length,
      treatedPct: Math.round((treatedSold / abTreated.length) * 100),
      controlSold,
      controlEnded: abControl.length,
      controlPct: Math.round((controlSold / abControl.length) * 100),
      // Per-arm sold/unsold split by life number (0 = first listing) — lets
      // the scoreboard show whether HYPERRANK's lift holds up across relists
      // or is concentrated in first-life sales.
      treatedLifeSplit: lifeSplit(abTreated),
      controlLifeSplit: lifeSplit(abControl),
    };
  }

  return json({
    ok: true,
    totalTreated,
    endedWithOutcome,
    gotBidsAfter,
    sold,
    medianRatio,
    abComparison,
    aggregatedAt: nowIso(),
  });
}

// ─── Entry point ────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const db = env.DB;

    if (!db) return err('D1 binding "DB" missing', 500);

    if (path === '/' || path === '/health') {
      return json({ ok: true, service: 'sas-hyperrank-api', time: nowIso() });
    }

    // Everything else requires the shared sync token
    if (!env.SYNC_TOKEN) return err('SYNC_TOKEN not configured', 500);
    if (request.headers.get('authorization') !== `Bearer ${env.SYNC_TOKEN}`) {
      return err('unauthorized', 401);
    }

    try {
      if (path === '/sync' && request.method === 'POST') {
        let body;
        try {
          body = await request.json();
        } catch {
          return err('invalid JSON body');
        }
        return await handleSync(db, body || {});
      }

      if (path === '/aggregate' && request.method === 'GET') {
        return await handleAggregate(db);
      }

      return err('not found', 404);
    } catch (e) {
      return err(`server error: ${e.message}`, 500);
    }
  },
};
