-- ============================================================
-- get_leaderboard RPC
-- Server-side aggregation for the Week / Month (and Today) leaderboard tabs.
--
-- Replaces the old client-side approach that shipped thousands of raw
-- user_progress + session_reward_claims rows to the browser and summed them
-- in JavaScript. That was ~85% of the project's egress (PostgREST).
--
-- This computes the timeframe XP per user entirely in Postgres and returns
-- only the top 50 rows, mirroring the original logic exactly:
--   * base XP = exercises.xp_reward (default 10)
--   * score-based bonus: >=95% -> x1.5, >=90% -> x1.3 (rounded)
--   * plus chest XP from session_reward_claims
--   * timeframe filtering uses the Vietnam (Asia/Ho_Chi_Minh) calendar date
--
-- p_period : 'today' | 'week' | 'month'
-- p_start_date : Vietnam date marking the start of the period
--                ('today' = exact day; week/month = inclusive lower bound)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_period text,
  p_start_date date
)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  total_xp integer,
  streak_count integer,
  avatar_url text,
  active_title text,
  active_frame_ratio text,
  hide_frame boolean,
  timeframe_xp bigint,
  exercise_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH exercise_xp AS (
    SELECT
      up.user_id,
      SUM(
        CASE
          WHEN up.max_score > 0 AND (up.score::numeric / up.max_score) * 100 >= 95
            THEN round(COALESCE(e.xp_reward, 10) * 1.5)
          WHEN up.max_score > 0 AND (up.score::numeric / up.max_score) * 100 >= 90
            THEN round(COALESCE(e.xp_reward, 10) * 1.3)
          ELSE COALESCE(e.xp_reward, 10)
        END
      )::bigint AS xp,
      COUNT(*)::bigint AS ex_count
    FROM user_progress up
    LEFT JOIN exercises e ON e.id = up.exercise_id
    WHERE up.status = 'completed'
      AND CASE
        WHEN p_period = 'today'
          THEN (up.completed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = p_start_date
        ELSE (up.completed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_start_date
      END
    GROUP BY up.user_id
  ),
  chest_xp AS (
    SELECT
      src.user_id,
      SUM(src.xp_awarded)::bigint AS xp
    FROM session_reward_claims src
    WHERE src.xp_awarded > 0
      AND CASE
        WHEN p_period = 'today'
          THEN (src.claimed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = p_start_date
        ELSE (src.claimed_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= p_start_date
      END
    GROUP BY src.user_id
  )
  SELECT
    u.id,
    u.full_name,
    u.email,
    u.xp AS total_xp,
    u.streak_count,
    u.avatar_url,
    ue.active_title,
    ue.active_frame_ratio,
    ue.hide_frame,
    (COALESCE(ex.xp, 0) + COALESCE(c.xp, 0))::bigint AS timeframe_xp,
    COALESCE(ex.ex_count, 0)::bigint AS exercise_count
  FROM users u
  LEFT JOIN user_equipment ue ON ue.user_id = u.id
  LEFT JOIN exercise_xp ex ON ex.user_id = u.id
  LEFT JOIN chest_xp c ON c.user_id = u.id
  WHERE u.role = 'user'
    AND (COALESCE(ex.xp, 0) + COALESCE(c.xp, 0)) > 0
  ORDER BY timeframe_xp DESC
  LIMIT 50;
$$;

-- Allow the app's authenticated users to call it.
GRANT EXECUTE ON FUNCTION public.get_leaderboard(text, date) TO anon, authenticated;
