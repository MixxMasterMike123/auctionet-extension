// Spellcheck shared backend — Cloudflare Worker + D1
//
// Replaces the previous Supabase-backed shared spellcheck store.
// Three resources, all keyed by simple lookups (no relational joins):
//   - /cache     : per-item spellcheck results, keyed by item_id + text_hash
//   - /ignored   : per-item "ignore all errors" flags
//   - /whitelist : self-healing word whitelist (Phase 3)
//
// Auth model: reads are public; writes are open but rate-limited per IP and
// strictly shape-validated, so only well-formed rows can ever be written.
// This is low-stakes spellcheck data — worst case is junk whitelist words,
// recoverable via the whitelist-review view.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(data === null ? '' : JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extraHeaders },
  });
}

function err(message, status = 400) {
  return json({ error: message }, status);
}

// ─── Per-IP rate limiting (best-effort, in-memory per isolate) ──────────────
// Writes only. Cheap token-bucket keyed by client IP. Not perfectly global
// (one bucket per Worker isolate), but enough to stop accidental spam loops.
const RATE_LIMIT = { windowMs: 60_000, maxWrites: 120 }; // 120 writes/min/IP/isolate
const buckets = new Map();

function rateLimited(ip) {
  const now = Date.now();
  let b = buckets.get(ip);
  if (!b || now - b.start >= RATE_LIMIT.windowMs) {
    b = { start: now, count: 0 };
    buckets.set(ip, b);
  }
  b.count++;
  // Opportunistic cleanup so the Map can't grow unbounded.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (now - v.start >= RATE_LIMIT.windowMs) buckets.delete(k);
    }
  }
  return b.count > RATE_LIMIT.maxWrites;
}

// ─── Validation helpers ─────────────────────────────────────────────────────
function isPosInt(v) {
  return Number.isInteger(v) && v > 0;
}

function validResults(r) {
  // Expect an array of {word, correction, ...}; cap size to keep rows sane.
  if (!Array.isArray(r) || r.length > 500) return false;
  return r.every(
    (e) =>
      e &&
      typeof e === 'object' &&
      typeof e.word === 'string' &&
      e.word.length > 0 &&
      e.word.length <= 100
  );
}

function nowIso() {
  return new Date().toISOString();
}

// ─── Route handlers ─────────────────────────────────────────────────────────

async function getCache(db, url) {
  const itemId = Number(url.searchParams.get('item_id'));
  const hash = url.searchParams.get('hash');
  if (!isPosInt(itemId) || !hash) return err('item_id and hash required');
  const row = await db
    .prepare('SELECT text_hash, results FROM spellcheck_cache WHERE item_id = ?')
    .bind(itemId)
    .first();
  if (!row || row.text_hash !== hash) return json(null, 404);
  // Stored as JSON string; return parsed for convenience.
  let results = [];
  try { results = JSON.parse(row.results); } catch { /* keep [] */ }
  return json({ item_id: itemId, text_hash: row.text_hash, results });
}

async function postCache(db, body) {
  const itemId = Number(body.item_id);
  const textHash = body.text_hash;
  const results = body.results ?? [];
  if (!isPosInt(itemId)) return err('item_id must be a positive integer');
  if (typeof textHash !== 'string' || !textHash) return err('text_hash required');
  if (!validResults(results)) return err('results must be an array of {word,...}');
  await db
    .prepare(
      `INSERT INTO spellcheck_cache (item_id, text_hash, results, checked_at, checked_by)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(item_id) DO UPDATE SET
         text_hash = excluded.text_hash,
         results   = excluded.results,
         checked_at = excluded.checked_at,
         checked_by = excluded.checked_by`
    )
    .bind(itemId, textHash, JSON.stringify(results), nowIso(), body.checked_by ?? null)
    .run();
  return json({ ok: true });
}

async function getIgnored(db) {
  const { results } = await db
    .prepare('SELECT item_id FROM spellcheck_ignored')
    .all();
  return json((results || []).map((r) => r.item_id));
}

async function postIgnored(db, body) {
  const itemId = Number(body.item_id);
  if (!isPosInt(itemId)) return err('item_id must be a positive integer');
  await db
    .prepare(
      `INSERT INTO spellcheck_ignored (item_id, ignored_at) VALUES (?, ?)
       ON CONFLICT(item_id) DO NOTHING`
    )
    .bind(itemId, nowIso())
    .run();
  return json({ ok: true });
}

async function deleteIgnored(db, url) {
  const itemId = Number(url.searchParams.get('item_id'));
  if (!isPosInt(itemId)) return err('item_id required');
  await db.prepare('DELETE FROM spellcheck_ignored WHERE item_id = ?').bind(itemId).run();
  return json({ ok: true });
}

async function getWhitelist(db, url) {
  const status = url.searchParams.get('status') || 'active';
  if (!['active', 'pending', 'rejected', 'all'].includes(status)) {
    return err('invalid status');
  }
  const stmt =
    status === 'all'
      ? db.prepare('SELECT word, ignore_count, status FROM spellcheck_whitelist')
      : db
          .prepare('SELECT word, ignore_count, status FROM spellcheck_whitelist WHERE status = ?')
          .bind(status);
  const { results } = await stmt.all();
  return json(results || []);
}

// Promotion thresholds: a word flips pending → active once enough independent
// dismissals accumulate. Confidence comes from the flag's suggestion shape:
//   - 'different-word'  (e.g. bemålning→oljemålning): near-certain false
//     positive ⇒ promote on the FIRST dismissal.
//   - 'near-edit'       (e.g. byrä→byrå): could be a real typo someone is
//     skipping ⇒ require several independent dismissals before going global.
const PROMOTE_AT_NEAR_EDIT = 3;
const PROMOTE_AT_DIFFERENT_WORD = 1;

async function postWhitelist(db, body) {
  const raw = typeof body.word === 'string' ? body.word.trim().toLowerCase() : '';
  if (!raw || raw.length > 100) return err('word required (1-100 chars)');
  // Only allow letter-ish tokens (incl. Swedish + common diacritics + hyphen).
  if (!/^[\p{L}][\p{L}\-'.]*$/u.test(raw)) return err('word has invalid characters');
  const promoteAt =
    body.confidence === 'different-word' ? PROMOTE_AT_DIFFERENT_WORD : PROMOTE_AT_NEAR_EDIT;
  await db
    .prepare(
      `INSERT INTO spellcheck_whitelist (word, ignore_count, status, added_by, added_at)
       VALUES (?, 1, 'pending', ?, ?)
       ON CONFLICT(word) DO UPDATE SET ignore_count = ignore_count + 1`
    )
    .bind(raw, body.added_by ?? null, nowIso())
    .run();
  // Auto-promote if this confidence's threshold is reached and not already decided.
  await db
    .prepare(
      `UPDATE spellcheck_whitelist
       SET status = 'active', promoted_at = ?
       WHERE word = ? AND status = 'pending' AND ignore_count >= ?`
    )
    .bind(nowIso(), raw, promoteAt)
    .run();
  const row = await db
    .prepare('SELECT word, ignore_count, status FROM spellcheck_whitelist WHERE word = ?')
    .bind(raw)
    .first();
  return json(row);
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

    // Rate-limit writes only.
    const isWrite = request.method === 'POST' || request.method === 'DELETE';
    if (isWrite) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      if (rateLimited(ip)) return err('rate limited', 429);
    }

    let body = {};
    if (request.method === 'POST') {
      try {
        body = await request.json();
      } catch {
        return err('invalid JSON body');
      }
    }

    try {
      // Health / root
      if (path === '/' || path === '/health') {
        return json({ ok: true, service: 'spellcheck', time: nowIso() });
      }

      if (path === '/cache') {
        if (request.method === 'GET') return await getCache(db, url);
        if (request.method === 'POST') return await postCache(db, body);
      } else if (path === '/ignored') {
        if (request.method === 'GET') return await getIgnored(db);
        if (request.method === 'POST') return await postIgnored(db, body);
        if (request.method === 'DELETE') return await deleteIgnored(db, url);
      } else if (path === '/whitelist') {
        if (request.method === 'GET') return await getWhitelist(db, url);
        if (request.method === 'POST') return await postWhitelist(db, body);
      } else {
        return err('not found', 404);
      }
      return err('method not allowed', 405);
    } catch (e) {
      return err(`server error: ${e.message}`, 500);
    }
  },
};
