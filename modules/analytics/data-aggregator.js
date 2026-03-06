// data-aggregator.js — Computes KPIs, distributions, and trends from compressed items

import { getCategoryName, getParentCategoryId } from './category-registry.js';

/**
 * Filter items by date range and category
 * @param {Array} items - compressed items [{id, p, e, r, rm, cat, d, sb}]
 * @param {Object} filters - { year, month, categoryId }
 */
export function filterItems(items, filters = {}) {
  return items.filter(item => {
    const date = new Date(item.d * 1000);

    if (filters.year && date.getFullYear() !== filters.year) return false;
    if (filters.month != null && date.getMonth() !== filters.month) return false;
    if (filters.categoryId && getParentCategoryId(item.cat) !== filters.categoryId) return false;

    return true;
  });
}

/**
 * Compute hero KPIs from a set of items
 */
export function computeKPIs(items) {
  if (items.length === 0) {
    return { count: 0, revenue: 0, avgPrice: 0, medianPrice: 0 };
  }

  const prices = items.map(i => i.p).sort((a, b) => a - b);
  const revenue = prices.reduce((sum, p) => sum + p, 0);
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 === 0
    ? Math.round((prices[mid - 1] + prices[mid]) / 2)
    : prices[mid];

  return {
    count: items.length,
    revenue,
    avgPrice: Math.round(revenue / items.length),
    medianPrice: median,
  };
}

/**
 * Compute YoY comparison (requires previous year's items)
 */
export function computeYoY(currentKPIs, previousKPIs) {
  if (!previousKPIs || previousKPIs.count === 0) return null;

  function pctChange(curr, prev) {
    if (!prev) return null;
    return Math.round(((curr - prev) / prev) * 1000) / 10;
  }

  return {
    count: pctChange(currentKPIs.count, previousKPIs.count),
    revenue: pctChange(currentKPIs.revenue, previousKPIs.revenue),
    avgPrice: pctChange(currentKPIs.avgPrice, previousKPIs.avgPrice),
    medianPrice: pctChange(currentKPIs.medianPrice, previousKPIs.medianPrice),
  };
}

/**
 * Compute monthly breakdown for a given year
 */
export function computeMonthlyData(items, year) {
  const months = Array.from({ length: 12 }, () => ({ items: [], revenue: 0 }));

  for (const item of items) {
    const date = new Date(item.d * 1000);
    if (date.getFullYear() !== year) continue;
    const m = date.getMonth();
    months[m].items.push(item);
    months[m].revenue += item.p;
  }

  return months.map((m, i) => ({
    month: i,
    count: m.items.length,
    revenue: m.revenue,
    avgPrice: m.items.length > 0 ? Math.round(m.revenue / m.items.length) : 0,
  }));
}

/**
 * Compute price distribution
 */
export function computePriceDistribution(items) {
  const brackets = [
    { label: '300 kr', min: 0, max: 300 },
    { label: '301–500', min: 301, max: 500 },
    { label: '501–1 000', min: 501, max: 1000 },
    { label: '1 001–2 000', min: 1001, max: 2000 },
    { label: '2 001–5 000', min: 2001, max: 5000 },
    { label: '5 001–10 000', min: 5001, max: 10000 },
    { label: '10 000+', min: 10001, max: Infinity },
  ];

  const total = items.length || 1;

  return brackets.map(b => {
    const count = items.filter(i => i.p >= b.min && i.p <= b.max).length;
    return {
      label: b.label,
      count,
      pct: Math.round((count / total) * 1000) / 10,
      revenue: items.filter(i => i.p >= b.min && i.p <= b.max).reduce((s, i) => s + i.p, 0),
    };
  });
}

/**
 * Compute category breakdown
 */
export function computeCategoryBreakdown(items) {
  const catMap = new Map();

  for (const item of items) {
    const parentId = getParentCategoryId(item.cat);
    const name = getCategoryName(item.cat);

    if (!catMap.has(parentId)) {
      catMap.set(parentId, { id: parentId, name, count: 0, revenue: 0, prices: [] });
    }
    const cat = catMap.get(parentId);
    cat.count++;
    cat.revenue += item.p;
    cat.prices.push(item.p);
  }

  // Compute avg price and sort by count
  const result = Array.from(catMap.values()).map(c => ({
    ...c,
    avgPrice: Math.round(c.revenue / c.count),
    prices: undefined, // don't carry the array
  }));

  return result.sort((a, b) => b.count - a.count);
}

/**
 * Compute price point analysis (key business metric)
 */
export function computePricePoints(items) {
  const total = items.length || 1;
  const atMinBid = items.filter(i => i.p === 300).length;
  const under500 = items.filter(i => i.p < 500).length;
  const over500 = items.filter(i => i.p >= 500).length;
  const over1000 = items.filter(i => i.p >= 1000).length;
  const over5000 = items.filter(i => i.p >= 5000).length;

  return {
    atMinBid: { count: atMinBid, pct: Math.round((atMinBid / total) * 1000) / 10 },
    under500: { count: under500, pct: Math.round((under500 / total) * 1000) / 10 },
    over500: { count: over500, pct: Math.round((over500 / total) * 1000) / 10 },
    over1000: { count: over1000, pct: Math.round((over1000 / total) * 1000) / 10 },
    over5000: { count: over5000, pct: Math.round((over5000 / total) * 1000) / 10 },
  };
}

/**
 * Get available years from the dataset
 */
export function getAvailableYears(items) {
  const years = new Set();
  for (const item of items) {
    years.add(new Date(item.d * 1000).getFullYear());
  }
  return Array.from(years).sort((a, b) => b - a);
}
