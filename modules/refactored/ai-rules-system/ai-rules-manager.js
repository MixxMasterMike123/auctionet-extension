/**
 * AI Rules Manager - Global Access System
 * 
 * This is the "package.json" equivalent for AI rules - a centralized system
 * that provides automatic access to all AI rules throughout the application.
 * 
 * Features:
 * - Single source of truth for all AI rules
 * - Automatic loading and caching
 * - Global access via singleton pattern
 * - Hot reloading capability
 * - Validation and consistency checks
 * - Performance optimized (loaded once, cached in memory)
 */

class AIRulesManager {
    constructor() {
        this.rules = null;
        this.loaded = false;
        this.configPath = chrome.runtime.getURL('modules/refactored/ai-rules-system/ai-rules-config.json');
        this.cache = new Map();
        this.version = null;

        // Auto-load rules on instantiation
        this.loadRules();
    }

    /**
     * Load AI rules configuration from JSON file
     */
    async loadRules() {
        try {
            const response = await fetch(this.configPath);
            if (!response.ok) {
                throw new Error(`Failed to load AI rules config: ${response.status}`);
            }

            this.rules = await response.json();
            this.version = this.rules.version;
            this.loaded = true;


            // Clear cache when rules are reloaded
            this.cache.clear();

        } catch (error) {
            console.error('Failed to load AI rules:', error);
            this.loaded = false;
            throw error;
        }
    }

    /**
     * Get rules statistics for debugging
     */
    getRulesStats() {
        if (!this.loaded) return 'Not loaded';

        const stats = {
            systemPrompts: Object.keys(this.rules.systemPrompts || {}).length,
            categoryRules: Object.keys(this.rules.categoryRules || {}).length,
            fieldRules: Object.keys(this.rules.fieldRules || {}).length,
            validationRules: Object.keys(this.rules.validationRules || {}).length,
            promptTemplates: Object.keys(this.rules.promptTemplates || {}).length
        };

        return Object.entries(stats)
            .map(([key, count]) => `${key}: ${count}`)
            .join(', ');
    }

    /**
     * Ensure rules are loaded before accessing
     */
    ensureLoaded() {
        if (!this.loaded) {
            console.error('AI Rules Manager instance not loaded:', {
                loaded: this.loaded,
                hasRules: !!this.rules,
                version: this.version,
                configPath: this.configPath
            });
            throw new Error('AI Rules not loaded. Call loadRules() first.');
        }
    }

    // ==================== SYSTEM PROMPTS ====================

    /**
     * Get system prompt by type
     * @param {string} type - Prompt type (core, titleCorrect, addItems)
     * @param {string} source - Source file (apiManager, contentJs, addItemsTooltip)
     * @returns {string} System prompt
     */
    getSystemPrompt(type = 'core', source = null) {
        this.ensureLoaded();

        const cacheKey = `systemPrompt_${type}_${source}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        let prompt;

        // If source is specified, try to get source-specific prompt first
        if (source && this.rules.extractedRules[source]?.systemPrompt) {
            prompt = this.rules.extractedRules[source].systemPrompt;
        } else {
            // Fall back to standard system prompts
            prompt = this.rules.systemPrompts[type];
        }

        if (!prompt) {
            prompt = this.rules.systemPrompts.core;
        }

        this.cache.set(cacheKey, prompt);
        return prompt;
    }

    // ==================== CATEGORY RULES ====================

    /**
     * Get category-specific rules and prompts
     * @param {string} category - Category identifier
     * @returns {object} Category rules object
     */
    getCategoryRules(category) {
        this.ensureLoaded();

        const cacheKey = `categoryRules_${category}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const rules = this.rules.categoryRules[category];
        if (!rules) {
            return null;
        }

        this.cache.set(cacheKey, rules);
        return rules;
    }

    /**
     * Get category-specific prompt addition
     * @param {string} category - Category identifier
     * @returns {string} Category prompt or empty string
     */
    getCategoryPrompt(category) {
        const rules = this.getCategoryRules(category);
        return rules?.prompt || '';
    }

    /**
     * Check if category has anti-hallucination rules
     * @param {string} category - Category identifier
     * @returns {boolean} True if anti-hallucination is enabled
     */
    hasAntiHallucinationRules(category) {
        const rules = this.getCategoryRules(category);
        return rules?.antiHallucination === true;
    }

    /**
     * Get model-specific valuation rules for a category
     * @param {string} category - Category identifier (e.g., 'freetextParser')
     * @param {string} modelId - Model identifier (e.g., 'claude-sonnet-4-5')
     * @returns {object} Model-specific valuation rules
     */
    getModelSpecificValuationRules(category, modelId) {
        this.ensureLoaded();

        const cacheKey = `valuationRules_${category}_${modelId}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const categoryRules = this.getCategoryRules(category);
        if (!categoryRules?.valuationRules) {
            return { approach: 'conservative', instruction: 'Var konservativ med värderingar' };
        }

        // Try to get model-specific rules
        let rules = categoryRules.valuationRules[modelId];

        // Fallback to default if model-specific rules not found
        if (!rules) {
            rules = categoryRules.valuationRules.default || {
                approach: 'conservative',
                instruction: 'Var konservativ med värderingar'
            };
        }

        this.cache.set(cacheKey, rules);
        return rules;
    }

    // ==================== FIELD RULES ====================

    /**
     * Get field-specific rules
     * @param {string} field - Field name (title, description, condition, keywords)
     * @returns {object} Field rules object
     */
    getFieldRules(field) {
        this.ensureLoaded();

        const cacheKey = `fieldRules_${field}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const rules = this.rules.fieldRules[field];
        if (!rules) {
            return {};
        }

        this.cache.set(cacheKey, rules);
        return rules;
    }

    /**
     * Get title formatting rules based on artist context
     * @param {boolean} hasArtist - Whether artist field is filled
     * @returns {object} Title formatting rules
     */
    getTitleRules(hasArtist = false) {
        const fieldRules = this.getFieldRules('title');
        const contextRules = hasArtist ?
            this.rules.contextRules.artistFieldFilled :
            this.rules.contextRules.artistFieldEmpty;

        return {
            ...fieldRules,
            ...contextRules
        };
    }

    // ==================== VALIDATION RULES ====================

    /**
     * Get validation rules
     * @returns {object} Validation rules object
     */
    getValidationRules() {
        this.ensureLoaded();

        if (this.cache.has('validationRules')) {
            return this.cache.get('validationRules');
        }

        const rules = this.rules.validationRules;
        this.cache.set('validationRules', rules);
        return rules;
    }

    /**
     * Get list of forbidden words
     * @returns {string[]} Array of forbidden words
     */
    getForbiddenWords() {
        const validation = this.getValidationRules();
        return validation.forbiddenWords || [];
    }

    /**
     * Check if word is forbidden
     * @param {string} word - Word to check
     * @returns {boolean} True if word is forbidden
     */
    isForbiddenWord(word) {
        const forbidden = this.getForbiddenWords();
        return forbidden.includes(word.toLowerCase());
    }

    // ==================== PROMPT BUILDING ====================

    /**
     * Build complete prompt for AI request
     * @param {object} options - Prompt options
     * @param {string} options.type - System prompt type
     * @param {string} options.category - Item category
     * @param {string[]} options.fields - Fields to process
     * @param {object} options.context - Additional context
     * @returns {object} Complete prompt object
     */
    buildPrompt(options = {}) {
        this.ensureLoaded();

        const {
            type = 'core',
            category = null,
            fields = ['all'],
            context = {}
        } = options;

        // Build system prompt
        let systemPrompt = this.getSystemPrompt(type);

        // Add category-specific rules
        if (category) {
            const categoryPrompt = this.getCategoryPrompt(category);
            if (categoryPrompt) {
                systemPrompt += '\n\n' + categoryPrompt;
            }
        }

        // Build user prompt based on fields
        let userPrompt = '';
        if (fields.includes('all')) {
            userPrompt = this.rules.promptTemplates.fieldSpecific.all;
        } else {
            const fieldPrompts = fields.map(field =>
                this.rules.promptTemplates.fieldSpecific[field]
            ).filter(Boolean);
            userPrompt = fieldPrompts.join('\n\n');
        }

        return {
            systemPrompt,
            userPrompt,
            metadata: {
                type,
                category,
                fields,
                version: this.version,
                timestamp: new Date().toISOString()
            }
        };
    }

    /**
     * Get category specific prompt based on item data and keywords
     * @param {object} itemData - Item data
     * @returns {string} Category specific prompt
     */
    getCategorySpecificPrompt(itemData) {
        const category = (itemData.category || '').toLowerCase();
        const title = (itemData.title || '').toLowerCase();
        const description = (itemData.description || '').toLowerCase();

        // Helper to check keywords
        const hasKeywords = (keywords) => keywords.some(k => category.includes(k) || title.includes(k) || description.includes(k));

        // Detect category and get rules
        let rules = null;

        if (hasKeywords(['vapen', 'svärd', 'kniv', 'bajonett', 'militaria', 'krigshistoria'])) {
            rules = this.getCategoryRules('weapons');
        } else if (hasKeywords(['armbandsur', 'klocka'])) {
            rules = this.getCategoryRules('watches');
        } else if (hasKeywords(['antikviteter', 'arkeologi', 'etnografika', 'historiska'])) {
            rules = this.getCategoryRules('historical');
        } else if (hasKeywords(['smycken', 'guld', 'silver', 'diamant', 'ädelsten'])) {
            rules = this.getCategoryRules('jewelry');
        }

        return rules ? rules.prompt : '';
    }

    /**
     * Generate user prompt with full logic (migrated from APIManager)
     * @param {object} itemData - Item data
     * @param {string} fieldType - Field type to generate prompt for
     * @param {object} options - Options including enableArtistInfo
     * @returns {string} Generated user prompt
     */
    generateUserPrompt(itemData, fieldType, options = {}) {
        const enableArtistInfo = options.enableArtistInfo !== false; // Default to true

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
${itemData.artist && enableArtistInfo ?
                'Konstnär/formgivare: ' + itemData.artist + ' - Använd din kunskap om denna konstnärs verk för att lägga till KORT, RELEVANT kontext. Fokusera på specifika detaljer om denna modell/serie om du känner till dem (tillverkningsår, karakteristiska drag). Håll det koncist - max 1-2 meningar extra kontext. Om du inte är säker om specifika fakta, använd "troligen" eller "anses vara".' :
                'Lägg INTE till konstnärlig eller historisk kontext som inte redan finns i källdata.'}

DEBUG INFO: Artist="${itemData.artist}", EnableArtistInfo=${enableArtistInfo}, ShouldAddArtistInfo=${!!(itemData.artist && enableArtistInfo)}

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

${this.getCategorySpecificPrompt(itemData)}
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

${itemData.artist && enableArtistInfo ?
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
                        '• Konstnär/formgivare-fältet är ifyllt:\\n• FÖRSTA ORDET SKA VARA PROPER KAPITALISERAT (första bokstaven versal) följt av PUNKT (.)\\n• Nästa ord efter punkt ska ha stor bokstav\\n• Exempel: "Skulpturer. 2 st, porträttbyster" (blir "SVEN GUNNARSSON. Skulpturer. 2 st, porträttbyster")\\n• FÖRBJUDET: "SKULPTURER" (versaler) eller "skulpturer" (gemener)\\n• KORREKT: "Skulpturer." (proper kapitalisering + punkt)' :
                        '• Konstnär/formgivare-fältet är tomt:\\n• FÖRSTA ORDET SKA VARA VERSALER (uppercase) följt av KOMMA (,)\\n• Nästa ord efter komma ska ha liten bokstav (utom namn/märken)\\n• Exempel: "BAJONETT, Eskilstuna, 1900-tal"\\n• KORREKT: "BORDSLAMPOR, 2 st, Kosta Boda"'}

SPECIAL REGEL - KONSTNÄR I MITTEN/SLUTET AV TITEL:
• Om konstnärsnamn finns i MITTEN eller SLUTET av nuvarande titel (inte först) - BEHÅLL det där
• Detta gäller när OBJEKTET är huvudsaken, inte konstnären  
• Korrigera stavfel i konstnärsnamnet men behåll exakt position
• FÖRSTA ORDET ska vara VERSALER (objektnamnet är huvudsaken)
• EXEMPEL: "SERVISDELAR, 24 delar, porslin, Stig Lindberg, \'Spisa Ribb\', Gustavsberg. 1900-tal."
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
${itemData.artist && enableArtistInfo ?
                        '• STRUKTUR: Befintlig beskrivning först, sedan ny konstnärsinformation i SEPARAT paragraf\\n• FORMAT: Använd dubbla radbrytningar (\\\\n\\\\n) för att separera paragrafer i beskrivningsfältet\\n• EXEMPEL: "Befintlig förbättrad beskrivning här...\\\\n\\\\nKort konstnärskontext här..."\\n• Lägg till KORT, SPECIFIK kontext om denna modell/serie i SEPARAT paragraf\\n• Max 1-2 meningar extra - fokusera på tillverkningsår och karakteristiska drag\\n• UNDVIK allmänna beskrivningar av konstnärens karriär eller designfilosofi\\n• Håll det relevant för just detta föremål' :
                        '• Returnera befintlig förbättrad beskrivning\\n• Lägg INTE till konstnärlig eller historisk kontext som inte finns i källdata'}
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
                        '• Konstnär/formgivare-fältet är ifyllt - FÖRSTA ORDET SKA VARA PROPER KAPITALISERAT (första bokstaven versal)\\n• Exempel: "Skulpturer" (blir "SVEN GUNNARSSON. Skulpturer") INTE "SKULPTURER" eller "skulpturer"\\n• Auctionet lägger till: "KONSTNÄR. " så titeln ska vara "Skulpturer" inte "skulpturer"' :
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
                        '• Konstnär/formgivare-fältet är ifyllt:\\n• FÖRSTA ORDET SKA VARA PROPER KAPITALISERAT (första bokstaven versal) följt av PUNKT (.)\\n• Nästa ord efter punkt ska ha stor bokstav\\n• Exempel: "Skulpturer. 2 st, porträttbyster" (blir "SVEN GUNNARSSON. Skulpturer. 2 st, porträttbyster")\\n• FÖRBJUDET: "SKULPTURER" (versaler) eller "skulpturer" (gemener)\\n• KORREKT: "Skulpturer." (proper kapitalisering + punkt)' :
                        '• Konstnär/formgivare-fältet är tomt:\\n• FÖRSTA ORDET SKA VARA VERSALER (uppercase) följt av KOMMA (,)\\n• Nästa ord efter komma ska ha liten bokstav (utom namn/märken)\\n• Exempel: "BAJONETT, Eskilstuna, 1900-tal"\\n• KORREKT: "BORDSLAMPOR, 2 st, Kosta Boda"'}

SPECIAL REGEL - KONSTNÄR I MITTEN/SLUTET AV TITEL:
• Om konstnärsnamn finns i MITTEN eller SLUTET av nuvarande titel (inte först) - BEHÅLL det där
• Detta gäller när OBJEKTET är huvudsaken, inte konstnären  
• Korrigera stavfel i konstnärsnamnet men behåll exakt position
• FÖRSTA ORDET ska vara VERSALER (objektnamnet är huvudsaken)
• EXEMPEL: "SERVISDELAR, 24 delar, porslin, Stig Lindberg, \'Spisa Ribb\', Gustavsberg. 1900-tal."
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
${itemData.artist && enableArtistInfo ?
                        '• STRUKTUR: Befintlig beskrivning först, sedan ny konstnärsinformation i SEPARAT paragraf\\n• FORMAT: Använd dubbla radbrytningar (\\\\n\\\\n) för att separera paragrafer\\n• EXEMPEL: "Befintlig förbättrad beskrivning här...\\\\n\\\\nKort konstnärskontext här..."\\n• Lägg till KORT, SPECIFIK kontext om denna modell/serie i SEPARAT paragraf\\n• Max 1-2 meningar extra - fokusera på tillverkningsår och karakteristiska drag\\n• UNDVIK allmänna beskrivningar av konstnärens karriär eller designfilosofi\\n• Håll det relevant för just detta föremål' :
                        '• Returnera befintlig förbättrad beskrivning\\n• Lägg INTE till konstnärlig eller historisk kontext som inte finns i källdata'}
• Lägg INTE till mått som inte är angivna
• Lägg INTE till material som inte är nämnt (såvida det inte är känt från konstnärens typiska tekniker)
• Lägg INTE till märkningar eller signaturer som inte finns
• Förbättra språk, struktur och befintlig information
• Lägg ALDRIG till kommentarer om vad som "saknas" eller "behövs"

KRITISKT - RETURFORMAT:
• Returnera ENDAST beskrivningstexten med radbrytningar för separata paragrafer
• Använd dubbla radbrytningar (\\\\n\\\\n) för att separera paragrafer
• INGEN HTML-formatering, inga extra etiketter
• Exempel utan konstnärsinfo: "Förbättrad beskrivning här..."
• Exempel med konstnärsinfo: "Förbättrad beskrivning här...\\\\n\\\\nKonstnärskontext här..."

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

            case 'biography':
                return `
UPPGIFT: Skriv en kort, informativ biografi om konstnären "${itemData.artist}" på svenska.

KRAV:
• Max 150 ord
• Fokusera på stil, period, viktiga verk och betydelse
• Skriv på professionell svenska
• Inga inledande fraser som "Här är en biografi..."
• Bara ren text

FORMAT:
Returnera endast biografin som ren text.
`;

            default:
                return baseInfo;
        }
    }

    // ==================== BRAND CORRECTIONS ====================

    /**
     * Get brand corrections mapping
     * @returns {object} Brand corrections object
     */
    getBrandCorrections() {
        this.ensureLoaded();

        // Get from extracted brand validation rules first
        const extractedBrandRules = this.rules.extractedRules?.brandValidation?.rules?.brandCorrections;
        if (extractedBrandRules) {
            return extractedBrandRules;
        }

        // Fall back to field rules
        const titleRules = this.getFieldRules('title');
        return titleRules.brandCorrections || {};
    }

    /**
     * Apply brand corrections to text
     * @param {string} text - Text to correct
     * @returns {string} Corrected text
     */
    applyBrandCorrections(text) {
        const corrections = this.getBrandCorrections();
        let correctedText = text;

        Object.entries(corrections).forEach(([incorrect, correct]) => {
            const regex = new RegExp(`\\b${incorrect}\\b`, 'gi');
            correctedText = correctedText.replace(regex, correct);
        });

        return correctedText;
    }

    // ==================== EXTRACTED RULES ACCESS ====================

    /**
     * Get extracted rules from specific source
     * @param {string} source - Source file (apiManager, contentJs, addItemsTooltip, etc.)
     * @returns {object} Extracted rules object
     */
    getExtractedRules(source) {
        this.ensureLoaded();

        const cacheKey = `extractedRules_${source}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const rules = this.rules.extractedRules?.[source];
        if (!rules) {
            return null;
        }

        this.cache.set(cacheKey, rules);
        return rules;
    }

    /**
     * Get quality analyzer validation rules
     * @returns {object} Quality validation rules
     */
    getQualityValidationRules() {
        this.ensureLoaded();

        if (this.cache.has('qualityValidationRules')) {
            return this.cache.get('qualityValidationRules');
        }

        const rules = this.rules.extractedRules?.qualityAnalyzer?.validationRules;
        if (!rules) {
            return {};
        }

        this.cache.set('qualityValidationRules', rules);
        return rules;
    }

    /**
     * Check if phrase is forbidden
     * @param {string} phrase - Phrase to check
     * @returns {boolean} True if phrase is forbidden
     */
    isForbiddenPhrase(phrase) {
        const qualityRules = this.getQualityValidationRules();
        const forbiddenPhrases = qualityRules.forbiddenPhrases || [];
        return forbiddenPhrases.some(forbidden =>
            phrase.toLowerCase().includes(forbidden.toLowerCase())
        );
    }

    /**
     * Get fuzzy brand matching rules
     * @returns {object} Fuzzy matching configuration
     */
    getFuzzyMatchingRules() {
        this.ensureLoaded();

        const brandRules = this.rules.extractedRules?.brandValidation?.rules?.fuzzyMatching;
        return brandRules || { enabled: false, threshold: 0.8, commonMisspellings: {} };
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Hot reload rules configuration
     */
    async reload() {
        this.cache.clear(); // Clear cache to force fresh load
        await this.loadRules();
    }

    /**
     * Clear cache for specific model valuation rules
     */
    clearValuationCache(modelId = null) {
        if (modelId) {
            // Clear cache for specific model
            const keysToDelete = [];
            for (const key of this.cache.keys()) {
                if (key.includes('valuationRules') && key.includes(modelId)) {
                    keysToDelete.push(key);
                }
            }
            keysToDelete.forEach(key => this.cache.delete(key));
        } else {
            // Clear all valuation cache
            const keysToDelete = [];
            for (const key of this.cache.keys()) {
                if (key.includes('valuationRules')) {
                    keysToDelete.push(key);
                }
            }
            keysToDelete.forEach(key => this.cache.delete(key));
        }
    }

    /**
     * Get current configuration version
     * @returns {string} Version string
     */
    getVersion() {
        return this.version;
    }

    /**
     * Validate rules configuration
     * @returns {object} Validation result
     */
    validateConfiguration() {
        this.ensureLoaded();

        const errors = [];
        const warnings = [];

        // Check required sections
        const requiredSections = ['systemPrompts', 'categoryRules', 'fieldRules', 'validationRules'];
        requiredSections.forEach(section => {
            if (!this.rules[section]) {
                errors.push(`Missing required section: ${section}`);
            }
        });

        // Check system prompts
        const requiredPrompts = ['core', 'titleCorrect', 'addItems'];
        requiredPrompts.forEach(prompt => {
            if (!this.rules.systemPrompts?.[prompt]) {
                errors.push(`Missing required system prompt: ${prompt}`);
            }
        });

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            version: this.version
        };
    }

    /**
     * Export current configuration for debugging
     * @returns {object} Current rules configuration
     */
    exportConfiguration() {
        this.ensureLoaded();
        return JSON.parse(JSON.stringify(this.rules));
    }
}

// ==================== GLOBAL SINGLETON ====================

// Create global singleton instance
let globalAIRulesManager = null;

/**
 * Get global AI Rules Manager instance
 * @returns {AIRulesManager} Global instance
 */
function getAIRulesManager() {
    if (!globalAIRulesManager) {
        globalAIRulesManager = new AIRulesManager();
    }
    return globalAIRulesManager;
}

/**
 * Initialize AI Rules System globally
 * Call this once at application startup
 */
async function initializeAIRulesSystem() {
    try {
        const manager = getAIRulesManager();
        await manager.loadRules();

        // Validate configuration
        const validation = manager.validateConfiguration();
        if (!validation.valid) {
            console.error('AI Rules configuration validation failed:', validation.errors);
            throw new Error('Invalid AI rules configuration');
        }

        return manager;

    } catch (error) {
        console.error('Failed to initialize AI Rules System:', error);
        throw error;
    }
}

// ==================== CONVENIENCE FUNCTIONS ====================

/**
 * Quick access functions for common operations
 * These provide the "auto-import" experience
 */

// System prompts
const getSystemPrompt = (type, source) => getAIRulesManager().getSystemPrompt(type, source);
const getCorePrompt = () => getSystemPrompt('core');
const getTitleCorrectPrompt = () => getSystemPrompt('titleCorrect');
const getAddItemsPrompt = () => getSystemPrompt('addItems');

// Category rules
const getCategoryRules = (category) => getAIRulesManager().getCategoryRules(category);
const getCategoryPrompt = (category) => getAIRulesManager().getCategoryPrompt(category);
const hasAntiHallucination = (category) => getAIRulesManager().hasAntiHallucinationRules(category);
const getModelSpecificValuationRules = (category, modelId) => getAIRulesManager().getModelSpecificValuationRules(category, modelId);

// Field rules
const getFieldRules = (field) => getAIRulesManager().getFieldRules(field);
const getTitleRules = (hasArtist) => getAIRulesManager().getTitleRules(hasArtist);

// Validation
const getForbiddenWords = () => getAIRulesManager().getForbiddenWords();
const isForbiddenWord = (word) => getAIRulesManager().isForbiddenWord(word);
const isForbiddenPhrase = (phrase) => getAIRulesManager().isForbiddenPhrase(phrase);
const applyBrandCorrections = (text) => getAIRulesManager().applyBrandCorrections(text);

// Brand and artist corrections
const getBrandCorrections = () => getAIRulesManager().getBrandCorrections();
const getArtistCorrections = () => getAIRulesManager().getBrandCorrections(); // Use same data for now

// Extracted rules access
const getExtractedRules = (source) => getAIRulesManager().getExtractedRules(source);
const getQualityValidationRules = () => getAIRulesManager().getQualityValidationRules();
const getFuzzyMatchingRules = () => getAIRulesManager().getFuzzyMatchingRules();

// Prompt building
const buildPrompt = (options) => getAIRulesManager().buildPrompt(options);
const generateUserPrompt = (itemData, fieldType, options) => getAIRulesManager().generateUserPrompt(itemData, fieldType, options);
const getCategorySpecificPrompt = (itemData) => getAIRulesManager().getCategorySpecificPrompt(itemData);

// Cache management
const clearValuationCache = (modelId) => getAIRulesManager().clearValuationCache(modelId);
const reloadAIRules = () => getAIRulesManager().reload();

// Export everything for module usage
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = {
        AIRulesManager,
        getAIRulesManager,
        initializeAIRulesSystem,
        // Convenience functions
        getSystemPrompt,
        getCorePrompt,
        getTitleCorrectPrompt,
        getAddItemsPrompt,
        getCategoryRules,
        getCategoryPrompt,
        hasAntiHallucination,
        getModelSpecificValuationRules,
        getFieldRules,
        getTitleRules,
        getForbiddenWords,
        isForbiddenWord,
        isForbiddenPhrase,
        applyBrandCorrections,
        getBrandCorrections,
        getArtistCorrections,
        getExtractedRules,
        getQualityValidationRules,
        getFuzzyMatchingRules,
        buildPrompt,
        generateUserPrompt,
        getCategorySpecificPrompt
    };
} else {
    // Browser environment - attach to window for global access
    window.AIRulesManager = AIRulesManager;
    window.getAIRulesManager = getAIRulesManager;
    window.initializeAIRulesSystem = initializeAIRulesSystem;

    // Convenience functions available globally
    window.getSystemPrompt = getSystemPrompt;
    window.getCorePrompt = getCorePrompt;
    window.getTitleCorrectPrompt = getTitleCorrectPrompt;
    window.getAddItemsPrompt = getAddItemsPrompt;
    window.getCategoryRules = getCategoryRules;
    window.getCategoryPrompt = getCategoryPrompt;
    window.hasAntiHallucination = hasAntiHallucination;
    window.getModelSpecificValuationRules = getModelSpecificValuationRules;
    window.getFieldRules = getFieldRules;
    window.getTitleRules = getTitleRules;
    window.getForbiddenWords = getForbiddenWords;
    window.isForbiddenWord = isForbiddenWord;
    window.isForbiddenPhrase = isForbiddenPhrase;
    window.applyBrandCorrections = applyBrandCorrections;
    window.getBrandCorrections = getBrandCorrections;
    window.getArtistCorrections = getArtistCorrections;
    window.getExtractedRules = getExtractedRules;
    window.getQualityValidationRules = getQualityValidationRules;
    window.getFuzzyMatchingRules = getFuzzyMatchingRules;
    window.buildPrompt = buildPrompt;
    window.generateUserPrompt = generateUserPrompt;
    window.getCategorySpecificPrompt = getCategorySpecificPrompt;
    window.clearValuationCache = clearValuationCache;
    window.reloadAIRules = reloadAIRules;
}

// ES6 export for modern module imports
export { AIRulesManager }; 