---
name: valuation
description: Reference for auction item valuation logic, market data analysis, pricing strategies, and confidence scoring. Use when working on valuation features, market analysis dashboard, sales analysis, or valuation request pages.
argument-hint: "[topic or item type]"
---

# Auction Valuation & Market Analysis Reference

Use this skill when working on valuation logic, market data features, or pricing. Focus on: `$ARGUMENTS`

## Valuation Architecture in the Extension

### Data Flow
```
Item fields → SearchQuerySSoT → Auctionet API → Market metrics → Dashboard display
                                      ↓
                              AI relevance filtering (Haiku)
                                      ↓
                              Filtered market data → Median, range, trends
```

### Key Components
- **SearchQuerySSoT** (`modules/search-query-ssot.js`) — single source of truth for all search queries
- **SalesAnalysisManager** (`modules/sales-analysis-manager.js`) — fetches and processes market data
- **DashboardManagerV2** (`modules/dashboard-manager-v2.js`) — renders market analysis UI
- **AuctionetAPI** (`modules/auctionet-api.js`) — Auctionet public API wrapper
- **ValuationRequestAssistant** (`modules/valuation-request-assistant.js`) — valuation page logic

## Pricing Rules

### Reserve vs Estimate
- **Estimate** (uppskattat värde): expected market value based on comparables
- **Reserve** (utropspris): minimum starting bid, typically 60–80% of estimate
- **Minimum reserve**: 400 SEK (auction house rule)
- Reserve should be low enough to attract bidding but protect seller interest

### Valuation Approach (4-step)
1. **Object analysis** — identify type, material, artist, period, condition
2. **Market research** — search Auctionet historical data for comparables
3. **Valuation logic** — median of filtered comparables, adjusted for condition/quality
4. **Conclusion** — estimate with confidence level and reasoning

### Confidence Scoring (`auctionet-api.js` `calculateConfidence()`)
Cumulative scoring algorithm, base 0.5, floor 0.1, capped at 0.95:
- **Total matches**: +0.1 (20+), +0.2 (50+), +0.3 (100+), +0.4 (500+) — market coverage
- **Analyzed sales**: +0.05 (3+), +0.1 (5+), +0.15 (10+), +0.2 (20+) — sample quality
- **Recency**: +0.1 if >50% within 2 years, +0.15 if >70%
- **Artist match**: +0.1 if >50% match, +0.15 if >80%
- **Object type match**: +0.1 if >80% match object type

See `calculateConfidence()` in `modules/auctionet-api.js` for current thresholds.

### Data Filtering Pipeline
After fetching market data, results pass through two filters (see `auctionet-api` skill for details):
1. **AI relevance filtering** — Haiku validates each result when price spread >5x or sample >15 items
2. **IQR outlier removal** — standard 1.5x IQR fences, minimum 4 data points

### Valuation Suggestions (`sales-analysis-manager.js` `analyzeValuationSuggestions()`)
- Compares cataloger's estimate/upper estimate/reserve against market data
- 30% tolerance band — warns if cataloger's values fall outside
- 3x/0.3x extreme thresholds for clear over/under-valuation
- Positive feedback when valuation aligns with market

### Model Fallback
- Opus falls back to Sonnet when overloaded (429/overloaded errors)
- Applies to valuation requests and clustering

## Market Data Metrics

### Key Metrics Displayed
- **Median price** — middle value of comparable sales (more robust than mean)
- **Price range** — min to max of filtered comparables
- **Mean price** — average (shown alongside median)
- **Result count** — number of comparable sales found
- **Market status** — rising/stable/falling trend indicator
- **Historical change %** — YoY or period-over-period price movement

### Search Query Strategy
Terms are generated from multiple sources:
1. **AI-extracted** — Claude Sonnet extracts optimal search terms from title + description
2. **User-refined** — cataloger can toggle/add terms via interactive pills
3. **Artist name** — always quoted for exact matching in API
4. **Object type** — extracted from title (first word typically)

### Term Quoting
All search terms are force-quoted (Auctionet treats unquoted terms as optional). See `auctionet-api` skill for query syntax details.

## Valuation Request Pages

### Multi-Group Valuation Flow
1. Customer submits images + description via Auctionet website
2. Extension scrapes page for: customer name, email, images, description
3. AI clusters images into logical groups (e.g., 3 images = 1 item)
4. Cataloger can drag/drop images between groups, rename groups
5. Each group gets independent valuation with:
   - AI estimate from images + description
   - Market data override from Auctionet API comparables
   - Confidence score
6. Email template generated in Swedish or English

### Valuation Email Conventions
- Professional but warm tone
- Per-item breakdown with estimate range
- Disclaimer: estimates are not guarantees
- Next steps: how to consign items
- Language matches customer preference (Swedish default)

### AI Model Selection for Valuations
- **Opus** for valuation requests (highest accuracy for customer-facing content)
- **Sonnet** for quick cataloging valuations (balanced speed/quality)
- **Haiku** for relevance filtering of market data (speed critical)

## Common Valuation Pitfalls

### Over-valuation Risks
- AI tends to overvalue when it recognizes a famous maker/artist
- Always cross-reference with actual Auctionet hammer prices
- Condition significantly impacts value — a damaged piece by a famous maker can be worth less than a pristine unknown

### Under-valuation Risks
- Low/medium confidence should NOT automatically lead to low valuations
- Rare items may have few comparables but high value
- Consider: is it rare because it's undesirable, or because it's genuinely scarce?

### Market Data Interpretation
- Small sample size (<5 results): treat as indicative only
- Old data (>2 years): market may have shifted, weight recent results higher
- Outliers: single very high/low result can skew mean — median is more reliable
- Category matters: "stol" (chair) matches thousands — refine with style/period/maker
