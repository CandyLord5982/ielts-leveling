-- Tighten who can read and write attempt data.
--
-- Before: every signed-in user could read every student's answers (question_attempts
-- lockdown_read = true), and students could update/delete their own attempt rows directly.
-- get_student_weakness_by_course returned names + accuracy for any course to anyone, even anon.
--
-- After:
--   question_attempts   read: own rows or staff. Students insert only review-queue answers
--                       (source = 'review'); exercise answers go through save_exercise_attempt.
--                       No student update/delete. Staff keep full access (overrides, reset).
--   exercise_attempts   read: own or staff. Students write only through save_exercise_attempt.
--   save_exercise_attempt  now SECURITY DEFINER (students no longer have direct write access);
--                       it already checks the caller and that the try belongs to them.
--   get_student_weakness_by_course  staff only.
--
-- (select ...) around auth.uid()/is_staff() lets Postgres evaluate them once per query, not per row.

BEGIN;

-- ---------------------------------------------------------------------------
-- question_attempts
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users manage own question attempts" ON public.question_attempts;
DROP POLICY IF EXISTS lockdown_read ON public.question_attempts;
DROP POLICY IF EXISTS lockdown_own_write ON public.question_attempts;
DROP POLICY IF EXISTS lockdown_staff_write ON public.question_attempts;

CREATE POLICY question_attempts_read ON public.question_attempts
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_staff(auth.uid())));

CREATE POLICY question_attempts_own_review_insert ON public.question_attempts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND source = 'review' AND attempt_id IS NULL);

CREATE POLICY question_attempts_staff_write ON public.question_attempts
  FOR ALL TO authenticated
  USING ((SELECT public.is_staff(auth.uid())))
  WITH CHECK ((SELECT public.is_staff(auth.uid())));

REVOKE ALL ON public.question_attempts FROM anon;

-- ---------------------------------------------------------------------------
-- exercise_attempts
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS exercise_attempts_read ON public.exercise_attempts;
DROP POLICY IF EXISTS exercise_attempts_own_write ON public.exercise_attempts;
DROP POLICY IF EXISTS exercise_attempts_staff_write ON public.exercise_attempts;

CREATE POLICY exercise_attempts_read ON public.exercise_attempts
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_staff(auth.uid())));

CREATE POLICY exercise_attempts_staff_write ON public.exercise_attempts
  FOR ALL TO authenticated
  USING ((SELECT public.is_staff(auth.uid())))
  WITH CHECK ((SELECT public.is_staff(auth.uid())));

-- ---------------------------------------------------------------------------
-- save_exercise_attempt: the only way students write attempts
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.save_exercise_attempt(uuid, uuid, jsonb, timestamptz, boolean, integer)
  SECURITY DEFINER
  SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.save_exercise_attempt(uuid, uuid, jsonb, timestamptz, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_exercise_attempt(uuid, uuid, jsonb, timestamptz, boolean, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- get_student_weakness_by_course: same report, staff only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_student_weakness_by_course(p_course_id uuid)
RETURNS TABLE(user_id uuid, full_name text, avatar_url text, tag text, total_questions bigint, correct bigint, accuracy numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    qa.user_id,
    u.full_name,
    u.avatar_url,
    unnest(e.tags) AS tag,
    COUNT(*) AS total_questions,
    COUNT(*) FILTER (WHERE qa.is_correct) AS correct,
    ROUND(100.0 * COUNT(*) FILTER (WHERE qa.is_correct) / COUNT(*)) AS accuracy
  FROM question_attempts qa
  JOIN exercises e ON e.id = qa.exercise_id
  JOIN exercise_assignments ea ON ea.exercise_id = e.id
  JOIN sessions s ON s.id = ea.session_id
  JOIN units un ON un.id = s.unit_id
  JOIN users u ON u.id = qa.user_id AND u.role = 'user'
  WHERE public.is_staff(auth.uid())
    AND un.course_id = p_course_id
    AND e.tags IS NOT NULL
    AND array_length(e.tags, 1) > 0
  GROUP BY qa.user_id, u.full_name, u.avatar_url, unnest(e.tags)
  ORDER BY qa.user_id, accuracy ASC;
$$;

REVOKE ALL ON FUNCTION public.get_student_weakness_by_course(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_weakness_by_course(uuid) TO authenticated;

COMMIT;
