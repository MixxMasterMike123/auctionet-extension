// modules/ui-manager.js - UI Management Module
export class UIManager {
  constructor(apiManager, qualityAnalyzer) {
    this.apiManager = apiManager;
    this.qualityAnalyzer = qualityAnalyzer;
    this.originalValues = new Map();
  }

  injectUI() {
    console.log('Injecting UI elements...');
    
    // Add AI assistance button next to each field
    const titleField = document.querySelector('#item_title_sv');
    const descriptionField = document.querySelector('#item_description_sv');
    const conditionField = document.querySelector('#item_condition_sv');
    const keywordsField = document.querySelector('#item_hidden_keywords');

    console.log('Found fields:', {
      title: !!titleField,
      description: !!descriptionField,
      condition: !!conditionField,
      keywords: !!keywordsField
    });

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
    this.addQualityIndicator();
    this.injectStyles();
    
    // Setup auto-resize for all textareas
    this.setupAutoResizeForAllTextareas();
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
    
    field.parentElement.appendChild(wrapper);
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
    
    const sidebar = document.querySelector('.grid-col4');
    if (sidebar) {
      console.log('✅ Adding quality indicator to sidebar');
      sidebar.insertBefore(indicator, sidebar.firstChild);
      
      // Add event listener for manual refresh button
      const refreshButton = indicator.querySelector('.refresh-quality-btn');
      if (refreshButton) {
        console.log('✅ Manual refresh button found, adding listener');
        refreshButton.addEventListener('click', async () => {
          console.log('🔄 Manual quality refresh triggered');
          await this.qualityAnalyzer.analyzeQuality();
        });
      }
      
      // Set up live quality monitoring
      console.log('🚀 Setting up live quality monitoring...');
      this.qualityAnalyzer.setupLiveQualityUpdates();
      console.log('✅ Live quality monitoring setup complete');
      
      // Note: Initial quality analysis will be called after API key is loaded
    } else {
      console.log('❌ Sidebar not found - cannot add quality indicator');
    }
  }

  injectStyles() {
    if (!document.getElementById('ai-extension-styles')) {
      const style = document.createElement('style');
      style.id = 'ai-extension-styles';
      style.textContent = this.getStylesCSS();
      document.head.appendChild(style);
    }
  }

  getStylesCSS() {
    return `
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
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 2px 6px rgba(40, 167, 69, 0.3);
      }
      
      .ai-master-button:hover {
        background: linear-gradient(135deg, #218838 0%, #1e7e34 100%);
        transform: translateY(-1px);
        box-shadow: 0 3px 8px rgba(40, 167, 69, 0.4);
      }
      
      .ai-button-wrapper {
        margin-top: 12px;
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
      }
      
      .ai-assist-button {
        background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 2px 4px rgba(0, 123, 255, 0.3);
      }
      
      .ai-assist-button:hover {
        background: linear-gradient(135deg, #0056b3 0%, #004085 100%);
        transform: translateY(-1px);
        box-shadow: 0 3px 6px rgba(0, 123, 255, 0.4);
      }
      
      .ai-undo-wrapper {
        margin-top: 6px;
        margin-bottom: 20px;
        display: flex;
        justify-content: flex-start;
        align-items: center;
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
        margin: 0; /* Remove margin-left, use wrapper for positioning */
      }
      
      .ai-undo-button:hover {
        background: linear-gradient(135deg, #c82333 0%, #a71e2a 100%);
        transform: translateY(-1px);
        box-shadow: 0 3px 6px rgba(220, 53, 69, 0.4);
      }
      
      .ai-updated {
        background-color: #d4edda !important;
        border: 2px solid #28a745 !important;
        transition: all 0.3s ease;
      }
      
      /* Auto-resize textarea styling */
      textarea.auto-resize {
        resize: vertical;
        min-height: 60px;
        max-height: 400px;
        transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        overflow-y: auto;
      }
      
      /* Ensure textarea doesn't show scrollbars when auto-resizing */
      textarea.auto-resize:not(:focus) {
        overflow-y: hidden;
      }
      

      
      /* Smooth resize animation enhancement */
      .auto-resize.resizing {
        transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
      }
      
      .quality-warnings {
        margin-top: 15px;
        padding-top: 15px;
        border-top: 1px solid #dee2e6;
      }
      
      .quality-warnings ul {
        margin: 0;
        padding-left: 0;
        list-style-type: none;
      }
      
      .quality-warnings li {
        margin-bottom: 10px;
        font-size: 12px;
        font-weight: 400;
        line-height: 1.4;
        padding: 8px 12px;
        border-radius: 6px;
        border-left: 4px solid;
      }
      
      .warning-high {
        color: #721c24;
        background-color: #f8d7da;
        border-left-color: #dc3545;
        font-weight: 400;
      }
      
      .warning-medium {
        color: #084298;
        background-color: #cff4fc;
        border-left-color: #0d6efd;
        font-weight: 400;
      }
      
      .warning-low {
        color: #495057;
        background-color: #f8f9fa;
        border-left-color: #6c757d;
        font-style: italic;
      }
      
      .no-warnings {
        color: #0f5132;
        background-color: #d1e7dd;
        border-left: 4px solid #198754;
        font-weight: 600;
        text-align: center;
        margin: 0;
        font-size: 14px;
        padding: 12px;
        border-radius: 6px;
      }
    `;
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
      // Store original value
      this.originalValues.set(fieldType, field.value);
      
      // Validate and limit keywords if necessary
      let finalValue = value;
      if (fieldType === 'keywords') {
        finalValue = this.validateAndLimitKeywords(value);
      }
      
      // Apply new value with animation
      field.classList.add('ai-updated');
      field.value = finalValue;
      
      // Auto-resize textarea if needed (especially for description)
      if (field.tagName.toLowerCase() === 'textarea') {
        // Use setTimeout to ensure the value is fully applied before resizing
        setTimeout(() => {
          this.autoResizeTextarea(field);
        }, 50);
      }
      
      // Trigger change event
      field.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Add undo button
      this.addUndoButton(field, fieldType);
    }
  }

  validateAndLimitKeywords(keywords) {
    if (!keywords || typeof keywords !== 'string') {
      return keywords;
    }
    
    const keywordArray = keywords.split(',')
      .map(kw => kw.trim())
      .filter(kw => kw.length > 0)
      .filter(kw => kw.length >= 3);
    
    if (keywordArray.length > 12) {
      console.warn(`Too many keywords (${keywordArray.length}), limiting to 12`);
      const limitedKeywords = keywordArray.slice(0, 12);
      return limitedKeywords.join(', ');
    }
    
    return keywordArray.join(', ');
  }

  addUndoButton(field, fieldType) {
    // Remove existing undo wrapper (which contains the button)
    const existingUndoWrapper = field.parentElement.querySelector('.ai-undo-wrapper');
    if (existingUndoWrapper) {
      existingUndoWrapper.remove();
    }
    
    // Also check for old-style undo buttons (for backwards compatibility)
    const existingUndo = field.parentElement.querySelector('.ai-undo-button');
    if (existingUndo) {
      existingUndo.remove();
    }
    
    // Create undo button with proper wrapper for alignment
    const undoButton = document.createElement('button');
    undoButton.className = 'ai-undo-button';
    undoButton.textContent = '↩ Ångra';
    undoButton.type = 'button';
    
    // Create wrapper for proper alignment and spacing
    const undoWrapper = document.createElement('div');
    undoWrapper.className = 'ai-undo-wrapper';
    undoWrapper.appendChild(undoButton);
    
    undoButton.addEventListener('click', () => {
      const originalValue = this.originalValues.get(fieldType);
      if (originalValue !== undefined) {
        field.value = originalValue;
        field.classList.remove('ai-updated');
        undoWrapper.remove(); // Remove the wrapper instead of just the button
      }
    });
    
    field.parentElement.appendChild(undoWrapper);
  }

  autoResizeTextarea(textarea) {
    if (!textarea || textarea.tagName.toLowerCase() !== 'textarea') {
      return;
    }
    
    console.log('🔧 Auto-resizing textarea:', textarea.id);
    
    // Add resizing class for enhanced animation
    textarea.classList.add('resizing');
    
    // Reset height to auto to get the correct scrollHeight
    const originalHeight = textarea.style.height;
    textarea.style.height = 'auto';
    
    // Calculate the required height
    const scrollHeight = textarea.scrollHeight;
    const minHeight = 60; // Minimum height in pixels
    const maxHeight = 400; // Maximum height in pixels
    
    // Set the new height with smooth animation
    const newHeight = Math.max(minHeight, Math.min(maxHeight, scrollHeight));
    
    // Use requestAnimationFrame for smooth animation
    requestAnimationFrame(() => {
      textarea.style.height = newHeight + 'px';
      
      // Remove resizing class after animation completes
      setTimeout(() => {
        textarea.classList.remove('resizing');
      }, 400);
    });
    
    console.log(`📏 Textarea resized from ${originalHeight} to ${newHeight}px (scroll: ${scrollHeight}px)`);
  }

  setupAutoResizeForAllTextareas() {
    console.log('🔧 Setting up auto-resize for all textareas...');
    
    const textareas = document.querySelectorAll('textarea');
    let setupCount = 0;
    
    textareas.forEach(textarea => {
      // Add CSS class for styling
      textarea.classList.add('auto-resize');
      
      // Set up auto-resize on input
      const autoResizeHandler = () => {
        this.autoResizeTextarea(textarea);
      };
      
      // Add event listeners
      textarea.addEventListener('input', autoResizeHandler);
      textarea.addEventListener('paste', autoResizeHandler);
      textarea.addEventListener('keyup', autoResizeHandler);
      
      // Also resize on focus to handle cases where content was added programmatically
      textarea.addEventListener('focus', autoResizeHandler);
      
      // Initial resize to fit existing content
      this.autoResizeTextarea(textarea);
      
      setupCount++;
      console.log(`✅ Auto-resize setup for textarea: ${textarea.id || textarea.name || 'unnamed'}`);
    });
    
    console.log(`🎯 Auto-resize setup complete for ${setupCount} textareas`);
  }

  // Method to manually trigger resize for all textareas (useful after programmatic changes)
  resizeAllTextareas() {
    const textareas = document.querySelectorAll('textarea.auto-resize');
    textareas.forEach(textarea => {
      this.autoResizeTextarea(textarea);
    });
    console.log(`🔄 Manual resize triggered for ${textareas.length} textareas`);
  }

  // Method to run initial quality analysis (called after API key is loaded)
  async runInitialQualityAnalysis() {
    console.log('📊 Running initial quality analysis...');
    try {
      await this.qualityAnalyzer.analyzeQuality();
    } catch (error) {
      console.error('Error in initial quality analysis:', error);
    }
  }
} 