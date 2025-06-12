/**
 * Category Classifier Service
 * 
 * Handles intelligent category detection, classification, and validation.
 * Provides multi-level category hierarchy support with confidence-based
 * classification and specialized domain classifiers.
 * 
 * @module CategoryClassifier
 */

import { ModelManager } from '../core/model-manager.js';
import { ResponseParser } from '../core/response-parser.js';
import { PromptManager } from '../core/prompt-manager.js';

/**
 * Category Classifier Service
 * 
 * Specialized service for automatic category detection, classification,
 * and validation with hierarchical category support and confidence scoring.
 */
export class CategoryClassifier {
  /**
   * Create a CategoryClassifier instance
   * @param {Object} apiManager - API manager for making Claude calls
   */
  constructor(apiManager) {
    this.apiManager = apiManager;
    this.modelManager = new ModelManager();
    this.responseParser = new ResponseParser();
    this.promptManager = new PromptManager();
    
    // Classification caches
    this.classificationCache = new Map();
    this.validationCache = new Map();
    this.suggestionCache = new Map();
    
    // Category hierarchy and mappings
    this.categoryHierarchy = {
      'Konst': {
        subcategories: ['Målningar', 'Skulpturer', 'Grafik', 'Fotografi', 'Textilkonst'],
        keywords: ['målning', 'tavla', 'konst', 'skulptur', 'grafik', 'litografi', 'etsning', 'fotografi'],
        confidence: { high: 0.9, medium: 0.7, low: 0.5 }
      },
      'Antikviteter': {
        subcategories: ['Porslin', 'Glas', 'Silver', 'Möbler', 'Textilier', 'Böcker'],
        keywords: ['antik', 'vintage', 'gammalt', 'historisk', 'porslin', 'keramik', 'glas', 'kristall'],
        confidence: { high: 0.85, medium: 0.65, low: 0.45 }
      },
      'Smycken': {
        subcategories: ['Ringar', 'Halsband', 'Armband', 'Örhängen', 'Broscher', 'Klockor'],
        keywords: ['smycke', 'ring', 'halsband', 'armband', 'örhänge', 'brosch', 'guld', 'silver', 'diamant'],
        confidence: { high: 0.95, medium: 0.75, low: 0.55 }
      },
      'Möbler': {
        subcategories: ['Stolar', 'Bord', 'Skåp', 'Sängar', 'Soffor', 'Lampor'],
        keywords: ['möbel', 'stol', 'bord', 'skåp', 'säng', 'soffa', 'lampa', 'design', 'inredning'],
        confidence: { high: 0.9, medium: 0.7, low: 0.5 }
      },
      'Samlarobjekt': {
        subcategories: ['Mynt', 'Frimärken', 'Vykort', 'Leksaker', 'Militaria', 'Sport'],
        keywords: ['samlar', 'mynt', 'frimärke', 'vykort', 'leksak', 'militär', 'sport', 'memorabilia'],
        confidence: { high: 0.8, medium: 0.6, low: 0.4 }
      },
      'Böcker': {
        subcategories: ['Skönlitteratur', 'Facklitteratur', 'Barnböcker', 'Konstböcker', 'Antikvariska'],
        keywords: ['bok', 'roman', 'dikt', 'facklitteratur', 'barnbok', 'konstbok', 'antikvarisk'],
        confidence: { high: 0.9, medium: 0.7, low: 0.5 }
      },
      'Kläder': {
        subcategories: ['Vintage', 'Designer', 'Accessoarer', 'Skor', 'Väskor'],
        keywords: ['kläder', 'klänning', 'kostym', 'jacka', 'vintage', 'designer', 'skor', 'väska'],
        confidence: { high: 0.85, medium: 0.65, low: 0.45 }
      }
    };
    
    // Domain-specific classifiers
    this.domainClassifiers = {
      art: {
        patterns: [/målning|tavla|konst|skulptur|grafik/i, /signerad|konstnär|oljemålning/i],
        categories: ['Konst'],
        confidence: 0.9
      },
      antiques: {
        patterns: [/antik|vintage|gammalt|sekel|årtal/i, /porslin|keramik|silver|kristall/i],
        categories: ['Antikviteter'],
        confidence: 0.8
      },
      jewelry: {
        patterns: [/guld|silver|diamant|ädelsten/i, /ring|halsband|armband|smycke/i],
        categories: ['Smycken'],
        confidence: 0.95
      },
      furniture: {
        patterns: [/möbel|stol|bord|skåp|design/i, /teak|ek|björk|mahogny/i],
        categories: ['Möbler'],
        confidence: 0.85
      }
    };
    
    // Statistics tracking
    this.stats = {
      classificationsPerformed: 0,
      validationsPerformed: 0,
      suggestionsGenerated: 0,
      cacheHits: 0,
      cacheMisses: 0,
      confidenceDistribution: {
        high: 0,    // > 0.8
        medium: 0,  // 0.5 - 0.8
        low: 0      // < 0.5
      },
      categoryDistribution: {}
    };
  }

  /**
   * Classify item into appropriate category
   * @param {Object} itemData - Item data to classify
   * @param {Object} options - Classification options
   * @returns {Promise<Object>} Classification result with confidence
   */
  async classifyCategory(itemData, options = {}) {
    try {
      this.stats.classificationsPerformed++;
      
      // Validate input
      const validation = this._validateItemData(itemData);
      if (!validation.isValid) {
        throw new Error(`Invalid item data: ${validation.errors.join(', ')}`);
      }
      
      // Check cache first
      const cacheKey = this._generateClassificationCacheKey(itemData, options);
      if (this.classificationCache.has(cacheKey) && !options.skipCache) {
        this.stats.cacheHits++;
        return this.classificationCache.get(cacheKey);
      }
      
      this.stats.cacheMisses++;
      
      // Try quick pattern-based classification first
      const quickClassification = this._performQuickClassification(itemData);
      if (quickClassification.confidence > 0.8 && !options.forceAI) {
        this._updateCategoryStats(quickClassification.category);
        this._updateConfidenceStats(quickClassification.confidence);
        
        // Cache high-confidence quick results
        this.classificationCache.set(cacheKey, quickClassification);
        return quickClassification;
      }
      
      // Use AI for complex classification
      const aiClassification = await this._performAIClassification(itemData, options);
      
      // Combine quick and AI results for final decision
      const finalClassification = this._combineClassificationResults(
        quickClassification, 
        aiClassification, 
        options
      );
      
      // Update statistics
      this._updateCategoryStats(finalClassification.category);
      this._updateConfidenceStats(finalClassification.confidence);
      
      // Cache successful results
      if (finalClassification.confidence > 0.5) {
        this.classificationCache.set(cacheKey, finalClassification);
      }
      
      return finalClassification;
      
    } catch (error) {
      console.error('❌ Category classification failed:', error);
      
      return {
        category: 'Övrigt',
        subcategory: null,
        confidence: 0,
        method: 'error',
        suggestions: [],
        reasoning: [],
        error: error.message,
        metadata: {
          timestamp: new Date().toISOString(),
          failed: true
        }
      };
    }
  }

  /**
   * Validate existing category assignment
   * @param {Object} itemData - Item data with current category
   * @param {string} currentCategory - Current category to validate
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation result
   */
  async validateCategory(itemData, currentCategory, options = {}) {
    try {
      this.stats.validationsPerformed++;
      
      // Check validation cache
      const cacheKey = this._generateValidationCacheKey(itemData, currentCategory, options);
      if (this.validationCache.has(cacheKey) && !options.skipCache) {
        this.stats.cacheHits++;
        return this.validationCache.get(cacheKey);
      }
      
      this.stats.cacheMisses++;
      
      // Get fresh classification
      const classification = await this.classifyCategory(itemData, { 
        ...options, 
        skipCache: true 
      });
      
      // Compare with current category
      const validation = this._compareCategories(currentCategory, classification);
      
      // Cache validation result
      if (validation.confidence > 0.6) {
        this.validationCache.set(cacheKey, validation);
      }
      
      return validation;
      
    } catch (error) {
      console.error('❌ Category validation failed:', error);
      
      return {
        isValid: false,
        confidence: 0,
        recommendation: 'keep',
        suggestedCategory: currentCategory,
        reasoning: [],
        error: error.message,
        metadata: {
          timestamp: new Date().toISOString(),
          failed: true
        }
      };
    }
  }

  /**
   * Generate category suggestions based on item data
   * @param {Object} itemData - Item data for suggestions
   * @param {Object} options - Suggestion options
   * @returns {Promise<Object>} Category suggestions with confidence
   */
  async suggestCategories(itemData, options = {}) {
    try {
      this.stats.suggestionsGenerated++;
      
      // Check suggestion cache
      const cacheKey = this._generateSuggestionCacheKey(itemData, options);
      if (this.suggestionCache.has(cacheKey) && !options.skipCache) {
        this.stats.cacheHits++;
        return this.suggestionCache.get(cacheKey);
      }
      
      this.stats.cacheMisses++;
      
      // Get multiple classification approaches
      const quickResults = this._performQuickClassification(itemData);
      const aiResults = await this._performAIClassification(itemData, { 
        ...options, 
        generateAlternatives: true 
      });
      
      // Generate comprehensive suggestions
      const suggestions = this._generateCategorySuggestions(quickResults, aiResults, options);
      
      // Cache suggestions
      if (suggestions.suggestions.length > 0) {
        this.suggestionCache.set(cacheKey, suggestions);
      }
      
      return suggestions;
      
    } catch (error) {
      console.error('❌ Category suggestions failed:', error);
      
      return {
        suggestions: [],
        confidence: 0,
        reasoning: [],
        error: error.message,
        metadata: {
          timestamp: new Date().toISOString(),
          failed: true
        }
      };
    }
  }

  /**
   * Perform quick pattern-based classification
   * @private
   */
  _performQuickClassification(itemData) {
    const text = `${itemData.title || ''} ${itemData.description || ''}`.toLowerCase();
    let bestMatch = { category: 'Övrigt', confidence: 0, method: 'pattern' };
    
    // Check domain classifiers first
    for (const [domain, classifier] of Object.entries(this.domainClassifiers)) {
      let matchScore = 0;
      let matchCount = 0;
      
      for (const pattern of classifier.patterns) {
        if (pattern.test(text)) {
          matchCount++;
          matchScore += classifier.confidence;
        }
      }
      
      if (matchCount > 0) {
        const avgConfidence = (matchScore / classifier.patterns.length) * (matchCount / classifier.patterns.length);
        if (avgConfidence > bestMatch.confidence) {
          bestMatch = {
            category: classifier.categories[0],
            confidence: avgConfidence,
            method: 'pattern',
            domain: domain,
            matches: matchCount
          };
        }
      }
    }
    
    // Check category hierarchy keywords
    for (const [category, config] of Object.entries(this.categoryHierarchy)) {
      let keywordMatches = 0;
      let totalKeywords = config.keywords.length;
      
      for (const keyword of config.keywords) {
        if (text.includes(keyword.toLowerCase())) {
          keywordMatches++;
        }
      }
      
      if (keywordMatches > 0) {
        const keywordConfidence = (keywordMatches / totalKeywords) * config.confidence.high;
        if (keywordConfidence > bestMatch.confidence) {
          bestMatch = {
            category: category,
            confidence: keywordConfidence,
            method: 'keyword',
            keywordMatches: keywordMatches,
            totalKeywords: totalKeywords
          };
        }
      }
    }
    
    // Determine subcategory if main category found
    let subcategory = null;
    if (bestMatch.category !== 'Övrigt' && this.categoryHierarchy[bestMatch.category]) {
      subcategory = this._findBestSubcategory(text, bestMatch.category);
    }
    
    return {
      category: bestMatch.category,
      subcategory: subcategory,
      confidence: bestMatch.confidence,
      method: bestMatch.method,
      reasoning: [`Pattern matching: ${bestMatch.method}`, `Confidence: ${bestMatch.confidence.toFixed(2)}`],
      suggestions: [],
      metadata: {
        timestamp: new Date().toISOString(),
        quickClassification: true,
        ...bestMatch
      }
    };
  }

  /**
   * Perform AI-based classification
   * @private
   */
  async _performAIClassification(itemData, options = {}) {
    // Get appropriate model for classification
    const model = this.modelManager.getModelConfig('category-classification');
    
    // Generate classification prompt
    const prompt = this.promptManager.getUserPrompt(itemData, 'category-classification', {
      includeHierarchy: options.includeHierarchy !== false,
      generateAlternatives: options.generateAlternatives || false,
      confidenceThreshold: options.confidenceThreshold || 0.5,
      ...options
    });
    
    // Make API call
    const response = await this.apiManager.callClaudeAPI(itemData, 'category-classification');
    
    // Parse classification response
    const parsedResult = this.responseParser.parseResponse(response, 'category-classification', {
      itemData,
      model: model.id,
      includeAlternatives: options.generateAlternatives
    }) || {};
    
    // Create AI classification result
    return {
      category: parsedResult.category || 'Övrigt',
      subcategory: parsedResult.subcategory || null,
      confidence: parsedResult.confidence || 0.5,
      method: 'ai',
      reasoning: parsedResult.reasoning || [],
      suggestions: parsedResult.alternatives || [],
      metadata: {
        timestamp: new Date().toISOString(),
        model: model.id,
        promptLength: prompt.length,
        aiClassification: true
      }
    };
  }

  /**
   * Combine classification results from different methods
   * @private
   */
  _combineClassificationResults(quickResult, aiResult, options = {}) {
    // If both agree and have high confidence, use the agreement
    if (quickResult.category === aiResult.category && 
        quickResult.confidence > 0.7 && aiResult.confidence > 0.7) {
      return {
        ...aiResult,
        confidence: Math.max(quickResult.confidence, aiResult.confidence),
        method: 'combined',
        reasoning: [...quickResult.reasoning, ...aiResult.reasoning],
        metadata: {
          ...aiResult.metadata,
          combinedClassification: true,
          quickResult: quickResult,
          agreement: true
        }
      };
    }
    
    // If AI has higher confidence, prefer AI
    if (aiResult.confidence > quickResult.confidence + 0.2) {
      return {
        ...aiResult,
        method: 'ai-preferred',
        reasoning: [...aiResult.reasoning, `AI confidence higher than pattern matching`],
        metadata: {
          ...aiResult.metadata,
          quickResult: quickResult,
          aiPreferred: true
        }
      };
    }
    
    // If quick classification has higher confidence, prefer it
    if (quickResult.confidence > aiResult.confidence + 0.2) {
      return {
        ...quickResult,
        method: 'pattern-preferred',
        reasoning: [...quickResult.reasoning, `Pattern matching confidence higher than AI`],
        suggestions: aiResult.suggestions,
        metadata: {
          ...quickResult.metadata,
          aiResult: aiResult,
          patternPreferred: true
        }
      };
    }
    
    // Default to AI result with combined reasoning
    return {
      ...aiResult,
      method: 'ai-default',
      reasoning: [...quickResult.reasoning, ...aiResult.reasoning],
      metadata: {
        ...aiResult.metadata,
        quickResult: quickResult,
        defaultToAI: true
      }
    };
  }

  /**
   * Find best subcategory within a main category
   * @private
   */
  _findBestSubcategory(text, mainCategory) {
    const categoryConfig = this.categoryHierarchy[mainCategory];
    if (!categoryConfig || !categoryConfig.subcategories) {
      return null;
    }
    
    let bestSubcategory = null;
    let bestScore = 0;
    
    for (const subcategory of categoryConfig.subcategories) {
      const subcategoryLower = subcategory.toLowerCase();
      if (text.includes(subcategoryLower)) {
        const score = subcategoryLower.length; // Longer matches are more specific
        if (score > bestScore) {
          bestScore = score;
          bestSubcategory = subcategory;
        }
      }
    }
    
    return bestSubcategory;
  }

  /**
   * Compare categories for validation
   * @private
   */
  _compareCategories(currentCategory, classification) {
    const isExactMatch = currentCategory === classification.category;
    const isHierarchyMatch = this._isHierarchyMatch(currentCategory, classification.category);
    
    let recommendation = 'keep';
    let confidence = 0.5;
    let reasoning = [];
    
    if (isExactMatch) {
      recommendation = 'keep';
      confidence = Math.max(0.8, classification.confidence);
      reasoning.push('Exact category match');
    } else if (isHierarchyMatch) {
      recommendation = 'consider';
      confidence = classification.confidence * 0.8;
      reasoning.push('Related category in hierarchy');
    } else if (classification.confidence > 0.8) {
      recommendation = 'change';
      confidence = classification.confidence;
      reasoning.push('High confidence alternative category');
    } else {
      recommendation = 'keep';
      confidence = 0.6;
      reasoning.push('Low confidence alternative, keeping current');
    }
    
    return {
      isValid: isExactMatch || (isHierarchyMatch && classification.confidence < 0.7),
      confidence: confidence,
      recommendation: recommendation,
      suggestedCategory: classification.category,
      currentCategory: currentCategory,
      reasoning: reasoning,
      classificationResult: classification,
      metadata: {
        timestamp: new Date().toISOString(),
        exactMatch: isExactMatch,
        hierarchyMatch: isHierarchyMatch
      }
    };
  }

  /**
   * Check if categories are related in hierarchy
   * @private
   */
  _isHierarchyMatch(category1, category2) {
    // Check if one is a subcategory of the other
    for (const [mainCat, config] of Object.entries(this.categoryHierarchy)) {
      if (mainCat === category1 && config.subcategories?.includes(category2)) {
        return true;
      }
      if (mainCat === category2 && config.subcategories?.includes(category1)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Generate comprehensive category suggestions
   * @private
   */
  _generateCategorySuggestions(quickResults, aiResults, options = {}) {
    const suggestions = [];
    const maxSuggestions = options.maxSuggestions || 5;
    
    // Add primary suggestions
    if (quickResults.category !== 'Övrigt') {
      suggestions.push({
        category: quickResults.category,
        subcategory: quickResults.subcategory,
        confidence: quickResults.confidence,
        method: 'pattern',
        reasoning: quickResults.reasoning
      });
    }
    
    if (aiResults.category !== 'Övrigt' && 
        aiResults.category !== quickResults.category) {
      suggestions.push({
        category: aiResults.category,
        subcategory: aiResults.subcategory,
        confidence: aiResults.confidence,
        method: 'ai',
        reasoning: aiResults.reasoning
      });
    }
    
    // Add AI alternatives
    if (aiResults.suggestions) {
      for (const suggestion of aiResults.suggestions) {
        if (suggestions.length >= maxSuggestions) break;
        
        const exists = suggestions.some(s => s.category === suggestion.category);
        if (!exists) {
          suggestions.push({
            category: suggestion.category,
            subcategory: suggestion.subcategory || null,
            confidence: suggestion.confidence || 0.5,
            method: 'ai-alternative',
            reasoning: suggestion.reasoning || []
          });
        }
      }
    }
    
    // Sort by confidence
    suggestions.sort((a, b) => b.confidence - a.confidence);
    
    return {
      suggestions: suggestions.slice(0, maxSuggestions),
      confidence: suggestions.length > 0 ? suggestions[0].confidence : 0,
      reasoning: ['Generated from pattern matching and AI analysis'],
      metadata: {
        timestamp: new Date().toISOString(),
        totalSuggestions: suggestions.length,
        quickResults: quickResults,
        aiResults: aiResults
      }
    };
  }

  /**
   * Update statistics
   * @private
   */
  _updateCategoryStats(category) {
    if (!this.stats.categoryDistribution[category]) {
      this.stats.categoryDistribution[category] = 0;
    }
    this.stats.categoryDistribution[category]++;
  }

  _updateConfidenceStats(confidence) {
    if (confidence > 0.8) {
      this.stats.confidenceDistribution.high++;
    } else if (confidence > 0.5) {
      this.stats.confidenceDistribution.medium++;
    } else {
      this.stats.confidenceDistribution.low++;
    }
  }

  /**
   * Validate item data for classification
   * @private
   */
  _validateItemData(itemData) {
    const validation = { isValid: true, errors: [] };
    
    if (!itemData || typeof itemData !== 'object') {
      validation.isValid = false;
      validation.errors.push('Item data must be an object');
      return validation;
    }
    
    if (!itemData.title && !itemData.description) {
      validation.isValid = false;
      validation.errors.push('Either title or description is required');
    }
    
    return validation;
  }

  /**
   * Generate cache keys
   * @private
   */
  _generateClassificationCacheKey(itemData, options) {
    const keyData = {
      title: itemData.title || '',
      description: itemData.description || '',
      category: itemData.category || '',
      forceAI: options.forceAI || false
    };
    
    return `classify:${JSON.stringify(keyData)}`;
  }

  _generateValidationCacheKey(itemData, currentCategory, options) {
    const keyData = {
      title: itemData.title || '',
      description: itemData.description || '',
      currentCategory: currentCategory,
      strict: options.strict || false
    };
    
    return `validate:${JSON.stringify(keyData)}`;
  }

  _generateSuggestionCacheKey(itemData, options) {
    const keyData = {
      title: itemData.title || '',
      description: itemData.description || '',
      maxSuggestions: options.maxSuggestions || 5
    };
    
    return `suggest:${JSON.stringify(keyData)}`;
  }

  /**
   * Clear caches
   * @param {string} [type] - Cache type to clear ('classification', 'validation', 'suggestion', or 'all')
   */
  clearCache(type = 'all') {
    if (type === 'all' || type === 'classification') {
      this.classificationCache.clear();
    }
    
    if (type === 'all' || type === 'validation') {
      this.validationCache.clear();
    }
    
    if (type === 'all' || type === 'suggestion') {
      this.suggestionCache.clear();
    }
    
    console.log(`🧹 Category Classifier: ${type} cache cleared`);
  }

  /**
   * Get category hierarchy
   * @returns {Object} Complete category hierarchy with subcategories
   */
  getCategoryHierarchy() {
    return this.categoryHierarchy;
  }

  /**
   * Get available categories
   * @returns {Array} List of all available main categories
   */
  getAvailableCategories() {
    return Object.keys(this.categoryHierarchy);
  }

  /**
   * Get subcategories for a main category
   * @param {string} mainCategory - Main category name
   * @returns {Array} List of subcategories or empty array
   */
  getSubcategories(mainCategory) {
    const categoryConfig = this.categoryHierarchy[mainCategory];
    return categoryConfig ? categoryConfig.subcategories || [] : [];
  }

  /**
   * Get service statistics
   * @returns {Object} Service statistics and performance data
   */
  getStats() {
    const totalRequests = this.stats.classificationsPerformed + 
                         this.stats.validationsPerformed + 
                         this.stats.suggestionsGenerated;
    const hitRate = totalRequests > 0 
      ? ((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100).toFixed(1)
      : 0;
    
    return {
      ...this.stats,
      totalRequests,
      cacheHitRate: `${hitRate}%`,
      cacheSize: {
        classification: this.classificationCache.size,
        validation: this.validationCache.size,
        suggestion: this.suggestionCache.size
      }
    };
  }

  /**
   * Get service status and capabilities
   * @returns {Object} Service status information
   */
  getStatus() {
    return {
      service: 'CategoryClassifier',
      version: '1.0.0',
      capabilities: {
        categoryClassification: true,
        categoryValidation: true,
        categorySuggestions: true,
        hierarchicalCategories: true,
        patternMatching: true,
        aiClassification: true,
        confidenceScoring: true,
        multiLevelCaching: true
      },
      dependencies: {
        modelManager: this.modelManager.getModelConfig ? { ready: true } : { ready: false },
        responseParser: this.responseParser.parseResponse ? { ready: true } : { ready: false },
        promptManager: this.promptManager.getUserPrompt ? { ready: true } : { ready: false }
      },
      categoryHierarchy: {
        mainCategories: Object.keys(this.categoryHierarchy).length,
        totalSubcategories: Object.values(this.categoryHierarchy)
          .reduce((sum, cat) => sum + (cat.subcategories?.length || 0), 0)
      },
      statistics: this.getStats(),
      ready: true
    };
  }
} 