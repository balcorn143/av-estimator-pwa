-- ============================================
-- AV Estimator: Takeoff PDF Storage
-- Run this ONCE in the Supabase SQL Editor.
--
-- Creates a private Storage bucket for PDF takeoff drawings and RLS policies
-- so any member of a project's team can read/write that team's drawings.
-- The lightweight takeoff data (markers, page scales, counts) lives in the
-- project JSON and syncs through the normal projects table — only the raw
-- PDF is stored here.
--
-- Object path convention (set by the app):
--   <team_id>/<project_id>.pdf        for team projects
--   <user_id>/<project_id>.pdf        for solo (no-team) projects
-- The first path segment is the owner key the policies check against.
--
-- Idempotent. Safe to re-run.
-- ============================================

-- 1. Private bucket (PDF only, up to 200 MB per drawing set).
--    NOTE: this bucket limit is still capped by the PROJECT-WIDE upload limit
--    at Dashboard → Storage → Settings → "Upload file size limit". Raise that
--    too if it's lower than 200 MB (the free tier caps it at 50 MB).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('takeoff-pdfs', 'takeoff-pdfs', false, 209715200, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET file_size_limit   = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Policies — a user may touch an object when its first folder is either a
--    team they belong to, or their own user id (solo projects).
DROP POLICY IF EXISTS "takeoff read"   ON storage.objects;
DROP POLICY IF EXISTS "takeoff insert" ON storage.objects;
DROP POLICY IF EXISTS "takeoff update" ON storage.objects;
DROP POLICY IF EXISTS "takeoff delete" ON storage.objects;

CREATE POLICY "takeoff read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'takeoff-pdfs' AND (
      (storage.foldername(name))[1] IN (
        SELECT team_id::text FROM team_members WHERE user_id = auth.uid()
      )
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

CREATE POLICY "takeoff insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'takeoff-pdfs' AND (
      (storage.foldername(name))[1] IN (
        SELECT team_id::text FROM team_members WHERE user_id = auth.uid()
      )
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

CREATE POLICY "takeoff update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'takeoff-pdfs' AND (
      (storage.foldername(name))[1] IN (
        SELECT team_id::text FROM team_members WHERE user_id = auth.uid()
      )
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

CREATE POLICY "takeoff delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'takeoff-pdfs' AND (
      (storage.foldername(name))[1] IN (
        SELECT team_id::text FROM team_members WHERE user_id = auth.uid()
      )
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );
