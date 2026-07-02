// SaS Outlet data API — Cloudflare Worker + D1 + R2
//
// Write path for the Auctionet extension (replaces Supabase PostgREST +
// Storage): item/seller upserts and image uploads into the shared
// `sas-outlet` D1 database and `item-images` R2 bucket. Also owns the
// nightly lifecycle sweep (Cron Trigger).
//
// Auth: every endpoint except /health requires
//   Authorization: Bearer <OUTLET_API_TOKEN>   (wrangler secret)
//
// Schema source of truth: sas-outlet/migrations/ + the sas-outlet-contract skill.

const MAX_OUTLET_ESTIMATE = 2000; // over this → status 'ignored', never listed
const SHOP_LIFETIME_DAYS = 10; // shop window before auto-withdrawal
const RESERVATION_EXPIRY_DAYS = 3; // unclaimed reservations released after this

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
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

function isPosInt(v) {
  return Number.isInteger(v) && v > 0;
}

function nowIso() {
  return new Date().toISOString();
}

// ─── Items ──────────────────────────────────────────────────────────────────

// Content columns the extension may write. status/published_at/reserved_*/
// sold_at/view_count are lifecycle fields owned by the outlet — an upsert of
// an existing item must never touch them.
const CONTENT_COLS = [
  'title',
  'description',
  'condition',
  'image_url',
  'image_urls',
  'image_thumb_url',
  'original_image_url',
  'category',
  'price',
  'original_estimate',
  'original_reserve',
  'warehouse_location',
  'seller_id',
  'contract_id',
];

async function getItem(db, itemId) {
  if (!isPosInt(itemId)) return err('invalid item id');
  const row = await db
    .prepare('SELECT id, status FROM items WHERE id = ?')
    .bind(itemId)
    .first();
  if (!row) return err('not found', 404);
  return json(row);
}

async function upsertItem(db, body) {
  const itemId = Number(body.id);
  if (!isPosInt(itemId)) return err('id must be a positive integer');
  if (typeof body.title !== 'string' || !body.title.trim()) {
    return err('title required');
  }

  // Only fields with actual values — never overwrite existing data with null
  const provided = CONTENT_COLS.filter(
    (c) => body[c] !== undefined && body[c] !== null
  );
  const values = provided.map((c) =>
    c === 'image_urls' && Array.isArray(body[c]) ? JSON.stringify(body[c]) : body[c]
  );

  // Status applies to NEW rows only. The valuation cap is enforced here so
  // over-cap items never become publicly visible, even before the sweep.
  let status = ['available', 'pending_approval'].includes(body.status)
    ? body.status
    : 'available';
  const estimate = Number(body.original_estimate);
  if (Number.isFinite(estimate) && estimate > MAX_OUTLET_ESTIMATE) {
    status = 'ignored';
  }

  const now = nowIso();
  const insertCols = ['id', ...provided, 'status', 'scraped_at'];
  const placeholders = insertCols.map(() => '?').join(', ');
  const updates = [...provided.map((c) => `${c} = excluded.${c}`), 'scraped_at = excluded.scraped_at'];

  await db
    .prepare(
      `INSERT INTO items (${insertCols.join(', ')}) VALUES (${placeholders})
       ON CONFLICT(id) DO UPDATE SET ${updates.join(', ')}`
    )
    .bind(itemId, ...values, status, now)
    .run();

  return json({ ok: true, id: itemId });
}

// ─── Sellers ────────────────────────────────────────────────────────────────

async function upsertSeller(db, body) {
  const sellerId = Number(body.id);
  if (!isPosInt(sellerId)) return err('id must be a positive integer');
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return err('name required');
  }

  await db
    .prepare(
      `INSERT INTO sellers (id, name, email, phone, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         email = excluded.email,
         phone = excluded.phone,
         updated_at = excluded.updated_at`
    )
    .bind(sellerId, body.name.trim(), body.email ?? null, body.phone ?? null, nowIso())
    .run();

  return json({ ok: true, id: sellerId });
}

// ─── Images (Auctionet CDN → R2) ────────────────────────────────────────────

const IMAGE_TYPE_RE = /^(full|thumb|img_\d+)$/;

async function uploadImage(env, itemId, type, body) {
  if (!env.IMAGES) {
    return err('R2 är inte aktiverat ännu — bilder kan inte laddas upp', 503);
  }
  if (!isPosInt(itemId)) return err('invalid item id');
  if (!IMAGE_TYPE_RE.test(type)) return err('invalid image type');

  const sourceUrl = body.sourceUrl;
  let source;
  try {
    source = new URL(sourceUrl);
  } catch {
    return err('sourceUrl must be a valid URL');
  }
  // Only fetch from Auctionet's CDN — this Worker must not be an open proxy
  const host = source.hostname;
  if (host !== 'auctionet.com' && !host.endsWith('.auctionet.com')) {
    return err('only Auctionet image URLs allowed');
  }

  const imageResponse = await fetch(source.toString());
  if (!imageResponse.ok) {
    return err(`failed to fetch image: HTTP ${imageResponse.status}`, 502);
  }
  const buf = await imageResponse.arrayBuffer();
  const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

  const key = `items/${itemId}/${type}.jpg`;
  await env.IMAGES.put(key, buf, { httpMetadata: { contentType } });

  const base = (env.PUBLIC_IMAGES_BASE || '').replace(/\/$/, '');
  return json({ ok: true, publicUrl: `${base}/${key}` });
}

// ─── Nightly lifecycle sweep ────────────────────────────────────────────────

async function runSweep(db) {
  const now = new Date();
  const iso = now.toISOString();
  const daysAgo = (days) =>
    new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  // Order matters: expire reservations first so stale ones re-enter the pool
  // before the withdraw pass picks them up.
  const [expired, ignored, withdrawn] = await db.batch([
    db
      .prepare(
        `UPDATE items
         SET status = 'available', reserved_by = NULL, reserved_at = NULL, updated_at = ?
         WHERE status = 'reserved' AND reserved_at < ?`
      )
      .bind(iso, daysAgo(RESERVATION_EXPIRY_DAYS)),
    db
      .prepare(
        `UPDATE items SET status = 'ignored', updated_at = ?
         WHERE status IN ('available', 'pending_approval') AND original_estimate > ?`
      )
      .bind(iso, MAX_OUTLET_ESTIMATE),
    db
      .prepare(
        `UPDATE items SET status = 'withdrawn', updated_at = ?
         WHERE status = 'available' AND published_at < ?`
      )
      .bind(iso, daysAgo(SHOP_LIFETIME_DAYS)),
  ]);

  return {
    expiredReservations: expired.meta.changes,
    ignored: ignored.meta.changes,
    withdrawn: withdrawn.meta.changes,
  };
}

// ─── Entry points ───────────────────────────────────────────────────────────

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
      return json({ ok: true, service: 'sas-outlet-api', time: nowIso() });
    }

    // Everything else requires the extension's bearer token
    if (!env.OUTLET_API_TOKEN) return err('OUTLET_API_TOKEN not configured', 500);
    if (request.headers.get('authorization') !== `Bearer ${env.OUTLET_API_TOKEN}`) {
      return err('unauthorized', 401);
    }

    let body = {};
    if (request.method === 'POST' || request.method === 'PUT') {
      try {
        body = await request.json();
      } catch {
        return err('invalid JSON body');
      }
    }

    try {
      // GET /items/:id — existence/status check
      const itemMatch = path.match(/^\/items\/(\d+)$/);
      if (itemMatch && request.method === 'GET') {
        return await getItem(db, Number(itemMatch[1]));
      }

      if (path === '/items' && request.method === 'POST') {
        return await upsertItem(db, body);
      }

      if (path === '/sellers' && request.method === 'POST') {
        return await upsertSeller(db, body);
      }

      // PUT /images/:itemId/:type — fetch from Auctionet CDN, store in R2
      const imageMatch = path.match(/^\/images\/(\d+)\/([a-z0-9_]+)$/);
      if (imageMatch && request.method === 'PUT') {
        return await uploadImage(env, Number(imageMatch[1]), imageMatch[2], body);
      }

      // POST /sweep — manual sweep trigger (same as the nightly cron)
      if (path === '/sweep' && request.method === 'POST') {
        return json(await runSweep(db));
      }

      return err('not found', 404);
    } catch (e) {
      return err(`server error: ${e.message}`, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runSweep(env.DB).then((result) =>
        console.log('nightly sweep:', JSON.stringify(result))
      )
    );
  },
};
