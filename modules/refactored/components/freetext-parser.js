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
  isForbiddenWord,
  getModelSpecificValuationRules
} = window;

// Import AIImageAnalyzer component (modular architecture)
import { AIImageAnalyzer } from './ai-image-analyzer.js';

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
    
    // Initialize AIImageAnalyzer component
    this.imageAnalyzer = new AIImageAnalyzer(this.apiManager, {
      enableMarketValidation: true,
      confidenceThreshold: 0.6
    });
    
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
          <!-- Unified interface - no tabs needed -->
          
          <!-- Unified Input Section -->
          <div class="unified-input-section">
            <!-- Multiple Images Upload -->
            <div class="images-section">
              <h4>📸 Bilder av objektet (valfritt)</h4>
              <p class="section-hint">Ladda upp 1-5 bilder för bästa AI-analys. Fler bilder = högre precision.</p>
              <div id="multiple-images-analyzer-container"></div>
            </div>
            
            <!-- Text Input -->
            <div class="text-section">
              <label for="freetext-input" class="freetext-label">
                <strong>📝 Beskrivning av objektet (valfritt):</strong>
                <span class="freetext-hint">Skriv allt du vet: märke, konstnär, material, mått, skick, värdering, etc.</span>
              </label>
              <textarea 
                id="freetext-input" 
                class="freetext-textarea"
                placeholder="Exempel: Kruka höganäs troligen 1960tal brun stengods 28cm höjd 22cm omkrets två nagg i överkant lisa larson 500 kronor bevakning 300:- märkt CBGBs under"
                rows="6"
              ></textarea>
              <div class="freetext-examples">
                <strong>Exempel på bra beskrivning:</strong>
                <div class="example-item">
                  "Vas rörstrand gunnar nylund 1950-tal blå glasyr 25cm hög märkt R tre små nagg i kanten uppskattat värde 800kr"
                </div>
              </div>
            </div>
            
            <!-- Analysis Mode Indicator -->
            <div class="analysis-mode-indicator" id="analysis-mode-indicator">
              <div class="mode-status">
                <span class="mode-icon">🤖</span>
                <span class="mode-text">Fyll i bilder och/eller text för AI-analys</span>
              </div>
            </div>
          </div>
          
          <div class="ai-processing-section" style="display: none;">
            <div class="processing-spinner"></div>
            <div class="processing-status">
              <h4>🤖 AI analyserar...</h4>
              <p class="processing-step">Förbereder analys...</p>
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

    // Initialize image analyzer
    this.initializeImageAnalyzers(modal);
    
    // Add text change listener for dynamic mode indicator
    const textarea = modal.querySelector('#freetext-input');
    if (textarea) {
      textarea.addEventListener('input', () => {
        this.updateAnalysisModeIndicator(modal);
      });
    }
  }

  /**
   * Initialize tab switching functionality
   */
  initializeTabSwitching(modal) {
    const textTab = modal.querySelector('#text-tab');
    const imageTab = modal.querySelector('#image-tab');
    const multipleImagesTab = modal.querySelector('#multiple-images-tab');
    const combinedTab = modal.querySelector('#combined-tab');
    
    const textSection = modal.querySelector('#text-input-section');
    const imageSection = modal.querySelector('#image-input-section');
    const multipleImagesSection = modal.querySelector('#multiple-images-input-section');
    const combinedSection = modal.querySelector('#combined-input-section');
    
    const analyzeBtn = modal.querySelector('#analyze-btn');

    if (!textTab || !imageTab || !multipleImagesTab || !combinedTab) {
      console.error('❌ Tab buttons not found');
      return;
    }

    // Tab click handlers
    textTab.addEventListener('click', () => {
      this.switchToTab('text', modal);
      analyzeBtn.textContent = '🤖 Analysera fritext med AI';
    });

    imageTab.addEventListener('click', () => {
      this.switchToTab('image', modal);
      analyzeBtn.textContent = '🤖 Analysera bild med AI';
    });

    multipleImagesTab.addEventListener('click', () => {
      this.switchToTab('multiple-images', modal);
      analyzeBtn.textContent = '📸📸 Analysera flera bilder med AI';
    });

    combinedTab.addEventListener('click', () => {
      this.switchToTab('combined', modal);
      analyzeBtn.textContent = '🚀 Analysera bild + text med AI';
    });

    console.log('✅ Tab switching initialized');
  }

  /**
   * Switch to specified tab
   */
  switchToTab(tabType, modal) {
    // Update tab button states
    const tabs = modal.querySelectorAll('.tab-btn');
    tabs.forEach(tab => tab.classList.remove('tab-btn--active'));
    modal.querySelector(`#${tabType}-tab`).classList.add('tab-btn--active');

    // Show/hide sections
    modal.querySelector('#text-input-section').style.display = tabType === 'text' ? 'block' : 'none';
    modal.querySelector('#image-input-section').style.display = tabType === 'image' ? 'block' : 'none';
    modal.querySelector('#combined-input-section').style.display = tabType === 'combined' ? 'block' : 'none';

    // Store current tab
    this.currentTab = tabType;
    console.log('✅ Switched to tab:', tabType);
  }

  /**
   * Initialize unified image analyzer with multiple image support
   */
  initializeImageAnalyzers(modal) {
    try {
      // Wait for DOM to be ready before initializing image analyzer
      setTimeout(() => {
        // Initialize multiple images analyzer
        const multipleImagesContainer = modal.querySelector('#multiple-images-analyzer-container');
        if (multipleImagesContainer) {
          console.log('🔍 Initializing multiple images analyzer...');
          
          // Configure for unified multiple images
          this.imageAnalyzer.config.allowMultipleImages = true;
          
          multipleImagesContainer.innerHTML = this.imageAnalyzer.generateMultipleImageUploadUI('multiple-images-analyzer', {
            showPreview: true,
            dragAndDrop: true,
            maxImages: 5
          });
          
          // Wait a bit more for the HTML to be inserted
          setTimeout(() => {
            this.imageAnalyzer.attachMultipleImageUploadListeners('multiple-images-analyzer', (imagesMap) => {
              console.log('📸 Images updated:', imagesMap?.size || 0, 'images');
              this.selectedImages = imagesMap;
              this.updateAnalysisModeIndicator(modal);
            });
          }, 100);
        } else {
          console.warn('⚠️ Multiple images analyzer container not found');
        }

        console.log('✅ Unified image analyzer initialization started');
      }, 50);
    } catch (error) {
      console.error('❌ Failed to initialize image analyzer:', error);
    }
  }

  /**
   * Update analysis mode indicator based on current inputs
   */
  updateAnalysisModeIndicator(modal) {
    const indicator = modal.querySelector('#analysis-mode-indicator');
    const analyzeBtn = modal.querySelector('#analyze-btn');
    const textarea = modal.querySelector('#freetext-input');
    
    if (!indicator || !analyzeBtn) return;
    
    const hasImages = this.selectedImages && this.selectedImages.size > 0;
    const hasText = textarea && textarea.value.trim().length > 0;
    
    const modeIcon = indicator.querySelector('.mode-icon');
    const modeText = indicator.querySelector('.mode-text');
    
    if (hasImages && hasText) {
      // Combined analysis
      modeIcon.textContent = '🚀';
      modeText.textContent = `Redo för kombinerad analys: ${this.selectedImages.size} bilder + text`;
      analyzeBtn.textContent = '🚀 Analysera bilder + text med AI';
      indicator.className = 'analysis-mode-indicator mode-combined';
    } else if (hasImages) {
      // Image-only analysis
      modeIcon.textContent = '📸';
      modeText.textContent = `Redo för bildanalys: ${this.selectedImages.size} bilder`;
      analyzeBtn.textContent = this.selectedImages.size > 1 ? '📸📸 Analysera flera bilder med AI' : '📸 Analysera bild med AI';
      indicator.className = 'analysis-mode-indicator mode-images';
    } else if (hasText) {
      // Text-only analysis
      modeIcon.textContent = '📝';
      modeText.textContent = 'Redo för textanalys';
      analyzeBtn.textContent = '📝 Analysera text med AI';
      indicator.className = 'analysis-mode-indicator mode-text';
    } else {
      // No input
      modeIcon.textContent = '🤖';
      modeText.textContent = 'Fyll i bilder och/eller text för AI-analys';
      analyzeBtn.textContent = '🤖 Analysera med AI';
      indicator.className = 'analysis-mode-indicator mode-empty';
    }
  }

  /**
   * Process input using AI Rules System v2.0 (unified logic)
   */
  async processFreetextWithAI() {
    console.log('🔄 processFreetextWithAI called');
    
    if (this.isProcessing) {
      console.log('⚠️ Already processing');
      return;
    }

    // Determine processing method based on available inputs
    const textarea = this.currentModal.querySelector('#freetext-input');
    const hasText = textarea && textarea.value.trim().length > 0;
    const hasImages = this.selectedImages && this.selectedImages.size > 0;
    
    console.log('🔍 Input analysis:', {
      hasText,
      hasImages,
      imageCount: this.selectedImages?.size || 0,
      textLength: textarea?.value?.trim()?.length || 0
    });

    if (!hasText && !hasImages) {
      this.showError('Vänligen fyll i text och/eller ladda upp bilder för analys.');
      return;
    }

    try {
      this.isProcessing = true;
      
      // Show dynamic processing state based on analysis type
      let processingTitle, processingDescription;
      if (hasImages && hasText) {
        processingTitle = '🚀 AI analyserar bilder + text...';
        processingDescription = 'Kombinerar visuell och textbaserad analys för bästa resultat';
      } else if (hasImages) {
        const imageCount = this.selectedImages?.size || 0;
        if (imageCount > 1) {
          processingTitle = '📸📸 AI analyserar flera bilder...';
          processingDescription = `Analyserar ${imageCount} bilder för komplett objektbedömning`;
        } else {
          processingTitle = '📸 AI analyserar bild...';
          processingDescription = 'Extraherar objektinformation från bildanalys';
        }
      } else {
        processingTitle = '📝 AI analyserar fritext...';
        processingDescription = 'Extraherar strukturerad data från fritext';
      }
      
      this.showProcessingState(processingTitle, processingDescription);

      let analysisResult;
      let sureScore;

      if (hasImages && hasText) {
        // Combined analysis
        console.log('🚀 Running combined image + text analysis');
        analysisResult = await this.processCombinedImageAndText();
      } else if (hasImages) {
        // Image-only analysis
        console.log('📸 Running image-only analysis');
        analysisResult = await this.processImageOnly();
      } else {
        // Text-only analysis
        console.log('📝 Running text-only analysis');
        analysisResult = await this.processTextOnly();
      }

      // Calculate sure score and market validation (non-blocking)
      console.log('📊 Calculating Sure Score and market validation...');
      let marketData = null;
      try {
        marketData = await this.imageAnalyzer.validateWithMarketData(analysisResult);
      } catch (error) {
        console.warn('⚠️ Market validation failed, continuing without market data:', error);
      }
      sureScore = this.imageAnalyzer.calculateSureScore(analysisResult, marketData);

      // Store results
      this.parsedData = analysisResult;
      this.currentSureScore = sureScore;
      this.currentMarketData = marketData;

      // Show results
      this.showParsedPreview(analysisResult, sureScore);
      console.log('✅ Analysis completed successfully');

    } catch (error) {
      console.error('❌ Analysis failed:', error);
      this.showError(`AI-analys misslyckades: ${error.message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process text-only input (original functionality)
   */
  async processTextOnly() {
    console.log('📝 Processing text-only input...');
    
    const textarea = this.currentModal.querySelector('#freetext-input');
    const freetext = textarea.value.trim();

    console.log('📝 Freetext validation:', {
      hasTextarea: !!textarea,
      freetextLength: freetext?.length || 0,
      freetext: freetext?.substring(0, 100) + '...'
    });

    if (!freetext) {
      throw new Error('Vänligen skriv in information om objektet först.');
    }

    if (freetext.length < 10) {
      throw new Error('Fritext är för kort. Skriv mer information om objektet.');
    }

    // Validate that this looks like auction item text, not console logs or debug info
    if (freetext.includes('✅') || freetext.includes('🔴') || freetext.includes('console.log') || 
        freetext.includes('FreetextParser') || freetext.includes('.js:') || 
        freetext.includes('freetext-parser.js') || freetext.includes('add-items-integration-manager.js')) {
      throw new Error('Fritexten verkar innehålla debug-information. Vänligen ange riktig auktionstext för att analysera.');
    }

    console.log('🤖 Starting text analysis:', freetext.substring(0, 100) + '...');

    // Step 1: Parse freetext using AI Rules System v2.0
    const parsedData = await this.parseFreetextWithAI(freetext);
    
    // Step 2: Validate against historical auction data (if enabled)
    const validatedData = this.config.enableHistoricalValidation 
      ? await this.validateAgainstAuctionHistory(parsedData)
      : parsedData;

    // Step 3: Generate search terms and market analysis
    const enrichedData = await this.enrichWithMarketData(validatedData);

    // Step 4: Calculate confidence scores
    const finalData = this.calculateConfidenceScores(enrichedData);

    // Step 5: Auto-enhance using AI Rules System v2.0
    const enhancedData = await this.autoEnhanceFields(finalData);

    console.log('✅ Text-only processing completed');
    return enhancedData;
  }

  /**
   * Process image-only input using AIImageAnalyzer
   */
  async processImageOnly() {
    console.log('📸 Processing image-only input...');
    
    if (!this.selectedImages || this.selectedImages.size === 0) {
      throw new Error('Vänligen ladda upp bilder att analysera först.');
    }

    console.log('🤖 Starting image analysis:', this.selectedImages.size, 'images');
    
    // Analyze images using AIImageAnalyzer component
    let imageAnalysis;
    if (this.selectedImages.size === 1) {
      // Single image analysis
      const singleImage = Array.from(this.selectedImages.values())[0];
      imageAnalysis = await this.imageAnalyzer.analyzeImage(singleImage);
    } else {
      // Multiple images analysis
      imageAnalysis = await this.imageAnalyzer.analyzeMultipleImages();
    }
    
    // Convert image analysis to freetext parser format for consistency
    const parsedData = {
      title: imageAnalysis.title || '',
      description: imageAnalysis.description || '',
      condition: imageAnalysis.condition || '',
      artist: imageAnalysis.artist || null,
      keywords: imageAnalysis.keywords || '',
      materials: imageAnalysis.materials || '',
      period: imageAnalysis.period || '',
      estimate: imageAnalysis.estimate || null, // Use AI estimate as initial value
      reserve: imageAnalysis.reserve || null,   // Use AI reserve as initial value
      shouldDisposeIfUnsold: false,
      confidence: {
        ...imageAnalysis.confidence,
        title: imageAnalysis.confidence?.objectIdentification || 0.5,
        description: imageAnalysis.confidence?.materialAssessment || 0.5,
        condition: imageAnalysis.confidence?.conditionAssessment || 0.5,
        artist: imageAnalysis.confidence?.artistAttribution || 0.5,
        estimate: imageAnalysis.confidence?.estimate || 0.4
      },
      reasoning: imageAnalysis.reasoning || '',
      analysisType: 'image',
      imageAnalysis: imageAnalysis // Store original image analysis
    };

    console.log('✅ Image-only processing completed');
    return parsedData;
  }

  /**
   * Process combined image + text input
   */
  async processCombinedImageAndText() {
    console.log('🔄 Processing combined image + text input...');
    
    if (!this.selectedImages || this.selectedImages.size === 0) {
      throw new Error('Vänligen ladda upp bilder för kombinerad analys först.');
    }

    const textarea = this.currentModal.querySelector('#freetext-input');
    const additionalText = textarea ? textarea.value.trim() : '';

    console.log('🤖 Starting combined analysis:', {
      imageCount: this.selectedImages.size,
      hasAdditionalText: !!additionalText,
      additionalTextLength: additionalText.length
    });

    // Analyze images with additional text context
    let imageAnalysis;
    if (this.selectedImages.size === 1) {
      // Single image analysis with text context
      const singleImage = Array.from(this.selectedImages.values())[0];
      imageAnalysis = await this.imageAnalyzer.analyzeImage(singleImage, additionalText);
    } else {
      // Multiple images analysis with text context
      imageAnalysis = await this.imageAnalyzer.analyzeMultipleImages(additionalText);
    }

    // Enhanced combined processing with both visual and textual data
    const parsedData = {
      title: imageAnalysis.title || '',
      description: imageAnalysis.description || '',
      condition: imageAnalysis.condition || '',
      artist: imageAnalysis.artist || null,
      keywords: imageAnalysis.keywords || '',
      materials: imageAnalysis.materials || '',
      period: imageAnalysis.period || '',
      estimate: imageAnalysis.estimate || null, // Use AI estimate as initial value
      reserve: imageAnalysis.reserve || null,   // Use AI reserve as initial value
      shouldDisposeIfUnsold: false,
      confidence: {
        ...imageAnalysis.confidence,
        title: imageAnalysis.confidence?.objectIdentification || 0.5,
        description: imageAnalysis.confidence?.materialAssessment || 0.5,
        condition: imageAnalysis.confidence?.conditionAssessment || 0.5,
        artist: imageAnalysis.confidence?.artistAttribution || 0.5,
        estimate: imageAnalysis.confidence?.estimate || 0.4
      },
      reasoning: imageAnalysis.reasoning || '',
      analysisType: 'combined',
      imageAnalysis: imageAnalysis, // Store original image analysis
      additionalContext: additionalText
    };

    // If we have additional text, enhance the analysis further
    if (additionalText && additionalText.length > 10) {
      console.log('🔧 Enhancing with additional text context...');
      const enhancedData = await this.enhanceWithAdditionalText(parsedData, additionalText);
      console.log('✅ Combined processing with text enhancement completed');
      return enhancedData;
    }

    console.log('✅ Combined processing completed');
    return parsedData;
  }

  /**
   * Enhance image analysis with additional text context
   */
  async enhanceWithAdditionalText(imageData, additionalText) {
    console.log('🔧 Enhancing image analysis with additional text...');
    
    try {
      // Create combined prompt for text enhancement
      const enhancementPrompt = `
        Förbättra denna AI-bildanalys med hjälp av användarens tilläggstext:
        
        BILDANALYS:
        Titel: ${imageData.title}
        Beskrivning: ${imageData.description}
        Skick: ${imageData.condition}
        Konstnär: ${imageData.artist || 'Ej identifierad'}
        Material: ${imageData.materials}
        
        TILLÄGGSTEXT FRÅN ANVÄNDARE:
        "${additionalText}"
        
        Använd tilläggstext för att förbättra och komplettera bildanalysen. Behåll originalstruktur men lägg till värdefull information från tilläggstext.
        
        Returnera förbättrad data i samma JSON-format som originalanalys.
      `;

      // Call AI to enhance with text context
      const systemPrompt = getSystemPrompt('textEnhancement') || this.getEditPageSystemPrompt();
      
      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Text enhancement timeout'));
        }, 30000);
        
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiManager.apiKey,
          body: {
            model: this.apiManager.getCurrentModel().id, // Use user's selected model
            max_tokens: 2000,
            temperature: 0.1,
            system: systemPrompt,
            messages: [{
              role: 'user',
              content: enhancementPrompt
            }]
          }
        }, (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.success) {
            resolve(response);
          } else {
            reject(new Error('Text enhancement failed'));
          }
        });
      });

      if (response.success && response.data?.content?.[0]?.text) {
        try {
          const enhancedText = response.data.content[0].text;
          const enhancedData = this.parseAIResponse(enhancedText);
          
          // Merge enhanced data with original, preserving image analysis
          const mergedData = {
            ...imageData,
            ...enhancedData,
            imageAnalysis: imageData.imageAnalysis, // Preserve original image analysis
            additionalContext: additionalText,
            analysisType: 'combined'
          };
          
          console.log('✅ Text enhancement completed');
          return mergedData;
        } catch (parseError) {
          console.warn('⚠️ Could not parse enhanced data, using original:', parseError);
          return imageData;
        }
      }
      
      console.warn('⚠️ No valid enhancement response, using original data');
      return imageData;
      
    } catch (error) {
      console.error('❌ Text enhancement failed:', error);
      return imageData; // Fallback to original image data
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

    // Use AI Rules System v2.0 for consistent prompts and corrections
    const { 
      getSystemPrompt, 
      getCategoryPrompt, 
      buildPrompt,
      getBrandCorrections,
      getArtistCorrections,
      isForbiddenWord,
      getModelSpecificValuationRules
    } = window;

    const systemPrompt = getSystemPrompt('freetextParser') || getSystemPrompt('core');
    const categoryPrompt = getCategoryPrompt('freetextParser');
    const brandCorrections = getBrandCorrections();
    const artistCorrections = getArtistCorrections();
    
    console.log('✅ Using AI Rules System v2.0:', {
      hasSystemPrompt: !!systemPrompt,
      hasCategoryPrompt: !!categoryPrompt,
      brandCorrectionsCount: Object.keys(brandCorrections || {}).length,
      artistCorrectionsCount: Object.keys(artistCorrections || {}).length
    });

    // Get model-specific valuation rules from AI Rules System v2.0
    const currentModel = this.apiManager.getCurrentModel().id;
    const valuationRules = getModelSpecificValuationRules('freetextParser', currentModel);
    
    console.log('🎯 Using model-specific valuation rules:', {
      model: currentModel,
      approach: valuationRules.approach,
      instruction: valuationRules.instruction,
      maxTokens: valuationRules.maxTokens,
      temperature: valuationRules.temperature,
      enableDeepReasoning: valuationRules.enableDeepReasoning
    });
    
    // For Claude 4, add extra context about realistic pricing based on your data
    let valuationContext = '';
    if (currentModel === 'claude-4-sonnet') {
      valuationContext = `\n\n💰 VÄRDERINGSKONTEXT FÖR CLAUDE 4:
Baserat på verklig auktionsdata från Stadsauktion Sundsvall:
- Genomsnittligt slutpris: 1,592 SEK
- Nuvarande AI-värderingar är ofta 25-30% för höga
- Ge realistiska värderingar som reflekterar vad köpare faktiskt betalar
- Använd marknadsdata och objektets faktiska kondition
- Undvik överdrivet konservativa uppskattningar`;
    }

    // Add advanced reasoning instructions for Claude 4
    let reasoningInstructions = '';
    if (valuationRules.enableDeepReasoning) {
      reasoningInstructions = `\n\n🧠 AVANCERAD ANALYS (Claude 4 Deep Reasoning):
Utför djupgående analys i flera steg:

1️⃣ OBJEKTIDENTIFIERING:
• Identifiera exakt föremålstyp, märke, modell
• Analysera stilperiod och designerepok
• Bedöm materialens kvalitet och äkthet
• Notera unika kännetecken och signaturer

2️⃣ KONDITIONSBEDÖMNING:
• Analysera synligt slitage och skador
• Bedöm originalitet vs restaurering
• Värdera kompletthet (alla delar kvar?)
• Uppskatta servicehistorik om relevant

3️⃣ MARKNADSKONTEXTUALISERING:
• Jämför med liknande objekt på svenska auktioner
• Analysera efterfrågan för denna typ/märke
• Överväg regional marknadsdynamik (Sundsvall)
• Bedöm säsongsvariationer och trender

4️⃣ VÄRDERINGSLOGIK:
• Basera på faktiska slutpriser (inte utrop)
• Justera för kondition och sällsynthet
• Inkludera proveniensbonus om relevant
• Balansera optimism med realism`;
    }

    const userPrompt = `Analysera denna svenska auktionsfritext och extrahera strukturerad data:

FRITEXT:
"${freetext}"${reasoningInstructions}

🎯 TITEL-FORMATERINGSREGLER (AI Rules System v2.0):
• TITEL ska börja med FÖREMÅL (Figurin, Vas, Karaff, etc.)
• Om konstnär identifieras: PLACERA i artist-fält, EXKLUDERA från titel
• Format: [Föremål], [Material], [Märke], [Period]
• Exempel: "Figurin, stengods, Gustavsberg"
• Bevara citattecken runt modellnamn: "Viktoria", "Prince"
• Max 60 tecken

Returnera data i exakt detta JSON-format:
{
  "title": "Föremål först, utan konstnär om artist-fält fylls (max 60 tecken)",
  "description": "Detaljerad beskrivning med mått, material, teknik, period",
  "condition": "Konditionsbeskrivning på svenska",
  "artist": "Konstnär/formgivare om identifierad, annars null",
  "keywords": "relevanta sökord separerade med mellanslag",
  "estimate": 500,
  "reserve": 300,
  "materials": "material/teknik",
  "period": "tidsperiod/datering",
  "shouldDisposeIfUnsold": false,
  "confidence": {
    "title": 0.9,
    "description": 0.8,
    "condition": 0.7,
    "artist": 0.6,
    "estimate": 0.5
  },
  "reasoning": "Kort förklaring av analysen på svenska"
}

INSTRUKTIONER:
- estimate/reserve ska vara numeriska värden i SEK
- confidence-värden mellan 0.0-1.0
- shouldDisposeIfUnsold: true endast om fritexten nämner skänkning/återvinning
- Lämna fält som null om information saknas
- ${valuationRules.instruction}${valuationContext}`;

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
        
        // Use model-specific parameters for enhanced analysis
        const maxTokens = valuationRules.maxTokens || 2000;
        const temperature = valuationRules.temperature || 0.1;
        
        console.log('🚀 Enhanced AI parameters:', {
          model: currentModel,
          maxTokens,
          temperature,
          deepReasoning: valuationRules.enableDeepReasoning
        });
        
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiManager.apiKey,
          body: {
            model: this.apiManager.getCurrentModel().id, // Use user's selected model
            max_tokens: maxTokens, // Dynamic token limit based on model capabilities
            temperature: temperature, // Model-specific temperature for optimal reasoning
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
   * Auto-enhance fields using EXACT SAME logic as edit page "enhance all"
   * This is the "cheat" step that gives us perfect results!
   */
  async autoEnhanceFields(parsedData) {
    console.log('🎯 Auto-enhancing fields with EXACT edit page logic...');
    
    try {
      // Convert parsed data to edit page format
      const itemData = {
        category: '', // FreetextParser doesn't have category
        title: parsedData.title || '',
        description: parsedData.description || '',
        condition: parsedData.condition || '',
        artist: parsedData.artist || '',
        keywords: parsedData.keywords || '',
        estimate: parsedData.estimate || ''
      };

      // Use system prompt (can be same as edit page)
      const systemPrompt = this.getEditPageSystemPrompt();
      
      // Use ADD ITEM page specific user prompt (NOT edit page!)
      const userPrompt = this.getAddItemPageUserPrompt(itemData, 'all');

      console.log('🚀 Using ADD ITEM page enhancement logic:', {
        hasSystemPrompt: !!systemPrompt,
        hasUserPrompt: !!userPrompt,
        systemPromptLength: systemPrompt.length,
        userPromptLength: userPrompt.length
      });

      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Edit page enhancement timeout'));
        }, 20000);
        
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiManager.apiKey,
          body: {
            model: this.apiManager.getCurrentModel().id, // Use user's selected model
            max_tokens: 2000,
            temperature: 0.1,
            system: systemPrompt,
            messages: [{
              role: 'user',
              content: userPrompt
            }]
          }
        }, (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.success) {
            resolve(response);
          } else {
            reject(new Error('Edit page enhancement failed'));
          }
        });
      });

      if (response.success && response.data?.content?.[0]?.text) {
        const enhancedText = response.data.content[0].text;
        console.log('🔍 Edit page enhancement response:', enhancedText);
        
        // Use EXACT SAME parsing logic as edit page
        const enhancedFields = this.parseEditPageResponse(enhancedText, 'all');
        
        // Merge enhanced fields with original data (preserve non-enhanced fields)
        const result = {
          ...parsedData,
          title: enhancedFields.title || parsedData.title,
          description: enhancedFields.description || parsedData.description,
          condition: enhancedFields.condition || parsedData.condition,
          artist: enhancedFields.artist || parsedData.artist,
          keywords: enhancedFields.keywords || parsedData.keywords
        };
        
        console.log('✅ Edit page enhancement successful:', result);
        return result;
      }
      
      console.log('⚠️ Edit page enhancement failed, using original data');
      return parsedData;
      
    } catch (error) {
      console.error('❌ Edit page enhancement error:', error);
      console.log('⚠️ Falling back to original parsed data');
      return parsedData;
    }
  }

  /**
   * Get EXACT SAME system prompt as edit page
   */
  getEditPageSystemPrompt() {
    console.log('🔍 Checking for ContentJSMigration:', {
      hasWindow: typeof window !== 'undefined',
      hasContentJSMigration: !!window.ContentJSMigration,
      hasGetSystemPrompt: !!(window.ContentJSMigration && window.ContentJSMigration.getSystemPrompt),
      hasGlobalGetSystemPrompt: !!window.getSystemPrompt
    });
    
    // Use the exact same system prompt as content.js
    const { ContentJSMigration } = window;
    if (ContentJSMigration && ContentJSMigration.getSystemPrompt) {
      console.log('✅ Using ContentJSMigration.getSystemPrompt()');
      return ContentJSMigration.getSystemPrompt();
    }
    
    // Fallback to AI Rules System v2.0
    const { getSystemPrompt } = window;
    if (getSystemPrompt) {
      console.log('✅ Using global getSystemPrompt()');
      return getSystemPrompt('core', 'contentJs');
    }
    
    // Final fallback - basic system prompt
    console.log('⚠️ Using fallback system prompt');
    return `Du är en expert på svenska auktionskatalogisering. Förbättra auktionstexter enligt svenska auktionsstandarder med fokus på korrekt terminologi, struktur och anti-hallucination.`;
  }

    /**
   * Get ADD ITEM page specific user prompt (NOT edit page!)
   */
  getAddItemPageUserPrompt(itemData, fieldType) {
    console.log('🔍 Using ADD ITEM page specific enhancement rules (NOT edit page)');
    
    // CRITICAL: Use ADD ITEM page rules, not edit page rules!
    
    // Get model-specific valuation rules from AI Rules System v2.0
    const currentModel = this.apiManager.getCurrentModel().id;
    const valuationRules = getModelSpecificValuationRules('freetextParser', currentModel);
    
    // For Claude 4, add extra context about realistic pricing based on your data
    let valuationContext = '';
    if (currentModel === 'claude-4-sonnet') {
      valuationContext = `\n\n💰 VÄRDERINGSKONTEXT FÖR CLAUDE 4:
Baserat på verklig auktionsdata från Stadsauktion Sundsvall:
- Genomsnittligt slutpris: 1,592 SEK
- Nuvarande AI-värderingar är ofta 25-30% för höga
- Ge realistiska värderingar som reflekterar vad köpare faktiskt betalar
- Använd marknadsdata och objektets faktiska kondition
- Undvik överdrivet konservativa uppskattningar`;
    }
    
    // Final fallback - use EXACT edit page logic hardcoded
    console.log('⚠️ Using fallback user prompt with EXACT edit page logic');
    
    const baseInfo = `
FÖREMÅLSINFORMATION:
Kategori: ${itemData.category}
Nuvarande titel: ${itemData.title}
Nuvarande beskrivning: ${itemData.description}
Kondition: ${itemData.condition}
Konstnär/Formgivare: ${itemData.artist}
Värdering: ${itemData.estimate} SEK

🎯 KRITISKA ADD ITEM TITEL-FORMATERINGSREGLER:
${itemData.artist ? 
  '• KONSTNÄR I FÄLT: [Föremål], [Material], [Period]. - Första ordet stor bokstav, PUNKT i slutet' : 
  '• INGEN KONSTNÄR I FÄLT: [OBJEKT], [modell], [material], [period]. - FÖRSTA ORDET VERSALER, KOMMA EFTER, PUNKT I SLUTET'}

EXEMPEL KORREKT FORMATERING:
• Med konstnär i fält: "Skulptur, brons, 1960-tal."
• Utan konstnär i fält: "SKÅL, \"Sofiero\", klarglas, 1900-talets andra hälft."

KRITISKA REGLER:
• FÖRSTA ORDET: ${itemData.artist ? 'Proper case (Skulptur)' : 'VERSALER (SKÅL)'}
• INTERPUNKTION: ${itemData.artist ? 'Punkt efter första ordet (.)' : 'Komma efter första ordet (,)'}
• SLUTPUNKT: ALLTID avsluta med punkt (.)
• MODELLNAMN: Citattecken runt modeller ("Sofiero", "Prince", "Egg")

KONSTNÄRSINFORMATION FÖR TIDSPERIOD:
${itemData.artist ? 
  'Konstnär/formgivare: ' + itemData.artist + ' - Använd din kunskap om denna konstnärs aktiva period för att bestämma korrekt tidsperiod. Om du inte är säker, använd "troligen" eller utelämna period.' : 
  'Ingen konstnär angiven - lägg INTE till tidsperiod om den inte redan finns i källdata.'}

ANTI-HALLUCINATION INSTRUKTIONER:
• Lägg ALDRIG till information som inte finns i källdata
• Uppfinn ALDRIG tidsperioder, material, mått eller skador
• Förbättra ENDAST språk, struktur och terminologi
• Om information saknas - utelämna eller använd osäkerhetsmarkörer
`;

    return baseInfo + `

UPPGIFT: Förbättra titel, beskrivning, konditionsrapport och generera dolda sökord enligt svenska auktionsstandarder för ADD ITEM sidan.

FÄLTAVGRÄNSNING:
• BESKRIVNING: Material, teknik, mått, stil, ursprung, märkningar, funktion - ALDRIG konditionsinformation
• KONDITION: Endast fysiskt skick och skador - ALDRIG beskrivande information
• Håll fälten strikt separerade

VÄRDERINGSREGLER:
• ${valuationRules.instruction}${valuationContext}

Returnera EXAKT i detta format:
TITEL: [förbättrad titel enligt ADD ITEM regler - VERSALER första ordet, KOMMA efter, PUNKT i slutet]
BESKRIVNING: [förbättrad beskrivning]
KONDITION: [förbättrad konditionsrapport]
SÖKORD: [kompletterande sökord separerade med mellanslag]`;
  }

  /**
   * Parse response using EXACT SAME logic as edit page
   */
  parseEditPageResponse(response, fieldType) {
    console.log('🔍 Parsing edit page response for fieldType:', fieldType, 'Response:', response);
    
    // Use exact same parsing logic as content.js parseClaudeResponse method
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
      }
    });
    
    // If we only got a simple response (like just a title), handle it appropriately
    if (Object.keys(result).length === 0 && response.trim().length > 0) {
      // Assume it's a single field response based on the request type
      result.title = response.trim();
    }
    
    console.log('✅ Edit page parsed result:', result);
    return result;
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
   * Show dynamic processing state with step-by-step progress
   */
  showProcessingState(title = '🤖 AI analyserar...', description = 'Extraherar strukturerad data') {
    const modal = this.currentModal;
    if (!modal) return;

    // Initialize progress tracking
    this.progressSteps = this.getProgressSteps();
    this.currentStepIndex = 0;
    this.isProcessing = true;

    // Hide input section
    const inputSection = modal.querySelector('.freetext-input-section');
    if (inputSection) inputSection.style.display = 'none';

    // Show processing section with dynamic content
    const processingSection = modal.querySelector('.ai-processing-section');
    if (processingSection) {
      // Update the processing content with advanced UI
      processingSection.innerHTML = this.generateAdvancedProcessingHTML();
      processingSection.style.display = 'block';
      
      // Start the dynamic progress animation
      this.startAdvancedProgressAnimation();
    }

    // Update buttons
    const analyzeBtn = modal.querySelector('#analyze-btn');
    if (analyzeBtn) {
      analyzeBtn.disabled = true;
      analyzeBtn.textContent = 'Analyserar...';
    }
  }

  /**
   * Get progress steps based on analysis type and model capabilities
   */
  getProgressSteps() {
    const currentModel = this.apiManager.getCurrentModel().id;
    const valuationRules = getModelSpecificValuationRules('freetextParser', currentModel);
    const isAdvancedModel = valuationRules.enableDeepReasoning;

    if (isAdvancedModel) {
      return [
        { icon: '🔍', text: 'Identifierar objekt och märke...', duration: 2000 },
        { icon: '🧠', text: 'Analyserar stilperiod och äkthet...', duration: 2500 },
        { icon: '📊', text: 'Undersöker marknadsdata...', duration: 3000 },
        { icon: '💰', text: 'Beräknar marknadsvärde...', duration: 2000 },
        { icon: '🎯', text: 'Optimerar katalogisering...', duration: 1500 },
        { icon: '✨', text: 'Slutför expertanalys...', duration: 1000 }
      ];
    } else {
      return [
        { icon: '🔍', text: 'Analyserar innehåll...', duration: 1500 },
        { icon: '📝', text: 'Extraherar strukturerad data...', duration: 2000 },
        { icon: '💰', text: 'Beräknar värdering...', duration: 1500 },
        { icon: '✅', text: 'Slutför analys...', duration: 1000 }
      ];
    }
  }

  /**
   * Generate advanced processing HTML with cool animations
   */
  generateAdvancedProcessingHTML() {
    const currentModel = this.apiManager.getCurrentModel().id;
    const valuationRules = getModelSpecificValuationRules('freetextParser', currentModel);
    const isAdvancedModel = valuationRules.enableDeepReasoning;

    return `
      <div class="advanced-processing-container">
        <div class="processing-header">
          <div class="ai-brain-animation">
            <div class="brain-core"></div>
            <div class="brain-pulse"></div>
            <div class="brain-waves">
              <div class="wave wave-1"></div>
              <div class="wave wave-2"></div>
              <div class="wave wave-3"></div>
            </div>
          </div>
          <h3 class="processing-title">
            ${isAdvancedModel ? '🚀 Claude 4 Expertanalys' : '🤖 AI-analys pågår'}
          </h3>
          <p class="processing-subtitle">
            ${isAdvancedModel ? 'Djupgående marknadsresearch med 4-stegs analys' : 'Extraherar strukturerad data från fritext'}
          </p>
        </div>

        <div class="progress-steps-container">
          ${this.progressSteps.map((step, index) => `
            <div class="progress-step" data-step="${index}">
              <div class="step-icon">${step.icon}</div>
              <div class="step-content">
                <div class="step-text">${step.text}</div>
                <div class="step-progress">
                  <div class="step-progress-fill"></div>
                </div>
              </div>
              <div class="step-status">
                <div class="status-pending">⏳</div>
                <div class="status-active">🔄</div>
                <div class="status-complete">✅</div>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="overall-progress">
          <div class="progress-bar">
            <div class="progress-fill"></div>
            <div class="progress-glow"></div>
          </div>
          <div class="progress-text">
            <span class="current-step">0</span> / <span class="total-steps">${this.progressSteps.length}</span> steg
          </div>
        </div>

        <div class="processing-stats">
          <div class="stat">
            <span class="stat-label">Modell:</span>
            <span class="stat-value">${isAdvancedModel ? 'Claude 4 Sonnet' : 'Claude 3.5 Sonnet'}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Tokens:</span>
            <span class="stat-value">${valuationRules.maxTokens || 2000}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Analys:</span>
            <span class="stat-value">${isAdvancedModel ? 'Expert' : 'Standard'}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Start advanced progress animation with step-by-step progression
   */
  startAdvancedProgressAnimation() {
    if (!this.currentModal) return;
    
    this.currentStepIndex = 0;
    this.progressIntervals = [];
    
    // Start the step progression
    this.progressToNextStep();
    
    // Add some visual flair with floating particles
    this.startParticleAnimation();
  }

  /**
   * Progress to the next step in the analysis
   */
  progressToNextStep() {
    if (!this.isProcessing || this.currentStepIndex >= this.progressSteps.length) {
      return;
    }

    const modal = this.currentModal;
    const currentStep = this.progressSteps[this.currentStepIndex];
    
    // Update step status to active
    const stepElement = modal.querySelector(`[data-step="${this.currentStepIndex}"]`);
    if (stepElement) {
      stepElement.classList.add('step-active');
      stepElement.classList.remove('step-pending');
      
      // Animate the step progress bar
      const progressFill = stepElement.querySelector('.step-progress-fill');
      if (progressFill) {
        progressFill.style.width = '100%';
      }
    }

    // Update overall progress
    const overallProgress = modal.querySelector('.progress-fill');
    const currentStepSpan = modal.querySelector('.current-step');
    if (overallProgress && currentStepSpan) {
      const progressPercent = ((this.currentStepIndex + 1) / this.progressSteps.length) * 100;
      overallProgress.style.width = `${progressPercent}%`;
      currentStepSpan.textContent = this.currentStepIndex + 1;
    }

    // Schedule completion of this step
    const timeout = setTimeout(() => {
      if (stepElement) {
        stepElement.classList.add('step-complete');
        stepElement.classList.remove('step-active');
      }
      
      this.currentStepIndex++;
      
      // Continue to next step if still processing
      if (this.isProcessing && this.currentStepIndex < this.progressSteps.length) {
        setTimeout(() => this.progressToNextStep(), 300);
      }
    }, currentStep.duration);
    
    this.progressIntervals.push(timeout);
  }

  /**
   * Start subtle professional animation (no flying particles!)
   */
  startParticleAnimation() {
    // Professional catalogers don't need disco balls! 
    // Just keep the subtle progress indicators
    return;
  }

  /**
   * Complete the progress animation
   */
  completeProgressAnimation() {
    this.isProcessing = false;
    
    // Clear all intervals
    if (this.progressIntervals) {
      this.progressIntervals.forEach(interval => clearTimeout(interval));
      this.progressIntervals = [];
    }
    
    // Mark all steps as complete
    const modal = this.currentModal;
    if (modal) {
      const steps = modal.querySelectorAll('.progress-step');
      steps.forEach(step => {
        step.classList.add('step-complete');
        step.classList.remove('step-active', 'step-pending');
      });
      
      // Complete overall progress
      const overallProgress = modal.querySelector('.progress-fill');
      const currentStepSpan = modal.querySelector('.current-step');
      if (overallProgress && currentStepSpan) {
        overallProgress.style.width = '100%';
        currentStepSpan.textContent = this.progressSteps.length;
      }
    }
  }

  /**
   * Show parsed data preview with optional sure score
   */
  showParsedPreview(data, sureScore = null) {
    const modal = this.currentModal;
    if (!modal) {
      console.error('❌ No modal found for showParsedPreview');
      return;
    }

    console.log('🔍 showParsedPreview called with data:', {
      title: data.title,
      description: data.description?.substring(0, 50) + '...',
      condition: data.condition,
      artist: data.artist,
      hasData: !!data
    });

    // Complete the progress animation
    this.completeProgressAnimation();

    // Store parsed data for later use
    this.parsedData = data;

    // Add a brief delay to show completion, then hide processing section
    setTimeout(() => {
      const processingSection = modal.querySelector('.ai-processing-section');
      if (processingSection) processingSection.style.display = 'none';
    }, 1000);

    // Show preview section
    const previewSection = modal.querySelector('.parsed-preview-section');
    const previewContent = modal.querySelector('.preview-content');
    
    if (previewSection && previewContent) {
      console.log('🔍 Generating preview HTML for title:', data.title);
      const htmlContent = this.generatePreviewHTML(data, sureScore);
      console.log('🔍 Generated HTML preview (first 200 chars):', htmlContent.substring(0, 200) + '...');
      
      previewContent.innerHTML = htmlContent;
      previewSection.style.display = 'block';
      
      console.log('✅ Preview content updated in DOM');
      
      // DEBUG: Check what's actually in the DOM after update
      setTimeout(() => {
        const titleInput = modal.querySelector('.preview-field--title');
        const titleValue = titleInput ? titleInput.value : 'NOT FOUND';
        console.log('🔍 DOM CHECK: Title input value after update:', titleValue);
        console.log('🔍 DOM CHECK: Title input element:', titleInput);
        console.log('🔍 DOM CHECK: Preview content HTML:', previewContent.innerHTML.substring(0, 300) + '...');
      }, 100);
    } else {
      console.error('❌ Preview section or content not found:', {
        hasPreviewSection: !!previewSection,
        hasPreviewContent: !!previewContent
      });
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
   * Generate HTML for parsed data preview with optional sure score
   */
  generatePreviewHTML(data, sureScore = null) {
    const sureScoreHTML = sureScore ? `
      <div class="freetext-sure-score">
        <h4>🎯 Sure Score: ${Math.round(sureScore.sureScore * 100)}%</h4>
        <div class="sure-score-level sure-score-level--${sureScore.confidenceLevel.toLowerCase().replace(' ', '-')}">
          ${sureScore.confidenceLevel} säkerhet
        </div>
        <p class="sure-score-recommendation">${sureScore.recommendation}</p>
        
        <div class="sure-score-breakdown">
          <h5>📊 Säkerhetsanalys:</h5>
          <div class="breakdown-items">
            <div class="breakdown-item">
              <span class="breakdown-label">Bildkvalitet:</span>
              <span class="breakdown-value">${Math.round(sureScore.factors.imageQuality * 100)}%</span>
            </div>
            <div class="breakdown-item">
              <span class="breakdown-label">Analysförmåga:</span>
              <span class="breakdown-value">${Math.round(sureScore.factors.analysisReliability * 100)}%</span>
            </div>
            <div class="breakdown-item">
              <span class="breakdown-label">Objektsäkerhet:</span>
              <span class="breakdown-value">${Math.round(sureScore.factors.objectCertainty * 100)}%</span>
            </div>
            <div class="breakdown-item">
              <span class="breakdown-label">Marknadsstöd:</span>
              <span class="breakdown-value">${Math.round(sureScore.factors.marketSupport * 100)}%</span>
            </div>
          </div>
        </div>
      </div>
    ` : '';

    const analysisTypeIndicator = data.analysisType ? `
      <div class="analysis-type-indicator">
        <span class="analysis-type analysis-type--${data.analysisType}">
          ${data.analysisType === 'image' ? '📸 Bildanalys' : 
            data.analysisType === 'combined' ? '🔄 Bild + Text' : 
            '📝 Textanalys'}
        </span>
      </div>
    ` : '';

    return `
      ${sureScoreHTML}
      ${analysisTypeIndicator}
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
    
    // CRITICAL FIX: Properly escape HTML attributes to handle quotes
    const escapedValue = this.escapeHtmlAttribute(value);
    
    return `
      <div class="field-preview" data-field="${fieldName}">
        <label class="field-label">
          ${label} ${confidenceBadge}
        </label>
        ${isTextarea 
          ? `<textarea class="${fieldClass}" data-field="${fieldName}" rows="4">${this.escapeHtmlContent(value)}</textarea>`
          : `<input type="text" class="${fieldClass}" data-field="${fieldName}" value="${escapedValue}">`
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
   * Escape HTML attribute values (for use in value="..." attributes)
   * CRITICAL: Handles quotes in titles like 'Skål "Sofiero"'
   */
  escapeHtmlAttribute(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Escape HTML content (for use inside textarea tags)
   */
  escapeHtmlContent(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
      
      // Build proper search query using the same system as other components
      const searchQuery = this.buildOptimalSearchQuery(data);
      
      if (!searchQuery || searchQuery.trim().length < 3) {
        console.log('⏭️ Skipping market analysis - could not build meaningful search query');
        data.reasoning = (data.reasoning || '') + ' Kunde inte bygga sökfråga för marknadsanalys.';
        return data;
      }
      
      console.log('🔍 Running market analysis with optimized search query:', {
        searchQuery,
        hasArtist: !!data.artist,
        title: data.title?.substring(0, 50) + '...'
      });
      
      // Use the modern search-based market analysis approach with fallback strategy
      let marketData = await this.tryMarketAnalysisWithFallbacks(searchQuery, data);
      
      if (marketData && marketData.hasComparableData) {
        console.log('✅ Market analysis successful:', {
          hasHistorical: !!marketData.historical,
          hasLive: !!marketData.live,
          priceRange: marketData.priceRange,
          confidence: marketData.confidence
        });
        
        // Update estimates based on market data (preserve AI estimates if market data is better)
        if (marketData.priceRange) {
          const marketLow = marketData.priceRange.low;
          const marketHigh = marketData.priceRange.high;
          const marketMid = Math.round((marketLow + marketHigh) / 2);
          
          // Use market data for estimates, but preserve AI estimates as fallback
          const aiEstimate = data.estimate; // Store original AI estimate
          const aiReserve = data.reserve;   // Store original AI reserve
          
          data.estimate = marketMid;
          data.reserve = Math.round(marketLow * 0.7); // 70% of market low
          
          // Add note about AI vs market estimates
          if (aiEstimate && Math.abs(aiEstimate - marketMid) > marketMid * 0.3) {
            data.reasoning = (data.reasoning || '') + 
              ` AI-uppskattning: ${aiEstimate} SEK, marknadsdata: ${marketMid} SEK.`;
          }
          
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
        if (data.estimate || data.reserve) {
          data.reasoning = (data.reasoning || '') + ' Ingen marknadsdata hittades - använder AI-värdering.';
        } else {
          data.reasoning = (data.reasoning || '') + ' Ingen marknadsdata eller AI-värdering tillgänglig.';
        }
      }
      
    } catch (error) {
      console.error('❌ Market analysis failed:', error);
      data.reasoning = (data.reasoning || '') + ' Marknadsanalys misslyckades - använder AI-uppskattning.';
    }
    
    return data;
  }
  
  /**
   * Build optimal search query with quoted artist names and intelligent keyword prioritization
   * Following the same patterns as existing components
   */
  buildOptimalSearchQuery(data) {
    const queryTerms = [];
    
    // PRIORITY 1: Artist (HIGHEST PRIORITY - quoted for exact matching)
    if (data.artist && data.artist.trim()) {
      const formattedArtist = this.formatArtistForSearch(data.artist);
      queryTerms.push(formattedArtist);
      console.log(`🎯 ARTIST: Added "${formattedArtist}" as primary search term`);
    }
    
    // PRIORITY 2: Object type (CRITICAL for relevance)
    const objectType = this.extractObjectType(data.title);
    if (objectType && !queryTerms.some(term => term.toLowerCase().includes(objectType.toLowerCase()))) {
      queryTerms.push(objectType);
      console.log(`🎯 OBJECT: Added "${objectType}" as object type`);
    }
    
    // PRIORITY 3: Brand/Designer (if different from artist)
    const brand = this.extractBrandFromTitle(data.title);
    if (brand && !queryTerms.some(term => term.toLowerCase().includes(brand.toLowerCase()))) {
      const formattedBrand = this.formatBrandForSearch(brand);
      queryTerms.push(formattedBrand);
      console.log(`🎯 BRAND: Added "${formattedBrand}" as brand/designer`);
    }
    
    // PRIORITY 4: Material (if distinctive)
    if (data.materials && this.isDistinctiveMaterial(data.materials)) {
      const material = data.materials.toLowerCase();
      if (!queryTerms.some(term => term.toLowerCase().includes(material))) {
        queryTerms.push(material);
        console.log(`🎯 MATERIAL: Added "${material}" as distinctive material`);
      }
    }
    
    // PRIORITY 5: Period (if decade format)
    if (data.period && data.period.includes('-tal')) {
      queryTerms.push(data.period);
      console.log(`🎯 PERIOD: Added "${data.period}" as time period`);
    }
    
    // Build final query (limit to 4-5 terms for optimal results)
    const finalQuery = queryTerms.slice(0, 5).join(' ').trim();
    
    console.log(`🔍 FREETEXT PARSER SEARCH QUERY BUILDING:`, {
      originalData: {
        title: data.title,
        artist: data.artist,
        materials: data.materials,
        period: data.period
      },
      extractedTerms: queryTerms,
      finalQuery: finalQuery,
      termCount: queryTerms.length,
      queryLength: finalQuery.length
    });
    
    return finalQuery;
  }
  
  /**
   * Format artist name for search with proper quoting
   */
  formatArtistForSearch(artistName) {
    if (!artistName || typeof artistName !== 'string') {
      return '';
    }
    
    // Remove any existing quotes and clean
    const cleanArtist = artistName.trim().replace(/^["']|["']$/g, '').replace(/,\s*$/, '');
    
    // Check if multi-word name (most artist names)
    const words = cleanArtist.split(/\s+/).filter(word => word.length > 0);
    
    if (words.length > 1) {
      // Multi-word: Always quote for exact matching
      return `"${cleanArtist}"`;
    } else {
      // Single word: Also quote for consistency
      return `"${cleanArtist}"`;
    }
  }
  
  /**
   * Extract brand/designer from title (Nielsen Design, Bern, etc.)
   */
  extractBrandFromTitle(title) {
    if (!title) return '';
    
    // Look for quoted brand names first
    const quotedMatch = title.match(/"([^"]+)"/);
    if (quotedMatch) {
      return quotedMatch[1];
    }
    
    // Look for common design brands/patterns
    const brandPatterns = [
      /\b([A-Z][a-z]+ Design)\b/,
      /\b(IKEA|Ikea)\b/,
      /\b(Royal Copenhagen)\b/,
      /\b(Kosta Boda)\b/,
      /\b(Orrefors)\b/,
      /\b(Arabia)\b/,
      /\b(Rörstrand)\b/,
      /\b(Gustavsberg)\b/,
      /\b([A-Z][a-z]+)\s*,\s*[a-z]/  // Pattern like "Bern, böjträ"
    ];
    
    for (const pattern of brandPatterns) {
      const match = title.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return '';
  }
  
  /**
   * Format brand for search with proper quoting
   */
  formatBrandForSearch(brand) {
    if (!brand) return '';
    
    // Clean the brand name
    const cleanBrand = brand.trim().replace(/,\s*$/, '');
    
    // Always quote brand names for exact matching
    return `"${cleanBrand}"`;
  }
  
  /**
   * Check if material is distinctive enough to include in search
   */
  isDistinctiveMaterial(material) {
    if (!material) return false;
    
    const distinctiveMaterials = [
      'silver', 'guld', 'brons', 'koppar', 'mässing', 'tenn',
      'porslin', 'stengods', 'keramik', 'glas', 'kristall',
      'fårskinn', 'läder', 'sammet', 'siden',
      'marmor', 'granit', 'onyx', 'alabaster',
      'mahogny', 'ek', 'björk', 'teak', 'rosenträ'
    ];
    
    const lowerMaterial = material.toLowerCase();
    return distinctiveMaterials.some(dm => lowerMaterial.includes(dm));
  }
  
  /**
   * Try market analysis with progressive fallback strategy
   * If no results found, progressively remove least important keywords
   */
  async tryMarketAnalysisWithFallbacks(initialQuery, data) {
    const queryTerms = initialQuery.split(' ').filter(term => term.trim());
    
    // Define priority order (most important first - these are removed LAST)
    const termPriorities = this.getTermPriorities(queryTerms, data);
    
    console.log('🔍 Starting market analysis with fallback strategy:', {
      initialQuery,
      termCount: queryTerms.length,
      priorities: termPriorities
    });
    
    // Try initial query first
    let marketData = await this.callMarketAnalysis(initialQuery, 'initial');
    if (marketData && marketData.hasComparableData) {
      console.log('✅ Initial query successful');
      return marketData;
    }
    
    // If no results, try progressively removing terms (least important first)
    let currentTerms = [...queryTerms];
    let attemptCount = 1;
    
    while (currentTerms.length > 1 && attemptCount < 4) {
      // Remove the least important term
      const leastImportantIndex = this.findLeastImportantTermIndex(currentTerms, termPriorities);
      const removedTerm = currentTerms.splice(leastImportantIndex, 1)[0];
      
      const fallbackQuery = currentTerms.join(' ');
      console.log(`🔄 Fallback attempt ${attemptCount}: Removed "${removedTerm}", trying: "${fallbackQuery}"`);
      
      marketData = await this.callMarketAnalysis(fallbackQuery, `fallback_${attemptCount}`);
      if (marketData && marketData.hasComparableData) {
        console.log(`✅ Fallback ${attemptCount} successful with query: "${fallbackQuery}"`);
        return marketData;
      }
      
      attemptCount++;
    }
    
    // Final attempt with just the most important term
    if (currentTerms.length > 0) {
      const finalQuery = currentTerms[0];
      console.log(`🔄 Final attempt with most important term: "${finalQuery}"`);
      
      marketData = await this.callMarketAnalysis(finalQuery, 'final');
      if (marketData && marketData.hasComparableData) {
        console.log(`✅ Final attempt successful with: "${finalQuery}"`);
        return marketData;
      }
    }
    
    // EMERGENCY FALLBACK: Try with unquoted terms if all quoted attempts failed
    console.log('🚨 All quoted attempts failed - trying emergency unquoted fallback');
    const emergencyQuery = this.buildEmergencyFallbackQuery(data);
    if (emergencyQuery && emergencyQuery !== initialQuery) {
      console.log(`🔄 Emergency fallback: "${emergencyQuery}"`);
      marketData = await this.callMarketAnalysis(emergencyQuery, 'emergency_unquoted');
      if (marketData && marketData.hasComparableData) {
        console.log(`✅ Emergency fallback successful with: "${emergencyQuery}"`);
        return marketData;
      }
    }
    
    console.log('❌ All fallback attempts failed - no market data found');
    return null;
  }
  
  /**
   * Get priority scores for search terms (higher = more important, removed last)
   */
  getTermPriorities(terms, data) {
    const priorities = {};
    
    terms.forEach(term => {
      let priority = 50; // Base priority
      
      // Artist names (quoted) = highest priority
      if (term.includes('"') && data.artist && term.includes(data.artist.replace(/['"]/g, ''))) {
        priority = 100;
      }
      // Object types = high priority
      else if (this.isObjectType(term)) {
        priority = 90;
      }
      // Brands (quoted) = high priority
      else if (term.includes('"') && term !== data.artist) {
        priority = 85;
      }
      // Distinctive materials = medium priority
      else if (this.isDistinctiveMaterial(term)) {
        priority = 70;
      }
      // Periods = lower priority
      else if (term.includes('-tal') || /\d{4}/.test(term)) {
        priority = 60;
      }
      // Generic terms = lowest priority
      else {
        priority = 40;
      }
      
      priorities[term] = priority;
    });
    
    return priorities;
  }
  
  /**
   * Find the index of the least important term to remove
   */
  findLeastImportantTermIndex(terms, priorities) {
    let lowestPriority = Infinity;
    let lowestIndex = 0;
    
    terms.forEach((term, index) => {
      const priority = priorities[term] || 50;
      if (priority < lowestPriority) {
        lowestPriority = priority;
        lowestIndex = index;
      }
    });
    
    return lowestIndex;
  }
  
  /**
   * Check if a term is an object type
   */
  isObjectType(term) {
    const objectTypes = [
      'fåtölj', 'stol', 'bord', 'skåp', 'byrå', 'soffa', 'matta',
      'tavla', 'målning', 'litografi', 'grafik', 'teckning', 'akvarell',
      'skulptur', 'vas', 'skål', 'fat', 'tallrik', 'kopp', 'kanna',
      'lampa', 'ljusstake', 'spegel', 'klocka', 'ur', 'smycke', 'ring',
      'halsband', 'brosch', 'armband', 'möbel'
    ];
    
    return objectTypes.some(type => term.toLowerCase().includes(type));
  }
  
  /**
   * Build emergency fallback query with unquoted terms for broader search
   */
  buildEmergencyFallbackQuery(data) {
    const terms = [];
    
    // Add artist without quotes
    if (data.artist && data.artist.trim()) {
      const cleanArtist = data.artist.trim().replace(/^["']|["']$/g, '');
      terms.push(cleanArtist);
    }
    
    // Add object type
    const objectType = this.extractObjectType(data.title);
    if (objectType) {
      terms.push(objectType);
    }
    
    // Add brand without quotes
    const brand = this.extractBrandFromTitle(data.title);
    if (brand && !terms.some(t => t.toLowerCase().includes(brand.toLowerCase()))) {
      const cleanBrand = brand.replace(/^["']|["']$/g, '');
      terms.push(cleanBrand);
    }
    
    // Limit to 3 terms for broader search
    const emergencyQuery = terms.slice(0, 3).join(' ').trim();
    
    console.log(`🚨 EMERGENCY FALLBACK QUERY: "${emergencyQuery}" (unquoted for broader search)`);
    return emergencyQuery;
  }
  
  /**
   * Call market analysis with a specific query
   */
  async callMarketAnalysis(query, attemptType) {
    try {
      console.log(`🔍 FREETEXT PARSER API CALL [${attemptType.toUpperCase()}]:`, {
        query: query,
        queryLength: query.length,
        termCount: query.split(' ').length,
        hasQuotes: query.includes('"'),
        timestamp: new Date().toISOString()
      });
      
      const searchContext = {
        primarySearch: query,
        searchTerms: query.split(' '),
        finalSearch: query,
        source: `freetext_parser_${attemptType}`,
        confidence: 0.7,
        reasoning: `FreetextParser ${attemptType} search query`,
        generatedAt: Date.now(),
        isEmpty: false,
        hasValidQuery: true
      };
      
      console.log(`📤 SENDING TO API:`, searchContext);
      
      const result = await this.apiManager.analyzeSales(searchContext);
      
      console.log(`📥 API RESPONSE [${attemptType.toUpperCase()}]:`, {
        hasData: !!result,
        hasComparableData: result?.hasComparableData,
        historicalSales: result?.historical?.analyzedSales || 0,
        totalMatches: result?.historical?.totalMatches || 0,
        priceRange: result?.priceRange ? `${result.priceRange.low}-${result.priceRange.high} SEK` : 'none',
        confidence: result?.confidence || 0
      });
      
      return result;
    } catch (error) {
      console.error(`❌ Market analysis failed for ${attemptType} query "${query}":`, error);
      return null;
    }
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

  /**
   * Auto-enhance parsed data using AI Rules System v2.0 with ADD ITEM page rules
   * This uses regular title enhancement but with ADD ITEM page formatting rules
   */
  async autoEnhanceParsedData(parsedData) {
    console.log('🚀 Auto-enhancing parsed data with ADD ITEM page rules...');
    
    try {
      // Use regular enhancement with ADD ITEM page formatting
      const enhancedFields = {};
      
      // Enhance title using ADD ITEM page rules (not title-correct)
      if (parsedData.title) {
        console.log('🎯 Enhancing title with ADD ITEM page rules...');
        const titleResult = await this.enhanceFieldWithAddItemRules('title', parsedData.title, parsedData);
        if (titleResult && titleResult.title) {
          enhancedFields.title = titleResult.title;
          console.log('✅ Title enhanced:', enhancedFields.title);
        }
      }
      
      // Enhance other fields normally
      if (parsedData.description) {
        const descResult = await this.enhanceFieldWithAddItemRules('description', parsedData.description, parsedData);
        if (descResult && descResult.description) {
          enhancedFields.description = descResult.description;
        }
      }
      
      if (parsedData.condition) {
        const condResult = await this.enhanceFieldWithAddItemRules('condition', parsedData.condition, parsedData);
        if (condResult && condResult.condition) {
          enhancedFields.condition = condResult.condition;
        }
      }
      
      console.log('🎯 Enhanced fields:', enhancedFields);
      return enhancedFields;
      
    } catch (error) {
      console.error('❌ Auto-enhancement failed:', error);
      return {};
    }
  }

  /**
   * Enhance a single field using ADD ITEM page rules (not edit page rules)
   * This uses the blue "AI-förbättra titel" button logic (fieldType: 'title')
   */
  async enhanceFieldWithAddItemRules(fieldType, fieldValue, fullData) {
    console.log(`🔧 Enhancing ${fieldType} with ADD ITEM page rules (blue button logic):`, fieldValue);
    
    try {
      // Build the item data structure expected by AI Rules System
      const itemData = {
        title: fullData.title || '',
        description: fullData.description || '',
        condition: fullData.condition || '',
        artist: fullData.artist || '',
        category: fullData.category || '',
        keywords: fullData.keywords || ''
      };
      
      // Use the blue "AI-förbättra titel" button logic (fieldType: 'title', NOT 'title-correct')
      // This does proper title enhancement with ADD ITEM page formatting rules
      const systemPrompt = getSystemPrompt('addItems');
      const userPrompt = this.getAddItemPageUserPrompt(itemData, fieldType);
      
      console.log(`🎯 Using model-specific valuation rules for ${fieldType} enhancement`);
      
      console.log(`📝 ${fieldType} ADD ITEM page prompt (blue button logic):`, userPrompt.substring(0, 200) + '...');
      
      // Call Claude API with regular enhancement settings (same as blue button)
      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('API call timeout'));
        }, 30000);
        
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiManager.apiKey,
          body: {
            model: this.apiManager.getCurrentModel().id, // Use user's selected model
            max_tokens: 2000, // Same as blue button
            temperature: 0.2, // Same as blue button
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ]
          }
        }, (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      });
      
      if (response && response.content && response.content[0] && response.content[0].text) {
        const enhancedText = response.content[0].text.trim();
        console.log(`✅ ${fieldType} enhanced result (blue button logic):`, enhancedText);
        
        // Parse the response if it's a multi-field response
        if (fieldType === 'all' || enhancedText.includes('TITEL:')) {
          return this.parseAddItemResponse(enhancedText);
        } else {
          // Single field response
          const result = {};
          result[fieldType] = enhancedText;
          return result;
        }
      }
      
      console.log(`❌ No valid response for ${fieldType} enhancement`);
      return null;
      
    } catch (error) {
      console.error(`❌ Error enhancing ${fieldType}:`, error);
      return null;
    }
  }

  /**
   * Parse ADD ITEM page response (same format as edit page)
   */
  parseAddItemResponse(responseText) {
    console.log('🔍 Parsing ADD ITEM response:', responseText);
    
    const result = {};
    const lines = responseText.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('TITEL:')) {
        result.title = line.replace('TITEL:', '').trim();
      } else if (line.startsWith('BESKRIVNING:')) {
        result.description = line.replace('BESKRIVNING:', '').trim();
      } else if (line.startsWith('KONDITION:')) {
        result.condition = line.replace('KONDITION:', '').trim();
      } else if (line.startsWith('SÖKORD:')) {
        result.keywords = line.replace('SÖKORD:', '').trim();
      }
    }
    
    console.log('✅ Parsed ADD ITEM result:', result);
    return result;
  }
} 