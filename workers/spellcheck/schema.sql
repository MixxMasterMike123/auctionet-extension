-- Spellcheck shared backend — D1 (SQLite) schema
-- Ported from the previous Supabase Postgres tables. JSONB → TEXT (JSON string),
-- TIMESTAMPTZ → TEXT (ISO 8601). Lookups are all by primary key.

CREATE TABLE IF NOT EXISTS spellcheck_cache (
  item_id    INTEGER PRIMARY KEY,        -- Auctionet item ID
  text_hash  TEXT NOT NULL,              -- hash of title+description+condition (staleness)
  results    TEXT NOT NULL DEFAULT '[]', -- JSON string: [{word, correction, ...}] or []
  checked_at TEXT NOT NULL,              -- ISO 8601
  checked_by TEXT                        -- optional debug identifier
);
CREATE INDEX IF NOT EXISTS idx_spellcheck_cache_checked_at ON spellcheck_cache (checked_at);

CREATE TABLE IF NOT EXISTS spellcheck_ignored (
  item_id    INTEGER PRIMARY KEY,        -- Auctionet item ID, errors suppressed for this item
  ignored_at TEXT NOT NULL               -- ISO 8601
);

-- Self-healing whitelist (Phase 3). A word accumulates ignore_count as employees
-- click "Ignorera"; flips pending → active at the promotion threshold (see Worker).
CREATE TABLE IF NOT EXISTS spellcheck_whitelist (
  word         TEXT PRIMARY KEY,         -- normalized lowercase token
  ignore_count INTEGER NOT NULL DEFAULT 1,
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | active | rejected
  added_by     TEXT,
  added_at     TEXT,
  promoted_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_spellcheck_whitelist_status ON spellcheck_whitelist (status);
