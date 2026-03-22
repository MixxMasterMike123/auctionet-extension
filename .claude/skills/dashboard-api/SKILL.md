---
name: dashboard-api
description: Auctionet real-time Dashboard API reference — endpoint, widget types, response schemas, polling patterns, computed KPIs, module API, and integration points. Use when working on admin dashboard KPIs, real-time data, live search data, R12/YTD revenue, pipeline health, session counts, or any code that fetches from dashboard.auctionet.com.
user-invocable: false
---

# Auctionet Dashboard API Reference

## Overview

The Dashboard API at `dashboard.auctionet.com` provides real-time operational data as structured JSON. Originally built for Auctionet's internal TV dashboards, it returns pre-computed KPIs updated every ~5 seconds.

**Key characteristics:**
- Single endpoint, multiple widget types in one request
- Token-based auth (static token per auction house)
- Checksum per widget for efficient polling
- Read-only, no rate limiting documented

## Endpoint

```
GET https://dashboard.auctionet.com/sources
  ?types={comma-separated widget names}
  &token={auth token}
```

**Response structure:**
```json
{
  "version": "unversioned",
  "sources": {
    "{widget-name}": {
      "data": { ... },
      "checksum": "hex-string"
    }
  }
}
```

Unknown widget names return `"data": {}` with checksum `99914b932bd37a50b983c5e7c90ae93b` (MD5 of `{}`).

## Authentication

- Token stored in `chrome.storage.local` key `dashboardApiToken`
- Token is per-auction-house, not per-user
- Token is extracted from the dashboard URL: `dashboard.auctionet.com/sas/employees?token=XXX`
- Background service worker (`background.js`) holds the token; content scripts never see it
- Content scripts send `{ type: 'dashboard-fetch', widgets: [...] }` messages

## Widget Types

### `sas_employees-hammered` — Sales Data

```json
{
  "yesterday": 55950,
  "last_seven_days_average": 63774,
  "sum_by_week_max": 384701,
  "last_week_day_max": 1472,
  "sum_by_week": [333085, 220226, 84542, 111057, 272008, 224978, 335391, 302448, 372867, 384701, 157998, 330163],
  "average_price_yesterday": 1472,
  "average_price_last_week": 1226,
  "average_price_by_day_last_week": [0, 1140, 1296, 1288, 1227, 785, 1472],
  "r12": 18434232,
  "today": 50850,
  "count_today": 38,
  "count_yesterday": 38,
  "average_count_last_seven_days": 57,
  "average_price_today": 1338,
  "ytd": 3155710
}
```

| Field | Type | Description |
|-------|------|-------------|
| `r12` | number | Rolling 12-month total hammer revenue (SEK) |
| `ytd` | number | Year-to-date total hammer revenue (SEK) |
| `today` | number | Today's total hammer revenue (SEK) |
| `yesterday` | number | Yesterday's total hammer revenue (SEK) |
| `count_today` | number | Items sold today |
| `count_yesterday` | number | Items sold yesterday |
| `average_count_last_seven_days` | number | Average items sold per day (7d) |
| `average_price_today` | number | Average hammer price today (SEK) |
| `average_price_yesterday` | number | Average hammer price yesterday (SEK) |
| `average_price_last_week` | number | Average hammer price last 7 days (SEK) |
| `average_price_by_day_last_week` | number[7] | Daily avg price, index 0 = 7 days ago, index 6 = yesterday |
| `sum_by_week` | number[12] | Weekly revenue totals, oldest first, 12 weeks |
| `sum_by_week_max` | number | Highest week in `sum_by_week` |
| `last_seven_days_average` | number | Average daily revenue last 7 days (SEK) |
| `last_week_day_max` | number | Highest single-day avg price last week |

### `sas_employees-auctions` — Publishing Data

```json
{
  "published_yesterday": 70,
  "published_last_seven_days_average": 101,
  "previously_unsold_vs_new_ratio_last_seven_days": 23,
  "published_by_week": [375, 133, 155, 328, 278, 316, 356, 378, 374, 450, 524, 821],
  "published_by_week_max": 821,
  "published_total_estimate": 98927108,
  "published": 705,
  "published_today": 0,
  "published_with_bid_over_reserve": 187
}
```

| Field | Type | Description |
|-------|------|-------------|
| `published` | number | Currently published items (live lots) |
| `published_today` | number | Items published today |
| `published_yesterday` | number | Items published yesterday |
| `published_last_seven_days_average` | number | Avg items published per day (7d) |
| `previously_unsold_vs_new_ratio_last_seven_days` | number | % of published items that are relistings (7d) |
| `published_by_week` | number[12] | Weekly publishing counts, oldest first, 12 weeks |
| `published_by_week_max` | number | Highest week |
| `published_total_estimate` | number | Sum of estimates for all published items (SEK) |
| `published_with_bid_over_reserve` | number | Items with current bid exceeding reserve |

### `sas_employees-new_items` — Intake Data

```json
{
  "today": 0,
  "yesterday": 33,
  "work_day_average": 68,
  "this_week": 453,
  "last_week": 348,
  "new_items_by_week": [138, 108, 97, 208, 258, 265, 379, 327, 363, 471, 348, 453],
  "week_max": 471
}
```

| Field | Type | Description |
|-------|------|-------------|
| `today` | number | Items registered today |
| `yesterday` | number | Items registered yesterday |
| `work_day_average` | number | Average items registered per work day |
| `this_week` | number | Items registered this week |
| `last_week` | number | Items registered last week |
| `new_items_by_week` | number[12] | Weekly intake counts, oldest first, 12 weeks |
| `week_max` | number | Highest week |

### `sas_employees-cataloger_stats` — Cataloger Performance

```json
[
  { "company_id": 48, "name": "Anders Melin", "today_count": 0, "yesterday_count": 1 }
]
```

Array of objects, one per cataloger:

| Field | Type | Description |
|-------|------|-------------|
| `company_id` | number | Auction house ID |
| `name` | string | Cataloger name |
| `today_count` | number | Items cataloged today |
| `yesterday_count` | number | Items cataloged yesterday |

**Note:** This gives less data than the admin page scraping (no lastMonth, weeklyAvg, monthlyAvg).

### `sas_employees-photographer_stats` — Photographer Performance

Same structure as cataloger_stats. Often empty array.

### `sas_employees-events` — Live Events

```json
{
  "events": [
    {
      "type": "watchlisting",
      "created_at": "2026-03-22T22:17:22.263Z",
      "id": 91036122,
      "buyer_id": null,
      "item_id": 4980206,
      "image": "item_4980206_1269537c6a.jpg"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Event type: `watchlisting`, `manual_bid`, `autobid` (based on i18n strings) |
| `created_at` | string | ISO 8601 timestamp |
| `id` | number | Event ID |
| `buyer_id` | number/null | Always null in observed data (anonymized) |
| `item_id` | number | Auctionet item ID |
| `image` | string | Image filename (relative to images.auctionet.com) |

**Note:** During off-hours, mostly `watchlisting` events. During active auctions, expect `manual_bid` and `autobid`.

### `shared-searches` — All Platform Searches (Live)

```json
[
  {
    "count": 13,
    "query": "Mid-Century",
    "ended": false,
    "category": "Ceramics & Porcelain",
    "company": null,
    "event": null,
    "theme": null,
    "company_group": null,
    "company_id": null,
    "showing_highlights": false,
    "time": 1774218184
  }
]
```

Array of recent search queries across the entire platform:

| Field | Type | Description |
|-------|------|-------------|
| `query` | string | Search text entered by buyer |
| `count` | number | Number of results found (0 = unmet demand!) |
| `ended` | boolean | `false` = searching live items, `true` = searching ended/sold items |
| `category` | string/null | Category filter applied (English name) |
| `company` | string/null | Auction house name filter |
| `company_id` | number/null | Auction house ID filter |
| `company_group` | string/null | Company group filter |
| `event` | string/null | Event filter |
| `theme` | string/null | Theme filter |
| `showing_highlights` | boolean | Whether highlighting is shown |
| `time` | number | Unix timestamp (seconds) |

**Key insight:** Searches with `count: 0` and `ended: false` represent **unmet demand** — buyers looking for something that doesn't exist on the platform.

### `sas_employees-searches` — Company-Filtered Searches

Same structure as `shared-searches`, but filtered to the auction house context. May overlap with shared searches.

### `shared-sessions` — Live Visitor Counts

```json
{ "buyers": 1540, "employees": 61 }
```

| Field | Type | Description |
|-------|------|-------------|
| `buyers` | number | Active buyer sessions right now |
| `employees` | number | Active employee sessions right now |

## Module: `modules/dashboard-api.js`

### Class: `DashboardAPI`

**Constructor:** No arguments. Initializes cache (5-min TTL) and widget type list.

### Core Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `fetchAll()` | `Promise<Object\|null>` | Fetch all widgets, returns normalized `{ hammered, auctions, newItems, ... }` |
| `fetchWidgets(types[])` | `Promise<Object\|null>` | Fetch specific widgets |
| `isAvailable()` | `boolean` | True if token configured and last fetch succeeded |

### Accessor Methods (cached, auto-fetch if expired)

| Method | Returns | Widget |
|--------|---------|--------|
| `getHammered()` | Object/null | `sas_employees-hammered` |
| `getAuctions()` | Object/null | `sas_employees-auctions` |
| `getNewItems()` | Object/null | `sas_employees-new_items` |
| `getCatalogerStats()` | Array/null | `sas_employees-cataloger_stats` |
| `getSessions()` | Object/null | `shared-sessions` |
| `getSearches()` | `{ shared, company }`/null | Both search streams |
| `getEvents()` | Object/null | `sas_employees-events` |

### Computed KPI Methods

All take a `data` object (output of `fetchAll()`):

| Method | Returns | Description |
|--------|---------|-------------|
| `computePipelineHealth(data)` | `{ intakeRate, publishRate, sellRate, relistRatio, backlogGrowth, bottleneck }` | Pipeline flow analysis |
| `computeReserveCoverage(data)` | `{ rate, count, total }` | % with bids over reserve |
| `computeRelistingRatio(data)` | `{ ratio }` | 7-day relisting % |
| `computeIntakeOutputBalance(data)` | `{ ratio, status, intake, output }` | Backlog direction |
| `computeDemandSignals(searches)` | `{ zeroResultTerms, topTerms, categoryDemand }` | Search demand analysis |
| `computeWeeklyTrends(data)` | `{ revenue, publishing, intake }` | 12-week arrays |
| `computeR12PerItem(data)` | number | Estimated avg hammer from R12 |
| `computeBuyerEngagement(data)` | `{ buyersPerLot, buyers, lots }` | Live buyers per lot |
| `getSearchTrends()` | `{ trending, zeroResult, topAllTime, snapshotCount }` | Historical search trends from storage |

### Normalized Property Names

The `_normalize()` method converts widget keys to camelCase:

| Widget Key | Normalized Name |
|------------|-----------------|
| `sas_employees-hammered` | `hammered` |
| `sas_employees-auctions` | `auctions` |
| `sas_employees-new_items` | `newItems` |
| `sas_employees-cataloger_stats` | `catalogerStats` |
| `sas_employees-photographer_stats` | `photographerStats` |
| `sas_employees-events` | `events` |
| `sas_employees-searches` | `sasEmployeesSearches` |
| `shared-searches` | `sharedSearches` |
| `shared-sessions` | `sharedSessions` |

## Integration Points

### Admin Dashboard (`admin-dashboard.js`)

Loaded via dynamic `import()` after PIN check. Renders three new sections:

1. **Realtidsöversikt** — R12, YTD, sessions, avg price, publishing rate, intake rate with sparklines
2. **Pipeline-hälsa** — Relisting ratio, reserve coverage, pipeline estimate, in/out balance
3. **Sökefterfrågan** — Live search terms, zero-result highlights, category demand

Auto-refreshes on tab visibility change (5-min minimum interval).

### Analytics Page (`analytics.js`)

Imported as ES module. Adds conditional "Realtid (Dashboard)" KPI row:
- R12 with 12-week sparkline
- YTD revenue
- Relisting ratio (7d)
- Reserve coverage

### Edit Page (`content-script.js`)

Imports `DashboardAPI` + `SearchRelevanceMatcher`. On page load:
1. Fetches live searches (single call, no polling)
2. Matches against item title/category/artist/keywords
3. Shows banner: "Köpare söker just nu: [terms]"

## Storage Keys

| Key | Storage | Description |
|-----|---------|-------------|
| `dashboardApiToken` | `chrome.storage.local` | Auth token (secret) |
| `dashboardSearchHistory` | `chrome.storage.local` | Accumulated search snapshots (max 168, 7 days) |

### Search History Snapshot Format

```json
{
  "timestamp": 1774218441000,
  "shared": [{ "q": "Mid-Century", "c": 13, "cat": "Ceramics", "ended": false }],
  "company": [{ "q": "Murano", "c": 20, "cat": "Glass", "ended": false }]
}
```

Captured hourly during business hours (7-20) by `dashboardSearchSnapshot` alarm in `background.js`.

## Background Service Worker (`background.js`)

### Message Handler: `dashboard-fetch`

```javascript
chrome.runtime.sendMessage({
  type: 'dashboard-fetch',
  widgets: ['sas_employees-hammered', 'sas_employees-auctions']
}, response => {
  // response: { success: true, data: { version, sources: {...} } }
  // or:       { success: false, error: 'message' }
});
```

- Reads token from storage, constructs URL, fetches with 10s timeout
- Returns raw API JSON (callers parse `sources`)

### Alarm: `dashboardSearchSnapshot`

- Fires every 60 minutes
- Only during `isBusinessHours()` (7-20)
- Fetches `shared-searches` + `sas_employees-searches`
- Appends compressed snapshot to `dashboardSearchHistory`
- Prunes entries older than 7 days, caps at 168 entries

## Checksum-Based Caching

Each widget response includes a `checksum` (opaque hex string). The `DashboardAPI` module caches `{ data, checksum, fetchedAt }` per widget. On re-fetch:

1. If `checksum` matches cached → skip processing, reuse cached data
2. If different → update cache with new data
3. Cache TTL: 5 minutes (accessor methods auto-refetch after expiry)

## Graceful Degradation

- All methods return `null` when token is not configured
- All callers check: `if (dashboardData) { ... }`
- Extension works fully without Dashboard API — all existing scraping remains
- No UI errors or broken layouts when API is unavailable

## Verified Widget Names

Only these prefixes return data:
- `sas_employees-*` — company-specific widgets
- `shared-*` — platform-wide widgets

Other prefixes (e.g., `sas-*`, `global-*`) return empty `sources: {}`.

Only the `sas/employees` dashboard view is accessible with the token. Other views (`sas/office`, `sas/tv`, `sas/management`, etc.) return login errors.
