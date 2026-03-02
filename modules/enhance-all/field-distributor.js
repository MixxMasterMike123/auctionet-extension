// modules/enhance-all/field-distributor.js — Writes AI results to form fields
// Handles field updates, undo tracking, change events, and quality re-analysis

export class FieldDistributor {
  constructor() {
    this.originalValues = new Map(); // fieldType → original value for undo
    this.qualityAnalyzer = null;
    this.uiManager = null;
  }

  setQualityAnalyzer(qualityAnalyzer) {
    this.qualityAnalyzer = qualityAnalyzer;
  }

  setUIManager(uiManager) {
    this.uiManager = uiManager;
  }

  // Field selectors
  static FIELD_MAP = {
    title: '#item_title_sv',
    description: '#item_description_sv',
    condition: '#item_condition_sv',
    keywords: '#item_hidden_keywords'
  };

  /**
   * Apply accepted enhancement results to form fields
   * @param {object} result — the AI enhancement result
   * @param {object} acceptedFields — { title: bool, description: bool, condition: bool, keywords: bool }
   */
  applyResults(result, acceptedFields) {
    const applied = [];

    if (acceptedFields.title && result.title) {
      this._applyField('title', result.title);
      applied.push('title');
    }

    if (acceptedFields.description && result.description) {
      this._applyField('description', result.description);
      applied.push('description');
    }

    if (acceptedFields.condition && result.condition) {
      this._applyField('condition', result.condition);
      applied.push('condition');
    }

    if (acceptedFields.keywords && result.keywords) {
      this._applyKeywords(result.keywords);
      applied.push('keywords');
    }

    // Trigger quality re-analysis after all fields are updated
    if (applied.length > 0) {
      this._triggerReanalysis();
    }

    console.log(`[FieldDistributor] Applied ${applied.length} fields:`, applied);
    return applied;
  }

  /**
   * Apply a single field value
   */
  _applyField(fieldType, value) {
    const selector = FieldDistributor.FIELD_MAP[fieldType];
    const field = document.querySelector(selector);
    if (!field) {
      console.warn(`[FieldDistributor] Field not found: ${selector}`);
      return;
    }

    // Store original for undo
    this.originalValues.set(fieldType, field.value);

    // Strip unknown artist terms
    let finalValue = this._stripUnknownArtistTerms(value);

    // Apply with animation
    field.classList.add('ai-updated');
    field.value = finalValue;

    // Auto-resize textarea
    if (field.tagName.toLowerCase() === 'textarea') {
      setTimeout(() => this._autoResizeTextarea(field), 50);
    }

    // Trigger change event for live quality monitoring
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Apply keywords — space-separated per Auctionet convention
   * Merges with existing keywords, removes duplicates
   */
  _applyKeywords(newKeywords) {
    const field = document.querySelector(FieldDistributor.FIELD_MAP.keywords);
    if (!field) return;

    // Store original
    this.originalValues.set('keywords', field.value);

    const existing = field.value.trim();

    if (existing) {
      // Merge: combine existing (space-separated) with new, remove duplicates
      const existingSet = new Set(
        existing.split(/\s+/).map(kw => kw.toLowerCase()).filter(kw => kw.length > 0)
      );
      const newKws = newKeywords.split(/\s+/).filter(kw => kw.length > 0);
      const uniqueNew = newKws.filter(kw => !existingSet.has(kw.toLowerCase()));

      field.value = uniqueNew.length > 0
        ? existing + ' ' + uniqueNew.join(' ')
        : existing;
    } else {
      field.value = newKeywords;
    }

    field.classList.add('ai-updated');
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /**
   * Undo all applied fields
   */
  undoAll() {
    for (const [fieldType, originalValue] of this.originalValues) {
      const selector = FieldDistributor.FIELD_MAP[fieldType];
      const field = document.querySelector(selector);
      if (field) {
        field.value = originalValue;
        field.classList.remove('ai-updated');
        if (field.tagName.toLowerCase() === 'textarea') {
          setTimeout(() => this._autoResizeTextarea(field), 50);
        }
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    this.originalValues.clear();
    this._triggerReanalysis();
  }

  /**
   * Undo a single field
   */
  undoField(fieldType) {
    const originalValue = this.originalValues.get(fieldType);
    if (originalValue === undefined) return;

    const selector = FieldDistributor.FIELD_MAP[fieldType];
    const field = document.querySelector(selector);
    if (field) {
      field.value = originalValue;
      field.classList.remove('ai-updated');
      if (field.tagName.toLowerCase() === 'textarea') {
        setTimeout(() => this._autoResizeTextarea(field), 50);
      }
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
    this.originalValues.delete(fieldType);
    this._triggerReanalysis();
  }

  /**
   * Check if we have undo data
   */
  hasUndoData() {
    return this.originalValues.size > 0;
  }

  // ─── Helpers ───

  _triggerReanalysis() {
    // Small delay to let change events propagate
    setTimeout(() => {
      if (this.qualityAnalyzer?.analyzeQuality) {
        this.qualityAnalyzer.analyzeQuality();
      }
    }, 300);
  }

  _autoResizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    const newHeight = Math.min(Math.max(textarea.scrollHeight, 60), 400);
    textarea.style.height = newHeight + 'px';
  }

  _stripUnknownArtistTerms(text) {
    if (!text) return text;
    return text
      .replace(/\b(okänd|oidentifierad)\s*(konstnär|formgivare|maker|designer)\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
}
