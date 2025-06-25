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
    console.log('🎨 Adding Progressive AI Analysis button...');
    
    // Only add FreetextParser button for clean, minimal interface
    this.addFreetextParserButton();
    
    // Attach event listeners (mainly for FreetextParser button)
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
   * Add FreetextParser button to the page - SUBTLE VERSION
   */
  addFreetextParserButton() {
    // Check if button already exists to avoid duplicates
    const existingButton = document.querySelector('#freetext-parser-btn');
    if (existingButton) {
      console.log('⚠️ Freetext parser button already exists');
      return;
    }

    // Find the best location - look for the right column (grid-col4)
    const rightColumn = document.querySelector('.grid-col4');
    let insertionPoint = null;
    
    if (rightColumn) {
      insertionPoint = rightColumn;
      console.log('📍 Found right column, will insert at top');
    } else {
      // Fallback: insert near form top
      const formContainer = document.querySelector('.item_form, #new_item');
      if (formContainer) {
        insertionPoint = formContainer;
        console.log('📍 Using form container as fallback');
      }
    }
    
    if (!insertionPoint) {
      console.error('❌ Could not find suitable insertion point for freetext button');
      return;
    }

    // Create a button that matches Auctionet's system button style
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'ai-button-wrapper';
    buttonContainer.style.margin = '20px 0';
    buttonContainer.innerHTML = `
      <button class="btn btn-primary" type="button" id="freetext-parser-btn">
        Progressiv AI-analys
      </button>
    `;

    // Insert the button at the top of the right column or form
    insertionPoint.insertBefore(buttonContainer, insertionPoint.firstChild);
    console.log('📍 Button placed at top of insertion point');
    
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
      
      console.log('✅ Subtle freetext parser button added to AddItem page');
    } else {
      console.error('❌ Failed to find FreetextParser button after creation');
    }
  }





  /**
   * Attach event listeners - simplified for FreetextParser only
   */
  attachAIButtonEventListeners() {
    // No individual field buttons anymore - FreetextParser handles everything
    console.log('✅ Event listeners attached (FreetextParser button handled in addFreetextParserButton)');
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
      
      .ai-button-wrapper {
        margin-top: 0px;
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
        margin-bottom: 20px;
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