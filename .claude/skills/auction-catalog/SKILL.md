---
name: auction-catalog
description: Reference guide for Swedish auction cataloging conventions and Auctionet FAQ compliance. Use when working on title formatting, description rules, condition reports, quality validation logic, keyword rules, forbidden language, or compound word conventions.
argument-hint: "[category or topic]"
---

# Auction Cataloging Reference

Use this skill to look up or apply correct cataloging conventions when modifying quality rules, AI prompts, or validation logic in the extension.

If an argument is provided, focus on that category or topic: `$ARGUMENTS`

## Title Formatting Rules (by category)

### Furniture (Möbler)
```
BYRÅ, gustaviansk, sent 1700-tal.
FÅTÖLJ, "Karin", Bruno Mathsson, Dux.
```
- NEVER include wood type in title (put in description)
- Include: style, period, designer if known
- Signed furniture: include maker in title

### Small Items (Småsaker)
```
VAS, majolika, nyrenässans, Gustafsberg, sent 1800-tal.
SKÅL, glas, Bertil Vallien, Kosta Boda, sign.
```
- NEVER combine material+object ("MAJOLIKAVAS" is WRONG → "VAS, majolika")
- NEVER "KERAMIKTOMTE" → "TOMTE, keramik"

### Services (Serviser)
```
MATSERVIS, 89 delar, porslin, "Maria Björnbär", Rosenthal.
MAT- OCH KAFFESERVIS, 38 delar, flintgods, rokokostil, Rörstrand, tidigt 1900-tal.
```
- Always: type, piece count, material, pattern name, manufacturer, period

### Rugs (Mattor)
```
MATTA, orientalisk, semiantik, ca 320 x 230 cm.
```
- Dimensions ALWAYS in title (exception to normal rule)
- Priority category at intake — catalog fully at intake

### Silver
```
BÄGARE, 2 st, silver, rokokostil, CG Hallberg, Stockholm, 1942-56, ca 450 gram.
```
- Always research hallmarks
- Weight always LAST in title
- No weight for filled-base items (candelabras with weighted base)

### Art (Konst)
```
BENGT LINDSTRÖM, färglitografier, 2 st, signerade och daterade 76 och numrerade 120/310.
BRUNO LILJEFORS, "Enkelbeckasin i höstskog", olja på duk, signerad B.L och daterad -28.
```
- Artist name in artist field (auto-prepended in UPPERCASE)
- Quoted titles ONLY for artist-given titles
- Write signatures/dates exactly as on the work: distinguish "1832" vs "-32" vs "32"
- "signerad a tergo" for reverse signatures (never abbreviate)
- Piece count after technique, not after artist
- "Ej sign." in description for unsigned works

### Unidentified Artist
```
OIDENTIFIERAD KONSTNÄR, Rådjur, skulptur, brons, otydligt signerad, 18/1900-tal.
```
- Use when signature is clear but artist cannot be identified
- Always take a detail photo of the signature
- Droit de suite still applies

## Description Rules

### General
- Be thorough — especially things hard to see in photos
- Write out full words, no abbreviations (for Google SEO)
- Always include: creator, material, manufacturer, measurements, weight (where applicable)
- Provenance, exhibitions, literature: write before measurements

### Measurements
- Format: `Höjd 84, bredd 47 cm` or `Längd 84, bredd 47, höjd 92 cm`
- Art: `45 x 78 cm` (height × width, without frame)
- Always last in description (except rugs/ceiling lamps → in title)
- Use "ca" for approximate measurements
- Graphics: clarify "bladstorlek" vs "bildstorlek"
- Rings: only ring size, no measurements

### Services Description
- No measurements needed
- List all pieces: `34 mattallrikar, 25 djupa tallrikar, såsskål samt tillbringare`
- Single items NOT preceded by "1" — just name them
- No "st" after single items

## Condition Report Rules

### Dos
- Be thorough when possible, vague when necessary
- Always use "Ej examinerad ur ram" for framed art
- Always mention engravings/monograms on silver
- Use "Ej genomgånget" for books and similar
- Always photograph visible damage

### Don'ts
- NEVER use "bruksslitage" as standalone condition — specify damage type
- NEVER use "Ej funktionstestad" — implies we test items
- AVOID "Ingen anmärkning" — leads to complaints
- NEVER comment on frame condition (unless the frame IS the item)
- Avoid abbreviations: mm, bl a, osv
- Paintings don't have "bruksslitage" — they're not "used"

### Preferred Specific Terms
| Instead of "Bruksslitage" | Use |
|---------------------------|-----|
| Furniture | Smärre ytslitage, repor, märken, fläckar, ringmärken |
| Glass/Ceramics | Smärre nagg, ytslitage, hårspricka |
| Textiles/Rugs | Slitage fransar, fläckar, färgförändringar |
| Paintings | Sedvanligt slitage, ramslitage, krakelyrer |
| Silver | Bucklor, repor, lagningar, monogram |

## Keyword Rules
- Max 12 keywords, space-separated
- Hyphenate multi-word terms (e.g., `art-deco`)
- Must complement (not duplicate) title and description
- Quality engine flags too few or too many keywords (see `modules/core/quality-rules-engine.js` for current thresholds)

## Field Validation
See `modules/core/quality-rules-engine.js` for current minimum character thresholds for title, description, and condition fields. Description must include measurements.

## Category-Specific Rules

### Watches (armbandsur)
- Function clause required: "Fungerar vid katalogisering - ingen garanti lamnas pa funktion"
- Include: brand, model, movement type, case material, diameter, reference number if visible

### Weapons & Militaria
- Extra anti-hallucination caution — never fabricate historical context
- Conservative approach: only state what is verifiable from the item itself

### Jewelry (smycken/adelmetaller)
- Technical limitations: cannot verify gemstone authenticity from photos
- Always note: "Auctionet garanterar inte äktheten hos stenar"
- Include hallmarks, weight, stone description as visible

### Historical Items (antikviteter)
- Conservative dating — prefer broader ranges over specific dates when uncertain
- Never add historical narrative not supported by the item itself

## AML Compliance (quality-rules-engine.js)
- Items valued over 50,000 SEK: trigger AML reminder for seller risk profile/ID verification
- Bullion/gold lots (guldtacka, silvertacka, parti guldmynt): document seller identity and ownership duration
- Loose gemstones: additional scrutiny required

## Compound Words (never combine)
Incorrect → Correct: majolikavas → majolika, vas | keramiktomte → keramik, tomte | kristallvas → kristall, vas | porslinsvas → porslin, vas | guldring → guld, ring | silverkedja → silver, kedja | massingsjusstake → massing, ljusstake | tennmugg → tenn, mugg

## Forbidden Language
Never use subjective/selling language (enforced in `ai-rules-config.json` `forbiddenWords`):
`fin, vacker, värdefull, elegant, karakteristisk, typisk, klassisk, traditionell, autentisk, raffinerad, stilren, harmonisk, genomarbetad, påkostad, exklusiv, förnam, gedigen, kvalitativ, förstklassig, exemplarisk, representativ, fantastisk, utsökt, nyskick, magnifik, underbar, exceptionell, perfekt, ovanlig, sällsynt, tidlös, sofistikerad`

See `modules/refactored/ai-rules-system/ai-rules-config.json` → `forbiddenWords` for the authoritative list.
