// modules/add-items-api-bridge.js
// Bridge between Add Items page and Edit Page API functionality

import { APIManager } from './api-manager.js';
import { AIEnhancementEngine } from './core/ai-enhancement-engine.js';
// Removed AIEnhancementUI import - Integration Manager handles all UI now

export class AddItemsAPIBridge {
  constructor() {
    // 🎯 REUSE EDIT PAGE API MANAGER - Full functionality!
    this.apiManager = new APIManager();
    
    // 🚀 NEW: AI Enhancement Engine using the proven API manager
    this.aiEnhancementEngine = new AIEnhancementEngine(this.apiManager);
    
    // UI is now handled by AddItemsIntegrationManager - no duplicate UI!
    
    console.log('✅ AddItemsAPIBridge: Initialized with edit page API manager');
  }

  /**
   * Initialize the bridge - loads settings only (UI handled by Integration Manager)
   */
  async init() {
    try {
      // Load API manager settings (API key, model, etc.)
      await this.apiManager.loadSettings();
      
      // UI initialization is now handled by AddItemsIntegrationManager
      
      console.log('✅ AddItemsAPIBridge: Initialization complete');
      return true;
    } catch (error) {
      console.error('❌ AddItemsAPIBridge: Initialization failed:', error);
      return false;
    }
  }

  /**
   * Get the API manager instance (for compatibility with existing code)
   * @returns {APIManager} The edit page API manager
   */
  getAPIManager() {
    return this.apiManager;
  }

  /**
   * Get the AI Enhancement Engine
   * @returns {AIEnhancementEngine} The AI enhancement engine
   */
  getAIEnhancementEngine() {
    return this.aiEnhancementEngine;
  }

  // getAIEnhancementUI removed - UI is now handled by AddItemsIntegrationManager

  /**
   * Extract form data in the format expected by the edit page API
   * @returns {Object} Form data compatible with edit page API
   */
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

  /**
   * Improve a single field using AI and apply the result
   * @param {string} fieldType - Field to improve
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Enhancement result
   */
  async improveField(fieldType, options = {}) {
    const formData = this.extractFormData();
    
    // Use data quality assessment from AI Enhancement Engine (skip for title corrections)
    if (fieldType !== 'title-correct') {
      const assessment = this.aiEnhancementEngine.assessDataQuality(formData, fieldType);
      
      if (assessment.needsMoreInfo && !options.force) {
        throw new Error(`More information needed for ${fieldType}. Missing: ${assessment.missingInfo.join(', ')}`);
      }
    }
    
    // Get the improvement from AI Enhancement Engine
    const result = await this.aiEnhancementEngine.improveField(formData, fieldType, options);
    
    // Apply the improvement to the field
    // Handle title-correct mapping to title field
    const responseField = fieldType === 'title-correct' ? 'title' : fieldType;
    console.log(`🔍 API Bridge: fieldType=${fieldType}, responseField=${responseField}, result=`, result);
    
    if (result && result[responseField]) {
      console.log(`✅ API Bridge: Applying improvement - fieldType=${fieldType}, value=${result[responseField]}`);
      this.applyImprovement(fieldType, result[responseField]);
    } else {
      console.log(`❌ API Bridge: No value found - result[${responseField}] =`, result[responseField]);
    }
    
    return result;
  }

  /**
   * Improve all fields using AI and apply the results
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Enhancement result for all fields
   */
  async improveAllFields(options = {}) {
    const formData = this.extractFormData();
    
    // Use data quality assessment from AI Enhancement Engine
    const assessment = this.aiEnhancementEngine.assessDataQuality(formData, 'all');
    
    if (assessment.needsMoreInfo && !options.force) {
      throw new Error(`More information needed for comprehensive enhancement. Missing: ${assessment.missingInfo.join(', ')}`);
    }
    
    // Get improvements from AI Enhancement Engine
    const result = await this.aiEnhancementEngine.improveAllFields(formData, options);
    
    // Apply improvements to all fields
    if (result) {
      if (result.title) this.applyImprovement('title', result.title);
      if (result.description) this.applyImprovement('description', result.description);
      if (result.condition) this.applyImprovement('condition', result.condition);
      if (result.keywords) this.applyImprovement('keywords', result.keywords);
    }
    
    return result;
  }

  /**
   * Apply improvement to a field (reuses edit page field mappings)
   * @param {string} fieldType - Field type
   * @param {string} value - New value
   */
  applyImprovement(fieldType, value) {
    const fieldMap = {
      'title': '#item_title_sv',
      'title-correct': '#item_title_sv',  // title-correct applies to title field
      'description': '#item_description_sv',
      'condition': '#item_condition_sv',
      'keywords': '#item_hidden_keywords'
    };
    
    console.log(`🔍 applyImprovement: fieldType=${fieldType}, value="${value}"`);
    console.log(`🔍 applyImprovement: Looking for field selector="${fieldMap[fieldType]}"`);
    
    const field = document.querySelector(fieldMap[fieldType]);
    console.log(`🔍 applyImprovement: Found field element=`, field);
    
    if (field && value) {
      console.log(`🔄 applyImprovement: Setting field value from "${field.value}" to "${value}"`);
      field.value = value;
      field.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Add visual feedback
      field.classList.add('ai-updated');
      setTimeout(() => field.classList.remove('ai-updated'), 3000);
      
      // Auto-resize textarea if needed
      if (field.tagName.toLowerCase() === 'textarea') {
        this.autoResizeTextarea(field);
      }
      
      console.log(`✅ Applied improvement to ${fieldType}`);
    } else {
      console.log(`❌ applyImprovement failed: field=${!!field}, value="${value}"`);
      if (!field) {
        console.log(`❌ Field not found with selector: ${fieldMap[fieldType]}`);
      }
    }
  }

  /**
   * Auto-resize textarea (same as edit page)
   * @param {HTMLElement} textarea - Textarea element
   */
  autoResizeTextarea(textarea) {
    if (!textarea || textarea.tagName.toLowerCase() !== 'textarea') return;
    
    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    const minHeight = 60;
    const maxHeight = 400;
    
    const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
    textarea.style.height = newHeight + 'px';
    
    textarea.classList.add('resizing');
    setTimeout(() => textarea.classList.remove('resizing'), 300);
  }

  /**
   * Get data readiness score (wrapper for AI Enhancement Engine)
   * @returns {number} Score from 0-100
   */
  getDataReadinessScore() {
    const formData = this.extractFormData();
    return this.aiEnhancementEngine.getDataReadinessScore(formData);
  }

  /**
   * Check if the API is ready (has API key)
   * @returns {boolean} True if API is ready
   */
  isAPIReady() {
    return !!this.apiManager.apiKey;
  }

  /**
   * Get current model information
   * @returns {Object} Current model configuration
   */
  getCurrentModel() {
    return this.apiManager.getCurrentModel();
  }

  /**
   * Create a simple quality analyzer for compatibility with existing tooltip manager
   * @returns {Object} Quality analyzer object
   */
  createSimpleQualityAnalyzer() {
    return {
      // Delegate to API manager for artist detection
      artistDetectionManager: {
        detectMisplacedArtist: async (title, artistField, forceReDetection = false) => {
          return await this.apiManager.analyzeForArtist(title, '', artistField, '', { forceReDetection });
        }
      },
      
      // Basic quality analysis (can be enhanced later)
      analyzeQuality: () => {
        const formData = this.extractFormData();
        return this.aiEnhancementEngine.getDataReadinessScore(formData);
      }
    };
  }

  /**
   * Analyze artist in title (wrapper for API manager functionality)
   * @param {string} title - Title to analyze
   * @param {string} artistField - Current artist field value
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Artist analysis result
   */
  async analyzeArtistInTitle(title, artistField, options = {}) {
    return await this.apiManager.analyzeForArtist(title, '', artistField, '', options);
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    if (this.aiEnhancementUI) {
      this.aiEnhancementUI.destroy?.();
    }
    console.log('🧹 AddItemsAPIBridge: Cleaned up');
  }
} 