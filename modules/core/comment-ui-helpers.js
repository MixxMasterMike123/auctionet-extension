/**
 * Comment UI Helpers - SSoT Component
 * Shared rendering helpers for comment feeds/badges, used by both
 * admin-dashboard.js (main dashboard comment feed) and comment-enhancer.js
 * (universal comment badge + rich comments list on other admin pages).
 *
 * Pure functions, no DOM side effects — safe to import from classic
 * (non-module) content scripts via dynamic import(chrome.runtime.getURL(...)).
 */

/**
 * Initials for an avatar, from a full name.
 * @param {string} name
 * @returns {string} e.g. "JD" for "John Doe", "?" if empty
 */
export function getInitials(name) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Deterministic avatar background color from a name hash.
 * @param {string} name
 * @returns {string} hex color
 */
export function getAvatarColor(name) {
  const colors = ['#006ccc', '#28a745', '#dc3545', '#e65100', '#6f42c1', '#17a2b8', '#d4a017', '#5a6268'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Relative time label from Auctionet's Swedish "posted_at" text,
 * e.g. "13 feb 2026 kl. 13:52 CET" -> "2 tim sedan".
 * @param {string} postedAtText
 * @returns {string}
 */
export function relativeTimestamp(postedAtText) {
  const months = { jan: 0, feb: 1, mar: 2, apr: 3, maj: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11 };
  const match = postedAtText.match(/(\d{1,2})\s+(\w{3})\s+(\d{4})\s+kl\.\s*(\d{1,2}):(\d{2})/);
  if (!match) return postedAtText.replace(/^.*?(?=\d)/, '');
  const [, day, mon, year, hour, min] = match;
  const d = new Date(parseInt(year), months[mon.toLowerCase()] ?? 0, parseInt(day), parseInt(hour), parseInt(min));
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just nu';
  if (diffMins < 60) return `${diffMins} min sedan`;
  if (diffHours < 24) return `${diffHours} tim sedan`;
  if (diffDays === 1) return `Igår ${hour}:${min}`;
  if (diffDays < 7) return `${diffDays} dagar sedan`;
  return `${day} ${mon}`;
}

/**
 * Only allow relative admin links or http(s) URLs — blocks javascript: etc.
 * @param {string} href
 * @returns {string} the href if safe, otherwise ''
 */
export function safeHref(href) {
  if (!href) return '';
  if (/^\//.test(href)) return href;
  if (/^https?:\/\//i.test(href)) return href;
  return '';
}
