-- Online Battle: recent activity board.
--
-- Every score change in a room is logged as an event, so the teacher and every
-- student can see who got how many points and from what:
--   question      - a live question was revealed (team points, X of Y correct)
--   bonus_three   - a student used the +3 button
--   bonus_random  - a student used the Random button (-1 to 5)
--   manual        - the teacher gave or took points by hand
--
-- Run after add_online_battle_bonus_points.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS public.online_battle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.online_battle_rooms(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('question', 'bonus_three', 'bonus_random', 'manual')),
  team text NOT NULL CHECK (team IN ('a', 'b')),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  points integer NOT NULL,
  -- For 'question': { question_no, correct, total }
  detail jsonb
);

CREATE INDEX IF NOT EXISTS online_battle_events_room_idx
  ON public.online_battle_events (room_id, created_at DESC);

-- Staff read; only the functions below write. Students get events through online_battle_state().
ALTER TABLE public.online_battle_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read online battle events" ON public.online_battle_events;
CREATE POLICY "Staff read online battle events" ON public.online_battle_events
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- ---------------------------------------------------------------------------
-- Student bonus button: unchanged, plus an event.
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

  INSERT INTO public.online_battle_events (room_id, kind, team, user_id, points)
  VALUES (p_room_id, CASE WHEN p_kind = 'three' THEN 'bonus_three' ELSE 'bonus_random' END, v_team, v_uid, v_points);

  RETURN jsonb_build_object('claimed', true, 'team', v_team, 'points', v_points);
END;
$$;

-- ---------------------------------------------------------------------------
-- Staff points: now also logs an event. p_question_id is set when the points come
-- from revealing a live question, and left NULL for the teacher's manual buttons.
-- The old 3-argument version is replaced (keeping both would make calls ambiguous).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.online_battle_add_points(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.online_battle_add_points(
  p_room_id uuid,
  p_team_a integer,
  p_team_b integer,
  p_question_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a integer;
  v_b integer;
  v_q public.online_battle_questions%ROWTYPE;
  v_question_no integer;
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

  IF p_question_id IS NOT NULL THEN
    SELECT * INTO v_q
    FROM public.online_battle_questions q
    WHERE q.id = p_question_id AND q.room_id = p_room_id;
  END IF;

  IF v_q.id IS NOT NULL THEN
    -- Numbered by the order questions were revealed in this room
    SELECT count(*) INTO v_question_no
    FROM public.online_battle_questions q
    WHERE q.room_id = p_room_id AND q.status = 'revealed' AND q.opened_at <= v_q.opened_at;

    INSERT INTO public.online_battle_events (room_id, kind, team, points, detail)
    VALUES
      (p_room_id, 'question', 'a', coalesce(p_team_a, 0),
        jsonb_build_object('question_no', v_question_no, 'correct', v_q.team_a_correct, 'total', v_q.team_a_total)),
      (p_room_id, 'question', 'b', coalesce(p_team_b, 0),
        jsonb_build_object('question_no', v_question_no, 'correct', v_q.team_b_correct, 'total', v_q.team_b_total));
  ELSE
    IF coalesce(p_team_a, 0) <> 0 THEN
      INSERT INTO public.online_battle_events (room_id, kind, team, user_id, points)
      VALUES (p_room_id, 'manual', 'a', auth.uid(), p_team_a);
    END IF;
    IF coalesce(p_team_b, 0) <> 0 THEN
      INSERT INTO public.online_battle_events (room_id, kind, team, user_id, points)
      VALUES (p_room_id, 'manual', 'b', auth.uid(), p_team_b);
    END IF;
  END IF;

  RETURN jsonb_build_object('team_a_score', v_a, 'team_b_score', v_b);
END;
$$;

-- ---------------------------------------------------------------------------
-- Student state: same as before, plus the 20 most recent events.
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

REVOKE ALL ON FUNCTION public.online_battle_add_points(uuid, integer, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.online_battle_add_points(uuid, integer, integer, uuid) TO authenticated;

COMMIT;
