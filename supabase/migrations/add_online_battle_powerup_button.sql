-- Online Battle: Power-up button (replaces the power-up inside Random).
--
-- After each correct answer the student gets, as before, ONE bonus tap: +3 or Random.
-- Random is plain -1 to 7 points again.
--
-- On top of that, each correct answer has a 25% chance of lighting up a third button,
-- the Power-up (an extra, it doesn't use up the bonus tap). Tapping it gives a random:
--   steal  (50%) - take 3 to 7 points from the other team
--   swap   (25%) - swap the two teams' scores
--   double (25%) - my team gets its points from that question again
-- Use it or lose it: the button, and the power-up it gives, only work until the
-- teacher opens the next question (or the battle ends).
--
-- To change the chances, edit and re-run this file (or just the function):
--   online_battle_powerup_chance()  - how often the button appears (0.25 = 25%)
--   online_battle_roll_powerup()    - the steal / swap / double split
--
-- Run after add_online_battle_powerups.sql. Safe to run again.

BEGIN;

-- ---------------------------------------------------------------------------
-- The two chances, in one place
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.online_battle_powerup_chance()
RETURNS double precision
LANGUAGE sql
STABLE
AS $$ SELECT 0.25::double precision $$;  -- 25% of correct answers get the Power-up button

CREATE OR REPLACE FUNCTION public.online_battle_roll_powerup()
RETURNS text
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_roll double precision := random();
BEGIN
  IF v_roll < 0.50 THEN RETURN 'steal'; END IF;  -- 50%
  IF v_roll < 0.75 THEN RETURN 'swap'; END IF;   -- 25%
  RETURN 'double';                               -- 25%
END;
$$;

-- ---------------------------------------------------------------------------
-- Answers: was the Power-up button rolled for this answer, and was it tapped.
-- The roll happens when the answer is saved (column default). Students can't read
-- this table, and the button only matters if the answer was correct.
-- bonus_powerup (from the previous migration) now records which power-up it gave.
-- ---------------------------------------------------------------------------
ALTER TABLE public.online_battle_answers
  ADD COLUMN IF NOT EXISTS powerup_offered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS powerup_claimed_at timestamptz;

ALTER TABLE public.online_battle_answers
  ALTER COLUMN powerup_offered SET DEFAULT (random() < public.online_battle_powerup_chance());

ALTER TABLE public.online_battle_events DROP CONSTRAINT IF EXISTS online_battle_events_kind_check;
ALTER TABLE public.online_battle_events ADD CONSTRAINT online_battle_events_kind_check
  CHECK (kind IN ('question', 'bonus_three', 'bonus_random', 'manual',
                  'powerup_won', 'powerup_steal', 'powerup_swap', 'powerup_double'));

-- ---------------------------------------------------------------------------
-- Bonus button: back to plain points. +3, or Random -1 to 7.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.online_battle_claim_point(p_room_id uuid, p_kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_team text;
  v_answer_id uuid;
  v_points integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('three', 'random') THEN
    RAISE EXCEPTION 'Unknown bonus button';
  END IF;

  SELECT r.status INTO v_status FROM public.online_battle_rooms r WHERE r.id = p_room_id;
  IF v_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'not_active');
  END IF;

  SELECT p.team INTO v_team
  FROM public.online_battle_participants p
  WHERE p.room_id = p_room_id AND p.user_id = v_uid;
  IF v_team IS NULL THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'not_participant');
  END IF;

  -- One unclaimed correct answer to a revealed question. The row lock means two
  -- quick taps can never claim the same answer twice.
  SELECT a.id INTO v_answer_id
  FROM public.online_battle_answers a
  JOIN public.online_battle_questions q ON q.id = a.question_id
  WHERE a.room_id = p_room_id
    AND a.user_id = v_uid
    AND a.is_correct
    AND a.bonus_claimed_at IS NULL
    AND q.status = 'revealed'
  ORDER BY a.answered_at
  LIMIT 1
  FOR UPDATE OF a SKIP LOCKED;

  IF v_answer_id IS NULL THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'nothing_to_claim');
  END IF;

  v_points := CASE WHEN p_kind = 'three' THEN 3 ELSE floor(random() * 9)::integer - 1 END; -- Random: -1 to 7

  UPDATE public.online_battle_answers
  SET bonus_claimed_at = now(), bonus_kind = p_kind, bonus_points = v_points
  WHERE id = v_answer_id;

  -- Scores never go below zero
  UPDATE public.online_battle_rooms
  SET team_a_score = greatest(0, team_a_score + CASE WHEN v_team = 'a' THEN v_points ELSE 0 END),
      team_b_score = greatest(0, team_b_score + CASE WHEN v_team = 'b' THEN v_points ELSE 0 END)
  WHERE id = p_room_id;

  INSERT INTO public.online_battle_events (room_id, kind, team, user_id, points)
  VALUES (p_room_id, CASE WHEN p_kind = 'three' THEN 'bonus_three' ELSE 'bonus_random' END, v_team, v_uid, v_points);

  RETURN jsonb_build_object('claimed', true, 'team', v_team, 'points', v_points);
END;
$$;

-- ---------------------------------------------------------------------------
-- Power-up button: open it to get a random power-up for the latest question.
-- Returns { claimed: true, powerup } or { claimed: false, reason }.
-- The power-up is then used with online_battle_use_powerup (unchanged).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.online_battle_claim_powerup(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_team text;
  v_latest uuid;
  v_answer_id uuid;
  v_kind text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT r.status INTO v_status FROM public.online_battle_rooms r WHERE r.id = p_room_id;
  IF v_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'not_active');
  END IF;

  SELECT p.team INTO v_team
  FROM public.online_battle_participants p
  WHERE p.room_id = p_room_id AND p.user_id = v_uid;
  IF v_team IS NULL THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'not_participant');
  END IF;

  v_latest := public.online_battle_latest_question(p_room_id);

  SELECT a.id INTO v_answer_id
  FROM public.online_battle_answers a
  JOIN public.online_battle_questions q ON q.id = a.question_id
  WHERE a.room_id = p_room_id
    AND a.user_id = v_uid
    AND a.is_correct
    AND a.powerup_offered
    AND a.powerup_claimed_at IS NULL
    AND q.status = 'revealed'
    AND q.id = v_latest
  LIMIT 1
  FOR UPDATE OF a SKIP LOCKED;

  IF v_answer_id IS NULL THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'nothing_to_claim');
  END IF;

  v_kind := public.online_battle_roll_powerup();

  UPDATE public.online_battle_answers
  SET powerup_claimed_at = now(), bonus_powerup = v_kind
  WHERE id = v_answer_id;

  INSERT INTO public.online_battle_powerups (room_id, question_id, user_id, team, kind)
  VALUES (p_room_id, v_latest, v_uid, v_team, v_kind);

  INSERT INTO public.online_battle_events (room_id, kind, team, user_id, points, detail)
  VALUES (p_room_id, 'powerup_won', v_team, v_uid, 0, jsonb_build_object('powerup', v_kind));

  RETURN jsonb_build_object('claimed', true, 'powerup', v_kind);
END;
$$;

-- ---------------------------------------------------------------------------
-- Student state: same as before, plus me.powerup_offers (Power-up buttons lit now).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.online_battle_state(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room public.online_battle_rooms%ROWTYPE;
  v_me public.online_battle_participants%ROWTYPE;
  v_q public.online_battle_questions%ROWTYPE;
  v_answer record;
  v_question jsonb := NULL;
  v_revealed boolean;
  v_claimable integer := 0;
  v_powerup_offers integer := 0;
  v_powerups jsonb := '[]'::jsonb;
  v_latest uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT * INTO v_room FROM public.online_battle_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('server_now', now(), 'room', NULL);
  END IF;

  SELECT * INTO v_me
  FROM public.online_battle_participants p
  WHERE p.room_id = p_room_id AND p.user_id = v_uid;
  IF NOT FOUND THEN
    -- Not in the room (never joined, or removed by the teacher)
    RETURN jsonb_build_object('server_now', now(), 'room', NULL);
  END IF;

  IF v_room.status = 'active' THEN
    SELECT count(*) INTO v_claimable
    FROM public.online_battle_answers a
    JOIN public.online_battle_questions q ON q.id = a.question_id
    WHERE a.room_id = p_room_id
      AND a.user_id = v_uid
      AND a.is_correct
      AND a.bonus_claimed_at IS NULL
      AND q.status = 'revealed';

    v_latest := public.online_battle_latest_question(p_room_id);

    -- Power-up buttons lit right now: only for the latest question, after its reveal
    SELECT count(*) INTO v_powerup_offers
    FROM public.online_battle_answers a
    JOIN public.online_battle_questions q ON q.id = a.question_id
    WHERE a.room_id = p_room_id
      AND a.user_id = v_uid
      AND a.is_correct
      AND a.powerup_offered
      AND a.powerup_claimed_at IS NULL
      AND q.status = 'revealed'
      AND q.id = v_latest;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', pu.id,
             'kind', pu.kind,
             'question_revealed', q.status = 'revealed',
             -- What Double would add (known once the question is revealed)
             'double_points', CASE WHEN q.status = 'revealed'
                                   THEN coalesce(CASE WHEN v_me.team = 'a' THEN q.team_a_points ELSE q.team_b_points END, 0) END
           ) ORDER BY pu.created_at, pu.id), '[]'::jsonb)
    INTO v_powerups
    FROM public.online_battle_powerups pu
    JOIN public.online_battle_questions q ON q.id = pu.question_id
    WHERE pu.room_id = p_room_id
      AND pu.user_id = v_uid
      AND pu.used_at IS NULL
      AND pu.question_id = v_latest;
  END IF;

  IF v_room.current_question_id IS NOT NULL THEN
    SELECT * INTO v_q
    FROM public.online_battle_questions q
    WHERE q.id = v_room.current_question_id AND q.status IN ('open', 'revealed');

    IF FOUND THEN
      v_revealed := v_q.status = 'revealed';

      SELECT a.selected_option, a.is_correct INTO v_answer
      FROM public.online_battle_answers a
      WHERE a.question_id = v_q.id AND a.user_id = v_uid;

      v_question := jsonb_build_object(
        'id', v_q.id,
        'status', v_q.status,
        'question', v_q.question,
        'question_index', v_q.question_index,
        'time_limit_seconds', v_q.time_limit_seconds,
        'points_max', v_q.points_max,
        'opened_at', v_q.opened_at,
        'closes_at', v_q.closes_at,
        'my_answer', v_answer.selected_option,
        -- Only after the teacher reveals:
        'correct_answer', CASE WHEN v_revealed THEN v_q.correct_answer END,
        'my_correct', CASE WHEN v_revealed THEN v_answer.is_correct END,
        'team_a_total', CASE WHEN v_revealed THEN v_q.team_a_total END,
        'team_a_correct', CASE WHEN v_revealed THEN v_q.team_a_correct END,
        'team_a_points', CASE WHEN v_revealed THEN v_q.team_a_points END,
        'team_b_total', CASE WHEN v_revealed THEN v_q.team_b_total END,
        'team_b_correct', CASE WHEN v_revealed THEN v_q.team_b_correct END,
        'team_b_points', CASE WHEN v_revealed THEN v_q.team_b_points END
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'server_now', now(),
    'room', jsonb_build_object(
      'id', v_room.id,
      'course_id', v_room.course_id,
      'status', v_room.status,
      'team_a_name', v_room.team_a_name,
      'team_b_name', v_room.team_b_name,
      'team_a_score', v_room.team_a_score,
      'team_b_score', v_room.team_b_score,
      'winner_team', v_room.winner_team
    ),
    'me', jsonb_build_object(
      'team', v_me.team,
      'xp_awarded', v_me.xp_awarded,
      'claimable_points', v_claimable,
      'powerup_offers', v_powerup_offers,
      'powerups', v_powerups
    ),
    'participants', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id,
        'user_id', p.user_id,
        'user_pet_id', p.user_pet_id,
        'team', p.team,
        'xp_awarded', p.xp_awarded
      ) ORDER BY p.joined_at, p.id), '[]'::jsonb)
      FROM public.online_battle_participants p
      WHERE p.room_id = p_room_id
    ),
    'events', (
      SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC, e.id), '[]'::jsonb)
      FROM (
        SELECT ev.id, ev.created_at, ev.kind, ev.team, ev.user_id, ev.points, ev.detail
        FROM public.online_battle_events ev
        WHERE ev.room_id = p_room_id
        ORDER BY ev.created_at DESC, ev.id
        LIMIT 20
      ) e
    ),
    'question', v_question
  );
END;
$$;

REVOKE ALL ON FUNCTION public.online_battle_claim_powerup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.online_battle_claim_powerup(uuid) TO authenticated;

COMMIT;
