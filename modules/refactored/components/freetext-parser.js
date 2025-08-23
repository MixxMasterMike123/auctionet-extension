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

// Note: AI Rules System v2.0 functions accessed via window.getAIRulesManager() 
// to ensure we use the singleton instance loaded in content.js

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
    this.selectedImages = new Map(); // Initialize image storage
    
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
      this.addFreetextButton();
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

    // Find the form container - be VERY specific to avoid feedback forms
    const formContainer = document.querySelector('form[action*="items"]') ||
                         document.querySelector('.item_form') ||
                         document.querySelector('#new_item') ||
                         document.querySelector('form:has(#item_title_sv)') ||
                         document.querySelector('#item_title_sv')?.closest('form') ||
                         document.querySelector('main') ||
                         document.body;
    
    console.log('🔍 Form container search results:', {
      'form[action*="items"]': !!document.querySelector('form[action*="items"]'),
      '.item_form': !!document.querySelector('.item_form'),
      '#new_item': !!document.querySelector('#new_item'),
      'form:has(#item_title_sv)': !!document.querySelector('form:has(#item_title_sv)'),
      '#item_title_sv closest form': !!document.querySelector('#item_title_sv')?.closest('form'),
      'main': !!document.querySelector('main'),
      'body': !!document.body,
      'selected': formContainer?.tagName,
      'selectedClass': formContainer?.className,
      'selectedId': formContainer?.id
    });

    console.log('🔍 Selected form container details:', {
      tagName: formContainer.tagName,
      className: formContainer.className,
      id: formContainer.id,
      action: formContainer.action || 'N/A',
      isVisible: formContainer.offsetHeight > 0,
      childrenCount: formContainer.children.length
    });
    
    if (!formContainer) {
      console.error('❌ Could not find form container for freetext button');
      return;
    }

    // Create the button following existing UI patterns
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'freetext-parser-container';
    // Simple, small CTA button
    buttonContainer.style.cssText = 'margin: 10px 0;';
    buttonContainer.innerHTML = `
      <button type="button" id="freetext-parser-btn" style="background: #007cba; color: white; border: none; border-radius: 4px; padding: 8px 16px; font-size: 14px; cursor: pointer;">
        Snabbkatalogisering
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
      
      // DEBUGGING: Check button visibility
      console.log('🔍 Button debugging:', {
        buttonExists: !!button,
        buttonVisible: button.offsetHeight > 0 && button.offsetWidth > 0,
        buttonDisplay: window.getComputedStyle(button).display,
        buttonVisibility: window.getComputedStyle(button).visibility,
        buttonOpacity: window.getComputedStyle(button).opacity,
        containerVisible: buttonContainer.offsetHeight > 0,
        containerDisplay: window.getComputedStyle(buttonContainer).display,
        parentElement: formContainer.tagName + '.' + formContainer.className,
        buttonPosition: button.getBoundingClientRect()
      });
    } else {
      console.error('❌ Failed to find freetext parser button after creation');
    }
  }

  /**
   * Auto-scroll to a specific section with highlight effect
   */
  scrollToSection(sectionId) {
    const modal = this.currentModal;
    if (!modal) return;

    const section = modal.querySelector(`#${sectionId}`);
    if (!section) return;

    // Remove previous highlights
    modal.querySelectorAll('.modal-section.highlighted').forEach(el => {
      el.classList.remove('highlighted');
    });

    // Add highlight to target section
    section.classList.add('highlighted');

    // Special handling for results section to show the title
    if (sectionId === 'results-section') {
      const sectionTitle = section.querySelector('.section-title');
      if (sectionTitle) {
        // Scroll to the title specifically, with some padding
        sectionTitle.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start',
          inline: 'nearest'
        });
        console.log(`📍 Auto-scrolled to section title: ${sectionId}`);
        return;
      }
    }

    // Default scroll behavior for other sections
    section.scrollIntoView({ 
      behavior: 'smooth', 
      block: 'start',
      inline: 'nearest'
    });

    console.log(`📍 Auto-scrolled to section: ${sectionId}`);
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
        
        // Initialize beautiful image upload and focus textarea
        setTimeout(() => {
          if (this.currentModal) {
            // Initialize beautiful image upload
            this.initializeBeautifulImageUpload();
            
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
          <h3>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style="display: inline-block; margin-right: 8px; vertical-align: text-bottom;">
              <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/>
              <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1m15.5-6.5l-4.24 4.24M7.76 16.24l-4.24 4.24M20.5 20.5l-4.24-4.24M7.76 7.76L3.52 3.52" stroke="currentColor" stroke-width="1.5"/>
            </svg>
            Snabbkatalogisering
          </h3>
          <p>Skriv all information du har om objektet - systemet analyserar och skapar katalogpost</p>
          <button class="popup-close" type="button">✕</button>
        </div>
        
        <div class="popup-content">
          <!-- Input Section -->
          <div id="input-section" class="modal-section">
            <div class="section-title">
              <div class="section-icon">📝</div>
              <span>Lägg till information</span>
            </div>
            <!-- Beautiful Image Upload Section -->
            <div class="image-upload-section">
              <div class="upload-header">
                <div class="upload-title">
                  📸 Bilder av objektet
                </div>
                <p class="upload-subtitle">Ladda upp bilder för bättre AI-analys • Max 5 bilder • JPG, PNG, WebP</p>
              </div>
              
              <div class="simple-upload-area" id="simple-upload-trigger">
                <div class="upload-icon">📷</div>
                <div class="upload-main-text">Klicka för att ladda upp bilder</div>
                <div class="upload-sub-text">eller dra och släpp här</div>
              </div>
              
              <div class="image-preview-grid" id="image-preview-grid" style="display: none;"></div>
              
              <div class="upload-status" id="upload-status">
                Inga bilder uppladdade • Bilder är valfria (AI kan analysera endast text)
              </div>
              
              <!-- Hidden file input -->
              <input type="file" id="hidden-file-input" multiple accept="image/*" style="display: none;">
            </div>
            
            <!-- Text Input -->
            <div class="text-section">
              <label for="freetext-input" class="freetext-label">
                <strong>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="display: inline-block; margin-right: 6px; vertical-align: text-bottom;">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.5"/>
                  <polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="1.5"/>
                  <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="1.5"/>
                  <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" stroke-width="1.5"/>
                </svg>
                Beskrivning av objektet (valfritt):
              </strong>
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
                <span class="mode-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1" stroke="currentColor" stroke-width="1.5"/>
                </svg>
              </span>
                <span class="mode-text">Lägg till bilder ELLER text (eller båda) för AI-analys</span>
              </div>
            </div>
          </div>
          
          <!-- Processing Section -->
          <div id="processing-section" class="modal-section ai-processing-section" style="display: none;">
            <div class="section-title">
              <div class="section-icon">⚡</div>
              <span>Analyserar</span>
            </div>
            <div class="processing-spinner"></div>
            <div class="processing-status">
              <p class="processing-step">Förbereder analys...</p>
              <div class="processing-progress">
                <div class="progress-bar">
                  <div class="progress-fill"></div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Results Section -->
          <div id="results-section" class="modal-section parsed-preview-section" style="display: none;">
            <div class="section-title">
              <div class="section-icon">✅</div>
              <span>AI-genererad katalogpost</span>
            </div>
            <div class="preview-content">
              <!-- Parsed data will be inserted here -->
            </div>
          </div>
        </div>
        
        <div class="modal-footer">
          <button class="btn btn--secondary" id="cancel-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="margin-right: 6px; vertical-align: text-bottom;">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Avbryt
          </button>
          <button class="btn btn--primary" id="analyze-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="margin-right: 6px; vertical-align: text-bottom;">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor"/>
            </svg>
            Analysera med AI
          </button>
          <button class="btn btn--success" id="apply-btn" style="display: none;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="margin-right: 6px; vertical-align: text-bottom;">
              <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Använd denna katalogpost
          </button>
          <button class="btn btn--primary" id="reanalyze-btn" style="display: none;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="margin-right: 6px; vertical-align: text-bottom;">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Förbättra analys
          </button>
          <button class="btn btn--warning" id="restart-btn" style="display: none;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="margin-right: 6px; vertical-align: text-bottom;">
              <path d="M3 12a9 9 0 019-9 9.75 9.75 0 016.74 2.74L21 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M21 3v5h-5M21 12a9 9 0 01-9 9 9.75 9.75 0 01-6.74-2.74L3 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M8 16l-5 5v-5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Starta om
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

    // Re-analyze button (preserves input data)
    const reanalyzeBtn = modal.querySelector('#reanalyze-btn');
    if (reanalyzeBtn) {
      reanalyzeBtn.addEventListener('click', () => this.goBackToInput());
    }

    // Restart button (full reset)
    const restartBtn = modal.querySelector('#restart-btn');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => this.restartAnalysis());
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
   * Close modal and reset all state for fresh start
   */
  closeModal() {
    console.log('🔄 Closing modal and resetting all state...');
    
    if (this.currentModal) {
      // Clean up escape key listener
      if (this.currentModal._escapeHandler) {
        document.removeEventListener('keydown', this.currentModal._escapeHandler);
      }
      
      // Remove modal from DOM
      this.currentModal.remove();
      this.currentModal = null;
    }
    
    // Reset all internal state for fresh start
    this.parsedData = null;
    this.currentSureScore = null;
    this.currentMarketData = null;
    this.isProcessing = false;
    
    // Clear selected images
    if (this.selectedImages) {
      this.selectedImages.clear();
    }
    
    // Reset image analyzer state
    if (this.imageAnalyzer) {
      this.imageAnalyzer.currentImages.clear();
      this.imageAnalyzer.isProcessing = false;
      this.imageAnalyzer.analysisResult = null;
    }
    
    console.log('✅ Modal closed and all state reset for fresh start');
  }

  /**
   * Enforce minimum reserve price (400 SEK business rule)
   */
  enforceMinimumReserve(reservePrice) {
    const MINIMUM_RESERVE_SEK = 400; // Business rule: minimum bevakning 400 SEK
    
    if (!reservePrice || reservePrice < MINIMUM_RESERVE_SEK) {
      console.log(`🏛️ Enforcing minimum reserve: ${reservePrice || 0} SEK → ${MINIMUM_RESERVE_SEK} SEK`);
      return MINIMUM_RESERVE_SEK;
    }
    
    return reservePrice;
  }

  /**
   * Go back to input section while preserving existing data for re-analysis
   */
  goBackToInput() {
    console.log('🔄 Going back to input section - preserving existing data...');
    
    if (!this.currentModal) return;
    
    // Reset only analysis state, preserve input data
    this.parsedData = null;
    this.currentSureScore = null;
    this.currentMarketData = null;
    this.isProcessing = false;

    // Hide all sections except input
    const sections = this.currentModal.querySelectorAll('.modal-section');
    sections.forEach(section => {
      section.style.display = 'none';
    });
    
    // Show input section
    const inputSection = this.currentModal.querySelector('#input-section');
    if (inputSection) {
      inputSection.style.display = 'block';
    }
    
    // Update buttons for input mode
    const analyzeBtn = this.currentModal.querySelector('#analyze-btn');
    const applyBtn = this.currentModal.querySelector('#apply-btn');
    const reanalyzeBtn = this.currentModal.querySelector('#reanalyze-btn');
    const restartBtn = this.currentModal.querySelector('#restart-btn');
    
    if (analyzeBtn) {
      analyzeBtn.style.display = 'inline-block';
      analyzeBtn.disabled = false; // Re-enable the button
    }
    if (applyBtn) applyBtn.style.display = 'none';
    if (reanalyzeBtn) reanalyzeBtn.style.display = 'none';
    if (restartBtn) restartBtn.style.display = 'none';
    
    // Update modal header to show that user can add more info
    const headerP = this.currentModal.querySelector('.popup-header p');
    if (headerP) {
      headerP.textContent = 'Lägg till mer information för en förbättrad analys';
      headerP.style.color = '#2563eb';
      headerP.style.fontWeight = '500';
    }
    
    // Focus on text area to encourage adding more information
    const textarea = this.currentModal.querySelector('#freetext-input');
    if (textarea) {
      textarea.focus();
      // Place cursor at end of existing text
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
    
    // Update analysis mode indicator to refresh button state
    this.updateAnalysisModeIndicator(this.currentModal);
    
    console.log('✅ Returned to input section with preserved data');
  }

  /**
   * Restart analysis - reset to input section with fresh state
   */
  restartAnalysis() {
    console.log('🔄 Restarting analysis - resetting to input section...');
    
    if (!this.currentModal) return;
    
    // Reset all internal state
    this.parsedData = null;
    this.currentSureScore = null;
    this.currentMarketData = null;
    this.isProcessing = false;
    
    // Clear selected images
    if (this.selectedImages) {
      this.selectedImages.clear();
    }
    
    // Reset image analyzer state
    if (this.imageAnalyzer) {
      this.imageAnalyzer.currentImages.clear();
      this.imageAnalyzer.isProcessing = false;
      this.imageAnalyzer.analysisResult = null;
    }
    
    // Clear all form inputs
    const textarea = this.currentModal.querySelector('#freetext-input');
    if (textarea) {
      textarea.value = '';
    }
    
    // Clear image previews
    const imagePreviewGrid = this.currentModal.querySelector('#image-preview-grid');
    if (imagePreviewGrid) {
      imagePreviewGrid.innerHTML = '';
      imagePreviewGrid.style.display = 'none';
    }
    
    // Reset upload status
    const uploadStatus = this.currentModal.querySelector('#upload-status');
    if (uploadStatus) {
      uploadStatus.textContent = 'Inga bilder uppladdade • Bilder är valfria (AI kan analysera endast text)';
    }
    
    // Show upload area again
    const uploadArea = this.currentModal.querySelector('.simple-upload-area');
    if (uploadArea) {
      uploadArea.style.display = 'block';
    }
    
    // Hide all sections except input
    const sections = this.currentModal.querySelectorAll('.modal-section');
    sections.forEach(section => {
      section.style.display = 'none';
    });
    
    // Show input section
    const inputSection = this.currentModal.querySelector('#input-section');
    if (inputSection) {
      inputSection.style.display = 'block';
    }
    
    // Hide action buttons
    const applyBtn = this.currentModal.querySelector('#apply-btn');
    const reanalyzeBtn = this.currentModal.querySelector('#reanalyze-btn');
    const restartBtn = this.currentModal.querySelector('#restart-btn');
    if (applyBtn) applyBtn.style.display = 'none';
    if (reanalyzeBtn) reanalyzeBtn.style.display = 'none';
    if (restartBtn) restartBtn.style.display = 'none';
    
    // Show and re-enable analyze button
    const analyzeBtn = this.currentModal.querySelector('#analyze-btn');
    if (analyzeBtn) {
      analyzeBtn.style.display = 'inline-block';
      analyzeBtn.disabled = false; // Re-enable the button
    }
    
    // Reset modal header to original text
    const headerP = this.currentModal.querySelector('.popup-header p');
    if (headerP) {
      headerP.textContent = 'Skriv all information du har om objektet - systemet analyserar och skapar katalogpost';
      headerP.style.color = '';
      headerP.style.fontWeight = '';
    }
    
    // Scroll back to input section
    this.scrollToSection('input-section');
    
    console.log('✅ Analysis restarted - ready for fresh input');
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
      analyzeBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="margin-right: 6px;">
          <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/>
          <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        Analysera fritext med AI
      `;
    });

    imageTab.addEventListener('click', () => {
      this.switchToTab('image', modal);
      analyzeBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="margin-right: 6px;">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
          <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1.5"/>
          <path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        Analysera bild med AI
      `;
    });

    multipleImagesTab.addEventListener('click', () => {
      this.switchToTab('multiple-images', modal);
      analyzeBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="margin-right: 6px;">
          <rect x="2" y="2" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/>
          <rect x="14" y="2" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/>
          <rect x="2" y="14" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/>
          <rect x="14" y="14" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        Analysera flera bilder med AI
      `;
    });

    combinedTab.addEventListener('click', () => {
      this.switchToTab('combined', modal);
      analyzeBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="margin-right: 6px;">
          <path d="M4.5 16.5c-1.5 1.5-1.5 4.5 0 6s4.5 1.5 6 0l1-1" stroke="currentColor" stroke-width="1.5"/>
          <path d="M14.5 7.5c1.5-1.5 1.5-4.5 0-6s-4.5-1.5-6 0l-1 1" stroke="currentColor" stroke-width="1.5"/>
          <path d="M8 12l8-8" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        Analysera bild + text med AI
      `;
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
              console.log('[IMAGES] Images updated:', imagesMap?.size || 0, 'images');
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
    
    // Always ensure button is enabled when updating mode
    analyzeBtn.disabled = false;
    
    const hasImages = this.selectedImages && this.selectedImages.size > 0;
    const hasText = textarea && textarea.value.trim().length > 0;
    
    const modeIcon = indicator.querySelector('.mode-icon');
    const modeText = indicator.querySelector('.mode-text');
    
    if (hasImages && hasText) {
      // Combined analysis
      modeIcon.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M4.5 16.5c-1.5 1.5-1.5 4.5 0 6s4.5 1.5 6 0l1-1" stroke="currentColor" stroke-width="1.5"/>
          <path d="M14.5 7.5c1.5-1.5 1.5-4.5 0-6s-4.5-1.5-6 0l-1 1" stroke="currentColor" stroke-width="1.5"/>
          <path d="M8 12l8-8" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      `;
      modeText.textContent = `Redo för kombinerad analys: ${this.selectedImages.size} bilder + text`;
      analyzeBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="margin-right: 6px;">
          <path d="M4.5 16.5c-1.5 1.5-1.5 4.5 0 6s4.5 1.5 6 0l1-1" stroke="currentColor" stroke-width="1.5"/>
          <path d="M14.5 7.5c1.5-1.5 1.5-4.5 0-6s-4.5-1.5-6 0l-1 1" stroke="currentColor" stroke-width="1.5"/>
          <path d="M8 12l8-8" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        Analysera bilder + text med AI
      `;
      indicator.className = 'analysis-mode-indicator mode-combined';
    } else if (hasImages) {
      // Image-only analysis
      modeIcon.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
          <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1.5"/>
          <path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      `;
      modeText.textContent = `Redo för bildanalys: ${this.selectedImages.size} bilder`;
      analyzeBtn.innerHTML = this.selectedImages.size > 1 ? `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="margin-right: 6px;">
          <rect x="2" y="2" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/>
          <rect x="14" y="2" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/>
          <rect x="2" y="14" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/>
          <rect x="14" y="14" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        Analysera flera bilder med AI
      ` : `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="margin-right: 6px;">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/>
          <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" stroke-width="1.5"/>
          <path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        Analysera bild med AI
      `;
      indicator.className = 'analysis-mode-indicator mode-images';
    } else if (hasText) {
      // Text-only analysis
      modeIcon.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.5"/>
          <polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="1.5"/>
          <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="1.5"/>
          <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      `;
      modeText.textContent = 'Redo för textanalys';
      analyzeBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="margin-right: 6px;">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.5"/>
          <polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="1.5"/>
          <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="1.5"/>
          <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        Analysera text med AI
      `;
      indicator.className = 'analysis-mode-indicator mode-text';
    } else {
      // No input
      modeIcon.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/>
          <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1" stroke="currentColor" stroke-width="1.5"/>
        </svg>
      `;
      modeText.textContent = 'Fyll i bilder och/eller text för AI-analys';
      analyzeBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="margin-right: 6px;">
          <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/>
          <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        Analysera med AI
      `;
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
    
    // Auto-scroll to processing section when analysis starts
    setTimeout(() => this.scrollToSection('processing-section'), 300);

    // Determine processing method based on available inputs
    const textarea = this.currentModal.querySelector('#freetext-input');
    const hasText = textarea && textarea.value.trim().length > 0;
    const hasImages = this.selectedImages && this.selectedImages.size > 0;
    
    console.log('🔍 Input analysis:', {
      hasText,
      hasImages,
      imageCount: this.selectedImages?.size || 0,
      textLength: textarea?.value?.trim()?.length || 0,
      selectedImagesType: typeof this.selectedImages,
      selectedImagesExists: !!this.selectedImages,
      textareaExists: !!textarea,
      textareaValue: textarea?.value?.substring(0, 50) + '...'
    });

    if (!hasText && !hasImages) {
      this.showError('Vänligen lägg till ANTINGEN bilder ELLER text (eller båda) för AI-analys.');
      return;
    }

    try {
      this.isProcessing = true;
      
      // Show dynamic processing state based on analysis type
      let processingTitle, processingDescription;
      if (hasImages && hasText) {
        processingTitle = 'Analyserar bilder + text...';
        processingDescription = 'Kombinerar visuell och textbaserad analys för bästa resultat';
      } else if (hasImages) {
        const imageCount = this.selectedImages?.size || 0;
        if (imageCount > 1) {
          processingTitle = 'Analyserar flera bilder...';
          processingDescription = `Analyserar ${imageCount} bilder för komplett objektbedömning`;
        } else {
          processingTitle = 'Analyserar bild...';
          processingDescription = 'Extraherar objektinformation från bildanalys';
        }
      } else {
        processingTitle = 'Analyserar fritext...';
        processingDescription = 'Extraherar strukturerad data från fritext';
      }
      
      this.showProcessingState(processingTitle, processingDescription);

      let analysisResult;
      let sureScore;

      if (hasImages && hasText) {
        // Combined analysis
        console.log('[ANALYSIS] Running combined image + text analysis');
        analysisResult = await this.processCombinedImageAndText();
      } else if (hasImages) {
        // Image-only analysis
        console.log('[ANALYSIS] Running image-only analysis');
        analysisResult = await this.processImageOnly();
      } else {
        // Text-only analysis
        console.log('[ANALYSIS] Running text-only analysis');
        analysisResult = await this.processTextOnly();
      }

      // Calculate sure score and market validation (non-blocking)
      console.log('[ANALYSIS] Calculating Sure Score and market validation...');
      let marketData = null;
      try {
        marketData = await this.imageAnalyzer.validateWithMarketData(analysisResult);
      } catch (error) {
        console.warn('⚠️ Market validation failed, continuing without market data:', error);
      }
      sureScore = this.imageAnalyzer.calculateSureScore(analysisResult, marketData);

      // Apply conservative scaling based on market support percentage
      if ((analysisResult.estimate || analysisResult.reserve)) {
        // Use market support percentage if available, otherwise default to 60% for text-only
        const marketSupportPercentage = sureScore.marketSupportPercentage !== undefined 
          ? sureScore.marketSupportPercentage 
          : 60; // Default for text-only analysis
        const scalingResult = this.imageAnalyzer.applyConservativeScaling(
          analysisResult.estimate,
          analysisResult.reserve,
          marketSupportPercentage
        );
        
        // Update estimates with conservative scaling
        if (scalingResult.estimate !== null) analysisResult.estimate = scalingResult.estimate;
        if (scalingResult.reserve !== null) analysisResult.reserve = scalingResult.reserve;
        
        // Override confidence level if market support is low
        if (scalingResult.confidenceLevel && marketSupportPercentage < 70) {
          sureScore.confidenceLevel = scalingResult.confidenceLevel;
        }
        
        // Add scaling info to reasoning
        if (scalingResult.reasoning) {
          analysisResult.reasoning = (analysisResult.reasoning || '') + ' ' + scalingResult.reasoning;
        }
        
        console.log('🎯 Conservative scaling applied to estimates:', {
          marketSupport: marketSupportPercentage + '%',
          multiplier: scalingResult.multiplier,
          originalConfidence: sureScore.confidenceLevel,
          adjustedConfidence: scalingResult.confidenceLevel
        });
      }

      // Final safety check: Enforce minimum reserve even if no scaling was applied
      if (analysisResult.reserve) {
        analysisResult.reserve = this.enforceMinimumReserve(analysisResult.reserve);
      }

      // Store results
      this.parsedData = analysisResult;
      this.currentSureScore = sureScore;
      this.currentMarketData = marketData;

      // Show results
      console.log('🔍 PRICE ESTIMATE DEBUG - Final analysisResult:', {
        hasEstimate: !!analysisResult.estimate,
        estimateValue: analysisResult.estimate,
        hasReserve: !!analysisResult.reserve,
        reserveValue: analysisResult.reserve,
        marketSupport: (sureScore.marketSupportPercentage || marketSupportPercentage) + '%'
      });
      this.showParsedPreview(analysisResult, sureScore);
      console.log('✅ Analysis completed successfully');
      
      // Auto-scroll to results section when analysis completes
      setTimeout(() => this.scrollToSection('results-section'), 500);

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
          console.log('[TEXT] Processing text-only input...');
    
    const textarea = this.currentModal.querySelector('#freetext-input');
    const freetext = textarea.value.trim();

          console.log('[TEXT] Freetext validation:', {
      hasTextarea: !!textarea,
      freetextLength: freetext?.length || 0,
      freetext: freetext?.substring(0, 100) + '...'
    });

    // Note: Text validation already done in main processFreetextWithAI method
    // This method is only called when hasText is true

    // Validate that this looks like auction item text, not console logs or debug info
    if (freetext.includes('✅') || freetext.includes('🔴') || freetext.includes('console.log') || 
        freetext.includes('FreetextParser') || freetext.includes('.js:') || 
        freetext.includes('freetext-parser.js') || freetext.includes('add-items-integration-manager.js')) {
      throw new Error('Fritexten verkar innehålla debug-information. Vänligen ange riktig auktionstext för att analysera.');
    }

          console.log('[AI] Starting text analysis:', freetext.substring(0, 100) + '...');

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
          console.log('[IMAGE] Processing image-only input...');
    
    // Note: Image validation already done in main processFreetextWithAI method
    // This method is only called when hasImages is true

          console.log('[AI] Starting image analysis:', this.selectedImages.size, 'images');
    
    // Analyze images using AIImageAnalyzer component
    let imageAnalysis;
    if (this.selectedImages.size === 1) {
      // Single image analysis
      const singleImageData = Array.from(this.selectedImages.values())[0];
      console.log('🔍 Single image data structure:', singleImageData);
      console.log('🔍 File object details:', {
        file: singleImageData.file,
        fileName: singleImageData.file?.name,
        fileType: singleImageData.file?.type,
        fileSize: singleImageData.file?.size,
        hasFile: !!singleImageData.file
      });
      imageAnalysis = await this.imageAnalyzer.analyzeImage(singleImageData.file);
    } else {
      // Multiple images analysis
      // First, populate the AIImageAnalyzer's currentImages from our selectedImages
      this.imageAnalyzer.currentImages.clear();
      let categoryIndex = 0;
      const categoryIds = ['front', 'back', 'markings', 'signature', 'condition'];
      
      for (const [imageId, imageData] of this.selectedImages) {
        const categoryId = categoryIds[categoryIndex] || 'condition';
        const categoryObject = this.imageAnalyzer.config.imageCategories.find(cat => cat.id === categoryId);
        
        // Store the file with proper category reference
        this.imageAnalyzer.currentImages.set(categoryId, imageData.file);
        
        categoryIndex++;
      }
      
      console.log('🔍 Populated currentImages for image-only multiple analysis:', {
        currentImagesSize: this.imageAnalyzer.currentImages.size,
        categories: Array.from(this.imageAnalyzer.currentImages.keys())
      });
      
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

          console.log('[AI] Starting combined analysis:', {
      imageCount: this.selectedImages.size,
      hasAdditionalText: !!additionalText,
      additionalTextLength: additionalText.length
    });

    // Analyze images with additional text context
    let imageAnalysis;
    if (this.selectedImages.size === 1) {
      // Single image analysis with text context
      const singleImageData = Array.from(this.selectedImages.values())[0];
      console.log('🔍 Combined analysis - image data:', singleImageData);
      console.log('🔍 Combined analysis - file object:', {
        file: singleImageData.file,
        fileName: singleImageData.file?.name,
        fileType: singleImageData.file?.type,
        hasFile: !!singleImageData.file
      });
      imageAnalysis = await this.imageAnalyzer.analyzeImage(singleImageData.file, additionalText);
    } else {
      // Multiple images analysis with text context
      // First, populate the AIImageAnalyzer's currentImages from our selectedImages
      this.imageAnalyzer.currentImages.clear();
      let categoryIndex = 0;
      const categoryIds = ['front', 'back', 'markings', 'signature', 'condition'];
      
      for (const [imageId, imageData] of this.selectedImages) {
        const categoryId = categoryIds[categoryIndex] || 'condition';
        this.imageAnalyzer.currentImages.set(categoryId, imageData.file);
        categoryIndex++;
      }
      
      console.log('🔍 Populated currentImages for multiple analysis:', {
        currentImagesSize: this.imageAnalyzer.currentImages.size,
        categories: Array.from(this.imageAnalyzer.currentImages.keys())
      });
      
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
      // Use AI Rules System v2.0 for text enhancement
      const aiRules = window.getAIRulesManager();
      const builtPrompt = aiRules.buildPrompt({
        type: 'textEnhancement',
        fields: ['all']
      });

      const enhancementPrompt = `${builtPrompt.userPrompt}
        
        BILDANALYS:
        Titel: ${imageData.title}
        Beskrivning: ${imageData.description}
        Skick: ${imageData.condition}
        Konstnär: ${imageData.artist || 'Ej identifierad'}
        Material: ${imageData.materials}
        
        TILLÄGGSTEXT FRÅN ANVÄNDARE:
        "${additionalText}"
        
        Använd tilläggstext för att förbättra och komplettera bildanalysen enligt AI Rules System v2.0 regler.
        
        Returnera förbättrad data i exakt detta JSON-format:
        {
          "title": "titel enligt AI Rules System fieldRules",
          "description": "förbättrad beskrivning här",
          "condition": "förbättrat skick här",
          "artist": "konstnär eller null",
          "keywords": "sökord enligt AI Rules System fieldRules",
          "materials": "material/teknik",
          "period": "tidsperiod",
          "estimate": 500,
          "reserve": 300,
          "reasoning": "kort förklaring av förbättringarna"
        }
      `;

      // Call AI to enhance with text context  
      const systemPrompt = window.getAIRulesManager().getSystemPrompt('textEnhancement') || this.getEditPageSystemPrompt();
      
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

    const aiRules = window.getAIRulesManager();
    const systemPrompt = aiRules.getSystemPrompt('freetextParser') || aiRules.getSystemPrompt('core');
    const categoryPrompt = aiRules.getCategoryPrompt('freetextParser');
    const brandCorrections = aiRules.getBrandCorrections();
    const artistCorrections = aiRules.getBrandCorrections();
    const keywordRules = aiRules.getFieldRules('keywords');
    
    console.log('✅ Using AI Rules System v2.0:', {
      hasSystemPrompt: !!systemPrompt,
      hasCategoryPrompt: !!categoryPrompt,
      brandCorrectionsCount: Object.keys(brandCorrections || {}).length,
      artistCorrectionsCount: Object.keys(artistCorrections || {}).length
    });

    // Get model-specific valuation rules from AI Rules System v2.0
    const currentModel = this.apiManager.getCurrentModel().id;
    const valuationRules = window.getAIRulesManager().getModelSpecificValuationRules('freetextParser', currentModel);
    
          console.log('[RULES] Using model-specific valuation rules:', {
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
      valuationContext = `\n\nVÄRDERINGSKONTEXT FÖR CLAUDE 4:
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
      reasoningInstructions = `\n\nAVANCERAD ANALYS (Claude 4 Deep Reasoning):
Utför djupgående analys i flera steg:

1. OBJEKTIDENTIFIERING:
• Identifiera exakt föremålstyp, märke, modell
• Analysera stilperiod och designerepok
• Bedöm materialens kvalitet och äkthet
• Notera unika kännetecken och signaturer

2. KONDITIONSBEDÖMNING:
• Analysera synligt slitage och skador
• Bedöm originalitet vs restaurering
• Värdera kompletthet (alla delar kvar?)
• Uppskatta servicehistorik om relevant

3. MARKNADSKONTEXTUALISERING:
• Jämför med liknande objekt på svenska auktioner
• Analysera efterfrågan för denna typ/märke
• Överväg regional marknadsdynamik (Sundsvall)
• Bedöm säsongsvariationer och trender

4. VÄRDERINGSLOGIK:
• Basera på faktiska slutpriser (inte utrop)
• Justera för kondition och sällsynthet
• Inkludera proveniensbonus om relevant
• Balansera optimism med realism`;
    }

    // Build keyword rules from centralized system
    const keywordInstructions = keywordRules ? `
SÖKORD-REGLER (AI Rules System v2.0):
• Format: ${keywordRules.format === 'space-separated' ? 'Separera med MELLANSLAG (ALDRIG kommatecken)' : 'Använd kommatecken'}
• ${keywordRules.hyphenateMultiWord ? 'Använd "-" för flerordsfraser: "svensk-design", "1970-tal"' : 'Inga bindestreck'}
• ${keywordRules.complementaryOnly ? 'Endast KOMPLETTERANDE sökord som INTE redan finns i titel/beskrivning' : 'Alla relevanta sökord'}
• ${keywordRules.avoidDuplication ? 'UNDVIK alla upprepningar från titel/beskrivning' : 'Upprepningar tillåtna'}
• Max ${keywordRules.maxTerms || 12} termer
` : '';

    // Use AI Rules System v2.0 to build the complete prompt
    const builtPrompt = aiRules.buildPrompt({
      type: 'freetextParser',
      fields: ['freetextParser']
    });
    
    const userPrompt = `${builtPrompt.userPrompt}

FRITEXT:
"${freetext}"${reasoningInstructions}
${keywordInstructions}
Returnera data i exakt detta JSON-format:
{
  "title": "titel enligt AI Rules System fieldRules",
  "description": "beskrivning enligt AI Rules System fieldRules", 
  "condition": "kondition enligt AI Rules System fieldRules",
  "artist": "konstnär om identifierad, annars null",
  "keywords": "sökord enligt AI Rules System fieldRules",
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
  "reasoning": "kort förklaring på svenska"
}

INSTRUKTIONER:
- Följ AI Rules System v2.0 fieldRules för alla fält
- estimate/reserve ska vara numeriska värden i SEK  
- confidence-värden mellan 0.0-1.0
- shouldDisposeIfUnsold: true endast om fritexten nämner skänkning/återvinning
- ${valuationRules.instruction}${valuationContext}`;

    try {
      console.log('[API] Making AI API call with:', {
        hasApiKey: !!this.apiManager.apiKey,
        apiKeyLength: this.apiManager.apiKey?.length,
        freetextLength: freetext.length
      });

      // Call AI API directly using Chrome runtime messaging (same pattern as other components)
      const response = await new Promise((resolve, reject) => {
        console.log('[API] Sending Chrome runtime message for AI parsing...');
        
        // Add timeout to catch hanging requests
        const timeout = setTimeout(() => {
          console.error('⏰ Chrome runtime message timeout after 30 seconds');
          reject(new Error('API request timeout - no response from background script'));
        }, 30000);
        
        // Use model-specific parameters for enhanced analysis
        const maxTokens = valuationRules.maxTokens || 2000;
        const temperature = valuationRules.temperature || 0.1;
        
        console.log('[API] Enhanced AI parameters:', {
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
          console.log('[API] Chrome runtime response received:', response);
          
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
        
                  console.log('[API] Chrome runtime message sent, waiting for response...');
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
          console.log('[ENHANCE] Auto-enhancing fields with EXACT edit page logic...');
    
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

      console.log('[ENHANCE] Using ADD ITEM page enhancement logic:', {
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
    const valuationRules = window.getAIRulesManager().getModelSpecificValuationRules('freetextParser', currentModel);
    
    // For Claude 4, add extra context about realistic pricing based on your data
    let valuationContext = '';
    if (currentModel === 'claude-4-sonnet') {
      valuationContext = `\n\nVÄRDERINGSKONTEXT FÖR CLAUDE 4:
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

KRITISKA ADD ITEM TITEL-FORMATERINGSREGLER:
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
    // Handle both Swedish and English field names
    // DEBUG: Check raw estimate values from AI
    console.log('🔍 RAW ESTIMATE VALUES from AI:', {
      estimate: data.estimate,
      värdering: data.värdering,
      reserve: data.reserve,
      utrop: data.utrop,
      estimateType: typeof data.estimate,
      fullData: data
    });

    const normalized = {
      title: data.title || data.titel || '',
      description: data.description || data.beskrivning || '',
      condition: data.condition || data.skick || '',
      artist: (data.artist === 'Ej identifierad' || data.konstnär === 'Ej identifierad') ? null : (data.artist || data.konstnär || null),
      keywords: data.keywords || data.nyckelord || '',
      materials: data.materials || data.material || '',
      period: data.period || data.årtal || '',
      estimate: this.parseNumericValue(data.estimate || data.värdering),
      reserve: this.parseNumericValue(data.reserve || data.utrop),
      shouldDisposeIfUnsold: Boolean(data.shouldDisposeIfUnsold),
      confidence: {
        title: this.normalizeConfidence(data.confidence?.title),
        description: this.normalizeConfidence(data.confidence?.description),
        condition: this.normalizeConfidence(data.confidence?.condition),
        artist: this.normalizeConfidence(data.confidence?.artist),
        estimate: this.normalizeConfidence(data.confidence?.estimate)
      },
      reasoning: data.reasoning || data.motivering || ''
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
  showProcessingState(title = 'Analyserar...', description = 'Extraherar strukturerad data') {
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
    // DIRECT ACCESS: Use window.getAIRulesManager() instead of global function
    const aiRulesManager = window.getAIRulesManager();
    const valuationRules = aiRulesManager.getModelSpecificValuationRules('freetextParser', currentModel);
    const isAdvancedModel = valuationRules.enableDeepReasoning;

    if (isAdvancedModel) {
      return [
                  { 
            icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.5"/><path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.5"/></svg>', 
            text: 'Identifierar objekt och märke...', 
            duration: 2000 
          },
          { 
            icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-5 0V4.5A2.5 2.5 0 0 1 9.5 2z" stroke="currentColor" stroke-width="1.5"/><path d="M14.5 8.5a2.5 2.5 0 0 1 5 0v11a2.5 2.5 0 0 1-5 0v-11z" stroke="currentColor" stroke-width="1.5"/></svg>', 
            text: 'Analyserar stilperiod och äkthet...', 
            duration: 2500 
          },
        { 
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" stroke-width="1.5"/><line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" stroke-width="1.5"/></svg>', 
          text: 'Undersöker marknadsdata...', 
          duration: 3000 
        },
        { 
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" stroke-width="1.5"/></svg>', 
          text: 'Beräknar marknadsvärde...', 
          duration: 2000 
        },
        { 
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/><path d="M12 1v6m0 6v6m11-7h-6m-6 0H1" stroke="currentColor" stroke-width="1.5"/></svg>', 
          text: 'Optimerar katalogisering...', 
          duration: 1500 
        },
                 { 
           icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>', 
           text: 'Slutför expertanalys...', 
           duration: 1000 
         }
      ];
    } else {
      return [
                  { 
            icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.5"/><path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.5"/></svg>', 
            text: 'Analyserar innehåll...', 
            duration: 1500 
          },
        { 
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.5"/><polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="1.5"/><line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="1.5"/></svg>', 
          text: 'Extraherar strukturerad data...', 
          duration: 2000 
        },
        { 
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" stroke-width="1.5"/></svg>', 
          text: 'Beräknar värdering...', 
          duration: 1500 
        },
                                     { 
             icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>', 
             text: 'Slutför analys...', 
             duration: 1000 
           }
      ];
    }
  }

  /**
   * Generate advanced processing HTML with cool animations
   */
  generateAdvancedProcessingHTML() {
    const currentModel = this.apiManager.getCurrentModel().id;
    const valuationRules = window.getAIRulesManager().getModelSpecificValuationRules('freetextParser', currentModel);
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
            ${isAdvancedModel ? 'Claude 4 Expertanalys' : 'AI-analys pågår'}
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
                                  <div class="status-pending">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                    </svg>
                  </div>
                  <div class="status-active">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="3" fill="currentColor"/>
                      <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"/>
                    </svg>
                  </div>
                <div class="status-complete">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </div>
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
    const isFinalStep = this.currentStepIndex === this.progressSteps.length - 1;
    
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

    // Special handling for final step - don't auto-complete, wait for actual AI completion
    if (isFinalStep) {
      console.log('🔄 Final step detected - setting up continuous loading animation');
      
      // Add continuous loading animation to final step
      if (stepElement) {
        stepElement.classList.add('step-final-processing');
        const stepIcon = stepElement.querySelector('.step-icon');
        if (stepIcon) {
          console.log('🔄 Replacing final step icon with spinner');
          stepIcon.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" class="spinner-icon">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="31.416" stroke-dashoffset="31.416">
                <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416" repeatCount="indefinite"/>
                <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416" repeatCount="indefinite"/>
              </circle>
            </svg>
          `;
        }
        
        // Update step text to indicate AI processing
        const stepTextEl = stepElement.querySelector('.step-text');
        if (stepTextEl) {
          console.log('🔄 Updating final step text to show AI processing');
          stepTextEl.textContent = 'AI bearbetar... (detta kan ta några sekunder)';
        }
      }
      
      // Don't schedule auto-completion for final step - let completeProgressAnimation() handle it
      this.currentStepIndex++;
      console.log('🔄 Final step setup complete - waiting for actual AI completion');
      return;
    }

    // Schedule completion for non-final steps
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
      steps.forEach((step, index) => {
        step.classList.add('step-complete');
        step.classList.remove('step-active', 'step-pending', 'step-final-processing');
        
        // Reset final step icon and text
        if (index === this.progressSteps.length - 1) {
          const stepIcon = step.querySelector('.step-icon');
          const stepText = step.querySelector('.step-text');
          if (stepIcon) {
            stepIcon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
          }
          if (stepText) {
            stepText.textContent = this.progressSteps[index].text;
          }
        }
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

    // Update buttons for results view
    const analyzeBtn = modal.querySelector('#analyze-btn');
    const applyBtn = modal.querySelector('#apply-btn');
    const reanalyzeBtn = modal.querySelector('#reanalyze-btn');
    const restartBtn = modal.querySelector('#restart-btn');
    
    if (analyzeBtn) {
      analyzeBtn.style.display = 'none';
    }
    
    if (applyBtn) {
      applyBtn.style.display = 'inline-block';
    }
    
    if (reanalyzeBtn) {
      reanalyzeBtn.style.display = 'inline-block';
    }
    
    if (restartBtn) {
      restartBtn.style.display = 'inline-block';
    }

    console.log('✅ Parsed preview displayed with data:', data);
  }

  /**
   * Generate HTML for parsed data preview with optional sure score
   */
  generatePreviewHTML(data, sureScore = null) {
    const sureScoreHTML = sureScore ? `
      <div class="freetext-sure-score">
        <h4>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="display: inline-block; margin-right: 6px; vertical-align: text-bottom;">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
            <circle cx="12" cy="12" r="6" stroke="currentColor" stroke-width="1.5"/>
            <circle cx="12" cy="12" r="2" fill="currentColor"/>
          </svg>
          Sure Score: ${Math.round(sureScore.sureScore * 100)}%
        </h4>
        <div class="sure-score-level sure-score-level--${sureScore.confidenceLevel.toLowerCase().replace(' ', '-')}">
          ${sureScore.confidenceLevel} säkerhet
        </div>
        <p class="sure-score-recommendation">${sureScore.recommendation}</p>
        
        <div class="sure-score-breakdown">
          <h5>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="display: inline-block; margin-right: 6px; vertical-align: text-bottom;">
              <rect x="3" y="3" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/>
              <line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" stroke-width="1.5"/>
              <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" stroke-width="1.5"/>
            </svg>
            Säkerhetsanalys:
          </h5>
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
          ${data.analysisType === 'image' ? 'Bildanalys' : 
            data.analysisType === 'combined' ? 'Bild + Text' : 
            'Textanalys'}
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
          <h5>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="display: inline-block; margin-right: 6px; vertical-align: text-bottom;">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" stroke-width="1.5"/>
            </svg>
            💰 Värdering
          </h5>
          ${data.estimate ? `<p><strong>Uppskattat värde:</strong> ${data.estimate} SEK ${this.getConfidenceBadge(data.confidence?.estimate)}</p>` : ''}
          ${data.reserve ? `<p><strong>Föreslaget bevakningspris:</strong> ${data.reserve} SEK</p>` : ''}
          ${data.shouldDisposeIfUnsold ? '<p><strong>⚠️ Ska skänkas/återvinnas om osålt</strong></p>' : ''}
        </div>
      ` : `
        <!-- DEBUG: No estimate data found -->
        <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 6px; margin: 16px 0;">
          <p style="margin: 0; color: #dc2626; font-size: 13px;">
            🔍 DEBUG: Ingen värdering hittades (estimate: ${data.estimate}, reserve: ${data.reserve})
          </p>
        </div>
      `}
      
      ${data.reasoning ? `
        <div class="ai-reasoning">
          <h5>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="display: inline-block; margin-right: 6px; vertical-align: text-bottom;">
              <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5"/>
              <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1" stroke="currentColor" stroke-width="1.5"/>
            </svg>
            AI-analys
          </h5>
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
        <strong>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="margin-right: 4px; vertical-align: text-bottom;">
            <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Klart!
        </strong> ${message}
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
          const calculatedReserve = Math.round(marketLow * 0.7); // 70% of market low
          data.reserve = this.enforceMinimumReserve(calculatedReserve);
          
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
      console.log(`[SEARCH] ARTIST: Added "${formattedArtist}" as primary search term`);
    }
    
    // PRIORITY 2: Object type (CRITICAL for relevance)
    const objectType = this.extractObjectType(data.title);
    if (objectType && !queryTerms.some(term => term.toLowerCase().includes(objectType.toLowerCase()))) {
      queryTerms.push(objectType);
      console.log(`[SEARCH] OBJECT: Added "${objectType}" as object type`);
    }
    
    // PRIORITY 3: Brand/Designer (if different from artist)
    const brand = this.extractBrandFromTitle(data.title);
    if (brand && !queryTerms.some(term => term.toLowerCase().includes(brand.toLowerCase()))) {
      const formattedBrand = this.formatBrandForSearch(brand);
      queryTerms.push(formattedBrand);
      console.log(`[SEARCH] BRAND: Added "${formattedBrand}" as brand/designer`);
    }
    
    // PRIORITY 4: Material (if distinctive)
    if (data.materials && this.isDistinctiveMaterial(data.materials)) {
      const material = data.materials.toLowerCase();
      if (!queryTerms.some(term => term.toLowerCase().includes(material))) {
        queryTerms.push(material);
        console.log(`[SEARCH] MATERIAL: Added "${material}" as distinctive material`);
      }
    }
    
    // PRIORITY 5: Period (if decade format)
    if (data.period && data.period.includes('-tal')) {
      queryTerms.push(data.period);
      console.log(`[SEARCH] PERIOD: Added "${data.period}" as time period`);
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
          console.log('[ENHANCE] Auto-enhancing parsed data with ADD ITEM page rules...');
    
    try {
      // Use regular enhancement with ADD ITEM page formatting
      const enhancedFields = {};
      
      // Enhance title using ADD ITEM page rules (not title-correct)
      if (parsedData.title) {
        console.log('[ENHANCE] Enhancing title with ADD ITEM page rules...');
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
      
      console.log('[ENHANCE] Enhanced fields:', enhancedFields);
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
      const systemPrompt = window.getAIRulesManager().getSystemPrompt('addItems');
      const userPrompt = this.getAddItemPageUserPrompt(itemData, fieldType);
      
      console.log(`[RULES] Using model-specific valuation rules for ${fieldType} enhancement`);
      
              console.log(`[PROMPT] ${fieldType} ADD ITEM page prompt (blue button logic):`, userPrompt.substring(0, 200) + '...');
      
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

  /**
   * Initialize beautiful image upload interface
   */
  initializeBeautifulImageUpload() {
    const modal = this.currentModal;
    if (!modal) return;

    const uploadTrigger = modal.querySelector('#simple-upload-trigger');
    const fileInput = modal.querySelector('#hidden-file-input');
    const previewGrid = modal.querySelector('#image-preview-grid');
    const uploadStatus = modal.querySelector('#upload-status');

    if (!uploadTrigger || !fileInput || !previewGrid || !uploadStatus) return;

    // Click to upload
    uploadTrigger.addEventListener('click', () => {
      fileInput.click();
    });

    // Drag and drop
    uploadTrigger.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadTrigger.style.borderColor = '#667eea';
      uploadTrigger.style.background = '#fafbff';
    });

    uploadTrigger.addEventListener('dragleave', (e) => {
      e.preventDefault();
      uploadTrigger.style.borderColor = '#cbd5e0';
      uploadTrigger.style.background = 'white';
    });

    uploadTrigger.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadTrigger.style.borderColor = '#cbd5e0';
      uploadTrigger.style.background = 'white';
      
      const files = Array.from(e.dataTransfer.files).filter(file => file.type.startsWith('image/'));
      this.handleBeautifulImageUpload(files);
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      this.handleBeautifulImageUpload(files);
    });

    this.uploadedImages = new Map();
    console.log('✅ Beautiful image upload interface initialized');
  }

  /**
   * Handle image upload with beautiful interface
   */
  handleBeautifulImageUpload(files) {
    if (!files || files.length === 0) return;

    // Limit to 5 images
    const remainingSlots = 5 - this.uploadedImages.size;
    const filesToProcess = files.slice(0, remainingSlots);

    filesToProcess.forEach((file, index) => {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        console.warn('File too large:', file.name);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const imageId = `beautiful_${Date.now()}_${index}`;
        this.uploadedImages.set(imageId, {
          file: file,
          dataUrl: e.target.result,
          name: file.name
        });
        
        this.updateBeautifulImagePreview();
        
        // Also add to selectedImages for analysis compatibility
        if (this.selectedImages) {
          this.selectedImages.set(imageId, {
            category: 'front', // Default category
            file: file,
            dataUrl: e.target.result
          });
          console.log('🖼️ Image added to selectedImages:', {
            imageId,
            fileName: file.name,
            selectedImagesSize: this.selectedImages.size
          });
        }
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Parse numeric value from string (for estimates, reserves, etc.)
   */
  parseNumericValue(value) {
    if (!value || value === null || value === undefined) return null;
    
    // Convert to string and clean up
    const cleaned = String(value)
      .replace(/[^\d,.-]/g, '') // Remove non-numeric characters except comma, dot, dash
      .replace(/,/g, '.')       // Replace comma with dot for decimals
      .trim();
    
    if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '') return null;
    
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : Math.round(parsed);
  }

  /**
   * Normalize confidence value to 0-1 range
   */
  normalizeConfidence(value) {
    if (!value || value === null || value === undefined) return 0.5;
    
    const num = parseFloat(value);
    if (isNaN(num)) return 0.5;
    
    // Ensure 0-1 range
    return Math.max(0, Math.min(1, num));
  }

  /**
   * Update beautiful image preview
   */
  updateBeautifulImagePreview() {
    const modal = this.currentModal;
    if (!modal) return;

    const previewGrid = modal.querySelector('#image-preview-grid');
    const uploadStatus = modal.querySelector('#upload-status');
    const uploadTrigger = modal.querySelector('#simple-upload-trigger');

    if (!previewGrid || !uploadStatus || !uploadTrigger) return;

    // Clear previous previews
    previewGrid.innerHTML = '';

    if (this.uploadedImages.size === 0) {
      previewGrid.style.display = 'none';
      uploadStatus.textContent = 'Inga bilder uppladdade • Bilder är valfria men förbättrar AI-analysen';
      uploadTrigger.style.display = 'block';
      return;
    }

    // Show preview grid
    previewGrid.style.display = 'grid';
    uploadTrigger.style.display = this.uploadedImages.size >= 5 ? 'none' : 'block';

    // Add image previews
    this.uploadedImages.forEach((imageData, imageId) => {
      const previewItem = document.createElement('div');
      previewItem.className = 'image-preview-item';
      previewItem.innerHTML = `
        <img src="${imageData.dataUrl}" alt="${imageData.name}">
        <button class="image-remove-btn" data-image-id="${imageId}">×</button>
      `;

      // Remove button functionality
      const removeBtn = previewItem.querySelector('.image-remove-btn');
      removeBtn.addEventListener('click', () => {
        this.uploadedImages.delete(imageId);
        if (this.selectedImages) {
          this.selectedImages.delete(imageId);
          console.log('🗑️ Image removed from selectedImages:', {
            imageId,
            selectedImagesSize: this.selectedImages.size
          });
        }
        this.updateBeautifulImagePreview();
        this.updateAnalysisMode();
      });

      previewGrid.appendChild(previewItem);
    });

    // Update status
    const count = this.uploadedImages.size;
    const remaining = 5 - count;
    uploadStatus.textContent = `${count} av 5 bilder uppladdade${remaining > 0 ? ` • ${remaining} platser kvar` : ' • Fullt'}`;
  }
} 