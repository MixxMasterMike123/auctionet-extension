/**
 * Shared parsing/normalization helpers used by FreetextParser and AIImageAnalyzer.
 * Each export below is the most capable of the two prior duplicate implementations
 * (a strict superset in input handling / word coverage), so consolidating here
 * can only make behavior more correct, never less.
 */

/**
 * Parse a numeric value from a string or number, handling Swedish comma decimals.
 * Superset of AIImageAnalyzer's integer-only `parseInt(value.replace(/[^\d]/g, ''))`,
 * which mangled decimal strings (e.g. "1500,50" -> 150050). This version correctly
 * treats ',' as a decimal separator and rounds to the nearest integer.
 * @param {string|number|null|undefined} value
 * @returns {number|null}
 */
export function parseNumericValue(value) {
  if (!value || value === null || value === undefined) return null;

  // Convert to string and clean up
  const cleaned = String(value)
    .replace(/[^\d,.-]/g, '') // Remove non-numeric characters except comma, dot, dash
    .replace(/,/g, '.')       // Replace comma with dot for decimals
    .trim();

  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '') return null;

  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : Math.round(parsed);
}

/**
 * Normalize a confidence value to the 0.0-1.0 range.
 * Superset of AIImageAnalyzer's version, which only handled `typeof === 'number'`;
 * this also accepts numeric strings via parseFloat.
 * @param {string|number|null|undefined} value
 * @returns {number}
 */
export function normalizeConfidence(value) {
  if (!value || value === null || value === undefined) return 0.5;

  const num = parseFloat(value);
  if (isNaN(num)) return 0.5;

  // Ensure 0-1 range
  return Math.max(0, Math.min(1, num));
}

/**
 * Check if a material is distinctive enough to include in a search query.
 * Union of both prior word lists (FreetextParser's list plus fårskinn, läder,
 * sammet, siden which only existed there).
 * @param {string} material
 * @returns {boolean}
 */
export function isDistinctiveMaterial(material) {
  if (!material) return false;

  const distinctiveMaterials = [
    'silver', 'guld', 'brons', 'koppar', 'mässing', 'tenn',
    'porslin', 'stengods', 'keramik', 'glas', 'kristall',
    'fårskinn', 'läder', 'sammet', 'siden',
    'marmor', 'granit', 'onyx', 'alabaster',
    'mahogny', 'ek', 'björk', 'teak', 'rosenträ'
  ];

  const lowerMaterial = material.toLowerCase();
  return distinctiveMaterials.some(dm => lowerMaterial.includes(dm));
}

/**
 * Extract a recognizable object type from a title, falling back to the first word.
 * Union of both prior word lists (FreetextParser's broader list plus 'bägare' and
 * 'figurin' which only existed in AIImageAnalyzer's list).
 * @param {string} title
 * @returns {string}
 */
export function extractObjectTypeFromTitle(title) {
  if (!title) return '';

  // Common Swedish auction object types
  const objectTypes = [
    'bägare', 'tavla', 'målning', 'litografi', 'grafik', 'teckning', 'akvarell',
    'skulptur', 'figurin', 'vas', 'skål', 'fat', 'tallrik', 'kopp', 'kanna',
    'lampa', 'ljusstake', 'spegel', 'klocka', 'ur', 'smycke', 'ring',
    'halsband', 'brosch', 'armband', 'porslin', 'keramik', 'glas',
    'silver', 'tenn', 'koppar', 'mässing', 'järn', 'trä', 'möbel',
    'stol', 'bord', 'skåp', 'byrå', 'soffa', 'fåtölj', 'matta',
    'textil', 'tyg', 'bok', 'karta', 'foto', 'vykort'
  ];

  const lowerTitle = title.toLowerCase();
  for (const type of objectTypes) {
    if (lowerTitle.includes(type)) {
      return type;
    }
  }

  // Fallback: use first word if no specific type found
  return title.split(/[,\s]+/)[0] || '';
}
