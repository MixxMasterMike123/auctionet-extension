# Auctionet AI Cataloging Assistant

**Version 1.5.0** | Chrome Extension | Powered by Claude AI (Anthropic)

---

## Executive Summary

The Auctionet AI Cataloging Assistant is a Chrome extension that augments the Auctionet admin interface with AI-powered tools for cataloging, quality control, market analysis, valuation, and compliance. It runs directly inside the browser on `auctionet.com/admin` pages — no server infrastructure required. The extension uses Claude AI (Anthropic) for intelligent analysis and the Auctionet public API for real-time market data from 3.65M+ historical auction results.

**Key value proposition:** Faster cataloging, higher data quality, market-informed pricing, customer valuation emails, operational KPI dashboards, and built-in compliance reminders — all without leaving the existing Auctionet admin workflow.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [AI-Powered Field Enhancement](#2-ai-powered-field-enhancement)
3. [Snabbkatalogisering — Quick Cataloging](#3-snabbkatalogisering-quick-cataloging)
4. [AI Image Analysis](#4-ai-image-analysis)
5. [Quality Control System](#5-quality-control-system)
6. [Market Analysis Dashboard](#6-market-analysis-dashboard)
7. [Artist Detection & Biography System](#7-artist-detection--biography-system)
8. [Brand Validation](#8-brand-validation)
9. [Search Query Intelligence](#9-search-query-intelligence)
10. [Valuation Request Assistant](#10-valuation-request-assistant)
11. [Admin Dashboard Enhancements](#11-admin-dashboard-enhancements)
12. [AML / Anti-Money Laundering Compliance](#12-aml--anti-money-laundering-compliance)
13. [Unknown Artist Handling](#13-unknown-artist-handling)
14. [Settings & Configuration](#14-settings--configuration)
15. [Technical Architecture](#15-technical-architecture)
16. [Security Considerations](#16-security-considerations)
17. [Data & Privacy](#17-data--privacy)

---

## 1. Architecture Overview

The extension operates on four Auctionet admin page types:

| Page | URL Pattern | Entry Point | Purpose |
|------|-------------|-------------|---------|
| **Edit Item** | `/admin/*/items/*/edit` | `content-script.js` | Full cataloging workflow for existing items |
| **Add Item** | `/admin/*/items/*` (non-edit) | `content.js` | New item creation with Snabbkatalogisering and image analysis |
| **Valuation Request** | `/admin/sas/valuation_requests/*` | `valuation-request.js` | Valuation of customer submissions with email generation |
| **Admin Dashboard** | `/admin/sas` | `admin-dashboard.js` | Operational KPI cards, pipeline funnel, pricing insights |

**Technology stack:**
- Chrome Manifest V3 (service worker architecture)
- Claude AI via Anthropic API (Sonnet 4.5 for complex tasks, Haiku 4.5 for fast classification)
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

## 3. Snabbkatalogisering (Quick Cataloging)

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

## 4. AI Image Analysis

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

## 5. Quality Control System

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

## 6. Market Analysis Dashboard

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
- **AI relevance validation:** When data spread is high (>5x range), Claude Haiku verifies each result's relevance to the item, filtering out false matches
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

## 7. Artist Detection & Biography System

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

## 8. Brand Validation

### Real-time Inline Validation

As catalogers type in title and description fields, the brand validator:

- Checks against a database of known brands (watches, jewelry, glass, ceramics, furniture, electronics, luxury goods)
- Detects misspellings using fuzzy matching
- Highlights misspelled brand names directly in the field
- Shows tooltip corrections — click to auto-correct
- Integrates with Swedish spell checking

### Examples
- "Orrfors" → suggests "Orrefors"
- "Rollex" → suggests "Rolex"
- "Gustafsberg" → suggests "Gustavsberg"

---

## 9. Search Query Intelligence

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

## 10. Valuation Request Assistant

A dedicated tool for the valuation request pages (`/admin/sas/valuation_requests/*`), where customers submit photos and descriptions of items they want valued. The assistant analyzes the submission and generates a ready-to-send valuation email.

### How it works

1. The extension detects a valuation request page and injects a **"Vardering"** panel in the sidebar
2. Staff clicks **"Analysera och vardera"**
3. The system:
   - Fetches customer images from the page (via background service worker for CORS-safe cross-origin loading)
   - Auto-resizes oversized images to fit the API limit (4.5MB safety threshold on base64 string length)
   - Sends images + customer description to Claude Sonnet for analysis
   - Extracts structured data: object type, brand/maker, artist, model, material, period, **number of objects**
   - Searches Auctionet market data using progressive fallback queries (brand+model → brand+type → brand → type+material)
   - Applies valuation rounding and minimum reserve rules
   - **Multiplies per-item market data by object count** when multiple objects are detected
4. Results are displayed with:
   - **Valuation source indicator:** Green = "Baserat pa X salda foremal pa Auctionet", Orange = "Uppskattning — ingen jamforbar marknadsdata fran Auctionet"
   - **Multi-object hint:** Blue banner when >1 object detected, showing total value and per-item breakdown (e.g., "2 foremal — 9 000 SEK totalt (ca 4 500 SEK/st)")
   - Object identification and estimated value
   - **"Se salda objekt pa Auctionet.com"** — verification link to review comparable sold items
   - **Search query editor** — editable input pre-filled with the market search query + "Sok igen" button. Staff can refine the query (e.g., add "tryck" or "print" to narrow results) and re-run market analysis without re-running the full image analysis. Supports Enter key.
   - Editable email textarea with the full response pre-filled
   - "Kopiera text" (copy to clipboard) and "Skicka via e-post" (mailto: link) buttons
5. The existing "Ja tack" button's placeholder is also updated with the valuation

### Search query handling

The valuation assistant bypasses the standard `formatArtistForSearch` quoting (which wraps multi-word strings as a single exact phrase) and calls the Auctionet API directly. Each word in the query is quoted individually, matching how the Auctionet website search works. This ensures queries like "Robert Hogfeldt print" find results by requiring all terms separately, rather than searching for the exact phrase.

### Multi-object detection

The system identifies when a customer submits multiple objects for valuation (e.g., "2 sofas" or "5 prints"). The AI counts distinct objects from both images and description, and the valuation reflects the total for all items. The per-item value is also shown so staff can verify reasonableness against market data.

### Email templates

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

## 11. Admin Dashboard Enhancements

Visual enhancements for the main admin page (`/admin/sas`) that transform existing data into actionable infographics. No AI calls — all data is scraped from the existing DOM and rendered as visual components.

### KPI Hero Cards

Color-coded, clickable cards injected at the top of the page, replacing the plain text alerts:

| Card | Source | Color |
|------|--------|-------|
| Varderingsforfragan att besvara | `.requested-actions` | Orange |
| Reklamationer/angerratter | `.requested-actions` | Red |
| Exportinformation | `.requested-actions` | Yellow |
| Opublicerbara foremal | Sidebar turbo-frame count | Orange |
| Hantera salda foremal | Sidebar turbo-frame count | Green |
| Hantera plocklista | Sidebar turbo-frame count | Blue |
| Omlistas ej automatiskt | Sidebar turbo-frame count | Yellow |

Each card links to the corresponding admin page for immediate action.

### Daily Goal Progress Ring

An SVG circular progress ring visualizing the "Inskrivet idag: X/Y st" navbar counter:

- Fills from 0-100% with color shift (orange → blue → green)
- Shows items registered vs daily goal
- Displays total SEK value prominently

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

### Technical details

- **Zero API calls** — all data is scraped from the existing page DOM
- **Progressive rendering** — components render immediately with available data; lazy-loaded turbo-frame content is picked up via MutationObserver as it arrives
- Lightweight self-contained IIFE — no module imports needed

---

## 12. AML / Anti-Money Laundering Compliance

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

## 13. Unknown Artist Handling

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

## 14. Settings & Configuration

The extension popup (`popup.html`) provides:

| Setting | Purpose |
|---------|---------|
| **API Key** | Anthropic API key for Claude AI access |
| **Artist Info Toggle** | Enable/disable automatic artist detection and biography features |
| **Dashboard Visibility** | Show/hide the market analysis dashboard by default |
| **Exclude Company ID** | Your auction house's Auctionet company ID — excludes your own historical sales from market analysis to prevent self-referencing |
| **Connection Test** | One-click API connectivity verification |

All settings are stored in Chrome's sync storage (except the API key, which uses local storage for security).

---

## 15. Technical Architecture

### Module Structure

```
auctionet-extension/
├── manifest.json                          # Chrome extension manifest (V3)
├── background.js                          # Service worker (API proxy, image fetching)
├── content-script.js                      # Edit page entry point
├── content.js                             # Add/view page entry point
├── valuation-request.js                   # Valuation request page entry point
├── admin-dashboard.js                     # Admin dashboard visual enhancements
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
│   │   └── term-processor.js              # Search term processing
│   │
│   ├── ui/                                # UI-specific modules
│   │   ├── ui-controller.js               # Edit page UI orchestration
│   │   ├── pill-generator.js              # Search pill HTML generation
│   │   ├── checkbox-manager.js            # Pill checkbox state management
│   │   ├── field-monitor-manager.js       # Real-time field change detection
│   │   └── tooltip-system-manager.js      # Tooltip positioning system
│   │
│   ├── add-items/                         # Add Item page modules
│   │   ├── ai-enhancement.js             # AI enhancement for add page
│   │   ├── artist-handler.js              # Artist handling for add page
│   │   ├── field-analyzer.js              # Field analysis for add page
│   │   └── ui-feedback.js                 # Add page UI feedback
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
    └── admin-dashboard.css
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
        └──► Admin Dashboard ──► DOM Scraping (zero API calls)
                  └──► KPI Cards / Pipeline Funnel / Pricing Insights
```

### Performance Characteristics

- **API caching:** Market data cached for 30 minutes to minimize API calls
- **Debounced monitoring:** Field changes are batched (typically 300-800ms) before triggering re-analysis
- **Lazy loading:** Market dashboard only runs analysis when opened
- **State persistence:** Dashboard open/closed state, search terms stored in localStorage
- **Background processing:** All API calls go through the service worker to avoid blocking the UI

---

## 16. Security Considerations

- **API key storage:** The Anthropic API key is stored in Chrome's local storage (not sync storage) to prevent cross-device leakage
- **XSS prevention:** All dynamic content is sanitized through the `escapeHTML` utility before DOM insertion
- **No external servers:** All processing happens locally in the browser. The only external calls are to:
  - Anthropic API (for Claude AI)
  - Auctionet API (for market data)
  - Auctionet image CDN (for fetching valuation request images)
  - Wikipedia API (for artist images)
- **Content Security Policy:** Chrome Manifest V3 enforces strict CSP by default
- **No data collection:** The extension does not collect, store, or transmit any catalog data beyond what is needed for the API calls above

---

## 17. Data & Privacy

| Data Type | Where it goes | Retention |
|-----------|---------------|-----------|
| Catalog text (title, description, etc.) | Sent to Anthropic API for AI enhancement | Not stored — API calls are stateless |
| Valuation request images | Fetched from Auctionet CDN, sent to Anthropic API as base64 | Not stored — processed in memory only |
| Customer info (name, email) | Scraped from page, used locally for email generation | Session only — not persisted |
| Search queries | Sent to Auctionet API for market data | Cached locally for 30 min / 1 hour |
| Artist names | Sent to Wikipedia for images | Not stored |
| API key | Chrome local storage on user's machine | Until user removes it |
| Settings | Chrome sync storage | Until user changes them |
| Quality scores | Calculated in-browser | Session only — not persisted |

The extension processes data entirely within the user's browser session. No catalog data is stored persistently or shared with third parties beyond the API calls described above.

---

*Document updated February 16, 2026. Reflects extension version 1.5.0.*
