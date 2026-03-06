// data-cache.js — Manages cached analytics data in chrome.storage.local

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function cacheKey(companyId) {
  return `analytics_${companyId}`;
}

// Compress a raw API item to only the fields we need (~100 bytes vs ~2KB)
export function compressItem(raw) {
  const bids = raw.bids || [];
  const topBid = bids.length > 0 ? Math.max(...bids.map(b => b.amount)) : null;
  return {
    id: raw.id,
    p: topBid,                        // sold price (highest bid)
    e: raw.estimate || 0,             // estimate
    r: raw.reserve_amount || 0,       // reserve
    rm: raw.reserve_met || false,     // reserve met
    cat: raw.category_id,             // sub-category ID
    d: raw.ends_at,                   // end date (unix seconds)
    sb: raw.starting_bid_amount || 0, // starting bid
  };
}

export async function loadCache(companyId) {
  const key = cacheKey(companyId);
  const result = await chrome.storage.local.get([key]);
  const cached = result[key];
  if (!cached) return null;

  const age = Date.now() - cached.fetchedAt;
  return {
    items: cached.items,
    houseName: cached.houseName,
    fetchedAt: cached.fetchedAt,
    isExpired: age > CACHE_TTL,
    ageHours: Math.round(age / (60 * 60 * 1000) * 10) / 10,
  };
}

export async function saveCache(companyId, items, houseName) {
  const key = cacheKey(companyId);
  await chrome.storage.local.set({
    [key]: {
      items,
      houseName,
      fetchedAt: Date.now(),
    },
  });
}

export async function clearCache(companyId) {
  const key = cacheKey(companyId);
  await chrome.storage.local.remove([key]);
}

// Load list of previously fetched companies (for dropdown)
export async function getKnownCompanies() {
  const all = await chrome.storage.local.get(null);
  const companies = [];
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith('analytics_') && value.houseName) {
      const id = parseInt(key.replace('analytics_', ''));
      companies.push({ id, name: value.houseName, fetchedAt: value.fetchedAt });
    }
  }
  return companies.sort((a, b) => a.name.localeCompare(b.name, 'sv'));
}
