// modules/ai/core/response-parser.js
// Centralized AI Response Parsing and Validation

export class ResponseParser {
  constructor() {
    this.parseCache = new Map(); // Cache parsed responses
  }

  /**
   * Parse Claude API response based on field type
   * @param {string} response - Raw response text from Claude
   * @param {string} fieldType - Type of field being parsed
   * @returns {Object} Parsed and validated response
   */
  parseResponse(response, fieldType) {
    if (!response || typeof response !== 'string') {
      throw new Error('Invalid response format from Claude');
    }

    // Check cache first
    const cacheKey = `${fieldType}-${this.hashString(response)}`;
    if (this.parseCache.has(cacheKey)) {
      return this.parseCache.get(cacheKey);
    }

    let result;

    // Route to appropriate parser based on field type
    switch (fieldType) {
      case 'search_query':
        result = this.parseSearchQuery(response);
        break;
      case 'title':
      case 'title-correct':
      case 'description':
      case 'condition':
      case 'keywords':
        result = this.parseSingleField(response, fieldType);
        break;
      case 'all':
      case 'all-enhanced':
      case 'all-sparse':
        result = this.parseMultiField(response);
        break;
      case 'artist-analysis':
        result = this.parseArtistAnalysis(response);
        break;
      case 'artist-verification':
        result = this.parseArtistVerification(response);
        break;
      default:
        result = this.parseGeneric(response, fieldType);
    }

    // Cache the result
    this.parseCache.set(cacheKey, result);
    
    return result;
  }

  /**
   * Parse search query responses (JSON format)
   */
  parseSearchQuery(response) {
    try {
      // Handle markdown code blocks
      let cleanResponse = response.trim();
      if (cleanResponse.includes('```json')) {
        cleanResponse = cleanResponse
          .replace(/```json\s*/g, '')
          .replace(/```\s*/g, '')
          .trim();
      }
      
      return JSON.parse(cleanResponse);
    } catch (error) {
      throw new Error(`Failed to parse search query JSON: ${error.message}`);
    }
  }

  /**
   * Parse single field responses (title, description, etc.)
   */
  parseSingleField(response, fieldType) {
    const result = {};
    const lines = response.split('\n');
    
    // Try to extract structured format first
    lines.forEach(line => {
      const trimmedLine = line.trim();
      
      if (trimmedLine.match(/^\*?\*?TITEL\s*:?\*?\*?\s*/i)) {
        result.title = trimmedLine.replace(/^\*?\*?TITEL\s*:?\*?\*?\s*/i, '').trim();
      } else if (trimmedLine.match(/^\*?\*?BESKRIVNING\s*:?\*?\*?\s*/i)) {
        result.description = trimmedLine.replace(/^\*?\*?BESKRIVNING\s*:?\*?\*?\s*/i, '').trim();
      } else if (trimmedLine.match(/^\*?\*?KONDITION\s*:?\*?\*?\s*/i)) {
        result.condition = trimmedLine.replace(/^\*?\*?KONDITION\s*:?\*?\*?\s*/i, '').trim();
      } else if (trimmedLine.match(/^\*?\*?SÖKORD\s*:?\*?\*?\s*/i)) {
        result.keywords = trimmedLine.replace(/^\*?\*?SÖKORD\s*:?\*?\*?\s*/i, '').trim();
      }
    });
    
    // Fallback logic for unstructured responses
    if (Object.keys(result).length === 0) {
      if (fieldType === 'title-correct') {
        result.title = response.trim();
      } else {
        result[fieldType] = response.trim();
      }
    }
    
    // Special handling for title-correct
    if (fieldType === 'title-correct' && !result.title && Object.keys(result).length > 0) {
      // If we got other fields but no title, try to extract title from response
      if (result.description && result.description.length > 0 && result.description.length < 100) {
        result.title = result.description;
      } else {
        result.title = response.trim();
      }
    }
    
    // Map title-correct to title field for consistency
    if (fieldType === 'title-correct' && result[fieldType]) {
      result.title = result[fieldType];
      delete result[fieldType];
    }
    
    return result;
  }

  /**
   * Parse multi-field responses (all, all-enhanced, etc.)
   */
  parseMultiField(response) {
    const result = {};
    const lines = response.split('\n');
    
    let currentField = null;
    let currentContent = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // Check if this line starts a new field
      if (trimmedLine.match(/^\*?\*?TITEL(\s*\([^)]*\))?\s*:?\*?\*?\s*/i)) {
        this.saveCurrentField(result, currentField, currentContent);
        currentField = 'title';
        currentContent = [trimmedLine.replace(/^\*?\*?TITEL(\s*\([^)]*\))?\s*:?\*?\*?\s*/i, '').trim()];
      } else if (trimmedLine.match(/^\*?\*?BESKRIVNING\s*:?\*?\*?\s*/i)) {
        this.saveCurrentField(result, currentField, currentContent);
        currentField = 'description';
        currentContent = [trimmedLine.replace(/^\*?\*?BESKRIVNING\s*:?\*?\*?\s*/i, '').trim()];
      } else if (trimmedLine.match(/^\*?\*?KONDITION(SRAPPORT)?\s*:?\*?\*?\s*/i)) {
        this.saveCurrentField(result, currentField, currentContent);
        currentField = 'condition';
        currentContent = [trimmedLine.replace(/^\*?\*?KONDITION(SRAPPORT)?\s*:?\*?\*?\s*/i, '').trim()];
      } else if (trimmedLine.match(/^\*?\*?SÖKORD\s*:?\*?\*?\s*/i)) {
        this.saveCurrentField(result, currentField, currentContent);
        currentField = 'keywords';
        currentContent = [trimmedLine.replace(/^\*?\*?SÖKORD\s*:?\*?\*?\s*/i, '').trim()];
      } else if (trimmedLine.match(/^\*?\*?VALIDERING\s*:?\*?\*?\s*/i)) {
        this.saveCurrentField(result, currentField, currentContent);
        currentField = 'validation';
        currentContent = [trimmedLine.replace(/^\*?\*?VALIDERING\s*:?\*?\*?\s*/i, '').trim()];
      }
      // Handle simple formats
      else if (trimmedLine.startsWith('TITEL:')) {
        this.saveCurrentField(result, currentField, currentContent);
        currentField = 'title';
        currentContent = [trimmedLine.substring(6).trim()];
      } else if (trimmedLine.startsWith('BESKRIVNING:')) {
        this.saveCurrentField(result, currentField, currentContent);
        currentField = 'description';
        currentContent = [trimmedLine.substring(12).trim()];
      } else if (trimmedLine.startsWith('KONDITION:')) {
        this.saveCurrentField(result, currentField, currentContent);
        currentField = 'condition';
        currentContent = [trimmedLine.substring(10).trim()];
      } else if (trimmedLine.startsWith('SÖKORD:')) {
        this.saveCurrentField(result, currentField, currentContent);
        currentField = 'keywords';
        currentContent = [trimmedLine.substring(7).trim()];
      } else if (trimmedLine.startsWith('VALIDERING:')) {
        this.saveCurrentField(result, currentField, currentContent);
        currentField = 'validation';
        currentContent = [trimmedLine.substring(11).trim()];
      } else if (currentField && trimmedLine.length > 0) {
        // This is a continuation line for the current field
        currentContent.push(line); // Keep original formatting/indentation
      }
    }
    
    // Save the last field
    this.saveCurrentField(result, currentField, currentContent);
    
    // Fallback if no fields found
    if (Object.keys(result).length === 0 && response.trim().length > 0) {
      result.title = response.trim();
    }
    
    return result;
  }

  /**
   * Parse artist analysis responses (JSON format)
   */
  parseArtistAnalysis(response) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Validate the response structure
        if (typeof parsed.hasArtist === 'boolean' && 
            typeof parsed.confidence === 'number' &&
            parsed.confidence >= 0 && parsed.confidence <= 1) {
          
          return {
            hasArtist: parsed.hasArtist,
            artistName: parsed.artistName || null,
            isVerified: parsed.isVerified || false,
            foundIn: parsed.foundIn || 'unknown',
            suggestedTitle: parsed.suggestedTitle || null,
            suggestedDescription: parsed.suggestedDescription || null,
            confidence: parsed.confidence,
            reasoning: parsed.reasoning || '',
            source: 'ai'
          };
        }
      }
      
      // Fallback parsing if JSON is malformed
      return this.parseArtistAnalysisFallback(response);
      
    } catch (error) {
      console.error('Error parsing AI artist analysis response:', error);
      return this.parseArtistAnalysisFallback(response);
    }
  }

  /**
   * Parse artist verification responses (JSON format)
   */
  parseArtistVerification(response) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Validate the response structure
        if (typeof parsed.isRealArtist === 'boolean' && 
            typeof parsed.confidence === 'number' &&
            parsed.confidence >= 0 && parsed.confidence <= 1) {
          
          return {
            isRealArtist: parsed.isRealArtist,
            confidence: parsed.confidence,
            biography: parsed.biography || null,
            specialties: parsed.specialties || null,
            activeYears: parsed.activeYears || null,
            relevanceToObject: parsed.relevanceToObject || null
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error parsing AI artist verification response:', error);
      return null;
    }
  }

  /**
   * Generic parser for unknown field types
   */
  parseGeneric(response, fieldType) {
    return {
      [fieldType]: response.trim(),
      _raw: response
    };
  }

  /**
   * Helper method to save current field content
   */
  saveCurrentField(result, fieldName, content) {
    if (fieldName && content.length > 0) {
      result[fieldName] = content.join('\n').trim();
    }
  }

  /**
   * Fallback parser for artist analysis when JSON parsing fails
   */
  parseArtistAnalysisFallback(response) {
    const hasArtist = /hasArtist['":\s]*true/i.test(response);
    const artistMatch = response.match(/artistName['":\s]*["']([^"']+)["']/i);
    const confidenceMatch = response.match(/confidence['":\s]*([0-9.]+)/i);
    const foundInMatch = response.match(/foundIn['":\s]*["']([^"']+)["']/i);
    
    if (hasArtist && artistMatch && confidenceMatch) {
      return {
        hasArtist: true,
        artistName: artistMatch[1],
        isVerified: false,
        foundIn: foundInMatch ? foundInMatch[1] : 'unknown',
        suggestedTitle: null,
        suggestedDescription: null,
        confidence: parseFloat(confidenceMatch[1]),
        reasoning: 'Fallback parsing',
        source: 'ai'
      };
    }
    
    return null;
  }

  /**
   * Simple hash function for caching
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }

  /**
   * Clear the parse cache
   */
  clearCache() {
    this.parseCache.clear();
    console.log('🧹 Response Parser: Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.parseCache.size,
      keys: Array.from(this.parseCache.keys()).slice(0, 5) // Show first 5 keys
    };
  }

  /**
   * Validate parsed response structure
   */
  validateResponse(parsedResponse, fieldType) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (!parsedResponse || typeof parsedResponse !== 'object') {
      validation.isValid = false;
      validation.errors.push('Response is not an object');
      return validation;
    }

    // Field-specific validation
    switch (fieldType) {
      case 'title':
      case 'title-correct':
        if (!parsedResponse.title || parsedResponse.title.length === 0) {
          validation.errors.push('Title field is empty');
          validation.isValid = false;
        }
        break;
      case 'artist-analysis':
        if (typeof parsedResponse.hasArtist !== 'boolean') {
          validation.errors.push('hasArtist must be boolean');
          validation.isValid = false;
        }
        if (typeof parsedResponse.confidence !== 'number' || 
            parsedResponse.confidence < 0 || parsedResponse.confidence > 1) {
          validation.errors.push('confidence must be number between 0-1');
          validation.isValid = false;
        }
        break;
    }

    return validation;
  }
} 