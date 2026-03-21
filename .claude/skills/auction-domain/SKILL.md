---
name: auction-domain
description: Background knowledge about the Auctionet platform, Swedish auction terminology (utropspris, bevakningspris, bruksslitage, etc.), business rules, and quality scoring system. Use when you need domain context, terminology definitions, or understanding of Auctionet-specific concepts like AML rules, condition terms, or cataloging conventions. For specific cataloging rules see auction-catalog; for API integration see auctionet-api; for valuation logic see valuation.
user-invocable: false
---

# Auctionet Auction Domain Knowledge

This codebase is a Chrome extension for **Auctionet** — Sweden's leading online auction platform with millions of historical auction results across 60+ auction houses. The extension augments the admin cataloging interface with AI assistance.

## Swedish Auction Cataloging Conventions

Key principles (see `auction-catalog` skill for detailed rules by category):
- Object type in UPPERCASE at start of title
- Never combine material+object type ("MAJOLIKAVAS" → "VAS, majolika")
- Artist names in dedicated artist field, displayed UPPERCASE
- No subjective/selling language (see `auction-catalog` → Forbidden Language)
- Condition terms: avoid vague "bruksslitage" — specify actual damage type
- "Ej examinerad ur ram" for framed art; never "Ej funktionstestad"

### Auctionet Platform Specifics
- Items are published by Auctionet staff after cataloging by auction houses
- Auction duration: ~10 days (configurable)
- Minimum utropspris (starting bid): 300 SEK
- Minimum bevakningspris (reserve): 400 SEK
- Standard reserve: 60-80% of estimate
- Items re-listed automatically up to 3 times before manual intervention
- Transport cataloging: box size, number of parts, fragility rating
- Droit de suite (Följerätt) applies to identified and unidentified artists

### Commission & Fee Model
- Buyer's fee: 25% on hammer price
- Seller commission: 20% on hammer price (pending increase to 22%)
- Photo cost: 80 kr per item (pending increase to 100 kr)
- Auctionet's cut: 6% of total (hammer + buyer fee)

### AI Model Tiering
| Model | Tasks | Cost |
|-------|-------|------|
| Opus 4.6 | Valuation requests, biography, full-tier enhance-all | Highest |
| Sonnet 4.5 | Field enhancement, cataloging, market analysis, image analysis | Standard |
| Haiku 4.5 | Brand validation, search queries, relevance filtering, tidy-tier | Budget |

Prompt caching enabled (~90% token savings on system prompts).

### Quality Scoring System
The quality rules engine (`modules/core/quality-rules-engine.js`) scores items from 100 down, deducting 3–30 points per violation. Key penalties: no keywords (-30), only "bruksslitage" (-25), short title/description/condition (-20 each), reserve ≥ estimate (-20), vague wear (-15), missing measurements (-10). AML checks trigger for items valued over 50,000 SEK, bullion/gold lots, and loose gemstones.

### Anti-Hallucination Rules
- NEVER fabricate artist dates, materials, or dimensions
- NEVER add historical context not explicitly in source data
- NEVER replace specific condition terms with vaguer ones
- Category-specific extra caution for: weapons/militaria, jewelry, historical items, watches
- See `extension-config` skill for temperature and model settings

### Swedish Auction Terminology
| Swedish | English | Context |
|---------|---------|---------|
| Bruksslitage | General wear | VAGUE — flag for specifics |
| Bruksskick | Used condition | VAGUE — flag for specifics |
| Smärre nagg | Minor chips | Glass/ceramics |
| Hårspricka | Hairline crack | Ceramics |
| Lagning | Repair | General |
| Signerad | Signed | Art |
| A tergo | On the reverse | Art signatures |
| Ej sign. | Not signed | Art |
| Fanerad | Veneered | Furniture |
| Intarsia | Inlay work | Furniture |
| Beslag | Fittings/mounts | Metal hardware |
| Proveniens | Provenance | Ownership history |
| Utropspris | Starting/opening bid | Minimum 300 SEK |
| Bevakningspris | Reserve price | Seller's minimum, minimum 400 SEK |
| Klubbat pris | Hammer price | Final sale price |
| Köpare | Buyer | Customer type |
| Säljare | Seller | Customer type |
| Föremål | Item/object | Auction lot |
| Reklamation | Complaint/claim | Customer dispute |
| Ångerrätt | Right of withdrawal | Consumer right |
| Snabbkatalogisering | Quick cataloging | Extension feature |
| Flytta | Move (artist name) | Extension action |

### Key Analytics Metrics
- **First-sale rate** (andel första försälj) — % of items selling on first attempt
- **Reserve-met percentage** — indicates if reserve prices are set appropriately
- **Reserve too high** indicator — when <40% of items meet reserve
- **Återrop** — items not sold (recalled), each recall costs ~105k/yr per 1% increase

### Auctionet API
See `auctionet-api` skill for endpoints, query parameters, and response shapes. See `analytics-data-pipeline` skill for the analytics data flow.
