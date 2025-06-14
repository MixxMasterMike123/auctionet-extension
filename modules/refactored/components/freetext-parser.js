/**
 * Freetext Parser Component
 * Converts unstructured auction item descriptions into structured catalog data
 * 
 * Features:
 * - AI-powered parsing using AI Rules System v2.0
 * - Integration with 3.5M auction history for validation
 * - Modal UI for user interaction
 * - Confidence scoring for parsed fields
 * - Market analysis integration
 * 
 * Architecture: Modular component following .cursorrules
 * Dependencies: AI Rules System v2.0, existing popup patterns
 */

// Import AI Rules System v2.0 functions (global access)
const { 
  getSystemPrompt, 
  getCategoryPrompt, 
  buildPrompt,
  getCategoryRules,
  getFieldRules,
  getForbiddenWords,
  isForbiddenWord
} = window;

export class FreetextParser {
  constructor(apiManager, addItemsManager) {
    // Handle both direct APIManager and APIBridge patterns
    if (apiManager && typeof apiManager.getAPIManager === 'function') {
      // This is an APIBridge, get the actual APIManager
      this.apiManager = apiManager.getAPIManager();
      console.log('✅ FreetextParser: Using APIManager from APIBridge');
    } else {
      // This is a direct APIManager
      this.apiManager = apiManager;
      console.log('✅ FreetextParser: Using direct APIManager');
    }
    
    this.addItemsManager = addItemsManager;
    this.currentModal = null;
    this.parsedData = null;
    this.isProcessing = false;
    
    // Configuration
    this.config = {
      enableHistoricalValidation: false, // Future feature
      enableMarketDataEnrichment: true,
      confidenceThreshold: 0.6
    };
    
    console.log('✅ FreetextParser: Initialized with config:', this.config);
  }

  /**
   * Initialize the component and add UI elements
   */
  async init() {
    try {
      // Verify API manager and key are available
      console.log('🔍 FreetextParser init - API Manager check:', {
        hasApiManager: !!this.apiManager,
        hasApiKey: !!this.apiManager?.apiKey,
        apiKeyLength: this.apiManager?.apiKey?.length,
        apiKeyType: typeof this.apiManager?.apiKey
      });
      
      // Add a small delay to ensure page controllers are fully loaded
      await new Promise(resolve => setTimeout(resolve, 100));
      
      this.injectStyles();
      // Note: Button is now added by AddItemsIntegrationManager
      console.log('✅ FreetextParser UI elements added to AddItem page');
      return true;
    } catch (error) {
      console.error('❌ FreetextParser initialization failed:', error);
      throw error;
    }
  }

  /**
   * Add the main freetext parser button to the AddItem page
   */
  addFreetextButton() {
    console.log('🔍 FreetextParser: addFreetextButton called, document.readyState:', document.readyState);
    
    // Wait for DOM to be ready and avoid conflicts with existing controllers
    if (document.readyState === 'loading') {
      console.log('⏳ DOM still loading, waiting for DOMContentLoaded...');
      document.addEventListener('DOMContentLoaded', () => this.addFreetextButton());
      return;
    }

    // Check if button already exists to avoid duplicates
    const existingButton = document.querySelector('#freetext-parser-btn');
    if (existingButton) {
      console.log('⚠️ Freetext parser button already exists:', {
        element: existingButton,
        visible: existingButton.offsetParent !== null,
        parent: existingButton.parentNode,
        className: existingButton.className
      });
      return;
    }

    // Find the form container (following existing patterns)
    const formContainer = document.querySelector('.item_form, #new_item, .add-item-form, form, .form-container') || 
                         document.querySelector('main') || 
                         document.body;
    
    console.log('🔍 Form container search results:', {
      '.item_form': !!document.querySelector('.item_form'),
      '#new_item': !!document.querySelector('#new_item'),
      '.add-item-form': !!document.querySelector('.add-item-form'),
      'form': !!document.querySelector('form'),
      '.form-container': !!document.querySelector('.form-container'),
      'main': !!document.querySelector('main'),
      'body': !!document.body,
      'selected': formContainer?.tagName,
      'selectedClass': formContainer?.className,
      'selectedId': formContainer?.id
    });
    
    if (!formContainer) {
      console.error('❌ Could not find form container for freetext button');
      return;
    }

    // Create the button following existing UI patterns
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'freetext-parser-container';
    buttonContainer.innerHTML = `
      <button type="button" class="btn btn--primary btn--freetext-parser" id="freetext-parser-btn">
        <span class="btn__icon">🤖</span>
        <span class="btn__text">AI Snabbkatalogisering från fritext</span>
        <span class="btn__subtitle">Skriv allt du vet - AI skapar perfekt katalogpost</span>
      </button>
    `;

    // Insert before the form for maximum visibility, avoiding disrupting form structure
    if (formContainer.id === 'new_item' || formContainer.className.includes('item_form')) {
      // For the AddItem form, insert before the form
      formContainer.parentNode.insertBefore(buttonContainer, formContainer);
      console.log('📍 Button placed before AddItem form');
    } else {
      // For other containers, insert at the top
      const firstChild = formContainer.firstChild;
      if (firstChild) {
        formContainer.insertBefore(buttonContainer, firstChild);
      } else {
        formContainer.appendChild(buttonContainer);
      }
      console.log('📍 Button placed inside container');
    }

    // Attach event listener with error handling
    const button = buttonContainer.querySelector('#freetext-parser-btn');
    if (button) {
      button.addEventListener('click', () => this.openFreetextModal());
      console.log('✅ Freetext parser button added to AddItem page');
    } else {
      console.error('❌ Failed to find freetext parser button after creation');
    }
  }

  /**
   * Open the freetext input modal
   */
  openFreetextModal() {
    console.log('🔴 FREETEXT MODAL OPENING in FreetextParser...');
    
    if (this.currentModal) {
      console.log('⚠️ Modal already open');
      return;
    }

    try {
      console.log('🔴 Creating freetext modal...');
      this.currentModal = this.createFreetextModal();
      console.log('🔴 Modal created, appending to body...');
      
      // Ensure document.body exists before appending
      if (document.body) {
        document.body.appendChild(this.currentModal);
        console.log('🔴 Modal appended to body successfully');
        
        // Focus on textarea with error handling
        setTimeout(() => {
          if (this.currentModal) {
            const textarea = this.currentModal.querySelector('#freetext-input');
            if (textarea) {
              textarea.focus();
              console.log('🔴 Textarea focused');
            }
          }
        }, 100);

        console.log('✅ Freetext modal opened successfully');
      } else {
        console.error('❌ document.body not available for modal');
      }
    } catch (error) {
      console.error('❌ Failed to open freetext modal:', error);
      console.error('❌ Error stack:', error.stack);
      this.currentModal = null;
    }
  }

  /**
   * Create the freetext modal following existing popup patterns
   */
  createFreetextModal() {
    const modal = document.createElement('div');
    modal.className = 'freetext-parser-overlay';
    modal.innerHTML = `
      <div class="freetext-parser-modal">
        <div class="popup-header">
          <h3>🤖 AI Snabbkatalogisering från fritext</h3>
          <p>Skriv all information du har om objektet - AI analyserar och skapar perfekt katalogpost</p>
          <button class="popup-close" type="button">✕</button>
        </div>
        
        <div class="popup-content">
          <div class="freetext-input-section">
            <label for="freetext-input" class="freetext-label">
              <strong>Fritext (skriv allt du vet om objektet):</strong>
              <span class="freetext-hint">Inkludera märke, konstnär, material, mått, skick, värdering, etc.</span>
            </label>
            <textarea 
              id="freetext-input" 
              class="freetext-textarea"
              placeholder="Exempel: Kruka höganäs troligen 1960tal brun stengods 28cm höjd 22cm omkrets två nagg i överkant lisa larson 500 kronor bevakning 300:- märkt CBGBs under"
              rows="6"
            ></textarea>
            <div class="freetext-examples">
              <strong>Exempel på bra fritext:</strong>
              <div class="example-item">
                "Vas rörstrand gunnar nylund 1950-tal blå glasyr 25cm hög märkt R tre små nagg i kanten uppskattat värde 800kr"
              </div>
            </div>
          </div>
          
          <div class="ai-processing-section" style="display: none;">
            <div class="processing-spinner"></div>
            <div class="processing-status">
              <h4>🤖 AI analyserar din fritext...</h4>
              <p class="processing-step">Extraherar strukturerad data från fritext</p>
              <div class="processing-progress">
                <div class="progress-bar">
                  <div class="progress-fill"></div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="parsed-preview-section" style="display: none;">
            <h4>✨ AI-genererad katalogpost</h4>
            <div class="preview-content">
              <!-- Parsed data will be inserted here -->
            </div>
          </div>
        </div>
        
        <div class="modal-footer">
          <button class="btn btn--secondary" id="cancel-btn">
            Avbryt
          </button>
          <button class="btn btn--primary" id="analyze-btn">
            🤖 Analysera med AI
          </button>
          <button class="btn btn--success" id="apply-btn" style="display: none;">
            ✅ Använd denna katalogpost
          </button>
        </div>
      </div>
    `;

    this.attachModalEventListeners(modal);
    return modal;
  }

  /**
   * Attach event listeners to modal elements
   */
  attachModalEventListeners(modal) {
    // Close button
    const closeBtn = modal.querySelector('.popup-close');
    const cancelBtn = modal.querySelector('#cancel-btn');
    [closeBtn, cancelBtn].forEach(btn => {
      if (btn) {
        btn.addEventListener('click', () => this.closeModal());
      }
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.closeModal();
      }
    });

    // Escape key to close
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
      }
    };
    document.addEventListener('keydown', handleEscape);
    
    // Store reference for cleanup
    modal._escapeHandler = handleEscape;

    // Analyze button
    const analyzeBtn = modal.querySelector('#analyze-btn');
    if (analyzeBtn) {
              analyzeBtn.addEventListener('click', () => {
          console.log('🔴 ANALYZE BUTTON CLICKED - processFreetextWithAI starting...');
          this.processFreetextWithAI();
        });
    }

    // Apply button
    const applyBtn = modal.querySelector('#apply-btn');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => this.applyParsedDataToForm());
    }
  }

  /**
   * Process freetext using AI Rules System v2.0
   */
  async processFreetextWithAI() {
    console.log('🔄 processFreetextWithAI called');
    
    if (this.isProcessing) {
      console.log('⚠️ Already processing freetext');
      return;
    }

    const textarea = this.currentModal.querySelector('#freetext-input');
    const freetext = textarea.value.trim();

    console.log('📝 Freetext validation:', {
      hasTextarea: !!textarea,
      freetextLength: freetext?.length || 0,
      freetext: freetext?.substring(0, 100) + '...'
    });

    if (!freetext) {
      console.warn('⚠️ No freetext provided');
      this.showError('Vänligen skriv in information om objektet först.');
      return;
    }

    if (freetext.length < 10) {
      console.warn('⚠️ Freetext too short:', freetext.length);
      this.showError('Fritext är för kort. Skriv mer information om objektet.');
      return;
    }

    // Validate that this looks like auction item text, not console logs or debug info
    if (freetext.includes('✅') || freetext.includes('🔴') || freetext.includes('console.log') || 
        freetext.includes('FreetextParser') || freetext.includes('.js:') || 
        freetext.includes('freetext-parser.js') || freetext.includes('add-items-integration-manager.js')) {
      console.warn('⚠️ Freetext contains debug information');
      this.showError('Fritexten verkar innehålla debug-information. Vänligen ange riktig auktionstext för att analysera.');
      return;
    }

    try {
      console.log('🚀 Starting AI processing...');
      this.isProcessing = true;
      this.showProcessingState();

      console.log('🤖 Starting AI analysis of freetext:', freetext.substring(0, 100) + '...');

      // Step 1: Parse freetext using AI Rules System v2.0
      console.log('📋 Step 1: Calling parseFreetextWithAI...');
      const parsedData = await this.parseFreetextWithAI(freetext);
      console.log('✅ Step 1 completed:', parsedData);
      
      // Step 2: Validate against historical auction data (if enabled)
      console.log('📋 Step 2: Historical validation...');
      const validatedData = this.config.enableHistoricalValidation 
        ? await this.validateAgainstAuctionHistory(parsedData)
        : parsedData;
      console.log('✅ Step 2 completed');

      // Step 3: Generate search terms and market analysis
      console.log('📋 Step 3: Market data enrichment...');
      const enrichedData = await this.enrichWithMarketData(validatedData);
      console.log('✅ Step 3 completed');

      // Step 4: Calculate confidence scores
      console.log('📋 Step 4: Confidence scoring...');
      const finalData = this.calculateConfidenceScores(enrichedData);
      console.log('✅ Step 4 completed');

      console.log('📋 Final step: Showing preview...');
      this.parsedData = finalData;
      this.showParsedPreview(finalData);
      console.log('✅ All processing completed successfully');

    } catch (error) {
      console.error('❌ AI analysis failed:', error);
      console.error('❌ Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      this.showError(`AI-analys misslyckades: ${error.message}`);
    } finally {
      console.log('🏁 Processing finished, cleaning up...');
      this.isProcessing = false;
    }
  }

  /**
   * Parse freetext using AI Rules System v2.0
   */
  async parseFreetextWithAI(freetext) {
    console.log('🔄 Parsing freetext with AI Rules System v2.0...');

    if (!this.apiManager.apiKey) {
      console.error('❌ No API key found in apiManager:', {
        hasApiManager: !!this.apiManager,
        apiKeyExists: !!this.apiManager?.apiKey,
        apiKeyType: typeof this.apiManager?.apiKey
      });
      throw new Error('API key not configured. Please set your Anthropic API key in the extension popup.');
    }
    
    console.log('✅ API key validation passed:', {
      hasApiKey: true,
      keyLength: this.apiManager.apiKey.length,
      keyPrefix: this.apiManager.apiKey.substring(0, 10) + '...'
    });

    // Use AI Rules System v2.0 for consistent prompting
    const systemPrompt = getSystemPrompt('freetextParser');
    const categoryPrompt = getCategoryPrompt('freetextParser');
    const fieldTemplate = buildPrompt({
      field: 'freetextParser',
      category: 'freetextParser'
    });
    
    // Get existing title rules to ensure consistency
    const titleRules = getFieldRules('title');
    const contextRules = window.getAIRulesManager().rules.contextRules;

    const userPrompt = `${fieldTemplate}

🎯 KRITISKA TITEL-FORMATERINGSREGLER (ANVÄND BEFINTLIGA REGLER):
• Om konstnär identifieras: PLACERA i artist-fält, EXKLUDERA från titel
• TITEL UTAN KONSTNÄR: [KONSTNÄR], [Föremål], [Material], [Period] - FÖRSTA ORDET VERSALER, KOMMA EFTER
• TITEL MED KONSTNÄR I FÄLT: [Föremål], [Material], [Period] - Första ordet stor bokstav, punkt efter
• Max ${titleRules.maxLength} tecken, följ exakt samma regler som andra komponenter

FRITEXT ATT ANALYSERA:
"${freetext}"

Returnera data i exakt detta JSON-format:
{
  "title": "Formaterad enligt befintliga titel-regler (max ${titleRules.maxLength} tecken)",
  "description": "Detaljerad beskrivning med mått, material, teknik, period",
  "condition": "Konditionsbeskrivning på svenska",
  "artist": "Konstnär/formgivare om identifierad, annars null",
  "keywords": "relevanta sökord separerade med mellanslag",
  "estimate": null,
  "reserve": null,
  "materials": "material/teknik",
  "period": "tidsperiod/datering",
  "shouldDisposeIfUnsold": false,
  "confidence": {
    "title": 0.9,
    "description": 0.8,
    "condition": 0.7,
    "artist": 0.6,
    "estimate": 0.3
  },
  "reasoning": "Kort förklaring av analysen på svenska"
}

INSTRUKTIONER:
- estimate/reserve lämnas som null - värdering kommer från marknadsanalys
- confidence-värden mellan 0.0-1.0
- shouldDisposeIfUnsold: true endast om fritexten nämner skänkning/återvinning
- Lämna fält som null om information saknas
- Fokusera på katalogisering, inte värdering

${categoryPrompt}`;

    try {
      console.log('🚀 Making AI API call with:', {
        hasApiKey: !!this.apiManager.apiKey,
        apiKeyLength: this.apiManager.apiKey?.length,
        freetextLength: freetext.length
      });

      // Call AI API directly using Chrome runtime messaging (same pattern as other components)
      const response = await new Promise((resolve, reject) => {
        console.log('📤 Sending Chrome runtime message for AI parsing...');
        
        // Add timeout to catch hanging requests
        const timeout = setTimeout(() => {
          console.error('⏰ Chrome runtime message timeout after 30 seconds');
          reject(new Error('API request timeout - no response from background script'));
        }, 30000);
        
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiManager.apiKey,
          body: {
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 2000,
            temperature: 0.1, // Low temperature for consistent parsing
            system: systemPrompt,
            messages: [{
              role: 'user',
              content: userPrompt
            }]
          }
        }, (response) => {
          clearTimeout(timeout);
          console.log('📥 Chrome runtime response received:', response);
          
          if (chrome.runtime.lastError) {
            console.error('❌ Chrome runtime error:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.success) {
            console.log('✅ AI API call successful');
            resolve(response);
          } else {
            console.error('❌ AI API call failed:', response);
            reject(new Error(response?.error || 'AI analysis failed'));
          }
        });
        
        console.log('⏳ Chrome runtime message sent, waiting for response...');
      });

      console.log('🔍 Processing AI response:', {
        success: response.success,
        hasData: !!response.data,
        hasContent: !!response.data?.content,
        contentLength: response.data?.content?.length
      });

      if (response.success && response.data?.content?.[0]?.text) {
        console.log('✅ AI response text received, length:', response.data.content[0].text.length);
        return this.parseAIResponse(response.data.content[0].text);
      } else {
        console.error('❌ Invalid AI response structure:', response);
        throw new Error('Invalid response format from AI');
      }

    } catch (error) {
      console.error('❌ AI parsing failed:', error);
      console.error('❌ Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * Parse AI response into structured data
   */
  parseAIResponse(response) {
    try {
      console.log('🔍 Raw AI response:', response);

      // Clean the response and extract JSON
      let cleanResponse = response.trim();
      
      // Remove markdown code blocks if present
      cleanResponse = cleanResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      // Try to parse JSON response first
      if (cleanResponse.includes('{') && cleanResponse.includes('}')) {
        const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsedData = JSON.parse(jsonMatch[0]);
          
          // Validate and normalize the parsed data
          return this.validateAndNormalizeParsedData(parsedData);
        }
      }

      // Fallback: Parse structured text response
      return this.parseStructuredTextResponse(cleanResponse);
    } catch (error) {
      console.error('❌ Failed to parse AI response:', error, 'Response:', response);
      throw new Error('AI response kunde inte tolkas. Försök igen med tydligare fritext.');
    }
  }

  /**
   * Validate and normalize parsed data
   */
  validateAndNormalizeParsedData(data) {
    const normalized = {
      title: data.title || '',
      description: data.description || '',
      condition: data.condition || '',
      artist: data.artist || null,
      keywords: data.keywords || '',
      materials: data.materials || '',
      period: data.period || '',
      estimate: this.parseNumericValue(data.estimate),
      reserve: this.parseNumericValue(data.reserve),
      shouldDisposeIfUnsold: Boolean(data.shouldDisposeIfUnsold),
      confidence: {
        title: this.normalizeConfidence(data.confidence?.title),
        description: this.normalizeConfidence(data.confidence?.description),
        condition: this.normalizeConfidence(data.confidence?.condition),
        artist: this.normalizeConfidence(data.confidence?.artist),
        estimate: this.normalizeConfidence(data.confidence?.estimate)
      },
      reasoning: data.reasoning || ''
    };

    console.log('✅ Normalized parsed data:', normalized);
    return normalized;
  }

  /**
   * Parse numeric values safely
   */
  parseNumericValue(value) {
    if (typeof value === 'number') return Math.max(0, Math.round(value));
    if (typeof value === 'string') {
      const num = parseInt(value.replace(/[^\d]/g, ''));
      return isNaN(num) ? null : Math.max(0, num);
    }
    return null;
  }

  /**
   * Normalize confidence values to 0.0-1.0 range
   */
  normalizeConfidence(value) {
    if (typeof value === 'number') {
      return Math.max(0, Math.min(1, value));
    }
    return 0.5; // Default confidence
  }

  /**
   * Parse structured text response as fallback
   */
  parseStructuredTextResponse(response) {
    const data = {};
    const lines = response.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes(':')) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim();
        
        const normalizedKey = key.toLowerCase()
          .replace(/titel|title/i, 'title')
          .replace(/beskrivning|description/i, 'description')
          .replace(/skick|condition/i, 'condition')
          .replace(/konstnär|artist/i, 'artist')
          .replace(/material/i, 'materials')
          .replace(/period|årtal/i, 'period')
          .replace(/värde|value/i, 'estimatedValue');

        if (value && value !== '-' && value !== 'N/A') {
          data[normalizedKey] = value;
        }
      }
    }

    return data;
  }

  /**
   * Show processing state in modal
   */
  showProcessingState() {
    const modal = this.currentModal;
    if (!modal) return;

    // Hide input section
    const inputSection = modal.querySelector('.freetext-input-section');
    if (inputSection) inputSection.style.display = 'none';

    // Show processing section
    const processingSection = modal.querySelector('.ai-processing-section');
    if (processingSection) {
      processingSection.style.display = 'block';
      this.animateProcessingProgress();
    }

    // Update buttons
    const analyzeBtn = modal.querySelector('#analyze-btn');
    if (analyzeBtn) {
      analyzeBtn.disabled = true;
      analyzeBtn.textContent = 'Analyserar...';
    }
  }

  /**
   * Animate processing progress bar
   */
  animateProcessingProgress() {
    const progressFill = this.currentModal.querySelector('.progress-fill');
    if (!progressFill) return;

    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress > 90) progress = 90; // Don't complete until actually done
      
      progressFill.style.width = `${progress}%`;
      
      if (!this.isProcessing) {
        progress = 100;
        progressFill.style.width = '100%';
        clearInterval(interval);
      }
    }, 500);
  }

  /**
   * Show parsed data preview
   */
  showParsedPreview(data) {
    const modal = this.currentModal;
    if (!modal) return;

    // Store parsed data for later use
    this.parsedData = data;

    // Hide processing section
    const processingSection = modal.querySelector('.ai-processing-section');
    if (processingSection) processingSection.style.display = 'none';

    // Show preview section
    const previewSection = modal.querySelector('.parsed-preview-section');
    const previewContent = modal.querySelector('.preview-content');
    
    if (previewSection && previewContent) {
      previewContent.innerHTML = this.generatePreviewHTML(data);
      previewSection.style.display = 'block';
    }

    // Update buttons
    const analyzeBtn = modal.querySelector('#analyze-btn');
    const applyBtn = modal.querySelector('#apply-btn');
    
    if (analyzeBtn) {
      analyzeBtn.style.display = 'none';
    }
    
    if (applyBtn) {
      applyBtn.style.display = 'inline-block';
    }

    console.log('✅ Parsed preview displayed with data:', data);
  }

  /**
   * Generate HTML for parsed data preview
   */
  generatePreviewHTML(data) {
    return `
      <div class="parsed-fields">
        ${this.generateFieldPreview('title', 'Titel', data.title, data.confidence?.title)}
        ${this.generateFieldPreview('description', 'Beskrivning', data.description, data.confidence?.description)}
        ${this.generateFieldPreview('condition', 'Skick', data.condition, data.confidence?.condition)}
        ${this.generateFieldPreview('artist', 'Konstnär', data.artist, data.confidence?.artist)}
        ${this.generateFieldPreview('materials', 'Material', data.materials)}
        ${this.generateFieldPreview('period', 'Period', data.period)}
        ${this.generateFieldPreview('keywords', 'Sökord', data.keywords)}
      </div>
      
      ${(data.estimate || data.reserve) ? `
        <div class="market-analysis">
          <h5>💰 Värdering</h5>
          ${data.estimate ? `<p><strong>Uppskattat värde:</strong> ${data.estimate} SEK ${this.getConfidenceBadge(data.confidence?.estimate)}</p>` : ''}
          ${data.reserve ? `<p><strong>Föreslaget bevakningspris:</strong> ${data.reserve} SEK</p>` : ''}
          ${data.shouldDisposeIfUnsold ? '<p><strong>⚠️ Ska skänkas/återvinnas om osålt</strong></p>' : ''}
        </div>
      ` : ''}
      
      ${data.reasoning ? `
        <div class="ai-reasoning">
          <h5>🤖 AI-analys</h5>
          <p><em>${data.reasoning}</em></p>
        </div>
      ` : ''}
      
      <div class="preview-actions">
        <p class="text-muted">
          <small>Granska informationen ovan och redigera vid behov innan du tillämpar på formuläret.</small>
        </p>
      </div>
    `;
  }

  /**
   * Generate preview for individual field
   */
  generateFieldPreview(fieldName, label, value, confidence) {
    if (!value) return '';

    const confidenceBadge = confidence ? this.getConfidenceBadge(confidence) : '';
    const isTextarea = ['description', 'condition', 'keywords'].includes(fieldName);
    const fieldClass = `preview-field preview-field--${fieldName}`;
    
    return `
      <div class="field-preview" data-field="${fieldName}">
        <label class="field-label">
          ${label} ${confidenceBadge}
        </label>
        ${isTextarea 
          ? `<textarea class="${fieldClass}" data-field="${fieldName}" rows="4">${value}</textarea>`
          : `<input type="text" class="${fieldClass}" data-field="${fieldName}" value="${value}">`
        }
      </div>
    `;
  }

  /**
   * Get confidence badge HTML
   */
  getConfidenceBadge(confidence) {
    if (confidence >= 0.9) {
      return '<span class="confidence-badge confidence-high">Hög säkerhet</span>';
    } else if (confidence >= 0.7) {
      return '<span class="confidence-badge confidence-medium">Medel säkerhet</span>';
    } else {
      return '<span class="confidence-badge confidence-low">Låg säkerhet</span>';
    }
  }

  /**
   * Apply parsed data to the actual form
   */
  applyParsedDataToForm() {
    if (!this.parsedData) {
      console.error('❌ No parsed data to apply');
      return;
    }

    try {
      // Get updated values from preview fields (user may have edited them)
      const updatedData = this.getUpdatedDataFromPreview();
      console.log('🔄 Applying parsed data to form:', updatedData);
      
      // Apply data directly to form fields using the exact field IDs from the HTML
      this.applyToFormField('item_title_sv', updatedData.title);
      this.applyToFormField('item_description_sv', updatedData.description);
      this.applyToFormField('item_condition_sv', updatedData.condition);
      this.applyToFormField('item_artist_name_sv', updatedData.artist);
      this.applyToFormField('item_hidden_keywords', updatedData.keywords);
      
      // Apply numeric fields from original parsed data
      if (this.parsedData.estimate) {
        this.applyToFormField('item_current_auction_attributes_estimate', this.parsedData.estimate);
      }
      if (this.parsedData.reserve) {
        this.applyToFormField('item_current_auction_attributes_reserve', this.parsedData.reserve);
      }
      
      // Apply checkbox for disposal if unsold
      if (this.parsedData.shouldDisposeIfUnsold) {
        const checkbox = document.getElementById('item_should_be_disposed_of_if_unsold');
        if (checkbox) {
          checkbox.checked = true;
          console.log('✅ Set disposal checkbox to checked');
        }
      }
      
      // Close modal
      this.closeModal();
      
      // Show success message
      this.showSuccessMessage('Fritext har analyserats och tillämpats på formuläret!');
      
      console.log('✅ All parsed data applied to form successfully');
      
    } catch (error) {
      console.error('❌ Failed to apply parsed data:', error);
      this.showError('Kunde inte applicera data till formuläret.');
    }
  }

  /**
   * Apply value to a specific form field
   */
  applyToFormField(fieldId, value) {
    if (!value) return;
    
    const field = document.getElementById(fieldId);
    if (field) {
      // Check if field already has content and ask for confirmation
      if (field.value.trim() && field.hasAttribute('data-confirm-nonempty')) {
        const confirmMessage = field.getAttribute('data-confirm-nonempty');
        if (!confirm(confirmMessage)) {
          console.log(`⏭️ Skipped ${fieldId} - user declined replacement`);
          return;
        }
      }
      
      field.value = value;
      
      // Trigger change event to notify any listeners (important for Auctionet's form validation)
      field.dispatchEvent(new Event('change', { bubbles: true }));
      field.dispatchEvent(new Event('input', { bubbles: true }));
      
      console.log(`✅ Applied to ${fieldId}:`, value);
    } else {
      console.warn(`⚠️ Field not found: ${fieldId}`);
    }
  }

  /**
   * Show success message to user
   */
  showSuccessMessage(message) {
    // Create a temporary success notification
    const notification = document.createElement('div');
    notification.className = 'freetext-success-notification';
    notification.innerHTML = `
      <div class="alert alert-success" style="position: fixed; top: 20px; right: 20px; z-index: 10000; max-width: 400px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
        <strong>✅ Klart!</strong> ${message}
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Remove after 4 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 4000);
  }

  /**
   * Get updated data from preview fields
   */
  getUpdatedDataFromPreview() {
    const data = {};
    const previewFields = this.currentModal.querySelectorAll('.preview-field');
    
    previewFields.forEach(field => {
      const fieldName = field.closest('.field-preview').dataset.field;
      const value = field.value.trim();
      if (value) {
        data[fieldName] = value;
      }
    });
    
    // Include original parsed data for fields not shown in preview
    if (this.parsedData) {
      data.estimate = this.parsedData.estimate;
      data.reserve = this.parsedData.reserve;
      data.shouldDisposeIfUnsold = this.parsedData.shouldDisposeIfUnsold;
    }
    
    return data;
  }

  /**
   * Calculate confidence scores for parsed data
   */
  calculateConfidenceScores(data) {
    const confidence = {};
    
    // Simple confidence calculation based on data completeness and patterns
    Object.keys(data).forEach(key => {
      const value = data[key];
      if (!value) {
        confidence[key] = 0;
        return;
      }
      
      let score = 0.5; // Base score
      
      // Boost confidence based on field-specific patterns
      switch (key) {
        case 'title':
          if (value.length > 10 && value.includes(',')) score += 0.3;
          break;
        case 'artist':
          if (/^[A-ZÅÄÖ][a-zåäö]+ [A-ZÅÄÖ][a-zåäö]+$/.test(value)) score += 0.4;
          break;
        case 'period':
          if (/\d{4}/.test(value)) score += 0.3;
          break;
        case 'materials':
          if (['porslin', 'stengods', 'keramik', 'glas', 'silver'].some(m => value.toLowerCase().includes(m))) {
            score += 0.3;
          }
          break;
      }
      
      confidence[key] = Math.min(0.95, score);
    });
    
    return { ...data, confidence };
  }

  /**
   * Validate against auction history using existing 3.5M auction dataset
   */
  async validateAgainstAuctionHistory(data) {
    console.log('🔄 Historical validation using existing auction dataset...');
    
    // Use existing validation logic - for now just return data
    // Future: Could integrate with existing validation systems
    return data;
  }

  /**
   * Enrich with market data using existing comprehensive market analysis system
   */
  async enrichWithMarketData(data) {
    console.log('🔄 Market data enrichment using existing market analysis system...');
    
    try {
      // Only run market analysis if we have artist or meaningful object data
      if (!data.artist && (!data.title || data.title.length < 10)) {
        console.log('⏭️ Skipping market analysis - insufficient data for meaningful search');
        return data;
      }
      
      // Extract search parameters from parsed data
      const artistName = data.artist || '';
      const objectType = this.extractObjectType(data.title);
      const period = data.period || '';
      const technique = data.materials || '';
      const description = `${data.title} ${data.description}`.trim();
      
      console.log('🔍 Running market analysis with:', {
        artistName,
        objectType,
        period,
        technique,
        description: description.substring(0, 100) + '...'
      });
      
      // Use existing market analysis system
      const marketData = await this.apiManager.analyzeComparableSales(
        artistName,
        objectType,
        period,
        technique,
        description,
        data.estimate // Pass current estimate for comparison
      );
      
      if (marketData && marketData.hasComparableData) {
        console.log('✅ Market analysis successful:', {
          hasHistorical: !!marketData.historical,
          hasLive: !!marketData.live,
          priceRange: marketData.priceRange,
          confidence: marketData.confidence
        });
        
        // Update estimates based on market data
        if (marketData.priceRange) {
          const marketLow = marketData.priceRange.low;
          const marketHigh = marketData.priceRange.high;
          const marketMid = Math.round((marketLow + marketHigh) / 2);
          
          // Use market data for estimates, but be conservative for freetext parsing
          data.estimate = marketMid;
          data.reserve = Math.round(marketLow * 0.7); // 70% of market low
          
          // Add market context to reasoning
          data.reasoning = (data.reasoning || '') + 
            ` Marknadsanalys: ${marketData.historical?.analyzedSales || 0} jämförbara försäljningar, ` +
            `prisintervall ${marketLow.toLocaleString()}-${marketHigh.toLocaleString()} SEK.`;
          
          // Update confidence based on market data quality
          if (data.confidence) {
            data.confidence.estimate = Math.min(0.9, marketData.confidence || 0.5);
          }
        }
        
        // Store market data for potential dashboard display
        data.marketData = marketData;
        
      } else {
        console.log('⚠️ No market data found - keeping AI estimates');
        data.reasoning = (data.reasoning || '') + ' Ingen marknadsdata hittades för värdering.';
      }
      
    } catch (error) {
      console.error('❌ Market analysis failed:', error);
      data.reasoning = (data.reasoning || '') + ' Marknadsanalys misslyckades - använder AI-uppskattning.';
    }
    
    return data;
  }
  
  /**
   * Extract object type from title for market analysis
   */
  extractObjectType(title) {
    if (!title) return '';
    
    // Common Swedish auction object types
    const objectTypes = [
      'tavla', 'målning', 'litografi', 'grafik', 'teckning', 'akvarell',
      'skulptur', 'vas', 'skål', 'fat', 'tallrik', 'kopp', 'kanna',
      'lampa', 'ljusstake', 'spegel', 'klocka', 'ur', 'smycke', 'ring',
      'halsband', 'brosch', 'armband', 'porslin', 'keramik', 'glas',
      'silver', 'tenn', 'koppar', 'mässing', 'järn', 'trä', 'möbel',
      'stol', 'bord', 'skåp', 'byrå', 'soffa', 'fåtölj', 'matta',
      'textil', 'tyg', 'bok', 'karta', 'foto', 'vykort'
    ];
    
    const lowerTitle = title.toLowerCase();
    for (const type of objectTypes) {
      if (lowerTitle.includes(type)) {
        return type;
      }
    }
    
    // Fallback: use first word if no specific type found
    return title.split(/[,\s]+/)[0] || '';
  }

  /**
   * Show error message
   */
  showError(message) {
    // Use existing error feedback system
    if (this.addItemsManager && this.addItemsManager.showErrorFeedback) {
      this.addItemsManager.showErrorFeedback(message);
    } else {
      alert(message); // Fallback
    }
  }

  /**
   * Close the modal
   */
  closeModal() {
    if (this.currentModal) {
      try {
        // Remove event listeners to prevent memory leaks
        const escapeHandler = this.currentModal._escapeHandler;
        if (escapeHandler) {
          document.removeEventListener('keydown', escapeHandler);
        }
        
        // Remove modal from DOM
        if (this.currentModal.parentNode) {
          this.currentModal.parentNode.removeChild(this.currentModal);
        }
        
        this.currentModal = null;
        this.parsedData = null;
        this.isProcessing = false;
        console.log('✅ Freetext modal closed');
      } catch (error) {
        console.error('❌ Error closing modal:', error);
        // Force cleanup
        this.currentModal = null;
        this.parsedData = null;
        this.isProcessing = false;
      }
    }
  }

  /**
   * Inject component styles
   * NOTE: CSS is now loaded via manifest.json - following .cursorrules
   */
  injectStyles() {
    // CSS is now properly loaded via manifest.json: styles/components/freetext-parser.css
    // Following .cursorrules: CSS in CSS files, not JavaScript
    console.log('✅ FreetextParser: CSS loaded via manifest.json');
  }

  /**
   * Destroy the component and clean up
   */
  destroy() {
    this.closeModal();
    
    // Remove button
    const button = document.querySelector('.freetext-parser-container');
    if (button) button.remove();
    
    // Remove styles
    const styles = document.querySelector('#freetext-parser-styles');
    if (styles) styles.remove();
    
    console.log('✅ FreetextParser component destroyed');
  }
} 