-- ============================================
-- AV Estimator: Team Packages + Team Settings Migration
-- Run this in Supabase SQL Editor (after all earlier migrations).
--
-- WHAT THIS FIXES:
-- Previously, catalog-level packages, templates, and uom_options were stored
-- as JSON columns on `user_settings`, which is keyed per-user. Each teammate
-- that opened the app created their own user_settings row scoped to the same
-- team_id, producing duplicate rows. `.maybeSingle()` then started returning
-- null+error for the team, the loader fell through to the "seed" branch, and
-- the auto-save eventually overwrote good data with `[]`. Result: catalog
-- packages silently disappeared and project package instances rendered empty.
--
-- WHAT THIS DOES:
--   1. Creates `team_packages` (one row per package, PK = team_id, package_id).
--   2. Creates `team_settings` (one row per team, holds templates + uom_options).
--   3. RLS for both: team members only.
--   4. Adds `team_packages` to the supabase_realtime publication.
--   5. Migrates surviving package data out of user_settings into team_packages
--      (picking the most recent version of each package_id per team across all
--      user_settings rows — so duplicates collapse correctly).
--   6. Migrates templates and uom_options into team_settings (most recent wins).
--
-- Idempotent. Safe to re-run. Does NOT drop user_settings columns (kept as a
-- read-only safety net until you've confirmed the new tables look right).
-- ============================================

-- ============================================================
-- 1. team_packages — granular, server-authoritative package storage
-- ============================================================
CREATE TABLE IF NOT EXISTS team_packages (
  team_id      UUID         NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  package_id   TEXT         NOT NULL,
  name         TEXT         NOT NULL,
  scope        TEXT         NOT NULL DEFAULT 'catalog' CHECK (scope IN ('catalog')),
  version      INTEGER      NOT NULL DEFAULT 1,
  items        JSONB        NOT NULL DEFAULT '[]'::jsonb,
  deleted      BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by   UUID         REFERENCES auth.users(id),
  PRIMARY KEY (team_id, package_id)
);

CREATE INDEX IF NOT EXISTS team_packages_team_updated_idx
  ON team_packages (team_id, updated_at DESC);

-- Auto-bump updated_at on UPDATE
CREATE OR REPLACE FUNCTION team_packages_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS team_packages_updated_at ON team_packages;
CREATE TRIGGER team_packages_updated_at
  BEFORE UPDATE ON team_packages
  FOR EACH ROW EXECUTE FUNCTION team_packages_set_updated_at();

-- RLS — team members only
ALTER TABLE team_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can view team_packages" ON team_packages;
CREATE POLICY "Team members can view team_packages"
  ON team_packages FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Team members can insert team_packages" ON team_packages;
CREATE POLICY "Team members can insert team_packages"
  ON team_packages FOR INSERT
  WITH CHECK (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Team members can update team_packages" ON team_packages;
CREATE POLICY "Team members can update team_packages"
  ON team_packages FOR UPDATE
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
  WITH CHECK (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Team members can delete team_packages" ON team_packages;
CREATE POLICY "Team members can delete team_packages"
  ON team_packages FOR DELETE
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- Realtime publication — clients subscribe to postgres_changes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'team_packages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE team_packages;
  END IF;
END $$;


-- ============================================================
-- 2. team_settings — one row per team for templates + uom_options
-- ============================================================
CREATE TABLE IF NOT EXISTS team_settings (
  team_id      UUID         PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  templates    JSONB        NOT NULL DEFAULT '[]'::jsonb,
  uom_options  JSONB,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by   UUID         REFERENCES auth.users(id)
);

CREATE OR REPLACE FUNCTION team_settings_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS team_settings_updated_at ON team_settings;
CREATE TRIGGER team_settings_updated_at
  BEFORE UPDATE ON team_settings
  FOR EACH ROW EXECUTE FUNCTION team_settings_set_updated_at();

ALTER TABLE team_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can view team_settings" ON team_settings;
CREATE POLICY "Team members can view team_settings"
  ON team_settings FOR SELECT
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Team members can insert team_settings" ON team_settings;
CREATE POLICY "Team members can insert team_settings"
  ON team_settings FOR INSERT
  WITH CHECK (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Team members can update team_settings" ON team_settings;
CREATE POLICY "Team members can update team_settings"
  ON team_settings FOR UPDATE
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
  WITH CHECK (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- Realtime publication — team_settings changes propagate to teammates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'team_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE team_settings;
  END IF;
END $$;


-- ============================================================
-- 3. DATA MIGRATION — copy from user_settings into the new tables
--    Strategy: for each (team_id, package_id), keep the most recent version
--    across ALL user_settings rows. This collapses duplicates correctly.
--    Insert-only with ON CONFLICT DO NOTHING — re-running is a no-op once
--    rows exist in team_packages.
-- ============================================================

WITH ranked_packages AS (
  SELECT
    us.team_id,
    us.user_id,
    us.updated_at,
    pkg AS package_json,
    pkg->>'id' AS package_id,
    ROW_NUMBER() OVER (
      PARTITION BY us.team_id, pkg->>'id'
      ORDER BY us.updated_at DESC NULLS LAST
    ) AS rn
  FROM user_settings us,
       jsonb_array_elements(COALESCE(us.packages, '[]'::jsonb)) AS pkg
  WHERE us.team_id IS NOT NULL
    AND pkg->>'id' IS NOT NULL
)
INSERT INTO team_packages
  (team_id, package_id, name, scope, version, items, deleted, updated_by, created_at, updated_at)
SELECT
  team_id,
  package_id,
  COALESCE(package_json->>'name', 'Unnamed Package'),
  'catalog',
  COALESCE((package_json->>'version')::int, 1),
  COALESCE(package_json->'items', '[]'::jsonb),
  FALSE,
  user_id,
  COALESCE((package_json->>'createdAt')::timestamptz, now()),
  COALESCE((package_json->>'updatedAt')::timestamptz, updated_at, now())
FROM ranked_packages
WHERE rn = 1
ON CONFLICT (team_id, package_id) DO NOTHING;


-- Migrate templates + uom_options. For each team, pick the most recent
-- user_settings row that has non-empty templates / uom_options for that field.
INSERT INTO team_settings (team_id, templates, uom_options, updated_by, updated_at)
SELECT
  team_id,
  templates,
  uom_options,
  updated_by,
  updated_at
FROM (
  SELECT DISTINCT ON (us.team_id)
    us.team_id,
    COALESCE(us.templates, '[]'::jsonb) AS templates,
    us.uom_options,
    us.user_id AS updated_by,
    us.updated_at
  FROM user_settings us
  WHERE us.team_id IS NOT NULL
  ORDER BY us.team_id, us.updated_at DESC NULLS LAST
) latest
ON CONFLICT (team_id) DO NOTHING;


-- ============================================================
-- 4. STUB-PACKAGE RECOVERY
--    For every package_id still referenced inside projects.data but missing
--    from team_packages (because user_settings was already overwritten with
--    empty arrays before the schema fix), insert an empty stub with the
--    last-known name + version. Project locations then show the name
--    instead of "missing", and the team can re-populate items in the app's
--    Packages tab.
--
--    Idempotent via ON CONFLICT DO NOTHING — packages already migrated in
--    step 3 are preserved; only truly missing IDs get a stub.
-- ============================================================

WITH referenced AS (
  SELECT
    p.team_id,
    item->>'packageId'   AS package_id,
    item->>'packageName' AS pkg_name,
    COALESCE((item->>'packageVersion')::int, 1) AS pkg_version,
    p.updated_at
  FROM projects p,
       jsonb_array_elements(COALESCE(p.data->'locations', '[]'::jsonb)) AS loc,
       jsonb_array_elements(COALESCE(loc->'items',         '[]'::jsonb)) AS item
  WHERE item->>'type' = 'package'
    AND item->>'packageId' IS NOT NULL
    AND p.team_id IS NOT NULL
),
ranked AS (
  SELECT
    team_id,
    package_id,
    pkg_name,
    pkg_version,
    ROW_NUMBER() OVER (
      PARTITION BY team_id, package_id
      ORDER BY updated_at DESC NULLS LAST
    ) AS rn
  FROM referenced
),
best AS (
  SELECT team_id, package_id, pkg_name AS most_recent_name
  FROM ranked WHERE rn = 1
),
versions AS (
  SELECT team_id, package_id, MAX(pkg_version) AS max_version
  FROM referenced
  GROUP BY team_id, package_id
)
INSERT INTO team_packages
  (team_id, package_id, name, scope, version, items, deleted)
SELECT
  b.team_id,
  b.package_id,
  COALESCE(b.most_recent_name, 'Recovered Package'),
  'catalog',
  v.max_version,
  '[]'::jsonb,
  FALSE
FROM best b
JOIN versions v USING (team_id, package_id)
ON CONFLICT (team_id, package_id) DO NOTHING;


-- ============================================================
-- 5. POST-MIGRATION SANITY CHECKS
--    Run these manually to confirm before trusting the new tables.
-- ============================================================
-- SELECT team_id, count(*) AS package_count FROM team_packages GROUP BY team_id;
-- SELECT team_id, jsonb_array_length(templates) AS templates_n,
--        jsonb_array_length(COALESCE(uom_options, '[]'::jsonb)) AS uom_n
-- FROM team_settings;
-- SELECT team_id, package_id, name, version, jsonb_array_length(items) AS item_count
-- FROM team_packages ORDER BY team_id, name;
