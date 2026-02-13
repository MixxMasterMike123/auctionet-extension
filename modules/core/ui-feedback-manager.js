/**
 * UI Feedback Manager - SSoT Component
 * Extracted from quality-analyzer.js
 * Handles all loading indicators, spinners, success/error flashes
 */
import { escapeHTML } from './html-escape.js';

export class UIFeedbackManager {
  constructor() {
    this.stylesInjected = {};
  }

  /**
   * Inject a named style block once
   */
  injectStyleOnce(id, css) {
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = css;
      document.head.appendChild(style);
    }
  }

  /**
   * Show success feedback tooltip above an element
   */
  showSuccessFeedback(element, message) {
    try {
      const tooltip = document.createElement('div');
      tooltip.className = 'brand-success-tooltip';
      tooltip.textContent = message;
      tooltip.style.cssText = `
        position: absolute;
        background: #28a745;
        color: white;
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
        z-index: 10000;
        white-space: nowrap;
        pointer-events: none;
        transform: translateY(-100%);
        margin-top: -8px;
        box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3);
        animation: fadeInSuccess 0.3s ease-out;
      `;

      this.injectStyleOnce('success-feedback-styles', `
        @keyframes fadeInSuccess {
          from { opacity: 0; transform: translateY(-100%) scale(0.8); }
          to { opacity: 1; transform: translateY(-100%) scale(1); }
        }
      `);

      const parent = element.parentElement;
      if (parent) {
        const originalPosition = parent.style.position;
        parent.style.position = 'relative';
        parent.appendChild(tooltip);

        setTimeout(() => {
          try {
            if (tooltip.parentElement) {
              tooltip.parentElement.removeChild(tooltip);
              if (originalPosition) {
                parent.style.position = originalPosition;
              }
            }
          } catch (removeError) {
            // Silently handle removal errors
          }
        }, 3000);
      }
    } catch (error) {
      // Fallback: log success to console
    }
  }

  /**
   * Show error feedback on an element (red flash)
   */
  showErrorFeedback(element, message) {
    const originalBackground = element.style.background;
    const originalColor = element.style.color;
    const originalText = element.textContent;

    element.style.background = '#f44336';
    element.style.color = 'white';
    element.textContent = message;

    setTimeout(() => {
      element.style.background = originalBackground;
      element.style.color = originalColor;
      element.textContent = originalText;
    }, 1500);
  }

  /**
   * Show loading spinner overlay on the title field
   */
  showTitleLoadingSpinner() {
    const targetField = document.querySelector('#item_title_sv');
    if (!targetField) return;

    this.removeTitleLoadingSpinner();

    let fieldContainer = targetField.parentElement;
    if (fieldContainer.classList.contains('ai-button-wrapper') || fieldContainer.tagName === 'LABEL') {
      fieldContainer = fieldContainer.parentElement;
    }

    fieldContainer.classList.add('field-loading');

    const overlay = document.createElement('div');
    overlay.className = 'field-spinner-overlay title-correction-spinner';
    overlay.innerHTML = `
      <div class="ai-spinner"></div>
      <div class="ai-processing-text">Förbättrar titel...</div>
    `;

    const fieldRect = targetField.getBoundingClientRect();
    const containerRect = fieldContainer.getBoundingClientRect();

    overlay.style.position = 'absolute';
    overlay.style.top = `${fieldRect.top - containerRect.top}px`;
    overlay.style.left = `${fieldRect.left - containerRect.left}px`;
    overlay.style.width = `${fieldRect.width}px`;
    overlay.style.height = `${fieldRect.height}px`;
    overlay.style.backgroundColor = 'rgba(74, 144, 226, 0.9)';
    overlay.style.color = 'white';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.borderRadius = '4px';
    overlay.style.zIndex = '1000';

    const spinnerStyle = overlay.querySelector('.ai-spinner');
    if (spinnerStyle) {
      spinnerStyle.style.width = '20px';
      spinnerStyle.style.height = '20px';
      spinnerStyle.style.border = '2px solid rgba(255,255,255,0.3)';
      spinnerStyle.style.borderTop = '2px solid white';
      spinnerStyle.style.borderRadius = '50%';
      spinnerStyle.style.animation = 'spin 1s linear infinite';
      spinnerStyle.style.marginBottom = '8px';
    }

    this.injectStyleOnce('title-spinner-styles', `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `);

    fieldContainer.appendChild(overlay);
  }

  /**
   * Remove loading spinner from title field
   */
  removeTitleLoadingSpinner() {
    const overlay = document.querySelector('.title-correction-spinner');
    if (overlay) {
      const container = overlay.parentElement;
      container.classList.remove('field-loading');
      overlay.remove();
    }
  }

  /**
   * Show success flash on title field (green)
   */
  showTitleSuccessFlash() {
    const targetField = document.querySelector('#item_title_sv');
    if (targetField) {
      targetField.style.transition = 'background-color 0.3s ease';
      targetField.style.backgroundColor = '#d4edda';
      targetField.style.borderColor = '#28a745';

      setTimeout(() => {
        targetField.style.backgroundColor = '';
        targetField.style.borderColor = '';
      }, 2000);
    }
  }

  /**
   * Show error flash on title field (red)
   */
  showTitleErrorFlash() {
    const targetField = document.querySelector('#item_title_sv');
    if (targetField) {
      targetField.style.transition = 'background-color 0.3s ease';
      targetField.style.backgroundColor = '#f8d7da';
      targetField.style.borderColor = '#dc3545';

      setTimeout(() => {
        targetField.style.backgroundColor = '';
        targetField.style.borderColor = '';
      }, 3000);
    }
  }

  /**
   * Show fixed-position AI loading indicator (top-right toast)
   */
  showAILoadingIndicator(message = 'AI analysis in progress...') {
    let indicator = document.querySelector('.ai-analysis-loading');

    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'ai-analysis-loading';
      indicator.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        font-weight: 500;
        max-width: 300px;
        backdrop-filter: blur(10px);
        animation: slideInRight 0.3s ease-out;
      `;

      this.injectStyleOnce('ai-loading-styles', `
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
      `);

      this.injectStyleOnce('ai-spin-styles', `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `);

      document.body.appendChild(indicator);
    }

    indicator.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid white; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <span>${escapeHTML(message)}</span>
      </div>
    `;

    indicator.style.display = 'block';
  }

  /**
   * Update the AI loading indicator message
   */
  updateAILoadingMessage(message) {
    const indicator = document.querySelector('.ai-analysis-loading span');
    if (indicator) {
      indicator.textContent = message;
    }
  }

  /**
   * Hide the AI loading indicator with slide-out animation
   */
  hideAILoadingIndicator() {
    const indicator = document.querySelector('.ai-analysis-loading');
    if (indicator) {
      indicator.style.animation = 'slideOutRight 0.3s ease-in';
      setTimeout(() => {
        if (indicator.parentNode) {
          indicator.parentNode.removeChild(indicator);
        }
      }, 300);
    }
  }

  /**
   * Check if there's an active loading indicator and hide it
   */
  checkAndHideLoadingIndicator() {
    const indicator = document.querySelector('.ai-analysis-loading');
    if (indicator) {
      this.hideAILoadingIndicator();
    }
  }
}
