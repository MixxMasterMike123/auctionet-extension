export class ItemTypeHandlers {
  constructor() {
    this.searchTermExtractor = null; // Will be injected
  }

  setSearchTermExtractor(extractor) {
    this.searchTermExtractor = extractor;
  }

  // ==================== JEWELRY HANDLERS ====================

  // Check if item is jewelry
  isJewelryItem(objectType, title, description) {
    const jewelryTypes = [
      'ring', 'ringar', 'förlovningsring', 'vigselring',
      'halsband', 'kedja', 'collier',
      'armband', 'bangel',
      'örhängen', 'örhänge',
      'brosch', 'nål',
      'hänge', 'pendant',
      'klocka', 'armbandsur', 'fickur',
      'manschettknappar', 'knappar',
      'smycke', 'smycken', 'juveler'
    ];
    
    const textToCheck = `${objectType} ${title} ${description}`.toLowerCase();
    
    // Don't treat watches as jewelry if they have watch-specific terms
    const watchTerms = ['armbandsur', 'fickur', 'manuellt uppdrag', 'automatisk', 'quartz', 'kronometer'];
    const hasWatchTerms = watchTerms.some(term => textToCheck.includes(term));
    
    if (hasWatchTerms) {
      return false; // Let watch detection handle this
    }
    
    return jewelryTypes.some(type => textToCheck.includes(type));
  }

  generateJewelrySearch(objectType, title, description, artistInfo, baseTerms, baseConfidence) {
    console.log('💍 Generating jewelry-specific search for:', title);
    
    // Extract jewelry-specific attributes
    const text = title + ' ' + description;
    const materials = this.searchTermExtractor.extractJewelryMaterials(text);
    const weight = this.searchTermExtractor.extractWeight(text);
    const stones = this.searchTermExtractor.extractStones(text);
    const size = this.searchTermExtractor.extractJewelrySize(text);
    const periods = this.searchTermExtractor.extractPeriods(text);

    // Build progressive search strategy for jewelry
    const jewelryType = objectType.toLowerCase();
    let searchStrategy = 'jewelry_basic';
    let confidence = 0.6;
    let primaryTerms = [jewelryType];

    // Priority 1: Material + Type (most important for jewelry valuation)
    if (materials && materials.length > 0) {
      const primaryMaterial = materials[0];
      if (primaryMaterial.includes('guld') || primaryMaterial.includes('gold')) {
        primaryTerms = [jewelryType, 'guld'];
        confidence = 0.8;
        searchStrategy = 'jewelry_gold';
      } else if (primaryMaterial.includes('silver')) {
        primaryTerms = [jewelryType, 'silver'];
        confidence = 0.75;
        searchStrategy = 'jewelry_silver';
      } else if (primaryMaterial.includes('platina') || primaryMaterial.includes('platinum')) {
        primaryTerms = [jewelryType, 'platina'];
        confidence = 0.85;
        searchStrategy = 'jewelry_platinum';
      } else {
        primaryTerms = [jewelryType, primaryMaterial];
        confidence = 0.65;
        searchStrategy = 'jewelry_material';
      }
    }

    // Priority 2: Add stones if present (increases value significantly)
    if (stones && stones.length > 0) {
      const primaryStone = stones[0];
      if (primaryStone.includes('diamant') || primaryStone.includes('brilliant')) {
        primaryTerms.push('diamant');
        confidence += 0.1;
        searchStrategy += '_diamond';
      } else {
        primaryTerms.push(primaryStone);
        confidence += 0.05;
        searchStrategy += '_stone';
      }
    }

    // Priority 3: Add size/weight if significant
    if (weight && !weight.includes('gram')) { // Carat weight is more valuable
      primaryTerms.push(weight);
      confidence += 0.05;
    } else if (size) {
      // Size is less critical but can help
      // Don't add to avoid over-specifying
    }

    const searchString = primaryTerms.join(' ');
    
    console.log('💍 Jewelry search generated:', {
      materials,
      stones,
      weight,
      size,
      periods,
      finalSearch: searchString,
      strategy: searchStrategy,
      confidence: Math.min(confidence, 0.9)
    });

    return {
      searchTerms: searchString,
      confidence: Math.min(confidence, 0.9),
      strategy: searchStrategy,
      termCount: primaryTerms.length,
      hasArtist: !!artistInfo,
      isJewelry: true
    };
  }

  // ==================== COIN HANDLERS ====================

  // Check if item is coin/numismatic
  isCoinItem(objectType, title, description) {
    const coinTypes = [
      'mynt', 'coin', 'coins', 'myntserie', 'myntsamling',
      'silvermynt', 'guldmynt', 'kopparmynt', 'bronsmynt',
      'medal', 'medalj', 'minnesmynt', 'commemorative',
      'sedel', 'banknote', 'paper money', 'riksdaler',
      'öre', 'krona', 'kronor', 'skilling', 'mark',
      'numismatic', 'numismatik', 'mynthandel'
    ];
    
    const textToCheck = `${objectType} ${title} ${description}`.toLowerCase();
    return coinTypes.some(type => textToCheck.includes(type));
  }

  generateCoinSearch(objectType, title, description, artistInfo, baseTerms, baseConfidence) {
    console.log('🪙 Generating coin-specific search for:', title);
    
    const text = title + ' ' + description;
    const denominations = this.extractDenominations(text);
    const materials = this.extractCoinMaterials(text);
    const countries = this.extractCountries(text);
    const years = this.extractYears(text);
    const series = this.extractCoinSeries(text);

    // Build search strategy for coins
    const coinType = objectType.toLowerCase();
    let searchStrategy = 'coin_basic';
    let confidence = 0.6;
    let primaryTerms = [coinType];

    // Priority 1: Material + Type (precious metals are most valuable)
    if (materials && materials.length > 0) {
      const material = materials[0];
      if (material.includes('guld') || material.includes('gold')) {
        primaryTerms = [coinType, 'guld'];
        confidence = 0.85;
        searchStrategy = 'coin_gold';
      } else if (material.includes('silver')) {
        primaryTerms = [coinType, 'silver'];
        confidence = 0.8;
        searchStrategy = 'coin_silver';
      } else {
        primaryTerms = [coinType, material];
        confidence = 0.65;
        searchStrategy = 'coin_material';
      }
    }

    // Priority 2: Add denomination if specific
    if (denominations && denominations.length > 0) {
      primaryTerms.push(denominations[0]);
      confidence += 0.05;
    }

    // Priority 3: Add country for regional specificity
    if (countries && countries.length > 0) {
      const country = countries[0];
      if (country.includes('sverige') || country.includes('swedish')) {
        primaryTerms.push('sverige');
        confidence += 0.05;
      } else {
        primaryTerms.push(country);
        confidence += 0.03;
      }
    }

    // Priority 4: Add year if specific
    if (years && years.length > 0) {
      // Only add year if it's reasonably specific
      const year = years[0];
      if (year.length === 4) { // Full year like "1925"
        primaryTerms.push(year);
        confidence += 0.03;
      }
    }

    const searchString = primaryTerms.join(' ');
    
    console.log('🪙 Coin search generated:', {
      denominations,
      materials,
      countries,
      years,
      series,
      finalSearch: searchString,
      strategy: searchStrategy,
      confidence: Math.min(confidence, 0.9)
    });

    return {
      searchTerms: searchString,
      confidence: Math.min(confidence, 0.9),
      strategy: searchStrategy,
      termCount: primaryTerms.length,
      hasArtist: !!artistInfo,
      isCoin: true
    };
  }

  // Extract coin denominations
  extractDenominations(text) {
    const denominationPattern = /(\d+[,.]?\d*)\s*(?:öre|krona|kronor|skilling|mark|cent|euro|dollar|pound|yen|franc)/gi;
    const matches = text.match(denominationPattern) || [];
    
    return matches
      .map(match => match.trim().toLowerCase())
      .filter((denom, index, arr) => arr.indexOf(denom) === index) // Remove duplicates
      .slice(0, 2);
  }

  // Extract coin materials
  extractCoinMaterials(text) {
    const materialPattern = /(?:silver|guld|gold|koppar|copper|brons|bronze|nickel|zink|zinc|järn|iron|stål|steel|platina|platinum)/gi;
    const matches = text.match(materialPattern) || [];
    
    return matches
      .map(match => match.trim().toLowerCase())
      .filter((material, index, arr) => arr.indexOf(material) === index)
      .slice(0, 2);
  }

  // Extract countries/regions for coins
  extractCountries(text) {
    const countryPattern = /(?:sverige|sweden|norge|norway|danmark|denmark|finland|tyskland|germany|frankrike|france|england|usa|amerika|ryssland|russia)/gi;
    const matches = text.match(countryPattern) || [];
    
    return matches
      .map(match => match.trim().toLowerCase())
      .filter((country, index, arr) => arr.indexOf(country) === index)
      .slice(0, 2);
  }

  // Extract years for coins
  extractYears(text) {
    const yearPattern = /\b(1[6-9]\d{2}|20[0-2]\d)\b/g; // Years from 1600-2029
    const matches = text.match(yearPattern) || [];
    
    return matches
      .filter((year, index, arr) => arr.indexOf(year) === index)
      .slice(0, 2);
  }

  // Extract coin series information
  extractCoinSeries(text) {
    const seriesPattern = /(?:serie|series|samling|collection|jubileum|minnesmynt|commemorative)/gi;
    const matches = text.match(seriesPattern) || [];
    
    return matches
      .map(match => match.trim().toLowerCase())
      .filter((series, index, arr) => arr.indexOf(series) === index)
      .slice(0, 1);
  }

  // ==================== STAMP HANDLERS ====================

  // Check if item is stamp/philatelic
  isStampItem(objectType, title, description) {
    const stampTypes = [
      'frimärke', 'frimärken', 'stamp', 'stamps', 'philatelic', 'philately',
      'postfrisk', 'stämplad', 'stämpel', 'postmark', 'postal',
      'brevfrimärke', 'jubileumsfrimärke', 'minnesfrimärke',
      'frimärkssamling', 'frimärksalbum', 'stampcollection',
      'frimärksblad', 'frimärksblock', 'block', 'haefte',
      'frankering', 'porto', 'poststämpel'
    ];
    
    const textToCheck = `${objectType} ${title} ${description}`.toLowerCase();
    return stampTypes.some(type => textToCheck.includes(type));
  }

  generateStampSearch(objectType, title, description, artistInfo, baseTerms, baseConfidence) {
    console.log('📮 Generating stamp search for:', title);
    
    const text = title + ' ' + description;
    const countries = this.extractStampCountries(text);
    const collectionTypes = this.extractStampCollectionTypes(text);
    const conditions = this.extractStampConditions(text);
    const periods = this.extractStampPeriods(text);

    const stampType = objectType.toLowerCase();
    let searchStrategy = 'stamp_basic';
    let confidence = 0.7; // Stamps generally have good search reliability
    let finalTerms = [stampType];

    // Priority 1: Country (very important for stamps)
    if (countries && countries.length > 0) {
      const country = countries[0];
      finalTerms.push(country);
      confidence += 0.1;
      searchStrategy = 'stamp_country';
    }

    // Priority 2: Collection type (commemorative, definitive, etc.)
    if (collectionTypes && collectionTypes.length > 0) {
      finalTerms.push(collectionTypes[0]);
      confidence += 0.05;
    }

    // Priority 3: Add condition if mint/perfect
    if (conditions && conditions.length > 0) {
      const condition = conditions[0];
      if (condition.includes('postfrisk') || condition.includes('mint')) {
        finalTerms.push('postfrisk');
        confidence += 0.05;
      }
    }

    // Priority 4: Add period if specific
    if (periods && periods.length > 0) {
      finalTerms.push(periods[0]);
      confidence += 0.03;
    }

    const searchString = finalTerms.join(' ');
    
    console.log('📮 Stamp search generated:', {
      terms: finalTerms,
      searchString: searchString,
      confidence: Math.min(confidence, 0.9),
      strategy: searchStrategy
    });

    return {
      searchTerms: searchString,
      confidence: Math.min(confidence, 0.9),
      strategy: searchStrategy,
      termCount: finalTerms.length,
      hasArtist: !!artistInfo,
      isStamp: true
    };
  }

  // Extract stamp countries
  extractStampCountries(text) {
    const countryPattern = /(?:sverige|sweden|sverige|norge|norway|danmark|denmark|finland|tyskland|germany|frankrike|france|england|usa|amerika)/gi;
    const matches = text.match(countryPattern) || [];
    
    return matches
      .map(match => match.trim().toLowerCase())
      .filter((country, index, arr) => arr.indexOf(country) === index)
      .slice(0, 1);
  }

  // Extract stamp collection types
  extractStampCollectionTypes(text) {
    const typePattern = /(?:jubileum|minnesfrimärke|commemorative|definitive|provisional|airmail|special)/gi;
    const matches = text.match(typePattern) || [];
    
    return matches
      .map(match => match.trim().toLowerCase())
      .filter((type, index, arr) => arr.indexOf(type) === index)
      .slice(0, 1);
  }

  // Extract stamp conditions
  extractStampConditions(text) {
    const conditionPattern = /(?:postfrisk|mint|stämplad|used|cancelled|perfect|excellent|good|fair)/gi;
    const matches = text.match(conditionPattern) || [];
    
    return matches
      .map(match => match.trim().toLowerCase())
      .filter((condition, index, arr) => arr.indexOf(condition) === index)
      .slice(0, 1);
  }

  // Extract stamp periods
  extractStampPeriods(text) {
    const periodPattern = /\b(1[8-9]\d{2}|20[0-2]\d)\b/g; // Years from 1800-2029
    const matches = text.match(periodPattern) || [];
    
    return matches
      .filter((year, index, arr) => arr.indexOf(year) === index)
      .slice(0, 1);
  }

  // ==================== AUDIO EQUIPMENT HANDLERS ====================

  // Check if item is audio equipment
  isAudioEquipment(objectType, title, description) {
    const audioKeywords = [
      'förstärkare', 'amplifier', 'receiver', 'tuner', 'radio',
      'högtalare', 'speaker', 'subwoofer', 'monitors',
      'skivspelare', 'turntable', 'cd-spelare', 'kassettspelare',
      'stereoanläggning', 'stereo', 'hifi', 'hi-fi',
      'mixtboard', 'mixer', 'equalizer', 'crossover'
    ];

    const text = `${objectType} ${title} ${description}`.toLowerCase();
    return audioKeywords.some(keyword => text.includes(keyword));
  }

  generateAudioSearch(objectType, title, description, artistInfo, baseTerms, baseConfidence) {
    console.log('🔊 Generating audio equipment search for:', title);
    
    const brand = this.extractAudioBrands(title + ' ' + description);
    const model = this.extractAudioModel(title + ' ' + description);
    const equipmentType = this.extractAudioType(objectType, title);
    const broadPeriod = this.searchTermExtractor.extractBroadPeriod(title + ' ' + description);

    // Audio equipment search strategy
    let searchStrategy = 'audio_basic';
    let confidence = 0.6;
    let primarySearch = equipmentType || objectType.toLowerCase();

    // Priority 1: Brand + Type (most important for audio)
    if (brand) {
      primarySearch = `${primarySearch} ${brand}`;
      confidence = 0.8;
      searchStrategy = 'audio_brand';
    }
    // Priority 2: Model + Type (if no brand but has model)
    else if (model) {
      primarySearch = `${primarySearch} ${model}`;
      confidence = 0.7;
      searchStrategy = 'audio_model';
    }
    // Priority 3: Period + Type (vintage audio is popular)
    else if (broadPeriod) {
      primarySearch = `${primarySearch} ${broadPeriod}`;
      confidence = 0.65;
      searchStrategy = 'audio_period';
    }

    const searchString = primarySearch;
    
    console.log('🔊 Audio search generated:', {
      brand,
      model,
      equipmentType,
      broadPeriod,
      finalSearch: searchString,
      strategy: searchStrategy,
      confidence: Math.min(confidence, 0.9)
    });

    return {
      searchTerms: searchString,
      confidence: Math.min(confidence, 0.9),
      strategy: searchStrategy,
      termCount: searchString.split(' ').length,
      hasArtist: false,
      isAudio: true
    };
  }

  // Extract audio brands
  extractAudioBrands(text) {
    const brands = [
      'technics', 'pioneer', 'marantz', 'yamaha', 'denon', 'onkyo',
      'harman kardon', 'jbl', 'bang & olufsen', 'b&o', 'linn', 'naim',
      'mcintosh', 'mark levinson', 'krell', 'conrad johnson',
      'audio research', 'cj walker', 'quad', 'mission', 'kef',
      'bowers & wilkins', 'b&w', 'monitor audio', 'paradigm',
      'polk audio', 'klipsch', 'cerwin vega', 'infinity', 'boston acoustics'
    ];

    const text_lower = text.toLowerCase();
    
    for (const brand of brands) {
      if (text_lower.includes(brand)) {
        return brand;
      }
    }

    return null;
  }

  // Extract audio model information
  extractAudioModel(text) {
    // Look for model patterns common in audio equipment
    const modelPatterns = [
      /\b([A-Z]{2,}\d{2,})\b/g,        // Like "SL1200", "CDJ2000"
      /\b(\d{3,}[A-Z]*)\b/g,          // Like "1200", "2000MK2"
      /\b([A-Z]+\s?\d+[A-Z]*)\b/gi    // Like "SL 1200", "PM1"
    ];

    for (const pattern of modelPatterns) {
      const matches = text.match(pattern);
      if (matches && matches[0]) {
        return matches[0].toUpperCase();
      }
    }

    return null;
  }

  // Extract audio equipment type
  extractAudioType(objectType, title) {
    const typeMap = {
      'förstärkare': 'förstärkare',
      'amplifier': 'förstärkare',
      'receiver': 'receiver',
      'tuner': 'tuner',
      'radio': 'radio',
      'högtalare': 'högtalare',
      'speaker': 'högtalare',
      'skivspelare': 'skivspelare',
      'turntable': 'skivspelare',
      'cd': 'cd-spelare',
      'kassett': 'kassettspelare'
    };

    const text = `${objectType} ${title}`.toLowerCase();
    
    for (const [key, value] of Object.entries(typeMap)) {
      if (text.includes(key)) {
        return value;
      }
    }

    return objectType?.toLowerCase() || 'ljud';
  }

  // ==================== WATCH HANDLERS ====================

  // Check if item is watch/timepiece
  isWatchItem(objectType, title, description) {
    const watchKeywords = [
      'armbandsur', 'fickur', 'klocka', 'tidmätare', 'chronometer', 'stoppur',
      'watch', 'wristwatch', 'pocket watch', 'timepiece', 'chronograph',
      'väckarklocka', 'bordsur', 'väggur', 'golvur', 'mantelur', 'pendel'
    ];

    const text = `${objectType} ${title} ${description}`.toLowerCase();
    return watchKeywords.some(keyword => text.includes(keyword));
  }

  generateWatchSearch(objectType, title, description, artistInfo, baseTerms, baseConfidence) {
    console.log('⌚ Generating watch-specific search for:', title);
    
    // Extract components for watches
    const brand = this.extractWatchBrands(title + ' ' + description);
    const movement = this.extractWatchMovement(title + ' ' + description);
    const material = this.extractWatchMaterials(title + ' ' + description);
    const complications = this.extractWatchComplications(title + ' ' + description);
    const broadPeriod = this.searchTermExtractor.extractBroadPeriod(title + ' ' + description);

    // Build progressive search strategy - prioritize brand and type only
    const watchType = objectType.toLowerCase();
    let searchStrategy = 'watch_basic';
    let confidence = 0.6;
    let primarySearch = watchType;

    // Priority 1: Brand + Type (most important for watches)
    if (brand) {
      primarySearch = `${watchType} ${brand}`;
      confidence = 0.8;
      searchStrategy = 'watch_brand';
    } 
    // Priority 2: Material + Type (if no brand but has valuable material)
    else if (material) {
      if (material.includes('guld') || material.includes('gold') || material.includes('18k')) {
        primarySearch = `${watchType} guld`;
        confidence = 0.7;
        searchStrategy = 'watch_material';
      } else if (material.includes('silver')) {
        primarySearch = `${watchType} silver`;
        confidence = 0.65;
        searchStrategy = 'watch_material';
      } else if (material.includes('platina') || material.includes('platinum')) {
        primarySearch = `${watchType} platina`;
        confidence = 0.75;
        searchStrategy = 'watch_material';
      }
    }
    // Priority 3: Period + Type (fallback for vintage/antique)
    else if (broadPeriod) {
      primarySearch = `${watchType} ${broadPeriod}`;
      confidence = 0.6;
      searchStrategy = 'watch_period';
    }

    // Boost confidence for luxury complications
    if (complications.some(c => c.includes('chronograph') || c.includes('kalender') || c.includes('calendar') || c.includes('tourbillon'))) {
      confidence += 0.05;
    }

    const searchString = primarySearch;
    
    console.log('⌚ Watch search generated:', {
      brand,
      movement,
      material,
      complications,
      broadPeriod,
      finalSearch: searchString,
      strategy: searchStrategy,
      confidence: Math.min(confidence, 0.9)
    });

    return {
      searchTerms: searchString,
      confidence: Math.min(confidence, 0.9),
      strategy: searchStrategy,
      termCount: searchString.split(' ').length,
      hasArtist: false,
      isWatch: true
    };
  }

  // Extract watch brands
  extractWatchBrands(text) {
    const brands = [
      // Luxury Swiss brands
      'rolex', 'omega', 'patek philippe', 'audemars piguet', 'vacheron constantin',
      'jaeger-lecoultre', 'breitling', 'iwc', 'cartier', 'tudor', 'tag heuer',
      'longines', 'tissot', 'hamilton', 'oris', 'frederique constant',
      'ball', 'mido', 'certina', 'maurice lacroix', 'montblanc',
      
      // German brands
      'a. lange & söhne', 'glashütte original', 'nomos', 'sinn', 'stowa',
      'union glashütte', 'tutima', 'archimede', 'laco', 'damasko',
      
      // Japanese brands
      'seiko', 'citizen', 'casio', 'orient', 'grand seiko', 'credor',
      
      // Swedish/Nordic brands
      'lings', 'halda', 'svenska', 'nordiska', 'stockholm',
      
      // Vintage/Historical brands
      'zenith', 'universal genève', 'vulcain', 'movado', 'eterna',
      'chronoswiss', 'ebel', 'corum', 'baume & mercier', 'chopard',
      'hublot', 'panerai', 'bulgari', 'chanel', 'hermès', 'dior'
    ];

    const text_lower = text.toLowerCase();
    
    for (const brand of brands) {
      if (text_lower.includes(brand)) {
        return brand;
      }
    }

    return null;
  }

  // Extract watch movement information
  extractWatchMovement(text) {
    const movements = [
      'manuellt uppdrag', 'manuell', 'handuppdrag', 'manual winding',
      'automatisk', 'automatic', 'self-winding', 'självuppdrag',
      'quartz', 'kvarts', 'elektronisk', 'digital', 'analog',
      'kronometer', 'chronometer', 'certifierad', 'certified'
    ];

    const text_lower = text.toLowerCase();
    
    for (const movement of movements) {
      if (text_lower.includes(movement)) {
        return movement;
      }
    }

    return null;
  }

  // Extract watch materials
  extractWatchMaterials(text) {
    const materials = [
      'guld', 'gold', '18k', '14k', '9k', 'vitguld', 'rödguld', 'gulgul',
      'silver', 'sterling', 'platina', 'platinum', 'titan', 'titanium',
      'stål', 'steel', 'rostfritt', 'stainless', 'doublé', 'guldpläterad',
      'förgylld', 'gold-plated', 'pvd', 'dlc', 'keramik', 'ceramic',
      'kol', 'carbon', 'aluminium', 'bronze', 'messing', 'brass'
    ];

    const text_lower = text.toLowerCase();
    
    for (const material of materials) {
      if (text_lower.includes(material)) {
        return material;
      }
    }

    return null;
  }

  // Extract watch complications
  extractWatchComplications(text) {
    const complications = [
      'kalender', 'calendar', 'månfas', 'moon phase', 'chronograph',
      'stoppur', 'timer', 'världstid', 'worldtime', 'gmt', 'dual time',
      'alarm', 'väckare', 'repetition', 'minute repeater', 'tourbillon',
      'equation', 'annual calendar', 'perpetual calendar', 'rattrapante'
    ];

    const text_lower = text.toLowerCase();
    const found = [];
    
    for (const complication of complications) {
      if (text_lower.includes(complication)) {
        found.push(complication);
      }
    }
    
    return [...new Set(found)].slice(0, 2); // Max 2 complications
  }

  // ==================== MUSICAL INSTRUMENT HANDLERS ====================

  // Check if item is musical instrument
  isMusicalInstrument(objectType, title, description) {
    const instrumentKeywords = [
      'flygel', 'piano', 'pianino', 'klaver', 'keyboard',
      'violin', 'viola', 'cello', 'kontrabas', 'fiol', 'altfiol',
      'gitarr', 'guitar', 'banjo', 'mandolin', 'luta', 'harp', 'harpa',
      'flöjt', 'flute', 'klarinett', 'oboe', 'fagott', 'saxofon',
      'trumpet', 'kornett', 'trombon', 'tuba', 'horn',
      'orgel', 'harmonium', 'dragspel', 'accordion',
      'trummor', 'drums', 'cymbaler', 'timpani', 'xylofon'
    ];

    const text = `${objectType} ${title} ${description}`.toLowerCase();
    return instrumentKeywords.some(keyword => text.includes(keyword));
  }

  generateMusicalInstrumentSearch(objectType, title, description, artistInfo, baseTerms, baseConfidence) {
    console.log('🎵 Generating musical instrument search for:', title);
    
    const brand = this.extractInstrumentBrands(title + ' ' + description);
    const material = this.extractInstrumentMaterials(title + ' ' + description);
    const model = this.extractInstrumentModel(title + ' ' + description);
    const broadPeriod = this.searchTermExtractor.extractBroadPeriod(title + ' ' + description);
    const country = this.searchTermExtractor.extractGeographicTerms(title + ' ' + description);

    // Build search strategy for instruments
    const instrumentType = objectType.toLowerCase();
    let searchStrategy = 'instrument_basic';
    let confidence = 0.6;
    let primarySearch = instrumentType;

    // Priority 1: Brand + Type (critical for valuable instruments)
    if (brand) {
      primarySearch = `${instrumentType} ${brand}`;
      confidence = 0.85; // Instruments brands are very important
      searchStrategy = 'instrument_brand';
    }
    // Priority 2: Material + Type (wood type matters for violins etc.)
    else if (material) {
      primarySearch = `${instrumentType} ${material}`;
      confidence = 0.7;
      searchStrategy = 'instrument_material';
    }
    // Priority 3: Country + Type (German violins, Italian, etc.)
    else if (country && country.length > 0) {
      primarySearch = `${instrumentType} ${country[0]}`;
      confidence = 0.65;
      searchStrategy = 'instrument_country';
    }
    // Priority 4: Period + Type (vintage instruments)
    else if (broadPeriod) {
      primarySearch = `${instrumentType} ${broadPeriod}`;
      confidence = 0.6;
      searchStrategy = 'instrument_period';
    }

    const searchString = primarySearch;
    
    console.log('🎵 Instrument search generated:', {
      brand,
      material,
      model,
      broadPeriod,
      country,
      finalSearch: searchString,
      strategy: searchStrategy,
      confidence: Math.min(confidence, 0.9)
    });

    return {
      searchTerms: searchString,
      confidence: Math.min(confidence, 0.9),
      strategy: searchStrategy,
      termCount: searchString.split(' ').length,
      hasArtist: !!artistInfo,
      isInstrument: true
    };
  }

  // Extract instrument brands
  extractInstrumentBrands(text) {
    const brands = [
      // Piano brands
      'steinway', 'bösendorfer', 'fazioli', 'blüthner', 'bechstein',
      'yamaha', 'kawai', 'baldwin', 'mason & hamlin',
      
      // String instrument brands
      'stradivarius', 'guarneri', 'amati', 'bergonzi', 'montagnana',
      'vuillaume', 'mirecourt', 'mittenwald', 'czech', 'german',
      
      // Guitar brands
      'martin', 'gibson', 'fender', 'taylor', 'guild', 'ovation',
      'yamaha', 'takamine', 'larrivée', 'collings',
      
      // Wind instrument brands
      'selmer', 'buffet', 'leblanc', 'yanagisawa', 'keilwerth',
      'bach', 'conn', 'king', 'holton', 'getzen',
      
      // Accordion brands
      'hohner', 'victoria', 'excelsior', 'scandalli', 'bugari'
    ];

    const text_lower = text.toLowerCase();
    
    for (const brand of brands) {
      if (text_lower.includes(brand)) {
        return brand;
      }
    }

    return null;
  }

  // Extract instrument materials
  extractInstrumentMaterials(text) {
    const materials = [
      // Wood types
      'spruce', 'maple', 'ebony', 'rosewood', 'mahogany', 'cedar', 'walnut',
      'gran', 'lönn', 'ebenholz', 'rosenträ', 'mahogny', 'ceder', 'valnöt',
      
      // Metals
      'silver', 'gold', 'brass', 'bronze', 'copper', 'nickel',
      'silver', 'guld', 'mässing', 'brons', 'koppar', 'nickel',
      
      // Other materials
      'ivory', 'bone', 'plastic', 'carbon fiber',
      'elfenben', 'ben', 'plast', 'kolfiber'
    ];

    const text_lower = text.toLowerCase();
    
    for (const material of materials) {
      if (text_lower.includes(material)) {
        return material;
      }
    }

    return null;
  }

  // Extract instrument model information
  extractInstrumentModel(text) {
    // Look for model patterns in instrument names
    const modelPatterns = [
      /\b(model\s+\w+)\b/gi,
      /\b(\d{3,})\b/g,              // Like "280", "1000"
      /\b([A-Z]+\d+)\b/g,           // Like "D28", "J45"
      /\b(size\s+\d+\/\d+)\b/gi     // Like "size 4/4", "size 3/4"
    ];

    for (const pattern of modelPatterns) {
      const matches = text.match(pattern);
      if (matches && matches[0]) {
        return matches[0];
      }
    }

    return null;
  }
} 