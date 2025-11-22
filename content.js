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
        const testRules = window.getModelSpecificValuationRules('freetextParser', 'claude-4-sonnet');
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
    this.ignoredArtists = [];

    // Initialize asynchronously to prevent blocking
    this.init().catch(error => {
      console.error('❌ Failed to initialize AuctionetCatalogingAssistant:', error);
    });

    // Listen for API key changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && changes.anthropicApiKey) {
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

  // Get current model for API calls
  getCurrentModelId() {
    try {
      if (window.CONFIG && window.CONFIG.MODELS && window.CONFIG.CURRENT_MODEL) {
        const model = window.CONFIG.MODELS[window.CONFIG.CURRENT_MODEL];
        return model ? model.id : 'claude-sonnet-4-20250514'; // Fallback to Claude 4
      }
      return 'claude-sonnet-4-20250514'; // Default fallback to Claude 4
    } catch (error) {
      console.error('Error getting current model, using Claude 4 fallback:', error);
      return 'claude-sonnet-4-20250514';
    }
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
        onAnalyzeQuality: () => this.assessDataQuality(),
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

    if (this.currentPage === 'edit') {
      this.uiController.injectUI();
      // attachEventListeners is handled by UIController
    } else if (this.currentPage === 'add') {
      await this.initializeFreetextParser();
    }
  }

  handlePageChange() {
    console.log('🔄 Page change detected, re-initializing...');
    // Re-run init to detect page type and set up UI
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

  createSimpleAPIManager() {
    // Capture reference to parent class for method calls
    const parentClass = this;

    // Create a simplified API manager that provides just what the tooltip system needs
    return {
      apiKey: this.apiKey,

      async callClaudeAPI(itemData, fieldType) {
        if (!parentClass.apiKey) {
          throw new Error('No API key available');
        }

        // Generate the prompt based on the field type and item data
        const prompt = parentClass.generatePromptForAddItems(itemData, fieldType);

        try {
          // Use background script communication (same as edit page)
          const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              type: 'anthropic-fetch',
              apiKey: parentClass.apiKey,
              body: {
                model: parentClass.getCurrentModelId(),
                max_tokens: fieldType === 'title-correct' ? 500 : 2000,
                temperature: fieldType === 'title-correct' ? 0.1 : 0.7,
                system: 'You are an expert Swedish auction cataloger. Follow Swedish auction standards.',
                messages: [{
                  role: 'user',
                  content: [{ type: 'text', text: prompt }]
                }]
              }
            }, (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else if (response.success) {
                resolve(response);
              } else {
                reject(new Error(response.error || 'API request failed'));
              }
            });
          });

          if (!response.data || !response.data.content || !Array.isArray(response.data.content) || response.data.content.length === 0) {
            throw new Error('Invalid response format from API');
          }

          if (!response.data.content[0] || !response.data.content[0].text) {
            throw new Error('No text content in API response');
          }

          // Parse the response similar to how the edit page does it
          return parentClass.parseClaudeResponseForAddItems(response.data.content[0].text, fieldType);
        } catch (error) {
          console.error('❌ API call failed:', error);
          throw error;
        }
      },

      // NEW: Add the analyzeForArtist method for AI artist detection
      async analyzeForArtist(title, objectType, artistField, description = '') {
        console.log('🤖 Simple API: Analyzing for artist in title:', title);

        if (!parentClass.apiKey) {
          console.error('🤖 Simple API: No API key available');
          return { hasArtist: false };
        }

        const prompt = `Analyze this Swedish auction title for potential artist names that should be moved to the artist field.

IMPORTANT: If you detect a misspelled artist name, correct it and explain the correction. Do NOT reject misspellings - instead provide the correct spelling with reasoning.

LANGUAGE REQUIREMENT: All user-facing text (reasoning, explanations) must be in Swedish. Only field names in JSON should remain in English.

CRITICAL JSON FORMATTING:
- ALWAYS escape quotes in JSON string values using backslashes
- If title contains "quotes", write them as \"quotes\" in JSON
- Example: "suggestedTitle": "\"Nornan\" färglitografi signerad numrerad 55/150"
- NEVER use unescaped quotes inside JSON string values

Title: "${title}"
Current artist field: "${artistField}"
Object type: "${objectType || 'unknown'}"
Description: "${description}"

GUIDELINES:
- Detect and CORRECT misspelled Swedish artist names (e.g., "Rolf Lidbergg" → "Rolf Lidberg")
- If name appears misspelled, research the correct spelling and provide it
- Use confidence 0.7-0.9 for corrections (high confidence in correction)
- Use confidence 0.4-0.6 for uncertain detections
- Move artist name to artist field, provide clean title without artist name
- Respond in Swedish for all user-facing text (reasoning)

CRITICAL: Escape ALL quotes in JSON string values with backslashes!

RESPOND WITH VALID JSON:
{
  "hasArtist": boolean,
  "artistName": "corrected name or null",
  "confidence": 0.0-1.0,
  "suggestedTitle": "title without artist, quotes properly escaped",
  "reasoning": "explanation in Swedish"
}`;

        try {
          // Make direct API call using background script communication
          const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              type: 'anthropic-fetch',
              apiKey: parentClass.apiKey,
              body: {
                model: 'claude-3-5-haiku-20241022', // Use fast Haiku for artist detection
                max_tokens: 1000,
                temperature: 0.3,
                system: 'You are an expert Swedish auction cataloger specializing in artist detection. Respond only with valid JSON.',
                messages: [{
                  role: 'user',
                  content: [{ type: 'text', text: prompt }]
                }]
              }
            }, (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else if (response.success) {
                resolve(response);
              } else {
                reject(new Error(response.error || 'API request failed'));
              }
            });
          });

          // Validate response structure
          if (!response.data || !response.data.content || !Array.isArray(response.data.content) || response.data.content.length === 0) {
            console.error('🤖 Simple API: Invalid response format from API');
            return { hasArtist: false };
          }

          if (!response.data.content[0] || !response.data.content[0].text) {
            console.error('🤖 Simple API: No text content in API response');
            return { hasArtist: false };
          }

          const rawResponse = response.data.content[0].text;
          console.log('🤖 Simple API: Raw artist analysis response:', rawResponse);

          // SAFETY CHECK: Ensure response is a string before processing
          if (typeof rawResponse !== 'string') {
            console.error('🤖 Simple API: Response is not a string:', typeof rawResponse, rawResponse);
            return { hasArtist: false };
          }

          // Check for empty response
          if (!rawResponse || rawResponse.trim() === '') {
            console.error('🤖 Simple API: Empty response received');
            return { hasArtist: false };
          }

          // Parse the response
          if (rawResponse.toLowerCase().includes('no_artist')) {
            return { hasArtist: false };
          }

          // Try to parse JSON response
          let result;
          try {
            result = JSON.parse(rawResponse);
          } catch (parseError) {
            console.error('🤖 Simple API: Failed to parse artist analysis JSON:', parseError);
            console.error('🤖 Simple API: Raw response that failed to parse:', rawResponse);

            // ENHANCED: Try to fix common JSON issues and re-parse
            let fixedResponseText = rawResponse;

            // Fix 1: Escape unescaped quotes in JSON string values
            // Look for patterns like "field": "value with "quotes" inside"
            fixedResponseText = fixedResponseText.replace(
              /"([^"]+)"\s*:\s*"([^"]*)"([^"]*)"([^"]*)"/g,
              '"$1": "$2\\"$3\\"$4"'
            );

            // Fix 2: Handle more complex quote escaping in suggestedTitle and reasoning
            fixedResponseText = fixedResponseText.replace(
              /"(suggestedTitle|reasoning)"\s*:\s*"([^"]*""[^"]*"[^"]*)"/g,
              (match, field, value) => {
                const escapedValue = value.replace(/"/g, '\\"');
                return `"${field}": "${escapedValue}"`;
              }
            );

            // Fix 3: Handle trailing commas
            fixedResponseText = fixedResponseText.replace(/,(\s*[}\]])/g, '$1');

            // Fix 4: Ensure proper boolean formatting
            fixedResponseText = fixedResponseText.replace(/:\s*(true|false)([,\s}])/g, ': $1$2');

            console.log('🔧 Simple API: Attempting to fix JSON:', fixedResponseText);

            try {
              result = JSON.parse(fixedResponseText);
              console.log('✅ Simple API: Successfully parsed fixed JSON');
            } catch (secondParseError) {
              console.log('🤖 Simple API: Failed to parse fixed JSON:', secondParseError);

              // FALLBACK: Try to extract JSON from response if it's wrapped in text
              const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                try {
                  // Apply the same fixes to the extracted JSON
                  let extractedJson = jsonMatch[0];
                  extractedJson = extractedJson.replace(
                    /"([^"]+)"\s*:\s*"([^"]*)"([^"]*)"([^"]*)"/g,
                    '"$1": "$2\\"$3\\"$4"'
                  );
                  extractedJson = extractedJson.replace(
                    /"(suggestedTitle|reasoning)"\s*:\s*"([^"]*""[^"]*"[^"]*)"/g,
                    (match, field, value) => {
                      const escapedValue = value.replace(/"/g, '\\"');
                      return `"${field}": "${escapedValue}"`;
                    }
                  );

                  result = JSON.parse(extractedJson);
                  console.log('✅ Simple API: Successfully extracted and fixed JSON from wrapped response');
                } catch (thirdParseError) {
                  console.log('🤖 Simple API: Failed to parse extracted JSON:', thirdParseError);

                  // FINAL FALLBACK: Extract data using regex
                  try {
                    const hasArtistMatch = rawResponse.match(/"hasArtist"\s*:\s*(true|false)/i);
                    const artistNameMatch = rawResponse.match(/"artistName"\s*:\s*"([^"]+)"/);
                    const confidenceMatch = rawResponse.match(/"confidence"\s*:\s*([\d.]+)/);
                    const suggestedTitleMatch = rawResponse.match(/"suggestedTitle"\s*:\s*"([^"]*(?:\\"[^"]*)*[^"]*)"/);
                    const reasoningMatch = rawResponse.match(/"reasoning"\s*:\s*"([^"]*(?:\\"[^"]*)*[^"]*)"/);

                    if (hasArtistMatch) {
                      result = {
                        hasArtist: hasArtistMatch[1].toLowerCase() === 'true',
                        artistName: artistNameMatch ? artistNameMatch[1] : null,
                        confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0,
                        suggestedTitle: suggestedTitleMatch ? suggestedTitleMatch[1].replace(/\\"/g, '"') : null,
                        reasoning: reasoningMatch ? reasoningMatch[1].replace(/\\"/g, '"') : 'Automatisk korrigering'
                      };
                      console.log('🔧 Simple API: Extracted data using regex fallback:', result);
                    } else {
                      console.error('❌ Simple API: All parsing attempts failed');
                      return { hasArtist: false };
                    }
                  } catch (regexError) {
                    console.error('❌ Simple API: Regex extraction failed:', regexError);
                    return { hasArtist: false };
                  }
                }
              } else {
                return { hasArtist: false };
              }
            }
          }

          // Validate the parsed result has expected structure
          if (typeof result !== 'object' || result === null) {
            console.error('🤖 Simple API: Parsed result is not an object:', result);
            return { hasArtist: false };
          }

          // Ensure required fields exist with default values
          const validatedResult = {
            hasArtist: Boolean(result.hasArtist),
            artistName: result.artistName || null,
            confidence: typeof result.confidence === 'number' ? result.confidence : 0.5,
            suggestedTitle: result.suggestedTitle || null,
            reasoning: result.reasoning || 'No reasoning provided'
          };

          console.log('🤖 Simple API: Validated artist analysis result:', validatedResult);
          return validatedResult;

        } catch (error) {
          console.error('🤖 Simple API: Artist analysis failed:', error);
          return { hasArtist: false };
        }
      }
    };
  }

  generatePromptForAddItems(itemData, fieldType) {
    const baseInfo = `
FÖREMÅLSINFORMATION:
Kategori: ${itemData.category || ''}
Nuvarande titel: ${itemData.title || ''}
Nuvarande beskrivning: ${itemData.description || ''}
Kondition: ${itemData.condition || ''}
Konstnär/Formgivare: ${itemData.artist || ''}
Sökord: ${itemData.keywords || ''}
`;

    if (fieldType === 'all') {
      return baseInfo + `
UPPGIFT: Förbättra titel, beskrivning, konditionsrapport och generera dolda sökord enligt svenska auktionsstandarder.
`;
    } else if (fieldType === 'title-correct') {
      return baseInfo + `
UPPGIFT: Korrigera ENDAST grammatik, stavning och struktur i titeln. Behåll ordning och innehåll exakt som det är.

KRITISKT - MINIMALA ÄNDRINGAR:
• Lägg INTE till ny information, material eller tidsperioder
• Ändra INTE ordningen på elementer
• Ta INTE bort information
• Korrigera ENDAST:
  - Saknade mellanslag ("SVERIGEStockholm" → "SVERIGE Stockholm")
  - Felplacerade punkter ("TALLRIK. keramik" → "TALLRIK, keramik")
  - Saknade citattecken runt titlar/motiv ("Dune Mario Bellini" → "Dune" Mario Bellini)
  - Stavfel i välkända namn/märken
  - Kommatecken istället för punkt mellan objekt och material

EXEMPEL KORRIGERINGAR:
• "SERVIRINGSBRICKA, akryl.Dune Mario Bellini" → "SERVIRINGSBRICKA, akryl, "Dune" Mario Bellini"
• "TALLRIKkeramik Sverige" → "TALLRIK, keramik, Sverige"
• "VAS. glas, 1970-tal" → "VAS, glas, 1970-tal"

Returnera ENDAST den korrigerade titeln utan extra formatering eller etiketter.
`;
    }

    return baseInfo + `
UPPGIFT: Förbättra ${fieldType} enligt svenska auktionsstandarder.
`;
  }

  parseClaudeResponseForAddItems(response, fieldType) {
    // Simple parsing for add items improvements
    const improvements = {};

    if (fieldType === 'all') {
      improvements.title = response.match(/Titel:\s*(.+?)(?=\n|$)/)?.[1]?.trim() || '';
      improvements.description = response.match(/Beskrivning:\s*(.+?)(?=\n|$)/)?.[1]?.trim() || '';
      improvements.condition = response.match(/Kondition:\s*(.+?)(?=\n|$)/)?.[1]?.trim() || '';
      improvements.keywords = response.match(/Sökord:\s*(.+?)(?=\n|$)/)?.[1]?.trim() || '';
    } else if (fieldType === 'title-correct') {
      // For title corrections, map to 'title' field for application
      improvements.title = response.trim();
    } else {
      improvements[fieldType] = response.trim();
    }

    return improvements;
  }

  createSimpleQualityAnalyzer(apiManager) {
    // NEW: Create quality analyzer with ArtistDetectionManager SSoT instead of simplified detection
    return {
      // Use ArtistDetectionManager SSoT for robust detection
      artistDetectionManager: new window.ArtistDetectionManager(apiManager),

      async detectMisplacedArtist(title, artistField, forceReDetection = false) {
        console.log('🎯 Simple quality analyzer: Using ArtistDetectionManager SSoT for detection');
        return await this.artistDetectionManager.detectMisplacedArtist(title, artistField, forceReDetection);
      }
    };
  }

  // Legacy method for backward compatibility (edit pages)
  isCorrectPage() {
    const pageInfo = this.detectPageType();
    return pageInfo.isSupported && pageInfo.type === 'edit';
  }

  async loadApiKey() {
    try {
      const result = await chrome.storage.sync.get(['anthropicApiKey']);
      this.apiKey = result.anthropicApiKey;
      console.log('API key loaded from storage:', this.apiKey ? 'Found' : 'Not found');
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

  async showArtistBiography(artistName) {
    try {
      // Create a simple API call to get biography
      if (!this.apiKey) {
        alert('API-nyckel saknas för att hämta biografi');
        return;
      }

      const prompt = `Skriv en kort biografi (max 200 ord) på svenska om konstnären "${artistName}". Fokusera på viktiga datum, stil och kända verk. Svara endast med biografin, inga extra kommentarer.`;

      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiKey,
          body: {
            model: 'claude-3-5-haiku-20241022', // Use fast Haiku for biography generation
            max_tokens: 300,
            temperature: 0.3,
            system: 'Du är en konstexpert. Skriv korta, faktabaserade biografier på svenska.',
            messages: [{
              role: 'user',
              content: prompt
            }]
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.success) {
            resolve(response);
          } else {
            reject(new Error('Biography fetch failed'));
          }
        });
      });

      if (response.success && response.data?.content?.[0]?.text) {
        const biography = response.data.content[0].text;
        this.showBiographyModal(artistName, biography);
      }
    } catch (error) {
      console.error('❌ Error fetching biography:', error);
      alert('Kunde inte hämta biografi för ' + artistName);
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

  ignoreArtistDetection(artistName) {
    // For now, just re-analyze to remove the warning
    // In a more advanced implementation, we could store ignored artists
    setTimeout(() => this.analyzeQuality(), 100);
    console.log('🚫 Ignored artist detection for:', artistName);
  }



  async improveField(fieldType, force = false) {
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

    this.uiController.showFieldLoadingIndicator(fieldType);

    try {
      const improved = await this.callClaudeAPI(itemData, fieldType);
      console.log('Improved result for', fieldType, ':', improved);

      // For single field improvements, extract the specific field value
      // Handle title-correct mapping to title field
      const responseField = fieldType === 'title-correct' ? 'title' : fieldType;
      const value = improved[responseField];
      if (value) {
        this.applyImprovement(fieldType, value);
        this.uiController.showFieldSuccessIndicator(fieldType);

        // Re-analyze quality after improvement (with delay to ensure DOM is updated)
        console.log('Re-analyzing quality after single field improvement...');
        setTimeout(() => {
          console.log('Delayed quality analysis for single field...');
          this.analyzeQuality();
        }, 500);
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

    this.uiController.showFieldLoadingIndicator('all');

    try {
      const improvements = await this.callClaudeAPI(itemData, 'all');

      // Apply improvements and show individual success indicators with slight delays for cascade effect
      let delay = 0;

      if (improvements.title) {
        setTimeout(() => {
          this.applyImprovement('title', improvements.title);
          this.uiController.showFieldSuccessIndicator('title');
        }, delay);
        delay += 300;
      }

      if (improvements.description) {
        setTimeout(() => {
          this.applyImprovement('description', improvements.description);
          this.uiController.showFieldSuccessIndicator('description');
        }, delay);
        delay += 300;
      }

      if (improvements.condition) {
        setTimeout(() => {
          this.applyImprovement('condition', improvements.condition);
          this.uiController.showFieldSuccessIndicator('condition');
        }, delay);
        delay += 300;
      }

      if (improvements.keywords) {
        setTimeout(() => {
          this.applyImprovement('keywords', improvements.keywords);
          this.uiController.showFieldSuccessIndicator('keywords');
        }, delay);
        delay += 300;
      }

      // Show final success on master button after all fields are done
      setTimeout(() => {
        this.uiController.showFieldSuccessIndicator('all');
        setTimeout(() => this.analyzeQuality(), 500);
      }, delay);

    } catch (error) {
      this.uiController.showFieldErrorIndicator('all', error.message);
    }
  }

  handleArtistAction(action, data) {
    console.log(`🎨 Handling artist action: ${action}`, data);

    if (action === 'move') {
      // Move artist name to artist field
      const artistField = document.querySelector('#item_artist');
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
          warnings.push({ field: 'Beskrivning', issue: 'För kort - lägg till detaljer om material, teknik, färg, märkningar', severity: 'high' });
          score -= 25;
        }
        if (!data.description.match(/\d+[\s,]*(x|cm|mm)/i)) {
          warnings.push({ field: 'Beskrivning', issue: 'Saknar fullständiga mått', severity: 'high' });
          score -= 20;
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

  isDataTooSparse(data) {
    // Use the new assessment system for "Förbättra alla"
    const assessment = this.assessDataQuality(data, 'all');
    return assessment.needsMoreInfo || assessment.qualityScore < 40;
  }



  async processWithAdditionalInfo(info) {
    const itemData = this.extractItemData();
    itemData.additionalInfo = info;

    this.uiController.showFieldLoadingIndicator('all');

    try {
      const improvements = await this.callClaudeAPI(itemData, 'all-enhanced');
      this.applyAllImprovements(improvements);
    } catch (error) {
      this.uiController.showFieldErrorIndicator('all', error.message);
    }
  }

  async processWithoutAdditionalInfo() {
    const itemData = this.extractItemData();
    this.uiController.showFieldLoadingIndicator('all');

    try {
      const improvements = await this.callClaudeAPI(itemData, 'all-sparse');
      this.applyAllImprovements(improvements);
    } catch (error) {
      this.uiController.showFieldErrorIndicator('all', error.message);
    }
  }



  async forceImproveField(fieldType) {
    // Bypass quality checks and improve anyway
    const itemData = this.extractItemData();

    if (fieldType === 'all') {
      // For "Förbättra alla" - use existing logic
      this.uiController.showFieldLoadingIndicator('all');

      try {
        const improvements = await this.callClaudeAPI(itemData, 'all-sparse');
        this.applyAllImprovements(improvements);
      } catch (error) {
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
    setTimeout(() => {
      console.log('Delayed quality analysis after applyAllImprovements...');
      this.analyzeQuality();
    }, 500);
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

  async callClaudeAPI(itemData, fieldType, retryCount = 0) {
    // Check if API key is available
    if (!this.apiKey) {
      throw new Error('API key not configured. Please set your Anthropic API key in the extension popup.');
    }

    const systemPrompt = this.getSystemPrompt();
    const userPrompt = this.getUserPrompt(itemData, fieldType);

    try {
      // Use background script to make API call to avoid CORS issues
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiKey,
          body: {
            model: this.getCurrentModelId(), // Use Claude 4 for all operations
            max_tokens: fieldType === 'title-correct' ? 500 : 1500,
            temperature: 0.1,
            system: systemPrompt,
            messages: [{
              role: 'user',
              content: [{ type: 'text', text: userPrompt }] // Fixed: content should be array of content blocks
            }]
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.success) {
            resolve(response);
          } else {
            reject(new Error(response.error || 'API request failed'));
          }
        });
      });

      return await this.processAPIResponse(response, systemPrompt, userPrompt, fieldType);

    } catch (error) {
      // Handle rate limiting and overload errors with retry
      if ((error.message.includes('Overloaded') || error.message.includes('rate limit') || error.message.includes('429')) && retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
        console.log(`API overloaded, retrying in ${delay}ms (attempt ${retryCount + 1}/3)`);

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.callClaudeAPI(itemData, fieldType, retryCount + 1);
      }

      // If it's an overload error and we've exhausted retries, provide helpful message
      if (error.message.includes('Overloaded')) {
        throw new Error('Claude API är överbelastad just nu. Vänta en stund och försök igen.');
      }

      throw error;
    }
  }

  async processAPIResponse(response, systemPrompt, userPrompt, fieldType) {

    const data = response.data;
    console.log('Received API response:', data);

    // Validate response structure
    if (!data || !data.content || !Array.isArray(data.content) || data.content.length === 0) {
      throw new Error('Invalid response format from API');
    }

    if (!data.content[0] || !data.content[0].text) {
      throw new Error('No text content in API response');
    }

    let result = this.parseClaudeResponse(data.content[0].text, fieldType);

    // If validation failed, retry with correction instructions (only for multi-field requests)
    if (result.needsCorrection && ['all', 'all-enhanced', 'all-sparse'].includes(fieldType)) {
      const correctionPrompt = `
De föregående förslagen klarade inte kvalitetskontrollen:
Poäng: ${result.validationScore}/100

FEL SOM MÅSTE RÄTTAS:
${result.validationErrors.join('\n')}

FÖRBÄTTRINGSFÖRSLAG:
${result.validationWarnings.join('\n')}

Vänligen korrigera dessa problem och returnera förbättrade versioner som följer alla svenska auktionsstandarder.
`;

      const correctionResponse = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiKey,
          body: {
            model: this.getCurrentModelId(), // Use current model for corrections
            max_tokens: 1500,
            temperature: 0.1,
            system: systemPrompt,
            messages: [
              { role: 'user', content: userPrompt },
              { role: 'assistant', content: data.content[0].text },
              { role: 'user', content: correctionPrompt }
            ]
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.success) {
            resolve(response);
          } else {
            reject(new Error(response.error || 'API request failed'));
          }
        });
      });

      if (correctionResponse.success) {
        const correctionData = correctionResponse.data;
        console.log('Received correction response:', correctionData);

        // Validate correction response structure
        if (correctionData && correctionData.content && correctionData.content[0] && correctionData.content[0].text) {
          result = this.parseClaudeResponse(correctionData.content[0].text, fieldType);
        } else {
          console.warn('Invalid correction response format, using original result');
        }
      }
    }

    return result;
  }

  getSystemPrompt() {
    return `Du är en professionell auktionskatalogiserare. Skapa objektiva, faktabaserade katalogiseringar enligt svenska auktionsstandarder.

GRUNDREGLER:
• Använd endast verifierbara fakta
• Skriv objektivt utan säljande språk
• Använd etablerad auktionsterminologi
• UPPFINN ALDRIG information som inte finns

FÖRBJUDET:
• Säljande uttryck: "vacker", "fantastisk", "unik", "sällsynt"
• Meta-kommentarer: "ytterligare uppgifter behövs", "mer information krävs"
• Spekulationer och gissningar

TITELFORMAT (max 60 tecken):
Om konstnär-fält tomt: [KONSTNÄR], [Föremål], [Material], [Period]
Om konstnär-fält ifyllt: [Föremål], [Material], [Period]

OSÄKERHETSMARKÖRER - BEHÅLL ALLTID:
"troligen", "tillskriven", "efter", "stil av", "möjligen"

KONDITION - KRITISKA REGLER:
• Använd korta, faktabaserade termer: "Välbevarat", "Mindre repor", "Nagg vid kanter"
• UPPFINN ALDRIG nya skador, placeringar eller detaljer
• Om original säger "repor" - skriv INTE "repor i metallramen" eller "repor på ytan"
• Lägg ALDRIG till specifika platser som "i metallramen", "på ovansidan", "vid foten"
• Förbättra ENDAST språket - lägg INTE till nya faktauppgifter

STRIKT ANTI-HALLUCINATION:
• Förbättra ENDAST språk och struktur av BEFINTLIG information
• Lägg INTE till material, mått, skador, placeringar som inte är nämnda
• Kopiera EXAKT samma skadeinformation som redan finns
• Katalogtext ska vara FÄRDIG utan önskemål om mer data
• ALDRIG lägga till detaljer för att "förbättra" - bara förbättra språket`;
  }

  getUserPrompt(itemData, fieldType) {
    const baseInfo = `
FÖREMÅLSINFORMATION:
Kategori: ${itemData.category}
Nuvarande titel: ${itemData.title}
Nuvarande beskrivning: ${itemData.description}
Kondition: ${itemData.condition}
Konstnär/Formgivare: ${itemData.artist}
Värdering: ${itemData.estimate} SEK

VIKTIGT FÖR TITEL: ${itemData.artist ?
        'Konstnär/formgivare-fältet är ifyllt (' + itemData.artist + '), så inkludera INTE konstnärens namn i titeln - det läggs till automatiskt av systemet.' :
        'Konstnär/formgivare-fältet är tomt, så inkludera konstnärens namn i titeln om det är känt.'}

KONSTNÄRSINFORMATION FÖR TIDSPERIOD:
${itemData.artist ?
        'Konstnär/formgivare: ' + itemData.artist + ' - Använd din kunskap om denna konstnärs aktiva period för att bestämma korrekt tidsperiod. Om du inte är säker, använd "troligen" eller utelämna period.' :
        'Ingen konstnär angiven - lägg INTE till tidsperiod om den inte redan finns i källdata.'}

KRITISKT - BEHÅLL OSÄKERHETSMARKÖRER I TITEL:
Om nuvarande titel innehåller ord som "troligen", "tillskriven", "efter", "stil av", "möjligen", "typ" - BEHÅLL dessa exakt. De anger juridisk osäkerhet och får ALDRIG tas bort eller ändras.

ANTI-HALLUCINATION INSTRUKTIONER:
• Lägg ALDRIG till information som inte finns i källdata
• Uppfinn ALDRIG tidsperioder, material, mått eller skador
• Förbättra ENDAST språk, struktur och terminologi
• Om information saknas - utelämna eller använd osäkerhetsmarkörer
`;

    if (fieldType === 'all') {
      return baseInfo + `
UPPGIFT: Förbättra titel, beskrivning, konditionsrapport och generera dolda sökord enligt svenska auktionsstandarder.

KRITISKT - FÄLTAVGRÄNSNING:
• BESKRIVNING: Material, teknik, mått, stil, ursprung, märkningar, funktion - ALDRIG konditionsinformation
• KONDITION: Endast fysiskt skick och skador - ALDRIG beskrivande information
• Håll fälten strikt separerade - konditionsdetaljer som "slitage", "repor", "märken" hör ENDAST i konditionsfältet
• Om konditionsinformation finns i nuvarande beskrivning - flytta den till konditionsfältet

KRITISKT - ANTI-HALLUCINATION REGLER:
• Lägg ALDRIG till information som inte finns i källdata
• Uppfinn INTE tidsperioder, material, mått eller skador
• Använd konstnärsinformation för tidsperiod ENDAST om du är säker
• Förbättra ENDAST språk, struktur och terminologi av befintlig information
• Lägg ALDRIG till kommentarer om vad som "behövs", "saknas" eller "krävs"
• Skriv INTE fraser som "ytterligare uppgifter behövs" eller "mer information krävs"
• Katalogtext ska vara FÄRDIG och KOMPLETT utan önskemål om mer data

Returnera EXAKT i detta format (en rad per fält):
TITEL: [förbättrad titel]
BESKRIVNING: [förbättrad beskrivning utan konditionsinformation]
KONDITION: [förbättrad konditionsrapport]
SÖKORD: [relevanta sökord separerade med mellanslag, använd "-" för flerordsfraser]
VALIDERING: [kvalitetspoäng och eventuella varningar]

VIKTIGT FÖR SÖKORD: Använd kommatecken för att separera sökord.
EXEMPEL: "konstglas, mundblåst, svensk design, 1960-tal, samlarobjekt"

Använd INTE markdown formatering eller extra tecken som ** eller ***. Skriv bara ren text.`;
    } else if (fieldType === 'all-enhanced' && itemData.additionalInfo) {
      return baseInfo + `
YTTERLIGARE INFORMATION:
Material: ${itemData.additionalInfo.material}
Teknik: ${itemData.additionalInfo.technique}
Märkningar: ${itemData.additionalInfo.markings}
Specifika skador: ${itemData.additionalInfo.damage}
Övrigt: ${itemData.additionalInfo.additional}

UPPGIFT: Använd all tillgänglig information för att skapa professionell katalogisering.

ANTI-HALLUCINATION REGLER:
• Använd ENDAST den information som angivits ovan
• Lägg INTE till ytterligare detaljer som inte är nämnda
• Kombinera källdata med tilläggsinfo på ett faktabaserat sätt
• Lägg ALDRIG till kommentarer om vad som "behövs" eller "saknas"
• Katalogtext ska vara FÄRDIG och KOMPLETT

Returnera EXAKT i detta format (en rad per fält):
TITEL: [förbättrad titel med korrekt material]
BESKRIVNING: [detaljerad beskrivning med all relevant information]
KONDITION: [specifik konditionsrapport baserad på angiven information]
SÖKORD: [omfattande sökord baserade på all information]
VALIDERING: [kvalitetspoäng och förbättringar]

Använd INTE markdown formatering eller extra tecken som ** eller ***. Skriv bara ren text.`;
    } else if (fieldType === 'all-sparse') {
      return baseInfo + `
UPPGIFT: Informationen är mycket knapphändig. Gör ditt bästa för att förbättra baserat på tillgänglig information, men markera var mer information behövs.

KRITISKT - SPARSE DATA REGLER:
• Förbättra ENDAST språk och struktur av befintlig information
• Lägg ALDRIG till påhittade detaljer för att fylla ut texten
• Om information saknas - lämna tomt eller använd osäkerhetsmarkörer
• Lägg ALDRIG till kommentarer om vad som "behövs" eller "saknas" i katalogtext
• Katalogtext ska vara FÄRDIG och KOMPLETT utan önskemål om mer data

Returnera EXAKT i detta format (en rad per fält):
TITEL: [förbättrad titel]
BESKRIVNING: [förbättrad beskrivning]
KONDITION: [förbättrad konditionsrapport]
SÖKORD: [generera så många relevanta sökord som möjligt]
VALIDERING: [kvalitetspoäng och eventuella varningar]

Använd INTE markdown formatering eller extra tecken som ** eller ***. Skriv bara ren text.`;
    } else if (fieldType === 'title') {
      return baseInfo + `
UPPGIFT: Förbättra endast titeln enligt svenska auktionsstandarder. Max 60 tecken.

KRITISKT VIKTIGT - BEHÅLL OSÄKERHETSMARKÖRER:
Om originaltiteln innehåller "troligen", "tillskriven", "efter", "stil av", "möjligen", "typ", "skola av", eller "krets kring" - BEHÅLL dessa ord exakt som de är. De anger juridisk osäkerhet och får ALDRIG tas bort.

ANTI-HALLUCINATION FÖR TITEL:
• Lägg INTE till tidsperiod om den inte finns i originaldata ELLER kan härledas från känd konstnär
• Lägg INTE till material som inte är nämnt
• Lägg INTE till platser eller tillverkare som inte är angivna
• Förbättra ENDAST struktur, stavning och terminologi

EXEMPEL:
Original: "TALLRIK, fajans, troligen Matet, Martres-Tolosane, Frankrike, 18/1900-tal"
Korrekt: "TALLRIK, fajans, troligen Matet, Martres-Tolosane, 18/1900-tal"
FEL: "TALLRIK, fajans, Matet, Martres-Tolosane, 18/1900-tal" (troligen borttaget)

Returnera ENDAST den förbättrade titeln utan extra formatering eller etiketter.`;
    } else if (fieldType === 'title-correct') {
      return baseInfo + `
UPPGIFT: Korrigera ENDAST grammatik, stavning och struktur i titeln. Behåll ordning och innehåll exakt som det är.

KRITISKT - MINIMALA ÄNDRINGAR:
• Lägg INTE till ny information, material eller tidsperioder
• Ändra INTE ordningen på elementer
• Ta INTE bort information
• Korrigera ENDAST:
  - Saknade mellanslag ("SVERIGEStockholm" → "SVERIGE Stockholm")
  - Felplacerade punkter ("TALLRIK. keramik" → "TALLRIK, keramik")
  - Saknade citattecken runt titlar/motiv ("Dune Mario Bellini" → "Dune" Mario Bellini)
  - Stavfel i välkända namn/märken
  - Kommatecken istället för punkt mellan objekt och material

EXEMPEL KORRIGERINGAR:
• "SERVIRINGSBRICKA, akryl.Dune Mario Bellini" → "SERVIRINGSBRICKA, akryl, "Dune" Mario Bellini"
• "TALLRIKkeramik Sverige" → "TALLRIK, keramik, Sverige"
• "VAS. glas, 1970-tal" → "VAS, glas, 1970-tal"

Returnera ENDAST den korrigerade titeln utan extra formatering eller etiketter.`;
    } else if (fieldType === 'description') {
      return baseInfo + `
UPPGIFT: Förbättra endast beskrivningen. Inkludera mått om de finns, använd korrekt terminologi.

KRITISKT - FÄLTAVGRÄNSNING FÖR BESKRIVNING:
• Inkludera ALDRIG konditionsinformation i beskrivningen
• Konditionsdetaljer som "slitage", "repor", "märken", "skador", "nagg", "sprickor", "fläckar" hör ENDAST hemma i konditionsfältet
• Beskrivningen ska fokusera på: material, teknik, mått, stil, ursprung, märkningar, funktion
• EXEMPEL PÅ FÖRBJUDET I BESKRIVNING: "Slitage förekommer", "repor och märken", "normalt åldersslitage", "mindre skador"
• Om konditionsinformation finns i nuvarande beskrivning - TA BORT den och behåll endast beskrivande information

ANTI-HALLUCINATION FÖR BESKRIVNING:
• Lägg INTE till mått som inte är angivna
• Lägg INTE till material som inte är nämnt
• Lägg INTE till tekniker som inte är beskrivna
• Lägg INTE till märkningar eller signaturer som inte finns
• Förbättra ENDAST språk, struktur och befintlig information
• Lägg ALDRIG till kommentarer om vad som "saknas" eller "behövs"
• Skriv INTE fraser som "ytterligare uppgifter behövs" eller "information saknas"

Returnera ENDAST den förbättrade beskrivningen utan extra formatering eller etiketter.`;
    } else if (fieldType === 'condition') {
      return baseInfo + `
UPPGIFT: Förbättra konditionsrapporten. Skriv KORT och FAKTABASERAT. Använd endast standardtermer. Max 2-3 korta meningar.

KRITISKT - FÄLTAVGRÄNSNING FÖR KONDITION:
• Fokusera ENDAST på fysiskt skick och skador
• Inkludera ALDRIG beskrivande information om material, teknik, stil eller funktion
• Konditionsrapporten ska vara separat från beskrivningen
• Använd specifika konditionstermer: "repor", "nagg", "sprickor", "fläckar", "välbevarat", "mindre skador"
• UNDVIK vaga termer som endast "bruksslitage" - var specifik

KRITISKT - ANTI-HALLUCINATION FÖR KONDITION:
• Beskriv ENDAST skador/slitage som redan är nämnda i nuvarande kondition
• Lägg ALDRIG till specifika placeringar som "i metallramen", "på ovansidan", "vid foten" om inte redan angivet
• Lägg ALDRIG till specifika mått som "repor 3cm" om inte angivet
• Lägg ALDRIG till nya defekter, material eller delar som inte nämns
• Lägg ALDRIG till detaljer om VAR skadorna finns om det inte redan står i originalet
• EXEMPEL PÅ FÖRBJUDET: Om original säger "repor" - skriv INTE "repor i metallramen" eller "repor på ytan"
• Förbättra ENDAST språk och använd standardtermer för EXAKT samma information som redan finns
• Om originalet säger "bruksslitage" - förbättra till "normalt bruksslitage" eller "synligt bruksslitage", INTE "repor och märken"
• Lägg ALDRIG till kommentarer om vad som "behövs" eller "saknas"
• Skriv INTE fraser som "ytterligare uppgifter behövs" eller "mer information krävs"

STRIKT REGEL: Kopiera ENDAST den skadeinformation som redan finns - lägg ALDRIG till nya detaljer.

EXEMPEL PÅ KORREKT FÖRBÄTTRING:
Original: "bruksslitage" → Förbättrat: "Normalt bruksslitage"
Original: "repor" → Förbättrat: "Mindre repor" (INTE "repor i metallramen")
Original: "slitage förekommer" → Förbättrat: "Synligt slitage"

UNDVIK: Långa beskrivningar, förklaringar av tillverkningstekniker, värderande kommentarer, påhittade skador, specifika placeringar.

Returnera ENDAST den förbättrade konditionsrapporten utan extra formatering eller etiketter.`;
    } else if (fieldType === 'keywords') {
      return baseInfo + `
UPPGIFT: Generera HÖGKVALITATIVA dolda sökord som kompletterar titel och beskrivning enligt Auctionets format.

KRITISKT - UNDVIK ALLA UPPREPNINGAR:
• Generera ENDAST sökord som INTE redan finns i nuvarande titel/beskrivning
• Läs noggrant igenom titel och beskrivning INNAN du skapar sökord
• Om ordet redan finns någonstans - använd det INTE
• Fokusera på HELT NYA alternativa söktermer som köpare kan använda
• Exempel: Om titel säger "färglitografi" - använd INTE "färglitografi" igen

KOMPLETTERANDE SÖKORD - EXEMPEL:
• För konsttryck: "grafik reproduktion konstprint limited-edition"
• För målningar: "oljemålning akvarell konstverk originalverk"  
• För skulptur: "skulptur plastik konstföremål tredimensionell"
• För möbler: "vintage retro funktionalism dansk-design"
• För perioder: Använd decennier istället för exakta år: "1970-tal" istället av "1974"

OBLIGATORISK AUCTIONET FORMAT:
• Separera sökord med MELLANSLAG (ALDRIG kommatecken)
• Använd "-" för flerordsfraser: "svensk-design", "1970-tal", "limited-edition"
• EXEMPEL KORREKT: "grafik reproduktion svensk-design 1970-tal konstprint"
• EXEMPEL FEL: "grafik, reproduktion, svensk design, 1970-tal" (kommatecken och mellanslag i fraser)

KRITISKT - RETURFORMAT:
• Returnera ENDAST sökorden separerade med mellanslag
• INGA kommatecken mellan sökord
• INGA förklaringar, kommentarer eller etiketter
• MAX 10-12 relevanta termer
• EXEMPEL: "grafik reproduktion svensk-design 1970-tal dekor inredning"

STRIKT REGEL: Läs titel och beskrivning noggrant - om ett ord redan finns där, använd det ALDRIG i sökorden.`;
    } else if (fieldType === 'biography') {
      return `
UPPGIFT: Skriv en kort, informativ biografi om konstnären "${itemData.artist}" på svenska.

KRAV:
• Max 150 ord
• Fokusera på stil, period, viktiga verk och betydelse
• Skriv på professionell svenska
• Inga inledande fraser som "Här är en biografi..."
• Bara ren text

FORMAT:
Returnera endast biografin som ren text.
`;
    }
  }

  parseClaudeResponse(response, fieldType) {
    console.log('Parsing Claude response for fieldType:', fieldType, 'Response:', response);

    // Validate input
    if (!response || typeof response !== 'string') {
      console.error('Invalid response format:', response);
      throw new Error('Invalid response format from Claude');
    }

    // For single field requests, parse the structured response
    if (['title', 'title-correct', 'description', 'condition', 'keywords'].includes(fieldType)) {
      const result = {};
      const lines = response.split('\n');

      lines.forEach(line => {
        const trimmedLine = line.trim();

        if (trimmedLine.match(/^\*?\*?TITEL\s*:?\*?\*?\s*/i)) {
          result.title = trimmedLine.replace(/^\*?\*?TITEL\s*:?\*?\*?\s*/i, '').trim();
        } else if (trimmedLine.match(/^\*?\*?BESKRIVNING\s*:?\*?\*?\s*/i)) {
          result.description = trimmedLine.replace(/^\*?\*?BESKRIVNING\s*:?\*?\*?\s*/i, '').trim();
        } else if (trimmedLine.match(/^\*?\*?KONDITION\s*:?\*?\*?\s*/i)) {
          result.condition = trimmedLine.replace(/^\*?\*?KONDITION\s*:?\*?\*?\s*/i, '').trim();
        } else if (trimmedLine.match(/^\*?\*?SÖKORD\s*:?\*?\*?\s*/i)) {
          result.keywords = trimmedLine.replace(/^\*?\*?SÖKORD\s*:?\*?\*?\s*/i, '').trim();
        }
      });

      // If no structured response found, treat as legacy format
      if (Object.keys(result).length === 0) {
        result[fieldType] = response.trim();
      }

      // For title-correct, map the result to the correct field type
      if (fieldType === 'title-correct' && result[fieldType]) {
        result['title'] = result[fieldType];
        delete result[fieldType];
      }

      console.log('Single field parsed result:', result);
      return result;
    }

    // Parse the structured response from Claude for multi-field requests
    const result = {};
    const lines = response.split('\n');

    lines.forEach(line => {
      const trimmedLine = line.trim();

      // Handle different formats: "TITEL:", "**TITEL:**", "**TITEL (XX tecken):**"
      if (trimmedLine.match(/^\*?\*?TITEL(\s*\([^)]*\))?\s*:?\*?\*?\s*/i)) {
        result.title = trimmedLine.replace(/^\*?\*?TITEL(\s*\([^)]*\))?\s*:?\*?\*?\s*/i, '').trim();
      } else if (trimmedLine.match(/^\*?\*?BESKRIVNING\s*:?\*?\*?\s*/i)) {
        result.description = trimmedLine.replace(/^\*?\*?BESKRIVNING\s*:?\*?\*?\s*/i, '').trim();
      } else if (trimmedLine.match(/^\*?\*?KONDITION(SRAPPORT)?\s*:?\*?\*?\s*/i)) {
        result.condition = trimmedLine.replace(/^\*?\*?KONDITION(SRAPPORT)?\s*:?\*?\*?\s*/i, '').trim();
      } else if (trimmedLine.match(/^\*?\*?SÖKORD\s*:?\*?\*?\s*/i)) {
        result.keywords = trimmedLine.replace(/^\*?\*?SÖKORD\s*:?\*?\*?\s*/i, '').trim();
      } else if (trimmedLine.match(/^\*?\*?VALIDERING\s*:?\*?\*?\s*/i)) {
        result.validation = trimmedLine.replace(/^\*?\*?VALIDERING\s*:?\*?\*?\s*/i, '').trim();
      }

      // Handle simple formats (legacy)
      else if (trimmedLine.startsWith('TITEL:')) {
        result.title = trimmedLine.substring(6).trim();
      } else if (trimmedLine.startsWith('BESKRIVNING:')) {
        result.description = trimmedLine.substring(12).trim();
      } else if (trimmedLine.startsWith('KONDITION:')) {
        result.condition = trimmedLine.substring(10).trim();
      } else if (trimmedLine.startsWith('SÖKORD:')) {
        result.keywords = trimmedLine.substring(7).trim();
      } else if (trimmedLine.startsWith('VALIDERING:')) {
        result.validation = trimmedLine.substring(11).trim();
      }
    });

    // If we only got a simple response (like just a title), handle it appropriately
    if (Object.keys(result).length === 0 && response.trim().length > 0) {
      // Assume it's a single field response based on the request type
      result.title = response.trim();
    }

    console.log('Multi-field parsed result:', result);

    // Validate the response against Swedish auction standards
    const validation = this.validateSwedishAuctionStandards(result);

    // If validation fails, retry once with corrections
    if (validation.score < 70) {
      result.needsCorrection = true;
      result.validationErrors = validation.errors;
      result.validationWarnings = validation.warnings;
      result.validationScore = validation.score;
    }

    return result;
  }

  validateSwedishAuctionStandards(data) {
    const errors = [];
    const warnings = [];
    let score = 100;

    // Validate Title
    if (data.title) {
      if (data.title.length > 60) {
        warnings.push('Titeln är för lång (max 60 tecken)');
        score -= 10;
      }
      if (data.title.match(/^[a-z]/)) {
        errors.push('Titeln måste börja med stor bokstav');
        score -= 20;
      }
      // Check for forbidden words in title
      const forbiddenTitle = ['vacker', 'fin', 'underbar', 'fantastisk'];
      if (new RegExp(forbiddenTitle.join('|'), 'i').test(data.title)) {
        errors.push('Titeln innehåller subjektiva ord');
        score -= 20;
      }
    }

    // Validate Description
    if (data.description) {
      if (data.description.length < 20) {
        warnings.push('Beskrivningen är mycket kort');
        score -= 10;
      }
      // Check for condition info in description
      const conditionTerms = ['slitage', 'skada', 'nagg', 'spricka', 'repa'];
      if (new RegExp(conditionTerms.join('|'), 'i').test(data.description)) {
        warnings.push('Beskrivningen verkar innehålla konditionsinformation');
        score -= 15;
      }
    }

    // Validate Condition
    if (data.condition) {
      if (data.condition.length < 10 && !data.condition.toLowerCase().includes('inga anmärkningar')) {
        warnings.push('Konditionsrapporten är mycket kort');
        score -= 5;
      }
    }

    return { score, errors, warnings };
  }








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