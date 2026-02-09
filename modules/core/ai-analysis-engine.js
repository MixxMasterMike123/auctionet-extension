// modules/core/ai-analysis-engine.js
// Single Source of Truth for AI Analysis Logic

export class AIAnalysisEngine {
  constructor(apiManager) {
    this.apiManager = apiManager;
    this.enableArtistInfo = true; // Default setting
  }

  /**
   * MAIN METHOD: Analyze for artist detection with configurable conditions
   * This replaces the logic in api-manager.js that was skipping analysis
   */
  async analyzeForArtist(title, objectType, artistField, description = '', options = {}) {
    
    // Check if we have API access
    if (!this.apiManager?.apiKey) {
      return null;
    }

    // Validate inputs
    if (!title || title.length < 10) {
      return null;
    }

    // CRITICAL FIX: Remove the artist field length check that was causing the bug
    // The original bug was here: if (artistField && artistField.trim().length > 2) return null;
    // 
    // NEW LOGIC: Only skip if explicitly requested to skip existing artists
    if (options.skipIfArtistExists && artistField && artistField.trim().length > 2) {
      return null;
    }
    
    try {
      const result = await this.performAIArtistAnalysis(title, objectType, artistField, description);
      return result;
    } catch (error) {
      console.error('Error in AI artist analysis:', error);
      return null; // Graceful fallback
    }
  }

  /**
   * Perform the actual AI analysis (extracted from api-manager.js)
   */
  async performAIArtistAnalysis(title, objectType, artistField, description) {
    const prompt = `Titel: "${title}"

UPPGIFT: Hitta PERSONNAMN i titel som är konstnärer/designers/hantverkare.
EXEMPEL: "Carl Malmsten", "Lisa Larson", "Christoffer Bauman" = konstnärer
INTE: "IKEA", "Stockholm", "Gustavsberg" = företag/orter

Svara ENDAST JSON:
{
  "hasArtist": true/false,
  "artistName": "Förnamn Efternamn eller null",
  "confidence": 0.9,
  "suggestedTitle": "titel utan konstnär"
}`;


    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'anthropic-fetch',
        apiKey: this.apiManager.apiKey,
        body: {
          model: 'claude-haiku-4-5-20251015', // Claude Haiku 4.5 — fast artist detection
          max_tokens: 100, // Reduced from 300 to 100 for faster processing
          temperature: 0.1, // Low temperature for consistent analysis
          messages: [{
            role: 'user',
            content: prompt
          }]
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error || 'API request failed'));
        }
      });
    });

    if (response.success && response.data?.content?.[0]?.text) {
      const result = this.parseArtistAnalysisResponse(response.data.content[0].text);
      return result;
    }
    return null;
  }

  /**
   * Parse AI response (extracted from api-manager.js)
   */
  parseArtistAnalysisResponse(responseText) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let jsonString = jsonMatch[0];
        
        // Fix common JSON formatting issues that cause parsing errors
        jsonString = jsonString
          // Fix nested quotes: "text "quoted" text" → "text \"quoted\" text"
          .replace(/"([^"]*)"([^"]+)"([^"]*)"/g, '"$1\\"$2\\"$3"')
          // Fix control characters (newlines, tabs, etc.) in strings
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t')
          // Remove any other control characters (ASCII 0-31 except allowed ones)
          .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, '');
        
        const parsed = JSON.parse(jsonString);
        
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
      const hasArtist = /hasArtist['":\s]*true/i.test(responseText);
      const artistMatch = responseText.match(/artistName['":\s]*["']([^"']+)["']/i);
      const confidenceMatch = responseText.match(/confidence['":\s]*([0-9.]+)/i);
      const foundInMatch = responseText.match(/foundIn['":\s]*["']([^"']+)["']/i);
      
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
    } catch (error) {
      // Enhanced debugging for parsing errors
      
      // Try a more aggressive fallback parsing
      try {
        // First try to extract the JSON part and parse it properly
        // Handle both plain JSON and markdown-wrapped JSON
        let jsonStr = null;
        
        // Try to extract JSON from markdown code blocks first
        const markdownJsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
        if (markdownJsonMatch) {
          jsonStr = markdownJsonMatch[1].trim();
        } else {
          // Fallback to simple JSON extraction
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonStr = jsonMatch[0];
          }
        }
        
        if (jsonStr) {
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.hasArtist === true && parsed.artistName) {
              const result = {
                hasArtist: true,
                artistName: parsed.artistName,
                isVerified: parsed.isVerified || false,
                foundIn: 'title',
                suggestedTitle: parsed.suggestedTitle || null,
                suggestedDescription: parsed.suggestedDescription || null,
                confidence: parsed.confidence || 0.7,
                reasoning: parsed.reasoning || 'Fallback JSON parsing från AI-svar',
                source: 'ai'
              };
              return result;
            } else if (parsed.hasArtist === false) {
              return null; // No artist detected
            }
          } catch (jsonParseError) {
          }
        }
        
        // Fallback to regex patterns
        const nameMatch = responseText.match(/(?:artistName|artist|name)['":\s]*["']([^"']+)["']/i) ||
                         responseText.match(/(?:detected|found|upptäckt)[^"']*["']([^"']+)["']/i);
        
        if (nameMatch && nameMatch[1]) {
          return {
            hasArtist: true,
            artistName: nameMatch[1],
            isVerified: false,
            foundIn: 'title',
            suggestedTitle: null,
            suggestedDescription: null,
            confidence: 0.7,
            reasoning: 'Fallback regex parsing från AI-svar',
            source: 'ai'
          };
        }
      } catch (fallbackError) {
      }
      
      return null;
    }
  }

  /**
   * Verify artist information (extracted from api-manager.js)
   */
  async verifyArtist(artistName, objectType, period) {
    // Always provide verification for detected artists (for biography tooltip)
    // The enableArtistInfo setting should not disable basic verification functionality
    if (!this.apiManager?.apiKey) {
      return null;
    }

    try {
      const prompt = `Konstnär: "${artistName}" (${objectType || 'okänt'}, ${period || 'okänd period'})

Verifiera snabbt: Är detta en verklig konstnär/hantverkare? Skriv kort biografi (max 80 ord) på svenska.

JSON:
{
  "isRealArtist": boolean,
  "confidence": 0.0-1.0,
  "biography": "kort biografi eller null",
  "activeYears": "år eller null"
}`;

      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiManager.apiKey,
          body: {
            model: 'claude-haiku-4-5-20251015', // Claude Haiku 4.5 — fast bio generation
            max_tokens: 200, // Reduced from 400 to 200 for faster response
            temperature: 0.1,
            messages: [{
              role: 'user',
              content: prompt
            }]
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.success) {
            resolve(response);
          } else {
            reject(new Error(response.error || 'API request failed'));
          }
        });
      });

      if (response.success && response.data?.content?.[0]?.text) {
        const result = this.parseArtistVerificationResponse(response.data.content[0].text);
        return result;
      }

      return null;
    } catch (error) {
      console.error('Error in AI artist verification:', error);
      return null;
    }
  }

  /**
   * Parse artist verification response
   */
  parseArtistVerificationResponse(responseText) {
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        if (typeof parsed.isRealArtist === 'boolean') {
          return {
            isRealArtist: parsed.isRealArtist,
            confidence: parsed.confidence || 0.5,
            biography: parsed.biography || null,
            specialties: parsed.specialties || null,
            activeYears: parsed.activeYears || null,
            relevanceToObject: parsed.relevanceToObject || null
          };
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get current settings
   */
  getSettings() {
    return {
      enableArtistInfo: this.enableArtistInfo,
      hasApiKey: !!this.apiManager?.apiKey
    };
  }

  /**
   * Update settings
   */
  updateSettings(settings) {
    if (typeof settings.enableArtistInfo === 'boolean') {
      this.enableArtistInfo = settings.enableArtistInfo;
    }
  }
} 