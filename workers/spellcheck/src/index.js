// Spellcheck shared backend — Cloudflare Worker + D1
//
// Replaces the previous Supabase-backed shared spellcheck store.
// Three resources, all keyed by simple lookups (no relational joins):
//   - /cache     : per-item spellcheck results, keyed by item_id + text_hash
//   - /ignored   : per-item "ignore all errors" flags
//   - /whitelist : self-healing word whitelist (Phase 3)
//
// Auth model: shared bearer token, opt-in via the SPELLCHECK_API_TOKEN secret.
//   - Secret SET   → every request except OPTIONS and GET / or /health must
//                    carry `Authorization: Bearer <token>`, else 401. The
//                    extension sends it from chrome.storage.local
//                    `spellcheckWorkerToken` (popup field).
//   - Secret UNSET → legacy open mode (public reads, open writes) so the Worker
//                    can be deployed before every install has the token. /health
//                    then returns `X-Spellcheck-Auth: open` to make this visible.
// Either way, writes are rate-limited per IP and strictly shape/size-validated,
// and GET /whitelist only exposes `added_by` (employee names) to authenticated
// callers. Rollout: distribute the token via the popup FIRST, then set the
// secret (see README "Authentication & rollout").

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Expose-Headers': 'X-Spellcheck-Auth',
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
const MAX_BODY_BYTES = 262144; // 256 KB — reject larger POST bodies with 413
const MAX_LIST_ROWS = 5000;    // hard cap on GET /ignored and GET /whitelist

function isPosInt(v) {
  return Number.isInteger(v) && v > 0;
}

function isBoundedStr(v, max) {
  return typeof v === 'string' && v.length > 0 && v.length <= max;
}

// Validates and normalizes a results array. Each entry must be
// {word: 1..100 chars, correction: 1..100 chars}. Extra keys are STRIPPED
// (not rejected) so a newer client adding fields can't break cache writes,
// but nothing beyond word/correction is ever persisted.
// Returns the sanitized array, or null if invalid.
function sanitizeResults(r) {
  if (!Array.isArray(r) || r.length > 500) return null;
  const out = [];
  for (const e of r) {
    if (!e || typeof e !== 'object') return null;
    if (!isBoundedStr(e.word, 100) || !isBoundedStr(e.correction, 100)) return null;
    out.push({ word: e.word, correction: e.correction });
  }
  return out;
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
  const results = sanitizeResults(body.results ?? []);
  if (!isPosInt(itemId)) return err('item_id must be a positive integer');
  if (!isBoundedStr(textHash, 64)) return err('text_hash required (1-64 chars)');
  if (!results) return err('results must be an array of {word, correction} (1-100 chars each)');
  const checkedBy = typeof body.checked_by === 'string' && body.checked_by.trim()
    ? body.checked_by.trim().slice(0, 80)
    : null;
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
    .bind(itemId, textHash, JSON.stringify(results), nowIso(), checkedBy)
    .run();
  return json({ ok: true });
}

async function getIgnored(db) {
  const { results } = await db
    .prepare(`SELECT item_id FROM spellcheck_ignored LIMIT ${MAX_LIST_ROWS}`)
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

// `authed` is true only when the token is configured AND the caller presented
// it; `added_by` (employee names) is omitted otherwise (open mode).
async function getWhitelist(db, url, authed) {
  const status = url.searchParams.get('status') || 'active';
  if (!['active', 'pending', 'rejected', 'all'].includes(status)) {
    return err('invalid status');
  }
  const cols = authed
    ? 'word, ignore_count, status, added_by, added_at, promoted_at'
    : 'word, ignore_count, status, added_at, promoted_at';
  // LIMIT is a hard cap (MAX_LIST_ROWS) so the response can't grow unbounded.
  const stmt =
    status === 'all'
      ? db.prepare(`SELECT ${cols} FROM spellcheck_whitelist ORDER BY added_at DESC LIMIT ${MAX_LIST_ROWS}`)
      : db
          .prepare(`SELECT ${cols} FROM spellcheck_whitelist WHERE status = ? ORDER BY added_at DESC LIMIT ${MAX_LIST_ROWS}`)
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
  // added_by is free-text (employee name from the page) — bound as a parameter
  // (no injection) but capped to keep rows sane.
  const addedBy = typeof body.added_by === 'string' && body.added_by.trim()
    ? body.added_by.trim().slice(0, 80)
    : null;
  // seed:true pre-loads a known-good word straight to 'active' (bulk dictionary
  // seeding). Doesn't clobber a word a human already decided on (active/rejected).
  const seed = body.seed === true;
  await db
    .prepare(
      `INSERT INTO spellcheck_whitelist (word, ignore_count, status, added_by, added_at, promoted_at)
       VALUES (?, 1, ?, ?, ?, ?)
       ON CONFLICT(word) DO UPDATE SET ignore_count = ignore_count + 1`
    )
    .bind(raw, seed ? 'active' : 'pending', addedBy, nowIso(), seed ? nowIso() : null)
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

// Manually set a word's status (review view): 'active' (promote), 'rejected'
// (this word IS a real typo — stop whitelisting it), or 'pending' (un-decide).
async function setWhitelistStatus(db, body) {
  const raw = typeof body.word === 'string' ? body.word.trim().toLowerCase() : '';
  const status = body.status;
  if (!raw) return err('word required');
  if (!['active', 'rejected', 'pending'].includes(status)) return err('invalid status');
  const promotedAt = status === 'active' ? nowIso() : null;
  const res = await db
    .prepare('UPDATE spellcheck_whitelist SET status = ?, promoted_at = ? WHERE word = ?')
    .bind(status, promotedAt, raw)
    .run();
  if (!res.meta || res.meta.changes === 0) return err('word not found', 404);
  return json({ ok: true, word: raw, status });
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

    // Health / root — always public. Signals open mode when no token is set.
    const token = env.SPELLCHECK_API_TOKEN || '';
    if ((path === '/' || path === '/health') && request.method === 'GET') {
      return json(
        { ok: true, service: 'spellcheck', time: nowIso() },
        200,
        token ? {} : { 'X-Spellcheck-Auth': 'open' }
      );
    }

    // Auth: enforced only when the secret is configured (safe rollout).
    const authed = !!token && request.headers.get('authorization') === `Bearer ${token}`;
    if (token && !authed) return err('unauthorized', 401);

    // Rate-limit writes only.
    const isWrite = request.method === 'POST' || request.method === 'DELETE';
    if (isWrite) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      if (rateLimited(ip)) return err('rate limited', 429);
    }

    let body = {};
    if (request.method === 'POST') {
      // Size guard before parsing: trust Content-Length when present, and
      // re-check the actual length (covers chunked bodies without the header).
      const declared = Number(request.headers.get('content-length') || 0);
      if (declared > MAX_BODY_BYTES) return err('payload too large', 413);
      let raw;
      try {
        raw = await request.text();
      } catch {
        return err('invalid body');
      }
      if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
        return err('payload too large', 413);
      }
      try {
        body = JSON.parse(raw);
      } catch {
        return err('invalid JSON body');
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return err('JSON body must be an object');
      }
    }

    try {
      if (path === '/cache') {
        if (request.method === 'GET') return await getCache(db, url);
        if (request.method === 'POST') return await postCache(db, body);
      } else if (path === '/ignored') {
        if (request.method === 'GET') return await getIgnored(db);
        if (request.method === 'POST') return await postIgnored(db, body);
        if (request.method === 'DELETE') return await deleteIgnored(db, url);
      } else if (path === '/whitelist') {
        if (request.method === 'GET') return await getWhitelist(db, url, authed);
        if (request.method === 'POST') return await postWhitelist(db, body);
      } else if (path === '/whitelist/status') {
        if (request.method === 'POST') return await setWhitelistStatus(db, body);
      } else {
        return err('not found', 404);
      }
      return err('method not allowed', 405);
    } catch (e) {
      return err(`server error: ${e.message}`, 500);
    }
  },
};
