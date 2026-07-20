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
    const { DashboardAPI } = await import(chrome.runtime.getURL('modules/dashboard-api.js'));
    const { SearchRelevanceMatcher } = await import(chrome.runtime.getURL('modules/search-relevance.js'));
    const { HyperrankUI } = await import(chrome.runtime.getURL('modules/hyperrank/hyperrank-ui.js'));

    // Initialize the assistant
    class AuctionetCatalogingAssistant {
      // Shared field-type -> DOM selector map (edit item page fields)
      static FIELD_SELECTOR_MAP = {
        'title': '#item_title_sv',
        'title-correct': '#item_title_sv',  // title-correct applies to title field
        'description': '#item_description_sv',
        'condition': '#item_condition_sv',
        'keywords': '#item_hidden_keywords'
      };

      // Shared field-type -> Swedish display label map
      static FIELD_DISPLAY_NAMES = {
        'title': 'titeln',
        'description': 'beskrivningen',
        'condition': 'skicket',
        'keywords': 'nyckelorden'
      };

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

        // Initialize HYPERRANK — opt-in aggressive search-rank optimizer
        this.hyperrankUI = new HyperrankUI();
        this.hyperrankUI.setOnRun((mode) => this.hyperrank(mode));

        this.init();
        this.setupEventListeners();
        
        // Make assistant globally accessible for component communication
        window.auctionetAssistant = this;
      }


      async init() {
        await this.apiManager.loadSettings();

        this.uiManager.injectUI();
        this.enhanceAllUI.injectEnhanceAllButton();
        this.hyperrankUI.injectPanel();
        this.attachEventListeners();

        // Run initial quality analysis after API key is loaded
        await this.uiManager.runInitialQualityAnalysis();

        // Show search demand signal (non-blocking, best-effort)
        this.showSearchDemandSignal();
      }

      async showSearchDemandSignal() {
        try {
          const dashAPI = new DashboardAPI();
          const searches = await dashAPI.getSearches();
          if (!searches) return;

          const matcher = new SearchRelevanceMatcher();
          const titleEl = document.querySelector('#item_title_sv');
          const categoryEl = document.querySelector('#item_category_id option:checked');
          const artistEl = document.querySelector('#item_artist');
          const keywordsEl = document.querySelector('#item_keywords_sv');

          const itemData = {
            title: titleEl?.value || '',
            category: categoryEl?.textContent || '',
            artist: artistEl?.value || '',
            keywords: keywordsEl?.value || ''
          };

          const allSearches = [...(searches.shared || []), ...(searches.company || [])];
          const matches = matcher.matchSearchesToItem(allSearches, itemData);
          if (matches.length === 0) return;

          const banner = document.createElement('div');
          banner.className = 'ext-search-signal';
          banner.innerHTML = `
            <span class="ext-search-signal__icon">&#x1F50D;</span>
            <span class="ext-search-signal__text">
              Köpare söker just nu:
              ${matches.map(m => `<strong>${escapeHTML(m.query)}</strong> (${m.count} st)`).join(', ')}
            </span>
            <button class="ext-search-signal__close" title="Stäng">&times;</button>
          `;
          banner.querySelector('.ext-search-signal__close').addEventListener('click', () => banner.remove());

          // Insert before the form or at top of content area
          const form = document.querySelector('.item-form, form[id*="edit_item"]');
          if (form) {
            form.parentNode.insertBefore(banner, form);
          }
        } catch (e) {
          // Silent fail — search signal is non-critical
          console.warn('Search signal banner failed to render:', e);
        }
      }

      setupEventListeners() {
        // Listen for API key changes (stored in local for security)
        chrome.storage.onChanged.addListener((changes, namespace) => {
          if (namespace === 'local' && changes.anthropicApiKey) {
            this.apiManager.apiKey = !!changes.anthropicApiKey.newValue;
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

        // Resolve the condition button: primary selector, else fall back to scanning all assist buttons
        let conditionButton = document.querySelector('[data-field-type="condition"]');

        if (!conditionButton) {
          // Try alternative selectors but don't log as error during initialization
          const altButtons = document.querySelectorAll('.ai-assist-button');
          altButtons.forEach(btn => {
            if (btn.textContent.includes('kondition') || btn.dataset.fieldType === 'condition') {
              conditionButton = btn;
            }
          });
        }

        if (!conditionButton) return;

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
      }

      attachEventListeners() {
        // Individual field buttons
        const buttons = document.querySelectorAll('.ai-assist-button');

        buttons.forEach(button => {
          button.addEventListener('click', (e) => {
            e.preventDefault();
            const fieldType = e.target.dataset.fieldType;
            if (fieldType) {
              this.improveField(fieldType);
            }
          });
        });

        // Update condition button state after buttons are attached and UI is ready
        setTimeout(() => {
          this.updateConditionButtonState();
        }, 500); // Increased delay to ensure UI is fully ready

        // HYPERRANK button — explicit listener, wired via HyperrankUI.setOnRun(),
        // NOT the generic .ai-assist-button selector above (deliberately separate flow)
      }

      // Ensure the Claude API key is loaded, showing a field error indicator (labeled errLabel) if it's missing.
      // Returns true if the key is present and the caller may proceed, false if it already showed the error.
      async ensureApiKey(errLabel) {
        if (!this.apiManager.apiKey) {
          await this.apiManager.loadSettings();
        }

        if (!this.apiManager.apiKey) {
          this.showFieldErrorIndicator(errLabel, 'API key not configured. Please set your Anthropic API key in the extension popup.');
          return false;
        }

        return true;
      }

      async improveField(fieldType) {
        // Check if trying to improve condition when "Inga anmärkningar" is checked
        if (fieldType === 'condition' && this.isNoRemarksChecked()) {
          this.showFieldErrorIndicator(fieldType, 'Kondition kan inte förbättras när "Inga anmärkningar" är markerat. Avmarkera checkboxen först.');
          return;
        }

        if (!(await this.ensureApiKey(fieldType))) {
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

      // HYPERRANK — opt-in aggressive search-rank optimizer. Rewrites title,
      // description and hidden keywords for maximum Auctionet search relevance.
      // Explicitly NOT the norm: only runs when the user presses the dedicated
      // HYPERRANK button (attachEventListeners wires this via HyperrankUI.setOnRun,
      // never through the generic .ai-assist-button click handler above).
      async hyperrank(mode = 'full') {
        // Check API key without ensureApiKey()'s built-in error indicator/alert path
        // (which targets the main field-selector map) — HYPERRANK surfaces errors
        // in its own panel status line instead.
        if (!this.apiManager.apiKey) {
          await this.apiManager.loadSettings();
        }
        if (!this.apiManager.apiKey) {
          this.hyperrankUI.setStatus('API-nyckel saknas. Ange den i tillägget.', 'error');
          return;
        }

        this.hyperrankUI.setStatus('Analyserar föremål...', 'info');

        const itemData = this.dataExtractor.extractItemData();

        // Best-effort live buyer-search context. Never blocks HYPERRANK if the
        // Dashboard API token is missing or the request fails.
        itemData._matchedSearches = await this._getMatchedSearchQueries(itemData);

        // Capture originals BEFORE applying anything, so undo restores all three
        // fields even though they're applied one at a time via uiManager.applyImprovement.
        const titleField = document.querySelector('#item_title_sv');
        const descriptionField = document.querySelector('#item_description_sv');
        const keywordsField = document.querySelector('#item_hidden_keywords');
        const originalValues = {
          title: titleField?.value,
          description: descriptionField?.value,
          keywords: keywordsField?.value
        };

        const kwOnly = mode === 'keywords';
        this.hyperrankUI.setStatus(kwOnly
          ? 'Fyller dolda sökord (titel och beskrivning rörs inte)...'
          : 'Skriver om titel, beskrivning och sökord...', 'info');

        const hyperrankFields = kwOnly ? ['keywords'] : ['title', 'description', 'keywords'];
        hyperrankFields.forEach(f => this.fallbackShowFieldLoadingIndicator(f, 'hyperrank'));

        try {
          const result = await this.apiManager.callClaudeAPI(itemData, kwOnly ? 'hyperrank-keywords' : 'hyperrank');

          let appliedCount = 0;
          if (!kwOnly && result.title) {
            this.uiManager.applyImprovement('title', result.title);
            appliedCount++;
          }
          if (!kwOnly && result.description) {
            this.uiManager.applyImprovement('description', result.description);
            appliedCount++;
          }
          if (result.keywords) {
            this.uiManager.applyImprovement('keywords', result.keywords);
            appliedCount++;
          }

          hyperrankFields.forEach(f => {
            if (result[f]) {
              this.fallbackShowFieldSuccessIndicator(f);
            } else {
              this.fallbackRemoveFieldLoadingIndicator(f);
            }
          });

          if (appliedCount === 0) {
            throw new Error('Inget resultat kunde tolkas från AI-svaret');
          }

          this.hyperrankUI.setStatus(
            `Klart — ${appliedCount} fält omskrivna för sökrankning. Ångra via fältens "Ångra"-knapp.`,
            'success'
          );
          this.hyperrankUI.showRankCheckRow();

          // Log the hyperrank so Räddningslistan can badge already-treated items
          // (prevents re-running on the same listing for days). Pruned at 60 days.
          // Stores a visit-count snapshot ({ts, visits, followers}) taken at apply
          // time so Räddningslistan can later show a before→after delta. Old
          // entries may be a bare number (ts only) — readers must handle both.
          try {
            const idMatch = window.location.pathname.match(/\/items\/(\d+)/);
            if (idMatch) {
              const ts = Date.now();
              const snapshot = await this._captureVisitSnapshot();
              const { hyperrankedItems = {} } = await chrome.storage.local.get('hyperrankedItems');
              hyperrankedItems[idMatch[1]] = { ts, visits: snapshot.visits, followers: snapshot.followers };
              const cutoff = ts - 60 * 24 * 3600 * 1000;
              for (const [id, entry] of Object.entries(hyperrankedItems)) {
                const entryTs = typeof entry === 'number' ? entry : entry?.ts;
                if (!entryTs || entryTs < cutoff) delete hyperrankedItems[id];
              }
              await chrome.storage.local.set({ hyperrankedItems });
            }
          } catch (e) {
            console.warn('HYPERRANK log failed:', e);
          }

          // Clear stale FAQ hints, then re-analyze (HYPERRANK intentionally trips
          // the keyword-uniqueness quality check — accepted, noted in the UI copy)
          document.querySelectorAll('.faq-hint').forEach(h => h.remove());
          setTimeout(() => this.qualityAnalyzer.analyzeQuality(), 800);
        } catch (error) {
          console.error('HYPERRANK failed:', error);
          hyperrankFields.forEach(f => this.fallbackRemoveFieldLoadingIndicator(f));
          this.hyperrankUI.setStatus(`Fel: ${error.message}`, 'error');

          // Restore originals for any field that may have been applied before the error
          if (originalValues.title !== undefined && titleField && titleField.value !== originalValues.title) {
            titleField.value = originalValues.title;
          }
          if (originalValues.description !== undefined && descriptionField && descriptionField.value !== originalValues.description) {
            descriptionField.value = originalValues.description;
          }
          if (originalValues.keywords !== undefined && keywordsField && keywordsField.value !== originalValues.keywords) {
            keywordsField.value = originalValues.keywords;
          }
        }
      }

      // Best-effort: fetch the admin SHOW page (edit URL minus /edit) and parse
      // the "Besöksantal" / "Antal följare" figures out of the Statistik block,
      // so HYPERRANK can freeze a before-snapshot. Never throws — on any failure
      // (background fetch error, unexpected markup) returns nulls so the caller
      // can still log the apply timestamp.
      async _captureVisitSnapshot() {
        const result = { visits: null, followers: null };
        try {
          const showUrl = window.location.href.replace(/\/edit(?:[/?#].*)?$/, '');
          const resp = await chrome.runtime.sendMessage({ type: 'fetch-admin-html', url: showUrl });
          if (!resp || !resp.success || !resp.html) return result;

          // Tolerate arbitrary whitespace/tags (e.g. "<td>Besöksantal</td><td>53 (52 unika)</td>")
          // between the label and the first integer that follows it.
          const visitsMatch = resp.html.match(/Bes[öo]ksantal[\s\S]{0,200}?(\d[\d\s]*)/i);
          if (visitsMatch) {
            result.visits = parseInt(visitsMatch[1].replace(/\s/g, ''), 10);
          }
          const followersMatch = resp.html.match(/Antal f[öo]ljare[\s\S]{0,200}?(\d[\d\s]*)/i);
          if (followersMatch) {
            result.followers = parseInt(followersMatch[1].replace(/\s/g, ''), 10);
          }
        } catch (e) {
          console.warn('HYPERRANK visit snapshot failed:', e);
        }
        return result;
      }

      // Best-effort: fetch live buyer searches from the Dashboard API and match
      // them against current item data. Returns an array of up to 10 query
      // strings, or [] if the Dashboard API is unavailable — never throws.
      async _getMatchedSearchQueries(itemData) {
        try {
          const dashAPI = new DashboardAPI();
          const searches = await dashAPI.getSearches();
          if (!searches) return [];

          const matcher = new SearchRelevanceMatcher();
          const allSearches = [...(searches.shared || []), ...(searches.company || [])];
          const matches = matcher.matchSearchesToItem(allSearches, {
            title: itemData.title,
            category: itemData.category,
            artist: itemData.artist,
            keywords: itemData.keywords
          });

          return matches.slice(0, 10).map(m => m.query);
        } catch (e) {
          console.warn('HYPERRANK: live search context unavailable:', e);
          return [];
        }
      }

      showFieldSpecificInfoDialog(fieldType, missingInfo, data) {
        const fieldNames = AuctionetCatalogingAssistant.FIELD_DISPLAY_NAMES;

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
                <div style="background: #fff3cd; padding: 8px; border-radius: 3px; margin: 8px 0; border-left: 3px solid #ffc107;">
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
          default:
            return '';
        }
      }

      async forceImproveField(fieldType) {
        // Bypass quality checks and improve anyway
        
        // Ensure API manager settings are loaded
        await this.apiManager.loadSettings();

        
        const itemData = this.dataExtractor.extractItemData();

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
      fallbackShowFieldLoadingIndicator(fieldType, variant) {

        
        // Remove any existing loading states first
        this.fallbackRemoveFieldLoadingIndicator(fieldType);
        
        // Get the specific field - EXACT same as Add Items page
        const fieldMap = AuctionetCatalogingAssistant.FIELD_SELECTOR_MAP;

        const targetField = document.querySelector(fieldMap[fieldType]);

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
        overlay.className = variant === 'hyperrank'
          ? 'field-spinner-overlay field-spinner-overlay--hyperrank'
          : 'field-spinner-overlay';
        overlay.dataset.fieldType = fieldType;
        overlay.innerHTML = `
          <div class="ai-spinner"></div>
          <div class="ai-processing-text">${variant === 'hyperrank' ? '⚡ Hyperrankar...' : 'Förbättrar...'}</div>
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
        
        // Get the specific field and apply success flash - EXACT same as Add Items page
        const fieldMap = AuctionetCatalogingAssistant.FIELD_SELECTOR_MAP;

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
        
        // Show error message - EXACT same as Add Items page
        alert(`Fel vid förbättring av ${fieldType}: ${message}`);
      }

      fallbackRemoveFieldLoadingIndicator(fieldType) {
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

    }

    // Initialize the assistant
    new AuctionetCatalogingAssistant();
    
  } catch (error) {
    console.error('Auctionet AI Assistant: Failed to initialize:', error);
  }
})(); 