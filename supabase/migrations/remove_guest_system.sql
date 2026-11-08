-- Removes the guest/demo-visitor system entirely. The project has no real user
-- data yet, so this is a clean cut rather than a backward-compatible migration.

-- 1. Drop the anonymous-read policies that existed only to let guests (and the
--    separate /guest demo flow) browse courses/sessions/exercises without logging in.
DROP POLICY IF EXISTS "Allow anonymous read on sessions" ON public.sessions;
DROP POLICY IF EXISTS "Allow anonymous read on exercises" ON public.exercises;
DROP POLICY IF EXISTS "Allow anonymous read on exercise_assignments" ON public.exercise_assignments;
DROP POLICY IF EXISTS "Allow anonymous read on courses" ON public.courses;
DROP POLICY IF EXISTS "Allow anonymous read on units" ON public.units;
DROP POLICY IF EXISTS "Allow anonymous read on site_settings" ON public.site_settings;

-- 2. Drop the guest attempt/visitor tables and their policies (cascades drop the policies too).
DROP TABLE IF EXISTS public.guest_attempts;
DROP TABLE IF EXISTS public.guest_visitors;

-- 3. Drop the guest-access flag from courses, if present. (On this project the
--    exercise-bank-access migration and its allow_guest_access reads were never
--    applied, so there is no function to update here — just the column, if any.)
ALTER TABLE public.courses DROP COLUMN IF EXISTS allow_guest_access;
