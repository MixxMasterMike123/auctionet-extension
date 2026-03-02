// modules/enhance-all/enhance-all-manager.js — Main orchestrator for "Förbättra alla"
// Coordinates tier selection, API calls, response parsing, and field distribution

import { determineTier, getTierById, getSystemPrompt, buildUserMessage } from './tier-config.js';

export class EnhanceAllManager {
  constructor() {
    this.apiManager = null;
    this.dataExtractor = null;
    this.biographyKBCard = null;
    this.qualityAnalyzer = null;
    this.ui = null;
    this._isProcessing = false;
  }

  // ─── Dependency injection ───

  setApiManager(apiManager) {
    this.apiManager = apiManager;
  }

  setDataExtractor(dataExtractor) {
    this.dataExtractor = dataExtractor;
  }

  setBiographyKBCard(biographyKBCard) {
    this.biographyKBCard = biographyKBCard;
  }

  setQualityAnalyzer(qualityAnalyzer) {
    this.qualityAnalyzer = qualityAnalyzer;
  }

  setUI(ui) {
    this.ui = ui;
  }

  // ─── Main entry point ───

  /**
   * Run the full enhance-all flow
   * @param {string} [tierOverride] — optional tier ID override ('tidy', 'enrich', 'full')
   * @returns {Promise<object|null>} enhancement result or null on failure
   */
  async enhance(tierOverride = null) {
    if (this._isProcessing) {
      console.warn('[EnhanceAll] Already processing, ignoring duplicate call');
      return null;
    }

    if (!this.apiManager?.apiKey) {
      console.error('[EnhanceAll] No API key configured');
      this.ui?.showError('API-nyckel saknas. Konfigurera i tilläggets inställningar.');
      return null;
    }

    this._isProcessing = true;

    try {
      // 1. Extract all form fields
      const formData = this._extractFormData();
      if (!formData) {
        this.ui?.showError('Kunde inte läsa formulärdata.');
        return null;
      }

      // 2. Determine tier
      const tier = tierOverride
        ? getTierById(tierOverride)
        : determineTier(formData.acceptedReserve);

      console.log(`[EnhanceAll] Tier: ${tier.label} (${tier.id}), valuation: ${formData.acceptedReserve || 'ej angivet'}`);

      // 3. Show loading state
      this.ui?.showLoading(tier);

      // 4. Run AI enhancement per tier
      let result;
      if (tier.id === 'enrich') {
        result = await this._enhanceTier2(formData, tier);
      } else {
        result = await this._enhanceSingleCall(formData, tier);
      }

      if (!result) {
        this.ui?.showError('AI-förbättring misslyckades. Försök igen.');
        return null;
      }

      // 5. Validate response (hallucination guard)
      result = this._validateResponse(result, formData);

      // 6. Check provenance reminder (Tier 3 only)
      const provenanceReminder = tier.features.provenanceReminder &&
        result.provenanceFound === false;

      // 7. Show preview
      this.ui?.showPreview(result, formData, tier, provenanceReminder);

      return result;

    } catch (error) {
      console.error('[EnhanceAll] Enhancement failed:', error);
      this.ui?.showError(`Fel: ${error.message}`);
      return null;
    } finally {
      this._isProcessing = false;
    }
  }

  // ─── Tier-specific flows ───

  /**
   * Single API call (Tier 1 and Tier 3)
   */
  async _enhanceSingleCall(formData, tier) {
    const systemPrompt = getSystemPrompt(tier.id);
    const userMessage = buildUserMessage(formData);

    this.ui?.updateLoadingStep('enhance', 'active');

    const response = await this._callAPI(tier.model, systemPrompt, userMessage, tier.maxTokens, tier.temperature);
    if (!response) return null;

    this.ui?.updateLoadingStep('enhance', 'done');

    return this._parseResponse(response);
  }

  /**
   * Tier 2: Sonnet for structure + optional Opus for maker bio (parallel)
   */
  async _enhanceTier2(formData, tier) {
    const systemPrompt = getSystemPrompt(tier.id);
    const userMessage = buildUserMessage(formData);

    const hasArtist = formData.artist &&
      formData.artist.trim() !== '' &&
      !this._isUnknownArtist(formData.artist);

    this.ui?.updateLoadingStep('enhance', 'active');
    if (hasArtist) {
      this.ui?.updateLoadingStep('bio', 'active');
    }

    // Run in parallel: structure + bio
    const [structureResponse, bioData] = await Promise.all([
      // Call 1: Sonnet for full structure
      this._callAPI(tier.model, systemPrompt, userMessage, tier.maxTokens, tier.temperature),

      // Call 2: Opus for biography (only if named artist exists)
      hasArtist
        ? this._fetchMakerContext(formData.artist, formData.artistDates, formData.title, formData.description)
        : Promise.resolve(null)
    ]);

    this.ui?.updateLoadingStep('enhance', 'done');
    if (hasArtist) {
      this.ui?.updateLoadingStep('bio', bioData ? 'done' : 'skipped');
    }

    if (!structureResponse) return null;

    const result = this._parseResponse(structureResponse);
    if (!result) return null;

    // Merge biography into description if the AI didn't already include maker context
    if (bioData?.biography && !result.makerContextUsed) {
      result.description = this._injectMakerContext(result.description, bioData);
      result.makerContextUsed = true;
    }

    return result;
  }

  // ─── API helpers ───

  /**
   * Call Claude API via background.js proxy
   */
  async _callAPI(model, systemPrompt, userMessage, maxTokens, temperature) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('[EnhanceAll] API call timed out');
        resolve(null);
      }, 45000); // 45s timeout

      chrome.runtime.sendMessage({
        type: 'anthropic-fetch',
        apiKey: this.apiManager.apiKey,
        body: {
          model: model,
          max_tokens: maxTokens,
          temperature: temperature,
          system: [{
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' }
          }],
          messages: [{
            role: 'user',
            content: userMessage
          }]
        }
      }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          console.error('[EnhanceAll] Chrome runtime error:', chrome.runtime.lastError.message);
          resolve(null);
        } else if (response?.success && response.data?.content?.[0]?.text) {
          resolve(response.data.content[0].text);
        } else {
          console.error('[EnhanceAll] API error:', response?.error || response?.data?.error?.message || 'Unknown');
          resolve(null);
        }
      });
    });
  }

  /**
   * Fetch maker biography via the existing biography system
   */
  async _fetchMakerContext(artistName, artistDates, itemTitle, itemDescription) {
    try {
      if (this.biographyKBCard) {
        // Reuse the existing biography fetch (has caching built in)
        return await this.biographyKBCard.fetchArtistBiography(
          artistName, artistDates, null, itemTitle, itemDescription
        );
      }

      // Fallback: direct API call if biographyKBCard not available
      return await this._fetchBiographyDirect(artistName, artistDates, itemTitle, itemDescription);
    } catch (error) {
      console.warn('[EnhanceAll] Maker context fetch failed (non-blocking):', error.message);
      return null;
    }
  }

  /**
   * Direct biography fetch (fallback when BiographyKBCard not wired)
   */
  async _fetchBiographyDirect(artistName, artistDates, itemTitle, itemDescription) {
    const contextParts = [];
    if (artistDates) contextParts.push(`Personen levde ${artistDates}.`);
    if (itemTitle) contextParts.push(`Objektets titel: "${itemTitle}".`);
    if (itemDescription) {
      const shortDesc = itemDescription.length > 200 ? itemDescription.substring(0, 200) + '...' : itemDescription;
      contextParts.push(`Beskrivning: "${shortDesc}".`);
    }
    const context = contextParts.length > 0
      ? `\nKontext:\n${contextParts.join('\n')}`
      : '';

    const prompt = `Konstnär/formgivare: "${artistName}"${context}

Svara med ENBART ett JSON-objekt (på svenska), ingen annan text:
{"years":"födelseår–dödsår","biography":"kort biografi max 80 ord","style":["stil1","stil2"],"notableWorks":["verk1","verk2"]}`;

    const response = await this._callAPI(
      'claude-opus-4-6',
      'Du är en konstexpert. Svara ALLTID med valid JSON. Inga kommentarer utanför JSON.',
      prompt,
      250,
      0.2
    );

    if (!response) return null;

    try {
      const jsonStr = response.replace(/```json?\s*([\s\S]*?)```/g, '$1').trim();
      const match = jsonStr.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]);
      return parsed === null ? null : {
        years: parsed.years || null,
        biography: parsed.biography || null,
        style: Array.isArray(parsed.style) ? parsed.style : [],
        notableWorks: Array.isArray(parsed.notableWorks) ? parsed.notableWorks : []
      };
    } catch {
      console.warn('[EnhanceAll] Failed to parse biography response');
      return null;
    }
  }

  // ─── Response parsing ───

  /**
   * Parse the AI JSON response
   */
  _parseResponse(responseText) {
    try {
      // Strip markdown code fences if present
      let cleaned = responseText
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      // Find the JSON object
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (!match) {
        console.error('[EnhanceAll] No JSON object found in response');
        return null;
      }

      const parsed = JSON.parse(match[0]);

      return {
        title: parsed.title || null,
        description: parsed.description || '',
        condition: parsed.condition || '',
        keywords: parsed.keywords || '',
        makerContextUsed: parsed.makerContextUsed || false,
        provenanceFound: parsed.provenanceFound || false
      };
    } catch (error) {
      console.error('[EnhanceAll] Failed to parse AI response:', error);
      console.error('[EnhanceAll] Raw response:', responseText?.substring(0, 500));
      return null;
    }
  }

  // ─── Validation (hallucination guard) ───

  _validateResponse(result, originalData) {
    // Helper: collapse multiple spaces within lines but preserve paragraph breaks (\n\n)
    const cleanSpaces = (text) => {
      return text
        .split('\n')
        .map(line => line.replace(/  +/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n') // max 2 consecutive newlines
        .trim();
    };

    // 1. Strip "Okänd konstnär" terms from all fields
    const unknownTerms = /\b(okänd|oidentifierad)\s*(konstnär|formgivare|maker|designer)\b/gi;
    if (result.title) result.title = result.title.replace(unknownTerms, '').replace(/  +/g, ' ').trim();
    result.description = cleanSpaces(result.description.replace(unknownTerms, ''));

    // 2. Check for forbidden subjective words
    const forbidden = ['fin', 'vacker', 'värdefull', 'unik', 'fantastisk',
      'underbar', 'magnifik', 'exceptionell', 'elegant', 'klassisk',
      'typisk', 'autentisk', 'raffinerad', 'exklusiv', 'gedigen',
      'förnäm', 'påkostad', 'förstklassig'];

    for (const word of forbidden) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      result.description = cleanSpaces(result.description.replace(regex, ''));
      if (result.condition) {
        result.condition = cleanSpaces(result.condition.replace(regex, ''));
      }
    }

    // 3. Remove duplicate keywords that exist in title
    if (result.keywords && (result.title || originalData.title)) {
      const titleWords = (result.title || originalData.title)
        .toLowerCase()
        .split(/[\s,]+/)
        .filter(w => w.length > 2);

      const keywords = result.keywords.split(/\s+/).filter(kw => {
        const kwLower = kw.toLowerCase();
        return !titleWords.includes(kwLower);
      });
      result.keywords = keywords.join(' ');
    }

    // 4. Strip artist name from title if artist field is populated
    if (result.title && originalData.artist && originalData.artist.trim() &&
        !this._isUnknownArtist(originalData.artist)) {
      const artistName = originalData.artist.trim();
      // Remove artist name from end of title (common AI mistake: "UGNSFORM, flintgods, Stig Lindberg")
      // Also handle UPPERCASE variant
      const escapedName = artistName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const artistPatterns = [
        new RegExp(`,?\\s*${escapedName}\\s*$`, 'i'),           // trailing ", Stig Lindberg"
        new RegExp(`,?\\s*${escapedName.toUpperCase()}\\s*$`),   // trailing ", STIG LINDBERG"
      ];
      for (const pattern of artistPatterns) {
        result.title = result.title.replace(pattern, '').trim();
      }
      // Clean trailing comma/space
      result.title = result.title.replace(/,\s*$/, '').trim();
    }

    // 5. Don't return a title if it's essentially unchanged
    if (result.title) {
      const normalizeForComparison = (s) => s.toLowerCase().replace(/[^a-zåäö0-9]/g, '');
      if (normalizeForComparison(result.title) === normalizeForComparison(originalData.title)) {
        result.title = null;
      }
    }

    return result;
  }

  // ─── Helpers ───

  _extractFormData() {
    if (this.dataExtractor) {
      return this.dataExtractor.extractItemData();
    }

    // Fallback: read DOM directly (for content.js which uses different extraction)
    return {
      category: document.querySelector('#item_category_id option:checked')?.textContent || '',
      title: document.querySelector('#item_title_sv')?.value || '',
      description: document.querySelector('#item_description_sv')?.value || '',
      condition: document.querySelector('#item_condition_sv')?.value || '',
      artist: document.querySelector('#item_artist_name_sv')?.value || '',
      artistDates: document.querySelector('[data-devbridge-autocomplete-target="help"]')?.textContent?.trim() || '',
      keywords: document.querySelector('#item_hidden_keywords')?.value || '',
      estimate: document.querySelector('#item_current_auction_attributes_estimate')?.value || '',
      upperEstimate: document.querySelector('#item_current_auction_attributes_upper_estimate')?.value || '',
      reserve: document.querySelector('#item_current_auction_attributes_reserve')?.value || '',
      acceptedReserve: document.querySelector('#item_current_auction_attributes_accepted_reserve')?.value || ''
    };
  }

  _isUnknownArtist(artistName) {
    const lower = artistName.toLowerCase().trim();
    return lower.includes('okänd') || lower.includes('oidentifierad') ||
      lower === '' || lower === '-' || lower === 'n/a';
  }

  /**
   * Inject maker context into a structured description
   * Inserts biography paragraph before the measurements section
   */
  _injectMakerContext(description, bioData) {
    if (!bioData?.biography) return description;

    // Build the maker context paragraph
    const parts = [];
    if (bioData.years) {
      parts.push(`(${bioData.years})`);
    }
    // The biography text from the API
    const bioText = bioData.biography;

    // Find where measurements start (last paragraph typically)
    const lines = description.split('\n');
    const measurementPatterns = /^(höjd|bredd|djup|diameter|längd|mått|vikt|ca\s+\d)/i;

    let insertIndex = lines.length;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() && measurementPatterns.test(lines[i].trim())) {
        insertIndex = i;
      } else if (lines[i].trim()) {
        break;
      }
    }

    // Insert bio paragraph before measurements
    lines.splice(insertIndex, 0, '', bioText, '');

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  get isProcessing() {
    return this._isProcessing;
  }
}
