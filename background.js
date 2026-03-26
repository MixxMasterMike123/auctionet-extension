import { runBackgroundPublicationScan, recheckStickyErrors, PUB_SCAN_STICKY_KEY } from './publication-scanner-bg.js';

// Background script startup

// One-time migration: move API key from sync to local storage (for security)
(async () => {
  try {
    if (!chrome?.storage?.local) return; // Guard against missing storage API
    const local = await chrome.storage.local.get(['anthropicApiKey']);
    if (!local.anthropicApiKey && chrome?.storage?.sync) {
      const sync = await chrome.storage.sync.get(['anthropicApiKey']);
      if (sync.anthropicApiKey) {
        await chrome.storage.local.set({ anthropicApiKey: sync.anthropicApiKey });
        await chrome.storage.sync.remove('anthropicApiKey');
      }
    }
  } catch (e) {
    // Non-critical: migration will retry on next startup
  }
})();

// ─── Publication Scanner Alarm ──────────────────────────────────────
// Runs a full publication queue scan every 30 minutes in the background,
// regardless of whether the dashboard tab is open.
// delayInMinutes: 1 ensures the first scan fires ~1 min after extension load/update.
// Use get() to avoid creating duplicate alarms on service worker restart.
chrome.alarms.get('publicationScan').then(existing => {
  if (!existing) chrome.alarms.create('publicationScan', { delayInMinutes: 1, periodInMinutes: 30 });
});
chrome.alarms.get('stickyErrorRecheck').then(existing => {
  if (!existing) chrome.alarms.create('stickyErrorRecheck', { delayInMinutes: 5, periodInMinutes: 20 });
});
chrome.alarms.get('dashboardSearchSnapshot').then(existing => {
  if (!existing) chrome.alarms.create('dashboardSearchSnapshot', { delayInMinutes: 10, periodInMinutes: 60 });
});

// Run an initial scan on extension install or update so data is fresh immediately
chrome.runtime.onInstalled.addListener(() => {
  runPublicationScanAndNotify();
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

async function runPublicationScanAndNotify({ skipCooldown = false } = {}) {
  try {
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
    // Manual "Kör nu" from dashboard UI — always runs, skips cooldown
    runPublicationScanAndNotify({ skipCooldown: true });
    sendResponse({ success: true });
    return false;
  } else if (request.type === 'fetch-admin-html') {
    handleAdminHtmlFetch(request, sendResponse);
    return true;
  } else if (request.type === 'dashboard-fetch') {
    handleDashboardFetch(request, sendResponse);
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
  return enqueue(() => _callAnthropicAPIInner(body, { apiKey, timeoutMs }));
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
    sendResponse({ success: true, html });
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
