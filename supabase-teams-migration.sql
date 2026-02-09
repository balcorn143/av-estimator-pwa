-- ============================================
-- AV Estimator: Team Collaboration Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Create teams table
CREATE TABLE IF NOT EXISTS teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL DEFAULT substr(md5(random()::text), 1, 8),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create team_members table
CREATE TABLE IF NOT EXISTS team_members (
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

-- 3. Create catalog_customizations table
CREATE TABLE IF NOT EXISTS catalog_customizations (
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  catalog_item_id TEXT NOT NULL,
  favorite BOOLEAN DEFAULT false,
  catalog_note TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (team_id, catalog_item_id)
);

-- 4. Add team_id to existing tables
ALTER TABLE projects ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);

-- 5. Enable RLS on all tables
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_customizations ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies

-- Teams: members can read their team
CREATE POLICY "Team members can read team"
  ON teams FOR SELECT USING (
    id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  );

-- Teams: authenticated users can create teams
CREATE POLICY "Authenticated users can create teams"
  ON teams FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- Team members: users can see their own memberships
CREATE POLICY "Users can read own memberships"
  ON team_members FOR SELECT USING (user_id = auth.uid());

-- Team members: owners can manage, and users can insert themselves (for join)
CREATE POLICY "Team owners can manage members"
  ON team_members FOR ALL USING (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid() AND role = 'owner')
  );

-- Team members: users can delete themselves (leave team)
CREATE POLICY "Users can leave teams"
  ON team_members FOR DELETE USING (user_id = auth.uid());

-- Projects: access own or team projects
CREATE POLICY "Access team and own projects"
  ON projects FOR ALL USING (
    user_id = auth.uid() OR
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  );

-- User settings: access own or team settings
CREATE POLICY "Access team and own settings"
  ON user_settings FOR ALL USING (
    user_id = auth.uid() OR
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  );

-- Catalog customizations: team members can manage
CREATE POLICY "Team members manage customizations"
  ON catalog_customizations FOR ALL USING (
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  );

-- 7. RPC function to join a team by invite code
CREATE OR REPLACE FUNCTION join_team_by_code(code TEXT)
RETURNS UUID AS $$
DECLARE
  found_team_id UUID;
BEGIN
  SELECT id INTO found_team_id FROM teams WHERE invite_code = code;
  IF found_team_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;
  INSERT INTO team_members (team_id, user_id, role)
  VALUES (found_team_id, auth.uid(), 'member')
  ON CONFLICT DO NOTHING;
  RETURN found_team_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
