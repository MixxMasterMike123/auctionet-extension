/**
 * Quality Rules Engine - SSoT Component
 * Extracted from quality-analyzer.js
 * Contains pure validation logic: measurement checks, quality scoring,
 * data quality assessment. No side effects beyond DOM checkbox reads.
 */
export class QualityRulesEngine {
  constructor() {
    // No dependencies — pure validation logic
  }

  /**
   * Run all validation rules on item data and return warnings + score.
   * This is the core logic extracted from analyzeQuality().
   * @param {Object} data - Item data from DataExtractor
   * @returns {{ warnings: Array, score: number }}
   */
  runValidationRules(data) {
    const warnings = [];
    let score = 100;

    // --- Bevakningspris vs Värdering validation ---
    const estimateVal = parseFloat(data.estimate);
    const reserveVal = parseFloat(data.reserve || data.acceptedReserve);
    if (estimateVal > 0 && reserveVal > 0) {
      if (reserveVal >= estimateVal) {
        warnings.push({
          field: 'Värdering',
          issue: `Bevakningspris (${reserveVal} SEK) får aldrig vara lika med eller överstiga värdering (${estimateVal} SEK)`,
          severity: 'high',
          source: 'faq',
          fieldId: 'item_current_auction_attributes_estimate'
        });
        score -= 20;
      }
    }

    // Check if "Inga anmärkningar" is checked
    let noRemarksChecked = false;
    try {
      noRemarksChecked = this.isNoRemarksChecked();
    } catch (error) {
      // Optional checkbox - no logging needed
    }

    // Title quality checks
    if (data.title.length < 14) {
      warnings.push({ field: 'Titel', issue: 'Överväg att lägga till material och period', severity: 'medium' });
      score -= 15;
    }
    if (!data.title.includes(',')) {
      warnings.push({ field: 'Titel', issue: 'Saknar korrekt struktur (KONSTNÄR, Objekt, Material)', severity: 'medium' });
      score -= 15;
    }

    // Check for unknown/unidentified artist phrases in title or description that belong in the artist field
    const unknownArtistPhrases = [
      'oidentifierad konstnär', 'okänd konstnär', 'okänd mästare',
      'oidentifierad formgivare', 'okänd formgivare', 'oidentifierad upphovsman'
    ];
    const hasArtistFieldFilled = data.artist && data.artist.trim().length > 0;
    if (!hasArtistFieldFilled) {
      const titleLower = data.title.toLowerCase();
      const descLower = (data.description || '').replace(/<[^>]*>/g, '').toLowerCase();
      const matchedPhrase = unknownArtistPhrases.find(p => titleLower.includes(p) || descLower.includes(p));
      if (matchedPhrase) {
        const foundIn = titleLower.includes(matchedPhrase) ? 'titel' : 'beskrivning';
        const displayPhrase = matchedPhrase.charAt(0).toUpperCase() + matchedPhrase.slice(1);
        warnings.push({
          field: 'Konstnär',
          issue: `Konstnärsterm hittades i ${foundIn} — välj rätt term för konstnärsfältet`,
          severity: 'high',
          source: 'faq',
          fieldId: 'item_title_sv',
          isUnknownArtistWarning: true,
          unknownArtistPhrase: matchedPhrase,
          unknownArtistDisplay: displayPhrase,
          dataAttributes: { 'data-unknown-artist-warning': 'true' }
        });
        score -= 10;
      }
    }

    // Check title capitalization based on artist field
    if (data.title && data.title.length > 0) {
      let firstLetterIndex = -1;
      let firstLetter = '';

      for (let i = 0; i < data.title.length; i++) {
        const char = data.title.charAt(i);
        if (/[A-ZÅÄÖÜa-zåäöü]/.test(char)) {
          firstLetterIndex = i;
          firstLetter = char;
          break;
        }
      }

      if (firstLetterIndex >= 0) {
        const hasArtist = data.artist && data.artist.trim().length > 0;
        if (hasArtist && firstLetter === firstLetter.toLowerCase()) {
          warnings.push({
            field: 'Titel',
            issue: 'Titel ska börja med versal när konstnärsfält är ifyllt',
            severity: 'medium'
          });
          score -= 15;
        }
      }
    }

    // Description quality checks
    const descLength = data.description.replace(/<[^>]*>/g, '').length;
    if (descLength < 35) {
      warnings.push({ field: 'Beskrivning', issue: 'Överväg att lägga till detaljer om material, teknik, färg, märkningar', severity: 'medium' });
      score -= 20;
    }
    if (!this.hasMeasurements(data.description)) {
      warnings.push({ field: 'Beskrivning', issue: 'Mått skulle förbättra beskrivningen', severity: 'low' });
      score -= 10;
    }

    // CONDITION QUALITY CHECKS
    if (!noRemarksChecked) {
      const condLength = data.condition.replace(/<[^>]*>/g, '').length;
      const conditionText = data.condition.toLowerCase();

      const isUnexaminedFramed = /ej\s+examinerad\s+ur\s+ram/i.test(conditionText);

      if (isUnexaminedFramed) {
        warnings.push({ field: 'Kondition', issue: '✓ "Ej examinerad ur ram" - indikerar mycket gott skick så långt synligt', severity: 'low' });
      } else {
        if (condLength < 25) {
          warnings.push({ field: 'Kondition', issue: 'Konditionsbeskrivning bör vara mer detaljerad för kundernas trygghet', severity: 'high' });
          score -= 20;
        }

        if (data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) {
          warnings.push({ field: 'Kondition', issue: 'Endast "bruksslitage" är otillräckligt - specificera typ av slitage (repor, nagg, fläckar, etc.)', severity: 'high' });
          score -= 35;
        }

        const vaguePhrases = ['normalt slitage', 'vanligt slitage', 'åldersslitage', 'slitage förekommer'];
        const hasVaguePhrase = vaguePhrases.some(phrase => conditionText.includes(phrase));

        if (hasVaguePhrase && condLength < 40) {
          warnings.push({ field: 'Kondition', issue: 'Vaga termer som "normalt slitage" - överväg att specificera typ av skador och placering', severity: 'medium' });
          score -= 20;
        }

        const hasLocationInfo = /\b(vid|på|längs|i|under|över|runt|omkring)\s+(fot|kant|ovansida|undersida|sida|hörn|mitt|centrum|botten|topp|fram|bak|insida|utsida)/i.test(conditionText);
        if (condLength > 25 && !hasLocationInfo && !conditionText.includes('genomgående') && !conditionText.includes('överallt') && hasVaguePhrase) {
          warnings.push({ field: 'Kondition', issue: 'Tips: Ange var skadorna finns för tydligare beskrivning', severity: 'low' });
          score -= 10;
        }
      }
    } else {
      warnings.push({ field: 'Kondition', issue: '✓ "Inga anmärkningar" markerat - ingen konditionsrapport behövs', severity: 'low' });
    }

    // Keywords quality checks
    const keywordsLength = data.keywords.length;
    const keywordCount = data.keywords ?
      (data.keywords.includes(',') ?
        data.keywords.split(',').filter(k => k.trim().length > 0).length :
        data.keywords.split(/\s+/).filter(k => k.trim().length > 0).length
      ) : 0;

    if (keywordsLength === 0) {
      warnings.push({ field: 'Sökord', issue: 'Inga dolda sökord - kritiskt för sökbarhet', severity: 'high' });
      score -= 30;
    } else if (keywordCount < 2) {
      warnings.push({ field: 'Sökord', issue: 'För få sökord - lägg till fler relevanta termer', severity: 'high' });
      score -= 20;
    } else if (keywordCount < 5) {
      warnings.push({ field: 'Sökord', issue: 'Bra start - några fler sökord kan förbättra sökbarheten', severity: 'medium' });
      score -= 10;
    } else if (keywordCount > 15) {
      warnings.push({ field: 'Sökord', issue: 'För många sökord kan skada sökbarheten - fokusera på kvalitet över kvantitet', severity: 'medium' });
      score -= 15;
    }

    // Check keyword quality
    if (data.keywords) {
      const keywords = data.keywords.toLowerCase();
      const titleDesc = (data.title + ' ' + data.description + ' ' + data.condition).toLowerCase();

      const keywordArray = data.keywords.includes(',') ?
        data.keywords.split(',').map(k => k.trim()).filter(k => k.length > 0) :
        data.keywords.split(/\s+/).map(k => k.trim()).filter(k => k.length > 0);

      const uniqueKeywords = keywordArray.filter(keyword => {
        const normalizedKeyword = keyword.toLowerCase().replace(/-/g, ' ');
        return !titleDesc.includes(normalizedKeyword) &&
          !titleDesc.includes(keyword.toLowerCase()) &&
          keyword.length > 2;
      });

      const uniquePercentage = keywordArray.length > 0 ? uniqueKeywords.length / keywordArray.length : 0;

      if (uniquePercentage < 0.2 && keywordArray.length > 3) {
        warnings.push({ field: 'Sökord', issue: 'Tips: Många sökord upprepar titel/beskrivning - kompletterande termer kan förbättra sökbarheten', severity: 'low' });
      }
    }

    // === FAQ GUIDELINE VALIDATION RULES ===
    const category = (data.category || '').toLowerCase();
    const titleLower = data.title.toLowerCase();
    const descPlain = data.description.replace(/<[^>]*>/g, '');
    const descLower = descPlain.toLowerCase();
    const condPlain = data.condition.replace(/<[^>]*>/g, '');
    const condLower = condPlain.toLowerCase();

    // --- Furniture: wood type in title ---
    const woodRegex = (w) => new RegExp(`\\b${w}(fanér|fanerad|trä)?\\b`, 'i');

    if (category.includes('möbler')) {
      const woodTypes = ['furu', 'ek', 'björk', 'mahogny', 'teak', 'valnöt', 'alm', 'ask',
        'bok', 'tall', 'lönn', 'körsbär', 'palisander', 'jakaranda', 'rosewood',
        'bambu', 'rotting', 'ceder', 'cypress', 'gran', 'lärk', 'poppel', 'avenbok',
        'betsad', 'betsat', 'lackad', 'lackerat', 'fanér', 'fanerad'];
      const foundWood = woodTypes.find(w => woodRegex(w).test(data.title));
      if (foundWood) {
        warnings.push({ field: 'Titel', issue: `Möbler: "${foundWood}" (träslag/material) bör inte stå i titeln — flytta till beskrivningen`, severity: 'medium', source: 'faq', fieldId: 'item_title_sv' });
        score -= 10;
      }

      const allWoodTypes = ['furu', 'ek', 'björk', 'mahogny', 'teak', 'valnöt', 'alm', 'ask',
        'bok', 'tall', 'lönn', 'körsbär', 'palisander', 'jakaranda', 'rosewood',
        'bambu', 'rotting', 'ceder', 'cypress', 'gran', 'lärk', 'poppel', 'avenbok',
        'fanér', 'fanerad', 'massiv', 'trä'];
      const woodInTitle = allWoodTypes.some(w => woodRegex(w).test(data.title));
      const woodInDesc = allWoodTypes.some(w => woodRegex(w).test(descPlain));
      if (!woodInTitle && !woodInDesc) {
        warnings.push({ field: 'Beskrivning', issue: 'Möbler: Träslag/material saknas — välj nedan eller ange manuellt:', severity: 'medium', source: 'faq', fieldId: 'item_description_sv', woodTypeSuggestion: true });
        score -= 8;
      }
    }

    // --- Rugs: measurements must be in title ---
    if (category.includes('matta') || category.includes('mattor')) {
      if (!this.hasMeasurements(data.title)) {
        warnings.push({ field: 'Titel', issue: 'Mattor: Mått ska alltid anges i titeln', severity: 'medium', source: 'faq', fieldId: 'item_title_sv' });
        score -= 10;
      }
    }

    // --- Art: condition must not say "bruksslitage" ---
    if (category.includes('konst') || category.includes('tavl') || category.includes('målning') ||
        category.includes('grafik') || category.includes('litografi')) {
      if (/bruksslitage/i.test(condPlain)) {
        warnings.push({ field: 'Kondition', issue: 'Konst: Använd "sedvanligt slitage" istället för "bruksslitage" — konst brukas inte', severity: 'high', source: 'faq', fieldId: 'item_condition_sv' });
        score -= 15;
      }
    }

    // --- Silver: weight should be in title ---
    if (category.includes('silver') && !category.includes('smycke')) {
      const hasWeight = /\b\d+\s*(gram|g)\b/i.test(data.title) ||
        /\b(bruttovikt|nettovikt|vikt)\s*(ca\.?\s*)?\d+/i.test(data.title);
      if (!hasWeight) {
        warnings.push({ field: 'Titel', issue: 'Silver: Vikt bör anges sist i titeln', severity: 'low', source: 'faq', fieldId: 'item_title_sv' });
        score -= 5;
      }
    }

    // --- Dinner sets: "st" after numbers in description ---
    if (category.includes('servis')) {
      if (/\b\d+\s+st\b/i.test(descPlain)) {
        warnings.push({ field: 'Beskrivning', issue: 'Serviser: Skriv "34 tallrikar" inte "34 st tallrikar"', severity: 'medium', source: 'faq', fieldId: 'item_description_sv' });
        score -= 5;
      }
    }

    // --- General: compound object+material words in title ---
    const compoundWords = {
      'majolikavas': 'VAS, majolika', 'glasvas': 'VAS, glas', 'keramikvas': 'VAS, keramik',
      'silverring': 'RING, silver', 'guldring': 'RING, guld', 'silverkedja': 'KEDJA, silver',
      'kristallvas': 'VAS, kristall', 'porslinsvas': 'VAS, porslin', 'keramiktomte': 'TOMTE, keramik',
      'mässingsljusstake': 'LJUSSTAKE, mässing', 'tennmugg': 'MUGG, tenn'
    };
    for (const [compound, suggestion] of Object.entries(compoundWords)) {
      if (titleLower.includes(compound)) {
        warnings.push({ field: 'Titel', issue: `Sammansatt ord: "${data.title.match(new RegExp(compound, 'i'))?.[0]}" bör skrivas "${suggestion}"`, severity: 'medium', source: 'faq', fieldId: 'item_title_sv' });
        score -= 5;
        break;
      }
    }

    // --- General: "Sterling Silver" should be "sterlingsilver" ---
    const sterlingPattern = /\bsterling\s+silver\b/i;
    const sterlingTitleMatch = data.title.match(sterlingPattern);
    const sterlingDescMatch = descPlain.match(sterlingPattern);
    if (sterlingTitleMatch) {
      warnings.push({ field: 'Titel', issue: `"${sterlingTitleMatch[0]}" ska skrivas som ett ord: "sterlingsilver"`, severity: 'medium', source: 'faq', fieldId: 'item_title_sv' });
      score -= 5;
    }
    if (sterlingDescMatch) {
      warnings.push({ field: 'Beskrivning', issue: `"${sterlingDescMatch[0]}" ska skrivas som ett ord: "sterlingsilver"`, severity: 'medium', source: 'faq', fieldId: 'item_description_sv' });
      score -= 5;
    }

    // --- General: "ca" before year ---
    if (/\bca\.?\s+\d{4}\b/.test(data.title) || /\bca\.?\s+\d{4}\b/.test(descPlain)) {
      const fieldId = /\bca\.?\s+\d{4}\b/.test(data.title) ? 'item_title_sv' : 'item_description_sv';
      const fieldName = fieldId === 'item_title_sv' ? 'Titel' : 'Beskrivning';
      warnings.push({ field: fieldName, issue: 'Använd "omkring" istället för "ca" framför årtal', severity: 'low', source: 'faq', fieldId });
      score -= 3;
    }

    // --- General: common abbreviations ---
    const allText = data.title + ' ' + descPlain + ' ' + condPlain;
    if (/\bbl\.?\s*a\b/i.test(allText)) {
      warnings.push({ field: 'Beskrivning', issue: 'Skriv "bland annat" istället för "bl a" — förkortningar försvårar översättning', severity: 'low', source: 'faq', fieldId: 'item_description_sv' });
      score -= 3;
    }
    if (/\bosv\b/i.test(allText)) {
      warnings.push({ field: 'Beskrivning', issue: 'Skriv "och så vidare" istället för "osv" — förkortningar försvårar översättning', severity: 'low', source: 'faq', fieldId: 'item_description_sv' });
      score -= 3;
    }

    // --- General: vague period/century expressions ---
    const bareCenturyPattern = /\b(\d{2})00-tal\.?\b/i;
    const titleCenturyMatch = data.title.match(bareCenturyPattern);
    const descCenturyMatch = descPlain.match(bareCenturyPattern);
    if (titleCenturyMatch) {
      const century = titleCenturyMatch[1];
      warnings.push({ field: 'Titel', issue: `"${titleCenturyMatch[0]}" omfattar 100 år — ange decennium om möjligt (t.ex. "${century}20-tal" eller "${century}50-tal")`, severity: 'low', source: 'faq', fieldId: 'item_title_sv' });
      score -= 5;
    }
    if (descCenturyMatch && !titleCenturyMatch) {
      const century = descCenturyMatch[1];
      warnings.push({ field: 'Beskrivning', issue: `"${descCenturyMatch[0]}" omfattar 100 år — ange decennium om möjligt (t.ex. "${century}20-tal" eller "${century}50-tal")`, severity: 'low', source: 'faq', fieldId: 'item_description_sv' });
      score -= 5;
    }

    const vagueperiodPattern = /\d{4}-talets\s+(första|andra|senare)\s+del\b/i;
    const titlePeriodMatch = data.title.match(vagueperiodPattern);
    const descPeriodMatch = descPlain.match(vagueperiodPattern);
    if (titlePeriodMatch) {
      warnings.push({ field: 'Titel', issue: `"${titlePeriodMatch[0]}" är för vagt — ange "senare fjärdedel", "senare hälft", "slut" eller specifikt decennium`, severity: 'low', source: 'faq', fieldId: 'item_title_sv' });
      score -= 3;
    }
    if (descPeriodMatch) {
      warnings.push({ field: 'Beskrivning', issue: `"${descPeriodMatch[0]}" är för vagt — ange "senare fjärdedel", "senare hälft", "slut" eller specifikt decennium`, severity: 'low', source: 'faq', fieldId: 'item_description_sv' });
      score -= 3;
    }

    // --- General: vague condition text with clickable suggestions ---
    if (!noRemarksChecked) {
      const hasBruksslitage = /bruksslitage/i.test(condPlain);
      const vagueOnlyTerms = ['normalt slitage', 'vanligt slitage', 'åldersslitage', 'slitage förekommer'];
      const hasOtherVague = vagueOnlyTerms.some(term => condLower.includes(term)) && condPlain.length < 40;

      if (hasBruksslitage) {
        warnings.push({
          field: 'Kondition',
          issue: 'Byt ut "bruksslitage" mot en specifik term:',
          severity: 'medium',
          source: 'faq',
          fieldId: 'item_condition_sv',
          vagueCondition: true,
          inlineReplace: 'bruksslitage',
          extraNote: 'Var specifik: beskriv vilken typ av slitage (repor, nagg, fläckar, etc.) eller ange "Sedvanligt slitage" om inga tydliga skador finns.'
        });
      } else if (hasOtherVague) {
        warnings.push({
          field: 'Kondition',
          issue: `"${condPlain.trim()}" är för vagt. Prova istället:`,
          severity: 'medium',
          source: 'faq',
          fieldId: 'item_condition_sv',
          vagueCondition: true
        });
      }
    }

    // === AML / PENNINGTVÄTT COMPLIANCE REMINDERS ===
    const titleAndDesc = (data.title + ' ' + descLower).toLowerCase();

    const isLooseGemstone = /lösa?\s+ädelsten/i.test(titleAndDesc) ||
      /ädelsten.*lösa?/i.test(titleAndDesc) ||
      (category.includes('ädelsten') && !/smycke|ring|halsband|armband|brosch/i.test(titleAndDesc));

    if (isLooseGemstone) {
      warnings.push({
        field: 'AML',
        issue: '⚠️ Lösa ädelstenar: Högrisk för penningtvätt. Kräver certifikat (GIA/HRD/IGI/GRS/DSEF/SSEF), PROVENIENS ska anges, och säljarens identitet måste kontrolleras.',
        severity: 'high',
        source: 'aml'
      });
    }

    const estimateValue = parseFloat(data.estimate) || 0;
    const upperEstimateValue = parseFloat(data.upperEstimate) || 0;
    const highestEstimate = Math.max(estimateValue, upperEstimateValue);

    if (highestEstimate >= 50000) {
      warnings.push({
        field: 'AML',
        issue: `Värdering ${highestEstimate.toLocaleString('sv-SE')} SEK — säkerställ att säljarens riskprofil och ID-verifiering är uppdaterad.`,
        severity: 'medium',
        source: 'aml'
      });
    }

    const isBullionOrLargeGold = /\b(guldtacka|silvertacka|tackor|guldmynt.*parti|parti.*guldmynt)\b/i.test(titleAndDesc) ||
      (/\b(guld|gold)\b/i.test(titleAndDesc) && /\b(parti|samling|lot)\b/i.test(titleAndDesc));

    if (isBullionOrLargeGold) {
      warnings.push({
        field: 'AML',
        issue: 'Guld/silver i parti eller tackor: Kontrollera säljarens identitet och ägandets varaktighet. Dokumentera i riskprofilen.',
        severity: 'medium',
        source: 'aml'
      });
    }

    // Clamp score to 0-100 range
    score = Math.max(0, Math.min(100, score));

    return { warnings, score };
  }

  /**
   * Check whether "Inga anmärkningar" checkbox is checked
   */
  isNoRemarksChecked() {
    const noRemarksCheckbox = document.querySelector('input[type="checkbox"][value="Inga anmärkningar"]') ||
      document.querySelector('input[type="checkbox"]#item_no_remarks') ||
      document.querySelector('input[type="checkbox"][name*="no_remarks"]');
    return noRemarksCheckbox && noRemarksCheckbox.checked;
  }

  /**
   * Check if text contains measurements in Swedish format
   */
  hasMeasurements(text) {
    const measurementPatterns = [
      /(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*×\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i,
      /(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*x\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i,
      /(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*×\s*\d+([.,]\d+)?\s*×\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i,
      /(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*x\s*\d+([.,]\d+)?\s*x\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i,
      /(ram)?mått:?\s*(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*[×x]\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i,
      /(längd|bredd|bred|djup|höjd|diameter|diam\.?|h\.?|l\.?|d\.?)\s*(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*[-–]\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i,
      /(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*[-–]\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i,
      /(längd|l\.?)\s*(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i,
      /(bredd|bred|djup|d\.?)\s*(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i,
      /(höjd|h\.?)\s*(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i,
      /(storlek|innerdiameter|inre\s*diameter|ytterdiameter|yttre\s*diameter|ringmått)\s*[:/]?\s*\d+([.,]\d+)?/i,
      /(omkrets|circumference)\s*[:/]?\s*\d+([.,]\d+)?\s*(mm|cm)\b/i,
      /(bruttovikt|nettovikt|vikt|weight)\s*[:/]?\s*\d+([.,]\d+)?\s*(g|gram|kg)\b/i,
      /(karat|ct|carat)\s*[:/]?\s*\d+([.,]\d+)?/i,
      /mått:.*\d+([.,]\d+)?.*(mm|cm|m)\b/i,
      /\d+([.,]\d+)?\s*(mm|cm|m)\b.*\d+([.,]\d+)?\s*(mm|cm|m)\b/i,
      /\d+([.,]\d+)?\s*(mm|cm|m|g|gram|kg)\b/i,
      /(diameter|diam\.?|ø)\s*(ca\.?|cirka|ungefär|c:a)?\s*\d+([.,]\d+)?\s*(mm|cm|m)\b/i
    ];

    return measurementPatterns.some(pattern => text.match(pattern));
  }

  /**
   * Calculate quality score from item data
   */
  calculateCurrentQualityScore(data) {
    let score = 100;
    const noRemarksChecked = this.isNoRemarksChecked();

    const descLength = data.description.replace(/<[^>]*>/g, '').length;
    const condLength = data.condition.replace(/<[^>]*>/g, '').length;
    const keywordsLength = data.keywords.length;

    const keywordCount = data.keywords ?
      (data.keywords.includes(',') ?
        data.keywords.split(',').filter(k => k.trim().length > 0).length :
        data.keywords.split(/\s+/).filter(k => k.trim().length > 0).length
      ) : 0;

    if (data.title.length < 20) score -= 20;
    if (descLength < 50) score -= 25;

    if (!noRemarksChecked) {
      if (condLength < 20) score -= 20;
      if (data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) score -= 25;

      const vaguePhrases = ['normalt slitage', 'vanligt slitage', 'åldersslitage'];
      const conditionText = data.condition.toLowerCase();
      const hasVaguePhrase = vaguePhrases.some(phrase =>
        conditionText.includes(phrase) && conditionText.replace(/<[^>]*>/g, '').trim().length < 30
      );
      if (hasVaguePhrase) score -= 15;
    }

    if (keywordsLength === 0 || !data.keywords || data.keywords.trim() === '') score -= 30;
    else if (keywordCount < 2) score -= 20;
    else if (keywordCount < 4) score -= 10;
    else if (keywordCount > 12) score -= 15;

    if (!data.description.match(/\d+[\s,]*(x|cm|mm)/i)) score -= 20;

    return Math.max(0, score);
  }

  /**
   * Assess data quality for a specific field type
   */
  assessDataQuality(data, fieldType) {
    const descLength = data.description.replace(/<[^>]*>/g, '').length;
    const condLength = data.condition.replace(/<[^>]*>/g, '').length;
    const titleLength = data.title.length;
    const noRemarksChecked = this.isNoRemarksChecked();
    const qualityScore = this.calculateCurrentQualityScore(data);

    const issues = [];
    let needsMoreInfo = false;

    if (qualityScore < 30) {
      needsMoreInfo = true;
      issues.push('critical_quality');
    }

    switch (fieldType) {
      case 'title':
        if (!data.description.match(/\d{4}|\d{2,4}-tal|1[6-9]\d{2}|20[0-2]\d/i) && !data.artist && descLength < 30) {
          issues.push('period');
          needsMoreInfo = true;
        }
        if (titleLength < 15 && descLength < 25) {
          issues.push('basic_info');
          needsMoreInfo = true;
        }
        if (data.artist && data.artist.length > 0 && descLength < 20) {
          issues.push('artist_verification');
          needsMoreInfo = true;
        }
        break;

      case 'description':
        if (descLength < 25) {
          needsMoreInfo = true;
          issues.push('short_description');
        }
        if (!data.description.match(/\d+[\s,]*(x|cm|mm)/i) && descLength < 40) {
          issues.push('measurements');
          needsMoreInfo = true;
        }
        break;

      case 'condition':
        if (!noRemarksChecked) {
          if (data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) {
            issues.push('specific_damage', 'wear_details', 'bruksslitage_vague');
            needsMoreInfo = true;
          }
          if (condLength < 15) {
            issues.push('condition_details');
            needsMoreInfo = true;
          }
          const vaguePhrases = ['normalt slitage', 'vanligt slitage', 'åldersslitage'];
          const conditionText = data.condition.toLowerCase();
          const hasVaguePhrase = vaguePhrases.some(phrase => conditionText.includes(phrase));
          if (hasVaguePhrase && condLength < 40) {
            issues.push('vague_condition_terms');
            needsMoreInfo = true;
          }
        }
        break;

      case 'keywords':
        if (qualityScore < 20) {
          issues.push('basic_info');
          needsMoreInfo = true;
        }
        break;

      case 'all':
        if (qualityScore < 40) {
          needsMoreInfo = true;
          issues.push('critical_quality');
        }
        if (descLength < 30) {
          issues.push('material', 'technique', 'period');
          needsMoreInfo = true;
        }
        if (!data.description.match(/\d+[\s,]*(x|cm|mm)/i) && descLength < 50) {
          issues.push('measurements');
          needsMoreInfo = true;
        }
        if (!noRemarksChecked && data.condition.match(/^<p>bruksslitage\.?<\/p>$/i)) {
          issues.push('specific_damage');
          needsMoreInfo = true;
        }
        break;
    }

    return { needsMoreInfo, missingInfo: issues, qualityScore };
  }

  /**
   * Extract current warnings from the DOM
   */
  extractCurrentWarnings() {
    const warningsElement = document.querySelector('.quality-warnings ul');
    const warnings = [];

    if (warningsElement) {
      const warningItems = warningsElement.querySelectorAll('li');
      warningItems.forEach(item => {
        const strongElement = item.querySelector('strong');
        if (strongElement) {
          const field = strongElement.textContent.replace(':', '');
          const issue = item.textContent.replace(strongElement.textContent, '').trim();
          const severity = Array.from(item.classList)
            .find(cls => cls.startsWith('warning-'))
            ?.replace('warning-', '') || 'medium';

          warnings.push({ field, issue, severity });
        }
      });
    }

    return warnings;
  }
}
