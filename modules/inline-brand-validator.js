// modules/inline-brand-validator.js - Inline Brand Spell Checking with Tooltips
// Real-time brand validation with in-field highlighting and correction tooltips

import { SwedishSpellChecker } from './swedish-spellchecker.js';
import { escapeHTML } from './core/html-escape.js';

export class InlineBrandValidator {
  constructor(brandValidationManager = null) {
    this.brandValidationManager = brandValidationManager;
    this.swedishSpellChecker = new SwedishSpellChecker();
    this.activeTooltip = null;
    this.monitoredFields = new Map();
    this.debounceTimeout = null;
    
  }

  // Set brand validation manager
  setBrandValidationManager(brandValidationManager) {
    this.brandValidationManager = brandValidationManager;
  }

  // Start monitoring fields for brand misspellings
  startMonitoring() {
    const fieldsToMonitor = [
      { selector: '#item_title_sv', type: 'title' },
      { selector: '#item_title', type: 'title' },
      { selector: 'input[name*="title"]', type: 'title' },
      { selector: '#item_description_sv', type: 'description' },
      { selector: 'textarea[name*="description"]', type: 'description' }
    ];

    fieldsToMonitor.forEach(({ selector, type }) => {
      const field = document.querySelector(selector);
      if (field) {
        this.attachToField(field, type);
      }
    });

    // Add styles for highlighting and tooltips
    this.addInlineStyles();
    
  }

  // Attach validation to a specific field
  attachToField(field, type) {
    if (this.monitoredFields.has(field)) {

      return;
    }

    // Store field info
    this.monitoredFields.set(field, { type, originalField: field });

    // Create marker container for highlighting
    const markerContainer = this.createOverlay(field);
    
    // Add event listeners
    const validateHandler = () => {
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = setTimeout(() => {
        this.validateFieldContent(field, markerContainer, type);
      }, 800); // Debounce typing
    };

    field.addEventListener('input', validateHandler);
    field.addEventListener('paste', validateHandler);
    field.addEventListener('focus', () => this.showOverlay(markerContainer));
    field.addEventListener('blur', () => this.hideTooltip());

    // NEW: Validate existing content immediately (important for EDIT pages)
    if (field.value && field.value.trim().length > 0) {
      setTimeout(() => {
        this.validateFieldContent(field, markerContainer, type);
      }, 100); // Small delay to ensure DOM is ready
    }

  }

  // Create marker container for highlighting misspelled words
  createOverlay(field) {
    const markerContainer = document.createElement('div');
    markerContainer.className = 'brand-spell-markers';
    
    markerContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1000;
      overflow: hidden;
    `;

    // Create wrapper container to ensure proper positioning
    const wrapper = document.createElement('div');
    wrapper.className = 'brand-spell-wrapper';
    wrapper.style.cssText = `
      position: relative;
      display: inline-block;
      width: 100%;
    `;

    // Ensure parent can contain absolutely positioned markers
    const parent = field.parentElement;
    const originalPosition = parent.style.position;
    if (!originalPosition || originalPosition === 'static') {
      parent.style.position = 'relative';
    }

    // Insert wrapper and marker container
    field.parentNode.insertBefore(wrapper, field);
    wrapper.appendChild(field);
    wrapper.appendChild(markerContainer);

    // Store original position for cleanup
    markerContainer.dataset.originalParentPosition = originalPosition;

    return markerContainer;
  }

  // Show markers when field is focused
  showOverlay(markerContainer) {
    markerContainer.style.display = 'block';
  }

  // Validate field content and highlight misspellings
  async validateFieldContent(field, markerContainer, type) {
    if (!this.brandValidationManager) {
      return;
    }

    const text = field.value;
    if (!text || text.length < 3) {
      markerContainer.innerHTML = '';
      return;
    }

    try {
      const allIssues = [];
      
      // 1. Brand validation (existing)
      if (this.brandValidationManager) {
        const brandIssues = this.brandValidationManager.detectFuzzyBrandMatches(text, '');
        allIssues.push(...brandIssues.map(issue => ({
          ...issue,
          type: 'brand',
          displayCategory: 'märke'
        })));
      }
      
      // 2. Swedish spell checking (new)
      const spellingErrors = this.swedishSpellChecker.validateSwedishSpelling(text);
      allIssues.push(...spellingErrors.map(error => ({
        originalBrand: error.originalWord,
        suggestedBrand: error.suggestedWord,
        confidence: error.confidence,
        category: error.category,
        source: error.source,
        type: 'spelling',
        displayCategory: this.swedishSpellChecker.getCategoryDisplayName(error.category)
      })));
      
      if (allIssues.length > 0) {
        this.createSpellMarkers(field, markerContainer, text, allIssues);
      } else {
        markerContainer.innerHTML = '';
      }
    } catch (error) {
      console.error('Error validating field content:', error);
    }
  }

  // Create spell markers for misspellings
  createSpellMarkers(field, markerContainer, text, issues) {
    // Clear existing markers
    markerContainer.innerHTML = '';

    const fieldStyles = getComputedStyle(field);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas font to match field
    ctx.font = `${fieldStyles.fontSize} ${fieldStyles.fontFamily}`;

    issues.forEach(issue => {
      const originalBrand = issue.originalBrand;
      const suggestedBrand = issue.suggestedBrand;
      
      // Find word position in text
      const wordIndex = text.toLowerCase().indexOf(originalBrand.toLowerCase());
      if (wordIndex === -1) return;

      // Calculate text metrics
      const beforeText = text.substring(0, wordIndex);
      const wordText = text.substring(wordIndex, wordIndex + originalBrand.length);
      
      const beforeWidth = ctx.measureText(beforeText).width;
      const wordWidth = ctx.measureText(wordText).width;

      // Create marker element
      const marker = document.createElement('div');
      marker.className = `spelling-marker ${issue.type}-error`;
      marker.dataset.original = originalBrand;
      marker.dataset.suggested = suggestedBrand;
      marker.dataset.confidence = issue.confidence;
      marker.dataset.category = issue.category;
      marker.dataset.type = issue.type;
      marker.dataset.displayCategory = issue.displayCategory;
      
      // Calculate position including field padding
      const paddingLeft = parseInt(fieldStyles.paddingLeft) || 0;
      const paddingTop = parseInt(fieldStyles.paddingTop) || 0;
      
      marker.style.cssText = `
        position: absolute;
        left: ${paddingLeft + beforeWidth}px;
        top: ${paddingTop}px;
        width: ${wordWidth}px;
        height: ${parseInt(fieldStyles.fontSize)}px;
        pointer-events: auto;
        cursor: pointer;
        z-index: 1001;
        border-bottom: 2px wavy ${issue.type === 'brand' ? '#f44336' : '#ff9800'};
        background: rgba(${issue.type === 'brand' ? '244, 67, 54' : '255, 152, 0'}, 0.1);
        border-radius: 2px;
      `;

      // Add event listeners
      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showCorrectionTooltip(marker, field);
      });
      
      marker.addEventListener('mouseenter', (e) => {
        this.showCorrectionTooltip(marker, field);
      });

      markerContainer.appendChild(marker);
    });

  }

  // Show correction tooltip
  showCorrectionTooltip(element, field) {
    // Hide existing tooltip
    this.hideTooltip();

    const original = element.dataset.original;
    const suggested = element.dataset.suggested;
    const confidence = Math.round(parseFloat(element.dataset.confidence) * 100);
    const category = element.dataset.category;

    const categoryMap = {
      watches: 'klockfabrikat',
      glass: 'glasmärke', 
      ceramics: 'keramikmärke',
      furniture: 'möbelmärke',
      luxury: 'lyxmärke',
      unknown: 'märke'
    };

    const categoryText = element.dataset.displayCategory || categoryMap[category] || 'märke';

    const errorType = element.dataset.type;
    const headerText = errorType === 'brand' ? 'MÖJLIGT MÄRKESFEL' : 'MÖJLIGT STAVFEL';
    
    // Create tooltip
    const tooltip = document.createElement('div');
    tooltip.className = `brand-correction-tooltip ${errorType}-tooltip`;
    tooltip.innerHTML = `
      <div class="tooltip-header">
        <strong>${headerText}</strong>
        <button class="tooltip-close" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
      <div class="tooltip-content">
        <div class="correction-text">
          "${escapeHTML(original)}" → föreslår "<strong>${escapeHTML(suggested)}</strong>" 
          <br><small>(${confidence}% säkerhet, ${escapeHTML(categoryText)})</small>
        </div>
        <button class="correction-button" onclick="this.closest('.brand-correction-tooltip').dispatchEvent(new CustomEvent('correct'))">
          Uppdatera
        </button>
      </div>
    `;

    // Position tooltip
    const elementRect = element.getBoundingClientRect();
    tooltip.style.cssText = `
      position: fixed;
      left: ${elementRect.left}px;
      top: ${elementRect.bottom + 8}px;
      z-index: 10001;
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      max-width: 280px;
      animation: tooltipFadeIn 0.2s ease-out;
    `;

    // Add correction handler
    tooltip.addEventListener('correct', () => {
      this.applyCorrection(field, original, suggested);
      this.hideTooltip();
    });

    document.body.appendChild(tooltip);
    this.activeTooltip = tooltip;

    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (this.activeTooltip === tooltip) {
        this.hideTooltip();
      }
    }, 5000);

  }

  // Apply correction to field
  applyCorrection(field, original, suggested) {
    const currentValue = field.value;
    
    // Create case-insensitive regex to find the word regardless of current case
    const regex = new RegExp(`\\b${this.escapeRegex(original)}\\b`, 'gi');
    const correctedValue = currentValue.replace(regex, suggested);
    
    field.value = correctedValue;
    
    // Clear existing markers immediately to prevent duplicate tooltips
    const markerContainer = field.parentElement.querySelector('.brand-spell-markers');
    if (markerContainer) {
      markerContainer.innerHTML = '';
    }
    
    // Hide any active tooltip
    this.hideTooltip();
    
    // Trigger events
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Show success feedback
    this.showSuccessAnimation(field, `Rättat till "${suggested}"`);
    
    // Re-validate after correction with longer delay to ensure field is updated
    setTimeout(() => {
      const fieldInfo = this.monitoredFields.get(field);
      if (fieldInfo && markerContainer) {
        this.validateFieldContent(field, markerContainer, fieldInfo.type);
      }
    }, 1000); // Longer delay to ensure everything is settled

  }

  // Show success animation
  showSuccessAnimation(field, message) {
    const successDiv = document.createElement('div');
    successDiv.innerHTML = `✓ ${escapeHTML(message)}`;
    successDiv.style.cssText = `
      position: fixed;
      left: ${field.getBoundingClientRect().left}px;
      top: ${field.getBoundingClientRect().top - 30}px;
      background: #4caf50;
      color: white;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      z-index: 10002;
      animation: successSlideUp 2s ease-out forwards;
    `;

    document.body.appendChild(successDiv);

    setTimeout(() => {
      if (successDiv.parentElement) {
        successDiv.parentElement.removeChild(successDiv);
      }
    }, 2000);
  }

  // Hide active tooltip
  hideTooltip() {
    if (this.activeTooltip) {
      this.activeTooltip.remove();
      this.activeTooltip = null;
    }
  }

  // Add required CSS styles
  addInlineStyles() {
    if (document.getElementById('inline-brand-validator-styles')) return;

    const style = document.createElement('style');
    style.id = 'inline-brand-validator-styles';
    style.textContent = `
      .brand-spell-wrapper {
        position: relative !important;
        display: inline-block;
        width: 100%;
      }
      
      .brand-spell-markers {
        pointer-events: none;
        user-select: none;
      }
      
      .spelling-marker {
        transition: all 0.2s ease;
      }
      
      .spelling-marker:hover {
        background: rgba(244, 67, 54, 0.2) !important;
        transform: translateY(-1px);
      }
      
      .spelling-error:hover {
        background: rgba(255, 152, 0, 0.25) !important;
      }
      
      .spelling-tooltip .tooltip-header {
        color: #f57c00 !important;
      }
      
      .brand-correction-tooltip .tooltip-header {
        background: #f5f5f5;
        padding: 8px 12px;
        border-bottom: 1px solid #eee;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: 600;
        color: #d32f2f;
        border-radius: 8px 8px 0 0;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .brand-correction-tooltip .tooltip-close {
        background: none;
        border: none;
        font-size: 16px;
        cursor: pointer;
        color: #999;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .brand-correction-tooltip .tooltip-close:hover {
        color: #666;
      }
      
      .brand-correction-tooltip .tooltip-content {
        padding: 12px;
      }
      
      .brand-correction-tooltip .correction-text {
        margin-bottom: 10px;
        line-height: 1.4;
      }
      
      .brand-correction-tooltip .correction-button {
        background: #1976d2;
        color: white;
        border: none;
        padding: 6px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        width: 100%;
        transition: background 0.2s ease;
      }
      
      .brand-correction-tooltip .correction-button:hover {
        background: #1565c0;
      }
      
      @keyframes tooltipFadeIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      @keyframes successSlideUp {
        0% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-20px); }
      }
    `;

    document.head.appendChild(style);
  }

  // Helper method to escape regex
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Stop monitoring (cleanup)
  stopMonitoring() {
    this.monitoredFields.clear();
    this.hideTooltip();
    
    // Clean up wrappers and markers
    const wrappers = document.querySelectorAll('.brand-spell-wrapper');
    wrappers.forEach(wrapper => {
      const field = wrapper.querySelector('input, textarea');
      const markerContainer = wrapper.querySelector('.brand-spell-markers');
      
      if (field && markerContainer) {
        // Restore original parent position
        const originalPosition = markerContainer.dataset.originalParentPosition;
        if (originalPosition) {
          wrapper.parentElement.style.position = originalPosition;
        }
        
        // Move field back to original parent
        wrapper.parentElement.insertBefore(field, wrapper);
      }
      
      // Remove wrapper
      wrapper.remove();
    });
    
  }

  // Manually trigger validation for all monitored fields
  validateAllFields() {
    
    this.monitoredFields.forEach((fieldInfo, field) => {
      if (field.value && field.value.trim().length > 0) {
        const markerContainer = field.parentElement.querySelector('.brand-spell-markers');
        if (markerContainer) {
          this.validateFieldContent(field, markerContainer, fieldInfo.type);
        }
      }
    });
  }

  // Get current validation results for all fields
  getCurrentErrors() {
    const errors = [];
    
    this.monitoredFields.forEach((fieldInfo, field) => {
      const markers = field.parentElement.querySelectorAll('.spelling-marker');
      markers.forEach(marker => {
        errors.push({
          field: fieldInfo.type,
          original: marker.dataset.original,
          suggested: marker.dataset.suggested,
          confidence: parseFloat(marker.dataset.confidence),
          category: marker.dataset.category
        });
      });
    });
    
    return errors;
  }

  // Debug information
  debug() {
    
    // Log field contents
    this.monitoredFields.forEach((fieldInfo, field) => {
    });
  }
} 