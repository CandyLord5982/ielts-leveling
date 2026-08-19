-- ============================================================
-- Tournament Team Mode
-- ============================================================

-- 1. Add mode columns to tournaments
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'solo' CHECK (mode IN ('solo', 'team')),
  ADD COLUMN IF NOT EXISTS team_size integer NOT NULL DEFAULT 1 CHECK (team_size BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS winning_team_id uuid;

-- 2. Tournament teams
CREATE TABLE IF NOT EXISTS public.tournament_teams (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  name text NOT NULL,
  seed integer NOT NULL,
  eliminated_in_round integer,
  created_at timestamptz DEFAULT now(),
  UNIQUE (tournament_id, name),
  UNIQUE (tournament_id, seed)
);

-- 3. Team members (up to team_size per team)
CREATE TABLE IF NOT EXISTS public.tournament_team_members (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  team_id uuid NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (team_id, user_id)
);

-- 4. Best-of-N format
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS best_of integer NOT NULL DEFAULT 1 CHECK (best_of >= 1 AND best_of % 2 = 1);

ALTER TABLE tournament_matches
  ADD COLUMN IF NOT EXISTS round_scores jsonb;

-- 5. (renumbered) Add team columns to tournament_matches
ALTER TABLE tournament_matches
  ADD COLUMN IF NOT EXISTS team1_id uuid REFERENCES tournament_teams(id),
  ADD COLUMN IF NOT EXISTS team2_id uuid REFERENCES tournament_teams(id),
  ADD COLUMN IF NOT EXISTS team_winner_id uuid REFERENCES tournament_teams(id);

-- 6. FK for winning_team_id on tournaments
ALTER TABLE tournaments
  ADD CONSTRAINT tournaments_winning_team_fkey
  FOREIGN KEY (winning_team_id) REFERENCES tournament_teams(id);

-- 7. RLS policies
ALTER TABLE tournament_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read tournament_teams" ON tournament_teams FOR SELECT USING (true);
CREATE POLICY "Anyone can read tournament_team_members" ON tournament_team_members FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert tournament_teams" ON tournament_teams FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can insert tournament_team_members" ON tournament_team_members FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can update tournament_teams" ON tournament_teams FOR UPDATE USING (true);
CREATE POLICY "Authenticated users can delete tournament_teams" ON tournament_teams FOR DELETE USING (true);
CREATE POLICY "Authenticated users can delete tournament_team_members" ON tournament_team_members FOR DELETE USING (true);
