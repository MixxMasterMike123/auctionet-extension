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
    console.log('✅ SearchFilterManager: SearchTermExtractor connected for extended terms');
  }

  // NEW: Set AI-only SearchQuerySSoT
  setSearchQuerySSoT(searchQuerySSoT) {
    this.searchQuerySSoT = searchQuerySSoT;
    console.log('✅ SearchFilterManager: AI-only SearchQuerySSoT connected');
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
    console.log('🔍 Extracting ALL candidate search terms for:', title);
    
    const text = `${title} ${description}`.toLowerCase();
    const candidates = [];
    
    // NEW: Check if we have AI Rules results to respect
    let aiSelectedTerms = [];
    if (actualSearchQuery && this.searchQuerySSoT) {
      // Get the AI Rules selected terms from SSoT
      const currentTerms = this.searchQuerySSoT.getCurrentTerms();
      if (currentTerms && currentTerms.length > 0) {
        aiSelectedTerms = currentTerms;
        console.log('🤖 AI RULES: Respecting AI-selected terms for preSelection:', aiSelectedTerms);
      }
    }
    
    const shouldBePreSelected = (term) => {
      // NEW: PRIORITY 1 - Respect AI Rules enhanced pre-selection if available
      if (aiSelectedTerms.length > 0) {
        // Check if this term is in the AI Rules PRE-SELECTED terms (EXACT MATCH ONLY)
        const isAIPreSelected = aiSelectedTerms.some(aiTerm => {
          const normalizedAI = aiTerm.toLowerCase().trim();
          const normalizedTerm = term.toLowerCase().trim();
          // STRICT MATCHING: Only exact matches, no partial matches
          return normalizedAI === normalizedTerm;
        });
        
        if (isAIPreSelected) {
          console.log(`🤖 AI RULES: "${term}" is AI PRE-SELECTED - will be checked by default ✅`);
          return true;
        } else {
          console.log(`🤖 AI RULES: "${term}" is candidate only - available as unchecked option ⚪`);
          return false;
        }
      }
      
      // FALLBACK: Use original logic when no AI Rules available
      // Guard against null/undefined terms
      if (!term || typeof term !== 'string') {
        console.log(`🚨 AI DECISION: Invalid term (null/undefined) - skipping ❌`);
        return false;
      }
      
      // 🤖 AI-INTELLIGENT PRE-SELECTION: Only select the 2-3 most strategically important terms
      // Prioritize BROAD market coverage over narrow specificity for initial search
      
      const termLower = term.toLowerCase();
      
      // PRIORITY 1: Brand/Artist is ALWAYS pre-selected (most important for market data)
      if (artistInfo && artistInfo.artist && termLower.includes(artistInfo.artist.toLowerCase())) {
        console.log(`🤖 AI DECISION: "${term}" is BRAND - CRITICAL for market data ✅`);
        return true;
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
        console.log(`🤖 AI DECISION: "${term}" is RECOGNIZED BRAND - CRITICAL for market data ✅`);
        return true;
      }
      
      // PRIORITY 2: Object type is ALWAYS pre-selected (second most important)
      const objectType = this.qualityAnalyzer.extractObjectType(title);
      if (term.toLowerCase() === 'rolex' || (objectType && objectType.toLowerCase() === termLower)) {
        console.log(`🤖 AI DECISION: "${term}" is OBJECT TYPE - CRITICAL for market categorization ✅`);
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
        console.log(`🤖 AI DECISION: "${term}" is KNOWN MODEL - CRITICAL for targeted market data ✅`);
        return true;
      }
      
      // Check for synthesizer/electronic instrument pattern (letters + numbers, like DX7, SH101)
      if (/^[A-Z]{1,4}\d{1,4}[A-Z]*$/i.test(term) && term.length >= 3 && term.length <= 8) {
        console.log(`🤖 AI DECISION: "${term}" is ELECTRONIC INSTRUMENT MODEL - CRITICAL for market data ✅`);
        return true;
      }
      
      // CONSERVATIVE CHANGE: Complete models are valuable but should be OPTIONAL for broader coverage
      // Make them available as refinements rather than pre-selected to avoid overly narrow searches
      if (term.length > 10 && (term.includes(' ') || term.includes('-'))) {
        console.log(`🤖 AI DECISION: "${term}" is COMPLETE MODEL - Available as optional refinement for narrower search ⚪`);
        return false; // Changed from true to false - make available but not pre-selected
      }
      
      // 🤖 AI REJECTS individual model words - they fragment the search and reduce market data
      if (['oyster', 'perpetual', 'air', 'king', 'precision'].includes(termLower)) {
        console.log(`🤖 AI DECISION: "${term}" is MODEL FRAGMENT - Better as complete model name ❌`);
        return false;
      }
      
      // 🤖 AI REJECTS materials for initial broad search
      if (['stål', 'guld', 'silver', 'titan', 'steel', 'gold'].includes(termLower)) {
        console.log(`🤖 AI DECISION: "${term}" is MATERIAL - Too narrow for initial market search ❌`);
        return false;
      }
      
      // 🤖 AI ENHANCED: Reject generic reference numbers but allow important models through
      if (/^\d{4}$/.test(term)) {
        // Reject standalone years (like 1983, 1987)
        console.log(`🤖 AI DECISION: "${term}" is YEAR - Too specific for initial market search ❌`);
        return false;
      } else if (term.toLowerCase().includes('ref')) {
        // Reject explicit reference patterns
        console.log(`🤖 AI DECISION: "${term}" is REFERENCE - Too specific for initial market search ❌`);
        return false;
      }
      
      // 🤖 AI REJECTS technical specifications for initial broad search
      if (['automatic', 'manuell', 'cal', 'caliber', 'diameter', 'mm', 'programmable', 'algorithm'].some(tech => termLower.includes(tech))) {
        console.log(`🤖 AI DECISION: "${term}" is TECHNICAL SPEC - Too narrow for initial market search ❌`);
        return false;
      }
      
      // Default: reject unless specifically identified as strategically important
      console.log(`🤖 AI DECISION: "${term}" not strategically important for initial market search ❌`);
      return false;
    };
    
    // 1. ARTIST/BRAND (if available)
    if (artistInfo && artistInfo.artist) {
      const preSelected = shouldBePreSelected(artistInfo.artist);
      candidates.push({
        term: artistInfo.artist,
        type: 'artist',
        priority: 1,
        description: 'Konstnär/Märke',
        preSelected: preSelected
      });
    }
    
    // 2. OBJECT TYPE (with deduplication check)
    const objectType = this.qualityAnalyzer.extractObjectType(title);
    if (objectType) {
      // Check if we already have this term (case-insensitive)
      const alreadyExists = candidates.some(c => 
        c.term.toLowerCase() === objectType.toLowerCase()
      );
      
      if (!alreadyExists) {
        const preSelected = shouldBePreSelected(objectType);
        candidates.push({
          term: objectType,
          type: 'object_type',
          priority: 2,
          description: 'Objekttyp',
          preSelected: preSelected
        });
      } else {
        console.log(`🔧 DEDUPLICATION: Skipping duplicate object type "${objectType}" (already exists in candidates)`);
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
        console.log(`📅 PERIOD DEBUG: "${period}" should be pre-selected: ${preSelected}`);
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
      const artistWords = artistInfo.artist.toLowerCase().split(/\s+/);
      console.log(`🔧 ARTIST DEDUPLICATION: Removing artist words from significant word extraction:`, artistWords);
      
      // Remove artist words from the text to prevent duplication
      artistWords.forEach(artistWord => {
        if (artistWord.length > 2) { // Only remove meaningful words
          const wordRegex = new RegExp(`\\b${artistWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
          textForSignificantWords = textForSignificantWords.replace(wordRegex, '');
          console.log(`🔧 Removed artist word "${artistWord}" from significant word extraction`);
        }
      });
    }
    
    const significantWords = this.extractSignificantWords(textForSignificantWords);
    console.log('🔧 DEBUG: Significant words extracted (after artist deduplication):', significantWords);
    
    significantWords.forEach(word => {
      if (word && typeof word === 'string') {
        // Avoid duplicates
        const alreadyExists = candidates.some(c => c.term.toLowerCase() === word.toLowerCase());
        if (!alreadyExists) {
          const preSelected = shouldBePreSelected(word);
          console.log(`🔧 DEBUG: Processing significant word "${word}" - preSelected: ${preSelected}`);
          candidates.push({
            term: word,
            type: 'keyword',
            priority: 8,
            description: 'Nyckelord',
            preSelected: preSelected
          });
        } else {
          console.log(`🔧 DEBUG: Skipping duplicate significant word "${word}"`);
        }
      }
    });
    
    // 9. GEOGRAPHIC TERMS (from searchTermExtractor)
    const geographicTerms = this.searchTermExtractor?.extractGeographicTerms(text) || [];
    console.log('🔧 DEBUG: Geographic terms extracted:', geographicTerms);
    
    geographicTerms.forEach(geoTerm => {
      if (geoTerm && typeof geoTerm === 'string') {
        const alreadyExists = candidates.some(c => c.term.toLowerCase() === geoTerm.toLowerCase());
        if (!alreadyExists) {
          const preSelected = shouldBePreSelected(geoTerm);
          console.log(`🔧 DEBUG: Processing geographic term "${geoTerm}" - preSelected: ${preSelected}`);
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
    
    console.log('🎯 ALL extracted candidate search terms:', candidates);
    console.log('✅ Total candidates found:', candidates.length);
    console.log('✅ Pre-selected candidates:', preSelectedTerms);
    console.log('🔧 EXTENDED TERMS DEBUG - All candidates by type:');
    
    const selectedCandidates = candidates.filter(c => c.preSelected);
    const unselectedCandidates = candidates.filter(c => !c.preSelected);
    
    console.log(`📌 SELECTED (will be checked): ${selectedCandidates.length}`);
    selectedCandidates.forEach(c => console.log(`   ✅ "${c.term}" (${c.type}) - ${c.description}`));
    
    console.log(`📋 UNSELECTED (should be available as unchecked): ${unselectedCandidates.length}`);
    unselectedCandidates.forEach(c => console.log(`   ⚪ "${c.term}" (${c.type}) - ${c.description}`));
    
    if (unselectedCandidates.length === 0) {
      console.warn('⚠️ PROBLEM: No unselected candidates found - should have extended terms like japan, synthesizer, etc.');
    } else {
      console.log(`✅ GOOD: Found ${unselectedCandidates.length} extended terms for user control`);
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
        console.log(`🎯 CONSERVATIVE: Including ONE primary model "${primaryModel}" for broad market coverage`);
      }
      
      // VERY SELECTIVE: Only include period if it's a DECADE (not specific years)
      const periods = this.extractAllPeriods(title + ' ' + description);
      const decadePeriod = periods.find(p => p.includes('-tal')); // Prefer "1970-tal" over "1970"
      if (decadePeriod) {
        queryTerms.push(decadePeriod);
        console.log(`🎯 CONSERVATIVE: Including decade period "${decadePeriod}" for broad market coverage`);
      }
      
      // STOP HERE: Reference numbers, materials, specific years are NOT pre-selected
      // They remain available as refinement options
      
      const conservativeQuery = queryTerms.join(' ').trim();
      console.log(`🎯 CONSERVATIVE ALGORITHM: "${conservativeQuery}" (3-4 core terms only)`);
      console.log(`📋 Available for refinement: Reference numbers, materials, specific years, etc.`);
      return conservativeQuery;
    }
    
    // For freetext (no artist), also be conservative
    const enhancedTerms = this.qualityAnalyzer.extractEnhancedSearchTerms(title, description);
    const basicQuery = enhancedTerms.searchTerms || title;
    
    // Limit freetext to 3-4 most important words
    const words = basicQuery.split(' ').filter(w => w.length > 2);
    const conservativeFreetext = words.slice(0, 4).join(' ');
    
    console.log(`🎯 CONSERVATIVE FREETEXT: "${conservativeFreetext}" (limited to 4 words)`);
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
            console.log(`🔍 MODEL DETECTED: "${cleaned}"`);
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
          console.log(`🔍 QUOTED MODEL DETECTED: "${modelName}"`);
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
    console.log('🔧 Setting up interactive search filter functionality...');
    
    const updateBtn = document.getElementById('update-search-btn');
    const currentSearchDisplay = document.getElementById('current-search-display');
    const candidateCheckboxes = document.querySelectorAll('.candidate-checkbox');
    
    if (!updateBtn || !currentSearchDisplay || candidateCheckboxes.length === 0) {
      console.log('⚠️ Search filter elements not found - interactivity not available');
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
      console.log('🔄 User triggered search filter update...');
      
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
      console.log('🔍 New user-selected search query:', newQuery);
      
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
        
        console.log('🔧 CONSISTENCY FIX: Using SearchQueryManager SSoT for interactive filter');
        
        // Update SSoT with user selections
        this.searchQuerySSoT.updateUserSelections(selectedTerms);
        
        // Get the new query from SSoT (with core terms preserved)
        const newQueryFromSSoT = this.searchQuerySSoT.getCurrentQuery();
        console.log('🎯 SSoT generated consistent query:', newQueryFromSSoT);
        
        // Build search context using SSoT
        const customSearchContext = this.searchQuerySSoT.buildSearchContext(
          null, // artistInfo (SSoT handles this internally)
          '', // objectType (SSoT handles this internally)  
          '', // period (SSoT handles this internally)
          '', // technique
          {}, // enhancedTerms
          'user_interactive' // analysisType
        );
        
        console.log('🎯 SSoT search context for interactive filter:', customSearchContext);
        
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
        
        console.log('✅ Search filter updated successfully');
        
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
    
    console.log('✅ Interactive search filter setup complete!');
  }

  // NEW: Setup interactive header search filter functionality with auto-reload
  setupHeaderSearchFilterInteractivity() {
    console.log("🔧 Setting up header search filter with auto-reload...");
    
    const candidateCheckboxes = document.querySelectorAll(".candidate-checkbox-header");
    
    if (candidateCheckboxes.length === 0) {
      console.log("⚠️ No header search filter checkboxes found");
      return;
    }
    
    console.log(`✅ Found ${candidateCheckboxes.length} header checkboxes`);
    
    // Add change listeners to all checkboxes for auto-reload
    candidateCheckboxes.forEach((checkbox, index) => {
      checkbox.addEventListener("change", async (event) => {
        console.log(`🔄 Checkbox ${index + 1} changed: ${checkbox.value} = ${checkbox.checked}`);
        
        // Slight delay to allow UI to update before reload
        setTimeout(async () => {
          await this.handleHeaderSearchFilterChange();
        }, 100);
      });
    });
    
    console.log("✅ Header search filter auto-reload functionality activated");
  }

  // Handle search filter changes with auto-reload
  async handleHeaderSearchFilterChange() {
    console.log("🔄 Processing header search filter change...");
    
    const candidateCheckboxes = document.querySelectorAll(".candidate-checkbox-header");
    const selectedTerms = [];
    
    candidateCheckboxes.forEach(checkbox => {
      if (checkbox.checked) {
        selectedTerms.push(checkbox.value);
      }
    });
    
    console.log("👤 User selected terms from UI:", selectedTerms);
    
    if (selectedTerms.length === 0) {
      console.log("⚠️ No terms selected - keeping current search");
      return;
    }
    
    try {
      // CRITICAL FIX: Use SearchQueryManager SSoT for consistent query building
      if (!this.searchQuerySSoT) {
        console.error('❌ CONSISTENCY ERROR: SearchQueryManager not available for header filter change');
        return;
      }
      
      console.log("🔧 CONSISTENCY FIX: Using SearchQueryManager SSoT for header filter");
      
      // Update SSoT with user selections
      this.searchQuerySSoT.updateUserSelections(selectedTerms);
      
      // Get the new query from SSoT (with core terms preserved)
      const newQuery = this.searchQuerySSoT.getCurrentQuery();
      console.log("🎯 SSoT generated consistent query:", newQuery);
      
      // Build search context using SSoT
      const customSearchContext = this.searchQuerySSoT.buildSearchContext(
        null, // artistInfo (SSoT handles this internally)
        '', // objectType (SSoT handles this internally)
        '', // period (SSoT handles this internally)
        '', // technique
        {}, // enhancedTerms
        'user_header_filter' // analysisType
      );
      
      console.log("🎯 SSoT search context for header filter:", customSearchContext);
      
      // Show loading indicator on dashboard
      this.dashboardManager.showDashboardLoading();
      
      // Call API with SSoT-generated search context
      const filteredSalesData = await this.apiManager.analyzeSales(customSearchContext);
      
      // Add analysis metadata
      filteredSalesData.analysisType = "custom_user_filter";
      filteredSalesData.searchedEntity = newQuery;
      filteredSalesData.searchContext = customSearchContext;
      
      console.log("🔥 Header filter analysis complete with SSoT consistency");
      
      // Update dashboard with new data
      this.dashboardManager.addMarketDataDashboard(filteredSalesData);
      
    } catch (error) {
      console.error("❌ Header search filter error:", error);
    } finally {
      this.dashboardManager.hideDashboardLoading();
    }
  }
} 
