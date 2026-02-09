// modules/core/field-quality-analyzer.js
// Field Quality Analysis for Add Items Page
// Extracted from add-items-tooltip-manager.js following edit page patterns

export class FieldQualityAnalyzer {
  constructor(apiManager = null) {
    this.apiManager = apiManager;
    this.lastAnalyzedContent = new Map(); // Track content to avoid duplicate analysis
    
  }

  /**
   * Set API manager for AI-powered analysis
   * @param {Object} apiManager - API manager instance
   */
  setApiManager(apiManager) {
    this.apiManager = apiManager;
  }

  /**
   * Analyze description field quality
   * @param {Object} formData - Current form data
   * @returns {Object} Analysis result with issues and suggestions
   */
  analyzeDescriptionQuality(formData) {
    const issues = [];
    let severity = 'info';

    // Check if we've analyzed this exact content recently
    const contentKey = `description-${formData.description}`;
    if (this.lastAnalyzedContent.has(contentKey)) {
      const lastAnalysis = this.lastAnalyzedContent.get(contentKey);
      if (Date.now() - lastAnalysis.timestamp < 30000) { // 30 second cache
        return lastAnalysis.result;
      }
    }

    // Basic checks
    const basicIssues = this.detectDescriptionIssues(formData);
    issues.push(...basicIssues);

    // Content analysis
    const contentAnalysis = this.analyzeDescriptionContent(formData);
    issues.push(...contentAnalysis.issues);

    // Determine overall severity
    const hasCritical = issues.some(issue => issue.severity === 'critical');
    const hasHigh = issues.some(issue => issue.severity === 'high');
    
    if (hasCritical) {
      severity = 'critical';
    } else if (hasHigh) {
      severity = 'high';
    } else if (issues.length > 0) {
      severity = 'medium';
    }

    const result = {
      issues,
      severity,
      hasIssues: issues.length > 0,
      score: this.calculateDescriptionScore(formData, issues),
      suggestions: this.generateDescriptionSuggestions(formData, issues)
    };

    // Cache the result
    this.lastAnalyzedContent.set(contentKey, {
      timestamp: Date.now(),
      result
    });

    return result;
  }

  /**
   * Detect basic description issues
   * @param {Object} formData - Form data
   * @returns {Array} Array of detected issues
   */
  detectDescriptionIssues(formData) {
    const issues = [];
    const description = formData.description || '';
    const category = formData.category || '';

    // Length checks
    if (description.length < 20) {
      issues.push({
        type: 'length',
        severity: 'critical',
        message: 'Beskrivningen är för kort för professionell katalogisering',
        suggestion: 'Lägg till information om material, teknik, mått och tillstånd'
      });
    } else if (description.length < 50) {
      issues.push({
        type: 'length',
        severity: 'high',
        message: 'Beskrivningen behöver mer detaljer',
        suggestion: 'Inkludera specifik information om material, teknik och mått'
      });
    }

    // Missing measurements
    if (!this.hasMeasurements(description)) {
      issues.push({
        type: 'measurements',
        severity: 'high',
        message: 'Mått saknas i beskrivningen',
        suggestion: 'Lägg till exakta mått (t.ex. "Höjd 25 cm, bredd 30 cm")'
      });
    }

    // Material check
    if (!this.checkMaterialIntelligently(description, category)) {
      issues.push({
        type: 'material',
        severity: 'medium',
        message: 'Material är inte tydligt angivet',
        suggestion: 'Specificera material (t.ex. ek, glas, silver, textil)'
      });
    }

    // Technique check
    if (!this.checkTechniqueIntelligently(description, category)) {
      issues.push({
        type: 'technique',
        severity: 'medium',
        message: 'Tillverkningsteknik saknas',
        suggestion: 'Ange hur objektet är tillverkat (t.ex. handgjord, gjuten, målad)'
      });
    }

    // Signature/marking check
    if (this.shouldCheckSignature(category, formData.title)) {
      const signatureInfo = this.checkSignatureInfo(description);
      if (!signatureInfo.hasSignature && !signatureInfo.hasMarking) {
        issues.push({
          type: 'signature',
          severity: 'low',
          message: 'Information om signering eller märkning saknas',
          suggestion: 'Ange om objektet är signerat, märkt eller osignerat'
        });
      }
    }

    return issues;
  }

  /**
   * Analyze description content for quality
   * @param {Object} formData - Form data
   * @returns {Object} Content analysis result
   */
  analyzeDescriptionContent(formData) {
    const issues = [];
    const description = formData.description || '';

    // Check for placeholder text
    const placeholders = ['beskrivning', 'text här', 'fyll i', 'todo', 'fixme'];
    const hasPlaceholder = placeholders.some(placeholder => 
      description.toLowerCase().includes(placeholder)
    );

    if (hasPlaceholder) {
      issues.push({
        type: 'placeholder',
        severity: 'critical',
        message: 'Beskrivningen innehåller platshållartext',
        suggestion: 'Ersätt platshållartexten med verklig beskrivning'
      });
    }

    // Check for excessive repetition
    const words = description.toLowerCase().split(/\s+/);
    const wordCounts = {};
    words.forEach(word => {
      if (word.length > 3) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    });

    const repeatedWords = Object.entries(wordCounts)
      .filter(([word, count]) => count > 3)
      .map(([word]) => word);

    if (repeatedWords.length > 0) {
      issues.push({
        type: 'repetition',
        severity: 'medium',
        message: 'Vissa ord upprepas mycket i beskrivningen',
        suggestion: `Variara språket och undvik upprepning av: ${repeatedWords.join(', ')}`
      });
    }

    // Check for professional tone
    const informalWords = ['jättebra', 'supersnygg', 'sjukt', 'awesome', 'cool'];
    const hasInformalLanguage = informalWords.some(word => 
      description.toLowerCase().includes(word)
    );

    if (hasInformalLanguage) {
      issues.push({
        type: 'tone',
        severity: 'medium',
        message: 'Beskrivningen använder informellt språk',
        suggestion: 'Använd professionell och objektiv auktionsterminologi'
      });
    }

    return { issues };
  }

  /**
   * Analyze condition field quality
   * @param {Object} formData - Current form data
   * @returns {Object} Analysis result with issues and suggestions
   */
  analyzeConditionQuality(formData) {
    const issues = [];
    let severity = 'info';

    // Check if we've analyzed this exact content recently
    const contentKey = `condition-${formData.condition}`;
    if (this.lastAnalyzedContent.has(contentKey)) {
      const lastAnalysis = this.lastAnalyzedContent.get(contentKey);
      if (Date.now() - lastAnalysis.timestamp < 30000) { // 30 second cache
        return lastAnalysis.result;
      }
    }

    const conditionIssues = this.detectConditionIssues(formData);
    issues.push(...conditionIssues);

    // Determine overall severity
    const hasCritical = issues.some(issue => issue.severity === 'critical');
    const hasHigh = issues.some(issue => issue.severity === 'high');
    
    if (hasCritical) {
      severity = 'critical';
    } else if (hasHigh) {
      severity = 'high';
    } else if (issues.length > 0) {
      severity = 'medium';
    }

    const result = {
      issues,
      severity,
      hasIssues: issues.length > 0,
      score: this.calculateConditionScore(formData, issues),
      suggestions: this.generateConditionSuggestions(formData, issues)
    };

    // Cache the result
    this.lastAnalyzedContent.set(contentKey, {
      timestamp: Date.now(),
      result
    });

    return result;
  }

  /**
   * Detect condition field issues
   * @param {Object} formData - Form data
   * @returns {Array} Array of detected issues
   */
  detectConditionIssues(formData) {
    const issues = [];
    const condition = formData.condition || '';
    const conditionText = condition.replace(/<[^>]*>/g, '').trim(); // Remove HTML tags

    // Check if "Inga anmärkningar" checkbox is checked
    const noRemarksCheckbox = document.querySelector('input[type="checkbox"][value="Inga anmärkningar"]') || 
                             document.querySelector('input[type="checkbox"]#item_no_remarks') ||
                             document.querySelector('input[type="checkbox"][name*="no_remarks"]');
    const noRemarksChecked = noRemarksCheckbox && noRemarksCheckbox.checked;

    // If "no remarks" is checked, condition field should be minimal or empty
    if (noRemarksChecked) {
      if (conditionText.length > 20) {
        issues.push({
          type: 'no_remarks_conflict',
          severity: 'high',
          message: '"Inga anmärkningar" är markerat men konditionsfältet innehåller text',
          suggestion: 'Ta bort texten från konditionsfältet eller avmarkera "Inga anmärkningar"'
        });
      }
      return issues; // Skip other checks if no remarks is checked
    }

    // Length checks (only if no remarks is not checked)
    if (conditionText.length < 10) {
      issues.push({
        type: 'length',
        severity: 'critical',
        message: 'Konditionsbeskrivningen är för kort',
        suggestion: 'Beskriv objektets fysiska tillstånd mer detaljerat'
      });
    }

    // Vague condition terms
    const vagueTerms = ['bruksslitage', 'normalt slitage', 'vanligt slitage', 'åldersslitage'];
    const hasVagueTerm = vagueTerms.some(term => conditionText.toLowerCase().includes(term));
    
    if (hasVagueTerm && conditionText.length < 30) {
      issues.push({
        type: 'vague_terms',
        severity: 'high',
        message: 'Konditionsbeskrivningen är för vag',
        suggestion: 'Beskriv specifika skador: repor, nagg, sprickor, fläckar, etc.'
      });
    }

    // Check for specific damage descriptions
    if (!this.hasSpecificDamageDescription(conditionText)) {
      issues.push({
        type: 'specificity',
        severity: 'medium',
        message: 'Mer specifik skadebeskrivning behövs',
        suggestion: 'Ange typ av skada och var på objektet den finns'
      });
    }

    // Check for location specifics
    if (!this.hasLocationSpecifics(conditionText)) {
      issues.push({
        type: 'location',
        severity: 'low',
        message: 'Platsinformation för skador kan förbättras',
        suggestion: 'Ange var på objektet skadorna finns (t.ex. "vid foten", "på ovansidan")'
      });
    }

    return issues;
  }

  /**
   * Calculate description quality score
   * @param {Object} formData - Form data
   * @param {Array} issues - Detected issues
   * @returns {number} Score from 0-100
   */
  calculateDescriptionScore(formData, issues) {
    let score = 100;
    const description = formData.description || '';

    // Length scoring
    if (description.length < 20) score -= 40;
    else if (description.length < 50) score -= 25;
    else if (description.length > 200) score += 10; // Bonus for detailed descriptions

    // Issue penalties
    issues.forEach(issue => {
      switch (issue.severity) {
        case 'critical': score -= 25; break;
        case 'high': score -= 15; break;
        case 'medium': score -= 10; break;
        case 'low': score -= 5; break;
      }
    });

    // Bonuses for good practices
    if (this.hasMeasurements(description)) score += 10;
    if (this.checkMaterialIntelligently(description, formData.category)) score += 5;
    if (this.checkTechniqueIntelligently(description, formData.category)) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate condition quality score
   * @param {Object} formData - Form data
   * @param {Array} issues - Detected issues
   * @returns {number} Score from 0-100
   */
  calculateConditionScore(formData, issues) {
    let score = 100;
    const condition = formData.condition || '';
    const conditionText = condition.replace(/<[^>]*>/g, '').trim();

    // Check if "no remarks" is checked
    const noRemarksCheckbox = document.querySelector('input[type="checkbox"][value="Inga anmärkningar"]') || 
                             document.querySelector('input[type="checkbox"]#item_no_remarks') ||
                             document.querySelector('input[type="checkbox"][name*="no_remarks"]');
    const noRemarksChecked = noRemarksCheckbox && noRemarksCheckbox.checked;

    if (noRemarksChecked) {
      // If no remarks is checked, condition gets full score if field is empty/minimal
      return conditionText.length > 20 ? 70 : 100;
    }

    // Length scoring
    if (conditionText.length < 10) score -= 40;
    else if (conditionText.length < 20) score -= 25;

    // Issue penalties
    issues.forEach(issue => {
      switch (issue.severity) {
        case 'critical': score -= 30; break;
        case 'high': score -= 20; break;
        case 'medium': score -= 15; break;
        case 'low': score -= 5; break;
      }
    });

    // Bonuses for specific descriptions
    if (this.hasSpecificDamageDescription(conditionText)) score += 10;
    if (this.hasLocationSpecifics(conditionText)) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate description improvement suggestions
   * @param {Object} formData - Form data
   * @param {Array} issues - Detected issues
   * @returns {Array} Array of suggestions
   */
  generateDescriptionSuggestions(formData, issues) {
    const suggestions = [];

    if (issues.some(issue => issue.type === 'length')) {
      suggestions.push('Utöka beskrivningen med mer detaljer om objektets utseende och egenskaper');
    }

    if (issues.some(issue => issue.type === 'measurements')) {
      suggestions.push('Lägg till exakta mått för objektet');
    }

    if (issues.some(issue => issue.type === 'material')) {
      suggestions.push('Specificera material mer tydligt');
    }

    if (issues.some(issue => issue.type === 'technique')) {
      suggestions.push('Beskriv tillverkningsteknik eller ursprung');
    }

    return suggestions;
  }

  /**
   * Generate condition improvement suggestions
   * @param {Object} formData - Form data
   * @param {Array} issues - Detected issues
   * @returns {Array} Array of suggestions
   */
  generateConditionSuggestions(formData, issues) {
    const suggestions = [];

    if (issues.some(issue => issue.type === 'vague_terms')) {
      suggestions.push('Ersätt vaga termer med specifika skadebeskrivningar');
    }

    if (issues.some(issue => issue.type === 'specificity')) {
      suggestions.push('Beskriv typ av skador: repor, nagg, sprickor, fläckar, missfärgningar');
    }

    if (issues.some(issue => issue.type === 'location')) {
      suggestions.push('Ange var på objektet skadorna finns');
    }

    return suggestions;
  }

  // Helper methods (extracted from original add-items-tooltip-manager.js)

  hasMeasurements(text) {
    const measurementPatterns = [
      /\d+([.,]\d+)?\s*(×|x)\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i,
      /\d+([.,]\d+)?\s*(mm|cm|m)\b/i,
      /(höjd|bredd|längd|diameter)\s*:?\s*\d+/i
    ];
    return measurementPatterns.some(pattern => pattern.test(text));
  }

  checkMaterialIntelligently(text, category) {
    const materials = [
      'trä', 'ek', 'björk', 'furu', 'mahogny', 'teak', 'bok',
      'metall', 'järn', 'stål', 'koppar', 'mässing', 'silver', 'guld',
      'glas', 'kristall', 'keramik', 'porslin', 'lergods',
      'textil', 'tyg', 'bomull', 'lin', 'ull', 'siden',
      'läder', 'skinn', 'plast', 'gummi'
    ];
    
    const lowerText = text.toLowerCase();
    return materials.some(material => lowerText.includes(material));
  }

  checkTechniqueIntelligently(text, category) {
    const techniques = [
      'handgjord', 'handtillverkad', 'handslagen', 'handblåst',
      'maskinell', 'gjuten', 'pressad', 'svarv', 'drejade',
      'målad', 'lackerad', 'polerad', 'patinerad',
      'vävd', 'sticka', 'broderad', 'tryckt'
    ];
    
    const lowerText = text.toLowerCase();
    return techniques.some(technique => lowerText.includes(technique));
  }

  shouldCheckSignature(category, title) {
    const artCategories = ['konst', 'målning', 'skulptur', 'grafik', 'keramik'];
    const categoryLower = (category || '').toLowerCase();
    const titleLower = (title || '').toLowerCase();
    
    return artCategories.some(cat => categoryLower.includes(cat) || titleLower.includes(cat));
  }

  checkSignatureInfo(description) {
    const signaturePatterns = [
      /signerad/i, /sign\./i, /märkt/i, /stämplad/i,
      /osignerad/i, /ej signerad/i, /utan signatur/i
    ];
    
    const hasSignature = signaturePatterns.some(pattern => pattern.test(description));
    const hasMarking = /märk/i.test(description);
    
    return { hasSignature, hasMarking };
  }

  hasSpecificDamageDescription(conditionText) {
    const specificTerms = [
      'repa', 'repor', 'skråma', 'rispor',
      'nagg', 'spricka', 'sprickor', 'skada',
      'fläck', 'missfärgning', 'rost',
      'slitage vid', 'skador på', 'märken i'
    ];
    
    const lowerText = conditionText.toLowerCase();
    return specificTerms.some(term => lowerText.includes(term));
  }

  hasLocationSpecifics(conditionText) {
    const locationTerms = [
      'vid foten', 'på ovansidan', 'på undersidan', 'längs kanten',
      'i hörnet', 'på sidan', 'framtill', 'baktill',
      'invändigt', 'utvändigt', 'på handtaget', 'på locket'
    ];
    
    const lowerText = conditionText.toLowerCase();
    return locationTerms.some(term => lowerText.includes(term));
  }

  /**
   * Clear analysis cache
   */
  clearCache() {
    this.lastAnalyzedContent.clear();
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    this.clearCache();
    this.apiManager = null;
  }
} 