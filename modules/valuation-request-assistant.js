// modules/valuation-request-assistant.js
// Valuation assistant for Auctionet valuation request pages
// Analyzes customer-submitted images and descriptions, generates valuation emails

export class ValuationRequestAssistant {
  constructor(apiManager) {
    this.apiManager = apiManager;
    this.pageData = null;
    this.valuationResult = null;
    this.isProcessing = false;
  }

  // ─── Initialization ───────────────────────────────────────────────────

  async init() {
    try {
      this.pageData = this.scrapePageData();
      if (!this.pageData) {
        console.warn('[ValuationRequest] Could not scrape page data');
        return;
      }

      console.log('[ValuationRequest] Page data scraped:', {
        name: this.pageData.customerName,
        email: this.pageData.customerEmail,
        descLength: this.pageData.description?.length,
        imageCount: this.pageData.imageUrls.length
      });

      this.injectUI();
    } catch (error) {
      console.error('[ValuationRequest] Init failed:', error);
    }
  }

  // ─── DOM Scraping ─────────────────────────────────────────────────────

  scrapePageData() {
    // Customer name from h1 heading: "Värderingsförfrågan från Linda"
    const h1 = document.querySelector('h1.heading');
    let customerName = '';
    if (h1) {
      const match = h1.textContent.match(/från\s+(.+)/i);
      customerName = match ? match[1].trim() : h1.textContent.trim();
    }

    // Email from mailto: link in info table
    const emailLink = document.querySelector('.span7 a[href^="mailto:"]');
    const customerEmail = emailLink ? emailLink.textContent.trim() : '';

    // Description text after "Vad som ska värderas" heading
    let description = '';
    const h2Elements = document.querySelectorAll('h2');
    for (const h2 of h2Elements) {
      if (h2.textContent.includes('Vad som ska värderas')) {
        // Collect all <p> siblings after this h2
        let sibling = h2.nextElementSibling;
        const parts = [];
        while (sibling && sibling.tagName !== 'H2') {
          if (sibling.tagName === 'P') {
            parts.push(sibling.textContent.trim());
          }
          sibling = sibling.nextElementSibling;
        }
        description = parts.join('\n').trim();
        break;
      }
    }

    // Image URLs from the image gallery
    const imageElements = document.querySelectorAll('.valuation-request-page__image img');
    const imageUrls = Array.from(imageElements).map(img => {
      // Prefer the parent <a> href (full-size) over the img src
      const link = img.closest('a');
      return link ? link.href : img.src;
    }).filter(Boolean);

    // Email language from the language selector
    const langSelect = document.querySelector('#locale_for_mail');
    const language = langSelect ? langSelect.value : 'sv';

    // Extract the existing "Ja tack" mailto template for reference
    const yesLink = document.querySelector('.test-yes-link');
    const existingTemplate = yesLink ? decodeURIComponent(yesLink.href.split('body=')[1] || '') : '';

    if (!customerName && !description && imageUrls.length === 0) {
      return null; // Nothing to work with
    }

    return {
      customerName,
      customerEmail,
      description,
      imageUrls,
      language,
      existingTemplate
    };
  }

  // ─── Image Fetching ───────────────────────────────────────────────────

  async fetchImagesAsBase64() {
    const results = [];
    for (const url of this.pageData.imageUrls) {
      try {
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            { type: 'fetch-image-base64', url },
            (resp) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else if (!resp || !resp.success) {
                reject(new Error(resp?.error || 'Failed to fetch image'));
              } else {
                resolve(resp);
              }
            }
          );
        });

        let { base64, mediaType } = response;

        // Anthropic's 5MB limit is on the base64 STRING length, not decoded bytes.
        // Use 4.5MB threshold for safety margin.
        const base64Size = base64.length;
        if (base64Size > 4.5 * 1024 * 1024) {
          console.log(`[ValuationRequest] Image base64 too large (${(base64Size / 1024 / 1024).toFixed(1)}MB), resizing...`);
          const resized = await this._resizeBase64Image(base64, mediaType);
          base64 = resized.base64;
          mediaType = resized.mediaType;
        }

        results.push({ base64, mediaType });
      } catch (error) {
        console.error(`[ValuationRequest] Failed to fetch image: ${url}`, error);
      }
    }
    return results;
  }

  /**
   * Resize a base64 image to fit within the 5MB API limit
   */
  _resizeBase64Image(base64, mediaType) {
    return new Promise((resolve, reject) => {
      const dataUrl = `data:${mediaType || 'image/jpeg'};base64,${base64}`;
      const img = new Image();
      img.onload = () => {
        let maxDim = 1400;
        let quality = 0.82;

        const tryResize = () => {
          let w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            const ratio = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          const resizedUrl = canvas.toDataURL('image/jpeg', quality);
          const resizedBase64 = resizedUrl.split(',')[1];

          if (resizedBase64.length <= 4.5 * 1024 * 1024 || maxDim <= 600) {
            resolve({ base64: resizedBase64, mediaType: 'image/jpeg' });
          } else {
            maxDim -= 200;
            quality = Math.max(0.5, quality - 0.1);
            tryResize();
          }
        };
        tryResize();
      };
      img.onerror = () => reject(new Error('Failed to load image for resizing'));
      img.src = dataUrl;
    });
  }

  // ─── Valuation ───────────────────────────────────────────────────────

  async runAIValuation() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      this._showLoading();

      // Step 1: Fetch images (cap at 6 to stay within API request size limits)
      const MAX_IMAGES = 6;
      this._updateStatus('Hämtar bilder...');
      let images = await this.fetchImagesAsBase64();

      if (images.length === 0 && !this.pageData.description) {
        throw new Error('Inga bilder eller beskrivning att analysera');
      }

      if (images.length > MAX_IMAGES) {
        console.log(`[ValuationRequest] Limiting from ${images.length} to ${MAX_IMAGES} images`);
        images = images.slice(0, MAX_IMAGES);
      }

      // Step 2: AI analysis
      this._updateStatus(`Analyserar ${images.length} bild(er)${this.pageData.imageUrls.length > MAX_IMAGES ? ` (av ${this.pageData.imageUrls.length})` : ''}...`);
      const aiResult = await this._callClaudeForValuation(images);

      // Step 3: Market data enrichment
      this._updateStatus('Söker marknadsdata på Auctionet...');
      const enrichedResult = await this._enrichWithMarketData(aiResult);

      // Step 4: Round and finalize
      enrichedResult.estimatedValue = this._roundValuation(enrichedResult.estimatedValue);

      this.valuationResult = enrichedResult;

      // Step 5: Render results
      this._renderResults(enrichedResult);

    } catch (error) {
      console.error('[ValuationRequest] Valuation failed:', error);
      this._showError(error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  async _callClaudeForValuation(images) {
    const apiKey = this.apiManager.apiKey;
    if (!apiKey) throw new Error('API-nyckel saknas. Ange din Anthropic API-nyckel i tilläggets inställningar.');

    const model = this.apiManager.getCurrentModel().id;
    const description = this.pageData.description || '(Ingen beskrivning angiven)';

    const systemPrompt = `Du är expert på värdering av antikviteter, konst, design och samlarprylar för Stadsauktion Sundsvall.

UPPGIFT: Analysera kundens bilder och beskrivning och ge en realistisk värdering.

REGLER:
- Basera värderingen på den svenska auktionsmarknaden
- Var konservativ — hellre för lågt än för högt
- Om föremålet har för lågt värde för auktion (under 400 SEK), ange det tydligt
- Beskriv objektet kort och professionellt (1-2 meningar) så kunden ser att vi faktiskt granskat det
- Räkna ALLTID hur många separata föremål kunden vill ha värderade (baserat på bilder OCH beskrivning). T.ex. "2 soffor", "5 tryck", "1 vas" etc.
- estimatedValue ska vara TOTAL värdering för ALLA föremål sammanlagt
- Svara ALLTID i JSON-format`;

    // Build content array with images + text
    const content = [];

    for (let i = 0; i < images.length; i++) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: images[i].mediaType,
          data: images[i].base64
        }
      });
      content.push({
        type: 'text',
        text: `[Bild ${i + 1} av ${images.length}]`
      });
    }

    content.push({
      type: 'text',
      text: `Kundens beskrivning: "${description}"

Antal bilder: ${images.length}

Analysera bilderna och beskrivningen. Returnera EXAKT detta JSON-format:
{
  "objectType": "kort typ, t.ex. Armbandsur, Oljemålning, Vas, Fåtölj",
  "brand": "märke/tillverkare om identifierbart, t.ex. Certina, Rörstrand, Georg Jensen, annars null",
  "artist": "konstnär/formgivare om identifierbar, annars null",
  "model": "modellnamn om känt, t.ex. DS Nautic, Graal, annars null",
  "material": "huvudmaterial, t.ex. rostfritt stål, keramik, olja på duk, annars null",
  "period": "ungefärlig period, t.ex. 1960-tal, 2000-tal, annars null",
  "numberOfObjects": <antal separata föremål kunden vill värdera, t.ex. 1, 2, 5>,
  "briefDescription": "1-2 professionella meningar som beskriver föremålet/föremålen för kunden",
  "estimatedValue": <TOTAL värdering i SEK för ALLA föremål sammanlagt>,
  "estimatedValuePerItem": <uppskattning per styck om numberOfObjects > 1, annars samma som estimatedValue>,
  "tooLowForAuction": <true om estimatedValuePerItem under 400 SEK>,
  "confidence": <0.0-1.0>,
  "reasoning": "intern motivering för värderingen (visas ej för kund)"
}

VIKTIGT för söktermer:
- brand/artist/model är KRITISKA — de avgör hur vi söker i Auctionets databas
- Identifiera ALLTID märke och modell om det går att se på bilder eller i beskrivning
- Skriv brand/artist exakt som det stavas (t.ex. "Certina", inte "certina")`
    });

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'anthropic-fetch',
        apiKey,
        body: {
          model,
          max_tokens: 800,
          temperature: 0.15,
          system: systemPrompt,
          messages: [{ role: 'user', content }]
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.success) {
          reject(new Error(response?.error || 'Analys misslyckades'));
          return;
        }

        try {
          const text = response.data.content?.[0]?.text || '';
          // Extract JSON from response (may be wrapped in markdown code blocks)
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error('Kunde inte tolka svaret');

          const parsed = JSON.parse(jsonMatch[0]);
          const numberOfObjects = parseInt(parsed.numberOfObjects) || 1;
          resolve({
            objectType: parsed.objectType || 'Föremål',
            brand: parsed.brand || null,
            artist: parsed.artist || null,
            model: parsed.model || null,
            material: parsed.material || null,
            period: parsed.period || null,
            numberOfObjects,
            briefDescription: parsed.briefDescription || '',
            estimatedValue: parseInt(parsed.estimatedValue) || 0,
            estimatedValuePerItem: parseInt(parsed.estimatedValuePerItem) || parseInt(parsed.estimatedValue) || 0,
            tooLowForAuction: Boolean(parsed.tooLowForAuction),
            confidence: parseFloat(parsed.confidence) || 0.5,
            reasoning: parsed.reasoning || '',
            marketDataUsed: false,
            marketSales: 0
          });
        } catch (parseError) {
          reject(new Error('Kunde inte tolka svaret: ' + parseError.message));
        }
      });
    });
  }

  async _enrichWithMarketData(result) {
    try {
      // Build progressive search queries from most specific to most general
      // The key insight: brand/artist + object type is far more accurate than just object type
      const queries = this._buildSearchQueries(result);

      if (queries.length === 0) return result;

      // Use auctionetAPI.searchAuctionResults directly to bypass formatArtistForSearch
      // which wraps multi-word queries as exact phrases (e.g., "Robert Högfeldt tavla")
      // instead of individual required terms ("Robert" "Högfeldt" "tavla").
      const auctionetAPI = this.apiManager.auctionetAPI;

      // Try each query in order (most specific first)
      let marketAnalysis = null;
      let usedQuery = '';
      let salesCount = 0;
      for (const q of queries) {
        console.log(`[ValuationRequest] Trying market search: "${q}"`);
        this._updateStatus(`Söker: "${q}"...`);

        const searchResult = await auctionetAPI.searchAuctionResults(q, `Valuation search: ${q}`);
        if (searchResult && searchResult.soldItems && searchResult.soldItems.length > 0) {
          const analysis = await auctionetAPI.analyzeMarketData(
            searchResult.soldItems,
            q,
            result.objectType || '',
            searchResult.totalEntries
          );
          if (analysis && analysis.priceRange) {
            marketAnalysis = analysis;
            usedQuery = q;
            salesCount = analysis.aiFilteredCount || searchResult.soldItems.length;
            break;
          }
        }
      }

      if (marketAnalysis && marketAnalysis.priceRange) {
        const marketLow = marketAnalysis.priceRange.low;
        const marketHigh = marketAnalysis.priceRange.high;
        const marketMid = Math.round((marketLow + marketHigh) / 2);
        const numObjects = result.numberOfObjects || 1;

        // Market data reflects per-item prices — multiply by object count
        const aiEstimate = result.estimatedValue;
        result.estimatedValuePerItem = this._roundValuation(marketMid);
        result.estimatedValue = this._roundValuation(marketMid * numObjects);
        result.marketDataUsed = true;
        result.marketSales = salesCount;
        result.marketRange = { low: marketLow, high: marketHigh };
        result.marketQuery = usedQuery;

        if (aiEstimate && Math.abs(aiEstimate - result.estimatedValue) > result.estimatedValue * 0.3) {
          result.reasoning += ` Initial uppskattning: ${aiEstimate} SEK, marknadsdata: ${result.estimatedValue} SEK.`;
        }

        result.reasoning += ` Marknadsanalys (sök: "${usedQuery}"): ${salesCount} jämförbara försäljningar, prisintervall ${marketLow.toLocaleString()}-${marketHigh.toLocaleString()} SEK/st.`;
        if (numObjects > 1) {
          result.reasoning += ` Totalvärde: ${result.estimatedValue.toLocaleString()} SEK (${numObjects} st × ${result.estimatedValuePerItem.toLocaleString()} SEK).`;
        }
        result.confidence = Math.min(0.9, marketAnalysis.confidence || 0.6);
        result.tooLowForAuction = result.estimatedValuePerItem < 400;
      }

      return result;
    } catch (error) {
      console.warn('[ValuationRequest] Market data enrichment failed:', error);
      return result;
    }
  }

  /**
   * Build search queries from most specific to most general.
   * Priority: brand/artist + model > brand/artist + objectType > brand/artist alone > objectType + material
   */
  _buildSearchQueries(result) {
    const queries = [];
    const brand = result.brand;
    const artist = result.artist;
    const model = result.model;
    const objectType = result.objectType;
    const material = result.material;

    // 1. Most specific: brand/artist + model (e.g., "Certina DS Nautic")
    if (brand && model) {
      queries.push(`${brand} ${model}`);
    }
    if (artist && model) {
      queries.push(`${artist} ${model}`);
    }

    // 2. Brand/artist + object type (e.g., "Certina armbandsur", "Harald Wiberg tavla")
    if (brand && objectType) {
      queries.push(`${brand} ${objectType}`);
    }
    if (artist && objectType) {
      queries.push(`${artist} ${objectType}`);
    }

    // 3. Just brand or artist (e.g., "Certina", "Harald Wiberg")
    if (brand) {
      queries.push(brand);
    }
    if (artist) {
      queries.push(artist);
    }

    // 4. Object type + material as last resort (e.g., "Armbandsur rostfritt stål")
    if (objectType && material) {
      queries.push(`${objectType} ${material}`);
    }

    // 5. Just object type (most generic — only if nothing else worked)
    if (objectType && queries.length === 0) {
      queries.push(objectType);
    }

    // Deduplicate
    const seen = new Set();
    return queries.filter(q => {
      const key = q.toLowerCase().trim();
      if (seen.has(key) || key.length < 3) return false;
      seen.add(key);
      return true;
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  _roundValuation(value) {
    if (!value || value <= 0) return value;
    const nearestThousand = Math.round(value / 1000) * 1000;
    if (nearestThousand > 0 && Math.abs(value - nearestThousand) / nearestThousand <= 0.1) {
      return nearestThousand;
    }
    return Math.round(value / 100) * 100;
  }

  // ─── Email Generation ─────────────────────────────────────────────────

  generateEmailText(result) {
    const name = this.pageData.customerName || '';
    const lang = this.pageData.language || 'sv';

    if (lang === 'sv') {
      if (result.tooLowForAuction) {
        return this._generateSwedishRejectionEmail(name, result);
      }
      return this._generateSwedishAcceptEmail(name, result);
    } else {
      if (result.tooLowForAuction) {
        return this._generateEnglishRejectionEmail(name, result);
      }
      return this._generateEnglishAcceptEmail(name, result);
    }
  }

  _generateSwedishAcceptEmail(name, result) {
    return `Hej ${name},

Tack för din värderingsförfrågan!

${result.briefDescription}

Vår preliminära uppskattning av ditt föremål ligger på cirka ${result.estimatedValue.toLocaleString()} kr. Observera att detta är en ungefärlig bedömning baserad på bilder och beskrivning — den slutgiltiga värderingen görs först när vi har möjlighet att fysiskt granska föremålet.

Vi säljer uteslutande via onlineauktioner på Auctionet.com — en av Europas ledande marknadsplatser för konst, antikviteter och design med över 900 000 registrerade köpare i 180 länder och 5,5 miljoner besök varje månad. Det ger ditt föremål en bred internationell exponering.

Om du vill gå vidare är du välkommen att lämna in ditt föremål till oss. En av våra experter granskar det och gör en slutgiltig värdering. Föremålet läggs ut på auktion först efter att du godkänt värderingen och bevakningspriset. Vi tar hand om hela processen: fotografering, katalogisering, auktion, betalning och eventuell transport. Utbetalning sker cirka 25 dagar efter avslutad auktion.

Hör gärna av dig om du har frågor eller fler föremål du vill få värderade!

Med vänliga hälsningar,
Stadsauktion Sundsvall
Verkstadsgatan 4, 853 33 Sundsvall
Telefon: 060 - 17 00 40`;
  }

  _generateSwedishRejectionEmail(name, result) {
    return `Hej ${name},

Tack för din värderingsförfrågan!

${result.briefDescription}

Tyvärr bedömer vi att ditt föremål har ett för lågt uppskattat värde för att vi ska kunna ta in det till försäljning via våra onlineauktioner på Auctionet.com. Observera att detta är en preliminär bedömning baserad på bilder och beskrivning.

Du är välkommen att höra av dig igen om du har andra föremål du skulle vilja få värderade.

Med vänliga hälsningar,
Stadsauktion Sundsvall
Verkstadsgatan 4, 853 33 Sundsvall
Telefon: 060 - 17 00 40`;
  }

  _generateEnglishAcceptEmail(name, result) {
    return `Hi ${name},

Thank you for your valuation request!

${result.briefDescription}

Our preliminary estimate for your item is approximately ${result.estimatedValue.toLocaleString()} SEK. Please note that this is a rough assessment based on photos and description — the final valuation will be made once we have the opportunity to physically examine the item.

We sell exclusively through online auctions on Auctionet.com — one of Europe's leading marketplaces for art, antiques and design, with over 900,000 registered buyers in 180 countries and 5.5 million visits every month. This gives your item broad international exposure.

If you would like to proceed, you are welcome to bring your item to us. One of our experts will examine it and make a final valuation. Your item will only be listed for auction after you have approved the valuation and reserve price. We handle the entire process: photography, cataloging, auction, payment and shipping. Payment is made approximately 25 days after the auction closes.

Please don't hesitate to contact us if you have questions or more items you would like valued!

Best regards,
Stadsauktion Sundsvall
Verkstadsgatan 4, 853 33 Sundsvall
Phone: +46 60 17 00 40`;
  }

  _generateEnglishRejectionEmail(name, result) {
    return `Hi ${name},

Thank you for your valuation request!

${result.briefDescription}

Unfortunately, based on our preliminary assessment from photos and description, we estimate that your item has too low a value for us to include it in our online auctions on Auctionet.com.

You are most welcome to contact us again if you have other items you would like valued.

Best regards,
Stadsauktion Sundsvall
Verkstadsgatan 4, 853 33 Sundsvall
Phone: +46 60 17 00 40`;
  }

  // ─── UI ───────────────────────────────────────────────────────────────

  injectUI() {
    // Find the sidebar (.span5) and inject our button above the first .well
    const sidebar = document.querySelector('.span5');
    if (!sidebar) {
      console.warn('[ValuationRequest] Could not find sidebar');
      return;
    }

    // Create container
    const container = document.createElement('div');
    container.id = 'vr-assistant';
    container.className = 'well hide-in-print';
    container.innerHTML = `
      <h3 class="center heading heading--size-sm heading--weight-medium heading--with-margin">
        Värdering
      </h3>
      <p style="font-size: 13px; color: #666; margin-bottom: 12px;">
        Analyserar kundens bilder och beskrivning med hjälp av Auctionets marknadsdata.
      </p>
      <div id="vr-image-count" style="font-size: 12px; color: #888; margin-bottom: 8px;">
        ${this.pageData.imageUrls.length} bild(er)${this.pageData.imageUrls.length > 6 ? ' (max 6 analyseras)' : ''} · ${this.pageData.description ? 'Beskrivning finns' : 'Ingen beskrivning'}
      </div>
      <button id="vr-analyze-btn" class="btn btn-block btn-info" style="margin-bottom: 10px;">
        <i class="icon fas fa-magic"></i> Analysera och värdera
      </button>
      <div id="vr-results" style="display: none;"></div>
    `;

    // Insert before the first .well in the sidebar
    const firstWell = sidebar.querySelector('.well');
    if (firstWell) {
      sidebar.insertBefore(container, firstWell);
    } else {
      sidebar.appendChild(container);
    }

    // Attach click handler
    document.getElementById('vr-analyze-btn').addEventListener('click', () => {
      this.runAIValuation();
    });
  }

  _showLoading() {
    const results = document.getElementById('vr-results');
    const btn = document.getElementById('vr-analyze-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="icon fas fa-spinner fa-spin"></i> Analyserar...';
    }
    if (results) {
      results.style.display = 'block';
      results.innerHTML = `
        <div class="vr-loading">
          <div class="vr-status" id="vr-status" style="font-size: 13px; color: #006ccc; margin: 8px 0;">
            Startar analys...
          </div>
          <div class="vr-progress" style="height: 3px; background: #e9ecef; border-radius: 2px; overflow: hidden;">
            <div style="height: 100%; width: 30%; background: #006ccc; animation: vrProgress 2s ease-in-out infinite;"></div>
          </div>
        </div>
      `;
    }
  }

  _updateStatus(message) {
    const status = document.getElementById('vr-status');
    if (status) status.textContent = message;
  }

  _showError(message) {
    const results = document.getElementById('vr-results');
    const btn = document.getElementById('vr-analyze-btn');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="icon fas fa-magic"></i> Analysera och värdera';
    }
    if (results) {
      results.style.display = 'block';
      results.innerHTML = `
        <div style="padding: 10px; background: #fff3e0; border-radius: 4px; font-size: 13px; color: #e65100;">
          <strong>Analys misslyckades:</strong> ${message}
        </div>
      `;
    }
  }

  _renderResults(result) {
    const results = document.getElementById('vr-results');
    const btn = document.getElementById('vr-analyze-btn');

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="icon fas fa-magic"></i> Analysera igen';
    }

    if (!results) return;

    // Generate email text
    const emailText = this.generateEmailText(result);

    // Confidence label
    const confLabel = result.confidence >= 0.7 ? 'Hög' : result.confidence >= 0.4 ? 'Medel' : 'Låg';
    const confColor = result.confidence >= 0.7 ? '#28a745' : result.confidence >= 0.4 ? '#006ccc' : '#e65100';

    // Source indicator
    const sourceHTML = result.marketDataUsed
      ? `<div class="vr-source" style="display: flex; align-items: center; gap: 6px; padding: 6px 10px; margin-bottom: 10px; background: #e8f5e9; border-radius: 4px; font-size: 12px; color: #2e7d32;">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
           <span>Baserat på <strong>${result.marketSales} sålda föremål</strong> på Auctionet</span>
         </div>`
      : `<div class="vr-source" style="display: flex; align-items: center; gap: 6px; padding: 6px 10px; margin-bottom: 10px; background: #fff3e0; border-radius: 4px; font-size: 12px; color: #e65100;">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v2m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>
           <span>Uppskattning — ingen jämförbar marknadsdata hittades från Auctionet</span>
         </div>`;

    // Value display
    const valueHTML = result.tooLowForAuction
      ? `<div style="padding: 8px 12px; background: #fff3e0; border-radius: 4px; margin-bottom: 10px;">
           <div style="font-size: 14px; font-weight: 600; color: #e65100;">Under minimivärde för auktion</div>
           <div style="font-size: 12px; color: #888; margin-top: 2px;">Uppskattat värde: ${(result.estimatedValue || 0).toLocaleString()} SEK</div>
         </div>`
      : `<div style="padding: 8px 12px; background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 4px; margin-bottom: 10px;">
           <div style="font-size: 12px; color: #888;">Uppskattat värde</div>
           <div style="font-size: 20px; font-weight: 600; color: #333;">${result.estimatedValue.toLocaleString()} SEK</div>
           <div style="font-size: 11px; color: ${confColor}; margin-top: 2px;">${confLabel} säkerhet</div>
         </div>`;

    // Multi-object hint
    const multiObjectHTML = (result.numberOfObjects && result.numberOfObjects > 1)
      ? `<div style="display: flex; align-items: center; gap: 6px; padding: 6px 10px; margin-bottom: 10px; background: #e3f2fd; border-radius: 4px; font-size: 12px; color: #1565c0;">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
           <span><strong>${result.numberOfObjects} föremål</strong> identifierade — värderingen avser alla sammanlagt${result.estimatedValuePerItem ? ` (ca ${result.estimatedValuePerItem.toLocaleString()} SEK/st)` : ''}</span>
         </div>`
      : '';

    // Object description
    const descHTML = result.briefDescription
      ? `<div style="font-size: 13px; color: #555; margin-bottom: 10px; padding: 6px 10px; background: #f8f9fa; border-radius: 4px;">
           <strong>${result.objectType}:</strong> ${result.briefDescription}
         </div>`
      : '';

    // Build "verify on Auctionet" link using the best available search query
    const verifyQuery = result.marketQuery || result.brand || result.artist || result.objectType || '';
    const verifyLink = verifyQuery
      ? `<a href="https://auctionet.com/sv/search?is=ended&q=${encodeURIComponent(verifyQuery)}" target="_blank" style="display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: #006ccc; margin-bottom: 10px; text-decoration: none;">
           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
           Se sålda objekt på Auctionet.com <span style="color: #888;">(${verifyQuery})</span>
         </a>`
      : '';

    // Search query editor for manual refinement
    const searchEditorHTML = `
      <div style="margin-top: 4px; margin-bottom: 12px;">
        <label style="font-size: 11px; color: #888; display: block; margin-bottom: 3px;">Sökfråga för marknadsdata:</label>
        <div style="display: flex; gap: 6px;">
          <input id="vr-search-query" type="text" value="${this._escapeHTML(verifyQuery)}"
                 style="flex: 1; padding: 4px 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 12px;">
          <button id="vr-reanalyze-btn" class="btn btn-small"
                  style="white-space: nowrap; font-size: 12px;">Sök igen</button>
        </div>
        <div id="vr-search-feedback" style="display: none; font-size: 11px; margin-top: 4px;"></div>
      </div>`;

    results.style.display = 'block';
    results.innerHTML = `
      ${sourceHTML}
      ${descHTML}
      ${valueHTML}
      ${multiObjectHTML}
      ${verifyLink}
      ${searchEditorHTML}

      <div style="margin-top: 12px;">
        <label style="font-size: 12px; font-weight: 600; color: #555; display: block; margin-bottom: 4px;">
          E-posttext (redigera vid behov):
        </label>
        <textarea id="vr-email-text" style="width: 100%; min-height: 200px; padding: 10px; border: 1px solid #ced4da; border-radius: 4px; font-size: 13px; font-family: inherit; resize: vertical; line-height: 1.5;">${this._escapeHTML(emailText)}</textarea>
      </div>

      <div style="display: flex; gap: 8px; margin-top: 10px;">
        <button id="vr-copy-btn" class="btn btn-block" style="flex: 1;">
          <i class="icon fas fa-copy"></i> Kopiera text
        </button>
        <a id="vr-mailto-btn" class="btn btn-block btn-success" style="flex: 1; text-align: center;" href="#">
          <i class="icon fas fa-envelope"></i> Skicka via e-post
        </a>
      </div>

      <div id="vr-copy-feedback" style="display: none; text-align: center; font-size: 12px; color: #28a745; margin-top: 6px;">
        Kopierat!
      </div>
    `;

    // Attach handlers
    this._attachResultHandlers();
  }

  _attachResultHandlers() {
    // Copy button
    const copyBtn = document.getElementById('vr-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const textarea = document.getElementById('vr-email-text');
        if (textarea) {
          navigator.clipboard.writeText(textarea.value).then(() => {
            const feedback = document.getElementById('vr-copy-feedback');
            if (feedback) {
              feedback.style.display = 'block';
              setTimeout(() => { feedback.style.display = 'none'; }, 2000);
            }
          });
        }
      });
    }

    // Mailto button — update href whenever textarea changes
    const mailtoBtn = document.getElementById('vr-mailto-btn');
    const textarea = document.getElementById('vr-email-text');

    const updateMailtoHref = () => {
      if (!mailtoBtn || !textarea) return;
      const subject = encodeURIComponent(`Värderingsförfrågan från ${this.pageData.customerName}`);
      const body = encodeURIComponent(textarea.value);
      mailtoBtn.href = `mailto:${this.pageData.customerEmail}?subject=${subject}&body=${body}`;
    };

    if (textarea) {
      textarea.addEventListener('input', updateMailtoHref);
      // Set initial href
      updateMailtoHref();
    }

    // Search query re-analyze button + Enter key
    const reanalyzeBtn = document.getElementById('vr-reanalyze-btn');
    const searchInput = document.getElementById('vr-search-query');
    if (reanalyzeBtn) {
      reanalyzeBtn.addEventListener('click', () => this._rerunMarketSearch());
    }
    if (searchInput) {
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this._rerunMarketSearch();
        }
      });
    }

    // Also update the existing "Ja tack" button with the valuation
    this._updateExistingYesButton();
  }

  async _rerunMarketSearch() {
    const input = document.getElementById('vr-search-query');
    const btn = document.getElementById('vr-reanalyze-btn');
    const feedback = document.getElementById('vr-search-feedback');
    if (!input) return;

    const query = input.value.trim();
    if (query.length < 2) {
      if (feedback) {
        feedback.style.display = 'block';
        feedback.style.color = '#e65100';
        feedback.textContent = 'Ange minst 2 tecken.';
      }
      return;
    }

    // Loading state
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Söker...';
    }
    if (feedback) {
      feedback.style.display = 'block';
      feedback.style.color = '#006ccc';
      feedback.textContent = `Söker "${query}" på Auctionet...`;
    }

    try {
      // Call searchAuctionResults directly to bypass formatArtistForSearch
      // which wraps multi-word strings as a single phrase ("Robert Högfeldt print")
      // instead of individual required terms ("Robert" "Högfeldt" "print").
      const auctionetAPI = this.apiManager.auctionetAPI;
      const searchResult = await auctionetAPI.searchAuctionResults(query, `Manual valuation search: ${query}`);

      if (searchResult && searchResult.soldItems && searchResult.soldItems.length > 0) {
        // Analyze the market data to get proper price ranges
        const marketAnalysis = await auctionetAPI.analyzeMarketData(
          searchResult.soldItems,
          query, // artistName placeholder
          this.valuationResult.objectType || '',
          searchResult.totalEntries
        );

        if (marketAnalysis && marketAnalysis.priceRange) {
          const marketLow = marketAnalysis.priceRange.low;
          const marketHigh = marketAnalysis.priceRange.high;
          const marketMid = Math.round((marketLow + marketHigh) / 2);
          const numObjects = this.valuationResult.numberOfObjects || 1;

          // Market data reflects per-item prices — multiply by object count
          this.valuationResult.estimatedValuePerItem = this._roundValuation(marketMid);
          this.valuationResult.estimatedValue = this._roundValuation(marketMid * numObjects);
          this.valuationResult.marketDataUsed = true;
          this.valuationResult.marketSales = marketAnalysis.aiFilteredCount || searchResult.soldItems.length;
          this.valuationResult.marketRange = { low: marketLow, high: marketHigh };
          this.valuationResult.marketQuery = query;
          this.valuationResult.confidence = Math.min(0.9, marketAnalysis.confidence || 0.6);
          this.valuationResult.tooLowForAuction = this.valuationResult.estimatedValuePerItem < 400;

          // Re-render everything with updated data
          this._renderResults(this.valuationResult);
          return;
        }
      }

      // No results — show feedback but keep current valuation
      if (feedback) {
        feedback.style.display = 'block';
        feedback.style.color = '#e65100';
        feedback.textContent = `Inga jämförbara resultat för "${query}". Värderingen behålls.`;
      }
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Sök igen';
      }
    } catch (error) {
      console.error('[ValuationRequest] Re-search failed:', error);
      if (feedback) {
        feedback.style.display = 'block';
        feedback.style.color = '#e65100';
        feedback.textContent = 'Sökning misslyckades. Försök igen.';
      }
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Sök igen';
      }
    }
  }

  _updateExistingYesButton() {
    if (!this.valuationResult || this.valuationResult.tooLowForAuction) return;

    const yesLink = document.querySelector('.test-yes-link');
    if (!yesLink) return;

    // Decode the existing href, replace [???] with our value, re-encode
    try {
      const href = yesLink.href;
      const newHref = href.replace(
        encodeURIComponent('[???]'),
        encodeURIComponent(this.valuationResult.estimatedValue.toLocaleString())
      );
      yesLink.href = newHref;
    } catch (e) {
      // Non-critical
    }
  }

  _escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
