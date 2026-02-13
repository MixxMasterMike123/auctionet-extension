/**
 * HTML Escape Utility - SSoT Component
 * Prevents XSS by escaping user-controlled strings before insertion into innerHTML.
 */

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

/**
 * Escape a string for safe insertion into HTML content.
 * @param {string} str - The string to escape
 * @returns {string} HTML-safe string
 */
export function escapeHTML(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, c => ESCAPE_MAP[c]);
}
