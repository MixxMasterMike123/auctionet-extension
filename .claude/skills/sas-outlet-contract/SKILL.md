---
name: sas-outlet-contract
description: Shared contract between the Chrome extension (data writer) and the Next.js Outlet site (data reader). Database schema, status values, price constants, image paths, and ownership rules. Use when touching Supabase operations, item status, seller payouts, or outlet-related data structures.
user-invocable: false
---

# SaS Outlet — Shared Contract

This skill defines the binding contract between two separate projects that share one Supabase database:

| Project | Repo | Role |
|---------|------|------|
| **Auctionet Extension** | `auctionet-extension/` | WRITE items, sellers, images from admin scraper |
| **SaS Outlet** | `sas-outlet/` | READ public catalog + admin status updates + transactions |

**Rule:** If this skill changes in one project, it MUST be copied identically to the other.

---

## Database Schema

### `sellers` (extension writes, outlet reads)
```sql
CREATE TABLE sellers (
  id BIGINT PRIMARY KEY,           -- Auctionet seller ID (from admin URL)
  name TEXT NOT NULL,              -- e.g. "Doris Östbergs dödsbo"
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### `items` (extension writes new items, outlet updates status)
```sql
CREATE TABLE items (
  id BIGINT PRIMARY KEY,           -- Auctionet item ID (from DOM class test-item-{ID})
  title TEXT NOT NULL,             -- Scraped from admin, ID prefix stripped
  description TEXT,               -- Item description (Beskrivning) from show page
  condition TEXT,                 -- Condition report (Konditionsrapport) from show page
  image_url TEXT,                  -- Primary image: Supabase Storage public URL
  image_urls JSONB,               -- All images: JSON array of Supabase Storage URLs
  image_thumb_url TEXT,            -- Thumbnail version
  original_image_url TEXT,         -- Original Auctionet CDN URL (reference only)
  category TEXT,                   -- Parent category name: 'Möbler', 'Konst', etc.
  price INTEGER NOT NULL DEFAULT 200,
  original_estimate INTEGER,       -- Auctionet valuation in SEK
  original_reserve INTEGER,        -- Auctionet reserve price in SEK
  warehouse_location TEXT,         -- e.g. 'SVART VÄGG', 'HYLLA - 2. B.'
  seller_id BIGINT REFERENCES sellers(id),
  contract_id BIGINT,             -- Auctionet contract ID
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','pending_approval','reserved','sold','paid_out','donated','removed')),
  reserved_by TEXT,                -- Name/phone of person who reserved
  reserved_at TIMESTAMPTZ,
  sold_at TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### `transactions` (outlet writes when items are sold)
```sql
CREATE TABLE transactions (
  id BIGSERIAL PRIMARY KEY,
  item_id BIGINT REFERENCES items(id),
  seller_id BIGINT REFERENCES sellers(id),
  sold_at TIMESTAMPTZ DEFAULT now(),
  total_price INTEGER DEFAULT 200,    -- What buyer pays
  seller_payout INTEGER DEFAULT 80,   -- Seller's share
  house_revenue INTEGER DEFAULT 120,  -- SaS keeps
  paid_out BOOLEAN DEFAULT FALSE,
  paid_out_at TIMESTAMPTZ
);
```

### `categories` (seeded once, read by both)
```sql
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  display_order INTEGER DEFAULT 0
);

-- Seed values:
INSERT INTO categories (name, display_order) VALUES
  ('Belysning & Lampor', 1), ('Glas', 2), ('Keramik & Porslin', 3),
  ('Smycken', 4), ('Möbler', 5), ('Konst', 6), ('Klockor & Ur', 7),
  ('Mattor & Textil', 8), ('Silver & Metall', 9), ('Speglar', 10),
  ('Leksaker', 11), ('Böcker', 12), ('Allmoge', 13),
  ('Samlarföremål', 14), ('Övrigt', 15);
```

### `spellcheck_cache` (extension writes, both read)
```sql
CREATE TABLE spellcheck_cache (
  item_id BIGINT PRIMARY KEY,        -- Auctionet item ID
  text_hash TEXT NOT NULL,            -- Hash of title+description+condition for staleness detection
  results JSONB NOT NULL DEFAULT '[]', -- [{word, correction, confidence, source}] or [] if clean
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_by TEXT                     -- Optional: identifier for debugging
);

CREATE INDEX idx_spellcheck_cache_checked_at ON spellcheck_cache (checked_at);
```

---

## Row Level Security

```sql
-- items: public can read available/reserved, admin can do everything
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read available" ON items FOR SELECT
  USING (status IN ('available','reserved'));
CREATE POLICY "Admin write" ON items FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- sellers: NEVER publicly readable
ALTER TABLE sellers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin only" ON sellers FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- transactions: admin only
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin only" ON transactions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- categories: public read
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON categories FOR SELECT USING (true);

-- spellcheck_cache: public read, service role write
ALTER TABLE spellcheck_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read spellcheck" ON spellcheck_cache FOR SELECT USING (true);
CREATE POLICY "Service write spellcheck" ON spellcheck_cache FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

---

## Status Values & Lifecycle

```
[scrape]   → pending_approval  (extension sets this when original_reserve > 300)
[scrape]   → available         (extension sets this when original_reserve <= 300)
pending_approval → available   (admin approves item for sale)
available  → reserved          (visitor submits reserve form)
reserved   → available         (reservation expires after 3 days)
reserved   → sold              (admin marks as sold, creates transaction)
available  → sold              (admin marks as sold directly)
sold       → paid_out          (admin marks seller as paid)
available  → donated           (admin decides to donate)
available  → removed           (admin removes from outlet)
```

Valid status values: `'available'`, `'pending_approval'`, `'reserved'`, `'sold'`, `'paid_out'`, `'donated'`, `'removed'`

---

## Price Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `OUTLET_PRICE` | 200 | Fixed price per item (SEK) |
| `SELLER_PAYOUT` | 80 | Seller's share per sold item (SEK) |
| `HOUSE_REVENUE` | 120 | SaS keeps per sold item (SEK) |

No buyer commission. No shipping fees. Pay on pickup.

---

## Image Storage

- **Bucket:** `item-images` (public read, authenticated write)
- **Full image path:** `items/{item_id}/full.jpg`
- **Thumbnail path:** `items/{item_id}/thumb.jpg`
- **Public URL pattern:** `{SUPABASE_URL}/storage/v1/object/public/item-images/items/{item_id}/full.jpg`

Images are COPIED from Auctionet CDN to Supabase Storage during scraping. Never hotlink.

---

## Supabase Config Keys

### Chrome Extension (chrome.storage.local)
- `outletSupabaseUrl` — Supabase project URL (e.g. `https://xxxx.supabase.co`)
- `outletSupabaseServiceKey` — Service role key (used by background.js only, never exposed to content scripts)

### Next.js (.env.local)
- `NEXT_PUBLIC_SUPABASE_URL` — Same Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Anon key (public, for reads)
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (server-side only, for admin writes)

---

## Data Ownership

| Operation | Owner | How |
|-----------|-------|-----|
| Insert new items | Extension | Scrapes unsolds page, upserts to `items` |
| Insert new sellers | Extension | Extracts from unsolds DOM, upserts to `sellers` |
| Upload images | Extension | Copies from Auctionet CDN to Supabase Storage |
| Update item status | Outlet admin | Changes status via admin UI |
| Create transactions | Outlet admin | When marking items as sold |
| Mark payouts | Outlet admin | When paying sellers |
| Read public items | Outlet public | Fetches available/reserved items |
| Write spellcheck cache | Extension | Publication scanner writes after AI spellcheck |
| Read spellcheck cache | Both | Extension checks before AI call; Outlet can display status |

---

## Swedish Terminology

| Swedish | English | Usage |
|---------|---------|-------|
| Återrop | Recall | Item unsold after all auction attempts |
| Bevakningspris | Reserve price | Minimum acceptable bid |
| Värdering | Valuation/estimate | Appraised value |
| Klubbat | Hammered/sold | Sold at auction |
| Lagerdagar | Storage days | Days item has been in warehouse |
| Ångerrätt | Right of withdrawal | Return policy (we have NONE) |
| Omlistas ej | Not auto-relistable | Done with automatic relisting |
| Säljarens andel | Seller's share | 80 kr per sold item |

---

## Business Context

- Items come from Auctionet's `/admin/sas/unsolds?filter=not_autorelistable`
- These have failed 3 automatic relisting attempts (Auctionet's limit)
- Previously donated to charity (HK) — now sold at fixed 200 kr instead
- Pickup only at Stadsauktion Sundsvall — no shipping, no ångerrätt
- Scraping runs ~weekly by admin using the Chrome extension
