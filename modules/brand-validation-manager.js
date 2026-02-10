// modules/brand-validation-manager.js - AI-Powered Brand Validation
// Detects misspelled brand names and provides corrections

export class BrandValidationManager {
  constructor(apiManager = null) {
    this.apiManager = apiManager;
    this.knownBrands = this.initializeKnownBrands();
    
  }

  // Set API manager for AI-powered validation
  setApiManager(apiManager) {
    this.apiManager = apiManager;
  }

  // Initialize comprehensive brand database
  initializeKnownBrands() {
    return [
      // Swiss Watch Brands
      { name: 'Lemania', variants: ['Lemonia', 'Lemaina', 'Lemenia'], category: 'watches', confidence: 0.95 },
      { name: 'Omega', variants: ['Omaga', 'Omege'], category: 'watches', confidence: 0.95 },
      { name: 'Rolex', variants: ['Rollex', 'Roleex'], category: 'watches', confidence: 0.95 },
      { name: 'Patek Philippe', variants: ['Pateck Philippe', 'Patek Philip'], category: 'watches', confidence: 0.95 },
      { name: 'Vacheron Constantin', variants: ['Vacheron Konstatin'], category: 'watches', confidence: 0.95 },
      
      // Scandinavian Glass/Crystal
      { name: 'Orrefors', variants: ['Orefors', 'Orrefross'], category: 'glass', confidence: 0.90 },
      { name: 'Kosta Boda', variants: ['Kosta', 'Kostaboda'], category: 'glass', confidence: 0.90 },
      { name: 'Iittala', variants: ['Itala', 'Iitala'], category: 'glass', confidence: 0.90 },
      { name: 'Nuutajärvi', variants: ['Nuutajarvi', 'Nutajarvi'], category: 'glass', confidence: 0.85 },
      
      // Scandinavian Ceramics
      { name: 'Gustavsberg', variants: ['Gustavberg', 'Gustavsber'], category: 'ceramics', confidence: 0.90 },
      { name: 'Rörstrand', variants: ['Rorstrand', 'Rörstran'], category: 'ceramics', confidence: 0.90 },
      { name: 'Arabia', variants: ['Arabie', 'Aravia'], category: 'ceramics', confidence: 0.90 },
      { name: 'Royal Copenhagen', variants: ['Royal Kopenhagen', 'Rojal Copenhagen'], category: 'ceramics', confidence: 0.95 },
      { name: 'Bing & Grøndahl', variants: ['Bing Grondahl', 'Bing Gröndahl'], category: 'ceramics', confidence: 0.90 },
      
      // Furniture/Design
      { name: 'Svenskt Tenn', variants: ['Svensk Tenn', 'Svenskttenn'], category: 'furniture', confidence: 0.85 },
      { name: 'Källemo', variants: ['Kallemo', 'Kälemo'], category: 'furniture', confidence: 0.85 },
      { name: 'Lammhults', variants: ['Lamhults', 'Lammmhults'], category: 'furniture', confidence: 0.85 },
      
      // International Luxury
      { name: 'Hermès', variants: ['Hermes', 'Hermés'], category: 'luxury', confidence: 0.95 },
      { name: 'Louis Vuitton', variants: ['Louis Vitton', 'Luis Vuitton'], category: 'luxury', confidence: 0.95 },
      { name: 'Cartier', variants: ['Cartie', 'Cartier'], category: 'luxury', confidence: 0.95 }
    ];
  }

  // Main brand validation method - AI + fuzzy matching
  async validateBrandsInContent(title, description) {
    
    const detectedIssues = [];
    
    // Step 1: Rule-based fuzzy matching
    const fuzzyMatches = this.detectFuzzyBrandMatches(title, description);
    detectedIssues.push(...fuzzyMatches);
    
    // Step 2: AI-powered validation (if API available)
    if (this.apiManager) {
      try {
        const aiValidation = await this.validateBrandsWithAI(title, description);
        if (aiValidation && aiValidation.length > 0) {
          detectedIssues.push(...aiValidation);
        }
      } catch (error) {
      }
    }
    
    // Remove duplicates and sort by confidence
    const uniqueIssues = this.deduplicateIssues(detectedIssues);
    
    return uniqueIssues;
  }

  // Fuzzy matching against known brands
  detectFuzzyBrandMatches(title, description) {
    const content = `${title} ${description}`.toLowerCase();
    const detectedIssues = [];
    
    // Extract potential brand words (2+ characters, not common words)
    const words = content.match(/\b[a-zåäöü]{2,}(?:\s+[a-zåäöü&]{2,}){0,2}\b/gi) || [];
    const stopWords = ['och', 'med', 'för', 'från', 'till', 'som', 'var', 'är', 'den', 'det', 'att', 'på', 'av'];
    
    const brandCandidates = words.filter(word => 
      word.length >= 3 && 
      !stopWords.includes(word.toLowerCase()) &&
      !word.match(/^\d+$/) &&
      !word.match(/^(cm|mm|st|stk)$/i)
    );
    
    for (const candidate of brandCandidates) {
      for (const brand of this.knownBrands) {
        // Check against known misspelling variants
        for (const variant of brand.variants) {
          const similarity = this.calculateStringSimilarity(candidate.toLowerCase(), variant.toLowerCase());
          
          // Only flag as misspelling if similarity is high AND it's not already the correct brand
          if (similarity > 0.8) {
            // Extra check: Don't flag if candidate is already very similar to the correct brand name
            const correctSimilarity = this.calculateStringSimilarity(candidate.toLowerCase(), brand.name.toLowerCase());
            
            // If the candidate is already very similar to the correct brand (>90%), skip it
            if (correctSimilarity > 0.9) {
              continue;
            }
            
            detectedIssues.push({
              originalBrand: candidate,
              suggestedBrand: brand.name,
              confidence: brand.confidence,
              category: brand.category,
              source: 'fuzzy_matching',
              foundIn: content.includes(candidate) ? 'titel eller beskrivning' : 'text',
              similarity: similarity
            });
            break;
          }
        }
      }
    }
    
    return detectedIssues;
  }

  // AI-powered brand validation using Claude
  async validateBrandsWithAI(title, description) {
    if (!this.apiManager || !this.apiManager.analyzeItemData) {

      return [];
    }

    const prompt = `Analysera denna auktionstext och identifiera eventuella felstavade märkesnamn:

TITEL: "${title}"
BESKRIVNING: "${description}"

Leta särskilt efter:
- Klockfabrikat (t.ex. Lemania, Omega, Rolex)
- Glas/kristall märken (t.ex. Orrefors, Iittala, Kosta)
- Keramik märken (t.ex. Gustavsberg, Royal Copenhagen)
- Möbler/design märken (t.ex. Svenskt Tenn, Källemo)

Svara ENDAST med JSON-format:
{
  "issues": [
    {
      "original": "felstavat märke",
      "suggested": "korrekt märke", 
      "confidence": 0.95,
      "reason": "kort förklaring"
    }
  ]
}

Om inga felstavningar hittas, svara: {"issues": []}`;

    try {
      const response = await this.apiManager.analyzeItemData(prompt);
      
      if (response && response.includes('{')) {
        const jsonStart = response.indexOf('{');
        const jsonStr = response.substring(jsonStart);
        const aiResult = JSON.parse(jsonStr);
        
        if (aiResult.issues && Array.isArray(aiResult.issues)) {
          return aiResult.issues.map(issue => ({
            originalBrand: issue.original,
            suggestedBrand: issue.suggested,
            confidence: issue.confidence || 0.8,
            category: this.inferCategory(issue.suggested),
            source: 'ai_detection',
            foundIn: 'analys',
            reason: issue.reason
          }));
        }
      }
    } catch (error) {
    }
    
    return [];
  }

  // Remove duplicate issues and merge similar ones
  deduplicateIssues(issues) {
    const unique = [];
    
    for (const issue of issues) {
      const existing = unique.find(u => 
        u.originalBrand.toLowerCase() === issue.originalBrand.toLowerCase() ||
        u.suggestedBrand.toLowerCase() === issue.suggestedBrand.toLowerCase()
      );
      
      if (!existing) {
        unique.push(issue);
      } else if (issue.confidence > existing.confidence) {
        // Replace with higher confidence version
        Object.assign(existing, issue);
      }
    }
    
    // Sort by confidence descending
    return unique.sort((a, b) => b.confidence - a.confidence);
  }

  // Calculate string similarity (Levenshtein-based)
  calculateStringSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  // Levenshtein distance calculation
  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  // Infer brand category from name
  inferCategory(brandName) {
    const name = brandName.toLowerCase();
    
    if (['lemania', 'omega', 'rolex', 'patek'].some(w => name.includes(w))) return 'watches';
    if (['orrefors', 'iittala', 'kosta'].some(w => name.includes(w))) return 'glass';
    if (['gustavsberg', 'royal copenhagen', 'arabia'].some(w => name.includes(w))) return 'ceramics';
    if (['svenskt tenn', 'källemo'].some(w => name.includes(w))) return 'furniture';
    
    return 'unknown';
  }

  // Generate user-friendly warning message for brand issues
  generateBrandWarning(issue) {
    const categoryMap = {
      watches: 'klockfabrikat',
      glass: 'glasmärke',
      ceramics: 'keramikmärke',
      furniture: 'möbelmärke',
      luxury: 'lyxmärke',
      unknown: 'märke'
    };
    
    const categoryText = categoryMap[issue.category] || 'märke';
    const confidencePercent = Math.round(issue.confidence * 100);
    
    return {
      field: 'Titel',
      issue: `Möjligt stavfel: "${issue.originalBrand}" → föreslår "<strong class="clickable-brand" data-original="${issue.originalBrand}" data-suggested="${issue.suggestedBrand}" style="color: #1976d2; cursor: pointer; text-decoration: underline; font-weight: 600;" title="Klicka för att rätta till ${issue.suggestedBrand}">${issue.suggestedBrand}</strong>" (${confidencePercent}% säkerhet, ${categoryText})`,
      severity: 'medium',
      isBrandWarning: true,
      originalBrand: issue.originalBrand,
      suggestedBrand: issue.suggestedBrand,
      confidence: issue.confidence,
      category: issue.category
    };
  }

  // Debug information
  debug() {
  }
} 