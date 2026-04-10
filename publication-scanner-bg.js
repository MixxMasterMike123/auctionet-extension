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
const PUB_SCAN_SPELL_CACHE_KEY = 'pubScanSpellCache_v2';
const PUB_SCAN_SPELL_VERSION_KEY = 'pubScanSpellVersion';
const PUB_SCAN_SPELL_VERSION = 3; // Bumped: switched from Haiku AI to LanguageTool API
const PUB_SCAN_STICKY_KEY = 'publicationScanStickyErrors';
const STICKY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
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
let safeWordsSet = null;

async function loadMisspellingsMap() {
  if (misspellingsMap) return misspellingsMap;
  try {
    const spellUrl = chrome.runtime.getURL('modules/swedish-spellchecker.js');
    const { SwedishSpellChecker } = await import(spellUrl);
    misspellingsMap = SwedishSpellChecker.getMisspellingsMap();
    safeWordsSet = SwedishSpellChecker.getSafeWordsSet();
  } catch (e) {
    console.warn('[PubScanBG] Failed to load SwedishSpellChecker:', e.message);
    misspellingsMap = {};
    safeWordsSet = new Set();
  }
  // One-time migration: clear all spell caches when spell version changes
  try {
    const stored = await chrome.storage.local.get([PUB_SCAN_SPELL_VERSION_KEY]);
    if ((stored[PUB_SCAN_SPELL_VERSION_KEY] || 0) < PUB_SCAN_SPELL_VERSION) {
      console.log('[PubScanBG] Spell version upgraded — clearing old spell caches');
      await chrome.storage.local.remove([PUB_SCAN_CACHE_KEY, PUB_SCAN_STICKY_KEY, 'pubScanSpellCache']);
      spellCache = null;
      await chrome.storage.local.set({ [PUB_SCAN_SPELL_VERSION_KEY]: PUB_SCAN_SPELL_VERSION });
    }
  } catch (e) {
    console.warn('[PubScanBG] Spell cache migration failed:', e.message);
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

async function runPhase2Checks(editData, dictMap, itemId) {
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

  // Spellcheck (LanguageTool API + dictionary fallback, with caching)
  const combinedText = [editData.editTitle || editData.title, editData.description, editData.condition].filter(Boolean).join(' ');
  let spellingErrors;
  if (itemId) {
    const cached = await getCachedSpellcheck(itemId, combinedText);
    if (cached) {
      spellingErrors = cached;
    } else {
      spellingErrors = validateSpellingResults(await checkSpellingLanguageTool(combinedText));
      // Merge with dictionary results for auction-specific terms LanguageTool might miss
      const dictErrors = checkSpellingDict(combinedText, dictMap);
      const ltWords = new Set(spellingErrors.map(e => e.word.toLowerCase()));
      for (const de of dictErrors) {
        if (!ltWords.has(de.word.toLowerCase())) spellingErrors.push(de);
      }
      await setCachedSpellcheck(itemId, combinedText, spellingErrors);
    }
  } else {
    spellingErrors = validateSpellingResults(await checkSpellingLanguageTool(combinedText));
    const dictErrors = checkSpellingDict(combinedText, dictMap);
    const ltWords = new Set(spellingErrors.map(e => e.word.toLowerCase()));
    for (const de of dictErrors) {
      if (!ltWords.has(de.word.toLowerCase())) spellingErrors.push(de);
    }
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
  const hash = simpleHash(text);

  // L1: Local chrome.storage cache (instant, per-browser)
  const cache = await loadSpellCache();
  const entry = cache[itemId];
  if (entry && entry.hash === hash) return entry.results;

  // L2: Supabase shared cache (shared across all users)
  const supabaseResults = await getSupabaseCachedSpellcheck(itemId, hash);
  if (supabaseResults !== null) {
    // Populate L1 with the Supabase result for next time
    cache[itemId] = { hash, results: supabaseResults };
    return supabaseResults;
  }

  return null; // True cache miss — need to check via LanguageTool
}

async function setCachedSpellcheck(itemId, text, results) {
  const hash = simpleHash(text);

  // L1: Local cache
  const cache = await loadSpellCache();
  cache[itemId] = { hash, results };

  // L2: Supabase shared cache (fire-and-forget)
  setSupabaseCachedSpellcheck(itemId, hash, results);
}

// ─── Supabase shared spellcheck cache (L2) ──────────────────────────

async function getSupabaseCachedSpellcheck(itemId, textHash) {
  const sbFetch = globalThis.__supabaseFetch;
  if (!sbFetch) return null;

  try {
    const data = await sbFetch(
      'GET',
      `/rest/v1/spellcheck_cache?item_id=eq.${itemId}&select=text_hash,results`,
      null,
      { 'Accept': 'application/json' }
    );
    if (Array.isArray(data) && data.length > 0) {
      const entry = data[0];
      if (entry.text_hash === textHash) {
        return entry.results;
      }
    }
  } catch (e) {
    console.warn('[PubScanBG] Supabase spellcheck cache read failed:', e.message);
  }
  return null;
}

async function setSupabaseCachedSpellcheck(itemId, textHash, results) {
  const sbFetch = globalThis.__supabaseFetch;
  if (!sbFetch) return;

  try {
    await sbFetch(
      'POST',
      '/rest/v1/spellcheck_cache',
      {
        item_id: itemId,
        text_hash: textHash,
        results: results,
        checked_at: new Date().toISOString()
      },
      { 'Prefer': 'resolution=merge-duplicates' }
    );
  } catch (e) {
    console.warn('[PubScanBG] Supabase spellcheck cache write failed:', e.message);
  }
}

// ─── Spellcheck (LanguageTool API — free, dictionary-based, no hallucinations) ──

async function checkSpellingLanguageTool(text) {
  if (!text || text.length < 5) return [];

  // Strip HTML tags and collapse whitespace
  const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleanText.length < 5) return [];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch('https://api.languagetool.org/v2/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        text: cleanText,
        language: 'sv',
        // Only spelling errors — skip grammar, style, typography
        enabledCategories: 'TYPOS,SPELLING',
        disabledCategories: 'GRAMMAR,STYLE,TYPOGRAPHY,PUNCTUATION,CASING'
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[PubScanBG] LanguageTool HTTP ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (!data.matches || !Array.isArray(data.matches)) return [];

    return data.matches
      .filter(m => m.replacements && m.replacements.length > 0)
      .map(m => ({
        word: cleanText.substring(m.offset, m.offset + m.length),
        correction: m.replacements[0].value
      }))
      // Skip single-character words and very short matches
      .filter(e => e.word.length >= 3 && e.word.toLowerCase() !== e.correction.toLowerCase());
  } catch (e) {
    if (e.name === 'AbortError') {
      console.warn('[PubScanBG] LanguageTool request timed out');
    }
    // Silently fail — no spellcheck for this item
  }
  return [];
}

function validateSpellingResults(results) {
  const safe = safeWordsSet || new Set();
  return results.filter(result => {
    const original = result.word.toLowerCase();
    const correction = result.correction.toLowerCase();
    // Reject if the original word is a known safe word
    if (safe.has(original)) return false;
    // Reject corrections with triple consecutive identical letters (e.g., "glassservis")
    if (/(.)\1\1/.test(correction)) return false;
    // Reject if original looks like a proper noun / brand (starts uppercase, not ALL CAPS)
    if (/^[A-ZÅÄÖÜ][a-zåäöü]/.test(result.word) && !/^[A-ZÅÄÖÜ]+$/.test(result.word)) return false;
    return true;
  });
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
          item.phase2Issues = await runPhase2Checks(editData, dictMap, item.itemId);
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
    await promoteStickyErrors(result);
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

// ─── Sticky errors: persist spelling errors beyond publishable queue ─────

async function loadStickyErrors() {
  try {
    const stored = await chrome.storage.local.get([PUB_SCAN_STICKY_KEY]);
    return stored[PUB_SCAN_STICKY_KEY] || {};
  } catch (e) {
    return {};
  }
}

async function saveStickyErrors(sticky) {
  await chrome.storage.local.set({ [PUB_SCAN_STICKY_KEY]: sticky });
}

/**
 * After a normal scan completes, save spelling errors as sticky entries.
 * Called from runBackgroundPublicationScan with the scan results.
 */
async function promoteStickyErrors(scanResult) {
  if (!scanResult) return;
  const sticky = await loadStickyErrors();
  const now = Date.now();

  // Track which items are currently in the publishable queue
  const publishableIds = new Set();
  [...(scanResult.critical || []), ...(scanResult.warnings || [])].forEach(item => {
    publishableIds.add(item.itemId);
  });
  // Also include passed items
  (scanResult._passedIds || []).forEach(id => publishableIds.add(id));

  // Add new spelling errors from this scan
  const allItems = [...(scanResult.critical || []), ...(scanResult.warnings || [])];
  for (const item of allItems) {
    const spellingIssues = item.issues.filter(i => {
      const text = typeof i === 'string' ? i : i.text;
      return text.startsWith('Stavfel:');
    });
    if (spellingIssues.length > 0) {
      sticky[item.itemId] = {
        itemId: item.itemId,
        title: item.title,
        editUrl: item.editUrl,
        showUrl: item.showUrl || (item.editUrl ? item.editUrl.replace(/\/edit$/, '') : null),
        issues: spellingIssues.map(i => typeof i === 'string' ? { text: i, severity: 'critical' } : { text: i.text, severity: i.severity }),
        estimate: item.estimate || 0,
        firstDetectedAt: sticky[item.itemId]?.firstDetectedAt || now,
        lastCheckedAt: now,
        isPublished: false,
      };
    }
  }

  // Mark items that have left the publishable queue as published
  for (const [id, entry] of Object.entries(sticky)) {
    if (!publishableIds.has(parseInt(id)) && !publishableIds.has(id)) {
      entry.isPublished = true;
      if (!entry.publishedAt) entry.publishedAt = now;
    }
  }

  // Remove expired entries (older than 7 days)
  for (const [id, entry] of Object.entries(sticky)) {
    if (now - entry.firstDetectedAt > STICKY_MAX_AGE_MS) {
      delete sticky[id];
    }
  }

  // Remove entries where the item is still in publishable queue and has no spelling errors
  // (i.e., the error was fixed while still in the queue)
  for (const [id, entry] of Object.entries(sticky)) {
    if (!entry.isPublished) {
      const stillHasError = allItems.some(item =>
        item.itemId == id && item.issues.some(i => {
          const text = typeof i === 'string' ? i : i.text;
          return text.startsWith('Stavfel:');
        })
      );
      if (!stillHasError) delete sticky[id];
    }
  }

  await saveStickyErrors(sticky);
}

/**
 * Re-check published items with sticky errors to see if they've been fixed.
 * Fetches the edit page of each published sticky item and re-runs spellcheck.
 */
let stickyRecheckRunning = false;

export async function recheckStickyErrors() {
  if (stickyRecheckRunning) return null;
  stickyRecheckRunning = true;

  try {
    const sticky = await loadStickyErrors();
    const publishedEntries = Object.values(sticky).filter(e => e.isPublished);

    if (publishedEntries.length === 0) {
      stickyRecheckRunning = false;
      return sticky;
    }

    const dictMap = await loadMisspellingsMap();
    await ensureOffscreen();

    const now = Date.now();

    // Re-check in batches
    for (let i = 0; i < publishedEntries.length; i += PUB_SCAN_BATCH_SIZE) {
      const batch = publishedEntries.slice(i, i + PUB_SCAN_BATCH_SIZE);
      await Promise.all(batch.map(async (entry) => {
        try {
          const editHtml = await fetchPageHtml(entry.editUrl);
          const editFields = await parseEditPageFields(editHtml);

          // Also fetch show page for description/condition
          const showUrl = entry.showUrl || entry.editUrl.replace(/\/edit$/, '');
          const showHtml = await fetchPageHtml(showUrl);
          const showData = await parseShowPageForScan(showHtml);

          const combinedText = [editFields.editTitle, showData.description, showData.condition].filter(Boolean).join(' ');

          let spellingErrors = validateSpellingResults(await checkSpellingLanguageTool(combinedText));
          // Merge dictionary results
          const dictErrors = checkSpellingDict(combinedText, dictMap);
          const ltWords = new Set(spellingErrors.map(e => e.word.toLowerCase()));
          for (const de of dictErrors) {
            if (!ltWords.has(de.word.toLowerCase())) spellingErrors.push(de);
          }

          entry.lastCheckedAt = now;
          // Update title in case it was changed
          if (editFields.editTitle) entry.title = editFields.editTitle;

          if (spellingErrors.length === 0) {
            // Error is fixed — remove from sticky
            delete sticky[entry.itemId];
          } else {
            // Update the issues with current errors
            const corrections = spellingErrors.map(e => `"${e.word}" \u2192 "${e.correction}"`).join(', ');
            entry.issues = [{ text: `Stavfel: ${corrections}`, severity: 'critical' }];
          }
        } catch (e) {
          // Could not re-check — keep in sticky but don't remove
          console.warn(`[PubScanBG] Could not re-check sticky item ${entry.itemId}:`, e.message);
        }
      }));
    }

    await saveStickyErrors(sticky);
    await closeOffscreen();
    stickyRecheckRunning = false;
    return sticky;
  } catch (error) {
    console.error('[PubScanBG] Sticky recheck failed:', error);
    stickyRecheckRunning = false;
    await closeOffscreen();
    return null;
  }
}

export { PUB_SCAN_CACHE_KEY, PUB_SCAN_PROGRESS_KEY, PUB_SCAN_STICKY_KEY };
