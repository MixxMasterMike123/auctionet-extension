
// Background script startup
console.log('Auctionet AI Assistant background script loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received message:', request.type);
  
  if (request.type === 'anthropic-fetch') {
    // Handle async operation properly
    handleAnthropicRequest(request, sendResponse);
    return true; // Keep the message channel open for sendResponse
  } else if (request.type === 'ping') {
    console.log('Ping received, sending pong');
    sendResponse({ success: true, message: 'pong' });
    return false;
  } else {
    console.log('Unknown message type:', request.type);
    return false;
  }
});

async function handleAnthropicRequest(request, sendResponse) {
  try {
    console.log('Processing Anthropic API request...');
    
    // Validate API key
    if (!request.apiKey) {
      console.error('No API key provided');
      sendResponse({ success: false, error: 'API key is required' });
      return;
    }

    console.log('Making request to Anthropic API...');
    
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
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
      console.log('Anthropic API response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        console.error('Anthropic API error:', errorMessage);
        sendResponse({ success: false, error: errorMessage });
        return;
      }

      const data = await response.json();
      console.log('Anthropic API success, sending response back');
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
