# Strategic Plan: Supabase Database Backend for Auctionet Extension

*Created: 2026-03-21*
*Status: Investigation / Not yet approved for implementation*

## Context

The extension is currently zero-server, zero-dependency — all data lives in browser storage with short TTLs (24h for sales, 4h for admin results, 1h for market analysis, 7d for biographies). If Auctionet locks down their admin pages or API, all historical data is lost. Additionally, the extension is hardcoded to SAS (Stockholms Auktionsverk) in 15+ locations, blocking any multi-tenant future. Adding a Supabase backend would provide data resilience, enable multi-tenancy for selling to other houses, unlock cross-house analytics, and reduce AI costs through shared caching.

**Critical context:** This extension is *unofficial* — it sits on top of Auctionet's admin interface without their knowledge or approval. Auctionet doesn't know it exists. This has major implications:

1. **Data resilience is the #1 argument** — Auctionet could change their admin HTML, add CSRF tokens, restrict their public API, or block the extension at any time. Once that happens, all ephemeral data (quality scores, sales history, market analyses) is gone forever. A database is insurance.
2. **The extension scrapes admin pages** (DOM parsing for cataloger stats, publication queue, auction results) and uses the public API (sold items, search). If Auctionet discovers and objects, they could block requests or require authentication tokens the extension can't obtain.
3. **Multi-tenancy to other houses must be done carefully** — more houses using it increases the chance Auctionet notices unusual traffic patterns. A backend lets us implement smart caching and request coalescing to minimize API/scraping load per house.
4. **If Auctionet eventually discovers and approves it**, having a proper backend with usage tracking and tenant management makes the extension look professional and ready for a partnership conversation. If they disapprove, the stored data remains valuable.
5. **No Auctionet user PII should ever reach Supabase** — since this is unofficial, we have no data processing agreement with Auctionet. Only aggregate/anonymous data (item prices, categories, quality scores) and the house's own operational data should be stored.

---

## Part 1: Honest Assessment — Should We Do This?

### Arguments FOR

| Benefit | Impact | Without DB |
|---------|--------|------------|
| **Data resilience** — Auctionet locks down API/admin | All historical sales, quality scores, market data preserved permanently | Everything lost — extension becomes useless |
| **Shared AI cache** — artist bios, market analysis | 60-80% reduction in Anthropic API costs across users | Every user pays for identical Claude calls |
| **Multi-tenancy** — sell to other auction houses | One extension, tenant-isolated data, subscription billing | Separate builds per house, no shared infrastructure |
| **Quality tracking over time** — cataloger performance | Longitudinal data: "Quality improved 62→78 over 3 months" | Scores computed on-the-fly, never persisted |
| **Cross-house benchmarking** — premium feature | "Your first-sale rate: 52% vs industry avg: 61%" | Impossible without centralized data |
| **Centralized config push** — feature flags, rules | Update quality rules, AI prompts without new extension version | Every change requires Chrome Web Store review |
| **Usage/cost tracking** — per-house API spend | Know exactly what each tenant costs and uses | No visibility into usage patterns |
| **Mobile companion potential** — same DB, different UI | Managers check KPIs on phone | Chrome-only forever |

### Arguments AGAINST

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Complexity explosion** — solo developer maintaining a distributed system | HIGH | Offline-first design; Supabase is additive, never a dependency |
| **No build step today** — Supabase JS client is 50KB, needs bundling | MEDIUM | Use raw `fetch()` REST calls instead of SDK — preserves zero-dependency architecture |
| **Latency tax** — 50-200ms per DB call vs sub-ms local storage | MEDIUM | Local-first: all reads hit local cache first, DB is fallback/sync target |
| **GDPR exposure** — storing cataloger names, potentially personal data | HIGH | EU region (Frankfurt), DPA with Supabase Pro, never store customer/buyer/seller PII |
| **Cost before revenue** — $25/mo Pro plan before first paying customer | LOW | Free tier (500MB) covers 1-3 houses; Pro only needed at scale |
| **Migration risk** — touching every file in the project | HIGH | Phase 0 (multi-tenancy) is independent of Supabase and valuable on its own |
| **Offline degradation** — features fail when Supabase unreachable | MEDIUM | Strict local-first: extension works identically without DB connectivity |
| **Premature optimization** — building for customers that don't exist yet | MEDIUM | Phase 0 first, validate demand, then Phase 1 minimal |

### Verdict

**Proceed incrementally.** Phase 0 (multi-tenancy cleanup) has standalone value regardless. Supabase phases only after validating demand from at least one other auction house.

---

## Part 2: Architecture Design

### Authentication Strategy

**Email/password per house (not per user initially).**

Each auction house gets one account. Maps to a tenant. Individual user management comes later.

Flow:
1. House admin signs up in extension popup → Supabase creates user
2. `profiles` table maps user → `tenant_id`
3. JWT stored in `chrome.storage.local` (not accessible to content scripts)
4. Background service worker refreshes token every 50 min (JWT expires in 1h)
5. All DB calls go through `background.js` (same security boundary as Anthropic API)

### Client Integration — No SDK, Raw REST

Preserve zero-dependency architecture with a thin fetch wrapper:

**New file: `modules/supabase-client.js`**
```
- signIn(email, password) → { session, user }
- signUp(email, password) → { session, user }
- refreshToken() → { session }
- query(table, { select, filter, insert, upsert }) → data
- rpc(functionName, params) → data
```

All calls routed through `background.js` message handler (same pattern as `callAnthropicAPI`).

### Data Flow — Local-First, Sync-Behind

```
READ:  in-memory → chrome.storage.local → localStorage → Supabase → source API
WRITE: local storage first → fire-and-forget to Supabase → retry queue on failure
```

Failed writes queued in `chrome.storage.local` key `supabase_write_queue`, retried on 5-min alarm.

**Key principle: The extension works identically whether Supabase is reachable or not.**

---

## Part 3: Database Schema

### Core Tables

```sql
-- TENANTS
tenants (
  id UUID PK,
  slug TEXT UNIQUE,              -- 'sas', 'stavanger'
  name TEXT,                     -- 'Stockholms Auktionsverk'
  auctionet_company_id INTEGER,
  subscription_status TEXT,      -- trial | active | expired
  subscription_expires_at TIMESTAMPTZ,
  feature_flags JSONB,           -- {"pubScanner": true, "aiInsights": true}
  created_at, updated_at
)

-- USER PROFILES
profiles (
  id UUID PK → auth.users,
  tenant_id UUID → tenants,
  display_name TEXT,
  role TEXT DEFAULT 'cataloger',  -- admin | cataloger | viewer
  created_at
)

-- SALES HISTORY (replacing chrome.storage.local 24h cache → permanent)
sales_items (
  id BIGINT,                     -- Auctionet item ID
  tenant_id UUID → tenants,
  price INTEGER, estimate INTEGER, reserve INTEGER,
  reserve_met BOOLEAN, category_id INTEGER,
  ended_at TIMESTAMPTZ, starting_bid INTEGER,
  fetched_at TIMESTAMPTZ,
  PRIMARY KEY (id, tenant_id)
)

-- QUALITY SCORES (currently never persisted → now tracked over time)
quality_scores (
  id BIGSERIAL PK,
  tenant_id UUID, item_id BIGINT,
  score INTEGER,                  -- 0-100
  warnings JSONB,                 -- [{code, message, deduction}]
  cataloger_name TEXT,
  scored_at TIMESTAMPTZ,
  UNIQUE (tenant_id, item_id, scored_at)
)

-- AI RESULTS (shared cache, dedup by input hash)
ai_results (
  id BIGSERIAL PK,
  tenant_id UUID,
  item_id BIGINT,
  result_type TEXT,               -- field_enhancement | market_analysis | valuation | biography
  input_hash TEXT,                -- SHA-256 for dedup
  model TEXT, input_tokens INT, output_tokens INT,
  result JSONB,
  created_at, expires_at TIMESTAMPTZ
)

-- PUBLICATION SCANS (currently overwritten each run → now historical)
publication_scans (
  id BIGSERIAL PK,
  tenant_id UUID,
  scanned_at TIMESTAMPTZ,
  total_items INT, critical_count INT, warning_count INT, passed_count INT,
  issues JSONB
)

-- CATALOGER PERFORMANCE (currently DOM-scraped, ephemeral → longitudinal)
cataloger_snapshots (
  id BIGSERIAL PK,
  tenant_id UUID,
  cataloger_name TEXT, snapshot_date DATE,
  items_today INT, items_yesterday INT, items_last_month INT,
  weekly_avg NUMERIC, monthly_avg NUMERIC,
  UNIQUE (tenant_id, cataloger_name, snapshot_date)
)

-- ARTIST BIOGRAPHIES (shared across ALL tenants — no tenant_id)
artist_biographies (
  id BIGSERIAL PK,
  artist_name_normalized TEXT UNIQUE,
  artist_name_display TEXT,
  biography JSONB,
  source_model TEXT,
  wikipedia_url TEXT,
  created_at, updated_at
)

-- MARKET ANALYSES (shared cache with expiry)
market_analyses (
  id BIGSERIAL PK,
  search_query_hash TEXT,
  search_query TEXT,
  result JSONB,
  comparable_count INT,
  created_at, expires_at TIMESTAMPTZ
)

-- AUCTION RESULTS (admin-scraped data, currently 4h cache → permanent)
auction_results (
  id BIGSERIAL PK,
  tenant_id UUID,
  year INT, month INT,
  categories JSONB, totals JSONB,
  fetched_at TIMESTAMPTZ,
  UNIQUE (tenant_id, year, month)
)

-- USAGE TRACKING
usage_events (
  id BIGSERIAL PK,
  tenant_id UUID, user_id UUID,
  event_type TEXT,                -- ai_call | quality_score | pub_scan | market_analysis
  metadata JSONB,                 -- {model, tokens, duration_ms, cost_usd}
  created_at TIMESTAMPTZ
)

-- GLOBAL CONFIG (push updates without extension release)
global_config (
  key TEXT PK,
  value JSONB,
  updated_at TIMESTAMPTZ
)
```

### Row-Level Security

```sql
-- Helper function
CREATE FUNCTION get_my_tenant_id() RETURNS UUID AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Apply to ALL tenant-scoped tables:
CREATE POLICY "Tenant isolation" ON <table>
  FOR ALL USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

-- Shared tables (biographies, market_analyses): read by anyone, write by authenticated
-- Global config: read-only for authenticated users
```

---

## Part 4: Implementation Phases

### Phase 0: Multi-Tenancy Prep (No Supabase — standalone value)

**Goal:** Remove all SAS hardcoding so the extension works for any auction house.

| File | Change |
|------|--------|
| `manifest.json:35` | `/admin/sas/sellers/` → `/admin/*/sellers/` |
| `manifest.json:54` | `/admin/sas/valuation_requests/` → `/admin/*/valuation_requests/` |
| `manifest.json:66` | `/admin/sas` → `/admin/*` (+ exclude `/admin/login*` and other non-house paths) |
| `admin-dashboard.js:9-10` | Replace `/\/admin\/sas\/?$/` with dynamic house slug extraction |
| `admin-dashboard.js:281,299,666,1172,1353` | Replace hardcoded `/admin/sas/` URLs with dynamic slug |
| `publication-scanner-bg.js:387` | Replace `/admin/sas/publishables` with dynamic slug |
| `auction-results-scraper.js:11` | Replace hardcoded `BASE_URL` with dynamic slug |
| `background.js:83` | Replace SAS-specific tab query with wildcard |
| `comment-enhancer.js:10,30,92` | Replace SAS-specific checks |
| **NEW** `modules/tenant-context.js` | Extract house slug from URL, provide to all modules |

**Effort:** 2-3 days. **Risk:** Low. **Value:** Extension works for any Auctionet house.

### Phase 1: Foundation — Auth + Sales History (Weeks 1-2)

**Goal:** Supabase project, auth flow, and the single highest-value migration.

1. Create Supabase project (EU region — Frankfurt)
2. Create `tenants`, `profiles`, `sales_items` tables + RLS
3. Build `modules/supabase-client.js` (thin REST wrapper, ~200 lines)
4. Add `supabase-*` message handlers to `background.js`
5. Add auth UI to `popup.html`/`popup.js` (sign up/in section)
6. Add `"https://*.supabase.co/*"` to `host_permissions` in `manifest.json`
7. Modify `data-cache.js` `saveCache()` → also upsert to Supabase (fire-and-forget)
8. Modify `data-fetcher.js` → on local cache miss, try Supabase before Auctionet API
9. One-time migration: upload existing `analytics_*` data to `sales_items`

### Phase 2: Shared Knowledge Base (Weeks 3-4)

**Goal:** Artist biographies and AI results shared across all users.

1. Create `artist_biographies`, `ai_results`, `market_analyses` tables
2. Modify `biography-kb-card.js`: check Supabase before calling Claude; write back after
3. Modify `api-manager.js` market analysis: check `market_analyses` before source fetch
4. **Expected savings:** 60-80% reduction in biography API calls, 30-50% for market analysis

### Phase 3: Analytics + Quality Tracking (Weeks 5-8)

**Goal:** Historical quality scores, publication scan trends, cataloger performance.

1. Create `quality_scores`, `publication_scans`, `cataloger_snapshots`, `usage_events` tables
2. Modify `quality-analyzer.js`: fire-and-forget write to `quality_scores` after scoring
3. Modify `publication-scanner-bg.js`: persist each scan to `publication_scans`
4. Modify `admin-dashboard.js`: upsert daily `cataloger_snapshots`
5. Add usage logging to `background.js` `callAnthropicAPI()`
6. Build quality trend visualization in analytics page

### Phase 4: Premium Features (Weeks 9-12)

**Goal:** Subscription management, cross-house benchmarks, config push.

1. Create `global_config`, `auction_results` tables
2. Subscription checking in `background.js` on startup
3. Edge Function for anonymized cross-tenant benchmarks
4. Global config polling (every 6h) for feature flags and announcements
5. Optional: Supabase Realtime for live quality feed across catalogers

---

## Part 5: New Functionality Enabled by Database

| Feature | Phase | Description |
|---------|-------|-------------|
| **Permanent sales archive** | 1 | Never lose historical data, even if Auctionet changes |
| **Shared artist bios** | 2 | One Claude call serves all users for weeks |
| **AI cost dashboard** | 3 | Track spend per house, per feature, per model |
| **Quality improvement tracking** | 3 | "Your team's avg quality: 62→78 over Q1" |
| **Publication scan trends** | 3 | "Critical issues dropped 40% since October" |
| **Cataloger leaderboards (historical)** | 3 | Monthly/quarterly performance, not just today's snapshot |
| **Cross-house benchmarking** | 4 | Anonymized industry comparisons (premium) |
| **Remote feature flags** | 4 | Enable/disable features per tenant without extension update |
| **Subscription gating** | 4 | Trial → paid, feature tiers per plan |
| **Weekly email reports** | 4 | Edge Function sends KPI summaries to house managers |
| **Mobile companion app** | Future | Same Supabase DB, React Native or web app |
| **Training data for fine-tuning** | Future | Collect good/bad cataloging examples at scale |
| **Automated quality alerts** | Future | Slack/email when quality drops below threshold |

---

## Part 6: What Stays Client-Side Only

| Data | Why |
|------|-----|
| Anthropic API key | Security — must never leave the device |
| UI state (dark mode, panel visibility) | UX preference, no value in DB |
| Session-scoped ignored artists | Ephemeral by design |
| In-memory caches (30s-30min) | Performance — DB call would be slower |
| Customer/buyer/seller PII | GDPR — never store personal data from valuation requests |

---

## Part 7: Strategic Risk — Unofficial Extension

The extension is unsanctioned by Auctionet. This shapes the DB strategy in several ways:

### What Happens If Auctionet Discovers It

| Scenario | Impact on Extension | Impact with DB |
|----------|-------------------|----------------|
| **They ignore it** | Business as usual | DB adds value incrementally |
| **They approve/partner** | Possible official API access, co-marketing | DB shows professionalism, ready for SLA |
| **They block admin scraping** | Admin dashboard, pub scanner, auction results scraper break | Historical data preserved in DB, public API features still work |
| **They block public API** | Analytics, market analysis, sales data all break | All historical sales data preserved, can show cached trends |
| **They block extension entirely** (CSP headers) | Extension stops loading on their pages | DB preserves all historical data; could pivot to standalone analytics app |

### Why DB Makes the Unofficial Status *Less* Risky

1. **Reduced scraping frequency** — With historical data in DB, we don't need to re-scrape admin pages every session. Cache for days/weeks instead of hours.
2. **Request coalescing** — Multiple users at same house share cached data instead of each one hammering Auctionet's servers independently.
3. **Graceful degradation** — If specific features break (e.g., admin HTML changes), the DB-backed features continue working while we fix the scraper.
4. **Pivot capability** — If extension gets blocked, the DB contains enough historical data to build a standalone analytics web app.

### What to Avoid

- **Never store Auctionet session tokens or auth cookies in Supabase** — this would be a clear TOS violation
- **Never proxy Auctionet API calls through Supabase** — keep all Auctionet requests client-side from the user's browser (their own session)
- **Don't scale aggressively before partnership** — if 50 houses start scraping, Auctionet will notice. Grow carefully.
- **Keep data minimal** — store prices, categories, scores. Never store item descriptions, seller info, or buyer data in Supabase.

## Part 8: GDPR Compliance

1. **Region:** Supabase EU (Frankfurt `eu-central-1`)
2. **Personal data stored:** Only cataloger first names (for performance tracking)
3. **Never store:** Customer names, buyer emails, seller addresses, valuation request details, item descriptions
4. **DPA:** Required with Supabase Pro plan ($25/mo) once storing personal data
5. **Right to deletion:** Tenant admin triggers cascade delete across all tenant tables
6. **Data minimization:** Since the extension is unofficial, we have no DPA with Auctionet — extra caution required
7. **Public data:** Sales prices, categories, item IDs are publicly visible on auctionet.com — caching these is low risk

---

## Part 9: Cost Projections

| Scale | DB Size | Supabase Tier | Monthly Cost |
|-------|---------|---------------|--------------|
| 1 house (SAS only) | ~50MB | Free | $0 |
| 2-3 houses | ~200MB | Free (500MB limit) | $0 |
| 5-10 houses | ~500MB-1GB | Pro | $25 |
| 50 houses | ~5GB | Pro + bandwidth | ~$75 |

**Breakeven:** 3 houses paying ~$10/month covers Pro plan.

---

## Part 10: Critical Files to Modify

| File | Phase | Changes |
|------|-------|---------|
| `manifest.json` | 0, 1 | Remove SAS hardcoding; add Supabase host_permission |
| `background.js` | 0, 1 | Dynamic tab queries; Supabase message handlers; auth token refresh |
| `admin-dashboard.js` | 0, 3 | Dynamic URLs; cataloger snapshot persistence |
| `publication-scanner-bg.js` | 0, 3 | Dynamic URLs; scan result persistence |
| `modules/analytics/auction-results-scraper.js` | 0 | Dynamic BASE_URL |
| `modules/analytics/data-cache.js` | 1 | Supabase write-through on save, read-through on miss |
| `modules/analytics/data-fetcher.js` | 1 | Supabase fallback before Auctionet API |
| `modules/core/biography-kb-card.js` | 2 | Shared biography lookup/write |
| `modules/api-manager.js` | 2, 3 | Shared AI result cache; usage event logging |
| `modules/quality-analyzer.js` | 3 | Quality score persistence |
| `popup.html` / `popup.js` | 1 | Auth UI (sign up/in), tenant display |
| `comment-enhancer.js` | 0 | Remove SAS-specific checks |

### New Files

| File | Phase | Purpose |
|------|-------|---------|
| `modules/supabase-client.js` | 1 | Thin REST wrapper (~200 lines) |
| `modules/tenant-context.js` | 0 | House slug extraction singleton |
| `modules/sync-queue.js` | 1 | Failed write retry queue |

---

## Part 11: Verification Plan

### Phase 0
- Install extension on a non-SAS Auctionet admin page → all features work
- Verify publication scanner runs for the active house, not hardcoded SAS
- Verify admin dashboard loads on any `/admin/{house}` page

### Phase 1
- Sign up in popup → Supabase user + profile created
- Load analytics → data saved to both local cache and Supabase
- Clear local cache → data loads from Supabase
- Disconnect internet → extension works normally from local cache
- Reconnect → queued writes sync to Supabase

### Phase 2
- User A looks up "Carl Larsson" biography → saved to Supabase
- User B (different house) looks up same artist → served from Supabase, no Claude call
- Verify AI cost reduction in usage_events table

### Phase 3
- Score quality on item → row appears in quality_scores
- Run publication scan → row appears in publication_scans
- Load admin dashboard → cataloger_snapshots upserted for today
- Analytics page shows quality trend chart over time

### Phase 4
- Set `subscription_status = 'expired'` → premium features disabled
- Update `global_config` row → extension picks up new value within 6h
- Cross-house benchmark Edge Function returns anonymized averages
