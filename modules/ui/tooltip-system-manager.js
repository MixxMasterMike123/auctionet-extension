// modules/ui/tooltip-system-manager.js
// Dedicated Tooltip System for Add Items Page
// Extracted from add-items-tooltip-manager.js following edit page patterns

export class TooltipSystemManager {
  constructor() {
    this.activeTooltips = new Map();
    this.dismissedTooltips = new Set();
    this.lastDismissalTime = new Map();
    this.permanentlyDisabledTooltips = new Set();
    
    console.log('✅ TooltipSystemManager: Initialized');
  }

  /**
   * Create a tooltip with modern styling
   * @param {Object} config - Tooltip configuration
   * @returns {HTMLElement} The created tooltip element
   */
  createTooltip(config) {
    const {
      id,
      title,
      content,
      buttons = [],
      type = 'info', // 'info', 'warning', 'success', 'artist'
      position = 'right',
      persistent = false,
      maxWidth = '400px'
    } = config;

    // Check if tooltip is permanently disabled
    if (this.isPermanentlyDisabled(id)) {
      console.log(`🚫 Tooltip ${id} is permanently disabled`);
      return null;
    }

    // Remove existing tooltip with same ID
    this.dismissTooltip(id);

    const tooltip = document.createElement('div');
    tooltip.className = `ai-tooltip ai-tooltip-${type}`;
    tooltip.dataset.tooltipId = id;
    tooltip.style.maxWidth = maxWidth;

    // Create tooltip content
    tooltip.innerHTML = `
      <div class="tooltip-header">
        <div class="tooltip-icon">${this.getTooltipIcon(type)}</div>
        <h4 class="tooltip-title">${title}</h4>
        <button class="tooltip-close" aria-label="Close">×</button>
      </div>
      <div class="tooltip-content">
        ${content}
      </div>
      ${buttons.length > 0 ? `
        <div class="tooltip-buttons">
          ${buttons.map(btn => `
            <button class="tooltip-btn tooltip-btn-${btn.type || 'default'}" 
                    data-action="${btn.action || ''}"
                    ${btn.disabled ? 'disabled' : ''}>
              ${btn.text}
            </button>
          `).join('')}
        </div>
      ` : ''}
    `;

    // Store tooltip reference
    this.activeTooltips.set(id, tooltip);

    return tooltip;
  }

  /**
   * Position tooltip relative to target element
   * @param {HTMLElement} tooltip - Tooltip element
   * @param {HTMLElement} targetElement - Element to position relative to
   * @param {string} side - Position side ('right', 'left', 'top', 'bottom')
   */
  positionTooltip(tooltip, targetElement, side = 'right') {
    if (!tooltip || !targetElement) return;

    const targetRect = targetElement.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scrollTop = window.pageYOffset;
    const scrollLeft = window.pageXOffset;

    let top, left;

    switch (side) {
      case 'right':
        left = targetRect.right + scrollLeft + 15;
        top = targetRect.top + scrollTop + (targetRect.height / 2) - (tooltipRect.height / 2);
        
        // Adjust if tooltip would go off-screen
        if (left + tooltipRect.width > viewportWidth + scrollLeft) {
          left = targetRect.left + scrollLeft - tooltipRect.width - 15;
          tooltip.classList.add('tooltip-left');
        }
        break;

      case 'left':
        left = targetRect.left + scrollLeft - tooltipRect.width - 15;
        top = targetRect.top + scrollTop + (targetRect.height / 2) - (tooltipRect.height / 2);
        
        // Adjust if tooltip would go off-screen
        if (left < scrollLeft) {
          left = targetRect.right + scrollLeft + 15;
          tooltip.classList.remove('tooltip-left');
        }
        break;

      case 'top':
        left = targetRect.left + scrollLeft + (targetRect.width / 2) - (tooltipRect.width / 2);
        top = targetRect.top + scrollTop - tooltipRect.height - 15;
        
        // Adjust if tooltip would go off-screen
        if (top < scrollTop) {
          top = targetRect.bottom + scrollTop + 15;
          tooltip.classList.add('tooltip-bottom');
        }
        break;

      case 'bottom':
        left = targetRect.left + scrollLeft + (targetRect.width / 2) - (tooltipRect.width / 2);
        top = targetRect.bottom + scrollTop + 15;
        
        // Adjust if tooltip would go off-screen
        if (top + tooltipRect.height > viewportHeight + scrollTop) {
          top = targetRect.top + scrollTop - tooltipRect.height - 15;
          tooltip.classList.remove('tooltip-bottom');
        }
        break;
    }

    // Ensure tooltip doesn't go off left/right edges
    if (left < scrollLeft + 10) {
      left = scrollLeft + 10;
    } else if (left + tooltipRect.width > viewportWidth + scrollLeft - 10) {
      left = viewportWidth + scrollLeft - tooltipRect.width - 10;
    }

    // Ensure tooltip doesn't go off top/bottom edges
    if (top < scrollTop + 10) {
      top = scrollTop + 10;
    } else if (top + tooltipRect.height > viewportHeight + scrollTop - 10) {
      top = viewportHeight + scrollTop - tooltipRect.height - 10;
    }

    tooltip.style.position = 'absolute';
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.zIndex = '10000';
  }

  /**
   * Setup event listeners for a tooltip
   * @param {HTMLElement} tooltip - Tooltip element
   * @param {string} tooltipId - Tooltip ID
   * @param {Array} buttons - Button configurations
   * @param {HTMLElement} targetElement - Target element
   * @param {string} side - Position side
   */
  setupTooltipEventListeners(tooltip, tooltipId, buttons, targetElement, side) {
    // Close button
    const closeBtn = tooltip.querySelector('.tooltip-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.dismissTooltip(tooltipId);
      });
    }

    // Button actions
    const tooltipButtons = tooltip.querySelectorAll('.tooltip-btn[data-action]');
    tooltipButtons.forEach(button => {
      const action = button.dataset.action;
      
      button.addEventListener('click', async (e) => {
        e.preventDefault();
        
        // Find button config
        const buttonConfig = buttons.find(btn => btn.action === action);
        if (buttonConfig && buttonConfig.handler) {
          try {
            await buttonConfig.handler(tooltipId, button);
          } catch (error) {
            console.error(`❌ Tooltip button handler error:`, error);
          }
        }
      });
    });

    // Handle scroll repositioning
    const handleScroll = () => {
      if (this.activeTooltips.has(tooltipId)) {
        this.positionTooltip(tooltip, targetElement, side);
      }
    };

    window.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleScroll);

    // Clean up event listeners when tooltip is removed
    const originalRemove = tooltip.remove.bind(tooltip);
    tooltip.remove = () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      originalRemove();
    };

    // Escape key to close
    const handleEscape = (e) => {
      if (e.key === 'Escape' && this.activeTooltips.has(tooltipId)) {
        this.dismissTooltip(tooltipId);
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  /**
   * Show a tooltip
   * @param {Object} config - Tooltip configuration
   * @param {HTMLElement} targetElement - Element to attach tooltip to
   * @param {string} side - Position side
   * @returns {HTMLElement|null} The created tooltip or null if disabled
   */
  showTooltip(config, targetElement, side = 'right') {
    const tooltip = this.createTooltip(config);
    if (!tooltip) return null;

    // Add to DOM
    document.body.appendChild(tooltip);

    // Position tooltip
    this.positionTooltip(tooltip, targetElement, side);

    // Setup event listeners
    this.setupTooltipEventListeners(tooltip, config.id, config.buttons || [], targetElement, side);

    // Add entrance animation
    tooltip.style.opacity = '0';
    tooltip.style.transform = 'scale(0.9)';
    
    requestAnimationFrame(() => {
      tooltip.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      tooltip.style.opacity = '1';
      tooltip.style.transform = 'scale(1)';
    });

    console.log(`✅ Tooltip ${config.id} shown`);
    return tooltip;
  }

  /**
   * Dismiss a tooltip
   * @param {string} tooltipId - Tooltip ID to dismiss
   */
  dismissTooltip(tooltipId) {
    const tooltip = this.activeTooltips.get(tooltipId);
    if (tooltip && tooltip.parentNode) {
      // Add exit animation
      tooltip.style.transition = 'all 0.2s ease';
      tooltip.style.opacity = '0';
      tooltip.style.transform = 'scale(0.9)';
      
      setTimeout(() => {
        if (tooltip.parentNode) {
          tooltip.remove();
        }
      }, 200);
    }
    
    this.activeTooltips.delete(tooltipId);
    this.dismissedTooltips.add(tooltipId);
    this.lastDismissalTime.set(tooltipId, Date.now());
    
    console.log(`✅ Tooltip ${tooltipId} dismissed`);
  }

  /**
   * Remove all active tooltips
   */
  removeAllTooltips() {
    const tooltipIds = Array.from(this.activeTooltips.keys());
    tooltipIds.forEach(id => this.dismissTooltip(id));
    console.log('✅ All tooltips removed');
  }

  /**
   * Permanently disable a tooltip
   * @param {string} tooltipId - Tooltip ID to disable
   * @param {string} reason - Reason for disabling
   */
  permanentlyDisableTooltip(tooltipId, reason = 'user_interaction') {
    this.permanentlyDisabledTooltips.add(tooltipId);
    this.dismissTooltip(tooltipId);
    console.log(`🚫 Tooltip ${tooltipId} permanently disabled: ${reason}`);
  }

  /**
   * Check if tooltip is permanently disabled
   * @param {string} tooltipId - Tooltip ID to check
   * @returns {boolean} True if disabled
   */
  isPermanentlyDisabled(tooltipId) {
    return this.permanentlyDisabledTooltips.has(tooltipId);
  }

  /**
   * Check if tooltip is eligible to be shown (not recently dismissed)
   * @param {string} tooltipId - Tooltip ID to check
   * @param {number} cooldownMs - Cooldown in milliseconds
   * @returns {boolean} True if eligible
   */
  isTooltipEligible(tooltipId, cooldownMs = 30000) {
    if (this.isPermanentlyDisabled(tooltipId)) {
      return false;
    }

    const lastDismissal = this.lastDismissalTime.get(tooltipId);
    if (lastDismissal && (Date.now() - lastDismissal) < cooldownMs) {
      return false;
    }

    return true;
  }

  /**
   * Get icon for tooltip type
   * @param {string} type - Tooltip type
   * @returns {string} Icon HTML
   */
  getTooltipIcon(type) {
    const icons = {
      info: '💡',
      warning: '⚠️',
      success: '✅',
      error: '❌',
      artist: '🎨',
      enhancement: '✨',
      quality: '📊'
    };
    return icons[type] || icons.info;
  }

  /**
   * Inject tooltip styles into the page
   */
  injectStyles() {
    if (document.getElementById('tooltip-system-styles')) return;

    const style = document.createElement('style');
    style.id = 'tooltip-system-styles';
    style.textContent = `
      .ai-tooltip {
        position: absolute;
        background: white;
        border: 1px solid #dee2e6;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        line-height: 1.4;
        max-width: 300px;
        min-width: 200px;
        z-index: 10000;
      }

      .ai-tooltip-artist {
        border-left: 4px solid #ff6b6b;
        background: linear-gradient(135deg, #fff 0%, #fff8f8 100%);
      }

      .ai-tooltip-warning {
        border-left: 4px solid #ffa726;
        background: linear-gradient(135deg, #fff 0%, #fffaf5 100%);
      }

      .ai-tooltip-success {
        border-left: 4px solid #66bb6a;
        background: linear-gradient(135deg, #fff 0%, #f8fff8 100%);
      }

      .ai-tooltip-info {
        border-left: 4px solid #42a5f5;
        background: linear-gradient(135deg, #fff 0%, #f8fcff 100%);
      }

      .tooltip-header {
        display: flex;
        align-items: center;
        padding: 12px 14px 8px;
        border-bottom: 1px solid #f0f0f0;
      }

      .tooltip-icon {
        font-size: 18px;
        margin-right: 10px;
        flex-shrink: 0;
      }

      .tooltip-title {
        font-size: 16px;
        font-weight: 600;
        margin: 0;
        color: #333;
        flex-grow: 1;
      }

      .tooltip-close {
        background: none;
        border: none;
        font-size: 20px;
        color: #999;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        transition: all 0.2s ease;
        flex-shrink: 0;
      }

      .tooltip-close:hover {
        background: #f5f5f5;
        color: #666;
      }

      .tooltip-content {
        padding: 12px 14px;
        color: #555;
      }

      .tooltip-content p {
        margin: 0 0 12px 0;
      }

      .tooltip-content p:last-child {
        margin-bottom: 0;
      }

      .tooltip-buttons {
        padding: 8px 14px 12px;
        border-top: 1px solid #f0f0f0;
        display: flex;
        gap: 6px;
        justify-content: flex-end;
      }

      .tooltip-btn {
        padding: 8px 16px;
        border-radius: 6px;
        border: 1px solid #ddd;
        background: white;
        color: #333;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .tooltip-btn:hover {
        background: #f8f9fa;
        border-color: #bbb;
      }

      .tooltip-btn-primary {
        background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
        color: white;
        border-color: #007bff;
      }

      .tooltip-btn-primary:hover {
        background: linear-gradient(135deg, #0056b3 0%, #004085 100%);
        border-color: #0056b3;
      }

      .tooltip-btn-success {
        background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%);
        color: white;
        border-color: #28a745;
      }

      .tooltip-btn-success:hover {
        background: linear-gradient(135deg, #1e7e34 0%, #155724 100%);
        border-color: #1e7e34;
      }

      .tooltip-btn-danger {
        background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
        color: white;
        border-color: #dc3545;
      }

      .tooltip-btn-danger:hover {
        background: linear-gradient(135deg, #c82333 0%, #a71e2a 100%);
        border-color: #c82333;
      }

      .tooltip-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      /* Positioning classes */
      .tooltip-left::before {
        content: '';
        position: absolute;
        right: -8px;
        top: 50%;
        transform: translateY(-50%);
        border: 8px solid transparent;
        border-left-color: white;
      }

      .tooltip-bottom::before {
        content: '';
        position: absolute;
        top: -8px;
        left: 50%;
        transform: translateX(-50%);
        border: 8px solid transparent;
        border-bottom-color: white;
      }

      /* Animation classes */
      .ai-tooltip {
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
    `;

    document.head.appendChild(style);
    console.log('✅ Tooltip system styles injected');
  }

  /**
   * Initialize the tooltip system
   */
  init() {
    this.injectStyles();
    console.log('✅ TooltipSystemManager: Initialized');
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    this.removeAllTooltips();
    this.activeTooltips.clear();
    this.dismissedTooltips.clear();
    this.lastDismissalTime.clear();
    this.permanentlyDisabledTooltips.clear();
    console.log('🧹 TooltipSystemManager: Cleaned up');
  }
} 