// modules/spellcheck-ai-prompt.js - Shared AI spellcheck prompt (SSOT)
// Used by both the edit-page inline validator (inline-brand-validator.js) and
// the background publication scanner (publication-scanner-bg.js), so both
// surfaces send the identical request and give identical verdicts.

export const SPELLCHECK_MODEL = 'claude-haiku-5-5';
export const SPELLCHECK_MAX_TOKENS = 400;

export const SPELLCHECK_SYSTEM_PROMPT = 'Du är en expert på svensk stavning och auktionsterminologi. Hitta felstavade ord — inklusive objekttyper, material och substantiv. Rapportera INTE grammatik, interpunktion, förkortningar eller korrekta facktermer. Svara BARA med valid JSON.';

export function buildSpellcheckPrompt(text, fieldLabel) {
  return `Kontrollera stavningen i denna auktions-${fieldLabel} på svenska:
"${text}"

Hitta enskilda ord som är felstavade. Exempel:
- "Colier" → "Collier"
- "silverr" → "silver"
- "olija" → "olja"
- "brutovikt" → "bruttovikt"
- "Jardinjär" → "Jardinär"
- "kandelabrer" → "kandelaber"

Kontrollera ALLA ord noggrant — även objekttyper, materialnamn och svenska substantiv.

RAPPORTERA INTE:
- Grammatik, interpunktion, kommatering
- Förkortningar (ink, bl.a, osv, resp, ca)
- Personnamn, ortnamn, varumärken
- Versaler/gemener-fel
- Korrekta böjningsformer (hängd, längd, höjd, märkt)
- Auktionsfacktermer: plymå, karott, karaff, tablå, terrin, skänk, chiffonjé,
  röllakan, tenn, emalj, porfyr, intarsia, gouache, applique, pendyl, boett,
  collier, rivière, cabochon, pavé, solitär, entourage

Svara BARA med JSON:
{"issues":[{"original":"felstavat","corrected":"korrekt","confidence":0.95}]}`;
}

// Returns [{ original, corrected, confidence }] or [] on any parse failure.
export function parseSpellcheckResponse(responseText, minConfidence = 0.8) {
  try {
    const jsonMatch = String(responseText || '').trim().match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const result = JSON.parse(jsonMatch[0]);
    if (!result.issues || !Array.isArray(result.issues)) return [];
    return result.issues
      .filter(issue => issue && issue.original && issue.corrected &&
              issue.original.toLowerCase() !== issue.corrected.toLowerCase() &&
              (issue.confidence || 0.9) >= minConfidence)
      .map(issue => ({
        original: issue.original,
        corrected: issue.corrected,
        confidence: issue.confidence || 0.9
      }));
  } catch (e) {
    return [];
  }
}
