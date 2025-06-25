/**
 * Progressive Analyzer - Main Orchestrator
 * 
 * Coordinates the complete progressive analysis system:
 * - Multi-model processing for optimal speed/quality
 * - 2025 UI design with real-time updates
 * - Integration with existing FreetextParser
 * - Performance optimization and monitoring
 * 
 * Architecture: Follows .cursorrules orchestrator pattern
 * Dependencies: MultiModelProcessor, ProgressiveUIManager, AI Rules System v2.0
 */

import { MultiModelProcessor } from './multi-model-processor.js';
import { ProgressiveUIManager } from './progressive-ui-manager.js';

export class ProgressiveAnalyzer {
  constructor(apiManager, options = {}) {
    this.apiManager = apiManager;
    
    // Configuration options
    this.options = {
      enableProgressiveAnalysis: true,
      enablePerformanceOptimization: true,
      enableRealTimeUpdates: true,
      fallbackToStandardAnalysis: true,
      ...options
    };
    
    // Component instances
    this.multiModelProcessor = null;
    this.uiManager = null;
    
    // State management
    this.state = {
      isAnalyzing: false,
      currentAnalysis: null,
      analysisResults: null,
      performanceMetrics: {
        totalDuration: 0,
        stageTimings: {},
        modelUsage: {},
        userSatisfaction: null
      }
    };
    
    // Event handlers
    this.eventHandlers = new Map();
    
    console.log('[PROGRESSIVE-ANALYZER] Orchestrator initialized');
  }

  /**
   * Initialize the progressive analysis system
   */
  async init() {
    console.log('[PROGRESSIVE-ANALYZER] Initializing progressive analysis system...');
    
    try {
      // Initialize multi-model processor
      this.multiModelProcessor = new MultiModelProcessor(this.apiManager, {
        enableParallelProcessing: true,
        enablePerformanceLogging: true,
        maxConcurrentRequests: 3
      });
      
      // Initialize UI manager
      this.uiManager = new ProgressiveUIManager({
        enableAnimations: true,
        enablePerformanceMetrics: true,
        animationDuration: 250
      });
      
      // Setup event listeners
      this.setupEventListeners();
      
      console.log('[PROGRESSIVE-ANALYZER] System initialized successfully');
      return true;
      
    } catch (error) {
      console.error('[PROGRESSIVE-ANALYZER] Initialization failed:', error);
      
      if (this.options.fallbackToStandardAnalysis) {
        console.log('[PROGRESSIVE-ANALYZER] Falling back to standard analysis');
        return false; // Indicates fallback needed
      }
      
      throw error;
    }
  }

  /**
   * Start progressive analysis with 2025 UI
   */
  async startProgressiveAnalysis(inputData, options = {}) {
    console.log('[PROGRESSIVE-ANALYZER] Starting progressive analysis...');
    
    if (this.state.isAnalyzing) {
      console.warn('[PROGRESSIVE-ANALYZER] Analysis already in progress');
      return;
    }
    
    this.state.isAnalyzing = true;
    this.state.currentAnalysis = Date.now();
    
    try {
      // Create and show 2025 UI
      await this.uiManager.createModal(
        'Progressiv AI-analys',
        'Flerstegssystem med Haiku → 3.5 Sonnet → Claude 4'
      );
      
      // Start progressive analysis with real-time UI updates
      const results = await this.multiModelProcessor.executeProgressiveAnalysis(
        inputData,
        this.handleProgressUpdate.bind(this)
      );
      
      // Store results and show completion
      this.state.analysisResults = results;
      this.state.performanceMetrics = {
        ...this.state.performanceMetrics,
        ...results.performance
      };
      
      await this.uiManager.showCompletionState(results);
      
      console.log('[PROGRESSIVE-ANALYZER] Analysis completed successfully');
      return results;
      
    } catch (error) {
      console.error('[PROGRESSIVE-ANALYZER] Analysis failed:', error);
      
      // Handle error in UI (but don't close modal yet if we're falling back)
      if (!this.options.fallbackToStandardAnalysis) {
        await this.handleAnalysisError(error);
      }
      
      if (this.options.fallbackToStandardAnalysis) {
        console.log('[PROGRESSIVE-ANALYZER] Falling back to standard analysis...');
        // Close progressive UI before fallback
        if (this.uiManager && this.uiManager.currentModal) {
          await this.uiManager.closeModal();
        }
        // Reset processing state for fallback
        this.state.isAnalyzing = false;
        return null; // Signal fallback needed
      }
      
      throw error;
      
    } finally {
      this.state.isAnalyzing = false;
    }
  }

  /**
   * Handle real-time progress updates for UI
   */
  async handleProgressUpdate(stage, result) {
    console.log(`[PROGRESSIVE-ANALYZER] Progress update: ${stage} - ${result.taskType}`);
    
    try {
      // Update stage progress
      if (stage !== this.currentUIStage) {
        await this.uiManager.updateStageProgress(stage, 'active');
        this.currentUIStage = stage;
      }
      
      // Add result card with smooth animation
      await this.uiManager.addResultCard(
        result.taskType,
        result.result,
        stage,
        result.confidence
      );
      
      // Update performance metrics in real-time
      this.updateRealTimeMetrics(stage, result);
      
    } catch (error) {
      console.error('[PROGRESSIVE-ANALYZER] Progress update failed:', error);
    }
  }

  /**
   * Update real-time performance metrics
   */
  updateRealTimeMetrics(stage, result) {
    // Check if UI manager is still available
    if (!this.uiManager || !this.uiManager.currentModal) {
      console.warn('[PROGRESSIVE-ANALYZER] Cannot update metrics - UI manager not available');
      return;
    }
    
    // Calculate current metrics
    const currentTime = Date.now();
    const analysisStartTime = this.state.currentAnalysis;
    const totalDuration = currentTime - analysisStartTime;
    
    // Count completed stages
    const stageNumber = parseInt(stage.replace('stage', ''));
    
    // Estimate average confidence so far
    const averageConfidence = result.confidence || 0.5;
    
    // Update UI metrics
    this.uiManager.updatePerformanceMetrics({
      totalDuration,
      stageCount: stageNumber,
      averageConfidence
    });
  }

  /**
   * Handle analysis errors with user-friendly messaging
   */
  async handleAnalysisError(error) {
    console.error('[PROGRESSIVE-ANALYZER] Handling analysis error:', error);
    
    if (this.uiManager && this.uiManager.state.isVisible) {
      await this.uiManager.closeModal();
    }
    
    console.error('[PROGRESSIVE-ANALYZER] Analysis failed:', error.message);
  }

  /**
   * Fallback to standard analysis if progressive fails
   */
  async fallbackToStandardAnalysis(inputData, options) {
    console.log('[PROGRESSIVE-ANALYZER] Falling back to standard analysis...');
    
    try {
      // Emit event for fallback handling
      const fallbackEvent = new CustomEvent('progressiveAnalysisFallback', {
        detail: { inputData, options }
      });
      
      document.dispatchEvent(fallbackEvent);
      
      return {
        fallback: true,
        results: {},
        performance: {
          totalDuration: 0,
          method: 'fallback'
        }
      };
      
    } catch (fallbackError) {
      console.error('[PROGRESSIVE-ANALYZER] Fallback analysis also failed:', fallbackError);
      throw fallbackError;
    }
  }

  /**
   * Setup event listeners for UI interactions
   */
  setupEventListeners() {
    // Listen for apply button clicks
    document.addEventListener('progressiveAnalysisApply', this.handleApplyResults.bind(this));
    
    // Listen for modal close events
    document.addEventListener('progressiveAnalysisClose', this.handleModalClose.bind(this));
    
    console.log('[PROGRESSIVE-ANALYZER] Event listeners setup');
  }

  /**
   * Handle apply results button click
   */
  async handleApplyResults(event) {
    console.log('[PROGRESSIVE-ANALYZER] Applying results...', event.detail);
    
    try {
      // Emit event for parent component (FreetextParser) to handle
      const applyEvent = new CustomEvent('progressiveAnalysisComplete', {
        detail: {
          results: this.state.analysisResults,
          metrics: this.state.performanceMetrics,
          success: true
        }
      });
      
      document.dispatchEvent(applyEvent);
      
      // Close the modal
      await this.uiManager.closeModal();
      
      console.log('[PROGRESSIVE-ANALYZER] Results applied successfully');
      
    } catch (error) {
      console.error('[PROGRESSIVE-ANALYZER] Failed to apply results:', error);
    }
  }

  /**
   * Handle modal close events
   */
  async handleModalClose(event) {
    console.log('[PROGRESSIVE-ANALYZER] Modal closed');
    
    // Cancel any ongoing analysis
    if (this.state.isAnalyzing) {
      this.state.isAnalyzing = false;
      
      // Emit cancellation event
      const cancelEvent = new CustomEvent('progressiveAnalysisComplete', {
        detail: {
          results: null,
          metrics: this.state.performanceMetrics,
          success: false,
          cancelled: true
        }
      });
      
      document.dispatchEvent(cancelEvent);
    }
    
    // Clean up state
    this.state.currentAnalysis = null;
    this.state.analysisResults = null;
  }

  /**
   * Get current analysis state for debugging
   */
  getAnalysisState() {
    return {
      isAnalyzing: this.state.isAnalyzing,
      currentAnalysis: this.state.currentAnalysis,
      hasResults: !!this.state.analysisResults,
      performanceMetrics: this.state.performanceMetrics,
      processorState: this.multiModelProcessor?.getPerformanceInsights(),
      uiState: this.uiManager?.state
    };
  }

  /**
   * Get performance insights for optimization
   */
  getPerformanceInsights() {
    const insights = {
      orchestrator: this.state.performanceMetrics,
      processor: this.multiModelProcessor?.getPerformanceInsights(),
      recommendations: []
    };
    
    // Add orchestrator-level recommendations
    if (this.state.performanceMetrics.totalDuration > 15000) {
      insights.recommendations.push('Consider optimizing model selection for faster results');
    }
    
    return insights;
  }

  /**
   * Check if progressive analysis is supported
   */
  isSupported() {
    return !!(this.multiModelProcessor && this.uiManager);
  }

  /**
   * Clean up resources
   */
  cleanup() {
    // Remove event listeners
    document.removeEventListener('progressiveAnalysisApply', this.handleApplyResults.bind(this));
    document.removeEventListener('progressiveAnalysisClose', this.handleModalClose.bind(this));
    
    // Clean up components
    if (this.multiModelProcessor) {
      this.multiModelProcessor.destroy();
      this.multiModelProcessor = null;
    }
    
    if (this.uiManager) {
      this.uiManager.destroy();
      this.uiManager = null;
    }
    
    // Clear state
    this.state = {
      isAnalyzing: false,
      currentAnalysis: null,
      analysisResults: null,
      performanceMetrics: {
        totalDuration: 0,
        stageTimings: {},
        modelUsage: {},
        userSatisfaction: null
      }
    };
    
    console.log('[PROGRESSIVE-ANALYZER] Orchestrator cleaned up');
  }

  /**
   * Destroy the analyzer
   */
  destroy() {
    this.cleanup();
  }
} 