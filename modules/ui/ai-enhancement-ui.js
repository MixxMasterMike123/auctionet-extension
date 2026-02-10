// modules/ui/ai-enhancement-ui.js
// Reusable UI Components for AI Enhancement

export class AIEnhancementUI {
  constructor(enhancementEngine, options = {}) {
    this.enhancementEngine = enhancementEngine;
    this.options = {
      // UI configuration
      pageType: 'edit', // 'edit' or 'add'
      showQualityIndicator: true,
      buttonStyle: 'default', // 'default', 'modern', 'minimal'
      placement: 'inline', // 'inline', 'sidebar', 'floating'
      ...options
    };
    
    this.activeIndicators = new Map(); // Track loading states
    this.fieldMappings = {
      title: '#item_title_sv',
      description: '#item_description_sv', 
      condition: '#item_condition_sv',
      artist: '#item_artist_name_sv',
      keywords: '#item_hidden_keywords'
    };
  }

  /**
   * Initialize the AI enhancement UI
   */
  init() {
    
    this.injectAIButtons();
    
    if (this.options.showQualityIndicator) {
      this.addQualityIndicator();
    }
    
    this.attachEventListeners();
    this.injectStyles();
    
  }

  /**
   * Inject AI buttons next to form fields
   */
  injectAIButtons() {
    const fieldConfigs = [
      { field: 'title', text: 'Förbättra titel' },
      { field: 'description', text: 'Förbättra beskrivning' },
      { field: 'condition', text: 'Förbättra kondition' },
      { field: 'keywords', text: 'Generera sökord' }
    ];

    fieldConfigs.forEach(config => {
      const fieldElement = document.querySelector(this.fieldMappings[config.field]);
      if (fieldElement) {
        this.addAIButton(fieldElement, config.field, config.text);
      }
    });
  }

  /**
   * Add individual AI button next to a field
   * @param {HTMLElement} field - Target form field
   * @param {string} type - Field type
   * @param {string} buttonText - Button label
   */
  addAIButton(field, type, buttonText) {
    // Remove existing button if present
    const existingWrapper = field.parentElement.querySelector('.ai-button-wrapper');
    if (existingWrapper) {
      existingWrapper.remove();
    }

    const button = document.createElement('button');
    button.className = this.getButtonClasses(type);
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
   * Add quality indicator with master improvement button
   */
  addQualityIndicator() {
    const indicator = document.createElement('div');
    indicator.className = this.getQualityIndicatorClasses();
    indicator.innerHTML = this.getQualityIndicatorHTML();
    
    const targetElement = this.findQualityIndicatorPlacement();
    
    if (targetElement) {
      if (targetElement.tagName === 'FORM') {
        targetElement.insertBefore(indicator, targetElement.firstChild);
      } else {
        targetElement.insertBefore(indicator, targetElement.firstChild);
      }
      
    }
  }

  /**
   * Get button CSS classes based on page type and style
   * @param {string} fieldType - Type of field
   * @returns {string} CSS class names
   */
  getButtonClasses(fieldType) {
    const baseClass = 'ai-assist-button';
    
    if (this.options.pageType === 'add') {
      return `${baseClass} ${baseClass}--modern ${baseClass}--${fieldType}`;
    } else {
      return `${baseClass} ${baseClass}--edit ${baseClass}--${fieldType}`;
    }
  }

  /**
   * Get quality indicator CSS classes
   * @returns {string} CSS class names
   */
  getQualityIndicatorClasses() {
    const baseClass = 'quality-indicator';
    
    if (this.options.pageType === 'add') {
      return `${baseClass} ${baseClass}--modern`;
    } else {
      return `${baseClass} ${baseClass}--edit`;
    }
  }

  /**
   * Get quality indicator HTML content
   * @returns {string} HTML content
   */
  getQualityIndicatorHTML() {
    if (this.options.pageType === 'add') {
      // Modern design for add page
      return `
        <div class="quality-header quality-header--modern">
          <h4 class="quality-title">✨ Auctionet Kvalitetskontroll</h4>
          <div class="quality-score-container">
            <div class="quality-score-badge">
              <span class="quality-score">Analyserar...</span>
            </div>
            <button class="refresh-quality-btn refresh-quality-btn--modern" type="button" title="Uppdatera kvalitetspoäng">🔄</button>
          </div>
          <button class="ai-assist-button ai-master-button ai-master-button--modern" type="button">
            ⚡ Förbättra alla fält
          </button>
        </div>`;
    } else {
      // Traditional design for edit page
      return `
        <div class="quality-header">
          <h4 class="quality-title">Auctionet Kvalitetskontroll</h4>
          <div class="quality-score-container">
            <span class="quality-score">Analyserar...</span>
            <button class="refresh-quality-btn" type="button" title="Uppdatera kvalitetspoäng">🔄</button>
          </div>
          <button class="ai-assist-button ai-master-button" type="button">Förbättra alla fält</button>
        </div>`;
    }
  }

  /**
   * Find the best placement for quality indicator
   * @returns {HTMLElement} Target element for placement
   */
  findQualityIndicatorPlacement() {
    if (this.options.pageType === 'add') {
      // Try add page specific locations
      return document.querySelector('.grid-col4') || 
             document.querySelector('.sidebar') ||
             document.querySelector('.form-sidebar') ||
             document.querySelector('form');
    } else {
      // Try edit page specific locations
      return document.querySelector('.sidebar') ||
             document.querySelector('.grid-col4') ||
             document.querySelector('form');
    }
  }

  /**
   * Attach event listeners to AI buttons
   */
  attachEventListeners() {
    // Individual field buttons
    const buttons = document.querySelectorAll('.ai-assist-button:not(.ai-master-button)');
    buttons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const fieldType = e.target.dataset.fieldType;
        if (fieldType) {
          this.handleFieldImprovement(fieldType);
        }
      });
    });

    // Master button
    const masterButton = document.querySelector('.ai-master-button');
    if (masterButton) {
      masterButton.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleAllFieldsImprovement();
      });
    }

    // Quality refresh button
    const refreshButton = document.querySelector('.refresh-quality-btn');
    if (refreshButton) {
      refreshButton.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleQualityRefresh();
      });
    }
  }

  /**
   * Handle individual field improvement
   * @param {string} fieldType - Type of field to improve
   */
  async handleFieldImprovement(fieldType) {
    try {
      this.showLoadingIndicator(fieldType);
      
      // Extract current form data (this should be provided by the parent component)
      const formData = this.extractFormData();
      
      // Use enhancement engine
      const improvements = await this.enhancementEngine.improveField(formData, fieldType);
      
      if (improvements[fieldType]) {
        this.applyImprovement(fieldType, improvements[fieldType]);
        this.showSuccessIndicator(fieldType);
        
        // Trigger quality re-analysis after improvement
        setTimeout(() => this.handleQualityRefresh(), 500);
      } else {
        throw new Error(`No ${fieldType} improvement received`);
      }
      
    } catch (error) {
      console.error(`Error improving ${fieldType}:`, error);
      this.showErrorIndicator(fieldType, error.message);
    }
  }

  /**
   * Handle all fields improvement
   */
  async handleAllFieldsImprovement() {
    try {
      this.showLoadingIndicator('all');
      
      const formData = this.extractFormData();
      const improvements = await this.enhancementEngine.improveAllFields(formData);
      
      // Apply improvements with staggered animation
      this.applyAllImprovements(improvements);
      
      // Trigger quality re-analysis
      setTimeout(() => this.handleQualityRefresh(), 1000);
      
    } catch (error) {
      console.error('Error improving all fields:', error);
      this.showErrorIndicator('all', error.message);
    }
  }

  /**
   * Handle quality refresh
   */
  handleQualityRefresh() {
    // This should be implemented by the parent component
    // as it depends on the specific quality analysis logic
    
    // Dispatch custom event for parent to handle
    document.dispatchEvent(new CustomEvent('ai-quality-refresh-requested', {
      detail: { source: 'ai-enhancement-ui' }
    }));
  }

  /**
   * Extract form data (to be overridden by parent)
   * @returns {Object} Current form data
   */
  extractFormData() {
    const data = {};
    
    Object.entries(this.fieldMappings).forEach(([key, selector]) => {
      const element = document.querySelector(selector);
      if (element) {
        data[key] = element.value || '';
      }
    });
    
    return data;
  }

  /**
   * Apply field improvement
   * @param {string} fieldType - Field type
   * @param {string} value - New value
   */
  applyImprovement(fieldType, value) {
    const element = document.querySelector(this.fieldMappings[fieldType]);
    if (element) {
      element.value = value;
      
      // Trigger input event for form validation
      element.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Auto-resize if it's a textarea
      if (element.tagName === 'TEXTAREA') {
        this.autoResizeTextarea(element);
      }
    }
  }

  /**
   * Apply all improvements with staggered animation
   * @param {Object} improvements - Object with field improvements
   */
  applyAllImprovements(improvements) {
    const fields = ['title', 'description', 'condition', 'keywords'];
    let delay = 0;
    
    fields.forEach(field => {
      if (improvements[field]) {
        setTimeout(() => {
          this.applyImprovement(field, improvements[field]);
          this.showSuccessIndicator(field);
        }, delay);
        delay += 300; // 300ms between each field
      }
    });
  }

  /**
   * Auto-resize textarea
   * @param {HTMLTextAreaElement} textarea - Textarea element
   */
  autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

  /**
   * Show loading indicator for a field
   * @param {string} fieldType - Field type or 'all'
   */
  showLoadingIndicator(fieldType) {
    // Implementation will depend on the specific UI design
  }

  /**
   * Show success indicator for a field
   * @param {string} fieldType - Field type
   */
  showSuccessIndicator(fieldType) {
    // Implementation will depend on the specific UI design
  }

  /**
   * Show error indicator for a field
   * @param {string} fieldType - Field type
   * @param {string} message - Error message
   */
  showErrorIndicator(fieldType, message) {
    // Implementation will depend on the specific UI design
    console.error(`Error for ${fieldType}: ${message}`);
  }

  /**
   * Inject CSS styles
   */
  injectStyles() {
    const styleId = 'ai-enhancement-ui-styles';
    
    // Remove existing styles
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) {
      existingStyle.remove();
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = this.getCSS();
    document.head.appendChild(style);
  }

  /**
   * Get CSS styles based on page type
   * @returns {string} CSS content
   */
  getCSS() {
    if (this.options.pageType === 'add') {
      return this.getModernCSS();
    } else {
      return this.getEditPageCSS();
    }
  }

  /**
   * Modern CSS for add page
   * @returns {string} Modern CSS styles
   */
  getModernCSS() {
    return `
      /* Modern AI Enhancement UI for Add Page */
      .ai-button-wrapper {
        margin-top: 0px;
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }
      
      .ai-assist-button--modern {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.3s ease;
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
      }
      
      .ai-assist-button--modern:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      }
      
      .quality-indicator--modern {
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 16px;
        padding: 20px;
        margin-bottom: 20px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
      }
      
      .quality-header--modern {
        text-align: center;
      }
      
      .quality-score-badge {
        background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
        color: white;
        padding: 6px 12px;
        border-radius: 20px;
        font-weight: 600;
        font-size: 14px;
        display: inline-block;
        margin: 8px 0;
      }
      
      .ai-master-button--modern {
        background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
        color: #333;
        border: none;
        padding: 12px 24px;
        border-radius: 25px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.3s ease;
        box-shadow: 0 4px 15px rgba(250, 112, 154, 0.3);
        width: 100%;
        margin-top: 12px;
      }
      
      .ai-master-button--modern:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(250, 112, 154, 0.4);
      }
    `;
  }

  /**
   * Traditional CSS for edit page
   * @returns {string} Edit page CSS styles
   */
  getEditPageCSS() {
    return `
      /* Traditional AI Enhancement UI for Edit Page */
      .ai-button-wrapper {
        margin-top: 0px;
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }
      
      .ai-assist-button--edit {
        background: #007cba;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 11px;
        cursor: pointer;
        transition: background-color 0.2s;
      }
      
      .ai-assist-button--edit:hover {
        background: #005c87;
      }
      
      .quality-indicator--edit {
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 6px;
        padding: 15px;
        margin-bottom: 15px;
      }
      
      .ai-master-button {
        background: #28a745;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        font-weight: 600;
        cursor: pointer;
        width: 100%;
        margin-top: 8px;
      }
      
      .ai-master-button:hover {
        background: #218838;
      }
    `;
  }

  /**
   * Clean up resources
   */
  destroy() {
    
    // Remove event listeners and DOM elements
    const buttons = document.querySelectorAll('.ai-assist-button');
    buttons.forEach(button => {
      button.remove();
    });
    
    const indicators = document.querySelectorAll('.quality-indicator');
    indicators.forEach(indicator => {
      indicator.remove();
    });
    
    // Remove styles
    const style = document.getElementById('ai-enhancement-ui-styles');
    if (style) {
      style.remove();
    }
    
    this.activeIndicators.clear();
    this.enhancementEngine = null;
  }
} 