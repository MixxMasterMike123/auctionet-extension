/**
 * Search Optimizer Service
 * 
 * Handles intelligent search term generation, SEO optimization, and search query enhancement.
 * Provides keyword extraction, search term optimization, and related terms generation
 * with platform-specific optimization strategies.
 * 
 * @module SearchOptimizer
 */

import { ModelManager } from '../core/model-manager.js';
import { ResponseParser } from '../core/response-parser.js';
import { PromptManager } from '../core/prompt-manager.js';

/**
 * Search Optimizer Service
 * 
 * Specialized service for search term generation, keyword optimization,
 * and search query enhancement with platform-specific strategies.
 */
export class SearchOptimizer {
  /**
   * Create a SearchOptimizer instance
   * @param {Object} apiManager - API manager for making Claude calls
   */
  constructor(apiManager) {
    this.apiManager = apiManager;
    this.modelManager = new ModelManager();
    this.responseParser = new ResponseParser();
    this.promptManager = new PromptManager();
    
    // Search optimization caches
    this.keywordCache = new Map();
    this.searchTermCache = new Map();
    this.seoCache = new Map();
    this.relatedTermsCache = new Map();
    
    // Search optimization strategies
    this.searchStrategies = {
      auction: {
        priority: ['brand', 'artist', 'material', 'period', 'condition'],
        keywords: ['auktion', 'säljes', 'samlarobjekt', 'antik', 'vintage'],
        seoWeight: { title: 0.4, description: 0.3, keywords: 0.3 }
      },
      marketplace: {
        priority: ['category', 'brand', 'condition', 'size', 'color'],
        keywords: ['köpes', 'säljes', 'begagnat', 'nytt', 'rea'],
        seoWeight: { title: 0.5, description: 0.25, keywords: 0.25 }
      },
      catalog: {
        priority: ['classification', 'period', 'style', 'provenance'],
        keywords: ['katalog', 'beskrivning', 'historik', 'dokumentation'],
        seoWeight: { title: 0.3, description: 0.5, keywords: 0.2 }
      },
      social: {
        priority: ['visual', 'story', 'emotion', 'trending'],
        keywords: ['inspiration', 'design', 'stil', 'trend', 'vackert'],
        seoWeight: { title: 0.6, description: 0.2, keywords: 0.2 }
      }
    };
    
    // Swedish keyword mappings and synonyms
    this.swedishKeywords = {
      materials: {
        'guld': ['guldsmycke', 'guldföremål', 'ädelmetall'],
        'silver': ['silverföremål', 'sterlingsilver', 'ädelmetall'],
        'trä': ['träföremål', 'träarbete', 'snickeri'],
        'glas': ['glasföremål', 'kristall', 'glaskonst'],
        'keramik': ['keramikföremål', 'lergods', 'porslin'],
        'textil': ['tyg', 'textilier', 'väv']
      },
      periods: {
        'antik': ['antikvitet', 'gammalt', 'historiskt', 'vintage'],
        'vintage': ['retro', 'klassiskt', '1900-tal', 'nostalgi'],
        'modern': ['samtida', 'nutida', 'contemporary'],
        'klassisk': ['traditionell', 'tidlös', 'elegant']
      },
      conditions: {
        'nytt': ['oanvänt', 'mint', 'perfekt'],
        'mycket bra': ['utmärkt', 'fint', 'välbevarat'],
        'bra': ['bra skick', 'använt', 'normalt slitage'],
        'begagnat': ['använt', 'slitet', 'renovering']
      },
      categories: {
        'konst': ['målning', 'tavla', 'skulptur', 'grafik'],
        'smycken': ['ring', 'halsband', 'armband', 'örhängen'],
        'möbler': ['stol', 'bord', 'skåp', 'inredning'],
        'böcker': ['bok', 'litteratur', 'antikvarisk']
      }
    };
    
    // SEO optimization rules
    this.seoRules = {
      titleOptimization: {
        maxLength: 60,
        minLength: 30,
        includeKeywords: true,
        avoidStopWords: ['och', 'eller', 'med', 'för', 'till', 'av', 'på']
      },
      descriptionOptimization: {
        maxLength: 160,
        minLength: 120,
        keywordDensity: 0.02, // 2%
        includeCallToAction: true
      },
      keywordOptimization: {
        maxKeywords: 10,
        minKeywords: 5,
        longTailRatio: 0.3, // 30% long-tail keywords
        localKeywords: true
      }
    };
    
    // Statistics tracking
    this.stats = {
      keywordGenerations: 0,
      searchTermOptimizations: 0,
      seoOptimizations: 0,
      relatedTermsGenerated: 0,
      cacheHits: 0,
      cacheMisses: 0,
      strategyUsage: {
        auction: 0,
        marketplace: 0,
        catalog: 0,
        social: 0
      },
      performanceMetrics: {
        avgKeywordCount: 0,
        avgSearchTermLength: 0,
        seoScoreDistribution: {
          excellent: 0, // > 90
          good: 0,      // 70-90
          fair: 0,      // 50-70
          poor: 0       // < 50
        }
      }
    };
  }

  /**
   * Generate optimized keywords from item data
   * @param {Object} itemData - Item data to extract keywords from
   * @param {Object} options - Keyword generation options
   * @returns {Promise<Object>} Generated keywords with relevance scores
   */
  async generateKeywords(itemData, options = {}) {
    try {
      this.stats.keywordGenerations++;
      
      // Validate input
      const validation = this._validateItemData(itemData);
      if (!validation.isValid) {
        throw new Error(`Invalid item data: ${validation.errors.join(', ')}`);
      }
      
      // Check cache first
      const cacheKey = this._generateKeywordCacheKey(itemData, options);
      if (this.keywordCache.has(cacheKey) && !options.skipCache) {
        this.stats.cacheHits++;
        return this.keywordCache.get(cacheKey);
      }
      
      this.stats.cacheMisses++;
      
      // Extract basic keywords using pattern matching
      const basicKeywords = this._extractBasicKeywords(itemData);
      
      // Generate AI-enhanced keywords
      const aiKeywords = await this._generateAIKeywords(itemData, options);
      
      // Combine and optimize keywords
      const optimizedKeywords = this._optimizeKeywords(basicKeywords, aiKeywords, options);
      
      // Generate related terms and synonyms
      const relatedTerms = this._generateRelatedTerms(optimizedKeywords, itemData);
      
      // Create final keyword result
      const keywordResult = {
        primary: optimizedKeywords.primary,
        secondary: optimizedKeywords.secondary,
        longTail: optimizedKeywords.longTail,
        related: relatedTerms,
        seoScore: this._calculateSEOScore(optimizedKeywords),
        confidence: optimizedKeywords.confidence || 0.8,
        metadata: {
          timestamp: new Date().toISOString(),
          strategy: options.strategy || 'general',
          totalKeywords: optimizedKeywords.primary.length + optimizedKeywords.secondary.length,
          cacheKey
        }
      };
      
      // Update statistics
      this._updateKeywordStats(keywordResult);
      
      // Cache successful results
      if (keywordResult.confidence > 0.6) {
        this.keywordCache.set(cacheKey, keywordResult);
      }
      
      return keywordResult;
      
    } catch (error) {
      console.error('❌ Keyword generation failed:', error);
      
      return {
        primary: [],
        secondary: [],
        longTail: [],
        related: [],
        seoScore: 0,
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
   * Optimize search terms for specific platforms
   * @param {Object} itemData - Item data to optimize
   * @param {string} platform - Target platform ('auction', 'marketplace', 'catalog', 'social')
   * @param {Object} options - Optimization options
   * @returns {Promise<Object>} Optimized search terms
   */
  async optimizeSearchTerms(itemData, platform = 'auction', options = {}) {
    try {
      this.stats.searchTermOptimizations++;
      this.stats.strategyUsage[platform]++;
      
      // Check cache first
      const cacheKey = this._generateSearchTermCacheKey(itemData, platform, options);
      if (this.searchTermCache.has(cacheKey) && !options.skipCache) {
        this.stats.cacheHits++;
        return this.searchTermCache.get(cacheKey);
      }
      
      this.stats.cacheMisses++;
      
      // Get platform strategy
      const strategy = this.searchStrategies[platform] || this.searchStrategies.auction;
      
      // Generate keywords first
      const keywords = await this.generateKeywords(itemData, { 
        ...options, 
        strategy: platform 
      });
      
      // Get AI-optimized search terms
      const aiOptimization = await this._performAISearchOptimization(itemData, platform, options);
      
      // Create platform-specific search terms
      const searchTerms = this._createPlatformSearchTerms(keywords, aiOptimization, strategy, options);
      
      // Cache result
      if (searchTerms.confidence > 0.6) {
        this.searchTermCache.set(cacheKey, searchTerms);
      }
      
      return searchTerms;
      
    } catch (error) {
      console.error('❌ Search term optimization failed:', error);
      
      return {
        primary: [],
        variations: [],
        platform: platform,
        confidence: 0,
        seoScore: 0,
        error: error.message,
        metadata: {
          timestamp: new Date().toISOString(),
          failed: true
        }
      };
    }
  }

  /**
   * Perform comprehensive SEO optimization
   * @param {Object} itemData - Item data to optimize
   * @param {Object} options - SEO optimization options
   * @returns {Promise<Object>} SEO optimization results
   */
  async optimizeSEO(itemData, options = {}) {
    try {
      this.stats.seoOptimizations++;
      
      // Check cache first
      const cacheKey = this._generateSEOCacheKey(itemData, options);
      if (this.seoCache.has(cacheKey) && !options.skipCache) {
        this.stats.cacheHits++;
        return this.seoCache.get(cacheKey);
      }
      
      this.stats.cacheMisses++;
      
      // Generate keywords for SEO
      const keywords = await this.generateKeywords(itemData, options);
      
      // Get AI SEO recommendations
      const aiSEO = await this._performAISEOOptimization(itemData, keywords, options);
      
      // Optimize title
      const optimizedTitle = this._optimizeTitle(itemData.title, keywords, options);
      
      // Optimize description
      const optimizedDescription = this._optimizeDescription(itemData.description, keywords, options);
      
      // Generate meta tags
      const metaTags = this._generateMetaTags(optimizedTitle, optimizedDescription, keywords);
      
      // Calculate overall SEO score
      const seoScore = this._calculateOverallSEOScore(optimizedTitle, optimizedDescription, keywords);
      
      // Create SEO result
      const seoResult = {
        title: optimizedTitle,
        description: optimizedDescription,
        keywords: keywords.primary.concat(keywords.secondary),
        metaTags: metaTags,
        seoScore: seoScore,
        recommendations: aiSEO.recommendations || [],
        improvements: this._generateSEOImprovements(seoScore, optimizedTitle, optimizedDescription),
        confidence: Math.min(keywords.confidence, aiSEO.confidence || 0.8),
        metadata: {
          timestamp: new Date().toISOString(),
          originalTitle: itemData.title,
          originalDescription: itemData.description,
          cacheKey
        }
      };
      
      // Update SEO statistics
      this._updateSEOStats(seoResult);
      
      // Cache result
      if (seoResult.confidence > 0.6) {
        this.seoCache.set(cacheKey, seoResult);
      }
      
      return seoResult;
      
    } catch (error) {
      console.error('❌ SEO optimization failed:', error);
      
      return {
        title: itemData.title || '',
        description: itemData.description || '',
        keywords: [],
        metaTags: {},
        seoScore: 0,
        recommendations: [],
        improvements: [],
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
   * Generate related terms and synonyms
   * @param {Object} itemData - Item data for context
   * @param {Object} options - Related terms options
   * @returns {Promise<Object>} Related terms and synonyms
   */
  async generateRelatedTerms(itemData, options = {}) {
    try {
      this.stats.relatedTermsGenerated++;
      
      // Check cache first
      const cacheKey = this._generateRelatedTermsCacheKey(itemData, options);
      if (this.relatedTermsCache.has(cacheKey) && !options.skipCache) {
        this.stats.cacheHits++;
        return this.relatedTermsCache.get(cacheKey);
      }
      
      this.stats.cacheMisses++;
      
      // Generate base keywords
      const keywords = await this.generateKeywords(itemData, options);
      
      // Get AI-generated related terms
      const aiRelated = await this._generateAIRelatedTerms(itemData, keywords, options);
      
      // Generate Swedish synonyms and variations
      const swedishTerms = this._generateSwedishSynonyms(keywords, itemData);
      
      // Combine and organize related terms
      const relatedTerms = {
        synonyms: [...new Set([...aiRelated.synonyms || [], ...swedishTerms.synonyms])],
        variations: [...new Set([...aiRelated.variations || [], ...swedishTerms.variations])],
        related: [...new Set([...aiRelated.related || [], ...swedishTerms.related])],
        trending: aiRelated.trending || [],
        confidence: Math.min(keywords.confidence, aiRelated.confidence || 0.7),
        metadata: {
          timestamp: new Date().toISOString(),
          baseKeywords: keywords.primary.length,
          totalRelated: 0,
          cacheKey
        }
      };
      
      // Calculate total related terms
      relatedTerms.metadata.totalRelated = 
        relatedTerms.synonyms.length + 
        relatedTerms.variations.length + 
        relatedTerms.related.length;
      
      // Cache result
      if (relatedTerms.confidence > 0.6) {
        this.relatedTermsCache.set(cacheKey, relatedTerms);
      }
      
      return relatedTerms;
      
    } catch (error) {
      console.error('❌ Related terms generation failed:', error);
      
      return {
        synonyms: [],
        variations: [],
        related: [],
        trending: [],
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
   * Extract basic keywords using pattern matching
   * @private
   */
  _extractBasicKeywords(itemData) {
    const text = `${itemData.title || ''} ${itemData.description || ''}`.toLowerCase();
    const keywords = {
      primary: [],
      secondary: [],
      confidence: 0.7
    };
    
    // Extract material keywords
    for (const [material, synonyms] of Object.entries(this.swedishKeywords.materials)) {
      if (text.includes(material)) {
        keywords.primary.push(material);
        keywords.secondary.push(...synonyms.slice(0, 2));
      }
    }
    
    // Extract period keywords
    for (const [period, synonyms] of Object.entries(this.swedishKeywords.periods)) {
      if (text.includes(period)) {
        keywords.primary.push(period);
        keywords.secondary.push(...synonyms.slice(0, 2));
      }
    }
    
    // Extract category keywords
    for (const [category, synonyms] of Object.entries(this.swedishKeywords.categories)) {
      if (text.includes(category)) {
        keywords.primary.push(category);
        keywords.secondary.push(...synonyms.slice(0, 2));
      }
    }
    
    // Extract brand/artist if present
    if (itemData.artist && itemData.artist.trim()) {
      keywords.primary.push(itemData.artist.trim());
    }
    
    // Extract category if present
    if (itemData.category && itemData.category.trim()) {
      keywords.primary.push(itemData.category.toLowerCase());
    }
    
    // Remove duplicates
    keywords.primary = [...new Set(keywords.primary)];
    keywords.secondary = [...new Set(keywords.secondary)];
    
    return keywords;
  }

  /**
   * Generate AI-enhanced keywords
   * @private
   */
  async _generateAIKeywords(itemData, options = {}) {
    // Get appropriate model for keyword generation
    const model = this.modelManager.getModelConfig('keyword-generation');
    
    // Generate keyword prompt
    const prompt = this.promptManager.getUserPrompt(itemData, 'keyword-generation', {
      maxKeywords: options.maxKeywords || 10,
      includeSwedish: options.includeSwedish !== false,
      strategy: options.strategy || 'general',
      ...options
    });
    
    // Make API call
    const response = await this.apiManager.callClaudeAPI(itemData, 'keyword-generation');
    
    // Parse keyword response
    const parsedResult = this.responseParser.parseResponse(response, 'keyword-generation', {
      itemData,
      model: model.id
    }) || {};
    
    return {
      primary: parsedResult.primaryKeywords || [],
      secondary: parsedResult.secondaryKeywords || [],
      longTail: parsedResult.longTailKeywords || [],
      confidence: parsedResult.confidence || 0.7
    };
  }

  /**
   * Optimize keywords combination
   * @private
   */
  _optimizeKeywords(basicKeywords, aiKeywords, options = {}) {
    const maxPrimary = options.maxPrimary || 5;
    const maxSecondary = options.maxSecondary || 8;
    const maxLongTail = options.maxLongTail || 3;
    
    // Combine and deduplicate primary keywords
    const allPrimary = [...new Set([...basicKeywords.primary, ...aiKeywords.primary])];
    const primary = allPrimary.slice(0, maxPrimary);
    
    // Combine and deduplicate secondary keywords
    const allSecondary = [...new Set([...basicKeywords.secondary, ...aiKeywords.secondary])];
    const secondary = allSecondary.filter(k => !primary.includes(k)).slice(0, maxSecondary);
    
    // Use AI long-tail keywords
    const longTail = aiKeywords.longTail.slice(0, maxLongTail);
    
    return {
      primary,
      secondary,
      longTail,
      confidence: Math.max(basicKeywords.confidence, aiKeywords.confidence)
    };
  }

  /**
   * Generate related terms from keywords
   * @private
   */
  _generateRelatedTerms(keywords, itemData) {
    const related = [];
    
    // Generate related terms for each primary keyword
    for (const keyword of keywords.primary) {
      // Find synonyms in Swedish mappings
      for (const [category, mapping] of Object.entries(this.swedishKeywords)) {
        if (mapping[keyword]) {
          related.push(...mapping[keyword]);
        }
      }
    }
    
    return [...new Set(related)];
  }

  /**
   * Perform AI search optimization
   * @private
   */
  async _performAISearchOptimization(itemData, platform, options = {}) {
    const model = this.modelManager.getModelConfig('search-optimization');
    
    const prompt = this.promptManager.getUserPrompt(itemData, 'search-optimization', {
      platform: platform,
      strategy: this.searchStrategies[platform],
      ...options
    });
    
    const response = await this.apiManager.callClaudeAPI(itemData, 'search-optimization');
    
    const parsedResult = this.responseParser.parseResponse(response, 'search-optimization', {
      itemData,
      platform,
      model: model.id
    }) || {};
    
    return {
      searchTerms: parsedResult.searchTerms || [],
      variations: parsedResult.variations || [],
      confidence: parsedResult.confidence || 0.7
    };
  }

  /**
   * Create platform-specific search terms
   * @private
   */
  _createPlatformSearchTerms(keywords, aiOptimization, strategy, options = {}) {
    const primary = [];
    const variations = [];
    
    // Add AI-optimized terms
    primary.push(...aiOptimization.searchTerms.slice(0, 5));
    variations.push(...aiOptimization.variations.slice(0, 10));
    
    // Add keyword-based terms
    for (const keyword of keywords.primary) {
      primary.push(keyword);
      
      // Add platform-specific variations
      for (const platformKeyword of strategy.keywords) {
        variations.push(`${keyword} ${platformKeyword}`);
      }
    }
    
    return {
      primary: [...new Set(primary)],
      variations: [...new Set(variations)],
      platform: strategy,
      confidence: Math.min(keywords.confidence, aiOptimization.confidence),
      seoScore: this._calculateSEOScore(keywords),
      metadata: {
        timestamp: new Date().toISOString(),
        totalTerms: primary.length + variations.length
      }
    };
  }

  /**
   * Perform AI SEO optimization
   * @private
   */
  async _performAISEOOptimization(itemData, keywords, options = {}) {
    const model = this.modelManager.getModelConfig('seo-optimization');
    
    const prompt = this.promptManager.getUserPrompt(itemData, 'seo-optimization', {
      keywords: keywords.primary,
      rules: this.seoRules,
      ...options
    });
    
    const response = await this.apiManager.callClaudeAPI(itemData, 'seo-optimization');
    
    const parsedResult = this.responseParser.parseResponse(response, 'seo-optimization', {
      itemData,
      model: model.id
    }) || {};
    
    return {
      optimizedTitle: parsedResult.optimizedTitle || '',
      optimizedDescription: parsedResult.optimizedDescription || '',
      recommendations: parsedResult.recommendations || [],
      confidence: parsedResult.confidence || 0.7
    };
  }

  /**
   * Optimize title for SEO
   * @private
   */
  _optimizeTitle(title, keywords, options = {}) {
    if (!title) return '';
    
    const rules = this.seoRules.titleOptimization;
    let optimized = title;
    
    // Ensure primary keyword is included
    if (keywords.primary.length > 0 && !title.toLowerCase().includes(keywords.primary[0].toLowerCase())) {
      optimized = `${keywords.primary[0]} - ${title}`;
    }
    
    // Trim to max length
    if (optimized.length > rules.maxLength) {
      optimized = optimized.substring(0, rules.maxLength - 3) + '...';
    }
    
    return optimized;
  }

  /**
   * Optimize description for SEO
   * @private
   */
  _optimizeDescription(description, keywords, options = {}) {
    if (!description) return '';
    
    const rules = this.seoRules.descriptionOptimization;
    let optimized = description;
    
    // Add keywords if missing
    for (const keyword of keywords.primary.slice(0, 3)) {
      if (!optimized.toLowerCase().includes(keyword.toLowerCase())) {
        optimized += ` ${keyword}`;
      }
    }
    
    // Trim to max length
    if (optimized.length > rules.maxLength) {
      optimized = optimized.substring(0, rules.maxLength - 3) + '...';
    }
    
    return optimized;
  }

  /**
   * Generate meta tags
   * @private
   */
  _generateMetaTags(title, description, keywords) {
    // Ensure keywords is an array
    const keywordArray = Array.isArray(keywords) ? keywords : [];
    
    return {
      title: title,
      description: description,
      keywords: keywordArray.slice(0, 10).join(', '),
      'og:title': title,
      'og:description': description,
      'twitter:title': title,
      'twitter:description': description
    };
  }

  /**
   * Calculate SEO score
   * @private
   */
  _calculateSEOScore(keywords) {
    let score = 0;
    
    // Keyword count score (0-30 points)
    const keywordCount = keywords.primary.length + keywords.secondary.length;
    score += Math.min(keywordCount * 3, 30);
    
    // Long-tail keyword bonus (0-20 points)
    if (keywords.longTail && keywords.longTail.length > 0) {
      score += Math.min(keywords.longTail.length * 10, 20);
    }
    
    // Confidence bonus (0-50 points)
    score += (keywords.confidence || 0.5) * 50;
    
    return Math.min(score, 100);
  }

  /**
   * Calculate overall SEO score
   * @private
   */
  _calculateOverallSEOScore(title, description, keywords) {
    let score = 0;
    
    // Title optimization (0-30 points)
    if (title && title.length >= 30 && title.length <= 60) {
      score += 20;
      if (keywords.primary.length > 0 && title.toLowerCase().includes(keywords.primary[0].toLowerCase())) {
        score += 10;
      }
    }
    
    // Description optimization (0-30 points)
    if (description && description.length >= 120 && description.length <= 160) {
      score += 20;
      const keywordMatches = keywords.primary.filter(k => 
        description.toLowerCase().includes(k.toLowerCase())
      ).length;
      score += Math.min(keywordMatches * 5, 10);
    }
    
    // Keyword optimization (0-40 points)
    score += this._calculateSEOScore(keywords) * 0.4;
    
    return Math.min(score, 100);
  }

  /**
   * Generate SEO improvements
   * @private
   */
  _generateSEOImprovements(seoScore, title, description) {
    const improvements = [];
    
    if (seoScore < 50) {
      improvements.push('Lägg till fler relevanta nyckelord');
      improvements.push('Optimera titel och beskrivning längd');
    }
    
    if (title.length < 30) {
      improvements.push('Förläng titeln för bättre SEO');
    }
    
    if (description.length < 120) {
      improvements.push('Förläng beskrivningen för bättre SEO');
    }
    
    return improvements;
  }

  /**
   * Generate AI-related terms
   * @private
   */
  async _generateAIRelatedTerms(itemData, keywords, options = {}) {
    const model = this.modelManager.getModelConfig('related-terms');
    
    const prompt = this.promptManager.getUserPrompt(itemData, 'related-terms', {
      baseKeywords: keywords.primary,
      includeSwedish: true,
      ...options
    });
    
    const response = await this.apiManager.callClaudeAPI(itemData, 'related-terms');
    
    const parsedResult = this.responseParser.parseResponse(response, 'related-terms', {
      itemData,
      model: model.id
    }) || {};
    
    return {
      synonyms: parsedResult.synonyms || [],
      variations: parsedResult.variations || [],
      related: parsedResult.related || [],
      trending: parsedResult.trending || [],
      confidence: parsedResult.confidence || 0.7
    };
  }

  /**
   * Generate Swedish synonyms
   * @private
   */
  _generateSwedishSynonyms(keywords, itemData) {
    const synonyms = [];
    const variations = [];
    const related = [];
    
    for (const keyword of keywords.primary) {
      // Find in Swedish mappings
      for (const [category, mapping] of Object.entries(this.swedishKeywords)) {
        if (mapping[keyword]) {
          synonyms.push(...mapping[keyword]);
        }
        
        // Find reverse mappings
        for (const [key, values] of Object.entries(mapping)) {
          if (values.includes(keyword)) {
            related.push(key);
          }
        }
      }
    }
    
    return {
      synonyms: [...new Set(synonyms)],
      variations: [...new Set(variations)],
      related: [...new Set(related)]
    };
  }

  /**
   * Update statistics
   * @private
   */
  _updateKeywordStats(keywordResult) {
    const totalKeywords = keywordResult.primary.length + keywordResult.secondary.length;
    this.stats.performanceMetrics.avgKeywordCount = 
      (this.stats.performanceMetrics.avgKeywordCount + totalKeywords) / 2;
  }

  _updateSEOStats(seoResult) {
    const score = seoResult.seoScore;
    if (score > 90) {
      this.stats.performanceMetrics.seoScoreDistribution.excellent++;
    } else if (score > 70) {
      this.stats.performanceMetrics.seoScoreDistribution.good++;
    } else if (score > 50) {
      this.stats.performanceMetrics.seoScoreDistribution.fair++;
    } else {
      this.stats.performanceMetrics.seoScoreDistribution.poor++;
    }
  }

  /**
   * Validate item data
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
  _generateKeywordCacheKey(itemData, options) {
    const keyData = {
      title: itemData.title || '',
      description: itemData.description || '',
      category: itemData.category || '',
      strategy: options.strategy || 'general'
    };
    
    return `keywords:${JSON.stringify(keyData)}`;
  }

  _generateSearchTermCacheKey(itemData, platform, options) {
    const keyData = {
      title: itemData.title || '',
      description: itemData.description || '',
      platform: platform,
      maxTerms: options.maxTerms || 10
    };
    
    return `search:${JSON.stringify(keyData)}`;
  }

  _generateSEOCacheKey(itemData, options) {
    const keyData = {
      title: itemData.title || '',
      description: itemData.description || '',
      seoLevel: options.seoLevel || 'standard'
    };
    
    return `seo:${JSON.stringify(keyData)}`;
  }

  _generateRelatedTermsCacheKey(itemData, options) {
    const keyData = {
      title: itemData.title || '',
      category: itemData.category || '',
      maxTerms: options.maxTerms || 20
    };
    
    return `related:${JSON.stringify(keyData)}`;
  }

  /**
   * Clear caches
   * @param {string} [type] - Cache type to clear ('keyword', 'search', 'seo', 'related', or 'all')
   */
  clearCache(type = 'all') {
    if (type === 'all' || type === 'keyword') {
      this.keywordCache.clear();
    }
    
    if (type === 'all' || type === 'search') {
      this.searchTermCache.clear();
    }
    
    if (type === 'all' || type === 'seo') {
      this.seoCache.clear();
    }
    
    if (type === 'all' || type === 'related') {
      this.relatedTermsCache.clear();
    }
    
    console.log(`🧹 Search Optimizer: ${type} cache cleared`);
  }

  /**
   * Get search strategies
   * @returns {Object} Available search strategies
   */
  getSearchStrategies() {
    return this.searchStrategies;
  }

  /**
   * Get Swedish keyword mappings
   * @returns {Object} Swedish keyword mappings and synonyms
   */
  getSwedishKeywords() {
    return this.swedishKeywords;
  }

  /**
   * Get SEO rules
   * @returns {Object} SEO optimization rules
   */
  getSEORules() {
    return this.seoRules;
  }

  /**
   * Get service statistics
   * @returns {Object} Service statistics and performance data
   */
  getStats() {
    const totalRequests = this.stats.keywordGenerations + 
                         this.stats.searchTermOptimizations + 
                         this.stats.seoOptimizations + 
                         this.stats.relatedTermsGenerated;
    const hitRate = totalRequests > 0 
      ? ((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100).toFixed(1)
      : 0;
    
    return {
      ...this.stats,
      totalRequests,
      cacheHitRate: `${hitRate}%`,
      cacheSize: {
        keyword: this.keywordCache.size,
        search: this.searchTermCache.size,
        seo: this.seoCache.size,
        related: this.relatedTermsCache.size
      }
    };
  }

  /**
   * Get service status and capabilities
   * @returns {Object} Service status information
   */
  getStatus() {
    return {
      service: 'SearchOptimizer',
      version: '1.0.0',
      capabilities: {
        keywordGeneration: true,
        searchTermOptimization: true,
        seoOptimization: true,
        relatedTermsGeneration: true,
        platformSpecificOptimization: true,
        swedishLanguageSupport: true,
        multiLevelCaching: true,
        performanceAnalytics: true
      },
      dependencies: {
        modelManager: this.modelManager.getModelConfig ? { ready: true } : { ready: false },
        responseParser: this.responseParser.parseResponse ? { ready: true } : { ready: false },
        promptManager: this.promptManager.getUserPrompt ? { ready: true } : { ready: false }
      },
      searchStrategies: {
        available: Object.keys(this.searchStrategies),
        total: Object.keys(this.searchStrategies).length
      },
      swedishKeywords: {
        categories: Object.keys(this.swedishKeywords).length,
        totalMappings: Object.values(this.swedishKeywords)
          .reduce((sum, cat) => sum + Object.keys(cat).length, 0)
      },
      statistics: this.getStats(),
      ready: true
    };
  }
} 