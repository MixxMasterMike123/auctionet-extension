	# Auctionet AI Cataloging Assistant

**Version 2.3.0** | Chrome Extension | Powered by Claude AI (Anthropic)

---

## Executive Summary

The Auctionet AI Cataloging Assistant is a Chrome extension that augments the Auctionet admin interface with AI-powered tools for cataloging, quality control, market analysis, valuation, analytics, and compliance. It runs directly inside the browser on `auctionet.com/admin` pages — no server infrastructure required. The extension uses Claude AI (Anthropic) for intelligent analysis and the Auctionet public API for real-time market data from 3.65M+ historical auction results.

**Key value proposition:** Faster cataloging, higher data quality, tiered AI enhancement based on item value, market-informed pricing, customer valuation emails, standalone sales analytics dashboard, operational KPI dashboards, cross-page comment visibility, and built-in compliance reminders — all without leaving the existing Auctionet admin workflow.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [AI-Powered Field Enhancement](#2-ai-powered-field-enhancement)
3. [Enhance All — Tiered AI Enhancement](#3-enhance-all--tiered-ai-enhancement)
4. [Snabbkatalogisering — Quick Cataloging](#4-snabbkatalogisering-quick-cataloging)
5. [AI Image Analysis](#5-ai-image-analysis)
6. [Quality Control System](#6-quality-control-system)
7. [Market Analysis Dashboard](#7-market-analysis-dashboard)
8. [Artist Detection & Biography System](#8-artist-detection--biography-system)
9. [Brand Validation & Inline Spellcheck](#9-brand-validation--inline-spellcheck)
10. [Search Query Intelligence](#10-search-query-intelligence)
11. [Valuation Request Assistant](#11-valuation-request-assistant)
12. [Admin Dashboard Enhancements](#12-admin-dashboard-enhancements)
13. [Sales Analytics Dashboard (Försäljningsanalys)](#13-sales-analytics-dashboard-försäljningsanalys)
14. [Comment Visibility System](#14-comment-visibility-system)
15. [AML / Anti-Money Laundering Compliance](#15-aml--anti-money-laundering-compliance)
16. [Unknown Artist Handling](#16-unknown-artist-handling)
17. [Settings & Configuration](#17-settings--configuration)
18. [Technical Architecture](#18-technical-architecture)
19. [Security Considerations](#19-security-considerations)
20. [Data & Privacy](#20-data--privacy)

---

## 1. Architecture Overview

The extension operates on five Auctionet admin page types plus one standalone extension page:

| Page | URL Pattern | Entry Point | Purpose |
|------|-------------|-------------|---------|
| **Edit Item** | `/admin/*/items/*/edit` | `content-script.js` | Full cataloging workflow with quality scoring, Enhance All, and market analysis |
| **Add Item / Contracts** | `/admin/*/items/*` (non-edit), `/admin/sas/sellers/*/contracts/*` | `content.js` | New item creation with Snabbkatalogisering, image analysis, and Enhance All |
| **Valuation Request** | `/admin/sas/valuation_requests/*` | `valuation-request.js` | Valuation of customer submissions with email generation |
| **Admin Dashboard** | `/admin/sas` | `admin-dashboard.js` | Operational KPI cards, pipeline funnel, pricing insights, comment feed |
| **All Admin Pages** | `/admin/*` (excl. dashboard, login) | `comment-enhancer.js` | Comment badges, rich comment feed on /comments, entity filters |
| **Sales Analytics** | `chrome-extension://<id>/analytics.html` | `analytics.js` | Standalone sales analytics dashboard with KPIs, filtering, and competitor comparison |

**Technology stack:**
- Chrome Manifest V3 (service worker architecture)
- Claude AI via Anthropic API (Opus 4.6 for valuation, biography, and full-tier enhancement; Sonnet 4.5 for cataloging, enrich-tier enhancement, and spellcheck; Haiku 4.5 for tidy-tier enhancement and fast classification). All Opus calls automatically fall back to Sonnet on API overload.
- Auctionet public API for market data (historical + live auctions)
- Wikipedia API for artist images
- Pure JavaScript — no frameworks, no build step
- All processing happens client-side in the browser

---

## 2. AI-Powered Field Enhancement

Every text field on the cataloging form gets an AI enhancement button. When clicked, Claude analyzes the current field content in context with all other fields and suggests improvements.

### Supported Fields

| Field | What AI Does |
|-------|-------------|
| **Title** | Corrects formatting, applies Auctionet conventions (UPPERCASE for names), removes redundancy |
| **Description** | Adds material, technique, dimensions, provenance details. Preserves paragraph structure |
| **Condition** | Suggests specific condition terms per Auctionet FAQ guidelines. Avoids vague terms like "bruksskick" |
| **Keywords** | Generates SEK-optimized search keywords based on title, description, and category |

### Key safeguards
- **Hallucination prevention:** AI is instructed never to invent details not present in the source data
- **Paragraph preservation:** Multi-paragraph descriptions maintain their structure through enhancement
- **Unknown artist protection:** If "Okänd konstnär" or "Oidentifierad konstnär" is in the artist field, AI will never inject those terms into other fields during enhancement
- **Context-aware:** Each field enhancement considers all other fields for consistency

---

## 3. Enhance All — Tiered AI Enhancement (Förbättra alla)

A single-click feature that processes ALL form fields simultaneously using a three-tier AI system. The tier is automatically selected based on the item's valuation (bevakningspris), but can be manually overridden. Available on both Edit Item and Add Item pages.

### Tier System

| Tier | Label | Valuation | AI Model | Purpose |
|------|-------|-----------|----------|---------|
| **1 — Städa** | Tidy | < 3,000 SEK | Haiku 4.5 | Mechanical cleanup — reformat and restructure only |
| **2 — Berika** | Enrich | 3,000–10,000 SEK | Sonnet 4.5 + Opus 4.6 (bio) | Structure + short maker/material context |
| **3 — Full** | Complete | > 10,000 SEK | Opus 4.6 | Professional catalog entry with collector relevance |

### What Each Tier Does

**Tier 1 — Städa (< 3,000 SEK)**
- Restructures freetext descriptions into proper order (material, technique, markings, model)
- Moves condition-related text from description to the condition field
- Formats measurements with "ca" prefix at end of description
- Corrects title formatting errors
- Generates 10–12 complementary Swedish keywords
- Adds **nothing** that isn't already in the source data

**Tier 2 — Berika (3,000–10,000 SEK)**
- Everything Tier 1 does, plus:
- Adds 1 identifying sentence about the object
- May add 1 contextual sentence about maker, workshop, or technique (from AI knowledge)
- Adds 1 "positive absence" statement (e.g., "Inga kantnagg observerade")
- Generates 10–12 complementary Swedish keywords including style periods and designer variants
- Parallel API calls: Sonnet for structure + Opus for maker biography (when artist field is populated)

**Tier 3 — Full (> 10,000 SEK)**
- Everything Tier 2 does, plus:
- 2–3 sentences on context and collector relevance (market positioning, historical significance)
- Provenance section (only if provenance data exists in source — never invented)
- Provenance reminder notification when no provenance data is detected
- Systematic condition assessment with 2–3 "positive absence" statements
- Generates 10–12 complementary Swedish keywords
- Uses Opus 4.6 for highest quality output

### User Interface

1. **Panel** in the sidebar (`.grid-col4`) with three tier selector buttons showing price ranges
2. **Auto-selection** based on bevakningspris — updates live when the valuation field changes
3. **Manual override** — click any tier button to force a different tier (shows "Manuellt vald" indicator)
4. **"Förbättra alla fält"** run button triggers the enhancement
5. **Loading progress** — step-by-step indicators (extract → tier → enhance → bio → preview)
6. **Preview modal** — shows before/after for each field (title, description, condition, keywords) with per-field accept/reject checkboxes
7. **Three action buttons:** Cancel, Accept Selected (only checked fields), Accept All
8. **Per-field undo buttons** — after applying enhancements, each enhanced field gets a red "↩ Ångra" button (same styling as individual "Förbättra" buttons) that restores the original value for that field, allowing users to try different tiers without refreshing the page

### Safeguards

- **Hallucination prevention:** Tier 1 adds zero new information. Tier 2–3 may only add context about makers/techniques, never facts about the specific object
- **Artist exclusion from title:** When the artist field is populated, the AI excludes the artist name from the title (enforced both in prompt and by post-processing validation)
- **Unknown artist protection:** "Okänd konstnär" / "Oidentifierad konstnär" terms are stripped from all AI output
- **Subjective word filter:** Forbidden words (fin, vacker, värdefull, unik, elegant, etc.) are automatically removed from results
- **Keyword deduplication:** Keywords already present in title, description, condition, or existing keywords are removed. Both exact and partial matches are checked (e.g., "litografi" matches "färglitografi")
- **Swedish only:** All keywords are generated in Swedish — no English terms. Format: space-separated, hyphens for multi-word phrases (e.g., "svensk-design 1970-tal limited-edition")
- **Paragraph preservation:** Description paragraphs are separated with proper line breaks in both preview and form fields
- **Quality re-analysis:** After applying changes, the quality scoring system re-runs automatically

### Architecture

Four dedicated modules in `/modules/enhance-all/`:

| Module | Purpose |
|--------|---------|
| `tier-config.js` | Tier definitions, thresholds, model assignments, system prompts, user message builder |
| `enhance-all-manager.js` | Main orchestrator — tier selection, API calls (parallel for Tier 2), response parsing with JSON quote sanitizer, hallucination validation, Opus→Sonnet overload fallback |
| `enhance-all-ui.js` | Panel injection, tier selector, loading progress, preview modal, success notifications |
| `field-distributor.js` | Writes AI results to form fields, undo tracking, change event dispatching, quality re-analysis trigger |

Dependencies are wired via setter injection (same pattern as the rest of the extension). The biography system (`BiographyKBCard`) is reused for Tier 2 maker context with its existing 7-day localStorage cache.

---

## 4. Snabbkatalogisering (Quick Cataloging)

A full-featured modal for rapid item creation from images, text, or both. Designed to feel fast and professional, matching Auctionet's clean UI style with progressive field reveal and skeleton placeholders.

### Input Modes

| Mode | Input | Use Case |
|------|-------|----------|
| **Image only** | Paste (Ctrl+V) or drag-and-drop images | Quick cataloging from photos |
| **Text only** | Paste unstructured text (seller email, handwritten notes) | Entry from written descriptions |
| **Image + Text** | Both simultaneously | Most complete analysis |

### How it works

1. Cataloger clicks the **"Snabbkatalogisering"** button on the Add Item page
2. A modal opens with options to paste images and/or text
3. Claude Sonnet AI analyzes the input and generates structured catalog data:
   - Title (Auctionet formatting rules applied), Description, Condition, Artist, Material, Period, Keywords, Valuation
4. Market data is automatically fetched from Auctionet's API to validate/adjust the AI valuation
5. Each field is shown in a preview with confidence scores and per-field "Forbattra" (enhance) buttons
6. Cataloger reviews, edits if needed, and applies to the form

### Image handling

- **Paste support:** Ctrl+V directly into the modal — images are captured from clipboard
- **Drag-and-drop:** Drag images into the upload area
- **Auto-resize:** Images over 5MB are automatically resized via canvas to fit the Anthropic API limit
- **Multi-image support:** Multiple images are analyzed together for a more complete assessment

### Valuation intelligence

- AI generates an initial estimate based on image analysis and description
- Auctionet market data overrides the AI estimate when comparable sales are found
- **Valuation source indicator:** Green banner = "Baserat pa X salda foremal pa Auctionet", Orange banner = "AI-uppskattning — ingen jamforbar marknadsdata"
- Values are rounded to clean auction-appropriate numbers (100 SEK steps, snap to nearest 1000 when close)
- Minimum reserve of 400 SEK enforced

### Keywords

Keywords follow Auctionet standards: space-separated, multi-word phrases hyphenated (e.g., `art-deco guld-halsband jugend`).

### Integration with other systems

- Applied data feeds into the quality control system for immediate validation
- Works on both the Add Item and Edit Item pages
- Per-field "Forbattra" buttons use the same AI enhancement rules as the Edit page

---

## 5. AI Image Analysis

The AI Image Analyzer uses Claude's Vision API to extract catalog-relevant information from item photographs.

### Capabilities
- **Multi-image support:** Up to 5 images per item with categorized slots:
  - Front view (primary)
  - Back view
  - Markings / labels
  - Signature / stamps
  - Condition details
- **Information extraction:** Artist signatures, maker's marks, material identification, condition assessment, style classification, brand/model identification
- **"Sure Score":** Composite confidence metric combining image analysis confidence, detail extraction, and market data validation
- **Format support:** JPEG, PNG, WebP — auto-resize for images exceeding the API limit (4.5MB safety threshold on base64 string length)
- **Market validation:** Cross-references extracted data with Auctionet historical sales
- **Conservative scaling:** Valuation is scaled down when market support is low (40-100% multiplier based on confidence)

---

## 6. Quality Control System

A real-time quality scoring system that monitors all catalog fields and provides actionable feedback.

### Quality Score Dashboard

Three circular progress indicators are displayed on every item page:

| Metric | What it measures |
|--------|-----------------|
| **Totalt** | Overall quality score (0-100%) |
| **Komplett** | Field completeness — are all important fields filled? |
| **Noggrannhet** | Data accuracy — are fields correctly formatted and FAQ-compliant? |

### Quality Rules Engine

The rules engine checks for:

- **Missing fields:** Empty title, description, condition, keywords, category
- **FAQ compliance:** Auctionet-specific cataloging rules (e.g., artist name formatting, condition terminology)
- **Vague language:** Flags generic terms like "bruksskick" and suggests specific alternatives
- **Formatting issues:** UPPERCASE conventions, measurement formats, date formats
- **Missing keywords:** Items without search keywords lose discoverability

### Real-time Monitoring

- Fields are monitored as the cataloger types (debounced updates)
- Quality score updates live without page reload
- Inline hints appear below fields with specific improvement suggestions
- Color-coded severity: red (critical), orange (important), yellow (suggestion)

---

## 7. Market Analysis Dashboard

A comprehensive market intelligence dashboard powered by the Auctionet API, providing real-time pricing data from 3.65M+ historical auction results.

### Dashboard Components

| Section | Content |
|---------|---------|
| **Marknadsvärde** | Median price, price range (min–max), mean price from historical sales |
| **Marknadsstatus** | Current market assessment with trend indicator (rising/stable/falling) and historical percentage change |
| **Dataunderlag** | Sample size — number of analyzed auctions with links to source data |

### Key Features

- **Smart search query generation:** AI extracts optimal search terms from the item's title, artist, and description
- **Quoted search terms:** All search terms are quoted for exact matching in the Auctionet API, preventing false positives
- **Search pills:** Interactive toggleable pills let catalogers refine the search by adding/removing terms
- **Freetext search input:** Power users can type custom search terms to refine results
- **AI relevance validation:** When data spread is high (>5x range), Claude Haiku verifies each result's relevance to the item, filtering out false matches (falls back to Sonnet on overload)
- **Conservative valuations:** Automatic discount applied to suggestions when data is unreliable (10-25% based on spread ratio and AI validation status)
- **Minimum price enforcement:** Suggested reserve price ("Bevakningspris") never goes below Auctionet's 300 SEK minimum
- **Own company exclusion:** Configurable company ID filter to exclude the auction house's own past sales from analysis
- **Smooth UI:** Collapsible dashboard with state persistence (open/closed remembered across page loads), smooth height transitions, loading spinners during refresh

### Valuation KB Card

Hovering over the market status reveals a detailed Knowledge Base card with:
- Reliability assessment (Hög / Medel / Låg) with visual confidence bar
- Full price breakdown (median, range, mean)
- Comparison with the cataloger's current valuation
- Deviation from median percentage
- Suggested valuation and reserve price with one-click "update" buttons
- AI validation badge showing filtered vs. original result count
- Data source footer ("Baserat enbart på Auctionet-data")

---

## 8. Artist Detection & Biography System

### Automatic Artist Detection

When a cataloger enters a title like *"Skulptur, Äpple, brons, plakettsignerad"*, the system:

1. Scans the title for potential artist names using both AI and rule-based detection
2. If an artist is detected, shows a prompt to move the name to the dedicated artist field
3. Generates a cleaned title without the artist name
4. Offers a confidence score for the detection

### Artist Biography KB Card

Hovering over "visa biografi" next to the artist field reveals a rich Knowledge Base card:

- **Artist portrait** (from Wikipedia when available, otherwise initials avatar)
- **Life dates** (birth–death years)
- **Biography** (concise, AI-generated, max 80 words)
- **Style tags** (e.g., "Skulptur i brons", "Pop art-inspirerad", "Dekorativ konst")
- **Notable works** (up to 3 known works with dates)
- **"Lägg till biografi i beskrivning"** button — one-click insertion into the description field
- **"Fel person?"** disambiguation — if the wrong artist is identified, the cataloger can type a hint and re-search

### Artist Ignore System

If the system incorrectly detects an artist, the cataloger can dismiss the suggestion. The artist is added to a session-based ignore list to prevent repeated false positives.

---

## 9. Brand Validation & Inline Spellcheck

### Real-time Inline Validation

As catalogers type in title, description, and artist fields, the inline validator runs three checks in parallel:

1. **Brand validation** — checks against a database of known brands (watches, jewelry, glass, ceramics, furniture, electronics, luxury goods) with fuzzy matching
2. **AI spellcheck** — Claude Sonnet detects general spelling errors in Swedish text, catching misspellings that dictionary-based checks miss (upgraded from Haiku for more reliable detection)
3. **Swedish dictionary check** — validates common Swedish words and auction-specific terms against a built-in word list

Misspelled words are highlighted directly in the field with tooltip corrections — click to auto-correct.

### Artist Field Spellcheck

The artist name field gets specialized validation:

- **Rule-based capitalization** — detects uncapitalized names (e.g., "christan beijer" → "Christan Beijer"), respecting name particles (von, van, de)
- **AI-powered name correction** — Claude Haiku checks artist/designer name spelling (e.g., "Christan Beijer" → "Christian Beijer") — Haiku is sufficient for the simpler name validation task
- Notification appears below the field with a one-click "Fix" button

### False Positive Prevention

- Proper names and place names are filtered out to avoid incorrect suggestions
- Artist field contents are cross-referenced to suppress duplicate flags
- Diacritics-only differences (e.g., "Jarup" → "Järup") require higher confidence
- AI brand validation explicitly ignores person/artist names and place names

### Examples
- "Orrfors" → suggests "Orrefors"
- "Rollex" → suggests "Rolex"
- "Gustafsberg" → suggests "Gustavsberg"
- "christan beijer" (artist field) → suggests "Christian Beijer"

---

## 10. Search Query Intelligence

### Single Source of Truth (SSoT)

All search queries flow through a centralized SSoT system that ensures consistency:

- AI generates optimal search terms from title, description, artist, and category
- Terms are categorized: artist, brand, object type, model, descriptive
- Pre-selected terms (2-3 most important) form the initial search
- Candidate terms are available as interactive pills for refinement
- All terms are automatically quoted for exact Auctionet API matching

### Interactive Search Pills

The dashboard header shows clickable pills for each search term:
- **Blue (selected):** Currently active in search — click to remove
- **Gray (unselected):** Available refinement — click to add
- **Freetext input:** Type any term and press Enter to add it to the search
- Toggling any pill triggers an instant re-analysis with updated results

### Auctionet API Integration

- Searches both historical (ended) and live (ongoing) auctions
- Pagination support for large result sets
- 30-minute result caching to minimize API calls
- Company exclusion filter for self-referencing prevention

---

## 11. Valuation Request Assistant

A dedicated tool for the valuation request pages (`/admin/sas/valuation_requests/*`), where customers submit photos and descriptions of items they want valued. The assistant analyzes the submission and generates a ready-to-send valuation email — including automatic multi-object detection when a customer sends images of different items in the same request.

### How it works

1. The extension detects a valuation request page and injects a **"Vardering"** panel in the sidebar
2. Staff clicks **"Analysera och vardera"**
3. The system:
   - Fetches up to 10 customer images from the page (via background service worker for CORS-safe cross-origin loading)
   - Auto-resizes oversized images to fit the API limit (4.5MB safety threshold on base64 string length)
   - **Image clustering:** If multiple images are present, Claude Opus first classifies them into groups by distinct object (e.g., "Images 1-3 = oil painting, Images 4-5 = glass vase, Image 6 = silverware"). If only one group is detected, the clustering step is skipped silently
   - **Drag-and-drop grouping UI:** When multiple objects are detected, a confirmation screen shows the AI's proposed grouping with draggable thumbnails. Staff can drag images between groups, add new groups, remove groups, and edit labels before proceeding
   - **Per-group valuation:** Each confirmed group is analyzed independently in parallel — its own AI analysis, market data search, and valuation
   - For each group/item, sends images + customer description to **Claude Opus 4.6** for analysis (falls back to Sonnet on overload)
   - Extracts structured data: object type, brand/maker, artist, model, material, period, **number of auction lots**, **piece count**, and **set detection**
   - Searches Auctionet market data using progressive fallback queries (brand+model+artist → brand+model → artist+model → brand+artist → brand+type → artist+type → brand → artist → type+material)
   - **IQR outlier removal:** Filters statistically extreme prices using standard 1.5x Interquartile Range fences
   - **AI relevance filtering:** Claude Haiku validates each search result's relevance when data spread is high (>5x) or sample is large (>15 items)
   - **Median-based valuation:** Uses the statistical median of filtered comparable sales
   - Applies valuation rounding and minimum auction threshold (300 SEK)
   - **Customer price anchoring prevention:** AI is explicitly instructed to ignore any price suggestions or desired reserve prices stated by the customer
4. Results are displayed with:
   - **Multi-group summary:** Green banner with object count and total value when multiple groups exist
   - **Per-group result cards:** Compact horizontal layout with thumbnail, object label, price, source tag (market/AI), confidence, "Salda" link, and individual search query editor per group
   - **Single-object results:** Source indicator, description, value box, set/lot info, Auctionet link, search editor, and email textarea
   - **"Se salda objekt pa Auctionet.com"** — verification link to review comparable sold items
   - **Search query editor** — editable input per group (or single global one) + "Sok igen" button for manual market search refinement without re-running image analysis
   - Editable email textarea with the full response pre-filled
   - "Kopiera" (copy to clipboard) and "Skicka" (mailto: link) buttons
5. The existing "Ja tack" button's placeholder is also updated with the valuation

### Set/Lot valuation logic

The system distinguishes between sets (collections that sell as one auction lot) and genuinely separate items:

| Scenario | numberOfLots | pieces | isSet | Valuation |
|----------|-------------|--------|-------|-----------|
| Dinner service, 56 pieces | 1 | 56 | true | Market median for the whole set (e.g., 500 SEK) |
| Pair of chairs | 1 | 2 | true | Market median for the pair |
| Cutlery set, 69 pieces | 1 | 2 | true | Market median for the set |
| 3 different items (painting + vase + chair) | 3 | 3 | false | Market median x 3 |

This prevents the previous bug where a 56-piece dinner service would be valued at 300 SEK/piece x 56 = 16,800 SEK when the whole set actually sells for ~500 SEK.

### Image clustering

When a customer sends photos of multiple different objects in the same valuation request:

1. **Clustering call:** Claude Opus analyzes all images and groups them by distinct object, returning JSON with image indices and labels per group (falls back to Sonnet on overload)
2. **Single-object skip:** If only one group is detected, the clustering step is invisible and the existing single-object flow runs directly
3. **Confirmation UI:** Groups are shown as drop zones with draggable 80x80 thumbnails (HTML5 Drag and Drop API, no external libraries). Staff can:
   - Drag images between groups to correct misclassifications
   - Edit group labels
   - Add new empty groups ("+ Ny grupp")
   - Remove groups (images are moved to the first remaining group)
4. **"Vardera alla" button** proceeds to parallel per-group valuation

### Multi-section email templates

When multiple objects are detected, the email uses clear per-object sections with unicode visual separators for readability:

```
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
▸ Foremal 1: Arabia Kaira kaffeservis
Stor Arabia Kaira te- och kaffeservis i stengods...
Uppskattat varde: 600 kr

╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
▸ Foremal 2: Arabia Tunturi teservis
Arabia Tunturi teservis i stengods...
Uppskattat varde: 400 kr

════════════════════════════════
Totalt uppskattat varde: 1 000 kr (2 foremal)
════════════════════════════════
```

- **Plain text only** — no HTML, no links, no images to minimize spam filter risk (even with DMARC/SPF verified domains)
- Items below the 300 SEK auction threshold are noted individually per section
- Accept/reject logic considers each item's value independently
- Both Swedish and English templates supported

### Search query handling

The valuation assistant bypasses the standard `formatArtistForSearch` quoting (which wraps multi-word strings as a single exact phrase) and calls the Auctionet API directly. Each word in the query is quoted individually, matching how the Auctionet website search works. This ensures queries like "Robert Hogfeldt print" find results by requiring all terms separately, rather than searching for the exact phrase.

### Email templates (single object)

- **Accept template (Swedish/English):** Professional response emphasizing online auctions on Auctionet.com with global reach (900k+ buyers, 180 countries, 5.5M monthly visits). Clearly states the valuation is preliminary and that physical inspection is required for a final estimate. Includes auction house address and phone number.
- **Reject template (Swedish/English):** Polite response explaining the item's estimated value is below the auction threshold, noting the assessment is preliminary.
- Language follows the page's email language selector
- No "AI" branding — the tool presents itself neutrally as "Vardering" to avoid user apprehension

### Page data scraped

| Data | Source |
|------|--------|
| Customer name | Page heading |
| Customer email | mailto: link in info table |
| Description | Text after "Vad som ska varderas" heading |
| Images | `.valuation-request-page__image img` elements (full-size URLs) |
| Email language | `#locale_for_mail` selector |

---

## 12. Admin Dashboard Enhancements

Visual enhancements for the main admin page (`/admin/sas`) that transform existing data into actionable infographics. No AI calls — all data is scraped from the existing DOM and rendered as visual components.

### KPI Hero Cards

Organized into two distinct rows for clear visual hierarchy:

**Row 1 — Action Items:** Color-coded, clickable cards from Auctionet's built-in alerts and sidebar counts:

| Card | Source | Color |
|------|--------|-------|
| Varderingsforfragan att besvara | `.requested-actions` | Orange |
| Reklamationer/angerratter | `.requested-actions` | Red |
| Exportinformation | `.requested-actions` | Yellow |
| Opublicerbara foremal | Sidebar turbo-frame count | Orange |
| Hantera salda foremal | Sidebar turbo-frame count | Green |
| Hantera plocklista | Sidebar turbo-frame count | Blue |
| Omlistas ej automatiskt | Sidebar turbo-frame count | Yellow |

**Row 2 — Insikter (Insights):** Smaller, lighter cards for extension-added metrics, separated by a thin divider and "Insikter" label:

| Card | Source | Color |
|------|--------|-------|
| Inskrivet idag | Daily registration count + SEK value from Flödesstatistik | Blue |
| Senaste kommentarer / Kommentarer idag | Comment feed | Blue |
| Reklamationskommentarer (7d) | Claim-type comments from last 7 days | Red |
| Högvärde med fel | Publication scan cache — high-value items (≥ 3,000 SEK) with quality issues | Purple |

Each card links to the corresponding admin page for immediate action. The Reklamationskommentarer card links to `/admin/sas/comments?filter=reklamation`, pre-activating the Reklamation filter on the comments page. The "Högvärde med fel" card links to the publication scanner panel (`#ext-pubscan`). The two-row layout clearly separates Auctionet's "Reklamationer" action count from the extension's claim comment tracking.

### Comment Feed

The dashboard replaces the default "Allas kommentarer" section with a visually rich comment feed:

- **Avatars** with author initials and color-coded backgrounds
- **Entity type badges** — color-coded labels (Föremål, Köpare, Säljare, Reklamation, Faktura, Transport)
- **Relative timestamps** (e.g., "3 tim sedan", "Igår 14:30", "28 jan")
- **Fully clickable rows** — click anywhere on a comment to navigate to the related entity page
- **Inner link preservation** — links within comment bodies (e.g., invoice downloads) work independently from the row click
- Truncated body text (140 chars) for compact display
- "Visa alla" link to the full comments page

### Warehouse Cost Card

A compact inline card showing accumulated warehouse storage fees for items not yet collected. Data is scraped from the paginated `/admin/sas/solds?filter=to_be_collected` list pages.

- **Primary metric:** 30-day warehouse cost in large text (most actionable — recent items the team can still follow up on)
- **Secondary metrics:** 90-day and all-time totals shown smaller to the right
- **Data source:** Parses the "Avgiftsbelagda lagerdagar" column (format: `NN / 0`) from each table row, auto-detecting the column index from `<thead>` headers
- **Pagination:** Detects total pages via result count text or pagination link inspection, fetches all pages in batches of 5 concurrent requests
- **Caching:** Results cached in `chrome.storage.local` for 12 hours with manual refresh button
- **Fee calculation:** Total days x 100 SEK/day
- **Admin-only:** Only visible when admin mode is unlocked via PIN (see Settings)

### Pipeline Funnel (30-day)

Horizontal funnel visualization of the item lifecycle from the Flodesstatistik table:

```
Inskrivet (1265) → Publicerat (1131) → Salt (847) → Aterrop (42)
```

- Conversion rates between stages (e.g., 89% published, 75% sold)
- **Year-over-year comparison** ("Vecka mot vecka YoY"): Compares last week vs the same week one year ago with colored trend arrows for registered, sold, average price, and recall rate

### Pricing Insights Cards

Four metric cards extracted from the Flodesstatistik:

| Card | What it shows |
|------|---------------|
| **Snittpris** | 30-day average price with 7-day trend arrow and 1-year comparison |
| **Varderingstraff** | Accuracy of valuations vs actual hammer prices (avg valuation / avg price). Green 90-110%, orange 80-90%, red below 80% |
| **Utropstackning** | How well reserves are covered by final prices (avg price / avg reserve) |
| **Aterropsandel** | 30-day recall rate with color coding (green ≤5%, orange ≤10%, red >10%) and 1-year trend |

### Cataloger Leaderboard

Enhances the existing Inskrivningsstatistik table:

- Gold star badge on the top performer (by monthly average)
- Inline bar charts for each employee's monthly cataloging count
- Zero cells are muted for visual clarity

### Inventory Health Bar

Stacked bar chart showing distribution of items across states:

- Opublicerbara (orange), Salda att hantera (green), Omlistas ej (yellow), Plocklista (blue)
- Color-coded legend with counts
- Provides an at-a-glance view of where items are piling up

### Publication Queue Scanner

A quality scanner that proactively checks all items in the publication queue before they go live, identifying critical errors and warnings without leaving the dashboard. Runs entirely in the background service worker — scans execute every 10 minutes regardless of whether the dashboard tab is open, so users always see fresh data when they navigate to the dashboard.

**Architecture:**

The scanner runs in the background service worker (`publication-scanner-bg.js`), not in the dashboard content script. This means scans happen automatically even when the user is working on other pages. Since Chrome MV3 service workers don't have `DOMParser`, HTML parsing is delegated to a Chrome Offscreen Document (`offscreen.html` / `offscreen.js`) via `chrome.runtime.sendMessage`.

**How it works:**

1. **Background alarm** fires every 10 minutes via `chrome.alarms`, plus an immediate scan on extension install/update via `chrome.runtime.onInstalled`
2. Service worker creates an offscreen document for DOMParser access
3. Fetches the `/admin/sas/publishables` page (with `credentials: 'include'` for cookie-based auth) and delegates HTML parsing to the offscreen document
4. **Phase 1 (fast):** Checks for missing images and empty/short titles from the list page data
5. **Phase 2 (deep):** For each item, fetches the show page (images, description, condition) and edit page (title, artist, hidden keywords) in parallel, in batches of 5 concurrent requests
6. Runs quality checks against the same thresholds as the quality rules engine
7. Caches results in `chrome.storage.local` and notifies any open dashboard tabs via `chrome.tabs.sendMessage`
8. Dashboard renders cached results immediately on load; listens for `publication-scan-complete` / `publication-scan-failed` messages to refresh
9. Progress updates (e.g., "Skannar 12/32...") are written to `chrome.storage.local` and picked up reactively by the dashboard via `chrome.storage.onChanged`
10. Manual "Kör nu" button sends `run-publication-scan` message to the background service worker for an immediate full scan

**Quality checks performed:**

| Check | Threshold | Severity |
|-------|-----------|----------|
| Missing images | 0 images | Critical 🔴 |
| Few images | 1–2 images (< 3) | Critical 🔴 |
| Spelling errors | AI spellcheck (Sonnet), dictionary fallback | Critical 🔴 |
| Artist name in title | ALL CAPS name at start of title (edit page only) | Critical 🔴 |
| Short title | < 15 characters | Warning 🟡 |
| Short description | < 40 characters | Warning 🟡 |
| Vague condition | Only "bruksslitage" etc. | Warning 🟡 |
| Short condition | < 15 characters | Warning 🟡 |
| Missing keywords | No hidden keywords | Info (count only) |

**High-value item tracking:**

Items with an estimate ≥ 3,000 SEK are flagged as "high value" throughout the scanner:
- Each high-value item displays a 💎 badge with its estimate in the item row
- A dedicated **"Högvärde (≥ 3 000 SEK) med fel"** accordion group appears at the top, sorted by estimate descending, so the most valuable items with issues are immediately visible
- The summary bar includes a 💎 count of high-value items with issues
- A KPI insight card on the dashboard shows the total count for at-a-glance awareness

**UI — Collapsible filter groups:**

- Summary bar shows totals: critical count, warning count, OK count, keywords info, and high-value issue count
- Issues are grouped by type (e.g., "Kort beskrivning (< 40 tecken)") as clickable accordion rows
- Each group shows a severity dot (🔴 critical / 🟡 warning), issue description, and item count
- Critical groups (images, spelling) sort first, warning groups (text quality) follow
- Click a group to expand inline and see the matching items underneath
- "Visa alla" group at the top shows all items with issues at once
- Accordion behavior — only one group expanded at a time
- Each item row links to the show page; separate "Redigera" link navigates to the edit page
- "Kör nu" button triggers a manual full re-scan with live progress indicator
- **Sidebar nav indicator:** The "Publicerbara föremål" menu item turns red with critical count `(2 🔴) ↓` when critical issues exist, or orange `(⚠) ↓` for warnings only. The ↓ arrow scrolls smoothly to the scanner panel.
- **Per-item ignore:** Each issue row has a ✕ button to ignore false positives (e.g. litografi items that only need 2 images). Ignored items are stored persistently in `chrome.storage.local` and excluded from active counts and nav badge. A "Visa ignorerade (N)" toggle at the bottom shows ignored items with ↩ unignore buttons to restore them.

**Spellcheck integration:**

The scanner calls the Anthropic API directly from the service worker (no message-passing needed since it's already in the background). Claude Sonnet checks the combined title, description, and condition text of each item for Swedish spelling errors. Falls back to a dictionary imported from `SwedishSpellChecker.getMisspellingsMap()` if no API key is configured.

### Technical details

- **Mostly zero API calls** — KPI cards, pipeline, pricing insights, cataloger stats are all scraped from the existing page DOM. The warehouse cost widget fetches additional Auctionet admin pages (same-origin). The publication scanner runs in the background service worker and calls Claude Sonnet for spellcheck (one API call per item with text content)
- **Background scanning** — the publication scanner runs in `publication-scanner-bg.js` (background service worker), independent of the dashboard tab. The dashboard content script (`admin-dashboard.js`) only reads cached results from `chrome.storage.local` and listens for completion messages
- **Progressive rendering** — components render immediately with available data; lazy-loaded turbo-frame content is picked up via MutationObserver as it arrives
- **Admin-gated** — all dashboard enhancements require admin mode to be unlocked via PIN; otherwise the page loads as vanilla Auctionet
- Lightweight self-contained async IIFE — no module imports needed

---

## 13. Sales Analytics Dashboard (Försäljningsanalys)

A standalone, full-featured analytics dashboard for data-driven business decisions. Accessible as a Chrome extension page (`chrome-extension://<id>/analytics.html`) — completely separate from the admin dashboard. Powered by the Auctionet public API with optional AI-powered analysis via Claude Sonnet 4.5.

### How to Access

- **Extension popup:** Click "Öppna Försäljningsanalys" button in the popup
- Opens in a new browser tab as a standalone page

### Dashboard Components

**Header Bar:**
- Company selector dropdown (pre-populated with previously fetched auction houses)
- Manual company ID input for any Auctionet house
- Fetch / Refresh / CSV Export / AI Analysis buttons
- Dark mode toggle (persisted in localStorage, respects system preference)
- Meta line showing house name, last update time, and total item count

**Layout: Sidebar + Content**

Fixed 240px left sidebar with independent scrolling. Main content area scrolls separately. Sidebar hidden on screens ≤1024px.

**Sidebar Filters (instant client-side filtering):**

| Section | UI | Options |
|---------|-----|---------|
| **År (Year)** | 2-column button grid | All years discovered in the dataset |
| **Månad (Month)** | 3×4 button grid | Jan–Dec (toggle on/off) |
| **Kategori (Category)** | Scrollable list with counts | All parent categories with item counts for current year+month |
| **Prisintervall (Price Range)** | Radio-style list | Alla, 300 kr, 301–500, 501–1 000, 1 001–2 000, 2 001–5 000, 5 001–10 000, 10 000+ |

Bottom of sidebar shows active filter summary, "Rensa alla filter" button when filters are active. All filter changes trigger instant re-render — no API calls, pure client-side filtering on cached data.

**Two-Tier KPI Cards with Sparklines:**

KPI cards are split into two rows to separate universal auction metrics (comparable across houses) from house-specific financial data.

**Row 1 — Universal Metrics** (always shown, pure API data):

| KPI | Description |
|-----|-------------|
| **Sålda föremål** | Total items sold in the filtered period |
| **Klubbat värde** | Total hammer price (raw auction prices, no fees) |
| **Snittpris (klubbat)** | Average hammer price per item |
| **Andel vid minbud** | Percentage of items sold at exactly 300 kr (minimum bid). Trend is inverted — lower is better |

**Row 2 — "Vår ekonomi"** (only when viewing own house, set via `ownCompanyId`):

| KPI | Description |
|-----|-------------|
| **Omsättning** | Gross revenue including buyer premium — hammer × 1.196 (empirical rate from resultatrapport) |
| **Nettointäkt (uppsk.)** | Estimated net revenue — hammer × 0.300 (empirical rate accounting for variable seller fees 0-20%, buyer premium, and Auctionet provision) |
| **Netto/föremål** | Average net revenue per item sold |

The "Vår ekonomi" row uses empirical multipliers derived from the 2025 resultatrapport rather than theoretical fee rates, because seller fees vary by contract (0%, 8%, 15%, 20%) and some items are sold under margin scheme (momsfri) with lower buyer premium. The empirical rates account for the real mix.

Each card shows a YoY trend indicator (▲/▼/—) with percentage change compared to the same period one year prior. For the current year, YoY comparison uses only completed months for fair comparison. SVG sparklines show monthly trends for the selected year with interactive hover — a crosshair line and dot follow the mouse smoothly along the curve, with a tooltip showing the nearest month's value.

**Monthly Overview Chart:**
- Vertical bar chart showing items sold per month for the selected year
- Clickable bars to filter by month
- Active month highlighted with accent color
- Tooltip with count, revenue, and average price per month
- Overall average price displayed below

**Price Distribution Chart:**
- Horizontal bar chart with 7 price brackets: 300 kr, 301–500, 501–1 000, 1 001–2 000, 2 001–5 000, 5 001–10 000, 10 000+
- Shows count, percentage, and cumulative percentage for each bracket
- Clickable bars to filter by price range (synced with sidebar price filter)
- Price point annotations: "Vid minbud: X%", "Under 500 kr: X%", "1 000+ kr: X%"

**Category Breakdown Table:**
- All 25 parent categories with inline bar charts
- Columns: Category name, visual bar, item count, revenue (Oms.), average price (Snitt)
- Sortable columns with sort indicators (⇅ inactive, ▲/▼ active) — click to sort by count, revenue, or average price
- Clickable rows to filter by category (synced with sidebar category filter)

**Top 10 Most Expensive Items:**
- Ranked list of highest-priced items in the filtered period
- Shows rank, price, category, date, and link to Auctionet search
- Summary: percentage of total revenue from top 10 items

**Yearly Prediction:**
- Extrapolates full-year totals from completed months (shown only for current year with no active filters)
- Displays predicted count, revenue, and average price alongside current actuals
- Basis indicator: "baserat på N avslutade månader"

**AI-Powered Analysis (on-demand):**

An optional AI analysis feature powered by Claude Sonnet 4.5, triggered by the "AI-analys" button in the header. Sends a compact data summary (~800-1200 tokens) to Claude and returns structured insights in four categories:

| Section | Icon | Content |
|---------|------|---------|
| **Strategiska insikter** | 💡 | High-level strategic findings based on the data |
| **Åtgärder** | ✅ | Specific, actionable steps to improve |
| **Riskvarningar** | ⚠️ | Identified risks or concerning trends |
| **Möjligheter** | 🚀 | Growth opportunities and positive signals |

Key features:
- **Context-aware:** System prompt includes Swedish auction market context, fee structure, seasonality patterns
- **Date-aware:** Knows today's date; avoids drawing conclusions from incomplete months
- **Own house vs. competitor:** When viewing own house (`isOwnHouse=true`), analyzes financial metrics (omsättning, nettointäkt). For other houses, focuses only on market data
- **Same-period YoY:** Compares only completed months to avoid misleading year-to-date comparisons
- **Constructive tone:** Instructed to be solution-oriented, not alarmist — presents challenges as improvement opportunities
- **TL;DR summary card:** A compact summary card appears after the KPI grid showing the top finding from each section, with a "Visa fullständig analys" link to the full panel
- **Session caching:** Results are cached per company+filter combination within the session; no API call on filter toggle-back
- **Prompt caching:** System prompt uses `cache_control: { type: 'ephemeral' }` for ~90% token savings

### Data Fetching Strategy

The Auctionet API caps at 10,000 items per query (50 pages × 200 items). The dashboard handles this transparently:

| Scenario | Strategy | API Calls |
|----------|----------|-----------|
| Small house (<10k items) | Direct pagination | Up to 50 pages |
| Large house (>10k items) | Category sharding — fetches each of 25 parent categories separately | ~100–250 calls |
| Subsequent visits | Incremental update — fetches pages 1–10 until overlap with cached data | 1–10 calls |
| Manual refresh | Full re-fetch from scratch | Same as initial |

**Category sharding:** Querying `category_id=25` (Konst) returns all items in subcategories (26, 27, 28, 29, 30, 119). The 25 parent categories provide complete coverage of all 135 subcategories.

**Progress feedback during fetch:**
- Animated progress bar with CSS shimmer animation
- Per-page text updates (e.g., "Kategori 5/25, sida 12 — 42,000 föremål")
- Phase indicators: direct → switching-to-sharded → sharded-page → saving → done

### Caching

- **Storage:** `chrome.storage.local` with `unlimitedStorage` permission
- **Key format:** `analytics_${companyId}` — one blob per company
- **Item compression:** ~100 bytes/item vs ~2KB raw (stores only: id, price, estimate, reserve, reserve_met, category_id, end_date, starting_bid)
- **TTL:** 24 hours — shows "last updated X hours ago" in the meta line
- **Incremental updates:** After initial fetch, subsequent loads only fetch new items and merge with the existing cache
- **Size:** ~15k items × 100 bytes ≈ 1.5 MB per company

### Competitor Analysis

The same dashboard works for any auction house — simply enter a different company ID or select from the dropdown. Previously fetched companies are auto-discovered from the cache and appear in the dropdown. House names are auto-detected from item data (each API item has a `house` field).

### Category Registry

Complete mapping of 135 Auctionet sub-category IDs → 25 parent categories with Swedish names. Hardcoded in `category-registry.js`. Parent categories include: Konst, Möbler, Silver & Metall, Smycken, Keramik, Glas, Mattor, Vapen, Klockor, Böcker, and 15 more.

### Architecture

Five dedicated modules in `/modules/analytics/`:

| Module | Purpose |
|--------|---------|
| `data-fetcher.js` | Paginated API fetching with automatic category sharding for >10k items |
| `data-cache.js` | chrome.storage.local cache with compression, TTL, and known-company discovery |
| `data-aggregator.js` | KPI computation, YoY comparison, monthly/price/category breakdowns, price range filtering |
| `category-registry.js` | 135 sub-category → 25 parent category mapping with Swedish names |
| `filter-state.js` | Reactive filter state (year, month, category, price range) with event emitter pattern |
| `ai-insights.js` | On-demand AI analysis via Claude Sonnet 4.5 — data summary builder, API call, response parsing, and rendering |

Entry point: `analytics.js` (~1000 lines) — bootstraps all modules, renders sidebar filters and full dashboard with DOM manipulation and event delegation.

### Technical Details

- **Minimal AI calls** — data display is pure Auctionet public API; AI analysis is on-demand only (one Claude Sonnet 4.5 call per analysis)
- **Standalone extension page** — native ES6 module imports, no CSS conflicts, full `chrome.*` API access
- **CSS-only charts** — horizontal bars via percentage widths, SVG polyline sparklines, no chart library dependencies
- **`.ad-` class prefix** (analytics-dashboard) to avoid any naming conflicts
- **Sidebar + content layout** — fixed 240px sidebar with independent scrolling, responsive (hides at ≤1024px)
- **Dark mode** — full dark theme via CSS custom properties, toggle in header, persists in localStorage
- **CSV export** — exports filtered items with ID, price, estimate, reserve, category, and date
- **Own house detection** — `ownCompanyId` setting (stored in `chrome.storage.sync`) determines whether house-specific financial KPIs are shown. When viewing another house, only universal hammer-price metrics are displayed
- **Empirical fee multipliers** — revenue estimates use multipliers derived from actual 2025 resultatrapport data (GROSS_MULTIPLIER=1.196, NET_MULTIPLIER=0.300) rather than theoretical fee rates, accounting for the real mix of variable seller fees and margin scheme items

---

## 14. Comment Visibility System

A cross-page system that makes comments more visible and easier to act on across the entire Auctionet admin. Powered by `comment-enhancer.js` — a lightweight script with zero AI calls that enhances comment UX through pure DOM manipulation.

### Comment Indicator Badge

On item pages, seller pages, buyer pages, and return claim pages, the extension injects a floating indicator badge near the top of the sidebar:

- Shows the number of existing comments
- Click to smooth-scroll to the comment section with a highlight animation
- If no comments exist, shows "Lägg till kommentar" and focuses the textarea on click
- Enhances the comment section with a heading if one is missing

### Rich Comments Feed (`/admin/sas/comments`)

The "All Comments" listing page is transformed from a plain list into a visually rich, interactive feed:

- **Avatars** with initials and deterministic color-coding per author
- **Entity type badges** — Reklamation (red), Köpare (green), Föremål (blue), Säljare (purple), Faktura (teal), Transport (gray)
- **Relative timestamps** — "Just nu", "5 min sedan", "Igår 09:48", "28 jan"
- **Fully clickable rows** — click anywhere on a comment row to navigate to the entity. Inner links (e.g., invoice downloads, item references) work independently and are not intercepted
- Replaces the original `<ul>` list while preserving it hidden for compatibility

### Entity Type Filter Bar

A horizontal pill-based filter bar above the comments feed on `/admin/sas/comments`:

| Filter | Badge Class | Color |
|--------|------------|-------|
| Alla | — | Gray (default) |
| Reklamation | `--claim` | Red |
| Köpare | `--buyer` | Green |
| Föremål | `--item` | Blue |
| Säljare | `--seller` | Purple |
| Faktura | `--invoice` | Teal |
| Transport | `--transport` | Gray |

**Filter behavior:**
- Click a pill to show only comments of that type; click "Alla" to reset
- Active filter count displayed ("8 kommentarer")
- **URL-synced filters:** Active filter is written to the URL (`?filter=reklamation`) so pagination preserves it across pages
- **Dashboard card integration:** The Reklamationer KPI card links to `?filter=reklamation` which auto-activates the filter on arrival
- Filters update pagination links in real-time — switching filters immediately updates all page links

### Entity Badges on All Pages

Even on individual item, seller, buyer, and return claim pages, the existing comment lists get color-coded entity type badges injected next to each comment's entity reference. This provides visual consistency across all admin views.

### Technical Details

- **Zero API calls** — all data is scraped from the existing DOM
- **Universal injection** — runs on all `/admin/*` pages (excluding dashboard and login)
- **Lightweight IIFE** — no module imports, no dependencies
- **Graceful degradation** — silently skips pages with no comment sections

---

## 15. AML / Anti-Money Laundering Compliance

The quality rules engine includes automated AML compliance reminders that flag high-risk items during cataloging.

### Flagged Scenarios

| Scenario | Trigger | Severity | Reminder |
|----------|---------|----------|----------|
| **Loose gemstones** | Title/description contains "lösa ädelstenar" or gemstone category without jewelry context | High | Requires certificates (GIA/HRD/IGI/GRS/DSEF/SSEF), provenance, and seller identity verification |
| **High-value items** | Valuation ≥ 50,000 SEK | Medium | Verify seller risk profile and ID are up to date |
| **Bullion / gold lots** | Gold/silver bars, coin collections, or bulk precious metals | Medium | Verify seller identity, ownership duration, and document in risk profile |

### How it appears

AML warnings appear as highlighted alerts in the quality control sidebar alongside other cataloging warnings. They are labeled with the "AML" source tag and cannot be dismissed — they serve as reminders only and do not block the cataloging workflow.

---

## 16. Unknown Artist Handling

The extension respects Auctionet's convention for unsigned and unidentified works:

| Term | Meaning | When to use |
|------|---------|-------------|
| **Okänd konstnär** | Unknown artist | Work is unsigned — no artist identity can be determined |
| **Oidentifierad konstnär** | Unidentified artist | Work is signed but the artist cannot be identified |

### Detection & Prompting

If phrases like "oidentifierad konstnär", "okänd konstnär", or similar variations appear in the title or description (but NOT in the artist field), the system prompts the cataloger to move the term to the artist field and offers two distinct buttons for the correct choice.

### AI Protection

When these terms are present in the artist field:
- AI enhancement buttons will **never** add them to title, description, or other fields
- The `stripUnknownArtistTerms` utility ensures they are removed from AI-generated content if they leak through
- Paragraph structure in descriptions is preserved during this stripping

---

## 17. Settings & Configuration

The extension popup (`popup.html`) provides:

| Setting | Purpose |
|---------|---------|
| **API Key** | Anthropic API key for Claude AI access |
| **Artist Info Toggle** | Enable/disable automatic artist detection and biography features |
| **Dashboard Visibility** | Show/hide the market analysis dashboard by default |
| **Företags-ID (ownCompanyId)** | Your auction house's Auctionet company ID — enables house-specific financial KPIs in analytics, excludes own sales from market analysis |
| **Search Defaults** | Auto-add `type=item&sorting=desc` to search pages (newest items first). Toggleable via popup checkbox and an on-page toggle bar below the navbar on search pages |
| **Connection Test** | One-click API connectivity verification |
| **Försäljningsanalys** | "Öppna Försäljningsanalys" button — opens the standalone sales analytics dashboard in a new tab |
| **Admin PIN** | 4-digit PIN to unlock admin-only features (dashboard enhancements, warehouse costs) |

All settings are stored in Chrome's sync storage (except the API key and admin PIN hash, which use local storage for security).

### Admin Mode (PIN-protected)

The extension supports two roles:

- **User mode (default):** All cataloging features work normally — edit page, add page, spellcheck, artist detection, image analysis, comment enhancer, valuation requests. The admin dashboard page loads without extension enhancements.
- **Admin mode:** Unlocked by entering a 4-digit PIN in the extension popup. Enables dashboard enhancements (KPI cards, pipeline funnel, warehouse costs, pricing insights, cataloger leaderboard, comment feed).

The PIN is hashed with SHA-256 before storage. Admin state is stored in sync storage so it persists across browser sessions. A "Lock" button in the popup re-locks admin mode instantly. This is a soft lock — it prevents casual access to sensitive operational data, not a cryptographic security boundary.

---

## 18. Technical Architecture

### Module Structure

```
auctionet-extension/
├── manifest.json                          # Chrome extension manifest (V3)
├── background.js                          # Service worker (API proxy, image fetching, scan scheduling)
├── publication-scanner-bg.js              # Background publication scanner (ES module)
├── offscreen.html / offscreen.js          # Offscreen document for DOMParser (service worker can't use DOM)
├── content-script.js                      # Edit page entry point
├── content.js                             # Add/view page entry point
├── valuation-request.js                   # Valuation request page entry point
├── admin-dashboard.js                     # Admin dashboard visual enhancements
├── admin-item-banner.js                   # Item show page enhancement banner
├── comment-enhancer.js                    # Cross-page comment visibility & rich feed
├── analytics.html / analytics.js          # Standalone sales analytics dashboard
├── popup.html / popup.js                  # Settings popup
├── styles.css                             # Main stylesheet
│
├── modules/
│   ├── api-manager.js                     # Claude API orchestration
│   ├── auctionet-api.js                   # Auctionet market data API
│   ├── valuation-request-assistant.js     # AI valuation for customer requests
│   ├── quality-analyzer.js                # Main quality analysis engine
│   ├── sales-analysis-manager.js          # Market analysis coordinator
│   ├── dashboard-manager-v2.js            # Market dashboard UI
│   ├── search-query-ssot.js               # Search query Single Source of Truth
│   ├── search-filter-manager.js           # Search term extraction & filtering
│   ├── ai-search-rules.js                 # AI search query generation rules
│   ├── ai-search-query-generator.js       # AI query builder
│   ├── artist-detection-manager.js        # Artist name detection engine
│   ├── artist-ignore-manager.js           # False positive artist ignore list
│   ├── brand-validation-manager.js        # Brand spelling validation
│   ├── inline-brand-validator.js          # Real-time inline brand checking
│   ├── search-term-extractor.js           # Material/period/technique extraction
│   ├── data-extractor.js                  # Form field data extraction
│   ├── ui-manager.js                      # Edit page UI management
│   ├── config.js                          # Configuration & feature flags
│   ├── item-type-handlers.js              # Category-specific logic
│   ├── swedish-spellchecker.js            # Swedish language spell checking
│   ├── auctionet-artist-lookup.js         # Auctionet artist API (future)
│   ├── add-items-api-bridge.js            # Bridge between Add Items and Edit page API
│   ├── add-items-integration-manager.js   # Add page component wiring and UI features
│   ├── add-items-tooltip-manager.js       # Add page tooltip orchestrator
│   │
│   ├── enhance-all/                       # Enhance All tiered AI enhancement
│   │   ├── tier-config.js                 # Tier definitions, thresholds, system prompts
│   │   ├── enhance-all-manager.js         # Main orchestrator (API calls, validation)
│   │   ├── enhance-all-ui.js             # Panel, tier selector, preview modal
│   │   └── field-distributor.js           # Field writing, undo, change events
│   │
│   ├── core/                              # Shared core modules
│   │   ├── biography-kb-card.js           # Artist biography Knowledge Base card
│   │   ├── biography-tooltip-manager.js   # Biography tooltip positioning
│   │   ├── quality-rules-engine.js        # Quality + AML rules
│   │   ├── quality-ui-renderer.js         # Quality indicator rendering
│   │   ├── market-analysis-orchestrator.js# Market analysis workflow
│   │   ├── ai-analysis-engine.js          # AI analysis coordination
│   │   ├── ai-enhancement-engine.js       # Field enhancement logic
│   │   ├── brand-action-handler.js        # Brand correction click handlers
│   │   ├── ui-feedback-manager.js         # Loading/success/error feedback
│   │   ├── circular-progress-manager.js   # Quality score circles
│   │   ├── tooltip-manager.js             # Reusable tooltip component
│   │   ├── html-escape.js                 # XSS prevention utility
│   │   ├── page-detector.js               # Page type detection
│   │   ├── artist-field-manager.js        # Artist field operations
│   │   ├── title-cleanup-utility.js       # Title formatting after edits
│   │   ├── field-quality-analyzer.js      # Add page field quality analysis
│   │   └── term-processor.js              # Search term processing
│   │
│   ├── ui/                                # UI-specific modules
│   │   ├── ui-controller.js               # Edit page UI orchestration
│   │   ├── ai-enhancement-ui.js           # Reusable AI enhancement UI components
│   │   ├── pill-generator.js              # Search pill HTML generation
│   │   ├── checkbox-manager.js            # Pill checkbox state management
│   │   ├── field-monitor-manager.js       # Real-time field change detection
│   │   └── tooltip-system-manager.js      # Tooltip positioning system
│   │
│   ├── utils/                             # Utility modules
│   │   └── typing-simulator.js            # Human-like typing for autocomplete fields
│   │
│   ├── add-items/                         # Add Item page modules
│   │   ├── ai-enhancement.js             # AI enhancement for add page
│   │   ├── artist-handler.js              # Artist handling for add page
│   │   ├── field-analyzer.js              # Field analysis for add page
│   │   └── ui-feedback.js                 # Add page UI feedback
│   │
│   ├── analytics/                         # Standalone sales analytics dashboard
│   │   ├── data-fetcher.js               # Paginated API fetch + category sharding
│   │   ├── data-cache.js                 # chrome.storage.local cache with compression
│   │   ├── data-aggregator.js            # KPI computation, distributions, trends
│   │   ├── category-registry.js          # 135 sub-ID → 25 parent category mapping
│   │   ├── filter-state.js              # Reactive filter state with event emitter
│   │   └── ai-insights.js              # On-demand AI analysis (Claude Sonnet 4.5)
│   │
│   └── refactored/                        # New architecture components
│       ├── components/
│       │   ├── freetext-parser.js         # Freetext → structured data
│       │   └── ai-image-analyzer.js       # Image → catalog data
│       └── ai-rules-system/
│           ├── ai-rules-manager.js        # Centralized AI rules engine
│           └── ai-rules-config.json       # Rule definitions
│
└── styles/components/                     # Component-specific CSS
    ├── freetext-parser.css
    ├── ai-image-analyzer.css
    ├── add-items-tooltips.css
    ├── valuation-request.css
    ├── admin-dashboard.css
    ├── analytics.css
    └── comment-enhancer.css
```

### Data Flow

```
User action on Auctionet admin page
        │
        ▼
Content Script (content.js / content-script.js / valuation-request.js / admin-dashboard.js)
        │
        ├──► Quality Analyzer ──► Quality Rules Engine ──► UI Renderer
        │
        ├──► API Manager ──► background.js ──► Claude API (Anthropic)
        │
        ├──► Enhance All Manager ──► Tier Config (auto or manual)
        │         ├──► Haiku / Sonnet / Opus (by tier) ──► Response Parsing
        │         ├──► Biography KB Card (Tier 2 parallel) ──► Maker Context
        │         ├──► Hallucination Validation ──► Preview Modal
        │         └──► Field Distributor ──► Form Fields ──► Quality Re-analysis
        │
        ├──► Sales Analysis Manager ──► Auctionet API ──► Dashboard
        │         │
        │         └──► AI Relevance Validation (Claude Haiku)
        │
        ├──► Artist Detection Manager ──► Biography KB Card ──► Wikipedia API
        │
        ├──► Brand Validation Manager ──► Inline Corrections
        │
        ├──► Search Query SSoT ──► Pill Generator ──► Dashboard Header
        │
        ├──► Valuation Request Assistant ──► Image Fetch (background.js)
        │         │                              ──► Claude Vision API
        │         └──► Auctionet Market Data ──► Email Generation
        │
        ├──► Admin Dashboard ──► DOM Scraping (zero API calls)
        │         └──► KPI Cards / Pipeline Funnel / Pricing Insights / Comment Feed
        │
        ├──► Comment Enhancer ──► DOM Scraping (zero API calls)
        │         └──► Comment Badges / Rich Feed / Entity Filters
        │
        └──► Background Service Worker (independent of open tabs)

Standalone Extension Page (analytics.html — opened from popup)
        │
        └──► analytics.js ──► data-fetcher.js ──► Auctionet API (paginated, category-sharded)
                  ├──► data-cache.js ──► chrome.storage.local (compressed, 24h TTL)
                  ├──► data-aggregator.js ──► KPIs / Monthly / Price Distribution / Categories
                  ├──► filter-state.js ──► Reactive re-render on filter change
                  ├──► category-registry.js ──► 135 sub → 25 parent category mapping
                  └──► ai-insights.js ──► background.js ──► Claude Sonnet 4.5 (on-demand)
                  ├──► chrome.alarms (10 min) / onInstalled ──► Publication Scanner
                  ├──► publication-scanner-bg.js ──► fetch (with cookies)
                  ├──► offscreen.js ──► DOMParser (HTML parsing)
                  ├──► Anthropic API (spellcheck, direct call)
                  ├──► chrome.storage.local (cache results + progress)
                  └──► chrome.tabs.sendMessage ──► Dashboard (notify on completion)
```

### Performance Characteristics

- **API caching:** Market data cached for 30 minutes to minimize API calls
- **Biography caching:** Artist biographies cached in localStorage for 7 days (reused by both Biography KB Card and Enhance All Tier 2)
- **Warehouse caching:** Warehouse cost data cached for 12 hours in Chrome local storage with manual refresh
- **Publication scan caching:** Scan results cached in Chrome local storage; full auto-rescan every 10 minutes via `chrome.alarms` in the background service worker (runs regardless of open tabs). Initial scan on extension install/update via `onInstalled`. HTML parsing delegated to offscreen document. Items no longer in the publication queue are automatically removed. Ignored items persisted separately in `publicationScanIgnored` storage key.
- **Prompt caching:** System prompts use Anthropic's `cache_control: { type: 'ephemeral' }` for ~90% token savings on repeated calls
- **Debounced monitoring:** Field changes are batched (typically 300-800ms) before triggering re-analysis
- **Lazy loading:** Market dashboard only runs analysis when opened
- **Enhance All parallel calls:** Tier 2 runs Sonnet (structure) and Opus (biography) API calls in parallel for faster results
- **State persistence:** Dashboard open/closed state, search terms stored in localStorage
- **Background processing:** All API calls go through the service worker to avoid blocking the UI
- **Batched fetching:** Warehouse cost pages fetched in concurrent batches of 5 for fast aggregation
- **Analytics caching:** Sales analytics data compressed to ~100 bytes/item and cached in chrome.storage.local with 24-hour TTL. Incremental updates fetch only new items. Category sharding bypasses the 10k API item cap for large houses

---

## 19. Security Considerations

- **API key storage:** The Anthropic API key is stored in Chrome's local storage (not sync storage) to prevent cross-device leakage
- **Admin PIN:** Stored as a SHA-256 hash in local storage — not readable in plain text. Admin mode is a soft lock to prevent casual access to sensitive dashboard data (warehouse costs, KPIs), not a cryptographic security boundary
- **XSS prevention:** All dynamic content is sanitized through the `escapeHTML` utility before DOM insertion
- **No external servers:** All processing happens locally in the browser. The only external calls are to:
  - Anthropic API (for Claude AI)
  - Auctionet API (for market data)
  - Auctionet image CDN (for fetching valuation request images)
  - Wikipedia API (for artist images)
- **Content Security Policy:** Chrome Manifest V3 enforces strict CSP by default
- **No data collection:** The extension does not collect, store, or transmit any catalog data beyond what is needed for the API calls above

---

## 20. Data & Privacy

| Data Type | Where it goes | Retention |
|-----------|---------------|-----------|
| Catalog text (title, description, etc.) | Sent to Anthropic API for AI enhancement | Not stored — API calls are stateless |
| Valuation request images | Fetched from Auctionet CDN, sent to Anthropic API as base64 | Not stored — processed in memory only |
| Customer info (name, email) | Scraped from page, used locally for email generation | Session only — not persisted |
| Search queries | Sent to Auctionet API for market data | Cached locally for 30 min / 1 hour |
| Warehouse cost data | Scraped from Auctionet solds list pages (same-origin fetch) | Cached locally for 12 hours |
| Publication scan data | Fetched from Auctionet publishables, show, and edit pages (background service worker with cookie auth) | Cached locally; full rescan every 10 min |
| Admin PIN | Hashed (SHA-256) in Chrome local storage | Until user changes it |
| Artist names | Sent to Wikipedia for images | Not stored |
| Artist biographies | Generated via Anthropic API, used for Enhance All and Biography KB Card | Cached locally for 7 days |
| API key | Chrome local storage on user's machine | Until user removes it |
| Settings | Chrome sync storage | Until user changes them |
| Quality scores | Calculated in-browser | Session only — not persisted |
| Sales analytics data | Fetched from Auctionet public API, compressed and cached locally | Cached in chrome.storage.local; 24-hour TTL with incremental updates |

The extension processes data entirely within the user's browser session. No catalog data is stored persistently or shared with third parties beyond the API calls described above.

---

*Document updated March 7, 2026. Reflects extension version 2.3.0.*
