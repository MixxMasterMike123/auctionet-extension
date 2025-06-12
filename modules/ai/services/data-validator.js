/**
 * Data Validator Service
 * 
 * Comprehensive data validation, consistency checks, and completeness analysis.
 * Acts as the quality gatekeeper ensuring high-quality data throughout the AI pipeline.
 * 
 * @module DataValidator
 */

import { ModelManager } from '../core/model-manager.js';
import { ResponseParser } from '../core/response-parser.js';
import { PromptManager } from '../core/prompt-manager.js';

/**
 * Data Validator Service
 * 
 * Quality gatekeeper service for comprehensive data validation,
 * consistency checks, and completeness analysis.
 */
export class DataValidator {
  /**
   * Create a DataValidator instance
   * @param {Object} apiManager - API manager for making Claude calls
   */
  constructor(apiManager) {
    this.apiManager = apiManager;
    this.modelManager = new ModelManager();
    this.responseParser = new ResponseParser();
    this.promptManager = new PromptManager();
    
    // Validation caches
    this.validationRulesCache = new Map();
    this.businessLogicCache = new Map();
    this.patternCache = new Map();
    this.resultsCache = new Map();
    
    // Validation rules and patterns
    this.validationRules = {
      required: {
        basic: ['title'],
        standard: ['title', 'description'],
        comprehensive: ['title', 'description', 'category'],
        auctionReady: ['title', 'description', 'category', 'condition', 'startingPrice']
      },
      formats: {
        email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        phone: /^(\+46|0)[1-9]\d{8,9}$/,
        postalCode: /^\d{3}\s?\d{2}$/,
        price: /^\d+(\.\d{1,2})?$/,
        year: /^(1[0-9]{3}|20[0-9]{2})$/,
        dimensions: /^\d+(\.\d+)?\s?(cm|mm|m)$/
      },
      lengths: {
        title: { min: 10, max: 100 },
        description: { min: 50, max: 2000 },
        artist: { min: 2, max: 50 },
        category: { min: 3, max: 30 }
      },
      ranges: {
        price: { min: 1, max: 10000000 },
        year: { min: 1800, max: new Date().getFullYear() },
        weight: { min: 0.1, max: 10000 },
        dimensions: { min: 0.1, max: 1000 }
      }
    };
    
    // Swedish-specific validation
    this.swedishValidation = {
      cities: ['Stockholm', 'Göteborg', 'Malmö', 'Uppsala', 'Västerås', 'Örebro', 'Linköping'],
      regions: ['Stockholms län', 'Västra Götalands län', 'Skåne län', 'Uppsala län'],
      currencies: ['SEK', 'kr', 'kronor'],
      commonWords: ['och', 'eller', 'med', 'för', 'till', 'av', 'på', 'i', 'från'],
      profanity: ['spam', 'fake', 'scam'] // Basic filter
    };
    
    // Business logic rules
    this.businessRules = {
      priceRanges: {
        'Konst': { min: 100, max: 1000000 },
        'Smycken': { min: 50, max: 500000 },
        'Möbler': { min: 200, max: 100000 },
        'Böcker': { min: 10, max: 5000 },
        'Antikviteter': { min: 50, max: 200000 }
      },
      conditionPriceMultipliers: {
        'Nytt': 1.0,
        'Mycket bra': 0.8,
        'Bra': 0.6,
        'Begagnat': 0.4,
        'Dåligt': 0.2
      },
      categoryKeywords: {
        'Konst': ['målning', 'tavla', 'skulptur', 'grafik', 'konst'],
        'Smycken': ['ring', 'halsband', 'armband', 'örhängen', 'smycke'],
        'Möbler': ['stol', 'bord', 'skåp', 'soffa', 'möbel'],
        'Böcker': ['bok', 'roman', 'dikt', 'litteratur']
      }
    };
    
    // Validation levels
    this.validationLevels = {
      basic: {
        checkRequired: true,
        checkFormats: true,
        checkLengths: false,
        checkConsistency: false,
        checkBusinessRules: false,
        aiValidation: false
      },
      standard: {
        checkRequired: true,
        checkFormats: true,
        checkLengths: true,
        checkConsistency: true,
        checkBusinessRules: false,
        aiValidation: false
      },
      comprehensive: {
        checkRequired: true,
        checkFormats: true,
        checkLengths: true,
        checkConsistency: true,
        checkBusinessRules: true,
        aiValidation: true
      },
      auctionReady: {
        checkRequired: true,
        checkFormats: true,
        checkLengths: true,
        checkConsistency: true,
        checkBusinessRules: true,
        aiValidation: true,
        checkCompleteness: true
      }
    };
    
    // Statistics tracking
    this.stats = {
      validationsPerformed: 0,
      validationsPassed: 0,
      validationsFailed: 0,
      batchValidations: 0,
      aiValidations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      validationLevelUsage: {
        basic: 0,
        standard: 0,
        comprehensive: 0,
        auctionReady: 0
      },
      commonErrors: {
        missingRequired: 0,
        formatErrors: 0,
        lengthErrors: 0,
        consistencyErrors: 0,
        businessRuleErrors: 0
      },
      performanceMetrics: {
        avgValidationTime: 0,
        avgQualityScore: 0,
        avgCompletenessScore: 0
      }
    };
  }

  /**
   * Validate item data with specified validation level
   * @param {Object} itemData - Item data to validate
   * @param {string} level - Validation level ('basic', 'standard', 'comprehensive', 'auctionReady')
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation results
   */
  async validateItem(itemData, level = 'standard', options = {}) {
    try {
      this.stats.validationsPerformed++;
      this.stats.validationLevelUsage[level]++;
      
      const startTime = Date.now();
      
      // Get validation configuration
      const config = this.validationLevels[level] || this.validationLevels.standard;
      
      // Check cache first
      const cacheKey = this._generateValidationCacheKey(itemData, level, options);
      if (this.resultsCache.has(cacheKey) && !options.skipCache) {
        this.stats.cacheHits++;
        return this.resultsCache.get(cacheKey);
      }
      
      this.stats.cacheMisses++;
      
      // Initialize validation result
      const validationResult = {
        isValid: true,
        level: level,
        errors: [],
        warnings: [],
        suggestions: [],
        qualityScore: 0,
        completenessScore: 0,
        details: {},
        metadata: {
          timestamp: new Date().toISOString(),
          validationTime: 0,
          cacheKey
        }
      };
      
      // Perform validation checks based on level
      if (config.checkRequired) {
        const requiredCheck = this._validateRequiredFields(itemData, level);
        this._mergeValidationResults(validationResult, requiredCheck);
      }
      
      if (config.checkFormats) {
        const formatCheck = this._validateFormats(itemData);
        this._mergeValidationResults(validationResult, formatCheck);
      }
      
      if (config.checkLengths) {
        const lengthCheck = this._validateLengths(itemData);
        this._mergeValidationResults(validationResult, lengthCheck);
      }
      
      if (config.checkConsistency) {
        const consistencyCheck = await this._validateConsistency(itemData);
        this._mergeValidationResults(validationResult, consistencyCheck);
      }
      
      if (config.checkBusinessRules) {
        const businessCheck = this._validateBusinessRules(itemData);
        this._mergeValidationResults(validationResult, businessCheck);
      }
      
      if (config.aiValidation) {
        const aiCheck = await this._performAIValidation(itemData, options);
        this._mergeValidationResults(validationResult, aiCheck);
      }
      
      if (config.checkCompleteness) {
        const completenessCheck = this.analyzeCompleteness(itemData);
        this._mergeValidationResults(validationResult, completenessCheck);
      }
      
      // Calculate overall scores
      validationResult.qualityScore = this._calculateQualityScore(validationResult);
      validationResult.completenessScore = this._calculateCompletenessScore(itemData);
      
      // Determine final validation status
      validationResult.isValid = validationResult.errors.length === 0;
      
      // Calculate validation time
      validationResult.metadata.validationTime = Date.now() - startTime;
      
      // Update statistics
      this._updateValidationStats(validationResult);
      
      // Cache successful results
      if (validationResult.qualityScore > 50) {
        this.resultsCache.set(cacheKey, validationResult);
      }
      
      return validationResult;
      
    } catch (error) {
      console.error('❌ Item validation failed:', error);
      
      return {
        isValid: false,
        level: level,
        errors: [{ type: 'system', message: error.message }],
        warnings: [],
        suggestions: [],
        qualityScore: 0,
        completenessScore: 0,
        details: {},
        metadata: {
          timestamp: new Date().toISOString(),
          failed: true,
          error: error.message
        }
      };
    }
  }

  /**
   * Validate specific field
   * @param {string} fieldName - Name of the field to validate
   * @param {*} fieldValue - Value to validate
   * @param {Object} context - Validation context
   * @returns {Object} Field validation result
   */
  validateField(fieldName, fieldValue, context = {}) {
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: []
    };
    
    // Check if field is required
    if (this._isFieldRequired(fieldName, context.level)) {
      if (!fieldValue || (typeof fieldValue === 'string' && fieldValue.trim() === '')) {
        result.isValid = false;
        result.errors.push({
          type: 'required',
          field: fieldName,
          message: `${fieldName} är obligatoriskt`
        });
        return result;
      }
    }
    
    // Skip further validation if field is empty and not required
    if (!fieldValue) return result;
    
    // Format validation
    const formatResult = this._validateFieldFormat(fieldName, fieldValue);
    if (!formatResult.isValid) {
      result.isValid = false;
      result.errors.push(...formatResult.errors);
    }
    
    // Length validation
    const lengthResult = this._validateFieldLength(fieldName, fieldValue);
    if (!lengthResult.isValid) {
      result.isValid = false;
      result.errors.push(...lengthResult.errors);
    } else if (lengthResult.warnings) {
      result.warnings.push(...lengthResult.warnings);
    }
    
    // Range validation for numeric fields
    if (typeof fieldValue === 'number') {
      const rangeResult = this._validateFieldRange(fieldName, fieldValue);
      if (!rangeResult.isValid) {
        result.isValid = false;
        result.errors.push(...rangeResult.errors);
      }
    }
    
    return result;
  }

  /**
   * Check data consistency across fields
   * @param {Object} itemData - Item data to check
   * @returns {Promise<Object>} Consistency check results
   */
  async checkConsistency(itemData) {
    const consistencyResult = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: [],
      checks: {}
    };
    
    // Title-Description consistency
    if (itemData.title && itemData.description) {
      const titleDescConsistency = this._checkTitleDescriptionConsistency(itemData.title, itemData.description);
      consistencyResult.checks.titleDescription = titleDescConsistency;
      if (!titleDescConsistency.isConsistent) {
        consistencyResult.warnings.push({
          type: 'consistency',
          message: 'Titel och beskrivning verkar inte stämma överens'
        });
      }
    }
    
    // Category-Content consistency
    if (itemData.category && (itemData.title || itemData.description)) {
      const categoryConsistency = this._checkCategoryConsistency(itemData);
      consistencyResult.checks.category = categoryConsistency;
      if (!categoryConsistency.isConsistent) {
        consistencyResult.warnings.push({
          type: 'consistency',
          message: 'Kategori verkar inte matcha innehållet'
        });
      }
    }
    
    // Price-Condition consistency
    if (itemData.price && itemData.condition) {
      const priceConditionConsistency = this._checkPriceConditionConsistency(itemData.price, itemData.condition, itemData.category);
      consistencyResult.checks.priceCondition = priceConditionConsistency;
      if (!priceConditionConsistency.isConsistent) {
        consistencyResult.warnings.push({
          type: 'consistency',
          message: 'Pris och skick verkar inte stämma överens'
        });
      }
    }
    
    return consistencyResult;
  }

  /**
   * Analyze data completeness
   * @param {Object} itemData - Item data to analyze
   * @returns {Object} Completeness analysis results
   */
  analyzeCompleteness(itemData) {
    const completenessResult = {
      score: 0,
      missingFields: [],
      optionalFields: [],
      enhancementOpportunities: [],
      auctionReadiness: false
    };
    
    // Essential fields (required for basic listing)
    const essentialFields = ['title', 'description', 'category'];
    const missingEssential = essentialFields.filter(field => !itemData[field]);
    completenessResult.missingFields.push(...missingEssential);
    
    // Important fields (improve listing quality)
    const importantFields = ['condition', 'artist', 'year', 'material', 'dimensions'];
    const missingImportant = importantFields.filter(field => !itemData[field]);
    completenessResult.optionalFields.push(...missingImportant);
    
    // Auction-specific fields
    const auctionFields = ['startingPrice', 'estimatedValue', 'provenance'];
    const missingAuction = auctionFields.filter(field => !itemData[field]);
    
    // Calculate completeness score
    const totalFields = essentialFields.length + importantFields.length + auctionFields.length;
    const presentFields = totalFields - missingEssential.length - missingImportant.length - missingAuction.length;
    completenessResult.score = Math.round((presentFields / totalFields) * 100);
    
    // Determine auction readiness
    completenessResult.auctionReadiness = missingEssential.length === 0 && missingAuction.length <= 1;
    
    // Generate enhancement opportunities
    if (itemData.title && itemData.title.length < 50) {
      completenessResult.enhancementOpportunities.push('Förläng titeln för bättre synlighet');
    }
    
    if (itemData.description && itemData.description.length < 100) {
      completenessResult.enhancementOpportunities.push('Utöka beskrivningen med mer detaljer');
    }
    
    if (!itemData.images || itemData.images.length < 3) {
      completenessResult.enhancementOpportunities.push('Lägg till fler bilder för bättre presentation');
    }
    
    return completenessResult;
  }

  /**
   * Detect potential duplicates
   * @param {Object} itemData - Item to check for duplicates
   * @param {Array} existingItems - Array of existing items to compare against
   * @returns {Object} Duplicate detection results
   */
  detectDuplicates(itemData, existingItems = []) {
    const duplicateResult = {
      isDuplicate: false,
      confidence: 0,
      matches: [],
      similarItems: []
    };
    
    if (!existingItems.length) return duplicateResult;
    
    for (const existingItem of existingItems) {
      const similarity = this._calculateSimilarity(itemData, existingItem);
      
      if (similarity.score > 0.9) {
        duplicateResult.isDuplicate = true;
        duplicateResult.matches.push({
          item: existingItem,
          similarity: similarity.score,
          reasons: similarity.reasons
        });
      } else if (similarity.score > 0.7) {
        duplicateResult.similarItems.push({
          item: existingItem,
          similarity: similarity.score,
          reasons: similarity.reasons
        });
      }
    }
    
    duplicateResult.confidence = duplicateResult.matches.length > 0 ? 
      Math.max(...duplicateResult.matches.map(m => m.similarity)) : 0;
    
    return duplicateResult;
  }

  /**
   * Validate batch of items
   * @param {Array} items - Array of items to validate
   * @param {Object} options - Batch validation options
   * @returns {Promise<Object>} Batch validation results
   */
  async validateBatch(items, options = {}) {
    this.stats.batchValidations++;
    
    const batchResult = {
      totalItems: items.length,
      validItems: 0,
      invalidItems: 0,
      results: [],
      summary: {
        commonErrors: {},
        averageQuality: 0,
        averageCompleteness: 0
      }
    };
    
    const level = options.level || 'standard';
    const concurrency = options.concurrency || 5;
    
    // Process items in batches to avoid overwhelming the system
    for (let i = 0; i < items.length; i += concurrency) {
      const batch = items.slice(i, i + concurrency);
      const batchPromises = batch.map(item => this.validateItem(item, level, options));
      const batchResults = await Promise.all(batchPromises);
      
      batchResult.results.push(...batchResults);
    }
    
    // Calculate summary statistics
    batchResult.validItems = batchResult.results.filter(r => r.isValid).length;
    batchResult.invalidItems = batchResult.totalItems - batchResult.validItems;
    
    const qualityScores = batchResult.results.map(r => r.qualityScore);
    const completenessScores = batchResult.results.map(r => r.completenessScore);
    
    batchResult.summary.averageQuality = qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length;
    batchResult.summary.averageCompleteness = completenessScores.reduce((a, b) => a + b, 0) / completenessScores.length;
    
    // Collect common errors
    const errorCounts = {};
    batchResult.results.forEach(result => {
      result.errors.forEach(error => {
        const key = `${error.type}:${error.message}`;
        errorCounts[key] = (errorCounts[key] || 0) + 1;
      });
    });
    
    batchResult.summary.commonErrors = Object.entries(errorCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .reduce((obj, [key, count]) => {
        obj[key] = count;
        return obj;
      }, {});
    
    return batchResult;
  }

  /**
   * Generate comprehensive validation report
   * @param {Object} itemData - Item data to generate report for
   * @param {string} level - Validation level
   * @returns {Promise<Object>} Detailed validation report
   */
  async generateValidationReport(itemData, level = 'comprehensive') {
    const validation = await this.validateItem(itemData, level);
    const completeness = this.analyzeCompleteness(itemData);
    const consistency = await this.checkConsistency(itemData);
    
    return {
      item: {
        title: itemData.title || 'Untitled',
        category: itemData.category || 'Unknown'
      },
      validation: validation,
      completeness: completeness,
      consistency: consistency,
      recommendations: this._generateRecommendations(validation, completeness, consistency),
      actionItems: this._generateActionItems(validation, completeness),
      report: {
        generatedAt: new Date().toISOString(),
        level: level,
        overallScore: Math.round((validation.qualityScore + completeness.score) / 2)
      }
    };
  }

  // Private helper methods continue in next part due to length...
  
  /**
   * Validate required fields
   * @private
   */
  _validateRequiredFields(itemData, level) {
    const result = { isValid: true, errors: [], warnings: [] };
    
    // Handle null or undefined itemData
    if (!itemData || typeof itemData !== 'object') {
      result.isValid = false;
      result.errors.push({
        type: 'required',
        field: 'itemData',
        message: 'Objektdata saknas eller är ogiltigt'
      });
      return result;
    }
    
    const requiredFields = this.validationRules.required[level] || this.validationRules.required.standard;
    
    for (const field of requiredFields) {
      if (!itemData[field] || (typeof itemData[field] === 'string' && itemData[field].trim() === '')) {
        result.isValid = false;
        result.errors.push({
          type: 'required',
          field: field,
          message: `Obligatoriskt fält '${field}' saknas`
        });
        this.stats.commonErrors.missingRequired++;
      }
    }
    
    return result;
  }

  /**
   * Validate field formats
   * @private
   */
  _validateFormats(itemData) {
    const result = { isValid: true, errors: [], warnings: [] };
    
    // Email validation
    if (itemData.email && !this.validationRules.formats.email.test(itemData.email)) {
      result.isValid = false;
      result.errors.push({
        type: 'format',
        field: 'email',
        message: 'Ogiltig e-postadress'
      });
      this.stats.commonErrors.formatErrors++;
    }
    
    // Phone validation
    if (itemData.phone && !this.validationRules.formats.phone.test(itemData.phone)) {
      result.warnings.push({
        type: 'format',
        field: 'phone',
        message: 'Telefonnummer verkar inte vara i svenskt format'
      });
    }
    
    // Price validation
    if (itemData.price && !this.validationRules.formats.price.test(itemData.price.toString())) {
      result.isValid = false;
      result.errors.push({
        type: 'format',
        field: 'price',
        message: 'Pris måste vara ett giltigt nummer'
      });
      this.stats.commonErrors.formatErrors++;
    }
    
    return result;
  }

  /**
   * Validate field lengths
   * @private
   */
  _validateLengths(itemData) {
    const result = { isValid: true, errors: [], warnings: [] };
    
    for (const [field, limits] of Object.entries(this.validationRules.lengths)) {
      if (itemData[field]) {
        const length = itemData[field].toString().length;
        
        if (length < limits.min) {
          result.isValid = false;
          result.errors.push({
            type: 'length',
            field: field,
            message: `${field} är för kort (minimum ${limits.min} tecken)`
          });
          this.stats.commonErrors.lengthErrors++;
        } else if (length > limits.max) {
          result.isValid = false;
          result.errors.push({
            type: 'length',
            field: field,
            message: `${field} är för lång (maximum ${limits.max} tecken)`
          });
          this.stats.commonErrors.lengthErrors++;
        }
      }
    }
    
    return result;
  }

  /**
   * Validate consistency between fields
   * @private
   */
  async _validateConsistency(itemData) {
    const result = { isValid: true, errors: [], warnings: [] };
    
    // Use basic consistency checks
    const basicConsistency = await this.checkConsistency(itemData);
    this._mergeValidationResults(result, basicConsistency);
    
    return result;
  }

  /**
   * Validate business rules
   * @private
   */
  _validateBusinessRules(itemData) {
    const result = { isValid: true, errors: [], warnings: [] };
    
    // Price range validation by category
    if (itemData.price && itemData.category) {
      const priceRange = this.businessRules.priceRanges[itemData.category];
      if (priceRange) {
        const price = parseFloat(itemData.price);
        if (price < priceRange.min || price > priceRange.max) {
          result.warnings.push({
            type: 'business',
            field: 'price',
            message: `Pris verkar ovanligt för kategorin ${itemData.category}`
          });
          this.stats.commonErrors.businessRuleErrors++;
        }
      }
    }
    
    return result;
  }

  /**
   * Perform AI-powered validation
   * @private
   */
  async _performAIValidation(itemData, options = {}) {
    try {
      this.stats.aiValidations++;
      
      const model = this.modelManager.getModelConfig('data-validation');
      const prompt = this.promptManager.getUserPrompt(itemData, 'data-validation', {
        validationLevel: options.level || 'comprehensive',
        ...options
      });
      
      const response = await this.apiManager.callClaudeAPI(itemData, 'data-validation');
      
      const parsedResult = this.responseParser.parseResponse(response, 'data-validation', {
        itemData,
        model: model.id
      }) || {};
      
      return {
        isValid: parsedResult.isValid !== false,
        errors: parsedResult.errors || [],
        warnings: parsedResult.warnings || [],
        suggestions: parsedResult.suggestions || [],
        confidence: parsedResult.confidence || 0.7
      };
      
    } catch (error) {
      console.warn('AI validation failed:', error);
      return { isValid: true, errors: [], warnings: [], suggestions: [] };
    }
  }

  /**
   * Calculate quality score
   * @private
   */
  _calculateQualityScore(validationResult) {
    let score = 100;
    
    // Deduct points for errors and warnings
    score -= validationResult.errors.length * 15;
    score -= validationResult.warnings.length * 5;
    
    // Bonus for having suggestions (shows engagement)
    score += Math.min(validationResult.suggestions.length * 2, 10);
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate completeness score
   * @private
   */
  _calculateCompletenessScore(itemData) {
    const allFields = ['title', 'description', 'category', 'condition', 'price', 'artist', 'year', 'material', 'dimensions', 'images'];
    const presentFields = allFields.filter(field => itemData[field] && itemData[field] !== '').length;
    
    return Math.round((presentFields / allFields.length) * 100);
  }

  /**
   * Generate recommendations
   * @private
   */
  _generateRecommendations(validation, completeness, consistency) {
    const recommendations = [];
    
    if (validation.qualityScore < 70) {
      recommendations.push('Förbättra datakvaliteten genom att åtgärda fel och varningar');
    }
    
    if (completeness.score < 60) {
      recommendations.push('Lägg till mer information för att förbättra listningen');
    }
    
    if (consistency.warnings.length > 0) {
      recommendations.push('Kontrollera att all information är konsistent');
    }
    
    return recommendations;
  }

  /**
   * Generate action items
   * @private
   */
  _generateActionItems(validation, completeness) {
    const actions = [];
    
    validation.errors.forEach(error => {
      actions.push({
        priority: 'high',
        action: `Åtgärda: ${error.message}`,
        field: error.field
      });
    });
    
    completeness.missingFields.forEach(field => {
      actions.push({
        priority: 'medium',
        action: `Lägg till: ${field}`,
        field: field
      });
    });
    
    return actions;
  }

  /**
   * Helper methods for field validation, similarity calculation, etc.
   * @private
   */
  _isFieldRequired(fieldName, level) {
    const requiredFields = this.validationRules.required[level] || this.validationRules.required.standard;
    return requiredFields.includes(fieldName);
  }

  _validateFieldFormat(fieldName, fieldValue) {
    const result = { isValid: true, errors: [] };
    const format = this.validationRules.formats[fieldName];
    
    if (format && !format.test(fieldValue.toString())) {
      result.isValid = false;
      result.errors.push({
        type: 'format',
        field: fieldName,
        message: `Ogiltigt format för ${fieldName}`
      });
    }
    
    return result;
  }

  _validateFieldLength(fieldName, fieldValue) {
    const result = { isValid: true, errors: [], warnings: [] };
    const limits = this.validationRules.lengths[fieldName];
    
    if (limits) {
      const length = fieldValue.toString().length;
      if (length < limits.min) {
        result.isValid = false;
        result.errors.push({
          type: 'length',
          field: fieldName,
          message: `${fieldName} är för kort`
        });
      } else if (length > limits.max) {
        result.isValid = false;
        result.errors.push({
          type: 'length',
          field: fieldName,
          message: `${fieldName} är för lång`
        });
      }
    }
    
    return result;
  }

  _validateFieldRange(fieldName, fieldValue) {
    const result = { isValid: true, errors: [] };
    const range = this.validationRules.ranges[fieldName];
    
    if (range && (fieldValue < range.min || fieldValue > range.max)) {
      result.isValid = false;
      result.errors.push({
        type: 'range',
        field: fieldName,
        message: `${fieldName} är utanför tillåtet intervall`
      });
    }
    
    return result;
  }

  _checkTitleDescriptionConsistency(title, description) {
    const titleWords = title.toLowerCase().split(/\s+/);
    const descWords = description.toLowerCase().split(/\s+/);
    
    const commonWords = titleWords.filter(word => 
      descWords.includes(word) && !this.swedishValidation.commonWords.includes(word)
    );
    
    const consistency = commonWords.length / Math.min(titleWords.length, 5);
    
    return {
      isConsistent: consistency > 0.3,
      score: consistency,
      commonWords: commonWords
    };
  }

  _checkCategoryConsistency(itemData) {
    const category = itemData.category;
    const text = `${itemData.title || ''} ${itemData.description || ''}`.toLowerCase();
    
    const categoryKeywords = this.businessRules.categoryKeywords[category] || [];
    const matches = categoryKeywords.filter(keyword => text.includes(keyword));
    
    return {
      isConsistent: matches.length > 0,
      matchedKeywords: matches,
      score: matches.length / categoryKeywords.length
    };
  }

  _checkPriceConditionConsistency(price, condition, category) {
    const multiplier = this.businessRules.conditionPriceMultipliers[condition];
    if (!multiplier) return { isConsistent: true, score: 1 };
    
    const categoryRange = this.businessRules.priceRanges[category];
    if (!categoryRange) return { isConsistent: true, score: 1 };
    
    const expectedPrice = categoryRange.min * multiplier;
    const actualPrice = parseFloat(price);
    
    const ratio = Math.min(actualPrice, expectedPrice) / Math.max(actualPrice, expectedPrice);
    
    return {
      isConsistent: ratio > 0.5,
      score: ratio,
      expectedRange: { min: expectedPrice * 0.5, max: expectedPrice * 2 }
    };
  }

  _calculateSimilarity(item1, item2) {
    let score = 0;
    const reasons = [];
    
    // Title similarity
    if (item1.title && item2.title) {
      const titleSim = this._stringSimilarity(item1.title, item2.title);
      score += titleSim * 0.4;
      if (titleSim > 0.8) reasons.push('Mycket liknande titlar');
    }
    
    // Description similarity
    if (item1.description && item2.description) {
      const descSim = this._stringSimilarity(item1.description, item2.description);
      score += descSim * 0.3;
      if (descSim > 0.8) reasons.push('Mycket liknande beskrivningar');
    }
    
    // Category match
    if (item1.category === item2.category) {
      score += 0.2;
      reasons.push('Samma kategori');
    }
    
    // Price similarity
    if (item1.price && item2.price) {
      const priceDiff = Math.abs(item1.price - item2.price) / Math.max(item1.price, item2.price);
      if (priceDiff < 0.1) {
        score += 0.1;
        reasons.push('Mycket liknande priser');
      }
    }
    
    return { score, reasons };
  }

  _stringSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this._levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  _levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  _mergeValidationResults(target, source) {
    if (!source || typeof source !== 'object') return;
    
    if (source.isValid === false) target.isValid = false;
    if (source.errors && Array.isArray(source.errors)) target.errors.push(...source.errors);
    if (source.warnings && Array.isArray(source.warnings)) target.warnings.push(...source.warnings);
    if (source.suggestions && Array.isArray(source.suggestions)) target.suggestions.push(...source.suggestions);
    if (source.details && typeof source.details === 'object') Object.assign(target.details, source.details);
  }

  _updateValidationStats(validationResult) {
    if (validationResult.isValid) {
      this.stats.validationsPassed++;
    } else {
      this.stats.validationsFailed++;
    }
    
    // Update performance metrics
    this.stats.performanceMetrics.avgQualityScore = 
      (this.stats.performanceMetrics.avgQualityScore + validationResult.qualityScore) / 2;
    this.stats.performanceMetrics.avgCompletenessScore = 
      (this.stats.performanceMetrics.avgCompletenessScore + validationResult.completenessScore) / 2;
    
    if (validationResult.metadata.validationTime) {
      this.stats.performanceMetrics.avgValidationTime = 
        (this.stats.performanceMetrics.avgValidationTime + validationResult.metadata.validationTime) / 2;
    }
  }

  _generateValidationCacheKey(itemData, level, options) {
    // Handle null or undefined itemData
    if (!itemData || typeof itemData !== 'object') {
      return `validation:null:${level}`;
    }
    
    const keyData = {
      title: itemData.title || '',
      description: itemData.description || '',
      category: itemData.category || '',
      level: level,
      skipAI: options.skipAI || false
    };
    
    return `validation:${JSON.stringify(keyData)}`;
  }

  /**
   * Clear validation caches
   * @param {string} [type] - Cache type to clear ('rules', 'business', 'patterns', 'results', or 'all')
   */
  clearCache(type = 'all') {
    if (type === 'all' || type === 'rules') {
      this.validationRulesCache.clear();
    }
    
    if (type === 'all' || type === 'business') {
      this.businessLogicCache.clear();
    }
    
    if (type === 'all' || type === 'patterns') {
      this.patternCache.clear();
    }
    
    if (type === 'all' || type === 'results') {
      this.resultsCache.clear();
    }
    
    console.log(`🧹 Data Validator: ${type} cache cleared`);
  }

  /**
   * Get validation rules
   * @returns {Object} Current validation rules
   */
  getValidationRules() {
    return this.validationRules;
  }

  /**
   * Get business rules
   * @returns {Object} Current business rules
   */
  getBusinessRules() {
    return this.businessRules;
  }

  /**
   * Get Swedish validation settings
   * @returns {Object} Swedish-specific validation settings
   */
  getSwedishValidation() {
    return this.swedishValidation;
  }

  /**
   * Get validation levels configuration
   * @returns {Object} Available validation levels
   */
  getValidationLevels() {
    return this.validationLevels;
  }

  /**
   * Get service statistics
   * @returns {Object} Service statistics and performance data
   */
  getStats() {
    const totalValidations = this.stats.validationsPerformed;
    const successRate = totalValidations > 0 
      ? ((this.stats.validationsPassed / totalValidations) * 100).toFixed(1)
      : 0;
    const hitRate = (this.stats.cacheHits + this.stats.cacheMisses) > 0 
      ? ((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100).toFixed(1)
      : 0;
    
    return {
      ...this.stats,
      successRate: `${successRate}%`,
      cacheHitRate: `${hitRate}%`,
      cacheSize: {
        validationRules: this.validationRulesCache.size,
        businessLogic: this.businessLogicCache.size,
        patterns: this.patternCache.size,
        results: this.resultsCache.size
      }
    };
  }

  /**
   * Get service status and capabilities
   * @returns {Object} Service status information
   */
  getStatus() {
    return {
      service: 'DataValidator',
      version: '1.0.0',
      capabilities: {
        fieldValidation: true,
        formatValidation: true,
        lengthValidation: true,
        consistencyChecking: true,
        businessRuleValidation: true,
        aiValidation: true,
        completenessAnalysis: true,
        duplicateDetection: true,
        batchValidation: true,
        swedishLanguageSupport: true,
        multiLevelCaching: true,
        performanceAnalytics: true
      },
      dependencies: {
        modelManager: this.modelManager.getModelConfig ? { ready: true } : { ready: false },
        responseParser: this.responseParser.parseResponse ? { ready: true } : { ready: false },
        promptManager: this.promptManager.getUserPrompt ? { ready: true } : { ready: false }
      },
      validationLevels: {
        available: Object.keys(this.validationLevels),
        total: Object.keys(this.validationLevels).length
      },
      validationRules: {
        requiredFields: Object.keys(this.validationRules.required).length,
        formats: Object.keys(this.validationRules.formats).length,
        businessRules: Object.keys(this.businessRules.priceRanges).length
      },
      swedishSupport: {
        cities: this.swedishValidation.cities.length,
        regions: this.swedishValidation.regions.length,
        currencies: this.swedishValidation.currencies.length
      },
      statistics: this.getStats(),
      ready: true
    };
  }
} 