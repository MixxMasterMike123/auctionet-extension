# Spellcheck Overhaul — False Positives + Full Live-Auction Queue

**Goal:** Crush false positives (especially on the `/admin/sas` overview), check **every** live auction item once, then keep steady-state checks minimal. Free-only (no AI cost) per your decision.

---

## Phase 3 design — "ignore = learn" word whitelist (DECIDED 2026-06-23)

How the DB of valid words gets built, decided with the user:

**The existing ✕ (Ignorera) button IS the learning signal.** No new buttons. When an
employee dismisses a flagged entry, the system records the **flagged word(s)** as
correctly spelled → the shared `spellcheck_whitelist` (Cloudflare D1). The act of
dismissing = "this word is fine." Applies equally to the "change word" case (e.g.
`"bemålning" → "oljemålning"` from the real screenshot): the suggestion is garbage,
the **left-side original** (`bemålning`) is the truth we save.

**Confidence tiers** (LT's suggestion quality tells us how sure to be):
- **"Suggestion is a different word, not a typo fix"** → near-certain false positive →
  **instant whitelist (threshold 1)**. Detect via: large edit distance OR different
  stem OR the "correction" is longer/unrelated (the `bemålning→oljemålning` signature).
- **"Suggestion is a plausible near-edit"** (1-2 char Levenshtein, same stem) → could be
  a real typo someone's skipping → safer **threshold 3** (needs N independent ignores).

**Pre-seed the whitelist** (status=`active`) before humans touch it, so the DB starts
mostly-full and people only adjudicate the genuine long-tail:
- **Artist/maker names** — harvested from the `artist` field of all live items (every
  real auction carries correctly-spelled names). Highest-value, zero-curation source.
- **Brand list** — from `brand-validation-manager.js`.
- **Auction terms** — from `swedish-spellchecker.js` (`auctionTerms`).
- NB: `bemålning` is in NONE of these today (verified) — proof that seed alone is
  insufficient and the auto-learning loop is required for the tail.

**Guardrail (the one real failure mode):** auto-whitelisting a genuine typo would hide
it forever. Mitigations: (1) the confidence tiers above keep plausible-typos at
threshold 3; (2) a small **"Granska ordlista"** review view (on the standalone audit
page) to yank a wrongly-added word back out (`status='rejected'`).

**Capture plumbing (the gap to close):** today the scanner flattens spelling errors into
a display string (`Stavfel: "x" → "y"`) at `publication-scanner-bg.js:232` and **discards
the structured `{word, correction}` pairs** before the dashboard sees them. Fix: carry the
structured array on the issue object through to the ✕ button so it can POST each `word`
to `/whitelist` on dismissal.

**At check time:** the active whitelist is loaded (cached locally, periodic refresh) and
applied as a pre-filter alongside the bundled dictionaries → a whitelisted word never
flags again, on any item, for anyone. This is what makes steady-state converge.

---

## TL;DR — what's actually wrong

The infrastructure for the queue **already exists** (background scanner, chrome.alarms, the standalone `spelling-audit.html` page that already enumerates all live items, a two-tier cache). The real problem is **the noise filter is too weak**, and the **shared learning layer may not even be running**.

Three root causes of the false-positive firehose, confirmed in code:

1. **LanguageTool's unknown-word rule is on.** The request ([publication-scanner-bg.js:377-378](../../publication-scanner-bg.js#L377)) disables grammar/style/casing but **not** `MORFOLOGIK_RULE_SV_SE` — the rule that flags every word not in LT's small Swedish dictionary. That means **every brand, artist name, foreign loanword, and auction term gets flagged.** This single rule is ~80% of the noise.
2. **The whitelist is ~25 hardcoded words** ([swedish-spellchecker.js:287-300](../../modules/swedish-spellchecker.js#L287)). Auction Swedish has thousands of valid proper nouns and loanwords. A static list can't keep up.
3. **The only proper-noun defense is one narrow regex** ([publication-scanner-bg.js:420](../../publication-scanner-bg.js#L420)): it rejects a Title-Case word but lets through lowercased flags mid-sentence, ALL-CAPS artist names, and foreign terms in running text.

Plus a silent-failure risk you correctly suspected — which we're now resolving by **leaving Supabase entirely**:

4. **The shared Supabase layer is coded but unreliable.** `spellcheck_cache` (scanner) and `spellcheck_ignored` (dashboard) are fully wired, but gated behind the **SaS-Outlet credentials** and **every failure is swallowed with `console.warn`** ([publication-scanner-bg.js:330-353](../../publication-scanner-bg.js#L330)). Worse for *this* use case: **Supabase free-tier auto-pauses projects after a few days of inactivity** — fatal for a shared cache that must be reachable from every employee's browser, especially over Swedish vacation weeks. **Decision: migrate the spellcheck backend to Cloudflare** (Worker + D1), which has no auto-pause, far higher free read/write limits, and trivial multi-project setup.

---

## Phase 0 — Migrate the shared backend: Supabase → Cloudflare Worker + D1

**Why first:** Everything shared (cache, ignores, the Phase-3 whitelist) needs a backend that's actually up. This replaces Supabase with a Cloudflare stack you control. The migration is small because the extension already funnels *all* Supabase traffic through **one function** — `supabaseFetch` in [background.js:386-417](../../background.js#L386), exposed as `globalThis.__supabaseFetch` + a `supabase-fetch` message handler. The scanner, dashboard, and audit page never touch Supabase directly. **So we rewrite one function and stand up one Worker — the rest of the code is untouched.**

### Decisions locked in
- **Storage: Cloudflare D1 (serverless SQLite).** Keeps the existing SQL/table model → near-mechanical port. Makes Phase-3 whitelist promotion a simple `SELECT COUNT(...)`.
- **Auth: open writes + rate limiting.** No secrets to manage. The Worker rate-limits per IP and **validates payload shape**, so it can only ever write well-formed rows. Reads are public. Worst case (junk whitelist words) is low-stakes and recoverable via the Phase-3 whitelist-review view.

### Steps
1. **Stand up the Worker + D1** (separate small repo or `workers/` dir in this project):
   - D1 schema — three tables, ported from the Supabase DDL:
     ```sql
     CREATE TABLE spellcheck_cache (
       item_id INTEGER PRIMARY KEY,
       text_hash TEXT NOT NULL,
       results TEXT NOT NULL DEFAULT '[]',   -- JSON string
       checked_at TEXT NOT NULL,
       checked_by TEXT
     );
     CREATE TABLE spellcheck_ignored (
       item_id INTEGER PRIMARY KEY,
       ignored_at TEXT NOT NULL
     );
     CREATE TABLE spellcheck_whitelist (        -- new, for Phase 3
       word TEXT PRIMARY KEY,
       ignore_count INTEGER NOT NULL DEFAULT 1,
       status TEXT NOT NULL DEFAULT 'pending',  -- pending | active | rejected
       added_by TEXT, added_at TEXT, promoted_at TEXT
     );
     ```
   - Worker routes (small REST surface, CORS-enabled for the extension origin):
     - `GET  /cache?item_id=&hash=` → results or 404
     - `POST /cache` `{item_id, text_hash, results}` → upsert
     - `GET  /ignored` → list of item_ids
     - `POST /ignored` `{item_id}` / `DELETE /ignored?item_id=`
     - `GET  /whitelist?status=active` → words (Phase 3)
     - `POST /whitelist` `{word}` → insert-or-increment `ignore_count` (Phase 3)
   - Rate limit + payload-shape validation on all writes.
2. **Replace the one chokepoint.** Rewrite `supabaseFetch` → `spellcheckBackendFetch` (same signature so callers don't change), pointing at the Worker base URL with the new route shapes. Keep `globalThis.__supabaseFetch` as an alias initially so nothing breaks mid-migration, then rename cleanly. The two call sites that build Supabase REST paths (`/rest/v1/spellcheck_*`) get repointed to the Worker routes — that's `publication-scanner-bg.js` (cache) and `admin-dashboard.js` (ignored).
3. **Config:** replace the `outletSupabase*` keys *for spellcheck* with a single `spellcheckWorkerUrl` in `chrome.storage.local` + a popup field. (Leave the SaS-Outlet Supabase config alone — that's a separate system and out of scope.)
4. **Visible health signal.** Surface backend status in the scanner result object (`sharedBackend: 'ok' | 'unconfigured' | 'error: <msg>'`) instead of a silent `console.warn`, so it can never silently die again.
5. **`manifest.json`:** add the Worker domain to `host_permissions`; drop nothing.

**Deliverable:** a Cloudflare-backed shared spellcheck store that never pauses, with a visible health indicator. No change to scanner/dashboard/audit logic beyond the repointed base URL + routes.

**Note on data migration:** the existing Supabase `spellcheck_cache`/`spellcheck_ignored` rows are just a cache — **no migration needed**. They repopulate naturally on the next scan (and the Phase-4 full sweep rebuilds everything anyway). If you want a warm start, a one-off export→import script is trivial but optional.

---

## Phase 1 — Kill the firehose (biggest win, lowest effort)

Fix the LanguageTool layer so it stops flagging unknown-but-valid words.

1. **Suppress the unknown-word rule.** In `checkSpellingLanguageTool` ([publication-scanner-bg.js:373-379](../../publication-scanner-bg.js#L373)) and the twin in `spelling-audit.js`, add `disabledRules: 'MORFOLOGIK_RULE_SV_SE'` **and** keep real typo rules. Trade-off: MORFOLOGIK also catches *some* genuine unknown-word typos. We don't lose those — we route them through our own dictionary + heuristics (below), which we control. Net: we trade LT's indiscriminate unknown-word flagging for a curated version.
   - *Alternative if disabling is too blunt:* keep MORFOLOGIK on but treat its matches as **low-confidence** — only surface them if they ALSO fail our heuristics (Phase 2). Decide empirically in Phase 4 against the golden set.
2. **Send fields separately, not concatenated.** Today title+description+condition are joined into one blob ([publication-scanner-bg.js](../../publication-scanner-bg.js)), so a foreign term in the description pollutes context and offsets are ambiguous. Check each field independently (the audit page already tracks per-field offsets — reuse that). Lets us apply **stricter rules to titles, looser to descriptions** (descriptions legitimately contain foreign quotes, makers' marks, inscriptions).
3. **Strip non-prose before checking:** measurements (`12,5 cm`, `H 30`), model/serial numbers (`SH-101`, `Ø 12`), years, pure-number tokens, and inscription quotes (text in « », " ", '...'). These are never typos and generate constant noise.

**Expected impact:** ~70-85% fewer flags immediately, before any whitelist work.

---

## Phase 2 — Curated dictionaries + smarter heuristics (the durable fix)

Build the domain knowledge LanguageTool lacks. All free, all local (bundled in the extension), with the shared layer for the parts that grow.

1. **Bundled whitelists** (static JSON, shipped with the extension, version-controlled):
   - **Auction terms** — expand the current ~80 to a proper list (furniture, ceramics, glass, textiles, jewelry, art-period, technique, condition vocabulary). Source from the existing `auction-catalog` / `auction-domain` skills.
   - **Foreign loanwords used in Swedish cataloging** — Rococo, Empire, Biedermeier, Art Nouveau/Deco, jugend, faïence, etc.
   - **Brands & makers** — reuse whatever the `inline-brand-validator` brand list already has; don't duplicate.
   - **Artist-name handling** — don't try to list all artists. Instead: a word that appears in the item's **artist field**, or matches the title's ALL-CAPS leading name, is never a typo.
2. **Heuristic upgrades** (replace the single regex at line 420):
   - Proper-noun detection: Title-Case OR ALL-CAPS, preceded by initial (`E. Jarup`), adjacent to another capitalized word, or after a comma in a title → skip.
   - Loanword/diacritic tolerance: reuse `differOnlyInDiacritics()` from the inline validator ([inline-brand-validator.js:1011](../../modules/inline-brand-validator.js#L1011)).
   - Compound-word guard: if LT's "correction" only inserts a space or hyphen into the original, it's a compound false positive — skip.
   - Abbreviation list: `bl.a`, `ca`, `c:a`, `resp.`, `osv`, `nr.`, `inkl.`, `ev.`, `mfl`, etc.
3. **De-dupe vs inline validator.** The edit-page inline validator already has proper-name logic, brand lists, and safe-word filtering. **Extract the shared logic into one module** (`modules/spellcheck-filters.js`) used by both the background scanner and the inline validator, so we fix false positives in **one** place and both paths benefit. (Today they diverge — the scanner uses LanguageTool, inline uses Haiku — but the *filtering* should be shared.)

**Deliverable:** one shared filtering module + bundled dictionaries; both the overview scanner and the edit-page validator get quieter together.

---

## Phase 3 — The self-healing whitelist (steady-state convergence)

This is what makes "check everything once, then maintenance is minimal" actually true. **Deferred until you pick a steady-state policy** (the question that got interrupted — see "Open decision" below).

Mechanism (free, no AI) — runs on the **Cloudflare D1** backend from Phase 0:
1. Shared table `spellcheck_whitelist` (already in the Phase-0 schema). When an employee clicks **"Ignorera"**, in addition to (or instead of) the per-item ignore, the **word** is sent to `POST /whitelist`, which inserts it (`status='pending'`) or increments `ignore_count`.
2. At check time, the active whitelist (`GET /whitelist?status=active`) is loaded (cached locally, refreshed periodically) and applied as a pre-filter — same place as the bundled dictionaries, just dynamic.
3. **Promotion policy = your call** (the interrupted question) — trivial to implement on D1 via the `ignore_count`/`status` columns:
   - *Aggressive:* one ignore → `status='active'` immediately. Fast convergence, small risk of masking a real typo that shares the word.
   - *Balanced:* word flips to `active` once `ignore_count >= N` (e.g. 3) or you approve it. Slower, near-zero masking risk. **Recommended.**
   - *Conservative:* keep per-item only, no word learning. Noise never fully converges.
4. **Mistake recovery:** a small "review whitelist" view (could live on the standalone audit page) to remove a word that was wrongly whitelisted.

**Why it converges:** after the one-time full sweep, the only new flags are (a) genuine new typos in newly-cataloged items, and (b) genuinely new valid words not yet whitelisted — which get whitelisted once and never reappear. The long tail flattens to near-zero.

---

## Phase 4 — The full live-auction queue (one-time sweep + incremental)

The hard part is already solved by existing patterns; we assemble them.

1. **Enumerate all live items.** Reuse the analytics `data-fetcher` pagination/sharding pattern, but **without `is=ended`** (so it returns live/published items). `spelling-audit.js` already does exactly this fetch ([spelling-audit.js:184-210](../../spelling-audit.js#L184)). For houses >10k live items, the category-sharding fallback already exists. Queue size is known up front via the Dashboard API `published` count.
2. **Process in the background service worker.** Model it on `runBackgroundPublicationScan` ([publication-scanner-bg.js:455](../../publication-scanner-bg.js#L455)): batches of 5, LanguageTool rate-limiter (already built: 20 req/min, 75k chars/min), resumable via a stored cursor.
3. **Persist results + progress** in `chrome.storage.local` (already `unlimitedStorage`) and the shared `spellcheck_cache` (text-hash keyed, so re-checks are skipped when text is unchanged — already implemented).
4. **One-time sweep UX.** A "Check all live auctions" button (popup or audit page) with progress (`N / total`), pausable/resumable. Off-hours-friendly via the existing cooldown logic.
5. **Incremental maintenance.** Reuse the `fetchIncremental` pattern ([data-fetcher.js:89-140](../../modules/analytics/data-fetcher.js#L89)) on the existing 30-min alarm: only newly-published items (unseen IDs) or items whose text-hash changed get re-checked. Everything else is a cache hit → ~free.

**Tuning loop:** before declaring done, assemble a **golden set** of ~50-100 real items with hand-labeled true/false positives. Measure precision/recall before vs after each phase. This is how we prove the filtering actually helps and doesn't start hiding real typos.

---

## Open decision (was interrupted)

**Steady-state whitelist policy** for Phase 3 — Aggressive / Balanced / Conservative (above). I recommend **Balanced** (promote a word once `ignore_count >= 3`, with a recovery view). It converges nearly as fast as Aggressive with almost no risk of masking real typos. We can ship Phases 1 + 0 + 2 without resolving this — they're noise reduction / infra with no learning policy attached.

---

## Sequencing & risk

| Phase | Effort | Risk | Payoff |
|---|---|---|---|
| 0 — Migrate backend to Cloudflare Worker + D1 | S–M | low | No more pausing/silent-death; backend we control |
| 1 — Fix LanguageTool (MORFOLOGIK, per-field, strip non-prose) | S | low | **~70-85% fewer flags immediately** |
| 2 — Dictionaries + shared filter module | M | low | Durable, fixes both scanner + inline |
| 3 — Self-healing whitelist | M | low-med (policy-dependent) | Steady-state convergence |
| 4 — Full queue + incremental | M | low (patterns exist) | "Check everything once, maintain cheaply" |

**Recommended order:** 1 → 0 → 4 (sweep with the much-quieter checker) → 2 → 3. Rationale: **Phase 1 is independent of the backend and delivers ~80% of the relief on its own** (pure filter tweaks, local), so do it first for immediate impact. Then stand up Cloudflare (0), run the full sweep (4) to build a real corpus, and tune dictionaries (2) + seed the whitelist (3) against actual data rather than guesses. (Phase 1 can ship while still pointed at Supabase or with the shared layer disabled — it doesn't care what the backend is.)

**No destructive changes.** Phase 0 swaps the backend behind a single existing chokepoint (one rewritten function + one new Worker) — scanner/dashboard/audit logic is untouched. The SaS-Outlet Supabase system is left entirely alone (separate concern). Everything else is additive or a filter tweak; the existing per-item ignore and local caches stay intact. Each phase is independently shippable and independently revertable.

## Cloudflare setup checklist (Phase 0, one-time)
- `npm create cloudflare@latest` → Worker (or add `workers/spellcheck/` here)
- `wrangler d1 create spellcheck` → bind in `wrangler.toml`
- Apply the 3-table schema via `wrangler d1 execute`
- Implement routes + CORS (`Access-Control-Allow-Origin` for the extension) + per-IP rate limit + payload validation
- `wrangler deploy` → note the `*.workers.dev` URL (or a custom domain)
- Put the URL in `chrome.storage.local.spellcheckWorkerUrl` via the popup; add the domain to `manifest.json` `host_permissions`
- Free tier headroom: D1 ~5M reads/day + 100k writes/day, Workers 100k req/day — orders of magnitude above this workload, and **never auto-pauses**.
