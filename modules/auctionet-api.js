// modules/auctionet-api.js - Auctionet API Integration Module
// Access to 3.65M+ real auction results for market analysis

export class AuctionetAPI {
  constructor() {
    this.baseUrl = 'https://auctionet.com/api/v2/items.json';
    this.cache = new Map(); // Cache results to avoid repeated API calls
    this.cacheExpiry = 30 * 60 * 1000; // 30 minutes default cache
    this.excludeCompanyId = null; // Will be loaded from settings
    
    // Load exclude company setting
    this.loadExcludeCompanySetting();
  }

  // Load exclude company setting from Chrome storage
  async loadExcludeCompanySetting() {
    try {
      const result = await chrome.storage.sync.get(['excludeCompanyId']);
      if (result.excludeCompanyId) {
        this.excludeCompanyId = result.excludeCompanyId.trim();
        console.log(`🚫 Company exclusion active: ${this.excludeCompanyId}`);
      } else {
        this.excludeCompanyId = null;
        console.log(`✅ No company exclusion set`);
      }
    } catch (error) {
      console.warn('⚠️ Could not load exclude company setting:', error);
    }
  }

  // Refresh exclude company setting (called when settings are updated)
  async refreshExcludeCompanySetting() {
    await this.loadExcludeCompanySetting();
    // Clear cache since exclusion rules have changed
    this.cache.clear();
    console.log('🔄 Exclude company setting refreshed, cache cleared');
  }

  // Main method to analyze comparable sales for an item
  async analyzeComparableSales(artistName, objectType, period, technique, description) {
    console.log('🔍 Starting Auctionet market analysis...');
    console.log(`📊 Searching for: Artist="${artistName}", Object="${objectType}", Period="${period}"`);

    // Ensure company exclusion setting is loaded before searching
    await this.loadExcludeCompanySetting();

    try {
      // Build search strategies with different levels of specificity
      const searchStrategies = this.buildSearchStrategies(artistName, objectType, period, technique);
      
      let bestResult = null;
      let totalMatches = 0;
      let usedStrategy = null; // Track which strategy was actually used
      let artistSearchResults = 0; // NEW: Track artist-only search results
      
      // Try each search strategy until we get good results
      for (const strategy of searchStrategies) {
        console.log(`🎯 Trying search strategy: ${strategy.description}`);
        console.log(`🔍 Actual query being searched: "${strategy.query}"`);
        
        const result = await this.searchAuctionResults(strategy.query, strategy.description);
        
        // NEW: Track artist-only search results for comparison
        if (strategy.description.includes('Artist only') && result && result.soldItems) {
          artistSearchResults = result.soldItems.length;
          console.log(`👤 Artist-only search found: ${artistSearchResults} results`);
        }
        
        if (result && result.soldItems.length > 0) {
          console.log(`✅ Found ${result.soldItems.length} sold items with strategy: ${strategy.description}`);
          console.log(`✅ Successful query was: "${strategy.query}"`);
          
          // Use the first strategy that gives us results, or combine results
          if (!bestResult || result.soldItems.length > bestResult.soldItems.length) {
            bestResult = result;
            totalMatches = result.totalEntries;
            usedStrategy = strategy; // Store the winning strategy
            console.log(`🏆 New best strategy: "${strategy.query}"`);
          }
          
          // Stop if we have enough data (5+ items)
          if (result.soldItems.length >= 5) {
            console.log('🛑 Stopping search - found enough data (' + result.soldItems.length + ' items)');
            break;
          }
        } else {
          console.log(`❌ No results for query: "${strategy.query}"`);
        }
      }

      if (!bestResult || bestResult.soldItems.length === 0) {
        console.log('❌ No comparable sales found');
        return {
          hasComparableData: false,
          dataSource: 'auctionet_api',
          totalMatches: 0,
          analyzedSales: 0,
          limitations: 'Inga jämförbara försäljningar hittades',
          actualSearchQuery: usedStrategy ? usedStrategy.query : null,
          searchStrategy: usedStrategy ? usedStrategy.description : null,
          artistSearchResults: artistSearchResults // NEW: Include artist search count
        };
      }

      // Analyze the market data
      const marketAnalysis = this.analyzeMarketData(bestResult.soldItems);
      
      console.log('✅ Auctionet market analysis complete');
      console.log(`📊 Analyzed ${bestResult.soldItems.length} sales from ${totalMatches} total matches`);
      console.log(`🎯 Used search strategy: ${usedStrategy ? usedStrategy.description : 'Unknown'}`);
      console.log(`🔍 Final actualSearchQuery being returned: "${usedStrategy ? usedStrategy.query : null}"`);
      
      return {
        hasComparableData: true,
        dataSource: 'auctionet_api',
        totalMatches: totalMatches,
        analyzedSales: bestResult.soldItems.length,
        priceRange: marketAnalysis.priceRange,
        confidence: marketAnalysis.confidence,
        marketContext: marketAnalysis.marketContext,
        recentSales: marketAnalysis.recentSales,
        trendAnalysis: marketAnalysis.trendAnalysis,
        limitations: marketAnalysis.limitations,
        exceptionalSales: marketAnalysis.exceptionalSales, // NEW: Include exceptional sales
        actualSearchQuery: usedStrategy ? usedStrategy.query : null, // NEW: Include actual query used
        searchStrategy: usedStrategy ? usedStrategy.description : null, // NEW: Include strategy description
        artistSearchResults: artistSearchResults // NEW: Include artist search count
      };

    } catch (error) {
      console.error('❌ Auctionet API error:', error);
      return {
        hasComparableData: false,
        dataSource: 'auctionet_api',
        error: error.message,
        totalMatches: 0,
        analyzedSales: 0,
        limitations: 'API-fel vid sökning av jämförbara försäljningar',
        actualSearchQuery: null,
        searchStrategy: null,
        artistSearchResults: 0 // NEW: Include artist search count
      };
    }
  }

  // NEW: Analyze live auction data for market intelligence
  async analyzeLiveAuctions(artistName, objectType, period, technique, description) {
    console.log('🔴 Starting LIVE auction analysis...');
    console.log(`📊 Searching live auctions for: Artist="${artistName}", Object="${objectType}"`);

    // Ensure company exclusion setting is loaded before searching
    await this.loadExcludeCompanySetting();

    try {
      // Build search strategies for live auctions
      const searchStrategies = this.buildSearchStrategies(artistName, objectType, period, technique);
      
      let bestResult = null;
      let totalMatches = 0;
      let usedStrategy = null; // Track which strategy was actually used
      
      // Try each search strategy for live auctions
      for (const strategy of searchStrategies) {
        console.log(`🎯 Trying LIVE search strategy: ${strategy.description}`);
        console.log(`🔍 Actual LIVE query being searched: "${strategy.query}"`);
        
        const result = await this.searchLiveAuctions(strategy.query, strategy.description);
        
        if (result && result.liveItems.length > 0) {
          console.log(`✅ Found ${result.liveItems.length} live items with strategy: ${strategy.description}`);
          console.log(`✅ Successful LIVE query was: "${strategy.query}"`);
          
          if (!bestResult || result.liveItems.length > bestResult.liveItems.length) {
            bestResult = result;
            totalMatches = result.totalEntries;
            usedStrategy = strategy; // Track the successful strategy
            console.log(`🏆 New best LIVE strategy: "${usedStrategy.query}"`);
          }
          
          // For live auctions, even 1-2 items can be valuable
          if (result.liveItems.length >= 3) {
            console.log(`🛑 Stopping LIVE search - found enough data (${result.liveItems.length} items)`);
            break;
          }
        } else {
          console.log(`❌ No LIVE results for query: "${strategy.query}"`);
        }
      }
      
      if (!bestResult || bestResult.liveItems.length === 0) {
        console.log('❌ No live auctions found for this search');
        return null;
      }
      
      // Analyze live auction data
      const liveAnalysis = this.analyzeLiveMarketData(bestResult.liveItems, artistName, objectType);
      
      console.log('✅ Live auction analysis complete');
      console.log(`📊 Analyzed ${bestResult.liveItems.length} live auctions from ${totalMatches} total matches`);
      console.log(`🎯 Used LIVE search strategy: ${usedStrategy ? usedStrategy.description : 'Unknown'}`);
      console.log(`🔍 Final LIVE actualSearchQuery being returned: "${usedStrategy ? usedStrategy.query : null}"`);
      
      return {
        hasLiveData: true,
        dataSource: 'auctionet_live',
        totalMatches: totalMatches,
        analyzedLiveItems: bestResult.liveItems.length,
        currentEstimates: liveAnalysis.estimateRange,
        currentBids: liveAnalysis.bidRange,
        marketActivity: liveAnalysis.marketActivity,
        liveItems: liveAnalysis.liveItems,
        marketSentiment: liveAnalysis.marketSentiment,
        actualSearchQuery: usedStrategy ? usedStrategy.query : null,
        searchStrategy: usedStrategy ? usedStrategy.description : null
      };
      
    } catch (error) {
      console.error('💥 Live auction API error:', error);
      return null;
    }
  }

  // NEW: Search live auctions (without is=ended parameter)
  async searchLiveAuctions(query, description, maxResults = 50) {
    // Check cache first (shorter cache for live data)
    // Include excludeCompanyId in cache key to ensure exclusion settings are respected
    const cacheKey = `live_${query}_${maxResults}_exclude_${this.excludeCompanyId || 'none'}`;
    const cached = this.getCachedResult(cacheKey, 5 * 60 * 1000); // 5 minute cache for live data
    if (cached) {
      console.log(`📦 Using cached live result for: ${description} (exclude: ${this.excludeCompanyId || 'none'})`);
      return cached;
    }
    
    try {
      // No is=ended parameter for live auctions
      const url = `${this.baseUrl}?q=${encodeURIComponent(query)}&per_page=${maxResults}`;
      console.log(`📡 Fetching LIVE: ${url}`);
      console.log(`🚫 Company exclusion setting: ${this.excludeCompanyId || 'Not set'}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.items || data.items.length === 0) {
        console.log(`❌ No live results found for: ${description}`);
        return null;
      }
      
      console.log(`📊 Found ${data.items.length} live items out of ${data.pagination.total_entries} total matches`);
      
      // Filter for active auctions with bidding activity
      const allActiveItems = data.items.filter(item => 
        !item.hammered && // Not yet sold
        item.state === 'published' && // Active
        item.ends_at > (Date.now() / 1000) // Not ended
      );
      
      console.log(`🔴 Active items before company exclusion: ${allActiveItems.length}`);
      
      // Apply company exclusion filter
      const liveItems = allActiveItems.filter(item => {
        if (this.excludeCompanyId && item.company_id && item.company_id.toString() === this.excludeCompanyId) {
          console.log(`🚫 Excluding LIVE item from company ${this.excludeCompanyId}: ${item.title.substring(0, 50)}...`);
          return false;
        }
        return true;
      }).map(item => ({
        title: item.title,
        estimate: item.estimate,
        upperEstimate: item.upper_estimate,
        currentBid: item.bids && item.bids.length > 0 ? item.bids[0].amount : item.starting_bid_amount,
        nextBid: item.next_bid_amount,
        bidCount: item.bids ? item.bids.length : 0,
        reserveMet: item.reserve_met,
        reserveAmount: item.reserve_amount,
        currency: item.currency,
        house: item.house,
        company_id: item.company_id,
        location: item.location,
        endsAt: new Date(item.ends_at * 1000),
        description: item.description,
        condition: item.condition,
        url: this.convertToSwedishUrl(item.url),
        timeRemaining: this.calculateTimeRemaining(item.ends_at),
        auctionId: this.extractAuctionId(this.convertToSwedishUrl(item.url))
      }));
      
      console.log(`🔴 Active live items after company exclusion: ${liveItems.length}`);
      
      if (this.excludeCompanyId && allActiveItems.length > liveItems.length) {
        console.log(`🚫 Company exclusion (LIVE only): Filtered out ${allActiveItems.length - liveItems.length} live items from company ${this.excludeCompanyId}`);
      } else if (this.excludeCompanyId) {
        console.log(`ℹ️ Company exclusion active for ${this.excludeCompanyId}, but no items were filtered out`);
      } else {
        console.log(`ℹ️ No company exclusion set - all active items included`);
      }
      
      const result = {
        totalEntries: data.pagination.total_entries,
        returnedItems: data.items.length,
        liveItems: liveItems
      };
      
      // Cache the result (shorter cache for live data)
      this.setCachedResult(cacheKey, result, 5 * 60 * 1000); // 5 minutes
      
      return result;
      
    } catch (error) {
      console.error(`💥 Live search failed for "${description}":`, error);
      return null;
    }
  }

  // NEW: Analyze live market data
  analyzeLiveMarketData(liveItems, artistName, objectType) {
    console.log(`📊 Analyzing live market data from ${liveItems.length} active auctions...`);
    
    if (liveItems.length === 0) {
      return null;
    }
    
    // Extract estimates and current bids
    const estimates = liveItems.filter(item => item.estimate > 0).map(item => item.estimate);
    const currentBids = liveItems.filter(item => item.currentBid > 0).map(item => item.currentBid);
    
    // Calculate estimate ranges
    const estimateRange = estimates.length > 0 ? {
      low: Math.min(...estimates),
      high: Math.max(...estimates),
      average: estimates.reduce((a, b) => a + b, 0) / estimates.length
    } : null;
    
    // Calculate current bid ranges
    const bidRange = currentBids.length > 0 ? {
      low: Math.min(...currentBids),
      high: Math.max(...currentBids),
      average: currentBids.reduce((a, b) => a + b, 0) / currentBids.length
    } : null;
    
    // Analyze market activity
    const totalBids = liveItems.reduce((sum, item) => sum + item.bidCount, 0);
    const reservesMetCount = liveItems.filter(item => item.reserveMet).length;
    const reservesMetPercentage = liveItems.length > 0 ? (reservesMetCount / liveItems.length) * 100 : 0;
    
    // Market sentiment analysis
    let marketSentiment = 'neutral';
    if (reservesMetPercentage > 70) {
      marketSentiment = 'strong';
    } else if (reservesMetPercentage > 40) {
      marketSentiment = 'moderate';
    } else if (reservesMetPercentage < 20) {
      marketSentiment = 'weak';
    }
    
    // Get top live items for display
    const topLiveItems = liveItems
      .sort((a, b) => b.bidCount - a.bidCount) // Sort by bid activity
      .slice(0, 5)
      .map(item => ({
        title: item.title.substring(0, 60) + (item.title.length > 60 ? '...' : ''),
        estimate: item.estimate,
        currentBid: item.currentBid,
        bidCount: item.bidCount,
        reserveMet: item.reserveMet,
        timeRemaining: item.timeRemaining,
        house: item.house,
        url: item.url,
        auctionId: item.auctionId
      }));
    
    return {
      estimateRange,
      bidRange,
      marketActivity: {
        totalItems: liveItems.length,
        totalBids: totalBids,
        averageBidsPerItem: liveItems.length > 0 ? totalBids / liveItems.length : 0,
        reservesMetPercentage: Math.round(reservesMetPercentage)
      },
      marketSentiment,
      liveItems: topLiveItems
    };
  }

  // NEW: Calculate time remaining for live auctions
  calculateTimeRemaining(endsAtTimestamp) {
    const now = Date.now() / 1000;
    const remaining = endsAtTimestamp - now;
    
    if (remaining <= 0) {
      return 'Ended';
    }
    
    const days = Math.floor(remaining / (24 * 60 * 60));
    const hours = Math.floor((remaining % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((remaining % (60 * 60)) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  // Build different search strategies from broad to specific
  buildSearchStrategies(artistName, objectType, period, technique) {
    console.log('🔧 Building search strategies with:', { artistName, objectType, period, technique });
    
    const strategies = [];
    
    // Strategy 1: Artist + Object Type (most specific)
    if (artistName && objectType) {
      const query = `${artistName} ${objectType}`;
      console.log(`🎯 Strategy 1 query: "${query}" (length: ${query.length})`);
      strategies.push({
        query: query,
        description: `Artist + Object Type: "${artistName} ${objectType}"`,
        weight: 1.0
      });
    }
    
    // Strategy 2: Artist + Technique
    if (artistName && technique) {
      const query = `${artistName} ${technique}`;
      console.log(`🎯 Strategy 2 query: "${query}" (length: ${query.length})`);
      strategies.push({
        query: query,
        description: `Artist + Technique: "${artistName} ${technique}"`,
        weight: 0.9
      });
    }
    
    // Strategy 3: Artist + Period
    if (artistName && period) {
      const query = `${artistName} ${period}`;
      console.log(`🎯 Strategy 3 query: "${query}" (length: ${query.length})`);
      strategies.push({
        query: query,
        description: `Artist + Period: "${artistName} ${period}"`,
        weight: 0.8
      });
    }
    
    // Strategy 4: Artist only (broader search)
    if (artistName) {
      const query = artistName;
      console.log(`🎯 Strategy 4 query: "${query}" (length: ${query.length})`);
      strategies.push({
        query: query,
        description: `Artist only: "${artistName}"`,
        weight: 0.7
      });
    }
    
    // Strategy 5: Object Type + Technique + Period (no artist)
    if (objectType && technique && period) {
      const query = `${objectType} ${technique} ${period}`;
      console.log(`🎯 Strategy 5 query: "${query}" (length: ${query.length})`);
      strategies.push({
        query: query,
        description: `Object + Technique + Period: "${objectType} ${technique} ${period}"`,
        weight: 0.6
      });
    }
    
    // Strategy 6: Object Type + Period (broader)
    if (objectType && period) {
      const query = `${objectType} ${period}`;
      console.log(`🎯 Strategy 6 query: "${query}" (length: ${query.length})`);
      strategies.push({
        query: query,
        description: `Object + Period: "${objectType} ${period}"`,
        weight: 0.5
      });
    }
    
    console.log(`🔧 Built ${strategies.length} search strategies`);
    return strategies;
  }

  // Search Auctionet API for auction results
  async searchAuctionResults(query, description, maxResults = 50) {
    // Check cache first
    const cacheKey = `search_${query}_${maxResults}`;
    const cached = this.getCachedResult(cacheKey);
    if (cached) {
      console.log(`📦 Using cached result for: ${description}`);
      return cached;
    }
    
    try {
      const url = `${this.baseUrl}?is=ended&q=${encodeURIComponent(query)}&per_page=${maxResults}`;
      console.log(`📡 Fetching: ${url}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.items || data.items.length === 0) {
        console.log(`❌ No results found for: ${description}`);
        return null;
      }
      
      console.log(`📊 Found ${data.items.length} items out of ${data.pagination.total_entries} total matches`);
      
      // Filter for actually sold items with bid data
      const soldItems = data.items.filter(item => 
        item.hammered && 
        item.bids && 
        item.bids.length > 0 &&
        item.bids[0].amount > 0
        // NOTE: No company exclusion for historical sales - we want our own historical data
      );
      
      console.log(`🔨 Sold items with price data: ${soldItems.length}`);
      
      const result = {
        totalEntries: data.pagination.total_entries,
        returnedItems: data.items.length,
        soldItems: soldItems.map(item => ({
          title: item.title,
          finalPrice: item.bids[0].amount,
          currency: item.currency,
          estimate: item.estimate,
          house: item.house,
          location: item.location,
          endDate: new Date(item.ends_at * 1000),
          bidDate: new Date(item.bids[0].timestamp * 1000),
          reserveMet: item.reserve_met,
          reserveAmount: item.reserve_amount,
          description: item.description,
          condition: item.condition,
          url: this.convertToSwedishUrl(item.url)
        }))
      };
      
      // Cache the result
      this.setCachedResult(cacheKey, result);
      
      return result;
      
    } catch (error) {
      console.error(`💥 Search failed for "${description}":`, error);
      return null;
    }
  }

  // Analyze market data from sold items
  analyzeMarketData(soldItems, artistName, objectType) {
    console.log(`📊 Analyzing market data from ${soldItems.length} sales...`);
    
    if (soldItems.length === 0) {
      return null;
    }
    
    // Extract prices and calculate statistics
    const prices = soldItems.map(item => item.finalPrice);
    const estimates = soldItems.filter(item => item.estimate > 0).map(item => item.estimate);
    
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const medianPrice = this.calculateMedian(prices);
    
    // NEW: Detect exceptional high-value sales that should be highlighted
    const exceptionalSales = this.detectExceptionalSales(soldItems, prices);
    
    // Calculate confidence based on data quality
    const confidence = this.calculateConfidence(soldItems, artistName, objectType);
    
    // Analyze trends over time
    const trendAnalysis = this.analyzeTrends(soldItems);
    
    // Generate market context
    const marketContext = this.generateMarketContext(soldItems, avgPrice, estimates, artistName, objectType);
    
    // Get recent sales for display
    const recentSales = soldItems
      .sort((a, b) => b.bidDate - a.bidDate)
      .slice(0, 5)
      .map(item => ({
        date: item.bidDate.toLocaleDateString('sv-SE'),
        price: item.finalPrice,
        title: item.title.substring(0, 60) + (item.title.length > 60 ? '...' : ''),
        house: item.house,
        estimate: item.estimate,
        url: this.convertToSwedishUrl(item.url)
      }));
    
    // Determine price range for estimates (this may remove outliers for range calculation)
    const priceRange = this.calculatePriceRange(prices, confidence);
    
    // Generate limitations text
    const limitations = this.generateLimitations(soldItems, artistName, objectType);
    
    return {
      priceRange,
      confidence,
      marketContext,
      recentSales,
      trendAnalysis,
      limitations,
      exceptionalSales,
      statistics: {
        average: Math.round(avgPrice),
        median: Math.round(medianPrice),
        min: minPrice,
        max: maxPrice,
        sampleSize: soldItems.length
      }
    };
  }

  // NEW: Detect exceptional high-value sales that should be highlighted
  detectExceptionalSales(soldItems, prices) {
    if (prices.length < 3) {
      return null; // Need enough data to determine what's exceptional
    }
    
    const sortedPrices = [...prices].sort((a, b) => a - b);
    const median = this.calculateMedian(sortedPrices);
    const q3 = sortedPrices[Math.floor(sortedPrices.length * 0.75)];
    
    // Define exceptional as significantly above Q3 (more than 3x median or 2x Q3)
    const exceptionalThreshold = Math.max(median * 3, q3 * 2);
    
    const exceptionalSales = soldItems.filter(item => 
      item.finalPrice > exceptionalThreshold
    ).map(item => ({
      price: item.finalPrice,
      title: item.title,
      date: item.bidDate.toLocaleDateString('sv-SE'),
      house: item.house,
      location: item.location,
      estimate: item.estimate,
      url: this.convertToSwedishUrl(item.url),
      auctionId: this.extractAuctionId(this.convertToSwedishUrl(item.url)),
      priceVsMedian: Math.round((item.finalPrice / median) * 100),
      priceVsEstimate: item.estimate ? Math.round((item.finalPrice / item.estimate) * 100) : null
    }));
    
    if (exceptionalSales.length > 0) {
      console.log(`🌟 Found ${exceptionalSales.length} exceptional high-value sale(s):`);
      exceptionalSales.forEach(sale => {
        console.log(`   ${sale.price.toLocaleString()} SEK - ${sale.title.substring(0, 50)}... (${sale.priceVsMedian}% of median)`);
      });
    }
    
    return exceptionalSales.length > 0 ? {
      count: exceptionalSales.length,
      sales: exceptionalSales,
      threshold: exceptionalThreshold,
      description: exceptionalSales.length === 1 ? 
        `En exceptionell försäljning på ${exceptionalSales[0].price.toLocaleString()} SEK (${exceptionalSales[0].priceVsMedian}% av medianpriset)` :
        `${exceptionalSales.length} exceptionella försäljningar över ${Math.round(exceptionalThreshold).toLocaleString()} SEK`
    } : null;
  }

  // Calculate confidence score based on data quality
  calculateConfidence(soldItems, artistName, objectType) {
    let confidence = 0.5; // Base confidence
    
    // More sales = higher confidence
    if (soldItems.length >= 10) confidence += 0.3;
    else if (soldItems.length >= 5) confidence += 0.2;
    else if (soldItems.length >= 3) confidence += 0.1;
    
    // Recent sales = higher confidence
    const recentSales = soldItems.filter(item => {
      const monthsAgo = (Date.now() - item.bidDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      return monthsAgo <= 24; // Within 2 years
    });
    
    if (recentSales.length >= soldItems.length * 0.7) confidence += 0.2;
    else if (recentSales.length >= soldItems.length * 0.5) confidence += 0.1;
    
    // Artist match = higher confidence
    if (artistName) {
      const artistMatches = soldItems.filter(item => 
        item.title.toLowerCase().includes(artistName.toLowerCase())
      );
      if (artistMatches.length >= soldItems.length * 0.8) confidence += 0.2;
      else if (artistMatches.length >= soldItems.length * 0.5) confidence += 0.1;
    }
    
    // Object type match = higher confidence
    if (objectType) {
      const objectMatches = soldItems.filter(item => 
        item.title.toLowerCase().includes(objectType.toLowerCase())
      );
      if (objectMatches.length >= soldItems.length * 0.8) confidence += 0.1;
    }
    
    return Math.min(1.0, Math.max(0.1, confidence));
  }

  // Analyze price trends over time
  analyzeTrends(soldItems) {
    if (soldItems.length < 3) {
      return { trend: 'insufficient_data', description: 'Otillräckligt data för trendanalys' };
    }
    
    // Sort by date
    const sortedSales = soldItems.sort((a, b) => a.bidDate - b.bidDate);
    
    // Split into older and newer halves
    const midPoint = Math.floor(sortedSales.length / 2);
    const olderSales = sortedSales.slice(0, midPoint);
    const newerSales = sortedSales.slice(midPoint);
    
    if (olderSales.length === 0 || newerSales.length === 0) {
      return { trend: 'insufficient_data', description: 'Otillräckligt data för trendanalys' };
    }
    
    const olderAvg = olderSales.reduce((sum, item) => sum + item.finalPrice, 0) / olderSales.length;
    const newerAvg = newerSales.reduce((sum, item) => sum + item.finalPrice, 0) / newerSales.length;
    
    const changePercent = ((newerAvg - olderAvg) / olderAvg) * 100;
    
    let trend, description;
    if (changePercent > 15) {
      trend = 'rising_strong';
      description = `Stark uppgång: +${Math.round(changePercent)}% senaste tiden`;
    } else if (changePercent > 5) {
      trend = 'rising';
      description = `Stigande: +${Math.round(changePercent)}% senaste tiden`;
    } else if (changePercent < -15) {
      trend = 'falling_strong';
      description = `Stark nedgång: ${Math.round(changePercent)}% senaste tiden`;
    } else if (changePercent < -5) {
      trend = 'falling';
      description = `Fallande: ${Math.round(changePercent)}% senaste tiden`;
    } else {
      trend = 'stable';
      description = 'Stabil prisutveckling';
    }
    
    return { trend, description, changePercent: Math.round(changePercent) };
  }

  // Generate market context description
  generateMarketContext(soldItems, avgPrice, estimates, artistName, objectType) {
    const contexts = [];
    
    // Artist status
    if (artistName) {
      const artistSales = soldItems.filter(item => 
        item.title.toLowerCase().includes(artistName.toLowerCase())
      );
      
      if (artistSales.length >= 3) {
        contexts.push(`${artistName}: Etablerad på auktionsmarknaden`);
      } else if (artistSales.length > 0) {
        contexts.push(`${artistName}: Begränsad auktionshistorik`);
      }
    }
    
    // Market activity
    if (soldItems.length >= 10) {
      contexts.push('Aktiv marknad med regelbunden försäljning');
    } else if (soldItems.length >= 5) {
      contexts.push('Måttlig marknadsaktivitet');
    } else {
      contexts.push('Begränsad marknadsaktivitet');
    }
    
    // Price vs estimate analysis
    if (estimates.length >= 3) {
      const avgEstimate = estimates.reduce((a, b) => a + b, 0) / estimates.length;
      const ratio = avgPrice / avgEstimate;
      
      if (ratio > 1.2) {
        contexts.push('Säljer typiskt över utrop');
      } else if (ratio < 0.8) {
        contexts.push('Säljer typiskt under utrop');
      } else {
        contexts.push('Säljer nära utropspris');
      }
    }
    
    return contexts.join(' • ');
  }

  // Calculate suggested price range
  calculatePriceRange(prices, confidence) {
    if (prices.length === 0) {
      return { low: 0, high: 0, currency: 'SEK' };
    }
    
    // Sort prices for analysis
    const sortedPrices = [...prices].sort((a, b) => a - b);
    
    // STEP 1: Remove extreme outliers using intelligent analysis
    const cleanedPrices = this.removeExtremeOutliers(sortedPrices);
    
    console.log(`🧹 Outlier removal: ${prices.length} → ${cleanedPrices.length} prices`);
    if (cleanedPrices.length < prices.length) {
      const removedPrices = prices.filter(p => !cleanedPrices.includes(p));
      console.log(`🚫 Removed outliers: ${removedPrices.map(p => p.toLocaleString()).join(', ')} SEK`);
    }
    
    // Use cleaned prices for calculations
    const workingPrices = cleanedPrices.length >= 3 ? cleanedPrices : sortedPrices;
    const avgPrice = workingPrices.reduce((a, b) => a + b, 0) / workingPrices.length;
    
    // STEP 2: Use percentile-based approach on cleaned data
    let lowPercentile, highPercentile;
    
    if (confidence > 0.8) {
      // High confidence: Use tighter range (25th-75th percentile)
      lowPercentile = 0.25;
      highPercentile = 0.75;
    } else if (confidence > 0.6) {
      // Medium confidence: Use moderate range (20th-80th percentile)
      lowPercentile = 0.20;
      highPercentile = 0.80;
    } else {
      // Low confidence: Use wider range (10th-90th percentile)
      lowPercentile = 0.10;
      highPercentile = 0.90;
    }
    
    // Calculate percentile indices
    const lowIndex = Math.floor(workingPrices.length * lowPercentile);
    const highIndex = Math.floor(workingPrices.length * highPercentile);
    
    // Get percentile values
    const lowValue = workingPrices[Math.max(0, lowIndex)];
    const highValue = workingPrices[Math.min(workingPrices.length - 1, highIndex)];
    
    // Use percentile values directly with minimal adjustment
    let low = Math.round(lowValue);
    let high = Math.round(highValue);
    
    // Only ensure minimum range width if the percentile range is too narrow
    const currentRangeWidth = high - low;
    const minRangeWidth = avgPrice * 0.15; // Reduced from 0.2 to 0.15
    
    if (currentRangeWidth < minRangeWidth) {
      // Expand range symmetrically around the median of the percentile range
      const center = (low + high) / 2;
      const expansion = (minRangeWidth - currentRangeWidth) / 2;
      low = Math.max(0, Math.round(center - (currentRangeWidth / 2) - expansion));
      high = Math.round(center + (currentRangeWidth / 2) + expansion);
    }
    
    // Final safety check: ensure range is reasonable relative to cleaned data
    const dataRange = workingPrices[workingPrices.length - 1] - workingPrices[0];
    if (high - low > dataRange * 1.5) {
      // If our calculated range is larger than 1.5x the actual data range, constrain it
      const median = this.calculateMedian(workingPrices);
      low = Math.max(0, Math.round(median * 0.7));
      high = Math.round(median * 1.3);
    }
    
    console.log(`📊 Price range calculation: ${low.toLocaleString()}-${high.toLocaleString()} SEK (from ${workingPrices.length} prices)`);
    
    return { low, high, currency: 'SEK' };
  }

  // NEW: Remove extreme outliers using intelligent analysis
  removeExtremeOutliers(sortedPrices) {
    if (sortedPrices.length < 4) {
      return sortedPrices; // Need at least 4 data points for IQR
    }
    
    // Calculate quartiles
    const q1Index = Math.floor(sortedPrices.length * 0.25);
    const q3Index = Math.floor(sortedPrices.length * 0.75);
    const q1 = sortedPrices[q1Index];
    const q3 = sortedPrices[q3Index];
    const iqr = q3 - q1;
    
    // Use a very conservative approach for outlier detection
    // Only remove extreme outliers that are likely data errors (4.0 * IQR)
    const lowerBound = q1 - (4.0 * iqr);
    const upperBound = q3 + (4.0 * iqr);
    
    // Additional check: Only remove outliers if they're EXTREMELY unreasonable
    // Allow up to 50x median as reasonable (very generous for art market)
    const median = this.calculateMedian(sortedPrices);
    const maxReasonablePrice = median * 50; // Much more generous threshold
    
    // Filter out only truly extreme outliers
    const filtered = sortedPrices.filter(price => {
      const isStatisticalOutlier = price < lowerBound || price > upperBound;
      const isUnreasonablyHigh = price > maxReasonablePrice;
      
      // Only remove if BOTH statistically extreme AND unreasonably high
      const shouldRemove = isStatisticalOutlier && isUnreasonablyHigh;
      
      if (shouldRemove) {
        console.log(`🚫 Removing extreme outlier: ${price.toLocaleString()} SEK (>${upperBound.toLocaleString()} and >${maxReasonablePrice.toLocaleString()})`);
      } else if (isStatisticalOutlier) {
        console.log(`⚠️ Statistical outlier detected but keeping: ${price.toLocaleString()} SEK (legitimate high-value sale)`);
      }
      
      return !shouldRemove;
    });
    
    // Only apply filtering if we still have at least 3 data points
    if (filtered.length >= 3) {
      return filtered;
    } else {
      console.log(`⚠️ Outlier removal would leave too few data points (${filtered.length}), keeping all data`);
      return sortedPrices;
    }
  }

  // Generate limitations text
  generateLimitations(soldItems, artistName, objectType) {
    const limitations = [];
    
    if (soldItems.length < 5) {
      limitations.push('Begränsad datamängd');
    }
    
    const recentSales = soldItems.filter(item => {
      const monthsAgo = (Date.now() - item.bidDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      return monthsAgo <= 12;
    });
    
    if (recentSales.length < soldItems.length * 0.5) {
      limitations.push('Få aktuella försäljningar');
    }
    
    if (artistName) {
      const exactMatches = soldItems.filter(item => 
        item.title.toLowerCase().includes(artistName.toLowerCase())
      );
      if (exactMatches.length < soldItems.length * 0.7) {
        limitations.push('Inkluderar liknande konstnärer/tillverkare');
      }
    }
    
    return limitations.length > 0 ? limitations.join(', ') : null;
  }

  // Utility methods
  calculateMedian(numbers) {
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  // Cache management
  getCachedResult(key, customExpiry = null) {
    const cached = this.cache.get(key);
    const expiry = customExpiry || this.cacheExpiry;
    if (cached && Date.now() - cached.timestamp < expiry) {
      return cached.data;
    }
    return null;
  }

  setCachedResult(key, data, customExpiry = null) {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiry: customExpiry || this.cacheExpiry
    });
  }

  // Clear old cache entries
  clearExpiredCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      const expiry = value.expiry || this.cacheExpiry;
      if (now - value.timestamp >= expiry) {
        this.cache.delete(key);
      }
    }
  }

  // NEW: Extract auction ID from auction URL
  extractAuctionId(url) {
    if (!url) return null;
    
    // Try different URL patterns for Auctionet
    // Pattern 1: /auctions/123456
    let match = url.match(/\/auctions\/(\d+)/);
    if (match) return match[1];
    
    // Pattern 2: /items/123456
    match = url.match(/\/items\/(\d+)/);
    if (match) return match[1];
    
    // Pattern 3: auction_id=123456
    match = url.match(/auction_id=(\d+)/);
    if (match) return match[1];
    
    // Pattern 4: id=123456
    match = url.match(/[?&]id=(\d+)/);
    if (match) return match[1];
    
    return null;
  }

  // NEW: Convert English Auctionet URLs to Swedish
  convertToSwedishUrl(url) {
    if (!url) return url;
    
    // Convert /en/ to /sv/ in Auctionet URLs
    if (url.includes('auctionet.com/en/')) {
      return url.replace('/en/', '/sv/');
    }
    
    return url;
  }
} 