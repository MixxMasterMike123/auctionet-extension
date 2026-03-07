---
name: Auctionet Extension Architecture
description: Code architecture reference for the Auctionet Chrome Extension — module system, dependency injection, message passing, initialization order, and Chrome APIs.
user-invocable: false
---

# Extension Architecture

## Key Constraints

- Manifest V3 Chrome extension
- No build step, no bundler, no frameworks — vanilla JS throughout
- ES6 modules loaded at runtime via `chrome.runtime.getURL()`
- All Anthropic API calls routed through the background service worker (security boundary)
- API key stored in `chrome.storage.local` (never synced, never exposed to content scripts)

## Module Loading Pattern

Content scripts are plain JS files declared in `manifest.json`. They cannot use static `import` statements because Chrome injects them into the page context. Instead, modules are loaded dynamically:

**Edit page (`content-script.js`)** uses `await import()` with `chrome.runtime.getURL()`:
```js
const { APIManager } = await import(chrome.runtime.getURL('modules/api-manager.js'));
```

**Add/Contract pages (`content.js`)** use fire-and-forget `import().then()` that attach classes to `window`:
```js
import('./modules/add-items-api-bridge.js').then(module => {
  window.AddItemsAPIBridge = module.AddItemsAPIBridge;
});
```

**Background service worker (`background.js`)** uses static ES6 `import` (declared as `"type": "module"` in manifest):
```js
import { runBackgroundPublicationScan } from './publication-scanner-bg.js';
```

All module files must be listed under `web_accessible_resources` in `manifest.json` to be importable from content scripts.

## Dependency Injection Pattern

Modules use setter-based DI, not constructor injection. Objects are instantiated first, then wired together via `set*()` methods:

```js
this.qualityAnalyzer = new QualityAnalyzer();
this.dataExtractor = new DataExtractor();
this.apiManager = new APIManager();

// Wire dependencies after construction
this.qualityAnalyzer.setDataExtractor(this.dataExtractor);
this.qualityAnalyzer.setApiManager(this.apiManager);
this.salesAnalysisManager.setSearchQuerySSoT(this.searchQuerySSoT);
this.dashboardManager.setApiManager(this.apiManager);
```

The wiring order matters -- some setters trigger initialization that depends on other references already being set. In `content-script.js`, the sequence is:
1. Instantiate all managers (`QualityAnalyzer`, `DataExtractor`, `APIManager`, `SearchQuerySSoT`, etc.)
2. Wire `QualityAnalyzer` dependencies first (data extractor, dashboard manager)
3. Wire `SearchQuerySSoT` to all components that share search state
4. Wire `SalesAnalysisManager` to `DashboardManager`
5. Set `apiManager` on `QualityAnalyzer` last (it propagates to sub-managers)
6. Wire `EnhanceAll` system
7. Call `init()` and `setupEventListeners()`

## Message Passing Architecture

```
Content Script  -->  chrome.runtime.sendMessage()  -->  Background Service Worker  -->  External API
                <--  sendResponse() callback         <--                              <--
```

All Claude API calls, image fetches, and Wikipedia lookups are routed through the background service worker. Content scripts never access external APIs directly.

See `bg-service-worker` skill for message types, security rules, concurrency limiting, and implementation details.

## Content Script URL Mapping

Defined in `manifest.json` `content_scripts` array. Multiple content scripts can run on the same page (e.g., an edit page loads both `content-script.js` and `comment-enhancer.js`).

| URL Pattern | Entry Point | `run_at` | Key Features |
|-------------|-------------|----------|--------------|
| `/admin/*/items/*/edit` | `content-script.js` | `document_idle` | Quality scoring, field enhancement, market analysis, enhance-all, artist detection |
| `/admin/sas/sellers/*/contracts/*` and `/admin/*/items/*` (excludes `/edit`) | `content.js` | `document_end` | Quick cataloging, tooltips, image analysis, freetext parser, artist detection |
| `/admin/sas/valuation_requests/*` | `valuation-request.js` | `document_end` | Multi-item valuation, email generation |
| `/admin/sas` (exact) | `admin-dashboard.js` | `document_end` | KPI cards, publication queue, comment feed |
| `/admin/*` (excludes `/admin/login*`) | `comment-enhancer.js` | `document_end` | Comment badges -- no AI, no module imports |

## Initialization Sequences

### Edit page (`content-script.js`)
1. Wait for `DOMContentLoaded` + 1s delay
2. Verify URL contains `/admin/*/items/*/edit` and DOM element `#item_title_sv` exists
3. `await import()` all modules (10+ dynamic imports via `chrome.runtime.getURL`)
4. Construct `AuctionetCatalogingAssistant` class -- wires all DI in constructor
5. Call `init()` (loads data, runs quality analysis) and `setupEventListeners()`
6. Expose instance as `window.auctionetAssistant` for cross-component communication

### Add/Contract pages (`content.js`)
1. Fire-and-forget `import().then()` calls attach classes to `window.*`
2. `AIRulesManager` instantiated immediately; polls its `loaded` flag every 200ms (up to 10s)
3. `PageDetector` watches for SPA hash navigation (`#new_item`)
4. Actual feature initialization happens when page type is confirmed by `PageDetector`

### Valuation request page (`valuation-request.js`)
1. URL regex gate: only activates on `/valuation_requests/\d+`
2. `Promise.all()` loads all required modules in parallel
3. Initialize `AddItemsAPIBridge` (creates its own `APIManager` instance)
4. Poll-wait for AI rules to be ready (up to 10s)
5. Construct `ValuationRequestAssistant` with the bridge's API manager, then call `init()`

### Admin dashboard (`admin-dashboard.js`)
1. URL regex gate: only activates on exact `/admin/sas` path
2. Admin PIN gate: checks `chrome.storage.sync` for `adminUnlocked` flag
3. Pure DOM scraping and rendering -- no module imports, no AI calls
4. Listens for background messages (`publication-scan-complete`, `publication-scan-failed`)

### Comment enhancer (`comment-enhancer.js`)
1. Excludes `/admin/sas` and `/admin/login` paths
2. No module imports -- self-contained IIFE
3. Scrapes DOM for comment sections, injects floating badge

## SPA Navigation Detection

`PageDetector` (used by `content.js`) handles Auctionet's SPA-style navigation:
- Watches `hashchange` events (e.g., navigating to `#new_item`)
- Uses `MutationObserver` to detect dynamically loaded form elements
- Tracks `lastInitializedHash` to avoid re-initialization on the same hash
- Returns `{ isSupported, type, needsRetry }` -- caller uses `needsRetry` to schedule delayed re-detection

## Chrome APIs Used

| API | Permission | Purpose |
|-----|-----------|---------|
| `chrome.runtime.sendMessage` / `onMessage` | (built-in) | Content script <-> background communication |
| `chrome.runtime.getURL` | (built-in) | Resolve module paths for dynamic `import()` |
| `chrome.storage.local` | `storage` | API key storage, publication scan cache, feature flags |
| `chrome.storage.sync` | `storage` | User preferences (artist info, dashboard visibility, admin PIN, search defaults) |
| `chrome.tabs.query` / `sendMessage` | `tabs` | Background notifies dashboard tabs of scan results |
| `chrome.alarms` | `alarms` | Periodic publication scans (30min) and sticky error rechecks (20min) |
| `chrome.runtime.onInstalled` | (built-in) | Run initial publication scan on install/update |

## Configuration

See `extension-config` skill for model definitions, API settings, quality thresholds, feature flags, prompt caching, and storage patterns.
