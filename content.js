// content.js - Main content script
class AuctionetCatalogingAssistant {
  constructor() {
    this.apiKey = null;
    this.init();
    
    // Listen for API key changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && changes.anthropicApiKey) {
        console.log('API key updated in storage');
        this.apiKey = changes.anthropicApiKey.newValue;
      }
    });
    
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'refresh-api-key') {
        console.log('Refreshing API key from popup request');
        this.loadApiKey();
        sendResponse({ success: true });
      }
    });
  }

  async init() {
    console.log('Auctionet AI Assistant: Initializing...');
    
    // Wait for page to be fully loaded
    if (document.readyState === 'loading') {
      console.log('Waiting for DOM to load...');
      await new Promise(resolve => {
        document.addEventListener('DOMContentLoaded', resolve);
      });
    }

    // Additional wait to ensure dynamic content is loaded
    console.log('Waiting for dynamic content...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if we're on the right page
    if (!this.isCorrectPage()) {
      console.log('Auctionet AI Assistant: Not on an item edit page');
      return;
    }

    console.log('Auctionet AI Assistant: On correct page, proceeding with initialization');
    
    await this.loadApiKey();
    console.log('API key loaded:', this.apiKey ? 'Yes' : 'No');
    
    this.injectUI();
    this.attachEventListeners();
    
    console.log('Auctionet AI Assistant: Initialization complete');
  }

  isCorrectPage() {
    const url = window.location.href;
    return url.includes('auctionet.com/admin/') && 
           url.includes('/items/') && 
           url.includes('/edit') &&
           document.querySelector('#item_title_sv');
  }

  async loadApiKey() {
    try {
      const result = await chrome.storage.sync.get(['anthropicApiKey']);
      this.apiKey = result.anthropicApiKey;
      console.log('API key loaded from storage:', this.apiKey ? 'Found' : 'Not found');
    } catch (error) {
      console.error('Error loading API key:', error);
      this.apiKey = null;
    }
  }

  injectUI() {
    console.log('Injecting UI elements...');
    
    // Add AI assistance button next to each field
    const titleField = document.querySelector('#item_title_sv');
    const descriptionField = document.querySelector('#item_description_sv');
    const conditionField = document.querySelector('#item_condition_sv');
    const keywordsField = document.querySelector('#item_hidden_keywords');

    console.log('Found fields:', {
      title: !!titleField,
      description: !!descriptionField,
      condition: !!conditionField,
      keywords: !!keywordsField
    });

    if (titleField) {
      this.addAIButton(titleField, 'title', 'AI-förbättra titel');
    }
    if (descriptionField) {
      this.addAIButton(descriptionField, 'description', 'AI-förbättra beskrivning');
    }
    if (conditionField) {
      this.addAIButton(conditionField, 'condition', 'AI-förbättra kondition');
    }
    if (keywordsField) {
      this.addAIButton(keywordsField, 'keywords', 'AI-generera sökord');
    }

    // Add master "Improve All" button
    this.addMasterButton();

  }

  addMasterButton() {
    // Add quality indicator first, then add button to it
    this.addQualityIndicator();
  }

  addAIButton(field, type, buttonText) {
    const button = document.createElement('button');
    button.className = 'ai-assist-button';
    button.textContent = buttonText;
    button.type = 'button';
    button.dataset.fieldType = type;
    
    const wrapper = document.createElement('div');
    wrapper.className = 'ai-button-wrapper';
    wrapper.appendChild(button);
    
    field.parentElement.appendChild(wrapper);
  }

  addQualityIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'quality-indicator';
    indicator.innerHTML = `
      <div class="quality-header">
        <h4 class="quality-title">Katalogiseringskvalitet</h4>
        <div class="quality-score-container">
          <span class="quality-score">Analyserar...</span>
          <button class="refresh-quality-btn" type="button" title="Uppdatera kvalitetspoäng">🔄</button>
        </div>
        <button class="ai-assist-button ai-master-button" type="button">⚡ Förbättra alla</button>
      </div>
      <div class="quality-warnings"></div>
    `;
    
    // Add CSS for better layout
    if (!document.getElementById('quality-indicator-styles')) {
      const style = document.createElement('style');
      style.id = 'quality-indicator-styles';
      style.textContent = `
        .quality-indicator {
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
          border: 1px solid #dee2e6;
          border-radius: 12px;
          padding: 20px;
          margin-bottom: 20px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .quality-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
        }
        
        .quality-title {
          margin: 0 0 10px 0;
          font-size: 14px;
          font-weight: 600;
          color: #333;
          text-align: center;
          width: 100%;
        }
        
        .quality-score-container {
          margin-bottom: 12px;
          width: 100%;
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        
        .quality-score {
          display: inline-block;
          font-weight: bold;
          padding: 6px 16px;
          border-radius: 20px;
          font-size: 14px;
          min-width: 80px;
          text-align: center;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          transition: all 0.3s ease;
        }
        
        .refresh-quality-btn {
          background: linear-gradient(135deg, #6c757d 0%, #495057 100%);
          color: white;
          border: none;
          border-radius: 50%;
          width: 28px;
          height: 28px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .refresh-quality-btn:hover {
          background: linear-gradient(135deg, #495057 0%, #343a40 100%);
          transform: rotate(180deg) scale(1.1);
        }
        
        .refresh-quality-btn:active {
          transform: rotate(180deg) scale(0.95);
        }
        
        .quality-score.good { 
          background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%); 
          color: #155724; 
          border: 2px solid #b8dacc;
        }
        
        .quality-score.medium { 
          background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%); 
          color: #856404; 
          border: 2px solid #f1c40f;
        }
        
        .quality-score.poor { 
          background: linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%); 
          color: #721c24; 
          border: 2px solid #e74c3c;
        }
        
        .ai-master-button {
          width: 100%;
          padding: 8px 16px;
          font-size: 14px;
          font-weight: 600;
          background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.3s ease;
          box-shadow: 0 2px 6px rgba(40, 167, 69, 0.3);
        }
        
        .ai-master-button:hover {
          background: linear-gradient(135deg, #218838 0%, #1e7e34 100%);
          transform: translateY(-1px);
          box-shadow: 0 3px 8px rgba(40, 167, 69, 0.4);
        }
        
        .ai-master-button:active {
          transform: translateY(0);
          box-shadow: 0 1px 4px rgba(40, 167, 69, 0.3);
        }
        
        .quality-warnings {
          margin-top: 15px;
          padding-top: 15px;
          border-top: 1px solid #dee2e6;
        }
        
        .quality-warnings ul {
          margin: 0;
          padding-left: 20px;
        }
        
        .quality-warnings li {
          margin-bottom: 8px;
          font-size: 14px;
        }
        
        .warning-high {
          color: #721c24;
          font-weight: 500;
        }
        
        .warning-medium {
          color: #856404;
        }
        
        .warning-low {
          color: #6c757d;
          font-style: italic;
        }
        
        .no-warnings {
          color: #155724;
          font-weight: 500;
          text-align: center;
          margin: 0;
          font-size: 14px;
        }
        
        /* AI Button Styles */
        .ai-button-wrapper {
          margin-top: 12px;
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }
        
        .ai-assist-button {
          background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(0, 123, 255, 0.3);
        }
        
        .ai-assist-button:hover {
          background: linear-gradient(135deg, #0056b3 0%, #004085 100%);
          transform: translateY(-1px);
          box-shadow: 0 3px 6px rgba(0, 123, 255, 0.4);
        }
        
        .ai-assist-button:active {
          transform: translateY(0);
          box-shadow: 0 1px 3px rgba(0, 123, 255, 0.3);
        }
        
        .ai-undo-button {
          background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(220, 53, 69, 0.3);
          margin-left: 12px;
        }
        
        .ai-undo-button:hover {
          background: linear-gradient(135deg, #c82333 0%, #a71e2a 100%);
          transform: translateY(-1px);
          box-shadow: 0 3px 6px rgba(220, 53, 69, 0.4);
        }
        
        .ai-undo-button:active {
          transform: translateY(0);
          box-shadow: 0 1px 3px rgba(220, 53, 69, 0.3);
        }
        
        .ai-updated {
          background-color: #d4edda !important;
          border: 2px solid #28a745 !important;
          transition: all 0.3s ease;
        }
      `;
      document.head.appendChild(style);
    }
    
    const sidebar = document.querySelector('.grid-col4');
    if (sidebar) {
      sidebar.insertBefore(indicator, sidebar.firstChild);
      
      // Add event listener for manual refresh button
      const refreshButton = indicator.querySelector('.refresh-quality-btn');
      if (refreshButton) {
        refreshButton.addEventListener('click', () => {
          console.log('Manual quality refresh triggered');
          this.analyzeQuality();
        });
      }
      
      // Set up live quality monitoring
      this.setupLiveQualityUpdates();
      
      // Initial quality analysis
      this.analyzeQuality();
    }
  }

  analyzeQuality() {
    console.log('🔍 analyzeQuality() called');
    const data = this.extractItemData();
    console.log('📊 Extracted data for quality analysis:', data);
    const warnings = [];
    let score = 100;
    
    // Check if "Inga anmärkningar" (No remarks) is checked
    const noRemarksCheckbox = document.querySelector('input[type="checkbox"][value="Inga anmärkningar"]') || 
                             document.querySelector('input[type="checkbox"]#item_no_remarks') ||
                             document.querySelector('input[type="checkbox"][name*="no_remarks"]');
    const noRemarksChecked = noRemarksCheckbox && noRemarksCheckbox.checked;

    // Title quality checks
    if (data.title.length < 20) {
      warnings.push({ field: 'Titel', issue: 'För kort - lägg till material och period', severity: 'high' });
      score -= 20;
    }
    if (!data.title.includes(',')) {
      warnings.push({ field: 'Titel', issue: 'Saknar korrekt struktur (KONSTNÄR, Objekt, Material)', severity: 'medium' });
      score -= 15;
    }

    // Description quality checks
    const descLength = data.description.replace(/<[^>]*>/g, '').length;
    if (descLength < 50) {
      warnings.push({ field: 'Beskrivning', issue: 'För kort - lägg till detaljer om material, teknik, märkningar', severity: 'high' });
      score -= 25;
    }
    if (!data.description.match(/\d+[\s,]*(x|cm)/i)) {
      warnings.push({ field: 'Beskrivning', issue: 'Saknar fullständiga mått', severity: 'high' });
      score -= 20;
    }

    // Condition quality checks (skip if "Inga anmärkningar" is checked)
    if (!noRemarksChecked) {
      const condLength = data.condition.replace(/<[^>]*>/g, '').length;
      if (condLength < 20) {
        warnings.push({ field: 'Kondition', issue: 'För vag - specificera typ av slitage och skador', severity: 'high' });
        score -= 20;
      }
      if (data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) {
        warnings.push({ field: 'Kondition', issue: 'Endast "bruksslitage" är otillräckligt - specificera typ av slitage (repor, nagg, fläckar, etc.)', severity: 'high' });
        score -= 25; // Increased penalty for lazy condition reports
      }
      
      // Check for other vague condition terms
      const vaguePhrases = ['normalt slitage', 'vanligt slitage', 'åldersslitage', 'slitage förekommer'];
      const conditionText = data.condition.toLowerCase();
      const hasVaguePhrase = vaguePhrases.some(phrase => 
        conditionText.includes(phrase) && conditionText.replace(/<[^>]*>/g, '').trim().length < 30
      );
      
      if (hasVaguePhrase) {
        warnings.push({ field: 'Kondition', issue: 'Vag konditionsbeskrivning - beskriv specifika skador och var de finns', severity: 'medium' });
        score -= 15;
      }
    } else {
      // "Inga anmärkningar" is checked - condition field gets full points
      warnings.push({ field: 'Kondition', issue: '✓ "Inga anmärkningar" markerat - ingen konditionsrapport behövs', severity: 'low' });
    }

    // Keywords quality checks (HIGH IMPORTANCE for discoverability)
    const keywordsLength = data.keywords.length;
    // Support both comma-separated and Auctionet space-separated formats
    const keywordCount = data.keywords ? 
      (data.keywords.includes(',') ? 
        data.keywords.split(',').filter(k => k.trim().length > 0).length :
        data.keywords.split(/\s+/).filter(k => k.trim().length > 0).length
      ) : 0;
    
    // Debug logging
    console.log('Keywords debug:', {
      keywords: data.keywords,
      keywordsLength: keywordsLength,
      keywordCount: keywordCount,
      splitByComma: data.keywords ? data.keywords.split(',').filter(k => k.trim().length > 0) : []
    });
    
    if (keywordsLength === 0 || !data.keywords || data.keywords.trim() === '') {
      warnings.push({ field: 'Sökord', issue: 'Inga dolda sökord - kritiskt för sökbarhet', severity: 'high' });
      score -= 30; // Heavy penalty for missing keywords
    } else if (keywordCount < 2) {
      warnings.push({ field: 'Sökord', issue: 'För få sökord - lägg till fler relevanta termer', severity: 'high' });
      score -= 20;
    } else if (keywordCount < 4) {
      warnings.push({ field: 'Sökord', issue: 'Bra start - några fler sökord kan förbättra sökbarheten', severity: 'medium' });
      score -= 10;
    } else if (keywordCount >= 4 && keywordCount <= 12) {
      // Sweet spot - no warnings, this is good
      console.log('Keywords in sweet spot:', keywordCount, 'keywords');
    } else if (keywordCount > 12) {
      warnings.push({ field: 'Sökord', issue: 'För många sökord kan skada sökbarheten - fokusera på kvalitet över kvantitet', severity: 'medium' });
      score -= 15;
    }
    
    // Check for keyword quality - simplified approach
    if (data.keywords) {
      const keywords = data.keywords.toLowerCase();
      const titleDesc = (data.title + ' ' + data.description + ' ' + data.condition).toLowerCase();
      
      // Check for keyword diversity (suggestion only, no penalty)
      const keywordArray = data.keywords.includes(',') ? 
        data.keywords.split(',').map(k => k.trim()).filter(k => k.length > 0) :
        data.keywords.split(/\s+/).map(k => k.trim()).filter(k => k.length > 0);
      const uniqueKeywords = keywordArray.filter(keyword => 
        !titleDesc.includes(keyword.toLowerCase().replace(/-/g, ' ')) || keyword.length <= 3
      );
      
      const uniquePercentage = uniqueKeywords.length / keywordArray.length;
      
      if (uniquePercentage < 0.4) {
        warnings.push({ field: 'Sökord', issue: 'Tips: Många sökord upprepar titel/beskrivning - kompletterande termer kan förbättra sökbarheten', severity: 'low' });
        // No score penalty - just a suggestion
      }
    }

    // Update UI
    this.updateQualityIndicator(score, warnings);
  }

  updateQualityIndicator(score, warnings) {
    const scoreElement = document.querySelector('.quality-score');
    const warningsElement = document.querySelector('.quality-warnings');
    
    if (scoreElement) {
      // Add smooth transition effect for score changes
      const currentScore = parseInt(scoreElement.textContent.split('/')[0]) || 0;
      const newScore = score;
      
      if (currentScore !== newScore) {
        scoreElement.style.transform = 'scale(1.1)';
        setTimeout(() => {
          scoreElement.style.transform = 'scale(1)';
        }, 200);
      }
      
      scoreElement.textContent = `${score}/100`;
      scoreElement.className = `quality-score ${score >= 80 ? 'good' : score >= 60 ? 'medium' : 'poor'}`;
    }
    
    if (warningsElement) {
      if (warnings.length > 0) {
        warningsElement.innerHTML = '<ul>' + 
          warnings.map(w => `<li class="warning-${w.severity}"><strong>${w.field}:</strong> ${w.issue}</li>`).join('') +
          '</ul>';
      } else {
        warningsElement.innerHTML = '<p class="no-warnings">✓ Utmärkt katalogisering!</p>';
      }
    }
  }

  setupLiveQualityUpdates() {
    // Debounce function to prevent too frequent updates
    let updateTimeout;
    const debouncedUpdate = (event) => {
      clearTimeout(updateTimeout);
      updateTimeout = setTimeout(() => {
        console.log('⚡ Live quality update triggered by:', event?.target?.id || event?.target?.tagName || 'unknown field');
        this.analyzeQuality();
      }, 800); // Wait 800ms after user stops typing
    };

    // Use the exact same selectors as extractItemData()
    const fieldsToMonitor = [
      '#item_title_sv',
      '#item_description_sv', 
      '#item_condition_sv',
      '#item_hidden_keywords',
      'input[type="checkbox"][value="Inga anmärkningar"]',
      'input[type="checkbox"]#item_no_remarks',
      'input[type="checkbox"][name*="no_remarks"]'
    ];

    let monitoredCount = 0;
    fieldsToMonitor.forEach(selector => {
      const element = document.querySelector(selector);
      if (element) {
        console.log(`Setting up live monitoring for: ${selector}`);
        monitoredCount++;
        
        // Add event listeners for different input types
        if (element.type === 'checkbox') {
          element.addEventListener('change', debouncedUpdate);
        } else {
          element.addEventListener('input', debouncedUpdate);
          element.addEventListener('paste', debouncedUpdate);
          element.addEventListener('keyup', debouncedUpdate);
        }
      } else {
        console.warn(`Field not found for live monitoring: ${selector}`);
      }
    });

    // Also monitor for changes in rich text editors (if any)
    const richTextEditors = document.querySelectorAll('[contenteditable="true"]');
    richTextEditors.forEach(editor => {
      console.log('Setting up live monitoring for rich text editor');
      editor.addEventListener('input', debouncedUpdate);
      editor.addEventListener('paste', debouncedUpdate);
      monitoredCount++;
    });

    console.log(`Live quality monitoring set up for ${monitoredCount} fields`);
  }

  attachEventListeners() {
    // Individual field buttons (exclude master button)
    const buttons = document.querySelectorAll('.ai-assist-button:not(.ai-master-button)');
    console.log('Found AI assist buttons:', buttons.length);
    
    buttons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const fieldType = e.target.dataset.fieldType;
        console.log('Button clicked for field type:', fieldType);
        if (fieldType) {
          this.improveField(fieldType);
        } else {
          console.warn('Button clicked but no fieldType found:', e.target);
        }
      });
    });

    // Master button (separate handler)
    const masterButton = document.querySelector('.ai-master-button');
    if (masterButton) {
      console.log('Master button found and event listener attached');
      masterButton.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Master button clicked');
        this.improveAllFields();
      });
    } else {
      console.warn('Master button not found');
    }
  }

  async improveField(fieldType) {
    // Ensure API key is loaded
    if (!this.apiKey) {
      await this.loadApiKey();
    }
    
    // Check if API key is still missing
    if (!this.apiKey) {
      this.showErrorIndicator(fieldType, 'API key not configured. Please set your Anthropic API key in the extension popup.');
      return;
    }
    
    const itemData = this.extractItemData();
    
    // Assess data quality for hallucination prevention
    const qualityAssessment = this.assessDataQuality(itemData, fieldType);
    
    if (qualityAssessment.needsMoreInfo) {
      this.showFieldSpecificInfoDialog(fieldType, qualityAssessment.missingInfo, itemData);
      return;
    }
    
    this.showLoadingIndicator(fieldType);
    
    try {
      const improved = await this.callClaudeAPI(itemData, fieldType);
      console.log('Improved result for', fieldType, ':', improved);
      
      // For single field improvements, extract the specific field value
      const value = improved[fieldType];
      if (value) {
        this.applyImprovement(fieldType, value);
        this.showSuccessIndicator(fieldType);
        
        // Re-analyze quality after improvement (with delay to ensure DOM is updated)
        console.log('Re-analyzing quality after single field improvement...');
        setTimeout(() => {
          console.log('Delayed quality analysis for single field...');
          this.analyzeQuality();
        }, 500);
      } else {
        throw new Error(`No ${fieldType} value in response`);
      }
    } catch (error) {
      console.error('Error improving field:', error);
      this.showErrorIndicator(fieldType, error.message);
    }
  }

  async improveAllFields() {
    // Ensure API key is loaded
    if (!this.apiKey) {
      await this.loadApiKey();
    }
    
    // Check if API key is still missing
    if (!this.apiKey) {
      this.showErrorIndicator('all', 'API key not configured. Please set your Anthropic API key in the extension popup.');
      return;
    }
    
    const itemData = this.extractItemData();
    
    // Assess data quality for hallucination prevention
    const qualityAssessment = this.assessDataQuality(itemData, 'all');
    
    if (qualityAssessment.needsMoreInfo) {
      this.showFieldSpecificInfoDialog('all', qualityAssessment.missingInfo, itemData);
      return;
    }
    
    this.showLoadingIndicator('all');
    
    try {
      const improvements = await this.callClaudeAPI(itemData, 'all');
      
      if (improvements.title) {
        this.applyImprovement('title', improvements.title);
      }
      if (improvements.description) {
        this.applyImprovement('description', improvements.description);
      }
      if (improvements.condition) {
        this.applyImprovement('condition', improvements.condition);
      }
      if (improvements.keywords) {
        this.applyImprovement('keywords', improvements.keywords);
      }
      
      this.showSuccessIndicator('all');
      
      // Re-analyze quality after improvements (delay to ensure DOM is updated)
      console.log('Re-analyzing quality after improvements...');
      setTimeout(() => {
        console.log('DOM should be updated now, calling analyzeQuality...');
        this.analyzeQuality();
      }, 500);
    } catch (error) {
      this.showErrorIndicator('all', error.message);
    }
  }

  assessDataQuality(data, fieldType) {
    const descLength = data.description.replace(/<[^>]*>/g, '').length;
    const condLength = data.condition.replace(/<[^>]*>/g, '').length;
    const titleLength = data.title.length;
    
    // Check if "Inga anmärkningar" is checked
    const noRemarksCheckbox = document.querySelector('input[type="checkbox"][value="Inga anmärkningar"]') || 
                             document.querySelector('input[type="checkbox"]#item_no_remarks') ||
                             document.querySelector('input[type="checkbox"][name*="no_remarks"]');
    const noRemarksChecked = noRemarksCheckbox && noRemarksCheckbox.checked;
    
    // Calculate overall quality score
    const qualityScore = this.calculateCurrentQualityScore(data);
    
    const issues = [];
    let needsMoreInfo = false;
    
    // Critical quality thresholds
    if (qualityScore < 30) {
      needsMoreInfo = true;
      issues.push('critical_quality');
    }
    
    // Field-specific quality checks
    switch(fieldType) {
      case 'title':
        // Check if we can safely improve title
        if (!data.description.match(/\d{4}|\d{2,4}-tal|1[6-9]\d{2}|20[0-2]\d/i) && !data.artist && descLength < 30) {
          issues.push('period');
          needsMoreInfo = true;
        }
        if (titleLength < 15 && descLength < 25) {
          issues.push('basic_info');
          needsMoreInfo = true;
        }
        // Check if artist is unknown/obscure and might lead to hallucination
        if (data.artist && data.artist.length > 0 && descLength < 20) {
          issues.push('artist_verification');
          needsMoreInfo = true;
        }
        break;
        
      case 'description':
        if (descLength < 25) {
          issues.push('material', 'technique', 'period', 'measurements');
          needsMoreInfo = true;
        }
        if (!data.description.match(/\d+[\s,]*(x|cm|mm)/i) && descLength < 40) {
          issues.push('measurements');
          needsMoreInfo = true;
        }
        break;
        
      case 'condition':
        // Skip condition checks if "Inga anmärkningar" is checked
        if (!noRemarksChecked) {
          if (data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) {
            issues.push('specific_damage', 'wear_details', 'bruksslitage_vague');
            needsMoreInfo = true;
          }
          if (condLength < 15) {
            issues.push('condition_details');
            needsMoreInfo = true;
          }
          
          // Check for other vague condition phrases
          const vaguePhrases = ['normalt slitage', 'vanligt slitage', 'åldersslitage'];
          const conditionText = data.condition.toLowerCase();
          const hasVaguePhrase = vaguePhrases.some(phrase => conditionText.includes(phrase));
          
          if (hasVaguePhrase && condLength < 40) {
            issues.push('vague_condition_terms');
            needsMoreInfo = true;
          }
        }
        break;
        
      case 'keywords':
        // Keywords can usually be generated even with sparse data
        if (qualityScore < 20) {
          issues.push('basic_info');
          needsMoreInfo = true;
        }
        break;
        
      case 'all':
        // For "Förbättra alla" - comprehensive check
        if (qualityScore < 40) {
          needsMoreInfo = true;
          issues.push('critical_quality');
        }
        if (descLength < 30) {
          issues.push('material', 'technique', 'period');
          needsMoreInfo = true;
        }
        if (!data.description.match(/\d+[\s,]*(x|cm|mm)/i) && descLength < 50) {
          issues.push('measurements');
          needsMoreInfo = true;
        }
        if (!noRemarksChecked && data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) {
          issues.push('specific_damage');
          needsMoreInfo = true;
        }
        break;
    }
    
    return { needsMoreInfo, missingInfo: issues, qualityScore };
  }

  calculateCurrentQualityScore(data) {
    let score = 100;
    
    // Check if "Inga anmärkningar" is checked
    const noRemarksCheckbox = document.querySelector('input[type="checkbox"][value="Inga anmärkningar"]') || 
                             document.querySelector('input[type="checkbox"]#item_no_remarks') ||
                             document.querySelector('input[type="checkbox"][name*="no_remarks"]');
    const noRemarksChecked = noRemarksCheckbox && noRemarksCheckbox.checked;
    
    // Quick quality calculation (simplified version of analyzeQuality)
    const descLength = data.description.replace(/<[^>]*>/g, '').length;
    const condLength = data.condition.replace(/<[^>]*>/g, '').length;
    const keywordsLength = data.keywords.length;
    
    // Support both comma-separated and Auctionet space-separated formats
    const keywordCount = data.keywords ? 
      (data.keywords.includes(',') ? 
        data.keywords.split(',').filter(k => k.trim().length > 0).length :
        data.keywords.split(/\s+/).filter(k => k.trim().length > 0).length
      ) : 0;
    
    // Debug logging for calculateCurrentQualityScore
    console.log('calculateCurrentQualityScore keywords debug:', {
      keywords: data.keywords,
      keywordsLength: keywordsLength,
      keywordCount: keywordCount
    });
    
    if (data.title.length < 20) score -= 20;
    if (descLength < 50) score -= 25;
    
    // Skip condition scoring if "Inga anmärkningar" is checked
    if (!noRemarksChecked) {
      if (condLength < 20) score -= 20;
      if (data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) score -= 25; // Increased penalty
      
      // Check for other vague condition terms
      const vaguePhrases = ['normalt slitage', 'vanligt slitage', 'åldersslitage', 'slitage förekommer'];
      const conditionText = data.condition.toLowerCase();
      const hasVaguePhrase = vaguePhrases.some(phrase => 
        conditionText.includes(phrase) && conditionText.replace(/<[^>]*>/g, '').trim().length < 30
      );
      
      if (hasVaguePhrase) score -= 15;
    }
    
    // Updated keyword scoring with more reasonable thresholds
    if (keywordsLength === 0 || !data.keywords || data.keywords.trim() === '') score -= 30;
    else if (keywordCount < 2) score -= 20;
    else if (keywordCount < 4) score -= 10;
    // 4-12 keywords = no penalty (sweet spot)
    else if (keywordCount > 12) score -= 15;
    
    if (!data.description.match(/\d+[\s,]*(x|cm)/i)) score -= 20;
    
    return Math.max(0, score);
  }

  isDataTooSparse(data) {
    // Use the new assessment system for "Förbättra alla"
    const assessment = this.assessDataQuality(data, 'all');
    return assessment.needsMoreInfo || assessment.qualityScore < 40;
  }

  showInformationRequestDialog(currentData) {
    const dialog = document.createElement('div');
    dialog.className = 'ai-info-request-dialog';
    dialog.innerHTML = `
      <div class="dialog-overlay"></div>
      <div class="dialog-content">
        <h3>Mer information behövs för optimal katalogisering</h3>
        <p>För att undvika felaktiga antaganden och skapa en professionell katalogisering behöver AI:n mer specifik information. Vänligen ange följande:</p>
        
        <div class="info-request-form">
          <div class="form-group">
            <label>Material (t.ex. ek, björk, mässing, silver):</label>
            <input type="text" id="ai-material" placeholder="Ange material...">
          </div>
          
          <div class="form-group">
            <label>Tillverkningsteknik (t.ex. handblåst, drejade, gjuten):</label>
            <input type="text" id="ai-technique" placeholder="Ange teknik...">
          </div>
          
          <div class="form-group">
            <label>Märkningar/Stämplar:</label>
            <input type="text" id="ai-markings" placeholder="T.ex. 'Märkt Kosta 1960'">
          </div>
          
          <div class="form-group">
            <label>Specifika skador/slitage:</label>
            <textarea id="ai-damage" placeholder="T.ex. 'Repa 3cm på ovansidan, nagg vid foten'"></textarea>
          </div>
          
          <div class="form-group">
            <label>Övrig information:</label>
            <textarea id="ai-additional" placeholder="Allt annat som kan vara relevant..."></textarea>
          </div>
        </div>
        
        <div class="dialog-buttons">
          <button class="btn btn-primary" id="process-with-info">
            Förbättra med denna information
          </button>
          <button class="btn btn-default" id="process-without-info">
            Fortsätt utan extra information
          </button>
          <button class="btn btn-link" id="cancel-dialog">
            Avbryt
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    // Add event listeners instead of inline onclick
    document.getElementById('process-with-info').addEventListener('click', () => {
      this.processWithAdditionalInfo();
    });
    
    document.getElementById('process-without-info').addEventListener('click', () => {
      this.processWithoutAdditionalInfo();
    });
    
    document.getElementById('cancel-dialog').addEventListener('click', () => {
      dialog.remove();
    });
    
    // Add CSS for the dialog
    if (!document.getElementById('dialog-styles')) {
      const style = document.createElement('style');
      style.id = 'dialog-styles';
      style.textContent = `
        .ai-info-request-dialog {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 10000;
        }
        
        .dialog-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
        }
        
        .dialog-content {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: white;
          padding: 30px;
          border-radius: 12px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          max-width: 500px;
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
        }
        
        .dialog-content h3 {
          margin: 0 0 15px 0;
          color: #333;
          font-size: 20px;
        }
        
        .info-request-form {
          margin: 20px 0;
        }
        
        .form-group {
          margin-bottom: 15px;
        }
        
        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: 500;
          color: #555;
        }
        
        .form-group input,
        .form-group textarea {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          box-sizing: border-box;
        }
        
        .form-group textarea {
          height: 60px;
          resize: vertical;
        }
        
        .dialog-buttons {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 25px;
        }
        
        .btn {
          padding: 10px 20px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
        }
        
        .btn-primary {
          background: #007bff;
          color: white;
        }
        
        .btn-primary:hover {
          background: #0056b3;
        }
        
        .btn-default {
          background: #6c757d;
          color: white;
        }
        
        .btn-default:hover {
          background: #545b62;
        }
        
        .btn-link {
          background: transparent;
          color: #6c757d;
          text-decoration: underline;
        }
        
        .btn-link:hover {
          color: #495057;
        }
        
        .missing-info {
          background: #f8f9fa;
          padding: 15px;
          border-radius: 6px;
          margin: 15px 0;
        }
        
        .missing-info h4 {
          margin: 0 0 10px 0;
          color: #495057;
          font-size: 16px;
        }
        
        .missing-info ul {
          margin: 0;
          padding-left: 20px;
        }
        
        .missing-info li {
          margin-bottom: 5px;
          color: #6c757d;
        }
        
        .field-tips {
          background: #e3f2fd;
          padding: 15px;
          border-radius: 6px;
          margin: 15px 0;
          border-left: 4px solid #2196f3;
        }
        
        .field-tips h4 {
          margin: 0 0 8px 0;
          color: #1976d2;
          font-size: 14px;
        }
        
        .field-tips p {
          margin: 0;
          color: #424242;
          font-size: 13px;
          line-height: 1.4;
        }
      `;
      document.head.appendChild(style);
    }
  }

  async processWithAdditionalInfo() {
    const additionalInfo = {
      material: document.getElementById('ai-material').value,
      technique: document.getElementById('ai-technique').value,
      markings: document.getElementById('ai-markings').value,
      damage: document.getElementById('ai-damage').value,
      additional: document.getElementById('ai-additional').value
    };
    
    document.querySelector('.ai-info-request-dialog').remove();
    
    const itemData = this.extractItemData();
    itemData.additionalInfo = additionalInfo;
    
    this.showLoadingIndicator('all');
    
    try {
      const improvements = await this.callClaudeAPI(itemData, 'all-enhanced');
      this.applyAllImprovements(improvements);
    } catch (error) {
      this.showErrorIndicator('all', error.message);
    }
  }

  async processWithoutAdditionalInfo() {
    document.querySelector('.ai-info-request-dialog').remove();
    const itemData = this.extractItemData();
    this.showLoadingIndicator('all');
    
    try {
      const improvements = await this.callClaudeAPI(itemData, 'all-sparse');
      this.applyAllImprovements(improvements);
    } catch (error) {
      this.showErrorIndicator('all', error.message);
    }
  }

  showFieldSpecificInfoDialog(fieldType, missingInfo, data) {
    const fieldNames = {
      'title': 'titeln',
      'description': 'beskrivningen', 
      'condition': 'skicket',
      'keywords': 'nyckelorden',
      'all': 'alla fält'
    };
    
    const fieldName = fieldNames[fieldType] || fieldType;
    
    const infoMessages = {
      'basic_info': '📝 Grundläggande information om objektet',
      'material': '🧱 Material (trä, metall, glas, keramik, textil, etc.)',
      'technique': '🔨 Tillverkningsteknik (handgjord, gjuten, målad, etc.)',
      'period': '📅 Tidsperiod eller årtal',
      'measurements': '📏 Mått (längd x bredd x höjd)',
      'specific_damage': '🔍 Specifika skador eller defekter',
      'wear_details': '👀 Detaljer om slitage och användning',
      'condition_details': '🔎 Mer detaljerad skickbeskrivning',
      'bruksslitage_vague': '⚠️ "Bruksslitage" är för vagt - specificera typ av skador',
      'vague_condition_terms': '📋 Vaga konditionstermer - beskriv specifika skador och placering',
      'critical_quality': '⚠️ Grundläggande objektinformation',
      'artist_verification': '👨‍🎨 Verifiering av konstnärsinformation och aktiv period'
    };
    
    const dialog = document.createElement('div');
    dialog.className = 'ai-info-request-dialog';
    dialog.innerHTML = `
      <div class="dialog-overlay"></div>
      <div class="dialog-content">
        <h3>🤖 Behöver mer information för ${fieldName}</h3>
        <p>För att undvika felaktiga uppgifter behöver AI:n mer detaljerad information innan ${fieldName} kan förbättras säkert.</p>
        
        <div class="missing-info">
          <h4>Lägg till information om:</h4>
          <ul>
            ${missingInfo.map(info => `<li>${infoMessages[info] || info}</li>`).join('')}
          </ul>
        </div>
        
        ${this.getFieldSpecificTips(fieldType, data)}
        
        <div class="dialog-buttons">
          <button class="btn btn-link" id="cancel-field-dialog">Avbryt</button>
          <button class="btn btn-default" id="continue-anyway">Fortsätt ändå</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    // Handle button clicks
    document.getElementById('cancel-field-dialog').addEventListener('click', () => {
      dialog.remove();
    });
    
    document.getElementById('continue-anyway').addEventListener('click', () => {
      dialog.remove();
      this.forceImproveField(fieldType);
    });
    
    // Close on background click
    dialog.querySelector('.dialog-overlay').addEventListener('click', () => {
      dialog.remove();
    });
  }

  getFieldSpecificTips(fieldType, data) {
    switch(fieldType) {
      case 'title':
        return `
          <div class="field-tips">
            <h4>💡 Tips för bättre titel:</h4>
            <p>Lägg till information i beskrivningen om material, teknik och tidsperiod så kan AI:n skapa en mer exakt titel enligt Auctionets standarder.</p>
          </div>
        `;
      case 'description':
        return `
          <div class="field-tips">
            <h4>💡 Tips för bättre beskrivning:</h4>
            <p>Inkludera mått, material, tillverkningsteknik och eventuell signering eller märkning. Detta hjälper AI:n att skapa en professionell beskrivning.</p>
          </div>
        `;
      case 'condition':
        return `
          <div class="field-tips">
            <h4>💡 Tips för bättre skickbeskrivning:</h4>
            <p><strong>Undvik vaga termer som "bruksslitage".</strong> Beskriv istället:</p>
            <ul style="margin: 8px 0; padding-left: 20px;">
              <li><strong>Typ av skada:</strong> repor, nagg, sprickor, fläckar, missfärgningar</li>
              <li><strong>Placering:</strong> "vid foten", "på ovansidan", "längs kanten"</li>
              <li><strong>Omfattning:</strong> "mindre", "flera", "genomgående", "ytliga"</li>
              <li><strong>Exempel:</strong> "Mindre repor på ovansidan. Nagg vid fot. Spricka 2cm i glasyr."</li>
            </ul>
          </div>
        `;
      case 'keywords':
        return `
          <div class="field-tips">
            <h4>💡 Tips för bättre nyckelord:</h4>
            <p>Mer detaljerad information i titel och beskrivning hjälper AI:n att generera relevanta sökord som inte bara upprepar befintlig text.</p>
          </div>
        `;
      case 'all':
        return `
          <div class="field-tips">
            <h4>💡 Tips för bättre katalogisering:</h4>
            <p>Lägg till mer specifik information i beskrivningen så kan AI:n förbättra alla fält mer exakt och undvika att gissa.</p>
          </div>
        `;
      default:
        return '';
    }
  }

  async forceImproveField(fieldType) {
    // Bypass quality checks and improve anyway
    const itemData = this.extractItemData();
    
    if (fieldType === 'all') {
      // For "Förbättra alla" - use existing logic
      this.showLoadingIndicator('all');
      
      try {
        const improvements = await this.callClaudeAPI(itemData, 'all-sparse');
        this.applyAllImprovements(improvements);
      } catch (error) {
        this.showErrorIndicator('all', error.message);
      }
      return;
    }
    
    // For individual fields
    this.showLoadingIndicator(fieldType);
    
    try {
      const improved = await this.callClaudeAPI(itemData, fieldType);
      console.log('Forced improved result for', fieldType, ':', improved);
      
      const value = improved[fieldType];
      if (value) {
        this.applyImprovement(fieldType, value);
        this.showSuccessIndicator(fieldType);
        
        // Re-analyze quality after improvement (with delay to ensure DOM is updated)
        console.log('Re-analyzing quality after force field improvement...');
        setTimeout(() => {
          console.log('Delayed quality analysis for force field...');
          this.analyzeQuality();
        }, 500);
      } else {
        throw new Error(`No ${fieldType} value in response`);
      }
    } catch (error) {
      console.error('Error improving field:', error);
      this.showErrorIndicator(fieldType, error.message);
    }
  }

  applyAllImprovements(improvements) {
    if (improvements.title) {
      this.applyImprovement('title', improvements.title);
    }
    if (improvements.description) {
      this.applyImprovement('description', improvements.description);
    }
    if (improvements.condition) {
      this.applyImprovement('condition', improvements.condition);
    }
    if (improvements.keywords) {
      this.applyImprovement('keywords', improvements.keywords);
    }
    
    this.showSuccessIndicator('all');
    setTimeout(() => {
      console.log('Delayed quality analysis after applyAllImprovements...');
      this.analyzeQuality();
    }, 500);
  }

  extractItemData() {
    const data = {
      category: document.querySelector('#item_category_id option:checked')?.textContent || '',
      title: document.querySelector('#item_title_sv')?.value || '',
      description: document.querySelector('#item_description_sv')?.value || '',
      condition: document.querySelector('#item_condition_sv')?.value || '',
      artist: document.querySelector('#item_artist_name_sv')?.value || '',
      keywords: document.querySelector('#item_hidden_keywords')?.value || '',
      estimate: document.querySelector('#item_current_auction_attributes_estimate')?.value || '',
      reserve: document.querySelector('#item_current_auction_attributes_reserve')?.value || ''
    };
    
    // Debug logging for keywords extraction
    console.log('extractItemData keywords debug:', {
      keywordsRaw: data.keywords,
      keywordsLength: data.keywords.length,
      keywordsElement: document.querySelector('#item_hidden_keywords'),
      elementValue: document.querySelector('#item_hidden_keywords')?.value
    });
    
    return data;
  }

  async callClaudeAPI(itemData, fieldType, retryCount = 0) {
    // Check if API key is available
    if (!this.apiKey) {
      throw new Error('API key not configured. Please set your Anthropic API key in the extension popup.');
    }

    const systemPrompt = this.getSystemPrompt();
    const userPrompt = this.getUserPrompt(itemData, fieldType);

    try {
      // Use background script to make API call to avoid CORS issues
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiKey,
          body: {
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1500,
            temperature: 0.1,
            system: systemPrompt,
            messages: [{
              role: 'user',
              content: userPrompt
            }]
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.success) {
            resolve(response);
          } else {
            reject(new Error(response.error || 'API request failed'));
          }
        });
      });
      
      return await this.processAPIResponse(response, systemPrompt, userPrompt, fieldType);
      
    } catch (error) {
      // Handle rate limiting and overload errors with retry
      if ((error.message.includes('Overloaded') || error.message.includes('rate limit') || error.message.includes('429')) && retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
        console.log(`API overloaded, retrying in ${delay}ms (attempt ${retryCount + 1}/3)`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.callClaudeAPI(itemData, fieldType, retryCount + 1);
      }
      
      // If it's an overload error and we've exhausted retries, provide helpful message
      if (error.message.includes('Overloaded')) {
        throw new Error('Claude API är överbelastad just nu. Vänta en stund och försök igen.');
      }
      
      throw error;
    }
  }

  async processAPIResponse(response, systemPrompt, userPrompt, fieldType) {

    const data = response.data;
    console.log('Received API response:', data);
    
    // Validate response structure
    if (!data || !data.content || !Array.isArray(data.content) || data.content.length === 0) {
      throw new Error('Invalid response format from API');
    }
    
    if (!data.content[0] || !data.content[0].text) {
      throw new Error('No text content in API response');
    }
    
    let result = this.parseClaudeResponse(data.content[0].text, fieldType);
    
    // If validation failed, retry with correction instructions (only for multi-field requests)
    if (result.needsCorrection && ['all', 'all-enhanced', 'all-sparse'].includes(fieldType)) {
      const correctionPrompt = `
De föregående förslagen klarade inte kvalitetskontrollen:
Poäng: ${result.validationScore}/100

FEL SOM MÅSTE RÄTTAS:
${result.validationErrors.join('\n')}

FÖRBÄTTRINGSFÖRSLAG:
${result.validationWarnings.join('\n')}

Vänligen korrigera dessa problem och returnera förbättrade versioner som följer alla svenska auktionsstandarder.
`;
      
      const correctionResponse = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiKey,
          body: {
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1500,
            temperature: 0.1,
            system: systemPrompt,
            messages: [
              { role: 'user', content: userPrompt },
              { role: 'assistant', content: data.content[0].text },
              { role: 'user', content: correctionPrompt }
            ]
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.success) {
            resolve(response);
          } else {
            reject(new Error(response.error || 'API request failed'));
          }
        });
      });
      
      if (correctionResponse.success) {
        const correctionData = correctionResponse.data;
        console.log('Received correction response:', correctionData);
        
        // Validate correction response structure
        if (correctionData && correctionData.content && correctionData.content[0] && correctionData.content[0].text) {
          result = this.parseClaudeResponse(correctionData.content[0].text, fieldType);
        } else {
          console.warn('Invalid correction response format, using original result');
        }
      }
    }
    
    return result;
  }

  getSystemPrompt() {
    return `Du är en professionell auktionskatalogiserare. Skapa objektiva, faktabaserade katalogiseringar enligt svenska auktionsstandarder.

GRUNDREGLER:
• Använd endast verifierbara fakta
• Skriv objektivt utan säljande språk
• Använd etablerad auktionsterminologi
• UPPFINN ALDRIG information som inte finns

FÖRBJUDET:
• Säljande uttryck: "vacker", "fantastisk", "unik", "sällsynt"
• Meta-kommentarer: "ytterligare uppgifter behövs", "mer information krävs"
• Spekulationer och gissningar

TITELFORMAT (max 60 tecken):
Om konstnär-fält tomt: [KONSTNÄR], [Föremål], [Material], [Period]
Om konstnär-fält ifyllt: [Föremål], [Material], [Period]

OSÄKERHETSMARKÖRER - BEHÅLL ALLTID:
"troligen", "tillskriven", "efter", "stil av", "möjligen"

KONDITION - KRITISKA REGLER:
• Använd korta, faktabaserade termer: "Välbevarat", "Mindre repor", "Nagg vid kanter"
• UPPFINN ALDRIG nya skador, placeringar eller detaljer
• Om original säger "repor" - skriv INTE "repor i metallramen" eller "repor på ytan"
• Lägg ALDRIG till specifika platser som "i metallramen", "på ovansidan", "vid foten"
• Förbättra ENDAST språket - lägg INTE till nya faktauppgifter

STRIKT ANTI-HALLUCINATION:
• Förbättra ENDAST språk och struktur av BEFINTLIG information
• Lägg INTE till material, mått, skador, placeringar som inte är nämnda
• Kopiera EXAKT samma skadeinformation som redan finns
• Katalogtext ska vara FÄRDIG utan önskemål om mer data
• ALDRIG lägga till detaljer för att "förbättra" - bara förbättra språket`;
  }

  getUserPrompt(itemData, fieldType) {
    const baseInfo = `
FÖREMÅLSINFORMATION:
Kategori: ${itemData.category}
Nuvarande titel: ${itemData.title}
Nuvarande beskrivning: ${itemData.description}
Kondition: ${itemData.condition}
Konstnär/Formgivare: ${itemData.artist}
Värdering: ${itemData.estimate} SEK

VIKTIGT FÖR TITEL: ${itemData.artist ? 
  'Konstnär/formgivare-fältet är ifyllt (' + itemData.artist + '), så inkludera INTE konstnärens namn i titeln - det läggs till automatiskt av systemet.' : 
  'Konstnär/formgivare-fältet är tomt, så inkludera konstnärens namn i titeln om det är känt.'}

KONSTNÄRSINFORMATION FÖR TIDSPERIOD:
${itemData.artist ? 
  'Konstnär/formgivare: ' + itemData.artist + ' - Använd din kunskap om denna konstnärs aktiva period för att bestämma korrekt tidsperiod. Om du inte är säker, använd "troligen" eller utelämna period.' : 
  'Ingen konstnär angiven - lägg INTE till tidsperiod om den inte redan finns i källdata.'}

KRITISKT - BEHÅLL OSÄKERHETSMARKÖRER I TITEL:
Om nuvarande titel innehåller ord som "troligen", "tillskriven", "efter", "stil av", "möjligen", "typ" - BEHÅLL dessa exakt. De anger juridisk osäkerhet och får ALDRIG tas bort eller ändras.

ANTI-HALLUCINATION INSTRUKTIONER:
• Lägg ALDRIG till information som inte finns i källdata
• Uppfinn ALDRIG tidsperioder, material, mått eller skador
• Förbättra ENDAST språk, struktur och terminologi
• Om information saknas - utelämna eller använd osäkerhetsmarkörer
`;

    if (fieldType === 'all') {
      return baseInfo + `
UPPGIFT: Förbättra titel, beskrivning, konditionsrapport och generera dolda sökord enligt svenska auktionsstandarder.

KRITISKT - FÄLTAVGRÄNSNING:
• BESKRIVNING: Material, teknik, mått, stil, ursprung, märkningar, funktion - ALDRIG konditionsinformation
• KONDITION: Endast fysiskt skick och skador - ALDRIG beskrivande information
• Håll fälten strikt separerade - konditionsdetaljer som "slitage", "repor", "märken" hör ENDAST i konditionsfältet
• Om konditionsinformation finns i nuvarande beskrivning - flytta den till konditionsfältet

KRITISKT - ANTI-HALLUCINATION REGLER:
• Lägg ALDRIG till information som inte finns i källdata
• Uppfinn INTE tidsperioder, material, mått eller skador
• Använd konstnärsinformation för tidsperiod ENDAST om du är säker
• Förbättra ENDAST språk, struktur och terminologi av befintlig information
• Lägg ALDRIG till kommentarer om vad som "behövs", "saknas" eller "krävs"
• Skriv INTE fraser som "ytterligare uppgifter behövs" eller "mer information krävs"
• Katalogtext ska vara FÄRDIG och KOMPLETT utan önskemål om mer data

Returnera EXAKT i detta format (en rad per fält):
TITEL: [förbättrad titel]
BESKRIVNING: [förbättrad beskrivning utan konditionsinformation]
KONDITION: [förbättrad konditionsrapport]
SÖKORD: [relevanta sökord separerade med mellanslag, använd "-" för flerordsfraser]
VALIDERING: [kvalitetspoäng och eventuella varningar]

VIKTIGT FÖR SÖKORD: Använd kommatecken för att separera sökord.
EXEMPEL: "konstglas, mundblåst, svensk design, 1960-tal, samlarobjekt"

Använd INTE markdown formatering eller extra tecken som ** eller ***. Skriv bara ren text.`;
    } else if (fieldType === 'all-enhanced' && itemData.additionalInfo) {
      return baseInfo + `
YTTERLIGARE INFORMATION:
Material: ${itemData.additionalInfo.material}
Teknik: ${itemData.additionalInfo.technique}
Märkningar: ${itemData.additionalInfo.markings}
Specifika skador: ${itemData.additionalInfo.damage}
Övrigt: ${itemData.additionalInfo.additional}

UPPGIFT: Använd all tillgänglig information för att skapa professionell katalogisering.

ANTI-HALLUCINATION REGLER:
• Använd ENDAST den information som angivits ovan
• Lägg INTE till ytterligare detaljer som inte är nämnda
• Kombinera källdata med tilläggsinfo på ett faktabaserat sätt
• Lägg ALDRIG till kommentarer om vad som "behövs" eller "saknas"
• Katalogtext ska vara FÄRDIG och KOMPLETT

Returnera EXAKT i detta format (en rad per fält):
TITEL: [förbättrad titel med korrekt material]
BESKRIVNING: [detaljerad beskrivning med all relevant information]
KONDITION: [specifik konditionsrapport baserad på angiven information]
SÖKORD: [omfattande sökord baserade på all information]
VALIDERING: [kvalitetspoäng och förbättringar]

Använd INTE markdown formatering eller extra tecken som ** eller ***. Skriv bara ren text.`;
    } else if (fieldType === 'all-sparse') {
      return baseInfo + `
UPPGIFT: Informationen är mycket knapphändig. Gör ditt bästa för att förbättra baserat på tillgänglig information, men markera var mer information behövs.

KRITISKT - SPARSE DATA REGLER:
• Förbättra ENDAST språk och struktur av befintlig information
• Lägg ALDRIG till påhittade detaljer för att fylla ut texten
• Om information saknas - lämna tomt eller använd osäkerhetsmarkörer
• Lägg ALDRIG till kommentarer om vad som "behövs" eller "saknas" i katalogtext
• Katalogtext ska vara FÄRDIG och KOMPLETT utan önskemål om mer data

Returnera EXAKT i detta format (en rad per fält):
TITEL: [förbättrad titel]
BESKRIVNING: [förbättrad beskrivning]
KONDITION: [förbättrad konditionsrapport]
SÖKORD: [generera så många relevanta sökord som möjligt]
VALIDERING: [kvalitetspoäng och eventuella varningar]

Använd INTE markdown formatering eller extra tecken som ** eller ***. Skriv bara ren text.`;
    } else if (fieldType === 'title') {
      return baseInfo + `
UPPGIFT: Förbättra endast titeln enligt svenska auktionsstandarder. Max 60 tecken.

KRITISKT VIKTIGT - BEHÅLL OSÄKERHETSMARKÖRER:
Om originaltiteln innehåller "troligen", "tillskriven", "efter", "stil av", "möjligen", "typ", "skola av", eller "krets kring" - BEHÅLL dessa ord exakt som de är. De anger juridisk osäkerhet och får ALDRIG tas bort.

ANTI-HALLUCINATION FÖR TITEL:
• Lägg INTE till tidsperiod om den inte finns i originaldata ELLER kan härledas från känd konstnär
• Lägg INTE till material som inte är nämnt
• Lägg INTE till platser eller tillverkare som inte är angivna
• Förbättra ENDAST struktur, stavning och terminologi

EXEMPEL:
Original: "TALLRIK, fajans, troligen Matet, Martres-Tolosane, Frankrike, 18/1900-tal"
Korrekt: "TALLRIK, fajans, troligen Matet, Martres-Tolosane, 18/1900-tal"
FEL: "TALLRIK, fajans, Matet, Martres-Tolosane, 18/1900-tal" (troligen borttaget)

Returnera ENDAST den förbättrade titeln utan extra formatering eller etiketter.`;
    } else if (fieldType === 'description') {
      return baseInfo + `
UPPGIFT: Förbättra endast beskrivningen. Inkludera mått om de finns, använd korrekt terminologi.

KRITISKT - FÄLTAVGRÄNSNING FÖR BESKRIVNING:
• Inkludera ALDRIG konditionsinformation i beskrivningen
• Konditionsdetaljer som "slitage", "repor", "märken", "skador", "nagg", "sprickor", "fläckar" hör ENDAST hemma i konditionsfältet
• Beskrivningen ska fokusera på: material, teknik, mått, stil, ursprung, märkningar, funktion
• EXEMPEL PÅ FÖRBJUDET I BESKRIVNING: "Slitage förekommer", "repor och märken", "normalt åldersslitage", "mindre skador"
• Om konditionsinformation finns i nuvarande beskrivning - TA BORT den och behåll endast beskrivande information

ANTI-HALLUCINATION FÖR BESKRIVNING:
• Lägg INTE till mått som inte är angivna
• Lägg INTE till material som inte är nämnt
• Lägg INTE till tekniker som inte är beskrivna
• Lägg INTE till märkningar eller signaturer som inte finns
• Förbättra ENDAST språk, struktur och befintlig information
• Lägg ALDRIG till kommentarer om vad som "saknas" eller "behövs"
• Skriv INTE fraser som "ytterligare uppgifter behövs" eller "information saknas"

Returnera ENDAST den förbättrade beskrivningen utan extra formatering eller etiketter.`;
    } else if (fieldType === 'condition') {
      return baseInfo + `
UPPGIFT: Förbättra konditionsrapporten. Skriv KORT och FAKTABASERAT. Använd endast standardtermer. Max 2-3 korta meningar.

KRITISKT - FÄLTAVGRÄNSNING FÖR KONDITION:
• Fokusera ENDAST på fysiskt skick och skador
• Inkludera ALDRIG beskrivande information om material, teknik, stil eller funktion
• Konditionsrapporten ska vara separat från beskrivningen
• Använd specifika konditionstermer: "repor", "nagg", "sprickor", "fläckar", "välbevarat", "mindre skador"
• UNDVIK vaga termer som endast "bruksslitage" - var specifik

KRITISKT - ANTI-HALLUCINATION FÖR KONDITION:
• Beskriv ENDAST skador/slitage som redan är nämnda i nuvarande kondition
• Lägg ALDRIG till specifika placeringar som "i metallramen", "på ovansidan", "vid foten" om inte redan angivet
• Lägg ALDRIG till specifika mått som "repor 3cm" om inte angivet
• Lägg ALDRIG till nya defekter, material eller delar som inte nämns
• Lägg ALDRIG till detaljer om VAR skadorna finns om det inte redan står i originalet
• EXEMPEL PÅ FÖRBJUDET: Om original säger "repor" - skriv INTE "repor i metallramen" eller "repor på ytan"
• Förbättra ENDAST språk och använd standardtermer för EXAKT samma information som redan finns
• Om originalet säger "bruksslitage" - förbättra till "normalt bruksslitage" eller "synligt bruksslitage", INTE "repor och märken"
• Lägg ALDRIG till kommentarer om vad som "behövs" eller "saknas"
• Skriv INTE fraser som "ytterligare uppgifter behövs" eller "mer information krävs"

STRIKT REGEL: Kopiera ENDAST den skadeinformation som redan finns - lägg ALDRIG till nya detaljer.

EXEMPEL PÅ KORREKT FÖRBÄTTRING:
Original: "bruksslitage" → Förbättrat: "Normalt bruksslitage"
Original: "repor" → Förbättrat: "Mindre repor" (INTE "repor i metallramen")
Original: "slitage förekommer" → Förbättrat: "Synligt slitage"

UNDVIK: Långa beskrivningar, förklaringar av tillverkningstekniker, värderande kommentarer, påhittade skador, specifika placeringar.

Returnera ENDAST den förbättrade konditionsrapporten utan extra formatering eller etiketter.`;
    } else if (fieldType === 'keywords') {
      return baseInfo + `
UPPGIFT: Generera HÖGKVALITATIVA dolda sökord som hjälper köpare hitta föremålet.

KRITISKT - SÖKORD FORMAT:
• Separera sökord med KOMMATECKEN
• EXEMPEL PÅ KORREKT FORMAT: "glaskonst, mundblåst, svensk design, 1960-tal, samlarobjekt, skandinavisk form"

REGLER FÖR SÖKORD:
• MAX 10-12 sökord totalt
• Prioritera termer som INTE redan finns i titel/beskrivning
• Inkludera: alternativa namn, tekniska termer, stilperioder, användningsområden
• Undvik upprepningar och synonymer som är för lika
• Fokusera på vad köpare faktiskt söker efter

EXEMPEL PÅ BRA SÖKORD (för en vas):
"glaskonst, mundblåst, konstglas, dekorativ, skandinavisk design, 1960-tal, samlarobjekt"

UNDVIK: Långa listor, upprepningar, för allmänna termer som "vacker", "fin", "kvalitet"

Returnera ENDAST sökorden separerade med kommatecken, utan extra formatering eller etiketter.`;
    }
  }

  parseClaudeResponse(response, fieldType) {
    console.log('Parsing Claude response for fieldType:', fieldType, 'Response:', response);
    
    // Validate input
    if (!response || typeof response !== 'string') {
      console.error('Invalid response format:', response);
      throw new Error('Invalid response format from Claude');
    }
    
    // For single field requests, parse the structured response
    if (['title', 'description', 'condition', 'keywords'].includes(fieldType)) {
      const result = {};
      const lines = response.split('\n');
      
      lines.forEach(line => {
        const trimmedLine = line.trim();
        
        if (trimmedLine.match(/^\*?\*?TITEL\s*:?\*?\*?\s*/i)) {
          result.title = trimmedLine.replace(/^\*?\*?TITEL\s*:?\*?\*?\s*/i, '').trim();
        } else if (trimmedLine.match(/^\*?\*?BESKRIVNING\s*:?\*?\*?\s*/i)) {
          result.description = trimmedLine.replace(/^\*?\*?BESKRIVNING\s*:?\*?\*?\s*/i, '').trim();
        } else if (trimmedLine.match(/^\*?\*?KONDITION\s*:?\*?\*?\s*/i)) {
          result.condition = trimmedLine.replace(/^\*?\*?KONDITION\s*:?\*?\*?\s*/i, '').trim();
        } else if (trimmedLine.match(/^\*?\*?SÖKORD\s*:?\*?\*?\s*/i)) {
          result.keywords = trimmedLine.replace(/^\*?\*?SÖKORD\s*:?\*?\*?\s*/i, '').trim();
        }
      });
      
      // If no structured response found, treat as legacy format
      if (Object.keys(result).length === 0) {
        result[fieldType] = response.trim();
      }
      
      console.log('Single field parsed result:', result);
      return result;
    }
    
    // Parse the structured response from Claude for multi-field requests
    const result = {};
    const lines = response.split('\n');
    
    lines.forEach(line => {
      const trimmedLine = line.trim();
      
      // Handle different formats: "TITEL:", "**TITEL:**", "**TITEL (XX tecken):**"
      if (trimmedLine.match(/^\*?\*?TITEL(\s*\([^)]*\))?\s*:?\*?\*?\s*/i)) {
        result.title = trimmedLine.replace(/^\*?\*?TITEL(\s*\([^)]*\))?\s*:?\*?\*?\s*/i, '').trim();
      } else if (trimmedLine.match(/^\*?\*?BESKRIVNING\s*:?\*?\*?\s*/i)) {
        result.description = trimmedLine.replace(/^\*?\*?BESKRIVNING\s*:?\*?\*?\s*/i, '').trim();
      } else if (trimmedLine.match(/^\*?\*?KONDITION(SRAPPORT)?\s*:?\*?\*?\s*/i)) {
        result.condition = trimmedLine.replace(/^\*?\*?KONDITION(SRAPPORT)?\s*:?\*?\*?\s*/i, '').trim();
      } else if (trimmedLine.match(/^\*?\*?SÖKORD\s*:?\*?\*?\s*/i)) {
        result.keywords = trimmedLine.replace(/^\*?\*?SÖKORD\s*:?\*?\*?\s*/i, '').trim();
      } else if (trimmedLine.match(/^\*?\*?VALIDERING\s*:?\*?\*?\s*/i)) {
        result.validation = trimmedLine.replace(/^\*?\*?VALIDERING\s*:?\*?\*?\s*/i, '').trim();
      }
      
      // Handle simple formats (legacy)
      else if (trimmedLine.startsWith('TITEL:')) {
        result.title = trimmedLine.substring(6).trim();
      } else if (trimmedLine.startsWith('BESKRIVNING:')) {
        result.description = trimmedLine.substring(12).trim();
      } else if (trimmedLine.startsWith('KONDITION:')) {
        result.condition = trimmedLine.substring(10).trim();
      } else if (trimmedLine.startsWith('SÖKORD:')) {
        result.keywords = trimmedLine.substring(7).trim();
      } else if (trimmedLine.startsWith('VALIDERING:')) {
        result.validation = trimmedLine.substring(11).trim();
      }
    });
    
    // If we only got a simple response (like just a title), handle it appropriately
    if (Object.keys(result).length === 0 && response.trim().length > 0) {
      // Assume it's a single field response based on the request type
      result.title = response.trim();
    }
    
    console.log('Multi-field parsed result:', result);
    
    // Validate the response against Swedish auction standards
    const validation = this.validateSwedishAuctionStandards(result);
    
    // If validation fails, retry once with corrections
    if (validation.score < 70) {
      result.needsCorrection = true;
      result.validationErrors = validation.errors;
      result.validationWarnings = validation.warnings;
      result.validationScore = validation.score;
    }
    
    return result;
  }

  applyImprovement(fieldType, value) {
    const fieldMap = {
      'title': '#item_title_sv',
      'description': '#item_description_sv',
      'condition': '#item_condition_sv',
      'keywords': '#item_hidden_keywords'
    };
    
    const field = document.querySelector(fieldMap[fieldType]);
    if (field && value) {
      // Store original value
      field.dataset.originalValue = field.value;
      
      // Validate and limit keywords if necessary
      let finalValue = value;
      if (fieldType === 'keywords') {
        finalValue = this.validateAndLimitKeywords(value);
      }
      
      // Apply new value with animation
      field.classList.add('ai-updated');
      field.value = finalValue;
      
      // Trigger change event
      field.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Add undo button
      this.addUndoButton(field);
      
      // Track AI enhancement in internal comments
      this.addAIEnhancementNote(fieldType);
    } else {
      console.warn(`Could not apply improvement for ${fieldType}:`, { field: !!field, value });
    }
  }

  validateAndLimitKeywords(keywords) {
    if (!keywords || typeof keywords !== 'string') {
      return keywords;
    }
    
    // Support both formats: detect if comma-separated or space-separated
    let keywordArray;
    if (keywords.includes(',')) {
      // Comma-separated format - convert to Auctionet format
      keywordArray = keywords.split(',')
        .map(kw => kw.trim())
        .filter(kw => kw.length > 0)
        .filter(kw => kw.length >= 3)
        .map(kw => kw.replace(/\s+/g, '-')); // Convert spaces to hyphens
    } else {
      // Already in Auctionet space-separated format
      keywordArray = keywords.split(/\s+/)
        .map(kw => kw.trim())
        .filter(kw => kw.length > 0)
        .filter(kw => kw.length >= 3);
    }
    
    // If too many keywords, keep only the first 12 (most relevant ones)
    if (keywordArray.length > 12) {
      console.warn(`Too many keywords (${keywordArray.length}), limiting to 12`);
      const limitedKeywords = keywordArray.slice(0, 12);
      return limitedKeywords.join(' '); // Auctionet space-separated format
    }
    
    return keywordArray.join(' '); // Auctionet space-separated format
  }

  addAIEnhancementNote(fieldType) {
    const internalCommentsField = document.querySelector('#item_internal_comment');
    if (internalCommentsField) {
      const currentComments = internalCommentsField.value;
      const timestamp = new Date().toLocaleDateString('sv-SE');
      const fieldNames = {
        'title': 'titel',
        'description': 'beskrivning', 
        'condition': 'kondition',
        'keywords': 'sökord'
      };
      
      const enhancementNote = `AI-förbättring ${fieldNames[fieldType]} (${timestamp})`;
      
      // Check if this enhancement is already noted
      if (!currentComments.includes(enhancementNote)) {
        const newComments = currentComments ? 
          `${currentComments}\n${enhancementNote}` : 
          enhancementNote;
        internalCommentsField.value = newComments;
      }
    }
  }

  addUndoButton(field) {
    const existingUndo = field.parentElement.querySelector('.ai-undo-button');
    if (existingUndo) {
      existingUndo.remove();
    }
    
    const undoButton = document.createElement('button');
    undoButton.className = 'ai-undo-button';
    undoButton.textContent = '↩ Ångra';
    undoButton.type = 'button';
    
    undoButton.addEventListener('click', () => {
      field.value = field.dataset.originalValue;
      field.classList.remove('ai-updated');
      undoButton.remove();
    });
    
    field.parentElement.appendChild(undoButton);
  }





  getEncouragingMessage(fieldType) {
    const messages = {
      all: [
        "🤖 AI förbättrar alla fält - snart är katalogiseringen perfekt!",
        "✨ Magisk AI-förbättring pågår - detta blir fantastiskt!",
        "🚀 AI arbetar hårt för att göra din katalogisering professionell!",
        "🎯 Snart har du en katalogisering i världsklass!",
        "💫 AI polerar texterna till perfektion - nästan klart!",
        "🔥 Kraftfull AI-analys pågår - resultatet blir imponerande!"
      ],
      title: [
        "🎨 AI skapar en perfekt titel...",
        "✍️ Formulerar en professionell titel...",
        "🏷️ AI optimerar titeln för bästa resultat...",
        "📝 Skapar en titel som säljare kommer älska..."
      ],
      description: [
        "📖 AI skriver en detaljerad beskrivning...",
        "🔍 Analyserar och förbättrar beskrivningen...",
        "📋 AI skapar en professionell beskrivning...",
        "✨ Polerar beskrivningen till perfektion..."
      ],
      condition: [
        "🔧 AI analyserar konditionsrapporten...",
        "🔍 Förbättrar konditionsbeskrivningen...",
        "📊 AI skapar en noggrann konditionsrapport...",
        "✅ Optimerar konditionstexten..."
      ],
      keywords: [
        "🔍 AI genererar smarta sökord...",
        "🏷️ Skapar relevanta nyckelord...",
        "📈 AI optimerar sökbarheten...",
        "🎯 Genererar träffsäkra sökord..."
      ]
    };
    
    const messageArray = messages[fieldType] || messages.all;
    return messageArray[Math.floor(Math.random() * messageArray.length)];
  }

  showLoadingIndicator(fieldType) {
    // Add loading spinner with encouraging message
    const indicators = document.querySelectorAll('.ai-status-indicator');
    indicators.forEach(ind => ind.remove());
    
    const indicator = document.createElement('div');
    indicator.className = 'ai-status-indicator loading';
    
    const message = this.getEncouragingMessage(fieldType);
    indicator.innerHTML = `
      <div class="loading-content">
        <div class="spinner"></div>
        <span class="loading-text">${message}</span>
      </div>
    `;
    
    // Add CSS for spinner and loading animation
    if (!document.getElementById('loading-indicator-styles')) {
      const style = document.createElement('style');
      style.id = 'loading-indicator-styles';
      style.textContent = `
        .ai-status-indicator.loading {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 12px 16px;
          border-radius: 8px;
          margin: 8px 0;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          animation: pulse 2s infinite;
        }
        
        .loading-content {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top: 2px solid white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        .loading-text {
          font-weight: 500;
          font-size: 14px;
          flex: 1;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        
        .ai-status-indicator.success {
          background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
          color: white;
          padding: 12px 16px;
          border-radius: 8px;
          margin: 8px 0;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          animation: successPulse 0.6s ease-out;
        }
        
        .ai-status-indicator.error {
          background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
          color: white;
          padding: 12px 16px;
          border-radius: 8px;
          margin: 8px 0;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        
        @keyframes successPulse {
          0% { transform: scale(0.95); opacity: 0.8; }
          50% { transform: scale(1.02); }
          100% { transform: scale(1); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }
    
    let targetElement = null;
    
    if (fieldType === 'all') {
      const masterButton = document.querySelector('.ai-master-button');
      if (masterButton && masterButton.parentElement) {
        targetElement = masterButton.parentElement;
      }
    } else {
      const button = document.querySelector(`[data-field-type="${fieldType}"]`);
      if (button && button.parentElement) {
        targetElement = button.parentElement;
      }
    }
    
    if (targetElement) {
      targetElement.appendChild(indicator);
    } else {
      console.warn('Could not find target element for loading indicator:', fieldType);
    }
  }

  getSuccessMessage(fieldType) {
    const messages = {
      all: [
        "🎉 Fantastiskt! Alla fält är nu professionellt förbättrade!",
        "✨ Perfekt! Din katalogisering är nu i toppklass!",
        "🚀 Utmärkt! AI har gjort din katalogisering helt professionell!",
        "🏆 Bravo! Nu har du en katalogisering som imponerar!",
        "💫 Magnifikt! Alla texter är nu optimerade för bästa resultat!"
      ],
      title: [
        "🎯 Perfekt titel skapad!",
        "✨ Titeln är nu professionell!",
        "🏷️ Fantastisk titel genererad!",
        "📝 Titeln förbättrad till perfektion!"
      ],
      description: [
        "📖 Beskrivningen är nu detaljerad och professionell!",
        "✨ Fantastisk beskrivning skapad!",
        "📋 Beskrivningen förbättrad till perfektion!",
        "🔍 Utmärkt beskrivning genererad!"
      ],
      condition: [
        "🔧 Konditionsrapporten är nu professionell!",
        "✅ Perfekt konditionsbeskrivning skapad!",
        "📊 Konditionsrapporten förbättrad!",
        "🔍 Utmärkt konditionsanalys genererad!"
      ],
      keywords: [
        "🔍 Smarta sökord genererade!",
        "🏷️ Perfekta nyckelord skapade!",
        "📈 Sökbarheten optimerad!",
        "🎯 Träffsäkra sökord genererade!"
      ]
    };
    
    const messageArray = messages[fieldType] || messages.all;
    return messageArray[Math.floor(Math.random() * messageArray.length)];
  }

  showSuccessIndicator(fieldType) {
    const indicator = document.querySelector('.ai-status-indicator');
    if (indicator) {
      indicator.className = 'ai-status-indicator success';
      indicator.innerHTML = `
        <div class="success-content">
          <span class="success-icon">✓</span>
          <span class="success-text">${this.getSuccessMessage(fieldType)}</span>
        </div>
      `;
      
      // Add CSS for success indicator if not already added
      if (!document.getElementById('success-indicator-styles')) {
        const style = document.createElement('style');
        style.id = 'success-indicator-styles';
        style.textContent = `
          .success-content {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          
          .success-icon {
            font-size: 18px;
            font-weight: bold;
          }
          
          .success-text {
            font-weight: 500;
            font-size: 14px;
            flex: 1;
          }
        `;
        document.head.appendChild(style);
      }
      
      setTimeout(() => indicator.remove(), 4000); // Show success message a bit longer
    }
  }

  showErrorIndicator(fieldType, error) {
    let indicator = document.querySelector('.ai-status-indicator');
    
    if (!indicator) {
      // Create indicator if it doesn't exist
      indicator = document.createElement('div');
      indicator.className = 'ai-status-indicator error';
      indicator.textContent = `✗ Fel: ${error}`;
      
      let targetElement = null;
      
      if (fieldType === 'all') {
        const masterButton = document.querySelector('.ai-master-button');
        if (masterButton && masterButton.parentElement) {
          targetElement = masterButton.parentElement;
        }
      } else {
        const button = document.querySelector(`[data-field-type="${fieldType}"]`);
        if (button && button.parentElement) {
          targetElement = button.parentElement;
        }
      }
      
      if (targetElement) {
        targetElement.appendChild(indicator);
      } else {
        console.warn('Could not find target element for error indicator:', fieldType);
        // Fallback: show alert
        alert(`Error: ${error}`);
        return;
      }
    } else {
      indicator.className = 'ai-status-indicator error';
      indicator.textContent = `✗ Fel: ${error}`;
    }
    
    // Auto-remove error after 5 seconds
    setTimeout(() => {
      if (indicator && indicator.parentElement) {
        indicator.remove();
      }
    }, 5000);
  }

  // Add validation logic from quality_control.js
  validateSwedishAuctionStandards(cataloging) {
    const errors = [];
    const warnings = [];
    
    // 1. Title validation
    const titleValidation = this.validateTitle(cataloging.title);
    errors.push(...titleValidation.errors);
    warnings.push(...titleValidation.warnings);
    
    // 2. Description validation
    const descValidation = this.validateDescription(cataloging.description);
    errors.push(...descValidation.errors);
    warnings.push(...descValidation.warnings);
    
    // 3. Condition validation
    const conditionValidation = this.validateCondition(cataloging.condition);
    errors.push(...conditionValidation.errors);
    warnings.push(...conditionValidation.warnings);
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      score: this.calculateQualityScore(errors.length, warnings.length)
    };
  }

  validateTitle(title) {
    const errors = [];
    const warnings = [];
    
    // Validate input
    if (!title || typeof title !== 'string') {
      errors.push('Titel saknas eller är ogiltig');
      return { errors, warnings };
    }
    
    // Length check
    if (title.length > 60) {
      errors.push(`Titel för lång: ${title.length}/60 tecken`);
    }
    
    // Structure check
    if (!title.match(/^[A-ZÅÄÖÜ]/)) {
      warnings.push('Titel bör börja med stor bokstav');
    }
    
    // Check for uncertainty markers preservation
    const originalTitle = document.querySelector('#item_title_sv')?.value || '';
    const uncertaintyMarkers = ['troligen', 'tillskriven', 'efter', 'stil av', 'möjligen', 'typ', 'skola av', 'krets kring'];
    
    uncertaintyMarkers.forEach(marker => {
      if (originalTitle.toLowerCase().includes(marker) && !title.toLowerCase().includes(marker)) {
        errors.push(`Osäkerhetsmarkör "${marker}" får inte tas bort från titel`);
      }
    });
    
    // Forbidden marketing terms
    const marketingTerms = [
      'fantastisk', 'vacker', 'underbar', 'magnifik', 'exceptional', 'stunning',
      'rare', 'unique', 'sällsynt', 'unik', 'perfekt', 'pristine'
    ];
    
    marketingTerms.forEach(term => {
      if (title.toLowerCase().includes(term)) {
        errors.push(`Förbjuden marknadsföringsterm i titel: "${term}"`);
      }
    });
    
    // Check for proper format
    if (title.includes(',')) {
      const parts = title.split(',').map(p => p.trim());
      if (parts.length < 2) {
        warnings.push('Titel bör följa format: KONSTNÄR, Föremål, Material, Period');
      }
    }
    
    return { errors, warnings };
  }

  validateDescription(description) {
    const errors = [];
    const warnings = [];
    
    if (!description || typeof description !== 'string' || description.length < 20) {
      errors.push('Beskrivning för kort - minst 20 tecken krävs');
      return { errors, warnings };
    }
    
    // CRITICAL: Check for condition information contamination in description
    const conditionTerms = [
      'slitage', 'repor', 'märken', 'skador', 'nagg', 'sprickor', 'fläckar',
      'bruksslitage', 'åldersslitage', 'normalt slitage', 'mindre skador',
      'synligt slitage', 'välbevarat', 'skick', 'kondition'
    ];
    
    conditionTerms.forEach(term => {
      if (description.toLowerCase().includes(term)) {
        errors.push(`FÄLTFEL: Konditionsinformation "${term}" hör hemma i konditionsfältet, inte i beskrivningen`);
      }
    });
    
    // Check for measurements
    const hasMeasurements = /\d+[,.]?\d*\s*(cm|centimeter)/i.test(description);
    if (!hasMeasurements) {
      warnings.push('Mått saknas i beskrivningen');
    }
    
    // Check measurement format
    const measurementPattern = /(höjd|bredd|djup|diameter)\s+\d+/gi;
    const measurements = description.match(measurementPattern);
    if (measurements && !description.includes(' cm')) {
      warnings.push('Mått bör avslutas med "cm"');
    }
    
    // Forbidden subjective terms
    const subjectiveTerms = [
      'tror', 'anser', 'känns', 'verkar', 'skulle kunna', 'möjligen värd',
      'fantastisk', 'vacker', 'underbar', 'exceptional', 'stunning', 'gorgeous'
    ];
    
    subjectiveTerms.forEach(term => {
      if (description.toLowerCase().includes(term)) {
        errors.push(`Subjektivt språk i beskrivning: "${term}"`);
      }
    });
    
    // Check for value speculation
    const valueSpeculation = [
      'värd mycket', 'dyr', 'värdefull', 'investering', 'prisstegring'
    ];
    
    valueSpeculation.forEach(term => {
      if (description.toLowerCase().includes(term)) {
        errors.push(`Värdespekulation förbjuden: "${term}"`);
      }
    });
    
    return { errors, warnings };
  }

  validateCondition(condition) {
    const errors = [];
    const warnings = [];
    
    if (!condition || typeof condition !== 'string' || condition.length < 10) {
      errors.push('Konditionsrapport för kort');
      return { errors, warnings };
    }
    
    // CRITICAL: Check for hallucinated details by comparing with original
    const originalCondition = document.querySelector('#item_condition_sv')?.value || '';
    const hallucinationCheck = this.detectConditionHallucinations(originalCondition, condition);
    
    if (hallucinationCheck.hasHallucinations) {
      hallucinationCheck.hallucinations.forEach(hallucination => {
        errors.push(`HALLUCINATION: "${hallucination}" - denna detalj finns inte i originalet`);
      });
    }
    
    // Approved condition terms
    const approvedTerms = [
      'välbevarat', 'normalt åldersslitage', 'mindre repor', 'synligt slitage',
      'skador förekommer', 'restaurerat', 'lagningar', 'sprickor', 'nagg',
      'fläckar', 'missfärgningar', 'intakt', 'komplett', 'saknas'
    ];
    
    // Check if condition uses professional terminology
    const hasApprovedTerms = approvedTerms.some(term => 
      condition.toLowerCase().includes(term)
    );
    
    if (!hasApprovedTerms) {
      warnings.push('Använd standardtermer för konditionsrapport');
    }
    
    // Forbidden overly positive terms
    const forbiddenPositive = [
      'perfekt', 'fläckfritt', 'som nytt', 'pristine', 'mint condition',
      'flawless', 'immaculate'
    ];
    
    forbiddenPositive.forEach(term => {
      if (condition.toLowerCase().includes(term)) {
        errors.push(`Överoptimistisk konditionsbedömning: "${term}"`);
      }
    });
    
    return { errors, warnings };
  }

  detectConditionHallucinations(original, improved) {
    const hallucinations = [];
    
    if (!original || !improved) {
      return { hasHallucinations: false, hallucinations: [] };
    }
    
    const originalLower = original.toLowerCase();
    const improvedLower = improved.toLowerCase();
    
    // Common hallucinated location/material details
    const locationPatterns = [
      /i metallramen?/gi,
      /på ovansidan/gi,
      /vid foten/gi,
      /vid kanten/gi,
      /på undersidan/gi,
      /i hörnen/gi,
      /längs kanten/gi,
      /på ytan/gi,
      /i botten/gi,
      /vid handtaget/gi,
      /på locket/gi,
      /i glaset/gi,
      /i keramiken/gi,
      /i träet/gi,
      /i metallen/gi
    ];
    
    // Check for added location details
    locationPatterns.forEach(pattern => {
      const matches = improved.match(pattern);
      if (matches) {
        matches.forEach(match => {
          if (!originalLower.includes(match.toLowerCase())) {
            hallucinations.push(match);
          }
        });
      }
    });
    
    // Check for specific measurements that weren't in original
    const measurementPattern = /\d+\s*(cm|mm|centimeter|millimeter)/gi;
    const improvedMeasurements = improved.match(measurementPattern) || [];
    
    improvedMeasurements.forEach(measurement => {
      if (!originalLower.includes(measurement.toLowerCase())) {
        hallucinations.push(measurement);
      }
    });
    
    // Check for specific damage types not in original
    const damageTypes = [
      'repor', 'märken', 'nagg', 'sprickor', 'fläckar', 'skador',
      'bucklor', 'intryck', 'missfärgningar', 'rostfläckar'
    ];
    
    damageTypes.forEach(damageType => {
      if (improvedLower.includes(damageType) && !originalLower.includes(damageType)) {
        // Only flag if it's a specific addition, not a general improvement
        const specificPattern = new RegExp(`${damageType}\\s+(i|på|vid|längs)\\s+\\w+`, 'gi');
        const specificMatches = improved.match(specificPattern);
        if (specificMatches) {
          specificMatches.forEach(match => {
            if (!originalLower.includes(match.toLowerCase())) {
              hallucinations.push(match);
            }
          });
        }
      }
    });
    
    return {
      hasHallucinations: hallucinations.length > 0,
      hallucinations: [...new Set(hallucinations)] // Remove duplicates
    };
  }

  calculateQualityScore(errorCount, warningCount) {
    let score = 100;
    score -= errorCount * 20; // Major deduction for errors
    score -= warningCount * 5; // Minor deduction for warnings
    return Math.max(0, Math.min(100, score));
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new AuctionetCatalogingAssistant();
  });
} else {
  new AuctionetCatalogingAssistant();
}