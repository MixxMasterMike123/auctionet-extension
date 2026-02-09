
// Background script startup

// One-time migration: move API key from sync to local storage (for security)
(async () => {
  try {
    const local = await chrome.storage.local.get(['anthropicApiKey']);
    if (!local.anthropicApiKey) {
      const sync = await chrome.storage.sync.get(['anthropicApiKey']);
      if (sync.anthropicApiKey) {
        await chrome.storage.local.set({ anthropicApiKey: sync.anthropicApiKey });
        await chrome.storage.sync.remove('anthropicApiKey');
      }
    }
  } catch (e) {
    console.error('API key migration error:', e);
  }
})();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request.type === 'anthropic-fetch') {
    // Handle async operation properly
    handleAnthropicRequest(request, sendResponse);
    return true; // Keep the message channel open for sendResponse
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
      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': request.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(request.body),
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
