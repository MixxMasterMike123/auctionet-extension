// modules/add-items-integration-manager.js
// Integration manager that connects our new modular components
// and handles remaining UI features (AI buttons, quality indicator, auto-resize)

export class AddItemsIntegrationManager {
  constructor() {
    this.apiBridge = null;
    this.tooltipSystemManager = null;
    this.fieldQualityAnalyzer = null;
    this.fieldMonitorManager = null;
    
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

    // Initialize UI features
    this.injectAIButtons();
    this.setupAutoResizeForAllTextareas();
    
  }

  /**
   * Inject AI improvement buttons for all fields
   */
  injectAIButtons() {
    
    const titleField = document.querySelector('#item_title_sv');
    const descriptionField = document.querySelector('#item_description_sv');
    const conditionField = document.querySelector('#item_condition_sv');
    const keywordsField = document.querySelector('#item_hidden_keywords');


    if (titleField) {
      this.addAIButton(titleField, 'title', 'Förbättra titel');
      this.addAIButton(titleField, 'title-correct', 'AI-korrigera stavning');
    }
    if (descriptionField) {
      this.addAIButton(descriptionField, 'description', 'Förbättra beskrivning');
    }
    if (conditionField) {
      this.addAIButton(conditionField, 'condition', 'Förbättra kondition');
    }
    if (keywordsField) {
      this.addAIButton(keywordsField, 'keywords', 'Generera sökord');
    }

    // Add quality indicator with master button
    this.addQualityIndicator();
    
    // Attach event listeners
    this.attachAIButtonEventListeners();
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
        <h4 class="quality-title">Auctionet Kvalitetskontroll</h4>
        <div class="quality-score-container">
          <span class="quality-score">Analyserar...</span>
          <button class="refresh-quality-btn" type="button" title="Uppdatera kvalitetspoäng">🔄</button>
        </div>
        <button class="ai-assist-button ai-master-button" type="button">Förbättra alla fält</button>
      </div>
    `;
    
    // Find suitable location for quality indicator
    let targetElement = document.querySelector('.grid-col4') || 
                       document.querySelector('.sidebar') ||
                       document.querySelector('form');
    
    if (targetElement) {
      if (targetElement.tagName === 'FORM') {
        targetElement.insertBefore(indicator, targetElement.firstChild);
      } else {
        targetElement.insertBefore(indicator, targetElement.firstChild);
      }
      
      // Trigger initial quality analysis
      this.analyzeQuality();
    }
  }

  /**
   * Attach event listeners to AI buttons
   */
  attachAIButtonEventListeners() {
    // Individual field buttons
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

    // Master button
    const masterButton = document.querySelector('.ai-master-button');
    if (masterButton) {
      masterButton.addEventListener('click', (e) => {
        e.preventDefault();
        this.improveAllFields();
      });
    }

    // Quality refresh button
    const refreshButton = document.querySelector('.refresh-quality-btn');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => {
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
    
    if (!this.apiBridge) {
      this.showErrorIndicator(fieldType, 'API bridge not available');
      return;
    }
    
    this.showLoadingIndicator(fieldType);
    
    try {
      await this.apiBridge.improveField(fieldType, options);
      this.showSuccessIndicator(fieldType);
      
      // Trigger quality analysis after improvement
      setTimeout(() => this.analyzeQuality(), 500);
      
    } catch (error) {
      console.error('IntegrationManager: Error improving field:', error);
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
      console.error('Quality analysis failed:', error);
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
      scoreElement.style.fontWeight = '900';
      setTimeout(() => {
        scoreElement.style.fontWeight = 'bold';
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
      
    });
    
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
      title: 'Förbättra titel',
      description: 'Förbättra beskrivning',
      condition: 'Förbättra kondition',
      keywords: 'Generera sökord',
      all: '⚡ Förbättra alla'
    };
    
    button.textContent = originalTexts[fieldType] || 'Förbättra';
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
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 3px;
        padding: 20px;
        margin-bottom: 20px;
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
        border-radius: 3px;
        font-size: 14px;
        min-width: 80px;
        text-align: center;
        transition: all 0.3s ease;
      }

      .quality-score.good {
        background: #d4edda;
        color: #155724;
        border: 2px solid #b8dacc;
      }

      .quality-score.medium {
        background: #fff3cd;
        color: #856404;
        border: 2px solid #f1c40f;
      }

      .quality-score.poor {
        background: #f8d7da;
        color: #721c24;
        border: 2px solid #e74c3c;
      }

      .refresh-quality-btn {
        background: #6c757d;
        color: white;
        border: none;
        border-radius: 50%;
        width: 28px;
        height: 28px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .refresh-quality-btn:hover {
        background: #495057;
        transform: rotate(180deg);
      }
      
      .ai-assist-button {
        padding: 6px 12px;
        font-size: 12px;
        background: #006ccc;
        color: white;
        border: none;
        border-radius: 3px;
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
        background: #28a745;
        color: white;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        transition: background 0.2s ease;
      }

      .ai-master-button:hover {
        background: #218838;
      }

      .ai-master-button:active {
        background: #1e7e34;
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
        background: #28a745;
      }

      .ai-assist-button.error {
        background: #dc3545;
      }
      
      @keyframes pulse {
        0%, 100% { opacity: 0.7; }
        50% { opacity: 1; }
      }
    `;
    
    document.head.appendChild(style);
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
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
    
  }
} 