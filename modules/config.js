// modules/config.js - Configuration Module
export const CONFIG = {
  // Model Configuration — updated Feb 2026
  MODELS: {
    'sonnet': {
      id: 'claude-sonnet-4-5-20250929', // Claude Sonnet 4.5 — main model ($3/$15 per MTok)
      name: 'Claude Sonnet 4.5',
      cost: 'Standard'
    },
    'haiku': {
      id: 'claude-haiku-4-5-20251015', // Claude Haiku 4.5 — fast/cheap ($1/$5 per MTok)
      name: 'Claude Haiku 4.5',
      cost: 'Budget'
    }
  },

  // Current model — no user selection needed
  CURRENT_MODEL: 'sonnet',

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
    enableHallucinationPrevention: true
  }
};

// Helper functions
export function getCurrentModel() {
  return CONFIG.MODELS[CONFIG.CURRENT_MODEL];
}

export function getModelCost(modelKey = CONFIG.CURRENT_MODEL) {
  return CONFIG.MODELS[modelKey]?.cost || 'Unknown';
} 