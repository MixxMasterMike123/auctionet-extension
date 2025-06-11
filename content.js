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

// Monitor for DOM changes to detect page transitions
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      // Check if we're now on a supported page
      setTimeout(() => {
        if (!window.auctionetAssistantInitialized) {
          window.auctionetAssistant?.tryInitialize?.();
        }
      }, 500);
    }
  });
});

observer.observe(document.body, { childList: true, subtree: true });

class AuctionetCatalogingAssistant {
  constructor() {
    this.apiKey = null;
    this.currentPage = null;
    this.tooltipManager = null;
    this.isProgrammaticUpdate = false; // Track when we're updating fields programmatically
    
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
  }

  async init() {
    // Wait for page to be fully loaded
    if (document.readyState === 'loading') {
      await new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', resolve);
      });
    }

    // Additional wait to ensure dynamic content is loaded
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if we're on the right page and determine page type
    const pageInfo = this.detectPageType();
    
    if (!pageInfo.isSupported) {
      return;
    }

    this.currentPage = pageInfo.type;
    console.log('✅ Auctionet AI Assistant: On supported page, type:', this.currentPage);
    
    await this.loadApiKey();
    
    if (this.currentPage === 'edit') {
      this.injectUI();
      this.attachEventListeners();
    } else if (this.currentPage === 'add') {
      await this.initializeAddItemsTooltips();
    }
  }

  detectPageType() {
    const url = window.location.href;
    const hash = window.location.hash;
    
    // Check for edit page
    if (url.includes('auctionet.com/admin/') && 
        url.includes('/items/') && 
        url.includes('/edit') &&
        document.querySelector('#item_title_sv')) {
      return { isSupported: true, type: 'edit' };
    }
    
    // Check for add items page - NEW URL PATTERN
    if (url.includes('auctionet.com/admin/sas/sellers/') && 
        url.includes('/contracts/') &&
        hash === '#new_item' &&
        document.querySelector('#item_title_sv')) {
      return { isSupported: true, type: 'add' };
    }
    
    // Legacy check for old add items URL pattern (fallback)
    if (url.includes('auctionet.com/admin/') && 
        url.includes('/items/new') &&
        document.querySelector('#item_title_sv')) {
      return { isSupported: true, type: 'add' };
    }
    
    return { isSupported: false, type: null };
  }

  async initializeAddItemsTooltips() {
    try {
      console.log('🎯 Initializing Add Items with new modular components...');
      
      // Wait for all required classes to be loaded via dynamic imports
      if (!window.AddItemsAPIBridge || !window.TooltipSystemManager || !window.FieldQualityAnalyzer || !window.FieldMonitorManager || !window.AddItemsIntegrationManager) {
        await new Promise(resolve => {
          const checkForClasses = () => {
            if (window.AddItemsAPIBridge && window.TooltipSystemManager && window.FieldQualityAnalyzer && window.FieldMonitorManager && window.AddItemsIntegrationManager) {
              console.log('✅ Dynamic imports loaded successfully');
              resolve();
            } else {
              setTimeout(checkForClasses, 100);
            }
          };
          checkForClasses();
        });
      }

      // 🎯 NEW: Use API Bridge that connects to edit page API manager
      console.log('🚀 Creating API Bridge with edit page integration...');
      const apiBridge = new window.AddItemsAPIBridge();
      await apiBridge.init();

      // Initialize new modular components
      console.log('🎯 Initializing modular tooltip system components...');
      
      // Create the tooltip system manager
      this.tooltipSystemManager = new window.TooltipSystemManager();
      this.tooltipSystemManager.init();
      
      // Create the field quality analyzer
      this.fieldQualityAnalyzer = new window.FieldQualityAnalyzer();
      this.fieldQualityAnalyzer.setApiManager(apiBridge.getAPIManager());
      
      // Create the field monitor manager
      this.fieldMonitorManager = new window.FieldMonitorManager();
      this.fieldMonitorManager.init({
        tooltipSystemManager: this.tooltipSystemManager,
        fieldQualityAnalyzer: this.fieldQualityAnalyzer,
        apiBridge: apiBridge
      });
      
      // Create the integration manager to handle UI features
      this.integrationManager = new window.AddItemsIntegrationManager();
      this.integrationManager.init({
        apiBridge: apiBridge,
        tooltipSystemManager: this.tooltipSystemManager,
        fieldQualityAnalyzer: this.fieldQualityAnalyzer,
        fieldMonitorManager: this.fieldMonitorManager
      });
      
      // Store the bridge for potential future use
      this.apiBridge = apiBridge;
      
      console.log('✅ Add items system initialized with new modular components');
      
    } catch (error) {
      console.error('❌ Failed to initialize add items with modular components:', error);
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
                model: 'claude-3-haiku-20240307',
                max_tokens: 2000,
                temperature: 0.7,
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
                model: 'claude-3-haiku-20240307',
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

  injectUI() {
    console.log('🎨 Injecting UI elements...');
    
    // Add AI assistance button next to each field
    const titleField = document.querySelector('#item_title_sv');
    const descriptionField = document.querySelector('#item_description_sv');
    const conditionField = document.querySelector('#item_condition_sv');
    const keywordsField = document.querySelector('#item_hidden_keywords');

    console.log('🔍 Found fields:', {
      title: !!titleField,
      description: !!descriptionField,
      condition: !!conditionField,
      keywords: !!keywordsField
    });
    
    console.log('📋 Field details:');
    console.log('Title field element:', titleField);
    console.log('Description field element:', descriptionField);
    console.log('Condition field element:', conditionField);
    console.log('Keywords field element:', keywordsField);

    if (titleField) {
      this.addAIButton(titleField, 'title', 'AI-förbättra titel');
    }
    if (descriptionField) {
      this.addAIButton(descriptionField, 'description', 'AI-förbättra beskrivning');
    }
    if (conditionField) {
      this.addAIButton(conditionField, 'condition', 'AI-förbättra kondition');
    }
    if (keywordsField) {
      this.addAIButton(keywordsField, 'keywords', 'AI-generera sökord');
    }

    // Add master "Improve All" button
    this.addMasterButton();

  }

  addMasterButton() {
    // Add quality indicator first, then add button to it
    this.addQualityIndicator();
  }

  addAIButton(field, type, buttonText) {
    const button = document.createElement('button');
    button.className = 'ai-assist-button';
    button.textContent = buttonText;
    button.type = 'button';
    button.dataset.fieldType = type;
    
    const wrapper = document.createElement('div');
    wrapper.className = 'ai-button-wrapper';
    wrapper.appendChild(button);
    
    // Position right after the field element, not at the end of parent
    field.parentNode.insertBefore(wrapper, field.nextSibling);
  }

  addQualityIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'quality-indicator';
    indicator.innerHTML = `
      <div class="quality-header">
        <h4 class="quality-title">Katalogiseringskvalitet</h4>
        <div class="quality-score-container">
          <span class="quality-score">Analyserar...</span>
          <button class="refresh-quality-btn" type="button" title="Uppdatera kvalitetspoäng">🔄</button>
        </div>
        <button class="ai-assist-button ai-master-button" type="button">⚡ Förbättra alla</button>
      </div>
      <div class="quality-warnings"></div>
    `;
    
    // Add CSS for better layout
    if (!document.getElementById('quality-indicator-styles')) {
      const style = document.createElement('style');
      style.id = 'quality-indicator-styles';
      style.textContent = `
        .quality-indicator {
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
          border: 1px solid #dee2e6;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .quality-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
        }
        
        .quality-title {
          margin: 0 0 10px 0;
          font-size: 14px;
          font-weight: 600;
          color: #333;
          text-align: center;
          width: 100%;
        }
        
        .quality-score-container {
          margin-bottom: 12px;
          width: 100%;
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        
        .quality-score {
          display: inline-block;
          font-weight: bold;
          padding: 6px 16px;
          border-radius: 20px;
          font-size: 14px;
          min-width: 80px;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          transition: all 0.3s ease;
        }
        
        .refresh-quality-btn {
          background: linear-gradient(135deg, #6c757d 0%, #495057 100%);
          color: white;
          border: none;
          border-radius: 50%;
          width: 28px;
          height: 28px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .refresh-quality-btn:hover {
          background: linear-gradient(135deg, #495057 0%, #343a40 100%);
          transform: rotate(180deg) scale(1.1);
        }
        
        .refresh-quality-btn:active {
          transform: rotate(180deg) scale(0.95);
        }
        
        .quality-score.good { 
          background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%); 
          color: #155724; 
          border: 2px solid #b8dacc;
        }
        
        .quality-score.medium { 
          background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%); 
          color: #856404; 
          border: 2px solid #f1c40f;
        }
        
        .quality-score.poor { 
          background: linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%); 
          color: #721c24; 
          border: 2px solid #e74c3c;
        }
        
        .ai-master-button {
          width: 100%;
          padding: 8px 16px;
          font-size: 14px;
          font-weight: 600;
          background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 2px 6px rgba(40, 167, 69, 0.3);
        }
        
        .ai-master-button:hover {
          background: linear-gradient(135deg, #218838 0%, #1e7e34 100%);
          transform: translateY(-1px);
          box-shadow: 0 3px 8px rgba(40, 167, 69, 0.4);
        }
        
        .ai-master-button:active {
          transform: translateY(0);
          box-shadow: 0 1px 4px rgba(40, 167, 69, 0.3);
        }
        
        .quality-warnings {
          margin-top: 15px;
          padding-top: 15px;
          border-top: 1px solid #dee2e6;
        }
        
        .quality-warnings ul {
          margin: 0;
          padding-left: 20px;
        }
        
        .quality-warnings li {
          margin-bottom: 8px;
          font-size: 14px;
        }
        
        .warning-high {
          color: #721c24;
          font-weight: 500;
        }
        
        .warning-medium {
          color: #856404;
        }
        
        .warning-low {
          color: #6c757d;
          font-style: italic;
        }
        
        .no-warnings {
          color: #155724;
          font-weight: 500;
          text-align: center;
          margin: 0;
          font-size: 14px;
        }
        
        /* AI Button Styles */
        .ai-button-wrapper {
          margin-top: 0px;
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        
        .ai-assist-button {
          padding: 6px 12px;
          font-size: 12px;
          background: #006ccc;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 300;
        }
        
        .ai-assist-button:hover {
          background: #0056b3;
        }
        
        .ai-assist-button:active {
          background: #004085;
        }
        
        .ai-undo-button {
          background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(220, 53, 69, 0.3);
          margin-left: 12px;
        }
        
        .ai-undo-button:hover {
          background: linear-gradient(135deg, #c82333 0%, #a71e2a 100%);
          transform: translateY(-1px);
          box-shadow: 0 3px 6px rgba(220, 53, 69, 0.4);
        }
        
        .ai-undo-button:active {
          transform: translateY(0);
          box-shadow: 0 1px 3px rgba(220, 53, 69, 0.3);
        }
        
        .ai-updated {
          background-color: #d4edda !important;
          border: 2px solid #28a745 !important;
          transition: all 0.3s ease;
        }
      `;
      document.head.appendChild(style);
    }
    
    const sidebar = document.querySelector('.grid-col4');
    console.log('🔍 Sidebar element found:', !!sidebar);
    console.log('📋 Sidebar element:', sidebar);
    
    if (sidebar) {
      console.log('✅ Adding quality indicator to sidebar');
      sidebar.insertBefore(indicator, sidebar.firstChild);
      
      // Add event listener for manual refresh button
      const refreshButton = indicator.querySelector('.refresh-quality-btn');
      if (refreshButton) {
        console.log('✅ Manual refresh button found, adding listener');
        refreshButton.addEventListener('click', () => {
          console.log('🔄 Manual quality refresh triggered');
          this.analyzeQuality();
        });
      } else {
        console.log('❌ Manual refresh button not found');
      }
      
      // Set up live quality monitoring
      console.log('🚀 Setting up live quality monitoring...');
      this.setupLiveQualityUpdates();
      console.log('✅ Live quality monitoring setup complete');
      
      // Initial quality analysis
      console.log('📊 Running initial quality analysis...');
      this.analyzeQuality();
    } else {
      console.log('❌ Sidebar not found - cannot add quality indicator');
    }
  }

  analyzeQuality() {
    console.log('🔍 analyzeQuality() called');
    const data = this.extractItemData();
    console.log('📊 Extracted data for quality analysis:', data);
    const warnings = [];
    let score = 100;
    
    // Check if "Inga anmärkningar" (No remarks) is checked
    const noRemarksCheckbox = document.querySelector('input[type="checkbox"][value="Inga anmärkningar"]') || 
                             document.querySelector('input[type="checkbox"]#item_no_remarks') ||
                             document.querySelector('input[type="checkbox"][name*="no_remarks"]');
    const noRemarksChecked = noRemarksCheckbox && noRemarksCheckbox.checked;

    // Title quality checks
    if (data.title.length < 20) {
      warnings.push({ field: 'Titel', issue: 'För kort - lägg till material och period', severity: 'high' });
      score -= 20;
    }
    if (!data.title.includes(',')) {
      warnings.push({ field: 'Titel', issue: 'Saknar korrekt struktur (KONSTNÄR, Objekt, Material)', severity: 'medium' });
      score -= 15;
    }

    // Description quality checks
    const descLength = data.description.replace(/<[^>]*>/g, '').length;
    if (descLength < 50) {
      warnings.push({ field: 'Beskrivning', issue: 'För kort - lägg till detaljer om material, teknik, färg, märkningar', severity: 'high' });
      score -= 25;
    }
    if (!data.description.match(/\d+[\s,]*(x|cm)/i)) {
      warnings.push({ field: 'Beskrivning', issue: 'Saknar fullständiga mått', severity: 'high' });
      score -= 20;
    }

    // Condition quality checks (skip if "Inga anmärkningar" is checked)
    if (!noRemarksChecked) {
      const condLength = data.condition.replace(/<[^>]*>/g, '').length;
      if (condLength < 20) {
        warnings.push({ field: 'Kondition', issue: 'För vag - specificera typ av slitage och skador', severity: 'high' });
        score -= 20;
      }
      if (data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) {
        warnings.push({ field: 'Kondition', issue: 'Endast "bruksslitage" är otillräckligt - specificera typ av slitage (repor, nagg, fläckar, etc.)', severity: 'high' });
        score -= 25; // Increased penalty for lazy condition reports
      }
      
      // Check for other vague condition terms
      const vaguePhrases = ['normalt slitage', 'vanligt slitage', 'åldersslitage', 'slitage förekommer'];
      const conditionText = data.condition.toLowerCase();
      const hasVaguePhrase = vaguePhrases.some(phrase => 
        conditionText.includes(phrase) && conditionText.replace(/<[^>]*>/g, '').trim().length < 30
      );
      
      if (hasVaguePhrase) {
        warnings.push({ field: 'Kondition', issue: 'Vag konditionsbeskrivning - beskriv specifika skador och var de finns', severity: 'medium' });
        score -= 15;
      }
    } else {
      // "Inga anmärkningar" is checked - condition field gets full points
      warnings.push({ field: 'Kondition', issue: '✓ "Inga anmärkningar" markerat - ingen konditionsrapport behövs', severity: 'low' });
    }

    // Keywords quality checks (HIGH IMPORTANCE for discoverability)
    const keywordsLength = data.keywords.length;
    // Support both comma-separated and Auctionet space-separated formats
    const keywordCount = data.keywords ? 
      (data.keywords.includes(',') ? 
        data.keywords.split(',').filter(k => k.trim().length > 0).length :
        data.keywords.split(/\s+/).filter(k => k.trim().length > 0).length
      ) : 0;
    
    // Debug logging
    console.log('Keywords debug:', {
      keywords: data.keywords,
      keywordsLength: keywordsLength,
      keywordCount: keywordCount,
      splitByComma: data.keywords ? data.keywords.split(',').filter(k => k.trim().length > 0) : []
    });
    
    if (keywordsLength === 0 || !data.keywords || data.keywords.trim() === '') {
      warnings.push({ field: 'Sökord', issue: 'Inga dolda sökord - kritiskt för sökbarhet', severity: 'high' });
      score -= 30; // Heavy penalty for missing keywords
    } else if (keywordCount < 2) {
      warnings.push({ field: 'Sökord', issue: 'För få sökord - lägg till fler relevanta termer', severity: 'high' });
      score -= 20;
    } else if (keywordCount < 4) {
      warnings.push({ field: 'Sökord', issue: 'Bra start - några fler sökord kan förbättra sökbarheten', severity: 'medium' });
      score -= 10;
    } else if (keywordCount >= 4 && keywordCount <= 12) {
      // Sweet spot - no warnings, this is good
      console.log('Keywords in sweet spot:', keywordCount, 'keywords');
    } else if (keywordCount > 12) {
      warnings.push({ field: 'Sökord', issue: 'För många sökord kan skada sökbarheten - fokusera på kvalitet över kvantitet', severity: 'medium' });
      score -= 15;
    }
    
    // Check for keyword quality - simplified approach
    if (data.keywords) {
      const keywords = data.keywords.toLowerCase();
      const titleDesc = (data.title + ' ' + data.description + ' ' + data.condition).toLowerCase();
      
      // Check for keyword diversity (suggestion only, no penalty)
      const keywordArray = data.keywords.includes(',') ? 
        data.keywords.split(',').map(k => k.trim()).filter(k => k.length > 0) :
        data.keywords.split(/\s+/).map(k => k.trim()).filter(k => k.length > 0);
      const uniqueKeywords = keywordArray.filter(keyword => 
        !titleDesc.includes(keyword.toLowerCase().replace(/-/g, ' ')) || keyword.length <= 3
      );
      
      const uniquePercentage = uniqueKeywords.length / keywordArray.length;
      
      if (uniquePercentage < 0.4) {
        warnings.push({ field: 'Sökord', issue: 'Tips: Många sökord upprepar titel/beskrivning - kompletterande termer kan förbättra sökbarheten', severity: 'low' });
        // No score penalty - just a suggestion
      }
    }

    // Update UI
    this.updateQualityIndicator(score, warnings);
  }

  updateQualityIndicator(score, warnings) {
    const scoreElement = document.querySelector('.quality-score');
    const warningsElement = document.querySelector('.quality-warnings');
    
    if (scoreElement) {
      // Add smooth transition effect for score changes
      const currentScore = parseInt(scoreElement.textContent.split('/')[0]) || 0;
      const newScore = score;
      
      if (currentScore !== newScore) {
        scoreElement.style.transform = 'scale(1.1)';
        setTimeout(() => {
          scoreElement.style.transform = 'scale(1)';
        }, 200);
      }
      
      scoreElement.textContent = `${score}/100`;
      scoreElement.className = `quality-score ${score >= 80 ? 'good' : score >= 60 ? 'medium' : 'poor'}`;
    }
    
    if (warningsElement) {
      if (warnings.length > 0) {
        warningsElement.innerHTML = '<ul>' + 
          warnings.map(w => `<li class="warning-${w.severity}"><strong>${w.field}:</strong> ${w.issue}</li>`).join('') +
          '</ul>';
      } else {
        warningsElement.innerHTML = '<p class="no-warnings">✓ Utmärkt katalogisering!</p>';
      }
    }
  }

  setupLiveQualityUpdates() {
    // Debounce function to prevent too frequent updates
    let updateTimeout;
    const debouncedUpdate = (event) => {
      clearTimeout(updateTimeout);
      updateTimeout = setTimeout(() => {
        console.log('⚡ Live quality update triggered by:', event?.target?.id || event?.target?.tagName || 'unknown field');
        this.analyzeQuality();
      }, 800); // Wait 800ms after user stops typing
    };

    // Use the exact same selectors as extractItemData()
    const fieldsToMonitor = [
      '#item_title_sv',
      '#item_description_sv', 
      '#item_condition_sv',
      '#item_hidden_keywords',
      'input[type="checkbox"][value="Inga anmärkningar"]',
      'input[type="checkbox"]#item_no_remarks',
      'input[type="checkbox"][name*="no_remarks"]'
    ];

    let monitoredCount = 0;
    fieldsToMonitor.forEach(selector => {
      const element = document.querySelector(selector);
      if (element) {
        console.log(`Setting up live monitoring for: ${selector}`);
        monitoredCount++;
        
        // Add event listeners for different input types
        if (element.type === 'checkbox') {
          element.addEventListener('change', debouncedUpdate);
          console.log(`✅ Added 'change' listener to checkbox: ${selector}`);
        } else {
          element.addEventListener('input', debouncedUpdate);
          element.addEventListener('paste', debouncedUpdate);
          element.addEventListener('keyup', debouncedUpdate);
          console.log(`✅ Added 'input', 'paste', 'keyup' listeners to: ${selector}`);
        }
        
        // Test immediate trigger
        element.addEventListener('focus', () => {
          console.log(`🎯 Field focused: ${selector}`);
        });
      } else {
        console.warn(`Field not found for live monitoring: ${selector}`);
      }
    });

    // Also monitor for changes in rich text editors (if any)
    const richTextEditors = document.querySelectorAll('[contenteditable="true"]');
    richTextEditors.forEach(editor => {
      console.log('Setting up live monitoring for rich text editor');
      editor.addEventListener('input', debouncedUpdate);
      editor.addEventListener('paste', debouncedUpdate);
      monitoredCount++;
    });

    console.log(`🎯 Live quality monitoring set up for ${monitoredCount} fields`);
    
    // Test if fields exist right now
    console.log('🔍 Field existence check:');

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
  }

  async improveField(fieldType) {
    // Ensure API key is loaded
    if (!this.apiKey) {
      await this.loadApiKey();
    }
    
    // Check if API key is still missing
    if (!this.apiKey) {
      this.showFieldErrorIndicator(fieldType, 'API key not configured. Please set your Anthropic API key in the extension popup.');
      return;
    }
    
    const itemData = this.extractItemData();
    
    // Assess data quality for hallucination prevention
    const qualityAssessment = this.assessDataQuality(itemData, fieldType);
    
    if (qualityAssessment.needsMoreInfo) {
      this.showFieldSpecificInfoDialog(fieldType, qualityAssessment.missingInfo, itemData);
      return;
    }
    
    this.showFieldLoadingIndicator(fieldType);
    
    try {
      const improved = await this.callClaudeAPI(itemData, fieldType);
      console.log('Improved result for', fieldType, ':', improved);
      
      // For single field improvements, extract the specific field value
      const value = improved[fieldType];
      if (value) {
        this.applyImprovement(fieldType, value);
        this.showFieldSuccessIndicator(fieldType);
        
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
      this.showFieldErrorIndicator(fieldType, error.message);
    }
  }

  async improveAllFields() {
    // Ensure API key is loaded
    if (!this.apiKey) {
      await this.loadApiKey();
    }
    
    // Check if API key is still missing
    if (!this.apiKey) {
      this.showFieldErrorIndicator('all', 'API key not configured. Please set your Anthropic API key in the extension popup.');
      return;
    }
    
    const itemData = this.extractItemData();
    
    // Assess data quality for hallucination prevention
    const qualityAssessment = this.assessDataQuality(itemData, 'all');
    
    if (qualityAssessment.needsMoreInfo) {
      this.showFieldSpecificInfoDialog('all', qualityAssessment.missingInfo, itemData);
      return;
    }
    
    this.showFieldLoadingIndicator('all');
    
    try {
      const improvements = await this.callClaudeAPI(itemData, 'all');
      
      // Apply improvements and show individual success indicators with slight delays for cascade effect
      let delay = 0;
      
      if (improvements.title) {
        setTimeout(() => {
          this.applyImprovement('title', improvements.title);
          this.showFieldSuccessIndicator('title');
        }, delay);
        delay += 300;
      }
      
      if (improvements.description) {
        setTimeout(() => {
          this.applyImprovement('description', improvements.description);
          this.showFieldSuccessIndicator('description');
        }, delay);
        delay += 300;
      }
      
      if (improvements.condition) {
        setTimeout(() => {
          this.applyImprovement('condition', improvements.condition);
          this.showFieldSuccessIndicator('condition');
        }, delay);
        delay += 300;
      }
      
      if (improvements.keywords) {
        setTimeout(() => {
          this.applyImprovement('keywords', improvements.keywords);
          this.showFieldSuccessIndicator('keywords');
        }, delay);
        delay += 300;
      }
      
      // Show final success on master button after all fields are done
      setTimeout(() => {
        this.showFieldSuccessIndicator('all');
        setTimeout(() => this.analyzeQuality(), 500);
      }, delay);
      
    } catch (error) {
      this.showFieldErrorIndicator('all', error.message);
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
    switch(fieldType) {
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

  showInformationRequestDialog(currentData) {
    const dialog = document.createElement('div');
    dialog.className = 'ai-info-request-dialog';
    dialog.innerHTML = `
      <div class="dialog-overlay"></div>
      <div class="dialog-content">
        <h3>Mer information behövs för optimal katalogisering</h3>
        <p>För att undvika felaktiga antaganden och skapa en professionell katalogisering behöver AI:n mer specifik information. Vänligen ange följande:</p>
        
        <div class="info-request-form">
          <div class="form-group">
            <label>Material (t.ex. ek, björk, mässing, silver):</label>
            <input type="text" id="ai-material" placeholder="Ange material...">
          </div>
          
          <div class="form-group">
            <label>Tillverkningsteknik (t.ex. handblåst, drejade, gjuten):</label>
            <input type="text" id="ai-technique" placeholder="Ange teknik...">
          </div>
          
          <div class="form-group">
            <label>Märkningar/Stämplar:</label>
            <input type="text" id="ai-markings" placeholder="T.ex. 'Märkt Kosta 1960'">
          </div>
          
          <div class="form-group">
            <label>Specifika skador/slitage:</label>
            <textarea id="ai-damage" placeholder="T.ex. 'Repa 3cm på ovansidan, nagg vid foten'"></textarea>
          </div>
          
          <div class="form-group">
            <label>Övrig information:</label>
            <textarea id="ai-additional" placeholder="Allt annat som kan vara relevant..."></textarea>
          </div>
        </div>
        
        <div class="dialog-buttons">
          <button class="btn btn-primary" id="process-with-info">
            Förbättra med denna information
          </button>
          <button class="btn btn-default" id="process-without-info">
            Fortsätt utan extra information
          </button>
          <button class="btn btn-link" id="cancel-dialog">
            Avbryt
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    // Add event listeners instead of inline onclick
    document.getElementById('process-with-info').addEventListener('click', () => {
      this.processWithAdditionalInfo();
    });
    
    document.getElementById('process-without-info').addEventListener('click', () => {
      this.processWithoutAdditionalInfo();
    });
    
    document.getElementById('cancel-dialog').addEventListener('click', () => {
      dialog.remove();
    });
    
    // Add CSS for the dialog
    if (!document.getElementById('dialog-styles')) {
      const style = document.createElement('style');
      style.id = 'dialog-styles';
      style.textContent = `
        .ai-info-request-dialog {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 10000;
        }
        
        .dialog-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
        }
        
        .dialog-content {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: white;
          padding: 30px;
          border-radius: 12px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          max-width: 500px;
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
        }
        
        .dialog-content h3 {
          margin: 0 0 15px 0;
          color: #333;
          font-size: 20px;
        }
        
        .info-request-form {
          margin: 20px 0;
        }
        
        .form-group {
          margin-bottom: 15px;
        }
        
        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: 500;
          color: #555;
        }
        
        .form-group input,
        .form-group textarea {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          box-sizing: border-box;
        }
        
        .form-group textarea {
          height: 60px;
          resize: vertical;
        }
        
        .dialog-buttons {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 25px;
        }
        
        .btn {
          padding: 10px 20px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
        }
        
        .btn-primary {
          background: #007bff;
          color: white;
        }
        
        .btn-primary:hover {
          background: #0056b3;
        }
        
        .btn-default {
          background: #6c757d;
          color: white;
        }
        
        .btn-default:hover {
          background: #545b62;
        }
        
        .btn-link {
          background: transparent;
          color: #6c757d;
          text-decoration: underline;
        }
        
        .btn-link:hover {
          color: #495057;
        }
        
        .missing-info {
          background: #f8f9fa;
          padding: 15px;
          border-radius: 6px;
          margin: 15px 0;
        }
        
        .missing-info h4 {
          margin: 0 0 10px 0;
          color: #495057;
          font-size: 16px;
        }
        
        .missing-info ul {
          margin: 0;
          padding-left: 20px;
        }
        
        .missing-info li {
          margin-bottom: 5px;
          color: #6c757d;
        }
        
        .field-tips {
          background: #e3f2fd;
          padding: 15px;
          border-radius: 6px;
          margin: 15px 0;
          border-left: 4px solid #2196f3;
        }
        
        .field-tips h4 {
          margin: 0 0 8px 0;
          color: #1976d2;
          font-size: 14px;
        }
        
        .field-tips p {
          margin: 0;
          color: #424242;
          font-size: 13px;
          line-height: 1.4;
        }
      `;
      document.head.appendChild(style);
    }
  }

  async processWithAdditionalInfo() {
    const additionalInfo = {
      material: document.getElementById('ai-material').value,
      technique: document.getElementById('ai-technique').value,
      markings: document.getElementById('ai-markings').value,
      damage: document.getElementById('ai-damage').value,
      additional: document.getElementById('ai-additional').value
    };
    
    document.querySelector('.ai-info-request-dialog').remove();
    
    const itemData = this.extractItemData();
    itemData.additionalInfo = additionalInfo;
    
    this.showFieldLoadingIndicator('all');
    
    try {
      const improvements = await this.callClaudeAPI(itemData, 'all-enhanced');
      this.applyAllImprovements(improvements);
    } catch (error) {
      this.showFieldErrorIndicator('all', error.message);
    }
  }

  async processWithoutAdditionalInfo() {
    document.querySelector('.ai-info-request-dialog').remove();
    const itemData = this.extractItemData();
    this.showFieldLoadingIndicator('all');
    
    try {
      const improvements = await this.callClaudeAPI(itemData, 'all-sparse');
      this.applyAllImprovements(improvements);
    } catch (error) {
      this.showFieldErrorIndicator('all', error.message);
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
            <h4>💡 Tips för bättre skickbeskrivning:</h4>
            <p><strong>Undvik vaga termer som "bruksslitage".</strong> Beskriv istället:</p>
            <ul style="margin: 8px 0; padding-left: 20px;">
              <li><strong>Typ av skada:</strong> repor, nagg, sprickor, fläckar, missfärgningar</li>
              <li><strong>Placering:</strong> "vid foten", "på ovansidan", "längs kanten"</li>
              <li><strong>Omfattning:</strong> "mindre", "flera", "genomgående", "ytliga"</li>
              <li><strong>Exempel:</strong> "Mindre repor på ovansidan. Nagg vid fot. Spricka 2cm i glasyr."</li>
            </ul>
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
    const itemData = this.extractItemData();
    
    if (fieldType === 'all') {
      // For "Förbättra alla" - use existing logic
      this.showFieldLoadingIndicator('all');
      
      try {
        const improvements = await this.callClaudeAPI(itemData, 'all-sparse');
        this.applyAllImprovements(improvements);
      } catch (error) {
        this.showFieldErrorIndicator('all', error.message);
      }
      return;
    }
    
    // For individual fields
    this.showFieldLoadingIndicator(fieldType);
    
    try {
      const improved = await this.callClaudeAPI(itemData, fieldType);
      console.log('Forced improved result for', fieldType, ':', improved);
      
      const value = improved[fieldType];
      if (value) {
        this.applyImprovement(fieldType, value);
        this.showFieldSuccessIndicator(fieldType);
        
        // Re-analyze quality after improvement (with delay to ensure DOM is updated)
        console.log('Re-analyzing quality after force field improvement...');
        setTimeout(() => {
          console.log('Delayed quality analysis for force field...');
          this.analyzeQuality();
        }, 500);
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
      this.applyImprovement('title', improvements.title);
    }
    if (improvements.description) {
      this.applyImprovement('description', improvements.description);
    }
    if (improvements.condition) {
      this.applyImprovement('condition', improvements.condition);
    }
    if (improvements.keywords) {
      this.applyImprovement('keywords', improvements.keywords);
    }
    
    this.showFieldSuccessIndicator('all');
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
            model: 'claude-3-5-sonnet-20241022', // Fixed from invalid model name
            max_tokens: 1500,
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
            model: 'claude-3-5-sonnet-20241022', // Fixed from invalid model name
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
    if (['title', 'description', 'condition', 'keywords'].includes(fieldType)) {
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

  applyImprovement(fieldType, value) {
    const fieldMap = {
      'title': '#item_title_sv',
      'description': '#item_description_sv',
      'condition': '#item_condition_sv',
      'keywords': '#item_hidden_keywords'
    };
    
    const field = document.querySelector(fieldMap[fieldType]);
    if (field && value) {
      // Set programmatic update flag for AI improvements
      this.isProgrammaticUpdate = true;
      
      try {
        field.value = value;
        field.dispatchEvent(new Event('change', { bubbles: true }));
        field.classList.add('ai-updated');
        
        // Auto-resize textarea if needed (especially for description)
        if (field.tagName.toLowerCase() === 'textarea') {
          // Use setTimeout to ensure the value is fully applied before resizing
          setTimeout(() => {
            this.autoResizeTextarea(field);
          }, 50);
        }
        
        console.log(`✅ Applied improvement to ${fieldType}`);
      } finally {
        // Clear flag after a short delay to ensure all events have processed
        setTimeout(() => {
          this.isProgrammaticUpdate = false;
          console.log('🔓 Cleared programmatic update flag after AI improvement');
        }, 100);
      }
    }
  }

  // NEW: Auto-resize textarea functionality (from Add Items page)
  autoResizeTextarea(textarea) {
    if (!textarea || textarea.tagName.toLowerCase() !== 'textarea') return;
    
    // Reset height to auto to get the scroll height
    textarea.style.height = 'auto';
    
    // Calculate the height needed
    const scrollHeight = textarea.scrollHeight;
    const minHeight = 60; // Minimum height
    const maxHeight = 400; // Maximum height
    
    // Set the new height within bounds
    const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
    textarea.style.height = newHeight + 'px';
    
    // Add resizing class for smooth animation
    textarea.classList.add('resizing');
    setTimeout(() => {
      textarea.classList.remove('resizing');
    }, 300);
  }

  validateAndLimitKeywords(keywords) {
    if (!keywords || typeof keywords !== 'string') {
      return keywords;
    }
    
    // Support both formats: detect if comma-separated or space-separated
    let keywordArray;
    if (keywords.includes(',')) {
      // Comma-separated format - convert to Auctionet format
      keywordArray = keywords.split(',')
        .map(kw => kw.trim())
        .filter(kw => kw.length > 0)
        .filter(kw => kw.length >= 3)
        .map(kw => kw.replace(/\s+/g, '-')); // Convert spaces to hyphens
    } else {
      // Already in Auctionet space-separated format
      keywordArray = keywords.split(/\s+/)
        .map(kw => kw.trim())
        .filter(kw => kw.length > 0)
        .filter(kw => kw.length >= 3);
    }
    
    // If too many keywords, keep only the first 12 (most relevant ones)
    if (keywordArray.length > 12) {
      console.warn(`Too many keywords (${keywordArray.length}), limiting to 12`);
      const limitedKeywords = keywordArray.slice(0, 12);
      return limitedKeywords.join(' '); // Auctionet space-separated format
    }
    
    return keywordArray.join(' '); // Auctionet space-separated format
  }

  addAIEnhancementNote(fieldType) {
    const internalCommentsField = document.querySelector('#item_internal_comment');
    if (internalCommentsField) {
      const currentComments = internalCommentsField.value;
      const timestamp = new Date().toLocaleDateString('sv-SE');
      const fieldNames = {
        'title': 'titel',
        'description': 'beskrivning', 
        'condition': 'kondition',
        'keywords': 'sökord'
      };
      
      const enhancementNote = `AI-förbättring ${fieldNames[fieldType]} (${timestamp})`;
      
      // Check if this enhancement is already noted
      if (!currentComments.includes(enhancementNote)) {
        const newComments = currentComments ? 
          `${currentComments}\n${enhancementNote}` : 
          enhancementNote;
        internalCommentsField.value = newComments;
      }
    }
  }

  addUndoButton(field) {
    const existingUndo = field.parentElement.querySelector('.ai-undo-button');
    if (existingUndo) {
      existingUndo.remove();
    }
    
    const undoButton = document.createElement('button');
    undoButton.className = 'ai-undo-button';
    undoButton.textContent = '↩ Ångra';
    undoButton.type = 'button';
    
    undoButton.addEventListener('click', () => {
      field.value = field.dataset.originalValue;
      field.classList.remove('ai-updated');
      undoButton.remove();
    });
    
    field.parentElement.appendChild(undoButton);
  }





  getEncouragingMessage(fieldType) {
    const messages = {
      all: [
        "🧠 AI analyserar alla fält för optimal kvalitet...",
        "✨ Skapar professionell katalogisering för alla fält...",
        "🎯 Optimerar hela katalogiseringen för bästa resultat...",
        "🚀 Förbättrar alla fält med AI-precision..."
      ],
      title: [
        "🎯 Skapar perfekt titel med AI-precision...",
        "📝 Optimerar titel för sökbarhet...",
        "✨ Genererar professionell titel...",
        "🏷️ Förbättrar titel enligt auktionsstandard..."
      ],
      description: [
        "📖 Skapar detaljerad beskrivning...",
        "🔍 Analyserar alla detaljer för beskrivning...",
        "✨ Optimerar beskrivning för kvalitet...",
        "📋 Genererar professionell beskrivning..."
      ],
      condition: [
        "🔧 Analyserar kondition professionellt...",
        "📊 Skapar detaljerad konditionsrapport...",
        "✅ Optimerar konditionsbeskrivning...",
        "🔍 Genererar noggrann konditionsanalys..."
      ],
      keywords: [
        "🔍 Genererar optimala sökord...",
        "🏷️ Skapar träffsäkra keywords...",
        "📈 Optimerar sökbarhet...",
        "🎯 Förbättrar söktrafik med smarta ord..."
      ]
    };
    
    const messageArray = messages[fieldType] || messages.all;
    return messageArray[Math.floor(Math.random() * messageArray.length)];
  }

  showLoadingIndicator(fieldType) {
    console.log(`🔄 Loading indicator for ${fieldType}`);
    
    // Remove any existing loading states
    this.removeFieldLoadingIndicator(fieldType);
    
    let targetField;
    if (fieldType === 'all') {
      // For "all" - show loading on master button AND all individual fields
      const masterButton = document.querySelector('.ai-master-button');
      if (masterButton) {
        masterButton.textContent = '🧠 AI arbetar...';
        masterButton.disabled = true;
        masterButton.style.opacity = '0.7';
      }
      
      // Show loading animation on all fields simultaneously
      const allFieldTypes = ['title', 'description', 'condition', 'keywords'];
      allFieldTypes.forEach(type => {
        this.showFieldLoadingIndicator(type);
      });
      return;
    } else {
      // Get the specific field
      const fieldMap = {
        'title': '#item_title_sv',
        'description': '#item_description_sv', 
        'condition': '#item_condition_sv',
        'keywords': '#item_hidden_keywords'
      };
      
      targetField = document.querySelector(fieldMap[fieldType]);
      console.log(`🎯 Target field for ${fieldType}:`, targetField);
      console.log(`📋 Field element details:`, {
        id: targetField?.id,
        tagName: targetField?.tagName,
        className: targetField?.className,
        parentElement: targetField?.parentElement?.className
      });
    }
    
    if (!targetField) {
      console.error(`❌ Target field not found for ${fieldType}`);
      return;
    }
    
    // Add CSS for field spinner overlays if not already added
    if (!document.getElementById('field-spinner-overlay-styles')) {
      const style = document.createElement('style');
      style.id = 'field-spinner-overlay-styles';
      style.textContent = `
        /* AI Field Enhancement Loading States - EXACT COPY FROM ADD ITEMS PAGE */
        .field-loading {
          position: relative;
        }
        
        .field-loading input,
        .field-loading textarea {
          filter: blur(2px);
          transition: filter 0.3s ease;
          pointer-events: none;
        }
        
        .field-spinner-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(1px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          border-radius: 6px;
          animation: overlayFadeIn 0.3s ease;
        }
        
        .ai-spinner {
          width: 24px;
          height: 24px;
          border: 2px solid #e5e7eb;
          border-top: 2px solid #007bff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .ai-processing-text {
          margin-left: 12px;
          font-size: 13px;
          color: #374151;
          font-weight: 500;
          letter-spacing: 0.025em;
        }
        
        @keyframes overlayFadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        
        /* Success flash animation - EXACT COPY FROM ADD ITEMS PAGE */
        .field-success {
          animation: successFlash 0.6s ease;
        }
        
        @keyframes successFlash {
          0% { 
            background-color: rgba(34, 197, 94, 0.1);
            border-color: #22c55e;
          }
          50% { 
            background-color: rgba(34, 197, 94, 0.2);
            border-color: #16a34a;
          }
          100% { 
            background-color: transparent;
            border-color: initial;
          }
        }
        
        /* Auto-resize textarea styling with smooth transitions */
        textarea.auto-resize {
          resize: vertical;
          min-height: 60px;
          max-height: 400px;
          transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          overflow-y: auto;
        }
        
        textarea.auto-resize:not(:focus) {
          overflow-y: hidden;
        }
        
        .auto-resize.resizing {
          transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
      `;
      document.head.appendChild(style);
      console.log('✅ Field spinner overlay styles added');
    }
    
    // Find the field container (parent element that will hold the overlay)
    let fieldContainer = targetField.parentElement;
    console.log(`🏠 Initial field container:`, {
      element: fieldContainer,
      className: fieldContainer?.className,
      tagName: fieldContainer?.tagName
    });
    
    // For textareas and inputs, we might need to go up one more level if it's in a wrapper
    if (fieldContainer.classList.contains('ai-button-wrapper') || fieldContainer.tagName === 'LABEL') {
      fieldContainer = fieldContainer.parentElement;
      console.log(`🏠 Adjusted field container:`, {
        element: fieldContainer,
        className: fieldContainer?.className,
        tagName: fieldContainer?.tagName
      });
    }
    
    // Check if container has position: relative or set it
    const containerStyle = window.getComputedStyle(fieldContainer);
    if (containerStyle.position === 'static') {
      fieldContainer.style.position = 'relative';
      console.log('🔧 Set field container position to relative');
    }
    
    // Add loading class to container
    fieldContainer.classList.add('field-loading');
    console.log(`✅ Added field-loading class to container`);
    
    // Create spinner overlay
    const overlay = document.createElement('div');
    overlay.className = 'field-spinner-overlay';
    overlay.dataset.fieldType = fieldType;
    overlay.innerHTML = `
      <div class="ai-spinner"></div>
      <div class="ai-processing-text">AI förbättrar...</div>
    `;
    
    // Position overlay over the field
    const fieldRect = targetField.getBoundingClientRect();
    const containerRect = fieldContainer.getBoundingClientRect();
    
    console.log(`📐 Field positioning:`, {
      fieldRect: {
        top: fieldRect.top,
        left: fieldRect.left,
        width: fieldRect.width,
        height: fieldRect.height
      },
      containerRect: {
        top: containerRect.top,
        left: containerRect.left,
        width: containerRect.width,
        height: containerRect.height
      }
    });
    
    // Calculate relative position
    const relativeTop = fieldRect.top - containerRect.top;
    const relativeLeft = fieldRect.left - containerRect.left;
    
    overlay.style.position = 'absolute';
    overlay.style.top = `${relativeTop}px`;
    overlay.style.left = `${relativeLeft}px`;
    overlay.style.width = `${fieldRect.width}px`;
    overlay.style.height = `${fieldRect.height}px`;
    
    console.log(`📐 Overlay positioning:`, {
      position: 'absolute',
      top: `${relativeTop}px`,
      left: `${relativeLeft}px`,
      width: `${fieldRect.width}px`,
      height: `${fieldRect.height}px`
    });
    
    // Add overlay to container
    fieldContainer.appendChild(overlay);
    
    console.log(`✅ Loading animation overlay added to ${fieldType} field`);
    console.log(`🔍 Overlay element:`, overlay);
    console.log(`🏠 Container with overlay:`, fieldContainer);
  }

  showFieldSuccessIndicator(fieldType) {
    console.log(`✅ Success indicator for ${fieldType}`);
    
    // Remove loading state
    this.removeFieldLoadingIndicator(fieldType);
    
    if (fieldType === 'all') {
      // Reset master button
      const masterButton = document.querySelector('.ai-master-button');
      if (masterButton) {
        masterButton.textContent = '✅ Klart!';
        setTimeout(() => {
          masterButton.textContent = '⚡ Förbättra alla';
          masterButton.disabled = false;
          masterButton.style.opacity = '1';
        }, 2000);
      }
      return;
    }
    
    // Get the specific field and apply success flash
    const fieldMap = {
      'title': '#item_title_sv',
      'description': '#item_description_sv',
      'condition': '#item_condition_sv', 
      'keywords': '#item_hidden_keywords'
    };
    
    const targetField = document.querySelector(fieldMap[fieldType]);
    if (targetField) {
      targetField.classList.add('field-success');
      
      // Remove success class after animation
      setTimeout(() => {
        targetField.classList.remove('field-success');
      }, 600);
    }
  }

  showFieldErrorIndicator(fieldType, message) {
    console.error(`❌ Error for ${fieldType}: ${message}`);
    
    // Remove loading state
    this.removeFieldLoadingIndicator(fieldType);
    
    if (fieldType === 'all') {
      // Reset master button
      const masterButton = document.querySelector('.ai-master-button');
      if (masterButton) {
        masterButton.textContent = '❌ Fel uppstod';
        masterButton.disabled = false;
        masterButton.style.opacity = '1';
        setTimeout(() => {
          masterButton.textContent = '⚡ Förbättra alla';
        }, 3000);
      }
    }
    
    // Show error message
    alert(`Fel vid AI-förbättring av ${fieldType}: ${message}`);
  }
  
  removeFieldLoadingIndicator(fieldType) {
    if (fieldType === 'all') {
      // Remove loading from all individual fields
      const allFieldTypes = ['title', 'description', 'condition', 'keywords'];
      allFieldTypes.forEach(type => {
        this.removeFieldLoadingIndicator(type);
      });
      return;
    }
    
    // Remove loading states for specific field type
    const overlay = document.querySelector(`.field-spinner-overlay[data-field-type="${fieldType}"]`);
    if (overlay) {
      const container = overlay.parentElement;
      container.classList.remove('field-loading');
      overlay.remove();
    }
    
    // Also remove any general loading classes
    document.querySelectorAll('.field-loading').forEach(container => {
      const overlays = container.querySelectorAll('.field-spinner-overlay');
      if (overlays.length === 0) {
        container.classList.remove('field-loading');
      }
    });
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