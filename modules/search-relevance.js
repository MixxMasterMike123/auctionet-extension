// search-relevance.js — Matches live buyer search terms to item data
// Used on the edit page to show "Köpare söker just nu: [relevant terms]"

export class SearchRelevanceMatcher {
  /**
   * Match live search terms against current item data.
   * @param {Array} searches - Combined searches from shared + company streams
   * @param {Object} itemData - { title, category, artist, keywords }
   * @returns {Array} Top matches sorted by score × count: [{ query, count, category, score }]
   */
  matchSearchesToItem(searches, itemData) {
    if (!searches || searches.length === 0 || !itemData) return [];

    const title = (itemData.title || '').toLowerCase();
    const category = (itemData.category || '').toLowerCase();
    const artist = (itemData.artist || '').toLowerCase();
    const keywords = (itemData.keywords || '').toLowerCase();
    const allText = `${title} ${category} ${artist} ${keywords}`;

    const matches = [];

    for (const s of searches) {
      if (!s.query || s.ended) continue; // Skip historical searches

      const q = s.query.toLowerCase().trim();
      if (q.length < 2) continue; // Skip single-char queries

      let score = 0;

      // Exact match in title (highest relevance)
      if (title.includes(q)) score += 3;
      // Match in artist
      else if (artist && artist.includes(q)) score += 3;
      // Match in keywords
      else if (keywords.includes(q)) score += 2;
      // Match in category
      else if (category.includes(q)) score += 1;
      // Partial word match: any word in query matches any word in item
      else {
        const queryWords = q.split(/\s+/).filter(w => w.length >= 3);
        const matchedWords = queryWords.filter(w => allText.includes(w));
        if (matchedWords.length > 0) {
          score += matchedWords.length / queryWords.length; // Partial score
        }
      }

      if (score > 0) {
        matches.push({
          query: s.query,
          count: s.count || 0,
          category: s.category || null,
          score
        });
      }
    }

    // Sort by score × count (relevance × demand), take top 5
    return matches
      .sort((a, b) => (b.score * Math.max(b.count, 1)) - (a.score * Math.max(a.count, 1)))
      .slice(0, 5);
  }
}
