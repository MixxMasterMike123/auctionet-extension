// modules/inline-brand-validator.js - Inline Brand Spell Checking with Tooltips
// Real-time brand validation with in-field highlighting and correction tooltips

import { SwedishSpellChecker } from './swedish-spellchecker.js';
import { escapeHTML } from './core/html-escape.js';

export class InlineBrandValidator {
  constructor(brandValidationManager = null) {
    this.brandValidationManager = brandValidationManager;
    this.swedishSpellChecker = new SwedishSpellChecker();
    this.activeTooltip = null;
    this.monitoredFields = new Map();
    this.debounceTimeout = null;
    this.ignoredTerms = new Set(); // Session-based ignore list
    
  }

  // Set brand validation manager
  setBrandValidationManager(brandValidationManager) {
    this.brandValidationManager = brandValidationManager;
  }

  // Start monitoring fields for brand misspellings
  startMonitoring() {
    const fieldsToMonitor = [
      { selector: '#item_title_sv', type: 'title' },
      { selector: '#item_title', type: 'title' },
      { selector: 'input[name*="title"]', type: 'title' },
      { selector: '#item_description_sv', type: 'description' },
      { selector: 'textarea[name*="description"]', type: 'description' },
      { selector: '#item_condition_sv', type: 'condition' },
      { selector: 'textarea[name*="condition"]', type: 'condition' },
      { selector: '#item_artist_name_sv', type: 'artist' },
      { selector: 'input[name*="artist"]', type: 'artist' }
    ];

    fieldsToMonitor.forEach(({ selector, type }) => {
      const field = document.querySelector(selector);
      if (field) {
        this.attachToField(field, type);
      }
    });

    // Add styles for highlighting and tooltips
    this.addInlineStyles();
    
  }

  // Attach validation to a specific field
  attachToField(field, type) {
    if (this.monitoredFields.has(field)) {

      return;
    }

    // Store field info
    this.monitoredFields.set(field, { type, originalField: field });

    // Each field gets its own debounce timer so they don't cancel each other
    let fieldDebounce = null;
    const validateHandler = () => {
      clearTimeout(fieldDebounce);
      fieldDebounce = setTimeout(() => {
        this.validateFieldContent(field, null, type);
      }, 1200); // Debounce typing (slightly longer for AI calls)
    };

    field.addEventListener('input', validateHandler);
    field.addEventListener('paste', validateHandler);

    // Validate existing content immediately (important for EDIT pages)
    // Uses its own setTimeout — independent of the typing debounce
    if (field.value && field.value.trim().length > 0) {
      setTimeout(() => {
        this.validateFieldContent(field, null, type);
      }, 800 + Math.random() * 400); // Stagger to avoid API rate limits
    }

  }

  // Create marker container for highlighting misspelled words
  createOverlay(field) {
    const markerContainer = document.createElement('div');
    markerContainer.className = 'brand-spell-markers';
    
    markerContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1000;
      overflow: hidden;
    `;

    // Create wrapper container to ensure proper positioning
    const wrapper = document.createElement('div');
    wrapper.className = 'brand-spell-wrapper';
    wrapper.style.cssText = `
      position: relative;
      display: inline-block;
      width: 100%;
    `;

    // Ensure parent can contain absolutely positioned markers
    const parent = field.parentElement;
    const originalPosition = parent.style.position;
    if (!originalPosition || originalPosition === 'static') {
      parent.style.position = 'relative';
    }

    // Insert wrapper and marker container
    field.parentNode.insertBefore(wrapper, field);
    wrapper.appendChild(field);
    wrapper.appendChild(markerContainer);

    // Store original position for cleanup
    markerContainer.dataset.originalParentPosition = originalPosition;

    return markerContainer;
  }

  // Show markers when field is focused
  showOverlay(markerContainer) {
    markerContainer.style.display = 'block';
  }

  // Validate field content using AI + fuzzy matching
  async validateFieldContent(field, _unused, type) {
    if (!this.brandValidationManager) {
      return;
    }

    const text = field.value;
    if (!text || text.length < 3) {
      this.removeInlineNotifications(field);
      field.style.boxShadow = '';
      field.style.borderColor = '';
      return;
    }

    // Artist field uses specialized validation
    if (type === 'artist') {
      return this.validateArtistFieldContent(field, text);
    }

    try {
      // Run brand validation and AI spellcheck in parallel for speed
      const apiManager = this.brandValidationManager?.apiManager;
      const [brandIssues, aiSpellIssues] = await Promise.all([
        this.brandValidationManager.validateBrandsInContent(text, ''),
        this.checkSpellingWithAI(text, type, apiManager)
      ]);

      const allIssues = [...brandIssues];

      // Add AI spellcheck results
      if (aiSpellIssues && aiSpellIssues.length > 0) {
        allIssues.push(...aiSpellIssues);
      }

      // Also add dictionary-based Swedish spell checking as a fast fallback
      const spellingErrors = this.swedishSpellChecker.validateSwedishSpelling(text);
      allIssues.push(...spellingErrors.map(error => ({
        originalBrand: error.originalWord,
        suggestedBrand: error.suggestedWord,
        confidence: error.confidence,
        category: error.category,
        source: error.source,
        type: 'spelling',
        displayCategory: this.swedishSpellChecker.getCategoryDisplayName(error.category)
      })));
      
      // Mark type for fuzzy/AI issues that don't have one
      allIssues.forEach(issue => {
        if (!issue.type) issue.type = 'brand';
        if (!issue.displayCategory) issue.displayCategory = 'märke';
      });

      // Deduplicate: if AI and dictionary found the same word, prefer AI (higher confidence)
      const deduped = this.deduplicateIssues(allIssues);
      
      // Filter out ignored terms and false positives on proper names
      const filteredIssues = deduped.filter(issue => {
        if (this.ignoredTerms.has(issue.originalBrand.toLowerCase())) return false;
        
        // Filter out suggestions for proper names (artist/person names)
        if (this.isLikelyProperName(issue.originalBrand, text)) {
          if ((issue.confidence || 0) < 0.95) return false;
        }
        
        // Filter out diacritical-only differences on proper names
        if (this.differOnlyInDiacritics(issue.originalBrand, issue.suggestedBrand) && 
            this.isLikelyProperName(issue.originalBrand, text)) {
          return false;
        }
        
        // Filter if the artist field already contains this name
        const artistField = document.querySelector('#item_artist_name_sv');
        if (artistField && artistField.value) {
          const artistName = artistField.value.toLowerCase();
          if (artistName.includes(issue.originalBrand.toLowerCase())) return false;
        }
        
        return true;
      });
      
      if (filteredIssues.length > 0) {
        this.showInlineNotifications(field, filteredIssues);
      } else {
        this.removeInlineNotifications(field);
      }
    } catch (error) {
      console.error('Error validating field content:', error);
    }
  }

  // AI-powered general spellcheck for title/description fields
  async checkSpellingWithAI(text, fieldType, apiManager) {
    if (!apiManager || !apiManager.apiKey) return [];
    if (text.length < 5) return [];

    const fieldLabel = fieldType === 'title' ? 'titel' : fieldType === 'condition' ? 'konditionsrapport' : 'beskrivning';
    const prompt = `Kontrollera stavningen i denna auktions-${fieldLabel} på svenska:
"${text}"

Hitta ALLA stavfel, t.ex.:
- Felstavade svenska ord (t.ex. "afisch" → "affisch", "teckninng" → "teckning")
- Felstavade material/tekniker (t.ex. "olija" → "olja", "akverell" → "akvarell")
- Felstavade facktermer (t.ex. "litograif" → "litografi")

IGNORERA:
- Personnamn och konstnärsnamn (t.ex. "E. Jarup", "Beijer") — rätta INTE dessa
- Ortnamn/stadsnamn
- Varumärken/märkesnamn (hanteras separat)
- Förkortningar (cm, st, ca)
- Legitima svenska auktions- och antiktermer — dessa ÄR korrekta ord:
  plymå, plymåer, karott, karotter, karaff, karaffer, dosa, tablå,
  terrin, skänk, chiffonjé, psykemålning, bonadsväv, röllakan,
  tenn, emalj, porfyr, intarsia, tuschlavering, lavering, gouache,
  plaquette, applique, pendyl, konfektskål, dragspelsstol
- Korrekt stavade ord — rapportera BARA verkliga stavfel

Svara BARA med JSON-array (tom om inga fel):
{"issues":[{"original":"felstavat","corrected":"korrekt","confidence":0.95}]}`;

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: apiManager.apiKey,
          body: {
            model: 'claude-haiku-4-5',
            max_tokens: 300,
            temperature: 0,
            system: 'Du är en svensk stavningskontroll för auktions- och antiktexter. Hitta BARA verkliga stavfel. Svara med valid JSON. Var noggrann — rapportera INTE korrekt stavade ord. Många ovanliga men korrekta facktermer förekommer i auktionstexter (plymå, karott, terrin, pendyl, etc.) — dessa ska INTE flaggas.',
            messages: [{ role: 'user', content: prompt }]
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response?.success) {
            resolve(response);
          } else {
            reject(new Error('Spellcheck AI call failed'));
          }
        });
      });

      if (response.success && response.data?.content?.[0]?.text) {
        const responseText = response.data.content[0].text.trim();
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          if (result.issues && Array.isArray(result.issues)) {
            return result.issues
              .filter(issue => issue.original && issue.corrected && 
                      issue.original.toLowerCase() !== issue.corrected.toLowerCase() &&
                      (issue.confidence || 0.9) >= 0.8)
              .map(issue => ({
                originalBrand: issue.original,
                suggestedBrand: issue.corrected,
                confidence: issue.confidence || 0.9,
                type: 'spelling',
                source: 'ai_spellcheck',
                displayCategory: 'stavning'
              }));
          }
        }
      }
    } catch (error) {
      // Silently fail — dictionary check still works as fallback
    }

    return [];
  }

  // Remove duplicate issues (prefer higher confidence)
  deduplicateIssues(issues) {
    const seen = new Map();
    for (const issue of issues) {
      const key = issue.originalBrand.toLowerCase();
      const existing = seen.get(key);
      if (!existing || (issue.confidence || 0) > (existing.confidence || 0)) {
        seen.set(key, issue);
      }
    }
    return Array.from(seen.values());
  }

  // Specialized validation for the artist/designer name field
  async validateArtistFieldContent(field, text) {
    const issues = [];

    // Check 1: Capitalization — artist names should be Title Case
    const titleCased = text.replace(/\b([a-zåäöü])([a-zåäöü]*)\b/g, (match, first, rest) => {
      // Skip very short words that might be particles (von, van, de, af)
      if (match.length <= 2 && ['av', 'af', 'de', 'le', 'la', 'di', 'du'].includes(match)) return match;
      if (['von', 'van', 'den', 'der', 'del'].includes(match)) return match;
      return first.toUpperCase() + rest;
    });

    if (titleCased !== text) {
      issues.push({
        originalBrand: text,
        suggestedBrand: titleCased,
        confidence: 0.95,
        type: 'artist_case',
        displayCategory: 'versaler'
      });
    }

    // Check 2: AI-powered artist name spelling check (if API available)
    const apiManager = this.brandValidationManager?.apiManager;
    if (apiManager && apiManager.apiKey) {
      try {
        const aiCorrection = await this.checkArtistNameWithAI(text, apiManager);
        if (aiCorrection) {
          // If AI found a correction, prefer it over the simple capitalization fix
          const existingCaseIssue = issues.findIndex(i => i.type === 'artist_case');
          if (existingCaseIssue >= 0) {
            issues.splice(existingCaseIssue, 1);
          }
          issues.push(aiCorrection);
        }
      } catch (error) {
        console.error('AI artist name validation failed:', error);
      }
    }

    // Filter ignored terms
    const filteredIssues = issues.filter(issue =>
      !this.ignoredTerms.has(issue.originalBrand.toLowerCase())
    );

    if (filteredIssues.length > 0) {
      this.showInlineNotifications(field, filteredIssues);
    } else {
      this.removeInlineNotifications(field);
    }
  }

  // Ask AI to check if an artist name is misspelled
  async checkArtistNameWithAI(artistName, apiManager) {
    const prompt = `Kontrollera om detta konstnärs-/formgivarnamn är korrekt stavat:
"${artistName}"

Kontrollera:
1. Stavfel i för- eller efternamn (t.ex. "christan" → "Christian", "Beijar" → "Beijer")
2. Korrekt versalisering (t.ex. "christan beijer" → "Christian Beijer")
3. Vanliga namnförväxlingar

VIKTIGT: Om namnet ser korrekt ut, svara med corrected: null.
Svara BARA om du är SÄKER på korrekt stavning.

Svara ENDAST med JSON:
{"corrected":"Korrekt Stavat Namn","confidence":0.95}
Om korrekt: {"corrected":null}`;

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: apiManager.apiKey,
          body: {
            model: 'claude-haiku-4-5',
            max_tokens: 150,
            temperature: 0,
            system: 'Du är expert på konstnärs- och formgivarnamn inom skandinavisk konst och design. Svara med valid JSON.',
            messages: [{ role: 'user', content: prompt }]
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response?.success) {
            resolve(response);
          } else {
            reject(new Error('Artist name AI check failed'));
          }
        });
      });

      if (response.success && response.data?.content?.[0]?.text) {
        const text = response.data.content[0].text.trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          if (result.corrected && result.corrected.toLowerCase() !== artistName.toLowerCase()) {
            return {
              originalBrand: artistName,
              suggestedBrand: result.corrected,
              confidence: result.confidence || 0.9,
              type: 'artist_spelling',
              displayCategory: 'konstnärsnamn'
            };
          }
        }
      }
    } catch (error) {
      // Silently fail — capitalization check still works
    }

    return null;
  }

  // Create spell markers for misspellings
  createSpellMarkers(field, markerContainer, text, issues) {
    // Clear existing markers
    markerContainer.innerHTML = '';

    const fieldStyles = getComputedStyle(field);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas font to match field
    ctx.font = `${fieldStyles.fontSize} ${fieldStyles.fontFamily}`;

    issues.forEach(issue => {
      const originalBrand = issue.originalBrand;
      const suggestedBrand = issue.suggestedBrand;
      
      // Find word position in text
      const wordIndex = text.toLowerCase().indexOf(originalBrand.toLowerCase());
      if (wordIndex === -1) return;

      // Calculate text metrics
      const beforeText = text.substring(0, wordIndex);
      const wordText = text.substring(wordIndex, wordIndex + originalBrand.length);
      
      const beforeWidth = ctx.measureText(beforeText).width;
      const wordWidth = ctx.measureText(wordText).width;

      // Create marker element
      const marker = document.createElement('div');
      marker.className = `spelling-marker ${issue.type}-error`;
      marker.dataset.original = originalBrand;
      marker.dataset.suggested = suggestedBrand;
      marker.dataset.confidence = issue.confidence;
      marker.dataset.category = issue.category;
      marker.dataset.type = issue.type;
      marker.dataset.displayCategory = issue.displayCategory;
      
      // Calculate position including field padding
      const paddingLeft = parseInt(fieldStyles.paddingLeft) || 0;
      const paddingTop = parseInt(fieldStyles.paddingTop) || 0;
      
      marker.style.cssText = `
        position: absolute;
        left: ${paddingLeft + beforeWidth}px;
        top: ${paddingTop}px;
        width: ${wordWidth}px;
        height: ${parseInt(fieldStyles.fontSize) + 4}px;
        pointer-events: auto;
        cursor: pointer;
        z-index: 1001;
        border-bottom: 3px wavy ${issue.type === 'brand' ? '#d32f2f' : '#e65100'};
        background: rgba(${issue.type === 'brand' ? '244, 67, 54' : '255, 152, 0'}, 0.25);
        border-radius: 3px;
      `;

      // Add event listeners
      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showCorrectionTooltip(marker, field);
      });
      
      marker.addEventListener('mouseenter', (e) => {
        this.showCorrectionTooltip(marker, field);
      });

      markerContainer.appendChild(marker);
    });

  }

  // Show persistent inline notifications below the field
  showInlineNotifications(field, issues) {
    this.removeInlineNotifications(field);

    const container = document.createElement('div');
    container.className = 'brand-inline-notifications';
    container.style.cssText = 'margin-top: 4px; margin-bottom: 10px;';

    // Detect if we're in a narrow context (artist field column)
    const fieldInfo = this.monitoredFields.get(field);
    const isArtistField = fieldInfo?.type === 'artist';

    issues.forEach(issue => {
      const notification = document.createElement('div');
      notification.className = 'brand-inline-notification';

      const confidence = Math.round((issue.confidence || 0) * 100);
      const categoryText = issue.displayCategory || 'märke';

      notification.innerHTML = `
        <span class="brand-notif-text">
          Menade du <strong>"${escapeHTML(issue.suggestedBrand)}"</strong>?
          <span class="brand-notif-meta">(${confidence}%, ${escapeHTML(categoryText)})</span>
        </span>
        <span class="brand-notif-actions">
          <button class="brand-notif-fix" type="button">Rätta</button>
          <button class="brand-notif-ignore" type="button">Ignorera</button>
        </span>
      `;

      const fixBtn = notification.querySelector('.brand-notif-fix');
      fixBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.applyCorrection(field, issue.originalBrand, issue.suggestedBrand);
      });

      const ignoreBtn = notification.querySelector('.brand-notif-ignore');
      ignoreBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Add to session ignore list so it doesn't come back
        this.ignoredTerms.add(issue.originalBrand.toLowerCase());
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.2s ease';
        setTimeout(() => notification.remove(), 200);
      });

      container.appendChild(notification);
    });

    // Tag with field ID so removeInlineNotifications removes the right one
    const fieldId = field.id || field.name || fieldInfo?.type || '';
    container.dataset.fieldId = fieldId;

    // Insert after the field's wrapper (or the field itself)
    const wrapper = field.closest('.brand-spell-wrapper') || field;
    wrapper.parentNode.insertBefore(container, wrapper.nextSibling);
  }

  // Remove inline notifications for a specific field
  removeInlineNotifications(field) {
    const fieldInfo = this.monitoredFields.get(field);
    const fieldId = field.id || field.name || fieldInfo?.type || '';
    const wrapper = field.closest('.brand-spell-wrapper') || field;
    // Find the notification container for THIS specific field
    const existing = wrapper.parentNode?.querySelector(`.brand-inline-notifications[data-field-id="${fieldId}"]`);
    if (existing) existing.remove();
  }

  // Show correction tooltip
  showCorrectionTooltip(element, field) {
    // Hide existing tooltip
    this.hideTooltip();

    const original = element.dataset.original;
    const suggested = element.dataset.suggested;
    const confidence = Math.round(parseFloat(element.dataset.confidence) * 100);
    const category = element.dataset.category;

    const categoryMap = {
      watches: 'klockfabrikat',
      glass: 'glasmärke', 
      ceramics: 'keramikmärke',
      furniture: 'möbelmärke',
      luxury: 'lyxmärke',
      unknown: 'märke'
    };

    const categoryText = element.dataset.displayCategory || categoryMap[category] || 'märke';

    const errorType = element.dataset.type;
    const headerText = errorType === 'brand' ? 'MÖJLIGT MÄRKESFEL' : 'MÖJLIGT STAVFEL';
    
    // Create tooltip
    const tooltip = document.createElement('div');
    tooltip.className = `brand-correction-tooltip ${errorType}-tooltip`;
    tooltip.innerHTML = `
      <div class="tooltip-header">
        <strong>${headerText}</strong>
        <button class="tooltip-close" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
      <div class="tooltip-content">
        <div class="correction-text">
          "${escapeHTML(original)}" → föreslår "<strong>${escapeHTML(suggested)}</strong>" 
          <br><small>(${confidence}% säkerhet, ${escapeHTML(categoryText)})</small>
        </div>
        <button class="correction-button" onclick="this.closest('.brand-correction-tooltip').dispatchEvent(new CustomEvent('correct'))">
          Uppdatera
        </button>
      </div>
    `;

    // Position tooltip
    const elementRect = element.getBoundingClientRect();
    tooltip.style.cssText = `
      position: fixed;
      left: ${elementRect.left}px;
      top: ${elementRect.bottom + 8}px;
      z-index: 10001;
      background: white;
      border: 1px solid #ddd;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      max-width: 280px;
      animation: tooltipFadeIn 0.2s ease-out;
    `;

    // Add correction handler
    tooltip.addEventListener('correct', () => {
      this.applyCorrection(field, original, suggested);
      this.hideTooltip();
    });

    document.body.appendChild(tooltip);
    this.activeTooltip = tooltip;

    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (this.activeTooltip === tooltip) {
        this.hideTooltip();
      }
    }, 5000);

  }

  // Apply correction to field
  applyCorrection(field, original, suggested) {
    const currentValue = field.value;
    
    // Create case-insensitive regex to find the word regardless of current case
    const regex = new RegExp(`\\b${this.escapeRegex(original)}\\b`, 'gi');
    const correctedValue = currentValue.replace(regex, suggested);
    
    field.value = correctedValue;
    
    // Clear inline notifications
    this.removeInlineNotifications(field);
    
    // Hide any active tooltip
    this.hideTooltip();
    
    // Trigger events
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    
    // Show success feedback
    this.showSuccessAnimation(field, `Rättat till "${suggested}"`);
    
    // Re-validate after correction to check for remaining issues
    setTimeout(() => {
      const fieldInfo = this.monitoredFields.get(field);
      if (fieldInfo) {
        this.validateFieldContent(field, null, fieldInfo.type);
      }
    }, 1500); // Longer delay for AI call to complete

  }

  // Show success animation
  showSuccessAnimation(field, message) {
    const successDiv = document.createElement('div');
    successDiv.innerHTML = `✓ ${escapeHTML(message)}`;
    successDiv.style.cssText = `
      position: fixed;
      left: ${field.getBoundingClientRect().left}px;
      top: ${field.getBoundingClientRect().top - 30}px;
      background: #4caf50;
      color: white;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      z-index: 10002;
      animation: successSlideUp 2s ease-out forwards;
    `;

    document.body.appendChild(successDiv);

    setTimeout(() => {
      if (successDiv.parentElement) {
        successDiv.parentElement.removeChild(successDiv);
      }
    }, 2000);
  }

  // Hide active tooltip
  hideTooltip() {
    if (this.activeTooltip) {
      this.activeTooltip.remove();
      this.activeTooltip = null;
    }
  }

  // Add required CSS styles
  addInlineStyles() {
    if (document.getElementById('inline-brand-validator-styles')) return;

    const style = document.createElement('style');
    style.id = 'inline-brand-validator-styles';
    style.textContent = `
      .brand-spell-wrapper {
        position: relative !important;
        display: inline-block;
        width: 100%;
      }
      
      .brand-spell-markers {
        pointer-events: none;
        user-select: none;
      }
      
      .spelling-marker {
        transition: all 0.2s ease;
      }
      
      .spelling-marker:hover {
        background: rgba(244, 67, 54, 0.35) !important;
      }
      
      .spelling-error:hover {
        background: rgba(255, 152, 0, 0.35) !important;
      }
      
      .spelling-tooltip .tooltip-header {
        color: #f57c00 !important;
      }
      
      .brand-correction-tooltip .tooltip-header {
        background: #f5f5f5;
        padding: 8px 12px;
        border-bottom: 1px solid #eee;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: 600;
        color: #d32f2f;
        border-radius: 8px 8px 0 0;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      .brand-correction-tooltip .tooltip-close {
        background: none;
        border: none;
        font-size: 16px;
        cursor: pointer;
        color: #999;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .brand-correction-tooltip .tooltip-close:hover {
        color: #666;
      }
      
      .brand-correction-tooltip .tooltip-content {
        padding: 12px;
      }
      
      .brand-correction-tooltip .correction-text {
        margin-bottom: 10px;
        line-height: 1.4;
      }
      
      .brand-correction-tooltip .correction-button {
        background: #1976d2;
        color: white;
        border: none;
        padding: 6px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        width: 100%;
        transition: background 0.2s ease;
      }
      
      .brand-correction-tooltip .correction-button:hover {
        background: #1565c0;
      }
      
      /* Gentle inline suggestion below field */
      .brand-inline-notifications {
        display: block;
        width: 100%;
        box-sizing: border-box;
      }
      .brand-inline-notification {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 8px;
        padding: 6px 10px;
        margin-top: 3px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #64748b;
        line-height: 1.4;
        animation: brandNotifFadeIn 0.3s ease-out;
        width: 100%;
        box-sizing: border-box;
      }
      .brand-notif-text {
        flex: 1 1 auto;
        min-width: 0;
      }
      .brand-notif-text strong {
        color: #334155;
      }
      .brand-notif-meta {
        color: #94a3b8;
        font-size: 11px;
      }
      .brand-notif-actions {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }
      .brand-notif-fix {
        flex-shrink: 0;
        background: #1976d2;
        color: white;
        border: 1px solid #1976d2;
        padding: 3px 12px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
        font-family: inherit;
      }
      .brand-notif-fix:hover {
        background: #1565c0;
        border-color: #1565c0;
      }
      .brand-notif-ignore {
        flex-shrink: 0;
        background: transparent;
        color: #94a3b8;
        border: none;
        padding: 3px 6px;
        font-size: 11px;
        cursor: pointer;
        transition: color 0.15s;
        font-family: inherit;
      }
      .brand-notif-ignore:hover {
        color: #475569;
      }
      @keyframes brandNotifFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes tooltipFadeIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      @keyframes successSlideUp {
        0% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-20px); }
      }
    `;

    document.head.appendChild(style);
  }

  // Detect if a word is likely a proper name in context (person name, place name)
  isLikelyProperName(word, fullText) {
    if (!word || word.length < 2) return false;
    
    // Check if preceded by an initial (e.g., "E. Jarup" → "Jarup" is a proper name)
    const escapedWord = this.escapeRegex(word);
    const initialPattern = new RegExp(`[A-ZÅÄÖÜ]\\.\\s*${escapedWord}`, 'i');
    if (initialPattern.test(fullText)) return true;
    
    // Check if the word itself starts with uppercase (Title Case) and is not ALL CAPS
    if (/^[A-ZÅÄÖÜ][a-zåäöü]/.test(word)) {
      // In a comma-separated auction title, capitalized words after commas are often proper names
      const afterCommaPattern = new RegExp(`,\\s*${escapedWord}\\b`);
      if (afterCommaPattern.test(fullText)) return true;
      
      // Check if next to another capitalized word → person name pattern
      const namePattern = new RegExp(`[A-ZÅÄÖÜ][a-zåäöü]+\\s+${escapedWord}\\b|${escapedWord}\\s+[A-ZÅÄÖÜ][a-zåäöü]+`);
      if (namePattern.test(fullText)) return true;
    }
    
    return false;
  }
  
  // Check if two words differ only in diacritical marks (a↔ä, o↔ö, u↔ü)
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

  // Helper method to escape regex
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Stop monitoring (cleanup)
  stopMonitoring() {
    this.monitoredFields.clear();
    this.hideTooltip();
    
    // Clean up wrappers and markers
    const wrappers = document.querySelectorAll('.brand-spell-wrapper');
    wrappers.forEach(wrapper => {
      const field = wrapper.querySelector('input, textarea');
      const markerContainer = wrapper.querySelector('.brand-spell-markers');
      
      if (field && markerContainer) {
        // Restore original parent position
        const originalPosition = markerContainer.dataset.originalParentPosition;
        if (originalPosition) {
          wrapper.parentElement.style.position = originalPosition;
        }
        
        // Move field back to original parent
        wrapper.parentElement.insertBefore(field, wrapper);
      }
      
      // Remove wrapper
      wrapper.remove();
    });
    
  }

  // Manually trigger validation for all monitored fields
  validateAllFields() {
    
    this.monitoredFields.forEach((fieldInfo, field) => {
      if (field.value && field.value.trim().length > 0) {
        const markerContainer = field.parentElement.querySelector('.brand-spell-markers');
        if (markerContainer) {
          this.validateFieldContent(field, markerContainer, fieldInfo.type);
        }
      }
    });
  }

  // Get current validation results for all fields
  getCurrentErrors() {
    const errors = [];
    
    this.monitoredFields.forEach((fieldInfo, field) => {
      const markers = field.parentElement.querySelectorAll('.spelling-marker');
      markers.forEach(marker => {
        errors.push({
          field: fieldInfo.type,
          original: marker.dataset.original,
          suggested: marker.dataset.suggested,
          confidence: parseFloat(marker.dataset.confidence),
          category: marker.dataset.category
        });
      });
    });
    
    return errors;
  }

  // Debug information
  debug() {
    
    // Log field contents
    this.monitoredFields.forEach((fieldInfo, field) => {
    });
  }
} 