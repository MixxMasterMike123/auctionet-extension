---
name: image-analysis
description: Reference for auction item image analysis — what to look for in photos of auction items, how to extract catalog-relevant information from images, and how the extension's AI image analysis works.
argument-hint: "[category or aspect]"
---

# Auction Item Image Analysis Reference

Use this skill when working on image analysis features, Claude Vision prompts, or photo-based cataloging. Focus on: `$ARGUMENTS`

## How Image Analysis Works in the Extension

### Architecture
```
Item images (up to 5 slots) → base64 encoding → Claude Vision API (Sonnet 4.5)
                                                      ↓
                                               Structured JSON response:
                                               - Title, description, condition
                                               - Artist, period, materials
                                               - Keywords, estimate, reserve
                                               - Image quality assessment
                                               - Sure Score confidence
```

### Model Selection
- **Sonnet 4.5** — all image analysis (single and multi-image). Uses `apiManager.getCurrentModel().id` which defaults to Sonnet.
- **Opus 4.6** — only for valuation request clustering (`_clusterImages()`) and valuation generation, with Sonnet fallback on overload.
- Haiku is NOT used for image analysis.

### Image Slots (categorized)
| Slot | Purpose | What to extract |
|------|---------|----------------|
| Front/Main | Primary identification | Object type, style, material, overall condition |
| Back/Reverse | Maker marks, construction | Stamps, signatures, labels, construction method |
| Markings | Stamps, hallmarks | Manufacturer, date, origin, purity (silver/gold) |
| Signatures | Artist identification | Name, date, numbering, technique notes |
| Condition | Damage documentation | Specific flaws, repairs, wear patterns |

### Image Processing
- Anthropic API limit: 5MB base64 string; threshold set at 4.5MB for safety margin
- File upload limit: 10MB (`maxFileSize` in config)
- Resized via canvas using `ensureBase64WithinLimit()` in `ai-image-analyzer.js`
- Also `_resizeBase64Image()` in `valuation-request-assistant.js` (separate implementation, with MAX_ATTEMPTS safety guard)
- Max dimension: 1400px, progressively reduced by 200px if still too large
- Output: JPEG at 0.82 quality (minimum 0.5)
- Domain whitelist: `auctionet.com`, `images.auctionet.com`, `upload.wikimedia.org`

### Two Analysis Paths
- **Single image** (`analyzeImage`): 45s timeout, 1200 max_tokens
- **Multiple images** (`analyzeMultipleImages`): 90s timeout, 1500 max_tokens, minimum 2 images required
- System prompt sourced dynamically from `getAIRulesManager().getSystemPrompt('freetextParser')` with fallback chain: `freetextParser` → `core` → minimal hardcoded prompt

### Sure Score Confidence System
`calculateSureScore()` provides a weighted composite confidence:
- Image analysis quality (40%)
- Image quality score (25%) — clarity, lighting, angle, completeness
- Object identification confidence (20%)
- Market validation (15%) — cross-references with Auctionet historical sales

Levels: "Mycket låg", "Låg", "Medel", "Hög", "Mycket hög"

### Market Validation Integration
`validateWithMarketData()` cross-references image analysis with Auctionet sales data. Conservative scaling with multipliers 0.4–1.0 based on market support percentage. Builds search queries automatically from image analysis output.

### Image Clustering (Valuation Requests)
`_clusterImages()` groups multiple customer images by object for multi-item valuation. Uses Opus 4.6 with Sonnet fallback. Cataloger can drag/drop to adjust groupings.

### Multi-Image Upload UI
`generateMultipleImageUploadUI()` creates a drag-and-drop upload grid with slot-specific zones (front, back, markings, signature, condition).

## What to Look For (by category)

### Art & Paintings
- **Signature**: location (lower right, a tergo), legibility, full name vs initials
- **Dating**: exact year, decade, century — write exactly as on work
- **Technique**: oil on canvas, watercolor, mixed media, lithograph, etching
- **Numbering**: edition number for prints (e.g., "120/310")
- **Frame**: type, period (but NEVER report frame condition)
- **Canvas/paper**: condition, foxing, tears, restorations
- **Size**: height × width without frame

### Furniture
- **Style identification**: gustavian, rococo, art deco, functionalist
- **Construction**: joinery type, original vs restored parts
- **Wood type**: visible in unfinished areas — only identify if confident
- **Hardware**: original vs replacement handles, locks, hinges
- **Surface**: veneer condition, inlay, painted decoration
- **Stamps/labels**: maker marks, often on underside or back

### Silver & Gold
- **Hallmarks**: city mark, year mark, maker mark, assay mark
- **Purity**: sterling (925), 830, 18k, 14k — only from stamps, never guess
- **Weight**: essential for precious metals
- **Engravings**: monograms, presentation inscriptions (always mention in condition)
- **Construction**: filled base vs solid (affects weight relevance)

### Glass & Ceramics
- **Manufacturer marks**: underside stamps, etched signatures
- **Technique**: blown, pressed, cut, etched, overlay
- **Color**: describe accurately for glass
- **Condition**: chips (nagg), hairline cracks (hårspricka), crazing
- **Size**: height and/or diameter

### Rugs & Textiles
- **Origin**: Persian, Turkish, Scandinavian — from patterns and construction
- **Construction**: hand-knotted, machine-made, flatweave
- **Material**: wool, silk, cotton — from texture and sheen
- **Condition**: fringe wear, color fading, repairs, moth damage
- **Size**: always in title — length × width

### Watches & Clocks
- **Manufacturer & model**: from dial and caseback
- **Movement**: automatic vs quartz (from caseback or movement view)
- **Case material**: steel, gold, gold-plated — from stamps
- **Case size**: diameter in mm
- **Dial condition**: patina, lume condition, text legibility

### Weapons & Militaria
- **EXTRA CAUTION** — anti-hallucination rules are strictest here
- Only describe what is physically visible
- Never add historical context not explicitly present
- Never guess school names, regions, or periods from style
- Focus on: markings, inscriptions, materials, construction method

## AI Prompt Patterns for Image Analysis

### Hallucination Prevention
- "Describe ONLY what you can see in the image"
- "Do NOT infer historical period from style alone"
- "If uncertain about material, say 'appears to be' not 'is'"
- "Never fabricate maker names, dates, or provenance"

### Extraction Priority
1. **Object identification** — what is it?
2. **Material identification** — what's it made of?
3. **Maker/artist identification** — who made it? (from visible marks only)
4. **Condition assessment** — what damage/wear is visible?
5. **Period estimation** — when was it made? (conservative)
6. **Valuation clues** — quality level, rarity indicators

### Multi-Image Strategy
When multiple images are available:
- Cross-reference front view with detail shots
- Use back/underside for construction clues
- Use marking photos to confirm or identify maker
- Use condition photos to quantify damage described in main view
- Don't repeat information already captured from another image

## Photography Guidelines (for reference)

### Minimum Standards
- At least 3 photos per item
- Clean, neutral background (NCS S4000 N gray)
- Even lighting, no harsh shadows
- Include scale reference where helpful

### Category-Specific Photo Requirements
| Category | Required shots |
|----------|---------------|
| Furniture | Front, back (if old), marble top detail, interior |
| Art | Without frame (expensive), with frame, signature, back |
| Silver/Gold | Full view, hallmarks close-up, engravings |
| Porcelain | Full view, underside/marks, pattern detail |
| Rugs | Full spread, corner detail, back |
| Watches | Dial, caseback, movement (if accessible) |
| Services | Group shot, single piece detail, marks |
