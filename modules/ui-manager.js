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
        </div>
        <button class="ai-assist-button ai-master-button" type="button">⚡ Förbättra alla</button>
      </div>
      <div class="quality-warnings"></div>
    `;
    
    const sidebar = document.querySelector('.grid-col4');
    if (sidebar) {
      sidebar.insertBefore(indicator, sidebar.firstChild);
      this.qualityAnalyzer.analyzeQuality();
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
        transition: all 0.3s ease;
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
        transition: all 0.2s ease;
        box-shadow: 0 2px 4px rgba(0, 123, 255, 0.3);
      }
      
      .ai-assist-button:hover {
        background: linear-gradient(135deg, #0056b3 0%, #004085 100%);
        transform: translateY(-1px);
        box-shadow: 0 3px 6px rgba(0, 123, 255, 0.4);
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
      
      // Trigger change event
      field.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Add undo button
      this.addUndoButton(field, fieldType);
      
      // Track AI enhancement in internal comments
      this.addAIEnhancementNote(fieldType);
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

  addAIEnhancementNote(fieldType) {
    const internalCommentsField = document.querySelector('#item_internal_comment');
    if (internalCommentsField) {
      const currentComments = internalCommentsField.value;
      const timestamp = new Date().toLocaleDateString('sv-SE');
      const fieldNames = {
        'title': 'titel',
        'description': 'beskrivning', 
        'condition': 'kondition',
        'keywords': 'sökord'
      };
      
      const enhancementNote = `AI-förbättring ${fieldNames[fieldType]} (${timestamp})`;
      
      if (!currentComments.includes(enhancementNote)) {
        const newComments = currentComments ? 
          `${currentComments}\n${enhancementNote}` : 
          enhancementNote;
        internalCommentsField.value = newComments;
      }
    }
  }
} 