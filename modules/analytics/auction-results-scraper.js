// auction-results-scraper.js — Scrapes /admin/sas/auction_results for category-level sales data
// Provides data the public API cannot: unsold counts, recall rates, commission, unique visits

import { loadAdminCache, saveAdminCache } from './data-cache.js';

const BASE_URL = 'https://auctionet.com/admin/sas/auction_results';

// ─── URL Builder ──────────────────────────────────────────

function buildAuctionResultsURL(fromDate, toDate) {
  const params = new URLSearchParams();
  params.set('filter[auction_type]', 'online');
  params.set('filter[from_date]', fromDate);
  params.set('filter[to_date]', toDate);
  params.set('filter[include_unsolds]', 'true');
  return `${BASE_URL}?${params.toString()}`;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── Swedish Number Parsing ───────────────────────────────

function parseSwedishNumber(str) {
  if (!str || !str.trim()) return null;
  // Strip nbsp, regular spaces (used as thousands sep), then handle comma decimal
  const cleaned = str.replace(/\u00a0/g, '').replace(/\s/g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseSwedishPercent(str) {
  if (!str || !str.trim()) return null;
  // e.g. "-6,72 %" or "+28,13 %"
  const cleaned = str.replace(/\u00a0/g, '').replace(/\s/g, '').replace('%', '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// ─── HTML Parser ──────────────────────────────────────────

export function parseAuctionResultsHTML(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const table = doc.querySelector('.auction-results-table-container table');
  if (!table) return null;

  const rows = table.querySelectorAll('tbody tr.category');
  const categories = [];

  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 12) continue;

    // Extract category ID from row id (e.g. "category_58")
    const rowId = row.getAttribute('id') || '';
    const idMatch = rowId.match(/category_(\d+)/);
    if (!idMatch) continue;
    const id = parseInt(idMatch[1]);

    // Parse category name — detect parent/sub structure
    const nameCell = cells[0];
    const parentSpan = nameCell.querySelector('span.parent');
    let name, parentName;
    if (parentSpan) {
      parentName = parentSpan.textContent.replace(/\s*\/\s*$/, '').trim();
      // The sub-category name is the text after the parent span
      name = nameCell.textContent.replace(parentSpan.textContent, '').trim();
    } else {
      name = nameCell.textContent.trim();
      parentName = null;
    }

    // Parse data columns — skip rows where all data cells are empty (parent grouping rows)
    const totalEstimate = parseSwedishNumber(cells[1].textContent);
    const totalReserve = parseSwedishNumber(cells[2].textContent);
    const totalHammered = parseSwedishNumber(cells[3].textContent);
    const totalCount = parseSwedishNumber(cells[6].textContent);
    const soldCount = parseSwedishNumber(cells[7].textContent);

    // Skip parent-only rows (no data)
    if (totalCount === null && soldCount === null && totalEstimate === null) continue;

    categories.push({
      id,
      name,
      parentName,
      totalEstimate: totalEstimate || 0,
      totalReserve: totalReserve || 0,
      totalHammered: totalHammered || 0,
      hamVsEstSold: parseSwedishPercent(cells[4].textContent),
      hamVsEstAll: parseSwedishPercent(cells[5].textContent),
      totalCount: totalCount || 0,
      soldCount: soldCount || 0,
      unsoldCount: parseSwedishNumber(cells[8].textContent) || 0,
      avgPriceSold: parseSwedishNumber(cells[9].textContent) || 0,
      avgUniqueVisits: parseSwedishNumber(cells[10].textContent) || 0,
      totalCommission: parseSwedishNumber(cells[11].textContent) || 0,
    });
  }

  return categories;
}

// ─── Fetch via Background Service Worker ──────────────────

async function fetchAdminHTML(url) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error('Admin fetch timed out')), 30000);
    chrome.runtime.sendMessage({ type: 'fetch-admin-html', url }, (resp) => {
      clearTimeout(timeoutId);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (resp?.success) {
        resolve(resp.html);
      } else {
        reject(new Error(resp?.error || 'Failed to fetch admin page'));
      }
    });
  });
}

// ─── Public API ───────────────────────────────────────────

export async function fetchAuctionResults(year) {
  const now = new Date();
  const currentYear = now.getFullYear();

  const fromDate = `${year}-01-01`;
  const toDate = year === currentYear ? formatDate(now) : `${year}-12-31`;

  const url = buildAuctionResultsURL(fromDate, toDate);
  const html = await fetchAdminHTML(url);

  // Detect login page (no auction results table)
  const categories = parseAuctionResultsHTML(html);
  if (!categories) {
    throw new Error('Auction results table not found — are you logged in to Auctionet admin?');
  }

  return categories;
}

export async function fetchAuctionResultsWithCache(year) {
  const cached = await loadAdminCache(year);
  if (cached && !cached.isExpired) {
    return cached.categories;
  }

  const categories = await fetchAuctionResults(year);
  await saveAdminCache(year, categories);
  return categories;
}

// ─── Aggregation Helpers ──────────────────────────────────

export function computeAdminTotals(categories) {
  if (!categories || categories.length === 0) return null;

  let totalCount = 0, soldCount = 0, unsoldCount = 0;
  let totalHammered = 0, totalEstimate = 0, totalCommission = 0;
  let visitSum = 0, visitCategories = 0;

  for (const cat of categories) {
    totalCount += cat.totalCount;
    soldCount += cat.soldCount;
    unsoldCount += cat.unsoldCount;
    totalHammered += cat.totalHammered;
    totalEstimate += cat.totalEstimate;
    totalCommission += cat.totalCommission;
    if (cat.avgUniqueVisits > 0) {
      visitSum += cat.avgUniqueVisits * cat.totalCount;
      visitCategories += cat.totalCount;
    }
  }

  const recallRate = totalCount > 0 ? Math.round((unsoldCount / totalCount) * 1000) / 10 : 0;
  const avgVisits = visitCategories > 0 ? Math.round(visitSum / visitCategories) : 0;

  return { totalCount, soldCount, unsoldCount, recallRate, totalHammered, totalEstimate, totalCommission, avgVisits };
}

export function computeAdminYoY(current, previous) {
  if (!current || !previous) return null;

  function pctChange(cur, prev) {
    if (!prev || prev === 0) return null;
    return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
  }

  return {
    totalCount: pctChange(current.totalCount, previous.totalCount),
    soldCount: pctChange(current.soldCount, previous.soldCount),
    unsoldCount: pctChange(current.unsoldCount, previous.unsoldCount),
    recallRate: pctChange(current.recallRate, previous.recallRate),
    totalHammered: pctChange(current.totalHammered, previous.totalHammered),
    totalCommission: pctChange(current.totalCommission, previous.totalCommission),
    avgVisits: pctChange(current.avgVisits, previous.avgVisits),
  };
}

// Build a lookup map from parent category name → admin data for merging with API categories
export function buildAdminCategoryMap(categories) {
  if (!categories) return new Map();

  const map = new Map();
  for (const cat of categories) {
    // Group by parent category name for matching with API data
    const key = cat.parentName || cat.name;
    if (!map.has(key)) {
      map.set(key, { soldCount: 0, unsoldCount: 0, totalCount: 0, avgUniqueVisits: 0, totalCommission: 0, _visitWeightedSum: 0 });
    }
    const agg = map.get(key);
    agg.soldCount += cat.soldCount;
    agg.unsoldCount += cat.unsoldCount;
    agg.totalCount += cat.totalCount;
    agg.totalCommission += cat.totalCommission;
    agg._visitWeightedSum += cat.avgUniqueVisits * cat.totalCount;
  }

  // Compute averages
  for (const [, agg] of map) {
    agg.recallRate = agg.totalCount > 0 ? Math.round((agg.unsoldCount / agg.totalCount) * 1000) / 10 : 0;
    agg.avgUniqueVisits = agg.totalCount > 0 ? Math.round(agg._visitWeightedSum / agg.totalCount) : 0;
    delete agg._visitWeightedSum;
  }

  return map;
}
