// modules/core/ai-enhancement-engine.js
// Shared AI Enhancement Logic for Edit and Add Pages

export class AIEnhancementEngine {
  constructor(apiManager) {
    this.apiManager = apiManager;
    this.pendingRequests = new Map(); // Prevent duplicate requests
  }

  /**
   * Improve a single field using AI
   * @param {Object} formData - Current form data
   * @param {string} fieldType - Field to improve ('title', 'description', 'condition', 'keywords')
   * @param {Object} options - Additional options for AI enhancement
   * @returns {Promise<Object>} Enhanced field data
   */
  async improveField(formData, fieldType, options = {}) {
    console.log(`🚀 AI Enhancement: Improving ${fieldType}...`);
    
    if (!this.apiManager?.apiKey) {
      throw new Error('API key not configured. Please set your Anthropic API key in the extension popup.');
    }

    // Prevent duplicate requests for the same field
    const requestKey = `${fieldType}-${JSON.stringify(formData).substring(0, 100)}`;
    if (this.pendingRequests.has(requestKey)) {
      console.log(`⏳ Request already pending for ${fieldType}, waiting...`);
      return await this.pendingRequests.get(requestKey);
    }

    // Create the promise and store it
    const enhancementPromise = this.performEnhancement(formData, fieldType, options);
    this.pendingRequests.set(requestKey, enhancementPromise);

    try {
      const result = await enhancementPromise;
      return result;
    } finally {
      // Clean up the pending request
      this.pendingRequests.delete(requestKey);
    }
  }

  /**
   * Improve all fields at once
   * @param {Object} formData - Current form data
   * @param {Object} options - Enhancement options
   * @returns {Promise<Object>} All enhanced fields
   */
  async improveAllFields(formData, options = {}) {
    console.log('🚀 AI Enhancement: Improving all fields...');
    
    if (!this.apiManager?.apiKey) {
      throw new Error('API key not configured. Please set your Anthropic API key in the extension popup.');
    }

    return await this.performEnhancement(formData, 'all', options);
  }

  /**
   * Core enhancement logic - calls the API manager
   * @param {Object} formData - Form data to enhance
   * @param {string} fieldType - Field type or 'all'
   * @param {Object} options - Enhancement options
   * @returns {Promise<Object>} Enhanced data
   */
  async performEnhancement(formData, fieldType, options = {}) {
    try {
      // Use existing API manager's Claude API call
      const improvements = await this.apiManager.callClaudeAPI(formData, fieldType, options);
      
      if (!improvements) {
        throw new Error('No improvements received from API');
      }

      console.log(`✅ AI Enhancement: Received improvements for ${fieldType}:`, Object.keys(improvements));
      return improvements;

    } catch (error) {
      console.error(`❌ AI Enhancement: Failed to improve ${fieldType}:`, error);
      throw error;
    }
  }

  /**
   * Validate form data before enhancement
   * @param {Object} formData - Form data to validate
   * @returns {boolean} True if data is sufficient for enhancement
   */
  isDataSufficientForEnhancement(formData) {
    // Need at least title to provide meaningful enhancement
    if (!formData.title || formData.title.trim().length < 5) {
      return false;
    }

    // For specific field improvements, we need some existing content
    return true;
  }

  /**
   * Get enhancement suggestions based on current data quality
   * @param {Object} formData - Current form data
   * @returns {Array} Array of suggested improvements
   */
  getSuggestedEnhancements(formData) {
    const suggestions = [];

    // Analyze each field for improvement potential
    if (!formData.title || formData.title.length < 20) {
      suggestions.push({
        field: 'title',
        reason: 'Titel kan förbättras för bättre sökbarhet',
        priority: 'high'
      });
    }

    if (!formData.description || formData.description.length < 50) {
      suggestions.push({
        field: 'description',
        reason: 'Beskrivning behöver mer detaljer',
        priority: 'high'
      });
    }

    if (!formData.condition || formData.condition.length < 10) {
      suggestions.push({
        field: 'condition',
        reason: 'Konditionsbeskrivning saknas eller är för kort',
        priority: 'medium'
      });
    }

    if (!formData.keywords || formData.keywords.split(',').length < 3) {
      suggestions.push({
        field: 'keywords',
        reason: 'Fler sökord behövs för bättre synlighet',
        priority: 'low'
      });
    }

    return suggestions;
  }

  /**
   * Calculate enhancement readiness score
   * @param {Object} formData - Current form data
   * @returns {number} Score from 0-100
   */
  calculateEnhancementReadiness(formData) {
    let score = 0;

    // Title quality (30 points)
    if (formData.title) {
      if (formData.title.length > 50) score += 30;
      else if (formData.title.length > 20) score += 20;
      else if (formData.title.length > 10) score += 10;
    }

    // Description quality (30 points)
    if (formData.description) {
      if (formData.description.length > 200) score += 30;
      else if (formData.description.length > 100) score += 20;
      else if (formData.description.length > 50) score += 10;
    }

    // Object type (15 points)
    if (formData.objectType && formData.objectType !== 'Okänd') {
      score += 15;
    }

    // Artist information (15 points)
    if (formData.artist && formData.artist.trim().length > 2) {
      score += 15;
    }

    // Category (10 points)
    if (formData.category && formData.category !== 'Okänd') {
      score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * Clean up resources
   */
  destroy() {
    console.log('🧹 AI Enhancement Engine: Cleaning up...');
    this.pendingRequests.clear();
    this.apiManager = null;
  }
} 