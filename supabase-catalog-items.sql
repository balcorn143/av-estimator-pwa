-- ============================================
-- AV Estimator: Catalog Items Migration (Phase 1)
-- Run this in Supabase SQL Editor
-- Creates: catalog_items table — server-authoritative per-team catalog
-- Replaces the old localStorage-primary + catalog_customizations delta model.
-- ============================================

-- 1. catalog_items table
CREATE TABLE IF NOT EXISTS catalog_items (
  team_id            UUID         NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  item_id            TEXT         NOT NULL,
  manufacturer       TEXT,
  model              TEXT,
  part_number        TEXT,
  description        TEXT,
  category           TEXT,
  subcategory        TEXT,
  unit_cost          NUMERIC(12,2) DEFAULT 0,
  labor_hrs_per_unit NUMERIC(8,2)  DEFAULT 0,
  uom                TEXT,
  vendor             TEXT,
  phase              TEXT,
  notes              TEXT,
  catalog_note       TEXT,
  discontinued       BOOLEAN      NOT NULL DEFAULT FALSE,
  deleted            BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_by         UUID         REFERENCES auth.users(id),
  PRIMARY KEY (team_id, item_id)
);

-- 2. Indices for common query patterns
CREATE INDEX IF NOT EXISTS catalog_items_team_category_idx
  ON catalog_items (team_id, category);
CREATE INDEX IF NOT EXISTS catalog_items_team_updated_idx
  ON catalog_items (team_id, updated_at DESC);

-- 3. Auto-bump updated_at on every UPDATE
CREATE OR REPLACE FUNCTION catalog_items_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS catalog_items_updated_at ON catalog_items;
CREATE TRIGGER catalog_items_updated_at
  BEFORE UPDATE ON catalog_items
  FOR EACH ROW EXECUTE FUNCTION catalog_items_set_updated_at();

-- 4. Row Level Security — team members only
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Team members can view catalog_items" ON catalog_items;
CREATE POLICY "Team members can view catalog_items"
  ON catalog_items FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Team members can insert catalog_items" ON catalog_items;
CREATE POLICY "Team members can insert catalog_items"
  ON catalog_items FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Team members can update catalog_items" ON catalog_items;
CREATE POLICY "Team members can update catalog_items"
  ON catalog_items FOR UPDATE
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Team members can delete catalog_items" ON catalog_items;
CREATE POLICY "Team members can delete catalog_items"
  ON catalog_items FOR DELETE
  USING (
    team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  );
