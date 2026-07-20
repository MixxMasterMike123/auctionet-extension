# Feedback: Datainsikter (Beta)

Stadsauktion Sundsvall, 2026-03-26

---

## Sammanfattning

Datainsikter är ett välkommet tillskott! Vi har länge saknat tillgång till strukturerad data om vår verksamhet. Dashboarden ger en bra överblick av nuläget och vi ser stor potential i att bygga vidare på detta.

Nedan delar vi våra tankar om vad som fungerar bra, vad vi saknar, och förslag på hur Datainsikter kan bli ännu mer värdefullt för oss som auktionshus.

---

## Vad som fungerar bra

### Föremålshantering (Dashboard 252)
- Bra överblick av daglig throughput: inskrivet, katalogiserat, fotograferat, publicerat
- "Employee overview" är värdefullt — vi kan se arbetsfördelning i realtid
- Snitt foton/föremål är en nyttig kvalitetsindikator

### Sålt/Osålt (Dashboard 253)
- **"Share unsold L12m" är den viktigaste siffran i hela dashboarden.** Den visar verklig återropsandel — föremål som gått genom ALLA automatiska auktionsomgångar utan att säljas. Detta är ett nyckeltal vi inte kan få tag på från någon annan källa.
- Månadsvis sold/unsold-fördelning ger bra trendöversikt
- Tydlig definition av "unsold" i hjälptexten — det uppskattar vi

### Försäljningsresultat (Dashboard 273)
- Bra att se estimat vs faktiskt utfall
- Provision och säljares intäkt i siffror

---

## Vad vi saknar

### 1. Historisk data — den största bristen

Dashboarden visar bara rullande fönster (L12m, 30 dagar, idag/igår). Vi kan inte:

- Jämföra 2025 med 2024 eller 2023
- Se hur återropsandelen utvecklats över flera år
- Analysera säsongsmönster år-för-år
- Utvärdera effekten av förändringar vi gjort (t.ex. nya prissättningsstrategier)

**Förslag:** Lägg till möjlighet att välja godtycklig tidsperiod (från-till datum) eller åtminstone kalenderår. Även om det bara gäller data från t.ex. 2023 och framåt vore det mycket värdefullt.

### 2. Filtrering per kategori

Vi säljer allt från konst till klockor till möbler. Återropsandelen varierar dramatiskt mellan kategorier — men vi kan inte se vilka kategorier som presterar bra respektive dåligt.

**Förslag:** Lägg till kategorifilter på Sålt/Osålt-dashboarden, eller visa en tabell med återropsandel per kategori. Att veta att "Leksaker har 25% återrop medan Klockor har 8%" hjälper oss prioritera var vi behöver förbättra katalogisering och prissättning.

### 3. Exportmöjligheter

Vi vill kunna analysera vår data i egna verktyg (Excel, Google Sheets, etc.) för djupare analys. CSV-export finns per enskild widget, men det ger bara en enskild datapunkt i taget.

**Förslag:**
- **CSV-export av aggregerad data** — t.ex. alla kategorier med sold/unsold/estimat/klubbat för en vald period, i en enda fil
- **Schemalagd export** — möjlighet att få vecko-/månadsrapporter via e-post
- Alternativt: ett **API-endpoint** (även read-only) som ger oss tillgång till vår egen data programmatiskt. Vi bygger gärna egna analyser ovanpå om vi får tillgång till rådata.

### 4. Skillnaden mellan "osålt" och "återropat"

Vi har noterat att Flödesstatistiken (på admin-startsidan) visar ~14% återrop medan Datainsikter visar ~16% "share unsold". Definitionen i Datainsikter ("all automatic auction rounds have concluded") är tydlig och bra, men det vore värdefullt med:

- En förklaring av skillnaden direkt i dashboarden
- Möjlighet att se båda perspektiven: per auktionsomgång och per unikt föremål

### 5. Data vi redan har — men hellre skulle få via API

Vi hämtar idag viss data via sidan `/admin/sas/auction_results` (HTML-scraping). Den ger oss per-kategori-data med 12 kolumner (estimat, bevakningar, klubbat, sålda, osålda, snittpris, besök, provision m.m.) som vi inte hittar i Datainsikter.

Om dessa datapunkter kunde exponeras via ett riktigt API eller ingå i Datainsikter med filtrering, skulle vi slippa skrapa HTML — vilket är bräckligt och inte en ideal lösning för någon av oss.

---

## Önskelista — prioriterad

| Prioritet | Funktion | Varför |
|-----------|----------|--------|
| 1 | **Historiska perioder** (välj år/månad) | Möjliggör YoY-jämförelser och trendanalys |
| 2 | **Kategorifilter/-nedbrytning** på Sålt/Osålt | Identifiera problemområden och mäta förbättringar |
| 3 | **CSV-export av samlad data** per period | Egna analyser i Excel/Sheets |
| 4 | **API-åtkomst** till vår egen data | Programmatisk åtkomst utan HTML-scraping |
| 5 | **Återropsandel per kategori och period** | Det enskilt viktigaste nyckeltalet för att minska kostnader |
| 6 | **Lagerdag-kostnad** per kategori | Föremål som inte säljs kostar lagerdagar — visualisera detta |

---

## Avslutning

Datainsikter är ett bra första steg och vi uppskattar att Auctionet investerar i att ge oss bättre insyn i vår verksamhet. Med historisk data och filtreringsmöjligheter kan det bli vårt viktigaste verktyg för att förbättra vår verksamhet.

Vi delar gärna med oss av hur vi analyserar vår data idag och vilka frågor vi försöker besvara — kanske kan det hjälpa er prioritera vidareutvecklingen.

Tack!
