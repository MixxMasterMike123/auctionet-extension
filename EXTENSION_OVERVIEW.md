# Auctionet AI Cataloging Assistant

**Version 1.2.0** | Chrome Extension | Powered by Claude AI (Anthropic)

---

## Executive Summary

The Auctionet AI Cataloging Assistant is a Chrome extension that augments the Auctionet admin interface with AI-powered tools for cataloging, quality control, market analysis, and compliance. It runs directly inside the browser on `auctionet.com/admin` pages — no server infrastructure required. The extension uses Claude AI (Anthropic) for intelligent analysis and the Auctionet public API for real-time market data from 3.65M+ historical auction results.

**Key value proposition:** Faster cataloging, higher data quality, market-informed pricing, and built-in compliance reminders — all without leaving the existing Auctionet admin workflow.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [AI-Powered Field Enhancement](#2-ai-powered-field-enhancement)
3. [Freetext Parser — Bulk Item Entry](#3-freetext-parser--bulk-item-entry)
4. [AI Image Analysis](#4-ai-image-analysis)
5. [Quality Control System](#5-quality-control-system)
6. [Market Analysis Dashboard](#6-market-analysis-dashboard)
7. [Artist Detection & Biography System](#7-artist-detection--biography-system)
8. [Brand Validation](#8-brand-validation)
9. [Search Query Intelligence](#9-search-query-intelligence)
10. [AML / Anti-Money Laundering Compliance](#10-aml--anti-money-laundering-compliance)
11. [Unknown Artist Handling](#11-unknown-artist-handling)
12. [Settings & Configuration](#12-settings--configuration)
13. [Technical Architecture](#13-technical-architecture)
14. [Security Considerations](#14-security-considerations)
15. [Data & Privacy](#15-data--privacy)

---

## 1. Architecture Overview

The extension operates on two Auctionet admin page types:

| Page | URL Pattern | Entry Point | Purpose |
|------|-------------|-------------|---------|
| **Edit Item** | `/admin/*/items/*/edit` | `content-script.js` | Full cataloging workflow for existing items |
| **Add Item** | `/admin/*/items/*` (non-edit) | `content.js` | New item creation with freetext parsing and image analysis |

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

## 3. Freetext Parser — Bulk Item Entry

The Freetext Parser allows catalogers to paste unstructured text (e.g., from a seller's email or handwritten notes) and have AI parse it into structured catalog fields.

### How it works
1. Cataloger clicks the **"Fritext → Katalogisering"** button on the Add Item page
2. A modal opens where they paste the raw text
3. Claude AI parses the text and maps it to Auctionet fields:
   - Title, Description, Category, Artist, Condition, Dimensions, Materials
4. Each parsed field shows a confidence score
5. Cataloger reviews, edits if needed, and confirms to populate the form

### Integration with other systems
- Parsed data feeds into the quality control system for immediate validation
- Market analysis can run on the parsed content before the item is saved
- Works in conjunction with the AI Image Analyzer for complete item entry

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
- **Information extraction:** Artist signatures, maker's marks, material identification, condition assessment, style classification
- **"Sure Score":** Confidence rating for each extracted piece of information
- **Format support:** JPEG, PNG, WebP up to 10MB
- **Market validation:** Cross-references extracted data with Auctionet historical sales

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

## 10. AML / Anti-Money Laundering Compliance

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

## 11. Unknown Artist Handling

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

## 12. Settings & Configuration

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

## 13. Technical Architecture

### Module Structure

```
auctionet-extension/
├── manifest.json                          # Chrome extension manifest (V3)
├── background.js                          # Service worker (API proxy)
├── content-script.js                      # Edit page entry point
├── content.js                             # Add/view page entry point
├── popup.html / popup.js                  # Settings popup
├── styles.css                             # Main stylesheet
│
├── modules/
│   ├── api-manager.js                     # Claude API orchestration
│   ├── auctionet-api.js                   # Auctionet market data API
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
    └── add-items-tooltips.css
```

### Data Flow

```
User action on Auctionet admin page
        │
        ▼
Content Script (content.js / content-script.js)
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
        └──► Search Query SSoT ──► Pill Generator ──► Dashboard Header
```

### Performance Characteristics

- **API caching:** Market data cached for 30 minutes to minimize API calls
- **Debounced monitoring:** Field changes are batched (typically 300-800ms) before triggering re-analysis
- **Lazy loading:** Market dashboard only runs analysis when opened
- **State persistence:** Dashboard open/closed state, search terms stored in localStorage
- **Background processing:** All API calls go through the service worker to avoid blocking the UI

---

## 14. Security Considerations

- **API key storage:** The Anthropic API key is stored in Chrome's local storage (not sync storage) to prevent cross-device leakage
- **XSS prevention:** All dynamic content is sanitized through the `escapeHTML` utility before DOM insertion
- **No external servers:** All processing happens locally in the browser. The only external calls are to:
  - Anthropic API (for Claude AI)
  - Auctionet API (for market data)
  - Wikipedia API (for artist images)
- **Content Security Policy:** Chrome Manifest V3 enforces strict CSP by default
- **No data collection:** The extension does not collect, store, or transmit any catalog data beyond what is needed for the API calls above

---

## 15. Data & Privacy

| Data Type | Where it goes | Retention |
|-----------|---------------|-----------|
| Catalog text (title, description, etc.) | Sent to Anthropic API for AI enhancement | Not stored — API calls are stateless |
| Search queries | Sent to Auctionet API for market data | Cached locally for 30 min |
| Artist names | Sent to Wikipedia for images | Not stored |
| API key | Chrome local storage on user's machine | Until user removes it |
| Settings | Chrome sync storage | Until user changes them |
| Quality scores | Calculated in-browser | Session only — not persisted |

The extension processes data entirely within the user's browser session. No catalog data is stored persistently or shared with third parties beyond the API calls described above.

---

*Document generated February 2026. Reflects extension version 1.2.0.*
