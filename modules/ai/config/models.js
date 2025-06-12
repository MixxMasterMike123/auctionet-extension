// modules/ai/config/models.js
// Centralized AI Model Configuration

export const AI_MODELS = {
  'claude-3-5-sonnet': {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    description: 'Most capable model for complex reasoning',
    maxTokens: 4000,
    temperature: 0.3
  },
  'claude-4-sonnet': {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude 4 Sonnet',
    description: 'Latest model with enhanced capabilities',
    maxTokens: 4000,
    temperature: 0.3
  },
  'claude-3-haiku': {
    id: 'claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
    description: 'Fast model for simple tasks',
    maxTokens: 1000,
    temperature: 0.1
  }
};

export const DEFAULT_MODEL = 'claude-3-5-sonnet';

/**
 * Field-specific model selection rules
 */
export const FIELD_MODEL_RULES = {
  'title-correct': {
    model: 'claude-3-haiku',
    reason: 'Fast and literal for simple corrections',
    maxTokens: 500,
    temperature: 0.1
  },
  'artist-detection': {
    model: 'claude-3-haiku',
    reason: 'Fast and consistent for pattern recognition',
    maxTokens: 300,
    temperature: 0.1
  },
  'artist-verification': {
    model: 'claude-3-haiku',
    reason: 'Fast for biographical lookups',
    maxTokens: 400,
    temperature: 0.1
  },
  'field-enhancement': {
    model: 'user-selected',
    reason: 'Use user preference for complex enhancements',
    maxTokens: 4000,
    temperature: 0.3
  },
  'market-analysis': {
    model: 'user-selected',
    reason: 'Use user preference for complex analysis',
    maxTokens: 1000,
    temperature: 0.1
  }
};

/**
 * Get model configuration for a specific field type
 * @param {string} fieldType - The field type being processed
 * @param {string} userSelectedModel - User's preferred model
 * @returns {Object} Model configuration
 */
export function getModelForField(fieldType, userSelectedModel = DEFAULT_MODEL) {
  const rule = FIELD_MODEL_RULES[fieldType];
  
  if (!rule) {
    // Default to user-selected model for unknown field types
    return {
      ...AI_MODELS[userSelectedModel] || AI_MODELS[DEFAULT_MODEL],
      source: 'user-default'
    };
  }
  
  if (rule.model === 'user-selected') {
    return {
      ...AI_MODELS[userSelectedModel] || AI_MODELS[DEFAULT_MODEL],
      ...rule,
      source: 'user-preference'
    };
  }
  
  // Use specific model for this field type
  const modelKey = Object.keys(AI_MODELS).find(key => 
    AI_MODELS[key].id === rule.model || key.includes(rule.model)
  );
  
  return {
    ...AI_MODELS[modelKey] || AI_MODELS[DEFAULT_MODEL],
    ...rule,
    source: 'field-specific'
  };
}

/**
 * Validate that a model exists
 * @param {string} modelKey - Model key to validate
 * @returns {boolean} True if model exists
 */
export function isValidModel(modelKey) {
  return modelKey in AI_MODELS;
}

/**
 * Get all available models
 * @returns {Object} All available models
 */
export function getAllModels() {
  return AI_MODELS;
} 