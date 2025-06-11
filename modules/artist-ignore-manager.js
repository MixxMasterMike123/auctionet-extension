// modules/artist-ignore-manager.js
// Handles ignoring false positive artist detections

export class ArtistIgnoreManager {
  constructor() {
    this.ignoredArtists = [];
    this.storageKey = 'auctionet_ignored_artists';
    // NEW: Add expiration tracking
    this.expirationKey = 'auctionet_ignored_artists_expiry';
    this.defaultExpirationHours = 24; // 24 hours instead of permanent
    this.loadFromStorage();
    this.qualityAnalyzer = null;
    this.searchQuerySSoT = null;
    this.setupKeyboardShortcuts(); // NEW: Add keyboard shortcuts

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
    if (!this.ignoredArtists.includes(normalizedName)) {
      this.ignoredArtists.push(normalizedName);
    }
    
    console.log(`🚫 Ignored artist: "${artistName}" (normalized: "${normalizedName}")`);
    
    // Store in session storage for persistence across page interactions
    this.saveToStorage();
    
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
    return this.ignoredArtists.includes(normalizedName);
  }

  /**
   * Un-ignore an artist (for potential future use)
   * @param {string} artistName - The artist name to un-ignore
   */
  unIgnoreArtist(artistName) {
    if (!artistName) return false;
    
    const normalizedName = this.normalizeArtistName(artistName);
    const index = this.ignoredArtists.indexOf(normalizedName);
    const wasIgnored = index !== -1;
    
    if (wasIgnored) {
      this.ignoredArtists.splice(index, 1);
      console.log(`✅ Un-ignored artist: "${artistName}"`);
      this.saveToStorage();
    }
    
    return wasIgnored;
  }

  /**
   * Get all ignored artists
   * @returns {Array<string>}
   */
  getIgnoredArtists() {
    return [...this.ignoredArtists];
  }

  /**
   * Clear all ignored artists
   */
  clearAllIgnored() {
    this.ignoredArtists.length = 0;
    this.saveToStorage();
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
      console.log(`🚫 Debug - Starting ignore action for artist: "${artistName}"`);
      
      // Add to ignored list
      const success = this.ignoreArtist(artistName);
      if (!success) {
        throw new Error('Failed to ignore artist');
      }

      console.log(`🚫 Debug - Artist added to ignored list. Current ignored artists:`, this.getIgnoredArtists());

      // Visual feedback - mark as ignored
      this.updateWarningElementAsIgnored(warningElement, artistName);

      // NEW FLOW: No need to update SSoT since title-detected artists are already excluded
      // The conservative initial analysis already generated SSoT without the detected artist
      console.log(`✅ Artist "${artistName}" ignored - SSoT already excludes title-detected artists`);

      // Trigger quality re-analysis to remove the warning
      if (this.qualityAnalyzer) {
        console.log(`🔄 Debug - Triggering quality re-analysis to remove warning for "${artistName}"`);
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
   * @deprecated This method is largely unnecessary with the new flow since title-detected artists are already excluded from initial SSoT
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

  // Load ignored artists from sessionStorage with expiration check
  loadFromStorage() {
    try {
      // Check if data has expired
      const expiryTime = sessionStorage.getItem(this.expirationKey);
      if (expiryTime) {
        const now = Date.now();
        const expiry = parseInt(expiryTime);
        
        if (now > expiry) {
          console.log('⏰ Ignored artists list expired, clearing...');
          this.clearAllIgnoredArtists();
          return;
        }
      }

      const stored = sessionStorage.getItem(this.storageKey);
      if (stored) {
        this.ignoredArtists = JSON.parse(stored);
        console.log(`📥 Loaded ${this.ignoredArtists.length} ignored artists from storage`);
        
        // Set expiration if not set
        if (!expiryTime) {
          this.setExpiration();
        }
      }
    } catch (error) {
      console.error('❌ Failed to load ignored artists from storage:', error);
      this.ignoredArtists = [];
    }

    // Clean up any corrupted entries
    const originalLength = this.ignoredArtists.length;
    this.ignoredArtists = this.ignoredArtists.filter(artist => 
      artist && 
      typeof artist === 'string' && 
      artist.trim().length > 0 &&
      !artist.includes('<') && // Remove HTML tags
      artist.length < 100 // Reasonable length limit
    );
    
    if (this.ignoredArtists.length !== originalLength) {
      console.log(`🧹 Cleaned ${originalLength - this.ignoredArtists.length} corrupted entries`);
      this.saveToStorage();
    }


  }

  // NEW: Set expiration time
  setExpiration(hoursFromNow = this.defaultExpirationHours) {
    const expiryTime = Date.now() + (hoursFromNow * 60 * 60 * 1000);
    sessionStorage.setItem(this.expirationKey, expiryTime.toString());
    console.log(`⏰ Ignored artists will expire in ${hoursFromNow} hours`);
  }

  // Save to sessionStorage with expiration
  saveToStorage() {
    try {
      sessionStorage.setItem(this.storageKey, JSON.stringify(this.ignoredArtists));
      this.setExpiration(); // Reset expiration timer
      console.log(`💾 Saved ${this.ignoredArtists.length} ignored artists to storage`);
    } catch (error) {
      console.error('❌ Failed to save ignored artists to storage:', error);
    }
  }

  // NEW: Remove specific artist from ignored list
  removeIgnoredArtist(artistName) {
    if (!artistName) return false;
    
    const normalizedName = this.normalizeArtistName(artistName);
    const beforeCount = this.ignoredArtists.length;
    
    this.ignoredArtists = this.ignoredArtists.filter(ignored => {
      const normalizedIgnored = this.normalizeArtistName(ignored);
      return normalizedIgnored !== normalizedName;
    });
    
    const afterCount = this.ignoredArtists.length;
    
    if (beforeCount > afterCount) {
      this.saveToStorage();
      console.log(`✅ Removed "${artistName}" from ignored list (${beforeCount} → ${afterCount})`);
      return true;
    } else {
      console.log(`⚠️ "${artistName}" was not in ignored list`);
      return false;
    }
  }

  // NEW: Clear all ignored artists
  clearAllIgnoredArtists() {
    const count = this.ignoredArtists.length;
    this.ignoredArtists = [];
    this.saveToStorage();
    console.log(`✅ Cleared ${count} ignored artists`);
    return count;
  }

  // NEW: Show management UI
  showManagementUI() {
    if (this.ignoredArtists.length === 0) {
      alert('No ignored artists to manage.');
      return;
    }

    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      background: white;
      padding: 20px;
      border-radius: 8px;
      max-width: 500px;
      max-height: 600px;
      overflow-y: auto;
    `;

    let html = `
      <h3>🚫 Ignored Artists Management</h3>
      <p>These artists are currently ignored and won't trigger detection:</p>
      <div style="margin: 15px 0;">
    `;

    this.ignoredArtists.forEach((artist, index) => {
      html += `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border: 1px solid #ddd; margin: 5px 0; border-radius: 4px;">
          <span>${artist}</span>
          <button onclick="window.auctionetAssistant.qualityAnalyzer.artistIgnoreManager.removeIgnoredArtist('${artist}'); this.parentElement.remove();" 
                  style="background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer;">
            Remove
          </button>
        </div>
      `;
    });

    html += `
      </div>
      <div style="text-align: center; margin-top: 20px;">
        <button onclick="window.auctionetAssistant.qualityAnalyzer.artistIgnoreManager.clearAllIgnoredArtists(); document.body.removeChild(this.closest('.ignored-artists-modal'));" 
                style="background: #dc3545; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 10px;">
          Clear All
        </button>
        <button onclick="document.body.removeChild(this.closest('.ignored-artists-modal'));" 
                style="background: #6c757d; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
          Close
        </button>
      </div>
    `;

    content.innerHTML = html;
    modal.appendChild(content);
    modal.className = 'ignored-artists-modal';
    document.body.appendChild(modal);

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
  }

  // NEW: Setup keyboard shortcuts for easier management
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+C = Clear all ignored artists
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        if (this.ignoredArtists.length > 0) {
          const count = this.clearAllIgnoredArtists();
          alert(`✅ Cleared ${count} ignored artists! Page will refresh.`);
          setTimeout(() => window.location.reload(), 1000);
        } else {
          alert('No ignored artists to clear.');
        }
      }
      
      // Ctrl+Shift+I = Show ignored artists management
      if (e.ctrlKey && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        this.showManagementUI();
      }
    });
    

  }
} 