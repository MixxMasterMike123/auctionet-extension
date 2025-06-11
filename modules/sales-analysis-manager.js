export class SalesAnalysisManager {
  constructor() {
    this.apiManager = null;
    this.dataExtractor = null;
    this.dashboardManager = null;
    this.previousFreetextData = null;
    this.pendingAnalyses = new Set();
    this.lastCandidateSearchTerms = null;
    this.searchQuerySSoT = null;
  }

  setApiManager(apiManager) {
    this.apiManager = apiManager;
  }

  setDataExtractor(dataExtractor) {
    this.dataExtractor = dataExtractor;
  }

  setDashboardManager(dashboardManager) {
    this.dashboardManager = dashboardManager;
  }

  setPendingAnalyses(pendingAnalyses) {
    this.pendingAnalyses = pendingAnalyses;
  }

  setLastCandidateSearchTerms(searchTerms) {
    this.lastCandidateSearchTerms = searchTerms;
  }

  // NEW: Set AI-only SearchQuerySSoT
  setSearchQuerySSoT(searchQuerySSoT) {
    this.searchQuerySSoT = searchQuerySSoT;
  }

  // NEW: Format artist for SSoT integration with maximum precision (same logic as QualityAnalyzer)
  formatArtistForSSoT(artistName) {
    if (!artistName || typeof artistName !== 'string') {
      return artistName;
    }
    
    // Remove any existing quotes first
    const cleanArtist = artistName.trim().replace(/^["']|["']$/g, '');
    
    // Check if multi-word name (most artist names)
    const words = cleanArtist.split(/\s+/).filter(word => word.length > 0);
    
    if (words.length > 1) {
      // Multi-word: Always quote for precision
      const formatted = `"${cleanArtist}"`;
      return formatted;
    } else if (words.length === 1) {
      // Single word: Also quote for consistency and precision
      const formatted = `"${cleanArtist}"`;
      return formatted;
    }
    
    // Fallback
    return cleanArtist;
  }

  // ==================== MAIN SALES ANALYSIS ====================

  async startSalesAnalysis(artistInfo, data, currentWarnings, currentScore, searchFilterManager, qualityAnalyzer) {
    
    // CRITICAL FIX: Get the actual search query from SSoT to pass to extractCandidateSearchTerms
    // This ensures the AI Rules selection is respected for preSelected terms
    let actualSearchQuery = null;
    if (this.searchQuerySSoT && this.searchQuerySSoT.getCurrentQuery()) {
      actualSearchQuery = this.searchQuerySSoT.getCurrentQuery();
    }
    
    // CRITICAL FIX: Transform artistInfo to proper structure for SearchFilterManager
    let properArtistInfo = null;
    if (artistInfo) {
      // Get the original artist field from the form data (not the AI search query)
      const currentData = this.dataExtractor?.extractItemData();
      const originalArtist = currentData?.artist;
      
      if (originalArtist && originalArtist.trim()) {
        // CRITICAL FIX: Quote-wrap artist field before passing to SSoT system
        const formattedArtist = this.formatArtistForSSoT(originalArtist);
        console.log(`🎯 Quote-wrapped original artist: "${originalArtist}" → ${formattedArtist}`);
        
        properArtistInfo = {
          artist: formattedArtist,
          isBrand: false,
          isFreetext: false
        };
      } else if (typeof artistInfo === 'string') {
        properArtistInfo = {
          artist: artistInfo,
          isBrand: false,
          isFreetext: true
        };
      } else if (artistInfo.artist) {
        properArtistInfo = artistInfo; // Already in correct format
      } else {
        // Extract artist from searchTerms if available
        const searchTerms = artistInfo.searchTerms || [];
        const artistTerm = searchTerms.find(term => 
          typeof term === 'string' && 
          term.length > 1 && 
          !['SKULPTUR', 'skulptur', 'BRONZE', 'bronze', 'SILVER', 'silver'].includes(term.toUpperCase()) &&
          !/^\d+$/.test(term) // Not just numbers
        );
        
        if (artistTerm) {
          properArtistInfo = {
            artist: artistTerm,
            isBrand: false,
            isFreetext: true
          };
        }
      }
    }
    
    
    // NEW: Test the candidate search terms extraction with AI Rules query
    const candidateTerms = searchFilterManager.extractCandidateSearchTerms(data.title, data.description, properArtistInfo, actualSearchQuery);
    if (candidateTerms) {
      // Store for dashboard use (in both managers for redundancy)
      this.lastCandidateSearchTerms = candidateTerms;
      searchFilterManager.lastCandidateSearchTerms = candidateTerms;
      
      // CRITICAL FIX: ALWAYS initialize SSoT with candidate terms for extended checkbox functionality
      // Even if SSoT already has an AI query, it needs ALL candidate terms for user control
      if (this.searchQuerySSoT) {
        console.log('   Current AI query:', this.searchQuerySSoT.getCurrentQuery());
        console.log('   Will add', candidateTerms.candidates?.length || 0, 'candidate terms');
        
        // Force initialization with all candidate terms
        this.searchQuerySSoT.initialize(this.searchQuerySSoT.getCurrentQuery(), candidateTerms, 'system_with_extensions');
      } else {
        console.error('❌ CRITICAL ERROR: SearchQuerySSoT not available for initialization');
        console.error('🔧 SearchQuerySSoT reference:', this.searchQuerySSoT);
      }
      
      candidateTerms.candidates.forEach((candidate, index) => {
        console.log(`   ${index + 1}. "${candidate.term}" (${candidate.type}) - preSelected: ${candidate.preSelected} - ${candidate.description}`);
      });
    }
    
    if (!artistInfo) {
      console.log('❌ No artist information provided for sales analysis');
      return;
    }
    
    try {
      // NEW: Handle AI-only search query structure
      let artistName;
      let isBrand = false;
      let isFreetext = false;
      
      if (typeof artistInfo === 'string') {
        artistName = artistInfo;
      } else if (artistInfo.artist) {
        artistName = artistInfo.artist;
        isBrand = artistInfo.isBrand || false;
        isFreetext = artistInfo.isFreetext || false;
      } else if (artistInfo.searchQuery) {
        // AI-only structure
        artistName = artistInfo.searchQuery;
        isFreetext = true; // AI-generated queries are essentially freetext
      } else if (artistInfo.searchTerms && Array.isArray(artistInfo.searchTerms)) {
        artistName = artistInfo.searchTerms.join(' ');
        isFreetext = true;
      } else {
        console.error('❌ Invalid artistInfo structure:', artistInfo);
        return;
      }
      
      let analysisType = 'artist';
      if (isBrand) analysisType = 'brand';
      if (isFreetext) analysisType = 'freetext';
      
      
      // Extract additional context for sales analysis from current item
      const objectType = qualityAnalyzer.extractObjectType(data.title);
      const period = qualityAnalyzer.extractPeriod(data.title) || qualityAnalyzer.extractPeriod(data.description);
      const technique = qualityAnalyzer.extractTechnique(data.title, data.description);
      
      // SMART ENHANCEMENT: Extract additional search terms for better matching
      const enhancedTerms = qualityAnalyzer.extractEnhancedSearchTerms(data.title, data.description);
      
      // 🚨 STRICT SSoT: Use ONLY SearchQuerySSoT for all search operations
      let searchContext;
      
      if (this.searchQuerySSoT) {
      }
      
      if (this.searchQuerySSoT) {
        // MANDATORY: Use SSoT as the ONLY source
        searchContext = this.searchQuerySSoT.buildSearchContext();
        console.log('🔒 SSoT Search Context:', searchContext);
        
        // CRITICAL FIX: Check if search context is valid and has a query
        if (!searchContext || searchContext.isEmpty || !searchContext.hasValidQuery) {
          console.warn('⚠️ SSoT returned empty/invalid search context - cannot perform analysis');
          
          // Provide user-friendly error without crashing
          this.showNoSalesDataMessage(currentWarnings, currentScore, 'ssot_empty', 'Tom sökning', qualityAnalyzer);
          this.pendingAnalyses.delete('sales');
          return;
        }
        
        // Override any additional context with SSoT metadata
        const ssotMetadata = this.searchQuerySSoT.getCurrentMetadata();
        if (ssotMetadata) {
          searchContext.confidence = ssotMetadata.confidence || 0.5;
          searchContext.source = ssotMetadata.source || 'ssot';
          searchContext.reasoning = ssotMetadata.reasoning || 'Generated from SSoT';
        } else {
          console.log('⚠️ No SSoT metadata available - using default values');
          searchContext.confidence = 0.75; // Default confidence
          searchContext.source = 'ssot';
          searchContext.reasoning = 'Generated from SSoT';
        }
        
      } else {
        // CRITICAL ERROR: No SSoT available - this should not happen
        console.error('🚨 CRITICAL ERROR: SearchQuerySSoT not available - cannot perform SSoT-only analysis');
        console.error('🔧 DETAILED DEBUG: this reference type:', typeof this);
        console.error('🔧 DETAILED DEBUG: this.searchQuerySSoT value:', this.searchQuerySSoT);
        console.error('🔧 DETAILED DEBUG: All this properties:', Object.keys(this));
        
        // Provide graceful fallback instead of throwing error
        this.showNoSalesDataMessage(currentWarnings, currentScore, 'ssot_unavailable', 'System otillgängligt', qualityAnalyzer);
        this.pendingAnalyses.delete('sales');
        return;
      }
      
      // STRICT SSoT: analysisType must come from SSoT, not legacy detection
      searchContext.analysisType = 'ssot_query'; // Mark as SSoT-driven
      
      
      // Check if apiManager is available
      if (!this.apiManager) {
        throw new Error('ApiManager not initialized - cannot perform sales analysis');
      }
      
      // Check if analyzeSales method exists
      if (typeof this.apiManager.analyzeSales !== 'function') {
        throw new Error('ApiManager.analyzeSales method not available');
      }
      
      // Call the API for sales analysis
      let salesData = await this.apiManager.analyzeSales(searchContext);
      
      // Add analysis metadata to sales data
      salesData.analysisType = analysisType;
      salesData.searchedEntity = artistName;
      salesData.searchContext = searchContext;
      
      // 🔧 CRITICAL FIX: Add candidate search terms to salesData for dashboard checkboxes
      if (this.lastCandidateSearchTerms) {
        salesData.candidateSearchTerms = this.lastCandidateSearchTerms;
      } else {
        console.log('⚠️ No candidateSearchTerms available to add to salesData');
      }
      
      // NEW: If this is an AI artist analysis and we previously had freetext data, merge them
      if (analysisType === 'artist' && this.previousFreetextData) {
        salesData = this.mergeSalesData(salesData, this.previousFreetextData);
      }
      
      // Store freetext data for potential merging later
      if (analysisType === 'freetext') {
        console.log('💾 Storing freetext data for potential merge with AI data');
        this.previousFreetextData = salesData;
      }
      
      
      // Remove sales from pending analyses
      this.pendingAnalyses.delete('sales');
      
      // Handle the results
      this.handleSalesAnalysisResult(salesData, currentWarnings, currentScore, qualityAnalyzer, searchFilterManager);
      
    } catch (error) {
      console.error('❌ Sales analysis failed:', error);
      this.pendingAnalyses.delete('sales');
      this.showSalesAnalysisError(error, currentWarnings, currentScore, qualityAnalyzer);
    }
  }

  // NEW: Merge AI artist data with broader freetext market data
  mergeSalesData(artistData, freetextData) {
    
    // Use artist data as primary (higher confidence, more specific)
    const mergedData = { ...artistData };
    
    // Keep artist analysis type but note the enrichment
    mergedData.analysisType = 'artist_enriched';
    mergedData.enrichedWith = 'freetext';
    
    // Merge exceptional sales from freetext if artist data doesn't have them
    if (!mergedData.historical?.exceptionalSales && freetextData.historical?.exceptionalSales) {
      if (!mergedData.historical) mergedData.historical = {};
      mergedData.historical.exceptionalSales = freetextData.historical.exceptionalSales;
      
      // Update the exceptional sales description to clarify source
      if (mergedData.historical.exceptionalSales.description) {
        mergedData.historical.exceptionalSales.description = 
          mergedData.historical.exceptionalSales.description.replace('exceptionella', 'exceptionella (bredare marknad)');
      }
    }
    
    // Add broader market context info
    if (freetextData.historical?.totalMatches > artistData.historical?.totalMatches) {
      mergedData.broaderMarket = {
        totalMatches: freetextData.historical.totalMatches,
        searchQuery: freetextData.historical.actualSearchQuery,
        confidence: freetextData.confidence
      };
    }
    
    // Enhance insights by combining both datasets
    if (freetextData.insights && freetextData.insights.length > 0) {
      if (!mergedData.insights) mergedData.insights = [];
      
      // Add unique insights from freetext that aren't in artist data
      freetextData.insights.forEach(insight => {
        const isDuplicate = mergedData.insights.some(existing => 
          existing.message === insight.message || existing.type === insight.type
        );
        
        if (!isDuplicate) {
          // Mark as broader market insight
          const enhancedInsight = { ...insight };
          if (enhancedInsight.message && !enhancedInsight.message.includes('(bredare marknad)')) {
            enhancedInsight.message += ' (bredare marknad)';
          }
          mergedData.insights.push(enhancedInsight);
        }
      });
    }
    
    return mergedData;
  }

  handleSalesAnalysisResult(salesData, currentWarnings, currentScore, qualityAnalyzer, searchFilterManager = null) {
    // ENHANCED: Show dashboard if we have ANY meaningful data or candidate search terms
    const hasValidData = salesData && (
      // Traditional good data
      (salesData.hasComparableData && (salesData.priceRange || 
       (salesData.historical && salesData.historical.analyzedSales > 0) || 
       (salesData.live && salesData.live.analyzedLiveItems > 0))) ||
      // OR we have candidate search terms (AI-generated search strategy)
      salesData.candidateSearchTerms ||
      // OR SearchQuerySSoT has generated a query
      (this.searchQuerySSoT && this.searchQuerySSoT.getCurrentQuery())
    );
    
    if (hasValidData) {
      
      // If we don't have traditional sales data but have AI-generated terms, create mock data
      if (!salesData.hasComparableData && (salesData.candidateSearchTerms || (this.searchQuerySSoT && this.searchQuerySSoT.getCurrentQuery()))) {
        
        // Create basic structure for dashboard
        salesData.hasComparableData = true;
        salesData.historical = salesData.historical || {
          analyzedSales: 0,
          totalMatches: 0,
          actualSearchQuery: this.searchQuerySSoT ? this.searchQuerySSoT.getCurrentQuery() : 'AI-genererad sökning'
        };
        salesData.confidence = 0.5; // Medium confidence for AI-only
        salesData.dataSource = 'AI-genererad sökstrategi';
      }
      
      // CRITICAL FIX: Use AI-only SearchQuerySSoT instead of re-extracting terms
      if (this.searchQuerySSoT) {
        
        // Get the ACTUAL search query from AI-only SSoT
        const actualSearchQuery = this.searchQuerySSoT.getCurrentQuery();
        
        // Get metadata from AI-only SSoT
        const metadata = this.searchQuerySSoT.getCurrentMetadata();
        
        // Use AI-only data for dashboard
        salesData.aiOnlyQuery = actualSearchQuery;
        salesData.aiOnlyMetadata = metadata;
        
        
      } else {
        console.log('⚠️ AI-only SearchQuerySSoT not available - using sales data as-is');
      }
      
      // NEW: Analyze valuation and suggest changes if needed
      const valuationSuggestions = this.analyzeValuationSuggestions(salesData);
      
      // Use the new dashboard approach and pass valuation suggestions
      this.dashboardManager.addMarketDataDashboard(salesData, valuationSuggestions);
      
      if (valuationSuggestions.length > 0) {
        // RACE CONDITION FIX: Don't call updateQualityIndicator() from sales analysis
        // The quality analyzer should own quality indicator updates to prevent race conditions
        // Store warnings for potential future use, but don't force UI update
        const freshWarnings = qualityAnalyzer.extractCurrentWarnings();
        const updatedWarnings = [...freshWarnings, ...valuationSuggestions];
        console.log('📊 Sales analysis complete with valuation suggestions, but not updating UI to prevent race conditions');
      } else {
        // RACE CONDITION FIX: Don't call updateQualityIndicator() from sales analysis  
        // The quality analyzer should own quality indicator updates to prevent race conditions
        const freshWarnings = qualityAnalyzer.extractCurrentWarnings();
        console.log('📊 Sales analysis complete without valuation suggestions, but not updating UI to prevent race conditions');
      }
      
      
      // Hide the AI loading indicator now that analysis is complete
      qualityAnalyzer.hideAILoadingIndicator();
    } else {
      // NO MEANINGFUL DATA: Show appropriate message
      
      // Determine entity name for the message
      let entityName = 'okänd';
      let analysisType = 'freetext';
      
      if (salesData) {
        if (salesData.searchedEntity) {
          entityName = salesData.searchedEntity;
        } else if (salesData.analysisType) {
          analysisType = salesData.analysisType;
        }
        if (salesData.analysisType) {
          analysisType = salesData.analysisType;
        }
      }
      
      this.showNoSalesDataMessage(currentWarnings, currentScore, analysisType, entityName, qualityAnalyzer);
    }
  }

  // ==================== VALUATION ANALYSIS ====================

  // NEW: Analyze cataloger's valuation against market data and suggest changes
  analyzeValuationSuggestions(salesData) {
    const suggestions = [];
    
    if (!salesData || !salesData.priceRange) {
      return suggestions;
    }
    
    // Get current valuation data with null checks
    if (!this.dataExtractor) {
      return suggestions;
    }
    
    const data = this.dataExtractor.extractItemData();
    if (!data) {
      return suggestions;
    }
    
    const currentEstimate = parseInt(data.estimate) || 0;
    const currentUpperEstimate = parseInt(data.upperEstimate) || 0;
    const currentAcceptedReserve = parseInt(data.acceptedReserve) || 0;
    
    // Market data
    const marketLow = salesData.priceRange.low;
    const marketHigh = salesData.priceRange.high;
    const marketMid = (marketLow + marketHigh) / 2;
    
    // Analyze each component and add suggestions
    if (currentEstimate > 0) {
      const estimateResult = this.compareValuationToMarket(currentEstimate, marketLow, marketHigh, marketMid);
      if (estimateResult.needsAdjustment) {
        suggestions.push({
          field: 'Värdering',
          issue: estimateResult.message,
          severity: estimateResult.severity,
          category: 'valuation',
          suggestion: estimateResult.suggestedRange
        });
      }
    }
    
    // Analyze upper estimate
    if (currentUpperEstimate > 0 && currentEstimate > 0) {
      const upperEstimateAnalysis = this.analyzeUpperEstimate(currentEstimate, currentUpperEstimate, marketLow, marketHigh);
      if (upperEstimateAnalysis.needsAdjustment) {
        suggestions.push({
          field: 'Övre värdering',
          issue: upperEstimateAnalysis.message,
          severity: upperEstimateAnalysis.severity,
          category: 'valuation',
          suggestion: upperEstimateAnalysis.suggestedRange
        });
      }
    }
    
    // Analyze accepted reserve
    if (currentAcceptedReserve > 0) {
      const reserveAnalysis = this.analyzeAcceptedReserve(currentEstimate, currentAcceptedReserve, marketLow, marketHigh);
      if (reserveAnalysis.needsAdjustment) {
        suggestions.push({
          field: 'Godkänd bevakning',
          issue: reserveAnalysis.message,
          severity: reserveAnalysis.severity,
          category: 'valuation',
          suggestion: reserveAnalysis.suggestedRange
        });
      }
    }
    
    return suggestions;
  }

  // Helper method to compare a valuation against market data
  compareValuationToMarket(valuation, marketLow, marketHigh, marketMid) {
    const tolerance = 0.3; // 30% tolerance for reasonable valuations
    const lowThreshold = marketLow * (1 - tolerance);
    const highThreshold = marketHigh * (1 + tolerance);
    
    // Check if valuation is extremely unrealistic (more than 3x or less than 0.3x market range)
    const valuationVsMarketHigh = valuation / marketHigh;
    const valuationVsMarketLow = valuation / marketLow;
    const isExtremelyHigh = valuationVsMarketHigh > 3.0;
    const isExtremelyLow = valuationVsMarketLow < 0.3;
    
    if (isExtremelyHigh) {
      // Valuation is extremely above market - this is a serious error
      const suggestedLow = Math.round(marketLow);
      const suggestedHigh = Math.round(marketHigh);
      
      return {
        needsAdjustment: true,
        message: `Värdering (${this.formatSEK(valuation)}) betydligt över liknande försäljningar`,
        suggestedRange: `Marknadsdata tyder på: ${this.formatSEK(suggestedLow)}-${this.formatSEK(suggestedHigh)} SEK`,
        severity: 'high' // Upgraded severity for extreme cases
      };
    } else if (isExtremelyLow) {
      // Valuation is extremely below market - also serious
      const suggestedLow = Math.round(marketLow);
      const suggestedHigh = Math.round(marketHigh);
      
      return {
        needsAdjustment: true,
        message: `Värdering (${this.formatSEK(valuation)}) betydligt under liknande försäljningar`,
        suggestedRange: `Marknadsdata tyder på: ${this.formatSEK(suggestedLow)}-${this.formatSEK(suggestedHigh)} SEK`,
        severity: 'high' // Upgraded severity for extreme cases
      };
    } else if (valuation < lowThreshold) {
      // Valuation is significantly below market (but not extreme)
      const suggestedLow = Math.round(marketLow * 0.8);
      const suggestedHigh = Math.round(marketMid);
      
      return {
        needsAdjustment: true,
        message: `Värdering (${this.formatSEK(valuation)}) under genomsnittliga försäljningar`,
        suggestedRange: `Överväg: ${this.formatSEK(suggestedLow)}-${this.formatSEK(suggestedHigh)} SEK (baserat på marknadsdata)`,
        severity: 'medium'
      };
    } else if (valuation > highThreshold) {
      // Valuation is significantly above market (but not extreme)
      const suggestedLow = Math.round(marketMid);
      const suggestedHigh = Math.round(marketHigh * 1.2);
      
      return {
        needsAdjustment: true,
        message: `Värdering (${this.formatSEK(valuation)}) över genomsnittliga försäljningar`,
        suggestedRange: `Överväg: ${this.formatSEK(suggestedLow)}-${this.formatSEK(suggestedHigh)} SEK (baserat på marknadsdata)`,
        severity: 'medium'
      };
    }
    
    // NEW: Provide positive feedback when valuation is spot-on
    return { 
      needsAdjustment: true, // Set to true so it shows up as a "suggestion"
      message: `Värdering (${this.formatSEK(valuation)}) stämmer väl med marknadsdata`,
      suggestedRange: `Bra bedömning! Liknande objekt: ${this.formatSEK(marketLow)}-${this.formatSEK(marketHigh)} SEK`,
      severity: 'positive' // New severity for positive feedback
    };
  }

  // Helper method to analyze upper estimate
  analyzeUpperEstimate(estimate, upperEstimate, marketLow, marketHigh) {
    // Upper estimate should typically be 20-50% higher than base estimate
    const expectedUpperMin = estimate * 1.2;
    const expectedUpperMax = estimate * 1.5;
    
    // Also check against market data
    const marketUpper = marketHigh * 1.2;
    
    if (upperEstimate < expectedUpperMin) {
      return {
        needsAdjustment: true,
        message: `Övre värdering (${this.formatSEK(upperEstimate)}) för låg jämfört med grundvärdering`,
        suggestedRange: `${this.formatSEK(Math.round(expectedUpperMin))}-${this.formatSEK(Math.round(expectedUpperMax))} SEK`,
        severity: 'low'
      };
    } else if (upperEstimate > marketUpper) {
      return {
        needsAdjustment: true,
        message: `Övre värdering (${this.formatSEK(upperEstimate)}) kan vara för hög jämfört med marknadsvärde`,
        suggestedRange: `Max ${this.formatSEK(Math.round(marketUpper))} SEK`,
        severity: 'low'
      };
    }
    
    return { needsAdjustment: false };
  }

  // Helper method to analyze accepted reserve
  analyzeAcceptedReserve(estimate, acceptedReserve, marketLow, marketHigh) {
    // SMART APPROACH: Use market data as primary reference when estimate is clearly wrong
    const marketMid = (marketLow + marketHigh) / 2;
    const marketReserveIdeal = marketLow * 0.7; // 70% of market low is ideal reserve
    const marketReserveMax = marketLow * 0.9;   // 90% of market low is maximum reasonable reserve
    
    // Check if cataloger's estimate is wildly off from market (more than 3x market high)
    const estimateVsMarket = estimate / marketHigh;
    const isEstimateUnrealistic = estimateVsMarket > 3.0 || estimateVsMarket < 0.3;
    
    if (isEstimateUnrealistic) {
      // MARKET-BASED ANALYSIS: Ignore unrealistic estimate, use market data
      
      if (acceptedReserve > marketReserveMax) {
        return {
          needsAdjustment: true,
          message: `Godkänd bevakning (${this.formatSEK(acceptedReserve)}) för hög jämfört med marknadsvärde`,
          suggestedRange: `Max ${this.formatSEK(Math.round(marketReserveMax))} SEK baserat på marknad`,
          severity: 'medium'
        };
      } else if (acceptedReserve < marketReserveIdeal * 0.5) {
        return {
          needsAdjustment: true,
          message: `Godkänd bevakning (${this.formatSEK(acceptedReserve)}) mycket låg jämfört med marknadsvärde`,
          suggestedRange: `${this.formatSEK(Math.round(marketReserveIdeal * 0.7))}-${this.formatSEK(Math.round(marketReserveIdeal))} SEK`,
          severity: 'medium'
        };
      } else if (acceptedReserve >= marketReserveIdeal * 0.7 && acceptedReserve <= marketReserveMax) {
        // POSITIVE FEEDBACK: Reserve is well-aligned with market
        return {
          needsAdjustment: true,
          message: `Godkänd bevakning (${this.formatSEK(acceptedReserve)}) väl anpassad till marknadsvärde`,
          suggestedRange: `Bra bedömning! Marknadsbas: ${this.formatSEK(Math.round(marketReserveIdeal))}-${this.formatSEK(Math.round(marketReserveMax))} SEK`,
          severity: 'positive'
        };
      }
    } else {
      // TRADITIONAL ANALYSIS: Estimate seems reasonable, use estimate-based rules
      
      const expectedReserveMin = estimate * 0.6;
      const expectedReserveMax = estimate * 0.8;
      
      if (acceptedReserve < expectedReserveMin) {
        return {
          needsAdjustment: true,
          message: `Godkänd bevakning (${this.formatSEK(acceptedReserve)}) låg jämfört med värdering`,
          suggestedRange: `${this.formatSEK(Math.round(expectedReserveMin))}-${this.formatSEK(Math.round(expectedReserveMax))} SEK`,
          severity: 'low'
        };
      } else if (acceptedReserve > expectedReserveMax) {
        return {
          needsAdjustment: true,
          message: `Godkänd bevakning (${this.formatSEK(acceptedReserve)}) hög jämfört med värdering`,
          suggestedRange: `Max ${this.formatSEK(Math.round(expectedReserveMax))} SEK`,
          severity: 'low'
        };
      } else if (acceptedReserve > marketReserveMax && acceptedReserve > expectedReserveMax * 1.1) {
        // Even with reasonable estimate, check against market ceiling
        return {
          needsAdjustment: true,
          message: `Godkänd bevakning (${this.formatSEK(acceptedReserve)}) kan vara för hög jämfört med marknadsvärde`,
          suggestedRange: `Överväg lägre bevakning baserat på marknad`,
          severity: 'low'
        };
      }
    }
    
    return { needsAdjustment: false };
  }

  // ==================== HELPER FUNCTIONS ====================

  // Helper method to format SEK amounts
  formatSEK(amount) {
    return new Intl.NumberFormat('sv-SE').format(amount);
  }

  // NEW: Helper methods for SearchQueryManager SSoT integration
  getTermPriority(type) {
    const priorities = {
      'artist': 1,
      'brand': 1,
      'object_type': 2,
      'model': 3,
      'reference': 4,
      'material': 5,
      'period': 6,
      'movement': 7,
      'keyword': 8
    };
    return priorities[type] || 8;
  }

  getTermDescription(type) {
    const descriptions = {
      'artist': 'Konstnär/Märke',
      'brand': 'Konstnär/Märke',
      'object_type': 'Objekttyp',
      'model': 'Modell/Serie',
      'reference': 'Referensnummer',
      'material': 'Material',
      'period': 'Tidsperiod',
      'movement': 'Urverk/Teknik',
      'keyword': 'Nyckelord'
    };
    return descriptions[type] || 'Nyckelord';
  }

  showNoSalesDataMessage(currentWarnings, currentScore, analysisType = 'artist', entityName = '', qualityAnalyzer) {
    // CRITICAL FIX: Get fresh warnings from DOM to include any AI warnings that were just added
    let updatedWarnings = qualityAnalyzer.extractCurrentWarnings(); // Get fresh warnings from UI
    
    // Add informational message about no sales data with appropriate context
    let message;
    if (analysisType === 'brand') {
      message = `ℹ️ Ingen jämförbar försäljningsdata tillgänglig för märket ${entityName}`;
    } else if (analysisType === 'freetext') {
      message = `ℹ️ Ingen jämförbar försäljningsdata hittades för söktermerna "${entityName}"`;
    } else {
      message = `ℹ️ Ingen jämförbar försäljningsdata tillgänglig för konstnären ${entityName}`;
    }
    
    updatedWarnings.push({
      field: 'Marknadsvärde', // Fix: Add proper field
      issue: message, // Fix: Use issue instead of message
      severity: 'info'
    });
    
    
    // RACE CONDITION FIX: Don't update quality indicator from sales analysis
    // The quality analyzer should own quality indicator updates to prevent race conditions
    console.log('📊 No sales data message prepared, but not updating UI to prevent race conditions');
    qualityAnalyzer.checkAndHideLoadingIndicator();
    qualityAnalyzer.hideAILoadingIndicator();
  }

  showSalesAnalysisError(error, currentWarnings, currentScore, qualityAnalyzer) {
    // Only show error message in development/debug mode
    if (console.debug) {
      const currentWarningsElement = document.querySelector('.quality-warnings ul');
      let updatedWarnings = [...currentWarnings];
      
      if (currentWarningsElement) {
        updatedWarnings = qualityAnalyzer.extractCurrentWarnings();
      }
      
      updatedWarnings.push({
        field: 'Marknadsvärde',
        issue: 'ℹ️ Marknadsvärdering tillfälligt otillgänglig',
        severity: 'low'
      });
      
      // RACE CONDITION FIX: Don't update quality indicator from sales analysis
      // The quality analyzer should own quality indicator updates to prevent race conditions
      console.log('📊 Sales analysis error handled, but not updating UI to prevent race conditions');
    }
    
    qualityAnalyzer.checkAndHideLoadingIndicator();
    qualityAnalyzer.hideAILoadingIndicator();
  }

  addMarketDataWarnings(salesData, warnings) {
    
    if (!salesData.insights || salesData.insights.length === 0) {
      return warnings;
    }
    
    const updatedWarnings = [...warnings];
    
    // Add insights as market warnings
    salesData.insights.forEach(insight => {
      if (insight.type === 'price_variance') {
        updatedWarnings.push({
          field: 'Marknadsvärde',
          issue: `💰 ${insight.message}`,
          severity: 'medium',
          category: 'market_insight'
        });
      } else if (insight.type === 'availability') {
        updatedWarnings.push({
          field: 'Marknadstillgång',
          issue: `📊 ${insight.message}`,
          severity: 'low',
          category: 'market_insight'
        });
      } else if (insight.type === 'trend') {
        updatedWarnings.push({
          field: 'Marknadstrend',
          issue: `📈 ${insight.message}`,
          severity: 'info',
          category: 'market_insight'
        });
      } else {
        // Generic market insight
        updatedWarnings.push({
          field: 'Marknadsanalys',
          issue: `💡 ${insight.message}`,
          severity: 'info',
          category: 'market_insight'
        });
      }
    });
    
    return updatedWarnings;
  }

  formatWarningMessage(warning) {
    if (warning.category === 'valuation' && warning.suggestion) {
      return `${warning.issue}\n${warning.suggestion}`;
    }
    return warning.issue || warning.message;
  }

  getArtistSearchResultCount(salesData) {
    if (!salesData.historical) return 0;
    
    // Return the total matches from historical data
    return salesData.historical.totalMatches || 0;
  }
} 