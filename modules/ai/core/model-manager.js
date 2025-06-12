// modules/ai/core/model-manager.js
// AI Model Selection and Management

import { getModelForField, isValidModel, getAllModels, DEFAULT_MODEL } from '../config/models.js';

export class ModelManager {
  constructor() {
    this.currentUserModel = DEFAULT_MODEL;
    this.modelCache = new Map(); // Cache model configurations
  }

  /**
   * Set the user's preferred model
   * @param {string} modelKey - User's selected model
   */
  setUserModel(modelKey) {
    if (isValidModel(modelKey)) {
      this.currentUserModel = modelKey;
      this.modelCache.clear(); // Clear cache when user model changes
      console.log(`🤖 Model Manager: User model set to ${modelKey}`);
    } else {
      console.warn(`⚠️ Model Manager: Invalid model ${modelKey}, keeping ${this.currentUserModel}`);
    }
  }

  /**
   * Get the user's current model preference
   * @returns {string} Current user model key
   */
  getUserModel() {
    return this.currentUserModel;
  }

  /**
   * Get model configuration for a specific field type
   * @param {string} fieldType - Field type (title-correct, artist-detection, etc.)
   * @returns {Object} Model configuration with id, maxTokens, temperature
   */
  getModelConfig(fieldType) {
    // Check cache first
    const cacheKey = `${fieldType}-${this.currentUserModel}`;
    if (this.modelCache.has(cacheKey)) {
      return this.modelCache.get(cacheKey);
    }

    // Get fresh configuration
    const config = getModelForField(fieldType, this.currentUserModel);
    
    // Add to cache
    this.modelCache.set(cacheKey, config);
    
    console.log(`🎯 Model Manager: ${fieldType} → ${config.id} (${config.source})`);
    return config;
  }

  /**
   * Get API parameters for a specific field type
   * @param {string} fieldType - Field type
   * @returns {Object} API parameters (model, max_tokens, temperature)
   */
  getAPIParameters(fieldType) {
    const config = this.getModelConfig(fieldType);
    
    return {
      model: config.id,
      max_tokens: config.maxTokens,
      temperature: config.temperature
    };
  }

  /**
   * Check if a field type should use a specific model (not user preference)
   * @param {string} fieldType - Field type to check
   * @returns {boolean} True if field has specific model requirements
   */
  hasSpecificModelRequirement(fieldType) {
    const config = this.getModelConfig(fieldType);
    return config.source === 'field-specific';
  }

  /**
   * Get all available models for user selection
   * @returns {Object} Available models
   */
  getAvailableModels() {
    return getAllModels();
  }

  /**
   * Get model selection reasoning for a field type
   * @param {string} fieldType - Field type
   * @returns {string} Human-readable reason for model selection
   */
  getModelReason(fieldType) {
    const config = this.getModelConfig(fieldType);
    return config.reason || 'Default model selection';
  }

  /**
   * Validate model configuration
   * @returns {Object} Validation results
   */
  validateConfiguration() {
    const results = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Check if user model is valid
    if (!isValidModel(this.currentUserModel)) {
      results.isValid = false;
      results.errors.push(`Invalid user model: ${this.currentUserModel}`);
    }

    // Check if all models in configuration are accessible
    const allModels = getAllModels();
    for (const [key, model] of Object.entries(allModels)) {
      if (!model.id || !model.name) {
        results.warnings.push(`Model ${key} missing required properties`);
      }
    }

    return results;
  }

  /**
   * Clear model cache (useful for testing or configuration changes)
   */
  clearCache() {
    this.modelCache.clear();
    console.log('🧹 Model Manager: Cache cleared');
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      size: this.modelCache.size,
      keys: Array.from(this.modelCache.keys())
    };
  }
} 