-- Let a teacher open a course to guests: anyone with the course link can do its exercises
-- without an account (they only enter a name, and earn no XP or rewards).
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS allow_guest_access boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.courses.allow_guest_access IS 'When true, visitors without an account can open /study/course/<id> and do the course exercises as guests.';
