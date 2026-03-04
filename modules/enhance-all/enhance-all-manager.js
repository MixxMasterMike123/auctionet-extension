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

      // 6. If "Inga anmärkningar" is checked, discard AI condition output
      if (formData.noRemarks) {
        result.condition = null;
        result._noRemarks = true;
      }

      // 7. Detect artist name in title (if artist field is empty)
      result._artistDetection = this._detectArtistInTitle(result, formData);

      // 8. Show preview
      this.ui?.showPreview(result, formData, tier);

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
   * Call Claude API via background.js proxy (Opus → Sonnet fallback on overload)
   */
  async _callAPI(model, systemPrompt, userMessage, maxTokens, temperature) {
    const result = await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.error('[EnhanceAll] API call timed out');
        resolve({ success: false, error: 'timeout' });
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
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else if (response?.success && response.data?.content?.[0]?.text) {
          resolve({ success: true, text: response.data.content[0].text });
        } else {
          const errorMsg = response?.error || response?.data?.error?.message || 'Unknown';
          resolve({ success: false, error: errorMsg });
        }
      });
    });

    if (result.success) return result.text;

    // Overload/rate-limit → fall back to Sonnet immediately
    const isOverloaded = result.error && (
      result.error.includes('Overloaded') || result.error.includes('overloaded') ||
      result.error.includes('rate limit') || result.error.includes('429')
    );
    // Opus overloaded → fall back to Sonnet immediately
    if (isOverloaded && model.includes('opus')) {
      console.warn(`[EnhanceAll] Opus overloaded — falling back to Sonnet`);
      return this._callAPI('claude-sonnet-4-5', systemPrompt, userMessage, maxTokens, temperature);
    }

    if (result.error !== 'timeout') {
      console.error('[EnhanceAll] API error:', result.error);
    }
    return null;
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

      let jsonStr = match[0];

      // Fix unescaped quotes inside JSON string values (e.g. "Axet" inside a value)
      // Try parsing first; if it fails, attempt to sanitize
      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        // Robust approach: walk the JSON character by character, fixing unescaped
        // quotes inside string values for known field keys.
        jsonStr = this._fixUnescapedQuotes(jsonStr);

        // Handle truncated response (e.g. Haiku ran out of tokens):
        // close any unterminated string and add missing closing brace
        if (!jsonStr.trim().endsWith('}')) {
          // Find the last complete "key": "value" pair and close the JSON
          jsonStr = jsonStr.replace(/,?\s*"[^"]*$/, '') // remove trailing partial key
            .replace(/,?\s*$/, '') + '}';
          // If still no closing brace, just append one
          if (!jsonStr.trim().endsWith('}')) jsonStr = jsonStr.trim() + '"}';
        }

        parsed = JSON.parse(jsonStr);
      }

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

    // 3. Remove keywords that already exist in title, description, condition, or existing keywords
    if (result.keywords) {
      const allFieldText = [
        result.title || originalData.title || '',
        result.description || '',
        result.condition || '',
        originalData.keywords || ''
      ].join(' ').toLowerCase();

      const existingKwSet = new Set(
        (originalData.keywords || '').split(/\s+/).map(kw => kw.toLowerCase()).filter(kw => kw.length > 0)
      );

      const keywords = result.keywords.split(/\s+/).filter(kw => {
        if (kw.length < 2) return false;
        const kwLower = kw.toLowerCase();
        const kwUnhyphenated = kwLower.replace(/-/g, ' ');
        // Skip if exact match in existing keywords
        if (existingKwSet.has(kwLower)) return false;
        // Skip if the word (or unhyphenated form) appears in any field text
        if (allFieldText.includes(kwUnhyphenated) || allFieldText.includes(kwLower)) return false;
        return true;
      });
      result.keywords = keywords.join(' ');
    }

    // 4. Strip artist name from title if artist field is populated
    const artistFieldPopulated = originalData.artist && originalData.artist.trim() &&
      !this._isUnknownArtist(originalData.artist);
    if (result.title && artistFieldPopulated) {
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

      // When artist field is populated, NO uppercase words allowed in title
      result.title = result.title.replace(/\b[A-ZÅÄÖÜ]{2,}\b/g, (w) => w.toLowerCase());
      result.title = result.title.charAt(0).toUpperCase() + result.title.slice(1);
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

  // ─── JSON repair ───

  /**
   * Fix unescaped double quotes inside JSON string values.
   * Walks character by character to reliably handle cases like:
   *   "title": "MATGRUPP, "Axet", gustaviansk"
   * The known JSON keys act as anchors to determine where values start and end.
   */
  _fixUnescapedQuotes(jsonStr) {
    const knownKeys = ['title', 'description', 'condition', 'keywords', 'biography',
      'makerContextUsed', 'provenanceFound'];
    // Build a pattern to find key-value boundaries
    const keyPattern = new RegExp(
      `"(${knownKeys.join('|')})"\\s*:\\s*`, 'g'
    );

    // Find all key positions
    const keyPositions = [];
    let m;
    while ((m = keyPattern.exec(jsonStr)) !== null) {
      keyPositions.push({
        key: m[1],
        valueStart: m.index + m[0].length // position right after ": "
      });
    }

    if (keyPositions.length === 0) return jsonStr;

    // Process from last to first to preserve indices
    for (let i = keyPositions.length - 1; i >= 0; i--) {
      const pos = keyPositions[i];
      const valueStart = pos.valueStart;

      // Check if value starts with a quote (string value)
      if (jsonStr[valueStart] !== '"') continue; // boolean/number — skip

      // Find the end of this value: look for the next key pattern or closing brace
      let valueEnd = -1;
      if (i + 1 < keyPositions.length) {
        // End is just before the comma + next key
        // Search backwards from next key for the comma and closing quote
        const nextKeyArea = jsonStr.lastIndexOf(',', keyPositions[i + 1].valueStart);
        if (nextKeyArea > valueStart) {
          // Find the last quote before the comma
          let q = nextKeyArea - 1;
          while (q > valueStart && jsonStr[q] !== '"') q--;
          if (q > valueStart) valueEnd = q;
        }
      } else {
        // Last value — find the closing brace and work backwards
        const closingBrace = jsonStr.lastIndexOf('}');
        if (closingBrace > valueStart) {
          let q = closingBrace - 1;
          while (q > valueStart && jsonStr[q] !== '"') q--;
          if (q > valueStart) valueEnd = q;
        }
      }

      if (valueEnd <= valueStart) continue;

      // Extract the inner value (between opening and closing quotes)
      const inner = jsonStr.substring(valueStart + 1, valueEnd);

      // Escape any unescaped quotes in the inner value
      const fixed = inner
        .replace(/\\"/g, '\x00')   // preserve already-escaped quotes
        .replace(/"/g, '\\"')      // escape bare quotes
        .replace(/\x00/g, '\\"');  // restore

      // Reconstruct
      jsonStr = jsonStr.substring(0, valueStart + 1) + fixed + jsonStr.substring(valueEnd);
    }

    return jsonStr;
  }

  // ─── Helpers ───

  _extractFormData() {
    let data;
    if (this.dataExtractor) {
      data = this.dataExtractor.extractItemData();
    } else {
      // Fallback: read DOM directly (for content.js which uses different extraction)
      data = {
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

    // Detect "Inga anmärkningar" checkbox
    data.noRemarks = this._isNoRemarksChecked();
    return data;
  }

  /**
   * Check if the "Inga anmärkningar" checkbox is checked
   */
  _isNoRemarksChecked() {
    const selectors = [
      '#item_no_remarks',
      'input[name="item[no_remarks]"]',
      'input[type="checkbox"][name*="no_remarks"]'
    ];
    for (const sel of selectors) {
      const cb = document.querySelector(sel);
      if (cb) return cb.checked;
    }
    return false;
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

  // ─── Artist detection in enhanced title ───

  /**
   * Detect if the enhanced title contains an artist/designer name
   * Only runs when the artist field is currently empty
   * @param {object} result — the AI enhancement result
   * @param {object} formData — the original form data
   * @returns {object|null} detection result or null
   */
  _detectArtistInTitle(result, formData) {
    // Only detect if artist field is empty (or unknown)
    if (formData.artist && formData.artist.trim() && !this._isUnknownArtist(formData.artist)) {
      return null;
    }

    const title = result.title || formData.title || '';
    if (!title || title.length < 5) return null;

    // Common non-name terms that appear in titles (companies, places, materials, etc.)
    const nonNameTerms = new Set([
      'gustavsberg', 'orrefors', 'kosta', 'boda', 'arabia', 'iittala', 'rörstrand',
      'gefle', 'höganäs', 'upsala', 'ekeby', 'nittsjö', 'jie', 'gantofta',
      'stockholm', 'göteborg', 'malmö', 'london', 'paris', 'copenhagen', 'wien',
      'ikea', 'svenskt', 'tenn', 'nordiska', 'kompaniet', 'firma',
      'art', 'deco', 'nouveau', 'jugend', 'empire', 'gustaviansk', 'sengustaviansk',
      'carraragods', 'flintgods', 'stengods', 'fajans', 'porslin', 'keramik',
      'nysilver', 'silver', 'mässing', 'brons', 'teak', 'ek', 'mahogny',
      'sverige', 'sweden', 'danish', 'finland'
    ]);

    // Pattern: Auctionet titles are "OBJEKTTYP, material, Artist Name, optional details"
    // We look for capitalized person names (First Last) in comma-separated segments
    const segments = title.split(',').map(s => s.trim());

    for (let i = 1; i < segments.length; i++) {
      const segment = segments[i].trim();
      // Skip segments that are too short or too long for a name
      if (segment.length < 4 || segment.length > 50) continue;

      // Skip if segment looks like a measurement, year, or pure number
      if (/^\d/.test(segment) || /\d\s*(cm|mm|kg|g|ml|cl)/.test(segment)) continue;
      if (/^ca\s/i.test(segment)) continue;

      // Check if it looks like a person name: 2-3 words, each starting with uppercase
      const words = segment.split(/\s+/);
      if (words.length < 2 || words.length > 4) continue;

      // Every word must start with uppercase (person names are capitalized)
      const allNameLike = words.every(w =>
        w.length >= 2 && /^[A-ZÅÄÖÜ]/.test(w) && /^[a-zA-ZåäöÅÄÖüÜéèêëàáâãñ'.-]+$/.test(w)
      );
      if (!allNameLike) continue;

      // Check none of the words are known non-name terms or common Swedish words
      const hasNonNameWord = words.some(w => nonNameTerms.has(w.toLowerCase()));
      if (hasNonNameWord) continue;

      // Skip common Swedish quantity/descriptor words that appear in titles
      const commonWords = new Set([
        'ett', 'par', 'set', 'tre', 'två', 'fyra', 'fem', 'sex', 'sju',
        'stor', 'liten', 'bred', 'hög', 'lång', 'rund',
        'del', 'delar', 'styck', 'samt', 'med', 'från', 'till', 'och',
        'sen', 'tidig', 'tidigt', 'sent', 'andra', 'första',
        'halft', 'hälft', 'mitt', 'mitten', 'talets',
        'typ', 'stil', 'modell', 'nummer'
      ]);
      const hasCommonWord = words.some(w => commonWords.has(w.toLowerCase()));
      if (hasCommonWord) continue;

      // Check it's not all uppercase (likely an object type like "PARTI" or location "STOCKHOLM")
      const allUpperCase = words.every(w => w === w.toUpperCase() && w.length > 1);
      if (allUpperCase) continue;

      // Looks like a person name!
      const detectedName = words
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');

      // Build suggested title: remove the artist segment and clean up
      const suggestedTitle = this._buildTitleWithoutArtist(title, segments, i);

      return {
        detectedName,
        originalSegment: segment,
        suggestedTitle,
        segmentIndex: i
      };
    }

    return null;
  }

  /**
   * Build a cleaned title with the artist segment removed
   * When artist is moved to artist field, the object type should NOT be UPPERCASE
   * per Auctionet convention: "FIGURIN, material" → "Figurin, material"
   */
  _buildTitleWithoutArtist(originalTitle, segments, removeIndex) {
    const remaining = segments.filter((_, i) => i !== removeIndex);
    let cleaned = remaining.join(', ').trim();

    // Clean up double commas, trailing commas, leading commas
    cleaned = cleaned
      .replace(/,\s*,/g, ',')
      .replace(/^,\s*/, '')
      .replace(/,\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();

    // When artist field is populated, NO uppercase words allowed in title
    // All UPPERCASE words → lowercase, then capitalize first letter of entire title
    // "FIGURIN, 'Drakvalp', carraragods" → "figurin, 'Drakvalp', carraragods" → "Figurin, 'Drakvalp', carraragods"
    cleaned = cleaned.replace(/\b[A-ZÅÄÖÜ]{2,}\b/g, (word) => word.toLowerCase());
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

    return cleaned;
  }

  get isProcessing() {
    return this._isProcessing;
  }
}
