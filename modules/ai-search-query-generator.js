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

  async generateOptimalSearchQuery(title, description = '', artist = '', aiArtist = '', excludeArtist = null) {
    

    // STEP 1: Apply AI rules first (especially artist field respect)
    const inputData = { title, description, artist, aiArtist, excludeArtist };
    const rulesResult = applySearchRules(inputData);
    
    // ENHANCED SUFFICIENCY CHECK: Artist field has special priority
    const hasArtistField = artist && artist.trim();
    const artistTermFound = rulesResult.searchTerms.some(term => 
      hasArtistField && term.toLowerCase().includes(artist.toLowerCase())
    );
    
    // Accept AI Rules result if:
    // 1. Has 2+ terms (original logic), OR
    // 2. Has artist field present and artist term found (NEW: artist field priority)
    const isRulesSufficient = rulesResult.searchTerms.length >= 2 || 
                              (hasArtistField && artistTermFound && rulesResult.searchTerms.length >= 1);
    
    if (isRulesSufficient) {
      
      return {
        success: true,
        searchTerms: rulesResult.searchTerms, // Pre-selected terms for query
        allTerms: rulesResult.allTerms, // All terms (pre-selected + candidates)
        preSelectedTerms: rulesResult.preSelectedTerms, // Terms to be checked
        candidateTerms: rulesResult.candidateTerms, // Terms available as candidates
        query: rulesResult.searchTerms.join(' '),
        reasoning: rulesResult.reasoning,
        confidence: rulesResult.confidence,
        source: 'ai_rules_enhanced',
        originalTitle: title,
        originalDescription: description,
        artist: artist,
        appliedRules: rulesResult.appliedRules,
        selectionStrategy: rulesResult.selectionStrategy
      };
    }

    // STEP 2: Fallback to Claude AI if rules don't generate enough terms
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(title, description, artist);
      const cached = this.getCachedResult(cacheKey);
      if (cached) {
        return cached;
      }

      // Build context for AI (including artist field if available)
      const context = this.buildAIContext(title, description, artist, aiArtist, excludeArtist);
      
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
      console.error('AI search query generation failed:', error);
      
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

  buildAIContext(title, description, artist, aiArtist, excludeArtist = null) {
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

    // NEW: Exclude ignored artist
    if (excludeArtist && excludeArtist.trim()) {
      context += `

CRITICAL EXCLUSION: Do NOT include "${excludeArtist}" in search terms - this artist was marked as incorrectly detected.`;
    }

    context += `

Rules:
1. ALWAYS include artist field content if provided (highest priority)
2. CRITICAL: Multi-word artist names MUST be wrapped in quotes for exact matching
   - Examples: "Håkan Berg", "Lisa Larson", "Niels Thorsson"
   - Single names can remain unquoted: Picasso
3. Include brand names (Royal Copenhagen, Yamaha, Omega, etc.)
4. Include specific object types (fat, armbandsur, synthesizer, etc.)
5. Include model numbers or pattern names
6. Maximum 4 terms, prioritize by market relevance
7. Terms should be in the language they appear (Swedish/English mix is fine)

QUOTE WRAPPING EXAMPLES:
- Artist field "håkan berg" → searchTerms: ["\"håkan berg\"", "etching"]
- Artist field "Niels Thorsson" → searchTerms: ["\"Niels Thorsson\"", "fat"]
- Artist field "Picasso" → searchTerms: ["Picasso", "målning"]

Return JSON format:
{
  "searchTerms": ["term1", "term2", "term3"],
  "reasoning": "explanation of term selection prioritizing artist field with quote wrapping",
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
      const response = await this.apiManager.callClaudeAPI({
        title: 'Search Query Generation',
        description: prompt
      }, 'search_query');
      
      
      // Parse the JSON response (API returns raw text for search_query field type)
      let parsedResponse;
      try {
        // CRITICAL FIX: Handle markdown code blocks that AI sometimes returns
        let cleanResponse = response;
        
        // Remove markdown code block wrappers if present
        if (response.includes('```json')) {
          cleanResponse = response
            .replace(/```json\s*/g, '')
            .replace(/```\s*/g, '')
            .trim();
        }
        
        parsedResponse = JSON.parse(cleanResponse);
      } catch (parseError) {
        console.error('Failed to parse AI JSON response:', parseError);
        console.error('Raw response was:', response);
        throw new Error('Invalid JSON format in AI response');
      }
      
      if (parsedResponse && parsedResponse.searchTerms && Array.isArray(parsedResponse.searchTerms)) {
        
        // NEW: FORCE quote wrapping for artist names in AI response
        const processedTerms = parsedResponse.searchTerms.map(term => {
          // Check if this looks like an artist name (2+ words, proper case)
          if (typeof term === 'string' && this.looksLikeArtistName(term)) {
            return this.forceQuoteWrapArtist(term);
          }
          return term;
        });
        
        
        return {
          success: true,
          searchTerms: processedTerms,
          reasoning: parsedResponse.reasoning || 'AI-generated search terms',
          confidence: parsedResponse.confidence || 0.8
        };
      } else {
        console.error('Invalid AI response structure:', parsedResponse);
        throw new Error('AI response missing required searchTerms array');
      }
    } catch (error) {
      console.error('AI call failed:', error);
      return { success: false, error: error.message };
    }
  }

  // NEW: Check if a term looks like an artist name
  looksLikeArtistName(term) {
    if (!term || typeof term !== 'string') return false;
    
    // Remove existing quotes for analysis
    const cleanTerm = term.replace(/['"]/g, '').trim();
    
    // Check if it's 2+ words with proper capitalization (artist name pattern)
    const words = cleanTerm.split(/\s+/);
    if (words.length < 2) return false;
    
    // Check if all words start with capital letter (artist name pattern)
    const isProperCase = words.every(word => /^[A-ZÅÄÖÜ][a-zåäöü]+$/.test(word));
    
    // Additional check: not a technical term or measurement
    const isTechnical = /\d|mm|cm|kg|karat|gold|silver|bronze|aluminum|steel|plastic|rubber/.test(cleanTerm.toLowerCase());
    
    return isProperCase && !isTechnical && cleanTerm.length >= 6; // Min 6 chars for "Bo Ek"
  }

  // NEW: Force quote wrapping for artist names
  forceQuoteWrapArtist(term) {
    if (!term || typeof term !== 'string') return term;
    
    // Remove any existing quotes first
    const cleanTerm = term.replace(/^["']|["']$/g, '').trim();
    
    // Split into words
    const words = cleanTerm.split(/\s+/).filter(word => word.length > 0);
    
    if (words.length > 1) {
      // Multi-word: Always wrap in quotes
      const quotedTerm = `"${cleanTerm}"`;
      return quotedTerm;
    }
    
    // Single word: return as-is
    return cleanTerm;
  }

  // Emergency fallback query generation
  generateFallbackQuery(title) {
    
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