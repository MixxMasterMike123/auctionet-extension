import { runBackgroundPublicationScan, recheckStickyErrors, PUB_SCAN_STICKY_KEY } from './publication-scanner-bg.js';

// Background script startup

// One-time migration: move API key from sync to local storage (for security)
(async () => {
  try {
    if (!chrome?.storage?.local) return; // Guard against missing storage API
    if (!chrome?.storage?.sync) return;
    const sync = await chrome.storage.sync.get(['anthropicApiKey']);
    if (!sync.anthropicApiKey) return;
    // Copy to local only if local is missing — never overwrite a newer local key
    const local = await chrome.storage.local.get(['anthropicApiKey']);
    if (!local.anthropicApiKey) {
      await chrome.storage.local.set({ anthropicApiKey: sync.anthropicApiKey });
    }
    // Always purge the synced copy so the key never lingers in sync storage
    await chrome.storage.sync.remove('anthropicApiKey');
  } catch (e) {
    // Non-critical: migration will retry on next startup
    console.warn('[Background] API key migration failed:', e);
  }
})();

// ─── Publication Scanner Alarm ──────────────────────────────────────
// Runs a full publication queue scan every 30 minutes in the background,
// regardless of whether the dashboard tab is open.
// delayInMinutes: 1 ensures the first scan fires ~1 min after extension load/update.
// Use get() to avoid creating duplicate alarms on service worker restart.
// The user's `enablePubScanner` preference (popup, default false) is authoritative.
async function isPubScannerEnabled() {
  try {
    const { enablePubScanner } = await chrome.storage.local.get(['enablePubScanner']);
    return enablePubScanner === true;
  } catch {
    return false;
  }
}

async function syncPubScannerAlarms() {
  if (await isPubScannerEnabled()) {
    const [scan, sticky] = await Promise.all([
      chrome.alarms.get('publicationScan'),
      chrome.alarms.get('stickyErrorRecheck'),
    ]);
    if (!scan) chrome.alarms.create('publicationScan', { delayInMinutes: 1, periodInMinutes: 30 });
    if (!sticky) chrome.alarms.create('stickyErrorRecheck', { delayInMinutes: 5, periodInMinutes: 20 });
  } else {
    await Promise.all([
      chrome.alarms.clear('publicationScan'),
      chrome.alarms.clear('stickyErrorRecheck'),
    ]);
  }
}

syncPubScannerAlarms();

// Toggling in the popup takes effect immediately, no service-worker restart needed
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && 'enablePubScanner' in changes) {
    syncPubScannerAlarms();
  }
});
chrome.alarms.get('dashboardSearchSnapshot').then(existing => {
  if (!existing) chrome.alarms.create('dashboardSearchSnapshot', { delayInMinutes: 10, periodInMinutes: 60 });
});
// Run an initial scan on extension install or update so data is fresh immediately
// (only when the user has enabled the publication scanner)
chrome.runtime.onInstalled.addListener(async () => {
  // HYPERRANK experiment removed 2026-09-07: drop its persisted alarm and local data
  chrome.alarms.clear('hyperrankOutcomeCollection');
  chrome.storage.local.remove(['hyperrankedItems', 'hyperrankOutcomes', 'rescueObserved', 'rescueControlOutcomes', 'hyperrankSyncUrl', 'hyperrankSyncToken', 'hyperrankMachineLabel']);
  await syncPubScannerAlarms();
  if (await isPubScannerEnabled()) runPublicationScanAndNotify();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'publicationScan') {
    runPublicationScanAndNotify();
  } else if (alarm.name === 'stickyErrorRecheck') {
    runStickyRecheckAndNotify();
  } else if (alarm.name === 'dashboardSearchSnapshot') {
    captureDashboardSearchSnapshot();
  }
});

let lastScanTime = 0;
const SCAN_COOLDOWN_MS = 10 * 60 * 1000; // 10 min during business hours
const SCAN_COOLDOWN_OFF_HOURS_MS = 2 * 60 * 60 * 1000; // 2 hours off-hours

function isBusinessHours() {
  const h = new Date().getHours();
  return h >= 7 && h < 20; // 07:00–19:59
}

async function runPublicationScanAndNotify({ skipCooldown = false, manual = false } = {}) {
  try {
    // Defence in depth: automatic runs respect the preference; manual "Kör nu" always runs
    if (!manual && !(await isPubScannerEnabled())) return;
    const cooldown = isBusinessHours() ? SCAN_COOLDOWN_MS : SCAN_COOLDOWN_OFF_HOURS_MS;
    if (!skipCooldown && Date.now() - lastScanTime < cooldown) {
      return; // Recently scanned — skip
    }
    lastScanTime = Date.now();
    const result = await runBackgroundPublicationScan();
    notifyDashboardTabs(result ? 'publication-scan-complete' : 'publication-scan-failed');
  } catch (e) {
    console.error('[Background] Publication scan failed:', e);
    notifyDashboardTabs('publication-scan-failed');
  }
}

async function runStickyRecheckAndNotify() {
  try {
    if (!(await isPubScannerEnabled())) return;
    const result = await recheckStickyErrors();
    if (result) {
      notifyDashboardTabs('sticky-recheck-complete');
    }
  } catch (e) {
    console.error('[Background] Sticky recheck failed:', e);
  }
}

async function captureDashboardSearchSnapshot() {
  if (!isBusinessHours()) return; // Only capture during business hours

  try {
    const stored = await chrome.storage.local.get(['dashboardApiToken']);
    if (!stored.dashboardApiToken) return; // No token — skip silently

    const url = `https://dashboard.auctionet.com/sources?types=shared-searches,sas_employees-searches&token=${encodeURIComponent(stored.dashboardApiToken)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) return;

    const json = await response.json();
    const sharedSearches = json.sources?.['shared-searches']?.data || [];
    const companySearches = json.sources?.['sas_employees-searches']?.data || [];

    const snapshot = {
      timestamp: Date.now(),
      shared: sharedSearches.map(s => ({ q: s.query, c: s.count, cat: s.category, ended: s.ended })),
      company: companySearches.map(s => ({ q: s.query, c: s.count, cat: s.category, ended: s.ended }))
    };

    // Append to history, prune entries older than 7 days (max 168 snapshots)
    const historyResult = await chrome.storage.local.get(['dashboardSearchHistory']);
    const history = historyResult.dashboardSearchHistory || [];
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const pruned = history.filter(h => h.timestamp > sevenDaysAgo);
    pruned.push(snapshot);

    // Cap at 168 entries (7 days × 24 hours)
    const capped = pruned.length > 168 ? pruned.slice(-168) : pruned;
    await chrome.storage.local.set({ dashboardSearchHistory: capped });
  } catch (e) {
    // Non-critical: snapshot missed, will retry next hour
    console.warn('[Background] Dashboard search snapshot failed:', e);
  }
}

function notifyDashboardTabs(messageType) {
  chrome.tabs.query({ url: 'https://auctionet.com/admin/sas' }, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { type: messageType }).catch(() => {});
    });
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Skip messages targeted at the offscreen document
  if (request.target === 'offscreen') return false;

  // Security: Only accept messages from this extension's own scripts
  if (sender.id !== chrome.runtime.id) return false;

  if (request.type === 'anthropic-fetch') {
    // Handle async operation properly
    handleAnthropicRequest(request, sendResponse);
    return true; // Keep the message channel open for sendResponse
  } else if (request.type === 'wikipedia-fetch') {
    handleWikipediaRequest(request, sendResponse);
    return true;
  } else if (request.type === 'fetch-image-base64') {
    handleFetchImageAsBase64(request, sendResponse);
    return true;
  } else if (request.type === 'run-publication-scan') {
    // "Kör nu" from dashboard UI always runs (even if auto-scanner disabled) and skips
    // cooldown. The dashboard's idle-tab auto-rescan sends `auto: true` and must respect
    // the enablePubScanner setting like every other automatic run.
    runPublicationScanAndNotify({ skipCooldown: true, manual: !request.auto });
    sendResponse({ success: true });
    return false;
  } else if (request.type === 'fetch-admin-html') {
    handleAdminHtmlFetch(request, sendResponse);
    return true;
  } else if (request.type === 'dashboard-fetch') {
    handleDashboardFetch(request, sendResponse);
    return true;
  } else if (request.type === 'outlet-fetch') {
    handleOutletFetch(request, sendResponse);
    return true;
  } else if (request.type === 'spellcheck-fetch') {
    handleSpellcheckFetch(request, sendResponse);
    return true;
  } else if (request.type === 'outlet-upload-image') {
    handleOutletUploadImage(request, sendResponse);
    return true;
  } else if (request.type === 'ping') {
    sendResponse({ success: true, message: 'pong' });
    return false;
  } else {
    return false;
  }
});

// ─── Shared Anthropic API caller ─────────────────────────────────────
// Single pathway for all Claude API calls — used by both message handler
// and publication scanner (which runs in the same service worker).

// Concurrency limiter: max 3 parallel Anthropic requests to avoid rate-limit errors
const MAX_CONCURRENT = 3;
let activeRequests = 0;
const requestQueue = [];

function enqueue(fn) {
  return new Promise((resolve, reject) => {
    const run = () => {
      activeRequests++;
      fn().then(resolve, reject).finally(() => {
        activeRequests--;
        if (requestQueue.length > 0) requestQueue.shift()();
      });
    };
    if (activeRequests < MAX_CONCURRENT) {
      run();
    } else {
      requestQueue.push(run);
    }
  });
}

async function callAnthropicAPI(body, { apiKey = null, timeoutMs = 30000 } = {}) {
  const sanitized = sanitizeForClaude5(body);
  const data = await enqueue(() => _callAnthropicAPIInner(sanitized, { apiKey, timeoutMs }));
  return stripThinkingBlocks(data);
}

async function _callAnthropicAPIInner(body, { apiKey = null, timeoutMs = 30000 } = {}) {
  // Resolve API key: use provided key or read from storage
  if (!apiKey) {
    try {
      const stored = await chrome.storage.local.get(['anthropicApiKey']);
      apiKey = stored.anthropicApiKey || null;
    } catch (e) { /* storage read failed */ }
  }
  if (!apiKey) {
    throw new Error('API key is required. Set it in the extension popup.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    };

    // Enable prompt caching when system messages use cache_control blocks
    if (body?.system && Array.isArray(body.system) && body.system.some(b => b.cache_control)) {
      headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000} seconds`);
    }
    throw error;
  }
}

// Export for publication-scanner-bg.js (same service worker)
globalThis.__callAnthropicAPI = callAnthropicAPI;

// Claude 5-family models reject `temperature`/`top_p`/`top_k` (400) and run
// adaptive thinking when `thinking` is omitted — which would eat the small
// max_tokens budgets our short JSON calls use. Sanitize once here at the single
// API gateway so every module keeps its tuned request shape without per-site
// conditionals. How "no thinking" is expressed differs per model:
//   - Opus 5.5 / Fable: thinking is always on (`disabled` → 400). Lowest cost is
//     adaptive thinking at effort `low`; callers may pass their own output_config.
//   - Sonnet 5.5: `disabled` → 400; `{type:'between_tools'}` is the thinking-off
//     setting (effort ≤ high, no other fields).
//   - Haiku 5.5 (and Opus 5 / Sonnet 5): `{type:'disabled'}` is accepted.
const ALWAYS_THINKING_MODEL = /^claude-(opus-5-5|fable|mythos)/;
const BETWEEN_TOOLS_MODEL = /^claude-sonnet-5-5/;

function sanitizeForClaude5(body) {
  if (!body || !/^claude-(opus|sonnet|fable|mythos|haiku)-5/.test(body.model || '')) return body;
  const sanitized = { ...body };
  delete sanitized.temperature;
  delete sanitized.top_p;
  delete sanitized.top_k;
  const model = sanitized.model;
  if (ALWAYS_THINKING_MODEL.test(model)) {
    if (sanitized.thinking?.type === 'disabled' || sanitized.thinking?.type === 'enabled') delete sanitized.thinking;
    if (!sanitized.output_config) sanitized.output_config = { effort: 'low' };
  } else if (BETWEEN_TOOLS_MODEL.test(model)) {
    if (!sanitized.thinking || sanitized.thinking.type === 'disabled') sanitized.thinking = { type: 'between_tools' };
  } else if (!sanitized.thinking) {
    sanitized.thinking = { type: 'disabled' };
  }
  return sanitized;
}

// Always-thinking models return `thinking` blocks before the text block. Our
// modules read `content[0].text` and never replay thinking blocks, so drop them
// here to keep the response shape the modules expect.
function stripThinkingBlocks(data) {
  if (!Array.isArray(data?.content)) return data;
  const content = data.content.filter(b => b?.type !== 'thinking' && b?.type !== 'redacted_thinking');
  return content.length === data.content.length ? data : { ...data, content };
}

async function handleAnthropicRequest(request, sendResponse) {
  try {
    // Security: popup may send an unsaved key for "Test Connection" (before saving).
    const data = await callAnthropicAPI(request.body, { apiKey: request.apiKey || null });
    sendResponse({ success: true, data });
  } catch (error) {
    console.error('Anthropic API error:', error.message);
    sendResponse({ success: false, error: error.message });
  }
}

const ALLOWED_IMAGE_DOMAINS = ['images.auctionet.com', 'auctionet.com', 'upload.wikimedia.org'];

async function handleFetchImageAsBase64(request, sendResponse) {
  try {
    const url = request.url;
    if (!url) {
      sendResponse({ success: false, error: 'URL is required' });
      return;
    }

    // Security: only allow fetching images from trusted domains
    try {
      const parsed = new URL(url);
      if (!ALLOWED_IMAGE_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d))) {
        sendResponse({ success: false, error: 'Domain not allowed' });
        return;
      }
    } catch (e) {
      sendResponse({ success: false, error: 'Invalid URL' });
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      sendResponse({ success: false, error: `HTTP ${response.status}` });
      return;
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Convert to base64 in chunks to avoid call stack issues
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    const base64 = btoa(binary);

    sendResponse({
      success: true,
      base64,
      mediaType: contentType.split(';')[0].trim(),
      byteSize: arrayBuffer.byteLength
    });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleAdminHtmlFetch(request, sendResponse) {
  try {
    const { url } = request;
    if (!url || !url.startsWith('https://auctionet.com/admin/')) {
      sendResponse({ success: false, error: 'URL must be an auctionet.com admin URL' });
      return;
    }
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    // finalUrl: where the request landed after redirects — lets callers resolve
    // canonical admin routes (e.g. /admin/sas/items/<id> → seller/contract path)
    sendResponse({ success: true, html, finalUrl: response.url });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleDashboardFetch(request, sendResponse) {
  try {
    const { widgets } = request;
    if (!widgets || !Array.isArray(widgets) || widgets.length === 0) {
      sendResponse({ success: false, error: 'widgets array is required' });
      return;
    }

    // Read token from secure storage (content scripts never see the token)
    const stored = await chrome.storage.local.get(['dashboardApiToken']);
    const token = stored.dashboardApiToken;
    if (!token) {
      sendResponse({ success: false, error: 'Dashboard token not configured. Set it in extension popup.' });
      return;
    }

    const url = `https://dashboard.auctionet.com/sources?types=${widgets.join(',')}&token=${encodeURIComponent(token)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      sendResponse({ success: false, error: `Dashboard API HTTP ${response.status}` });
      return;
    }

    const data = await response.json();
    sendResponse({ success: true, data });
  } catch (error) {
    sendResponse({ success: false, error: error.name === 'AbortError' ? 'Dashboard API timeout (10s)' : error.message });
  }
}

// ─── SaS Outlet data API core (Cloudflare Worker + D1 + R2) ───────────
// Replaces the previous Supabase PostgREST/Storage calls. All outlet writes
// go through the sas-outlet-api Worker (workers/outlet-api), authenticated
// with a bearer token that never reaches content scripts.
//
// `path` is a Worker route like '/items', '/sellers' or '/items/12345'.
// 404 responses return null (existence-check miss), other errors throw.

async function outletApiFetch(method, path, body = null) {
  const stored = await chrome.storage.local.get(['outletApiUrl', 'outletApiToken']);
  if (!stored.outletApiUrl || !stored.outletApiToken) {
    throw new Error('SaS Outlet ej konfigurerad');
  }

  const url = `${stored.outletApiUrl.replace(/\/$/, '')}${path}`;
  const fetchOpts = {
    method,
    headers: {
      'Authorization': `Bearer ${stored.outletApiToken}`,
      'Content-Type': 'application/json'
    }
  };
  if (body && method !== 'GET') {
    fetchOpts.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOpts);

  // For GET lookups a 404 is a normal "does not exist" signal — return null.
  // For writes (POST/PUT) a 404 means the route doesn't exist, i.e. the
  // configured URL points at the wrong Worker — that must fail loudly.
  if (response.status === 404 && method === 'GET') return null;
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Outlet API HTTP ${response.status} (${url}): ${errorText.slice(0, 300)}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// ─── Spellcheck shared backend (Cloudflare Worker + D1) ─────────────
// Replaces the previous Supabase-backed shared spellcheck store. The Worker
// runs open (rate-limited + validated) until its SPELLCHECK_API_TOKEN secret is
// set; after that every non-health request needs the bearer token stored as
// `spellcheckWorkerToken` (popup). The SaS-Outlet Supabase system above is a
// separate concern and is left untouched.
//
// `path` is a Worker route like '/cache?item_id=1&hash=abc' or '/ignored'.
async function spellcheckFetch(method, path, body = null) {
  const { spellcheckWorkerUrl, spellcheckWorkerToken } =
    await chrome.storage.local.get(['spellcheckWorkerUrl', 'spellcheckWorkerToken']);
  if (!spellcheckWorkerUrl) {
    throw new Error('Spellcheck-backend ej konfigurerad');
  }

  const url = `${spellcheckWorkerUrl.replace(/\/$/, '')}${path}`;
  const fetchOpts = { method, headers: { 'Content-Type': 'application/json' } };
  // Optional bearer token — required once the Worker's SPELLCHECK_API_TOKEN secret is set.
  if (spellcheckWorkerToken) {
    fetchOpts.headers.Authorization = `Bearer ${spellcheckWorkerToken}`;
  }
  if (body && method !== 'GET') {
    fetchOpts.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOpts);
  // 404 is a normal "cache miss" signal, not an error — return null.
  if (response.status === 404) return null;
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spellcheck backend HTTP ${response.status}: ${errorText}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// Expose for publication-scanner-bg.js (same service worker, no messaging needed)
globalThis.__spellcheckFetch = spellcheckFetch;

// Message handler so content scripts (admin-dashboard.js) can reach the backend.
async function handleSpellcheckFetch(request, sendResponse) {
  try {
    const { method, path, body } = request;
    if (!method || !path) {
      sendResponse({ success: false, error: 'method and path required' });
      return;
    }
    const data = await spellcheckFetch(method, path, body);
    sendResponse({ success: true, data });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

// ─── Outlet message handler (content scripts → background) ───────────
// Routes outlet API requests through background.js so the bearer token
// never reaches content scripts. Same security pattern as Anthropic API key.

async function handleOutletFetch(request, sendResponse) {
  try {
    const { method, path, body } = request;
    if (!method || !path) {
      sendResponse({ success: false, error: 'method and path required' });
      return;
    }

    const data = await outletApiFetch(method, path, body);
    sendResponse({ success: true, data });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

// ─── Outlet image upload handler (SaS Outlet) ────────────────────────
// The Worker fetches the image from the Auctionet CDN itself and stores it
// in R2 — the extension only sends the source URL, no image bytes.

async function handleOutletUploadImage(request, sendResponse) {
  try {
    const { sourceUrl, itemId, imageType } = request;
    if (!sourceUrl || !itemId || !imageType) {
      sendResponse({ success: false, error: 'sourceUrl, itemId, and imageType required' });
      return;
    }

    const data = await outletApiFetch('PUT', `/images/${itemId}/${imageType}`, { sourceUrl });
    if (data?.publicUrl) {
      sendResponse({ success: true, publicUrl: data.publicUrl });
    } else {
      sendResponse({ success: false, error: 'Image upload failed' });
    }
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleWikipediaRequest(request, sendResponse) {
  try {
    const artistName = request.artistName;
    if (!artistName) {
      sendResponse({ success: false, error: 'Artist name required' });
      return;
    }

    const encodedName = encodeURIComponent(artistName.replace(/\s+/g, '_'));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    // Try Swedish Wikipedia first, then English
    const wikis = [
      `https://sv.wikipedia.org/api/rest_v1/page/summary/${encodedName}`,
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodedName}`
    ];

    for (const url of wikis) {
      try {
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          signal: controller.signal
        });
        if (response.ok) {
          const data = await response.json();
          if (data.thumbnail?.source) {
            clearTimeout(timeoutId);
            sendResponse({
              success: true,
              imageUrl: data.thumbnail.source,
              description: data.extract || null,
              pageUrl: data.content_urls?.desktop?.page || null
            });
            return;
          }
        }
      } catch (e) {
        // Try next wiki
      }
    }

    clearTimeout(timeoutId);
    sendResponse({ success: true, imageUrl: null });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}
