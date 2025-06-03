// modules/core/ai-analysis-engine.js
// Single Source of Truth for AI Analysis Logic

export class AIAnalysisEngine {
  constructor(apiManager) {
    this.apiManager = apiManager;
    this.enableArtistInfo = true; // Default setting
    console.log('🧠 AI Analysis Engine initialized');
  }

  /**
   * MAIN METHOD: Analyze for artist detection with configurable conditions
   * This replaces the logic in api-manager.js that was skipping analysis
   */
  async analyzeForArtist(title, objectType, artistField, description = '', options = {}) {
    console.log('🧠 AI Analysis Engine: analyzeForArtist called', { 
      title: title?.substring(0, 50), 
      objectType, 
      artistField, 
      description: description?.substring(0, 50),
      options 
    });
    
    // Check if we have API access
    if (!this.apiManager?.apiKey) {
      console.log('❌ No API key available, skipping AI artist analysis');
      return null;
    }

    // Validate inputs
    if (!title || title.length < 10) {
      console.log('🚫 Title too short for AI analysis:', title);
      return null;
    }

    // CRITICAL FIX: Remove the artist field length check that was causing the bug
    // The original bug was here: if (artistField && artistField.trim().length > 2) return null;
    // 
    // NEW LOGIC: Only skip if explicitly requested to skip existing artists
    if (options.skipIfArtistExists && artistField && artistField.trim().length > 2) {
      console.log('🚫 Skipping AI analysis per skipIfArtistExists option:', artistField);
      return null;
    }
    
    // For prefilled artist fields, we should still run AI analysis to:
    // 1. Verify the artist is correctly placed
    // 2. Get proper search terms for SSoT
    // 3. Ensure consistent quality scoring
    if (artistField && artistField.trim().length > 2) {
      console.log('🎯 Artist field prefilled - running AI analysis for verification and SSoT generation');
    }

    console.log('🚀 Starting AI artist analysis...');
    
    try {
      const result = await this.performAIArtistAnalysis(title, objectType, artistField, description);
      console.log('✅ AI artist analysis completed:', result);
      return result;
    } catch (error) {
      console.error('💥 Error in AI artist analysis:', error);
      return null; // Graceful fallback
    }
  }

  /**
   * Perform the actual AI analysis (extracted from api-manager.js)
   */
  async performAIArtistAnalysis(title, objectType, artistField, description) {
    const prompt = `Analysera denna svenska auktionspost för konstnärsnamn:

TITEL: "${title}"
OBJEKTTYP: ${objectType || 'Okänd'}
KONSTNÄRSFÄLT: "${artistField || 'Tomt'}"
BESKRIVNING: "${description?.substring(0, 200) || 'Ingen beskrivning'}"

UPPGIFT: Analysera konstnärs-/designernamn och optimera för marknadsanalys.

REGLER:
- Om konstnärsfält är ifyllt: Verifiera korrekthet och använd för marknadsanalys
- Om konstnärsfält är tomt: Hitta konstnärsnamn i titel/beskrivning  
- INFORMAL INMATNING: "rolf lidberg pappaer litografi" → "Rolf Lidberg"
- Konstnärsnamn ofta först i titel
- Ignorera kapitalisering
- "Signerad [Namn]" = konstnärsnamn
- INTE konstnärsnamn: företag, orter, skolor

EXEMPEL:
- "carl malmsten stol ek" → "Carl Malmsten" 
- "lisa larson figurin" → "Lisa Larson"
- "IKEA lampa" → INGET (företag)

JSON:
{
  "hasArtist": boolean,
  "artistName": "namn eller null",
  "isVerified": boolean (true om konstnärsfält redan korrekt),
  "suggestedTitle": "titel utan konstnär eller null",
  "confidence": 0.0-1.0,
  "reasoning": "kort förklaring"
}`;

    console.log('📤 Sending AI request with prompt length:', prompt.length);

    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'anthropic-fetch',
        apiKey: this.apiManager.apiKey,
        body: {
          model: 'claude-3-haiku-20240307', // Use fast Haiku model for artist detection
          max_tokens: 300,
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

    console.log('📥 AI response received:', response);

    if (response.success && response.data?.content?.[0]?.text) {
      console.log('📝 AI response text:', response.data.content[0].text);
      const result = this.parseArtistAnalysisResponse(response.data.content[0].text);
      console.log('🎯 Parsed AI artist analysis result:', result);
      return result;
    }

    console.log('❌ Invalid AI response structure');
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
      console.error('Error parsing AI artist analysis response:', error);
      return null;
    }
  }

  /**
   * Verify artist information (extracted from api-manager.js)
   */
  async verifyArtist(artistName, objectType, period) {
    if (!this.apiManager?.apiKey || !this.enableArtistInfo) {
      return null;
    }

    try {
      const prompt = `Verifiera denna potentiella konstnär/designer:

NAMN: "${artistName}"
OBJEKTTYP: ${objectType || 'Okänd'}
PERIOD: ${period || 'Okänd'}

UPPGIFT:
Är detta en verklig konstnär, designer eller hantverkare? Ge biografisk kontext om möjligt.

SVARA MED JSON:
{
  "isRealArtist": boolean,
  "confidence": 0.0-1.0,
  "biography": "kort biografisk information eller null",
  "specialties": ["lista", "över", "specialiteter"] eller null,
  "activeYears": "aktiva år eller null",
  "relevanceToObject": "relevans till objekttyp eller null"
}`;

      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiManager.apiKey,
          body: {
            model: 'claude-3-haiku-20240307',
            max_tokens: 400,
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
        console.log('🎯 AI artist verification result:', result);
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
      console.error('Error parsing artist verification response:', error);
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
      console.log('🔧 AI Analysis Engine: enableArtistInfo updated to', this.enableArtistInfo);
    }
  }
} 