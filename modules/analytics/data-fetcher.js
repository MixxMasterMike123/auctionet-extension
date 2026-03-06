// data-fetcher.js — Fetches sold items from Auctionet API with category sharding

import { PARENT_CATEGORY_IDS } from './category-registry.js';
import { compressItem, saveCache, loadCache } from './data-cache.js';

const API_BASE = 'https://auctionet.com/api/v2/items.json';
const PER_PAGE = 200;
const MAX_PAGES = 50;
const CONCURRENT_FETCHES = 4; // parallel category fetches

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(companyId, page, categoryId = null) {
  let url = `${API_BASE}?is=ended&company_id=${companyId}&per_page=${PER_PAGE}&page=${page}`;
  if (categoryId) url += `&category_id=${categoryId}`;

  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`API ${resp.status}: ${resp.statusText}`);
  const data = await resp.json();
  return data.items || [];
}

// Direct pagination: fetch up to 10k items (50 pages x 200)
async function fetchDirect(companyId, onProgress) {
  const allItems = [];
  let page = 1;

  while (page <= MAX_PAGES) {
    const items = await fetchPage(companyId, page);
    if (items.length === 0) break;

    allItems.push(...items);
    onProgress({ phase: 'direct', page, itemCount: allItems.length });

    if (items.length < PER_PAGE) break;
    page++;
    await sleep(50);
  }

  return { items: allItems, hitCap: allItems.length >= MAX_PAGES * PER_PAGE };
}

// Category-sharded fetch — sequential categories, reports per-page progress
async function fetchSharded(companyId, onProgress) {
  const allItems = new Map();
  const totalCats = PARENT_CATEGORY_IDS.length;

  for (let ci = 0; ci < totalCats; ci++) {
    const catId = PARENT_CATEGORY_IDS[ci];
    let page = 1;

    while (page <= MAX_PAGES) {
      const items = await fetchPage(companyId, page, catId);
      if (items.length === 0) break;

      for (const item of items) {
        allItems.set(item.id, item);
      }

      onProgress({
        phase: 'sharded-page',
        category: ci + 1,
        totalCategories: totalCats,
        page,
        itemCount: allItems.size,
      });

      if (items.length < PER_PAGE) break;
      page++;
    }

    // Category complete
    onProgress({
      phase: 'sharded',
      category: ci + 1,
      totalCategories: totalCats,
      itemCount: allItems.size,
    });
  }

  return Array.from(allItems.values());
}

// Incremental refresh: fetch only recent pages, merge with cached data
async function fetchIncremental(companyId, cachedItems, onProgress) {
  onProgress({ phase: 'incremental', itemCount: cachedItems.length });

  // Build set of known IDs from cache
  const knownIds = new Set(cachedItems.map(i => i.id));

  // Fetch recent pages until we start seeing items we already have
  const newRawItems = [];
  let page = 1;
  const MAX_INCREMENTAL_PAGES = 10;

  while (page <= MAX_INCREMENTAL_PAGES) {
    const items = await fetchPage(companyId, page);
    if (items.length === 0) break;

    let allKnown = true;
    for (const item of items) {
      if (!knownIds.has(item.id)) {
        newRawItems.push(item);
        allKnown = false;
      }
    }

    onProgress({
      phase: 'incremental',
      page,
      newItems: newRawItems.length,
      itemCount: cachedItems.length + newRawItems.length,
    });

    // If entire page was already cached, we've caught up
    if (allKnown) break;
    if (items.length < PER_PAGE) break;
    page++;
    await sleep(50);
  }

  // Filter and compress new items
  const validNew = newRawItems.filter(item => {
    if (item.currency !== 'SEK') return false;
    const bids = item.bids || [];
    return bids.length > 0 && Math.max(...bids.map(b => b.amount)) > 0;
  });

  const compressedNew = validNew.map(compressItem);
  const houseName = validNew.length > 0 ? validNew[0].house : null;

  // Merge: new items + existing cached items (new items first = most recent)
  const merged = [...compressedNew, ...cachedItems];

  return { items: merged, houseName, newCount: compressedNew.length };
}

/**
 * Fetch all ended items for a company.
 * - If forceFullRefresh: full re-fetch from scratch
 * - If cache exists but expired: incremental update (fetch new items only)
 * - If no cache: full fetch
 * @param {number} companyId
 * @param {boolean} forceFullRefresh
 * @param {function} onProgress
 * @returns {{ items: CompressedItem[], houseName: string }}
 */
export async function fetchCompanyData(companyId, onProgress = () => {}, forceFullRefresh = false) {
  onProgress({ phase: 'starting', itemCount: 0 });

  // Try incremental update if we have cached data
  if (!forceFullRefresh) {
    const cached = await loadCache(companyId);
    if (cached && cached.items.length > 0) {
      const result = await fetchIncremental(companyId, cached.items, onProgress);
      const name = result.houseName || cached.houseName;

      onProgress({ phase: 'saving', itemCount: result.items.length });
      await saveCache(companyId, result.items, name);

      onProgress({ phase: 'done', itemCount: result.items.length, newItems: result.newCount });
      return { items: result.items, houseName: name };
    }
  }

  // Full fetch: try direct first, fall back to category sharding
  const direct = await fetchDirect(companyId, onProgress);

  let rawItems;
  if (!direct.hitCap) {
    rawItems = direct.items;
  } else {
    onProgress({ phase: 'switching-to-sharded', itemCount: direct.items.length });
    rawItems = await fetchSharded(companyId, onProgress);
  }

  // Filter to SEK, sold items with valid price data
  const validItems = rawItems.filter(item => {
    if (item.currency !== 'SEK') return false;
    const bids = item.bids || [];
    if (bids.length === 0) return false;
    return Math.max(...bids.map(b => b.amount)) > 0;
  });

  const houseName = validItems.length > 0 ? validItems[0].house : `Företag ${companyId}`;
  const compressed = validItems.map(compressItem);

  onProgress({ phase: 'saving', itemCount: compressed.length });
  await saveCache(companyId, compressed, houseName);

  onProgress({ phase: 'done', itemCount: compressed.length });
  return { items: compressed, houseName };
}
