-- Online Battle: Double becomes Boost, new power-up odds.
--
-- Power-up button odds: steal 60%, swap 20%, boost 20%.
-- Boost: if my team is ahead or level, +10 points.
--        if my team is behind, my score becomes the other team's score + 10.
--
-- Existing 'double' rows (from testing) are renamed to 'boost'.
-- Run after add_online_battle_powerup_button.sql. Safe to run again.

BEGIN;

ALTER TABLE public.online_battle_powerups DROP CONSTRAINT IF EXISTS online_battle_powerups_kind_check;
ALTER TABLE public.online_battle_answers DROP CONSTRAINT IF EXISTS online_battle_answers_bonus_powerup_check;
ALTER TABLE public.online_battle_events DROP CONSTRAINT IF EXISTS online_battle_events_kind_check;

UPDATE public.online_battle_powerups SET kind = 'boost' WHERE kind = 'double';
UPDATE public.online_battle_answers SET bonus_powerup = 'boost' WHERE bonus_powerup = 'double';
UPDATE public.online_battle_events SET kind = 'powerup_boost' WHERE kind = 'powerup_double';
UPDATE public.online_battle_events SET detail = jsonb_set(detail, '{powerup}', '"boost"')
  WHERE detail->>'powerup' = 'double';

ALTER TABLE public.online_battle_powerups ADD CONSTRAINT online_battle_powerups_kind_check
  CHECK (kind IN ('steal', 'swap', 'boost'));
ALTER TABLE public.online_battle_answers ADD CONSTRAINT online_battle_answers_bonus_powerup_check
  CHECK (bonus_powerup IN ('steal', 'swap', 'boost'));
ALTER TABLE public.online_battle_events ADD CONSTRAINT online_battle_events_kind_check
  CHECK (kind IN ('question', 'bonus_three', 'bonus_random', 'manual',
                  'powerup_won', 'powerup_steal', 'powerup_swap', 'powerup_boost'));

-- ---------------------------------------------------------------------------
-- Which power-up the button gives. Edit the numbers to change the odds.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.online_battle_roll_powerup()
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_roll double precision := random();
BEGIN
  IF v_roll < 0.60 THEN RETURN 'steal'; END IF;  -- 60%
  IF v_roll < 0.80 THEN RETURN 'swap'; END IF;   -- 20%
  RETURN 'boost';                                -- 20%
END;
$$;

-- ---------------------------------------------------------------------------
-- Student: use a power-up (Double replaced by Boost).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.online_battle_use_powerup(p_powerup_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pu public.online_battle_powerups%ROWTYPE;
  v_room public.online_battle_rooms%ROWTYPE;
  v_mine integer;
  v_theirs integer;
  v_new_mine integer;
  v_new_theirs integer;
  v_gain integer;
  v_detail jsonb;
  v_team text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT * INTO v_pu FROM public.online_battle_powerups WHERE id = p_powerup_id FOR UPDATE;
  IF NOT FOUND OR v_pu.user_id <> v_uid THEN
    RETURN jsonb_build_object('used', false, 'reason', 'not_found');
  END IF;
  IF v_pu.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('used', false, 'reason', 'already_used');
  END IF;

  -- Lock the room so the score maths can't race with other taps
  SELECT * INTO v_room FROM public.online_battle_rooms WHERE id = v_pu.room_id FOR UPDATE;
  IF v_room.status IS DISTINCT FROM 'active'
     OR public.online_battle_latest_question(v_pu.room_id) IS DISTINCT FROM v_pu.question_id THEN
    RETURN jsonb_build_object('used', false, 'reason', 'expired');
  END IF;

  -- The student may have been moved to the other team since; use their team now
  SELECT p.team INTO v_team
  FROM public.online_battle_participants p
  WHERE p.room_id = v_pu.room_id AND p.user_id = v_uid;
  IF v_team IS NULL THEN
    RETURN jsonb_build_object('used', false, 'reason', 'not_participant');
  END IF;

  v_mine := CASE WHEN v_team = 'a' THEN v_room.team_a_score ELSE v_room.team_b_score END;
  v_theirs := CASE WHEN v_team = 'a' THEN v_room.team_b_score ELSE v_room.team_a_score END;

  IF v_pu.kind = 'steal' THEN
    v_gain := least(3 + floor(random() * 5)::integer, v_theirs); -- 3 to 7
    v_new_mine := v_mine + v_gain;
    v_new_theirs := v_theirs - v_gain;
    v_detail := jsonb_build_object('stolen', v_gain);
  ELSIF v_pu.kind = 'swap' THEN
    v_new_mine := v_theirs;
    v_new_theirs := v_mine;
    v_gain := v_theirs - v_mine;
    v_detail := jsonb_build_object('mine_before', v_mine, 'theirs_before', v_theirs);
  ELSE -- boost
    -- Ahead or level: +10. Behind: jump to 10 points ahead of the other team.
    v_new_mine := CASE WHEN v_mine >= v_theirs THEN v_mine + 10 ELSE v_theirs + 10 END;
    v_new_theirs := v_theirs;
    v_gain := v_new_mine - v_mine;
    v_detail := jsonb_build_object('was_behind', v_mine < v_theirs);
  END IF;

  UPDATE public.online_battle_rooms
  SET team_a_score = CASE WHEN v_team = 'a' THEN v_new_mine ELSE v_new_theirs END,
      team_b_score = CASE WHEN v_team = 'a' THEN v_new_theirs ELSE v_new_mine END
  WHERE id = v_pu.room_id;

  UPDATE public.online_battle_powerups SET used_at = now() WHERE id = v_pu.id;

  INSERT INTO public.online_battle_events (room_id, kind, team, user_id, points, detail)
  VALUES (v_pu.room_id, 'powerup_' || v_pu.kind, v_team, v_uid, v_gain, v_detail);

  RETURN jsonb_build_object('used', true, 'kind', v_pu.kind, 'points', v_gain);
END;
$$;

COMMIT;
