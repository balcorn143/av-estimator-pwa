-- ============================================
-- AV Estimator: Catalog Realtime (Phase 7)
-- Run this in Supabase SQL Editor
-- Adds catalog_items to the supabase_realtime publication so postgres_changes
-- subscriptions get INSERT/UPDATE/DELETE events for the table.
-- Idempotent — safe to re-run.
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'catalog_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE catalog_items;
  END IF;
END $$;
