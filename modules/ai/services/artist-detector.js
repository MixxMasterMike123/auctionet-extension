/**
 * Artist Detection Service
 * 
 * Handles artist identification, verification, and context analysis.
 * Provides intelligent artist detection with confidence scoring and
 * validation against known artist databases.
 * 
 * @module ArtistDetector
 */

import { ModelManager } from '../core/model-manager.js';
import { ResponseParser } from '../core/response-parser.js';
import { PromptManager } from '../core/prompt-manager.js';

/**
 * Artist Detection Service
 * 
 * Specialized service for detecting, verifying, and analyzing artists
 * in auction item data with confidence scoring and validation.
 */
export class ArtistDetector {
  /**
   * Create an ArtistDetector instance
   * @param {Object} apiManager - API manager for making Claude calls
   */
  constructor(apiManager) {
    this.apiManager = apiManager;
    this.modelManager = new ModelManager();
    this.responseParser = new ResponseParser();
    this.promptManager = new PromptManager();
    
    // Artist detection cache
    this.artistCache = new Map();
    this.verificationCache = new Map();
    
    // Statistics tracking
    this.stats = {
      detectionsPerformed: 0,
      verificationsPerformed: 0,
      cacheHits: 0,
      cacheMisses: 0,
      confidenceDistribution: {
        high: 0,    // 0.8+
        medium: 0,  // 0.5-0.8
        low: 0      // <0.5
      }
    };
  }

  /**
   * Detect artist from item data
   * @param {Object} itemData - Item data to analyze
   * @param {Object} options - Detection options
   * @returns {Promise<Object>} Artist detection result
   */
  async detectArtist(itemData, options = {}) {
    try {
      this.stats.detectionsPerformed++;
      
      // Validate input
      const validation = this._validateItemData(itemData);
      if (!validation.isValid) {
        throw new Error(`Invalid item data: ${validation.errors.join(', ')}`);
      }
      
      // Check cache first
      const cacheKey = this._generateDetectionCacheKey(itemData, options);
      if (this.artistCache.has(cacheKey) && !options.skipCache) {
        this.stats.cacheHits++;
        return this.artistCache.get(cacheKey);
      }
      
      this.stats.cacheMisses++;
      
      // Determine detection strategy
      const strategy = this._determineDetectionStrategy(itemData);
      
      // Get appropriate model for artist detection
      const model = this.modelManager.getModelConfig('artist-detection');
      
      // Generate specialized prompt for artist detection
      const prompt = this.promptManager.getUserPrompt(itemData, 'artist-detection', {
        strategy: strategy.type,
        enableArtistInfo: true,
        ...options
      });
      
      // Make API call
      const response = await this.apiManager.callClaudeAPI(itemData, 'artist-detection');
      
      // Parse artist detection response
      const parsedResult = this.responseParser.parseResponse(response, 'artist-detection', {
        itemData,
        model: model.id,
        strategy: strategy.type
      }) || {};
      
      // Create detection result
      const detectionResult = {
        artist: parsedResult.artist || null,
        confidence: this._calculateConfidence(parsedResult, itemData, strategy),
        reasoning: parsedResult.reasoning || '',
        alternativeNames: parsedResult.alternatives || [],
        period: parsedResult.period || null,
        nationality: parsedResult.nationality || null,
        artMovement: parsedResult.movement || null,
        signature: {
          detected: parsedResult.signatureDetected || false,
          description: parsedResult.signatureDescription || '',
          confidence: parsedResult.signatureConfidence || 0
        },
        metadata: {
          timestamp: new Date().toISOString(),
          strategy: strategy.type,
          model: model.id,
          promptLength: prompt.length,
          cacheKey
        }
      };
      
      // Update confidence distribution stats
      this._updateConfidenceStats(detectionResult.confidence);
      
      // Cache successful results
      if (detectionResult.artist && detectionResult.confidence > 0.3) {
        this.artistCache.set(cacheKey, detectionResult);
      }
      
      return detectionResult;
      
    } catch (error) {
      console.error('❌ Artist detection failed:', error);
      
      return {
        artist: null,
        confidence: 0,
        reasoning: '',
        alternativeNames: [],
        period: null,
        nationality: null,
        artMovement: null,
        signature: { detected: false, description: '', confidence: 0 },
        error: error.message,
        metadata: {
          timestamp: new Date().toISOString(),
          failed: true
        }
      };
    }
  }

  /**
   * Verify an artist against known databases and sources
   * @param {string} artistName - Artist name to verify
   * @param {Object} context - Additional context for verification
   * @param {Object} options - Verification options
   * @returns {Promise<Object>} Verification result
   */
  async verifyArtist(artistName, context = {}, options = {}) {
    try {
      this.stats.verificationsPerformed++;
      
      if (!artistName || typeof artistName !== 'string') {
        throw new Error('Invalid artist name provided');
      }
      
      // Check verification cache
      const cacheKey = this._generateVerificationCacheKey(artistName, context);
      if (this.verificationCache.has(cacheKey) && !options.skipCache) {
        this.stats.cacheHits++;
        return this.verificationCache.get(cacheKey);
      }
      
      this.stats.cacheMisses++;
      
      // Get model for verification
      const model = this.modelManager.getModelConfig('artist-verification');
      
      // Create verification item data
      const verificationData = {
        artist: artistName,
        category: context.category || 'Konst',
        title: context.title || '',
        description: context.description || '',
        period: context.period || '',
        ...context
      };
      
      // Generate verification prompt
      const prompt = this.promptManager.getUserPrompt(verificationData, 'artist-verification', {
        enableArtistInfo: true,
        verificationMode: true,
        ...options
      });
      
      // Make API call for verification
      const response = await this.apiManager.callClaudeAPI(verificationData, 'artist-verification');
      
      // Parse verification response
      const parsedResult = this.responseParser.parseResponse(response, 'artist-verification', {
        itemData: verificationData,
        model: model.id
      }) || {};
      
      // Create verification result
      const verificationResult = {
        artistName,
        isVerified: parsedResult.verified || false,
        confidence: parsedResult.confidence || 0,
        sources: parsedResult.sources || [],
        biography: parsedResult.biography || '',
        knownWorks: parsedResult.knownWorks || [],
        marketData: {
          priceRange: parsedResult.priceRange || null,
          auctionHistory: parsedResult.auctionHistory || [],
          marketTrend: parsedResult.marketTrend || null
        },
        warnings: parsedResult.warnings || [],
        alternativeSpellings: parsedResult.alternativeSpellings || [],
        metadata: {
          timestamp: new Date().toISOString(),
          model: model.id,
          promptLength: prompt.length,
          cacheKey
        }
      };
      
      // Cache verification results
      if (verificationResult.confidence > 0.5) {
        this.verificationCache.set(cacheKey, verificationResult);
      }
      
      return verificationResult;
      
    } catch (error) {
      console.error('❌ Artist verification failed:', error);
      
      return {
        artistName,
        isVerified: false,
        confidence: 0,
        sources: [],
        biography: '',
        knownWorks: [],
        marketData: { priceRange: null, auctionHistory: [], marketTrend: null },
        warnings: [`Verification failed: ${error.message}`],
        alternativeSpellings: [],
        error: error.message,
        metadata: {
          timestamp: new Date().toISOString(),
          failed: true
        }
      };
    }
  }

  /**
   * Comprehensive artist analysis combining detection and verification
   * @param {Object} itemData - Item data to analyze
   * @param {Object} options - Analysis options
   * @returns {Promise<Object>} Complete artist analysis
   */
  async analyzeArtist(itemData, options = {}) {
    try {
      // First, detect the artist
      const detection = await this.detectArtist(itemData, options);
      
      // If no artist detected, return detection result
      if (!detection.artist || detection.confidence < 0.3) {
        return {
          detection,
          verification: null,
          recommendation: this._generateRecommendation(detection, null),
          metadata: {
            timestamp: new Date().toISOString(),
            analysisType: 'detection-only'
          }
        };
      }
      
      // Verify the detected artist
      const verification = await this.verifyArtist(detection.artist, {
        category: itemData.category,
        title: itemData.title,
        description: itemData.description,
        period: detection.period,
        nationality: detection.nationality
      }, options);
      
      // Generate comprehensive recommendation
      const recommendation = this._generateRecommendation(detection, verification);
      
      return {
        detection,
        verification,
        recommendation,
        metadata: {
          timestamp: new Date().toISOString(),
          analysisType: 'full-analysis',
          overallConfidence: this._calculateOverallConfidence(detection, verification)
        }
      };
      
    } catch (error) {
      console.error('❌ Artist analysis failed:', error);
      
      return {
        detection: null,
        verification: null,
        recommendation: {
          action: 'manual_review',
          reason: `Analysis failed: ${error.message}`,
          confidence: 0
        },
        error: error.message,
        metadata: {
          timestamp: new Date().toISOString(),
          failed: true
        }
      };
    }
  }

  /**
   * Determine detection strategy based on item characteristics
   * @private
   */
  _determineDetectionStrategy(itemData) {
    const hasSignature = this._hasSignatureIndicators(itemData);
    const hasArtistMention = this._hasArtistMention(itemData);
    const categoryType = this._getCategoryType(itemData);
    
    if (hasSignature && hasArtistMention) {
      return { type: 'signature_and_mention', confidence: 0.9 };
    } else if (hasSignature) {
      return { type: 'signature_analysis', confidence: 0.7 };
    } else if (hasArtistMention) {
      return { type: 'text_analysis', confidence: 0.6 };
    } else if (categoryType === 'art') {
      return { type: 'style_analysis', confidence: 0.4 };
    } else {
      return { type: 'general_detection', confidence: 0.3 };
    }
  }

  /**
   * Check for signature indicators in item data
   * @private
   */
  _hasSignatureIndicators(itemData) {
    const text = `${itemData.title || ''} ${itemData.description || ''}`.toLowerCase();
    const signatureKeywords = [
      'signerad', 'signatur', 'monogram', 'märkt', 'stämplad',
      'signed', 'signature', 'monogrammed', 'marked', 'stamped'
    ];
    
    return signatureKeywords.some(keyword => text.includes(keyword));
  }

  /**
   * Check for artist mentions in item data
   * @private
   */
  _hasArtistMention(itemData) {
    if (itemData.artist && itemData.artist.trim().length > 0) {
      return true;
    }
    
    const text = `${itemData.title || ''} ${itemData.description || ''}`.toLowerCase();
    const artistIndicators = [
      'efter', 'tillskriven', 'skola', 'krets', 'art', 'stil',
      'after', 'attributed', 'school', 'circle', 'style', 'manner'
    ];
    
    return artistIndicators.some(indicator => text.includes(indicator));
  }

  /**
   * Get category type for detection strategy
   * @private
   */
  _getCategoryType(itemData) {
    const category = itemData.category?.toLowerCase() || '';
    
    if (category.includes('konst') || category.includes('målning') || category.includes('skulptur')) {
      return 'art';
    } else if (category.includes('antikviteter') || category.includes('möbler')) {
      return 'antiques';
    } else {
      return 'general';
    }
  }

  /**
   * Calculate confidence score for detection
   * @private
   */
  _calculateConfidence(parsedResult, itemData, strategy) {
    let baseConfidence = parsedResult.confidence || strategy.confidence;
    
    // Adjust based on available information
    if (itemData.artist && itemData.artist.trim().length > 0) {
      baseConfidence += 0.1;
    }
    
    if (parsedResult.reasoning && parsedResult.reasoning.length > 50) {
      baseConfidence += 0.05;
    }
    
    if (parsedResult.alternatives && parsedResult.alternatives.length > 0) {
      baseConfidence += 0.05;
    }
    
    return Math.min(Math.max(baseConfidence, 0), 1);
  }

  /**
   * Calculate overall confidence combining detection and verification
   * @private
   */
  _calculateOverallConfidence(detection, verification) {
    if (!verification) return detection.confidence;
    
    // Weighted average favoring verification if available
    return (detection.confidence * 0.4) + (verification.confidence * 0.6);
  }

  /**
   * Generate recommendation based on detection and verification results
   * @private
   */
  _generateRecommendation(detection, verification) {
    const overallConfidence = verification 
      ? this._calculateOverallConfidence(detection, verification)
      : detection.confidence;
    
    if (overallConfidence >= 0.8) {
      return {
        action: 'accept',
        reason: 'High confidence artist identification with verification',
        confidence: overallConfidence,
        suggestedArtist: detection.artist
      };
    } else if (overallConfidence >= 0.6) {
      return {
        action: 'review',
        reason: 'Medium confidence identification, recommend expert review',
        confidence: overallConfidence,
        suggestedArtist: detection.artist,
        alternatives: detection.alternativeNames
      };
    } else if (overallConfidence >= 0.3) {
      return {
        action: 'investigate',
        reason: 'Low confidence identification, requires further investigation',
        confidence: overallConfidence,
        suggestedArtist: detection.artist,
        investigationAreas: ['signature analysis', 'style comparison', 'provenance research']
      };
    } else {
      return {
        action: 'no_attribution',
        reason: 'Insufficient evidence for artist attribution',
        confidence: overallConfidence,
        suggestedAction: 'List without artist attribution or as "Unknown Artist"'
      };
    }
  }

  /**
   * Update confidence distribution statistics
   * @private
   */
  _updateConfidenceStats(confidence) {
    if (confidence >= 0.8) {
      this.stats.confidenceDistribution.high++;
    } else if (confidence >= 0.5) {
      this.stats.confidenceDistribution.medium++;
    } else {
      this.stats.confidenceDistribution.low++;
    }
  }

  /**
   * Validate item data for artist detection
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
   * Generate cache key for detection
   * @private
   */
  _generateDetectionCacheKey(itemData, options) {
    const keyData = {
      title: itemData.title || '',
      description: itemData.description || '',
      category: itemData.category || '',
      artist: itemData.artist || '',
      strategy: options.strategy || 'auto',
      skipCache: options.skipCache || false
    };
    
    return `detection:${JSON.stringify(keyData)}`;
  }

  /**
   * Generate cache key for verification
   * @private
   */
  _generateVerificationCacheKey(artistName, context) {
    const keyData = {
      artist: artistName,
      category: context.category || '',
      period: context.period || ''
    };
    
    return `verification:${JSON.stringify(keyData)}`;
  }

  /**
   * Clear all caches
   * @param {string} [type] - Cache type to clear ('detection', 'verification', or 'all')
   */
  clearCache(type = 'all') {
    if (type === 'all' || type === 'detection') {
      this.artistCache.clear();
    }
    
    if (type === 'all' || type === 'verification') {
      this.verificationCache.clear();
    }
    
    console.log(`🧹 Artist Detector: ${type} cache cleared`);
  }

  /**
   * Get service statistics
   * @returns {Object} Service statistics and performance data
   */
  getStats() {
    const totalRequests = this.stats.detectionsPerformed + this.stats.verificationsPerformed;
    const hitRate = totalRequests > 0 
      ? ((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100).toFixed(1)
      : 0;
    
    return {
      ...this.stats,
      totalRequests,
      cacheHitRate: `${hitRate}%`,
      cacheSize: {
        detection: this.artistCache.size,
        verification: this.verificationCache.size
      }
    };
  }

  /**
   * Get service status and capabilities
   * @returns {Object} Service status information
   */
  getStatus() {
    return {
      service: 'ArtistDetector',
      version: '1.0.0',
      capabilities: {
        artistDetection: true,
        artistVerification: true,
        comprehensiveAnalysis: true,
        signatureAnalysis: true,
        confidenceScoring: true,
        caching: true
      },
      dependencies: {
        modelManager: this.modelManager.getModelConfig ? { ready: true } : { ready: false },
        responseParser: this.responseParser.parseResponse ? { ready: true } : { ready: false },
        promptManager: this.promptManager.getUserPrompt ? { ready: true } : { ready: false }
      },
      statistics: this.getStats(),
      ready: true
    };
  }
} 