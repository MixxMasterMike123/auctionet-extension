# HYPERRANK — opt-in search-rank optimizer for the edit-item page

**Status: planned 2026-07-19, approved strategy from Micke, not yet built.**

## What it is

A separate CTA on the edit-item page (`/admin/*/items/*/edit`). One press rewrites
title + description + hidden keywords hyper-focused on Auctionet search ranking.
Explicitly NOT the norm: normal Förbättra/Förbättra alla flows keep the compliant
rules; only HYPERRANK applies the aggressive strategy.

## Evidence base (verified 2026-07-19)

Micke's own testing: short focused title + description repeating title words in
different order + title words in hidden KWs → almost always top 5.

API probes confirmed (see memory `auctionet-search-ranking`):
- `items.json?q=` default order IS relevance order (identical to site `sort=score`) → **we can measure rank**
- Title matches outrank description/condition-only matches (clean boundary)
- Among title matches, shorter titles outrank longer (BM25 length norm)
- Stemming is partial: "stol" only sometimes surfaces "stolar", "fåtölj" never surfaced "fåtöljer" → write BOTH forms explicitly
- Hidden keywords are demonstrably searchable (hits with the term in no visible field)
- Repetition within one field saturates fast (k1) → repeat across fields, not within

Unknowable from outside (don't over-promise): exact boost values, possible
non-text boosts (bids/house/recency), per-category configs.

## The optimization recipe (becomes the prompt)

1. **TITLE** — shortest compliant form. 3–6 words: object noun first (per
   UPPERCASE/Proper-Case conventions, branch on artist field), then only the
   highest-buyer-intent qualifiers (brand/model/material). Every extra word
   dilutes every term.
2. **DESCRIPTION** — repeat the title's terms once, in different order, woven
   into natural Swedish; then all remaining facts (measurements, period,
   provenance). No within-field repetition (saturation). Keep FAQ-compliant
   structure.
3. **HIDDEN KEYWORDS** — title terms repeated + singular/plural variants
   (stemming is unreliable) + English equivalents (international buyers) +
   hyphenated multi-word phrases. Max 12 (validateAndLimitKeywords hard cap).
4. **Term selection input**: live buyer searches from Dashboard API
   (`getSearches()` + `SearchRelevanceMatcher`) fed into the prompt as "terms
   buyers are typing right now" — prefer targeting terms with proven demand.
   (`count` = result count, NOT search volume — do not misuse.)

## Rank check (the killer feature the probes unlocked)

Since API default order = relevance: after apply (and on demand), query
`items.json?q=<core title terms>` (live items) and report the item's actual
position: "Plats 3 av 212 för 'ring silver'". Caveats shown in UI: only works
once the item is published/indexed; reindex delay unknown; non-text boosts may
apply. Reuse auctionet-api.js fetch + cache conventions.

## Implementation map

| Piece | Where | Notes |
|---|---|---|
| CTA button/panel | new `modules/hyperrank/hyperrank-ui.js`, injected into `.grid-col4` after `.quality-indicator` | mirror enhance-all-ui pattern incl. id-guard; distinct styling so it reads as "special mode" |
| Click flow | content-script.js: new handler → `hyperrank()` | reuse `ensureApiKey`, multi-field `originalValues` undo capture from improveAllFields |
| New fieldType `'hyperrank'` | api-manager.js: `getUserPrompt` switch case + `parseClaudeResponse` branch (reuse TITEL:/BESKRIVNING:/SÖKORD: format) + content-script apply mapping | the 3-place dispatch gotcha — all three or silent failure |
| Prompt | new constant block in api-manager.js beside existing rule constants; shares cached system prompt; pulls CATEGORY_RULES; branches on artist for title case | explicitly overrides the "keywords must not repeat title" STRIKT REGEL for this fieldType only |
| Live-search context | fetch via existing dashboard-api singleton on demand; top ~10 matched searches into the user prompt | degrade gracefully when no Dashboard API token |
| Rank check | small function in hyperrank module using auctionet-api.js | before/after position display; 5-min cache |
| Quality-score conflict | none of the global rules change; hyperranked items will trip the keyword-uniqueness penalty — accepted, UI notes "Avsiktligt för HYPERRANK" | simplest correct resolution |
| Model | Sonnet (field-enhancement family) | no Opus precedent change |

## Out of scope (deliberate)

- Changing any normal enhancement prompt/rule
- Auto-applying without user press
- Claiming exact rank predictions (only measured positions post-publish)

## Effort

~1 session: UI module (~100 lines), prompt case (~80), rank check (~40),
wiring (~30). No new dependencies, no manifest changes (modules/* wildcard).
