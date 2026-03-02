// content-script.js - Main content script with dynamic module loading
(async function() {
  'use strict';
  

  
  try {
    // Wait for page to be fully loaded
    if (document.readyState === 'loading') {
      await new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', resolve);
      });
    }
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if we're on the right page first
    const url = window.location.href;
    const isCorrectPage = url.includes('auctionet.com/admin/') && 
                         url.includes('/items/') && 
                         url.includes('/edit') &&
                         document.querySelector('#item_title_sv');

    if (!isCorrectPage) {
      return;
    }
    
    // Dynamically import modules - UPDATED TO USE NEW MODULAR SYSTEM
    const { UIManager } = await import(chrome.runtime.getURL('modules/ui-manager.js'));
    const { DashboardManagerV2 } = await import(chrome.runtime.getURL('modules/dashboard-manager-v2.js'));
    const { SearchFilterManager } = await import(chrome.runtime.getURL('modules/search-filter-manager.js'));
    const { QualityAnalyzer } = await import(chrome.runtime.getURL('modules/quality-analyzer.js'));
    const { APIManager } = await import(chrome.runtime.getURL('modules/api-manager.js'));
    const { DataExtractor } = await import(chrome.runtime.getURL('modules/data-extractor.js'));
    const { SearchQuerySSoT } = await import(chrome.runtime.getURL('modules/search-query-ssot.js'));
    const { SalesAnalysisManager } = await import(chrome.runtime.getURL('modules/sales-analysis-manager.js'));
    const { escapeHTML } = await import(chrome.runtime.getURL('modules/core/html-escape.js'));
    const { EnhanceAllManager } = await import(chrome.runtime.getURL('modules/enhance-all/enhance-all-manager.js'));
    const { EnhanceAllUI } = await import(chrome.runtime.getURL('modules/enhance-all/enhance-all-ui.js'));
    const { FieldDistributor } = await import(chrome.runtime.getURL('modules/enhance-all/field-distributor.js'));

    // Initialize the assistant
    class AuctionetCatalogingAssistant {
      constructor() {
        // Initialize quality analyzer first since other managers depend on it
        this.qualityAnalyzer = new QualityAnalyzer();
        this.dataExtractor = new DataExtractor();
        
        // Initialize AI-only SearchQuerySSoT
        this.apiManager = new APIManager();
        this.searchQuerySSoT = new SearchQuerySSoT(this.apiManager);
        
        // Initialize other managers - UPDATED TO USE NEW MODULAR SYSTEM
        this.dashboardManager = new DashboardManagerV2();
        this.salesAnalysisManager = new SalesAnalysisManager();
        this.uiManager = new UIManager(this.apiManager, this.qualityAnalyzer);
        
        // Set up quality analyzer dependencies first
        this.qualityAnalyzer.setDataExtractor(this.dataExtractor);
        this.qualityAnalyzer.setDashboardManager(this.dashboardManager);
        
        // Get SearchFilterManager from QualityAnalyzer (properly connected with SearchTermExtractor)
        this.searchFilterManager = this.qualityAnalyzer.searchFilterManager;
        
        // Wire up AI-only SearchQuerySSoT to all components
        this.qualityAnalyzer.setSearchQuerySSoT(this.searchQuerySSoT);
        this.salesAnalysisManager.setSearchQuerySSoT(this.searchQuerySSoT);
        this.searchFilterManager.setSearchQuerySSoT(this.searchQuerySSoT);
        this.dashboardManager.setSearchQuerySSoT(this.searchQuerySSoT);
        
        // 🔧 CRITICAL FIX: Wire DashboardManager to SalesAnalysisManager
        this.salesAnalysisManager.setDashboardManager(this.dashboardManager);
        
        // CRITICAL FIX: Set up dependencies in correct order
        this.qualityAnalyzer.salesAnalysisManager = this.salesAnalysisManager; // MUST be before setApiManager
        this.qualityAnalyzer.setApiManager(this.apiManager); // Now this can properly inject into salesAnalysisManager
        
        // CRITICAL FIX: Ensure dashboard manager has direct ApiManager reference for hot reload
        this.dashboardManager.setApiManager(this.apiManager);
        
        // Initialize Enhance All system
        this.enhanceAllManager = new EnhanceAllManager();
        this.enhanceAllUI = new EnhanceAllUI();
        this.fieldDistributor = new FieldDistributor();

        // Wire enhance-all dependencies
        this.enhanceAllManager.setApiManager(this.apiManager);
        this.enhanceAllManager.setDataExtractor(this.dataExtractor);
        this.enhanceAllManager.setQualityAnalyzer(this.qualityAnalyzer);
        this.enhanceAllManager.setUI(this.enhanceAllUI);

        // Reuse existing biography system for Tier 2 maker context
        if (this.qualityAnalyzer.biographyKBCard) {
          this.enhanceAllManager.setBiographyKBCard(this.qualityAnalyzer.biographyKBCard);
        }

        this.enhanceAllUI.setEnhanceAllManager(this.enhanceAllManager);
        this.enhanceAllUI.setFieldDistributor(this.fieldDistributor);

        this.fieldDistributor.setQualityAnalyzer(this.qualityAnalyzer);
        this.fieldDistributor.setUIManager(this.uiManager);

        // Initialize condition guidance system
        this.dismissedTooltips = new Set();
        this.activeTooltips = new Map();
        this.setupConditionGuidanceSystem();
        
        this.init();
        this.setupEventListeners();
        
        // Make assistant globally accessible for component communication
        window.auctionetAssistant = this;
      }

      // Condition guidance CSS is now loaded via manifest.json → styles.css
      // This method is kept as a no-op for backward compatibility with call sites.
      injectConditionGuidanceCSS() {
        // CSS moved to styles.css — nothing to inject at runtime
      }

      async init() {
        await this.apiManager.loadSettings();

        this.uiManager.injectUI();
        this.enhanceAllUI.injectEnhanceAllButton();
        this.attachEventListeners();

        // Run initial quality analysis after API key is loaded
        await this.uiManager.runInitialQualityAnalysis();
      }

      setupEventListeners() {
        // Listen for API key changes (stored in local for security)
        chrome.storage.onChanged.addListener((changes, namespace) => {
          if (namespace === 'local' && changes.anthropicApiKey) {
            this.apiManager.apiKey = changes.anthropicApiKey.newValue;
          }
        });
        
        // Listen for messages from popup
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
          if (request.type === 'refresh-api-key') {
            this.apiManager.loadSettings();
            sendResponse({ success: true });
          } else if (request.type === 'refresh-settings') {
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
        
        checkboxSelectors.forEach(selector => {
          const checkbox = document.querySelector(selector);
          if (checkbox) {
            checkbox.addEventListener('change', () => {
              this.updateConditionButtonState();
            });
          }
        });
        
        // Fallback: search for any checkbox with "Inga anmärkningar" text nearby
        const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
        
        allCheckboxes.forEach(checkbox => {
          const parent = checkbox.parentElement;
          const textContent = parent ? parent.textContent : '';
          if (textContent.includes('Inga anmärkningar') || textContent.includes('anmärkningar')) {
            checkbox.addEventListener('change', () => {
              this.updateConditionButtonState();
            });
          }
        });
        
        // Note: Initial button state update will be called after UI is injected
      }

      updateConditionButtonState() {
        const isNoRemarksChecked = this.isNoRemarksChecked();
        
        const conditionButton = document.querySelector('[data-field-type="condition"]');
        
        if (conditionButton) {
          if (isNoRemarksChecked) {
            conditionButton.disabled = true;
            conditionButton.style.opacity = '0.5';
            conditionButton.style.cursor = 'not-allowed';
            conditionButton.title = 'Kondition kan inte förbättras när "Inga anmärkningar" är markerat';
          } else {
            conditionButton.disabled = false;
            conditionButton.style.opacity = '1';
            conditionButton.style.cursor = 'pointer';
            conditionButton.title = 'Förbättra kondition';
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
            // Apply the same logic as above
            if (isNoRemarksChecked) {
              foundConditionButton.disabled = true;
              foundConditionButton.style.opacity = '0.5';
              foundConditionButton.style.cursor = 'not-allowed';
              foundConditionButton.title = 'Kondition kan inte förbättras när "Inga anmärkningar" är markerat';
            } else {
              foundConditionButton.disabled = false;
              foundConditionButton.style.opacity = '1';
              foundConditionButton.style.cursor = 'pointer';
              foundConditionButton.title = 'Förbättra kondition';
            }
          }
        }
      }

      attachEventListeners() {
        // Individual field buttons (exclude master button)
        const buttons = document.querySelectorAll('.ai-assist-button:not(.ai-master-button)');
        
        buttons.forEach(button => {
          button.addEventListener('click', (e) => {
            e.preventDefault();
            const fieldType = e.target.dataset.fieldType;
            if (fieldType) {
              this.improveField(fieldType);
            }
          });
        });

        // Master button (separate handler)
        const masterButton = document.querySelector('.ai-master-button');
        if (masterButton) {
          masterButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.improveAllFields();
          });
        }
        
        // Update condition button state after buttons are attached and UI is ready
        setTimeout(() => {
          this.updateConditionButtonState();
        }, 500); // Increased delay to ensure UI is fully ready
      }

      async improveField(fieldType) {
        // Check if trying to improve condition when "Inga anmärkningar" is checked
        if (fieldType === 'condition' && this.isNoRemarksChecked()) {
          this.showFieldErrorIndicator(fieldType, 'Kondition kan inte förbättras när "Inga anmärkningar" är markerat. Avmarkera checkboxen först.');
          return;
        }
        
        // Ensure API key is loaded
        if (!this.apiManager.apiKey) {
          await this.apiManager.loadSettings();
        }
        
        // Check if API key is still missing
        if (!this.apiManager.apiKey) {
          this.showFieldErrorIndicator(fieldType, 'API key not configured. Please set your Anthropic API key in the extension popup.');
          return;
        }
        
        const itemData = this.dataExtractor.extractItemData();
        
        // Assess data quality for hallucination prevention (skip for title corrections)
        if (fieldType !== 'title-correct') {
          const qualityAssessment = this.qualityAnalyzer.assessDataQuality(itemData, fieldType);
          
          if (qualityAssessment.needsMoreInfo) {
            this.showFieldSpecificInfoDialog(fieldType, qualityAssessment.missingInfo, itemData);
            return;
          }
        }
        
        this.showFieldLoadingIndicator(fieldType);
        
        try {
          const improved = await this.apiManager.callClaudeAPI(itemData, fieldType);
          
          // For single field improvements, extract the specific field value  
          // Handle title-correct mapping to title field
          const responseField = fieldType === 'title-correct' ? 'title' : fieldType;
          const value = improved[responseField];
          if (value) {
            this.uiManager.applyImprovement(fieldType, value);
            this.showFieldSuccessIndicator(fieldType);
            
            // Clear stale FAQ hints, then run full re-analysis (includes hint refresh)
            document.querySelectorAll('.faq-hint').forEach(h => h.remove());
            setTimeout(() => this.qualityAnalyzer.analyzeQuality(), 800);
          } else {
            throw new Error(`No ${fieldType} value in response`);
          }
        } catch (error) {
          console.error('Error improving field:', error);
          this.showFieldErrorIndicator(fieldType, error.message);
        }
      }

      async improveAllFields() {
        // Ensure API key is loaded
        if (!this.apiManager.apiKey) {
          await this.apiManager.loadSettings();
        }
        
        // Check if API key is still missing
        if (!this.apiManager.apiKey) {
          this.showFieldErrorIndicator('all', 'API key not configured. Please set your Anthropic API key in the extension popup.');
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
            <h3>📋 Behöver mer information för ${escapeHTML(fieldName)}</h3>
            <p>Enligt Auctionets kvalitetskrav behövs mer detaljerad information innan ${escapeHTML(fieldName)} kan förbättras.</p>
            
            <div class="missing-info">
              <h4>Lägg till information om:</h4>
              <ul>
                ${missingInfo.map(info => `<li>${escapeHTML(infoMessages[info] || info)}</li>`).join('')}
              </ul>
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
            <h3>⚡ Förbättra ${escapeHTML(fieldName)}</h3>
            <p>Redo att förbättra ${escapeHTML(fieldName)} enligt Auctionets katalogiseringsstandard.</p>
            
            <div class="dialog-buttons">
              <button class="btn btn-link" id="cancel-settings-dialog">Avbryt</button>
              <button class="btn btn-primary" id="proceed-with-ai" style="background: #007cba;">Förbättra ${escapeHTML(fieldName)}</button>
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
        
        // Close on background click
        dialog.querySelector('.dialog-overlay').addEventListener('click', () => {
          dialog.remove();
        });
      }

      async proceedWithAIImprovement(fieldType) {
        this.showFieldLoadingIndicator(fieldType);
        
        // Don't reload settings here - they were just set by the dialog

        
        try {
          const itemData = this.dataExtractor.extractItemData();

          
          // For "all" improvements, exclude condition if "Inga anmärkningar" is checked
          let actualFieldType = fieldType;
          if (fieldType === 'all' && this.isNoRemarksChecked()) {
  
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
          
          this.showFieldSuccessIndicator(fieldType);
          
          // Clear stale FAQ hints immediately, then run full re-analysis (includes hint refresh)
          document.querySelectorAll('.faq-hint').forEach(h => h.remove());
          setTimeout(() => this.qualityAnalyzer.analyzeQuality(), 800);
        } catch (error) {
          console.error('Error improving field:', error);
          this.showFieldErrorIndicator(fieldType, error.message);
        }
      }

      getFieldSpecificTips(fieldType, data) {
        switch(fieldType) {
          case 'title':
            return `
              <div class="field-tips">
                <h4>💡 Tips för bättre titel:</h4>
                <p>Lägg till information i beskrivningen om material, teknik och tidsperiod för en mer exakt titel enligt Auctionets standarder.</p>
              </div>
            `;
          case 'description':
            return `
              <div class="field-tips">
                <h4>💡 Tips för bättre beskrivning:</h4>
                <p>Inkludera mått, material, tillverkningsteknik och eventuell signering eller märkning för en professionell beskrivning.</p>
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
                <p>Mer detaljerad information i titel och beskrivning ger bättre sökord som inte bara upprepar befintlig text.</p>
              </div>
            `;
          case 'all':
            return `
              <div class="field-tips">
                <h4>💡 Tips för bättre katalogisering:</h4>
                <p>Lägg till mer specifik information i beskrivningen för bättre resultat vid förbättring av alla fält.</p>
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

        
        const itemData = this.dataExtractor.extractItemData();
        
        if (fieldType === 'all') {
          this.showFieldLoadingIndicator('all');
          
          try {
            const improvements = await this.apiManager.callClaudeAPI(itemData, 'all');
            this.applyAllImprovements(improvements);
          } catch (error) {
            this.showFieldErrorIndicator('all', error.message);
          }
          return;
        }
        
        // For individual fields
        this.showFieldLoadingIndicator(fieldType);
        
        try {
          const improved = await this.apiManager.callClaudeAPI(itemData, fieldType);

          // Handle title-correct mapping to title field
          const responseField = fieldType === 'title-correct' ? 'title' : fieldType;
          const value = improved[responseField];
          if (value) {
            this.uiManager.applyImprovement(fieldType, value);
            this.showFieldSuccessIndicator(fieldType);
            
            // Clear stale FAQ hints, then re-analyze after DOM settles
            document.querySelectorAll('.faq-hint').forEach(h => h.remove());
            setTimeout(() => this.qualityAnalyzer.analyzeQuality(), 800);
          } else {
            throw new Error(`No ${fieldType} value in response`);
          }
        } catch (error) {
          console.error('Error improving field:', error);
          this.showFieldErrorIndicator(fieldType, error.message);
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
        
        this.showFieldSuccessIndicator('all');
        // Clear stale FAQ hints immediately, then re-analyze after DOM settles
        document.querySelectorAll('.faq-hint').forEach(h => h.remove());
        setTimeout(() => this.qualityAnalyzer.analyzeQuality(), 800);
      }

      // Field-specific loading indicator methods - delegate to main content.js implementation
      showFieldLoadingIndicator(fieldType) {

        this.fallbackShowFieldLoadingIndicator(fieldType);
      }

      showFieldSuccessIndicator(fieldType) {

        this.fallbackShowFieldSuccessIndicator(fieldType);
      }

      showFieldErrorIndicator(fieldType, message) {

        this.fallbackShowFieldErrorIndicator(fieldType, message);
      }

      // Fallback implementations with actual animations - EXACT copy from Add Items page
      fallbackShowFieldLoadingIndicator(fieldType) {

        
        // Remove any existing loading states first
        this.fallbackRemoveFieldLoadingIndicator(fieldType);
        
        let targetField;
        if (fieldType === 'all') {
          // For "all" - show loading on master button AND all individual fields
          const masterButton = document.querySelector('.ai-master-button');
          if (masterButton) {
            masterButton.textContent = '⏳ Kontrollerar...';
            masterButton.disabled = true;
            masterButton.style.opacity = '0.7';
          }
          
          // Show loading animation on all fields simultaneously
          const allFieldTypes = ['title', 'description', 'condition', 'keywords'];
          allFieldTypes.forEach(type => {
            this.fallbackShowFieldLoadingIndicator(type);
          });
          return;
        }

        // Get the specific field - EXACT same as Add Items page
        const fieldMap = {
          'title': '#item_title_sv',
          'title-correct': '#item_title_sv',  // title-correct applies to title field
          'description': '#item_description_sv', 
          'condition': '#item_condition_sv',
          'keywords': '#item_hidden_keywords'
        };
        
        targetField = document.querySelector(fieldMap[fieldType]);
        
        if (!targetField) return;
        
        // Find the field container (parent element that will hold the overlay) - EXACT same logic
        let fieldContainer = targetField.parentElement;
        
        // For textareas and inputs, we might need to go up one more level if it's in a wrapper
        if (fieldContainer.classList.contains('ai-button-wrapper') || fieldContainer.tagName === 'LABEL') {
          fieldContainer = fieldContainer.parentElement;
        }
        
        // Add loading class to container - EXACT same as Add Items page
        fieldContainer.classList.add('field-loading');
        
        // Create spinner overlay - EXACT same HTML structure
        const overlay = document.createElement('div');
        overlay.className = 'field-spinner-overlay';
        overlay.dataset.fieldType = fieldType;
        overlay.innerHTML = `
          <div class="ai-spinner"></div>
          <div class="ai-processing-text">Förbättrar...</div>
        `;
        
        // Position overlay over the field - EXACT same positioning logic
        const fieldRect = targetField.getBoundingClientRect();
        const containerRect = fieldContainer.getBoundingClientRect();
        
        // Calculate relative position - EXACT same calculation
        overlay.style.position = 'absolute';
        overlay.style.top = `${fieldRect.top - containerRect.top}px`;
        overlay.style.left = `${fieldRect.left - containerRect.left}px`;
        overlay.style.width = `${fieldRect.width}px`;
        overlay.style.height = `${fieldRect.height}px`;
        
        // Ensure the container has relative positioning
        if (!fieldContainer.style.position || fieldContainer.style.position === 'static') {
          fieldContainer.style.position = 'relative';
        }
        
        // Add overlay to container - EXACT same as Add Items page
        fieldContainer.appendChild(overlay);
        
        
      }

      fallbackShowFieldSuccessIndicator(fieldType) {

        
        // Remove loading state - EXACT same as Add Items page
        this.fallbackRemoveFieldLoadingIndicator(fieldType);
        
        if (fieldType === 'all') {
          // Reset master button - EXACT same as Add Items page
          const masterButton = document.querySelector('.ai-master-button');
          if (masterButton) {
            masterButton.textContent = '✅ Klart!';
            setTimeout(() => {
              masterButton.textContent = 'Förbättra alla fält';
              masterButton.disabled = false;
              masterButton.style.opacity = '1';
            }, 2000);
          }
          
          // Show success on all individual fields
          const allFieldTypes = ['title', 'description', 'condition', 'keywords'];
          allFieldTypes.forEach(type => {
            this.fallbackShowFieldSuccessIndicator(type);
          });
          return;
        }
        
        // Get the specific field and apply success flash - EXACT same as Add Items page
        const fieldMap = {
          'title': '#item_title_sv',
          'title-correct': '#item_title_sv',  // title-correct applies to title field
          'description': '#item_description_sv',
          'condition': '#item_condition_sv', 
          'keywords': '#item_hidden_keywords'
        };
        
        const targetField = document.querySelector(fieldMap[fieldType]);
        if (targetField) {
          targetField.classList.add('field-success');
          
          // Remove success class after animation - EXACT same timing
          setTimeout(() => {
            targetField.classList.remove('field-success');
          }, 600);
        }
      }

      fallbackShowFieldErrorIndicator(fieldType, message) {
        
        // Remove loading state - EXACT same as Add Items page
        this.fallbackRemoveFieldLoadingIndicator(fieldType);
        
        if (fieldType === 'all') {
          // Reset master button - EXACT same as Add Items page
          const masterButton = document.querySelector('.ai-master-button');
          if (masterButton) {
            masterButton.textContent = '❌ Fel uppstod';
            masterButton.disabled = false;
            masterButton.style.opacity = '1';
            setTimeout(() => {
              masterButton.textContent = 'Förbättra alla fält';
            }, 3000);
          }
        }
        
        // Show error message - EXACT same as Add Items page
        alert(`Fel vid förbättring av ${fieldType}: ${message}`);
      }

      fallbackRemoveFieldLoadingIndicator(fieldType) {
        if (fieldType === 'all') {
          // Remove loading from all individual fields - EXACT same logic
          const allFieldTypes = ['title', 'description', 'condition', 'keywords'];
          allFieldTypes.forEach(type => {
            this.fallbackRemoveFieldLoadingIndicator(type);
          });
          return;
        }
        
        // Remove loading states for specific field type - EXACT same as Add Items page
        const overlay = document.querySelector(`.field-spinner-overlay[data-field-type="${fieldType}"]`);
        if (overlay) {
          const container = overlay.parentElement;
          container.classList.remove('field-loading');
          overlay.remove();
        }
        
        // Also remove any general loading classes - EXACT same cleanup
        document.querySelectorAll('.field-loading').forEach(container => {
          const overlays = container.querySelectorAll('.field-spinner-overlay');
          if (overlays.length === 0) {
            container.classList.remove('field-loading');
          }
        });
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
        

        
        for (const selector of checkboxSelectors) {
          const checkbox = document.querySelector(selector);
          if (checkbox) {
            if (checkbox.checked) {
              return true;
            }
          }
        }
        
        // Fallback: search for any checkbox with "Inga anmärkningar" text nearby
        const allCheckboxes = document.querySelectorAll('input[type="checkbox"]');
        
        for (const checkbox of allCheckboxes) {
          const parent = checkbox.parentElement;
          const textContent = parent ? parent.textContent : '';
          if (textContent.includes('Inga anmärkningar') || textContent.includes('anmärkningar')) {
            if (checkbox.checked) {
              return true;
            }
          }
        }
        
        return false;
      }

      // Setup condition guidance system - EXACT copy from Add Items page
      setupConditionGuidanceSystem() {
        // Add CSS for tooltips and popup
        this.injectConditionGuidanceCSS();
        
        // Setup live monitoring of condition field
        const conditionField = document.querySelector('#item_condition_sv');
        if (conditionField) {
          // Debounced condition analysis
          const debouncedAnalysis = this.debounce(() => {
            const formData = this.dataExtractor.extractItemData();
            this.analyzeConditionQuality(formData);
          }, 2000);
          
          conditionField.addEventListener('input', debouncedAnalysis);
          conditionField.addEventListener('blur', debouncedAnalysis);
          
          // NEW: IMMEDIATE condition analysis on edit pages since listing already exists
          setTimeout(() => {
            // Debug: Check if dataExtractor is working
            if (!this.dataExtractor) {
              console.error('Edit page: dataExtractor is not available!');
              return;
            }
            
            const formData = this.dataExtractor.extractItemData();
            
            // Force immediate analysis even if dismissed before
            const tooltipId = 'condition-quality';
            this.dismissedTooltips.delete(tooltipId); // Clear any previous dismissal
            
            this.analyzeConditionQuality(formData);
          }, 2000); // Increased delay to ensure page is fully loaded
        } else {
          const allFields = document.querySelectorAll('input, textarea');
          allFields.forEach((field, index) => {
            if (field.id.includes('condition') || field.name.includes('condition')) {
            }
          });
        }
      }

      // Debounce utility - EXACT copy from Add Items page
      debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
          const later = () => {
            clearTimeout(timeout);
            func(...args);
          };
          clearTimeout(timeout);
          timeout = setTimeout(later, wait);
        };
      }

      // Analyze condition quality - EXACT copy from Add Items page
      async analyzeConditionQuality(formData) {
        // Skip if "Inga anmärkningar" (No remarks) is checked
        const noRemarksCheckbox = document.querySelector('input[type="checkbox"][value="Inga anmärkningar"]') || 
                                 document.querySelector('input[type="checkbox"]#item_no_remarks') ||
                                 document.querySelector('input[type="checkbox"][name*="no_remarks"]');
        
        if (noRemarksCheckbox && noRemarksCheckbox.checked) {
          return; // Silent return - no need to log this every time
        }
        
        if (!formData.condition || formData.condition.length < 3) {
          this.showConditionGuidanceTooltip(formData, 'empty');
          return;
        }
        
        // Check if already dismissed in session
        const tooltipId = 'condition-quality';
        if (this.dismissedTooltips.has(tooltipId)) {
          return;
        }
        
        const conditionIssues = this.detectConditionIssues(formData);
        
        if (conditionIssues.length > 0) {
          this.showConditionGuidanceTooltip(formData, 'improve', conditionIssues);
        }
      }

      // Detect condition issues - EXACT copy from Add Items page
      detectConditionIssues(formData) {
        const issues = [];
        const condition = formData.condition || '';
        const cleanCondition = condition.replace(/<[^>]*>/g, '').trim(); // Remove HTML tags
        const conditionLower = cleanCondition.toLowerCase();
        

        
        // CRITICAL: Detect the dreaded "Bruksslitage" alone
        if (conditionLower === 'bruksslitage' || conditionLower === 'bruksslitage.') {
          issues.push({
            type: 'lazy_bruksslitage',
            severity: 'critical',
            title: 'Endast "Bruksslitage" är otillräckligt!',
            message: 'Specificera typ av slitage - var finns repor, nagg, fläckar? Våra kunder förtjänar bättre beskrivningar.',
            impact: 'Leder till missnöjda kunder och fler reklamationer!'
          });
          return issues; // This is the worst case, return immediately
        }
        
        // Detect other vague phrases used alone
        const vagueOnlyPhrases = [
          'normalt slitage',
          'vanligt slitage', 
          'åldersslitage',
          'slitage förekommer',
          'mindre skador',
          'normal wear',
          'gott skick',
          'bra skick',
          'fint skick',
          'mycket gott skick',
          'i gott skick',
          'inga större skador',
          'inga anmärkningar'
        ];
        
        const hasVagueOnly = vagueOnlyPhrases.some(phrase => {
          const conditionWithoutPhrase = conditionLower.replace(phrase, '').trim();
          return conditionLower.includes(phrase) && conditionWithoutPhrase.length < 10;
        });
        
        if (hasVagueOnly) {
          issues.push({
            type: 'vague_only',
            severity: 'high',
            title: 'Vag konditionsbeskrivning',
            message: 'Beskriv specifikt VAR och VILKEN typ av slitage. Kunden vill veta exakt vad de kan förvänta sig.',
            impact: 'Tydligare beskrivningar = nöjdare kunder = färre reklamationer'
          });
        }
        
        // Check length - LOWERED threshold from 20 to 15 characters
        if (cleanCondition.length < 15) {
  
          issues.push({
            type: 'too_short',
            severity: 'high', 
            title: 'För kort konditionsrapport',
            message: 'Lägg till mer specifika detaljer om föremålets skick.',
            impact: 'Detaljerade beskrivningar minskar kundservice-samtal'
          });
        }
        
        // Check for missing location specifics
        if (conditionLower.includes('repor') && !this.hasLocationSpecifics(conditionLower)) {

          issues.push({
            type: 'missing_location',
            severity: 'medium',
            title: 'Specificera var skadorna finns',
            message: 'Ange VAR repor/skador finns - på ytan, kanter, baksidan, etc.',
            impact: 'Kunder vill veta exakt var skadorna är placerade'
          });
        }
        
        // NEW: Check for generic condition terms without details
        const genericTerms = ['slitage', 'skador', 'märken', 'defekter'];
        const hasGenericWithoutDetails = genericTerms.some(term => {
          return conditionLower.includes(term) && !this.hasSpecificDetails(conditionLower);
        });
        
        if (hasGenericWithoutDetails && cleanCondition.length < 25) {
  
          issues.push({
            type: 'generic_without_details',
            severity: 'medium',
            title: 'Generiska termer utan detaljer',
            message: 'Specificera typ av slitage/skador och var de finns.',
            impact: 'Specifika beskrivningar hjälper kunder att förstå föremålets skick'
          });
        }
        

        return issues.slice(0, 2); // Max 2 issues to avoid overwhelming
      }

      // Check for location specifics - EXACT copy from Add Items page
      hasLocationSpecifics(conditionText) {
        const locationWords = [
          'ytan', 'kanter', 'kant', 'baksidan', 'framsidan', 'ovansidan', 'undersidan',
          'handtag', 'fot', 'ben', 'arm', 'sits', 'rygg', 'ram', 'glas', 'urtavla',
          'boett', 'länk', 'hörn', 'mittpartiet', 'botten', 'topp', 'sida', 'insida'
        ];
        return locationWords.some(word => conditionText.includes(word));
      }
      
      // NEW: Check for specific details in condition text
      hasSpecificDetails(conditionText) {
        const specificWords = [
          'repor', 'nagg', 'sprickor', 'fläckar', 'missfärgning', 'rostfläckar',
          'djupa', 'ytliga', 'små', 'stora', 'mindre', 'större', 'synliga',
          'tydliga', 'svåra att upptäcka', 'genomgående', 'hårfina',
          'ca', 'ungefär', 'mm', 'cm', 'flera', 'enstaka', 'spridda'
        ];
        return specificWords.some(word => conditionText.includes(word));
      }

      // Condition guidance tooltip DISABLED - replaced by inline FAQ hints system
      async showConditionGuidanceTooltip(formData, type, issues = []) {
        return; // Inline hints now handle condition guidance
        const conditionField = document.querySelector('#item_condition_sv');
        if (!conditionField) return;

        const tooltipId = 'condition-quality';
        

        
        // Add delay for smooth UX - MUCH FASTER on edit pages
        setTimeout(() => {
          // Double-check tooltip wasn't dismissed during delay
          if (this.dismissedTooltips.has(tooltipId)) return;
          
          let content, title, severity;
          
          if (type === 'empty') {
            title = 'Konditionsrapport saknas';
            severity = 'high';
            content = this.getConditionGuidanceContent(formData, type);
          } else {
            const primaryIssue = issues[0];
            title = primaryIssue.title;
            severity = primaryIssue.severity;
            content = this.getConditionGuidanceContent(formData, type, issues);
          }
          
          const tooltipContent = `
            <div class="tooltip-header condition-${severity}">
              ${title.toUpperCase()}
            </div>
            <div class="tooltip-body">
              ${content}
            </div>
          `;

          const buttons = [
            {
              text: 'Förbättra',
              className: 'btn-primary',
              onclick: () => {
                this.dismissTooltip(tooltipId);
                this.dismissedTooltips.add(tooltipId);
                this.improveField('condition');
              }
            },
            {
              text: 'Guidning',
              className: 'btn-info',
              onclick: () => {
                this.showConditionGuidePopup(formData);
              }
            },
            {
              text: 'Ignorera',
              className: 'btn-secondary',
              onclick: () => {
                this.dismissTooltip(tooltipId);
                this.dismissedTooltips.add(tooltipId);
              }
            }
          ];

          this.createTooltip({
            id: tooltipId,
            targetElement: conditionField,
            content: tooltipContent,
            buttons,
            side: 'left',
            type: 'condition-guidance'
          });
          
  
        }, 200);
      }

      // Get condition guidance content - EXACT copy from Add Items page
      getConditionGuidanceContent(formData, type, issues = []) {
        if (type === 'empty') {
          const category = this.determineItemCategory(formData);
          return `
            <div class="guidance-main">
              <strong>Konditionsrapport krävs för professionell katalogisering</strong><br>
              Kunder förväntar sig detaljerade beskrivningar av föremålets skick.
            </div>
            <div class="category-hint">
              <strong>För ${category.name}:</strong> Kontrollera ${category.checkPoints.join(', ')}
            </div>
          `;
        }
        
        // For issues
        const primaryIssue = issues[0];
        let content = `
          <div class="guidance-main">
            <strong>${primaryIssue.message}</strong>
          </div>
          <div class="guidance-impact">
            💡 ${primaryIssue.impact}
          </div>
        `;
        
        if (issues.length > 1) {
          content += `
            <div class="additional-issues">
              <strong>Ytterligare förbättringar:</strong> ${issues.slice(1).map(issue => issue.message).join(' ')}
            </div>
          `;
        }
        
        return content;
      }

      // Determine item category - Enhanced to use actual form category selection
      determineItemCategory(formData) {
        const title = (formData.title || '').toLowerCase();
        const description = (formData.description || '').toLowerCase();
        const category = (formData.category || '').toLowerCase();
        const combined = title + ' ' + description + ' ' + category;
        
        // PRIORITY 1: Check actual selected category from dropdown
        const selectedCategory = this.getSelectedCategoryFromDropdown();
        if (selectedCategory) {
          const categoryGuide = this.mapAuctionetCategoryToGuide(selectedCategory);
          if (categoryGuide) {
            return categoryGuide;
          }
        }
        
        // PRIORITY 2: Fall back to text-based detection if no dropdown category or unmapped

        
        // Watch/Clock category - Enhanced detection
        if (combined.match(/\b(ur|klocka|armbandsur|fickur|väckarklocka|rolex|omega|patek|cartier|tissot|longines|seiko|automatisk|manuell|quartz|kronograf|datum|helium|vattentät)\b/)) {
          return {
            name: 'armbandsur',
            checkPoints: ['urtavla', 'boett', 'länk/armband', 'glas', 'funktion', 'krona', 'tryckare'],
            conditionFocus: ['repor på boett', 'slitage på länk', 'märken på urtavla', 'funktionsstatus', 'glas skador', 'krona funktion']
          };
        }
        
        // Jewelry category - Enhanced detection
        if (combined.match(/\b(ring|halsband|armband|brosch|örhängen|smycke|smycken|berlock|kedja|hänge|manschettknappar|tiara|diadem|guld|silver|platina|diamant|ruby|rubin|safir|smaragd|pärla|pärlan|brilliant|karat|stempel|hallstämpel)\b/)) {
          return {
            name: 'smycken',
            checkPoints: ['stenar', 'fattningar', 'lås', 'kedja/band', 'ytbehandling', 'stämplar', 'infattning'],
            conditionFocus: ['lösa stenar', 'slitage på fattning', 'lås funktion', 'repor på metall', 'matthet på ytan', 'kedjans flexibilitet']
          };
        }
        
        // Art category - Enhanced detection for all art forms
        if (combined.match(/\b(målning|tavla|konst|konstnär|signerad|signatur|duk|pannå|ram|akvarell|oljemålning|tempera|litografi|grafik|tryck|etsning|träsnitt|linoleumsnitt|serigrafik|affisch|poster|teckning|skiss|blyerts|kol|krita|pastell|akryl|gouache|mixed media|collage|montage)\b/)) {
          return {
            name: 'konstverk',
            checkPoints: ['duk/papper', 'färger', 'ram', 'signatur', 'baksida', 'upphängning', 'tryckyta'],
            conditionFocus: ['sprickor i färg', 'fläckar', 'ramens skick', 'dukens spänning', 'färgförändring', 'pappersqualitet', 'inramning']
          };
        }
        
        // Furniture category - Enhanced detection
        if (combined.match(/\b(stol|bord|skåp|möbel|möbler|soffa|fåtölj|säng|sängbord|byrå|kommod|sekretär|bokhylla|vitrinskåp|matsalsbord|soffbord|köksbord|pinnstol|karmstol|sits|rygg|ben|låda|dörr|handtag|beslag|faner|massiv|ek|bok|björk|teak|jakaranda|mahogny|valnöt)\b/)) {
          return {
            name: 'möbler',
            checkPoints: ['finish', 'fogar', 'klädsel', 'beslag', 'stabilitet', 'funktion', 'material'],
            conditionFocus: ['repor i finish', 'lossnade fogar', 'fläckar på klädsel', 'skador på beslag', 'instabilitet', 'funktionsfel', 'materialskador']
          };
        }
        
        // Ceramics/Glass category - Enhanced detection
        if (combined.match(/\b(vas|skål|tallrik|kopp|mugg|fat|serveringsskål|porslin|keramik|glas|kristall|flintglas|blyglas|glaskonst|stengods|fajans|terracotta|raku|glasyr|oglaserad|handmålad|dekor|märke|stämpel|signatur|orrefors|kosta|boda|gustavsberg|rörstrand|arabia)\b/)) {
          return {
            name: 'keramik/glas',
            checkPoints: ['nagg', 'sprickor', 'glasyr', 'märkningar', 'reparationer', 'dekor', 'form'],
            conditionFocus: ['nagg på kant', 'hårsprickor', 'krakelering', 'limmarker', 'dekorskador', 'formfel', 'tillverkningsdefekter']
          };
        }
        
        // Textiles category - NEW category for textiles and clothing
        if (combined.match(/\b(matta|tekstil|tyg|kläder|klänning|kostym|jacka|väska|handväska|necessär|sjal|halsduk|handskar|hatt|mössa|skor|textilkonst|gobelänger|broderi|spets|siden|sammet|linne|bomull|ull|kashmir|mohair|vintage|couture|designer)\b/)) {
          return {
            name: 'textilier',
            checkPoints: ['tyg', 'sömmar', 'dragkedjor', 'knappar', 'foder', 'form', 'färg'],
            conditionFocus: ['fläckar', 'hål', 'slitage på tyg', 'trasiga sömmar', 'saknade knappar', 'formförändringar', 'missfärgningar']
          };
        }
        
        // Books/Documents category - NEW category
        if (combined.match(/\b(bok|böcker|manuskript|dokument|karta|affisch|tidning|tidskrift|album|fotografi|vykort|brevkort|autograf|dedikation|förstaupplaga|inkunabel|antikvarisk|pergament|papper|tryck|band|skinn|klotband|häftad|inbunden)\b/)) {
          return {
            name: 'böcker/dokument',
            checkPoints: ['papper', 'band', 'ryggrad', 'text', 'illustrationer', 'bindning'],
            conditionFocus: ['papperskvalitet', 'fläckar', 'veck', 'trasiga sidor', 'bandskador', 'ryggrad slitage', 'fukskador']
          };
        }
        
        // Default/General category
        return {
          name: 'föremål',
          checkPoints: ['ytor', 'kanter', 'funktionalitet', 'märkningar', 'material', 'konstruktion'],
          conditionFocus: ['synliga skador', 'slitage platser', 'funktionsstatus', 'reparationer', 'materialdefekter', 'konstruktionsfel']
        };
      }

      // NEW: Get selected category from the actual dropdown
      getSelectedCategoryFromDropdown() {
        // Try multiple methods to get the selected category
        
        // Method 1: Check the original select element
        const selectElement = document.querySelector('#item_category_id');
        if (selectElement && selectElement.value) {
          const selectedOption = selectElement.querySelector(`option[value="${selectElement.value}"]`);
          if (selectedOption && selectedOption.textContent.trim()) {
  
            return selectedOption.textContent.trim();
          }
        }
        
        // Method 2: Check Chosen.js implementation
        const chosenElement = document.querySelector('#item_category_id_chosen .chosen-single span');
        if (chosenElement && chosenElement.textContent.trim()) {
          
          return chosenElement.textContent.trim();
        }
        
        // Method 3: Check any visible category text in the form
        const chosenContainer = document.querySelector('.chosen-container .chosen-single span');
        if (chosenContainer && chosenContainer.textContent.trim()) {
          
          return chosenContainer.textContent.trim();
        }
        
        return null;
      }

      // NEW: Map Auctionet category names to our condition guidance categories
      mapAuctionetCategoryToGuide(categoryText) {
        const categoryLower = categoryText.toLowerCase();
        
        // Glass categories
        if (categoryLower.includes('glas')) {
          return {
            name: 'keramik/glas',
            checkPoints: ['nagg', 'sprickor', 'glasyr', 'märkningar', 'reparationer', 'dekor', 'form'],
            conditionFocus: ['nagg på kant', 'hårsprickor', 'krakelering', 'limmarker', 'dekorskador', 'formfel', 'tillverkningsdefekter']
          };
        }
        
        // Ceramics and Porcelain categories
        if (categoryLower.includes('keramik') || categoryLower.includes('porslin')) {
          return {
            name: 'keramik/glas',
            checkPoints: ['nagg', 'sprickor', 'glasyr', 'märkningar', 'reparationer', 'dekor', 'form'],
            conditionFocus: ['nagg på kant', 'hårsprickor', 'krakelering', 'limmarker', 'dekorskador', 'formfel', 'tillverkningsdefekter']
          };
        }
        
        // Watch categories
        if (categoryLower.includes('klockor') || categoryLower.includes('ur') || categoryLower.includes('armbandsur')) {
          return {
            name: 'armbandsur',
            checkPoints: ['urtavla', 'boett', 'länk/armband', 'glas', 'funktion', 'krona', 'tryckare'],
            conditionFocus: ['repor på boett', 'slitage på länk', 'märken på urtavla', 'funktionsstatus', 'glas skador', 'krona funktion']
          };
        }
        
        // Jewelry categories
        if (categoryLower.includes('smycken') || categoryLower.includes('ädelstenar') || 
            categoryLower.includes('ringar') || categoryLower.includes('armband') || 
            categoryLower.includes('collier') || categoryLower.includes('örhängen') ||
            categoryLower.includes('broscher')) {
          return {
            name: 'smycken',
            checkPoints: ['stenar', 'fattningar', 'lås', 'kedja/band', 'ytbehandling', 'stämplar', 'infattning'],
            conditionFocus: ['lösa stenar', 'slitage på fattning', 'lås funktion', 'repor på metall', 'matthet på ytan', 'kedjans flexibilitet']
          };
        }
        
        // Art categories
        if (categoryLower.includes('konst') || categoryLower.includes('måleri') || 
            categoryLower.includes('grafik') || categoryLower.includes('skulptur') ||
            categoryLower.includes('teckningar') || categoryLower.includes('fotografi')) {
          return {
            name: 'konstverk',
            checkPoints: ['duk/papper', 'färger', 'ram', 'signatur', 'baksida', 'upphängning', 'tryckyta'],
            conditionFocus: ['sprickor i färg', 'fläckar', 'ramens skick', 'dukens spänning', 'färgförändring', 'pappersqualitet', 'inramning']
          };
        }
        
        // Furniture categories
        if (categoryLower.includes('möbler') || categoryLower.includes('bord') || 
            categoryLower.includes('stolar') || categoryLower.includes('fåtöljer') ||
            categoryLower.includes('soffor') || categoryLower.includes('skåp') ||
            categoryLower.includes('byråar') || categoryLower.includes('matsalsmöbler')) {
          return {
            name: 'möbler',
            checkPoints: ['finish', 'fogar', 'klädsel', 'beslag', 'stabilitet', 'funktion', 'material'],
            conditionFocus: ['repor i finish', 'lossnade fogar', 'fläckar på klädsel', 'skador på beslag', 'instabilitet', 'funktionsfel', 'materialskador']
          };
        }
        
        // Textiles categories
        if (categoryLower.includes('mattor') || categoryLower.includes('textil') || 
            categoryLower.includes('vintagekläder') || categoryLower.includes('accessoarer')) {
          return {
            name: 'textilier',
            checkPoints: ['tyg', 'sömmar', 'dragkedjor', 'knappar', 'foder', 'form', 'färg'],
            conditionFocus: ['fläckar', 'hål', 'slitage på tyg', 'trasiga sömmar', 'saknade knappar', 'formförändringar', 'missfärgningar']
          };
        }
        
        // Books categories
        if (categoryLower.includes('böcker') || categoryLower.includes('kartor') || 
            categoryLower.includes('handskrifter') || categoryLower.includes('autografer')) {
          return {
            name: 'böcker/dokument',
            checkPoints: ['papper', 'band', 'ryggrad', 'text', 'illustrationer', 'bindning'],
            conditionFocus: ['papperskvalitet', 'fläckar', 'veck', 'trasiga sidor', 'bandskador', 'ryggrad slitage', 'fukskador']
          };
        }
        
        // Silver & Metal categories
        if (categoryLower.includes('silver') || categoryLower.includes('metall') || 
            categoryLower.includes('tenn') || categoryLower.includes('mässing') ||
            categoryLower.includes('koppar') || categoryLower.includes('nysilver')) {
          return {
            name: 'silver/metall',
            checkPoints: ['yta', 'stämplar', 'fogar', 'handtag', 'funktion', 'patina'],
            conditionFocus: ['oxidering', 'repor på yta', 'bucklor', 'lösa delar', 'stämplarnas läsbarhet', 'polering slitage']
          };
        }
        
        return null; // No mapping found, will fall back to text analysis
      }

      // Show condition guide popup - EXACT copy from Add Items page
      async showConditionGuidePopup(formData) {
        const category = this.determineItemCategory(formData);
        
        // Create comprehensive condition guide popup
        const popup = document.createElement('div');
        popup.className = 'condition-guide-popup-overlay';
        popup.innerHTML = `
          <div class="condition-guide-popup">
            <div class="popup-header">
              <h3>🎯 Professionell Konditionsrapportering</h3>
              <button class="popup-close" type="button">✕</button>
            </div>
            <div class="popup-content">
              ${this.getConditionGuideContent(category)}
            </div>
          </div>
        `;
        
        // Add to page
        document.body.appendChild(popup);
        
        // Add event listeners
        const closeBtn = popup.querySelector('.popup-close');
        closeBtn.addEventListener('click', () => {
          popup.remove();
        });
        
        // Close on overlay click
        popup.addEventListener('click', (e) => {
          if (e.target === popup) {
            popup.remove();
          }
        });
        
        // Close on escape key
        const handleEscape = (e) => {
          if (e.key === 'Escape') {
            popup.remove();
            document.removeEventListener('keydown', handleEscape);
          }
        };
        document.addEventListener('keydown', handleEscape);
        
      }

      // Get condition guide content - EXACT copy from Add Items page
      getConditionGuideContent(category) {
        return `
          <div class="guide-section">
            <h2 class="guide-section-title">Varför detaljerade konditionsrapporter?</h2>
            <div class="guide-text">
              Professionella konditionsrapporter är grunden för framgångsrik auktionsverksamhet. De skapar förtroende, minskar reklamationer och förbättrar kundupplevelsen.
            </div>
            
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-number">40%</div>
                <div class="stat-label">Färre kundservice-samtal</div>
              </div>
              <div class="stat-card">
                <div class="stat-number">25%</div>
                <div class="stat-label">Fler positiva recensioner</div>
              </div>
              <div class="stat-card">
                <div class="stat-number">60%</div>
                <div class="stat-label">Färre returer</div>
              </div>
            </div>
          </div>

          <div class="guide-section">
            <h2 class="guide-section-title">Specifik guide för ${category.name}</h2>
            
            <div class="category-grid">
              <div class="guide-subsection">
                <h3 class="guide-subsection-title">Kontrollpunkter att alltid granska</h3>
                <ul class="guide-list">
                  ${category.checkPoints.map(point => `<li class="guide-list-item">${point}</li>`).join('')}
                </ul>
              </div>
              
              <div class="guide-subsection">
                <h3 class="guide-subsection-title">Beskriv specifikt</h3>
                <ul class="guide-list">
                  ${category.conditionFocus.map(focus => `<li class="guide-list-item">${focus}</li>`).join('')}
                </ul>
              </div>
            </div>
          </div>

          <div class="guide-section">
            <h2 class="guide-section-title">Exempel på konditionsrapporter</h2>
            
            <div class="example-grid">
              <div class="example-card bad">
                <div class="example-header">Undvik detta</div>
                <div class="example-text">"Bruksslitage"</div>
                <div class="example-note">Problem: Kunden vet inte vad de kan förvänta sig</div>
              </div>
              
              <div class="example-card good">
                <div class="example-header">Gör så här istället</div>
                <div class="example-text">${this.getGoodExample(category)}</div>
                <div class="example-note">Resultat: Kunden känner förtroende och vet exakt vad de får</div>
              </div>
            </div>
          </div>

          <div class="guide-section">
            <h2 class="guide-section-title">Professionella riktlinjer</h2>
            
            <div class="guide-subsection">
              <h3 class="guide-subsection-title">Skrivsätt</h3>
              <ul class="guide-list">
                <li class="guide-list-item">Var specifik om placering: "repor på ovansidan", "nagg vid kanten"</li>
                <li class="guide-list-item">Ange storlek på skador: "små repor", "större fläck ca 2 cm"</li>
                <li class="guide-list-item">Beskriv omfattning: "spridda repor", "enstaka nagg"</li>
                <li class="guide-list-item">Vara ärlig: Bättre att överdriva än underdriva skador</li>
              </ul>
            </div>
            
            <div class="guide-subsection">
              <h3 class="guide-subsection-title">Kvalitetskontroll</h3>
              <div class="guide-text">
                Läs igenom din konditionsrapport och fråga dig: "Skulle jag kunna föreställa mig föremålets skick baserat på denna beskrivning?" Om svaret är nej, lägg till mer specifika detaljer.
              </div>
            </div>
          </div>
        `;
      }

      // Get good example - Enhanced with more comprehensive and realistic examples
      getGoodExample(category) {
        const examples = {
          'armbandsur': '"Repor på boettets ovansida och mindre märken på urtavlan vid 3-positionen. Länkarna visar normalt slitage utan djupare skråmor. Krona och tryckare fungerar som de ska. Går vid katalogisering men rekommenderas service."',
          
          'smycken': '"Små repor på metallbandet och mindre slitage på lås-mekanismen. Stenarna sitter fast utan lösa fattningar, en mindre diamant visar lätt matthet. Stämplar tydligt synliga på insidan. Kedjans flexibilitet är normal."',
          
          'konstverk': '"Mindre fläckar i nedre högra hörnet (ca 1x2 cm) och två små hål från tidigare upphängning i övre kanten. Ramens guldbeläggning något nött vid kanter men fast. Inga sprickor i duken, färgerna väl bevarade utan blekningar."',
          
          'möbler': '"Repor och märken på skivans ovansida samt mindre nagg vid främre kanten (ca 5 mm). Benen visar normalt slitage men är stabila utan vacklan. Lådan går lätt att öppna, handtag fast monterat. Faneret intakt utan lösa partier."',
          
          'keramik/glas': '"Små nagg vid mynningen (3-4 st, under 1 mm) och hårfina sprickor i glasyr på utsidan. Botten har mindre repor från användning. Dekor välbevarad, tillverkarmärke tydligt på undersidan. Inga större skador eller reparationer."',
          
          'textilier': '"Allmänt gott skick med enstaka små fläckar på framstycket (ca 5 mm). Sömmar intakta, alla knappar på plats. Lätt missfärgning vid kragen från användning. Tyget behåller sin form, inget hål eller större slitage."',
          
          'böcker/dokument': '"Mindre fläckar på frampärmen och lätt slitage vid rygggradens kanter. Alla sidor kompletta utan veck eller hål. Text och illustrationer tydliga och välbevarade. Bindningen fast, endast mindre lösgöring vid första sidan."',
          
          'silver/metall': '"Repor och märken på ytan från normal användning. Stämplar tydligt läsbara på undersidan. Handtag fast monterat utan vacklan. Lätt oxidering i fördjupningar, normal patina på ytan. Inga bucklor eller strukturella skador."',
          
          'föremål': '"Repor på främre ytan och mindre märken vid handtagen. Funktionen fungerar som den ska men visar tecken på regelbunden användning. Material i gott skick utan sprickor eller andra strukturella skador."'
        };
        
        return examples[category.name] || examples['föremål'];
      }

      // Create tooltip - EXACT copy from Add Items page
      createTooltip(config) {
        const tooltip = document.createElement('div');
        tooltip.id = `ai-tooltip-${config.id}`;
        tooltip.className = `ai-tooltip add-items-tooltip ${config.type}`;
        
        // Build the complete tooltip structure
        let tooltipHTML = '<div class="tooltip-arrow"></div>';
        
        // Add the content
        tooltipHTML += `<div class="tooltip-content">`;
        tooltipHTML += config.html || config.content;
        
        // Add buttons if provided
        if (config.buttons && config.buttons.length > 0) {
          tooltipHTML += '<div class="tooltip-buttons">';
          config.buttons.forEach((button, index) => {
            tooltipHTML += `<button class="tooltip-button ${escapeHTML(button.className || '')}" data-button-index="${index}">${escapeHTML(button.text)}</button>`;
          });
          tooltipHTML += '</div>';
        }
        
        // Add dismiss button if dismissible
        if (config.dismissible !== false) {
          tooltipHTML += '<button class="tooltip-dismiss" type="button">×</button>';
        }
        
        tooltipHTML += '</div>';
        
        tooltip.innerHTML = tooltipHTML;
        
        // Get target element - support both direct element and CSS selector
        let targetElement;
        if (config.targetElement) {
          targetElement = config.targetElement;
        } else if (config.targetSelector) {
          targetElement = document.querySelector(config.targetSelector);
        }
        
        if (targetElement) {
          // Add to body first so positioning calculations work
          document.body.appendChild(tooltip);
          
          // Position the tooltip
          this.positionTooltip(tooltip, targetElement, config.side);
          
          // Setup button event listeners if buttons are provided
          if (config.buttons && config.buttons.length > 0) {
            this.setupTooltipEventListeners(tooltip, config.id, config.buttons, targetElement, config.side);
          }
          
          // Store in active tooltips
          this.activeTooltips.set(config.id, tooltip);
          
          // Add animation class after a small delay for smooth animation
          setTimeout(() => {
            tooltip.classList.add('show');
          }, 50);
          
          return tooltip;
        } else {
          return null;
        }
      }

      // Position tooltip - EXACT copy from Add Items page
      positionTooltip(tooltip, targetElement, side) {
        const targetRect = targetElement.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        
        let left, top;
        const margin = 20;
        
        // Calculate position based on side, allowing off-screen movement
        if (side === 'left') {
          left = targetRect.left - tooltipRect.width - margin;
        } else {
          left = targetRect.right + margin;
        }
        
        // Special positioning for condition tooltips - push down by 1/3 height for better attachment
        if (tooltip.classList.contains('add-items-tooltip--condition-guidance')) {
          top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 3);
        } else {
          // Center vertically relative to target for other tooltips
          top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
        }
        
        // Apply minimal constraints only when target is visible to prevent extreme positioning
        if (targetRect.left >= 0 && targetRect.right <= window.innerWidth) {
          // Target is visible, apply gentle constraints
          if (side === 'left') {
            left = Math.max(-tooltipRect.width + 50, left); // Keep some tooltip visible
          } else {
            left = Math.min(window.innerWidth - 50, left); // Keep some tooltip visible
          }
        }
        
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
        
        // Position arrow to point at target center
        const arrow = tooltip.querySelector('.tooltip-arrow');
        if (arrow) {
          const targetCenterY = targetRect.top + (targetRect.height / 2);
          const tooltipY = parseFloat(tooltip.style.top);
          
          // Adjust arrow position for condition tooltips
          let arrowY;
          if (tooltip.classList.contains('add-items-tooltip--condition-guidance')) {
            // Position arrow higher for condition tooltips since they're pushed down
            arrowY = Math.max(15, Math.min(tooltipRect.height - 15, (targetCenterY - tooltipY) - (tooltipRect.height / 6)));
          } else {
            arrowY = Math.max(15, Math.min(tooltipRect.height - 15, targetCenterY - tooltipY));
          }
          
          arrow.style.top = `${arrowY - 8}px`;
        }
      }

      // Setup tooltip event listeners - EXACT copy from Add Items page
      setupTooltipEventListeners(tooltip, tooltipId, buttons, targetElement, side) {
        // Dismiss button
        const dismissBtn = tooltip.querySelector('.tooltip-dismiss');
        if (dismissBtn) {
          dismissBtn.addEventListener('click', () => {
            this.dismissTooltip(tooltipId);
            this.dismissedTooltips.add(tooltipId);
          });
        }
        
        // Action buttons using data-button-index
        const actionButtons = tooltip.querySelectorAll('.tooltip-button[data-button-index]');
        actionButtons.forEach((btn) => {
          const index = parseInt(btn.getAttribute('data-button-index'));
          if (buttons[index] && buttons[index].onclick) {
            btn.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              buttons[index].onclick();
            });
          }
        });
        
        if (targetElement) {
          const handleScroll = () => {
            // Check if tooltip still exists
            if (document.getElementById(`ai-tooltip-${tooltipId}`)) {
              this.positionTooltip(tooltip, targetElement, side);
            } else {
              // Clean up scroll listener if tooltip is gone
              window.removeEventListener('scroll', handleScroll);
            }
          };
          
          // Add scroll listener
          window.addEventListener('scroll', handleScroll, { passive: true });
          
          // Store cleanup function for tooltip removal
          tooltip._scrollCleanup = () => {
            window.removeEventListener('scroll', handleScroll);
          };
        }
      }

      // Dismiss tooltip - EXACT copy from Add Items page
      dismissTooltip(tooltipId) {
        const tooltip = document.getElementById(`ai-tooltip-${tooltipId}`);
        if (tooltip) {
          // Clean up scroll event listener if it exists
          if (tooltip._scrollCleanup) {
            tooltip._scrollCleanup();
          }
          
          tooltip.remove();
          this.activeTooltips.delete(tooltipId);
        }
      }
    }

    // Initialize the assistant
    new AuctionetCatalogingAssistant();
    
  } catch (error) {
    console.error('Auctionet AI Assistant: Failed to initialize:', error);
  }
})(); 