// modules/add-items/ui-feedback.js - UI feedback, loading indicators, and textarea management for add items page

export class AddItemsUIFeedback {
  constructor() {
    this.callbacks = {};
  }

  setCallbacks(callbacks) {
    this.callbacks = callbacks;
  }

  // ==================== LOADING / SUCCESS / ERROR INDICATORS ====================

  showLoadingIndicator(fieldType) {
    this.removeLoadingIndicator(fieldType);
    
    let targetField;
    if (fieldType === 'all') {
      const masterButton = document.querySelector('.ai-master-button');
      if (masterButton) {
        masterButton.textContent = '⏳ Kontrollerar...';
        masterButton.disabled = true;
        masterButton.style.opacity = '0.7';
      }
      
      const allFieldTypes = ['title', 'description', 'condition', 'keywords'];
      allFieldTypes.forEach(type => {
        this.showLoadingIndicator(type);
      });
      return;
    } else {
      const fieldMap = {
        'title': '#item_title_sv',
        'description': '#item_description_sv', 
        'condition': '#item_condition_sv',
        'keywords': '#item_hidden_keywords'
      };
      
      targetField = document.querySelector(fieldMap[fieldType]);
    }
    
    if (!targetField) return;
    
    let fieldContainer = targetField.parentElement;
    
    if (fieldContainer.classList.contains('ai-button-wrapper') || fieldContainer.tagName === 'LABEL') {
      fieldContainer = fieldContainer.parentElement;
    }
    
    fieldContainer.classList.add('field-loading');
    
    const overlay = document.createElement('div');
    overlay.className = 'field-spinner-overlay';
    overlay.dataset.fieldType = fieldType;
    overlay.innerHTML = `
      <div class="ai-spinner"></div>
      <div class="ai-processing-text">Förbättrar...</div>
    `;
    
    const fieldRect = targetField.getBoundingClientRect();
    const containerRect = fieldContainer.getBoundingClientRect();
    
    overlay.style.position = 'absolute';
    overlay.style.top = `${fieldRect.top - containerRect.top}px`;
    overlay.style.left = `${fieldRect.left - containerRect.left}px`;
    overlay.style.width = `${fieldRect.width}px`;
    overlay.style.height = `${fieldRect.height}px`;
    
    fieldContainer.appendChild(overlay);
  }

  showSuccessIndicator(fieldType) {
    this.removeLoadingIndicator(fieldType);
    
    if (fieldType === 'all') {
      const masterButton = document.querySelector('.ai-master-button');
      if (masterButton) {
        masterButton.textContent = '✅ Klart!';
        setTimeout(() => {
          masterButton.textContent = '⚡ Förbättra alla';
          masterButton.disabled = false;
          masterButton.style.opacity = '1';
        }, 2000);
      }
      return;
    }
    
    const fieldMap = {
      'title': '#item_title_sv',
      'description': '#item_description_sv',
      'condition': '#item_condition_sv', 
      'keywords': '#item_hidden_keywords'
    };
    
    const targetField = document.querySelector(fieldMap[fieldType]);
    if (targetField) {
      targetField.classList.add('field-success');
      
      setTimeout(() => {
        targetField.classList.remove('field-success');
      }, 600);
    }
  }

  showErrorIndicator(fieldType, message) {
    console.error(`Error for ${fieldType}: ${message}`);
    
    this.removeLoadingIndicator(fieldType);
    
    if (fieldType === 'all') {
      const masterButton = document.querySelector('.ai-master-button');
      if (masterButton) {
        masterButton.textContent = '❌ Fel uppstod';
        masterButton.disabled = false;
        masterButton.style.opacity = '1';
        setTimeout(() => {
          masterButton.textContent = '⚡ Förbättra alla';
        }, 3000);
      }
    }
    
    alert(`Fel vid förbättring av ${fieldType}: ${message}`);
  }
  
  removeLoadingIndicator(fieldType) {
    if (fieldType === 'all') {
      const allFieldTypes = ['title', 'description', 'condition', 'keywords'];
      allFieldTypes.forEach(type => {
        this.removeLoadingIndicator(type);
      });
      return;
    }
    
    const overlay = document.querySelector(`.field-spinner-overlay[data-field-type="${fieldType}"]`);
    if (overlay) {
      const container = overlay.parentElement;
      container.classList.remove('field-loading');
      overlay.remove();
    }
    
    document.querySelectorAll('.field-loading').forEach(container => {
      const overlays = container.querySelectorAll('.field-spinner-overlay');
      if (overlays.length === 0) {
        container.classList.remove('field-loading');
      }
    });
  }

  // ==================== FEEDBACK TOAST MESSAGES ====================

  showSuccessFeedback(message) {
    this.showFeedback(message, 'success');
  }

  showErrorFeedback(message) {
    this.showFeedback(message, 'error');
  }

  showFeedback(message, type = 'info') {
    const existingFeedback = document.querySelector('.add-items-feedback');
    if (existingFeedback) {
      existingFeedback.remove();
    }

    const feedback = document.createElement('div');
    feedback.className = `add-items-feedback add-items-feedback--${type}`;
    feedback.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: slideInFromRight 0.3s ease-out;
      max-width: 300px;
      word-wrap: break-word;
      ${type === 'success' ? 'background: #4caf50; color: white;' : ''}
      ${type === 'error' ? 'background: #f44336; color: white;' : ''}
      ${type === 'info' ? 'background: #2196f3; color: white;' : ''}
    `;
    
    feedback.textContent = message;
    document.body.appendChild(feedback);

    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.style.animation = 'slideOutToRight 0.3s ease-in';
        setTimeout(() => {
          if (feedback.parentNode) {
            feedback.parentNode.removeChild(feedback);
          }
        }, 300);
      }
    }, 3000);

    if (!document.getElementById('add-items-feedback-styles')) {
      const style = document.createElement('style');
      style.id = 'add-items-feedback-styles';
      style.textContent = `
        @keyframes slideInFromRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutToRight {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  // ==================== TEXTAREA AUTO-RESIZE ====================

  autoResizeTextarea(textarea) {
    if (!textarea || textarea.tagName.toLowerCase() !== 'textarea') {
      return;
    }
    
    const originalHeight = textarea.style.height;
    
    textarea.classList.add('resizing');
    
    textarea.style.height = 'auto';
    
    const scrollHeight = textarea.scrollHeight;
    const minHeight = 60;
    const maxHeight = 400;
    
    const newHeight = Math.max(minHeight, Math.min(maxHeight, scrollHeight));
    
    requestAnimationFrame(() => {
      textarea.style.height = newHeight + 'px';
      
      setTimeout(() => {
        textarea.classList.remove('resizing');
      }, 400);
    });
  }

  setupAutoResizeForAllTextareas() {
    const textareas = document.querySelectorAll('textarea');
    
    textareas.forEach(textarea => {
      textarea.classList.add('auto-resize');
      
      const autoResizeHandler = () => {
        this.autoResizeTextarea(textarea);
      };
      
      textarea.addEventListener('input', autoResizeHandler);
      textarea.addEventListener('paste', autoResizeHandler);
      textarea.addEventListener('keyup', autoResizeHandler);
      textarea.addEventListener('focus', autoResizeHandler);
      
      this.autoResizeTextarea(textarea);
    });
  }

  resizeAllTextareas() {
    const textareas = document.querySelectorAll('textarea.auto-resize');
    textareas.forEach(textarea => {
      this.autoResizeTextarea(textarea);
    });
  }
}
