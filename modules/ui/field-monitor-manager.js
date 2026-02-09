// modules/ui/field-monitor-manager.js
// Real-time Field Monitoring and Validation for Add Items Page
// Extracted from add-items-tooltip-manager.js following edit page patterns

export class FieldMonitorManager {
  constructor(options = {}) {
    this.options = {
      debounceTime: 1000,
      enableRealTimeAnalysis: true,
      monitorFocus: true,
      monitorTyping: true,
      ...options
    };

    this.fieldMonitors = new Map();
    this.debounceTimers = new Map();
    this.lastFieldContent = new Map();
    this.userInteractionLog = new Map();
    this.isInitialized = false;

  }

  /**
   * Initialize field monitoring
   * @param {Object} dependencies - Required dependencies
   */
  init(dependencies = {}) {
    const {
      tooltipSystemManager,
      fieldQualityAnalyzer,
      apiBridge
    } = dependencies;

    this.tooltipSystemManager = tooltipSystemManager;
    this.fieldQualityAnalyzer = fieldQualityAnalyzer;
    this.apiBridge = apiBridge;

    // Set up monitoring for all relevant fields
    this.setupFieldMonitoring();
    
    this.isInitialized = true;
  }

  /**
   * Setup monitoring for all form fields
   */
  setupFieldMonitoring() {
    const fieldsToMonitor = [
      {
        selector: '#item_title_sv',
        type: 'title',
        validator: 'title',
        priority: 'high'
      },
      {
        selector: '#item_description_sv',
        type: 'description',
        validator: 'description',
        priority: 'high'
      },
      {
        selector: '#item_condition_sv',
        type: 'condition',
        validator: 'condition',
        priority: 'medium'
      },
      {
        selector: '#item_artist_name_sv',
        type: 'artist',
        validator: 'artist',
        priority: 'high'
      },
      {
        selector: '#item_hidden_keywords',
        type: 'keywords',
        validator: 'keywords',
        priority: 'medium'
      }
    ];

    fieldsToMonitor.forEach(fieldConfig => {
      this.setupSingleFieldMonitoring(fieldConfig);
    });

  }

  /**
   * Setup monitoring for a single field
   * @param {Object} fieldConfig - Field configuration
   */
  setupSingleFieldMonitoring(fieldConfig) {
    const { selector, type, validator, priority } = fieldConfig;
    const element = document.querySelector(selector);

    if (!element) {
      return;
    }

    // Store field info
    this.fieldMonitors.set(type, {
      element,
      selector,
      validator,
      priority,
      lastValidationTime: 0,
      validationResults: null
    });

    // Initialize tracking
    this.lastFieldContent.set(type, element.value || '');
    this.userInteractionLog.set(type, {
      focusCount: 0,
      keystrokes: 0,
      lastFocus: null,
      totalTimeSpent: 0,
      hasBeenModified: false
    });

    // Setup event listeners
    this.attachFieldEventListeners(element, type);

  }

  /**
   * Attach event listeners to a field
   * @param {HTMLElement} element - Field element
   * @param {string} fieldType - Field type
   */
  attachFieldEventListeners(element, fieldType) {
    // Input change monitoring
    const handleInput = () => {
      this.handleFieldInput(fieldType);
    };

    // Focus monitoring
    const handleFocus = () => {
      this.handleFieldFocus(fieldType);
    };

    const handleBlur = () => {
      this.handleFieldBlur(fieldType);
    };

    // Paste monitoring
    const handlePaste = () => {
      // Delay to allow paste content to be processed
      setTimeout(() => {
        this.handleFieldInput(fieldType, { isPaste: true });
      }, 100);
    };

    // Attach listeners
    element.addEventListener('input', handleInput);
    element.addEventListener('focus', handleFocus);
    element.addEventListener('blur', handleBlur);
    element.addEventListener('paste', handlePaste);

    // Store cleanup function
    const fieldInfo = this.fieldMonitors.get(fieldType);
    if (fieldInfo) {
      fieldInfo.cleanup = () => {
        element.removeEventListener('input', handleInput);
        element.removeEventListener('focus', handleFocus);
        element.removeEventListener('blur', handleBlur);
        element.removeEventListener('paste', handlePaste);
      };
    }
  }

  /**
   * Handle field input changes
   * @param {string} fieldType - Field type
   * @param {Object} options - Additional options
   */
  handleFieldInput(fieldType, options = {}) {
    const fieldInfo = this.fieldMonitors.get(fieldType);
    if (!fieldInfo) return;

    const currentContent = fieldInfo.element.value || '';
    const lastContent = this.lastFieldContent.get(fieldType);

    // Check if content actually changed
    if (currentContent === lastContent && !options.isPaste) {
      return;
    }

    // Update tracking
    this.lastFieldContent.set(fieldType, currentContent);
    const userLog = this.userInteractionLog.get(fieldType);
    if (userLog) {
      userLog.hasBeenModified = true;
      userLog.keystrokes++;
    }

    // Clear existing debounce timer
    if (this.debounceTimers.has(fieldType)) {
      clearTimeout(this.debounceTimers.get(fieldType));
    }

    // Set new debounce timer for analysis
    const timer = setTimeout(() => {
      this.triggerFieldAnalysis(fieldType, options);
    }, this.options.debounceTime);

    this.debounceTimers.set(fieldType, timer);

  }

  /**
   * Handle field focus
   * @param {string} fieldType - Field type
   */
  handleFieldFocus(fieldType) {
    const userLog = this.userInteractionLog.get(fieldType);
    if (userLog) {
      userLog.focusCount++;
      userLog.lastFocus = Date.now();
    }

  }

  /**
   * Handle field blur (lose focus)
   * @param {string} fieldType - Field type
   */
  handleFieldBlur(fieldType) {
    const userLog = this.userInteractionLog.get(fieldType);
    if (userLog && userLog.lastFocus) {
      const timeSpent = Date.now() - userLog.lastFocus;
      userLog.totalTimeSpent += timeSpent;
      userLog.lastFocus = null;
    }

    // Trigger immediate analysis on blur for important fields
    const fieldInfo = this.fieldMonitors.get(fieldType);
    if (fieldInfo && fieldInfo.priority === 'high') {
      this.triggerFieldAnalysis(fieldType, { immediate: true });
    }

  }

  /**
   * Trigger analysis for a specific field
   * @param {string} fieldType - Field type
   * @param {Object} options - Analysis options
   */
  async triggerFieldAnalysis(fieldType, options = {}) {
    if (!this.options.enableRealTimeAnalysis && !options.immediate) {
      return;
    }

    const fieldInfo = this.fieldMonitors.get(fieldType);
    if (!fieldInfo) return;

    try {
      // Get current form data
      const formData = this.extractFormData();

      // Perform field-specific analysis
      let analysisResult = null;

      switch (fieldType) {
        case 'description':
          if (this.fieldQualityAnalyzer) {
            analysisResult = this.fieldQualityAnalyzer.analyzeDescriptionQuality(formData);
          }
          break;

        case 'condition':
          if (this.fieldQualityAnalyzer) {
            analysisResult = this.fieldQualityAnalyzer.analyzeConditionQuality(formData);
          }
          break;

        case 'artist':
          // Check for artist detection if title and artist fields are available
          if (formData.title && this.apiBridge?.apiManager) {
            try {
              const artistDetection = await this.apiBridge.apiManager.analyzeForArtist(
                formData.title, 
                '', // objectType can be empty
                formData.artist, 
                formData.description || ''
              );
              
              if (artistDetection && artistDetection.hasArtist) {
                analysisResult = {
                  type: 'artist_suggestion',
                  suggestion: artistDetection,
                  severity: artistDetection.confidence > 0.7 ? 'high' : 'medium'
                };
              }
            } catch (error) {
            }
          }
          break;

        case 'title':
          // Basic title analysis
          analysisResult = this.analyzeTitleBasic(formData);
          break;

        case 'keywords':
          // Basic keyword analysis
          analysisResult = this.analyzeKeywordsBasic(formData);
          break;
      }

      // Store analysis results
      fieldInfo.validationResults = analysisResult;
      fieldInfo.lastValidationTime = Date.now();

      // Show tooltips or indicators based on results
      if (analysisResult && analysisResult.severity !== 'info') {
        this.showFieldAnalysisResult(fieldType, analysisResult);
      }


    } catch (error) {
      console.error(`FieldMonitorManager: Analysis failed for ${fieldType}:`, error);
    }
  }

  /**
   * Show analysis results for a field
   * @param {string} fieldType - Field type
   * @param {Object} result - Analysis result
   */
  showFieldAnalysisResult(fieldType, result) {
    if (!this.tooltipSystemManager) return;

    const fieldInfo = this.fieldMonitors.get(fieldType);
    if (!fieldInfo) return;

    const tooltipId = `${fieldType}-analysis`;

    // Check if tooltip should be shown (not recently dismissed)
    if (!this.tooltipSystemManager.isTooltipEligible(tooltipId)) {
      return;
    }

    // Create tooltip configuration based on result type
    let tooltipConfig = null;

    if (result.type === 'artist_suggestion') {
      tooltipConfig = {
        id: tooltipId,
        title: '🎨 Konstnär upptäckt',
        content: `
          <p><strong>${result.suggestion.artistName}</strong> upptäcktes i titeln.</p>
          <p class="confidence">Konfidensgrad: ${Math.round(result.suggestion.confidence * 100)}%</p>
          ${result.suggestion.reasoning ? `<p class="reasoning">${result.suggestion.reasoning}</p>` : ''}
        `,
        type: 'artist',
        buttons: [
          {
            text: 'Flytta konstnär',
            type: 'primary',
            action: 'move_artist',
            handler: () => this.handleMoveArtist(result.suggestion)
          },
          {
            text: 'Ignorera',
            type: 'default',
            action: 'ignore',
            handler: () => this.tooltipSystemManager.dismissTooltip(tooltipId)
          }
        ]
      };
    } else if (result.issues && result.issues.length > 0) {
      const highPriorityIssues = result.issues.filter(issue => 
        issue.severity === 'critical' || issue.severity === 'high'
      );

      if (highPriorityIssues.length > 0) {
        const mainIssue = highPriorityIssues[0];
        tooltipConfig = {
          id: tooltipId,
          title: `⚠️ ${this.getFieldDisplayName(fieldType)} behöver förbättras`,
          content: `
            <p><strong>${mainIssue.message}</strong></p>
            <p class="suggestion">${mainIssue.suggestion}</p>
            ${highPriorityIssues.length > 1 ? `<p class="additional">+${highPriorityIssues.length - 1} ytterligare problem</p>` : ''}
          `,
          type: result.severity === 'critical' ? 'warning' : 'info',
          buttons: [
            {
              text: 'Förbättra med AI',
              type: 'primary',
              action: 'improve_ai',
              handler: () => this.handleAIImprovement(fieldType)
            },
            {
              text: 'OK',
              type: 'default',
              action: 'dismiss',
              handler: () => this.tooltipSystemManager.dismissTooltip(tooltipId)
            }
          ]
        };
      }
    }

    // Show tooltip if we have a configuration - positioned to the left to be less intrusive
    if (tooltipConfig) {
      this.tooltipSystemManager.showTooltip(tooltipConfig, fieldInfo.element, 'left');
    }
  }

  /**
   * Handle moving artist from title to artist field
   * @param {Object} artistSuggestion - Artist suggestion data
   */
  async handleMoveArtist(artistSuggestion) {
    try {
      // Get artist field
      const artistField = document.querySelector('#item_artist_name_sv');
      const titleField = document.querySelector('#item_title_sv');

      if (artistField && titleField && artistSuggestion.artistName) {
        // Set artist field
        artistField.value = artistSuggestion.artistName;
        artistField.dispatchEvent(new Event('change', { bubbles: true }));

        // Update title if suggested title is provided
        if (artistSuggestion.suggestedTitle) {
          titleField.value = artistSuggestion.suggestedTitle;
          titleField.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Add visual feedback
        artistField.classList.add('field-success');
        titleField.classList.add('field-success');

        setTimeout(() => {
          artistField.classList.remove('field-success');
          titleField.classList.remove('field-success');
        }, 2000);

      }
    } catch (error) {
      console.error('FieldMonitorManager: Failed to move artist:', error);
    }
  }

  /**
   * Handle AI improvement for a field
   * @param {string} fieldType - Field type to improve
   */
  async handleAIImprovement(fieldType) {
    if (!this.apiBridge) return;

    try {
      // Use the API bridge to improve the field
      await this.apiBridge.improveField(fieldType);
    } catch (error) {
      console.error(`FieldMonitorManager: AI improvement failed for ${fieldType}:`, error);
    }
  }

  /**
   * Basic title analysis
   * @param {Object} formData - Form data
   * @returns {Object} Analysis result
   */
  analyzeTitleBasic(formData) {
    const issues = [];
    const title = formData.title || '';

    if (title.length < 10) {
      issues.push({
        type: 'length',
        severity: 'high',
        message: 'Titeln är för kort',
        suggestion: 'Lägg till mer beskrivande information'
      });
    }

    if (title.length > 80) {
      issues.push({
        type: 'length',
        severity: 'medium',
        message: 'Titeln är mycket lång',
        suggestion: 'Överväg att korta ner för bättre läsbarhet'
      });
    }

    return {
      issues,
      severity: issues.length > 0 ? issues[0].severity : 'info',
      hasIssues: issues.length > 0
    };
  }

  /**
   * Basic keywords analysis
   * @param {Object} formData - Form data
   * @returns {Object} Analysis result
   */
  analyzeKeywordsBasic(formData) {
    const issues = [];
    const keywords = formData.keywords || '';

    if (keywords.length === 0) {
      issues.push({
        type: 'missing',
        severity: 'medium',
        message: 'Inga sökord angivna',
        suggestion: 'Lägg till relevanta sökord för bättre sökbarhet'
      });
    }

    return {
      issues,
      severity: issues.length > 0 ? issues[0].severity : 'info',
      hasIssues: issues.length > 0
    };
  }

  /**
   * Extract current form data
   * @returns {Object} Form data
   */
  extractFormData() {
    return {
      category: document.querySelector('#item_category_id option:checked')?.textContent || '',
      title: document.querySelector('#item_title_sv')?.value || '',
      description: document.querySelector('#item_description_sv')?.value || '',
      condition: document.querySelector('#item_condition_sv')?.value || '',
      artist: document.querySelector('#item_artist_name_sv')?.value || '',
      keywords: document.querySelector('#item_hidden_keywords')?.value || ''
    };
  }

  /**
   * Get display name for field type
   * @param {string} fieldType - Field type
   * @returns {string} Display name
   */
  getFieldDisplayName(fieldType) {
    const names = {
      'title': 'Titel',
      'description': 'Beskrivning',
      'condition': 'Kondition',
      'artist': 'Konstnär',
      'keywords': 'Sökord'
    };
    return names[fieldType] || fieldType;
  }

  /**
   * Get user interaction statistics
   * @param {string} fieldType - Field type (optional)
   * @returns {Object} Interaction statistics
   */
  getUserInteractionStats(fieldType = null) {
    if (fieldType) {
      return this.userInteractionLog.get(fieldType) || {};
    }

    const stats = {};
    this.userInteractionLog.forEach((data, type) => {
      stats[type] = data;
    });
    return stats;
  }

  /**
   * Force analysis for all fields
   */
  async analyzeAllFields() {
    const fieldTypes = Array.from(this.fieldMonitors.keys());
    
    for (const fieldType of fieldTypes) {
      await this.triggerFieldAnalysis(fieldType, { immediate: true });
    }

  }

  /**
   * Enable/disable real-time analysis
   * @param {boolean} enabled - Whether to enable real-time analysis
   */
  setRealTimeAnalysis(enabled) {
    this.options.enableRealTimeAnalysis = enabled;
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    // Clear all timers
    this.debounceTimers.forEach(timer => clearTimeout(timer));
    this.debounceTimers.clear();

    // Remove event listeners
    this.fieldMonitors.forEach(fieldInfo => {
      if (fieldInfo.cleanup) {
        fieldInfo.cleanup();
      }
    });

    // Clear data
    this.fieldMonitors.clear();
    this.lastFieldContent.clear();
    this.userInteractionLog.clear();

  }
} 