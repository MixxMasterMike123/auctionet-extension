/**
 * AI Rules Wrapper - Compatibility Layer
 * 
 * Provides the same interface as the original ai-search-rules.js
 * but uses the new AIRulesEngine internally for seamless transition.
 * 
 * This allows existing code to work without changes while benefiting
 * from the improved, modular architecture.
 */

import { AIRulesEngine } from './ai-rules-engine.js';

// Global instance for backward compatibility
let globalRulesEngine = null;

/**
 * Initialize the global rules engine (backward compatibility)
 * @param {Object} apiManager - API manager instance
 */
export function initializeAIRules(apiManager = null) {
  globalRulesEngine = new AIRulesEngine(apiManager);
  return globalRulesEngine;
}

/**
 * Get or create the global rules engine
 * @param {Object} apiManager - API manager instance
 * @returns {AIRulesEngine}
 */
function getRulesEngine(apiManager = null) {
  if (!globalRulesEngine) {
    globalRulesEngine = new AIRulesEngine(apiManager);
  }
  return globalRulesEngine;
}

/**
 * Original applySearchRules function - now uses AIRulesEngine
 * @param {Object} inputData - Input data for term extraction
 * @returns {Promise<Object>} Search terms result
 */
export async function applySearchRules(inputData) {
  // Get apiManager from global scope if available (browser) or pass null (Node.js)
  const apiManager = (typeof window !== 'undefined' && window.apiManager) ? window.apiManager : null;
  const engine = getRulesEngine(apiManager);
  
  try {
    const result = await engine.applyRules(inputData);
    
    // Transform result to match original interface
    return {
      success: result.success,
      searchTerms: result.searchTerms,
      preSelectedTerms: result.preSelectedTerms,
      candidateTerms: result.candidateTerms,
      allTerms: result.allTerms,
      query: result.query,
      reasoning: result.reasoning,
      confidence: result.confidence,
      source: result.source,
      appliedRules: result.appliedRules,
      totalTerms: result.totalTerms,
      selectionStrategy: result.metadata?.selectionStrategy
    };
    
  } catch (error) {
    console.error('AI Rules wrapper error:', error);
    
    // Fallback to basic extraction
    const basicTerms = inputData.title ? inputData.title.split(' ').slice(0, 3) : [];
    return {
      success: true,
      searchTerms: basicTerms,
      preSelectedTerms: basicTerms,
      candidateTerms: [],
      allTerms: basicTerms,
      query: basicTerms.join(' '),
      reasoning: 'Fallback due to wrapper error',
      confidence: 0.3,
      source: 'wrapper_fallback',
      appliedRules: ['fallback'],
      totalTerms: basicTerms.length
    };
  }
}

/**
 * Original updateRule function - now uses AIRulesEngine
 * @param {string} ruleCategory - Rule category to update
 * @param {Object} updates - Updates to apply
 */
export function updateRule(ruleCategory, updates) {
  const engine = getRulesEngine();
  engine.updateRules(ruleCategory, updates);
}

/**
 * Original getCurrentRules function - now uses AIRulesEngine
 * @returns {Object} Current rules configuration
 */
export function getCurrentRules() {
  const engine = getRulesEngine();
  return engine.getRules();
}

/**
 * Export the original AI_SEARCH_RULES constant for backward compatibility
 * This is now dynamically generated from the AIRulesEngine
 */
export const AI_SEARCH_RULES = {
  get artistField() {
    return getRulesEngine().getRules().artistField;
  },
  get brandRecognition() {
    return getRulesEngine().getRules().brandRecognition;
  },
  get objectType() {
    return getRulesEngine().getRules().objectType;
  },
  get modelNumbers() {
    return getRulesEngine().getRules().modelNumbers;
  },
  get materials() {
    return getRulesEngine().getRules().materials;
  },
  get queryConstruction() {
    return getRulesEngine().getRules().queryConstruction;
  },
  get contextRules() {
    // Legacy context rules - maintained for compatibility
    return {
      artistFieldFilled: {
        rule: "Artist field takes precedence over AI-detected artists",
        implementation: "Use artist field content as primary search term",
        reasoning: "Manual curation beats AI detection"
      },
      royalCopenhagen: {
        rule: "For Royal Copenhagen, artist + product type is optimal",
        implementation: "Combine designer name with object type",
        example: "Niels Thorsson fat or Royal Copenhagen Niels Thorsson"
      },
      watches: {
        rule: "Brand + model is more important than generic 'watch' term",
        implementation: "Prioritize 'Omega Speedmaster' over 'Omega klocka'"
      },
      synthesizers: {
        rule: "Brand + model number is critical for electronic instruments",
        implementation: "Yamaha DX7 is much more specific than just 'Yamaha synthesizer'"
      }
    };
  }
};

/**
 * Additional utility functions for enhanced functionality
 */

/**
 * Get statistics from the AI Rules Engine
 * @returns {Object} Usage statistics
 */
export function getAIRulesStatistics() {
  const engine = getRulesEngine();
  return engine.getStatistics();
}

/**
 * Clear the AI Rules cache
 */
export function clearAIRulesCache() {
  const engine = getRulesEngine();
  engine.clearCache();
}

/**
 * Create a new AIRulesEngine instance (for advanced usage)
 * @param {Object} apiManager - API manager instance
 * @returns {AIRulesEngine} New engine instance
 */
export function createAIRulesEngine(apiManager = null) {
  return new AIRulesEngine(apiManager);
}

/**
 * Get the global AIRulesEngine instance (for advanced usage)
 * @returns {AIRulesEngine} Global engine instance
 */
export function getAIRulesEngine() {
  return getRulesEngine();
}

// Export the AIRulesEngine class for direct usage
export { AIRulesEngine };

export default {
  applySearchRules,
  updateRule,
  getCurrentRules,
  AI_SEARCH_RULES,
  getAIRulesStatistics,
  clearAIRulesCache,
  createAIRulesEngine,
  getAIRulesEngine,
  AIRulesEngine,
  initializeAIRules
}; 