// modules/core/tooltip-manager.js - Reusable Tooltip Component
export class TooltipManager {
  constructor() {
    this.tooltips = new Map(); // Track all active tooltips
    this.init();
  }

  init() {
    // Add global styles for tooltips
    this.addGlobalStyles();
  }

  addGlobalStyles() {
    // Check if styles already exist
    if (document.getElementById('tooltip-manager-styles')) return;

    const style = document.createElement('style');
    style.id = 'tooltip-manager-styles';
    style.textContent = `
      .tooltip-trigger {
        cursor: help;
        transition: transform 0.2s ease;
      }

      .tooltip-trigger:hover {
        transform: scale(1.05);
      }

      .tooltip-content {
        position: absolute;
        background: #2c3e50;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-size: 13px;
        line-height: 1.4;
        max-width: 280px;
        z-index: 9999;
        opacity: 0;
        visibility: hidden;
        transform: translate(-50%, -100%) translateY(-8px);
        transition: all 0.3s ease;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        white-space: pre-line;
        text-align: left;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .tooltip-content::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border: 8px solid transparent;
        border-top-color: #2c3e50;
      }

      .tooltip-content.visible {
        opacity: 1;
        visibility: visible;
        transform: translate(-50%, -100%) translateY(-8px);
      }

      .tooltip-content.bottom {
        transform: translate(-50%, 100%) translateY(8px);
      }

      .tooltip-content.bottom::after {
        top: -16px;
        border-top-color: transparent;
        border-bottom-color: #2c3e50;
      }

      .tooltip-content.bottom.visible {
        transform: translate(-50%, 100%) translateY(8px);
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Add tooltip to an element
   * @param {HTMLElement} element - Element to add tooltip to
   * @param {string} content - Tooltip content (supports line breaks with \n)
   * @param {Object} options - Configuration options
   */
  addTooltip(element, content, options = {}) {
    const config = {
      position: 'top', // 'top' or 'bottom'
      delay: 0,
      className: '',
      ...options
    };

    // Create unique ID for this tooltip
    const tooltipId = `tooltip-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = `tooltip-content ${config.position} ${config.className}`;
    tooltip.id = tooltipId;
    tooltip.textContent = content;
    document.body.appendChild(tooltip);

    // Add trigger class to element
    element.classList.add('tooltip-trigger');

    // Store tooltip reference
    this.tooltips.set(element, {
      tooltip,
      config,
      tooltipId
    });

    // Add event listeners
    const showTooltip = (e) => {
      if (config.delay > 0) {
        setTimeout(() => this.showTooltip(element), config.delay);
      } else {
        this.showTooltip(element);
      }
    };

    const hideTooltip = (e) => {
      this.hideTooltip(element);
    };

    element.addEventListener('mouseenter', showTooltip);
    element.addEventListener('mouseleave', hideTooltip);
    element.addEventListener('focus', showTooltip);
    element.addEventListener('blur', hideTooltip);

    // Store event listeners for cleanup
    this.tooltips.get(element).showTooltip = showTooltip;
    this.tooltips.get(element).hideTooltip = hideTooltip;

    return tooltipId;
  }

  /**
   * Show tooltip for element
   */
  showTooltip(element) {
    const tooltipData = this.tooltips.get(element);
    if (!tooltipData) return;

    const { tooltip, config } = tooltipData;
    const rect = element.getBoundingClientRect();
    
    // Position tooltip
    tooltip.style.left = `${rect.left + rect.width / 2}px`;
    
    if (config.position === 'bottom') {
      tooltip.style.top = `${rect.bottom + 10}px`;
    } else {
      tooltip.style.top = `${rect.top - 10}px`;
    }

    // Show tooltip
    tooltip.classList.add('visible');
  }

  /**
   * Hide tooltip for element
   */
  hideTooltip(element) {
    const tooltipData = this.tooltips.get(element);
    if (!tooltipData) return;

    const { tooltip } = tooltipData;
    tooltip.classList.remove('visible');
  }

  /**
   * Update tooltip content
   */
  updateContent(element, newContent) {
    const tooltipData = this.tooltips.get(element);
    if (!tooltipData) return;

    tooltipData.tooltip.textContent = newContent;
  }

  /**
   * Remove tooltip from element
   */
  removeTooltip(element) {
    const tooltipData = this.tooltips.get(element);
    if (!tooltipData) return;

    const { tooltip, showTooltip, hideTooltip } = tooltipData;

    // Remove event listeners
    element.removeEventListener('mouseenter', showTooltip);
    element.removeEventListener('mouseleave', hideTooltip);
    element.removeEventListener('focus', showTooltip);
    element.removeEventListener('blur', hideTooltip);

    // Remove DOM elements
    element.classList.remove('tooltip-trigger');
    if (tooltip.parentNode) {
      tooltip.parentNode.removeChild(tooltip);
    }

    // Remove from tracking
    this.tooltips.delete(element);
  }

  /**
   * Remove all tooltips
   */
  removeAllTooltips() {
    for (const element of this.tooltips.keys()) {
      this.removeTooltip(element);
    }
  }

  /**
   * Convenience method: Add tooltips to multiple elements with data-tooltip attribute
   */
  initializeDataTooltips(container = document) {
    const elements = container.querySelectorAll('[data-tooltip]');
    elements.forEach(element => {
      const content = element.getAttribute('data-tooltip');
      if (content) {
        this.addTooltip(element, content);
      }
    });
  }

  /**
   * Get active tooltip count
   */
  getActiveCount() {
    return this.tooltips.size;
  }
} 