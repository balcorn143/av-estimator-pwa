-- ============================================
-- AV Estimator: Add `folder` column to team_packages
-- Run this in Supabase SQL Editor.
--
-- Adds optional folder/group support to catalog packages. The folder is a
-- forward-slash-delimited path string (e.g. "Cisco/Conference Bars"), so
-- nested folders are represented as path prefixes — no separate folders
-- table is needed.
--
-- Idempotent. Safe to re-run.
-- ============================================

ALTER TABLE team_packages ADD COLUMN IF NOT EXISTS folder TEXT;

-- Helpful index for folder-prefix queries, e.g. fetching everything under
-- "Cisco/" without scanning the whole team.
CREATE INDEX IF NOT EXISTS team_packages_team_folder_idx
  ON team_packages (team_id, folder);
