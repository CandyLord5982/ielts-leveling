-- How many graded items the exercise had when the try was made (questions, blanks, drop zones...).
-- Lets exercise lists show "answered / total" for unfinished tries straight from the database
-- (replaces the multiple-choice localStorage snapshot). total_count = items answered so far.
--
-- save_exercise_attempt gets an optional p_expected_count; calls without it keep working.

BEGIN;

ALTER TABLE public.exercise_attempts
  ADD COLUMN expected_count integer CHECK (expected_count IS NULL OR expected_count > 0);

COMMENT ON COLUMN public.exercise_attempts.expected_count IS
  'Graded items in the exercise for this try, sent by the browser; total_count is how many were answered';

DROP FUNCTION public.save_exercise_attempt(uuid, uuid, jsonb, timestamptz, boolean);

CREATE FUNCTION public.save_exercise_attempt(
  p_exercise_id uuid,
  p_attempt_id uuid,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_started_at timestamptz DEFAULT NULL,
  p_submit boolean DEFAULT false,
  p_expected_count integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_type text;
  v_attempt exercise_attempts%ROWTYPE;
  v_tries integer := 0;
  v_expected integer := CASE WHEN p_expected_count > 0 THEN p_expected_count END;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_attempt_id IS NULL THEN
    RAISE EXCEPTION 'p_attempt_id is required' USING ERRCODE = '22004';
  END IF;

  SELECT e.exercise_type INTO v_type FROM exercises e WHERE e.id = p_exercise_id;
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'Exercise not found' USING ERRCODE = 'P0002';
  END IF;

  LOOP
    SELECT * INTO v_attempt FROM exercise_attempts a WHERE a.id = p_attempt_id FOR UPDATE;
    EXIT WHEN FOUND;

    v_tries := v_tries + 1;
    IF v_tries > 5 THEN
      RAISE EXCEPTION 'Could not create attempt';
    END IF;

    BEGIN
      INSERT INTO exercise_attempts (id, user_id, exercise_id, attempt_number, started_at, expected_count)
      SELECT p_attempt_id, v_uid, p_exercise_id,
             coalesce(max(a.attempt_number), 0) + 1,
             -- trust the browser's start time only within reason
             least(now(), greatest(coalesce(p_started_at, now()), now() - interval '1 day')),
             v_expected
      FROM exercise_attempts a
      WHERE a.user_id = v_uid AND a.exercise_id = p_exercise_id;
    EXCEPTION WHEN unique_violation THEN
      -- Another tab took this attempt number (or created this id): look again
      NULL;
    END;
  END LOOP;

  IF v_attempt.user_id <> v_uid OR v_attempt.exercise_id <> p_exercise_id THEN
    RAISE EXCEPTION 'Attempt does not belong to this user and exercise' USING ERRCODE = '42501';
  END IF;

  INSERT INTO question_attempts (
    user_id, exercise_id, exercise_type, attempt_id, source,
    question_id, question_index, item_key, item_index,
    selected_answer, correct_answer, is_correct, response_ms
  )
  SELECT v_uid, p_exercise_id, v_type, p_attempt_id, 'exercise',
         i.question_id, i.question_index, coalesce(i.item_key, ''), coalesce(i.item_index, 0),
         i.selected_answer, i.correct_answer, coalesce(i.is_correct, false), i.response_ms
  FROM jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) AS i(
    question_id text, question_index integer, item_key text, item_index integer,
    selected_answer text, correct_answer text, is_correct boolean, response_ms integer
  )
  WHERE i.question_id IS NOT NULL
  ON CONFLICT ON CONSTRAINT question_attempts_attempt_item_key DO UPDATE SET
    question_index = excluded.question_index,
    item_index = excluded.item_index,
    selected_answer = excluded.selected_answer,
    correct_answer = excluded.correct_answer,
    is_correct = excluded.is_correct,
    response_ms = excluded.response_ms
  WHERE NOT question_attempts.manually_overridden;  -- a teacher's override wins

  IF p_submit OR (v_expected IS NOT NULL AND v_expected IS DISTINCT FROM v_attempt.expected_count) THEN
    UPDATE exercise_attempts
    SET expected_count = coalesce(v_expected, expected_count),
        status = CASE WHEN p_submit THEN 'submitted' ELSE status END,
        submitted_at = CASE WHEN p_submit THEN coalesce(submitted_at, now()) ELSE submitted_at END
    WHERE id = p_attempt_id;
  END IF;

  RETURN jsonb_build_object('attempt_id', v_attempt.id, 'attempt_number', v_attempt.attempt_number);
END;
$$;

REVOKE ALL ON FUNCTION public.save_exercise_attempt(uuid, uuid, jsonb, timestamptz, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_exercise_attempt(uuid, uuid, jsonb, timestamptz, boolean, integer) TO authenticated;

COMMIT;
