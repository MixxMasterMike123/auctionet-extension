# Stadsauktion Sundsvall — Website Rebuild Plan

> **Goal:** Build the best SEO-optimized auction house website in Sweden, dominating local search across three counties: Västernorrland, Gävleborg, and Jämtland.
>
> **Stack:** Astro (static site generator) + Cloudflare Pages (free hosting/CDN)
>
> **Current site:** stadsauktionsundsvall.se (DivHunt SPA — broken SEO, content invisible to Google)
>
> **Service area:** Sundsvall, Härnösand, Timrå, Ånge, Örnsköldsvik, Östersund, Hudiksvall, Gävle, Sandviken, Söderhamn, Bollnäs, Kramfors, Sollefteå

---

## Table of Contents

1. [Why Rebuild](#1-why-rebuild)
2. [Competitive Landscape](#2-competitive-landscape)
3. [Target Keywords](#3-target-keywords)
4. [Tech Stack & Claude Code Skills](#4-tech-stack--claude-code-skills)
5. [Project Structure](#5-project-structure)
6. [Site Architecture & Pages](#6-site-architecture--pages)
7. [Page-by-Page Content Plan](#7-page-by-page-content-plan)
8. [Current Site Content to Migrate](#8-current-site-content-to-migrate)
9. [Design Brief](#9-design-brief)
10. [SEO Implementation](#10-seo-implementation)
11. [Structured Data (JSON-LD)](#11-structured-data-json-ld)
12. [Technical SEO Checklist](#12-technical-seo-checklist)
13. [Google Business Profile](#13-google-business-profile)
14. [Local Citations](#14-local-citations)
15. [Auctionet API — Live Auction Feed](#15-auctionet-api--live-auction-feed)
16. [Contact Form](#16-contact-form)
17. [Deployment](#17-deployment)
18. [Post-Launch SEO Actions](#18-post-launch-seo-actions)

---

## 1. Why Rebuild

### Current site critical problems (DivHunt)
- **Content invisible to Google** — entire site renders client-side via JS. HTML source is empty.
- **Broken pages in sitemap** — `/salja-pa-auktion`, `/kopa-pa-auktion`, `/hur-funkar-det` all 404
- **Template titles** — many pages show "Tema Single" instead of actual content
- **Zero heading tags (H1-H6)** detectable in source HTML
- **Identical meta descriptions** on every page except homepage
- **Duplicate sitemap entries** — `/om-oss/personal` appears 7 times
- **No `lastmod`/`changefreq`** in sitemap
- **Image filenames are hashes**, not descriptive
- **Contact page has no crawlable NAP** (name/address/phone), no map
- **Tema pages link OUT to Auctionet** — sending traffic away

### What an Astro rebuild gives you
- **Zero JavaScript shipped** = perfect Core Web Vitals with no effort
- **Pure HTML output** = Google indexes instantly on first crawl
- **Per-page SEO control** = unique titles, descriptions, structured data
- **Sub-50ms TTFB** via Cloudflare CDN
- **Perfect Lighthouse scores** (100/100) out of the box
- **No CMS to maintain** — no updates, no plugins, no security patches

---

## 2. Competitive Landscape

### Direct threats

| Competitor | Location | Threat | Their weakness |
|-----------|----------|--------|----------------|
| **Uppsala Auktionskammare** | Uppsala, but does **free home visits in Sundsvall** | **CRITICAL** — actively poaching high-value items | They're 600km away; can't match local presence |
| **Effecta (ex-Gästriklands AK)** | Expanding from Västerås → Gävle (2025) | **HIGH** — professional chain moving north | New to the region, no local trust yet |
| **Hälsinglands Auktionsverk** | Hudiksvall (Auctionet partner) | **MEDIUM** — same platform, competing for supply | One.com website builder, minimal SEO |
| **Norrlands Auktionsverk** | Umeå (Auctionet partner) | **MEDIUM** — competes for northern catchment | Wix site, content not crawlable |
| **Åke Auktioner** | Örnsköldsvik | **LOW** — own platform, weak web presence | WordPress blog-level site |
| **Återbruket Sundsvall** | Sundsvall | **LOW** — overlaps on dödsbo, sells via Tradera | Not an auction house |

### What best-in-class competitors do (learn from them)

**Uppsala Auktionskammare (gold standard for SEO):**
- City-specific landing pages (`/hembesok/sundsvall-hudiksvall/`)
- Category pages with named experts and record sale prices
- Record sales galleries as social proof ("Sold for 20M SEK")
- Direct specialist phone/email per category

**Stockholms Auktionsverk (gold standard for design):**
- Serif + sans-serif typography pairing (Indigo Antiqua Pro + Neuzeit Grotesk)
- 4 languages (sv/en/fi/de)
- Compassionate dödsbo content with named experts
- 13 specialist department pages
- Charitable program "Auktionsgåvan" as trust signal

**Bukowskis (gold standard for branding):**
- "Founded 1870" heritage branding
- Royal warrant
- Bonhams global network
- 4-step selling process, crystal clear
- "No unsold item fees" policy prominently displayed

### Your competitive advantages to leverage
- **Physical presence in Sundsvall** — no competitor can match this
- **Auctionet network** — 4M+ monthly potential buyers, 80+ auction houses
- **Local knowledge** — norrländsk konst, design, culture
- **Personal service** — small team = personal relationships
- **Complete dödsbo service** — partnership with HK Sundsvall for tömning/städning

---

## 3. Target Keywords

### Tier 1 — Must rank #1 (highest intent + local)
| Keyword | Monthly est. | Current ranking |
|---------|-------------|-----------------|
| `dödsbo sundsvall` | High | Unknown (likely poor due to JS rendering) |
| `auktionshus sundsvall` | Medium | Unknown |
| `värdering sundsvall` | Medium | Unknown |
| `gratis hemvärdering sundsvall` | Medium | Unknown |
| `sälja på auktion sundsvall` | Medium | Unknown |
| `dödsbotömning sundsvall` | Medium | Unknown |

### Tier 2 — Category + local
- `sälja konst sundsvall`
- `sälja smycken sundsvall`
- `sälja möbler auktion norrland`
- `värdera antikviteter sundsvall`
- `värdera konst sundsvall`
- `värdera tavlor sundsvall`
- `sälja silver auktion`

### Tier 3 — Regional expansion (Västernorrland + Gävleborg + Jämtland)
- `auktionshus norrland`
- `auktionshus härnösand` / `dödsbo härnösand`
- `auktionshus örnsköldsvik` / `dödsbo örnsköldsvik`
- `auktionshus östersund` / `dödsbo östersund`
- `auktionshus hudiksvall` / `dödsbo hudiksvall`
- `auktionshus gävle` / `dödsbo gävle`
- `värdering härnösand` / `värdering timrå` / `värdering ånge`
- `värdering östersund` / `värdering jämtland`
- `värdering hudiksvall` / `värdering gävle`
- `värdering sandviken` / `värdering söderhamn` / `värdering bollnäs`
- `dödsbo kramfors` / `dödsbo sollefteå`
- `auktionshus jämtland` / `auktionshus gävleborg`
- `auktionshus västernorrland`

### Tier 4 — Informational (blog content)
- `hur säljer man på auktion`
- `vad kostar det att sälja på auktion`
- `värdera tavlor guide`
- `dödsbo guide sundsvall`
- `vad är mina antikviteter värda`

---

## 4. Tech Stack & Claude Code Skills

```
Astro 5.x          — Static site generator (zero JS output)
Cloudflare Pages    — Hosting + CDN (free tier)
astro-seo           — Meta tags / Open Graph component
@astrojs/sitemap    — Automatic sitemap generation
Formspree           — Contact form (50 free/month) or CF Workers
```

### Install project

```bash
npm create astro@latest stadsauktion-sundsvall
cd stadsauktion-sundsvall
npx astro add sitemap
npm install astro-seo
```

### Install Claude Code skills

These skills give Claude Code specialized knowledge when building the site. Install them globally so they're available in the new project.

```bash
# Astro framework skills
npx skills add soborbo/claudeskills@astro-seo -g -y              # Astro SEO patterns, meta tags, sitemap
npx skills add soborbo/claudeskills@astro-architecture -g -y      # Astro project structure, components, layouts
npx skills add soborbo/claudeskills@astro-performance -g -y       # Astro performance optimization

# SEO skills
npx skills add jezweb/claude-skills@seo-local-business -g -y      # Local business SEO (600+ installs)
npx skills add kostja94/marketing-skills@local-seo -g -y          # Local SEO strategy (243 installs)
npx skills add autom8minds/seo-skills@seo-schema-structured-data -g -y  # JSON-LD structured data
npx skills add zubair-trabzada/geo-seo-claude@geo-schema -g -y    # Geographic SEO schema markup
npx skills add chongdashu/cc-skills@seo-optimizer -g -y            # General SEO optimization

# Web quality skills
npx skills add supercent-io/skills-template@web-accessibility -g -y    # Accessibility/a11y (12.7K installs)
npx skills add nucliweb/webperf-snippets@webperf-core-web-vitals -g -y # Core Web Vitals optimization

# Deployment
npx skills add openai/skills@cloudflare-deploy -g -y              # Cloudflare Pages deployment (495 installs)

# CSS (optional — if using Tailwind instead of plain CSS)
npx skills add giuseppe-trisciuoglio/developer-kit@tailwind-css-patterns -g -y  # Tailwind patterns (2.3K installs)
```

**What these do:** Each skill loads specialized knowledge into Claude Code's context when relevant. For example, the `astro-seo` skill knows Astro-specific SEO patterns, `seo-local-business` knows local SEO best practices, and `geo-schema` knows geographic structured data. They make Claude Code significantly better at building this specific type of site.

---

## 5. Project Structure

```
stadsauktion-sundsvall/
├── astro.config.mjs
├── public/
│   ├── favicon.svg
│   ├── robots.txt
│   ├── _headers              # Cloudflare cache headers
│   ├── _redirects             # Old URL redirects
│   └── images/
│       ├── og-default.jpg     # 1200x630 default social image
│       ├── logo.svg
│       └── staff/             # Staff portraits
├── src/
│   ├── assets/                # Images processed by Astro (WebP/AVIF)
│   │   ├── hero-sundsvall.jpg
│   │   ├── lokalen.jpg
│   │   ├── vardering.jpg
│   │   ├── dodsbo.jpg
│   │   └── categories/
│   │       ├── konst.jpg
│   │       ├── smycken.jpg
│   │       ├── mobler.jpg
│   │       └── silver.jpg
│   ├── components/
│   │   ├── Header.astro       # Nav + phone CTA
│   │   ├── Footer.astro       # NAP, links, social
│   │   ├── SEOHead.astro      # Meta tags, OG, canonical
│   │   ├── SchemaOrg.astro    # JSON-LD structured data
│   │   ├── Breadcrumb.astro   # Visual + schema breadcrumb
│   │   ├── ContactForm.astro  # Valuation/contact form
│   │   ├── ProcessSteps.astro # 6-step selling process
│   │   ├── ServiceCard.astro  # Reusable service card
│   │   ├── FAQ.astro          # Accordion FAQ component
│   │   ├── CTABanner.astro    # Call-to-action banner
│   │   ├── Map.astro          # Google Maps embed
│   │   └── StaffCard.astro    # Team member card
│   ├── data/
│   │   ├── staff.ts           # Staff data (name, role, email, photo)
│   │   ├── faq.ts             # FAQ Q&As per page
│   │   └── cities.ts          # City data for area pages
│   ├── layouts/
│   │   └── BaseLayout.astro   # HTML shell, head, nav, footer
│   ├── pages/
│   │   ├── index.astro                    # Homepage
│   │   ├── vardering.astro                # Värdering
│   │   ├── hembesok.astro                 # Hembesök
│   │   ├── dodsbo.astro                   # Dödsbo
│   │   ├── salja-pa-auktion.astro         # How it works
│   │   ├── om-oss.astro                   # About + team
│   │   ├── kontakt.astro                  # Contact + map + hours
│   │   ├── vanliga-fragor.astro           # FAQ
│   │   ├── # --- Västernorrland ---
│   │   ├── auktionshus-sundsvall.astro    # Local: Sundsvall (HQ)
│   │   ├── auktionshus-harnosand.astro    # Local: Härnösand
│   │   ├── auktionshus-timra.astro        # Local: Timrå
│   │   ├── auktionshus-ange.astro         # Local: Ånge
│   │   ├── auktionshus-ornskoldsvik.astro # Local: Örnsköldsvik
│   │   ├── auktionshus-kramfors.astro     # Local: Kramfors
│   │   ├── auktionshus-solleftea.astro    # Local: Sollefteå
│   │   ├── # --- Jämtland ---
│   │   ├── auktionshus-ostersund.astro    # Local: Östersund
│   │   ├── # --- Gävleborg ---
│   │   ├── auktionshus-hudiksvall.astro   # Local: Hudiksvall
│   │   ├── auktionshus-gavle.astro        # Local: Gävle
│   │   ├── auktionshus-sandviken.astro    # Local: Sandviken
│   │   ├── auktionshus-soderhamn.astro    # Local: Söderhamn
│   │   ├── auktionshus-bollnas.astro      # Local: Bollnäs
│   │   ├── # --- Categories ---
│   │   ├── konst.astro                    # Category: Konst
│   │   ├── smycken.astro                  # Category: Smycken
│   │   ├── mobler.astro                   # Category: Möbler
│   │   ├── silver.astro                   # Category: Silver
│   │   ├── klockor.astro                  # Category: Klockor
│   │   ├── design.astro                   # Category: Design
│   │   └── 404.astro                      # Custom 404
│   └── styles/
│       └── global.css
├── package.json
└── tsconfig.json
```

---

## 6. Site Architecture & Pages

### Navigation

```
[Logo]  Sälja ▾   Tjänster ▾   Om oss   Kontakt   [Ring: 060-17 00 40]

Sälja dropdown:
  Att sälja på auktion
  Värdering
  Hembesök
  Dödsbo & hela hem

Tjänster dropdown:
  Konst & tavlor
  Smycken
  Silver
  Möbler & antikviteter
  Klockor
  Design

(Footer links to all city pages)
```

### URL Structure

```
/                                → Homepage
/salja-pa-auktion                → How selling works (6-step process)
/vardering                       → Valuation services
/hembesok                        → Home visits
/dodsbo                          → Estate handling
/om-oss                          → About us + team
/kontakt                         → Contact, hours, map
/vanliga-fragor                  → FAQ

# City landing pages — Västernorrland
/auktionshus-sundsvall           → Local: Sundsvall (HQ)
/auktionshus-harnosand           → Local: Härnösand
/auktionshus-timra               → Local: Timrå
/auktionshus-ange                → Local: Ånge
/auktionshus-ornskoldsvik        → Local: Örnsköldsvik
/auktionshus-kramfors            → Local: Kramfors
/auktionshus-solleftea           → Local: Sollefteå

# City landing pages — Jämtland
/auktionshus-ostersund           → Local: Östersund

# City landing pages — Gävleborg
/auktionshus-hudiksvall          → Local: Hudiksvall
/auktionshus-gavle               → Local: Gävle
/auktionshus-sandviken           → Local: Sandviken
/auktionshus-soderhamn           → Local: Söderhamn
/auktionshus-bollnas             → Local: Bollnäs

# Category pages
/konst                           → Art & paintings
/smycken                         → Jewelry
/silver                          → Silver
/mobler                          → Furniture & antiques
/klockor                         → Watches
/design                          → Design objects
```

### Internal linking map

```
Homepage ──→ all service pages + all city pages + all category pages
Service pages ──→ contact form + related city pages + FAQ
City pages ──→ all service pages + contact form + neighboring city pages
Category pages ──→ valuation form + related city pages + how-to-sell
FAQ ──→ relevant service pages
All pages ──→ phone CTA in header + contact in footer
```

---

## 7. Page-by-Page Content Plan

### Homepage (`/`)

**Title:** `Stadsauktion Sundsvall — Auktionshus i Sundsvall | Värdering & Dödsbon`
**Description:** `Norrlands ledande auktionshus. Kostnadsfri värdering av konst, antikviteter, smycken och dödsbon. Hembesök i Västernorrland, Jämtland och Gävleborg.`
**H1:** `Norrlands ledande auktionshus`

**Sections:**
1. **Hero** — Large atmospheric photo from the auction house. Headline + subline + two CTAs: "Värdera kostnadsfritt" + "Boka hembesök"
2. **Trust bar** — "Sedan 2013" · "4 miljoner köpare via Auctionet" · "Kostnadsfri värdering" · "Hembesök i 3 län"
3. **Three service cards** — Värdering / Hembesök / Dödsbo — each with photo, short text, CTA
4. **How it works** — 6-step process with icons (from current site — keep this, it's good)
5. **We're looking for** — Current tema/items they're seeking (dynamic feel)
6. **Areas we serve** — Map showing three-county coverage + links to all 13 city pages, grouped by county
7. **Online valuation CTA** — Form embed or link to valuation page
8. **Contact/map** — Address, phone, hours, embedded Google Maps

**Target keywords:** auktionshus sundsvall, värdering sundsvall, sälja på auktion, norrland

---

### Värdering (`/vardering`)

**Title:** `Värdering av konst och antikviteter i Sundsvall | Stadsauktion Sundsvall`
**Description:** `Kostnadsfri värdering av konst, smycken, silver, möbler och antikviteter. Online, på plats eller via hembesök i Sundsvall och Västernorrland.`
**H1:** `Kostnadsfri värdering av konst och antikviteter`

**Sections:**
1. **Intro** — Why value with us (expertise, Auctionet market, free)
2. **Three valuation options:**
   - **På plats** — Drop in Tue-Thu 13-17:30, Fri 13-15:30 at Verkstadsgatan 4
   - **Online** — Send photos via form or email
   - **Hembesök** — We come to you (link to hembesök page)
3. **What we value** — Categories with photos: konst, smycken, silver, möbler, klockor, design, porslin
4. **Valuation form** — Image upload + description + contact info
5. **FAQ** — "Vad kostar värdering?" "Hur lång tid tar det?" "Vad händer efter värderingen?"
6. **Contact CTA** — Phone + email

**Target keywords:** värdering sundsvall, värdera konst, värdera antikviteter, gratis värdering, värdera smycken, värdera tavlor

---

### Hembesök (`/hembesok`)

**Title:** `Hembesök & Hemvärdering i Sundsvall | Kostnadsfritt | Stadsauktion Sundsvall`
**Description:** `Kostnadsfri hemvärdering i Sundsvall, Härnösand, Örnsköldsvik, Östersund, Hudiksvall och Gävle. Vi värderar konst, antikviteter, dödsbon och hela hem på plats.`
**H1:** `Kostnadsfritt hembesök och hemvärdering`

**Sections:**
1. **Intro** — Empathetic, clear: we come to you, it's free, no obligation
2. **Step-by-step process:**
   - Steg 1: Kontakta oss — phone/email/form
   - Steg 2: Vi kommer hem till dig — free, go through items together
   - Steg 3: Du bestämmer — no obligation, you choose what to sell
   - Steg 4: Vi hämtar — we pick up, catalog, photograph, sell
3. **Where we go** — Map showing three-county service area: Västernorrland, Jämtland, Gävleborg + links to all city pages
4. **Booking form** — Simple: name, phone, address, description
5. **FAQ** — "Är hembesöket verkligen gratis?" "Hur lång tid tar det?" "Vad händer om jag ångrar mig?"

**Target keywords:** hembesök sundsvall, hemvärdering, kostnadsfri hemvärdering, gratis hembesök, hembesök dödsbo

---

### Dödsbo (`/dodsbo`)

**Title:** `Dödsbo Sundsvall — Värdering, Tömning & Auktion | Stadsauktion Sundsvall`
**Description:** `Komplett dödsbohantering i Sundsvall — värdering, hämtning, auktion och städning. Kostnadsfri värdering och personlig service. Ring 060-17 00 40.`
**H1:** `Dödsbohantering i Sundsvall — Vi hjälper dig hela vägen`

**Sections:**
1. **Empathetic intro** — Acknowledge emotional weight (keep current site's excellent tone)
2. **Our complete service includes:**
   - Kostnadsfri värdering av dödsboet
   - Hämtning av värdeföremål
   - Professionell katalogisering och fotografering
   - Försäljning via Auctionet
   - Samordning med partner (HK Sundsvall) för tömning och städning
3. **Step-by-step process** — 4 clear steps
4. **Pricing transparency** — "20% provision (inkl. moms) + 80 kr foto/hantering per objekt. Ingen kostnad om inget säljs."
5. **Areas** — Links to city pages
6. **FAQ** — Keep all 5 current FAQs (they're excellent) + add more:
   - "Kan ni hjälpa med bouppteckning?"
   - "Samarbetar ni med städfirmor?"
   - "Vad händer med saker som inte har auktionsvärde?"
7. **Contact CTA** — Prominent phone + "Boka kostnadsfri värdering"

**Target keywords:** dödsbo sundsvall, dödsbotömning sundsvall, dödsbohantering, värdering dödsbo, sälja dödsbo, dödsbo auktion

---

### Att sälja på auktion (`/salja-pa-auktion`)

**Title:** `Sälja på auktion — Så fungerar det | Stadsauktion Sundsvall`
**Description:** `Så säljer du på auktion hos Stadsauktion Sundsvall. Kostnadsfri värdering, professionell fotografering, försäljning via Auctionet till hela Norden.`
**H1:** `Att sälja på auktion — Enkelt och smidigt`

**Sections:**
1. **Intro** — Since 2013, 100% online auctions via Auctionet. 80+ houses, 4M+ buyers.
2. **6-step process** with detailed descriptions (keep from current site — excellent content):
   1. Värdering
   2. Inlämning
   3. Katalogisering & fotografering
   4. Publicering på Auctionet
   5. Auktion (7-10 dagar)
   6. Utbetalning (20 bankdagar)
3. **Pricing** — Clear section:
   - Provision: 20% av klubbat pris (inkl. moms)
   - Foto/hantering: 80 kr per objektsnummer
   - Ingen kostnad om inget säljs
   - Max 3 publiceringar på samma villkor
4. **Reservationspris** — Explain how it works
5. **What happens if it doesn't sell** — Re-published up to 3 times, then pick up or donate
6. **CTA** — "Börja med en kostnadsfri värdering"

**Target keywords:** sälja på auktion, hur säljer man på auktion, auktionskostnad, sälja via auctionet

---

### Om oss (`/om-oss`)

**Title:** `Om Stadsauktion Sundsvall — Norrlands ledande auktionshus`
**Description:** `Stadsauktion Sundsvall — sedan 2013 Norrlands ledande auktionshus. Träffa vårt team av värderare, fotografer och specialister.`
**H1:** `Om Stadsauktion Sundsvall`

**Sections:**
1. **Our story** — Founded 2013/2014, from physical to 100% online auctions via Auctionet
2. **Our expertise** — Norrländsk konst, antikviteter, smycken, design. Local knowledge + global reach
3. **The team** — Staff cards with photo, name, role, email:
   - Roles: Värderare, Fotograf, Kundtjänst, IT/Web
   - Known: Ilona Sweder (Kundtjänst), Anders (anders@stadsauktionsundsvall.se)
4. **Auctionet partnership** — What it means: 80+ houses, 4M buyers, international reach
5. **Visit us** — Address, photo of the location, map

**Target keywords:** stadsauktion sundsvall, auktionshus sundsvall, team

---

### Kontakt (`/kontakt`)

**Title:** `Kontakt — Stadsauktion Sundsvall | Öppettider & Vägbeskrivning`
**Description:** `Kontakta Stadsauktion Sundsvall. Öppet tis-fre. Adress: Verkstadsgatan 4, Sundsvall. Telefon: 060-17 00 40.`
**H1:** `Kontakta oss`

**Sections:**
1. **Contact info** — Full NAP prominently displayed:
   - **Adress:** Verkstadsgatan 4 (Heffner Park, Skönsbergs), Sundsvall
   - **Telefon:** 060-17 00 40
   - **Mobil:** 070-766 50 84
   - **E-post:** info@stadsauktionsundsvall.se
2. **Opening hours:**
   - Tisdag–Torsdag: 13:00–18:00
   - Fredag: 13:00–16:00
   - Lördag–Måndag: Stängt
   - Inlämning/värdering: Tis-Tor 13:00-17:30, Fre 13:00-15:30
3. **Google Maps embed** — Interactive map
4. **Directions** — How to get there (car, bus)
5. **Contact form** — Name, email, phone, message
6. **Social** — Instagram + Facebook links

**Target keywords:** kontakt stadsauktion sundsvall, öppettider, vägbeskrivning

---

### Vanliga frågor (`/vanliga-fragor`)

**Title:** `Vanliga frågor om auktion och värdering | Stadsauktion Sundsvall`
**Description:** `Svar på vanliga frågor om att sälja på auktion, värdering, dödsbohantering, kostnader och hur det fungerar.`
**H1:** `Vanliga frågor`

**Sections:** Accordion FAQ grouped by topic:
1. **Värdering & inlämning** (5-6 Q&As)
2. **Att sälja på auktion** (5-6 Q&As)
3. **Dödsbo & hela hem** (5-6 Q&As — keep current 5 + expand)
4. **Kostnader & betalning** (3-4 Q&As)
5. **Hämtning & leverans** (3-4 Q&As)

Each answer should naturally include location keywords.

---

### City Landing Pages (`/auktionshus-[city]`)

**These are critical for local SEO.** Each page must have **unique content** — not just the city name swapped.

**Template:**

**Title:** `Auktionshus [City] — Värdering & Hämtning | Stadsauktion Sundsvall`
**Description:** `Auktionshus i [City]. Kostnadsfri värdering och hämtning av konst, antikviteter, smycken och dödsbon. Del av Stadsauktion Sundsvall.`
**H1:** `Auktionshus i [City]`

**Sections:**
1. **Local intro** — Mention local landmarks, the area's character, what types of items are common in the area
2. **Services we offer in [City]** — Värdering, hembesök, hämtning, dödsbo
3. **How it works** — Brief 3-step: kontakta oss → vi kommer → vi säljer
4. **Distance/logistics** — "Vi hämtar i [City], [distance] från vår lokal i Sundsvall"
5. **Other areas nearby** — Cross-links to other city pages
6. **Contact CTA** — "Boka hembesök i [City]"

**Unique content per city:**

**Västernorrland:**

| City | Distance | Unique angles |
|------|----------|--------------|
| **Sundsvall** | HQ | Headquarters, drop-in welcome, Heffner Park location, SCA/träindustri heritage, stenstaden |
| **Härnösand** | ~50 km | Residensstad, Murberget museum area, Ångermanland traditions, domkyrka, länsstyrelsen |
| **Timrå** | ~20 km | Vivsta varv history, industrial heritage, nära Sundsvall, Alnö nearby |
| **Ånge** | ~100 km | Inland, järnvägsknuten, skogsindustri, äldre gårdar med dödsbon, Borgsjö |
| **Örnsköldsvik** | ~110 km | Ångermanland coast, growing city, underserved by auction houses, Höga Kusten nearby |
| **Kramfors** | ~80 km | Ådalen, Höga Kusten, historiska bruk, äldre villor och dödsbon |
| **Sollefteå** | ~130 km | Ångermanälven, militärhistoria, stor kommun med spridd bebyggelse, många äldre gårdar |

**Jämtland:**

| City | Distance | Unique angles |
|------|----------|--------------|
| **Östersund** | ~180 km | Jämtlands huvudstad, Storsjön, vintersport, Jamtli museum, kulturstad, universitetstad, samisk kultur, stort upptagningsområde utan lokalt auktionshus |

**Gävleborg:**

| City | Distance | Unique angles |
|------|----------|--------------|
| **Hudiksvall** | ~150 km | Hälsingland, världsarvet hälsingegårdar, träarkitektur, fiske/sjöfart, Hälsinglands Auktionsverk finns men litet |
| **Gävle** | ~280 km | Gävleborgs huvudstad, Effecta just expanderat hit (2025), industristad, Gävlebocken, stort dödsbounderlag |
| **Sandviken** | ~300 km | Sandvik-industrin, arbetarhistoria, nära Gävle, kan kombineras vid hembesök |
| **Söderhamn** | ~220 km | Hälsingland, kuststad, F15 flygflottilj (nedlagd), äldre bebyggelse |
| **Bollnäs** | ~200 km | Hälsingland, hälsingegårdar i omnejd, järnvägsknuten, skogsindustri |

---

### Category Pages (`/konst`, `/smycken`, etc.)

**Template:**

**Title:** `Sälja [Category] på auktion — Värdering i Sundsvall | Stadsauktion Sundsvall`
**Description:** `Sälj [category] på auktion. Kostnadsfri värdering av [specific items]. Vi hämtar i Västernorrland, Jämtland och Gävleborg.`
**H1:** `Sälja [category] på auktion`

**Sections:**
1. **Market intro** — What's the market like? What sells well? (Refer to Uppsala's approach — market commentary)
2. **What we're looking for** — Specific examples (artist names, brands, styles, periods)
3. **Recent sales examples** — If available, show sold items with hammer prices
4. **Our expertise** — Who on the team specializes in this category
5. **How to get a valuation** — Photo tips specific to the category
6. **Valuation CTA** — Form or phone

**Category-specific keywords to weave in:**

| Category | Keywords |
|----------|---------|
| Konst | oljemålning, akvarell, litografi, grafik, signerad konst, svensk konst, norrländsk konst |
| Smycken | guld, silver, diamanter, pärlor, Georg Jensen, Kalevala |
| Silver | sterling, 830, bestick, kandelaber, skål, bägare |
| Möbler | antika möbler, 1800-tal, Carl Malmsten, gustaviansk, rokoko, art deco |
| Klockor | Rolex, Omega, Longines, fickur, armbandsur |
| Design | skandinavisk design, Lisa Larson, Stig Lindberg, Alvar Aalto, Arne Jacobsen |

---

## 8. Current Site Content to Migrate

### Keep and improve
- ✅ 6-step selling process (excellent, keep all text)
- ✅ Dödsbo FAQ section (5 questions — keep, add more)
- ✅ Hembesök step-by-step (good structure)
- ✅ Pricing transparency (20% + 80 kr)
- ✅ "Norrlandsk Expertis med Global Räckvidd" positioning text
- ✅ Four pillars (Norrländskt Arv, Lokal Närvaro, Regional Expertis, Samhällsengagemang)
- ✅ Organization schema (update and expand)

### Fix
- 🔧 Homepage title — too long (100+ chars), shorten to <60
- 🔧 Opening hours — update to current (was Tue-Fri, verify)
- 🔧 Address — **NEW address: Verkstadsgatan 4** (moved from Heffners Allé 43 on May 6)
- 🔧 Meta descriptions — unique per page (currently identical)
- 🔧 Staff page — expand with photos and direct emails
- 🔧 "Grundade 2014" vs "Sedan 2013" — pick one and be consistent

### Remove/replace
- ❌ DivHunt platform (entire rebuild)
- ❌ Broken pages in sitemap
- ❌ "Tema Single" template titles
- ❌ Newsletter signup (low priority, adds complexity)
- ❌ Live auction embed (link to Auctionet instead — don't build complexity)

### Contact info for the new site
```
Telefon:  060-17 00 40
Mobil:    070-766 50 84
E-post:   info@stadsauktionsundsvall.se
E-post:   anders@stadsauktionsundsvall.se
Adress:   Verkstadsgatan 4 (Heffner Park, Skönsbergs), Sundsvall
Koordinater: 62.4008, 17.3169

Öppettider:
  Tisdag–Torsdag: 13:00–18:00
  Fredag: 13:00–16:00
  Lördag–Måndag: Stängt

Inlämning/värdering:
  Tisdag–Torsdag: 13:00–17:30
  Fredag: 13:00–15:30

Sociala medier:
  Instagram: https://www.instagram.com/stadsauktionsundsvall/
  Facebook: https://www.facebook.com/stadsauktionsundsvall
  Auctionet: https://auctionet.com/sv/search?company_id=48
```

---

## 9. Design Brief

### Design principles (what competitors teach us)

All premium Swedish auction houses converge on the same aesthetic:
- **Black + white + generous whitespace** — photography does the heavy lifting
- **Serif headings + sans-serif body** — luxury/gallery feel without being stuffy
- **No bright brand colors** — let the items speak
- **Large, high-quality photography** — full-width hero images, detailed item shots
- **Subtle warm accents** — your current #745225 gold/brown and #fed1b5 peach work well

### Current site colors (consider keeping)
| Color | Hex | Usage |
|-------|-----|-------|
| Dark text | `#191919` | Primary text — **keep** |
| Gold/brown | `#745225` | Brand accent — **keep, this differentiates you** |
| Warm peach | `#fed1b5` | Soft accent — **keep sparingly** |
| Light gray | `#666666` | Secondary text — **keep** |
| Background | `#ffffff` / `#f6f5f5` | Warm white — **keep** |
| Borders | `#efefef` | Subtle borders — **keep** |

### Typography recommendation

**Current fonts:** Cormorant Garamond (headings) + Figtree (body)

**Recommendation:** Keep Cormorant Garamond for headings — it's excellent, gives a classic auction house feel without being dated. Consider switching body to **Inter** or **Source Sans 3** for better web readability. Both are free, highly legible, and professional.

```css
:root {
  --font-heading: 'Cormorant Garamond', Georgia, serif;
  --font-body: 'Inter', 'Figtree', system-ui, sans-serif;

  --color-dark: #191919;
  --color-gold: #745225;
  --color-peach: #fed1b5;
  --color-gray: #666666;
  --color-light: #f6f5f5;
  --color-border: #efefef;
  --color-white: #ffffff;
}
```

### Layout patterns

- **Header:** Sticky, transparent on hero → solid on scroll. Logo left, nav center, phone CTA right
- **Hero sections:** Full-width image with overlay text. Height ~70vh on homepage, ~40vh on subpages
- **Content width:** Max 1200px, generous padding (40-80px sides)
- **Cards:** Clean white cards with subtle shadow, hover lift effect
- **CTAs:** Gold/brown background (#745225) with white text, generous padding
- **Footer:** Dark background (#191919), white text, 5-column layout: Om oss / Tjänster / Västernorrland / Jämtland & Gävleborg / Kontakt
- **Mobile:** Hamburger menu, stacked cards, full-width CTAs

### Photo needs for the new site
- Hero image: atmospheric auction house interior or item arrangement
- Location photo: Verkstadsgatan 4 exterior and interior
- Staff portraits: consistent style (background, lighting)
- Category photos: konst, smycken, silver, möbler, klockor, design
- Process step icons: keep current SVG icons or redesign
- City photos (optional): characteristic image per city
- OG images: 1200x630px branded images for social sharing

---

## 10. SEO Implementation

### Astro SEOHead component

```astro
---
// src/components/SEOHead.astro
import { SEO } from 'astro-seo';

interface Props {
  title: string;
  description: string;
  canonicalURL?: string;
  ogImage?: string;
  noindex?: boolean;
}

const { title, description, canonicalURL, ogImage = '/images/og-default.jpg', noindex = false } = Astro.props;
const siteURL = 'https://stadsauktionsundsvall.se';
const canonical = canonicalURL ?? new URL(Astro.url.pathname, siteURL).toString();
const absoluteOG = new URL(ogImage, siteURL).toString();
---
<SEO
  title={title}
  description={description}
  canonical={canonical}
  noindex={noindex}
  openGraph={{
    basic: {
      title,
      type: 'website',
      image: absoluteOG,
    },
    optional: {
      description,
      locale: 'sv_SE',
      siteName: 'Stadsauktion Sundsvall',
    },
    image: {
      width: 1200,
      height: 630,
      alt: title,
    },
  }}
  twitter={{
    card: 'summary_large_image',
    title,
    description,
    image: absoluteOG,
  }}
/>
<link rel="alternate" hreflang="sv" href={canonical} />
<link rel="alternate" hreflang="x-default" href={canonical} />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

### Astro config

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://stadsauktionsundsvall.se',
  output: 'static',
  trailingSlash: 'never',
  build: {
    format: 'file',
    inlineStylesheets: 'auto',
  },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/404'),
      changefreq: 'weekly',
      priority: 0.7,
      lastmod: new Date(),
    }),
  ],
  prefetch: {
    prefetchAll: true,
  },
});
```

### Base layout

```astro
---
// src/layouts/BaseLayout.astro
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';
import SEOHead from '../components/SEOHead.astro';
import SchemaOrg from '../components/SchemaOrg.astro';
import '../styles/global.css';

interface Props {
  title: string;
  description: string;
  canonicalURL?: string;
  ogImage?: string;
  schema?: object;
  breadcrumbs?: Array<{ name: string; url?: string }>;
}

const { title, description, canonicalURL, ogImage, schema, breadcrumbs } = Astro.props;
---
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <SEOHead {title} {description} {canonicalURL} {ogImage} />
  {schema && <SchemaOrg data={schema} />}
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />
</head>
<body>
  <Header />
  <main>
    <slot />
  </main>
  <Footer />
</body>
</html>
```

---

## 11. Structured Data (JSON-LD)

### Homepage — LocalBusiness + Organization

```json
{
  "@context": "https://schema.org",
  "@type": ["LocalBusiness", "Organization"],
  "@id": "https://stadsauktionsundsvall.se/#organization",
  "name": "Stadsauktion Sundsvall",
  "alternateName": "SaS",
  "description": "Norrlands ledande auktionshus. Värdering, hämtning och försäljning av konst, antikviteter, smycken, design och dödsbon i Västernorrland, Jämtland och Gävleborg.",
  "url": "https://stadsauktionsundsvall.se",
  "telephone": "+46-60-170040",
  "email": "info@stadsauktionsundsvall.se",
  "logo": {
    "@type": "ImageObject",
    "url": "https://stadsauktionsundsvall.se/images/logo.png",
    "width": 600,
    "height": 200
  },
  "image": [
    "https://stadsauktionsundsvall.se/images/lokalen-1x1.jpg",
    "https://stadsauktionsundsvall.se/images/lokalen-4x3.jpg",
    "https://stadsauktionsundsvall.se/images/lokalen-16x9.jpg"
  ],
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Verkstadsgatan 4",
    "addressLocality": "Sundsvall",
    "addressRegion": "Västernorrlands län",
    "postalCode": "856 33",
    "addressCountry": "SE"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": 62.40080,
    "longitude": 17.31690
  },
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Tuesday", "Wednesday", "Thursday"],
      "opens": "13:00",
      "closes": "18:00"
    },
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": "Friday",
      "opens": "13:00",
      "closes": "16:00"
    }
  ],
  "priceRange": "$$",
  "currenciesAccepted": "SEK",
  "paymentAccepted": "Swish, Bankgiro",
  "foundingDate": "2013",
  "areaServed": [
    { "@type": "AdministrativeArea", "name": "Västernorrlands län" },
    { "@type": "AdministrativeArea", "name": "Jämtlands län" },
    { "@type": "AdministrativeArea", "name": "Gävleborgs län" },
    { "@type": "City", "name": "Sundsvall", "@id": "https://www.wikidata.org/wiki/Q25355" },
    { "@type": "City", "name": "Härnösand", "@id": "https://www.wikidata.org/wiki/Q25374" },
    { "@type": "City", "name": "Timrå", "@id": "https://www.wikidata.org/wiki/Q25371" },
    { "@type": "City", "name": "Ånge", "@id": "https://www.wikidata.org/wiki/Q25364" },
    { "@type": "City", "name": "Örnsköldsvik", "@id": "https://www.wikidata.org/wiki/Q25380" },
    { "@type": "City", "name": "Kramfors" },
    { "@type": "City", "name": "Sollefteå" },
    { "@type": "City", "name": "Östersund", "@id": "https://www.wikidata.org/wiki/Q25565" },
    { "@type": "City", "name": "Hudiksvall", "@id": "https://www.wikidata.org/wiki/Q25403" },
    { "@type": "City", "name": "Gävle", "@id": "https://www.wikidata.org/wiki/Q25395" },
    { "@type": "City", "name": "Sandviken", "@id": "https://www.wikidata.org/wiki/Q25414" },
    { "@type": "City", "name": "Söderhamn", "@id": "https://www.wikidata.org/wiki/Q25408" },
    { "@type": "City", "name": "Bollnäs", "@id": "https://www.wikidata.org/wiki/Q25406" }
  ],
  "sameAs": [
    "https://www.facebook.com/stadsauktionsundsvall",
    "https://www.instagram.com/stadsauktionsundsvall/",
    "https://auctionet.com/sv/search?company_id=48"
  ],
  "hasOfferCatalog": {
    "@type": "OfferCatalog",
    "name": "Tjänster",
    "itemListElement": [
      {
        "@type": "Offer",
        "itemOffered": {
          "@type": "Service",
          "name": "Kostnadsfri värdering",
          "url": "https://stadsauktionsundsvall.se/vardering"
        }
      },
      {
        "@type": "Offer",
        "itemOffered": {
          "@type": "Service",
          "name": "Hembesök och hemvärdering",
          "url": "https://stadsauktionsundsvall.se/hembesok"
        }
      },
      {
        "@type": "Offer",
        "itemOffered": {
          "@type": "Service",
          "name": "Dödsbohantering",
          "url": "https://stadsauktionsundsvall.se/dodsbo"
        }
      }
    ]
  }
}
```

### Every page — BreadcrumbList

```astro
---
// src/components/SchemaOrg.astro
interface Props {
  data: object;
}
const { data } = Astro.props;
---
<script type="application/ld+json" set:html={JSON.stringify(data)} />
```

Example breadcrumb for `/dodsbo`:
```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Hem", "item": "https://stadsauktionsundsvall.se" },
    { "@type": "ListItem", "position": 2, "name": "Dödsbo" }
  ]
}
```

### FAQ pages — FAQPage schema

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Vad kostar det att sälja på auktion?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Provision: 20% av klubbat pris (inkl. moms). Foto/hantering: 80 kr per objekt. Ingen kostnad om inget säljs."
      }
    }
  ]
}
```

### Service pages — Service schema

```json
{
  "@context": "https://schema.org",
  "@type": "Service",
  "name": "Dödsbohantering i Norrland",
  "description": "Komplett dödsbohantering — värdering, hämtning, auktion och städning i Västernorrland, Jämtland och Gävleborg.",
  "url": "https://stadsauktionsundsvall.se/dodsbo",
  "serviceType": "Dödsbohantering",
  "provider": { "@id": "https://stadsauktionsundsvall.se/#organization" },
  "areaServed": [
    { "@type": "AdministrativeArea", "name": "Västernorrlands län" },
    { "@type": "AdministrativeArea", "name": "Jämtlands län" },
    { "@type": "AdministrativeArea", "name": "Gävleborgs län" }
  ]
}
```

---

## 12. Technical SEO Checklist

### Title tags
```
Homepage:     Stadsauktion Sundsvall — Auktionshus i Sundsvall | Värdering & Dödsbon
Värdering:    Värdering av konst och antikviteter i Sundsvall | Stadsauktion Sundsvall
Hembesök:     Hembesök & Hemvärdering i Sundsvall | Kostnadsfritt | Stadsauktion
Dödsbo:       Dödsbo Sundsvall — Värdering, Tömning & Auktion | Stadsauktion
Sälja:        Sälja på auktion — Så fungerar det | Stadsauktion Sundsvall
Om oss:       Om Stadsauktion Sundsvall — Norrlands ledande auktionshus
Kontakt:      Kontakt — Stadsauktion Sundsvall | Öppettider & Vägbeskrivning
FAQ:          Vanliga frågor om auktion och värdering | Stadsauktion Sundsvall
City pages:   Auktionshus [City] — Värdering & Hämtning | Stadsauktion Sundsvall
Category:     Sälja [Category] på auktion — Värdering | Stadsauktion Sundsvall
```

### Image SEO
- File names: `vardering-konst-sundsvall.jpg` (not IMG_4532.jpg)
- Alt text: `Värdering av oljemålning i Sundsvall – Stadsauktion Sundsvall`
- Format: WebP via Astro's `<Image>` component
- Dimensions: always set `width` and `height`
- Loading: `loading="lazy"` on everything below the fold
- Responsive: use `widths={[400, 800, 1200]}` via Astro

### robots.txt
```
User-agent: *
Allow: /
Sitemap: https://stadsauktionsundsvall.se/sitemap-index.xml
```

### Redirects (public/_redirects)
Map old DivHunt URLs to new URLs:
```
/hela-hem-dodsbon          /dodsbo          301
/att-salja-pa-auktion      /salja-pa-auktion 301
/om-oss/personal           /om-oss          301
/om-oss/oppettider-och-vagbeskrivning /kontakt 301
/hembesok                  /hembesok        301
/varderingar               /vardering       301
/tema/*                    /                301
```

### Cache headers (public/_headers)
```
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin

/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/images/*
  Cache-Control: public, max-age=2592000
```

### Core Web Vitals targets
- **LCP** < 2.5s — optimize hero image, preload it
- **INP** < 200ms — zero JS = non-issue
- **CLS** < 0.1 — set image dimensions, preload fonts with `font-display: swap`

### Canonical URLs
- Every page: self-referencing canonical
- Format: `https://stadsauktionsundsvall.se/[path]` (no www, no trailing slash)
- Enforce via redirect: www → non-www, http → https

---

## 13. Google Business Profile

### Category selection
- **Primary:** Auction House
- **Secondary:** Appraiser, Estate Liquidator, Antique Store

### Business description (750 chars max)
```
Stadsauktion Sundsvall är Norrlands ledande auktionshus sedan 2013. Vi erbjuder
kostnadsfri värdering av konst, antikviteter, smycken, silver, klockor och design.
Komplett dödsbohantering med hämtning, fotografering, auktionsförsäljning och
samordning med städfirma. Vi säljer via Auctionet till köpare i hela Norden —
över 4 miljoner potentiella budgivare varje månad. Hembesök i hela Västernorrland,
Jämtland och Gävleborg — Sundsvall, Härnösand, Örnsköldsvik, Östersund,
Hudiksvall, Gävle med flera. Besök oss på Verkstadsgatan 4 tisdag–fredag
eller ring 060-17 00 40 för en kostnadsfri värdering.
```

### Post strategy (1-2/week)
Rotate between:
1. **Veckans fynd** — photo of interesting auction item
2. **Event** — themed auctions, visningar
3. **Service area** — "Vi hämtar i Härnösand denna vecka" (rotate cities)
4. **Behind-the-scenes** — cataloging, photography, team at work
5. **Sold highlights** — impressive hammer prices

### Review strategy
- Ask after every completed sale (email or SMS with direct link)
- Respond to every review within 24h
- Response template: "Tack [Namn]! Roligt att [specific service] fungerade bra. Välkommen åter!"
- Target: 5+ new reviews per month

---

## 14. Local Citations

### Tier 1 — Do immediately
| Directory | Action |
|-----------|--------|
| Google Business Profile | Claim + optimize |
| Eniro (foretag.eniro.se) | Claim listing |
| Hitta.se (hitta.se/foretag) | Claim listing |
| Apple Maps (mapsconnect.apple.com) | Create listing |
| Bing Places (bingplaces.com) | Create listing |
| Facebook | Verify business page NAP |

### Tier 2 — Do within first month
| Directory | Action |
|-----------|--------|
| Allabolag (allabolag.se) | Verify details |
| 118100 (118100.se) | Create listing |
| Gulasidorna | Create listing |

### Tier 3 — Industry-specific
| Directory | Action |
|-----------|--------|
| Auctionet profile | Ensure NAP matches |
| Barnebys (barnebys.se) | List if available |
| Svenska Auktionsverksförbundet | Join if applicable |

### NAP consistency rules
Use EXACTLY this everywhere:
```
Stadsauktion Sundsvall
Verkstadsgatan 4
856 33 Sundsvall
060-17 00 40
```
Same format, character for character, on every listing.

---

## 15. Auctionet API — Live Auction Feed

The Auctionet public API can be used to show current/recent auctions on the new site. No API key needed.

### Base endpoint

```
https://auctionet.com/api/v2/items.json
```

### Query parameters

| Param | Type | Description | Example |
|-------|------|-------------|---------|
| `q` | string | Search query (quoted phrases = required match) | `q="Josef Frank" "byrå"` |
| `is` | string | Item state filter. Omit for live/active items | `is=ended` (completed auctions) |
| `per_page` | number | Results per page (max 200) | `per_page=200` |
| `page` | number | Pagination (1-based) | `page=2` |
| `company_id` | number | Filter by auction house | `company_id=48` (SaS) |
| `category_id` | number | Filter by category | `category_id=5` |

### Filters

| Filter | URL | Description |
|--------|-----|-------------|
| **SaS live auctions** | `?company_id=48&per_page=20` | Current active items from SaS |
| **SaS ended/sold** | `?company_id=48&is=ended&per_page=20` | Recently completed SaS auctions |
| **Latest from SaS** | `?company_id=48&per_page=12` | Latest 12 active SaS items (for homepage feed) |
| **Search SaS items** | `?company_id=48&q="smycken"&per_page=20` | Search within SaS items |
| **All ended by query** | `?is=ended&q="Carl Malmsten"&per_page=50` | Historical sales across all houses |
| **Category filter** | `?company_id=48&category_id=5&per_page=20` | SaS items in specific category |

### Response shape

```json
{
  "items": [
    {
      "id": 12345,
      "title": "BYRÅ, gustaviansk...",
      "description": "...",
      "condition": "...",
      "estimate": 5000,
      "upper_estimate": 8000,
      "bids": [{ "amount": 6500 }],
      "hammered": true,
      "state": "published",
      "ends_at": 1700000000,
      "starting_bid_amount": 2500,
      "next_bid_amount": 3000,
      "reserve_met": true,
      "currency": "SEK",
      "house": "Stadsauktion Sundsvall",
      "company_id": 48,
      "category_id": 5,
      "location": "Sundsvall",
      "url": "/sv/items/12345-byra-gustaviansk"
    }
  ],
  "total": 150
}
```

### Key fields

| Field | Notes |
|-------|-------|
| `bids[0].amount` | Current/final bid (the actual price) |
| `hammered` | `true` = item sold |
| `state` | `"published"` = live, `"ended"` = completed |
| `ends_at` | Unix timestamp in **seconds** (not milliseconds) |
| `estimate` / `upper_estimate` | Auction house price estimates |
| `url` | Relative URL — prepend `https://auctionet.com` |

### Usage on the new site

For the homepage "Pågående auktioner" section, fetch live SaS items at build time or client-side:

```js
// Fetch latest 12 live SaS items
const res = await fetch('https://auctionet.com/api/v2/items.json?company_id=48&per_page=12');
const data = await res.json();
const liveItems = data.items.filter(item => item.state === 'published' && !item.hammered);
```

**Option A — Build-time (SSG):** Fetch in Astro frontmatter. Data is static until next build. Add a scheduled rebuild (Cloudflare cron or GitHub Action) every hour to keep it fresh.

**Option B — Client-side:** Fetch in a small `<script>` tag on the page. Always fresh but adds JS. Keep it minimal — this would be the only JS on the site.

---

## 16. Contact Form

### Option A: Formspree (simplest)

```astro
<!-- src/components/ContactForm.astro -->
<form action="https://formspree.io/f/YOUR_FORM_ID" method="POST" class="contact-form">
  <label>
    Namn *
    <input type="text" name="name" required />
  </label>
  <label>
    Telefon
    <input type="tel" name="phone" />
  </label>
  <label>
    E-post *
    <input type="email" name="email" required />
  </label>
  <!-- Honeypot spam protection -->
  <input type="text" name="_gotcha" style="display:none" tabindex="-1" autocomplete="off" />
  <label>
    Meddelande *
    <textarea name="message" rows="5" required></textarea>
  </label>
  <button type="submit">Skicka</button>
</form>
```

Free: 50 submissions/month. No code needed.

### Option B: Cloudflare Workers (if you need more)

Put a function in `functions/api/contact.ts` — Cloudflare Pages auto-deploys it as a serverless function alongside your static site. Free tier: 100,000 requests/day.

---

## 17. Deployment

### Setup (one-time)

1. **Create the project:**
   ```bash
   npm create astro@latest stadsauktion-sundsvall
   cd stadsauktion-sundsvall
   npx astro add sitemap
   npm install astro-seo
   ```

2. **Push to GitHub** (private repo is fine)

3. **Connect to Cloudflare Pages:**
   - Cloudflare Dashboard → Pages → Create → Connect to Git
   - Select repo
   - Build settings:
     - Framework preset: Astro
     - Build command: `npm run build`
     - Output directory: `dist`
   - Environment variable: `NODE_VERSION` = `20`

4. **Custom domain:**
   - Pages → Custom domains → Add `stadsauktionsundsvall.se`
   - Update DNS: CNAME record pointing to `<project>.pages.dev`

### Ongoing workflow

```bash
# Edit files locally
# Preview:
npm run dev          # localhost:4321

# Deploy:
git add .
git commit -m "Update dödsbo page"
git push             # Auto-deploys in ~30 seconds
```

That's it. Push to GitHub = live in 30 seconds.

---

## 18. Post-Launch SEO Actions

### Week 1
- [ ] Submit sitemap to Google Search Console
- [ ] Submit sitemap to Bing Webmaster Tools
- [ ] Verify all pages indexed (URL Inspection tool)
- [ ] Set up Google Analytics 4
- [ ] Claim/update Google Business Profile
- [ ] Set up redirects from old DivHunt URLs

### Week 2-4
- [ ] Claim all Tier 1 citations (Eniro, Hitta.se, Apple Maps, Bing)
- [ ] Start review campaign (ask recent customers)
- [ ] First Google Business Profile posts
- [ ] Run Lighthouse on all pages, fix any issues
- [ ] Test structured data at search.google.com/test/rich-results

### Month 2-3
- [ ] Monitor Search Console for indexing issues
- [ ] Track keyword rankings for Tier 1 terms
- [ ] Add blog content targeting Tier 4 keywords:
  - "Hur värderar man en tavla?"
  - "Guide: Hantera ett dödsbo i Sundsvall"
  - "Vad är mina antikviteter värda?"
- [ ] Build backlinks: local press, Auctionet profile, industry directories

### Ongoing
- [ ] Weekly GBP posts
- [ ] Monthly review of Search Console data
- [ ] Quarterly content refresh (update prices, hours, "vi söker" items)
- [ ] Track competitor rankings

---

## Quick Reference: File Checklist

```
□ astro.config.mjs
□ public/robots.txt
□ public/_headers
□ public/_redirects
□ public/favicon.svg
□ public/images/og-default.jpg (1200x630)
□ public/images/logo.svg
□ src/styles/global.css
□ src/layouts/BaseLayout.astro
□ src/components/Header.astro
□ src/components/Footer.astro
□ src/components/SEOHead.astro
□ src/components/SchemaOrg.astro
□ src/components/Breadcrumb.astro
□ src/components/ContactForm.astro
□ src/components/ProcessSteps.astro
□ src/components/FAQ.astro
□ src/components/CTABanner.astro
□ src/pages/index.astro
□ src/pages/vardering.astro
□ src/pages/hembesok.astro
□ src/pages/dodsbo.astro
□ src/pages/salja-pa-auktion.astro
□ src/pages/om-oss.astro
□ src/pages/kontakt.astro
□ src/pages/vanliga-fragor.astro
□ src/pages/auktionshus-sundsvall.astro
□ src/pages/auktionshus-harnosand.astro
□ src/pages/auktionshus-timra.astro
□ src/pages/auktionshus-ange.astro
□ src/pages/auktionshus-ornskoldsvik.astro
□ src/pages/auktionshus-kramfors.astro
□ src/pages/auktionshus-solleftea.astro
□ src/pages/auktionshus-ostersund.astro
□ src/pages/auktionshus-hudiksvall.astro
□ src/pages/auktionshus-gavle.astro
□ src/pages/auktionshus-sandviken.astro
□ src/pages/auktionshus-soderhamn.astro
□ src/pages/auktionshus-bollnas.astro
□ src/pages/konst.astro
□ src/pages/smycken.astro
□ src/pages/silver.astro
□ src/pages/mobler.astro
□ src/pages/klockor.astro
□ src/pages/design.astro
□ src/pages/404.astro
```

---

*This document is the complete blueprint for building a best-in-class auction house website that dominates local SEO across Västernorrland, Jämtland and Gävleborg — 13 cities, 3 counties, 1 auction house. Copy it to a new project folder and start building.*
