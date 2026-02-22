
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
// Register a periodic alarm to trigger publication queue scans every 2 hours
chrome.alarms.create('publicationScan', { periodInMinutes: 120 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'publicationScan') {
    // Send message to any open admin dashboard tab to trigger a scan
    chrome.tabs.query({ url: 'https://auctionet.com/admin/sas' }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type: 'trigger-publication-scan' }).catch(() => {
          // Tab may not have the content script active, ignore
        });
      });
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
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
  } else if (request.type === 'ping') {
    sendResponse({ success: true, message: 'pong' });
    return false;
  } else {
    return false;
  }
});

async function handleAnthropicRequest(request, sendResponse) {
  try {
    
    // Validate API key
    if (!request.apiKey) {
      console.error('No API key provided');
      sendResponse({ success: false, error: 'API key is required' });
      return;
    }

    
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
      const headers = {
        'Content-Type': 'application/json',
        'x-api-key': request.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      };

      // Enable prompt caching when system messages use cache_control blocks
      const body = request.body;
      if (body?.system && Array.isArray(body.system) && body.system.some(b => b.cache_control)) {
        headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
      }

      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        console.error('Anthropic API error:', errorMessage);
        sendResponse({ success: false, error: errorMessage });
        return;
      }

      const data = await response.json();
      sendResponse({ success: true, data });
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('Request timed out');
        sendResponse({ success: false, error: 'Request timed out after 30 seconds' });
      } else {
        throw fetchError;
      }
    }
    
  } catch (error) {
    console.error('Background script error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleFetchImageAsBase64(request, sendResponse) {
  try {
    const url = request.url;
    if (!url) {
      sendResponse({ success: false, error: 'URL is required' });
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
