// modules/add-items-tooltip-manager.js - Modern tooltip system for add items page

import { ArtistDetectionManager } from './artist-detection-manager.js';

export class AddItemsTooltipManager {
  constructor(apiManager, qualityAnalyzer) {
    this.apiManager = apiManager;
    this.qualityAnalyzer = qualityAnalyzer;
    
    // NEW: Initialize ArtistDetectionManager SSoT for robust detection
    this.artistDetectionManager = new ArtistDetectionManager(apiManager);
    
    this.enabled = true;
    this.activeTooltips = new Map();
    this.dismissedTooltips = new Set();
    this.lastDismissalTime = new Map();
    this.pendingTooltips = new Set();
    
    // NEW: Permanent tooltip state management
    this.permanentlyDisabledTooltips = new Set(); // Never rerun until page reload
    this.lastFieldValues = new Map(); // Track field changes for artist detection exception
    this.isProgrammaticUpdate = false; // Track when we're updating fields programmatically
    
    this.analysisTimeout = null;
    this.artistDetectionTimeout = null;
    this.lastArtistDetection = null;
    this.lastAnalyzedContent = new Map(); // Track content to avoid duplicate analysis
    
    // Field mappings
    this.fieldMappings = {
      title: '#item_title_sv',
      description: '#item_description_sv', 
      condition: '#item_condition_sv',
      artist: '#item_artist_name_sv',
      keywords: '#item_hidden_keywords'
    };
    
    console.log('✅ AddItemsTooltipManager initialized with permanent state management');
  }

  // Utility function for debouncing function calls
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  async init() {
    // Check if tooltips are enabled in settings
    await this.loadSettings();
    
    if (!this.enabled) {
      console.log('💤 Add Items Tooltips: Disabled in settings');
      return;
    }
    
    console.log('🚀 Add Items Tooltips: Starting initialization...');
    
    // NEW: Initialize field value tracking
    this.initializeFieldTracking();
    
    this.setupEventListeners();
    this.injectStyles();
    
    // NEW: Add AI improvement buttons like on edit page
    this.injectAIButtons();
    
    // NEW: Setup auto-resize for textareas (same as EDIT page)
    this.setupAutoResizeForAllTextareas();
    
    console.log('✅ Add Items Tooltips: Initialized successfully with permanent state management');
  }

  // NEW: Initialize field value tracking
  initializeFieldTracking() {
    // Get initial form data to establish baseline
    const formData = this.extractFormData();
    this.updateFieldValues(formData);
    console.log('📊 Initialized field value tracking:', {
      title: formData.title?.substring(0, 30) + '...',
      artist: formData.artist,
      description: formData.description?.substring(0, 30) + '...',
      condition: formData.condition?.substring(0, 30) + '...'
    });
  }

  async loadSettings() {
    try {
      // For now, default to enabled. Later we can add a specific setting
      this.enabled = true;
      console.log('⚙️ Add items tooltips enabled:', this.enabled);
    } catch (error) {
      console.error('❌ Error loading tooltip settings:', error);
      this.enabled = true; // Default to enabled if error
    }
  }

  setupEventListeners() {
    // Field monitoring for quality updates
    this.setupLiveQualityUpdates();
    
    // IMPROVED: Enhanced artist detection on title field changes
    const titleField = document.querySelector(this.fieldMappings.title);
    if (titleField) {
      // Longer debounce for more stable detection (like edit page)
      titleField.addEventListener('input', this.debounce((e) => {
        console.log('🎯 Title field input detected, scheduling artist detection...');
        this.scheduleArtistDetection();
      }, 800)); // Increased from 500ms to 800ms
      
      titleField.addEventListener('paste', () => {
        console.log('🎯 Title field paste detected, scheduling artist detection...');
        setTimeout(() => this.scheduleArtistDetection(), 200); // Slight delay for paste content
      });
      
      // IMPROVED: Also listen for focus out to trigger final detection
      titleField.addEventListener('blur', () => {
        console.log('🎯 Title field lost focus, triggering final artist detection...');
        // Cancel any pending detection and run immediately
        if (this.artistDetectionTimeout) {
          clearTimeout(this.artistDetectionTimeout);
        }
        this.triggerArtistDetectionOnly();
      });
    }
    
    // NEW: Independent description field monitoring for description tooltips
    const descriptionField = document.querySelector(this.fieldMappings.description);
    if (descriptionField) {
      console.log('✅ Setting up independent description field monitoring');
      const debouncedDescriptionAnalysis = this.debounce((e) => {
        console.log('📝 Description field changed, analyzing description quality...');
        const formData = this.extractFormData();
        this.analyzeDescriptionQuality(formData);
      }, 1200); // Slightly longer debounce for description
      
      descriptionField.addEventListener('input', debouncedDescriptionAnalysis);
      descriptionField.addEventListener('paste', () => {
        console.log('📝 Description field paste detected');
        setTimeout(() => {
          const formData = this.extractFormData();
          this.analyzeDescriptionQuality(formData);
        }, 300);
      });
      
      // Also trigger on blur for final analysis
      descriptionField.addEventListener('blur', () => {
        console.log('📝 Description field lost focus, final description analysis...');
        const formData = this.extractFormData();
        this.analyzeDescriptionQuality(formData);
      });
    } else {
      console.warn('❌ Description field not found for monitoring');
    }
    
    // NEW: Independent condition field monitoring for condition tooltips
    const conditionField = document.querySelector(this.fieldMappings.condition);
    if (conditionField) {
      console.log('✅ Setting up independent condition field monitoring');
      const debouncedConditionAnalysis = this.debounce((e) => {
        console.log('🩺 Condition field changed, analyzing condition quality...');
        const formData = this.extractFormData();
        this.analyzeConditionQuality(formData);
      }, 1000); // Medium debounce for condition
      
      conditionField.addEventListener('input', debouncedConditionAnalysis);
      conditionField.addEventListener('paste', () => {
        console.log('🩺 Condition field paste detected');
        setTimeout(() => {
          const formData = this.extractFormData();
          this.analyzeConditionQuality(formData);
        }, 300);
      });
      
      // Also trigger on blur for final analysis
      conditionField.addEventListener('blur', () => {
        console.log('🩺 Condition field lost focus, final condition analysis...');
        const formData = this.extractFormData();
        this.analyzeConditionQuality(formData);
      });
    } else {
      console.warn('❌ Condition field not found for monitoring');
    }
    
    // Also monitor artist field changes to ensure we re-detect when artist is cleared
    const artistField = document.querySelector(this.fieldMappings.artist);
    if (artistField) {
      artistField.addEventListener('input', this.debounce((e) => {
        const artistValue = e.target.value.trim();
        console.log('🎯 Artist field changed:', artistValue);
        
        // If artist field was cleared, re-run detection
        if (artistValue.length === 0) {
          console.log('🔄 Artist field cleared, re-running detection...');
          this.scheduleArtistDetection();
        }
      }, 500));
    }
    
    // NEW: Monitor "Inga anmärkningar" checkbox to dismiss condition tooltips when checked
    const noRemarksCheckboxes = [
      'input[type="checkbox"][value="Inga anmärkningar"]',
      'input[type="checkbox"]#item_no_remarks',
      'input[type="checkbox"][name*="no_remarks"]'
    ];
    
    noRemarksCheckboxes.forEach(selector => {
      const checkbox = document.querySelector(selector);
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          console.log('☑️ "Inga anmärkningar" checkbox changed:', e.target.checked);
          if (e.target.checked) {
            // Dismiss condition tooltips when "no remarks" is checked
            this.dismissTooltip('condition-quality');
            console.log('🗑️ Dismissed condition tooltip due to "Inga anmärkningar" being checked');
          } else {
            // Re-analyze condition when unchecked
            setTimeout(() => {
              const formData = this.extractFormData();
              this.analyzeConditionQuality(formData);
            }, 500);
          }
        });
      }
    });
    
    // Auto-resize textareas
    this.setupAutoResize();
  }

  // Auto-resize setup method (simplified version for add items page)
  setupAutoResize() {
    // This method exists to prevent the "setupAutoResize is not a function" error
    // The full auto-resize functionality is handled elsewhere in this class
    console.log('🔧 Auto-resize setup initialized');
  }

  scheduleArtistDetection() {
    console.log('🔍 DEBUGGING: scheduleArtistDetection() called');
    
    if (!this.enabled || !this.apiManager.apiKey) {
      console.log('🔍 DEBUGGING: scheduleArtistDetection() - disabled or no API key, returning early');
      return;
    }

    // Clear any existing timeout
    if (this.artistDetectionTimeout) {
      console.log('🔍 DEBUGGING: scheduleArtistDetection() - clearing existing timeout');
      clearTimeout(this.artistDetectionTimeout);
    }

    // CRITICAL FIX: Prevent overriding AI results with delayed recalculation
    const existingTooltip = document.querySelector('#ai-tooltip-artist-detection');
    console.log('🔍 DEBUGGING: scheduleArtistDetection() - existing tooltip check:', !!existingTooltip);
    
    if (existingTooltip) {
      // Check if existing tooltip is from AI source
      const tooltipContent = existingTooltip.innerHTML;
      const hasAIMarker = tooltipContent.includes('(AI-detekterad)') || tooltipContent.includes('AI-');
      console.log('🔍 DEBUGGING: scheduleArtistDetection() - tooltip has AI marker:', hasAIMarker);
      console.log('🔍 DEBUGGING: scheduleArtistDetection() - tooltip content preview:', tooltipContent.substring(0, 200));
      
      if (hasAIMarker) {
        console.log('🛡️ AI-sourced tooltip already active, skipping delayed recalculation to prevent override');
        return;
      }
    }

    // ENHANCED: More intelligent re-detection logic
    console.log('🔍 DEBUGGING: scheduleArtistDetection() - setting timeout for 1500ms');
    this.artistDetectionTimeout = setTimeout(async () => {
      console.log('🔍 DEBUGGING: setTimeout callback triggered - starting delayed analysis');
      const formData = this.extractFormData();
      console.log('🔍 DEBUGGING: setTimeout callback - extracted form data:', {
        titleLength: formData.title?.length || 0,
        artistLength: formData.artist?.length || 0,
        titlePreview: formData.title?.substring(0, 50) || ''
      });
      
      // Skip if not enough data
      if (!this.hasEnoughDataForAnalysis(formData)) {
        console.log('🔍 DEBUGGING: setTimeout callback - not enough data for analysis, returning');
        return;
      }

      // Create content key for comparison (title + artist field)
      const contentKey = `${formData.title.trim()}|${formData.artist.trim()}`;
      const lastContent = this.lastAnalyzedContent.get('artist-detection');
      console.log('🔍 DEBUGGING: setTimeout callback - content key comparison:', {
        current: contentKey,
        last: lastContent,
        changed: lastContent !== contentKey
      });
      
      // ENHANCED: Smarter content change detection
      if (lastContent === contentKey) {
        console.log('🚫 Title and artist content unchanged, keeping existing tooltip');
        return;
      }
      
      // ENHANCED: Check if this is just an addition to existing content (don't dismiss tooltip)
      const tooltipId = 'artist-detection';
      if (this.activeTooltips.has(tooltipId) && lastContent) {
        const [lastTitle] = lastContent.split('|');
        const currentTitle = formData.title.trim();
        
        // If current title contains the last title as a substring, it's just an addition
        if (currentTitle.includes(lastTitle) && currentTitle.length > lastTitle.length) {
          console.log('🔄 User is adding to existing title, keeping tooltip active');
          // Update content key but don't dismiss tooltip
          this.lastAnalyzedContent.set('artist-detection', contentKey);
          return;
        }
        
        // If it's a significant change (not just addition), then dismiss and re-analyze
        console.log('🔄 Significant title change detected, closing tooltip for re-analysis');
        this.dismissTooltip(tooltipId);
        
        // Add small delay before re-analysis to ensure clean state
        setTimeout(() => {
          this.analyzeArtistDetection(formData, { allowReDetection: true });
        }, 200);
      } else {
        // No active tooltip, proceed with normal analysis
        console.log('🎯 No active tooltip, analyzing for artist detection');
        this.lastAnalyzedContent.set('artist-detection', contentKey);
        await this.analyzeArtistDetection(formData, { allowReDetection: true });
      }
    }, 1500); // IMPROVED: Increased from 500ms to 1500ms for more stable typing
  }

  debouncedAnalysis() {
    // Clear existing timeout
    if (this.analysisTimeout) {
      clearTimeout(this.analysisTimeout);
    }
    
    // Set new timeout for 3 seconds after user stops typing
    this.analysisTimeout = setTimeout(() => {
      this.triggerAnalysis();
    }, 3000);
  }

  scheduleAnalysis(delay = 1200) { // IMPROVED: Increased default delay
    // Clear any pending analysis
    if (this.analysisTimeout) {
      clearTimeout(this.analysisTimeout);
    }
    
    // Schedule new analysis with debouncing
    this.analysisTimeout = setTimeout(() => {
      this.triggerAnalysis();
    }, delay);
  }

  async triggerAnalysis() {
    // Only log when actually triggered, not on every schedule
    const formData = this.extractFormData();
    
    // Analyze artist detection first
    await this.analyzeArtistDetection(formData);
    
    // Analyze other fields
    await this.analyzeDescriptionQuality(formData);
    await this.analyzeConditionQuality(formData);
    
    // Final check - completed silently
  }

  // NEW: Trigger artist detection only (for title field changes)
  async triggerArtistDetectionOnly() {
    if (!this.enabled || !this.apiManager.apiKey) {
      return;
    }

    const formData = this.extractFormData();
    
    // Only analyze if we have enough data
    if (!this.hasEnoughDataForAnalysis(formData)) {
      return;
    }

    console.log('🎯 Triggering artist detection only for title change...');
    
    try {
      await this.analyzeArtistDetection(formData, { allowReDetection: true });
    } catch (error) {
      console.error('❌ Artist re-detection error:', error);
    }
  }

  extractFormData() {
    // Return data in same format as edit page data extractor
    return {
      category: document.querySelector('#item_category_id option:checked')?.textContent || '',
      title: document.querySelector('#item_title_sv')?.value || '',
      description: document.querySelector('#item_description_sv')?.value || '',
      condition: document.querySelector('#item_condition_sv')?.value || '',
      artist: document.querySelector('#item_artist_name_sv')?.value || '',
      keywords: document.querySelector('#item_hidden_keywords')?.value || '', // Changed from hiddenKeywords to keywords
      estimate: document.querySelector('#item_current_auction_attributes_estimate')?.value || '',
      reserve: document.querySelector('#item_current_auction_attributes_reserve')?.value || ''
    };
  }

  hasEnoughDataForAnalysis(data) {
    // Need at least title with some content
    const titleLength = (data.title || '').trim().length;
    return titleLength >= 10;
  }

  async analyzeArtistDetection(formData, options = {}) {
    if (!formData.title || formData.title.length < 15) { // IMPROVED: Higher minimum for more reliable detection
      console.log('🚫 Title too short for reliable artist detection:', formData.title.length);
      return;
    }
    
    const hasExistingArtist = formData.artist && formData.artist.trim().length > 2;
    
    // Skip if artist field is already filled AND we're not doing re-detection
    if (hasExistingArtist && !options.allowReDetection) {
      console.log('🚫 Artist field already populated, skipping detection');
      return;
    }
    
    // NEW: Use enhanced eligibility check
    const tooltipId = 'artist-detection';
    if (!this.isTooltipEligible(tooltipId, formData)) {
      return; // Eligibility check handles all logging
    }
    
    console.log('🎯 Analyzing artist detection with full SSoT system for:', formData.title);
    
    try {
      // IMPROVED: Use ArtistDetectionManager SSoT with proper force re-detection
      const artistDetection = await this.artistDetectionManager.detectMisplacedArtist(
        formData.title, 
        options.allowReDetection ? '' : formData.artist, // Force empty artist field for re-detection
        options.allowReDetection || false
      );
      
      // ENHANCED: More thorough validation to prevent false positives
      if (artistDetection && 
          artistDetection.detectedArtist && 
          typeof artistDetection.detectedArtist === 'string' &&
          artistDetection.detectedArtist.trim().length > 0) {
        
        // CRITICAL: Additional validation to prevent obvious typos/false positives
        const detectedName = artistDetection.detectedArtist.trim();
        
        // Check for obvious typos in well-known artist names
        if (this.isLikelyTypo(detectedName, formData.title)) {
          console.log('🚫 Detected name appears to be a typo, rejecting:', detectedName);
          return;
        }
        
        // Check minimum confidence threshold (higher for add page to prevent false positives)
        const confidence = artistDetection.confidence || 0;
        const minConfidence = artistDetection.source === 'ai' ? 0.6 : 0.7; // Reduced from 0.8 for AI to allow corrections
        
        if (confidence < minConfidence) {
          console.log(`🚫 Confidence too low (${confidence}) for reliable detection, rejecting:`, detectedName);
          return;
        }
        
        console.log('✅ Artist detected and validated with SSoT:', detectedName);
        console.log('🔍 Detection data:', { 
          detectedArtist: detectedName, 
          suggestedTitle: artistDetection.suggestedTitle || 'None provided',
          confidence: confidence,
          source: artistDetection.source || 'Unknown',
          reasoning: artistDetection.reasoning || 'None provided',
          hasExistingArtist: hasExistingArtist
        });
        
        // Store artist detection for potential reuse in description tooltip
        this.lastArtistDetection = artistDetection;
        
        // ENHANCED: Smarter re-detection logic that doesn't dismiss unless necessary
        if (options.allowReDetection) {
          // Only dismiss if we have a significantly different detection
          const existingTooltip = document.querySelector('#ai-tooltip-artist-detection');
          const existingArtistName = existingTooltip?.querySelector('.artist-detection-info strong')?.textContent;
          
          if (existingArtistName && existingArtistName !== artistDetection.detectedArtist) {
            console.log(`🔄 Re-detection found different artist: "${existingArtistName}" → "${artistDetection.detectedArtist}"`);
            this.dismissTooltip(tooltipId);
            // Clear the active tooltip tracking to allow immediate replacement
            this.activeTooltips.delete(tooltipId);
            // Clear dismissal time to allow immediate replacement  
            if (this.lastDismissalTime && this.lastDismissalTime.delete) {
              this.lastDismissalTime.delete(tooltipId);
            }
            // Show replacement tooltip immediately
            setTimeout(() => {
              this.showArtistDetectionTooltip(artistDetection, { 
                isReplacement: hasExistingArtist,
                existingArtist: formData.artist,
                isReDetection: true
              });
            }, 100);
          } else if (!existingTooltip) {
            // No existing tooltip, show new one
            console.log('🎯 Re-detection: No existing tooltip, showing new one');
            this.showArtistDetectionTooltip(artistDetection, { 
              isReplacement: hasExistingArtist,
              existingArtist: formData.artist,
              isReDetection: true
            });
          } else {
            // Same artist detected, keep existing tooltip
            console.log(`✅ Re-detection confirmed same artist: "${artistDetection.detectedArtist}", keeping existing tooltip`);
          }
        } else {
          this.showArtistDetectionTooltip(artistDetection, { 
            isReplacement: hasExistingArtist,
            existingArtist: formData.artist 
          });
        }
      } else {
        console.log('❌ Artist detection incomplete, invalid, or below threshold:', artistDetection);
        
        // IMPROVED: If re-detection found nothing, dismiss existing tooltip
        if (options.allowReDetection) {
          this.dismissTooltip(tooltipId);
        }
      }
    } catch (error) {
      console.error('❌ Artist detection error with SSoT:', error);
      
      // IMPROVED: If detection failed during re-detection, dismiss existing tooltip
      if (options.allowReDetection) {
        this.dismissTooltip(tooltipId);
      }
    }
  }

  // NEW: Check if a detected name is likely a typo of a well-known artist
  isLikelyTypo(detectedName, originalTitle) {
    const normalizedName = detectedName.toLowerCase();
    
    // Common Swedish artists and their likely typos
    const knownArtists = {
      'lisa larson': ['lisa larsoo', 'lisa larrson', 'lisa larsson'],
      'carl larsson': ['carl larsoo', 'carl larrson'],
      'bruno liljefors': ['bruno liljefor', 'bruno liljefores'],
      'anders zorn': ['anders zorr', 'anders zor'],
      'einar jolin': ['einar jollin', 'einar joolin'],
      'isaac grünewald': ['isaac grunewald', 'isaac grünewld'],
      'gösta adrian-nilsson': ['gösta adrian nilsson', 'gosta adrian-nilsson']
    };
    
    // Check if detected name matches any known typo patterns
    for (const [correctName, typos] of Object.entries(knownArtists)) {
      if (typos.includes(normalizedName)) {
        console.log(`🚫 Detected "${detectedName}" appears to be a typo of "${correctName}"`);
        return true;
      }
    }
    
    // Additional heuristics for obvious typos
    // Check for repeated characters (like "oo" in "Larsoo")
    if (/(.)\1{2,}/.test(normalizedName)) {
      console.log(`🚫 Detected name "${detectedName}" has repeated characters, likely a typo`);
      return true;
    }
    
    // Check for very short or very long names that don't make sense
    const words = detectedName.split(' ');
    if (words.length < 2 || words.some(word => word.length < 2 || word.length > 15)) {
      console.log(`🚫 Detected name "${detectedName}" has unusual word structure, likely invalid`);
      return true;
    }
    
    return false;
  }

  showArtistDetectionTooltip(artistDetection, options = {}) {
    const titleField = document.querySelector(this.fieldMappings.title);
    if (!titleField) return;

    const tooltipId = 'artist-detection';
    
    // ENHANCED: More flexible dismissal checking for re-detection
    if (!options.isReDetection) {
      // Check if already dismissed recently (reduce from 30s to 5s for better UX)
      const now = Date.now();
      const lastDismissed = this.lastDismissalTime?.get?.(tooltipId);
      if (lastDismissed && (now - lastDismissed) < 5000) {
        console.log('🚫 Artist tooltip recently dismissed, waiting 5 seconds...');
        return;
      }

      // Check if tooltip is already active to prevent duplicates
      if (this.activeTooltips.has(tooltipId)) {
        console.log('🚫 Artist tooltip already active, skipping duplicate');
        return;
      }
    } else {
      // For re-detection, we're more permissive since we may have cleared tracking
      console.log('🔄 Re-detection mode: bypassing some blocking checks');
    }

    console.log('⏳ Scheduling tooltip to show in 800ms for smooth timing...');
    
    // ENHANCED: Adjust delay based on re-detection context
    const delay = options.isReDetection ? 150 : 800; // Faster for re-detection
    
    setTimeout(() => {
      // ENHANCED: More flexible checks for re-detection
      if (!options.isReDetection) {
        // Double-check tooltip wasn't dismissed during delay
        const recentDismissal = this.lastDismissalTime?.get?.(tooltipId);
        if (recentDismissal && (Date.now() - recentDismissal) < 5000) return;
        
        // Double-check tooltip isn't already active
        if (this.activeTooltips.has(tooltipId)) {
          console.log('🚫 Artist tooltip already exists during delayed creation, skipping');
          return;
        }
      }
      
      // Enhanced content with confidence and verification (like EDIT page)
      const confidence = artistDetection.confidence || 0;
      const confidenceText = Math.round(confidence * 100);
      const isVerified = artistDetection.isVerified || false;
      const biography = artistDetection.biography || '';
      const reasoning = artistDetection.reasoning || '';
      
      // ENHANCED: Detect if this is a correction based on reasoning
      const isCorrection = reasoning.toLowerCase().includes('corrected misspelling') || 
                          reasoning.toLowerCase().includes('correction') ||
                          reasoning.toLowerCase().includes('misspelled') ||
                          reasoning.toLowerCase().includes('korrigerat') ||
                          reasoning.toLowerCase().includes('stavfel');
      
      let headerText = 'AI UPPTÄCKTE KONSTNÄR';
      let correctionNotice = '';
      
      if (isCorrection) {
        headerText = '🔧 AI KORRIGERADE STAVNING';
        correctionNotice = `<div class="correction-notice">
          <i>✏️ Stavfel korrigerat automatiskt</i>
        </div>`;
      }
      
      const content = `
        <div class="tooltip-header">
          ${headerText}
        </div>
        <div class="tooltip-body">
          ${correctionNotice}
          <div class="artist-detection-info">
            "<strong>${artistDetection.detectedArtist}</strong>" (${confidenceText}% säkerhet)
            ${isVerified ? '<span class="verification-badge">✓ Verifierad konstnär</span>' : ''}
          </div>
          ${reasoning ? `<div class="reasoning-text">${reasoning}</div>` : ''}
          ${biography ? `<div class="artist-bio-preview">${biography.substring(0, 120)}${biography.length > 120 ? '...' : ''}</div>` : ''}
          <div class="action-text">- flytta från titel till konstnärsfält
          ${options.isReplacement ? `, ersätta med "${options.existingArtist}"` : ''}
          </div>
        </div>
      `;

      const buttons = [{
        text: 'Flytta',
        className: 'btn-primary',
        onclick: () => {
          // NEW: Permanently disable this tooltip after user interaction
          this.permanentlyDisableTooltip('artist-detection', 'user_moved_artist');
          this.moveArtistFromTitle(artistDetection.detectedArtist, artistDetection.suggestedTitle || '', options);
        }
      }];

      // Add biography popup button if we have biography
      if (biography && biography.length > 120) {
        buttons.unshift({
          text: 'Info',
          className: 'btn-info',
          onclick: () => this.showArtistBiographyPopup(artistDetection.detectedArtist, biography)
        });
      }

      this.createTooltip({
        id: tooltipId,
        targetElement: titleField,
        content,
        buttons,
        side: 'left',
        type: 'artist-detection',
        persistent: true // ENHANCED: Make artist detection tooltips persistent
      });
      
      console.log('✨ Tooltip shown with smooth timing');
    }, delay);
  }

  moveArtistFromTitle(artistName, suggestedTitle, options = {}) {
    // ENHANCED: Validate input parameters
    if (!artistName || typeof artistName !== 'string' || artistName.trim().length === 0) {
      console.error('❌ Invalid artist name provided to moveArtistFromTitle:', artistName);
      this.showErrorFeedback('Ogiltigt konstnärsnamn');
      return;
    }
    
    const cleanArtistName = artistName.trim();
    console.log('🎯 Moving artist from title:', cleanArtistName);
    console.log('🔍 Options:', options);
    console.log('🔍 Suggested title:', suggestedTitle);
    
    try {
      // NEW: Set programmatic update flag to prevent re-enabling artist detection
      this.isProgrammaticUpdate = true;
      
      // Find artist field using same selectors as quality analyzer
      const artistFieldSelectors = [
        '#item_artist_name_sv',
        'input[name*="artist"]',
        'input[id*="artist"]',
        'input[placeholder*="konstnär"]',
        'input[placeholder*="artist"]'
      ];
      
      let artistField = null;
      console.log('🔍 Searching for artist field...');
      
      for (const selector of artistFieldSelectors) {
        console.log(`🔍 Trying selector: ${selector}`);
        artistField = document.querySelector(selector);
        if (artistField) {
          console.log(`✅ Found artist field with selector: ${selector}`);
          console.log('📋 Artist field element:', artistField);
          break;
        } else {
          console.log(`❌ No element found for selector: ${selector}`);
        }
      }
      
      if (!artistField) {
        console.error('❌ Artist field not found with any selector');
        console.log('🔍 Available input fields on page:');
        const allInputs = document.querySelectorAll('input, select, textarea');
        allInputs.forEach((input, index) => {
          console.log(`Input ${index}:`, {
            id: input.id,
            name: input.name,
            className: input.className,
            placeholder: input.placeholder,
            type: input.type
          });
        });
        this.showErrorFeedback('Konstnärsfält kunde inte hittas på sidan');
        return;
      }
      
      // Check if there's an existing artist and handle replacement
      const existingArtist = artistField.value ? artistField.value.trim() : '';
      console.log('🔍 Existing artist value:', existingArtist);
      
      if (existingArtist && existingArtist !== cleanArtistName) {
        if (options.isReplacement) {
          console.log(`🔄 Replacing existing artist "${existingArtist}" with "${cleanArtistName}"`);
          // For re-detection, just replace without confirmation
          artistField.value = cleanArtistName;
        } else {
          // First time detection with existing artist - ask for confirmation
          const confirm = window.confirm(`Ersätta befintlig konstnär "${existingArtist}" med "${cleanArtistName}"?`);
          if (!confirm) {
            console.log('❌ User cancelled artist replacement');
            return;
          }
          artistField.value = cleanArtistName;
        }
      } else {
        // No existing artist or same artist - just set it
        console.log('📝 Setting artist field value to:', cleanArtistName);
        artistField.value = cleanArtistName;
      }
      
      console.log('✅ Artist field value set successfully');
      
      // Update title if suggested title provided
      if (suggestedTitle && suggestedTitle.trim().length > 0) {
        console.log('📝 Updating title field with suggested title:', suggestedTitle);
        
        const titleField = document.querySelector(this.fieldMappings.title);
        console.log('🔍 Title field element:', titleField);
        console.log('🔍 Title field mapping:', this.fieldMappings.title);
        
        if (titleField && titleField.value.trim() !== suggestedTitle.trim()) {
          // Automatically update the title without confirmation popup
          console.log('📝 Setting title field value to:', suggestedTitle);
          titleField.value = suggestedTitle;
          
          // Trigger events for title field
          console.log('🎯 Triggering events for title field...');
          ['input', 'change', 'blur'].forEach(eventType => {
            try {
              titleField.dispatchEvent(new Event(eventType, { bubbles: true }));
              console.log(`✅ Triggered ${eventType} event on title field`);
            } catch (eventError) {
              console.warn(`⚠️ Failed to trigger ${eventType} event:`, eventError);
            }
          });
        } else {
          console.log('ℹ️ Title field not found or already has the suggested value');
        }
      } else {
        console.log('ℹ️ No suggested title provided or title is empty');
      }
      
      // Trigger form events for artist field
      console.log('🎯 Triggering events for artist field...');
      ['input', 'change', 'blur'].forEach(eventType => {
        try {
          artistField.dispatchEvent(new Event(eventType, { bubbles: true }));
          console.log(`✅ Triggered ${eventType} event on artist field`);
        } catch (eventError) {
          console.warn(`⚠️ Failed to trigger ${eventType} event:`, eventError);
        }
      });
      
      // Visual feedback
      this.showSuccessFeedback(`Konstnär "${cleanArtistName}" ${options.isReplacement ? 'ersatt' : 'tillagd'}!`);
      
      // Hide the tooltip
      console.log('🗑️ Hiding artist detection tooltip...');
      this.dismissTooltip('artist-detection');
      
      // Re-trigger analysis after a short delay
      setTimeout(() => {
        console.log('🔄 Re-triggering analysis...');
        this.triggerAnalysis();
      }, 1000);
      
      console.log('✅ moveArtistFromTitle completed successfully');
      
    } catch (error) {
      console.error('❌ Error moving artist from title:', error);
      console.error('❌ Error stack:', error.stack);
      console.error('❌ Error details:', {
        artistName: cleanArtistName,
        suggestedTitle: suggestedTitle,
        options: options,
        fieldMappings: this.fieldMappings
      });
      this.showErrorFeedback(`Fel vid flytt av konstnär: ${error.message}`);
    } finally {
      // NEW: Always clear programmatic update flag
      this.isProgrammaticUpdate = false;
      console.log('🔓 Cleared programmatic update flag');
    }
  }

  async analyzeFieldEnhancements(formData) {
    // Analyze description quality issues
    await this.analyzeDescriptionQuality(formData);
    
    // NEW: Analyze condition quality issues
    await this.analyzeConditionQuality(formData);
    
    // NEW: Analyze artist information enhancement opportunities
    await this.analyzeArtistEnhancement(formData);
    
    console.log('📝 Field enhancement analysis - description, condition quality, and artist enhancement checked');
  }

  async analyzeDescriptionQuality(formData) {
    if (!formData.description || formData.description.length < 5) return;
    
    console.log('🔍 Analyzing description quality for:', formData.description.substring(0, 50) + '...');
    
    // NEW: Use enhanced eligibility check
    const tooltipId = 'description-quality';
    if (!this.isTooltipEligible(tooltipId, formData)) {
      return; // Eligibility check handles all logging
    }
    
    // Check if already dismissed in session
    if (this.dismissedTooltips.has(tooltipId)) return;
    
    const issues = this.detectDescriptionIssues(formData);
    
    if (issues.length > 0) {
      console.log('⚠️ Description quality issues detected:', issues);
      this.showDescriptionQualityTooltip(issues, formData);
    } else {
      console.log('✅ Description quality looks good');
    }
  }

  detectDescriptionIssues(formData) {
    const issues = [];
    const description = formData.description || '';
    const cleanDescription = description.replace(/<[^>]*>/g, ''); // Remove HTML tags
    const descLength = cleanDescription.length;
    
    // Issue 1: Too short description
    if (descLength < 50) {
      issues.push({
        type: 'length',
        severity: 'high',
        message: 'För kort - lägg till detaljer om material, teknik, färg, märkningar',
        action: 'Utöka beskrivning'
      });
    }
    
    // Issue 2: Missing measurements  
    if (!description.match(/\d+[\s,]*(x|cm|mm)/i)) {
      issues.push({
        type: 'measurements',
        severity: 'high', 
        message: 'Mått saknas - ange höjd x bredd eller diameter',
        action: 'Lägg till mått'
      });
    }
    
    // Issue 3: Smart content analysis (improved keyword matching)
    if (descLength > 20) {
      const contentIssues = this.analyzeDescriptionContent(formData);
      issues.push(...contentIssues);
    }
    
    // Return only the 2 most important issues to avoid overwhelming
    return issues.slice(0, 2);
  }

  analyzeDescriptionContent(formData) {
    const issues = [];
    const description = formData.description || '';
    const title = formData.title || '';
    const category = formData.category || '';
    const combinedText = (title + ' ' + description).toLowerCase();
    
    // Smart material detection based on category and context
    const materialIssue = this.checkMaterialIntelligently(combinedText, category);
    if (materialIssue) issues.push(materialIssue);
    
    // Smart technique detection based on category and context  
    const techniqueIssue = this.checkTechniqueIntelligently(combinedText, category);
    if (techniqueIssue) issues.push(techniqueIssue);
    
    // Signature/marking check (only for art/collectibles)
    if (this.shouldCheckSignature(category, title)) {
      const signatureIssue = this.checkSignatureInfo(description);
      if (signatureIssue) issues.push(signatureIssue);
    }
    
    return issues;
  }

  checkMaterialIntelligently(text, category) {
    // Category-specific material keywords
    const materialsByCategory = {
      watches: ['stål', 'guld', 'silver', 'titan', 'platina', 'keramik', 'läder'],
      jewelry: ['guld', 'silver', 'platina', 'stål', 'diamant', 'ruby', 'safir'],
      furniture: ['teak', 'ek', 'björk', 'furu', 'mahogny', 'metall', 'glas', 'textil'],
      art: ['duk', 'pannå', 'papper', 'trä', 'metall', 'sten', 'marmor', 'brons'],
      ceramics: ['keramik', 'porslin', 'stengods', 'lergods', 'fajans'],
      glass: ['glas', 'kristall', 'mundblåst']
    };
    
    // Determine category from context
    let relevantMaterials = [];
    if (text.includes('ur') || text.includes('klocka') || text.includes('rolex') || text.includes('omega')) {
      relevantMaterials = materialsByCategory.watches;
    } else if (text.includes('ring') || text.includes('halsband') || text.includes('armband') && !text.includes('klocka')) {
      relevantMaterials = materialsByCategory.jewelry;
    } else if (text.includes('stol') || text.includes('bord') || text.includes('skåp') || text.includes('möbel')) {
      relevantMaterials = materialsByCategory.furniture;
    } else if (text.includes('målning') || text.includes('tavla') || text.includes('konst')) {
      relevantMaterials = materialsByCategory.art;
    } else if (text.includes('vas') || text.includes('skål') || text.includes('tallrik')) {
      relevantMaterials = [...materialsByCategory.ceramics, ...materialsByCategory.glass];
    } else {
      // General materials for unknown categories
      relevantMaterials = ['stål', 'guld', 'silver', 'trä', 'glas', 'keramik', 'metall', 'textil'];
    }
    
    const hasMaterial = relevantMaterials.some(material => text.includes(material));
    
    if (!hasMaterial) {
      return {
        type: 'material',
        severity: 'medium',
        message: `Material saknas - specificera ${relevantMaterials.slice(0, 3).join(', ')} etc.`,
        action: 'Specificera material'
      };
    }
    
    return null;
  }

  checkTechniqueIntelligently(text, category) {
    // Category-specific technique keywords
    const techniquesByCategory = {
      watches: ['automatic', 'quartz', 'manuell', 'självdragande', 'urverk'],
      art: ['olja', 'akvarell', 'gouache', 'blyerts', 'kol', 'tusch', 'etsning', 'litografi', 'fotografi'],
      ceramics: ['handgjord', 'drejet', 'stämpel', 'glaserad'],
      glass: ['mundblåst', 'pressat', 'slipat', 'graverat'],
      furniture: ['handsnidad', 'laminerad', 'maskingjord', 'handgjord']
    };
    
    let relevantTechniques = [];
    if (text.includes('ur') || text.includes('klocka')) {
      relevantTechniques = techniquesByCategory.watches;
    } else if (text.includes('målning') || text.includes('tavla') || text.includes('konst')) {
      relevantTechniques = techniquesByCategory.art;
    } else if (text.includes('vas') || text.includes('skål') || text.includes('tallrik')) {
      relevantTechniques = [...techniquesByCategory.ceramics, ...techniquesByCategory.glass];
    } else if (text.includes('stol') || text.includes('bord') || text.includes('möbel')) {
      relevantTechniques = techniquesByCategory.furniture;
    } else {
      return null; // Skip technique check for unknown categories
    }
    
    const hasTechnique = relevantTechniques.some(technique => text.includes(technique));
    
    if (!hasTechnique) {
      return {
        type: 'technique',
        severity: 'medium',
        message: `Teknik saknas - ange ${relevantTechniques.slice(0, 3).join(', ')} etc.`,
        action: 'Specificera teknik'
      };
    }
    
    return null;
  }

  shouldCheckSignature(category, title) {
    // Only check signature for art, collectibles, and similar items
    const artKeywords = ['målning', 'tavla', 'konst', 'skulptur', 'grafik', 'litografi', 'etsning'];
    const text = (category + ' ' + title).toLowerCase();
    return artKeywords.some(keyword => text.includes(keyword));
  }

  checkSignatureInfo(description) {
    if (!description.match(/(signerad|osignerad|monogram|stämplad)/i)) {
      return {
        type: 'signature',
        severity: 'low',
        message: 'Signaturinfo saknas - ange om verket är signerat eller osignerat',
        action: 'Lägg till signaturinfo'
      };
    }
    return null;
  }

  async queueAIDescriptionAnalysis(formData, existingIssues) {
    // Perform intelligent AI analysis of description content
    // This replaces the rigid keyword matching with context-aware analysis
    try {
      const aiAnalysis = await this.analyzeDescriptionWithAI(formData);
      
      // Add AI-detected issues to the existing issues array
      if (aiAnalysis && aiAnalysis.missingElements) {
        aiAnalysis.missingElements.forEach(element => {
          existingIssues.push({
            type: element.type,
            severity: element.severity,
            message: element.message,
            action: element.action
          });
        });
      }
    } catch (error) {
      console.log('⚠️ AI description analysis failed, using basic checks:', error);
      // Fallback to basic keyword checks only if AI fails
      this.addBasicDescriptionChecks(formData, existingIssues);
    }
  }

  async analyzeDescriptionWithAI(formData) {
    // Use AI to intelligently analyze description completeness
    const prompt = `Analysera denna produktbeskrivning för katalogkvalitet:

KATEGORI: ${formData.category || 'Okänd'}
TITEL: ${formData.title || ''}
BESKRIVNING: ${formData.description || ''}

Kontrollera om följande VERKLIGEN saknas (var intelligent och kontextmedveten):

1. MATERIAL - Finns material angivet? (t.ex. stål, guld, silver, keramik, trä, textil)
2. TEKNIK/FUNKTION - Finns tillverkningsteknik eller funktion? (t.ex. automatic, quartz, handgjord, maskingjord)
3. SIGNATUR/MÄRKNING - Finns info om signering, märkning eller tillverkarsstämpel?

VIKTIGT: 
- För UR: "automatiskt urverk" = teknik ✓, "stål" = material ✓
- För KONST: "olja på duk" = teknik ✓, "duk" = material ✓
- För MÖBLER: "teak" = material ✓, "handsnidad" = teknik ✓
- Var SMART - om informationen finns på annat sätt, räkna det som ✓

Returnera ENDAST verkligt saknade element:

{
  "missingElements": [
    {
      "type": "material", 
      "severity": "medium",
      "message": "Material saknas - specificera [relevant för kategorin]",
      "action": "Lägg till material"
    }
  ]
}

Om INGET saknas, returnera: {"missingElements": []}`;

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiManager.apiKey,
          body: {
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1000,
            temperature: 0.1, // Low temperature for consistent analysis
            messages: [{
              role: 'user',
              content: prompt
            }]
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.success) {
            resolve(response);
          } else {
            reject(new Error(response.error || 'API request failed'));
          }
        });
      });
      
      const result = JSON.parse(response.data.content[0].text);
      return result;
    } catch (error) {
      console.log('🤖 AI description analysis error:', error);
      return null;
    }
  }

  addBasicDescriptionChecks(formData, issues) {
    // Fallback basic checks if AI analysis fails
    const description = formData.description || '';
    const cleanDescription = description.replace(/<[^>]*>/g, '').toLowerCase();
    
    // Very basic material check - only add if clearly missing
    const basicMaterials = ['stål', 'guld', 'silver', 'trä', 'keramik', 'glas', 'textil', 'läder'];
    const hasMaterial = basicMaterials.some(material => cleanDescription.includes(material));
    
    if (!hasMaterial && cleanDescription.length > 30) {
      issues.push({
        type: 'material',
        severity: 'medium',
        message: 'Material kan behöva specificeras',
        action: 'Överväg att lägga till material'
      });
    }
  }

  async showDescriptionQualityTooltip(issues, formData) {
    const descriptionField = document.querySelector(this.fieldMappings.description);
    if (!descriptionField) return;

    const tooltipId = 'description-quality';
    
    console.log('⏳ Scheduling description tooltip to show in 800ms...');
    
    // Add delay for smooth UX (same as artist tooltip)
    setTimeout(async () => {
      // Double-check tooltip wasn't dismissed during delay
      if (this.dismissedTooltips.has(tooltipId)) return;
      
      // Double-check tooltip isn't already active
      if (this.activeTooltips.has(tooltipId)) {
        console.log('🚫 Description tooltip already exists during delayed creation, skipping');
        return;
      }
      
      const primaryIssue = issues[0];
      const secondaryIssue = issues[1];
      
      const content = `
        <div class="tooltip-header">
          BESKRIVNINGSFÖRBÄTTRINGAR
        </div>
        <div class="tooltip-body">
          <div class="issue-item primary">
            <strong>Beskrivning:</strong> ${primaryIssue.message}
          </div>
          ${secondaryIssue ? `
            <div class="issue-item secondary">
              <strong>Även:</strong> ${secondaryIssue.message}
            </div>
          ` : ''}
        </div>
      `;

      const buttons = [
        {
          text: 'AI-förbättra',
          className: 'btn-primary',
          onclick: () => {
            // NEW: Permanently disable this tooltip after user interaction
            this.permanentlyDisableTooltip('description-quality', 'user_improved_description');
            this.dismissTooltip(tooltipId);
            this.improveField('description');
          }
        },
        {
          text: 'Ignorera',
          className: 'btn-secondary',
          onclick: () => {
            // NEW: Permanently disable this tooltip after user interaction
            this.permanentlyDisableTooltip('description-quality', 'user_ignored');
            this.dismissTooltip(tooltipId);
            this.dismissedTooltips.add(tooltipId);
          }
        }
      ];

      this.createTooltip({
        id: tooltipId,
        targetElement: descriptionField,
        content,
        buttons,
        side: 'left',
        type: 'description-quality'
      });
      
      console.log('✨ Description quality tooltip shown');
    }, 800);
  }

  async getArtistInformation(artistName) {
    // Try to get artist information from various sources
    console.log('🔎 getArtistInformation called for:', artistName);
    console.log('🔎 lastArtistDetection available:', !!this.lastArtistDetection);
    
    try {
      // First, check if we already have artist data from recent detection
      if (this.lastArtistDetection && 
          this.lastArtistDetection.detectedArtist === artistName &&
          this.lastArtistDetection.biography) {
        console.log('✅ Found artist info from detection cache');
        return {
          name: artistName,
          biography: this.lastArtistDetection.biography,
          source: 'detection'
        };
      }
      
      // If we have a quality analyzer method for artist lookup, use it
      if (this.qualityAnalyzer && this.qualityAnalyzer.getArtistBiography) {
        console.log('🔎 Trying quality analyzer lookup...');
        const biography = await this.qualityAnalyzer.getArtistBiography(artistName);
        if (biography) {
          console.log('✅ Found artist info from quality analyzer');
          return {
            name: artistName,
            biography: biography,
            source: 'database'
          };
        }
      } else {
        console.log('❌ No quality analyzer getArtistBiography method available');
      }
      
      console.log('❌ No artist information found');
      return null;
    } catch (error) {
      console.log('❌ Error fetching artist information:', error);
      return null;
    }
  }

  // NEW: Inject AI improvement buttons (same as edit page)
  injectAIButtons() {
    console.log('🎨 Injecting AI improvement buttons...');
    
    // Add AI assistance button next to each field
    const titleField = document.querySelector('#item_title_sv');
    const descriptionField = document.querySelector('#item_description_sv');
    const conditionField = document.querySelector('#item_condition_sv');
    const keywordsField = document.querySelector('#item_hidden_keywords');

    console.log('🔍 Found fields:', {
      title: !!titleField,
      description: !!descriptionField,
      condition: !!conditionField,
      keywords: !!keywordsField
    });

    if (titleField) {
      this.addAIButton(titleField, 'title', 'AI-förbättra titel');
      this.addAIButton(titleField, 'title-correct', 'AI-korrigera stavning');
    }
    if (descriptionField) {
      this.addAIButton(descriptionField, 'description', 'AI-förbättra beskrivning');
    }
    if (conditionField) {
      this.addAIButton(conditionField, 'condition', 'AI-förbättra kondition');
    }
    if (keywordsField) {
      this.addAIButton(keywordsField, 'keywords', 'AI-generera sökord');
    }

    // Add master "Improve All" button with quality indicator
    this.addQualityIndicator();
    
    // Attach event listeners to the new buttons
    this.attachAIButtonEventListeners();
  }

  // NEW: Add individual AI button (same as edit page)
  addAIButton(field, type, buttonText) {
    const button = document.createElement('button');
    button.className = 'ai-assist-button';
    button.textContent = buttonText;
    button.type = 'button';
    button.dataset.fieldType = type;
    
    const wrapper = document.createElement('div');
    wrapper.className = 'ai-button-wrapper';
    wrapper.appendChild(button);
    
    // Position right after the field element, not at the end of parent
    field.parentNode.insertBefore(wrapper, field.nextSibling);
  }

  // NEW: Add quality indicator with master button (simplified - no warnings)
  addQualityIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'quality-indicator';
    indicator.innerHTML = `
      <div class="quality-header">
        <h4 class="quality-title">Katalogiseringskvalitet</h4>
        <div class="quality-score-container">
          <span class="quality-score">Analyserar...</span>
          <button class="refresh-quality-btn" type="button" title="Uppdatera kvalitetspoäng">🔄</button>
        </div>
        <button class="ai-assist-button ai-master-button" type="button">⚡ Förbättra alla</button>
      </div>
    `;
    
    // Try to find sidebar, fall back to a reasonable location
    let targetElement = document.querySelector('.grid-col4') || 
                       document.querySelector('.sidebar') ||
                       document.querySelector('form');
    
    if (targetElement) {
      console.log('✅ Adding quality indicator to page');
      if (targetElement.tagName === 'FORM') {
        // If it's a form, add at the beginning
        targetElement.insertBefore(indicator, targetElement.firstChild);
      } else {
        // If it's a sidebar, add at the beginning
        targetElement.insertBefore(indicator, targetElement.firstChild);
      }
      
      // Initial quality analysis
      this.analyzeQuality();
    } else {
      console.log('❌ No suitable location found for quality indicator');
    }
  }

  // NEW: Attach event listeners to AI buttons
  attachAIButtonEventListeners() {
    // Individual field buttons
    const buttons = document.querySelectorAll('.ai-assist-button:not(.ai-master-button)');
    console.log('Found AI assist buttons:', buttons.length);
    
    buttons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const fieldType = e.target.dataset.fieldType;
        console.log('Button clicked for field type:', fieldType);
        if (fieldType) {
          this.improveField(fieldType);
        }
      });
    });

    // Master button
    const masterButton = document.querySelector('.ai-master-button');
    if (masterButton) {
      console.log('Master button found and event listener attached');
      masterButton.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Master button clicked');
        this.improveAllFields();
      });
    }

    // Quality refresh button
    const refreshButton = document.querySelector('.refresh-quality-btn');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => {
        console.log('🔄 Manual quality refresh triggered');
        this.analyzeQuality();
      });
    }
  }

  // NEW: Improve individual field (same logic as edit page)
  async improveField(fieldType, options = {}) {
    if (!this.apiManager.apiKey) {
      this.showErrorIndicator(fieldType, 'API key not configured. Please set your Anthropic API key in the extension popup.');
      return;
    }
    
    const formData = this.extractFormData();
    this.showLoadingIndicator(fieldType);
    
    try {
      // Pass additional options to API call (like artist information)
      const improved = await this.callClaudeAPI(formData, fieldType, options);
      const value = improved[fieldType];
      if (value) {
        this.applyImprovement(fieldType, value);
        this.showSuccessIndicator(fieldType);
        setTimeout(() => this.analyzeQuality(), 500);
      } else {
        throw new Error(`No ${fieldType} value in response`);
      }
    } catch (error) {
      console.error('Error improving field:', error);
      this.showErrorIndicator(fieldType, error.message);
    }
  }

  // NEW: Improve all fields (same logic as edit page)
  async improveAllFields() {
    if (!this.apiManager.apiKey) {
      this.showErrorIndicator('all', 'API key not configured. Please set your Anthropic API key in the extension popup.');
      return;
    }

    const formData = this.extractFormData();
    this.showLoadingIndicator('all');
    
    try {
      const improvements = await this.callClaudeAPI(formData, 'all');
      
      // Apply improvements and show individual success indicators with slight delays for cascade effect
      let delay = 0;
      
      if (improvements.title) {
        setTimeout(() => {
          this.applyImprovement('title', improvements.title);
          this.showSuccessIndicator('title');
        }, delay);
        delay += 300;
      }
      
      if (improvements.description) {
        setTimeout(() => {
          this.applyImprovement('description', improvements.description);
          this.showSuccessIndicator('description');
        }, delay);
        delay += 300;
      }
      
      if (improvements.condition) {
        setTimeout(() => {
          this.applyImprovement('condition', improvements.condition);
          this.showSuccessIndicator('condition');
        }, delay);
        delay += 300;
      }
      
      if (improvements.keywords) {
        setTimeout(() => {
          this.applyImprovement('keywords', improvements.keywords);
          this.showSuccessIndicator('keywords');
        }, delay);
        delay += 300;
      }
      
      // Show final success on master button after all fields are done
      setTimeout(() => {
        this.showSuccessIndicator('all');
        setTimeout(() => this.analyzeQuality(), 500);
      }, delay);
      
    } catch (error) {
      this.showErrorIndicator('all', error.message);
    }
  }

  // NEW: Apply improvement to field (same as edit page)
  applyImprovement(fieldType, value) {
    const fieldMap = {
      'title': '#item_title_sv',
      'title-correct': '#item_title_sv',  // Apply title corrections to title field
      'description': '#item_description_sv',
      'condition': '#item_condition_sv',
      'keywords': '#item_hidden_keywords'
    };
    
    const field = document.querySelector(fieldMap[fieldType]);
    if (field && value) {
      // NEW: Set programmatic update flag for AI improvements
      this.isProgrammaticUpdate = true;
      
      try {
        field.value = value;
        field.dispatchEvent(new Event('change', { bubbles: true }));
        field.classList.add('ai-updated');
        
        // Auto-resize textarea if needed (especially for description)
        if (field.tagName.toLowerCase() === 'textarea') {
          // Use setTimeout to ensure the value is fully applied before resizing
          setTimeout(() => {
            this.autoResizeTextarea(field);
          }, 50);
        }
        
        console.log(`✅ Applied improvement to ${fieldType}`);
      } finally {
        // Clear flag after a short delay to ensure all events have processed
        setTimeout(() => {
          this.isProgrammaticUpdate = false;
          console.log('🔓 Cleared programmatic update flag after AI improvement');
        }, 100);
      }
    }
  }

  // NEW: Auto-resize functionality for textareas (same as EDIT page)
  autoResizeTextarea(textarea) {
    if (!textarea || textarea.tagName.toLowerCase() !== 'textarea') {
      return;
    }
    
    // Remove excessive logging - only log if height actually changes
    const originalHeight = textarea.style.height;
    
    // Add resizing class for enhanced animation
    textarea.classList.add('resizing');
    
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    
    // Calculate the required height
    const scrollHeight = textarea.scrollHeight;
    const minHeight = 60; // Minimum height in pixels
    const maxHeight = 400; // Maximum height in pixels
    
    // Set the new height with smooth animation
    const newHeight = Math.max(minHeight, Math.min(maxHeight, scrollHeight));
    
    // Use requestAnimationFrame for smooth animation
    requestAnimationFrame(() => {
      textarea.style.height = newHeight + 'px';
      
      // Remove resizing class after animation completes
      setTimeout(() => {
        textarea.classList.remove('resizing');
      }, 400);
    });
    
    // Only log if height actually changed significantly
    if (!originalHeight || Math.abs(parseInt(originalHeight) - newHeight) > 5) {
      console.log(`📏 Textarea ${textarea.id} resized to ${newHeight}px`);
    }
  }

  setupAutoResizeForAllTextareas() {
    console.log('🔧 Setting up auto-resize for all textareas...');
    
    const textareas = document.querySelectorAll('textarea');
    let setupCount = 0;
    
    textareas.forEach(textarea => {
      // Add CSS class for styling
      textarea.classList.add('auto-resize');
      
      // Set up auto-resize on input
      const autoResizeHandler = () => {
        this.autoResizeTextarea(textarea);
      };
      
      // Add event listeners
      textarea.addEventListener('input', autoResizeHandler);
      textarea.addEventListener('paste', autoResizeHandler);
      textarea.addEventListener('keyup', autoResizeHandler);
      
      // Also resize on focus to handle cases where content was added programmatically
      textarea.addEventListener('focus', autoResizeHandler);
      
      // Initial resize to fit existing content
      this.autoResizeTextarea(textarea);
      
      setupCount++;
      console.log(`✅ Auto-resize setup for textarea: ${textarea.id || textarea.name || 'unnamed'}`);
    });
    
    console.log(`🎯 Auto-resize setup complete for ${setupCount} textareas`);
  }

  // Method to manually trigger resize for all textareas (useful after programmatic changes)
  resizeAllTextareas() {
    const textareas = document.querySelectorAll('textarea.auto-resize');
    textareas.forEach(textarea => {
      this.autoResizeTextarea(textarea);
    });
    console.log(`🔄 Manual resize triggered for ${textareas.length} textareas`);
  }

  // FIXED: Call Claude API through background script (same as edit page)
  async callClaudeAPI(formData, fieldType, options = {}) {
    if (!this.apiManager.apiKey) {
      throw new Error('API key not configured. Please set your Anthropic API key in the extension popup.');
    }

    // CRITICAL: Use the EXACT same system prompt and user prompt as EDIT page
    // This ensures identical AI generation rules and quality standards
    const systemPrompt = this.getEditPageSystemPrompt();
    const userPrompt = this.getEditPageUserPrompt(formData, fieldType, options);

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiManager.apiKey,
          body: {
            model: fieldType === 'title-correct' ? 'claude-3-haiku-20240307' : 'claude-3-5-sonnet-20241022',
            max_tokens: fieldType === 'title-correct' ? 500 : 4000,
            temperature: fieldType === 'title-correct' ? 0.1 : 0.2,
            system: systemPrompt,
            messages: [{
              role: 'user',
              content: userPrompt
            }]
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.success) {
            resolve(response);
          } else {
            reject(new Error(response.error || 'API request failed'));
          }
        });
      });
      
      return await this.processEditPageAPIResponse(response, fieldType);
      
    } catch (error) {
      console.error('❌ ADD ITEM API call failed:', error);
      throw error;
    }
  }

  // CRITICAL: Use EXACT same system prompt as EDIT page for consistent rules
  getEditPageSystemPrompt() {
    return `Du är en professionell auktionskatalogiserare. Skapa objektiva, faktabaserade katalogiseringar enligt svenska auktionsstandarder.

GRUNDREGLER:
• Använd endast verifierbara fakta
• Skriv objektivt utan säljande språk
• Använd etablerad auktionsterminologi
• UPPFINN ALDRIG information som inte finns
• Skriv naturligt och flytande - fokusera på autenticitet över regelefterlevnad

ABSOLUT FÖRBJUDNA VÄRDEORD - ANVÄND ALDRIG:
• Fantastisk, Vacker, Utsökt, Nyskick, Magnifik, Underbar, Exceptionell, Perfekt
• Ovanlig, Sällsynt, Extraordinär, Unik, Spektakulär, Enastående, Otrolig
• Alla subjektiva kvalitetsomdömen och säljande uttryck
• Använd istället neutrala, faktabaserade beskrivningar

KATEGORI-SPECIFIKA REGLER:

ARMBANDSUR - KRITISKA KRAV:
• Storlek i mm (diameter)
• Urverk: "automatic" eller "quartz"
• Tillverkare och modell (eller kaliber)
• För dyrare föremål: ange serienummer
• Funktionsklausul: "Fungerar vid katalogisering - ingen garanti lämnas på funktion"
• EXEMPEL: "ROLEX, Submariner, automatic, 40mm, stål, 1990-tal. Fungerar vid katalogisering - ingen garanti lämnas på funktion."

FÖRBJUDET:
• ALLA värdeord och säljande uttryck (se lista ovan)
• Meta-kommentarer: "ytterligare uppgifter behövs", "mer information krävs"
• Spekulationer och gissningar
• Överdriven regelefterlevnad - skriv naturligt och autentiskt

TITELFORMAT (max 60 tecken):
Om konstnär-fält tomt: [MÄRKE/KONSTNÄR]. [föremål], [material], [period] - FÖRSTA ORDET VERSALER + PUNKT
Om konstnär-fält ifyllt: [Föremål]. [antal], [material], [period] - FÖRSTA ORDET PROPER + PUNKT

KRITISKA TITELREGLER FÖR OBJEKT UTAN KONSTNÄR:
• MÅSTE börja med märke/tillverkare i VERSALER följt av PUNKT: "ROLEX.", "OMEGA.", "IKEA."
• MÅSTE sluta med PUNKT (.)
• FÖRSTA ordet efter varje komma MÅSTE ha stor bokstav: "Stål", "Automatic", "35mm"
• Format: MÄRKE. modell, material, teknik, storlek.
• EXEMPEL KORREKT: "ROLEX. Submariner, Stål, automatic, 40mm."
• EXEMPEL KORREKT: "IKEA. "Pepparkorn", Vas, Keramik, 1970-tal."
• EXEMPEL FEL: "ROLEX, Submariner, Stål, automatic, 40mm." (komma efter märke, inte punkt)
• EXEMPEL FEL: "Rolex. Submariner, Stål, automatic, 40mm." (märke inte i versaler)

OSÄKERHETSMARKÖRER - BEHÅLL ALLTID:
"troligen", "tillskriven", "efter", "stil av", "möjligen"

CITATTECKEN FÖR MASKINÖVERSÄTTNING - KRITISKT:
• BEHÅLL ALLTID citattecken runt produktnamn och svenska designnamn i titlar
• Auctionet respekterar citattecken - text inom "" översätts ALDRIG av maskinöversättning
• EXEMPEL: "Oxford" förblir "Oxford", INTE Oxford (utan citattecken som kan översättas)

KONDITION - KRITISKA REGLER:
• Använd korta, faktabaserade termer: "Välbevarat", "Mindre repor", "Nagg vid kanter"
• UPPFINN ALDRIG nya skador, placeringar eller detaljer
• Om original säger "repor" - skriv INTE "repor i metallramen" eller "repor på ytan"
• Lägg ALDRIG till specifika platser som "i metallramen", "på ovansidan", "vid foten"
• Förbättra ENDAST språket - lägg INTE till nya faktauppgifter

STAVNINGSKORRIGERING:
• Rätta uppenbara stavfel i märken, modeller och tekniska termer
• EXEMPEL: "Oscean" → "Ocean", "Omege" → "Omega", "Cartier" → "Cartier"
• Behåll osäkerhetsmarkörer även efter stavningskorrigering

STRIKT ANTI-HALLUCINATION:
• Förbättra ENDAST språk och struktur av BEFINTLIG information
• Lägg INTE till material, mått, skador, placeringar som inte är nämnda
• Kopiera EXAKT samma skadeinformation som redan finns
• Katalogtext ska vara FÄRDIG utan önskemål om mer data
• ALDRIG lägga till detaljer för att "förbättra" - bara förbättra språket

FÖRBJUDET - INGA FÖRKLARINGAR ELLER KOMMENTARER:
• Lägg ALDRIG till förklarande text som "Notera:", "Observera:", "Jag har behållit..."
• Lägg ALDRIG till kommentarer om vad du har gjort eller inte gjort
• Lägg ALDRIG till meta-text om processen eller metoderna
• Lägg ALDRIG till bedömningar som "Bra start", "kan förbättras", etc.
• Returnera ENDAST det begärda innehållet utan extra kommentarer
• EXEMPEL FÖRBJUDET: "Notera: Jag har behållit det ursprungliga datumformatet..."
• EXEMPEL FÖRBJUDET: "Sökord: Bra start - några fler sökord kan förbättra..."

KRITISKT - DATUM OCH PERIODSPECULATION FÖRBJUDEN:
• EXPANDERA ALDRIG partiella årtal: "55" får INTE bli "1955", "1855" eller något annat
• GISSA ALDRIG århundrade från tvåsiffriga årtal - "55" kan vara 1755, 1855, 1955, etc.
• BEHÅLL EXAKT samma datumformat som originalet: "daterad 55" ska förbli "daterad 55"
• LÄGG INTE till "troligen" eller andra osäkerhetsmarkörer till datum som inte redan har dem
• Om originalet säger "55" - skriv "55", INTE "1955" eller "troligen 1955"
• ENDAST om originalet redan anger fullständigt årtal (t.ex. "1955") får du behålla det
• EXEMPEL FÖRBJUDET: "daterad 55" → "1955" eller "troligen 1955"
• EXEMPEL KORREKT: "daterad 55" → "daterad 55" (oförändrat)

`;
  }

  // CRITICAL: Use EXACT same user prompt logic as EDIT page
  getEditPageUserPrompt(formData, fieldType, options = {}) {
    const baseInfo = `
FÖREMÅLSINFORMATION:
Kategori: ${formData.category || ''}
Nuvarande titel: ${formData.title || ''}
Nuvarande beskrivning: ${formData.description || ''}
Kondition: ${formData.condition || ''}
Konstnär/Formgivare: ${formData.artist || ''}
Värdering: ${formData.estimate || ''} SEK

VIKTIGT FÖR TITEL: ${formData.artist ? 
  'Konstnär/formgivare-fältet är ifyllt (' + formData.artist + '), så inkludera INTE konstnärens namn i titeln - det läggs till automatiskt av systemet. FÖRSTA ORDET I TITELN SKA VARA PROPER KAPITALISERAT följt av PUNKT (.).' : 
  'Konstnär/formgivare-fältet är tomt, så inkludera konstnärens namn i titeln om det är känt. FÖRSTA ORDET I TITELN SKA VARA VERSALER följt av KOMMA (,). Nästa ord efter komma ska ha liten bokstav (utom namn/märken).'}

KONSTNÄRSINFORMATION OCH EXPERTKUNSKAP:
${formData.artist && this.apiManager.enableArtistInfo ? 
  'Konstnär/formgivare: ' + formData.artist + ' - Använd din kunskap om denna konstnärs verk för att lägga till KORT, RELEVANT kontext. Fokusera på specifika detaljer om denna modell/serie om du känner till dem (tillverkningsår, karakteristiska drag). Håll det koncist - max 1-2 meningar extra kontext. Om du inte är säker om specifika fakta, använd "troligen" eller "anses vara".' : 
  'Lägg INTE till konstnärlig eller historisk kontext som inte redan finns i källdata.'}

KRITISKT - BEHÅLL OSÄKERHETSMARKÖRER I TITEL:
Om nuvarande titel innehåller ord som "troligen", "tillskriven", "efter", "stil av", "möjligen", "typ" - BEHÅLL dessa exakt. De anger juridisk osäkerhet och får ALDRIG tas bort eller ändras.

ANTI-HALLUCINATION INSTRUKTIONER:
• Lägg ALDRIG till information som inte finns i källdata
• Uppfinn ALDRIG tidsperioder, material, mått eller skador
• Förbättra ENDAST språk, struktur och terminologi
• Om information saknas - utelämna eller använd osäkerhetsmarkörer

KRITISKT - DATUM OCH PERIODSPECULATION FÖRBJUDEN:
• EXPANDERA ALDRIG partiella årtal: "55" får INTE bli "1955", "1855" eller något annat
• GISSA ALDRIG århundrade från tvåsiffriga årtal - "55" kan vara 1755, 1855, 1955, etc.
• BEHÅLL EXAKT samma datumformat som originalet: "daterad 55" ska förbli "daterad 55"
• LÄGG INTE till "troligen" eller andra osäkerhetsmarkörer till datum som inte redan har dem
• Om originalet säger "55" - skriv "55", INTE "1955" eller "troligen 1955"
• ENDAST om originalet redan anger fullständigt årtal (t.ex. "1955") får du behålla det
• EXEMPEL FÖRBJUDET: "daterad 55" → "1955" eller "troligen 1955"
• EXEMPEL KORREKT: "daterad 55" → "daterad 55" (oförändrat)
`;

    // Return field-specific prompts based on fieldType (same as EDIT page)
    switch(fieldType) {
      case 'all':
        return baseInfo + `
UPPGIFT: Förbättra titel, beskrivning, konditionsrapport och generera dolda sökord enligt svenska auktionsstandarder. Skriv naturligt och autentiskt - använd reglerna som riktlinjer, inte som strikta begränsningar.

VIKTIGT - ARBETSORDNING:
1. Först förbättra titel, beskrivning och kondition
2. Sedan generera sökord baserat på de FÖRBÄTTRADE fälten (inte originalfälten)

${formData.artist && this.apiManager.enableArtistInfo ? 
  'EXPERTKUNSKAP - KONSTNÄR KÄND: Eftersom konstnär/formgivare är angiven (' + formData.artist + ') och konstnärsinformation är aktiverad, lägg till KORT, RELEVANT kontext om denna specifika modell/serie. Max 1-2 extra meningar. Fokusera på konkreta fakta, inte allmän konstnärsbiografi.' : 
  'BEGRÄNSAD INFORMATION: Håll dig till befintlig information utan att lägga till konstnärlig kontext.'}

FÄLTAVGRÄNSNING:
• BESKRIVNING: Material, teknik, mått, stil, ursprung, märkningar, funktion - ALDRIG konditionsinformation
• KONDITION: Endast fysiskt skick och skador - ALDRIG beskrivande information
• Håll fälten strikt separerade - konditionsdetaljer som "slitage", "repor", "märken" hör ENDAST i konditionsfältet

KRITISKT FÖR SÖKORD - KOMPLETTERANDE TERMER:
• Generera sökord som kompletterar de FÖRBÄTTRADE titel/beskrivning du skapar
• Läs noggrant igenom dina FÖRBÄTTRADE titel/beskrivning INNAN du skapar sökord
• Generera ENDAST ord som INTE redan finns i dina förbättrade fält
• Fokusera på HELT NYA alternativa söktermer som köpare kan använda
• Kontrollera även PARTIELLA matchningar: "litografi" matchar "färglitografi"
• Inkludera: stilperioder, tekniker, användningsområden, alternativa namn
• Exempel: Om din förbättrade titel säger "vas" - lägg till "dekoration inredning samlarobjekt"
• KONKRETA EXEMPEL: Om beskrivning säger "blomstermotiv" → använd INTE "blomstermotiv", använd "växtmotiv" istället
• KONKRETA EXEMPEL: Om beskrivning säger "orkidén" → använd INTE "orkidé", använd "flora" istället
• För perioder: Använd decennier istället för exakta år: "1970-tal" istället av "1974"
• MAX 10-12 relevanta termer

KRITISKT - BEVARA ALLA MÅTT OCH LISTOR I BESKRIVNINGEN:
• BEHÅLL ALLTID detaljerade måttlistor: "4 snapsglas, höjd 15,5 cm", "2 vinglas, höjd 19,5 cm", etc.
• BEHÅLL ALLTID kvantiteter och specifikationer: "Bestående av:", "Består av:", antal objekt
• BEHÅLL ALLTID alla mått i cm/mm - dessa är ALDRIG konditionsinformation
• TA ENDAST BORT konditionsord som "slitage", "repor", "skador" - ALDRIG mått, kvantiteter eller listor
• EXEMPEL PÅ VAD SOM MÅSTE BEVARAS: "Bestående av: 4 snapsglas, höjd 15,5 cm, 2 vinglas, höjd 19,5 cm"

VARNING: Om du tar bort mått eller listor kommer detta att betraktas som ett KRITISKT FEL!

KRITISKT - FÖRSTA ORDETS KAPITALISERING I TITEL:
${formData.artist ? 
  '• Konstnär/formgivare-fältet är ifyllt - FÖRSTA ORDET I TITEL SKA VARA VERSAL (normal capital letter)' : 
  '• Konstnär/formgivare-fältet är tomt - FÖRSTA ORDET I TITEL SKA VARA VERSALER (uppercase)'}

KRITISKA TITELFORMATREGLER FÖR OBJEKT UTAN KONSTNÄR:
${!formData.artist ? `
• MÅSTE börja med märke/tillverkare i VERSALER följt av PUNKT: "ROLEX.", "OMEGA.", "IKEA."
• MÅSTE sluta med PUNKT (.)
• FÖRSTA ordet efter VARJE komma ska ha stor bokstav: "Stål", "Automatic", "35mm"
• Format: MÄRKE. modell, material, teknik, mått.
• KORREKT: "ROLEX. Submariner, Stål, automatic, 40mm."
• FEL: "ROLEX, Submariner, Stål, automatic, 40mm." (komma efter märke, inte punkt)
` : '• Konstnärens namn läggs till automatiskt - börja med gemener'}

KRITISKT - BEVARA CITATTECKEN FÖR MASKINÖVERSÄTTNING:
• BEHÅLL ALLTID citattecken runt produktnamn, modellnamn och svenska designnamn
• Auctionet använder maskinöversättning som RESPEKTERAR citattecken - text inom "" översätts ALDRIG
• Detta är KRITISKT för IKEA-möbler och svenska designnamn som ska förbli på svenska
• EXEMPEL: "Oxford" ska förbli "Oxford" (med citattecken), INTE Oxford (utan citattecken)
• EXEMPEL: "Pepparkorn" ska förbli "Pepparkorn" (med citattecken) för att undvika översättning
• Om originaltiteln har citattecken runt produktnamn - BEHÅLL dem ALLTID

Returnera EXAKT i detta format (en rad per fält):
TITEL: [förbättrad titel]
BESKRIVNING: [förbättrad beskrivning utan konditionsinformation]
KONDITION: [förbättrad konditionsrapport]
SÖKORD: [kompletterande sökord baserade på FÖRBÄTTRADE fält ovan, separerade med mellanslag, använd "-" för flerordsfraser]

VIKTIGT FÖR SÖKORD: Använd Auctionets format med mellanslag mellan sökord och "-" för flerordsfraser.
EXEMPEL: "konstglas mundblåst svensk-design 1960-tal samlarobjekt"

Använd INTE markdown formatering eller extra tecken som ** eller ***. Skriv bara ren text.`;

      case 'description':
        return baseInfo + `
UPPGIFT: Förbättra endast beskrivningen. Inkludera mått om de finns, använd korrekt terminologi. Skriv naturligt och engagerande.

FÄLTAVGRÄNSNING FÖR BESKRIVNING:
• Inkludera ALDRIG konditionsinformation i beskrivningen
• Konditionsdetaljer som "slitage", "repor", "märken", "skador", "nagg", "sprickor", "fläckar" hör ENDAST hemma i konditionsfältet
• Beskrivningen ska fokusera på: material, teknik, mått, stil, ursprung, märkningar, funktion
• EXEMPEL PÅ FÖRBJUDET I BESKRIVNING: "Slitage förekommer", "repor och märken", "normalt åldersslitage", "mindre skador"
• KRITISKT: BEHÅLL ALLTID MÅTT OCH TEKNISKA SPECIFIKATIONER - dessa är INTE konditionsinformation
• BEHÅLL: "höjd 15,5 cm", "4 snapsglas", "2 vinglas", "består av", "bestående av" - detta är beskrivande information
• TA ENDAST BORT konditionsord som "slitage", "repor", "skador" - ALDRIG mått eller kvantiteter

VIKTIGT - PARAGRAFSTRUKTUR:
${formData.artist && this.apiManager.enableArtistInfo ? 
  '• STRUKTUR: Befintlig beskrivning först, sedan ny konstnärsinformation i SEPARAT paragraf\n• FORMAT: Använd dubbla radbrytningar (\\n\\n) för att separera paragrafer\n• EXEMPEL: "Befintlig förbättrad beskrivning här...\\n\\nKort konstnärskontext här..."\n• Lägg till KORT, SPECIFIK kontext om denna modell/serie i SEPARAT paragraf\n• Max 1-2 meningar extra - fokusera på tillverkningsår och karakteristiska drag\n• UNDVIK allmänna beskrivningar av konstnärens karriär eller designfilosofi\n• Håll det relevant för just detta föremål' : 
  '• Returnera befintlig förbättrad beskrivning\n• Lägg INTE till konstnärlig eller historisk kontext som inte finns i källdata'}

Returnera ENDAST den förbättrade beskrivningen utan extra formatering eller etiketter.`;

      default:
        return baseInfo + `
UPPGIFT: Förbättra endast ${fieldType === 'title' ? 'titeln' : fieldType === 'condition' ? 'konditionsrapporten' : fieldType}.

${fieldType === 'title' && !formData.artist ? `
KRITISKA TITELFORMATREGLER FÖR OBJEKT UTAN KONSTNÄR:
• MÅSTE börja med märke/tillverkare i VERSALER följt av PUNKT: "ROLEX.", "OMEGA.", "IKEA."
• MÅSTE sluta med PUNKT (.)
• FÖRSTA ordet efter VARJE komma ska ha stor bokstav: "Stål", "Automatic", "35mm"
• Format: MÄRKE. modell, material, teknik, mått.
• KORREKT: "ROLEX. Submariner, Stål, automatic, 40mm."
• FEL: "ROLEX, Submariner, Stål, automatic, 40mm." (komma efter märke, inte punkt)

KRITISKA MÄRKESRÄTTSTAVNINGSREGLER:
• Rätta alltid märkesnamn till korrekt stavning/kapitalisering enligt varumärkesstandard
• IKEA: alltid versaler - "Ikea" → "IKEA", "ikea" → "IKEA"  
• iPhone: alltid "iPhone" - "Iphone" → "iPhone", "IPHONE" → "iPhone"
• Royal Copenhagen: alltid "Royal Copenhagen" - "royal copenhagen" → "Royal Copenhagen"
• Kosta Boda: alltid "Kosta Boda" - "kosta boda" → "Kosta Boda"
• Respektera märkenas officiella kapitalisering/formatering
• Om osäker på exakt stavning, behåll originalet
` : ''}

Returnera ENDAST den förbättrade texten utan extra formatering eller etiketter.`;
    
      case 'title-correct':
        return baseInfo + `
UPPGIFT: Korrigera ENDAST grammatik, stavning och struktur i titeln. Behåll ordning och innehåll exakt som det är.

KRITISKT - MINIMALA ÄNDRINGAR:
• Lägg INTE till ny information, material eller tidsperioder
• Ändra INTE ordningen på elementer
• Ta INTE bort information
• Korrigera ENDAST:
  - Saknade mellanslag ("SVERIGEStockholm" → "SVERIGE Stockholm")
  - Felplacerade punkter ("TALLRIK. keramik" → "TALLRIK, keramik")
  - Saknade citattecken runt titlar/motiv ("Dune Mario Bellini" → "Dune" Mario Bellini)
  - Stavfel i välkända namn/märken
  - Kommatecken istället för punkt mellan objekt och material

EXEMPEL KORRIGERINGAR:
• "SERVIRINGSBRICKA, akryl.Dune Mario Bellini" → "SERVIRINGSBRICKA, akryl, "Dune" Mario Bellini"
• "TALLRIKkeramik Sverige" → "TALLRIK, keramik, Sverige"
• "VAS. glas, 1970-tal" → "VAS, glas, 1970-tal"

Returnera ENDAST den korrigerade titeln utan extra formatering eller etiketter.`;
    }
  }

  processEditPageAPIResponse(response, fieldType) {
    const data = response.data;
    console.log('📥 ADD ITEM API Response:', data);
    
    if (!data || !data.content || !Array.isArray(data.content) || data.content.length === 0) {
      throw new Error('Invalid response format from API');
    }
    
    if (!data.content[0] || !data.content[0].text) {
      throw new Error('No text content in API response');
    }
    
    return this.parseEditPageResponse(data.content[0].text, fieldType);
  }

  parseEditPageResponse(responseText, fieldType) {
    console.log('🔍 Parsing response for fieldType:', fieldType);
    console.log('📝 Raw response:', responseText);

    if (fieldType === 'all') {
      // Parse multi-field response (same logic as EDIT page)
      const result = {};
      const lines = responseText.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('TITEL:')) {
          result.title = line.replace('TITEL:', '').trim();
        } else if (line.startsWith('BESKRIVNING:')) {
          result.description = line.replace('BESKRIVNING:', '').trim();
        } else if (line.startsWith('KONDITION:')) {
          result.condition = line.replace('KONDITION:', '').trim();
        } else if (line.startsWith('SÖKORD:')) {
          result.keywords = line.replace('SÖKORD:', '').trim();
        }
      }
      
      console.log('✅ Parsed result:', result);
      return result;
    } else {
      // Single field response
      const result = {};
      result[fieldType] = responseText.trim();
      
      // For title-correct, map the result to the correct field type
      if (fieldType === 'title-correct' && result[fieldType]) {
        result['title'] = result[fieldType];
        delete result[fieldType];
      }
      
      console.log('✅ Parsed single field result:', result);
      return result;
    }
  }

  // NEW: Set up live quality monitoring (same as edit page)
  setupLiveQualityUpdates() {
    // Debounce function to prevent too frequent updates
    let updateTimeout;
    const debouncedUpdate = (event) => {
      clearTimeout(updateTimeout);
      updateTimeout = setTimeout(() => {
        console.log('⚡ Live quality update triggered by:', event?.target?.id || event?.target?.tagName || 'unknown field');
        this.analyzeQuality();
      }, 800); // Wait 800ms after user stops typing
    };

    // Monitor the same fields we use for data extraction
    const fieldsToMonitor = [
      '#item_title_sv',
      '#item_description_sv', 
      '#item_condition_sv',
      '#item_hidden_keywords',
      'input[type="checkbox"][value="Inga anmärkningar"]',
      'input[type="checkbox"]#item_no_remarks',
      'input[type="checkbox"][name*="no_remarks"]'
    ];

    let monitoredCount = 0;
    fieldsToMonitor.forEach(selector => {
      const element = document.querySelector(selector);
      if (element) {
        console.log(`Setting up live monitoring for: ${selector}`);
        monitoredCount++;
        
        // Add event listeners for different input types
        if (element.type === 'checkbox') {
          element.addEventListener('change', debouncedUpdate);
          console.log(`✅ Added 'change' listener to checkbox: ${selector}`);
        } else {
          element.addEventListener('input', debouncedUpdate);
          element.addEventListener('paste', debouncedUpdate);
          element.addEventListener('keyup', debouncedUpdate);
          console.log(`✅ Added 'input', 'paste', 'keyup' listeners to: ${selector}`);
        }
      } else {
        console.log(`ℹ️ Field not found for live monitoring: ${selector}`);
      }
    });

    console.log(`🎯 Live quality monitoring set up for ${monitoredCount} fields`);
  }

  // ENHANCED: Analyze quality (same comprehensive logic as edit page)
  analyzeQuality() {
    // Only log for debugging when needed
    const data = this.extractFormData();
    const warnings = [];
    let score = 100;
    
    // Check if "Inga anmärkningar" (No remarks) is checked
    const noRemarksCheckbox = document.querySelector('input[type="checkbox"][value="Inga anmärkningar"]') || 
                             document.querySelector('input[type="checkbox"]#item_no_remarks') ||
                             document.querySelector('input[type="checkbox"][name*="no_remarks"]');
    const noRemarksChecked = noRemarksCheckbox && noRemarksCheckbox.checked;

    // Title quality checks
    if (data.title.length < 20) {
      warnings.push({ field: 'Titel', issue: 'För kort - lägg till material och period', severity: 'high' });
      score -= 20;
    }
    if (!data.title.includes(',')) {
      warnings.push({ field: 'Titel', issue: 'Saknar korrekt struktur (KONSTNÄR, Objekt, Material)', severity: 'medium' });
      score -= 15;
    }

    // Description quality checks
    const descLength = data.description.replace(/<[^>]*>/g, '').length;
    if (descLength < 50) {
      warnings.push({ field: 'Beskrivning', issue: 'För kort - lägg till detaljer om material, teknik, färg, märkningar', severity: 'high' });
      score -= 25;
    }
    if (!data.description.match(/\d+[\s,]*(x|cm)/i)) {
      warnings.push({ field: 'Beskrivning', issue: 'Saknar fullständiga mått', severity: 'high' });
      score -= 20;
    }

    // Condition quality checks (skip if "Inga anmärkningar" is checked)
    if (!noRemarksChecked) {
      const condLength = data.condition.replace(/<[^>]*>/g, '').length;
      if (condLength < 20) {
        warnings.push({ field: 'Kondition', issue: 'För vag - specificera typ av slitage och skador', severity: 'high' });
        score -= 20;
      }
      if (data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) {
        warnings.push({ field: 'Kondition', issue: 'Endast "bruksslitage" är otillräckligt - specificera typ av slitage (repor, nagg, fläckar, etc.)', severity: 'high' });
        score -= 25;
      }
      
      const vaguePhrases = ['normalt slitage', 'vanligt slitage', 'åldersslitage', 'slitage förekommer'];
      const conditionText = data.condition.toLowerCase();
      const hasVaguePhrase = vaguePhrases.some(phrase => 
        conditionText.includes(phrase) && conditionText.replace(/<[^>]*>/g, '').trim().length < 30
      );
      
      if (hasVaguePhrase) {
        warnings.push({ field: 'Kondition', issue: 'Vag konditionsbeskrivning - beskriv specifika skador och var de finns', severity: 'medium' });
        score -= 15;
      }
    } else {
      warnings.push({ field: 'Kondition', issue: '✓ "Inga anmärkningar" markerat - ingen konditionsrapport behövs', severity: 'low' });
    }

    // Keywords quality checks
    const keywordsLength = data.keywords.length;
    const keywordCount = data.keywords ? 
      (data.keywords.includes(',') ? 
        data.keywords.split(',').filter(k => k.trim().length > 0).length :
        data.keywords.split(/\s+/).filter(k => k.trim().length > 0).length
      ) : 0;
    
    if (keywordsLength === 0 || !data.keywords || data.keywords.trim() === '') {
      warnings.push({ field: 'Sökord', issue: 'Inga dolda sökord - kritiskt för sökbarhet', severity: 'high' });
      score -= 30;
    } else if (keywordCount < 2) {
      warnings.push({ field: 'Sökord', issue: 'För få sökord - lägg till fler relevanta termer', severity: 'high' });
      score -= 20;
    } else if (keywordCount < 4) {
      warnings.push({ field: 'Sökord', issue: 'Bra start - några fler sökord kan förbättra sökbarheten', severity: 'medium' });
      score -= 10;
    } else if (keywordCount > 12) {
      warnings.push({ field: 'Sökord', issue: 'För många sökord kan skada sökbarheten - fokusera på kvalitet över kvantitet', severity: 'medium' });
      score -= 15;
    }
    
    // Update UI silently
    this.updateQualityIndicator(score, warnings);
  }

  // ENHANCED: Update quality indicator with smooth animations (simplified - no warnings)
  updateQualityIndicator(score, warnings) {
    const scoreElement = document.querySelector('.quality-score');
    
    if (scoreElement) {
      // Add smooth transition effect for score changes
      const currentScore = parseInt(scoreElement.textContent.split('/')[0]) || 0;
      const newScore = score;
      
      if (currentScore !== newScore) {
        scoreElement.style.transform = 'scale(1.1)';
        setTimeout(() => {
          scoreElement.style.transform = 'scale(1)';
        }, 200);
      }
      
      scoreElement.textContent = `${score}/100`;
      scoreElement.className = `quality-score ${score >= 80 ? 'good' : score >= 60 ? 'medium' : 'poor'}`;
    }
    
    // No warnings section anymore - tooltips handle specific issues
    console.log(`📊 Quality score updated: ${score}/100`);
  }

  // NEW: Show loading/success/error indicators
  showLoadingIndicator(fieldType) {
    console.log(`🔄 Loading indicator for ${fieldType}`);
    
    // Remove any existing loading states
    this.removeLoadingIndicator(fieldType);
    
    let targetField;
    if (fieldType === 'all') {
      // For "all" - show loading on master button AND all individual fields
      const masterButton = document.querySelector('.ai-master-button');
      if (masterButton) {
        masterButton.textContent = '🧠 AI arbetar...';
        masterButton.disabled = true;
        masterButton.style.opacity = '0.7';
      }
      
      // Show loading animation on all fields simultaneously
      const allFieldTypes = ['title', 'description', 'condition', 'keywords'];
      allFieldTypes.forEach(type => {
        this.showLoadingIndicator(type);
      });
      return;
    } else {
      // Get the specific field
      const fieldMap = {
        'title': '#item_title_sv',
        'description': '#item_description_sv', 
        'condition': '#item_condition_sv',
        'keywords': '#item_hidden_keywords'
      };
      
      targetField = document.querySelector(fieldMap[fieldType]);
    }
    
    if (!targetField) return;
    
    // Find the field container (parent element that will hold the overlay)
    let fieldContainer = targetField.parentElement;
    
    // For textareas and inputs, we might need to go up one more level if it's in a wrapper
    if (fieldContainer.classList.contains('ai-button-wrapper') || fieldContainer.tagName === 'LABEL') {
      fieldContainer = fieldContainer.parentElement;
    }
    
    // Add loading class to container
    fieldContainer.classList.add('field-loading');
    
    // Create spinner overlay
    const overlay = document.createElement('div');
    overlay.className = 'field-spinner-overlay';
    overlay.dataset.fieldType = fieldType;
    overlay.innerHTML = `
      <div class="ai-spinner"></div>
      <div class="ai-processing-text">AI förbättrar...</div>
    `;
    
    // Position overlay over the field
    const fieldRect = targetField.getBoundingClientRect();
    const containerRect = fieldContainer.getBoundingClientRect();
    
    // Calculate relative position
    overlay.style.position = 'absolute';
    overlay.style.top = `${fieldRect.top - containerRect.top}px`;
    overlay.style.left = `${fieldRect.left - containerRect.left}px`;
    overlay.style.width = `${fieldRect.width}px`;
    overlay.style.height = `${fieldRect.height}px`;
    
    // Add overlay to container
    fieldContainer.appendChild(overlay);
    
    console.log(`✅ Loading animation applied to ${fieldType} field`);
  }

  showSuccessIndicator(fieldType) {
    console.log(`✅ Success indicator for ${fieldType}`);
    
    // Remove loading state
    this.removeLoadingIndicator(fieldType);
    
    if (fieldType === 'all') {
      // Reset master button
      const masterButton = document.querySelector('.ai-master-button');
      if (masterButton) {
        masterButton.textContent = '✅ Klart!';
        setTimeout(() => {
          masterButton.textContent = '⚡ Förbättra alla';
          masterButton.disabled = false;
          masterButton.style.opacity = '1';
        }, 2000);
      }
      return;
    }
    
    // Get the specific field and apply success flash
    const fieldMap = {
      'title': '#item_title_sv',
      'description': '#item_description_sv',
      'condition': '#item_condition_sv', 
      'keywords': '#item_hidden_keywords'
    };
    
    const targetField = document.querySelector(fieldMap[fieldType]);
    if (targetField) {
      targetField.classList.add('field-success');
      
      // Remove success class after animation
      setTimeout(() => {
        targetField.classList.remove('field-success');
      }, 600);
    }
  }

  showErrorIndicator(fieldType, message) {
    console.error(`❌ Error for ${fieldType}: ${message}`);
    
    // Remove loading state
    this.removeLoadingIndicator(fieldType);
    
    if (fieldType === 'all') {
      // Reset master button
      const masterButton = document.querySelector('.ai-master-button');
      if (masterButton) {
        masterButton.textContent = '❌ Fel uppstod';
        masterButton.disabled = false;
        masterButton.style.opacity = '1';
        setTimeout(() => {
          masterButton.textContent = '⚡ Förbättra alla';
        }, 3000);
      }
    }
    
    // Show error message
    alert(`Fel vid AI-förbättring av ${fieldType}: ${message}`);
  }
  
  removeLoadingIndicator(fieldType) {
    if (fieldType === 'all') {
      // Remove loading from all individual fields
      const allFieldTypes = ['title', 'description', 'condition', 'keywords'];
      allFieldTypes.forEach(type => {
        this.removeLoadingIndicator(type);
      });
      return;
    }
    
    // Remove loading states for specific field type
    const overlay = document.querySelector(`.field-spinner-overlay[data-field-type="${fieldType}"]`);
    if (overlay) {
      const container = overlay.parentElement;
      container.classList.remove('field-loading');
      overlay.remove();
    }
    
    // Also remove any general loading classes
    document.querySelectorAll('.field-loading').forEach(container => {
      const overlays = container.querySelectorAll('.field-spinner-overlay');
      if (overlays.length === 0) {
        container.classList.remove('field-loading');
      }
    });
  }

  createTooltip(config) {
    const tooltip = document.createElement('div');
    tooltip.id = `ai-tooltip-${config.id}`;
    tooltip.className = `ai-tooltip add-items-tooltip ${config.type}`;
    
    // Build the complete tooltip structure
    let tooltipHTML = '<div class="tooltip-arrow"></div>';
    
    // Add the content
    tooltipHTML += `<div class="tooltip-content">`;
    tooltipHTML += config.html || config.content;
    
    // Add buttons if provided
    if (config.buttons && config.buttons.length > 0) {
      tooltipHTML += '<div class="tooltip-buttons">';
      config.buttons.forEach((button, index) => {
        tooltipHTML += `<button class="tooltip-button ${button.className || ''}" data-button-index="${index}">${button.text}</button>`;
      });
      tooltipHTML += '</div>';
    }
    
    // Add dismiss button if dismissible
    if (config.dismissible !== false) {
      tooltipHTML += '<button class="tooltip-dismiss" type="button">×</button>';
    }
    
    tooltipHTML += '</div>';
    
    tooltip.innerHTML = tooltipHTML;
    
    // Get target element - support both direct element and CSS selector
    let targetElement;
    if (config.targetElement) {
      targetElement = config.targetElement;
    } else if (config.targetSelector) {
      targetElement = document.querySelector(config.targetSelector);
    }
    
    if (targetElement) {
      // Add to body first so positioning calculations work
      document.body.appendChild(tooltip);
      
      // Position the tooltip
      this.positionTooltip(tooltip, targetElement, config.side);
      
      // Setup button event listeners if buttons are provided
      if (config.buttons && config.buttons.length > 0) {
        this.setupTooltipEventListeners(tooltip, config.id, config.buttons, targetElement, config.side);
      }
      
      // Store in active tooltips
      this.activeTooltips.set(config.id, tooltip);
      
      // Only log creation for important tooltips
      if (config.type === 'artist-detection' || config.type === 'error') {
        console.log(`✅ Created tooltip: ${config.id}`, tooltip);
        console.log(`🔍 Tooltip positioned at: left=${tooltip.style.left}, top=${tooltip.style.top}`);
        console.log(`🔍 Tooltip HTML:`, tooltip.innerHTML.substring(0, 200) + '...');
      }
      
      // Add animation class after a small delay for smooth animation
      setTimeout(() => {
        tooltip.classList.add('show');
      }, 50);
      
      // Only auto-dismiss if timeout is set AND tooltip is not marked as persistent
      if (config.timeout && !config.persistent) {
        setTimeout(() => {
          this.dismissTooltip(config.id);
        }, config.timeout);
      }
      
      return tooltip;
    } else {
      console.warn(`❌ Could not find target element: ${config.targetSelector || 'targetElement not provided'}`);
      return null;
    }
  }

  positionTooltip(tooltip, targetElement, side) {
    const targetRect = targetElement.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    console.log(`🔍 Positioning tooltip: target=${targetRect.left},${targetRect.top} size=${targetRect.width}x${targetRect.height}`);
    console.log(`🔍 Tooltip size: ${tooltipRect.width}x${tooltipRect.height}`);
    
    let left, top;
    const margin = 20;
    
    // Calculate position based on side, allowing off-screen movement
    if (side === 'left') {
      left = targetRect.left - tooltipRect.width - margin;
    } else {
      left = targetRect.right + margin;
    }
    
    // Special positioning for condition tooltips - push down by 1/3 height for better attachment
    if (tooltip.classList.contains('add-items-tooltip--condition-guidance')) {
      top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 3);
    } else {
      // Center vertically relative to target for other tooltips
      top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
    }
    
    // Apply minimal constraints only when target is visible to prevent extreme positioning
    if (targetRect.left >= 0 && targetRect.right <= window.innerWidth) {
      // Target is visible, apply gentle constraints
      if (side === 'left') {
        left = Math.max(-tooltipRect.width + 50, left); // Keep some tooltip visible
      } else {
        left = Math.min(window.innerWidth - 50, left); // Keep some tooltip visible
      }
    }
    // No vertical constraints - tooltip follows field completely off-screen
    
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    
    console.log(`🎯 Final tooltip position: left=${left}px, top=${top}px`);
    
    // Position arrow to point at target center
    const arrow = tooltip.querySelector('.tooltip-arrow');
    if (arrow) {
      const targetCenterY = targetRect.top + (targetRect.height / 2);
      const tooltipY = parseFloat(tooltip.style.top);
      
      // Adjust arrow position for condition tooltips
      let arrowY;
      if (tooltip.classList.contains('add-items-tooltip--condition-guidance')) {
        // Position arrow higher for condition tooltips since they're pushed down
        arrowY = Math.max(15, Math.min(tooltipRect.height - 15, (targetCenterY - tooltipY) - (tooltipRect.height / 6)));
      } else {
        arrowY = Math.max(15, Math.min(tooltipRect.height - 15, targetCenterY - tooltipY));
      }
      
      arrow.style.top = `${arrowY - 8}px`;
      console.log(`🏹 Arrow positioned at: top=${arrowY - 8}px`);
    } else {
      console.warn('❌ Arrow element not found in tooltip');
    }
  }

  setupTooltipEventListeners(tooltip, tooltipId, buttons, targetElement, side) {
    // Dismiss button
    const dismissBtn = tooltip.querySelector('.tooltip-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        // NEW: Permanently disable tooltip when user clicks X button
        this.permanentlyDisableTooltip(tooltipId, 'user_dismissed');
        this.dismissTooltip(tooltipId);
        this.dismissedTooltips.add(tooltipId); // Remember dismissal for session
      });
    }
    
    // Action buttons using data-button-index
    const actionButtons = tooltip.querySelectorAll('.tooltip-button[data-button-index]');
    actionButtons.forEach((btn) => {
      const index = parseInt(btn.getAttribute('data-button-index'));
      if (buttons[index] && buttons[index].onclick) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          console.log(`🔘 Button ${index} clicked:`, buttons[index].text);
          buttons[index].onclick();
        });
      }
    });
    
    if (targetElement) {
      const handleScroll = () => {
        // Check if tooltip still exists
        if (document.getElementById(`ai-tooltip-${tooltipId}`)) {
          this.positionTooltip(tooltip, targetElement, side);
        } else {
          // Clean up scroll listener if tooltip is gone
          window.removeEventListener('scroll', handleScroll);
        }
      };
      
      // Add scroll listener
      window.addEventListener('scroll', handleScroll, { passive: true });
      
      // Store cleanup function for tooltip removal
      tooltip._scrollCleanup = () => {
        window.removeEventListener('scroll', handleScroll);
      };
    }
  }

  dismissTooltip(tooltipId) {
    const tooltip = document.getElementById(`ai-tooltip-${tooltipId}`);
    console.log(`🔍 Dismissing tooltip with ID: ai-tooltip-${tooltipId}`, tooltip ? 'Found' : 'Not found');
    if (tooltip) {
      // Clean up scroll event listener if it exists
      if (tooltip._scrollCleanup) {
        tooltip._scrollCleanup();
      }
      
      tooltip.remove();
      this.activeTooltips.delete(tooltipId);
      
      // Track dismissal time to prevent immediate re-showing
      this.lastDismissalTime.set(tooltipId, Date.now());
      
      console.log(`🗑️ Dismissed tooltip: ${tooltipId}`);
    } else {
      console.warn(`❌ Could not find tooltip to dismiss: ai-tooltip-${tooltipId}`);
    }
  }

  removeAllTooltips() {
    this.activeTooltips.forEach((_, tooltipId) => {
      this.dismissTooltip(tooltipId);
    });
    this.activeTooltips.clear();
    console.log('🗑️ Removed all tooltips');
  }

  injectStyles() {
    if (document.getElementById('add-items-tooltip-styles')) return;

    const styles = `
      <style id="add-items-tooltip-styles">
        .add-items-tooltip {
          position: fixed;
          z-index: 10000;
          background: white;
          border: 1px solid #e1e5e9;
          border-radius: 8px;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          font-size: 12px;
          line-height: 1.4;
          color: #374151;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
          max-width: 280px;
          min-width: 200px;
        }
        
        .tooltip-arrow {
          position: absolute;
          width: 0;
          height: 0;
          border-style: solid;
          z-index: 10001;
          right: -8px;
          top: 50%;
          transform: translateY(-50%);
          border-width: 8px 0 8px 8px;
          border-color: transparent transparent transparent white;
          filter: drop-shadow(1px 0 1px rgba(0, 0, 0, 0.04));
        }
        
        .tooltip-content {
          padding: 12px 14px;
          position: relative;
        }
        
        .tooltip-header {
          font-weight: 600;
          margin-bottom: 6px;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          color: #6b7280;
          line-height: 1.2;
          padding-right: 20px;
        }
        
        .tooltip-body {
          margin-bottom: 12px;
          color: #374151;
          font-size: 12px;
          line-height: 1.3;
        }
        
        .tooltip-body strong {
          color: #111827;
          font-weight: 600;
        }
        
        .tooltip-buttons {
          display: flex;
          gap: 8px;
          align-items: center;
          justify-content: flex-end;
        }
        
        .tooltip-button {
          background: #111827;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 6px 12px;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          line-height: 1;
        }
        
        .tooltip-button:hover {
          background: #1f2937;
          transform: translateY(-0.5px);
        }
        
        .tooltip-button:active {
          transform: translateY(0);
        }
        
        .tooltip-dismiss {
          position: absolute;
          top: 8px;
          right: 8px;
          background: none !important;
          border: none;
          color: #9ca3af;
          opacity: 0.8;
          cursor: pointer;
          font-size: 14px;
          padding: 4px;
          margin: 0;
          transition: all 0.15s ease;
          border-radius: 3px;
          line-height: 1;
          font-weight: 400;
          z-index: 10002;
        }
        
        .tooltip-dismiss:hover {
          opacity: 1;
          background: #f9fafb !important;
          color: #374151;
        }
        
        /* Enhanced 2025 animation */
        .add-items-tooltip {
          opacity: 0;
          transform: translateX(-8px) scale(0.95);
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          transform-origin: left center;
        }
        
        .add-items-tooltip.show {
          opacity: 1;
          transform: translateX(0) scale(1);
        }
        
        @keyframes tooltipFadeIn {
          from {
            opacity: 0;
            transform: translateX(-8px) scale(0.95);
            filter: blur(1px);
          }
          50% {
            opacity: 0.8;
            transform: translateX(-2px) scale(0.98);
            filter: blur(0.5px);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
            filter: blur(0);
          }
        }

        /* AI BUTTONS AND QUALITY INDICATOR STYLES - SAME AS EDIT PAGE */
        .quality-indicator {
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
          border: 1px solid #dee2e6;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .quality-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
        }
        
        .quality-title {
          margin: 0 0 10px 0;
          font-size: 14px;
          font-weight: 600;
          color: #333;
          text-align: center;
          width: 100%;
        }
        
        .quality-score-container {
          margin-bottom: 12px;
          width: 100%;
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        
        .quality-score {
          display: inline-block;
          font-weight: bold;
          padding: 6px 16px;
          border-radius: 20px;
          font-size: 14px;
          min-width: 80px;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          transition: all 0.3s ease;
        }
        
        .quality-score.good { 
          background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%); 
          color: #155724; 
          border: 2px solid #b8dacc;
        }
        
        .quality-score.medium { 
          background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%); 
          color: #856404; 
          border: 2px solid #f1c40f;
        }
        
        .quality-score.poor { 
          background: linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%); 
          color: #721c24; 
          border: 2px solid #e74c3c;
        }
        
        .refresh-quality-btn {
          background: linear-gradient(135deg, #6c757d 0%, #495057 100%);
          color: white;
          border: none;
          border-radius: 50%;
          width: 28px;
          height: 28px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .refresh-quality-btn:hover {
          background: linear-gradient(135deg, #495057 0%, #343a40 100%);
          transform: rotate(180deg) scale(1.1);
        }
        
        .refresh-quality-btn:active {
          transform: rotate(180deg) scale(0.95);
        }
        
        .ai-master-button {
          width: 100%;
          padding: 8px 16px;
          font-size: 14px;
          font-weight: 600;
          background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 2px 6px rgba(40, 167, 69, 0.3);
        }
        
        .ai-master-button:hover {
          background: linear-gradient(135deg, #218838 0%, #1e7e34 100%);
          transform: translateY(-1px);
          box-shadow: 0 3px 8px rgba(40, 167, 69, 0.4);
        }
        
        .ai-master-button:active {
          transform: translateY(0);
          box-shadow: 0 1px 4px rgba(40, 167, 69, 0.3);
        }
        
        .quality-warnings {
          margin-top: 15px;
          padding-top: 15px;
          border-top: 1px solid #dee2e6;
        }
        
        .quality-warnings ul {
          margin: 0;
          padding-left: 20px;
        }
        
        .quality-warnings li {
          margin-bottom: 8px;
          font-size: 14px;
        }
        
        .warning-high {
          color: #721c24;
          font-weight: 500;
        }
        
        .warning-medium {
          color: #856404;
        }
        
        .warning-low {
          color: #6c757d;
          font-style: italic;
        }
        
        .no-warnings {
          color: #155724;
          font-weight: 500;
          text-align: center;
          margin: 0;
          font-size: 14px;
        }
        
        /* AI Button Styles */
        .ai-button-wrapper {
          margin-top: 0px;
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        
        .ai-assist-button {
          padding: 6px 12px;
          font-size: 12px;
          background: #006ccc;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 300;
        }
        
        .ai-assist-button:hover {
          background: #0056b3;
        }
        
        .ai-assist-button:active {
          background: #004085;
        }
        
        .ai-assist-button[data-field-type="title-correct"] {
          background: #D18300;
        }
        
        .ai-assist-button[data-field-type="title-correct"]:hover {
          background: #B17200;
        }
        
        .ai-assist-button[data-field-type="title-correct"]:active {
          background: #A16600;
        }
        
        .ai-updated {
          background-color: #d4edda !important;
          border: 2px solid #28a745 !important;
          transition: all 0.3s ease;
        }
        
        /* Enhanced Tooltip Content Styles */
        .artist-detection-info {
          margin-bottom: 8px;
        }
        
        .verification-badge {
          background: linear-gradient(135deg, #4CAF50, #45a049);
          color: white;
          padding: 2px 6px;
          border-radius: 10px;
          font-size: 10px;
          font-weight: bold;
          margin-left: 6px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
        
        /* NEW: Correction notice styling */
        .correction-notice {
          background: linear-gradient(135deg, #FF9800, #F57C00);
          color: white;
          padding: 6px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 500;
          margin-bottom: 8px;
          box-shadow: 0 2px 4px rgba(255,152,0,0.2);
          text-align: center;
        }
        
        .correction-notice i {
          font-style: normal;
          font-weight: 600;
        }
        
        /* NEW: Reasoning text styling */
        .reasoning-text {
          background: rgba(248, 249, 250, 0.8);
          border-left: 3px solid #007bff;
          padding: 6px 10px;
          margin: 6px 0;
          font-size: 11px;
          line-height: 1.4;
          border-radius: 0 4px 4px 0;
          color: #495057;
          font-style: italic;
        }

        .artist-bio-preview {
          background: rgba(236, 243, 255, 0.6);
          border-left: 3px solid #007bff;
          padding: 8px 10px;
          margin: 8px 0;
          font-size: 11px;
          line-height: 1.4;
          color: #6c757d;
          border-radius: 4px;
        }
        
        .action-text {
          color: #6c757d;
          font-size: 11px;
          font-style: italic;
          margin-top: 6px;
        }
        
        /* Description Quality Tooltip Styles */
        .issue-item {
          margin-bottom: 6px;
          padding: 6px 8px;
          border-radius: 4px;
          font-size: 11px;
          line-height: 1.3;
        }
        
        .issue-item.primary {
          background: #fff3cd;
          border-left: 3px solid #ffc107;
          color: #856404;
        }
        
        .issue-item.secondary {
          background: #f8f9fa;
          border-left: 3px solid #6c757d;
          color: #495057;
        }
        
        .issue-item strong {
          font-weight: 600;
        }
        
        /* Button Variations */
        .tooltip-button.btn-secondary {
          background: #6c757d;
          color: white;
        }
        
        .tooltip-button.btn-secondary:hover {
          background: #5a6268;
        }
        
        .tooltip-button.btn-info {
          background: #17a2b8;
          color: white;
        }
        
        .tooltip-button.btn-info:hover {
          background: #138496;
        }
        
        /* Artist Information Checkbox Styles */
        .issue-item.artist-option {
          background: linear-gradient(135deg, #e3f2fd 0%, #f1f8e9 100%);
          border-left: 3px solid #007bff;
          border-radius: 6px;
          padding: 12px 16px;
          margin: 12px 0;
          box-shadow: 0 1px 3px rgba(0, 123, 255, 0.1);
        }
        
        .checkbox-label {
          display: flex;
          align-items: flex-start;
          cursor: pointer;
          font-size: 12px;
          color: #495057;
          margin: 0;
          gap: 10px;
          width: 100%;
          line-height: 1.4;
        }
        
        .checkbox-text {
          flex: 1;
          font-weight: 500;
          margin-top: 1px;
        }
        
        .artist-info-checkbox {
          position: absolute;
          width: 18px;
          height: 18px;
          margin: 0;
          opacity: 0;
          cursor: pointer;
          z-index: 1;
        }
        
        .checkmark {
          position: relative;
          width: 18px;
          height: 18px;
          background: white;
          border: 2px solid #007bff;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          color: white;
          transition: all 0.2s ease;
          flex-shrink: 0;
          margin-top: 0;
        }
        
        .artist-info-checkbox:checked + .checkmark {
          background: #007bff;
          border-color: #007bff;
          box-shadow: 0 2px 4px rgba(0, 123, 255, 0.2);
        }
        
        .artist-info-checkbox:not(:checked) + .checkmark {
          color: transparent;
        }
        
        .checkbox-label:hover .checkmark {
          border-color: #0056b3;
          box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
          transform: scale(1.05);
        }
        
        .issue-item.artist-option:hover {
          background: linear-gradient(135deg, #e1f5fe 0%, #f3e5f5 100%);
          border-left-color: #0056b3;
          transform: translateX(2px);
          transition: all 0.2s ease;
          box-shadow: 0 2px 6px rgba(0, 123, 255, 0.15);
        }
        
        /* Artist Biography Popup Styles */
        .artist-bio-popup-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          z-index: 50000;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: popupFadeIn 0.2s ease-out;
        }
        
        .artist-bio-popup {
          background: white;
          border-radius: 12px;
          max-width: 500px;
          max-height: 70vh;
          width: 90%;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
          animation: popupSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
        }
        
        .popup-header {
          padding: 20px 24px 16px;
          border-bottom: 1px solid #e1e5e9;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
        }
        
        .popup-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: #2c3e50;
        }
        
        .popup-close {
          background: none;
          border: none;
          font-size: 18px;
          color: #6c757d;
          cursor: pointer;
          padding: 8px;
          border-radius: 4px;
          transition: all 0.15s ease;
        }
        
        .popup-close:hover {
          background: #f8f9fa;
          color: #495057;
        }
        
        .popup-content {
          padding: 20px 24px 24px;
          overflow-y: auto;
          max-height: calc(70vh - 80px);
        }
        
        .popup-content p {
          margin: 0;
          line-height: 1.6;
          color: #495057;
          font-size: 14px;
        }
        
        @keyframes popupFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes popupSlideIn {
          from {
            opacity: 0;
            transform: scale(0.9) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        
        /* Auto-resize textarea styles */
        textarea.auto-resize {
          transition: height 0.3s ease;
          resize: none;
          overflow-y: hidden;
          min-height: 60px;
          max-height: 400px;
        }
        
        textarea.auto-resize.resizing {
          transition: height 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        
        textarea.auto-resize:focus {
          outline: 2px solid #007bff;
          outline-offset: 2px;
        }
        
        /* Condition Guidance Tooltip Styles */
        .add-items-tooltip--condition-guidance {
          max-width: 320px;
        }
        
        .tooltip-header.condition-critical {
          background: #dc3545;
          color: white;
          padding: 8px 12px;
          margin: -12px -14px 8px -14px;
          font-weight: 600;
          font-size: 11px;
        }
        
        .tooltip-header.condition-high {
          background: #fd7e14;
          color: white;
          padding: 8px 12px;
          margin: -12px -14px 8px -14px;
          font-weight: 600;
          font-size: 11px;
        }
        
        .guidance-main {
          margin-bottom: 12px;
          font-size: 13px;
          line-height: 1.4;
          color: #374151;
        }
        
        .category-hint {
          background: #f8fafc;
          border-left: 3px solid #e2e8f0;
          padding: 10px 12px;
          margin: 10px 0;
          font-size: 12px;
          border-radius: 4px;
          color: #4a5568;
        }
        
        .impact-note {
          background: #fffbf0;
          border-left: 3px solid #d69e2e;
          padding: 8px 12px;
          margin: 10px 0;
          font-size: 11px;
          color: #744210;
          border-radius: 4px;
          font-style: italic;
        }
        
        .issue-description {
          margin-bottom: 12px;
          font-size: 13px;
          line-height: 1.4;
          color: #374151;
        }
        
        /* Condition Guide Popup Styles - 2025 Scandinavian Design */
        .condition-guide-popup-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(2px);
          z-index: 50000;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: overlayFadeIn 0.3s ease-out;
          padding: 20px;
          box-sizing: border-box;
        }
        
        .condition-guide-popup {
          background: #ffffff;
          border-radius: 8px;
          max-width: 900px;
          max-height: calc(100vh - 40px);
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12);
          animation: popupSlideIn 0.4s cubic-bezier(0.2, 0, 0.2, 1);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          border: 1px solid #e5e7eb;
        }
        
        .condition-guide-popup .popup-header {
          background: #f9fafb;
          color: #111827;
          padding: 24px 32px;
          border-bottom: 1px solid #e5e7eb;
          position: relative;
          flex-shrink: 0;
        }
        
        .condition-guide-popup .popup-header h3 {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
          color: #111827;
          letter-spacing: -0.025em;
        }
        
        .condition-guide-popup .popup-close {
          position: absolute;
          top: 20px;
          right: 24px;
          color: #6b7280;
          font-size: 20px;
          padding: 8px;
          border-radius: 4px;
          transition: all 0.2s ease;
          background: none;
          border: none;
          cursor: pointer;
        }
        
        .condition-guide-popup .popup-close:hover {
          background: #e5e7eb;
          color: #374151;
        }
        
        .condition-guide-popup .popup-content {
          flex: 1;
          overflow-y: auto;
          padding: 32px;
          scroll-behavior: smooth;
          line-height: 1.6;
        }
        
        /* Fix scrolling cutoff */
        .condition-guide-popup .popup-content::after {
          content: '';
          display: block;
          height: 24px;
          flex-shrink: 0;
        }
        
        @keyframes overlayFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes popupSlideIn {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        
        /* Clean Content Sections */
        .guide-section {
          margin-bottom: 48px;
        }
        
        .guide-section:last-child {
          margin-bottom: 0;
        }
        
        .guide-section-title {
          font-size: 18px;
          font-weight: 600;
          color: #111827;
          margin: 0 0 20px 0;
          letter-spacing: -0.025em;
          border-bottom: 2px solid #f3f4f6;
          padding-bottom: 8px;
        }
        
        .guide-subsection {
          margin-bottom: 32px;
        }
        
        .guide-subsection:last-child {
          margin-bottom: 0;
        }
        
        .guide-subsection-title {
          font-size: 16px;
          font-weight: 600;
          color: #374151;
          margin: 0 0 16px 0;
          letter-spacing: -0.025em;
        }
        
        .guide-text {
          font-size: 15px;
          color: #4b5563;
          line-height: 1.6;
          margin-bottom: 16px;
        }
        
        .guide-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        
        .guide-list-item {
          font-size: 14px;
          color: #4b5563;
          padding: 8px 0;
          border-bottom: 1px solid #f3f4f6;
          position: relative;
          padding-left: 20px;
        }
        
        .guide-list-item:last-child {
          border-bottom: none;
        }
        
        .guide-list-item::before {
          content: '•';
          position: absolute;
          left: 0;
          color: #9ca3af;
          font-weight: 600;
        }
        
        /* Example Cards */
        .example-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-top: 20px;
        }
        
        @media (max-width: 768px) {
          .example-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }
          
          .condition-guide-popup .popup-content {
            padding: 24px 20px;
          }
          
          .condition-guide-popup .popup-header {
            padding: 20px 24px;
          }
        }
        
        .example-card {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 20px;
          position: relative;
        }
        
        .example-card.bad {
          border-left: 4px solid #dc2626;
        }
        
        .example-card.good {
          border-left: 4px solid #059669;
        }
        
        .example-header {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 12px;
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }
        
        .example-card.bad .example-header {
          color: #dc2626;
        }
        
        .example-card.good .example-header {
          color: #059669;
        }
        
        .example-text {
          font-size: 14px;
          line-height: 1.5;
          color: #374151;
          font-style: italic;
          background: white;
          padding: 16px;
          border-radius: 4px;
          border: 1px solid #e5e7eb;
          margin-bottom: 12px;
        }
        
        .example-note {
          font-size: 13px;
          font-weight: 500;
        }
        
        .example-card.bad .example-note {
          color: #dc2626;
        }
        
        .example-card.good .example-note {
          color: #059669;
        }
        
        /* Impact Stats */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          margin-top: 20px;
        }
        
        .stat-card {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 20px;
          text-align: center;
        }
        
        .stat-number {
          font-size: 24px;
          font-weight: 700;
          color: #111827;
          margin-bottom: 4px;
        }
        
        .stat-label {
          font-size: 13px;
          color: #6b7280;
          font-weight: 500;
        }
        
        /* Category Specific Sections */
        .category-info {
          background: #f0f9ff;
          border: 1px solid #e0f2fe;
          border-radius: 6px;
          padding: 20px;
          margin: 20px 0;
        }
        
        .category-title {
          font-size: 16px;
          font-weight: 600;
          color: #0c4a6e;
          margin: 0 0 16px 0;
        }
        
        .category-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
          margin-top: 20px;
        }
        
        @media (max-width: 768px) {
          .category-grid {
            grid-template-columns: 1fr;
            gap: 20px;
          }
        }
        
        /* Clean Typography */
        .guide-content h4 {
          font-size: 16px;
          font-weight: 600;
          color: #374151;
          margin: 0 0 16px 0;
          letter-spacing: -0.025em;
        }
        
        .guide-content p {
          font-size: 15px;
          color: #4b5563;
          line-height: 1.6;
          margin: 0 0 16px 0;
        }
        
        .guide-content p:last-child {
          margin-bottom: 0;
        }

        /* AI Field Enhancement Loading States */
        .field-loading {
          position: relative;
        }
        
        .field-loading input,
        .field-loading textarea {
          filter: blur(2px);
          transition: filter 0.3s ease;
          pointer-events: none;
        }
        
        .field-spinner-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(1px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          border-radius: 6px;
          animation: overlayFadeIn 0.3s ease;
        }
        
        .ai-spinner {
          width: 24px;
          height: 24px;
          border: 2px solid #e5e7eb;
          border-top: 2px solid #007bff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .ai-processing-text {
          margin-left: 12px;
          font-size: 13px;
          color: #374151;
          font-weight: 500;
          letter-spacing: 0.025em;
        }
        
        /* Success flash animation */
        .field-success {
          animation: successFlash 0.6s ease;
        }
        
        @keyframes successFlash {
          0% { 
            background-color: rgba(34, 197, 94, 0.1);
            border-color: #22c55e;
          }
          50% { 
            background-color: rgba(34, 197, 94, 0.2);
            border-color: #16a34a;
          }
          100% { 
            background-color: transparent;
            border-color: initial;
          }
        }

        /* Artist Enhancement Tooltip Styles */
        .add-items-tooltip.artist-enhancement {
          border-left: 3px solid #6f42c1;
        }
        
        .enhancement-main {
          margin-bottom: 10px;
          font-size: 12px;
          line-height: 1.4;
          color: #374151;
        }
        
        .enhancement-main strong {
          color: #6f42c1;
          font-weight: 600;
        }
        
        .enhancement-note {
          background: #f8f9fa;
          border-left: 3px solid #6f42c1;
          padding: 8px 10px;
          margin: 8px 0;
          font-size: 11px;
          color: #6c757d;
          border-radius: 0 4px 4px 0;
          font-style: italic;
        }
        
        /* Artist Biography Popup Styles */
      </style>
    `;

    document.head.insertAdjacentHTML('beforeend', styles);
  }

  async showArtistBiographyPopup(artistName, biography) {
    // Create a modern popup overlay for detailed artist information
    const popup = document.createElement('div');
    popup.className = 'artist-bio-popup-overlay';
    popup.innerHTML = `
      <div class="artist-bio-popup">
        <div class="popup-header">
          <h3>${artistName}</h3>
          <button class="popup-close" type="button">✕</button>
        </div>
        <div class="popup-content">
          <p>${biography}</p>
        </div>
      </div>
    `;
    
    // Add to page
    document.body.appendChild(popup);
    
    // Add event listeners
    const closeBtn = popup.querySelector('.popup-close');
    closeBtn.addEventListener('click', () => {
      popup.remove();
    });
    
    // Close on overlay click
    popup.addEventListener('click', (e) => {
      if (e.target === popup) {
        popup.remove();
      }
    });
    
    // Close on escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        popup.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
    
    console.log('✨ Artist biography popup displayed for:', artistName);
  }

  async analyzeConditionQuality(formData) {
    // Skip if "Inga anmärkningar" (No remarks) is checked
    const noRemarksCheckbox = document.querySelector('input[type="checkbox"][value="Inga anmärkningar"]') || 
                             document.querySelector('input[type="checkbox"]#item_no_remarks') ||
                             document.querySelector('input[type="checkbox"][name*="no_remarks"]');
    
    if (noRemarksCheckbox && noRemarksCheckbox.checked) {
      return; // Silent return - no need to log this every time
    }
    
    if (!formData.condition || formData.condition.length < 5) {
      this.showConditionGuidanceTooltip(formData, 'empty');
      return;
    }
    
    // NEW: Use enhanced eligibility check
    const tooltipId = 'condition-quality';
    if (!this.isTooltipEligible(tooltipId, formData)) {
      return; // Eligibility check handles all logging
    }
    
    // Check if already dismissed in session
    if (this.dismissedTooltips.has(tooltipId)) return;
    
    const conditionIssues = this.detectConditionIssues(formData);
    
    if (conditionIssues.length > 0) {
      console.log('⚠️ Condition issues detected - showing guidance');
      this.showConditionGuidanceTooltip(formData, 'improve', conditionIssues);
    }
  }

  detectConditionIssues(formData) {
    const issues = [];
    const condition = formData.condition || '';
    const cleanCondition = condition.replace(/<[^>]*>/g, '').trim(); // Remove HTML tags
    const conditionLower = cleanCondition.toLowerCase();
    
    // CRITICAL: Detect the dreaded "Bruksslitage" alone
    if (conditionLower === 'bruksslitage' || conditionLower === 'bruksslitage.') {
      issues.push({
        type: 'lazy_bruksslitage',
        severity: 'critical',
        title: 'Endast "Bruksslitage" är otillräckligt!',
        message: 'Specificera typ av slitage - var finns repor, nagg, fläckar? Våra kunder förtjänar bättre beskrivningar.',
        impact: 'Leder till missnöjda kunder och fler reklamationer!'
      });
      return issues; // This is the worst case, return immediately
    }
    
    // Detect other vague phrases used alone
    const vagueOnlyPhrases = [
      'normalt slitage',
      'vanligt slitage', 
      'åldersslitage',
      'slitage förekommer',
      'mindre skador',
      'normal wear'
    ];
    
    const hasVagueOnly = vagueOnlyPhrases.some(phrase => {
      const conditionWithoutPhrase = conditionLower.replace(phrase, '').trim();
      return conditionLower.includes(phrase) && conditionWithoutPhrase.length < 10;
    });
    
    if (hasVagueOnly) {
      issues.push({
        type: 'vague_only',
        severity: 'high',
        title: 'Vag konditionsbeskrivning',
        message: 'Beskriv specifikt VAR och VILKEN typ av slitage. Kunden vill veta exakt vad de kan förvänta sig.',
        impact: 'Tydligare beskrivningar = nöjdare kunder = färre reklamationer'
      });
    }
    
    // Check length - too short for detailed items
    if (cleanCondition.length < 20) {
      issues.push({
        type: 'too_short',
        severity: 'high', 
        title: 'För kort konditionsrapport',
        message: 'Lägg till mer specifika detaljer om föremålets skick.',
        impact: 'Detaljerade beskrivningar minskar kundservice-samtal'
      });
    }
    
    // Check for missing location specifics
    if (conditionLower.includes('repor') && !this.hasLocationSpecifics(conditionLower)) {
      issues.push({
        type: 'missing_location',
        severity: 'medium',
        title: 'Specificera var skadorna finns',
        message: 'Ange VAR repor/skador finns - på ytan, kanter, baksidan, etc.',
        impact: 'Kunder vill veta exakt var skadorna är placerade'
      });
    }
    
    return issues.slice(0, 2); // Max 2 issues to avoid overwhelming
  }

  hasLocationSpecifics(conditionText) {
    const locationWords = [
      'ytan', 'kanter', 'kant', 'baksidan', 'framsidan', 'ovansidan', 'undersidan',
      'handtag', 'fot', 'ben', 'arm', 'sits', 'rygg', 'ram', 'glas', 'urtavla',
      'boett', 'länk', 'hörn', 'mittpartiet', 'botten', 'topp', 'sida', 'insida'
    ];
    return locationWords.some(word => conditionText.includes(word));
  }

  async showConditionGuidanceTooltip(formData, type, issues = []) {
    const conditionField = document.querySelector(this.fieldMappings.condition);
    if (!conditionField) return;

    const tooltipId = 'condition-quality';
    
    console.log('⏳ Scheduling condition guidance tooltip to show in 200ms...');
    
    // Add delay for smooth UX - faster response for better user experience
    setTimeout(() => {
      // Double-check tooltip wasn't dismissed during delay
      if (this.dismissedTooltips.has(tooltipId)) return;
      
      let content, title, severity;
      
      if (type === 'empty') {
        title = 'Konditionsrapport saknas';
        severity = 'high';
        content = this.getConditionGuidanceContent(formData, type);
      } else {
        const primaryIssue = issues[0];
        title = primaryIssue.title;
        severity = primaryIssue.severity;
        content = this.getConditionGuidanceContent(formData, type, issues);
      }
      
      const tooltipContent = `
        <div class="tooltip-header condition-${severity}">
          ${title.toUpperCase()}
        </div>
        <div class="tooltip-body">
          ${content}
        </div>
      `;

      const buttons = [
        {
          text: 'AI-förbättra',
          className: 'btn-primary',
          onclick: () => {
            // NEW: Permanently disable this tooltip after user interaction
            this.permanentlyDisableTooltip('condition-quality', 'user_improved_condition');
            this.dismissTooltip(tooltipId);
            this.improveField('condition');
          }
        },
        {
          text: 'Guidning',
          className: 'btn-info',
          onclick: () => {
            // Guidning button shows popup but doesn't disable tooltip permanently
            // This way users can still see the tooltip if they need more help later
            this.showConditionGuidePopup(formData);
          }
        },
        {
          text: 'Ignorera',
          className: 'btn-secondary',
          onclick: () => {
            // NEW: Permanently disable this tooltip after user interaction
            this.permanentlyDisableTooltip('condition-quality', 'user_ignored');
            this.dismissTooltip(tooltipId);
            this.dismissedTooltips.add(tooltipId);
          }
        }
      ];

      this.createTooltip({
        id: tooltipId,
        targetElement: conditionField,
        content: tooltipContent,
        buttons,
        side: 'left',
        type: 'condition-guidance'
      });
      
      console.log('✨ Condition guidance tooltip shown');
    }, 200);
  }

  getConditionGuidanceContent(formData, type, issues = []) {
    if (type === 'empty') {
      const category = this.determineItemCategory(formData);
      return `
        <div class="guidance-main">
          <strong>Konditionsrapport krävs för professionell katalogisering</strong><br>
          Kunder förväntar sig detaljerade beskrivningar av föremålets skick.
        </div>
        <div class="category-hint">
          <strong>För ${category.name}:</strong> Kontrollera ${category.checkPoints.join(', ')}
        </div>
        <div class="impact-note">
          💡 <em>Bra konditionsrapporter = nöjdare kunder = färre reklamationer</em>
        </div>
      `;
    } else {
      const primaryIssue = issues[0];
      const category = this.determineItemCategory(formData);
      
      return `
        <div class="issue-description">
          <strong>${primaryIssue.message}</strong>
        </div>
        <div class="category-hint">
          <strong>För ${category.name}:</strong> Beskriv ${category.conditionFocus.join(', ')}
        </div>
        <div class="impact-note">
          ⚠️ <em>${primaryIssue.impact}</em>
        </div>
      `;
    }
  }

  determineItemCategory(formData) {
    const title = (formData.title || '').toLowerCase();
    const description = (formData.description || '').toLowerCase();
    const category = (formData.category || '').toLowerCase();
    const combined = title + ' ' + description + ' ' + category;
    
    // Watch/Clock category
    if (combined.match(/\b(ur|klocka|rolex|omega|patek|cartier|automatisk|quartz)\b/)) {
      return {
        name: 'armbandsur',
        checkPoints: ['urtavla', 'boett', 'länk/armband', 'glas', 'funktion'],
        conditionFocus: ['repor på boett', 'slitage på länk', 'märken på urtavla', 'funktionsstatus']
      };
    }
    
    // Jewelry category  
    if (combined.match(/\b(ring|halsband|armband|brosch|örhängen|smycke|guld|silver|diamant)\b/)) {
      return {
        name: 'smycken',
        checkPoints: ['stenar', 'fattningar', 'lås', 'kedja/band', 'ytbehandling'],
        conditionFocus: ['lösa stenar', 'slitage på fattning', 'lås funktion', 'repor på metall']
      };
    }
    
    // Art category
    if (combined.match(/\b(målning|tavla|konst|konstnär|signerad|duk|pannå|ram)\b/)) {
      return {
        name: 'konstverk',
        checkPoints: ['duk/papper', 'färger', 'ram', 'signatur', 'baksida'],
        conditionFocus: ['sprickor i färg', 'fläckar', 'ramens skick', 'dukens spänning']
      };
    }
    
    // Furniture category
    if (combined.match(/\b(stol|bord|skåp|möbel|sits|rygg|ben|låda)\b/)) {
      return {
        name: 'möbler',
        checkPoints: ['finish', 'fogar', 'klädsel', 'beslag', 'stabilitet'],
        conditionFocus: ['repor i finish', 'lossnade fogar', 'fläckar på klädsel', 'skador på beslag']
      };
    }
    
    // Ceramics/Glass category
    if (combined.match(/\b(vas|skål|tallrik|porslin|keramik|glas|kristall)\b/)) {
      return {
        name: 'keramik/glas',
        checkPoints: ['nagg', 'sprickor', 'glasyr', 'märkningar', 'reparationer'],
        conditionFocus: ['nagg på kant', 'hårsprickor', 'krakelering', 'limmarker']
      };
    }
    
    // Default/General category
    return {
      name: 'föremål',
      checkPoints: ['ytor', 'kanter', 'funktionalitet', 'märkningar'],
      conditionFocus: ['synliga skador', 'slitage platser', 'funktionsstatus', 'reparationer']
    };
  }

  async showConditionGuidePopup(formData) {
    const category = this.determineItemCategory(formData);
    
    // Create comprehensive condition guide popup
    const popup = document.createElement('div');
    popup.className = 'condition-guide-popup-overlay';
    popup.innerHTML = `
      <div class="condition-guide-popup">
        <div class="popup-header">
          <h3>🎯 Professionell Konditionsrapportering</h3>
          <button class="popup-close" type="button">✕</button>
        </div>
        <div class="popup-content">
          ${this.getConditionGuideContent(category)}
        </div>
      </div>
    `;
    
    // Add to page
    document.body.appendChild(popup);
    
    // Add event listeners
    const closeBtn = popup.querySelector('.popup-close');
    closeBtn.addEventListener('click', () => {
      popup.remove();
    });
    
    // Close on overlay click
    popup.addEventListener('click', (e) => {
      if (e.target === popup) {
        popup.remove();
      }
    });
    
    // Close on escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        popup.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
    
    console.log('✨ Condition guide popup displayed for category:', category.name);
  }

  getConditionGuideContent(category) {
    return `
      <div class="guide-section">
        <h2 class="guide-section-title">Varför detaljerade konditionsrapporter?</h2>
        <div class="guide-text">
          Professionella konditionsrapporter är grunden för framgångsrik auktionsverksamhet. De skapar förtroende, minskar reklamationer och förbättrar kundupplevelsen.
        </div>
        
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-number">40%</div>
            <div class="stat-label">Färre kundservice-samtal</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">25%</div>
            <div class="stat-label">Fler positiva recensioner</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">60%</div>
            <div class="stat-label">Färre returer</div>
          </div>
        </div>
      </div>

      <div class="guide-section">
        <h2 class="guide-section-title">Specifik guide för ${category.name}</h2>
        
        <div class="category-grid">
          <div class="guide-subsection">
            <h3 class="guide-subsection-title">Kontrollpunkter att alltid granska</h3>
            <ul class="guide-list">
              ${category.checkPoints.map(point => `<li class="guide-list-item">${point}</li>`).join('')}
            </ul>
          </div>
          
          <div class="guide-subsection">
            <h3 class="guide-subsection-title">Beskriv specifikt</h3>
            <ul class="guide-list">
              ${category.conditionFocus.map(focus => `<li class="guide-list-item">${focus}</li>`).join('')}
            </ul>
          </div>
        </div>
      </div>

      <div class="guide-section">
        <h2 class="guide-section-title">Exempel på konditionsrapporter</h2>
        
        <div class="example-grid">
          <div class="example-card bad">
            <div class="example-header">Undvik detta</div>
            <div class="example-text">"Bruksslitage"</div>
            <div class="example-note">Problem: Kunden vet inte vad de kan förvänta sig</div>
          </div>
          
          <div class="example-card good">
            <div class="example-header">Gör så här istället</div>
            <div class="example-text">${this.getGoodExample(category)}</div>
            <div class="example-note">Resultat: Kunden känner förtroende och vet exakt vad de får</div>
          </div>
        </div>
      </div>

      <div class="guide-section">
        <h2 class="guide-section-title">Professionella riktlinjer</h2>
        
        <div class="guide-subsection">
          <h3 class="guide-subsection-title">Skrivsätt</h3>
          <ul class="guide-list">
            <li class="guide-list-item">Var specifik om placering: "repor på ovansidan", "nagg vid kanten"</li>
            <li class="guide-list-item">Ange storlek på skador: "små repor", "större fläck ca 2 cm"</li>
            <li class="guide-list-item">Beskriv omfattning: "spridda repor", "enstaka nagg"</li>
            <li class="guide-list-item">Vara ärlig: Bättre att överdriva än underdriva skador</li>
          </ul>
        </div>
        
        <div class="guide-subsection">
          <h3 class="guide-subsection-title">Kvalitetskontroll</h3>
          <div class="guide-text">
            Läs igenom din konditionsrapport och fråga dig: "Skulle jag kunna föreställa mig föremålets skick baserat på denna beskrivning?" Om svaret är nej, lägg till mer specifika detaljer.
          </div>
        </div>
      </div>
    `;
  }

  getGoodExample(category) {
    const examples = {
      'armbandsur': '"Repor på boettets ovansida och mindre märken på urtavlan vid 3-positionen. Länkarna visar normalt slitage utan djupare skråmor. Fungerar vid katalogisering."',
      'smycken': '"Små repor på metallbandet och mindre slitage på lås-mekanismen. Stenarna sitter fast utan lösa fattningar. Lätt matthet på ytbehandlingen."',
      'konstverk': '"Mindre fläckar i nedre högra hörnet och två små hål från tidigare upphängning. Ramens guldbeläggning något nött vid kanter. Inga sprickor i duken."',
      'möbler': '"Repor och märken på skivans ovansida samt mindre nagg vid främre kanten. Benen visar normalt slitage men är stabila. Lådan går lätt att öppna."',
      'keramik/glas': '"Små nagg vid mynningen och hårfina sprickor i glasyr på utsidan. Botten har mindre repor från användning. Inga större skador eller reparationer."',
      'föremål': '"Repor på främre ytan och mindre märken vid handtagen. Funktionen fungerar som den ska men visar tecken på regelbunden användning."'
    };
    
    return examples[category.name] || examples['föremål'];
  }

  // NEW: Show success feedback
  showSuccessFeedback(message) {
    this.showFeedback(message, 'success');
  }

  // NEW: Show error feedback
  showErrorFeedback(message) {
    this.showFeedback(message, 'error');
  }

  // NEW: Generic feedback system
  showFeedback(message, type = 'info') {
    // Remove any existing feedback
    const existingFeedback = document.querySelector('.add-items-feedback');
    if (existingFeedback) {
      existingFeedback.remove();
    }

    // Create feedback element
    const feedback = document.createElement('div');
    feedback.className = `add-items-feedback add-items-feedback--${type}`;
    feedback.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: slideInFromRight 0.3s ease-out;
      max-width: 300px;
      word-wrap: break-word;
      ${type === 'success' ? 'background: #4caf50; color: white;' : ''}
      ${type === 'error' ? 'background: #f44336; color: white;' : ''}
      ${type === 'info' ? 'background: #2196f3; color: white;' : ''}
    `;
    
    feedback.textContent = message;
    document.body.appendChild(feedback);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.style.animation = 'slideOutToRight 0.3s ease-in';
        setTimeout(() => {
          if (feedback.parentNode) {
            feedback.parentNode.removeChild(feedback);
          }
        }, 300);
      }
    }, 3000);

    // Add CSS animations if not already present
    if (!document.getElementById('add-items-feedback-styles')) {
      const style = document.createElement('style');
      style.id = 'add-items-feedback-styles';
      style.textContent = `
        @keyframes slideInFromRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutToRight {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }
  }

  // NEW: Analyze if description could benefit from artist information enhancement
  async analyzeArtistEnhancement(formData) {
    // AUCTIONET COMPLIANCE: ONLY trigger enhanced artist information IF artist field is filled
    // This ensures listing compliance with Auctionet standards
    if (!formData.artist || formData.artist.trim().length < 3) {
      console.log('🚫 Artist enhancement skipped - artist field not filled (Auctionet compliance)');
      return; // No artist to enhance with
    }

    console.log('✅ Artist field filled, checking enhancement eligibility for Auctionet compliance...');

    // Core safety checks for tooltip system
    const tooltipId = 'artist-enhancement';
    if (!this.isTooltipEligible(tooltipId, formData)) {
      return; // Eligibility check handles all logging
    }

    // Avoid conflicts with active artist detection
    if (this.activeTooltips.has('artist-detection')) {
      console.log('🚫 Artist detection tooltip active, waiting to avoid conflicts');
      return;
    }

    // Only show if artist info setting is enabled
    if (!this.apiManager.enableArtistInfo) {
      console.log('🚫 Artist info enhancement disabled in settings');
      return;
    }

    // AUCTIONET STANDARDS: Artist field is filled, offer enhancement
    console.log('🎨 AUCTIONET COMPLIANCE: Artist enhancement eligible for:', formData.artist);
    this.showArtistEnhancementTooltip(formData);
  }

  // NEW: Check if description already has substantial artist context
  hasSubstantialArtistContext(description, artistName) {
    const descLower = description.toLowerCase();
    const artistLower = artistName.toLowerCase();
    
    // Check for artist-specific terms that indicate contextual information
    const contextIndicators = [
      'karakteristisk', 'stil', 'period', 'verksamhet', 'känd för',
      'expressionistisk', 'impressionistisk', 'modernistisk', 'klassicistisk',
      'skolan', 'tradition', 'generationen', 'aktiv', 'verksam',
      'tillhör', 'dokumenterad', 'forskning visar', 'anses vara'
    ];
    
    // If description contains multiple context indicators, it likely has good artist context
    const contextCount = contextIndicators.filter(indicator => 
      descLower.includes(indicator)
    ).length;
    
    if (contextCount >= 2) {
      console.log('✅ Description already has substantial artist context:', contextCount, 'indicators');
      return true;
    }

    // Check if description length suggests it already has detailed information
    const cleanDescription = description.replace(/<[^>]*>/g, '').trim();
    if (cleanDescription.length > 200) {
      // Long descriptions likely already have good context
      console.log('✅ Description is substantial (>200 chars), likely has context');
      return true;
    }

    return false;
  }

  // NEW: Show artist enhancement tooltip
  async showArtistEnhancementTooltip(formData) {
    const descriptionField = document.querySelector(this.fieldMappings.description);
    if (!descriptionField) return;

    const tooltipId = 'artist-enhancement';
    
    console.log('⏳ Scheduling artist enhancement tooltip to show in 1200ms...');
    
    // Longer delay to not conflict with other tooltips
    setTimeout(() => {
      // Double-check tooltip wasn't dismissed during delay
      if (this.dismissedTooltips.has(tooltipId)) return;
      
      // Double-check tooltip isn't already active
      if (this.activeTooltips.has(tooltipId)) return;

      // Final check that we still don't have artist detection active
      if (this.activeTooltips.has('artist-detection')) return;
      
      const content = `
        <div class="tooltip-header">
          🎨 FÖRBÄTTRA MED KONSTNÄRSINFO
        </div>
        <div class="tooltip-body">
          <div class="enhancement-main">
            <strong>${formData.artist}</strong> är angiven som konstnär/formgivare.<br>
            Beskrivningen kan förbättras med kontextuell information.
          </div>
          <div class="enhancement-note">
            AI kan lägga till professionell kontext om konstnärens stil, period och betydelse.
          </div>
        </div>
      `;

      const buttons = [
        {
          text: 'Förbättra beskrivning',
          className: 'btn-primary',
          onclick: () => {
            // NEW: Permanently disable this tooltip after user interaction
            this.permanentlyDisableTooltip('artist-enhancement', 'user_improved_description');
            this.dismissTooltip(tooltipId);
            this.improveField('description'); // Uses AI knowledge approach
          }
        },
        {
          text: 'Hoppa över',
          className: 'btn-secondary',
          onclick: () => {
            // NEW: Permanently disable this tooltip after user interaction
            this.permanentlyDisableTooltip('artist-enhancement', 'user_skipped');
            this.dismissTooltip(tooltipId);
            this.dismissedTooltips.add(tooltipId);
          }
        }
      ];

      this.createTooltip({
        id: tooltipId,
        targetElement: descriptionField,
        content,
        buttons,
        side: 'left',
        type: 'artist-enhancement'
      });
      
      console.log('✨ Artist enhancement tooltip shown for:', formData.artist);
    }, 1200);
  }

  // NEW: Permanently disable a tooltip after user interaction
  permanentlyDisableTooltip(tooltipId, reason = 'user_interaction') {
    this.permanentlyDisabledTooltips.add(tooltipId);
    console.log(`🔒 Permanently disabled tooltip: ${tooltipId} (${reason})`);
  }

  // NEW: Check if tooltip is permanently disabled
  isPermanentlyDisabled(tooltipId) {
    return this.permanentlyDisabledTooltips.has(tooltipId);
  }

  // NEW: Track field changes for artist detection exception
  updateFieldValues(formData) {
    // Store current field values to detect changes
    const currentValues = {
      title: formData.title || '',
      artist: formData.artist || '',
      description: formData.description || '',
      condition: formData.condition || ''
    };
    
    // Check if artist field actually changed (for artist detection exception)
    const lastArtist = this.lastFieldValues.get('artist') || '';
    const currentArtist = currentValues.artist;
    
    if (lastArtist !== currentArtist) {
      console.log(`🎯 Artist field changed: "${lastArtist}" → "${currentArtist}"`);
      
      // FIXED: Only re-enable if this is NOT a programmatic update from our system
      if (!this.isProgrammaticUpdate) {
        // Allow artist detection to run again if artist field changed manually
        if (this.permanentlyDisabledTooltips.has('artist-detection')) {
          this.permanentlyDisabledTooltips.delete('artist-detection');
          console.log('🔓 Re-enabled artist detection due to manual artist field change');
        }
      } else {
        console.log('🔒 Ignoring programmatic artist field change - keeping tooltip disabled');
      }
    }
    
    // Update stored values
    Object.keys(currentValues).forEach(key => {
      this.lastFieldValues.set(key, currentValues[key]);
    });
  }

  // NEW: Enhanced tooltip eligibility check
  isTooltipEligible(tooltipId, formData) {
    // Always check permanent disabling first
    if (this.isPermanentlyDisabled(tooltipId)) {
      console.log(`🚫 Tooltip ${tooltipId} permanently disabled, skipping`);
      return false;
    }

    // Update field tracking for artist detection exception
    this.updateFieldValues(formData);

    // Check if recently dismissed (temporary)
    const now = Date.now();
    const lastDismissed = this.lastDismissalTime?.get?.(tooltipId);
    if (lastDismissed && (now - lastDismissed) < 5000) {
      console.log(`🚫 Tooltip ${tooltipId} recently dismissed, waiting`);
      return false;
    }

    // Check if already active
    if (this.activeTooltips.has(tooltipId)) {
      console.log(`🚫 Tooltip ${tooltipId} already active`);
      return false;
    }

    return true;
  }
} 