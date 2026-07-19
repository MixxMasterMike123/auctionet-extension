/**
 * Artist Name Search Formatting - SSoT Component
 * Formats an artist name for use in Auctionet search queries: strips any
 * pre-existing quotes, trims trailing commas, and always wraps the result
 * in double quotes for exact-match search semantics.
 *
 * NOTE: modules/auctionet-api.js has its own formatArtistForSearch with
 * different behavior (only quotes multi-word names, does not strip
 * pre-existing quotes on input) and was intentionally left alone — see
 * consolidation notes.
 */

/**
 * @param {string} artistName
 * @returns {string} Quoted, cleaned artist name (or '' if invalid input)
 */
export function formatArtistForSearch(artistName) {
  if (!artistName || typeof artistName !== 'string') {
    return '';
  }

  // Remove any existing quotes and clean
  const cleanArtist = artistName.trim().replace(/^["']|["']$/g, '').replace(/,\s*$/, '');

  // Check if multi-word name (most artist names)
  const words = cleanArtist.split(/\s+/).filter(word => word.length > 0);

  if (words.length > 1) {
    // Multi-word: Always quote for exact matching
    return `"${cleanArtist}"`;
  } else {
    // Single word: Also quote for consistency in artist searches
    return `"${cleanArtist}"`;
  }
}
