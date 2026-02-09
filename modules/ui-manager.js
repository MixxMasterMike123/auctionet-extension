// modules/ui-manager.js - UI Management Module
export class UIManager {
  constructor(apiManager, qualityAnalyzer) {
    this.apiManager = apiManager;
    this.qualityAnalyzer = qualityAnalyzer;
    this.originalValues = new Map();
  }

  injectUI() {
    // Add AI assistance button next to each field
    const titleField = document.querySelector('#item_title_sv');
    const descriptionField = document.querySelector('#item_description_sv');
    const conditionField = document.querySelector('#item_condition_sv');
    const keywordsField = document.querySelector('#item_hidden_keywords');

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
    
    // Check if wrapper already exists for this field
    let wrapper = field.parentNode.querySelector('.ai-button-wrapper');
    
    if (!wrapper) {
      // Create new wrapper if none exists
      wrapper = document.createElement('div');
      wrapper.className = 'ai-button-wrapper';
      
      // Position right after the field element, not at the end of parent
      field.parentNode.insertBefore(wrapper, field.nextSibling);
    }
    
    wrapper.appendChild(button);
  }

  addQualityIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'quality-indicator';
    indicator.innerHTML = `
      <h4 class="quality-title">Katalogiseringskvalitet</h4>
      <div class="quality-header">
        <div class="quality-score-container">
          <span class="quality-score">Analyserar...</span>
          <button class="refresh-quality-btn" type="button" title="Uppdatera kvalitetspoäng">🔄</button>
        </div>
        <button class="ai-assist-button ai-master-button" type="button">Förbättra alla fält</button>
      </div>
      <div class="quality-warnings"></div>
    `;
    
    const sidebar = document.querySelector('.grid-col4');
    if (sidebar) {
      sidebar.insertBefore(indicator, sidebar.firstChild);
      
      // Add event listener for manual refresh button
      const refreshButton = indicator.querySelector('.refresh-quality-btn');
      if (refreshButton) {
        refreshButton.addEventListener('click', async () => {
          await this.qualityAnalyzer.analyzeQuality();
        });
      }
      
      // Set up live quality monitoring
      try {
        this.qualityAnalyzer.setupLiveQualityUpdates();
      } catch (error) {
        console.error('Error setting up live quality monitoring:', error);
      }
      
      // Note: Initial quality analysis will be called after API key is loaded
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
        margin-top: 0px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        margin-bottom: 12px;
        max-width: 300px;
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
        transition: all 0.3s ease;
      }

      .ai-assist-button[data-field-type="title-correct"]:hover {
        background: #B17200;
      }

      .ai-assist-button[data-field-type="title-correct"]:active {
        background: #A16600;
      }


      
      .ai-undo-button {
        background: transparent;
        color: #dc3545;
        border: 1px solid #dc3545;
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        margin-left: auto;
      }
      
      .ai-undo-button:hover {
        background: #dc3545;
        color: white;
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
      'title-correct': '#item_title_sv',  // title-correct applies to title field
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
      const limitedKeywords = keywordArray.slice(0, 12);
      return limitedKeywords.join(', ');
    }
    
    return keywordArray.join(', ');
  }

  addUndoButton(field, fieldType) {
    // Find the AI button wrapper reliably via the button's data-field-type attribute
    // (works regardless of how deep the field is nested in the DOM)
    const searchType = fieldType === 'title-correct' ? 'title' : fieldType;
    const aiButton = document.querySelector(`.ai-assist-button[data-field-type="${searchType}"]`);
    const wrapper = aiButton?.closest('.ai-button-wrapper');
    if (!wrapper) return;

    // Remove any existing undo button in this wrapper
    const existingUndo = wrapper.querySelector('.ai-undo-button');
    if (existingUndo) {
      existingUndo.remove();
    }

    // Also clean up old-style undo wrappers if present
    const existingUndoWrapper = field.parentElement?.querySelector('.ai-undo-wrapper');
    if (existingUndoWrapper) {
      existingUndoWrapper.remove();
    }

    // Create undo button directly inside the button wrapper (no separate wrapper)
    const undoButton = document.createElement('button');
    undoButton.className = 'ai-undo-button';
    undoButton.textContent = '↩ Ångra';
    undoButton.type = 'button';

    undoButton.addEventListener('click', () => {
      const originalValue = this.originalValues.get(fieldType);
      if (originalValue !== undefined) {
        field.value = originalValue;
        field.classList.remove('ai-updated');
        undoButton.remove();
      }
    });

    wrapper.appendChild(undoButton);
  }

  autoResizeTextarea(textarea) {
    if (!textarea || textarea.tagName.toLowerCase() !== 'textarea') {
      return;
    }
    
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
    
  }

  setupAutoResizeForAllTextareas() {
    
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
    });
  }

  // Method to manually trigger resize for all textareas (useful after programmatic changes)
  resizeAllTextareas() {
    const textareas = document.querySelectorAll('textarea.auto-resize');
    textareas.forEach(textarea => {
      this.autoResizeTextarea(textarea);
    });
  }

  // Method to run initial quality analysis (called after API key is loaded)
  async runInitialQualityAnalysis() {
    try {
      await this.qualityAnalyzer.analyzeQuality();
    } catch (error) {
      console.error('Error in initial quality analysis:', error);
    }
  }

  // Enhanced styling for different warning types
  getWarningStyle(severity) {
    const baseStyle = `
      margin: 8px 0;
      padding: 12px;
      border-radius: 6px;
      border-left: 4px solid;
      font-size: 13px;
      line-height: 1.4;
    `;
    
    switch (severity) {
      case 'critical':
        return baseStyle + `
          background-color: #fee;
          border-left-color: #e74c3c;
          color: #c0392b;
        `;
      case 'high':
        return baseStyle + `
          background-color: #fff3cd;
          border-left-color: #f39c12;
          color: #d68910;
        `;
      case 'medium':
        return baseStyle + `
          background-color: #d1ecf1;
          border-left-color: #3498db;
          color: #2980b9;
        `;
      case 'low':
        return baseStyle + `
          background-color: #f8f9fa;
          border-left-color: #6c757d;
          color: #495057;
        `;
      case 'header':
        return `
          margin: 16px 0 8px 0;
          padding: 8px 12px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-radius: 6px;
          font-weight: 600;
          font-size: 14px;
          text-align: center;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        `;
      case 'market-primary':
        return baseStyle + `
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-left-color: #667eea;
          color: white;
          font-weight: 600;
          font-size: 14px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        `;
      case 'market-insight':
        return baseStyle + `
          background-color: #e8f5e8;
          border-left-color: #27ae60;
          color: #1e8449;
          font-weight: 500;
        `;
      case 'market-data':
        return baseStyle + `
          background-color: #f0f8ff;
          border-left-color: #3498db;
          color: #2c3e50;
          font-size: 12px;
          padding: 8px 12px;
        `;
      case 'market-activity':
        return baseStyle + `
          background-color: #fff5f5;
          border-left-color: #e74c3c;
          color: #c0392b;
          font-weight: 500;
        `;
      case 'market-note':
        return baseStyle + `
          background-color: #f8f9fa;
          border-left-color: #95a5a6;
          color: #7f8c8d;
          font-size: 12px;
          font-style: italic;
          padding: 8px 12px;
        `;
      default:
        return baseStyle + `
          background-color: #f8f9fa;
          border-left-color: #6c757d;
          color: #495057;
        `;
    }
  }

  // Enhanced warning display with better formatting
  displayWarning(warning) {
    const warningDiv = document.createElement('div');
    warningDiv.style.cssText = this.getWarningStyle(warning.severity);
    
    // Handle header-only warnings (like the API data header)
    if (warning.severity === 'header') {
      warningDiv.innerHTML = `<strong>${warning.field}</strong>`;
      return warningDiv;
    }
    
    // Handle regular warnings with field and issue
    if (warning.field && warning.issue) {
      warningDiv.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 8px;">
          <strong style="min-width: 120px; font-size: 12px; opacity: 0.8;">${warning.field}:</strong>
          <span style="flex: 1;">${warning.issue}</span>
        </div>
      `;
    } else if (warning.issue) {
      // Issue only (for market data)
      warningDiv.innerHTML = warning.issue;
    } else if (warning.field) {
      // Field only (for headers)
      warningDiv.innerHTML = `<strong>${warning.field}</strong>`;
    }
    
    return warningDiv;
  }
} 