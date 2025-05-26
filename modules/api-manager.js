// modules/api-manager.js - API Management Module
import { CONFIG, getCurrentModel } from './config.js';

export class APIManager {
  constructor() {
    this.apiKey = null;
  }

  async loadApiKey() {
    try {
      const result = await chrome.storage.sync.get(['anthropicApiKey', 'selectedModel']);
      this.apiKey = result.anthropicApiKey;
      
      // Update model selection if stored
      if (result.selectedModel && CONFIG.MODELS[result.selectedModel]) {
        CONFIG.CURRENT_MODEL = result.selectedModel;
        console.log('Model loaded from storage:', CONFIG.MODELS[result.selectedModel].name);
      }
      
      console.log('API key loaded from storage:', this.apiKey ? 'Found' : 'Not found');
    } catch (error) {
      console.error('Error loading API key:', error);
      this.apiKey = null;
    }
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
            model: getCurrentModel().id,
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
        console.log(`API overloaded, retrying in ${delay}ms (attempt ${retryCount + 1}/3)`);
        
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
    console.log('Received API response:', data);
    
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
            model: getCurrentModel().id,
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
        console.log('Received correction response:', correctionData);
        
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
    console.log('Parsing Claude response for fieldType:', fieldType, 'Response:', response);
    
    if (!response || typeof response !== 'string') {
      console.error('Invalid response format:', response);
      throw new Error('Invalid response format from Claude');
    }
    
    // For single field requests
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
      
      if (Object.keys(result).length === 0) {
        result[fieldType] = response.trim();
      }
      
      console.log('Single field parsed result:', result);
      return result;
    }
    
    // Parse multi-field responses
    const result = {};
    const lines = response.split('\n');
    
    console.log('Parsing multi-field response, lines:', lines);
    
    lines.forEach(line => {
      const trimmedLine = line.trim();
      
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
      // Handle simple formats
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
    
    if (Object.keys(result).length === 0 && response.trim().length > 0) {
      console.log('No fields found, using entire response as title');
      result.title = response.trim();
    }
    
    console.log('Multi-field parsed result:', result);
    console.log('Fields found:', Object.keys(result));
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
Om konstnär-fält tomt: [KONSTNÄR], [Föremål], [Material], [Period] - FÖRSTA ORDET VERSALER
Om konstnär-fält ifyllt: [föremål], [Material], [Period] - FÖRSTA ORDET GEMENER (konstnärens namn läggs till automatiskt)

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
  'Konstnär/formgivare-fältet är ifyllt (' + itemData.artist + '), så inkludera INTE konstnärens namn i titeln - det läggs till automatiskt av systemet. FÖRSTA ORDET I TITELN SKA VARA GEMENER (lowercase).' : 
  'Konstnär/formgivare-fältet är tomt, så inkludera konstnärens namn i titeln om det är känt. FÖRSTA ORDET I TITELN SKA VARA VERSALER (uppercase).'}

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

    // Return field-specific prompts based on fieldType
    switch(fieldType) {
      case 'all':
      case 'all-sparse':
        return baseInfo + `
UPPGIFT: Förbättra titel, beskrivning, konditionsrapport och generera dolda sökord enligt svenska auktionsstandarder.

KRITISKT - FÄLTAVGRÄNSNING:
• BESKRIVNING: Material, teknik, mått, stil, ursprung, märkningar, funktion - ALDRIG konditionsinformation
• KONDITION: Endast fysiskt skick och skador - ALDRIG beskrivande information
• Håll fälten strikt separerade - konditionsdetaljer som "slitage", "repor", "märken" hör ENDAST i konditionsfältet
• Om konditionsinformation finns i nuvarande beskrivning - flytta den till konditionsfältet

KRITISKT - FÖRSTA ORDETS KAPITALISERING I TITEL:
${itemData.artist ? 
  '• Konstnär/formgivare-fältet är ifyllt - FÖRSTA ORDET I TITEL SKA VARA GEMENER (lowercase)' : 
  '• Konstnär/formgivare-fältet är tomt - FÖRSTA ORDET I TITEL SKA VARA VERSALER (uppercase)'}

Returnera EXAKT i detta format (en rad per fält):
TITEL: [förbättrad titel]
BESKRIVNING: [förbättrad beskrivning utan konditionsinformation]
KONDITION: [förbättrad konditionsrapport]
SÖKORD: [relevanta sökord separerade med mellanslag, använd "-" för flerordsfraser]

VIKTIGT FÖR SÖKORD: Använd Auctionets format med mellanslag mellan sökord och "-" för flerordsfraser.
EXEMPEL: "konstglas mundblåst svensk-design 1960-tal samlarobjekt"

Använd INTE markdown formatering eller extra tecken som ** eller ***. Skriv bara ren text.`;

      case 'title':
        return baseInfo + `
UPPGIFT: Förbättra endast titeln enligt svenska auktionsstandarder. Max 60 tecken.

KRITISKT - FÖRSTA ORDETS KAPITALISERING:
${itemData.artist ? 
  '• Konstnär/formgivare-fältet är ifyllt - FÖRSTA ORDET SKA VARA GEMENER (lowercase)\n• Exempel: "bajonett, Eskilstuna, 1900-tal" (konstnärens namn läggs till automatiskt)' : 
  '• Konstnär/formgivare-fältet är tomt - FÖRSTA ORDET SKA VARA VERSALER (uppercase)\n• Exempel: "BAJONETT, Eskilstuna, 1900-tal"'}

Returnera ENDAST den förbättrade titeln utan extra formatering eller etiketter.`;

      case 'description':
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

Returnera ENDAST den förbättrade beskrivningen utan extra formatering eller etiketter.`;

      case 'condition':
        return baseInfo + `
UPPGIFT: Förbättra konditionsrapporten. Skriv KORT och FAKTABASERAT. Max 2-3 korta meningar.

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

STRIKT REGEL: Kopiera ENDAST den skadeinformation som redan finns - lägg ALDRIG till nya detaljer.

Returnera ENDAST den förbättrade konditionsrapporten utan extra formatering eller etiketter.`;

      case 'keywords':
        return baseInfo + `
UPPGIFT: Generera HÖGKVALITATIVA dolda sökord enligt Auctionets format. MAX 10-12 sökord totalt.

KRITISKT - AUCTIONET SÖKORD FORMAT:
• Separera sökord med MELLANSLAG (inte kommatecken)
• Använd "-" för flerordsfraser: "konstglas" blir "konstglas", "svensk design" blir "svensk-design"
• EXEMPEL PÅ KORREKT FORMAT: "konstglas mundblåst svensk-design 1960-tal samlarobjekt skandinavisk-form"
• EXEMPEL PÅ FEL FORMAT: "konstglas, mundblåst, svensk design, 1960-tal" (kommatecken och mellanslag i fraser)

SÖKORD KVALITET:
• Prioritera termer som INTE redan finns i titel/beskrivning
• Inkludera: alternativa namn, tekniska termer, stilperioder, användningsområden
• Undvik upprepningar och synonymer som är för lika
• Fokusera på vad köpare faktiskt söker efter

Returnera ENDAST sökorden separerade med mellanslag enligt Auctionets format, utan extra formatering eller etiketter.`;

      default:
        return baseInfo;
    }
  }
} 