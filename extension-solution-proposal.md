# How the Auctionet Cataloging Extension Solves the Condition Quality Problem

> **Companion to:** [Condition Quality Report](condition-quality-report.md)
> **Date:** February 8, 2026

---

## The Problem in One Sentence

31.7% of Auctionet's live listings (~10,100 items) use vague condition language that gives buyers no actionable information — suppressing bidding confidence and likely reducing final hammer prices.

---

## The Solution: A Non-Intrusive, Real-Time Quality Layer

The extension works as a **Chrome browser extension** that runs directly inside Auctionet's admin cataloging interface. It requires no changes to Auctionet's backend, no training sessions, and no workflow changes. Catalogers continue working exactly as before — the extension watches, analyzes, and nudges in real time.

---

## How It Fixes Each Layer of the Problem

### Layer 1: Vague Condition Detection (the 31.7%)

**Problem:** Catalogers habitually type "Bruksslitage" or "Bruksskick" as the entire condition.

**How it works:**
- The **Quality Analyzer** monitors the condition field in real time as the cataloger types
- When a vague term is detected, an inline warning appears directly below the field:
  > *"Bruksslitage är vagt — beskriv specifikt typ av slitage"*
- **Clickable suggestion chips** appear with one-click alternatives relevant to the item's category:
  - Furniture: `Smärre ytslitage` · `Repor` · `Märken` · `Fläckar` · `Ringmärken`
  - Glass/Ceramics: `Smärre nagg` · `Ytslitage` · `Hårspricka`
  - Textiles/Rugs: `Slitage fransar` · `Fläckar` · `Färgförändringar`
- Chips are **clickable** — one click inserts the term directly into the condition field
- A **"Nya förslag"** (New suggestions) link generates fresh AI-powered alternatives if the defaults don't fit
- If the object truly has no issues, a subtle hint suggests using the **"Inga anmärkningar"** checkbox instead of hiding behind vague language

**Impact on the 31.7%:**
- The 11.9% "standalone vague" listings (just one meaningless word) get an immediate, visible nudge to be specific
- The 19.8% "vague + extra" listings get flagged too — the extension recognizes that starting with "Bruksslitage" adds no value when followed by actually useful terms like "repor och märken"

---

### Layer 2: AI-Powered Enhancement ("Förbättra alla fält")

**Problem:** Even motivated catalogers write inconsistently — spelling errors, wrong formatting, missing measurements, disorganized structure.

**How it works:**
- A single **"Enhance All"** button sends all fields through Claude AI for intelligent improvement
- The AI is trained on Auctionet's own FAQ rules and corrects:
  - **Title structure** — enforces correct element ordering per category (object type, material, artist, dimensions)
  - **Measurement formatting** — converts "66 x 80 centimete" → "66 x 80 cm", normalizes inconsistent formats
  - **Spelling & grammar** — fixes "cn" → "cm", "fanér" → "fanerad", Swedish-specific corrections
  - **Description organization** — structures dimensions, signatures, markings into clean, scannable text
  - **Condition specificity** — preserves or improves specific terms, never downgrades (e.g., "smärre slitage" is never replaced with "bruksslitage")

**Critical safeguards:**
- The AI **never invents information** — strict anti-hallucination rules prevent fabricated artist dates, materials, or dimensions
- Artist birth/death years are only included if verified from the Följerätt field on the page
- Specific condition terms are **never replaced with vaguer ones** — the AI only improves specificity, never reduces it
- Temperature is set low (0.15) to minimize "creative" rewrites — the AI corrects and structures, it doesn't embellish

---

### Layer 3: Category-Aware Intelligence

**Problem:** Different categories have different cataloging rules, and catalogers can't remember all of them.

**How it works:**
- The extension detects the item's category and applies **category-specific rules**:

| Category | What the extension enforces |
|----------|----------------------------|
| **Art** | Title structure: `"Artwork Name", technique, signed/dated` — quoted title always first |
| **Furniture** | Wood type detection — if "teak" or "ek" is in the title but not description, hints to move it |
| **Glass/Ceramics** | Proper manufacturer/designer ordering, model name capitalization |
| **Rugs/Textiles** | Dimension formatting, origin placement |
| **All categories** | Measurement normalization, Swedish grammar, condition specificity |

- **Wood type hints**: If a material like "teak" appears in the title but is missing from the description, an inline hint with common wood types appears as clickable chips for quick insertion
- **Artist biography toggle**: Optional AI-generated biography from verified sources, controllable via settings

---

### Layer 4: Market Intelligence (Single Source of Truth)

**Problem:** Catalogers work in isolation — they don't know what similar items have sold for or how they were described.

**How it works:**
- The extension connects to Auctionet's legacy API with **5+ million historical listings**
- For any item being cataloged, it can surface:
  - **Comparable sold items** — what did similar pieces sell for?
  - **Market trends** — is this category trending up or down?
  - **Description benchmarks** — how did top-selling similar items describe condition?
- This gives catalogers context they've never had before, directly in their workflow

---

## What Changes for the Cataloger

| Before Extension | After Extension |
|-----------------|-----------------|
| Types "Bruksslitage." and moves on | Sees warning + specific alternatives, picks "Smärre ytslitage, repor" in 2 clicks |
| Writes "66 x 80 centimete" | AI auto-corrects to "66 x 80 cm" |
| Forgets wood type in description | Hint appears: "Teak nämns i titel men saknas i beskrivning" with one-click insert |
| Misspells condition terms | AI fixes spelling while preserving meaning |
| Writes title in wrong order | AI restructures to FAQ-compliant format |
| Guesses at artist dates | Extension extracts verified dates from Följerätt, AI uses only confirmed data |
| Works without context | Market data from 5M+ historical listings available |

**Total workflow disruption: Near zero.** The extension adds hints and a single enhancement button. No new screens, no new processes, no mandatory steps.

---

## Projected Impact

### Conservative Estimate (based on condition quality alone)

| Metric | Current | With Extension |
|--------|---------|---------------|
| Listings with vague conditions | ~10,100 (31.7%) | Target: <5% |
| Listings with formatting errors | Unknown (high) | Near zero |
| Cataloging time per item | Baseline | Estimated 20-30% faster (spelling, formatting automated) |
| Buyer condition confidence | Low for ~1/3 of listings | Dramatically improved |

### Revenue Argument

- ~10,100 live listings currently have vague conditions
- Average hammer price on Auctionet: ~2,000-5,000 SEK (estimate)
- If vague conditions suppress final bids by even **5%** on affected listings:
  - 10,100 items × 3,500 SEK average × 5% = **~1.77M SEK in suppressed value**
  - At Auctionet's commission (~20-25%): **~350,000-440,000 SEK in lost commission revenue**
  - **Per year** (with ~12 auction cycles): significantly more
- This is conservative — the actual impact of buyer confidence on bidding behavior is likely higher

### Operational Argument

- **Consistency without policing**: Instead of managers reviewing listings and sending them back, the tool catches issues before submission
- **FAQ compliance by default**: Rules from Auctionet's own FAQ are enforced automatically — no need to remind staff
- **Scales across languages**: The hint system can be extended to German, Spanish, Danish, and English vague terms
- **Training cost reduction**: New catalogers get real-time guidance instead of relying on memory of training sessions

---

## Technical Overview

| Component | Technology |
|-----------|-----------|
| Platform | Chrome Extension (Manifest V3) |
| AI Engine | Claude API (Anthropic) — Sonnet 4.5 |
| Quality Analysis | Client-side JavaScript, real-time DOM monitoring |
| Market Data | Auctionet Public API (5M+ historical listings) |
| Data Storage | Chrome local storage (settings, preferences) |
| Backend Required | None — fully client-side |
| Auctionet Integration | Zero — works as an overlay on existing admin pages |

**API cost estimate:** ~50-150 SEK/user/month at moderate usage (see detailed cost analysis).

---

## Adoption Strategy

The extension is designed for **gradual, voluntary adoption** — not a top-down mandate:

1. **Pilot phase**: Deploy to 3-5 willing catalogers at 2-3 houses, measure before/after quality scores
2. **Proof of concept**: Use the Quality Analyzer's scoring to quantify improvement (vague % before vs. after)
3. **Organic spread**: Catalogers who use it get faster, more consistent results — peers notice
4. **Platform integration** (optional): If proven, the hint system and quality scoring could be built natively into Auctionet's admin interface

**Key positioning: This is a quality assurance tool that catches mistakes and saves time on formatting — not an AI replacement for cataloger expertise.** The cataloger remains the expert. The extension handles the tedious, error-prone parts.

---

## Summary

| Problem | Extension Feature | Impact |
|---------|-------------------|--------|
| 31.7% vague conditions | Real-time detection + clickable suggestions | Specific, informative conditions |
| Inconsistent formatting | AI-powered "Enhance All" | FAQ-compliant structure in one click |
| Spelling/grammar errors | Automated correction | Professional, error-free listings |
| Missing material details | Category-aware hints | Complete descriptions |
| No market context | 5M+ listing database integration | Data-informed cataloging |
| Staff training gaps | Real-time inline guidance | Continuous, passive training |

**Bottom line:** The extension transforms the cataloging workflow from error-prone and inconsistent to guided, efficient, and quality-assured — without changing how catalogers work or threatening their expertise.

---

*This document accompanies the [Condition Quality Report](condition-quality-report.md) which provides the data basis for the problem analysis.*
