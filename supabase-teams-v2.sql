-- ============================================
-- AV Estimator: Teams V2 Migration
-- Run this in Supabase SQL Editor
-- Adds: member emails RPC, project checkout, revision log
-- ============================================

-- 1. RPC to get team members with their emails
CREATE OR REPLACE FUNCTION get_team_members(p_team_id UUID)
RETURNS TABLE(user_id UUID, email TEXT, role TEXT, joined_at TIMESTAMPTZ) AS $$
BEGIN
  RETURN QUERY
  SELECT tm.user_id, au.email::TEXT, tm.role, tm.joined_at
  FROM team_members tm
  JOIN auth.users au ON au.id = tm.user_id
  WHERE tm.team_id = p_team_id
  AND tm.team_id IN (SELECT team_id FROM team_members WHERE team_members.user_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Project checkout tracking
ALTER TABLE projects ADD COLUMN IF NOT EXISTS checked_out_by UUID REFERENCES auth.users(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS checked_out_email TEXT;

-- 3. Project revision log
CREATE TABLE IF NOT EXISTS project_revisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id TEXT NOT NULL,
  team_id UUID REFERENCES teams(id),
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  revision_number INTEGER NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE project_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view revisions"
  ON project_revisions FOR SELECT USING (
    team_id IN (SELECT team_id FROM team_members WHERE team_members.user_id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY "Users can create revisions"
  ON project_revisions FOR INSERT WITH CHECK (
    user_id = auth.uid()
  );

-- 4. RPC to check out a project
CREATE OR REPLACE FUNCTION checkout_project(p_project_id TEXT, p_email TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  current_checkout UUID;
BEGIN
  SELECT checked_out_by INTO current_checkout FROM projects WHERE id = p_project_id;
  IF current_checkout IS NOT NULL AND current_checkout != auth.uid() THEN
    RETURN FALSE;
  END IF;
  UPDATE projects SET checked_out_by = auth.uid(), checked_out_at = now(), checked_out_email = p_email WHERE id = p_project_id;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC to check in a project
CREATE OR REPLACE FUNCTION checkin_project(p_project_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE projects SET checked_out_by = NULL, checked_out_at = NULL, checked_out_email = NULL
  WHERE id = p_project_id AND (checked_out_by = auth.uid() OR checked_out_by IS NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
