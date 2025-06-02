// modules/search-query-ssot.js - Single Source of Truth for All Search Queries
// THE authoritative source for search queries across all components

import { AISearchQueryGenerator } from './ai-search-query-generator.js';

export class SearchQuerySSoT {
  constructor(apiManager) {
    this.apiManager = apiManager;
    this.aiGenerator = new AISearchQueryGenerator(apiManager);
    
    // Current state
    this.currentQuery = null;
    this.currentTerms = []; // Selected terms
    this.availableTerms = []; // ALL available terms (selected + extended)
    this.currentMetadata = {};
    this.listeners = [];
    
    console.log('🏛️ SearchQuerySSoT: Single Source of Truth initialized');
  }

  // Initialize with existing candidate terms (called by SalesAnalysisManager)
  initialize(currentQuery, candidateTerms, analysisType) {
    console.log('🔧 SSoT: Initialize called with candidate terms');
    console.log('📋 Current query:', currentQuery);
    console.log('📋 Candidate terms:', candidateTerms?.candidates?.length || 0);
    console.log('📋 Analysis type:', analysisType);
    
    if (!candidateTerms || !candidateTerms.candidates || candidateTerms.candidates.length === 0) {
      console.log('⚠️ SSoT: No candidate terms provided, cannot initialize properly');
      return;
    }
    
    // Set or preserve the current query
    if (currentQuery) {
      this.currentQuery = currentQuery;
      
      // CRITICAL ENHANCEMENT: Preserve AI-detected quoted artist terms
      const selectedCandidates = candidateTerms.candidates.filter(c => c.preSelected);
      if (selectedCandidates.length > 0) {
        // PRECISION FIX: Use the original terms from AI Rules selection (preserves quoted artist names)
        this.currentTerms = selectedCandidates.map(c => c.term);
        console.log('✅ SSoT: Using original AI Rules terms (preserves quoted artist names):', this.currentTerms);
        
        // LOG AI-detected quoted artists specifically
        const quotedArtists = this.currentTerms.filter(term => 
          term.includes('"') && selectedCandidates.find(c => c.term === term && c.source === 'ai_detected')
        );
        if (quotedArtists.length > 0) {
          console.log('🎯 SSoT: AI-detected quoted artists preserved:', quotedArtists);
        }
      } else {
        // ENHANCED FALLBACK: Smart query parsing that preserves quoted terms
        this.currentTerms = this.parseQueryPreservingQuotes(currentQuery);
        console.log('⚠️ SSoT: Fallback to smart query parsing (preserves quotes):', this.currentTerms);
      }
    }
    
    // CRITICAL: ALWAYS populate availableTerms from candidateTerms for extended functionality
    this.availableTerms = candidateTerms.candidates.map(candidate => ({
      term: candidate.term,
      type: candidate.type || this.detectTermType(candidate.term),
      description: candidate.description || this.getTermDescription(candidate.type || this.detectTermType(candidate.term)),
      priority: candidate.priority || this.getTermPriority(candidate.type || this.detectTermType(candidate.term)),
      isSelected: candidate.preSelected || false,
      isCore: this.isCoreSearchTerm(candidate.term),
      score: candidate.score || (candidate.preSelected ? 100 : 50),
      source: candidate.source, // CRITICAL FIX: Preserve source for AI artist preservation logic
      isPrecisionQuoted: candidate.isPrecisionQuoted || false // NEW: Track precision-quoted terms
    }));
    
    console.log('✅ SSoT: Populated availableTerms with', this.availableTerms.length, 'candidates');
    console.log('📊 Selected terms:', this.availableTerms.filter(t => t.isSelected).length);
    console.log('📊 Unselected terms:', this.availableTerms.filter(t => !t.isSelected).length);
    console.log('🎯 AI-quoted artists:', this.availableTerms.filter(t => t.isPrecisionQuoted && t.source === 'ai_detected').map(t => t.term));
    
    // Update metadata
    this.currentMetadata = {
      source: analysisType || 'candidate_init',
      timestamp: Date.now(),
      confidence: candidateTerms.confidence || 0.8,
      reasoning: candidateTerms.reasoning || 'Initialized with candidate terms',
      originalTitle: candidateTerms.originalTitle || '',
      candidateCount: candidateTerms.candidates.length
    };
    
    console.log('✅ SSoT: Initialization complete with quoted artist preservation');
    this.notifyListeners('initialized', {
      query: this.currentQuery,
      availableTerms: this.availableTerms.length,
      selectedTerms: this.currentTerms.length
    });
  }

  // NEW: Smart query parsing that preserves quoted terms
  parseQueryPreservingQuotes(query) {
    if (!query || typeof query !== 'string') {
      return [];
    }
    
    console.log('🔧 Parsing query while preserving quoted terms:', query);
    
    const terms = [];
    let currentTerm = '';
    let insideQuotes = false;
    let quoteChar = null;
    
    for (let i = 0; i < query.length; i++) {
      const char = query[i];
      
      if ((char === '"' || char === "'") && !insideQuotes) {
        // Starting a quoted term
        insideQuotes = true;
        quoteChar = char;
        currentTerm += char;
      } else if (char === quoteChar && insideQuotes) {
        // Ending a quoted term
        insideQuotes = false;
        currentTerm += char;
        quoteChar = null;
      } else if (char === ' ' && !insideQuotes) {
        // Space outside quotes - end current term
        if (currentTerm.trim()) {
          terms.push(currentTerm.trim());
          currentTerm = '';
        }
      } else {
        // Regular character
        currentTerm += char;
      }
    }
    
    // Add final term if any
    if (currentTerm.trim()) {
      terms.push(currentTerm.trim());
    }
    
    console.log('✅ Parsed terms preserving quotes:', terms);
    return terms;
  }

  // MAIN METHOD: Generate and set the authoritative search query
  async generateAndSetQuery(title, description = '', artist = '', aiArtist = '') {
    console.log('🎯 SSoT: Generating authoritative search query...');
    console.log(`📝 Input: "${title}"`);
    console.log(`👤 Artist field: "${artist}"`);
    
    try {
      // Use AI to generate optimal search query (with artist field support)
      const aiResult = await this.aiGenerator.generateOptimalSearchQuery(title, description, artist, aiArtist);
      
      if (aiResult && aiResult.success) {
        this.setCurrentQuery(aiResult);
        console.log('✅ SSoT: AI-generated query set as authoritative source');
        return aiResult;
      } else {
        throw new Error('AI search generation failed');
      }
    } catch (error) {
      console.error('💥 SSoT: Failed to generate AI query:', error);
      
      // Emergency fallback with artist field priority
      const fallback = this.getEmergencyFallback(title, artist, description);
      this.setCurrentQuery(fallback);
      console.log('⚠️ SSoT: Emergency fallback set as authoritative source');
      return fallback;
    }
  }

  // Set the current authoritative query
  setCurrentQuery(queryData) {
    console.log('🔒 SSoT: Setting authoritative query:', queryData);
    
    this.currentQuery = queryData.query || '';
    
    // CRITICAL FIX: Preserve original searchTerms structure to maintain "Niels Thorsson" as one term
    if (queryData.searchTerms && Array.isArray(queryData.searchTerms)) {
      // Use provided searchTerms array (preserves "Niels Thorsson" as one term)
      this.currentTerms = [...queryData.searchTerms];
      console.log('✅ SSoT: Using provided searchTerms array (preserves artist names):', this.currentTerms);
    } else {
      // Fallback: split query by spaces (old behavior)
      this.currentTerms = this.currentQuery.split(' ').filter(term => term.trim().length > 0);
      console.log('⚠️ SSoT: Fallback to splitting query by spaces:', this.currentTerms);
    }
    
    // CRITICAL ENHANCEMENT: Populate availableTerms from AI rules data for dashboard pills
    if (queryData.allTerms && Array.isArray(queryData.allTerms)) {
      // AI rules provides both selected and unselected terms
      console.log('🎯 SSoT: Populating availableTerms from AI rules allTerms:', queryData.allTerms);
      
      this.availableTerms = queryData.allTerms.map(term => ({
        term: term,
        type: this.detectTermType(term),
        description: this.getTermDescription(this.detectTermType(term)),
        priority: this.getTermPriority(this.detectTermType(term)),
        isSelected: queryData.searchTerms ? queryData.searchTerms.includes(term) : false,
        isCore: queryData.searchTerms ? queryData.searchTerms.slice(0, 2).includes(term) : false,
        score: queryData.searchTerms && queryData.searchTerms.includes(term) ? 100 : 50,
        source: 'ai_rules',
        isPrecisionQuoted: term.includes('"')
      }));
      
      console.log('✅ SSoT: AI rules availableTerms populated:', this.availableTerms.length, 'terms');
    } else if (queryData.preSelectedTerms && queryData.candidateTerms) {
      // Alternative AI rules format with pre-selected and candidate terms
      console.log('🎯 SSoT: Populating availableTerms from preSelected + candidates');
      
      const allAITerms = [...(queryData.preSelectedTerms || []), ...(queryData.candidateTerms || [])];
      this.availableTerms = allAITerms.map(term => ({
        term: term,
        type: this.detectTermType(term),
        description: this.getTermDescription(this.detectTermType(term)),
        priority: this.getTermPriority(this.detectTermType(term)),
        isSelected: queryData.preSelectedTerms ? queryData.preSelectedTerms.includes(term) : false,
        isCore: queryData.preSelectedTerms ? queryData.preSelectedTerms.slice(0, 2).includes(term) : false,
        score: queryData.preSelectedTerms && queryData.preSelectedTerms.includes(term) ? 100 : 50,
        source: 'ai_rules',
        isPrecisionQuoted: term.includes('"')
      }));
      
      console.log('✅ SSoT: AI rules availableTerms from preSelected+candidates:', this.availableTerms.length, 'terms');
    } else {
      // Fallback: create availableTerms from current terms only
      console.log('⚠️ SSoT: Fallback - creating availableTerms from currentTerms only');
      
      this.availableTerms = this.currentTerms.map(term => ({
        term: term,
        type: this.detectTermType(term),
        description: this.getTermDescription(this.detectTermType(term)),
        priority: this.getTermPriority(this.detectTermType(term)),
        isSelected: true,
        isCore: this.currentTerms.slice(0, 2).includes(term),
        score: 100,
        source: 'fallback',
        isPrecisionQuoted: term.includes('"')
      }));
    }
    
    console.log('📊 SSoT: Final availableTerms state:');
    console.log('   Total terms:', this.availableTerms.length);
    console.log('   Selected terms:', this.availableTerms.filter(t => t.isSelected).length);
    console.log('   Unselected terms:', this.availableTerms.filter(t => !t.isSelected).length);
    console.log('   Terms list:', this.availableTerms.map(t => `${t.term}(${t.isSelected ? '✓' : '○'})`));
    
    this.currentMetadata = {
      reasoning: queryData.reasoning || '',
      confidence: queryData.confidence || 0.5,
      source: queryData.source || 'unknown',
      timestamp: Date.now(),
      originalTitle: queryData.originalTitle || '',
      originalDescription: queryData.originalDescription || ''
    };
    
    // Notify all listeners
    this.notifyListeners('query_generated', {
      query: this.currentQuery,
      terms: this.currentTerms,
      metadata: this.currentMetadata
    });
    
    console.log('📡 SSoT: Notified all components of new authoritative query');
  }

  // Get current authoritative query
  getCurrentQuery() {
    return this.currentQuery;
  }

  // Get current search terms
  getCurrentTerms() {
    return [...this.currentTerms]; // Return copy to prevent mutations
  }

  // Get current metadata
  getCurrentMetadata() {
    return { ...this.currentMetadata }; // Return copy to prevent mutations
  }

  // Build search context for API calls (ensures all components use same query)
  buildSearchContext() {
    console.log('🔄 SSoT: Building search context for API call');
    console.log('🔄 Current query:', this.currentQuery);
    console.log('🔄 Has metadata:', !!this.currentMetadata);
    console.log('🔄 Source:', this.currentMetadata?.source);
    
    if (!this.currentQuery) {
      console.warn('⚠️ SSoT: No current query set - returning default search context');
      
      // CRITICAL FIX: Never return null, always return a valid context object
      return {
        // Primary search query (empty but valid)
        primarySearch: '',
        searchTerms: '',
        finalSearch: '',
        
        // Default metadata
        source: 'ssot_no_query',
        confidence: 0.1,
        reasoning: 'No query available from SSoT',
        generatedAt: Date.now(),
        
        // For backward compatibility
        artistName: '',
        objectType: '',
        period: '',
        technique: '',
        
        // Status flags
        isEmpty: true,
        hasValidQuery: false
      };
    }
    
    const context = {
      // Primary search query (what gets sent to Auctionet)
      primarySearch: this.currentQuery,
      searchTerms: this.currentQuery,
      finalSearch: this.currentQuery,
      
      // Metadata for transparency
      source: 'ai_ssot',
      confidence: this.currentMetadata.confidence || 0.5,
      reasoning: this.currentMetadata.reasoning || 'Generated from SSoT',
      generatedAt: this.currentMetadata.timestamp || Date.now(),
      
      // For backward compatibility (all empty since we don't use these anymore)
      artistName: '',
      objectType: '',
      period: '',
      technique: '',
      
      // Status flags
      isEmpty: false,
      hasValidQuery: true
    };
    
    console.log('📋 SSoT: Generated search context:', context);
    return context;
  }

  // Validate that current query actually works on Auctionet
  async validateCurrentQuery() {
    if (!this.currentQuery) {
      return { valid: false, reason: 'No query set' };
    }
    
    try {
      console.log(`🔍 SSoT: Validating query "${this.currentQuery}" on Auctionet...`);
      
      // Test query on Auctionet API (minimal call)
      const testUrl = `https://auctionet.com/api/v2/items.json?is=ended&q=${encodeURIComponent(this.currentQuery)}&per_page=1`;
      const response = await fetch(testUrl);
      
      if (!response.ok) {
        return { valid: false, reason: `HTTP ${response.status}` };
      }
      
      const data = await response.json();
      const hasResults = data.pagination && data.pagination.total_entries > 0;
      
      console.log(`✅ SSoT: Query validation result: ${hasResults ? 'VALID' : 'NO RESULTS'} (${data.pagination?.total_entries || 0} total matches)`);
      
      return {
        valid: true,
        hasResults: hasResults,
        totalMatches: data.pagination?.total_entries || 0,
        testUrl: testUrl
      };
      
    } catch (error) {
      console.error('💥 SSoT: Query validation failed:', error);
      return { valid: false, reason: error.message };
    }
  }

  // Emergency fallback (ARTIST FIELD PRIORITY)
  getEmergencyFallback(title, artist, description) {
    console.log('🚨 SSoT: Generating emergency fallback query with artist field priority');
    console.log(`👤 Artist field: "${artist}"`);
    console.log(`📝 Title: "${title}"`);
    
    let fallbackTerms = [];
    let reasoning = 'Emergency fallback: ';
    
    // PRIORITY 1: Artist field (HIGHEST PRIORITY - same as AI Rules)
    if (artist && artist.trim()) {
      // Format artist name for search (same logic as AuctionetAPI)
      const cleanArtist = artist.trim().replace(/,\s*$/, ''); // Remove trailing commas
      const words = cleanArtist.split(/\s+/).filter(word => word.length > 0);
      
      let formattedArtist;
      if (words.length > 1) {
        // Multiple words - wrap in quotes to treat as single entity
        formattedArtist = `"${cleanArtist}"`;
        console.log(`👤 SSoT EMERGENCY: "${cleanArtist}" → ${formattedArtist} (multi-word name, quoted for exact matching)`);
      } else {
        // Single word - no quotes needed
        formattedArtist = cleanArtist;
        console.log(`👤 SSoT EMERGENCY: "${cleanArtist}" → ${formattedArtist} (single word, no quotes needed)`);
      }
      
      fallbackTerms.push(formattedArtist);
      reasoning += `Artist field "${formattedArtist}" included as primary term. `;
      console.log(`✅ EMERGENCY: Using formatted artist "${formattedArtist}" as primary search term`);
    }
    
    // PRIORITY 2: Extract object type from title (if not enough terms yet)
    if (fallbackTerms.length < 2) {
      // Simple object type detection
      const objectTypes = ['skulptur', 'målning', 'tavla', 'keramik', 'fat', 'vas', 'armbandsur', 'klocka', 'ur', 'halsband', 'ring', 'brosch'];
      const titleLower = title.toLowerCase();
      
      for (const objType of objectTypes) {
        if (titleLower.includes(objType) && !fallbackTerms.some(term => term.toLowerCase().includes(objType))) {
          fallbackTerms.push(objType);
          reasoning += `Object type "${objType}" detected. `;
          console.log(`✅ EMERGENCY: Added object type "${objType}"`);
          break;
        }
      }
    }
    
    // PRIORITY 3: Extract significant words from title (if still not enough terms)
    if (fallbackTerms.length < 3) {
      const words = title.toLowerCase()
        .replace(/[^\w\såäöüß-]/g, ' ')
        .split(/\s+/)
        .filter(word => 
          word.length > 2 && 
          !fallbackTerms.some(term => term.toLowerCase().includes(word.toLowerCase())) &&
          !['och', 'med', 'för', 'från', 'till', 'signerad', 'numrerad', 'höjd', 'diameter'].includes(word)
        )
        .slice(0, 3 - fallbackTerms.length);
      
      fallbackTerms.push(...words);
      if (words.length > 0) {
        reasoning += `Added significant words: ${words.join(', ')}. `;
        console.log(`✅ EMERGENCY: Added significant words: ${words.join(', ')}`);
      }
    }
    
    // Ensure we have at least one term
    if (fallbackTerms.length === 0) {
      const basicWords = title.toLowerCase()
        .replace(/[^\w\såäöüß-]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2)
        .slice(0, 2);
      
      fallbackTerms = basicWords;
      reasoning += 'Used basic word extraction as last resort.';
      console.log(`⚠️ EMERGENCY: Last resort - basic words: ${basicWords.join(', ')}`);
    }
    
    const query = fallbackTerms.join(' ');
    const confidence = artist && artist.trim() ? 0.7 : 0.2; // Higher confidence if artist field used
    
    console.log(`✅ EMERGENCY FALLBACK: Generated query "${query}" with confidence ${confidence}`);
    console.log(`📋 Emergency terms: ${fallbackTerms.join(', ')}`);
    console.log(`🧠 Emergency reasoning: ${reasoning}`);
    
    return {
      success: true,
      query: query,
      searchTerms: fallbackTerms,
      reasoning: reasoning,
      confidence: confidence,
      source: 'emergency_fallback_with_artist'
    };
  }

  // Listener management for component coordination
  addListener(callback) {
    this.listeners.push(callback);
    console.log(`📡 SSoT: Added listener (${this.listeners.length} total)`);
  }

  removeListener(callback) {
    this.listeners = this.listeners.filter(cb => cb !== callback);
    console.log(`📡 SSoT: Removed listener (${this.listeners.length} remaining)`);
  }

  notifyListeners(event, data) {
    console.log(`📡 SSoT: Notifying ${this.listeners.length} listeners of event: ${event}`);
    this.listeners.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('💥 SSoT: Listener callback failed:', error);
      }
    });
  }

  // Get comprehensive status
  getStatus() {
    return {
      hasQuery: !!this.currentQuery,
      query: this.currentQuery,
      terms: this.currentTerms,
      metadata: this.currentMetadata,
      listeners: this.listeners.length
    };
  }

  // Generate Auctionet URLs for the current query
  getSearchUrls() {
    if (!this.currentQuery) {
      console.warn('⚠️ SSoT: No current query - returning fallback URLs');
      return {
        historical: '#',
        live: '#',
        all: '#'
      };
    }

    const encodedQuery = encodeURIComponent(this.currentQuery);
    const baseUrl = 'https://auctionet.com/sv/search';
    
    const urls = {
      historical: `${baseUrl}?event_id=&is=ended&q=${encodedQuery}`,
      live: `${baseUrl}?event_id=&is=&q=${encodedQuery}`,
      all: `${baseUrl}?event_id=&is=&q=${encodedQuery}`
    };

    console.log('🔗 SSoT: Generated search URLs for query:', this.currentQuery);
    return urls;
  }

  // Clear current state
  clear() {
    console.log('🧹 SSoT: Clearing all state');
    this.currentQuery = null;
    this.currentTerms = [];
    this.currentMetadata = {};
    
    this.notifyListeners('cleared', {});
  }

  // Debug information
  debug() {
    console.log('🔍 SSoT Debug Information:');
    console.log('  Current Query:', this.currentQuery);
    console.log('  Current Terms:', this.currentTerms);
    console.log('  Metadata:', this.currentMetadata);
    console.log('  Listeners:', this.listeners.length);
    console.log('  AI Cache Stats:', this.aiGenerator.getCacheStats());
  }

  // Check if a specific term is selected (for UI checkbox state)
  isTermSelected(term) {
    if (!term || !this.currentTerms) {
      return false;
    }
    
    // Check if the term is in our current search terms
    const normalizedTerm = term.toLowerCase().trim();
    const isSelected = this.currentTerms.some(searchTerm => 
      searchTerm.toLowerCase().trim() === normalizedTerm
    );
    
    console.log(`🔍 SSoT: Term "${term}" selected: ${isSelected}`);
    return isSelected;
  }

  // Get the source of the current query (for dashboard display)
  getQuerySource() {
    const source = this.currentMetadata?.source || 'unknown';
    
    // Map sources to user-friendly labels
    const sourceLabels = {
      'ai_only': 'AI-genererad',
      'ai_enhanced': 'AI-förbättrad',
      'emergency_fallback': 'automatisk',
      'user_modified': 'användarval',
      'user_selection': 'användarval',
      'system': 'automatisk analys',
      'user': 'användarval'
    };
    
    return sourceLabels[source] || 'automatisk analys';
  }

  // Update user selections and regenerate query
  updateUserSelections(selectedTerms) {
    console.log('🔄 SSoT: Updating user selections:', selectedTerms);
    
    if (!selectedTerms || selectedTerms.length === 0) {
      console.log('⚠️ SSoT: No terms selected - clearing query');
      this.currentQuery = '';
      this.currentTerms = [];
      
      // Update all available terms to unselected state
      this.availableTerms.forEach(termObj => {
        termObj.isSelected = false;
      });
    } else {
      console.log('✅ SSoT: Setting query from user selections');
      this.currentQuery = selectedTerms.join(' ');
      this.currentTerms = [...selectedTerms];
      
      // Update selection state in available terms
      this.availableTerms.forEach(termObj => {
        termObj.isSelected = selectedTerms.includes(termObj.term);
      });
    }
    
    // Update metadata
    this.currentMetadata.source = 'user_selection';
    this.currentMetadata.timestamp = Date.now();
    this.currentMetadata.reasoning = `User selected: ${selectedTerms.join(', ') || 'none'}`;
    
    console.log('🔄 SSoT: Updated selection state');
    console.log('   Current query:', this.currentQuery);
    console.log('   Selected terms:', this.currentTerms.length);
    console.log('   Available terms state:', this.availableTerms.map(t => `${t.term}(${t.isSelected ? '✓' : '○'})`));
    
    // Notify listeners of the change
    this.notifyListeners('user_selection_updated', {
      query: this.currentQuery,
      selectedTerms: this.currentTerms,
      allTerms: this.availableTerms
    });
  }

  // NEW: Legacy compatibility methods for dashboard manager
  
  // Get all available terms for dashboard checkboxes (both selected and unselected)
  getAvailableTerms() {
    console.log('📋 SSoT: Getting ALL available terms for dashboard');
    console.log('   Available terms stored:', this.availableTerms.length);
    console.log('   Selected terms:', this.currentTerms.length);
    
    // CRITICAL FIX: Use the stored availableTerms from initialization
    if (this.availableTerms && this.availableTerms.length > 0) {
      console.log('✅ SSoT: Returning stored available terms (includes extended terms)');
      console.log('📋 Extended terms available:', this.availableTerms.map(t => `${t.term}(${t.isSelected ? '✓' : '○'})`));
      return this.availableTerms;
    }
    
    // Only fall back to current terms if no available terms were ever stored
    console.log('⚠️ SSoT: No available terms stored, creating from current terms (fallback)');
    return this.currentTerms.map(term => ({
      term: term,
      type: this.detectTermType(term),
      description: this.getTermDescription(this.detectTermType(term)),
      priority: this.getTermPriority(this.detectTermType(term)),
      isSelected: true,
      isCore: this.isCoreSearchTerm(term),
      score: 100
    }));
  }
  
  // Get currently selected terms (legacy compatibility)
  getSelectedTerms() {
    console.log('🔧 SSoT: getSelectedTerms called (legacy compatibility)');
    return [...this.currentTerms];
  }
  
  // Check if a term is selected (legacy compatibility)
  isTermSelected(term) {
    const isSelected = this.currentTerms.some(t => 
      this.normalizeTermForMatching(t) === this.normalizeTermForMatching(term)
    );
    console.log(`🔧 SSoT: isTermSelected("${term}"):`, isSelected);
    return isSelected;
  }
  
  // Check if a term is a core search term (legacy compatibility)
  isCoreSearchTerm(term) {
    // In SSoT, we consider the first 2 terms as "core"
    const normalizedTerm = this.normalizeTermForMatching(term);
    const isCore = this.currentTerms.slice(0, 2).some(t => 
      this.normalizeTermForMatching(t) === normalizedTerm
    );
    console.log(`🔧 SSoT: isCoreSearchTerm("${term}"):`, isCore);
    return isCore;
  }
  
  // Normalize term for matching (legacy compatibility)
  normalizeTermForMatching(term) {
    return term.toLowerCase().trim();
  }
  
  // Helper methods for term analysis
  detectTermType(term) {
    const lowerTerm = term.toLowerCase();
    
    // Brand/Artist detection
    const watchBrands = ['omega', 'rolex', 'patek', 'cartier', 'breitling', 'tag', 'heuer', 'yamaha'];
    if (watchBrands.includes(lowerTerm)) {
      return 'brand';
    }
    
    // Period detection
    if (/^\d{4}$/.test(term) || /\d{4}[-\s]tal/.test(lowerTerm)) {
      return 'period';
    }
    
    // Object type detection
    const objectTypes = ['armbandsur', 'klocka', 'ur', 'watch', 'tavla', 'målning', 'skulptur', 'synthesizer', 'dx7'];
    if (objectTypes.includes(lowerTerm)) {
      return 'object_type';
    }
    
    // Country/Region detection
    if (['japan', 'japanese', 'germany', 'swiss', 'sweden'].includes(lowerTerm)) {
      return 'origin';
    }
    
    // Default to keyword
    return 'keyword';
  }
  
  getTermDescription(term) {
    const type = this.detectTermType(term);
    const descriptions = {
      'brand': 'Märke/Tillverkare',
      'object_type': 'Objekttyp',
      'period': 'Tidsperiod',
      'origin': 'Ursprung/Land',
      'keyword': 'Nyckelord'
    };
    return descriptions[type] || 'Sökterm';
  }
  
  getTermPriority(term) {
    const type = this.detectTermType(term);
    const isCore = this.isCoreSearchTerm(term);
    
    if (isCore) return 100;
    
    const typePriorities = {
      'brand': 90,
      'object_type': 85,
      'period': 75,
      'origin': 70,
      'keyword': 60
    };
    
    return typePriorities[type] || 50;
  }
} 