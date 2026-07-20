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
             final_bid_count, bids_after_hyperrank, highest_bid, estimate, recorded_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
             recorded_at = excluded.recorded_at
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
          Number.isFinite(o.recordedAt) ? o.recordedAt : Date.now()
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
          `INSERT INTO rescue_observed (item_id, first_seen_ts, ends_at, estimate, parity)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(item_id) DO UPDATE SET
             first_seen_ts = excluded.first_seen_ts,
             ends_at = excluded.ends_at,
             estimate = excluded.estimate,
             parity = excluded.parity`
        )
        .bind(
          String(r.itemId),
          Number.isFinite(r.firstSeenTs) ? r.firstSeenTs : null,
          Number.isFinite(r.endsAt) ? r.endsAt : null,
          Number.isFinite(r.estimate) ? r.estimate : null,
          r.parity ?? null
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

async function handleAggregate(db) {
  const [{ count: totalTreated }] = (
    await db.prepare('SELECT COUNT(*) as count FROM treatments').all()
  ).results;

  const outcomeRows = (
    await db
      .prepare(
        `SELECT item_id, arm, sold, inferred_unsold, bids_after_hyperrank, highest_bid, estimate
         FROM outcomes WHERE lost = 0 OR lost IS NULL`
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
  const rescueObservedRows = (await db.prepare('SELECT item_id FROM rescue_observed').all()).results;
  const rescueObservedIds = new Set(rescueObservedRows.map((r) => r.item_id));

  const abTreated = treatedOutcomes.filter((o) => rescueObservedIds.has(o.item_id));
  const abControl = controlOutcomes;

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
