// modules/valuation-request-assistant.js
// Valuation assistant for Auctionet valuation request pages
// Analyzes customer-submitted images and descriptions, generates valuation emails

export class ValuationRequestAssistant {
  constructor(apiManager) {
    this.apiManager = apiManager;
    this.pageData = null;
    this.valuationResult = null;
    this.multiGroupResults = null;
    this.confirmedGroups = null;
    this.fetchedImages = null;
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

  // ─── Image Clustering ────────────────────────────────────────────────

  async _clusterImages(images, customerDescription) {
    const apiKey = this.apiManager.apiKey;
    if (!apiKey) throw new Error('API-nyckel saknas.');

    const content = [];
    for (let i = 0; i < images.length; i++) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: images[i].mediaType, data: images[i].base64 }
      });
      content.push({ type: 'text', text: `[Bild ${i + 1}]` });
    }

    content.push({
      type: 'text',
      text: `Kundens beskrivning: "${customerDescription || '(ingen)'}"

UPPGIFT: Granska bilderna och avgör om de visar ETT eller FLERA OLIKA föremål.
Bilder av samma föremål (t.ex. framsida och baksida av en tavla, eller närbild av en signatur) ska grupperas ihop.
Olika föremål (t.ex. en tavla OCH en vas) ska vara separata grupper.

Svara i JSON:
{
  "groups": [
    { "id": 1, "imageIndices": [0, 1, 2], "label": "kort beskrivning, t.ex. Oljemålning, landskap" },
    { "id": 2, "imageIndices": [3, 4], "label": "kort beskrivning" }
  ]
}

imageIndices är 0-baserade bildindex. Varje bild måste tillhöra exakt en grupp.`
    });

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'anthropic-fetch',
        apiKey,
        body: {
          model: 'claude-opus-4-6',
          max_tokens: 400,
          temperature: 0.2,
          messages: [{ role: 'user', content }]
        }
      }, (response) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!response?.success) return reject(new Error(response?.error || 'Klustring misslyckades'));

        try {
          const text = response.data.content?.[0]?.text || '';
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error('Kunde inte tolka klustringssvar');

          const parsed = JSON.parse(jsonMatch[0]);
          const groups = (parsed.groups || []).map((g, i) => ({
            id: g.id || i + 1,
            imageIndices: Array.isArray(g.imageIndices) ? g.imageIndices : [],
            label: g.label || `Grupp ${i + 1}`
          }));

          resolve(groups);
        } catch (e) {
          reject(new Error('Kunde inte tolka klustringssvar: ' + e.message));
        }
      });
    });
  }

  // ─── Clustering UI (Drag & Drop) ───────────────────────────────────

  _renderClusteringUI(groups, images) {
    const results = document.getElementById('vr-results');
    if (!results) return;

    results.style.display = 'block';

    const thumbsHTML = (indices) => indices.map(idx => {
      const img = images[idx];
      if (!img) return '';
      const src = `data:${img.mediaType};base64,${img.base64}`;
      return `<div class="vr-cluster-thumb" draggable="true" data-img-idx="${idx}">
        <img src="${src}" alt="Bild ${idx + 1}">
        <span class="vr-cluster-thumb__label">${idx + 1}</span>
      </div>`;
    }).join('');

    const groupsHTML = groups.map(g => `
      <div class="vr-cluster-group" data-group-id="${g.id}">
        <div class="vr-cluster-group__header">
          <input class="vr-cluster-group__label" type="text" value="${this._escapeHTML(g.label)}" data-group-id="${g.id}">
          <button class="vr-cluster-group__remove" data-group-id="${g.id}" title="Ta bort grupp">&times;</button>
        </div>
        <div class="vr-cluster-group__thumbs" data-group-id="${g.id}">
          ${thumbsHTML(g.imageIndices)}
        </div>
      </div>
    `).join('');

    results.innerHTML = `
      <div class="vr-cluster-container">
        <div style="font-size: 13px; font-weight: 600; color: #333; margin-bottom: 6px;">
          AI har identifierat ${groups.length} föremål
        </div>
        <div style="font-size: 11px; color: #888; margin-bottom: 10px;">
          Dra bilder mellan grupper om det behövs. Klicka "Värdera alla" när grupperingen stämmer.
        </div>
        <div id="vr-cluster-groups">
          ${groupsHTML}
        </div>
        <button id="vr-add-group-btn" class="btn btn-small" style="margin-top: 8px;">
          + Ny grupp
        </button>
        <button id="vr-run-valuation-btn" class="btn btn-block btn-success" style="margin-top: 12px;">
          Värdera alla (${groups.length} föremål)
        </button>
      </div>
    `;

    this._attachClusterHandlers(groups, images);
  }

  _attachClusterHandlers(groups, images) {
    const container = document.getElementById('vr-cluster-groups');
    if (!container) return;

    let draggedIdx = null;

    // Drag start
    container.addEventListener('dragstart', (e) => {
      const thumb = e.target.closest('.vr-cluster-thumb');
      if (!thumb) return;
      draggedIdx = parseInt(thumb.dataset.imgIdx);
      thumb.classList.add('vr-cluster-thumb--dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedIdx.toString());
    });

    // Drag end
    container.addEventListener('dragend', (e) => {
      const thumb = e.target.closest('.vr-cluster-thumb');
      if (thumb) thumb.classList.remove('vr-cluster-thumb--dragging');
      container.querySelectorAll('.vr-cluster-group--dragover').forEach(el =>
        el.classList.remove('vr-cluster-group--dragover')
      );
      draggedIdx = null;
    });

    // Dragover / dragleave on drop zones
    container.addEventListener('dragover', (e) => {
      const zone = e.target.closest('.vr-cluster-group__thumbs');
      if (!zone) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      zone.closest('.vr-cluster-group')?.classList.add('vr-cluster-group--dragover');
    });

    container.addEventListener('dragleave', (e) => {
      const zone = e.target.closest('.vr-cluster-group__thumbs');
      if (zone) {
        const group = zone.closest('.vr-cluster-group');
        if (group && !group.contains(e.relatedTarget)) {
          group.classList.remove('vr-cluster-group--dragover');
        }
      }
    });

    // Drop
    container.addEventListener('drop', (e) => {
      e.preventDefault();
      const zone = e.target.closest('.vr-cluster-group__thumbs');
      if (!zone || draggedIdx === null) return;

      const targetGroupId = parseInt(zone.dataset.groupId);
      const imgIdx = draggedIdx;

      // Remove from old group
      for (const g of groups) {
        g.imageIndices = g.imageIndices.filter(i => i !== imgIdx);
      }
      // Add to new group
      const targetGroup = groups.find(g => g.id === targetGroupId);
      if (targetGroup) targetGroup.imageIndices.push(imgIdx);

      // Re-render
      this._renderClusteringUI(groups, images);
    });

    // Remove group button
    container.querySelectorAll('.vr-cluster-group__remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const gid = parseInt(btn.dataset.groupId);
        const group = groups.find(g => g.id === gid);
        if (!group) return;

        // Move images to first remaining group, or create uncategorized
        const otherGroups = groups.filter(g => g.id !== gid);
        if (otherGroups.length > 0) {
          otherGroups[0].imageIndices.push(...group.imageIndices);
        }
        const idx = groups.indexOf(group);
        groups.splice(idx, 1);
        this._renderClusteringUI(groups, images);
      });
    });

    // Label editing
    container.querySelectorAll('.vr-cluster-group__label').forEach(input => {
      input.addEventListener('change', () => {
        const gid = parseInt(input.dataset.groupId);
        const group = groups.find(g => g.id === gid);
        if (group) group.label = input.value.trim() || group.label;
      });
    });

    // Add group
    document.getElementById('vr-add-group-btn')?.addEventListener('click', () => {
      const maxId = Math.max(0, ...groups.map(g => g.id));
      groups.push({ id: maxId + 1, imageIndices: [], label: 'Nytt föremål' });
      this._renderClusteringUI(groups, images);
    });

    // Run valuation for all groups
    document.getElementById('vr-run-valuation-btn')?.addEventListener('click', () => {
      // Remove empty groups
      const validGroups = groups.filter(g => g.imageIndices.length > 0);
      if (validGroups.length === 0) return;
      this.confirmedGroups = validGroups;
      this._runMultiGroupValuation(validGroups, images);
    });
  }

  // ─── Valuation ───────────────────────────────────────────────────────

  async runAIValuation() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      this._showLoading();

      // Step 1: Fetch images
      const MAX_IMAGES = 10;
      this._updateStatus('Hämtar bilder...');
      let images = await this.fetchImagesAsBase64();

      if (images.length === 0 && !this.pageData.description) {
        throw new Error('Inga bilder eller beskrivning att analysera');
      }

      if (images.length > MAX_IMAGES) {
        console.log(`[ValuationRequest] Limiting from ${images.length} to ${MAX_IMAGES} images`);
        images = images.slice(0, MAX_IMAGES);
      }

      this.fetchedImages = images;

      // Step 2: If multiple images, cluster them to detect multiple objects
      if (images.length > 1) {
        this._updateStatus('Analyserar bildgruppering...');
        try {
          const groups = await this._clusterImages(images, this.pageData.description);
          console.log('[ValuationRequest] Clustering result:', groups);

          if (groups.length > 1) {
            // Multiple objects detected — show grouping UI for confirmation
            this.isProcessing = false;
            const btn = document.getElementById('vr-analyze-btn');
            if (btn) {
              btn.disabled = false;
              btn.innerHTML = '<i class="icon fas fa-magic"></i> Analysera igen';
            }
            this._renderClusteringUI(groups, images);
            return;
          }
        } catch (clusterError) {
          console.warn('[ValuationRequest] Clustering failed, proceeding with single-object flow:', clusterError);
        }
      }

      // Single-object flow (original path)
      await this._runSingleObjectValuation(images);

    } catch (error) {
      console.error('[ValuationRequest] Valuation failed:', error);
      this._showError(error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  async _runSingleObjectValuation(images) {
    this._updateStatus(`Analyserar ${images.length} bild(er)...`);
    const aiResult = await this._callClaudeForValuation(images);

    this._updateStatus('Söker marknadsdata på Auctionet...');
    const enrichedResult = await this._enrichWithMarketData(aiResult);
    enrichedResult.estimatedValue = this._roundValuation(enrichedResult.estimatedValue);

    this.valuationResult = enrichedResult;
    this.multiGroupResults = null;
    this._renderResults(enrichedResult);
  }

  async _runMultiGroupValuation(groups, images) {
    this.isProcessing = true;
    this._showLoading();

    try {
      const totalGroups = groups.length;

      // Run groups sequentially to avoid race conditions on status updates
      // and provide clear progress feedback to the user
      const groupResults = [];
      for (let idx = 0; idx < groups.length; idx++) {
        const group = groups[idx];
        const groupImages = group.imageIndices.map(i => images[i]).filter(Boolean);
        if (groupImages.length === 0) {
          groupResults.push(null);
          continue;
        }

        this._updateStatus(`Analyserar föremål ${idx + 1} av ${totalGroups}: ${group.label}...`);
        const aiResult = await this._callClaudeForValuation(groupImages, group.label);
        aiResult.groupLabel = group.label;
        aiResult.groupImageIndices = group.imageIndices;

        this._updateStatus(`Söker marknadsdata för ${group.label}...`);
        const enriched = await this._enrichWithMarketData(aiResult);
        enriched.estimatedValue = this._roundValuation(enriched.estimatedValue);
        groupResults.push(enriched);
      }

      const validResults = groupResults.filter(Boolean);
      const totalValue = validResults.reduce((sum, r) => sum + (r.estimatedValue || 0), 0);

      this.multiGroupResults = validResults;
      this.valuationResult = {
        isMultiGroup: true,
        groups: validResults,
        estimatedValue: totalValue,
        numberOfObjects: validResults.length,
        tooLowForAuction: false
      };

      this._renderMultiGroupResults(validResults, images);

    } catch (error) {
      console.error('[ValuationRequest] Multi-group valuation failed:', error);
      this._showError(error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  async _callClaudeForValuation(images, groupLabel = null) {
    const apiKey = this.apiManager.apiKey;
    if (!apiKey) throw new Error('API-nyckel saknas. Ange din Anthropic API-nyckel i tilläggets inställningar.');

    // Use Opus 4.6 for valuation — much better at identifying specific models,
    // brands, and details from images compared to Sonnet
    const model = 'claude-opus-4-6';
    const description = this.pageData.description || '(Ingen beskrivning angiven)';

    const systemPrompt = `Du är expert på värdering av antikviteter, konst, design och samlarprylar för Stadsauktion Sundsvall.

UPPGIFT: Analysera kundens bilder och beskrivning och ge en realistisk värdering.

REGLER:
- Basera värderingen ENBART på den svenska auktionsmarknaden och din expertkunskap
- IGNORERA helt alla prisförslag, önskade reservationspriser eller värderingar som kunden anger — gör din egen oberoende bedömning
- Var konservativ — hellre för lågt än för högt
- Om föremålet har för lågt värde för auktion (under 300 SEK), ange det tydligt
- Beskriv objektet kort och professionellt (1-2 meningar) så kunden ser att vi faktiskt granskat det
- Svara ALLTID i JSON-format

KRITISKT — ANTAL AUKTIONSPOSTER (numberOfLots):
- Räkna hur många SEPARATA AUKTIONSPOSTER det blir — INTE enskilda delar.
- En servis med 56 delar = 1 auktionspost (säljs som ett lot)
- Ett par stolar = 1 auktionspost (säljs som par)
- En bestickuppsättning med 69 delar = 1 auktionspost
- 3 helt OLIKA föremål (t.ex. en tavla + en vas + en stol) = 3 auktionsposter
- estimatedValue ska vara TOTAL värdering för ALLA poster sammanlagt
- Ange pieces (totalt antal enskilda delar) separat, t.ex. 56 för en servis

KRITISKT — VÄRDERING AV SAMLINGAR/SET:
- En servis, bestickuppsättning, par stolar etc. ska värderas som ETT lot — INTE per styck
- Sök marknadsdata på hela setet (t.ex. "Gefle Tibet servis") — inte per tallrik
- estimatedValue = vad hela setet säljs för på auktion som ett enda lot

IDENTIFIERING — HÖGSTA PRIORITET:
- Granska VARJE bild noggrant efter: etiketter, stämplar, signaturer, märkningar, logotyper, serienummer
- För möbler: undersök ben, beslag, konstruktion, klädselns mönster, formspråk — jämför med kända skandinaviska designers (Bruno Mathsson, Hans Wegner, Arne Jacobsen, Alvar Aalto, Carl Malmsten, Josef Frank, etc.)
- För glas/keramik: leta efter bottenstämplar, signaturer i glaset/godset, produktionsnummer
- För konst: leta efter signatur, monogram, tryckteknik, ateljéstämpel
- För klockor/smycken: leta efter urtavletext, baksidegraveringar, stämplar, punsar
- För belysning: leta efter tillverkarstämpel, designernamn, modellnummer
- Om du ser en etikett eller text i bilden — TRANSKRIBERA den exakt
- GISSA INTE märke/modell om du inte ser tydliga bevis — null är bättre än fel
- Om du är osäker men har en stark misstanke, ange det i reasoning-fältet`;

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

    // For multi-group valuations: don't include the full customer description,
    // because it mentions ALL items and Claude picks up brands/terms from unrelated
    // items (e.g. customer writes "Bå Vinge service, kökssoffa, slagbord" and Claude
    // assigns "Bå Vinge" as brand for the kitchen sofa). Use only group label + images.
    const descriptionBlock = groupLabel
      ? `Föremål att värdera: "${groupLabel}"\nOBS: Basera brand/artist/model ENBART på vad du ser i bilderna — inte på text utanför bilderna.`
      : `Kundens beskrivning: "${description}"`;

    content.push({
      type: 'text',
      text: `${descriptionBlock}

Antal bilder: ${images.length}

Analysera bilderna${groupLabel ? '' : ' och beskrivningen'}. Returnera EXAKT detta JSON-format:
{
  "objectType": "kort typ, t.ex. Armbandsur, Oljemålning, Servis, Bestickuppsättning, Fåtölj",
  "brand": "märke/tillverkare om identifierbart, t.ex. Certina, Rörstrand, Georg Jensen, annars null",
  "artist": "konstnär/formgivare om identifierbar, annars null",
  "model": "modellnamn om känt, t.ex. DS Nautic, Tibet, Graal, annars null",
  "material": "huvudmaterial, t.ex. rostfritt stål, keramik, olja på duk, annars null",
  "period": "ungefärlig period, t.ex. 1960-tal, 2000-tal, annars null",
  "numberOfLots": <antal separata AUKTIONSPOSTER, t.ex. 1 för en servis, 2 för två olika föremål>,
  "pieces": <totalt antal enskilda delar, t.ex. 56 för en servis med 56 delar, 1 för en enskild tavla>,
  "isSet": <true om det är en samling/set/par som säljs som ett lot, t.ex. servis, bestickuppsättning, par stolar>,
  "briefDescription": "1-2 professionella meningar som beskriver föremålet/föremålen för kunden, inkl. antal delar om relevant",
  "estimatedValue": <TOTAL värdering i SEK för ALLA lots sammanlagt — för set/samlingar: värdera som ETT lot>,
  "estimatedValuePerLot": <uppskattning per auktionspost om numberOfLots > 1, annars samma som estimatedValue>,
  "tooLowForAuction": <true om estimatedValuePerLot under 300 SEK>,
  "confidence": <0.0-1.0>,
  "reasoning": "intern motivering för värderingen (visas ej för kund)"
}

VIKTIGT — SÖKTERMER AVGÖR VÄRDERINGENS KVALITET:
- brand/artist/model är de VIKTIGASTE fälten — de styr hur vi söker i Auctionets databas med 3,65 miljoner historiska resultat
- Rätt identifiering = rätt marknadspris. Fel eller saknad identifiering = opålitlig värdering
- Identifiera ALLTID märke och modell om det går att se på bilder, etiketter eller i beskrivning
- Skriv brand/artist EXAKT som det stavas (t.ex. "Certina", inte "certina", "DUX" inte "Dux")
- För möbler: ange BÅDE tillverkare (t.ex. "DUX", "Swedese", "Fritz Hansen") OCH designer (t.ex. "Arne Norell", "Bruno Mathsson") om båda är kända
- För modellnamn: var specifik (t.ex. "Kröken", "Lamino", "Egg Chair", "DS Nautic" — inte bara "fåtölj")`
    });

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'anthropic-fetch',
        apiKey,
        body: {
          model,
          max_tokens: 1200,
          temperature: 0.5,
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
          const numberOfLots = parseInt(parsed.numberOfLots) || parseInt(parsed.numberOfObjects) || 1;
          const pieces = parseInt(parsed.pieces) || numberOfLots;
          const isSet = Boolean(parsed.isSet) || pieces > numberOfLots;
          resolve({
            objectType: parsed.objectType || 'Föremål',
            brand: parsed.brand || null,
            artist: parsed.artist || null,
            model: parsed.model || null,
            material: parsed.material || null,
            period: parsed.period || null,
            numberOfLots,
            numberOfObjects: numberOfLots,
            pieces,
            isSet,
            briefDescription: parsed.briefDescription || '',
            estimatedValue: parseInt(parsed.estimatedValue) || 0,
            estimatedValuePerLot: parseInt(parsed.estimatedValuePerLot) || parseInt(parsed.estimatedValuePerItem) || parseInt(parsed.estimatedValue) || 0,
            estimatedValuePerItem: parseInt(parsed.estimatedValuePerLot) || parseInt(parsed.estimatedValuePerItem) || parseInt(parsed.estimatedValue) || 0,
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

      // Build itemData context for AI relevance filtering
      const itemData = {
        title: [result.brand, result.artist, result.objectType, result.model].filter(Boolean).join(' '),
        category: result.objectType || '',
        description: result.reasoning || '',
        artist: result.artist || result.brand || ''
      };

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
            searchResult.totalEntries,
            null,      // currentValuation
            itemData   // enable AI relevance filtering
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
        const marketMedian = (marketAnalysis.statistics && marketAnalysis.statistics.median)
          ? marketAnalysis.statistics.median
          : Math.round((marketLow + marketHigh) / 2);

        // For sets (servis, bestick, etc.), market data already reflects the whole-lot price.
        // Only multiply by numberOfLots for genuinely separate auction lots.
        const numLots = result.numberOfLots || 1;
        const isSet = result.isSet;

        const aiEstimate = result.estimatedValue;

        if (isSet || numLots <= 1) {
          // Set or single item — market median IS the total value
          result.estimatedValuePerLot = this._roundValuation(marketMedian);
          result.estimatedValuePerItem = result.estimatedValuePerLot;
          result.estimatedValue = result.estimatedValuePerLot;
        } else {
          // Multiple separate lots — multiply
          result.estimatedValuePerLot = this._roundValuation(marketMedian);
          result.estimatedValuePerItem = result.estimatedValuePerLot;
          result.estimatedValue = this._roundValuation(marketMedian * numLots);
        }

        result.marketDataUsed = true;
        result.marketSales = salesCount;
        result.marketRange = { low: marketLow, high: marketHigh };
        result.marketQuery = usedQuery;

        if (aiEstimate && Math.abs(aiEstimate - result.estimatedValue) > result.estimatedValue * 0.3) {
          result.reasoning += ` Initial uppskattning: ${aiEstimate} SEK, marknadsdata: ${result.estimatedValue} SEK.`;
        }

        result.reasoning += ` Marknadsanalys (sök: "${usedQuery}"): ${salesCount} jämförbara försäljningar, median ${marketMedian.toLocaleString()} SEK, prisintervall ${marketLow.toLocaleString()}-${marketHigh.toLocaleString()} SEK.`;
        if (numLots > 1 && !isSet) {
          result.reasoning += ` Totalvärde: ${result.estimatedValue.toLocaleString()} SEK (${numLots} poster × ${result.estimatedValuePerLot.toLocaleString()} SEK).`;
        }
        if (isSet && result.pieces > 1) {
          result.reasoning += ` Värderat som ett lot (${result.pieces} delar).`;
        }
        result.confidence = Math.min(0.9, marketAnalysis.confidence || 0.6);
        result.tooLowForAuction = result.estimatedValuePerLot < 300;
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

    // 1. Most specific: brand + model + artist (e.g., "Gustavsberg Fjäril Lisa Larson")
    if (brand && model && artist) {
      queries.push(`${brand} ${model} ${artist}`);
    }

    // 2. Brand/artist + model (e.g., "Certina DS Nautic", "Lisa Larson Fjäril")
    if (brand && model) {
      queries.push(`${brand} ${model}`);
    }
    if (artist && model) {
      queries.push(`${artist} ${model}`);
    }

    // 3. Brand + artist (e.g., "Gustavsberg Lisa Larson")
    if (brand && artist) {
      queries.push(`${brand} ${artist}`);
    }

    // 4. Brand/artist + object type (e.g., "Certina armbandsur", "Harald Wiberg tavla")
    if (brand && objectType) {
      queries.push(`${brand} ${objectType}`);
    }
    if (artist && objectType) {
      queries.push(`${artist} ${objectType}`);
    }

    // 5. Just brand or artist (e.g., "Certina", "Harald Wiberg")
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

  _generateMultiObjectEmail(groupResults) {
    const name = this.pageData.customerName || '';
    const lang = this.pageData.language || 'sv';
    const totalValue = groupResults.reduce((sum, r) => sum + (r.estimatedValue || 0), 0);
    const acceptableItems = groupResults.filter(r => !r.tooLowForAuction);
    const lowItems = groupResults.filter(r => r.tooLowForAuction);

    if (lang === 'sv') {
      return this._generateSwedishMultiEmail(name, groupResults, totalValue, acceptableItems, lowItems);
    }
    return this._generateEnglishMultiEmail(name, groupResults, totalValue, acceptableItems, lowItems);
  }

  _generateSwedishMultiEmail(name, groupResults, totalValue, acceptableItems, lowItems) {
    const sections = groupResults.map((r, i) => {
      const label = r.groupLabel || r.objectType || 'Föremål';
      const value = (r.estimatedValue || 0).toLocaleString();
      const desc = r.briefDescription || '';

      const lowLine = r.tooLowForAuction
        ? 'OBS: Detta föremål har ett för lågt uppskattat värde för auktionsförsäljning.'
        : '';

      const lines = [
        desc,
        `Uppskattat värde: ${value} kr`,
        lowLine
      ].filter(Boolean);

      return `╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
▸ Föremål ${i + 1}: ${label}
${lines.join('\n')}`;
    }).join('\n\n');

    const summaryLine = `════════════════════════════════
Totalt uppskattat värde: ${totalValue.toLocaleString()} kr (${groupResults.length} föremål)
════════════════════════════════`;

    const disclaimer = 'Observera att detta är ungefärliga bedömningar baserade på bilder och beskrivning — den slutgiltiga värderingen görs först när vi har möjlighet att fysiskt granska föremålen.';

    const lowNote = lowItems.length > 0 && acceptableItems.length > 0
      ? `\n${lowItems.length === 1 ? 'Ett föremål har' : `${lowItems.length} föremål har`} för lågt uppskattat värde för auktionsförsäljning (under 300 kr) och kan tyvärr inte tas in till försäljning.`
      : '';

    const actionText = acceptableItems.length > 0
      ? `Vi tar gärna emot ${acceptableItems.length === groupResults.length ? 'alla föremålen' : 'de föremål som uppfyller minimivärdet'} för försäljning via våra onlineauktioner på Auctionet.com — en av Europas ledande marknadsplatser för konst, antikviteter och design med över 900 000 registrerade köpare i 180 länder och 5,5 miljoner besök varje månad.

Om du vill gå vidare är du välkommen att lämna in dina föremål till oss. En av våra experter granskar dem och gör en slutgiltig värdering. Föremålen läggs ut på auktion först efter att du godkänt värderingen och bevakningspriset. Vi tar hand om hela processen: fotografering, katalogisering, auktion, betalning och eventuell transport. Utbetalning sker cirka 25 dagar efter avslutad auktion.`
      : 'Tyvärr bedömer vi att samtliga föremål har för låga uppskattade värden för försäljning via våra onlineauktioner.';

    return `Hej ${name},

Tack för din värderingsförfrågan! Vi har granskat dina ${groupResults.length} föremål och gjort en preliminär bedömning av varje:

${sections}

${summaryLine}

${disclaimer}${lowNote}

${actionText}

Hör gärna av dig om du har frågor!

Med vänliga hälsningar,
Stadsauktion Sundsvall
Verkstadsgatan 4, 853 33 Sundsvall
Telefon: 060 - 17 00 40`;
  }

  _generateEnglishMultiEmail(name, groupResults, totalValue, acceptableItems, lowItems) {
    const sections = groupResults.map((r, i) => {
      const label = r.groupLabel || r.objectType || 'Item';
      const value = (r.estimatedValue || 0).toLocaleString();
      const desc = r.briefDescription || '';

      const lowLine = r.tooLowForAuction
        ? 'Note: This item has too low an estimated value for auction.'
        : '';

      const lines = [
        desc,
        `Estimated value: ${value} SEK`,
        lowLine
      ].filter(Boolean);

      return `╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
▸ Item ${i + 1}: ${label}
${lines.join('\n')}`;
    }).join('\n\n');

    const summaryLine = `════════════════════════════════
Total estimated value: ${totalValue.toLocaleString()} SEK (${groupResults.length} items)
════════════════════════════════`;

    const disclaimer = 'Please note that these are approximate assessments based on photos and description — the final valuation will be made once we have the opportunity to physically examine the items.';

    const lowNote = lowItems.length > 0 && acceptableItems.length > 0
      ? `\n${lowItems.length === 1 ? 'One item has' : `${lowItems.length} items have`} too low an estimated value for auction (below 300 SEK) and cannot be accepted for sale.`
      : '';

    const actionText = acceptableItems.length > 0
      ? `We would be happy to accept ${acceptableItems.length === groupResults.length ? 'all items' : 'the items that meet our minimum value'} for sale through our online auctions on Auctionet.com — one of Europe's leading marketplaces for art, antiques and design, with over 900,000 registered buyers in 180 countries and 5.5 million visits every month.

If you would like to proceed, you are welcome to bring your items to us. One of our experts will examine them and make a final valuation. Items will only be listed for auction after you have approved the valuation and reserve price. We handle the entire process: photography, cataloging, auction, payment and shipping. Payment is made approximately 25 days after the auction closes.`
      : 'Unfortunately, we estimate that all items have too low a value for sale through our online auctions.';

    return `Hi ${name},

Thank you for your valuation request! We have reviewed your ${groupResults.length} items and made a preliminary assessment of each:

${sections}

${summaryLine}

${disclaimer}${lowNote}

${actionText}

Please don't hesitate to contact us if you have questions!

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
        ${this.pageData.imageUrls.length} bild(er)${this.pageData.imageUrls.length > 10 ? ' (max 10 analyseras)' : ''} · ${this.pageData.description ? 'Beskrivning finns' : 'Ingen beskrivning'}
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
      // Preserve container height to prevent layout shift when replacing
      // large content (e.g. clustering UI with image thumbnails) with small loading spinner
      const currentHeight = results.offsetHeight;
      if (currentHeight > 0) {
        results.style.minHeight = currentHeight + 'px';
      }
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

    // Lot/set info hint
    let multiObjectHTML = '';
    if (result.isSet && result.pieces > 1) {
      multiObjectHTML = `<div style="display: flex; align-items: center; gap: 6px; padding: 6px 10px; margin-bottom: 10px; background: #e3f2fd; border-radius: 4px; font-size: 12px; color: #1565c0;">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
           <span><strong>${result.pieces} delar</strong> — värderat som ett lot (säljs samlat)</span>
         </div>`;
    } else if (result.numberOfLots > 1) {
      multiObjectHTML = `<div style="display: flex; align-items: center; gap: 6px; padding: 6px 10px; margin-bottom: 10px; background: #e3f2fd; border-radius: 4px; font-size: 12px; color: #1565c0;">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
           <span><strong>${result.numberOfLots} auktionsposter</strong> — totalt${result.estimatedValuePerLot ? ` (ca ${result.estimatedValuePerLot.toLocaleString()} SEK/post)` : ''}</span>
         </div>`;
    }

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
    results.style.minHeight = '';  // Clear loading height lock
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

    // Scroll results into view so user sees valuation (not stuck on customer images)
    const assistant = document.getElementById('vr-assistant');
    if (assistant) {
      setTimeout(() => assistant.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }

  _renderMultiGroupResults(groupResults, images) {
    const results = document.getElementById('vr-results');
    const btn = document.getElementById('vr-analyze-btn');

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="icon fas fa-magic"></i> Analysera igen';
    }
    if (!results) return;

    const totalValue = groupResults.reduce((sum, r) => sum + (r.estimatedValue || 0), 0);
    const emailText = this._generateMultiObjectEmail(groupResults);

    // Summary card
    const summaryHTML = `
      <div class="vr-multi-summary">
        <div class="vr-multi-summary__count">${groupResults.length} föremål identifierade</div>
        <div class="vr-multi-summary__total">Totalt: ${totalValue.toLocaleString()} SEK</div>
      </div>`;

    // Per-group result cards — compact horizontal layout
    const groupCardsHTML = groupResults.map((r, idx) => {
      const confLabel = r.confidence >= 0.7 ? 'Hög' : r.confidence >= 0.4 ? 'Medel' : 'Låg';
      const confColor = r.confidence >= 0.7 ? '#28a745' : r.confidence >= 0.4 ? '#006ccc' : '#e65100';

      // Show only first image as a small thumb
      const firstImgIdx = (r.groupImageIndices || [])[0];
      const firstImg = firstImgIdx != null ? images[firstImgIdx] : null;
      const thumbHTML = firstImg
        ? `<img class="vr-group-result__thumb" src="data:${firstImg.mediaType};base64,${firstImg.base64}">`
        : '';
      const imgCount = (r.groupImageIndices || []).length;
      const imgCountBadge = imgCount > 1 ? `<span class="vr-group-result__imgcount">${imgCount}</span>` : '';

      const sourceTag = r.marketDataUsed
        ? `<span class="vr-group-result__tag vr-group-result__tag--market">${r.marketSales} sålda</span>`
        : `<span class="vr-group-result__tag vr-group-result__tag--ai">AI</span>`;

      const verifyQuery = r.marketQuery || r.brand || r.artist || r.objectType || '';

      const lowClass = r.tooLowForAuction ? ' vr-group-result__price--low' : '';

      return `
        <div class="vr-group-result" data-group-idx="${idx}">
          <div class="vr-group-result__row">
            <div class="vr-group-result__img-wrap">
              ${thumbHTML}${imgCountBadge}
            </div>
            <div class="vr-group-result__info">
              <div class="vr-group-result__top">
                <span class="vr-group-result__label">${idx + 1}. ${this._escapeHTML(r.groupLabel || r.objectType || 'Föremål')}</span>
                <span class="vr-group-result__price${lowClass}">${(r.estimatedValue || 0).toLocaleString()} kr</span>
              </div>
              <div class="vr-group-result__meta">
                ${sourceTag}
                <span style="color:${confColor}">${confLabel}</span>
                ${r.tooLowForAuction ? '<span class="vr-group-result__low-tag">Under min.</span>' : ''}
                ${verifyQuery ? `<a href="https://auctionet.com/sv/search?is=ended&q=${encodeURIComponent(verifyQuery)}" target="_blank" class="vr-group-result__link">Sålda</a>` : ''}
              </div>
              <div class="vr-group-result__search-row">
                <input type="text" value="${this._escapeHTML(verifyQuery)}"
                       class="vr-group-search-input" data-group-idx="${idx}">
                <button class="vr-group-reanalyze" data-group-idx="${idx}">Sök</button>
              </div>
              <div class="vr-group-search-feedback" data-group-idx="${idx}"></div>
            </div>
          </div>
        </div>`;
    }).join('');

    results.style.display = 'block';
    results.style.minHeight = '';  // Clear loading height lock
    results.innerHTML = `
      ${summaryHTML}
      ${groupCardsHTML}

      <div style="margin-top: 8px;">
        <label style="font-size: 11px; font-weight: 600; color: #888; display: block; margin-bottom: 3px;">E-post:</label>
        <textarea id="vr-email-text" style="width: 100%; min-height: 180px; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; font-size: 12px; font-family: inherit; resize: vertical; line-height: 1.4;">${this._escapeHTML(emailText)}</textarea>
      </div>

      <div style="display: flex; gap: 6px; margin-top: 8px;">
        <button id="vr-copy-btn" class="btn btn-block" style="flex: 1; font-size: 12px;">
          <i class="icon fas fa-copy"></i> Kopiera
        </button>
        <a id="vr-mailto-btn" class="btn btn-block btn-success" style="flex: 1; text-align: center; font-size: 12px;" href="#">
          <i class="icon fas fa-envelope"></i> Skicka
        </a>
      </div>
      <div id="vr-copy-feedback" style="display: none; text-align: center; font-size: 11px; color: #28a745; margin-top: 4px;">
        Kopierat!
      </div>
    `;

    this._attachResultHandlers();
    this._attachGroupSearchHandlers(groupResults, images);

    // Scroll results into view so user sees valuations (not stuck on customer images)
    const assistant = document.getElementById('vr-assistant');
    if (assistant) {
      setTimeout(() => assistant.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }

  _attachGroupSearchHandlers(groupResults, images) {
    document.querySelectorAll('.vr-group-reanalyze').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.groupIdx);
        this._rerunGroupMarketSearch(idx, groupResults, images);
      });
    });

    document.querySelectorAll('.vr-group-search-input').forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const idx = parseInt(input.dataset.groupIdx);
          this._rerunGroupMarketSearch(idx, groupResults, images);
        }
      });
    });
  }

  async _rerunGroupMarketSearch(groupIdx, groupResults, images) {
    const input = document.querySelector(`.vr-group-search-input[data-group-idx="${groupIdx}"]`);
    const btn = document.querySelector(`.vr-group-reanalyze[data-group-idx="${groupIdx}"]`);
    const feedback = document.querySelector(`.vr-group-search-feedback[data-group-idx="${groupIdx}"]`);
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

    if (btn) { btn.disabled = true; btn.textContent = 'Söker...'; }
    if (feedback) {
      feedback.style.display = 'block';
      feedback.style.color = '#006ccc';
      feedback.textContent = `Söker "${query}"...`;
    }

    try {
      const auctionetAPI = this.apiManager.auctionetAPI;
      const searchResult = await auctionetAPI.searchAuctionResults(query, `Group ${groupIdx + 1} search: ${query}`);

      if (searchResult?.soldItems?.length > 0) {
        const analysis = await auctionetAPI.analyzeMarketData(
          searchResult.soldItems, query,
          groupResults[groupIdx].objectType || '',
          searchResult.totalEntries
        );

        if (analysis?.priceRange) {
          const mid = Math.round((analysis.priceRange.low + analysis.priceRange.high) / 2);
          groupResults[groupIdx].estimatedValue = this._roundValuation(mid);
          groupResults[groupIdx].marketDataUsed = true;
          groupResults[groupIdx].marketSales = analysis.aiFilteredCount || searchResult.soldItems.length;
          groupResults[groupIdx].marketRange = analysis.priceRange;
          groupResults[groupIdx].marketQuery = query;
          groupResults[groupIdx].confidence = Math.min(0.9, analysis.confidence || 0.6);
          groupResults[groupIdx].tooLowForAuction = groupResults[groupIdx].estimatedValue < 300;

          // Update total
          const totalValue = groupResults.reduce((sum, r) => sum + (r.estimatedValue || 0), 0);
          this.valuationResult.estimatedValue = totalValue;

          this._renderMultiGroupResults(groupResults, images);
          return;
        }
      }

      if (feedback) {
        feedback.style.display = 'block';
        feedback.style.color = '#e65100';
        feedback.textContent = `Inga resultat för "${query}".`;
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Sök igen'; }
    } catch (error) {
      console.error('[ValuationRequest] Group re-search failed:', error);
      if (feedback) {
        feedback.style.display = 'block';
        feedback.style.color = '#e65100';
        feedback.textContent = 'Sökning misslyckades.';
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Sök igen'; }
    }
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
          const numLots = this.valuationResult.numberOfLots || 1;
          const isSet = this.valuationResult.isSet;

          this.valuationResult.estimatedValuePerLot = this._roundValuation(marketMid);
          this.valuationResult.estimatedValuePerItem = this.valuationResult.estimatedValuePerLot;
          if (isSet || numLots <= 1) {
            this.valuationResult.estimatedValue = this.valuationResult.estimatedValuePerLot;
          } else {
            this.valuationResult.estimatedValue = this._roundValuation(marketMid * numLots);
          }
          this.valuationResult.marketDataUsed = true;
          this.valuationResult.marketSales = marketAnalysis.aiFilteredCount || searchResult.soldItems.length;
          this.valuationResult.marketRange = { low: marketLow, high: marketHigh };
          this.valuationResult.marketQuery = query;
          this.valuationResult.confidence = Math.min(0.9, marketAnalysis.confidence || 0.6);
          this.valuationResult.tooLowForAuction = this.valuationResult.estimatedValuePerLot < 300;

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
