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
  recorded_at         INTEGER,
  -- Lives observed beyond the first (0 = sold/ended on its first listing).
  -- Auctionet relists unsold items up to 3x under the SAME item_id with a
  -- later ends_at each time — see hyperrank-outcomes-bg.js's checkRelist().
  -- Merged across machines with MAX(), same rationale as
  -- rescue_observed.relist_count below (each machine only sees its own
  -- collector's live-lookup history, so the highest observed count wins).
  relist_count        INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rescue_observed (
  item_id      TEXT PRIMARY KEY,
  first_seen_ts INTEGER,
  ends_at      INTEGER,
  estimate     INTEGER,
  parity       TEXT,
  -- 1 = a control-parity item was deliberately hyperranked anyway (edit-page
  -- guard override). Excluded from both arms of the A/B comparison.
  protocol_violation INTEGER DEFAULT 0,
  -- Lives observed beyond the first: bumped when the item reappears on
  -- Räddningslistan with an ends_at >24h past the stored one (unsold items
  -- relist up to 3× under the SAME id, reserve may drop). Only rescue-window
  -- re-entries are counted. Feeds relist sell-rate / storage-cost analysis.
  relist_count INTEGER DEFAULT 0
);

-- Migrations for pre-existing deployments (run once each):
--   ALTER TABLE rescue_observed ADD COLUMN protocol_violation INTEGER DEFAULT 0;  (applied 2026-07-22)
--   ALTER TABLE rescue_observed ADD COLUMN relist_count INTEGER DEFAULT 0;        (applied 2026-07-23)
--   ALTER TABLE outcomes ADD COLUMN relist_count INTEGER DEFAULT 0;               (NOT YET APPLIED — run manually before deploying)
