import { SearchTermExtractor } from "/modules/search-term-extractor.js";
import { ItemTypeHandlers } from "/modules/item-type-handlers.js";
import { SalesAnalysisManager } from "/modules/sales-analysis-manager.js";
import { DashboardManager } from './dashboard-manager.js';
import { SearchFilterManager } from './search-filter-manager.js';
// modules/quality-analyzer.js - Quality Analysis Module
export class QualityAnalyzer {
  constructor() {
    this.dataExtractor = null;
    this.apiManager = null;
    this.previousFreetextData = null;
    this.dashboardManager = new DashboardManager();
    this.searchFilterManager = new SearchFilterManager();
    this.searchTermExtractor = new SearchTermExtractor();
    this.itemTypeHandlers = new ItemTypeHandlers();
    this.salesAnalysisManager = new SalesAnalysisManager();
    
    // Inject dependencies
    this.itemTypeHandlers.setSearchTermExtractor(this.searchTermExtractor);
  }

  setDataExtractor(extractor) {
    this.dataExtractor = extractor;
    this.salesAnalysisManager.setDataExtractor(extractor);
  }

  setApiManager(apiManager) {
    this.apiManager = apiManager;
    this.salesAnalysisManager.setApiManager(apiManager);
    this.salesAnalysisManager.setDashboardManager(this.dashboardManager);
    this.dashboardManager.setApiManager(apiManager);
    // Pass dependencies to the search filter manager
    this.searchFilterManager.setQualityAnalyzer(this);
    this.searchFilterManager.setDashboardManager(this.dashboardManager);
    this.searchFilterManager.setApiManager(apiManager);
    this.searchFilterManager.setDataExtractor(this.dataExtractor);
  }

  // Helper method to check for measurements in Swedish format
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

  // Helper method to detect potential misplaced artist in title
  async detectMisplacedArtist(title, artistField) {
    // Only suggest if artist field is empty or very short
    if (artistField && artistField.trim().length > 2) {
      console.log('🚫 Artist detection skipped - artist field already has content:', artistField);
      return null; // Artist field already has content
    }

    if (!title || title.length < 10) {
      console.log('🚫 Artist detection skipped - title too short:', title);
      return null; // Title too short to contain artist
    }

    // Try AI-powered detection first (if API key available)
    if (this.apiManager) {
      console.log('🤖 Attempting AI artist detection for title:', title);
      try {
        const objectType = this.extractObjectType(title);
        console.log('📝 Extracted object type:', objectType);
        
        // Get description from current form data for AI analysis
        const descriptionField = document.querySelector('#item_description_sv');
        const description = descriptionField ? descriptionField.value : '';
        
        const aiResult = await this.apiManager.analyzeForArtist(title, objectType, artistField, description);
        console.log('🤖 AI artist analysis raw result:', aiResult);
        
        if (aiResult && aiResult.hasArtist && aiResult.confidence > 0.8) {
          console.log('✅ AI detected artist with high confidence:', aiResult);
          
          // Optionally verify the artist if artist info is enabled
          let verification = null;
          if (this.apiManager.enableArtistInfo && aiResult.artistName) {
            console.log('🔍 Verifying artist:', aiResult.artistName);
            const period = this.extractPeriod(title);
            verification = await this.apiManager.verifyArtist(aiResult.artistName, objectType, period);
            console.log('🔍 Artist verification result:', verification);
          }
          
          return {
            detectedArtist: aiResult.artistName,
            suggestedTitle: aiResult.suggestedTitle || this.generateSuggestedTitle(title, aiResult.artistName),
            confidence: aiResult.confidence,
            reasoning: aiResult.reasoning,
            verification: verification,
            source: 'ai'
          };
        } else if (aiResult) {
          console.log('⚠️ AI detected artist but confidence too low:', aiResult.confidence, 'for artist:', aiResult.artistName);
        } else {
          console.log('❌ AI artist analysis returned null');
        }
      } catch (error) {
        console.error('AI artist detection failed, falling back to rules:', error);
      }
    } else {
      console.log('❌ No API manager available for AI detection');
    }

    // Fallback to rule-based detection
    console.log('🔧 Using rule-based artist detection');
    return this.detectMisplacedArtistRuleBased(title, artistField);
  }

  // Helper method to extract object type from title
  extractObjectType(title) {
    // First try to match all caps object type (traditional format)
    let match = title.match(/^([A-ZÅÄÖÜ]+)/);
    if (match && match[1].length > 1) {
      console.log(`🔍 Found all-caps object type: "${match[1]}"`);
      return match[1];
    }
    
    // If no all-caps match, try to match capitalized word at start (like "Figurin")
    match = title.match(/^([A-ZÅÄÖÜ][a-zåäöü]+)/);
    if (match && match[1].length > 1) {
      console.log(`🔍 Found capitalized object type: "${match[1]}" -> converting to: "${match[1].toUpperCase()}"`);
      return match[1].toUpperCase(); // Convert to uppercase for consistency
    }
    
    console.log(`❌ No object type found in title: "${title}"`);
    return null;
  }

  // Helper method to extract period information from title
  extractPeriod(title) {
    const periodPatterns = [
      /(\d{4})/,                    // 1950
      /(\d{2,4}-tal)/,              // 1900-tal
      /(\d{2}\/\d{4}-tal)/,         // 17/1800-tal
      /(1[6-9]\d{2})/,              // 1600-1999
      /(20[0-2]\d)/                 // 2000-2029
    ];
    
    for (const pattern of periodPatterns) {
      const match = title.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }

  // Helper method to generate suggested title when AI doesn't provide one
  generateSuggestedTitle(originalTitle, artistName) {
    // Remove the artist name from the title
    const cleanedTitle = originalTitle
      .replace(new RegExp(`^${artistName.replace(/\s+/g, '\\s+')},?\\s*`, 'i'), '')
      .replace(new RegExp(`${artistName.replace(/\s+/g, '\\s+')}`, 'i'), '')
      .trim();
    
    return cleanedTitle || 'Titel utan konstnärsnamn';
  }

  // Rule-based artist detection (fallback method)
  detectMisplacedArtistRuleBased(title, artistField) {
    // PRIORITY CHECK: Artist name incorrectly placed at beginning of title in ALL CAPS
    // Pattern: "FIRSTNAME LASTNAME. Rest of title..." or "FIRSTNAME MIDDLE LASTNAME. Rest of title..."
    const allCapsArtistPattern = /^([A-ZÅÄÖÜ\s]{4,40})\.\s+(.+)/;
    const allCapsMatch = title.match(allCapsArtistPattern);
    
    if (allCapsMatch) {
      const [, potentialArtist, restOfTitle] = allCapsMatch;
      const cleanArtist = potentialArtist.trim();
      
      // Check if it looks like a person's name
      if (this.looksLikePersonName(cleanArtist)) {
        return {
          detectedArtist: cleanArtist,
          suggestedTitle: restOfTitle.trim(),
          confidence: 0.9, // High confidence for this clear pattern
          errorType: 'artist_in_title_caps',
          message: `Konstnärens namn "${cleanArtist}" bör flyttas från titeln till konstnärsfältet`
        };
      }
    }

    // Common Swedish auction title patterns where artist might be misplaced
    const patterns = [
      // NEW: OBJEKT, quantity, material, "design name" Artist Name, Manufacturer, Country (handles "SEJDLAR, 8 st, glas, "Droppring" Timo Sarpaneva, Iittala, Finland.")
      /^([A-ZÅÄÖÜ]+),\s*\d+\s*st,\s*[a-zåäöü]+,\s*"[^"]+"\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+),\s*(.+)/i,
      
      // NEW: OBJEKT, quantity, material, "design name" Firstname Middle Lastname, Manufacturer, Country (3-word artist version)
      /^([A-ZÅÄÖÜ]+),\s*\d+\s*st,\s*[a-zåäöü]+,\s*"[^"]+"\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+),\s*(.+)/i,
      
      // General malformed pattern: OBJEKT, details, "Title, Firstname Lastname (no closing quote) - MOVED UP for priority
      /^([A-ZÅÄÖÜ]+),\s*[^,]+,\s*"[^,]+,\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[a-zåäöü]+)(?:\s+[A-ZÅÄÖÜ][a-zåäöü]+)?/i,
      
      // NEW: OBJEKT, material, technique, Firstname Lastname, style (handles "TAVLA, olja på duk, Pablo Picasso, kubistisk stil")
      /^([A-ZÅÄÖÜ]+),\s*[a-zåäöü\s]+,\s*[a-zåäöü\s]+,\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+),\s*(.+)/i,
      
      // NEW: OBJEKT, material, technique, Firstname Middle Lastname, style (3-word version)
      /^([A-ZÅÄÖÜ]+),\s*[a-zåäöü\s]+,\s*[a-zåäöü\s]+,\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+),\s*(.+)/i,
      
      // NEW: OBJEKT, technique, Firstname Middle Lastname Company.measurements (handles "MATTA, rölakan, Anna Johanna Ångström Axeco.192 x 138 cm.")
      /^([A-ZÅÄÖÜ]+),\s*[a-zåäöü]+,\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+)\s+[A-ZÅÄÖÜ][a-zåäöü]+\.\d+/i,
      
      // NEW: OBJEKT, technique, Firstname Lastname Company.measurements (2-word version)
      /^([A-ZÅÄÖÜ]+),\s*[a-zåäöü]+,\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+)\s+[A-ZÅÄÖÜ][a-zåäöü]+\.\d+/i,
      
      // COMPOUND OBJEKT och OBJEKT, quantity description with embedded artist (NEW - handles "BÖCKER och LITOGRAFI, 3 st böcker Lennart Sand")
      /^([A-ZÅÄÖÜ]+\s+och\s+[A-ZÅÄÖÜ]+),\s*\d+\s+st\s+[a-zåäöü]+\s+([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+),\s*(.+)/i,
      
      // COMPOUND OBJEKT och OBJEKT, quantity description with embedded 3-word artist (NEW - handles 3-word names in compound objects)
      /^([A-ZÅÄÖÜ]+\s+och\s+[A-ZÅÄÖÜ]+),\s*\d+\s+st\s+[a-zåäöü]+\s+([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+),\s*(.+)/i,
      
      // OBJEKT, Firstname Lastname, "Title", details
      /^([A-ZÅÄÖÜ]+),\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+),\s*"([^"]+)"/i,
      
      // OBJEKT, Firstname Middle Lastname, "Title", details (NEW - 3 words)
      /^([A-ZÅÄÖÜ]+),\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+),\s*"([^"]+)"/i,
      
      // OBJEKT material, Firstname Lastname (dates), location. period (common format: POKAL silver, Lars Löfgren (1797-1853), Hudiksvall. 17/1800-tal.)
      /^([A-ZÅÄÖÜ]+)\s+[a-zåäöü]+,\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+)\s*(?:\([^)]+\))?,\s*(.+)/i,
      
      // OBJEKT material, Firstname Middle Lastname (dates), location. period (NEW - 3 words)
      /^([A-ZÅÄÖÜ]+)\s+[a-zåäöü]+,\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+)\s*(?:\([^)]+\))?,\s*(.+)/i,
      
      // OBJEKT, Firstname Lastname (dates), details
      /^([A-ZÅÄÖÜ]+),\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+)\s*(?:\([^)]+\))?,\s*(.+)/i,
      
      // OBJEKT, Firstname Middle Lastname (dates), details (NEW - 3 words)
      /^([A-ZÅÄÖÜ]+),\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+)\s*(?:\([^)]+\))?,\s*(.+)/i,
      
      // OBJEKT, material, Firstname Lastname, location, period (handles Eva Englund case)
      /^([A-ZÅÄÖÜ]+),\s*[a-zåäöü]+,\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+),\s*(.+)/i,
      
      // OBJEKT, material, Firstname Middle Lastname, location, period (NEW - handles Nils Petter Lindeberg case)
      /^([A-ZÅÄÖÜ]+),\s*[a-zåäöü]+,\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+),\s*(.+)/i,
      
      // OBJEKT, description, material, Firstname Lastname, location (NEW - handles "ett par" cases)
      /^([A-ZÅÄÖÜ]+),\s*[a-zåäöü\s]+,\s*[a-zåäöü]+,\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+),\s*(.+)/i,
      
      // OBJEKT, description, material, Firstname Middle Lastname, location (NEW - handles "ett par" + 3-word names)
      /^([A-ZÅÄÖÜ]+),\s*[a-zåäöü\s]+,\s*[a-zåäöü]+,\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+),\s*(.+)/i,
      
      // OBJEKT, Firstname Lastname, details (no quotes, no dates)
      /^([A-ZÅÄÖÜ]+),\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+),\s*([^,]+)/i,
      
      // OBJEKT, Firstname Middle Lastname, details (NEW - 3 words, no quotes, no dates)
      /^([A-ZÅÄÖÜ]+),\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+),\s*([^,]+)/i,
      
      // OBJEKT, Lastname Firstname, details
      /^([A-ZÅÄÖÜ]+),\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+),\s*(.+)/i
    ];

    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match) {
        let objectType, potentialArtist, rest;
        
        // Special handling for Axeco patterns (company attached to artist name)
        if (pattern.source.includes('Axeco') || pattern.source.includes('\\.\\d+')) {
          [, objectType, potentialArtist] = match;
          // Extract the rest by removing the matched part and extracting measurements
          const measurementMatch = title.match(/(\d+\s*[×x]\s*\d+\s*cm)/i);
          const technique = title.match(/,\s*([a-zåäöü]+),/i);
          
          if (measurementMatch && technique) {
            rest = `${technique[1]}, ${measurementMatch[1]}`;
          } else if (measurementMatch) {
            rest = measurementMatch[1];
          } else {
            rest = 'detaljer';
          }
        }
        // Handle different pattern structures
        else if (match.length === 4 && match[3]) {
          // Standard patterns: [full, objectType, artist, rest]
          [, objectType, potentialArtist, rest] = match;
        } else if (match.length === 4 && match[2] && match[3]) {
          // Malformed quote patterns: [full, objectType, firstName, lastName]
          [, objectType, , ] = match;
          potentialArtist = `${match[2]} ${match[3]}`;
          rest = title.replace(new RegExp(`^${objectType},\\s*[^,]+,\\s*"[^,]+,\\s*${potentialArtist.replace(/\s+/g, '\\s+')}.*`), '').trim();
          if (!rest) rest = 'detaljer'; // fallback
        } else if (match.length === 3) {
          // Alternative malformed pattern: [full, objectType, artist]
          [, objectType, potentialArtist] = match;
          rest = title.replace(new RegExp(`^${objectType},\\s*[^"]*,\\s*"[^,]*,\\s*${potentialArtist.replace(/\s+/g, '\\s+')}.*`), '').trim();
          if (!rest) rest = 'detaljer'; // fallback
        } else {
          continue; // Skip if pattern structure is unexpected
        }
        
        // Check if it looks like a person's name (not place/concept)
        if (this.looksLikePersonName(potentialArtist)) {
          return {
            detectedArtist: potentialArtist.trim(),
            suggestedTitle: `${objectType}, ${rest}`.trim(),
            confidence: this.calculateArtistConfidence(potentialArtist, objectType)
          };
        }
      }
    }

    return null;
  }

  // Helper method to determine if a string looks like a person's name
  looksLikePersonName(name) {
    if (!name || typeof name !== 'string') {
      return false;
    }

    const trimmedName = name.trim();
    
    // Standard name validation (existing logic)
    // Must be two or three words (firstname lastname OR firstname middle lastname)
    const words = trimmedName.split(/\s+/);
    if (words.length < 2 || words.length > 3) {
      return false;
    }

    // All words should be reasonable length
    if (words.some(word => word.length < 2)) {
      return false;
    }

    // All words should start with capital letter (first name and last name must start with capital, middle name can start with capital or lowercase for Swedish naming)
    const [first, middle, last] = words;
    
    if (words.length === 2) {
      // Two words: first name must start with capital, last name can start with capital or lowercase (Swedish naming)
      if (!/^[A-ZÅÄÖÜ]/.test(first) || !/^[A-ZÅÄÖÜa-zåäöü]/.test(last)) {
        return false;
      }
    } else if (words.length === 3) {
      // Three words: first and last must start with capital, middle can be capital or lowercase
      if (!/^[A-ZÅÄÖÜ]/.test(first) || !/^[A-ZÅÄÖÜa-zåäöü]/.test(middle) || !/^[A-ZÅÄÖÜa-zåäöü]/.test(last)) {
        return false;
      }
    }

    // Exclude common non-person terms that might appear in titles
    const excludeTerms = [
      // Places
      'Stockholm', 'Göteborg', 'Malmö', 'Uppsala', 'Västerås', 'Örebro', 'Linköping',
      'Helsingborg', 'Jönköping', 'Norrköping', 'Lund', 'Umeå', 'Gävle', 'Borås',
      
      // Historical figures (subjects, not artists)
      'Napoleon Bonaparte', 'Gustav Vasa', 'Carl Gustaf', 'Victoria Bernadotte',
      
      // Companies/Manufacturers
      'Gustavsberg Porslin', 'Rörstrand Porcelain', 'Orrefors Glasbruk', 'Kosta Boda',
      'Arabia Finland', 'Royal Copenhagen', 'Bing Grondahl',
      
      // Common object descriptions that might look like names
      'Art Deco', 'Art Nouveau', 'Louis Philippe', 'Carl Johan', 'Gustav III',
      
      // Design periods/styles
      'Jugend Stil', 'Empire Stil', 'Rokoko Stil', 'Barock Stil'
    ];

    // Check if the full name matches any exclude terms
    if (excludeTerms.some(term => term.toLowerCase() === trimmedName.toLowerCase())) {
      return false;
    }

    // Check individual words against common non-name terms
    const nonNameWords = [
      'Stockholm', 'Göteborg', 'Malmö', 'Gustavsberg', 'Rörstrand', 'Orrefors', 
      'Kosta', 'Arabia', 'Royal', 'Napoleon', 'Gustav', 'Carl', 'Louis', 'Empire',
      // Company/Manufacturer names that might appear after artist names
      'Ikea', 'IKEA', 'Tenn', 'Lammhults', 'Källemo', 'Mathsson', 'Malmsten', 
      'Boda', 'Artek', 'Iittala', 'Grondahl', 'Axeco',
      // Common descriptive terms that appear in figurine/sculpture titles
      'Kvinna', 'Man', 'Flicka', 'Pojke', 'Barn', 'Dame', 'Herre', 'Fru', 'Herr',
      'Kvinna', 'Kvinnor', 'Män', 'Flickor', 'Pojkar', 'Damer', 'Herrar',
      // Common prepositions and descriptive words
      'med', 'och', 'vid', 'på', 'under', 'över', 'utan', 'för', 'till', 'från',
      'som', 'av', 'i', 'ur', 'mot', 'genom', 'mellan', 'bland', 'hos', 'åt',
      // Common object/animal terms in figurine descriptions
      'hundar', 'katter', 'hästar', 'fåglar', 'blommor', 'träd', 'hus', 'båt',
      'bil', 'cykel', 'stol', 'bord', 'vas', 'skål', 'fat', 'kopp', 'glas'
    ];

    if (words.some(word => 
      nonNameWords.some(term => word.toLowerCase() === term.toLowerCase())
    )) {
      return false;
    }

    // Additional check: reject phrases that contain common descriptive patterns
    const descriptivePatterns = [
      /kvinna\s+med/i,     // "Kvinna med" (Woman with)
      /man\s+med/i,        // "Man med" (Man with)
      /flicka\s+med/i,     // "Flicka med" (Girl with)
      /pojke\s+med/i,      // "Pojke med" (Boy with)
      /barn\s+med/i,       // "Barn med" (Child with)
      /dame\s+med/i,       // "Dame med" (Lady with)
      /herre\s+med/i,      // "Herre med" (Gentleman with)
      /\w+\s+och\s+\w+/i,  // "Something och Something" (Something and Something)
      /\w+\s+vid\s+\w+/i,  // "Something vid Something" (Something at Something)
      /\w+\s+på\s+\w+/i,   // "Something på Something" (Something on Something)
      /\w+\s+under\s+\w+/i // "Something under Something" (Something under Something)
    ];

    if (descriptivePatterns.some(pattern => trimmedName.match(pattern))) {
      return false;
    }

    return true;
  }

  // Helper method to calculate confidence in artist detection
  calculateArtistConfidence(artistName, objectType) {
    let confidence = 0.7; // Base confidence

    // Higher confidence for certain object types commonly associated with artists
    const artistObjectTypes = ['TAVLA', 'MÅLNING', 'AKVARELL', 'LITOGRAFI', 'ETSNING', 'SKULPTUR', 'TECKNING'];
    if (artistObjectTypes.some(type => objectType.toUpperCase().includes(type))) {
      confidence += 0.2;
    }

    // Lower confidence for object types that might have designer names legitimately in title
    const designerObjectTypes = ['STOL', 'BORD', 'LAMPA', 'VAS', 'SKÅL', 'FAT'];
    if (designerObjectTypes.some(type => objectType.toUpperCase().includes(type))) {
      confidence -= 0.3;
    }

    return Math.max(0.1, Math.min(0.9, confidence));
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

    // Add immediate rule-based artist detection
    const ruleBasedArtist = this.detectMisplacedArtistRuleBased(data.title, data.artist);
    if (ruleBasedArtist) {
      let warningMessage;
      let severity = 'medium';
      
      if (ruleBasedArtist.errorType === 'artist_in_title_caps') {
        warningMessage = `FELAKTIG PLACERING: "<strong>${ruleBasedArtist.detectedArtist}</strong>" ska flyttas till konstnärsfältet. Föreslagen titel: "${ruleBasedArtist.suggestedTitle}"`;
        severity = 'high';
      } else {
        warningMessage = `Möjlig konstnär upptäckt: "<strong>${ruleBasedArtist.detectedArtist}</strong>" - kontrollera om den ska flyttas till konstnärsfält`;
      }
      
      warnings.push({ 
        field: 'Titel', 
        issue: warningMessage, 
        severity: severity,
        detectedArtist: ruleBasedArtist.detectedArtist // Add for click-to-copy
      });
      score -= (severity === 'high' ? 20 : 10);
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
      
      // SMART APPROACH: Always try to find the best artist for market analysis
      // First, check if we have an immediate artist (from field or rule-based detection)
      const immediateArtist = this.determineBestArtistForMarketAnalysis(data);
      
      // Start artist detection (for quality warnings)
      const artistAnalysisPromise = this.detectMisplacedArtist(data.title, data.artist);
      
      // Handle artist detection results as soon as they're ready
      artistAnalysisPromise.then(aiArtist => {
        this.pendingAnalyses.delete('artist');
        this.handleArtistDetectionResult(aiArtist, data, currentWarnings, currentScore);
        
        // PRIORITY FIX: If AI found an artist, use it for market analysis (cancel any existing freetext analysis)
        if (aiArtist && aiArtist.detectedArtist) {
          console.log('🎯 AI detected artist - prioritizing over any previous analysis:', aiArtist.detectedArtist);
          console.log('🛑 IMMEDIATELY clearing any existing market dashboards for artist replacement');
          
          // CRITICAL: Clear any existing market data dashboard immediately
          const existingDashboard = document.querySelector('.market-data-dashboard');
          if (existingDashboard) {
            console.log('🗑️ Removing existing freetext dashboard to replace with artist analysis');
            existingDashboard.remove();
          }
          
          // Cancel and clear any pending dashboard updates from freetext analysis
          if (this.pendingDashboardUpdate) {
            console.log('⏹️ Cancelling pending freetext dashboard update');
            clearTimeout(this.pendingDashboardUpdate);
            this.pendingDashboardUpdate = null;
          }
          
          // Clear any cached freetext data that might interfere
          this.previousFreetextData = null;
          
          // Create artist info object for market analysis
          const aiArtistInfo = {
            artist: aiArtist.detectedArtist,
            source: aiArtist.source || 'ai_detected',
            confidence: aiArtist.confidence || 0.8
          };
          
          console.log('💰 Starting PRIORITY sales analysis with AI-detected artist:', aiArtistInfo);
          this.pendingAnalyses.add('sales');
          this.updateAILoadingMessage(`💰 Analyserar marknadsvärde för ${aiArtist.detectedArtist}...`);
          this.salesAnalysisManager.startSalesAnalysis(aiArtistInfo, data, currentWarnings, currentScore, this.searchFilterManager, this);
        } else {
          // No AI artist found, fall back to best available option
        const bestArtist = this.determineBestArtistForMarketAnalysis(data, aiArtist);
        
        if (bestArtist) {
            console.log('💰 Starting sales analysis with best available artist/search:', bestArtist);
          this.pendingAnalyses.add('sales');
          this.updateAILoadingMessage('💰 Analyserar marknadsvärde...');
          this.salesAnalysisManager.startSalesAnalysis(bestArtist, data, currentWarnings, currentScore, this.searchFilterManager, this);
        } else {
          console.log('ℹ️ No artist found for sales analysis');
          this.checkAndHideLoadingIndicator();
          }
        }
      }).catch(error => {
        console.error('Error in AI artist detection:', error);
        this.pendingAnalyses.delete('artist');
        
        // Even if AI detection fails, try market analysis with immediate artist
        if (immediateArtist) {
          console.log('💰 AI failed, but starting sales analysis with immediate artist:', immediateArtist);
          this.pendingAnalyses.add('sales');
          this.updateAILoadingMessage('💰 Analyserar marknadsvärde...');
          this.salesAnalysisManager.startSalesAnalysis(immediateArtist, data, currentWarnings, currentScore, this.searchFilterManager, this);
        } else {
          this.checkAndHideLoadingIndicator();
        }
      });

      // CONDITIONAL IMMEDIATE ANALYSIS: Only start immediate analysis if we have a high-confidence artist or brand
      if (immediateArtist && (immediateArtist.source === 'artist_field' || immediateArtist.confidence > 0.8 || immediateArtist.isBrand)) {
        console.log('💰 Starting immediate sales analysis with high-confidence artist/brand:', immediateArtist);
        this.pendingAnalyses.add('sales');
        
        // Set appropriate loading message based on analysis type
        let loadingMessage = '💰 Analyserar marknadsvärde...';
        if (immediateArtist.isBrand) {
          loadingMessage = `💰 Analyserar marknadsvärde för ${immediateArtist.artist}...`;
        } else if (immediateArtist.isFreetext) {
          loadingMessage = `🔍 Söker jämförbara objekt: "${immediateArtist.artist}"...`;
        } else {
          loadingMessage = `💰 Analyserar marknadsvärde för ${immediateArtist.artist}...`;
        }
        
        this.updateAILoadingMessage(loadingMessage);
        this.salesAnalysisManager.startSalesAnalysis(immediateArtist, data, currentWarnings, currentScore, this.searchFilterManager, this);
      } else {
        console.log('⏳ Waiting for AI artist detection before starting market analysis (no high-confidence immediate artist found)');
      }

    } catch (error) {
      console.error('Error in AI analysis setup:', error);
      this.aiAnalysisActive = false;
      this.hideAILoadingIndicator();
    }
  }

  async handleArtistDetectionResult(aiArtist, data, currentWarnings, currentScore) {
    console.log('🎯 Handling artist detection result:', aiArtist);
    
    // Check if aiArtist is null or undefined
    if (!aiArtist || !aiArtist.detectedArtist) {
      console.log('⚠️ No valid artist detection result, skipping artist warning');
      return {
        detectedArtist: null,
        warnings: currentWarnings,
        score: currentScore
      };
    }
    
    // Create properly formatted warning for the existing display system
    const artistMessage = aiArtist.verification ? 
      `AI upptäckte konstnär: "<strong>${aiArtist.detectedArtist}</strong>" (${Math.round(aiArtist.confidence * 100)}% säkerhet) ✓ Verifierad konstnär (${aiArtist.verification.biography.substring(0, 80)}...) - flytta från ${aiArtist.foundIn || 'titel'} till konstnärsfält` :
      `AI upptäckte konstnär: "<strong>${aiArtist.detectedArtist}</strong>" (${Math.round(aiArtist.confidence * 100)}% säkerhet) - flytta från ${aiArtist.foundIn || 'titel'} till konstnärsfält`;

    // Insert artist warning at the beginning since it's important info
    currentWarnings.unshift({
        field: 'Titel', 
      issue: artistMessage,
      severity: 'medium',
      detectedArtist: aiArtist.detectedArtist, // For click-to-copy functionality
      suggestedTitle: aiArtist.suggestedTitle,
      suggestedDescription: aiArtist.suggestedDescription,
      foundIn: aiArtist.foundIn
    });

    // Update quality display immediately and ensure it's visible
    this.updateQualityIndicator(currentScore, currentWarnings);
      console.log('✅ Artist detection results displayed');
    
    // Add small delay to ensure the warning is visible before market analysis continues
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      detectedArtist: aiArtist.detectedArtist,
      warnings: currentWarnings,
      score: currentScore
    };
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

  // NEW: Add click-to-copy functionality for artist names
  addClickToCopyHandler(warningElement, artistName) {
    const clickableElements = warningElement.querySelectorAll('.clickable-artist');
    
    clickableElements.forEach(element => {
      element.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        try {
          await navigator.clipboard.writeText(artistName);
          
          // Visual feedback - success
          const originalText = element.textContent;
          const originalBackground = element.style.background;
          const originalColor = element.style.color;
          
          element.style.background = '#4caf50';
          element.style.color = 'white';
          element.textContent = '✓ Kopierat!';
          element.style.transform = 'scale(1.05)';
          
          // Reset after 1.5 seconds
          setTimeout(() => {
            element.style.background = originalBackground;
            element.style.color = originalColor;
            element.textContent = originalText;
            element.style.transform = 'scale(1)';
          }, 1500);
          
          console.log(`📋 Artist name copied to clipboard: ${artistName}`);
          
        } catch (error) {
          console.error('Failed to copy artist name:', error);
          
          // Visual feedback - error
          const originalBackground = element.style.background;
          element.style.background = '#f44336';
          element.style.color = 'white';
          
          setTimeout(() => {
            element.style.background = originalBackground;
            element.style.color = '#2196f3';
          }, 1000);
          
          // Fallback - select text for manual copy
          this.selectTextForManualCopy(element, artistName);
        }
      });
    });
  }

  // Fallback method for manual text selection if clipboard API fails
  selectTextForManualCopy(element, artistName) {
    try {
      // Clear any existing selection
      window.getSelection()?.removeAllRanges();
      
      const range = document.createRange();
      range.selectNodeContents(element);
      
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      
      console.log('🎯 Manual text selection successful for:', artistName);
      
      // Optional: Show a temporary visual feedback
      element.style.backgroundColor = '#E3F2FD';
      setTimeout(() => {
        element.style.backgroundColor = '';
      }, 1000);
      
    } catch (error) {
      console.error('❌ Manual text selection failed:', error);
    }
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
        const warningItems = warnings.map(w => {
          let issue = w.issue;
          
          // ENHANCED: Make artist names clickable for copy functionality
          if (w.detectedArtist) {
            // Replace the artist name in quotes with a clickable version (handle both with and without <strong> tags)
            const escapedArtist = w.detectedArtist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // Try both patterns: with <strong> tags and without
            const strongPattern = new RegExp(`"<strong>${escapedArtist}</strong>"`, 'g');
            const plainPattern = new RegExp(`"${escapedArtist}"`, 'g');
            
            // Replace with clickable version
            const clickableReplacement = `"<span class="clickable-artist" style="color: #2196f3; cursor: pointer; text-decoration: underline; font-weight: 600; transition: all 0.2s ease;" title="Klicka för att kopiera konstnärsnamnet">${w.detectedArtist}</span>"`;
            
            // First try to replace the pattern with <strong> tags
            if (strongPattern.test(issue)) {
              issue = issue.replace(strongPattern, clickableReplacement);
            } else {
              // Fallback to pattern without <strong> tags
              issue = issue.replace(plainPattern, clickableReplacement);
            }
          }
          
          return `<li class="warning-${w.severity}" data-artist="${w.detectedArtist || ''}"><strong>${w.field}:</strong> ${issue}</li>`;
        }).join('');
         
        warningsElement.innerHTML = `<ul>${warningItems}</ul>`;
         
        // Add click-to-copy handlers for any artist names
        warnings.forEach((warning, index) => {
          if (warning.detectedArtist) {
            const warningItem = warningsElement.querySelectorAll('li')[index];
            if (warningItem) {
              this.addClickToCopyHandler(warningItem, warning.detectedArtist);
            }
          }
        });
         
      } else {
        warningsElement.innerHTML = '<p class="no-warnings">✓ Utmärkt katalogisering!</p>';
      }
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
}
