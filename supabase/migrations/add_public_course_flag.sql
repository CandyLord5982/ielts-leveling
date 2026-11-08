-- Lets a teacher/admin mark a course as public: any signed-in user (including an
-- anonymous trial session) can view and do its exercises without an enrollment row.
-- RLS already allows any authenticated session to SELECT courses/units/sessions/
-- exercises/exercise_assignments, so this only needs an app-level flag - the
-- enrollment check it bypasses lives in UnitList.jsx/ExerciseList.jsx/CourseList.jsx,
-- not in the database.
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.courses.is_public IS 'When true, any authenticated user (including anonymous trial sessions) can view this course and do its exercises without a course_enrollments row.';
