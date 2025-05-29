// modules/api-manager.js - API Management Module
import { CONFIG, getCurrentModel } from './config.js';
import { AuctionetAPI } from './auctionet-api.js';

export class APIManager {
  constructor() {
    this.apiKey = null;
    this.enableArtistInfo = true;
    this.auctionetAPI = new AuctionetAPI();
    this.loadSettings();
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['anthropicApiKey', 'enableArtistInfo']);
      this.apiKey = result.anthropicApiKey;
      this.enableArtistInfo = result.enableArtistInfo !== false;
      
      console.log('Artist info setting loaded:', this.enableArtistInfo);
      
      if (this.apiKey) {
        console.log('API key loaded from storage: Found');
      } else {
        console.log('API key loaded from storage: Not found');
      }
      
      // Also refresh Auctionet API settings
      if (this.auctionetAPI) {
        await this.auctionetAPI.refreshExcludeCompanySetting();
      }
    } catch (error) {
      console.error('Error loading settings:', error);
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
    
    // Detect weapons and militaria - expanded detection
    const isWeapon = category.includes('vapen') || 
                    category.includes('svärd') || 
                    category.includes('kniv') || 
                    category.includes('bajonett') || 
                    category.includes('militaria') ||
                    category.includes('krigshistoria') ||
                    title.includes('svärd') || 
                    title.includes('bajonett') || 
                    title.includes('kniv') ||
                    title.includes('dolk') ||
                    title.includes('yxa') ||
                    title.includes('spjut') ||
                    title.includes('gevär') ||
                    title.includes('pistol') ||
                    title.includes('uniformsdelar') ||
                    title.includes('hjälm') ||
                    description.includes('vapen') ||
                    description.includes('militär') ||
                    description.includes('svärdsskola') ||
                    description.includes('svärdsmed') ||
                    description.includes('signerad') && (description.includes('fujiwara') || description.includes('takada'));
    
    if (isWeapon) {
      return `
KATEGORI-SPECIFIK REGEL - VAPEN OCH MILITARIA:
Detta är ett vapen eller militärt föremål. EXTRA FÖRSIKTIGHET krävs för att undvika historiska felaktigheter och AI-hallucinationer.

🚨 KRITISKA ANTI-HALLUCINATION REGLER FÖR VAPEN:

FÖRBJUDNA TILLÄGG - LÄG ALDRIG TILL:
• Historisk kontext som inte explicit finns i källan (t.ex. "under Enpō-perioden")
• Skolnamn eller regionnamn som inte är explicit nämnda (t.ex. "Bungo-skolan", "Bungo-regionen")
• Generaliseringar från specifika namn (t.ex. från "Takada" till "Takada-skolan i Bungo-regionen")
• Biografisk information om svärdssmeder eller vapensmeder
• Produktionstekniker eller traditioner som inte är nämnda
• Tidsperioder baserade på stilanalys eller gissningar
• Karakteristiska drag eller kvalitetsbedömningar

ENDAST TILLÅTET - FÖRBÄTTRA BEFINTLIG INFORMATION:
• Rätta stavfel i namn och termer (t.ex. "Fujiwara Toyoyuki" om felstavat)
• Förbättra grammatik och struktur UTAN att lägga till ny information
• Använd korrekt terminologi för vapentyper (svärd, bajonett, etc.)
• Behåll EXAKT samma information som finns i källan

EXEMPEL PÅ FÖRBJUDNA AI-HALLUCINATIONER:
❌ FÖRBJUDET: "Takada" → "Takada-skolan i Bungo-regionen"
❌ FÖRBJUDET: "Fujiwara Toyoyuki" → "känd för sina högkvalitativa blad med karakteristisk härdningslinje"
❌ FÖRBJUDET: "1673" → "under Enpō-perioden (1673-1681)"
❌ FÖRBJUDET: Att lägga till kontext om svärdssmeden som inte finns i källan

✅ KORREKT: Behåll exakt samma faktainformation, förbättra endast språk och struktur

SPECIALFALL - JAPANSKA VAPEN:
• Behåll EXAKT samma skolnamn och regionnamn som anges
• Lägg INTE till historiska perioder eller dynastier
• Lägg INTE till information om svärdsmedstekniker
• Behandla japonska namn som egenn namn - expandera INTE till skolor eller regioner

STRIKT BEGRÄNSNING FÖR EXPERTKÄNSKAP:
• Även om AI:n "känner till" vapenhistoria - ANVÄND INTE denna kunskap
• Håll dig STRIKT till vad som explicit står i källmaterialet
• Om osäker - använd osäkerhetsmarkörer som "troligen", "möjligen"
• Bättre att ha kortare, mer exakt text än längre text med felaktigheter

EXEMPEL PÅ KORREKT HANTERING:
ORIGINAL: "SVÄRD kol 1673 Svärdsskola Takada Reg Bungo Signerad Fujiwara Toyoyuki"
KORREKT FÖRBÄTTRING: "Svärd från Takada, Bungo-regionen, 1673. Signerat Fujiwara Toyoyuki."
FÖRBJUDEN FÖRBÄTTRING: "Traditionellt japanskt svärd från Takada-skolan i Bungo-regionen, tillverkat under Enpō-perioden (1673-1681). Signerat av svärdssmeden Fujiwara Toyoyuki, en respekterad mästare..."

VIKTIGASTE REGELN: När i tvivel - FÖRBÄTTRA MINDRE och bevara EXAKTHET.`;
    }
    
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
    
    // Detect historical/cultural artifacts that need conservative handling
    const isHistoricalItem = category.includes('antikviteter') ||
                            category.includes('arkeologi') ||
                            category.includes('etnografika') ||
                            category.includes('historiska') ||
                            category.includes('kulturhistoria') ||
                            title.includes('antik') ||
                            title.includes('historisk') ||
                            title.includes('forntid') ||
                            title.includes('medeltid') ||
                            title.includes('vikinga') ||
                            title.includes('bronsålder') ||
                            description.includes('antik') ||
                            description.includes('historisk') ||
                            description.includes('kulturell') ||
                            description.includes('arkeologisk');
    
    if (isHistoricalItem) {
      return `
KATEGORI-SPECIFIK REGEL - HISTORISKA FÖREMÅL OCH ANTIKVITETER:
Detta är ett historiskt/kulturellt föremål. Använd KONSERVATIV förstärkning för att undvika felaktiga historiska tolkningar.

KONSERVATIVA REGLER:
• Lägg INTE till historiska perioder eller dynastier som inte är explicit nämnda
• Expandera INTE kulturella eller geografiska referenser utan källa
• Undvik arkeologiska eller historiska spekulationer
• Behandla alla historiska namn och platser som exakta citat
• Använd osäkerhetsmarkörer vid minsta tvivel: "troligen", "möjligen"

ANTI-HALLUCINATION:
• Uppfinn ALDRIG historisk kontext eller bakgrund
• Utöka INTE geografiska eller kulturella referenser
• Lägg INTE till datering baserad på stilanalys
• Behåll EXAKT samma historiska referenser som i källan`;
    }
    
    // Detect jewelry that might have complex gemological terms
    const isJewelry = category.includes('smycken') ||
                     category.includes('guld') ||
                     category.includes('silver') ||
                     category.includes('diamant') ||
                     category.includes('ädelsten') ||
                     title.includes('ring') ||
                     title.includes('halsband') ||
                     title.includes('armband') ||
                     title.includes('brosch') ||
                     title.includes('örhängen') ||
                     description.includes('karat') ||
                     description.includes('ädelsten') ||
                     description.includes('rubin') ||
                     description.includes('safir') ||
                     description.includes('smaragd');
    
    if (isJewelry) {
      return `
KATEGORI-SPECIFIK REGEL - SMYCKEN OCH ÄDELMETALLER:
Detta är ett smycke eller föremål i ädelmetall. Var FÖRSIKTIG med tekniska specifikationer.

TEKNISKA BEGRÄNSNINGAR:
• Lägg INTE till karattyngd som inte är angiven
• Specificera INTE metallhalt (18k, 14k) utan källa
• Lägg INTE till information om ädelstenars kvalitet eller ursprung
• Uppfinn INTE tekniska detaljer om legering eller bearbetning
• Behåll EXAKT samma tekniska information som finns i källan

ENDAST FÖRBÄTTRA:
• Stavning av ädelstensnamn och märken
• Grammatik och struktur
• Korrekt smyckesterminologi
• Språk och läsbarhet utan att lägga till tekniska detaljer`;
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
  async analyzeForArtist(title, objectType, artistField, description = '') {
    console.log('🎯 analyzeForArtist called with:', { title, objectType, artistField, description: description?.substring(0, 100) + '...' });
    
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
      const prompt = `Analysera denna svenska auktionspost för konstnärsnamn:

TITEL: "${title}"
BESKRIVNING: "${description ? description.substring(0, 500) : 'Ingen beskrivning'}"
OBJEKTTYP: ${objectType || 'Okänd'}

UPPGIFT:
Innehåller denna titel eller beskrivning ett konstnärs- eller designernamn som borde vara i ett separat konstnärsfält?

VIKTIGA REGLER:
- Sök både i titel OCH beskrivning efter verkliga konstnärsnamn
- "Signerad [Namn]" i beskrivning indikerar ofta konstnärsnamn
- Japanska/asiatiska namn som "Fujiwara Toyoyuki" är ofta konstnärsnamn
- Skolnamn som "Takada" är INTE konstnärsnamn - det är regioner/skolor
- Beskrivande fraser som "Kvinna med hundar" är INTE konstnärsnamn
- Företagsnamn som "IKEA", "Axeco" är INTE konstnärsnamn
- Ortnamn som "Stockholm", "Göteborg" är INTE konstnärsnamn

EXEMPEL:
- "Signerad Fujiwara Toyoyuki" → KONSTNÄR: "Fujiwara Toyoyuki"
- "Svärdsskola Takada" → INTE konstnär (skola/region)
- "Signerad Lars Larsson" → KONSTNÄR: "Lars Larsson"

SVARA MED JSON:
{
  "hasArtist": boolean,
  "artistName": "namn eller null",
  "foundIn": "title/description/both",
  "suggestedTitle": "föreslagen titel utan konstnärsnamn eller null",
  "suggestedDescription": "föreslagen beskrivning utan konstnärsnamn eller null",
  "confidence": 0.0-1.0,
  "reasoning": "kort förklaring om vad som hittades och var"
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
    console.log('💰 analyzeComparableSales called with:', { artistName, objectType, period, technique, currentValuation });
    
    // Use Auctionet API for real market data instead of Claude estimates
    console.log('🔍 Using Auctionet API for comprehensive market data analysis...');
    
    try {
      // Start both historical and live analysis in parallel for efficiency
      const [historicalResult, liveResult] = await Promise.all([
        // Historical sales data
        this.auctionetAPI.analyzeComparableSales(
          artistName, 
          objectType, 
          period, 
          technique, 
          description
        ),
        // Live auction data
        this.auctionetAPI.analyzeLiveAuctions(
          artistName,
          objectType,
          period,
          technique,
          description
        )
      ]);
      
      // Combine historical and live data intelligently
      if (historicalResult || liveResult) {
        console.log('✅ Market analysis successful');
        
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
        
        console.log(`📊 Combined analysis: Historical=${!!historicalResult}, Live=${!!liveResult}`);
        return combinedResult;
      } else {
        console.log('❌ No market data found (neither historical nor live)');
        
        // Fallback to Claude analysis if no Auctionet data found
        console.log('🤖 Falling back to Claude AI analysis...');
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
    console.log('🔍 analyzeSales called with search context:', searchContext);
    
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
    
    // For freetext searches, we need to handle the search differently
    if (analysisType === 'freetext') {
      console.log(`🔍 Performing freetext search with strategy: ${searchStrategy}, confidence: ${confidence}`);
      
      // For freetext, the primarySearch contains the combined search terms
      // We'll use it as the "artist" parameter but the Auctionet API will understand it's a general search
      return await this.analyzeComparableSales(
        primarySearch,  // This contains the combined search terms like "spegel empire 1800-tal förgylld"
        null,           // Don't specify object type separately since it's in the search terms
        null,           // Don't specify period separately since it's in the search terms  
        null,           // Don't specify technique separately since it's in the search terms
        `Fritextsökning: ${primarySearch}. Sökstrategi: ${searchStrategy}. Relevans: ${Math.round(confidence * 100)}%`
      );
    } else {
      // For artist and brand searches, use the existing logic
      console.log(`🎯 Performing ${analysisType} search for: ${primarySearch}`);
      
      return await this.analyzeComparableSales(
        primarySearch,
        objectType,
        period,
        technique,
        `${analysisType === 'brand' ? 'Märkesbaserad' : 'Konstnärsbaserad'} analys för ${primarySearch}`
      );
    }
  }

  // NEW: Generate combined insights from historical and live data
  generateCombinedInsights(historicalResult, liveResult, currentValuation = null) {
    const insights = [];
    
    if (historicalResult && liveResult) {
      // Get market activity context first to inform all other insights
      const marketActivity = liveResult.marketActivity;
      const reserveMetPercentage = marketActivity ? marketActivity.reservesMetPercentage : null;
      const isWeakMarket = reserveMetPercentage !== null && reserveMetPercentage < 40;
      const isStrongMarket = reserveMetPercentage !== null && reserveMetPercentage > 70;
      
      console.log('🏛️ Market context analysis:', {
        reserveMetPercentage,
        isWeakMarket,
        isStrongMarket
      });
      
      // Compare historical vs live pricing WITH market context
      const histAvg = (historicalResult.priceRange.low + historicalResult.priceRange.high) / 2;
      const liveAvg = liveResult.currentEstimates ? 
        (liveResult.currentEstimates.low + liveResult.currentEstimates.high) / 2 : null;
      
      if (liveAvg && currentValuation) {
        // SMART LOGIC: Consider cataloger's current valuation in context
        const priceDiff = ((liveAvg - histAvg) / histAvg) * 100;
        const catalogerVsHist = ((currentValuation - histAvg) / histAvg) * 100;
        const catalogerVsLive = ((currentValuation - liveAvg) / liveAvg) * 100;
        
        console.log('🧠 Smart insight analysis:', {
          histAvg: Math.round(histAvg),
          liveAvg: Math.round(liveAvg),
          currentValuation,
          priceDiff: Math.round(priceDiff),
          catalogerVsHist: Math.round(catalogerVsHist),
          catalogerVsLive: Math.round(catalogerVsLive),
          marketContext: isWeakMarket ? 'weak' : isStrongMarket ? 'strong' : 'normal'
        });
        
        // Only provide insights if the difference is significant
        if (Math.abs(priceDiff) > 15) {
          let message = '';
          let significance = 'medium';
          
          // CONTEXT-AWARE LOGIC: Consider market strength AND cataloger's position
          if (isWeakMarket) {
            // WEAK MARKET: Be more conservative with all recommendations
            if (catalogerVsHist > 50) {
              // Cataloger is above historical in weak market - definitely too high
              message = `Svag marknad (${reserveMetPercentage}% utrop nås) och din värdering ${Math.round(catalogerVsHist)}% över historiska värden - sänk betydligt`;
              significance = 'high';
            } else if (priceDiff > 30) {
              // Live estimates are high but market is weak - be cautious
              message = `Trots att pågående auktioner värderar ${Math.round(priceDiff)}% högre är marknaden svag (${reserveMetPercentage}% utrop nås) - var försiktig`;
              significance = 'high';
            } else if (catalogerVsLive > 20) {
              // Cataloger above live estimates in weak market
              message = `Svag marknad (${reserveMetPercentage}% utrop nås) - din värdering ligger över pågående auktioner, överväg att sänka`;
              significance = 'medium';
            }
          } else if (isStrongMarket) {
            // STRONG MARKET: Be more optimistic but still realistic
            if (catalogerVsHist < -20 && priceDiff > 30) {
              // Cataloger is conservative but market is strong and live is high
              message = `Stark marknad (${reserveMetPercentage}% utrop nås) och pågående auktioner värderar ${Math.round(priceDiff)}% högre - överväg att höja`;
              significance = 'medium';
            } else if (catalogerVsHist > 100) {
              // Even in strong market, don't be too aggressive
              message = `Trots stark marknad (${reserveMetPercentage}% utrop nås) är din värdering ${Math.round(catalogerVsHist)}% över historiska värden - överväg att sänka`;
              significance = 'medium';
            } else if (priceDiff > 50) {
              // Live is much higher and market is strong
              message = `Stark marknad (${reserveMetPercentage}% utrop nås) och pågående auktioner värderar ${Math.round(priceDiff)}% högre - gynnsam marknad`;
              significance = 'medium';
            }
          } else {
            // NORMAL MARKET: Use balanced logic
            if (catalogerVsHist > 100) {
              // Cataloger is way above historical
              if (priceDiff > 30) {
                // Live is also high, but cataloger is even worse
                message = `Pågående auktioner värderar ${Math.round(priceDiff)}% över historiska försäljningar, men din värdering är ${Math.round(catalogerVsHist)}% över - överväg att sänka`;
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
                message = `Pågående auktioner värderar ${Math.round(priceDiff)}% högre än historiska försäljningar - marknad kan vara starkare`;
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
                message = `Pågående auktioner värderar ${Math.round(priceDiff)}% högre - överväg att höja utropet`;
                significance = 'medium';
              }
            } else {
              // Cataloger is reasonably close to historical
              if (priceDiff > 50) {
                // Live is much higher
                message = `Pågående auktioner värderar ${Math.round(priceDiff)}% högre - stark marknad för liknande objekt`;
                significance = 'medium';
              } else if (priceDiff < -30) {
                // Live is much lower
                message = `Pågående auktioner värderar ${Math.abs(Math.round(priceDiff))}% lägre - marknad kan vara svagare`;
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
            message = `Pågående auktioner värderar ${Math.round(priceDiff)}% högre, men marknaden är svag (${reserveMetPercentage}% utrop nås) - var försiktig`;
            significance = 'high';
          } else if (isStrongMarket && priceDiff > 15) {
            // In strong market, higher estimates are more reliable
            message = `Stark marknad (${reserveMetPercentage}% utrop nås) och pågående auktioner värderar ${Math.round(priceDiff)}% högre - gynnsam marknad`;
            significance = 'medium';
          } else {
            // Normal market logic
            if (priceDiff > 30) {
              message = `Pågående auktioner värderar ${Math.round(priceDiff)}% högre än historiska försäljningar`;
            } else if (priceDiff > 15) {
              message = `Pågående auktioner värderar ${Math.round(priceDiff)}% högre - nuvarande marknad verkar starkare`;
            } else if (priceDiff < -30) {
              message = `Pågående auktioner värderar ${Math.abs(Math.round(priceDiff))}% lägre än historiska försäljningar`;
            } else if (priceDiff < -15) {
              message = `Pågående auktioner värderar ${Math.abs(Math.round(priceDiff))}% lägre - nuvarande marknad verkar svagare`;
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
      if (marketActivity && !insights.some(insight => insight.message.includes('utrop nås'))) {
        if (reserveMetPercentage > 70) {
          insights.push({
            type: 'market_strength',
            message: `Stark marknad: ${reserveMetPercentage}% av utrop nås - gynnsam försäljningsmiljö`,
            significance: 'high'
          });
        } else if (reserveMetPercentage < 30) {
          insights.push({
            type: 'market_weakness',
            message: `Utmanande marknad: Endast ${reserveMetPercentage}% av utrop nås - överväg försiktig prissättning`,
            significance: 'medium'
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
    console.log('🤖 Using Claude AI for sales analysis fallback...');
    
    if (!this.apiKey) {
      console.log('❌ No API key available, skipping Claude sales analysis');
      return null;
    }

    // Only analyze if we have sufficient information
    if (!artistName || artistName.trim().length < 3) {
      console.log('🚫 Insufficient artist information for sales analysis');
      return null;
    }

    console.log('🚀 Starting Claude comparable sales analysis...');
    
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

      console.log('📊 Processing Claude comparable sales response...');

      if (response.success && response.data?.content?.[0]?.text) {
        const content = response.data.content[0].text;
        console.log('🤖 Raw Claude comparable sales response:', content);

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
          console.log('✅ Claude comparable sales analysis successful:', salesData);
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