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
        refreshButton.addEventListener('click', () => {
          console.log('🔄 Manual quality refresh triggered');
          this.qualityAnalyzer.analyzeQuality();
        });
      }
      
      // Set up live quality monitoring
      console.log('🚀 Setting up live quality monitoring...');
      this.qualityAnalyzer.setupLiveQualityUpdates();
      console.log('✅ Live quality monitoring setup complete');
      
      // Initial quality analysis
      console.log('📊 Running initial quality analysis...');
      this.qualityAnalyzer.analyzeQuality();
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
        background: linear-gradient(145deg, rgba(255, 255, 255, 0.9) 0%, rgba(248, 249, 250, 0.8) 100%);
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 20px;
        padding: 24px;
        margin-bottom: 24px;
        backdrop-filter: blur(20px);
        box-shadow: 
          0 8px 32px rgba(0, 0, 0, 0.08),
          0 4px 16px rgba(0, 0, 0, 0.04),
          inset 0 1px 0 rgba(255, 255, 255, 0.9);
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
        overflow: hidden;
      }
      
      .quality-indicator::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent 0%, rgba(0, 123, 255, 0.3) 50%, transparent 100%);
      }
      
      .quality-indicator:hover {
        transform: translateY(-2px);
        box-shadow: 
          0 12px 40px rgba(0, 0, 0, 0.12),
          0 6px 20px rgba(0, 0, 0, 0.06),
          inset 0 1px 0 rgba(255, 255, 255, 0.9);
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
        padding: 12px 20px;
        font-size: 14px;
        font-weight: 600;
        background: linear-gradient(145deg, #28a745 0%, #20c997 100%);
        color: white;
        border: none;
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 
          0 4px 16px rgba(40, 167, 69, 0.25),
          0 2px 8px rgba(40, 167, 69, 0.15);
        position: relative;
        overflow: hidden;
      }
      
      .ai-master-button::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.2) 50%, transparent 100%);
        transition: left 0.6s ease;
      }
      
      .ai-master-button:hover::before {
        left: 100%;
      }
      
      .ai-master-button:hover {
        background: linear-gradient(145deg, #218838 0%, #1e7e34 100%);
        transform: translateY(-2px) scale(1.02);
        box-shadow: 
          0 8px 24px rgba(40, 167, 69, 0.35),
          0 4px 12px rgba(40, 167, 69, 0.25);
      }
      
      .ai-button-wrapper {
        margin-top: 12px;
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
      }
      
      .ai-assist-button {
        background: linear-gradient(145deg, #007bff 0%, #0056b3 100%);
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 10px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 
          0 3px 8px rgba(0, 123, 255, 0.25),
          0 1px 4px rgba(0, 123, 255, 0.15);
        position: relative;
        overflow: hidden;
      }
      
      .ai-assist-button::before {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.15) 50%, transparent 100%);
        transition: left 0.5s ease;
      }
      
      .ai-assist-button:hover::before {
        left: 100%;
      }
      
      .ai-assist-button:hover {
        background: linear-gradient(145deg, #0056b3 0%, #004085 100%);
        transform: translateY(-1px) scale(1.05);
        box-shadow: 
          0 6px 16px rgba(0, 123, 255, 0.35),
          0 3px 8px rgba(0, 123, 255, 0.25);
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
        margin-left: 12px;
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
      
      /* 2025 Modern Field Styling */
      input[type="text"], 
      input[type="email"], 
      input[type="number"], 
      textarea, 
      select {
        background: linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%) !important;
        border: 2px solid transparent !important;
        border-radius: 12px !important;
        padding: 12px 16px !important;
        font-size: 14px !important;
        font-weight: 400 !important;
        color: #2c3e50 !important;
        box-shadow: 
          0 2px 8px rgba(0, 0, 0, 0.04),
          0 1px 3px rgba(0, 0, 0, 0.08),
          inset 0 1px 0 rgba(255, 255, 255, 0.9) !important;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        backdrop-filter: blur(10px) !important;
        position: relative !important;
      }
      
      /* Focus states with modern glow */
      input[type="text"]:focus, 
      input[type="email"]:focus, 
      input[type="number"]:focus, 
      textarea:focus, 
      select:focus {
        outline: none !important;
        border: 2px solid #007bff !important;
        background: linear-gradient(145deg, #ffffff 0%, #f0f8ff 100%) !important;
        box-shadow: 
          0 0 0 4px rgba(0, 123, 255, 0.1),
          0 4px 16px rgba(0, 123, 255, 0.15),
          0 2px 8px rgba(0, 0, 0, 0.08),
          inset 0 1px 0 rgba(255, 255, 255, 0.9) !important;
        transform: translateY(-1px) !important;
      }
      
      /* Hover states */
      input[type="text"]:hover:not(:focus), 
      input[type="email"]:hover:not(:focus), 
      input[type="number"]:hover:not(:focus), 
      textarea:hover:not(:focus), 
      select:hover:not(:focus) {
        border: 2px solid #e9ecef !important;
        box-shadow: 
          0 4px 12px rgba(0, 0, 0, 0.06),
          0 2px 6px rgba(0, 0, 0, 0.1),
          inset 0 1px 0 rgba(255, 255, 255, 0.9) !important;
        transform: translateY(-0.5px) !important;
      }
      
      /* Labels with modern typography */
      label {
        font-weight: 600 !important;
        color: #374151 !important;
        font-size: 13px !important;
        letter-spacing: 0.025em !important;
        margin-bottom: 8px !important;
        display: block !important;
      }
      
      /* Modern button styling for form buttons */
      .btn, button:not(.ai-assist-button):not(.ai-master-button):not(.refresh-quality-btn):not(.ai-undo-button) {
        background: linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%) !important;
        border: 2px solid #e9ecef !important;
        border-radius: 10px !important;
        padding: 10px 20px !important;
        font-weight: 500 !important;
        color: #495057 !important;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        box-shadow: 
          0 2px 6px rgba(0, 0, 0, 0.04),
          0 1px 3px rgba(0, 0, 0, 0.08) !important;
      }
      
      .btn:hover, button:not(.ai-assist-button):not(.ai-master-button):not(.refresh-quality-btn):not(.ai-undo-button):hover {
        border: 2px solid #007bff !important;
        background: linear-gradient(145deg, #f0f8ff 0%, #ffffff 100%) !important;
        transform: translateY(-1px) !important;
        box-shadow: 
          0 4px 12px rgba(0, 123, 255, 0.15),
          0 2px 6px rgba(0, 0, 0, 0.1) !important;
      }
      
      /* Primary buttons */
      .btn-primary {
        background: linear-gradient(145deg, #007bff 0%, #0056b3 100%) !important;
        border: 2px solid transparent !important;
        color: white !important;
      }
      
      .btn-primary:hover {
        background: linear-gradient(145deg, #0056b3 0%, #004085 100%) !important;
        border: 2px solid transparent !important;
        color: white !important;
      }
      
      /* Success buttons */
      .btn-success {
        background: linear-gradient(145deg, #28a745 0%, #20c997 100%) !important;
        border: 2px solid transparent !important;
        color: white !important;
      }
      
      .btn-success:hover {
        background: linear-gradient(145deg, #218838 0%, #1e7e34 100%) !important;
        border: 2px solid transparent !important;
        color: white !important;
      }
      
      /* Modern card styling for form sections */
      .form-group, .field-group, .control-group {
        background: rgba(255, 255, 255, 0.7) !important;
        border-radius: 16px !important;
        padding: 20px !important;
        margin-bottom: 20px !important;
        backdrop-filter: blur(10px) !important;
        border: 1px solid rgba(255, 255, 255, 0.2) !important;
        box-shadow: 
          0 4px 16px rgba(0, 0, 0, 0.04),
          0 2px 8px rgba(0, 0, 0, 0.06) !important;
      }
      
      /* Smooth resize animation enhancement */
      .auto-resize.resizing {
        transition: height 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) !important;
        box-shadow: 
          0 0 0 3px rgba(0, 123, 255, 0.1),
          0 4px 16px rgba(0, 123, 255, 0.1),
          0 2px 8px rgba(0, 0, 0, 0.08) !important;
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
    const existingUndo = field.parentElement.querySelector('.ai-undo-button');
    if (existingUndo) {
      existingUndo.remove();
    }
    
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
    
    field.parentElement.appendChild(undoButton);
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


} 