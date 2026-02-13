// modules/add-items/field-analyzer.js - Description and condition quality analysis for add items page

export class AddItemsFieldAnalyzer {
  constructor() {
    this.callbacks = {};
  }

  setDependencies({ apiManager }) {
    this.apiManager = apiManager;
  }

  setCallbacks(callbacks) {
    this.callbacks = callbacks;
  }

  // Helper accessors for orchestrator state (via callbacks)
  get fieldMappings() { return this.callbacks.getFieldMappings?.() ?? {}; }

  // ==================== DESCRIPTION QUALITY ====================

  async analyzeDescriptionQuality(formData) {
    if (!formData.description || formData.description.length < 5) return;
    
    const tooltipId = 'description-quality';
    if (!this.callbacks.isTooltipEligible(tooltipId, formData)) {
      return;
    }
    
    if (this.callbacks.isDismissed(tooltipId)) return;
    
    const issues = this.detectDescriptionIssues(formData);
    
    if (issues.length > 0) {
      this.showDescriptionQualityTooltip(issues, formData);
    }
  }

  detectDescriptionIssues(formData) {
    const issues = [];
    const description = formData.description || '';
    const cleanDescription = description.replace(/<[^>]*>/g, '');
    const descLength = cleanDescription.length;
    
    if (descLength < 50) {
      issues.push({
        type: 'length',
        severity: 'high',
        message: 'För kort - lägg till detaljer om material, teknik, färg, märkningar',
        action: 'Utöka beskrivning'
      });
    }
    
    if (!description.match(/\d+[\s,]*(x|cm|mm)/i)) {
      issues.push({
        type: 'measurements',
        severity: 'high', 
        message: 'Mått saknas - ange höjd x bredd eller diameter',
        action: 'Lägg till mått'
      });
    }
    
    if (descLength > 20) {
      const contentIssues = this.analyzeDescriptionContent(formData);
      issues.push(...contentIssues);
    }
    
    return issues.slice(0, 2);
  }

  analyzeDescriptionContent(formData) {
    const issues = [];
    const description = formData.description || '';
    const title = formData.title || '';
    const category = formData.category || '';
    const combinedText = (title + ' ' + description).toLowerCase();
    
    const materialIssue = this.checkMaterialIntelligently(combinedText, category);
    if (materialIssue) issues.push(materialIssue);
    
    const techniqueIssue = this.checkTechniqueIntelligently(combinedText, category);
    if (techniqueIssue) issues.push(techniqueIssue);
    
    if (this.shouldCheckSignature(category, title)) {
      const signatureIssue = this.checkSignatureInfo(description);
      if (signatureIssue) issues.push(signatureIssue);
    }
    
    return issues;
  }

  checkMaterialIntelligently(text, category) {
    const materialsByCategory = {
      watches: ['stål', 'guld', 'silver', 'titan', 'platina', 'keramik', 'läder'],
      jewelry: ['guld', 'silver', 'platina', 'stål', 'diamant', 'ruby', 'safir'],
      furniture: ['teak', 'ek', 'björk', 'furu', 'mahogny', 'metall', 'glas', 'textil'],
      art: ['duk', 'pannå', 'papper', 'trä', 'metall', 'sten', 'marmor', 'brons'],
      ceramics: ['keramik', 'porslin', 'stengods', 'lergods', 'fajans'],
      glass: ['glas', 'kristall', 'mundblåst']
    };
    
    let relevantMaterials = [];
    if (text.includes('ur') || text.includes('klocka') || text.includes('rolex') || text.includes('omega')) {
      relevantMaterials = materialsByCategory.watches;
    } else if (text.includes('ring') || text.includes('halsband') || text.includes('armband') && !text.includes('klocka')) {
      relevantMaterials = materialsByCategory.jewelry;
    } else if (text.includes('stol') || text.includes('bord') || text.includes('skåp') || text.includes('möbel')) {
      relevantMaterials = materialsByCategory.furniture;
    } else if (text.includes('målning') || text.includes('tavla') || text.includes('konst')) {
      relevantMaterials = materialsByCategory.art;
    } else if (text.includes('vas') || text.includes('skål') || text.includes('tallrik')) {
      relevantMaterials = [...materialsByCategory.ceramics, ...materialsByCategory.glass];
    } else {
      relevantMaterials = ['stål', 'guld', 'silver', 'trä', 'glas', 'keramik', 'metall', 'textil'];
    }
    
    const hasMaterial = relevantMaterials.some(material => text.includes(material));
    
    if (!hasMaterial) {
      return {
        type: 'material',
        severity: 'medium',
        message: `Material saknas - specificera ${relevantMaterials.slice(0, 3).join(', ')} etc.`,
        action: 'Specificera material'
      };
    }
    
    return null;
  }

  checkTechniqueIntelligently(text, category) {
    const techniquesByCategory = {
      watches: ['automatic', 'quartz', 'manuell', 'självdragande', 'urverk'],
      art: ['olja', 'akvarell', 'gouache', 'blyerts', 'kol', 'tusch', 'etsning', 'litografi', 'fotografi'],
      ceramics: ['handgjord', 'drejet', 'stämpel', 'glaserad'],
      glass: ['mundblåst', 'pressat', 'slipat', 'graverat'],
      furniture: ['handsnidad', 'laminerad', 'maskingjord', 'handgjord']
    };
    
    let relevantTechniques = [];
    if (text.includes('ur') || text.includes('klocka')) {
      relevantTechniques = techniquesByCategory.watches;
    } else if (text.includes('målning') || text.includes('tavla') || text.includes('konst')) {
      relevantTechniques = techniquesByCategory.art;
    } else if (text.includes('vas') || text.includes('skål') || text.includes('tallrik')) {
      relevantTechniques = [...techniquesByCategory.ceramics, ...techniquesByCategory.glass];
    } else if (text.includes('stol') || text.includes('bord') || text.includes('möbel')) {
      relevantTechniques = techniquesByCategory.furniture;
    } else {
      return null;
    }
    
    const hasTechnique = relevantTechniques.some(technique => text.includes(technique));
    
    if (!hasTechnique) {
      return {
        type: 'technique',
        severity: 'medium',
        message: `Teknik saknas - ange ${relevantTechniques.slice(0, 3).join(', ')} etc.`,
        action: 'Specificera teknik'
      };
    }
    
    return null;
  }

  shouldCheckSignature(category, title) {
    const artKeywords = ['målning', 'tavla', 'konst', 'skulptur', 'grafik', 'litografi', 'etsning'];
    const text = (category + ' ' + title).toLowerCase();
    return artKeywords.some(keyword => text.includes(keyword));
  }

  checkSignatureInfo(description) {
    if (!description.match(/(signerad|osignerad|monogram|stämplad)/i)) {
      return {
        type: 'signature',
        severity: 'low',
        message: 'Signaturinfo saknas - ange om verket är signerat eller osignerat',
        action: 'Lägg till signaturinfo'
      };
    }
    return null;
  }

  async queueAIDescriptionAnalysis(formData, existingIssues) {
    try {
      const aiAnalysis = await this.analyzeDescriptionWithAI(formData);
      
      if (aiAnalysis && aiAnalysis.missingElements) {
        aiAnalysis.missingElements.forEach(element => {
          existingIssues.push({
            type: element.type,
            severity: element.severity,
            message: element.message,
            action: element.action
          });
        });
      }
    } catch (error) {
      this.addBasicDescriptionChecks(formData, existingIssues);
    }
  }

  async analyzeDescriptionWithAI(formData) {
    const prompt = `Analysera denna produktbeskrivning för katalogkvalitet:

KATEGORI: ${formData.category || 'Okänd'}
TITEL: ${formData.title || ''}
BESKRIVNING: ${formData.description || ''}

Kontrollera om följande VERKLIGEN saknas (var intelligent och kontextmedveten):

1. MATERIAL - Finns material angivet? (t.ex. stål, guld, silver, keramik, trä, textil)
2. TEKNIK/FUNKTION - Finns tillverkningsteknik eller funktion? (t.ex. automatic, quartz, handgjord, maskingjord)
3. SIGNATUR/MÄRKNING - Finns info om signering, märkning eller tillverkarsstämpel?

VIKTIGT: 
- För UR: "automatiskt urverk" = teknik ✓, "stål" = material ✓
- För KONST: "olja på duk" = teknik ✓, "duk" = material ✓
- För MÖBLER: "teak" = material ✓, "handsnidad" = teknik ✓
- Var SMART - om informationen finns på annat sätt, räkna det som ✓

Returnera ENDAST verkligt saknade element:

{
  "missingElements": [
    {
      "type": "material", 
      "severity": "medium",
      "message": "Material saknas - specificera [relevant för kategorin]",
      "action": "Lägg till material"
    }
  ]
}

Om INGET saknas, returnera: {"missingElements": []}`;

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiManager.apiKey,
          body: {
            model: this.apiManager.getCurrentModel().id,
            max_tokens: 1000,
            temperature: 0.1,
            messages: [{
              role: 'user',
              content: prompt
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
      
      const result = JSON.parse(response.data.content[0].text);
      return result;
    } catch (error) {
      return null;
    }
  }

  addBasicDescriptionChecks(formData, issues) {
    const description = formData.description || '';
    const cleanDescription = description.replace(/<[^>]*>/g, '').toLowerCase();
    
    const basicMaterials = ['stål', 'guld', 'silver', 'trä', 'keramik', 'glas', 'textil', 'läder'];
    const hasMaterial = basicMaterials.some(material => cleanDescription.includes(material));
    
    if (!hasMaterial && cleanDescription.length > 30) {
      issues.push({
        type: 'material',
        severity: 'medium',
        message: 'Material kan behöva specificeras',
        action: 'Överväg att lägga till material'
      });
    }
  }

  async showDescriptionQualityTooltip(issues, formData) {
    const descriptionField = document.querySelector(this.fieldMappings.description);
    if (!descriptionField) return;

    const tooltipId = 'description-quality';
    
    setTimeout(async () => {
      if (this.callbacks.isDismissed(tooltipId)) return;
      
      if (this.callbacks.isTooltipActive(tooltipId)) {
        return;
      }
      
      const primaryIssue = issues[0];
      const secondaryIssue = issues[1];
      
      const content = `
        <div class="tooltip-header">
          BESKRIVNINGSFÖRBÄTTRINGAR
        </div>
        <div class="tooltip-body">
          <div class="issue-item primary">
            <strong>Beskrivning:</strong> ${primaryIssue.message}
          </div>
          ${secondaryIssue ? `
            <div class="issue-item secondary">
              <strong>Även:</strong> ${secondaryIssue.message}
            </div>
          ` : ''}
        </div>
      `;

      const buttons = [
        {
          text: 'Förbättra',
          className: 'btn-primary',
          onclick: () => {
            this.callbacks.permanentlyDisableTooltip('description-quality', 'user_improved_description');
            this.callbacks.dismissTooltip(tooltipId);
            this.callbacks.improveField('description');
          }
        },
        {
          text: 'Ignorera',
          className: 'btn-secondary',
          onclick: () => {
            this.callbacks.permanentlyDisableTooltip('description-quality', 'user_ignored');
            this.callbacks.dismissTooltip(tooltipId);
            this.callbacks.addDismissed(tooltipId);
          }
        }
      ];

      this.callbacks.createTooltip({
        id: tooltipId,
        targetElement: descriptionField,
        content,
        buttons,
        side: 'left',
        type: 'description-quality'
      });
      
    }, 800);
  }

  // ==================== CONDITION QUALITY ====================

  async analyzeConditionQuality(formData) {
    const noRemarksCheckbox = document.querySelector('input[type="checkbox"][value="Inga anmärkningar"]') || 
                             document.querySelector('input[type="checkbox"]#item_no_remarks') ||
                             document.querySelector('input[type="checkbox"][name*="no_remarks"]');
    
    if (noRemarksCheckbox && noRemarksCheckbox.checked) {
      return;
    }
    
    if (!formData.condition || formData.condition.length < 5) {
      this.showConditionGuidanceTooltip(formData, 'empty');
      return;
    }
    
    const tooltipId = 'condition-quality';
    if (!this.callbacks.isTooltipEligible(tooltipId, formData)) {
      return;
    }
    
    if (this.callbacks.isDismissed(tooltipId)) return;
    
    const conditionIssues = this.detectConditionIssues(formData);
    
    if (conditionIssues.length > 0) {
      this.showConditionGuidanceTooltip(formData, 'improve', conditionIssues);
    }
  }

  detectConditionIssues(formData) {
    const issues = [];
    const condition = formData.condition || '';
    const cleanCondition = condition.replace(/<[^>]*>/g, '').trim();
    const conditionLower = cleanCondition.toLowerCase();
    
    if (conditionLower === 'bruksslitage' || conditionLower === 'bruksslitage.') {
      issues.push({
        type: 'lazy_bruksslitage',
        severity: 'critical',
        title: 'Endast "Bruksslitage" är otillräckligt!',
        message: 'Specificera typ av slitage - var finns repor, nagg, fläckar? Våra kunder förtjänar bättre beskrivningar.',
        impact: 'Leder till missnöjda kunder och fler reklamationer!'
      });
      return issues;
    }
    
    const vagueOnlyPhrases = [
      'normalt slitage',
      'vanligt slitage', 
      'åldersslitage',
      'slitage förekommer',
      'mindre skador',
      'normal wear'
    ];
    
    const hasVagueOnly = vagueOnlyPhrases.some(phrase => {
      const conditionWithoutPhrase = conditionLower.replace(phrase, '').trim();
      return conditionLower.includes(phrase) && conditionWithoutPhrase.length < 10;
    });
    
    if (hasVagueOnly) {
      issues.push({
        type: 'vague_only',
        severity: 'high',
        title: 'Vag konditionsbeskrivning',
        message: 'Beskriv specifikt VAR och VILKEN typ av slitage. Kunden vill veta exakt vad de kan förvänta sig.',
        impact: 'Tydligare beskrivningar = nöjdare kunder = färre reklamationer'
      });
    }
    
    if (cleanCondition.length < 20) {
      issues.push({
        type: 'too_short',
        severity: 'high', 
        title: 'För kort konditionsrapport',
        message: 'Lägg till mer specifika detaljer om föremålets skick.',
        impact: 'Detaljerade beskrivningar minskar kundservice-samtal'
      });
    }
    
    if (conditionLower.includes('repor') && !this.hasLocationSpecifics(conditionLower)) {
      issues.push({
        type: 'missing_location',
        severity: 'medium',
        title: 'Specificera var skadorna finns',
        message: 'Ange VAR repor/skador finns - på ytan, kanter, baksidan, etc.',
        impact: 'Kunder vill veta exakt var skadorna är placerade'
      });
    }
    
    return issues.slice(0, 2);
  }

  hasLocationSpecifics(conditionText) {
    const locationWords = [
      'ytan', 'kanter', 'kant', 'baksidan', 'framsidan', 'ovansidan', 'undersidan',
      'handtag', 'fot', 'ben', 'arm', 'sits', 'rygg', 'ram', 'glas', 'urtavla',
      'boett', 'länk', 'hörn', 'mittpartiet', 'botten', 'topp', 'sida', 'insida'
    ];
    return locationWords.some(word => conditionText.includes(word));
  }

  // Condition guidance tooltip DISABLED - replaced by inline FAQ hints system
  async showConditionGuidanceTooltip(formData, type, issues = []) {
    return; // Inline hints now handle condition guidance
    const conditionField = document.querySelector(this.fieldMappings.condition);
    if (!conditionField) return;

    const tooltipId = 'condition-quality';
    
    setTimeout(() => {
      if (this.callbacks.isDismissed(tooltipId)) return;
      
      let content, title, severity;
      
      if (type === 'empty') {
        title = 'Konditionsrapport saknas';
        severity = 'high';
        content = this.getConditionGuidanceContent(formData, type);
      } else {
        const primaryIssue = issues[0];
        title = primaryIssue.title;
        severity = primaryIssue.severity;
        content = this.getConditionGuidanceContent(formData, type, issues);
      }
      
      const tooltipContent = `
        <div class="tooltip-header condition-${severity}">
          ${title.toUpperCase()}
        </div>
        <div class="tooltip-body">
          ${content}
        </div>
      `;

      const buttons = [
        {
          text: 'Förbättra',
          className: 'btn-primary',
          onclick: () => {
            this.callbacks.permanentlyDisableTooltip('condition-quality', 'user_improved_condition');
            this.callbacks.dismissTooltip(tooltipId);
            this.callbacks.improveField('condition');
          }
        },
        {
          text: 'Guidning',
          className: 'btn-info',
          onclick: () => {
            this.showConditionGuidePopup(formData);
          }
        },
        {
          text: 'Ignorera',
          className: 'btn-secondary',
          onclick: () => {
            this.callbacks.permanentlyDisableTooltip('condition-quality', 'user_ignored');
            this.callbacks.dismissTooltip(tooltipId);
            this.callbacks.addDismissed(tooltipId);
          }
        }
      ];

      this.callbacks.createTooltip({
        id: tooltipId,
        targetElement: conditionField,
        content: tooltipContent,
        buttons,
        side: 'left',
        type: 'condition-guidance'
      });
      
    }, 200);
  }

  getConditionGuidanceContent(formData, type, issues = []) {
    if (type === 'empty') {
      const category = this.determineItemCategory(formData);
      return `
        <div class="guidance-main">
          <strong>Konditionsrapport krävs för professionell katalogisering</strong><br>
          Kunder förväntar sig detaljerade beskrivningar av föremålets skick.
        </div>
        <div class="category-hint">
          <strong>För ${category.name}:</strong> Kontrollera ${category.checkPoints.join(', ')}
        </div>
        <div class="impact-note">
          💡 <em>Bra konditionsrapporter = nöjdare kunder = färre reklamationer</em>
        </div>
      `;
    } else {
      const primaryIssue = issues[0];
      const category = this.determineItemCategory(formData);
      
      return `
        <div class="issue-description">
          <strong>${primaryIssue.message}</strong>
        </div>
        <div class="category-hint">
          <strong>För ${category.name}:</strong> Beskriv ${category.conditionFocus.join(', ')}
        </div>
        <div class="impact-note">
          ⚠️ <em>${primaryIssue.impact}</em>
        </div>
      `;
    }
  }

  determineItemCategory(formData) {
    const title = (formData.title || '').toLowerCase();
    const description = (formData.description || '').toLowerCase();
    const category = (formData.category || '').toLowerCase();
    const combined = title + ' ' + description + ' ' + category;
    
    if (combined.match(/\b(ur|klocka|rolex|omega|patek|cartier|automatisk|quartz)\b/)) {
      return {
        name: 'armbandsur',
        checkPoints: ['urtavla', 'boett', 'länk/armband', 'glas', 'funktion'],
        conditionFocus: ['repor på boett', 'slitage på länk', 'märken på urtavla', 'funktionsstatus']
      };
    }
    
    if (combined.match(/\b(ring|halsband|armband|brosch|örhängen|smycke|guld|silver|diamant)\b/)) {
      return {
        name: 'smycken',
        checkPoints: ['stenar', 'fattningar', 'lås', 'kedja/band', 'ytbehandling'],
        conditionFocus: ['lösa stenar', 'slitage på fattning', 'lås funktion', 'repor på metall']
      };
    }
    
    if (combined.match(/\b(målning|tavla|konst|konstnär|signerad|duk|pannå|ram)\b/)) {
      return {
        name: 'konstverk',
        checkPoints: ['duk/papper', 'färger', 'ram', 'signatur', 'baksida'],
        conditionFocus: ['sprickor i färg', 'fläckar', 'ramens skick', 'dukens spänning']
      };
    }
    
    if (combined.match(/\b(stol|bord|skåp|möbel|sits|rygg|ben|låda)\b/)) {
      return {
        name: 'möbler',
        checkPoints: ['finish', 'fogar', 'klädsel', 'beslag', 'stabilitet'],
        conditionFocus: ['repor i finish', 'lossnade fogar', 'fläckar på klädsel', 'skador på beslag']
      };
    }
    
    if (combined.match(/\b(vas|skål|tallrik|porslin|keramik|glas|kristall)\b/)) {
      return {
        name: 'keramik/glas',
        checkPoints: ['nagg', 'sprickor', 'glasyr', 'märkningar', 'reparationer'],
        conditionFocus: ['nagg på kant', 'hårsprickor', 'krakelering', 'limmarker']
      };
    }
    
    return {
      name: 'föremål',
      checkPoints: ['ytor', 'kanter', 'funktionalitet', 'märkningar'],
      conditionFocus: ['synliga skador', 'slitage platser', 'funktionsstatus', 'reparationer']
    };
  }

  async showConditionGuidePopup(formData) {
    const category = this.determineItemCategory(formData);
    
    const popup = document.createElement('div');
    popup.className = 'condition-guide-popup-overlay';
    popup.innerHTML = `
      <div class="condition-guide-popup">
        <div class="popup-header">
          <h3>🎯 Professionell Konditionsrapportering</h3>
          <button class="popup-close" type="button">✕</button>
        </div>
        <div class="popup-content">
          ${this.getConditionGuideContent(category)}
        </div>
      </div>
    `;
    
    document.body.appendChild(popup);
    
    const closeBtn = popup.querySelector('.popup-close');
    closeBtn.addEventListener('click', () => {
      popup.remove();
    });
    
    popup.addEventListener('click', (e) => {
      if (e.target === popup) {
        popup.remove();
      }
    });
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        popup.remove();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  getConditionGuideContent(category) {
    return `
      <div class="guide-section">
        <h2 class="guide-section-title">Varför detaljerade konditionsrapporter?</h2>
        <div class="guide-text">
          Professionella konditionsrapporter är grunden för framgångsrik auktionsverksamhet. De skapar förtroende, minskar reklamationer och förbättrar kundupplevelsen.
        </div>
        
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-number">40%</div>
            <div class="stat-label">Färre kundservice-samtal</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">25%</div>
            <div class="stat-label">Fler positiva recensioner</div>
          </div>
          <div class="stat-card">
            <div class="stat-number">60%</div>
            <div class="stat-label">Färre returer</div>
          </div>
        </div>
      </div>

      <div class="guide-section">
        <h2 class="guide-section-title">Specifik guide för ${category.name}</h2>
        
        <div class="category-grid">
          <div class="guide-subsection">
            <h3 class="guide-subsection-title">Kontrollpunkter att alltid granska</h3>
            <ul class="guide-list">
              ${category.checkPoints.map(point => `<li class="guide-list-item">${point}</li>`).join('')}
            </ul>
          </div>
          
          <div class="guide-subsection">
            <h3 class="guide-subsection-title">Beskriv specifikt</h3>
            <ul class="guide-list">
              ${category.conditionFocus.map(focus => `<li class="guide-list-item">${focus}</li>`).join('')}
            </ul>
          </div>
        </div>
      </div>

      <div class="guide-section">
        <h2 class="guide-section-title">Exempel på konditionsrapporter</h2>
        
        <div class="example-grid">
          <div class="example-card bad">
            <div class="example-header">Undvik detta</div>
            <div class="example-text">"Bruksslitage"</div>
            <div class="example-note">Problem: Kunden vet inte vad de kan förvänta sig</div>
          </div>
          
          <div class="example-card good">
            <div class="example-header">Gör så här istället</div>
            <div class="example-text">${this.getGoodExample(category)}</div>
            <div class="example-note">Resultat: Kunden känner förtroende och vet exakt vad de får</div>
          </div>
        </div>
      </div>

      <div class="guide-section">
        <h2 class="guide-section-title">Professionella riktlinjer</h2>
        
        <div class="guide-subsection">
          <h3 class="guide-subsection-title">Skrivsätt</h3>
          <ul class="guide-list">
            <li class="guide-list-item">Var specifik om placering: "repor på ovansidan", "nagg vid kanten"</li>
            <li class="guide-list-item">Ange storlek på skador: "små repor", "större fläck ca 2 cm"</li>
            <li class="guide-list-item">Beskriv omfattning: "spridda repor", "enstaka nagg"</li>
            <li class="guide-list-item">Vara ärlig: Bättre att överdriva än underdriva skador</li>
          </ul>
        </div>
        
        <div class="guide-subsection">
          <h3 class="guide-subsection-title">Kvalitetskontroll</h3>
          <div class="guide-text">
            Läs igenom din konditionsrapport och fråga dig: "Skulle jag kunna föreställa mig föremålets skick baserat på denna beskrivning?" Om svaret är nej, lägg till mer specifika detaljer.
          </div>
        </div>
      </div>
    `;
  }

  getGoodExample(category) {
    const examples = {
      'armbandsur': '"Repor på boettets ovansida och mindre märken på urtavlan vid 3-positionen. Länkarna visar normalt slitage utan djupare skråmor. Fungerar vid katalogisering."',
      'smycken': '"Små repor på metallbandet och mindre slitage på lås-mekanismen. Stenarna sitter fast utan lösa fattningar. Lätt matthet på ytbehandlingen."',
      'konstverk': '"Mindre fläckar i nedre högra hörnet och två små hål från tidigare upphängning. Ramens guldbeläggning något nött vid kanter. Inga sprickor i duken."',
      'möbler': '"Repor och märken på skivans ovansida samt mindre nagg vid främre kanten. Benen visar normalt slitage men är stabila. Lådan går lätt att öppna."',
      'keramik/glas': '"Små nagg vid mynningen och hårfina sprickor i glasyr på utsidan. Botten har mindre repor från användning. Inga större skador eller reparationer."',
      'föremål': '"Repor på främre ytan och mindre märken vid handtagen. Funktionen fungerar som den ska men visar tecken på regelbunden användning."'
    };
    
    return examples[category.name] || examples['föremål'];
  }
}
