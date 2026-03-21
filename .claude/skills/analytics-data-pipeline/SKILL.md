---
name: analytics-data-pipeline
description: Analytics page data pipeline — fetch strategies, filter state, data aggregation, admin page scraping, caching, and KPI computation. Use when working on the analytics page, modifying data fetching, changing filters or KPIs, adding new analytics metrics, debugging data issues, or understanding how sales data flows from Auctionet API to the dashboard display. Also use when the user mentions analytics charts, company sales data, YoY comparisons, category breakdowns, or price distribution analysis.
user-invocable: false
---

# Analytics Data Pipeline

The standalone Analytics page (`analytics.html` + `analytics.js`) provides company-wide sales analysis, trends, and KPIs. It uses a sophisticated data pipeline with dual data sources, intelligent caching, and reactive filtering.

## Architecture Overview

```
User selects company
  ↓
data-fetcher.js ─── Auctionet API (/api/v2/items.json)
  │                    └─ Direct pagination (up to 10k items)
  │                    └─ Category sharding (beyond 10k, ~96% coverage)
  │                    └─ Incremental refresh (delta updates)
  ↓
data-cache.js ────── Compress (2KB → ~100B per item) → chrome.storage.local
  ↓
filter-state.js ──── Reactive 4-dimensional filter (year, month, category, price)
  ↓
data-aggregator.js ─ KPIs, monthly breakdown, price distribution, YoY
  ↓
analytics.js ──────── Render: KPI cards, charts, tables, sparklines
  ↓
ai-insights.js ────── AI-generated analysis summary (Claude)
```

Additionally, for the user's own company:
```
auction-results-scraper.js ── Scrapes /admin/sas/auction_results (HTML)
  └─ Category-level stats: sold count, first-sale rate, commission, visits
  └─ Separate 4-hour cache per year/month
```

## Module Reference

| Module | File | Purpose |
|--------|------|---------|
| Data Fetcher | `modules/analytics/data-fetcher.js` | API fetch strategies with fallback |
| Data Cache | `modules/analytics/data-cache.js` | Compression and chrome.storage.local persistence |
| Data Aggregator | `modules/analytics/data-aggregator.js` | KPI computation, monthly/category breakdowns |
| Filter State | `modules/analytics/filter-state.js` | Reactive event-emitter for 4 filter dimensions |
| Category Registry | `modules/analytics/category-registry.js` | ~100 sub-category IDs for sharded fetching |
| AI Insights | `modules/analytics/ai-insights.js` | AI-generated analysis summaries |
| Results Scraper | `modules/analytics/auction-results-scraper.js` | Admin page HTML scraping |

## Data Sources

### 1. Public API (Primary)

Endpoint: `https://auctionet.com/api/v2/items.json`

Fetches sold items with `company_id` and `is=ended` parameters. Items are compressed to essential fields:

| Compressed | Original | Type |
|------------|----------|------|
| `id` | `id` | number |
| `p` | `bids[0].amount` (highest bid) | number |
| `e` | `estimate` | number |
| `r` | `reserve_amount` | number |
| `rm` | `reserve_met` | boolean |
| `cat` | `category_id` | number |
| `d` | `ends_at` (unix timestamp) | number |
| `sb` | `starting_bid_amount` | number |

### 2. Admin Page Scraping (Supplementary, own company only)

URL: `/admin/sas/auction_results` with query parameters:
- `filter[auction_type]` — auction type filter
- `filter[from_date]` / `filter[to_date]` — date range
- `filter[include_unsolds]=true` — include unsold items

Fetched via `fetch-admin-html` message to background.js. HTML parsed with Swedish number formatting (space thousands separator, comma decimal).

**Data extracted per category:**
- `totalCount`, `soldCount`, `unsoldCount` (lot appearances, not unique items)
- `totalHammered`, `totalEstimate`, `totalReserve`
- `avgUniqueVisits` (per lot)
- `totalCommission` (seller fees collected)
- `hamVsEstSold`, `hamVsEstAll` (hammer vs estimate percentages)

**Important:** Admin data counts auction lot appearances (including re-listings), not unique items. Unsuitable for recall rates — use API data for that.

## Fetch Strategies (data-fetcher.js)

### Strategy 1: Direct Pagination
- `per_page=200`, up to `MAX_PAGES=50` pages
- Maximum coverage: 10,000 items
- Stops early when page returns <200 items
- First attempt for any company

### Strategy 2: Category Sharding (fallback)
- Triggered when direct pagination hits the 10k cap
- Fetches ~100 sub-categories in parallel (`CONCURRENT_FETCHES=4`)
- Sub-category IDs from `category-registry.js`
- Each sub-category paginated up to 50 pages
- Coverage: ~96% vs ~77% direct (fewer per-category items hit API cap)

### Strategy 3: Incremental Refresh
- On subsequent loads when cache exists and isn't expired
- Fetches only recent pages (up to 10 pages)
- Stops when all returned items already exist in cache (by ID)
- Merges new items (most recent first) with existing cached data

## Filter State (filter-state.js)

Reactive event-emitter with four independent filter dimensions:

```javascript
{
  year: number,           // Current year by default
  month: null | 0-11,     // null = all months
  categoryId: null | id,  // null = all categories (uses parent category mapping)
  priceRange: null | { min, max }  // null = all prices
}
```

### Price Brackets (hardcoded)
`300`, `301–500`, `501–1000`, `1001–2000`, `2001–5000`, `5001–10000`, `10000+`

### Event Flow
When any filter changes, `FilterState` emits to all listeners → triggers:
1. `renderSidebar()` — updates filter UI with item counts
2. `renderDashboard()` — recomputes KPIs for filtered subset
3. `loadAdminData()` — if year/month changed and viewing own company

## Data Aggregation (data-aggregator.js)

### `filterItems(items, filterState)`
Filters compressed items by year, month, category (via parent mapping), and price range.

### `computeKPIs(items)`
Returns: count, total revenue, average price, median price.

### `computeMonthlyData(items)`
12-element array with count and revenue per month.

### `computePriceDistribution(items)`
7 price brackets with count, percentage, and revenue per bracket.

### `computeCategoryBreakdown(items)`
Parent categories sorted by count, with revenue and average price.

### `computeYoY(currentItems, previousItems)`
Year-over-year comparison with percentage changes.
**Special logic:** Current year compares same-period only (Jan 1 to today). Historical years compare full year.

### `computePricePoints(items)`
Percentage of items at: minimum bid, <500 SEK, >500, >1000, >5000.

## Caching Architecture

### API Data Cache
- Key: `analytics_{companyId}` in `chrome.storage.local`
- Contains: compressed items array, `houseName`, `fetchedAt` timestamp
- TTL: 24 hours
- Compression: ~2KB/item → ~100 bytes/item

### Admin Results Cache
- Key patterns: `auction_results_{year}`, `auction_results_{year}_m{mm}`, `auction_results_{year}_sp`
- TTL: 4 hours
- Per-year, per-month, and same-period variants

### In-Memory Cache
- Search results: 30-minute expiry (general), 5-minute (live auctions)
- Artist biography: 14 days

## AI Insights (ai-insights.js)

`generateInsights()` sends aggregated KPIs and category data to Claude for analysis:
- Temperature: 0.2 (moderate creativity)
- Uses prompt caching (`cache_control: { type: 'ephemeral' }`)
- Renders as a summary card with expandable full panel
- Separate "nuggets" feature in analytics.js uses temperature 0.9 for varied creative insights

## End-to-End Data Flow

```
1. analytics.html loads → analytics.js init()
2. populateCompanyDropdown() — reads chrome.storage.local analytics_* keys
3. User selects company → loadCompany(companyId)
4. loadCache() checks chrome.storage.local[analytics_{id}]
   ├─ Cached & not expired → render immediately
   └─ Missing/expired → fetchCompanyData()
       ├─ Try direct pagination
       └─ If hits cap → fallback to category sharding
       ├─ Filter to SEK, sold items with bids > 0
       └─ compress + saveCache()
5. initFilters() — year = current, month/category/price = null
6. renderSidebar() + renderDashboard()
   ├─ Sidebar: year grid, month grid, category list, price brackets
   └─ Dashboard: KPI cards, monthly chart, price distribution, category table, top 10
7. Filter change → FilterState emits onChange
   ├─ renderSidebar() (update counts)
   ├─ renderDashboard() (recompute with filtered items)
   └─ If year/month changed & own company:
       └─ loadAdminData() → fetchAuctionResults(fromDate, toDate)
           ├─ Scrape HTML via background.js
           ├─ Parse category table rows
           └─ saveAdminCache() + render admin KPIs/YoY
8. AI button → runAIAnalysis()
   ├─ Compute all aggregations
   ├─ generateInsights() → background.js → Anthropic API
   └─ Render insights card + panel
```

## Key Design Decisions

- **Compression**: Storing raw API responses would exceed chrome.storage.local limits for large companies. Compression to ~100B/item enables storing 50k+ items.
- **Category sharding**: Auctionet's API returns max 10k items per query. Sharding by sub-category multiplies coverage ~4x.
- **Same-period YoY**: Comparing full 2024 vs partial 2025 would be misleading. Current year always compares Jan 1 → today against same period last year.
- **Dual sources**: API gives item-level data (for price distributions, category breakdowns). Admin scraping gives aggregate stats (first-sale rate, commission) that the API doesn't expose.
