---
name: bg-service-worker
description: Background service worker security boundary, Anthropic API routing, concurrency limiting, publication scanner alarms, and offscreen document pattern. Use when modifying API calls, adding message handlers, changing background tasks, or debugging service worker issues.
user-invocable: false
---

# Background Service Worker (background.js)

## Security Model

`background.js` is the **sole pathway** for all Anthropic API calls. Content scripts cannot call `https://api.anthropic.com` directly — they send Chrome runtime messages to the background service worker, which holds the API key and makes the fetch. This enforces:

- **Origin isolation**: The API key never leaves the service worker context (stored in `chrome.storage.local`, read only by background.js).
- **Sender verification**: Every incoming message is checked with `sender.id !== chrome.runtime.id` — messages from other extensions or web pages are rejected.
- **Domain allowlisting**: Image fetches are restricted to `ALLOWED_IMAGE_DOMAINS`: `images.auctionet.com`, `auctionet.com`, `upload.wikimedia.org`.

## API Key Storage

- Stored in `chrome.storage.local` under key `anthropicApiKey`.
- On startup, a one-time migration moves any key from `chrome.storage.sync` to `chrome.storage.local` (legacy migration).
- The popup can pass an unsaved key via `request.apiKey` for "Test Connection" before persisting.

## Message Handler Registry

All messages are handled in a single `chrome.runtime.onMessage.addListener`. Messages with `request.target === 'offscreen'` are skipped (they go to the offscreen document).

| `request.type` | Async | Handler | Purpose |
|---|---|---|---|
| `anthropic-fetch` | Yes | `handleAnthropicRequest` | All Claude API calls from content scripts |
| `wikipedia-fetch` | Yes | `handleWikipediaRequest` | Artist portrait lookup (sv.wikipedia then en.wikipedia) |
| `fetch-image-base64` | Yes | `handleFetchImageAsBase64` | Fetch image and convert to base64 for Claude vision |
| `run-publication-scan` | No | `runPublicationScanAndNotify(true)` | Manual scan trigger from dashboard |
| `ping` | No | immediate `{ success: true, message: 'pong' }` | Health check |

## Concurrency Limiter

Prevents Anthropic rate-limit errors with a queue-based concurrency cap.

- `MAX_CONCURRENT = 3` parallel Anthropic requests.
- `activeRequests` counter tracks in-flight calls.
- `requestQueue` array holds pending functions.
- `enqueue(fn)` wraps every API call: runs immediately if under limit, otherwise queues. On completion (`finally`), shifts and runs the next queued function.
- `callAnthropicAPI(body, options)` is the public entry point; it delegates to `enqueue(() => _callAnthropicAPIInner(...))`.

The publication scanner (`publication-scanner-bg.js`) accesses this via `globalThis.__callAnthropicAPI`, sharing the same concurrency pool.

## Timeout Handling

| Context | Timeout | Mechanism |
|---------|---------|-----------|
| Anthropic API | 30s (default, configurable via `timeoutMs`) | `AbortController` + `setTimeout` |
| Image fetch | 15s | `AbortController` |
| Wikipedia fetch | 8s | `AbortController` |

On abort, throws `"Request timed out after X seconds"`.

## Anthropic API Call Details

Headers sent on every request:
- `x-api-key`: The stored API key
- `anthropic-version`: `2023-06-01`
- `anthropic-dangerous-direct-browser-access`: `true`
- `anthropic-beta`: `prompt-caching-2024-07-31` (conditionally added when `body.system` contains `cache_control` blocks)

Endpoint: `https://api.anthropic.com/v1/messages`

## Publication Scanner Alarm System

Two Chrome alarms run periodic background scans:

| Alarm name | Initial delay | Period | Handler |
|---|---|---|---|
| `publicationScan` | 1 min | 30 min | `runPublicationScanAndNotify()` |
| `stickyErrorRecheck` | 5 min | 20 min | `runStickyRecheckAndNotify()` |

Both check `enablePubScanner` in `chrome.storage.local` before running (opt-in, default disabled). The manual `run-publication-scan` message bypasses this check (`skipEnabledCheck = true`).

An initial scan also fires on `chrome.runtime.onInstalled`.

After scan completion, `notifyDashboardTabs()` sends either `publication-scan-complete` or `publication-scan-failed` to all tabs matching `https://auctionet.com/admin/sas`. Sticky recheck sends `sticky-recheck-complete`.

## Offscreen Document Pattern

Service workers lack `DOMParser`. The publication scanner delegates HTML parsing to an offscreen document (`offscreen.html` / `offscreen.js`).

- `ensureOffscreen()` checks for existing contexts via `chrome.runtime.getContexts`, creates one if needed with reason `DOM_PARSER`.
- Messages to the offscreen doc use `request.target = 'offscreen'` (which background.js skips via its early-return guard).
- Offscreen message types: `parse-publishables`, `detect-pages`, `parse-show-page`, `parse-edit-page`.
- `closeOffscreen()` tears down the document after each scan to free resources.
- Only one offscreen document can exist at a time per extension.

## Wikipedia / External Request Handling

`handleWikipediaRequest` looks up artist info:
1. Tries Swedish Wikipedia first: `https://sv.wikipedia.org/api/rest_v1/page/summary/{name}`
2. Falls back to English Wikipedia.
3. Returns `imageUrl` (thumbnail), `description` (extract), and `pageUrl` if found.
4. Returns `{ success: true, imageUrl: null }` if no result (not an error).

## Error Handling Patterns

- All async handlers wrap in try/catch and call `sendResponse({ success: false, error: error.message })`.
- API errors parse the JSON body for `error.message`, falling back to `HTTP {status}: {statusText}`.
- Abort errors are caught by name (`error.name === 'AbortError'`) and converted to a readable timeout message.
- Publication scan failures notify dashboard tabs with `publication-scan-failed`.
- `notifyDashboardTabs` uses `.catch(() => {})` to silently ignore tabs that have no listener.
