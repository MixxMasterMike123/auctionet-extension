// modules/auctionet-api.js - Auctionet API Integration Module
// Access to 3.65M+ real auction results for market analysis

export class AuctionetAPI {
  constructor() {
    this.baseUrl = 'https://auctionet.com/api/v2/items.json';
    this.cache = new Map(); // Cache results to avoid repeated API calls
    this.cacheExpiry = 30 * 60 * 1000; // 30 minutes default cache
    this.excludeCompanyId = null; // Will be loaded from settings
    this._apiManager = null; // Reference to APIManager for Claude API calls
    
    // Load exclude company setting
    this.loadExcludeCompanySetting();
  }

  // Set APIManager reference for AI validation calls
  setAPIManager(apiManager) {
    this._apiManager = apiManager;
  }

  // Load exclude company setting from Chrome storage
  async loadExcludeCompanySetting() {
    try {
      const result = await chrome.storage.sync.get(['excludeCompanyId']);
      if (result.excludeCompanyId) {
        this.excludeCompanyId = result.excludeCompanyId.trim();
  
      } else {
        this.excludeCompanyId = null;
      }
    } catch (error) {
    }
  }

  // Refresh exclude company setting (called when settings are updated)
  async refreshExcludeCompanySetting() {
    await this.loadExcludeCompanySetting();
    // Clear cache since exclusion rules have changed
    this.cache.clear();

  }

  // Ensure every term in a search query is quoted for Auctionet's API.
  // Auctionet treats unquoted terms as optional/fuzzy; quoted terms are required matches.
  // Input: '"Joel Jonsson" trä'  →  Output: '"Joel Jonsson" "trä"'
  ensureAllTermsQuoted(query) {
    if (!query || typeof query !== 'string') return query;
    
    // Parse the query into terms, preserving existing quoted groups
    const terms = [];
    let current = '';
    let inQuote = false;
    let quoteChar = null;
    
    for (let i = 0; i < query.length; i++) {
      const ch = query[i];
      if ((ch === '"' || ch === "'") && !inQuote) {
        inQuote = true;
        quoteChar = ch;
        current += ch;
      } else if (ch === quoteChar && inQuote) {
        inQuote = false;
        current += ch;
        quoteChar = null;
      } else if (ch === ' ' && !inQuote) {
        if (current.trim()) terms.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) terms.push(current.trim());
    
    // Quote-wrap any term that isn't already quoted
    const quoted = terms.map(t => {
      if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        return t; // already quoted
      }
      return `"${t}"`;
    });
    
    return quoted.join(' ');
  }

  // Sanitize search query to prevent overly long URLs that trigger HTTP 403.
  // Removes problematic characters (slashes, commas), filters out noise words,
  // and caps the number of terms to avoid URL length issues.
  sanitizeSearchQuery(query) {
    if (!query || typeof query !== 'string') return query;

    // Split on slashes to expand "silver/tenn/glas" → "silver tenn glas"
    query = query.replace(/\//g, ' ');

    // Remove commas (often left over from AI descriptions)
    query = query.replace(/,/g, ' ');

    // Remove other problematic chars but keep quotes, hyphens, letters, digits, spaces
    query = query.replace(/[^a-zA-ZåäöÅÄÖéèüûîïôñ0-9\s"'\-]/g, ' ');

    // Normalize whitespace
    query = query.replace(/\s+/g, ' ').trim();

    // Parse into terms (preserving quoted groups)
    const terms = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < query.length; i++) {
      const ch = query[i];
      if (ch === '"' && !inQuote) { inQuote = true; current += ch; }
      else if (ch === '"' && inQuote) { inQuote = false; current += ch; terms.push(current.trim()); current = ''; }
      else if (ch === ' ' && !inQuote) { if (current.trim()) terms.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    if (current.trim()) terms.push(current.trim());

    // Filter out noise words (too short, generic Swedish filler, company suffixes)
    const noise = new Set(['a', 'i', 'av', 'en', 'ett', 'och', 'med', 'för', 'den', 'det', 'som', 'till', 'på',
                           'ab', 'a/s', 'as', 'co', 'st', 'ca', 'mm', 'cm', 'kg', 'nr']);
    const filtered = terms.filter(t => {
      const clean = t.replace(/"/g, '').toLowerCase();
      return clean.length >= 2 && !noise.has(clean);
    });

    // Cap at 6 terms max to keep URL reasonable
    const MAX_TERMS = 6;
    const capped = filtered.slice(0, MAX_TERMS);

    return capped.join(' ');
  }

  // NEW: Format artist name for search queries to ensure it's treated as one entity
  formatArtistForSearch(artistName) {
    if (!artistName || typeof artistName !== 'string') {
      return '';
    }
    
    // Trim and normalize the artist name
    const cleanArtist = artistName.trim().replace(/,\s*$/, ''); // Remove trailing commas
    
    // Check if artist name contains multiple words (indicates full name)
    const words = cleanArtist.split(/\s+/).filter(word => word.length > 0);
    
    if (words.length > 1) {
      // Multiple words - wrap in quotes to treat as single entity
      const quotedArtist = `"${cleanArtist}"`;
      return quotedArtist;
    } else {
      // Single word - no quotes needed
      return cleanArtist;
    }
  }

  // Main method to analyze comparable sales for an item
  async analyzeComparableSales(artistName, objectType, period, technique, currentValuation = null, searchQueryManager = null, itemData = null) {


    // Ensure company exclusion setting is loaded before searching
    await this.loadExcludeCompanySetting();

    try {
      let bestResult = null;
      let totalMatches = 0;
      let usedStrategy = null; // Track which strategy was actually used
      let artistSearchResults = 0; // NEW: Track artist-only search results
      
      // 🚨 CRITICAL SSoT ENFORCEMENT: Check for user-selected SSoT query FIRST
      if (searchQueryManager && searchQueryManager.getCurrentQuery()) {
        const ssotQuery = searchQueryManager.getCurrentQuery();
        const querySource = searchQueryManager.getQuerySource ? searchQueryManager.getQuerySource() : 'unknown';
        const rawMetadata = searchQueryManager.getCurrentMetadata ? searchQueryManager.getCurrentMetadata() : {};
        
        
        
        // Check BOTH raw source and mapped source for user selection detection
        const isUserSelection = 
          querySource === 'användarval' || 
          querySource === 'user_selection' || 
          querySource.includes('användar') ||
          rawMetadata.source === 'user_selection' ||
          rawMetadata.source === 'användarval' ||
          rawMetadata.source === 'user_modified';
        
        
        
        // If this is a user selection, ONLY use SSoT query (no fallbacks)
        if (isUserSelection) {
          
          const ssotResult = await this.searchAuctionResults(ssotQuery, `User-Selected SSoT Query: ${ssotQuery}`);
          
          if (ssotResult && ssotResult.soldItems.length > 0) {

            bestResult = ssotResult;
            totalMatches = ssotResult.totalEntries;
            usedStrategy = { 
              query: ssotQuery, 
              description: "User-Selected SSoT Query (strict)",
              source: "user_ssot" 
            };
          } else {
            // 🔒 NO FALLBACKS - respect user's specific search choices even if low results
            bestResult = ssotResult || { soldItems: [], totalEntries: 0 };
            totalMatches = ssotResult?.totalEntries || 0;
            usedStrategy = { 
              query: ssotQuery, 
              description: "User-Selected SSoT Query (respected choice)",
              source: "user_ssot" 
            };
          }
        } else {
          // AI-generated query - can use with fallbacks if needed
          const ssotResult = await this.searchAuctionResults(ssotQuery, `AI-Generated SSoT Query: ${ssotQuery}`);
          
          if (ssotResult && ssotResult.soldItems.length >= 3) {

            bestResult = ssotResult;
            totalMatches = ssotResult.totalEntries;
            usedStrategy = { 
              query: ssotQuery, 
              description: "AI-Generated SSoT Query",
              source: "ai_ssot" 
            };
          } else {
            // Continue to fallback logic below
          }
        }
      }
      
      // Only use fallback strategies if no SSoT query or AI-generated query with insufficient results
      if (!bestResult || bestResult.soldItems.length === 0) {
        
        // PRIORITY 1: Try the canonical query first (from centralized SearchQueryBuilder)
        const formattedArtist = this.formatArtistForSearch(artistName);
        const basicQuery = [formattedArtist, objectType, period, technique].filter(Boolean).join(' ');

        const canonicalResult = await this.searchAuctionResults(basicQuery, "Basic combined query");
        
        if (canonicalResult && canonicalResult.soldItems.length >= 3) {
          // Canonical query succeeded with good results - use it!

          bestResult = canonicalResult;
          totalMatches = canonicalResult.totalEntries;
          usedStrategy = { 
            query: basicQuery, 
            description: "Basic combined query",
            source: "Direct search" 
          };
        } else {
          
          // FALLBACK: Build search strategies with different levels of specificity
          const searchStrategies = this.buildSearchStrategies(artistName, objectType, period, technique);
          
          // Try each search strategy until we get good results
          for (const strategy of searchStrategies) {

            
            const result = await this.searchAuctionResults(strategy.query, strategy.description);
            
            // NEW: Track artist-only search results for comparison
            if (strategy.description.includes('Artist only') && result && result.soldItems) {
              artistSearchResults = result.soldItems.length;

            }
            
                          if (result && result.soldItems.length > 0) {
                // Use the first strategy that gives us results, or combine results
                if (!bestResult || result.soldItems.length > bestResult.soldItems.length) {
                  bestResult = result;
                  totalMatches = result.totalEntries;
                  usedStrategy = strategy; // Store the winning strategy
                }
                
                // Stop if we have enough data (5+ items)
                if (result.soldItems.length >= 5) {
                  break;
                }
              }
          }
        }
      }

      if (!bestResult || bestResult.soldItems.length === 0) {
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

      // Analyze the market data (pass itemData for AI relevance filtering)
      const marketAnalysis = await this.analyzeMarketData(bestResult.soldItems, artistName, objectType, totalMatches, currentValuation, itemData);
      

      
      return {
        hasComparableData: true,
        dataSource: 'auctionet_api',
        totalMatches: totalMatches,
        analyzedSales: marketAnalysis.aiFilteredCount || bestResult.soldItems.length,
        priceRange: marketAnalysis.priceRange,
        confidence: marketAnalysis.confidence,
        marketContext: marketAnalysis.marketContext,
        recentSales: marketAnalysis.recentSales,
        trendAnalysis: marketAnalysis.trendAnalysis,
        limitations: marketAnalysis.limitations,
        exceptionalSales: marketAnalysis.exceptionalSales,
        statistics: marketAnalysis.statistics,
        aiValidated: marketAnalysis.aiValidated || false,
        aiFilteredCount: marketAnalysis.aiFilteredCount || null,
        aiOriginalCount: marketAnalysis.aiOriginalCount || null,
        actualSearchQuery: usedStrategy ? usedStrategy.query : null,
        searchStrategy: usedStrategy ? usedStrategy.description : null,
        artistSearchResults: artistSearchResults
      };

    } catch (error) {
      console.error('Auctionet API error:', error);
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

  // NEW: Analyze live auctions for current market activity
  async analyzeLiveAuctions(artistName, objectType, period, technique, searchQueryManager = null) {

    
    // 🚨 CRITICAL SSoT ENFORCEMENT: ONLY use SearchQueryManager SSoT query - NO FALLBACKS
    let bestResult = null;
    let usedStrategy = null;
    let totalMatches = 0;
    
    // STRICT SSoT: Use SearchQueryManager SSoT query EXCLUSIVELY
    if (searchQueryManager && searchQueryManager.getCurrentQuery()) {
      const ssotQuery = searchQueryManager.getCurrentQuery();

      
      const ssotResult = await this.searchLiveAuctions(ssotQuery, `SSoT Query: ${ssotQuery}`);
              if (ssotResult && ssotResult.liveItems && ssotResult.liveItems.length > 0) {
        bestResult = ssotResult;
        usedStrategy = {
          query: ssotQuery,
          description: 'SearchQueryManager SSoT',
          source: 'ssot'
        };
        totalMatches = ssotResult.totalEntries;
              } else {
        // 🔒 NO FALLBACKS - respect Single Source of Truth even if zero results
        // This ensures live auction query is IDENTICAL to historical query
        usedStrategy = {
          query: ssotQuery,
          description: 'SearchQueryManager SSoT (zero results)',
          source: 'ssot'
        };
      }
          } else {
      return null;
    }
    
    // 🚨 REMOVED: All fallback search strategies eliminated to enforce SSoT compliance
    // Historical: "Yamaha DX7" ✅ 
    // Live: "Yamaha DX7" ✅ (even if zero results)
    // NEVER: "yamaha yamaha" or any other fallback queries
      
          if (!bestResult || (bestResult && bestResult.liveItems.length === 0)) {
      
      // Return empty result but with correct SSoT query for dashboard consistency
      return {
        hasLiveData: false,
        dataSource: 'auctionet_live_ssot',
        totalMatches: 0,
        analyzedLiveItems: 0,
        currentEstimates: null,
        currentBids: null,
        marketActivity: null,
        liveItems: [],
        marketSentiment: 'no_data',
        actualSearchQuery: usedStrategy.query,  // 🔒 Always use SSoT query
        searchStrategy: usedStrategy.description
      };
    }
    
    // Analyze live auction data
    const liveAnalysis = this.analyzeLiveMarketData(bestResult.liveItems, artistName, objectType);
    
    
    
    return {
      hasLiveData: true,
      dataSource: 'auctionet_live_ssot',
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
  }

  // NEW: Search live auctions (without is=ended parameter)
  async searchLiveAuctions(query, description, maxResults = 200) {
    // Sanitize query to prevent overly long URLs that trigger 403
    query = this.sanitizeSearchQuery(query);
    // AUCTIONET FIX: Ensure all search terms are quoted so Auctionet treats them as required.
    query = this.ensureAllTermsQuoted(query);
    
    // Check cache first (shorter cache for live data)
    // Include excludeCompanyId in cache key to ensure exclusion settings are respected
    const cacheKey = `live_${query}_${maxResults}_exclude_${this.excludeCompanyId || 'none'}`;
    const cached = this.getCachedResult(cacheKey, 5 * 60 * 1000); // 5 minute cache for live data
    if (cached) {
      return cached;
    }
    
    try {
      // No is=ended parameter for live auctions
      const url = `${this.baseUrl}?q=${encodeURIComponent(query)}&per_page=${maxResults}`;

      
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.items || data.items.length === 0) {
        return null;
      }
      
      
      
      // Filter for active auctions with bidding activity
      const allActiveItems = data.items.filter(item => 
        !item.hammered && // Not yet sold
        item.state === 'published' && // Active
        item.ends_at > (Date.now() / 1000) // Not ended
      );
      
      
      
      // Apply company exclusion filter
      const filteredItems = allActiveItems.filter(item => {
        if (this.excludeCompanyId && item.company_id && item.company_id.toString() === this.excludeCompanyId) {
          return false;
        }
        return true;
      });
      
      // CRITICAL FIX: Validate relevance for fallback searches to prevent misleading results
      let liveItems = filteredItems;
      
      // Only apply relevance filtering for broad fallback searches (not specific SSoT queries)
      if (description.includes('Brand only') || description.includes('generic') || query.split(' ').length === 1) {

        
        // For synthesizer searches, ensure items are actually synthesizers/keyboards
        if (description.toLowerCase().includes('synthesizer') || query.toLowerCase().includes('synthesizer')) {
          const originalCount = liveItems.length;
          liveItems = liveItems.filter(item => {
            const title = item.title.toLowerCase();
            const isRelevant = title.includes('synthesizer') || title.includes('synth') || 
                              title.includes('keyboard') || title.includes('piano') ||
                              title.includes('dx7') || title.includes('juno') || 
                              title.includes('jupiter') || title.includes('moog');
            
            
            return isRelevant;
          });
          

        }
        
        // For watch searches, ensure items are actually watches
        else if (description.toLowerCase().includes('watch') || query.toLowerCase().includes('klocka') || query.toLowerCase().includes('armbandsur')) {
          const originalCount = liveItems.length;
          liveItems = liveItems.filter(item => {
            const title = item.title.toLowerCase();
            const isRelevant = title.includes('klocka') || title.includes('armbandsur') || 
                              title.includes('fickur') || title.includes('watch') ||
                              title.includes('timepiece') || title.includes('ur');
            
            
            return isRelevant;
          });
          

        }
              }
      
      // Transform to our format
      const transformedItems = liveItems.map(item => ({
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
      

      
      const result = {
        totalEntries: data.pagination.total_entries,
        returnedItems: data.items.length,
        liveItems: transformedItems
      };
      
      // Cache the result (shorter cache for live data)
      this.setCachedResult(cacheKey, result, 5 * 60 * 1000); // 5 minutes
      
      return result;
      
    } catch (error) {
      console.error(`Live search failed for"${description}":`, error);
      return null;
    }
  }

  // NEW: Analyze live market data
  analyzeLiveMarketData(liveItems, artistName, objectType) {

    
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
    
    const strategies = [];
    
    // Format artist name for consistent search behavior
    const formattedArtist = this.formatArtistForSearch(artistName);
    
    // NEW: Check if this is a jewelry-specific search that might need fallbacks
    const isJewelrySearch = this.isJewelrySpecificSearch(artistName);
    
    if (isJewelrySearch) {
      return this.buildJewelrySearchStrategies(artistName, objectType, technique);
    }

    // NEW: Check if this is a watch-specific search that might need fallbacks
    const isWatchSearch = this.isWatchSpecificSearch(artistName);
    
    if (isWatchSearch) {
      return this.buildWatchSearchStrategies(artistName, objectType, technique);
    }
    
    // NEW: Check if this is a musical instrument search that might need fallbacks
    const isInstrumentSearch = this.isInstrumentSpecificSearch(artistName);
    
    if (isInstrumentSearch) {
      return this.buildInstrumentSearchStrategies(artistName, objectType, technique);
    }
    
    // Strategy 1: Artist + Object Type (most specific)
    if (formattedArtist && objectType) {
      const query = `${formattedArtist} ${objectType}`;

      strategies.push({
        query: query,
        description: `Artist + Object Type: "${formattedArtist} ${objectType}"`,
        weight: 1.0
      });
    }
    
    // Strategy 2: Artist + Technique
    if (formattedArtist && technique) {
      const query = `${formattedArtist} ${technique}`;

      strategies.push({
        query: query,
        description: `Artist + Technique: "${formattedArtist} ${technique}"`,
        weight: 0.9
      });
    }
    
    // Strategy 3: Artist + Period
    if (formattedArtist && period) {
      const query = `${formattedArtist} ${period}`;

      strategies.push({
        query: query,
        description: `Artist + Period: "${formattedArtist} ${period}"`,
        weight: 0.8
      });
    }
    
    // Strategy 4: Artist only (broader search)
    if (formattedArtist) {
      const query = formattedArtist;

      strategies.push({
        query: query,
        description: `Artist only: "${formattedArtist}"`,
        weight: 0.7
      });
    }
    
    // Strategy 5: Object Type + Technique + Period (no artist)
    if (objectType && technique && period) {
      const query = `${objectType} ${technique} ${period}`;

      strategies.push({
        query: query,
        description: `Object + Technique + Period: "${objectType} ${technique} ${period}"`,
        weight: 0.6
      });
    }
    
    // Strategy 6: Object Type + Period (broader)
    if (objectType && period) {
      const query = `${objectType} ${period}`;

      strategies.push({
        query: query,
        description: `Object + Period: "${objectType} ${period}"`,
        weight: 0.5
      });
    }
    

    return strategies;
  }

  // NEW: Check if search string is jewelry-specific
  isJewelrySpecificSearch(searchString) {
    if (!searchString) return false;
    
    const jewelryTypes = ['ring', 'armband', 'halsband', 'örhängen', 'brosch', 'klocka'];
    const hasJewelryType = jewelryTypes.some(type => searchString.toLowerCase().includes(type));
    
    // Check for specific measurements or weight that indicate very specific jewelry search
    const hasSpecificMeasurements = /(?:gram|längd|diameter|storlek|cm|mm)/.test(searchString.toLowerCase());
    
    return hasJewelryType && hasSpecificMeasurements;
  }

  // NEW: Build jewelry-specific search strategies with progressive fallbacks
  buildJewelrySearchStrategies(fullSearchString, objectType, technique) {
    
    const strategies = [];
    
    // Extract components from the full search string
    const parts = fullSearchString.toLowerCase().split(' ');
    const jewelryType = parts[0]; // e.g., "armband", "ring"
    const materials = parts.filter(part => /(?:18k|guld|gold|silver|platina)/.test(part));
    const weights = parts.filter(part => /(?:\d+[.,]?\d*\s*gram)/.test(part));
    const sizes = parts.filter(part => /(?:längd|diameter|storlek)/.test(part));
    

    
    // Strategy 1: Full specific search (original)
    strategies.push({
      query: fullSearchString,
      description: `Jewelry specific: "${fullSearchString}"`,
      weight: 1.0
    });
    
    // Strategy 2: Type + materials only (no weight/size)
    if (materials.length > 0) {
      const query = `${jewelryType} ${materials.join(' ')}`;
      strategies.push({
        query: query,
        description: `Jewelry material: "${query}"`,
        weight: 0.8
      });
    }
    
    // Strategy 3: Type + broader material search
    if (materials.some(m => m.includes('18k'))) {
      const query = `${jewelryType} guld`;
      strategies.push({
        query: query,
        description: `Jewelry broad material: "${query}"`,
        weight: 0.6
      });
    } else if (materials.some(m => m.includes('silver'))) {
      const query = `${jewelryType} silver`;
      strategies.push({
        query: query,
        description: `Jewelry broad material: "${query}"`,
        weight: 0.6
      });
    }
    
    // Strategy 4: Just the jewelry type (broadest)
    strategies.push({
      query: jewelryType,
      description: `Jewelry type only: "${jewelryType}"`,
      weight: 0.4
    });
    

    return strategies;
  }

  // NEW: Check if search string is watch-specific
  isWatchSpecificSearch(searchString) {
    if (!searchString) return false;
    
    const watchTypes = ['armbandsur', 'fickur', 'klocka', 'watch', 'wristwatch', 'timepiece'];
    return watchTypes.some(type => searchString.toLowerCase().includes(type));
  }

  // NEW: Build watch-specific search strategies with progressive fallbacks
  buildWatchSearchStrategies(fullSearchString, objectType, technique) {
    
    const strategies = [];
    
    // Extract components from the watch search string
    const parts = fullSearchString.toLowerCase().split(' ');
    const watchType = parts[0]; // e.g., "armbandsur", "fickur"
    
    // Common watch brands that might appear in search
    const watchBrands = ['rolex', 'omega', 'lings', 'halda', 'tissot', 'longines', 'seiko', 'citizen'];
    const brands = parts.filter(part => watchBrands.some(brand => part.includes(brand)));
    
    // Common materials
    const materials = parts.filter(part => /(?:guld|gold|silver|platina|doublé|stål|steel)/.test(part));
    

    
    // Strategy 1: Full specific search (original - but only if short enough)
    if (fullSearchString.length <= 30) {
      strategies.push({
        query: fullSearchString,
        description: `Watch specific: "${fullSearchString}"`,
        weight: 1.0
      });
    }
    
    // Strategy 2: Type + brand only (most important for watches)
    if (brands.length > 0) {
      const query = `${watchType} ${brands[0]}`;
      strategies.push({
        query: query,
        description: `Watch brand: "${query}"`,
        weight: 0.9
      });
    }
    
    // Strategy 3: Type + material (for luxury watches)
    if (materials.length > 0) {
      const primaryMaterial = materials.includes('guld') ? 'guld' : 
                             materials.includes('gold') ? 'guld' :
                             materials.includes('silver') ? 'silver' :
                             materials.includes('platina') ? 'platina' : materials[0];
      const query = `${watchType} ${primaryMaterial}`;
      strategies.push({
        query: query,
        description: `Watch material: "${query}"`,
        weight: 0.7
      });
    }
    
    // Strategy 4: Just the watch type (broadest fallback)
    strategies.push({
      query: watchType,
      description: `Watch type only: "${watchType}"`,
      weight: 0.5
    });
    

    return strategies;
  }

  // NEW: Check if search string is musical instrument-specific
  isInstrumentSpecificSearch(searchString) {
    if (!searchString) return false;
    
    const instrumentTypes = [
      'flygel', 'piano', 'pianino', 'klaver', 'keyboard',
      'violin', 'viola', 'cello', 'kontrabas', 'fiol', 'altfiol',
      'gitarr', 'guitar', 'banjo', 'mandolin', 'luta', 'harp', 'harpa',
      'flöjt', 'flute', 'klarinett', 'oboe', 'fagott', 'saxofon',
      'trumpet', 'kornett', 'trombon', 'tuba', 'horn',
      'orgel', 'harmonium', 'dragspel', 'accordion',
      'trummor', 'drums', 'cymbaler', 'timpani', 'xylofon',
      // SYNTHESIZERS & ELECTRONIC INSTRUMENTS
      'synthesizer', 'synth', 'synthesiser', 'syntetiserare', 'syntheziser',
      'keyboard', 'drum machine', 'trummaskin', 'sampler', 'sequencer',
      'moog', 'roland', 'yamaha', 'korg', 'arp', 'oberheim', 'sequential'
    ];
    
    const instrumentBrands = [
      'steinway', 'yamaha', 'kawai', 'grotrian', 'bechstein', 'blüthner',
      'petrof', 'estonia', 'seiler', 'schimmel', 'ibach', 'nordiska',
      // SYNTHESIZER BRANDS
      'roland', 'korg', 'moog', 'sequential', 'oberheim', 'arp', 'ensoniq',
      'kurzweil', 'akai', 'emu', 'fairlight', 'synclavier', 'nord'
    ];
    
    const searchLower = searchString.toLowerCase();
    const hasInstrumentType = instrumentTypes.some(type => searchLower.includes(type));
    const hasInstrumentBrand = instrumentBrands.some(brand => searchLower.includes(brand));
    
    return hasInstrumentType || hasInstrumentBrand;
  }

  // NEW: Build instrument-specific search strategies with progressive fallbacks
  buildInstrumentSearchStrategies(fullSearchString, objectType, technique) {
    
    const strategies = [];
    
    // Extract components from the instrument search string
    const parts = fullSearchString.toLowerCase().split(' ');
    const instrumentType = parts[0]; // e.g., "flygel", "piano", "synthesizer"
    
    // SYNTHESIZER-SPECIFIC DETECTION AND STRATEGIES
    const isSynthesizerSearch = /synthesizer|synth|keyboard|drum machine|sampler/.test(fullSearchString.toLowerCase());
    
    if (isSynthesizerSearch) {
      
      // Extract synthesizer brands and models
      const synthBrands = ['yamaha', 'roland', 'korg', 'moog', 'sequential', 'oberheim', 'arp', 'ensoniq', 'kurzweil', 'akai'];
      const brands = parts.filter(part => synthBrands.some(brand => part.includes(brand)));
      
      // Extract model numbers (like DX7, SH101, JP8000)
      const models = parts.filter(part => /^[a-z]{1,4}\d{1,4}[a-z]*$/i.test(part));
      
      
      // STRATEGY 1: Brand + Model (MOST IMPORTANT for synthesizers)
      if (brands.length > 0 && models.length > 0) {
        const query = `${brands[0]} ${models[0]}`;
        strategies.push({
          query: query,
          description: `Synthesizer Brand+Model: "${query}"`,
          weight: 1.0
        });
      }
      
      // STRATEGY 2: Model only (like "DX7")
      if (models.length > 0) {
        const query = models[0];
        strategies.push({
          query: query,
          description: `Synthesizer Model: "${query}"`,
          weight: 0.9
        });
      }
      
      // STRATEGY 3: Brand + synthesizer type
      if (brands.length > 0) {
        const query = `${brands[0]} synthesizer`;
        strategies.push({
          query: query,
          description: `Synthesizer Brand: "${query}"`,
          weight: 0.8
        });
      }
      
      // STRATEGY 4: Brand only (broadest brand search)
      if (brands.length > 0) {
        const query = brands[0];
        strategies.push({
          query: query,
          description: `Brand only: "${query}"`,
          weight: 0.7
        });
      }
      
      // STRATEGY 5: Generic synthesizer search (fallback)
      strategies.push({
        query: 'synthesizer',
        description: `Synthesizer generic: "synthesizer"`,
        weight: 0.5
      });
      
      return strategies;
    }
    
    // TRADITIONAL INSTRUMENT SEARCH STRATEGIES (piano, violin, etc.)
    // Common instrument brands that might appear in search
    const instrumentBrands = [
      'steinway', 'yamaha', 'kawai', 'grotrian', 'bechstein', 'blüthner',
      'petrof', 'estonia', 'seiler', 'schimmel', 'ibach', 'nordiska', 'steinweg'
    ];
    const brands = parts.filter(part => instrumentBrands.some(brand => part.includes(brand)));
    
    // Common materials for instruments
    const materials = parts.filter(part => /(?:valnöt|walnut|eben|ebony|mahogny|mahogany|lönn|maple|trä|wood)/.test(part));
    
    // Extract periods if present
    const periods = parts.filter(part => /(?:19\d{2}|20\d{2}|\d{2}-tal)/.test(part));
    
    
    // Strategy 1: Type + brand only (most important for instruments - skip overly complex search)
    if (brands.length > 0) {
      const query = `${instrumentType} ${brands[0]}`;
      strategies.push({
        query: query,
        description: `Instrument brand: "${query}"`,
        weight: 1.0
      });
    } else {
      // Strategy 1b: Full search only if reasonably short (avoid "flygel 1941 1941 valnöt braun")
      if (fullSearchString.length <= 25 && !fullSearchString.includes('1941 1941')) {
        strategies.push({
          query: fullSearchString,
          description: `Instrument specific: "${fullSearchString}"`,
          weight: 1.0
        });
      }
    }
    
    // Strategy 2: Type + material (for valuable materials)
    if (materials.length > 0) {
      const primaryMaterial = materials.includes('valnöt') ? 'valnöt' : 
                             materials.includes('eben') ? 'eben' :
                             materials.includes('mahogny') ? 'mahogny' : materials[0];
      const query = `${instrumentType} ${primaryMaterial}`;
      strategies.push({
        query: query,
        description: `Instrument material: "${query}"`,
        weight: 0.8
      });
    }
    
    // Strategy 3: Type + period (for vintage instruments)
    if (periods.length > 0 && periods[0] !== '1941') { // Skip problematic year extraction
      const query = `${instrumentType} ${periods[0]}`;
      strategies.push({
        query: query,
        description: `Instrument period: "${query}"`,
        weight: 0.7
      });
    }
    
    // Strategy 4: Just the instrument type (broadest fallback)
    strategies.push({
      query: instrumentType,
      description: `Instrument type only: "${instrumentType}"`,
      weight: 0.5
    });
    
    return strategies;
  }

  // Search Auctionet API for auction results
  async searchAuctionResults(query, description, maxResults = 200) {
    // Sanitize query: remove slashes, commas, and other problematic characters;
    // limit to max 6 meaningful terms to avoid overly long URLs that trigger 403.
    query = this.sanitizeSearchQuery(query);

    // AUCTIONET FIX: Ensure all search terms are quoted so Auctionet treats them as required.
    // Unquoted terms are treated as optional/fuzzy by Auctionet's search engine.
    query = this.ensureAllTermsQuoted(query);
    
    // Check cache first
    const cacheKey = `search_${query}_${maxResults}`;
    const cached = this.getCachedResult(cacheKey);
    if (cached) {
      return cached;
    }
    
    try {
      // --- Paginated fetching for better data coverage ---
      const MIN_QUALITY_ITEMS = 25;  // Target: at least 25 usable items for reliable analysis
      const MAX_PAGES = 4;           // Cap: max 4 pages (800 items) to keep it responsive
      const PER_PAGE = 200;
      
      let allRawItems = [];
      let totalEntries = 0;
      let totalReturnedItems = 0;
      let page = 1;
      let hasMorePages = true;
      
      while (page <= MAX_PAGES && hasMorePages) {
        const url = `${this.baseUrl}?is=ended&q=${encodeURIComponent(query)}&per_page=${PER_PAGE}&page=${page}`;
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.items || data.items.length === 0) {
          if (page === 1) return null; // No results at all
          break; // No more items on this page
        }
        
        if (page === 1) {
          totalEntries = data.pagination.total_entries;
        }
        totalReturnedItems += data.items.length;
        allRawItems = allRawItems.concat(data.items);
        
        // Check if there are more pages
        const totalPages = Math.ceil(totalEntries / PER_PAGE);
        hasMorePages = page < totalPages;
        
        // After first page, check if we already have enough quality items
        if (page >= 1) {
          const quickFilter = allRawItems.filter(item => 
            (!item.currency || item.currency === 'SEK') &&
            item.hammered && item.bids && item.bids.length > 0 && item.bids[0].amount > 0
          );
          if (quickFilter.length >= MIN_QUALITY_ITEMS) {
            break; // We have enough good data
          }
        }
        
        page++;
      }
      
      // Filter for sold items with valid price data
      const soldItems = allRawItems.filter(item => {
        if (item.currency && item.currency !== 'SEK') return false;
        
        const hasValidPrice = (item.hammered && item.bids && item.bids.length > 0 && item.bids[0].amount > 0) ||
                              (item.estimate && item.estimate > 0) ||
                              (item.upper_estimate && item.upper_estimate > 0);
        
        const isHistoricalItem = item.hammered || 
                                 (item.ends_at && item.ends_at < (Date.now() / 1000)) ||
                                 item.state === 'ended';
        
        return hasValidPrice && isHistoricalItem;
      });
      
      // Validate search results for data quality when no specific artist
      const isGenericSearch = !description.includes('Artist') || description.includes('freetext') || description.includes('Object +');
      let validatedItems = soldItems;
      
      if (isGenericSearch && soldItems.length > 3) {
        validatedItems = this.validateSearchResults(soldItems, query, description);
      }
      
      // Lenient fallback if validation was too strict
      if (validatedItems.length === 0) {
        const lenientItems = allRawItems.filter(item => {
          if (item.currency && item.currency !== 'SEK') return false;
          return item.estimate > 0 || item.upper_estimate > 0 || 
                 (item.bids && item.bids.length > 0);
        });
        
        if (lenientItems.length > 0) {
          const result = {
            totalEntries: totalEntries,
            returnedItems: totalReturnedItems,
            soldItems: lenientItems.map(item => this._transformSoldItem(item, 'lenient')),
            dataQuality: 'lenient'
          };
          this.setCachedResult(cacheKey, result);
          return result;
        }
      }

      const dataQuality = isGenericSearch ? 'validated' : 'artist_specific';
      const result = {
        totalEntries: totalEntries,
        returnedItems: totalReturnedItems,
        soldItems: validatedItems.map(item => this._transformSoldItem(item, dataQuality)),
        dataQuality: dataQuality
      };
      
      this.setCachedResult(cacheKey, result);
      return result;
      
    } catch (error) {
      console.error(`Search failed for "${description}":`, error);
      return null;
    }
  }

  // Helper: Transform raw API item to internal format
  _transformSoldItem(item, dataQuality) {
    return {
      title: item.title,
      finalPrice: item.bids && item.bids.length > 0 ? item.bids[0].amount : null,
      currency: item.currency,
      estimate: item.estimate,
      house: item.house,
      location: item.location,
      endDate: new Date(item.ends_at * 1000),
      bidDate: item.bids && item.bids.length > 0 ? 
               new Date(item.bids[0].timestamp * 1000) : 
               new Date(item.ends_at * 1000),
      reserveMet: item.reserve_met,
      reserveAmount: item.reserve_amount,
      description: item.description,
      condition: item.condition,
      url: this.convertToSwedishUrl(item.url),
      isEstimateBasedPrice: !(item.bids && item.bids.length > 0),
      dataQuality: dataQuality
    };
  }

  // NEW: Validate search results to prevent mixed/irrelevant data from skewing analysis
  validateSearchResults(soldItems, query, description) {

    
    if (soldItems.length <= 3) {
      return soldItems;
    }
    
    // Extract prices for analysis
    const prices = soldItems.map(item => {
      if (item.bids && item.bids.length > 0) {
        return item.bids[0].amount;
      } else if (item.estimate) {
        return item.estimate;
      } else if (item.upper_estimate) {
        return item.upper_estimate;
      }
      return null;
    }).filter(price => price && price > 0);
    
    if (prices.length < 3) {
      return soldItems;
    }
    
    // 1. Check for extreme price variations that indicate mixed markets
    const sortedPrices = prices.sort((a, b) => a - b);
    const lowestPrice = sortedPrices[0];
    const highestPrice = sortedPrices[sortedPrices.length - 1];
    const priceRatio = highestPrice / lowestPrice;
    

    
    /* DISABLED - WAS FILTERING OUT EXPENSIVE OMEGA WATCHES
    // IMPORTANT: For luxury brands like OMEGA, high-value items are legitimate, not outliers
    // Only filter if we have truly extreme ratios (>200x) that indicate data quality issues
    if (priceRatio > 200) {
      
      // Calculate quartiles for outlier detection
      const q1Index = Math.floor(prices.length * 0.25);
      const q3Index = Math.floor(prices.length * 0.75);
      const q1 = sortedPrices[q1Index];
      const q3 = sortedPrices[q3Index];
      const iqr = q3 - q1;
      
      // Use VERY conservative outlier bounds - only remove obvious data errors
      // Changed from 1.5 * IQR to 5.0 * IQR to preserve legitimate high-value items
      const lowerBound = q1 - (5.0 * iqr);
      const upperBound = q3 + (5.0 * iqr);
      
      
      // Filter out only truly extreme outliers (likely data errors)
      const filteredItems = soldItems.filter(item => {
        const itemPrice = item.bids && item.bids.length > 0 ? item.bids[0].amount : 
                         item.estimate ? item.estimate : item.upper_estimate;
        
        if (!itemPrice) return true; // Keep items without prices
        
        const isWithinBounds = itemPrice >= lowerBound && itemPrice <= upperBound;
        
        return isWithinBounds;
      });
      
      return filteredItems;
    }
    */
    
    // 2. Check for title/content consistency to avoid mixing different object types
    const keyTerms = query.toLowerCase().split(' ').filter(term => term.length > 2);
    
    if (keyTerms.length > 0) {
      const consistentItems = soldItems.filter(item => {
        const titleLower = item.title.toLowerCase();
        const descLower = (item.description || '').toLowerCase();
        
        // IMPROVED: For artist searches, require stricter matching to prevent irrelevant results
        // Check if this appears to be an artist search (person names)
        const hasPersonName = keyTerms.some(term => 
          term.length > 3 && /^[a-zåäöü]+$/.test(term) && 
          (keyTerms.includes(term + 's') || keyTerms.some(other => other !== term && other.length > 3))
        );
        
        if (hasPersonName) {
          // For artist searches: require ALL person name terms to be in the title
          const personNameTerms = keyTerms.filter(term => 
            term.length > 3 && /^[a-zåäöü]+$/.test(term)
          );
          
          const hasAllNameTermsInTitle = personNameTerms.every(term => titleLower.includes(term));
          
          if (!hasAllNameTermsInTitle) {
            return false;
          }
          
          // Also check for object-type terms in title or description
          const objectTerms = keyTerms.filter(term => 
            !personNameTerms.includes(term) && term.length > 2
          );
          
          if (objectTerms.length > 0) {
            const fullText = `${titleLower} ${descLower}`;
            const hasObjectTerm = objectTerms.some(term => fullText.includes(term));
            
            if (!hasObjectTerm) {
              return false;
            }
          }
          
          return true;
        } else {
          // For non-artist searches: use the existing logic (at least one term anywhere)
          const fullText = `${titleLower} ${descLower}`;
          const hasKeyTerm = keyTerms.some(term => fullText.includes(term));
          
          
          
          return hasKeyTerm;
        }
      });
      
      
      if (consistentItems.length >= 3) {
        return consistentItems;
      }
    }
    
    // 3. If we still have many items, check for time period clustering
    // Items from very different time periods might indicate mixed markets
    const itemDates = soldItems.map(item => item.endDate || item.bidDate).filter(date => date);
    
    if (itemDates.length > 5) {
      const dateSpanYears = (Math.max(...itemDates) - Math.min(...itemDates)) / (1000 * 60 * 60 * 24 * 365);
      
      if (dateSpanYears > 10) {
        
        // Keep items from the last 5 years for more relevant data
        const fiveYearsAgo = new Date();
        fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
        
        const recentItems = soldItems.filter(item => {
          const itemDate = item.endDate || item.bidDate;
          return itemDate >= fiveYearsAgo;
        });
        
        if (recentItems.length >= 3) {
          return recentItems;
        }
      }
    }
    
    return soldItems;
  }

  // AI-powered relevance validation using Claude Haiku
  // Filters out irrelevant Auctionet results by comparing each result against the item's full context
  async validateResultRelevance(soldItems, itemData) {
    // Guard: need APIManager reference, API key, and item data
    if (!this._apiManager || !this._apiManager.apiKey || !itemData) {
      return null; // Return null = use unfiltered results
    }

    try {
      // Build compact result list (title + price only to minimize tokens)
      const resultLines = soldItems.map((item, i) => {
        return `${i + 1}. ${item.title} | ${item.finalPrice} SEK`;
      }).join('\n');

      // Build item context from form fields
      const itemContext = [
        itemData.title ? `Titel: ${itemData.title}` : '',
        itemData.category ? `Kategori: ${itemData.category}` : '',
        itemData.description ? `Beskrivning: ${itemData.description.substring(0, 200)}` : '',
        itemData.artist ? `Konstnär/Formgivare: ${itemData.artist}` : '',
        itemData.condition ? `Skick: ${itemData.condition.substring(0, 100)}` : ''
      ].filter(Boolean).join('\n');

      const prompt = `Du är expert på att värdera auktionsobjekt. Analysera vilka av dessa sålda auktionsobjekt som är JÄMFÖRBARA med objektet som ska värderas.

OBJEKTET SOM SKA VÄRDERAS:
${itemContext}

SÅLDA AUKTIONSRESULTAT (titel | slutpris):
${resultLines}

REGLER FÖR JÄMFÖRBARHET:
- Objektet måste vara av SAMMA TYP (t.ex. oljemålning vs oljemålning, inte oljemålning vs brosch)
- Storlek/format bör vara i samma storleksklass om det framgår
- Material/teknik bör matcha (t.ex. akvarell vs akvarell, inte akvarell vs olja)
- Bruksföremål (smycken, möbler, keramik) ska vara av liknande typ
- Om konstnär/formgivare matchar är det positivt men INTE tillräckligt om typen skiljer sig

Svara ENBART med en JSON-array. Varje element: {"i": nummer, "r": true/false}
Där "i" = resultatnummer (1-baserat), "r" = true om jämförbar, false om inte.
Ingen annan text.`;

      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this._apiManager.apiKey,
          body: {
            model: 'claude-haiku-4-5',
            max_tokens: 500,
            temperature: 0,
            messages: [{
              role: 'user',
              content: prompt
            }]
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.success) {
            resolve(response);
          } else {
            reject(new Error(response?.error || 'AI validation request failed'));
          }
        });
      });

      if (!response.success || !response.data?.content?.[0]?.text) {
        return null;
      }

      const text = response.data.content[0].text.trim();
      
      // Parse JSON response — extract array from potential markdown code block
      let parsed;
      try {
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          console.warn('AI validation: no JSON array found in response');
          return null;
        }
        parsed = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.warn('AI validation: failed to parse response:', e);
        return null;
      }

      // Filter soldItems based on Claude's relevance judgement
      const relevantIndices = new Set();
      for (const item of parsed) {
        if (item.r === true) {
          relevantIndices.add(item.i - 1); // Convert from 1-based to 0-based
        }
      }

      const filteredItems = soldItems.filter((_, index) => relevantIndices.has(index));

      // Only use filtered results if we have enough (at least 3)
      if (filteredItems.length >= 3) {
        console.log(`AI validation: kept ${filteredItems.length} of ${soldItems.length} results`);
        return filteredItems;
      } else {
        console.log(`AI validation: too few relevant items (${filteredItems.length}), using unfiltered`);
        return null;
      }

    } catch (error) {
      console.warn('AI validation failed, using unfiltered results:', error.message);
      return null; // Graceful fallback
    }
  }

  // Analyze market data from sold items
  async analyzeMarketData(soldItems, artistName, objectType, totalMatches = 0, currentValuation = null, itemData = null) {

    
    if (!soldItems || soldItems.length === 0) {
      return null;
    }
    
    // Count actual sales vs unsold items
    let actualSales = soldItems.filter(item => item.finalPrice > 0);
    const unsoldItems = soldItems.filter(item => item.finalPrice === 0);

    
    if (actualSales.length === 0) {
      return null;
    }
    
    // AI Relevance Validation: filter out irrelevant results when data is broad
    let aiValidated = false;
    let aiOriginalCount = actualSales.length;
    let aiFilteredCount = null;

    if (itemData && actualSales.length >= 8) {
      // Check spread ratio to decide if AI validation is needed
      const tempPrices = actualSales.map(item => item.finalPrice).filter(p => p > 0);
      const tempMin = Math.min(...tempPrices);
      const tempMax = Math.max(...tempPrices);
      const spreadRatio = tempMin > 0 ? tempMax / tempMin : Infinity;

      // Only invoke AI when spread is high (>5x) or sample is large (>15 items)
      if (spreadRatio > 5 || actualSales.length > 15) {
        const filtered = await this.validateResultRelevance(actualSales, itemData);
        if (filtered) {
          aiValidated = true;
          aiFilteredCount = filtered.length;
          actualSales = filtered;
        }
      }
    }

    // Extract prices from actual sales (possibly AI-filtered)
    const allPrices = actualSales.map(item => item.finalPrice).filter(price => price > 0);
    
    // CRITICAL: Extract exceptional sales BEFORE outlier filtering
    const exceptionalSales = this.detectExceptionalSales(actualSales, allPrices, currentValuation);

    // Apply IQR outlier removal for statistics (keeps data intact for display/trends)
    const sortedForIQR = [...allPrices].sort((a, b) => a - b);
    const prices = this.removeExtremeOutliers(sortedForIQR);
    
    // Calculate confidence based on all data
    const confidence = this.calculateConfidence(actualSales, artistName, objectType, totalMatches);
    
    // Analyze trends over time (only from actual sales)
    const trendAnalysis = this.analyzeTrends(actualSales, totalMatches);
    
    // Calculate statistics for market context
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const estimates = actualSales.filter(item => item.estimate > 0).map(item => item.estimate);
    
    // Generate market context (only from actual sales)
    const marketContext = this.generateMarketContext(actualSales, avgPrice, estimates, artistName, objectType);
    
    // Get recent sales for display (only actual sales)
    const recentSales = actualSales
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
    const limitations = this.generateLimitations(actualSales, artistName, objectType);
    
    return {
      priceRange,
      confidence,
      marketContext,
      recentSales,
      trendAnalysis,
      limitations,
      exceptionalSales,
      totalMatches,
      aiValidated,
      aiFilteredCount,
      aiOriginalCount,
      statistics: {
        average: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
        median: this.calculateMedian(prices),
        min: Math.min(...prices),
        max: Math.max(...prices),
        sampleSize: actualSales.length,
        totalMatches
      }
    };
  }

  // NEW: Detect exceptional high-value sales that should be highlighted
  detectExceptionalSales(soldItems, prices, currentValuation = null) {
    if (prices.length < 3) {
      return null; // Need enough data to determine what's exceptional
    }
    
    const sortedPrices = [...prices].sort((a, b) => a - b);
    const median = this.calculateMedian(sortedPrices);
    const q3 = sortedPrices[Math.floor(sortedPrices.length * 0.75)];
    
    // Define base exceptional threshold as significantly above Q3 (more than 3x median or 2x Q3)
    const baseThreshold = Math.max(median * 3, q3 * 2);
    
    // IMPROVED LOGIC: If current valuation exists, exceptional sales must be higher than valuation
    let exceptionalThreshold = baseThreshold;
    let valuationBasedFiltering = false;
    
    if (currentValuation && currentValuation > 0) {
      // Exceptional sales must be both statistically high AND above current valuation
      exceptionalThreshold = Math.max(baseThreshold, currentValuation);
      valuationBasedFiltering = true;
    }
    
    // Filter for confirmed sales (finalPrice exists) that meet our criteria
    const exceptionalSales = soldItems.filter(item => 
      item.finalPrice && // Must be a confirmed sale, not just an estimate
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
      priceVsEstimate: item.estimate ? Math.round((item.finalPrice / item.estimate) * 100) : null,
      priceVsValuation: currentValuation ? Math.round((item.finalPrice / currentValuation) * 100) : null
    }));
    
    if (exceptionalSales.length > 0) {
  
      exceptionalSales.forEach(sale => {
        const valuationInfo = sale.priceVsValuation ? ` (${sale.priceVsValuation}% av din värdering)` : '';

      });
    }
    
    // Generate appropriate description based on whether valuation was used
    let description;
    if (exceptionalSales.length === 0) {
      return null;
    } else if (exceptionalSales.length === 1) {
      const sale = exceptionalSales[0];
      if (valuationBasedFiltering && sale.priceVsValuation) {
        description = `En bekräftad försäljning på ${sale.price.toLocaleString()} SEK (${sale.priceVsValuation}% av din värdering)`;
      } else {
        description = `En exceptionell bekräftad försäljning på ${sale.price.toLocaleString()} SEK (${sale.priceVsMedian}% av medianpriset)`;
      }
    } else {
      if (valuationBasedFiltering) {
        const avgVsValuation = Math.round(exceptionalSales.reduce((sum, sale) => sum + (sale.priceVsValuation || 0), 0) / exceptionalSales.length);
        description = `${exceptionalSales.length} bekräftade försäljningar över din värdering (i snitt ${avgVsValuation}% av din värdering)`;
      } else {
        description = `${exceptionalSales.length} exceptionella bekräftade försäljningar över ${Math.round(exceptionalThreshold).toLocaleString()} SEK`;
      }
    }
    
    return {
      count: exceptionalSales.length,
      sales: exceptionalSales,
      threshold: exceptionalThreshold,
      description: description,
      valuationBased: valuationBasedFiltering
    };
  }

  // Calculate confidence score based on data quality
  calculateConfidence(soldItems, artistName, objectType, totalMatches = 0) {
    let confidence = 0.5; // Base confidence
    
    // NEW: Factor in total market coverage (total matches found)
    if (totalMatches >= 500) confidence += 0.4; // Exceptional market coverage
    else if (totalMatches >= 100) confidence += 0.3; // Excellent market coverage  
    else if (totalMatches >= 50) confidence += 0.2; // Very good market coverage
    else if (totalMatches >= 20) confidence += 0.1; // Good market coverage
    
    // Analyzed sales = higher confidence (but less weight now that we factor total matches)
    if (soldItems.length >= 20) confidence += 0.2;
    else if (soldItems.length >= 10) confidence += 0.15;
    else if (soldItems.length >= 5) confidence += 0.1;
    else if (soldItems.length >= 3) confidence += 0.05;
    
    // Recent sales = higher confidence
    const recentSales = soldItems.filter(item => {
      const monthsAgo = (Date.now() - item.bidDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      return monthsAgo <= 24; // Within 2 years
    });
    
    if (recentSales.length >= soldItems.length * 0.7) confidence += 0.15;
    else if (recentSales.length >= soldItems.length * 0.5) confidence += 0.1;
    
    // Artist match = higher confidence
    if (artistName) {
      const artistMatches = soldItems.filter(item => 
        item.title.toLowerCase().includes(artistName.toLowerCase())
      );
      if (artistMatches.length >= soldItems.length * 0.8) confidence += 0.15;
      else if (artistMatches.length >= soldItems.length * 0.5) confidence += 0.1;
    }
    
    // Object type match = higher confidence
    if (objectType) {
      const objectMatches = soldItems.filter(item => 
        item.title.toLowerCase().includes(objectType.toLowerCase())
      );
      if (objectMatches.length >= soldItems.length * 0.8) confidence += 0.1;
    }
    
    // Cap at 95% (never claim 100% certainty in market analysis)
    return Math.min(0.95, Math.max(0.1, confidence));
  }

  // Analyze price trends over time
  analyzeTrends(soldItems, totalMatches = 0) {
    if (soldItems.length < 3) {
      return { trend: 'insufficient_data', description: 'Otillräckligt data för trendanalys' };
    }
    
    // Sort by date
    const sortedSales = soldItems.sort((a, b) => a.bidDate - b.bidDate);
    
    // Calculate time span of historical data
    const oldestSale = sortedSales[0];
    const newestSale = sortedSales[sortedSales.length - 1];
    const timeSpanYears = (newestSale.bidDate - oldestSale.bidDate) / (1000 * 60 * 60 * 24 * 365.25);
    
    // Generate time span text for descriptions with both total found and analyzed
    let timeSpanText = '';
    if (timeSpanYears >= 1) {
      const years = Math.round(timeSpanYears);
      if (totalMatches > soldItems.length) {
        timeSpanText = ` (baserat på ${soldItems.length} analyserade av ${totalMatches} hittade objekt från Auctionet, ${years} år tillbaka)`;
      } else {
        timeSpanText = ` (baserat på ${soldItems.length} analyserade objekt från Auctionet, ${years} år tillbaka)`;
      }
    } else {
      const months = Math.round(timeSpanYears * 12);
      if (totalMatches > soldItems.length) {
        timeSpanText = ` (baserat på ${soldItems.length} analyserade av ${totalMatches} hittade objekt från Auctionet, ${months} månader tillbaka)`;
      } else {
        timeSpanText = ` (baserat på ${soldItems.length} analyserade objekt från Auctionet, ${months} månader tillbaka)`;
      }
    }
    
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
    
    // NEW: Detect potentially unrealistic trends that indicate mixed data
    const isExtremeTrend = Math.abs(changePercent) > 500; // More than 500% change is suspicious
    const isHighlyExtremeTrend = Math.abs(changePercent) > 1000; // More than 1000% is almost certainly mixed data
    
    if (isHighlyExtremeTrend) {
      
      // For highly extreme trends, just indicate general direction without specific percentage
      if (changePercent > 0) {
        return { 
          trend: 'rising_strong', 
          description: `Stark uppgång i slutpriser (blandad marknadsdata)${timeSpanText}`, 
          changePercent: Math.min(changePercent, 200), // Cap at 200%
          dataQuality: 'mixed_suspicious'
        };
      } else {
        return { 
          trend: 'falling_strong', 
          description: `Stark nedgång i slutpriser (blandad marknadsdata)${timeSpanText}`, 
          changePercent: Math.max(changePercent, -80), // Cap at -80%
          dataQuality: 'mixed_suspicious'
        };
      }
    }
    
    
    
    // Apply conservative caps for extreme trends
    let cappedChangePercent = changePercent;
    if (isExtremeTrend) {
      cappedChangePercent = changePercent > 0 ? Math.min(changePercent, 300) : Math.max(changePercent, -75);
    }
    
    let trend, description;
    if (cappedChangePercent > 15) {
      trend = 'rising_strong';
      const percentText = isExtremeTrend ? `>${Math.round(cappedChangePercent)}%` : `+${Math.round(cappedChangePercent)}%`;
      description = `Stark uppgång: ${percentText}${timeSpanText}`;
    } else if (cappedChangePercent > 5) {
      trend = 'rising';
      description = `Stigande: +${Math.round(cappedChangePercent)}%${timeSpanText}`;
    } else if (cappedChangePercent < -15) {
      trend = 'falling_strong';
      description = `Stark nedgång: ${Math.round(cappedChangePercent)}%${timeSpanText}`;
    } else if (cappedChangePercent < -5) {
      trend = 'falling';
      description = `Fallande: ${Math.round(cappedChangePercent)}%${timeSpanText}`;
    } else {
      trend = 'stable';
      description = `Stabil prisutveckling i slutpriser${timeSpanText}`;
    }
    
    const result = { 
      trend, 
      description, 
      changePercent: Math.round(cappedChangePercent),
      timeSpanYears: Math.round(timeSpanYears * 10) / 10 // Round to 1 decimal place
    };
    
    // Add data quality warning for extreme trends
    if (isExtremeTrend) {
      result.dataQuality = isHighlyExtremeTrend ? 'mixed_suspicious' : 'extreme_trend';
      result.warning = 'Extrema trender kan indikera blandade marknadsdata';
    }
    
    return result;
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
    
    // IMPORTANT: For luxury brands, show the ACTUAL market range
    // Don't use percentiles - show from cheapest to most expensive

    
    // For luxury brands like OMEGA, show the true market range
    const minPrice = sortedPrices[0];
    const maxPrice = sortedPrices[sortedPrices.length - 1];
    const avgPrice = sortedPrices.reduce((a, b) => a + b, 0) / sortedPrices.length;
    
    // Use actual min/max with slight adjustments for market reality
    // For high-end items, buyers want to see the full price spectrum
    let low = Math.round(minPrice);
    let high = Math.round(maxPrice);
    
    // Only apply minimum range logic if we have very few data points
    if (sortedPrices.length <= 3) {
      const currentRangeWidth = high - low;
      const minRangeWidth = avgPrice * 0.15;
      
      if (currentRangeWidth < minRangeWidth) {
        const center = (low + high) / 2;
        const expansion = (minRangeWidth - currentRangeWidth) / 2;
        low = Math.max(0, Math.round(center - (currentRangeWidth / 2) - expansion));
        high = Math.round(center + (currentRangeWidth / 2) + expansion);
      }
    }
    
    return { low, high, currency: 'SEK' };
  }

  // Remove extreme outliers using IQR (Interquartile Range) method
  // Uses standard 1.5x IQR fences — the textbook approach for outlier detection
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
    
    // Standard IQR fences (1.5x) for outlier detection
    // This removes results that are statistically inconsistent with the main group
    // Example: prices [200, 350, 400, 450, 600, 900, 3896]
    //   Q1=350, Q3=900, IQR=550 → upper fence = 900 + 825 = 1725 → removes 3896
    const lowerBound = q1 - (1.5 * iqr);
    const upperBound = q3 + (1.5 * iqr);
    
    const filtered = sortedPrices.filter(price => price >= lowerBound && price <= upperBound);
    
    // Only apply filtering if we still have at least 3 data points
    if (filtered.length >= 3) {
      const removed = sortedPrices.length - filtered.length;
      if (removed > 0) {
        console.log(`[AuctionetAPI] IQR outlier removal: removed ${removed} of ${sortedPrices.length} prices (fence: ${Math.round(lowerBound)}-${Math.round(upperBound)} SEK)`);
      }
      return filtered;
    } else {
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