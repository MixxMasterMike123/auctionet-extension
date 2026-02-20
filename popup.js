// popup.js - Popup interface for API key management and status
const escapeHTML = s => s == null ? '' : String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

document.addEventListener('DOMContentLoaded', async () => {
  const apiKeyInput = document.getElementById('api-key');
  const saveButton = document.getElementById('save-key');
  const testButton = document.getElementById('test-connection');
  const statusContainer = document.getElementById('status-container');
  const extensionStatus = document.getElementById('extension-status');
  const enableArtistInfoCheckbox = document.getElementById('enable-artist-info');
  const showDashboardCheckbox = document.getElementById('show-dashboard');
  const excludeCompanyInput = document.getElementById('exclude-company-id');
  const saveExcludeCompanyButton = document.getElementById('save-exclude-company');

  const adminUI = document.getElementById('admin-ui');

  // Load existing API key and settings
  await loadApiKey();
  await loadArtistInfoSetting();
  await loadShowDashboardSetting();
  await loadExcludeCompanySetting();
  await renderAdminUI();
  
  // Check extension status
  await checkExtensionStatus();

  // Event listeners
  saveButton.addEventListener('click', saveApiKey);
  testButton.addEventListener('click', testConnection);
  enableArtistInfoCheckbox.addEventListener('change', saveArtistInfoSetting);
  showDashboardCheckbox.addEventListener('change', saveShowDashboardSetting);
  saveExcludeCompanyButton.addEventListener('click', saveExcludeCompanySetting);
  apiKeyInput.addEventListener('input', () => {
    clearStatus();
  });

  async function loadApiKey() {
    try {
      const result = await chrome.storage.local.get(['anthropicApiKey']);
      if (result.anthropicApiKey) {
        apiKeyInput.value = result.anthropicApiKey;
        // Don't auto-test on load, just show that key was loaded
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

      await chrome.storage.local.set({ anthropicApiKey: apiKey });
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
      
      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Request timeout - background script may not be responding'));
        }, 10000); // 10 second timeout
        
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: apiKey,
          body: {
            model: 'claude-sonnet-4-20250514', // Claude Sonnet 4
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
      const result = await chrome.storage.local.get(['anthropicApiKey']);
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
    statusContainer.innerHTML = `<div class="status ${escapeHTML(type)}">${escapeHTML(message)}</div>`;
    
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
      
      // Notify all tabs to refresh their settings
      try {
        const tabs = await chrome.tabs.query({ url: 'https://auctionet.com/*' });
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { type: 'refresh-settings' }).catch(() => {
            // Ignore errors for tabs that don't have the content script
          });
        }
      } catch (error) {
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
      
      // Notify all tabs to refresh their settings
      try {
        const tabs = await chrome.tabs.query({ url: 'https://auctionet.com/*' });
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { type: 'refresh-settings' }).catch(() => {
            // Ignore errors for tabs that don't have the content script
          });
        }
      } catch (error) {
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
      }
      
    } catch (error) {
      showStatus('Error saving exclude company setting: ' + error.message, 'error');
    } finally {
      saveExcludeCompanyButton.disabled = false;
      saveExcludeCompanyButton.textContent = 'Save Exclude Company';
    }
  }

  // ─── Admin PIN Management ──────────────────────────────────────

  async function hashPin(pin) {
    const data = new TextEncoder().encode(pin);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function renderAdminUI() {
    const { adminPinHash } = await chrome.storage.local.get('adminPinHash');
    const { adminUnlocked } = await chrome.storage.sync.get('adminUnlocked');

    if (!adminPinHash) {
      // No PIN set yet — show setup form
      adminUI.innerHTML = `
        <div class="help-text" style="margin-bottom: 8px;">
          Sätt en 4-siffrig PIN-kod för att skydda admin-funktioner (dashboard, lagerkostnader m.m.)
        </div>
        <div class="admin-row">
          <input type="password" id="admin-pin-setup" class="admin-pin-input" maxlength="4" placeholder="····" inputmode="numeric" pattern="[0-9]*">
          <button id="admin-pin-save" class="btn-sm">Sätt PIN</button>
        </div>
      `;
      document.getElementById('admin-pin-save').addEventListener('click', setupPin);
      document.getElementById('admin-pin-setup').addEventListener('keydown', e => {
        if (e.key === 'Enter') setupPin();
      });
    } else if (adminUnlocked) {
      // Unlocked — show status + lock button
      adminUI.innerHTML = `
        <div class="admin-row">
          <span class="admin-badge admin-badge--unlocked">Admin aktiv</span>
          <div>
            <button id="admin-lock" class="btn-sm btn-outline">Lås</button>
            <button id="admin-change-pin" class="btn-sm btn-outline" style="margin-left: 4px;">Byt PIN</button>
          </div>
        </div>
        <div class="help-text">Dashboard-funktioner är synliga.</div>
      `;
      document.getElementById('admin-lock').addEventListener('click', lockAdmin);
      document.getElementById('admin-change-pin').addEventListener('click', showChangePinUI);
    } else {
      // Locked — show unlock form
      adminUI.innerHTML = `
        <div class="admin-row">
          <span class="admin-badge admin-badge--locked">Låst</span>
          <div style="display:flex; align-items:center; gap:6px;">
            <input type="password" id="admin-pin-unlock" class="admin-pin-input" maxlength="4" placeholder="····" inputmode="numeric" pattern="[0-9]*">
            <button id="admin-unlock" class="btn-sm">Lås upp</button>
          </div>
        </div>
        <div class="help-text">Ange PIN för att aktivera admin-funktioner.</div>
      `;
      document.getElementById('admin-unlock').addEventListener('click', unlockAdmin);
      document.getElementById('admin-pin-unlock').addEventListener('keydown', e => {
        if (e.key === 'Enter') unlockAdmin();
      });
    }
  }

  async function setupPin() {
    const input = document.getElementById('admin-pin-setup');
    const pin = input.value.trim();
    if (!/^\d{4}$/.test(pin)) {
      showStatus('PIN måste vara exakt 4 siffror.', 'error');
      return;
    }
    const hash = await hashPin(pin);
    await chrome.storage.local.set({ adminPinHash: hash });
    await chrome.storage.sync.set({ adminUnlocked: true });
    showStatus('Admin-PIN satt! Admin-läge aktiverat.', 'success');
    await renderAdminUI();
  }

  async function unlockAdmin() {
    const input = document.getElementById('admin-pin-unlock');
    const pin = input.value.trim();
    if (!/^\d{4}$/.test(pin)) {
      showStatus('Ange 4 siffror.', 'error');
      return;
    }
    const hash = await hashPin(pin);
    const { adminPinHash } = await chrome.storage.local.get('adminPinHash');
    if (hash === adminPinHash) {
      await chrome.storage.sync.set({ adminUnlocked: true });
      showStatus('Admin-läge aktiverat!', 'success');
      await renderAdminUI();
    } else {
      showStatus('Fel PIN-kod.', 'error');
      input.value = '';
      input.focus();
    }
  }

  async function lockAdmin() {
    await chrome.storage.sync.set({ adminUnlocked: false });
    showStatus('Admin-läge låst.', 'success');
    await renderAdminUI();
  }

  function showChangePinUI() {
    adminUI.innerHTML = `
      <div class="help-text" style="margin-bottom: 8px;">Ange nuvarande PIN och sedan ny PIN:</div>
      <div class="admin-row">
        <input type="password" id="admin-pin-old" class="admin-pin-input" maxlength="4" placeholder="Nuv." inputmode="numeric" pattern="[0-9]*">
        <input type="password" id="admin-pin-new" class="admin-pin-input" maxlength="4" placeholder="Ny" inputmode="numeric" pattern="[0-9]*">
        <button id="admin-pin-change-save" class="btn-sm">Spara</button>
        <button id="admin-pin-change-cancel" class="btn-sm btn-outline">Avbryt</button>
      </div>
    `;
    document.getElementById('admin-pin-change-save').addEventListener('click', changePin);
    document.getElementById('admin-pin-change-cancel').addEventListener('click', () => renderAdminUI());
  }

  async function changePin() {
    const oldPin = document.getElementById('admin-pin-old').value.trim();
    const newPin = document.getElementById('admin-pin-new').value.trim();
    if (!/^\d{4}$/.test(oldPin) || !/^\d{4}$/.test(newPin)) {
      showStatus('Båda PIN-koder måste vara 4 siffror.', 'error');
      return;
    }
    const oldHash = await hashPin(oldPin);
    const { adminPinHash } = await chrome.storage.local.get('adminPinHash');
    if (oldHash !== adminPinHash) {
      showStatus('Nuvarande PIN är fel.', 'error');
      return;
    }
    const newHash = await hashPin(newPin);
    await chrome.storage.local.set({ adminPinHash: newHash });
    showStatus('PIN-kod ändrad!', 'success');
    await renderAdminUI();
  }
}); 