// modules/config.js - Configuration Module
export const CONFIG = {
  // Model Configuration
  MODELS: {
    'claude-3-5-sonnet': {
      id: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet',
      cost: 'Low',
      description: 'Cost-effective, good for most cataloging tasks'
    },
    'claude-4-sonnet': {
      id: 'claude-sonnet-4-20250514', 
      name: 'Claude 4 Sonnet',
      cost: 'High',
      description: 'Premium model, best quality but 5x more expensive'
    }
  },

  // Current model selection
  CURRENT_MODEL: 'claude-3-5-sonnet', // Default to cost-effective option

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