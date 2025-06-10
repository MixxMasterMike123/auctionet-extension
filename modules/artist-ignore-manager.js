// modules/artist-ignore-manager.js
// Handles ignoring false positive artist detections

export class ArtistIgnoreManager {
  constructor() {
    this.ignoredArtists = new Set(); // Track ignored artists for current session
    this.qualityAnalyzer = null;
    this.searchQuerySSoT = null;
    console.log('🚫 ArtistIgnoreManager initialized');
  }

  /**
   * Set dependencies
   */
  setQualityAnalyzer(qualityAnalyzer) {
    this.qualityAnalyzer = qualityAnalyzer;
  }

  setSearchQuerySSoT(searchQuerySSoT) {
    this.searchQuerySSoT = searchQuerySSoT;
  }

  /**
   * Ignore an artist detection
   * @param {string} artistName - The artist name to ignore
   * @param {string} itemId - Optional item ID for persistence
   */
  ignoreArtist(artistName, itemId = null) {
    if (!artistName) {
      console.error('❌ ArtistIgnoreManager: Cannot ignore empty artist name');
      return false;
    }

    const normalizedName = this.normalizeArtistName(artistName);
    this.ignoredArtists.add(normalizedName);
    
    console.log(`🚫 Ignored artist: "${artistName}" (normalized: "${normalizedName}")`);
    
    // Store in session storage for persistence across page interactions
    this.saveIgnoredArtistsToStorage();
    
    return true;
  }

  /**
   * Check if an artist is ignored
   * @param {string} artistName - The artist name to check
   * @returns {boolean}
   */
  isArtistIgnored(artistName) {
    if (!artistName) return false;
    
    const normalizedName = this.normalizeArtistName(artistName);
    return this.ignoredArtists.has(normalizedName);
  }

  /**
   * Un-ignore an artist (for potential future use)
   * @param {string} artistName - The artist name to un-ignore
   */
  unIgnoreArtist(artistName) {
    if (!artistName) return false;
    
    const normalizedName = this.normalizeArtistName(artistName);
    const wasIgnored = this.ignoredArtists.delete(normalizedName);
    
    if (wasIgnored) {
      console.log(`✅ Un-ignored artist: "${artistName}"`);
      this.saveIgnoredArtistsToStorage();
    }
    
    return wasIgnored;
  }

  /**
   * Get all ignored artists
   * @returns {Array<string>}
   */
  getIgnoredArtists() {
    return Array.from(this.ignoredArtists);
  }

  /**
   * Clear all ignored artists
   */
  clearAllIgnored() {
    this.ignoredArtists.clear();
    this.saveIgnoredArtistsToStorage();
    console.log('🧹 Cleared all ignored artists');
  }

  /**
   * Normalize artist name for consistent comparison
   * @param {string} artistName - Raw artist name
   * @returns {string} - Normalized name
   */
  normalizeArtistName(artistName) {
    return artistName.trim().toLowerCase()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[,.]/g, ''); // Remove common punctuation
  }

  /**
   * Process artist detection result and filter out ignored artists
   * @param {Object} detectionResult - Artist detection result
   * @returns {Object|null} - Filtered result or null if ignored
   */
  filterDetectionResult(detectionResult) {
    if (!detectionResult || !detectionResult.detectedArtist) {
      return detectionResult;
    }

    if (this.isArtistIgnored(detectionResult.detectedArtist)) {
      console.log(`🚫 Filtering out ignored artist: "${detectionResult.detectedArtist}"`);
      return null; // Return null to indicate this detection should be ignored
    }

    return detectionResult;
  }

  /**
   * Handle ignore action from UI
   * @param {string} artistName - Artist to ignore
   * @param {Object} warningElement - DOM element to update
   */
  async handleIgnoreAction(artistName, warningElement) {
    try {
      // Add to ignored list
      const success = this.ignoreArtist(artistName);
      if (!success) {
        throw new Error('Failed to ignore artist');
      }

      // Visual feedback - mark as ignored
      this.updateWarningElementAsIgnored(warningElement, artistName);

      // Update SearchQuerySSoT to exclude ignored artist
      if (this.searchQuerySSoT) {
        await this.updateSearchQueryWithoutIgnoredArtist(artistName);
      }

      // Trigger quality re-analysis to remove the warning
      if (this.qualityAnalyzer) {
        setTimeout(() => {
          this.qualityAnalyzer.analyzeQuality();
        }, 100);
      }

      console.log(`✅ Successfully ignored artist: "${artistName}"`);
      
    } catch (error) {
      console.error('❌ Error handling ignore action:', error);
      this.showIgnoreErrorFeedback(warningElement, error.message);
    }
  }

  /**
   * Update warning element to show ignored state
   * @param {HTMLElement} warningElement 
   * @param {string} artistName 
   */
  updateWarningElementAsIgnored(warningElement, artistName) {
    if (!warningElement) return;

    // Add ignored styling
    warningElement.style.opacity = '0.6';
    warningElement.style.backgroundColor = '#f8f9fa';
    warningElement.style.border = '1px solid #dee2e6';
    warningElement.style.borderRadius = '4px';  
    warningElement.style.padding = '8px';
    warningElement.style.transition = 'all 0.3s ease';

    // Update text content to show ignored state
    const artistElements = warningElement.querySelectorAll('.clickable-artist');
    artistElements.forEach(element => {
      if (element.textContent.includes(artistName)) {
        element.style.textDecoration = 'line-through';
        element.style.color = '#6c757d';
        element.title = `Artist "${artistName}" ignorerad - kommer inte påverka sökningar`;
      }
    });

    // Add ignored badge
    const ignoredBadge = document.createElement('span');
    ignoredBadge.innerHTML = ' <small style="color: #6c757d; font-weight: 600;">🚫 IGNORERAD</small>';
    warningElement.appendChild(ignoredBadge);

    // Disable any clickable functionality
    const clickableElements = warningElement.querySelectorAll('.clickable-artist, .clickable-brand');
    clickableElements.forEach(element => {
      element.style.pointerEvents = 'none';
      element.style.cursor = 'default';
    });
  }

  /**
   * Update SearchQuerySSoT to exclude ignored artist
   * @param {string} ignoredArtist - Artist to exclude
   */
  async updateSearchQueryWithoutIgnoredArtist(ignoredArtist) {
    if (!this.searchQuerySSoT) {
      console.warn('⚠️ SearchQuerySSoT not available for updating');
      return;
    }

    try {
      // Get current form data
      const dataExtractor = this.qualityAnalyzer?.dataExtractor;
      if (!dataExtractor) {
        console.warn('⚠️ DataExtractor not available');
        return;
      }

      const currentData = dataExtractor.extractItemData();
      
      // Generate new search query without the ignored artist
      console.log(`🔄 Regenerating search query without ignored artist: "${ignoredArtist}"`);
      
      const result = await this.searchQuerySSoT.generateAndSetQuery(
        currentData.title,
        currentData.description,
        currentData.artist,
        '', // No AI artist since we're ignoring it
        { 
          updateDOMField: false, // Don't update Hidden Keywords field
          excludeArtist: ignoredArtist // NEW: Pass ignored artist to exclude
        }
      );

      if (result && result.success) {
        console.log('✅ Successfully updated search query without ignored artist');
        
        // Trigger new market analysis with updated query
        if (this.qualityAnalyzer?.salesAnalysisManager) {
          const searchContext = this.searchQuerySSoT.buildSearchContext();
          setTimeout(() => {
            this.qualityAnalyzer.salesAnalysisManager.startSalesAnalysis(
              searchContext,
              currentData,
              [],
              this.qualityAnalyzer.calculateCurrentQualityScore(currentData),
              this.qualityAnalyzer.searchFilterManager,
              this.qualityAnalyzer
            );
          }, 200);
        }
      }
    } catch (error) {
      console.error('❌ Error updating search query after ignoring artist:', error);
    }
  }

  /**
   * Show error feedback for ignore action
   * @param {HTMLElement} element 
   * @param {string} message 
   */
  showIgnoreErrorFeedback(element, message) {
    if (!element) return;

    const originalColor = element.style.color;
    element.style.color = '#dc3545';
    element.style.fontWeight = 'bold';
    
    const originalText = element.textContent;
    element.textContent = `❌ Fel: ${message}`;

    setTimeout(() => {
      element.style.color = originalColor;
      element.style.fontWeight = '';
      element.textContent = originalText;
    }, 3000);
  }

  /**
   * Save ignored artists to session storage
   */
  saveIgnoredArtistsToStorage() {
    try {
      const ignoredArray = Array.from(this.ignoredArtists);
      sessionStorage.setItem('auctionet_ignored_artists', JSON.stringify(ignoredArray));
    } catch (error) {
      console.warn('⚠️ Could not save ignored artists to storage:', error);
    }
  }

  /**
   * Load ignored artists from session storage
   */
  loadIgnoredArtistsFromStorage() {
    try {
      const stored = sessionStorage.getItem('auctionet_ignored_artists');
      if (stored) {
        const ignoredArray = JSON.parse(stored);
        this.ignoredArtists = new Set(ignoredArray);
        console.log(`📥 Loaded ${ignoredArray.length} ignored artists from storage`);
      }
    } catch (error) {
      console.warn('⚠️ Could not load ignored artists from storage:', error);
      this.ignoredArtists = new Set(); // Reset to empty set
    }
  }

  /**
   * Initialize - load from storage
   */
  init() {
    this.loadIgnoredArtistsFromStorage();
    console.log('🚫 ArtistIgnoreManager initialized with ignored artists:', this.getIgnoredArtists());
  }
} 