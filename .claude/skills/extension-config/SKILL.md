---
name: extension-config
description: Configuration constants, storage patterns, model selection, AI rules, feature flags, and caching for the Auctionet Chrome extension. Use when changing models, adjusting thresholds, adding feature flags, modifying AI rules, or understanding where settings are stored.
user-invocable: false
---

# Extension Configuration Management

## Config File Locations

| File | Purpose |
|------|---------|
| `modules/config.js` | Central constants: models, URLs, API defaults, quality thresholds, feature flags |
| `modules/refactored/ai-rules-system/ai-rules-config.json` | AI rules SSOT: system prompts, category rules, forbidden words, brand corrections |
| `modules/enhance-all/tier-config.js` | Enhance All tier definitions: model, temperature, maxTokens per valuation tier |
| `popup.js` / `popup.html` | Settings UI, reads/writes to chrome.storage |
| `background.js` | Service worker, API key migration, publication scanner alarm config |

## chrome.storage.local vs chrome.storage.sync

**`chrome.storage.local`** — sensitive or device-specific data (not synced):

| Key | Type | Default | Set by |
|-----|------|---------|--------|
| `anthropicApiKey` | string | — | popup.js |
| `adminPinHash` | string | — | popup.js (SHA-256 of 4-digit PIN) |
| `enablePubScanner` | boolean | `false` | popup.js (opt-in) |
| `publicationScanResults` | object | — | publication-scanner-bg.js |
| `publicationScanStickyErrors` | object | — | publication-scanner-bg.js |
| `pubScanSpellCache` | object | — | publication-scanner-bg.js |
| `publicationScanIgnored` | object | — | admin-dashboard.js |
| `warehouseCostCache` | object | — | admin-dashboard.js |
| `analytics_{companyId}` | object | — | modules/analytics/data-cache.js |

**`chrome.storage.sync`** — user preferences (synced across devices):

| Key | Type | Default | Set by |
|-----|------|---------|--------|
| `enableArtistInfo` | boolean | `true` | popup.js |
| `showDashboard` | boolean | `true` | popup.js |
| `excludeCompanyId` | string | — | popup.js |
| `searchDefaults` | boolean | `true` | popup.js |
| `adminUnlocked` | boolean | `false` | popup.js |

**Why the split:** API key migrated from sync to local for security. PIN hash is local (security credential). Publication scan data is device-specific. Preferences sync so users get consistent settings everywhere.

## Model Selection

### CONFIG.MODELS (modules/config.js)

```
CONFIG.MODELS = {
  sonnet: { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', cost: 'Standard' },
  haiku:  { id: 'claude-haiku-4-5',  name: 'Claude Haiku 4.5',  cost: 'Budget' }
}
CONFIG.CURRENT_MODEL = 'sonnet'
```

Opus is not in CONFIG.MODELS — it is hardcoded directly where needed.

### Model-to-Task Mapping

| Model | Model ID | Tasks |
|-------|----------|-------|
| Opus 4.6 | `claude-opus-4-6` | Valuation requests, biography generation, maker context lookup (enrich tier), full-tier enhance-all |
| Sonnet 4.5 | `claude-sonnet-4-5` | Field enhancement (edit page), market analysis, cataloging, enrich-tier main call |
| Haiku 4.5 | `claude-haiku-4-5` | Brand validation, AI search query generation, API result validation, tidy-tier enhance-all, publication scan spellcheck |

### Fallback Logic

Opus tasks fall back to Sonnet on overload (429/overloaded errors):
- `valuation-request-assistant.js`: tries Opus, catches overload, retries with Sonnet
- `biography-kb-card.js`: same pattern
- `enhance-all-manager.js`: same pattern

No fallback from Sonnet→Haiku or Haiku→anything.

## Enhance All Tier Config (tier-config.js)

Tier determined by highest pricing field (estimate, upper estimate, accepted reserve):

| Tier | Label | Range | Model | maxTokens | Temperature |
|------|-------|-------|-------|-----------|-------------|
| `tidy` | Stada | < 3,000 SEK | Haiku | 2000 | 0.1 |
| `enrich` | Berika | 3,000–10,000 SEK | Sonnet (main) / Opus (maker context) | 2000 | 0.1 |
| `full` | Full | > 10,000 SEK | Opus | 3000 | 0.1 |

Default tier when no valuation: `tidy`.

## Temperature Settings

| Context | Temperature | Source |
|---------|-------------|--------|
| Default (CONFIG.API) | `0.15` | config.js |
| All enhance-all tiers | `0.1` | tier-config.js |
| Brand validation (Haiku) | `0` | brand-validation-manager.js |
| AI search query gen (Haiku) | `0.1` | ai-search-query-generator.js |
| Freetext parser (Sonnet) | `0.1` | ai-rules-config.json |
| Freetext parser (default) | `0.3` | ai-rules-config.json |

## Cache Expiry Settings

| Cache | TTL | Storage | Source |
|-------|-----|---------|--------|
| Auctionet API (market data) | 30 min | In-memory Map | auctionet-api.js |
| AI search query cache | 30 min | In-memory Map | ai-search-query-generator.js |
| Artist biography lookup | 14 days | In-memory Map | auctionet-artist-lookup.js |
| Analytics data | 24 hours | chrome.storage.local | analytics/data-cache.js |
| Warehouse cost cache | 12 hours | chrome.storage.local | admin-dashboard.js |
| Publication scan results | No TTL (overwritten each scan) | chrome.storage.local | publication-scanner-bg.js |

## Prompt Caching (cache_control ephemeral)

System prompts are wrapped with `cache_control: { type: 'ephemeral' }` in `api-manager.js`:

```js
const systemWithCache = [{
  type: 'text',
  text: systemPrompt,
  cache_control: { type: 'ephemeral' }
}];
```

The system prompt is ~3500 tokens and identical across calls, saving ~90% on input token cost.

## AI Rules Config Structure (ai-rules-config.json)

Version 2.0.0. Top-level sections:

- **`systemPrompts`** — Named templates: `core`, `titleCorrect`, `addItems`, `freetextParser`, `textEnhancement`
- **`categoryRules`** — Per-category AI behavior: `weapons`, `watches`, `historical`, `jewelry`, `furniture`, `rugs`, `silverGold`, `art`, `dinnerSets`, `freetextParser`
- **`fieldRules`** — Per-field constraints: `title` (maxLength, brandCorrections), `description`, `condition`, `keywords`
- **`validationRules`** — `forbiddenWords` (32 banned adjectives), `antiHallucination`, `antiAbbreviation`
- **`promptTemplates`** — Field-specific task instructions
- **`contextRules`** — Artist field behavior for title formatting

## Feature Flags (CONFIG.FEATURES)

- `enableQualityValidation`: `true`
- `enableHallucinationPrevention`: `true`

## Admin Mode (PIN Gate)

- 4-digit numeric PIN, stored as SHA-256 hash in `chrome.storage.local` key `adminPinHash`
- Unlock state in `chrome.storage.sync` key `adminUnlocked` (boolean)
- When locked: admin-only dashboard sections are hidden
- PIN can be changed via popup UI (requires current PIN)

## API Configuration Defaults (modules/config.js)

```
CONFIG.API = {
  maxTokens: 1500,
  temperature: 0.15,
  retryAttempts: 3
}
CONFIG.QUALITY = {
  minScoreForImprovement: 30,
  sparseDataThreshold: 40,
  criticalQualityThreshold: 20
}
```

Title-correct tasks override maxTokens to 500.
