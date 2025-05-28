// modules/auctionet-api.js - Auctionet API Integration Module
// Access to 3.65M+ real auction results for market analysis

export class AuctionetAPI {
  constructor() {
    this.baseUrl = 'https://auctionet.com/api/v2/items.json';
    this.cache = new Map(); // Cache results to avoid repeated API calls
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
  }

  // Main method to analyze comparable sales for an item
  async analyzeComparableSales(artistName, objectType, period, technique, description) {
    console.log('🔍 Starting Auctionet market analysis...');
    console.log(`📊 Searching for: Artist="${artistName}", Object="${objectType}", Period="${period}"`);

    try {
      // Build search strategies with different levels of specificity
      const searchStrategies = this.buildSearchStrategies(artistName, objectType, period, technique);
      
      let bestResult = null;
      let totalMatches = 0;
      
      // Try each search strategy until we get good results
      for (const strategy of searchStrategies) {
        console.log(`🎯 Trying search strategy: ${strategy.description}`);
        
        const result = await this.searchAuctionResults(strategy.query, strategy.description);
        
        if (result && result.soldItems.length > 0) {
          console.log(`✅ Found ${result.soldItems.length} sold items with strategy: ${strategy.description}`);
          
          // Use the first strategy that gives us results, or combine results
          if (!bestResult || result.soldItems.length > bestResult.soldItems.length) {
            bestResult = result;
            totalMatches = result.totalEntries;
          }
          
          // If we have enough data, stop searching
          if (result.soldItems.length >= 5) {
            break;
          }
        }
      }
      
      if (!bestResult || bestResult.soldItems.length === 0) {
        console.log('❌ No comparable sales found in Auctionet database');
        return null;
      }
      
      // Analyze the results and calculate market data
      const marketAnalysis = this.analyzeMarketData(bestResult.soldItems, artistName, objectType);
      
      console.log('✅ Auctionet market analysis complete');
      console.log(`📊 Analyzed ${bestResult.soldItems.length} sales from ${totalMatches} total matches`);
      
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
        limitations: marketAnalysis.limitations
      };
      
    } catch (error) {
      console.error('💥 Auctionet API error:', error);
      return null;
    }
  }

  // Build different search strategies from broad to specific
  buildSearchStrategies(artistName, objectType, period, technique) {
    const strategies = [];
    
    // Strategy 1: Artist + Object Type (most specific)
    if (artistName && objectType) {
      strategies.push({
        query: `${artistName} ${objectType}`,
        description: `Artist + Object Type: "${artistName} ${objectType}"`,
        weight: 1.0
      });
    }
    
    // Strategy 2: Artist + Technique
    if (artistName && technique) {
      strategies.push({
        query: `${artistName} ${technique}`,
        description: `Artist + Technique: "${artistName} ${technique}"`,
        weight: 0.9
      });
    }
    
    // Strategy 3: Artist + Period
    if (artistName && period) {
      strategies.push({
        query: `${artistName} ${period}`,
        description: `Artist + Period: "${artistName} ${period}"`,
        weight: 0.8
      });
    }
    
    // Strategy 4: Artist only (broader search)
    if (artistName) {
      strategies.push({
        query: artistName,
        description: `Artist only: "${artistName}"`,
        weight: 0.7
      });
    }
    
    // Strategy 5: Object Type + Technique + Period (no artist)
    if (objectType && technique && period) {
      strategies.push({
        query: `${objectType} ${technique} ${period}`,
        description: `Object + Technique + Period: "${objectType} ${technique} ${period}"`,
        weight: 0.6
      });
    }
    
    // Strategy 6: Object Type + Period (broader)
    if (objectType && period) {
      strategies.push({
        query: `${objectType} ${period}`,
        description: `Object + Period: "${objectType} ${period}"`,
        weight: 0.5
      });
    }
    
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
          url: item.url
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
        estimate: item.estimate
      }));
    
    // Determine price range for estimates
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
      statistics: {
        average: Math.round(avgPrice),
        median: Math.round(medianPrice),
        min: minPrice,
        max: maxPrice,
        sampleSize: soldItems.length
      }
    };
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
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const stdDev = this.calculateStandardDeviation(prices);
    
    // Adjust range based on confidence
    const rangeFactor = confidence > 0.8 ? 0.8 : confidence > 0.6 ? 1.0 : 1.2;
    
    const low = Math.max(0, Math.round(avgPrice - (stdDev * rangeFactor)));
    const high = Math.round(avgPrice + (stdDev * rangeFactor));
    
    return { low, high, currency: 'SEK' };
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

  calculateStandardDeviation(numbers) {
    const avg = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    const squaredDiffs = numbers.map(num => Math.pow(num - avg, 2));
    const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
    return Math.sqrt(avgSquaredDiff);
  }

  // Cache management
  getCachedResult(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }
    return null;
  }

  setCachedResult(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  // Clear old cache entries
  clearExpiredCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp >= this.cacheExpiry) {
        this.cache.delete(key);
      }
    }
  }
} 