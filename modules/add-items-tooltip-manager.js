// modules/add-items-tooltip-manager.js - Orchestrator for add items page tooltip system
// Coordinates extracted modules: artist-handler, field-analyzer, ai-enhancement, ui-feedback

import { ArtistDetectionManager } from './artist-detection-manager.js';
import { escapeHTML } from './core/html-escape.js';
import { AddItemsArtistHandler } from './add-items/artist-handler.js';
import { AddItemsFieldAnalyzer } from './add-items/field-analyzer.js';
import { AddItemsAIEnhancement } from './add-items/ai-enhancement.js';
import { AddItemsUIFeedback } from './add-items/ui-feedback.js';

export class AddItemsTooltipManager {
  constructor(apiManager, qualityAnalyzer) {
    this.apiManager = apiManager;
    this.qualityAnalyzer = qualityAnalyzer;
    
    // Core state
    this.enabled = true;
    this.activeTooltips = new Map();
    this.dismissedTooltips = new Set();
    this.lastDismissalTime = new Map();
    this.pendingTooltips = new Set();
    
    // Permanent tooltip state management
    this.permanentlyDisabledTooltips = new Set();
    this.lastFieldValues = new Map();
    this.isProgrammaticUpdate = false;
    
    this.analysisTimeout = null;
    
    // Field mappings
    this.fieldMappings = {
      title: '#item_title_sv',
      description: '#item_description_sv', 
      condition: '#item_condition_sv',
      artist: '#item_artist_name_sv',
      keywords: '#item_hidden_keywords'
    };
    
    // Initialize sub-modules
    this.artistHandler = new AddItemsArtistHandler();
    this.fieldAnalyzer = new AddItemsFieldAnalyzer();
    this.aiEnhancement = new AddItemsAIEnhancement();
    this.uiFeedback = new AddItemsUIFeedback();
    
    // Wire dependencies
    this.artistHandler.setDependencies({
      artistDetectionManager: new ArtistDetectionManager(apiManager),
      apiManager
    });
    this.fieldAnalyzer.setDependencies({ apiManager });
    this.aiEnhancement.setDependencies({ apiManager });
    
    // Wire callbacks - shared interface for all sub-modules
    const sharedCallbacks = {
      // State accessors
      isEnabled: () => this.enabled,
      getFieldMappings: () => this.fieldMappings,
      extractFormData: () => this.extractFormData(),
      hasEnoughDataForAnalysis: (data) => this.hasEnoughDataForAnalysis(data),
      getQualityAnalyzer: () => this.qualityAnalyzer,
      
      // Tooltip management
      isTooltipEligible: (id, formData) => this.isTooltipEligible(id, formData),
      isTooltipActive: (id) => this.activeTooltips.has(id),
      isDismissed: (id) => this.dismissedTooltips.has(id),
      addDismissed: (id) => this.dismissedTooltips.add(id),
      getLastDismissalTime: (id) => this.lastDismissalTime?.get?.(id),
      dismissTooltip: (id) => this.dismissTooltip(id),
      clearTooltipTracking: (id) => {
        this.activeTooltips.delete(id);
        if (this.lastDismissalTime?.delete) {
          this.lastDismissalTime.delete(id);
        }
      },
      createTooltip: (config) => this.createTooltip(config),
      permanentlyDisableTooltip: (id, reason) => this.permanentlyDisableTooltip(id, reason),
      
      // Feedback
      showSuccessFeedback: (msg) => this.uiFeedback.showSuccessFeedback(msg),
      showErrorFeedback: (msg) => this.uiFeedback.showErrorFeedback(msg),
      showLoadingIndicator: (type) => this.uiFeedback.showLoadingIndicator(type),
      showSuccessIndicator: (type) => this.uiFeedback.showSuccessIndicator(type),
      showErrorIndicator: (type, msg) => this.uiFeedback.showErrorIndicator(type, msg),
      
      // Field operations
      improveField: (type, opts) => this.aiEnhancement.improveField(type, opts),
      setProgrammaticUpdate: (val) => { this.isProgrammaticUpdate = val; },
      autoResizeTextarea: (el) => this.uiFeedback.autoResizeTextarea(el),
      
      // Analysis
      triggerAnalysis: () => this.triggerAnalysis(),
      analyzeQuality: () => this.analyzeQuality(),
      addQualityIndicator: () => this.addQualityIndicator(),
    };
    
    this.artistHandler.setCallbacks(sharedCallbacks);
    this.fieldAnalyzer.setCallbacks(sharedCallbacks);
    this.aiEnhancement.setCallbacks(sharedCallbacks);
    this.uiFeedback.setCallbacks(sharedCallbacks);
  }

  // ==================== UTILITY ====================

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // ==================== INITIALIZATION ====================

  async init() {
    await this.loadSettings();
    
    if (!this.enabled) {
      return;
    }
    
    this.initializeFieldTracking();
    this.setupEventListeners();
    this.injectStyles(); // Now a no-op - CSS loaded via manifest.json
    
    this.aiEnhancement.injectAIButtons();
    this.uiFeedback.setupAutoResizeForAllTextareas();
  }

  initializeFieldTracking() {
    const formData = this.extractFormData();
    this.updateFieldValues(formData);
  }

  async loadSettings() {
    try {
      this.enabled = true;
    } catch (error) {
      console.error('Error loading tooltip settings:', error);
      this.enabled = true;
    }
  }

  // ==================== EVENT LISTENERS ====================

  setupEventListeners() {
    this.setupLiveQualityUpdates();
    
    const titleField = document.querySelector(this.fieldMappings.title);
    if (titleField) {
      titleField.addEventListener('input', this.debounce(() => {
        this.artistHandler.scheduleArtistDetection();
      }, 800));
      
      titleField.addEventListener('paste', () => {
        setTimeout(() => this.artistHandler.scheduleArtistDetection(), 200);
      });
      
      titleField.addEventListener('blur', () => {
        if (this.artistHandler.artistDetectionTimeout) {
          clearTimeout(this.artistHandler.artistDetectionTimeout);
        }
        this.artistHandler.triggerArtistDetectionOnly();
      });
    }
    
    const descriptionField = document.querySelector(this.fieldMappings.description);
    if (descriptionField) {
      const debouncedDescriptionAnalysis = this.debounce(() => {
        const formData = this.extractFormData();
        this.fieldAnalyzer.analyzeDescriptionQuality(formData);
      }, 1200);
      
      descriptionField.addEventListener('input', debouncedDescriptionAnalysis);
      descriptionField.addEventListener('paste', () => {
        setTimeout(() => {
          const formData = this.extractFormData();
          this.fieldAnalyzer.analyzeDescriptionQuality(formData);
        }, 300);
      });
      descriptionField.addEventListener('blur', () => {
        const formData = this.extractFormData();
        this.fieldAnalyzer.analyzeDescriptionQuality(formData);
      });
    }
    
    const conditionField = document.querySelector(this.fieldMappings.condition);
    if (conditionField) {
      const debouncedConditionAnalysis = this.debounce(() => {
        const formData = this.extractFormData();
        this.fieldAnalyzer.analyzeConditionQuality(formData);
      }, 1000);
      
      conditionField.addEventListener('input', debouncedConditionAnalysis);
      conditionField.addEventListener('paste', () => {
        setTimeout(() => {
          const formData = this.extractFormData();
          this.fieldAnalyzer.analyzeConditionQuality(formData);
        }, 300);
      });
      conditionField.addEventListener('blur', () => {
        const formData = this.extractFormData();
        this.fieldAnalyzer.analyzeConditionQuality(formData);
      });
    }
    
    const artistField = document.querySelector(this.fieldMappings.artist);
    if (artistField) {
      artistField.addEventListener('input', this.debounce((e) => {
        const artistValue = e.target.value.trim();
        if (artistValue.length === 0) {
          this.artistHandler.scheduleArtistDetection();
        }
      }, 500));
    }
    
    const noRemarksCheckboxes = [
      'input[type="checkbox"][value="Inga anmärkningar"]',
      'input[type="checkbox"]#item_no_remarks',
      'input[type="checkbox"][name*="no_remarks"]'
    ];
    
    noRemarksCheckboxes.forEach(selector => {
      const checkbox = document.querySelector(selector);
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          if (e.target.checked) {
            this.dismissTooltip('condition-quality');
          } else {
            setTimeout(() => {
              const formData = this.extractFormData();
              this.fieldAnalyzer.analyzeConditionQuality(formData);
            }, 500);
          }
        });
      }
    });
    
    this.setupAutoResize();
  }

  setupAutoResize() {
    // Placeholder - full auto-resize handled by uiFeedback
  }

  // ==================== ANALYSIS SCHEDULING ====================

  debouncedAnalysis() {
    if (this.analysisTimeout) {
      clearTimeout(this.analysisTimeout);
    }
    this.analysisTimeout = setTimeout(() => {
      this.triggerAnalysis();
    }, 3000);
  }

  scheduleAnalysis(delay = 1200) {
    if (this.analysisTimeout) {
      clearTimeout(this.analysisTimeout);
    }
    this.analysisTimeout = setTimeout(() => {
      this.triggerAnalysis();
    }, delay);
  }

  async triggerAnalysis() {
    const formData = this.extractFormData();
    await this.artistHandler.analyzeArtistDetection(formData);
    await this.fieldAnalyzer.analyzeDescriptionQuality(formData);
    await this.fieldAnalyzer.analyzeConditionQuality(formData);
  }

  async analyzeFieldEnhancements(formData) {
    await this.fieldAnalyzer.analyzeDescriptionQuality(formData);
    await this.fieldAnalyzer.analyzeConditionQuality(formData);
    await this.artistHandler.analyzeArtistEnhancement(formData);
  }

  // ==================== DATA EXTRACTION ====================

  extractFormData() {
    return {
      category: document.querySelector('#item_category_id option:checked')?.textContent || '',
      title: document.querySelector('#item_title_sv')?.value || '',
      description: document.querySelector('#item_description_sv')?.value || '',
      condition: document.querySelector('#item_condition_sv')?.value || '',
      artist: document.querySelector('#item_artist_name_sv')?.value || '',
      keywords: document.querySelector('#item_hidden_keywords')?.value || '',
      estimate: document.querySelector('#item_current_auction_attributes_estimate')?.value || '',
      reserve: document.querySelector('#item_current_auction_attributes_reserve')?.value || ''
    };
  }

  hasEnoughDataForAnalysis(data) {
    const titleLength = (data.title || '').trim().length;
    return titleLength >= 10;
  }

  // ==================== QUALITY INDICATOR ====================

  addQualityIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'quality-indicator';
    indicator.innerHTML = `
      <div class="quality-header">
        <h4 class="quality-title">Auctionet Kvalitetskontroll</h4>
        <div class="quality-score-container">
          <span class="quality-score">Analyserar...</span>
          <button class="refresh-quality-btn" type="button" title="Uppdatera kvalitetspoäng">🔄</button>
        </div>
        <button class="ai-assist-button ai-master-button" type="button">Förbättra alla fält</button>
      </div>
    `;
    
    let targetElement = document.querySelector('.grid-col4') || 
                       document.querySelector('.sidebar') ||
                       document.querySelector('form');
    
    if (targetElement) {
        targetElement.insertBefore(indicator, targetElement.firstChild);
      this.analyzeQuality();
    }
  }

  setupLiveQualityUpdates() {
    let updateTimeout;
    const debouncedUpdate = () => {
      clearTimeout(updateTimeout);
      updateTimeout = setTimeout(() => {
        this.analyzeQuality();
      }, 800);
    };

    const fieldsToMonitor = [
      '#item_title_sv',
      '#item_description_sv', 
      '#item_condition_sv',
      '#item_hidden_keywords',
      'input[type="checkbox"][value="Inga anmärkningar"]',
      'input[type="checkbox"]#item_no_remarks',
      'input[type="checkbox"][name*="no_remarks"]'
    ];

    fieldsToMonitor.forEach(selector => {
      const element = document.querySelector(selector);
      if (element) {
        if (element.type === 'checkbox') {
          element.addEventListener('change', debouncedUpdate);
        } else {
          element.addEventListener('input', debouncedUpdate);
          element.addEventListener('paste', debouncedUpdate);
          element.addEventListener('keyup', debouncedUpdate);
        }
      }
    });
  }

  analyzeQuality() {
    const data = this.extractFormData();
    const warnings = [];
    let score = 100;
    
    const noRemarksCheckbox = document.querySelector('input[type="checkbox"][value="Inga anmärkningar"]') || 
                             document.querySelector('input[type="checkbox"]#item_no_remarks') ||
                             document.querySelector('input[type="checkbox"][name*="no_remarks"]');
    const noRemarksChecked = noRemarksCheckbox && noRemarksCheckbox.checked;

    // Title quality checks
    if (data.title.length < 20) {
      warnings.push({ field: 'Titel', issue: 'För kort - lägg till material och period', severity: 'high' });
      score -= 20;
    }
    if (!data.title.includes(',')) {
      warnings.push({ field: 'Titel', issue: 'Saknar korrekt struktur (KONSTNÄR, Objekt, Material)', severity: 'medium' });
      score -= 15;
    }

    // Description quality checks
    const descLength = data.description.replace(/<[^>]*>/g, '').length;
    if (descLength < 50) {
      warnings.push({ field: 'Beskrivning', issue: 'För kort - lägg till detaljer om material, teknik, färg, märkningar', severity: 'high' });
      score -= 25;
    }
    if (!data.description.match(/\d+[\s,]*(x|cm)/i)) {
      warnings.push({ field: 'Beskrivning', issue: 'Saknar fullständiga mått', severity: 'high' });
      score -= 20;
    }

    // Condition quality checks
    if (!noRemarksChecked) {
      const condLength = data.condition.replace(/<[^>]*>/g, '').length;
      if (condLength < 20) {
        warnings.push({ field: 'Kondition', issue: 'För vag - specificera typ av slitage och skador', severity: 'high' });
        score -= 20;
      }
      if (data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) {
        warnings.push({ field: 'Kondition', issue: 'Endast "bruksslitage" är otillräckligt - specificera typ av slitage', severity: 'high' });
        score -= 25;
      }
      
      const vaguePhrases = ['normalt slitage', 'vanligt slitage', 'åldersslitage', 'slitage förekommer'];
      const conditionText = data.condition.toLowerCase();
      const hasVaguePhrase = vaguePhrases.some(phrase => 
        conditionText.includes(phrase) && conditionText.replace(/<[^>]*>/g, '').trim().length < 30
      );
      
      if (hasVaguePhrase) {
        warnings.push({ field: 'Kondition', issue: 'Vag konditionsbeskrivning - beskriv specifika skador', severity: 'medium' });
        score -= 15;
      }
    } else {
      warnings.push({ field: 'Kondition', issue: '✓ "Inga anmärkningar" markerat', severity: 'low' });
    }

    // Keywords quality checks
    const keywordCount = data.keywords ? 
      (data.keywords.includes(',') ? 
        data.keywords.split(',').filter(k => k.trim().length > 0).length :
        data.keywords.split(/\s+/).filter(k => k.trim().length > 0).length
      ) : 0;
    
    if (!data.keywords || data.keywords.trim() === '') {
      warnings.push({ field: 'Sökord', issue: 'Inga dolda sökord - kritiskt för sökbarhet', severity: 'high' });
      score -= 30;
    } else if (keywordCount < 2) {
      warnings.push({ field: 'Sökord', issue: 'För få sökord', severity: 'high' });
      score -= 20;
    } else if (keywordCount < 4) {
      warnings.push({ field: 'Sökord', issue: 'Bra start - fler sökord kan förbättra sökbarheten', severity: 'medium' });
      score -= 10;
    } else if (keywordCount > 12) {
      warnings.push({ field: 'Sökord', issue: 'För många sökord', severity: 'medium' });
      score -= 15;
    }
    
    this.updateQualityIndicator(score, warnings);
  }

  updateQualityIndicator(score, warnings) {
    const scoreElement = document.querySelector('.quality-score');
    
    if (scoreElement) {
      const currentScore = parseInt(scoreElement.textContent.split('/')[0]) || 0;
      
      if (currentScore !== score) {
        scoreElement.style.transform = 'scale(1.1)';
        setTimeout(() => {
          scoreElement.style.transform = 'scale(1)';
        }, 200);
      }
      
      scoreElement.textContent = `${score}/100`;
      scoreElement.className = `quality-score ${score >= 80 ? 'good' : score >= 60 ? 'medium' : 'poor'}`;
    }
  }

  // ==================== TOOLTIP SYSTEM ====================

  createTooltip(config) {
    const tooltip = document.createElement('div');
    tooltip.id = `ai-tooltip-${config.id}`;
    tooltip.className = `ai-tooltip add-items-tooltip ${config.type}`;
    
    let tooltipHTML = '<div class="tooltip-arrow"></div>';
    tooltipHTML += `<div class="tooltip-content">`;
    tooltipHTML += config.html || config.content;
    
    if (config.buttons && config.buttons.length > 0) {
      tooltipHTML += '<div class="tooltip-buttons">';
      config.buttons.forEach((button, index) => {
        tooltipHTML += `<button class="tooltip-button ${escapeHTML(button.className || '')}" data-button-index="${index}">${escapeHTML(button.text)}</button>`;
      });
      tooltipHTML += '</div>';
    }
    
    if (config.dismissible !== false) {
      tooltipHTML += '<button class="tooltip-dismiss" type="button">×</button>';
    }
    
    tooltipHTML += '</div>';
    tooltip.innerHTML = tooltipHTML;
    
    let targetElement;
    if (config.targetElement) {
      targetElement = config.targetElement;
    } else if (config.targetSelector) {
      targetElement = document.querySelector(config.targetSelector);
    }
    
    if (targetElement) {
      document.body.appendChild(tooltip);
      this.positionTooltip(tooltip, targetElement, config.side);
      
      if (config.buttons && config.buttons.length > 0) {
        this.setupTooltipEventListeners(tooltip, config.id, config.buttons, targetElement, config.side);
      }
      
      this.activeTooltips.set(config.id, tooltip);
      
      setTimeout(() => {
        tooltip.classList.add('show');
      }, 50);
      
      if (config.timeout && !config.persistent) {
        setTimeout(() => {
          this.dismissTooltip(config.id);
        }, config.timeout);
      }
      
      return tooltip;
    } else {
      return null;
    }
  }

  positionTooltip(tooltip, targetElement, side) {
    const targetRect = targetElement.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    let left, top;
    const margin = 20;
    
    if (side === 'left') {
      left = targetRect.left - tooltipRect.width - margin;
    } else {
      left = targetRect.right + margin;
    }
    
    if (tooltip.classList.contains('add-items-tooltip--condition-guidance')) {
      top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 3);
    } else {
      top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
    }
    
    if (targetRect.left >= 0 && targetRect.right <= window.innerWidth) {
      if (side === 'left') {
        left = Math.max(-tooltipRect.width + 50, left);
      } else {
        left = Math.min(window.innerWidth - 50, left);
      }
    }
    
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    
    const arrow = tooltip.querySelector('.tooltip-arrow');
    if (arrow) {
      const targetCenterY = targetRect.top + (targetRect.height / 2);
      const tooltipY = parseFloat(tooltip.style.top);
      
      let arrowY;
      if (tooltip.classList.contains('add-items-tooltip--condition-guidance')) {
        arrowY = Math.max(15, Math.min(tooltipRect.height - 15, (targetCenterY - tooltipY) - (tooltipRect.height / 6)));
      } else {
        arrowY = Math.max(15, Math.min(tooltipRect.height - 15, targetCenterY - tooltipY));
      }
      
      arrow.style.top = `${arrowY - 8}px`;
    }
  }

  setupTooltipEventListeners(tooltip, tooltipId, buttons, targetElement, side) {
    const dismissBtn = tooltip.querySelector('.tooltip-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        this.permanentlyDisableTooltip(tooltipId, 'user_dismissed');
        this.dismissTooltip(tooltipId);
        this.dismissedTooltips.add(tooltipId);
      });
    }
    
    const actionButtons = tooltip.querySelectorAll('.tooltip-button[data-button-index]');
    actionButtons.forEach((btn) => {
      const index = parseInt(btn.getAttribute('data-button-index'));
      if (buttons[index] && buttons[index].onclick) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          buttons[index].onclick();
        });
      }
    });
    
    if (targetElement) {
      const handleScroll = () => {
        if (document.getElementById(`ai-tooltip-${tooltipId}`)) {
          this.positionTooltip(tooltip, targetElement, side);
        } else {
          window.removeEventListener('scroll', handleScroll);
        }
      };
      
      window.addEventListener('scroll', handleScroll, { passive: true });
      
      tooltip._scrollCleanup = () => {
        window.removeEventListener('scroll', handleScroll);
      };
    }
  }

  dismissTooltip(tooltipId) {
    const tooltip = document.getElementById(`ai-tooltip-${tooltipId}`);
    if (tooltip) {
      if (tooltip._scrollCleanup) {
        tooltip._scrollCleanup();
      }
      tooltip.remove();
      this.activeTooltips.delete(tooltipId);
      this.lastDismissalTime.set(tooltipId, Date.now());
    }
  }

  removeAllTooltips() {
    this.activeTooltips.forEach((_, tooltipId) => {
      this.dismissTooltip(tooltipId);
    });
    this.activeTooltips.clear();
  }

  // ==================== STYLES (no-op - CSS loaded via manifest.json) ====================

  injectStyles() {
    // CSS is now loaded via manifest.json from styles/components/add-items-tooltips.css
  }

  // ==================== TOOLTIP STATE MANAGEMENT ====================

  permanentlyDisableTooltip(tooltipId, reason = 'user_interaction') {
    this.permanentlyDisabledTooltips.add(tooltipId);
  }

  isPermanentlyDisabled(tooltipId) {
    return this.permanentlyDisabledTooltips.has(tooltipId);
  }

  updateFieldValues(formData) {
    const currentValues = {
      title: formData.title || '',
      artist: formData.artist || '',
      description: formData.description || '',
      condition: formData.condition || ''
    };
    
    const lastArtist = this.lastFieldValues.get('artist') || '';
    const currentArtist = currentValues.artist;
    
    if (lastArtist !== currentArtist) {
      if (!this.isProgrammaticUpdate) {
        if (this.permanentlyDisabledTooltips.has('artist-detection')) {
          this.permanentlyDisabledTooltips.delete('artist-detection');
        }
      }
    }
    
    Object.keys(currentValues).forEach(key => {
      this.lastFieldValues.set(key, currentValues[key]);
    });
  }

  isTooltipEligible(tooltipId, formData) {
    if (this.isPermanentlyDisabled(tooltipId)) {
      return false;
    }

    this.updateFieldValues(formData);

    const now = Date.now();
    const lastDismissed = this.lastDismissalTime?.get?.(tooltipId);
    if (lastDismissed && (now - lastDismissed) < 5000) {
      return false;
    }

    if (this.activeTooltips.has(tooltipId)) {
      return false;
    }

    return true;
  }
} 
