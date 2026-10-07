# Auctionet Spellcheck Backend (Cloudflare Worker + D1)

Shared spellcheck store for the Chrome extension. Replaces the previous
Supabase-backed `spellcheck_cache` / `spellcheck_ignored` tables (Supabase free
tier auto-pauses → unreliable). D1 never pauses; reads are public; writes are
open but rate-limited and shape-validated.

## One-time deploy

Run these from `workers/spellcheck/`. You must be logged into the **Stadsauktion**
Cloudflare account in the CLI.

```bash
# 1. Authenticate the CLI (opens a browser — pick the Stadsauktion account)
npx wrangler login

# 2. Create the D1 database
npx wrangler d1 create auctionet-spellcheck
#    → copy the printed  database_id  into wrangler.toml (replace PASTE_DATABASE_ID_HERE)

# 3. Create the tables in the remote DB
npx wrangler d1 execute auctionet-spellcheck --remote --file=schema.sql

# 4. Deploy the Worker
npx wrangler deploy
#    → note the deployed URL, e.g.  https://auctionet-spellcheck.<subdomain>.workers.dev
```

Then paste that Worker URL into the extension popup (Spellcheck backend URL field),
which stores it in `chrome.storage.local.spellcheckWorkerUrl`.

## Smoke test

```bash
BASE=https://auctionet-spellcheck.<subdomain>.workers.dev

curl "$BASE/health"
# {"ok":true,"service":"spellcheck",...}

# write + read a cache row
curl -X POST "$BASE/cache" -H 'Content-Type: application/json' \
  -d '{"item_id":1,"text_hash":"abc","results":[{"word":"hte","correction":"the"}]}'
curl "$BASE/cache?item_id=1&hash=abc"

# ignored
curl -X POST "$BASE/ignored" -H 'Content-Type: application/json' -d '{"item_id":1}'
curl "$BASE/ignored"
curl -X DELETE "$BASE/ignored?item_id=1"

# whitelist (POST same word 3× → promotes to active)
curl -X POST "$BASE/whitelist" -H 'Content-Type: application/json' -d '{"word":"Rococo"}'
curl "$BASE/whitelist?status=all"
```

## API

| Method | Path | Body / Query | Purpose |
|---|---|---|---|
| GET  | `/cache?item_id=&hash=` | — | results (200) or 404 if missing/stale |
| POST | `/cache` | `{item_id, text_hash, results[]}` | upsert results |
| GET  | `/ignored` | — | array of ignored item_ids |
| POST | `/ignored` | `{item_id}` | mark item ignored |
| DELETE | `/ignored?item_id=` | — | un-ignore |
| GET  | `/whitelist?status=active` | `status=active\|pending\|rejected\|all` | whitelist words |
| POST | `/whitelist` | `{word, confidence?, added_by?, seed?}` | add/increment; auto-promotes at threshold |
| POST | `/whitelist/status` | `{word, status}` | review view: promote/reject/un-decide a word |
| GET  | `/health` | — | liveness |

Auth: bearer token when the `SPELLCHECK_API_TOKEN` secret is set (see below);
otherwise open. Writes: rate-limited per IP (120/min) + payload validated
(results entries `{word, correction}` 1-100 chars each, extra keys stripped;
`text_hash` ≤ 64 chars; `checked_by` truncated to 80; POST bodies > 256 KB → 413).
`GET /ignored` and `GET /whitelist` are capped at 5000 rows; `added_by` is only
returned to authenticated callers.

## Authentication & rollout

The Worker supports a shared bearer token. It is **only enforced when the
`SPELLCHECK_API_TOKEN` secret is set** — without it the Worker runs in open mode
(as before) and `GET /health` returns the header `X-Spellcheck-Auth: open`.
`OPTIONS` and `GET /` / `GET /health` are always public.

Roll out in this order so no install is locked out:

```bash
# 1. Generate a token
openssl rand -hex 32

# 2. On EVERY machine: extension popup → Stavningsbackend →
#    "Spellcheck Worker-token (valfri)" → paste token → Spara stavningsbackend
#    (stored in chrome.storage.local.spellcheckWorkerToken)

# 3. Then, from workers/spellcheck/, set the secret
#    (env -u is required in this project — ~/.zshenv token is for another account)
env -u CLOUDFLARE_API_TOKEN npx wrangler secret put SPELLCHECK_API_TOKEN

# 4. Deploy
env -u CLOUDFLARE_API_TOKEN npx wrangler deploy
```

Verify: `curl -i "$BASE/health"` should no longer show `X-Spellcheck-Auth: open`,
`curl "$BASE/ignored"` should return 401, and with
`-H "Authorization: Bearer $TOKEN"` it should succeed. Any install without the
token will then get 401s (publication scanner shows the shared backend as error).

## Whitelist promotion policy

In `src/index.js` the threshold depends on the flag's `confidence`
(classified client-side in `modules/spellcheck-confidence.js`):
`PROMOTE_AT_DIFFERENT_WORD = 1` — a suggestion that's a different word
(bemålning→oljemålning) is a near-certain false positive, promoted on the
first dismissal. `PROMOTE_AT_NEAR_EDIT = 3` — a plausible near-edit
(byrä→byrå) needs 3 independent dismissals before going global.

## Local dev

```bash
npx wrangler d1 execute auctionet-spellcheck --local --file=schema.sql
npx wrangler dev   # serves on http://localhost:8787 against a local D1
```

## Pre-seeding the whitelist

Bulk-load known-good Swedish auction vocabulary (brands, materials, period
styles, auction terms) so LanguageTool's false positives on these never
surface. One-time, idempotent, paced to respect the rate limit (~80s):

```bash
node seed.mjs https://auctionet-spellcheck.<sub>.workers.dev
node seed.mjs <url> --dry-run    # preview the ~146 words without posting
```

Seeded words go straight to `status='active'`. Re-running is safe — it never
clobbers a word a human already promoted or rejected via the review view.
