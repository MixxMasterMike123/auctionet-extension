// modules/add-items-integration-manager.js
// Integration manager that connects our new modular components
// and handles remaining UI features (AI buttons, quality indicator, auto-resize)

import { FreetextParser } from './refactored/components/freetext-parser.js';

export class AddItemsIntegrationManager {
  constructor() {
    this.apiBridge = null;
    this.tooltipSystemManager = null;
    this.fieldQualityAnalyzer = null;
    this.fieldMonitorManager = null;
    this.freetextParser = null;
    
    console.log('✅ AddItemsIntegrationManager: Initialized');
  }

  /**
   * Initialize with all dependencies
   * @param {Object} dependencies - Required dependencies
   */
  init(dependencies = {}) {
    const {
      apiBridge,
      tooltipSystemManager,
      fieldQualityAnalyzer,
      fieldMonitorManager
    } = dependencies;

    this.apiBridge = apiBridge;
    this.tooltipSystemManager = tooltipSystemManager;
    this.fieldQualityAnalyzer = fieldQualityAnalyzer;
    this.fieldMonitorManager = fieldMonitorManager;

    // Initialize FreetextParser component
    this.freetextParser = new FreetextParser(this.apiBridge, this);

    // Initialize UI features
    this.injectAIButtons();
    this.initializeFreetextParser();
    this.setupAutoResizeForAllTextareas();
    
    console.log('✅ AddItemsIntegrationManager: Full initialization complete');
  }

  /**
   * Inject AI improvement buttons for all fields
   */
  injectAIButtons() {
    console.log('🎨 Injecting AI improvement buttons...');
    
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

    if (titleField) {
      this.addAIButton(titleField, 'title', 'AI-förbättra titel');
      this.addAIButton(titleField, 'title-correct', 'AI-korrigera stavning');
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

    // Add FreetextParser button
    this.addFreetextParserButton();

    // Add quality indicator with master button
    this.addQualityIndicator();
    
    // Attach event listeners
    this.attachAIButtonEventListeners();
  }

  /**
   * Initialize FreetextParser component
   */
  async initializeFreetextParser() {
    try {
      await this.freetextParser.init();
      console.log('✅ FreetextParser initialized in AddItemsIntegrationManager');
    } catch (error) {
      console.error('❌ Failed to initialize FreetextParser:', error);
    }
  }

  /**
   * Add FreetextParser button to the page
   */
  addFreetextParserButton() {
    // Find a good location for the FreetextParser button - near the form header
    const formHeader = document.querySelector('.page-header h3');
    const form = document.querySelector('#new_item, .item_form');
    
    if (!form) {
      console.log('❌ No AddItem form found for FreetextParser button');
      return;
    }

    // Create the FreetextParser button with distinctive styling
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'freetext-parser-container';
    buttonContainer.style.cssText = `
      margin: 15px 0;
      padding: 15px;
      background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%);
      border: 2px solid #2196f3;
      border-radius: 8px;
      text-align: center;
    `;
    
    buttonContainer.innerHTML = `
      <button type="button" class="btn btn-primary btn-lg" id="freetext-parser-btn" style="
        background: linear-gradient(135deg, #2196f3 0%, #1976d2 100%);
        border: none;
        padding: 12px 24px;
        font-size: 16px;
        font-weight: 600;
        color: white;
        border-radius: 6px;
        cursor: pointer;
        box-shadow: 0 3px 8px rgba(33, 150, 243, 0.3);
        transition: all 0.2s ease;
      ">
        🤖 AI Snabbkatalogisering från fritext
      </button>
      <div style="margin-top: 8px; font-size: 14px; color: #666;">
        Skriv allt du vet om objektet - AI skapar perfekt katalogpost
      </div>
    `;

    // Insert before the form
    form.parentNode.insertBefore(buttonContainer, form);
    
    // Add event listener
    const button = buttonContainer.querySelector('#freetext-parser-btn');
    if (button) {
      button.addEventListener('click', () => {
        console.log('🔴 FREETEXT BUTTON CLICKED in AddItemsIntegrationManager!');
        if (this.freetextParser) {
          console.log('🔴 FreetextParser available, calling openFreetextModal...');
          this.freetextParser.openFreetextModal();
        } else {
          console.error('❌ FreetextParser not available');
        }
      });
      
      // Add hover effects
      button.addEventListener('mouseenter', () => {
        button.style.transform = 'translateY(-2px)';
        button.style.boxShadow = '0 5px 12px rgba(33, 150, 243, 0.4)';
      });
      
      button.addEventListener('mouseleave', () => {
        button.style.transform = 'translateY(0)';
        button.style.boxShadow = '0 3px 8px rgba(33, 150, 243, 0.3)';
      });
      
      console.log('✅ FreetextParser button added to AddItem page');
    } else {
      console.error('❌ Failed to find FreetextParser button after creation');
    }
  }

  /**
   * Add individual AI button to a field
   * @param {HTMLElement} field - Field element
   * @param {string} type - Field type
   * @param {string} buttonText - Button text
   */
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

  /**
   * Add quality indicator with master button
   */
  addQualityIndicator() {
    // First inject the CSS styles that were previously provided by AI Enhancement UI
    this.injectStyles();
    
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
    `;
    
    // Find suitable location for quality indicator
    let targetElement = document.querySelector('.grid-col4') || 
                       document.querySelector('.sidebar') ||
                       document.querySelector('form');
    
    if (targetElement) {
      console.log('✅ Adding quality indicator to page');
      if (targetElement.tagName === 'FORM') {
        targetElement.insertBefore(indicator, targetElement.firstChild);
      } else {
        targetElement.insertBefore(indicator, targetElement.firstChild);
      }
      
      // Trigger initial quality analysis
      this.analyzeQuality();
    } else {
      console.log('❌ No suitable location found for quality indicator');
    }
  }

  /**
   * Attach event listeners to AI buttons
   */
  attachAIButtonEventListeners() {
    // Individual field buttons
    const buttons = document.querySelectorAll('.ai-assist-button:not(.ai-master-button)');
    console.log('Found AI assist buttons:', buttons.length);
    
    buttons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const fieldType = e.target.dataset.fieldType;
        console.log('Button clicked for field type:', fieldType);
        if (fieldType) {
          this.improveField(fieldType);
        }
      });
    });

    // Master button
    const masterButton = document.querySelector('.ai-master-button');
    if (masterButton) {
      console.log('Master button found and event listener attached');
      masterButton.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Master button clicked');
        this.improveAllFields();
      });
    }

    // Quality refresh button
    const refreshButton = document.querySelector('.refresh-quality-btn');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => {
        console.log('🔄 Manual quality refresh triggered');
        this.analyzeQuality();
      });
    }
  }

  /**
   * Improve individual field using API bridge
   * @param {string} fieldType - Field type to improve
   * @param {Object} options - Additional options
   */
  async improveField(fieldType, options = {}) {
    console.log(`🎯 IntegrationManager: improveField called with fieldType=${fieldType}`);
    
    if (!this.apiBridge) {
      console.log(`❌ IntegrationManager: API bridge not available`);
      this.showErrorIndicator(fieldType, 'API bridge not available');
      return;
    }
    
    console.log(`✅ IntegrationManager: API bridge available, calling improveField`);
    this.showLoadingIndicator(fieldType);
    
    try {
      console.log(`🚀 IntegrationManager: Calling apiBridge.improveField(${fieldType})`);
      await this.apiBridge.improveField(fieldType, options);
      console.log(`✅ IntegrationManager: apiBridge.improveField completed successfully`);
      this.showSuccessIndicator(fieldType);
      
      // Trigger quality analysis after improvement
      setTimeout(() => this.analyzeQuality(), 500);
      
    } catch (error) {
      console.error('❌ IntegrationManager: Error improving field:', error);
      this.showErrorIndicator(fieldType, error.message);
    }
  }

  /**
   * Improve all fields
   */
  async improveAllFields() {
    if (!this.apiBridge) {
      this.showErrorIndicator('all', 'API bridge not available');
      return;
    }

    this.showLoadingIndicator('all');
    
    try {
      await this.apiBridge.improveAllFields();
      
      // Show success with cascade effect
      let delay = 0;
      const fields = ['title', 'description', 'condition', 'keywords'];
      
      fields.forEach(fieldType => {
        setTimeout(() => {
          this.showSuccessIndicator(fieldType);
        }, delay);
        delay += 300;
      });
      
      // Trigger quality analysis after all improvements
      setTimeout(() => this.analyzeQuality(), delay + 500);
      
    } catch (error) {
      console.error('Error improving all fields:', error);
      this.showErrorIndicator('all', error.message);
    }
  }

  /**
   * Analyze current form quality using our new components
   */
  analyzeQuality() {
    if (!this.fieldQualityAnalyzer) {
      console.warn('⚠️ FieldQualityAnalyzer not available for quality analysis');
      return;
    }

    try {
      const formData = this.extractFormData();
      
      // Use our new field quality analyzer
      const descriptionAnalysis = this.fieldQualityAnalyzer.analyzeDescriptionQuality(formData);
      const conditionAnalysis = this.fieldQualityAnalyzer.analyzeConditionQuality(formData);
      
      // Calculate overall score
      const overallScore = Math.round((descriptionAnalysis.score + conditionAnalysis.score) / 2);
      
      // Collect issues
      const allIssues = [
        ...descriptionAnalysis.issues,
        ...conditionAnalysis.issues
      ];
      
      // Update quality indicator
      this.updateQualityIndicator(overallScore, allIssues);
      
    } catch (error) {
      console.error('❌ Quality analysis failed:', error);
      this.updateQualityIndicator(0, [{ message: 'Analys misslyckades' }]);
    }
  }

  /**
   * Update quality indicator display
   * @param {number} score - Quality score (0-100)
   * @param {Array} issues - List of issues
   */
  updateQualityIndicator(score, issues = []) {
    const scoreElement = document.querySelector('.quality-score');
    if (!scoreElement) return;

    // Update score display with smooth transition
    const currentScore = parseInt(scoreElement.textContent.split('/')[0]) || 0;
    if (currentScore !== score) {
      scoreElement.style.transform = 'scale(1.1)';
      setTimeout(() => {
        scoreElement.style.transform = 'scale(1)';
      }, 200);
    }
    
    scoreElement.textContent = `${score}/100`;
    
    // Remove previous color classes
    scoreElement.classList.remove('good', 'medium', 'poor');
    
    // Add color class based on score (matching original edit page)
    if (score >= 80) {
      scoreElement.classList.add('good');
    } else if (score >= 60) {
      scoreElement.classList.add('medium');
    } else {
      scoreElement.classList.add('poor');
    }
    
    console.log(`📊 Quality score updated: ${score}/100`);
  }

  /**
   * Extract current form data
   * @returns {Object} Form data object
   */
  extractFormData() {
    return {
      category: document.querySelector('#item_category_id option:checked')?.textContent || '',
      title: document.querySelector('#item_title_sv')?.value || '',
      description: document.querySelector('#item_description_sv')?.value || '',
      condition: document.querySelector('#item_condition_sv')?.value || '',
      artist: document.querySelector('#item_artist_name_sv')?.value || '',
      keywords: document.querySelector('#item_hidden_keywords')?.value || ''
    };
  }

  /**
   * Setup auto-resize for all textareas
   */
  setupAutoResizeForAllTextareas() {
    console.log('🔧 Setting up auto-resize for all textareas...');
    
    const textareas = document.querySelectorAll('textarea');
    textareas.forEach(textarea => {
      // Initial resize
      this.autoResizeTextarea(textarea);
      
      // Setup event listeners for auto-resize
      const autoResizeHandler = () => {
        this.autoResizeTextarea(textarea);
      };
      
      textarea.addEventListener('input', autoResizeHandler);
      textarea.addEventListener('paste', () => {
        setTimeout(autoResizeHandler, 0);
      });
      
      console.log(`✅ Auto-resize setup for textarea: ${textarea.name || textarea.id || 'unnamed'}`);
    });
    
    console.log(`🎯 Auto-resize setup complete for ${textareas.length} textareas`);
  }

  /**
   * Auto-resize a textarea to fit content
   * @param {HTMLElement} textarea - Textarea element
   */
  autoResizeTextarea(textarea) {
    if (!textarea) return;
    
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    
    // Set height to scrollHeight plus some padding
    const newHeight = Math.max(textarea.scrollHeight + 4, 60);
    textarea.style.height = newHeight + 'px';
    
    console.log(`📏 Textarea ${textarea.name || textarea.id} resized to ${newHeight}px`);
  }

  /**
   * Show loading indicator for field
   * @param {string} fieldType - Field type
   */
  showLoadingIndicator(fieldType) {
    const button = document.querySelector(`.ai-assist-button[data-field-type="${fieldType}"]`) ||
                  document.querySelector('.ai-master-button');
    
    if (button) {
      button.disabled = true;
      button.textContent = fieldType === 'all' ? '⏳ Förbättrar alla...' : '⏳ Förbättrar...';
      button.classList.add('loading');
    }
  }

  /**
   * Show success indicator for field
   * @param {string} fieldType - Field type
   */
  showSuccessIndicator(fieldType) {
    const button = document.querySelector(`.ai-assist-button[data-field-type="${fieldType}"]`);
    
    if (button) {
      button.disabled = false;
      button.textContent = '✅ Förbättrad!';
      button.classList.remove('loading');
      button.classList.add('success');
      
      // Reset after 2 seconds
      setTimeout(() => {
        this.resetButtonState(button, fieldType);
      }, 2000);
    }
  }

  /**
   * Show error indicator for field
   * @param {string} fieldType - Field type
   * @param {string} message - Error message
   */
  showErrorIndicator(fieldType, message) {
    const button = document.querySelector(`.ai-assist-button[data-field-type="${fieldType}"]`) ||
                  document.querySelector('.ai-master-button');
    
    if (button) {
      button.disabled = false;
      button.textContent = '❌ Fel';
      button.classList.remove('loading');
      button.classList.add('error');
      button.title = message;
      
      // Reset after 3 seconds
      setTimeout(() => {
        this.resetButtonState(button, fieldType);
      }, 3000);
    }
  }

  /**
   * Reset button to original state
   * @param {HTMLElement} button - Button element
   * @param {string} fieldType - Field type
   */
  resetButtonState(button, fieldType) {
    button.classList.remove('success', 'error', 'loading');
    button.removeAttribute('title');
    
    // Reset to original text
    const originalTexts = {
      title: 'AI-förbättra titel',
      description: 'AI-förbättra beskrivning',
      condition: 'AI-förbättra kondition',
      keywords: 'AI-generera sökord',
      all: '⚡ Förbättra alla'
    };
    
    button.textContent = originalTexts[fieldType] || 'AI-förbättra';
  }

  /**
   * Inject necessary CSS styles (previously provided by AI Enhancement UI)
   */
  injectStyles() {
    if (document.getElementById('ai-enhancement-integration-styles')) {
      return; // Already injected
    }

    const style = document.createElement('style');
    style.id = 'ai-enhancement-integration-styles';
    style.textContent = `
      /* AI Enhancement Integration Styles */
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
      
      .ai-assist-button[data-field-type="title-correct"] {
        background: #D18300;
      }
      
      .ai-assist-button[data-field-type="title-correct"]:hover {
        background: #B17200;
      }
      
      .ai-assist-button[data-field-type="title-correct"]:active {
        background: #A16600;
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
        transition: all 0.2s ease;
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
      
      .ai-button-wrapper {
        margin-top: 0px;
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }
      
      .ai-updated {
        background-color: #d4edda !important;
        border: 2px solid #28a745 !important;
        transition: all 0.3s ease;
      }
      
      /* Button states */
      .ai-assist-button.loading {
        opacity: 0.7;
        cursor: not-allowed;
        animation: pulse 1.5s infinite;
      }
      
      .ai-assist-button.success {
        background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
      }
      
      .ai-assist-button.error {
        background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
      }
      
      @keyframes pulse {
        0%, 100% { opacity: 0.7; }
        50% { opacity: 1; }
      }
    `;
    
    document.head.appendChild(style);
    console.log('✅ AI Enhancement Integration styles injected');
  }

  // Note: FreetextParser now handles form application directly

  /**
   * Destroy and cleanup
   */
  destroy() {
    // Clean up FreetextParser
    if (this.freetextParser) {
      this.freetextParser.destroy();
    }
    
    // Remove any added UI elements
    const qualityIndicator = document.querySelector('.quality-indicator');
    if (qualityIndicator) {
      qualityIndicator.remove();
    }
    
    const aiButtons = document.querySelectorAll('.ai-button-wrapper');
    aiButtons.forEach(wrapper => wrapper.remove());
    
    // Remove injected styles
    const styles = document.getElementById('ai-enhancement-integration-styles');
    if (styles) {
      styles.remove();
    }
    
    console.log('🧹 AddItemsIntegrationManager: Cleaned up');
  }
} 