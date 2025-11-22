// modules/config.js - Configuration Module
export const CONFIG = {
  // Model Configuration
  // Model Configuration
  MODELS: {
    'claude-4-sonnet': {
      id: 'claude-sonnet-4-20250514', // Latest Claude 4 Sonnet model
      name: 'Claude 4 Sonnet',
      cost: 'Standard',
      description: 'Latest model, best quality at same price as previous 3.5'
    },
    'claude-3-5-haiku': {
      id: 'claude-3-5-haiku-20241022', // Fast model for simple tasks
      name: 'Claude 3.5 Haiku',
      cost: 'Budget',
      description: 'Fast and cost-effective for simple tasks like biographies'
    },
    'claude-3-5-sonnet': {
      id: 'claude-3-5-sonnet-20241022', // Deprecated - will be removed
      name: 'Claude 3.5 Sonnet (Deprecated)',
      cost: 'Deprecated',
      description: 'DEPRECATED: Will stop working October 22, 2025'
    }
  },

  // Current model selection
  CURRENT_MODEL: 'claude-4-sonnet', // Default to latest supported model

  // API Configuration
  API: {
    maxTokens: 1500,
    temperature: 0.1,
    retryAttempts: 3
  },

  // Quality thresholds
  QUALITY: {
    minScoreForImprovement: 30,
    sparseDataThreshold: 40,
    criticalQualityThreshold: 20
  },

  // Feature flags
  FEATURES: {
    enableQualityValidation: true,
    enableHallucinationPrevention: true,
    enableModelSwitching: true,
    enableCostTracking: false // Future feature
  }
};

// Helper functions
export function getCurrentModel() {
  return CONFIG.MODELS[CONFIG.CURRENT_MODEL];
}

// Get the latest supported model ID (for backward compatibility)
export function getLatestModelId() {
  return CONFIG.MODELS['claude-4-sonnet'].id;
}

export function setModel(modelKey) {
  if (CONFIG.MODELS[modelKey]) {
    CONFIG.CURRENT_MODEL = modelKey;
    console.log(`Switched to model: ${CONFIG.MODELS[modelKey].name}`);
    return true;
  }
  console.error(`Unknown model: ${modelKey}`);
  return false;
}

export function getModelCost(modelKey = CONFIG.CURRENT_MODEL) {
  return CONFIG.MODELS[modelKey]?.cost || 'Unknown';
}

export function getAllModels() {
  return Object.entries(CONFIG.MODELS).map(([key, model]) => ({
    key,
    ...model
  }));
} 