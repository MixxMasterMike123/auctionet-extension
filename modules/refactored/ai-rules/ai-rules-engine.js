/**
 * AI Rules Engine - 100% Reusable Component
 * 
 * Refactored from modules/ai-search-rules.js to be a clean, reusable component
 * that handles all AI-powered search term extraction and rule application.
 * 
 * Features:
 * - Configurable rule system for different contexts
 * - AI-powered intelligent term extraction
 * - Fallback mechanisms for reliability
 * - Caching for performance
 * - Swedish auction market expertise
 * 
 * @author Refactored from existing codebase
 * @version 2.0.0
 */

export class AIRulesEngine {
  constructor(apiManager = null) {
    this.apiManager = apiManager;
    this.cache = new Map();
    this.cacheExpiry = 30 * 60 * 1000; // 30 minutes
    
    // Load the rule configuration
    this.rules = this.loadRuleConfiguration();
    
    // Statistics tracking
    this.stats = {
      rulesApplied: 0,
      aiCallsMade: 0,
      cacheHits: 0,
      cacheMisses: 0,
      fallbacksUsed: 0
    };
  }

  /**
   * Main method: Apply AI rules to extract search terms
   * @param {Object} inputData - Input data for term extraction
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Extracted terms and metadata
   */
  async applyRules(inputData, options = {}) {
    const startTime = Date.now();
    
    try {
      this.stats.rulesApplied++;
      
      // Validate input
      if (!this.validateInput(inputData)) {
        throw new Error('Invalid input data for AI rules');
      }
      
      // Check cache first
      const cacheKey = this.generateCacheKey(inputData, options);
      const cached = this.getCachedResult(cacheKey);
      if (cached && !options.skipCache) {
        this.stats.cacheHits++;
        return cached;
      }
      
      this.stats.cacheMisses++;
      
      // Apply AI-powered term extraction
      const result = await this.extractTermsWithAI(inputData, options);
      
      // Enhance with rule-based validation
      const enhancedResult = this.enhanceWithRules(result, inputData);
      
      // Add metadata
      const finalResult = {
        ...enhancedResult,
        metadata: {
          processingTime: Date.now() - startTime,
          cacheKey,
          timestamp: new Date().toISOString(),
          rulesVersion: '2.0.0'
        }
      };
      
      // Cache the result
      this.setCachedResult(cacheKey, finalResult);
      
      return finalResult;
      
    } catch (error) {
      console.error('AI Rules Engine error:', error);
      
      // Fallback to basic extraction
      this.stats.fallbacksUsed++;
      return this.generateFallbackResult(inputData, error);
    }
  }

  /**
   * Extract terms using AI with intelligent rule application
   * @private
   */
  async extractTermsWithAI(inputData, options = {}) {
    const { title, description, artist, aiArtist, excludeArtist } = inputData;
    
    // Check if AI is available
    if (!this.apiManager || typeof this.apiManager.generateAISearchTerms !== 'function') {
      console.log('⚠️ AI Rules: AI not available, using rule-based extraction');
      return this.extractTermsWithRules(inputData);
    }
    
    try {
      this.stats.aiCallsMade++;
      
      // Build AI prompt with rule context
      const prompt = this.buildAIPrompt(inputData);
      
      // Call AI for term extraction
      const aiResponse = await this.apiManager.generateAISearchTerms(prompt);
      
      if (aiResponse && aiResponse.success) {
        return this.parseAIResponse(aiResponse, inputData);
      } else {
        throw new Error('AI term extraction failed');
      }
      
    } catch (error) {
      console.warn('AI term extraction failed, falling back to rules:', error);
      return this.extractTermsWithRules(inputData);
    }
  }

  /**
   * Extract terms using rule-based logic (fallback)
   * @private
   */
  extractTermsWithRules(inputData) {
    const { title, description, artist, aiArtist, excludeArtist } = inputData;
    
    const extractedTerms = [];
    const candidateTerms = [];
    const appliedRules = [];
    
    // Rule 1: Artist field priority (highest priority)
    if (artist && artist.trim()) {
      const formattedArtist = this.formatArtistName(artist);
      extractedTerms.push(formattedArtist);
      appliedRules.push('artist_field_priority');
    } else if (aiArtist && aiArtist.trim() && aiArtist !== excludeArtist) {
      const formattedArtist = this.formatArtistName(aiArtist);
      extractedTerms.push(formattedArtist);
      appliedRules.push('ai_artist_detection');
    }
    
    // Rule 2: Brand recognition
    const brands = this.extractBrands(title, description);
    brands.forEach(brand => {
      if (!extractedTerms.includes(brand)) {
        extractedTerms.push(brand);
        appliedRules.push('brand_recognition');
      }
    });
    
    // Rule 3: Object type extraction
    const objectTypes = this.extractObjectTypes(title, description);
    objectTypes.forEach(type => {
      if (extractedTerms.length < this.rules.queryConstruction.maxPreSelectedTerms) {
        extractedTerms.push(type);
        appliedRules.push('object_type_extraction');
      } else {
        candidateTerms.push(type);
      }
    });
    
    // Rule 4: Model numbers and identifiers
    const models = this.extractModelNumbers(title, description);
    models.forEach(model => {
      if (extractedTerms.length < this.rules.queryConstruction.maxPreSelectedTerms) {
        extractedTerms.push(model);
        appliedRules.push('model_number_extraction');
      } else {
        candidateTerms.push(model);
      }
    });
    
    // Rule 5: Materials (for candidates)
    const materials = this.extractMaterials(title, description);
    materials.forEach(material => candidateTerms.push(material));
    
    return {
      success: true,
      searchTerms: extractedTerms.slice(0, this.rules.queryConstruction.maxPreSelectedTerms),
      preSelectedTerms: extractedTerms.slice(0, this.rules.queryConstruction.maxPreSelectedTerms),
      candidateTerms: candidateTerms,
      allTerms: [...extractedTerms, ...candidateTerms],
      query: extractedTerms.slice(0, this.rules.queryConstruction.maxPreSelectedTerms).join(' '),
      reasoning: `Applied rules: ${appliedRules.join(', ')}`,
      confidence: this.calculateConfidence(extractedTerms, appliedRules),
      source: 'rules_based',
      appliedRules,
      totalTerms: extractedTerms.length + candidateTerms.length
    };
  }

  /**
   * Build AI prompt with rule context
   * @private
   */
  buildAIPrompt(inputData) {
    const { title, description, artist, aiArtist, excludeArtist } = inputData;
    
    let prompt = `Analyze this Swedish auction item and extract meaningful search terms for market analysis.

ITEM DATA:
Title: "${title}"
Description: "${description || 'No description'}"
Artist Field: "${artist || 'Empty'}"
AI-Detected Artist: "${aiArtist || 'None detected'}"`;

    if (excludeArtist && excludeArtist.trim()) {
      prompt += `

CRITICAL EXCLUSION: Do NOT include "${excludeArtist}" in any search terms - this artist was marked as incorrectly detected.`;
    }

    prompt += `

EXTRACTION RULES:
1. ARTIST FIELD PRIORITY: If artist field is filled, it MUST be included (highest priority)
2. QUOTE WRAPPING: Multi-word artist names MUST be wrapped in quotes for exact matching
   - Examples: "Niels Thorsson", "Lisa Larson", "Håkan Berg"
   - Single names can remain unquoted: Picasso
3. BRAND RECOGNITION: Include known brands (Royal Copenhagen, Yamaha, Omega, etc.)
4. OBJECT TYPES: Include specific object types (fat, armbandsur, synthesizer, etc.)
5. MODEL NUMBERS: Include model numbers or pattern names when found
6. MATERIALS: Include luxury materials (guld, silver, etc.)

KNOWN BRANDS: ${this.rules.brandRecognition.knownBrands.join(', ')}

Extract 8-12 search terms and categorize each as:
- artist: Person who created the item
- brand: Company or manufacturer name
- object: Type of object (fat, stol, armbandsur, etc.)
- model: Model number or pattern name
- material: Material type
- other: Other relevant terms

Return JSON format:
{
  "searchTerms": ["term1", "term2", "term3"],
  "allTerms": ["all", "extracted", "terms", "including", "candidates"],
  "preSelectedTerms": ["terms", "for", "initial", "search"],
  "candidateTerms": ["additional", "candidate", "terms"],
  "reasoning": "explanation of term selection and rule application",
  "confidence": 0.95,
  "appliedRules": ["rule1", "rule2"]
}`;

    return prompt;
  }

  /**
   * Parse AI response and validate against rules
   * @private
   */
  parseAIResponse(aiResponse, inputData) {
    try {
      // Validate AI response structure
      if (!aiResponse.searchTerms || !Array.isArray(aiResponse.searchTerms)) {
        throw new Error('Invalid AI response structure');
      }
      
      // Apply rule validation to AI results
      const validatedTerms = this.validateTermsAgainstRules(aiResponse.searchTerms, inputData);
      
      return {
        success: true,
        searchTerms: validatedTerms.preSelected,
        preSelectedTerms: validatedTerms.preSelected,
        candidateTerms: validatedTerms.candidates,
        allTerms: [...validatedTerms.preSelected, ...validatedTerms.candidates],
        query: validatedTerms.preSelected.join(' '),
        reasoning: aiResponse.reasoning || 'AI-generated terms with rule validation',
        confidence: aiResponse.confidence || 0.8,
        source: 'ai_with_rules',
        appliedRules: aiResponse.appliedRules || ['ai_extraction'],
        totalTerms: validatedTerms.preSelected.length + validatedTerms.candidates.length
      };
      
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      throw error;
    }
  }

  /**
   * Enhance results with additional rule-based validation
   * @private
   */
  enhanceWithRules(result, inputData) {
    // Ensure artist field is respected
    if (inputData.artist && inputData.artist.trim()) {
      const formattedArtist = this.formatArtistName(inputData.artist);
      if (!result.searchTerms.some(term => term.toLowerCase().includes(inputData.artist.toLowerCase()))) {
        result.searchTerms.unshift(formattedArtist);
        result.preSelectedTerms.unshift(formattedArtist);
        result.allTerms.unshift(formattedArtist);
        result.reasoning += ' (Enhanced: Added missing artist field)';
      }
    }
    
    // Ensure reasonable term limits
    if (result.searchTerms.length > this.rules.queryConstruction.maxPreSelectedTerms) {
      const excess = result.searchTerms.splice(this.rules.queryConstruction.maxPreSelectedTerms);
      result.candidateTerms.unshift(...excess);
    }
    
    // Update query
    result.query = result.searchTerms.join(' ');
    
    return result;
  }

  /**
   * Load rule configuration (extracted from original ai-search-rules.js)
   * @private
   */
  loadRuleConfiguration() {
    return {
      artistField: {
        priority: 100,
        rule: "ALWAYS include artist field content when filled",
        implementation: "If artist field has content, it MUST be included in search query"
      },
      
      brandRecognition: {
        priority: 90,
        rule: "Prioritize known luxury and design brands",
        knownBrands: [
          "Dux", "Källemo", "Lammhults", "Norrlands", "Svenskt Tenn", "Ikea",
          "Royal Copenhagen", "Copenhagen", "Bing & Grøndahl", "Arabia", "Rörstrand", "Gustavsberg",
          "Omega", "Rolex", "Breitling", "TAG Heuer", "Seiko", "Citizen",
          "Yamaha", "Roland", "Korg", "Moog", "Sequential", "Oberheim",
          "Orrefors", "Kosta Boda", "Målerås", "Bergdala"
        ]
      },
      
      objectType: {
        priority: 80,
        rule: "Include specific object type for targeted results",
        translations: {
          "sängbord": "sängbord", "nattduksbord": "nattduksbord", "bord": "bord", "stol": "stol",
          "fåtölj": "fåtölj", "soffa": "soffa", "skrivbord": "skrivbord", "byrå": "byrå",
          "skåp": "skåp", "hylla": "hylla", "lampa": "lampa", "ljuskrona": "ljuskrona",
          "armbandsur": "armbandsur", "fickur": "fickur", "klocka": "klocka",
          "fat": "fat", "skål": "skål", "vas": "vas", "tallrik": "tallrik", "kopp": "kopp",
          "synthesizer": "synthesizer", "piano": "piano", "flygel": "flygel",
          "skulptur": "skulptur", "målning": "målning", "lithografi": "lithografi", "etsning": "etsning"
        }
      },
      
      modelNumbers: {
        priority: 75,
        rule: "Include model numbers, pattern names, and specific identifiers",
        patterns: [
          /^[A-Z]{1,4}\d{1,4}[A-Z]*$/i,
          /musselmalet/i,
          /flora danica/i,
          /blue fluted/i,
          /speedmaster/i,
          /seamaster/i
        ]
      },
      
      materials: {
        priority: 50,
        rule: "Include materials for luxury items or when characteristic",
        luxuryMaterials: ["guld", "gold", "platina", "platinum", "silver", "ädel"],
        commonMaterials: ["stengods", "porslin", "glas", "keramik"]
      },
      
      queryConstruction: {
        maxTerms: 12,
        maxPreSelectedTerms: 3,
        preferredOrder: ["artist", "brand", "objectType", "model", "material"],
        joinWith: " ",
        
        preSelectionStrategy: {
          brandAlwaysSelected: true,
          maxCoreTerms: 2,
          maxSecondaryTerms: 1,
          minCandidateTerms: 5,
          targetTotalTerms: 8,
          allowHighPriorityOverride: false
        },
        
        artistNameHandling: {
          treatAsOneWord: true,
          preserveFullName: true,
          reasoning: "Artist names should be treated as atomic search units"
        }
      }
    };
  }

  /**
   * Helper methods for term extraction
   */
  
  formatArtistName(artistName) {
    if (!artistName || typeof artistName !== 'string') {
      return artistName;
    }
    
    const cleanArtist = artistName.trim().replace(/^["']|["']$/g, '');
    const words = cleanArtist.split(/\s+/).filter(word => word.length > 0);
    
    if (words.length > 1) {
      return `"${cleanArtist}"`;
    }
    
    return cleanArtist;
  }
  
  extractBrands(title, description) {
    const text = `${title} ${description}`.toLowerCase();
    const foundBrands = [];
    
    this.rules.brandRecognition.knownBrands.forEach(brand => {
      if (text.includes(brand.toLowerCase())) {
        foundBrands.push(brand);
      }
    });
    
    return foundBrands;
  }
  
  extractObjectTypes(title, description) {
    const text = `${title} ${description}`.toLowerCase();
    const foundTypes = [];
    
    Object.entries(this.rules.objectType.translations).forEach(([key, value]) => {
      if (text.includes(key.toLowerCase())) {
        foundTypes.push(value);
      }
    });
    
    return foundTypes;
  }
  
  extractModelNumbers(title, description) {
    const text = `${title} ${description}`;
    const foundModels = [];
    
    this.rules.modelNumbers.patterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        foundModels.push(...matches);
      }
    });
    
    return foundModels;
  }
  
  extractMaterials(title, description) {
    const text = `${title} ${description}`.toLowerCase();
    const foundMaterials = [];
    
    [...this.rules.materials.luxuryMaterials, ...this.rules.materials.commonMaterials].forEach(material => {
      if (text.includes(material.toLowerCase())) {
        foundMaterials.push(material);
      }
    });
    
    return foundMaterials;
  }
  
  validateTermsAgainstRules(terms, inputData) {
    const preSelected = [];
    const candidates = [];
    
    terms.forEach(term => {
      if (preSelected.length < this.rules.queryConstruction.maxPreSelectedTerms) {
        preSelected.push(term);
      } else {
        candidates.push(term);
      }
    });
    
    return { preSelected, candidates };
  }
  
  calculateConfidence(terms, appliedRules) {
    let confidence = 0.5; // Base confidence
    
    if (appliedRules.includes('artist_field_priority')) confidence += 0.3;
    if (appliedRules.includes('brand_recognition')) confidence += 0.2;
    if (appliedRules.includes('object_type_extraction')) confidence += 0.1;
    if (appliedRules.includes('model_number_extraction')) confidence += 0.1;
    
    return Math.min(confidence, 0.95);
  }
  
  /**
   * Utility methods
   */
  
  validateInput(inputData) {
    return inputData && typeof inputData === 'object' && inputData.title;
  }
  
  generateCacheKey(inputData, options) {
    const key = `${inputData.title}_${inputData.artist || ''}_${inputData.description || ''}`;
    return key.substring(0, 200).replace(/[^\w\s-]/g, '');
  }
  
  getCachedResult(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }
    this.cache.delete(key);
    return null;
  }
  
  setCachedResult(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
  
  generateFallbackResult(inputData, error) {
    const basicTerms = inputData.title.split(' ').slice(0, 3);
    
    return {
      success: true,
      searchTerms: basicTerms,
      preSelectedTerms: basicTerms,
      candidateTerms: [],
      allTerms: basicTerms,
      query: basicTerms.join(' '),
      reasoning: `Fallback extraction due to error: ${error.message}`,
      confidence: 0.3,
      source: 'fallback',
      appliedRules: ['fallback'],
      totalTerms: basicTerms.length,
      error: error.message
    };
  }
  
  /**
   * Public API methods
   */
  
  getStatistics() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      cacheHitRate: this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses) || 0
    };
  }
  
  clearCache() {
    this.cache.clear();
  }
  
  updateRules(ruleCategory, updates) {
    if (this.rules[ruleCategory]) {
      this.rules[ruleCategory] = { ...this.rules[ruleCategory], ...updates };
      this.clearCache(); // Clear cache when rules change
    }
  }
  
  getRules() {
    return this.rules;
  }
}

export default AIRulesEngine; 