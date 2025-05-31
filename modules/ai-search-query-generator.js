// modules/ai-search-query-generator.js - AI-powered search query generation
// Uses Claude to generate optimal search terms for auction market analysis

import { APIManager } from './api-manager.js';
import { applySearchRules } from './ai-search-rules.js';

export class AISearchQueryGenerator {
  constructor(apiManagerInstance = null) {
    this.apiManager = apiManagerInstance || new APIManager();
    this.cache = new Map();
    this.cacheExpiry = 30 * 60 * 1000; // 30 minutes
  }

  async generateOptimalSearchQuery(title, description = '', artist = '', aiArtist = '') {
    console.log('🤖 AI-ONLY: Starting pure AI search query generation...');
    console.log('📝 Title:', title);
    console.log('📄 Description:', description);
    console.log('👤 Artist field:', artist);
    console.log('🤖 AI Artist:', aiArtist);

    // STEP 1: Apply AI rules first (especially artist field respect)
    const inputData = { title, description, artist, aiArtist };
    const rulesResult = applySearchRules(inputData);
    
    if (rulesResult.searchTerms.length >= 2) {
      console.log('✅ AI RULES: Generated sufficient search terms, using rules-based approach');
      console.log('🎯 Rules-based query:', rulesResult.searchTerms.join(' '));
      return {
        success: true,
        searchTerms: rulesResult.searchTerms,
        query: rulesResult.searchTerms.join(' '),
        reasoning: rulesResult.reasoning,
        confidence: rulesResult.confidence,
        source: 'ai_rules',
        originalTitle: title,
        originalDescription: description,
        artist: artist,
        appliedRules: rulesResult.appliedRules
      };
    } else {
      console.log('⚠️ AI RULES: Insufficient terms from rules, falling back to Claude AI generation');
    }

    // STEP 2: Fallback to Claude AI if rules don't generate enough terms
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(title, description, artist);
      const cached = this.getCachedResult(cacheKey);
      if (cached) {
        console.log('📦 Using cached AI search query result');
        return cached;
      }

      // Build context for AI (including artist field if available)
      const context = this.buildAIContext(title, description, artist, aiArtist);
      
      console.log('🚀 Calling AI for search query generation...');
      const response = await this.callClaudeAPI(context);
      
      if (response.success) {
        const result = {
          success: true,
          searchTerms: response.searchTerms,
          query: response.searchTerms.join(' '),
          reasoning: response.reasoning,
          confidence: response.confidence,
          source: 'ai_claude',
          originalTitle: title,
          originalDescription: description,
          artist: artist
        };
        
        // Cache the result
        this.setCachedResult(cacheKey, result);
        return result;
      } else {
        throw new Error('AI generation failed');
      }

    } catch (error) {
      console.error('💥 AI search query generation failed:', error);
      
      // Emergency fallback
      const fallbackTerms = this.generateFallbackQuery(title);
      return {
        success: true,
        searchTerms: fallbackTerms,
        query: fallbackTerms.join(' '),
        reasoning: 'Emergency fallback due to AI failure',
        confidence: 0.3,
        source: 'emergency_fallback',
        originalTitle: title,
        originalDescription: description,
        artist: artist
      };
    }
  }

  buildAIContext(title, description, artist, aiArtist) {
    // Build enhanced context that emphasizes artist field importance
    let context = `Generate optimal search terms for auction market analysis.

CRITICAL RULE: If artist field is provided, it MUST be included in the search terms.

Title: "${title}"
Description: "${description}"`;

    if (artist && artist.trim()) {
      context += `
Artist field (MANDATORY to include): "${artist}"`;
    }

    if (aiArtist && aiArtist.trim() && aiArtist !== artist) {
      context += `
AI detected artist: "${aiArtist}"`;
    }

    context += `

Rules:
1. ALWAYS include artist field content if provided (highest priority)
2. Include brand names (Royal Copenhagen, Yamaha, Omega, etc.)
3. Include specific object types (fat, armbandsur, synthesizer, etc.)
4. Include model numbers or pattern names
5. Maximum 4 terms, prioritize by market relevance
6. Terms should be in the language they appear (Swedish/English mix is fine)

Return JSON format:
{
  "searchTerms": ["term1", "term2", "term3"],
  "reasoning": "explanation of term selection prioritizing artist field",
  "confidence": 0.95
}`;

    return context;
  }

  // Generate cache key for search results
  generateCacheKey(title, description, artist) {
    const key = `${title}_${description}_${artist}`.substring(0, 200);
    return key.replace(/[^\w\s-]/g, ''); // Remove special characters
  }

  // AI prompt and analysis
  async callClaudeAPI(prompt) {
    try {
      console.log('🚀 Calling AI for search query generation...');
      const response = await this.apiManager.callAI(prompt, 'search_query');
      
      if (response && response.searchTerms) {
        console.log('✅ AI search query generation successful, received raw JSON');
        return {
          success: true,
          searchTerms: response.searchTerms,
          reasoning: response.reasoning,
          confidence: response.confidence
        };
      } else {
        throw new Error('Invalid AI response format');
      }
    } catch (error) {
      console.error('💥 AI call failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Emergency fallback query generation
  generateFallbackQuery(title) {
    console.log('🚨 Generating emergency fallback query from title');
    
    const words = title.toLowerCase()
      .replace(/[^\w\såäöüß-]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .slice(0, 3);
    
    return words.length > 0 ? words : ['objekt'];
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

  // Get cache statistics
  getCacheStats() {
    return {
      size: this.cache.size,
      expiry: this.cacheExpiry
    };
  }
} 