// popup.js - Popup interface for API key management and status
document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('api-key');
  const saveButton = document.getElementById('save-key');
  const testButton = document.getElementById('test-connection');
  const statusContainer = document.getElementById('status-container');
  const extensionStatus = document.getElementById('extension-status');
  const modelSelect = document.getElementById('model-select');
  const saveModelButton = document.getElementById('save-model');
  const modelDescription = document.getElementById('model-description');
  const enableArtistInfoCheckbox = document.getElementById('enable-artist-info');
  const showDashboardCheckbox = document.getElementById('show-dashboard');
  const excludeCompanyInput = document.getElementById('exclude-company-id');
  const saveExcludeCompanyButton = document.getElementById('save-exclude-company');

  // Load existing API key, model, and settings
  await loadApiKey();
  await loadModelSelection();
  await loadArtistInfoSetting();
  await loadShowDashboardSetting();
  await loadExcludeCompanySetting();
  
  // Check extension status
  await checkExtensionStatus();

  // Event listeners
  saveButton.addEventListener('click', saveApiKey);
  testButton.addEventListener('click', testConnection);
  saveModelButton.addEventListener('click', saveModelSelection);
  modelSelect.addEventListener('change', updateModelDescription);
  enableArtistInfoCheckbox.addEventListener('change', saveArtistInfoSetting);
  showDashboardCheckbox.addEventListener('change', saveShowDashboardSetting);
  saveExcludeCompanyButton.addEventListener('click', saveExcludeCompanySetting);
  apiKeyInput.addEventListener('input', () => {
    clearStatus();
  });

  async function loadApiKey() {
    try {
      const result = await chrome.storage.sync.get(['anthropicApiKey']);
      if (result.anthropicApiKey) {
        apiKeyInput.value = result.anthropicApiKey;
        // Don't auto-test on load, just show that key was loaded
        console.log('API key loaded from storage');
      }
    } catch (error) {
      showStatus('Error loading API key: ' + error.message, 'error');
    }
  }

  async function saveApiKey() {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      showStatus('Please enter an API key', 'error');
      return;
    }

    if (!apiKey.startsWith('sk-ant-api03-')) {
      showStatus('Invalid API key format. Should start with "sk-ant-api03-"', 'error');
      return;
    }

    try {
      saveButton.disabled = true;
      saveButton.textContent = 'Saving...';

      await chrome.storage.sync.set({ anthropicApiKey: apiKey });
      showStatus('API key saved successfully! Click "Test Connection" to verify it works.', 'success');
      
      // Notify all tabs to refresh their API key
      try {
        const tabs = await chrome.tabs.query({ url: 'https://auctionet.com/*' });
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { type: 'refresh-api-key' }).catch(() => {
            // Ignore errors for tabs that don't have the content script
          });
        }
      } catch (error) {
        console.log('Could not notify tabs:', error);
      }
      
    } catch (error) {
      showStatus('Error saving API key: ' + error.message, 'error');
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = 'Save API Key';
    }
  }

  async function testApiKey(apiKey) {
    try {
      console.log('Testing API key...');
      
      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Request timeout - background script may not be responding'));
        }, 10000); // 10 second timeout
        
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: apiKey,
          body: {
            model: 'claude-3-5-haiku-20241022', // Use Haiku for testing (cheaper)
            max_tokens: 10,
            messages: [{
              role: 'user',
              content: 'Test'
            }]
          }
        }, (response) => {
          clearTimeout(timeout);
          
          if (chrome.runtime.lastError) {
            console.error('Chrome runtime error:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!response) {
            reject(new Error('No response received from background script'));
          } else {
            console.log('Received response:', response);
            resolve(response);
          }
        });
      });

      if (response.success) {
        showStatus('✅ API key is valid and working!', 'success');
        updateExtensionStatus('ready');
      } else {
        showStatus('❌ API key test failed: ' + response.error, 'error');
        updateExtensionStatus('error');
      }
    } catch (error) {
      console.error('API key test error:', error);
      showStatus('❌ API key test failed: ' + error.message, 'error');
      updateExtensionStatus('error');
    }
  }

  async function checkExtensionStatus() {
    try {
      // Check if we're on the right page
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('auctionet.com')) {
        updateExtensionStatus('wrong-page');
        return;
      }

      if (!tab.url.includes('/admin/') || !tab.url.includes('/items/') || !tab.url.includes('/edit')) {
        updateExtensionStatus('wrong-page');
        return;
      }

      // Check if API key is set
      const result = await chrome.storage.sync.get(['anthropicApiKey']);
      if (!result.anthropicApiKey) {
        updateExtensionStatus('no-api-key');
        return;
      }

      updateExtensionStatus('ready');
      
    } catch (error) {
      updateExtensionStatus('error');
    }
  }

  function updateExtensionStatus(status) {
    let statusHtml = '';
    
    switch (status) {
      case 'ready':
        statusHtml = '<div class="status success"><strong>✅ Ready to use!</strong><br>Extension is active on this page.</div>';
        break;
      case 'wrong-page':
        statusHtml = '<div class="status warning"><strong>⚠️ Wrong page</strong><br>Navigate to an Auctionet item edit page to use the extension.</div>';
        break;
      case 'no-api-key':
        statusHtml = '<div class="status error"><strong>❌ No API key</strong><br>Please enter your Anthropic API key above.</div>';
        break;
      case 'error':
        statusHtml = '<div class="status error"><strong>❌ Error</strong><br>There was an error checking the extension status.</div>';
        break;
      default:
        statusHtml = '<div class="status warning"><strong>Checking...</strong></div>';
    }
    
    extensionStatus.innerHTML = statusHtml;
  }

  function showStatus(message, type) {
    statusContainer.innerHTML = `<div class="status ${type}">${message}</div>`;
    
    // Auto-clear success messages after 3 seconds
    if (type === 'success') {
      setTimeout(() => {
        clearStatus();
      }, 3000);
    }
  }

  function clearStatus() {
    statusContainer.innerHTML = '';
  }

  async function testConnection() {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      showStatus('Please enter an API key first', 'error');
      return;
    }

    try {
      testButton.disabled = true;
      testButton.textContent = 'Testing...';
      
      // First test basic communication with background script
      console.log('Testing background script communication...');
      const pingResponse = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Background script ping timeout'));
        }, 5000);
        
        chrome.runtime.sendMessage({ type: 'ping' }, (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
      
      console.log('Background script ping successful');
      showStatus('Background script communication OK, testing API...', 'warning');
      
      // Now test the API
      await testApiKey(apiKey);
      
    } catch (error) {
      showStatus('Connection test failed: ' + error.message, 'error');
    } finally {
      testButton.disabled = false;
      testButton.textContent = 'Test Connection';
    }
  }

  async function loadModelSelection() {
    try {
      const result = await chrome.storage.sync.get(['selectedModel']);
      if (result.selectedModel) {
        modelSelect.value = result.selectedModel;
        updateModelDescription();
      }
    } catch (error) {
      console.error('Error loading model selection:', error);
    }
  }

  async function saveModelSelection() {
    const selectedModel = modelSelect.value;
    
    try {
      saveModelButton.disabled = true;
      saveModelButton.textContent = 'Saving...';

      await chrome.storage.sync.set({ selectedModel: selectedModel });
      showStatus('Model selection saved successfully!', 'success');
      
      // Notify all tabs to refresh their model selection
      try {
        const tabs = await chrome.tabs.query({ url: 'https://auctionet.com/*' });
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { type: 'refresh-model' }).catch(() => {
            // Ignore errors for tabs that don't have the content script
          });
        }
      } catch (error) {
        console.log('Could not notify tabs:', error);
      }
      
    } catch (error) {
      showStatus('Error saving model selection: ' + error.message, 'error');
    } finally {
      saveModelButton.disabled = false;
      saveModelButton.textContent = 'Save Model';
    }
  }

  function updateModelDescription() {
    const selectedModel = modelSelect.value;
    const descriptions = {
      'claude-3-5-sonnet': 'Cost-effective, good for most cataloging tasks. Recommended for regular use.',
      'claude-4-sonnet': 'Premium model with enhanced capabilities. 5x more expensive - use for complex items.'
    };
    
    modelDescription.textContent = descriptions[selectedModel] || 'Unknown model';
  }

  async function loadArtistInfoSetting() {
    try {
      const result = await chrome.storage.sync.get(['enableArtistInfo']);
      // Default to true (enabled) if not set
      const isEnabled = result.enableArtistInfo !== undefined ? result.enableArtistInfo : true;
      enableArtistInfoCheckbox.checked = isEnabled;
    } catch (error) {
      console.error('Error loading artist info setting:', error);
      // Default to enabled on error
      enableArtistInfoCheckbox.checked = true;
    }
  }

  async function saveArtistInfoSetting() {
    const isEnabled = enableArtistInfoCheckbox.checked;
    
    try {
      await chrome.storage.sync.set({ enableArtistInfo: isEnabled });
      console.log('Artist info setting saved:', isEnabled);
      
      // Notify all tabs to refresh their settings
      try {
        const tabs = await chrome.tabs.query({ url: 'https://auctionet.com/*' });
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { type: 'refresh-settings' }).catch(() => {
            // Ignore errors for tabs that don't have the content script
          });
        }
      } catch (error) {
        console.log('Could not notify tabs:', error);
      }
      
    } catch (error) {
      console.error('Error saving artist info setting:', error);
    }
  }

  async function loadShowDashboardSetting() {
    try {
      const result = await chrome.storage.sync.get(['showDashboard']);
      // Default to true (enabled) if not set
      const isEnabled = result.showDashboard !== undefined ? result.showDashboard : true;
      showDashboardCheckbox.checked = isEnabled;
    } catch (error) {
      console.error('Error loading show dashboard setting:', error);
      // Default to enabled on error
      showDashboardCheckbox.checked = true;
    }
  }

  async function saveShowDashboardSetting() {
    const isEnabled = showDashboardCheckbox.checked;
    
    try {
      await chrome.storage.sync.set({ showDashboard: isEnabled });
      console.log('Show dashboard setting saved:', isEnabled);
      
      // Notify all tabs to refresh their settings
      try {
        const tabs = await chrome.tabs.query({ url: 'https://auctionet.com/*' });
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { type: 'refresh-settings' }).catch(() => {
            // Ignore errors for tabs that don't have the content script
          });
        }
      } catch (error) {
        console.log('Could not notify tabs:', error);
      }
      
    } catch (error) {
      console.error('Error saving show dashboard setting:', error);
    }
  }

  async function loadExcludeCompanySetting() {
    try {
      const result = await chrome.storage.sync.get(['excludeCompanyId']);
      if (result.excludeCompanyId) {
        excludeCompanyInput.value = result.excludeCompanyId;
      }
    } catch (error) {
      console.error('Error loading exclude company setting:', error);
    }
  }

  async function saveExcludeCompanySetting() {
    const excludeCompanyId = excludeCompanyInput.value.trim();
    
    try {
      saveExcludeCompanyButton.disabled = true;
      saveExcludeCompanyButton.textContent = 'Saving...';

      await chrome.storage.sync.set({ excludeCompanyId: excludeCompanyId });
      showStatus('Exclude company setting saved successfully!', 'success');
      
      // Notify all tabs to refresh their settings
      try {
        const tabs = await chrome.tabs.query({ url: 'https://auctionet.com/*' });
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { type: 'refresh-settings' }).catch(() => {
            // Ignore errors for tabs that don't have the content script
          });
        }
      } catch (error) {
        console.log('Could not notify tabs:', error);
      }
      
    } catch (error) {
      showStatus('Error saving exclude company setting: ' + error.message, 'error');
    } finally {
      saveExcludeCompanyButton.disabled = false;
      saveExcludeCompanyButton.textContent = 'Save Exclude Company';
    }
  }
}); 