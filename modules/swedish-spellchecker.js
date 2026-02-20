// modules/swedish-spellchecker.js - Swedish Spell Checking for Auction Catalogs
// Detects common Swedish misspellings and provides corrections

export class SwedishSpellChecker {
  constructor() {
    this.commonWords = this.initializeSwedishWords();
    this.auctionTerms = this.initializeAuctionTerms();
    this.stopWords = this.initializeStopWords();
    

  }

  // Initialize common Swedish words and their misspellings
  initializeSwedishWords() {
    return [
      // Colors - only genuine misspellings, NOT valid inflected forms
      // (blått/rött/grönt/gult/vitt/brunt/grått are valid neuter forms)
      { word: 'blå', misspellings: ['blåa'], category: 'color' },
      { word: 'grön', misspellings: ['groen'], category: 'color' },
      { word: 'gul', misspellings: ['guhl'], category: 'color' },
      { word: 'vit', misspellings: ['vhit'], category: 'color' },
      { word: 'svart', misspellings: ['swart', 'svat'], category: 'color' },
      { word: 'röd', misspellings: ['röt'], category: 'color' },
      
      // Materials
      { word: 'silver', misspellings: ['sylver', 'silwer'], category: 'material' },
      { word: 'guld', misspellings: ['gull'], category: 'material' },
      { word: 'koppar', misspellings: ['kopar'], category: 'material' },
      { word: 'mässing', misspellings: ['masing', 'mesing'], category: 'material' },
      { word: 'porslin', misspellings: ['porlin', 'porslinn'], category: 'material' },
      { word: 'kristall', misspellings: ['krystal', 'cristall'], category: 'material' },
      { word: 'marmor', misspellings: ['marmur'], category: 'material' },
      { word: 'granit', misspellings: ['granitt', 'graniet'], category: 'material' },
      
      // Conditions (removed self-references)
      { word: 'skador', misspellings: ['skadoor'], category: 'condition' },
      { word: 'repor', misspellings: ['reppar', 'repar'], category: 'condition' },
      { word: 'nagg', misspellings: ['nag'], category: 'condition' },
      { word: 'fläckar', misspellings: ['fleckar', 'flackar'], category: 'condition' },
      { word: 'sprickor', misspellings: ['sprikor'], category: 'condition' },
      { word: 'slitage', misspellings: ['slitasje'], category: 'condition' },
      
      // Time periods
      { word: 'sekel', misspellings: ['säkel', 'sekkel'], category: 'period' },
      { word: 'århundrade', misspellings: ['aarhundrade', 'arrhundrade'], category: 'period' },
      { word: 'antik', misspellings: ['antikk'], category: 'period' },
      { word: 'vintage', misspellings: ['vintange', 'wintage'], category: 'period' },
      
      // Common verbs/adjectives (removed self-references and valid inflections)
      { word: 'signerad', misspellings: ['signeradt'], category: 'description' },
      { word: 'märkt', misspellings: ['markt', 'märt'], category: 'description' },
      { word: 'daterad', misspellings: ['dateradt', 'datered'], category: 'description' },
      { word: 'handmålad', misspellings: ['handmalad'], category: 'description' },
      { word: 'förgylld', misspellings: ['forgylld', 'förgöld'], category: 'description' },
      { word: 'oxiderad', misspellings: ['oxyderad'], category: 'description' },
      
      // Measurements (removed valid inflections: djupt/brett are valid forms)
      { word: 'diameter', misspellings: ['diamater', 'diameeter'], category: 'measurement' },
      { word: 'höjd', misspellings: ['hojd', 'hojt'], category: 'measurement' },
      { word: 'längd', misspellings: ['langd', 'lenght'], category: 'measurement' },
      { word: 'vikt', misspellings: ['viktt'], category: 'measurement' },
      
      // Common words (removed self-references and valid inflections)
      { word: 'tillverkad', misspellings: ['tilverkad'], category: 'general' },
      { word: 'ursprung', misspellings: ['ursprumg'], category: 'general' },
      { word: 'exemplar', misspellings: ['examplar', 'exemplaar'], category: 'general' },
      { word: 'kollektion', misspellings: ['kollection'], category: 'general' },
      { word: 'provenienser', misspellings: ['proveniense'], category: 'general' }
    ];
  }

  // Initialize auction-specific terms
  initializeAuctionTerms() {
    return [
      // Auction terminology (removed self-references)
      { word: 'utropspris', misspellings: ['utropris', 'utroppris'], category: 'auction' },
      { word: 'estimat', misspellings: ['estimaat'], category: 'auction' },
      { word: 'klubbslag', misspellings: ['klubslag', 'clubslag'], category: 'auction' },
      { word: 'budgivning', misspellings: ['budgiwning'], category: 'auction' },
      { word: 'försäljning', misspellings: ['forsaljning', 'försäljnig'], category: 'auction' },
      { word: 'katalog', misspellings: ['katlog'], category: 'auction' },
      
      // Art terms
      { word: 'oljemålning', misspellings: ['oljemalning'], category: 'art' },
      { word: 'akvarell', misspellings: ['aquarell', 'akwarelle'], category: 'art' },
      { word: 'litografi', misspellings: ['lithografi', 'litograaf'], category: 'art' },
      { word: 'etsning', misspellings: ['etsninng'], category: 'art' },
      { word: 'skulptur', misspellings: ['skulptrur'], category: 'art' },
      { word: 'målning', misspellings: ['malning'], category: 'art' },
      
      // Furniture terms  
      { word: 'möbler', misspellings: ['mobler'], category: 'furniture' },
      { word: 'uppsättning', misspellings: ['upsättning', 'uppsettning'], category: 'furniture' },
      { word: 'stoppning', misspellings: ['stopning', 'stoppninng'], category: 'furniture' },
      { word: 'polstring', misspellings: ['polstreing', 'polstrig'], category: 'furniture' },
      
      // Jewelry terms (removed self-references)
      { word: 'smycken', misspellings: ['smyken'], category: 'jewelry' },
      { word: 'berlocker', misspellings: ['berloker', 'berlocks'], category: 'jewelry' },
      { word: 'diamanter', misspellings: ['diaments'], category: 'jewelry' },
      { word: 'edelstenar', misspellings: ['adelstenar', 'edelstener'], category: 'jewelry' }
    ];
  }

  // Words to ignore (too short or too common to spell-check)
  initializeStopWords() {
    return [
      // Articles, prepositions, pronouns
      'en', 'ett', 'den', 'det', 'de', 'på', 'i', 'av', 'för', 'med', 'till', 'från', 'om', 'vid', 'under', 'över', 'genom',
      'och', 'eller', 'men', 'att', 'som', 'när', 'där', 'här', 'var', 'vad', 'hur', 'varför',
      // Numbers and measurements  
      'cm', 'mm', 'm', 'kg', 'g', 'st', 'stk', 'ca', 'cirka', 'c:a',
      // Very common words
      'är', 'var', 'har', 'kan', 'ska', 'blir', 'blev', 'been', 'göra', 'ha', 'se', 'få',
      // Valid Swedish inflections that should never be flagged
      'blått', 'rött', 'grönt', 'gult', 'vitt', 'brunt', 'grått',
      'brett', 'djupt', 'bred', 'djup',
      'tillverkat', 'oxiderat', 'signerat',
      'gold', 'deco', 'nouveau'
    ];
  }

  // Check text for Swedish spelling errors
  validateSwedishSpelling(text) {
    const errors = [];
    // Preserve original case for proper name detection
    const originalWords = text.match(/\b[a-zåäöüA-ZÅÄÖÜ]+\b/g) || [];

    for (const originalWord of originalWords) {
      const word = originalWord.toLowerCase();
      if (word.length < 4 || this.stopWords.includes(word)) {
        continue;
      }

      // Skip words that look like proper names (capitalized, not ALL CAPS object type)
      if (this.looksLikeProperName(originalWord, text)) {
        continue;
      }

      // Check against common words
      const commonWordError = this.checkAgainstWordList(word, this.commonWords);
      if (commonWordError) {
        errors.push(commonWordError);
        continue;
      }

      // Check against auction terms
      const auctionTermError = this.checkAgainstWordList(word, this.auctionTerms);
      if (auctionTermError) {
        errors.push(auctionTermError);
      }
    }

    return errors;
  }

  // Detect if a word is likely a proper name (person, place, brand) and should be skipped
  looksLikeProperName(word, fullText) {
    // Must start with uppercase to be a proper name
    if (!/^[A-ZÅÄÖÜ]/.test(word)) return false;

    // ALL CAPS words are object types (TAVLA, STOL etc.), not proper names - don't skip those
    if (word === word.toUpperCase() && word.length > 1) return false;

    // Capitalized word (Title Case) in a comma-separated auction title → likely a proper name
    if (/^[A-ZÅÄÖÜ][a-zåäöü]{2,}$/.test(word)) {
      // Check if preceded by an initial (like "E. Jarup") → definitely a proper name
      const initialPattern = new RegExp(`[A-ZÅÄÖÜ]\\.\\s*${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      if (initialPattern.test(fullText)) return true;

      // Check if preceded by another capitalized word (like "Lars Löfgren") → person name
      const namePattern = new RegExp(`[A-ZÅÄÖÜ][a-zåäöü]+\\s+${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (namePattern.test(fullText)) return true;

      // Check if this word precedes another capitalized word (like "Jarup" in "E. Jarup")
      const followedByCapPattern = new RegExp(`${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+[A-ZÅÄÖÜ][a-zåäöü]+`);
      if (followedByCapPattern.test(fullText)) return true;
    }

    return false;
  }

  // Check a word against a word list
  checkAgainstWordList(word, wordList) {
    for (const entry of wordList) {
      for (const misspelling of entry.misspellings) {
        if (this.calculateSimilarity(word.toLowerCase(), misspelling.toLowerCase()) > 0.85) {
          // Double-check it's not already correct
          if (this.calculateSimilarity(word.toLowerCase(), entry.word.toLowerCase()) < 0.9) {
            return {
              originalWord: word,
              suggestedWord: entry.word,
              confidence: 0.85,
              category: entry.category,
              source: 'swedish_dictionary',
              type: 'spelling'
            };
          }
        }
      }
    }
    return null;
  }

  // Calculate string similarity (Levenshtein-based)
  calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    return (longer.length - this.levenshteinDistance(longer, shorter)) / longer.length;
  }

  // Levenshtein distance calculation
  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
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

  // Generate user-friendly category names
  getCategoryDisplayName(category) {
    const categoryMap = {
      color: 'färg',
      material: 'material',
      condition: 'skick',
      period: 'tidsperiod',
      description: 'beskrivning',
      measurement: 'mått',
      general: 'allmänt',
      auction: 'auktionstermer',
      art: 'konsttermer',
      furniture: 'möbeltermer',
      jewelry: 'smyckestermer'
    };
    
    return categoryMap[category] || 'stavning';
  }

  // Debug information
  debug() {
    
    // Show category distribution
    const categories = {};
    [...this.commonWords, ...this.auctionTerms].forEach(entry => {
      categories[entry.category] = (categories[entry.category] || 0) + 1;
    });
  }
} 