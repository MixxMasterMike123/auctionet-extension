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
    maxTerms: 4, // Keep queries focused
    preferredOrder: ["artist", "brand", "objectType", "model", "material"],
    joinWith: " ", // Space-separated terms
    
    // Special combinations that work well together
    effectiveCombinations: [
      ["artist", "brand"], // "Niels Thorsson Royal Copenhagen"
      ["brand", "objectType"], // "Royal Copenhagen fat"  
      ["brand", "model"], // "Yamaha DX7"
      ["artist", "objectType"] // "Niels Thorsson fat"
    ]
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
  
  // RULE 1: Artist field (HIGHEST PRIORITY)
  if (artist && artist.trim()) {
    extractedTerms.push({
      term: artist.trim(),
      type: 'artist',
      priority: AI_SEARCH_RULES.artistField.priority,
      source: 'artist_field',
      reasoning: 'Manual artist field - highest priority'
    });
    reasoning.push(`Artist field "${artist}" included (highest priority)`);
    console.log(`🎯 AI RULES: Artist field found - "${artist}" (priority: 100)`);
  }
  
  // RULE 2: Brand recognition in title
  const titleLower = title.toLowerCase();
  for (const brand of AI_SEARCH_RULES.brandRecognition.knownBrands) {
    if (titleLower.includes(brand.toLowerCase())) {
      extractedTerms.push({
        term: brand,
        type: 'brand',
        priority: AI_SEARCH_RULES.brandRecognition.priority,
        source: 'title_brand_detection',
        reasoning: `Known brand detected: ${brand}`
      });
      reasoning.push(`Brand "${brand}" detected in title`);
      console.log(`🏷️ AI RULES: Brand detected - "${brand}" (priority: 90)`);
    }
  }
  
  // RULE 3: Object type detection
  const words = title.toLowerCase().split(/[\s,]+/);
  for (const word of words) {
    if (AI_SEARCH_RULES.objectType.translations[word]) {
      extractedTerms.push({
        term: word,
        type: 'object_type',
        priority: AI_SEARCH_RULES.objectType.priority,
        source: 'title_object_detection',
        reasoning: `Object type: ${word}`
      });
      reasoning.push(`Object type "${word}" identified`);
      console.log(`📦 AI RULES: Object type detected - "${word}" (priority: 80)`);
    }
  }
  
  // RULE 4: Model number detection
  for (const word of words) {
    for (const pattern of AI_SEARCH_RULES.modelNumbers.patterns) {
      if (pattern.test(word)) {
        extractedTerms.push({
          term: word,
          type: 'model',
          priority: AI_SEARCH_RULES.modelNumbers.priority,
          source: 'title_model_detection',
          reasoning: `Model/pattern: ${word}`
        });
        reasoning.push(`Model/pattern "${word}" detected`);
        console.log(`🔢 AI RULES: Model detected - "${word}" (priority: 75)`);
      }
    }
  }
  
  // Sort by priority and select top terms
  extractedTerms.sort((a, b) => b.priority - a.priority);
  const selectedTerms = extractedTerms
    .slice(0, AI_SEARCH_RULES.queryConstruction.maxTerms)
    .map(term => term.term);
  
  console.log('🤖 AI RULES: Final selected terms:', selectedTerms);
  console.log('🤖 AI RULES: Selection reasoning:', reasoning);
  
  return {
    searchTerms: selectedTerms,
    reasoning: reasoning.join('. '),
    confidence: selectedTerms.length >= 2 ? 0.95 : 0.75,
    appliedRules: extractedTerms.map(t => ({ term: t.term, type: t.type, priority: t.priority }))
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