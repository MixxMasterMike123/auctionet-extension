import { SearchTermExtractor } from "/modules/search-term-extractor.js";
import { ItemTypeHandlers } from "/modules/item-type-handlers.js";
import { SalesAnalysisManager } from "/modules/sales-analysis-manager.js";
import { DashboardManagerV2 } from './dashboard-manager-v2.js';
import { SearchFilterManager } from './search-filter-manager.js';
import { DataExtractor } from './data-extractor.js';
import { SearchQuerySSoT } from './search-query-ssot.js';
import { ArtistDetectionManager } from './artist-detection-manager.js';
import { BrandValidationManager } from './brand-validation-manager.js';
import { InlineBrandValidator } from './inline-brand-validator.js';
import { ArtistIgnoreManager } from './artist-ignore-manager.js';
import { AuctionetArtistLookup } from './auctionet-artist-lookup.js';
import { cleanTitleAfterArtistRemoval } from './core/title-cleanup-utility.js';
import { BiographyTooltipManager } from './core/biography-tooltip-manager.js';
import { CircularProgressManager } from './core/circular-progress-manager.js';
import { UIFeedbackManager } from './core/ui-feedback-manager.js';
import { QualityUIRenderer } from './core/quality-ui-renderer.js';
import { BrandActionHandler } from './core/brand-action-handler.js';
import { BiographyKBCard } from './core/biography-kb-card.js';
import { MarketAnalysisOrchestrator } from './core/market-analysis-orchestrator.js';
import { QualityRulesEngine } from './core/quality-rules-engine.js';
import { escapeHTML } from './core/html-escape.js';
// modules/quality-analyzer.js - Quality Analysis Module
export class QualityAnalyzer {
  constructor() {
    this.warnings = [];
    this.currentScore = 100;
    this.dataExtractor = new DataExtractor();
    this.apiManager = null;
    this.searchQueryManager = null; // SSoT reference
    this.searchQuerySSoT = null; // NEW: AI-only search query system
    this.immediateAnalysisStarted = false; // Prevent duplicate sales analysis
    this.previousFreetextData = null;
    this.searchTermExtractor = new SearchTermExtractor(); // Fix: create instance of class
    this.itemTypeHandlers = new ItemTypeHandlers();

    // NEW: Initialize ArtistDetectionManager SSoT
    this.artistDetectionManager = new ArtistDetectionManager();

    // NEW: Initialize BrandValidationManager
    this.brandValidationManager = new BrandValidationManager();

    // NEW: Initialize InlineBrandValidator for real-time field validation
    this.inlineBrandValidator = new InlineBrandValidator(this.brandValidationManager);

    // NEW: Initialize ArtistIgnoreManager for handling false positives
    this.artistIgnoreManager = new ArtistIgnoreManager();
    this.auctionetArtistLookup = new AuctionetArtistLookup();
    this.artistIgnoreManager.setQualityAnalyzer(this);
    // No need to call .init() - initialization happens automatically in constructor

    // NEW: Initialize Biography Tooltip Manager SSoT component
    this.biographyManager = new BiographyTooltipManager();
    this.biographyManager.init();

    // NEW: Initialize Circular Progress Manager for quality indicators
    this.circularProgressManager = new CircularProgressManager();

    // NEW: Initialize UI Feedback Manager for loading/spinner/flash
    this.feedbackManager = new UIFeedbackManager();

    // NEW: Initialize Quality UI Renderer for indicators, hints, condition suggestions
    this.qualityUIRenderer = new QualityUIRenderer(this.circularProgressManager);
    this.qualityUIRenderer.setCallbacks({
      onSetupIgnoreArtistHandlers: () => this.setupIgnoreArtistHandlers(),
      onReanalyze: () => this.analyzeQuality()
    });

    // NEW: Initialize Market Analysis Orchestrator
    this.marketOrchestrator = new MarketAnalysisOrchestrator();
    this.marketOrchestrator.setDependencies({
      searchTermExtractor: this.searchTermExtractor
    });
    this.marketOrchestrator.setCallbacks({
      detectMisplacedArtistRuleBased: (title, artist) => this.detectMisplacedArtistRuleBased(title, artist),
      extractObjectType: (title) => this.extractObjectType(title),
      formatAIDetectedArtistForSSoT: (artist) => this.formatAIDetectedArtistForSSoT(artist)
    });

    // NEW: Initialize Biography KB Card
    this.biographyKBCard = new BiographyKBCard();
    this.biographyKBCard.setCallbacks({
      onReanalyze: () => this.analyzeQuality()
    });

    // NEW: Initialize Brand Action Handler
    this.brandActionHandler = new BrandActionHandler();
    this.brandActionHandler.setDependencies({
      brandValidationManager: this.brandValidationManager,
      dataExtractor: this.dataExtractor,
      feedbackManager: this.feedbackManager
    });
    this.brandActionHandler.setCallbacks({
      onUpdateQualityIndicator: (score, warnings, animate) => this.updateQualityIndicator(score, warnings, animate),
      onCalculateScore: (data) => this.calculateCurrentQualityScore(data),
      onReanalyze: () => this.analyzeQuality()
    });

    // NEW: Initialize Quality Rules Engine for scoring/validation
    this.rulesEngine = new QualityRulesEngine();

    // Initialize manager instances
    this.salesAnalysisManager = new SalesAnalysisManager();
    this.searchFilterManager = new SearchFilterManager();
    this.dashboardManager = new DashboardManagerV2();

    this.pendingAnalyses = new Set();
    this.aiAnalysisActive = false;

    // Inject dependencies
    this.itemTypeHandlers.setSearchTermExtractor(this.searchTermExtractor);


  }

  setDataExtractor(extractor) {
    this.dataExtractor = extractor;
    this.salesAnalysisManager.setDataExtractor(extractor);
  }

  setDashboardManager(dashboardManager) {
    this.dashboardManager = dashboardManager;
    this.salesAnalysisManager.setDashboardManager(dashboardManager);
    this.searchFilterManager.setDashboardManager(dashboardManager);
  }

  setApiManager(apiManager) {
    this.apiManager = apiManager;

    // NEW: Connect ArtistDetectionManager to API manager for AI detection
    this.artistDetectionManager.setApiManager(apiManager);

    // NEW: Connect BrandValidationManager to API manager for AI brand validation
    this.brandValidationManager.setApiManager(apiManager);

    // NEW: Connect InlineBrandValidator to BrandValidationManager
    this.inlineBrandValidator.setBrandValidationManager(this.brandValidationManager);

    // Connect SearchQuerySSoT to apiManager for SSoT-consistent queries
    if (this.searchQuerySSoT) {
      apiManager.setSearchQuerySSoT(this.searchQuerySSoT);
    }

    // Debug: Check if salesAnalysisManager is available
    if (this.salesAnalysisManager) {
      this.salesAnalysisManager.setApiManager(apiManager);

      // 🔧 CRITICAL FIX: Only set DashboardManager if SalesAnalysisManager doesn't already have one
      if (!this.salesAnalysisManager.dashboardManager) {
        this.salesAnalysisManager.setDashboardManager(this.dashboardManager);
      }

      this.salesAnalysisManager.setDataExtractor(this.dataExtractor); // NEW: Set data extractor
    } else {
      console.error('SalesAnalysisManager not available during setApiManager call');
    }

    this.dashboardManager.setApiManager(apiManager);
    // Pass dependencies to the search filter manager
    this.searchFilterManager.setQualityAnalyzer(this);
    this.searchFilterManager.setDashboardManager(this.dashboardManager);
    this.searchFilterManager.setApiManager(apiManager);
    this.searchFilterManager.setDataExtractor(this.dataExtractor);

    // Wire API to Quality UI Renderer for AI condition suggestions
    this.qualityUIRenderer.setApiManager(apiManager);

    // Wire API to Biography KB Card for bio fetching
    this.biographyKBCard.setApiManager(apiManager);

    // Wire API to Market Orchestrator
    this.marketOrchestrator.setDependencies({
      apiManager: apiManager,
      salesAnalysisManager: this.salesAnalysisManager,
      searchFilterManager: this.searchFilterManager
    });
  }

  // NEW: Set SearchQueryManager for SSoT usage
  setSearchQueryManager(searchQueryManager) {
    this.searchQueryManager = searchQueryManager;
    // DEPRECATED: This method is kept for backward compatibility but should use setSearchQuerySSoT

  }

  // NEW: Set AI-only search query system
  setSearchQuerySSoT(searchQuerySSoT) {
    this.searchQuerySSoT = searchQuerySSoT;

    // CRITICAL FIX: Listen to SSoT events to trigger dashboard refresh when pills are clicked
    this.searchQuerySSoT.addListener((event, data) => {
      if (event === 'user_selection_updated') {
        this.handleUserSelectionUpdate(data);
      }
    });

    // Connect SearchQuerySSoT to apiManager for SSoT-consistent queries
    if (this.apiManager) {
      this.apiManager.setSearchQuerySSoT(searchQuerySSoT);
    }

    // Wire SearchQuerySSoT to all components that need it
    this.salesAnalysisManager.setSearchQuerySSoT(searchQuerySSoT);
    this.searchFilterManager.setSearchQuerySSoT(searchQuerySSoT);

    // NEW: Wire ArtistIgnoreManager SearchQuerySSoT dependency (already initialized in constructor)
    this.artistIgnoreManager.setSearchQuerySSoT(searchQuerySSoT);

    // Wire SearchQuerySSoT to Market Orchestrator
    this.marketOrchestrator.setDependencies({ searchQuerySSoT: searchQuerySSoT });
  }

  // NEW: Delegate artist detection to ArtistDetectionManager SSoT
  async detectMisplacedArtist(title, artistField, forceReDetection = false) {
    return await this.artistDetectionManager.detectMisplacedArtist(title, artistField, forceReDetection);
  }

  // NEW: Delegate rule-based detection to ArtistDetectionManager SSoT  
  detectMisplacedArtistRuleBased(title, artistField) {
    return this.artistDetectionManager.detectMisplacedArtistRuleBased(title, artistField);
  }

  // CRITICAL FIX: Handle user selection updates from SSoT to trigger new market analysis
  async handleUserSelectionUpdate(data) {
    try {
      // Show loading spinner on dashboard
      if (this.salesAnalysisManager.dashboardManager && typeof this.salesAnalysisManager.dashboardManager.showDashboardLoading === 'function') {
        this.salesAnalysisManager.dashboardManager.showDashboardLoading('Uppdaterar analys med nya söktermer...');
      } else {
        console.error('QualityAnalyzer: Dashboard manager or showDashboardLoading method not available!');
      }

      // Get the updated search context from SSoT
      const searchContext = this.searchQuerySSoT.buildSearchContext();

      // Trigger new market analysis with updated query
      const salesData = await this.apiManager.analyzeSales(searchContext);

      if (salesData) {
        // Update dashboard with new results
        if (this.salesAnalysisManager.dashboardManager) {
          this.salesAnalysisManager.dashboardManager.addMarketDataDashboard(salesData);
        }
      }

    } catch (error) {
      console.error('QualityAnalyzer: Failed to handle user selection update:', error);
    } finally {
      // Hide loading spinner
      if (this.salesAnalysisManager.dashboardManager && typeof this.salesAnalysisManager.dashboardManager.hideDashboardLoading === 'function') {
        this.salesAnalysisManager.dashboardManager.hideDashboardLoading();
      } else {
        console.error('QualityAnalyzer: Dashboard manager or hideDashboardLoading method not available in finally!');
      }
    }
  }

  // NEW: Delegate helper methods to ArtistDetectionManager SSoT
  extractObjectType(title) {
    return this.artistDetectionManager.extractObjectType(title);
  }

  extractPeriod(title) {
    return this.artistDetectionManager.extractPeriod(title);
  }

  generateSuggestedTitle(originalTitle, artistName) {
    return this.artistDetectionManager.generateSuggestedTitle(originalTitle, artistName);
  }

  looksLikePersonName(name) {
    return this.artistDetectionManager.looksLikePersonName(name);
  }

  calculateArtistConfidence(artistName, objectType) {
    return this.artistDetectionManager.calculateArtistConfidence(artistName, objectType);
  }

  // Helper method for measurements in Swedish format
  hasMeasurements(text) {
    return this.rulesEngine.hasMeasurements(text);
  }

  async analyzeQuality() {
    if (!this.dataExtractor) {
      console.error('Data extractor not set');
      return;
    }

    const data = this.dataExtractor.extractItemData();

    // --- Artist field bio hover (reference guide for filled artist field) ---
    this.setupArtistFieldBioHover(data.artist, data.artistDates, data.title, data.description);

    // Run all validation rules via the rules engine
    const { warnings, score } = this.rulesEngine.runValidationRules(data);

    // Render inline hints below fields for FAQ violations
    this.renderInlineHints(warnings);

    // Update UI with immediate results (no animation for initial display)
    this.updateQualityIndicator(score, warnings, false);

    // Now run AI artist detection asynchronously and update when complete (only if API is available)
    if (this.apiManager) {
      this.runAIArtistDetection(data, warnings, score);
    }
  }

  async runAIArtistDetection(data, currentWarnings, currentScore) {
    // OPTIMIZATION: Skip AI analysis if artist field is filled AND no artist detected in title
    if (data.artist && data.artist.trim()) {

      // Quick rule-based check if title contains artist names
      const titleHasArtist = this.detectMisplacedArtistRuleBased(data.title, data.artist);

      if (!titleHasArtist || !titleHasArtist.detectedArtist) {

        // Still run brand validation and market analysis with existing artist
        this.showAILoadingIndicator('🏷️ Kontrollerar märkesnamn...');
        this.aiAnalysisActive = true;
        this.pendingAnalyses = new Set(['brand']); // Only brand validation

        try {
          // Run brand validation
          const brandValidationPromise = this.brandValidationManager.validateBrandsInContent(data.title, data.description);
          const brandIssues = await Promise.race([
            brandValidationPromise,
            new Promise(resolve => setTimeout(() => resolve([]), 5000)) // Increased back to 5s to match artist detection
          ]);

          // Handle brand validation results
          if (brandIssues && brandIssues.length > 0) {
            await this.handleBrandValidationResult(brandIssues, data, currentWarnings, currentScore);
          }

          // Trigger market analysis with existing artist
          await this.triggerMarketAnalysisWithExistingArtist(data);

        } catch (error) {
          console.error('Brand validation failed:', error);
        } finally {
          this.pendingAnalyses.delete('brand');
          this.aiAnalysisActive = false;
          this.hideAILoadingIndicator();
        }

        return; // Skip the rest of AI artist detection
      }
    }

    // Show initial AI loading indicator
    this.showAILoadingIndicator('🔍 Söker konstnärsnamn...');
    this.aiAnalysisActive = true;
    this.pendingAnalyses = new Set();

    // DEBUG: Check artist ignore manager state at start


    try {
      // Track pending analyses
      this.pendingAnalyses.add('artist');
      this.pendingAnalyses.add('brand');

      // NEW FLOW: Initially exclude artists detected in title from SSoT

      // First, check if we have an immediate artist (from field or rule-based detection)
      const immediateArtist = this.determineBestArtistForMarketAnalysis(data);

      // NEW: Pre-filter ignored artists from title before AI analysis
      const ignoredArtists = this.artistIgnoreManager.getIgnoredArtists();
      let analysisTitle = data.title;


      // Remove ignored artists from title before AI analysis to prevent re-detection
      for (const ignoredArtist of ignoredArtists) {
        const normalizedIgnored = this.artistIgnoreManager.normalizeArtistName(ignoredArtist);
        const titleWords = analysisTitle.toLowerCase();

        if (titleWords.includes(normalizedIgnored)) {
          // Remove the ignored artist from title for analysis
          const regex = new RegExp(`\\b${this.escapeRegex(ignoredArtist)}\\b`, 'gi');
          analysisTitle = analysisTitle.replace(regex, '').replace(/\s+/g, ' ').trim();
        }
      }


      // Start parallel analyses - artist detection AND brand validation
      // Always run AI analysis for verification and brand validation, but don't suggest title changes when artist field is filled
      const artistAnalysisPromise = this.detectMisplacedArtist(analysisTitle, data.artist, false);
      const brandValidationPromise = this.brandValidationManager.validateBrandsInContent(data.title, data.description);

      // CRITICAL ENHANCEMENT: Handle AI artist detection but EXCLUDE from initial SSoT
      const startTime = Date.now();
      const aiArtistForMarketAnalysis = await Promise.race([
        artistAnalysisPromise,
        new Promise(resolve => setTimeout(() => {
          resolve(null);
        }, 5000)) // 5s timeout - adjusted for real-world Haiku performance
      ]);
      const endTime = Date.now();


      // NEW: Handle brand validation in parallel
      this.updateAILoadingMessage('🏷️ Kontrollerar märkesnamn...');

      // CRITICAL FIX: Show artist detection UI for ALL detected artists, regardless of where found

      if (aiArtistForMarketAnalysis && aiArtistForMarketAnalysis.detectedArtist) {


        // FIRST: Show the artist detection UI (this was missing!)
        await this.handleArtistDetectionResult(aiArtistForMarketAnalysis, data, currentWarnings, currentScore);

        // SECOND: Handle market analysis based on where artist was found
        if (aiArtistForMarketAnalysis.foundIn === 'title' || aiArtistForMarketAnalysis.foundIn === 'titel') {


          // Generate SSoT WITH the detected artist for comprehensive market analysis
          if (this.searchQuerySSoT && this.searchFilterManager) {

            // Extract candidate terms WITH the detected artist for market analysis
            let candidateSearchTerms = null;
            try {
              candidateSearchTerms = this.searchFilterManager.extractCandidateSearchTerms(
                data.title,
                data.description,
                { artist: aiArtistForMarketAnalysis.detectedArtist }, // Use AI-detected artist for market analysis
                aiArtistForMarketAnalysis.detectedArtist || '' // Pass AI-detected artist as context
              );
            } catch (error) {
              console.error('Error in extractCandidateSearchTerms:', error);
            }

            if (candidateSearchTerms && candidateSearchTerms.candidates && candidateSearchTerms.candidates.length > 0) {

              // Initialize SSoT with terms INCLUDING detected artist
              this.searchQuerySSoT.initialize(
                candidateSearchTerms.currentQuery,
                candidateSearchTerms,
                'comprehensive_with_detected_artist'
              );

              // Trigger market analysis with conservative search context
              if (this.apiManager) {
                const searchContext = this.searchQuerySSoT.buildSearchContext();

                // Start market analysis in background (non-blocking)
                this.apiManager.analyzeSales(searchContext).then(salesData => {
                  if (salesData && salesData.hasComparableData) {

                    // Update dashboard with comprehensive results
                    if (this.salesAnalysisManager && this.salesAnalysisManager.dashboardManager) {
                      this.salesAnalysisManager.dashboardManager.addMarketDataDashboard(salesData, 'comprehensive_with_detected_artist');
                    }
                  }
                }).catch(error => {
                  console.error('Comprehensive market analysis failed:', error);
                });
              }
            } else {

              await this.triggerDashboardForNonArtItems(data);
            }
          } else {

            await this.triggerDashboardForNonArtItems(data);
          }
        } else if (aiArtistForMarketAnalysis.foundIn === 'artist') {


          // Artist found in artist field - include in SSoT as before
          const formattedAIArtist = this.formatAIDetectedArtistForSSoT(aiArtistForMarketAnalysis.detectedArtist);

          if (this.searchQuerySSoT && this.searchFilterManager) {

            // Create enhanced data with AI-detected artist for full analysis
            const enhancedData = {
              ...data,
              aiDetectedArtist: aiArtistForMarketAnalysis.detectedArtist
            };

            // Extract FULL candidate terms WITH artist integration  
            const candidateSearchTerms = this.searchFilterManager.extractCandidateSearchTerms(
              data.title,
              data.description,
              { artist: formattedAIArtist }, // Include AI artist from field
              formattedAIArtist // Pass formatted artist as context
            );

            if (candidateSearchTerms && candidateSearchTerms.candidates && candidateSearchTerms.candidates.length > 0) {

              // Initialize SSoT with FULL candidate terms including artist
              this.searchQuerySSoT.initialize(
                candidateSearchTerms.currentQuery,
                candidateSearchTerms,
                'ai_enhanced_with_field_artist'
              );

              // Trigger market analysis with FULL search context
              if (this.apiManager) {
                const searchContext = this.searchQuerySSoT.buildSearchContext();

                // Start market analysis in background (non-blocking)
                this.apiManager.analyzeSales(searchContext).then(salesData => {
                  if (salesData && salesData.hasComparableData) {

                    // Update dashboard with full results
                    if (this.salesAnalysisManager && this.salesAnalysisManager.dashboardManager) {
                      this.salesAnalysisManager.dashboardManager.addMarketDataDashboard(salesData, 'ai_enhanced_with_field_artist');
                    }
                  }
                }).catch(error => {
                  console.error('Full market analysis failed:', error);
                });
              }
            } else {

              await this.triggerDashboardForNonArtItems(data);
            }
          } else {

            await this.triggerDashboardForNonArtItems(data);
          }
        } else {
          // CRITICAL: Fallback case for any other foundIn value (or missing foundIn)

          await this.triggerDashboardForNonArtItems(data);
        }

        // Clean up pending analysis since we already handled UI above
        this.pendingAnalyses.delete('artist');
      } else {
        // Standard flow for non-artist items
        await this.triggerDashboardForNonArtItems(data);
        this.pendingAnalyses.delete('artist');
      }

      // Check if artist analysis is complete and hide loading if needed
      if (this.pendingAnalyses.size === 0) {
        this.hideAILoadingIndicator();
        this.aiAnalysisActive = false;
      }

      // NEW: Handle brand validation results in parallel
      brandValidationPromise.then(brandIssues => {
        this.handleBrandValidationResult(brandIssues, data, currentWarnings, currentScore).then(result => {
          this.pendingAnalyses.delete('brand');

          // Only hide loading if all analyses are done
          if (this.pendingAnalyses.size === 0) {
            this.hideAILoadingIndicator();
            this.aiAnalysisActive = false;
          }
        });
      }).catch(error => {
        console.error('Brand validation failed:', error);
        this.pendingAnalyses.delete('brand');

        if (this.pendingAnalyses.size === 0) {
          this.hideAILoadingIndicator();
          this.aiAnalysisActive = false;
        }
      });

    } catch (error) {
      console.error('AI Analysis Error:', error);
      this.pendingAnalyses.delete('artist');
      this.pendingAnalyses.delete('brand');
      this.hideAILoadingIndicator();
      this.aiAnalysisActive = false;
    }
  }

  // NEW: Format AI-detected artist for SSoT integration with maximum precision
  formatAIDetectedArtistForSSoT(artistName) {
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

  async handleArtistDetectionResult(aiArtist, data, currentWarnings, currentScore) {

    // Check if aiArtist is null or undefined
    if (!aiArtist || !aiArtist.detectedArtist) {


      // IMPORTANT: Recalculate score with latest data and trigger quality indicator update with animation
      const latestData = this.dataExtractor.extractItemData();
      const recalculatedScore = this.calculateCurrentQualityScore(latestData);
      this.updateQualityIndicator(recalculatedScore, currentWarnings, true);

      // Note: Dashboard will be triggered by artist-specific market analysis when artist is detected

      return {
        detectedArtist: null,
        warnings: currentWarnings,
        score: currentScore
      };
    }

    // NEW: Filter out ignored artists (false positives)
    const filteredResult = this.artistIgnoreManager.filterDetectionResult(aiArtist);
    if (!filteredResult) {


      // Still trigger dashboard for non-art items when artist is ignored
      await this.triggerDashboardForNonArtItems(data);

      return {
        detectedArtist: null,
        warnings: currentWarnings,
        score: currentScore
      };
    }

    // TEMPORARILY DISABLED: Waiting for official Auctionet API access for artist biographies
    // The unofficial approach (HTML scraping) is unreliable due to artist ID requirements
    // TODO: Re-enable once we have proper API endpoint from Auctionet
    /*
    // NEW: Fetch verified biography from Auctionet
    let auctionetBio = null;
    try {
      auctionetBio = await this.auctionetArtistLookup.getArtistBiography(aiArtist.detectedArtist);
      
    } catch (error) {
      console.error(`Error fetching Auctionet biography:`, error);
    }
    */
    let auctionetBio = null; // Disabled until API access

    // Create properly formatted warning for the existing display system (without button - we'll add it programmatically)
    // CRITICAL FIX: Create clean text message first, then add HTML elements programmatically to avoid data corruption
    const artistMessage = aiArtist.verification ?
      `Hittade konstnär: "${aiArtist.detectedArtist}" (95% säkerhet) ✓ Verifierad konstnär (biografi tillgänglig) — flytta från ${aiArtist.foundIn || 'titel'} till konstnärsfält` :
      `Hittade konstnär: "${aiArtist.detectedArtist}" (${Math.round(aiArtist.confidence * 100)}% säkerhet) — flytta från ${aiArtist.foundIn || 'titel'} till konstnärsfält`;


    // Insert artist warning at the beginning since it's important info
    const artistWarning = {
      field: 'Titel',
      issue: artistMessage,
      severity: 'medium',
      detectedArtist: aiArtist.detectedArtist, // For click-to-copy functionality
      suggestedTitle: aiArtist.suggestedTitle,
      suggestedDescription: aiArtist.suggestedDescription,
      foundIn: aiArtist.foundIn,
      verification: aiArtist.verification, // NEW: Store verification data for biography tooltip
      auctionetBio: auctionetBio, // NEW: Add Auctionet biography data
      isArtistWarning: true, // NEW: Mark this as an artist warning to preserve it
      dataAttributes: { 'data-artist-warning': 'true' } // NEW: Add data attribute for ignore button targeting
    };


    // CRITICAL FIX: Don't add duplicate artist warnings
    const existingArtistWarningIndex = currentWarnings.findIndex(w => w.isArtistWarning);
    if (existingArtistWarningIndex >= 0) {
      currentWarnings[existingArtistWarningIndex] = artistWarning;
    } else {
      currentWarnings.unshift(artistWarning);
    }

    // Update quality display with animation after AI analysis (recalculate score with latest data)
    const latestData = this.dataExtractor.extractItemData();
    const recalculatedScore = this.calculateCurrentQualityScore(latestData);
    this.updateQualityIndicator(recalculatedScore, currentWarnings, true);

    // NEW: Setup ignore button event handler
    setTimeout(() => {
      this.setupIgnoreArtistHandlers();
    }, 100);

    // CRITICAL FIX: SSoT already initialized in runAIArtistDetection - no duplicate logic needed

    return {
      detectedArtist: aiArtist,
      warnings: currentWarnings,
      score: currentScore
    };
  }

  // NEW: Handle brand validation results
  async handleBrandValidationResult(brandIssues, data, currentWarnings, currentScore) {
    return this.brandActionHandler.handleBrandValidationResult(brandIssues, data, currentWarnings, currentScore);
  }

  // NEW: Show better confirmation dialog for ignoring artists
  showIgnoreConfirmationDialog(artistName) {
    return new Promise((resolve) => {
      // Create modal dialog
      const modal = document.createElement('div');
      modal.className = 'ignore-artist-modal';
      modal.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
          <div class="modal-header">
            <h3>🚫 Ignorera konstnärsdetektering</h3>
          </div>
          <div class="modal-body">
            <p><strong>Konstnär:</strong> ${escapeHTML(artistName)}</p>
            <p>Detta kommer att:</p>
            <ul>
              <li>✕ Ta bort varningen från kvalitetsindikatorn</li>
              <li>🔄 Köra ny analys utan denna konstnär</li>
              <li>🚫 Förhindra framtida detekteringar av samma namn</li>
              <li>💾 Spara inställningen för denna session</li>
            </ul>
            <p><small><em>Denna åtgärd kan inte ångras under pågående session.</em></small></p>
          </div>
          <div class="modal-footer">
            <button class="btn-cancel">Avbryt</button>
            <button class="btn-confirm">Ignorera konstnär</button>
          </div>
        </div>
      `;

      // Add styles
      const style = document.createElement('style');
      style.textContent = `
        .ignore-artist-modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 10000;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .ignore-artist-modal .modal-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(2px);
        }
        .ignore-artist-modal .modal-content {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: white;
          border-radius: 8px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
          max-width: 500px;
          width: 90%;
          max-height: 80vh;
          overflow: auto;
        }
        .ignore-artist-modal .modal-header {
          padding: 20px 20px 0;
          border-bottom: 1px solid #eee;
        }
        .ignore-artist-modal .modal-header h3 {
          margin: 0 0 15px 0;
          color: #dc3545;
          font-size: 18px;
        }
        .ignore-artist-modal .modal-body {
          padding: 20px;
        }
        .ignore-artist-modal .modal-body p {
          margin: 0 0 15px 0;
          line-height: 1.5;
        }
        .ignore-artist-modal .modal-body ul {
          margin: 10px 0;
          padding-left: 20px;
        }
        .ignore-artist-modal .modal-body li {
          margin: 8px 0;
          line-height: 1.4;
        }
        .ignore-artist-modal .modal-footer {
          padding: 15px 20px 20px;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          border-top: 1px solid #eee;
        }
        .ignore-artist-modal button {
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s ease;
        }
        .ignore-artist-modal .btn-cancel {
          background: #6c757d;
          color: white;
        }
        .ignore-artist-modal .btn-cancel:hover {
          background: #5a6268;
        }
        .ignore-artist-modal .btn-confirm {
          background: #dc3545;
          color: white;
        }
        .ignore-artist-modal .btn-confirm:hover {
          background: #c82333;
        }
      `;
      document.head.appendChild(style);
      document.body.appendChild(modal);

      // Handle button clicks
      modal.querySelector('.btn-cancel').addEventListener('click', () => {
        cleanup();
        resolve(false);
      });

      modal.querySelector('.btn-confirm').addEventListener('click', () => {
        cleanup();
        resolve(true);
      });

      modal.querySelector('.modal-overlay').addEventListener('click', () => {
        cleanup();
        resolve(false);
      });

      // Handle escape key
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          cleanup();
          resolve(false);
        }
      };
      document.addEventListener('keydown', handleEscape);

      function cleanup() {
        document.removeEventListener('keydown', handleEscape);
        modal.remove();
        style.remove();
      }
    });
  }

  /**
   * Add a small "(i) visa biografi" link next to the artist field when it has a value.
   * Hovering shows the KB card as a reference guide.
   */
  setupArtistFieldBioHover(artistName, artistDates = '', itemTitle = '', itemDescription = '') {
    this.biographyKBCard.setupArtistFieldBioHover(artistName, artistDates, itemTitle, itemDescription);
  }

  // NEW: Setup ignore button handlers for artist detections
  setupIgnoreArtistHandlers() {
    // Find artist warnings by their data attribute
    const artistWarnings = document.querySelectorAll('li[data-artist-warning="true"]');

    artistWarnings.forEach(warningLi => {
      // Skip if already processed
      if (warningLi.dataset.ignoreHandlerAdded) return;

      // Get the warning data from the element
      const warningData = warningLi.warningData;
      if (!warningData || !warningData.isArtistWarning || !warningData.detectedArtist) return;

      const artistName = warningData.detectedArtist;

      // Find the text content and make the artist name clickable
      const issueSpan = warningLi.querySelector('.issue-text');
      if (issueSpan) {
        const originalText = issueSpan.textContent;

        // Create clickable artist span with biography hover
        const clickableSpan = document.createElement('strong');
        clickableSpan.className = 'clickable-artist';
        clickableSpan.textContent = `"${artistName}"`;
        clickableSpan.style.cursor = 'pointer';
        clickableSpan.style.color = '#1976d2';
        clickableSpan.style.textDecoration = 'underline';
        clickableSpan.style.position = 'relative';
        clickableSpan.title = `Klicka för att flytta "${artistName}" till konstnärsfält`;

        // Add biography hover functionality (pass warningData + page context for disambiguation)
        const artistHelpSpan = document.querySelector('[data-devbridge-autocomplete-target="help"]');
        const warnArtistDates = artistHelpSpan ? artistHelpSpan.textContent.trim() : '';
        const warnTitle = document.querySelector('#item_title_sv')?.value || '';
        const warnDesc = document.querySelector('#item_description_sv')?.value || '';
        this.addBiographyHover(clickableSpan, artistName, warningData, warnArtistDates, warnTitle, warnDesc);

        // NEW: Use Biography Manager SSoT component for biography handling
        let biographySpan = null;
        const biography = this.biographyManager.extractBiography(warningData);
        if (biography) {
          // Create biography snippet using SSoT component
          biographySpan = this.biographyManager.createBiographySnippet(null, biography, artistName);
        }

        // Create discoverability cue for biography hover
        const bioCue = document.createElement('span');
        bioCue.textContent = ' (visa biografi)';
        bioCue.style.cssText = `
          font-size: 0.85em;
          color: #888;
          font-style: italic;
          font-weight: normal;
          cursor: pointer;
        `;
        bioCue.addEventListener('mouseenter', () => {
          // Trigger hover on the clickable span to show bio tooltip
          clickableSpan.dispatchEvent(new Event('mouseenter'));
        });
        bioCue.addEventListener('mouseleave', () => {
          clickableSpan.dispatchEvent(new Event('mouseleave'));
        });

        // Replace the quoted artist name in the text with the clickable element
        const textParts = originalText.split(`"${artistName}"`);
        if (textParts.length === 2) {
          issueSpan.innerHTML = '';
          issueSpan.appendChild(document.createTextNode(textParts[0]));
          issueSpan.appendChild(clickableSpan);
          issueSpan.appendChild(bioCue);
          issueSpan.appendChild(document.createTextNode(textParts[1]));

          // Add biography snippet on new line if it exists
          if (biographySpan) {
            const biographyLine = document.createElement('div');
            biographyLine.style.cssText = `
              margin-top: 4px;
              font-size: 0.9em;
              color: #666;
              font-style: italic;
            `;
            biographyLine.appendChild(biographySpan);
            issueSpan.appendChild(biographyLine);
          }
        }

        // Add click handler to move artist to field
        clickableSpan.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await this.moveArtistToField(artistName, warningData, clickableSpan);
        });
      }

      // Create action buttons container
      const buttonContainer = document.createElement('div');
      buttonContainer.className = 'artist-action-buttons';
      buttonContainer.style.cssText = `
        display: flex;
        justify-content: space-between;
        margin-top: 8px;
        align-items: center;
      `;

      // Create ignore button
      const ignoreButton = document.createElement('button');
      ignoreButton.className = 'ignore-artist-btn';
      ignoreButton.textContent = 'Ignorera';
      ignoreButton.title = `Ignorera konstnärsdetektering för "${artistName}"`;

      // Style the ignore button to match Figma
      Object.assign(ignoreButton.style, {
        padding: '6px 12px',
        fontSize: '12px',
        background: '#dc3545',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: '300'
      });

      // Biography will be handled via hover on the artist name, not as a button

      // Create move button
      const moveButton = document.createElement('button');
      moveButton.className = 'move-artist-btn';
      moveButton.textContent = 'Flytta till konstnärsfält';
      moveButton.title = `Flytta "${artistName}" från titel till konstnärsfält`;

      // Style the move button to match Figma
      Object.assign(moveButton.style, {
        padding: '6px 12px',
        fontSize: '12px',
        background: '#4caf50',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: '300'
      });

      // Add hover effects for ignore button
      ignoreButton.addEventListener('mouseenter', () => {
        ignoreButton.style.background = '#c82333';
      });
      ignoreButton.addEventListener('mouseleave', () => {
        ignoreButton.style.background = '#dc3545';
      });

      // Biography hover will be handled on the artist name span

      // Add hover effects for move button
      moveButton.addEventListener('mouseenter', () => {
        moveButton.style.background = '#45a049';
      });
      moveButton.addEventListener('mouseleave', () => {
        moveButton.style.background = '#4caf50';
      });

      // Biography will be shown on hover of the artist name

      // Add click handler for ignore
      ignoreButton.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();


        // Create better confirmation dialog
        const confirmed = await this.showIgnoreConfirmationDialog(artistName);

        if (!confirmed) {
          return;
        }

        try {
          // Handle the ignore action
          await this.artistIgnoreManager.handleIgnoreAction(artistName, warningLi);


        } catch (error) {
          console.error('Error ignoring artist:', error);
          alert(`Fel vid ignorering av konstnär: ${error.message}`);
        }
      });

      // Add click handler for move button
      moveButton.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Get the warning data from the element
        const warningData = {
          detectedArtist: artistName,
          foundIn: warningLi.dataset.foundIn || 'titel'
        };

        await this.moveArtistToField(artistName, warningData, moveButton);
      });

      // Add buttons to container and append to warning element
      buttonContainer.appendChild(ignoreButton);
      buttonContainer.appendChild(moveButton);
      warningLi.appendChild(buttonContainer);

      // Mark as processed and store metadata for button handlers
      warningLi.dataset.ignoreHandlerAdded = 'true';
      warningLi.dataset.foundIn = warningLi.textContent.includes('titel') ? 'titel' : 'other';
    });

    // --- Handle unknown / unidentified artist warnings ---
    const unknownArtistWarnings = document.querySelectorAll('li[data-unknown-artist-warning="true"]');
    unknownArtistWarnings.forEach(warningLi => {
      if (warningLi.dataset.unknownHandlerAdded) return;

      const warningData = warningLi.warningData;
      if (!warningData || !warningData.isUnknownArtistWarning) return;

      const phrase = warningData.unknownArtistPhrase;

      // Replace the warning text with an explanation of both terms
      const issueSpan = warningLi.querySelector('.issue-text');
      if (issueSpan) {
        issueSpan.innerHTML = '';
        const explanationDiv = document.createElement('div');
        explanationDiv.style.cssText = 'line-height:1.45;';
        explanationDiv.innerHTML =
          'Konstnärsterm hittades i titeln — välj rätt term för konstnärsfältet:<br>' +
          '<strong>Okänd konstnär</strong> — osignerat verk<br>' +
          '<strong>Oidentifierad konstnär</strong> — signerat men okänd konstnär';
        issueSpan.appendChild(explanationDiv);
      }

      // Helper: build cleaned title and apply a chosen term
      const applyChoice = async (chosenTerm, btn) => {
        const titleField = document.querySelector('#item_title_sv') ||
                           document.querySelector('input[name*="title"]') ||
                           document.querySelector('textarea[name*="title"]');
        let suggestedTitle = '';
        if (titleField) {
          const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          suggestedTitle = titleField.value
            .replace(regex, '')
            .replace(/,\s*,/g, ',')
            .replace(/^\s*,\s*/, '')
            .replace(/\s*,\s*$/, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
        }
        const pseudoWarningData = { detectedArtist: chosenTerm, suggestedTitle, foundIn: 'titel' };
        await this.moveArtistToField(chosenTerm, pseudoWarningData, btn);
      };

      // Two-button container
      const buttonContainer = document.createElement('div');
      buttonContainer.className = 'artist-action-buttons';
      buttonContainer.style.cssText = `
        display: flex;
        gap: 8px;
        margin-top: 8px;
        align-items: center;
      `;

      const btnStyle = {
        padding: '6px 12px',
        fontSize: '12px',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: '300'
      };

      // "Okänd konstnär" button (unsigned work)
      const unknownBtn = document.createElement('button');
      unknownBtn.className = 'move-artist-btn';
      unknownBtn.textContent = 'Okänd konstnär';
      unknownBtn.title = 'Osignerat verk — sätt "Okänd konstnär" i konstnärsfältet';
      Object.assign(unknownBtn.style, { ...btnStyle, background: '#1976d2' });
      unknownBtn.addEventListener('mouseenter', () => { unknownBtn.style.background = '#1565c0'; });
      unknownBtn.addEventListener('mouseleave', () => { unknownBtn.style.background = '#1976d2'; });
      unknownBtn.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        await applyChoice('Okänd konstnär', unknownBtn);
      });

      // "Oidentifierad konstnär" button (signed work)
      const unidentifiedBtn = document.createElement('button');
      unidentifiedBtn.className = 'move-artist-btn';
      unidentifiedBtn.textContent = 'Oidentifierad konstnär';
      unidentifiedBtn.title = 'Signerat verk — sätt "Oidentifierad konstnär" i konstnärsfältet';
      Object.assign(unidentifiedBtn.style, { ...btnStyle, background: '#4caf50' });
      unidentifiedBtn.addEventListener('mouseenter', () => { unidentifiedBtn.style.background = '#45a049'; });
      unidentifiedBtn.addEventListener('mouseleave', () => { unidentifiedBtn.style.background = '#4caf50'; });
      unidentifiedBtn.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        await applyChoice('Oidentifierad konstnär', unidentifiedBtn);
      });

      buttonContainer.appendChild(unknownBtn);
      buttonContainer.appendChild(unidentifiedBtn);
      warningLi.appendChild(buttonContainer);
      warningLi.dataset.unknownHandlerAdded = 'true';
    });
  }

  // NEW: Setup click handlers for brand corrections
  setupBrandCorrectionHandlers() {
    this.brandActionHandler.setupBrandCorrectionHandlers();
  }

  // Helper method for success feedback
  showSuccessFeedback(element, message) {
    this.feedbackManager.showSuccessFeedback(element, message);
  }

  // NEW: Trigger dashboard for non-art items (furniture, watches, etc.)
  async triggerDashboardForNonArtItems(data) {
    return this.marketOrchestrator.triggerDashboardForNonArtItems(data);
  }

  addMarketDataWarnings(salesData, warnings) {
    this.marketOrchestrator.addMarketDataWarnings(salesData, warnings);
  }

  // addClickToCopyHandler duplicate removed — functionality is in moveArtistToField()

  // NEW: Move artist to field functionality (extracted from addClickToCopyHandler)
  async moveArtistToField(artistName, artistWarning, clickableElement) {
    try {
      // Find the artist field - try multiple selectors
      const artistFieldSelectors = [
        '#item_artist_name_sv',
        'input[name*="artist"]',
        'input[id*="artist"]',
        'input[placeholder*="konstnär"]',
        'input[placeholder*="artist"]'
      ];

      let artistField = null;
      for (const selector of artistFieldSelectors) {
        artistField = document.querySelector(selector);
        if (artistField) {
          break;
        }
      }

      if (!artistField) {
        console.error('Artist field not found with any selector');
        this.showErrorFeedback(clickableElement, 'Konstnärsfält hittades inte');
        return;
      }

      // Also find the title field for removing the artist
      const titleFieldSelectors = [
        '#item_title_sv',
        'input[name*="title"]',
        'input[id*="title"]',
        'textarea[name*="title"]',
        'textarea[id*="title"]'
      ];

      let titleField = null;
      for (const selector of titleFieldSelectors) {
        titleField = document.querySelector(selector);
        if (titleField) {
          break;
        }
      }

      // Check if field already has content
      const currentValue = artistField.value.trim();
      if (currentValue && currentValue !== artistName) {
        // Instantly replace field content (no confirmation popup)
        artistField.value = artistName;
      } else {
        // Field is empty or contains the same artist
        artistField.value = artistName;
      }

      // Store original title before any modifications for feedback purposes
      const originalTitle = titleField ? titleField.value.trim() : '';
      let titleWasModified = false;

      // Update title field if we have a suggested title (remove artist from title)
      if (titleField && artistWarning && artistWarning.suggestedTitle) {
        const suggestedTitle = artistWarning.suggestedTitle.trim();

        // Update title field with cleaned title
        titleField.value = suggestedTitle;
        titleWasModified = true;

        // Trigger events for title field
        const titleEvents = ['input', 'change', 'blur'];
        titleEvents.forEach(eventType => {
          titleField.dispatchEvent(new Event(eventType, { bubbles: true }));
        });

      } else if (titleField && !artistWarning?.suggestedTitle) {
        // Use title cleanup utility as fallback when no suggestedTitle is available
        const cleanedTitle = this.cleanTitleAfterArtistRemoval(originalTitle, artistName);

        if (cleanedTitle !== originalTitle) {
          // CRITICAL FIX: Apply AI Rules System context rules for "artistFieldFilled"
          const restructuredTitle = await this.applyArtistFieldFilledRules(cleanedTitle);


          titleField.value = restructuredTitle;
          titleWasModified = true;

          // Trigger events for title field
          const titleEvents = ['input', 'change', 'blur'];
          titleEvents.forEach(eventType => {
            titleField.dispatchEvent(new Event(eventType, { bubbles: true }));
          });
        }
      }

      // Trigger form events to ensure proper validation and saving
      const events = ['input', 'change', 'blur'];
      events.forEach(eventType => {
        artistField.dispatchEvent(new Event(eventType, { bubbles: true }));
      });

      // Trigger quality re-analysis since adding an artist likely improves the score
      setTimeout(() => {
        this.analyzeQuality();
      }, 200);

      // Re-trigger market analysis when artist is moved to field
      if (this.searchQuerySSoT && this.salesAnalysisManager) {
        setTimeout(async () => {
          try {
            // Get updated form data with artist now in field
            const updatedData = this.dataExtractor.extractItemData();

            // Clear existing dashboard
            const existingDashboard = document.querySelector('.market-data-dashboard');
            if (existingDashboard) {
              existingDashboard.remove();
            }

            // Generate new search query with artist now in field (but don't update Hidden Keywords field)
            const ssotResult = await this.searchQuerySSoT.generateAndSetQuery(
              updatedData.title,
              updatedData.description,
              updatedData.artist,  // Now contains the moved artist
              '',  // No AI artist since it's been moved
              { updateDOMField: false }  // Don't update Hidden Keywords field
            );

            if (ssotResult && ssotResult.success) {
              // Start new market analysis
              const artistFieldQuery = {
                searchQuery: ssotResult.query,
                searchTerms: ssotResult.searchTerms,
                source: 'artist_field',
                confidence: 0.9,  // High confidence when artist is in proper field
                reasoning: `Artist "${updatedData.artist}" moved to artist field`
              };

              // Get current warnings and score
              const currentWarnings = this.extractCurrentWarnings();
              const currentScore = this.calculateCurrentQualityScore(updatedData);

              this.salesAnalysisManager.startSalesAnalysis(
                artistFieldQuery,
                updatedData,
                currentWarnings,
                currentScore,
                this.searchFilterManager,
                this
              );
            }
          } catch (error) {
            console.error('Error re-triggering market analysis after artist move:', error);
          }
        }, 500);  // Wait a bit longer to ensure field update is complete
      }

      // Enhanced visual feedback - success
      const originalText = clickableElement.textContent;
      const originalColor = clickableElement.style.color;

      // Success indication shows MOVED not just added
      clickableElement.style.color = '#4caf50';
      clickableElement.textContent = titleWasModified ? '✓ Flyttad!' : '✓ Tillagd!';

      // Briefly highlight the artist field to show where it was added
      const originalFieldBackground = artistField.style.backgroundColor;
      const originalFieldBorder = artistField.style.border;
      artistField.style.backgroundColor = '#e8f5e8';
      artistField.style.border = '2px solid #4caf50';
      artistField.style.transition = 'all 0.3s ease';

      // Also highlight title field if it was updated
      if (titleWasModified) {
        const originalTitleBackground = titleField.style.backgroundColor;
        const originalTitleBorder = titleField.style.border;
        titleField.style.backgroundColor = '#fff3e0';
        titleField.style.border = '2px solid #ff9800';
        titleField.style.transition = 'all 0.3s ease';

        // Reset title field highlight
        setTimeout(() => {
          titleField.style.backgroundColor = originalTitleBackground;
          titleField.style.border = originalTitleBorder;
        }, 2000);
      }

      // Scroll to artist field if it's not visible
      artistField.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Reset after 2 seconds with smooth transition
      setTimeout(() => {
        clickableElement.style.transition = 'all 0.3s ease';
        clickableElement.style.color = originalColor;
        clickableElement.textContent = originalText;

        // Reset field highlight
        artistField.style.backgroundColor = originalFieldBackground;
        artistField.style.border = originalFieldBorder;
      }, 2000);

    } catch (error) {
      console.error('Failed to move artist name:', error);
      this.showErrorFeedback(clickableElement, 'Misslyckades att flytta');
    }
  }

  // Helper method to clean title after artist removal
  cleanTitleAfterArtistRemoval(title, artistName) {


    let cleanedTitle = title;

    // Remove the artist name with various patterns including leading/trailing punctuation
    const patterns = [
      // Artist at beginning with various punctuation after
      new RegExp(`^\\s*"?${this.escapeRegex(artistName)}"?\\s*[,.:;-]?\\s*`, 'gi'),
      // Artist in middle with commas
      new RegExp(`\\s*,\\s*"?${this.escapeRegex(artistName)}"?\\s*,?\\s*`, 'gi'),
      // Artist at end with comma before
      new RegExp(`\\s*,\\s*"?${this.escapeRegex(artistName)}"?\\s*$`, 'gi'),
      // General fallback pattern
      new RegExp(`"?${this.escapeRegex(artistName)}"?`, 'gi')
    ];

    patterns.forEach((pattern, index) => {
      const beforeReplace = cleanedTitle;
      cleanedTitle = cleanedTitle.replace(pattern, index === 0 ? '' : ' ');
      
    });

    // Comprehensive cleanup of punctuation and spacing
    cleanedTitle = cleanedTitle
      .replace(/^\s*[,.;:-]+\s*/, '')  // Remove leading punctuation (like ". " or ", ")
      .replace(/\s*[,.;:-]+\s*$/, '')  // Remove trailing punctuation
      .replace(/\s+/g, ' ')  // Multiple spaces to single space
      .replace(/\s*,\s*,\s*/g, ', ')  // Multiple commas to single comma
      .replace(/^[\s,]+|[\s,]+$/g, '')  // Remove remaining leading/trailing spaces and commas
      // ENHANCED: Remove orphaned words like "design ." that are left after artist removal
      .replace(/\b(design|av|by|efter|tillskriven)\s*[,.;:-]*\s*(?=[A-ZÅÄÖÜ]|$)/gi, '') // Remove design/attribution words before capitals or end
      .replace(/\s+/g, ' ')  // Clean up spaces again after word removal
      .trim();

    // Ensure first letter is capitalized if content remains
    if (cleanedTitle.length > 0) {
      cleanedTitle = cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1);
    }


    return cleanedTitle;
  }

  // Apply AI Rules System context rules for when artist field is filled
  async applyArtistFieldFilledRules(title) {
    try {
      if (!this.apiManager) {
        // FALLBACK: Use AI title correction when rules system unavailable
        return await this.useAITitleCorrection(title);
      }


      // SIMPLIFIED APPROACH: Since AI title correction works perfectly, use that instead
      // The "AI-förbättra titel" button produces: "Skrivbord. "Modell 75", teak, Jun Møbelfabrik, Danmark"
      // which is exactly what we want when artist is in field

      return await this.useAITitleCorrection(title);

    } catch (error) {
      console.error('Error applying artist field filled rules:', error);
      return title; // Return original title if rules application fails
    }
  }

  // Use AI title correction with artist field filled context rules
  async useAITitleCorrection(title) {
    try {

      // Show loading spinner over title field (same as "AI-förbättra titel" button)
      this.showTitleLoadingSpinner();

      // Get current artist field value
      const artistField = document.querySelector('#item_artist_name_sv')?.value || '';

      // Use title-correct with specific context that artist field is filled
      const result = await this.apiManager.callClaudeAPI({
        title: title,
        description: '', // Not needed for title correction
        condition: '',
        artist: artistField, // Include current artist field
        keywords: ''
      }, 'title-correct'); // Use title-correct instead of title for minimal changes

      // Remove loading spinner
      this.removeTitleLoadingSpinner();

      if (result && result.title) {
        // Show success flash (same as "AI-förbättra titel" button)
        this.showTitleSuccessFlash();
        return result.title;
      } else {
        this.showTitleErrorFlash();
        return title;
      }

    } catch (error) {
      console.error('AI title correction error:', error);
      // Remove loading spinner on error
      this.removeTitleLoadingSpinner();
      this.showTitleErrorFlash();
      return title;
    }
  }

  // Show loading spinner over title field (same as AI buttons)
  showTitleLoadingSpinner() {
    this.feedbackManager.showTitleLoadingSpinner();
  }

  removeTitleLoadingSpinner() {
    this.feedbackManager.removeTitleLoadingSpinner();
  }

  showTitleSuccessFlash() {
    this.feedbackManager.showTitleSuccessFlash();
  }

  showTitleErrorFlash() {
    this.feedbackManager.showTitleErrorFlash();
  }

  // Second addClickToCopyHandler duplicate removed — functionality is in moveArtistToField()

  // Helper method to show error feedback
  showErrorFeedback(element, message) {
    this.feedbackManager.showErrorFeedback(element, message);
  }

  setupLiveQualityUpdates() {
    // Debounce function to prevent too frequent updates
    let updateTimeout;
    const debouncedUpdate = (event) => {
      clearTimeout(updateTimeout);
      updateTimeout = setTimeout(() => {

        this.analyzeQuality();
      }, 800); // Wait 800ms after user stops typing
    };

    // Use the exact same selectors as extractItemData()
    const fieldsToMonitor = [
      '#item_title_sv',
      '#item_description_sv',
      '#item_condition_sv',
      '#item_hidden_keywords',
      '#item_current_auction_attributes_estimate',
      '#item_current_auction_attributes_upper_estimate',
      '#item_current_auction_attributes_reserve',
      '#item_current_auction_attributes_accepted_reserve',
      'input[type="checkbox"]#item_no_remarks',
      'input[type="checkbox"][name*="no_remarks"]'
    ];

    let monitoredCount = 0;
    fieldsToMonitor.forEach(selector => {
      const element = document.querySelector(selector);
      if (element) {
        monitoredCount++;

        // Add event listeners for different input types
        if (element.type === 'checkbox') {
          element.addEventListener('change', debouncedUpdate);
        } else {
          element.addEventListener('input', debouncedUpdate);
          element.addEventListener('paste', debouncedUpdate);
          element.addEventListener('keyup', debouncedUpdate);
        }

        // Test immediate trigger
        element.addEventListener('focus', () => {
        });
      }
    });

    // Monitor category dropdown for FAQ-rule changes
    const categorySelect = document.querySelector('#item_category_id');
    if (categorySelect) {
      categorySelect.addEventListener('change', debouncedUpdate);
      monitoredCount++;
    }

    // Also monitor for changes in rich text editors (if any)
    const richTextEditors = document.querySelectorAll('[contenteditable="true"]');
    richTextEditors.forEach(editor => {
      editor.addEventListener('input', debouncedUpdate);
      editor.addEventListener('paste', debouncedUpdate);
      monitoredCount++;
    });


    // NEW: Start inline brand validation monitoring
    if (this.inlineBrandValidator) {
      try {
        this.inlineBrandValidator.startMonitoring();

        // For EDIT pages: Check for existing errors after a delay
        setTimeout(() => {
          const existingErrors = this.inlineBrandValidator.getCurrentErrors();
          if (existingErrors.length > 0) {
            existingErrors.forEach(error => {
            });
          }
        }, 1000); // Wait for validation to complete

      } catch (error) {
      }
    }

    // Test if fields exist right now


    // SAFETY CHECK: Ensure all necessary components are properly initialized
    // NOTE: Biography functionality now handled by BiographyTooltipManager SSoT component
  }

  assessDataQuality(data, fieldType) {
    return this.rulesEngine.assessDataQuality(data, fieldType);
  }

  extractEnhancedSearchTerms(title, description) {
    // Extract enhanced search terms for better market analysis
    const text = `${title} ${description}`.toLowerCase();
    const enhancedTerms = [];

    // Extract materials
    const materials = this.searchTermExtractor.extractMaterials(text);
    if (materials.length > 0) {
      enhancedTerms.push(...materials.slice(0, 2));
    }

    // Extract techniques
    const techniques = this.extractTechnique(title, description);
    if (techniques && techniques.length > 0) {
      enhancedTerms.push(techniques);
    }

    // Extract periods
    const periods = this.searchTermExtractor.extractPeriods(text);
    if (periods.length > 0) {
      enhancedTerms.push(...periods.slice(0, 1));
    }

    // Extract colors (for art/decorative items)
    const colors = this.searchTermExtractor.extractColors(text);
    if (colors.length > 0) {
      enhancedTerms.push(...colors.slice(0, 1));
    }

    return enhancedTerms.filter(term => term && term.length > 2).slice(0, 5);
  }

  updateQualityIndicator(score, warnings, shouldAnimate = false) {
    this.qualityUIRenderer.updateQualityIndicator(score, warnings, shouldAnimate);
  }


  // Condition suggestions and inline hints — delegated to QualityUIRenderer

  getConditionSuggestions(category, count = 3) {
    return this.qualityUIRenderer.getConditionSuggestions(category, count);
  }

  renderInlineHints(warnings) {
    this.qualityUIRenderer.renderInlineHints(warnings);
  }

  // Helper method to escape regex special characters
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  addBiographyHover(element, artistName, warningData = null, artistDates = '', itemTitle = '', itemDescription = '') {
    this.biographyKBCard.addBiographyHover(element, artistName, warningData, artistDates, itemTitle, itemDescription);
  }

  async fetchArtistBiography(artistName, artistDates = '', userHint = '', itemTitle = '', itemDescription = '') {
    return this.biographyKBCard.fetchArtistBiography(artistName, artistDates, userHint, itemTitle, itemDescription);
  }

  async fetchWikipediaImage(artistName) {
    return this.biographyKBCard.fetchWikipediaImage(artistName);
  }

  createKBCard(artistName) {
    return this.biographyKBCard.createKBCard(artistName);
  }

  updateKBCard(card, bioData, imageUrl, refetchCallback = null, artistName = '') {
    this.biographyKBCard.updateKBCard(card, bioData, imageUrl, refetchCallback, artistName);
  }

  async showArtistBiography(artistName) {
    return this.biographyKBCard.showArtistBiography(artistName);
  }

  showBiographyModal(artistName, biography) {
    this.biographyKBCard.showBiographyModal(artistName, biography);
  }

  addBiographyToDescription(biography) {
    this.biographyKBCard.addBiographyToDescription(biography);
  }

  checkAndHideLoadingIndicator() {
    this.feedbackManager.checkAndHideLoadingIndicator();
  }

  extractCurrentWarnings() {
    return this.rulesEngine.extractCurrentWarnings();
  }

  showAILoadingIndicator(message = 'AI analysis in progress...') {
    this.feedbackManager.showAILoadingIndicator(message);
    this.aiAnalysisActive = true;
  }

  updateAILoadingMessage(message) {
    this.feedbackManager.updateAILoadingMessage(message);
  }

  hideAILoadingIndicator() {
    this.feedbackManager.hideAILoadingIndicator();
    this.aiAnalysisActive = false;
  }

  determineBestArtistForMarketAnalysis(data, aiArtist = null) {
    return this.marketOrchestrator.determineBestArtistForMarketAnalysis(data, aiArtist);
  }

  detectBrandInTitle(title, description) {
    return this.marketOrchestrator.detectBrandInTitle(title, description);
  }

  extractFreetextSearchTerms(title, description) {
    return this.marketOrchestrator.extractFreetextSearchTerms(title, description);
  }

  calculateCurrentQualityScore(data) {
    return this.rulesEngine.calculateCurrentQualityScore(data);
  }

  extractTechnique(title, description) {
    return this.marketOrchestrator.extractTechnique(title, description);
  }

  async determineBestSearchQueryForMarketAnalysis(data, aiArtist = null) {
    return this.marketOrchestrator.determineBestSearchQueryForMarketAnalysis(data, aiArtist);
  }

  // Set SearchFilterManager reference and provide dependencies
  setSearchFilterManager(searchFilterManager) {
    this.searchFilterManager = searchFilterManager;

    if (this.searchTermExtractor) {
      this.searchFilterManager.setSearchTermExtractor(this.searchTermExtractor);
    }

    // Wire to market orchestrator
    this.marketOrchestrator.setDependencies({ searchFilterManager: searchFilterManager });
  }

  // Method to recalculate and update quality with animation (for field improvements)
  async recalculateQualityWithAnimation() {
    const latestData = this.dataExtractor.extractItemData();
    const currentWarnings = this.extractCurrentWarnings();
    const newScore = this.calculateCurrentQualityScore(latestData);
    this.updateQualityIndicator(newScore, currentWarnings, true);
  }

  async triggerMarketAnalysisWithExistingArtist(data) {
    return this.marketOrchestrator.triggerMarketAnalysisWithExistingArtist(data);
  }

}
