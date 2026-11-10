-- Online Battle: bonus point buttons for students.
--
-- Each time a student answers a live question correctly, two buttons on their
-- own screen light up after the reveal, like the team buttons in Live Battle:
--   * +3      - a safe 3 points for their team
--   * Random  - a random -1 to 5 points for their team (rolled here, not on the device)
-- They tap one. This is on top of the automatic team points, and each correct
-- answer can be used once.
--
-- Because students can now change the score too, scores are no longer written
-- as whole values by the teacher's page: every change is an atomic "+n" done in
-- the database, so a teacher's click and a student's tap can't overwrite each other.
--
-- Run after add_online_battle.sql.

BEGIN;

ALTER TABLE public.online_battle_answers
  ADD COLUMN IF NOT EXISTS bonus_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS bonus_kind text CHECK (bonus_kind IN ('three', 'random')),
  ADD COLUMN IF NOT EXISTS bonus_points integer;

-- ---------------------------------------------------------------------------
-- Student: use one correct answer on a bonus button for my team.
--   p_kind = 'three'  -> +3
--   p_kind = 'random' -> -1 to 5
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

  -- Same odds as the Random button in Live Battle: -1, 0, 1, 2, 3, 4 or 5
  v_points := CASE WHEN p_kind = 'three' THEN 3 ELSE floor(random() * 7)::integer - 1 END;

  UPDATE public.online_battle_answers
  SET bonus_claimed_at = now(), bonus_kind = p_kind, bonus_points = v_points
  WHERE id = v_answer_id;

  -- Scores never go below zero
  UPDATE public.online_battle_rooms
  SET team_a_score = greatest(0, team_a_score + CASE WHEN v_team = 'a' THEN v_points ELSE 0 END),
      team_b_score = greatest(0, team_b_score + CASE WHEN v_team = 'b' THEN v_points ELSE 0 END)
  WHERE id = p_room_id;

  RETURN jsonb_build_object('claimed', true, 'team', v_team, 'points', v_points);
END;
$$;

-- ---------------------------------------------------------------------------
-- Staff: add (or take away) team points. Scores never go below zero.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.online_battle_add_points(p_room_id uuid, p_team_a integer, p_team_b integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a integer;
  v_b integer;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only staff can change the score';
  END IF;

  UPDATE public.online_battle_rooms r
  SET team_a_score = greatest(0, r.team_a_score + coalesce(p_team_a, 0)),
      team_b_score = greatest(0, r.team_b_score + coalesce(p_team_b, 0))
  WHERE r.id = p_room_id AND r.status = 'active'
  RETURNING r.team_a_score, r.team_b_score INTO v_a, v_b;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This battle is not running';
  END IF;

  RETURN jsonb_build_object('team_a_score', v_a, 'team_b_score', v_b);
END;
$$;

-- ---------------------------------------------------------------------------
-- Student state: same as before, plus me.claimable_points (how many bonus
-- points this student can tap for right now).
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
      'claimable_points', v_claimable
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
    'question', v_question
  );
END;
$$;

REVOKE ALL ON FUNCTION public.online_battle_claim_point(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.online_battle_add_points(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.online_battle_claim_point(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.online_battle_add_points(uuid, integer, integer) TO authenticated;

COMMIT;
