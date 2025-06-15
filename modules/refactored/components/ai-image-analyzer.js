/**
 * AI Image Analyzer Component
 * Analyzes auction item images using Claude Vision API
 * 
 * Features:
 * - Image upload and validation
 * - AI-powered image analysis using Claude Vision
 * - "Sure Score" confidence calculation
 * - Integration with existing market analysis
 * - Reusable across different pages
 * 
 * Architecture: Modular component following .cursorrules
 * Dependencies: AI Rules System v2.0, Chrome runtime messaging
 */

// Import AI Rules System v2.0 functions (global access)
const { 
  getSystemPrompt, 
  getCategoryPrompt, 
  buildPrompt,
  getCategoryRules,
  getFieldRules,
  getForbiddenWords,
  isForbiddenWord
} = window;

export class AIImageAnalyzer {
  constructor(apiManager, options = {}) {
    // Handle both direct APIManager and APIBridge patterns (same as FreetextParser)
    if (apiManager && typeof apiManager.getAPIManager === 'function') {
      this.apiManager = apiManager.getAPIManager();
      console.log('✅ AIImageAnalyzer: Using APIManager from APIBridge');
    } else {
      this.apiManager = apiManager;
      console.log('✅ AIImageAnalyzer: Using direct APIManager');
    }
    
    // Configuration
    this.config = {
      supportedFormats: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxImageDimensions: { width: 4096, height: 4096 },
      enableMarketValidation: true,
      confidenceThreshold: 0.6,
      ...options
    };
    
    // State
    this.currentImage = null;
    this.analysisResult = null;
    this.isProcessing = false;
    
    console.log('✅ AIImageAnalyzer: Initialized with config:', this.config);
  }

  /**
   * Validate uploaded image file
   */
  validateImageFile(file) {
    const errors = [];
    
    // Check file type
    if (!this.config.supportedFormats.includes(file.type)) {
      errors.push(`Filformat ${file.type} stöds inte. Använd: ${this.config.supportedFormats.join(', ')}`);
    }
    
    // Check file size
    if (file.size > this.config.maxFileSize) {
      const maxSizeMB = Math.round(this.config.maxFileSize / (1024 * 1024));
      const fileSizeMB = Math.round(file.size / (1024 * 1024));
      errors.push(`Filen är för stor (${fileSizeMB}MB). Max storlek: ${maxSizeMB}MB`);
    }
    
    // Check if it's actually an image
    if (!file.type.startsWith('image/')) {
      errors.push('Filen verkar inte vara en bild');
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Convert image file to base64
   */
  async convertToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = () => {
        try {
          // Remove data URL prefix to get pure base64
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        } catch (error) {
          reject(new Error('Kunde inte konvertera bild till base64'));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Kunde inte läsa bildfilen'));
      };
      
      reader.readAsDataURL(file);
    });
  }

  /**
   * Analyze image using Claude Vision API
   */
  async analyzeImage(imageFile, additionalContext = '') {
    console.log('🔍 Starting image analysis:', {
      fileName: imageFile.name,
      fileSize: imageFile.size,
      fileType: imageFile.type,
      hasContext: !!additionalContext
    });

    // Validate image first
    const validation = this.validateImageFile(imageFile);
    if (!validation.isValid) {
      throw new Error(validation.errors.join('. '));
    }

    if (!this.apiManager.apiKey) {
      throw new Error('API key not configured. Please set your Anthropic API key.');
    }

    try {
      this.isProcessing = true;
      
      // Convert image to base64
      const base64Image = await this.convertToBase64(imageFile);
      console.log('✅ Image converted to base64, length:', base64Image.length);
      
      // Get AI Rules System v2.0 prompts for image analysis
      const systemPrompt = this.getImageAnalysisSystemPrompt();
      const userPrompt = this.buildImageAnalysisPrompt(additionalContext);
      
      console.log('🤖 Calling Claude Vision API...');
      
      // Debug the request being sent
      const requestBody = {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        temperature: 0.1,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageFile.type,
                data: base64Image
              }
            },
            {
              type: 'text',
              text: userPrompt
            }
          ]
        }]
      };
      
      console.log('📤 Sending request to Claude Vision API:', {
        model: requestBody.model,
        max_tokens: requestBody.max_tokens,
        temperature: requestBody.temperature,
        systemPromptLength: systemPrompt.length,
        userPromptLength: userPrompt.length,
        imageType: imageFile.type,
        imageSize: imageFile.size,
        base64Length: base64Image.length,
        hasApiKey: !!this.apiManager.apiKey,
        apiKeyLength: this.apiManager.apiKey?.length
      });
      
      // Call Claude Vision API using Chrome runtime messaging
      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Image analysis timeout after 45 seconds'));
        }, 45000); // Longer timeout for image processing
        
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiManager.apiKey,
          body: requestBody
        }, (response) => {
          clearTimeout(timeout);
          console.log('📥 Chrome runtime response for image analysis:', response);
          
          if (chrome.runtime.lastError) {
            console.error('❌ Chrome runtime error:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.success) {
            console.log('✅ Image analysis API call successful');
            resolve(response);
          } else {
            console.error('❌ Image analysis API call failed:', {
              hasResponse: !!response,
              success: response?.success,
              error: response?.error,
              data: response?.data,
              fullResponse: response
            });
            reject(new Error(response?.error || 'Image analysis failed - no valid response'));
          }
        });
      });

      if (response.success && response.data?.content?.[0]?.text) {
        const analysisText = response.data.content[0].text;
        console.log('✅ Image analysis completed');
        
        // Parse and validate the response
        const analysisResult = this.parseImageAnalysisResponse(analysisText);
        
        // Store current image and result
        this.currentImage = {
          file: imageFile,
          base64: base64Image,
          name: imageFile.name,
          size: imageFile.size,
          type: imageFile.type
        };
        this.analysisResult = analysisResult;
        
        return analysisResult;
      } else {
        throw new Error('Invalid response from Claude Vision API');
      }

    } catch (error) {
      console.error('❌ Image analysis failed:', error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get system prompt for image analysis using AI Rules System v2.0
   */
  getImageAnalysisSystemPrompt() {
    // Use AI Rules System v2.0 for consistent Swedish auction expertise
    if (typeof getSystemPrompt === 'function') {
      // Try freetextParser prompt first (has Swedish expert knowledge)
      const freetextPrompt = getSystemPrompt('freetextParser');
      if (freetextPrompt) {
        console.log('✅ Using AI Rules System v2.0 freetextParser prompt for image analysis');
        return freetextPrompt + '\n\nSPECIAL BILDANALYS TILLÄGG:\n• Analysera endast vad som är synligt i bilden\n• Identifiera märken, signaturer, stämplar\n• Bedöm kondition från visuella tecken\n• Ge konfidenspoäng för varje observation (0.0-1.0)';
      }
      
      // Fallback to core prompt
      const corePrompt = getSystemPrompt('core');
      if (corePrompt) {
        console.log('✅ Using AI Rules System v2.0 core prompt for image analysis');
        return corePrompt + '\n\nBILDANALYS TILLÄGG:\n• Analysera bilder av auktionsföremål\n• Identifiera objekttyp, material, stil från visuella detaljer\n• Bedöm kondition från synliga tecken\n• Var konservativ med attribueringar';
      }
    }
    
    // Fallback system prompt for image analysis
    console.log('⚠️ Using fallback system prompt for image analysis');
    return `Du är en ERFAREN SVENSK AUKTIONSEXPERT med djup kunskap om svenska konstnärer, formgivare och märken. Du har arbetat på svenska auktionshus i årtionden och känner alla viktiga namn inom svensk design och konst.

🎯 DIN EXPERTIS INKLUDERAR:
• Svenska keramiker: Lisa Larson (Gustavsberg), Stig Lindberg, Carl-Harry Stålhane
• Svenska glasbruk: Orrefors, Kosta Boda, Reijmyre
• Svenska porslinsfabriker: Gustavsberg, Rörstrand, Upsala Ekeby (inte Uppsala!)
• Skandinaviska formgivare: Arne Jacobsen, Finn Juhl, Hans Wegner
• Svenska möbeldesigners: Bruno Mathsson, Carl Malmsten, Alvar Aalto

🚨 KRITISK EXPERTKUNSKAP - RÄTTA AUTOMATISKT:
• "Lisa Larsson" → "Lisa Larson" (världsberömd svensk keramiker)
• "Uppsala Ekeby" → "Upsala Ekeby" (korrekt stavning av märket)
• "Stig Lindberg" (inte Lindeberg eller Lindburg)

BILDANALYS UPPGIFT: Analysera bilder med din svenska auktionsexpertis och identifiera föremål, konstnärer, märken och kondition.`;
  }

  /**
   * Build user prompt for image analysis
   */
  buildImageAnalysisPrompt(additionalContext = '') {
    const contextSection = additionalContext ? 
      `\nTILLÄGGSKONTEXT från användaren:\n"${additionalContext}"\n` : '';

    return `Analysera denna bild av ett auktionsföremål och extrahera strukturerad data:
${contextSection}
🎯 KRITISKA TITEL-FORMATERINGSREGLER (AI Rules System v2.0):
• TITEL ska börja med FÖREMÅL (Figurin, Vas, Karaff, etc.)
• Om konstnär/formgivare identifieras: PLACERA i artist-fält, EXKLUDERA från titel
• VERSALER första ordet om INGEN konstnär i artist-fält: "ARMBANDSUR, stål, Rolex"
• Vanlig stor bokstav om konstnär FINNS i artist-fält: "Figurin, stengods, Gustavsberg"
• Format: [Föremål], [Material], [Märke/Stil], [Period]
• Bevara citattecken runt modellnamn: "Viktoria", "Prince"
• Max 60 tecken

BILDANALYS UPPGIFTER:
1. Identifiera objekttyp och huvudmaterial
2. Bedöm kondition och synliga skador
3. Leta efter signaturer, märken, stämplar
4. Uppskatta stil, period och ursprung
5. Föreslå söktermer för marknadsanalys

Returnera data i exakt detta JSON-format:
{
  "title": "Föremål först, utan konstnär om artist-fält fylls (max 60 tecken)",
  "description": "Detaljerad beskrivning baserad på visuella detaljer",
  "condition": "Konditionsbedömning baserad på synligt skick",
  "artist": "Konstnär/formgivare om identifierad från signatur/stil, annars null",
  "keywords": "relevanta sökord för marknadsanalys separerade med mellanslag",
  "estimate": 500,
  "reserve": 300,
  "materials": "huvudmaterial identifierat från bilden",
  "period": "uppskattad tidsperiod baserad på stil",
  "visualObservations": {
    "objectType": "identifierat objekttyp",
    "primaryMaterial": "huvudmaterial",
    "colorScheme": "färgschema/dekor",
    "condition": "konditionsbedömning",
    "markings": "synliga märken/signaturer",
    "dimensions": "uppskattade proportioner",
    "style": "identifierad stil/period"
  },
  "confidence": {
    "objectIdentification": 0.9,
    "materialAssessment": 0.8,
    "conditionAssessment": 0.7,
    "artistAttribution": 0.6,
    "periodEstimation": 0.5,
    "estimate": 0.4
  },
  "reasoning": "Förklaring av bildanalysen och grunden för bedömningarna",
  "imageQuality": {
    "clarity": 0.8,
    "lighting": 0.9,
    "angle": 0.7,
    "completeness": 0.8
  }
}

INSTRUKTIONER:
- Basera alla bedömningar endast på vad som är synligt i bilden
- estimate/reserve ska vara numeriska värden i SEK baserat på visuell bedömning
- Använd konfidenspoäng för att markera osäkerhet
- Lämna fält som null om information inte kan bestämmas från bilden
- Var extra försiktig med konstnärsattribueringar - kräver tydliga signaturer
- Var konservativ med värderingar baserat på synligt skick och stil
- Bedöm bildkvalitet för att påverka slutlig "sure score"`;
  }

  /**
   * Parse image analysis response
   */
  parseImageAnalysisResponse(response) {
    try {
      console.log('🔍 Parsing image analysis response...');
      
      // Clean and extract JSON
      let cleanResponse = response.trim();
      cleanResponse = cleanResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      if (cleanResponse.includes('{') && cleanResponse.includes('}')) {
        const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsedData = JSON.parse(jsonMatch[0]);
          return this.validateAndNormalizeImageAnalysis(parsedData);
        }
      }
      
      throw new Error('Could not find valid JSON in response');
    } catch (error) {
      console.error('❌ Failed to parse image analysis response:', error);
      throw new Error('AI bildanalys kunde inte tolkas. Bilden kanske inte är tydlig nog.');
    }
  }

  /**
   * Validate and normalize image analysis data
   */
  validateAndNormalizeImageAnalysis(data) {
    const normalized = {
      title: data.title || '',
      description: data.description || '',
      condition: data.condition || '',
      artist: data.artist || null,
      keywords: data.keywords || '',
      estimate: this.parseNumericValue(data.estimate),
      reserve: this.parseNumericValue(data.reserve),
      materials: data.materials || '',
      period: data.period || '',
      visualObservations: {
        objectType: data.visualObservations?.objectType || '',
        primaryMaterial: data.visualObservations?.primaryMaterial || '',
        colorScheme: data.visualObservations?.colorScheme || '',
        condition: data.visualObservations?.condition || '',
        markings: data.visualObservations?.markings || '',
        dimensions: data.visualObservations?.dimensions || '',
        style: data.visualObservations?.style || ''
      },
      confidence: {
        objectIdentification: this.normalizeConfidence(data.confidence?.objectIdentification),
        materialAssessment: this.normalizeConfidence(data.confidence?.materialAssessment),
        conditionAssessment: this.normalizeConfidence(data.confidence?.conditionAssessment),
        artistAttribution: this.normalizeConfidence(data.confidence?.artistAttribution),
        periodEstimation: this.normalizeConfidence(data.confidence?.periodEstimation),
        estimate: this.normalizeConfidence(data.confidence?.estimate)
      },
      imageQuality: {
        clarity: this.normalizeConfidence(data.imageQuality?.clarity),
        lighting: this.normalizeConfidence(data.imageQuality?.lighting),
        angle: this.normalizeConfidence(data.imageQuality?.angle),
        completeness: this.normalizeConfidence(data.imageQuality?.completeness)
      },
      reasoning: data.reasoning || '',
      analysisType: 'image',
      timestamp: Date.now()
    };

    console.log('✅ Normalized image analysis:', normalized);
    return normalized;
  }

  /**
   * Calculate "Sure Score" - composite confidence metric
   */
  calculateSureScore(imageAnalysis, marketData = null) {
    console.log('🎯 Calculating Sure Score for image analysis...');
    
    const scores = {
      // Image analysis confidence (40% weight)
      imageAnalysis: this.calculateImageAnalysisScore(imageAnalysis),
      
      // Image quality (25% weight)
      imageQuality: this.calculateImageQualityScore(imageAnalysis.imageQuality),
      
      // Object identification confidence (20% weight)
      objectIdentification: imageAnalysis.confidence.objectIdentification,
      
      // Market validation (15% weight - if available)
      marketValidation: marketData ? this.calculateMarketValidationScore(imageAnalysis, marketData) : 0.5
    };
    
    // Weighted composite score
    const sureScore = (
      scores.imageAnalysis * 0.40 +
      scores.imageQuality * 0.25 +
      scores.objectIdentification * 0.20 +
      scores.marketValidation * 0.15
    );
    
    // Determine confidence level
    let confidenceLevel;
    let recommendation;
    
    if (sureScore >= 0.85) {
      confidenceLevel = 'Mycket hög';
      recommendation = 'Katalogisera med hög säkerhet';
    } else if (sureScore >= 0.70) {
      confidenceLevel = 'Hög';
      recommendation = 'Katalogisera med rimlig säkerhet';
    } else if (sureScore >= 0.55) {
      confidenceLevel = 'Medel';
      recommendation = 'Granska extra noggrant innan katalogisering';
    } else {
      confidenceLevel = 'Låg';
      recommendation = 'Kräver expertbedömning eller bättre bild';
    }
    
    const result = {
      sureScore: Math.round(sureScore * 100) / 100,
      confidenceLevel,
      recommendation,
      breakdown: scores,
      factors: {
        imageQuality: scores.imageQuality,
        analysisReliability: scores.imageAnalysis,
        objectCertainty: scores.objectIdentification,
        marketSupport: scores.marketValidation
      }
    };
    
    console.log('✅ Sure Score calculated:', result);
    return result;
  }

  /**
   * Calculate image analysis reliability score
   */
  calculateImageAnalysisScore(analysis) {
    const confidenceValues = Object.values(analysis.confidence || {});
    const averageConfidence = confidenceValues.length > 0 
      ? confidenceValues.reduce((sum, val) => sum + val, 0) / confidenceValues.length 
      : 0.5;
    
    // Bonus for specific observations (safe access)
    let bonus = 0;
    if (analysis.visualObservations?.markings) bonus += 0.1;
    if (analysis.artist) bonus += 0.15;
    if (analysis.visualObservations?.style) bonus += 0.05;
    
    return Math.min(1.0, averageConfidence + bonus);
  }

  /**
   * Calculate image quality score
   */
  calculateImageQualityScore(imageQuality) {
    if (!imageQuality || typeof imageQuality !== 'object') {
      return 0.7; // Default quality score
    }
    
    const qualityValues = Object.values(imageQuality);
    if (qualityValues.length === 0) {
      return 0.7; // Default quality score
    }
    
    return qualityValues.reduce((sum, val) => sum + val, 0) / qualityValues.length;
  }

  /**
   * Calculate market validation score
   */
  calculateMarketValidationScore(imageAnalysis, marketData) {
    if (!marketData || !marketData.hasComparableData) {
      return 0.3; // Low score if no market data
    }
    
    let score = 0.6; // Base score for having market data
    
    // Bonus for high number of comparable sales
    if (marketData.historical?.analyzedSales > 10) score += 0.2;
    else if (marketData.historical?.analyzedSales > 5) score += 0.1;
    
    // Bonus for price range confidence
    if (marketData.confidence && marketData.confidence > 0.7) score += 0.1;
    
    // Bonus if image analysis aligns with market data patterns
    if (this.checkMarketAlignement(imageAnalysis, marketData)) score += 0.1;
    
    return Math.min(1.0, score);
  }

  /**
   * Check if image analysis aligns with market data
   */
  checkMarketAlignement(imageAnalysis, marketData) {
    // Simple heuristic - could be enhanced
    if (imageAnalysis.artist && marketData.searchContext?.includes(imageAnalysis.artist)) {
      return true;
    }
    if (imageAnalysis.materials && marketData.searchContext?.includes(imageAnalysis.materials)) {
      return true;
    }
    return false;
  }

  /**
   * Validate image analysis with market data
   */
  async validateWithMarketData(imageAnalysis) {
    if (!this.config.enableMarketValidation) {
      console.log('⏭️ Market validation disabled');
      return null;
    }
    
    try {
      console.log('🔍 Validating image analysis with market data...');
      
      // Build search query from image analysis
      const searchQuery = this.buildSearchQueryFromImageAnalysis(imageAnalysis);
      
      if (!searchQuery || searchQuery.trim().length < 3) {
        console.log('⏭️ Could not build meaningful search query from image analysis');
        return null;
      }
      
      console.log('🔍 Market validation search query:', searchQuery);
      
      // Create search context for market analysis
      const searchContext = {
        primarySearch: searchQuery,
        searchTerms: searchQuery.split(' '),
        finalSearch: searchQuery,
        source: 'ai_image_analysis',
        confidence: 0.7,
        reasoning: 'Image analysis derived search terms',
        generatedAt: Date.now(),
        isEmpty: false,
        hasValidQuery: true
      };
      
      // Call existing market analysis system
      const marketData = await this.apiManager.analyzeSales(searchContext);
      
      console.log('📊 Market validation result:', {
        hasData: !!marketData,
        hasComparableData: marketData?.hasComparableData,
        salesCount: marketData?.historical?.analyzedSales || 0
      });
      
      return marketData;
      
    } catch (error) {
      console.error('❌ Market validation failed:', error);
      console.error('❌ Market validation error details:', {
        message: error.message,
        stack: error.stack,
        searchQuery: searchQuery || 'undefined',
        hasApiManager: !!this.apiManager,
        hasAnalyzeSales: !!(this.apiManager && this.apiManager.analyzeSales)
      });
      return null;
    }
  }

  /**
   * Build search query from image analysis results
   */
  buildSearchQueryFromImageAnalysis(analysis) {
    const terms = [];
    
    // Priority 1: Artist (quoted for exact matching)
    if (analysis.artist && analysis.artist.trim()) {
      terms.push(`"${analysis.artist.trim()}"`);
    }
    
    // Priority 2: Object type (from visualObservations or extract from title)
    const objectType = analysis.visualObservations?.objectType || this.extractObjectTypeFromTitle(analysis.title);
    if (objectType) {
      terms.push(objectType);
    }
    
    // Priority 3: Material
    if (analysis.materials && this.isDistinctiveMaterial(analysis.materials)) {
      terms.push(analysis.materials);
    }
    
    // Priority 4: Style/Period
    if (analysis.period && analysis.period.includes('-tal')) {
      terms.push(analysis.period);
    }
    
    return terms.slice(0, 4).join(' ').trim();
  }

  /**
   * Extract object type from title as fallback
   */
  extractObjectTypeFromTitle(title) {
    if (!title) return '';
    
    const objectTypes = [
      'bägare', 'vas', 'skål', 'fat', 'tallrik', 'kopp', 'kanna',
      'lampa', 'ljusstake', 'spegel', 'klocka', 'ur', 'smycke', 'ring',
      'halsband', 'brosch', 'armband', 'skulptur', 'figurin',
      'tavla', 'målning', 'litografi', 'grafik', 'teckning'
    ];
    
    const lowerTitle = title.toLowerCase();
    for (const type of objectTypes) {
      if (lowerTitle.includes(type)) {
        return type;
      }
    }
    
    // Fallback: use first word
    return title.split(/[,\s]+/)[0] || '';
  }

  /**
   * Check if material is distinctive enough for search
   */
  isDistinctiveMaterial(material) {
    const distinctiveMaterials = [
      'silver', 'guld', 'brons', 'koppar', 'mässing', 'tenn',
      'porslin', 'stengods', 'keramik', 'glas', 'kristall',
      'marmor', 'granit', 'onyx', 'alabaster',
      'mahogny', 'ek', 'björk', 'teak', 'rosenträ'
    ];
    
    const lowerMaterial = material.toLowerCase();
    return distinctiveMaterials.some(dm => lowerMaterial.includes(dm));
  }

  /**
   * Parse numeric value from string or number
   */
  parseNumericValue(value) {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseInt(value.replace(/[^\d]/g, ''), 10);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  /**
   * Normalize confidence values to 0.0-1.0 range
   */
  normalizeConfidence(value) {
    if (typeof value === 'number') {
      return Math.max(0, Math.min(1, value));
    }
    return 0.5; // Default confidence
  }

  /**
   * Generate image upload UI HTML
   */
  generateImageUploadUI(containerId, options = {}) {
    const config = {
      showPreview: true,
      allowMultiple: false,
      dragAndDrop: true,
      ...options
    };

    return `
      <div class="ai-image-analyzer" id="${containerId}">
        <div class="ai-image-analyzer__upload-section">
          <div class="ai-image-analyzer__upload-zone" id="${containerId}-drop-zone">
            <div class="ai-image-analyzer__upload-icon">📸</div>
            <div class="ai-image-analyzer__upload-text">
              <h4>Ladda upp bild för AI-analys</h4>
              <p>Dra och släpp bild här eller klicka för att välja</p>
              <small>Stödda format: JPG, PNG, WebP • Max storlek: 10MB</small>
            </div>
            <input 
              type="file" 
              accept="image/*" 
              id="${containerId}-input"
              class="ai-image-analyzer__file-input"
              ${config.allowMultiple ? 'multiple' : ''}
            >
          </div>
          
          ${config.showPreview ? `
            <div class="ai-image-analyzer__preview" id="${containerId}-preview" style="display: none;">
              <div class="ai-image-analyzer__preview-header">
                <h5>Vald bild:</h5>
                <button type="button" class="ai-image-analyzer__remove-btn" id="${containerId}-remove">
                  ✕ Ta bort
                </button>
              </div>
              <div class="ai-image-analyzer__preview-content">
                <img id="${containerId}-preview-img" class="ai-image-analyzer__preview-image" alt="Preview">
                <div class="ai-image-analyzer__file-info" id="${containerId}-file-info"></div>
              </div>
            </div>
          ` : ''}
        </div>
        
        <div class="ai-image-analyzer__analysis-section" id="${containerId}-analysis" style="display: none;">
          <div class="ai-image-analyzer__processing" id="${containerId}-processing" style="display: none;">
            <div class="ai-image-analyzer__spinner"></div>
            <div class="ai-image-analyzer__processing-text">
              <h4>🤖 AI analyserar bilden...</h4>
              <p>Detta kan ta upp till 30 sekunder</p>
            </div>
          </div>
          
          <div class="ai-image-analyzer__results" id="${containerId}-results" style="display: none;">
            <!-- Results will be populated here -->
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Attach event listeners to image upload UI
   */
  attachImageUploadListeners(containerId, callback) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error('❌ Container not found:', containerId);
      return;
    }

    const dropZone = container.querySelector(`#${containerId}-drop-zone`);
    const fileInput = container.querySelector(`#${containerId}-input`);
    const preview = container.querySelector(`#${containerId}-preview`);
    const previewImg = container.querySelector(`#${containerId}-preview-img`);
    const fileInfo = container.querySelector(`#${containerId}-file-info`);
    const removeBtn = container.querySelector(`#${containerId}-remove`);

    if (!dropZone || !fileInput) {
      console.error('❌ Required elements not found in container');
      return;
    }

    // File input change
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.handleImageSelection(file, preview, previewImg, fileInfo, callback);
      }
    });

    // Drop zone click
    dropZone.addEventListener('click', () => {
      fileInput.click();
    });

    // Drag and drop
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('ai-image-analyzer__upload-zone--dragover');
    });

    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropZone.classList.remove('ai-image-analyzer__upload-zone--dragover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('ai-image-analyzer__upload-zone--dragover');
      
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleImageSelection(files[0], preview, previewImg, fileInfo, callback);
      }
    });

    // Remove button
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        this.clearImageSelection(fileInput, preview, callback);
      });
    }

    console.log('✅ Image upload listeners attached to:', containerId);
  }

  /**
   * Handle image selection
   */
  handleImageSelection(file, preview, previewImg, fileInfo, callback) {
    console.log('📸 Image selected:', file.name, file.type, file.size);

    // Validate file
    const validation = this.validateImageFile(file);
    if (!validation.isValid) {
      alert('Bildfel: ' + validation.errors.join('. '));
      return;
    }

    // Show preview
    if (preview && previewImg && fileInfo) {
      const reader = new FileReader();
      reader.onload = (e) => {
        previewImg.src = e.target.result;
        fileInfo.innerHTML = `
          <strong>${file.name}</strong><br>
          ${this.formatFileSize(file.size)} • ${file.type}
        `;
        preview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    }

    // Call callback with selected file
    if (callback && typeof callback === 'function') {
      callback(file);
    }
  }

  /**
   * Clear image selection
   */
  clearImageSelection(fileInput, preview, callback) {
    fileInput.value = '';
    if (preview) {
      preview.style.display = 'none';
    }
    
    this.currentImage = null;
    this.analysisResult = null;
    
    if (callback && typeof callback === 'function') {
      callback(null);
    }
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Show processing state
   */
  showProcessingState(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const analysisSection = container.querySelector(`#${containerId}-analysis`);
    const processingDiv = container.querySelector(`#${containerId}-processing`);
    const resultsDiv = container.querySelector(`#${containerId}-results`);

    if (analysisSection) analysisSection.style.display = 'block';
    if (processingDiv) processingDiv.style.display = 'block';
    if (resultsDiv) resultsDiv.style.display = 'none';
  }

  /**
   * Show analysis results
   */
  showAnalysisResults(containerId, analysisResult, sureScore = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const processingDiv = container.querySelector(`#${containerId}-processing`);
    const resultsDiv = container.querySelector(`#${containerId}-results`);

    if (processingDiv) processingDiv.style.display = 'none';
    if (resultsDiv) {
      resultsDiv.style.display = 'block';
      resultsDiv.innerHTML = this.generateAnalysisResultsHTML(analysisResult, sureScore);
    }
  }

  /**
   * Generate HTML for analysis results
   */
  generateAnalysisResultsHTML(analysis, sureScore) {
    const sureScoreHTML = sureScore ? `
      <div class="ai-image-analyzer__sure-score">
        <h4>🎯 Sure Score: ${Math.round(sureScore.sureScore * 100)}%</h4>
        <div class="sure-score-level sure-score-level--${sureScore.confidenceLevel.toLowerCase().replace(' ', '-')}">
          ${sureScore.confidenceLevel} säkerhet
        </div>
        <p class="sure-score-recommendation">${sureScore.recommendation}</p>
      </div>
    ` : '';

    return `
      ${sureScoreHTML}
      
      <div class="ai-image-analyzer__analysis-fields">
        <div class="analysis-field">
          <label>Titel:</label>
          <input type="text" value="${this.escapeHtml(analysis.title)}" readonly>
        </div>
        
        <div class="analysis-field">
          <label>Beskrivning:</label>
          <textarea rows="3" readonly>${this.escapeHtml(analysis.description)}</textarea>
        </div>
        
        <div class="analysis-field">
          <label>Skick:</label>
          <input type="text" value="${this.escapeHtml(analysis.condition)}" readonly>
        </div>
        
        ${analysis.artist ? `
          <div class="analysis-field">
            <label>Konstnär/Formgivare:</label>
            <input type="text" value="${this.escapeHtml(analysis.artist)}" readonly>
          </div>
        ` : ''}
        
        <div class="analysis-field">
          <label>Material:</label>
          <input type="text" value="${this.escapeHtml(analysis.materials)}" readonly>
        </div>
        
        ${analysis.period ? `
          <div class="analysis-field">
            <label>Period:</label>
            <input type="text" value="${this.escapeHtml(analysis.period)}" readonly>
          </div>
        ` : ''}
        
        ${analysis.estimate ? `
          <div class="analysis-field">
            <label>Uppskattat värde:</label>
            <input type="text" value="${analysis.estimate} SEK" readonly>
          </div>
        ` : ''}
        
        ${analysis.reserve ? `
          <div class="analysis-field">
            <label>Reserv:</label>
            <input type="text" value="${analysis.reserve} SEK" readonly>
          </div>
        ` : ''}
      </div>
      
      <div class="ai-image-analyzer__visual-observations">
        <h5>👁️ Visuella observationer:</h5>
        <ul>
          ${analysis.visualObservations.objectType ? `<li><strong>Objekttyp:</strong> ${analysis.visualObservations.objectType}</li>` : ''}
          ${analysis.visualObservations.primaryMaterial ? `<li><strong>Material:</strong> ${analysis.visualObservations.primaryMaterial}</li>` : ''}
          ${analysis.visualObservations.colorScheme ? `<li><strong>Färger:</strong> ${analysis.visualObservations.colorScheme}</li>` : ''}
          ${analysis.visualObservations.markings ? `<li><strong>Märkningar:</strong> ${analysis.visualObservations.markings}</li>` : ''}
          ${analysis.visualObservations.dimensions ? `<li><strong>Proportioner:</strong> ${analysis.visualObservations.dimensions}</li>` : ''}
          ${analysis.visualObservations.style ? `<li><strong>Stil:</strong> ${analysis.visualObservations.style}</li>` : ''}
        </ul>
      </div>
      
      ${analysis.reasoning ? `
        <div class="ai-image-analyzer__reasoning">
          <h5>🤖 AI-analys:</h5>
          <p><em>${this.escapeHtml(analysis.reasoning)}</em></p>
        </div>
      ` : ''}
    `;
  }

  /**
   * Escape HTML for safe display
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Get current image data
   */
  getCurrentImage() {
    return this.currentImage;
  }

  /**
   * Get current analysis result
   */
  getCurrentAnalysis() {
    return this.analysisResult;
  }

  /**
   * Check if currently processing
   */
  isCurrentlyProcessing() {
    return this.isProcessing;
  }

  /**
   * Destroy component and clean up
   */
  destroy() {
    this.currentImage = null;
    this.analysisResult = null;
    this.isProcessing = false;
    console.log('✅ AIImageAnalyzer component destroyed');
  }
}
