---
name: improve-extension
description: Guide for improving the Auctionet extension — adding quality rules, tuning AI prompts, fixing spellchecker/brand validation, adding forbidden words, improving search term extraction, and improving condition suggestions. Use when the goal is to improve accuracy or quality of existing cataloging features, or when adding new quality rules or prompt improvements.
argument-hint: "[area to improve]"
---

# Improving the Auctionet Extension

Use this skill to systematically improve the extension's cataloging quality, AI accuracy, and user experience. Focus on: `$ARGUMENTS`

## Improvement Areas

### 1. Quality Rules (`modules/core/quality-rules-engine.js`)

The rules engine scores items on completeness and accuracy. To add a new rule:

1. **Identify the pattern** — what cataloging mistake are you catching?
2. **Check existing rules** — read `quality-rules-engine.js` to avoid duplicates
3. **Add the rule** with:
   - Clear warning message in Swedish
   - Appropriate severity (critical/high/medium/low)
   - Inline hint text that helps the cataloger fix it
   - Category-specific applicability if relevant
4. **Update scoring weights** if the new rule affects overall quality score
5. **Test** against real Auctionet listings to verify false positive rate

**Rule anatomy (actual pattern in quality-rules-engine.js):**
```javascript
// Rules use procedural if-statements, not declarative objects.
// Score starts at 100 and is deducted per issue.
if (/bruksslitage|bruksskick/i.test(condPlain)) {
  warnings.push({
    field: 'Kondition',
    issue: 'Byt ut "bruksslitage" mot en specifik term:',
    severity: 'medium',
    source: 'faq',
    fieldId: 'item_condition_sv',
    vagueCondition: true,
    inlineReplace: 'bruksslitage'
  });
  score -= 15;
}
```

### 2. AI Prompts (`modules/refactored/ai-rules-system/ai-rules-config.json`)

The centralized rules config controls all AI behavior. To improve prompts:

**Key prompt locations:**
- `systemPrompts.core` — base personality and forbidden language
- `systemPrompts.titleCorrect` — minimal title correction mode
- `systemPrompts.addItems` — quick cataloging enhancement
- `systemPrompts.freetextParser` — parsing unstructured text into fields
- `systemPrompts.textEnhancement` — combining image + text analysis
- `categoryRules.*` — per-category overrides (weapons, watches, jewelry, etc.)

**Prompt improvement checklist:**
- [ ] Does the prompt produce correct output for 10+ real items?
- [ ] Are there false positives where the AI "improves" correct text into something wrong?
- [ ] Is the forbidden language list comprehensive enough?
- [ ] Are anti-hallucination rules specific enough for the category?
- [ ] Is the temperature right? (lower = more consistent, higher = more creative)

**Model-specific tuning:**
See `extension-config` skill for current model IDs. Different models can have model-specific configs in `categoryRules.freetextParser.valuationRules`.

### 3. Brand & Spelling Validation

**Brand corrections** (`ai-rules-config.json` → `brandCorrections`):
- Maps common misspellings to correct brand names
- Add new entries when catalogers consistently misspell brands

**Swedish spellchecker** (`modules/swedish-spellchecker.js`):
- Custom dictionary of auction terms that standard spellcheckers flag incorrectly
- Add terms that get false-flagged (e.g., "fanerad", "intarsia", "proveniens")

**Artist corrections** — same pattern as brand corrections for artist names.

### 4. Market Analysis Accuracy

**Search term generation** (`modules/ai-search-query-generator.js`):
- Improve how the AI extracts optimal search terms from item data
- Key: balance between too specific (no results) and too broad (irrelevant results)

**Relevance filtering** (`modules/auctionet-api.js` → `validateResultRelevance()`):
- When price spread >5x or sample >15 items, Haiku validates relevance
- Improve the filtering prompt to reduce false positives/negatives

**Term processing** (`modules/core/term-processor.js`):
- Handles conflict resolution between overlapping search terms
- Improve deduplication and term ranking logic

### 5. Category Detection

**Current detection** — extracts from title keywords and Auctionet category field.
**Improvement opportunities:**
- Better mapping of Swedish terms to categories
- Use image analysis to supplement text-based detection
- Add new category-specific rules as patterns emerge

### 6. Condition Quality Nudging

Vague condition language is a common quality issue on Auctionet:
- **Expand suggestion chips** — more category-specific alternatives
- **Add severity scoring** — standalone "bruksslitage" scores lower than "bruksslitage, repor"
- **Track improvement** — measure if vague condition usage decreases over time
- **New vague terms** — monitor for new vague patterns in other languages (German, Danish, Spanish)

## How to Test Improvements

### Manual Testing Workflow
1. Navigate to an Auctionet admin item edit page
2. Enter test data in fields
3. Observe quality score, inline hints, market data
4. Verify AI suggestions are accurate and not hallucinated
5. Check that undo reverts all changes cleanly

### Key Test Cases
- Empty item (all fields blank) — should show low score, helpful hints
- Well-cataloged item — should show high score, minimal suggestions
- Item with "bruksslitage" condition — should flag and suggest alternatives
- Art with artist in title — should detect and offer "Flytta" action
- Item with misspelled brand — should catch and suggest correction
- Weapons/historical items — should NOT add fabricated historical context

### Performance Testing
- AI calls, quality scoring, and market data should resolve promptly with no visible UI lag
- Test with real Auctionet listings for representative performance

## Extension Architecture for Changes

### Where things live
```
New quality rule       → modules/core/quality-rules-engine.js
New AI prompt          → modules/refactored/ai-rules-system/ai-rules-config.json
New brand correction   → ai-rules-config.json → brandCorrections
New forbidden word     → ai-rules-config.json → forbiddenWords
New category handler   → modules/item-type-handlers.js
New spellcheck term    → modules/swedish-spellchecker.js
New search strategy    → modules/ai-search-query-generator.js + ai-search-rules.js
Market data / filtering→ modules/auctionet-api.js (validateResultRelevance, IQR outliers)
Market display change  → modules/dashboard-manager-v2.js
Valuation logic change → modules/valuation-request-assistant.js
Brand inline checking  → modules/inline-brand-validator.js (uses Haiku)
Model configuration    → modules/config.js
```

### Patterns to follow
See `extension-architecture` skill for DI pattern, module loading, and Chrome API usage. Key rules: always use `escapeHTML()` for DOM insertions, never let AI invent data not in source, mark system prompts with `cache_control: { type: 'ephemeral' }`.
