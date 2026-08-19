-- Rollback migration for PvP ranking / ranked match system.
-- Run against any environment where add_pvp_ranking.sql was previously applied.
-- Safe to run multiple times (IF EXISTS guards throughout).

BEGIN;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.claim_pvp_season_rewards(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.end_pvp_season(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.expire_stale_ranked_matches() CASCADE;
DROP FUNCTION IF EXISTS public._apply_lp_delta CASCADE;
DROP FUNCTION IF EXISTS public.apply_pvp_rank_change CASCADE;
DROP FUNCTION IF EXISTS public.forfeit_ranked_match CASCADE;
DROP FUNCTION IF EXISTS public.complete_ranked_match CASCADE;
DROP FUNCTION IF EXISTS public.post_ranked_score CASCADE;
DROP FUNCTION IF EXISTS public.claim_ranked_match CASCADE;

-- ---------------------------------------------------------------------------
-- Tables (CASCADE drops dependent indexes, policies, and FKs)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.pvp_season_final_ranks CASCADE;
DROP TABLE IF EXISTS public.pvp_season_rewards    CASCADE;
DROP TABLE IF EXISTS public.pvp_rank_history      CASCADE;
DROP TABLE IF EXISTS public.ranked_matches        CASCADE;
DROP TABLE IF EXISTS public.pvp_seasons           CASCADE;

-- ---------------------------------------------------------------------------
-- OPTIONAL: drop rank columns on public.users.
-- This is DESTRUCTIVE — every user's rank level, points, and W/L counts are
-- permanently deleted. Comment out these lines if you want to keep the data
-- in case ranked match is reintroduced later.
-- ---------------------------------------------------------------------------
ALTER TABLE public.users
  DROP COLUMN IF EXISTS pvp_rank_level,
  DROP COLUMN IF EXISTS pvp_rank_points,
  DROP COLUMN IF EXISTS pvp_wins,
  DROP COLUMN IF EXISTS pvp_losses;

COMMIT;