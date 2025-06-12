/**
 * Field Enhancement Service
 * 
 * Orchestrates field enhancement workflows using the AI infrastructure.
 * Provides high-level field enhancement operations while maintaining
 * separation of concerns and reusability.
 * 
 * @module FieldEnhancer
 */

import { ModelManager } from '../core/model-manager.js';
import { ResponseParser } from '../core/response-parser.js';
import { PromptManager } from '../core/prompt-manager.js';

/**
 * Field Enhancement Service
 * 
 * High-level service for enhancing auction item fields using AI.
 * Coordinates between model selection, prompt generation, and response parsing.
 */
export class FieldEnhancer {
  /**
   * Create a FieldEnhancer instance
   * @param {Object} apiManager - API manager for making Claude calls
   */
  constructor(apiManager) {
    this.apiManager = apiManager;
    this.modelManager = new ModelManager();
    this.responseParser = new ResponseParser();
    this.promptManager = new PromptManager();
    
    // Enhancement cache for performance
    this.enhancementCache = new Map();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      totalRequests: 0
    };
  }

  /**
   * Enhance a single field
   * @param {Object} itemData - Item data object
   * @param {string} fieldType - Type of field to enhance ('title', 'description', etc.)
   * @param {Object} options - Enhancement options
   * @returns {Promise<Object>} Enhanced field result
   */
  async enhanceField(itemData, fieldType, options = {}) {
    try {
      this.cacheStats.totalRequests++;
      
      // Check cache first
      const cacheKey = this._generateCacheKey(itemData, fieldType, options);
      if (this.enhancementCache.has(cacheKey) && !options.skipCache) {
        this.cacheStats.hits++;
        return this.enhancementCache.get(cacheKey);
      }
      
      this.cacheStats.misses++;
      
      // Validate input
      const validation = this._validateEnhancementRequest(itemData, fieldType);
      if (!validation.isValid) {
        throw new Error(`Invalid enhancement request: ${validation.error}`);
      }
      
      // Get optimal model for this field
      const model = this.modelManager.getModelConfig(fieldType);
      
      // Generate appropriate prompt
      const prompt = this.promptManager.getUserPrompt(itemData, fieldType, {
        enableArtistInfo: options.enableArtistInfo !== false,
        ...options
      });
      
      // Make API call through existing API manager
      const response = await this.apiManager.callClaudeAPI(itemData, fieldType);
      
      // Parse response using our unified parser
      const parsedResult = this.responseParser.parseResponse(response, fieldType, {
        itemData,
        model: model.id
      });
      
      // Create enhancement result
      const enhancementResult = {
        fieldType,
        originalValue: itemData[fieldType] || '',
        enhancedValue: parsedResult[fieldType] || parsedResult.title || parsedResult,
        model: model.id,
        confidence: parsedResult.confidence || 0.8,
        metadata: {
          timestamp: new Date().toISOString(),
          cacheKey,
          promptLength: prompt.length,
          modelUsed: model.id
        }
      };
      
      // Cache successful results
      if (enhancementResult.enhancedValue && !options.skipCache) {
        this.enhancementCache.set(cacheKey, enhancementResult);
      }
      
      return enhancementResult;
      
    } catch (error) {
      console.error(`❌ Field enhancement failed for ${fieldType}:`, error);
      
      return {
        fieldType,
        originalValue: itemData[fieldType] || '',
        enhancedValue: null,
        error: error.message,
        model: null,
        confidence: 0,
        metadata: {
          timestamp: new Date().toISOString(),
          failed: true
        }
      };
    }
  }

  /**
   * Enhance multiple fields in a coordinated workflow
   * @param {Object} itemData - Item data object
   * @param {string[]} fieldTypes - Array of field types to enhance
   * @param {Object} options - Enhancement options
   * @returns {Promise<Object>} Results for all fields
   */
  async enhanceMultipleFields(itemData, fieldTypes, options = {}) {
    try {
      const results = {};
      const errors = [];
      
      // Validate all field types first
      for (const fieldType of fieldTypes) {
        const validation = this._validateEnhancementRequest(itemData, fieldType);
        if (!validation.isValid) {
          errors.push(`${fieldType}: ${validation.error}`);
        }
      }
      
      if (errors.length > 0) {
        throw new Error(`Validation errors: ${errors.join(', ')}`);
      }
      
      // For multi-field enhancement, use coordinated approach
      if (fieldTypes.length > 1 && !options.sequential) {
        return await this._enhanceFieldsCoordinated(itemData, fieldTypes, options);
      }
      
      // Sequential enhancement for individual fields
      for (const fieldType of fieldTypes) {
        try {
          results[fieldType] = await this.enhanceField(itemData, fieldType, options);
        } catch (error) {
          console.error(`❌ Failed to enhance ${fieldType}:`, error);
          results[fieldType] = {
            fieldType,
            originalValue: itemData[fieldType] || '',
            enhancedValue: null,
            error: error.message,
            confidence: 0
          };
        }
      }
      
      return {
        success: true,
        results,
        metadata: {
          timestamp: new Date().toISOString(),
          fieldsProcessed: fieldTypes.length,
          cacheStats: this.getCacheStats()
        }
      };
      
    } catch (error) {
      console.error('❌ Multi-field enhancement failed:', error);
      
      return {
        success: false,
        error: error.message,
        results: {},
        metadata: {
          timestamp: new Date().toISOString(),
          failed: true
        }
      };
    }
  }

  /**
   * Enhance all standard fields using coordinated multi-field approach
   * @param {Object} itemData - Item data object
   * @param {Object} options - Enhancement options
   * @returns {Promise<Object>} Complete enhancement results
   */
  async enhanceAllFields(itemData, options = {}) {
    const standardFields = ['title', 'description', 'condition', 'keywords'];
    
    // Use the multi-field API call for better coordination
    return await this.enhanceMultipleFields(itemData, standardFields, {
      coordinated: true,
      ...options
    });
  }

  /**
   * Coordinated multi-field enhancement using single API call
   * @private
   */
  async _enhanceFieldsCoordinated(itemData, fieldTypes, options = {}) {
    try {
      // Determine the best approach based on field types
      let enhancementType;
      if (fieldTypes.length === 4 && fieldTypes.includes('title') && fieldTypes.includes('description')) {
        enhancementType = 'all';
      } else if (fieldTypes.length >= 3) {
        enhancementType = 'all-sparse';
      } else {
        // Fall back to sequential for small sets
        return await this._enhanceFieldsSequential(itemData, fieldTypes, options);
      }
      
      // Get optimal model for coordinated enhancement
      const model = this.modelManager.getModelConfig(enhancementType);
      
      // Generate coordinated prompt
      const prompt = this.promptManager.getUserPrompt(itemData, enhancementType, {
        enableArtistInfo: options.enableArtistInfo !== false,
        fields: fieldTypes,
        ...options
      });
      
      // Make coordinated API call
      const response = await this.apiManager.callClaudeAPI(itemData, enhancementType);
      
      // Parse multi-field response
      const parsedResult = this.responseParser.parseResponse(response, enhancementType, {
        itemData,
        model: model.id,
        expectedFields: fieldTypes
      });
      
      // Convert to individual field results
      const results = {};
      for (const fieldType of fieldTypes) {
        results[fieldType] = {
          fieldType,
          originalValue: itemData[fieldType] || '',
          enhancedValue: parsedResult[fieldType] || '',
          model: model.id,
          confidence: parsedResult.confidence || 0.8,
          metadata: {
            timestamp: new Date().toISOString(),
            coordinatedEnhancement: true,
            promptLength: prompt.length
          }
        };
      }
      
      return {
        success: true,
        results,
        metadata: {
          timestamp: new Date().toISOString(),
          enhancementType: 'coordinated',
          fieldsProcessed: fieldTypes.length,
          model: model.id
        }
      };
      
    } catch (error) {
      console.error('❌ Coordinated enhancement failed:', error);
      
      // Fall back to sequential enhancement
      console.log('🔄 Falling back to sequential enhancement...');
      return await this._enhanceFieldsSequential(itemData, fieldTypes, options);
    }
  }

  /**
   * Sequential field enhancement as fallback
   * @private
   */
  async _enhanceFieldsSequential(itemData, fieldTypes, options = {}) {
    const results = {};
    
    for (const fieldType of fieldTypes) {
      try {
        results[fieldType] = await this.enhanceField(itemData, fieldType, options);
      } catch (error) {
        console.error(`❌ Sequential enhancement failed for ${fieldType}:`, error);
        results[fieldType] = {
          fieldType,
          originalValue: itemData[fieldType] || '',
          enhancedValue: null,
          error: error.message,
          confidence: 0
        };
      }
    }
    
    return {
      success: true,
      results,
      metadata: {
        timestamp: new Date().toISOString(),
        enhancementType: 'sequential',
        fieldsProcessed: fieldTypes.length
      }
    };
  }

  /**
   * Validate enhancement request
   * @private
   */
  _validateEnhancementRequest(itemData, fieldType) {
    if (!itemData || typeof itemData !== 'object') {
      return { isValid: false, error: 'Invalid item data' };
    }
    
    if (!fieldType || typeof fieldType !== 'string') {
      return { isValid: false, error: 'Invalid field type' };
    }
    
    const validFieldTypes = [
      'title', 'title-correct', 'description', 'condition', 'keywords',
      'all', 'all-enhanced', 'all-sparse'
    ];
    
    if (!validFieldTypes.includes(fieldType)) {
      return { isValid: false, error: `Unsupported field type: ${fieldType}` };
    }
    
    return { isValid: true };
  }

  /**
   * Generate cache key for enhancement request
   * @private
   */
  _generateCacheKey(itemData, fieldType, options = {}) {
    const keyData = {
      fieldType,
      title: (itemData && itemData.title) || '',
      description: (itemData && itemData.description) || '',
      category: (itemData && itemData.category) || '',
      artist: (itemData && itemData.artist) || '',
      // Include relevant options that affect output
      model: options.model,
      conservative: options.conservative
    };
    
    return JSON.stringify(keyData);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache performance stats
   */
  getCacheStats() {
    const hitRate = this.cacheStats.totalRequests > 0 
      ? (this.cacheStats.hits / this.cacheStats.totalRequests * 100).toFixed(1)
      : 0;
      
    return {
      ...this.cacheStats,
      hitRate: `${hitRate}%`,
      cacheSize: this.enhancementCache.size
    };
  }

  /**
   * Clear enhancement cache
   * @param {string} [pattern] - Optional pattern to match cache keys
   */
  clearCache(pattern = null) {
    if (!pattern) {
      this.enhancementCache.clear();
      this.cacheStats = { hits: 0, misses: 0, totalRequests: 0 };
      return;
    }
    
    // Clear entries matching pattern
    for (const [key] of this.enhancementCache) {
      if (key.includes(pattern)) {
        this.enhancementCache.delete(key);
      }
    }
  }

  /**
   * Get enhancement capabilities and status
   * @returns {Object} Service status and capabilities
   */
  getStatus() {
    return {
      service: 'FieldEnhancer',
      version: '1.0.0',
      capabilities: {
        singleField: true,
        multiField: true,
        coordinatedEnhancement: true,
        caching: true,
        fallbackHandling: true
      },
      dependencies: {
        modelManager: this.modelManager.getStatus ? this.modelManager.getStatus() : { ready: true },
        responseParser: this.responseParser.getStatus ? this.responseParser.getStatus() : { ready: true },
        promptManager: this.promptManager.getStatus ? this.promptManager.getStatus() : { ready: true }
      },
      cache: this.getCacheStats(),
      ready: true
    };
  }
} 