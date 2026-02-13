// modules/add-items/ai-enhancement.js - AI field improvement for add items page

export class AddItemsAIEnhancement {
  constructor() {
    this.apiManager = null;
    this.callbacks = {};
  }

  setDependencies({ apiManager }) {
    this.apiManager = apiManager;
  }

  setCallbacks(callbacks) {
    this.callbacks = callbacks;
  }

  // ==================== AI BUTTON INJECTION ====================

  injectAIButtons() {
    const titleField = document.querySelector('#item_title_sv');
    const descriptionField = document.querySelector('#item_description_sv');
    const conditionField = document.querySelector('#item_condition_sv');
    const keywordsField = document.querySelector('#item_hidden_keywords');

    if (titleField) {
      this.addAIButton(titleField, 'title', 'Förbättra titel');
      this.addAIButton(titleField, 'title-correct', 'Korrigera stavning');
    }
    if (descriptionField) {
      this.addAIButton(descriptionField, 'description', 'Förbättra beskrivning');
    }
    if (conditionField) {
      this.addAIButton(conditionField, 'condition', 'Förbättra kondition');
    }
    if (keywordsField) {
      this.addAIButton(keywordsField, 'keywords', 'Generera sökord');
    }

    this.callbacks.addQualityIndicator();
    
    this.attachAIButtonEventListeners();
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
    
    field.parentNode.insertBefore(wrapper, field.nextSibling);
  }

  attachAIButtonEventListeners() {
    const buttons = document.querySelectorAll('.ai-assist-button:not(.ai-master-button)');
    
    buttons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const fieldType = e.target.dataset.fieldType;
        if (fieldType) {
          this.improveField(fieldType);
        }
      });
    });

    const masterButton = document.querySelector('.ai-master-button');
    if (masterButton) {
      masterButton.addEventListener('click', (e) => {
        e.preventDefault();
        this.improveAllFields();
      });
    }

    const refreshButton = document.querySelector('.refresh-quality-btn');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => {
        this.callbacks.analyzeQuality();
      });
    }
  }

  // ==================== FIELD IMPROVEMENT ====================

  async improveField(fieldType, options = {}) {
    if (!this.apiManager.apiKey) {
      this.callbacks.showErrorIndicator(fieldType, 'API key not configured. Please set your Anthropic API key in the extension popup.');
      return;
    }
    
    const formData = this.callbacks.extractFormData();
    this.callbacks.showLoadingIndicator(fieldType);
    
    try {
      const improved = await this.callClaudeAPI(formData, fieldType, options);
      const value = improved[fieldType];
      if (value) {
        this.applyImprovement(fieldType, value);
        this.callbacks.showSuccessIndicator(fieldType);
        setTimeout(() => this.callbacks.analyzeQuality(), 500);
      } else {
        throw new Error(`No ${fieldType} value in response`);
      }
    } catch (error) {
      console.error('Error improving field:', error);
      this.callbacks.showErrorIndicator(fieldType, error.message);
    }
  }

  async improveAllFields() {
    if (!this.apiManager.apiKey) {
      this.callbacks.showErrorIndicator('all', 'API key not configured. Please set your Anthropic API key in the extension popup.');
      return;
    }

    const formData = this.callbacks.extractFormData();
    this.callbacks.showLoadingIndicator('all');
    
    try {
      const improvements = await this.callClaudeAPI(formData, 'all');
      
      let delay = 0;
      
      if (improvements.title) {
        setTimeout(() => {
          this.applyImprovement('title', improvements.title);
          this.callbacks.showSuccessIndicator('title');
        }, delay);
        delay += 300;
      }
      
      if (improvements.description) {
        setTimeout(() => {
          this.applyImprovement('description', improvements.description);
          this.callbacks.showSuccessIndicator('description');
        }, delay);
        delay += 300;
      }
      
      if (improvements.condition) {
        setTimeout(() => {
          this.applyImprovement('condition', improvements.condition);
          this.callbacks.showSuccessIndicator('condition');
        }, delay);
        delay += 300;
      }
      
      if (improvements.keywords) {
        setTimeout(() => {
          this.applyImprovement('keywords', improvements.keywords);
          this.callbacks.showSuccessIndicator('keywords');
        }, delay);
        delay += 300;
      }
      
      setTimeout(() => {
        this.callbacks.showSuccessIndicator('all');
        setTimeout(() => this.callbacks.analyzeQuality(), 500);
      }, delay);
      
    } catch (error) {
      this.callbacks.showErrorIndicator('all', error.message);
    }
  }

  applyImprovement(fieldType, value) {
    const fieldMap = {
      'title': '#item_title_sv',
      'title-correct': '#item_title_sv',
      'description': '#item_description_sv',
      'condition': '#item_condition_sv',
      'keywords': '#item_hidden_keywords'
    };
    
    const field = document.querySelector(fieldMap[fieldType]);
    if (field && value) {
      this.callbacks.setProgrammaticUpdate(true);
      
      try {
        // Strip unknown-artist phrases that don't belong in non-artist fields
        let finalValue = AddItemsAIEnhancement.stripUnknownArtistTerms(value);
        if (fieldType === 'keywords') {
          const existingKeywords = field.value.trim();
          if (existingKeywords) {
            const existingSet = new Set(
              existingKeywords.split(',').map(kw => kw.trim().toLowerCase()).filter(kw => kw.length > 0)
            );
            const newKeywords = value.split(',').map(kw => kw.trim()).filter(kw => kw.length > 0);
            const uniqueNew = newKeywords.filter(kw => !existingSet.has(kw.toLowerCase()));
            finalValue = uniqueNew.length > 0
              ? existingKeywords + ', ' + uniqueNew.join(', ')
              : existingKeywords;
          }
        }
        field.value = finalValue;
        field.dispatchEvent(new Event('change', { bubbles: true }));
        field.classList.add('ai-updated');
        
        if (field.tagName.toLowerCase() === 'textarea') {
          setTimeout(() => {
            this.callbacks.autoResizeTextarea(field);
          }, 50);
        }
        
      } finally {
        setTimeout(() => {
          this.callbacks.setProgrammaticUpdate(false);
        }, 100);
      }
    }
  }

  // ==================== CLAUDE API ====================

  async callClaudeAPI(formData, fieldType, options = {}) {
    if (!this.apiManager.apiKey) {
      throw new Error('API key not configured. Please set your Anthropic API key in the extension popup.');
    }

    const systemPrompt = this.getEditPageSystemPrompt();
    const userPrompt = this.getEditPageUserPrompt(formData, fieldType, options);

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiManager.apiKey,
          body: {
            model: this.apiManager.getCurrentModel().id,
            max_tokens: fieldType === 'title-correct' ? 500 : 4000,
            temperature: fieldType === 'title-correct' ? 0.1 : 0.2,
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
      
      return await this.processEditPageAPIResponse(response, fieldType);
      
    } catch (error) {
      console.error('ADD ITEM API call failed:', error);
      throw error;
    }
  }

  getEditPageSystemPrompt() {
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

KONSTNÄRSTERMER — ALDRIG I TITEL, BESKRIVNING ELLER ANDRA FÄLT:
• Termerna "okänd konstnär", "oidentifierad konstnär", "okänd mästare", "okänd formgivare", "oidentifierad formgivare", "oidentifierad upphovsman" hör ENBART hemma i konstnärsfältet
• Inkludera ALDRIG dessa termer i titel, beskrivning, kondition eller sökord
• Om konstnärsfältet innehåller en sådan term — ignorera den helt vid generering av övriga fält
• Titeln ska bara beskriva OBJEKTET, inte upprepa att konstnären är okänd

TITELFORMAT:
Om konstnär-fält tomt: [MÄRKE/KONSTNÄR]. [föremål], [material], [period] - FÖRSTA ORDET VERSALER + PUNKT
Om konstnär-fält ifyllt: [Föremål]. [antal], [material], [period] - FÖRSTA ORDET PROPER + PUNKT

KRITISKA TITELREGLER FÖR OBJEKT UTAN KONSTNÄR:
• MÅSTE börja med märke/tillverkare i VERSALER följt av PUNKT: "ROLEX.", "OMEGA.", "IKEA."
• MÅSTE sluta med PUNKT (.)
• FÖRSTA ordet efter varje komma MÅSTE ha stor bokstav: "Stål", "Automatic", "35mm"
• Format: MÄRKE. modell, material, teknik, storlek.
• EXEMPEL KORREKT: "ROLEX. Submariner, Stål, automatic, 40mm."
• EXEMPEL KORREKT: "IKEA. "Pepparkorn", Vas, Keramik, 1970-tal."
• EXEMPEL FEL: "ROLEX, Submariner, Stål, automatic, 40mm." (komma efter märke, inte punkt)
• EXEMPEL FEL: "Rolex. Submariner, Stål, automatic, 40mm." (märke inte i versaler)

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

  getEditPageUserPrompt(formData, fieldType, options = {}) {
    const baseInfo = `
FÖREMÅLSINFORMATION:
Kategori: ${formData.category || ''}
Nuvarande titel: ${formData.title || ''}
Nuvarande beskrivning: ${formData.description || ''}
Kondition: ${formData.condition || ''}
Konstnär/Formgivare: ${formData.artist || ''}
Värdering: ${formData.estimate || ''} SEK

VIKTIGT FÖR TITEL: ${formData.artist ? 
  'Konstnär/formgivare-fältet är ifyllt (' + formData.artist + '), så inkludera INTE konstnärens namn i titeln - det läggs till automatiskt av systemet. FÖRSTA ORDET I TITELN SKA VARA PROPER KAPITALISERAT följt av PUNKT (.).' : 
  'Konstnär/formgivare-fältet är tomt, så inkludera konstnärens namn i titeln om det är känt. FÖRSTA ORDET I TITELN SKA VARA VERSALER följt av KOMMA (,). Nästa ord efter komma ska ha liten bokstav (utom namn/märken).'}

KONSTNÄRSINFORMATION OCH EXPERTKUNSKAP:
${formData.artist && this.apiManager.enableArtistInfo ? 
  'Konstnär/formgivare: ' + formData.artist + ' - Använd din kunskap om denna konstnärs verk för att lägga till KORT, RELEVANT kontext. Fokusera på specifika detaljer om denna modell/serie om du känner till dem (tillverkningsår, karakteristiska drag). Håll det koncist - max 1-2 meningar extra kontext. Om du inte är säker om specifika fakta, använd "troligen" eller "anses vara".' : 
  'Lägg INTE till konstnärlig eller historisk kontext som inte redan finns i källdata.'}

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
`;

    switch(fieldType) {
      case 'all':
        return baseInfo + `
UPPGIFT: Förbättra titel, beskrivning, konditionsrapport och generera dolda sökord enligt svenska auktionsstandarder. Skriv naturligt och autentiskt - använd reglerna som riktlinjer, inte som strikta begränsningar.

VIKTIGT - ARBETSORDNING:
1. Först förbättra titel, beskrivning och kondition
2. Sedan generera sökord baserat på de FÖRBÄTTRADE fälten (inte originalfälten)

${formData.artist && this.apiManager.enableArtistInfo ? 
  'EXPERTKUNSKAP - KONSTNÄR KÄND: Eftersom konstnär/formgivare är angiven (' + formData.artist + ') och konstnärsinformation är aktiverad, lägg till KORT, RELEVANT kontext om denna specifika modell/serie. Max 1-2 extra meningar. Fokusera på konkreta fakta, inte allmän konstnärsbiografi.' : 
  'BEGRÄNSAD INFORMATION: Håll dig till befintlig information utan att lägga till konstnärlig kontext.'}

FÄLTAVGRÄNSNING:
• BESKRIVNING: Material, teknik, mått, stil, ursprung, märkningar, funktion - ALDRIG konditionsinformation
• KONDITION: Endast fysiskt skick och skador - ALDRIG beskrivande information
• Håll fälten strikt separerade - konditionsdetaljer som "slitage", "repor", "märken" hör ENDAST i konditionsfältet

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

KRITISKT - BEVARA ALLA MÅTT OCH LISTOR I BESKRIVNINGEN:
• BEHÅLL ALLTID detaljerade måttlistor: "4 snapsglas, höjd 15,5 cm", "2 vinglas, höjd 19,5 cm", etc.
• BEHÅLL ALLTID kvantiteter och specifikationer: "Bestående av:", "Består av:", antal objekt
• BEHÅLL ALLTID alla mått i cm/mm - dessa är ALDRIG konditionsinformation
• TA ENDAST BORT konditionsord som "slitage", "repor", "skador" - ALDRIG mått, kvantiteter eller listor
• EXEMPEL PÅ VAD SOM MÅSTE BEVARAS: "Bestående av: 4 snapsglas, höjd 15,5 cm, 2 vinglas, höjd 19,5 cm"

VARNING: Om du tar bort mått eller listor kommer detta att betraktas som ett KRITISKT FEL!

KRITISKT - FÖRSTA ORDETS KAPITALISERING I TITEL:
${formData.artist ? 
  '• Konstnär/formgivare-fältet är ifyllt - FÖRSTA ORDET I TITEL SKA VARA VERSAL (normal capital letter)' : 
  '• Konstnär/formgivare-fältet är tomt - FÖRSTA ORDET I TITEL SKA VARA VERSALER (uppercase)'}

KRITISKA TITELFORMATREGLER FÖR OBJEKT UTAN KONSTNÄR:
${!formData.artist ? `
• MÅSTE börja med märke/tillverkare i VERSALER följt av PUNKT: "ROLEX.", "OMEGA.", "IKEA."
• MÅSTE sluta med PUNKT (.)
• FÖRSTA ordet efter VARJE komma ska ha stor bokstav: "Stål", "Automatic", "35mm"
• Format: MÄRKE. modell, material, teknik, mått.
• KORREKT: "ROLEX. Submariner, Stål, automatic, 40mm."
• FEL: "ROLEX, Submariner, Stål, automatic, 40mm." (komma efter märke, inte punkt)
` : '• Konstnärens namn läggs till automatiskt - börja med gemener'}

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
SÖKORD: [kompletterande sökord baserade på FÖRBÄTTRADE fält ovan, separerade med mellanslag, använd "-" för flerordsfraser]

VIKTIGT FÖR SÖKORD: Använd Auctionets format med mellanslag mellan sökord och "-" för flerordsfraser.
EXEMPEL: "konstglas mundblåst svensk-design 1960-tal samlarobjekt"

Använd INTE markdown formatering eller extra tecken som ** eller ***. Skriv bara ren text.`;

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
${formData.artist && this.apiManager.enableArtistInfo ? 
  '• STRUKTUR: Befintlig beskrivning först, sedan ny konstnärsinformation i SEPARAT paragraf\n• FORMAT: Använd dubbla radbrytningar (\\n\\n) för att separera paragrafer\n• EXEMPEL: "Befintlig förbättrad beskrivning här...\\n\\nKort konstnärskontext här..."\n• Lägg till KORT, SPECIFIK kontext om denna modell/serie i SEPARAT paragraf\n• Max 1-2 meningar extra - fokusera på tillverkningsår och karakteristiska drag\n• UNDVIK allmänna beskrivningar av konstnärens karriär eller designfilosofi\n• Håll det relevant för just detta föremål' : 
  '• Returnera befintlig förbättrad beskrivning\n• Lägg INTE till konstnärlig eller historisk kontext som inte finns i källdata'}

Returnera ENDAST den förbättrade beskrivningen utan extra formatering eller etiketter.`;

      default:
        return baseInfo + `
UPPGIFT: Förbättra endast ${fieldType === 'title' ? 'titeln' : fieldType === 'condition' ? 'konditionsrapporten' : fieldType}.

${fieldType === 'title' && !formData.artist ? `
KRITISKA TITELFORMATREGLER FÖR OBJEKT UTAN KONSTNÄR:
• MÅSTE börja med märke/tillverkare i VERSALER följt av PUNKT: "ROLEX.", "OMEGA.", "IKEA."
• MÅSTE sluta med PUNKT (.)
• FÖRSTA ordet efter VARJE komma ska ha stor bokstav: "Stål", "Automatic", "35mm"
• Format: MÄRKE. modell, material, teknik, mått.
• KORREKT: "ROLEX. Submariner, Stål, automatic, 40mm."
• FEL: "ROLEX, Submariner, Stål, automatic, 40mm." (komma efter märke, inte punkt)

KRITISKA MÄRKESRÄTTSTAVNINGSREGLER:
• Rätta alltid märkesnamn till korrekt stavning/kapitalisering enligt varumärkesstandard
• IKEA: alltid versaler - "Ikea" → "IKEA", "ikea" → "IKEA"  
• iPhone: alltid "iPhone" - "Iphone" → "iPhone", "IPHONE" → "iPhone"
• Royal Copenhagen: alltid "Royal Copenhagen" - "royal copenhagen" → "Royal Copenhagen"
• Kosta Boda: alltid "Kosta Boda" - "kosta boda" → "Kosta Boda"
• Respektera märkenas officiella kapitalisering/formatering
• Om osäker på exakt stavning, behåll originalet
` : ''}

Returnera ENDAST den förbättrade texten utan extra formatering eller etiketter.`;
    
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
    }
  }

  processEditPageAPIResponse(response, fieldType) {
    const data = response.data;
    
    if (!data || !data.content || !Array.isArray(data.content) || data.content.length === 0) {
      throw new Error('Invalid response format from API');
    }
    
    if (!data.content[0] || !data.content[0].text) {
      throw new Error('No text content in API response');
    }
    
    return this.parseEditPageResponse(data.content[0].text, fieldType);
  }

  parseEditPageResponse(responseText, fieldType) {
    if (fieldType === 'all') {
      // Multi-field response: accumulate multi-line content per field
      const result = {};
      const lines = responseText.split('\n');
      let currentField = null;
      let currentContent = [];

      const fieldPatterns = [
        { regex: /^\*?\*?TITEL\s*:?\*?\*?\s*/i, key: 'title' },
        { regex: /^\*?\*?BESKRIVNING\s*:?\*?\*?\s*/i, key: 'description' },
        { regex: /^\*?\*?KONDITION(SRAPPORT)?\s*:?\*?\*?\s*/i, key: 'condition' },
        { regex: /^\*?\*?SÖKORD\s*:?\*?\*?\s*/i, key: 'keywords' }
      ];

      for (const line of lines) {
        const trimmed = line.trim();
        const matchedPattern = fieldPatterns.find(p => trimmed.match(p.regex));

        if (matchedPattern) {
          // Save previous field
          if (currentField && currentContent.length > 0) {
            result[currentField] = currentContent.join('\n').trim();
          }
          currentField = matchedPattern.key;
          currentContent = [trimmed.replace(matchedPattern.regex, '').trim()];
        } else if (currentField && trimmed.length > 0) {
          currentContent.push(line); // Keep original formatting
        } else if (currentField && trimmed.length === 0 && currentContent.length > 0) {
          currentContent.push(''); // Preserve blank lines (paragraph breaks)
        }
      }

      // Save last field
      if (currentField && currentContent.length > 0) {
        result[currentField] = currentContent.join('\n').trim();
      }

      return result;
    } else {
      const result = {};
      result[fieldType] = responseText.trim();
      
      if (fieldType === 'title-correct' && result[fieldType]) {
        result['title'] = result[fieldType];
        delete result[fieldType];
      }
      
      return result;
    }
  }

  /**
   * Remove unknown/unidentified artist phrases from a text value.
   * These terms belong exclusively in the artist field.
   */
  static stripUnknownArtistTerms(text) {
    if (!text || typeof text !== 'string') return text;

    const phrases = [
      'oidentifierad konstnär', 'okänd konstnär', 'okänd mästare',
      'oidentifierad formgivare', 'okänd formgivare', 'oidentifierad upphovsman'
    ];

    let cleaned = text;
    for (const phrase of phrases) {
      const regex = new RegExp(
        `[,;–—-]?\\s*${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[,;–—-]?`,
        'gi'
      );
      cleaned = cleaned.replace(regex, (match) => {
        const hadLeadingSep = /^[,;–—-]/.test(match.trim());
        const hadTrailingSep = /[,;–—-]$/.test(match.trim());
        return (hadLeadingSep && hadTrailingSep) ? ', ' : ' ';
      });
    }

    return cleaned
      .replace(/,\s*,/g, ',')
      .replace(/^\s*,\s*/, '')
      .replace(/\s*,\s*$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
}
