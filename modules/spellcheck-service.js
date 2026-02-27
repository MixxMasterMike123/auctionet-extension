// modules/spellcheck-service.js — Unified Spellcheck API
// Single entry point for ALL spellcheck consumers: edit page inline hints + dashboard publication scan.
// Encapsulates dictionary lookup, AI check, brand check, proper name filtering, and deduplication.

import { SpellcheckDictionary } from './spellcheck-dictionary.js';

export class SpellcheckService {
  static _instance = null;

  static getInstance() {
    if (!SpellcheckService._instance) {
      SpellcheckService._instance = new SpellcheckService();
    }
    return SpellcheckService._instance;
  }

  constructor() {
    this.dictionary = SpellcheckDictionary.getInstance();
  }

  // ════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ════════════════════════════════════════════════════════════

  /**
   * Full spellcheck pipeline: dictionary + AI + optional brand check.
   * Returns array of { original, corrected, confidence, source, category, displayCategory }
   *
   * @param {string} text - Text to check
   * @param {object} options
   * @param {string}  options.fieldType - 'title' | 'description' | 'condition'
   * @param {boolean} options.includeAI - Whether to call AI (needs apiKey)
   * @param {string}  options.apiKey - Anthropic API key (required if includeAI)
   * @param {boolean} options.includeBrands - Whether to run brand fuzzy matching (default true)
   * @param {object}  options.brandValidationManager - BrandValidationManager instance for brand check
   * @param {string}  options.artistFieldValue - Value of artist name field for false positive filtering
   * @param {Set}     options.ignoredTerms - Session-based ignore list
   */
  async checkText(text, options = {}) {
    if (!text || text.length < 3) return [];

    const {
      fieldType = 'description',
      includeAI = false,
      apiKey = null,
      includeBrands = true,
      brandValidationManager = null,
      artistFieldValue = '',
      titleValue = '',
      ignoredTerms = new Set()
    } = options;

    // Run all checks in parallel where possible
    const checks = [
      this.checkTextDictionary(text)
    ];

    if (includeAI && apiKey) {
      checks.push(this.checkTextAI(text, fieldType, apiKey, titleValue));
    }

    if (includeBrands && brandValidationManager) {
      checks.push(
        brandValidationManager.validateBrandsInContent(text, '').then(issues =>
          issues.map(issue => ({
            original: issue.originalBrand,
            corrected: issue.suggestedBrand,
            confidence: issue.confidence || 0.85,
            source: 'brand_fuzzy',
            category: 'luxury',
            displayCategory: issue.displayCategory || 'märke',
            type: issue.type || 'brand'
          }))
        )
      );
    }

    const results = await Promise.all(checks);
    const allIssues = results.flat();

    // Deduplicate (prefer highest confidence)
    const deduped = this.deduplicateIssues(allIssues);

    // Filter false positives
    return this.filterFalsePositives(deduped, text, artistFieldValue, ignoredTerms);
  }

  /**
   * Fast dictionary-only check (no API call). Good for dashboard fallback.
   * @param {string} text
   * @returns {Array<{original, corrected, confidence, source, category, displayCategory}>}
   */
  checkTextDictionary(text) {
    if (!text) return [];
    // Match words of 4+ chars (same as swedish-spellchecker.js)
    const words = text.match(/\b[a-zåäöüA-ZÅÄÖÜ]{4,}\b/g) || [];
    const issues = [];
    const seen = new Set();

    for (const word of words) {
      const lower = word.toLowerCase();
      if (seen.has(lower)) continue;
      if (this.dictionary.isStopWord(lower)) continue;
      if (this.dictionary.isWhitelisted(lower)) continue;

      const correction = this.dictionary.getMisspellingCorrection(lower);
      if (correction) {
        seen.add(lower);
        issues.push({
          original: word,
          corrected: correction.correct,
          confidence: correction.confidence,
          source: 'dictionary',
          category: correction.category,
          displayCategory: this.dictionary.getCategoryDisplayName(correction.category),
          type: 'spelling'
        });
      }
    }
    return issues;
  }

  /**
   * AI-powered spellcheck via Claude Haiku.
   * The whitelist is injected dynamically from the dictionary so it's always up to date.
   * @param {string} text
   * @param {string} fieldType - 'title' | 'description' | 'condition'
   * @param {string} apiKey
   * @returns {Promise<Array>}
   */
  async checkTextAI(text, fieldType, apiKey, titleValue = '') {
    if (!apiKey || !text || text.length < 5) return [];

    const fieldLabel = fieldType === 'title' ? 'titel'
      : fieldType === 'condition' ? 'konditionsrapport'
      : 'beskrivning';

    // Build whitelist dynamically from dictionary — always complete and current
    const whitelistStr = this.dictionary.getWhitelistForAIPrompt();

    // Cross-field context: when checking description/condition, include the title
    // so the AI can detect truncated/misspelled words that appear correctly in the title
    // (e.g., title says "turkoser" but condition says "turko" → should suggest "turkos")
    const titleContext = (titleValue && fieldType !== 'title')
      ? `\nTiteln på detta föremål är: "${titleValue}"\nAnvänd titeln som referens — om ett ord i texten liknar ett ord i titeln men är felstavat eller avkortat, flagga det.\n`
      : '';

    const prompt = `Kontrollera stavningen i denna auktions-${fieldLabel} på svenska:
"${text}"
${titleContext}
Hitta ALLA stavfel, inklusive subtila fel med en bokstav fel:
- Saknade dubbelbokstäver (t.ex. "brutovikt" → "bruttovikt", "stopning" → "stoppning")
- Avkortade/stympade ord (t.ex. "turko" → "turkos", "silve" → "silver")
- Felstavade svenska ord (t.ex. "afisch" → "affisch", "teckninng" → "teckning")
- Felstavade material/tekniker (t.ex. "olija" → "olja", "akverell" → "akvarell")
- Felstavade facktermer (t.ex. "litograif" → "litografi")
- Felstavade mått- och vikttermer (t.ex. "brutovikt" → "bruttovikt")

IGNORERA:
- Personnamn och konstnärsnamn (t.ex. "E. Jarup", "Beijer") — rätta INTE dessa
- Ortnamn/stadsnamn
- Varumärken/märkesnamn (hanteras separat)
- Förkortningar (cm, st, ca, m/)
- Modellbeteckningar (m/1914, Nr, etc.)
- Legitima svenska auktions- och antiktermer — dessa ÄR korrekta ord:
  ${whitelistStr}
- Korrekt stavade ord — rapportera BARA verkliga stavfel

Svara BARA med JSON-array (tom om inga fel):
{"issues":[{"original":"felstavat","corrected":"korrekt","confidence":0.95}]}`;

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey,
          body: {
            model: 'claude-haiku-4-5',
            max_tokens: 300,
            temperature: 0,
            system: 'Du är en svensk stavningskontroll för auktions- och antiktexter. Hitta BARA verkliga stavfel. Svara med valid JSON. Var noggrann — rapportera INTE korrekt stavade ord. Många ovanliga men korrekta facktermer förekommer i auktionstexter — dessa ska INTE flaggas.',
            messages: [{ role: 'user', content: prompt }]
          }
        }, (resp) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (resp?.success) resolve(resp);
          else reject(new Error('Spellcheck AI call failed'));
        });
      });

      if (response.success && response.data?.content?.[0]?.text) {
        const responseText = response.data.content[0].text.trim();
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          if (result.issues && Array.isArray(result.issues)) {
            return result.issues
              .filter(issue =>
                issue.original && issue.corrected &&
                issue.original.toLowerCase() !== issue.corrected.toLowerCase() &&
                (issue.confidence || 0.9) >= 0.8 &&
                // Double-check: skip if the AI flagged a whitelisted term
                !this.dictionary.isWhitelisted(issue.original.toLowerCase())
              )
              .map(issue => ({
                original: issue.original,
                corrected: issue.corrected,
                confidence: issue.confidence || 0.9,
                source: 'ai_spellcheck',
                category: 'general',
                displayCategory: 'stavning',
                type: 'spelling'
              }));
          }
        }
      }
    } catch (_) {
      // Silently fail — dictionary check still works as fallback
    }

    return [];
  }

  // ════════════════════════════════════════════════════════════
  //  FALSE POSITIVE FILTERING
  // ════════════════════════════════════════════════════════════

  /**
   * Filter out false positives: ignored terms, proper names, artist field matches.
   * This is the merged + improved logic from inline-brand-validator.js and swedish-spellchecker.js.
   */
  filterFalsePositives(issues, text, artistFieldValue = '', ignoredTerms = new Set()) {
    return issues.filter(issue => {
      // 1. Skip ignored terms
      if (ignoredTerms.size > 0 && ignoredTerms.has(issue.original.toLowerCase())) return false;

      // 2. Skip whitelisted terms (safety net — shouldn't reach here but just in case)
      if (this.dictionary.isWhitelisted(issue.original.toLowerCase())) return false;

      // 3. ALWAYS skip words found in the artist field — regardless of confidence
      //    This is the key fix for artist name false positives.
      if (artistFieldValue) {
        const artistLower = artistFieldValue.toLowerCase();
        const wordLower = issue.original.toLowerCase();
        if (artistLower.includes(wordLower)) return false;
        // Also check individual words from artist field
        const artistWords = artistLower.split(/\s+/);
        if (artistWords.some(aw => aw === wordLower)) return false;
      }

      // 4. Filter out suggestions for proper names (artist/person names)
      if (this.isLikelyProperName(issue.original, text)) {
        // For proper names, filter ALL confidence levels — not just < 0.95
        // Diacritical-only diffs on proper names are always false positives
        if (this.differOnlyInDiacritics(issue.original, issue.corrected)) return false;
        // For non-diacritical proper name matches, only block lower-confidence ones
        if ((issue.confidence || 0) < 0.95) return false;
      }

      return true;
    });
  }

  // ════════════════════════════════════════════════════════════
  //  UTILITY METHODS (merged from inline-brand-validator + swedish-spellchecker)
  // ════════════════════════════════════════════════════════════

  /**
   * Detect if a word is likely a proper name in context.
   * Merged logic from InlineBrandValidator.isLikelyProperName() +
   * SwedishSpellChecker.looksLikeProperName()
   */
  isLikelyProperName(word, fullText) {
    if (!word || word.length < 2) return false;

    // ALL CAPS words are object types (TAVLA, STOL etc.), not proper names
    if (word === word.toUpperCase() && word.length > 1) return false;

    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Check if preceded by an initial (e.g., "E. Jarup" → "Jarup" is a proper name)
    const initialPattern = new RegExp(`[A-ZÅÄÖÜ]\\.\\s*${escaped}`, 'i');
    if (initialPattern.test(fullText)) return true;

    // Check if the word starts with uppercase (Title Case)
    if (/^[A-ZÅÄÖÜ][a-zåäöü]/.test(word)) {
      // In a comma-separated auction title, capitalized words after commas are often proper names
      const afterCommaPattern = new RegExp(`,\\s*${escaped}\\b`);
      if (afterCommaPattern.test(fullText)) return true;

      // Check if next to another capitalized word → person name pattern
      const namePattern = new RegExp(
        `[A-ZÅÄÖÜ][a-zåäöü]+\\s+${escaped}\\b|${escaped}\\s+[A-ZÅÄÖÜ][a-zåäöü]+`
      );
      if (namePattern.test(fullText)) return true;
    }

    return false;
  }

  /**
   * Check if two words differ only in diacritical marks (a↔ä, o↔ö, u↔ü, e↔é).
   * Used to avoid flagging "Hermes" vs "Hermès" as a spelling error in names.
   */
  differOnlyInDiacritics(word1, word2) {
    if (!word1 || !word2) return false;
    const normalize = (s) => s.toLowerCase()
      .replace(/[äàáâã]/g, 'a')
      .replace(/[öòóôõ]/g, 'o')
      .replace(/[üùúû]/g, 'u')
      .replace(/[éèêë]/g, 'e')
      .replace(/[åàáâã]/g, 'a');
    return normalize(word1) === normalize(word2) && word1.toLowerCase() !== word2.toLowerCase();
  }

  /**
   * Remove duplicate issues — when multiple sources flag the same word,
   * keep only the one with highest confidence.
   */
  deduplicateIssues(issues) {
    const seen = new Map();
    for (const issue of issues) {
      const key = issue.original.toLowerCase();
      const existing = seen.get(key);
      if (!existing || (issue.confidence || 0) > (existing.confidence || 0)) {
        seen.set(key, issue);
      }
    }
    return Array.from(seen.values());
  }
}
