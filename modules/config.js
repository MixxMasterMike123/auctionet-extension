// modules/config.js - Configuration Module
export const CONFIG = {
  // Model Configuration — updated Feb 2026
  MODELS: {
    'sonnet': {
      id: 'claude-sonnet-5-5', // Claude Sonnet 5.5 ($2/$10 per MTok) — background.js strips temperature and sends thinking:between_tools (thinking off)
      name: 'Claude Sonnet 5.5',
      cost: 'Standard'
    },
    'haiku': {
      id: 'claude-haiku-5-5', // Claude Haiku 5.5 — fast/cheap ($0.10/$0.50 per MTok ≤100k prompt); background.js strips temperature and disables thinking
      name: 'Claude Haiku 5.5',
      cost: 'Budget'
    }
  },

  // Current model — no user selection needed
  CURRENT_MODEL: 'sonnet',

  // URLs
  URLS: {
    ANTHROPIC_API: 'https://api.anthropic.com/v1/messages',
    AUCTIONET_BASE: 'https://auctionet.com',
    AUCTIONET_API: 'https://auctionet.com/api/v2/items.json',
    AUCTIONET_SEARCH: 'https://auctionet.com/sv/search',
    AUCTIONET_ARTISTS: 'https://auctionet.com/sv/artists',
    AUCTIONET_WILDCARD: 'https://auctionet.com/*'
  },

  // API Configuration
  API: {
    maxTokens: 1500,
    temperature: 0.15,
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