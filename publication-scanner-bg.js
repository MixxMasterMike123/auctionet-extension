/**
 * Publication Scanner — Background Service Worker Module
 * Runs publication queue quality scans independently of any open tab.
 * Results are cached in chrome.storage.local for the dashboard to render.
 *
 * DOMParser is not available in service workers, so HTML parsing is
 * delegated to an offscreen document (offscreen.html / offscreen.js).
 */

// ─── Constants ──────────────────────────────────────────────────────
const PUB_SCAN_CACHE_KEY = 'publicationScanResults';
const PUB_SCAN_PROGRESS_KEY = 'publicationScanProgress';
const PUB_SCAN_SPELL_CACHE_KEY = 'pubScanSpellCache';
const PUB_SCAN_MIN_DESC_LENGTH = 40;
const PUB_SCAN_MIN_TITLE_LENGTH = 15;
const PUB_SCAN_MIN_CONDITION_LENGTH = 15;
const PUB_SCAN_BATCH_SIZE = 5;
const PUB_SCAN_HIGH_VALUE_THRESHOLD = 3000;
const AUCTIONET_BASE = 'https://auctionet.com';

const PUB_SCAN_VAGUE_CONDITION_TERMS = [
  'bruksskick', 'bruksslitage',
  'normalt slitage', 'vanligt slitage', 'åldersslitage', 'slitage förekommer'
];

// ─── Dictionary spellcheck (loaded lazily) ──────────────────────────
let misspellingsMap = null;

async function loadMisspellingsMap() {
  if (misspellingsMap) return misspellingsMap;
  try {
    const spellUrl = chrome.runtime.getURL('modules/swedish-spellchecker.js');
    const { SwedishSpellChecker } = await import(spellUrl);
    misspellingsMap = SwedishSpellChecker.getMisspellingsMap();
  } catch (e) {
    console.warn('[PubScanBG] Failed to load SwedishSpellChecker:', e.message);
    misspellingsMap = {};
  }
  return misspellingsMap;
}

// ─── Offscreen document management ──────────────────────────────────
// Only one offscreen document can exist at a time per extension.

let offscreenReady = false;

async function ensureOffscreen() {
  if (offscreenReady) return;
  // Check if already exists (e.g. from a previous scan)
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL('offscreen.html')]
  });
  if (existingContexts.length > 0) {
    offscreenReady = true;
    return;
  }
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['DOM_PARSER'],
    justification: 'Parse Auctionet HTML pages using DOMParser for publication scan'
  });
  offscreenReady = true;
}

async function closeOffscreen() {
  try {
    await chrome.offscreen.closeDocument();
  } catch (e) { /* already closed or never opened */ }
  offscreenReady = false;
}

// Send a parse request to the offscreen document and return the result
function sendParseRequest(type, html) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ target: 'offscreen', type, html }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// ─── HTML fetching ──────────────────────────────────────────────────

async function fetchPageHtml(path) {
  const url = path.startsWith('http') ? path : AUCTIONET_BASE + path;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      credentials: 'include',
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── HTML parsing (delegated to offscreen document) ──────────────────

async function parsePublishablesPage(html) {
  return sendParseRequest('parse-publishables', html);
}

async function detectPublishablePages(html) {
  return sendParseRequest('detect-pages', html);
}

async function parseShowPageForScan(html) {
  return sendParseRequest('parse-show-page', html);
}

async function parseEditPageFields(html) {
  return sendParseRequest('parse-edit-page', html);
}

// ─── Quality checks ─────────────────────────────────────────────────

function runPhase1Checks(item) {
  const issues = [];
  if (!item.hasImage) {
    issues.push({ text: '0 bilder (saknar primärbild)', severity: 'critical' });
  }
  if (!item.title || !item.title.trim()) {
    issues.push({ text: 'Saknar titel', severity: 'warning' });
  } else if (item.title.replace(/^\d+\.\s*/, '').length < PUB_SCAN_MIN_TITLE_LENGTH) {
    issues.push({ text: 'Kort titel (< 15 tecken)', severity: 'warning' });
  }
  return issues;
}

async function runPhase2Checks(editData, apiKey, dictMap, itemId) {
  const issues = [];

  // Image checks
  if (editData.imageCount === 0) {
    issues.push({ text: '0 bilder', severity: 'critical' });
  } else if (editData.imageCount === 1) {
    issues.push({ text: '1 bild', severity: 'critical' });
  } else if (editData.imageCount === 2) {
    issues.push({ text: '2 bilder', severity: 'critical' });
  }

  // Artist name in title
  if (editData.editTitle) {
    const capsMatch = editData.editTitle.match(/^([A-ZÅÄÖÜ][A-ZÅÄÖÜ\s,-]+?)\.\s+/);
    if (capsMatch) {
      const capsName = capsMatch[1].trim();
      const nameWords = capsName.split(/[\s,]+/).filter(w => w.length >= 2);
      if (nameWords.length >= 2 && nameWords.every(w => /^[A-ZÅÄÖÜ-]+$/.test(w))) {
        issues.push({ text: `Konstnärsnamn i titel ("${capsName}") — flytta till konstnärsfält`, severity: 'critical' });
      }
    }
  }

  // Description checks
  if (!editData.description) {
    issues.push({ text: 'Saknar beskrivning', severity: 'warning' });
  } else if (editData.description.length < PUB_SCAN_MIN_DESC_LENGTH) {
    issues.push({ text: 'Kort beskrivning (< 40 tecken)', severity: 'warning' });
  }

  // Condition checks
  if (!editData.condition) {
    issues.push({ text: 'Saknar kondition', severity: 'warning' });
  } else {
    const condLower = editData.condition.toLowerCase();
    if (/^bruksslitage\.?\s*$/i.test(editData.condition.trim())) {
      issues.push({ text: 'Endast "bruksslitage" — specificera typ av slitage', severity: 'warning' });
    } else if (PUB_SCAN_VAGUE_CONDITION_TERMS.some(term => condLower.includes(term))) {
      const matched = PUB_SCAN_VAGUE_CONDITION_TERMS.find(term => condLower.includes(term));
      if (editData.condition.length < 40) {
        issues.push({ text: `Vag kondition ("${matched}")`, severity: 'warning' });
      } else {
        issues.push({ text: `"${matched}" i kondition — överväg att specificera`, severity: 'warning' });
      }
    } else if (editData.condition.length < PUB_SCAN_MIN_CONDITION_LENGTH) {
      issues.push({ text: 'Kort kondition (< 15 tecken)', severity: 'warning' });
    }
  }

  // Spellcheck (with caching to avoid redundant AI calls)
  const combinedText = [editData.editTitle || editData.title, editData.description, editData.condition].filter(Boolean).join(' ');
  let spellingErrors;
  if (apiKey && itemId) {
    const cached = await getCachedSpellcheck(itemId, combinedText);
    if (cached) {
      spellingErrors = cached;
    } else {
      spellingErrors = await checkSpellingAI(combinedText, apiKey);
      await setCachedSpellcheck(itemId, combinedText, spellingErrors);
    }
  } else if (apiKey) {
    spellingErrors = await checkSpellingAI(combinedText, apiKey);
  } else {
    spellingErrors = checkSpellingDict(combinedText, dictMap);
  }
  if (spellingErrors.length > 0) {
    const corrections = spellingErrors.map(e => `"${e.word}" → "${e.correction}"`).join(', ');
    issues.push({ text: `Stavfel: ${corrections}`, severity: 'critical' });
  }

  // Repeated measurement units
  const descText = editData.description || '';
  const descLines = descText.replace(/<[^>]*>/g, '').split(/\n/);
  for (const line of descLines) {
    const unitMatches = line.match(/\d+([.,]\d+)?\s*(cm|mm)\b/gi);
    if (unitMatches && unitMatches.length >= 3) {
      const units = unitMatches.map(m => m.match(/(cm|mm)/i)?.[1]?.toLowerCase());
      if (units.every(u => u === units[0])) {
        issues.push({ text: `Måttenhet upprepas — skriv "${units[0]}" bara efter sista måttet`, severity: 'warning' });
        break;
      }
    }
  }

  return issues;
}

// ─── Spellcheck cache ───────────────────────────────────────────────

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

let spellCache = null;

async function loadSpellCache() {
  if (spellCache) return spellCache;
  try {
    const stored = await chrome.storage.local.get([PUB_SCAN_SPELL_CACHE_KEY]);
    spellCache = stored[PUB_SCAN_SPELL_CACHE_KEY] || {};
  } catch (e) {
    spellCache = {};
  }
  return spellCache;
}

async function saveSpellCache() {
  if (!spellCache) return;
  await chrome.storage.local.set({ [PUB_SCAN_SPELL_CACHE_KEY]: spellCache });
}

async function getCachedSpellcheck(itemId, text) {
  const cache = await loadSpellCache();
  const entry = cache[itemId];
  if (!entry) return null;
  const hash = simpleHash(text);
  if (entry.hash === hash) return entry.results;
  return null;
}

async function setCachedSpellcheck(itemId, text, results) {
  const cache = await loadSpellCache();
  cache[itemId] = { hash: simpleHash(text), results };
}

// ─── Spellcheck (direct API call from service worker) ───────────────

async function checkSpellingAI(text, apiKey) {
  if (!apiKey || !text || text.length < 5) return [];

  const prompt = `Kontrollera stavningen i denna auktionstext på svenska:
"${text}"

Hitta enskilda ord som är felstavade. Exempel:
- "Colier" → "Collier"
- "silverr" → "silver"
- "olija" → "olja"
- "brutovikt" → "bruttovikt"
- "Jardinjär" → "Jardinär"
- "kandelabrer" → "kandelaber"

Kontrollera ALLA ord noggrant — även objekttyper, materialnamn och svenska substantiv.

RAPPORTERA INTE:
- Grammatik, interpunktion, kommatering
- Förkortningar (ink, bl.a, osv, resp, ca)
- Personnamn, ortnamn, varumärken
- Versaler/gemener-fel
- Korrekta böjningsformer (hängd, längd, höjd, märkt)
- Auktionsfacktermer: plymå, karott, karaff, tablå, terrin, skänk, chiffonjé,
  röllakan, tenn, emalj, porfyr, intarsia, gouache, applique, pendyl, boett,
  collier, rivière, cabochon, pavé, solitär, entourage

Svara BARA med JSON:
{"issues":[{"original":"felstavat","corrected":"korrekt","confidence":0.95}]}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5', // Haiku is sufficient for spellcheck and ~10x cheaper than Sonnet
        max_tokens: 300,
        temperature: 0,
        system: 'Du är en expert på svensk stavning och auktionsterminologi. Hitta felstavade ord — inklusive objekttyper, material och substantiv. Rapportera INTE grammatik, interpunktion, förkortningar eller korrekta facktermer. Svara BARA med valid JSON.',
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) return [];

    const data = await response.json();
    const responseText = data?.content?.[0]?.text?.trim();
    if (!responseText) return [];

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      if (result.issues && Array.isArray(result.issues)) {
        return result.issues
          .filter(i => i.original && i.corrected &&
                  i.original.toLowerCase() !== i.corrected.toLowerCase() &&
                  (i.confidence || 0.9) >= 0.8)
          .map(i => ({ word: i.original, correction: i.corrected }));
      }
    }
  } catch (e) {
    // Silently fail — no spellcheck for this item
  }
  return [];
}

function checkSpellingDict(text, dictMap) {
  if (!text || !dictMap) return [];
  const words = text.match(/\b[a-zåäöüA-ZÅÄÖÜ]{4,}\b/g) || [];
  const found = [];
  const seen = new Set();
  for (const word of words) {
    const lower = word.toLowerCase();
    const correction = dictMap[lower];
    if (correction && !seen.has(lower)) {
      seen.add(lower);
      found.push({ word: lower, correction });
    }
  }
  return found;
}

// ─── Progress reporting ─────────────────────────────────────────────

function reportProgress(msg) {
  chrome.storage.local.set({ [PUB_SCAN_PROGRESS_KEY]: msg });
}

function clearProgress() {
  chrome.storage.local.remove(PUB_SCAN_PROGRESS_KEY);
}

// ─── Main scan orchestrator ─────────────────────────────────────────

let scanRunning = false;

export async function runBackgroundPublicationScan() {
  if (scanRunning) return null;
  scanRunning = true;

  try {
    // Create offscreen document for HTML parsing
    await ensureOffscreen();

    // Reset spell cache to load fresh from storage
    spellCache = null;

    // Load API key
    let apiKey = null;
    try {
      const stored = await chrome.storage.local.get(['anthropicApiKey']);
      apiKey = stored.anthropicApiKey || null;
    } catch (e) { /* no API key */ }

    // Load dictionary
    const dictMap = await loadMisspellingsMap();

    reportProgress('Hämtar publiceringslista...');

    // Fetch publishables list
    const baseUrl = '/admin/sas/publishables';
    let firstPageHtml;
    try {
      firstPageHtml = await fetchPageHtml(baseUrl);
    } catch (e) {
      console.warn('[PubScanBG] Could not fetch publishables (user may not be logged in):', e.message);
      clearProgress();
      return null;
    }

    // Check if we got a login redirect instead of actual content
    if (firstPageHtml.includes('/admin/login') && !firstPageHtml.includes('Publicerbara')) {
      console.log('[PubScanBG] User not logged in, skipping scan');
      clearProgress();
      return null;
    }

    const totalPages = await detectPublishablePages(firstPageHtml);
    let allItems = await parsePublishablesPage(firstPageHtml);

    if (totalPages > 1) {
      for (let p = 2; p <= totalPages; p++) {
        reportProgress(`Hämtar sida ${p}/${totalPages}...`);
        const html = await fetchPageHtml(`${baseUrl}?page=${p}`);
        const pageItems = await parsePublishablesPage(html);
        allItems.push(...pageItems);
      }
    }

    const totalItems = allItems.length;
    if (totalItems === 0) {
      const result = { _version: 4, scannedAt: new Date().toISOString(), totalItems: 0, critical: [], warnings: [], passed: 0 };
      await chrome.storage.local.set({ [PUB_SCAN_CACHE_KEY]: result });
      clearProgress();
      return result;
    }

    // Phase 1: surface checks
    allItems.forEach(item => { item.phase1Issues = runPhase1Checks(item); });

    // Phase 2: deep scan (show + edit page + spellcheck)
    let scanned = 0;
    for (let i = 0; i < allItems.length; i += PUB_SCAN_BATCH_SIZE) {
      const batch = allItems.slice(i, i + PUB_SCAN_BATCH_SIZE);
      await Promise.all(batch.map(async (item) => {
        if (!item.editUrl) {
          item.phase2Issues = [{ text: 'Saknar redigera-länk', severity: 'warning' }];
          return;
        }
        try {
          const showUrl = item.editUrl.replace(/\/edit$/, '');
          const [showHtml, editHtml] = await Promise.all([
            fetchPageHtml(showUrl),
            fetchPageHtml(item.editUrl)
          ]);
          const showData = await parseShowPageForScan(showHtml);
          const editFields = await parseEditPageFields(editHtml);
          const editData = {
            title: item.title, editTitle: editFields.editTitle, artist: editFields.artist,
            imageCount: showData.imageCount, description: showData.description,
            condition: showData.condition, keywords: editFields.keywords,
            estimate: editFields.estimate
          };
          item.showUrl = showUrl;
          item.editData = editData;
          item.phase2Issues = await runPhase2Checks(editData, apiKey, dictMap, item.itemId);
        } catch (e) {
          console.error(`[PubScanBG] Failed to scan item ${item.itemId}:`, e);
          item.phase2Issues = [{ text: 'Kunde inte skannas', severity: 'warning' }];
        }
      }));
      scanned += batch.length;
      reportProgress(`Skannar ${Math.min(scanned, totalItems)}/${totalItems}...`);
    }

    // Build final results
    const critical = [];
    const warnings = [];
    let passed = 0;
    let missingKeywords = 0;
    let highValueWithIssues = 0;
    const passedIds = [];
    const keywordMap = {};
    const estimateMap = {};

    allItems.forEach(item => {
      let hasKeywords = null;
      if (item.editData && item.editData.keywords !== undefined) {
        hasKeywords = item.editData.keywords !== '';
      }
      if (hasKeywords === false) missingKeywords++;
      if (hasKeywords !== null) keywordMap[item.itemId] = hasKeywords;

      let estimate = 0;
      if (item.editData && item.editData.estimate !== undefined) {
        estimate = item.editData.estimate || 0;
      }
      if (estimate > 0) estimateMap[item.itemId] = estimate;

      const allIssues = [...item.phase1Issues];
      if (item.phase2Issues) {
        item.phase2Issues.forEach(p2 => {
          const p2Text = typeof p2 === 'string' ? p2 : p2.text;
          const isDupImage = p2Text.match(/^\d+ bild/) && allIssues.some(p1 => (typeof p1 === 'string' ? p1 : p1.text).includes('bilder'));
          if (!isDupImage) allIssues.push(p2);
        });
      }
      if (allIssues.length === 0) { passed++; passedIds.push(item.itemId); return; }

      if (estimate >= PUB_SCAN_HIGH_VALUE_THRESHOLD) highValueWithIssues++;

      const hasCritical = allIssues.some(i => (typeof i === 'string' ? 'warning' : i.severity) === 'critical');
      const showUrl = item.showUrl || (item.editUrl ? item.editUrl.replace(/\/edit$/, '') : null);
      const entry = {
        itemId: item.itemId,
        title: item.title,
        editUrl: item.editUrl,
        showUrl: showUrl,
        issues: allIssues.map(i => typeof i === 'string' ? { text: i, severity: 'warning' } : { text: i.text, severity: i.severity }),
        severity: hasCritical ? 'critical' : 'warning',
        imageCount: item.editData ? item.editData.imageCount : (item.hasImage ? null : 0),
        hasKeywords: hasKeywords,
        estimate: estimate
      };
      if (hasCritical) critical.push(entry); else warnings.push(entry);
    });

    const result = {
      _version: 4,
      scannedAt: new Date().toISOString(),
      totalItems,
      critical,
      warnings,
      passed,
      missingKeywords,
      highValueWithIssues,
      _passedIds: passedIds,
      _keywordMap: keywordMap,
      _estimateMap: estimateMap
    };

    await chrome.storage.local.set({ [PUB_SCAN_CACHE_KEY]: result });
    await saveSpellCache();
    clearProgress();
    return result;

  } catch (error) {
    console.error('[PubScanBG] Scan failed:', error);
    clearProgress();
    return null;
  } finally {
    scanRunning = false;
    // Close offscreen document to free resources
    closeOffscreen();
  }
}

export { PUB_SCAN_CACHE_KEY, PUB_SCAN_PROGRESS_KEY };
