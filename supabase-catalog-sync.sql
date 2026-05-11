-- ============================================
-- AV Estimator: Catalog Sync Migration
-- Run this in Supabase SQL Editor
-- Adds: deleted + custom_fields columns to catalog_customizations
-- This enables full catalog editing/deletion to persist across refreshes
-- ============================================

-- 1. Add columns to catalog_customizations for full catalog sync
ALTER TABLE catalog_customizations ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE catalog_customizations ADD COLUMN IF NOT EXISTS custom_fields JSONB;

-- 2. Add unique constraint if not exists (needed for upsert on team_id + catalog_item_id)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'catalog_customizations_team_item_unique'
  ) THEN
    ALTER TABLE catalog_customizations
      ADD CONSTRAINT catalog_customizations_team_item_unique
      UNIQUE (team_id, catalog_item_id);
  END IF;
END $$;
