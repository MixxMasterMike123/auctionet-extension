// modules/ai-search-rules.js - AI Search Query Generation Rules
// Configurable rules for AI search query generation that can be tweaked

export const AI_SEARCH_RULES = {
  // CRITICAL RULE 1: Artist field must be respected when filled
  artistField: {
    priority: 100, // Highest priority
    rule: "ALWAYS include artist field content when filled",
    implementation: "If artist field has content, it MUST be included in search query",
    reasoning: "Artist field is manually curated data - highest signal for market relevance"
  },

  // CRITICAL RULE 2: Brand identification
  brandRecognition: {
    priority: 90,
    rule: "Identify and prioritize known brands/manufacturers",
    knownBrands: [
      // Ceramics & Porcelain
      "Royal Copenhagen", "Rörstrand", "Gustavsberg", "Arabia", "Bing & Grøndahl",
      "Meissen", "Wedgwood", "Limoges", "Sèvres", "KPM",
      
      // Watches
      "Rolex", "Omega", "Patek Philippe", "Cartier", "Breitling", "Tag Heuer",
      "Longines", "Tissot", "Seiko", "Citizen", "Lings", "Halda",
      
      // Musical Instruments & Synthesizers  
      "Yamaha", "Roland", "Korg", "Moog", "Sequential", "Oberheim", "ARP",
      "Steinway", "Kawai", "Grotrian", "Bechstein", "Petrof",
      
      // Glass & Crystal
      "Orrefors", "Kosta Boda", "Baccarat", "Lalique", "Waterford",
      
      // Silver & Jewelry
      "Georg Jensen", "Tiffany", "Cartier", "Bulgari"
    ],
    implementation: "When brand detected, include brand name in search query"
  },

  // RULE 3: Object type specificity
  objectType: {
    priority: 80,
    rule: "Include specific object type for targeted results",
    translations: {
      // Swedish to search-optimized terms
      "armbandsur": "armbandsur",
      "fickur": "fickur", 
      "klocka": "klocka",
      "fat": "fat",
      "skål": "skål",
      "vas": "vas",
      "tallrik": "tallrik",
      "kopp": "kopp",
      "synthesizer": "synthesizer",
      "piano": "piano",
      "flygel": "flygel"
    },
    implementation: "Include specific object type for market categorization"
  },

  // RULE 4: Model numbers and specific identifiers
  modelNumbers: {
    priority: 75,
    rule: "Include model numbers, pattern names, and specific identifiers",
    patterns: [
      /^[A-Z]{1,4}\d{1,4}[A-Z]*$/i, // DX7, JP8000, SH101, etc.
      /musselmalet/i,
      /flora danica/i,
      /blue fluted/i,
      /speedmaster/i,
      /seamaster/i
    ],
    implementation: "Model numbers are highly specific and valuable for market analysis"
  },

  // RULE 5: Geographic origins (lower priority)
  geography: {
    priority: 60,
    rule: "Include geographic origins only if space permits",
    terms: ["Danmark", "Sverige", "Finland", "Norge", "Japan", "Germany", "France"],
    implementation: "Geographic terms help but are secondary to artist/brand/model"
  },

  // RULE 6: Materials (lowest priority unless luxury)
  materials: {
    priority: 50,
    rule: "Include materials for luxury items or when characteristic",
    luxuryMaterials: ["guld", "gold", "platina", "platinum", "silver", "ädel"],
    commonMaterials: ["stengods", "porslin", "glas", "keramik"],
    implementation: "Luxury materials increase value significantly, common materials less important"
  },

  // QUERY CONSTRUCTION RULES
  queryConstruction: {
    maxTerms: 4, // ENHANCED: Allow max 4 terms but with smart selection
    maxPreSelectedTerms: 4, // NEW: Maximum terms that can be pre-selected
    preferredOrder: ["artist", "brand", "objectType", "model", "material"],
    joinWith: " ", // Space-separated terms
    
    // NEW: Smart pre-selection strategy
    preSelectionStrategy: {
      brandAlwaysSelected: true, // Brand terms always get pre-selected if found
      maxCoreTerms: 2, // Maximum core terms (brand/artist) to pre-select
      maxSecondaryTerms: 2, // Maximum secondary terms (object/model) to pre-select
      restAsCandidate: true, // Put remaining terms as unselected candidates
      reasoning: "Avoid overly narrow searches by limiting pre-selection"
    },
    
    // NEW: Artist name handling rules
    artistNameHandling: {
      treatAsOneWord: true, // Artist names like "Niels Thorsson" count as ONE search term
      preserveFullName: true, // Don't split artist names into individual words
      reasoning: "Artist names should be treated as atomic search units for better matching"
    },
    
    // Special combinations that work well together
    effectiveCombinations: [
      ["artist", "brand"], // "Niels Thorsson Royal Copenhagen"
      ["brand", "objectType"], // "Royal Copenhagen fat"  
      ["brand", "model"], // "Yamaha DX7"
      ["artist", "objectType"] // "Niels Thorsson fat"
    ],
    
    // NEW: Term selection strategy to avoid overly narrow queries
    selectionStrategy: {
      prioritizeArtist: true, // Always include artist if available
      prioritizeBrand: true, // NEW: Always include brand if available
      avoidRedundancy: true, // Don't include both "Royal Copenhagen" and "Copenhagen" 
      balanceSpecificity: true, // Balance specific terms with broader appeal
      reasoning: "Focus on most important terms to avoid zero results from over-specification"
    }
  },

  // CONTEXT-SPECIFIC RULES
  contextRules: {
    // When artist field is filled, always prioritize it
    artistFieldFilled: {
      rule: "Artist field takes precedence over AI-detected artists",
      implementation: "Use artist field content as primary search term",
      reasoning: "Manual curation beats AI detection"
    },
    
    // Royal Copenhagen specific rules
    royalCopenhagen: {
      rule: "For Royal Copenhagen, artist + product type is optimal",
      implementation: "Combine designer name with object type",
      example: "Niels Thorsson fat or Royal Copenhagen Niels Thorsson"
    },
    
    // Watch specific rules
    watches: {
      rule: "Brand + model is more important than generic 'watch' term",
      implementation: "Prioritize 'Omega Speedmaster' over 'Omega klocka'"
    },
    
    // Synthesizer specific rules  
    synthesizers: {
      rule: "Brand + model number is critical for electronic instruments",
      implementation: "Yamaha DX7 is much more specific than just 'Yamaha synthesizer'"
    }
  }
};

// Helper function to apply rules in search generation
export function applySearchRules(inputData) {
  const { title, description, artist, aiArtist } = inputData;
  
  console.log('🤖 AI RULES: Applying search rules to input data:', inputData);
  
  const extractedTerms = [];
  const reasoning = [];
  
  // RULE 1: Artist field (HIGHEST PRIORITY) - Treat as ONE search word
  if (artist && artist.trim()) {
    // NORMALIZE and FORMAT artist name to match AI search query generation
    const cleanArtist = artist.trim().replace(/,\s*$/, ''); // Remove trailing comma and spaces
    
    // Format artist name for search queries (wrap multi-word names in quotes)
    const words = cleanArtist.split(/\s+/).filter(word => word.length > 0);
    let formattedArtist;
    
    if (words.length > 1) {
      // Multiple words - wrap in quotes to treat as single entity
      formattedArtist = `"${cleanArtist}"`;
      console.log(`👤 AI RULES: "${cleanArtist}" → ${formattedArtist} (multi-word name, quoted for exact matching)`);
    } else {
      // Single word - no quotes needed
      formattedArtist = cleanArtist;
      console.log(`👤 AI RULES: "${cleanArtist}" → ${formattedArtist} (single word, no quotes needed)`);
    }
    
    extractedTerms.push({
      term: formattedArtist,
      type: 'artist',
      priority: AI_SEARCH_RULES.artistField.priority,
      source: 'artist_field',
      reasoning: 'Manual artist field - highest priority',
      isAtomic: true, // NEW: Mark artist names as atomic (counts as 1 term regardless of word count)
      wordCount: 1 // NEW: Always count artist name as 1 search term
    });
    reasoning.push(`Artist field "${formattedArtist}" included as ONE search term (highest priority)`);
    console.log(`🎯 AI RULES: Artist field found - "${formattedArtist}" (priority: 100, atomic: true, formatted)`);
  }
  
  // RULE 1B: AI-detected artist (VERY HIGH PRIORITY) - Treat as ONE search word
  if (aiArtist && aiArtist.trim() && (!artist || artist.trim() !== aiArtist.trim())) {
    // NORMALIZE and FORMAT AI-detected artist name
    const cleanAIArtist = aiArtist.trim().replace(/,\s*$/, ''); // Remove trailing comma and spaces
    
    // Format AI artist name for search queries (wrap multi-word names in quotes)
    const words = cleanAIArtist.split(/\s+/).filter(word => word.length > 0);
    let formattedAIArtist;
    
    if (words.length > 1) {
      // Multiple words - wrap in quotes to treat as single entity
      formattedAIArtist = `"${cleanAIArtist}"`;
      console.log(`🤖 AI RULES: AI detected "${cleanAIArtist}" → ${formattedAIArtist} (multi-word name, quoted for exact matching)`);
    } else {
      // Single word - no quotes needed
      formattedAIArtist = cleanAIArtist;
      console.log(`🤖 AI RULES: AI detected "${cleanAIArtist}" → ${formattedAIArtist} (single word, no quotes needed)`);
    }
    
    extractedTerms.push({
      term: formattedAIArtist,
      type: 'artist',
      priority: 95, // Very high priority, just below manual artist field
      source: 'ai_detected',
      reasoning: 'AI-detected artist from title - very high priority',
      isAtomic: true, // Mark AI artist names as atomic (counts as 1 term regardless of word count)
      wordCount: 1 // Always count AI artist name as 1 search term
    });
    reasoning.push(`AI-detected artist "${formattedAIArtist}" included as ONE search term (very high priority)`);
    console.log(`🎯 AI RULES: AI-detected artist found - "${formattedAIArtist}" (priority: 95, atomic: true, formatted)`);
  }
  
  // RULE 2: Brand recognition (90 priority)
  const brandTerms = [];
  const knownBrands = AI_SEARCH_RULES.brandRecognition.knownBrands;
  for (const brand of knownBrands) {
    if (title.toLowerCase().includes(brand.toLowerCase())) {
      brandTerms.push({
        term: brand,
        type: 'brand',
        priority: AI_SEARCH_RULES.brandRecognition.priority,
        source: 'brand_recognition',
        reasoning: `Brand "${brand}" detected`,
        isAtomic: true
      });
      reasoning.push(`Brand "${brand}" detected in title`);
      console.log(`🏷️ AI RULES: Brand detected - "${brand}" (priority: 90)`);
    }
  }
  extractedTerms.push(...brandTerms);
  
  // RULE 3: Object type specificity (80 priority) - ENHANCED for artist fields
  const objectTypes = ['fat', 'skulptur', 'armbandsur', 'vas', 'skål', 'tallrik', 'keramik', 'porslin'];
  const objectTerms = [];
  for (const objType of objectTypes) {
    if (title.toLowerCase().includes(objType.toLowerCase())) {
      // ARTIST FIELD ENHANCEMENT: Boost priority when artist is present
      const enhancedPriority = artist && artist.trim() ? 
        AI_SEARCH_RULES.objectType.priority + 5 : // Boost to 85 when artist present
        AI_SEARCH_RULES.objectType.priority;
      
      objectTerms.push({
        term: objType.toUpperCase(), // Normalize to uppercase
        type: 'object_type',
        priority: enhancedPriority,
        source: 'object_type_detection',
        reasoning: `Object type "${objType}" detected${artist ? ' (boosted priority due to artist field)' : ''}`,
        isAtomic: true
      });
      reasoning.push(`Object type "${objType}" detected (enhanced priority due to artist field)`);
      console.log(`📦 AI RULES: Object type detected - "${objType}" (priority: ${enhancedPriority})`);
    }
  }
  extractedTerms.push(...objectTerms);
  
  // RULE 4: Model numbers/identifiers (75 priority) - ENHANCED for artist fields  
  const modelPatterns = [
    /dx[0-9]+/i, /speedmaster/i, /musselmalet/i, /blue fluted/i,
    /"([^"]+)"/g, // Quoted model names like "Storseglaren"
  ];
  
  const modelTerms = [];
  for (const pattern of modelPatterns) {
    const matches = title.match(pattern) || description.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const cleanMatch = match.replace(/"/g, ''); // Remove quotes
        if (cleanMatch.length > 2) {
          // ARTIST FIELD ENHANCEMENT: Boost priority when artist is present
          const enhancedPriority = artist && artist.trim() ? 
            AI_SEARCH_RULES.modelNumbers.priority + 5 : // Boost to 80 when artist present
            AI_SEARCH_RULES.modelNumbers.priority;
            
          modelTerms.push({
            term: cleanMatch,
            type: 'model',
            priority: enhancedPriority,
            source: 'model_detection',
            reasoning: `Model identifier "${cleanMatch}" detected${artist ? ' (boosted priority due to artist field)' : ''}`,
            isAtomic: true
          });
          reasoning.push(`Model identifier "${cleanMatch}" detected (enhanced priority due to artist field)`);
          console.log(`🔢 AI RULES: Model detected - "${cleanMatch}" (priority: ${enhancedPriority})`);
        }
      });
    }
  }
  extractedTerms.push(...modelTerms);
  
  // NEW: Smart term selection with enhanced pre-selection strategy
  extractedTerms.sort((a, b) => b.priority - a.priority);
  
  const maxTerms = AI_SEARCH_RULES.queryConstruction.maxTerms;
  const maxPreSelected = AI_SEARCH_RULES.queryConstruction.maxPreSelectedTerms;
  const preSelectionRules = AI_SEARCH_RULES.queryConstruction.preSelectionStrategy;
  
  const selectedTerms = [];
  const preSelectedTerms = [];
  const candidateTerms = [];
  
  let currentTermCount = 0;
  let preSelectedCount = 0;
  let coreTermsSelected = 0;
  let secondaryTermsSelected = 0;
  
  console.log(`🧮 AI RULES: Enhanced selection - max ${maxTerms} total terms, max ${maxPreSelected} pre-selected...`);
  
  for (const termData of extractedTerms) {
    const termWordCount = termData.wordCount || 1;
    const isCoreType = ['artist', 'brand'].includes(termData.type);
    const isSecondaryType = ['object_type', 'model'].includes(termData.type);
    
    // Check if we can add this term to the final selection
    if (currentTermCount + termWordCount <= maxTerms) {
      selectedTerms.push(termData.term);
      currentTermCount += termWordCount;
      
      // Decide if this term should be pre-selected
      let shouldPreSelect = false;
      
      // RULE 1: Brand always gets pre-selected (if under limits)
      if (termData.type === 'brand' && preSelectionRules.brandAlwaysSelected && preSelectedCount < maxPreSelected) {
        shouldPreSelect = true;
        console.log(`🏷️ AI RULES: Brand "${termData.term}" auto-selected (brand priority)`);
      }
      // RULE 2: Artist gets pre-selected if under core limit
      else if (termData.type === 'artist') {
        if (termData.source === 'artist_field') {
          // Artist from artist field ALWAYS gets pre-selected regardless of limits
          shouldPreSelect = true;
          console.log(`👤 AI RULES: Artist "${termData.term}" auto-selected (artist field priority - always included)`);
        } else if (termData.source === 'ai_detected') {
          // AI-detected artists ALSO always get pre-selected (very high priority)
          shouldPreSelect = true;
          console.log(`🤖 AI RULES: AI-detected artist "${termData.term}" auto-selected (AI detection priority - always included)`);
        } else if (coreTermsSelected < preSelectionRules.maxCoreTerms && preSelectedCount < maxPreSelected) {
          // Other artists still follow normal core limits
          shouldPreSelect = true;
          console.log(`👤 AI RULES: Artist "${termData.term}" auto-selected (core priority)`);
        }
      }
      // RULE 3: Secondary terms (object/model) get pre-selected if under secondary limit
      else if (isSecondaryType && secondaryTermsSelected < preSelectionRules.maxSecondaryTerms && preSelectedCount < maxPreSelected) {
        shouldPreSelect = true;
        console.log(`📦 AI RULES: Secondary "${termData.term}" auto-selected (${termData.type})`);
      }
      // RULE 4: Any remaining high-priority terms if under total pre-selection limit
      else if (termData.priority >= 80 && preSelectedCount < maxPreSelected) {
        shouldPreSelect = true;
        console.log(`⭐ AI RULES: High-priority "${termData.term}" auto-selected (priority: ${termData.priority})`);
      }
      
      if (shouldPreSelect) {
        preSelectedTerms.push(termData.term);
        preSelectedCount++;
        
        // 🔧 ARTIST CONSISTENCY FIX: Only count certain artists against core limits
        // Artist field artists and AI-detected artists don't count against limits since they must always be included
        if (isCoreType && !(termData.type === 'artist' && (termData.source === 'artist_field' || termData.source === 'ai_detected'))) {
          coreTermsSelected++;
        }
        if (isSecondaryType) secondaryTermsSelected++;
        
        console.log(`✅ PRE-SELECTED: "${termData.term}" (type: ${termData.type}, pre-selected: ${preSelectedCount}/${maxPreSelected})`);
      } else {
        candidateTerms.push(termData.term);
        console.log(`⚪ CANDIDATE: "${termData.term}" (type: ${termData.type}, available for user selection)`);
      }
      
    } else {
      // Term exceeds total limit - add as candidate only (no word count limit for candidates)
      candidateTerms.push(termData.term);
      console.log(`🔄 CANDIDATE ONLY: "${termData.term}" (exceeds ${maxTerms}-term limit, available for refinement)`);
      reasoning.push(`"${termData.term}" available as candidate (exceeds ${maxTerms}-term selection limit)`);
    }
    
    // Stop adding to selected terms if we've reached the main limit
    if (currentTermCount >= maxTerms) {
      console.log(`🏁 AI RULES: Reached maximum selected term limit (${maxTerms}), adding remaining as candidates only`);
      
      // Add remaining terms as candidates only
      const remainingTerms = extractedTerms.slice(extractedTerms.indexOf(termData) + 1);
      remainingTerms.forEach(remaining => {
        candidateTerms.push(remaining.term);
        console.log(`⚪ REMAINING CANDIDATE: "${remaining.term}" (${remaining.type})`);
      });
      break;
    }
  }
  
  console.log('🤖 AI RULES: ENHANCED SELECTION COMPLETE');
  console.log(`  📌 Pre-selected (${preSelectedCount}/${maxPreSelected}):`, preSelectedTerms);
  console.log(`  ⚪ Candidates (${candidateTerms.length}):`, candidateTerms);
  console.log(`  🎯 Final query (${selectedTerms.length} terms):`, selectedTerms.join(' '));
  console.log(`  🔧 Core terms selected: ${coreTermsSelected}/${preSelectionRules.maxCoreTerms}`);
  console.log(`  📦 Secondary terms selected: ${secondaryTermsSelected}/${preSelectionRules.maxSecondaryTerms}`);
  
  // 🔧 DEBUG: Track artist field specifically
  if (artist && artist.trim()) {
    const artistInPreSelected = preSelectedTerms.find(term => 
      term.toLowerCase().includes(artist.toLowerCase()) || 
      term.replace(/"/g, '').toLowerCase() === artist.toLowerCase()
    );
    const artistInCandidates = candidateTerms.find(term => 
      term.toLowerCase().includes(artist.toLowerCase()) || 
      term.replace(/"/g, '').toLowerCase() === artist.toLowerCase()
    );
    
    console.log(`🔧 ARTIST FIELD DEBUG: "${artist}"`);
    console.log(`   📌 In pre-selected: ${artistInPreSelected ? '✅ ' + artistInPreSelected : '❌ NOT FOUND'}`);
    console.log(`   ⚪ In candidates: ${artistInCandidates ? '✅ ' + artistInCandidates : '❌ NOT FOUND'}`);
    
    if (!artistInPreSelected && !artistInCandidates) {
      console.error(`🚨 CRITICAL: Artist field "${artist}" missing from both pre-selected AND candidates!`);
    }
  }
  
  // Calculate confidence based on quality of selected terms
  let confidence = 0.75; // Base confidence
  const hasArtist = selectedTerms.some(term => 
    extractedTerms.find(t => t.term === term && t.type === 'artist')
  );
  const hasBrand = selectedTerms.some(term => 
    extractedTerms.find(t => t.term === term && t.type === 'brand')
  );
  const hasObjectType = selectedTerms.some(term => 
    extractedTerms.find(t => t.term === term && t.type === 'object_type')
  );
  
  // Boost confidence for high-quality combinations
  if (hasArtist && (hasBrand || hasObjectType)) confidence = 0.95;
  else if (hasArtist) confidence = 0.90;
  else if (hasBrand && hasObjectType) confidence = 0.85;
  else if (selectedTerms.length >= 2) confidence = 0.80;
  
  return {
    searchTerms: preSelectedTerms, // Only pre-selected terms for the actual search query
    allTerms: selectedTerms, // All terms (pre-selected + candidates) for display
    preSelectedTerms: preSelectedTerms, // Terms that should be checked by default
    candidateTerms: candidateTerms, // Terms available as unchecked candidates
    reasoning: reasoning.join('. '),
    confidence: confidence,
    appliedRules: extractedTerms.slice(0, selectedTerms.length).map(t => ({ 
      term: t.term, 
      type: t.type, 
      priority: t.priority,
      wordCount: t.wordCount,
      isPreSelected: preSelectedTerms.includes(t.term)
    })),
    termCount: preSelectedTerms.length, // Count of pre-selected terms only
    totalTerms: selectedTerms.length, // Count of all available terms
    maxTermsAllowed: maxTerms,
    maxPreSelectedAllowed: maxPreSelected,
    selectionStrategy: {
      coreTermsSelected: coreTermsSelected,
      secondaryTermsSelected: secondaryTermsSelected,
      totalPreSelected: preSelectedCount,
      totalCandidates: candidateTerms.length
    }
  };
}

// Export for configuration updates
export function updateRule(ruleCategory, updates) {
  Object.assign(AI_SEARCH_RULES[ruleCategory], updates);
  console.log(`🔧 AI RULES: Updated ${ruleCategory}:`, updates);
}

// Get current rules for debugging
export function getCurrentRules() {
  return AI_SEARCH_RULES;
} 