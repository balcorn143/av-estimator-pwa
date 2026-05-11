-- ============================================
-- AV Estimator: UOM Options
-- Run this in Supabase SQL Editor
-- Adds: uom_options JSONB column to user_settings so each team can
-- customize the unit-of-measure list shown in catalog/component forms.
-- Idempotent.
-- ============================================

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS uom_options JSONB;
