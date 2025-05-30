import { SearchTermExtractor } from "/modules/search-term-extractor.js";
// content-script.js - Main content script with dynamic module loading
(async function() {
  'use strict';
  
  console.log('Auctionet AI Assistant: Starting initialization...');
  
  try {
    // Wait for page to be fully loaded
    if (document.readyState === 'loading') {
      console.log('Waiting for DOM to load...');
      await new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', resolve);
      });
    }

    // Additional wait to ensure dynamic content is loaded
    console.log('Waiting for dynamic content...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if we're on the right page first
    const url = window.location.href;
    const isCorrectPage = url.includes('auctionet.com/admin/') && 
                         url.includes('/items/') && 
                         url.includes('/edit') &&
                         document.querySelector('#item_title_sv');

    if (!isCorrectPage) {
      console.log('Auctionet AI Assistant: Not on an item edit page');
      return;
    }

    console.log('Auctionet AI Assistant: On correct page, loading modules...');
    
    // Dynamically import modules
    const { UIManager } = await import(chrome.runtime.getURL('modules/ui-manager.js'));
    const { DashboardManager } = await import(chrome.runtime.getURL('modules/dashboard-manager.js'));
    const { SearchFilterManager } = await import(chrome.runtime.getURL('modules/search-filter-manager.js'));
    const { QualityAnalyzer } = await import(chrome.runtime.getURL('modules/quality-analyzer.js'));
    const { APIManager } = await import(chrome.runtime.getURL('modules/api-manager.js'));
    const { DataExtractor } = await import(chrome.runtime.getURL('modules/data-extractor.js'));
    
    console.log('Modules loaded successfully, initializing assistant...');
    
    // Initialize the assistant
    class AuctionetCatalogingAssistant {
      constructor() {
        this.dataExtractor = new DataExtractor();
        this.apiManager = new APIManager();
        this.qualityAnalyzer = new QualityAnalyzer();
        this.uiManager = new UIManager(this.apiManager, this.qualityAnalyzer);
        
        // Set up dependencies
        this.qualityAnalyzer.setDataExtractor(this.dataExtractor);
        this.qualityAnalyzer.setApiManager(this.apiManager);
        
        this.init();
        this.setupEventListeners();
      }

      async init() {
        console.log('Auctionet AI Assistant: Initializing assistant...');
        
        await this.apiManager.loadSettings();
        console.log('API key loaded:', this.apiManager.apiKey ? 'Yes' : 'No');
        
        this.uiManager.injectUI();
        this.attachEventListeners();
        
        // Run initial quality analysis after API key is loaded
        await this.uiManager.runInitialQualityAnalysis();
        
        console.log('Auctionet AI Assistant: Initialization complete');
      }

      setupEventListeners() {
        // Listen for API key changes
        chrome.storage.onChanged.addListener((changes, namespace) => {
          if (namespace === 'sync' && changes.anthropicApiKey) {
            console.log('API key updated in storage');
            this.apiManager.apiKey = changes.anthropicApiKey.newValue;
          }
        });
        
        // Listen for messages from popup
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
          if (request.type === 'refresh-api-key') {
            console.log('Refreshing API key from popup request');
            this.apiManager.loadSettings();
            sendResponse({ success: true });
          } else if (request.type === 'refresh-model') {
            console.log('Refreshing model selection from popup request');
            this.apiManager.refreshModelSelection();
            sendResponse({ success: true });
          } else if (request.type === 'refresh-settings') {
            console.log('Refreshing settings from popup request');
            this.apiManager.loadSettings(); // This also loads all settings including enableArtistInfo
            sendResponse({ success: true });
          }
        });
        
        // Listen for "Inga anmärkningar" checkbox changes to update button states
        this.setupNoRemarksCheckboxListener();
      }

      setupNoRemarksCheckboxListener() {
        const checkboxSelectors = [
          '#item_no_remarks',  // Most specific - the actual ID
          'input[name="item[no_remarks]"]',  // By name attribute
          '.js-item-form-no-remarks',  // By class
          'input[type="checkbox"][value="Inga anmärkningar"]',  // Old fallback
          'input[type="checkbox"]#item_no_remarks',  // Old fallback
          'input[type="checkbox"][name*="no_remarks"]',  // Partial name match
          'input[type="checkbox"][name*="anmärkningar"]',
          'input[type="checkbox"][id*="anmärkningar"]',
          'input[type="checkbox"][class*="anmärkningar"]'
        ];
        
        console.log('🔍 Setting up "Inga anmärkningar" checkbox listeners...');
        
        checkboxSelectors.forEach(selector => {
          const checkbox = document.querySelector(selector);
          if (checkbox) {
            console.log(`✅ Found "Inga anmärkningar" checkbox with selector: ${selector}`);
            console.log('📋 Checkbox details:', {
              checked: checkbox.checked,
              value: checkbox.value,
              name: checkbox.name,
              id: checkbox.id,
              className: checkbox.className
            });
            checkbox.addEventListener('change', () => {
              console.log('📋 "Inga anmärkningar" checkbox changed:', checkbox.checked);
              this.updateConditionButtonState();
            });
          }
        });
        
        // Fallback: search for any checkbox with "Inga anmärkningar" text nearby
        const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
        console.log(`🔍 Fallback: Setting up listeners for ${allCheckboxes.length} checkboxes...`);
        
        allCheckboxes.forEach(checkbox => {
          const parent = checkbox.parentElement;
          const textContent = parent ? parent.textContent : '';
          if (textContent.includes('Inga anmärkningar') || textContent.includes('anmärkningar')) {
            console.log('✅ Found checkbox by text content, setting up listener');
            checkbox.addEventListener('change', () => {
              console.log('📋 "Inga anmärkningar" checkbox (by text) changed:', checkbox.checked);
              this.updateConditionButtonState();
            });
          }
        });
        
        // Note: Initial button state update will be called after UI is injected
      }

      updateConditionButtonState() {
        console.log('🔄 Updating condition button state...');
        const isNoRemarksChecked = this.isNoRemarksChecked();
        console.log('📋 isNoRemarksChecked result:', isNoRemarksChecked);
        
        const conditionButton = document.querySelector('[data-field-type="condition"]');
        console.log('🔍 Condition button found:', !!conditionButton);
        
        if (conditionButton) {
          if (isNoRemarksChecked) {
            conditionButton.disabled = true;
            conditionButton.style.opacity = '0.5';
            conditionButton.style.cursor = 'not-allowed';
            conditionButton.title = 'Kondition kan inte förbättras när "Inga anmärkningar" är markerat';
            console.log('🚫 Condition button DISABLED - "Inga anmärkningar" is checked');
          } else {
            conditionButton.disabled = false;
            conditionButton.style.opacity = '1';
            conditionButton.style.cursor = 'pointer';
            conditionButton.title = 'AI-förbättra kondition';
            console.log('✅ Condition button ENABLED - "Inga anmärkningar" is not checked');
          }
        } else {
          // Try alternative selectors but don't log as error during initialization
          const altButtons = document.querySelectorAll('.ai-assist-button');
          let foundConditionButton = null;
          altButtons.forEach(btn => {
            if (btn.textContent.includes('kondition') || btn.dataset.fieldType === 'condition') {
              foundConditionButton = btn;
            }
          });
          
          if (foundConditionButton) {
            console.log('✅ Found condition button with alternative method');
            // Apply the same logic as above
            if (isNoRemarksChecked) {
              foundConditionButton.disabled = true;
              foundConditionButton.style.opacity = '0.5';
              foundConditionButton.style.cursor = 'not-allowed';
              foundConditionButton.title = 'Kondition kan inte förbättras när "Inga anmärkningar" är markerat';
              console.log('🚫 Condition button DISABLED - "Inga anmärkningar" is checked');
            } else {
              foundConditionButton.disabled = false;
              foundConditionButton.style.opacity = '1';
              foundConditionButton.style.cursor = 'pointer';
              foundConditionButton.title = 'AI-förbättra kondition';
              console.log('✅ Condition button ENABLED - "Inga anmärkningar" is not checked');
            }
          } else {
            // Only log as warning if we're past initialization
            console.log('ℹ️ Condition button not found yet - UI may still be loading');
          }
        }
      }

      attachEventListeners() {
        // Individual field buttons (exclude master button)
        const buttons = document.querySelectorAll('.ai-assist-button:not(.ai-master-button)');
        console.log('Found AI assist buttons:', buttons.length);
        
        buttons.forEach(button => {
          button.addEventListener('click', (e) => {
            e.preventDefault();
            const fieldType = e.target.dataset.fieldType;
            console.log('Button clicked for field type:', fieldType);
            if (fieldType) {
              this.improveField(fieldType);
            } else {
              console.warn('Button clicked but no fieldType found:', e.target);
            }
          });
        });

        // Master button (separate handler)
        const masterButton = document.querySelector('.ai-master-button');
        if (masterButton) {
          console.log('Master button found and event listener attached');
          masterButton.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Master button clicked');
            this.improveAllFields();
          });
        } else {
          console.warn('Master button not found');
        }
        
        // Update condition button state after buttons are attached and UI is ready
        setTimeout(() => {
          console.log('🔧 Updating condition button state after UI initialization...');
          this.updateConditionButtonState();
        }, 500); // Increased delay to ensure UI is fully ready
      }

      async improveField(fieldType) {
        // Check if trying to improve condition when "Inga anmärkningar" is checked
        if (fieldType === 'condition' && this.isNoRemarksChecked()) {
          this.showErrorIndicator(fieldType, 'Kondition kan inte förbättras när "Inga anmärkningar" är markerat. Avmarkera checkboxen först.');
          return;
        }
        
        // Ensure API key is loaded
        if (!this.apiManager.apiKey) {
          await this.apiManager.loadSettings();
        }
        
        // Check if API key is still missing
        if (!this.apiManager.apiKey) {
          this.showErrorIndicator(fieldType, 'API key not configured. Please set your Anthropic API key in the extension popup.');
          return;
        }
        
        const itemData = this.dataExtractor.extractItemData();
        
        // Assess data quality for hallucination prevention
        const qualityAssessment = this.qualityAnalyzer.assessDataQuality(itemData, fieldType);
        
        if (qualityAssessment.needsMoreInfo) {
          this.showFieldSpecificInfoDialog(fieldType, qualityAssessment.missingInfo, itemData);
          return;
        }
        
        this.showLoadingIndicator(fieldType);
        
        try {
          console.log('🎯 Individual field - Artist info enabled:', this.apiManager.enableArtistInfo);
          const improved = await this.apiManager.callClaudeAPI(itemData, fieldType);
          console.log('Improved result for', fieldType, ':', improved);
          
          // For single field improvements, extract the specific field value
          const value = improved[fieldType];
          if (value) {
            this.uiManager.applyImprovement(fieldType, value);
            this.showSuccessIndicator(fieldType);
            
            // Re-analyze quality after improvement
            setTimeout(() => this.qualityAnalyzer.analyzeQuality(), 500);
          } else {
            throw new Error(`No ${fieldType} value in response`);
          }
        } catch (error) {
          console.error('Error improving field:', error);
          this.showErrorIndicator(fieldType, error.message);
        }
      }

      async improveAllFields() {
        // Ensure API key is loaded
        if (!this.apiManager.apiKey) {
          await this.apiManager.loadSettings();
        }
        
        // Check if API key is still missing
        if (!this.apiManager.apiKey) {
          this.showErrorIndicator('all', 'API key not configured. Please set your Anthropic API key in the extension popup.');
          return;
        }
        
        const itemData = this.dataExtractor.extractItemData();
        
        // Assess data quality for hallucination prevention
        const qualityAssessment = this.qualityAnalyzer.assessDataQuality(itemData, 'all');
        
        // Always show dialog with settings - either for missing info or confirmation
        if (qualityAssessment.needsMoreInfo) {
          this.showFieldSpecificInfoDialog('all', qualityAssessment.missingInfo, itemData);
        } else {
          this.showAISettingsDialog('all', itemData);
        }
      }

      showFieldSpecificInfoDialog(fieldType, missingInfo, data) {
        const fieldNames = {
          'title': 'titeln',
          'description': 'beskrivningen', 
          'condition': 'skicket',
          'keywords': 'nyckelorden',
          'all': 'alla fält'
        };
        
        const fieldName = fieldNames[fieldType] || fieldType;
        
        const infoMessages = {
          'basic_info': '📝 Grundläggande information om objektet',
          'material': '🧱 Material (trä, metall, glas, keramik, textil, etc.)',
          'technique': '🔨 Tillverkningsteknik (handgjord, gjuten, målad, etc.)',
          'period': '📅 Tidsperiod eller årtal',
          'measurements': '📏 Mått (längd x bredd x höjd)',
          'specific_damage': '🔍 Specifika skador eller defekter',
          'wear_details': '👀 Detaljer om slitage och användning',
          'condition_details': '🔎 Mer detaljerad skickbeskrivning',
          'bruksslitage_vague': '⚠️ "Bruksslitage" är för vagt - specificera typ av skador',
          'vague_condition_terms': '📋 Vaga konditionstermer - beskriv specifika skador och placering',
          'critical_quality': '⚠️ Grundläggande objektinformation',
          'artist_verification': '👨‍🎨 Verifiering av konstnärsinformation och aktiv period'
        };
        
        const dialog = document.createElement('div');
        dialog.className = 'ai-info-request-dialog';
        dialog.innerHTML = `
          <div class="dialog-overlay"></div>
          <div class="dialog-content">
            <h3>🤖 Behöver mer information för ${fieldName}</h3>
            <p>För att undvika felaktiga uppgifter behöver AI:n mer detaljerad information innan ${fieldName} kan förbättras säkert.</p>
            
            <div class="missing-info">
              <h4>Lägg till information om:</h4>
              <ul>
                ${missingInfo.map(info => `<li>${infoMessages[info] || info}</li>`).join('')}
              </ul>
            </div>
            
            <div class="ai-settings-section" style="margin: 15px 0; padding: 12px; background: #f8f9fa; border-radius: 6px; border-left: 3px solid #007cba;">
              <h4 style="margin: 0 0 8px 0; font-size: 14px; color: #333;">⚙️ AI-inställningar</h4>
              <label style="display: flex; align-items: center; cursor: pointer; font-size: 13px;">
                <input type="checkbox" id="dialog-enable-artist-info" style="margin-right: 8px;" ${this.apiManager.enableArtistInfo ? 'checked' : ''}>
                <span>Lägg till konstnärsinformation i beskrivningen</span>
              </label>
              <div style="font-size: 11px; color: #666; margin-top: 4px;">
                När konstnär/formgivare är känd, lägg till kort historisk kontext och information om specifika serier/modeller.
              </div>
            </div>
            
            ${this.getFieldSpecificTips(fieldType, data)}
            
            <div class="dialog-buttons">
              <button class="btn btn-link" id="cancel-field-dialog">Avbryt</button>
              <button class="btn btn-default" id="continue-anyway">Fortsätt ändå</button>
            </div>
          </div>
        `;
        
        document.body.appendChild(dialog);
        
        // Handle button clicks
        document.getElementById('cancel-field-dialog').addEventListener('click', () => {
          dialog.remove();
        });
        
        document.getElementById('continue-anyway').addEventListener('click', () => {
          dialog.remove();
          this.forceImproveField(fieldType);
        });
        
        // Handle artist info checkbox change
        const artistInfoCheckbox = document.getElementById('dialog-enable-artist-info');
        if (artistInfoCheckbox) {
          artistInfoCheckbox.addEventListener('change', async () => {
            const isEnabled = artistInfoCheckbox.checked;
            try {
              await chrome.storage.sync.set({ enableArtistInfo: isEnabled });
              this.apiManager.enableArtistInfo = isEnabled;
              console.log('Artist info setting updated from dialog:', isEnabled);
            } catch (error) {
              console.error('Error saving artist info setting:', error);
            }
          });
        }
        
        // Close on background click
        dialog.querySelector('.dialog-overlay').addEventListener('click', () => {
          dialog.remove();
        });
      }

      showAISettingsDialog(fieldType, data) {
        const fieldNames = {
          'title': 'titeln',
          'description': 'beskrivningen', 
          'condition': 'skicket',
          'keywords': 'nyckelorden',
          'all': 'alla fält'
        };
        
        const fieldName = fieldNames[fieldType] || fieldType;
        
        const dialog = document.createElement('div');
        dialog.className = 'ai-info-request-dialog';
        dialog.innerHTML = `
          <div class="dialog-overlay"></div>
          <div class="dialog-content">
            <h3>⚡ Förbättra ${fieldName}</h3>
            <p>AI:n är redo att förbättra ${fieldName} enligt svenska auktionsstandarder.</p>
            
            <div class="ai-settings-section" style="margin: 15px 0; padding: 12px; background: #f8f9fa; border-radius: 6px; border-left: 3px solid #007cba;">
              <h4 style="margin: 0 0 8px 0; font-size: 14px; color: #333;">⚙️ AI-inställningar</h4>
              <label style="display: flex; align-items: center; cursor: pointer; font-size: 13px;">
                <input type="checkbox" id="dialog-enable-artist-info" style="margin-right: 8px;" ${this.apiManager.enableArtistInfo ? 'checked' : ''}>
                <span>Lägg till konstnärsinformation i beskrivningen</span>
              </label>
              <div style="font-size: 11px; color: #666; margin-top: 4px;">
                När konstnär/formgivare är känd, lägg till kort historisk kontext och information om specifika serier/modeller.
              </div>
            </div>
            
            <div class="dialog-buttons">
              <button class="btn btn-link" id="cancel-settings-dialog">Avbryt</button>
              <button class="btn btn-primary" id="proceed-with-ai" style="background: #007cba;">Förbättra ${fieldName}</button>
            </div>
          </div>
        `;
        
        document.body.appendChild(dialog);
        
        // Handle button clicks
        document.getElementById('cancel-settings-dialog').addEventListener('click', () => {
          dialog.remove();
        });
        
        document.getElementById('proceed-with-ai').addEventListener('click', () => {
          dialog.remove();
          this.proceedWithAIImprovement(fieldType);
        });
        
        // Handle artist info checkbox change
        const artistInfoCheckbox = document.getElementById('dialog-enable-artist-info');
        if (artistInfoCheckbox) {
          artistInfoCheckbox.addEventListener('change', async () => {
            const isEnabled = artistInfoCheckbox.checked;
            try {
              await chrome.storage.sync.set({ enableArtistInfo: isEnabled });
              this.apiManager.enableArtistInfo = isEnabled;
              console.log('Artist info setting updated from dialog:', isEnabled);
            } catch (error) {
              console.error('Error saving artist info setting:', error);
            }
          });
        }
        
        // Close on background click
        dialog.querySelector('.dialog-overlay').addEventListener('click', () => {
          dialog.remove();
        });
      }

      async proceedWithAIImprovement(fieldType) {
        this.showLoadingIndicator(fieldType);
        
        // Don't reload settings here - they were just set by the dialog
        console.log('⚡ Proceed with AI - Artist info enabled:', this.apiManager.enableArtistInfo);
        console.log('⚡ Proceed with AI - API key present:', !!this.apiManager.apiKey);
        
        try {
          const itemData = this.dataExtractor.extractItemData();
          console.log('⚡ Item data for API call:', { artist: itemData.artist, enableArtistInfo: this.apiManager.enableArtistInfo });
          
          // For "all" improvements, exclude condition if "Inga anmärkningar" is checked
          let actualFieldType = fieldType;
          if (fieldType === 'all' && this.isNoRemarksChecked()) {
            console.log('📋 "Inga anmärkningar" is checked - excluding condition from improvements');
            // We'll still call with 'all' but handle condition exclusion in the response processing
          }
          
          const improvements = await this.apiManager.callClaudeAPI(itemData, actualFieldType);
          
          if (fieldType === 'all') {
            if (improvements.title) {
              this.uiManager.applyImprovement('title', improvements.title);
            }
            if (improvements.description) {
              this.uiManager.applyImprovement('description', improvements.description);
            }
            // Only apply condition improvement if "Inga anmärkningar" is not checked
            if (improvements.condition && !this.isNoRemarksChecked()) {
              this.uiManager.applyImprovement('condition', improvements.condition);
            }
            if (improvements.keywords) {
              this.uiManager.applyImprovement('keywords', improvements.keywords);
            }
          } else {
            // For single field improvements
            const value = improvements[fieldType];
            if (value) {
              this.uiManager.applyImprovement(fieldType, value);
            } else {
              throw new Error(`No ${fieldType} value in response`);
            }
          }
          
          this.showSuccessIndicator(fieldType);
          
          // Re-analyze quality after improvements
          setTimeout(() => this.qualityAnalyzer.analyzeQuality(), 500);
        } catch (error) {
          console.error('Error improving field:', error);
          this.showErrorIndicator(fieldType, error.message);
        }
      }

      getFieldSpecificTips(fieldType, data) {
        switch(fieldType) {
          case 'title':
            return `
              <div class="field-tips">
                <h4>💡 Tips för bättre titel:</h4>
                <p>Lägg till information i beskrivningen om material, teknik och tidsperiod så kan AI:n skapa en mer exakt titel enligt Auctionets standarder.</p>
              </div>
            `;
          case 'description':
            return `
              <div class="field-tips">
                <h4>💡 Tips för bättre beskrivning:</h4>
                <p>Inkludera mått, material, tillverkningsteknik och eventuell signering eller märkning. Detta hjälper AI:n att skapa en professionell beskrivning.</p>
              </div>
            `;
          case 'condition':
            return `
              <div class="field-tips">
                <h4>🚨 KRITISKT för kundnöjdhet - Detaljerad skickbeskrivning:</h4>
                <p><strong>Kunder måste veta EXAKT vad de får för att undvika besvikelser och reklamationer!</strong></p>
                <div style="background: #fff3cd; padding: 8px; border-radius: 4px; margin: 8px 0; border-left: 3px solid #ffc107;">
                  <strong>⚠️ Varje vag beskrivning = missnöjd kund = support-ärende</strong>
                </div>
                <p><strong>OBLIGATORISKT att ange:</strong></p>
                <ul style="margin: 8px 0; padding-left: 20px;">
                  <li><strong>Typ av skada:</strong> repor, nagg, sprickor, fläckar, missfärgningar, rostfläckar</li>
                  <li><strong>Exakt placering:</strong> "vid foten", "på ovansidan", "längs vänster kant", "i mitten"</li>
                  <li><strong>Storlek/omfattning:</strong> "mindre", "flera", "genomgående", "ytliga", "djupa"</li>
                  <li><strong>Synlighet:</strong> "tydligt synliga", "svåra att upptäcka", "endast i starkt ljus"</li>
                </ul>
                <p><strong>✅ BRA exempel:</strong> "Mindre repor på ovansidan, tydligt synliga. Nagg vid fot, ca 2mm. Spricka i glasyr längs vänster kant, 3cm lång."</p>
                <p><strong>❌ DÅLIGT exempel:</strong> "Bruksslitage", "Normalt slitage", "Mindre skador"</p>
              </div>
            `;
          case 'keywords':
            return `
              <div class="field-tips">
                <h4>💡 Tips för bättre nyckelord:</h4>
                <p>Mer detaljerad information i titel och beskrivning hjälper AI:n att generera relevanta sökord som inte bara upprepar befintlig text.</p>
              </div>
            `;
          case 'all':
            return `
              <div class="field-tips">
                <h4>💡 Tips för bättre katalogisering:</h4>
                <p>Lägg till mer specifik information i beskrivningen så kan AI:n förbättra alla fält mer exakt och undvika att gissa.</p>
              </div>
            `;
          default:
            return '';
        }
      }

      async forceImproveField(fieldType) {
        // Bypass quality checks and improve anyway
        
        // Ensure API manager settings are loaded
        await this.apiManager.loadSettings();
        console.log('🔧 Force improve - Artist info enabled:', this.apiManager.enableArtistInfo);
        
        const itemData = this.dataExtractor.extractItemData();
        
        if (fieldType === 'all') {
          this.showLoadingIndicator('all');
          
          try {
            const improvements = await this.apiManager.callClaudeAPI(itemData, 'all');
            this.applyAllImprovements(improvements);
          } catch (error) {
            this.showErrorIndicator('all', error.message);
          }
          return;
        }
        
        // For individual fields
        this.showLoadingIndicator(fieldType);
        
        try {
          const improved = await this.apiManager.callClaudeAPI(itemData, fieldType);
          console.log('Forced improved result for', fieldType, ':', improved);
          
          const value = improved[fieldType];
          if (value) {
            this.uiManager.applyImprovement(fieldType, value);
            this.showSuccessIndicator(fieldType);
            
            // Re-analyze quality after improvement
            setTimeout(() => this.qualityAnalyzer.analyzeQuality(), 500);
          } else {
            throw new Error(`No ${fieldType} value in response`);
          }
        } catch (error) {
          console.error('Error improving field:', error);
          this.showErrorIndicator(fieldType, error.message);
        }
      }

      applyAllImprovements(improvements) {
        if (improvements.title) {
          this.uiManager.applyImprovement('title', improvements.title);
        }
        if (improvements.description) {
          this.uiManager.applyImprovement('description', improvements.description);
        }
        if (improvements.condition) {
          this.uiManager.applyImprovement('condition', improvements.condition);
        }
        if (improvements.keywords) {
          this.uiManager.applyImprovement('keywords', improvements.keywords);
        }
        
        this.showSuccessIndicator('all');
        setTimeout(() => this.qualityAnalyzer.analyzeQuality(), 500);
      }

      // Status indicator methods with encouraging messages
      showLoadingIndicator(fieldType) {
        const indicators = document.querySelectorAll('.ai-status-indicator');
        indicators.forEach(ind => ind.remove());
        
        // Field-specific loading messages
        const fieldSpecificLoadingMessages = {
          'title': [
            '🤖 AI förbättrar titeln...',
            '✨ Optimerar titel enligt auktionsstandarder...',
            '📝 Skapar professionell titel...'
          ],
          'description': [
            '🤖 AI förbättrar beskrivningen...',
            '✨ Skapar professionell beskrivning...',
            '📝 Optimerar beskrivningstext...'
          ],
          'condition': [
            '🤖 AI förbättrar konditionsrapporten...',
            '✨ Optimerar skickbeskrivning...',
            '🔍 Skapar tydlig konditionsrapport...'
          ],
          'keywords': [
            '🤖 AI genererar nyckelord...',
            '✨ Optimerar sökord för bättre sökbarhet...',
            '🎯 Skapar relevanta nyckelord...'
          ],
          'all': [
            '🤖 AI förbättrar alla fält...',
            '✨ Skapar komplett professionell katalogisering...',
            '🎯 Optimerar hela auktionsposten...',
            '📝 Följer svenska auktionsstandarder...'
          ]
        };
        
        const messages = fieldSpecificLoadingMessages[fieldType] || [
          '🤖 AI arbetar...',
          '✨ Förbättrar innehållet...'
        ];
        
        const randomMessage = messages[Math.floor(Math.random() * messages.length)];
        
        const indicator = document.createElement('div');
        indicator.className = 'ai-status-indicator loading';
        indicator.innerHTML = `
          <div class="loading-content">
            <div class="loading-pulse"></div>
            <span class="loading-text">${randomMessage}</span>
          </div>
        `;
        
        let targetElement = null;
        
        if (fieldType === 'all') {
          const masterButton = document.querySelector('.ai-master-button');
          if (masterButton && masterButton.parentElement) {
            targetElement = masterButton.parentElement;
          }
        } else {
          const button = document.querySelector(`[data-field-type="${fieldType}"]`);
          if (button && button.parentElement) {
            targetElement = button.parentElement;
          }
        }
        
        if (targetElement) {
          targetElement.appendChild(indicator);
        }
      }

      showSuccessIndicator(fieldType) {
        const indicator = document.querySelector('.ai-status-indicator');
        if (indicator) {
          // Field-specific success messages
          const fieldSpecificMessages = {
            'title': [
              '🎉 Perfekt! Titeln är nu förbättrad!',
              '✨ Utmärkt! Titeln följer svenska auktionsstandarder!',
              '🏆 Bra jobbat! Titeln är nu optimerad!'
            ],
            'description': [
              '🎉 Fantastiskt! Beskrivningen är nu förbättrad!',
              '✨ Perfekt! Beskrivningen är professionellt skriven!',
              '📝 Utmärkt! Beskrivningen följer auktionsstandarder!'
            ],
            'condition': [
              '🎉 Toppen! Konditionsrapporten är nu förbättrad!',
              '✨ Perfekt! Skickbeskrivningen är nu tydligare!',
              '🔍 Utmärkt! Konditionsrapporten är professionell!'
            ],
            'keywords': [
              '🎉 Fantastiskt! Nyckelorden är nu förbättrade!',
              '✨ Perfekt! Sökorden är optimerade för bättre sökbarhet!',
              '🎯 Utmärkt! Nyckelorden följer auktionsstandarder!'
            ],
            'all': [
              '🎉 Fantastiskt! Alla fält är nu förbättrade!',
              '✨ Perfekt! Hela katalogiseringen följer svenska standarder!',
              '🚀 Utmärkt! Komplett förbättring genomförd!',
              '🏆 Toppen! All information är nu optimerad!'
            ]
          };
          
          const messages = fieldSpecificMessages[fieldType] || [
            '🎉 Fantastiskt! Förbättringen är klar!',
            '✨ Perfekt! AI-förbättringen genomförd!'
          ];
          
          const randomMessage = messages[Math.floor(Math.random() * messages.length)];
          
          indicator.className = 'ai-status-indicator success';
          indicator.innerHTML = `
            <div class="success-content">
              <span class="success-icon">✓</span>
              <span class="success-text">${randomMessage}</span>
            </div>
          `;
          
          setTimeout(() => indicator.remove(), 4000);
        }
      }

      showErrorIndicator(fieldType, error) {
        let indicator = document.querySelector('.ai-status-indicator');
        
        if (!indicator) {
          indicator = document.createElement('div');
          indicator.className = 'ai-status-indicator error';
          indicator.textContent = `✗ Fel: ${error}`;
          
          let targetElement = null;
          
          if (fieldType === 'all') {
            const masterButton = document.querySelector('.ai-master-button');
            if (masterButton && masterButton.parentElement) {
              targetElement = masterButton.parentElement;
            }
          } else {
            const button = document.querySelector(`[data-field-type="${fieldType}"]`);
            if (button && button.parentElement) {
              targetElement = button.parentElement;
            }
          }
          
          if (targetElement) {
            targetElement.appendChild(indicator);
          } else {
            alert(`Error: ${error}`);
            return;
          }
        } else {
          indicator.className = 'ai-status-indicator error';
          indicator.textContent = `✗ Fel: ${error}`;
        }
        
        setTimeout(() => {
          if (indicator && indicator.parentElement) {
            indicator.remove();
          }
        }, 5000);
      }

      isNoRemarksChecked() {
        const checkboxSelectors = [
          '#item_no_remarks',  // Most specific - the actual ID
          'input[name="item[no_remarks]"]',  // By name attribute
          '.js-item-form-no-remarks',  // By class
          'input[type="checkbox"][value="Inga anmärkningar"]',  // Old fallback
          'input[type="checkbox"]#item_no_remarks',  // Old fallback
          'input[type="checkbox"][name*="no_remarks"]',  // Partial name match
          'input[type="checkbox"][name*="anmärkningar"]',
          'input[type="checkbox"][id*="anmärkningar"]',
          'input[type="checkbox"][class*="anmärkningar"]'
        ];
        
        console.log('🔍 Checking for "Inga anmärkningar" checkbox...');
        
        for (const selector of checkboxSelectors) {
          const checkbox = document.querySelector(selector);
          if (checkbox) {
            console.log(`✅ Found checkbox with selector: ${selector}`);
            console.log('📋 Checkbox details:', {
              checked: checkbox.checked,
              value: checkbox.value,
              name: checkbox.name,
              id: checkbox.id,
              className: checkbox.className
            });
            if (checkbox.checked) {
              console.log('🚫 "Inga anmärkningar" is CHECKED - should disable condition button');
              return true;
            }
          }
        }
        
        // Fallback: search for any checkbox with "Inga anmärkningar" text nearby
        const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
        console.log(`🔍 Fallback: Checking ${allCheckboxes.length} checkboxes for "Inga anmärkningar" text...`);
        
        for (const checkbox of allCheckboxes) {
          const parent = checkbox.parentElement;
          const textContent = parent ? parent.textContent : '';
          if (textContent.includes('Inga anmärkningar') || textContent.includes('anmärkningar')) {
            console.log('✅ Found checkbox by text content:', {
              checked: checkbox.checked,
              textContent: textContent.trim(),
              value: checkbox.value,
              name: checkbox.name,
              id: checkbox.id
            });
            if (checkbox.checked) {
              console.log('🚫 "Inga anmärkningar" checkbox found by text and is CHECKED');
              return true;
            }
          }
        }
        
        console.log('✅ "Inga anmärkningar" is NOT checked - condition button should be enabled');
        return false;
      }
    }

    // Initialize the assistant
    new AuctionetCatalogingAssistant();
    
  } catch (error) {
    console.error('Auctionet AI Assistant: Failed to initialize:', error);
  }
})(); 