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

export class FreetextParser {
  constructor(apiManager, addItemsManager) {
    this.apiManager = apiManager;
    this.addItemsManager = addItemsManager;
    
    // Component state
    this.isProcessing = false;
    this.currentModal = null;
    this.parsedData = null;
    
    // Configuration
    this.config = {
      minConfidenceThreshold: 0.6,
      maxProcessingTime: 30000, // 30 seconds
      enableHistoricalValidation: true,
      enableMarketAnalysis: true
    };
    
    console.log('✅ FreetextParser component initialized');
  }

  /**
   * Initialize the component and add UI elements
   */
  async init() {
    try {
      // Add a small delay to ensure page controllers are fully loaded
      await new Promise(resolve => setTimeout(resolve, 100));
      
      this.injectStyles();
      this.addFreetextButton();
      console.log('✅ FreetextParser UI elements added to AddItem page');
    } catch (error) {
      console.error('❌ FreetextParser initialization failed:', error);
    }
  }

  /**
   * Add the main freetext parser button to the AddItem page
   */
  addFreetextButton() {
    // Wait for DOM to be ready and avoid conflicts with existing controllers
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.addFreetextButton());
      return;
    }

    // Check if button already exists to avoid duplicates
    if (document.querySelector('#freetext-parser-btn')) {
      console.log('⚠️ Freetext parser button already exists');
      return;
    }

    // Find the form container (following existing patterns)
    const formContainer = document.querySelector('.add-item-form, form, .form-container') || 
                         document.querySelector('main') || 
                         document.body;
    
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

    // Insert at the top of the form for maximum visibility, but avoid disrupting existing structure
    const firstChild = formContainer.firstChild;
    if (firstChild) {
      formContainer.insertBefore(buttonContainer, firstChild);
    } else {
      formContainer.appendChild(buttonContainer);
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
    if (this.currentModal) {
      console.log('⚠️ Modal already open');
      return;
    }

    try {
      this.currentModal = this.createFreetextModal();
      
      // Ensure document.body exists before appending
      if (document.body) {
        document.body.appendChild(this.currentModal);
        
        // Focus on textarea with error handling
        setTimeout(() => {
          if (this.currentModal) {
            const textarea = this.currentModal.querySelector('#freetext-input');
            if (textarea) {
              textarea.focus();
            }
          }
        }, 100);

        console.log('✅ Freetext modal opened');
      } else {
        console.error('❌ document.body not available for modal');
      }
    } catch (error) {
      console.error('❌ Failed to open freetext modal:', error);
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
      analyzeBtn.addEventListener('click', () => this.processFreetextWithAI());
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
    if (this.isProcessing) {
      console.log('⚠️ Already processing freetext');
      return;
    }

    const textarea = this.currentModal.querySelector('#freetext-input');
    const freetext = textarea.value.trim();

    if (!freetext) {
      this.showError('Vänligen skriv in information om objektet först.');
      return;
    }

    if (freetext.length < 10) {
      this.showError('Fritext är för kort. Skriv mer information om objektet.');
      return;
    }

    try {
      this.isProcessing = true;
      this.showProcessingState();

      console.log('🤖 Starting AI analysis of freetext:', freetext.substring(0, 100) + '...');

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

      this.parsedData = finalData;
      this.showParsedPreview(finalData);

    } catch (error) {
      console.error('❌ AI analysis failed:', error);
      this.showError('AI-analys misslyckades. Försök igen eller kontakta support.');
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Parse freetext using AI Rules System v2.0
   */
  async parseFreetextWithAI(freetext) {
    console.log('🔄 Parsing freetext with AI Rules System v2.0...');

    // Use AI Rules System v2.0 for consistent prompting
    const prompt = buildPrompt({
      type: 'freetextParser',
      context: { 
        freetext, 
        language: 'swedish',
        source: 'addItemsPage'
      },
      fields: ['title', 'description', 'condition', 'artist', 'materials', 'period'],
      instructions: 'Parse Swedish auction freetext into structured catalog data'
    });

    const response = await this.apiManager.callAI(prompt.userPrompt, {
      systemPrompt: prompt.systemPrompt,
      maxTokens: 2000,
      temperature: 0.1 // Low temperature for consistent parsing
    });

    return this.parseAIResponse(response);
  }

  /**
   * Parse AI response into structured data
   */
  parseAIResponse(response) {
    try {
      // Try to parse JSON response first
      if (response.includes('{') && response.includes('}')) {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      }

      // Fallback: Parse structured text response
      return this.parseStructuredTextResponse(response);
    } catch (error) {
      console.error('❌ Failed to parse AI response:', error);
      throw new Error('AI response kunde inte tolkas');
    }
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

    console.log('✅ Parsed preview displayed');
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
        ${this.generateFieldPreview('materials', 'Material', data.materials, data.confidence?.materials)}
        ${this.generateFieldPreview('period', 'Period', data.period, data.confidence?.period)}
      </div>
      
      ${data.estimatedValue ? `
        <div class="market-analysis">
          <h5>📊 Marknadsanalys</h5>
          <p><strong>Uppskattat värde:</strong> ${data.estimatedValue} SEK</p>
          ${data.reservePrice ? `<p><strong>Föreslaget utrop:</strong> ${data.reservePrice} SEK</p>` : ''}
        </div>
      ` : ''}
      
      ${data.keywords && data.keywords.length > 0 ? `
        <div class="search-optimization">
          <h5>🔍 Sökoptimering</h5>
          <div class="keywords-preview">
            ${data.keywords.map(keyword => `<span class="keyword-tag">${keyword}</span>`).join('')}
          </div>
        </div>
      ` : ''}
    `;
  }

  /**
   * Generate preview for individual field
   */
  generateFieldPreview(fieldName, label, value, confidence) {
    if (!value) return '';

    const confidenceBadge = confidence ? this.getConfidenceBadge(confidence) : '';
    const isTextarea = ['description', 'condition'].includes(fieldName);
    
    return `
      <div class="field-preview" data-field="${fieldName}">
        <label class="field-label">
          ${label} ${confidenceBadge}
        </label>
        ${isTextarea 
          ? `<textarea class="preview-field" rows="3">${value}</textarea>`
          : `<input type="text" class="preview-field" value="${value}">`
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
      // Get updated values from preview fields
      const updatedData = this.getUpdatedDataFromPreview();
      
      // Apply to form using existing field mappings
      this.addItemsManager.applyParsedDataToForm(updatedData);
      
      // Close modal
      this.closeModal();
      
      // Show success feedback
      this.addItemsManager.showSuccessFeedback('✅ Katalogpost skapad från fritext!');
      
      console.log('✅ Parsed data applied to form');
    } catch (error) {
      console.error('❌ Failed to apply parsed data:', error);
      this.showError('Kunde inte applicera data till formuläret.');
    }
  }

  /**
   * Get updated data from preview fields
   */
  getUpdatedDataFromPreview() {
    const data = {};
    const previewFields = this.currentModal.querySelectorAll('.preview-field');
    
    previewFields.forEach(field => {
      const fieldName = field.closest('.field-preview').dataset.field;
      data[fieldName] = field.value.trim();
    });
    
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
   * Validate against auction history (placeholder for future implementation)
   */
  async validateAgainstAuctionHistory(data) {
    // TODO: Implement historical validation using 3.5M auction dataset
    console.log('🔄 Historical validation (placeholder)');
    return data;
  }

  /**
   * Enrich with market data (placeholder for future implementation)
   */
  async enrichWithMarketData(data) {
    // TODO: Implement market analysis integration
    console.log('🔄 Market data enrichment (placeholder)');
    return data;
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
   */
  injectStyles() {
    if (document.querySelector('#freetext-parser-styles')) {
      return; // Already injected
    }

    const style = document.createElement('style');
    style.id = 'freetext-parser-styles';
    style.textContent = `
      /* Freetext Parser Component Styles */
      .freetext-parser-container {
        margin: 20px 0;
        padding: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(102, 126, 234, 0.3);
      }

      .btn--freetext-parser {
        width: 100%;
        background: rgba(255, 255, 255, 0.95);
        color: #4a5568;
        border: none;
        border-radius: 8px;
        padding: 16px 20px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
      }

      .btn--freetext-parser:hover {
        background: rgba(255, 255, 255, 1);
        transform: translateY(-2px);
        box-shadow: 0 6px 25px rgba(0, 0, 0, 0.15);
      }

      .btn__icon {
        font-size: 24px;
        margin-bottom: 4px;
      }

      .btn__text {
        font-size: 16px;
        font-weight: 600;
      }

      .btn__subtitle {
        font-size: 13px;
        color: #718096;
        font-weight: 400;
      }

      /* Modal Styles - Following existing popup patterns */
      .freetext-parser-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.2s ease-out;
      }

      .freetext-parser-modal {
        background: white;
        border-radius: 16px;
        width: 90%;
        max-width: 700px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .popup-header {
        padding: 24px 24px 16px;
        border-bottom: 1px solid #e2e8f0;
        position: relative;
      }

      .popup-header h3 {
        margin: 0 0 8px 0;
        font-size: 20px;
        font-weight: 600;
        color: #2d3748;
      }

      .popup-header p {
        margin: 0;
        color: #718096;
        font-size: 14px;
      }

      .popup-close {
        position: absolute;
        top: 20px;
        right: 20px;
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #a0aec0;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
      }

      .popup-close:hover {
        background: #f7fafc;
        color: #4a5568;
      }

      .popup-content {
        padding: 24px;
      }

      .freetext-input-section {
        margin-bottom: 24px;
      }

      .freetext-label {
        display: block;
        margin-bottom: 12px;
        font-weight: 600;
        color: #2d3748;
      }

      .freetext-hint {
        display: block;
        font-size: 13px;
        color: #718096;
        font-weight: 400;
        margin-top: 4px;
      }

      .freetext-textarea {
        width: 100%;
        min-height: 120px;
        padding: 12px;
        border: 2px solid #e2e8f0;
        border-radius: 8px;
        font-size: 14px;
        line-height: 1.5;
        resize: vertical;
        transition: border-color 0.2s ease;
      }

      .freetext-textarea:focus {
        outline: none;
        border-color: #667eea;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
      }

      .freetext-examples {
        margin-top: 16px;
        padding: 16px;
        background: #f7fafc;
        border-radius: 8px;
        font-size: 13px;
      }

      .example-item {
        margin-top: 8px;
        padding: 8px;
        background: white;
        border-radius: 4px;
        font-style: italic;
        color: #4a5568;
      }

      /* Processing Styles */
      .ai-processing-section {
        text-align: center;
        padding: 40px 20px;
      }

      .processing-spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #e2e8f0;
        border-top: 4px solid #667eea;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 20px;
      }

      .processing-status h4 {
        margin: 0 0 8px 0;
        color: #2d3748;
      }

      .processing-step {
        color: #718096;
        margin-bottom: 20px;
      }

      .processing-progress {
        width: 100%;
        max-width: 300px;
        margin: 0 auto;
      }

      .progress-bar {
        width: 100%;
        height: 8px;
        background: #e2e8f0;
        border-radius: 4px;
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #667eea, #764ba2);
        width: 0%;
        transition: width 0.3s ease;
      }

      /* Preview Styles */
      .parsed-preview-section h4 {
        margin: 0 0 20px 0;
        color: #2d3748;
      }

      .parsed-fields {
        display: grid;
        gap: 16px;
        margin-bottom: 24px;
      }

      .field-preview {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .field-label {
        font-weight: 600;
        color: #2d3748;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .preview-field {
        padding: 8px 12px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        font-size: 14px;
        transition: border-color 0.2s ease;
      }

      .preview-field:focus {
        outline: none;
        border-color: #667eea;
      }

      .confidence-badge {
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 12px;
        font-weight: 500;
      }

      .confidence-high {
        background: #c6f6d5;
        color: #22543d;
      }

      .confidence-medium {
        background: #fef5e7;
        color: #c05621;
      }

      .confidence-low {
        background: #fed7d7;
        color: #c53030;
      }

      .market-analysis, .search-optimization {
        margin-top: 20px;
        padding: 16px;
        background: #f7fafc;
        border-radius: 8px;
      }

      .market-analysis h5, .search-optimization h5 {
        margin: 0 0 12px 0;
        color: #2d3748;
      }

      .keywords-preview {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .keyword-tag {
        background: #667eea;
        color: white;
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;
      }

      /* Modal Footer */
      .modal-footer {
        padding: 16px 24px 24px;
        border-top: 1px solid #e2e8f0;
        display: flex;
        gap: 12px;
        justify-content: flex-end;
      }

      .btn {
        padding: 10px 20px;
        border-radius: 6px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        border: none;
        font-size: 14px;
      }

      .btn--secondary {
        background: #e2e8f0;
        color: #4a5568;
      }

      .btn--secondary:hover {
        background: #cbd5e0;
      }

      .btn--primary {
        background: #667eea;
        color: white;
      }

      .btn--primary:hover {
        background: #5a67d8;
      }

      .btn--primary:disabled {
        background: #a0aec0;
        cursor: not-allowed;
      }

      .btn--success {
        background: #48bb78;
        color: white;
      }

      .btn--success:hover {
        background: #38a169;
      }

      /* Animations */
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(-20px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      /* Responsive Design */
      @media (max-width: 768px) {
        .freetext-parser-modal {
          width: 95%;
          margin: 20px;
        }

        .popup-content {
          padding: 16px;
        }

        .modal-footer {
          flex-direction: column;
        }

        .btn {
          width: 100%;
        }
      }
    `;

    document.head.appendChild(style);
    console.log('✅ Freetext parser styles injected');
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