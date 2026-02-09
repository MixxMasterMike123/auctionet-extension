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
      // Colors (common in auction descriptions)
      { word: 'blå', misspellings: ['blåa', 'blått'], category: 'color' },
      { word: 'röd', misspellings: ['rött', 'röt'], category: 'color' },
      { word: 'grön', misspellings: ['grönt', 'groen'], category: 'color' },
      { word: 'gul', misspellings: ['gult', 'guhl'], category: 'color' },
      { word: 'vit', misspellings: ['vitt', 'vhit'], category: 'color' },
      { word: 'svart', misspellings: ['swart', 'svat'], category: 'color' },
      { word: 'brun', misspellings: ['brunt', 'brunn'], category: 'color' },
      { word: 'grå', misspellings: ['grått', 'gråa'], category: 'color' },
      
      // Materials
      { word: 'silver', misspellings: ['sylver', 'silwer'], category: 'material' },
      { word: 'guld', misspellings: ['gold', 'gull'], category: 'material' },
      { word: 'koppar', misspellings: ['kopar', 'copper'], category: 'material' },
      { word: 'mässing', misspellings: ['masing', 'mesing'], category: 'material' },
      { word: 'porslin', misspellings: ['porlin', 'porslinn'], category: 'material' },
      { word: 'kristall', misspellings: ['krystal', 'cristall'], category: 'material' },
      { word: 'marmor', misspellings: ['marmur', 'marmor'], category: 'material' },
      { word: 'granit', misspellings: ['granitt', 'graniet'], category: 'material' },
      
      // Conditions  
      { word: 'skador', misspellings: ['skador', 'skadoor'], category: 'condition' },
      { word: 'repor', misspellings: ['reppar', 'repar'], category: 'condition' },
      { word: 'nagg', misspellings: ['nag', 'nagg'], category: 'condition' },
      { word: 'fläckar', misspellings: ['fleckar', 'flackar'], category: 'condition' },
      { word: 'sprickor', misspellings: ['sprikor', 'spricka'], category: 'condition' },
      { word: 'slitage', misspellings: ['slitasje', 'slitning'], category: 'condition' },
      
      // Time periods
      { word: 'sekel', misspellings: ['säkel', 'sekkel'], category: 'period' },
      { word: 'århundrade', misspellings: ['aarhundrade', 'arrhundrade'], category: 'period' },
      { word: 'antik', misspellings: ['antique', 'antikk'], category: 'period' },
      { word: 'vintage', misspellings: ['vintange', 'wintage'], category: 'period' },
      
      // Common verbs/adjectives
      { word: 'signerad', misspellings: ['signerad', 'signeradt'], category: 'description' },
      { word: 'märkt', misspellings: ['markt', 'märt'], category: 'description' },
      { word: 'daterad', misspellings: ['dateradt', 'datered'], category: 'description' },
      { word: 'handmålad', misspellings: ['handmalad', 'hand-målad'], category: 'description' },
      { word: 'förgylld', misspellings: ['forgylld', 'förgöld'], category: 'description' },
      { word: 'oxiderad', misspellings: ['oxyderad', 'oxiderat'], category: 'description' },
      
      // Measurements
      { word: 'diameter', misspellings: ['diamater', 'diameeter'], category: 'measurement' },
      { word: 'höjd', misspellings: ['hojd', 'hojt'], category: 'measurement' },
      { word: 'bredd', misspellings: ['bred', 'brett'], category: 'measurement' },
      { word: 'djup', misspellings: ['djupt', 'diup'], category: 'measurement' },
      { word: 'längd', misspellings: ['langd', 'lenght'], category: 'measurement' },
      { word: 'vikt', misspellings: ['viktt', 'weight'], category: 'measurement' },
      
      // Common words
      { word: 'tillverkad', misspellings: ['tilverkad', 'tillverkat'], category: 'general' },
      { word: 'ursprung', misspellings: ['ursprung', 'ursprumg'], category: 'general' },
      { word: 'exemplar', misspellings: ['examplar', 'exemplaar'], category: 'general' },
      { word: 'kollektion', misspellings: ['collection', 'kollection'], category: 'general' },
      { word: 'provenienser', misspellings: ['proveniens', 'proveniense'], category: 'general' }
    ];
  }

  // Initialize auction-specific terms
  initializeAuctionTerms() {
    return [
      // Auction terminology
      { word: 'utropspris', misspellings: ['utropris', 'utroppris'], category: 'auction' },
      { word: 'estimat', misspellings: ['estimaat', 'estimate'], category: 'auction' },
      { word: 'klubbslag', misspellings: ['klubslag', 'clubslag'], category: 'auction' },
      { word: 'budgivning', misspellings: ['budgiwning', 'budgivning'], category: 'auction' },
      { word: 'försäljning', misspellings: ['forsaljning', 'försäljnig'], category: 'auction' },
      { word: 'katalog', misspellings: ['catalog', 'katlog'], category: 'auction' },
      { word: 'proveniering', misspellings: ['proveniens', 'proveniering'], category: 'auction' },
      
      // Art terms
      { word: 'oljemålning', misspellings: ['oljemalning', 'olje-målning'], category: 'art' },
      { word: 'akvarell', misspellings: ['aquarell', 'akwarelle'], category: 'art' },
      { word: 'litografi', misspellings: ['lithografi', 'litograaf'], category: 'art' },
      { word: 'etsning', misspellings: ['etsninng', 'etching'], category: 'art' },
      { word: 'skulptur', misspellings: ['skulptrur', 'sculpture'], category: 'art' },
      { word: 'målning', misspellings: ['malning', 'painting'], category: 'art' },
      
      // Furniture terms  
      { word: 'möbler', misspellings: ['mobler', 'möbel'], category: 'furniture' },
      { word: 'uppsättning', misspellings: ['upsättning', 'uppsettning'], category: 'furniture' },
      { word: 'stoppning', misspellings: ['stopning', 'stoppninng'], category: 'furniture' },
      { word: 'polstring', misspellings: ['polstreing', 'polstrig'], category: 'furniture' },
      
      // Jewelry terms
      { word: 'smycken', misspellings: ['smyken', 'smycke'], category: 'jewelry' },
      { word: 'berlocker', misspellings: ['berloker', 'berlocks'], category: 'jewelry' },
      { word: 'diamanter', misspellings: ['diamanter', 'diaments'], category: 'jewelry' },
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
      'är', 'var', 'har', 'kan', 'ska', 'blir', 'blev', 'been', 'göra', 'ha', 'se', 'få'
    ];
  }

  // Check text for Swedish spelling errors
  validateSwedishSpelling(text) {
    const errors = [];
    const words = text.toLowerCase().match(/\b[a-zåäöü]+\b/gi) || [];

    for (const word of words) {
      if (word.length < 4 || this.stopWords.includes(word.toLowerCase())) {
        continue; // Skip short words and stop words
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