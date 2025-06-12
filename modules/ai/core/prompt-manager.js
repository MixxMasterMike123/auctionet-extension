// modules/ai/core/prompt-manager.js
// Centralized Prompt Management and Generation

import { getCompleteSystemPrompt } from '../prompts/base-prompts.js';
import { getFieldPrompt } from '../prompts/field-prompts.js';
import { isSpecializedCategory } from '../prompts/category-prompts.js';

export class PromptManager {
  constructor() {
    this.promptCache = new Map(); // Cache generated prompts
    this.systemPrompt = null; // Cached system prompt
  }

  /**
   * Get the complete system prompt (cached)
   */
  getSystemPrompt() {
    if (!this.systemPrompt) {
      this.systemPrompt = getCompleteSystemPrompt();
      console.log('🎯 Prompt Manager: System prompt generated and cached');
    }
    return this.systemPrompt;
  }

  /**
   * Generate user prompt for specific field type
   * @param {Object} itemData - Item data for context
   * @param {string} fieldType - Type of field being processed
   * @param {Object} options - Additional options
   * @returns {string} Generated user prompt
   */
  getUserPrompt(itemData, fieldType, options = {}) {
    const { enableArtistInfo = true, useCache = true } = options;
    
    // Create cache key
    const cacheKey = this.createCacheKey(itemData, fieldType, enableArtistInfo);
    
    // Check cache first
    if (useCache && this.promptCache.has(cacheKey)) {
      console.log(`🎯 Prompt Manager: Using cached prompt for ${fieldType}`);
      return this.promptCache.get(cacheKey);
    }

    // Validate inputs
    if (!itemData || typeof itemData !== 'object') {
      throw new Error('Invalid itemData provided to PromptManager');
    }

    if (!fieldType || typeof fieldType !== 'string') {
      throw new Error('Invalid fieldType provided to PromptManager');
    }

    // Generate the prompt
    const prompt = getFieldPrompt(itemData, fieldType, enableArtistInfo);
    
    // Cache the result
    if (useCache) {
      this.promptCache.set(cacheKey, prompt);
    }

    // Log prompt generation
    const isSpecialized = isSpecializedCategory(itemData);
    console.log(`🎯 Prompt Manager: Generated ${fieldType} prompt (${prompt.length} chars)${isSpecialized ? ' [SPECIALIZED]' : ''}`);

    return prompt;
  }

  /**
   * Generate both system and user prompts
   * @param {Object} itemData - Item data for context
   * @param {string} fieldType - Type of field being processed
   * @param {Object} options - Additional options
   * @returns {Object} Object with system and user prompts
   */
  getPrompts(itemData, fieldType, options = {}) {
    return {
      system: this.getSystemPrompt(),
      user: this.getUserPrompt(itemData, fieldType, options)
    };
  }

  /**
   * Validate item data structure
   * @param {Object} itemData - Item data to validate
   * @returns {Object} Validation result
   */
  validateItemData(itemData) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (!itemData || typeof itemData !== 'object') {
      validation.isValid = false;
      validation.errors.push('itemData must be an object');
      return validation;
    }

    // Check required fields
    const requiredFields = ['category', 'title', 'description', 'condition'];
    requiredFields.forEach(field => {
      if (!itemData[field] || typeof itemData[field] !== 'string') {
        validation.errors.push(`Missing or invalid ${field} field`);
        validation.isValid = false;
      }
    });

    // Check optional fields
    if (itemData.artist !== undefined && typeof itemData.artist !== 'string') {
      validation.warnings.push('artist field should be string');
    }

    if (itemData.estimate !== undefined && typeof itemData.estimate !== 'string') {
      validation.warnings.push('estimate field should be string');
    }

    // Check for empty critical fields
    if (itemData.title && typeof itemData.title === 'string' && itemData.title.trim().length < 5) {
      validation.warnings.push('title field is very short');
    }

    if (itemData.description && typeof itemData.description === 'string' && itemData.description.trim().length < 10) {
      validation.warnings.push('description field is very short');
    }

    return validation;
  }

  /**
   * Get prompt statistics and insights
   * @param {Object} itemData - Item data for analysis
   * @returns {Object} Prompt statistics
   */
  getPromptStats(itemData) {
    const stats = {
      isSpecialized: isSpecializedCategory(itemData),
      hasArtist: !!(itemData.artist && itemData.artist.trim().length > 0),
      categoryType: this.detectCategoryType(itemData),
      estimatedComplexity: this.estimatePromptComplexity(itemData),
      recommendedModel: this.recommendModel(itemData)
    };

    return stats;
  }

  /**
   * Detect category type for specialized handling
   */
  detectCategoryType(itemData) {
    const category = itemData.category?.toLowerCase() || '';
    const title = itemData.title?.toLowerCase() || '';
    const description = itemData.description?.toLowerCase() || '';

    if (this.containsKeywords(['vapen', 'svärd', 'kniv', 'bajonett', 'militaria'], [category, title, description])) {
      return 'weapon';
    }
    if (this.containsKeywords(['armbandsur', 'klocka'], [category, title, description])) {
      return 'watch';
    }
    if (this.containsKeywords(['smycken', 'guld', 'silver', 'diamant', 'ring'], [category, title, description])) {
      return 'jewelry';
    }
    if (this.containsKeywords(['antikviteter', 'historiska', 'antik', 'arkeologi'], [category, title, description])) {
      return 'historical';
    }
    
    return 'general';
  }

  /**
   * Estimate prompt complexity based on item characteristics
   */
  estimatePromptComplexity(itemData) {
    let complexity = 1; // Base complexity

    // Specialized categories add complexity
    if (isSpecializedCategory(itemData)) {
      complexity += 2;
    }

    // Artist information adds complexity
    if (itemData.artist && itemData.artist.trim().length > 0) {
      complexity += 1;
    }

    // Long descriptions add complexity
    if (itemData.description && itemData.description.length > 200) {
      complexity += 1;
    }

    // High-value items add complexity
    if (itemData.estimate) {
      const estimateMatch = itemData.estimate.match(/(\d+)/);
      if (estimateMatch && parseInt(estimateMatch[1]) > 50000) {
        complexity += 1;
      }
    }

    return Math.min(complexity, 5); // Cap at 5
  }

  /**
   * Recommend AI model based on item characteristics
   */
  recommendModel(itemData, fieldType = 'all') {
    // For title-correct, always use Haiku (fast and literal)
    if (fieldType === 'title-correct') {
      return 'claude-3-haiku-20240307';
    }

    // For specialized categories, use Sonnet for better accuracy
    if (isSpecializedCategory(itemData)) {
      return 'claude-3-5-sonnet-20241022';
    }

    // For high-value items, use Sonnet
    if (itemData.estimate) {
      const estimateMatch = itemData.estimate.match(/(\d+)/);
      if (estimateMatch && parseInt(estimateMatch[1]) > 50000) {
        return 'claude-3-5-sonnet-20241022';
      }
    }

    // For simple tasks, Haiku is sufficient
    if (fieldType === 'keywords' || fieldType === 'condition') {
      return 'claude-3-haiku-20240307';
    }

    // Default to user's selected model (will be handled by caller)
    return 'user-selected';
  }

  /**
   * Helper method to check if any keywords exist in text fields
   */
  containsKeywords(keywords, textFields) {
    return keywords.some(keyword => 
      textFields.some(text => text && text.includes(keyword))
    );
  }

  /**
   * Create cache key for prompt caching
   */
  createCacheKey(itemData, fieldType, enableArtistInfo) {
    // Create a hash-like key from relevant data
    const keyData = {
      category: itemData.category,
      title: itemData.title?.substring(0, 50), // First 50 chars
      hasArtist: !!(itemData.artist && itemData.artist.trim().length > 0),
      fieldType,
      enableArtistInfo
    };
    
    return JSON.stringify(keyData);
  }

  /**
   * Clear the prompt cache
   */
  clearCache() {
    this.promptCache.clear();
    this.systemPrompt = null;
    console.log('🧹 Prompt Manager: Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      promptCacheSize: this.promptCache.size,
      systemPromptCached: !!this.systemPrompt,
      totalMemoryUsage: this.estimateMemoryUsage()
    };
  }

  /**
   * Estimate memory usage of cached prompts
   */
  estimateMemoryUsage() {
    let totalChars = 0;
    
    if (this.systemPrompt) {
      totalChars += this.systemPrompt.length;
    }
    
    for (const prompt of this.promptCache.values()) {
      totalChars += prompt.length;
    }
    
    return {
      characters: totalChars,
      estimatedBytes: totalChars * 2, // Rough estimate for UTF-16
      estimatedKB: Math.round((totalChars * 2) / 1024)
    };
  }

  /**
   * Generate debug information for prompt generation
   */
  getDebugInfo(itemData, fieldType, options = {}) {
    const validation = this.validateItemData(itemData);
    const stats = this.getPromptStats(itemData);
    const cacheStats = this.getCacheStats();
    
    return {
      validation,
      stats,
      cacheStats,
      recommendedModel: this.recommendModel(itemData, fieldType),
      promptComplexity: this.estimatePromptComplexity(itemData),
      timestamp: new Date().toISOString()
    };
  }
} 