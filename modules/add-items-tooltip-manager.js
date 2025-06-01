// modules/add-items-tooltip-manager.js - Modern tooltip system for add items page

export class AddItemsTooltipManager {
  constructor(apiManager, qualityAnalyzer) {
    this.apiManager = apiManager;
    this.qualityAnalyzer = qualityAnalyzer;
    this.enabled = false;
    this.analysisTimeout = null;
    this.activeTooltips = new Map(); // Track active tooltips
    this.dismissedTooltips = new Set(); // Track dismissed tooltips for session
    
    // Field mappings for the add items form
    this.fieldMappings = {
      category: '#item_category_id',
      title: '#item_title_sv',
      description: '#item_description_sv',
      condition: '#item_condition_sv',
      artist: '#item_artist_name_sv',
      estimate: '#item_current_auction_attributes_estimate',
      reserve: '#item_current_auction_attributes_reserve',
      hiddenKeywords: '#item_hidden_keywords'
    };
    
    console.log('🎯 AddItemsTooltipManager initialized');
  }

  async init() {
    // Check if tooltips are enabled in settings
    await this.loadSettings();
    
    if (!this.enabled) {
      console.log('💤 Add Items Tooltips: Disabled in settings');
      return;
    }
    
    console.log('🚀 Add Items Tooltips: Starting initialization...');
    this.setupEventListeners();
    this.injectStyles();
    console.log('✅ Add Items Tooltips: Initialized successfully');
  }

  async loadSettings() {
    try {
      // For now, default to enabled. Later we can add a specific setting
      this.enabled = true;
      console.log('⚙️ Add items tooltips enabled:', this.enabled);
    } catch (error) {
      console.error('❌ Error loading tooltip settings:', error);
      this.enabled = true; // Default to enabled if error
    }
  }

  setupEventListeners() {
    // Listen for form field changes with debouncing
    Object.values(this.fieldMappings).forEach(selector => {
      const field = document.querySelector(selector);
      if (field) {
        field.addEventListener('input', () => this.debouncedAnalysis());
        field.addEventListener('blur', () => this.triggerAnalysis());
      }
    });
  }

  debouncedAnalysis() {
    // Clear existing timeout
    if (this.analysisTimeout) {
      clearTimeout(this.analysisTimeout);
    }
    
    // Set new timeout for 3 seconds after user stops typing
    this.analysisTimeout = setTimeout(() => {
      this.triggerAnalysis();
    }, 3000);
  }

  async triggerAnalysis() {
    if (!this.enabled || !this.apiManager.apiKey) {
      return;
    }

    const formData = this.extractFormData();
    
    // Only analyze if we have enough data
    if (!this.hasEnoughDataForAnalysis(formData)) {
      return;
    }

    console.log('🔍 Add Items Tooltips: Triggering analysis...');
    
    try {
      // Start with artist detection (highest priority)
      await this.analyzeArtistDetection(formData);
      
      // Then check for other enhancements
      await this.analyzeFieldEnhancements(formData);
      
    } catch (error) {
      console.error('❌ Add Items tooltip analysis error:', error);
    }
  }

  extractFormData() {
    const data = {};
    
    Object.entries(this.fieldMappings).forEach(([field, selector]) => {
      const element = document.querySelector(selector);
      if (element) {
        if (element.tagName === 'SELECT') {
          data[field] = element.options[element.selectedIndex]?.text || '';
        } else {
          data[field] = element.value;
        }
      } else {
        data[field] = '';
      }
    });
    
    return data;
  }

  hasEnoughDataForAnalysis(data) {
    // Need at least title with some content
    const titleLength = (data.title || '').trim().length;
    return titleLength >= 10;
  }

  async analyzeArtistDetection(formData) {
    if (!formData.title || formData.title.length < 10) return;
    
    // Skip if artist field is already filled
    if (formData.artist && formData.artist.trim().length > 2) return;
    
    console.log('🎯 Analyzing artist detection for:', formData.title);
    
    try {
      // Use existing artist detection from qualityAnalyzer
      const artistDetection = await this.qualityAnalyzer.detectMisplacedArtist(formData.title, formData.artist);
      
      if (artistDetection && artistDetection.detectedArtist) {
        console.log('✅ Artist detected:', artistDetection.detectedArtist);
        this.showArtistDetectionTooltip(artistDetection);
      }
    } catch (error) {
      console.error('❌ Artist detection error:', error);
    }
  }

  showArtistDetectionTooltip(artistDetection) {
    const titleField = document.querySelector(this.fieldMappings.title);
    if (!titleField) return;

    const tooltipId = 'artist-detection';
    
    // Check if already dismissed
    if (this.dismissedTooltips.has(tooltipId)) return;

    const content = `
      <div class="tooltip-header">
        <strong>KONSTNÄR UPPTÄCKT I TITEL</strong>
      </div>
      <div class="tooltip-body">
        "${artistDetection.detectedArtist}" kan flyttas till konstnärsfältet
      </div>
    `;

    const buttons = [{
      text: 'Flytta',
      className: 'btn-primary',
      onclick: () => this.moveArtistFromTitle(artistDetection.detectedArtist, artistDetection.suggestedTitle || '')
    }];

    this.createTooltip({
      id: tooltipId,
      targetElement: titleField,
      content,
      buttons,
      side: 'left',
      type: 'artist-detection'
    });
  }

  moveArtistFromTitle(artistName, suggestedTitle) {
    const titleField = document.querySelector(this.fieldMappings.title);
    const artistField = document.querySelector(this.fieldMappings.artist);
    
    if (titleField && artistField) {
      // Move artist to artist field
      artistField.value = artistName;
      
      // Update title field
      if (suggestedTitle) {
        titleField.value = suggestedTitle;
      } else {
        // Generate cleaned title
        const originalTitle = titleField.value;
        const artistPattern = new RegExp(`^${artistName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[.,:\\s]*`, 'i');
        let newTitle = originalTitle.replace(artistPattern, '');
        
        // Additional cleanup
        newTitle = newTitle.replace(/^[.,;:\\s"'"']*/, '');
        
        // Capitalize first letter if needed
        if (newTitle.length > 0) {
          newTitle = newTitle.charAt(0).toUpperCase() + newTitle.slice(1);
        }
        
        titleField.value = newTitle;
      }
      
      // Trigger events
      artistField.dispatchEvent(new Event('input', { bubbles: true }));
      titleField.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Dismiss the tooltip
      this.dismissTooltip('artist-detection');
      
      console.log(`✅ Moved artist "${artistName}" to field and updated title`);
    }
  }

  async analyzeFieldEnhancements(formData) {
    // Skip field enhancements for now - will implement step by step
    console.log('📝 Field enhancement analysis - coming next...');
  }

  createTooltip(options) {
    const { id, targetElement, content, buttons = [], side = 'left', type = 'default' } = options;
    
    // Remove existing tooltip if it exists
    this.dismissTooltip(id);
    
    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.id = `tooltip-${id}`;
    tooltip.className = `add-items-tooltip add-items-tooltip--${type} add-items-tooltip--${side}`;
    
    // Create arrow pointing in the correct direction
    const arrowDirection = side === 'left' ? 'right' : 'left';
    
    const buttonHTML = buttons.map(btn => `
      <button class="tooltip-button ${btn.className || ''}" type="button">
        ${btn.text}
      </button>
    `).join('');
    
    tooltip.innerHTML = `
      <div class="tooltip-arrow tooltip-arrow--${arrowDirection}"></div>
      <div class="tooltip-content">
        ${content}
        <div class="tooltip-buttons">
          ${buttonHTML}
          <button class="tooltip-dismiss" type="button" title="Stäng">✕</button>
        </div>
      </div>
    `;
    
    // Add to page
    document.body.appendChild(tooltip);
    
    // Position tooltip
    this.positionTooltip(tooltip, targetElement, side);
    
    // Add event listeners
    this.setupTooltipEventListeners(tooltip, id, buttons);
    
    // Track active tooltip
    this.activeTooltips.set(id, { tooltip, targetElement, side });
    
    console.log(`✅ Created tooltip: ${id}`);
  }

  positionTooltip(tooltip, targetElement, side) {
    const targetRect = targetElement.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    let left, top;
    const margin = 20;
    
    if (side === 'left') {
      // Position to the left of the target
      left = Math.max(10, targetRect.left - tooltipRect.width - margin);
      top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
    } else {
      // Position to the right of the target
      left = Math.min(window.innerWidth - tooltipRect.width - 10, targetRect.right + margin);
      top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
    }
    
    // Ensure tooltip stays within viewport
    if (top < 10) {
      top = 10;
    }
    if (top + tooltipRect.height > window.innerHeight - 10) {
      top = window.innerHeight - tooltipRect.height - 10;
    }
    
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(10, top)}px`;
    
    // Position arrow to point at target center
    const arrow = tooltip.querySelector('.tooltip-arrow');
    if (arrow) {
      const targetCenterY = targetRect.top + (targetRect.height / 2);
      const tooltipY = parseFloat(tooltip.style.top);
      const arrowY = Math.max(15, Math.min(tooltipRect.height - 15, targetCenterY - tooltipY));
      
      arrow.style.top = `${arrowY - 8}px`;
    }
  }

  setupTooltipEventListeners(tooltip, tooltipId, buttons) {
    // Dismiss button
    const dismissBtn = tooltip.querySelector('.tooltip-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        this.dismissTooltip(tooltipId);
        this.dismissedTooltips.add(tooltipId); // Remember dismissal for session
      });
    }
    
    // Action buttons
    const actionButtons = tooltip.querySelectorAll('.tooltip-button:not(.tooltip-dismiss)');
    actionButtons.forEach((btn, index) => {
      if (buttons[index] && buttons[index].onclick) {
        btn.addEventListener('click', () => {
          buttons[index].onclick();
        });
      }
    });
  }

  dismissTooltip(tooltipId) {
    const tooltip = document.getElementById(`tooltip-${tooltipId}`);
    if (tooltip) {
      tooltip.remove();
      this.activeTooltips.delete(tooltipId);
      console.log(`🗑️ Dismissed tooltip: ${tooltipId}`);
    }
  }

  removeAllTooltips() {
    this.activeTooltips.forEach((_, tooltipId) => {
      this.dismissTooltip(tooltipId);
    });
    this.activeTooltips.clear();
    console.log('🗑️ Removed all tooltips');
  }

  injectStyles() {
    if (document.getElementById('add-items-tooltip-styles')) return;

    const styles = `
      <style id="add-items-tooltip-styles">
        .add-items-tooltip {
          position: fixed;
          z-index: 10000;
          background: rgba(255, 255, 255, 0.95);
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
          font-size: 13px;
          line-height: 1.4;
          color: #333;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          max-width: 280px;
          min-width: 200px;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
        
        .add-items-tooltip--artist-detection {
          border-left: 4px solid #2196F3;
        }
        
        .tooltip-arrow {
          position: absolute;
          width: 0;
          height: 0;
          border-style: solid;
        }
        
        .tooltip-arrow--right {
          left: -8px;
          border-width: 8px 8px 8px 0;
          border-color: transparent rgba(255, 255, 255, 0.95) transparent transparent;
        }
        
        .tooltip-arrow--left {
          right: -8px;
          border-width: 8px 0 8px 8px;
          border-color: transparent transparent transparent rgba(255, 255, 255, 0.95);
        }
        
        .tooltip-content {
          padding: 12px;
        }
        
        .tooltip-header {
          font-weight: 600;
          margin-bottom: 8px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #2196F3;
        }
        
        .tooltip-body {
          margin-bottom: 12px;
          color: #555;
        }
        
        .tooltip-buttons {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        
        .tooltip-button {
          background: #333;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 6px 12px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .tooltip-button:hover {
          background: #555;
        }
        
        .tooltip-button.btn-primary {
          background: #2196F3;
        }
        
        .tooltip-button.btn-primary:hover {
          background: #1976D2;
        }
        
        .tooltip-dismiss {
          background: none !important;
          border: none;
          color: #999;
          opacity: 0.6;
          cursor: pointer;
          font-size: 14px;
          padding: 4px;
          margin-left: auto;
          transition: opacity 0.2s;
        }
        
        .tooltip-dismiss:hover {
          opacity: 1;
        }
      </style>
    `;

    document.head.insertAdjacentHTML('beforeend', styles);
  }
} 