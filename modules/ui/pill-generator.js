// modules/ui/pill-generator.js - Clean HTML Generation for Pills
// Extracted from dashboard-manager.js to make debugging easier

export class PillGenerator {
  constructor() {
  }

  // SAFE HTML escaping - prevents double-escaping
  escapeHTMLAttribute(value) {
    if (!value) return '';
    
    // Don't double-escape - check if already escaped
    if (value.includes('&quot;') || value.includes('&#39;') || value.includes('&amp;')) {
      return value;
    }
    
    const escaped = value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    return escaped;
  }

  // Generate header pills (desktop-optimized)
  generateHeaderPills(terms, options = {}) {
    
    if (!terms || terms.length === 0) {
      return '<div class="header-pills-placeholder">Inga söktermer tillgängliga</div>';
    }

    // Split into selected and unselected for proper visual hierarchy
    const selectedTerms = terms.filter(term => term.isSelected);
    const unselectedTerms = terms.filter(term => !term.isSelected);

    let html = '<div class="header-pills-container">';

    // Add selected terms first (blue pills)
    selectedTerms.forEach((term, index) => {
      const checkboxId = `header-pill-selected-${index}`;
      const titleText = (term.description || 'Klicka för att ta bort') + ': ' + term.term;
      
      html += `
        <label class="header-pill selected" title="${this.escapeHTMLAttribute(titleText)}">
          <input type="checkbox" 
                 class="smart-checkbox header-checkbox" 
                 value="${this.escapeHTMLAttribute(term.term)}" 
                 data-type="${term.type || 'keyword'}"
                 data-core="${term.isCore || false}"
                 id="${checkboxId}"
                 checked>
          <span class="pill-text">${term.term}</span>
        </label>`;
    });

    // Add unselected terms (max 4 for header space)
    const maxUnselectedInHeader = options.maxUnselected || 4;
    unselectedTerms.slice(0, maxUnselectedInHeader).forEach((term, index) => {
      const checkboxId = `header-pill-unselected-${index}`;
      const titleText = (term.description || 'Klicka för att lägga till') + ': ' + term.term;
      
      html += `
        <label class="header-pill unselected" title="${this.escapeHTMLAttribute(titleText)}">
          <input type="checkbox" 
                 class="smart-checkbox header-checkbox" 
                 value="${this.escapeHTMLAttribute(term.term)}" 
                 data-type="${term.type || 'keyword'}"
                 data-core="${term.isCore || false}"
                 id="${checkboxId}">
          <span class="pill-text">${term.term}</span>
        </label>`;
    });

    // Add expand indicator if there are more terms
    const remainingCount = unselectedTerms.length - maxUnselectedInHeader;
    if (remainingCount > 0) {
      html += `
        <button class="header-expand-btn" type="button" title="Visa ${remainingCount} fler söktermer">
          +${remainingCount}
        </button>`;
    }

    html += '</div>';
    
    return html;
  }

  // Generate compact pills for dashboard
  generateCompactPills(terms, options = {}) {
    
    if (!terms || terms.length === 0) {
      return '<div class="compact-pills-placeholder">Inga söktermer tillgängliga</div>';
    }

    // Split terms
    const selectedTerms = terms.filter(term => term.isSelected);
    const unselectedTerms = terms.filter(term => !term.isSelected);

    let html = `
      <div class="ultra-compact-floating-header">
        <div class="floating-search-bar">
          <span class="search-icon">🔍</span>
          <div class="compact-terms-container">
            <div class="selected-terms">`;

    // Add selected terms
    selectedTerms.forEach((term, index) => {
      const checkboxId = `compact-pill-selected-${index}`;
      const titleText = term.description + ': ' + term.term;
      
      html += `
        <label class="compact-term-pill selected" title="${this.escapeHTMLAttribute(titleText)}">
          <input type="checkbox" 
                 class="smart-checkbox" 
                 value="${this.escapeHTMLAttribute(term.term)}" 
                 data-type="${term.type || 'keyword'}"
                 data-core="${term.isCore || false}"
                 id="${checkboxId}"
                 checked>
          <span class="term-text">${term.term}</span>
        </label>`;
    });

    html += `
            </div>
            <div class="term-separator">|</div>
            <div class="unselected-terms">`;

    // Add unselected terms (max 3 for compact space)
    const maxUnselected = options.maxUnselected || 3;
    unselectedTerms.slice(0, maxUnselected).forEach((term, index) => {
      const checkboxId = `compact-pill-unselected-${index}`;
      const titleText = term.description + ': ' + term.term;
      
      html += `
        <label class="compact-term-pill unselected" title="${this.escapeHTMLAttribute(titleText)}">
          <input type="checkbox" 
                 class="smart-checkbox" 
                 value="${this.escapeHTMLAttribute(term.term)}" 
                 data-type="${term.type || 'keyword'}"
                 data-core="${term.isCore || false}"
                 id="${checkboxId}">
          <span class="term-text">${term.term}</span>
        </label>`;
    });

    // Add more indicator if needed
    const remainingCount = unselectedTerms.length - maxUnselected;
    if (remainingCount > 0) {
      html += `
        <button class="more-terms-btn" type="button" title="Visa ${remainingCount} fler söktermer">
          +${remainingCount} fler →
        </button>`;
    }

    html += `
            </div>
          </div>
          <div class="search-status-mini">
            <span class="loading-indicator" id="filter-loading" style="display: none;">🔄</span>
          </div>
        </div>
      </div>`;

    return html;
  }

  // Generate expanded pills (show all terms)
  generateExpandedPills(terms, options = {}) {
    
    if (!terms || terms.length === 0) {
      return '<div class="expanded-pills-placeholder">Inga söktermer tillgängliga</div>';
    }

    // Split terms
    const selectedTerms = terms.filter(term => term.isSelected);
    const unselectedTerms = terms.filter(term => !term.isSelected);

    let html = '';

    // Add ALL selected terms first
    selectedTerms.forEach((term, index) => {
      const checkboxId = `expanded-pill-selected-${index}`;
      const titleText = (term.description || 'Klicka för att ta bort') + ': ' + term.term;
      
      html += `
        <label class="header-pill selected" title="${this.escapeHTMLAttribute(titleText)}">
          <input type="checkbox" 
                 class="smart-checkbox header-checkbox" 
                 value="${this.escapeHTMLAttribute(term.term)}" 
                 data-type="${term.type || 'keyword'}"
                 data-core="${term.isCore || false}"
                 id="${checkboxId}"
                 checked>
          <span class="pill-text">${term.term}</span>
        </label>`;
    });

    // Add ALL unselected terms
    unselectedTerms.forEach((term, index) => {
      const checkboxId = `expanded-pill-unselected-${index}`;
      const titleText = (term.description || 'Klicka för att lägga till') + ': ' + term.term;
      
      html += `
        <label class="header-pill unselected" title="${this.escapeHTMLAttribute(titleText)}">
          <input type="checkbox" 
                 class="smart-checkbox header-checkbox" 
                 value="${this.escapeHTMLAttribute(term.term)}" 
                 data-type="${term.type || 'keyword'}"
                 data-core="${term.isCore || false}"
                 id="${checkboxId}">
          <span class="pill-text">${term.term}</span>
        </label>`;
    });

    // Add collapse button
    html += `
      <button class="header-collapse-btn" type="button" title="Visa färre söktermer">
        ← Färre
      </button>`;

    return html;
  }

  // CRITICAL: Filter conflicting terms (fix "Anna" vs "Anna Ehrner" issue)
  filterConflictingTerms(terms) {
    
    if (!terms || terms.length === 0) return terms;

    const filtered = [];
    const seenTerms = new Set();

    // Sort by priority (highest first) to prefer important terms
    const sortedTerms = [...terms].sort((a, b) => (b.priority || 0) - (a.priority || 0));

    for (const term of sortedTerms) {
      const termLower = term.term.toLowerCase().replace(/['"]/g, '');
      
      // Check for conflicts with existing terms
      let hasConflict = false;
      for (const existingTerm of filtered) {
        const existingLower = existingTerm.term.toLowerCase().replace(/['"]/g, '');
        
        // Skip if this is a subset of an existing term
        if (existingLower.includes(termLower) && existingLower !== termLower) {
          hasConflict = true;
          break;
        }
        
        // Skip if an existing term is a subset of this term, remove the existing one
        if (termLower.includes(existingLower) && existingLower !== termLower) {
          const existingIndex = filtered.findIndex(t => t.term === existingTerm.term);
          filtered.splice(existingIndex, 1);
          break;
        }
      }

      if (!hasConflict) {
        filtered.push(term);
        seenTerms.add(termLower);
      }
    }

    
    return filtered;
  }

  // Validate generated HTML
  validateHTML(html) {
    if (!html) return { valid: false, error: 'Empty HTML' };
    
    // Basic validation checks
    const openTags = (html.match(/<[^\/][^>]*>/g) || []).length;
    const closeTags = (html.match(/<\/[^>]*>/g) || []).length;
    const selfClosing = (html.match(/<[^>]*\/>/g) || []).length;
    
    // Check for unescaped quotes in attributes
    const unescapedQuotes = html.match(/="[^"]*"[^"]*"[^"]*"/g);
    if (unescapedQuotes) {
      return { 
        valid: false, 
        error: 'Unescaped quotes in attributes', 
        details: unescapedQuotes 
      };
    }
    
    return { valid: true, tags: { open: openTags, close: closeTags, selfClosing } };
  }
} 