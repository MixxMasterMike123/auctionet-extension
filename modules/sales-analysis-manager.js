export class SalesAnalysisManager {
  constructor() {
    this.apiManager = null;
    this.dataExtractor = null;
    this.dashboardManager = null;
    this.previousFreetextData = null;
    this.pendingAnalyses = new Set();
    this.lastCandidateSearchTerms = null;
    this.searchQueryManager = null;
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

  // NEW: Set SearchQueryManager for SSoT usage
  setSearchQueryManager(searchQueryManager) {
    this.searchQueryManager = searchQueryManager;
    console.log('✅ SalesAnalysisManager: SearchQueryManager SSoT connected');
  }

  // ==================== MAIN SALES ANALYSIS ====================

  async startSalesAnalysis(artistInfo, data, currentWarnings, currentScore, searchFilterManager, qualityAnalyzer) {
    console.log('💰 Starting sales analysis with best available artist/search:', artistInfo);
    
    // NEW: Test the candidate search terms extraction
    const candidateTerms = searchFilterManager.extractCandidateSearchTerms(data.title, data.description, artistInfo);
    if (candidateTerms) {
      // Store for dashboard use (in both managers for redundancy)
      this.lastCandidateSearchTerms = candidateTerms;
      searchFilterManager.lastCandidateSearchTerms = candidateTerms;
      
      // CRITICAL FIX: Initialize SearchQueryManager SSoT with extracted candidate terms
      if (this.searchQueryManager) {
        console.log('🔧 CRITICAL FIX: Initializing SearchQueryManager SSoT with candidate terms');
        this.searchQueryManager.initialize(
          candidateTerms.currentQuery,
          candidateTerms,
          'sales_analysis'
        );
        console.log('✅ SearchQueryManager SSoT initialized with:', {
          query: candidateTerms.currentQuery,
          candidates: candidateTerms.candidates.length,
          analysisType: candidateTerms.analysisType
        });
      } else {
        console.error('❌ CRITICAL ERROR: SearchQueryManager not available for initialization');
      }
      
      console.log('🧪 PHASE 1 TEST - Candidate search terms extracted:');
      console.log('📋 Candidates:');
      candidateTerms.candidates.forEach((candidate, index) => {
        console.log(`   ${index + 1}. "${candidate.term}" (${candidate.type}) - preSelected: ${candidate.preSelected} - ${candidate.description}`);
      });
      console.log('🎯 Current algorithm would use:', candidateTerms.currentQuery);
      console.log('📊 Analysis type:', candidateTerms.analysisType);
    }
    
    if (!artistInfo) {
      console.log('❌ No artist information provided for sales analysis');
      return;
    }
    
    try {
      const artistName = typeof artistInfo === 'string' ? artistInfo : artistInfo.artist;
      const isBrand = artistInfo.isBrand || false;
      const isFreetext = artistInfo.isFreetext || false;
      
      let analysisType = 'artist';
      if (isBrand) analysisType = 'brand';
      if (isFreetext) analysisType = 'freetext';
      
      console.log(`💰 Running comprehensive market analysis for ${analysisType}:`, artistName);
      
      // Extract additional context for sales analysis from current item
      const objectType = qualityAnalyzer.extractObjectType(data.title);
      const period = qualityAnalyzer.extractPeriod(data.title) || qualityAnalyzer.extractPeriod(data.description);
      const technique = qualityAnalyzer.extractTechnique(data.title, data.description);
      
      // SMART ENHANCEMENT: Extract additional search terms for better matching
      const enhancedTerms = qualityAnalyzer.extractEnhancedSearchTerms(data.title, data.description);
      
      // USE SSoT: Prepare search context using SearchQueryManager with PROPER artist info
      let searchContext = this.searchQueryManager ? 
        this.searchQueryManager.buildSearchContext(
          artistInfo.artist || artistInfo, // CRITICAL: Pass the actual artist name/info
          objectType, 
          period, 
          technique, 
          enhancedTerms, 
          analysisType
        ) : {
          // Fallback to legacy logic if SSoT not available
          primarySearch: artistName,
          objectType: objectType,
          period: period,
          technique: technique,
          enhancedTerms: enhancedTerms,
          analysisType: analysisType,
          searchTerms: `${artistName} ${objectType}`.trim(),
          finalSearch: `${artistName} ${objectType}`.trim()
        };
      
      if (isFreetext && artistInfo) {
        searchContext.searchStrategy = artistInfo.searchStrategy;
        searchContext.confidence = artistInfo.confidence;
        searchContext.termCount = artistInfo.termCount;
      }
      
      console.log('🔍 Search context for market analysis:', searchContext);
      
      // Call the API for sales analysis
      let salesData = await this.apiManager.analyzeSales(searchContext);
      
      // Add analysis metadata to sales data
      salesData.analysisType = analysisType;
      salesData.searchedEntity = artistName;
      salesData.searchContext = searchContext;
      
      // NEW: If this is an AI artist analysis and we previously had freetext data, merge them
      if (analysisType === 'artist' && this.previousFreetextData) {
        console.log('🔄 Merging AI artist data with previous freetext data for comprehensive dashboard');
        salesData = this.mergeSalesData(salesData, this.previousFreetextData);
      }
      
      // Store freetext data for potential merging later
      if (analysisType === 'freetext') {
        console.log('💾 Storing freetext data for potential merge with AI data');
        this.previousFreetextData = salesData;
      }
      
      console.log('📊 Sales analysis completed:', salesData);
      
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
    console.log('🔄 Merging datasets - Artist vs Freetext');
    
    // Use artist data as primary (higher confidence, more specific)
    const mergedData = { ...artistData };
    
    // Keep artist analysis type but note the enrichment
    mergedData.analysisType = 'artist_enriched';
    mergedData.enrichedWith = 'freetext';
    
    // Merge exceptional sales from freetext if artist data doesn't have them
    if (!mergedData.historical?.exceptionalSales && freetextData.historical?.exceptionalSales) {
      console.log('📈 Adding exceptional sales from broader market context');
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
      console.log('📊 Adding broader market context numbers');
      mergedData.broaderMarket = {
        totalMatches: freetextData.historical.totalMatches,
        searchQuery: freetextData.historical.actualSearchQuery,
        confidence: freetextData.confidence
      };
    }
    
    // Enhance insights by combining both datasets
    if (freetextData.insights && freetextData.insights.length > 0) {
      console.log('💡 Enhancing insights with broader market data');
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
    
    console.log('✅ Data merge complete - enriched artist analysis');
    return mergedData;
  }

  handleSalesAnalysisResult(salesData, currentWarnings, currentScore, qualityAnalyzer, searchFilterManager = null) {
    if (salesData && salesData.hasComparableData) {
      console.log('💰 Processing comprehensive market analysis results');
      
      // CRITICAL FIX: Use SearchQueryManager SSoT instead of re-extracting terms
      if (this.searchQueryManager) {
        console.log('🎯 CONSISTENCY FIX: Using SearchQueryManager SSoT for candidate terms');
        
        // Get the ACTUAL search query from SSoT (preserves "Omega")
        const actualSearchQuery = this.searchQueryManager.getCurrentQuery();
        console.log('🔧 SSoT Actual Search Query:', actualSearchQuery);
        
        // Get available terms from SSoT (includes all analyzed terms)
        const availableTerms = this.searchQueryManager.getAvailableTerms();
        console.log('🔧 SSoT Available Terms:', availableTerms.length);
        
        // Build candidate terms using SSoT data (preserves all context)
        const candidateTermsFromSSoT = {
          candidates: availableTerms.map(termObj => ({
            term: termObj.term,
            type: termObj.type,
            priority: termObj.priority || this.getTermPriority(termObj.type),
            description: termObj.description || this.getTermDescription(termObj.type),
            preSelected: termObj.isSelected || false
          })),
          currentQuery: actualSearchQuery, // CRITICAL: Use SSoT query
          analysisType: salesData.analysisType || 'artist'
        };
        
        this.lastCandidateSearchTerms = candidateTermsFromSSoT;
        salesData.candidateSearchTerms = candidateTermsFromSSoT;
        
        console.log('✅ CONSISTENCY FIX: Used SearchQueryManager SSoT data');
        console.log('🔧 SSoT Final currentQuery:', candidateTermsFromSSoT.currentQuery);
        
      } else {
        console.log('⚠️ SearchQueryManager not available - falling back to legacy extraction');
        
        // LEGACY FALLBACK: Extract actual search query from sales data
        let actualSearchQuery = '';
        if (salesData.historical && salesData.historical.actualSearchQuery) {
          actualSearchQuery = salesData.historical.actualSearchQuery;
        } else if (salesData.live && salesData.live.actualSearchQuery) {
          actualSearchQuery = salesData.live.actualSearchQuery;
        } else if (salesData.searchedEntity) {
          actualSearchQuery = salesData.searchedEntity;
        }
        
        if (actualSearchQuery) {
          // RE-EXTRACT candidate terms with the actual search query for proper pre-selection
          console.log('🔧 RE-EXTRACTING candidate terms with actual search query:', actualSearchQuery);
          const data = this.dataExtractor.extractItemData();
          const updatedCandidateTerms = searchFilterManager.extractCandidateSearchTerms(
            data.title, 
            data.description, 
            null, // no artistInfo needed for re-extraction
            actualSearchQuery // pass the actual search query
          );
          
          if (updatedCandidateTerms) {
            this.lastCandidateSearchTerms = updatedCandidateTerms;
            salesData.candidateSearchTerms = updatedCandidateTerms;
            console.log('✅ Updated candidate terms with proper pre-selection based on actual search');
          } else {
            // Fallback to original logic
            this.lastCandidateSearchTerms.currentQuery = actualSearchQuery;
            salesData.candidateSearchTerms = this.lastCandidateSearchTerms;
          }
        } else {
          salesData.candidateSearchTerms = this.lastCandidateSearchTerms;
        }
      }
      
      // NEW: Analyze valuation and suggest changes if needed
      const valuationSuggestions = this.analyzeValuationSuggestions(salesData);
      console.log('💰 Generated valuation suggestions:', valuationSuggestions);
      
      // Use the new dashboard approach and pass valuation suggestions
      this.dashboardManager.addMarketDataDashboard(salesData, valuationSuggestions);
      
      if (valuationSuggestions.length > 0) {
        console.log('💰 Adding valuation suggestions to warnings');
        // Add valuation suggestions to current warnings
        const updatedWarnings = [...currentWarnings, ...valuationSuggestions];
        qualityAnalyzer.updateQualityIndicator(currentScore, updatedWarnings);
      } else {
        console.log('💰 No valuation suggestions generated');
        // Update UI with current warnings (without market data)
        qualityAnalyzer.updateQualityIndicator(currentScore, currentWarnings);
      }
      
      console.log('✅ Market data dashboard and valuation analysis displayed');
      
      // Hide the AI loading indicator now that analysis is complete
      qualityAnalyzer.hideAILoadingIndicator();
    }
  }

  // ==================== VALUATION ANALYSIS ====================

  // NEW: Analyze cataloger's valuation against market data and suggest changes
  analyzeValuationSuggestions(salesData) {
    const suggestions = [];
    
    if (!salesData.priceRange) {
      console.log('💰 No price range in sales data');
      return suggestions;
    }
    
    // Get current valuation data
    const data = this.dataExtractor.extractItemData();
    const currentEstimate = parseInt(data.estimate) || 0;
    const currentUpperEstimate = parseInt(data.upperEstimate) || 0;
    const currentAcceptedReserve = parseInt(data.acceptedReserve) || 0;
    
    // Market data
    const marketLow = salesData.priceRange.low;
    const marketHigh = salesData.priceRange.high;
    const marketMid = (marketLow + marketHigh) / 2;
    
    console.log('💰 Analyzing valuations against market data:', {
      currentEstimate,
      currentUpperEstimate,
      currentAcceptedReserve,
      marketLow,
      marketHigh,
      marketMid
    });
    
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
    
    console.log('💰 Valuation analysis complete. Suggestions generated:', suggestions.length);
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
    
    console.log('💰 Comparison thresholds:', {
      valuation,
      marketLow,
      marketHigh,
      lowThreshold,
      highThreshold,
      tolerance,
      valuationVsMarketHigh,
      valuationVsMarketLow,
      isExtremelyHigh,
      isExtremelyLow
    });
    
    if (isExtremelyHigh) {
      // Valuation is extremely above market - this is a serious error
      const suggestedLow = Math.round(marketLow);
      const suggestedHigh = Math.round(marketHigh);
      
      console.log('💰 Valuation extremely high - major correction needed');
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
      
      console.log('💰 Valuation extremely low - major correction needed');
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
      
      console.log('💰 Valuation too low - suggesting increase');
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
      
      console.log('💰 Valuation too high - suggesting decrease');
      return {
        needsAdjustment: true,
        message: `Värdering (${this.formatSEK(valuation)}) över genomsnittliga försäljningar`,
        suggestedRange: `Överväg: ${this.formatSEK(suggestedLow)}-${this.formatSEK(suggestedHigh)} SEK (baserat på marknadsdata)`,
        severity: 'medium'
      };
    }
    
    console.log('💰 Valuation within acceptable range - providing positive feedback');
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
    
    console.log('💰 Reserve analysis:', {
      estimate,
      acceptedReserve,
      marketLow,
      marketHigh,
      marketReserveIdeal: Math.round(marketReserveIdeal),
      marketReserveMax: Math.round(marketReserveMax),
      estimateVsMarket,
      isEstimateUnrealistic
    });
    
    if (isEstimateUnrealistic) {
      // MARKET-BASED ANALYSIS: Ignore unrealistic estimate, use market data
      console.log('💰 Using market-based reserve analysis (estimate unrealistic)');
      
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
      console.log('💰 Using estimate-based reserve analysis (estimate reasonable)');
      
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
    // Get current warnings (might have been updated by artist detection)
    const currentWarningsElement = document.querySelector('.quality-warnings ul');
    let updatedWarnings = [...currentWarnings];
    
    // If artist detection already updated the warnings, get the current state
    if (currentWarningsElement) {
      updatedWarnings = qualityAnalyzer.extractCurrentWarnings();
    }
    
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
      type: 'info',
      message: message,
      severity: 'info'
    });
    
    // Update the display
    qualityAnalyzer.updateQualityIndicator(currentScore, updatedWarnings);
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
      
      qualityAnalyzer.updateQualityIndicator(currentScore, updatedWarnings);
    }
    
    qualityAnalyzer.checkAndHideLoadingIndicator();
    qualityAnalyzer.hideAILoadingIndicator();
  }

  addMarketDataWarnings(salesData, warnings) {
    console.log('📊 Adding market data warnings to quality analysis');
    
    if (!salesData.insights || salesData.insights.length === 0) {
      console.log('📊 No market insights to add');
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
    
    console.log('📊 Market warnings added:', updatedWarnings.length - warnings.length);
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