# Auctionet Condition Field — Quality Report

> **Date:** February 8, 2026
> **Sample:** 10,000 most recent live listings (of ~31,946 total)
> **Source:** Auctionet Public API (`/api/v2/items.json`)

---

## Key Finding

**31.7% of all live listings use vague, uninformative condition language.**
Projected across all 31,946 live listings, that's approximately **~10,100 listings** where buyers get little to no useful condition information.

---

## Overview

| Metric | Count | % of sample | Projected (all live) |
|--------|------:|:-----------:|---------------------:|
| **Standalone vague** (only a vague word, nothing else) | 1,191 | 11.9% | ~3,800 |
| **Contains vague** (vague word + maybe some extra text) | 3,171 | 31.7% | ~10,100 |
| Difference (vague + extra detail) | 1,980 | 19.8% | ~6,300 |

---

## Most Common Vague Terms (all languages)

| Term | Occurrences | Language |
|------|------------:|----------|
| Bruksslitage | 1,847 | 🇸🇪 Swedish |
| Bruksskick | 426 | 🇸🇪 Swedish |
| Brugsspor | 242 | 🇩🇰 Danish |
| Gebrauchsspuren | 230 | 🇩🇪 German |
| Altersgemäßer Zustand | 179 | 🇩🇪 German |
| Buen estado | 126 | 🇪🇸 Spanish |
| Bruksspår | 104 | 🇸🇪 Swedish |
| General wear | 44 | 🇬🇧 English |
| Normal wear | 35 | 🇬🇧 English |

Swedish terms dominate (2,377 combined), but the problem spans all markets.

---

## Top 15 Most Common Conditions Overall

| # | Condition | Count | % |
|---|-----------|------:|--:|
| 1 | No remarks | 1,375 | 13.8% |
| 2 | Bruksslitage | 476 | 4.8% |
| 3 | Bruksskick | 178 | 1.8% |
| 4 | Ej examinerad ur ram | 166 | 1.7% |
| 5 | Buen estado | 91 | 0.9% |
| 6 | Smärre slitage | 65 | 0.7% |
| 7 | Bruksspår | 63 | 0.6% |
| 8 | bruksslitage | 58 | 0.6% |
| 9 | Altersgemäßer Zustand | 58 | 0.6% |
| 10 | Smärre bruksslitage | 56 | 0.6% |
| 11 | Slitage | 42 | 0.4% |
| 12 | Ytslitage | 40 | 0.4% |
| 13 | Smärre ytslitage | 39 | 0.4% |
| 14 | sehr guter Zustand | 36 | 0.4% |
| 15 | No examinado sin marco | 35 | 0.4% |

"Bruksslitage" is the **#2 most common condition** on the entire platform.

---

## Worst Houses by Vague % (min 20 listings)

| # | House | Listings | Vague | % | Standalone |
|---|-------|:--------:|------:|--:|-----------:|
| 1 | Connoisseur Bokauktioner | 25 | 23 | **92.0%** | 17 |
| 2 | Woxholt Auktioner | 49 | 41 | **83.7%** | 0 |
| 3 | Roslagens Auktionsverk | 60 | 48 | **80.0%** | 13 |
| 4 | Höganäs Auktionsverk | 78 | 59 | **75.6%** | 13 |
| 5 | Markus Auktioner | 78 | 56 | **71.8%** | 18 |
| 6 | Gomér & Andersson Norrköping | 158 | 111 | **70.3%** | 11 |
| 7 | Gomér & Andersson Jönköping | 80 | 55 | **68.8%** | 20 |
| 8 | Handelslagret Auktionsservice | 123 | 81 | **65.9%** | 21 |
| 9 | Stockholms Auktionsverk Düsseldorf | 273 | 179 | **65.6%** | 90 |
| 10 | TOKA Auktionshus | 111 | 71 | **64.0%** | 6 |

---

## Worst Houses by Volume (absolute number of vague listings)

| # | House | Listings | Vague | % |
|---|-------|:--------:|------:|--:|
| 1 | Helsingborgs Auktionskammare | 427 | 214 | 50.1% |
| 2 | Stockholms Auktionsverk Düsseldorf | 273 | 179 | 65.6% |
| 3 | Södermanlands Auktionsverk | 340 | 151 | 44.4% |
| 4 | Palsgaard Kunstauktioner | 246 | 137 | 55.7% |
| 5 | Stockholms Auktionsverk Magasin 5 | 460 | 130 | 28.3% |

---

## Best Houses (lowest vague %)

| # | House | Listings | Vague | % |
|---|-------|:--------:|------:|--:|
| 1 | Lyme Bay Auctions | 79 | 0 | **0.0%** |
| 2 | Chalkwell Auctions | 548 | 0 | **0.0%** |
| 3 | Young's Auctions | 30 | 0 | **0.0%** |
| 4 | Balclis | 112 | 0 | **0.0%** |
| 5 | Acreman St Auctioneers & Valuers | 66 | 0 | **0.0%** |

Notable: all top-performing houses are UK or Spanish — the vague condition habit is primarily Scandinavian/German.

---

## Stadsauktion Sundsvall

| Metric | Value |
|--------|-------|
| Listings in sample | 133 |
| Vague conditions | 74 (55.6%) |
| Standalone vague | 46 |
| Ranking | **#21 of 63 houses** |

Middle of the pack — typical for a Swedish house.

---

## Implications

- **~10,000 live listings** (31.7%) provide buyers with inadequate condition information
- **"Bruksslitage"** is the #2 most used condition term platform-wide — functionally meaningless to buyers
- The problem is **systemic across Swedish/German houses**, not isolated to a few
- Houses like Chalkwell (548 listings, 0% vague) prove it's a habit, not a necessity
- Vague conditions likely suppress bidding confidence and final hammer prices
- A real-time quality tool that nudges catalogers toward specific terms (e.g., "smärre slitage", "ytslitage", "repor") could directly improve listing quality across the platform

---

*Report generated from Auctionet public API data. "Vague" is defined as conditions containing: bruksskick, bruksslitage, bruksspår (SV), altersgemäßer zustand, gebrauchsspuren (DE), buen estado (ES), general/normal wear (EN), brugsspor (DK).*
