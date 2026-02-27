// modules/spellcheck-dictionary.js — Single Source of Truth for all spellcheck data
// All word lists, brand databases, and string utilities in one place.
// Every spellcheck consumer imports from here instead of maintaining its own copy.

export class SpellcheckDictionary {
  static _instance = null;

  static getInstance() {
    if (!SpellcheckDictionary._instance) {
      SpellcheckDictionary._instance = new SpellcheckDictionary();
    }
    return SpellcheckDictionary._instance;
  }

  constructor() {
    this._whitelist = null;
    this._misspellingMap = null;
    this._brands = null;
    this._stopWords = null;
    this._categoryDisplayNames = null;
  }

  // ════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ════════════════════════════════════════════════════════════

  /** Returns true if the word is a known valid auction term that must never be flagged. */
  isWhitelisted(word) {
    return this._getWhitelist().has(word.toLowerCase());
  }

  /** Look up a known misspelling. Returns { correct, category, confidence } or null. */
  getMisspellingCorrection(word) {
    return this._getMisspellingMap().get(word.toLowerCase()) || null;
  }

  /** Flat misspelling→correction map for simple consumers (dashboard exact-match fallback). */
  getMisspellingsFlat() {
    const flat = {};
    for (const [misspelling, entry] of this._getMisspellingMap()) {
      flat[misspelling] = entry.correct;
    }
    return flat;
  }

  /** Returns true if the word should be skipped (too short, too common). */
  isStopWord(word) {
    return this._getStopWords().has(word.toLowerCase());
  }

  /** Comma-separated whitelist string for injection into AI prompts. */
  getWhitelistForAIPrompt() {
    return [...this._getWhitelist()].join(', ');
  }

  /** Brand database for fuzzy matching. */
  getBrands() {
    if (!this._brands) this._brands = this._buildBrands();
    return this._brands;
  }

  /** Display name for a category key. */
  getCategoryDisplayName(category) {
    if (!this._categoryDisplayNames) {
      this._categoryDisplayNames = {
        color: 'färg', material: 'material', condition: 'skick',
        period: 'tidsperiod', description: 'beskrivning', measurement: 'mått',
        general: 'allmänt', auction: 'auktionstermer', art: 'konsttermer',
        furniture: 'möbeltermer', jewelry: 'smyckestermer',
        watches: 'klocktermer', glass: 'glastermer', ceramics: 'keramiktermer',
        textiles: 'textiltermer', luxury: 'märken'
      };
    }
    return this._categoryDisplayNames[category] || 'stavning';
  }

  // ════════════════════════════════════════════════════════════
  //  STATIC UTILITIES (single implementations — no duplication)
  // ════════════════════════════════════════════════════════════

  static levenshteinDistance(str1, str2) {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) matrix[i] = [i];
    for (let j = 0; j <= str1.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  }

  static calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    if (longer.length === 0) return 1.0;
    return (longer.length - SpellcheckDictionary.levenshteinDistance(longer, shorter)) / longer.length;
  }

  // ════════════════════════════════════════════════════════════
  //  PRIVATE DATA BUILDERS (lazy-initialized)
  // ════════════════════════════════════════════════════════════

  _getWhitelist() {
    if (!this._whitelist) this._whitelist = this._buildWhitelist();
    return this._whitelist;
  }

  _getMisspellingMap() {
    if (!this._misspellingMap) this._misspellingMap = this._buildMisspellingMap();
    return this._misspellingMap;
  }

  _getStopWords() {
    if (!this._stopWords) this._stopWords = this._buildStopWords();
    return this._stopWords;
  }

  /**
   * Auction term whitelist — words that must NEVER be flagged as spelling errors.
   * This is the canonical list. Add new terms here and they propagate everywhere.
   */
  _buildWhitelist() {
    return new Set([
      // ─── Watches & Clocks ───────────────────────────────────
      'boett', 'boetten', 'boettens', 'urtavla', 'urtavlan',
      'krona', 'kronor', 'tryckare', 'lunett', 'lünett',
      'guillocherad', 'guillochering', 'savonett', 'lépine',
      'regulatör', 'remontoir', 'kronograf', 'datumvisning',

      // ─── Jewelry ────────────────────────────────────────────
      'rivière', 'entourage', 'solitär', 'cabochon', 'pavé',
      'baguette', 'marquise', 'briljant', 'briljanter',
      'karneol', 'onyx', 'agat', 'citrin', 'ametist',
      'turmalin', 'peridot', 'topas', 'opal', 'safir',
      'rubin', 'smaragd', 'akvamarinsten', 'beryll',

      // ─── Furniture ──────────────────────────────────────────
      'plymå', 'plymåer', 'chiffonjé', 'chiffonjer',
      'rocaille', 'akantus', 'baluster', 'pilaster',
      'intarsia', 'fanér', 'marketeri', 'furnering',
      'dragspelsstol', 'klaffbord', 'piedestal',
      'sekretär', 'étagère', 'kommod', 'guéridon',
      'skänk', 'pendyl', 'dosa', 'dosor',

      // ─── Ceramics & Glass ───────────────────────────────────
      'chamotte', 'chamottelera', 'glasyr', 'glasering',
      'craquelé', 'craquelure', 'fajans', 'flintgods',
      'stengods', 'lergods', 'terrakotta', 'majolika',
      'karott', 'karotter', 'karaff', 'karaffer',
      'terrin', 'terriner', 'konfektskål', 'sockerskål',
      'kandelaber', 'girandol', 'sockerdricka',

      // ─── Art Terms ──────────────────────────────────────────
      'tuschlavering', 'lavering', 'gouache', 'akvarell',
      'litografi', 'etsning', 'mezzotint', 'torrnål',
      'xylografi', 'serigrafi', 'collografi',
      'psykemålning', 'bonadsväv', 'tablå',
      'plaquette', 'applique', 'appliqué',
      'krakelyrer', 'krakeleringar',

      // ─── Textiles ───────────────────────────────────────────
      'röllakan', 'rölakan', 'rya', 'gobelängteknik',
      'kelim', 'flossa', 'halvflossa',

      // ─── Materials ──────────────────────────────────────────
      'tenn', 'emalj', 'porfyr', 'alabaster',
      'mahogny', 'jakaranda', 'palisander', 'valnöt',
      'björk', 'ek', 'alm', 'ask', 'furu',
      'steatit', 'serpentin',

      // ─── Valid Swedish inflections ──────────────────────────
      'blått', 'rött', 'grönt', 'gult', 'vitt', 'brunt', 'grått',
      'brett', 'djupt', 'bred', 'djup',
      'tillverkat', 'oxiderat', 'signerat',
      'gold', 'deco', 'nouveau',

      // ─── Auction terminology ────────────────────────────────
      'bricka', 'bägare', 'pokal',
    ]);
  }

  /**
   * Misspelling map — consolidated from swedish-spellchecker.js + admin-dashboard.js.
   * Map<lowercase_misspelling, { correct, category, confidence }>
   */
  _buildMisspellingMap() {
    const entries = [
      // Colors
      { correct: 'blå', misspellings: ['blåa'], category: 'color' },
      { correct: 'grön', misspellings: ['groen'], category: 'color' },
      { correct: 'gul', misspellings: ['guhl'], category: 'color' },
      { correct: 'vit', misspellings: ['vhit'], category: 'color' },
      { correct: 'svart', misspellings: ['swart', 'svat'], category: 'color' },
      { correct: 'röd', misspellings: ['röt'], category: 'color' },

      // Materials
      { correct: 'silver', misspellings: ['sylver', 'silwer'], category: 'material' },
      { correct: 'guld', misspellings: ['gull'], category: 'material' },
      { correct: 'koppar', misspellings: ['kopar'], category: 'material' },
      { correct: 'mässing', misspellings: ['masing', 'mesing'], category: 'material' },
      { correct: 'porslin', misspellings: ['porlin', 'porslinn'], category: 'material' },
      { correct: 'kristall', misspellings: ['krystal', 'cristall'], category: 'material' },
      { correct: 'marmor', misspellings: ['marmur'], category: 'material' },
      { correct: 'granit', misspellings: ['granitt', 'graniet'], category: 'material' },

      // Condition terms
      { correct: 'skador', misspellings: ['skadoor'], category: 'condition' },
      { correct: 'repor', misspellings: ['reppar', 'repar'], category: 'condition' },
      { correct: 'nagg', misspellings: ['nag'], category: 'condition' },
      { correct: 'fläckar', misspellings: ['fleckar', 'flackar'], category: 'condition' },
      { correct: 'sprickor', misspellings: ['sprikor'], category: 'condition' },
      { correct: 'slitage', misspellings: ['slitasje'], category: 'condition' },

      // Time periods
      { correct: 'sekel', misspellings: ['säkel', 'sekkel'], category: 'period' },
      { correct: 'århundrade', misspellings: ['aarhundrade', 'arrhundrade'], category: 'period' },
      { correct: 'antik', misspellings: ['antikk'], category: 'period' },
      { correct: 'vintage', misspellings: ['vintange', 'wintage'], category: 'period' },

      // Descriptions
      { correct: 'signerad', misspellings: ['signeradt'], category: 'description' },
      { correct: 'märkt', misspellings: ['markt', 'märt'], category: 'description' },
      { correct: 'daterad', misspellings: ['dateradt', 'datered'], category: 'description' },
      { correct: 'handmålad', misspellings: ['handmalad'], category: 'description' },
      { correct: 'förgylld', misspellings: ['forgylld', 'förgöld'], category: 'description' },
      { correct: 'oxiderad', misspellings: ['oxyderad'], category: 'description' },

      // Measurements
      { correct: 'diameter', misspellings: ['diamater', 'diameeter'], category: 'measurement' },
      { correct: 'höjd', misspellings: ['hojd', 'hojt'], category: 'measurement' },
      { correct: 'längd', misspellings: ['langd', 'lenght'], category: 'measurement' },
      { correct: 'vikt', misspellings: ['viktt'], category: 'measurement' },

      // General
      { correct: 'tillverkad', misspellings: ['tilverkad'], category: 'general' },
      { correct: 'ursprung', misspellings: ['ursprumg'], category: 'general' },
      { correct: 'exemplar', misspellings: ['examplar', 'exemplaar'], category: 'general' },
      { correct: 'kollektion', misspellings: ['kollection'], category: 'general' },
      { correct: 'provenienser', misspellings: ['proveniense'], category: 'general' },

      // Auction terms
      { correct: 'utropspris', misspellings: ['utropris', 'utroppris'], category: 'auction' },
      { correct: 'estimat', misspellings: ['estimaat'], category: 'auction' },
      { correct: 'klubbslag', misspellings: ['klubslag', 'clubslag'], category: 'auction' },
      { correct: 'budgivning', misspellings: ['budgiwning'], category: 'auction' },
      { correct: 'försäljning', misspellings: ['forsaljning', 'försäljnig'], category: 'auction' },
      { correct: 'katalog', misspellings: ['katlog'], category: 'auction' },

      // Art terms
      { correct: 'oljemålning', misspellings: ['oljemalning'], category: 'art' },
      { correct: 'akvarell', misspellings: ['aquarell', 'akwarelle'], category: 'art' },
      { correct: 'litografi', misspellings: ['lithografi', 'litograaf'], category: 'art' },
      { correct: 'etsning', misspellings: ['etsninng'], category: 'art' },
      { correct: 'skulptur', misspellings: ['skulptrur'], category: 'art' },
      { correct: 'målning', misspellings: ['malning'], category: 'art' },

      // Furniture
      { correct: 'möbler', misspellings: ['mobler'], category: 'furniture' },
      { correct: 'uppsättning', misspellings: ['upsättning', 'uppsettning'], category: 'furniture' },
      { correct: 'stoppning', misspellings: ['stopning', 'stoppninng'], category: 'furniture' },
      { correct: 'polstring', misspellings: ['polstreing', 'polstrig'], category: 'furniture' },

      // Jewelry
      { correct: 'smycken', misspellings: ['smyken'], category: 'jewelry' },
      { correct: 'berlocker', misspellings: ['berloker', 'berlocks'], category: 'jewelry' },
      { correct: 'diamanter', misspellings: ['diaments'], category: 'jewelry' },
      { correct: 'edelstenar', misspellings: ['adelstenar', 'edelstener'], category: 'jewelry' },

      // Extra entries from admin-dashboard (not in swedish-spellchecker)
      { correct: 'balja', misspellings: ['ballja'], category: 'general' },
      { correct: 'byrå', misspellings: ['byråa'], category: 'furniture' },
      { correct: 'skåp', misspellings: ['skåpp'], category: 'furniture' },
      { correct: 'bord', misspellings: ['bordd'], category: 'furniture' },
      { correct: 'tavla', misspellings: ['tavlla'], category: 'art' },
      { correct: 'spegel', misspellings: ['spegell'], category: 'furniture' },
      { correct: 'fåtölj', misspellings: ['fåtöllj'], category: 'furniture' },
      { correct: 'kandelaber', misspellings: ['kandelabrer'], category: 'general' },
    ];

    const map = new Map();
    for (const entry of entries) {
      for (const ms of entry.misspellings) {
        map.set(ms.toLowerCase(), {
          correct: entry.correct,
          category: entry.category,
          confidence: 0.85
        });
      }
    }
    return map;
  }

  /** Stop words — too short or too common to spellcheck. */
  _buildStopWords() {
    return new Set([
      // Articles, prepositions, pronouns
      'en', 'ett', 'den', 'det', 'de', 'på', 'i', 'av', 'för', 'med',
      'till', 'från', 'om', 'vid', 'under', 'över', 'genom',
      'och', 'eller', 'men', 'att', 'som', 'när', 'där', 'här',
      'var', 'vad', 'hur', 'varför',
      // Numbers and measurements
      'cm', 'mm', 'm', 'kg', 'g', 'st', 'stk', 'ca', 'cirka', 'c:a',
      // Very common words
      'är', 'var', 'har', 'kan', 'ska', 'blir', 'blev', 'been',
      'göra', 'ha', 'se', 'få',
    ]);
  }

  /** Brand database — consolidated from brand-validation-manager.js + ai-rules-config.json. */
  _buildBrands() {
    return [
      // Swiss Watch Brands
      { name: 'Lemania', variants: ['Lemonia', 'Lemaina', 'Lemenia'], category: 'watches', confidence: 0.95 },
      { name: 'Omega', variants: ['Omaga', 'Omege'], category: 'watches', confidence: 0.95 },
      { name: 'Rolex', variants: ['Rollex', 'Roleex'], category: 'watches', confidence: 0.95 },
      { name: 'Patek Philippe', variants: ['Pateck Philippe', 'Patek Philip'], category: 'watches', confidence: 0.95 },
      { name: 'Vacheron Constantin', variants: ['Vacheron Konstatin'], category: 'watches', confidence: 0.95 },

      // Scandinavian Glass/Crystal
      { name: 'Orrefors', variants: ['Orefors', 'Orrefross'], category: 'glass', confidence: 0.90 },
      { name: 'Kosta Boda', variants: ['Kosta', 'Kostaboda'], category: 'glass', confidence: 0.90 },
      { name: 'Iittala', variants: ['Itala', 'Iitala'], category: 'glass', confidence: 0.90 },
      { name: 'Nuutajärvi', variants: ['Nuutajarvi', 'Nutajarvi'], category: 'glass', confidence: 0.85 },

      // Scandinavian Ceramics
      { name: 'Gustavsberg', variants: ['Gustavberg', 'Gustavsber'], category: 'ceramics', confidence: 0.90 },
      { name: 'Rörstrand', variants: ['Rorstrand', 'Rörstran'], category: 'ceramics', confidence: 0.90 },
      { name: 'Arabia', variants: ['Arabie', 'Aravia'], category: 'ceramics', confidence: 0.90 },
      { name: 'Royal Copenhagen', variants: ['Royal Kopenhagen', 'Rojal Copenhagen'], category: 'ceramics', confidence: 0.95 },
      { name: 'Bing & Grøndahl', variants: ['Bing Grondahl', 'Bing Gröndahl'], category: 'ceramics', confidence: 0.90 },

      // Furniture/Design
      { name: 'Svenskt Tenn', variants: ['Svensk Tenn', 'Svenskttenn'], category: 'furniture', confidence: 0.85 },
      { name: 'Källemo', variants: ['Kallemo', 'Kälemo'], category: 'furniture', confidence: 0.85 },
      { name: 'Lammhults', variants: ['Lamhults', 'Lammmhults'], category: 'furniture', confidence: 0.85 },

      // International Luxury
      { name: 'Hermès', variants: ['Hermes', 'Hermés'], category: 'luxury', confidence: 0.95 },
      { name: 'Louis Vuitton', variants: ['Louis Vitton', 'Luis Vuitton'], category: 'luxury', confidence: 0.95 },
      { name: 'Cartier', variants: ['Cartie', 'Cartier'], category: 'luxury', confidence: 0.95 },
    ];
  }
}
