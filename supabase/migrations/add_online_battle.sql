-- Online Battle: the teacher opens a room for a course, students join it from
-- their own devices, the teacher splits them into two teams, and everyone's
-- screen follows the room (scoreboard, or a live question the teacher shows).
-- Every answer is kept for reporting after class.
--
-- Separate from Live Battle (live_battle_* tables), which is not touched.
--
-- Access model:
--   * All four tables are staff-only through RLS (teacher / admin).
--   * Students never read the tables. They use SECURITY DEFINER functions:
--       online_battle_find_room(course)  - is there a room I can join?
--       online_battle_join(room)         - join it
--       online_battle_state(room)        - what should my screen show right now
--       online_battle_submit_answer()    - save my answer (graded on the server)
--     so the correct answer is not sent to a student before the reveal.
--   * online_battle_finish(room) (staff) ends the battle and awards XP.

BEGIN;

-- ---------------------------------------------------------------------------
-- Rooms
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_battle_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id),
  teacher_id uuid DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'active', 'finished')),
  team_a_name text NOT NULL DEFAULT 'Team Alpha',
  team_b_name text NOT NULL DEFAULT 'Team Beta',
  team_a_score integer NOT NULL DEFAULT 0,
  team_b_score integer NOT NULL DEFAULT 0,
  winner_team text CHECK (winner_team IN ('a', 'b', 'draw')),
  xp_winner integer NOT NULL DEFAULT 30 CHECK (xp_winner BETWEEN 0 AND 100),
  xp_loser integer NOT NULL DEFAULT 10 CHECK (xp_loser BETWEEN 0 AND 100),
  -- The question every student's screen is showing; NULL = scoreboard.
  current_question_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  -- Bumped on every change to the room; rooms nobody ended stop being
  -- offered to students once they have been quiet for 3 hours.
  last_activity_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS online_battle_rooms_course_idx
  ON public.online_battle_rooms (course_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.online_battle_room_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.last_activity_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS online_battle_room_touch ON public.online_battle_rooms;
CREATE TRIGGER online_battle_room_touch
  BEFORE UPDATE ON public.online_battle_rooms
  FOR EACH ROW EXECUTE FUNCTION public.online_battle_room_touch();

-- ---------------------------------------------------------------------------
-- Students who joined a room
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_battle_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.online_battle_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_pet_id uuid REFERENCES public.user_pets(id) ON DELETE SET NULL,
  team text NOT NULL CHECK (team IN ('a', 'b')),
  xp_awarded integer NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Questions shown live by the teacher
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_battle_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.online_battle_rooms(id) ON DELETE CASCADE,
  exercise_id uuid REFERENCES public.exercises(id) ON DELETE SET NULL,
  exercise_title text,
  question_index integer NOT NULL,
  -- Snapshot shown to students: { question, options, image_url }.
  -- Kept as a copy so reports stay correct if the exercise is edited later.
  question jsonb NOT NULL,
  correct_answer integer NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'revealed', 'cancelled')),
  time_limit_seconds integer NOT NULL DEFAULT 30 CHECK (time_limit_seconds BETWEEN 5 AND 600),
  points_max integer NOT NULL DEFAULT 10 CHECK (points_max >= 0),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closes_at timestamptz NOT NULL DEFAULT now(),
  revealed_at timestamptz,
  -- Filled in at reveal
  team_a_total integer,
  team_a_correct integer,
  team_a_points integer,
  team_b_total integer,
  team_b_correct integer,
  team_b_points integer,
  created_by uuid DEFAULT auth.uid() REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS online_battle_questions_room_idx
  ON public.online_battle_questions (room_id, opened_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'online_battle_rooms_current_question_fkey'
  ) THEN
    ALTER TABLE public.online_battle_rooms
      ADD CONSTRAINT online_battle_rooms_current_question_fkey
      FOREIGN KEY (current_question_id) REFERENCES public.online_battle_questions(id) ON DELETE SET NULL;
  END IF;
END;
$$;

-- The server clock decides when a question opens and closes, so a wrong clock
-- on the teacher's computer cannot lengthen or shorten the answer window.
CREATE OR REPLACE FUNCTION public.online_battle_question_set_times()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.opened_at := now();
    NEW.closes_at := now() + make_interval(secs => NEW.time_limit_seconds);
  ELSIF NEW.status = 'revealed' AND OLD.status <> 'revealed' THEN
    NEW.revealed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS online_battle_question_set_times ON public.online_battle_questions;
CREATE TRIGGER online_battle_question_set_times
  BEFORE INSERT OR UPDATE ON public.online_battle_questions
  FOR EACH ROW EXECUTE FUNCTION public.online_battle_question_set_times();

-- ---------------------------------------------------------------------------
-- One row per student per question
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.online_battle_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.online_battle_questions(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.online_battle_rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  team text NOT NULL CHECK (team IN ('a', 'b')),
  selected_option integer NOT NULL,
  is_correct boolean NOT NULL,
  response_ms integer,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, user_id)
);

CREATE INDEX IF NOT EXISTS online_battle_answers_room_idx ON public.online_battle_answers (room_id);
CREATE INDEX IF NOT EXISTS online_battle_answers_user_idx ON public.online_battle_answers (user_id);

-- ---------------------------------------------------------------------------
-- RLS: staff only. Students go through the functions below.
-- ---------------------------------------------------------------------------
ALTER TABLE public.online_battle_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_battle_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_battle_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_battle_answers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage online battle rooms" ON public.online_battle_rooms;
CREATE POLICY "Staff manage online battle rooms" ON public.online_battle_rooms
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff manage online battle participants" ON public.online_battle_participants;
CREATE POLICY "Staff manage online battle participants" ON public.online_battle_participants
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Staff manage online battle questions" ON public.online_battle_questions;
CREATE POLICY "Staff manage online battle questions" ON public.online_battle_questions
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- Answers are written only by online_battle_submit_answer(); nobody edits them.
DROP POLICY IF EXISTS "Staff read online battle answers" ON public.online_battle_answers;
CREATE POLICY "Staff read online battle answers" ON public.online_battle_answers
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- ---------------------------------------------------------------------------
-- Student: is there a room open for this course that I can join?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.online_battle_find_room(p_course_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room public.online_battle_rooms%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.course_enrollments e
    WHERE e.course_id = p_course_id AND e.student_id = v_uid AND e.is_active
  ) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_room
  FROM public.online_battle_rooms r
  WHERE r.course_id = p_course_id
    AND r.status IN ('lobby', 'active')
    AND r.last_activity_at > now() - interval '3 hours'
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'room_id', v_room.id,
    'status', v_room.status,
    'joined', EXISTS (
      SELECT 1 FROM public.online_battle_participants p
      WHERE p.room_id = v_room.id AND p.user_id = v_uid
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Student: join a room. Safe to call again (e.g. after a page refresh).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.online_battle_join(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room public.online_battle_rooms%ROWTYPE;
  v_count_a integer;
  v_count_b integer;
  v_pet_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT * INTO v_room FROM public.online_battle_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('joined', false, 'reason', 'not_found');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.online_battle_participants p
    WHERE p.room_id = p_room_id AND p.user_id = v_uid
  ) THEN
    RETURN jsonb_build_object('joined', true);
  END IF;

  IF v_room.status = 'finished' THEN
    RETURN jsonb_build_object('joined', false, 'reason', 'finished');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.course_enrollments e
    WHERE e.course_id = v_room.course_id AND e.student_id = v_uid AND e.is_active
  ) THEN
    RETURN jsonb_build_object('joined', false, 'reason', 'not_enrolled');
  END IF;

  -- New arrivals go to the smaller team; the teacher can reshuffle afterwards
  SELECT count(*) FILTER (WHERE p.team = 'a'), count(*) FILTER (WHERE p.team = 'b')
  INTO v_count_a, v_count_b
  FROM public.online_battle_participants p
  WHERE p.room_id = p_room_id;

  SELECT up.id INTO v_pet_id
  FROM public.user_pets up
  WHERE up.user_id = v_uid AND up.is_active
  LIMIT 1;

  INSERT INTO public.online_battle_participants (room_id, user_id, user_pet_id, team)
  VALUES (p_room_id, v_uid, v_pet_id, CASE WHEN v_count_a <= v_count_b THEN 'a' ELSE 'b' END)
  ON CONFLICT (room_id, user_id) DO NOTHING;

  RETURN jsonb_build_object('joined', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Student: what should my screen show right now?
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
    'me', jsonb_build_object('team', v_me.team, 'xp_awarded', v_me.xp_awarded),
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

-- ---------------------------------------------------------------------------
-- Student: save my answer. Graded here; the first answer is final.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.online_battle_submit_answer(p_question_id uuid, p_selected_option integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_q public.online_battle_questions%ROWTYPE;
  v_team text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT * INTO v_q FROM public.online_battle_questions WHERE id = p_question_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Question not found';
  END IF;

  -- 2 second grace for answers sent right as the timer hits zero
  IF v_q.status <> 'open' OR now() > v_q.closes_at + interval '2 seconds' THEN
    RETURN jsonb_build_object('saved', false, 'reason', 'closed');
  END IF;

  IF p_selected_option IS NULL
     OR p_selected_option < 0
     OR p_selected_option >= jsonb_array_length(coalesce(v_q.question -> 'options', '[]'::jsonb)) THEN
    RAISE EXCEPTION 'Invalid option';
  END IF;

  SELECT p.team INTO v_team
  FROM public.online_battle_participants p
  WHERE p.room_id = v_q.room_id AND p.user_id = v_uid;

  IF v_team IS NULL THEN
    RETURN jsonb_build_object('saved', false, 'reason', 'not_participant');
  END IF;

  INSERT INTO public.online_battle_answers
    (question_id, room_id, user_id, team, selected_option, is_correct, response_ms)
  VALUES (
    v_q.id, v_q.room_id, v_uid, v_team, p_selected_option,
    p_selected_option = v_q.correct_answer,
    greatest(0, (extract(epoch FROM (now() - v_q.opened_at)) * 1000)::integer)
  )
  ON CONFLICT (question_id, user_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('saved', false, 'reason', 'already_answered');
  END IF;

  RETURN jsonb_build_object('saved', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Staff: end the battle, pick the winner and award XP (once).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.online_battle_finish(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.online_battle_rooms%ROWTYPE;
  v_p record;
  v_xp integer;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only staff can end a battle';
  END IF;

  -- The status guard makes a second call a no-op, so XP is never awarded twice
  UPDATE public.online_battle_rooms r
  SET status = 'finished',
      finished_at = now(),
      current_question_id = NULL,
      winner_team = CASE
        WHEN r.team_a_score > r.team_b_score THEN 'a'
        WHEN r.team_b_score > r.team_a_score THEN 'b'
        ELSE 'draw'
      END
  WHERE r.id = p_room_id AND r.status = 'active'
  RETURNING * INTO v_room;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This battle is not running';
  END IF;

  UPDATE public.online_battle_questions
  SET status = 'cancelled'
  WHERE room_id = p_room_id AND status = 'open';

  FOR v_p IN
    SELECT p.id, p.user_id, p.team FROM public.online_battle_participants p WHERE p.room_id = p_room_id
  LOOP
    v_xp := CASE
      WHEN v_room.winner_team = 'draw' THEN (v_room.xp_winner + v_room.xp_loser) / 2
      WHEN v_p.team = v_room.winner_team THEN v_room.xp_winner
      ELSE v_room.xp_loser
    END;

    UPDATE public.online_battle_participants SET xp_awarded = v_xp WHERE id = v_p.id;
    IF v_xp > 0 THEN
      PERFORM public.increment_user_currency(v_p.user_id, v_xp, 0);
    END IF;
  END LOOP;

  RETURN to_jsonb(v_room);
END;
$$;

REVOKE ALL ON FUNCTION public.online_battle_find_room(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.online_battle_join(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.online_battle_state(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.online_battle_submit_answer(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.online_battle_finish(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.online_battle_find_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.online_battle_join(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.online_battle_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.online_battle_submit_answer(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.online_battle_finish(uuid) TO authenticated;

COMMIT;
