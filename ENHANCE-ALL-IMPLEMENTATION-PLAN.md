# Enhance All — Implementation Plan

**Feature:** Tiered AI enhancement for auction catalog listings  
**Extension:** Auctionet AI Cataloging Assistant (v1.9.0+)  
**Target:** Claude Code implementation  
**Date:** 2026-03-02

---

## 1. Feature Overview

### What it does

A single "Förbättra alla" (Enhance All) button on the Edit Item page that reads ALL form fields, determines the item's value tier, and enhances every field simultaneously according to tier-specific rules. The cataloger's workflow becomes:

1. Write title per Auctionet conventions (this they already know)
2. Dump ALL raw info into the description field — measurements, weight, stamps, material, condition notes, provenance, everything as unstructured freetext
3. Set category and valuation ("Bevakningspris")
4. Click **"Förbättra alla"**
5. AI structures everything: moves data to correct fields, formats per conventions, adds context based on tier

### What it does NOT do

- Does not invent details not present in the input data (hallucination guard)
- Does not override the title if it already follows Auctionet conventions (title is left as-is unless malformatted)
- Does not use HTML formatting (Phase 1 — plaintext only)
- Does not replace the existing per-field "Förbättra" buttons — those remain for targeted edits

---

## 2. Three-Tier Enhancement System

### Tier Selection

Tier is determined automatically from the item's **Bevakningspris** (reserve price / valuation) field. If the field is empty, default to Tier 1. The cataloger can override by clicking a different tier button.

### Tier 1 — "Städa" (Tidy) — Under 3 000 kr

**Purpose:** Mechanical cleanup only. No creative text, no context, no maker history. Pure formatting and field distribution.

**Model:** Haiku 4.5 (fast, cheap — handles 75-80% of volume)

**What it does to each field:**

| Field | Action |
|-------|--------|
| **Title** | Leave unchanged if it follows Auctionet conventions. Fix obvious errors only (wrong UPPERCASE, redundant words, abbreviations that should be spelled out per Auctionet FAQ). |
| **Description** | Extract and structure from freetext dump: material, technique, maker's marks/stamps, model numbers. Format measurements last with "ca" prefix per Auctionet convention ("Höjd ca 25 cm"). Remove any condition-related text (move to Condition field). Remove measurements from wrong format. |
| **Condition** | Move any condition text found in Description here. Expand vague terms: "bruksskick" → specific observations. Keep factual and short. |
| **Keywords** | Generate space-separated keywords. Multi-word phrases hyphenated per Auctionet standard (e.g., `art-deco guld-halsband jugend`). Based on title + description + category. |

**What it explicitly does NOT do:**
- Add hook/intro sentences
- Add maker/designer context or biography
- Add "not observed" condition statements
- Add provenance reminders
- Restructure a description that's already well-formatted

### Tier 2 — "Berika" (Enrich) — 3 000–10 000 kr

**Purpose:** Structured description with brief maker/designer context. Make the listing sell, not just inform.

**Models:** Sonnet 4.5 for structuring + Opus 4.6 for maker context (if named maker/designer/artist exists)

**What it does to each field:**

| Field | Action |
|-------|--------|
| **Title** | Same as Tier 1. |
| **Description** | Structure in this order: (1) Hook — 1-2 sentences establishing desirability/significance, based ONLY on facts present in the data. (2) Details — material, technique, marks/stamps, model. (3) Maker context — IF a named designer/artist/maker is present: 2-3 sentences about them from AI knowledge. Use the existing biography system (Opus 4.6) to generate this. (4) Measurements — last, formatted per convention. |
| **Condition** | Same structuring as Tier 1, PLUS: add "positive absence" statements where appropriate: "Inga kantnagg observerade", "Dekoren utan synligt slitage", "Inga synliga reparationer". These provide buyer confidence and legal protection. |
| **Keywords** | Same as Tier 1, but more comprehensive — include maker name variations, style period, technique terms. |

**Maker context flow:**
```
1. Check if artist/designer field has a name
2. IF yes → call Opus 4.6 with the existing biography prompt
3. Extract 2-3 sentence summary suitable for description
4. Inject into description after details section
5. IF no named maker → skip, no context added
```

### Tier 3 — "Full" (Full Treatment) — Over 10 000 kr

**Purpose:** Complete auction catalog entry. Everything Tier 2 does, plus deeper context, provenance handling, and systematic condition review.

**Model:** Opus 4.6 for the entire enhancement (500-800 items/year — cost is negligible vs. revenue)

**What it does to each field:**

| Field | Action |
|-------|--------|
| **Title** | Same as Tier 1-2. |
| **Description** | Same structure as Tier 2, but: (1) Hook is more developed — positions the piece in its market/historical context. (2) Maker context is fuller — 3-5 sentences covering significance, notable works, collecting trends. (3) If provenance info exists in the input, format it properly. (4) If NO provenance info exists, append a reminder flag (see UI section). |
| **Condition** | Systematic top-to-bottom review. Specific measurements for any damage ("3 mm kantnagg vid foten"). Comprehensive "positive absence" statements. If "Ej funktionstestad" appears, rephrase to describe what WAS observed ("Urverket ej testat, visare rörliga"). |
| **Keywords** | Most comprehensive. Include period terms, technique, style movement, alternative spellings of maker name, collecting category terms. |

**Provenance reminder:**
If the description input contains no provenance information (purchase history, previous owner, exhibition history, previous auction), the system should display a UI notification (NOT inject text into the description):

> ⚠ Proveniens ej angiven — har säljaren tillfrågats? (Inköpsplats, tidigare ägare, utställningshistorik)

This is a reminder to the cataloger, not AI-generated content.

---

## 3. Description Field — Target Structure per Tier

### Tier 1 Output Format
```
[Material]. [Technique if relevant]. [Maker's marks/stamps described].
[Model/pattern name if applicable].

[Measurements formatted: "Höjd ca X cm. Bredd ca Y cm." — ALWAYS last]
```

Example input (raw dump in description):
```
flintgods gustavsbergs ankare + stig L diameter 205mm modell 8 hårspricka glasyr
```

Example Tier 1 output:
**Description:**
```
Flintgods. Märkt med Gustavsbergs ankare samt "Stig L." och modellnummer.
Modell 8.

Diameter ca 20,5 cm.
```
**Condition:**
```
Hårspricka i glasyr.
```

### Tier 2 Output Format
```
[Hook — 1-2 sentences. Why this piece matters. Based on facts only.]

[Material/technique]. [Marks/stamps]. [Model/pattern].
[Maker context — 2-3 sentences from biography system, if named maker exists.]

[Measurements — ALWAYS last]
```

Example Tier 2 output (same input + artist field: "Stig Lindberg"):
**Description:**
```
Ugnsform i flintgods, modell 8. Formgiven av Stig Lindberg för Gustavsberg.

Flintgods, handdekorerat. Märkt med Gustavsbergs ankare, "Stig L." samt modellnummer.

Stig Lindberg (1916–1982) var konstnärlig ledare vid Gustavsbergs porslinsfabrik 1949–1980. Hans brukskeramik, särskilt de handdekorerade serierna, är idag bland de mest samlade inom svensk 1900-talskeramik.

Diameter ca 20,5 cm.
```
**Condition:**
```
Hårspricka i glasyr observerad. Dekoren utan synligt slitage. Inga kantnagg observerade.
```

### Tier 3 Output Format
```
[Hook — 1-3 sentences. Positions piece in market/historical context.]

[Material/technique]. [Marks/stamps]. [Model/pattern].
[Provenance if available.]

[Maker context — 3-5 sentences. Significance, period, collecting trends.]

[Measurements — ALWAYS last]
```

---

## 4. Condition Field — Rules per Tier

### All Tiers — Universal Rules

These rules apply regardless of tier:

- NEVER use "Inga anmärkningar" (creates legal liability per Auctionet FAQ)
- NEVER use "bruksskick" alone — always specify what kind of wear
- NEVER say "Ej funktionstestad" without describing what WAS observed
- NEVER describe paintings/art with "bruksslitage" (Auctionet FAQ)
- Keep factual — no subjective assessments ("fin", "dålig")
- If condition info is missing entirely from input, write: "Se bilder för konditionsbedömning"

### Tier 1 — Condition Rules
- Move condition text from description dump to condition field
- Expand vague terms to specific ones
- Keep brief — one to three short sentences max
- Do NOT add "positive absence" statements

### Tier 2 — Condition Rules
- Everything from Tier 1
- ADD relevant "positive absence" statements based on object type:
  - Ceramics/glass: "Inga kantnagg observerade", "Dekoren utan synligt slitage"
  - Furniture: "Inga synliga reparationer", "Beslag intakta"
  - Silver/metal: "Inga bucklor observerade", "Stämplar tydligt läsbara"
  - Jewelry: "Sten/stenar fastsittande", "Lås fungerande"
- Maximum 2-3 positive absence statements — don't overdo it

### Tier 3 — Condition Rules
- Everything from Tier 2
- Systematic approach: describe top-to-bottom or outside-to-inside
- Specific measurements on any damage ("nagg ca 3 mm vid fotring")
- Rephrase "Ej funktionstestad": "Urverket ej testat — visare kan förflyttas manuellt" or "Mekanismen ej provad — alla delar förefaller intakta visuellt"
- More comprehensive positive absence statements (3-5)

---

## 5. Keywords Field — Rules per Tier

### All Tiers — Universal Rules
- Space-separated, multi-word phrases hyphenated: `art-deco guld-halsband jugend`
- No duplicates of words already in title (Auctionet indexes title separately)
- Swedish terms primary, English synonyms secondary for international reach
- Never include generic words: "fin", "gammal", "vintage" (too broad to be useful)

### Tier 1 — Keywords
- Material, technique, object type synonyms
- Brand/maker if in title (alternative spellings)
- Typically 5-10 keywords

### Tier 2 — Keywords
- Everything from Tier 1
- Style period: `jugend`, `art-deco`, `funkis`, `gustavianskt`, `1950-tal`
- Designer/maker name variations
- Collecting category: `svenskt-glas`, `skandinavisk-design`, `militaria`
- Typically 8-15 keywords

### Tier 3 — Keywords
- Everything from Tier 2
- International search terms (English equivalents): `mid-century`, `scandinavian-design`
- Specific model/pattern names
- Related collecting terms
- Typically 12-20 keywords

---

## 6. AI System Prompts

### Shared Preamble (used in all tiers)

```
Du är en erfaren svensk auktionskatalogiserare. Du arbetar för ett auktionshus på Auctionet.com.

KRITISKA REGLER:
1. Hitta ALDRIG på detaljer som inte finns i indata. Om information saknas — utelämna den.
2. Flytta konditionsrelaterad information till konditionsfältet — det ska INTE stå i beskrivningen.
3. Mått ska ALLTID stå sist i beskrivningen.
4. Formatera mått med "ca" prefix: "Höjd ca 25 cm" (inte "H: 250mm" eller "25 cm hög").
5. Om vikter finns: ange i gram för silver/guld, i kg för möbler/tunga föremål.
6. Stämplar/märkningar: beskriv vad som finns, hitta aldrig på märkningar.
7. Om "Okänd konstnär" eller "Oidentifierad konstnär" finns i konstnärsfältet: nämn ALDRIG dessa termer i beskrivning eller titel.
8. Skriv ALLTID på svenska.
9. Använd ALDRIG subjektiva ord: "fin", "vacker", "värdefull", "unik", "fantastisk".
10. Använd ALDRIG HTML-taggar i något fält.

AUCTIONET-KONVENTIONER FÖR TITEL:
- Objekttyp FÖRST, sedan material om det är värdedrivande (silver, guld), sedan maker/designer
- Konstnärsnamn i VERSALER: "VAS, glas, Bertil Vallien"
- Stavning: fullständiga namn, aldrig förkortningar ("Josef Frank" inte "J. Frank", "nysilver" inte "NS")
- Separera objekttyp och material: "TOMTE, keramik" inte "KERAMIKTOMTE"
- Silver: ange vikt i titeln (Auctionet-konvention)
- Mattor: ange mått i titeln
- Konst: ange mått höjd × bredd (utan ram)

NYCKELORD-FORMAT:
- Mellanslag mellan ord, bindestreck för flerordstermer: "art-deco guld-halsband jugend"
- Inga ord som redan finns i titeln
- Inga generiska ord som "fin", "gammal", "vintage"
```

### Tier 1 System Prompt — "Städa"

```
{SHARED PREAMBLE}

DIN UPPGIFT — NIVÅ 1 (STÄDA):
Du ska ENBART strukturera och formatera. Lägg ALDRIG till information som inte finns i indata.

BESKRIVNING:
- Extrahera fakta från den råa frittexten och strukturera i ordning: material, teknik, märkning/stämplar, modell.
- Flytta ALL konditionsrelaterad text till konditionsfältet.
- Flytta ALL måttinformation till slutet av beskrivningen.
- Formatera mått korrekt: "Höjd ca 25 cm. Diameter ca 15 cm."
- Skriv i korta, sakliga meningar.
- Lägg INTE till hook, kontext, makerhistorik eller annan text som inte finns i indata.

KONDITION:
- Konditionstext som hittades i beskrivningen, omformulerad till specifika termer.
- Ersätt "bruksskick" med specifik observation ur indata.
- Om ingen konditionsinfo finns: skriv "Se bilder för konditionsbedömning."
- Lägg INTE till "positive absence"-formuleringar.

TITEL:
- Lämna oförändrad om den följer Auctionet-konventioner.
- Korrigera ENBART uppenbara formatfel (saknad versal, felaktig förkortning).

NYCKELORD:
- 5-10 relevanta söktermer baserade på titel, beskrivning och kategori.

Svara med EXAKT detta JSON-format:
{
  "title": "korrigerad titel eller null om oförändrad",
  "description": "strukturerad beskrivning",
  "condition": "konditionstext",
  "keywords": "mellanslag-separerade nyckelord"
}
```

### Tier 2 System Prompt — "Berika"

```
{SHARED PREAMBLE}

DIN UPPGIFT — NIVÅ 2 (BERIKA):
Strukturera OCH berika med kort kontext. Du får lägga till en hook-mening och kort makerkontext, men ALDRIG hitta på fakta om objektet själv.

BESKRIVNING — Följ denna struktur exakt:

STYCKE 1 — HOOK:
1-2 meningar som identifierar objektet och varför det är intressant. Basera ENBART på fakta i indata. Exempel: "Ugnsform i flintgods, modell 8. Formgiven av Stig Lindberg för Gustavsberg."

STYCKE 2 — DETALJER:
Material, teknik, märkning/stämplar, modellnummer. Sakligt och specifikt.

STYCKE 3 — MAKERKONTEXT (om namngiven maker/designer/konstnär finns):
2-3 meningar om makerns/formgivarens/konstnärens betydelse. Detta FÅR du hämta ur din kunskap — det handlar om personen, inte om objektet. Om ingen namngiven maker finns: hoppa över detta stycke helt.

SIST — MÅTT:
Alltid sist, formaterat korrekt.

KONDITION:
- Strukturerade observationer från indata.
- Lägg till relevanta "positive absence"-formuleringar baserat på objekttyp:
  - Keramik/glas: "Inga kantnagg observerade", "Dekoren utan synligt slitage"
  - Möbler: "Inga synliga reparationer"
  - Silver/metall: "Stämplar tydligt läsbara"
  - Smycken: "Sten/stenar fastsittande"
- Max 2-3 sådana formuleringar. Överdrift minskar trovärdigheten.

TITEL:
- Samma som Nivå 1.

NYCKELORD:
- 8-15 termer. Inkludera stilperiod, designervarianter, samlarkategorier.

Svara med EXAKT detta JSON-format:
{
  "title": "korrigerad titel eller null om oförändrad",
  "description": "strukturerad beskrivning med hook och makerkontext",
  "condition": "konditionstext med positive absence",
  "keywords": "mellanslag-separerade nyckelord",
  "makerContextUsed": true/false
}
```

### Tier 3 System Prompt — "Full"

```
{SHARED PREAMBLE}

DIN UPPGIFT — NIVÅ 3 (FULL BEHANDLING):
Skapa en komplett auktionskatalogisering av hög kvalitet. Du har frihet att skriva utförligare, men ALDRIG att hitta på fakta om objektet.

BESKRIVNING — Följ denna struktur exakt:

STYCKE 1 — HOOK:
1-3 meningar som positionerar objektet i sitt sammananhang — marknad, period, samlartrend. Mer utvecklad än Nivå 2. Basera på fakta i indata och din kunskap om typen av objekt.

STYCKE 2 — DETALJER:
Material, teknik, märkning/stämplar, modellnummer. Utförligare vid behov — beskriv stämplar detaljerat, notera teknik som är värdedrivande.

STYCKE 3 — PROVENIENS (om info finns i indata):
Formatera proveniensuppgifter korrekt: inköpsplats, tidigare ägare, utställningshistorik, tidigare auktionsförsäljningar.

STYCKE 4 — MAKERKONTEXT (om namngiven maker/designer/konstnär finns):
3-5 meningar. Täck betydelse, aktiv period, stilistisk placering, samlarvärde och -trender. Mer djupgående än Nivå 2. Om ingen namngiven maker finns: hoppa över.

SIST — MÅTT:
Alltid sist, formaterat korrekt.

KONDITION:
- Systematisk bedömning, uppifrån och ner eller utifrån och in.
- Specifika mått på eventuella skador ("nagg ca 3 mm vid fotring").
- Om "Ej funktionstestad" finns i indata: formulera om till vad som observerats ("Urverket ej testat — visare kan förflyttas manuellt").
- Utförliga "positive absence"-formuleringar (3-5 stycken).
- Beskriv helhetsbild: "Överlag i gott skick med hänsyn till ålder och typ."

TITEL:
- Samma som Nivå 1-2.

NYCKELORD:
- 12-20 termer. Inkludera internationella söktermer (engelska), specifika modellnamn, relaterade samlarkategorier.

Svara med EXAKT detta JSON-format:
{
  "title": "korrigerad titel eller null om oförändrad",
  "description": "komplett katalogbeskrivning",
  "condition": "systematisk konditionsrapport",
  "keywords": "mellanslag-separerade nyckelord",
  "makerContextUsed": true/false,
  "provenanceFound": true/false
}
```

---

## 7. Architecture & File Changes

### New Files to Create

```
modules/
├── enhance-all/
│   ├── enhance-all-manager.js      # Main orchestrator
│   ├── enhance-all-ui.js           # UI: button, tier selector, preview
│   ├── tier-config.js              # Tier definitions, thresholds, prompts
│   └── field-distributor.js        # Post-AI field distribution logic
```

### Existing Files to Modify

| File | Change |
|------|--------|
| `content-script.js` | Import and initialize `enhance-all-manager.js` on Edit page |
| `content.js` | Import and initialize on Add page (optional Phase 2) |
| `modules/api-manager.js` | Add `enhanceAll()` method that sends full-form context to appropriate model per tier |
| `modules/data-extractor.js` | Ensure it can extract ALL form fields as a single object for the AI call |
| `modules/ui-manager.js` | Add "Förbättra alla" button to Edit page UI |
| `modules/core/ai-enhancement-engine.js` | Add tier-aware enhancement mode alongside existing per-field mode |
| `modules/refactored/ai-rules-system/ai-rules-config.json` | Add tier configurations |
| `background.js` | Ensure API routing supports model selection per tier (Haiku/Sonnet/Opus) |
| `manifest.json` | Add new module files to content_scripts |
| `styles.css` | Styles for tier selector UI |

### Data Flow

```
User clicks "Förbättra alla"
        │
        ▼
enhance-all-manager.js
        │
        ├── 1. data-extractor.js → Extract ALL form fields
        │      (title, description, condition, keywords, artist,
        │       category, bevakningspris, material, period)
        │
        ├── 2. tier-config.js → Determine tier from bevakningspris
        │      Under 3000 → Tier 1 (Haiku 4.5)
        │      3000-10000 → Tier 2 (Sonnet 4.5 + Opus 4.6 for bio)
        │      Over 10000 → Tier 3 (Opus 4.6)
        │
        ├── 3. Build prompt:
        │      tier-config.js → Get system prompt for tier
        │      Combine with extracted field data as user message
        │
        ├── 4. API call(s):
        │      ├── Tier 1: Single Haiku call
        │      ├── Tier 2: Sonnet call + conditional Opus bio call (parallel)
        │      └── Tier 3: Single Opus call
        │
        ├── 5. Parse JSON response
        │
        ├── 6. enhance-all-ui.js → Show preview with diff
        │      Cataloger sees before/after for EACH field
        │      Can accept/reject per field
        │
        ├── 7. On accept → field-distributor.js
        │      Writes accepted values to form fields
        │      Triggers quality-analyzer re-evaluation
        │
        └── 8. If Tier 3 + no provenance → Show reminder notification
```

---

## 8. UI Design

### Button Placement

Place the "Förbättra alla" button prominently above the form fields, near the existing quality score circles. It should be visually distinct from the per-field enhance buttons.

```
┌─────────────────────────────────────────────────┐
│  [Totalt: 62%]  [Komplett: 78%]  [Noggr: 45%]  │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │  ✨ Förbättra alla                        │   │
│  │                                           │   │
│  │  [ Städa ]  [● Berika ]  [ Full ]        │   │
│  │   < 3000     3-10k        > 10k          │   │
│  │                                           │   │
│  │  Auto-vald: Berika (bevakningspris 5500) │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  Titel: ___________________________________     │
│  ...                                            │
└─────────────────────────────────────────────────┘
```

### Tier Selector

- Three buttons in a row: **Städa** | **Berika** | **Full**
- Auto-selected based on bevakningspris
- Small label below each: "< 3 000 kr" | "3–10 000 kr" | "> 10 000 kr"
- Active tier highlighted (use Auctionet's color scheme)
- Cataloger can click to override
- Below the buttons: "Auto-vald: [Tier] (bevakningspris X kr)" in muted text

### Preview Modal

After AI returns results, show a preview modal before applying changes. This is critical — catalogers must review before content goes live.

```
┌─────────────────────────────────────────────────┐
│  Förbättring — Nivå 2 (Berika)           [✕]   │
│─────────────────────────────────────────────────│
│                                                  │
│  TITEL                              [Oförändrad]│
│  ─────                                          │
│  VAS, glas, Bertil Vallien                      │
│                                                  │
│  BESKRIVNING                         [✓ Godkänn]│
│  ───────────                         [✗ Hoppa]  │
│  Skulptural vas i blått konstglas... (ny text)  │
│                                                  │
│  KONDITION                           [✓ Godkänn]│
│  ─────────                           [✗ Hoppa]  │
│  Mindre luftblåsor i glaset, typiska för        │
│  tekniken. Inga kantnagg observerade...         │
│                                                  │
│  NYCKELORD                           [✓ Godkänn]│
│  ─────────                           [✗ Hoppa]  │
│  kosta-boda blåglas konstglas 1980-tal...       │
│                                                  │
│  ⚠ Proveniens ej angiven — har säljaren         │
│    tillfrågats?                                  │
│                                                  │
│       [ Godkänn valda ]  [ Godkänn alla ]       │
└─────────────────────────────────────────────────┘
```

**Per-field controls:**
- "Oförändrad" label if AI didn't change the field (e.g., title)
- "Godkänn" / "Hoppa" toggles per field
- "Godkänn alla" applies all at once
- "Godkänn valda" applies only checked fields

### Loading State

Use the existing skeleton/spinner pattern from Snabbkatalogisering:

```
┌──────────────────────────────────────┐
│  ✨ Förbättrar alla fält...          │
│                                      │
│  ░░░░░░░░░░████████░░░░░░░░░░  60%  │
│                                      │
│  ✓ Fält extraherade                  │
│  ✓ Nivå 2 vald (Berika)             │
│  ⟳ Strukturerar beskrivning...      │
│  ○ Hämtar makerkontext...            │
│  ○ Förbereder förhandsvisning        │
└──────────────────────────────────────┘
```

### Provenance Reminder (Tier 3 only)

If Tier 3 and no provenance data detected, show a non-blocking notification below the preview:

```
⚠ Proveniens ej angiven
Har säljaren tillfrågats om: inköpsplats, tidigare ägare, utställningshistorik?
[ Stäng ]
```

This is a reminder only — not injected into any field.

---

## 9. API Integration Details

### Model Routing in background.js

The `background.js` service worker already routes API calls to Claude. Extend it to accept a `model` parameter:

```javascript
// In background.js message handler:
case 'enhanceAll':
  const model = request.model; // 'haiku', 'sonnet', or 'opus'
  const modelMap = {
    'haiku': 'claude-haiku-4-5-20251001',
    'sonnet': 'claude-sonnet-4-5-20250929',
    'opus': 'claude-opus-4-6'
  };
  // ... route to Anthropic API with selected model
```

### Tier 2 — Parallel Calls

For Tier 2, run two API calls in parallel:

```javascript
// enhance-all-manager.js — Tier 2 flow
async function enhanceTier2(formData) {
  const [structureResult, bioResult] = await Promise.all([
    // Call 1: Sonnet for structure
    callAPI('sonnet', tier2SystemPrompt, buildUserMessage(formData)),

    // Call 2: Opus for maker bio (only if artist/designer exists)
    formData.artist
      ? callAPI('opus', biographyPrompt, formData.artist)
      : Promise.resolve(null)
  ]);

  // Merge: inject bio into description if available
  if (bioResult) {
    structureResult.description = injectMakerContext(
      structureResult.description,
      bioResult.context
    );
  }

  return structureResult;
}
```

### User Message Format

The user message sent to the AI should contain ALL form fields as structured input:

```json
{
  "title": "VAS, glas, Bertil Vallien",
  "description": "blått glas undertecknad vallien kosta boda höjd 25cm mindre luftblåsor i glasmassan bruksskick",
  "condition": "",
  "keywords": "",
  "artist": "Bertil Vallien",
  "category": "Glas",
  "valuation": 5500,
  "material": "",
  "period": ""
}
```

### Response Parsing

All tiers return JSON. Parse with error handling:

```javascript
function parseEnhanceResponse(responseText) {
  try {
    // Strip markdown code fences if present
    const cleaned = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('Failed to parse enhance response:', e);
    return null;
  }
}
```

### Hallucination Guard — Post-Processing

After receiving the AI response, run these checks before showing the preview:

```javascript
function validateResponse(response, originalData) {
  // 1. Check that measurements in response exist in original data
  //    (prevents AI from inventing dimensions)

  // 2. Check that maker names match what's in the artist field
  //    (prevents AI from adding wrong artists)

  // 3. Strip "Okänd konstnär"/"Oidentifierad konstnär" from
  //    description/title if present (existing utility)

  // 4. Verify keywords don't duplicate title words

  // 5. Check for forbidden subjective words
  const forbidden = ['fin', 'vacker', 'värdefull', 'unik', 'fantastisk',
                     'underbar', 'magnifik', 'exceptionell'];

  return validatedResponse;
}
```

---

## 10. Configuration — ai-rules-config.json

Add this block to the existing config file:

```json
{
  "enhanceAll": {
    "enabled": true,
    "tiers": {
      "tidy": {
        "label": "Städa",
        "labelShort": "Städa",
        "maxValuation": 3000,
        "model": "haiku",
        "features": {
          "hook": false,
          "makerContext": false,
          "positiveAbsence": false,
          "provenanceReminder": false,
          "systematicCondition": false,
          "internationalKeywords": false
        },
        "keywordCount": { "min": 5, "max": 10 }
      },
      "enrich": {
        "label": "Berika",
        "labelShort": "Berika",
        "maxValuation": 10000,
        "model": "sonnet",
        "makerContextModel": "opus",
        "features": {
          "hook": true,
          "makerContext": "short",
          "positiveAbsence": true,
          "provenanceReminder": false,
          "systematicCondition": false,
          "internationalKeywords": false
        },
        "keywordCount": { "min": 8, "max": 15 },
        "positiveAbsenceMax": 3
      },
      "full": {
        "label": "Full",
        "labelShort": "Full",
        "maxValuation": null,
        "model": "opus",
        "features": {
          "hook": true,
          "makerContext": "full",
          "positiveAbsence": true,
          "provenanceReminder": true,
          "systematicCondition": true,
          "internationalKeywords": true
        },
        "keywordCount": { "min": 12, "max": 20 },
        "positiveAbsenceMax": 5
      }
    },
    "defaultTierWhenNoValuation": "tidy",
    "models": {
      "haiku": "claude-haiku-4-5-20251001",
      "sonnet": "claude-sonnet-4-5-20250929",
      "opus": "claude-opus-4-6"
    }
  }
}
```

---

## 11. Integration with Existing Systems

### Quality Control

After "Enhance All" applies changes, trigger a full quality re-analysis:

```javascript
// After fields are updated
qualityAnalyzer.runFullAnalysis();
// This updates the three quality circles (Totalt, Komplett, Noggrannhet)
```

### Per-Field Enhance Buttons

The existing per-field "Förbättra" buttons remain. They are useful for:
- Re-enhancing a single field after manual edits
- Cases where the cataloger rejected a field in the preview but wants to try again

No changes needed to existing per-field enhancement logic.

### Artist Detection & Biography

Tier 2's maker context uses the EXISTING biography system:
- `artist-detection-manager.js` — already detects artists
- `biography-kb-card.js` — already generates bios via Opus

Reuse the Opus biography call. Extract a short version (2-3 sentences) for description injection. The `enhance-all-manager.js` should import and call the existing biography generation function rather than reimplementing it.

### Brand Validation

After "Enhance All" applies changes, the existing inline brand validator will automatically re-check the new text (it monitors field changes via debounced listeners). No changes needed.

### Snabbkatalogisering

The Add Item page's Snabbkatalogisering already does something similar (image → structured fields). "Enhance All" is for the Edit page workflow where the cataloger has already entered raw data. The two systems share AI rules but have different entry points and UI flows.

Consider: in Phase 2, "Enhance All" could also be available on the Add Item page as a post-Snabbkatalogisering refinement step.

---

## 12. Implementation Phases

### Phase 1 — Core (implement first)

1. Create `enhance-all/tier-config.js` with tier definitions and system prompts
2. Create `enhance-all/enhance-all-manager.js` — orchestrator with tier selection and API calls
3. Create `enhance-all/field-distributor.js` — writes results to form fields
4. Create `enhance-all/enhance-all-ui.js` — button, tier selector, preview modal
5. Modify `content-script.js` to initialize the module on Edit pages
6. Modify `background.js` to route model-specific API calls
7. Modify `manifest.json` to include new files
8. Add styles to `styles.css`
9. Test all three tiers with real catalog items

### Phase 2 — Refinement

1. Integrate Tier 2 maker context with existing biography system (reuse, don't rebuild)
2. Add provenance reminder notification for Tier 3
3. Add field-level accept/reject in preview modal
4. Track enhancement statistics (which tier used, acceptance rate per field)
5. Make "Enhance All" available on the Add Item page as post-Snabbkatalogisering step

### Phase 3 — HTML Formatting (future)

1. Add HTML output option for Tier 2-3 descriptions (`<b>` for labels, `<i>` for titles/decor names)
2. Test that Auctionet's Google Translate preserves HTML tags
3. Test with Auctionet publishing flow
4. Add HTML toggle in settings (opt-in)

---

## 13. Testing Checklist

### Tier 1 Tests
- [ ] Raw freetext dump → properly structured description
- [ ] Condition text in description → moved to condition field
- [ ] Measurements in random order → formatted and placed last
- [ ] "bruksskick" in input → expanded to specific terms
- [ ] Empty condition + empty description → "Se bilder för konditionsbedömning"
- [ ] No hallucinated details added
- [ ] Keywords generated and properly formatted
- [ ] Title left unchanged when already correct

### Tier 2 Tests
- [ ] Hook generated based on actual item facts
- [ ] Maker context appears ONLY when artist/designer field is populated
- [ ] Maker context is accurate (spot-check against known designers)
- [ ] Positive absence statements match object category
- [ ] No more than 3 positive absence statements
- [ ] Parallel API calls (Sonnet + Opus bio) work correctly
- [ ] Fallback works when Opus bio call fails

### Tier 3 Tests
- [ ] Fuller maker context than Tier 2
- [ ] Provenance formatted correctly when present in input
- [ ] Provenance reminder shown when NOT present
- [ ] "Ej funktionstestad" rephrased properly
- [ ] Systematic condition assessment structure
- [ ] International keywords included
- [ ] No hallucinated provenance or details

### UI Tests
- [ ] Tier auto-selects correctly from bevakningspris
- [ ] Manual tier override works
- [ ] Preview modal shows all fields with changes highlighted
- [ ] Per-field accept/reject works
- [ ] "Godkänn alla" applies all fields
- [ ] Quality score updates after application
- [ ] Loading state shows progress
- [ ] Error handling if API call fails

### Edge Cases
- [ ] Empty description field → still generates keywords from title
- [ ] No bevakningspris set → defaults to Tier 1
- [ ] Artist field has "Okänd konstnär" → no maker context added, term not leaked
- [ ] Very long freetext dump (1000+ chars) → handled without truncation
- [ ] Multiple languages in input (Swedish + English notes) → output in Swedish
- [ ] Item with no category → still works, just fewer keywords

---

## 14. Cost Estimates

| Tier | Model | Items/year | ~Input tokens | ~Output tokens | ~Cost/item | ~Annual cost |
|------|-------|------------|---------------|----------------|------------|--------------|
| 1 | Haiku 4.5 | ~12 000 | 800 | 400 | ~0,02 kr | ~240 kr |
| 2 | Sonnet 4.5 + Opus bio | ~3 000 | 1 200 + 600 | 600 + 300 | ~0,50 kr | ~1 500 kr |
| 3 | Opus 4.6 | ~700 | 1 500 | 800 | ~2,50 kr | ~1 750 kr |
| **Total** | | **~15 700** | | | | **~3 500 kr/year** |

At a conservative 5% price increase on Tier 2-3 items (avg. price ~5 000 kr, ~3 700 items, 20% commission):
**Estimated additional revenue: ~37 000 kr/year** — 10x ROI on API costs.

---

*This plan is designed for Claude Code implementation. All system prompts, file structures, and data flows are implementation-ready. Phase 1 can be built independently without dependencies on Phase 2-3.*
