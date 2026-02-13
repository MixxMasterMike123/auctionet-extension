// modules/add-items/artist-handler.js - Artist detection and management for add items page

import { escapeHTML } from '../core/html-escape.js';

export class AddItemsArtistHandler {
  constructor() {
    this.artistDetectionManager = null;
    this.lastArtistDetection = null;
    this.artistDetectionTimeout = null;
    this.lastAnalyzedContent = new Map();
    this.callbacks = {};
  }

  setDependencies({ artistDetectionManager, apiManager }) {
    this.artistDetectionManager = artistDetectionManager;
    this.apiManager = apiManager;
  }

  setCallbacks(callbacks) {
    this.callbacks = callbacks;
  }

  // Helper accessors for orchestrator state (via callbacks)
  get enabled() { return this.callbacks.isEnabled?.() ?? true; }
  get fieldMappings() { return this.callbacks.getFieldMappings?.() ?? {}; }

  scheduleArtistDetection() {
    if (!this.enabled || !this.apiManager?.apiKey) {
      return;
    }

    if (this.artistDetectionTimeout) {
      clearTimeout(this.artistDetectionTimeout);
    }

    this.artistDetectionTimeout = setTimeout(async () => {
      const formData = this.callbacks.extractFormData();
      
      if (!this.callbacks.hasEnoughDataForAnalysis(formData)) {
        return;
      }

      const contentKey = `${formData.title.trim()}|${formData.artist.trim()}`;
      const lastContent = this.lastAnalyzedContent.get('artist-detection');
      
      if (lastContent === contentKey) {
        return;
      }
      
      const tooltipId = 'artist-detection';
      if (this.callbacks.isTooltipActive(tooltipId) && lastContent) {
        const [lastTitle] = lastContent.split('|');
        const currentTitle = formData.title.trim();
        
        if (currentTitle.includes(lastTitle) && currentTitle.length > lastTitle.length) {
          this.lastAnalyzedContent.set('artist-detection', contentKey);
          return;
        }
        
        this.callbacks.dismissTooltip(tooltipId);
        
        setTimeout(() => {
          this.analyzeArtistDetection(formData, { allowReDetection: true });
        }, 200);
      } else {
        this.lastAnalyzedContent.set('artist-detection', contentKey);
        await this.analyzeArtistDetection(formData, { allowReDetection: true });
      }
    }, 1500);
  }

  async triggerArtistDetectionOnly() {
    if (!this.enabled || !this.apiManager?.apiKey) {
      return;
    }

    const formData = this.callbacks.extractFormData();
    
    if (!this.callbacks.hasEnoughDataForAnalysis(formData)) {
      return;
    }

    try {
      await this.analyzeArtistDetection(formData, { allowReDetection: true });
    } catch (error) {
      console.error('Artist re-detection error:', error);
    }
  }

  async analyzeArtistDetection(formData, options = {}) {
    if (!formData.title || formData.title.length < 15) {
      return;
    }
    
    const hasExistingArtist = formData.artist && formData.artist.trim().length > 2;
    
    if (hasExistingArtist && !options.allowReDetection) {
      return;
    }
    
    const tooltipId = 'artist-detection';
    if (!this.callbacks.isTooltipEligible(tooltipId, formData)) {
      return;
    }
    
    try {
      const artistDetection = await this.artistDetectionManager.detectMisplacedArtist(
        formData.title, 
        options.allowReDetection ? '' : formData.artist,
        options.allowReDetection || false
      );
      
      if (artistDetection && 
          artistDetection.detectedArtist && 
          typeof artistDetection.detectedArtist === 'string' &&
          artistDetection.detectedArtist.trim().length > 0) {
        
        const detectedName = artistDetection.detectedArtist.trim();
        
        if (this.isLikelyTypo(detectedName, formData.title)) {
          return;
        }
        
        const confidence = artistDetection.confidence || 0;
        const minConfidence = artistDetection.source === 'ai' ? 0.6 : 0.7;
        
        if (confidence < minConfidence) {
          return;
        }
        
        this.lastArtistDetection = artistDetection;
        
        if (options.allowReDetection) {
          const existingTooltip = document.querySelector('#ai-tooltip-artist-detection');
          const existingArtistName = existingTooltip?.querySelector('.artist-detection-info strong')?.textContent;
          
          if (existingArtistName && existingArtistName !== artistDetection.detectedArtist) {
            this.callbacks.dismissTooltip(tooltipId);
            this.callbacks.clearTooltipTracking(tooltipId);
            
            setTimeout(() => {
              this.showArtistDetectionTooltip(artistDetection, { 
                isReplacement: hasExistingArtist,
                existingArtist: formData.artist,
                isReDetection: true
              });
            }, 100);
          } else if (!existingTooltip) {
            this.showArtistDetectionTooltip(artistDetection, { 
              isReplacement: hasExistingArtist,
              existingArtist: formData.artist,
              isReDetection: true
            });
          }
        } else {
          this.showArtistDetectionTooltip(artistDetection, { 
            isReplacement: hasExistingArtist,
            existingArtist: formData.artist 
          });
        }
      } else {
        if (options.allowReDetection) {
          this.callbacks.dismissTooltip(tooltipId);
        }
      }
    } catch (error) {
      console.error('Artist detection error with SSoT:', error);
      
      if (options.allowReDetection) {
        this.callbacks.dismissTooltip(tooltipId);
      }
    }
  }

  isLikelyTypo(detectedName, originalTitle) {
    const normalizedName = detectedName.toLowerCase();
    
    const knownArtists = {
      'lisa larson': ['lisa larsoo', 'lisa larrson', 'lisa larsson'],
      'carl larsson': ['carl larsoo', 'carl larrson'],
      'bruno liljefors': ['bruno liljefor', 'bruno liljefores'],
      'anders zorn': ['anders zorr', 'anders zor'],
      'einar jolin': ['einar jollin', 'einar joolin'],
      'isaac grünewald': ['isaac grunewald', 'isaac grünewld'],
      'gösta adrian-nilsson': ['gösta adrian nilsson', 'gosta adrian-nilsson']
    };
    
    for (const [correctName, typos] of Object.entries(knownArtists)) {
      if (typos.includes(normalizedName)) {
        return true;
      }
    }
    
    if (/(.)\1{2,}/.test(normalizedName)) {
      return true;
    }
    
    const words = detectedName.split(' ');
    if (words.length < 2 || words.some(word => word.length < 2 || word.length > 15)) {
      return true;
    }
    
    return false;
  }

  showArtistDetectionTooltip(artistDetection, options = {}) {
    const titleField = document.querySelector(this.fieldMappings.title);
    if (!titleField) return;

    const tooltipId = 'artist-detection';
    
    if (!options.isReDetection) {
      const now = Date.now();
      const lastDismissed = this.callbacks.getLastDismissalTime(tooltipId);
      if (lastDismissed && (now - lastDismissed) < 5000) {
        return;
      }

      if (this.callbacks.isTooltipActive(tooltipId)) {
        return;
      }
    }

    const delay = options.isReDetection ? 150 : 800;
    
    setTimeout(() => {
      if (!options.isReDetection) {
        const recentDismissal = this.callbacks.getLastDismissalTime(tooltipId);
        if (recentDismissal && (Date.now() - recentDismissal) < 5000) return;
        
        if (this.callbacks.isTooltipActive(tooltipId)) {
          return;
        }
      }
      
      const confidence = artistDetection.confidence || 0;
      const confidenceText = Math.round(confidence * 100);
      const isVerified = artistDetection.isVerified || false;
      const biography = artistDetection.biography || '';
      const reasoning = artistDetection.reasoning || '';
      
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
          this.callbacks.permanentlyDisableTooltip('artist-detection', 'user_moved_artist');
          this.moveArtistFromTitle(artistDetection.detectedArtist, artistDetection.suggestedTitle || '', options);
        }
      }];

      if (biography && biography.length > 120) {
        buttons.unshift({
          text: 'Info',
          className: 'btn-info',
          onclick: () => this.showArtistBiographyPopup(artistDetection.detectedArtist, biography)
        });
      }

      this.callbacks.createTooltip({
        id: tooltipId,
        targetElement: titleField,
        content,
        buttons,
        side: 'left',
        type: 'artist-detection',
        persistent: true
      });
      
    }, delay);
  }

  moveArtistFromTitle(artistName, suggestedTitle, options = {}) {
    if (!artistName || typeof artistName !== 'string' || artistName.trim().length === 0) {
      console.error('Invalid artist name provided to moveArtistFromTitle:', artistName);
      this.callbacks.showErrorFeedback('Ogiltigt konstnärsnamn');
      return;
    }
    
    const cleanArtistName = artistName.trim();
    
    try {
      this.callbacks.setProgrammaticUpdate(true);
      
      const artistFieldSelectors = [
        '#item_artist_name_sv',
        'input[name*="artist"]',
        'input[id*="artist"]',
        'input[placeholder*="konstnär"]',
        'input[placeholder*="artist"]'
      ];
      
      let artistField = null;
      
      for (const selector of artistFieldSelectors) {
        artistField = document.querySelector(selector);
        if (artistField) {
          break;
        }
      }
      
      if (!artistField) {
        console.error('Artist field not found with any selector');
        this.callbacks.showErrorFeedback('Konstnärsfält kunde inte hittas på sidan');
        return;
      }
      
      const existingArtist = artistField.value ? artistField.value.trim() : '';
      
      if (existingArtist && existingArtist !== cleanArtistName) {
        if (options.isReplacement) {
          artistField.value = cleanArtistName;
        } else {
          const confirm = window.confirm(`Ersätta befintlig konstnär "${existingArtist}" med "${cleanArtistName}"?`);
          if (!confirm) {
            return;
          }
          artistField.value = cleanArtistName;
        }
      } else {
        artistField.value = cleanArtistName;
      }
      
      if (suggestedTitle && suggestedTitle.trim().length > 0) {
        const titleField = document.querySelector(this.fieldMappings.title);
        
        if (titleField && titleField.value.trim() !== suggestedTitle.trim()) {
          titleField.value = suggestedTitle;
          
          ['input', 'change', 'blur'].forEach(eventType => {
            try {
              titleField.dispatchEvent(new Event(eventType, { bubbles: true }));
            } catch (eventError) {
            }
          });
        }
      }
      
      ['input', 'change', 'blur'].forEach(eventType => {
        try {
          artistField.dispatchEvent(new Event(eventType, { bubbles: true }));
        } catch (eventError) {
        }
      });
      
      this.callbacks.showSuccessFeedback(`Konstnär "${cleanArtistName}" ${options.isReplacement ? 'ersatt' : 'tillagd'}!`);
      
      this.callbacks.dismissTooltip('artist-detection');
      
      setTimeout(() => {
        this.callbacks.triggerAnalysis();
      }, 1000);
      
    } catch (error) {
      console.error('Error moving artist from title:', error);
      this.callbacks.showErrorFeedback(`Fel vid flytt av konstnär: ${error.message}`);
    } finally {
      this.callbacks.setProgrammaticUpdate(false);
    }
  }

  async getArtistInformation(artistName) {
    try {
      if (this.lastArtistDetection && 
          this.lastArtistDetection.detectedArtist === artistName &&
          this.lastArtistDetection.biography) {
        return {
          name: artistName,
          biography: this.lastArtistDetection.biography,
          source: 'detection'
        };
      }
      
      const qualityAnalyzer = this.callbacks.getQualityAnalyzer?.();
      if (qualityAnalyzer && qualityAnalyzer.getArtistBiography) {
        const biography = await qualityAnalyzer.getArtistBiography(artistName);
        if (biography) {
          return {
            name: artistName,
            biography: biography,
            source: 'database'
          };
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  async showArtistBiographyPopup(artistName, biography) {
    const popup = document.createElement('div');
    popup.className = 'artist-bio-popup-overlay';
    popup.innerHTML = `
      <div class="artist-bio-popup">
        <div class="popup-header">
          <h3>${escapeHTML(artistName)}</h3>
          <button class="popup-close" type="button">✕</button>
        </div>
        <div class="popup-content">
          <p>${escapeHTML(biography)}</p>
        </div>
      </div>
    `;
    
    document.body.appendChild(popup);
    
    const closeBtn = popup.querySelector('.popup-close');
    closeBtn.addEventListener('click', () => {
      popup.remove();
    });
    
    popup.addEventListener('click', (e) => {
      if (e.target === popup) {
        popup.remove();
      }
    });
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        popup.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  async analyzeArtistEnhancement(formData) {
    if (!formData.artist || formData.artist.trim().length < 3) {
      return;
    }

    const tooltipId = 'artist-enhancement';
    if (!this.callbacks.isTooltipEligible(tooltipId, formData)) {
      return;
    }

    if (this.callbacks.isTooltipActive('artist-detection')) {
      return;
    }

    if (!this.apiManager?.enableArtistInfo) {
      return;
    }

    this.showArtistEnhancementTooltip(formData);
  }

  hasSubstantialArtistContext(description, artistName) {
    const descLower = description.toLowerCase();
    
    const contextIndicators = [
      'karakteristisk', 'stil', 'period', 'verksamhet', 'känd för',
      'expressionistisk', 'impressionistisk', 'modernistisk', 'klassicistisk',
      'skolan', 'tradition', 'generationen', 'aktiv', 'verksam',
      'tillhör', 'dokumenterad', 'forskning visar', 'anses vara'
    ];
    
    const contextCount = contextIndicators.filter(indicator => 
      descLower.includes(indicator)
    ).length;
    
    if (contextCount >= 2) {
      return true;
    }

    const cleanDescription = description.replace(/<[^>]*>/g, '').trim();
    if (cleanDescription.length > 200) {
      return true;
    }

    return false;
  }

  async showArtistEnhancementTooltip(formData) {
    const descriptionField = document.querySelector(this.fieldMappings.description);
    if (!descriptionField) return;

    const tooltipId = 'artist-enhancement';
    
    setTimeout(() => {
      if (this.callbacks.isDismissed(tooltipId)) return;
      
      if (this.callbacks.isTooltipActive(tooltipId)) return;

      if (this.callbacks.isTooltipActive('artist-detection')) return;
      
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
            this.callbacks.permanentlyDisableTooltip('artist-enhancement', 'user_improved_description');
            this.callbacks.dismissTooltip(tooltipId);
            this.callbacks.improveField('description');
          }
        },
        {
          text: 'Hoppa över',
          className: 'btn-secondary',
          onclick: () => {
            this.callbacks.permanentlyDisableTooltip('artist-enhancement', 'user_skipped');
            this.callbacks.dismissTooltip(tooltipId);
            this.callbacks.addDismissed(tooltipId);
          }
        }
      ];

      this.callbacks.createTooltip({
        id: tooltipId,
        targetElement: descriptionField,
        content,
        buttons,
        side: 'left',
        type: 'artist-enhancement'
      });
      
    }, 1200);
  }
}
