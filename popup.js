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
  const ownCompanyInput = document.getElementById('own-company-id');
  const saveOwnCompanyButton = document.getElementById('save-own-company');
  const enablePubScannerCheckbox = document.getElementById('enable-pub-scanner');
  const dashboardTokenInput = document.getElementById('dashboard-token');
  const saveDashboardTokenButton = document.getElementById('save-dashboard-token');
  const outletSupabaseUrlInput = document.getElementById('outlet-supabase-url');
  const outletSupabaseKeyInput = document.getElementById('outlet-supabase-key');
  const saveOutletConfigButton = document.getElementById('save-outlet-config');
  const spellcheckWorkerUrlInput = document.getElementById('spellcheck-worker-url');
  const saveSpellcheckConfigButton = document.getElementById('save-spellcheck-config');

  const adminUI = document.getElementById('admin-ui');

  // Load existing API key and settings
  await loadApiKey();
  await loadArtistInfoSetting();
  await loadShowDashboardSetting();
  await loadOwnCompanySetting();
  await loadPubScannerSetting();
  await loadDashboardToken();
  await loadOutletConfig();
  await loadSpellcheckConfig();
  await renderAdminUI();
  await initTabs();
  await updateConfigDots();

  // Check extension status
  await checkExtensionStatus();

  // Event listeners
  saveButton.addEventListener('click', saveApiKey);
  testButton.addEventListener('click', testConnection);
  enableArtistInfoCheckbox.addEventListener('change', saveArtistInfoSetting);
  showDashboardCheckbox.addEventListener('change', saveShowDashboardSetting);
  saveOwnCompanyButton.addEventListener('click', saveOwnCompanySetting);
  enablePubScannerCheckbox.addEventListener('change', savePubScannerSetting);
  saveDashboardTokenButton.addEventListener('click', saveDashboardToken);
  saveOutletConfigButton.addEventListener('click', saveOutletConfig);
  saveSpellcheckConfigButton.addEventListener('click', saveSpellcheckConfig);
  document.getElementById('open-analytics').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('analytics.html') });
  });
  document.getElementById('open-spelling-audit').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('spelling-audit.html') });
  });
  apiKeyInput.addEventListener('input', () => {
    clearStatus();
  });
  // Refresh the configured-dots shortly after any connection save completes
  ['save-key', 'save-own-company', 'save-dashboard-token', 'save-outlet-config', 'save-spellcheck-config'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => setTimeout(updateConfigDots, 400));
  });

  // ─── Tabs ──────────────────────────────────────────────────────

  async function initTabs() {
    const buttons = document.querySelectorAll('.tab-btn');
    const activate = (tabId) => {
      buttons.forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === tabId));
    };
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        activate(btn.dataset.tab);
        chrome.storage.local.set({ popupActiveTab: btn.dataset.tab }).catch(() => {});
      });
    });
    try {
      const { popupActiveTab } = await chrome.storage.local.get('popupActiveTab');
      if (popupActiveTab && document.getElementById(popupActiveTab)) {
        activate(popupActiveTab);
      }
    } catch (error) {
      // Keep default tab
    }
  }

  // ─── Configured-indicator dots (Anslutningar tab) ──────────────

  async function updateConfigDots() {
    try {
      const local = await chrome.storage.local.get(['anthropicApiKey', 'dashboardApiToken', 'outletApiUrl', 'outletApiToken', 'spellcheckWorkerUrl']);
      const sync = await chrome.storage.sync.get(['ownCompanyId']);
      const setDot = (id, ok) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('conn-dot--ok', !!ok);
      };
      setDot('dot-api', local.anthropicApiKey);
      // First-run help: expand the API card until a key is configured
      const apiCard = document.getElementById('card-api');
      if (apiCard && !local.anthropicApiKey) apiCard.open = true;
      setDot('dot-company', sync.ownCompanyId);
      setDot('dot-dashboard', local.dashboardApiToken);
      setDot('dot-outlet', local.outletApiUrl && local.outletApiToken);
      setDot('dot-spellcheck', local.spellcheckWorkerUrl);
    } catch (error) {
      console.error('Error updating config indicators:', error);
    }
  }

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

    if (!apiKey.startsWith('sk-ant-')) {
      showStatus('Invalid API key format. Should start with "sk-ant-"', 'error');
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
            model: 'claude-haiku-4-5', // Haiku — cheapest model, sufficient for connection test
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
    const hintEl = document.getElementById('extension-status-hint');
    let pillClass = 'status-pill--warning';
    let pillText = 'Kontrollerar…';
    let hint = '';

    switch (status) {
      case 'ready':
        pillClass = 'status-pill--ready';
        pillText = '● Aktiv';
        hint = '';
        break;
      case 'wrong-page':
        pillClass = 'status-pill--warning';
        pillText = '● Fel sida';
        hint = 'Gå till en redigeringssida för föremål på Auctionet.';
        break;
      case 'no-api-key':
        pillClass = 'status-pill--error';
        pillText = '● API-nyckel saknas';
        hint = 'Lägg in din Anthropic API-nyckel under Anslutningar.';
        break;
      case 'error':
        pillClass = 'status-pill--error';
        pillText = '● Fel';
        hint = 'Kunde inte kontrollera status.';
        break;
    }

    extensionStatus.innerHTML = `<span class="status-pill ${pillClass}">${escapeHTML(pillText)}</span>`;
    if (hintEl) hintEl.textContent = hint;
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

  async function loadPubScannerSetting() {
    try {
      const result = await chrome.storage.local.get(['enablePubScanner']);
      // Default to false (disabled) — opt-in to avoid unnecessary API costs
      enablePubScannerCheckbox.checked = result.enablePubScanner === true;
    } catch (error) {
      console.error('Error loading pub scanner setting:', error);
      enablePubScannerCheckbox.checked = false;
    }
  }

  async function savePubScannerSetting() {
    const isEnabled = enablePubScannerCheckbox.checked;
    try {
      await chrome.storage.local.set({ enablePubScanner: isEnabled });
      if (isEnabled) {
        showStatus('Publiceringskontroll aktiverad. Nästa skanning startar inom 30 min.', 'success');
      } else {
        showStatus('Publiceringskontroll avaktiverad.', 'success');
      }
    } catch (error) {
      console.error('Error saving pub scanner setting:', error);
    }
  }

  async function loadOwnCompanySetting() {
    try {
      // Migration: excludeCompanyId → ownCompanyId
      const result = await chrome.storage.sync.get(['excludeCompanyId', 'ownCompanyId']);
      if (result.excludeCompanyId && !result.ownCompanyId) {
        await chrome.storage.sync.set({ ownCompanyId: result.excludeCompanyId });
        await chrome.storage.sync.remove('excludeCompanyId');
        ownCompanyInput.value = result.excludeCompanyId;
      } else if (result.ownCompanyId) {
        ownCompanyInput.value = result.ownCompanyId;
      }
    } catch (error) {
      console.error('Error loading own company setting:', error);
    }
  }

  async function saveOwnCompanySetting() {
    const ownCompanyId = ownCompanyInput.value.trim();

    try {
      saveOwnCompanyButton.disabled = true;
      saveOwnCompanyButton.textContent = 'Sparar...';

      await chrome.storage.sync.set({ ownCompanyId });
      // Clean up old key if present
      await chrome.storage.sync.remove('excludeCompanyId');
      showStatus('Företags-ID sparat!', 'success');

      // Notify all tabs to refresh their settings
      try {
        const tabs = await chrome.tabs.query({ url: 'https://auctionet.com/*' });
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { type: 'refresh-settings' }).catch(() => {});
        }
      } catch (error) {
      }

    } catch (error) {
      showStatus('Fel vid sparande: ' + error.message, 'error');
    } finally {
      saveOwnCompanyButton.disabled = false;
      saveOwnCompanyButton.textContent = 'Spara företags-ID';
    }
  }

  // ─── Dashboard Token Management ────────────────────────────────

  async function loadDashboardToken() {
    try {
      const result = await chrome.storage.local.get(['dashboardApiToken']);
      if (result.dashboardApiToken) {
        dashboardTokenInput.value = result.dashboardApiToken;
      }
    } catch (error) {
      console.error('Error loading dashboard token:', error);
    }
  }

  async function saveDashboardToken() {
    const token = dashboardTokenInput.value.trim();

    try {
      saveDashboardTokenButton.disabled = true;
      saveDashboardTokenButton.textContent = 'Sparar...';

      await chrome.storage.local.set({ dashboardApiToken: token || '' });
      showStatus(token ? 'Dashboard token sparad!' : 'Dashboard token borttagen.', 'success');

      // Notify all Auctionet tabs to pick up new token
      try {
        const tabs = await chrome.tabs.query({ url: 'https://auctionet.com/*' });
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, { type: 'refresh-settings' }).catch(() => {});
        }
      } catch (error) {
        // Non-critical
      }
    } catch (error) {
      showStatus('Fel vid sparande: ' + error.message, 'error');
    } finally {
      saveDashboardTokenButton.disabled = false;
      saveDashboardTokenButton.textContent = 'Spara Dashboard Token';
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

  // ─── SaS Outlet Config ───────────────────────────────────────

  async function loadOutletConfig() {
    try {
      const result = await chrome.storage.local.get(['outletApiUrl', 'outletApiToken']);
      if (result.outletApiUrl) {
        outletSupabaseUrlInput.value = result.outletApiUrl;
      }
      if (result.outletApiToken) {
        outletSupabaseKeyInput.value = result.outletApiToken;
      }
    } catch (error) {
      console.error('Error loading outlet config:', error);
    }
  }

  async function saveOutletConfig() {
    const url = outletSupabaseUrlInput.value.trim();
    const key = outletSupabaseKeyInput.value.trim();

    try {
      saveOutletConfigButton.disabled = true;
      saveOutletConfigButton.textContent = 'Sparar...';

      await chrome.storage.local.set({
        outletApiUrl: url || '',
        outletApiToken: key || ''
      });

      showStatus(url && key ? 'SaS Outlet-konfiguration sparad!' : 'SaS Outlet-konfiguration borttagen.', 'success');
    } catch (error) {
      showStatus('Fel vid sparande: ' + error.message, 'error');
    } finally {
      saveOutletConfigButton.disabled = false;
      saveOutletConfigButton.textContent = 'Spara Outlet-inställningar';
    }
  }

  async function loadSpellcheckConfig() {
    try {
      const { spellcheckWorkerUrl } = await chrome.storage.local.get('spellcheckWorkerUrl');
      if (spellcheckWorkerUrl) spellcheckWorkerUrlInput.value = spellcheckWorkerUrl;
    } catch (error) {
      console.error('Error loading spellcheck config:', error);
    }
  }

  async function saveSpellcheckConfig() {
    const url = spellcheckWorkerUrlInput.value.trim().replace(/\/$/, '');
    try {
      saveSpellcheckConfigButton.disabled = true;
      saveSpellcheckConfigButton.textContent = 'Sparar...';
      await chrome.storage.local.set({ spellcheckWorkerUrl: url || '' });
      showStatus(url ? 'Stavningsbackend sparad!' : 'Stavningsbackend borttagen.', 'success');
    } catch (error) {
      showStatus('Fel vid sparande: ' + error.message, 'error');
    } finally {
      saveSpellcheckConfigButton.disabled = false;
      saveSpellcheckConfigButton.textContent = 'Spara stavningsbackend';
    }
  }
});