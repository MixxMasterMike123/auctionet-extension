// modules/spellcheck-whitelist.js — client for the shared spellcheck whitelist
// (Cloudflare Worker + D1), for content scripts and extension pages.
//
// All traffic goes through the background service worker's 'spellcheck-fetch'
// message — the one place that knows the Worker URL. The background scanner
// has its own loader (loadLearnedWhitelist in publication-scanner-bg.js)
// since it can call __spellcheckFetch directly.
//
// The whitelist is the "ignore = learn" loop: a word an employee dismissed is
// recorded and — once promoted — never flags again, on any item, for anyone.

import { classifyFlag } from './spellcheck-confidence.js';

const WHITELIST_TTL_MS = 30 * 60 * 1000;
const FAILURE_RETRY_MS = 60 * 1000; // negative cache: don't hammer a dead backend

// Mirror of the Worker's charset rule (postWhitelist) — a word the Worker
// would reject must not be optimistically hidden locally, or the flag
// silently reappears after the next cache refresh.
const VALID_WORD_RE = /^[\p{L}][\p{L}\-'.]*$/u;

let cachedSet = null;   // Set<string> of lowercase active words
let fetchedAt = 0;
let failedAt = 0;
let inflight = null;

function extensionAlive() {
  try { return !!(chrome.runtime && chrome.runtime.id); }
  catch (e) { return false; }
}

// Never throws "Extension context invalidated" (old content script outliving
// an extension reload) — resolves null on any failure instead.
function safeSendMessage(msg) {
  if (!extensionAlive()) return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(msg, resp => {
        void chrome.runtime.lastError;
        resolve(resp ?? null);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

// The active shared whitelist as a Set of lowercase words. Returns an empty
// Set when the backend is unconfigured/unreachable — spellcheck then simply
// runs unfiltered (fail open, never block validation on the network).
export async function getSharedWhitelist(force = false) {
  const fresh = Date.now() - fetchedAt < WHITELIST_TTL_MS;
  if (cachedSet && fresh && !force) return cachedSet;
  if (inflight) return inflight;
  // Negative cache: after a failed fetch (backend down/unconfigured), don't
  // retry from hot paths (every debounced field validation) for a minute —
  // a configured-but-down Worker costs a full network timeout per attempt.
  if (!force && Date.now() - failedAt < FAILURE_RETRY_MS) {
    return cachedSet || (cachedSet = new Set());
  }
  inflight = (async () => {
    try {
      const resp = await safeSendMessage({
        type: 'spellcheck-fetch', method: 'GET', path: '/whitelist?status=active'
      });
      if (resp?.success && Array.isArray(resp.data)) {
        cachedSet = new Set(
          resp.data.map(r => (r.word || '').toLowerCase()).filter(Boolean)
        );
        fetchedAt = Date.now();
        failedAt = 0;
      } else {
        failedAt = Date.now();
      }
    } finally {
      inflight = null;
    }
    return cachedSet || (cachedSet = new Set()); // fail open: empty until a fetch succeeds
  })();
  return inflight;
}

// "Ignorera" = learning signal. Record the dismissed word in the shared
// whitelist with a confidence derived from the suggestion shape (see
// classifyFlag). Fire-and-forget: failures are invisible — the local
// per-session ignore still applies either way.
export function reportIgnoredWord(word, correction) {
  const w = (word || '').trim();
  // Single tokens only — the whitelist is per-word (skips e.g. a dismissed
  // full artist-name capitalization suggestion).
  if (!w || /\s/.test(w) || w.length > 100) return;
  // Words the Worker would reject (digits, symbols) stay session-ignored
  // only — never optimistically cached, never POSTed.
  if (!VALID_WORD_RE.test(w)) return;
  if (cachedSet) cachedSet.add(w.toLowerCase()); // optimistic: hide it now
  const addedByEl = document.querySelector('.site-header__employee-name');
  safeSendMessage({
    type: 'spellcheck-fetch', method: 'POST', path: '/whitelist',
    body: {
      word: w,
      confidence: classifyFlag(w, correction || ''),
      added_by: addedByEl ? addedByEl.textContent.trim() || null : null
    }
  });
}
