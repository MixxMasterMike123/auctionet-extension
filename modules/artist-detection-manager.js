// modules/artist-detection-manager.js - Single Source of Truth for Artist Detection
// Extracted from quality-analyzer.js to provide unified artist detection across all pages

export class ArtistDetectionManager {
  constructor(apiManager = null) {
    this.apiManager = apiManager;
    console.log('🎯 ArtistDetectionManager initialized');
  }

  // Set API manager for AI-powered detection
  setApiManager(apiManager) {
    this.apiManager = apiManager;
    console.log('🤖 ArtistDetectionManager: API manager set for AI detection');
  }

  // Main artist detection method - exactly from edit page quality-analyzer.js
  async detectMisplacedArtist(title, artistField, forceReDetection = false) {
    // Only suggest if artist field is empty or very short, OR if force re-detection is enabled
    if (!forceReDetection && artistField && artistField.trim().length > 2) {
      console.log('🚫 Artist detection skipped - artist field already has content:', artistField);
      return null; // Artist field already has content
    }

    if (!title || title.length < 10) {
      console.log('🚫 Artist detection skipped - title too short:', title);
      return null; // Title too short to contain artist
    }

    // ENHANCED: Quick pre-check for obvious informal patterns to boost AI confidence
    const informalPatterns = [
      /^([A-ZÅÄÖÜ]?[a-zåäöü]+\s+[A-ZÅÄÖÜ]?[a-zåäöü]+)\s+([a-zåäöü\s\d-]+)/i, // "rolf lidberg pappaer..."
      /^([A-ZÅÄÖÜ]?[a-zåäöü]+\s+[A-ZÅÄÖÜ]?[a-zåäöü]+\s+[A-ZÅÄÖÜ]?[a-zåäöü]+)\s+([a-zåäöü\s\d-]+)/i // "carl gustaf malmsten..."
    ];
    
    let isInformalPattern = false;
    let potentialArtistFromPattern = null;
    
    for (const pattern of informalPatterns) {
      const match = title.match(pattern);
      if (match && this.looksLikePersonName(match[1])) {
        isInformalPattern = true;
        potentialArtistFromPattern = match[1].split(' ').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
        console.log('🎯 Detected informal pattern with potential artist:', potentialArtistFromPattern);
        break;
      }
    }

    // Try AI-powered detection first (if API key available)
    if (this.apiManager && this.apiManager.apiKey) {
      console.log('🤖 Attempting AI artist detection for title:', title);
      
      let aiResult = null;
      let aiError = false;
      
      try {
        const objectType = this.extractObjectType(title);
        console.log('📝 Extracted object type:', objectType);
        
        // Get description from current form data for AI analysis
        const descriptionField = document.querySelector('#item_description_sv');
        const description = descriptionField ? descriptionField.value : '';
        
        // For re-detection, use empty artist field to force AI analysis
        const artistForAnalysis = forceReDetection ? '' : artistField;
        aiResult = await this.apiManager.analyzeForArtist(title, objectType, artistForAnalysis, description);
        console.log('🤖 AI artist analysis raw result:', aiResult);
        
      } catch (error) {
        console.error('AI artist detection failed, will try rule-based fallback:', error);
        aiError = true;
      }
      
      // Process AI result if we got one (no error)
      if (!aiError && aiResult) {
        // ENHANCED: Let AI handle misspelling detection and correction
        // Remove our strict validation - trust AI to detect and correct misspellings
        if (aiResult.hasArtist && aiResult.artistName) {
          console.log('🔍 AI detected artist name:', aiResult.artistName);
          
          // Basic validation that it looks like a person name
          if (!this.looksLikePersonName(aiResult.artistName)) {
            console.log('🚫 AI detected name failed basic person name validation, rejecting:', aiResult.artistName);
            aiResult = { hasArtist: false };
          }
        }
        
        // ENHANCED: Use appropriate confidence threshold
        const requiredConfidence = isInformalPattern ? 0.5 : 0.6; // Lower thresholds to allow corrections
        
        if (aiResult && aiResult.hasArtist && aiResult.confidence > requiredConfidence) {
          console.log('✅ AI detected artist with sufficient confidence:', aiResult);
          
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
            source: 'ai',
            foundIn: forceReDetection ? 'titel (upprepad sökning)' : 'titel'
          };
        } else if (aiResult && aiResult.hasArtist) {
          console.log('⚠️ AI detected artist but confidence too low:', aiResult.confidence, 'for artist:', aiResult.artistName);
          
          // ENHANCED: If we have informal pattern match AND AI detects same artist, accept it even with lower confidence
          if (isInformalPattern && potentialArtistFromPattern && 
              aiResult.artistName && aiResult.artistName.toLowerCase().includes(potentialArtistFromPattern.toLowerCase())) {
            console.log('🎯 AI + Pattern match boost - accepting lower confidence for informal entry');
            return {
              detectedArtist: aiResult.artistName,
              suggestedTitle: aiResult.suggestedTitle || this.generateSuggestedTitle(title, aiResult.artistName),
              confidence: Math.min(0.85, aiResult.confidence + 0.2), // Boost confidence
              reasoning: aiResult.reasoning + ' (Boosted by informal pattern match)',
              source: 'ai-boosted',
              foundIn: forceReDetection ? 'titel (upprepad sökning)' : 'titel'
            };
          }
          
          // IMPORTANT: Do NOT fall back to rules here - AI successfully responded, just with low confidence
          // We should respect the AI's decision and not override it with rule-based detection
          console.log('🚫 AI response had low confidence, not falling back to rules (AI completed successfully)');
          return null;
        } else {
          console.log('❌ AI artist analysis returned no artist detected');
          // AI successfully responded but found no artist - don't fall back to rules
          return null;
        }
      }
      
      // ONLY fall back to rules if there was an actual API error
      if (aiError) {
        console.log('🔧 AI failed with error, falling back to rule-based detection');
      } else {
        console.log('🚫 AI completed successfully but found no artist, not using rule-based fallback');
        return null;
      }
    } else {
      console.log('❌ No API manager available for AI detection, using rule-based detection');
    }

    // ENHANCED: If we detected informal pattern but AI failed with error, use rule-based as backup
    if (isInformalPattern && potentialArtistFromPattern) {
      console.log('🔧 Using rule-based detection for confirmed informal pattern (after AI error)');
      return {
        detectedArtist: potentialArtistFromPattern,
        suggestedTitle: title.replace(new RegExp(`^${potentialArtistFromPattern.replace(/\s+/g, '\\s+')}\\s+`, 'i'), '').trim(),
        confidence: 0.8,
        source: 'rules-informal',
        foundIn: forceReDetection ? 'titel (upprepad sökning)' : 'titel'
      };
    }

    // Fallback to full rule-based detection ONLY if AI had an error
    console.log('🔧 Using rule-based artist detection as fallback');
    const ruleResult = this.detectMisplacedArtistRuleBased(title, artistField);
    
    if (ruleResult && forceReDetection) {
      // Add context for re-detection
      ruleResult.foundIn = 'titel (upprepad sökning)';
    }
    
    return ruleResult;
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

  // Complete rule-based artist detection - exactly from edit page quality-analyzer.js
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
      // NEW: PRIORITY - Informal/unstructured entries (cataloguers typing quickly)
      // Pattern: "Firstname Lastname object material period" (handles "Rolf lidberg pappaer litografi 1947 signerad")
      /^([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+)\s+([a-zåäöü\s\d-]+)/i,
      
      // Pattern: "Firstname Middle Lastname object material period" (3-word artist names)
      /^([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+)\s+([a-zåäöü\s\d-]+)/i,
      
      // Pattern: "firstname lastname object" (lowercase quick typing)
      /^([a-zåäöü]+\s+[a-zåäöü]+)\s+([a-zåäöü\s\d-]+)/i,
      
      // Pattern: "Lastname, Firstname object" (some cataloguers use comma separation)
      /^([A-ZÅÄÖÜ][a-zåäöü]+),?\s+([A-ZÅÄÖÜ][a-zåäöü]+)\s+([a-zåäöü\s\d-]+)/i,
      
      // NEW: PRIORITY - Artist at END of title patterns (most common for ceramics/design)
      // Pattern: "OBJEKT, material, manufacturer, country/origin. Firstname Lastname" (handles "Fat, stengods, Royal Copenhagen, Danmark. Niels Thorsson")
      /^([A-ZÅÄÖÜ]+),\s*[a-zåäöü\s]+,\s*[A-ZÅÄÖÜ][^,]+,\s*[A-ZÅÄÖÜ][^.]+\.\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+)$/i,
      
      // NEW: OBJEKT, details, origin/manufacturer. Firstname Middle Lastname (3-word version)
      /^([A-ZÅÄÖÜ]+),\s*[^.]+\.\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+)$/i,
      
      // NEW: OBJEKT, quantity, material, details. Firstname Lastname (handles "GLAS, 6 st, kristall, Orrefors. Simon Gate")
      /^([A-ZÅÄÖÜ]+),\s*\d+\s*st,\s*[a-zåäöü\s]+,\s*[^.]+\.\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+)$/i,
      
      // NEW: OBJEKT, technique, details, period. Firstname Lastname (handles period information)
      /^([A-ZÅÄÖÜ]+),\s*[a-zåäöü\s]+,\s*[^,]+,\s*[^.]+\.\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+)$/i,
      
      // NEW: Simple end pattern: Any content. Firstname Lastname (most general end pattern)
      /^(.+)\.\s*([A-ZÅÄÖÜ][a-zåäöü]+\s+[A-ZÅÄÖÜ][a-zåäöü]+)$/,
      
      // EXISTING PATTERNS (artists at beginning/middle)
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
        
        // Special handling for INFORMAL patterns (artist at beginning of unstructured titles)
        if (pattern.source.includes('[a-zåäöü\\s\\d-]+')) { // Informal patterns
          if (match.length >= 3) {
            // Pattern: "Artist Name rest of title" → [full, artist, rest]
            [, potentialArtist, rest] = match;
            
            // Capitalize artist name properly
            potentialArtist = potentialArtist.split(' ').map(word => 
              word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            ).join(' ');
            
            // Extract object type from rest (first meaningful word)
            const restWords = rest.trim().split(/\s+/);
            const meaningfulWords = restWords.filter(word => 
              word.length > 2 && 
              !word.match(/^\d/) && // Not a year
              !['och', 'på', 'i', 'av', 'med', 'för'].includes(word.toLowerCase())
            );
            
            objectType = meaningfulWords[0] ? meaningfulWords[0].toUpperCase() : 'OBJEKT';
            
            // Clean up the rest for suggested title
            rest = rest.trim();
            if (rest.length > 0) {
              // Capitalize first letter and clean up spacing
              rest = rest.charAt(0).toUpperCase() + rest.slice(1);
              rest = rest.replace(/\s+/g, ' ').trim();
            }
          } else {
            continue; // Skip if unexpected structure
          }
        }
        // Special handling for comma-separated patterns  
        else if (pattern.source.includes(',?\\s+') && pattern.source.includes('[A-ZÅÄÖÜ][a-zåäöü]+\\)\\s+')) {
          if (match.length >= 4) {
            // Pattern: "Lastname, Firstname rest" → [full, lastname, firstname, rest]
            [, , , rest] = match;
            potentialArtist = `${match[2]} ${match[1]}`; // Firstname Lastname
            
            // Extract object type
            const restWords = rest.trim().split(/\s+/);
            objectType = restWords[0] ? restWords[0].toUpperCase() : 'OBJEKT';
            
            // Clean up rest
            rest = rest.trim();
            if (rest.length > 0) {
              rest = rest.charAt(0).toUpperCase() + rest.slice(1);
            }
          } else {
            continue;
          }
        }
        // Special handling for END-OF-TITLE patterns (artist at the end)
        else if (pattern.source.includes('\\$')) { // End-of-line patterns
          if (match.length === 3) {
            // Pattern: "Content. Artist Name" → [full, content, artist]
            [, rest, potentialArtist] = match;
            
            // Extract object type from the content
            const objectMatch = rest.match(/^([A-ZÅÄÖÜ]+)/);
            objectType = objectMatch ? objectMatch[1] : 'OBJEKT';
            
            // Clean up the rest by removing the object type
            rest = rest.replace(/^[A-ZÅÄÖÜ]+,?\s*/, '').trim();
            if (rest.endsWith('.')) {
              rest = rest.slice(0, -1).trim();
            }
          } else {
            continue; // Skip if unexpected structure
          }
        }
        // Special handling for Axeco patterns (company attached to artist name)
        else if (pattern.source.includes('Axeco') || pattern.source.includes('\\.\\d+')) {
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

  // Helper method to determine if a string looks like a person's name - exactly from edit page
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

    // ENHANCED: Be more flexible with capitalization for informal entries
    const [first, middle, last] = words;
    
    if (words.length === 2) {
      // Two words: both should be alphabetic (allow lowercase for informal entries)
      if (!/^[A-ZÅÄÖÜa-zåäöü]/.test(first) || !/^[A-ZÅÄÖÜa-zåäöü]/.test(last)) {
        return false;
      }
    } else if (words.length === 3) {
      // Three words: all should be alphabetic (allow lowercase for informal entries)
      if (!/^[A-ZÅÄÖÜa-zåäöü]/.test(first) || !/^[A-ZÅÄÖÜa-zåäöü]/.test(middle) || !/^[A-ZÅÄÖÜa-zåäöü]/.test(last)) {
        return false;
      }
    }

    // ENHANCED: Also check case-insensitive exclusions for informal entries
    const lowerName = trimmedName.toLowerCase();

    // Exclude common non-person terms that might appear in titles
    const excludeTerms = [
      // Places (check case-insensitive)
      'stockholm', 'göteborg', 'malmö', 'uppsala', 'västerås', 'örebro', 'linköping',
      'helsingborg', 'jönköping', 'norrköping', 'lund', 'umeå', 'gävle', 'borås',
      
      // Historical figures (subjects, not artists)
      'napoleon bonaparte', 'gustav vasa', 'carl gustaf', 'victoria bernadotte',
      
      // Companies/Manufacturers (case-insensitive)
      'gustavsberg porslin', 'rörstrand porcelain', 'orrefors glasbruk', 'kosta boda',
      'arabia finland', 'royal copenhagen', 'bing grondahl',
      
      // Common object descriptions that might look like names
      'art deco', 'art nouveau', 'louis philippe', 'carl johan', 'gustav iii',
      
      // Design periods/styles
      'jugend stil', 'empire stil', 'rokoko stil', 'barock stil',
      
      // ENHANCED: Common object types that might be confused for names in informal entries
      'pappaer litografi', 'litografi pappaer', 'olja duk', 'duk olja',
      'keramik figurin', 'figurin keramik', 'glas vas', 'vas glas'
    ];

    // Check if the full name matches any exclude terms (case-insensitive)
    if (excludeTerms.some(term => term === lowerName)) {
      return false;
    }

    // Check individual words against common non-name terms (case-insensitive)
    const nonNameWords = [
      'stockholm', 'göteborg', 'malmö', 'gustavsberg', 'rörstrand', 'orrefors', 
      'kosta', 'arabia', 'royal', 'napoleon', 'gustav', 'carl', 'louis', 'empire',
      // Company/Manufacturer names that might appear after artist names
      'ikea', 'tenn', 'lammhults', 'källemo', 'mathsson', 'malmsten', 
      'boda', 'artek', 'iittala', 'grondahl', 'axeco',
      // ENHANCED: Object types and materials that might be confused for names
      'pappaer', 'litografi', 'olja', 'duk', 'keramik', 'glas', 'vas', 'skål',
      'figurin', 'målning', 'tavla', 'stol', 'bord', 'lampa', 'porslin', 'kristall',
      // Common descriptive terms that appear in figurine/sculpture titles
      'kvinna', 'man', 'flicka', 'pojke', 'barn', 'dame', 'herre', 'fru', 'herr',
      'kvinnor', 'män', 'flickor', 'pojkar', 'damer', 'herrar',
      // ENHANCED: Time periods and dates
      'signerad', 'osignerad', 'daterad', 'omkring', 'cirka', 'troligen',
      // Common prepositions and descriptive words
      'med', 'och', 'vid', 'på', 'under', 'över', 'utan', 'för', 'till', 'från',
      'som', 'av', 'i', 'ur', 'mot', 'genom', 'mellan', 'bland', 'hos', 'åt',
      // Common object/animal terms in figurine descriptions
      'hundar', 'katter', 'hästar', 'fåglar', 'blommor', 'träd', 'hus', 'båt',
      'bil', 'cykel', 'stol', 'bord', 'vas', 'skål', 'fat', 'kopp', 'glas'
    ];

    if (words.some(word => 
      nonNameWords.some(term => word.toLowerCase() === term)
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

  // Helper method to calculate confidence in artist detection - exactly from edit page
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
} 