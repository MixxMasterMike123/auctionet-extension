// auction-results-scraper.js — Scrapes /admin/sas/auction_results for category-level sales data
// Provides data the public API cannot: commission, unique visits, hammered prices, estimates
//
// NOTE: This data source counts AUCTION LOT APPEARANCES, not unique items.
// With Auctionet's 3x relisting policy, an item relisted 3 times appears as 3 separate rows.
// Therefore unsoldCount from this source is "unsold lots", NOT "unsold items", and must NOT
// be used for recall rate calculations. Use Flödesstatistik (/admin/sas) for true recall rates.

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

  // Parse the "Totalt eller genomsnitt" footer row for authoritative totals
  // This row is in tfoot or is the last row — look for it by text content
  let totals = null;
  const allRows = table.querySelectorAll('tfoot tr, tbody tr');
  for (const row of allRows) {
    const firstCell = row.querySelector('td, th');
    if (firstCell && firstCell.textContent.trim().startsWith('Totalt')) {
      const cells = row.querySelectorAll('td, th');
      if (cells.length >= 12) {
        totals = {
          totalEstimate: parseSwedishNumber(cells[1].textContent) || 0,
          totalReserve: parseSwedishNumber(cells[2].textContent) || 0,
          totalHammered: parseSwedishNumber(cells[3].textContent) || 0,
          hamVsEstSold: parseSwedishPercent(cells[4].textContent),
          hamVsEstAll: parseSwedishPercent(cells[5].textContent),
          totalCount: parseSwedishNumber(cells[6].textContent) || 0,
          soldCount: parseSwedishNumber(cells[7].textContent) || 0,
          unsoldCount: parseSwedishNumber(cells[8].textContent) || 0,
          avgPriceSold: parseSwedishNumber(cells[9].textContent) || 0,
          avgUniqueVisits: parseSwedishNumber(cells[10].textContent) || 0,
          totalCommission: parseSwedishNumber(cells[11].textContent) || 0,
        };
      }
      break;
    }
  }

  return { categories, totals };
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

/**
 * Fetch auction results for a date range.
 * @param {object} opts
 * @param {string} opts.fromDate — 'YYYY-MM-DD'
 * @param {string} opts.toDate — 'YYYY-MM-DD'
 */
export async function fetchAuctionResults({ fromDate, toDate }) {
  const url = buildAuctionResultsURL(fromDate, toDate);
  const html = await fetchAdminHTML(url);

  const result = parseAuctionResultsHTML(html);
  if (!result) {
    throw new Error('Auction results table not found — are you logged in to Auctionet admin?');
  }

  return result; // { categories, totals }
}

/**
 * Fetch auction results for a year with caching.
 * For current year: Jan 1 → today.
 * For past years: Jan 1 → Dec 31.
 */
export async function fetchAuctionResultsWithCache(year) {
  const cached = await loadAdminCache(year);
  if (cached && !cached.isExpired) {
    return { categories: cached.categories, totals: cached.totals };
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const fromDate = `${year}-01-01`;
  const toDate = year === currentYear ? formatDate(now) : `${year}-12-31`;

  const result = await fetchAuctionResults({ fromDate, toDate });
  await saveAdminCache(year, result.categories, result.totals);
  return result;
}

/**
 * Fetch auction results for a specific month within a year.
 * @param {number} year
 * @param {number} month — 0-11 (JS month index)
 */
export async function fetchAuctionResultsForMonth(year, month) {
  const mm = String(month + 1).padStart(2, '0');
  const fromDate = `${year}-${mm}-01`;

  // Last day of month
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  let toDate;
  if (year === currentYear && month === currentMonth) {
    // Current month: use today as cutoff
    toDate = formatDate(now);
  } else {
    // Completed month: use last day
    const lastDay = new Date(year, month + 1, 0).getDate();
    toDate = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;
  }

  const cacheKey = `${year}_m${mm}`;
  const cached = await loadAdminCache(cacheKey);
  if (cached && !cached.isExpired) {
    return { categories: cached.categories, totals: cached.totals };
  }

  const result = await fetchAuctionResults({ fromDate, toDate });
  await saveAdminCache(cacheKey, result.categories, result.totals);
  return result;
}

/**
 * Fetch same-period data for YoY comparison.
 * Uses Jan 1 → today's month/day for the given year (e.g., Jan 1–Mar 20 of 2024).
 * Only needed for previous years; current year already uses today as cutoff.
 */
export async function fetchAuctionResultsSamePeriod(year) {
  const now = new Date();
  const fromDate = `${year}-01-01`;
  const toMonth = String(now.getMonth() + 1).padStart(2, '0');
  const toDay = String(now.getDate()).padStart(2, '0');
  const toDate = `${year}-${toMonth}-${toDay}`;

  // Use a separate cache key to avoid overwriting full-year cache
  const cacheKey = `${year}_sp`;
  const cached = await loadAdminCache(cacheKey);
  if (cached && !cached.isExpired) {
    return { categories: cached.categories, totals: cached.totals };
  }

  const result = await fetchAuctionResults({ fromDate, toDate });
  await saveAdminCache(cacheKey, result.categories, result.totals);
  return result;
}

// ─── Aggregation Helpers ──────────────────────────────────

export function computeAdminTotals(result) {
  if (!result) return null;

  // Accept both { categories, totals } and plain categories array (legacy cache)
  const categories = Array.isArray(result) ? result : result.categories;
  const footerTotals = Array.isArray(result) ? null : result.totals;

  if ((!categories || categories.length === 0) && !footerTotals) return null;

  // Prefer the authoritative footer totals from "Totalt eller genomsnitt" row
  if (footerTotals) {
    const firstSaleRate = footerTotals.totalCount > 0
      ? Math.round((footerTotals.soldCount / footerTotals.totalCount) * 1000) / 10 : 0;
    return {
      totalCount: footerTotals.totalCount,
      soldCount: footerTotals.soldCount,
      firstSaleRate,
      totalHammered: footerTotals.totalHammered,
      totalEstimate: footerTotals.totalEstimate,
      totalCommission: footerTotals.totalCommission,
      avgVisits: footerTotals.avgUniqueVisits,
    };
  }

  // Fallback: sum from subcategory rows
  let totalCount = 0, soldCount = 0;
  let totalHammered = 0, totalEstimate = 0, totalCommission = 0;
  let visitSum = 0, visitItems = 0;

  for (const cat of categories) {
    totalCount += cat.totalCount;
    soldCount += cat.soldCount;
    totalHammered += cat.totalHammered;
    totalEstimate += cat.totalEstimate;
    totalCommission += cat.totalCommission;
    if (cat.avgUniqueVisits > 0) {
      visitSum += cat.avgUniqueVisits * cat.totalCount;
      visitItems += cat.totalCount;
    }
  }

  const firstSaleRate = totalCount > 0 ? Math.round((soldCount / totalCount) * 1000) / 10 : 0;
  const avgVisits = visitItems > 0 ? Math.round(visitSum / visitItems) : 0;

  return { totalCount, soldCount, firstSaleRate, totalHammered, totalEstimate, totalCommission, avgVisits };
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
    firstSaleRate: pctChange(current.firstSaleRate, previous.firstSaleRate),
    totalHammered: pctChange(current.totalHammered, previous.totalHammered),
    totalCommission: pctChange(current.totalCommission, previous.totalCommission),
    avgVisits: pctChange(current.avgVisits, previous.avgVisits),
  };
}

// Build a lookup map from parent category name → admin data for merging with API categories
export function buildAdminCategoryMap(result) {
  const categories = Array.isArray(result) ? result : result?.categories;
  if (!categories) return new Map();

  const map = new Map();
  for (const cat of categories) {
    // Group by parent category name for matching with API data
    const key = cat.parentName || cat.name;
    if (!map.has(key)) {
      map.set(key, { soldCount: 0, totalCount: 0, avgUniqueVisits: 0, totalCommission: 0, _visitWeightedSum: 0 });
    }
    const agg = map.get(key);
    agg.soldCount += cat.soldCount;
    agg.totalCount += cat.totalCount;
    agg.totalCommission += cat.totalCommission;
    agg._visitWeightedSum += cat.avgUniqueVisits * cat.totalCount;
  }

  // Compute averages
  for (const [, agg] of map) {
    agg.avgUniqueVisits = agg.totalCount > 0 ? Math.round(agg._visitWeightedSum / agg.totalCount) : 0;
    delete agg._visitWeightedSum;
  }

  return map;
}
