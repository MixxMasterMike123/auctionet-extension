// modules/quality-analyzer.js - Quality Analysis Module
export class QualityAnalyzer {
  constructor() {
    this.dataExtractor = null;
    this.apiManager = null;
    this.previousFreetextData = null;
  }

  setDataExtractor(extractor) {
    this.dataExtractor = extractor;
  }

  setApiManager(apiManager) {
    this.apiManager = apiManager;
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
          this.startSalesAnalysis(aiArtistInfo, data, currentWarnings, currentScore);
        } else {
          // No AI artist found, fall back to best available option
        const bestArtist = this.determineBestArtistForMarketAnalysis(data, aiArtist);
        
        if (bestArtist) {
            console.log('💰 Starting sales analysis with best available artist/search:', bestArtist);
          this.pendingAnalyses.add('sales');
          this.updateAILoadingMessage('💰 Analyserar marknadsvärde...');
          this.startSalesAnalysis(bestArtist, data, currentWarnings, currentScore);
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
          this.startSalesAnalysis(immediateArtist, data, currentWarnings, currentScore);
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
        this.startSalesAnalysis(immediateArtist, data, currentWarnings, currentScore);
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

  async startSalesAnalysis(artistInfo, data, currentWarnings, currentScore) {
    try {
      const artistName = typeof artistInfo === 'string' ? artistInfo : artistInfo.artist;
      const isBrand = artistInfo.isBrand || false;
      const isFreetext = artistInfo.isFreetext || false;
      
      let analysisType = 'artist';
      if (isBrand) analysisType = 'brand';
      if (isFreetext) analysisType = 'freetext';
      
      console.log(`💰 Running comprehensive market analysis for ${analysisType}:`, artistName);
      
      // Extract additional context for sales analysis from current item
      const objectType = this.extractObjectType(data.title);
      const period = this.extractPeriod(data.title) || this.extractPeriod(data.description);
      const technique = this.extractTechnique(data.title, data.description);
      
      // SMART ENHANCEMENT: Extract additional search terms for better matching
      const enhancedTerms = this.extractEnhancedSearchTerms(data.title, data.description);
      
      // Prepare search context based on analysis type
      let searchContext = {
        primarySearch: artistName,
        objectType: objectType,
        period: period,
        technique: technique,
        enhancedTerms: enhancedTerms,
        analysisType: analysisType
      };
      
      if (isFreetext) {
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
      this.handleSalesAnalysisResult(salesData, currentWarnings, currentScore);
      
    } catch (error) {
      console.error('❌ Sales analysis failed:', error);
      this.pendingAnalyses.delete('sales');
      this.showSalesAnalysisError(error, currentWarnings, currentScore);
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

  handleSalesAnalysisResult(salesData, currentWarnings, currentScore) {
    if (salesData && salesData.hasComparableData) {
      console.log('💰 Processing comprehensive market analysis results');
      
      // NEW: Analyze valuation and suggest changes if needed
      const valuationSuggestions = this.analyzeValuationSuggestions(salesData);
      console.log('💰 Generated valuation suggestions:', valuationSuggestions);
      
      // Use the new dashboard approach and pass valuation suggestions
      this.addMarketDataDashboard(salesData, valuationSuggestions);
      
      if (valuationSuggestions.length > 0) {
        console.log('💰 Adding valuation suggestions to warnings');
        // Add valuation suggestions to current warnings
        const updatedWarnings = [...currentWarnings, ...valuationSuggestions];
        this.updateQualityIndicator(currentScore, updatedWarnings);
      } else {
        console.log('💰 No valuation suggestions generated');
        // Update UI with current warnings (without market data)
        this.updateQualityIndicator(currentScore, currentWarnings);
      }
      
      console.log('✅ Market data dashboard and valuation analysis displayed');
    }
  }

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
    const confidence = salesData.confidence;
    
    console.log('💰 Valuation analysis:', {
      currentEstimate,
      currentUpperEstimate,
      currentAcceptedReserve,
      marketRange: `${marketLow}-${marketHigh}`,
      confidence
    });
    
    // Only suggest changes if we have high confidence in market data
    if (confidence < 0.6) {
      console.log('⚠️ Market confidence too low for valuation suggestions:', confidence);
      return suggestions;
    }
    
    // Analyze estimate (main valuation)
    if (currentEstimate > 0) {
      console.log('💰 Analyzing main estimate:', currentEstimate);
      const estimateResult = this.compareValuationToMarket(currentEstimate, marketLow, marketHigh, marketMid);
      console.log('💰 Estimate vs market result:', estimateResult);
      
      if (estimateResult.needsAdjustment) {
        suggestions.push({
          field: 'Värdering',
          issue: estimateResult.message,
          suggestedRange: estimateResult.suggestedRange,
          severity: estimateResult.severity
        });
        console.log('💰 Added estimate suggestion');
      }
    } else {
      console.log('💰 No current estimate to analyze');
    }
    
    // Analyze upper estimate if present
    if (currentUpperEstimate > 0 && currentEstimate > 0) {
      console.log('💰 Analyzing upper estimate:', currentUpperEstimate);
      const upperEstimateAnalysis = this.analyzeUpperEstimate(currentEstimate, currentUpperEstimate, marketLow, marketHigh);
      
      if (upperEstimateAnalysis.needsAdjustment) {
        suggestions.push({
          field: 'Övre värdering',
          issue: upperEstimateAnalysis.message,
          suggestedRange: upperEstimateAnalysis.suggestedRange,
          severity: upperEstimateAnalysis.severity
        });
        console.log('💰 Added upper estimate suggestion');
      }
    }
    
    // Analyze accepted reserve if present
    if (currentAcceptedReserve > 0 && currentEstimate > 0) {
      console.log('💰 Analyzing accepted reserve:', currentAcceptedReserve);
      const reserveAnalysis = this.analyzeAcceptedReserve(currentEstimate, currentAcceptedReserve, marketLow, marketHigh);
      
      if (reserveAnalysis.needsAdjustment) {
        suggestions.push({
          field: 'Godkänd bevakning',
          issue: reserveAnalysis.message,
          suggestedRange: reserveAnalysis.suggestedRange,
          severity: reserveAnalysis.severity
        });
        console.log('💰 Added reserve suggestion');
      }
    }
    
    console.log('💰 Final suggestions count:', suggestions.length);
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

  // Helper method to format SEK amounts
  formatSEK(amount) {
    return new Intl.NumberFormat('sv-SE').format(amount);
  }

  showNoSalesDataMessage(currentWarnings, currentScore, analysisType = 'artist', entityName = '') {
    // Get current warnings (might have been updated by artist detection)
    const currentWarningsElement = document.querySelector('.quality-warnings ul');
    let updatedWarnings = [...currentWarnings];
    
    // If artist detection already updated the warnings, get the current state
    if (currentWarningsElement) {
      updatedWarnings = this.extractCurrentWarnings();
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
    this.updateQualityIndicator(currentScore, updatedWarnings);
    this.checkAndHideLoadingIndicator();
  }

  showSalesAnalysisError(error, currentWarnings, currentScore) {
    // Only show error message in development/debug mode
    if (console.debug) {
      const currentWarningsElement = document.querySelector('.quality-warnings ul');
      let updatedWarnings = [...currentWarnings];
      
      if (currentWarningsElement) {
        updatedWarnings = this.extractCurrentWarnings();
      }
      
      updatedWarnings.push({
        field: 'Marknadsvärde',
        issue: 'ℹ️ Marknadsvärdering tillfälligt otillgänglig',
        severity: 'low'
      });
      
      this.updateQualityIndicator(currentScore, updatedWarnings);
    }
    console.log('⚠️ Sales analysis error handled gracefully');
  }

  // New method to check if all analyses are complete and hide loading indicator
  checkAndHideLoadingIndicator() {
    console.log('🔍 Checking if loading indicator should be hidden...');
    console.log('🔍 Pending analyses:', Array.from(this.pendingAnalyses));
    console.log('🔍 AI analysis active:', this.aiAnalysisActive);
    
    if (this.pendingAnalyses.size === 0 && this.aiAnalysisActive) {
      console.log('🏁 All AI analyses complete, hiding loading indicator');
      this.aiAnalysisActive = false;
      this.hideAILoadingIndicator();
    } else if (this.pendingAnalyses.size > 0) {
      console.log('⏳ Still waiting for analyses:', Array.from(this.pendingAnalyses));
      // Keep aiAnalysisActive true as long as there are pending analyses
      this.aiAnalysisActive = true;
    } else {
      console.log('⏳ No pending analyses but aiAnalysisActive is false - already cleaned up');
    }
  }

  showAILoadingIndicator(message = '🤖 AI analyserar...') {
    const warningsElement = document.querySelector('.quality-warnings');
    if (warningsElement) {
      // Remove existing indicator if present
      this.hideAILoadingIndicator();
      
      // Add very subtle AI loading indicator - just a line and tiny text
      const loadingIndicator = document.createElement('div');
      loadingIndicator.className = 'ai-loading-indicator';
      loadingIndicator.innerHTML = `
        <div style="position: relative; margin-top: 8px; margin-bottom: 4px;">
          <div class="ai-progress-line" style="width: 100%; height: 1px; background: #e0e0e0; position: relative; overflow: hidden;">
            <div style="position: absolute; top: 0; left: -100%; width: 100%; height: 1px; background: linear-gradient(90deg, transparent, #2196f3, transparent); animation: slide 2s ease-in-out infinite;"></div>
          </div>
          <div class="ai-loading-text" style="color: #666; font-size: 8px; margin-top: 2px; opacity: 0.7;">${message}</div>
        </div>
      `;
      
      // Add progress line animation if not already added
      if (!document.getElementById('ai-progress-styles')) {
        const style = document.createElement('style');
        style.id = 'ai-progress-styles';
        style.textContent = `
          @keyframes slide {
            0% { 
              left: -100%; 
              opacity: 0;
            }
            50% { 
              opacity: 1;
            }
            100% { 
              left: 100%; 
              opacity: 0;
            }
          }
        `;
        document.head.appendChild(style);
      }
      
      warningsElement.appendChild(loadingIndicator);
    }
  }

  hideAILoadingIndicator() {
    const loadingIndicator = document.querySelector('.ai-loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.remove();
    }
  }

  updateAILoadingMessage(message) {
    const loadingText = document.querySelector('.ai-loading-text');
    if (loadingText) {
      loadingText.textContent = message;
    }
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
      // Preserve the loading indicator if it exists
      const existingLoadingIndicator = warningsElement.querySelector('.ai-loading-indicator');
      
      if (warnings.length > 0) {
        // Clear existing content
        warningsElement.innerHTML = '';
        
        // Use the enhanced warning display system
        warnings.forEach(warning => {
          const warningElement = this.displayWarning(warning);
          warningsElement.appendChild(warningElement);
        });
      } else {
        warningsElement.innerHTML = '<div style="color: #0f5132; background-color: #d1e7dd; border-left: 4px solid #198754; font-weight: 600; text-align: center; margin: 0; font-size: 14px; padding: 12px; border-radius: 6px;">✓ Utmärkt katalogisering!</div>';
      }
      
      // Re-append the loading indicator if it existed
      if (existingLoadingIndicator) {
        warningsElement.appendChild(existingLoadingIndicator);
      }
    }
  }

  // Enhanced warning display with better formatting (moved from UIManager)
  displayWarning(warning) {
    const warningDiv = document.createElement('div');
    
    // Check if this is a valuation-related warning
    const isValuationWarning = warning.field && (
      warning.field.includes('värdering') || 
      warning.field.includes('Värdering') ||
      warning.field.includes('bevakning') ||
      warning.field.includes('Bevakning')
    );
    
    // Apply base styling
    warningDiv.style.cssText = this.getWarningStyle(warning.severity);
    
    // Add valuation-specific styling if applicable
    if (isValuationWarning) {
      warningDiv.classList.add('warning-valuation');
      warningDiv.classList.add(`warning-${warning.severity}`);
    }
    
    // Handle header-only warnings (like the API data header)
    if (warning.severity === 'header') {
      warningDiv.innerHTML = `<strong>${warning.field}</strong>`;
      return warningDiv;
    }
    
    // Use the new formatWarningMessage method for better formatting
    if (warning.field && warning.issue) {
      // For valuation suggestions with suggestedRange, use condensed formatting
      if (warning.suggestedRange) {
        warningDiv.innerHTML = `
          <strong>${warning.field}:</strong> ${warning.issue}
              <div style="margin-top: 4px; font-size: 10px; opacity: 0.8;">
                ${warning.suggestedRange}
          </div>
        `;
      } else if (warning.severity.startsWith('market-')) {
        // Make market data fields condensed too
        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = `<strong>${warning.field}:</strong> ${warning.issue}`;
        warningDiv.appendChild(contentDiv);
      } else {
        // Regular quality warnings
        const contentDiv = document.createElement('div');
        let issueContent = warning.issue;
        
        // NEW: Add click-to-copy functionality for artist detection warnings
        if (warning.detectedArtist) {
          // Create a clickable version with copy functionality
          const artistName = warning.detectedArtist;
          const escapedArtistName = artistName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex chars
          
          // Replace the bold artist name with a clickable version
          issueContent = issueContent.replace(
            new RegExp(`<strong>${escapedArtistName}</strong>`, 'g'),
            `<span class="clickable-artist" 
                   data-artist="${artistName}" 
                   style="font-weight: bold; 
                          cursor: pointer; 
                          color: #2196f3; 
                          text-decoration: underline; 
                          padding: 2px 4px; 
                          border-radius: 3px; 
                          background: rgba(33, 150, 243, 0.1);
                          transition: all 0.2s ease;"
                   title="Klicka för att kopiera '${artistName}'"
                   onmouseover="this.style.background='rgba(33, 150, 243, 0.2)'"
                   onmouseout="this.style.background='rgba(33, 150, 243, 0.1)'"
                   onclick="this.copyArtistName('${artistName}', this)">${artistName}</span>`
          );
        }
        
        // Use condensed format like in the image instead of 2-column layout
        contentDiv.innerHTML = `<strong>${warning.field}:</strong> ${issueContent}`;
        warningDiv.appendChild(contentDiv);
        
        // NEW: Add click handler for artist copying if this warning has a detected artist
        if (warning.detectedArtist) {
          this.addClickToCopyHandler(warningDiv, warning.detectedArtist);
        }
      }
    } else if (warning.issue) {
      // Issue only (for market data)
      const contentDiv = document.createElement('div');
      contentDiv.innerHTML = warning.issue;
      warningDiv.appendChild(contentDiv);
    } else if (warning.field) {
      // Field only (for headers)
      const contentDiv = document.createElement('div');
      contentDiv.innerHTML = `<strong>${warning.field}</strong>`;
      warningDiv.appendChild(contentDiv);
    }
    
    return warningDiv;
  }

  // Enhanced styling for different warning types
  getWarningStyle(severity) {
    const baseStyle = `
      margin: 6px 0;
      padding: 8px 10px;
      border-radius: 4px;
      border-left: 3px solid;
      font-size: 11px;
      line-height: 1.3;
    `;
    
    switch (severity) {
      case 'critical':
        return baseStyle + `
          background-color: #fee;
          border-left-color: #e74c3c;
          color: #c0392b;
        `;
      case 'high':
        return baseStyle + `
          background-color: #fff3cd;
          border-left-color: #f39c12;
          color: #d68910;
        `;
      case 'medium':
        return baseStyle + `
          background-color: #d1ecf1;
          border-left-color: #3498db;
          color: #2980b9;
        `;
      case 'low':
        return baseStyle + `
          background-color: #f8f9fa;
          border-left-color: #6c757d;
          color: #495057;
        `;
      case 'positive':
        return baseStyle + `
          background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%);
          border-left-color: #28a745;
          color: #155724;
          font-weight: 500;
          box-shadow: 0 2px 4px rgba(40, 167, 69, 0.2);
        `;
      case 'header':
        return `
          margin: 12px 0 6px 0;
          padding: 6px 10px;
          background: linear-gradient(135deg, #6c757d 0%, #495057 100%);
          color: white;
          border-radius: 4px;
          font-weight: 500;
          font-size: 11px;
          text-align: center;
          opacity: 0.9;
        `;
      case 'market-primary':
        return baseStyle + `
          background-color: #e8f4fd;
          border-left-color: #3498db;
          color: #2c3e50;
          font-weight: 500;
          font-size: 11px;
        `;
      case 'market-insight':
        return baseStyle + `
          background-color: #f0f8f0;
          border-left-color: #27ae60;
          color: #1e8449;
          font-size: 10px;
          padding: 6px 8px;
        `;
      case 'market-data':
        return baseStyle + `
          background-color: #f8f9fa;
          border-left-color: #95a5a6;
          color: #6c757d;
          font-size: 10px;
          padding: 5px 8px;
          opacity: 0.8;
        `;
      case 'market-activity':
        return baseStyle + `
          background-color: #fff8f8;
          border-left-color: #e74c3c;
          color: #c0392b;
          font-size: 10px;
          padding: 6px 8px;
        `;
      case 'market-note':
        return baseStyle + `
          background-color: #f8f9fa;
          border-left-color: #95a5a6;
          color: #7f8c8d;
          font-size: 9px;
          font-style: italic;
          padding: 4px 8px;
          opacity: 0.7;
        `;
      default:
        return baseStyle + `
          background-color: #f8f9fa;
          border-left-color: #6c757d;
          color: #495057;
        `;
    }
  }

  setupLiveQualityUpdates() {
    console.log('🚀 Setting up live quality monitoring...');
    
    // Debounce function to prevent too frequent updates
    let updateTimeout;
    const debouncedUpdate = async (event) => {
      clearTimeout(updateTimeout);
      updateTimeout = setTimeout(async () => {
        console.log('⚡ Live quality update triggered by:', event?.target?.id || event?.target?.tagName || 'unknown field');
        try {
          await this.analyzeQuality();
        } catch (error) {
          console.error('Error in live quality update:', error);
        }
      }, 800); // Wait 800ms after user stops typing
    };

    // Use the exact same selectors as extractItemData()
    const fieldsToMonitor = [
      '#item_title_sv',
      '#item_description_sv', 
      '#item_condition_sv',
      '#item_hidden_keywords',
      'input[type="checkbox"][value="Inga anmärkningar"]',
      'input[type="checkbox"]#item_no_remarks',
      'input[type="checkbox"][name*="no_remarks"]'
    ];

    let monitoredCount = 0;
    fieldsToMonitor.forEach(selector => {
      try {
        const element = document.querySelector(selector);
        if (element) {
          console.log(`✅ Setting up live monitoring for: ${selector}`);
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
          console.log(`ℹ️ Field not found (optional): ${selector}`);
        }
      } catch (error) {
        console.log(`ℹ️ Could not query selector (optional): ${selector} - ${error.message}`);
      }
    });

    // Also monitor for changes in rich text editors (if any)
    const richTextEditors = document.querySelectorAll('[contenteditable="true"]');
    richTextEditors.forEach(editor => {
      console.log('✅ Setting up live monitoring for rich text editor');
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
  }

  assessDataQuality(data, fieldType) {
    const descLength = data.description.replace(/<[^>]*>/g, '').length;
    const condLength = data.condition.replace(/<[^>]*>/g, '').length;
    const titleLength = data.title.length;
    
    // Check if "Inga anmärkningar" is checked (handle missing checkboxes gracefully)
    let noRemarksChecked = false;
    try {
    const noRemarksCheckbox = document.querySelector('input[type="checkbox"][value="Inga anmärkningar"]') || 
                             document.querySelector('input[type="checkbox"]#item_no_remarks') ||
                             document.querySelector('input[type="checkbox"][name*="no_remarks"]');
      noRemarksChecked = noRemarksCheckbox && noRemarksCheckbox.checked;
    } catch (error) {
      console.log('ℹ️ No remarks checkbox not found (optional)');
    }
    
    const qualityScore = this.calculateCurrentQualityScore(data);
    
    const issues = [];
    let needsMoreInfo = false;
    
    // Critical quality thresholds (aggressively softened: 30 → 20)
    if (qualityScore < 20) {
      needsMoreInfo = true;
      issues.push('critical_quality');
    }
    
    // Field-specific quality checks
    switch(fieldType) {
      case 'title':
        if (!data.description.match(/\d{4}|\d{2,4}-tal|1[6-9]\d{2}|20[0-2]\d/i) && !data.artist && descLength < 30) {
          issues.push('period');
          needsMoreInfo = true;
        }
        if (titleLength < 15 && descLength < 25) {
          issues.push('basic_info');
          needsMoreInfo = true;
        }
        if (data.artist && data.artist.length > 0 && descLength < 20) {
          issues.push('artist_verification');
          needsMoreInfo = true;
        }
        break;
        
      case 'description':
        if (descLength < 25) {
          issues.push('material', 'technique', 'period', 'measurements');
          needsMoreInfo = true;
        }
        if (!this.hasMeasurements(data.description) && descLength < 40) {
          issues.push('measurements');
          needsMoreInfo = true;
        }
        break;
        
      case 'condition':
        if (!noRemarksChecked) {
          const conditionText = data.condition.toLowerCase();
          
          // Check for "Ej examinerad ur ram" - this is actually GOOD (mint condition for paintings)
          const isUnexaminedFramed = /ej\s+examinerad\s+ur\s+ram/i.test(conditionText);
          
          if (!isUnexaminedFramed) {
            // Only apply stricter rules if NOT "ej examinerad ur ram"
            
            // Zero tolerance for "bruksslitage" only
          if (data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) {
            issues.push('specific_damage', 'wear_details', 'bruksslitage_vague');
            needsMoreInfo = true;
          }
            
            // Moderately stricter minimum length (15 → 25 characters, not 40)
            if (condLength < 25) {
            issues.push('condition_details');
            needsMoreInfo = true;
          }
          
            // Moderate vague phrase detection
            const vaguePhrases = ['normalt slitage', 'vanligt slitage', 'åldersslitage', 'slitage förekommer'];
          const hasVaguePhrase = vaguePhrases.some(phrase => conditionText.includes(phrase));
          
            // Moderate threshold for vague phrases (40 characters, not 60)
          if (hasVaguePhrase && condLength < 40) {
            issues.push('vague_condition_terms');
            needsMoreInfo = true;
          }
          }
          // If "ej examinerad ur ram" - no additional requirements, it's good as is
        }
        break;
        
      case 'keywords':
        if (qualityScore < 20) {
          issues.push('basic_info');
          needsMoreInfo = true;
        }
        break;
        
      case 'all':
        if (qualityScore < 40) {
          needsMoreInfo = true;
          issues.push('critical_quality');
        }
        if (descLength < 30) {
          issues.push('material', 'technique', 'period');
          needsMoreInfo = true;
        }
        if (!this.hasMeasurements(data.description) && descLength < 50) {
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

  calculateCurrentQualityScore(data) {
    let score = 100;
    
    // Check if "Inga anmärkningar" is checked (handle missing checkboxes gracefully)
    let noRemarksChecked = false;
    try {
    const noRemarksCheckbox = document.querySelector('input[type="checkbox"][value="Inga anmärkningar"]') || 
                             document.querySelector('input[type="checkbox"]#item_no_remarks') ||
                             document.querySelector('input[type="checkbox"][name*="no_remarks"]');
      noRemarksChecked = noRemarksCheckbox && noRemarksCheckbox.checked;
    } catch (error) {
      console.log('ℹ️ No remarks checkbox not found (optional)');
    }
    
    const descLength = data.description.replace(/<[^>]*>/g, '').length;
    const condLength = data.condition.replace(/<[^>]*>/g, '').length;
    const keywordsLength = data.keywords.length;
    
    if (data.title.length < 14) score -= 15;
    if (descLength < 35) score -= 20;
    
    if (!noRemarksChecked) {
      const conditionText = data.condition.toLowerCase();
      
      // Check for "Ej examinerad ur ram" - this is actually GOOD (mint condition for paintings)
      const isUnexaminedFramed = /ej\s+examinerad\s+ur\s+ram/i.test(conditionText);
      
      if (!isUnexaminedFramed) {
        // Only apply penalties if NOT "ej examinerad ur ram"
        
        // Moderately stricter condition scoring for customer satisfaction
        if (condLength < 25) score -= 20;  // Moderate penalty (15 → 20, not 35)
        if (data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) score -= 35;  // Strong penalty (25 → 35, not 50)
      
      const vaguePhrases = ['normalt slitage', 'vanligt slitage', 'åldersslitage', 'slitage förekommer'];
        const hasVaguePhrase = vaguePhrases.some(phrase => conditionText.includes(phrase));
      
        if (hasVaguePhrase && condLength < 40) score -= 20;  // Moderate penalty (15 → 20, not 40)
      }
      // If "ej examinerad ur ram" - no penalties, it's considered good condition
    }
    
    if (keywordsLength === 0) score -= 30;
    if (!this.hasMeasurements(data.description)) score -= 10;
    
    return Math.max(0, score);
  }

  // Helper method to extract technique from title and description
  extractTechnique(title, description) {
    const text = `${title} ${description}`.toLowerCase();
    
    // Common Swedish art techniques
    const techniques = [
      'olja på duk', 'olja på pannå', 'olja på masonit',
      'akvarell', 'gouache', 'tempera', 'pastell',
      'litografi', 'etsning', 'träsnitt', 'linoleumsnitt',
      'teckning', 'blyerts', 'kol', 'tusch',
      'skulptur', 'brons', 'marmor', 'trä', 'keramik',
      'glas', 'kristall', 'silver', 'guld'
    ];
    
    for (const technique of techniques) {
      if (text.includes(technique)) {
        return technique;
      }
    }
    
    return null;
  }

  // Helper method to extract current warnings from the DOM
  extractCurrentWarnings() {
    const warnings = [];
    const warningElements = document.querySelectorAll('.quality-warnings li');
    
    warningElements.forEach(element => {
      const text = element.textContent;
      const fieldMatch = text.match(/^([^:]+):\s*(.+)$/);
      
      if (fieldMatch) {
        const field = fieldMatch[1];
        const issue = fieldMatch[2];
        
        // Determine severity from CSS class
        let severity = 'medium';
        if (element.classList.contains('warning-high')) {
          severity = 'high';
        } else if (element.classList.contains('warning-low')) {
          severity = 'low';
        }
        
        warnings.push({ field, issue, severity });
      }
    });
    
    return warnings;
  }

  // NEW: Extract enhanced search terms from title and description for better market matching
  extractEnhancedSearchTerms(title, description) {
    const terms = {
      materials: [],
      techniques: [],
      descriptors: [],
      brands: [],
      periods: []
    };
    
    const text = `${title} ${description}`.toLowerCase();
    
    // Extract materials
    const materials = [
      'silver', 'guld', 'brons', 'koppar', 'mässing', 'tenn', 'järn', 'stål',
      'glas', 'kristall', 'porslin', 'keramik', 'lergods', 'stengods',
      'trä', 'ek', 'björk', 'furu', 'mahogny', 'valnöt', 'teak', 'bok',
      'läder', 'tyg', 'sammet', 'siden', 'ull', 'bomull', 'lin',
      'marmor', 'granit', 'kalksten', 'sandsten',
      // NEW: Model/toy materials
      'resin', 'metall', 'diecast', 'zink', 'zamak', 'vitmetall', 'aluminium',
      'vinyl', 'pvc', 'abs', 'polyresin', 'pewter'
    ];
    
    materials.forEach(material => {
      if (text.includes(material)) {
        terms.materials.push(material);
      }
    });
    
    // Extract techniques
    const techniques = [
      'olja på duk', 'olja på pannå', 'akvarell', 'gouache', 'tempera', 'pastell',
      'litografi', 'etsning', 'träsnitt', 'linoleumsnitt', 'serigrafi',
      'skulptur', 'relief', 'byst', 'figur', 'abstrakt',
      'handmålad', 'handgjord', 'maskingjord', 'pressad', 'gjuten', 'svarv',
      'intarsia', 'fanér', 'massiv', 'laminerad'
    ];
    
    techniques.forEach(technique => {
      if (text.includes(technique)) {
        terms.techniques.push(technique);
      }
    });
    
    // Extract style descriptors
    const descriptors = [
      'art deco', 'jugend', 'funktionalism', 'bauhaus', 'modernism',
      'klassicism', 'empire', 'gustaviansk', 'rokoko', 'barock',
      'skandinavisk', 'svensk', 'dansk', 'norsk', 'finsk',
      'minimalistisk', 'elegant', 'rustik', 'lantlig', 'urban'
    ];
    
    descriptors.forEach(descriptor => {
      if (text.includes(descriptor)) {
        terms.descriptors.push(descriptor);
      }
    });
    
    // Extract known brands/manufacturers
    const brands = [
      'orrefors', 'kosta', 'boda', 'gustavsberg', 'rörstrand', 'arabia',
      'ikea', 'svenskt tenn', 'lammhults', 'källemo', 'norrlands möbler',
      'bruno mathsson', 'carl malmsten', 'alvar aalto', 'arne jacobsen',
      'hans wegner', 'finn juhl', 'poul henningsen', 'verner panton'
    ];
    
    brands.forEach(brand => {
      if (text.includes(brand)) {
        terms.brands.push(brand);
      }
    });
    
    // Extract periods
    const periodPatterns = [
      /(\d{4})/g,                    // 1950
      /(\d{2,4}-tal)/g,              // 1900-tal
      /(\d{2}\/\d{4}-tal)/g,         // 17/1800-tal
      /(1[6-9]\d{2})/g,              // 1600-1999
      /(20[0-2]\d)/g                 // 2000-2029
    ];
    
    periodPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        terms.periods.push(...matches);
      }
    });
    
    return terms;
  }

  // NEW: Add market data as a horizontal dashboard bar above the container
  addMarketDataDashboard(salesData, valuationSuggestions = []) {
    // DEBUG: Log the full salesData to understand what we're working with
    console.log('🔍 DEBUG: Full salesData for dashboard:', JSON.stringify(salesData, null, 2));
    
    // Add debouncing to prevent conflicts from parallel analyses
    const dashboardId = `dashboard-${salesData.analysisType}-${Date.now()}`;
    
    // Clear any pending dashboard updates
    if (this.pendingDashboardUpdate) {
      clearTimeout(this.pendingDashboardUpdate);
    }
    
    // PRIORITY SYSTEM: Artist analyses always take priority over freetext
    const isArtistAnalysis = salesData.analysisType === 'artist' || salesData.analysisType === 'artist_enriched';
    const isBrandAnalysis = salesData.analysisType === 'brand';
    const isFreetextAnalysis = salesData.analysisType === 'freetext';
    
    // Check if there's an existing dashboard and what type it is
    const existingDashboard = document.querySelector('.market-data-dashboard');
    if (existingDashboard) {
      const existingId = existingDashboard.getAttribute('data-dashboard-id');
      const existingType = existingId ? existingId.split('-')[1] : 'unknown';
      
      console.log(`🔄 Existing dashboard type: ${existingType}, new type: ${salesData.analysisType}`);
      
      // Artist/Brand analyses should ALWAYS replace freetext analyses
      if ((isArtistAnalysis || isBrandAnalysis) && existingType === 'freetext') {
        console.log('🎯 PRIORITY REPLACEMENT: Artist/Brand analysis replacing freetext dashboard');
        existingDashboard.remove();
        // Create immediately without delay
        this.createDashboard(salesData, valuationSuggestions, dashboardId);
        return;
      }
      
      // Don't let freetext replace artist/brand analyses
      if (isFreetextAnalysis && (existingType === 'artist' || existingType === 'brand')) {
        console.log('🚫 BLOCKING: Freetext analysis attempting to replace artist/brand dashboard - ignoring');
        return; // Don't create freetext dashboard if artist/brand already exists
      }
    }
    
    // For enriched artist analyses, remove old dashboard immediately but keep artist detection visible
    if (salesData.analysisType === 'artist_enriched' || salesData.enrichedWith) {
      if (existingDashboard) {
        console.log('🔄 Smoothly replacing dashboard for enriched analysis');
        existingDashboard.style.opacity = '0.5'; // Fade out old dashboard
        existingDashboard.style.transition = 'opacity 0.3s ease';
        
        // Remove after fade animation
        setTimeout(() => {
          if (existingDashboard.parentNode) {
            existingDashboard.parentNode.removeChild(existingDashboard);
          }
        }, 300);
      }
      
      // Create new dashboard immediately without delay
      this.createDashboard(salesData, valuationSuggestions, dashboardId);
    } else if (isArtistAnalysis || isBrandAnalysis) {
      // Artist and brand analyses get immediate priority
      console.log('🎯 Creating priority artist/brand dashboard immediately');
      this.createDashboard(salesData, valuationSuggestions, dashboardId);
        } else {
      // For freetext analyses, use small delay to allow artist detection to complete
      console.log('⏳ Delaying freetext dashboard creation to allow artist detection');
      this.pendingDashboardUpdate = setTimeout(() => {
        // Double-check that no artist analysis has started in the meantime
        const currentDashboard = document.querySelector('.market-data-dashboard');
        if (currentDashboard) {
          const currentId = currentDashboard.getAttribute('data-dashboard-id');
          const currentType = currentId ? currentId.split('-')[1] : 'unknown';
          
          if (currentType === 'artist' || currentType === 'brand') {
            console.log('🚫 Artist/Brand dashboard now exists - cancelling freetext dashboard');
            return;
          }
        }
        
        this.createDashboard(salesData, valuationSuggestions, dashboardId);
      }, 1000); // Increased delay to give AI detection more time
    }
  }
  
  createDashboard(salesData, valuationSuggestions, dashboardId) {
    // Remove any existing market data dashboard
    const existingDashboard = document.querySelector('.market-data-dashboard');
    if (existingDashboard) {
      console.log('🗑️ Removing existing dashboard');
      existingDashboard.remove();
    }

    // Create the dashboard container
    const dashboard = document.createElement('div');
    dashboard.className = 'market-data-dashboard';
    dashboard.setAttribute('data-dashboard-id', dashboardId);
    
    console.log(`🎯 Creating new dashboard with ID: ${dashboardId}`);
    
    let dashboardContent = '';
    
    // Main price range (always show if available)
    if (salesData.priceRange) {
      const confidence = salesData.confidence;
      const priceRange = salesData.priceRange;
      
      const formattedLow = new Intl.NumberFormat('sv-SE').format(priceRange.low);
      const formattedHigh = new Intl.NumberFormat('sv-SE').format(priceRange.high);
      
      // Display confidence based on data quality and market coverage
      let confidenceIcon = '';
      let confidenceColor = '';
      let confidenceText = '';
      let displayConfidence = confidence;
      
      // Only apply modest reduction for very low quality data
      if (confidence < 0.6) {
        displayConfidence = confidence * 0.9; // Small reduction for low quality
      }
      
      // Cap at 95% (never claim 100% certainty)
      displayConfidence = Math.min(displayConfidence, 0.95);
      
      const confidencePercent = Math.round(displayConfidence * 100);
      
      if (displayConfidence >= 0.90) {
        confidenceIcon = 'Exceptionell';
        confidenceColor = '#27ae60';
        confidenceText = `${confidencePercent}%`;
      } else if (displayConfidence >= 0.75) {
        confidenceIcon = 'Stark';
        confidenceColor = '#27ae60';
        confidenceText = `${confidencePercent}%`;
      } else if (displayConfidence >= 0.55) {
        confidenceIcon = 'Måttlig';
        confidenceColor = '#f39c12';
        confidenceText = `${confidencePercent}%`;
      } else {
        confidenceIcon = 'Begränsad';
        confidenceColor = '#e67e22';
        confidenceText = `${confidencePercent}%`;
      }
      
      dashboardContent += `
        <div class="market-item market-price">
          <div class="market-label">Marknadsvärde</div>
          <div class="market-value">${formattedLow}-${formattedHigh} SEK</div>
          <div class="market-confidence" style="color: ${confidenceColor};">${confidenceIcon} ${confidenceText}</div>
          <div class="market-help">vägledning</div>
        </div>
      `;
    }
    
    
    // Historical trend (NEW: prominently displayed)
    if (salesData.historical && salesData.historical.trendAnalysis && salesData.historical.trendAnalysis.trend !== 'insufficient_data') {
      const trend = salesData.historical.trendAnalysis;
      let trendIcon = '';
      let trendColor = '';
      let trendText = '';
      let helpText = '';
      
      // Calculate timeframe from historical sales data
      let timeframeText = '';
      if (salesData.historical.recentSales && salesData.historical.recentSales.length > 0) {
        const salesDates = salesData.historical.recentSales
          .map(sale => new Date(sale.date))
          .filter(date => !isNaN(date));
        
        if (salesDates.length > 1) {
          const oldestDate = new Date(Math.min(...salesDates));
          const newestDate = new Date(Math.max(...salesDates));
          const yearSpan = newestDate.getFullYear() - oldestDate.getFullYear();
          
          if (yearSpan >= 2) {
            timeframeText = ` (${yearSpan}+ år data)`;
          } else if (yearSpan >= 1) {
            timeframeText = ` (${yearSpan}-${yearSpan + 1} år data)`;
          } else {
            timeframeText = ` (senaste året)`;
          }
        }
      }
      
      // Determine display based on trend type
      if (trend.trend === 'rising_strong') {
        trendIcon = '📈';
        trendColor = '#27ae60';
        trendText = `+${Math.abs(trend.changePercent)}% senaste försäljningar vs tidigare`;
        helpText = `stark uppgång${timeframeText}`;
      } else if (trend.trend === 'rising') {
        trendIcon = '📈';
        trendColor = '#2ecc71';
        trendText = `+${Math.abs(trend.changePercent)}% senaste försäljningar vs tidigare`;
        helpText = `stigande${timeframeText}`;
      } else if (trend.trend === 'falling_strong') {
        trendIcon = '📉';
        trendColor = '#e74c3c';
        trendText = `${trend.changePercent}% senaste försäljningar vs tidigare`;
        helpText = `stark nedgång${timeframeText}`;
      } else if (trend.trend === 'falling') {
        trendIcon = '📉';
        trendColor = '#e67e22';
        trendText = `${trend.changePercent}% senaste försäljningar vs tidigare`;
        helpText = `fallande${timeframeText}`;
      } else {
        trendIcon = '📊';
        trendColor = '#3498db';
        trendText = 'Stabil utveckling';
        helpText = `oförändrat${timeframeText}`;
      }
      
      // NEW: Add data quality warnings for questionable trends
      let dataQualityWarning = '';
      let qualityIcon = '';
      
      if (trend.dataQuality === 'mixed_suspicious') {
        dataQualityWarning = ' (blandad data)';
        qualityIcon = ' ⚠️';
        helpText = `${helpText} - extrema trender kan indikera blandade marknadsdata`;
        trendColor = '#f39c12'; // Warning orange
      } else if (trend.dataQuality === 'extreme_trend') {
        dataQualityWarning = ' (extremtrend)';
        qualityIcon = ' ⚠️';
        helpText = `${helpText} - kontrollera datakvalitet`;
        trendColor = '#e67e22'; // Warning orange-red
      }
      
      dashboardContent += `
        <div class="market-item market-historical-trend">
          <div class="market-label" title="Prisutveckling baserat på jämförelse mellan äldre och nyare försäljningar från historisk auktionsdata">Pristrend ${trendIcon}${qualityIcon}</div>
          <div class="market-value" style="color: ${trendColor}; font-weight: 600;">${trendText}${dataQualityWarning}</div>
          <div class="market-help">${helpText}</div>
        </div>
      `;
      console.log('✅ Added prominent historical trend display with timeframe and data quality warnings');
    }
    
    // Data summary
    let dataParts = [];
    if (salesData.historical) {
      dataParts.push(`${salesData.historical.analyzedSales} historiska`);
    }
    if (salesData.live) {
      dataParts.push(`${salesData.live.analyzedLiveItems} pågående`);
    }
    
    if (dataParts.length > 0) {
      // NEW: Add auction links for transparency - both historical and live
      let auctionLinks = '';
      let linkSections = [];
      
      // Historical auction links (ended auctions)
      if (salesData.historical && salesData.historical.recentSales) {
        const validSales = salesData.historical.recentSales.filter(sale => sale.url);
        if (validSales.length > 0) {
          const linkNumbers = validSales.slice(0, 5).map((sale, index) => 
            `<a href="${sale.url}" target="_blank" style="color: #007cba; text-decoration: none; margin-right: 4px; font-weight: 500; padding: 1px 3px; border-radius: 2px; background: #f0f8ff;" title="Historisk: ${sale.title} - ${sale.price.toLocaleString()} SEK (${sale.date})">${index + 1}</a>`
          ).join(' ');
          linkSections.push(`<div style="font-size: 10px; margin-bottom: 2px;"><span style="color: #666;">Historiska:</span> ${linkNumbers}</div>`);
        }
      }
      
      // Live auction links (ongoing auctions)
      if (salesData.live && salesData.live.liveItems) {
        const validLiveItems = salesData.live.liveItems.filter(item => {
          // Try to construct URL from the live item data
          // This might need adjustment based on how live items are structured
          return item.url || item.auctionId;
        });
        
        if (validLiveItems.length > 0) {
          const liveLinkNumbers = validLiveItems.slice(0, 5).map((item, index) => {
            // Use existing URL or construct one from auction ID
            const url = item.url || `https://auctionet.com/sv/auctions/${item.auctionId}`;
            const estimate = item.estimate ? `${item.estimate.toLocaleString()} SEK` : 'Ej uppskattat';
            const timeLeft = item.timeRemaining || 'Okänd tid';
            
            return `<a href="${url}" target="_blank" style="color: #e74c3c; text-decoration: none; margin-right: 4px; font-weight: 500; padding: 1px 3px; border-radius: 2px; background: #fff5f5;" title="Pågående: ${item.title} - Utrop: ${estimate} (${timeLeft} kvar)">${index + 1}</a>`;
          }).join(' ');
          linkSections.push(`<div style="font-size: 10px; margin-bottom: 2px;"><span style="color: #666;">Pågående:</span> ${liveLinkNumbers}</div>`);
        }
      }
      
      // Combine all link sections on separate rows
      if (linkSections.length > 0) {
        auctionLinks = `<br>${linkSections.join('')}`;
      }
      
      // NEW: Create comprehensive data summary showing both total matches AND analyzed sales
      let dataSummary = '';
      let detailedBreakdown = [];
      let auctionetLinks = ''; // NEW: Direct links to view all data on Auctionet
      
      if (salesData.historical) {
        const totalMatches = salesData.historical.totalMatches || 0;
        const analyzedSales = salesData.historical.analyzedSales || 0;
        const searchQuery = salesData.historical.actualSearchQuery;
        
        if (totalMatches > 0) {
          // Show total matches found and how many had usable price data
          detailedBreakdown.push(`${totalMatches.toLocaleString()} historiska träffar (${analyzedSales} med prisdata)`);
          
          // Add direct link to view all historical data on Auctionet
          if (searchQuery) {
            const encodedQuery = encodeURIComponent(searchQuery);
            const historicalUrl = `https://auctionet.com/sv/search?event_id=&is=ended&q=${encodedQuery}`;
            auctionetLinks += `<a href="${historicalUrl}" target="_blank" style="color: #007cba; text-decoration: none; font-weight: 500; padding: 2px 6px; border-radius: 3px; background: #f0f8ff; border: 1px solid #d1ecf1; margin-right: 8px;" title="Visa alla ${totalMatches.toLocaleString()} historiska träffar på Auctionet för '${searchQuery}'">Historiska</a>`;
          }
        } else {
          detailedBreakdown.push(`${analyzedSales} historiska`);
        }
      }
      
      if (salesData.live) {
        const totalMatches = salesData.live.totalMatches || 0;
        const analyzedLive = salesData.live.analyzedLiveItems || 0;
        const searchQuery = salesData.live.actualSearchQuery;
        
        if (totalMatches > 0) {
          // Show total matches found and how many had usable data
          detailedBreakdown.push(`${totalMatches.toLocaleString()} pågående träffar (${analyzedLive} analyserade)`);
          
          // Add direct link to view all live data on Auctionet
          if (searchQuery) {
            const encodedQuery = encodeURIComponent(searchQuery);
            const liveUrl = `https://auctionet.com/sv/search?event_id=&q=${encodedQuery}`;
            auctionetLinks += `<a href="${liveUrl}" target="_blank" style="color: #e74c3c; text-decoration: none; font-weight: 500; padding: 2px 6px; border-radius: 3px; background: #fff5f5; border: 1px solid #f5c6cb; margin-right: 8px;" title="Visa alla ${totalMatches.toLocaleString()} pågående träffar på Auctionet för '${searchQuery}'">Pågående</a>`;
          }
        } else {
          detailedBreakdown.push(`${analyzedLive} pågående`);
        }
      }
      
      // Use detailed breakdown if we have total matches, otherwise fall back to simple version
      if (detailedBreakdown.some(item => item.includes('träffar'))) {
        dataSummary = detailedBreakdown.join(' • ');
      } else {
        dataSummary = dataParts.join(' • ') + ' analyserade';
      }
      
      // Sleek inline Auctionet links
      let inlineAuctionetLinks = '';
      if (auctionetLinks) {
        inlineAuctionetLinks = ` ${auctionetLinks}`;
      }
      
      // Super compact auction sample links - just show a few numbers inline
      let sampleLinks = '';
      if (linkSections.length > 0) {
        // Extract just the first 3 links from each section for a clean, minimal display
        let compactSamples = [];
        
        if (salesData.historical && salesData.historical.recentSales) {
          const validSales = salesData.historical.recentSales.filter(sale => sale.url).slice(0, 3);
          if (validSales.length > 0) {
            const numbers = validSales.map((sale, index) => 
              `<a href="${sale.url}" target="_blank" style="color: #007cba; text-decoration: none; margin-right: 2px; font-size: 8px; padding: 0 1px;" title="${sale.title}">${index + 1}</a>`
            ).join('');
            compactSamples.push(`H:${numbers}`);
          }
        }
        
        if (salesData.live && salesData.live.liveItems) {
          const validLiveItems = salesData.live.liveItems.filter(item => item.url || item.auctionId).slice(0, 3);
          if (validLiveItems.length > 0) {
            const numbers = validLiveItems.map((item, index) => {
              const url = item.url || `https://auctionet.com/sv/auctions/${item.auctionId}`;
              return `<a href="${url}" target="_blank" style="color: #e74c3c; text-decoration: none; margin-right: 2px; font-size: 8px; padding: 0 1px;" title="${item.title}">${index + 1}</a>`;
            }).join('');
            compactSamples.push(`P:${numbers}`);
          }
        }
        
        if (compactSamples.length > 0) {
          sampleLinks = `<br><div style="font-size: 8px; margin-top: 1px; opacity: 0.7;">${compactSamples.join(' ')}</div>`;
        }
      }
      
      dashboardContent += `
        <div class="market-item market-data">
          <div class="market-label" title="Antal försäljningar och pågående auktioner som analysen baseras på">Dataunderlag</div>
          <div class="market-value">${dataSummary}${inlineAuctionetLinks}</div>
          <div class="market-help">omfattande data${sampleLinks}</div>
        </div>
      `;
    }
    
    // NEW: Exceptional sales (high-value outliers)
    if (salesData.historical && salesData.historical.exceptionalSales) {
      const exceptional = salesData.historical.exceptionalSales;
      console.log('🌟 Adding exceptional sales to dashboard:', exceptional);
      
      // Create exceptional sales info with numbered links
      let exceptionalDetails = exceptional.description;
      
      // Allow more text for exceptional sales - up to ~120 characters (3 rows)
      if (exceptionalDetails.length > 120) {
        exceptionalDetails = exceptionalDetails.substring(0, 117) + '...';
      }
      
      // Create numbered links for each exceptional sale (similar to data sources)
      let numberedLinks = '';
      if (exceptional.sales && exceptional.sales.length > 0) {
        const linkNumbers = exceptional.sales.slice(0, 10).map((sale, index) => {
          const number = index + 1;
          return `<a href="${sale.url}" target="_blank" style="color: #8e44ad; text-decoration: none; font-weight: 500; margin-right: 4px;" title="${sale.title} - ${sale.price.toLocaleString()} SEK">${number}</a>`;
        });
        numberedLinks = linkNumbers.join(' ');
      }
      
      dashboardContent += `
        <div class="market-item market-exceptional">
          <div class="market-label" title="Exceptionellt höga försäljningar som visar marknadens potential">Exceptionella</div>
          <div class="market-value" style="color: #8e44ad;">${exceptionalDetails}</div>
          <div class="market-help">${numberedLinks || 'marknadspotential'}</div>
        </div>
      `;
    }
    
    // Market activity (RELAXED: show for more moderate thresholds)
    if (salesData.live && salesData.live.marketActivity) {
      const activity = salesData.live.marketActivity;
      console.log('🔍 DEBUG: Market activity data:', activity);
      
      if (activity.reservesMetPercentage > 60 || activity.reservesMetPercentage < 40) {
        let activityColor = '';
        let activityText = '';
        let helpText = '';
        
        if (activity.reservesMetPercentage > 60) {
          activityColor = '#1e8449';
          activityText = `Stark (${activity.reservesMetPercentage}%)`;
          helpText = 'bra att sälja';
        } else {
          activityColor = '#b7472a';
          activityText = `Svag (${activity.reservesMetPercentage}%)`;
          helpText = 'sänk utrop';
        }
        
        dashboardContent += `
          <div class="market-item market-activity">
            <div class="market-label" title="Hur många procent av liknande objekt som når sina utrop i pågående auktioner">Marknadsaktivitet</div>
            <div class="market-value" style="color: ${activityColor};">${activityText}</div>
            <div class="market-help">${helpText}</div>
          </div>
        `;
        console.log('✅ Added market activity box');
      } else {
        console.log(`ℹ️ Market activity (${activity.reservesMetPercentage}%) not significant enough to show (threshold: >60% or <40%)`);
      }
    } else {
      console.log('ℹ️ No market activity data available');
    }
    
    // Key insight (RELAXED: show medium and high significance)
    if (salesData.insights && salesData.insights.length > 0) {
      console.log('🔍 DEBUG: All insights:', salesData.insights);
      
      let significantInsights = salesData.insights.filter(insight => 
        insight.significance === 'high' || insight.significance === 'medium'
      );
      
      // FALLBACK: If no high/medium insights, show any insights we have
      if (significantInsights.length === 0) {
        console.log('ℹ️ No high/medium significance insights, showing any available insights');
        significantInsights = salesData.insights.slice(0, 1); // Show first insight
      }
      
      if (significantInsights.length > 0) {
        const insight = significantInsights[0];
        console.log('✅ Using insight:', insight);
        
        // Handle market insights (trends, comparisons)
        let dashboardMessage = insight.message;
        let messageColor = '#2c3e50'; // Dark blue-gray for insights
        
        if (insight.significance === 'high') {
          messageColor = '#c0392b'; // Dark red for high significance
        } else if (insight.significance === 'medium') {
          messageColor = '#d68910'; // Darker orange for medium significance
        }
        
        // Determine if this is a simple trend or complex analysis
        let isSimpleTrend = false;
        let trendDirection = '';
        let analysisMessage = dashboardMessage;
        
        // Extract simple trend from complex message
        if (dashboardMessage.includes('värderar') && dashboardMessage.includes('%')) {
          const percentMatch = dashboardMessage.match(/värderar (\d+)% (över|under|högre|lägre)/);
          if (percentMatch) {
            const percent = parseInt(percentMatch[1]);
            const direction = percentMatch[2];
            
            // SMART TREND ANALYSIS: Consider market activity context
            let marketActivity = null;
            let reserveSuccess = null;
            
            // Extract market activity data if available
            if (salesData && salesData.live && salesData.live.marketActivity) {
              reserveSuccess = salesData.live.marketActivity.reservesMetPercentage;
              console.log('🎯 Market trend analysis - Reserve success rate:', reserveSuccess, '%, Price difference:', percent, '%');
            } else {
              console.log('🎯 Market trend analysis - No market activity data available, using price-only logic');
            }
            
            // Determine trend based on BOTH price movement AND market health
            if ((direction === 'över' || direction === 'högre')) {
              if (reserveSuccess !== null) {
                if (reserveSuccess < 40 && percent > 50) {
                  // High prices but low success rate = overvaluation/bubble
                  trendDirection = 'Övervärderad marknad';
                  isSimpleTrend = true;
                } else if (reserveSuccess > 70 && percent > 20) {
                  // High prices AND high success = genuine rising market
                  trendDirection = 'Stigande marknad';
                  isSimpleTrend = true;
                } else if (reserveSuccess < 30) {
                  // Low success rate = weak market regardless of prices
                  trendDirection = 'Svag marknad';
                  isSimpleTrend = true;
                } else {
                  // Moderate activity with higher prices = cautious optimism
                  trendDirection = 'Blandad marknad';
                  isSimpleTrend = true;
                }
              } else {
                // Fallback to simple price-based logic when no activity data
                if (percent > 30) {
                  trendDirection = 'Stigande marknad';
                  isSimpleTrend = true;
                } else {
                  trendDirection = 'Stabil marknad';
                  isSimpleTrend = true;
                }
              }
            } else if ((direction === 'under' || direction === 'lägre') && percent > 20) {
              trendDirection = 'Fallande marknad';
              isSimpleTrend = true;
            } else {
              trendDirection = 'Stabil marknad';
              isSimpleTrend = true;
            }
          }
        }
        
        if (isSimpleTrend) {
          // Add simple trend indicator with enhanced details
          let enhancedTrendText = trendDirection;
          
          // If we have historical trend data, add it to the market trend display
          if (salesData.historical && salesData.historical.trendAnalysis && salesData.historical.trendAnalysis.changePercent !== undefined) {
            const histTrend = salesData.historical.trendAnalysis;
            if (histTrend.trend !== 'insufficient_data' && Math.abs(histTrend.changePercent) > 0) {
              const changeText = histTrend.changePercent > 0 ? `+${histTrend.changePercent}%` : `${histTrend.changePercent}%`;
              enhancedTrendText += ` (pristrend: ${changeText})`;
            }
          }
          
          dashboardContent += `
            <div class="market-item market-trend">
              <div class="market-label">Marknadstrend</div>
              <div class="market-value" style="color: ${messageColor}; font-size: 11px; line-height: 1.3;">${enhancedTrendText}</div>
            </div>
          `;
          console.log('✅ Added enhanced market trend box with historical data');
          
          // Add detailed analysis as separate item
          dashboardContent += `
            <div class="market-item market-analysis">
              <div class="market-label">Värderingsanalys</div>
              <div class="market-value" style="color: ${messageColor}; font-size: 11px; line-height: 1.3;">${analysisMessage}</div>
            </div>
          `;
          console.log('✅ Added market analysis box');
        } else {
          // Fallback to original format for other types of insights
          dashboardContent += `
            <div class="market-item market-insight">
              <div class="market-label">Marknadstrend</div>
              <div class="market-value" style="color: ${messageColor};">${dashboardMessage}</div>
            </div>
          `;
          console.log('✅ Added market insight box');
        }
      } else {
        console.log('ℹ️ No insights available to display');
      }
    } else {
      console.log('ℹ️ No insights data available');
    }
    
    // Check for positive valuation feedback and integrate into valuation analysis
    if (valuationSuggestions && valuationSuggestions.length > 0) {
      const positiveValuations = valuationSuggestions.filter(suggestion => 
        suggestion.severity === 'positive'
      );
      
      if (positiveValuations.length > 0) {
        // If we already have a valuation analysis section, we don't add another
        // The positive feedback will be shown in the warnings section instead
        // But if we don't have insights, add a happy valuation analysis
        if (!salesData.insights || salesData.insights.length === 0) {
          dashboardContent += `
            <div class="market-item market-analysis">
              <div class="market-label">Värderingsanalys</div>
              <div class="market-value" style="color: #27ae60; font-size: 11px; line-height: 1.3;">🎯 Utmärkt bedömning! Väl i linje med marknadsvärde</div>
            </div>
          `;
        }
        
        console.log('🏆 Integrated positive valuation feedback');
      }
    }
    
    // Only create dashboard if we have content
    if (dashboardContent) {
      console.log('🎯 Dashboard content exists, creating dashboard...');
      console.log('📏 Dashboard content length:', dashboardContent.length);
      
      // Determine dashboard title and source based on analysis type
      const analysisType = salesData.analysisType || 'artist';
      const searchedEntity = salesData.searchedEntity || '';
      
      let dashboardTitle = 'Marknadsanalys';
      let dashboardSource = 'Auctionet databas';
      
      if (analysisType === 'brand') {
        dashboardTitle = `Marknadsanalys - ${searchedEntity}`;
        dashboardSource = 'Märkesbaserad analys';
      } else if (analysisType === 'freetext') {
        const searchContext = salesData.searchContext || {};
        const strategy = searchContext.searchStrategy || 'basic';
        const confidence = Math.round((searchContext.confidence || 0.4) * 100);
        
        dashboardTitle = `Marknadsanalys - Fritextsökning`;
        dashboardSource = `${strategy.replace('_', ' ')} sökning (${confidence}% relevans)`;
      } else if (searchedEntity) {
        dashboardTitle = `Marknadsanalys - ${searchedEntity}`;
        dashboardSource = 'Konstnärsbaserad analys';
      }
      
      dashboard.innerHTML = `
        <div class="market-dashboard-header">
          <span class="market-dashboard-title">${dashboardTitle}</span>
          <span class="market-dashboard-source">${dashboardSource}</span>
        </div>
        <div class="market-dashboard-content">
          ${dashboardContent}
        </div>
        <div class="market-dashboard-disclaimer">
          <span class="disclaimer-text">💡 Marknadsdata är vägledning - varje objekt är unikt och kan ha särskilda egenskaper som påverkar värdet</span>
        </div>
      `;
      
      // Add CSS styles for the dashboard
      this.addMarketDashboardStyles();
      console.log('✅ Dashboard styles added');
      
      // Insert the dashboard above the main container
      const mainContainer = document.querySelector('.grid-container') || 
                           document.querySelector('.container') || 
                           document.querySelector('main') ||
                           document.querySelector('.content');
      
      console.log('🔍 Main container search result:', mainContainer);
      
      if (mainContainer) {
        console.log('📍 Inserting dashboard above main container:', mainContainer.className);
        mainContainer.parentNode.insertBefore(dashboard, mainContainer);
        console.log('✅ Market data dashboard added above main container');
      } else {
        // Fallback: add after the breadcrumb/header area
        const breadcrumb = document.querySelector('.breadcrumb') || 
                          document.querySelector('nav') ||
                          document.querySelector('header');
        
        console.log('🔍 Breadcrumb/nav/header search result:', breadcrumb);
        
        if (breadcrumb) {
          console.log('📍 Inserting dashboard after breadcrumb/nav/header:', breadcrumb.tagName);
          breadcrumb.parentNode.insertBefore(dashboard, breadcrumb.nextSibling);
          console.log('✅ Market data dashboard added after breadcrumb');
        } else {
          // Last resort: add to body
          console.log('📍 Last resort: inserting dashboard at top of body');
          document.body.insertBefore(dashboard, document.body.firstChild);
          console.log('✅ Market data dashboard added to body');
        }
      }
      
      // Verify dashboard was actually added
      const addedDashboard = document.querySelector('.market-data-dashboard');
      if (addedDashboard) {
        console.log('🎉 Dashboard successfully added to DOM!');
        console.log('📊 Dashboard element:', addedDashboard);
      } else {
        console.error('❌ Dashboard was NOT added to DOM - something went wrong!');
      }
    } else {
      console.log('❌ No dashboard content - dashboard will not be created');
      console.log('🔍 Sales data check:', {
        hasPriceRange: !!salesData.priceRange,
        hasHistorical: !!salesData.historical,
        hasLive: !!salesData.live,
        hasInsights: !!(salesData.insights && salesData.insights.length > 0)
      });
    }
  }

  // Add CSS styles for the market dashboard
  addMarketDashboardStyles() {
    if (!document.getElementById('market-dashboard-styles')) {
      const style = document.createElement('style');
      style.id = 'market-dashboard-styles';
      style.textContent = `
        .market-data-dashboard {
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
          border: 1px solid #dee2e6;
          border-radius: 8px;
          margin: 15px 20px;
          padding: 12px 16px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .market-dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
          padding-bottom: 6px;
          border-bottom: 1px solid #dee2e6;
        }
        
        .market-dashboard-title {
          font-weight: 600;
          font-size: 13px;
          color: #2c3e50;
        }
        
        .market-dashboard-source {
          font-size: 10px;
          color: #6c757d;
          opacity: 0.8;
        }
        
        .market-dashboard-content {
          display: flex;
          flex-wrap: nowrap;
          gap: 16px;
          align-items: flex-start;
          overflow-x: auto;
          justify-content: center;
        }
        
        .market-item {
          display: flex;
          flex-direction: column;
          min-width: 140px;
          max-width: 180px;
          flex-shrink: 0;
          border-right: 0.5px solid #e0e0e0;
          padding-right: 16px;
        }
        
        .market-item.market-exceptional {
          max-width: 220px;
        }
        
        .market-item:last-child {
          border-right: none;
          padding-right: 0;
        }
        
        .market-label {
          font-size: 9px;
          color: #6c757d;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 2px;
          font-weight: 500;
        }
        
        .market-value {
          font-size: 12px;
          font-weight: 600;
          color: #1a252f;
          line-height: 1.2;
        }
        
        .market-confidence {
          font-size: 10px;
          margin-top: 1px;
          font-weight: 500;
        }
        
        .market-help {
          font-size: 9px;
          color: #495057;
          margin-top: 1px;
          font-style: italic;
        }
        
        .market-label[title] {
          cursor: help;
          border-bottom: 1px dotted #6c757d;
        }
        
        .market-activity .market-value {
          font-size: 11px;
        }
        
        .market-insight .market-value {
          font-size: 11px;
          line-height: 1.3;
        }
        
        .market-trend .market-value {
          font-size: 12px;
          font-weight: 600;
        }
        
        .market-trend .market-value[style*="color: #e74c3c"] {
          color: #e74c3c !important;
          font-weight: 700;
        }
        
        .market-analysis .market-value {
          font-size: 10px;
          line-height: 1.3;
          color: #495057;
        }
        
        .market-analysis .market-label {
          color: #6c757d;
        }
        
        .market-valuation-perfect {
          color: #27ae60;
        }
        
        .market-valuation-perfect .market-label {
          color: #27ae60;
          font-weight: 500;
        }
        
        .market-valuation-perfect .market-value {
          color: #27ae60;
          font-size: 12px;
          font-weight: 600;
        }
        
        .market-valuation-perfect .market-confidence {
          color: #27ae60;
        }
        
        .market-dashboard-disclaimer {
          margin-top: 10px;
          padding-top: 6px;
          border-top: 1px solid #e9ecef;
          display: flex;
          justify-content: center;
        }
        
        .disclaimer-text {
          font-size: 11px;
          color: #495057;
          font-style: italic;
          line-height: 1.3;
          text-align: center;
          font-weight: 500;
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
          padding: 8px 12px;
          border-radius: 4px;
          border: 1px solid #dee2e6;
          max-width: 600px;
          margin: 0 auto;
        }
        
        @keyframes perfectGlow {
          0% { 
            box-shadow: 0 2px 6px rgba(40, 167, 69, 0.2);
          }
          50% { 
            box-shadow: 0 4px 12px rgba(40, 167, 69, 0.4);
            transform: translateY(-1px);
          }
          100% { 
            box-shadow: 0 2px 6px rgba(40, 167, 69, 0.2);
            transform: translateY(0);
          }
        }
        
        /* Compact layout for narrow sections */
        .market-data .market-value {
          font-size: 11px;
          line-height: 1.2;
        }
        
        .market-exceptional .market-value {
          color: #8e44ad;
          font-weight: 600;
          font-size: 11px;
          line-height: 1.3;
        }
        
        .market-exceptional .market-label {
          color: #8e44ad;
          font-weight: 600;
        }
        
        .market-exceptional .market-help {
          color: #8e44ad;
          opacity: 0.8;
        }
        
        .market-exceptional[onclick] {
          transition: all 0.2s ease;
        }
        
        .market-exceptional[onclick]:hover {
          background-color: #f8f4ff;
          border-color: #8e44ad;
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(142, 68, 173, 0.15);
        }
        
        .market-exceptional[onclick]:hover .market-value {
          color: #6c2c91;
        }
        
        .market-data a {
          color: #007cba;
          text-decoration: none;
          margin-right: 3px;
          font-weight: 500;
          padding: 1px 2px;
          border-radius: 2px;
          transition: all 0.2s ease;
          font-size: 9px;
        }
        
        .market-data a:hover {
          background-color: rgba(0, 124, 186, 0.1);
          color: #005a87;
          text-decoration: none;
          transform: none;
        }
        
        .market-data a:visited {
          color: #005a87;
        }
        
        .market-data a:visited:hover {
          background-color: rgba(0, 90, 135, 0.1);
          color: #005a87;
        }
        
        /* NEW: Specific styles for historical vs live auction links */
        .market-data a[style*="background: #f0f8ff"] {
          /* Historical auction links - blue theme */
          border: 1px solid #d1ecf1;
        }
        
        .market-data a[style*="background: #f0f8ff"]:hover {
          background-color: rgba(0, 124, 186, 0.15) !important;
          border-color: #007cba;
          transform: none;
          box-shadow: none;
        }
        
        .market-data a[style*="background: #fff5f5"] {
          /* Live auction links - red theme */
          border: 1px solid #f5c6cb;
        }
        
        .market-data a[style*="background: #fff5f5"]:hover {
          background-color: rgba(231, 76, 60, 0.15) !important;
          border-color: #e74c3c;
          transform: none;
          box-shadow: none;
        }
        
        /* Responsive design - only stack on very small screens */
        @media (max-width: 600px) {
          .market-dashboard-content {
            flex-wrap: wrap;
            gap: 10px;
          }
          
          .market-item {
            min-width: auto;
            width: calc(50% - 5px);
            border-right: none;
            border-bottom: 1px solid #dee2e6;
            padding-right: 0;
            padding-bottom: 6px;
          }
          
          .market-item:last-child {
            border-bottom: none;
            padding-bottom: 0;
          }
        }
        
        /* Exceptional sale styling */
        .exceptional-sale-item {
          margin-bottom: 10px;
        }
        
        .exceptional-sale-item:last-child {
          margin-bottom: 0;
        }
        
        /* Historical trend styling */
        .market-historical-trend .market-value {
          font-size: 12px;
          font-weight: 600;
        }
        
        .market-historical-trend .market-label {
          color: #2c3e50;
          font-weight: 500;
        }
        
        .market-historical-trend .market-help {
          font-size: 9px;
          font-style: italic;
        }
      `;
      document.head.appendChild(style);
    }
  }

  // NEW: Smart method to determine the best artist for market analysis
  determineBestArtistForMarketAnalysis(data, detectedArtist = null) {
    // Priority order:
    // 1. Artist field if filled and substantial
    // 2. Detected artist from title (AI or rule-based)
    // 3. Rule-based detection as fallback
    // 4. Brand detection for luxury goods, designer items, etc.
    // 5. NEW: Generic freetext search for items without clear artists or brands
    
    console.log('🎯 Determining best artist for market analysis:', {
      artistField: data.artist,
      detectedArtist: detectedArtist,
      title: data.title
    });
    
    // Check artist field first
    if (data.artist && data.artist.trim().length > 2) {
      console.log('✅ Using artist from artist field:', data.artist.trim());
      return {
        artist: data.artist.trim(),
        source: 'artist_field',
        confidence: 0.9
      };
    }
    
    // Check if we have a detected artist (from AI or rules)
    if (detectedArtist && detectedArtist.detectedArtist) {
      console.log('✅ Using detected artist from title:', detectedArtist.detectedArtist);
      return {
        artist: detectedArtist.detectedArtist,
        source: detectedArtist.source || 'detected',
        confidence: detectedArtist.confidence || 0.7
      };
    }
    
    // Fallback: Try rule-based detection on the title
    const ruleBasedArtist = this.detectMisplacedArtistRuleBased(data.title, data.artist);
    if (ruleBasedArtist && ruleBasedArtist.detectedArtist) {
      console.log('✅ Using rule-based detected artist:', ruleBasedArtist.detectedArtist);
      return {
        artist: ruleBasedArtist.detectedArtist,
        source: 'rule_based',
        confidence: ruleBasedArtist.confidence || 0.6
      };
    }
    
    // NEW: Brand detection for luxury goods and designer items
    const detectedBrand = this.detectBrandForMarketAnalysis(data.title, data.description);
    if (detectedBrand) {
      console.log('✅ Using detected brand for market analysis:', detectedBrand.brand);
      return {
        artist: detectedBrand.brand, // Use brand as "artist" for market analysis
        source: 'brand_detected',
        confidence: detectedBrand.confidence,
        isBrand: true // Flag to indicate this is a brand, not an artist
      };
    }
    
    // NEW: Enhanced freetext search that considers any available artist information
    // Collect any artist info we might have found during detection process
    let availableArtistInfo = null;
    
    // Check if we have any artist information to enhance the freetext search
    if (data.artist && data.artist.trim().length > 0) {
      availableArtistInfo = {
        artist: data.artist.trim(),
        source: 'artist_field',
        confidence: 0.9
      };
      console.log('🎯 Found artist field for enhanced freetext search:', availableArtistInfo.artist);
    } else if (detectedArtist && detectedArtist.detectedArtist) {
      availableArtistInfo = {
        artist: detectedArtist.detectedArtist,
        source: detectedArtist.source || 'detected',
        confidence: detectedArtist.confidence || 0.7
      };
      console.log('🎯 Found detected artist for enhanced freetext search:', availableArtistInfo.artist);
    } else if (ruleBasedArtist && ruleBasedArtist.detectedArtist) {
      availableArtistInfo = {
        artist: ruleBasedArtist.detectedArtist,
        source: 'rule_based',
        confidence: ruleBasedArtist.confidence || 0.6
      };
      console.log('🎯 Found rule-based artist for enhanced freetext search:', availableArtistInfo.artist);
    }
    
    // Generate freetext search with artist enhancement if available
    const freetextSearch = this.generateFreetextSearch(data.title, data.description, availableArtistInfo);
    if (freetextSearch) {
      console.log('✅ Using enhanced freetext search for market analysis:', freetextSearch.searchTerms);
      return {
        artist: freetextSearch.searchTerms, // Use search terms as "artist" for market analysis
        source: 'freetext_search',
        confidence: freetextSearch.confidence,
        isFreetext: true, // Flag to indicate this is freetext search
        searchStrategy: freetextSearch.strategy,
        hasArtist: freetextSearch.hasArtist // Indicates if artist was included
      };
    }
    
    console.log('❌ No artist, brand, or searchable terms found for market analysis');
    return null;
  }

  // NEW: Generate intelligent freetext search terms for market analysis
  generateFreetextSearch(title, description, artistInfo = null) {
    console.log('🔍 Generating freetext search for:', title);
    console.log('🎯 Artist info available:', artistInfo);
    
    // Extract object type (first word in caps)
    const objectType = this.extractObjectType(title);
    if (!objectType) {
      console.log('❌ No object type found for freetext search');
      return null;
    }
    
    // NEW: Special handling for jewelry items
    const isJewelry = this.isJewelryItem(objectType, title, description);
    
    // NEW: Special handling for coins/numismatics
    const isCoin = this.isCoinItem(objectType, title, description);
    
    // NEW: Special handling for stamps/philatelic items
    const isStamp = this.isStampItem(objectType, title, description);
    
    // NEW: Special handling for audio/electronics equipment
    const isAudio = this.isAudioEquipment(objectType, title, description);
    
    // Extract key descriptive terms from title and description
    const text = `${title} ${description}`.toLowerCase();
    const searchTerms = [];
    let confidence = 0.4; // Base confidence for freetext search
    let strategy = 'basic';
    
    // PRIORITY: If we have artist information, include it first
    if (artistInfo && artistInfo.artist) {
      console.log('🎯 Adding artist to freetext search:', artistInfo.artist);
      searchTerms.push(artistInfo.artist);
      confidence += 0.3; // Significantly higher confidence when artist is known
      strategy = 'artist_enhanced_freetext';
    }
    
    // Always include the object type (but after artist if available)
    searchTerms.push(objectType.toLowerCase());
    
    if (isJewelry) {
      console.log('💍 Detected jewelry item - using jewelry-specific search strategy');
      return this.generateJewelrySearch(objectType, title, description, artistInfo, searchTerms, confidence);
    }
    
    if (isCoin) {
      console.log('🪙 Detected coin/numismatic item - using coin-specific search strategy');
      return this.generateCoinSearch(objectType, title, description, artistInfo, searchTerms, confidence);
    }
    
    if (isStamp) {
      console.log('📜 Detected stamp/philatelic item - using stamp-specific search strategy');
      return this.generateStampSearch(objectType, title, description, artistInfo, searchTerms, confidence);
    }
    
    if (isAudio) {
      console.log('🎵 Detected audio/electronics item - using audio-specific search strategy');
      return this.generateAudioSearch(objectType, title, description, artistInfo, searchTerms, confidence);
    }
    
    // Extract title-specific descriptive terms (highest priority after artist)
    const titleDescriptors = this.extractTitleDescriptors(title);
    if (titleDescriptors.length > 0) {
      searchTerms.push(...titleDescriptors);
      confidence += 0.2;
      strategy = artistInfo ? 'artist_enhanced_freetext' : 'descriptor_based';
    }
    
    // Extract styles
    const styles = this.extractStyles(text);
    if (styles.length > 0) {
      searchTerms.push(...styles);
      confidence += 0.1;
      if (!strategy.includes('artist')) {
        strategy = strategy === 'descriptor_based' ? strategy : 'style_based';
      }
    }
    
    // Extract colors (important for market matching)
    const colors = this.extractColors(text);
    if (colors.length > 0) {
      searchTerms.push(...colors);
      confidence += 0.15; // Colors are quite valuable for market analysis
      if (!strategy.includes('artist') && !strategy.includes('based')) {
        strategy = 'color_based';
      }
    }
    
    // Extract periods/dates
    const periods = this.extractPeriods(text);
    if (periods.length > 0) {
      searchTerms.push(...periods);
      confidence += 0.1;
      if (!strategy.includes('artist') && !strategy.includes('based')) {
      strategy = 'period_based';
      }
    }
    
    // Extract materials (lower priority now, and limit to avoid over-long searches)
    const materials = this.extractMaterials(text);
    if (materials.length > 0 && searchTerms.length < 4) { // Reduced limit when artist is present
      searchTerms.push(...materials);
      confidence += 0.1;
      if (!strategy.includes('artist') && !strategy.includes('based')) {
        strategy = 'material_based';
      }
    }
    
    // Extract techniques (even lower priority when artist is available)
    const techniques = this.extractTechniques(text);
    if (techniques.length > 0 && searchTerms.length < 5) {
      searchTerms.push(...techniques);
      confidence += 0.1;
      if (!strategy.includes('artist') && !strategy.includes('based')) {
      strategy = 'technique_based';
      }
    }
    
    // Extract manufacturers/makers (lowest priority)
    const makers = this.extractMakers(text);
    if (makers.length > 0 && searchTerms.length < 5) {
      searchTerms.push(...makers);
      confidence += 0.2;
      if (!strategy.includes('artist')) {
      strategy = 'maker_based';
      }
    }
    
    // GENERIC FALLBACK SYSTEM: Enhance insufficient searches before giving up
    if (searchTerms.length < 2) {
      console.log('🔧 Applying fallback enhancement for insufficient terms:', searchTerms);
      
      // Try to extract manufacturers/companies/brands
      const manufacturers = this.extractManufacturers(text);
      if (manufacturers.length > 0) {
        searchTerms.push(...manufacturers.slice(0, 2));
        confidence += 0.3;
        strategy = 'manufacturer_enhanced';
        console.log('🏭 Added manufacturers:', manufacturers);
      }
      
      // Try to extract geographic/origin terms 
      const geographic = this.extractGeographicTerms(text);
      if (geographic.length > 0 && searchTerms.length < 3) {
        searchTerms.push(...geographic.slice(0, 1));
        confidence += 0.2;
        strategy = strategy === 'manufacturer_enhanced' ? 'manufacturer_geographic' : 'geographic_enhanced';
        console.log('🌍 Added geographic terms:', geographic);
      }
      
      // Try to extract traditional/cultural terms
      const cultural = this.extractCulturalTerms(text);
      if (cultural.length > 0 && searchTerms.length < 3) {
        searchTerms.push(...cultural.slice(0, 1));
        confidence += 0.15;
        strategy = strategy.includes('enhanced') ? strategy : 'cultural_enhanced';
        console.log('🏛️ Added cultural terms:', cultural);
      }
      
      // For certain single-term categories, allow the search to proceed
      if (searchTerms.length === 1) {
        const singleTermCategories = [
          'dalahäst', 'keramik', 'porslin', 'glas', 'kristall', 'trä', 'metall',
          'textil', 'möbler', 'lampa', 'vas', 'skål', 'fat', 'kanna', 'krus',
          'skulptur', 'relief', 'medalj', 'mynt', 'klocka', 'spegel', 'ram'
        ];
        
        const firstTerm = searchTerms[0].toLowerCase();
        if (singleTermCategories.some(category => firstTerm.includes(category) || category.includes(firstTerm))) {
          console.log('✅ Allowing single-term search for recognized category:', firstTerm);
          confidence = Math.max(confidence, 0.4); // Minimum confidence for single-term
          strategy = 'single_term_category';
        }
      }
    }
    
    // Adjust minimum requirements based on whether we have an artist
    const minTerms = artistInfo ? 2 : 1; // More flexible: allow single terms in some cases
    if (searchTerms.length < minTerms) {
      console.log('❌ Not enough search terms for viable freetext search:', searchTerms);
      return null;
    }
    
    // Limit to most relevant terms (artist searches can be more focused)
    const maxTerms = artistInfo ? 4 : 5; // Shorter searches when artist is known
    const finalTerms = searchTerms.slice(0, maxTerms);
    const searchString = finalTerms.join(' ');
    
    console.log('✅ Generated freetext search:', {
      terms: finalTerms,
      searchString: searchString,
      confidence: confidence,
      strategy: strategy,
      hasArtist: !!artistInfo
    });
    
    return {
      searchTerms: searchString,
      confidence: Math.min(confidence, 0.9), // Higher cap when artist is known
      strategy: strategy,
      termCount: finalTerms.length,
      hasArtist: !!artistInfo
    };
  }

  // NEW: Check if item is jewelry
  isJewelryItem(objectType, title, description) {
    const jewelryTypes = [
      'ring', 'ringar', 'förlovningsring', 'vigselring',
      'halsband', 'kedja', 'collier',
      'armband', 'bangel',
      'örhängen', 'örhänge',
      'brosch', 'nål',
      'hänge', 'pendant',
      'klocka', 'armbandsur', 'fickur',
      'manschettknappar', 'knappar',
      'smycke', 'smycken', 'juveler'
    ];
    
    const textToCheck = `${objectType} ${title} ${description}`.toLowerCase();
    return jewelryTypes.some(type => textToCheck.includes(type));
  }

  // NEW: Check if item is coin/numismatic
  isCoinItem(objectType, title, description) {
    const coinTypes = [
      'mynt', 'coin', 'coins', 'myntserie', 'myntsamling',
      'silvermynt', 'guldmynt', 'kopparmynt', 'bronsmynt',
      'medal', 'medalj', 'minnesmynt', 'commemorative',
      'sedel', 'banknote', 'paper money', 'riksdaler',
      'öre', 'krona', 'kronor', 'skilling', 'mark',
      'numismatic', 'numismatik', 'mynthandel'
    ];
    
    const textToCheck = `${objectType} ${title} ${description}`.toLowerCase();
    return coinTypes.some(type => textToCheck.includes(type));
  }

  // NEW: Check if item is stamp/philatelic
  isStampItem(objectType, title, description) {
    const stampTypes = [
      'frimärke', 'frimärken', 'stamp', 'stamps', 'philatelic', 'philately',
      'postfrisk', 'stämplad', 'stämpel', 'postmark', 'postal',
      'brevfrimärke', 'jubileumsfrimärke', 'minnesfrimärke',
      'frimärkssamling', 'frimärksalbum', 'stampcollection',
      'frimärksblad', 'frimärksblock', 'block', 'haefte',
      'frankering', 'porto', 'poststämpel'
    ];
    
    const textToCheck = `${objectType} ${title} ${description}`.toLowerCase();
    return stampTypes.some(type => textToCheck.includes(type));
  }

  // NEW: Extract jewelry-specific materials
  extractJewelryMaterials(text) {
    const materialPattern = /(?:(\d+k?\s*)?(?:guld|gold|vit-?guld|rött?-?guld|gul-?guld|ros[ée]-?guld|silver|sterlingsilver|sterling|platina|titan|stål|vitguld|rödguld|gulgul))/gi;
    const matches = text.match(materialPattern) || [];
    
    return matches
      .map(match => match.trim().toLowerCase())
      .filter((material, index, arr) => arr.indexOf(material) === index) // Remove duplicates
      .slice(0, 2); // Max 2 materials
  }

  // NEW: Extract weight information
  extractWeight(text) {
    const weightPattern = /(\d+[,.]?\d*)\s*(?:gram|g|karat|ct|dwt)/gi;
    const match = text.match(weightPattern);
    
    if (match && match[0]) {
      return match[0].toLowerCase().replace(/[,]/g, '.');
    }
    
    return null;
  }

  // NEW: Extract stone information
  extractStones(text) {
    const stonePattern = /(?:diamant|brilliant|smaragd|rubin|safir|pärla|pearl|onyx|opal|ametist|akvamarin|topas|granat|turmalin|kvarts|jade)/gi;
    const matches = text.match(stonePattern) || [];
    
    return matches
      .map(stone => stone.toLowerCase())
      .filter((stone, index, arr) => arr.indexOf(stone) === index)
      .slice(0, 2);
  }

  // NEW: Extract jewelry size information
  extractJewelrySize(text) {
    // Ring sizes
    const ringSizePattern = /(?:storlek|size)\s*[\/:]*\s*(\d+[,.]?\d*)/gi;
    const ringMatch = text.match(ringSizePattern);
    if (ringMatch) {
      return `storlek ${ringMatch[0].match(/\d+[,.]?\d*/)[0]}`;
    }
    
    // Diameter
    const diameterPattern = /(?:diameter|innerdiameter)\s*(\d+[,.]?\d*)\s*(?:mm|cm)/gi;
    const diameterMatch = text.match(diameterPattern);
    if (diameterMatch) {
      return `diameter ${diameterMatch[0].match(/\d+[,.]?\d*/)[0]}mm`;
    }
    
    // Chain length
    const lengthPattern = /(?:längd|length)\s*(\d+[,.]?\d*)\s*(?:mm|cm)/gi;
    const lengthMatch = text.match(lengthPattern);
    if (lengthMatch) {
      return `längd ${lengthMatch[0].match(/\d+[,.]?\d*/)[0]}cm`;
    }
    
    return null;
  }

  // NEW: Extract descriptive terms specifically from the title (higher priority than materials)
  extractTitleDescriptors(title) {
    const descriptors = [];
    const titleLower = title.toLowerCase();
    
    // Common rug/carpet descriptors
    const rugDescriptors = [
      'orientalisk', 'persisk', 'antik', 'vintage', 'handknuten', 'handvävd',
      'kilim', 'gabbeh', 'tabriz', 'isfahan', 'kashan', 'nain', 'qom', 'heriz',
      'bidjar', 'shiraz', 'turkisk', 'kaukasisk', 'tibetansk', 'indisk',
      'bokhara', 'afghanistan', 'beluch', 'turkmen'
    ];
    
    // Art-related descriptors
    const artDescriptors = [
      'abstrakt', 'figurativ', 'landskap', 'porträtt', 'stilleben', 'marin', 
      'genre', 'religiös', 'mytologisk', 'allegorisk', 'historisk'
    ];
    
    // Furniture descriptors  
    const furnitureDescriptors = [
      'antik', 'vintage', 'retro', 'modern', 'samtida', 'neoklassisk',
      'empire', 'biedermeier', 'jugend', 'art deco', 'skandinavisk',
      'gustaviansk', 'karl johan', 'louis', 'chippendale', 'sheraton'
    ];
    
    // Porcelain/ceramics descriptors
    const porcelainDescriptors = [
      'porslin', 'fajans', 'stengods', 'lergods', 'keramik', 'benporslin',
      'hårdporslin', 'mjukporslin'
    ];
    
    // Glass descriptors
    const glassDescriptors = [
      'kristall', 'optisk', 'slipat', 'graverat', 'etsat', 'målat',
      'färgat', 'klart', 'frostat', 'iriserat'
    ];
    
    // NEW: Model/toy/collectible descriptors
    const modelDescriptors = [
      'modellbilar', 'modellauto', 'miniatyr', 'samlarobjekt', 'vintage',
      'diecast', 'leksaksbilar', 'racing', 'formel', 'sportvagn', 'limousine',
      'lastbil', 'buss', 'motorcykel', 'flygplan', 'helikopter', 'båt',
      'tåg', 'lokomotiv', 'traktor', 'grävmaskin', 'brandkår', 'polis',
      'ambulans', 'militär', 'ferrari', 'porsche', 'mercedes', 'bmw',
      'audi', 'volvo', 'saab', 'ford', 'chevrolet', 'jaguar', 'bentley',
      'rolls-royce', 'lamborghini', 'maserati', 'alfa romeo', 'fiat',
      'opel', 'volkswagen', 'toyota', 'honda', 'nissan', 'mazda',
      'tekno', 'dinky', 'corgi', 'hot wheels', 'matchbox', 'bburago',
      'autoart', 'minichamps', 'kyosho', 'spark', 'neo', 'avenue43'
    ];
    
    // Scale descriptors for models
    const scaleDescriptors = [
      '1:43', '1:32', '1:24', '1:18', '1:12', '1:87', 'h0', 'n-skala',
      'skala', 'scale', 'spur'
    ];
    
    // Combine all descriptor lists
    const allDescriptors = [
      ...rugDescriptors,
      ...artDescriptors,
      ...furnitureDescriptors, 
      ...porcelainDescriptors,
      ...glassDescriptors
    ];
    
    // Extract descriptors that appear in title
    allDescriptors.forEach(descriptor => {
      if (titleLower.includes(descriptor)) {
        descriptors.push(descriptor);
      }
    });
    
    // Also look for numbered items (e.g., "3 st", "ett par")
    const quantityMatch = titleLower.match(/(\d+\s*st|ett\s*par|par)/);
    if (quantityMatch) {
      // For numbered items, the descriptor might be less important
      // but we still want to capture it for context
    }
    
    return descriptors.slice(0, 2); // Max 2 descriptors from title
  }

  // Helper method to extract materials from text
  extractMaterials(text) {
    const materials = [];
    const materialPatterns = [
      // Metals
      'silver', 'guld', 'brons', 'koppar', 'mässing', 'tenn', 'järn', 'stål', 'platina',
      // Glass and ceramics
      'glas', 'kristall', 'porslin', 'keramik', 'lergods', 'stengods', 'fajans',
      // Wood
      'trä', 'ek', 'björk', 'furu', 'mahogny', 'valnöt', 'teak', 'bok', 'ask', 'lönn',
      // Textiles
      'tyg', 'sammet', 'siden', 'ull', 'bomull', 'lin', 'läder',
      // Stone
      'marmor', 'granit', 'kalksten', 'sandsten',
      // Other materials
      'plast', 'gummi', 'papper', 'kartong',
      // NEW: Model/toy materials
      'resin', 'metall', 'diecast', 'zink', 'zamak', 'vitmetall', 'aluminium',
      'vinyl', 'pvc', 'abs', 'polyresin', 'pewter'
    ];
    
    materialPatterns.forEach(material => {
      // Use word boundary matching to avoid false positives like "ek" in "dekor"
      const wordBoundaryPattern = new RegExp(`\\b${material}\\b`, 'i');
      if (wordBoundaryPattern.test(text)) {
        materials.push(material);
      }
    });
    
    return materials.slice(0, 2); // Max 2 materials
  }

  // Helper method to extract periods from text
  extractPeriods(text) {
    const periods = [];
    const periodPatterns = [
      /(\d{4})/g,                    // 1950
      /(\d{2,4}-tal)/g,              // 1900-tal
      /(\d{2}\/\d{4}-tal)/g,         // 17/1800-tal
      /(1[6-9]\d{2})/g,              // 1600-1999
      /(20[0-2]\d)/g                 // 2000-2029
    ];
    
    periodPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        periods.push(...matches.slice(0, 1)); // Max 1 period
      }
    });
    
    return periods;
  }

  // NEW: Extract colors from text (important for market matching)
  extractColors(text) {
    const colors = [];
    const colorPatterns = [
      // Basic colors
      'röd', 'blå', 'grön', 'gul', 'svart', 'vit', 'brun', 'grå', 'rosa', 'lila', 'orange',
      // Color variations
      'rött', 'blått', 'grönt', 'gult', 'brunt', 'grått', 'rosig', 'ljus', 'mörk',
      // Specific shades
      'marinblå', 'turkos', 'beige', 'elfenben', 'krämvit', 'pastellblå', 'djupblå',
      'smaragdgrön', 'mörkgrön', 'ljusgrön', 'bordeaux', 'vinröd', 'roströd', 'tegelröd',
      'guldgul', 'citrongul', 'solgul', 'chokladbrun', 'kastanjebrun', 'nötbrun',
      'silvergrå', 'stålgrå', 'askgrå', 'antracit', 'kol', 'krita', 'snövit',
      // Color combinations and patterns
      'flerfärgad', 'blandade färger', 'färgglad', 'färgrik', 'monokrom', 'tvåfärgad',
      // Special color terms
      'naturell', 'ofärgad', 'transparent', 'genomskinlig', 'opak', 'matt', 'blank',
      'metallic', 'glittrande', 'skimrande', 'iriserade'
    ];
    
    colorPatterns.forEach(color => {
      // Use word boundary matching to avoid false positives
      const wordBoundaryPattern = new RegExp(`\\b${color}\\b`, 'i');
      if (wordBoundaryPattern.test(text)) {
        colors.push(color);
      }
    });
    
    return colors.slice(0, 2); // Max 2 colors to keep searches focused
  }

  // Helper method to extract styles from text
  extractStyles(text) {
    const styles = [];
    const stylePatterns = [
      'art deco', 'jugend', 'funktionalism', 'bauhaus', 'modernism',
      'klassicism', 'empire', 'gustaviansk', 'rokoko', 'barock',
      'skandinavisk', 'svensk', 'dansk', 'norsk', 'finsk',
      'minimalistisk', 'rustik', 'lantlig', 'elegant'
    ];
    
    stylePatterns.forEach(style => {
      if (text.includes(style)) {
        styles.push(style);
      }
    });
    
    return styles.slice(0, 1); // Max 1 style
  }

  // Helper method to extract techniques from text
  extractTechniques(text) {
    const techniques = [];
    const techniquePatterns = [
      'handmålad', 'handgjord', 'maskingjord', 'pressad', 'gjuten', 'svarv',
      'intarsia', 'fanér', 'massiv', 'laminerad', 'slipad', 'graverad',
      'emaljerad', 'förgylld', 'försilvrad', 'patinerad', 'polerad'
    ];
    
    techniquePatterns.forEach(technique => {
      if (text.includes(technique)) {
        techniques.push(technique);
      }
    });
    
    return techniques.slice(0, 1); // Max 1 technique
  }

  // Helper method to extract makers/manufacturers (not luxury brands)
  extractMakers(text) {
    const makers = [];
    const makerPatterns = [
      // Swedish manufacturers
      'kockums', 'husqvarna', 'electrolux', 'ericsson', 'volvo',
      'saab', 'scania', 'sandvik', 'atlas copco',
      // International manufacturers
      'philips', 'siemens', 'bosch', 'braun', 'sony', 'panasonic',
      'general electric', 'westinghouse', 'kodak', 'leica',
      // Toy manufacturers
      'lego', 'brio', 'meccano', 'dinky toys', 'corgi', 'tekno',
      // Clock manufacturers
      'westclox', 'sessions', 'ansonia', 'waterbury', 'ingraham'
    ];
    
    makerPatterns.forEach(maker => {
      if (text.includes(maker)) {
        makers.push(maker);
      }
    });
    
    return makers.slice(0, 1); // Max 1 maker
  }

  // NEW: Detect brands for market analysis (luxury goods, designer items, etc.)
  detectBrandForMarketAnalysis(title, description) {
    const text = `${title} ${description}`.toLowerCase();
    
    // Comprehensive luxury and designer brand list
    const luxuryBrands = {
      // Luxury watches
      'rolex': { confidence: 0.95, category: 'watches' },
      'omega': { confidence: 0.9, category: 'watches' },
      'cartier': { confidence: 0.95, category: 'watches' },
      'patek philippe': { confidence: 0.95, category: 'watches' },
      'audemars piguet': { confidence: 0.95, category: 'watches' },
      'vacheron constantin': { confidence: 0.95, category: 'watches' },
      'jaeger-lecoultre': { confidence: 0.9, category: 'watches' },
      'iwc': { confidence: 0.85, category: 'watches' },
      'breitling': { confidence: 0.85, category: 'watches' },
      'tag heuer': { confidence: 0.8, category: 'watches' },
      'tudor': { confidence: 0.8, category: 'watches' },
      'longines': { confidence: 0.75, category: 'watches' },
      'tissot': { confidence: 0.7, category: 'watches' },
      'seiko': { confidence: 0.7, category: 'watches' },
      'citizen': { confidence: 0.7, category: 'watches' },
      
      // Luxury jewelry
      'tiffany': { confidence: 0.9, category: 'jewelry' },
      'bulgari': { confidence: 0.9, category: 'jewelry' },
      'van cleef': { confidence: 0.95, category: 'jewelry' },
      'harry winston': { confidence: 0.95, category: 'jewelry' },
      'graff': { confidence: 0.9, category: 'jewelry' },
      'chopard': { confidence: 0.85, category: 'jewelry' },
      'boucheron': { confidence: 0.85, category: 'jewelry' },
      'piaget': { confidence: 0.85, category: 'jewelry' },
      
      // Scandinavian design brands
      'georg jensen': { confidence: 0.9, category: 'design' },
      'royal copenhagen': { confidence: 0.85, category: 'porcelain' },
      'bing & grøndahl': { confidence: 0.8, category: 'porcelain' },
      'orrefors': { confidence: 0.85, category: 'glass' },
      'kosta boda': { confidence: 0.8, category: 'glass' },
      'gustavsberg': { confidence: 0.8, category: 'porcelain' },
      'rörstrand': { confidence: 0.8, category: 'porcelain' },
      'arabia': { confidence: 0.8, category: 'porcelain' },
      'iittala': { confidence: 0.8, category: 'glass' },
      'marimekko': { confidence: 0.75, category: 'design' },
      
      // Furniture designers/brands
      'svenskt tenn': { confidence: 0.85, category: 'furniture' },
      'carl malmsten': { confidence: 0.9, category: 'furniture' },
      'bruno mathsson': { confidence: 0.9, category: 'furniture' },
      'lammhults': { confidence: 0.8, category: 'furniture' },
      'källemo': { confidence: 0.8, category: 'furniture' },
      'norrlands möbler': { confidence: 0.75, category: 'furniture' },
      'cassina': { confidence: 0.85, category: 'furniture' },
      'vitra': { confidence: 0.8, category: 'furniture' },
      'herman miller': { confidence: 0.85, category: 'furniture' },
      'knoll': { confidence: 0.85, category: 'furniture' },
      'fritz hansen': { confidence: 0.85, category: 'furniture' },
      'hay': { confidence: 0.75, category: 'furniture' },
      
      // Fashion/luxury goods
      'hermès': { confidence: 0.95, category: 'luxury' },
      'louis vuitton': { confidence: 0.95, category: 'luxury' },
      'chanel': { confidence: 0.95, category: 'luxury' },
      'gucci': { confidence: 0.9, category: 'luxury' },
      'prada': { confidence: 0.9, category: 'luxury' },
      'bottega veneta': { confidence: 0.9, category: 'luxury' },
      'céline': { confidence: 0.85, category: 'luxury' },
      'dior': { confidence: 0.9, category: 'luxury' },
      'yves saint laurent': { confidence: 0.85, category: 'luxury' },
      
      // Art glass and ceramics
      'lalique': { confidence: 0.9, category: 'glass' },
      'daum': { confidence: 0.85, category: 'glass' },
      'baccarat': { confidence: 0.9, category: 'glass' },
      'waterford': { confidence: 0.8, category: 'glass' },
      'murano': { confidence: 0.8, category: 'glass' },
      'venini': { confidence: 0.85, category: 'glass' },
      'lladró': { confidence: 0.8, category: 'porcelain' },
      'meissen': { confidence: 0.9, category: 'porcelain' },
      'dresden': { confidence: 0.8, category: 'porcelain' },
      'sèvres': { confidence: 0.85, category: 'porcelain' },
      
      // Musical instruments
      'steinway': { confidence: 0.95, category: 'instruments' },
      'stradivarius': { confidence: 0.98, category: 'instruments' },
      'gibson': { confidence: 0.85, category: 'instruments' },
      'fender': { confidence: 0.85, category: 'instruments' },
      'martin': { confidence: 0.8, category: 'instruments' },
      'yamaha': { confidence: 0.75, category: 'instruments' }
    };
    
    // Check for brand matches in title (higher priority)
    for (const [brand, info] of Object.entries(luxuryBrands)) {
      // Check if brand appears at the beginning of title (most reliable)
      const titleLower = title.toLowerCase();
      if (titleLower.startsWith(brand + ',') || titleLower.startsWith(brand + ' ')) {
        console.log(`🏷️ Found brand at title start: ${brand} (confidence: ${info.confidence})`);
        return {
          brand: this.formatBrandName(brand),
          confidence: info.confidence,
          category: info.category,
          position: 'title_start'
        };
      }
      
      // Check if brand appears anywhere in title
      if (titleLower.includes(brand)) {
        console.log(`🏷️ Found brand in title: ${brand} (confidence: ${info.confidence * 0.9})`);
        return {
          brand: this.formatBrandName(brand),
          confidence: info.confidence * 0.9, // Slightly lower confidence
          category: info.category,
          position: 'title'
        };
      }
    }
    
    // Check description as fallback (lower confidence)
    for (const [brand, info] of Object.entries(luxuryBrands)) {
      if (text.includes(brand)) {
        console.log(`🏷️ Found brand in description: ${brand} (confidence: ${info.confidence * 0.7})`);
        return {
          brand: this.formatBrandName(brand),
          confidence: info.confidence * 0.7, // Lower confidence for description matches
          category: info.category,
          position: 'description'
        };
      }
    }
    
    console.log('🏷️ No recognized brands found for market analysis');
    return null;
  }

  // Helper method to format brand names properly
  formatBrandName(brand) {
    // Handle special cases
    const specialCases = {
      'patek philippe': 'Patek Philippe',
      'audemars piguet': 'Audemars Piguet',
      'vacheron constantin': 'Vacheron Constantin',
      'jaeger-lecoultre': 'Jaeger-LeCoultre',
      'tag heuer': 'TAG Heuer',
      'van cleef': 'Van Cleef & Arpels',
      'harry winston': 'Harry Winston',
      'georg jensen': 'Georg Jensen',
      'royal copenhagen': 'Royal Copenhagen',
      'bing & grøndahl': 'Bing & Grøndahl',
      'kosta boda': 'Kosta Boda',
      'svenskt tenn': 'Svenskt Tenn',
      'carl malmsten': 'Carl Malmsten',
      'bruno mathsson': 'Bruno Mathsson',
      'norrlands möbler': 'Norrlands Möbler',
      'herman miller': 'Herman Miller',
      'fritz hansen': 'Fritz Hansen',
      'louis vuitton': 'Louis Vuitton',
      'bottega veneta': 'Bottega Veneta',
      'yves saint laurent': 'Yves Saint Laurent'
    };
    
    if (specialCases[brand.toLowerCase()]) {
      return specialCases[brand.toLowerCase()];
    }
    
    // Default: capitalize first letter of each word
    return brand.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  // NEW: Add market data warnings in a structured, digestible way
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

  // Format warning message with appropriate icons and styling
  formatWarningMessage(warning) {
    let icon = '';
    switch (warning.severity) {
      case 'critical':
        icon = '';
        break;
      case 'high':
        icon = '';
        break;
      case 'medium':
        icon = '';
        break;
      case 'low':
        icon = '';
        break;
      case 'positive':
        icon = '';
        break;
      case 'header':
        icon = '';
        break;
      case 'market-primary':
        icon = '';
        break;
      case 'market-insight':
        icon = '';
        break;
      case 'market-data':
        icon = '';
        break;
      case 'market-activity':
        icon = '';
        break;
      case 'market-note':
        icon = '';
        break;
      default:
        icon = '';
    }
    
    // For valuation suggestions, format with suggested range
    if (warning.suggestedRange) {
      return `<strong>${warning.field}:</strong> ${warning.issue}<br><small>Förslag: ${warning.suggestedRange}</small>`;
    }
    
    return `<strong>${warning.field}:</strong> ${warning.issue}`;
  }

  // Helper method to get artist search result count for comparison
  getArtistSearchResultCount(salesData) {
    // Check if we have artist search results tracked in the historical data
    if (salesData.historical && salesData.historical.artistSearchResults !== undefined) {
      return salesData.historical.artistSearchResults;
    }
    
    // Check if we have it in live data
    if (salesData.live && salesData.live.artistSearchResults !== undefined) {
      return salesData.live.artistSearchResults;
    }
    
    // Fallback: check search context
    if (salesData.searchContext && salesData.searchContext.artistSearchResults) {
      return salesData.searchContext.artistSearchResults;
    }
    
    return null; // We don't have this data tracked
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

  // NEW: Generate jewelry-specific search terms
  generateJewelrySearch(objectType, title, description, artistInfo, baseTerms, baseConfidence) {
    console.log('💍 Generating jewelry-specific search for:', objectType);
    
    const text = `${title} ${description}`.toLowerCase();
    const jewelryTerms = [...baseTerms]; // Start with base terms (artist + object type)
    let confidence = baseConfidence;
    let strategy = artistInfo ? 'artist_enhanced_jewelry' : 'jewelry_specific';
    
    // 1. PRIORITY: Extract materials (most important for jewelry)
    const materials = this.extractJewelryMaterials(text);
    if (materials.length > 0) {
      jewelryTerms.push(...materials.slice(0, 2)); // Max 2 materials
      confidence += 0.4; // Materials are very important for jewelry
      console.log('💍 Added jewelry materials:', materials);
    }
    
    // 2. Extract weight information (important for precious metals)
    const weight = this.extractWeight(text);
    if (weight) {
      jewelryTerms.push(weight);
      confidence += 0.3; // Weight is important for jewelry valuation
      console.log('💍 Added weight:', weight);
    }
    
    // 3. Extract stone information
    const stones = this.extractStones(text);
    if (stones.length > 0) {
      jewelryTerms.push(...stones.slice(0, 2)); // Max 2 stones
      confidence += 0.3;
      console.log('💍 Added stones:', stones);
    }
    
    // 4. Extract size information (important for rings, chains)
    const size = this.extractJewelrySize(text);
    if (size) {
      jewelryTerms.push(size);
      confidence += 0.2;
      console.log('💍 Added size:', size);
    }
    
    // 5. Extract time periods (be conservative to avoid overly specific searches)
    const periods = this.extractPeriods(text);
    if (periods.length > 0) {
      // For jewelry, avoid specific years that might mix categories
      const broadPeriods = periods.filter(period => 
        period.includes('-tal') || 
        ['antik', 'vintage', 'modern', 'klassisk'].includes(period.toLowerCase())
      );
      if (broadPeriods.length > 0) {
        jewelryTerms.push(broadPeriods[0]); // Just one broad period
        confidence += 0.15;
        console.log('💍 Added period (conservative):', broadPeriods[0]);
      }
    }
    
    // Ensure we have enough terms but not too many
    if (jewelryTerms.length < 2) {
      console.log('❌ Not enough jewelry-specific terms found');
      return null;
    }
    
    // Limit to 4 terms for focused jewelry search
    const finalTerms = jewelryTerms.slice(0, 4);
    const searchString = finalTerms.join(' ');
    
    console.log('✅ Generated jewelry search:', {
      terms: finalTerms,
      searchString: searchString,
      confidence: Math.min(confidence, 0.9),
      strategy: strategy,
      hasArtist: !!artistInfo
    });

    return {
      searchTerms: searchString,
      confidence: Math.min(confidence, 0.9),
      strategy: strategy,
      termCount: finalTerms.length,
      hasArtist: !!artistInfo,
      isJewelry: true
    };
  }

  // NEW: Generate coin-specific search terms
  generateCoinSearch(objectType, title, description, artistInfo, baseTerms, baseConfidence) {
    console.log('🪙 Generating coin-specific search for:', objectType);
    
    const text = `${title} ${description}`.toLowerCase();
    const coinTerms = [...baseTerms]; // Start with base terms (artist + object type)
    let confidence = baseConfidence;
    let strategy = artistInfo ? 'artist_enhanced_coin' : 'coin_specific';
    
    // 1. PRIORITY: Extract denominations (most important for coins)
    const denominations = this.extractDenominations(text);
    if (denominations.length > 0) {
      coinTerms.push(...denominations.slice(0, 3)); // Max 3 denominations
      confidence += 0.4; // Denominations are very important for coins
      console.log('🪙 Added denominations:', denominations);
    }
    
    // 2. Extract material information (important for coins)
    const materials = this.extractCoinMaterials(text);
    if (materials.length > 0) {
      coinTerms.push(...materials.slice(0, 2)); // Max 2 materials
      confidence += 0.3; // Materials are important for coins
      console.log('🪙 Added coin materials:', materials);
    }
    
    // 3. Extract country/mint information
    const countries = this.extractCountries(text);
    if (countries.length > 0) {
      coinTerms.push(...countries.slice(0, 1)); // Max 1 country
      confidence += 0.2;
      console.log('🪙 Added country:', countries);
    }
    
    // 4. Extract years (but be careful not to be too specific like jewelry)
    const years = this.extractYears(text);
    if (years.length > 0) {
      // For coins, years are often important but we can be more specific than jewelry
      coinTerms.push(...years.slice(0, 2)); // Max 2 years
      confidence += 0.2;
      console.log('🪙 Added years:', years);
    }
    
    // 5. Extract series information
    const series = this.extractCoinSeries(text);
    if (series.length > 0) {
      coinTerms.push(...series.slice(0, 1));
      confidence += 0.1;
      console.log('🪙 Added series:', series);
    }
    
    // Ensure we have enough terms but not too many
    if (coinTerms.length < 2) {
      console.log('❌ Not enough coin-specific terms found');
      return null;
    }
    
    // Limit to 5 terms for focused coin search
    const finalTerms = coinTerms.slice(0, 5);
    const searchString = finalTerms.join(' ');
    
    console.log('✅ Generated coin search:', {
      terms: finalTerms,
      searchString: searchString,
      confidence: Math.min(confidence, 0.9),
      strategy: strategy,
      hasArtist: !!artistInfo
    });
    
    return {
      searchTerms: searchString,
      confidence: Math.min(confidence, 0.9),
      strategy: strategy,
      termCount: finalTerms.length,
      hasArtist: !!artistInfo,
      isCoin: true
    };
  }

  // NEW: Extract coin denominations
  extractDenominations(text) {
    const denominationPattern = /(\d+[,.]?\d*)\s*(?:öre|krona|kronor|skilling|mark|cent|euro|dollar|pound|yen|franc)/gi;
    const matches = text.match(denominationPattern) || [];
    
    return matches
      .map(match => match.trim().toLowerCase())
      .filter((denom, index, arr) => arr.indexOf(denom) === index) // Remove duplicates
      .slice(0, 3); // Max 3 denominations
  }

  // NEW: Extract coin-specific materials
  extractCoinMaterials(text) {
    const materialPattern = /(?:silver|guld|gold|koppar|copper|brons|bronze|nickel|zink|zinc|järn|iron|stål|steel|platina|platinum)/gi;
    const matches = text.match(materialPattern) || [];
    
    return matches
      .map(match => match.trim().toLowerCase())
      .filter((material, index, arr) => arr.indexOf(material) === index)
      .slice(0, 2);
  }

  // NEW: Extract countries/regions for coins
  extractCountries(text) {
    const countryPattern = /(?:sverige|sweden|norge|norway|danmark|denmark|finland|tyskland|germany|frankrike|france|england|usa|amerika|ryssland|russia)/gi;
    const matches = text.match(countryPattern) || [];
    
    return matches
      .map(match => match.trim().toLowerCase())
      .filter((country, index, arr) => arr.indexOf(country) === index)
      .slice(0, 1);
  }

  // NEW: Extract years for coins
  extractYears(text) {
    const yearPattern = /\b(1[6-9]\d{2}|20[0-2]\d)\b/g; // Years from 1600-2029
    const matches = text.match(yearPattern) || [];
    
    return matches
      .filter((year, index, arr) => arr.indexOf(year) === index)
      .slice(0, 2);
  }

  // NEW: Extract coin series information
  extractCoinSeries(text) {
    const seriesPattern = /(?:serie|series|samling|collection|minnesmynt|commemorative)/gi;
    const matches = text.match(seriesPattern) || [];
    
    return matches
      .map(match => match.trim().toLowerCase())
      .filter((series, index, arr) => arr.indexOf(series) === index)
      .slice(0, 1);
  }

  // NEW: Generate stamp-specific search terms
  generateStampSearch(objectType, title, description, artistInfo, baseTerms, baseConfidence) {
    console.log('📜 Generating stamp-specific search for:', objectType);
    
    const text = `${title} ${description}`.toLowerCase();
    const stampTerms = [...baseTerms]; // Start with base terms (artist + object type)
    let confidence = baseConfidence;
    let strategy = artistInfo ? 'artist_enhanced_stamp' : 'stamp_specific';
    
    // 1. PRIORITY: Extract countries/origins (most important for stamps)
    const countries = this.extractStampCountries(text);
    if (countries.length > 0) {
      stampTerms.push(...countries.slice(0, 2)); // Max 2 countries
      confidence += 0.4; // Countries are very important for stamps
      console.log('🌍 Added stamp countries:', countries);
    }
    
    // 2. Extract collection types
    const collectionTypes = this.extractStampCollectionTypes(text);
    if (collectionTypes.length > 0) {
      stampTerms.push(...collectionTypes.slice(0, 1)); // Max 1 collection type
      confidence += 0.3;
      console.log('📚 Added collection type:', collectionTypes);
    }
    
    // 3. Extract condition information (important for stamps)
    const conditions = this.extractStampConditions(text);
    if (conditions.length > 0) {
      stampTerms.push(...conditions.slice(0, 1)); // Max 1 condition
      confidence += 0.2;
      console.log('📜 Added condition:', conditions);
    }
    
    // 4. Extract time periods (but be conservative to avoid overly specific searches)
    const periods = this.extractStampPeriods(text);
    if (periods.length > 0) {
      // Only add one broad period, not multiple overlapping ones
      stampTerms.push(periods[0]); // Just the first/most general period
      confidence += 0.2;
      console.log('📅 Added period (conservative):', periods[0]);
    }
    
    // Ensure we have enough terms but not too many
    if (stampTerms.length < 2) {
      console.log('❌ Not enough stamp-specific terms found');
      return null;
    }
    
    // Limit to 4 terms for focused stamp search
    const finalTerms = stampTerms.slice(0, 4);
    const searchString = finalTerms.join(' ');
    
    console.log('✅ Generated stamp search:', {
      terms: finalTerms,
      searchString: searchString,
      confidence: Math.min(confidence, 0.9),
      strategy: strategy,
      hasArtist: !!artistInfo
    });
    
    return {
      searchTerms: searchString,
      confidence: Math.min(confidence, 0.9),
      strategy: strategy,
      termCount: finalTerms.length,
      hasArtist: !!artistInfo,
      isStamp: true
    };
  }

  // NEW: Extract stamp-specific countries
  extractStampCountries(text) {
    const countryPattern = /(?:svensk|svenska|sweden|norge|norsk|norway|danmark|danish|finland|finska|tysk|germany|frankrike|france|england|usa|amerikans?k?|ryssland|russia)/gi;
    const matches = text.match(countryPattern) || [];
    
    return matches
      .map(match => match.trim().toLowerCase())
      .filter((country, index, arr) => arr.indexOf(country) === index)
      .slice(0, 2);
  }

  // NEW: Extract stamp collection types
  extractStampCollectionTypes(text) {
    const collectionPattern = /(?:parti|samling|collection|album|lot|block|häfte|serie|set)/gi;
    const matches = text.match(collectionPattern) || [];
    
    return matches
      .map(match => match.trim().toLowerCase())
      .filter((type, index, arr) => arr.indexOf(type) === index)
      .slice(0, 1);
  }

  // NEW: Extract stamp conditions
  extractStampConditions(text) {
    const conditionPattern = /(?:postfrisk|mint|stämplad|used|defekt|damaged|fin|excellent)/gi;
    const matches = text.match(conditionPattern) || [];
    
    return matches
      .map(match => match.trim().toLowerCase())
      .filter((condition, index, arr) => arr.indexOf(condition) === index)
      .slice(0, 1);
  }

  // NEW: Extract stamp periods (conservative approach)
  extractStampPeriods(text) {
    const patterns = [
      /\b(\d{4})-tal\b/g,           // 1900-tal
      /\b(\d{4})s?\b/g,            // 1990s
      /klassisk|vintage|antik/gi    // Classic periods
    ];

    const periods = [];
    for (const pattern of patterns) {
      const matches = [...text.matchAll(pattern)];
      for (const match of matches) {
        if (match[1]) {
          const year = parseInt(match[1]);
          if (year >= 1800 && year <= 2100) {
            periods.push(`${year}-tal`);
          }
        } else {
          periods.push(match[0].toLowerCase());
        }
      }
    }

    return [...new Set(periods)];
  }

  // Audio/Electronics Equipment Detection and Search
  isAudioEquipment(objectType, title, description) {
    const audioKeywords = [
      'skivspelare', 'grammofon', 'radio', 'stereo', 'förstärkare', 'högtalare',
      'kassettdäck', 'cd-spelare', 'tuner', 'mixerbord', 'equalizer',
      'turntable', 'amplifier', 'speaker', 'receiver', 'deck'
    ];

    const text = `${objectType} ${title} ${description}`.toLowerCase();
    return audioKeywords.some(keyword => text.includes(keyword));
  }

  generateAudioSearch(objectType, title, description, artistInfo, baseTerms, baseConfidence) {
    console.log('🎵 Generating audio equipment search for:', title);
    
    // Extract components for audio equipment
    const brand = this.extractAudioBrands(title + ' ' + description);
    const model = this.extractAudioModel(title + ' ' + description);
    const equipmentType = this.extractAudioType(objectType, title);
    const broadPeriod = this.extractBroadPeriod(title + ' ' + description);

    const terms = [];
    let searchStrategy = 'audio_equipment';
    let confidence = 0.7; // Higher confidence for audio equipment

    // Primary strategy: brand + equipment type
    if (brand && equipmentType) {
      terms.push(brand, equipmentType);
      searchStrategy = 'brand_type';
      confidence = 0.8;
    } else if (equipmentType) {
      terms.push(equipmentType);
      if (brand) {
        terms.push(brand);
        searchStrategy = 'type_brand';
      } else {
        searchStrategy = 'type_only';
      }
    }

    // Add broad period if available (avoid specific years for electronics)
    if (broadPeriod) {
      terms.push(broadPeriod);
    }

    const searchString = terms.join(' ');
    
    console.log('🎵 Audio search generated:', {
      brand,
      model,
      equipmentType,
      broadPeriod,
      terms,
      searchString,
      strategy: searchStrategy,
      confidence
    });

    return {
      searchTerms: searchString,
      confidence: Math.min(confidence, 0.9),
      strategy: searchStrategy,
      termCount: terms.length,
      hasArtist: false,
      isAudio: true
    };
  }

  extractAudioBrands(text) {
    const brands = [
      'bang & olufsen', 'b&o', 'dual', 'technics', 'sony', 'pioneer', 'kenwood',
      'yamaha', 'denon', 'marantz', 'onkyo', 'harman kardon', 'jbl', 'bose',
      'mcintosh', 'quad', 'thorens', 'rega', 'linn', 'nad', 'rotel', 'cambridge',
      'arcam', 'audiolab', 'cyrus', 'naim', 'exposure', 'musical fidelity',
      'pro-ject', 'clearaudio', 'akai', 'teac', 'tascam', 'revox', 'tandberg',
      'philips', 'grundig', 'saba', 'telefunken', 'nordmende', 'braun', 'dieter rams'
    ];

    const text_lower = text.toLowerCase();
    
    for (const brand of brands) {
      if (text_lower.includes(brand)) {
        return brand;
      }
    }

    // Look for model numbers that might indicate brand
    const modelMatch = text.match(/\b([A-Z]+)\s*\d+/);
    if (modelMatch) {
      return modelMatch[1].toLowerCase();
    }

    return null;
  }

  extractAudioModel(text) {
    const patterns = [
      /\b([A-Z]+)\s*(\d+[A-Z]*)\b/g,  // DUAL 1219, CS505, etc.
      /modell?\s+([A-Z0-9-]+)/gi,      // modell CS-505
      /typ\s+([A-Z0-9-]+)/gi           // typ 1219
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1] || match[2] || match[0];
      }
    }

    return null;
  }

  extractAudioType(objectType, title) {
    const typeMap = {
      'skivspelare': 'skivspelare',
      'grammofon': 'grammofon',
      'radio': 'radio',
      'stereo': 'stereo',
      'förstärkare': 'förstärkare',
      'amplifier': 'förstärkare',
      'högtalare': 'högtalare',
      'speaker': 'högtalare',
      'kassettdäck': 'kassettdäck',
      'cd-spelare': 'cd-spelare',
      'tuner': 'tuner'
    };

    const text = `${objectType} ${title}`.toLowerCase();
    
    for (const [key, value] of Object.entries(typeMap)) {
      if (text.includes(key)) {
        return value;
      }
    }

    return objectType?.toLowerCase() || 'ljud';
  }

  extractBroadPeriod(text) {
    // For electronics, use broad decades
    const patterns = [
      { pattern: /\b(19[6-9]\d)/, decade: '60-tal' },  // 1960s-1990s
      { pattern: /\b60-?tal/i, decade: '60-tal' },
      { pattern: /\b70-?tal/i, decade: '70-tal' },
      { pattern: /\b80-?tal/i, decade: '80-tal' },
      { pattern: /\b90-?tal/i, decade: '90-tal' },
      { pattern: /vintage|klassisk/i, decade: 'vintage' },
      { pattern: /modern|samtida/i, decade: 'modern' }
    ];

    for (const { pattern, decade } of patterns) {
      if (pattern.test(text)) {
        // For year ranges, determine the appropriate decade
        const yearMatch = text.match(/\b(19[6-9]\d)/);
        if (yearMatch) {
          const year = parseInt(yearMatch[1]);
          if (year >= 1960 && year < 1970) return '60-tal';
          if (year >= 1970 && year < 1980) return '70-tal';
          if (year >= 1980 && year < 1990) return '80-tal';
          if (year >= 1990 && year < 2000) return '90-tal';
        }
        return decade;
      }
    }

    return null;
  }

  // GENERIC FALLBACK METHODS: Enhanced extraction for insufficient searches

  // Extract manufacturers, companies, and well-known brands
  extractManufacturers(text) {
    const manufacturers = [
      // Swedish traditional makers
      'nils olsson', 'grannas', 'rättvik', 'nusnäs', 'hemslöjd', 'hantverk',
      
      // Porcelain/ceramics manufacturers
      'rörstrand', 'gustavsberg', 'arabia', 'royal copenhagen', 'bing & grøndahl',
      'meissen', 'dresden', 'königliche', 'sèvres', 'limoges', 'wedgwood',
      'spode', 'royal doulton', 'minton', 'coalport', 'royal worcester',
      
      // Glass manufacturers
      'orrefors', 'kosta', 'boda', 'åfors', 'strömbergshyttan', 'skruf',
      'johansfors', 'lindshammar', 'målerås', 'smålandshyttan',
      'lalique', 'baccarat', 'waterford', 'bohemia', 'moser',
      
      // Furniture makers
      'ikea', 'svenskt tenn', 'carl malmsten', 'bruno mathsson', 'alvar aalto',
      'arne jacobsen', 'hans wegner', 'finn juhl', 'kaare klint',
      'vitra', 'herman miller', 'knoll', 'cassina', 'fritz hansen',
      
      // Clock/watch manufacturers
      'omega', 'rolex', 'longines', 'breitling', 'cartier', 'patek philippe',
      'audemars piguet', 'vacheron constantin', 'iwc', 'jaeger-lecoultre',
      
      // General manufacturers
      'ab', 'aktiebolag', 'ltd', 'limited', 'gmbh', 'inc', 'corporation',
      'fabriken', 'fabrik', 'werkstätte', 'atelier', 'studio'
    ];

    const text_lower = text.toLowerCase();
    const found = [];
    
    for (const manufacturer of manufacturers) {
      if (text_lower.includes(manufacturer)) {
        found.push(manufacturer);
      }
    }
    
    return [...new Set(found)].slice(0, 2); // Remove duplicates, max 2
  }

  // Extract geographic and origin terms
  extractGeographicTerms(text) {
    const geographic = [
      // Nordic countries and regions
      'sverige', 'sweden', 'svenska', 'stockholm', 'göteborg', 'malmö',
      'norge', 'norway', 'norsk', 'oslo', 'bergen',
      'danmark', 'denmark', 'dansk', 'köpenhamn', 'copenhagen',
      'finland', 'finska', 'helsingfors', 'helsinki',
      'island', 'iceland', 'isländsk', 'reykjavik',
      
      // European regions
      'frankrike', 'france', 'fransk', 'paris', 'lyon', 'limoges',
      'tyskland', 'germany', 'tysk', 'berlin', 'münchen', 'dresden',
      'england', 'engelsk', 'london', 'birmingham', 'stoke-on-trent',
      'italien', 'italy', 'italiensk', 'rom', 'milano', 'florens',
      'österrike', 'austria', 'österrikisk', 'wien', 'salzburg',
      'schweiz', 'switzerland', 'schweizisk', 'zürich', 'geneva',
      
      // Asian regions
      'japan', 'japansk', 'tokyo', 'kyoto', 'osaka',
      'kina', 'china', 'kinesisk', 'beijing', 'shanghai',
      'indien', 'india', 'indisk', 'mumbai', 'delhi',
      
      // Traditional regions
      'orientalisk', 'oriental', 'österlandet', 'asiatisk',
      'skandinavisk', 'nordisk', 'europeisk', 'amerikansk',
      
      // Swedish provinces
      'dalarna', 'skåne', 'värmland', 'småland', 'östergötland',
      'västergötland', 'uppland', 'sörmland', 'närke', 'västmanland'
    ];

    const text_lower = text.toLowerCase();
    const found = [];
    
    for (const location of geographic) {
      if (text_lower.includes(location)) {
        found.push(location);
      }
    }
    
    return [...new Set(found)].slice(0, 1); // Remove duplicates, max 1
  }

  // Extract cultural and traditional terms
  extractCulturalTerms(text) {
    const cultural = [
      // Swedish traditional items
      'dalahäst', 'dalafolk', 'folkkonst', 'hemslöjd', 'hantverk', 'traditionell',
      'svensk', 'svenskt', 'gammaldags', 'antik', 'vintage', 'klassisk',
      
      // Art movements and styles  
      'jugend', 'art nouveau', 'art deco', 'bauhaus', 'modernism',
      'funktionalism', 'skandinavisk design', 'nordisk design',
      
      // Cultural periods
      'medeltid', 'renässans', 'barock', 'rokoko', 'empire', 'biedermeier',
      'viktoriansk', 'edwardiansk', 'georgian', 'regency',
      
      // Traditional crafts
      'keramik', 'krukmakeri', 'glaskonst', 'textilkonst', 'vävkonst',
      'broderi', 'spets', 'träskulptur', 'träsnideri', 'metallkonst',
      'smide', 'silversmide', 'guldsmide', 'emaljkonst',
      
      // Cultural descriptors
      'folklig', 'traditional', 'handgjord', 'handmålad', 'handgraverad',
      'unik', 'enda', 'begränsad', 'limiterad', 'signerad', 'märkt'
    ];

    const text_lower = text.toLowerCase();
    const found = [];
    
    for (const term of cultural) {
      if (text_lower.includes(term)) {
        found.push(term);
      }
    }
    
    return [...new Set(found)].slice(0, 1); // Remove duplicates, max 1
  }
} 