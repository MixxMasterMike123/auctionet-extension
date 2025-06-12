// modules/ai/prompts/field-prompts.js
// Field-Specific Prompts for Different AI Tasks

import { getBaseInfo, getArtistInfo, getSpecializedCategoryWarning } from './base-prompts.js';
import { getCategorySpecificRules } from './category-prompts.js';

/**
 * Generate field-specific prompt based on field type
 */
export function getFieldPrompt(itemData, fieldType, enableArtistInfo = true) {
  const baseInfo = getBaseInfo(itemData);
  const artistInfo = getArtistInfo(itemData, enableArtistInfo);
  const specializedWarning = getSpecializedCategoryWarning(itemData);
  const categoryRules = getCategorySpecificRules(itemData);
  
  const commonSections = [
    baseInfo,
    artistInfo,
    specializedWarning,
    categoryRules
  ].filter(section => section.trim().length > 0).join('\n\n');

  switch (fieldType) {
    case 'all':
    case 'all-sparse':
      return getMultiFieldPrompt(commonSections, itemData, enableArtistInfo);
    case 'title':
      return getTitlePrompt(commonSections);
    case 'title-correct':
      return getTitleCorrectPrompt(commonSections);
    case 'description':
      return getDescriptionPrompt(commonSections, itemData, enableArtistInfo);
    case 'condition':
      return getConditionPrompt(commonSections);
    case 'keywords':
      return getKeywordsPrompt(commonSections);
    case 'search_query':
      return getSearchQueryPrompt(itemData);
    default:
      return commonSections;
  }
}

/**
 * Multi-field prompt (all, all-sparse)
 */
function getMultiFieldPrompt(commonSections, itemData, enableArtistInfo) {
  return `${commonSections}

UPPGIFT: Förbättra titel, beskrivning, konditionsrapport och generera dolda sökord enligt svenska auktionsstandarder. Skriv naturligt och autentiskt - använd reglerna som riktlinjer, inte som strikta begränsningar.

VIKTIGT - ARBETSORDNING:
1. Först förbättra titel, beskrivning och kondition
2. Sedan generera sökord baserat på de FÖRBÄTTRADE fälten (inte originalfälten)

${itemData.artist && enableArtistInfo ? 
  'EXPERTKUNSKAP - KONSTNÄR KÄND: Eftersom konstnär/formgivare är angiven (' + itemData.artist + ') och konstnärsinformation är aktiverad, lägg till KORT, RELEVANT kontext om denna specifika modell/serie. Max 1-2 extra meningar. Fokusera på konkreta fakta, inte allmän konstnärsbiografi.' : 
  'BEGRÄNSAD INFORMATION: Håll dig till befintlig information utan att lägga till konstnärlig kontext.'}

=== TITEL-SPECIFIKA REGLER ===
${TITLE_RULES}

=== BESKRIVNING-SPECIFIKA REGLER ===
${DESCRIPTION_RULES}

=== KONDITION-SPECIFIKA REGLER ===
${CONDITION_RULES}

=== SÖKORD-SPECIFIKA REGLER ===
${KEYWORDS_RULES}

Returnera EXAKT i detta format (en rad per fält):
TITEL: [förbättrad titel]
BESKRIVNING: [förbättrad beskrivning utan konditionsinformation]
KONDITION: [förbättrad konditionsrapport]
SÖKORD: [kompletterande sökord baserade på FÖRBÄTTRADE fält ovan, separerade med mellanslag, använd "-" för flerordsfraser]

VIKTIGT FÖR SÖKORD: Använd Auctionets format med mellanslag mellan sökord och "-" för flerordsfraser.
EXEMPEL: "konstglas mundblåst svensk-design 1960-tal samlarobjekt"

Använd INTE markdown formatering eller extra tecken som ** eller ***. Skriv bara ren text.`;
}

/**
 * Title-only prompt
 */
function getTitlePrompt(commonSections) {
  return `${commonSections}

UPPGIFT: Förbättra endast titeln enligt svenska auktionsstandarder. Max 60 tecken. Skriv naturligt och flytande.

${TITLE_RULES}

Returnera ENDAST den förbättrade titeln utan extra formatering eller etiketter.`;
}

/**
 * Title-correct prompt (minimal corrections only)
 */
function getTitleCorrectPrompt(commonSections) {
  return `${commonSections}

🚨 DETTA ÄR EN TITLE-CORRECT UPPGIFT - ENDAST MINIMALA KORRIGERINGAR TILLÅTNA 🚨

UPPGIFT: Korrigera ENDAST grammatik, stavning och struktur i titeln. Behåll ordning och innehåll exakt som det är.

🚨 ABSOLUT FÖRBJUDET - GÖR ALDRIG DESSA ÄNDRINGAR:
• Ändra ordval eller terminologi ("Träskulpturer" → "Porträttskulpturer")
• Lägg till beskrivande ord ("föreställande", "bestående av", etc.)
• Ändra ordning på namn eller element
• Förbättra eller förtydliga innehåll
• Lägg till ny information, material eller tidsperioder
• Ta bort information som redan finns
• Ändra från plural till singular eller tvärtom
• Ersätt befintliga ord med "bättre" alternativ

ENDAST TILLÅTET - MINIMALA KORRIGERINGAR:
• Stavfel i namn: "Menachhem" → "Menachem" 
• Saknade mellanslag: "SVERIGEStockholm" → "SVERIGE Stockholm"
• Felplacerade punkter: "TALLRIK. keramik" → "TALLRIK, keramik"
• Saknade kommatecken mellan namn: "Moshe Dayan Menachhem Begin" → "Moshe Dayan, Menachem Begin"
• Saknade citattecken runt titlar/motiv: "Dune Mario Bellini" → "Dune" Mario Bellini
• Kommatecken istället för punkt mellan objekt och material
• Saknad avslutande punkt: "TALLRIK, keramik, Sverige" → "TALLRIK, keramik, Sverige."

STRIKT REGEL: Behåll EXAKT samma ordval, struktur och innehåll. Korrigera ENDAST uppenbara stavfel och interpunktion. LÄGG ALLTID TILL AVSLUTANDE PUNKT.

KRITISKT RETURFORMAT:
• Returnera ENDAST den korrigerade titeln som ren text
• INGA fältnamn som "TITEL:" eller "titel:"
• INGA strukturerade format eller JSON
• INGA extra förklaringar eller kommentarer

Returnera ENDAST den korrigerade titeln med minimala stavnings- och interpunktionskorrigeringar.`;
}

/**
 * Description-only prompt
 */
function getDescriptionPrompt(commonSections, itemData, enableArtistInfo) {
  return `${commonSections}

UPPGIFT: Förbättra endast beskrivningen. Inkludera mått om de finns, använd korrekt terminologi. Skriv naturligt och engagerande.

${DESCRIPTION_RULES}

VIKTIGT - PARAGRAFSTRUKTUR:
${itemData.artist && enableArtistInfo ? 
  '• STRUKTUR: Befintlig beskrivning först, sedan ny konstnärsinformation i SEPARAT paragraf\n• FORMAT: Använd dubbla radbrytningar (\\n\\n) för att separera paragrafer\n• EXEMPEL: "Befintlig förbättrad beskrivning här...\\n\\nKort konstnärskontext här..."\n• Lägg till KORT, SPECIFIK kontext om denna modell/serie i SEPARAT paragraf\n• Max 1-2 meningar extra - fokusera på tillverkningsår och karakteristiska drag\n• UNDVIK allmänna beskrivningar av konstnärens karriär eller designfilosofi\n• Håll det relevant för just detta föremål' : 
  '• Returnera befintlig förbättrad beskrivning\n• Lägg INTE till konstnärlig eller historisk kontext som inte finns i källdata'}

KRITISKT - RETURFORMAT:
• Returnera ENDAST beskrivningstexten med radbrytningar för separata paragrafer
• Använd dubbla radbrytningar (\\n\\n) för att separera paragrafer
• INGEN HTML-formatering, inga extra etiketter

Returnera ENDAST den förbättrade beskrivningen med radbrytningar för paragrafindelning.`;
}

/**
 * Condition-only prompt
 */
function getConditionPrompt(commonSections) {
  return `${commonSections}

UPPGIFT: Förbättra konditionsrapporten. Skriv kort och faktabaserat. Max 2-3 korta meningar. Använd naturligt språk.

${CONDITION_RULES}

Returnera ENDAST den förbättrade konditionsrapporten utan extra formatering eller etiketter.`;
}

/**
 * Keywords-only prompt
 */
function getKeywordsPrompt(commonSections) {
  return `${commonSections}

UPPGIFT: Generera HÖGKVALITATIVA dolda sökord som kompletterar titel och beskrivning enligt Auctionets format.

${KEYWORDS_RULES}

KRITISKT - RETURFORMAT:
• Returnera ENDAST sökorden separerade med mellanslag
• INGA kommatecken mellan sökord
• INGA förklaringar, kommentarer eller etiketter
• MAX 10-12 relevanta termer
• EXEMPEL: "grafik reproduktion svensk-design 1970-tal dekor inredning"

STRIKT REGEL: Läs titel och beskrivning noggrant - om ett ord redan finns där (även delvis), använd det ALDRIG i sökorden.`;
}

/**
 * Search query prompt (for AI search term generation)
 */
function getSearchQueryPrompt(itemData) {
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
}

// Shared rule sections
const TITLE_RULES = `
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
• Om osäker på exakt stavning, behåll originalet`;

const DESCRIPTION_RULES = `
FÄLTAVGRÄNSNING FÖR BESKRIVNING:
• Inkludera ALDRIG konditionsinformation i beskrivningen
• Konditionsdetaljer som "slitage", "repor", "märken", "skador", "nagg", "sprickor", "fläckar" hör ENDAST hemma i konditionsfältet
• Beskrivningen ska fokusera på: material, teknik, mått, stil, ursprung, märkningar, funktion
• EXEMPEL PÅ FÖRBJUDET I BESKRIVNING: "Slitage förekommer", "repor och märken", "normalt åldersslitage", "mindre skador"
• KRITISKT: BEHÅLL ALLTID MÅTT OCH TEKNISKA SPECIFIKATIONER - dessa är INTE konditionsinformation
• BEHÅLL: "höjd 15,5 cm", "4 snapsglas", "2 vinglas", "består av", "bestående av" - detta är beskrivande information
• TA ENDAST BORT konditionsord som "slitage", "repor", "skador" - ALDRIG mått eller kvantiteter`;

const CONDITION_RULES = `
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

STRIKT REGEL: Kopiera ENDAST den skadeinformation som redan finns - lägg ALDRIG till nya detaljer.`;

const KEYWORDS_RULES = `
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
• EXEMPEL FEL: "grafik, reproduktion, svensk design, 1970-tal" (kommatecken och mellanslag i fraser)`;

export { TITLE_RULES, DESCRIPTION_RULES, CONDITION_RULES, KEYWORDS_RULES }; 