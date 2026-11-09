-- Fixes "infinite recursion detected in policy for relation courses" after
-- rls_lockdown.sql: legacy SELECT policies on courses read course_enrollments,
-- and legacy SELECT policies on course_enrollments read courses. With RLS on
-- for both, each policy triggers the other.
--
-- Every policy dropped here is redundant: these tables already have a
-- SELECT policy open to all authenticated users, and permissive policies are
-- OR'd, so dropping them changes no one's read access.

BEGIN;

DROP POLICY IF EXISTS "Teachers view assigned courses" ON public.courses;
DROP POLICY IF EXISTS "Students view enrolled courses" ON public.courses;

DROP POLICY IF EXISTS "Students view own enrollments" ON public.course_enrollments;
DROP POLICY IF EXISTS "teacher_read_enrollments" ON public.course_enrollments;
DROP POLICY IF EXISTS "Teachers view course enrollments" ON public.course_enrollments;

-- Same pattern (joins back through courses / enrollments); redundant with the
-- open authenticated read on each table.
DROP POLICY IF EXISTS "teacher_read_units" ON public.units;
DROP POLICY IF EXISTS "teacher_read_sessions" ON public.sessions;
DROP POLICY IF EXISTS "teacher_read_exercises" ON public.exercises;
DROP POLICY IF EXISTS "teacher_read_user_progress" ON public.user_progress;
DROP POLICY IF EXISTS "Teachers view student progress" ON public.user_progress;

COMMIT;
