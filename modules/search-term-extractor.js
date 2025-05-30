export class SearchTermExtractor {
  constructor() {
    // No state needed for pure extraction functions
  }

  // NEW: Extract jewelry-specific materials
  extractJewelryMaterials(text) {
    const materialPattern = /(?:(\d+k?\s*)?(?:guld|gold|vit-?guld|rött?-?guld|gul-?guld|ros[ée]-?guld|silver|sterlingsilver|sterling|platina|titan|stål|vitguld|rödguld|gulgul))/gi;
    const matches = text.match(materialPattern) || [];
    
    return matches
      .map(match => match.trim().toLowerCase())
      .filter((material, index, arr) => arr.indexOf(material) === index) // Remove duplicates
      .slice(0, 2); // Max 2 materials
  }

  // NEW: Extract weight information
  extractWeight(text) {
    const weightPattern = /(\d+[,.]?\d*)\s*(?:gram|g|karat|ct|dwt)/gi;
    const match = text.match(weightPattern);
    
    if (match && match[0]) {
      return match[0].toLowerCase().replace(/[,]/g, '.');
    }
    
    return null;
  }

  // NEW: Extract stone information
  extractStones(text) {
    const stonePattern = /(?:diamant|brilliant|smaragd|rubin|safir|pärla|pearl|onyx|opal|ametist|akvamarin|topas|granat|turmalin|kvarts|jade)/gi;
    const matches = text.match(stonePattern) || [];
    
    return matches
      .map(stone => stone.toLowerCase())
      .filter((stone, index, arr) => arr.indexOf(stone) === index)
      .slice(0, 2);
  }

  // NEW: Extract jewelry size information
  extractJewelrySize(text) {
    // Ring sizes
    const ringSizePattern = /(?:storlek|size)\s*[\/:]*\s*(\d+[,.]?\d*)/gi;
    const ringMatch = text.match(ringSizePattern);
    if (ringMatch) {
      return `storlek ${ringMatch[0].match(/\d+[,.]?\d*/)[0]}`;
    }
    
    // Diameter
    const diameterPattern = /(?:diameter|innerdiameter)\s*(\d+[,.]?\d*)\s*(?:mm|cm)/gi;
    const diameterMatch = text.match(diameterPattern);
    if (diameterMatch) {
      return `diameter ${diameterMatch[0].match(/\d+[,.]?\d*/)[0]}mm`;
    }
    
    // Chain length
    const lengthPattern = /(?:längd|length)\s*(\d+[,.]?\d*)\s*(?:mm|cm)/gi;
    const lengthMatch = text.match(lengthPattern);
    if (lengthMatch) {
      return `längd ${lengthMatch[0].match(/\d+[,.]?\d*/)[0]}cm`;
    }
    
    return null;
  }

  // NEW: Extract descriptive terms specifically from the title (higher priority than materials)
  extractTitleDescriptors(title) {
    const descriptors = [];
    const titleLower = title.toLowerCase();
    
    // Common rug/carpet descriptors
    const rugDescriptors = [
      'orientalisk', 'persisk', 'antik', 'vintage', 'handknuten', 'handvävd',
      'kilim', 'gabbeh', 'tabriz', 'isfahan', 'kashan', 'nain', 'qom', 'heriz',
      'bidjar', 'shiraz', 'turkisk', 'kaukasisk', 'tibetansk', 'indisk',
      'bokhara', 'afghanistan', 'beluch', 'turkmen'
    ];
    
    // Art-related descriptors
    const artDescriptors = [
      'abstrakt', 'figurativ', 'landskap', 'porträtt', 'stilleben', 'marin', 
      'genre', 'religiös', 'mytologisk', 'allegorisk', 'historisk'
    ];
    
    // Furniture descriptors  
    const furnitureDescriptors = [
      'antik', 'vintage', 'retro', 'modern', 'samtida', 'neoklassisk',
      'empire', 'biedermeier', 'jugend', 'art deco', 'skandinavisk',
      'gustaviansk', 'karl johan', 'louis', 'chippendale', 'sheraton'
    ];
    
    // Porcelain/ceramics descriptors
    const porcelainDescriptors = [
      'porslin', 'fajans', 'stengods', 'lergods', 'keramik', 'benporslin',
      'hårdporslin', 'mjukporslin'
    ];
    
    // Glass descriptors
    const glassDescriptors = [
      'kristall', 'optisk', 'slipat', 'graverat', 'etsat', 'målat',
      'färgat', 'klart', 'frostat', 'iriserat'
    ];
    
    // NEW: Model/toy/collectible descriptors
    const modelDescriptors = [
      'modellbilar', 'modellauto', 'miniatyr', 'samlarobjekt', 'vintage',
      'diecast', 'leksaksbilar', 'racing', 'formel', 'sportvagn', 'limousine',
      'lastbil', 'buss', 'motorcykel', 'flygplan', 'helikopter', 'båt',
      'tåg', 'lokomotiv', 'traktor', 'grävmaskin', 'brandkår', 'polis',
      'ambulans', 'militär', 'ferrari', 'porsche', 'mercedes', 'bmw',
      'audi', 'volvo', 'saab', 'ford', 'chevrolet', 'jaguar', 'bentley',
      'rolls-royce', 'lamborghini', 'maserati', 'alfa romeo', 'fiat',
      'opel', 'volkswagen', 'toyota', 'honda', 'nissan', 'mazda',
      'tekno', 'dinky', 'corgi', 'hot wheels', 'matchbox', 'bburago',
      'autoart', 'minichamps', 'kyosho', 'spark', 'neo', 'avenue43'
    ];
    
    // Scale descriptors for models
    const scaleDescriptors = [
      '1:43', '1:32', '1:24', '1:18', '1:12', '1:87', 'h0', 'n-skala',
      'skala', 'scale', 'spur'
    ];
    
    // Combine all descriptor lists
    const allDescriptors = [
      ...rugDescriptors,
      ...artDescriptors,
      ...furnitureDescriptors, 
      ...porcelainDescriptors,
      ...glassDescriptors
    ];
    
    // Extract descriptors that appear in title
    allDescriptors.forEach(descriptor => {
      if (titleLower.includes(descriptor)) {
        descriptors.push(descriptor);
      }
    });
    
    // Also look for numbered items (e.g., "3 st", "ett par")
    const quantityMatch = titleLower.match(/(\d+\s*st|ett\s*par|par)/);
    if (quantityMatch) {
      // For numbered items, the descriptor might be less important
      // but we still want to capture it for context
    }
    
    return descriptors.slice(0, 2); // Max 2 descriptors from title
  }

  // Helper method to extract materials from text
  extractMaterials(text) {
    const materials = [];
    const materialPatterns = [
      // Metals
      'silver', 'guld', 'brons', 'koppar', 'mässing', 'tenn', 'järn', 'stål', 'platina',
      // Glass and ceramics
      'glas', 'kristall', 'porslin', 'keramik', 'lergods', 'stengods', 'fajans',
      // Wood
      'trä', 'ek', 'björk', 'furu', 'mahogny', 'valnöt', 'teak', 'bok', 'ask', 'lönn',
      // Textiles
      'tyg', 'sammet', 'siden', 'ull', 'bomull', 'lin', 'läder',
      // Stone
      'marmor', 'granit', 'kalksten', 'sandsten',
      // Other materials
      'plast', 'gummi', 'papper', 'kartong',
      // NEW: Model/toy materials
      'resin', 'metall', 'diecast', 'zink', 'zamak', 'vitmetall', 'aluminium',
      'vinyl', 'pvc', 'abs', 'polyresin', 'pewter'
    ];
    
    materialPatterns.forEach(material => {
      // Use word boundary matching to avoid false positives like "ek" in "dekor"
      const wordBoundaryPattern = new RegExp(`\\b${material}\\b`, 'i');
      if (wordBoundaryPattern.test(text)) {
        materials.push(material);
      }
    });
    
    return materials.slice(0, 2); // Max 2 materials
  }

  // Helper method to extract periods from text
  extractPeriods(text) {
    const periods = [];
    const periodPatterns = [
      /(\d{4})/g,                    // 1950
      /(\d{2,4}-tal)/g,              // 1900-tal
      /(\d{2}\/\d{4}-tal)/g,         // 17/1800-tal
      /(1[6-9]\d{2})/g,              // 1600-1999
      /(20[0-2]\d)/g                 // 2000-2029
    ];
    
    periodPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        periods.push(...matches.slice(0, 1)); // Max 1 period
      }
    });
    
    return periods;
  }

  // NEW: Extract colors from text (important for market matching)
  extractColors(text) {
    const colors = [];
    const colorPatterns = [
      // Basic colors
      'röd', 'blå', 'grön', 'gul', 'svart', 'vit', 'brun', 'grå', 'rosa', 'lila', 'orange',
      // Color variations
      'rött', 'blått', 'grönt', 'gult', 'brunt', 'grått', 'rosig', 'ljus', 'mörk',
      // Specific shades
      'marinblå', 'turkos', 'beige', 'elfenben', 'krämvit', 'pastellblå', 'djupblå',
      'smaragdgrön', 'mörkgrön', 'ljusgrön', 'bordeaux', 'vinröd', 'roströd', 'tegelröd',
      'guldgul', 'citrongul', 'solgul', 'chokladbrun', 'kastanjebrun', 'nötbrun',
      'silvergrå', 'stålgrå', 'askgrå', 'antracit', 'kol', 'krita', 'snövit',
      // Color combinations and patterns
      'flerfärgad', 'blandade färger', 'färgglad', 'färgrik', 'monokrom', 'tvåfärgad',
      // Special color terms
      'naturell', 'ofärgad', 'transparent', 'genomskinlig', 'opak', 'matt', 'blank',
      'metallic', 'glittrande', 'skimrande', 'iriserade'
    ];
    
    colorPatterns.forEach(color => {
      // Use word boundary matching to avoid false positives
      const wordBoundaryPattern = new RegExp(`\\b${color}\\b`, 'i');
      if (wordBoundaryPattern.test(text)) {
        colors.push(color);
      }
    });
    
    return colors.slice(0, 2); // Max 2 colors to keep searches focused
  }

  // Helper method to extract styles from text
  extractStyles(text) {
    const styles = [];
    const stylePatterns = [
      'art deco', 'jugend', 'funktionalism', 'bauhaus', 'modernism',
      'klassicism', 'empire', 'gustaviansk', 'rokoko', 'barock',
      'skandinavisk', 'svensk', 'dansk', 'norsk', 'finsk',
      'minimalistisk', 'rustik', 'lantlig', 'elegant'
    ];
    
    stylePatterns.forEach(style => {
      if (text.includes(style)) {
        styles.push(style);
      }
    });
    
    return styles.slice(0, 1); // Max 1 style
  }

  // Helper method to extract techniques from text
  extractTechniques(text) {
    const techniques = [];
    const techniquePatterns = [
      'handmålad', 'handgjord', 'maskingjord', 'pressad', 'gjuten', 'svarv',
      'intarsia', 'fanér', 'massiv', 'laminerad', 'slipad', 'graverad',
      'emaljerad', 'förgylld', 'försilvrad', 'patinerad', 'polerad'
    ];
    
    techniquePatterns.forEach(technique => {
      if (text.includes(technique)) {
        techniques.push(technique);
      }
    });
    
    return techniques.slice(0, 1); // Max 1 technique
  }

  // Helper method to extract makers/manufacturers (not luxury brands)
  extractMakers(text) {
    const makers = [];
    const makerPatterns = [
      // Swedish manufacturers
      'kockums', 'husqvarna', 'electrolux', 'ericsson', 'volvo',
      'saab', 'scania', 'sandvik', 'atlas copco',
      // International manufacturers
      'philips', 'siemens', 'bosch', 'braun', 'sony', 'panasonic',
      'general electric', 'westinghouse', 'kodak', 'leica',
      // Toy manufacturers
      'lego', 'brio', 'meccano', 'dinky toys', 'corgi', 'tekno',
      // Clock manufacturers
      'westclox', 'sessions', 'ansonia', 'waterbury', 'ingraham'
    ];
    
    makerPatterns.forEach(maker => {
      if (text.includes(maker)) {
        makers.push(maker);
      }
    });
    
    return makers.slice(0, 1); // Max 1 maker
  }

  // Extract broad period information
  extractBroadPeriod(text) {
    const periodTerms = [];
    const text_lower = text.toLowerCase();
    
    // Look for broad period terms
    const broadPeriods = [
      'antik', 'vintage', 'retro', 'modern', 'samtida', 'contemporary',
      'medeltidens', 'renässans', 'barock', 'rokoko', 'klassicism', 
      'empire', 'viktoriansk', 'edwardiansk', 'art nouveau', 'art deco',
      'funktionalism', 'bauhaus', 'modernism', 'postmodern'
    ];
    
    broadPeriods.forEach(period => {
      if (text_lower.includes(period)) {
        periodTerms.push(period);
      }
    });
    
    // Look for century references
    const centuryPattern = /(\d{1,2}):?(?:a|e|te|de)?\s*århundradet?/gi;
    const centuryMatches = text.match(centuryPattern);
    if (centuryMatches) {
      periodTerms.push(...centuryMatches.slice(0, 1));
    }
    
    // Look for specific decade references
    const decadePattern = /(\d{4})-?talet/gi;
    const decadeMatches = text.match(decadePattern);
    if (decadeMatches) {
      periodTerms.push(...decadeMatches.slice(0, 1));
    }
    
    return periodTerms.slice(0, 2);
  }

  // Extract manufacturers/producers
  extractManufacturers(text) {
    const manufacturers = [];
    const text_lower = text.toLowerCase();
    
    // Audio/electronics manufacturers
    const audioManufacturers = [
      'technics', 'pioneer', 'marantz', 'yamaha', 'denon', 'onkyo',
      'harman kardon', 'jbl', 'bang & olufsen', 'b&o', 'linn', 'naim',
      'mcintosh', 'mark levinson', 'krell', 'conrad johnson',
      'audio research', 'cj walker', 'quad', 'mission', 'kef',
      'bowers & wilkins', 'b&w', 'monitor audio', 'paradigm',
      'polk audio', 'klipsch', 'cerwin vega', 'infinity', 'boston acoustics'
    ];
    
    // General manufacturers
    const generalManufacturers = [
      'philips', 'sony', 'panasonic', 'hitachi', 'toshiba', 'sharp',
      'lg', 'samsung', 'grundig', 'telefunken', 'siemens', 'aeg',
      'bosch', 'braun', 'krups', 'moulinex', 'tefal', 'rowenta',
      'electrolux', 'zanussi', 'whirlpool', 'miele', 'gaggenau'
    ];
    
    const allManufacturers = [...audioManufacturers, ...generalManufacturers];
    
    allManufacturers.forEach(manufacturer => {
      if (text_lower.includes(manufacturer)) {
        manufacturers.push(manufacturer);
      }
    });
    
    return manufacturers.slice(0, 2);
  }

  // Extract geographic terms
  extractGeographicTerms(text) {
    const geographic = [];
    const text_lower = text.toLowerCase();
    
    // Countries
    const countries = [
      'sverige', 'swedish', 'skandinavisk', 'nordic', 'denmark', 'dansk', 
      'norway', 'norsk', 'finland', 'finsk', 'iceland', 'isländsk',
      'tyskland', 'german', 'tysk', 'frankrike', 'french', 'fransk',
      'italien', 'italian', 'italiensk', 'spanien', 'spansk', 'spanish',
      'england', 'english', 'engelsk', 'brittisk', 'british',
      'usa', 'american', 'amerikansk', 'japan', 'japanese', 'japansk',
      'kina', 'chinese', 'kinesisk', 'ryssland', 'rysk', 'russian',
      'österrike', 'austrian', 'österrikisk', 'schweiz', 'swiss',
      'holland', 'nederländsk', 'dutch', 'belgien', 'belgisk'
    ];
    
    // Regions and cities
    const regions = [
      'europa', 'asien', 'amerika', 'afrika', 'oceanien',
      'småland', 'dalarna', 'skåne', 'göteborg', 'stockholm', 'malmö',
      'köpenhamn', 'oslo', 'helsinki', 'reykjavik',
      'london', 'paris', 'berlin', 'rome', 'madrid', 'vienna',
      'zürich', 'amsterdam', 'brussels', 'prague', 'budapest',
      'new york', 'california', 'texas', 'chicago', 'boston',
      'tokyo', 'kyoto', 'osaka', 'beijing', 'shanghai', 'hong kong'
    ];
    
    const allGeographic = [...countries, ...regions];
    
    allGeographic.forEach(location => {
      if (text_lower.includes(location)) {
        geographic.push(location);
      }
    });
    
    return geographic.slice(0, 2);
  }

  // Extract cultural terms
  extractCulturalTerms(text) {
    const cultural = [];
    const text_lower = text.toLowerCase();
    
    // Cultural movements and styles
    const culturalTerms = [
      'bauhaus', 'art deco', 'art nouveau', 'jugend', 'sezession',
      'funktionalism', 'modernism', 'postmodernism', 'minimalism',
      'expressionism', 'impressionism', 'cubism', 'surrealism',
      'dadaism', 'futurism', 'constructivism', 'suprematism',
      'pop art', 'op art', 'conceptual art', 'abstract expressionism',
      
      // Design movements
      'memphis', 'de stijl', 'wiener werkstätte', 'arts and crafts',
      'gothic revival', 'neoclassicism', 'romanticism', 'realism',
      
      // Cultural periods
      'medieval', 'renaissance', 'baroque', 'rococo', 'romantic',
      'victorian', 'edwardian', 'georgian', 'regency',
      
      // Regional styles
      'scandinavian modern', 'danish modern', 'mid-century modern',
      'hollywood regency', 'french provincial', 'english country',
      'tuscan', 'mediterranean', 'colonial', 'shaker', 'mission'
    ];
    
    culturalTerms.forEach(term => {
      if (text_lower.includes(term)) {
        cultural.push(term);
      }
    });
    
    return cultural.slice(0, 2);
  }

  // Format brand name for consistent presentation
  formatBrandName(brand) {
    // Handle special cases
    const specialCases = {
      'georg jensen': 'Georg Jensen',
      'royal copenhagen': 'Royal Copenhagen',
      'bing & grøndahl': 'Bing & Grøndahl',
      'kosta boda': 'Kosta Boda',
      'patek philippe': 'Patek Philippe',
      'audemars piguet': 'Audemars Piguet',
      'vacheron constantin': 'Vacheron Constantin',
      'jaeger-lecoultre': 'Jaeger-LeCoultre',
      'tag heuer': 'TAG Heuer',
      'van cleef': 'Van Cleef & Arpels',
      'harry winston': 'Harry Winston',
      'louis vuitton': 'Louis Vuitton',
      'yves saint laurent': 'Yves Saint Laurent',
      'bottega veneta': 'Bottega Veneta',
      'carl malmsten': 'Carl Malmsten',
      'bruno mathsson': 'Bruno Mathsson',
      'herman miller': 'Herman Miller',
      'fritz hansen': 'Fritz Hansen',
      'svenskt tenn': 'Svenskt Tenn',
      'norrlands möbler': 'Norrlands Möbler'
    };
    
    if (specialCases[brand.toLowerCase()]) {
      return specialCases[brand.toLowerCase()];
    }
    
    // Default capitalization for other brands
    return brand.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
} 