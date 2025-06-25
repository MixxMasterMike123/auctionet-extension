/**
 * Multi-Model Processor - Progressive Analysis with Speed Optimization
 * 
 * Handles intelligent model routing for different analysis stages:
 * - Stage 1 (Fast): Haiku for immediate basic identification (1-2s)
 * - Stage 2 (Standard): 3.5 Sonnet for detailed analysis (3-4s)  
 * - Stage 3 (Premium): Claude 4 for expert analysis (6-8s)
 * 
 * Architecture: Follows .cursorrules modular component pattern
 * Dependencies: api-manager.js for model calls
 */

export class MultiModelProcessor {
  constructor(apiManager, options = {}) {
    this.apiManager = apiManager;
    
    // Model configuration for progressive analysis
    this.models = {
      fast: 'claude-3-5-haiku-20241022',      // 0.5-2s - Quick identification
      standard: 'claude-3-5-sonnet-20241022', // 2-4s - Detailed analysis
      premium: 'claude-sonnet-4-20250514'     // 4-8s - Expert analysis (Claude 4)
    };
    
    // Task-to-model mapping for optimal speed/quality balance
    this.taskModelMapping = {
      // STAGE 1: INSTANT FEEDBACK (Haiku - 0.5-2 seconds)
      'quick-object-identification': 'fast',
      'basic-condition-assessment': 'fast',
      'material-detection': 'fast',
      'color-size-estimation': 'fast',
      'preliminary-title': 'fast',
      
      // STAGE 2: DETAILED ANALYSIS (3.5 Sonnet - 2-4 seconds)
      'detailed-description': 'standard',
      'keyword-generation': 'standard',
      'basic-valuation': 'standard',
      'period-identification': 'standard',
      
      // STAGE 3: EXPERT ANALYSIS (Claude 4 - 4-8 seconds)
      'artist-attribution': 'premium',
      'market-analysis': 'premium',
      'expert-valuation': 'premium',
      'historical-context': 'premium',
      'confidence-scoring': 'premium'
    };
    
    // Performance optimization settings
    this.optimizedParams = {
      fast: {
        max_tokens: 400,     // Very short responses for speed
        temperature: 0.3,    // Slightly higher for faster generation
        top_p: 0.9
      },
      standard: {
        max_tokens: 800,     // Moderate responses
        temperature: 0.2,    // Balanced accuracy/speed
        top_p: 0.95
      },
      premium: {
        max_tokens: 1200,    // Detailed but not excessive
        temperature: 0.1,    // High accuracy for expert analysis
        top_p: 1.0
      }
    };
    
    // Configuration options
    this.options = {
      enableParallelProcessing: true,
      enableProgressiveDisclosure: true,
      maxConcurrentRequests: 3,
      enablePerformanceLogging: true,
      ...options
    };
    
    // Performance tracking
    this.performanceMetrics = {
      stageTimings: {},
      modelUsage: {},
      errorRates: {}
    };
  }

  /**
   * Process a single task with optimal model selection
   */
  async processTask(taskType, data, options = {}) {
    const startTime = Date.now();
    const modelType = this.taskModelMapping[taskType] || 'standard';
    const model = this.models[modelType];
    const params = this.optimizedParams[modelType];
    
    console.log(`[MULTI-MODEL] Processing ${taskType} with ${modelType} model (${model})`);
    
    try {
      // Build task-specific prompt
      const prompt = this.buildTaskPrompt(taskType, data);
      
      // Prepare options with images if available
      const apiOptions = {
        ...options,
        images: data.images || []
      };
      
      // Make optimized API call
      const result = await this.callModelAPI(model, prompt, params, apiOptions);
      
      // Track performance
      const duration = Date.now() - startTime;
      this.trackPerformance(taskType, modelType, duration, true);
      
      return {
        taskType,
        modelType,
        result,
        duration,
        confidence: this.calculateTaskConfidence(taskType, result)
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.trackPerformance(taskType, modelType, duration, false);
      
      console.error(`[MULTI-MODEL] Task ${taskType} failed:`, error);
      throw error;
    }
  }

  /**
   * Process multiple tasks in parallel with intelligent batching
   */
  async processStage(stageTasks, onProgress = null) {
    const startTime = Date.now();
    console.log(`[STAGE] Processing ${stageTasks.length} tasks in parallel...`);
    
    // Group tasks by model for efficient batching
    const tasksByModel = this.groupTasksByModel(stageTasks);
    
    // Process all tasks in parallel (within model limits)
    const allPromises = [];
    
    Object.entries(tasksByModel).forEach(([modelType, tasks]) => {
      tasks.forEach(task => {
        const promise = this.processTask(task.type, task.data, task.options)
          .then(result => {
            // Report progress for UI updates
            if (onProgress) {
              onProgress(result);
            }
            return result;
          });
        allPromises.push(promise);
      });
    });
    
    // Wait for all tasks to complete
    const results = await Promise.all(allPromises);
    
    const stageDuration = Date.now() - startTime;
    console.log(`[STAGE] Completed in ${stageDuration}ms`);
    
    // Organize results by task type
    const organizedResults = {};
    results.forEach(result => {
      organizedResults[result.taskType] = result;
    });
    
    return {
      results: organizedResults,
      duration: stageDuration,
      stageMetrics: this.calculateStageMetrics(results)
    };
  }

  /**
   * Execute full progressive analysis with three stages
   */
  async executeProgressiveAnalysis(inputData, progressCallback = null) {
    console.log('[PROGRESSIVE] Starting multi-stage analysis...');
    const fullStartTime = Date.now();
    
    try {
      // STAGE 1: INSTANT FEEDBACK (1-2 seconds)
      console.log('[STAGE 1] Quick identification with Haiku...');
      const stage1Tasks = [
        { type: 'quick-object-identification', data: inputData },
        { type: 'basic-condition-assessment', data: inputData },
        { type: 'material-detection', data: inputData },
        { type: 'preliminary-title', data: inputData }
      ];
      
      const stage1Results = await this.processStage(stage1Tasks, (result) => {
        if (progressCallback) progressCallback('stage1', result);
      });
      
      // Combine stage 1 data for next stages
      const enrichedData = { ...inputData, ...stage1Results.results };
      
      // STAGE 2: DETAILED ANALYSIS (3-4 seconds)
      console.log('[STAGE 2] Detailed analysis with 3.5 Sonnet...');
      const stage2Tasks = [
        { type: 'detailed-description', data: enrichedData },
        { type: 'keyword-generation', data: enrichedData },
        { type: 'basic-valuation', data: enrichedData },
        { type: 'period-identification', data: enrichedData }
      ];
      
      const stage2Results = await this.processStage(stage2Tasks, (result) => {
        if (progressCallback) progressCallback('stage2', result);
      });
      
      // Combine stage 1 + 2 data for final stage
      const detailedData = { ...enrichedData, ...stage2Results.results };
      
      // STAGE 3: EXPERT ANALYSIS (6-8 seconds)
      console.log('[STAGE 3] Expert analysis with Claude 4...');
      const stage3Tasks = [
        { type: 'artist-attribution', data: detailedData },
        { type: 'market-analysis', data: detailedData },
        { type: 'expert-valuation', data: detailedData },
        { type: 'confidence-scoring', data: detailedData }
      ];
      
      const stage3Results = await this.processStage(stage3Tasks, (result) => {
        if (progressCallback) progressCallback('stage3', result);
      });
      
      // Combine all results
      const finalResults = {
        stage1: stage1Results.results,
        stage2: stage2Results.results,
        stage3: stage3Results.results,
        combined: { ...detailedData, ...stage3Results.results },
        performance: {
          totalDuration: Date.now() - fullStartTime,
          stageTimings: {
            stage1: stage1Results.duration,
            stage2: stage2Results.duration,
            stage3: stage3Results.duration
          }
        }
      };
      
      console.log('[PROGRESSIVE] Analysis completed:', finalResults.performance);
      return finalResults;
      
    } catch (error) {
      console.error('[PROGRESSIVE] Analysis failed:', error);
      throw error;
    }
  }

  /**
   * Build task-specific prompts using AI Rules System v2.0
   */
  buildTaskPrompt(taskType, data) {
    // Access AI Rules System v2.0 functions
    const { getSystemPrompt, getCategoryPrompt, buildPrompt } = window;
    
    // Check if we have images or text
    const hasImages = data.images && data.images.length > 0;
    const hasText = data.freetext && data.freetext.trim().length > 0;
    
    // Build proper prompt based on task type and data
    const taskPrompts = {
      'quick-object-identification': this.buildQuickIdentificationPrompt(data, hasImages, hasText),
      'basic-condition-assessment': this.buildConditionPrompt(data, hasImages, hasText),
      'material-detection': this.buildMaterialPrompt(data, hasImages, hasText),
      'preliminary-title': this.buildTitlePrompt(data, hasImages, hasText),
      'detailed-description': this.buildDescriptionPrompt(data, hasImages, hasText),
      'keyword-generation': this.buildKeywordPrompt(data, hasImages, hasText),
      'basic-valuation': this.buildValuationPrompt(data, hasImages, hasText),
      'artist-attribution': this.buildArtistPrompt(data, hasImages, hasText),
      'market-analysis': this.buildMarketPrompt(data, hasImages, hasText),
      'expert-valuation': this.buildExpertValuationPrompt(data, hasImages, hasText)
    };
    
    return taskPrompts[taskType] || this.buildFallbackPrompt(data);
  }

  buildQuickIdentificationPrompt(data, hasImages, hasText) {
    if (hasImages && hasText) {
      return `Identify the main object quickly from these images and text. Give one word answer only.

Text: ${data.freetext}

Analyze the images and text to identify the primary object type.`;
    } else if (hasImages) {
      return `Look at these images and identify the main object. Give one word answer only (e.g., "vas", "stol", "lampa", "skål").`;
    } else if (hasText) {
      return `From this text, identify the main object. Give one word answer only.

Text: ${data.freetext}`;
    }
    return `Unable to identify object - no images or text provided.`;
  }

  buildConditionPrompt(data, hasImages, hasText) {
    const conditionOptions = "Välbevarat, Mindre repor, Nagg vid kanter, Spricka, Lagning";
    
    if (hasImages) {
      return `Assess the condition from the images. Choose ONLY from these options: ${conditionOptions}

Look for: scratches, chips, cracks, repairs, overall wear.
Answer with just the condition term.`;
    } else if (hasText) {
      return `From this description, determine condition. Choose ONLY from: ${conditionOptions}

Text: ${data.freetext}

Answer with just the condition term.`;
    }
    return `Cannot assess condition - no visual or textual information provided.`;
  }

  buildMaterialPrompt(data, hasImages, hasText) {
    if (hasImages) {
      return `Identify the primary material from the images. Give one word only: glas, keramik, metall, trä, textil, porslin, stengods, silver, etc.`;
    } else if (hasText) {
      return `From this text, identify the primary material. One word only: glas, keramik, metall, trä, textil, etc.

Text: ${data.freetext}`;
    }
    return `Cannot identify material - no images or text provided.`;
  }

  buildTitlePrompt(data, hasImages, hasText) {
    // Use AI Rules System for title generation
    const { getSystemPrompt } = window;
    const systemPrompt = getSystemPrompt('freetextParser') || 'Generate Swedish auction title following Auctionet standards.';
    
    let prompt = `${systemPrompt}\n\nCreate a preliminary Swedish auction title. Format: OBJEKT, material, stil/period if applicable.\n\n`;
    
    if (hasText) {
      prompt += `Text: ${data.freetext}\n\n`;
    }
    if (hasImages) {
      prompt += `Analyze the images to determine object type, material, and style.\n\n`;
    }
    
    prompt += `Give ONLY the title, no explanation.`;
    return prompt;
  }

  buildDescriptionPrompt(data, hasImages, hasText) {
    const { getSystemPrompt } = window;
    const systemPrompt = getSystemPrompt('freetextParser') || 'Write detailed Swedish auction descriptions following Auctionet standards.';
    
    let prompt = `${systemPrompt}\n\nWrite a detailed Swedish auction description.\n\n`;
    
    if (hasText) {
      prompt += `Text: ${data.freetext}\n\n`;
    }
    if (hasImages) {
      prompt += `Analyze the images for details about condition, materials, style, and craftsmanship.\n\n`;
    }
    
    return prompt;
  }

  buildKeywordPrompt(data, hasImages, hasText) {
    let prompt = `Generate Swedish auction keywords with hyphens for multi-word phrases (Star-Wars not Star Wars).\n\n`;
    
    if (hasText) {
      prompt += `Text: ${data.freetext}\n\n`;
    }
    if (hasImages) {
      prompt += `Analyze images for relevant keywords.\n\n`;
    }
    
    prompt += `Format: keyword1 keyword2 multi-word-phrase another-keyword\nMax 10-12 keywords.`;
    return prompt;
  }

  buildValuationPrompt(data, hasImages, hasText) {
    let prompt = `Estimate conservative value in SEK for Swedish auction market.\n\n`;
    
    if (hasText) {
      prompt += `Text: ${data.freetext}\n\n`;
    }
    if (hasImages) {
      prompt += `Analyze images for condition and quality indicators.\n\n`;
    }
    
    prompt += `Give estimate range in SEK. Be conservative.`;
    return prompt;
  }

  buildArtistPrompt(data, hasImages, hasText) {
    let prompt = `Identify artist/designer if possible. Focus on Swedish ceramics, glass, and design.\n\n`;
    
    if (hasText) {
      prompt += `Text: ${data.freetext}\n\n`;
    }
    if (hasImages) {
      prompt += `Look for signatures, marks, or stylistic indicators in images.\n\n`;
    }
    
    prompt += `If uncertain, say "Ej identifierad". If identified, give name only.`;
    return prompt;
  }

  buildMarketPrompt(data, hasImages, hasText) {
    let prompt = `Analyze Swedish auction market for this item type.\n\n`;
    
    if (hasText) {
      prompt += `Text: ${data.freetext}\n\n`;
    }
    if (hasImages) {
      prompt += `Analyze images to determine market category.\n\n`;
    }
    
    prompt += `Brief market analysis for Swedish auction platforms.`;
    return prompt;
  }

  buildExpertValuationPrompt(data, hasImages, hasText) {
    let prompt = `Expert valuation with market context and reasoning.\n\n`;
    
    if (hasText) {
      prompt += `Text: ${data.freetext}\n\n`;
    }
    if (hasImages) {
      prompt += `Detailed analysis of images for expert assessment.\n\n`;
    }
    
    prompt += `Provide expert valuation with reasoning in Swedish market context.`;
    return prompt;
  }

  buildFallbackPrompt(data) {
    return `Analyze the provided data and give a brief response: ${JSON.stringify(data).substring(0, 200)}...`;
  }

  /**
   * Make optimized API call with model-specific parameters
   */
  async callModelAPI(model, prompt, params, options = {}) {
    const hasImages = options.images && options.images.length > 0;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Model ${model} timeout after 15 seconds`));
      }, 15000);
      
      // Build message content based on whether we have images
      let messageContent;
      
      if (hasImages) {
        // Vision API call with images
        messageContent = [
          { type: 'text', text: prompt }
        ];
        
        // Add images to content
        options.images.forEach((imageFile, index) => {
          if (imageFile && imageFile.base64) {
            messageContent.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageFile.type || 'image/jpeg',
                data: imageFile.base64
              }
            });
          }
        });
      } else {
        // Text-only API call
        messageContent = prompt;
      }
      
      chrome.runtime.sendMessage({
        type: 'anthropic-fetch',
        apiKey: this.apiManager.apiKey,
        body: {
          model: model,
          max_tokens: params.max_tokens,
          temperature: params.temperature,
          top_p: params.top_p,
          messages: [{
            role: 'user',
            content: messageContent
          }]
        }
      }, (response) => {
        clearTimeout(timeout);
        
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response && response.error) {
          reject(new Error(response.error));
        } else if (response && response.success && response.data && response.data.content && response.data.content[0] && response.data.content[0].text) {
          resolve(response.data.content[0].text.trim());
        } else {
          console.error('[MULTI-MODEL] Unexpected response format:', response);
          reject(new Error(`Unexpected response format for model ${model}`));
        }
      });
    });
  }

  /**
   * Group tasks by model type for efficient batching
   */
  groupTasksByModel(tasks) {
    const grouped = { fast: [], standard: [], premium: [] };
    
    tasks.forEach(task => {
      const modelType = this.taskModelMapping[task.type] || 'standard';
      grouped[modelType].push(task);
    });
    
    return grouped;
  }

  /**
   * Calculate confidence score for task result
   */
  calculateTaskConfidence(taskType, result) {
    // Simple heuristic based on result length and task type
    const baseConfidence = {
      'quick-object-identification': 0.7,
      'basic-condition-assessment': 0.8,
      'material-detection': 0.8,
      'preliminary-title': 0.6,
      'detailed-description': 0.7,
      'keyword-generation': 0.8,
      'basic-valuation': 0.5,
      'artist-attribution': 0.4,
      'market-analysis': 0.6,
      'expert-valuation': 0.7
    };
    
    const base = baseConfidence[taskType] || 0.5;
    const lengthFactor = Math.min(result.length / 50, 1.0); // Longer = more confident
    
    return Math.min(base + (lengthFactor * 0.2), 1.0);
  }

  /**
   * Track performance metrics for optimization
   */
  trackPerformance(taskType, modelType, duration, success) {
    if (!this.performanceMetrics.stageTimings[taskType]) {
      this.performanceMetrics.stageTimings[taskType] = [];
    }
    
    this.performanceMetrics.stageTimings[taskType].push({
      duration,
      success,
      modelType,
      timestamp: Date.now()
    });
    
    // Keep only last 100 measurements
    if (this.performanceMetrics.stageTimings[taskType].length > 100) {
      this.performanceMetrics.stageTimings[taskType].shift();
    }
  }

  /**
   * Calculate stage performance metrics
   */
  calculateStageMetrics(results) {
    const totalTasks = results.length;
    const successfulTasks = results.filter(r => r.result).length;
    const averageDuration = results.reduce((sum, r) => sum + r.duration, 0) / totalTasks;
    const averageConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / totalTasks;
    
    return {
      totalTasks,
      successfulTasks,
      successRate: successfulTasks / totalTasks,
      averageDuration,
      averageConfidence
    };
  }

  /**
   * Get performance insights for optimization
   */
  getPerformanceInsights() {
    return {
      metrics: this.performanceMetrics,
      recommendations: this.generateOptimizationRecommendations()
    };
  }

  /**
   * Generate optimization recommendations based on performance data
   */
  generateOptimizationRecommendations() {
    // Analyze performance patterns and suggest improvements
    const recommendations = [];
    
    // Check for slow tasks
    Object.entries(this.performanceMetrics.stageTimings).forEach(([task, timings]) => {
      const avgDuration = timings.reduce((sum, t) => sum + t.duration, 0) / timings.length;
      if (avgDuration > 5000) { // Slower than 5 seconds
        recommendations.push(`Consider optimizing ${task} - average ${avgDuration}ms`);
      }
    });
    
    return recommendations;
  }

  /**
   * Clean up resources
   */
  destroy() {
    // Clear performance tracking
    this.performanceMetrics = { stageTimings: {}, modelUsage: {}, errorRates: {} };
    console.log('[MULTI-MODEL] Processor destroyed');
  }
} 