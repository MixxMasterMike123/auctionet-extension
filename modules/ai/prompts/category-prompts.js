// modules/ai/prompts/category-prompts.js
// Category-Specific Prompts and Rules

/**
 * Get category-specific rules based on item data
 */
export function getCategorySpecificRules(itemData) {
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
    return WEAPON_RULES;
  }
  
  // Detect watches/timepieces
  const isWatch = category.includes('armbandsur') || 
                 category.includes('klocka') || 
                 title.includes('armbandsur') || 
                 title.includes('klocka') ||
                 description.includes('armbandsur') ||
                 description.includes('klocka');
  
  if (isWatch) {
    return WATCH_RULES;
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
    return HISTORICAL_RULES;
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
    return JEWELRY_RULES;
  }
  
  return '';
}

/**
 * Weapon and militaria specific rules
 */
const WEAPON_RULES = `
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

/**
 * Watch and timepiece specific rules
 */
const WATCH_RULES = `
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

/**
 * Historical items specific rules
 */
const HISTORICAL_RULES = `
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

/**
 * Jewelry and precious items specific rules
 */
const JEWELRY_RULES = `
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

/**
 * Check if item belongs to specialized category
 */
export function isSpecializedCategory(itemData) {
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