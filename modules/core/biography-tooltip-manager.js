/**
 * Biography Tooltip Manager - SSoT Component
 * Extracted from working Add Item page implementation
 * Handles biography snippets, tooltips, and full biography popups
 */
export class BiographyTooltipManager {
  constructor() {
    this.activeTooltips = new Map();
    this.stylesInjected = false;
  }

  /**
   * Initialize the biography tooltip system
   */
  init() {
    this.injectStyles();
    console.log('✅ Biography Tooltip Manager initialized');
  }

  /**
   * Create a biography snippet with tooltip functionality
   * @param {HTMLElement} parentElement - Element to append biography snippet to
   * @param {string} biography - Full biography text from Haiku model
   * @param {string} artistName - Artist name for popup header
   * @returns {HTMLElement|null} - Created biography span element
   */
  createBiographySnippet(parentElement, biography, artistName) {
    if (!biography || biography === 'Ingen detaljerad biografi tillgänglig') {
      return null;
    }

    // Create biography snippet (shorter for cleaner design - first 50 characters)
    const bioPreview = biography.length > 50 ? biography.substring(0, 50) + '...' : biography;
    
    const biographySpan = document.createElement('span');
    biographySpan.className = 'artist-bio-tooltip';
    biographySpan.textContent = `(${bioPreview})`;
    biographySpan.setAttribute('data-full-bio', biography + '\n\n🤖 AI-genererad biografi (Claude Haiku)');
    biographySpan.style.cssText = `
      cursor: help;
      border-bottom: 1px dotted rgba(25, 118, 210, 0.5);
      transition: all 0.2s ease;
      position: relative;
    `;
    
    // Add hover effect for snippet
    biographySpan.addEventListener('mouseenter', () => {
      biographySpan.style.backgroundColor = '#f0f8ff';
      biographySpan.style.borderRadius = '2px';
    });
    
    biographySpan.addEventListener('mouseleave', () => {
      biographySpan.style.backgroundColor = 'transparent';
    });

    // Append to parent element if provided
    if (parentElement) {
      parentElement.appendChild(biographySpan);
    }

    return biographySpan;
  }

  /**
   * Show full biography in a modal popup
   * @param {string} artistName - Artist name for header
   * @param {string} biography - Full biography text
   */
  async showFullBiography(artistName, biography) {
    // Create a modern popup overlay for detailed artist information
    const popup = document.createElement('div');
    popup.className = 'artist-bio-popup-overlay';
    popup.innerHTML = `
      <div class="artist-bio-popup">
        <div class="popup-header">
          <h3>${artistName}</h3>
          <button class="popup-close" type="button">✕</button>
        </div>
        <div class="popup-content">
          <p>${biography}</p>
          <div class="popup-attribution">
            <small>🤖 AI-genererad biografi (Claude Haiku)</small>
          </div>
        </div>
      </div>
    `;
    
    // Add to page
    document.body.appendChild(popup);
    
    // Add event listeners
    const closeBtn = popup.querySelector('.popup-close');
    closeBtn.addEventListener('click', () => {
      popup.remove();
    });
    
    // Close on overlay click
    popup.addEventListener('click', (e) => {
      if (e.target === popup) {
        popup.remove();
      }
    });
    
    // Close on escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        popup.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
    
    console.log('✨ Artist biography popup displayed for:', artistName);
  }

  /**
   * Create biography preview for tooltips (Add Item page style)
   * @param {Object} artistDetection - Artist detection object with biography
   * @returns {string} - HTML string for biography preview
   */
  createBiographyPreview(artistDetection) {
    const biography = artistDetection.biography || '';
    
    if (!biography || biography === 'Ingen detaljerad biografi tillgänglig') {
      return '';
    }

    // Create preview snippet (first 120 characters for tooltips)
    const bioPreview = biography.length > 120 ? biography.substring(0, 120) + '...' : biography;
    
    return `<div class="artist-bio-preview">${bioPreview}</div>`;
  }

  /**
   * Add biography button to existing tooltip for long biographies
   * @param {HTMLElement} tooltipElement - Tooltip element to add button to
   * @param {string} artistName - Artist name
   * @param {string} biography - Full biography text
   */
  addBiographyButton(tooltipElement, artistName, biography) {
    if (!biography || biography.length <= 120) {
      return; // No need for button on short biographies
    }

    const buttonContainer = tooltipElement.querySelector('.tooltip-buttons') || 
                           tooltipElement.querySelector('.tooltip-footer');
    
    if (buttonContainer) {
      const bioButton = document.createElement('button');
      bioButton.className = 'btn-secondary bio-button';
      bioButton.textContent = 'Visa biografi';
      bioButton.addEventListener('click', () => {
        this.showFullBiography(artistName, biography);
      });
      
      buttonContainer.appendChild(bioButton);
    }
  }

  /**
   * Check if biography data is available and valid
   * @param {Object} verificationData - Artist verification object
   * @returns {boolean} - True if biography is available
   */
  hasBiography(verificationData) {
    return verificationData && 
           verificationData.biography && 
           verificationData.biography !== 'Ingen detaljerad biografi tillgänglig';
  }

  /**
   * Extract biography from various data structures
   * @param {Object} data - Data object (can be artistDetection, verification, etc.)
   * @returns {string|null} - Biography text or null
   */
  extractBiography(data) {
    if (!data) return null;
    
    // Try different possible locations for biography
    if (data.biography) return data.biography;
    if (data.verification && data.verification.biography) return data.verification.biography;
    if (data.aiArtist && data.aiArtist.verification && data.aiArtist.verification.biography) {
      return data.aiArtist.verification.biography;
    }
    
    return null;
  }

  /**
   * Inject CSS styles for biography tooltips and popups
   */
  injectStyles() {
    if (this.stylesInjected) return;

    const style = document.createElement('style');
    style.setAttribute('data-biography-tooltip-styles', 'true');
    style.textContent = `
      /* Biography Snippet Styles */
      .artist-bio-tooltip {
        position: relative;
        cursor: help;
      }

      .artist-bio-tooltip::after {
        content: attr(data-full-bio);
        position: absolute;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 12px;
        border-radius: 6px;
        font-size: 12px;
        white-space: pre-wrap;
        max-width: 350px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        margin-top: 20px;
        margin-left: -50px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s ease;
        font-style: normal;
        font-weight: normal;
        line-height: 1.4;
      }
      
      .artist-bio-tooltip:hover::after {
        opacity: 1;
      }
      
      .artist-bio-tooltip::before {
        content: '';
        position: absolute;
        top: 15px;
        left: 50px;
        border: 5px solid transparent;
        border-bottom-color: rgba(0, 0, 0, 0.9);
        opacity: 0;
        transition: opacity 0.3s ease;
        z-index: 10001;
      }
      
      .artist-bio-tooltip:hover::before {
        opacity: 1;
      }

      .artist-bio-preview {
        background: #f8fafc;
        border-left: 3px solid #e2e8f0;
        padding: 8px 12px;
        margin: 8px 0;
        font-size: 12px;
        border-radius: 4px;
        color: #4a5568;
        font-style: italic;
        line-height: 1.4;
      }

      /* Artist Biography Popup Styles */
      .artist-bio-popup-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: 50000;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: bioPopupFadeIn 0.2s ease-out;
      }
      
      .artist-bio-popup {
        background: white;
        border-radius: 12px;
        max-width: 500px;
        max-height: 70vh;
        width: 90%;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        animation: bioPopupSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        overflow: hidden;
      }
      
      .popup-header {
        padding: 20px 24px 16px;
        border-bottom: 1px solid #e1e5e9;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
      }
      
      .popup-header h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: #2c3e50;
      }
      
      .popup-close {
        background: none;
        border: none;
        font-size: 18px;
        color: #6c757d;
        cursor: pointer;
        padding: 8px;
        border-radius: 4px;
        transition: all 0.15s ease;
      }
      
      .popup-close:hover {
        background: #f8f9fa;
        color: #495057;
      }
      
      .popup-content {
        padding: 20px 24px 24px;
        overflow-y: auto;
        max-height: calc(70vh - 80px);
      }
      
      .popup-content p {
        margin: 0 0 16px 0;
        line-height: 1.6;
        color: #495057;
        font-size: 14px;
      }

      .popup-attribution {
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid #e9ecef;
        text-align: center;
      }

      .popup-attribution small {
        color: #6c757d;
        font-style: italic;
      }

      .bio-button {
        margin-left: 8px;
        padding: 4px 8px;
        font-size: 11px;
        background: #6c757d;
        color: white;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        transition: background 0.2s ease;
      }

      .bio-button:hover {
        background: #5a6268;
      }
      
      @keyframes bioPopupFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes bioPopupSlideIn {
        from {
          opacity: 0;
          transform: scale(0.9) translateY(-20px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }
    `;
    
    document.head.appendChild(style);
    this.stylesInjected = true;
    console.log('✅ Biography tooltip styles injected');
  }

  /**
   * Remove all active biography tooltips and popups
   */
  cleanup() {
    // Remove any active popups
    const activePopups = document.querySelectorAll('.artist-bio-popup-overlay');
    activePopups.forEach(popup => popup.remove());
    
    this.activeTooltips.clear();
    console.log('✅ Biography tooltips cleaned up');
  }
}

// Export for use in other modules
export default BiographyTooltipManager;
