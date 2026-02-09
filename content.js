// content.js - Universal Content Script for Auctionet Extension
// Handles both edit and add pages
//
// LANGUAGE REQUIREMENTS:
// - All user-facing text (tooltips, messages, AI responses) must be in Swedish
// - Code comments and console logs should be in English
// - Technical field names and JSON keys remain in English for parsing

console.log('🚀 Auctionet AI Assistant: Content script loaded!');

// Import the API Bridge that connects add page to edit page API manager
import('./modules/add-items-api-bridge.js').then(module => {
  window.AddItemsAPIBridge = module.AddItemsAPIBridge;
}).catch(error => {
  console.error('❌ Failed to load AddItemsAPIBridge:', error);
});

// Import CONFIG for model selection
import('./modules/config.js').then(module => {
  window.CONFIG = module.CONFIG;
}).catch(error => {
  console.error('❌ Failed to load CONFIG:', error);
});

// Import the new modular tooltip system components
import('./modules/ui/tooltip-system-manager.js').then(module => {
  window.TooltipSystemManager = module.TooltipSystemManager;
}).catch(error => {
  console.error('❌ Failed to load TooltipSystemManager:', error);
});

import('./modules/core/field-quality-analyzer.js').then(module => {
  window.FieldQualityAnalyzer = module.FieldQualityAnalyzer;
}).catch(error => {
  console.error('❌ Failed to load FieldQualityAnalyzer:', error);
});

import('./modules/ui/field-monitor-manager.js').then(module => {
  window.FieldMonitorManager = module.FieldMonitorManager;
}).catch(error => {
  console.error('❌ Failed to load FieldMonitorManager:', error);
});

import('./modules/add-items-integration-manager.js').then(module => {
  window.AddItemsIntegrationManager = module.AddItemsIntegrationManager;
}).catch(error => {
  console.error('❌ Failed to load AddItemsIntegrationManager:', error);
});

// Import the ArtistDetectionManager for edit page artist detection
import('./modules/artist-detection-manager.js').then(module => {
  window.ArtistDetectionManager = module.ArtistDetectionManager;
}).catch(error => {
  console.error('❌ Failed to load ArtistDetectionManager:', error);
});

// Import the FreetextParser component
import('./modules/refactored/components/freetext-parser.js').then(module => {
  window.FreetextParser = module.FreetextParser;
}).catch(error => {
  console.error('❌ Failed to load FreetextParser:', error);
});

// Import the AIImageAnalyzer component
import('./modules/refactored/components/ai-image-analyzer.js').then(module => {
  window.AIImageAnalyzer = module.AIImageAnalyzer;
}).catch(error => {
  console.error('❌ Failed to load AIImageAnalyzer:', error);
});

// Import the AI Rules System
import('./modules/refactored/ai-rules-system/ai-rules-manager.js').then(module => {
  window.AIRulesManager = module.AIRulesManager;
  // Initialize AI Rules System and make functions globally available
  const aiRulesManager = new module.AIRulesManager();

  // Wait for rules to load (they auto-load in constructor)
  const waitForRules = () => {
    if (aiRulesManager.loaded) {
      // CRITICAL: Override ALL global functions to use our loaded instance
      window.getAIRulesManager = () => aiRulesManager;
      window.getSystemPrompt = aiRulesManager.getSystemPrompt.bind(aiRulesManager);
      window.getCategoryPrompt = aiRulesManager.getCategoryPrompt.bind(aiRulesManager);
      window.buildPrompt = aiRulesManager.buildPrompt.bind(aiRulesManager);
      window.getCategoryRules = aiRulesManager.getCategoryRules.bind(aiRulesManager);
      window.getFieldRules = aiRulesManager.getFieldRules.bind(aiRulesManager);
      window.getForbiddenWords = aiRulesManager.getForbiddenWords.bind(aiRulesManager);
      window.isForbiddenWord = aiRulesManager.isForbiddenWord.bind(aiRulesManager);
      window.getModelSpecificValuationRules = aiRulesManager.getModelSpecificValuationRules.bind(aiRulesManager);
      window.getBrandCorrections = aiRulesManager.getBrandCorrections.bind(aiRulesManager);
      window.getArtistCorrections = aiRulesManager.getBrandCorrections.bind(aiRulesManager);
      console.log('🔗 Overrode ALL global AI Rules functions with loaded instance');
      console.log('✅ AI Rules System initialized and functions made globally available');

      // Debug: Test that functions work
      try {
        const testPrompt = window.getSystemPrompt('core');
        const testRules = window.getModelSpecificValuationRules('freetextParser', 'claude-sonnet-4-5-20250929');
        console.log('🧪 AI Rules functions tested successfully:', {
          hasSystemPrompt: !!testPrompt,
          hasValuationRules: !!testRules
        });
      } catch (error) {
        console.error('❌ AI Rules functions test failed:', error);
      }
    } else {
      console.log('⏳ Waiting for AI Rules to load... Current state:', aiRulesManager.loaded);
      setTimeout(waitForRules, 200); // Check every 200ms
    }
  };

  // Start checking after a small delay to let constructor complete
  setTimeout(waitForRules, 100);
}).catch(error => {
  console.error('❌ Failed to load AI Rules System:', error);
});

// Import PageDetector
import('./modules/core/page-detector.js').then(module => {
  window.PageDetector = module.PageDetector;
}).catch(error => {
  console.error('❌ Failed to load PageDetector:', error);
});

// Import UIController
import('./modules/ui/ui-controller.js').then(module => {
  window.UIController = module.UIController;
  console.log('✅ UIController loaded');
}).catch(error => console.error('❌ Failed to load UIController:', error));

// Import TypingSimulator for artist autocomplete
import('./modules/utils/typing-simulator.js').then(module => {
  window.TypingSimulator = module.TypingSimulator;
  console.log('✅ TypingSimulator loaded');
}).catch(error => console.error('❌ Failed to load TypingSimulator:', error));

// Import ArtistFieldManager for artist field operations
import('./modules/core/artist-field-manager.js').then(module => {
  window.ArtistFieldManager = module.ArtistFieldManager;
  console.log('✅ ArtistFieldManager loaded');
}).catch(error => console.error('❌ Failed to load ArtistFieldManager:', error));

// Import APIManager for shared API layer (same module used by content-script.js)
import('./modules/api-manager.js').then(module => {
  window.APIManager = module.APIManager;
  console.log('✅ APIManager loaded');
}).catch(error => console.error('❌ Failed to load APIManager:', error));

// Import QualityAnalyzer for FAQ inline hints (shared with edit page)
import('./modules/quality-analyzer.js').then(module => {
  window.QualityAnalyzer = module.QualityAnalyzer;
  console.log('✅ QualityAnalyzer loaded for FAQ hints');
}).catch(error => console.error('❌ Failed to load QualityAnalyzer:', error));

// SPA detection will be handled by the AuctionetCatalogingAssistant class

class AuctionetCatalogingAssistant {
  constructor() {
    this.apiKey = null;
    this.currentPage = null;
    this.tooltipManager = null;
    this.isProgrammaticUpdate = false; // Track when we're updating fields programmatically

    // Modules
    this.pageDetector = null;
    this.uiController = null;
    this.faqHintAnalyzer = null; // Shared QualityAnalyzer for FAQ inline hints
    this.ignoredArtists = [];

    // Initialize asynchronously to prevent blocking
    this.init().catch(error => {
      console.error('❌ Failed to initialize AuctionetCatalogingAssistant:', error);
    });

    // Listen for API key changes (stored in local for security)
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.anthropicApiKey) {
        this.apiKey = changes.anthropicApiKey.newValue;
      }
    });

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'refresh-api-key') {
        this.loadApiKey();
        sendResponse({ success: true });
      }
    });

    // Make globally accessible for SPA detection
    window.auctionetAssistant = this;
  }

  async init() {
    // Wait for modules to load
    if (!window.PageDetector || !window.UIController) {
      console.log('⏳ Waiting for modules to load...');
      await new Promise(resolve => setTimeout(resolve, 200));
      if (!window.PageDetector || !window.UIController) {
        // Retry init later
        setTimeout(() => this.init(), 500);
        return;
      }
    }

    // Initialize PageDetector if not already done
    if (!this.pageDetector) {
      this.pageDetector = new window.PageDetector(() => this.handlePageChange());
      this.pageDetector.setupSPADetection();
    }

    // Initialize UIController if not already done
    if (!this.uiController) {
      this.uiController = new window.UIController({
        onImproveField: (fieldType) => this.improveField(fieldType),
        onImproveAll: () => this.improveAllFields(),
        onAnalyzeQuality: () => this.analyzeQuality(),
        onArtistAction: (action, data) => this.handleArtistAction(action, data),
        onGetItemData: () => this.extractItemData(),
        onProcessWithInfo: (info) => this.processWithAdditionalInfo(info),
        onProcessWithoutInfo: () => this.processWithoutAdditionalInfo(),
        onForceImprove: (fieldType) => this.forceImproveField(fieldType),
        onAddBioToDescription: (bio) => this.addBiographyToDescription(bio)
      });
    }

    // Wait for page to be fully loaded
    if (document.readyState === 'loading') {
      await new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', resolve);
      });
    }

    // Additional wait to ensure dynamic content is loaded
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if we're on the right page and determine page type
    const pageInfo = this.pageDetector.detectPageType();

    if (!pageInfo.isSupported) {
      console.log('❌ Page not supported:', window.location.href, window.location.hash);
      return;
    }

    // If page needs retry (form elements not ready), schedule a retry
    if (pageInfo.needsRetry) {
      console.log('⏳ Page needs retry, scheduling retry in 2 seconds...');
      setTimeout(() => {
        this.init();
      }, 2000);
      return;
    }

    this.currentPage = pageInfo.type;
    window.auctionetAssistantInitialized = true;

    console.log('✅ Auctionet AI Assistant: On supported page, type:', this.currentPage);

    await this.loadApiKey();

    // Initialize the shared APIManager (same module used by content-script.js)
    if (window.APIManager) {
      this.apiManager = new window.APIManager();
      await this.apiManager.loadSettings();
      console.log('✅ APIManager initialized for content.js');
    } else {
      console.warn('⚠️ APIManager not yet loaded, API calls will use fallback');
    }

    // Initialize FAQ inline hints analyzer (shared QualityAnalyzer module)
    if (window.QualityAnalyzer) {
      this.faqHintAnalyzer = new window.QualityAnalyzer();
      if (this.apiManager) {
        this.faqHintAnalyzer.setApiManager(this.apiManager);
      }
      console.log('✅ FAQ hint analyzer initialized for inline hints');
    }

    if (this.currentPage === 'edit') {
      this.uiController.injectUI();
      // attachEventListeners is handled by UIController
    } else if (this.currentPage === 'add') {
      await this.initializeFreetextParser();
      // Also inject AI enhance buttons + quality sidebar on Add page
      this.uiController.injectUI();
    }

    // FAQ inline hints are triggered via the UIController's quality callback chain:
    // UIController.setupLiveQualityUpdates() → onAnalyzeQuality() → analyzeQuality() → runFaqHints()
    // Only set up standalone FAQ monitoring if UIController is NOT active (fallback)
    if (this.faqHintAnalyzer && !document.querySelector('.quality-indicator')) {
      setTimeout(() => {
        this.runFaqHints();
        this.faqHintAnalyzer.setupLiveQualityUpdates();
        console.log('✅ FAQ hints (standalone) + live monitoring active on', this.currentPage, 'page');
      }, 1500);
    }
  }

  handlePageChange() {
    // Guard: don't re-init if we're already on the same page (prevents DOM mutation loops)
    if (this.currentPage && window.auctionetAssistantInitialized) {
      const pageInfo = this.pageDetector.detectPageType();
      if (pageInfo.type === this.currentPage) {
        return; // Same page, skip re-init
      }
    }
    console.log('🔄 Page change detected, re-initializing...');
    this.init();
  }



  async initializeFreetextParser() {
    try {
      console.log('🎯 Initializing FreetextParser for Add Items page...');

      // Wait for required components AND AI Rules to be loaded
      if (!window.FreetextParser || !window.AIImageAnalyzer || !window.AddItemsAPIBridge || !window.getSystemPrompt || !window.getModelSpecificValuationRules) {
        console.log('⏳ Waiting for components and AI Rules to load...');
        await new Promise((resolve, reject) => {
          let attempts = 0;
          const maxAttempts = 150; // 15 seconds timeout (increased for AI Rules loading)

          const checkForClasses = () => {
            attempts++;
            const allReady = window.FreetextParser &&
              window.AIImageAnalyzer &&
              window.AddItemsAPIBridge &&
              window.getSystemPrompt &&
              window.getModelSpecificValuationRules &&
              window.getBrandCorrections &&
              window.getArtistCorrections;

            if (allReady) {
              console.log('✅ All components and AI Rules loaded successfully');
              resolve();
            } else if (attempts >= maxAttempts) {
              console.error('❌ Timeout waiting for components to load');
              console.log('Missing components:', {
                FreetextParser: !!window.FreetextParser,
                AIImageAnalyzer: !!window.AIImageAnalyzer,
                AddItemsAPIBridge: !!window.AddItemsAPIBridge,
                getSystemPrompt: !!window.getSystemPrompt,
                getModelSpecificValuationRules: !!window.getModelSpecificValuationRules,
                getBrandCorrections: !!window.getBrandCorrections,
                getArtistCorrections: !!window.getArtistCorrections
              });
              reject(new Error('Timeout waiting for components'));
            } else {
              setTimeout(checkForClasses, 100);
            }
          };
          checkForClasses();
        });
      }

      // Create API Bridge for FreetextParser
      console.log('🚀 Creating API Bridge for FreetextParser...');
      const apiBridge = new window.AddItemsAPIBridge();
      await apiBridge.init();

      // Initialize FreetextParser with API Manager
      console.log('🎯 Initializing FreetextParser component...');
      this.freetextParser = new window.FreetextParser(apiBridge.getAPIManager());
      this.freetextParser.init();

      // Store the bridge for potential future use
      this.apiBridge = apiBridge;

      console.log('✅ FreetextParser initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize FreetextParser:', error);
    }
  }

  async loadApiKey() {
    try {
      const result = await chrome.storage.local.get(['anthropicApiKey']);
      this.apiKey = result.anthropicApiKey;
      console.log('API key loaded from local storage:', this.apiKey ? 'Found' : 'Not found');
    } catch (error) {
      console.error('Error loading API key:', error);
      this.apiKey = null;
    }
  }



  async moveArtistToField(artistName, suggestedTitle) {
    try {
      // Use ArtistFieldManager for all artist field operations
      const artistFieldManager = new window.ArtistFieldManager();

      const success = await artistFieldManager.moveArtistToField(artistName, suggestedTitle, {
        onSuccess: () => {
          // Highlight fields to show changes
          artistFieldManager.highlightArtistField();
          if (suggestedTitle) {
            artistFieldManager.highlightTitleField();
          }

          // Re-analyze quality to update warnings
          setTimeout(() => this.analyzeQuality(), 500);
        },
        onError: (error) => {
          console.error('❌ Failed to move artist:', error);
        }
      });

      if (success) {
        console.log('✅ Artist moved to field with autocomplete integration');
      }
    } catch (error) {
      console.error('❌ Error in moveArtistToField:', error);
    }
  }

  addBiographyToDescription(biography) {
    const descriptionField = document.querySelector('#item_description_sv');
    if (descriptionField) {
      const currentDesc = descriptionField.value || '';
      const newDesc = currentDesc + (currentDesc ? '\n\n' : '') + biography;
      descriptionField.value = newDesc;
      descriptionField.dispatchEvent(new Event('input', { bubbles: true }));

      // Re-analyze quality
      setTimeout(() => this.analyzeQuality(), 500);
    }
  }


  async improveField(fieldType, force = false) {
    // Block condition improvement when "Inga anmärkningar" is checked
    if (fieldType === 'condition' && this.isNoRemarksChecked()) {
      this.uiController.showFieldErrorIndicator(fieldType, 'Kondition kan inte förbättras när "Inga anmärkningar" är markerat. Avmarkera checkboxen först.');
      return;
    }

    // Ensure API key is loaded
    if (!this.apiKey) {
      await this.loadApiKey();
    }

    // Check if API key is still missing
    if (!this.apiKey) {
      this.uiController.showFieldErrorIndicator(fieldType, 'API key not configured. Please set your Anthropic API key in the extension popup.');
      return;
    }

    const itemData = this.extractItemData();

    // Assess data quality for hallucination prevention (skip for title corrections or if forced)
    if (fieldType !== 'title-correct' && !force) {
      const qualityAssessment = this.assessDataQuality(itemData, fieldType);

      if (qualityAssessment.needsMoreInfo) {
        this.uiController.showFieldSpecificInfoDialog(fieldType, qualityAssessment.missingInfo, itemData);
        return;
      }
    }

    this.uiController.showLoadingIndicator(fieldType);

    try {
      const improved = await this.callClaudeAPI(itemData, fieldType);
      console.log('Improved result for', fieldType, ':', improved);

      // For single field improvements, extract the specific field value
      // Handle title-correct mapping to title field
      const responseField = fieldType === 'title-correct' ? 'title' : fieldType;
      const value = improved[responseField];
      if (value) {
        this.uiController.applyImprovement(fieldType, value);
        this.uiController.showFieldSuccessIndicator(fieldType);

        // Clear stale FAQ hints, then re-analyze after DOM settles
        document.querySelectorAll('.faq-hint').forEach(h => h.remove());
        setTimeout(() => {
          console.log('Delayed quality analysis for single field...');
          this.analyzeQuality();
        }, 800);
      } else {
        throw new Error(`No ${fieldType} value in response`);
      }
    } catch (error) {
      console.error('Error improving field:', error);
      this.uiController.showFieldErrorIndicator(fieldType, error.message);
    }
  }

  async improveAllFields() {
    // Ensure API key is loaded
    if (!this.apiKey) {
      await this.loadApiKey();
    }

    // Check if API key is still missing
    if (!this.apiKey) {
      this.uiController.showFieldErrorIndicator('all', 'API key not configured. Please set your Anthropic API key in the extension popup.');
      return;
    }

    const itemData = this.extractItemData();

    // Assess data quality for hallucination prevention
    const qualityAssessment = this.assessDataQuality(itemData, 'all');

    if (qualityAssessment.needsMoreInfo) {
      this.uiController.showFieldSpecificInfoDialog('all', qualityAssessment.missingInfo, itemData);
      return;
    }

    this.uiController.showLoadingIndicator('all');

    try {
      const improvements = await this.callClaudeAPI(itemData, 'all');

      // Apply improvements and show individual success indicators with slight delays for cascade effect
      let delay = 0;

      if (improvements.title) {
        setTimeout(() => {
          this.uiController.applyImprovement('title', improvements.title);
          this.uiController.showFieldSuccessIndicator('title');
        }, delay);
        delay += 300;
      }

      if (improvements.description) {
        setTimeout(() => {
          this.uiController.applyImprovement('description', improvements.description);
          this.uiController.showFieldSuccessIndicator('description');
        }, delay);
        delay += 300;
      }

      // Only apply condition improvement if "Inga anmärkningar" is not checked
      if (improvements.condition && !this.isNoRemarksChecked()) {
        setTimeout(() => {
          this.uiController.applyImprovement('condition', improvements.condition);
          this.uiController.showFieldSuccessIndicator('condition');
        }, delay);
        delay += 300;
      }

      if (improvements.keywords) {
        setTimeout(() => {
          this.uiController.applyImprovement('keywords', improvements.keywords);
          this.uiController.showFieldSuccessIndicator('keywords');
        }, delay);
        delay += 300;
      }

      // Show final success on master button after all fields are done
      setTimeout(() => {
        this.uiController.showFieldSuccessIndicator('all');
        // Clear stale FAQ hints, then run full re-analysis
        document.querySelectorAll('.faq-hint').forEach(h => h.remove());
        setTimeout(() => this.analyzeQuality(), 800);
      }, delay);

    } catch (error) {
      this.uiController.showFieldErrorIndicator('all', error.message);
    }
  }

  handleArtistAction(action, data) {
    console.log(`🎨 Handling artist action: ${action}`, data);

    if (action === 'move') {
      // Move artist name to artist field
      const artistField = document.querySelector('#item_artist_name_sv');
      if (artistField) {
        artistField.value = data.artistName;
        artistField.dispatchEvent(new Event('change', { bubbles: true }));
        artistField.classList.add('ai-updated');

        // If we have a suggested title (without the artist name), update the title too
        if (data.suggestedTitle) {
          this.uiController.applyImprovement('title', data.suggestedTitle);
        }

        // Show success indicator on artist field
        artistField.classList.add('field-success');
        setTimeout(() => artistField.classList.remove('field-success'), 1000);
      } else {
        console.warn('❌ Artist field not found');
      }
    } else if (action === 'bio') {
      // Show biography
      this.showArtistBiography(data.artistName);
    } else if (action === 'ignore') {
      // Ignore this artist detection for this session
      this.ignoreArtistDetection(data.artistName);
    }
  }

  showArtistBiography(artistName) {
    console.log(`📖 Fetching biography for ${artistName}...`);
    this.uiController.showLoadingIndicator('all');

    // Use callClaudeAPI with 'biography' type
    // We need to construct a temporary itemData with the artist name
    const tempItemData = { artist: artistName };

    this.callClaudeAPI(tempItemData, 'biography')
      .then(response => {
        this.uiController.removeFieldLoadingIndicator('all');
        // The response from parseClaudeResponse for single field is usually an object or string
        // For biography, we expect a string or object with biography property
        let bioText = '';
        if (typeof response === 'string') {
          bioText = response;
        } else if (response && response.biography) {
          bioText = response.biography;
        } else if (response && response.text) {
          bioText = response.text;
        } else {
          bioText = JSON.stringify(response);
        }

        this.uiController.showBiographyModal(artistName, bioText);
      })
      .catch(error => {
        this.uiController.removeFieldLoadingIndicator('all');
        console.error('❌ Failed to fetch biography:', error);
        alert('Kunde inte hämta biografi just nu.');
      });
  }

  ignoreArtistDetection(artistName) {
    console.log(`🙈 Ignoring artist detection for: ${artistName}`);
    if (!this.ignoredArtists) this.ignoredArtists = [];
    this.ignoredArtists.push(artistName);

    // Re-assess quality
    const itemData = this.extractItemData();
    this.assessDataQuality(itemData, 'all');
  }

  isNoRemarksChecked() {
    const checkboxSelectors = [
      '#item_no_remarks',
      'input[name="item[no_remarks]"]',
      '.js-item-form-no-remarks',
      'input[type="checkbox"][value="Inga anmärkningar"]',
      'input[type="checkbox"]#item_no_remarks',
      'input[type="checkbox"][name*="no_remarks"]',
      'input[type="checkbox"][name*="anmärkningar"]',
      'input[type="checkbox"][id*="anmärkningar"]',
      'input[type="checkbox"][class*="anmärkningar"]'
    ];

    for (const selector of checkboxSelectors) {
      const checkbox = document.querySelector(selector);
      if (checkbox && checkbox.checked) {
        return true;
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

  // Re-analyze quality after a field change (extracts current data automatically)
  analyzeQuality() {
    try {
      const data = this.extractItemData();
      // Also run FAQ inline hints
      this.runFaqHints();
      return this.assessDataQuality(data, 'all');
    } catch (error) {
      console.error('Error analyzing quality:', error);
      return { needsMoreInfo: false, missingInfo: [], qualityScore: 0 };
    }
  }

  // Run FAQ validation rules and render inline hints via shared QualityAnalyzer
  runFaqHints() {
    if (!this.faqHintAnalyzer) return;
    try {
      this.faqHintAnalyzer.analyzeQuality();
    } catch (error) {
      console.warn('⚠️ FAQ hints error (non-critical):', error);
    }
  }

  assessDataQuality(data, fieldType) {
    const descLength = data.description.replace(/<[^>]*>/g, '').length;
    const condLength = data.condition.replace(/<[^>]*>/g, '').length;
    const titleLength = data.title.length;

    // Check if "Inga anmärkningar" is checked
    const noRemarksCheckbox = document.querySelector('input[type="checkbox"][value="Inga anmärkningar"]') ||
      document.querySelector('input[type="checkbox"]#item_no_remarks') ||
      document.querySelector('input[type="checkbox"][name*="no_remarks"]');
    const noRemarksChecked = noRemarksCheckbox && noRemarksCheckbox.checked;

    // Calculate overall quality score
    const qualityScore = this.calculateCurrentQualityScore(data);

    const issues = [];
    let needsMoreInfo = false;

    // Critical quality thresholds
    if (qualityScore < 30) {
      needsMoreInfo = true;
      issues.push('critical_quality');
    }

    // Field-specific quality checks
    switch (fieldType) {
      case 'title':
        // Check if we can safely improve title
        if (!data.description.match(/\d{4}|\d{2,4}-tal|1[6-9]\d{2}|20[0-2]\d/i) && !data.artist && descLength < 30) {
          issues.push('period');
          needsMoreInfo = true;
        }
        if (titleLength < 15 && descLength < 25) {
          issues.push('basic_info');
          needsMoreInfo = true;
        }
        // Check if artist is unknown/obscure and might lead to hallucination
        if (data.artist && data.artist.length > 0 && descLength < 20) {
          issues.push('artist_verification');
          needsMoreInfo = true;
        }
        break;

      case 'title-correct':
        // For title corrections, we just need a basic title to work with
        // No additional information required since we're only correcting grammar/structure
        if (titleLength < 5) {
          issues.push('basic_title');
          needsMoreInfo = true;
        }
        break;

      case 'description':
        if (descLength < 25) {
          issues.push('basic_info');
          needsMoreInfo = true;
        }
        if (!data.description.match(/\d+[\s,]*(x|cm|mm)/i) && descLength < 50) {
          issues.push('measurements');
          needsMoreInfo = true;
        }
        break;

      case 'condition':
        // Skip condition checks if "Inga anmärkningar" is checked
        if (!noRemarksChecked) {
          if (data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) {
            issues.push('specific_damage', 'wear_details', 'bruksslitage_vague');
            needsMoreInfo = true;
          }
          if (condLength < 15) {
            issues.push('condition_details');
            needsMoreInfo = true;
          }

          // Check for other vague condition phrases
          const vaguePhrases = ['normalt slitage', 'vanligt slitage', 'åldersslitage'];
          const conditionText = data.condition.toLowerCase();
          const hasVaguePhrase = vaguePhrases.some(phrase => conditionText.includes(phrase));

          if (hasVaguePhrase && condLength < 40) {
            issues.push('vague_condition_terms');
            needsMoreInfo = true;
          }
        }
        break;

      case 'keywords':
        // Keywords can usually be generated even with sparse data
        if (qualityScore < 20) {
          issues.push('basic_info');
          needsMoreInfo = true;
        }
        break;

      case 'all':
        // For "Förbättra alla" - comprehensive check
        if (qualityScore < 40) {
          needsMoreInfo = true;
          issues.push('critical_quality');
        }
        if (descLength < 30) {
          issues.push('material', 'technique', 'period');
          needsMoreInfo = true;
        }
        if (!data.description.match(/\d+[\s,]*(x|cm|mm)/i) && descLength < 50) {
          issues.push('measurements');
          needsMoreInfo = true;
        }
        if (!noRemarksChecked && data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) {
          issues.push('specific_damage');
          needsMoreInfo = true;
        }
        break;
    }

    return { needsMoreInfo, missingInfo: issues, qualityScore };
  }

  calculateCurrentQualityScore(data) {
    let score = 100;

    // Check if "Inga anmärkningar" is checked
    const noRemarksCheckbox = document.querySelector('input[type="checkbox"][value="Inga anmärkningar"]') ||
      document.querySelector('input[type="checkbox"]#item_no_remarks') ||
      document.querySelector('input[type="checkbox"][name*="no_remarks"]');
    const noRemarksChecked = noRemarksCheckbox && noRemarksCheckbox.checked;

    // Quick quality calculation (simplified version of analyzeQuality)
    const descLength = data.description.replace(/<[^>]*>/g, '').length;
    const condLength = data.condition.replace(/<[^>]*>/g, '').length;
    const keywordsLength = data.keywords.length;

    // Support both comma-separated and Auctionet space-separated formats
    const keywordCount = data.keywords ?
      (data.keywords.includes(',') ?
        data.keywords.split(',').filter(k => k.trim().length > 0).length :
        data.keywords.split(/\s+/).filter(k => k.trim().length > 0).length
      ) : 0;

    // Debug logging for calculateCurrentQualityScore
    console.log('calculateCurrentQualityScore keywords debug:', {
      keywords: data.keywords,
      keywordsLength: keywordsLength,
      keywordCount: keywordCount
    });

    if (data.title.length < 20) score -= 20;
    if (descLength < 50) score -= 25;

    // Skip condition scoring if "Inga anmärkningar" is checked
    if (!noRemarksChecked) {
      if (condLength < 20) score -= 20;
      if (data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) score -= 25; // Increased penalty

      // Check for other vague condition terms
      const vaguePhrases = ['normalt slitage', 'vanligt slitage', 'åldersslitage', 'slitage förekommer'];
      const conditionText = data.condition.toLowerCase();
      const hasVaguePhrase = vaguePhrases.some(phrase =>
        conditionText.includes(phrase) && conditionText.replace(/<[^>]*>/g, '').trim().length < 30
      );

      if (hasVaguePhrase) score -= 15;
    }

    // Updated keyword scoring with more reasonable thresholds
    if (keywordsLength === 0 || !data.keywords || data.keywords.trim() === '') score -= 30;
    else if (keywordCount < 2) score -= 20;
    else if (keywordCount < 4) score -= 10;
    // 4-12 keywords = no penalty (sweet spot)
    else if (keywordCount > 12) score -= 15;

    if (!data.description.match(/\d+[\s,]*(x|cm)/i)) score -= 20;

    return Math.max(0, score);
  }

  async processWithAdditionalInfo(info) {
    const itemData = this.extractItemData();
    itemData.additionalInfo = info;

    this.uiController.showLoadingIndicator('all');

    try {
      const improvements = await this.callClaudeAPI(itemData, 'all-enhanced');
      this.applyAllImprovements(improvements);
    } catch (error) {
      this.uiController.showFieldErrorIndicator('all', error.message);
    }
  }

  async processWithoutAdditionalInfo() {
    const itemData = this.extractItemData();
    this.uiController.showLoadingIndicator('all');

    try {
      const improvements = await this.callClaudeAPI(itemData, 'all');
      this.applyAllImprovements(improvements);
    } catch (error) {
      this.uiController.showFieldErrorIndicator('all', error.message);
    }
  }



  async forceImproveField(fieldType) {
    // Ensure API manager settings are loaded (matches Edit page behavior)
    if (this.apiManager) {
      await this.apiManager.loadSettings();
    }

    // Ensure local API key is loaded
    if (!this.apiKey) {
      await this.loadApiKey();
    }
    if (!this.apiKey) {
      this.uiController.showFieldErrorIndicator(fieldType, 'API key not configured. Please set your Anthropic API key in the extension popup.');
      return;
    }

    // Bypass quality checks and improve anyway
    const itemData = this.extractItemData();

    if (fieldType === 'all') {
      // For "Förbättra alla" - use existing logic
      this.uiController.showLoadingIndicator('all');

      try {
        const improvements = await this.callClaudeAPI(itemData, 'all');
        this.applyAllImprovements(improvements);
      } catch (error) {
        console.error('❌ Force improve all failed:', error);
        this.uiController.showFieldErrorIndicator('all', error.message);
      }
      return;
    }

    // For individual fields
    this.improveField(fieldType, true);
  }

  applyAllImprovements(improvements) {
    if (improvements.title) {
      this.uiController.applyImprovement('title', improvements.title);
    }
    if (improvements.description) {
      this.uiController.applyImprovement('description', improvements.description);
    }
    if (improvements.condition) {
      this.uiController.applyImprovement('condition', improvements.condition);
    }
    if (improvements.keywords) {
      this.uiController.applyImprovement('keywords', improvements.keywords);
    }

    this.uiController.showFieldSuccessIndicator('all');
    // Clear stale FAQ hints immediately, then re-analyze after DOM settles
    document.querySelectorAll('.faq-hint').forEach(h => h.remove());
    setTimeout(() => {
      console.log('Delayed quality analysis after applyAllImprovements...');
      this.analyzeQuality();
    }, 800);
  }

  extractItemData() {
    const data = {
      category: document.querySelector('#item_category_id option:checked')?.textContent || '',
      title: document.querySelector('#item_title_sv')?.value || '',
      description: document.querySelector('#item_description_sv')?.value || '',
      condition: document.querySelector('#item_condition_sv')?.value || '',
      artist: document.querySelector('#item_artist_name_sv')?.value || '',
      keywords: document.querySelector('#item_hidden_keywords')?.value || '',
      estimate: document.querySelector('#item_current_auction_attributes_estimate')?.value || '',
      reserve: document.querySelector('#item_current_auction_attributes_reserve')?.value || ''
    };

    // Debug logging for keywords extraction
    console.log('extractItemData keywords debug:', {
      keywordsRaw: data.keywords,
      keywordsLength: data.keywords.length,
      keywordsElement: document.querySelector('#item_hidden_keywords'),
      elementValue: document.querySelector('#item_hidden_keywords')?.value
    });

    return data;
  }

  async callClaudeAPI(itemData, fieldType) {
    // Delegate to the shared APIManager (same module used by content-script.js)
    if (this.apiManager) {
      return this.apiManager.callClaudeAPI(itemData, fieldType);
    }

    // Fallback: if APIManager failed to load, throw a clear error
    throw new Error('APIManager not initialized. Please reload the page.');
  }

  // NOTE: getSystemPrompt(), getUserPrompt(), parseClaudeResponse(), and
  // validateSwedishAuctionStandards() have been removed. All API logic is now
  // delegated to the shared APIManager module (modules/api-manager.js) — the
  // same module used by content-script.js.


}

// Initialize when DOM is ready
console.log('🎬 Extension script executing, document ready state:', document.readyState);

if (document.readyState === 'loading') {
  console.log('⏳ Document still loading, waiting for DOMContentLoaded...');
  document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ DOMContentLoaded fired, creating AuctionetCatalogingAssistant');
    window.auctionetAssistant = new AuctionetCatalogingAssistant();
  });
} else {
  console.log('✅ Document already loaded, creating AuctionetCatalogingAssistant immediately');
  window.auctionetAssistant = new AuctionetCatalogingAssistant();
}