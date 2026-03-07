---
name: auctionet-api
description: Auctionet public API reference — endpoints, query parameters, response shapes, pagination, and search patterns. Use when working on market analysis, sales data, artist lookup, analytics dashboard, live auction monitoring, or any code that fetches data from Auctionet.
user-invocable: false
---

# Auctionet API Reference

## Endpoints

All URLs defined in `modules/config.js`:

| Constant | URL | Purpose |
|----------|-----|---------|
| `AUCTIONET_API` | `https://auctionet.com/api/v2/items.json` | Structured item search (JSON) |
| `AUCTIONET_SEARCH` | `https://auctionet.com/sv/search` | Web search (HTML, used for deep links) |
| `AUCTIONET_ARTISTS` | `https://auctionet.com/sv/artists` | Artist lookup page (HTML) |
| `AUCTIONET_BASE` | `https://auctionet.com` | Base URL |

## Items API (`/api/v2/items.json`)

Primary endpoint used by `modules/auctionet-api.js` and `modules/analytics/data-fetcher.js`.

### Query Parameters

| Param | Type | Description | Example |
|-------|------|-------------|---------|
| `q` | string | Search query (supports quoted phrases and `artist:"Name"` syntax) | `q="Josef Frank" "byrå"` |
| `is` | string | Item state filter (omit for active/live items) | `is=ended` |
| `per_page` | number | Results per page (up to 200) | `per_page=200` |
| `page` | number | Pagination | `page=2` |
| `company_id` | number | Filter by auction house | `company_id=42` |
| `category_id` | number | Filter by category | `category_id=5` |

### Query Syntax
- **Quoted terms are required matches**: `"Josef Frank"` matches exact phrase
- **Unquoted terms are fuzzy/optional**: `byrå teak` may match partially
- **Artist prefix**: `artist:"Josef Frank"` searches specifically in artist field
- The extension force-quotes all terms via `ensureAllTermsQuoted()` and `SearchQuerySSoT.buildQuotedQuery()`
- Max 6 terms (capped by `ensureAllTermsQuoted`)
- Noise words filtered: `i, av, en, ett, och, med, för, den, det, som, till, på, ab, co, st, ca, mm, cm, kg, nr, a/s, as` (plus any term <2 chars)

### Response Shape (items array)

Field names as used by the codebase (verified against `auctionet-api.js` and `data-fetcher.js`):

```json
{
  "items": [
    {
      "id": 12345,
      "title": "BYRÅ, gustaviansk...",
      "description": "...",
      "condition": "...",
      "estimate": 5000,
      "upper_estimate": 8000,
      "bids": [{ "amount": 6500, "timestamp": "..." }],
      "hammered": true,
      "state": "ended",
      "ends_at": 1700000000,
      "starting_bid_amount": 2500,
      "next_bid_amount": 3000,
      "reserve_met": true,
      "reserve_amount": 4000,
      "currency": "SEK",
      "house": "Auction House Name",
      "company_id": 42,
      "category_id": 5,
      "location": "Stockholm"
    }
  ],
  "total": 150
}
```

### Key Response Fields

| Field | Usage |
|-------|-------|
| `bids[0].amount` | Final/current bid — primary price metric (NOT `end_price`) |
| `hammered` | Boolean — true if item sold |
| `state` | `"published"` (live), `"ended"` (completed) |
| `ends_at` | Unix timestamp in seconds (NOT ISO date) |
| `estimate` / `upper_estimate` | Auction house estimates for comparison |
| `company_id` | Used to exclude own company from comparisons |
| `house` | Auction house display name (NOT `company_name`) |
| `reserve_met` / `reserve_amount` | Reserve status for live market analysis |
| `starting_bid_amount` / `next_bid_amount` | Live auction bidding data |

## Search Strategies (in `modules/auctionet-api.js`)

The extension uses multiple search strategies with fallback:

1. **SSoT query** — user-selected or AI-generated search query (highest priority)
2. **Artist + object type** — `"Josef Frank" "byrå"` (most common)
3. **Artist only** — when specific object terms return too few results
4. **Object type + technique** — for items without a known artist
5. **Broad search** — last resort with minimal terms

### AI Relevance Filtering
When price spread >5x OR sample >15 items, Haiku validates each result's relevance to the original item. Located in `auctionet-api.js` `validateResultRelevance()`.

### Company Exclusion
Users set `ownCompanyId` in settings (their auction house ID). This excludes their own results from LIVE market searches. Stored in `chrome.storage.sync`. Cache is cleared when this setting changes. (Migrated from old `excludeCompanyId` key.)

### Result Caching
- In-memory `Map` cache with 30-minute expiry
- Cache key is the search query string

## Analytics Data (`modules/analytics/data-fetcher.js`)

Uses the same API with specialized fetch strategies:

| Strategy | Description | Scale |
|----------|-------------|-------|
| Direct pagination | `per_page=200`, up to 50 pages | Up to 10k items |
| Category sharding | Parallel fetches by `category_id` | Beyond 10k items |
| Incremental refresh | Fetches only new items vs cached IDs | Delta updates |

Uses `company_id` parameter to fetch per-company data. Concurrent fetches: 4 parallel category requests.

## Artist Lookup (`modules/auctionet-artist-lookup.js`)

### Artist Search
```
https://auctionet.com/sv/artists?q={artistName}
```
Returns HTML page — parsed with regex to extract artist entries.

### Artist Sales Count
```
https://auctionet.com/api/v2/items.json?q=artist:"{artistName}"&per_page=1
```
Uses the `total` field from response to get count without fetching full results.

## Admin Page Fetches (Background Service Worker)

The publication scanner fetches admin pages directly (requires active login session):

| URL | Purpose |
|-----|---------|
| `/admin/sas/publishables` | Publication queue list (paginated HTML) |
| `/admin/sas/publishables?page={n}` | Subsequent pages |
| `/admin/sas/items/{id}/edit` | Item edit page for deep quality scan |
| `/admin/sas/items/{id}` | Item show page for additional data |

These return HTML, parsed with string/regex matching in the service worker (no DOM available).

## Rate Limiting & Best Practices

- Auctionet's API has no documented rate limits, but be respectful
- The extension caches results for 30 minutes to minimize requests
- Publication scanner runs every 30 minutes (background alarm)
- Market analysis fetches are debounced (3-second delay after field changes)
- Max concurrent Anthropic API requests: 3 (rate limiter in `background.js`)

## Wikipedia API (for artist photos)

Used by `background.js` `handleWikipediaRequest`:
```
https://sv.wikipedia.org/api/rest_v1/page/summary/{artistName}
https://en.wikipedia.org/api/rest_v1/page/summary/{artistName}
```
Tries Swedish first, falls back to English. Returns `thumbnail.source` for artist portrait.
