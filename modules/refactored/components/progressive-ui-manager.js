/**
 * Progressive UI Manager - 2025 Design Implementation
 * 
 * Manages the sophisticated UI for multi-stage progressive analysis:
 * - Real-time stage progress visualization
 * - Smooth card animations and micro-interactions
 * - Performance metrics display
 * - Progressive disclosure with skeleton loading
 * 
 * Architecture: Follows .cursorrules modular component pattern
 * Dependencies: progressive-analysis.css for 2025 design system
 */

export class ProgressiveUIManager {
  constructor(options = {}) {
    // Configuration options
    this.options = {
      enableAnimations: true,
      enablePerformanceMetrics: true,
      animationDuration: 250,
      ...options
    };
    
    // UI state management
    this.state = {
      currentStage: null,
      stageTimings: {},
      visibleCards: new Set(),
      isVisible: false,
      performanceMetrics: {
        totalDuration: 0,
        stageCount: 0,
        averageConfidence: 0
      }
    };
    
    // DOM references
    this.modal = null;
    this.container = null;
    this.progressIndicator = null;
    this.resultsContainer = null;
    this.metricsContainer = null;
    
    // Animation controllers
    this.animationQueue = [];
    this.isAnimating = false;
    
    console.log('[PROGRESSIVE-UI] Manager initialized with 2025 design system');
  }

  /**
   * Create and show the progressive analysis modal
   */
  async createModal(title = 'Progressiv AI-analys', subtitle = 'Flerstegssystem för optimal hastighet och kvalitet') {
    console.log('[PROGRESSIVE-UI] Creating 2025 modal interface...');
    
    // Create modal structure
    this.modal = this.createElement('div', 'progressive-analysis-modal');
    this.container = this.createElement('div', 'progressive-analysis-container');
    
    // Build modal content with 2025 design
    this.container.innerHTML = `
      <div class="progressive-header">
        <h2 class="progressive-title">${title}</h2>
        <p class="progressive-subtitle">${subtitle}</p>
        <button class="progressive-close" aria-label="Stäng modal">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      
      <div class="progressive-content">
        <div class="stage-progress">
          <!-- Stage indicators populated dynamically -->
        </div>
        
        <div class="analysis-results">
          <!-- Result cards populated dynamically -->
        </div>
        
        <div class="performance-metrics" style="display: none;">
          <div class="metric">
            <div class="metric-value" data-metric="duration">0s</div>
            <div class="metric-label">Total tid</div>
          </div>
          <div class="metric">
            <div class="metric-value" data-metric="stages">0</div>
            <div class="metric-label">Stadier</div>
          </div>
          <div class="metric">
            <div class="metric-value" data-metric="confidence">0%</div>
            <div class="metric-label">Säkerhet</div>
          </div>
        </div>
      </div>
      
      <div class="progressive-actions">
        <button class="btn-progressive secondary" data-action="cancel">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
          Avbryt
        </button>
        <button class="btn-progressive primary" data-action="apply" disabled>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20,6 9,17 4,12"></polyline>
          </svg>
          Tillämpa resultat
        </button>
      </div>
    `;
    
    // Store DOM references
    this.progressIndicator = this.container.querySelector('.stage-progress');
    this.resultsContainer = this.container.querySelector('.analysis-results');
    this.metricsContainer = this.container.querySelector('.performance-metrics');
    
    // Add to DOM
    this.modal.appendChild(this.container);
    document.body.appendChild(this.modal);
    
    // Setup interactions
    this.setupEventListeners();
    this.initializeStageProgress();
    
    // Show with animation
    await this.showModal();
    this.state.isVisible = true;
    
    console.log('[PROGRESSIVE-UI] Modal created and displayed');
  }

  /**
   * Initialize 3-stage progress indicator with 2025 styling
   */
  initializeStageProgress() {
    const stages = [
      { id: 'stage1', label: 'Snabb identifiering', timing: '1-2s', model: 'Haiku' },
      { id: 'stage2', label: 'Detaljerad analys', timing: '3-4s', model: '3.5 Sonnet' },
      { id: 'stage3', label: 'Expertanalys', timing: '6-8s', model: 'Claude 4' }
    ];
    
    let progressHTML = '';
    
    stages.forEach((stage, index) => {
      const isLast = index === stages.length - 1;
      
      progressHTML += `
        <div class="stage-indicator" data-stage="${stage.id}">
          <div class="stage-dot pending" data-stage-dot="${stage.id}">
            ${index + 1}
          </div>
          <div class="stage-info">
            <div class="stage-label">${stage.label}</div>
            <div class="stage-timing">${stage.timing} • ${stage.model}</div>
          </div>
        </div>
        ${!isLast ? '<div class="stage-connector" data-connector="' + stage.id + '"></div>' : ''}
      `;
    });
    
    this.progressIndicator.innerHTML = progressHTML;
    console.log('[PROGRESSIVE-UI] Stage progress initialized');
  }

  /**
   * Update stage progress with smooth micro-animations
   */
  async updateStageProgress(stageId, status, timing = null) {
    const stageDot = this.progressIndicator.querySelector(`[data-stage-dot="${stageId}"]`);
    const connector = this.progressIndicator.querySelector(`[data-connector="${stageId}"]`);
    
    if (!stageDot) return;
    
    console.log(`[PROGRESSIVE-UI] Updating stage ${stageId} to ${status}`);
    
    // Update timing display
    if (timing) {
      const stageInfo = stageDot.parentElement.querySelector('.stage-timing');
      if (stageInfo) {
        stageInfo.textContent = `${timing}ms • Slutförd`;
      }
    }
    
    // Update visual state
    stageDot.classList.remove('pending', 'active', 'complete');
    
    switch (status) {
      case 'active':
        stageDot.classList.add('active');
        this.state.currentStage = stageId;
        break;
        
      case 'complete':
        stageDot.classList.add('complete');
        if (connector) connector.classList.add('complete');
        if (timing) this.state.stageTimings[stageId] = timing;
        break;
        
      default:
        stageDot.classList.add('pending');
    }
    
    // Micro-interaction animation
    if (this.options.enableAnimations) {
      stageDot.style.transform = 'scale(1.1)';
      setTimeout(() => {
        stageDot.style.transform = 'scale(1)';
      }, 150);
    }
  }

  /**
   * Add result card with progressive disclosure
   */
  async addResultCard(taskType, result, stage, confidence = null) {
    const cardId = `card-${taskType}`;
    
    // Check if card exists
    let card = this.resultsContainer.querySelector(`[data-card-id="${cardId}"]`);
    
    if (!card) {
      // Create new card with skeleton
      card = this.createElement('div', 'result-card');
      card.setAttribute('data-card-id', cardId);
      card.innerHTML = this.createSkeletonContent(taskType, stage);
      
      this.resultsContainer.appendChild(card);
      await this.animateCardAppearance(card);
    }
    
    // Update with real content
    await this.updateCardContent(card, taskType, result, stage, confidence);
    
    this.state.visibleCards.add(cardId);
    console.log(`[PROGRESSIVE-UI] Added/updated result card: ${taskType}`);
  }

  /**
   * Create skeleton loading content
   */
  createSkeletonContent(taskType, stage) {
    const stageClass = `stage-${stage.replace('stage', '')}`;
    const taskLabels = {
      'quick-object-identification': 'Objektidentifiering',
      'basic-condition-assessment': 'Skickbedömning',
      'material-detection': 'Materialanalys',
      'preliminary-title': 'Preliminär titel',
      'detailed-description': 'Detaljerad beskrivning',
      'keyword-generation': 'Sökordsgenerering',
      'basic-valuation': 'Grundläggande värdering',
      'period-identification': 'Periodidentifiering',
      'artist-attribution': 'Konstnärstillskrivning',
      'market-analysis': 'Marknadsanalys',
      'expert-valuation': 'Expertvärdering',
      'confidence-scoring': 'Säkerhetspoäng'
    };
    
    return `
      <div class="result-header">
        <h3 class="result-title">${taskLabels[taskType] || taskType}</h3>
        <span class="result-stage ${stageClass}">Steg ${stage.replace('stage', '')}</span>
      </div>
      <div class="result-content">
        <div class="result-skeleton"></div>
        <div class="result-skeleton"></div>
        <div class="result-skeleton"></div>
      </div>
    `;
  }

  /**
   * Update card content with smooth transition
   */
  async updateCardContent(card, taskType, result, stage, confidence) {
    card.classList.add('updating');
    await this.delay(200);
    
    const contentDiv = card.querySelector('.result-content');
    contentDiv.innerHTML = `
      <div class="result-text">${result}</div>
      ${confidence !== null ? this.createConfidenceIndicator(confidence) : ''}
    `;
    
    card.classList.remove('updating');
    console.log(`[PROGRESSIVE-UI] Updated card content: ${taskType}`);
  }

  /**
   * Create confidence indicator with shimmer animation
   */
  createConfidenceIndicator(confidence) {
    const percentage = Math.round(confidence * 100);
    
    return `
      <div class="confidence-indicator">
        <div class="confidence-bar">
          <div class="confidence-fill" style="width: ${percentage}%"></div>
        </div>
        <div class="confidence-value">${percentage}%</div>
      </div>
    `;
  }

  /**
   * Animate card appearance
   */
  async animateCardAppearance(card) {
    if (!this.options.enableAnimations) {
      card.classList.add('visible');
      return;
    }
    
    return new Promise((resolve) => {
      setTimeout(() => {
        card.classList.add('visible');
        setTimeout(resolve, this.options.animationDuration);
      }, 50);
    });
  }

  /**
   * Update performance metrics in real-time
   */
  updatePerformanceMetrics(metrics) {
    if (!this.options.enablePerformanceMetrics) return;
    
    const { totalDuration, stageCount, averageConfidence } = metrics;
    this.state.performanceMetrics = { totalDuration, stageCount, averageConfidence };
    
    // Update UI elements
    const durationElement = this.metricsContainer.querySelector('[data-metric="duration"]');
    const stagesElement = this.metricsContainer.querySelector('[data-metric="stages"]');
    const confidenceElement = this.metricsContainer.querySelector('[data-metric="confidence"]');
    
    if (durationElement) {
      const seconds = (totalDuration / 1000).toFixed(1);
      this.animateValue(durationElement, seconds + 's');
    }
    
    if (stagesElement) {
      this.animateValue(stagesElement, stageCount.toString());
    }
    
    if (confidenceElement) {
      const percentage = Math.round(averageConfidence * 100);
      this.animateValue(confidenceElement, percentage + '%');
    }
    
    // Show metrics if hidden
    if (this.metricsContainer.style.display === 'none') {
      this.metricsContainer.style.display = 'flex';
      this.metricsContainer.style.opacity = '0';
      this.metricsContainer.style.animation = 'cardSlideIn 250ms ease-out forwards';
    }
    
    console.log('[PROGRESSIVE-UI] Performance metrics updated:', metrics);
  }

  /**
   * Animate value changes with micro-interactions
   */
  animateValue(element, newValue) {
    if (!this.options.enableAnimations) {
      element.textContent = newValue;
      return;
    }
    
    element.style.transform = 'scale(1.1)';
    element.style.color = 'var(--progressive-primary)';
    
    setTimeout(() => {
      element.textContent = newValue;
      element.style.transform = 'scale(1)';
      element.style.color = '';
    }, 100);
  }

  /**
   * Show completion state with celebration
   */
  async showCompletionState(finalResults) {
    console.log('[PROGRESSIVE-UI] Showing completion state...');
    
    // Update all stages to complete
    await this.updateStageProgress('stage1', 'complete', finalResults.performance?.stageTimings?.stage1);
    await this.updateStageProgress('stage2', 'complete', finalResults.performance?.stageTimings?.stage2);
    await this.updateStageProgress('stage3', 'complete', finalResults.performance?.stageTimings?.stage3);
    
    // Enable apply button with animation
    const applyButton = this.container.querySelector('[data-action="apply"]');
    if (applyButton) {
      applyButton.disabled = false;
      applyButton.style.animation = 'stagePulse 1s ease-out';
    }
    
    // Update final metrics
    if (finalResults.performance) {
      this.updatePerformanceMetrics({
        totalDuration: finalResults.performance.totalDuration,
        stageCount: 3,
        averageConfidence: this.calculateAverageConfidence(finalResults)
      });
    }
    
    // Celebration micro-animation
    if (this.options.enableAnimations) {
      this.container.style.animation = 'cardUpdate 0.5s ease-out';
    }
  }

  /**
   * Calculate average confidence across all results
   */
  calculateAverageConfidence(results) {
    const allResults = [
      ...Object.values(results.stage1 || {}),
      ...Object.values(results.stage2 || {}),
      ...Object.values(results.stage3 || {})
    ];
    
    const validConfidences = allResults
      .map(r => r.confidence)
      .filter(c => typeof c === 'number' && !isNaN(c));
    
    if (validConfidences.length === 0) return 0.5;
    
    return validConfidences.reduce((sum, c) => sum + c, 0) / validConfidences.length;
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Close button
    const closeButton = this.container.querySelector('.progressive-close');
    closeButton?.addEventListener('click', () => this.closeModal());
    
    // Action buttons
    const cancelButton = this.container.querySelector('[data-action="cancel"]');
    const applyButton = this.container.querySelector('[data-action="apply"]');
    
    cancelButton?.addEventListener('click', () => this.closeModal());
    applyButton?.addEventListener('click', () => this.handleApply());
    
    // Backdrop click
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeModal();
    });
    
    // Keyboard navigation
    document.addEventListener('keydown', this.handleKeydown.bind(this));
  }

  /**
   * Handle keyboard events
   */
  handleKeydown(e) {
    if (!this.state.isVisible) return;
    if (e.key === 'Escape') this.closeModal();
  }

  /**
   * Handle apply button
   */
  handleApply() {
    console.log('[PROGRESSIVE-UI] Apply button clicked');
    
    const event = new CustomEvent('progressiveAnalysisApply', {
      detail: {
        results: this.state.finalResults,
        metrics: this.state.performanceMetrics
      }
    });
    
    document.dispatchEvent(event);
  }

  /**
   * Show modal with animation
   */
  async showModal() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        this.modal.style.opacity = '1';
        setTimeout(resolve, this.options.animationDuration);
      });
    });
  }

  /**
   * Close modal with animation
   */
  async closeModal() {
    console.log('[PROGRESSIVE-UI] Closing modal...');
    
    if (!this.state.isVisible) return;
    this.state.isVisible = false;
    
    // Animate out
    this.modal.style.opacity = '0';
    this.container.style.transform = 'scale(0.95) translateY(20px)';
    
    setTimeout(() => {
      if (this.modal && this.modal.parentNode) {
        this.modal.parentNode.removeChild(this.modal);
      }
      this.cleanup();
    }, this.options.animationDuration);
    
    // Emit close event
    const event = new CustomEvent('progressiveAnalysisClose');
    document.dispatchEvent(event);
  }

  /**
   * Utility functions
   */
  createElement(tag, className) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    return element;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up resources
   */
  cleanup() {
    document.removeEventListener('keydown', this.handleKeydown.bind(this));
    
    this.state = {
      currentStage: null,
      stageTimings: {},
      visibleCards: new Set(),
      isVisible: false,
      performanceMetrics: { totalDuration: 0, stageCount: 0, averageConfidence: 0 }
    };
    
    this.modal = null;
    this.container = null;
    this.progressIndicator = null;
    this.resultsContainer = null;
    this.metricsContainer = null;
    
    console.log('[PROGRESSIVE-UI] Manager cleaned up');
  }

  /**
   * Destroy the manager
   */
  destroy() {
    if (this.state.isVisible) {
      this.closeModal();
    } else {
      this.cleanup();
    }
  }
} 