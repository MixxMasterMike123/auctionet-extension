import { SwedishSpellChecker } from './modules/swedish-spellchecker.js';
import { BrandValidationManager } from './modules/brand-validation-manager.js';
import { getSharedWhitelist } from './modules/spellcheck-whitelist.js';

// ── Forbidden words (from ai-rules-config.json) ──
const FORBIDDEN_WORDS = [
  'fantastisk','vacker','utsökt','nyskick','magnifik','underbar','exceptionell',
  'perfekt','ovanlig','sällsynt','extraordinär','unik','spektakulär','enastående',
  'otrolig','elegant','karakteristisk','typisk','klassisk','traditionell','autentisk',
  'genomtänkt','sofistikerad','raffinerad','tidlös','stilren','harmonisk','balanserad',
  'välproportionerad','genomarbetad','påkostad','exklusiv','förnäm','gedigen',
  'kvalitativ','högkvalitativ','förstklassig','exemplarisk','representativ',
  'karaktäristiskt','typiskt','fin','värdefull'
];

// ── Common misspellings (from inline-brand-validator.js) ──
const COMMON_MISSPELLINGS = {
  'colier': 'collier', 'collie': 'collier', 'kolier': 'collier',
  'briliant': 'briljant', 'brilljant': 'briljant',
  'brutovikt': 'bruttovikt', 'brutovigt': 'bruttovikt',
  'nettovigt': 'nettovikt',
  'halstband': 'halsband', 'halband': 'halsband',
  'armand': 'armband',
  'örhange': 'örhänge', 'orhänge': 'örhänge',
};

// ── Compound words that should be separated ──
const COMPOUND_ERRORS = {
  'majolikavas': 'majolika, vas', 'keramiktomte': 'keramik, tomte',
  'kristallvas': 'kristall, vas', 'porslinsvas': 'porslin, vas',
  'guldring': 'guld, ring', 'silverkedja': 'silver, kedja',
  'mässingsljusstake': 'mässing, ljusstake', 'tennmugg': 'tenn, mugg',
  'glasvas': 'glas, vas', 'keramikskål': 'keramik, skål',
  'silverring': 'silver, ring', 'guldarmband': 'guld, armband',
  'porslinstallrik': 'porslin, tallrik', 'keramikvas': 'keramik, vas',
};

// ── Forbidden phrases ──
const FORBIDDEN_PHRASES = [
  { pattern: /\bbruksslitage\b/i, label: '"bruksslitage" standalone', severity: 'high' },
  { pattern: /\bej funktionstestad\b/i, label: '"Ej funktionstestad" (forbidden)', severity: 'high' },
  { pattern: /\bingen anmärkning\b/i, label: '"Ingen anmärkning" (discouraged)', severity: 'medium' },
  { pattern: /\båldersslitage\b/i, label: '"åldersslitage" (too vague)', severity: 'medium' },
  { pattern: /\bnormalt slitage\b/i, label: '"normalt slitage" (too vague)', severity: 'medium' },
];

// ── Abbreviations that should be written out ──
const ABBREVIATION_PATTERNS = [
  { pattern: /\bbl\.?\s*a\b/i, label: 'bl.a. → bland annat' },
  { pattern: /\bosv\b\.?/i, label: 'osv → och så vidare' },
  { pattern: /\bnr\.\s/i, label: 'nr. → nummer' },
  { pattern: /\bev\.\s/i, label: 'ev. → eventuellt' },
];

// ── LanguageTool spellcheck (free, dictionary-based, no hallucinations) ──
let ltStats = { calls: 0, errors: 0, found: 0 };

// Safe words that LanguageTool may still flag incorrectly. Canonical list
// lives in SwedishSpellChecker (the publication scanner uses the same one)
// so the two surfaces can't drift apart.
const SAFE_WORDS = SwedishSpellChecker.getSafeWordsSet();

// Rate limiter for LanguageTool free tier (20 req/min, 75K chars/min)
const ltTimestamps = []; // { time, chars }
async function waitForLTCapacity(chars) {
  while (true) {
    const cutoff = Date.now() - 60000;
    // Remove entries older than 1 minute
    while (ltTimestamps.length > 0 && ltTimestamps[0].time < cutoff) ltTimestamps.shift();
    const reqCount = ltTimestamps.length;
    const charCount = ltTimestamps.reduce((sum, t) => sum + t.chars, 0);
    // reqCount === 0: a single text bigger than the whole char budget can
    // never fit — send it anyway rather than dereference an empty queue below
    if ((reqCount < 18 && charCount + chars < 70000) || reqCount === 0) {
      // Reserve capacity NOW, before the request fires, so concurrent callers
      // see in-flight requests and can't burst past the free-tier limit.
      // Caller releases this entry (removes it from ltTimestamps) if the
      // request fails, so a timeout/429/error doesn't permanently eat a slot.
      const reservation = { time: Date.now(), chars };
      ltTimestamps.push(reservation);
      return reservation;
    }
    await sleep(Math.max(100, ltTimestamps[0].time + 60000 - Date.now() + 100));
  }
}

// Release a reservation made by waitForLTCapacity — call on any failure path
// (timeout, 429, network error) so a failed request doesn't permanently
// consume free-tier capacity meant for successful requests only.
function releaseLTCapacity(reservation) {
  if (!reservation) return;
  const idx = ltTimestamps.indexOf(reservation);
  if (idx !== -1) ltTimestamps.splice(idx, 1);
}

// Load settings from chrome.storage on init
async function loadSettings() {
  try {
    const syncResult = await chrome.storage.sync.get(['ownCompanyId', 'excludeCompanyId']);
    const companyId = syncResult.ownCompanyId || syncResult.excludeCompanyId || '48';
    document.getElementById('companyId').value = companyId;
  } catch (e) {
    console.warn('Not running as extension page');
  }
}
loadSettings();

async function languageToolSpellcheck(title, description, condition) {
  // Build combined text with field offset tracking
  const fields = [];
  let combined = '';
  for (const [field, text] of [['title', title], ['description', description], ['condition', condition]]) {
    if (!text || text.length < 3) continue;
    const startOffset = combined.length;
    combined += (combined ? ' ' : '') + text;
    fields.push({ field, startOffset, endOffset: combined.length });
  }
  if (combined.length < 5) return [];

  ltStats.calls++;
  let reservation = null;
  try {
    reservation = await waitForLTCapacity(combined.length);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch('https://api.languagetool.org/v2/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        text: combined,
        language: 'sv',
        enabledCategories: 'TYPOS,SPELLING',
        disabledCategories: 'GRAMMAR,STYLE,TYPOGRAPHY,PUNCTUATION,CASING'
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // Release the reserved slot — this call never actually consumed LT quota
      releaseLTCapacity(reservation);
      if (response.status === 429) {
        console.warn('[LT] Rate limited, waiting 30s...');
        await sleep(30000);
      }
      ltStats.errors++;
      return [];
    }

    const data = await response.json();
    if (!data.matches || !Array.isArray(data.matches)) return [];

    // ALL-CAPS tokens in the title are the artist/maker name by Swedish
    // cataloging convention ("ROLF LIDBERG, litografi…") — never typos.
    const titleCapsTokens = new Set(
      ((title || '').match(/\b[A-ZÅÄÖÜ]{2,}\b/g) || []).map(w => w.toLowerCase())
    );

    const results = data.matches
      .filter(m => m.replacements && m.replacements.length > 0)
      .map(m => {
        const word = combined.substring(m.offset, m.offset + m.length);
        // Determine which field this error belongs to
        const fieldEntry = fields.find(f => m.offset >= f.startOffset && m.offset < f.endOffset);
        return {
          originalWord: word,
          suggestedWord: m.replacements[0].value,
          confidence: 0.95,
          source: 'languagetool',
          field: fieldEntry?.field || 'text',
          type: 'spelling'
        };
      })
      .filter(e => e.originalWord.length >= 3 &&
              e.originalWord.toLowerCase() !== e.suggestedWord.toLowerCase() &&
              !SAFE_WORDS.has(e.originalWord.toLowerCase()) &&
              !titleCapsTokens.has(e.originalWord.toLowerCase()) &&
              // Corrections with triple identical letters are LT compound
              // artifacts ("glassservis") — same guard as the scanner
              !/(.)\1\1/.test(e.suggestedWord) &&
              // Skip proper nouns (Capitalized, not ALL CAPS)
              !((/^[A-ZÅÄÖÜ][a-zåäöü]/.test(e.originalWord)) && !/^[A-ZÅÄÖÜ]+$/.test(e.originalWord)));

    ltStats.found += results.length;
    return results;
  } catch (e) {
    // Release the reserved slot — the request failed, so it never consumed LT quota
    releaseLTCapacity(reservation);
    if (e.name === 'AbortError') {
      console.warn('[LT] Request timed out');
    } else {
      console.warn(`[LT] Error: ${e.message}`);
    }
    ltStats.errors++;
  }
  return [];
}

// ── Helpers ──
function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Data fetching ──
const API_BASE = 'https://auctionet.com/api/v2/items.json';

async function fetchAllItems(companyId, onProgress) {
  const allItems = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const url = `${API_BASE}?company_id=${companyId}&per_page=${perPage}&page=${page}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`API ${resp.status}: ${resp.statusText}`);
    const data = await resp.json();
    const items = data.items || [];
    if (items.length === 0) break;

    // Only keep active (not ended) items
    const active = items.filter(item => !item.hammered && item.state === 'published');
    allItems.push(...active);

    onProgress(allItems.length, data.pagination?.total_entries || '?', page);

    if (items.length < perPage) break;
    page++;
    await sleep(100);
  }

  return allItems;
}

// ── Analysis ──
async function analyzeItem(item, spellChecker, brandValidator) {
  const title = item.title || '';
  const description = stripHtml(item.description || '');
  const condition = stripHtml(item.condition || '');
  const allText = `${title} ${description} ${condition}`;

  const errors = { spelling: [], brand: [], forbidden: [], structural: [] };

  // 1. Swedish dictionary spelling
  for (const [field, text] of [['title', title], ['description', description], ['condition', condition]]) {
    if (!text) continue;
    const results = spellChecker.validateSwedishSpelling(text);
    results.forEach(r => errors.spelling.push({ ...r, field }));
  }

  // 2. Common misspellings
  const lowerAll = allText.toLowerCase();
  for (const [wrong, correct] of Object.entries(COMMON_MISSPELLINGS)) {
    const regex = new RegExp(`\\b${wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (regex.test(lowerAll)) {
      errors.spelling.push({ originalWord: wrong, suggestedWord: correct, source: 'common_misspellings', field: 'text' });
    }
  }

  // 2b. LanguageTool spellcheck (always-on, free, no API key needed)
  {
    const existingWords = new Set(errors.spelling.map(e => (e.originalWord || '').toLowerCase()));
    const ltResults = await languageToolSpellcheck(title, description, condition);
    for (const r of ltResults) {
      if (!existingWords.has((r.originalWord || '').toLowerCase())) {
        errors.spelling.push(r);
        existingWords.add((r.originalWord || '').toLowerCase());
      }
    }
  }

  // 3. Brand misspellings
  const brandResults = brandValidator.detectFuzzyBrandMatches(title, description);
  brandResults.forEach(r => errors.brand.push(r));

  // 3b. Shared learned whitelist (Cloudflare D1) — words employees dismissed
  // as correct never flag again, regardless of which check flagged them
  // (runs after ALL word-level checks so brand fuzzy-matches are covered too).
  {
    const whitelist = await getSharedWhitelist();
    errors.spelling = errors.spelling.filter(
      e => !whitelist.has((e.originalWord || '').toLowerCase())
    );
    errors.brand = errors.brand.filter(
      e => !whitelist.has((e.originalBrand || '').toLowerCase())
    );
  }

  // 4. Forbidden words
  for (const fw of FORBIDDEN_WORDS) {
    const regex = new RegExp(`\\b${fw}\\b`, 'gi');
    const match = lowerAll.match(regex);
    if (match) {
      errors.forbidden.push({ word: fw, field: 'text' });
    }
  }

  // 5. Structural checks
  // Forbidden phrases
  for (const fp of FORBIDDEN_PHRASES) {
    if (fp.pattern.test(allText)) {
      errors.structural.push({ type: 'forbidden_phrase', label: fp.label, severity: fp.severity });
    }
  }

  // Abbreviations
  for (const ab of ABBREVIATION_PATTERNS) {
    if (ab.pattern.test(allText)) {
      errors.structural.push({ type: 'abbreviation', label: ab.label, severity: 'low' });
    }
  }

  // Compound words
  for (const [compound, correction] of Object.entries(COMPOUND_ERRORS)) {
    const regex = new RegExp(`\\b${compound}\\b`, 'gi');
    if (regex.test(title.toLowerCase())) {
      errors.structural.push({ type: 'compound_word', label: `"${compound}" → ${correction}`, severity: 'medium' });
    }
  }

  // Title should start with UPPERCASE
  if (title && !/^[A-ZÅÄÖ]/.test(title)) {
    errors.structural.push({ type: 'title_format', label: 'Title does not start with uppercase', severity: 'medium' });
  }

  // Description too short
  if (description.length > 0 && description.length < 50) {
    errors.structural.push({ type: 'short_description', label: `Description only ${description.length} chars`, severity: 'medium' });
  }

  // Condition too short
  if (condition.length > 0 && condition.length < 20) {
    errors.structural.push({ type: 'short_condition', label: `Condition only ${condition.length} chars`, severity: 'low' });
  }

  // Missing measurements in description
  if (description.length > 30 && !/\d+\s*(x|\×)\s*\d+|\d+\s*(cm|mm)\b/i.test(description)) {
    errors.structural.push({ type: 'missing_measurements', label: 'No measurements found in description', severity: 'low' });
  }

  const totalErrors = errors.spelling.length + errors.brand.length + errors.forbidden.length + errors.structural.length;

  return {
    id: item.id,
    title,
    url: (item.url || `https://auctionet.com/sv/items/${item.id}`).replace('/en/', '/sv/'),
    errors,
    totalErrors,
    hasSpelling: errors.spelling.length > 0,
    hasBrand: errors.brand.length > 0,
    hasForbidden: errors.forbidden.length > 0,
    hasStructural: errors.structural.length > 0,
  };
}

// ── Render results ──
function render(results, totalItems) {
  const el = document.getElementById('results');

  const withAnyError = results.filter(r => r.totalErrors > 0);
  const withSpelling = results.filter(r => r.hasSpelling);
  const withBrand = results.filter(r => r.hasBrand);
  const withForbidden = results.filter(r => r.hasForbidden);
  const withStructural = results.filter(r => r.hasStructural);

  const pct = (n) => totalItems > 0 ? (n / totalItems * 100).toFixed(1) : '0';

  // Aggregate top misspellings
  const spellingCounts = {};
  results.forEach(r => r.errors.spelling.forEach(e => {
    const key = `${(e.originalWord||'').toLowerCase()} → ${e.suggestedWord||''}`;
    spellingCounts[key] = (spellingCounts[key] || 0) + 1;
  }));
  const topSpellings = Object.entries(spellingCounts).sort((a,b) => b[1]-a[1]).slice(0, 25);

  // Aggregate structural issues
  const structCounts = {};
  results.forEach(r => r.errors.structural.forEach(e => {
    structCounts[e.label] = (structCounts[e.label] || 0) + 1;
  }));
  const topStructural = Object.entries(structCounts).sort((a,b) => b[1]-a[1]).slice(0, 20);

  // Aggregate forbidden words
  const forbiddenCounts = {};
  results.forEach(r => r.errors.forbidden.forEach(e => {
    forbiddenCounts[e.word] = (forbiddenCounts[e.word] || 0) + 1;
  }));
  const topForbidden = Object.entries(forbiddenCounts).sort((a,b) => b[1]-a[1]);

  // Brand issues
  const brandCounts = {};
  results.forEach(r => r.errors.brand.forEach(e => {
    const key = `${e.originalBrand} → ${e.suggestedBrand}`;
    brandCounts[key] = (brandCounts[key] || 0) + 1;
  }));
  const topBrands = Object.entries(brandCounts).sort((a,b) => b[1]-a[1]);

  let html = '';

  // Summary cards
  html += `<div class="cards">
    <div class="card blue"><div class="value">${totalItems}</div><div class="label">Items Scanned</div></div>
    <div class="card ${withAnyError.length > totalItems * 0.3 ? 'red' : 'orange'}"><div class="value">${pct(withAnyError.length)}%</div><div class="label">With Any Error (${withAnyError.length})</div></div>
    <div class="card ${withSpelling.length > totalItems * 0.1 ? 'red' : 'orange'}"><div class="value">${pct(withSpelling.length)}%</div><div class="label">Spelling Errors (${withSpelling.length})</div></div>
    <div class="card"><div class="value">${pct(withBrand.length)}%</div><div class="label">Brand Errors (${withBrand.length})</div></div>
    <div class="card ${withForbidden.length > 0 ? 'orange' : 'green'}"><div class="value">${pct(withForbidden.length)}%</div><div class="label">Forbidden Words (${withForbidden.length})</div></div>
    <div class="card"><div class="value">${pct(withStructural.length)}%</div><div class="label">Structural Issues (${withStructural.length})</div></div>
  </div>`;

  // Top misspellings
  if (topSpellings.length > 0) {
    html += `<h2>Top Misspellings</h2><table><tr><th>Misspelling → Correction</th><th>Count</th></tr>`;
    topSpellings.forEach(([key, count]) => {
      html += `<tr><td>${esc(key)}</td><td>${count}</td></tr>`;
    });
    html += `</table>`;
  }

  // Brand issues
  if (topBrands.length > 0) {
    html += `<h2>Brand Misspellings</h2><table><tr><th>Found → Correct</th><th>Count</th></tr>`;
    topBrands.forEach(([key, count]) => {
      html += `<tr><td>${esc(key)}</td><td>${count}</td></tr>`;
    });
    html += `</table>`;
  }

  // Forbidden words
  if (topForbidden.length > 0) {
    html += `<h2>Forbidden Words Found</h2><table><tr><th>Word</th><th>Count</th></tr>`;
    topForbidden.forEach(([word, count]) => {
      html += `<tr><td>${esc(word)}</td><td>${count}</td></tr>`;
    });
    html += `</table>`;
  }

  // Structural issues
  if (topStructural.length > 0) {
    html += `<h2>Structural Issues</h2><table><tr><th>Issue</th><th>Count</th></tr>`;
    topStructural.forEach(([label, count]) => {
      html += `<tr><td>${esc(label)}</td><td>${count}</td></tr>`;
    });
    html += `</table>`;
  }

  // All items with errors — with filter buttons and expandable details
  const allWithErrors = [...results].filter(r => r.totalErrors > 0).sort((a,b) => b.totalErrors - a.totalErrors);

  html += `<h2>All Items with Errors (${allWithErrors.length})</h2>`;
  html += `<div id="filter-bar" style="margin-bottom:10px;display:flex;gap:6px;flex-wrap:wrap">
    <button class="filter-btn active" data-filter="all">All (${allWithErrors.length})</button>
    <button class="filter-btn" data-filter="spelling">Spelling (${withSpelling.length})</button>
    <button class="filter-btn" data-filter="brand">Brand (${withBrand.length})</button>
    <button class="filter-btn" data-filter="forbidden">Forbidden (${withForbidden.length})</button>
    <button class="filter-btn" data-filter="structural">Structural (${withStructural.length})</button>
  </div>`;
  html += `<table id="items-table"><tr><th>#</th><th>Title</th><th>Errors</th><th>Details</th></tr>`;
  allWithErrors.forEach((r, i) => {
    const rowId = `detail-${i}`;
    const cats = [];
    if (r.hasSpelling) cats.push('spelling');
    if (r.hasBrand) cats.push('brand');
    if (r.hasForbidden) cats.push('forbidden');
    if (r.hasStructural) cats.push('structural');
    const tags = [];
    if (r.hasSpelling) tags.push(`<span class="tag tag-spelling">Spelling (${r.errors.spelling.length})</span>`);
    if (r.hasBrand) tags.push(`<span class="tag tag-brand">Brand (${r.errors.brand.length})</span>`);
    if (r.hasForbidden) tags.push(`<span class="tag tag-forbidden">Forbidden (${r.errors.forbidden.length})</span>`);
    if (r.hasStructural) tags.push(`<span class="tag tag-structural">Structural (${r.errors.structural.length})</span>`);

    const details = [];
    r.errors.spelling.forEach(e => {
      const sourceTag = e.source === 'languagetool' ? ' [LT]' : '';
      details.push({ cat: 'spelling', text: `"${e.originalWord}" → ${e.suggestedWord}  (${e.field})${sourceTag}` });
    });
    r.errors.brand.forEach(e => {
      details.push({ cat: 'brand', text: `Brand: "${e.originalBrand}" → ${e.suggestedBrand}` });
    });
    r.errors.forbidden.forEach(e => {
      details.push({ cat: 'forbidden', text: `Forbidden word: "${e.word}"` });
    });
    r.errors.structural.forEach(e => {
      details.push({ cat: 'structural', text: e.label });
    });

    html += `<tr class="toggle-row item-row" data-cats="${cats.join(',')}" data-detail="${rowId}">
      <td><span class="toggle-arrow" id="arrow-${rowId}">&#9654;</span> ${i + 1}</td>
      <td><a href="${esc(r.url)}" target="_blank">${esc(r.title)}</a></td>
      <td>${r.totalErrors}</td>
      <td>${tags.join(' ')}</td>
    </tr>`;
    html += `<tr class="error-details item-detail" data-cats="${cats.join(',')}" id="${rowId}"><td colspan="4"><ul class="error-list">`;
    details.forEach(d => {
      html += `<li class="cat-${d.cat}">${esc(d.text)}</li>`;
    });
    html += `</ul></td></tr>`;
  });
  html += `</table>`;

  // Error distribution histogram
  const buckets = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 };
  results.forEach(r => {
    if (r.totalErrors === 0) buckets['0']++;
    else if (r.totalErrors === 1) buckets['1']++;
    else if (r.totalErrors === 2) buckets['2']++;
    else if (r.totalErrors === 3) buckets['3']++;
    else if (r.totalErrors === 4) buckets['4']++;
    else buckets['5+']++;
  });
  const maxBucket = Math.max(...Object.values(buckets), 1);
  html += `<h2>Error Count Distribution</h2><div class="histogram">`;
  for (const [label, count] of Object.entries(buckets)) {
    const h = Math.max((count / maxBucket) * 100, 2);
    html += `<div class="hist-bar" style="height:${h}%"><span class="hist-count">${count}</span><span class="hist-label">${label} errors</span></div>`;
  }
  html += `</div>`;

  el.innerHTML = html;
  el.style.display = 'block';

  // Attach event delegation for dynamically rendered elements
  attachResultsEvents();

  // Console JSON
  const summary = {
    totalItems,
    withAnyError: withAnyError.length,
    pctWithError: pct(withAnyError.length),
    withSpelling: withSpelling.length,
    withBrand: withBrand.length,
    withForbidden: withForbidden.length,
    withStructural: withStructural.length,
    topSpellings: topSpellings.slice(0, 10),
    topForbidden: topForbidden.slice(0, 10),
    topStructural: topStructural.slice(0, 10),
  };
  console.log('=== AUDIT SUMMARY ===', JSON.stringify(summary, null, 2));
  console.log('=== FULL RESULTS ===', results);
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── Event delegation for dynamically rendered results ──
function attachResultsEvents() {
  // Filter buttons
  const filterBar = document.getElementById('filter-bar');
  if (filterBar) {
    filterBar.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      const cat = btn.dataset.filter;
      filterBar.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      let num = 0;
      document.querySelectorAll('.item-row').forEach(row => {
        const cats = row.dataset.cats || '';
        const show = cat === 'all' || cats.split(',').includes(cat);
        row.style.display = show ? '' : 'none';
        const detailId = row.dataset.detail;
        if (detailId) {
          const detail = document.getElementById(detailId);
          if (detail) {
            detail.style.display = show && detail.classList.contains('open') ? '' : 'none';
            if (!show) detail.classList.remove('open');
          }
        }
        if (show) {
          num++;
          row.querySelector('td').lastChild.textContent = ' ' + num;
        }
      });
    });
  }

  // Toggle row details via event delegation on the table
  const table = document.getElementById('items-table');
  if (table) {
    table.addEventListener('click', (e) => {
      // Don't toggle when clicking links
      if (e.target.closest('a')) return;
      const row = e.target.closest('.toggle-row');
      if (!row) return;
      const rowId = row.dataset.detail;
      if (!rowId) return;
      const detail = document.getElementById(rowId);
      const arrow = document.getElementById('arrow-' + rowId);
      if (detail) {
        detail.classList.toggle('open');
        detail.style.display = detail.classList.contains('open') ? '' : 'none';
        if (arrow) arrow.classList.toggle('open');
      }
    });
  }
}

// ── Main ──
async function runAudit() {
  const companyId = document.getElementById('companyId').value || '48';
  const btn = document.getElementById('runBtn');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const resultsEl = document.getElementById('results');

  btn.disabled = true;
  resultsEl.style.display = 'none';
  progressText.textContent = 'Fetching items...';

  try {
    // Force-refresh the shared whitelist so a word promoted since the last
    // scan is filtered from this run (cached afterwards for every item).
    const whitelist = await getSharedWhitelist(true);
    if (whitelist.size > 0) {
      console.log(`[Whitelist] ${whitelist.size} shared whitelist words loaded`);
    }

    // Fetch
    const items = await fetchAllItems(companyId, (count, total, page) => {
      progressFill.style.width = `${Math.min((page / 10) * 100, 90)}%`;
      progressText.textContent = `Page ${page}: ${count} active items so far (API total: ${total})`;
    });

    progressFill.style.width = '90%';
    progressText.textContent = `Fetched ${items.length} active items. Analyzing...`;

    // Analyze
    const spellChecker = new SwedishSpellChecker();
    const brandValidator = new BrandValidationManager(null);
    const results = [];

    ltStats = { calls: 0, errors: 0, found: 0 };

    const CONCURRENCY = 5; // 5 parallel LanguageTool calls (respects rate limiter)
    for (let i = 0; i < items.length; i += CONCURRENCY) {
      const batch = items.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(item => analyzeItem(item, spellChecker, brandValidator))
      );
      results.push(...batchResults);
      const pctDone = 90 + (results.length / items.length) * 10;
      progressFill.style.width = `${pctDone}%`;
      progressText.textContent = `Spellcheck ${results.length} / ${items.length}... (LT: ${ltStats.calls} req, ${ltStats.found} found)`;
    }

    progressFill.style.width = '100%';
    progressText.textContent = `Done! ${results.length} items | LanguageTool: ${ltStats.calls} requests, ${ltStats.found} spelling issues, ${ltStats.errors} errors`;
    console.log('[LT Stats]', ltStats);

    render(results, items.length);

  } catch (err) {
    progressText.textContent = `Error: ${err.message}`;
    console.error(err);
  } finally {
    btn.disabled = false;
  }
}

// ── Wire up event listeners (no inline handlers) ──
document.getElementById('runBtn').addEventListener('click', runAudit);
