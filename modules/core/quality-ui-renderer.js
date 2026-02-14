/**
 * Quality UI Renderer - SSoT Component
 * Extracted from quality-analyzer.js
 * Handles quality indicator updates, inline FAQ hints, condition suggestions
 */
import { escapeHTML } from './html-escape.js';

export class QualityUIRenderer {
  constructor(circularProgressManager) {
    this.circularProgressManager = circularProgressManager;
    this.apiManager = null;

    // Condition suggestion state
    this._aiConditionSuggestions = null;
    this._aiConditionSuggestionsCategory = null;
    this._conditionSuggestionsLoading = false;

    // Callbacks to parent orchestrator
    this._onSetupIgnoreArtistHandlers = null;
    this._onReanalyze = null;
  }

  /**
   * Set API manager for AI condition suggestions
   */
  setApiManager(apiManager) {
    this.apiManager = apiManager;
  }

  /**
   * Set callbacks for parent orchestrator interactions
   */
  setCallbacks({ onSetupIgnoreArtistHandlers, onReanalyze }) {
    this._onSetupIgnoreArtistHandlers = onSetupIgnoreArtistHandlers;
    this._onReanalyze = onReanalyze;
  }

  /**
   * Update the quality indicator circular progress and warning list
   */
  updateQualityIndicator(score, warnings, shouldAnimate = false) {
    const qualityIndicator = document.querySelector('.quality-indicator');
    if (qualityIndicator) {
      this.circularProgressManager.createQualityCircles(qualityIndicator, score, warnings, shouldAnimate);
    }

    const warningsElement = document.querySelector('.quality-warnings');

    if (warningsElement) {
      // Filter out brand warnings — these are handled inline in the title field
      const displayWarnings = warnings.filter(w => !w.isBrandWarning);

      if (displayWarnings.length > 0) {
        const warningItems = displayWarnings.map((w, warningIndex) => {
          let issue = w.issue;

          if (!issue) {
            issue = w.message || 'Ingen information tillgänglig';
          }

          let dataAttrs = '';
          if (w.dataAttributes) {
            Object.entries(w.dataAttributes).forEach(([key, value]) => {
              dataAttrs += ` ${key}="${escapeHTML(value)}"`;
            });
          }

          return `<li class="warning-${escapeHTML(w.severity)}" ${dataAttrs}>
            <strong>${escapeHTML(w.field)}:</strong> 
            <span class="issue-text">${escapeHTML(issue)}</span>
          </li>`;
        }).join('');

        warningsElement.innerHTML = `<ul>${warningItems}</ul>`;

        // Store warning data on DOM elements for handlers to access
        displayWarnings.forEach((warning, index) => {
          const warningItem = warningsElement.querySelectorAll('li')[index];
          if (warningItem) {
            warningItem.warningData = warning;
          }
        });

        // Set up artist detection handlers after DOM is updated
        if (this._onSetupIgnoreArtistHandlers) {
          setTimeout(() => {
            this._onSetupIgnoreArtistHandlers();
          }, 100);
        }
      } else {
        warningsElement.innerHTML = '<p class="no-warnings">✓ Utmärkt katalogisering!</p>';
      }
    }
  }

  /**
   * Get hardcoded condition suggestion pool by category
   */
  getHardcodedConditionPool(category) {
    const cat = (category || '').toLowerCase();

    if (cat.includes('konst') || cat.includes('tavl') || cat.includes('målning') || cat.includes('grafik')) {
      return [
        'Sedvanligt slitage', 'Craquelure', 'Färgbortfall', 'Ej examinerad ur ram',
        'Mindre retuscher', 'Sprickor i fernissan', 'Gulnad fernissa', 'Dukskador',
        'Ramslitage', 'Smärre färgförluster', 'Solblekning', 'Ytliga repor i fernissan'
      ];
    }
    if (cat.includes('möbler')) {
      return [
        'Repor och märken', 'Slitage vid kanter och hörn', 'Mindre lackskador',
        'Ytslitage på sitsen', 'Fläckar och märken', 'Nagg vid kanter',
        'Slitage på ben och kanter', 'Mindre repor i ytan', 'Skavmärken',
        'Lossnade fogar', 'Slitage vid handtag', 'Ytliga rispor'
      ];
    }
    if (cat.includes('silver') || cat.includes('guld')) {
      return [
        'Sedvanligt slitage', 'Mindre bucklor', 'Ytliga repor', 'Patina',
        'Gravyr delvis sliten', 'Mindre hack', 'Lödningar synliga',
        'Slitage på kanter', 'Putsrepor', 'Stämplar delvis otydliga',
        'Monogram', 'Smärre bucklor och repor'
      ];
    }
    if (cat.includes('glas') || cat.includes('porslin') || cat.includes('keramik') || cat.includes('servis')) {
      return [
        'Nagg', 'Nagg vid kanter', 'Glasyrsprickor', 'Hårspricka',
        'Mindre nagg vid foten', 'Slipning vid mynning', 'Repor i glaset',
        'Krakelering', 'Mindre flisning', 'Nagg och småflisor',
        'Slitage på dekor', 'Mindre missfärgning'
      ];
    }
    return [
      'Repor och märken', 'Ytslitage, nagg vid kanter', 'Mindre repor och bruksmärken',
      'Sedvanligt slitage', 'Slitage och mindre repor', 'Ytliga repor, mindre märken',
      'Nagg och mindre lackskador', 'Mindre slitage, repor', 'Slitage vid kanter och hörn',
      'Ytslitage och mindre fläckar', 'Bruksmärken och ytliga repor', 'Repor, nagg, mindre fläckar'
    ];
  }

  /**
   * Generate AI-powered condition suggestions
   */
  async generateAIConditionSuggestions(category, title) {
    if (!this.apiManager) return;
    if (this._conditionSuggestionsLoading) return;

    this._conditionSuggestionsLoading = true;
    try {
      const result = await this.apiManager.callClaudeAPI({
        title: title || '',
        description: `Generera exakt 15 korta, realistiska konditionsbeskrivningar för svenska auktionsföremål i kategorin "${category}". 
Varje förslag ska vara 2-5 ord. Skriv ETT förslag per rad, utan numrering eller punkter.
Undvik "bruksslitage". Fokusera på specifika skador: repor, nagg, fläckar, sprickor, slitage vid specifika delar.
Anpassa förslagen till kategorin "${category}".`,
        condition: '',
        artist: '',
        keywords: '',
        category: category
      }, 'biography');

      if (result && result.biography) {
        const suggestions = result.biography
          .split('\n')
          .map(s => s.trim())
          .filter(s => s.length > 2 && s.length < 60 && !/bruksslitage/i.test(s));

        if (suggestions.length >= 3) {
          this._aiConditionSuggestions = suggestions;
          this._aiConditionSuggestionsCategory = category;
        }
      }
    } catch (error) {
      // Silently fail
    } finally {
      this._conditionSuggestionsLoading = false;
    }
  }

  /**
   * Get condition suggestions (AI-generated preferred, hardcoded fallback)
   */
  getConditionSuggestions(category, count = 3) {
    const catLower = (category || '').toLowerCase();
    if (this._aiConditionSuggestions && this._aiConditionSuggestionsCategory &&
        catLower.includes(this._aiConditionSuggestionsCategory.toLowerCase().split('/')[0].trim().split(' ')[0])) {
      const pool = [...this._aiConditionSuggestions];
      return pool.sort(() => Math.random() - 0.5).slice(0, count);
    }
    const pool = [...this.getHardcodedConditionPool(category)];
    return pool.sort(() => Math.random() - 0.5).slice(0, count);
  }

  /**
   * Render inline FAQ hints below form fields that have guideline violations.
   * Uses a warm amber style to be friendly and non-intrusive.
   */
  renderInlineHints(warnings) {
    const faqWarnings = warnings.filter(w => w.source === 'faq' && w.fieldId);

    const hintsByField = {};
    faqWarnings.forEach(w => {
      if (!hintsByField[w.fieldId]) hintsByField[w.fieldId] = [];
      hintsByField[w.fieldId].push(w);
    });

    const allFieldIds = ['item_title_sv', 'item_description_sv', 'item_condition_sv', 'item_hidden_keywords'];

    allFieldIds.forEach(fieldId => {
      const field = document.querySelector(`#${fieldId}`);
      if (!field) return;

      const existingHint = field.parentNode.querySelector(`.faq-hint[data-for="${fieldId}"]`);

      if (!hintsByField[fieldId] || hintsByField[fieldId].length === 0) {
        if (existingHint) existingHint.remove();
        return;
      }

      const hintStyle = 'padding:5px 10px;margin:2px 0;border-left:3px solid #f59e0b;background:#fffbeb;color:#92400e;font-size:11px;line-height:1.5;letter-spacing:0.3px;word-spacing:1px;border-radius:0 3px 3px 0;font-style:italic;opacity:0.85;';
      const hintsHtml = hintsByField[fieldId]
        .map(w => {
          let extra = '';
          if (w.woodTypeSuggestion) {
            const woodChips = ['Ek', 'Björk', 'Furu', 'Teak', 'Mahogny', 'Valnöt', 'Bok', 'Ask', 'Tall', 'Alm', 'Palisander', 'Fanér'];
            const chipStyle = 'display:inline-block;margin:3px 4px 0 0;padding:2px 8px;background:#fff;border:1px solid #f59e0b;border-radius:10px;color:#92400e;font-size:10px;font-style:normal;cursor:pointer;text-decoration:none;transition:background 0.15s;';
            extra = '<div style="margin-top:4px;">' +
              woodChips.map(w => `<a class="wood-type-chip" data-value="${w}" style="${chipStyle}" onmouseover="this.style.background='#fef3c7'" onmouseout="this.style.background='#fff'">${w}</a>`).join('') +
              '</div>';
          }
          if (w.vagueCondition) {
            const category = document.querySelector('#item_category_id option:checked')?.textContent || '';
            const suggestions = this.getConditionSuggestions(category, 3);
            const chipStyle = 'display:inline-block;margin:3px 4px 0 0;padding:2px 8px;background:#fff;border:1px solid #f59e0b;border-radius:10px;color:#92400e;font-size:10px;font-style:normal;cursor:pointer;text-decoration:none;transition:background 0.15s;';
            const refreshStyle = 'background:none;border:none;color:#b08840;font-size:10px;font-style:normal;cursor:pointer;text-decoration:underline;text-underline-offset:2px;transition:color 0.15s;white-space:nowrap;';
            const replaceAttr = w.inlineReplace ? ` data-replace="${w.inlineReplace}"` : '';
            const aiLabel = this._aiConditionSuggestions ? ' title="Anpassade förslag"' : ' title="Klicka for nya forslag"';
            const noteHtml = w.extraNote ? `<div style="margin-top:6px;font-size:10px;font-style:italic;color:#78716c;">💡 ${w.extraNote}</div>` : '';
            const refreshLink = `<a class="condition-refresh-btn"${aiLabel} style="${refreshStyle}" onmouseover="this.style.color='#92400e'" onmouseout="this.style.color='#b08840'">Nya forslag</a>`;
            extra = '<div style="margin-top:4px;">' +
              '<div>' +
              suggestions.map(s => `<a class="condition-suggestion-chip" data-value="${s}"${replaceAttr} style="${chipStyle}" onmouseover="this.style.background='#fef3c7'" onmouseout="this.style.background='#fff'">${s}</a>`).join('') +
              '</div>' +
              noteHtml +
              '</div>';

            if (!this._aiConditionSuggestions && !this._conditionSuggestionsLoading && this.apiManager) {
              this.generateAIConditionSuggestions(category, document.querySelector('#item_title_sv')?.value || '');
            }
            return `<div style="${hintStyle}"><div style="display:flex;align-items:baseline;justify-content:space-between;"><span>⚠ ${w.issue}</span>${refreshLink}</div>${extra}</div>`;
          }
          return `<div style="${hintStyle}">⚠ ${w.issue}${extra}</div>`;
        })
        .join('');

      if (existingHint) {
        existingHint.innerHTML = hintsHtml;
      } else {
        const hintDiv = document.createElement('div');
        hintDiv.className = 'faq-hint';
        hintDiv.setAttribute('data-for', fieldId);
        hintDiv.style.cssText = 'margin:6px 0 10px 0;padding:0;';
        hintDiv.innerHTML = hintsHtml;

        const helpBlock = field.parentNode.querySelector('.help-block');
        const buttonWrapper = field.parentNode.querySelector('.ai-button-wrapper');
        if (helpBlock) {
          helpBlock.parentNode.insertBefore(hintDiv, helpBlock.nextSibling);
        } else if (buttonWrapper) {
          buttonWrapper.parentNode.insertBefore(hintDiv, buttonWrapper.nextSibling);
        } else {
          field.parentNode.insertBefore(hintDiv, field.nextSibling);
        }
      }

      // Attach click handlers
      const hintContainer = field.parentNode.querySelector(`.faq-hint[data-for="${fieldId}"]`);
      if (hintContainer) {
        const chips = hintContainer.querySelectorAll('.condition-suggestion-chip');
        chips.forEach(chip => {
          chip.addEventListener('click', (e) => {
            e.preventDefault();
            const condField = document.querySelector('#item_condition_sv');
            if (condField) {
              const replaceWord = chip.getAttribute('data-replace');
              const newValue = chip.getAttribute('data-value');
              if (replaceWord) {
                const escaped = replaceWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const pattern = new RegExp(`\\s*${escaped}[\\s.,;]*`, 'i');
                let result = condField.value.replace(pattern, newValue.replace(/\.$/, '') + '. ');
                result = result.replace(/^[\s.,;]+/, '').replace(/[\s.,;]+$/, '.').replace(/\.\s*\./g, '.').trim();
                condField.value = result;
              } else {
                const existing = condField.value.trim();
                if (existing) {
                  const separator = existing.endsWith('.') ? ' ' : '. ';
                  condField.value = existing + separator + newValue;
                } else {
                  condField.value = newValue;
                }
              }
              condField.dispatchEvent(new Event('input', { bubbles: true }));
              condField.focus();
            }
          });
        });

        const woodChips = hintContainer.querySelectorAll('.wood-type-chip');
        woodChips.forEach(chip => {
          chip.addEventListener('click', (e) => {
            e.preventDefault();
            const descField = document.querySelector('#item_description_sv');
            if (descField) {
              const wood = chip.getAttribute('data-value');
              const current = descField.value.trim();
              descField.value = current ? `${wood}. ${current}` : `${wood}.`;
              descField.dispatchEvent(new Event('input', { bubbles: true }));
              descField.focus();
            }
          });
        });

        const refreshBtn = hintContainer.querySelector('.condition-refresh-btn');
        if (refreshBtn) {
          refreshBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (this._onReanalyze) {
              this._onReanalyze();
            }
          });
        }
      }
    });
  }
}
