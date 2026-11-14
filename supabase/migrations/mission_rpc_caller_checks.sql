-- Mission RPCs: stop trusting the p_user_id sent by the browser.
--
-- Before: get_user_missions, update_mission_progress, claim_mission_reward and
-- claim_all_mission_rewards were SECURITY DEFINER, executable by anon, and acted
-- on whatever p_user_id the caller passed.
--
-- After: the original functions move unchanged into a non-API schema
-- (private.*), and thin public wrappers with the same signatures check the
-- caller before delegating. The app's RPC calls keep working as-is.
--
-- Who may act on which user:
--   get / claim / claim all : only yourself
--   update_mission_progress : yourself; admins for anyone; teachers for
--                             'all_green_lesson' (TeacherClassReports); a PvP
--                             participant for the other side's 'win_pvp' when a
--                             completed challenge between them names that user
--                             as winner (PvPIncomingBanner / PvPChallengeModal)
--   service_role            : anything (server-side jobs)

BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.get_user_missions(uuid) SET SCHEMA private;
ALTER FUNCTION public.update_mission_progress(uuid, text, integer) SET SCHEMA private;
ALTER FUNCTION public.claim_mission_reward(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.claim_all_mission_rewards(uuid) SET SCHEMA private;

REVOKE ALL ON FUNCTION private.get_user_missions(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.update_mission_progress(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.claim_mission_reward(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.claim_all_mission_rewards(uuid) FROM PUBLIC, anon, authenticated;


-- Only the caller themselves (or service_role)
CREATE FUNCTION public.get_user_missions(p_user_id uuid) RETURNS json
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN private.get_user_missions(p_user_id);
END;
$$;

CREATE FUNCTION public.claim_mission_reward(p_user_id uuid, p_user_mission_id uuid) RETURNS json
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN private.claim_mission_reward(p_user_id, p_user_mission_id);
END;
$$;

CREATE FUNCTION public.claim_all_mission_rewards(p_user_id uuid) RETURNS json
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN private.claim_all_mission_rewards(p_user_id);
END;
$$;


CREATE FUNCTION public.update_mission_progress(p_user_id uuid, p_goal_type text, p_increment integer DEFAULT 1) RETURNS json
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF v_caller IS NULL THEN
      RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
    END IF;

    IF p_user_id IS DISTINCT FROM v_caller THEN
      SELECT role INTO v_role FROM users WHERE id = v_caller;

      IF NOT (
        v_role = 'admin'
        OR (v_role = 'teacher' AND p_goal_type = 'all_green_lesson')
        OR (p_goal_type = 'win_pvp' AND EXISTS (
              SELECT 1 FROM pvp_challenges c
              WHERE c.status = 'completed'
                AND c.winner_id = p_user_id
                AND v_caller IN (c.challenger_id, c.opponent_id)
                AND p_user_id IN (c.challenger_id, c.opponent_id)
                AND c.created_at > now() - interval '7 days'))
      ) THEN
        RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- Zero/negative increments (e.g. 0 XP earned) are a no-op, never a decrease
  IF p_increment IS NULL OR p_increment <= 0 THEN
    RETURN json_build_object('updated_count', 0);
  END IF;

  RETURN private.update_mission_progress(p_user_id, p_goal_type, p_increment);
END;
$$;


REVOKE ALL ON FUNCTION public.get_user_missions(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_mission_progress(uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_mission_reward(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_all_mission_rewards(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_user_missions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_mission_progress(uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_mission_reward(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_all_mission_rewards(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
