// metabase-data.js — Fetches true recall rate and sold/unsold data from Metabase BI
// Data source: bi.auctionet.com embedded dashboard via JWT tokens
// "Unsold" here means items that completed ALL automatic auction rounds without selling

import { loadMetabaseCache, saveMetabaseCache } from './data-cache.js';

// Card IDs for the Sold/Unsold dashboard (Dashboard 253)
const SOLD_UNSOLD_CARDS = [
  { name: 'shareUnsoldL12m', dashcardId: 3807, cardId: 2791 },
  { name: 'soldUnsoldMonthly', dashcardId: 3805, cardId: 2790 },
];

/**
 * Fetch Metabase sold/unsold data with caching.
 * Returns null on any failure (silent fallback).
 */
export async function fetchMetabaseSoldUnsold() {
  try {
    // Check cache first
    const cached = await loadMetabaseCache();
    if (cached && !cached.isExpired) return cached.data;

    // Fetch via background service worker
    const response = await chrome.runtime.sendMessage({
      type: 'fetch-metabase-card',
      analyticsPage: 'https://auctionet.com/admin/sas/analytics/sold_and_unsold',
      cards: SOLD_UNSOLD_CARDS,
    });

    if (!response?.success) return cached?.data || null;

    const parsed = parseMetabaseResults(response.results);
    if (!parsed) return cached?.data || null;

    await saveMetabaseCache(parsed);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Parse raw Metabase API results into structured data.
 */
export function parseMetabaseResults(results) {
  if (!results || !Array.isArray(results)) return null;

  const recallCard = results.find(r => r.name === 'shareUnsoldL12m');
  const monthlyCard = results.find(r => r.name === 'soldUnsoldMonthly');

  if (!recallCard?.data?.data?.rows?.[0]) return null;

  const recallRateL12m = Math.round(recallCard.data.data.rows[0][0] * 1000) / 10;

  let monthlyBreakdown = null;
  if (monthlyCard?.data?.data?.rows) {
    monthlyBreakdown = parseMonthlyBreakdown(monthlyCard.data.data.rows);
  }

  return { recallRateL12m, monthlyBreakdown };
}

/**
 * Parse the sold/unsold chart rows into monthly breakdown.
 * Input rows: ["sold"/"unsold"/"waiting...", "2025-03-01T00:00:00+01:00", count, distinctCount]
 * Output: array of { month: "2025-03", sold, unsold, recallRate } sorted oldest first
 */
function parseMonthlyBreakdown(rows) {
  const months = new Map();

  for (const row of rows) {
    const status = row[0];
    const dateStr = row[1];
    const count = row[2] || 0;

    const month = dateStr.substring(0, 7); // "2025-03"
    if (!months.has(month)) months.set(month, { month, sold: 0, unsold: 0 });

    const entry = months.get(month);
    if (status === 'sold') {
      entry.sold += count;
    } else if (status === 'unsold') {
      entry.unsold += count;
    }
    // "waiting to finish last auto-relisting" is excluded from recall calc
  }

  return Array.from(months.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(m => ({
      ...m,
      recallRate: (m.sold + m.unsold) > 0
        ? Math.round((m.unsold / (m.sold + m.unsold)) * 1000) / 10
        : 0,
    }));
}
