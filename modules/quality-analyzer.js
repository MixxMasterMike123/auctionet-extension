import { SearchTermExtractor } from "/modules/search-term-extractor.js";
import { ItemTypeHandlers } from "/modules/item-type-handlers.js";
import { SalesAnalysisManager } from "/modules/sales-analysis-manager.js";
import { DashboardManager } from './dashboard-manager.js';
import { SearchFilterManager } from './search-filter-manager.js';
import { DataExtractor } from './data-extractor.js';
import { SearchQuerySSoT } from './search-query-ssot.js';
import { ArtistDetectionManager } from './artist-detection-manager.js';
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
    
    // Initialize manager instances
    this.salesAnalysisManager = new SalesAnalysisManager();
    this.searchFilterManager = new SearchFilterManager();
    this.dashboardManager = new DashboardManager();
    
    this.pendingAnalyses = new Set();
    this.aiAnalysisActive = false;
    
    // Inject dependencies
    this.itemTypeHandlers.setSearchTermExtractor(this.searchTermExtractor);
    
    console.log('✅ QualityAnalyzer initialized with ArtistDetectionManager SSoT');
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
    
    // Connect SearchQuerySSoT to apiManager for SSoT-consistent queries
    if (this.searchQuerySSoT) {
      console.log('🔗 Connecting SearchQuerySSoT to APIManager for consistent live auction queries');
      apiManager.setSearchQuerySSoT(this.searchQuerySSoT);
    } else {
      console.log('⚠️ SearchQuerySSoT not available yet during setApiManager - will connect later');
    }
    
    // Debug: Check if salesAnalysisManager is available
    if (this.salesAnalysisManager) {
      console.log('✅ SalesAnalysisManager available, setting API manager');
      this.salesAnalysisManager.setApiManager(apiManager);
      
      // 🔧 CRITICAL FIX: Only set DashboardManager if SalesAnalysisManager doesn't already have one
      if (!this.salesAnalysisManager.dashboardManager) {
        console.log('⚠️ SalesAnalysisManager has no DashboardManager, setting QualityAnalyzer instance');
        this.salesAnalysisManager.setDashboardManager(this.dashboardManager);
      } else {
        console.log('✅ SalesAnalysisManager already has DashboardManager (from content script), preserving it');
      }
      
      this.salesAnalysisManager.setDataExtractor(this.dataExtractor); // NEW: Set data extractor
    } else {
      console.error('❌ SalesAnalysisManager not available during setApiManager call');
    }
    
    this.dashboardManager.setApiManager(apiManager);
    // Pass dependencies to the search filter manager
    this.searchFilterManager.setQualityAnalyzer(this);
    this.searchFilterManager.setDashboardManager(this.dashboardManager);
    this.searchFilterManager.setApiManager(apiManager);
    this.searchFilterManager.setDataExtractor(this.dataExtractor);
  }

  // NEW: Set SearchQueryManager for SSoT usage
  setSearchQueryManager(searchQueryManager) {
    this.searchQueryManager = searchQueryManager;
    // DEPRECATED: This method is kept for backward compatibility but should use setSearchQuerySSoT
    console.log('⚠️ QualityAnalyzer: Using legacy SearchQueryManager - consider updating to SearchQuerySSoT');
  }

  // NEW: Set AI-only search query system
  setSearchQuerySSoT(searchQuerySSoT) {
    this.searchQuerySSoT = searchQuerySSoT;
    
    // Connect SearchQuerySSoT to apiManager for SSoT-consistent queries
    if (this.apiManager) {
      console.log('🔗 Connecting SearchQuerySSoT to APIManager for consistent live auction queries');
      this.apiManager.setSearchQuerySSoT(searchQuerySSoT);
    }
    
    // Wire SearchQuerySSoT to all components that need it
    this.salesAnalysisManager.setSearchQuerySSoT(searchQuerySSoT);
    this.searchFilterManager.setSearchQuerySSoT(searchQuerySSoT);
    
    console.log('✅ QualityAnalyzer: AI-only SearchQuerySSoT connected to all components');
  }

  // NEW: Delegate artist detection to ArtistDetectionManager SSoT
  async detectMisplacedArtist(title, artistField, forceReDetection = false) {
    console.log('🎯 QualityAnalyzer: Delegating artist detection to ArtistDetectionManager SSoT');
    return await this.artistDetectionManager.detectMisplacedArtist(title, artistField, forceReDetection);
  }

  // NEW: Delegate rule-based detection to ArtistDetectionManager SSoT  
  detectMisplacedArtistRuleBased(title, artistField) {
    console.log('🔧 QualityAnalyzer: Delegating rule-based artist detection to ArtistDetectionManager SSoT');
    return this.artistDetectionManager.detectMisplacedArtistRuleBased(title, artistField);
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
    const measurementPatterns = [
      // 2D measurements with common prefixes (ca, cirka, ungefär, etc.)
      /(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*×\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i,     // ca 57,5 × 43,5 cm
      /(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*x\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i,     // ca 57,5 x 43,5 cm
      
      // 3D measurements with prefixes
      /(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*×\s*\d+([.,]\d+)?\s*×\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i, // ca 122 × 45 × 135 cm
      /(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*x\s*\d+([.,]\d+)?\s*x\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i, // ca 122 x 45 x 135 cm
      
      // Frame measurements (common in art)
      /(ram)?mått:?\s*(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*[×x]\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i, // Rammått ca 57,5 x 43,5 cm
      
      // Measurement ranges with dashes (NEW - handles your case!)
      /(längd|bredd|bred|djup|höjd|diameter|diam\.?|h\.?|l\.?|d\.?)\s*(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*[-–]\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i, // höjd ca 28 - 30,5 cm
      /(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*[-–]\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i, // ca 28 - 30,5 cm
      
      // Swedish terms with all units and prefixes
      /(längd|l\.?)\s*(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i,        // längd ca 122 cm
      /(bredd|bred|djup|d\.?)\s*(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i, // djup ca 45 mm
      /(höjd|h\.?)\s*(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i,         // höjd ca 135 m
      
      // Jewelry-specific measurements (NEW!)
      /(storlek|innerdiameter|inre\s*diameter|ytterdiameter|yttre\s*diameter|ringmått)\s*[:/]?\s*\d+([.,]\d+)?/i, // storlek/innerdiameter 16,5
      /(omkrets|circumference)\s*[:/]?\s*\d+([.,]\d+)?\s*(mm|cm)\b/i, // omkrets 52 mm
      /(bruttovikt|nettovikt|vikt|weight)\s*[:/]?\s*\d+([.,]\d+)?\s*(g|gram|kg)\b/i, // Bruttovikt 1,5 gram
      /(karat|ct|carat)\s*[:/]?\s*\d+([.,]\d+)?/i, // 2,5 karat or 2,5 ct
      
      // General measurement patterns
      /mått:.*\d+([.,]\d+)?.*(mm|cm|m)\b/i,                 // Mått: ... 122 cm
      /\d+([.,]\d+)?\s*(mm|cm|m)\b.*\d+([.,]\d+)?\s*(mm|cm|m)\b/i, // Any two measurements separated
      /\d+([.,]\d+)?\s*(mm|cm|m|g|gram|kg)\b/i,             // Basic measurement with units (52 mm, 1,5 gram)
      
      // Diameter patterns with prefixes
      /(diameter|diam\.?|ø)\s*(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i // diameter ca 25 cm
    ];
    
    return measurementPatterns.some(pattern => text.match(pattern));
  }

  async analyzeQuality() {
    if (!this.dataExtractor) {
      console.error('Data extractor not set');
      return;
    }

    const data = this.dataExtractor.extractItemData();
    const warnings = [];
    let score = 100;
    
    // Check if "Inga anmärkningar" (No remarks) is checked (handle missing checkboxes gracefully)
    let noRemarksChecked = false;
    try {
    const noRemarksCheckbox = document.querySelector('input[type="checkbox"][value="Inga anmärkningar"]') || 
                             document.querySelector('input[type="checkbox"]#item_no_remarks') ||
                             document.querySelector('input[type="checkbox"][name*="no_remarks"]');
      noRemarksChecked = noRemarksCheckbox && noRemarksCheckbox.checked;
    } catch (error) {
      console.log('ℹ️ No remarks checkbox not found (optional)');
    }

    // Title quality checks (aggressively softened: 20 → 14)
    if (data.title.length < 14) {
      warnings.push({ field: 'Titel', issue: 'Överväg att lägga till material och period', severity: 'medium' });
      score -= 15;
    }
    if (!data.title.includes(',')) {
      warnings.push({ field: 'Titel', issue: 'Saknar korrekt struktur (KONSTNÄR, Objekt, Material)', severity: 'medium' });
      score -= 15;
    }

    // Check title capitalization based on artist field
    if (data.title && data.title.length > 0) {
      // Find first letter character (skip quotes, numbers, etc.)
      let firstLetterIndex = -1;
      let firstLetter = '';
      
      for (let i = 0; i < data.title.length; i++) {
        const char = data.title.charAt(i);
        if (/[A-ZÅÄÖÜa-zåäöü]/.test(char)) {
          firstLetterIndex = i;
          firstLetter = char;
          break;
        }
      }
      
      if (firstLetterIndex >= 0) {
        const hasArtist = data.artist && data.artist.trim().length > 0;
        
        if (hasArtist && firstLetter === firstLetter.toLowerCase()) {
          // Artist field filled but first letter is lowercase - should be normal capital
          warnings.push({
            field: 'Titel',
            issue: 'Titel ska börja med versal när konstnärsfält är ifyllt',
            severity: 'medium'
          });
          score -= 15;
        } else if (!hasArtist) {
          // No artist - check if first word is all uppercase (existing rule)
          // This is already handled by the existing title structure check
          // We don't need to duplicate that logic here
        }
      }
    }

    // Description quality checks (aggressively softened: 50 → 35)
    const descLength = data.description.replace(/<[^>]*>/g, '').length;
    if (descLength < 35) {
      warnings.push({ field: 'Beskrivning', issue: 'Överväg att lägga till detaljer om material, teknik, färg, märkningar', severity: 'medium' });
      score -= 20;
    }
    if (!this.hasMeasurements(data.description)) {
      warnings.push({ field: 'Beskrivning', issue: 'Mått skulle förbättra beskrivningen', severity: 'low' });
      score -= 10;
    }

    // CONDITION QUALITY CHECKS - MODERATELY STRICTER FOR CUSTOMER SATISFACTION
    if (!noRemarksChecked) {
      const condLength = data.condition.replace(/<[^>]*>/g, '').length;
      const conditionText = data.condition.toLowerCase();
      
      // Check for "Ej examinerad ur ram" - this is actually GOOD for paintings (mint condition)
      const isUnexaminedFramed = /ej\s+examinerad\s+ur\s+ram/i.test(conditionText);
      
      if (isUnexaminedFramed) {
        // This is positive - painting appears mint as far as visible
        warnings.push({ field: 'Kondition', issue: '✓ "Ej examinerad ur ram" - indikerar mycket gott skick så långt synligt', severity: 'low' });
      } else {
        // Moderately higher minimum length requirement (14 → 25 characters, not 40)
        if (condLength < 25) {
          warnings.push({ field: 'Kondition', issue: 'Konditionsbeskrivning bör vara mer detaljerad för kundernas trygghet', severity: 'high' });
        score -= 20;
      }
        
        // Still zero tolerance for "bruksslitage" only, but less harsh penalty
      if (data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) {
        warnings.push({ field: 'Kondition', issue: 'Endast "bruksslitage" är otillräckligt - specificera typ av slitage (repor, nagg, fläckar, etc.)', severity: 'high' });
          score -= 35;
      }
      
        // Moderately stricter check for vague condition terms
      const vaguePhrases = ['normalt slitage', 'vanligt slitage', 'åldersslitage', 'slitage förekommer'];
        const hasVaguePhrase = vaguePhrases.some(phrase => conditionText.includes(phrase));
        
        if (hasVaguePhrase && condLength < 40) {
          warnings.push({ field: 'Kondition', issue: 'Vaga termer som "normalt slitage" - överväg att specificera typ av skador och placering', severity: 'medium' });
          score -= 20;
        }
        
        // Gentle suggestion for location information (not required)
        const hasLocationInfo = /\b(vid|på|längs|i|under|över|runt|omkring)\s+(fot|kant|ovansida|undersida|sida|hörn|mitt|centrum|botten|topp|fram|bak|insida|utsida)/i.test(conditionText);
        if (condLength > 25 && !hasLocationInfo && !conditionText.includes('genomgående') && !conditionText.includes('överallt') && hasVaguePhrase) {
          warnings.push({ field: 'Kondition', issue: 'Tips: Ange var skadorna finns för tydligare beskrivning', severity: 'low' });
          score -= 10;
        }
      }
      
    } else {
      warnings.push({ field: 'Kondition', issue: '✓ "Inga anmärkningar" markerat - ingen konditionsrapport behövs', severity: 'low' });
    }

    // Keywords quality checks
    const keywordsLength = data.keywords.length;
    const keywordCount = data.keywords ? 
      (data.keywords.includes(',') ? 
        data.keywords.split(',').filter(k => k.trim().length > 0).length :
        data.keywords.split(/\s+/).filter(k => k.trim().length > 0).length
      ) : 0;
    
    if (keywordsLength === 0) {
      warnings.push({ field: 'Sökord', issue: 'Inga dolda sökord - kritiskt för sökbarhet', severity: 'high' });
      score -= 30;
    } else if (keywordCount < 2) {
      warnings.push({ field: 'Sökord', issue: 'För få sökord - lägg till fler relevanta termer', severity: 'high' });
      score -= 20;
    } else if (keywordCount < 5) {
      warnings.push({ field: 'Sökord', issue: 'Bra start - några fler sökord kan förbättra sökbarheten', severity: 'medium' });
      score -= 10;
    } else if (keywordCount > 15) {
      warnings.push({ field: 'Sökord', issue: 'För många sökord kan skada sökbarheten - fokusera på kvalitet över kvantitet', severity: 'medium' });
      score -= 15;
    }
    
    // Check for keyword quality - simplified approach
    if (data.keywords) {
      const keywords = data.keywords.toLowerCase();
      const titleDesc = (data.title + ' ' + data.description + ' ' + data.condition).toLowerCase();
      
      const keywordArray = data.keywords.split(',').map(k => k.trim()).filter(k => k.length > 0);
      const uniqueKeywords = keywordArray.filter(keyword => 
        !titleDesc.includes(keyword.toLowerCase()) || keyword.length <= 3
      );
      
      const uniquePercentage = uniqueKeywords.length / keywordArray.length;
      
      if (uniquePercentage < 0.4) {
        warnings.push({ field: 'Sökord', issue: 'Tips: Många sökord upprepar titel/beskrivning - kompletterande termer kan förbättra sökbarheten', severity: 'low' });
      }
    }

    // Update UI with immediate results
    this.updateQualityIndicator(score, warnings);

    // Now run AI artist detection asynchronously and update when complete
    this.runAIArtistDetection(data, warnings, score);
  }

  async runAIArtistDetection(data, currentWarnings, currentScore) {
    // Show initial AI loading indicator
    this.showAILoadingIndicator('🤖 Söker konstnärsnamn...');
    this.aiAnalysisActive = true;
    this.pendingAnalyses = new Set();

    try {
      // Track pending analyses
      this.pendingAnalyses.add('artist');
      
      // ENHANCED STRATEGY: Immediately detect and format AI artist for SSoT integration
      console.log('🎯 Starting AI artist detection for immediate SSoT integration...');
      
      // First, check if we have an immediate artist (from field or rule-based detection)
      const immediateArtist = this.determineBestArtistForMarketAnalysis(data);
      
      // Start artist detection (for quality warnings AND SSoT integration)
      const artistAnalysisPromise = this.detectMisplacedArtist(data.title, data.artist);
      
      // CRITICAL ENHANCEMENT: Handle AI artist detection for immediate market analysis
      const aiArtistForMarketAnalysis = await Promise.race([
        artistAnalysisPromise,
        new Promise(resolve => setTimeout(() => resolve(null), 8000)) // 8s timeout
      ]);
      
      // CRITICAL FIX: Always do FULL analysis regardless of artist detection
      console.log('🚀 FIXED: Running full AI analysis with artist integration (not artist-only)');
      
      if (aiArtistForMarketAnalysis && aiArtistForMarketAnalysis.detectedArtist) {
        console.log('🤖 AI detected artist - will integrate into FULL analysis:', aiArtistForMarketAnalysis.detectedArtist);
        
        // FORMAT AI-detected artist for integration
        const formattedAIArtist = this.formatAIDetectedArtistForSSoT(aiArtistForMarketAnalysis.detectedArtist);
        console.log('🎯 Formatted AI artist for integration:', formattedAIArtist);
        
        // FIXED: Do FULL candidate extraction WITH artist integration
        if (this.searchQuerySSoT && this.searchFilterManager) {
          console.log('🔍 FIXED: Generating FULL candidate terms WITH AI artist integration...');
          
          // Create enhanced data with AI-detected artist for full analysis
          const enhancedData = {
            ...data,
            aiDetectedArtist: aiArtistForMarketAnalysis.detectedArtist
          };
          
          // Extract FULL candidate terms WITH artist integration  
          const candidateSearchTerms = this.searchFilterManager.extractCandidateSearchTerms(
            data.title,
            data.description,
            { artist: aiArtistForMarketAnalysis.detectedArtist }, // Pass AI artist for integration
            formattedAIArtist // Pass formatted artist as context
          );
          
          if (candidateSearchTerms && candidateSearchTerms.candidates && candidateSearchTerms.candidates.length > 0) {
            console.log('✅ FIXED: Full candidate terms WITH artist generated:', candidateSearchTerms.candidates.length);
            console.log('📋 FIXED: Full terms:', candidateSearchTerms.candidates.map(c => `${c.term} (${c.type})`));
            
            // Initialize SSoT with FULL candidate terms (not just artist)
            this.searchQuerySSoT.initialize(
              candidateSearchTerms.currentQuery, 
              candidateSearchTerms, 
              'ai_enhanced_full_analysis'
            );
            
            console.log('🚀 FIXED: SSoT initialized with FULL analysis including AI artist');
            
            // Trigger market analysis with FULL search context
            if (this.apiManager) {
              console.log('🎯 FIXED: Triggering market analysis with FULL terms...');
              const searchContext = this.searchQuerySSoT.buildSearchContext();
              
              // Start market analysis in background (non-blocking)
              this.apiManager.analyzeSales(searchContext).then(salesData => {
                if (salesData && salesData.hasComparableData) {
                  console.log('✅ FIXED: Full market analysis completed:', salesData);
                  
                  // Update dashboard with full results
                  if (this.salesAnalysisManager && this.salesAnalysisManager.dashboardManager) {
                    this.salesAnalysisManager.dashboardManager.addMarketDataDashboard(salesData, 'ai_enhanced_full');
                  }
                }
              }).catch(error => {
                console.error('❌ Full market analysis failed:', error);
              });
            }
          } else {
            console.log('⚠️ FIXED: Failed to generate full candidate terms, using fallback');
            // Fallback to the minimal artist-only approach if full extraction fails
            await this.triggerDashboardForNonArtItems(data);
          }
        } else {
          console.log('⚠️ FIXED: Missing components, using fallback dashboard');
          await this.triggerDashboardForNonArtItems(data);
        }
      } else {
        console.log('🎯 FIXED: No artist detected - using standard full analysis');
        // Standard flow for non-artist items
        await this.triggerDashboardForNonArtItems(data);
      }
      
      // Continue with original artist detection flow for quality warnings
      artistAnalysisPromise.then(aiArtist => {
        this.handleArtistDetectionResult(aiArtist, data, currentWarnings, currentScore).then(result => {
          this.pendingAnalyses.delete('artist');
          console.log('✅ Artist analysis complete');
          
          // Only hide loading if all analyses are done
          if (this.pendingAnalyses.size === 0) {
            this.hideAILoadingIndicator();
            this.aiAnalysisActive = false;
          }
        });
      }).catch(error => {
        console.error('❌ Artist detection failed:', error);
        this.pendingAnalyses.delete('artist');
        
        if (this.pendingAnalyses.size === 0) {
          this.hideAILoadingIndicator();
          this.aiAnalysisActive = false;
        }
      });

    } catch (error) {
      console.error('💥 AI Artist Detection Error:', error);
      this.pendingAnalyses.delete('artist');
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
      console.log(`🎯 Formatting multi-word AI artist: "${cleanArtist}" → ${formatted}`);
      return formatted;
    } else if (words.length === 1) {
      // Single word: Also quote for consistency and precision
      const formatted = `"${cleanArtist}"`;
      console.log(`🎯 Formatting single-word AI artist: "${cleanArtist}" → ${formatted}`);
      return formatted;
    }
    
    // Fallback
    return cleanArtist;
  }

  async handleArtistDetectionResult(aiArtist, data, currentWarnings, currentScore) {
    console.log('🎯 Handling artist detection result:', aiArtist);
    
    // Check if aiArtist is null or undefined
    if (!aiArtist || !aiArtist.detectedArtist) {
      console.log('⚠️ No valid artist detection result, skipping artist warning');
      
      // NEW: TRIGGER DASHBOARD FOR NON-ART ITEMS TOO!
      console.log('🎯 No artist detected - triggering dashboard for non-art item (furniture, watches, etc.)');
      await this.triggerDashboardForNonArtItems(data);
      
      return {
        detectedArtist: null,
        warnings: currentWarnings,
        score: currentScore
      };
    }
    
    console.log('✅ Valid artist detected, creating warning with clickable name');
    
    // Create properly formatted warning for the existing display system
    const artistMessage = aiArtist.verification ? 
      `AI upptäckte konstnär: "<strong>${aiArtist.detectedArtist}</strong>" (95% säkerhet) ✓ Verifierad konstnär <span class="artist-bio-tooltip" data-full-bio="${(aiArtist.verification.biography || 'Ingen detaljerad biografi tillgänglig').replace(/"/g, '&quot;').replace(/'/g, '&#39;')}" style="cursor: help; border-bottom: 1px dotted rgba(25, 118, 210, 0.5); transition: all 0.2s ease;">(${aiArtist.verification.biography ? aiArtist.verification.biography.substring(0, 80) + '...' : 'biografi saknas'})</span> - flytta från ${aiArtist.foundIn || 'titel'} till konstnärsfält` :
      `AI upptäckte konstnär: "<strong>${aiArtist.detectedArtist}</strong>" (${Math.round(aiArtist.confidence * 100)}% säkerhet) - flytta från ${aiArtist.foundIn || 'titel'} till konstnärsfält`;

    console.log('📝 Artist warning message created:', artistMessage);
    console.log('🎯 Detected artist for clickability:', aiArtist.detectedArtist);

    // Insert artist warning at the beginning since it's important info
    const artistWarning = {
        field: 'Titel', 
      issue: artistMessage,
      severity: 'medium',
      detectedArtist: aiArtist.detectedArtist, // For click-to-copy functionality
      suggestedTitle: aiArtist.suggestedTitle,
      suggestedDescription: aiArtist.suggestedDescription,
      foundIn: aiArtist.foundIn,
      isArtistWarning: true // NEW: Mark this as an artist warning to preserve it
    };

    console.log('🔧 Artist warning object:', artistWarning);
    
    // CRITICAL FIX: Don't add duplicate artist warnings
    const existingArtistWarningIndex = currentWarnings.findIndex(w => w.isArtistWarning);
    if (existingArtistWarningIndex >= 0) {
      console.log('🔄 Replacing existing artist warning at index:', existingArtistWarningIndex);
      currentWarnings[existingArtistWarningIndex] = artistWarning;
    } else {
      console.log('➕ Adding new artist warning at beginning');
      currentWarnings.unshift(artistWarning);
    }

    // Update quality display immediately and ensure it's visible
    console.log('🔄 Updating quality indicator with artist warning...');
    this.updateQualityIndicator(currentScore, currentWarnings);
    console.log('✅ Artist detection results displayed');
    
    // CRITICAL FIX: SSoT already initialized in runAIArtistDetection - no duplicate logic needed
    console.log('✅ FIXED: Artist warning created - SSoT already initialized with FULL analysis above');
    
    return {
      detectedArtist: aiArtist,
      warnings: currentWarnings,
      score: currentScore
    };
  }

  // NEW: Trigger dashboard for non-art items (furniture, watches, etc.)
  async triggerDashboardForNonArtItems(data) {
    console.log('🪑 Triggering dashboard for non-art item:', data.title);
    
    if (!this.searchQuerySSoT || !this.searchFilterManager || !this.apiManager || !this.salesAnalysisManager) {
      console.log('⚠️ Missing required components for non-art dashboard');
      return;
    }
    
    try {
      // Generate candidate search terms for non-art items (no artist)
      console.log('🔍 Generating candidate terms for non-art item...');
      
      const candidateSearchTerms = this.searchFilterManager.extractCandidateSearchTerms(
        data.title,
        data.description,
        '', // No artist for non-art items
        '' // No search query for initial extraction
      );
      
      if (candidateSearchTerms && candidateSearchTerms.candidates && candidateSearchTerms.candidates.length > 0) {
        console.log('✅ Non-art candidate terms generated:', candidateSearchTerms.candidates.length);
        console.log('📋 Non-art terms:', candidateSearchTerms.candidates.map(c => c.term));
        
        // Initialize SSoT with non-art candidate terms
        this.searchQuerySSoT.initialize(
          candidateSearchTerms.currentQuery, 
          candidateSearchTerms, 
          'non_art_item'
        );
        
        console.log('🚀 SSoT initialized for non-art item market analysis');
        
        // MARKET ANALYSIS: Trigger for non-art items (furniture, watches, etc.)
        console.log('🎯 Triggering market analysis for non-art item...');
        
        const searchContext = this.searchQuerySSoT.buildSearchContext();
        
        // Trigger market analysis
        const salesData = await this.apiManager.analyzeSales(searchContext);
        
        if (salesData && salesData.hasComparableData) {
          console.log('✅ Non-art market analysis completed successfully');
          
          // Add candidate terms to sales data for dashboard
          salesData.candidateSearchTerms = candidateSearchTerms;
          
          // Update dashboard with non-art results
          if (this.salesAnalysisManager.dashboardManager) {
            this.salesAnalysisManager.dashboardManager.addMarketDataDashboard(salesData, 'non_art_complete');
            console.log('🪑 Dashboard displayed for non-art item');
          }
        } else {
          console.log('⚠️ Non-art market analysis found no comparable data');
          
          // Still show dashboard even without market data - user can refine search terms
          if (this.salesAnalysisManager.dashboardManager && candidateSearchTerms) {
            console.log('🔧 Showing dashboard with search terms only (no market data)');
            
            // Create minimal sales data for dashboard display
            const minimalSalesData = {
              hasComparableData: false,
              candidateSearchTerms: candidateSearchTerms,
              dataSource: 'no_market_data',
              confidence: 0.3,
              reasoning: 'No comparable market data found - refine search terms'
            };
            
            this.salesAnalysisManager.dashboardManager.addMarketDataDashboard(minimalSalesData, 'non_art_no_data');
            console.log('🪑 Dashboard displayed for non-art item (search terms only)');
          }
        }
        
      } else {
        console.log('❌ Failed to generate candidate terms for non-art item');
      }
      
    } catch (error) {
      console.error('❌ Error during non-art dashboard trigger:', error);
    }
  }

  addMarketDataWarnings(salesData, warnings) {
    const dataSource = salesData.dataSource || 'unknown';
    
    // Add a subtle header to separate API data from quality warnings
    warnings.push({
      field: 'Marknadsdata',
      issue: '', // Empty issue for header-only display
      severity: 'header' // Special severity for styling
    });
    
    // 1. MAIN PRICE RANGE (Primary insight) - More concise
    if (salesData.priceRange) {
      const confidence = salesData.confidence;
      const priceRange = salesData.priceRange;
      
      // Format price range nicely
      const formattedLow = new Intl.NumberFormat('sv-SE').format(priceRange.low);
      const formattedHigh = new Intl.NumberFormat('sv-SE').format(priceRange.high);
      
      // Create confidence indicator
      let confidenceText = '';
      if (confidence >= 0.8) {
        confidenceText = 'Hög tillförlitlighet';
      } else if (confidence >= 0.6) {
        confidenceText = 'Medel tillförlitlighet';
      } else {
        confidenceText = 'Låg tillförlitlighet';
      }
      
      const mainMessage = `${formattedLow}-${formattedHigh} SEK (${confidenceText} ${Math.round(confidence * 100)}%)`;
      
      warnings.push({
        field: 'Värdering',
        issue: mainMessage,
        severity: 'market-primary'
      });
    }
    
    // 2. MOST SIGNIFICANT INSIGHT ONLY (Very concise)
    if (salesData.insights && salesData.insights.length > 0) {
      const significantInsights = salesData.insights.filter(insight => 
        insight.significance === 'high'
      );
      
      if (significantInsights.length > 0) {
        const insight = significantInsights[0];
        
        // Show the full actionable message for high-significance insights
        let trendMessage = insight.message;
        let severity = 'market-insight';
        
        // Adjust severity based on insight type for better visual hierarchy
        if (insight.type === 'price_comparison') {
          if (insight.message.includes('överväg att höja') || insight.message.includes('överväg att sänka')) {
            severity = 'market-primary'; // More prominent for actionable advice
          }
        } else if (insight.type === 'market_strength' || insight.type === 'market_weakness') {
          severity = 'market-activity';
        }
        
        warnings.push({
          field: 'Marknadstrend',
          issue: trendMessage,
          severity: severity
        });
      }
    }
    
    // 3. VERY CONDENSED DATA SUMMARY (Single compact line)
    let dataParts = [];
    
    if (salesData.historical) {
      dataParts.push(`${salesData.historical.analyzedSales} historiska`);
    }
    
    if (salesData.live) {
      dataParts.push(`${salesData.live.analyzedLiveItems} pågående`);
    }
    
    if (dataParts.length > 0) {
      warnings.push({
        field: 'Dataunderlag',
        issue: `${dataParts.join(' • ')} försäljningar analyserade`,
        severity: 'market-data'
      });
    }
    
    // 4. ONLY SHOW CRITICAL MARKET ACTIVITY (Very selective)
    if (salesData.live && salesData.live.marketActivity) {
      const activity = salesData.live.marketActivity;
      
      // Only show if very significant activity
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
    
    // 5. LIMITATIONS (Only if very low confidence)
    if (salesData.confidence < 0.5) {
      warnings.push({
        field: 'Notera',
        issue: 'Begränsad data',
        severity: 'market-note'
      });
    }
  }

  // NEW: Add click-to-add-to-artist-field functionality for artist names
  addClickToCopyHandler(warningElement, artistName) {
    const clickableElements = warningElement.querySelectorAll('.clickable-artist');
    
    console.log(`🔗 Setting up click handlers for ${clickableElements.length} clickable elements`);
    
    clickableElements.forEach((element, index) => {
      console.log(`🎯 Adding click handler to element ${index + 1}: "${element.textContent}"`);
      
      element.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log(`🖱️ Click detected on artist: "${artistName}"`);
        
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
              console.log(`✅ Found artist field with selector: ${selector}`);
              break;
            }
          }
          
          if (!artistField) {
            console.error('❌ Artist field not found with any selector');
            console.log('🔍 Available input fields:', document.querySelectorAll('input[type="text"]'));
            this.showErrorFeedback(element, 'Konstnärsfält hittades inte');
            return;
          }
          
          // Check if field already has content
          const currentValue = artistField.value.trim();
          if (currentValue && currentValue !== artistName) {
            console.log(`⚠️ Artist field already contains: "${currentValue}"`);
            
            // Instantly replace field content (no confirmation popup)
            console.log(`🎯 Replacing "${currentValue}" with "${artistName}"`);
            artistField.value = artistName;
          } else {
            // Field is empty or contains the same artist
            artistField.value = artistName;
          }
          
          // Trigger form events to ensure proper validation and saving
          const events = ['input', 'change', 'blur'];
          events.forEach(eventType => {
            artistField.dispatchEvent(new Event(eventType, { bubbles: true }));
          });
          
          // Trigger quality re-analysis since adding an artist likely improves the score
          setTimeout(() => {
            console.log('🔄 Triggering quality re-analysis after artist addition');
            this.analyzeQuality();
          }, 200);
          
          // CRITICAL FIX: Re-trigger market analysis when artist is moved to field
          if (this.searchQuerySSoT && this.salesAnalysisManager) {
            setTimeout(async () => {
              console.log('🔄 Re-triggering market analysis after artist moved to field');
              
              try {
                // Get updated form data with artist now in field
                const updatedData = this.dataExtractor.extractItemData();
                console.log('📊 Updated data after artist move:', { artist: updatedData.artist, title: updatedData.title.substring(0, 50) });
                
                // Clear existing dashboard
                const existingDashboard = document.querySelector('.market-data-dashboard');
                if (existingDashboard) {
                  console.log('🗑️ Removing existing dashboard for re-analysis');
                  existingDashboard.remove();
                }
                
                // Generate new search query with artist now in field
                const ssotResult = await this.searchQuerySSoT.generateAndSetQuery(
                  updatedData.title,
                  updatedData.description,
                  updatedData.artist,  // Now contains the moved artist
                  ''  // No AI artist since it's been moved
                );
                
                if (ssotResult && ssotResult.success) {
                  console.log('✅ Re-generated search query with artist in field:', ssotResult.query);
                  
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
                } else {
                  console.log('⚠️ Failed to generate new search query after artist move');
                }
              } catch (error) {
                console.error('Error re-triggering market analysis after artist move:', error);
              }
            }, 500);  // Wait a bit longer to ensure field update is complete
          }
          
          // Simple visual feedback - success
          const originalText = element.textContent;
          const originalColor = element.style.color;
          
          // Simple success indication
          element.style.color = '#4caf50';
          element.textContent = '✓ Tillagd!';
          
          // Briefly highlight the artist field to show where it was added
          const originalFieldBackground = artistField.style.backgroundColor;
          const originalFieldBorder = artistField.style.border;
          artistField.style.backgroundColor = '#e8f5e8';
          artistField.style.border = '2px solid #4caf50';
          artistField.style.transition = 'all 0.3s ease';
          
          // Scroll to artist field if it's not visible
          artistField.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // Reset after 2 seconds with smooth transition
          setTimeout(() => {
            element.style.transition = 'all 0.3s ease';
            element.style.color = originalColor;
            element.textContent = originalText;
            
            // Reset field highlight
            artistField.style.backgroundColor = originalFieldBackground;
            artistField.style.border = originalFieldBorder;
          }, 2000);
          
          console.log(`✅ Artist name "${artistName}" successfully added to field`);
          
        } catch (error) {
          console.error('❌ Failed to add artist name to field:', error);
          this.showErrorFeedback(element, 'Misslyckades att lägga till');
        }
      });
      
      // Add keyboard accessibility
      element.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          element.click();
        }
      });
      
      // Make element focusable for keyboard navigation
      element.setAttribute('tabindex', '0');
      element.setAttribute('role', 'button');
      element.setAttribute('aria-label', `Klicka för att lägga till ${artistName} i konstnärsfältet`);
    });
  }

  // NEW: Add click-to-move functionality for artist names (copy to artist field + remove from title)
  addClickToCopyHandler(warningElement, artistName, artistWarning = null) {
    const clickableElements = warningElement.querySelectorAll('.clickable-artist');
    
    console.log(`🔗 Setting up click handlers for ${clickableElements.length} clickable elements`);
    
    clickableElements.forEach((element, index) => {
      console.log(`🎯 Adding click handler to element ${index + 1}: "${element.textContent}"`);
      
      element.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        console.log(`🖱️ Click detected on artist: "${artistName}"`);
        
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
              console.log(`✅ Found artist field with selector: ${selector}`);
              break;
            }
          }
          
          if (!artistField) {
            console.error('❌ Artist field not found with any selector');
            console.log('🔍 Available input fields:', document.querySelectorAll('input[type="text"]'));
            this.showErrorFeedback(element, 'Konstnärsfält hittades inte');
            return;
          }

          // NEW: Also find the title field for removing the artist
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
              console.log(`✅ Found title field with selector: ${selector}`);
              break;
            }
          }
          
          // Check if field already has content
          const currentValue = artistField.value.trim();
          if (currentValue && currentValue !== artistName) {
            console.log(`⚠️ Artist field already contains: "${currentValue}"`);
            
            // Instantly replace field content (no confirmation popup)
            console.log(`🎯 Replacing "${currentValue}" with "${artistName}"`);
            artistField.value = artistName;
          } else {
            // Field is empty or contains the same artist
            artistField.value = artistName;
          }

          // NEW: Update title field if we have a suggested title (remove artist from title)
          if (titleField && artistWarning && artistWarning.suggestedTitle) {
            const currentTitle = titleField.value.trim();
            const suggestedTitle = artistWarning.suggestedTitle.trim();
            
            console.log(`🎯 MOVING artist from title: "${currentTitle}" → "${suggestedTitle}"`);
            
            // Update title field with cleaned title
            titleField.value = suggestedTitle;
            
            // Trigger events for title field
            const titleEvents = ['input', 'change', 'blur'];
            titleEvents.forEach(eventType => {
              titleField.dispatchEvent(new Event(eventType, { bubbles: true }));
            });
            
            console.log(`✅ Title updated to remove artist: "${suggestedTitle}"`);
          } else if (titleField && !artistWarning?.suggestedTitle) {
            console.log(`⚠️ No suggested title available - artist copied but not removed from title`);
          } else if (!titleField) {
            console.log(`⚠️ Title field not found - artist copied but title not updated`);
          }
          
          // Trigger form events to ensure proper validation and saving
          const events = ['input', 'change', 'blur'];
          events.forEach(eventType => {
            artistField.dispatchEvent(new Event(eventType, { bubbles: true }));
          });
          
          // Trigger quality re-analysis since adding an artist likely improves the score
          setTimeout(() => {
            console.log('🔄 Triggering quality re-analysis after artist move');
            this.analyzeQuality();
          }, 200);
          
          // CRITICAL FIX: Re-trigger market analysis when artist is moved to field
          if (this.searchQuerySSoT && this.salesAnalysisManager) {
            setTimeout(async () => {
              console.log('🔄 Re-triggering market analysis after artist moved to field');
              
              try {
                // Get updated form data with artist now in field
                const updatedData = this.dataExtractor.extractItemData();
                console.log('📊 Updated data after artist move:', { artist: updatedData.artist, title: updatedData.title.substring(0, 50) });
                
                // Clear existing dashboard
                const existingDashboard = document.querySelector('.market-data-dashboard');
                if (existingDashboard) {
                  console.log('🗑️ Removing existing dashboard for re-analysis');
                  existingDashboard.remove();
                }
                
                // Generate new search query with artist now in field
                const ssotResult = await this.searchQuerySSoT.generateAndSetQuery(
                  updatedData.title,
                  updatedData.description,
                  updatedData.artist,  // Now contains the moved artist
                  ''  // No AI artist since it's been moved
                );
                
                if (ssotResult && ssotResult.success) {
                  console.log('✅ Re-generated search query with artist in field:', ssotResult.query);
                  
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
                } else {
                  console.log('⚠️ Failed to generate new search query after artist move');
                }
              } catch (error) {
                console.error('Error re-triggering market analysis after artist move:', error);
              }
            }, 500);  // Wait a bit longer to ensure field update is complete
          }
          
          // Enhanced visual feedback - success
          const originalText = element.textContent;
          const originalColor = element.style.color;
          
          // Success indication shows MOVED not just added
          element.style.color = '#4caf50';
          element.textContent = titleField && artistWarning?.suggestedTitle ? '✓ Flyttad!' : '✓ Tillagd!';
          
          // Briefly highlight the artist field to show where it was added
          const originalFieldBackground = artistField.style.backgroundColor;
          const originalFieldBorder = artistField.style.border;
          artistField.style.backgroundColor = '#e8f5e8';
          artistField.style.border = '2px solid #4caf50';
          artistField.style.transition = 'all 0.3s ease';

          // Also highlight title field if it was updated
          if (titleField && artistWarning?.suggestedTitle) {
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
            element.style.transition = 'all 0.3s ease';
            element.style.color = originalColor;
            element.textContent = originalText;
            
            // Reset field highlight
            artistField.style.backgroundColor = originalFieldBackground;
            artistField.style.border = originalFieldBorder;
          }, 2000);
          
          const actionText = titleField && artistWarning?.suggestedTitle ? 'moved to field and removed from title' : 'added to field';
          console.log(`✅ Artist name "${artistName}" successfully ${actionText}`);
          
        } catch (error) {
          console.error('❌ Failed to move artist name:', error);
          this.showErrorFeedback(element, 'Misslyckades att flytta');
        }
      });
      
      // Add keyboard accessibility
      element.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          element.click();
        }
      });
      
      // Make element focusable for keyboard navigation
      element.setAttribute('tabindex', '0');
      element.setAttribute('role', 'button');
      element.setAttribute('aria-label', `Klicka för att flytta ${artistName} till konstnärsfältet`);
    });
  }

  // Helper method to show error feedback
  showErrorFeedback(element, message) {
    const originalBackground = element.style.background;
    const originalColor = element.style.color;
    const originalText = element.textContent;
    
    element.style.background = '#f44336';
    element.style.color = 'white';
    element.textContent = message;
    
    setTimeout(() => {
      element.style.background = originalBackground;
      element.style.color = originalColor;
      element.textContent = originalText;
    }, 1500);
  }

  setupLiveQualityUpdates() {
    // Debounce function to prevent too frequent updates
    let updateTimeout;
    const debouncedUpdate = (event) => {
      clearTimeout(updateTimeout);
      updateTimeout = setTimeout(() => {
        console.log('⚡ Live quality update triggered by:', event?.target?.id || event?.target?.tagName || 'unknown field');
        this.analyzeQuality();
      }, 800); // Wait 800ms after user stops typing
    };

    // Use the exact same selectors as extractItemData()
    const fieldsToMonitor = [
      '#item_title_sv',
      '#item_description_sv', 
      '#item_condition_sv',
      '#item_hidden_keywords',
      'input[type="checkbox"]#item_no_remarks',
      'input[type="checkbox"][name*="no_remarks"]'
    ];

    let monitoredCount = 0;
    fieldsToMonitor.forEach(selector => {
      const element = document.querySelector(selector);
      if (element) {
        console.log(`Setting up live monitoring for: ${selector}`);
        monitoredCount++;
        
        // Add event listeners for different input types
        if (element.type === 'checkbox') {
          element.addEventListener('change', debouncedUpdate);
          console.log(`✅ Added 'change' listener to checkbox: ${selector}`);
        } else {
          element.addEventListener('input', debouncedUpdate);
          element.addEventListener('paste', debouncedUpdate);
          element.addEventListener('keyup', debouncedUpdate);
          console.log(`✅ Added 'input', 'paste', 'keyup' listeners to: ${selector}`);
        }
        
        // Test immediate trigger
        element.addEventListener('focus', () => {
          console.log(`🎯 Field focused: ${selector}`);
        });
      } else {
        console.warn(`Field not found for live monitoring: ${selector}`);
      }
    });

    // Also monitor for changes in rich text editors (if any)
    const richTextEditors = document.querySelectorAll('[contenteditable="true"]');
    richTextEditors.forEach(editor => {
      console.log('Setting up live monitoring for rich text editor');
      editor.addEventListener('input', debouncedUpdate);
      editor.addEventListener('paste', debouncedUpdate);
      monitoredCount++;
    });

    console.log(`🎯 Live quality monitoring set up for ${monitoredCount} fields`);
    
    // Test if fields exist right now
    console.log('🔍 Field existence check:');
    console.log('Title field:', document.querySelector('#item_title_sv'));
    console.log('Description field:', document.querySelector('#item_description_sv'));
    console.log('Condition field:', document.querySelector('#item_condition_sv'));
    console.log('Keywords field:', document.querySelector('#item_hidden_keywords'));
    
    // SAFETY CHECK: Ensure all necessary components are properly initialized
    console.log('✅ Live quality monitoring setup complete');
  }

  assessDataQuality(data, fieldType) {
    const descLength = data.description.replace(/<[^>]*>/g, '').length;
    const condLength = data.condition.replace(/<[^>]*>/g, '').length;
    const titleLength = data.title.length;
    
    // Check if "Inga anmärkningar" is checked
    const noRemarksCheckbox = document.querySelector('input[type="checkbox"][value="Inga anmärkningar"]') || 
                             document.querySelector('input[type="checkbox"]#item_no_remarks') ||
                             document.querySelector('input[type="checkbox"][name*="no_remarks"]');
    const noRemarksChecked = noRemarksCheckbox && noRemarksCheckbox.checked;
    
    // Calculate overall quality score
    const qualityScore = this.calculateCurrentQualityScore(data);
    
    const issues = [];
    let needsMoreInfo = false;
    
    // Critical quality thresholds
    if (qualityScore < 30) {
      needsMoreInfo = true;
      issues.push('critical_quality');
    }
    
    // Field-specific quality checks
    switch(fieldType) {
      case 'title':
        // Check if we can safely improve title
        if (!data.description.match(/\d{4}|\d{2,4}-tal|1[6-9]\d{2}|20[0-2]\d/i) && !data.artist && descLength < 30) {
          issues.push('period');
          needsMoreInfo = true;
        }
        if (titleLength < 15 && descLength < 25) {
          issues.push('basic_info');
          needsMoreInfo = true;
        }
        // Check if artist is unknown/obscure and might lead to hallucination
        if (data.artist && data.artist.length > 0 && descLength < 20) {
          issues.push('artist_verification');
          needsMoreInfo = true;
        }
        break;
        
      case 'description':
        if (descLength < 25) {
          needsMoreInfo = true;
          issues.push('short_description');
        }
        if (!data.description.match(/\d+[\s,]*(x|cm|mm)/i) && descLength < 40) {
          issues.push('measurements');
          needsMoreInfo = true;
        }
        break;
        
      case 'condition':
        // Skip condition checks if "Inga anmärkningar" is checked
        if (!noRemarksChecked) {
          if (data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) {
            issues.push('specific_damage', 'wear_details', 'bruksslitage_vague');
            needsMoreInfo = true;
          }
          if (condLength < 15) {
            issues.push('condition_details');
            needsMoreInfo = true;
          }
          
          // Check for other vague condition phrases
          const vaguePhrases = ['normalt slitage', 'vanligt slitage', 'åldersslitage'];
          const conditionText = data.condition.toLowerCase();
          const hasVaguePhrase = vaguePhrases.some(phrase => conditionText.includes(phrase));
          
          if (hasVaguePhrase && condLength < 40) {
            issues.push('vague_condition_terms');
            needsMoreInfo = true;
          }
        }
        break;
        
      case 'keywords':
        // Keywords can usually be generated even with sparse data
        if (qualityScore < 20) {
          issues.push('basic_info');
          needsMoreInfo = true;
        }
        break;
        
      case 'all':
        // For "Förbättra alla" - comprehensive check
        if (qualityScore < 40) {
          needsMoreInfo = true;
          issues.push('critical_quality');
        }
        if (descLength < 30) {
          issues.push('material', 'technique', 'period');
          needsMoreInfo = true;
        }
        if (!data.description.match(/\d+[\s,]*(x|cm|mm)/i) && descLength < 50) {
          issues.push('measurements');
          needsMoreInfo = true;
        }
        if (!noRemarksChecked && data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) {
          issues.push('specific_damage');
          needsMoreInfo = true;
        }
        break;
    }
    
    return { needsMoreInfo, missingInfo: issues, qualityScore };
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

  updateQualityIndicator(score, warnings) {
    console.log('🔄 updateQualityIndicator called with:', { score, warningsCount: warnings.length });
    console.log('📋 Warnings received:', warnings.map(w => ({ field: w.field, hasDetectedArtist: !!w.detectedArtist, detectedArtist: w.detectedArtist })));
    
    const scoreElement = document.querySelector('.quality-score');
    const warningsElement = document.querySelector('.quality-warnings');
    
    if (scoreElement) {
      // Add smooth transition effect for score changes
      const currentScore = parseInt(scoreElement.textContent.split('/')[0]) || 0;
      const newScore = score;
      
      if (currentScore !== newScore) {
        scoreElement.style.transform = 'scale(1.1)';
        setTimeout(() => {
          scoreElement.style.transform = 'scale(1)';
        }, 200);
      }
      
      scoreElement.textContent = `${score}/100`;
      scoreElement.className = `quality-score ${score >= 80 ? 'good' : score >= 60 ? 'medium' : 'poor'}`;
    }
    
    if (warningsElement) {
      if (warnings.length > 0) {
        const warningItems = warnings.map((w, warningIndex) => {
          let issue = w.issue;
          
          console.log(`🔍 Processing warning ${warningIndex + 1}:`, { field: w.field, detectedArtist: w.detectedArtist, issue: issue ? issue.substring(0, 100) + '...' : 'NO ISSUE TEXT' });
          
          // SAFETY CHECK: Ensure issue exists
          if (!issue) {
            console.warn(`⚠️ Warning ${warningIndex + 1} has no issue text:`, w);
            issue = w.message || 'Ingen information tillgänglig';
          }
          
          // ENHANCED: Make artist names clickable for copy functionality
          if (w.detectedArtist) {
            console.log(`🎯 Making artist name clickable: "${w.detectedArtist}"`);
            console.log(`📝 Original issue text: "${issue}"`);
            
            // Create clickable replacement with simple styling
            const clickableReplacement = `<span class="clickable-artist" 
              style="
                color: #1976d2; 
                cursor: pointer; 
                text-decoration: underline; 
                font-weight: 700; 
                transition: color 0.2s ease;
              " 
              title="Klicka för att lägga till '${w.detectedArtist}' i konstnärsfältet"
              data-artist="${w.detectedArtist}">${w.detectedArtist}</span>`;
            
            // COMPREHENSIVE pattern matching - try EVERYTHING
            let patternMatched = false;
            const allPatterns = [
              // Pattern 1: "Artist Name" with <strong> tags
              { pattern: new RegExp(`"<strong>${this.escapeRegex(w.detectedArtist)}</strong>"`, 'gi'), replacement: `"${clickableReplacement}"` },
              // Pattern 2: "Artist Name" without tags  
              { pattern: new RegExp(`"${this.escapeRegex(w.detectedArtist)}"`, 'gi'), replacement: `"${clickableReplacement}"` },
              // Pattern 3: Artist Name with <strong> tags (no quotes)
              { pattern: new RegExp(`<strong>${this.escapeRegex(w.detectedArtist)}</strong>`, 'gi'), replacement: clickableReplacement },
              // Pattern 4: Artist Name without any formatting
              { pattern: new RegExp(`\\b${this.escapeRegex(w.detectedArtist)}\\b`, 'gi'), replacement: clickableReplacement },
              // Pattern 5: Artist Name at start of parentheses (like in verification text)
              { pattern: new RegExp(`\\(${this.escapeRegex(w.detectedArtist)}\\s`, 'gi'), replacement: `(${clickableReplacement} ` },
              // Pattern 6: Case insensitive exact match anywhere
              { pattern: new RegExp(this.escapeRegex(w.detectedArtist), 'gi'), replacement: clickableReplacement }
            ];
            
            console.log(`🔍 Testing ${allPatterns.length} patterns for artist: ${w.detectedArtist}`);
            
            for (let i = 0; i < allPatterns.length; i++) {
              const { pattern, replacement } = allPatterns[i];
              console.log(`🔍 Testing pattern ${i + 1}: ${pattern.source}`);
              
              if (pattern.test(issue)) {
                console.log(`✅ Pattern ${i + 1} matched! Applying replacement...`);
                
                // Create fresh pattern to avoid global flag issues
                const freshPattern = new RegExp(pattern.source, pattern.flags);
                const originalIssue = issue;
                issue = issue.replace(freshPattern, replacement);
                
                console.log(`📝 Before: "${originalIssue.substring(0, 100)}..."`);
                console.log(`📝 After: "${issue.substring(0, 100)}..."`);
                
                patternMatched = true;
                break;
              } else {
                console.log(`❌ Pattern ${i + 1} did not match`);
              }
            }
            
            // ULTIMATE FALLBACK: If nothing worked, force add clickable element at the end
            if (!patternMatched) {
              console.log(`⚠️ NO PATTERNS MATCHED! Force adding clickable artist at end`);
              issue += ` → <strong style="color: red;">KLICKA HÄR:</strong> ${clickableReplacement}`;
              console.log(`🔧 Force-added clickable element: "${issue.substring(issue.length - 100)}"`);
            }
            
            console.log(`📝 Final enhanced issue text: "${issue}"`);
          }
          
          return `<li class="warning-${w.severity}" data-artist="${w.detectedArtist || ''}"><strong>${w.field}:</strong> ${issue}</li>`;
        }).join('');
        
        // DEBUG: Log the actual HTML being generated
        console.log(`🔧 Generated HTML content (first 500 chars):`, warningItems.substring(0, 500));
        console.log(`🔧 Full HTML contains "clickable-artist":`, warningItems.includes('clickable-artist'));
         
        console.log(`🔧 Setting innerHTML for warnings element...`);
        
        // DEBUG: Check if clickable elements exist before setting innerHTML
        const existingClickableElements = document.querySelectorAll('.clickable-artist');
        console.log(`🔍 PRE-innerHTML: Found ${existingClickableElements.length} existing clickable elements`);
        
        warningsElement.innerHTML = `<ul>${warningItems}</ul>`;
        
        // DEBUG: Check if clickable elements exist after setting innerHTML
        const newClickableElements = document.querySelectorAll('.clickable-artist');
        console.log(`🔍 POST-innerHTML: Found ${newClickableElements.length} clickable elements`);
        
        console.log(`✅ Warnings HTML set, now adding click handlers...`);
         
        // ENHANCED: Add click-to-copy handlers for any artist names
        warnings.forEach((warning, index) => {
          if (warning.detectedArtist) {
            console.log(`🔗 Adding click handler for warning ${index + 1}, artist: ${warning.detectedArtist}`);
            const warningItem = warningsElement.querySelectorAll('li')[index];
            if (warningItem) {
              console.log(`✅ Found warning item element, setting up click handler`);
              this.addClickToCopyHandler(warningItem, warning.detectedArtist, warning);
              
              // ENHANCED: Add hover effects for better UX
              const clickableElements = warningItem.querySelectorAll('.clickable-artist');
              console.log(`🎨 Found ${clickableElements.length} clickable elements, adding hover effects`);
              
              clickableElements.forEach((element, elementIndex) => {
                console.log(`🎨 Setting up hover for clickable element ${elementIndex + 1}: "${element.textContent}"`);
                
                // Test click functionality immediately
                console.log(`🧪 Testing click functionality for element:`, element);
                
                element.addEventListener('mouseenter', () => {
                  element.style.color = '#0d47a1';
                });
                
                element.addEventListener('mouseleave', () => {
                  element.style.color = '#1976d2';
                });
              });
            } else {
              console.error(`❌ Could not find warning item element for index ${index}`);
            }
          }
        });
        
        console.log(`✅ All click handlers and hover effects added`);
        
        // IMMEDIATE TESTING: Test artist field detection and clickable elements
        setTimeout(() => {
          console.log('🧪 POST-DISPLAY TESTING...');
          this.testArtistFieldDetection();
          
          // Test if clickable elements are actually in the DOM
          const allClickableElements = document.querySelectorAll('.clickable-artist');
          console.log(`🔍 Found ${allClickableElements.length} clickable artist elements in DOM`);
          
          allClickableElements.forEach((element, index) => {
            console.log(`   ${index + 1}. Text: "${element.textContent}", Data-artist: "${element.getAttribute('data-artist')}"`);
          });
        }, 500);
         
      } else {
        warningsElement.innerHTML = '<p class="no-warnings">✓ Utmärkt katalogisering!</p>';
      }
    }
  }

  // Helper method to escape regex special characters
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  checkAndHideLoadingIndicator() {
    // Hide any loading indicators that might be active
    const loadingIndicators = document.querySelectorAll('.ai-loading-indicator');
    loadingIndicators.forEach(indicator => {
      indicator.style.display = 'none';
    });
  }

  extractCurrentWarnings() {
    // Extract current warnings from the DOM
    const warningsElement = document.querySelector('.quality-warnings ul');
    const warnings = [];
    
    if (warningsElement) {
      const warningItems = warningsElement.querySelectorAll('li');
      warningItems.forEach(item => {
        const strongElement = item.querySelector('strong');
        if (strongElement) {
          const field = strongElement.textContent.replace(':', '');
          const issue = item.textContent.replace(strongElement.textContent, '').trim();
          const severity = Array.from(item.classList)
            .find(cls => cls.startsWith('warning-'))
            ?.replace('warning-', '') || 'medium';
          
          warnings.push({ field, issue, severity });
        }
      });
    }
    
    return warnings;
  }

  showAILoadingIndicator(message = 'AI analysis in progress...') {
    // Create or update AI loading indicator
    let indicator = document.querySelector('.ai-analysis-loading');
    
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'ai-analysis-loading';
      indicator.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        font-weight: 500;
        max-width: 300px;
        backdrop-filter: blur(10px);
        animation: slideInRight 0.3s ease-out;
      `;
      
      // Add animation keyframes if not already present
      if (!document.getElementById('ai-loading-styles')) {
        const style = document.createElement('style');
        style.id = 'ai-loading-styles';
        style.textContent = `
          @keyframes slideInRight {
            from {
              transform: translateX(100%);
              opacity: 0;
            }
            to {
              transform: translateX(0);
              opacity: 1;
            }
          }
          
          @keyframes slideOutRight {
            from {
              transform: translateX(0);
              opacity: 1;
            }
            to {
              transform: translateX(100%);
              opacity: 0;
            }
          }
        `;
        document.head.appendChild(style);
      }
      
      document.body.appendChild(indicator);
    }
    
    indicator.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid white; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <span>${message}</span>
      </div>
    `;
    
    // Add spin animation if not already present
    if (!document.getElementById('ai-spin-styles')) {
      const style = document.createElement('style');
      style.id = 'ai-spin-styles';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
    
    indicator.style.display = 'block';
    this.aiAnalysisActive = true;
  }

  updateAILoadingMessage(message) {
    const indicator = document.querySelector('.ai-analysis-loading span');
    if (indicator) {
      indicator.textContent = message;
    }
  }

  hideAILoadingIndicator() {
    const indicator = document.querySelector('.ai-analysis-loading');
    if (indicator) {
      indicator.style.animation = 'slideOutRight 0.3s ease-in';
      setTimeout(() => {
        if (indicator.parentNode) {
          indicator.parentNode.removeChild(indicator);
        }
      }, 300);
    }
    this.aiAnalysisActive = false;
  }

  determineBestArtistForMarketAnalysis(data, aiArtist = null) {
    // PRIORITY ORDER for market analysis:
    // 1. AI-detected artist (highest priority if found)
    // 2. Artist field (if filled)
    // 3. Rule-based artist detection
    // 4. Brand detection from title/description
    // 5. Freetext search from title/description

    console.log('🎯 Determining best artist for market analysis...');
    console.log('📊 Available data:', { 
      artist: data.artist, 
      title: data.title?.substring(0, 80),
      aiArtist: aiArtist?.detectedArtist 
    });

    // 1. PRIORITY: AI-detected artist (most reliable)
    if (aiArtist && aiArtist.detectedArtist) {
      console.log('🤖 Using AI-detected artist for market analysis:', aiArtist.detectedArtist);
      return {
        artist: aiArtist.detectedArtist,
        source: 'ai_detected',
        confidence: aiArtist.confidence || 0.8,
        objectType: this.extractObjectType(data.title)
      };
    }

    // 2. Artist field (if filled and reasonable)
    if (data.artist && data.artist.trim().length > 2) {
      console.log('👤 Using artist field for market analysis:', data.artist);
      return {
        artist: data.artist.trim(),
        source: 'artist_field',
        confidence: 0.9,
        objectType: this.extractObjectType(data.title)
      };
    }

    // 3. Rule-based artist detection
    const ruleBasedArtist = this.detectMisplacedArtistRuleBased(data.title, data.artist);
    if (ruleBasedArtist && ruleBasedArtist.detectedArtist) {
      console.log('⚖️ Using rule-based detected artist for market analysis:', ruleBasedArtist.detectedArtist);
      return {
        artist: ruleBasedArtist.detectedArtist,
        source: 'rule_based',
        confidence: ruleBasedArtist.confidence || 0.7,
        objectType: this.extractObjectType(data.title)
      };
    }

    // 4. Brand detection (check for known brands/manufacturers)
    const brandDetection = this.detectBrandInTitle(data.title, data.description);
    if (brandDetection) {
      console.log('🏷️ Using brand detection for market analysis:', brandDetection.brand);
      return {
        artist: brandDetection.brand,
        source: 'brand_detected',
        confidence: brandDetection.confidence,
        isBrand: true,
        objectType: this.extractObjectType(data.title)
      };
    }

    // 5. FALLBACK: Freetext search from title/description
    const freetextTerms = this.extractFreetextSearchTerms(data.title, data.description);
    if (freetextTerms && freetextTerms.searchTerms.length > 0) {
      console.log('📝 Using freetext search terms for market analysis:', freetextTerms.combined);
      return {
        artist: freetextTerms.combined,
        source: 'freetext',
        confidence: freetextTerms.confidence,
        isFreetext: true,
        searchStrategy: freetextTerms.strategy,
        termCount: freetextTerms.searchTerms.length,
        objectType: this.extractObjectType(data.title)
      };
    }

    console.log('❌ No suitable artist or search terms found for market analysis');
    return null;
  }

  detectBrandInTitle(title, description) {
    // Known Swedish/Nordic brands and manufacturers common in auctions
    const knownBrands = [
      // Glass/Crystal
      { name: 'Orrefors', confidence: 0.85 },
      { name: 'Kosta', confidence: 0.85 },
      { name: 'Boda', confidence: 0.80 },
      { name: 'Iittala', confidence: 0.85 },
      { name: 'Nuutajärvi', confidence: 0.80 },
      
      // Ceramics/Porcelain
      { name: 'Gustavsberg', confidence: 0.85 },
      { name: 'Rörstrand', confidence: 0.85 },
      { name: 'Arabia', confidence: 0.85 },
      { name: 'Royal Copenhagen', confidence: 0.85 },
      { name: 'Bing & Grøndahl', confidence: 0.80 },
      
      // Furniture/Design
      { name: 'Lammhults', confidence: 0.75 },
      { name: 'Källemo', confidence: 0.75 },
      { name: 'Svenskt Tenn', confidence: 0.80 },
      
      // Silver/Jewelry
      { name: 'GAB', confidence: 0.80 },
      { name: 'Atelier Borgila', confidence: 0.75 }
    ];

    const text = `${title} ${description}`.toLowerCase();
    
    for (const brand of knownBrands) {
      if (text.includes(brand.name.toLowerCase())) {
        console.log(`🏷️ Brand detected: ${brand.name} (confidence: ${brand.confidence})`);
        return {
          brand: brand.name,
          confidence: brand.confidence
        };
      }
    }

    return null;
  }
  
  extractFreetextSearchTerms(title, description) {
    // Extract meaningful search terms for freetext market analysis
    const text = `${title} ${description}`.toLowerCase();
    const searchTerms = [];
    
    // Extract object type
    const objectType = this.extractObjectType(title);
    if (objectType) {
      searchTerms.push(objectType.toLowerCase());
    }
    
    // Extract materials
    const materials = this.searchTermExtractor.extractMaterials(text);
    if (materials.length > 0) {
      searchTerms.push(...materials.slice(0, 2)); // Top 2 materials
    }
    
    // Extract periods
    const periods = this.searchTermExtractor.extractPeriods(text);
    if (periods.length > 0) {
      searchTerms.push(periods[0]); // Most relevant period
    }
    
    // Extract styles
    const styles = this.searchTermExtractor.extractStyles(text);
    if (styles.length > 0) {
      searchTerms.push(styles[0]); // Most relevant style
    }
    
    // Only proceed if we have meaningful terms
    if (searchTerms.length < 2) {
      console.log('⚠️ Not enough meaningful terms for freetext search');
      return null;
    }
    
    // Filter duplicates and combine
    const uniqueTerms = [...new Set(searchTerms)];
    const combined = uniqueTerms.slice(0, 4).join(' '); // Max 4 terms
    
    // Calculate confidence based on term quality and count
    let confidence = 0.4; // Base confidence for freetext
    if (uniqueTerms.length >= 3) confidence += 0.2;
    if (materials.length > 0) confidence += 0.1;
    if (periods.length > 0) confidence += 0.1;
    
    console.log(`📝 Extracted freetext terms: "${combined}" (confidence: ${confidence})`);
    
    return {
      searchTerms: uniqueTerms,
      combined: combined,
      confidence: Math.min(0.8, confidence), // Cap at 0.8 for freetext
      strategy: 'extracted_terms'
    };
  }

  calculateCurrentQualityScore(data) {
    let score = 100;
    
    // Check if "Inga anmärkningar" is checked
    const noRemarksCheckbox = document.querySelector('input[type="checkbox"][value="Inga anmärkningar"]') || 
                              document.querySelector('input[type="checkbox"]#item_no_remarks') ||
                              document.querySelector('input[type="checkbox"][name*="no_remarks"]');
    const noRemarksChecked = noRemarksCheckbox && noRemarksCheckbox.checked;
    
    // Quick quality calculation (simplified version of analyzeQuality)
    const descLength = data.description.replace(/<[^>]*>/g, '').length;
    const condLength = data.condition.replace(/<[^>]*>/g, '').length;
    const keywordsLength = data.keywords.length;
    
    // Support both comma-separated and Auctionet space-separated formats
    const keywordCount = data.keywords ? 
      (data.keywords.includes(',') ? 
        data.keywords.split(',').filter(k => k.trim().length > 0).length :
        data.keywords.split(/\s+/).filter(k => k.trim().length > 0).length
      ) : 0;
    
    // Debug logging for calculateCurrentQualityScore
    console.log('calculateCurrentQualityScore keywords debug:', {
      keywords: data.keywords,
      keywordsLength: keywordsLength,
      keywordCount: keywordCount
    });
    
    if (data.title.length < 20) score -= 20;
    if (descLength < 50) score -= 25;
    
    // Skip condition scoring if "Inga anmärkningar" is checked
    if (!noRemarksChecked) {
      if (condLength < 20) score -= 20;
      if (data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) score -= 25; // Increased penalty
      
      // Check for other vague condition phrases
      const vaguePhrases = ['normalt slitage', 'vanligt slitage', 'åldersslitage'];
      const conditionText = data.condition.toLowerCase();
      const hasVaguePhrase = vaguePhrases.some(phrase => 
        conditionText.includes(phrase) && conditionText.replace(/<[^>]*>/g, '').trim().length < 30
      );
      
      if (hasVaguePhrase) score -= 15;
    }
    
    // Updated keyword scoring with more reasonable thresholds
    if (keywordsLength === 0 || !data.keywords || data.keywords.trim() === '') score -= 30;
    else if (keywordCount < 2) score -= 20;
    else if (keywordCount < 4) score -= 10;
    // 4-12 keywords = no penalty (sweet spot)
    else if (keywordCount > 12) score -= 15;
    
    if (!data.description.match(/\d+[\s,]*(x|cm|mm)/i)) score -= 20;
    
    return Math.max(0, score);
  }

  extractTechnique(title, description) {
    // Extract technique/method information from title and description
    const text = `${title} ${description}`.toLowerCase();
    
    // Common techniques in Swedish auction catalogs
    const techniques = [
      // Art techniques
      'olja på duk', 'olja på pannå', 'akvarell', 'tempera', 'gouache',
      'litografi', 'etsning', 'träsnitt', 'linoleum', 'serigrafi',
      'blandteknik', 'collage', 'pastell', 'kol', 'tusch',
      
      // Sculpture techniques  
      'brons', 'gjutjärn', 'marmor', 'granit', 'trä', 'terrakotta',
      'patinerad', 'förgylld', 'försilvrad',
      
      // Ceramics techniques
      'glaserad', 'oglaserad', 'stengods', 'lergods', 'porslin',
      'rakubränd', 'saltglaserad', 'raku',
      
      // Glass techniques
      'handblåst', 'pressglas', 'kristall', 'optiskt glas',
      'graverad', 'etsad', 'slipat',
      
      // Textile techniques
      'vävd', 'knuten', 'broderad', 'applikation', 'batik',
      'rölakan', 'gobeläng', 'flemväv',
      
      // Metalwork techniques
      'smitt', 'gjuten', 'driven', 'ciselerad', 'graverad',
      'emaljerad', 'förgylld', 'försilvrad'
    ];
    
    // Find the first matching technique
    for (const technique of techniques) {
      if (text.includes(technique)) {
        return technique;
      }
    }
    
    // No specific technique found
    return null;
  }

  // NEW: AI-ONLY search query generation for market analysis
  async determineBestSearchQueryForMarketAnalysis(data, aiArtist = null) {
    console.log('🤖 AI-ONLY: Determining optimal search query for market analysis...');
    console.log('📊 Input data:', { 
      title: data.title?.substring(0, 80),
      description: data.description?.substring(0, 100),
      artist: data.artist,
      aiArtist: aiArtist?.detectedArtist 
    });

    // Use AI-only SearchQuerySSoT if available
    if (this.searchQuerySSoT) {
      try {
        const result = await this.searchQuerySSoT.generateAndSetQuery(data.title, data.description, data.artist || '', aiArtist?.detectedArtist || '');
        
        if (result && result.success) {
          console.log('✅ AI-ONLY: Generated optimal search query:', result.query);
          console.log('🧠 AI reasoning:', result.reasoning);
          
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
        console.error('💥 AI-ONLY: Search query generation failed:', error);
      }
    }

    // Fallback: Use the old complex system if AI-only fails
    console.log('⚠️ AI-ONLY system unavailable, using legacy fallback...');
    return this.determineBestArtistForMarketAnalysis_LEGACY(data, aiArtist);
  }

  // LEGACY: Keep old method as fallback
  determineBestArtistForMarketAnalysis_LEGACY(data, aiArtist = null) {
    // PRIORITY ORDER for market analysis:
    // 1. AI-detected artist (highest priority if found)
    // 2. Artist field (if filled)
    // 3. Rule-based artist detection
    // 4. Brand detection from title/description
    // 5. Freetext search from title/description

    console.log('🎯 LEGACY: Determining best artist for market analysis...');
    console.log('📊 Available data:', { 
      artist: data.artist, 
      title: data.title?.substring(0, 80),
      aiArtist: aiArtist?.detectedArtist 
    });

    // 1. PRIORITY: AI-detected artist (most reliable)
    if (aiArtist && aiArtist.detectedArtist) {
      console.log('🤖 Using AI-detected artist for market analysis:', aiArtist.detectedArtist);
      return {
        artist: aiArtist.detectedArtist,
        source: 'ai_detected',
        confidence: aiArtist.confidence || 0.8,
        objectType: this.extractObjectType(data.title)
      };
    }

    // 2. Artist field (if filled and reasonable)
    if (data.artist && data.artist.trim().length > 2) {
      console.log('👤 Using artist field for market analysis:', data.artist);
      return {
        artist: data.artist.trim(),
        source: 'artist_field',
        confidence: 0.9,
        objectType: this.extractObjectType(data.title)
      };
    }

    // 3. Rule-based artist detection
    const ruleBasedArtist = this.detectMisplacedArtistRuleBased(data.title, data.artist);
    if (ruleBasedArtist && ruleBasedArtist.detectedArtist) {
      console.log('⚖️ Using rule-based detected artist for market analysis:', ruleBasedArtist.detectedArtist);
      return {
        artist: ruleBasedArtist.detectedArtist,
        source: 'rule_based',
        confidence: ruleBasedArtist.confidence || 0.7,
        objectType: this.extractObjectType(data.title)
      };
    }

    // 4. Brand detection (check for known brands/manufacturers)
    const brandDetection = this.detectBrandInTitle(data.title, data.description);
    if (brandDetection) {
      console.log('🏷️ Using brand detection for market analysis:', brandDetection.brand);
      return {
        artist: brandDetection.brand,
        source: 'brand_detected',
        confidence: brandDetection.confidence,
        isBrand: true,
        objectType: this.extractObjectType(data.title)
      };
    }

    // 5. FALLBACK: Freetext search from title/description
    const freetextTerms = this.extractFreetextSearchTerms(data.title, data.description);
    if (freetextTerms && freetextTerms.searchTerms.length > 0) {
      console.log('📝 Using freetext search terms for market analysis:', freetextTerms.combined);
      return {
        artist: freetextTerms.combined,
        source: 'freetext',
        confidence: freetextTerms.confidence,
        isFreetext: true,
        searchStrategy: freetextTerms.strategy,
        termCount: freetextTerms.searchTerms.length,
        objectType: this.extractObjectType(data.title)
      };
    }

    console.log('❌ No suitable artist or search terms found for market analysis');
    return null;
  }

  // Set SearchFilterManager reference and provide dependencies
  setSearchFilterManager(searchFilterManager) {
    this.searchFilterManager = searchFilterManager;
    
    // NEW: Provide SearchTermExtractor for extended term extraction
    if (this.searchTermExtractor) {
      this.searchFilterManager.setSearchTermExtractor(this.searchTermExtractor);
      console.log('✅ QualityAnalyzer: Provided SearchTermExtractor to SearchFilterManager for extended terms');
    }
    
    console.log('✅ QualityAnalyzer: SearchFilterManager connected');
  }

  // NEW: Test artist field detection for debugging
  testArtistFieldDetection() {
    console.log('🧪 TESTING artist field detection...');
    
    const artistFieldSelectors = [
      '#item_artist_name_sv',
      'input[name*="artist"]',
      'input[id*="artist"]',
      'input[placeholder*="konstnär"]',
      'input[placeholder*="artist"]'
    ];
    
    artistFieldSelectors.forEach((selector, index) => {
      const field = document.querySelector(selector);
      if (field) {
        console.log(`✅ Found artist field with selector ${index + 1}: ${selector}`);
        console.log(`   ID: ${field.id}`);
        console.log(`   Name: ${field.name}`);
        console.log(`   Value: "${field.value}"`);
        console.log(`   Element:`, field);
      } else {
        console.log(`❌ No field found with selector ${index + 1}: ${selector}`);
      }
    });
    
    // Also check all input fields on page
    const allInputs = document.querySelectorAll('input[type="text"]');
    console.log(`🔍 Found ${allInputs.length} text input fields on page:`);
    allInputs.forEach((input, index) => {
      if (input.id && (input.id.includes('artist') || input.name.includes('artist'))) {
        console.log(`   ${index + 1}. ID: ${input.id}, Name: ${input.name}, Value: "${input.value}"`);
      }
    });
  }
}
