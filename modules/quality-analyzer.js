// modules/quality-analyzer.js - Quality Analysis Module
export class QualityAnalyzer {
  constructor() {
    this.dataExtractor = null;
  }

  setDataExtractor(extractor) {
    this.dataExtractor = extractor;
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
  detectMisplacedArtist(title, artistField) {
    // Only suggest if artist field is empty or very short
    if (artistField && artistField.trim().length > 2) {
      return null; // Artist field already has content
    }

    if (!title || title.length < 10) {
      return null; // Title too short to contain artist
    }

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

  analyzeQuality() {
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

    // Check for potential misplaced artist in title
    const misplacedArtist = this.detectMisplacedArtist(data.title, data.artist);
    if (misplacedArtist) {
      let warningMessage;
      let severity = 'medium';
      
      if (misplacedArtist.errorType === 'artist_in_title_caps') {
        warningMessage = `FELAKTIG PLACERING: "${misplacedArtist.detectedArtist}" ska flyttas till konstnärsfältet. Föreslagen titel: "${misplacedArtist.suggestedTitle}"`;
        severity = 'high'; // This is a clear error, not just a suggestion
      } else {
        warningMessage = `Möjlig konstnär upptäckt: "${misplacedArtist.detectedArtist}" - kontrollera om den ska flyttas till konstnärsfält`;
      }
      
      warnings.push({ 
        field: 'Titel', 
        issue: warningMessage, 
        severity: severity 
      });
      score -= (severity === 'high' ? 20 : 10);
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

    this.updateQualityIndicator(score, warnings);
  }

  updateQualityIndicator(score, warnings) {
    const scoreElement = document.querySelector('.quality-score');
    const warningsElement = document.querySelector('.quality-warnings');
    
    // Add improved warning styles if not already added
    if (!document.getElementById('improved-warning-styles')) {
      const style = document.createElement('style');
      style.id = 'improved-warning-styles';
      style.textContent = `
        .quality-warnings {
          margin-top: 15px;
          padding-top: 15px;
          border-top: 1px solid #dee2e6;
        }
        
        .quality-warnings ul {
          margin: 0;
          padding-left: 0;
          list-style-type: none;
        }
        
        .quality-warnings li {
          margin-bottom: 10px;
          font-size: 12px;
          font-weight: 400;
          line-height: 1.4;
          padding: 8px 12px;
          border-radius: 6px;
          border-left: 4px solid;
        }
        
        .warning-high {
          color: #721c24;
          background-color: #f8d7da;
          border-left-color: #dc3545;
          font-weight: 400;
        }
        
        .warning-medium {
          color: #084298;
          background-color: #cff4fc;
          border-left-color: #0d6efd;
          font-weight: 400;
        }
        
        .warning-low {
          color: #495057;
          background-color: #f8f9fa;
          border-left-color: #6c757d;
          font-style: italic;
        }
        
        .no-warnings {
          color: #0f5132;
          background-color: #d1e7dd;
          border-left: 4px solid #198754;
          font-weight: 600;
          text-align: center;
          margin: 0;
          font-size: 14px;
          padding: 12px;
          border-radius: 6px;
        }
      `;
      document.head.appendChild(style);
    }
    
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
        warningsElement.innerHTML = '<ul>' + 
          warnings.map(w => `<li class="warning-${w.severity}"><strong>${w.field}:</strong> ${w.issue}</li>`).join('') +
          '</ul>';
      } else {
        warningsElement.innerHTML = '<p class="no-warnings">✓ Utmärkt katalogisering!</p>';
      }
    }
  }

  setupLiveQualityUpdates() {
    console.log('🚀 Setting up live quality monitoring...');
    
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
} 