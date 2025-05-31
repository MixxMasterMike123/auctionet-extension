// modules/search-query-ssot.js - Single Source of Truth for All Search Queries
// THE authoritative source for search queries across all components

import { AISearchQueryGenerator } from './ai-search-query-generator.js';

export class SearchQuerySSoT {
  constructor(apiManager) {
    this.apiManager = apiManager;
    this.aiGenerator = new AISearchQueryGenerator(apiManager);
    
    // Current state
    this.currentQuery = null;
    this.currentTerms = [];
    this.currentMetadata = {};
    this.listeners = [];
    
    console.log('🏛️ SearchQuerySSoT: Single Source of Truth initialized');
  }

  // MAIN METHOD: Generate and set the authoritative search query
  async generateAndSetQuery(title, description = '') {
    console.log('🎯 SSoT: Generating authoritative search query...');
    console.log(`📝 Input: "${title}"`);
    
    try {
      // Use AI to generate optimal search query
      const aiResult = await this.aiGenerator.generateOptimalSearchQuery(title, description);
      
      if (aiResult && aiResult.success) {
        this.setCurrentQuery(aiResult);
        console.log('✅ SSoT: AI-generated query set as authoritative source');
        return aiResult;
      } else {
        throw new Error('AI search generation failed');
      }
    } catch (error) {
      console.error('💥 SSoT: Failed to generate AI query:', error);
      
      // Emergency fallback
      const fallback = this.getEmergencyFallback(title);
      this.setCurrentQuery(fallback);
      console.log('⚠️ SSoT: Emergency fallback set as authoritative source');
      return fallback;
    }
  }

  // Set the current authoritative query
  setCurrentQuery(queryData) {
    console.log('🔒 SSoT: Setting authoritative query:', queryData);
    
    this.currentQuery = queryData.query || '';
    this.currentTerms = queryData.searchTerms || [];
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

  // Build search context for API calls
  buildSearchContext() {
    console.log('🔧 SSoT: Building search context from authoritative query');
    
    if (!this.currentQuery) {
      console.warn('⚠️ SSoT: No current query set - cannot build search context');
      return null;
    }
    
    const context = {
      // Primary search query (what gets sent to Auctionet)
      primarySearch: this.currentQuery,
      searchTerms: this.currentQuery,
      finalSearch: this.currentQuery,
      
      // Metadata for transparency
      source: 'ai_ssot',
      confidence: this.currentMetadata.confidence,
      reasoning: this.currentMetadata.reasoning,
      generatedAt: this.currentMetadata.timestamp,
      
      // For backward compatibility (all empty since we don't use these anymore)
      artistName: '',
      objectType: '',
      period: '',
      technique: ''
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

  // Emergency fallback (very basic)
  getEmergencyFallback(title) {
    console.log('🚨 SSoT: Generating emergency fallback query');
    
    const words = title.toLowerCase()
      .replace(/[^\w\såäöüß-]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .slice(0, 2);
    
    return {
      success: true,
      query: words.join(' '),
      searchTerms: words,
      reasoning: 'Emergency fallback - basic word extraction',
      confidence: 0.2,
      source: 'emergency_fallback'
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
      termsCount: this.currentTerms.length,
      terms: this.currentTerms,
      metadata: this.currentMetadata,
      listenersCount: this.listeners.length,
      cacheStats: this.aiGenerator.getCacheStats()
    };
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
} 