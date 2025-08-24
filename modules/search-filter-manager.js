export class SearchFilterManager {
  constructor() {
    this.qualityAnalyzer = null;
    this.dashboardManager = null;
    this.apiManager = null;
    this.dataExtractor = null;
    this.searchQuerySSoT = null; // NEW: AI-only search query system
    this.searchTermExtractor = null; // NEW: For extended term extraction
    this.lastCandidateSearchTerms = null;
  }

  // Set dependencies
  setQualityAnalyzer(qualityAnalyzer) {
    this.qualityAnalyzer = qualityAnalyzer;
  }

  setDashboardManager(dashboardManager) {
    this.dashboardManager = dashboardManager;
  }

  setApiManager(apiManager) {
    this.apiManager = apiManager;
  }

  setDataExtractor(dataExtractor) {
    this.dataExtractor = dataExtractor;
  }

  // NEW: Set SearchTermExtractor for extended term extraction
  setSearchTermExtractor(searchTermExtractor) {
    this.searchTermExtractor = searchTermExtractor;
  }

  // NEW: Set AI-only SearchQuerySSoT
  setSearchQuerySSoT(searchQuerySSoT) {
    this.searchQuerySSoT = searchQuerySSoT;
  }

  // Format artist name for search with proper quoting
  formatArtistForSearch(artistName) {
    if (!artistName || typeof artistName !== 'string') {
      return '';
    }
    
    // Remove any existing quotes and clean
    const cleanArtist = artistName.trim().replace(/^["']|["']$/g, '').replace(/,\s*$/, '');
    
    // Check if multi-word name (most artist names)
    const words = cleanArtist.split(/\s+/).filter(word => word.length > 0);
    
    if (words.length > 1) {
      // Multi-word: Always quote for exact matching
      return `"${cleanArtist}"`;
    } else {
      // Single word: Also quote for consistency in artist searches
      return `"${cleanArtist}"`;
    }
  }

  // USE SSoT: Build search query from selected candidates
  buildQueryFromCandidates(selectedCandidates) {
    if (this.searchQuerySSoT) {
      return this.searchQuerySSoT.buildQueryFromCandidates(selectedCandidates);
    }
    // Fallback to legacy logic
    return selectedCandidates.join(' ');
  }

  // Extract current item data from form
  extractCurrentItemData() {
    const titleField = document.querySelector('#item_title_sv');
    const descriptionField = document.querySelector('#item_description_sv');
    
    return {
      title: titleField ? titleField.value : '',
      description: descriptionField ? descriptionField.value : ''
    };
  }

  // NEW: Extract candidate search terms for interactive user selection
  extractCandidateSearchTerms(title, description, artistInfo = null, actualSearchQuery = null) {

    
    // DEBUGGING: Check artist field in DOM regardless of parameters
    const artistFieldFromDOM = document.querySelector('#item_artist_name_sv')?.value?.trim();
    
    // CRITICAL FIX: Check if we already have AI Rules data in SearchQuerySSoT to preserve source information
    if (this.searchQuerySSoT) {
      const existingTerms = this.searchQuerySSoT.getAvailableTerms();
      const queryMetadata = this.searchQuerySSoT.getCurrentMetadata();
      
      // ENHANCED FIX: Only preserve if we have HIGH-QUALITY AI Rules data, not emergency fallback
      const isHighQualityData = existingTerms && existingTerms.length > 0 && 
        queryMetadata && 
        queryMetadata.source && 
        queryMetadata.source !== 'emergency_fallback' &&
        queryMetadata.confidence > 0.5 &&
        existingTerms.some(term => term.source && term.source !== 'none');
      
      if (isHighQualityData) {
        
        // Convert existing terms to candidates format for consistency
        const candidates = existingTerms.map(term => ({
          term: term.term,
          type: term.type,
          priority: term.priority,
          description: term.description,
          preSelected: term.isSelected,
          source: term.source // CRITICAL: Preserve source for AI artist preservation logic
        }));
        
        // Build current query from pre-selected terms
        const preSelectedTerms = candidates.filter(c => c.preSelected).map(c => c.term);
        const currentQuery = preSelectedTerms.join(' ');
        
        
        return {
          candidates: candidates,
          currentQuery: currentQuery,
          analysisType: artistInfo ? 'artist' : 'freetext'
        };
      } else {

      }
    }
    
    // FALLBACK: If no existing AI Rules data, proceed with original extraction logic

    
    const text = `${title} ${description}`.toLowerCase();
    const candidates = [];
    
    // NEW: Check if we have AI Rules results to respect
    let aiSelectedTerms = [];
    if (actualSearchQuery && this.searchQuerySSoT) {
      // Get the AI Rules selected terms from SSoT
      const currentTerms = this.searchQuerySSoT.getCurrentTerms();
      if (currentTerms && currentTerms.length > 0) {
        aiSelectedTerms = currentTerms;
      }
    }
    
    const shouldBePreSelected = (term) => {
      // NEW: PRIORITY 1 - Respect AI Rules enhanced pre-selection if available
      if (aiSelectedTerms.length > 0) {
        // Check if this term is in the AI Rules PRE-SELECTED terms (EXACT MATCH ONLY)
        const isAIPreSelected = aiSelectedTerms.some(aiTerm => {
          const normalizedAI = aiTerm.toLowerCase().trim().replace(/"/g, ''); // Remove quotes
          const normalizedTerm = term.toLowerCase().trim().replace(/"/g, ''); // Remove quotes
          // STRICT MATCHING: Only exact matches after quote normalization
          return normalizedAI === normalizedTerm;
        });
        
        if (isAIPreSelected) {
          return true;
        } else {
          return false;
        }
      }
      
      // FALLBACK: Use original logic when no AI Rules available
      // Guard against null/undefined terms
      if (!term || typeof term !== 'string') {
        return false;
      }
      
      // 🤖 AI-INTELLIGENT PRE-SELECTION: Only select the 2-3 most strategically important terms
      // Prioritize BROAD market coverage over narrow specificity for initial search
      
      const termLower = term.toLowerCase();
      
      // PRIORITY 1: Brand/Artist is ALWAYS pre-selected (most important for market data)
      if (artistInfo && artistInfo.artist) {
        const artistLower = artistInfo.artist.toLowerCase().trim();
        const termLowerClean = termLower.replace(/"/g, '').trim(); // Remove quotes for comparison
        
        // EXACT MATCH: When the term IS the artist (AI-detected artists)
        if (termLowerClean === artistLower || termLower === artistLower) {
          return true;
        }
        
        // CONTAINS MATCH: When the term contains the artist name (for composite terms)
        if (termLower.includes(artistLower)) {
          return true;
        }
      }
      
      // 🔧 ARTIST CONSISTENCY FALLBACK: Artist field content should ALWAYS be pre-selected
      // This ensures that moved artists remain checked in the dashboard
      const artistField = document.querySelector('#item_artist_name_sv')?.value?.trim();
      if (artistField) {
        const artistFieldLower = artistField.toLowerCase();
        const termWithoutQuotes = term.replace(/"/g, '').toLowerCase(); // Remove quotes for comparison
        
        if (termLower === artistFieldLower || termWithoutQuotes === artistFieldLower) {
          return true;
        }
      }
      
      // PRIORITY 1.5: Standalone brand detection (even without artistInfo)
      // Check if this term is a known jewelry/watch brand
      const jewelryBrands = [
        'cartier', 'tiffany', 'bulgari', 'van cleef', 'arpels', 'harry winston',
        'graff', 'chopard', 'boucheron', 'piaget', 'georg jensen', 'tresor',
        'david yurman', 'mikimoto', 'chanel', 'dior', 'swarovski', 'pandora'
      ];
      const watchBrands = [
        'rolex', 'omega', 'patek philippe', 'audemars piguet', 'vacheron constantin',
        'jaeger-lecoultre', 'iwc', 'breitling', 'tag heuer', 'cartier',
        'longines', 'tissot', 'seiko', 'citizen', 'hamilton', 'tudor', 'zenith'
      ];
      
      // SYNTHESIZER & ELECTRONIC INSTRUMENT BRANDS
      const synthesizerBrands = [
        'yamaha', 'roland', 'korg', 'moog', 'sequential', 'oberheim', 'arp', 
        'prophet', 'juno', 'jupiter', 'sh', 'tr', 'tb', 'dx', 'sy', 'psr',
        'kurzweil', 'ensoniq', 'akai', 'emu', 'fairlight', 'synclavier',
        'nord', 'access', 'novation', 'arturia', 'dave smith', 'elektron',
        'teenage engineering', 'buchla', 'doepfer', 'make noise', 'eurorack'
      ];
      
      if (jewelryBrands.includes(termLower) || watchBrands.includes(termLower) || synthesizerBrands.includes(termLower)) {
        return true;
      }
      
      // PRIORITY 2: Object type is ALWAYS pre-selected (second most important)
      const objectType = this.qualityAnalyzer.extractObjectType(title);
      if (term.toLowerCase() === 'rolex' || (objectType && objectType.toLowerCase() === termLower)) {
        return true;
      }
      
      // PRIORITY 3: Recognizable COMPLETE MODEL NAMES are strategically important
      // Watch models: Submariner, Speedmaster, etc.
      // Synthesizer models: DX7, JP8000, SH101, etc.
      const knownModels = [
        'submariner', 'speedmaster', 'seamaster', 'daytona', 'datejust', 'explorer', 'nautilus', 'aquanaut',
        'royal oak', 'overseas', 'pilot', 'portuguese', 'navitimer', 'superocean', 'avenger',
        // Synthesizer and electronic instrument models
        'dx7', 'dx100', 'dx27', 'juno', 'jupiter', 'sh101', 'sh303', 'tr808', 'tr909', 'tb303',
        'jp8000', 'jv1000', 'mpc2000', 'sp1200', 'd50', 'jd800', 'xp50', 'k2000'
      ];
      
      // Check if it's a known model name (case insensitive)
      if (knownModels.some(model => termLower.includes(model) || model.includes(termLower))) {
        return true;
      }
      
      // Check for synthesizer/electronic instrument pattern (letters + numbers, like DX7, SH101)
      if (/^[A-Z]{1,4}\d{1,4}[A-Z]*$/i.test(term) && term.length >= 3 && term.length <= 8) {
        return true;
      }
      
      // CONSERVATIVE CHANGE: Complete models are valuable but should be OPTIONAL for broader coverage
      // Make them available as refinements rather than pre-selected to avoid overly narrow searches
      if (term.length > 10 && (term.includes(' ') || term.includes('-'))) {
        return false; // Changed from true to false - make available but not pre-selected
      }
      
      // 🤖 AI REJECTS individual model words - they fragment the search and reduce market data
      if (['oyster', 'perpetual', 'air', 'king', 'precision'].includes(termLower)) {
        return false;
      }
      
      // 🤖 AI REJECTS materials for initial broad search
      if (['stål', 'guld', 'silver', 'titan', 'steel', 'gold'].includes(termLower)) {
        return false;
      }
      
      // 🤖 AI ENHANCED: Reject generic reference numbers but allow important models through
      if (/^\d{4}$/.test(term)) {
        // Reject standalone years (like 1983, 1987)
        return false;
      } else if (term.toLowerCase().includes('ref')) {
        // Reject explicit reference patterns
        return false;
      }
      
      // 🤖 AI REJECTS technical specifications for initial broad search
      if (['automatic', 'manuell', 'cal', 'caliber', 'diameter', 'mm', 'programmable', 'algorithm'].some(tech => termLower.includes(tech))) {
        return false;
      }
      
      // Default: reject unless specifically identified as strategically important
      return false;
    };
    
    // 1. ARTIST/BRAND (if available)
    if (artistInfo && artistInfo.artist) {
      // NORMALIZE artist name to match AI Rules processing (remove trailing comma/spaces)
      const normalizedArtist = artistInfo.artist.trim().replace(/,\s*$/, '');
      
      // CRITICAL FIX: Ensure multi-word artist names are properly quoted for exact search matching
      const quotedArtist = this.formatArtistForSearch(normalizedArtist);
      const preSelected = shouldBePreSelected(quotedArtist);
      
      console.log('🎨 Artist formatting:', {
        original: artistInfo.artist,
        normalized: normalizedArtist, 
        quoted: quotedArtist
      });
      
      // CRITICAL FIX: Detect if this is an AI-detected artist
      // If the artistInfo is passed with a quoted name and it's not in the DOM artist field, it's likely AI-detected
      const isDOMFieldEmpty = !artistFieldFromDOM || artistFieldFromDOM.trim() === '';
      const isQuotedArtist = quotedArtist.includes('"');
      const isLikelyAIDetected = isDOMFieldEmpty && isQuotedArtist;
      
      // ENHANCED DETECTION: Also check if this artist was recently set by AI by comparing against known AI patterns
      const looksLikeArtistName = /^"?[A-Z][a-z]+ [A-Z][a-z]+"?$/.test(normalizedArtist);
      const isAICandidate = (isDOMFieldEmpty || isQuotedArtist) && looksLikeArtistName;
      
      
      candidates.push({
        term: quotedArtist, // Use properly quoted artist name
        type: 'artist',
        priority: 1,
        description: 'Konstnär/Märke',
        preSelected: preSelected,
        source: isAICandidate ? 'ai_detected' : 'artist_info_param' // CRITICAL FIX: Use ai_detected source when appropriate
      });
      
      if (isAICandidate) {
      }
    } else {
      // CRITICAL FIX: Always check artist field directly when not passed as parameter
      // This ensures artist field content is included even when detection is skipped
      const artistField = document.querySelector('#item_artist_name_sv')?.value?.trim();
      if (artistField) {
        
        // Format artist name for search (same logic as emergency fallback)
        const cleanArtist = artistField.trim().replace(/,\s*$/, ''); // Remove trailing commas
        const words = cleanArtist.split(/\s+/).filter(word => word.length > 0);
        
        let formattedArtist;
        if (words.length > 1) {
          // Multiple words - wrap in quotes to treat as single entity
          formattedArtist = `"${cleanArtist}"`;
        } else {
          // Single word - no quotes needed
          formattedArtist = cleanArtist;
        }
        
        const preSelected = shouldBePreSelected(formattedArtist);
        candidates.push({
          term: formattedArtist,
          type: 'artist',
          priority: 1,
          description: 'Konstnär/Märke',
          preSelected: preSelected, // This will be true due to artist field logic in shouldBePreSelected
          source: 'artist_field_direct'
        });
        
      }
    }
    
    // 2. OBJECT TYPE (with deduplication check)
    const objectType = this.qualityAnalyzer.extractObjectType(title);
    console.log('🏷️ Object type extraction result:', objectType);
    if (objectType) {
      // Check if we already have this term (case-insensitive)
      const alreadyExists = candidates.some(c => 
        c.term.toLowerCase() === objectType.toLowerCase()
      );
      
      if (!alreadyExists) {
        const preSelected = shouldBePreSelected(objectType);
        console.log('🏷️ Adding object type to candidates:', objectType);
        candidates.push({
          term: objectType,
          type: 'object_type',
          priority: 2,
          description: 'Objekttyp',
          preSelected: preSelected
        });
      } else {
      }
    }
    
    // 3. WATCH/JEWELRY MODELS AND SERIES
    const watchModels = this.extractWatchModels(text);
    watchModels.forEach(model => {
      if (model && typeof model === 'string') {
        const preSelected = shouldBePreSelected(model);
        candidates.push({
          term: model,
          type: 'model',
          priority: 3,
          description: 'Modell/Serie',
          preSelected: preSelected
        });
      }
    });
    
    // 4. REFERENCE NUMBERS
    const references = this.extractReferenceNumbers(text);
    references.forEach(ref => {
      if (ref && typeof ref === 'string') {
        const preSelected = shouldBePreSelected(ref);
        candidates.push({
          term: ref,
          type: 'reference',
          priority: 4,
          description: 'Referensnummer',
          preSelected: preSelected
        });
      }
    });
    
    // 5. MATERIALS
    const materials = this.extractAllMaterials(text);
    materials.forEach(material => {
      if (material && typeof material === 'string') {
        const preSelected = shouldBePreSelected(material);
        candidates.push({
          term: material,
          type: 'material',
          priority: 5,
          description: 'Material',
          preSelected: preSelected
        });
      }
    });
    
    // 6. PERIODS/YEARS
    const periods = this.extractAllPeriods(text);
    periods.forEach(period => {
      if (period && typeof period === 'string') {
        const preSelected = shouldBePreSelected(period);
        candidates.push({
          term: period,
          type: 'period',
          priority: 6,
          description: 'Tidsperiod',
          preSelected: preSelected
        });
      }
    });
    
    // 7. MOVEMENTS/TECHNIQUES
    const movements = this.extractAllMovements(text);
    movements.forEach(movement => {
      if (movement && typeof movement === 'string') {
        const preSelected = shouldBePreSelected(movement);
        candidates.push({
          term: movement,
          type: 'movement',
          priority: 7,
          description: 'Urverk/Teknik',
          preSelected: preSelected
        });
      }
    });
    
    // 8. SIGNIFICANT WORDS (filtered list) - EXCLUDE artist name words to prevent duplication
    let textForSignificantWords = text;
    
    // CRITICAL FIX: If artist field is provided, remove artist name words from text before extracting significant words
    // This prevents "Niels Thorsson" from creating separate "Niels" and "Thorsson" checkboxes
    if (artistInfo && artistInfo.artist) {
      // Use normalized artist name for deduplication
      const normalizedArtist = artistInfo.artist.trim().replace(/,\s*$/, '');
      const artistWords = normalizedArtist.toLowerCase().split(/\s+/);
      
      console.log('🧹 Deduplicating artist words from text:', {
        originalText: textForSignificantWords.substring(0, 100) + '...',
        normalizedArtist,
        artistWords
      });
      
      // Remove artist words from the text to prevent duplication
      artistWords.forEach(artistWord => {
        if (artistWord.length > 2) { // Only remove meaningful words
          const wordRegex = new RegExp(`\\b${artistWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
          const beforeReplace = textForSignificantWords;
          textForSignificantWords = textForSignificantWords.replace(wordRegex, '');
          if (beforeReplace !== textForSignificantWords) {
            console.log(`🧹 Removed "${artistWord}" from text`);
          }
        }
      });
      
      console.log('🧹 Text after artist deduplication:', textForSignificantWords.substring(0, 100) + '...');
    }
    
    const significantWords = this.extractSignificantWords(textForSignificantWords);
    
    significantWords.forEach(word => {
      if (word && typeof word === 'string') {
        // Avoid duplicates
        const alreadyExists = candidates.some(c => c.term.toLowerCase() === word.toLowerCase());
        if (!alreadyExists) {
          const preSelected = shouldBePreSelected(word);
          candidates.push({
            term: word,
            type: 'keyword',
            priority: 8,
            description: 'Nyckelord',
            preSelected: preSelected
          });
        } else {
        }
      }
    });
    
    // 9. GEOGRAPHIC TERMS (from searchTermExtractor)
    const geographicTerms = this.searchTermExtractor?.extractGeographicTerms(text) || [];
    
    geographicTerms.forEach(geoTerm => {
      if (geoTerm && typeof geoTerm === 'string') {
        const alreadyExists = candidates.some(c => c.term.toLowerCase() === geoTerm.toLowerCase());
        if (!alreadyExists) {
          const preSelected = shouldBePreSelected(geoTerm);
          candidates.push({
            term: geoTerm,
            type: 'origin',
            priority: 8.5,
            description: 'Ursprung/Land',
            preSelected: preSelected
          });
        }
      }
    });
    
    // Sort by priority and then by whether pre-selected
    candidates.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.preSelected !== b.preSelected) return b.preSelected ? 1 : -1;
      return 0;
    });
    
    // Build current query from pre-selected terms
    const preSelectedTerms = candidates.filter(c => c.preSelected).map(c => c.term);
    const currentQuery = preSelectedTerms.join(' ');
    
    
    const selectedCandidates = candidates.filter(c => c.preSelected);
    const unselectedCandidates = candidates.filter(c => !c.preSelected);
    

    
    if (unselectedCandidates.length === 0) {
      console.warn('⚠️ PROBLEM: No unselected candidates found - should have extended terms like japan, synthesizer, etc.');
    } else {
    }
    
    return {
      candidates: candidates,
      currentQuery: currentQuery,
      analysisType: artistInfo ? 'artist' : 'freetext'
    };
  }
  
  // Helper: Build what the current algorithm would query
  buildCurrentAlgorithmQuery(title, description, artistInfo) {
    // ENHANCED BUT CONSERVATIVE: Smart pre-selection with only 3-4 CORE terms for broad market coverage
    const queryTerms = [];
    
    if (artistInfo && artistInfo.artist) {
      // ALWAYS include the artist/brand (Priority #1)
      queryTerms.push(artistInfo.artist);
      
      // ALWAYS include object type (Priority #2)
      const objectType = this.qualityAnalyzer.extractObjectType(title);
      if (objectType) {
        queryTerms.push(objectType);
      }
      
      // SELECTIVE: Include ONE most important watch/jewelry model for market relevance (Priority #3)
      const watchModels = this.extractWatchModels(title + ' ' + description);
      if (watchModels.length > 0) {
        // Only include the MOST SIGNIFICANT model (not all of them)
        const primaryModel = watchModels[0]; // First detected is usually most prominent
        queryTerms.push(primaryModel);
      }
      
      // VERY SELECTIVE: Only include period if it's a DECADE (not specific years)
      const periods = this.extractAllPeriods(title + ' ' + description);
      const decadePeriod = periods.find(p => p.includes('-tal')); // Prefer "1970-tal" over "1970"
      if (decadePeriod) {
        queryTerms.push(decadePeriod);
      }
      
      // STOP HERE: Reference numbers, materials, specific years are NOT pre-selected
      // They remain available as refinement options
      
      const conservativeQuery = queryTerms.join(' ').trim();
      return conservativeQuery;
    }
    
    // For freetext (no artist), also be conservative
    const enhancedTerms = this.qualityAnalyzer.extractEnhancedSearchTerms(title, description);
    const basicQuery = enhancedTerms.searchTerms || title;
    
    // Limit freetext to 3-4 most important words
    const words = basicQuery.split(' ').filter(w => w.length > 2);
    const conservativeFreetext = words.slice(0, 4).join(' ');
    
    return conservativeFreetext;
  }
  
  // Extract watch/jewelry models like "Seamaster", "Speedmaster", etc.
  extractWatchModels(text) {
    const models = [];
    const text_lower = text.toLowerCase();
    
    // ENHANCED: More comprehensive model patterns including synthesizers and electronic instruments
    const modelPatterns = [
      // Watch models (expanded)
      /\b(seamaster|speedmaster|constellation|de ville|railmaster|planet ocean|aqua terra|dynamic|genève|geneve)\b/gi,
      /\b(submariner|daytona|datejust|day-date|gmt-master|explorer|milgauss|yacht-master|cellini|air-king)\b/gi,
      /\b(nautilus|aquanaut|calatrava|complications|grand complications)\b/gi,
      /\b(royal oak|millenary|jules audemars)\b/gi,
      /\b(overseas|patrimony|traditionelle|malte)\b/gi,
      /\b(pilot|portuguese|portofino|aquatimer|ingenieur)\b/gi,
      /\b(navitimer|superocean|avenger|chronomat|premier)\b/gi,
      /\b([a-z]+master)\b/gi,       // Seamaster, Speedmaster, etc.
      /\b([a-z]+timer)\b/gi,        // Navitimer, Aquatimer, etc.
      /\b([a-z]+ocean)\b/gi,        // Superocean, Planet Ocean, etc.
      /\b(de ville|royal oak|grand [a-z]+)\b/gi,
      
      // SYNTHESIZER & ELECTRONIC INSTRUMENT MODELS
      /\b(DX\d+[A-Z]*)\b/gi,        // DX7, DX100, DX27, etc.
      /\b(MX\d+[A-Z]*)\b/gi,        // MX series
      /\b(PSR?\d+[A-Z]*)\b/gi,      // PSR series
      /\b(SY\d+[A-Z]*)\b/gi,        // SY series
      /\b(CS\d+[A-Z]*)\b/gi,        // CS series
      /\b(MT\d+[A-Z]*)\b/gi,        // MT series
      /\b(RX\d+[A-Z]*)\b/gi,        // RX series
      /\b(QX\d+[A-Z]*)\b/gi,        // QX series
      /\b(AN\d+[A-Z]*)\b/gi,        // AN series
      /\b(TX\d+[A-Z]*)\b/gi,        // TX series
      /\b(TG\d+[A-Z]*)\b/gi,        // TG series
      /\b(EX\d+[A-Z]*)\b/gi,        // EX series
      /\b(GX\d+[A-Z]*)\b/gi,        // GX series
      /\b(VL\d+[A-Z]*)\b/gi,        // VL series
      /\b(V\d+[A-Z]*)\b/gi,         // V series synthesizers
      /\b(SH\d+[A-Z]*)\b/gi,        // SH series (Roland)
      /\b(JP\d+[A-Z]*)\b/gi,        // JP series (Roland)
      /\b(JV\d+[A-Z]*)\b/gi,        // JV series (Roland)
      /\b(D\d+[A-Z]*)\b/gi,         // D series (Roland)
      /\b(TR\d+[A-Z]*)\b/gi,        // TR drum machines
      /\b(TB\d+[A-Z]*)\b/gi,        // TB bass machines
      /\b(MC\d+[A-Z]*)\b/gi,        // MC series
      /\b(SP\d+[A-Z]*)\b/gi,        // SP series
      /\b(MPC\d+[A-Z]*)\b/gi,       // MPC series (Akai)
      /\b(S\d+[A-Z]*)\b/gi,         // S series samplers
      /\b(K\d+[A-Z]*)\b/gi,         // K series (Kurzweil)
      /\b(PC\d+[A-Z]*)\b/gi,        // PC series (Kurzweil)
      /\b(JD\d+[A-Z]*)\b/gi,        // JD series (Roland)
      /\b(XP\d+[A-Z]*)\b/gi,        // XP series (Roland)
      /\b(XV\d+[A-Z]*)\b/gi,        // XV series (Roland)
      /\b(JUNO\d+[A-Z]*)\b/gi,      // JUNO series
      /\b(JUPITER\d+[A-Z]*)\b/gi,   // JUPITER series
      
      // GENERIC ALPHANUMERIC MODEL PATTERNS (enhanced)
      /\b([A-Z]{1,4}\d{1,4}[A-Z]*)\b/g,     // DX7, SH101, JP8000, etc.
      /\b([A-Z]+\d+[A-Z]*\d*)\b/g           // More flexible patterns
    ];
    
    modelPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const cleaned = match.trim();
          // Filter out unwanted matches like years and common false positives
          if (cleaned.length > 1 && 
              !cleaned.match(/^\d{4}$/) && // Not a year like 1983
              !cleaned.match(/^[A-Z]{1}$/) && // Not single letters
              !models.some(m => m.toLowerCase() === cleaned.toLowerCase())) {
            models.push(cleaned);
          }
        });
      }
    });
    
    // Special handling for quoted model names like "The Grand"
    const quotedModels = text.match(/"([^"]{3,})"/g);
    if (quotedModels) {
      quotedModels.forEach(quoted => {
        const modelName = quoted.replace(/"/g, '').trim();
        if (modelName.length > 2 && !models.some(m => m.toLowerCase() === modelName.toLowerCase())) {
          models.push(modelName);
        }
      });
    }
    
    return models;
  }
  
  // Extract reference numbers
  extractReferenceNumbers(text) {
    const references = [];
    
    const refPatterns = [
      /reference\s+([A-Z]{1,3}\s*\d{3,6}[A-Z]*)/gi,
      /ref\.?\s+([A-Z]{1,3}\s*\d{3,6}[A-Z]*)/gi,
      /\b([A-Z]{1,3}\s*\d{3,6}[A-Z]*)\b/g  // Generic alphanumeric patterns
    ];
    
    refPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const cleaned = match.trim().replace(/\s+/g, ' ');
          if (cleaned.length > 2 && !references.includes(cleaned)) {
            references.push(cleaned);
          }
        });
      }
    });
    
    return references;
  }
  
  // Extract all materials
  extractAllMaterials(text) {
    const materials = [];
    const text_lower = text.toLowerCase();
    
    const materialPatterns = [
      /\b(guld|silver|platina|titan|stål|keramik|läder|kautschuk|nylon|canvas|metall)\b/gi,
      /\b(18k|14k|925|950|316l|904l)\b/gi,
      /\b(vitguld|rödguld|roséguld|gelbgold|weissgold|rotgold)\b/gi
    ];
    
    materialPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const cleaned = match.trim();
          if (cleaned.length > 1 && !materials.includes(cleaned)) {
            materials.push(cleaned);
          }
        });
      }
    });
    
    return materials;
  }
  
  // Extract all periods
  extractAllPeriods(text) {
    const periods = [];
    
    const periodPatterns = [
      /\b(\d{4})\b/g,                    // 1950
      /\b(\d{2,4}-tal)\b/g,              // 1900-tal
      /\b(\d{2}\/\d{4}-tal)\b/g,         // 17/1800-tal
      /\b(1[6-9]\d{2})\b/g,              // 1600-1999
      /\b(20[0-2]\d)\b/g                 // 2000-2029
    ];
    
    periodPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const cleaned = match.trim();
          if (cleaned.length > 2 && !periods.includes(cleaned)) {
            periods.push(cleaned);
          }
        });
      }
    });
    
    return periods;
  }
  
  // Extract all movements
  extractAllMovements(text) {
    const movements = [];
    const text_lower = text.toLowerCase();
    
    const movementPatterns = [
      /\b(automatisk|manuell|kvarts|quartz|mechanical|automatic|manual|handaufzug|automatik)\b/gi,
      /\b(cronograf|chronograph|perpetual|moon phase|gmt|worldtime)\b/gi,
      /\b(cal\.\s*\d+|kaliber\s*\d+|calibre\s*\d+)\b/gi
    ];
    
    movementPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const cleaned = match.trim();
          if (cleaned.length > 2 && !movements.includes(cleaned)) {
            movements.push(cleaned);
          }
        });
      }
    });
    
    return movements;
  }
  
  // Extract significant words (filtered to avoid noise)
  extractSignificantWords(text) {
    const words = [];
    const stopWords = new Set([
      'och', 'i', 'på', 'av', 'för', 'med', 'till', 'från', 'ett', 'en', 'det', 'den', 'de', 'är', 'var', 'har', 'hade', 'som', 'om', 'men', 'så', 'kan', 'ska', 'skulle', 'inte', 'eller', 'när', 'där', 'här', 'vid', 'under', 'över', 'efter', 'innan', 'sedan', 'alla', 'mycket', 'bara', 'även', 'utan', 'mellan', 'genom', 'hela', 'andra', 'samma', 'flera', 'några', 'båda', 'varje', 'denna', 'dessa', 'detta', 'ingen', 'inget', 'inga', 'något', 'någon', 'några', 'alla', 'allt', 'många', 'mest', 'mer', 'mindre', 'största', 'minsta', 'första', 'sista', 'nästa', 'förra', 'nya', 'gamla', 'goda', 'bra', 'dålig', 'stor', 'liten', 'hög', 'låg', 'lång', 'kort', 'bred', 'smal', 'tjock', 'tunn'
    ]);
    
    // Add "tal" to stopwords when it appears as part of period expressions
    stopWords.add('tal');
    
    // Extract words that are 3+ characters and not stop words
    const textWords = text.toLowerCase().match(/\b[a-zåäöü]{3,}\b/g) || [];
    
    textWords.forEach(word => {
      if (!stopWords.has(word) && !words.includes(word)) {
        words.push(word);
      }
    });
    
    return words.slice(0, 10); // Limit to prevent overwhelming UI
  }

  // NEW: Setup interactive search filter functionality (Phase 2)
  setupSearchFilterInteractivity() {
    
    const updateBtn = document.getElementById('update-search-btn');
    const currentSearchDisplay = document.getElementById('current-search-display');
    // Support both old and new modular system checkbox classes  
    const candidateCheckboxes = [
      ...document.querySelectorAll('.candidate-checkbox'),
      ...document.querySelectorAll('.smart-checkbox'),
      ...document.querySelectorAll('.header-checkbox')
    ];
    
    if (!updateBtn || !currentSearchDisplay || candidateCheckboxes.length === 0) {

      return;
    }
    
    // Update the current search display as checkboxes change
    const updateCurrentSearchDisplay = () => {
      const selectedTerms = [];
      candidateCheckboxes.forEach(checkbox => {
        if (checkbox.checked) {
          selectedTerms.push(checkbox.value);
        }
      });
      
      const newQuery = selectedTerms.join(' ');
      currentSearchDisplay.textContent = `"${newQuery}"`;
      
      // Update button state
      const hasChanges = newQuery !== this.lastCandidateSearchTerms.currentQuery;
      updateBtn.style.background = hasChanges ? '#dc3545' : '#007cba';
      updateBtn.textContent = hasChanges ? 'Uppdatera ⚡' : 'Uppdatera';
    };
    
    // Add change listeners to all checkboxes
    candidateCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', updateCurrentSearchDisplay);
    });
    
    // Add click handler to update button
    updateBtn.addEventListener('click', async () => {
      
      const selectedTerms = [];
      candidateCheckboxes.forEach(checkbox => {
        if (checkbox.checked) {
          selectedTerms.push(checkbox.value);
        }
      });
      
      if (selectedTerms.length === 0) {
        alert('⚠️ Välj minst en sökterm för marknadsanalys');
        return;
      }
      
      // Build new search query
      const newQuery = selectedTerms.join(' ');
      
      // Show loading state
      updateBtn.textContent = 'Söker...';
      updateBtn.disabled = true;
      
      try {
        // Get current item data
        const data = this.dataExtractor.extractItemData();
        
        // CRITICAL FIX: Use SearchQueryManager SSoT for consistent query building
        if (!this.searchQuerySSoT) {
          console.error('❌ CONSISTENCY ERROR: SearchQueryManager not available for interactive filter');
          alert('⚠️ Sökfunktion inte tillgänglig - ladda om sidan');
          return;
        }
        
        
        // Update SSoT with user selections (don't update Hidden Keywords field)
        this.searchQuerySSoT.updateUserSelections(selectedTerms, { updateDOMField: false });
        
        // Get the new query from SSoT (with core terms preserved)
        const newQueryFromSSoT = this.searchQuerySSoT.getCurrentQuery();
        
        // Build search context using SSoT
        const customSearchContext = this.searchQuerySSoT.buildSearchContext(
          null, // artistInfo (SSoT handles this internally)
          '', // objectType (SSoT handles this internally)  
          '', // period (SSoT handles this internally)
          '', // technique
          {}, // enhancedTerms
          'user_interactive' // analysisType
        );
        
        
        // Call API with custom search
        const filteredSalesData = await this.apiManager.analyzeSales(customSearchContext);
        
        // FIX: Add analysis metadata to sales data (this was missing!)
        filteredSalesData.analysisType = 'custom_user_filter';
        filteredSalesData.searchedEntity = newQueryFromSSoT;
        filteredSalesData.searchContext = customSearchContext;
        
        // Update the current search terms for future reference
        this.lastCandidateSearchTerms.currentQuery = newQueryFromSSoT;
        
        // Regenerate dashboard with filtered results
        const valuationSuggestions = this.qualityAnalyzer.salesAnalysisManager.analyzeValuationSuggestions(filteredSalesData);
        this.dashboardManager.addMarketDataDashboard(filteredSalesData, valuationSuggestions);
        
        
      } catch (error) {
        console.error('❌ Failed to update search filter:', error);
        alert('❌ Sökning misslyckades. Försök igen.');
      } finally {
        // Reset button state
        updateBtn.textContent = 'Uppdatera';
        updateBtn.disabled = false;
        updateBtn.style.background = '#007cba';
      }
    });
    
  }

  // NEW: Setup interactive header search filter functionality with auto-reload
  setupHeaderSearchFilterInteractivity() {
    
    // Support both old and new modular system checkbox classes
    const candidateCheckboxes = [
      ...document.querySelectorAll(".candidate-checkbox-header"),
      ...document.querySelectorAll(".header-checkbox"),
      ...document.querySelectorAll(".smart-checkbox")
    ];
    
    if (candidateCheckboxes.length === 0) {

      return;
    }
    
    
    // Add change listeners to all checkboxes for auto-reload
    candidateCheckboxes.forEach((checkbox, index) => {
      checkbox.addEventListener("change", async (event) => {
        
        // Slight delay to allow UI to update before reload
        setTimeout(async () => {
          await this.handleHeaderSearchFilterChange();
        }, 100);
      });
    });
    
  }

  // Handle search filter changes with auto-reload
  async handleHeaderSearchFilterChange() {
    
    // Support both old and new modular system checkbox classes
    const candidateCheckboxes = [
      ...document.querySelectorAll(".candidate-checkbox-header"),
      ...document.querySelectorAll(".header-checkbox"),
      ...document.querySelectorAll(".smart-checkbox")
    ];
    const selectedTerms = [];
    
    candidateCheckboxes.forEach(checkbox => {
      if (checkbox.checked) {
        selectedTerms.push(checkbox.value);
      }
    });
    
    
    if (selectedTerms.length === 0) {

      return;
    }
    
    try {
      // CRITICAL FIX: Use SearchQueryManager SSoT for consistent query building
      if (!this.searchQuerySSoT) {
        console.error('❌ CONSISTENCY ERROR: SearchQueryManager not available for header filter change');
        return;
      }
      
      
      // Update SSoT with user selections (don't update Hidden Keywords field)
      this.searchQuerySSoT.updateUserSelections(selectedTerms, { updateDOMField: false });
      
      // Get the new query from SSoT (with core terms preserved)
      const newQuery = this.searchQuerySSoT.getCurrentQuery();
      
      // Build search context using SSoT
      const customSearchContext = this.searchQuerySSoT.buildSearchContext(
        null, // artistInfo (SSoT handles this internally)
        '', // objectType (SSoT handles this internally)
        '', // period (SSoT handles this internally)
        '', // technique
        {}, // enhancedTerms
        'user_header_filter' // analysisType
      );
      
      
      // Show loading indicator on dashboard
      
      if (this.dashboardManager && typeof this.dashboardManager.showDashboardLoading === 'function') {
        this.dashboardManager.showDashboardLoading();
      } else {
        console.error('❌ SearchFilterManager: Dashboard manager or showDashboardLoading method not available!');
      }
      
      // Call API with SSoT-generated search context
      const filteredSalesData = await this.apiManager.analyzeSales(customSearchContext);
      
      // Add analysis metadata
      filteredSalesData.analysisType = "custom_user_filter";
      filteredSalesData.searchedEntity = newQuery;
      filteredSalesData.searchContext = customSearchContext;
      
      
      // Update dashboard with new data
      this.dashboardManager.addMarketDataDashboard(filteredSalesData);
      
    } catch (error) {
      console.error("❌ Header search filter error:", error);
    } finally {
      
      if (this.dashboardManager && typeof this.dashboardManager.hideDashboardLoading === 'function') {
        this.dashboardManager.hideDashboardLoading();
      } else {
        console.error('❌ SearchFilterManager: Dashboard manager or hideDashboardLoading method not available in finally!');
      }
    }
  }

  // NEW: Synchronize pill checkbox states with current SSoT selection state
  synchronizePillsWithSSoT() {
    
    if (!this.searchQuerySSoT) {

      return;
    }
    
    // Get current SSoT state
    const currentTerms = this.searchQuerySSoT.getCurrentTerms() || [];
    const availableTerms = this.searchQuerySSoT.getAvailableTerms() || [];
    
    
    // Find all pill checkboxes (both old and new modular system)
    const allCheckboxes = [
      ...document.querySelectorAll('.candidate-checkbox'),
      ...document.querySelectorAll('.candidate-checkbox-header'),
      ...document.querySelectorAll('.smart-checkbox'),
      ...document.querySelectorAll('.header-checkbox'),
      ...document.querySelectorAll('.suggestion-checkbox')
    ];
    
    
    let syncCount = 0;
    let mismatchCount = 0;
    
    // Synchronize each checkbox with SSoT state
    allCheckboxes.forEach(checkbox => {
      const checkboxValue = checkbox.value;
      const checkboxCurrentState = checkbox.checked;
      
      // CRITICAL FIX: Use SSoT's smart quote matching logic instead of manual comparison
      const shouldBeSelected = this.searchQuerySSoT.isTermSelected(checkboxValue);
      
      // Update checkbox if it doesn't match SSoT state
      if (checkboxCurrentState !== shouldBeSelected) {
        checkbox.checked = shouldBeSelected;
        mismatchCount++;
      } else {
      }
      
      syncCount++;
    });
    
    
    // Trigger display update if there were changes
    if (mismatchCount > 0) {
      
      // Update current search display in filter sections
      const updateCurrentSearchDisplay = () => {
        // Support both old and new modular system checkbox classes
        const candidateCheckboxes = [
          ...document.querySelectorAll('.candidate-checkbox'),
          ...document.querySelectorAll('.smart-checkbox'),
          ...document.querySelectorAll('.header-checkbox')
        ];
        const selectedTerms = [];
        candidateCheckboxes.forEach(checkbox => {
          if (checkbox.checked) {
            selectedTerms.push(checkbox.value);
          }
        });
        
        const currentSearchDisplay = document.getElementById('current-search-display');
        if (currentSearchDisplay) {
          const newQuery = selectedTerms.join(' ');
          currentSearchDisplay.textContent = `"${newQuery}"`;
        }
      };
      
      updateCurrentSearchDisplay();
    }
    
    return { syncCount, mismatchCount };
  }
} 
