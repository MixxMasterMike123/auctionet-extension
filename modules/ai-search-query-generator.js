// modules/ai-search-query-generator.js - AI-Only Search Query Generation
// The ONLY source for search query decisions - pure AI intelligence

export class AISearchQueryGenerator {
  constructor(apiManager) {
    this.apiManager = apiManager;
    this.cache = new Map();
    this.cacheExpiry = 60 * 60 * 1000; // 1 hour cache for AI decisions
  }

  // MAIN METHOD: Generate optimal search query using pure AI
  async generateOptimalSearchQuery(title, description = '') {
    console.log('🤖 AI-ONLY: Starting pure AI search query generation...');
    console.log(`📝 Title: ${title}`);
    console.log(`📄 Description: ${description.substring(0, 100)}...`);

    // Check cache first
    const cacheKey = `${title}_${description}`.substring(0, 200);
    const cached = this.getCachedResult(cacheKey);
    if (cached) {
      console.log('📦 Using cached AI search query:', cached);
      return cached;
    }

    try {
      const aiResult = await this.callAIForSearchQuery(title, description);
      
      if (aiResult && aiResult.success && aiResult.searchTerms) {
        console.log('✅ AI generated optimal search query:', aiResult.searchTerms);
        
        // Cache the result
        this.setCachedResult(cacheKey, aiResult);
        
        return aiResult;
      } else {
        console.error('❌ AI failed to generate search query:', aiResult);
        return this.getFallbackQuery(title);
      }
    } catch (error) {
      console.error('💥 AI search query generation failed:', error);
      return this.getFallbackQuery(title);
    }
  }

  // AI prompt and analysis
  async callAIForSearchQuery(title, description) {
    const prompt = this.buildAIPrompt(title, description);
    
    console.log('🚀 Calling AI for search query generation...');
    
    try {
      const response = await this.apiManager.callAI(prompt);
      
      if (response && response.success) {
        return this.parseAIResponse(response.data);
      } else {
        throw new Error('AI API call failed');
      }
    } catch (error) {
      console.error('💥 AI API call error:', error);
      throw error;
    }
  }

  // Build the AI prompt with clear guidelines
  buildAIPrompt(title, description) {
    return `You are an expert auction search optimizer. Your task is to generate 2-3 optimal search terms that will find comparable items on auction sites.

TITLE: "${title}"
DESCRIPTION: "${description}"

CRITICAL GUIDELINES:
1. PRIORITY ORDER: Brand/Manufacturer → Specific Model → Category
2. NEVER use years unless vintage-specific (1960s Rolex = OK, 1983 = NO)
3. NEVER use conditions (excellent, damaged, working)
4. NEVER use technical specs (61 keys, MIDI, automatic movement)
5. NEVER use materials unless luxury (18k gold = OK, steel = NO)
6. BE CONSERVATIVE: Better few good results than many mixed results
7. VERIFY: These terms must work on auctionet.com search

EXAMPLES:
- "SYNTHESIZER, Yamaha DX7 Programmable Algorithm..." → ["Yamaha", "DX7"]
- "ROLEX Submariner ref 16610 automatic..." → ["Rolex", "Submariner"]
- "RING, 18k gold with diamonds, size 17..." → ["18k gold", "ring"]
- "WATCH, vintage Omega Speedmaster Professional..." → ["Omega", "Speedmaster"]

RESPONSE FORMAT (JSON only):
{
  "searchTerms": ["term1", "term2", "term3"],
  "reasoning": "Brief explanation of why these terms",
  "confidence": 0.9
}

Generate the optimal search terms now:`;
  }

  // Parse AI response
  parseAIResponse(aiResponseText) {
    try {
      console.log('📥 Raw AI response:', aiResponseText);
      
      // Extract JSON from response
      const jsonMatch = aiResponseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate response structure
      if (!parsed.searchTerms || !Array.isArray(parsed.searchTerms)) {
        throw new Error('Invalid AI response structure');
      }
      
      // Clean and validate search terms
      const cleanedTerms = parsed.searchTerms
        .filter(term => term && typeof term === 'string')
        .map(term => term.trim())
        .filter(term => term.length > 0 && term.length <= 50)
        .slice(0, 3); // Max 3 terms
      
      if (cleanedTerms.length === 0) {
        throw new Error('No valid search terms in AI response');
      }
      
      console.log('🧠 AI reasoning:', parsed.reasoning);
      console.log('📊 AI confidence:', parsed.confidence);
      console.log('✅ Cleaned search terms:', cleanedTerms);
      
      return {
        success: true,
        searchTerms: cleanedTerms,
        reasoning: parsed.reasoning || 'No reasoning provided',
        confidence: parsed.confidence || 0.5,
        source: 'ai_only',
        query: cleanedTerms.join(' ')
      };
      
    } catch (error) {
      console.error('💥 Failed to parse AI response:', error);
      console.error('📄 Response text:', aiResponseText);
      return {
        success: false,
        error: error.message,
        source: 'ai_parse_error'
      };
    }
  }

  // Emergency fallback if AI completely fails
  getFallbackQuery(title) {
    console.log('⚠️ Using emergency fallback for title:', title);
    
    // Very simple extraction as last resort
    const words = title.toLowerCase()
      .replace(/[^\w\såäöüß-]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .slice(0, 3);
    
    return {
      success: true,
      searchTerms: words,
      reasoning: 'Emergency fallback - AI unavailable',
      confidence: 0.3,
      source: 'emergency_fallback',
      query: words.join(' ')
    };
  }

  // Cache management
  getCachedResult(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }
    return null;
  }

  setCachedResult(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  // Clear expired cache entries
  clearExpiredCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp >= this.cacheExpiry) {
        this.cache.delete(key);
      }
    }
  }

  // Get cache statistics
  getCacheStats() {
    const total = this.cache.size;
    const expired = Array.from(this.cache.values())
      .filter(entry => Date.now() - entry.timestamp >= this.cacheExpiry).length;
    
    return { total, active: total - expired, expired };
  }
} 