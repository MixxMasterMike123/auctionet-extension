/**
 * SearchQueryManager - Single Source of Truth for all search query operations
 * 
 * This class manages ALL search queries in the system to ensure consistency
 * between user selections, API calls, and Auctionet links.
 */
export class SearchQueryManager {
  constructor() {
    // SSoT: Current search query state
    this.currentQuery = '';
    this.coreTerms = new Set(); // Terms that should never be removed (artist, brand, object type)
    this.selectedTerms = new Set(); // User-selected additional terms
    this.availableTerms = new Map(); // All available candidate terms with metadata
    this.querySource = 'system'; // 'system', 'user', 'api', etc.
    
    // Event listeners for query changes
    this.changeListeners = [];
    
    console.log('🔧 SearchQueryManager initialized as Single Source of Truth');
  }

  /**
   * Initialize the query manager with initial search data
   */
  initialize(initialQuery, candidateTerms = null, source = 'system') {
    console.log('🚀 INITIALIZING SearchQueryManager SSoT');
    console.log('   Initial Query:', initialQuery);
    console.log('   Source:', source);
    
    this.currentQuery = initialQuery;
    this.querySource = source;
    
    // Parse initial query to identify core terms
    this.parseInitialQuery(initialQuery);
    
    // Store candidate terms if provided
    if (candidateTerms && candidateTerms.candidates) {
      this.loadCandidateTerms(candidateTerms);
    }
    
    console.log('✅ SSoT initialized:');
    console.log('   Core Terms:', Array.from(this.coreTerms));
    console.log('   Selected Terms:', Array.from(this.selectedTerms));
    console.log('   Current Query:', this.currentQuery);
    
    // Notify all listeners of initialization
    this.notifyListeners('initialize');
  }

  /**
   * Parse initial query to identify core terms that should never be removed
   */
  parseInitialQuery(query) {
    const terms = query.toLowerCase().split(' ').filter(t => t.length > 1);
    
    // Identify core terms (artist, brand, primary object type)
    terms.forEach(term => {
      if (this.isCoreSearchTerm(term)) {
        this.coreTerms.add(term);
        console.log('🎯 CORE TERM identified:', term);
      }
    });
    
    // All initial terms start as selected
    terms.forEach(term => {
      this.selectedTerms.add(term);
    });
  }

  /**
   * Determine if a term is a core search term that should never be removed
   */
  isCoreSearchTerm(term) {
    const lowerTerm = term.toLowerCase();
    
    // Brand/Artist names (common luxury brands)
    const majorBrands = [
      'omega', 'rolex', 'patek', 'cartier', 'breitling', 'tag', 'heuer', 
      'longines', 'tissot', 'seiko', 'citizen', 'casio', 'hamilton',
      'iwc', 'jaeger', 'lecoultre', 'vacheron', 'constantin', 'audemars', 'piguet'
    ];
    
    // Primary object types
    const primaryObjects = [
      'armbandsur', 'klocka', 'ur', 'watch', 'tavla', 'målning', 'painting',
      'skulptur', 'sculpture', 'vas', 'lampa', 'lamp', 'ring', 'halsband'
    ];
    
    // Check if it's a major brand or primary object
    const isMajorBrand = majorBrands.includes(lowerTerm);
    const isPrimaryObject = primaryObjects.includes(lowerTerm);
    
    if (isMajorBrand || isPrimaryObject) {
      console.log(`🎯 "${term}" identified as core term (${isMajorBrand ? 'brand' : 'object'})`);
      return true;
    }
    
    return false;
  }

  /**
   * Load candidate terms from extraction process
   */
  loadCandidateTerms(candidateTerms) {
    console.log('📋 Loading candidate terms into SSoT');
    
    this.availableTerms.clear();
    
    candidateTerms.candidates.forEach(candidate => {
      this.availableTerms.set(candidate.term.toLowerCase(), {
        originalTerm: candidate.term,
        type: candidate.type,
        description: candidate.description,
        priority: candidate.priority || 5,
        isCore: this.isCoreSearchTerm(candidate.term)
      });
      
      // If term was pre-selected and not already in our sets, add it
      if (candidate.preSelected) {
        this.selectedTerms.add(candidate.term.toLowerCase());
        
        // Mark as core if it qualifies
        if (this.isCoreSearchTerm(candidate.term)) {
          this.coreTerms.add(candidate.term.toLowerCase());
        }
      }
    });
    
    console.log('📋 Loaded', this.availableTerms.size, 'candidate terms');
    console.log('🎯 Core terms in candidates:', Array.from(this.coreTerms));
  }

  /**
   * Update user selections while preserving core terms
   */
  updateUserSelections(selectedTerms) {
    console.log('👤 USER SELECTION UPDATE');
    console.log('   User selected:', selectedTerms);
    console.log('   Current core terms:', Array.from(this.coreTerms));
    
    // Clear current selected terms
    this.selectedTerms.clear();
    
    // CRITICAL: Always preserve core terms
    this.coreTerms.forEach(coreTerm => {
      this.selectedTerms.add(coreTerm);
      console.log('🛡️ PRESERVING core term:', coreTerm);
    });
    
    // Add user-selected terms (convert to lowercase for consistency)
    selectedTerms.forEach(term => {
      const lowerTerm = term.toLowerCase();
      this.selectedTerms.add(lowerTerm);
      console.log('✅ Adding user selection:', term);
    });
    
    // Rebuild query from selections
    this.rebuildQuery('user');
    
    console.log('👤 USER SELECTION COMPLETE');
    console.log('   Final selected terms:', Array.from(this.selectedTerms));
    console.log('   Final query:', this.currentQuery);
  }

  /**
   * Rebuild the current query from selected terms
   */
  rebuildQuery(source = 'system') {
    console.log('🔄 REBUILDING QUERY FROM SELECTIONS');
    
    // Get original case terms from available terms
    const rebuiltTerms = [];
    
    this.selectedTerms.forEach(lowerTerm => {
      const termData = this.availableTerms.get(lowerTerm);
      if (termData) {
        rebuiltTerms.push(termData.originalTerm);
      } else {
        // Fallback to the term itself if not in available terms
        rebuiltTerms.push(lowerTerm);
      }
    });
    
    // Sort terms by priority (core terms first, then by type priority)
    rebuiltTerms.sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      const aData = this.availableTerms.get(aLower);
      const bData = this.availableTerms.get(bLower);
      
      // Core terms always come first
      const aIsCore = this.coreTerms.has(aLower);
      const bIsCore = this.coreTerms.has(bLower);
      
      if (aIsCore && !bIsCore) return -1;
      if (!aIsCore && bIsCore) return 1;
      
      // Then sort by priority
      const aPriority = aData ? aData.priority : 5;
      const bPriority = bData ? bData.priority : 5;
      
      return aPriority - bPriority;
    });
    
    const oldQuery = this.currentQuery;
    this.currentQuery = rebuiltTerms.join(' ');
    this.querySource = source;
    
    console.log('🔄 Query rebuilt:');
    console.log('   Old:', oldQuery);
    console.log('   New:', this.currentQuery);
    console.log('   Source:', source);
    
    // Notify listeners of change
    this.notifyListeners('rebuild', { oldQuery, newQuery: this.currentQuery });
  }

  /**
   * Get the current search query (SSoT)
   */
  getCurrentQuery() {
    return this.currentQuery;
  }

  /**
   * Get query source information
   */
  getQuerySource() {
    return this.querySource;
  }

  /**
   * Get all available terms for UI display
   */
  getAvailableTerms() {
    return Array.from(this.availableTerms.entries()).map(([lowerTerm, data]) => ({
      term: data.originalTerm,
      type: data.type,
      description: data.description,
      priority: data.priority,
      isCore: data.isCore,
      isSelected: this.selectedTerms.has(lowerTerm)
    }));
  }

  /**
   * Get core terms that should never be removed
   */
  getCoreTerms() {
    return Array.from(this.coreTerms);
  }

  /**
   * Get selected terms
   */
  getSelectedTerms() {
    return Array.from(this.selectedTerms);
  }

  /**
   * Check if a term is currently selected
   */
  isTermSelected(term) {
    const lowerTerm = term.toLowerCase();
    
    // Direct match first
    if (this.selectedTerms.has(lowerTerm)) {
      return true;
    }
    
    // Normalized matching for period terms (1970 vs 1970-tal)
    if (this.isNormalizedMatch(lowerTerm)) {
      return true;
    }
    
    return false;
  }

  /**
   * Check for normalized matches (handles variations like "1970" vs "1970-tal")
   */
  isNormalizedMatch(term) {
    const lowerTerm = term.toLowerCase();
    
    // Check each selected term for normalized matches
    for (const selectedTerm of this.selectedTerms) {
      // Period matching: "1970" matches "1970-tal" and vice versa
      if (this.arePeriodVariants(lowerTerm, selectedTerm)) {
        console.log(`🔄 NORMALIZED MATCH: "${term}" matches selected "${selectedTerm}" (period variants)`);
        return true;
      }
      
      // Brand/model matching: "omega" matches "Omega" (case insensitive)
      if (lowerTerm === selectedTerm.toLowerCase()) {
        console.log(`🔄 NORMALIZED MATCH: "${term}" matches selected "${selectedTerm}" (case insensitive)`);
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if two terms are period variants (1970 vs 1970-tal)
   */
  arePeriodVariants(term1, term2) {
    // Extract year from both terms
    const year1 = this.extractYear(term1);
    const year2 = this.extractYear(term2);
    
    // If both have the same year, they're variants
    if (year1 && year2 && year1 === year2) {
      return true;
    }
    
    return false;
  }

  /**
   * Extract year from a term (handles "1970", "1970-tal", etc.)
   */
  extractYear(term) {
    const yearMatch = term.match(/(\d{4})/);
    return yearMatch ? yearMatch[1] : null;
  }

  /**
   * Get URL-encoded query for Auctionet links
   */
  getEncodedQuery() {
    return encodeURIComponent(this.currentQuery);
  }

  /**
   * Generate Auctionet search URLs
   */
  getAuctionetUrls() {
    const encodedQuery = this.getEncodedQuery();
    
    return {
      historical: `https://auctionet.com/sv/search?event_id=&is=ended&q=${encodedQuery}`,
      live: `https://auctionet.com/sv/search?event_id=&q=${encodedQuery}`,
      all: `https://auctionet.com/sv/search?q=${encodedQuery}`
    };
  }

  /**
   * Add change listener
   */
  addChangeListener(listener) {
    this.changeListeners.push(listener);
  }

  /**
   * Remove change listener
   */
  removeChangeListener(listener) {
    const index = this.changeListeners.indexOf(listener);
    if (index > -1) {
      this.changeListeners.splice(index, 1);
    }
  }

  /**
   * Notify all listeners of changes
   */
  notifyListeners(event, data = {}) {
    console.log('📢 NOTIFYING SSoT listeners:', event, data);
    
    this.changeListeners.forEach(listener => {
      try {
        listener(event, {
          query: this.currentQuery,
          source: this.querySource,
          coreTerms: Array.from(this.coreTerms),
          selectedTerms: Array.from(this.selectedTerms),
          ...data
        });
      } catch (error) {
        console.error('❌ Error in SSoT change listener:', error);
      }
    });
  }

  /**
   * Reset the query manager
   */
  reset() {
    console.log('🔄 RESETTING SearchQueryManager SSoT');
    
    this.currentQuery = '';
    this.coreTerms.clear();
    this.selectedTerms.clear();
    this.availableTerms.clear();
    this.querySource = 'system';
    
    this.notifyListeners('reset');
  }

  /**
   * Debug: Print current state
   */
  debugState() {
    console.log('🔍 SearchQueryManager SSoT STATE:');
    console.log('   Current Query:', this.currentQuery);
    console.log('   Query Source:', this.querySource);
    console.log('   Core Terms:', Array.from(this.coreTerms));
    console.log('   Selected Terms:', Array.from(this.selectedTerms));
    console.log('   Available Terms:', Array.from(this.availableTerms.keys()));
    console.log('   Change Listeners:', this.changeListeners.length);
  }
} 