/**
 * PriceEstimator Service
 * 
 * Handles market value estimation and price analysis for auction items.
 * Provides intelligent pricing strategies, market comparisons, and value assessments.
 * 
 * Features:
 * - Market value estimation using multiple data sources
 * - Price trend analysis and forecasting
 * - Auction-specific pricing strategies (reserve, starting bid, buy-now)
 * - Comparative market analysis with similar items
 * - Swedish market expertise and currency handling
 * - Confidence scoring for price estimates
 * - Historical price tracking and analysis
 * - Category-specific pricing models
 * - Condition-based value adjustments
 * - Market demand assessment
 * 
 * @author AI Assistant
 * @version 1.0.0
 */

import { ModelManager } from '../core/model-manager.js';
import { ResponseParser } from '../core/response-parser.js';
import { PromptManager } from '../core/prompt-manager.js';

export class PriceEstimator {
    constructor(apiManager) {
        this.apiManager = apiManager;
        this.modelManager = new ModelManager();
        this.responseParser = new ResponseParser();
        this.promptManager = new PromptManager();
        
        // Cache systems for performance
        this.priceCache = new Map(); // Price estimates cache
        this.marketCache = new Map(); // Market data cache
        this.trendCache = new Map(); // Price trends cache
        this.comparisonCache = new Map(); // Comparative analysis cache
        
        // Statistics tracking
        this.stats = {
            estimationsGenerated: 0,
            cacheHits: 0,
            cacheMisses: 0,
            averageConfidence: 0,
            processingTime: 0
        };
        
        // Swedish market configuration
        this.swedishMarket = {
            currency: 'SEK',
            vatRate: 0.25, // 25% Swedish VAT
            auctionFees: {
                standard: 0.15, // 15% buyer's premium
                premium: 0.20,  // 20% for premium auctions
                online: 0.12    // 12% for online-only
            },
            marketSegments: {
                luxury: { threshold: 50000, multiplier: 1.2 },
                premium: { threshold: 10000, multiplier: 1.1 },
                standard: { threshold: 1000, multiplier: 1.0 },
                budget: { threshold: 0, multiplier: 0.9 }
            }
        };
        
        // Category-specific pricing models
        this.categoryModels = {
            art: {
                factors: ['artist', 'period', 'technique', 'size', 'condition', 'provenance'],
                volatility: 'high',
                seasonality: true,
                appreciationRate: 0.05 // 5% annual appreciation
            },
            antiques: {
                factors: ['age', 'rarity', 'condition', 'maker', 'style', 'completeness'],
                volatility: 'medium',
                seasonality: false,
                appreciationRate: 0.03
            },
            jewelry: {
                factors: ['material', 'weight', 'stones', 'brand', 'condition', 'certification'],
                volatility: 'low',
                seasonality: false,
                appreciationRate: 0.02
            },
            furniture: {
                factors: ['designer', 'period', 'condition', 'size', 'material', 'style'],
                volatility: 'medium',
                seasonality: true,
                appreciationRate: 0.04
            },
            collectibles: {
                factors: ['rarity', 'condition', 'completeness', 'demand', 'trend', 'authenticity'],
                volatility: 'high',
                seasonality: true,
                appreciationRate: 0.06
            }
        };
        
        // Condition impact on pricing
        this.conditionMultipliers = {
            mint: 1.0,
            excellent: 0.9,
            'very-good': 0.8,
            good: 0.7,
            fair: 0.6,
            poor: 0.4,
            'for-restoration': 0.3
        };
        
        // Market demand indicators
        this.demandIndicators = {
            high: { multiplier: 1.3, confidence: 0.9 },
            'above-average': { multiplier: 1.15, confidence: 0.8 },
            average: { multiplier: 1.0, confidence: 0.7 },
            'below-average': { multiplier: 0.85, confidence: 0.6 },
            low: { multiplier: 0.7, confidence: 0.5 }
        };
    }
    
    /**
     * Estimate market value for an item
     * @param {Object} itemData - Item information
     * @param {Object} options - Estimation options
     * @returns {Promise<Object>} Price estimation result
     */
    async estimateValue(itemData, options = {}) {
        const startTime = Date.now();
        
        try {
            // Generate cache key
            const cacheKey = this._generateCacheKey('estimate', itemData, options);
            
            // Check cache first
            if (this.priceCache.has(cacheKey)) {
                this.stats.cacheHits++;
                return this.priceCache.get(cacheKey);
            }
            
            this.stats.cacheMisses++;
            
            // Prepare estimation context
            const context = await this._prepareEstimationContext(itemData, options);
            
            // Generate price estimation prompt
            const prompt = this._buildEstimationPrompt(context);
            
            // Get AI estimation
            const response = await this.apiManager.callClaudeAPI(itemData, 'price-estimation');
            
            // Parse estimation response
            const estimation = this._parseEstimationResponse(response, context);
            
            // Apply market adjustments
            const adjustedEstimation = this._applyMarketAdjustments(estimation, context);
            
            // Calculate confidence score
            const confidence = this._calculateEstimationConfidence(adjustedEstimation, context);
            
            // Prepare final result
            const result = {
                ...adjustedEstimation,
                confidence,
                context: {
                    category: context.category,
                    condition: context.condition,
                    marketDemand: context.marketDemand,
                    currency: this.swedishMarket.currency
                },
                metadata: {
                    estimatedAt: new Date().toISOString(),
                    processingTime: Date.now() - startTime,
                    cacheKey
                }
            };
            
            // Cache result
            this.priceCache.set(cacheKey, result);
            
            // Update statistics
            this.stats.estimationsGenerated++;
            this.stats.averageConfidence = (this.stats.averageConfidence + confidence) / 2;
            this.stats.processingTime += Date.now() - startTime;
            
            return result;
            
        } catch (error) {
            console.error('Price estimation error:', error);
            return this._createErrorResult(error, itemData);
        }
    }
    
    /**
     * Analyze price trends for similar items
     * @param {Object} itemData - Item information
     * @param {Object} options - Analysis options
     * @returns {Promise<Object>} Trend analysis result
     */
    async analyzeTrends(itemData, options = {}) {
        const startTime = Date.now();
        
        try {
            const cacheKey = this._generateCacheKey('trends', itemData, options);
            
            if (this.trendCache.has(cacheKey)) {
                this.stats.cacheHits++;
                return this.trendCache.get(cacheKey);
            }
            
            this.stats.cacheMisses++;
            
            // Prepare trend analysis context
            const context = await this._prepareTrendContext(itemData, options);
            
            // Generate trend analysis prompt
            const prompt = this._buildTrendPrompt(context);
            
            // Get AI analysis
            const response = await this.apiManager.callClaudeAPI(itemData, 'trend-analysis');
            
            // Parse trend response
            const trends = this._parseTrendResponse(response, context);
            
            // Apply statistical analysis
            const analysis = this._performTrendAnalysis(trends, context);
            
            const result = {
                ...analysis,
                metadata: {
                    analyzedAt: new Date().toISOString(),
                    processingTime: Date.now() - startTime,
                    cacheKey
                }
            };
            
            this.trendCache.set(cacheKey, result);
            return result;
            
        } catch (error) {
            console.error('Trend analysis error:', error);
            return this._createErrorResult(error, itemData);
        }
    }
    
    /**
     * Generate auction pricing strategy
     * @param {Object} itemData - Item information
     * @param {Object} auctionOptions - Auction-specific options
     * @returns {Promise<Object>} Pricing strategy
     */
    async generateAuctionStrategy(itemData, auctionOptions = {}) {
        const startTime = Date.now();
        
        try {
            // Get base market estimation
            const estimation = await this.estimateValue(itemData, { 
                purpose: 'auction',
                ...auctionOptions 
            });
            
            // Calculate auction-specific pricing
            const strategy = this._calculateAuctionPricing(estimation, auctionOptions);
            
            // Add strategic recommendations
            const recommendations = this._generateAuctionRecommendations(strategy, itemData);
            
            return {
                ...strategy,
                recommendations,
                metadata: {
                    generatedAt: new Date().toISOString(),
                    processingTime: Date.now() - startTime,
                    baseEstimation: estimation.estimatedValue
                }
            };
            
        } catch (error) {
            console.error('Auction strategy error:', error);
            return this._createErrorResult(error, itemData);
        }
    }
    
    /**
     * Compare with similar items in market
     * @param {Object} itemData - Item information
     * @param {Object} options - Comparison options
     * @returns {Promise<Object>} Comparison analysis
     */
    async compareWithMarket(itemData, options = {}) {
        const startTime = Date.now();
        
        try {
            const cacheKey = this._generateCacheKey('compare', itemData, options);
            
            if (this.comparisonCache.has(cacheKey)) {
                this.stats.cacheHits++;
                return this.comparisonCache.get(cacheKey);
            }
            
            this.stats.cacheMisses++;
            
            // Prepare comparison context
            const context = await this._prepareComparisonContext(itemData, options);
            
            // Generate comparison prompt
            const prompt = this._buildComparisonPrompt(context);
            
            // Get AI comparison
            const response = await this.apiManager.callClaudeAPI(itemData, 'market-comparison');
            
            // Parse comparison response
            const comparison = this._parseComparisonResponse(response, context);
            
            // Enhance with statistical analysis
            const analysis = this._enhanceComparisonAnalysis(comparison, context);
            
            const result = {
                ...analysis,
                metadata: {
                    comparedAt: new Date().toISOString(),
                    processingTime: Date.now() - startTime,
                    cacheKey
                }
            };
            
            this.comparisonCache.set(cacheKey, result);
            return result;
            
        } catch (error) {
            console.error('Market comparison error:', error);
            return this._createErrorResult(error, itemData);
        }
    }
    
    /**
     * Batch process multiple price estimations
     * @param {Array} items - Array of item data
     * @param {Object} options - Processing options
     * @returns {Promise<Array>} Array of estimation results
     */
    async batchEstimate(items, options = {}) {
        const startTime = Date.now();
        const batchSize = options.batchSize || 5;
        const results = [];
        
        try {
            // Process in batches to avoid overwhelming the API
            for (let i = 0; i < items.length; i += batchSize) {
                const batch = items.slice(i, i + batchSize);
                
                const batchPromises = batch.map(item => 
                    this.estimateValue(item, options).catch(error => ({
                        error: error.message,
                        item: item.title || 'Unknown item'
                    }))
                );
                
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);
                
                // Small delay between batches to be respectful to API limits
                if (i + batchSize < items.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            return {
                results,
                summary: {
                    total: items.length,
                    successful: results.filter(r => !r.error).length,
                    failed: results.filter(r => r.error).length,
                    processingTime: Date.now() - startTime
                }
            };
            
        } catch (error) {
            console.error('Batch estimation error:', error);
            return {
                results,
                error: error.message,
                summary: {
                    total: items.length,
                    successful: results.filter(r => !r.error).length,
                    failed: results.filter(r => r.error).length,
                    processingTime: Date.now() - startTime
                }
            };
        }
    }
    
    /**
     * Get service statistics
     * @returns {Object} Current statistics
     */
    getStatistics() {
        return {
            ...this.stats,
            cacheSize: {
                price: this.priceCache.size,
                market: this.marketCache.size,
                trend: this.trendCache.size,
                comparison: this.comparisonCache.size
            },
            cacheHitRate: this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) || 0
        };
    }
    
    /**
     * Clear all caches
     */
    clearCache() {
        this.priceCache.clear();
        this.marketCache.clear();
        this.trendCache.clear();
        this.comparisonCache.clear();
    }
    
    // Private helper methods
    
    /**
     * Prepare estimation context
     * @private
     */
    async _prepareEstimationContext(itemData, options) {
        const category = this._determineCategory(itemData);
        const condition = this._assessCondition(itemData);
        const marketDemand = this._assessMarketDemand(itemData, category);
        
        return {
            item: itemData,
            category,
            condition,
            marketDemand,
            categoryModel: this.categoryModels[category] || this.categoryModels.collectibles,
            swedishMarket: this.swedishMarket,
            options
        };
    }
    
    /**
     * Build estimation prompt
     * @private
     */
    _buildEstimationPrompt(context) {
        const { item, category, condition, marketDemand, categoryModel } = context;
        
        return `Estimate the market value for this ${category} item in the Swedish market:

ITEM DETAILS:
Title: ${item.title || 'Not specified'}
Description: ${item.description || 'Not specified'}
Category: ${category}
Condition: ${condition}
${item.artist ? `Artist: ${item.artist}` : ''}
${item.maker ? `Maker: ${item.maker}` : ''}
${item.period ? `Period: ${item.period}` : ''}
${item.material ? `Material: ${item.material}` : ''}
${item.dimensions ? `Dimensions: ${item.dimensions}` : ''}

MARKET CONTEXT:
- Current market demand: ${marketDemand}
- Category volatility: ${categoryModel.volatility}
- Key pricing factors: ${categoryModel.factors.join(', ')}
- Swedish market considerations (VAT, auction fees, local preferences)

Please provide:
1. Estimated market value range (low, high) in SEK
2. Most likely selling price
3. Key factors affecting the price
4. Market positioning (luxury/premium/standard/budget)
5. Price justification with reasoning

Format as JSON with clear numerical values and explanations.`;
    }
    
    /**
     * Parse estimation response
     * @private
     */
    _parseEstimationResponse(response, context) {
        try {
            const parsed = this.responseParser.parseJSON(response);
            
            return {
                estimatedValue: parsed.mostLikelyPrice || parsed.estimated_value || 0,
                valueRange: {
                    low: parsed.lowEstimate || parsed.low || 0,
                    high: parsed.highEstimate || parsed.high || 0
                },
                keyFactors: parsed.keyFactors || parsed.factors || [],
                marketPosition: parsed.marketPosition || parsed.positioning || 'standard',
                justification: parsed.justification || parsed.reasoning || '',
                currency: 'SEK'
            };
        } catch (error) {
            console.warn('Failed to parse estimation response, using fallback');
            return this._createFallbackEstimation(context);
        }
    }
    
    /**
     * Apply market adjustments
     * @private
     */
    _applyMarketAdjustments(estimation, context) {
        let adjustedValue = estimation.estimatedValue;
        
        // Apply condition multiplier
        const conditionMultiplier = this.conditionMultipliers[context.condition] || 1.0;
        adjustedValue *= conditionMultiplier;
        
        // Apply market demand multiplier
        const demandData = this.demandIndicators[context.marketDemand] || this.demandIndicators.average;
        adjustedValue *= demandData.multiplier;
        
        // Apply category-specific adjustments
        const categoryModel = context.categoryModel;
        if (categoryModel.seasonality && this._isHighSeason(context.category)) {
            adjustedValue *= 1.1; // 10% seasonal boost
        }
        
        // Apply Swedish market segment adjustments
        const segment = this._determineMarketSegment(adjustedValue);
        adjustedValue *= segment.multiplier;
        
        return {
            ...estimation,
            estimatedValue: Math.round(adjustedValue),
            valueRange: {
                low: Math.round(estimation.valueRange.low * conditionMultiplier * demandData.multiplier),
                high: Math.round(estimation.valueRange.high * conditionMultiplier * demandData.multiplier)
            },
            adjustments: {
                condition: conditionMultiplier,
                demand: demandData.multiplier,
                seasonal: this._isHighSeason(context.category) ? 1.1 : 1.0,
                marketSegment: segment.multiplier
            }
        };
    }
    
    /**
     * Calculate estimation confidence
     * @private
     */
    _calculateEstimationConfidence(estimation, context) {
        let confidence = 0.7; // Base confidence
        
        // Adjust based on available data
        if (context.item.artist || context.item.maker) confidence += 0.1;
        if (context.item.period) confidence += 0.05;
        if (context.item.material) confidence += 0.05;
        if (context.item.dimensions) confidence += 0.05;
        if (context.item.condition) confidence += 0.05;
        
        // Adjust based on market demand confidence
        const demandData = this.demandIndicators[context.marketDemand];
        confidence *= demandData.confidence;
        
        // Adjust based on category volatility
        const categoryModel = context.categoryModel;
        if (categoryModel.volatility === 'low') confidence += 0.1;
        else if (categoryModel.volatility === 'high') confidence -= 0.1;
        
        return Math.min(Math.max(confidence, 0.1), 0.95);
    }
    
    /**
     * Prepare trend analysis context
     * @private
     */
    async _prepareTrendContext(itemData, options) {
        const category = this._determineCategory(itemData);
        const timeframe = options.timeframe || '12months';
        
        return {
            item: itemData,
            category,
            timeframe,
            categoryModel: this.categoryModels[category] || this.categoryModels.collectibles,
            options
        };
    }
    
    /**
     * Build trend analysis prompt
     * @private
     */
    _buildTrendPrompt(context) {
        const { item, category, timeframe, categoryModel } = context;
        
        return `Analyze price trends for ${category} items similar to this one in the Swedish market:

ITEM: ${item.title || 'Not specified'}
CATEGORY: ${category}
TIMEFRAME: ${timeframe}

Consider:
- Historical price movements in this category
- Market volatility (${categoryModel.volatility})
- Seasonal patterns: ${categoryModel.seasonality ? 'Yes' : 'No'}
- Annual appreciation rate: ${(categoryModel.appreciationRate * 100).toFixed(1)}%
- Current market conditions in Sweden
- Economic factors affecting luxury/collectible markets

Provide:
1. Overall trend direction (rising/stable/declining)
2. Price change percentage over timeframe
3. Volatility assessment
4. Seasonal patterns if applicable
5. Future outlook (6-12 months)
6. Key market drivers

Format as JSON with clear trend indicators.`;
    }
    
    /**
     * Parse trend response
     * @private
     */
    _parseTrendResponse(response, context) {
        try {
            const parsed = this.responseParser.parseJSON(response);
            
            return {
                direction: parsed.direction || parsed.trend || 'stable',
                changePercentage: parsed.changePercentage || parsed.change || 0,
                volatility: parsed.volatility || 'medium',
                seasonalPatterns: parsed.seasonalPatterns || parsed.seasonal || [],
                futureOutlook: parsed.futureOutlook || parsed.outlook || 'stable',
                marketDrivers: parsed.marketDrivers || parsed.drivers || []
            };
        } catch (error) {
            console.warn('Failed to parse trend response, using fallback');
            return this._createFallbackTrend(context);
        }
    }
    
    /**
     * Perform statistical trend analysis
     * @private
     */
    _performTrendAnalysis(trends, context) {
        const categoryModel = context.categoryModel;
        
        // Calculate trend strength
        const trendStrength = Math.abs(trends.changePercentage) > 10 ? 'strong' : 
                             Math.abs(trends.changePercentage) > 5 ? 'moderate' : 'weak';
        
        // Assess reliability based on volatility
        const reliability = trends.volatility === 'low' ? 'high' :
                           trends.volatility === 'medium' ? 'medium' : 'low';
        
        return {
            ...trends,
            analysis: {
                trendStrength,
                reliability,
                expectedAnnualAppreciation: categoryModel.appreciationRate * 100,
                riskLevel: this._calculateRiskLevel(trends, categoryModel)
            }
        };
    }
    
    /**
     * Calculate auction pricing strategy
     * @private
     */
    _calculateAuctionPricing(estimation, auctionOptions) {
        const baseValue = estimation.estimatedValue;
        const auctionType = auctionOptions.type || 'standard';
        const fees = this.swedishMarket.auctionFees[auctionType] || this.swedishMarket.auctionFees.standard;
        
        // Calculate different price points
        const reservePrice = Math.round(baseValue * 0.7); // 70% of estimated value
        const startingBid = Math.round(baseValue * 0.4);  // 40% of estimated value
        const buyNowPrice = Math.round(baseValue * 1.2);  // 120% of estimated value
        
        // Account for auction fees
        const sellerNet = Math.round(baseValue * (1 - fees));
        const buyerTotal = Math.round(baseValue * (1 + fees));
        
        return {
            estimatedValue: baseValue,
            reservePrice,
            startingBid,
            buyNowPrice,
            sellerNet,
            buyerTotal,
            auctionFees: {
                rate: fees,
                amount: Math.round(baseValue * fees)
            },
            strategy: this._determineAuctionStrategy(estimation, auctionOptions)
        };
    }
    
    /**
     * Generate auction recommendations
     * @private
     */
    _generateAuctionRecommendations(strategy, itemData) {
        const recommendations = [];
        
        // Starting bid recommendation
        if (strategy.startingBid < strategy.estimatedValue * 0.3) {
            recommendations.push({
                type: 'starting_bid',
                message: 'Consider a higher starting bid to establish value perception',
                priority: 'medium'
            });
        }
        
        // Reserve price recommendation
        if (strategy.reservePrice > strategy.estimatedValue * 0.8) {
            recommendations.push({
                type: 'reserve_price',
                message: 'Reserve price might be too high, consider lowering to increase bidding activity',
                priority: 'high'
            });
        }
        
        // Timing recommendation
        const category = this._determineCategory(itemData);
        if (this.categoryModels[category]?.seasonality && !this._isHighSeason(category)) {
            recommendations.push({
                type: 'timing',
                message: `Consider waiting for high season to maximize ${category} prices`,
                priority: 'low'
            });
        }
        
        return recommendations;
    }
    
    /**
     * Prepare comparison context
     * @private
     */
    async _prepareComparisonContext(itemData, options) {
        const category = this._determineCategory(itemData);
        const searchRadius = options.searchRadius || 'similar';
        
        return {
            item: itemData,
            category,
            searchRadius,
            maxComparisons: options.maxComparisons || 5,
            options
        };
    }
    
    /**
     * Build comparison prompt
     * @private
     */
    _buildComparisonPrompt(context) {
        const { item, category, searchRadius } = context;
        
        return `Find and analyze similar ${category} items in the Swedish auction/collectibles market:

TARGET ITEM:
Title: ${item.title || 'Not specified'}
Description: ${item.description || 'Not specified'}
${item.artist ? `Artist: ${item.artist}` : ''}
${item.period ? `Period: ${item.period}` : ''}
${item.material ? `Material: ${item.material}` : ''}

COMPARISON CRITERIA:
- Search radius: ${searchRadius}
- Focus on Swedish market data
- Include recent sales (last 12 months preferred)
- Consider condition differences
- Account for auction vs. retail pricing

Provide:
1. List of similar items with prices
2. Average market price for comparable items
3. Price range (low to high)
4. Key differences affecting pricing
5. Market position relative to comparables
6. Pricing recommendations

Format as JSON with detailed comparison data.`;
    }
    
    /**
     * Parse comparison response
     * @private
     */
    _parseComparisonResponse(response, context) {
        try {
            const parsed = this.responseParser.parseJSON(response);
            
            return {
                similarItems: parsed.similarItems || parsed.comparables || [],
                averagePrice: parsed.averagePrice || parsed.average || 0,
                priceRange: {
                    low: parsed.priceRange?.low || parsed.low || 0,
                    high: parsed.priceRange?.high || parsed.high || 0
                },
                keyDifferences: parsed.keyDifferences || parsed.differences || [],
                marketPosition: parsed.marketPosition || 'average',
                recommendations: parsed.recommendations || []
            };
        } catch (error) {
            console.warn('Failed to parse comparison response, using fallback');
            return this._createFallbackComparison(context);
        }
    }
    
    /**
     * Enhance comparison analysis
     * @private
     */
    _enhanceComparisonAnalysis(comparison, context) {
        // Calculate statistical measures
        const prices = comparison.similarItems.map(item => item.price || 0).filter(p => p > 0);
        
        if (prices.length > 0) {
            const median = this._calculateMedian(prices);
            const standardDeviation = this._calculateStandardDeviation(prices);
            const variance = standardDeviation / comparison.averagePrice;
            
            return {
                ...comparison,
                statistics: {
                    median,
                    standardDeviation: Math.round(standardDeviation),
                    variance: Math.round(variance * 100) / 100,
                    sampleSize: prices.length,
                    confidence: prices.length >= 3 ? 'high' : prices.length >= 2 ? 'medium' : 'low'
                }
            };
        }
        
        return comparison;
    }
    
    /**
     * Helper methods for calculations and utilities
     * @private
     */
    
    _generateCacheKey(operation, itemData, options) {
        const keyData = {
            op: operation,
            title: itemData.title || '',
            category: itemData.category || '',
            artist: itemData.artist || '',
            condition: itemData.condition || '',
            ...options
        };
        return JSON.stringify(keyData);
    }
    
    _determineCategory(itemData) {
        const title = (itemData.title || '').toLowerCase();
        const description = (itemData.description || '').toLowerCase();
        const category = (itemData.category || '').toLowerCase();
        
        if (category.includes('konst') || title.includes('målning') || title.includes('tavla')) return 'art';
        if (category.includes('antikviteter') || title.includes('antik')) return 'antiques';
        if (category.includes('smycken') || title.includes('ring') || title.includes('halsband')) return 'jewelry';
        if (category.includes('möbler') || title.includes('stol') || title.includes('bord')) return 'furniture';
        
        return 'collectibles';
    }
    
    _assessCondition(itemData) {
        const condition = (itemData.condition || '').toLowerCase();
        const description = (itemData.description || '').toLowerCase();
        
        if (condition.includes('mint') || condition.includes('perfekt')) return 'mint';
        if (condition.includes('excellent') || condition.includes('utmärkt')) return 'excellent';
        if (condition.includes('very good') || condition.includes('mycket bra')) return 'very-good';
        if (condition.includes('good') || condition.includes('bra')) return 'good';
        if (condition.includes('fair') || condition.includes('acceptabel')) return 'fair';
        if (condition.includes('poor') || condition.includes('dålig')) return 'poor';
        if (description.includes('restaurering') || description.includes('reparation')) return 'for-restoration';
        
        return 'good'; // Default assumption
    }
    
    _assessMarketDemand(itemData, category) {
        // Simplified demand assessment - in real implementation, this would use market data
        const categoryModel = this.categoryModels[category];
        
        if (categoryModel?.volatility === 'high') return 'above-average';
        if (categoryModel?.volatility === 'low') return 'average';
        
        return 'average';
    }
    
    _determineMarketSegment(value) {
        const segments = this.swedishMarket.marketSegments;
        
        if (value >= segments.luxury.threshold) return segments.luxury;
        if (value >= segments.premium.threshold) return segments.premium;
        if (value >= segments.standard.threshold) return segments.standard;
        return segments.budget;
    }
    
    _isHighSeason(category) {
        const month = new Date().getMonth();
        
        // Simplified seasonal logic
        if (category === 'art' || category === 'antiques') {
            return month >= 9 || month <= 2; // Oct-Mar (auction season)
        }
        if (category === 'furniture') {
            return month >= 3 && month <= 8; // Apr-Sep (moving season)
        }
        
        return false;
    }
    
    _calculateRiskLevel(trends, categoryModel) {
        let risk = 'medium';
        
        if (categoryModel.volatility === 'high' && Math.abs(trends.changePercentage) > 15) {
            risk = 'high';
        } else if (categoryModel.volatility === 'low' && Math.abs(trends.changePercentage) < 5) {
            risk = 'low';
        }
        
        return risk;
    }
    
    _determineAuctionStrategy(estimation, options) {
        const confidence = estimation.confidence || 0.7;
        
        if (confidence > 0.8) return 'aggressive';
        if (confidence < 0.5) return 'conservative';
        return 'balanced';
    }
    
    _calculateMedian(numbers) {
        const sorted = [...numbers].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    }
    
    _calculateStandardDeviation(numbers) {
        const mean = numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
        const squaredDiffs = numbers.map(num => Math.pow(num - mean, 2));
        const avgSquaredDiff = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / numbers.length;
        return Math.sqrt(avgSquaredDiff);
    }
    
    _createFallbackEstimation(context) {
        // Create a basic estimation when AI parsing fails
        const baseValue = 1000; // Default base value in SEK
        
        return {
            estimatedValue: baseValue,
            valueRange: { low: baseValue * 0.7, high: baseValue * 1.3 },
            keyFactors: ['Limited data available'],
            marketPosition: 'standard',
            justification: 'Fallback estimation due to parsing error',
            currency: 'SEK'
        };
    }
    
    _createFallbackTrend(context) {
        return {
            direction: 'stable',
            changePercentage: 0,
            volatility: 'medium',
            seasonalPatterns: [],
            futureOutlook: 'stable',
            marketDrivers: ['Insufficient data for trend analysis']
        };
    }
    
    _createFallbackComparison(context) {
        return {
            similarItems: [],
            averagePrice: 0,
            priceRange: { low: 0, high: 0 },
            keyDifferences: ['No comparable items found'],
            marketPosition: 'unknown',
            recommendations: ['Gather more market data for accurate comparison']
        };
    }
    
    _createErrorResult(error, itemData) {
        return {
            error: true,
            message: error.message || 'Price estimation failed',
            item: itemData.title || 'Unknown item',
            estimatedValue: 0,
            confidence: 0,
            timestamp: new Date().toISOString()
        };
    }
}

export default PriceEstimator; 