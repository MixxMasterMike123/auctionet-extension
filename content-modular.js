// content-modular.js - Modular Content Script
import { UIManager } from './modules/ui-manager.js';
import { QualityAnalyzer } from './modules/quality-analyzer.js';
import { APIManager } from './modules/api-manager.js';
import { DataExtractor } from './modules/data-extractor.js';

class AuctionetCatalogingAssistant {
  constructor() {
    this.dataExtractor = new DataExtractor();
    this.apiManager = new APIManager();
    this.qualityAnalyzer = new QualityAnalyzer();
    this.uiManager = new UIManager(this.apiManager, this.qualityAnalyzer);
    
    // Set up dependencies
    this.qualityAnalyzer.setDataExtractor(this.dataExtractor);
    
    this.init();
    this.setupEventListeners();
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
    if (!this.dataExtractor.isCorrectPage()) {
      console.log('Auctionet AI Assistant: Not on an item edit page');
      return;
    }

    console.log('Auctionet AI Assistant: On correct page, proceeding with initialization');
    
    await this.apiManager.loadApiKey();
    console.log('API key loaded:', this.apiManager.apiKey ? 'Yes' : 'No');
    
    this.uiManager.injectUI();
    this.attachEventListeners();
    
    console.log('Auctionet AI Assistant: Initialization complete');
  }

  setupEventListeners() {
    // Listen for API key changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && changes.anthropicApiKey) {
        console.log('API key updated in storage');
        this.apiManager.apiKey = changes.anthropicApiKey.newValue;
      }
    });
    
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'refresh-api-key') {
        console.log('Refreshing API key from popup request');
        this.apiManager.loadApiKey();
        sendResponse({ success: true });
      } else if (request.type === 'refresh-model') {
        console.log('Refreshing model selection from popup request');
        this.apiManager.loadApiKey(); // This also loads model selection
        sendResponse({ success: true });
      }
    });
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
    if (!this.apiManager.apiKey) {
      await this.apiManager.loadApiKey();
    }
    
    // Check if API key is still missing
    if (!this.apiManager.apiKey) {
      this.showErrorIndicator(fieldType, 'API key not configured. Please set your Anthropic API key in the extension popup.');
      return;
    }
    
    const itemData = this.dataExtractor.extractItemData();
    
    // Assess data quality for hallucination prevention
    const qualityAssessment = this.qualityAnalyzer.assessDataQuality(itemData, fieldType);
    
    if (qualityAssessment.needsMoreInfo) {
      this.showFieldSpecificInfoDialog(fieldType, qualityAssessment.missingInfo, itemData);
      return;
    }
    
    this.showLoadingIndicator(fieldType);
    
    try {
      const improved = await this.apiManager.callClaudeAPI(itemData, fieldType);
      console.log('Improved result for', fieldType, ':', improved);
      
      // For single field improvements, extract the specific field value
      const value = improved[fieldType];
      if (value) {
        this.uiManager.applyImprovement(fieldType, value);
        this.showSuccessIndicator(fieldType);
        
        // Re-analyze quality after improvement
        setTimeout(() => this.qualityAnalyzer.analyzeQuality(), 500);
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
    if (!this.apiManager.apiKey) {
      await this.apiManager.loadApiKey();
    }
    
    // Check if API key is still missing
    if (!this.apiManager.apiKey) {
      this.showErrorIndicator('all', 'API key not configured. Please set your Anthropic API key in the extension popup.');
      return;
    }
    
    const itemData = this.dataExtractor.extractItemData();
    
    // Assess data quality for hallucination prevention
    const qualityAssessment = this.qualityAnalyzer.assessDataQuality(itemData, 'all');
    
    if (qualityAssessment.needsMoreInfo) {
      this.showFieldSpecificInfoDialog('all', qualityAssessment.missingInfo, itemData);
      return;
    }
    
    this.showLoadingIndicator('all');
    
    try {
      const improvements = await this.apiManager.callClaudeAPI(itemData, 'all');
      
      if (improvements.title) {
        this.uiManager.applyImprovement('title', improvements.title);
      }
      if (improvements.description) {
        this.uiManager.applyImprovement('description', improvements.description);
      }
      if (improvements.condition) {
        this.uiManager.applyImprovement('condition', improvements.condition);
      }
      if (improvements.keywords) {
        this.uiManager.applyImprovement('keywords', improvements.keywords);
      }
      
      this.showSuccessIndicator('all');
      
      // Re-analyze quality after improvements
      setTimeout(() => this.qualityAnalyzer.analyzeQuality(), 500);
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
    const itemData = this.dataExtractor.extractItemData();
    
    if (fieldType === 'all') {
      this.showLoadingIndicator('all');
      
      try {
        const improvements = await this.apiManager.callClaudeAPI(itemData, 'all-sparse');
        this.applyAllImprovements(improvements);
      } catch (error) {
        this.showErrorIndicator('all', error.message);
      }
      return;
    }
    
    // For individual fields
    this.showLoadingIndicator(fieldType);
    
    try {
      const improved = await this.apiManager.callClaudeAPI(itemData, fieldType);
      console.log('Forced improved result for', fieldType, ':', improved);
      
      const value = improved[fieldType];
      if (value) {
        this.uiManager.applyImprovement(fieldType, value);
        this.showSuccessIndicator(fieldType);
        
        // Re-analyze quality after improvement
        setTimeout(() => this.qualityAnalyzer.analyzeQuality(), 500);
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
      this.uiManager.applyImprovement('title', improvements.title);
    }
    if (improvements.description) {
      this.uiManager.applyImprovement('description', improvements.description);
    }
    if (improvements.condition) {
      this.uiManager.applyImprovement('condition', improvements.condition);
    }
    if (improvements.keywords) {
      this.uiManager.applyImprovement('keywords', improvements.keywords);
    }
    
    this.showSuccessIndicator('all');
    setTimeout(() => this.qualityAnalyzer.analyzeQuality(), 500);
  }

  // Status indicator methods (simplified versions)
  showLoadingIndicator(fieldType) {
    const indicators = document.querySelectorAll('.ai-status-indicator');
    indicators.forEach(ind => ind.remove());
    
    const indicator = document.createElement('div');
    indicator.className = 'ai-status-indicator loading';
    indicator.innerHTML = `
      <div class="loading-content">
        <div class="spinner"></div>
        <span class="loading-text">🤖 AI förbättrar ${fieldType === 'all' ? 'alla fält' : fieldType}...</span>
      </div>
    `;
    
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
    }
  }

  showSuccessIndicator(fieldType) {
    const indicator = document.querySelector('.ai-status-indicator');
    if (indicator) {
      indicator.className = 'ai-status-indicator success';
      indicator.innerHTML = `
        <div class="success-content">
          <span class="success-icon">✓</span>
          <span class="success-text">🎉 ${fieldType === 'all' ? 'Alla fält' : fieldType} förbättrade!</span>
        </div>
      `;
      
      setTimeout(() => indicator.remove(), 4000);
    }
  }

  showErrorIndicator(fieldType, error) {
    let indicator = document.querySelector('.ai-status-indicator');
    
    if (!indicator) {
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
        alert(`Error: ${error}`);
        return;
      }
    } else {
      indicator.className = 'ai-status-indicator error';
      indicator.textContent = `✗ Fel: ${error}`;
    }
    
    setTimeout(() => {
      if (indicator && indicator.parentElement) {
        indicator.remove();
      }
    }, 5000);
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