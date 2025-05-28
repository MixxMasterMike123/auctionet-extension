// modules/api-manager.js - API Management Module
import { CONFIG, getCurrentModel } from './config.js';

export class APIManager {
  constructor() {
    this.apiKey = null;
  }

  async loadApiKey() {
    try {
      const result = await chrome.storage.sync.get(['anthropicApiKey', 'selectedModel', 'enableArtistInfo']);
      this.apiKey = result.anthropicApiKey;
      
      // Update model selection if stored
      if (result.selectedModel && CONFIG.MODELS[result.selectedModel]) {
        CONFIG.CURRENT_MODEL = result.selectedModel;
        console.log('Model loaded from storage:', CONFIG.MODELS[result.selectedModel].name);
      }
      
      // Load artist info setting (default to true if not set)
      this.enableArtistInfo = result.enableArtistInfo !== undefined ? result.enableArtistInfo : true;
      console.log('Artist info setting loaded:', this.enableArtistInfo);
      
      console.log('API key loaded from storage:', this.apiKey ? 'Found' : 'Not found');
    } catch (error) {
      console.error('Error loading API key:', error);
      this.apiKey = null;
      this.enableArtistInfo = true; // Default to enabled on error
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
    const category = itemData.category?.toLowerCase() || '';
    const title = itemData.title?.toLowerCase() || '';
    const description = itemData.description?.toLowerCase() || '';
    
    // Detect watches/timepieces
    const isWatch = category.includes('armbandsur') || 
                   category.includes('klocka') || 
                   title.includes('armbandsur') || 
                   title.includes('klocka') ||
                   description.includes('armbandsur') ||
                   description.includes('klocka');
    
    if (isWatch) {
      return `
KATEGORI-SPECIFIK REGEL - ARMBANDSUR:
Detta är ett armbandsur/klocka. Följ Auctionets krav:

OBLIGATORISK INFORMATION (om tillgänglig i källdata):
• Storlek i mm (diameter)
• Urverk: "automatic" eller "quartz" 
• Tillverkare och modell (eller kaliber)
• Material (stål, guld, etc.)

FUNKTIONSKLAUSUL - LÄGG ALLTID TILL I BESKRIVNING:
"Fungerar vid katalogisering - ingen garanti lämnas på funktion."

KRITISKT FÖR ARMBANDSUR TITEL:
• BEHÅLL ALLTID "ARMBANDSUR" FÖRST i titeln
• Format: "ARMBANDSUR, [material], [tillverkare], [modell], [urverk], [storlek], [period]"
• EXEMPEL: "ARMBANDSUR, stål, ROLEX, Submariner, automatic, 40mm, 1990-tal"

EXEMPEL PÅ KORREKT FORMAT:
TITEL: "ARMBANDSUR, stål, ROLEX, Submariner, automatic, 40mm, 1990-tal"
BESKRIVNING: "Automatiskt armbandsur i rostfritt stål. Svart urtavla med lysande index. Fungerar vid katalogisering - ingen garanti lämnas på funktion."

KRITISKA REGLER FÖR ARMBANDSUR:
• BEHÅLL "ARMBANDSUR" som första ord i titel - TA ALDRIG BORT
• Lägg INTE till mått (mm) som inte finns i källdata
• Lägg INTE till urverk (automatic/quartz) som inte är angivet
• RÄTTA stavfel i märken/modeller (t.ex. "Oscean" → "Ocean")
• Förbättra ENDAST befintlig information - uppfinn INGET nytt

ANTI-HALLUCINATION: Om storlek, urverk eller andra tekniska detaljer INTE finns i originalet - lägg INTE till dem.`;
    }
    
    return '';
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
  'Konstnär/formgivare-fältet är ifyllt (' + itemData.artist + '), så inkludera INTE konstnärens namn i titeln - det läggs till automatiskt av systemet. FÖRSTA ORDET I TITELN SKA VARA VERSAL (normal capital letter).' : 
  'Konstnär/formgivare-fältet är tomt, så inkludera konstnärens namn i titeln om det är känt. FÖRSTA ORDET I TITELN SKA VARA VERSALER (uppercase).'}

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
    switch(fieldType) {
      case 'all':
      case 'all-sparse':
        return baseInfo + `
UPPGIFT: Förbättra titel, beskrivning, konditionsrapport och generera dolda sökord enligt svenska auktionsstandarder. Skriv naturligt och autentiskt - använd reglerna som riktlinjer, inte som strikta begränsningar.

${itemData.artist && this.enableArtistInfo ? 
  'EXPERTKUNSKAP - KONSTNÄR KÄND: Eftersom konstnär/formgivare är angiven (' + itemData.artist + ') och konstnärsinformation är aktiverad, lägg till KORT, RELEVANT kontext om denna specifika modell/serie. Max 1-2 extra meningar. Fokusera på konkreta fakta, inte allmän konstnärsbiografi.' : 
  'BEGRÄNSAD INFORMATION: Håll dig till befintlig information utan att lägga till konstnärlig kontext.'}

FÄLTAVGRÄNSNING:
• BESKRIVNING: Material, teknik, mått, stil, ursprung, märkningar, funktion - ALDRIG konditionsinformation
• KONDITION: Endast fysiskt skick och skador - ALDRIG beskrivande information
• Håll fälten strikt separerade - konditionsdetaljer som "slitage", "repor", "märken" hör ENDAST i konditionsfältet

KRITISKT - BEVARA ALLA MÅTT OCH LISTOR I BESKRIVNINGEN:
• BEHÅLL ALLTID detaljerade måttlistor: "4 snapsglas, höjd 15,5 cm", "2 vinglas, höjd 19,5 cm", etc.
• BEHÅLL ALLTID kvantiteter och specifikationer: "Bestående av:", "Består av:", antal objekt
• BEHÅLL ALLTID alla mått i cm/mm - dessa är ALDRIG konditionsinformation
• TA ENDAST BORT konditionsord som "slitage", "repor", "skador" - ALDRIG mått, kvantiteter eller listor
• EXEMPEL PÅ VAD SOM MÅSTE BEVARAS: "Bestående av: 4 snapsglas, höjd 15,5 cm, 2 vinglas, höjd 19,5 cm"

VARNING: Om du tar bort mått eller listor kommer detta att betraktas som ett KRITISKT FEL!

KRITISKT - FÖRSTA ORDETS KAPITALISERING I TITEL:
${itemData.artist ? 
  '• Konstnär/formgivare-fältet är ifyllt - FÖRSTA ORDET I TITEL SKA VARA VERSAL (normal capital letter)' : 
  '• Konstnär/formgivare-fältet är tomt - FÖRSTA ORDET I TITEL SKA VARA VERSALER (uppercase)'}

KRITISKT - BEVARA CITATTECKEN FÖR MASKINÖVERSÄTTNING:
• BEHÅLL ALLTID citattecken runt produktnamn, modellnamn och svenska designnamn
• Auctionet använder maskinöversättning som RESPEKTERAR citattecken - text inom "" översätts ALDRIG
• Detta är KRITISKT för IKEA-möbler och svenska designnamn som ska förbli på svenska
• EXEMPEL: "Oxford" ska förbli "Oxford" (med citattecken), INTE Oxford (utan citattecken)
• EXEMPEL: "Pepparkorn" ska förbli "Pepparkorn" (med citattecken) för att undvika översättning
• Om originaltiteln har citattecken runt produktnamn - BEHÅLL dem ALLTID

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
UPPGIFT: Förbättra endast titeln enligt svenska auktionsstandarder. Max 60 tecken. Skriv naturligt och flytande.

KRITISKT - BEVARA CITATTECKEN FÖR MASKINÖVERSÄTTNING:
• BEHÅLL ALLTID citattecken runt produktnamn, modellnamn och svenska designnamn
• Auctionet använder maskinöversättning som RESPEKTERAR citattecken - text inom "" översätts ALDRIG
• Detta är KRITISKT för IKEA-möbler och svenska designnamn som ska förbli på svenska
• EXEMPEL: "Oxford" ska förbli "Oxford" (med citattecken), INTE Oxford (utan citattecken)
• EXEMPEL: "Pepparkorn" ska förbli "Pepparkorn" (med citattecken) för att undvika översättning
• Om originaltiteln har citattecken runt produktnamn - BEHÅLL dem ALLTID

FÖRSTA ORDETS KAPITALISERING:
${itemData.artist ? 
  '• Konstnär/formgivare-fältet är ifyllt - FÖRSTA ORDET SKA VARA VERSAL (normal capital letter)\n• Exempel: "Bajonett, Eskilstuna, 1900-tal" (konstnärens namn läggs till automatiskt)' : 
  '• Konstnär/formgivare-fältet är tomt - FÖRSTA ORDET SKA VARA VERSALER (uppercase)\n• Exempel: "BAJONETT, Eskilstuna, 1900-tal"'}

Returnera ENDAST den förbättrade titeln utan extra formatering eller etiketter.`;

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

EXPERTKUNSKAP FÖR BESKRIVNING:
${itemData.artist && this.enableArtistInfo ? 
  '• När konstnär/formgivare är känd och konstnärsinformation är aktiverad: Lägg till KORT, SPECIFIK kontext om denna modell/serie om du känner till den\n• Max 1-2 meningar extra - fokusera på tillverkningsår och karakteristiska drag\n• UNDVIK allmänna beskrivningar av konstnärens karriär eller designfilosofi\n• Håll det relevant för just detta föremål' : 
  '• Lägg INTE till konstnärlig eller historisk kontext som inte finns i källdata'}
• Lägg INTE till mått som inte är angivna
• Lägg INTE till material som inte är nämnt (såvida det inte är känt från konstnärens typiska tekniker)
• Lägg INTE till märkningar eller signaturer som inte finns
• Förbättra språk, struktur och befintlig information
• Lägg ALDRIG till kommentarer om vad som "saknas" eller "behövs"

Returnera ENDAST den förbättrade beskrivningen utan extra formatering eller etiketter.`;

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

STRIKT FORMAT - KRITISKT:
• Returnera ENDAST sökorden separerade med mellanslag
• INGEN text före eller efter sökorden
• INGA förklaringar, kommentarer eller noteringar
• INGA etiketter som "SÖKORD:" eller "Keywords:"
• INGA meningar eller beskrivningar
• EXEMPEL PÅ KORREKT SVAR: "konstglas mundblåst svensk-design 1960-tal"
• EXEMPEL PÅ FEL SVAR: "SÖKORD: konstglas mundblåst" eller "Här är sökorden: konstglas"

Returnera ENDAST sökorden separerade med mellanslag enligt Auctionets format, utan extra formatering eller etiketter.`;

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

  // AI-powered artist detection methods
  async analyzeForArtist(title, objectType, artistField) {
    console.log('🎯 analyzeForArtist called with:', { title, objectType, artistField });
    
    if (!this.apiKey) {
      console.log('❌ No API key available, skipping AI artist analysis');
      return null;
    }

    // Only analyze if artist field is empty or very short
    if (artistField && artistField.trim().length > 2) {
      console.log('🚫 Artist field not empty, skipping AI analysis:', artistField);
      return null;
    }

    if (!title || title.length < 10) {
      console.log('🚫 Title too short for AI analysis:', title);
      return null;
    }

    console.log('🚀 Starting AI artist analysis...');
    
    try {
      const prompt = `Analysera denna svenska auktionstitel för konstnärsnamn:

TITEL: "${title}"
OBJEKTTYP: ${objectType || 'Okänd'}

UPPGIFT:
Innehåller denna titel ett konstnärs- eller designernamn som borde vara i ett separat konstnärsfält istället för i titeln?

SVENSKA AUKTIONSKONVENTIONER:
- Konstnärsnamn placeras ofta felaktigt i titeln som "KONSTNÄR, Objekt, material"
- Beskrivande fraser som "Kvinna med hundar" är INTE konstnärsnamn
- Företagsnamn som "IKEA", "Axeco" är INTE konstnärsnamn
- Ortnamn som "Stockholm", "Göteborg" är INTE konstnärsnamn

SVARA MED JSON:
{
  "hasArtist": boolean,
  "artistName": "namn eller null",
  "suggestedTitle": "föreslagen titel utan konstnärsnamn eller null",
  "confidence": 0.0-1.0,
  "reasoning": "kort förklaring"
}

Endast om du är mycket säker (confidence > 0.8) på att det finns ett verkligt konstnärsnamn.`;

      console.log('📤 Sending AI request with prompt length:', prompt.length);

      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiKey,
          body: {
            model: getCurrentModel().id,
            max_tokens: 300,
            temperature: 0.1, // Low temperature for consistent analysis
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

      console.log('📥 AI response received:', response);

      if (response.success && response.data?.content?.[0]?.text) {
        console.log('📝 AI response text:', response.data.content[0].text);
        const result = this.parseArtistAnalysisResponse(response.data.content[0].text);
        console.log('🎯 Parsed AI artist analysis result:', result);
        return result;
      }

      console.log('❌ Invalid AI response structure');
      return null;
    } catch (error) {
      console.error('💥 Error in AI artist analysis:', error);
      return null; // Graceful fallback to rule-based system
    }
  }

  async verifyArtist(artistName, objectType, period) {
    if (!this.apiKey || !this.enableArtistInfo) {
      return null;
    }

    try {
      const prompt = `Verifiera denna potentiella konstnär/designer:

NAMN: "${artistName}"
OBJEKTTYP: ${objectType || 'Okänd'}
PERIOD: ${period || 'Okänd'}

UPPGIFT:
Är detta en verklig konstnär, designer eller hantverkare? Ge biografisk kontext om möjligt.

SVARA MED JSON:
{
  "isRealArtist": boolean,
  "confidence": 0.0-1.0,
  "biography": "kort biografisk information eller null",
  "specialties": ["lista", "över", "specialiteter"] eller null,
  "activeYears": "aktiva år eller null",
  "relevanceToObject": "relevans till objekttyp eller null"
}`;

      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiKey,
          body: {
            model: getCurrentModel().id,
            max_tokens: 400,
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

      if (response.success && response.data?.content?.[0]?.text) {
        const result = this.parseArtistVerificationResponse(response.data.content[0].text);
        console.log('AI artist verification result:', result);
        return result;
      }

      return null;
    } catch (error) {
      console.error('Error in AI artist verification:', error);
      return null;
    }
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
            suggestedTitle: parsed.suggestedTitle || null,
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
      
      if (hasArtist && artistMatch && confidenceMatch) {
        return {
          hasArtist: true,
          artistName: artistMatch[1],
          suggestedTitle: null,
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
  async analyzeComparableSales(artistName, objectType, period, technique, description) {
    console.log('💰 analyzeComparableSales called with:', { artistName, objectType, period, technique });
    
    if (!this.apiKey) {
      console.log('❌ No API key available, skipping comparable sales analysis');
      return null;
    }

    // Only analyze if we have sufficient information
    if (!artistName || artistName.trim().length < 3) {
      console.log('🚫 Insufficient artist information for sales analysis');
      return null;
    }

    console.log('🚀 Starting comparable sales analysis...');
    
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

      console.log('📤 Sending comparable sales request via Chrome runtime...');

      // Use Chrome runtime messaging instead of direct fetch
      const response = await new Promise((resolve, reject) => {
        console.log('📨 Calling chrome.runtime.sendMessage for sales analysis...');
        
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiKey,
          body: {
            model: getCurrentModel().id,
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
            console.log('✅ Chrome runtime success');
            resolve(response);
          } else {
            console.error('❌ Chrome runtime failed:', response);
            reject(new Error(response?.error || 'API request failed'));
          }
        });
      });

      console.log('📊 Processing comparable sales response...');

      if (response.success && response.data?.content?.[0]?.text) {
        const content = response.data.content[0].text;
        console.log('🤖 Raw comparable sales response:', content);

        // Parse JSON response with fallback
        let salesData;
        try {
          salesData = JSON.parse(content);
          console.log('✅ JSON parsing successful:', salesData);
        } catch (parseError) {
          console.warn('⚠️ JSON parsing failed, attempting fallback parsing:', parseError);
          salesData = this.fallbackParseSalesData(content);
        }

        if (salesData && salesData.hasComparableData) {
          console.log('✅ Comparable sales analysis successful:', salesData);
          return salesData;
        } else {
          console.log('❌ No comparable sales data found in response');
          return null;
        }
      } else {
        console.error('❌ Invalid comparable sales response structure:', response);
        return null;
      }
    } catch (error) {
      console.error('💥 Error in comparable sales analysis:', error);
      console.error('💥 Error stack:', error.stack);
      return null;
    }
  }

  // Fallback parser for sales data if JSON parsing fails
  fallbackParseSalesData(content) {
    console.log('🔧 Attempting fallback parsing for sales data');
    
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
} 