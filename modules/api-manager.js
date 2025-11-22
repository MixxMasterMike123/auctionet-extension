// modules/api-manager.js - API Management Module
import { CONFIG } from './config.js';
import { AuctionetAPI } from './auctionet-api.js';
import { AIAnalysisEngine } from './core/ai-analysis-engine.js';

export class APIManager {
  constructor() {
    this.apiKey = null;
    this.enableArtistInfo = true;
    this.showDashboard = true; // Default to showing dashboard
    this.currentModel = 'claude-3-5-sonnet'; // Set default model instead of null
    this.auctionetAPI = new AuctionetAPI();
    this.searchQuerySSoT = null; // NEW: AI-only SearchQuerySSoT support

    // Initialize AI Analysis Engine
    this.aiAnalysisEngine = new AIAnalysisEngine(this);

    this.loadSettings();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['anthropicApiKey', 'enableArtistInfo', 'showDashboard', 'selectedModel']);
      this.apiKey = result.anthropicApiKey;
      this.enableArtistInfo = result.enableArtistInfo !== false;
      this.showDashboard = result.showDashboard !== false; // Default to true if not set

      // Load selected model from storage
      if (result.selectedModel && CONFIG.MODELS[result.selectedModel]) {
        const previousModel = this.currentModel;
        this.currentModel = result.selectedModel;

        // Always log which model is loaded, whether it changed or not

        // Log if this was a change from the default
        if (previousModel !== this.currentModel) {
        }
      } else {
      }



      // Sync settings with AI Analysis Engine
      if (this.aiAnalysisEngine) {
        this.aiAnalysisEngine.updateSettings({ enableArtistInfo: this.enableArtistInfo });
      }



      // Also refresh Auctionet API settings
      if (this.auctionetAPI) {
        await this.auctionetAPI.refreshExcludeCompanySetting();
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  // NEW: Method to refresh just the model selection
  async refreshModelSelection() {
    try {
      const result = await chrome.storage.sync.get(['selectedModel']);
      if (result.selectedModel && CONFIG.MODELS[result.selectedModel]) {
        const previousModel = this.currentModel;
        this.currentModel = result.selectedModel;

        // Always log the refresh action, even if model didn't change
        if (previousModel !== this.currentModel) {
        } else {
        }
      } else {
      }
    } catch (error) {
      console.error('Error refreshing model selection:', error);
    }
  }

  // Get current model (replacing the config version)
  getCurrentModel() {
    return CONFIG.MODELS[this.currentModel] || CONFIG.MODELS['claude-3-5-sonnet'];
  }

  async callClaudeAPI(itemData, fieldType, retryCount = 0) {
    if (!this.apiKey) {
      throw new Error('API key not configured. Please set your Anthropic API key in the extension popup.');
    }

    const systemPrompt = this.getSystemPrompt();
    const userPrompt = this.getUserPrompt(itemData, fieldType);

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiKey,
          body: {
            model: this.getCurrentModel().id,
            max_tokens: CONFIG.API.maxTokens,
            temperature: CONFIG.API.temperature,
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
      if ((error.message.includes('Overloaded') || error.message.includes('rate limit') || error.message.includes('429')) && retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000;

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.callClaudeAPI(itemData, fieldType, retryCount + 1);
      }

      if (error.message.includes('Overloaded')) {
        throw new Error('Claude API är överbelastad just nu. Vänta en stund och försök igen.');
      }

      throw error;
    }
  }

  async processAPIResponse(response, systemPrompt, userPrompt, fieldType) {
    const data = response.data;

    if (!data || !data.content || !Array.isArray(data.content) || data.content.length === 0) {
      throw new Error('Invalid response format from API');
    }

    if (!data.content[0] || !data.content[0].text) {
      throw new Error('No text content in API response');
    }

    let result = this.parseClaudeResponse(data.content[0].text, fieldType);

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
            model: this.getCurrentModel().id,
            max_tokens: CONFIG.API.maxTokens,
            temperature: CONFIG.API.temperature,
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

        if (correctionData && correctionData.content && correctionData.content[0] && correctionData.content[0].text) {
          result = this.parseClaudeResponse(correctionData.content[0].text, fieldType);
        } else {
          console.warn('Invalid correction response format, using original result');
        }
      }
    }

    return result;
  }

  parseClaudeResponse(response, fieldType) {

    if (!response || typeof response !== 'string') {
      console.error('Invalid response format:', response);
      throw new Error('Invalid response format from Claude');
    }

    // SPECIAL CASE: Handle search_query field type - return raw JSON response
    if (fieldType === 'search_query') {
      return response.trim();
    }

    // For single field requests
    if (['title', 'title-correct', 'description', 'condition', 'keywords'].includes(fieldType)) {
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

      if (Object.keys(result).length === 0) {
        result[fieldType] = response.trim();
      }

      // For title-correct, map the result to title field for field application
      if (fieldType === 'title-correct' && result[fieldType]) {
        result.title = result[fieldType];
        delete result[fieldType];
      }

      console.log('Single field parsed result:', result);
      return result;
    }

    // Parse multi-field responses with proper multi-line support
    const result = {};
    const lines = response.split('\n');

    console.log('Parsing multi-field response, lines:', lines);

    let currentField = null;
    let currentContent = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Check if this line starts a new field
      if (trimmedLine.match(/^\*?\*?TITEL(\s*\([^)]*\))?\s*:?\*?\*?\s*/i)) {
        // Save previous field if exists
        if (currentField && currentContent.length > 0) {
          result[currentField] = currentContent.join('\n').trim();
        }
        currentField = 'title';
        currentContent = [trimmedLine.replace(/^\*?\*?TITEL(\s*\([^)]*\))?\s*:?\*?\*?\s*/i, '').trim()];
      } else if (trimmedLine.match(/^\*?\*?BESKRIVNING\s*:?\*?\*?\s*/i)) {
        // Save previous field if exists
        if (currentField && currentContent.length > 0) {
          result[currentField] = currentContent.join('\n').trim();
        }
        currentField = 'description';
        currentContent = [trimmedLine.replace(/^\*?\*?BESKRIVNING\s*:?\*?\*?\s*/i, '').trim()];
      } else if (trimmedLine.match(/^\*?\*?KONDITION(SRAPPORT)?\s*:?\*?\*?\s*/i)) {
        // Save previous field if exists
        if (currentField && currentContent.length > 0) {
          result[currentField] = currentContent.join('\n').trim();
        }
        currentField = 'condition';
        currentContent = [trimmedLine.replace(/^\*?\*?KONDITION(SRAPPORT)?\s*:?\*?\*?\s*/i, '').trim()];
      } else if (trimmedLine.match(/^\*?\*?SÖKORD\s*:?\*?\*?\s*/i)) {
        // Save previous field if exists
        if (currentField && currentContent.length > 0) {
          result[currentField] = currentContent.join('\n').trim();
        }
        currentField = 'keywords';
        currentContent = [trimmedLine.replace(/^\*?\*?SÖKORD\s*:?\*?\*?\s*/i, '').trim()];
      } else if (trimmedLine.match(/^\*?\*?VALIDERING\s*:?\*?\*?\s*/i)) {
        // Save previous field if exists
        if (currentField && currentContent.length > 0) {
          result[currentField] = currentContent.join('\n').trim();
        }
        currentField = 'validation';
        currentContent = [trimmedLine.replace(/^\*?\*?VALIDERING\s*:?\*?\*?\s*/i, '').trim()];
      }
      // Handle simple formats
      else if (trimmedLine.startsWith('TITEL:')) {
        // Save previous field if exists
        if (currentField && currentContent.length > 0) {
          result[currentField] = currentContent.join('\n').trim();
        }
        currentField = 'title';
        currentContent = [trimmedLine.substring(6).trim()];
      } else if (trimmedLine.startsWith('BESKRIVNING:')) {
        // Save previous field if exists
        if (currentField && currentContent.length > 0) {
          result[currentField] = currentContent.join('\n').trim();
        }
        currentField = 'description';
        currentContent = [trimmedLine.substring(12).trim()];
      } else if (trimmedLine.startsWith('KONDITION:')) {
        // Save previous field if exists
        if (currentField && currentContent.length > 0) {
          result[currentField] = currentContent.join('\n').trim();
        }
        currentField = 'condition';
        currentContent = [trimmedLine.substring(10).trim()];
      } else if (trimmedLine.startsWith('SÖKORD:')) {
        // Save previous field if exists
        if (currentField && currentContent.length > 0) {
          result[currentField] = currentContent.join('\n').trim();
        }
        currentField = 'keywords';
        currentContent = [trimmedLine.substring(7).trim()];
      } else if (trimmedLine.startsWith('VALIDERING:')) {
        // Save previous field if exists
        if (currentField && currentContent.length > 0) {
          result[currentField] = currentContent.join('\n').trim();
        }
        currentField = 'validation';
        currentContent = [trimmedLine.substring(11).trim()];
      } else if (currentField && trimmedLine.length > 0) {
        // This is a continuation line for the current field
        currentContent.push(line); // Keep original formatting/indentation
      }
    }

    // Save the last field
    if (currentField && currentContent.length > 0) {
      result[currentField] = currentContent.join('\n').trim();
    }

    if (Object.keys(result).length === 0 && response.trim().length > 0) {
      console.log('No fields found, using entire response as title');
      result.title = response.trim();
    }

    console.log('Multi-field parsed result:', result);
    console.log('Fields found:', Object.keys(result));
    return result;
  }

  getCategorySpecificRules(itemData) {
    // Delegate to AIRulesManager for centralized category-specific prompt generation
    if (window.getCategorySpecificPrompt) {
      return window.getCategorySpecificPrompt(itemData);
    }
    return '';
  }

  isSpecializedCategory(itemData) {
    const category = itemData.category?.toLowerCase() || '';
    const title = itemData.title?.toLowerCase() || '';
    const description = itemData.description?.toLowerCase() || '';

    // Check for specialized categories that need conservative enhancement
    const specializedKeywords = [
      // Weapons and militaria
      'vapen', 'svärd', 'kniv', 'bajonett', 'militaria', 'krigshistoria',
      'dolk', 'yxa', 'spjut', 'gevär', 'pistol', 'uniformsdelar', 'hjälm',
      'militär', 'svärdsskola', 'svärdsmed',
      // Historical items
      'antikviteter', 'arkeologi', 'etnografika', 'historiska', 'kulturhistoria',
      'antik', 'historisk', 'forntid', 'medeltid', 'vikinga', 'bronsålder',
      'kulturell', 'arkeologisk',
      // Jewelry and precious items
      'smycken', 'guld', 'silver', 'diamant', 'ädelsten',
      'ring', 'halsband', 'armband', 'brosch', 'örhängen',
      'karat', 'rubin', 'safir', 'smaragd'
    ];

    return specializedKeywords.some(keyword =>
      category.includes(keyword) ||
      title.includes(keyword) ||
      description.includes(keyword)
    );
  }

  getSystemPrompt() {
    return `Du är en professionell auktionskatalogiserare. Skapa objektiva, faktabaserade katalogiseringar enligt svenska auktionsstandarder.

GRUNDREGLER:
• Använd endast verifierbara fakta
• Skriv objektivt utan säljande språk
• Använd etablerad auktionsterminologi
• UPPFINN ALDRIG information som inte finns
• Skriv naturligt och flytande - fokusera på autenticitet över regelefterlevnad

ABSOLUT FÖRBJUDNA VÄRDEORD - ANVÄND ALDRIG:
• Fantastisk, Vacker, Utsökt, Nyskick, Magnifik, Underbar, Exceptionell, Perfekt
• Ovanlig, Sällsynt, Extraordinär, Unik, Spektakulär, Enastående, Otrolig
• Alla subjektiva kvalitetsomdömen och säljande uttryck
• Använd istället neutrala, faktabaserade beskrivningar

KATEGORI-SPECIFIKA REGLER:

ARMBANDSUR - KRITISKA KRAV:
• Storlek i mm (diameter)
• Urverk: "automatic" eller "quartz"
• Tillverkare och modell (eller kaliber)
• För dyrare föremål: ange serienummer
• Funktionsklausul: "Fungerar vid katalogisering - ingen garanti lämnas på funktion"
• EXEMPEL: "ROLEX, Submariner, automatic, 40mm, stål, 1990-tal. Fungerar vid katalogisering - ingen garanti lämnas på funktion."

FÖRBJUDET:
• ALLA värdeord och säljande uttryck (se lista ovan)
• Meta-kommentarer: "ytterligare uppgifter behövs", "mer information krävs"
• Spekulationer och gissningar
• Överdriven regelefterlevnad - skriv naturligt och autentiskt

TITELFORMAT (max 60 tecken):
Om konstnär-fält tomt: [KONSTNÄR], [Föremål], [Material], [Period] - FÖRSTA ORDET VERSALER
Om konstnär-fält ifyllt: [föremål], [Material], [Period] - FÖRSTA ORDET GEMENER (konstnärens namn läggs till automatiskt)

OSÄKERHETSMARKÖRER - BEHÅLL ALLTID:
"troligen", "tillskriven", "efter", "stil av", "möjligen"

CITATTECKEN FÖR MASKINÖVERSÄTTNING - KRITISKT:
• BEHÅLL ALLTID citattecken runt produktnamn och svenska designnamn i titlar
• Auctionet respekterar citattecken - text inom "" översätts ALDRIG av maskinöversättning
• EXEMPEL: "Oxford" förblir "Oxford", INTE Oxford (utan citattecken som kan översättas)

KONDITION - KRITISKA REGLER:
• Använd korta, faktabaserade termer: "Välbevarat", "Mindre repor", "Nagg vid kanter"
• UPPFINN ALDRIG nya skador, placeringar eller detaljer
• Om original säger "repor" - skriv INTE "repor i metallramen" eller "repor på ytan"
• Lägg ALDRIG till specifika platser som "i metallramen", "på ovansidan", "vid foten"
• Förbättra ENDAST språket - lägg INTE till nya faktauppgifter

STAVNINGSKORRIGERING:
• Rätta uppenbara stavfel i märken, modeller och tekniska termer
• EXEMPEL: "Oscean" → "Ocean", "Omege" → "Omega", "Cartier" → "Cartier"
• Behåll osäkerhetsmarkörer även efter stavningskorrigering

STRIKT ANTI-HALLUCINATION:
• Förbättra ENDAST språk och struktur av BEFINTLIG information
• Lägg INTE till material, mått, skador, placeringar som inte är nämnda
• Kopiera EXAKT samma skadeinformation som redan finns
• Katalogtext ska vara FÄRDIG utan önskemål om mer data
• ALDRIG lägga till detaljer för att "förbättra" - bara förbättra språket

FÖRBJUDET - INGA FÖRKLARINGAR ELLER KOMMENTARER:
• Lägg ALDRIG till förklarande text som "Notera:", "Observera:", "Jag har behållit..."
• Lägg ALDRIG till kommentarer om vad du har gjort eller inte gjort
• Lägg ALDRIG till meta-text om processen eller metoderna
• Lägg ALDRIG till bedömningar som "Bra start", "kan förbättras", etc.
• Returnera ENDAST det begärda innehållet utan extra kommentarer
• EXEMPEL FÖRBJUDET: "Notera: Jag har behållit det ursprungliga datumformatet..."
• EXEMPEL FÖRBJUDET: "Sökord: Bra start - några fler sökord kan förbättra..."

KRITISKT - DATUM OCH PERIODSPECULATION FÖRBJUDEN:
• EXPANDERA ALDRIG partiella årtal: "55" får INTE bli "1955", "1855" eller något annat
• GISSA ALDRIG århundrade från tvåsiffriga årtal - "55" kan vara 1755, 1855, 1955, etc.
• BEHÅLL EXAKT samma datumformat som originalet: "daterad 55" ska förbli "daterad 55"
• LÄGG INTE till "troligen" eller andra osäkerhetsmarkörer till datum som inte redan har dem
• Om originalet säger "55" - skriv "55", INTE "1955" eller "troligen 1955"
• ENDAST om originalet redan anger fullständigt årtal (t.ex. "1955") får du behålla det
• EXEMPEL FÖRBJUDET: "daterad 55" → "1955" eller "troligen 1955"
• EXEMPEL KORREKT: "daterad 55" → "daterad 55" (oförändrat)

`;
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
        'Konstnär/formgivare-fältet är ifyllt (' + itemData.artist + '), så inkludera INTE konstnärens namn i titeln - det läggs till automatiskt av systemet. FÖRSTA ORDET I TITELN SKA VARA PROPER KAPITALISERAT (första bokstaven versal, resten gemener) eftersom konstnären läggs till i versaler automatiskt. Exempel: "Skulpturer" INTE "SKULPTURER" och INTE "skulpturer".' :
        'Konstnär/formgivare-fältet är tomt, så inkludera konstnärens namn i titeln om det är känt. FÖRSTA ORDET I TITELN SKA VARA VERSALER (uppercase).'}

KRITISKT - KONSTNÄR I MITTEN/SLUTET AV TITEL:
• Om konstnärsnamn förekommer i MITTEN eller SLUTET av titeln (inte först) - BEHÅLL det där
• Detta gäller när OBJEKTET är huvudsaken, inte konstnären
• Korrigera stavfel i konstnärsnamnet men behåll positionen
• FÖRSTA ORDET ska vara VERSALER (objektnamnet)
• EXEMPEL: "SERVISDELAR, 24 delar, porslin, Stig Lindberg, 'Spisa Ribb', Gustavsberg. 1900-tal."
• Konstnären stannar i titeln när den INTE är i början

KONSTNÄRSINFORMATION OCH EXPERTKUNSKAP:
${itemData.artist && this.enableArtistInfo ?
        'Konstnär/formgivare: ' + itemData.artist + ' - Använd din kunskap om denna konstnärs verk för att lägga till KORT, RELEVANT kontext. Fokusera på specifika detaljer om denna modell/serie om du känner till dem (tillverkningsår, karakteristiska drag). Håll det koncist - max 1-2 meningar extra kontext. Om du inte är säker om specifika fakta, använd "troligen" eller "anses vara".' :
        'Lägg INTE till konstnärlig eller historisk kontext som inte redan finns i källdata.'}

DEBUG INFO: Artist="${itemData.artist}", EnableArtistInfo=${this.enableArtistInfo}, ShouldAddArtistInfo=${!!(itemData.artist && this.enableArtistInfo)}

KRITISKT - BEHÅLL OSÄKERHETSMARKÖRER I TITEL:
Om nuvarande titel innehåller ord som "troligen", "tillskriven", "efter", "stil av", "möjligen", "typ" - BEHÅLL dessa exakt. De anger juridisk osäkerhet och får ALDRIG tas bort eller ändras.

ANTI-HALLUCINATION INSTRUKTIONER:
• Lägg ALDRIG till information som inte finns i källdata
• Uppfinn ALDRIG tidsperioder, material, mått eller skador
• Förbättra ENDAST språk, struktur och terminologi
• Om information saknas - utelämna eller använd osäkerhetsmarkörer

${this.isSpecializedCategory(itemData) ? `
🚨 EXTRA VARNING - SPECIALISERAD KATEGORI DETEKTERAD:
Detta föremål kräver EXTRA FÖRSIKTIGHET för att undvika AI-hallucinationer och felaktiga tillägg.
SE KATEGORI-SPECIFIKA REGLER NEDAN för strikt vägledning om vad som är FÖRBJUDET att lägga till.
VIKTIGASTE REGEL: När i tvivel - FÖRBÄTTRA MINDRE och bevara EXAKTHET över utförlig beskrivning.
` : ''}

KRITISKT - DATUM OCH PERIODSPECULATION FÖRBJUDEN:
• EXPANDERA ALDRIG partiella årtal: "55" får INTE bli "1955", "1855" eller något annat
• GISSA ALDRIG århundrade från tvåsiffriga årtal - "55" kan vara 1755, 1855, 1955, etc.
• BEHÅLL EXAKT samma datumformat som originalet: "daterad 55" ska förbli "daterad 55"
• LÄGG INTE till "troligen" eller andra osäkerhetsmarkörer till datum som inte redan har dem
• Om originalet säger "55" - skriv "55", INTE "1955" eller "troligen 1955"
• ENDAST om originalet redan anger fullständigt årtal (t.ex. "1955") får du behålla det
• EXEMPEL FÖRBJUDET: "daterad 55" → "1955" eller "troligen 1955"
• EXEMPEL KORREKT: "daterad 55" → "daterad 55" (oförändrat)

${this.getCategorySpecificRules(itemData)}
`;

    // Return field-specific prompts based on fieldType
    switch (fieldType) {
      case 'all':
      case 'all-sparse':
        return baseInfo + `
UPPGIFT: Förbättra titel, beskrivning, konditionsrapport och generera dolda sökord enligt svenska auktionsstandarder. Skriv naturligt och autentiskt - använd reglerna som riktlinjer, inte som strikta begränsningar.

VIKTIGT - ARBETSORDNING:
1. Först förbättra titel, beskrivning och kondition
2. Sedan generera sökord baserat på de FÖRBÄTTRADE fälten (inte originalfälten)

${itemData.artist && this.enableArtistInfo ?
            'EXPERTKUNSKAP - KONSTNÄR KÄND: Eftersom konstnär/formgivare är angiven (' + itemData.artist + ') och konstnärsinformation är aktiverad, lägg till KORT, RELEVANT kontext om denna specifika modell/serie. Max 1-2 extra meningar. Fokusera på konkreta fakta, inte allmän konstnärsbiografi.' :
            'BEGRÄNSAD INFORMATION: Håll dig till befintlig information utan att lägga till konstnärlig kontext.'}

FÄLTAVGRÄNSNING:
• BESKRIVNING: Material, teknik, mått, stil, ursprung, märkningar, funktion - ALDRIG konditionsinformation
• KONDITION: Endast fysiskt skick och skador - ALDRIG beskrivande information
• Håll fälten strikt separerade - konditionsdetaljer som "slitage", "repor", "märken" hör ENDAST i konditionsfältet

=== TITEL-SPECIFIKA REGLER (SAMMA SOM INDIVIDUELL TITEL-FÖRBÄTTRING) ===

KRITISKT - BEVARA CITATTECKEN FÖR MASKINÖVERSÄTTNING:
• BEHÅLL ALLTID citattecken runt produktnamn, modellnamn och svenska designnamn
• Auctionet använder maskinöversättning som RESPEKTERAR citattecken - text inom "" översätts ALDRIG
• Detta är KRITISKT för IKEA-möbler och svenska designnamn som ska förbli på svenska
• EXEMPEL: "Oxford" ska förbli "Oxford" (med citattecken), INTE Oxford (utan citattecken)
• EXEMPEL: "Pepparkorn" ska förbli "Pepparkorn" (med citattecken) för att undvika översättning
• Om originaltiteln har citattecken runt produktnamn - BEHÅLL dem ALLTID

KRITISKA MÄRKESRÄTTSTAVNINGSREGLER:
• Rätta alltid märkesnamn till korrekt stavning/kapitalisering enligt varumärkesstandard
• IKEA: alltid versaler - "Ikea" → "IKEA", "ikea" → "IKEA"  
• iPhone: alltid "iPhone" - "Iphone" → "iPhone", "IPHONE" → "iPhone"
• Royal Copenhagen: alltid "Royal Copenhagen" - "royal copenhagen" → "Royal Copenhagen"
• Kosta Boda: alltid "Kosta Boda" - "kosta boda" → "Kosta Boda"
• Orrefors: alltid "Orrefors" - "orrefors" → "Orrefors"
• Rolex: alltid "Rolex" - "rolex" → "Rolex", "ROLEX" → "Rolex" (utom första ordet)
• Omega: alltid "Omega" - "omega" → "Omega"
• Lego: alltid "Lego" - "lego" → "Lego", "LEGO" → "Lego" (utom första ordet)
• Använd din omfattande kunskap om korrekta märkesstavningar för alla välkända varumärken
• Respektera märkenas officiella kapitalisering/formatering
• Om osäker på exakt stavning, behåll originalet

KRITISKA TITELFORMATREGLER:
${itemData.artist ?
            '• Konstnär/formgivare-fältet är ifyllt:\n• FÖRSTA ORDET SKA VARA PROPER KAPITALISERAT (första bokstaven versal) följt av PUNKT (.)\n• Nästa ord efter punkt ska ha stor bokstav\n• Exempel: "Skulpturer. 2 st, porträttbyster" (blir "SVEN GUNNARSSON. Skulpturer. 2 st, porträttbyster")\n• FÖRBJUDET: "SKULPTURER" (versaler) eller "skulpturer" (gemener)\n• KORREKT: "Skulpturer." (proper kapitalisering + punkt)' :
            '• Konstnär/formgivare-fältet är tomt:\n• FÖRSTA ORDET SKA VARA VERSALER (uppercase) följt av PUNKT (.)\n• Nästa ord efter punkt ska ha stor bokstav\n• Exempel: "BAJONETT. Eskilstuna, 1900-tal"\n• KORREKT: "BORDSLAMPOR. 2 st, Kosta Boda"'}

SPECIAL REGEL - KONSTNÄR I MITTEN/SLUTET AV TITEL:
• Om konstnärsnamn finns i MITTEN eller SLUTET av nuvarande titel (inte först) - BEHÅLL det där
• Detta gäller när OBJEKTET är huvudsaken, inte konstnären  
• Korrigera stavfel i konstnärsnamnet men behåll exakt position
• FÖRSTA ORDET ska vara VERSALER (objektnamnet är huvudsaken)
• EXEMPEL: "SERVISDELAR, 24 delar, porslin, Stig Lindberg, 'Spisa Ribb', Gustavsberg. 1900-tal."
• Flytta ALDRIG konstnären när den inte är i början - det är medvetet placerad

UPPDATERAD REGEL - FORMATERING NÄR INGET KONSTNÄRSFÄLT:
• KRITISKT: När konstnär/formgivare-fältet är TOMT ska första ordet ha KOMMA (,) INTE punkt (.)
• FÖRSTA ORDET: Versaler (uppercase)
• EFTER KOMMA: Liten bokstav (utom namn/märken som Eskilstuna, Kosta Boda)
• RÄTT: "BOKHYLLA, betsat trä, 1900-talets mitt"
• FEL: "BOKHYLLA. Betsat trä, 1900-talets mitt"
• RÄTT: "LJUSPLÅTAR, ett par, mässing, 1900-tal"
• FEL: "LJUSPLÅTAR. Ett par, mässing, 1900-tal"

=== BESKRIVNING-SPECIFIKA REGLER (SAMMA SOM INDIVIDUELL BESKRIVNING-FÖRBÄTTRING) ===

FÄLTAVGRÄNSNING FÖR BESKRIVNING:
• Inkludera ALDRIG konditionsinformation i beskrivningen
• Konditionsdetaljer som "slitage", "repor", "märken", "skador", "nagg", "sprickor", "fläckar" hör ENDAST hemma i konditionsfältet
• Beskrivningen ska fokusera på: material, teknik, mått, stil, ursprung, märkningar, funktion
• EXEMPEL PÅ FÖRBJUDET I BESKRIVNING: "Slitage förekommer", "repor och märken", "normalt åldersslitage", "mindre skador"
• KRITISKT: BEHÅLL ALLTID MÅTT OCH TEKNISKA SPECIFIKATIONER - dessa är INTE konditionsinformation
• BEHÅLL: "höjd 15,5 cm", "4 snapsglas", "2 vinglas", "består av", "bestående av" - detta är beskrivande information
• TA ENDAST BORT konditionsord som "slitage", "repor", "skador" - ALDRIG mått eller kvantiteter

VIKTIGT - PARAGRAFSTRUKTUR FÖR BESKRIVNING:
${itemData.artist && this.enableArtistInfo ?
            '• STRUKTUR: Befintlig beskrivning först, sedan ny konstnärsinformation i SEPARAT paragraf\n• FORMAT: Använd dubbla radbrytningar (\\n\\n) för att separera paragrafer i beskrivningsfältet\n• EXEMPEL: "Befintlig förbättrad beskrivning här...\\n\\nKort konstnärskontext här..."\n• Lägg till KORT, SPECIFIK kontext om denna modell/serie i SEPARAT paragraf\n• Max 1-2 meningar extra - fokusera på tillverkningsår och karakteristiska drag\n• UNDVIK allmänna beskrivningar av konstnärens karriär eller designfilosofi\n• Håll det relevant för just detta föremål' :
            '• Returnera befintlig förbättrad beskrivning\n• Lägg INTE till konstnärlig eller historisk kontext som inte finns i källdata'}
• Lägg INTE till mått som inte är angivna
• Lägg INTE till material som inte är nämnt (såvida det inte är känt från konstnärens typiska tekniker)
• Lägg INTE till märkningar eller signaturer som inte finns
• Förbättra språk, struktur och befintlig information
• Lägg ALDRIG till kommentarer om vad som "saknas" eller "behövs"

=== KONDITION-SPECIFIKA REGLER (SAMMA SOM INDIVIDUELL KONDITION-FÖRBÄTTRING) ===

FÄLTAVGRÄNSNING FÖR KONDITION:
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

STRIKT REGEL: Kopiera ENDAST den skadeinformation som redan finns - lägg ALDRIG till nya detaljer.

=== SÖKORD-SPECIFIKA REGLER (SAMMA SOM INDIVIDUELL SÖKORD-GENERERING) ===

KRITISKT FÖR SÖKORD - KOMPLETTERANDE TERMER:
• Generera sökord som kompletterar de FÖRBÄTTRADE titel/beskrivning du skapar
• Läs noggrant igenom dina FÖRBÄTTRADE titel/beskrivning INNAN du skapar sökord
• Generera ENDAST ord som INTE redan finns i dina förbättrade fält
• Fokusera på HELT NYA alternativa söktermer som köpare kan använda
• Kontrollera även PARTIELLA matchningar: "litografi" matchar "färglitografi"
• Inkludera: stilperioder, tekniker, användningsområden, alternativa namn
• Exempel: Om din förbättrade titel säger "vas" - lägg till "dekoration inredning samlarobjekt"
• KONKRETA EXEMPEL: Om beskrivning säger "blomstermotiv" → använd INTE "blomstermotiv", använd "växtmotiv" istället
• KONKRETA EXEMPEL: Om beskrivning säger "orkidén" → använd INTE "orkidé", använd "flora" istället
• För perioder: Använd decennier istället för exakta år: "1970-tal" istället av "1974"
• MAX 10-12 relevanta termer

KOMPLETTERANDE SÖKORD - EXEMPEL:
• För konsttryck: "grafik reproduktion konstprint limited-edition"
• För målningar: "oljemålning akvarell konstverk originalverk"  
• För skulptur: "skulptur plastik konstföremål tredimensionell"
• För möbler: "vintage retro funktionalism dansk-design"
• För perioder: Använd decennier istället för exakta år: "1970-tal" istället av "1974"

OBLIGATORISK AUCTIONET FORMAT FÖR SÖKORD:
• Separera sökord med MELLANSLAG (ALDRIG kommatecken)
• Använd "-" för flerordsfraser: "svensk-design", "1970-tal", "limited-edition"
• EXEMPEL KORREKT: "grafik reproduktion svensk-design 1970-tal konstprint"
• EXEMPEL FEL: "grafik, reproduktion, svensk design, 1970-tal" (kommatecken och mellanslag i fraser)

STRIKT REGEL FÖR SÖKORD: Läs titel och beskrivning noggrant - om ett ord redan finns där (även delvis), använd det ALDRIG i sökorden.

KRITISKT - BEVARA ALLA MÅTT OCH LISTOR I BESKRIVNINGEN:
• BEHÅLL ALLTID detaljerade måttlistor: "4 snapsglas, höjd 15,5 cm", "2 vinglas, höjd 19,5 cm", etc.
• BEHÅLL ALLTID kvantiteter och specifikationer: "Bestående av:", "Består av:", antal objekt
• BEHÅLL ALLTID alla mått i cm/mm - dessa är ALDRIG konditionsinformation
• TA ENDAST BORT konditionsord som "slitage", "repor", "skador" - ALDRIG mått, kvantiteter eller listor
• EXEMPEL PÅ VAD SOM MÅSTE BEVARAS: "Bestående av: 4 snapsglas, höjd 15,5 cm, 2 vinglas, höjd 19,5 cm"

VARNING: Om du tar bort mått eller listor kommer detta att betraktas som ett KRITISKT FEL!

KRITISKT - FÖRSTA ORDETS KAPITALISERING I TITEL:
${itemData.artist ?
            '• Konstnär/formgivare-fältet är ifyllt - FÖRSTA ORDET SKA VARA PROPER KAPITALISERAT (första bokstaven versal)\n• Exempel: "Skulpturer" (blir "SVEN GUNNARSSON. Skulpturer") INTE "SKULPTURER" eller "skulpturer"\n• Auctionet lägger till: "KONSTNÄR. " så titeln ska vara "Skulpturer" inte "skulpturer"' :
            '• Konstnär/formgivare-fältet är tomt - FÖRSTA ORDET I TITEL SKA VARA VERSALER (uppercase)'}

Returnera EXAKT i detta format (en rad per fält):
TITEL: [förbättrad titel]
BESKRIVNING: [förbättrad beskrivning utan konditionsinformation]
KONDITION: [förbättrad konditionsrapport]
SÖKORD: [kompletterande sökord baserade på FÖRBÄTTRADE fält ovan, separerade med mellanslag, använd "-" för flerordsfraser]

VIKTIGT FÖR SÖKORD: Använd Auctionets format med mellanslag mellan sökord och "-" för flerordsfraser.
EXEMPEL: "konstglas mundblåst svensk-design 1960-tal samlarobjekt"

Använd INTE markdown formatering eller extra tecken som ** eller ***. Skriv bara ren text.`;

      case 'title':
        return baseInfo + `
UPPGIFT: Förbättra endast titeln enligt svenska auktionsstandarder. Max 60 tecken. Skriv naturligt och flytande.

KRITISKT - BEVARA CITATTECKEN FÖR MASKINÖVERSÄTTNING:
• BEHÅLL ALLTID citattecken runt produktnamn, modellnamn och svenska designnamn
• Auctionet använder maskinöversättning som RESPEKTERAR citattecken - text inom "" översätts ALDRIG
• Detta är KRITISKT för IKEA-möbler och svenska designnamn som ska förbli på svenska
• EXEMPEL: "Oxford" ska förbli "Oxford" (med citattecken), INTE Oxford (utan citattecken)
• EXEMPEL: "Pepparkorn" ska förbli "Pepparkorn" (med citattecken) för att undvika översättning
• Om originaltiteln har citattecken runt produktnamn - BEHÅLL dem ALLTID

KRITISKA MÄRKESRÄTTSTAVNINGSREGLER:
• Rätta alltid märkesnamn till korrekt stavning/kapitalisering enligt varumärkesstandard
• IKEA: alltid versaler - "Ikea" → "IKEA", "ikea" → "IKEA"  
• iPhone: alltid "iPhone" - "Iphone" → "iPhone", "IPHONE" → "iPhone"
• Royal Copenhagen: alltid "Royal Copenhagen" - "royal copenhagen" → "Royal Copenhagen"
• Kosta Boda: alltid "Kosta Boda" - "kosta boda" → "Kosta Boda"
• Orrefors: alltid "Orrefors" - "orrefors" → "Orrefors"
• Rolex: alltid "Rolex" - "rolex" → "Rolex", "ROLEX" → "Rolex" (utom första ordet)
• Omega: alltid "Omega" - "omega" → "Omega"
• Lego: alltid "Lego" - "lego" → "Lego", "LEGO" → "Lego" (utom första ordet)
• Använd din omfattande kunskap om korrekta märkesstavningar för alla välkända varumärken
• Respektera märkenas officiella kapitalisering/formatering
• Om osäker på exakt stavning, behåll originalet

KRITISKA TITELFORMATREGLER:
${itemData.artist ?
            '• Konstnär/formgivare-fältet är ifyllt:\n• FÖRSTA ORDET SKA VARA PROPER KAPITALISERAT (första bokstaven versal) följt av PUNKT (.)\n• Nästa ord efter punkt ska ha stor bokstav\n• Exempel: "Skulpturer. 2 st, porträttbyster" (blir "SVEN GUNNARSSON. Skulpturer. 2 st, porträttbyster")\n• FÖRBJUDET: "SKULPTURER" (versaler) eller "skulpturer" (gemener)\n• KORREKT: "Skulpturer." (proper kapitalisering + punkt)' :
            '• Konstnär/formgivare-fältet är tomt:\n• FÖRSTA ORDET SKA VARA VERSALER (uppercase) följt av PUNKT (.)\n• Nästa ord efter punkt ska ha stor bokstav\n• Exempel: "BAJONETT. Eskilstuna, 1900-tal"\n• KORREKT: "BORDSLAMPOR. 2 st, Kosta Boda"'}

SPECIAL REGEL - KONSTNÄR I MITTEN/SLUTET AV TITEL:
• Om konstnärsnamn finns i MITTEN eller SLUTET av nuvarande titel (inte först) - BEHÅLL det där
• Detta gäller när OBJEKTET är huvudsaken, inte konstnären  
• Korrigera stavfel i konstnärsnamnet men behåll exakt position
• FÖRSTA ORDET ska vara VERSALER (objektnamnet är huvudsaken)
• EXEMPEL: "SERVISDELAR, 24 delar, porslin, Stig Lindberg, 'Spisa Ribb', Gustavsberg. 1900-tal."
• Flytta ALDRIG konstnären när den inte är i början - det är medvetet placerad

Returnera ENDAST den förbättrade titeln utan extra formatering eller etiketter.`;

      case 'title-correct':
        return baseInfo + `
UPPGIFT: Korrigera ENDAST grammatik, stavning och struktur i titeln. Behåll ordning och innehåll exakt som det är.

KRITISKT - MINIMALA ÄNDRINGAR:
• Lägg INTE till ny information, material eller tidsperioder
• Ändra INTE ordningen på elementer
• Ta INTE bort information
• Korrigera ENDAST:
  - Saknade mellanslag ("SVERIGEStockholm" → "SVERIGE Stockholm")
  - Felplacerade punkter ("TALLRIK. keramik" → "TALLRIK, keramik")
  - Saknade citattecken runt titlar/motiv ("Dune Mario Bellini" → "Dune" Mario Bellini)
  - Stavfel i välkända namn/märken
  - Kommatecken istället för punkt mellan objekt och material

EXEMPEL KORRIGERINGAR:
• "SERVIRINGSBRICKA, akryl.Dune Mario Bellini" → "SERVIRINGSBRICKA, akryl, "Dune" Mario Bellini"
• "TALLRIKkeramik Sverige" → "TALLRIK, keramik, Sverige"
• "VAS. glas, 1970-tal" → "VAS, glas, 1970-tal"

Returnera ENDAST den korrigerade titeln utan extra formatering eller etiketter.`;

      case 'description':
        return baseInfo + `
UPPGIFT: Förbättra endast beskrivningen. Inkludera mått om de finns, använd korrekt terminologi. Skriv naturligt och engagerande.

FÄLTAVGRÄNSNING FÖR BESKRIVNING:
• Inkludera ALDRIG konditionsinformation i beskrivningen
• Konditionsdetaljer som "slitage", "repor", "märken", "skador", "nagg", "sprickor", "fläckar" hör ENDAST hemma i konditionsfältet
• Beskrivningen ska fokusera på: material, teknik, mått, stil, ursprung, märkningar, funktion
• EXEMPEL PÅ FÖRBJUDET I BESKRIVNING: "Slitage förekommer", "repor och märken", "normalt åldersslitage", "mindre skador"
• KRITISKT: BEHÅLL ALLTID MÅTT OCH TEKNISKA SPECIFIKATIONER - dessa är INTE konditionsinformation
• BEHÅLL: "höjd 15,5 cm", "4 snapsglas", "2 vinglas", "består av", "bestående av" - detta är beskrivande information
• TA ENDAST BORT konditionsord som "slitage", "repor", "skador" - ALDRIG mått eller kvantiteter

VIKTIGT - PARAGRAFSTRUKTUR:
${itemData.artist && this.enableArtistInfo ?
            '• STRUKTUR: Befintlig beskrivning först, sedan ny konstnärsinformation i SEPARAT paragraf\n• FORMAT: Använd dubbla radbrytningar (\\n\\n) för att separera paragrafer\n• EXEMPEL: "Befintlig förbättrad beskrivning här...\\n\\nKort konstnärskontext här..."\n• Lägg till KORT, SPECIFIK kontext om denna modell/serie i SEPARAT paragraf\n• Max 1-2 meningar extra - fokusera på tillverkningsår och karakteristiska drag\n• UNDVIK allmänna beskrivningar av konstnärens karriär eller designfilosofi\n• Håll det relevant för just detta föremål' :
            '• Returnera befintlig förbättrad beskrivning\n• Lägg INTE till konstnärlig eller historisk kontext som inte finns i källdata'}
• Lägg INTE till mått som inte är angivna
• Lägg INTE till material som inte är nämnt (såvida det inte är känt från konstnärens typiska tekniker)
• Lägg INTE till märkningar eller signaturer som inte finns
• Förbättra språk, struktur och befintlig information
• Lägg ALDRIG till kommentarer om vad som "saknas" eller "behövs"

KRITISKT - RETURFORMAT:
• Returnera ENDAST beskrivningstexten med radbrytningar för separata paragrafer
• Använd dubbla radbrytningar (\\n\\n) för att separera paragrafer
• INGEN HTML-formatering, inga extra etiketter
• Exempel utan konstnärsinfo: "Förbättrad beskrivning här..."
• Exempel med konstnärsinfo: "Förbättrad beskrivning här...\\n\\nKonstnärskontext här..."

Returnera ENDAST den förbättrade beskrivningen med radbrytningar för paragrafindelning.`;

      case 'condition':
        return baseInfo + `
UPPGIFT: Förbättra konditionsrapporten. Skriv kort och faktabaserat. Max 2-3 korta meningar. Använd naturligt språk.

FÄLTAVGRÄNSNING FÖR KONDITION:
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

STRIKT REGEL: Kopiera ENDAST den skadeinformation som redan finns - lägg ALDRIG till nya detaljer.

Returnera ENDAST den förbättrade konditionsrapporten utan extra formatering eller etiketter.`;

      case 'keywords':
        return baseInfo + `
UPPGIFT: Generera HÖGKVALITATIVA dolda sökord som kompletterar titel och beskrivning enligt Auctionets format.

KRITISKT - UNDVIK ALLA UPPREPNINGAR:
• Generera ENDAST sökord som INTE redan finns i nuvarande titel/beskrivning
• Läs noggrant igenom titel och beskrivning INNAN du skapar sökord
• Om ordet redan finns någonstans - använd det INTE
• Fokusera på HELT NYA alternativa söktermer som köpare kan använda
• Kontrollera även PARTIELLA matchningar: "litografi" matchar "färglitografi"
• Exempel: Om titel säger "färglitografi" - använd INTE "litografi" eller "färglitografi"
• KONKRETA EXEMPEL: Om beskrivning säger "blomstermotiv" → använd INTE "blomstermotiv", använd "växtmotiv" istället
• KONKRETA EXEMPEL: Om beskrivning säger "orkidén" → använd INTE "orkidé", använd "flora" istället


KOMPLETTERANDE SÖKORD - EXEMPEL:
• För konsttryck: "grafik reproduktion konstprint limited-edition"
• För målningar: "oljemålning akvarell konstverk originalverk"  
• För skulptur: "skulptur plastik konstföremål tredimensionell"
• För möbler: "vintage retro funktionalism dansk-design"
• För perioder: Använd decennier istället för exakta år: "1970-tal" istället av "1974"

OBLIGATORISK AUCTIONET FORMAT:
• Separera sökord med MELLANSLAG (ALDRIG kommatecken)
• Använd "-" för flerordsfraser: "svensk-design", "1970-tal", "limited-edition"
• EXEMPEL KORREKT: "grafik reproduktion svensk-design 1970-tal konstprint"
• EXEMPEL FEL: "grafik, reproduktion, svensk design, 1970-tal" (kommatecken och mellanslag i fraser)

KRITISKT - RETURFORMAT:
• Returnera ENDAST sökorden separerade med mellanslag
• INGA kommatecken mellan sökord
• INGA förklaringar, kommentarer eller etiketter
• MAX 10-12 relevanta termer
• EXEMPEL: "grafik reproduktion svensk-design 1970-tal dekor inredning"

STRIKT REGEL: Läs titel och beskrivning noggrant - om ett ord redan finns där (även delvis), använd det ALDRIG i sökorden.`;

      case 'search_query':
        return `You are an expert auction search optimizer. Generate 2-3 optimal search terms for finding comparable items.

TITLE: "${itemData.title}"
DESCRIPTION: "${itemData.description}"

GUIDELINES:
1. PRIORITY: Brand/Manufacturer → Model → Category
2. NEVER use years, conditions, technical specs, or materials (unless luxury)
3. BE CONSERVATIVE: Better few good results than many mixed
4. EXAMPLES:
   - "SYNTHESIZER, Yamaha DX7..." → ["Yamaha", "DX7"] 
   - "ROLEX Submariner..." → ["Rolex", "Submariner"]
   - "RING, 18k gold..." → ["18k gold", "ring"]

Return JSON only:
{
  "searchTerms": ["term1", "term2"],
  "reasoning": "Brief explanation", 
  "confidence": 0.9
}`;

      default:
        return baseInfo;
    }
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

    // CRITICAL: Check for date speculation/hallucination
    const originalTitle = document.querySelector('#item_title_sv')?.value || '';
    const dateSpeculationCheck = this.detectDateSpeculation(originalTitle, title);
    if (dateSpeculationCheck.hasSpeculation) {
      dateSpeculationCheck.speculations.forEach(speculation => {
        errors.push(`DATUM HALLUCINATION: "${speculation.expanded}" - originalet säger bara "${speculation.original}". Expandera ALDRIG partiella årtal!`);
      });
    }

    // Check for uncertainty markers preservation
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

  // NEW: Detect date speculation and hallucination
  detectDateSpeculation(original, enhanced) {
    const speculations = [];

    // Pattern to find partial dates in original (like "55", "daterad 55", "signerad 55")
    const partialDatePattern = /(daterad|signerad|märkt|stämplad)?\s*(\d{2})\b/gi;

    let match;
    while ((match = partialDatePattern.exec(original)) !== null) {
      const [fullMatch, prefix, twoDigitYear] = match;
      const prefixPart = prefix ? prefix.trim() : '';

      // Check if the enhanced version has expanded this to a full year
      const expandedPatterns = [
        new RegExp(`${prefixPart}\\s*1[6-9]${twoDigitYear}\\b`, 'i'), // 1655, 1755, 1855, 1955
        new RegExp(`${prefixPart}\\s*20${twoDigitYear}\\b`, 'i'),      // 2055 (unlikely but possible)
      ];

      // Also check for cases where prefix is removed and just the year appears
      if (prefixPart) {
        expandedPatterns.push(new RegExp(`\\b1[6-9]${twoDigitYear}\\b`, 'i'));
        expandedPatterns.push(new RegExp(`\\b20${twoDigitYear}\\b`, 'i'));
      }

      expandedPatterns.forEach(pattern => {
        const expandedMatch = enhanced.match(pattern);
        if (expandedMatch) {
          // Make sure this expansion doesn't already exist in the original
          const expandedYear = expandedMatch[0].trim();
          if (!original.includes(expandedYear)) {
            speculations.push({
              original: fullMatch.trim(),
              expanded: expandedMatch[0].trim(),
              position: match.index
            });
          }
        }
      });
    }

    return {
      hasSpeculation: speculations.length > 0,
      speculations
    };
  }

  // AI-powered artist detection methods - UPDATED to use AI Analysis Engine
  async analyzeForArtist(title, objectType, artistField, description = '', options = {}) {
    return await this.aiAnalysisEngine.analyzeForArtist(title, objectType, artistField, description, options);
  }

  async verifyArtist(artistName, objectType, period) {
    return await this.aiAnalysisEngine.verifyArtist(artistName, objectType, period);
  }

  parseArtistAnalysisResponse(responseText) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Validate the response structure
        if (typeof parsed.hasArtist === 'boolean' &&
          typeof parsed.confidence === 'number' &&
          parsed.confidence >= 0 && parsed.confidence <= 1) {

          return {
            hasArtist: parsed.hasArtist,
            artistName: parsed.artistName || null,
            foundIn: parsed.foundIn || 'unknown',
            suggestedTitle: parsed.suggestedTitle || null,
            suggestedDescription: parsed.suggestedDescription || null,
            confidence: parsed.confidence,
            reasoning: parsed.reasoning || '',
            source: 'ai'
          };
        }
      }

      // Fallback parsing if JSON is malformed
      const hasArtist = /hasArtist['":\s]*true/i.test(responseText);
      const artistMatch = responseText.match(/artistName['":\s]*["']([^"']+)["']/i);
      const confidenceMatch = responseText.match(/confidence['":\s]*([0-9.]+)/i);
      const foundInMatch = responseText.match(/foundIn['":\s]*["']([^"']+)["']/i);

      if (hasArtist && artistMatch && confidenceMatch) {
        return {
          hasArtist: true,
          artistName: artistMatch[1],
          foundIn: foundInMatch ? foundInMatch[1] : 'unknown',
          suggestedTitle: null,
          suggestedDescription: null,
          confidence: parseFloat(confidenceMatch[1]),
          reasoning: 'Fallback parsing',
          source: 'ai'
        };
      }

      return null;
    } catch (error) {
      console.error('Error parsing AI artist analysis response:', error);
      return null;
    }
  }

  parseArtistVerificationResponse(responseText) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Validate the response structure
        if (typeof parsed.isRealArtist === 'boolean' &&
          typeof parsed.confidence === 'number' &&
          parsed.confidence >= 0 && parsed.confidence <= 1) {

          return {
            isRealArtist: parsed.isRealArtist,
            confidence: parsed.confidence,
            biography: parsed.biography || null,
            specialties: parsed.specialties || null,
            activeYears: parsed.activeYears || null,
            relevanceToObject: parsed.relevanceToObject || null
          };
        }
      }

      return null;
    } catch (error) {
      console.error('Error parsing AI artist verification response:', error);
      return null;
    }
  }

  // Market analysis methods
  async analyzeComparableSales(artistName, objectType, period, technique, description, currentValuation = null) {

    try {

      // Run historical and live analysis in parallel
      const [historicalResult, liveResult] = await Promise.all([
        this.auctionetAPI.analyzeComparableSales(artistName, objectType, period, technique, currentValuation, this.searchQuerySSoT),
        this.auctionetAPI.analyzeLiveAuctions(artistName, objectType, period, technique, this.searchQuerySSoT)
      ]);

      // Combine historical and live data intelligently
      if (historicalResult || liveResult) {

        // Create SSoT for WORKING search queries (the ones that actually found data)
        const workingQueries = {
          historical: historicalResult?.actualSearchQuery || null,
          live: liveResult?.actualSearchQuery || null
        };

        // Determine the best working query for dashboard links (prioritize historical)
        const bestWorkingQuery = workingQueries.historical || workingQueries.live;

        if (workingQueries.historical !== workingQueries.live && workingQueries.historical && workingQueries.live) {
          console.log(`⚠️ SEARCH QUERY MISMATCH DETECTED:`);
          console.log(`   Historical query: "${workingQueries.historical}"`);
          console.log(`   Live query: "${workingQueries.live}"`);
        } else {
        }

        const combinedResult = {
          hasComparableData: !!(historicalResult || liveResult),
          dataSource: 'auctionet_comprehensive',

          // Historical data (if available)
          historical: historicalResult ? {
            priceRange: historicalResult.priceRange,
            confidence: historicalResult.confidence,
            analyzedSales: historicalResult.analyzedSales,
            totalMatches: historicalResult.totalMatches,
            marketContext: historicalResult.marketContext,
            trendAnalysis: historicalResult.trendAnalysis,
            recentSales: historicalResult.recentSales,
            limitations: historicalResult.limitations,
            exceptionalSales: historicalResult.exceptionalSales, // NEW: Pass through exceptional sales
            actualSearchQuery: historicalResult.actualSearchQuery, // NEW: Pass through actual search query
            searchStrategy: historicalResult.searchStrategy // NEW: Pass through search strategy
          } : null,

          // Live data (if available)
          live: liveResult ? {
            currentEstimates: liveResult.currentEstimates,
            currentBids: liveResult.currentBids,
            marketActivity: liveResult.marketActivity,
            marketSentiment: liveResult.marketSentiment,
            analyzedLiveItems: liveResult.analyzedLiveItems,
            totalMatches: liveResult.totalMatches,
            liveItems: liveResult.liveItems,
            actualSearchQuery: liveResult.actualSearchQuery, // NEW: Pass through actual search query
            searchStrategy: liveResult.searchStrategy // NEW: Pass through search strategy
          } : null,

          // Combined insights
          insights: this.generateCombinedInsights(historicalResult, liveResult, currentValuation),

          // Maintain backward compatibility
          priceRange: historicalResult?.priceRange || this.estimatePriceRangeFromLive(liveResult),
          confidence: this.calculateCombinedConfidence(historicalResult, liveResult),
          marketContext: this.generateCombinedMarketContext(historicalResult, liveResult)
        };

        return combinedResult;
      } else {
        console.log('❌ No market data found (neither historical nor live)');

        // Fallback to Claude analysis if no Auctionet data found
        return await this.analyzeComparableSalesWithClaude(artistName, objectType, period, technique, description);
      }

    } catch (error) {
      console.error('💥 Market analysis error, falling back to Claude:', error);

      // Fallback to Claude analysis on error
      return await this.analyzeComparableSalesWithClaude(artistName, objectType, period, technique, description);
    }
  }

  // NEW: Enhanced sales analysis that accepts search context for artist, brand, and freetext searches
  async analyzeSales(searchContext) {

    const {
      primarySearch,
      objectType,
      period,
      technique,
      analysisType,
      searchStrategy,
      confidence,
      termCount
    } = searchContext;

    // Store original SSoT query for logging purposes only
    const originalSSoTQuery = this.searchQuerySSoT ? this.searchQuerySSoT.getCurrentQuery() : null;

    let analysisResult;

    try {
      if (analysisType === 'artist') {
        analysisResult = await this.analyzeComparableSales(primarySearch, objectType, period, technique);
      } else if (analysisType === 'brand') {
        analysisResult = await this.analyzeComparableSales(primarySearch, objectType, period, technique);
      } else if (analysisType === 'freetext') {
        analysisResult = await this.analyzeComparableSales(primarySearch, objectType, period, technique);
      } else {
        analysisResult = await this.analyzeComparableSales(primarySearch, objectType, period, technique);
      }


      // Keep original SSoT query intact - NO OVERRIDES


      return analysisResult;

    } catch (error) {
      console.error('❌ Market analysis failed:', error);
      throw error;
    }
  }

  // NEW: Generate combined insights from historical and live data
  generateCombinedInsights(historicalResult, liveResult, currentValuation = null) {
    const insights = [];

    if (historicalResult && liveResult) {
      // Get market activity context first to inform all other insights
      const marketActivity = liveResult.marketActivity;
      const reserveMetPercentage = marketActivity ? marketActivity.reservesMetPercentage : null;
      const analyzedLiveItems = liveResult.analyzedLiveItems || 0;
      const totalBids = marketActivity ? marketActivity.totalBids : 0;
      const averageBidsPerItem = marketActivity ? marketActivity.averageBidsPerItem : 0;

      // MINIMUM SAMPLE SIZE CHECK: Need at least 4 live auctions for reliable reserve percentage statistics
      const hasReliableMarketData = analyzedLiveItems >= 4;
      const isWeakMarket = hasReliableMarketData && reserveMetPercentage !== null && reserveMetPercentage < 40;
      const isStrongMarket = hasReliableMarketData && reserveMetPercentage !== null && reserveMetPercentage > 70;

      // NEW: Create more specific bidding activity description
      function getBiddingActivityDescription() {
        const searchQuery = historicalResult.actualSearchQuery || liveResult.actualSearchQuery || '';
        let auctionText = `${analyzedLiveItems} auktioner`;

        // Add clickable link if we have a search query (similar to "Pågående" link in data sources)
        if (searchQuery) {
          // SAFETY CHECK: Use fallback URL generation since this is a nested function
          const liveUrl = `https://auctionet.com/sv/search?event_id=&q=${encodeURIComponent(searchQuery)}`;
          auctionText = `<a href="${liveUrl}" target="_blank" style="color: #e74c3c; text-decoration: none; font-weight: 500;" title="Visa alla pågående auktioner på Auctionet för '${searchQuery}'">${analyzedLiveItems} auktioner</a>`;
        }

        if (totalBids === 0) {
          return `inga bud (${auctionText})`;
        } else if (reserveMetPercentage === 0) {
          return `bud finns men 0% utrop nås (${Math.round(averageBidsPerItem * 10) / 10} bud/auktion, ${auctionText})`;
        } else {
          return `${reserveMetPercentage}% utrop nås (${auctionText})`;
        }
      }



      // CRITICAL FIX: Check if priceRange exists before accessing its properties
      if (!historicalResult.priceRange || !historicalResult.priceRange.low || !historicalResult.priceRange.high) {
        console.warn('⚠️ Historical result missing priceRange data, skipping price comparison insights');
        return insights; // Return early with empty insights
      }

      // Compare historical vs live pricing WITH market context
      const histAvg = (historicalResult.priceRange.low + historicalResult.priceRange.high) / 2;
      const liveAvg = liveResult.currentEstimates ?
        (liveResult.currentEstimates.low + liveResult.currentEstimates.high) / 2 : null;

      if (liveAvg && currentValuation) {
        // SMART LOGIC: Consider cataloger's current valuation in context
        const priceDiff = ((liveAvg - histAvg) / histAvg) * 100;
        const catalogerVsHist = ((currentValuation - histAvg) / histAvg) * 100;
        const catalogerVsLive = ((currentValuation - liveAvg) / liveAvg) * 100;

        // Only provide insights if the difference is significant
        if (Math.abs(priceDiff) > 15) {
          let message = '';
          let significance = 'medium';

          // CONTEXT-AWARE LOGIC: Consider market strength AND cataloger's position
          if (isWeakMarket) {
            // WEAK MARKET: Be more conservative with all recommendations
            if (catalogerVsHist > 50) {
              // Cataloger is above historical in weak market - definitely too high
              message = `Svag marknad (${getBiddingActivityDescription()}) och din värdering ${Math.round(catalogerVsHist)}% över historiska värden - sänk betydligt`;
              significance = 'high';
            } else if (priceDiff > 30) {
              // Live estimates are high but market is weak - be cautious
              message = `Trots att pågående auktioner värderas ${Math.round(priceDiff)}% högre än historiska försäljningar är marknaden svag (${getBiddingActivityDescription()}) - var försiktig`;
              significance = 'high';
            } else if (catalogerVsLive > 20) {
              // Cataloger above live estimates in weak market
              message = `Svag marknad (${getBiddingActivityDescription()}) - din värdering ligger över pågående auktioner, överväg att sänka`;
              significance = 'medium';
            }
          } else if (isStrongMarket) {
            // STRONG MARKET: Be more optimistic but still realistic
            if (catalogerVsHist < -20 && priceDiff > 30) {
              // Cataloger is conservative but market is strong and live is high
              message = `Stark marknad (${getBiddingActivityDescription()}) och pågående auktioner värderas ${Math.round(priceDiff)}% högre än historiska försäljningar - överväg att höja`;
              significance = 'medium';
            } else if (catalogerVsHist > 100) {
              // Even in strong market, don't be too aggressive
              message = `Trots stark marknad (${getBiddingActivityDescription()}) är din värdering ${Math.round(catalogerVsHist)}% över historiska värden - överväg att sänka`;
              significance = 'medium';
            } else if (priceDiff > 50) {
              // Live is much higher and market is strong
              message = `Stark marknad (${getBiddingActivityDescription()}) och pågående auktioner värderas ${Math.round(priceDiff)}% högre än historiska försäljningar - gynnsam marknad`;
              significance = 'medium';
            }
          } else {
            // NORMAL MARKET: Use balanced logic
            if (catalogerVsHist > 100) {
              // Cataloger is way above historical
              if (priceDiff > 30) {
                // Live is also high, but cataloger is even worse
                message = `Pågående auktioner värderas ${Math.round(priceDiff)}% över historiska försäljningar, men din värdering är ${Math.round(catalogerVsHist)}% över - överväg att sänka`;
                significance = 'high';
              } else {
                // Live is reasonable, cataloger is the problem
                message = `Din värdering ligger ${Math.round(catalogerVsHist)}% över historiska värden - överväg att sänka`;
                significance = 'high';
              }
            } else if (catalogerVsHist > 50) {
              // Cataloger is moderately above historical
              if (priceDiff > 50) {
                // Live is much higher, maybe market is heating up
                message = `Pågående auktioner värderas ${Math.round(priceDiff)}% högre än historiska försäljningar - marknad kan vara starkare`;
                significance = 'medium';
              } else {
                // Live is moderately higher, cataloger should be cautious
                message = `Både pågående auktioner och din värdering ligger över historiska värden - överväg försiktig prissättning`;
                significance = 'medium';
              }
            } else if (catalogerVsHist < -20) {
              // Cataloger is below historical
              if (priceDiff > 30) {
                // Live is much higher, cataloger might be too conservative
                message = `Pågående auktioner värderas ${Math.round(priceDiff)}% högre än historiska försäljningar - överväg att höja utropet`;
                significance = 'medium';
              }
            } else {
              // Cataloger is reasonably close to historical
              if (priceDiff > 50) {
                // Live is much higher
                message = `Pågående auktioner värderas ${Math.round(priceDiff)}% högre än historiska försäljningar - stark marknad för liknande objekt`;
                significance = 'medium';
              } else if (priceDiff < -30) {
                // Live is much lower
                message = `Pågående auktioner värderas ${Math.abs(Math.round(priceDiff))}% lägre än historiska försäljningar - marknad kan vara svagare`;
                significance = 'medium';
              }
            }
          }

          if (message) {
            insights.push({
              type: 'price_comparison',
              message: message,
              significance: significance
            });
          }
        }
      } else if (liveAvg && !currentValuation) {
        // Fallback to old logic if no current valuation provided, but still consider market context
        const priceDiff = ((liveAvg - histAvg) / histAvg) * 100;
        if (Math.abs(priceDiff) > 15) {
          let message = '';
          let significance = Math.abs(priceDiff) > 30 ? 'high' : 'medium';

          if (isWeakMarket && priceDiff > 15) {
            // In weak market, be cautious about higher live estimates
            message = `KONFLIKT: Pågående auktioner värderas ${Math.round(priceDiff)}% högre än slutpriser, men marknaden är svag (${getBiddingActivityDescription()}) - höga utrop möter låg efterfrågan`;
            significance = 'high';
          } else if (!hasReliableMarketData && reserveMetPercentage !== null && reserveMetPercentage < 40 && priceDiff > 15) {
            // Even with limited data, warn about weak market indicators
            message = `VARNING: Pågående auktioner värderas ${Math.round(priceDiff)}% högre än slutpriser, men ${getBiddingActivityDescription()} - höga utrop möter låg efterfrågan`;
            significance = 'high';
          } else if (isStrongMarket && priceDiff > 15) {
            // In strong market, higher estimates are more reliable
            message = `Stark marknad (${getBiddingActivityDescription()}) och pågående auktioner värderas ${Math.round(priceDiff)}% högre än historiska försäljningar - gynnsam marknad`;
            significance = 'medium';
          } else {
            // Normal market logic
            if (priceDiff > 30) {
              message = `Pågående auktioner värderas ${Math.round(priceDiff)}% högre än historiska försäljningar`;
            } else if (priceDiff > 15) {
              message = `Pågående auktioner värderas ${Math.round(priceDiff)}% högre än historiska försäljningar - nuvarande marknad verkar starkare`;
            } else if (priceDiff < -30) {
              message = `Pågående auktioner värderas ${Math.abs(Math.round(priceDiff))}% lägre än historiska försäljningar`;
            } else if (priceDiff < -15) {
              message = `Pågående auktioner värderas ${Math.abs(Math.round(priceDiff))}% lägre än historiska försäljningar - nuvarande marknad verkar svagare`;
            }
          }

          if (message) {
            insights.push({
              type: 'price_comparison',
              message: message,
              significance: significance
            });
          }
        }
      }

      // Market activity insights - but don't duplicate if already mentioned in price comparison
      if (marketActivity && hasReliableMarketData && !insights.some(insight => insight.message.includes('utrop nås') || insight.message.includes('inga bud') || insight.message.includes('bud finns'))) {
        if (reserveMetPercentage > 70) {
          insights.push({
            type: 'market_strength',
            message: `Stark marknad: ${getBiddingActivityDescription()} - gynnsam försäljningsmiljö`,
            significance: 'high'
          });
        } else if (reserveMetPercentage < 30) {
          if (totalBids === 0) {
            insights.push({
              type: 'market_weakness',
              message: `Utmanande marknad: ${getBiddingActivityDescription()} - överväg försiktig prissättning`,
              significance: 'high'
            });
          } else {
            insights.push({
              type: 'market_weakness',
              message: `Utmanande marknad: ${getBiddingActivityDescription()} - överväg försiktig prissättning`,
              significance: 'medium'
            });
          }
        }
      } else if (marketActivity && !hasReliableMarketData && analyzedLiveItems > 0) {
        // Alternative message when we have some live data but not enough for reliable statistics
        if (totalBids === 0) {
          insights.push({
            type: 'market_info',
            message: `Begränsad marknadsdata: ${getBiddingActivityDescription()} - för få för pålitlig marknadsanalys`,
            significance: 'medium'
          });
        } else {
          insights.push({
            type: 'market_info',
            message: `Begränsad marknadsdata: Endast ${analyzedLiveItems} pågående auktioner analyserade - för få för pålitlig marknadsanalys`,
            significance: 'low'
          });
        }
      }
    }

    return insights;
  }

  // NEW: Calculate combined confidence from both data sources
  calculateCombinedConfidence(historicalResult, liveResult) {
    if (historicalResult && liveResult) {
      // Both sources available - higher confidence
      return Math.min(1.0, (historicalResult.confidence + 0.2));
    } else if (historicalResult) {
      return historicalResult.confidence;
    } else if (liveResult) {
      // Live data only - moderate confidence
      return Math.min(0.8, 0.5 + (liveResult.analyzedLiveItems / 20));
    }
    return 0.3;
  }

  // NEW: Estimate price range from live auction data
  estimatePriceRangeFromLive(liveResult) {
    if (!liveResult || !liveResult.currentEstimates) {
      return null;
    }

    return {
      low: liveResult.currentEstimates.low,
      high: liveResult.currentEstimates.high,
      currency: 'SEK'
    };
  }

  // NEW: Generate combined market context
  generateCombinedMarketContext(historicalResult, liveResult) {
    const contexts = [];

    if (historicalResult?.marketContext) {
      contexts.push(historicalResult.marketContext);
    }

    if (liveResult?.marketSentiment) {
      const sentimentMap = {
        'strong': 'Stark efterfrågan i pågående auktioner',
        'moderate': 'Måttlig aktivitet i pågående auktioner',
        'weak': 'Låg aktivitet i pågående auktioner',
        'neutral': 'Normal aktivitet i pågående auktioner'
      };
      contexts.push(sentimentMap[liveResult.marketSentiment] || 'Pågående auktionsaktivitet');
    }

    return contexts.join(' • ');
  }

  // Fallback method using Claude AI (original implementation)
  async analyzeComparableSalesWithClaude(artistName, objectType, period, technique, description) {

    if (!this.apiKey) {
      console.log('❌ No API key available, skipping Claude sales analysis');
      return null;
    }

    // Only analyze if we have sufficient information
    if (!artistName || artistName.trim().length < 3) {
      return null;
    }


    try {
      const prompt = `Analysera jämförbara försäljningar för denna svenska auktionspost:

KONSTNÄR: ${artistName}
OBJEKTTYP: ${objectType || 'Okänd'}
PERIOD: ${period || 'Okänd'}
TEKNIK: ${technique || 'Okänd'}
BESKRIVNING: ${description ? description.substring(0, 200) : 'Ingen beskrivning'}

Som expert på svensk konstmarknad, analysera:

1. JÄMFÖRBARA FÖRSÄLJNINGAR:
   - Prisintervall för liknande verk av denna konstnär
   - Senaste marknadsaktivitet (om känd)
   - Faktorer som påverkar värdering

2. KONFIDENSANALYS:
   - Hur säker är denna analys? (0.1-1.0)
   - Vad baseras analysen på?
   - Begränsningar i data

3. MARKNADSKONTEXT:
   - Konstnärens marknadsstatus
   - Trend för denna typ av verk
   - Regionala faktorer (svensk/nordisk marknad)

Svara ENDAST med giltig JSON:
{
  "hasComparableData": boolean,
  "priceRange": {
    "low": number (SEK),
    "high": number (SEK),
    "currency": "SEK"
  },
  "confidence": number (0.1-1.0),
  "confidenceFactors": {
    "artistRecognition": number (0.1-1.0),
    "dataAvailability": number (0.1-1.0),
    "marketActivity": number (0.1-1.0),
    "comparabilityQuality": number (0.1-1.0)
  },
  "marketContext": {
    "artistStatus": string,
    "marketTrend": string,
    "recentActivity": string
  },
  "comparableSales": [
    {
      "description": string,
      "priceRange": string,
      "relevance": number (0.1-1.0)
    }
  ],
  "limitations": string,
  "reasoning": string
}`;

      console.log('📤 Sending Claude comparable sales request via Chrome runtime...');

      // Use Chrome runtime messaging instead of direct fetch
      const response = await new Promise((resolve, reject) => {
        console.log('📨 Calling chrome.runtime.sendMessage for Claude sales analysis...');

        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiKey,
          body: {
            model: this.getCurrentModel().id,
            max_tokens: 1000,
            temperature: 0.1, // Low temperature for consistent analysis
            messages: [{
              role: 'user',
              content: prompt
            }]
          }
        }, (response) => {
          console.log('📥 Chrome runtime response received:', response);

          if (chrome.runtime.lastError) {
            console.error('❌ Chrome runtime error:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.success) {
            resolve(response);
          } else {
            console.error('❌ Chrome runtime failed:', response);
            reject(new Error(response?.error || 'API request failed'));
          }
        });
      });


      if (response.success && response.data?.content?.[0]?.text) {
        const content = response.data.content[0].text;

        // Parse JSON response with fallback
        let salesData;
        try {
          salesData = JSON.parse(content);
        } catch (parseError) {
          console.warn('⚠️ JSON parsing failed, attempting fallback parsing:', parseError);
          salesData = this.fallbackParseSalesData(content);
        }

        if (salesData && salesData.hasComparableData) {
          // Mark as AI estimate
          salesData.dataSource = 'claude_ai_estimate';
          return salesData;
        } else {
          console.log('❌ No comparable sales data found in Claude response');
          return null;
        }
      } else {
        console.error('❌ Invalid Claude comparable sales response structure:', response);
        return null;
      }
    } catch (error) {
      console.error('💥 Error in Claude comparable sales analysis:', error);
      console.error('💥 Error stack:', error.stack);
      return null;
    }
  }

  // Fallback parser for sales data if JSON parsing fails
  fallbackParseSalesData(content) {

    try {
      // Look for price ranges in the text
      const priceMatch = content.match(/(\d+[\s,]*\d*)\s*-\s*(\d+[\s,]*\d*)\s*(?:SEK|kr|kronor)/i);
      const confidenceMatch = content.match(/confidence["\s:]*(\d+\.?\d*)/i);

      if (priceMatch) {
        const low = parseInt(priceMatch[1].replace(/[\s,]/g, ''));
        const high = parseInt(priceMatch[2].replace(/[\s,]/g, ''));
        const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.3;

        return {
          hasComparableData: true,
          priceRange: {
            low: low,
            high: high,
            currency: "SEK"
          },
          confidence: Math.min(confidence, 1.0),
          confidenceFactors: {
            artistRecognition: 0.5,
            dataAvailability: 0.3,
            marketActivity: 0.4,
            comparabilityQuality: 0.4
          },
          marketContext: {
            artistStatus: "Analys från textparsning",
            marketTrend: "Begränsad data",
            recentActivity: "Okänd"
          },
          comparableSales: [],
          limitations: "Begränsad analys från textparsning",
          reasoning: "Fallback-analys använd på grund av JSON-parsningsfel"
        };
      }
    } catch (error) {
      console.error('Fallback parsing failed:', error);
    }

    return null;
  }

  // NEW: Set SearchQuerySSoT for AI-only search decisions
  setSearchQuerySSoT(searchQuerySSoT) {
    this.searchQuerySSoT = searchQuerySSoT;
  }

  // NEW: AI-powered search term extraction
  async generateAISearchTerms(prompt) {
    try {

      const response = await this.callClaudeAPI({
        title: 'AI Search Term Extraction',
        description: prompt
      }, 'search_query');

      // Parse the JSON response
      let parsedResponse;
      try {
        // Handle markdown code blocks
        let cleanResponse = response;
        if (response.includes('```json')) {
          cleanResponse = response
            .replace(/```json\s*/g, '')
            .replace(/```\s*/g, '')
            .trim();
        }

        parsedResponse = JSON.parse(cleanResponse);

        return parsedResponse;
      } catch (parseError) {
        console.error('❌ AI Manager: Failed to parse JSON:', parseError);
        throw new Error('Invalid JSON in AI response');
      }

    } catch (error) {
      console.error('❌ AI Manager: AI search term generation failed:', error);
      throw error;
    }
  }
} 