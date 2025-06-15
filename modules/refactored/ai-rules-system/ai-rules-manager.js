/**
 * AI Rules Manager - Global Access System
 * 
 * This is the "package.json" equivalent for AI rules - a centralized system
 * that provides automatic access to all AI rules throughout the application.
 * 
 * Features:
 * - Single source of truth for all AI rules
 * - Automatic loading and caching
 * - Global access via singleton pattern
 * - Hot reloading capability
 * - Validation and consistency checks
 * - Performance optimized (loaded once, cached in memory)
 */

class AIRulesManager {
    constructor() {
        this.rules = null;
        this.loaded = false;
        this.configPath = chrome.runtime.getURL('modules/refactored/ai-rules-system/ai-rules-config.json');
        this.cache = new Map();
        this.version = null;
        
        // Auto-load rules on instantiation
        this.loadRules();
    }
    
    /**
     * Load AI rules configuration from JSON file
     */
    async loadRules() {
        try {
            const response = await fetch(this.configPath);
            if (!response.ok) {
                throw new Error(`Failed to load AI rules config: ${response.status}`);
            }
            
            this.rules = await response.json();
            this.version = this.rules.version;
            this.loaded = true;
            
            console.log(`✅ AI Rules System v${this.version} loaded successfully`);
            console.log(`📊 Rules loaded: ${this.getRulesStats()}`);
            
            // Clear cache when rules are reloaded
            this.cache.clear();
            
        } catch (error) {
            console.error('❌ Failed to load AI rules:', error);
            this.loaded = false;
            throw error;
        }
    }
    
    /**
     * Get rules statistics for debugging
     */
    getRulesStats() {
        if (!this.loaded) return 'Not loaded';
        
        const stats = {
            systemPrompts: Object.keys(this.rules.systemPrompts || {}).length,
            categoryRules: Object.keys(this.rules.categoryRules || {}).length,
            fieldRules: Object.keys(this.rules.fieldRules || {}).length,
            validationRules: Object.keys(this.rules.validationRules || {}).length,
            promptTemplates: Object.keys(this.rules.promptTemplates || {}).length
        };
        
        return Object.entries(stats)
            .map(([key, count]) => `${key}: ${count}`)
            .join(', ');
    }
    
    /**
     * Ensure rules are loaded before accessing
     */
    ensureLoaded() {
        if (!this.loaded) {
            throw new Error('AI Rules not loaded. Call loadRules() first.');
        }
    }
    
    // ==================== SYSTEM PROMPTS ====================
    
    /**
     * Get system prompt by type
     * @param {string} type - Prompt type (core, titleCorrect, addItems)
     * @param {string} source - Source file (apiManager, contentJs, addItemsTooltip)
     * @returns {string} System prompt
     */
    getSystemPrompt(type = 'core', source = null) {
        this.ensureLoaded();
        
        const cacheKey = `systemPrompt_${type}_${source}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        let prompt;
        
        // If source is specified, try to get source-specific prompt first
        if (source && this.rules.extractedRules[source]?.systemPrompt) {
            prompt = this.rules.extractedRules[source].systemPrompt;
        } else {
            // Fall back to standard system prompts
            prompt = this.rules.systemPrompts[type];
        }
        
        if (!prompt) {
            console.warn(`⚠️ System prompt '${type}' from '${source}' not found, using 'core'`);
            prompt = this.rules.systemPrompts.core;
        }
        
        this.cache.set(cacheKey, prompt);
        return prompt;
    }
    
    // ==================== CATEGORY RULES ====================
    
    /**
     * Get category-specific rules and prompts
     * @param {string} category - Category identifier
     * @returns {object} Category rules object
     */
    getCategoryRules(category) {
        this.ensureLoaded();
        
        const cacheKey = `categoryRules_${category}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        const rules = this.rules.categoryRules[category];
        if (!rules) {
            console.log(`ℹ️ No specific rules for category '${category}', using defaults`);
            return null;
        }
        
        this.cache.set(cacheKey, rules);
        return rules;
    }
    
    /**
     * Get category-specific prompt addition
     * @param {string} category - Category identifier
     * @returns {string} Category prompt or empty string
     */
    getCategoryPrompt(category) {
        const rules = this.getCategoryRules(category);
        return rules?.prompt || '';
    }
    
    /**
     * Check if category has anti-hallucination rules
     * @param {string} category - Category identifier
     * @returns {boolean} True if anti-hallucination is enabled
     */
    hasAntiHallucinationRules(category) {
        const rules = this.getCategoryRules(category);
        return rules?.antiHallucination === true;
    }
    
    /**
     * Get model-specific valuation rules for a category
     * @param {string} category - Category identifier (e.g., 'freetextParser')
     * @param {string} modelId - Model identifier (e.g., 'claude-4-sonnet')
     * @returns {object} Model-specific valuation rules
     */
    getModelSpecificValuationRules(category, modelId) {
        this.ensureLoaded();
        
        const cacheKey = `valuationRules_${category}_${modelId}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        const categoryRules = this.getCategoryRules(category);
        if (!categoryRules?.valuationRules) {
            console.log(`ℹ️ No valuation rules for category '${category}', using defaults`);
            return { approach: 'conservative', instruction: 'Var konservativ med värderingar' };
        }
        
        // Try to get model-specific rules
        let rules = categoryRules.valuationRules[modelId];
        
        // Fallback to default if model-specific rules not found
        if (!rules) {
            rules = categoryRules.valuationRules.default || {
                approach: 'conservative',
                instruction: 'Var konservativ med värderingar'
            };
            console.log(`ℹ️ No specific valuation rules for model '${modelId}', using default`);
        }
        
        this.cache.set(cacheKey, rules);
        return rules;
    }
    
    // ==================== FIELD RULES ====================
    
    /**
     * Get field-specific rules
     * @param {string} field - Field name (title, description, condition, keywords)
     * @returns {object} Field rules object
     */
    getFieldRules(field) {
        this.ensureLoaded();
        
        const cacheKey = `fieldRules_${field}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        const rules = this.rules.fieldRules[field];
        if (!rules) {
            console.warn(`⚠️ No rules found for field '${field}'`);
            return {};
        }
        
        this.cache.set(cacheKey, rules);
        return rules;
    }
    
    /**
     * Get title formatting rules based on artist context
     * @param {boolean} hasArtist - Whether artist field is filled
     * @returns {object} Title formatting rules
     */
    getTitleRules(hasArtist = false) {
        const fieldRules = this.getFieldRules('title');
        const contextRules = hasArtist ? 
            this.rules.contextRules.artistFieldFilled : 
            this.rules.contextRules.artistFieldEmpty;
            
        return {
            ...fieldRules,
            ...contextRules
        };
    }
    
    // ==================== VALIDATION RULES ====================
    
    /**
     * Get validation rules
     * @returns {object} Validation rules object
     */
    getValidationRules() {
        this.ensureLoaded();
        
        if (this.cache.has('validationRules')) {
            return this.cache.get('validationRules');
        }
        
        const rules = this.rules.validationRules;
        this.cache.set('validationRules', rules);
        return rules;
    }
    
    /**
     * Get list of forbidden words
     * @returns {string[]} Array of forbidden words
     */
    getForbiddenWords() {
        const validation = this.getValidationRules();
        return validation.forbiddenWords || [];
    }
    
    /**
     * Check if word is forbidden
     * @param {string} word - Word to check
     * @returns {boolean} True if word is forbidden
     */
    isForbiddenWord(word) {
        const forbidden = this.getForbiddenWords();
        return forbidden.includes(word.toLowerCase());
    }
    
    // ==================== PROMPT BUILDING ====================
    
    /**
     * Build complete prompt for AI request
     * @param {object} options - Prompt options
     * @param {string} options.type - System prompt type
     * @param {string} options.category - Item category
     * @param {string[]} options.fields - Fields to process
     * @param {object} options.context - Additional context
     * @returns {object} Complete prompt object
     */
    buildPrompt(options = {}) {
        this.ensureLoaded();
        
        const {
            type = 'core',
            category = null,
            fields = ['all'],
            context = {}
        } = options;
        
        // Build system prompt
        let systemPrompt = this.getSystemPrompt(type);
        
        // Add category-specific rules
        if (category) {
            const categoryPrompt = this.getCategoryPrompt(category);
            if (categoryPrompt) {
                systemPrompt += '\n\n' + categoryPrompt;
            }
        }
        
        // Build user prompt based on fields
        let userPrompt = '';
        if (fields.includes('all')) {
            userPrompt = this.rules.promptTemplates.fieldSpecific.all;
        } else {
            const fieldPrompts = fields.map(field => 
                this.rules.promptTemplates.fieldSpecific[field]
            ).filter(Boolean);
            userPrompt = fieldPrompts.join('\n\n');
        }
        
        return {
            systemPrompt,
            userPrompt,
            metadata: {
                type,
                category,
                fields,
                version: this.version,
                timestamp: new Date().toISOString()
            }
        };
    }
    
    // ==================== BRAND CORRECTIONS ====================
    
    /**
     * Get brand corrections mapping
     * @returns {object} Brand corrections object
     */
    getBrandCorrections() {
        this.ensureLoaded();
        
        // Get from extracted brand validation rules first
        const extractedBrandRules = this.rules.extractedRules?.brandValidation?.rules?.brandCorrections;
        if (extractedBrandRules) {
            return extractedBrandRules;
        }
        
        // Fall back to field rules
        const titleRules = this.getFieldRules('title');
        return titleRules.brandCorrections || {};
    }
    
    /**
     * Apply brand corrections to text
     * @param {string} text - Text to correct
     * @returns {string} Corrected text
     */
    applyBrandCorrections(text) {
        const corrections = this.getBrandCorrections();
        let correctedText = text;
        
        Object.entries(corrections).forEach(([incorrect, correct]) => {
            const regex = new RegExp(`\\b${incorrect}\\b`, 'gi');
            correctedText = correctedText.replace(regex, correct);
        });
        
        return correctedText;
    }
    
    // ==================== EXTRACTED RULES ACCESS ====================
    
    /**
     * Get extracted rules from specific source
     * @param {string} source - Source file (apiManager, contentJs, addItemsTooltip, etc.)
     * @returns {object} Extracted rules object
     */
    getExtractedRules(source) {
        this.ensureLoaded();
        
        const cacheKey = `extractedRules_${source}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        const rules = this.rules.extractedRules?.[source];
        if (!rules) {
            console.warn(`⚠️ No extracted rules found for source '${source}'`);
            return null;
        }
        
        this.cache.set(cacheKey, rules);
        return rules;
    }
    
    /**
     * Get quality analyzer validation rules
     * @returns {object} Quality validation rules
     */
    getQualityValidationRules() {
        this.ensureLoaded();
        
        if (this.cache.has('qualityValidationRules')) {
            return this.cache.get('qualityValidationRules');
        }
        
        const rules = this.rules.extractedRules?.qualityAnalyzer?.validationRules;
        if (!rules) {
            console.warn('⚠️ No quality validation rules found');
            return {};
        }
        
        this.cache.set('qualityValidationRules', rules);
        return rules;
    }
    
    /**
     * Check if phrase is forbidden
     * @param {string} phrase - Phrase to check
     * @returns {boolean} True if phrase is forbidden
     */
    isForbiddenPhrase(phrase) {
        const qualityRules = this.getQualityValidationRules();
        const forbiddenPhrases = qualityRules.forbiddenPhrases || [];
        return forbiddenPhrases.some(forbidden => 
            phrase.toLowerCase().includes(forbidden.toLowerCase())
        );
    }
    
    /**
     * Get fuzzy brand matching rules
     * @returns {object} Fuzzy matching configuration
     */
    getFuzzyMatchingRules() {
        this.ensureLoaded();
        
        const brandRules = this.rules.extractedRules?.brandValidation?.rules?.fuzzyMatching;
        return brandRules || { enabled: false, threshold: 0.8, commonMisspellings: {} };
    }
    
    // ==================== UTILITY METHODS ====================
    
    /**
     * Hot reload rules configuration
     */
    async reload() {
        console.log('🔄 Reloading AI rules configuration...');
        this.cache.clear(); // Clear cache to force fresh load
        await this.loadRules();
    }
    
    /**
     * Clear cache for specific model valuation rules
     */
    clearValuationCache(modelId = null) {
        if (modelId) {
            // Clear cache for specific model
            const keysToDelete = [];
            for (const key of this.cache.keys()) {
                if (key.includes('valuationRules') && key.includes(modelId)) {
                    keysToDelete.push(key);
                }
            }
            keysToDelete.forEach(key => this.cache.delete(key));
            console.log(`🗑️ Cleared valuation cache for model: ${modelId}`);
        } else {
            // Clear all valuation cache
            const keysToDelete = [];
            for (const key of this.cache.keys()) {
                if (key.includes('valuationRules')) {
                    keysToDelete.push(key);
                }
            }
            keysToDelete.forEach(key => this.cache.delete(key));
            console.log('🗑️ Cleared all valuation cache');
        }
    }
    
    /**
     * Get current configuration version
     * @returns {string} Version string
     */
    getVersion() {
        return this.version;
    }
    
    /**
     * Validate rules configuration
     * @returns {object} Validation result
     */
    validateConfiguration() {
        this.ensureLoaded();
        
        const errors = [];
        const warnings = [];
        
        // Check required sections
        const requiredSections = ['systemPrompts', 'categoryRules', 'fieldRules', 'validationRules'];
        requiredSections.forEach(section => {
            if (!this.rules[section]) {
                errors.push(`Missing required section: ${section}`);
            }
        });
        
        // Check system prompts
        const requiredPrompts = ['core', 'titleCorrect', 'addItems'];
        requiredPrompts.forEach(prompt => {
            if (!this.rules.systemPrompts?.[prompt]) {
                errors.push(`Missing required system prompt: ${prompt}`);
            }
        });
        
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            version: this.version
        };
    }
    
    /**
     * Export current configuration for debugging
     * @returns {object} Current rules configuration
     */
    exportConfiguration() {
        this.ensureLoaded();
        return JSON.parse(JSON.stringify(this.rules));
    }
}

// ==================== GLOBAL SINGLETON ====================

// Create global singleton instance
let globalAIRulesManager = null;

/**
 * Get global AI Rules Manager instance
 * @returns {AIRulesManager} Global instance
 */
function getAIRulesManager() {
    if (!globalAIRulesManager) {
        globalAIRulesManager = new AIRulesManager();
    }
    return globalAIRulesManager;
}

/**
 * Initialize AI Rules System globally
 * Call this once at application startup
 */
async function initializeAIRulesSystem() {
    try {
        const manager = getAIRulesManager();
        await manager.loadRules();
        
        // Validate configuration
        const validation = manager.validateConfiguration();
        if (!validation.valid) {
            console.error('❌ AI Rules configuration validation failed:', validation.errors);
            throw new Error('Invalid AI rules configuration');
        }
        
        console.log('✅ AI Rules System initialized successfully');
        return manager;
        
    } catch (error) {
        console.error('❌ Failed to initialize AI Rules System:', error);
        throw error;
    }
}

// ==================== CONVENIENCE FUNCTIONS ====================

/**
 * Quick access functions for common operations
 * These provide the "auto-import" experience
 */

// System prompts
const getSystemPrompt = (type, source) => getAIRulesManager().getSystemPrompt(type, source);
const getCorePrompt = () => getSystemPrompt('core');
const getTitleCorrectPrompt = () => getSystemPrompt('titleCorrect');
const getAddItemsPrompt = () => getSystemPrompt('addItems');

// Category rules
const getCategoryRules = (category) => getAIRulesManager().getCategoryRules(category);
const getCategoryPrompt = (category) => getAIRulesManager().getCategoryPrompt(category);
const hasAntiHallucination = (category) => getAIRulesManager().hasAntiHallucinationRules(category);
const getModelSpecificValuationRules = (category, modelId) => getAIRulesManager().getModelSpecificValuationRules(category, modelId);

// Field rules
const getFieldRules = (field) => getAIRulesManager().getFieldRules(field);
const getTitleRules = (hasArtist) => getAIRulesManager().getTitleRules(hasArtist);

// Validation
const getForbiddenWords = () => getAIRulesManager().getForbiddenWords();
const isForbiddenWord = (word) => getAIRulesManager().isForbiddenWord(word);
const isForbiddenPhrase = (phrase) => getAIRulesManager().isForbiddenPhrase(phrase);
const applyBrandCorrections = (text) => getAIRulesManager().applyBrandCorrections(text);

// Extracted rules access
const getExtractedRules = (source) => getAIRulesManager().getExtractedRules(source);
const getQualityValidationRules = () => getAIRulesManager().getQualityValidationRules();
const getFuzzyMatchingRules = () => getAIRulesManager().getFuzzyMatchingRules();

// Prompt building
const buildPrompt = (options) => getAIRulesManager().buildPrompt(options);

// Cache management
const clearValuationCache = (modelId) => getAIRulesManager().clearValuationCache(modelId);
const reloadAIRules = () => getAIRulesManager().reload();

// Export everything for module usage
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = {
        AIRulesManager,
        getAIRulesManager,
        initializeAIRulesSystem,
        // Convenience functions
        getSystemPrompt,
        getCorePrompt,
        getTitleCorrectPrompt,
        getAddItemsPrompt,
        getCategoryRules,
        getCategoryPrompt,
        hasAntiHallucination,
        getModelSpecificValuationRules,
        getFieldRules,
        getTitleRules,
        getForbiddenWords,
        isForbiddenWord,
        isForbiddenPhrase,
        applyBrandCorrections,
        getExtractedRules,
        getQualityValidationRules,
        getFuzzyMatchingRules,
        buildPrompt
    };
} else {
    // Browser environment - attach to window for global access
    window.AIRulesManager = AIRulesManager;
    window.getAIRulesManager = getAIRulesManager;
    window.initializeAIRulesSystem = initializeAIRulesSystem;
    
    // Convenience functions available globally
    window.getSystemPrompt = getSystemPrompt;
    window.getCorePrompt = getCorePrompt;
    window.getTitleCorrectPrompt = getTitleCorrectPrompt;
    window.getAddItemsPrompt = getAddItemsPrompt;
    window.getCategoryRules = getCategoryRules;
    window.getCategoryPrompt = getCategoryPrompt;
    window.hasAntiHallucination = hasAntiHallucination;
    window.getModelSpecificValuationRules = getModelSpecificValuationRules;
    window.getFieldRules = getFieldRules;
    window.getTitleRules = getTitleRules;
    window.getForbiddenWords = getForbiddenWords;
    window.isForbiddenWord = isForbiddenWord;
    window.isForbiddenPhrase = isForbiddenPhrase;
    window.applyBrandCorrections = applyBrandCorrections;
    window.getExtractedRules = getExtractedRules;
    window.getQualityValidationRules = getQualityValidationRules;
    window.getFuzzyMatchingRules = getFuzzyMatchingRules;
    window.buildPrompt = buildPrompt;
    window.clearValuationCache = clearValuationCache;
    window.reloadAIRules = reloadAIRules;
} 