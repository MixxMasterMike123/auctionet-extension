// modules/api-manager.js - API Management Module
import { CONFIG } from './config.js';
import { AuctionetAPI } from './auctionet-api.js';
import { AIAnalysisEngine } from './core/ai-analysis-engine.js';

export class APIManager {
  constructor() {
    this.apiKey = null;
    this.enableArtistInfo = true;
    this.showDashboard = true; // Default to showing dashboard
    this.currentModel = 'sonnet'; // Claude Sonnet 4.5
    this.auctionetAPI = new AuctionetAPI();
    this.auctionetAPI.setAPIManager(this); // Give AuctionetAPI access to Claude for AI validation
    this.searchQuerySSoT = null; // NEW: AI-only SearchQuerySSoT support

    // Initialize AI Analysis Engine
    this.aiAnalysisEngine = new AIAnalysisEngine(this);

    this.loadSettings();
  }

  async loadSettings() {
    try {
      // API key stored in local (not synced) for security; preferences in sync
      const [localResult, syncResult] = await Promise.all([
        chrome.storage.local.get(['anthropicApiKey']),
        chrome.storage.sync.get(['enableArtistInfo', 'showDashboard'])
      ]);
      const result = { ...localResult, ...syncResult };
      this.apiKey = result.anthropicApiKey;
      this.enableArtistInfo = result.enableArtistInfo !== false;
      this.showDashboard = result.showDashboard !== false;

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

  // Get current model
  getCurrentModel() {
    return CONFIG.MODELS[this.currentModel] || CONFIG.MODELS['sonnet'];
  }

  async callClaudeAPI(itemData, fieldType, retryCount = 0) {
    if (!this.apiKey) {
      throw new Error('API key not configured. Please set your Anthropic API key in the extension popup.');
    }

    const systemPrompt = this.getSystemPrompt();
    const userPrompt = this.getUserPrompt(itemData, fieldType);

    // Format system prompt with cache_control for Anthropic prompt caching
    // The large system prompt (~3500 tokens) is identical across calls — caching saves ~90% on input cost
    const systemWithCache = [{
      type: 'text',
      text: systemPrompt,
      cache_control: { type: 'ephemeral' }
    }];

    try {
      const response = await new Promise((resolve, reject) => {
        // Guard against the service worker being terminated — without this the
        // Promise would hang forever if the background script never responds.
        const timeoutId = setTimeout(() => {
          reject(new Error('Claude API request timed out (background script did not respond)'));
        }, 35000);

        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiKey,
          body: {
            model: this.getCurrentModel().id,
            max_tokens: fieldType === 'title-correct' ? 500 : CONFIG.API.maxTokens,
            temperature: CONFIG.API.temperature,
            system: systemWithCache,
            messages: [{
              role: 'user',
              content: userPrompt
            }]
          }
        }, (response) => {
          clearTimeout(timeoutId);
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

      // Re-use cached system prompt for correction call
      const systemWithCacheCorrection = [{
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' }
      }];

      const correctionResponse = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'anthropic-fetch',
          apiKey: this.apiKey,
          body: {
            model: this.getCurrentModel().id,
            max_tokens: CONFIG.API.maxTokens,
            temperature: CONFIG.API.temperature,
            system: systemWithCacheCorrection,
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

    // SPECIAL CASE: Biography returns plain text, no structured parsing needed
    if (fieldType === 'biography') {
      return { biography: response.trim() };
    }

    // For single field requests — use accumulator to preserve multi-line content (paragraphs)
    if (['title', 'title-correct', 'description', 'condition', 'keywords'].includes(fieldType)) {
      const result = {};
      const lines = response.split('\n');

      const fieldPatterns = [
        { regex: /^\*?\*?TITEL\s*:?\*?\*?\s*/i, key: 'title' },
        { regex: /^\*?\*?BESKRIVNING\s*:?\*?\*?\s*/i, key: 'description' },
        { regex: /^\*?\*?KONDITION(SRAPPORT)?\s*:?\*?\*?\s*/i, key: 'condition' },
        { regex: /^\*?\*?SÖKORD\s*:?\*?\*?\s*/i, key: 'keywords' }
      ];

      let currentField = null;
      let currentContent = [];

      for (const line of lines) {
        const trimmed = line.trim();
        const matchedPattern = fieldPatterns.find(p => trimmed.match(p.regex));

        if (matchedPattern) {
          if (currentField && currentContent.length > 0) {
            result[currentField] = currentContent.join('\n').trim();
          }
          currentField = matchedPattern.key;
          currentContent = [trimmed.replace(matchedPattern.regex, '').trim()];
        } else if (currentField && trimmed.length > 0) {
          currentContent.push(line);
        } else if (currentField && trimmed.length === 0 && currentContent.length > 0) {
          currentContent.push(''); // Preserve paragraph breaks
        }
      }

      if (currentField && currentContent.length > 0) {
        result[currentField] = currentContent.join('\n').trim();
      }

      if (Object.keys(result).length === 0) {
        result[fieldType] = response.trim();
      }

      // For title-correct, map the result to title field for field application
      if (fieldType === 'title-correct' && result[fieldType]) {
        result.title = result[fieldType];
        delete result[fieldType];
      }

      // Strip unknown-artist phrases from non-artist fields
      return APIManager.filterResultUnknownArtistTerms(result);
    }

    // Parse multi-field responses with proper multi-line support
    const result = {};
    const lines = response.split('\n');


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
      } else if (currentField && trimmedLine.length === 0 && currentContent.length > 0) {
        // Preserve blank lines within a field (paragraph breaks in descriptions)
        currentContent.push('');
      }
    }

    // Save the last field
    if (currentField && currentContent.length > 0) {
      result[currentField] = currentContent.join('\n').trim();
    }

    if (Object.keys(result).length === 0 && response.trim().length > 0) {
      result.title = response.trim();
    }

    // Strip unknown-artist phrases from non-artist fields
    return APIManager.filterResultUnknownArtistTerms(result);
  }

  /**
   * Remove unknown/unidentified artist phrases from a text string.
   * These terms belong exclusively in the artist field.
   */
  static stripUnknownArtistTerms(text) {
    if (!text || typeof text !== 'string') return text;

    const phrases = [
      'oidentifierad konstnär', 'okänd konstnär', 'okänd mästare',
      'oidentifierad formgivare', 'okänd formgivare', 'oidentifierad upphovsman'
    ];

    let changed = false;
    let cleaned = text;
    for (const phrase of phrases) {
      const regex = new RegExp(
        `[,;–—-]?\\s*${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[,;–—-]?`,
        'gi'
      );
      const before = cleaned;
      cleaned = cleaned.replace(regex, (match) => {
        const hadLeadingSep = /^[,;–—-]/.test(match.trim());
        const hadTrailingSep = /[,;–—-]$/.test(match.trim());
        return (hadLeadingSep && hadTrailingSep) ? ', ' : ' ';
      });
      if (cleaned !== before) changed = true;
    }

    // Only run cleanup if a phrase was actually removed; use [^\S\r\n] to
    // collapse horizontal whitespace without destroying paragraph breaks (\n)
    if (!changed) return text;

    cleaned = cleaned
      .replace(/,\s*,/g, ',')
      .replace(/^\s*,\s*/, '')
      .replace(/\s*,\s*$/, '')
      .replace(/[^\S\r\n]{2,}/g, ' ')
      .trim();

    return cleaned;
  }

  /**
   * Filter all non-artist fields in a parsed result object to remove
   * unknown-artist phrases that Claude may have included despite instructions.
   */
  static filterResultUnknownArtistTerms(result) {
    const fieldsToFilter = ['title', 'description', 'condition', 'keywords'];
    for (const field of fieldsToFilter) {
      if (result[field]) {
        result[field] = APIManager.stripUnknownArtistTerms(result[field]);
      }
    }
    return result;
  }

  getCategorySpecificRules(itemData, fieldType = 'all') {
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

    // Detect furniture
    const isFurniture = category.includes('möbler') ||
      category.includes('byrå') ||
      category.includes('bord') ||
      category.includes('stol') ||
      category.includes('soffa') ||
      category.includes('skåp') ||
      title.match(/^(byrå|bord|stol|fåtölj|soffa|skåp|bokhylla|sekretär|vitrinskåp|sängbord|kommod|piedestal|pall|bänk)/i);

    if (isFurniture) {
      const isAllFields = fieldType === 'all' || fieldType === 'all-sparse' || fieldType === 'all-enhanced';
      const woodTypeRule = isAllFields
        ? `• TA BORT alla träslag från titeln — träslag hör ALDRIG hemma i titeln för möbler
• Använd din kunskap för att identifiera ALLA typer av trä/träslag (t.ex. furu, ek, jakaranda, teak, mahogny, björk, valnöt, palisander, och ALLA andra träslag du känner till)
• Om du identifierar ett träslag i titeln — FLYTTA det till beskrivningen istället, ALDRIG behåll det i titeln
• KRITISKT: När du tar bort ett träslag från titeln MÅSTE du lägga till det FÖRST i beskrivningen. Om beskrivningen inte redan innehåller träslaget, skriv det som första ord i beskrivningen (t.ex. "Teak. Överdel i form av...")
• EXEMPEL: Titel "Bord, furu, Karl Andersson" → titel: "Bord. Karl Andersson & Söner" + beskrivning: "Furu. [befintlig beskrivning]"
• EXEMPEL: Titel "BYRÅ, jakaranda, 1960/70-tal" → titel: "BYRÅ, 1960/70-tal" + beskrivning: "Jakaranda. [befintlig beskrivning]"
• EXEMPEL: Titel "BOKHYLLA, teak, 1950/60-tal" → titel: "BOKHYLLA, 1950/60-tal" + beskrivning: "Teak. [befintlig beskrivning]"
• Om du TAR BORT träslag från titeln men INTE lägger till det i beskrivningen är det ett FEL — informationen går förlorad`
        : `• Enligt Auctionets regler hör träslag egentligen INTE hemma i titeln för möbler, men eftersom du bara förbättrar titeln (inte beskrivningen) — BEHÅLL träslaget i titeln så att informationen inte går förlorad
• Träslaget flyttas korrekt till beskrivningen när användaren kör "Förbättra alla fält"`;

      return `
KATEGORI-SPECIFIK REGEL - MÖBLER:
Detta är en möbel. Följ Auctionets katalogiseringsregler för möbler.

TITELFORMAT FÖR MÖBLER:
• Format: "BYRÅ, gustaviansk, sent 1700-tal." eller "FÅTÖLJ, "Karin", Bruno Mathsson, Dux."
${woodTypeRule}
• Ange stil och ålder i titeln

BESKRIVNING FÖR MÖBLER:
• Skriv ALLTID ut träslag i beskrivningen (om känt/angivet) — särskilt om det togs bort från titeln
• Träslaget ska stå FÖRST i beskrivningen
• Var försiktig med träslag — om osäker, nämn det inte alls (undvik reklamationer)
• Mått anges SIST i beskrivningen: "Längd 84 cm, bredd 47 cm, höjd 92 cm"

ANTI-HALLUCINATION FÖR MÖBLER:
• Lägg ALDRIG till träslag som inte är angivet i källan
• Uppfinn INTE stilperiod om den inte framgår av källan`;
    }

    // Detect rugs/carpets
    const isRug = category.includes('matta') ||
      category.includes('mattor') ||
      title.match(/^matta/i) ||
      title.match(/^orientalisk/i);

    if (isRug) {
      return `
KATEGORI-SPECIFIK REGEL - MATTOR:
Detta är en matta. Följ Auctionets katalogiseringsregler för mattor.

TITELFORMAT FÖR MATTOR:
• Måtten ska ALLTID skrivas i titeln — detta är ett krav
• Format: "MATTA, orientalisk, semiantik, ca 320 x 230 cm."
• Ange typ, stil/ursprung, ålder och mått

BESKRIVNING FÖR MATTOR:
• Var utförlig med typ, teknik, mönster, färger
• Mått behöver inte upprepas i beskrivningen om de redan står i titeln`;
    }

    // Detect silver/gold items (not jewelry — those are caught above)
    const isSilverGold = (category.includes('silver') || category.includes('guld') ||
      title.match(/\bsilver\b/i) || description.match(/\bsilver\b/i) ||
      description.match(/\bstämpel/i) || description.match(/\bhallmark/i)) &&
      !isJewelry;

    if (isSilverGold) {
      return `
KATEGORI-SPECIFIK REGEL - SILVER OCH GULD:
Detta är ett föremål i silver eller guld. Följ Auctionets katalogiseringsregler.

TITELFORMAT FÖR SILVER:
• Format: "BÄGARE, 2 st, silver, rokokostil, CG Hallberg, Stockholm, 1942-56 ca 450 gram."
• Vikt anges ALLTID SIST i titeln för silver och guld — ta ALDRIG bort vikt från titeln!
• Ange INTE vikt för föremål med fylld fot (vikten blir irrelevant)
• Kolla ALLTID upp silverstämplar och märken i möjligaste mån

VIKTREGLER FÖR SILVER:
• "Bruttovikt" = vikt inklusive icke-silverdelar (t.ex. knivar med rostfritt blad) — korrekt för blandade föremål
• "Vikt" = vikt för rent silverföremål (gafflar, skedar, etc.) — korrekt för helsilver
• Det är OK att blanda "bruttovikt" och "vikt" i samma post när det speglar materialskillnader
• Om totalvikt redan anges i TITELN — upprepa INTE totalvikten i beskrivningen (undvik dubblering)
• Delvikter per besticktyp i beskrivningen är OK om de finns i källdata

KONDITION FÖR SILVER:
• Nämn ALLTID om silver har gåvogravyr eller monogram`;
    }

    // Detect art/paintings
    const isArt = category.includes('konst') ||
      category.includes('tavl') ||
      category.includes('målning') ||
      category.includes('grafik') ||
      category.includes('litografi') ||
      title.match(/^(oljemålning|akvarell|litografi|grafik|skulptur|teckning|tryck|gouache|pastell)/i) ||
      description.match(/\b(signerad|sign\.|daterad|numrerad|olja på duk|akvarell|blandteknik)\b/i);

    if (isArt) {
      return `
KATEGORI-SPECIFIK REGEL - KONST OCH MÅLNINGAR:
Detta är ett konstverk. Följ Auctionets katalogiseringsregler för konst.

TITELFORMAT FÖR KONST — ELEMENTORDNING:
Titeln ska följa denna ordning (utelämna element som saknas):
1. Verkets titel i citattecken (BARA om konstnären själv namngett verket)
2. Teknik (olja på duk, akvarell, blandteknik, färglitografi, etc.)
3. Antal (om parti: "2 st" — skrivs efter tekniken, INTE efter konstnärsnamn)
4. Signatur/datering (signerad, signerad och daterad -28, etc.)
5. Period (om känd och inte framgår av datering)

EXEMPEL FRÅN AUCTIONET:
• "Enkelbeckasin i höstskog", olja på duk, signerad B.L och daterad -28
• Färglitografier, 2 st, signerade och daterade 76 och numrerade 120/310
• Rådjur, skulptur, brons, otydligt signerad, 18/1900-tal
• "Masque-Paysage II", olja på duk, signerad

VIKTIGA KONSTREGLER:
• Citattecken BARA om konstnären själv gett verket en titel — annars INGA citattecken
• Skriv dateringar och numreringar EXAKT som det står på verket: skilj på 1832, -32 eller 32
• Konstnärens namn skrivs i konstnärsrutan (läggs till automatiskt) — inkludera INTE i titeln

SIGNATUR OCH ATTRIBUTION:
• Skriv "signerad a tergo" om signatur finns på baksidan
• Skriv "Ej sign." i beskrivningen om ett konstverk är osignerat

MÅTT FÖR KONST:
• Format: "45 x 78 cm" — ALLTID höjden först, ALLTID utan ram
• Om inglasad med passpartout — ange bildytans mått
• För grafik: förtydliga om det är bladstorlek eller bildstorlek
• Skriv ALLTID i beskrivningen om konst är oramad

KONDITION FÖR KONST:
• En målning ska ALDRIG ha "bruksslitage" — en målning brukas inte
• Använd istället "sedvanligt slitage" eller "ramslitage"
• Använd "Ej examinerad ur ram" när tillämpligt
• Nämn ALDRIG ramens kondition (om inte ramen är det som säljs)
• Skriv ALLTID om glas saknas eller är skadat i ramar`;
    }

    // Detect dinner sets/tableware
    const isDinnerSet = category.includes('servis') ||
      title.match(/^(mat|kaffe|te|frukost|dock)servis/i) ||
      title.match(/^servisdelar/i) ||
      title.match(/\bdelar\b.*\b(porslin|flintgods|stengods|keramik|fajans)\b/i);

    if (isDinnerSet) {
      return `
KATEGORI-SPECIFIK REGEL - SERVISER OCH SERVISDELAR:
Detta är en servis eller servisdelar. Följ Auctionets katalogiseringsregler.

TITELFORMAT FÖR SERVISER:
• Format: "MAT- OCH KAFFESERVIS, 38 delar, flintgods, rokokostil, Rörstrand, tidigt 1900-tal."
• Ange ALLTID antal delar i titeln
• Typ av servis: MATSERVIS, KAFFESERVIS, DOCKSERVIS, MAT- OCH KAFFESERVIS, FRUKOSTSERVIS, SERVISDELAR

BESKRIVNING FÖR SERVISER:
• Mått behöver INTE anges för serviser
• Räkna ALLTID upp delarna: "34 mattallrikar, 25 djupa tallrikar, såsskål samt tillbringare"
• Enstaka föremål föregås ALDRIG av siffran 1
• Skriv INTE "st" efter antal — skriv bara "34 mattallrikar" INTE "34 st mattallrikar"

KONDITION FÖR SERVISER:
• Var noga med att notera skador och lagningar
• Var så exakt som möjligt`;
    }

    // Detect ceiling lamps (measurements in title)
    const isCeilingLamp = title.match(/^(taklampa|takkrona|ljuskrona|pendel)/i) ||
      category.includes('taklampa') ||
      category.includes('belysning');

    if (isCeilingLamp) {
      return `
KATEGORI-SPECIFIK REGEL - TAKLAMPOR OCH LJUSKRONOR:
Måtten (höjd) ska ALLTID skrivas i titeln för taklampor och ljuskronor (samma regel som mattor).

BESKRIVNING FÖR LJUSKRONOR:
• Ange ALLTID antal LJUS (inte bara antal ljusarmar — en krona kan ha ljushållare i korgbotten)
• Ange material och stil

KONDITION FÖR LJUSKRONOR:
• Notera ALLTID om det saknas prismor
• Notera om det finns skadade prismor`;
    }

    // Detect clocks/ur (not wristwatches — those are handled separately)
    const isClock = (title.match(/^(golvur|väggur|bordsur|kaminur|pendyl|regulat)/i) ||
      category.includes('ur') || category.includes('klocka')) &&
      !title.match(/armbandsur/i);

    if (isClock) {
      return `
KATEGORI-SPECIFIK REGEL - UR (ej armbandsur):
BESKRIVNING FÖR UR:
• Skriv ALLTID ut om det finns pendel och lod till uret
• Ange material och eventuell urtavla/urverkstyp om känt`;
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
    return `Du är en professionell auktionskatalogiserare med djup kunskap om konst, design, möbler, smycken och samlarföremål. Du skriver levande, informativa och professionella katalogtexter som hjälper köpare att förstå och uppskatta föremålet.

DITT UPPDRAG:
• Berika och förbättra katalogtexter — lägg till relevant kontext, historik och detaljer som en erfaren katalogiserare skulle inkludera
• Om du känner igen en designer, period, stil eller teknik — beskriv det naturligt i texten
• Skriv som en kunnig människa, inte som en korrekturläsare — din uppgift är att FÖRBÄTTRA, inte bara rätta
• Texten ska kännas rik och informativ, men aldrig säljande

KVALITETSKRAV:
• Basera allt på verifierbara fakta — uppfinn aldrig information
• Skriv objektivt utan säljande språk
• Använd etablerad auktionsterminologi
• Skriv naturligt och flytande — fokusera på autenticitet över regelefterlevnad

UNDVIK VÄRDEORD OCH SÄLJANDE SPRÅK:
• Undvik: fantastisk, vacker, fin, utsökt, magnifik, underbar, exceptionell, perfekt, sällsynt, extraordinär, spektakulär, enastående, värdefull
• Subjektiva/relativa ord som "fin", "vacker", "värdefull", "stor" ska ALDRIG användas
• Använd istället neutrala, faktabaserade beskrivningar som lyfter föremålets egenskaper

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
Om konstnär-fält tomt: [KONSTNÄR], [Föremål], [Material], [Period] - FÖRSTA ORDET VERSALER
Om konstnär-fält ifyllt: [föremål], [Material], [Period] - FÖRSTA ORDET GEMENER (konstnärens namn läggs till automatiskt)
Titeln ska vara koncis men komplett — ta aldrig bort viktig information (vikt, antal, modellnamn) för att korta ner.

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

PERIOD- OCH ÅLDERSFORMATERING:
• Använd ALDRIG "ca" framför årtal — skriv "omkring" istället ("ca" används BARA för summor/vikter)
• EXEMPEL: "omkring 1850" INTE "ca 1850", men "ca 450 gram" är korrekt
• Använd ALDRIG "1800-talets senare del" — skriv "senare fjärdedel", "senare hälft" eller "slut"
• Var så precis som möjligt med ålder — decennier framför sekel (t.ex. "1870-tal" istället för "1800-talets andra hälft")
• Skriv UT alla fullständiga termer: "nysilver" INTE "NS", "Josef Frank" INTE "Frank"

ANTI-FÖRKORTNING OCH SEO-REGLER:
• UNDVIK alla förkortningar — texten ska vara läsbar för automatisk Google-översättning till internationella budgivare
• Skriv "bland annat" INTE "bl a", "med mera" INTE "mm" (som förkortning), "och så vidare" INTE "osv"
• "cm" och "mm" som måttenheter är OK — "centimeter"/"millimeter" är också acceptabelt (båda godkända)
• Skriv INTE "st" efter antal (utom i titlar där "st" är konventionellt): "34 mattallrikar" INTE "34 st mattallrikar"
• Skriv fullständiga namn: "Josef Frank" INTE "Frank", "nysilver" INTE "NS"
• Syfte: Auctionet använder automatisk Google-översättning — förkortningar kan inte översättas korrekt

SVENSKA SAMMANSÄTTNINGSREGLER:
• "Sterling Silver" ska ALLTID skrivas som ETT ord med gemener: "sterlingsilver" — ALDRIG "Sterling Silver" eller "sterling silver"
• Samma regel gäller alla svenska materialsammansättningar: "rostfritt stål" (två ord), "vitguld" (ett ord), "rödguld" (ett ord)
• Engelska termer ska anpassas till svensk grammatik när det finns etablerad svensk form

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
${itemData.artistDates ? 'Konstnärsdata från Auctionet: ' + itemData.artistDates : ''}
Värdering: ${itemData.estimate} SEK

VIKTIGT FÖR TITEL: ${itemData.artist ?
        'Konstnär/formgivare-fältet är ifyllt (' + itemData.artist + '), så inkludera INTE konstnärens namn i titeln - det läggs till automatiskt av systemet. FÖRSTA ORDET I TITELN SKA VARA PROPER KAPITALISERAT (första bokstaven versal, resten gemener). Resten av titeln ska använda KOMMA (,) som separator och gemener för vanliga substantiv (glas, porslin, trä, etc.). Versaler BARA för egennamn och modellnamn. Exempel: "Vas, glas, Kosta Boda" INTE "Vas. Glas, Kosta Boda".' :
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
        'Konstnär/formgivare: ' + itemData.artist + (itemData.artistDates ? ' (' + itemData.artistDates + ')' : '') + '\nDu SKA lägga till kort, relevant kontext om denna konstnär/formgivare i beskrivningen. Detta är ett KRAV, inte valfritt.\n• Om du vet specifika fakta om konstnären (nationalitet, verksam period, känd för) — skriv 1-2 meningar i beskrivningen\n• Om du vet om den specifika modellen/serien — nämn det\n• Om du är osäker, använd "troligen" eller "anses vara"\n• Det är bättre att ge allmän kontext ("svensk formgivare verksam under 1900-talets andra hälft") än att inte säga något alls' :
        'Lägg inte till konstnärlig eller historisk kontext som inte redan finns i källdata.'}

KRITISKT — FÖDELSE- OCH DÖDSÅR:
• HITTA ALDRIG PÅ födelse- eller dödsår för konstnärer/formgivare
${itemData.artistDates ? '• Auctionets data anger: ' + itemData.artistDates + ' — använd EXAKT dessa årtal om du inkluderar levnadsår' : '• Inga levnadsår finns i systemet — INKLUDERA INTE årtal i parenteser efter konstnärens namn'}
• Om du är osäker på exakta årtal, skriv UTAN årtal: "svensk konstnär" istället för "svensk konstnär (1920–1990)"
• Felaktiga årtal är VÄRRE än inga årtal alls — det förstör trovärdigheten

OSÄKERHETSMARKÖRER I TITEL:
Om titeln innehåller ord som "troligen", "tillskriven", "efter", "stil av", "möjligen", "typ" — behåll dessa. De anger juridisk osäkerhet.

FAKTAKONTROLL:
• Uppfinn inte tidsperioder, material, mått eller skador som inte finns i källdata
• Konstnärsinformation baserad på din kunskap är OK — det är skillnad på att berika med kunskap och att hitta på fakta om föremålet
• Om information saknas — utelämna eller använd osäkerhetsmarkörer

${this.isSpecializedCategory(itemData) ? `
OBS — SPECIALISERAD KATEGORI:
Detta föremål kräver extra omsorg. Se kategori-specifika regler nedan.
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

${this.getCategorySpecificRules(itemData, fieldType)}
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
            'KONSTNÄR KÄND (' + itemData.artist + (itemData.artistDates ? ', ' + itemData.artistDates : '') + '): Lägg till relevant kontext om konstnären/formgivaren i beskrivningen. Nationalitet, verksam period, vad hen är känd för, eller detaljer om denna serie/modell. 1-2 meningar, i en separat paragraf.' + (itemData.artistDates ? ' Använd EXAKT dessa levnadsår: ' + itemData.artistDates + '. HITTA INTE PÅ andra årtal.' : ' INKLUDERA INGA levnadsår — vi har inga bekräftade data.') :
            'Håll dig till befintlig information utan att lägga till konstnärlig kontext.'}

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
            '• Konstnär/formgivare-fältet är ifyllt:\n• FÖRSTA ORDET SKA VARA PROPER KAPITALISERAT (första bokstaven versal) följt av KOMMA (,)\n• Alla vanliga substantiv ska ha LITEN BOKSTAV (glas, porslin, trä, olja, etc.)\n• VERSALER bara för egennamn/modellnamn (Kosta Boda, IKEA, "Ladoga")\n• Exempel: "Vas, glas, Kosta Boda" (visas som "ULRICA HYDMAN-VALLIEN. Vas, glas, Kosta Boda")\n• Exempel: "Stolar, 6 st, modell 66, Artek"\n• FÖRBJUDET: "Vas. Glas," (punkt + versal) eller "STOLAR" (helversaler)\n• KORREKT: "Vas, glas," (komma + gemen)' :
            '• Konstnär/formgivare-fältet är tomt:\n• FÖRSTA ORDET SKA VARA VERSALER (uppercase) följt av KOMMA (,)\n• Nästa ord efter komma ska ha liten bokstav (utom namn/märken)\n• Exempel: "BAJONETT, Eskilstuna, 1900-tal"\n• KORREKT: "BORDSLAMPOR, 2 st, Kosta Boda"'}

SPECIAL REGEL - KONSTNÄR I MITTEN/SLUTET AV TITEL:
• Om konstnärsnamn finns i MITTEN eller SLUTET av nuvarande titel (inte först) - BEHÅLL det där
• Detta gäller när OBJEKTET är huvudsaken, inte konstnären  
• Korrigera stavfel i konstnärsnamnet men behåll exakt position
• FÖRSTA ORDET ska vara VERSALER (objektnamnet är huvudsaken)
• EXEMPEL: "SERVISDELAR, 24 delar, porslin, Stig Lindberg, 'Spisa Ribb', Gustavsberg. 1900-tal."
• Flytta ALDRIG konstnären när den inte är i början - det är medvetet placerad

FÖRBJUDNA SAMMANSATTA ORD I TITEL:
• Använd ALDRIG sammansatta objektord+material i titeln
• Separera ALLTID objekttyp och material med komma
• EXEMPEL: "MAJOLIKAVAS" → "VAS, majolika"; "GLASVAS" → "VAS, glas"
• EXEMPEL: "KERAMIKTOMTE" → "TOMTE, keramik"; "SILVERRING" → "RING, silver"
• KORREKT: "VAS, glas, Orrefors" INTE "GLASVAS, Orrefors"

=== BESKRIVNING-SPECIFIKA REGLER (SAMMA SOM INDIVIDUELL BESKRIVNING-FÖRBÄTTRING) ===

FÄLTAVGRÄNSNING FÖR BESKRIVNING:
• Inkludera ALDRIG konditionsinformation i beskrivningen
• Konditionsdetaljer som "slitage", "repor", "märken", "skador", "nagg", "sprickor", "fläckar" hör ENDAST hemma i konditionsfältet
• Beskrivningen ska fokusera på: material, teknik, mått, stil, ursprung, märkningar, funktion
• EXEMPEL PÅ FÖRBJUDET I BESKRIVNING: "Slitage förekommer", "repor och märken", "normalt åldersslitage", "mindre skador"
• KRITISKT: BEHÅLL ALLTID MÅTT OCH TEKNISKA SPECIFIKATIONER - dessa är INTE konditionsinformation
• BEHÅLL: "höjd 15,5 cm", "4 snapsglas", "2 vinglas", "består av", "bestående av" - detta är beskrivande information
• TA ENDAST BORT konditionsord som "slitage", "repor", "skador" - ALDRIG mått eller kvantiteter

BEVARA LISTFORMAT I BESKRIVNING — KRITISKT:
• Om originalbeskrivningen har en rad per del/föremål med mått — BEHÅLL radbrytningarna
• Slå INTE ihop listor till en enda kommaseparerad mening — det förstör läsbarheten
• Du FÅR förbättra språket på varje rad men BEHÅLL strukturen med en rad per post
• EXEMPEL KORREKT (bevarat listformat):
  "8 kaffekoppar, höjd 6,5 cm.\n7 fat, diameter 16 cm.\n8 moccakoppar, höjd 7 cm."
• EXEMPEL FEL (ihopslaget):
  "Bestående av 8 kaffekoppar höjd 6,5 cm, 7 fat diameter 16 cm, 8 moccakoppar höjd 7 cm."

VIKTIGT - PARAGRAFSTRUKTUR FÖR BESKRIVNING:
${itemData.artist && this.enableArtistInfo ?
            '• STRUKTUR: Befintlig förbättrad beskrivning först, sedan konstnärsinformation i SEPARAT paragraf (\\n\\n)\n• EXEMPEL MED LEVNADSÅR (när data finns): "Blandteknik på papper, signerad.\\n\\nRuth Schloss (1922–2013) var en israelisk konstnär känd för sina socialrealistiska figurstudier.\\n\\nMotivyta 22,5 x 17,5 cm, rammått 46 x 41 cm."\n• EXEMPEL UTAN LEVNADSÅR (när data saknas): "Olja på duk, signerad.\\n\\nSvensk konstnär känd för sina expressiva landskapsmålningar.\\n\\n66 x 80 cm."\n• Inkludera levnadsår BARA om de finns i konstnärsdata ovan — HITTA ALDRIG PÅ årtal\n• Mått i sista paragrafen' :
            '• Returnera befintlig förbättrad beskrivning utan tillagd konstnärlig kontext'}
• Lägg inte till mått som inte är angivna
• Lägg INTE till material som inte är nämnt (såvida det inte är känt från konstnärens typiska tekniker)
• Lägg INTE till märkningar eller signaturer som inte finns
• Förbättra språk, struktur och befintlig information
• Lägg ALDRIG till kommentarer om vad som "saknas" eller "behövs"

PROVENIENS, UTSTÄLLNINGAR, LITTERATUR:
• Om sådan information finns — skriv den SIST i beskrivningen men FÖRE måtten
• Ordning: Beskrivning → Proveniens/Utställningar/Litteratur → Mått (sist)

MÅTTFORMATERING I BESKRIVNING:
• Mått placeras ALLTID SIST i beskrivningen (undantag: taklampor och mattor)
• Mått ska ALLTID stå i en EGEN paragraf — separera med dubbel radbrytning (\n\n) före måtten
• KRITISKT: Denna regel gäller ALLA kategorier — möbler, konst, kameror, keramik, glas, allt!
• Format för möbler: "Längd 84 cm, bredd 47 cm, höjd 92 cm" (cm efter VARJE mått)
• Format för runda/cylindriska: "Diameter 69 cm, höjd 36 cm"
• Format för konst: "45 x 78 cm" — ALLTID höjden först, ALLTID utan ram
• Små föremål: ett mått räcker (höjd eller diameter)
• Ringar: ange BARA ringstorlek, inga mått
• Grafik: förtydliga om det är bladstorlek eller bildstorlek
• "cm" och "mm" som måttenheter är OK — "centimeter"/"millimeter" är också acceptabelt
• Undvik svenska förkortningar som "bl a", "osv", "mm" (med mera) — skriv ut dem för översättning
• EXEMPEL — Kamera: "Canon AV-1, nummer 321063. Canon Zoom lens FD 35-70 mm.\n\nHusets längd 14 cm."

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
• Om originalet säger ENBART "bruksslitage" — BEHÅLL det EXAKT som det är. Ändra INTE till "normalt bruksslitage". Systemet har separata tips som hjälper användaren välja en bättre term.
• Om originalet har "bruksslitage" TILLSAMMANS med specifika skador (t.ex. "Bruksslitage, repor") — behåll allt och förbättra bara språket

KRITISKT — ERSÄTT ALDRIG SPECIFIKA TERMER MED VAGARE:
• Om originalet redan har en specifik konditionsterm (t.ex. "smärre slitage", "ytliga repor", "mindre nagg") — BEHÅLL den
• Byt ALDRIG ut en specifik term mot en vagare (t.ex. "smärre slitage" → "normalt bruksslitage" är FÖRBJUDET)
• Du får förbättra språket men ALDRIG sänka specificiteten
• EXEMPEL: "Smärre slitage" → BEHÅLL som "Smärre slitage." — INTE "Normalt bruksslitage."

STRIKT REGEL: Kopiera ENDAST den skadeinformation som redan finns - lägg ALDRIG till nya detaljer.

AUCTIONET FAQ-SPECIFIKA KONDITIONSREGLER:
• Målningar och konst: Använd "Ej examinerad ur ram" om tillämpligt (standardfras för inramad konst)
• Målningar: Använd ALDRIG "bruksslitage" — en målning brukas inte. Använd "sedvanligt slitage" istället
• Ramar: Kommentera ALDRIG ramens kondition (om inte ramen är det som säljs). Nämn ALLTID saknat/skadat glas i ramar
• Böcker/samlingar: Använd "Ej genomgånget" om alla delar inte kontrollerats individuellt
• UNDVIK "Ej funktionstestad" — denna fras ger intryck att vi testar funktion, vilket vi inte gör
• UNDVIK svenska förkortningar i kondition: skriv "bland annat" INTE "bl a", "med mera" INTE "mm", "och så vidare" INTE "osv" — måttenheter som "mm" och "cm" är dock OK
• Silver/guld: Nämn ALLTID gåvogravyr/monogram i kondition om det finns

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
            '• Konstnär/formgivare-fältet är ifyllt - FÖRSTA ORDET SKA VARA PROPER KAPITALISERAT (första bokstaven versal) följt av KOMMA (,)\n• Vanliga substantiv efter komma: LITEN BOKSTAV (glas, porslin, olja, etc.)\n• Exempel: "Stolar, 6 st, modell 66, Artek" (visas som "ALVAR AALTO. Stolar, 6 st, modell 66, Artek")\n• FÖRBJUDET: punkt efter första ordet ("Stolar. 6 st") — använd KOMMA' :
            '• Konstnär/formgivare-fältet är tomt - FÖRSTA ORDET I TITEL SKA VARA VERSALER (uppercase)'}

Returnera i detta format (BESKRIVNING får ha flera paragrafer med tomma rader emellan):
TITEL: [förbättrad titel — en enda rad]
BESKRIVNING: [förbättrad beskrivning — använd tomma rader mellan huvudinnehåll, konstnärsinformation och mått]
KONDITION: [förbättrad konditionsrapport — en enda rad]
SÖKORD: [kompletterande sökord baserade på FÖRBÄTTRADE fält ovan, separerade med mellanslag, använd "-" för flerordsfraser — en enda rad]

VIKTIGT FÖR SÖKORD: Använd Auctionets format med mellanslag mellan sökord och "-" för flerordsfraser.
EXEMPEL: "konstglas mundblåst svensk-design 1960-tal samlarobjekt"

Använd INTE markdown formatering eller extra tecken som ** eller ***. Skriv bara ren text.`;

      case 'title':
        return baseInfo + `
UPPGIFT: Förbättra endast titeln enligt svenska auktionsstandarder. Titeln ska vara koncis men komplett — ta aldrig bort viktig information (vikt, antal, modellnamn). Skriv naturligt och flytande.

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
            '• Konstnär/formgivare-fältet är ifyllt:\n• FÖRSTA ORDET SKA VARA PROPER KAPITALISERAT (första bokstaven versal) följt av KOMMA (,)\n• Alla vanliga substantiv ska ha LITEN BOKSTAV (glas, porslin, trä, olja, etc.)\n• VERSALER bara för egennamn/modellnamn (Kosta Boda, IKEA, "Ladoga")\n• Exempel: "Vas, glas, Kosta Boda" (visas som "ULRICA HYDMAN-VALLIEN. Vas, glas, Kosta Boda")\n• FÖRBJUDET: "Vas. Glas," (punkt + versal) eller "STOLAR" (helversaler)\n• KORREKT: "Vas, glas," (komma + gemen)' :
            '• Konstnär/formgivare-fältet är tomt:\\n• FÖRSTA ORDET SKA VARA VERSALER (uppercase) följt av KOMMA (,)\\n• Nästa ord efter komma ska ha liten bokstav (utom namn/märken)\\n• Exempel: "BAJONETT, Eskilstuna, 1900-tal"\\n• KORREKT: "BORDSLAMPOR, 2 st, Kosta Boda"'}

SPECIAL REGEL - KONSTNÄR I MITTEN/SLUTET AV TITEL:
• Om konstnärsnamn finns i MITTEN eller SLUTET av nuvarande titel (inte först) - BEHÅLL det där
• Detta gäller när OBJEKTET är huvudsaken, inte konstnären  
• Korrigera stavfel i konstnärsnamnet men behåll exakt position
• FÖRSTA ORDET ska vara VERSALER (objektnamnet är huvudsaken)
• EXEMPEL: "SERVISDELAR, 24 delar, porslin, Stig Lindberg, 'Spisa Ribb', Gustavsberg. 1900-tal."
• Flytta ALDRIG konstnären när den inte är i början - det är medvetet placerad

FÖRBJUDNA SAMMANSATTA ORD I TITEL:
• Använd ALDRIG sammansatta objektord+material i titeln
• Separera ALLTID objekttyp och material med komma
• EXEMPEL: "MAJOLIKAVAS" → "VAS, majolika"; "GLASVAS" → "VAS, glas"
• EXEMPEL: "KERAMIKTOMTE" → "TOMTE, keramik"; "SILVERRING" → "RING, silver"
• KORREKT: "VAS, glas, Orrefors" INTE "GLASVAS, Orrefors"

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

BEVARA LISTFORMAT I BESKRIVNING — KRITISKT:
• Om originalbeskrivningen har en rad per del/föremål med mått — BEHÅLL radbrytningarna
• Slå INTE ihop listor till en enda kommaseparerad mening — det förstör läsbarheten
• Du FÅR förbättra språket på varje rad men BEHÅLL strukturen med en rad per post
• EXEMPEL KORREKT (bevarat listformat):
  "8 kaffekoppar, höjd 6,5 cm.\n7 fat, diameter 16 cm.\n8 moccakoppar, höjd 7 cm."
• EXEMPEL FEL (ihopslaget):
  "Bestående av 8 kaffekoppar höjd 6,5 cm, 7 fat diameter 16 cm, 8 moccakoppar höjd 7 cm."

VIKTIGT - PARAGRAFSTRUKTUR:
${itemData.artist && this.enableArtistInfo ?
            '• STRUKTUR: Befintlig beskrivning först, sedan ny konstnärsinformation i SEPARAT paragraf\n• FORMAT: Använd dubbla radbrytningar (\\n\\n) för att separera paragrafer\n• EXEMPEL: "Befintlig förbättrad beskrivning här...\\n\\nKort konstnärskontext här..."\n• Lägg till KORT, SPECIFIK kontext om denna modell/serie i SEPARAT paragraf\n• Max 1-2 meningar extra - fokusera på tillverkningsår och karakteristiska drag\n• Inkludera levnadsår BARA om de finns i konstnärsdata — HITTA ALDRIG PÅ årtal\n• Håll det relevant för just detta föremål' :
            '• Returnera befintlig förbättrad beskrivning\n• Lägg INTE till konstnärlig eller historisk kontext som inte finns i källdata'}
• Lägg INTE till mått som inte är angivna
• Lägg INTE till material som inte är nämnt (såvida det inte är känt från konstnärens typiska tekniker)
• Lägg INTE till märkningar eller signaturer som inte finns
• Förbättra språk, struktur och befintlig information
• Lägg ALDRIG till kommentarer om vad som "saknas" eller "behövs"

PROVENIENS, UTSTÄLLNINGAR, LITTERATUR:
• Om sådan information finns — skriv den SIST i beskrivningen men FÖRE måtten
• Ordning: Beskrivning → Proveniens/Utställningar/Litteratur → Mått (sist)

MÅTTFORMATERING I BESKRIVNING:
• Mått placeras ALLTID SIST i beskrivningen (undantag: taklampor och mattor)
• Mått ska ALLTID stå i en EGEN paragraf — separera med dubbel radbrytning (\n\n) före måtten
• KRITISKT: Denna regel gäller ALLA kategorier — möbler, konst, kameror, keramik, glas, allt!
• Format för möbler: "Längd 84 cm, bredd 47 cm, höjd 92 cm" (cm efter VARJE mått)
• Format för runda/cylindriska: "Diameter 69 cm, höjd 36 cm"
• Format för konst: "45 x 78 cm" — ALLTID höjden först, ALLTID utan ram
• Små föremål: ett mått räcker (höjd eller diameter)
• Ringar: ange BARA ringstorlek, inga mått
• Grafik: förtydliga om det är bladstorlek eller bildstorlek
• "cm" och "mm" som måttenheter är OK — "centimeter"/"millimeter" är också acceptabelt
• Undvik svenska förkortningar som "bl a", "osv", "mm" (med mera) — skriv ut dem för översättning
• EXEMPEL — Kamera: "Canon AV-1, nummer 321063. Canon Zoom lens FD 35-70 mm.\n\nHusets längd 14 cm."

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
• Om originalet säger ENBART "bruksslitage" — BEHÅLL det EXAKT som det är. Ändra INTE till "normalt bruksslitage". Systemet har separata tips som hjälper användaren välja en bättre term.
• Om originalet har "bruksslitage" TILLSAMMANS med specifika skador (t.ex. "Bruksslitage, repor") — behåll allt och förbättra bara språket

KRITISKT — ERSÄTT ALDRIG SPECIFIKA TERMER MED VAGARE:
• Om originalet redan har en specifik konditionsterm (t.ex. "smärre slitage", "ytliga repor", "mindre nagg") — BEHÅLL den
• Byt ALDRIG ut en specifik term mot en vagare (t.ex. "smärre slitage" → "normalt bruksslitage" är FÖRBJUDET)
• Du får förbättra språket men ALDRIG sänka specificiteten
• EXEMPEL: "Smärre slitage" → BEHÅLL som "Smärre slitage." — INTE "Normalt bruksslitage."

STRIKT REGEL: Kopiera ENDAST den skadeinformation som redan finns - lägg ALDRIG till nya detaljer.

AUCTIONET FAQ-SPECIFIKA KONDITIONSREGLER:
• Målningar och konst: Använd "Ej examinerad ur ram" om tillämpligt (standardfras för inramad konst)
• Målningar: Använd ALDRIG "bruksslitage" — en målning brukas inte. Använd "sedvanligt slitage" istället
• Ramar: Kommentera ALDRIG ramens kondition (om inte ramen är det som säljs). Nämn ALLTID saknat/skadat glas i ramar
• Böcker/samlingar: Använd "Ej genomgånget" om alla delar inte kontrollerats individuellt
• UNDVIK "Ej funktionstestad" — denna fras ger intryck att vi testar funktion, vilket vi inte gör
• UNDVIK svenska förkortningar i kondition: skriv "bland annat" INTE "bl a", "med mera" INTE "mm", "och så vidare" INTE "osv" — måttenheter som "mm" och "cm" är dock OK
• Silver/guld: Nämn ALLTID gåvogravyr/monogram i kondition om det finns

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

      case 'all-enhanced':
        return baseInfo + `
YTTERLIGARE INFORMATION FRÅN ANVÄNDAREN:
Material: ${itemData.additionalInfo?.material || 'Ej angivet'}
Teknik: ${itemData.additionalInfo?.technique || 'Ej angivet'}
Märkningar: ${itemData.additionalInfo?.markings || 'Ej angivet'}
Specifika skador: ${itemData.additionalInfo?.damage || 'Ej angivet'}
Övrigt: ${itemData.additionalInfo?.additional || 'Ej angivet'}

UPPGIFT: Använd all tillgänglig information för att skapa professionell katalogisering enligt svenska auktionsstandarder.

ANTI-HALLUCINATION REGLER:
• Använd ENDAST den information som angivits ovan
• Lägg INTE till ytterligare detaljer som inte är nämnda
• Kombinera källdata med tilläggsinfo på ett faktabaserat sätt
• Lägg ALDRIG till kommentarer om vad som "behövs" eller "saknas"

Returnera i detta format (BESKRIVNING får ha flera paragrafer med tomma rader emellan):
TITEL: [förbättrad titel — en enda rad]
BESKRIVNING: [detaljerad beskrivning — använd tomma rader mellan huvudinnehåll, konstnärsinformation och mått]
KONDITION: [specifik konditionsrapport — en enda rad]
SÖKORD: [kompletterande sökord separerade med mellanslag, använd "-" för flerordsfraser — en enda rad]

Använd INTE markdown formatering eller extra tecken som ** eller ***. Skriv bara ren text.`;

      case 'biography':
        return `
UPPGIFT: Skriv en kort, informativ biografi om konstnären "${itemData.artist}" på svenska.
${itemData.artistDates ? 'Bekräftade levnadsdata från Auctionet: ' + itemData.artistDates : ''}

KRAV:
• Max 150 ord
• Fokusera på stil, period, viktiga verk och betydelse
• Skriv på professionell svenska
• Inga inledande fraser som "Här är en biografi..."
• Bara ren text
${itemData.artistDates ? '• Använd EXAKT dessa levnadsår: ' + itemData.artistDates : '• INKLUDERA INGA födelse- eller dödsår — vi har inga bekräftade data'}
• HITTA ALDRIG PÅ årtal — felaktiga år förstör trovärdigheten

FORMAT:
Returnera endast biografin som ren text.
`;

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

    // No hard character limit — Auctionet has no title length restriction
    // Titles should be concise but complete

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
      'fantastisk', 'vacker', 'fin', 'underbar', 'magnifik', 'exceptional', 'stunning',
      'rare', 'unique', 'sällsynt', 'unik', 'perfekt', 'pristine', 'värdefull'
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
        this.auctionetAPI.analyzeComparableSales(artistName, objectType, period, technique, currentValuation, this.searchQuerySSoT, this._currentItemData),
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
            statistics: historicalResult.statistics, // Pass through statistics (median, min, max, etc.)
            aiValidated: historicalResult.aiValidated || false, // AI validation flag
            aiFilteredCount: historicalResult.aiFilteredCount || null, // How many items AI kept
            aiOriginalCount: historicalResult.aiOriginalCount || null, // How many items before AI filter
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

        // Fallback to Claude analysis if no Auctionet data found
        return await this.analyzeComparableSalesWithClaude(artistName, objectType, period, technique, description);
      }

    } catch (error) {
      console.error('Market analysis error, falling back to Claude:', error);

      // Fallback to Claude analysis on error
      return await this.analyzeComparableSalesWithClaude(artistName, objectType, period, technique, description);
    }
  }

  // NEW: Enhanced sales analysis that accepts search context for artist, brand, and freetext searches
  // COST OPTIMIZATION: localStorage cache for revisits (1 hour expiry)
  async analyzeSales(searchContext, itemData = null) {

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

    // COST OPTIMIZATION: Check localStorage cache for this search query
    const cacheKey = `market_analysis_${btoa(unescape(encodeURIComponent(primarySearch || '')))}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        const ONE_HOUR = 60 * 60 * 1000;
        if (Date.now() - timestamp < ONE_HOUR) {
          return data;
        }
        localStorage.removeItem(cacheKey); // Expired
      }
    } catch { /* ignore cache errors */ }

    // Store item context for AI validation of results
    this._currentItemData = itemData;

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

      // COST OPTIMIZATION: Cache successful results in localStorage
      if (analysisResult && analysisResult.hasComparableData) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify({
            data: analysisResult,
            timestamp: Date.now()
          }));
        } catch { /* localStorage full or unavailable — no big deal */ }
      }

      return analysisResult;

    } catch (error) {
      console.error('Market analysis failed:', error);
      throw error;
    }
  }

  // NEW: Generate combined insights from historical and live data
  generateCombinedInsights(historicalResult, liveResult, currentValuation = null) {
    const insights = [];

    if (historicalResult && liveResult) {
      const marketActivity = liveResult.marketActivity;
      const reserveMetPercentage = marketActivity ? marketActivity.reservesMetPercentage : null;
      const analyzedLiveItems = liveResult.analyzedLiveItems || 0;
      const totalBids = marketActivity ? marketActivity.totalBids : 0;
      const averageBidsPerItem = marketActivity ? marketActivity.averageBidsPerItem : 0;

      const hasReliableMarketData = analyzedLiveItems >= 4;
      const isWeakMarket = hasReliableMarketData && reserveMetPercentage !== null && reserveMetPercentage < 40;
      const isStrongMarket = hasReliableMarketData && reserveMetPercentage !== null && reserveMetPercentage > 70;

      // Plain-text market activity summary (no HTML)
      function getMarketSummary() {
        if (totalBids === 0) {
          return `inga bud på ${analyzedLiveItems} pågående auktioner`;
        } else if (reserveMetPercentage === 0) {
          return `bud finns men inget utrop nås (${analyzedLiveItems} auktioner, snitt ${Math.round(averageBidsPerItem * 10) / 10} bud/st)`;
        } else {
          return `${reserveMetPercentage}% av utrop nås (${analyzedLiveItems} pågående auktioner)`;
        }
      }

      if (!historicalResult.priceRange || !historicalResult.priceRange.low || !historicalResult.priceRange.high) {
        return insights;
      }

      const histAvg = (historicalResult.priceRange.low + historicalResult.priceRange.high) / 2;
      const liveAvg = liveResult.currentEstimates ?
        (liveResult.currentEstimates.low + liveResult.currentEstimates.high) / 2 : null;

      if (liveAvg && currentValuation) {
        const priceDiff = ((liveAvg - histAvg) / histAvg) * 100;
        const catalogerVsHist = ((currentValuation - histAvg) / histAvg) * 100;
        const catalogerVsLive = ((currentValuation - liveAvg) / liveAvg) * 100;

        if (Math.abs(priceDiff) > 15) {
          let summary = '';
          let detail = '';
          let significance = 'medium';
          let type = 'price_comparison';

          if (isWeakMarket) {
            if (catalogerVsHist > 50) {
              summary = `Ditt utrop +${Math.round(catalogerVsHist)}% över historik i svag marknad`;
              detail = `Din värdering ligger ${Math.round(catalogerVsHist)}% över historiska slutpriser. Marknaden är svag: ${getMarketSummary()}. Rekommendation: Sänk utropet för att undvika att objektet inte säljs.`;
              significance = 'high';
              type = 'conflict';
            } else if (priceDiff > 30) {
              summary = `Höga utrop men svag efterfrågan`;
              detail = `Pågående auktioner värderas ${Math.round(priceDiff)}% högre än historiska slutpriser, men marknaden är svag: ${getMarketSummary()}. Rekommendation: Sätt utropet konservativt — höga startpriser i svag marknad ger ofta osålda objekt.`;
              significance = 'high';
              type = 'conflict';
            } else if (catalogerVsLive > 20) {
              summary = `Ditt utrop över marknadsnivå i svag marknad`;
              detail = `Din värdering överstiger pågående auktioners nivå. Marknaden är svag: ${getMarketSummary()}. Rekommendation: Överväg att sänka utropet.`;
              significance = 'medium';
              type = 'market_weakness';
            }
          } else if (isStrongMarket) {
            if (catalogerVsHist < -20 && priceDiff > 30) {
              summary = `Stark marknad — ditt utrop kan vara för lågt`;
              detail = `Marknaden är stark: ${getMarketSummary()}. Pågående auktioner värderas ${Math.round(priceDiff)}% högre än historiska slutpriser, medan ditt utrop ligger ${Math.abs(Math.round(catalogerVsHist))}% under historik. Rekommendation: Överväg att höja utropet.`;
              significance = 'medium';
              type = 'market_strength';
            } else if (catalogerVsHist > 100) {
              summary = `Ditt utrop +${Math.round(catalogerVsHist)}% över historik`;
              detail = `Trots stark marknad (${getMarketSummary()}) ligger din värdering ${Math.round(catalogerVsHist)}% över historiska slutpriser. Rekommendation: Överväg att sänka — även stark marknad har gränser.`;
              significance = 'medium';
              type = 'price_comparison';
            } else if (priceDiff > 50) {
              summary = `Stark marknad — gynnsamt läge`;
              detail = `Marknaden är stark: ${getMarketSummary()}. Pågående auktioner värderas ${Math.round(priceDiff)}% högre än historiska slutpriser. Gynnsam marknad för försäljning.`;
              significance = 'medium';
              type = 'market_strength';
            }
          } else {
            // Normal market
            if (catalogerVsHist > 100) {
              if (priceDiff > 30) {
                summary = `Ditt utrop +${Math.round(catalogerVsHist)}% över historik`;
                detail = `Pågående auktioner värderas ${Math.round(priceDiff)}% över historiska slutpriser, men ditt utrop ligger hela ${Math.round(catalogerVsHist)}% över. Rekommendation: Sänk utropet närmare marknadsnivå.`;
                significance = 'high';
              } else {
                summary = `Ditt utrop +${Math.round(catalogerVsHist)}% över historik`;
                detail = `Din värdering ligger ${Math.round(catalogerVsHist)}% över historiska slutpriser. Pågående auktioner ligger närmare historiska nivåer. Rekommendation: Sänk utropet.`;
                significance = 'high';
              }
            } else if (catalogerVsHist > 50) {
              if (priceDiff > 50) {
                summary = `Stigande marknad — nuvarande utrop rimligt`;
                detail = `Pågående auktioner värderas ${Math.round(priceDiff)}% högre än historiska slutpriser. Marknaden kan vara starkare nu. Ditt utrop ligger ${Math.round(catalogerVsHist)}% över historik men i linje med trend.`;
                significance = 'medium';
              } else {
                summary = `Ditt utrop något högt — var försiktig`;
                detail = `Både pågående auktioner och din värdering ligger över historiska slutpriser. Rekommendation: Överväg försiktigare prissättning, marknaden stödjer inte fullt ut en kraftig höjning.`;
                significance = 'medium';
              }
            } else if (catalogerVsHist < -20) {
              if (priceDiff > 30) {
                summary = `Ditt utrop kan vara lågt — starkare marknad`;
                detail = `Pågående auktioner värderas ${Math.round(priceDiff)}% högre än historiska slutpriser, medan ditt utrop ligger ${Math.abs(Math.round(catalogerVsHist))}% under historik. Rekommendation: Överväg att höja utropet.`;
                significance = 'medium';
              }
            } else {
              if (priceDiff > 50) {
                summary = `Starkare marknad just nu`;
                detail = `Pågående auktioner värderas ${Math.round(priceDiff)}% högre än historiska slutpriser. Marknaden verkar vara på uppgång för liknande objekt.`;
                significance = 'medium';
              } else if (priceDiff < -30) {
                summary = `Svagare marknad just nu`;
                detail = `Pågående auktioner värderas ${Math.abs(Math.round(priceDiff))}% lägre än historiska slutpriser. Marknaden verkar vara svagare just nu. Rekommendation: Överväg försiktigare prissättning.`;
                significance = 'medium';
              }
            }
          }

          if (summary) {
            insights.push({ type, summary, detail, significance });
          }
        }
      } else if (liveAvg && !currentValuation) {
        // No current valuation — general market comparison
        const priceDiff = ((liveAvg - histAvg) / histAvg) * 100;
        if (Math.abs(priceDiff) > 15) {
          let summary = '';
          let detail = '';
          let significance = Math.abs(priceDiff) > 30 ? 'high' : 'medium';
          let type = 'price_comparison';

          if (isWeakMarket && priceDiff > 15) {
            summary = `Höga utrop men svag efterfrågan`;
            detail = `Pågående auktioner värderas ${Math.round(priceDiff)}% högre än historiska slutpriser, men marknaden är svag: ${getMarketSummary()}. Höga startpriser möter låg efterfrågan. Rekommendation: Sätt utropet konservativt.`;
            significance = 'high';
            type = 'conflict';
          } else if (!hasReliableMarketData && reserveMetPercentage !== null && reserveMetPercentage < 40 && priceDiff > 15) {
            summary = `Svaga marknadssignaler — var försiktig`;
            detail = `Pågående auktioner värderas ${Math.round(priceDiff)}% högre än historiska slutpriser. Marknadssignalerna är svaga: ${getMarketSummary()}. Begränsat dataunderlag — tolka med försiktighet.`;
            significance = 'high';
            type = 'conflict';
          } else if (isStrongMarket && priceDiff > 15) {
            summary = `Stark marknad — gynnsamt läge`;
            detail = `Marknaden är stark: ${getMarketSummary()}. Pågående auktioner värderas ${Math.round(priceDiff)}% högre än historiska slutpriser. Gynnsam tid för försäljning.`;
            significance = 'medium';
            type = 'market_strength';
          } else {
            if (priceDiff > 30) {
              summary = `Starkare marknad just nu (+${Math.round(priceDiff)}%)`;
              detail = `Pågående auktioner värderas ${Math.round(priceDiff)}% högre än historiska slutpriser. Marknaden verkar vara starkare just nu för liknande objekt.`;
            } else if (priceDiff > 15) {
              summary = `Något starkare marknad (+${Math.round(priceDiff)}%)`;
              detail = `Pågående auktioner värderas ${Math.round(priceDiff)}% högre än historiska slutpriser. Marknaden verkar vara något starkare just nu.`;
            } else if (priceDiff < -30) {
              summary = `Svagare marknad just nu (${Math.round(priceDiff)}%)`;
              detail = `Pågående auktioner värderas ${Math.abs(Math.round(priceDiff))}% lägre än historiska slutpriser. Marknaden verkar vara svagare just nu. Rekommendation: Var försiktig med prissättningen.`;
            } else if (priceDiff < -15) {
              summary = `Något svagare marknad (${Math.round(priceDiff)}%)`;
              detail = `Pågående auktioner värderas ${Math.abs(Math.round(priceDiff))}% lägre än historiska slutpriser. Marknaden verkar vara något svagare just nu.`;
            }
          }

          if (summary) {
            insights.push({ type, summary, detail, significance });
          }
        }
      }

      // Market activity insights — only if not already covered above
      const alreadyCovered = insights.length > 0;
      if (marketActivity && hasReliableMarketData && !alreadyCovered) {
        if (reserveMetPercentage > 70) {
          insights.push({
            type: 'market_strength',
            summary: `Stark marknad — ${reserveMetPercentage}% når utrop`,
            detail: `${getMarketSummary()}. Hög andel auktioner når sina utropspriser, vilket tyder på stark efterfrågan. Gynnsam försäljningsmiljö.`,
            significance: 'high'
          });
        } else if (reserveMetPercentage < 30) {
          insights.push({
            type: 'market_weakness',
            summary: totalBids === 0 ? `Svag marknad — inga bud` : `Svag marknad — ${reserveMetPercentage}% når utrop`,
            detail: `${getMarketSummary()}. Låg andel auktioner når sina utropspriser. Rekommendation: Sätt utropet konservativt för att locka budgivare.`,
            significance: totalBids === 0 ? 'high' : 'medium'
          });
        }
      } else if (marketActivity && !hasReliableMarketData && analyzedLiveItems > 0 && !alreadyCovered) {
        insights.push({
          type: 'market_info',
          summary: `Begränsad data (${analyzedLiveItems} auktioner)`,
          detail: `Endast ${analyzedLiveItems} pågående auktioner hittades — för få för en pålitlig marknadsanalys. ${totalBids === 0 ? 'Inga bud har lagts ännu.' : `${getMarketSummary()}.`} Använd som vägledning, inte som beslutsunderlag.`,
          significance: totalBids === 0 ? 'medium' : 'low'
        });
      }
    }

    // ALWAYS generate at least one insight when we have historical data
    // This ensures the MARKNADSTREND section (and KB card hover target) always appears
    if (insights.length === 0 && historicalResult && historicalResult.priceRange) {
      const histAvg = (historicalResult.priceRange.low + historicalResult.priceRange.high) / 2;
      const confidence = historicalResult.confidence || 0;
      const sampleSize = historicalResult.analyzedSales || 0;
      
      if (confidence > 0.7 && sampleSize >= 10) {
        insights.push({
          type: 'market_info',
          summary: `Stabil marknad — god datakvalitet`,
          detail: `${sampleSize} historiska försäljningar analyserade med ${Math.round(confidence * 100)}% konfidensgrad. Prisintervall ${Math.round(historicalResult.priceRange.low)}–${Math.round(historicalResult.priceRange.high)} SEK. Marknaden verkar stabil för liknande objekt.`,
          significance: 'low'
        });
      } else if (sampleSize >= 3) {
        insights.push({
          type: 'market_info',
          summary: `Marknadsdata tillgänglig (${sampleSize} försäljningar)`,
          detail: `${sampleSize} historiska försäljningar analyserade. Prisintervall ${Math.round(historicalResult.priceRange.low)}–${Math.round(historicalResult.priceRange.high)} SEK.`,
          significance: 'low'
        });
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


      // Use Chrome runtime messaging instead of direct fetch
      const response = await new Promise((resolve, reject) => {

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

          if (chrome.runtime.lastError) {
            console.error('Chrome runtime error:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.success) {
            resolve(response);
          } else {
            console.error('Chrome runtime failed:', response);
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
          salesData = this.fallbackParseSalesData(content);
        }

        if (salesData && salesData.hasComparableData) {
          // Mark as AI estimate
          salesData.dataSource = 'claude_ai_estimate';
          return salesData;
        } else {
          return null;
        }
      } else {
        console.error('Invalid Claude comparable sales response structure:', response);
        return null;
      }
    } catch (error) {
      console.error('Error in Claude comparable sales analysis:', error);
      console.error('Error stack:', error.stack);
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
        console.error('AI Manager: Failed to parse JSON:', parseError);
        throw new Error('Invalid JSON in AI response');
      }

    } catch (error) {
      console.error('AI Manager: AI search term generation failed:', error);
      throw error;
    }
  }
} 