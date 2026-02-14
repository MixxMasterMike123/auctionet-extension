/**
 * Market Analysis Orchestrator - SSoT Component
 * Extracted from quality-analyzer.js
 * Handles market analysis triggers, SSoT init, dashboard wiring,
 * brand detection, freetext search, and market data warnings.
 * Deduplicates _LEGACY variant.
 */
export class MarketAnalysisOrchestrator {
  constructor() {
    this.searchQuerySSoT = null;
    this.searchFilterManager = null;
    this.salesAnalysisManager = null;
    this.apiManager = null;
    this.searchTermExtractor = null;

    // Callbacks to parent orchestrator
    this._detectMisplacedArtistRuleBased = null;
    this._extractObjectType = null;
    this._formatAIDetectedArtistForSSoT = null;

    // COST OPTIMIZATION: Deferred/lazy-load market analysis
    // When dashboard is closed, we defer the expensive analyzeSales() call
    // until the user actually opens the dashboard
    this._deferredAnalysis = null; // { searchContext, candidateSearchTerms, source }
  }

  /**
   * Check if market analysis dashboard is currently open (from localStorage)
   */
  isDashboardOpen() {
    try {
      return localStorage.getItem('auctionet_market_analysis_visible') === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Execute deferred market analysis (called when dashboard is opened)
   */
  async executeDeferredAnalysis() {
    if (!this._deferredAnalysis) return null;

    const { searchContext, candidateSearchTerms, source } = this._deferredAnalysis;
    this._deferredAnalysis = null; // Clear so it doesn't re-run

    try {
      // Show loading in dashboard
      if (this.salesAnalysisManager?.dashboardManager?.showDashboardLoading) {
        this.salesAnalysisManager.dashboardManager.showDashboardLoading('Laddar marknadsanalys...');
      }

      const salesData = await this.apiManager.analyzeSales(searchContext);

      if (salesData && salesData.hasComparableData) {
        if (candidateSearchTerms) salesData.candidateSearchTerms = candidateSearchTerms;
        if (this.salesAnalysisManager?.dashboardManager) {
          this.salesAnalysisManager.dashboardManager.addMarketDataDashboard(salesData, source);
        }
      } else {
        // Show empty state
        if (this.salesAnalysisManager?.dashboardManager && candidateSearchTerms) {
          const minimalSalesData = {
            hasComparableData: false,
            candidateSearchTerms,
            dataSource: 'no_market_data',
            confidence: 0.3,
            reasoning: 'No comparable market data found - refine search terms'
          };
          this.salesAnalysisManager.dashboardManager.addMarketDataDashboard(minimalSalesData, source + '_no_data');
        }
      }

      return salesData;
    } catch (error) {
      console.error('Deferred market analysis failed:', error);
      return null;
    } finally {
      if (this.salesAnalysisManager?.dashboardManager?.hideDashboardLoading) {
        this.salesAnalysisManager.dashboardManager.hideDashboardLoading();
      }
    }
  }

  /**
   * Run or defer analyzeSales based on dashboard visibility
   * Returns salesData if executed immediately, or null if deferred
   */
  async runOrDeferAnalysis(searchContext, candidateSearchTerms, source) {
    if (this.isDashboardOpen()) {
      // Dashboard is open — run immediately for instant UX
      const salesData = await this.apiManager.analyzeSales(searchContext);
      return salesData;
    }

    // Dashboard is closed — defer the expensive API call
    this._deferredAnalysis = { searchContext, candidateSearchTerms, source };

    // Create a placeholder dashboard so the toggle button exists
    if (this.salesAnalysisManager?.dashboardManager) {
      const placeholderData = {
        hasComparableData: false,
        candidateSearchTerms,
        dataSource: 'deferred_pending',
        confidence: 0,
        reasoning: 'Marknadsanalys laddas när dashboarden öppnas'
      };
      this.salesAnalysisManager.dashboardManager.addMarketDataDashboard(placeholderData, source + '_deferred');

      // Wire the deferred callback to dashboard manager
      this.salesAnalysisManager.dashboardManager.onDashboardOpenCallback = () => this.executeDeferredAnalysis();
    }

    return null;
  }

  /**
   * Set dependencies
   */
  setDependencies({ searchQuerySSoT, searchFilterManager, salesAnalysisManager, apiManager, searchTermExtractor }) {
    if (searchQuerySSoT) this.searchQuerySSoT = searchQuerySSoT;
    if (searchFilterManager) this.searchFilterManager = searchFilterManager;
    if (salesAnalysisManager) this.salesAnalysisManager = salesAnalysisManager;
    if (apiManager) this.apiManager = apiManager;
    if (searchTermExtractor) this.searchTermExtractor = searchTermExtractor;
  }

  /**
   * Set callbacks for methods that remain on the parent
   */
  setCallbacks({ detectMisplacedArtistRuleBased, extractObjectType, formatAIDetectedArtistForSSoT }) {
    this._detectMisplacedArtistRuleBased = detectMisplacedArtistRuleBased;
    this._extractObjectType = extractObjectType;
    this._formatAIDetectedArtistForSSoT = formatAIDetectedArtistForSSoT;
  }

  /**
   * Determine best artist/search term for market analysis
   */
  determineBestArtistForMarketAnalysis(data, aiArtist = null) {
    // 1. AI-detected artist (highest priority)
    if (aiArtist && aiArtist.detectedArtist) {
      return {
        artist: aiArtist.detectedArtist,
        source: 'ai_detected',
        confidence: aiArtist.confidence || 0.8,
        objectType: this._extractObjectType ? this._extractObjectType(data.title) : null
      };
    }

    // 2. Artist field
    if (data.artist && data.artist.trim().length > 2) {
      return {
        artist: data.artist.trim(),
        source: 'artist_field',
        confidence: 0.9,
        objectType: this._extractObjectType ? this._extractObjectType(data.title) : null
      };
    }

    // 3. Rule-based artist detection
    if (this._detectMisplacedArtistRuleBased) {
      const ruleBasedArtist = this._detectMisplacedArtistRuleBased(data.title, data.artist);
      if (ruleBasedArtist && ruleBasedArtist.detectedArtist) {
        return {
          artist: ruleBasedArtist.detectedArtist,
          source: 'rule_based',
          confidence: ruleBasedArtist.confidence || 0.7,
          objectType: this._extractObjectType ? this._extractObjectType(data.title) : null
        };
      }
    }

    // 4. Brand detection
    const brandDetection = this.detectBrandInTitle(data.title, data.description);
    if (brandDetection) {
      return {
        artist: brandDetection.brand,
        source: 'brand_detected',
        confidence: brandDetection.confidence,
        isBrand: true,
        objectType: this._extractObjectType ? this._extractObjectType(data.title) : null
      };
    }

    // 5. Freetext search
    const freetextTerms = this.extractFreetextSearchTerms(data.title, data.description);
    if (freetextTerms && freetextTerms.searchTerms.length > 0) {
      return {
        artist: freetextTerms.combined,
        source: 'freetext',
        confidence: freetextTerms.confidence,
        isFreetext: true,
        searchStrategy: freetextTerms.strategy,
        termCount: freetextTerms.searchTerms.length,
        objectType: this._extractObjectType ? this._extractObjectType(data.title) : null
      };
    }

    return null;
  }

  /**
   * AI-ONLY search query generation for market analysis
   */
  async determineBestSearchQueryForMarketAnalysis(data, aiArtist = null) {
    if (this.searchQuerySSoT) {
      try {
        const result = await this.searchQuerySSoT.generateAndSetQuery(
          data.title,
          data.description,
          data.artist || '',
          aiArtist?.detectedArtist || '',
          { updateDOMField: false }
        );

        if (result && result.success) {
          return {
            searchQuery: result.query,
            searchTerms: result.searchTerms,
            source: 'ai_only',
            confidence: result.confidence,
            reasoning: result.reasoning,
            metadata: this.searchQuerySSoT.getCurrentMetadata()
          };
        }
      } catch (error) {
        console.error('AI-ONLY: Search query generation failed:', error);
      }
    }

    // Fallback to deterministic method
    return this.determineBestArtistForMarketAnalysis(data, aiArtist);
  }

  /**
   * Detect known brands in title/description
   */
  detectBrandInTitle(title, description) {
    const knownBrands = [
      { name: 'Orrefors', confidence: 0.85 },
      { name: 'Kosta', confidence: 0.85 },
      { name: 'Boda', confidence: 0.80 },
      { name: 'Iittala', confidence: 0.85 },
      { name: 'Nuutajärvi', confidence: 0.80 },
      { name: 'Gustavsberg', confidence: 0.85 },
      { name: 'Rörstrand', confidence: 0.85 },
      { name: 'Arabia', confidence: 0.85 },
      { name: 'Royal Copenhagen', confidence: 0.85 },
      { name: 'Bing & Grøndahl', confidence: 0.80 },
      { name: 'Lammhults', confidence: 0.75 },
      { name: 'Källemo', confidence: 0.75 },
      { name: 'Svenskt Tenn', confidence: 0.80 },
      { name: 'GAB', confidence: 0.80 },
      { name: 'Atelier Borgila', confidence: 0.75 }
    ];

    const text = `${title} ${description}`.toLowerCase();
    for (const brand of knownBrands) {
      if (text.includes(brand.name.toLowerCase())) {
        return { brand: brand.name, confidence: brand.confidence };
      }
    }
    return null;
  }

  /**
   * Extract meaningful search terms for freetext market analysis
   */
  extractFreetextSearchTerms(title, description) {
    const text = `${title} ${description}`.toLowerCase();
    const searchTerms = [];

    const objectType = this._extractObjectType ? this._extractObjectType(title) : null;
    if (objectType) {
      searchTerms.push(objectType.toLowerCase());
    }

    if (this.searchTermExtractor) {
      const materials = this.searchTermExtractor.extractMaterials(text);
      if (materials.length > 0) searchTerms.push(...materials.slice(0, 2));

      const periods = this.searchTermExtractor.extractPeriods(text);
      if (periods.length > 0) searchTerms.push(periods[0]);

      const styles = this.searchTermExtractor.extractStyles(text);
      if (styles.length > 0) searchTerms.push(styles[0]);
    }

    if (searchTerms.length < 2) return null;

    const uniqueTerms = [...new Set(searchTerms)];
    const combined = uniqueTerms.slice(0, 4).join(' ');

    let confidence = 0.4;
    if (uniqueTerms.length >= 3) confidence += 0.2;
    if (this.searchTermExtractor) {
      const materials = this.searchTermExtractor.extractMaterials(text);
      const periods = this.searchTermExtractor.extractPeriods(text);
      if (materials.length > 0) confidence += 0.1;
      if (periods.length > 0) confidence += 0.1;
    }

    return {
      searchTerms: uniqueTerms,
      combined: combined,
      confidence: Math.min(0.8, confidence),
      strategy: 'extracted_terms'
    };
  }

  /**
   * Extract technique/method information from title and description
   */
  extractTechnique(title, description) {
    const text = `${title} ${description}`.toLowerCase();

    const techniques = [
      'olja på duk', 'olja på pannå', 'akvarell', 'tempera', 'gouache',
      'litografi', 'etsning', 'träsnitt', 'linoleum', 'serigrafi',
      'blandteknik', 'collage', 'pastell', 'kol', 'tusch',
      'brons', 'gjutjärn', 'marmor', 'granit', 'trä', 'terrakotta',
      'patinerad', 'förgylld', 'försilvrad',
      'glaserad', 'oglaserad', 'stengods', 'lergods', 'porslin',
      'rakubränd', 'saltglaserad', 'raku',
      'handblåst', 'pressglas', 'kristall', 'optiskt glas',
      'graverad', 'etsad', 'slipat',
      'vävd', 'knuten', 'broderad', 'applikation', 'batik',
      'rölakan', 'gobeläng', 'flemväv',
      'smitt', 'gjuten', 'driven', 'ciselerad', 'graverad',
      'emaljerad', 'förgylld', 'försilvrad'
    ];

    for (const technique of techniques) {
      if (text.includes(technique)) return technique;
    }
    return null;
  }

  /**
   * Trigger dashboard analysis for non-art items
   */
  async triggerDashboardForNonArtItems(data) {
    if (!this.searchQuerySSoT || !this.searchFilterManager || !this.apiManager || !this.salesAnalysisManager) {
      return;
    }

    try {
      const candidateSearchTerms = this.searchFilterManager.extractCandidateSearchTerms(
        data.title, data.description, '', ''
      );

      if (candidateSearchTerms && candidateSearchTerms.candidates && candidateSearchTerms.candidates.length > 0) {
        this.searchQuerySSoT.initialize(
          candidateSearchTerms.currentQuery,
          candidateSearchTerms,
          'non_art_item'
        );

        const searchContext = this.searchQuerySSoT.buildSearchContext();

        // COST OPTIMIZATION: Defer expensive API call if dashboard is closed
        const salesData = await this.runOrDeferAnalysis(searchContext, candidateSearchTerms, 'non_art_complete');

        if (salesData && salesData.hasComparableData) {
          salesData.candidateSearchTerms = candidateSearchTerms;
          if (this.salesAnalysisManager.dashboardManager) {
            this.salesAnalysisManager.dashboardManager.addMarketDataDashboard(salesData, 'non_art_complete');
          }
        } else if (salesData) {
          // salesData returned but no comparable data (not deferred, just no results)
          if (this.salesAnalysisManager.dashboardManager && candidateSearchTerms) {
            const minimalSalesData = {
              hasComparableData: false,
              candidateSearchTerms: candidateSearchTerms,
              dataSource: 'no_market_data',
              confidence: 0.3,
              reasoning: 'No comparable market data found - refine search terms'
            };
            this.salesAnalysisManager.dashboardManager.addMarketDataDashboard(minimalSalesData, 'non_art_no_data');
          }
        }
        // If salesData is null, analysis was deferred — placeholder already created by runOrDeferAnalysis
      }
    } catch (error) {
      console.error('Error during non-art dashboard trigger:', error);
    }
  }

  /**
   * Trigger market analysis with an existing artist field value
   */
  async triggerMarketAnalysisWithExistingArtist(data) {
    if (this.searchQuerySSoT && this.searchFilterManager && data.artist) {
      try {
        const formattedArtist = this._formatAIDetectedArtistForSSoT
          ? this._formatAIDetectedArtistForSSoT(data.artist)
          : data.artist;

        const candidateSearchTerms = this.searchFilterManager.extractCandidateSearchTerms(
          data.title, data.description, { artist: formattedArtist }, formattedArtist
        );

        if (candidateSearchTerms && candidateSearchTerms.candidates && candidateSearchTerms.candidates.length > 0) {
          this.searchQuerySSoT.initialize(
            candidateSearchTerms.currentQuery,
            candidateSearchTerms,
            'existing_artist_field'
          );

          if (this.apiManager) {
            const searchContext = this.searchQuerySSoT.buildSearchContext();

            // COST OPTIMIZATION: Defer if dashboard is closed
            const salesData = await this.runOrDeferAnalysis(searchContext, candidateSearchTerms, 'existing_artist_field');

            if (salesData && salesData.hasComparableData) {
              if (this.salesAnalysisManager?.dashboardManager) {
                this.salesAnalysisManager.dashboardManager.addMarketDataDashboard(salesData, 'existing_artist_field');
              }
            }
            // If null, analysis was deferred — placeholder already shown
          }
        } else {
          await this.triggerDashboardForNonArtItems(data);
        }
      } catch (error) {
        console.error('Market analysis with existing artist failed:', error);
        await this.triggerDashboardForNonArtItems(data);
      }
    } else {
      await this.triggerDashboardForNonArtItems(data);
    }
  }

  /**
   * Add market data warnings to the warning list
   */
  addMarketDataWarnings(salesData, warnings) {
    const dataSource = salesData.dataSource || 'unknown';

    warnings.push({
      field: 'Marknadsdata',
      issue: '',
      severity: 'header'
    });

    if (salesData.priceRange) {
      const confidence = salesData.confidence;
      const priceRange = salesData.priceRange;
      const formattedLow = new Intl.NumberFormat('sv-SE').format(priceRange.low);
      const formattedHigh = new Intl.NumberFormat('sv-SE').format(priceRange.high);

      let confidenceText = '';
      if (confidence >= 0.8) confidenceText = 'Hög tillförlitlighet';
      else if (confidence >= 0.6) confidenceText = 'Medel tillförlitlighet';
      else confidenceText = 'Låg tillförlitlighet';

      warnings.push({
        field: 'Värdering',
        issue: `${formattedLow}-${formattedHigh} SEK (${confidenceText} ${Math.round(confidence * 100)}%)`,
        severity: 'market-primary'
      });
    }

    if (salesData.insights && salesData.insights.length > 0) {
      const significantInsights = salesData.insights.filter(i => i.significance === 'high');
      if (significantInsights.length > 0) {
        const insight = significantInsights[0];
        let severity = 'market-insight';

        if (insight.type === 'price_comparison' || insight.type === 'conflict') {
          const text = insight.summary || insight.detail || insight.message || '';
          if (text.includes('höja') || text.includes('sänk')) {
            severity = 'market-primary';
          }
        } else if (insight.type === 'market_strength' || insight.type === 'market_weakness') {
          severity = 'market-activity';
        }

        warnings.push({
          field: 'Marknadstrend',
          issue: insight.summary || insight.message,
          severity: severity
        });
      }
    }

    let dataParts = [];
    if (salesData.historical) dataParts.push(`${salesData.historical.analyzedSales} historiska`);
    if (salesData.live) dataParts.push(`${salesData.live.analyzedLiveItems} pågående`);
    if (dataParts.length > 0) {
      warnings.push({
        field: 'Dataunderlag',
        issue: `${dataParts.join(' • ')} försäljningar analyserade`,
        severity: 'market-data'
      });
    }

    if (salesData.live && salesData.live.marketActivity) {
      const activity = salesData.live.marketActivity;
      if (activity.reservesMetPercentage > 80) {
        warnings.push({
          field: 'Marknadsaktivitet',
          issue: `Stark marknad (${activity.reservesMetPercentage}% når utrop)`,
          severity: 'market-activity'
        });
      } else if (activity.reservesMetPercentage < 20) {
        warnings.push({
          field: 'Marknadsaktivitet',
          issue: `Svag marknad (${activity.reservesMetPercentage}% når utrop)`,
          severity: 'market-activity'
        });
      }
    }

    if (salesData.confidence < 0.5) {
      warnings.push({
        field: 'Notera',
        issue: 'Begränsad data',
        severity: 'market-note'
      });
    }
  }
}
