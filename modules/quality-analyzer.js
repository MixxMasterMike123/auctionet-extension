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
    } else {

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
        console.error('❌ QualityAnalyzer: Dashboard manager or showDashboardLoading method not available!');
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
      console.error('❌ QualityAnalyzer: Failed to handle user selection update:', error);
    } finally {
      // Hide loading spinner
      if (this.salesAnalysisManager.dashboardManager && typeof this.salesAnalysisManager.dashboardManager.hideDashboardLoading === 'function') {
        this.salesAnalysisManager.dashboardManager.hideDashboardLoading();
      } else {
        console.error('❌ QualityAnalyzer: Dashboard manager or hideDashboardLoading method not available in finally!');
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
      // Optional checkbox - no logging needed
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

    // Check for keyword quality - more lenient approach for AI-generated content
    if (data.keywords) {
      const keywords = data.keywords.toLowerCase();
      const titleDesc = (data.title + ' ' + data.description + ' ' + data.condition).toLowerCase();

      // Split keywords by both comma and space (Auctionet format uses spaces)
      const keywordArray = data.keywords.includes(',') ?
        data.keywords.split(',').map(k => k.trim()).filter(k => k.length > 0) :
        data.keywords.split(/\s+/).map(k => k.trim()).filter(k => k.length > 0);

      const uniqueKeywords = keywordArray.filter(keyword => {
        const normalizedKeyword = keyword.toLowerCase().replace(/-/g, ' ');
        // More sophisticated duplicate detection
        return !titleDesc.includes(normalizedKeyword) &&
          !titleDesc.includes(keyword.toLowerCase()) &&
          keyword.length > 2; // Ignore very short words
      });

      const uniquePercentage = keywordArray.length > 0 ? uniqueKeywords.length / keywordArray.length : 0;



      // More lenient threshold - only flag if less than 20% are unique (was 40%)
      if (uniquePercentage < 0.2 && keywordArray.length > 3) {
        warnings.push({ field: 'Sökord', issue: 'Tips: Många sökord upprepar titel/beskrivning - kompletterande termer kan förbättra sökbarheten', severity: 'low' });
      }
    }

    // === FAQ GUIDELINE VALIDATION RULES ===
    const category = (data.category || '').toLowerCase();
    const titleLower = data.title.toLowerCase();
    const descPlain = data.description.replace(/<[^>]*>/g, '');
    const descLower = descPlain.toLowerCase();
    const condPlain = data.condition.replace(/<[^>]*>/g, '');
    const condLower = condPlain.toLowerCase();

    // --- Furniture: wood type in title ---
    if (category.includes('möbler')) {
      const woodTypes = ['furu', 'ek', 'björk', 'mahogny', 'teak', 'valnöt', 'alm', 'ask',
        'bok', 'tall', 'lönn', 'körsbär', 'palisander', 'jakaranda', 'rosewood',
        'bambu', 'rotting', 'ceder', 'cypress', 'gran', 'lärk', 'poppel', 'avenbok',
        'betsad', 'betsat', 'lackad', 'lackerat', 'fanér', 'fanerad'];
      const foundWood = woodTypes.find(w => {
        const regex = new RegExp(`\\b${w}\\b`, 'i');
        return regex.test(data.title);
      });
      if (foundWood) {
        warnings.push({ field: 'Titel', issue: `Möbler: "${foundWood}" (träslag/material) bör inte stå i titeln — flytta till beskrivningen`, severity: 'medium', source: 'faq', fieldId: 'item_title_sv' });
        score -= 10;
      }
    }

    // --- Rugs: measurements must be in title ---
    if (category.includes('matta') || category.includes('mattor')) {
      if (!this.hasMeasurements(data.title)) {
        warnings.push({ field: 'Titel', issue: 'Mattor: Mått ska alltid anges i titeln', severity: 'medium', source: 'faq', fieldId: 'item_title_sv' });
        score -= 10;
      }
    }

    // --- Art: condition must not say "bruksslitage" ---
    if (category.includes('konst') || category.includes('tavl') || category.includes('målning') ||
        category.includes('grafik') || category.includes('litografi')) {
      if (/bruksslitage/i.test(condPlain)) {
        warnings.push({ field: 'Kondition', issue: 'Konst: Använd "sedvanligt slitage" istället för "bruksslitage" — konst brukas inte', severity: 'high', source: 'faq', fieldId: 'item_condition_sv' });
        score -= 15;
      }
    }

    // --- Silver: weight should be in title ---
    if (category.includes('silver') && !category.includes('smycke')) {
      if (!/\b\d+\s*(gram|g)\b/i.test(data.title)) {
        warnings.push({ field: 'Titel', issue: 'Silver: Vikt bör anges sist i titeln', severity: 'low', source: 'faq', fieldId: 'item_title_sv' });
        score -= 5;
      }
    }

    // --- Dinner sets: "st" after numbers in description ---
    if (category.includes('servis')) {
      if (/\b\d+\s+st\b/i.test(descPlain)) {
        warnings.push({ field: 'Beskrivning', issue: 'Serviser: Skriv "34 tallrikar" inte "34 st tallrikar"', severity: 'medium', source: 'faq', fieldId: 'item_description_sv' });
        score -= 5;
      }
    }

    // --- General: compound object+material words in title ---
    const compoundWords = {
      'majolikavas': 'VAS, majolika', 'glasvas': 'VAS, glas', 'keramikvas': 'VAS, keramik',
      'silverring': 'RING, silver', 'guldring': 'RING, guld', 'silverkedja': 'KEDJA, silver',
      'kristallvas': 'VAS, kristall', 'porslinsvas': 'VAS, porslin', 'keramiktomte': 'TOMTE, keramik',
      'mässingsljusstake': 'LJUSSTAKE, mässing', 'tennmugg': 'MUGG, tenn'
    };
    for (const [compound, suggestion] of Object.entries(compoundWords)) {
      if (titleLower.includes(compound)) {
        warnings.push({ field: 'Titel', issue: `Sammansatt ord: "${data.title.match(new RegExp(compound, 'i'))?.[0]}" bör skrivas "${suggestion}"`, severity: 'medium', source: 'faq', fieldId: 'item_title_sv' });
        score -= 5;
        break;
      }
    }

    // --- General: "centimeter" instead of "cm" ---
    if (/centimeter/i.test(descPlain)) {
      warnings.push({ field: 'Beskrivning', issue: 'Skriv "cm" istället för "centimeter"', severity: 'low', source: 'faq', fieldId: 'item_description_sv' });
      score -= 3;
    }

    // --- General: "ca" before year ---
    if (/\bca\.?\s+\d{4}\b/.test(data.title) || /\bca\.?\s+\d{4}\b/.test(descPlain)) {
      const fieldId = /\bca\.?\s+\d{4}\b/.test(data.title) ? 'item_title_sv' : 'item_description_sv';
      const fieldName = fieldId === 'item_title_sv' ? 'Titel' : 'Beskrivning';
      warnings.push({ field: fieldName, issue: 'Använd "omkring" istället för "ca" framför årtal', severity: 'low', source: 'faq', fieldId });
      score -= 3;
    }

    // --- General: common abbreviations ---
    const allText = data.title + ' ' + descPlain + ' ' + condPlain;
    if (/\bbl\.?\s*a\b/i.test(allText)) {
      warnings.push({ field: 'Beskrivning', issue: 'Skriv "bland annat" istället för "bl a" — förkortningar försvårar översättning', severity: 'low', source: 'faq', fieldId: 'item_description_sv' });
      score -= 3;
    }
    if (/\bosv\b/i.test(allText)) {
      warnings.push({ field: 'Beskrivning', issue: 'Skriv "och så vidare" istället för "osv" — förkortningar försvårar översättning', severity: 'low', source: 'faq', fieldId: 'item_description_sv' });
      score -= 3;
    }

    // --- General: vague period/century expressions instead of specific decades ---
    const vagueperiodPattern = /\d{4}-talets\s+(första|andra|senare|mitt|mitten|början|slut)\s*(hälft|del|fjärdedel)?/i;
    const titlePeriodMatch = data.title.match(vagueperiodPattern);
    const descPeriodMatch = descPlain.match(vagueperiodPattern);
    if (titlePeriodMatch) {
      warnings.push({ field: 'Titel', issue: `Var mer specifik med ålder: "${titlePeriodMatch[0]}" — ange decennium om möjligt (t.ex. "1980-tal")`, severity: 'low', source: 'faq', fieldId: 'item_title_sv' });
      score -= 3;
    }
    if (descPeriodMatch) {
      warnings.push({ field: 'Beskrivning', issue: `Var mer specifik med ålder: "${descPeriodMatch[0]}" — ange decennium om möjligt (t.ex. "1980-tal")`, severity: 'low', source: 'faq', fieldId: 'item_description_sv' });
      score -= 3;
    }

    // === END FAQ GUIDELINE VALIDATION RULES ===

    // Render inline hints below fields for FAQ violations
    this.renderInlineHints(warnings);

    // Update UI with immediate results (no animation for initial display)
    this.updateQualityIndicator(score, warnings, false);

    // Now run AI artist detection asynchronously and update when complete (only if API is available)
    if (this.apiManager) {
      this.runAIArtistDetection(data, warnings, score);
    } else {

    }
  }

  async runAIArtistDetection(data, currentWarnings, currentScore) {
    // OPTIMIZATION: Skip AI analysis if artist field is filled AND no artist detected in title
    if (data.artist && data.artist.trim()) {
      console.log('⚡ Artist field filled, checking if title has misplaced artist:', data.artist);

      // Quick rule-based check if title contains artist names
      const titleHasArtist = this.detectMisplacedArtistRuleBased(data.title, data.artist);

      if (!titleHasArtist || !titleHasArtist.detectedArtist) {
        console.log('⚡ SKIPPING AI artist detection - artist correctly placed in field, no artist in title');

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
          console.error('❌ Brand validation failed:', error);
        } finally {
          this.pendingAnalyses.delete('brand');
          this.aiAnalysisActive = false;
          this.hideAILoadingIndicator();
        }

        return; // Skip the rest of AI artist detection
      } else {
        console.log('🔍 Artist field filled BUT title also contains artist - running AI analysis to suggest move');
      }
    }

    // Show initial AI loading indicator
    this.showAILoadingIndicator('🤖 Söker konstnärsnamn...');
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
      console.log('⏱️ Starting artist analysis with 5s timeout (Haiku optimized)...');
      const startTime = Date.now();
      const aiArtistForMarketAnalysis = await Promise.race([
        artistAnalysisPromise,
        new Promise(resolve => setTimeout(() => {
          console.log('⏰ Artist analysis timed out after 5s');
          resolve(null);
        }, 5000)) // 5s timeout - adjusted for real-world Haiku performance
      ]);
      const endTime = Date.now();
      console.log(`⏱️ Artist analysis completed in ${endTime - startTime}ms`);

      console.log('🎯 AI artist analysis result:', {
        hasResult: !!aiArtistForMarketAnalysis,
        detectedArtist: aiArtistForMarketAnalysis?.detectedArtist,
        confidence: aiArtistForMarketAnalysis?.confidence,
        foundIn: aiArtistForMarketAnalysis?.foundIn,
        fullResult: aiArtistForMarketAnalysis
      });

      // NEW: Handle brand validation in parallel
      this.updateAILoadingMessage('🏷️ Kontrollerar märkesnamn...');

      // CRITICAL FIX: Show artist detection UI for ALL detected artists, regardless of where found

      if (aiArtistForMarketAnalysis && aiArtistForMarketAnalysis.detectedArtist) {
        console.log('🎯 Entering artist detection UI flow...');



        // FIRST: Show the artist detection UI (this was missing!)
        await this.handleArtistDetectionResult(aiArtistForMarketAnalysis, data, currentWarnings, currentScore);

        // SECOND: Handle market analysis based on where artist was found
        if (aiArtistForMarketAnalysis.foundIn === 'title' || aiArtistForMarketAnalysis.foundIn === 'titel') {


          // Generate SSoT WITH the detected artist for comprehensive market analysis
          console.log('🔧 Debug - searchQuerySSoT:', !!this.searchQuerySSoT, 'searchFilterManager:', !!this.searchFilterManager);
          if (this.searchQuerySSoT && this.searchFilterManager) {

            // Extract candidate terms WITH the detected artist for market analysis
            console.log('🎯 Using AI-detected artist for market analysis:', aiArtistForMarketAnalysis.detectedArtist);
            let candidateSearchTerms = null;
            try {
              candidateSearchTerms = this.searchFilterManager.extractCandidateSearchTerms(
                data.title,
                data.description,
                { artist: aiArtistForMarketAnalysis.detectedArtist }, // Use AI-detected artist for market analysis
                aiArtistForMarketAnalysis.detectedArtist || '' // Pass AI-detected artist as context
              );
              console.log('🔍 Generated search terms:', candidateSearchTerms);
            } catch (error) {
              console.error('❌ Error in extractCandidateSearchTerms:', error);
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
                  console.error('❌ Comprehensive market analysis failed:', error);
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
                  console.error('❌ Full market analysis failed:', error);
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
        console.log('🚫 No artist detected or condition failed:', {
          hasResult: !!aiArtistForMarketAnalysis,
          detectedArtist: aiArtistForMarketAnalysis?.detectedArtist,
          condition1: !!aiArtistForMarketAnalysis,
          condition2: !!(aiArtistForMarketAnalysis?.detectedArtist)
        });
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
        console.error('❌ Brand validation failed:', error);
        this.pendingAnalyses.delete('brand');

        if (this.pendingAnalyses.size === 0) {
          this.hideAILoadingIndicator();
          this.aiAnalysisActive = false;
        }
      });

    } catch (error) {
      console.error('💥 AI Analysis Error:', error);
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
    console.log('🎨 handleArtistDetectionResult called with:', {
      hasAiArtist: !!aiArtist,
      detectedArtist: aiArtist?.detectedArtist,
      confidence: aiArtist?.confidence,
      foundIn: aiArtist?.foundIn,
      currentWarningsCount: currentWarnings?.length || 0
    });

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
      if (auctionetBio) {
        console.log(`✅ Found Auctionet biography for ${aiArtist.detectedArtist}:`, {
          years: auctionetBio.years,
          bioLength: auctionetBio.biography?.length,
          source: auctionetBio.source
        });
      } else {
        console.log(`ℹ️ No Auctionet biography found for ${aiArtist.detectedArtist}`);
      }
    } catch (error) {
      console.error(`❌ Error fetching Auctionet biography:`, error);
    }
    */
    let auctionetBio = null; // Disabled until API access

    // Create properly formatted warning for the existing display system (without button - we'll add it programmatically)
    // CRITICAL FIX: Create clean text message first, then add HTML elements programmatically to avoid data corruption
    const artistMessage = aiArtist.verification ?
      `AI upptäckte konstnär: "${aiArtist.detectedArtist}" (95% säkerhet) ✓ Verifierad konstnär (biografi tillgänglig) - flytta från ${aiArtist.foundIn || 'titel'} till konstnärsfält` :
      `AI upptäckte konstnär: "${aiArtist.detectedArtist}" (${Math.round(aiArtist.confidence * 100)}% säkerhet) - flytta från ${aiArtist.foundIn || 'titel'} till konstnärsfält`;


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

    console.log('🎨 Created artist warning:', {
      field: artistWarning.field,
      issue: artistWarning.issue?.substring(0, 100) + '...',
      detectedArtist: artistWarning.detectedArtist,
      isArtistWarning: artistWarning.isArtistWarning
    });

    // CRITICAL FIX: Don't add duplicate artist warnings
    const existingArtistWarningIndex = currentWarnings.findIndex(w => w.isArtistWarning);
    if (existingArtistWarningIndex >= 0) {
      currentWarnings[existingArtistWarningIndex] = artistWarning;
      console.log('🎨 Replaced existing artist warning at index:', existingArtistWarningIndex);
    } else {
      currentWarnings.unshift(artistWarning);
      console.log('🎨 Added new artist warning. Total warnings:', currentWarnings.length);
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

    if (!brandIssues || brandIssues.length === 0) {
      return {
        brandIssues: [],
        warnings: currentWarnings,
        score: currentScore
      };
    }



    // Convert brand issues to warnings
    for (const issue of brandIssues) {
      const brandWarning = this.brandValidationManager.generateBrandWarning(issue);

      // Check for existing brand warnings to avoid duplicates
      const existingBrandWarningIndex = currentWarnings.findIndex(w => w.isBrandWarning);
      if (existingBrandWarningIndex >= 0) {
        currentWarnings[existingBrandWarningIndex] = brandWarning;
      } else {
        currentWarnings.push(brandWarning);
      }
    }

    // Update quality display with animation after brand validation (recalculate score with latest data)
    const latestData = this.dataExtractor.extractItemData();
    const recalculatedScore = this.calculateCurrentQualityScore(latestData);
    this.updateQualityIndicator(recalculatedScore, currentWarnings, true);

    // Setup click handlers for brand corrections
    setTimeout(() => {
      this.setupBrandCorrectionHandlers();
    }, 100);


    return {
      brandIssues: brandIssues,
      warnings: currentWarnings,
      score: currentScore
    };
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
            <p><strong>Konstnär:</strong> ${artistName}</p>
            <p>Detta kommer att:</p>
            <ul>
              <li>✕ Ta bort varningen från kvalitetsindikatorn</li>
              <li>🔄 Köra ny AI-analys utan denna konstnär</li>
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
        clickableSpan.title = `Klicka för att flytta "${artistName}" till konstnärsfält. Håll muspekaren över för biografi.`;

        // Add biography hover functionality
        this.addBiographyHover(clickableSpan, artistName);

        // NEW: Use Biography Manager SSoT component for biography handling
        let biographySpan = null;
        const biography = this.biographyManager.extractBiography(warningData);
        if (biography) {
          // Create biography snippet using SSoT component
          biographySpan = this.biographyManager.createBiographySnippet(null, biography, artistName);
        }

        // Replace the quoted artist name in the text with the clickable element
        const textParts = originalText.split(`"${artistName}"`);
        if (textParts.length === 2) {
          issueSpan.innerHTML = '';
          issueSpan.appendChild(document.createTextNode(textParts[0]));
          issueSpan.appendChild(clickableSpan);
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
          console.error('❌ Error ignoring artist:', error);
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
  }

  // NEW: Setup click handlers for brand corrections
  setupBrandCorrectionHandlers() {
    const brandElements = document.querySelectorAll('.clickable-brand');

    brandElements.forEach(element => {
      if (element.dataset.handlerAttached) return; // Avoid duplicate handlers
      if (element.dataset.corrected === 'true') return; // Skip already corrected elements

      element.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const originalBrand = element.dataset.original;
        const suggestedBrand = element.dataset.suggested;

        try {
          // Get current form data
          const data = this.dataExtractor.extractItemData();

          // Replace brand in title
          const updatedTitle = data.title.replace(
            new RegExp(`\\b${this.escapeRegex(originalBrand)}\\b`, 'gi'),
            suggestedBrand
          );

          // Update title field using the same selectors as the rest of the system
          const titleFieldSelectors = [
            '#item_title_sv',
            '#item_title',
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

          if (!titleField) {
            console.error('❌ Could not find title field to update');
            this.showErrorFeedback(element, 'Kunde inte uppdatera titelfältet');
            return;
          }

          // Update the field
          titleField.value = updatedTitle;

          // Trigger change events
          try {
            titleField.dispatchEvent(new Event('input', { bubbles: true }));
            titleField.dispatchEvent(new Event('change', { bubbles: true }));
          } catch (eventError) {
            console.warn('⚠️ Event dispatch warning (non-critical):', eventError);
          }

          // SUCCESS - Visual feedback and state management
          try {
            // Visual feedback - mark as corrected
            element.style.backgroundColor = '#e8f5e8';
            element.innerHTML = `${suggestedBrand} ✓`;
            element.style.textDecoration = 'none';
            element.style.cursor = 'default';
            element.style.color = '#28a745';

            // Disable the entire warning item
            const warningItem = element.closest('li');
            if (warningItem) {
              warningItem.style.opacity = '0.6';
              warningItem.style.backgroundColor = '#f8f9fa';
              warningItem.style.border = '1px solid #e8f5e8';
              warningItem.style.borderRadius = '4px';
              warningItem.style.padding = '8px';
              warningItem.style.transition = 'all 0.3s ease';

              // Add a "corrected" indicator
              const correctedBadge = document.createElement('span');
              correctedBadge.innerHTML = ' <small style="color: #28a745; font-weight: 600;">✓ RÄTTAT</small>';
              warningItem.appendChild(correctedBadge);
            }

            // Mark element as handled to prevent future clicks
            element.dataset.corrected = 'true';

            // Success feedback
            this.showSuccessFeedback(element, `Märke rättat till "${suggestedBrand}"`);


          } catch (uiError) {
            console.warn('⚠️ UI feedback warning (non-critical):', uiError);
            // Still show success even if UI feedback fails
          }

          // Re-run analysis after a short delay (separate from UI to avoid blocking)
          try {
            setTimeout(() => {
              this.analyzeQuality();
            }, 500);
          } catch (analysisError) {
            console.warn('⚠️ Re-analysis scheduling warning (non-critical):', analysisError);
          }

        } catch (error) {
          console.error('❌ Critical error during brand correction:', error);
          this.showErrorFeedback(element, 'Fel vid rättning av märke');
        }
      });

      element.dataset.handlerAttached = 'true';
    });
  }

  // Helper method for success feedback
  showSuccessFeedback(element, message) {
    try {

      // Create success tooltip
      const tooltip = document.createElement('div');
      tooltip.className = 'brand-success-tooltip';
      tooltip.textContent = message;
      tooltip.style.cssText = `
        position: absolute;
        background: #28a745;
        color: white;
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
        z-index: 10000;
        white-space: nowrap;
        pointer-events: none;
        transform: translateY(-100%);
        margin-top: -8px;
        box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3);
        animation: fadeInSuccess 0.3s ease-out;
      `;

      // Add animation keyframes if not already present
      if (!document.getElementById('success-feedback-styles')) {
        const style = document.createElement('style');
        style.id = 'success-feedback-styles';
        style.textContent = `
          @keyframes fadeInSuccess {
            from { opacity: 0; transform: translateY(-100%) scale(0.8); }
            to { opacity: 1; transform: translateY(-100%) scale(1); }
          }
        `;
        document.head.appendChild(style);
      }

      // Ensure parent element can contain tooltip
      const parent = element.parentElement;
      if (parent) {
        const originalPosition = parent.style.position;
        parent.style.position = 'relative';
        parent.appendChild(tooltip);


        // Remove after 3 seconds
        setTimeout(() => {
          try {
            if (tooltip.parentElement) {
              tooltip.parentElement.removeChild(tooltip);
              // Restore original position if it was changed
              if (originalPosition) {
                parent.style.position = originalPosition;
              }
            }
          } catch (removeError) {
            console.warn('⚠️ Minor error removing success tooltip:', removeError);
          }
        }, 3000);
      } else {
        console.warn('⚠️ No parent element found for success tooltip');
      }

    } catch (error) {
      console.warn('⚠️ Error showing success feedback (non-critical):', error);
      // Fallback: log success to console
    }
  }

  // NEW: Trigger dashboard for non-art items (furniture, watches, etc.)
  async triggerDashboardForNonArtItems(data) {

    if (!this.searchQuerySSoT || !this.searchFilterManager || !this.apiManager || !this.salesAnalysisManager) {

      return;
    }

    try {
      // Generate candidate search terms for non-art items (no artist)

      const candidateSearchTerms = this.searchFilterManager.extractCandidateSearchTerms(
        data.title,
        data.description,
        '', // No artist for non-art items
        '' // No search query for initial extraction
      );

      if (candidateSearchTerms && candidateSearchTerms.candidates && candidateSearchTerms.candidates.length > 0) {

        // Initialize SSoT with non-art candidate terms
        this.searchQuerySSoT.initialize(
          candidateSearchTerms.currentQuery,
          candidateSearchTerms,
          'non_art_item'
        );


        // MARKET ANALYSIS: Trigger for non-art items (furniture, watches, etc.)

        const searchContext = this.searchQuerySSoT.buildSearchContext();

        // Trigger market analysis
        const salesData = await this.apiManager.analyzeSales(searchContext);

        if (salesData && salesData.hasComparableData) {

          // Add candidate terms to sales data for dashboard
          salesData.candidateSearchTerms = candidateSearchTerms;

          // Update dashboard with non-art results
          if (this.salesAnalysisManager.dashboardManager) {
            this.salesAnalysisManager.dashboardManager.addMarketDataDashboard(salesData, 'non_art_complete');
          }
        } else {


          // Still show dashboard even without market data - user can refine search terms
          if (this.salesAnalysisManager.dashboardManager && candidateSearchTerms) {

            // Create minimal sales data for dashboard display
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

      } else {

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


    clickableElements.forEach((element, index) => {

      element.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();


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
            console.error('❌ Artist field not found with any selector');
            this.showErrorFeedback(element, 'Konstnärsfält hittades inte');
            return;
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

          // Trigger form events to ensure proper validation and saving
          const events = ['input', 'change', 'blur'];
          events.forEach(eventType => {
            artistField.dispatchEvent(new Event(eventType, { bubbles: true }));
          });

          // Trigger quality re-analysis since adding an artist likely improves the score
          setTimeout(() => {
            this.analyzeQuality();
          }, 200);

          // CRITICAL FIX: Re-trigger market analysis when artist is moved to field
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
                  { updateDOMField: false }  // CRITICAL FIX: Don't update Hidden Keywords field
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
                } else {

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
        console.error('❌ Artist field not found with any selector');
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

          console.log('🎯 Title restructuring:', {
            original: originalTitle,
            cleaned: cleanedTitle,
            restructured: restructuredTitle
          });

          titleField.value = restructuredTitle;
          titleWasModified = true;

          // Trigger events for title field
          const titleEvents = ['input', 'change', 'blur'];
          titleEvents.forEach(eventType => {
            titleField.dispatchEvent(new Event(eventType, { bubbles: true }));
          });
        } else {

        }
      } else if (!titleField) {

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
            } else {

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
      console.error('❌ Failed to move artist name:', error);
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
      if (beforeReplace !== cleanedTitle) {

      }
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
        console.warn('⚠️ No API manager available, using AI title correction instead');
        // FALLBACK: Use AI title correction when rules system unavailable
        return await this.useAITitleCorrection(title);
      }

      console.log('🎯 Attempting to apply AI Rules System context rules...');

      // SIMPLIFIED APPROACH: Since AI title correction works perfectly, use that instead
      // The "AI-förbättra titel" button produces: "Skrivbord. "Modell 75", teak, Jun Møbelfabrik, Danmark"
      // which is exactly what we want when artist is in field

      return await this.useAITitleCorrection(title);

    } catch (error) {
      console.error('❌ Error applying artist field filled rules:', error);
      return title; // Return original title if rules application fails
    }
  }

  // Use AI title correction with artist field filled context rules
  async useAITitleCorrection(title) {
    try {
      console.log('🤖 Using AI title correction with artist field filled rules for:', title);

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
        console.log('✅ AI title correction result:', result.title);
        // Show success flash (same as "AI-förbättra titel" button)
        this.showTitleSuccessFlash();
        return result.title;
      } else {
        console.warn('⚠️ AI title correction failed, returning original');
        this.showTitleErrorFlash();
        return title;
      }

    } catch (error) {
      console.error('❌ AI title correction error:', error);
      // Remove loading spinner on error
      this.removeTitleLoadingSpinner();
      this.showTitleErrorFlash();
      return title;
    }
  }

  // Show loading spinner over title field (same as AI buttons)
  showTitleLoadingSpinner() {
    const targetField = document.querySelector('#item_title_sv');
    if (!targetField) return;

    // Remove any existing spinner
    this.removeTitleLoadingSpinner();

    // Find the field container
    let fieldContainer = targetField.parentElement;
    if (fieldContainer.classList.contains('ai-button-wrapper') || fieldContainer.tagName === 'LABEL') {
      fieldContainer = fieldContainer.parentElement;
    }

    // Add loading class to container
    fieldContainer.classList.add('field-loading');

    // Create spinner overlay
    const overlay = document.createElement('div');
    overlay.className = 'field-spinner-overlay title-correction-spinner';
    overlay.innerHTML = `
      <div class="ai-spinner"></div>
      <div class="ai-processing-text">AI förbättrar titel...</div>
    `;

    // Position overlay over the field
    const fieldRect = targetField.getBoundingClientRect();
    const containerRect = fieldContainer.getBoundingClientRect();

    overlay.style.position = 'absolute';
    overlay.style.top = `${fieldRect.top - containerRect.top}px`;
    overlay.style.left = `${fieldRect.left - containerRect.left}px`;
    overlay.style.width = `${fieldRect.width}px`;
    overlay.style.height = `${fieldRect.height}px`;
    overlay.style.backgroundColor = 'rgba(74, 144, 226, 0.9)';
    overlay.style.color = 'white';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.borderRadius = '4px';
    overlay.style.zIndex = '1000';

    // Add spinner styles
    const spinnerStyle = overlay.querySelector('.ai-spinner');
    if (spinnerStyle) {
      spinnerStyle.style.width = '20px';
      spinnerStyle.style.height = '20px';
      spinnerStyle.style.border = '2px solid rgba(255,255,255,0.3)';
      spinnerStyle.style.borderTop = '2px solid white';
      spinnerStyle.style.borderRadius = '50%';
      spinnerStyle.style.animation = 'spin 1s linear infinite';
      spinnerStyle.style.marginBottom = '8px';
    }

    // Add spin animation if not already present
    if (!document.getElementById('title-spinner-styles')) {
      const style = document.createElement('style');
      style.id = 'title-spinner-styles';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    fieldContainer.appendChild(overlay);
    console.log('🔄 Title loading spinner shown');
  }

  // Remove loading spinner from title field
  removeTitleLoadingSpinner() {
    const overlay = document.querySelector('.title-correction-spinner');
    if (overlay) {
      const container = overlay.parentElement;
      container.classList.remove('field-loading');
      overlay.remove();
      console.log('✅ Title loading spinner removed');
    }
  }

  // Show success flash on title field
  showTitleSuccessFlash() {
    const targetField = document.querySelector('#item_title_sv');
    if (targetField) {
      targetField.style.transition = 'background-color 0.3s ease';
      targetField.style.backgroundColor = '#d4edda';
      targetField.style.borderColor = '#28a745';

      setTimeout(() => {
        targetField.style.backgroundColor = '';
        targetField.style.borderColor = '';
      }, 2000);
    }
  }

  // Show error flash on title field
  showTitleErrorFlash() {
    const targetField = document.querySelector('#item_title_sv');
    if (targetField) {
      targetField.style.transition = 'background-color 0.3s ease';
      targetField.style.backgroundColor = '#f8d7da';
      targetField.style.borderColor = '#dc3545';

      setTimeout(() => {
        targetField.style.backgroundColor = '';
        targetField.style.borderColor = '';
      }, 3000);
    }
  }

  // NEW: Add click-to-move functionality for artist names (copy to artist field + remove from title)
  addClickToCopyHandler(warningElement, artistName, artistWarning = null) {
    const clickableElements = warningElement.querySelectorAll('.clickable-artist');


    clickableElements.forEach((element, index) => {

      element.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();


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
            console.error('❌ Artist field not found with any selector');
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

          // NEW: Update title field if we have a suggested title (remove artist from title)
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
            // ENHANCED: Use title cleanup utility as fallback when no suggestedTitle is available
            const cleanedTitle = cleanTitleAfterArtistRemoval(originalTitle, artistName);

            if (cleanedTitle !== originalTitle) {
              titleField.value = cleanedTitle;
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

          // CRITICAL FIX: Re-trigger market analysis when artist is moved to field
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
                  { updateDOMField: false }  // CRITICAL FIX: Don't update Hidden Keywords field
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
          const originalText = element.textContent;
          const originalColor = element.style.color;

          // Success indication shows MOVED not just added
          element.style.color = '#4caf50';
          element.textContent = titleWasModified ? '✓ Flyttad!' : '✓ Tillagd!';

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
            element.style.transition = 'all 0.3s ease';
            element.style.color = originalColor;
            element.textContent = originalText;

            // Reset field highlight
            artistField.style.backgroundColor = originalFieldBackground;
            artistField.style.border = originalFieldBorder;
          }, 2000);

          const actionText = titleField && artistWarning?.suggestedTitle ? 'moved to field and removed from title' : 'added to field';

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
      } else {
        console.warn(`Field not found for live monitoring: ${selector}`);
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
              console.log(`   - ${error.field}: "${error.original}" → "${error.suggested}" (${Math.round(error.confidence * 100)}%)`);
            });
          }
        }, 1000); // Wait for validation to complete

      } catch (error) {
        console.warn('⚠️ Failed to start inline brand validation:', error);
      }
    }

    // Test if fields exist right now


    // SAFETY CHECK: Ensure all necessary components are properly initialized
    // NOTE: Biography functionality now handled by BiographyTooltipManager SSoT component
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
    switch (fieldType) {
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

  updateQualityIndicator(score, warnings, shouldAnimate = false) {
    console.log('🔍 updateQualityIndicator called with:', {
      score,
      warningsCount: warnings?.length || 0,
      warnings: warnings?.map(w => ({ field: w.field, issue: w.issue?.substring(0, 50) + '...', isArtistWarning: w.isArtistWarning })) || []
    });

    // Create or update circular progress indicators using reusable component
    const qualityIndicator = document.querySelector('.quality-indicator');
    console.log('🔍 Quality indicator element found:', !!qualityIndicator);
    if (qualityIndicator) {
      this.circularProgressManager.createQualityCircles(qualityIndicator, score, warnings, shouldAnimate);
    }

    const warningsElement = document.querySelector('.quality-warnings');
    console.log('🔍 Warnings element found:', !!warningsElement);

    if (warningsElement) {
      if (warnings.length > 0) {
        const warningItems = warnings.map((w, warningIndex) => {
          let issue = w.issue;

          // SAFETY CHECK: Ensure issue exists
          if (!issue) {
            console.warn(`⚠️ Warning ${warningIndex + 1} has no issue text:`, w);
            issue = w.message || 'Ingen information tillgänglig';
          }

          // Build data attributes string
          let dataAttrs = '';
          if (w.dataAttributes) {
            Object.entries(w.dataAttributes).forEach(([key, value]) => {
              dataAttrs += ` ${key}="${value}"`;
            });
          }

          return `<li class="warning-${w.severity}" ${dataAttrs}>
            <strong>${w.field}:</strong> 
            <span class="issue-text">${issue}</span>
          </li>`;
        }).join('');

        warningsElement.innerHTML = `<ul>${warningItems}</ul>`;

        // Store warning data on DOM elements for handlers to access
        warnings.forEach((warning, index) => {
          const warningItem = warningsElement.querySelectorAll('li')[index];
          if (warningItem) {
            warningItem.warningData = warning; // Store the full warning data
          }
        });

        // Set up artist detection handlers after DOM is updated
        setTimeout(() => {
          this.setupIgnoreArtistHandlers();
        }, 100);
      } else {
        warningsElement.innerHTML = '<p class="no-warnings">✓ Utmärkt katalogisering!</p>';
      }
    }
  }



  /**
   * Render inline FAQ hints below form fields that have guideline violations.
   * Uses a warm amber style to be friendly and non-intrusive.
   */
  renderInlineHints(warnings) {
    const faqWarnings = warnings.filter(w => w.source === 'faq' && w.fieldId);

    // Group by fieldId
    const hintsByField = {};
    faqWarnings.forEach(w => {
      if (!hintsByField[w.fieldId]) hintsByField[w.fieldId] = [];
      hintsByField[w.fieldId].push(w);
    });

    // All field IDs that could have hints
    const allFieldIds = ['item_title_sv', 'item_description_sv', 'item_condition_sv', 'item_hidden_keywords'];

    allFieldIds.forEach(fieldId => {
      const field = document.querySelector(`#${fieldId}`);
      if (!field) return;

      // Find or remove existing hint container for this field
      const existingHint = field.parentNode.querySelector(`.faq-hint[data-for="${fieldId}"]`);

      if (!hintsByField[fieldId] || hintsByField[fieldId].length === 0) {
        // No warnings for this field — remove hint if it exists
        if (existingHint) existingHint.remove();
        return;
      }

      const hintsHtml = hintsByField[fieldId]
        .map(w => `<div style="padding:3px 8px;margin:2px 0;border-left:3px solid #f59e0b;background:#fffbeb;color:#92400e;font-size:11px;line-height:1.3;border-radius:0 3px 3px 0;font-style:italic;opacity:0.85;">⚠ ${w.issue}</div>`)
        .join('');

      if (existingHint) {
        // Update existing hint
        existingHint.innerHTML = hintsHtml;
      } else {
        // Create new hint container and insert it after the field
        const hintDiv = document.createElement('div');
        hintDiv.className = 'faq-hint';
        hintDiv.setAttribute('data-for', fieldId);
        hintDiv.style.cssText = 'margin:6px 0 6px 0;padding:0;';
        hintDiv.innerHTML = hintsHtml;

        // Insert after the field element, before the button wrapper
        field.parentNode.insertBefore(hintDiv, field.nextSibling);
      }
    });
  }

  // Helper method to escape regex special characters
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Add biography hover functionality to an element
   */
  addBiographyHover(element, artistName) {
    let biographyTooltip = null;
    let hoverTimeout = null;

    element.addEventListener('mouseenter', async () => {
      // Clear any existing timeout
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
      }

      // Delay showing tooltip to avoid flickering
      hoverTimeout = setTimeout(async () => {
        try {
          // Check if tooltip already exists
          if (biographyTooltip) {
            biographyTooltip.style.display = 'block';
            return;
          }

          // Fetch biography
          const biography = await this.fetchArtistBiography(artistName);
          if (biography) {
            // Create tooltip
            biographyTooltip = this.createBiographyTooltip(element, artistName, biography);
          }
        } catch (error) {
          console.log('⚠️ Could not fetch biography for hover:', error.message);
        }
      }, 800); // 800ms delay before showing
    });

    element.addEventListener('mouseleave', () => {
      // Clear timeout
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
      }

      // Hide tooltip with delay
      setTimeout(() => {
        if (biographyTooltip) {
          biographyTooltip.style.display = 'none';
        }
      }, 200);
    });
  }

  /**
   * Fetch artist biography (separate from modal version)
   */
  async fetchArtistBiography(artistName) {
    if (!this.apiManager?.apiKey) {
      return null;
    }

    const prompt = `Skriv en mycket kort biografi (max 100 ord) på svenska om konstnären "${artistName}". Fokusera på födelse/död, stil och 1-2 kända verk. Svara endast med biografin.`;

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiManager.apiKey,
          body: {
            model: 'claude-3-5-haiku-20241022', // Use fast Haiku for biography generation
            max_tokens: 150,
            temperature: 0.3,
            system: 'Du är en konstexpert. Skriv mycket korta biografier på svenska för tooltips.',
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
            reject(new Error('Biography fetch failed'));
          }
        });
      });

      if (response.success && response.data?.content?.[0]?.text) {
        return response.data.content[0].text;
      }
    } catch (error) {
      console.log('⚠️ Biography fetch failed:', error.message);
    }

    return null;
  }

  /**
   * Create biography tooltip
   */
  createBiographyTooltip(parentElement, artistName, biography) {
    const tooltip = document.createElement('div');
    tooltip.className = 'artist-biography-tooltip';
    tooltip.innerHTML = `
      <div class="tooltip-header">
        <strong>🎨 ${artistName}</strong>
      </div>
      <div class="tooltip-content">
        ${biography}
      </div>
    `;

    // Style the tooltip
    tooltip.style.cssText = `
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%) translateY(-8px);
      background: rgba(20, 20, 30, 0.95);
      backdrop-filter: blur(12px);
      color: white;
      padding: 12px 16px;
      border-radius: 12px;
      font-size: 13px;
      line-height: 1.5;
      width: 280px;
      white-space: normal;
      word-wrap: break-word;
      box-shadow: 
        0 4px 32px rgba(0, 0, 0, 0.12),
        0 2px 8px rgba(0, 0, 0, 0.08),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
      z-index: 99999;
      opacity: 0;
      visibility: hidden;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: none;
      margin-bottom: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-weight: 400;
      text-align: left;
      border: 1px solid rgba(255, 255, 255, 0.08);
    `;

    const header = tooltip.querySelector('.tooltip-header');
    header.style.cssText = `
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
      font-size: 14px;
    `;

    const content = tooltip.querySelector('.tooltip-content');
    content.style.cssText = `
      font-size: 12px;
      line-height: 1.4;
      color: rgba(255, 255, 255, 0.9);
    `;

    // Create arrow
    const arrow = document.createElement('div');
    arrow.style.cssText = `
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      border: 6px solid transparent;
      border-top-color: rgba(20, 20, 30, 0.95);
      margin-bottom: -6px;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
    `;
    tooltip.appendChild(arrow);

    // Add to parent and show
    parentElement.appendChild(tooltip);

    // Show with animation
    setTimeout(() => {
      tooltip.style.opacity = '1';
      tooltip.style.visibility = 'visible';
      tooltip.style.transform = 'translateX(-50%) translateY(-4px)';
    }, 100);

    return tooltip;
  }

  /**
   * Show artist biography modal
   */
  async showArtistBiography(artistName) {
    try {
      if (!this.apiManager?.apiKey) {
        alert('API-nyckel saknas för att hämta biografi');
        return;
      }

      const prompt = `Skriv en kort biografi (max 200 ord) på svenska om konstnären "${artistName}". Fokusera på viktiga datum, stil och kända verk. Svara endast med biografin, inga extra kommentarer.`;

      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiManager.apiKey,
          body: {
            model: this.apiManager.getCurrentModel().id,
            max_tokens: 300,
            temperature: 0.3,
            system: 'Du är en konstexpert. Skriv korta, faktabaserade biografier på svenska.',
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
            reject(new Error('Biography fetch failed'));
          }
        });
      });

      if (response.success && response.data?.content?.[0]?.text) {
        const biography = response.data.content[0].text;
        this.showBiographyModal(artistName, biography);
      }
    } catch (error) {
      console.error('❌ Error fetching biography:', error);
      alert('Kunde inte hämta biografi för ' + artistName);
    }
  }

  /**
   * Show biography in modal
   */
  showBiographyModal(artistName, biography) {
    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'artist-bio-modal-overlay';
    modal.innerHTML = `
      <div class="artist-bio-modal">
        <div class="artist-bio-header">
          <h3>🎨 ${artistName}</h3>
          <button class="close-bio-modal">&times;</button>
        </div>
        <div class="artist-bio-content">
          <p>${biography}</p>
          <div class="bio-actions">
            <button class="btn-add-bio-to-description">📝 Lägg till i beskrivning</button>
            <button class="btn-close-bio">Stäng</button>
          </div>
        </div>
      </div>
    `;

    // Add modal styles
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
      backdrop-filter: blur(4px);
    `;

    const modalContent = modal.querySelector('.artist-bio-modal');
    modalContent.style.cssText = `
      background: white;
      border-radius: 12px;
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    `;

    const header = modal.querySelector('.artist-bio-header');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px;
      border-bottom: 1px solid #eee;
      background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
      border-radius: 12px 12px 0 0;
    `;

    const closeBtn = modal.querySelector('.close-bio-modal');
    closeBtn.style.cssText = `
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #666;
      padding: 0;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    const content = modal.querySelector('.artist-bio-content');
    content.style.cssText = `padding: 20px;`;

    const actions = modal.querySelector('.bio-actions');
    actions.style.cssText = `
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      margin-top: 20px;
    `;

    const buttons = modal.querySelectorAll('.bio-actions button');
    buttons.forEach(btn => {
      btn.style.cssText = `
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s ease;
      `;
    });

    const addBtn = modal.querySelector('.btn-add-bio-to-description');
    addBtn.style.cssText += `background: #4caf50; color: white;`;

    const closeActionBtn = modal.querySelector('.btn-close-bio');
    closeActionBtn.style.cssText += `background: #f5f5f5; color: #333;`;

    document.body.appendChild(modal);

    // Add event listeners
    const closeButtons = modal.querySelectorAll('.close-bio-modal, .btn-close-bio');
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        document.body.removeChild(modal);
      });
    });

    const addToDescBtn = modal.querySelector('.btn-add-bio-to-description');
    addToDescBtn.addEventListener('click', () => {
      this.addBiographyToDescription(biography);
      document.body.removeChild(modal);
    });

    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
  }

  /**
   * Add biography to description field
   */
  addBiographyToDescription(biography) {
    const descriptionField = document.querySelector('#item_description_sv');
    if (descriptionField) {
      const currentDesc = descriptionField.value || '';
      const newDesc = currentDesc + (currentDesc ? '\n\n' : '') + biography;
      descriptionField.value = newDesc;
      descriptionField.dispatchEvent(new Event('input', { bubbles: true }));

      // Re-analyze quality
      setTimeout(() => this.analyzeQuality(), 500);
    }
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

    // 1. PRIORITY: AI-detected artist (most reliable)
    if (aiArtist && aiArtist.detectedArtist) {
      return {
        artist: aiArtist.detectedArtist,
        source: 'ai_detected',
        confidence: aiArtist.confidence || 0.8,
        objectType: this.extractObjectType(data.title)
      };
    }

    // 2. Artist field (if filled and reasonable)
    if (data.artist && data.artist.trim().length > 2) {
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
    console.log('🔍 Determining best search query for market analysis:', {
      title: data.title?.substring(0, 80),
      description: data.description?.substring(0, 100),
      artist: data.artist,
      aiArtist: aiArtist?.detectedArtist
    });

    // Use AI-only SearchQuerySSoT if available
    if (this.searchQuerySSoT) {
      try {
        const result = await this.searchQuerySSoT.generateAndSetQuery(
          data.title,
          data.description,
          data.artist || '',
          aiArtist?.detectedArtist || '',
          { updateDOMField: false }  // CRITICAL FIX: Don't update Hidden Keywords field during market analysis
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
        console.error('💥 AI-ONLY: Search query generation failed:', error);
      }
    }

    // Fallback: Use the old complex system if AI-only fails

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



    // 1. PRIORITY: AI-detected artist (most reliable)
    if (aiArtist && aiArtist.detectedArtist) {
      return {
        artist: aiArtist.detectedArtist,
        source: 'ai_detected',
        confidence: aiArtist.confidence || 0.8,
        objectType: this.extractObjectType(data.title)
      };
    }

    // 2. Artist field (if filled and reasonable)
    if (data.artist && data.artist.trim().length > 2) {
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


    return null;
  }

  // Set SearchFilterManager reference and provide dependencies
  setSearchFilterManager(searchFilterManager) {
    this.searchFilterManager = searchFilterManager;

    // NEW: Provide SearchTermExtractor for extended term extraction
    if (this.searchTermExtractor) {
      this.searchFilterManager.setSearchTermExtractor(this.searchTermExtractor);
    }

  }

  // Method to recalculate and update quality with animation (for field improvements)
  async recalculateQualityWithAnimation() {


    // Extract fresh data and current warnings
    const latestData = this.dataExtractor.extractItemData();
    const currentWarnings = this.extractCurrentWarnings();
    const newScore = this.calculateCurrentQualityScore(latestData);



    // Update with animation enabled
    this.updateQualityIndicator(newScore, currentWarnings, true);
  }

  async triggerMarketAnalysisWithExistingArtist(data) {


    if (this.searchQuerySSoT && this.searchFilterManager && data.artist) {
      try {
        // CRITICAL FIX: Quote-wrap artist field before passing to SSoT system
        const formattedArtist = this.formatAIDetectedArtistForSSoT(data.artist);


        // Extract candidate terms WITH properly formatted existing artist
        const candidateSearchTerms = this.searchFilterManager.extractCandidateSearchTerms(
          data.title,
          data.description,
          { artist: formattedArtist },
          formattedArtist
        );

        if (candidateSearchTerms && candidateSearchTerms.candidates && candidateSearchTerms.candidates.length > 0) {
          // Initialize SSoT with existing artist
          this.searchQuerySSoT.initialize(
            candidateSearchTerms.currentQuery,
            candidateSearchTerms,
            'existing_artist_field'
          );

          // Trigger market analysis with existing artist context
          if (this.apiManager) {
            const searchContext = this.searchQuerySSoT.buildSearchContext();

            const salesData = await this.apiManager.analyzeSales(searchContext);
            if (salesData && salesData.hasComparableData) {
              // Update dashboard with results
              if (this.salesAnalysisManager && this.salesAnalysisManager.dashboardManager) {
                this.salesAnalysisManager.dashboardManager.addMarketDataDashboard(salesData, 'existing_artist_field');
              }
            }
          }
        } else {

          await this.triggerDashboardForNonArtItems(data);
        }
      } catch (error) {
        console.error('❌ Market analysis with existing artist failed:', error);
        await this.triggerDashboardForNonArtItems(data);
      }
    } else {

      await this.triggerDashboardForNonArtItems(data);
    }
  }

  // NEW: Test artist field detection for debugging
  testArtistFieldDetection() {

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
        // Field found for debugging if needed
      }
    });

    // Also check all input fields on page
    const allInputs = document.querySelectorAll('input[type="text"]');
    allInputs.forEach((input, index) => {
      if (input.id && (input.id.includes('artist') || input.name.includes('artist'))) {
        // Log input details for debugging if needed
      }
    });
  }
}
