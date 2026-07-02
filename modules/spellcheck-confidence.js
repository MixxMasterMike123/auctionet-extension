// modules/spellcheck-confidence.js — shared confidence classifier for the
// self-healing spellcheck whitelist (Cloudflare Worker + D1).
//
// Used by the background publication scanner, the edit-page inline validator
// and the standalone spelling-audit page, so every "Ignorera" click classifies
// the dismissed flag the same way. The Worker promotes 'different-word' to the
// active whitelist on the FIRST dismissal, 'near-edit' only after several
// independent ones (a small edit could be a real typo someone is skipping).

// Classify a flag's confidence as a false positive, from the suggestion shape.
// "different word" (bemålning→oljemålning) ⇒ near-certain false positive ⇒
// instant whitelist. "near-edit" (byrä→byrå) ⇒ might be a real typo ⇒ needs N
// independent dismissals. Returns 'different-word' | 'near-edit'.
export function classifyFlag(word, correction) {
  if (!word || !correction) return 'near-edit';
  const w = word.toLowerCase(), c = correction.toLowerCase();
  const dist = levenshtein(w, c);
  let prefix = 0;
  for (let i = 0; i < Math.min(w.length, c.length); i++) {
    if (w[i] === c[i]) prefix++; else break;
  }

  // ── Strong "different word" signals (checked FIRST, before edit distance) ──
  // A genuine typo fix keeps the start of the word and the same letters. When
  // the suggestion violates that, it's a different word — an obvious false
  // positive — even if the edit distance is small.

  // Anagram: same letters reordered (nagg → gagn). Never a spelling fix.
  const sortLetters = s => s.split('').sort().join('');
  if (w.length === c.length && sortLetters(w) === sortLetters(c)) return 'different-word';

  // Shares no leading letters (prefix 0) — a typo fix almost always preserves
  // the first letter or two (byrä→byrå, signerat→signerad). prefix 0 means a
  // different stem (nagg→gagn, bemålning→oljemålning).
  if (prefix === 0) return 'different-word';

  // Big edit, or the suggestion is wholesale longer/different.
  if (dist >= 3 || c.length > w.length + 2) return 'different-word';

  // ── Otherwise: small edit that preserves the stem ⇒ plausible real typo ──
  return 'near-edit';
}

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}
