// modules/ai-search-rules.js - AI Search Query Generation Rules
// 
// ⚠️  DEPRECATED: This file has been refactored into a modular system
// 🔄 NEW LOCATION: modules/refactored/ai-rules/
// 📖 MIGRATION: Use modules/refactored/ai-rules/ai-rules-wrapper.js for backward compatibility
// 
// This file is kept for reference but should not be used in new code.
// All functionality has been moved to the new AIRulesEngine system.
//
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
    rule: "Prioritize known luxury and design brands",
    knownBrands: [
      // Design furniture brands
      "Dux", "Källemo", "Lammhults", "Norrlands", "Svenskt Tenn", "Ikea",
      // Royal Copenhagen and ceramics
      "Royal Copenhagen", "Copenhagen", "Bing & Grøndahl", "Arabia", "Rörstrand", "Gustavsberg",
      // Watch brands
      "Omega", "Rolex", "Breitling", "TAG Heuer", "Seiko", "Citizen",
      // Electronics
      "Yamaha", "Roland", "Korg", "Moog", "Sequential", "Oberheim",
      // Art and glassworks
      "Orrefors", "Kosta Boda", "Målerås", "Bergdala"
    ],
    implementation: "Scan title and description for known luxury brands"
  },

  // RULE 3: Object type specificity
  objectType: {
    priority: 80,
    rule: "Include specific object type for targeted results",
    translations: {
      // Furniture types
      "sängbord": "sängbord", "nattduksbord": "nattduksbord", "bord": "bord", "stol": "stol", 
      "fåtölj": "fåtölj", "soffa": "soffa", "skrivbord": "skrivbord", "byrå": "byrå",
      "skåp": "skåp", "hylla": "hylla", "lampa": "lampa", "ljuskrona": "ljuskrona",
      // Traditional categories  
      "armbandsur": "armbandsur", "fickur": "fickur", "klocka": "klocka",
      "fat": "fat", "skål": "skål", "vas": "vas", "tallrik": "tallrik", "kopp": "kopp",
      // Electronics
      "synthesizer": "synthesizer", "piano": "piano", "flygel": "flygel",
      // Art objects
      "skulptur": "skulptur", "målning": "målning", "lithografi": "lithografi", "etsning": "etsning"
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
    maxTerms: 12, // ENHANCED: Allow max 12 terms for rich candidate selection (was 4)
    maxPreSelectedTerms: 3, // Keep pre-selected terms conservative for clean initial search
    preferredOrder: ["artist", "brand", "objectType", "model", "material"],
    joinWith: " ", // Space-separated terms
    
    // NEW: Smart pre-selection strategy (BALANCED FOR SCANDINAVIAN DESIGN)
    preSelectionStrategy: {
      brandAlwaysSelected: true, // Brand terms always get pre-selected if found
      maxCoreTerms: 2, // Maximum core terms (brand/artist) to pre-select
      maxSecondaryTerms: 1, // RESTORED: Allow 1 secondary term to be pre-selected (for premium terms like "Manilla")
      minCandidateTerms: 5, // ENHANCED: Ensure minimum 5 candidate terms for rich selection
      targetTotalTerms: 8, // TARGET: Aim for 8+ total terms for optimal user experience
      allowHighPriorityOverride: false // Conservative: don't auto-select based on priority alone
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
  const { title, description, artist, aiArtist, excludeArtist } = inputData;
  
  console.log('🤖 AI RULES: Starting AI-powered term extraction for:', inputData);
  if (excludeArtist) {
    console.log('🚫 AI RULES: Will exclude ignored artist:', excludeArtist);
  }
  
  // Check if we have AI capability for intelligent term extraction
  if (window.apiManager && typeof window.apiManager.generateAISearchTerms === 'function') {
    console.log('🧠 AI RULES: Using AI-powered intelligent term extraction...');
    return generateAISearchTerms(inputData);
  }
  
  // Fallback to basic extraction if AI not available
  console.log('⚠️ AI RULES: AI not available, using basic extraction fallback...');
  return generateBasicSearchTerms(inputData);
}

// NEW: AI-Powered intelligent term extraction
async function generateAISearchTerms(inputData) {
  const { title, description, artist, aiArtist, excludeArtist } = inputData;
  
      try {
      // Prepare prompt for AI term extraction
      let prompt = `
Analyze this auction item and extract meaningful search terms for market analysis.

Title: "${title}"
Description: "${description || 'No description'}"
Artist Field: "${artist || 'Empty'}"
AI-Detected Artist: "${aiArtist || 'None detected'}"`;

      // Add exclusion instruction if needed
      if (excludeArtist && excludeArtist.trim()) {
        prompt += `

CRITICAL EXCLUSION: Do NOT include "${excludeArtist}" in any search terms - this artist was marked as incorrectly detected (false positive).`;
      }

      prompt += `

Extract 8-12 search terms and categorize each as:
- artist: Person who created the item
- brand: Manufacturer or design house  
- object: What type of item this is
- model: Specific model/pattern name
- descriptive: Other valuable search terms

Determine which 2-3 terms should be PRE-SELECTED (most important for initial search) and which should be CANDIDATES (for user refinement).

ABSOLUTE RULE - HIGHEST PRIORITY:
- Artist field content MUST ALWAYS be pre-selected if present
- AI-detected artist MUST ALWAYS be pre-selected if found
- Artists have absolute priority over everything else (brands, models, objects)

Other Rules:
2. Premium brands/models often pre-selected  
3. Aim for 2-3 pre-selected, 5+ candidates
4. Focus on terms that help find comparable sales

Return JSON format:
{
  "terms": [
    {"term": "exact_term", "category": "artist|brand|object|model|descriptive", "preSelected": true|false, "reasoning": "why this term matters"}
  ]
}`;

    const aiResult = await window.apiManager.generateAISearchTerms(prompt);
    
    if (aiResult && aiResult.terms && Array.isArray(aiResult.terms)) {
      console.log('✅ AI RULES: AI successfully extracted', aiResult.terms.length, 'terms');
      
      // NEW: FORCE quote wrapping for artist names before processing
      aiResult.terms.forEach(term => {
        if (term.category === 'artist' && typeof term.term === 'string') {
          term.term = forceQuoteWrapArtist(term.term);
          console.log(`🎯 AI RULES: Force-wrapped artist term: "${term.term}"`);
        }
      });
      
      // CRITICAL: Ensure any artist terms (from field or AI-detected) are ALWAYS pre-selected
      aiResult.terms.forEach(term => {
        if (term.category === 'artist') {
          term.preSelected = true;
          console.log(`🎯 PRIORITY OVERRIDE: Artist "${term.term}" forced to pre-selected (absolute priority rule)`);
        }
      });
      
      const preSelectedTerms = aiResult.terms.filter(t => t.preSelected).map(t => t.term);
      const candidateTerms = aiResult.terms.filter(t => !t.preSelected).map(t => t.term);
      const allTerms = aiResult.terms.map(t => t.term);
      
      console.log('🎯 AI RULES: AI-POWERED EXTRACTION COMPLETE');
      console.log(`  📌 Pre-selected (${preSelectedTerms.length}):`, preSelectedTerms);
      console.log(`  ⚪ Candidates (${candidateTerms.length}):`, candidateTerms);
      console.log(`  🎯 Total terms: ${allTerms.length}`);
      
      return {
        searchTerms: preSelectedTerms,
        allTerms: allTerms,
        preSelectedTerms: preSelectedTerms,
        candidateTerms: candidateTerms,
        reasoning: 'AI-powered intelligent term extraction',
        confidence: 0.9,
        appliedRules: aiResult.terms.map(t => ({
          term: t.term,
          type: t.category,
          priority: t.category === 'artist' ? 100 : (t.preSelected ? 90 : 70), // Artists always get priority 100
          isPreSelected: t.preSelected,
          reasoning: t.reasoning
        })),
        termCount: preSelectedTerms.length,
        totalTerms: allTerms.length,
        maxTermsAllowed: 12,
        maxPreSelectedAllowed: 3,
        selectionStrategy: {
          coreTermsSelected: preSelectedTerms.filter(t => 
            aiResult.terms.find(ai => ai.term === t && ['artist', 'brand'].includes(ai.category))
          ).length,
          secondaryTermsSelected: preSelectedTerms.filter(t => 
            aiResult.terms.find(ai => ai.term === t && ['object', 'model'].includes(ai.category))
          ).length,
          totalPreSelected: preSelectedTerms.length,
          totalCandidates: candidateTerms.length
        }
      };
    }
  } catch (error) {
    console.error('❌ AI RULES: AI term extraction failed:', error);
  }
  
  // Fallback to basic extraction
  return generateBasicSearchTerms(inputData);
}

// Fallback: Basic term extraction (simplified version of old rules)
function generateBasicSearchTerms(inputData) {
  const { title, description, artist, aiArtist } = inputData;
  
  const extractedTerms = [];
  const reasoning = [];
  
  // ABSOLUTE PRIORITY: Always include artist field if present
  if (artist && artist.trim()) {
    const formattedArtist = artist.trim().includes(' ') ? `"${artist.trim()}"` : artist.trim();
    extractedTerms.push({
      term: formattedArtist,
      type: 'artist',
      priority: 100,
      source: 'artist_field',
      isPreSelected: true
    });
    console.log(`👤 AI RULES: Artist field found - "${formattedArtist}" (auto-selected - absolute priority)`);
  }
  
  // ABSOLUTE PRIORITY: Always include AI-detected artist if present and different from field
  if (aiArtist && aiArtist.trim() && aiArtist.trim() !== artist) {
    const formattedAiArtist = aiArtist.trim().includes(' ') ? `"${aiArtist.trim()}"` : aiArtist.trim();
    extractedTerms.push({
      term: formattedAiArtist,
      type: 'artist',
      priority: 100,
      source: 'ai_detected',
      isPreSelected: true
    });
    console.log(`🤖 AI RULES: AI-detected artist found - "${formattedAiArtist}" (auto-selected - absolute priority)`);
  }
  
  // Basic brand detection for common cases
  const commonBrands = ['Dux', 'Royal Copenhagen', 'Omega', 'Yamaha', 'Orrefors'];
  for (const brand of commonBrands) {
    if (title.toLowerCase().includes(brand.toLowerCase())) {
      extractedTerms.push({
        term: brand,
        type: 'brand', 
        priority: 90,
        source: 'brand_detection',
        isPreSelected: extractedTerms.filter(t => t.isPreSelected).length < 2
      });
      console.log(`🏷️ AI RULES: Brand detected - "${brand}"`);
    }
  }
  
  // Extract quoted model names
  const quotedModels = title.match(/"([^"]+)"/g);
  if (quotedModels) {
    quotedModels.forEach(match => {
      const cleanMatch = match.replace(/"/g, '');
      if (cleanMatch.length > 2) {
        extractedTerms.push({
          term: cleanMatch,
          type: 'model',
          priority: 80,
          source: 'quoted_model',
          isPreSelected: extractedTerms.filter(t => t.isPreSelected).length < 3
        });
        console.log(`🔢 AI RULES: Model detected - "${cleanMatch}"`);
      }
    });
  }
  
  // Extract descriptive terms to reach target
  const titleWords = title.split(/[\s.,]+/).filter(word => 
    word.length >= 3 &&
    !extractedTerms.some(t => t.term.toLowerCase().includes(word.toLowerCase())) &&
    !/^\d+$/.test(word)
  );
  
  for (let i = 0; i < Math.min(titleWords.length, 8 - extractedTerms.length); i++) {
    extractedTerms.push({
      term: titleWords[i],
      type: 'descriptive',
      priority: 60 - i,
      source: 'title_extraction',
      isPreSelected: false
    });
    console.log(`📝 AI RULES: Descriptive term - "${titleWords[i]}"`);
  }
  
  const preSelectedTerms = extractedTerms.filter(t => t.isPreSelected).map(t => t.term);
  const candidateTerms = extractedTerms.filter(t => !t.isPreSelected).map(t => t.term);
  const allTerms = extractedTerms.map(t => t.term);
  
  console.log('🔧 AI RULES: BASIC EXTRACTION COMPLETE');
  console.log(`  📌 Pre-selected (${preSelectedTerms.length}):`, preSelectedTerms);
  console.log(`  ⚪ Candidates (${candidateTerms.length}):`, candidateTerms);
  
  return {
    searchTerms: preSelectedTerms,
    allTerms: allTerms,
    preSelectedTerms: preSelectedTerms,
    candidateTerms: candidateTerms,
    reasoning: 'Basic rule-based extraction (AI fallback)',
    confidence: 0.7,
    appliedRules: extractedTerms.map(t => ({
      term: t.term,
      type: t.type,
      priority: t.priority,
      isPreSelected: t.isPreSelected
    })),
    termCount: preSelectedTerms.length,
    totalTerms: allTerms.length,
    maxTermsAllowed: 12,
    maxPreSelectedAllowed: 3,
    selectionStrategy: {
      totalPreSelected: preSelectedTerms.length,
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

// NEW: Force quote wrapping for artist names
function forceQuoteWrapArtist(term) {
  if (!term || typeof term !== 'string') return term;
  
  // Remove any existing quotes first
  const cleanTerm = term.replace(/^["']|["']$/g, '').trim();
  
  // Split into words
  const words = cleanTerm.split(/\s+/).filter(word => word.length > 0);
  
  if (words.length > 1) {
    // Multi-word: Always wrap in quotes
    const quotedTerm = `"${cleanTerm}"`;
    console.log(`🎯 AI RULES QUOTE WRAP: "${term}" → ${quotedTerm} (multi-word artist name)`);
    return quotedTerm;
  }
  
  // Single word: return as-is
  return cleanTerm;
} 