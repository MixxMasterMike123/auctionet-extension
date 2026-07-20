-- HYPERRANK experiment sync schema (sas-hyperrank-db)
-- Merges per-machine chrome.storage.local data (Micke + Anders pilot) into one
-- shared dataset. Source of truth for shape: modules/hyperrank/hyperrank-outcomes-bg.js
-- and admin-dashboard.js (computeHyperrankScoreboard / computeRescueAbComparison).

CREATE TABLE IF NOT EXISTS treatments (
  item_id   TEXT PRIMARY KEY,
  ts        INTEGER,
  mode      TEXT,
  visits    INTEGER,
  followers INTEGER,
  machine   TEXT
);

CREATE TABLE IF NOT EXISTS outcomes (
  item_id             TEXT PRIMARY KEY,
  arm                 TEXT CHECK(arm IN ('treated','control')),
  ended_at            INTEGER,
  sold                INTEGER,
  inferred_unsold     INTEGER DEFAULT 0,
  lost                INTEGER DEFAULT 0,
  final_bid_count     INTEGER,
  bids_after_hyperrank INTEGER,
  highest_bid         INTEGER,
  estimate            INTEGER,
  recorded_at         INTEGER
);

CREATE TABLE IF NOT EXISTS rescue_observed (
  item_id      TEXT PRIMARY KEY,
  first_seen_ts INTEGER,
  ends_at      INTEGER,
  estimate     INTEGER,
  parity       TEXT
);
