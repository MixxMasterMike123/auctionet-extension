// modules/hyperrank/hyperrank-rank-check.js — measures actual search rank
// Uses the same fetch/cache conventions as modules/auctionet-api.js.
// Auctionet's default items.json order (no explicit sort param) IS relevance
// order — identical to sort=score on the site — so we can measure position.

const RANK_CACHE = new Map(); // query -> { data, fetchedAt }
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Extract the numeric item id from an edit-item page URL, e.g.
 * https://auctionet.com/admin/.../items/1234567/edit -> "1234567"
 */
function extractItemId(url) {
  if (!url) return null;
  const match = url.match(/\/items\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Pick the ~3 highest-intent unquoted terms from a title for the rank-check query.
 * Strips leading article-like markers and keeps it simple/unquoted per the plan.
 */
function extractCoreTerms(title, maxTerms = 3) {
  if (!title) return [];
  return title
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .join(' ')
    .split(/\s+/)
    .filter(w => w.length >= 3)
    .slice(0, maxTerms);
}

/**
 * Check this item's position in Auctionet's live relevance-ordered search results.
 * @param {string} title - current (post-apply) title value
 * @param {string} pageUrl - current page URL, used to extract the item id
 * @returns {Promise<{position: number|null, totalEntries: number}|null>}
 */
export async function checkRank(title, pageUrl) {
  const itemId = extractItemId(pageUrl);
  if (!itemId) return null;

  const coreTerms = extractCoreTerms(title);
  if (coreTerms.length === 0) return null;

  const query = coreTerms.join(' ');
  const cacheKey = `${itemId}_${query}`;

  const cached = RANK_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }

  try {
    const url = `https://auctionet.com/api/v2/items.json?q=${encodeURIComponent(query)}&per_page=50`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const items = data.items || [];
    const totalEntries = data.pagination?.total_entries ?? items.length;

    let position = null;
    for (let i = 0; i < items.length; i++) {
      const id = extractItemId(items[i].url);
      if (id === itemId) {
        position = i + 1;
        break;
      }
    }

    const result = { position, totalEntries };
    RANK_CACHE.set(cacheKey, { data: result, fetchedAt: Date.now() });
    return result;
  } catch (e) {
    console.warn('[HYPERRANK] Rank check request failed:', e.message);
    return null;
  }
}
