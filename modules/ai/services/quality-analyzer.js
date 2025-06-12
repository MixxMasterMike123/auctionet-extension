/**
 * Quality Analyzer Service
 * 
 * Handles comprehensive quality assessment and scoring of auction items.
 * Provides intelligent quality analysis with condition assessment, 
 * market value estimation, and detailed quality reports.
 * 
 * @module QualityAnalyzer
 */

import { ModelManager } from '../core/model-manager.js';
import { ResponseParser } from '../core/response-parser.js';
import { PromptManager } from '../core/prompt-manager.js';

/**
 * Quality Analyzer Service
 * 
 * Specialized service for analyzing item quality, condition, and market value
 * with comprehensive scoring and detailed quality reports.
 */
export class QualityAnalyzer {
  /**
   * Create a QualityAnalyzer instance
   * @param {Object} apiManager - API manager for making Claude calls
   */
  constructor(apiManager) {
    this.apiManager = apiManager;
    this.modelManager = new ModelManager();
    this.responseParser = new ResponseParser();
    this.promptManager = new PromptManager();
    
    // Quality analysis cache
    this.qualityCache = new Map();
    this.conditionCache = new Map();
    this.marketCache = new Map();
    
    // Quality scoring standards
    this.qualityStandards = {
      condition: {
        excellent: { min: 9.0, max: 10.0, description: 'Utmärkt skick' },
        veryGood: { min: 7.5, max: 8.9, description: 'Mycket bra skick' },
        good: { min: 6.0, max: 7.4, description: 'Bra skick' },
        fair: { min: 4.0, max: 5.9, description: 'Acceptabelt skick' },
        poor: { min: 1.0, max: 3.9, description: 'Dåligt skick' }
      },
      authenticity: {
        verified: { min: 9.0, max: 10.0, description: 'Verifierad äkthet' },
        likely: { min: 7.0, max: 8.9, description: 'Trolig äkthet' },
        uncertain: { min: 4.0, max: 6.9, description: 'Osäker äkthet' },
        questionable: { min: 1.0, max: 3.9, description: 'Tveksam äkthet' }
      },
      marketValue: {
        premium: { multiplier: 1.5, description: 'Premiumvärde' },
        standard: { multiplier: 1.0, description: 'Standardvärde' },
        below: { multiplier: 0.7, description: 'Under marknadsvärde' }
      }
    };
    
    // Statistics tracking
    this.stats = {
      analysesPerformed: 0,
      conditionAssessments: 0,
      marketEvaluations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      qualityDistribution: {
        excellent: 0,
        veryGood: 0,
        good: 0,
        fair: 0,
        poor: 0
      }
    };
  }

  /**
   * Perform comprehensive quality analysis
   * @param {Object} itemData - Item data to analyze
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Complete quality analysis
   */
  async analyzeQuality(itemData, options = {}) {
    try {
      this.stats.analysesPerformed++;
      
      // Validate input
      const validation = this._validateItemData(itemData);
      if (!validation.isValid) {
        throw new Error(`Invalid item data: ${validation.errors.join(', ')}`);
      }
      
      // Check cache first
      const cacheKey = this._generateQualityCacheKey(itemData, options);
      if (this.qualityCache.has(cacheKey) && !options.skipCache) {
        this.stats.cacheHits++;
        return this.qualityCache.get(cacheKey);
      }
      
      this.stats.cacheMisses++;
      
      // Determine analysis approach based on item characteristics
      const analysisStrategy = this._determineAnalysisStrategy(itemData);
      
      // Get appropriate model for quality analysis
      const model = this.modelManager.getModelConfig('quality-analysis');
      
      // Generate specialized prompt for quality analysis
      const prompt = this.promptManager.getUserPrompt(itemData, 'quality-analysis', {
        strategy: analysisStrategy.type,
        includeMarketData: options.includeMarketData !== false,
        detailLevel: options.detailLevel || 'standard',
        ...options
      });
      
      // Make API call
      const response = await this.apiManager.callClaudeAPI(itemData, 'quality-analysis');
      
      // Parse quality analysis response
      const parsedResult = this.responseParser.parseResponse(response, 'quality-analysis', {
        itemData,
        model: model.id,
        strategy: analysisStrategy.type
      }) || {};
      
      // Create comprehensive quality analysis
      const qualityAnalysis = {
        overall: {
          score: this._calculateOverallScore(parsedResult),
          grade: this._determineQualityGrade(parsedResult),
          confidence: parsedResult.confidence || 0.8
        },
        condition: {
          score: parsedResult.conditionScore || 0,
          assessment: parsedResult.conditionAssessment || '',
          issues: parsedResult.conditionIssues || [],
          strengths: parsedResult.conditionStrengths || []
        },
        authenticity: {
          score: parsedResult.authenticityScore || 0,
          assessment: parsedResult.authenticityAssessment || '',
          indicators: parsedResult.authenticityIndicators || [],
          concerns: parsedResult.authenticityConcerns || []
        },
        marketValue: {
          estimate: parsedResult.marketEstimate || null,
          range: parsedResult.marketRange || null,
          factors: parsedResult.marketFactors || [],
          trend: parsedResult.marketTrend || 'stable'
        },
        recommendations: {
          conservation: parsedResult.conservationRecommendations || [],
          presentation: parsedResult.presentationRecommendations || [],
          pricing: parsedResult.pricingRecommendations || [],
          marketing: parsedResult.marketingRecommendations || []
        },
        risks: {
          condition: parsedResult.conditionRisks || [],
          authenticity: parsedResult.authenticityRisks || [],
          market: parsedResult.marketRisks || [],
          legal: parsedResult.legalRisks || []
        },
        metadata: {
          timestamp: new Date().toISOString(),
          strategy: analysisStrategy.type,
          model: model.id,
          promptLength: prompt.length,
          cacheKey,
          analysisDepth: analysisStrategy.depth
        }
      };
      
      // Update quality distribution stats
      this._updateQualityStats(qualityAnalysis.overall.grade);
      
      // Cache successful results
      if (qualityAnalysis.overall.confidence > 0.5) {
        this.qualityCache.set(cacheKey, qualityAnalysis);
      }
      
      return qualityAnalysis;
      
    } catch (error) {
      console.error('❌ Quality analysis failed:', error);
      
      return {
        overall: { score: 0, grade: 'unknown', confidence: 0 },
        condition: { score: 0, assessment: '', issues: [], strengths: [] },
        authenticity: { score: 0, assessment: '', indicators: [], concerns: [] },
        marketValue: { estimate: null, range: null, factors: [], trend: 'unknown' },
        recommendations: { conservation: [], presentation: [], pricing: [], marketing: [] },
        risks: { condition: [], authenticity: [], market: [], legal: [] },
        error: error.message,
        metadata: {
          timestamp: new Date().toISOString(),
          failed: true
        }
      };
    }
  }

  /**
   * Focused condition assessment
   * @param {Object} itemData - Item data to assess
   * @param {Object} options - Assessment options
   * @returns {Promise<Object>} Condition assessment result
   */
  async assessCondition(itemData, options = {}) {
    try {
      this.stats.conditionAssessments++;
      
      // Check condition cache
      const cacheKey = this._generateConditionCacheKey(itemData, options);
      if (this.conditionCache.has(cacheKey) && !options.skipCache) {
        this.stats.cacheHits++;
        return this.conditionCache.get(cacheKey);
      }
      
      this.stats.cacheMisses++;
      
      // Get model for condition assessment
      const model = this.modelManager.getModelConfig('condition-assessment');
      
      // Generate condition-specific prompt
      const prompt = this.promptManager.getUserPrompt(itemData, 'condition-assessment', {
        focusAreas: options.focusAreas || ['overall', 'surface', 'structure', 'function'],
        detailLevel: options.detailLevel || 'detailed',
        ...options
      });
      
      // Make API call
      const response = await this.apiManager.callClaudeAPI(itemData, 'condition-assessment');
      
      // Parse condition response
      const parsedResult = this.responseParser.parseResponse(response, 'condition-assessment', {
        itemData,
        model: model.id
      }) || {};
      
      // Create condition assessment
      const conditionAssessment = {
        score: parsedResult.score || 0,
        grade: this._getConditionGrade(parsedResult.score || 0),
        summary: parsedResult.summary || '',
        details: {
          surface: parsedResult.surfaceCondition || '',
          structure: parsedResult.structuralCondition || '',
          function: parsedResult.functionalCondition || '',
          overall: parsedResult.overallCondition || ''
        },
        issues: parsedResult.issues || [],
        strengths: parsedResult.strengths || [],
        recommendations: parsedResult.recommendations || [],
        confidence: parsedResult.confidence || 0.8,
        metadata: {
          timestamp: new Date().toISOString(),
          model: model.id,
          promptLength: prompt.length,
          cacheKey
        }
      };
      
      // Cache result
      if (conditionAssessment.confidence > 0.6) {
        this.conditionCache.set(cacheKey, conditionAssessment);
      }
      
      return conditionAssessment;
      
    } catch (error) {
      console.error('❌ Condition assessment failed:', error);
      
      return {
        score: 0,
        grade: 'unknown',
        summary: '',
        details: { surface: '', structure: '', function: '', overall: '' },
        issues: [],
        strengths: [],
        recommendations: [],
        confidence: 0,
        error: error.message,
        metadata: {
          timestamp: new Date().toISOString(),
          failed: true
        }
      };
    }
  }

  /**
   * Market value evaluation
   * @param {Object} itemData - Item data to evaluate
   * @param {Object} options - Evaluation options
   * @returns {Promise<Object>} Market evaluation result
   */
  async evaluateMarketValue(itemData, options = {}) {
    try {
      this.stats.marketEvaluations++;
      
      // Check market cache
      const cacheKey = this._generateMarketCacheKey(itemData, options);
      if (this.marketCache.has(cacheKey) && !options.skipCache) {
        this.stats.cacheHits++;
        return this.marketCache.get(cacheKey);
      }
      
      this.stats.cacheMisses++;
      
      // Get model for market evaluation
      const model = this.modelManager.getModelConfig('market-evaluation');
      
      // Generate market-specific prompt
      const prompt = this.promptManager.getUserPrompt(itemData, 'market-evaluation', {
        includeComparables: options.includeComparables !== false,
        marketSegment: options.marketSegment || 'general',
        timeframe: options.timeframe || 'current',
        ...options
      });
      
      // Make API call
      const response = await this.apiManager.callClaudeAPI(itemData, 'market-evaluation');
      
      // Parse market response
      const parsedResult = this.responseParser.parseResponse(response, 'market-evaluation', {
        itemData,
        model: model.id
      }) || {};
      
      // Create market evaluation
      const marketEvaluation = {
        estimate: parsedResult.estimate || null,
        range: {
          low: parsedResult.rangeLow || null,
          high: parsedResult.rangeHigh || null,
          currency: parsedResult.currency || 'SEK'
        },
        confidence: parsedResult.confidence || 0.7,
        factors: {
          positive: parsedResult.positiveFactors || [],
          negative: parsedResult.negativeFactors || [],
          neutral: parsedResult.neutralFactors || []
        },
        comparables: parsedResult.comparables || [],
        trend: parsedResult.trend || 'stable',
        marketSegment: parsedResult.marketSegment || 'general',
        liquidity: parsedResult.liquidity || 'medium',
        recommendations: parsedResult.recommendations || [],
        metadata: {
          timestamp: new Date().toISOString(),
          model: model.id,
          promptLength: prompt.length,
          cacheKey
        }
      };
      
      // Cache result
      if (marketEvaluation.confidence > 0.5) {
        this.marketCache.set(cacheKey, marketEvaluation);
      }
      
      return marketEvaluation;
      
    } catch (error) {
      console.error('❌ Market evaluation failed:', error);
      
      return {
        estimate: null,
        range: { low: null, high: null, currency: 'SEK' },
        confidence: 0,
        factors: { positive: [], negative: [], neutral: [] },
        comparables: [],
        trend: 'unknown',
        marketSegment: 'unknown',
        liquidity: 'unknown',
        recommendations: [],
        error: error.message,
        metadata: {
          timestamp: new Date().toISOString(),
          failed: true
        }
      };
    }
  }

  /**
   * Determine analysis strategy based on item characteristics
   * @private
   */
  _determineAnalysisStrategy(itemData) {
    const category = itemData.category?.toLowerCase() || '';
    const hasArtist = itemData.artist && itemData.artist.trim().length > 0;
    const hasEstimate = itemData.estimate && itemData.estimate.trim().length > 0;
    
    // High-value art pieces
    if (category.includes('konst') && hasArtist) {
      return { type: 'art_comprehensive', depth: 'deep', focus: ['authenticity', 'condition', 'provenance'] };
    }
    
    // Antiques and collectibles
    if (category.includes('antikviteter') || category.includes('samlarobjekt')) {
      return { type: 'antique_specialist', depth: 'detailed', focus: ['age', 'rarity', 'condition'] };
    }
    
    // Jewelry and precious items
    if (category.includes('smycken') || category.includes('guld') || category.includes('silver')) {
      return { type: 'precious_items', depth: 'detailed', focus: ['materials', 'craftsmanship', 'hallmarks'] };
    }
    
    // Furniture and design
    if (category.includes('möbler') || category.includes('design')) {
      return { type: 'design_furniture', depth: 'standard', focus: ['condition', 'style', 'functionality'] };
    }
    
    // High-value items (based on estimate)
    if (hasEstimate) {
      const estimateMatch = itemData.estimate.match(/(\d+)/);
      if (estimateMatch && parseInt(estimateMatch[1]) > 50000) {
        return { type: 'high_value', depth: 'deep', focus: ['authenticity', 'condition', 'market'] };
      }
    }
    
    // General items
    return { type: 'general_assessment', depth: 'standard', focus: ['condition', 'market'] };
  }

  /**
   * Calculate overall quality score
   * @private
   */
  _calculateOverallScore(parsedResult) {
    const conditionScore = parsedResult.conditionScore || 0;
    const authenticityScore = parsedResult.authenticityScore || 0;
    const marketScore = parsedResult.marketScore || 0;
    
    // Weighted average: condition 40%, authenticity 35%, market 25%
    return (conditionScore * 0.4) + (authenticityScore * 0.35) + (marketScore * 0.25);
  }

  /**
   * Determine quality grade from scores
   * @private
   */
  _determineQualityGrade(parsedResult) {
    const overallScore = this._calculateOverallScore(parsedResult);
    
    if (overallScore >= 9.0) return 'excellent';
    if (overallScore >= 7.5) return 'veryGood';
    if (overallScore >= 6.0) return 'good';
    if (overallScore >= 4.0) return 'fair';
    return 'poor';
  }

  /**
   * Get condition grade from score
   * @private
   */
  _getConditionGrade(score) {
    const standards = this.qualityStandards.condition;
    
    for (const [grade, range] of Object.entries(standards)) {
      if (score >= range.min && score <= range.max) {
        return grade;
      }
    }
    
    return 'unknown';
  }

  /**
   * Update quality distribution statistics
   * @private
   */
  _updateQualityStats(grade) {
    if (this.stats.qualityDistribution[grade] !== undefined) {
      this.stats.qualityDistribution[grade]++;
    }
  }

  /**
   * Validate item data for quality analysis
   * @private
   */
  _validateItemData(itemData) {
    const validation = { isValid: true, errors: [] };
    
    if (!itemData || typeof itemData !== 'object') {
      validation.isValid = false;
      validation.errors.push('Item data must be an object');
      return validation;
    }
    
    if (!itemData.title || typeof itemData.title !== 'string') {
      validation.isValid = false;
      validation.errors.push('Title is required');
    }
    
    if (!itemData.description || typeof itemData.description !== 'string') {
      validation.isValid = false;
      validation.errors.push('Description is required');
    }
    
    if (!itemData.category || typeof itemData.category !== 'string') {
      validation.isValid = false;
      validation.errors.push('Category is required');
    }
    
    return validation;
  }

  /**
   * Generate cache keys
   * @private
   */
  _generateQualityCacheKey(itemData, options) {
    const keyData = {
      title: itemData.title || '',
      description: itemData.description || '',
      category: itemData.category || '',
      condition: itemData.condition || '',
      detailLevel: options.detailLevel || 'standard'
    };
    
    return `quality:${JSON.stringify(keyData)}`;
  }

  _generateConditionCacheKey(itemData, options) {
    const keyData = {
      title: itemData.title || '',
      description: itemData.description || '',
      condition: itemData.condition || '',
      focusAreas: options.focusAreas || ['overall']
    };
    
    return `condition:${JSON.stringify(keyData)}`;
  }

  _generateMarketCacheKey(itemData, options) {
    const keyData = {
      title: itemData.title || '',
      category: itemData.category || '',
      artist: itemData.artist || '',
      estimate: itemData.estimate || '',
      marketSegment: options.marketSegment || 'general'
    };
    
    return `market:${JSON.stringify(keyData)}`;
  }

  /**
   * Clear caches
   * @param {string} [type] - Cache type to clear ('quality', 'condition', 'market', or 'all')
   */
  clearCache(type = 'all') {
    if (type === 'all' || type === 'quality') {
      this.qualityCache.clear();
    }
    
    if (type === 'all' || type === 'condition') {
      this.conditionCache.clear();
    }
    
    if (type === 'all' || type === 'market') {
      this.marketCache.clear();
    }
    
    console.log(`🧹 Quality Analyzer: ${type} cache cleared`);
  }

  /**
   * Get service statistics
   * @returns {Object} Service statistics and performance data
   */
  getStats() {
    const totalRequests = this.stats.analysesPerformed + this.stats.conditionAssessments + this.stats.marketEvaluations;
    const hitRate = totalRequests > 0 
      ? ((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100).toFixed(1)
      : 0;
    
    return {
      ...this.stats,
      totalRequests,
      cacheHitRate: `${hitRate}%`,
      cacheSize: {
        quality: this.qualityCache.size,
        condition: this.conditionCache.size,
        market: this.marketCache.size
      }
    };
  }

  /**
   * Get quality standards reference
   * @returns {Object} Quality standards and grading system
   */
  getQualityStandards() {
    return this.qualityStandards;
  }

  /**
   * Get service status and capabilities
   * @returns {Object} Service status information
   */
  getStatus() {
    return {
      service: 'QualityAnalyzer',
      version: '1.0.0',
      capabilities: {
        comprehensiveAnalysis: true,
        conditionAssessment: true,
        marketEvaluation: true,
        authenticityAnalysis: true,
        riskAssessment: true,
        recommendationEngine: true,
        multiLevelCaching: true
      },
      dependencies: {
        modelManager: this.modelManager.getModelConfig ? { ready: true } : { ready: false },
        responseParser: this.responseParser.parseResponse ? { ready: true } : { ready: false },
        promptManager: this.promptManager.getUserPrompt ? { ready: true } : { ready: false }
      },
      statistics: this.getStats(),
      qualityStandards: this.qualityStandards,
      ready: true
    };
  }
} 