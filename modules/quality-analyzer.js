// modules/quality-analyzer.js - Quality Analysis Module
export class QualityAnalyzer {
  constructor() {
    this.dataExtractor = null;
    this.apiManager = null;
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
        
        const aiResult = await this.apiManager.analyzeForArtist(title, objectType, artistField);
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
    const match = title.match(/^([A-ZÅÄÖÜ]+)/);
    return match ? match[1] : null;
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
      // Malformed quotes with company: OBJEKT, details, "Title, Firstname Lastname Company (missing closing quote) - MOVED UP for priority
      /^([A-ZÅÄÖÜ]+),\s*[^,]+,\s*"[^,]+,\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[a-zåäöü]+)\s+(?:Ikea|IKEA|Svenskt\s+Tenn|Lammhults|Källemo|Norrlands\s+Möbler|Bruno\s+Mathsson|Carl\s+Malmsten|Kosta\s+Boda|Orrefors|Gustavsberg|Artek|Iittala|Arabia)/i,
      
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
        warningMessage = `FELAKTIG PLACERING: "${ruleBasedArtist.detectedArtist}" ska flyttas till konstnärsfältet. Föreslagen titel: "${ruleBasedArtist.suggestedTitle}"`;
        severity = 'high';
      } else {
        warningMessage = `Möjlig konstnär upptäckt: "${ruleBasedArtist.detectedArtist}" - kontrollera om den ska flyttas till konstnärsfält`;
      }
      
      warnings.push({ 
        field: 'Titel', 
        issue: warningMessage, 
        severity: severity 
      });
      score -= (severity === 'high' ? 20 : 10);
    }

    // Description quality checks (aggressively softened: 50 → 35)
    const descLength = data.description.replace(/<[^>]*>/g, '').length;
    if (descLength < 35) {
      warnings.push({ field: 'Beskrivning', issue: 'Överväg att lägga till detaljer om material, teknik, märkningar', severity: 'medium' });
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
        
        // SMART MARKET ANALYSIS: Use the best available artist
        const bestArtist = this.determineBestArtistForMarketAnalysis(data, aiArtist);
        
        if (bestArtist) {
          console.log('💰 Starting sales analysis with best artist:', bestArtist);
          this.pendingAnalyses.add('sales');
          this.updateAILoadingMessage('💰 Analyserar marknadsvärde...');
          this.startSalesAnalysis(bestArtist.artist, data, currentWarnings, currentScore);
        } else {
          console.log('ℹ️ No artist found for sales analysis');
          this.checkAndHideLoadingIndicator();
        }
      }).catch(error => {
        console.error('Error in AI artist detection:', error);
        this.pendingAnalyses.delete('artist');
        
        // Even if AI detection fails, try market analysis with immediate artist
        if (immediateArtist) {
          console.log('💰 AI failed, but starting sales analysis with immediate artist:', immediateArtist);
          this.pendingAnalyses.add('sales');
          this.updateAILoadingMessage('💰 Analyserar marknadsvärde...');
          this.startSalesAnalysis(immediateArtist.artist, data, currentWarnings, currentScore);
        } else {
          this.checkAndHideLoadingIndicator();
        }
      });

      // IMMEDIATE MARKET ANALYSIS: If we have an immediate artist, start analysis right away
      if (immediateArtist) {
        console.log('💰 Starting immediate sales analysis with:', immediateArtist);
        this.pendingAnalyses.add('sales');
        // Small delay to let the artist detection message show first
        setTimeout(() => {
          this.updateAILoadingMessage('💰 Analyserar marknadsvärde...');
        }, 500);
        this.startSalesAnalysis(immediateArtist.artist, data, currentWarnings, currentScore);
      }

    } catch (error) {
      console.error('Error in AI analysis setup:', error);
      this.aiAnalysisActive = false;
      this.hideAILoadingIndicator();
    }
  }

  async handleArtistDetectionResult(aiArtist, data, currentWarnings, currentScore) {
    console.log('🎯 Handling artist detection result:', aiArtist);
    
    if (aiArtist && aiArtist.source === 'ai') {
      // Remove any existing rule-based artist warnings
      const filteredWarnings = currentWarnings.filter(w => 
        !(w.field === 'Titel' && w.issue.includes('Möjlig konstnär upptäckt'))
      );
      
      let severity = 'medium';
      let scoreAdjustment = 0;
      
      // AI-detected artist with verification info
      let message = `AI upptäckte konstnär: "${aiArtist.detectedArtist}"`;
      if (aiArtist.verification?.isRealArtist) {
        message += ` ✓ Verifierad konstnär`;
        if (aiArtist.verification.biography) {
          message += ` (${aiArtist.verification.biography.substring(0, 100)}...)`;
        }
        severity = 'medium';
        scoreAdjustment = 20;
      } else if (aiArtist.verification?.isRealArtist === false) {
        message += ` ⚠️ Kunde inte verifieras som konstnär`;
        severity = 'medium';
        scoreAdjustment = 10;
      } else {
        severity = 'medium';
        scoreAdjustment = 10;
      }
      message += ` - kontrollera om den ska flyttas till konstnärsfält`;
      
      filteredWarnings.push({ 
        field: 'Titel', 
        issue: message, 
        severity: severity 
      });
      
      const newScore = currentScore - scoreAdjustment;
      
      // Update UI immediately with artist detection results
      this.updateQualityIndicator(newScore, filteredWarnings);
      console.log('✅ Artist detection results displayed');
    } else {
      console.log('ℹ️ No AI artist detected (artist field may already be filled or no artist found)');
    }
  }

  async startSalesAnalysis(artistName, data, currentWarnings, currentScore) {
    try {
      console.log('💰 Running comprehensive market analysis for:', artistName);
      
      // Extract additional context for sales analysis from current item
      const objectType = this.extractObjectType(data.title);
      const period = this.extractPeriod(data.title) || this.extractPeriod(data.description);
      const technique = this.extractTechnique(data.title, data.description);
      
      // SMART ENHANCEMENT: Extract additional search terms from title for better matching
      const enhancedSearchTerms = this.extractEnhancedSearchTerms(data.title, data.description);
      
      console.log('🔍 Market analysis parameters:', {
        artist: artistName,
        objectType: objectType,
        period: period,
        technique: technique,
        enhancedTerms: enhancedSearchTerms
      });
      
      const salesData = await this.apiManager.analyzeComparableSales(
        artistName,
        objectType,
        period,
        technique,
        data.description
      );
      
      console.log('💰 Market analysis result:', salesData);
      
      if (salesData) {
        // Handle comprehensive market results immediately when ready
        this.handleSalesAnalysisResult(salesData, currentWarnings, currentScore);
      } else {
        console.log('ℹ️ No market data available for this item');
        // Optionally show a message that no sales data was found
        this.showNoSalesDataMessage(currentWarnings, currentScore);
      }
      
    } catch (error) {
      console.error('💥 Error in market analysis:', error);
      // Show error message to user if needed
      this.showSalesAnalysisError(error, currentWarnings, currentScore);
    } finally {
      this.pendingAnalyses.delete('sales');
      this.checkAndHideLoadingIndicator();
    }
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

  showNoSalesDataMessage(currentWarnings, currentScore) {
    // Get current warnings (might have been updated by artist detection)
    const currentWarningsElement = document.querySelector('.quality-warnings ul');
    let updatedWarnings = [...currentWarnings];
    
    // If artist detection already updated the warnings, get the current state
    if (currentWarningsElement) {
      updatedWarnings = this.extractCurrentWarnings();
    }
    
    // Add informational message about no sales data
    updatedWarnings.push({
      field: 'Marknadsvärde',
      issue: 'ℹ️ Ingen jämförbar försäljningsdata tillgänglig för denna konstnär',
      severity: 'low'
    });
    
    // Update UI
    this.updateQualityIndicator(currentScore, updatedWarnings);
    console.log('ℹ️ No sales data message displayed');
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
      // For valuation suggestions with suggestedRange, use special formatting
      if (warning.suggestedRange) {
        warningDiv.innerHTML = `
          <div style="display: flex; align-items: flex-start; gap: 8px;">
            <div style="flex: 1;">
              <strong style="font-size: 11px; opacity: 0.8;">${warning.field}:</strong>
              <div style="margin-top: 2px;">${warning.issue}</div>
              <div style="margin-top: 4px; font-size: 10px; opacity: 0.8;">
                ${warning.suggestedRange}
              </div>
            </div>
          </div>
        `;
      } else if (warning.severity.startsWith('market-')) {
        // Make market data fields more subtle
        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = `
          <div style="display: flex; align-items: flex-start; gap: 6px;">
            <span style="min-width: 50px; font-size: 9px; opacity: 0.6; font-weight: 500;">${warning.field}:</span>
            <span style="flex: 1; font-size: 10px;">${warning.issue}</span>
          </div>
        `;
        warningDiv.appendChild(contentDiv);
      } else {
        // Regular quality warnings
        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = `
          <div style="display: flex; align-items: flex-start; gap: 8px;">
            <strong style="min-width: 80px; font-size: 11px; opacity: 0.8;">${warning.field}:</strong>
            <span style="flex: 1;">${warning.issue}</span>
          </div>
        `;
        warningDiv.appendChild(contentDiv);
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
      'marmor', 'granit', 'kalksten', 'sandsten'
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
    // Remove any existing market data dashboard
    const existingDashboard = document.querySelector('.market-data-dashboard');
    if (existingDashboard) {
      existingDashboard.remove();
    }

    // Create the dashboard container
    const dashboard = document.createElement('div');
    dashboard.className = 'market-data-dashboard';
    
    let dashboardContent = '';
    
    // Main price range (always show if available)
    if (salesData.priceRange) {
      const confidence = salesData.confidence;
      const priceRange = salesData.priceRange;
      
      const formattedLow = new Intl.NumberFormat('sv-SE').format(priceRange.low);
      const formattedHigh = new Intl.NumberFormat('sv-SE').format(priceRange.high);
      
      // IMPROVED: More humble confidence messaging with context
      let confidenceIcon = '';
      let confidenceColor = '';
      let confidenceText = '';
      
      // Cap displayed confidence to be more realistic and humble
      const displayConfidence = Math.min(confidence * 0.85, 0.85); // Cap at 85% max
      const confidencePercent = Math.round(displayConfidence * 100);
      
      if (displayConfidence >= 0.75) {
        confidenceIcon = 'Stark databas';
        confidenceColor = '#27ae60';
        confidenceText = `${confidencePercent}% (baserat på liknande försäljningar)`;
      } else if (displayConfidence >= 0.55) {
        confidenceIcon = 'Måttlig databas';
        confidenceColor = '#f39c12';
        confidenceText = `${confidencePercent}% (begränsad jämförelsedata)`;
      } else {
        confidenceIcon = 'Begränsad databas';
        confidenceColor = '#e67e22';
        confidenceText = `${confidencePercent}% (osäker jämförelse)`;
      }
      
      const mainMessage = `${formattedLow}-${formattedHigh} SEK (${confidenceIcon} ${confidenceText}) - vägledning för liknande objekt`;
      
      warnings.push({
        field: 'Värdering',
        issue: mainMessage,
        severity: 'market-primary'
      });
      
      dashboardContent += `
        <div class="market-item market-price">
          <div class="market-label">Marknadsvärde</div>
          <div class="market-value">${formattedLow}-${formattedHigh} SEK</div>
          <div class="market-confidence" style="color: ${confidenceColor};">${confidenceIcon} ${confidenceText}</div>
          <div class="market-help">Vägledning - varje objekt är unikt</div>
        </div>
      `;
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
      dashboardContent += `
        <div class="market-item market-data">
          <div class="market-label" title="Antal försäljningar och pågående auktioner som analysen baseras på">Dataunderlag</div>
          <div class="market-value">${dataParts.join(' • ')}</div>
          <div class="market-help">försäljningar analyserade</div>
        </div>
      `;
    }
    
    // Market activity (only if significant)
    if (salesData.live && salesData.live.marketActivity) {
      const activity = salesData.live.marketActivity;
      
      if (activity.reservesMetPercentage > 70 || activity.reservesMetPercentage < 30) {
        let activityIcon = '';
        let activityColor = '';
        let activityText = '';
        let helpText = '';
        
        if (activity.reservesMetPercentage > 70) {
          activityColor = '#27ae60';
          activityText = `Stark marknad (${activity.reservesMetPercentage}%)`;
          helpText = 'Bra tid att sälja - många objekt når sina utrop';
        } else {
          activityColor = '#e67e22';
          activityText = `Svag marknad (${activity.reservesMetPercentage}%)`;
          helpText = 'Överväg lägre utrop - få objekt når sina utrop';
        }
        
        dashboardContent += `
          <div class="market-item market-activity">
            <div class="market-label" title="Hur många procent av liknande objekt som når sina utrop i pågående auktioner">Marknadsaktivitet</div>
            <div class="market-value" style="color: ${activityColor};">${activityText}</div>
            <div class="market-help">${helpText}</div>
          </div>
        `;
      }
    }
    
    // Key insight (only if high significance)
    if (salesData.insights && salesData.insights.length > 0) {
      const significantInsights = salesData.insights.filter(insight => 
        insight.significance === 'high'
      );
      
      if (significantInsights.length > 0) {
        const insight = significantInsights[0];
        
        // Create more specific dashboard message based on insight type
        let dashboardMessage = insight.message;
        let messageColor = '#2c3e50';
        
        if (insight.type === 'price_comparison') {
          if (insight.message.includes('överväg att höja')) {
            messageColor = '#27ae60';
            dashboardMessage = insight.message.replace(' - överväg att höja utropet', '');
          } else if (insight.message.includes('överväg att sänka')) {
            messageColor = '#e67e22';
            dashboardMessage = insight.message.replace(' - överväg att sänka utropet', '');
          } else if (insight.message.includes('kan vara starkare')) {
            messageColor = '#3498db';
            dashboardMessage = insight.message.replace(' - nuvarande marknad kan vara starkare', '');
          } else if (insight.message.includes('kan vara svagare')) {
            messageColor = '#f39c12';
            dashboardMessage = insight.message.replace(' - nuvarande marknad kan vara svagare', '');
          }
        } else if (insight.type === 'market_strength') {
          messageColor = '#27ae60';
          dashboardMessage = insight.message.replace(' - bra tid att sälja', '');
        } else if (insight.type === 'market_weakness') {
          messageColor = '#e67e22';
          dashboardMessage = insight.message.replace(' - överväg lägre utrop', '');
        }
        
        // Truncate if still too long
        if (dashboardMessage.length > 80) {
          dashboardMessage = dashboardMessage.substring(0, 77) + '...';
        }
        
        dashboardContent += `
          <div class="market-item market-insight">
            <div class="market-label">Marknadstrend</div>
            <div class="market-value" style="color: ${messageColor};">${dashboardMessage}</div>
          </div>
        `;
      }
    }
    
    // NEW: Add positive valuation feedback if we have a "perfect" evaluation
    if (valuationSuggestions && valuationSuggestions.length > 0) {
      const positiveValuations = valuationSuggestions.filter(suggestion => 
        suggestion.severity === 'positive'
      );
      
      if (positiveValuations.length > 0) {
        const perfectValuation = positiveValuations[0];
        
        dashboardContent += `
          <div class="market-item market-valuation-perfect">
            <div class="market-label">Värdering</div>
            <div class="market-value">Utmärkt bedömning!</div>
            <div class="market-confidence" style="color: #27ae60;">Väl i linje med marknadsvärde</div>
          </div>
        `;
        
        console.log('🏆 Added perfect valuation feedback to dashboard');
      }
    }
    
    // Only create dashboard if we have content
    if (dashboardContent) {
      dashboard.innerHTML = `
        <div class="market-dashboard-header">
          <span class="market-dashboard-title">Marknadsanalys</span>
          <span class="market-dashboard-source">Auctionet databas</span>
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
      
      // Insert the dashboard above the main container
      const mainContainer = document.querySelector('.grid-container') || 
                           document.querySelector('.container') || 
                           document.querySelector('main') ||
                           document.querySelector('.content');
      
      if (mainContainer) {
        mainContainer.parentNode.insertBefore(dashboard, mainContainer);
        console.log('✅ Market data dashboard added above main container');
      } else {
        // Fallback: add after the breadcrumb/header area
        const breadcrumb = document.querySelector('.breadcrumb') || 
                          document.querySelector('nav') ||
                          document.querySelector('header');
        
        if (breadcrumb) {
          breadcrumb.parentNode.insertBefore(dashboard, breadcrumb.nextSibling);
          console.log('✅ Market data dashboard added after breadcrumb');
        } else {
          // Last resort: add to body
          document.body.insertBefore(dashboard, document.body.firstChild);
          console.log('✅ Market data dashboard added to body');
        }
      }
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
          padding: 15px 20px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .market-dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid #dee2e6;
        }
        
        .market-dashboard-title {
          font-weight: 600;
          font-size: 14px;
          color: #2c3e50;
        }
        
        .market-dashboard-source {
          font-size: 11px;
          color: #6c757d;
          opacity: 0.8;
        }
        
        .market-dashboard-content {
          display: flex;
          flex-wrap: wrap;
          gap: 20px;
          align-items: flex-start;
        }
        
        .market-item {
          display: flex;
          flex-direction: column;
          min-width: 120px;
          border-right: 0.5px solid #e0e0e0;
          padding-right: 20px;
        }
        
        .market-item:last-child {
          border-right: none;
          padding-right: 0;
        }
        
        .market-label {
          font-size: 10px;
          color: #6c757d;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 2px;
          font-weight: 500;
        }
        
        .market-value {
          font-size: 13px;
          font-weight: 600;
          color: #2c3e50;
          line-height: 1.2;
        }
        
        .market-confidence {
          font-size: 11px;
          margin-top: 2px;
          font-weight: 500;
        }
        
        .market-help {
          font-size: 10px;
          color: #6c757d;
          margin-top: 1px;
          font-style: italic;
        }
        
        .market-label[title] {
          cursor: help;
          border-bottom: 1px dotted #6c757d;
        }
        
        .market-activity .market-value {
          font-size: 12px;
        }
        
        .market-insight .market-value {
          font-size: 12px;
          max-width: 300px;
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
          font-size: 13px;
          font-weight: 600;
        }
        
        .market-valuation-perfect .market-confidence {
          color: #27ae60;
        }
        
        .market-dashboard-disclaimer {
          margin-top: 12px;
          padding-top: 8px;
          border-top: 1px solid #e9ecef;
        }
        
        .disclaimer-text {
          font-size: 11px;
          color: #6c757d;
          font-style: italic;
          line-height: 1.3;
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
        
        /* Responsive design */
        @media (max-width: 768px) {
          .market-data-dashboard {
            margin: 10px;
            padding: 12px 15px;
          }
          
          .market-dashboard-content {
            flex-direction: column;
            gap: 12px;
            align-items: flex-start;
          }
          
          .market-item {
            min-width: auto;
            width: 100%;
            border-right: none;
            border-bottom: 1px solid #dee2e6;
            padding-right: 0;
            padding-bottom: 8px;
          }
          
          .market-item:last-child {
            border-bottom: none;
            padding-bottom: 0;
          }
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
    
    console.log('❌ No artist found for market analysis');
    return null;
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
} 