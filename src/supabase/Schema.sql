-- Schema for IELTS Leveling LMS
-- Table order follows foreign key dependencies for fresh database setup.

CREATE TABLE public.pet_question_bank (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  question text NOT NULL,
  choices jsonb NOT NULL,          -- e.g. ["cat","dog","bird","fish"]
  answer_index integer NOT NULL,   -- 0-based index into choices
  image_url text,
  category text,
  min_level integer DEFAULT 1,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pet_question_bank_pkey PRIMARY KEY (id)
);

CREATE TABLE public.achievements (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  description text,
  icon text,
  criteria jsonb NOT NULL,
  xp_reward integer DEFAULT 0,
  badge_color text DEFAULT 'blue'::text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  badge_image_url text,
  badge_image_alt text DEFAULT 'Achievement Badge'::text,
  criteria_type text DEFAULT 'exercise_completed'::text,
  criteria_value integer DEFAULT 1,
  criteria_period text DEFAULT 'all_time'::text,
  CONSTRAINT achievements_pkey PRIMARY KEY (id)
);
CREATE TABLE public.avatars (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  image_url text NOT NULL,
  unlock_xp integer NOT NULL DEFAULT 0,
  description text,
  tier text NOT NULL CHECK (tier = ANY (ARRAY['default'::text, 'bronze'::text, 'silver'::text, 'gold'::text, 'platinum'::text, 'diamond'::text])),
  is_active boolean DEFAULT true,
  is_default boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT avatars_pkey PRIMARY KEY (id)
);
CREATE TABLE public.site_settings (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  setting_key text NOT NULL UNIQUE,
  setting_value text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT site_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.student_levels (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  level_number integer NOT NULL UNIQUE,
  xp_required integer NOT NULL,
  badge_name text NOT NULL,
  badge_tier text NOT NULL CHECK (badge_tier = ANY (ARRAY['bronze'::text, 'silver'::text, 'gold'::text, 'platinum'::text, 'diamond'::text])),
  badge_icon text,
  badge_color text NOT NULL,
  badge_description text,
  title_unlocked text,
  perks_unlocked jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT student_levels_pkey PRIMARY KEY (id)
);
CREATE TABLE public.student_levels_backup (
  id uuid,
  level_number integer,
  xp_required integer,
  badge_name text,
  badge_tier text,
  badge_icon text,
  badge_color text,
  badge_description text,
  title_unlocked text,
  perks_unlocked jsonb,
  is_active boolean,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
);
CREATE TABLE public.shop_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  category text NOT NULL,
  price integer NOT NULL,
  image_url text,
  item_data jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT shop_items_pkey PRIMARY KEY (id)
);
CREATE TABLE public.exercise_folders (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  parent_folder_id uuid,
  description text,
  color text DEFAULT 'blue'::text,
  icon text DEFAULT 'folder'::text,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT exercise_folders_pkey PRIMARY KEY (id),
  CONSTRAINT exercise_folders_parent_folder_id_fkey FOREIGN KEY (parent_folder_id) REFERENCES public.exercise_folders(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL,
  email text NOT NULL,
  full_name text,
  real_name text,
  avatar_url text,
  real_avatar_url text,
  role text DEFAULT 'user'::text CHECK (role = ANY (ARRAY['user'::text, 'admin'::text, 'teacher'::text])),
  current_level integer DEFAULT 1,
  xp integer DEFAULT 0,
  streak_count integer DEFAULT 0,
  last_activity_date date,
  total_practice_time integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  level integer DEFAULT 1,
  username text UNIQUE,
  gems integer DEFAULT 0,
  name_changed_at timestamp with time zone,
  energy integer DEFAULT 100 CHECK (energy >= 0 AND energy <= 100),
  energy_last_reset date DEFAULT CURRENT_DATE,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE public.user_equipment (
  user_id uuid NOT NULL,
  active_title text,
  active_frame_ratio text,
  hide_frame boolean DEFAULT false,
  active_background_url text,
  active_bowl_url text,
  active_spaceship_url text,
  active_spaceship_laser text,
  active_boat_url text,
  active_hammer_url text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_equipment_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_equipment_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);
CREATE TABLE public.cohorts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  created_by uuid,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cohorts_pkey PRIMARY KEY (id),
  CONSTRAINT cohorts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE TABLE public.courses (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  description text,
  level_number integer NOT NULL UNIQUE,
  difficulty_label text NOT NULL,
  color_theme text DEFAULT 'blue'::text,
  unlock_requirement integer DEFAULT 0,
  is_active boolean DEFAULT true,
  thumbnail_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  teacher_id uuid,
  chest_enabled boolean DEFAULT false,
  CONSTRAINT courses_pkey PRIMARY KEY (id),
  CONSTRAINT courses_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE TABLE public.cohort_members (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  cohort_id uuid,
  student_id uuid,
  joined_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cohort_members_pkey PRIMARY KEY (id),
  CONSTRAINT cohort_members_cohort_id_fkey FOREIGN KEY (cohort_id) REFERENCES public.cohorts(id),
  CONSTRAINT cohort_members_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE
);
CREATE TABLE public.class_wars (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  course_id uuid NOT NULL,
  name text DEFAULT 'Class War',
  team_a_name text DEFAULT 'Red Team',
  team_b_name text DEFAULT 'Blue Team',
  status text DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  started_at timestamp with time zone DEFAULT now(),
  ended_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT class_wars_pkey PRIMARY KEY (id),
  CONSTRAINT class_wars_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT class_wars_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.class_war_members (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  war_id uuid NOT NULL,
  user_id uuid NOT NULL,
  team text NOT NULL CHECK (team IN ('A', 'B')),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT class_war_members_pkey PRIMARY KEY (id),
  CONSTRAINT class_war_members_war_id_fkey FOREIGN KEY (war_id) REFERENCES public.class_wars(id) ON DELETE CASCADE,
  CONSTRAINT class_war_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT class_war_members_unique UNIQUE (war_id, user_id)
);
CREATE TABLE public.course_enrollments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  course_id uuid,
  student_id uuid,
  assigned_by uuid,
  assigned_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT course_enrollments_pkey PRIMARY KEY (id),
  CONSTRAINT course_enrollments_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT course_enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT course_enrollments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE TABLE public.course_progress (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  course_id uuid,
  status text DEFAULT 'locked'::text CHECK (status = ANY (ARRAY['locked'::text, 'available'::text, 'in_progress'::text, 'completed'::text])),
  progress_percentage integer DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  units_completed integer DEFAULT 0,
  total_units integer DEFAULT 0,
  xp_earned integer DEFAULT 0,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT course_progress_pkey PRIMARY KEY (id),
  CONSTRAINT level_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT level_progress_level_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id)
);
CREATE TABLE public.course_teachers (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  course_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT course_teachers_pkey PRIMARY KEY (id),
  CONSTRAINT course_teachers_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT course_teachers_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.users(id) ON DELETE CASCADE
);
CREATE TABLE public.units (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  course_id uuid,
  title text NOT NULL,
  description text,
  unit_number integer NOT NULL,
  color_theme text DEFAULT 'blue'::text,
  unlock_requirement integer DEFAULT 0,
  is_active boolean DEFAULT true,
  thumbnail_url text,
  estimated_duration integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  assigned_student_id uuid,
  CONSTRAINT units_pkey PRIMARY KEY (id),
  CONSTRAINT units_level_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT units_assigned_student_fkey FOREIGN KEY (assigned_student_id) REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE TABLE public.sessions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  unit_id uuid,
  title text NOT NULL,
  description text,
  session_number integer NOT NULL,
  session_type text DEFAULT 'mixed'::text CHECK (session_type = ANY (ARRAY['vocabulary'::text, 'grammar'::text, 'pronunciation'::text, 'listening'::text, 'mixed'::text])),
  difficulty_level integer DEFAULT 1 CHECK (difficulty_level >= 1 AND difficulty_level <= 5),
  xp_reward integer DEFAULT 50,
  unlock_requirement text,
  is_active boolean DEFAULT true,
  thumbnail_url text,
  estimated_duration integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_test boolean DEFAULT false,
  time_limit_minutes integer DEFAULT 30,
  passing_score integer DEFAULT 70,
  max_attempts integer DEFAULT 1,
  assigned_student_id uuid,
  open_date timestamp with time zone,
  close_date timestamp with time zone,
  CONSTRAINT sessions_pkey PRIMARY KEY (id),
  CONSTRAINT sessions_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id),
  CONSTRAINT sessions_assigned_student_fkey FOREIGN KEY (assigned_student_id) REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE TABLE public.exercises (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  session_id uuid,
  title text NOT NULL,
  exercise_type text NOT NULL CHECK (exercise_type = ANY (ARRAY['flashcard'::text, 'pronunciation'::text, 'fill_blank'::text, 'video'::text, 'quiz'::text, 'multiple_choice'::text, 'listening'::text, 'speaking'::text, 'drag_drop'::text, 'dropdown'::text, 'ai_fill_blank'::text, 'image_hotspot'::text])),
  content jsonb NOT NULL,
  image_urls text[],
  difficulty_level integer DEFAULT 1 CHECK (difficulty_level >= 1 AND difficulty_level <= 5),
  xp_reward integer DEFAULT 10,
  order_index integer NOT NULL,
  is_active boolean DEFAULT true,
  estimated_duration integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  folder_id uuid,
  is_in_bank boolean DEFAULT false,
  tags text[],
  category text,
  description text,
  CONSTRAINT exercises_pkey PRIMARY KEY (id),
  CONSTRAINT exercises_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id),
  CONSTRAINT exercises_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.exercise_folders(id)
);
CREATE TABLE public.exercise_assignments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  exercise_id uuid,
  session_id uuid,
  order_index integer NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT exercise_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT exercise_assignments_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id),
  CONSTRAINT exercise_assignments_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id)
);
CREATE TABLE public.question_attempts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  exercise_id uuid,
  exercise_type text,
  question_id text NOT NULL,
  selected_answer text,
  correct_answer text,
  is_correct boolean NOT NULL,
  attempt_number integer DEFAULT 1,
  response_time integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT question_attempts_pkey PRIMARY KEY (id),
  CONSTRAINT question_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT question_attempts_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id)
);
CREATE TABLE public.session_progress (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  session_id uuid,
  status text DEFAULT 'locked'::text CHECK (status = ANY (ARRAY['locked'::text, 'available'::text, 'in_progress'::text, 'completed'::text])),
  progress_percentage integer DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
  exercises_completed integer DEFAULT 0,
  total_exercises integer DEFAULT 0,
  xp_earned integer DEFAULT 0,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT session_progress_pkey PRIMARY KEY (id),
  CONSTRAINT session_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT session_progress_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id)
);
CREATE TABLE public.session_reward_claims (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  full_name text,
  xp_awarded integer NOT NULL DEFAULT 0,
  gems_awarded integer DEFAULT 0,
  claimed_at timestamp with time zone DEFAULT now(),
  CONSTRAINT session_reward_claims_pkey PRIMARY KEY (id),
  CONSTRAINT session_reward_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT session_reward_claims_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id)
);
CREATE TABLE public.unit_reward_claims (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  xp_awarded integer NOT NULL CHECK (xp_awarded >= 5 AND xp_awarded <= 20),
  claimed_at timestamp with time zone DEFAULT now(),
  full_name text,
  CONSTRAINT unit_reward_claims_pkey PRIMARY KEY (id),
  CONSTRAINT unit_reward_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT unit_reward_claims_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id)
);
CREATE TABLE public.user_achievements (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  achievement_id uuid,
  earned_at timestamp with time zone DEFAULT now(),
  claimed_at timestamp with time zone,
  xp_claimed integer DEFAULT 0,
  CONSTRAINT user_achievements_pkey PRIMARY KEY (id),
  CONSTRAINT user_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT user_achievements_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES public.achievements(id)
);
CREATE TABLE public.user_progress (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  course_id uuid,
  unit_id uuid,
  session_id uuid,
  exercise_id uuid,
  status text DEFAULT 'not_started'::text CHECK (status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text, 'attempted'::text])),
  score integer,
  max_score integer,
  attempts integer DEFAULT 0,
  time_spent integer DEFAULT 0,
  first_attempt_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  question_index integer DEFAULT 0,
  xp_earned integer DEFAULT 0,
  full_name text,
  exercise_title text,
  CONSTRAINT user_progress_pkey PRIMARY KEY (id),
  CONSTRAINT user_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT user_progress_level_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT user_progress_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id),
  CONSTRAINT user_progress_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id),
  CONSTRAINT user_progress_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id)
);
CREATE TABLE public.user_purchases (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  item_id uuid NOT NULL,
  purchased_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_purchases_pkey PRIMARY KEY (id),
  CONSTRAINT user_purchases_user_id_item_id_key UNIQUE (user_id, item_id),
  CONSTRAINT user_purchases_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT user_purchases_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.shop_items(id)
);
CREATE TABLE public.weekly_xp_tracking (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  week_start_date date NOT NULL,
  week_end_date date NOT NULL,
  total_xp integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT weekly_xp_tracking_pkey PRIMARY KEY (id),
  CONSTRAINT weekly_xp_tracking_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- ====================================
-- ====================================
-- DAILY CHALLENGE SYSTEM
-- ====================================

-- Add gem_reward column to achievements table (if not exists)
ALTER TABLE public.achievements ADD COLUMN IF NOT EXISTS gem_reward integer DEFAULT 0;

-- Daily Challenges Table
CREATE TABLE IF NOT EXISTS public.daily_challenges (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  challenge_date date NOT NULL,
  difficulty_level text NOT NULL,
  exercise_id uuid NOT NULL,
  base_xp_reward integer DEFAULT 50,
  base_gem_reward integer DEFAULT 5,
  top1_achievement_id uuid,
  top2_achievement_id uuid,
  top3_achievement_id uuid,
  is_active boolean DEFAULT true,
  winners_awarded boolean DEFAULT false,
  is_locked boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT daily_challenges_pkey PRIMARY KEY (id),
  CONSTRAINT daily_challenges_date_level_key UNIQUE (challenge_date, difficulty_level),
  CONSTRAINT daily_challenges_difficulty_level_check CHECK (difficulty_level = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text])),
  CONSTRAINT daily_challenges_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id),
  CONSTRAINT daily_challenges_top1_achievement_id_fkey FOREIGN KEY (top1_achievement_id) REFERENCES public.achievements(id),
  CONSTRAINT daily_challenges_top2_achievement_id_fkey FOREIGN KEY (top2_achievement_id) REFERENCES public.achievements(id),
  CONSTRAINT daily_challenges_top3_achievement_id_fkey FOREIGN KEY (top3_achievement_id) REFERENCES public.achievements(id)
);

CREATE INDEX IF NOT EXISTS idx_daily_challenges_date_level ON public.daily_challenges(challenge_date DESC, difficulty_level);
CREATE INDEX IF NOT EXISTS idx_daily_challenges_active ON public.daily_challenges(is_active, challenge_date);
CREATE INDEX IF NOT EXISTS idx_daily_challenges_locked ON public.daily_challenges(is_locked, challenge_date);

-- Daily Challenge Participations Table
CREATE TABLE IF NOT EXISTS public.daily_challenge_participations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  challenge_id uuid NOT NULL,
  user_id uuid NOT NULL,
  score integer NOT NULL,
  time_spent integer NOT NULL,
  attempts integer DEFAULT 1,
  completed_at timestamp with time zone DEFAULT now(),
  base_reward_claimed boolean DEFAULT false,
  rank_calculated integer,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT daily_challenge_participations_pkey PRIMARY KEY (id),
  CONSTRAINT daily_challenge_participations_unique UNIQUE (challenge_id, user_id),
  CONSTRAINT daily_challenge_participations_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.daily_challenges(id) ON DELETE CASCADE,
  CONSTRAINT daily_challenge_participations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT daily_challenge_participations_score_check CHECK (score >= 0 AND score <= 100),
  CONSTRAINT daily_challenge_participations_attempts_check CHECK (attempts >= 1 AND attempts <= 3)
);

CREATE INDEX IF NOT EXISTS idx_challenge_participations_ranking ON public.daily_challenge_participations(challenge_id, score DESC, time_spent ASC);
CREATE INDEX IF NOT EXISTS idx_challenge_participations_user ON public.daily_challenge_participations(user_id, completed_at DESC);

-- Daily Challenge Individual Attempts Table
-- Tracks each individual attempt with its own timing and score
CREATE TABLE IF NOT EXISTS public.daily_challenge_attempts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  participation_id uuid NOT NULL,
  challenge_id uuid NOT NULL,
  user_id uuid NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number >= 1 AND attempt_number <= 3),
  score integer NOT NULL CHECK (score >= 0 AND score <= 100),
  started_at timestamp with time zone NOT NULL,
  completed_at timestamp with time zone NOT NULL,
  time_spent integer NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT daily_challenge_attempts_pkey PRIMARY KEY (id),
  CONSTRAINT daily_challenge_attempts_participation_id_fkey
    FOREIGN KEY (participation_id) REFERENCES public.daily_challenge_participations(id) ON DELETE CASCADE,
  CONSTRAINT daily_challenge_attempts_challenge_id_fkey
    FOREIGN KEY (challenge_id) REFERENCES public.daily_challenges(id) ON DELETE CASCADE,
  CONSTRAINT daily_challenge_attempts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT daily_challenge_attempts_unique
    UNIQUE (challenge_id, user_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_challenge_attempts_participation
  ON public.daily_challenge_attempts(participation_id, attempt_number);
CREATE INDEX IF NOT EXISTS idx_challenge_attempts_ranking
  ON public.daily_challenge_attempts(challenge_id, score DESC, time_spent ASC);

-- Add columns to daily_challenge_participations to reference best attempt
ALTER TABLE public.daily_challenge_participations
  ADD COLUMN IF NOT EXISTS best_attempt_id uuid,
  ADD COLUMN IF NOT EXISTS first_attempt_at timestamp with time zone;

-- Add foreign key constraint for best_attempt_id (must be added after column creation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'daily_challenge_participations_best_attempt_id_fkey'
  ) THEN
    ALTER TABLE public.daily_challenge_participations
      ADD CONSTRAINT daily_challenge_participations_best_attempt_id_fkey
        FOREIGN KEY (best_attempt_id) REFERENCES public.daily_challenge_attempts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_participations_best_attempt
  ON public.daily_challenge_participations(best_attempt_id);

-- One-time migration: Create attempt records from existing participations
-- This creates a single attempt record for each existing participation
DO $$
DECLARE
  participation_rec RECORD;
  new_attempt_id uuid;
  migration_count integer := 0;
BEGIN
  FOR participation_rec IN
    SELECT id, challenge_id, user_id, score, time_spent, completed_at, created_at
    FROM daily_challenge_participations
    WHERE best_attempt_id IS NULL  -- Only migrate unmigrated records
  LOOP
    -- Create one attempt record representing their known best attempt
    INSERT INTO daily_challenge_attempts (
      participation_id, challenge_id, user_id, attempt_number,
      score, started_at, completed_at, time_spent, created_at
    ) VALUES (
      participation_rec.id,
      participation_rec.challenge_id,
      participation_rec.user_id,
      1,  -- Assume their first/best attempt
      participation_rec.score,
      participation_rec.completed_at - (participation_rec.time_spent || ' seconds')::interval,
      participation_rec.completed_at,
      participation_rec.time_spent,
      participation_rec.created_at
    )
    RETURNING id INTO new_attempt_id;

    -- Link participation to this attempt
    UPDATE daily_challenge_participations
    SET
      best_attempt_id = new_attempt_id,
      first_attempt_at = participation_rec.completed_at - (participation_rec.time_spent || ' seconds')::interval
    WHERE id = participation_rec.id;

    migration_count := migration_count + 1;
  END LOOP;

  RAISE NOTICE 'Migration complete: % participation records migrated to attempts', migration_count;
END $$;

-- Achievement records for daily challenges
-- Beginner Level (Levels 1-10)
INSERT INTO public.achievements (title, description, icon, criteria_type, criteria_value, xp_reward, gem_reward, badge_color, is_active, criteria)
VALUES
('Beginner Champion', 'Hạng 1 Daily Challenge (Beginner)', 'Crown', 'daily_challenge_rank_1_beginner', 1, 80, 15, 'yellow', true, '{"type": "daily_challenge_rank_1_beginner", "value": 1}'::jsonb),
('Beginner Runner-up', 'Hạng 2 Daily Challenge (Beginner)', 'Medal', 'daily_challenge_rank_2_beginner', 2, 60, 12, 'silver', true, '{"type": "daily_challenge_rank_2_beginner", "value": 2}'::jsonb),
('Beginner Elite', 'Hạng 3 Daily Challenge (Beginner)', 'Trophy', 'daily_challenge_rank_3_beginner', 3, 40, 8, 'orange', true, '{"type": "daily_challenge_rank_3_beginner", "value": 3}'::jsonb)
ON CONFLICT DO NOTHING;

-- Intermediate Level (Levels 11-20)
INSERT INTO public.achievements (title, description, icon, criteria_type, criteria_value, xp_reward, gem_reward, badge_color, is_active, criteria)
VALUES
('Intermediate Champion', 'Hạng 1 Daily Challenge (Intermediate)', 'Crown', 'daily_challenge_rank_1_intermediate', 1, 120, 20, 'yellow', true, '{"type": "daily_challenge_rank_1_intermediate", "value": 1}'::jsonb),
('Intermediate Runner-up', 'Hạng 2 Daily Challenge (Intermediate)', 'Medal', 'daily_challenge_rank_2_intermediate', 2, 90, 15, 'silver', true, '{"type": "daily_challenge_rank_2_intermediate", "value": 2}'::jsonb),
('Intermediate Elite', 'Hạng 3 Daily Challenge (Intermediate)', 'Trophy', 'daily_challenge_rank_3_intermediate', 3, 60, 12, 'orange', true, '{"type": "daily_challenge_rank_3_intermediate", "value": 3}'::jsonb)
ON CONFLICT DO NOTHING;

-- Advanced Level (Levels 21-30)
INSERT INTO public.achievements (title, description, icon, criteria_type, criteria_value, xp_reward, gem_reward, badge_color, is_active, criteria)
VALUES
('Advanced Champion', 'Hạng 1 Daily Challenge (Advanced)', 'Crown', 'daily_challenge_rank_1_advanced', 1, 160, 25, 'yellow', true, '{"type": "daily_challenge_rank_1_advanced", "value": 1}'::jsonb),
('Advanced Runner-up', 'Hạng 2 Daily Challenge (Advanced)', 'Medal', 'daily_challenge_rank_2_advanced', 2, 120, 20, 'silver', true, '{"type": "daily_challenge_rank_2_advanced", "value": 2}'::jsonb),
('Advanced Elite', 'Hạng 3 Daily Challenge (Advanced)', 'Trophy', 'daily_challenge_rank_3_advanced', 3, 80, 16, 'orange', true, '{"type": "daily_challenge_rank_3_advanced", "value": 3}'::jsonb)
ON CONFLICT DO NOTHING;

-- ====================================
-- RPC FUNCTIONS FOR DAILY CHALLENGES
-- ====================================

-- Function: Get today's challenge for user based on their level
CREATE OR REPLACE FUNCTION get_user_daily_challenge(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  vietnam_today date;
  user_difficulty text;
  user_level_num integer;
  challenge_record record;
  user_participation record;
  result json;
BEGIN
  -- Get today's date in Vietnam timezone
  vietnam_today := (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

  -- Get user's current level number directly from users table
  SELECT current_level INTO user_level_num
  FROM users
  WHERE id = p_user_id;

  -- Determine difficulty based on level number
  IF user_level_num IS NULL OR user_level_num <= 10 THEN
    user_difficulty := 'beginner'; -- Levels 1-10
  ELSIF user_level_num <= 20 THEN
    user_difficulty := 'intermediate'; -- Levels 11-20
  ELSE
    user_difficulty := 'advanced'; -- Levels 21-30
  END IF;

  -- Get today's challenge for user's difficulty
  SELECT * INTO challenge_record
  FROM daily_challenges
  WHERE challenge_date = vietnam_today
    AND difficulty_level = user_difficulty
    AND is_active = true
  LIMIT 1;

  IF challenge_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No challenge available');
  END IF;

  -- Check user participation
  SELECT * INTO user_participation
  FROM daily_challenge_participations
  WHERE challenge_id = challenge_record.id AND user_id = p_user_id;

  -- Build result with exercise details
  SELECT json_build_object(
    'success', true,
    'challenge_id', challenge_record.id,
    'difficulty_level', challenge_record.difficulty_level,
    'exercise_id', challenge_record.exercise_id,
    'exercise_title', e.title,
    'exercise_type', e.exercise_type,
    'base_xp_reward', challenge_record.base_xp_reward,
    'base_gem_reward', challenge_record.base_gem_reward,
    'is_locked', challenge_record.is_locked,
    'winners_awarded', challenge_record.winners_awarded,
    'participated', (user_participation IS NOT NULL),
    'user_score', user_participation.score,
    'user_rank', (
      -- Calculate rank dynamically instead of using cached rank_calculated
      CASE
        WHEN user_participation.score >= 75 THEN
          (SELECT COUNT(*) + 1
           FROM daily_challenge_participations dcp
           WHERE dcp.challenge_id = challenge_record.id
             AND dcp.score >= 75
             AND (dcp.score > user_participation.score
               OR (dcp.score = user_participation.score
                 AND dcp.time_spent < user_participation.time_spent)))
        ELSE NULL
      END
    ),
    'user_time', user_participation.time_spent,
    'attempts_used', COALESCE(user_participation.attempts, 0),
    'max_attempts', 3,
    'session_id', e.session_id
  ) INTO result
  FROM exercises e
  WHERE e.id = challenge_record.exercise_id;

  RETURN result;
END;
$$;

-- Function: Record challenge participation with 3-attempt limit (tracks all attempts, rewards only 75%+)
CREATE OR REPLACE FUNCTION record_challenge_participation(
  p_challenge_id uuid,
  p_user_id uuid,
  p_score integer,
  p_time_spent integer,
  p_started_at timestamp with time zone DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  challenge_record record;
  existing_participation record;
  participation_id uuid;
  user_rank integer;
  base_xp integer;
  base_gems integer;
  attempts_used integer;
  new_attempt_id uuid;
  is_passing boolean;
BEGIN
  -- Check if score passes minimum threshold
  is_passing := p_score >= 75;

  -- Get challenge details
  SELECT * INTO challenge_record
  FROM daily_challenges
  WHERE id = p_challenge_id AND is_active = true;

  IF challenge_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Challenge not found');
  END IF;

  -- Check if challenge is locked
  IF challenge_record.is_locked = true THEN
    RETURN json_build_object('success', false, 'error', 'Challenge is locked. Winners have been awarded.');
  END IF;

  -- Check user role
  IF EXISTS (SELECT 1 FROM users WHERE id = p_user_id AND role IN ('teacher', 'admin')) THEN
    RETURN json_build_object('success', false, 'error', 'Only students can participate');
  END IF;

  -- Check existing participation
  SELECT * INTO existing_participation
  FROM daily_challenge_participations
  WHERE challenge_id = p_challenge_id AND user_id = p_user_id;

  -- Enforce 3 attempt limit
  IF existing_participation IS NOT NULL AND existing_participation.attempts >= 3 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Maximum 3 attempts reached',
      'attempts_used', existing_participation.attempts
    );
  END IF;

  attempts_used := COALESCE(existing_participation.attempts, 0) + 1;

  -- Insert or update participation (track all attempts, but only update score if passing)
  INSERT INTO daily_challenge_participations (
    challenge_id, user_id, score, time_spent, attempts, completed_at
  ) VALUES (
    p_challenge_id, p_user_id, p_score, p_time_spent, attempts_used, NOW()
  )
  ON CONFLICT (challenge_id, user_id)
  DO UPDATE SET
    score = CASE
      WHEN EXCLUDED.score >= 75 THEN GREATEST(daily_challenge_participations.score, EXCLUDED.score)
      ELSE daily_challenge_participations.score
    END,
    time_spent = CASE
      WHEN EXCLUDED.score >= 75 AND EXCLUDED.score > daily_challenge_participations.score THEN EXCLUDED.time_spent
      WHEN EXCLUDED.score >= 75 AND EXCLUDED.score = daily_challenge_participations.score THEN
        LEAST(daily_challenge_participations.time_spent, EXCLUDED.time_spent)
      ELSE daily_challenge_participations.time_spent
    END,
    attempts = attempts_used,
    completed_at = NOW()
  RETURNING id INTO participation_id;

  -- Calculate rank using the participation's best score (not current attempt score)
  -- Re-read the participation after UPSERT to get the actual best score/time
  DECLARE
    best_score integer;
    best_time integer;
  BEGIN
    SELECT dcp.score, dcp.time_spent INTO best_score, best_time
    FROM daily_challenge_participations dcp
    WHERE dcp.id = participation_id;

    IF best_score >= 75 THEN
      SELECT COUNT(*) + 1 INTO user_rank
      FROM daily_challenge_participations
      WHERE challenge_id = p_challenge_id
        AND user_id != p_user_id
        AND score >= 75
        AND (score > best_score OR (score = best_score AND time_spent < best_time));

      -- Update cached rank
      UPDATE daily_challenge_participations
      SET rank_calculated = user_rank
      WHERE id = participation_id;
    ELSE
      user_rank := NULL;
    END IF;
  END;

  -- Insert individual attempt record (all attempts tracked)
  INSERT INTO daily_challenge_attempts (
    participation_id, challenge_id, user_id, attempt_number,
    score, started_at, completed_at, time_spent
  ) VALUES (
    participation_id,
    p_challenge_id,
    p_user_id,
    attempts_used,
    p_score,
    COALESCE(p_started_at, NOW() - (p_time_spent || ' seconds')::interval),
    NOW(),
    p_time_spent
  ) RETURNING id INTO new_attempt_id;

  -- Determine if this is the new best attempt (only for passing scores)
  IF is_passing AND (
     existing_participation IS NULL OR
     p_score > existing_participation.score OR
     (p_score = existing_participation.score AND p_time_spent < existing_participation.time_spent)
  ) THEN
    -- Update participation to point to this attempt as best
    UPDATE daily_challenge_participations
    SET best_attempt_id = new_attempt_id
    WHERE id = participation_id;
  END IF;

  -- Set first_attempt_at if this is the first attempt
  IF attempts_used = 1 THEN
    UPDATE daily_challenge_participations
    SET first_attempt_at = COALESCE(p_started_at, NOW() - (p_time_spent || ' seconds')::interval)
    WHERE id = participation_id;
  END IF;

  -- Award base rewards (only on first PASSING attempt with score >= 75%)
  IF is_passing AND attempts_used = 1 THEN
    UPDATE users
    SET xp = xp + challenge_record.base_xp_reward,
        gems = gems + challenge_record.base_gem_reward
    WHERE id = p_user_id;

    UPDATE daily_challenge_participations
    SET base_reward_claimed = true
    WHERE id = participation_id;

    base_xp := challenge_record.base_xp_reward;
    base_gems := challenge_record.base_gem_reward;
  ELSIF is_passing AND existing_participation IS NOT NULL AND existing_participation.score < 75 THEN
    -- First time passing (after previous failed attempts)
    UPDATE users
    SET xp = xp + challenge_record.base_xp_reward,
        gems = gems + challenge_record.base_gem_reward
    WHERE id = p_user_id;

    UPDATE daily_challenge_participations
    SET base_reward_claimed = true
    WHERE id = participation_id;

    base_xp := challenge_record.base_xp_reward;
    base_gems := challenge_record.base_gem_reward;
  ELSE
    base_xp := 0;
    base_gems := 0;
  END IF;

  RETURN json_build_object(
    'success', true,
    'is_passing', is_passing,
    'rank', user_rank,
    'score', p_score,
    'xp_awarded', base_xp,
    'gems_awarded', base_gems,
    'attempts_used', attempts_used,
    'attempts_remaining', 3 - attempts_used,
    'attempt_id', new_attempt_id
  );
END;
$$;

-- Function: Get leaderboard for a challenge
CREATE OR REPLACE FUNCTION get_daily_challenge_leaderboard(
  p_challenge_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  rank integer,
  user_id uuid,
  full_name text,
  avatar_url text,
  active_frame_ratio text,
  score integer,
  time_spent integer,
  attempts integer,
  xp integer,
  level integer
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY dcp.score DESC, dcp.time_spent ASC)::integer AS rank,
    u.id AS user_id,
    u.full_name,
    u.avatar_url,
    ue.active_frame_ratio,
    dcp.score,
    dcp.time_spent,
    dcp.attempts,
    u.xp,
    u.level
  FROM daily_challenge_participations dcp
  JOIN users u ON dcp.user_id = u.id
  LEFT JOIN user_equipment ue ON ue.user_id = u.id
  WHERE dcp.challenge_id = p_challenge_id
    AND dcp.score >= 75
    AND u.role = 'user'
  ORDER BY dcp.score DESC, dcp.time_spent ASC
  LIMIT p_limit;
END;
$$;

-- Function: Get all attempts for a user's challenge participation
CREATE OR REPLACE FUNCTION get_user_challenge_attempts(
  p_challenge_id uuid,
  p_user_id uuid
)
RETURNS TABLE (
  attempt_number integer,
  score integer,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  time_spent integer,
  is_best boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
  best_attempt_id_var uuid;
BEGIN
  -- Get the best attempt ID
  SELECT best_attempt_id INTO best_attempt_id_var
  FROM daily_challenge_participations
  WHERE challenge_id = p_challenge_id AND user_id = p_user_id;

  RETURN QUERY
  SELECT
    dca.attempt_number,
    dca.score,
    dca.started_at,
    dca.completed_at,
    dca.time_spent,
    (dca.id = best_attempt_id_var) AS is_best
  FROM daily_challenge_attempts dca
  WHERE dca.challenge_id = p_challenge_id
    AND dca.user_id = p_user_id
  ORDER BY dca.attempt_number ASC;
END;
$$;

-- Function: Award top performers (called by cron daily at 00:05)
CREATE OR REPLACE FUNCTION award_daily_challenge_winners()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yesterday_date date;
  challenge_rec record;
  top1_user_id uuid;
  top2_user_id uuid;
  top3_user_id uuid;
  top1_xp integer;
  top1_gems integer;
  top2_xp integer;
  top2_gems integer;
  top3_xp integer;
  top3_gems integer;
  results json[];
BEGIN
  yesterday_date := ((NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') - INTERVAL '1 day')::date;

  -- Process each difficulty level's challenge
  FOR challenge_rec IN
    SELECT id, difficulty_level, top1_achievement_id, top2_achievement_id, top3_achievement_id
    FROM daily_challenges
    WHERE challenge_date = yesterday_date AND is_active = true AND winners_awarded = false
  LOOP
    -- Get top 1 user
    SELECT user_id INTO top1_user_id
    FROM daily_challenge_participations
    WHERE challenge_id = challenge_rec.id AND score >= 75
    ORDER BY score DESC, time_spent ASC
    LIMIT 1;

    -- Get top 2 user (excluding top 1)
    SELECT user_id INTO top2_user_id
    FROM daily_challenge_participations
    WHERE challenge_id = challenge_rec.id
      AND score >= 75
      AND user_id != COALESCE(top1_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY score DESC, time_spent ASC
    LIMIT 1;

    -- Get top 3 user (excluding top 1 and top 2)
    SELECT user_id INTO top3_user_id
    FROM daily_challenge_participations
    WHERE challenge_id = challenge_rec.id
      AND score >= 75
      AND user_id != COALESCE(top1_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND user_id != COALESCE(top2_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ORDER BY score DESC, time_spent ASC
    LIMIT 1;

    -- Award top 1
    IF top1_user_id IS NOT NULL AND challenge_rec.top1_achievement_id IS NOT NULL THEN
      -- Get achievement rewards
      SELECT COALESCE(xp_reward, 0), COALESCE(gem_reward, 0)
      INTO top1_xp, top1_gems
      FROM achievements
      WHERE id = challenge_rec.top1_achievement_id;

      -- Insert achievement record
      INSERT INTO user_achievements (user_id, achievement_id, earned_at, claimed_at, xp_claimed)
      VALUES (top1_user_id, challenge_rec.top1_achievement_id, NOW(), NOW(), top1_xp);

      -- Award XP and gems
      UPDATE users
      SET xp = xp + top1_xp,
          gems = gems + top1_gems
      WHERE id = top1_user_id;

      -- Notify top 1
      INSERT INTO notifications (user_id, type, title, message, icon, data)
      VALUES (top1_user_id, 'competition_winner', 'Hạng 1 Daily Challenge!',
        'Chúc mừng! Bạn đạt Hạng 1 (' || challenge_rec.difficulty_level || '). +' || top1_xp || ' XP, +' || top1_gems || ' gems',
        'Trophy', json_build_object('rank', 1, 'difficulty', challenge_rec.difficulty_level, 'xp', top1_xp, 'gems', top1_gems)::jsonb);

      results := array_append(results, json_build_object('level', challenge_rec.difficulty_level, 'rank', 1, 'user_id', top1_user_id, 'xp', top1_xp, 'gems', top1_gems));
    END IF;

    -- Award top 2
    IF top2_user_id IS NOT NULL AND challenge_rec.top2_achievement_id IS NOT NULL THEN
      -- Get achievement rewards
      SELECT COALESCE(xp_reward, 0), COALESCE(gem_reward, 0)
      INTO top2_xp, top2_gems
      FROM achievements
      WHERE id = challenge_rec.top2_achievement_id;

      -- Insert achievement record
      INSERT INTO user_achievements (user_id, achievement_id, earned_at, claimed_at, xp_claimed)
      VALUES (top2_user_id, challenge_rec.top2_achievement_id, NOW(), NOW(), top2_xp);

      -- Award XP and gems
      UPDATE users
      SET xp = xp + top2_xp,
          gems = gems + top2_gems
      WHERE id = top2_user_id;

      -- Notify top 2
      INSERT INTO notifications (user_id, type, title, message, icon, data)
      VALUES (top2_user_id, 'competition_winner', 'Hạng 2 Daily Challenge!',
        'Chúc mừng! Bạn đạt Hạng 2 (' || challenge_rec.difficulty_level || '). +' || top2_xp || ' XP, +' || top2_gems || ' gems',
        'Medal', json_build_object('rank', 2, 'difficulty', challenge_rec.difficulty_level, 'xp', top2_xp, 'gems', top2_gems)::jsonb);

      results := array_append(results, json_build_object('level', challenge_rec.difficulty_level, 'rank', 2, 'user_id', top2_user_id, 'xp', top2_xp, 'gems', top2_gems));
    END IF;

    -- Award top 3
    IF top3_user_id IS NOT NULL AND challenge_rec.top3_achievement_id IS NOT NULL THEN
      -- Get achievement rewards
      SELECT COALESCE(xp_reward, 0), COALESCE(gem_reward, 0)
      INTO top3_xp, top3_gems
      FROM achievements
      WHERE id = challenge_rec.top3_achievement_id;

      -- Insert achievement record
      INSERT INTO user_achievements (user_id, achievement_id, earned_at, claimed_at, xp_claimed)
      VALUES (top3_user_id, challenge_rec.top3_achievement_id, NOW(), NOW(), top3_xp);

      -- Award XP and gems
      UPDATE users
      SET xp = xp + top3_xp,
          gems = gems + top3_gems
      WHERE id = top3_user_id;

      -- Notify top 3
      INSERT INTO notifications (user_id, type, title, message, icon, data)
      VALUES (top3_user_id, 'competition_winner', 'Hạng 3 Daily Challenge!',
        'Chúc mừng! Bạn đạt Hạng 3 (' || challenge_rec.difficulty_level || '). +' || top3_xp || ' XP, +' || top3_gems || ' gems',
        'Medal', json_build_object('rank', 3, 'difficulty', challenge_rec.difficulty_level, 'xp', top3_xp, 'gems', top3_gems)::jsonb);

      results := array_append(results, json_build_object('level', challenge_rec.difficulty_level, 'rank', 3, 'user_id', top3_user_id, 'xp', top3_xp, 'gems', top3_gems));
    END IF;

    -- Mark challenge as awarded AND locked
    UPDATE daily_challenges
    SET winners_awarded = true,
        is_locked = true
    WHERE id = challenge_rec.id;
  END LOOP;

  RETURN json_build_object('success', true, 'awarded', results);
END;
$$;

-- ====================================
-- PET SYSTEM
-- ====================================

-- Pets catalog (all available pets)
CREATE TABLE IF NOT EXISTS public.pets (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  info text,  -- Animal type/species (e.g., "Cat", "Dragon", "Hamster") for AI prompts
  description text,
  image_url text,
  rarity text NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  evolution_stages jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pets_pkey PRIMARY KEY (id)
);

-- Add info column to pets table (if not exists)
ALTER TABLE public.pets ADD COLUMN IF NOT EXISTS info text;

-- Pet Bonuses (stat bonuses each pet provides)
CREATE TABLE IF NOT EXISTS public.pet_bonuses (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  pet_id uuid NOT NULL,
  bonus_type text NOT NULL,
  bonus_value integer NOT NULL DEFAULT 0,
  min_happiness integer DEFAULT 0,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pet_bonuses_pkey PRIMARY KEY (id),
  CONSTRAINT pet_bonuses_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pet_bonuses_pet ON public.pet_bonuses(pet_id);

-- User's owned pets
CREATE TABLE IF NOT EXISTS public.user_pets (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  pet_id uuid NOT NULL,
  nickname text,
  level integer DEFAULT 1,
  xp integer DEFAULT 0,
  happiness integer DEFAULT 100 CHECK (happiness >= 0 AND happiness <= 100),
  energy integer DEFAULT 100 CHECK (energy >= 0 AND energy <= 100),
  evolution_stage integer DEFAULT 0,
  is_active boolean DEFAULT false,
  obtained_at timestamp with time zone DEFAULT now(),
  last_fed_at timestamp with time zone,
  last_played_at timestamp with time zone,
  habitat_x double precision,
  habitat_y double precision,
  habitat_flip boolean DEFAULT false,
  CONSTRAINT user_pets_pkey PRIMARY KEY (id),
  CONSTRAINT user_pets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT user_pets_pet_id_fkey FOREIGN KEY (pet_id) REFERENCES public.pets(id)
);

CREATE INDEX IF NOT EXISTS idx_user_pets_user ON public.user_pets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_pets_active ON public.user_pets(user_id) WHERE is_active = true;

-- ====================================
-- RPC FUNCTIONS FOR PET SYSTEM
-- ====================================

-- Function: Get user's active pet with full details
CREATE OR REPLACE FUNCTION get_active_pet(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  pet_record record;
  bonuses json;
  user_energy integer;
  resolved_image text;
  evo_stage jsonb;
BEGIN
  SELECT
    up.*,
    p.name as pet_name,
    p.info as pet_info,
    p.description as pet_description,
    p.image_url as pet_image_url,
    p.rarity,
    p.evolution_stages
  INTO pet_record
  FROM user_pets up
  JOIN pets p ON up.pet_id = p.id
  WHERE up.user_id = p_user_id AND up.is_active = true
  LIMIT 1;

  IF pet_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No active pet');
  END IF;

  -- Auto-reset energy daily: if last reset was before today, reset to 100
  UPDATE users
  SET energy = 100, energy_last_reset = CURRENT_DATE
  WHERE id = p_user_id AND (energy_last_reset IS NULL OR energy_last_reset < CURRENT_DATE);

  SELECT energy INTO user_energy FROM users WHERE id = p_user_id;

  SELECT json_agg(json_build_object(
    'bonus_type', pb.bonus_type,
    'bonus_value', pb.bonus_value,
    'description', pb.description
  ))
  INTO bonuses
  FROM pet_bonuses pb
  WHERE pb.pet_id = pet_record.pet_id
    AND pet_record.happiness >= pb.min_happiness;

  -- Resolve evolved image
  resolved_image := pet_record.pet_image_url;
  IF pet_record.evolution_stage > 0 AND pet_record.evolution_stages IS NOT NULL THEN
    SELECT elem INTO evo_stage
    FROM jsonb_array_elements(pet_record.evolution_stages) AS elem
    WHERE (elem->>'stage')::int = pet_record.evolution_stage
    LIMIT 1;
    IF evo_stage IS NOT NULL AND evo_stage->>'image_url' IS NOT NULL THEN
      resolved_image := evo_stage->>'image_url';
    END IF;
  END IF;

  RETURN json_build_object(
    'success', true,
    'pet', json_build_object(
      'id', pet_record.id,
      'pet_id', pet_record.pet_id,
      'nickname', pet_record.nickname,
      'name', pet_record.pet_name,
      'info', pet_record.pet_info,
      'description', pet_record.pet_description,
      'image_url', resolved_image,
      'base_image_url', pet_record.pet_image_url,
      'rarity', pet_record.rarity,
      'happiness', pet_record.happiness,
      'energy', COALESCE(user_energy, 100),
      'level', pet_record.level,
      'xp', pet_record.xp,
      'evolution_stage', pet_record.evolution_stage,
      'evolution_stages', pet_record.evolution_stages,
      'last_fed_at', pet_record.last_fed_at,
      'last_played_at', pet_record.last_played_at
    ),
    'bonuses', COALESCE(bonuses, '[]'::json)
  );
END;
$$;

-- Function: Set active pet
CREATE OR REPLACE FUNCTION set_active_pet(p_user_id uuid, p_user_pet_id uuid)
RETURNS json
LANGUAGE plpgsql
AS $$
BEGIN
  -- Verify ownership
  IF NOT EXISTS (
    SELECT 1 FROM user_pets
    WHERE id = p_user_pet_id AND user_id = p_user_id
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Pet not found');
  END IF;

  -- Deactivate all user's pets
  UPDATE user_pets
  SET is_active = false, updated_at = now()
  WHERE user_id = p_user_id;

  -- Activate selected pet
  UPDATE user_pets
  SET is_active = true, updated_at = now()
  WHERE id = p_user_pet_id;

  RETURN json_build_object('success', true);
END;
$$;

-- ====================================
-- INVENTORY & CRAFTING SYSTEM
-- ====================================

-- Collectible Items catalog (admin-defined)
CREATE TABLE IF NOT EXISTS public.collectible_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  image_url text,
  item_type text NOT NULL CHECK (item_type IN ('fragment', 'card', 'material')),
  set_name text,
  rarity text NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic')),
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT collectible_items_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_collectible_items_type ON public.collectible_items(item_type);
CREATE INDEX IF NOT EXISTS idx_collectible_items_set ON public.collectible_items(set_name);

-- User Inventory (what each student owns)
CREATE TABLE IF NOT EXISTS public.user_inventory (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  user_name text,
  item_id uuid NOT NULL,
  item_name text,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  obtained_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_inventory_pkey PRIMARY KEY (id),
  CONSTRAINT user_inventory_user_item_key UNIQUE (user_id, item_id),
  CONSTRAINT user_inventory_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT user_inventory_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.collectible_items(id)
);

CREATE INDEX IF NOT EXISTS idx_user_inventory_user ON public.user_inventory(user_id);

-- Chests (admin-defined with loot tables)
CREATE TABLE IF NOT EXISTS public.chests (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  image_url text,
  chest_type text NOT NULL DEFAULT 'common' CHECK (chest_type IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  loot_table jsonb NOT NULL DEFAULT '[]'::jsonb,
  guaranteed_items jsonb DEFAULT '[]'::jsonb,
  items_per_open integer NOT NULL DEFAULT 3,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT chests_pkey PRIMARY KEY (id)
);

-- User Chests (earned but possibly not yet opened)
CREATE TABLE IF NOT EXISTS public.user_chests (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  chest_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'milestone',
  source_ref text,
  earned_at timestamp with time zone DEFAULT now(),
  opened_at timestamp with time zone,
  items_received jsonb,
  CONSTRAINT user_chests_pkey PRIMARY KEY (id),
  CONSTRAINT user_chests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT user_chests_chest_id_fkey FOREIGN KEY (chest_id) REFERENCES public.chests(id)
);

CREATE INDEX IF NOT EXISTS idx_user_chests_user_unopened ON public.user_chests(user_id) WHERE opened_at IS NULL;

-- Recipes (crafting/exchange definitions)
CREATE TABLE IF NOT EXISTS public.recipes (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  result_type text NOT NULL CHECK (result_type IN ('cosmetic', 'xp', 'gems', 'item')),
  result_shop_item_id uuid,
  result_item_id uuid,
  result_xp integer DEFAULT 0,
  result_gems integer DEFAULT 0,
  result_image_url text,
  result_data jsonb DEFAULT '{}'::jsonb,
  ingredients jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  max_crafts_per_user integer,
  result_quantity integer DEFAULT 1 CHECK (result_quantity >= 1),
  success_rate integer DEFAULT 100 CHECK (success_rate >= 0 AND success_rate <= 100),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT recipes_pkey PRIMARY KEY (id),
  CONSTRAINT recipes_result_shop_item_fkey FOREIGN KEY (result_shop_item_id) REFERENCES public.shop_items(id),
  CONSTRAINT recipes_result_item_fkey FOREIGN KEY (result_item_id) REFERENCES public.collectible_items(id)
);

-- Add success_rate column if not exists (for existing tables)
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS success_rate integer DEFAULT 100 CHECK (success_rate >= 0 AND success_rate <= 100);

-- Add result_quantity column if not exists (for existing tables)
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS result_quantity integer DEFAULT 1 CHECK (result_quantity >= 1);

-- User Crafts log
CREATE TABLE IF NOT EXISTS public.user_crafts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  recipe_id uuid NOT NULL,
  crafted_at timestamp with time zone DEFAULT now(),
  result_data jsonb,
  CONSTRAINT user_crafts_pkey PRIMARY KEY (id),
  CONSTRAINT user_crafts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT user_crafts_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id)
);

CREATE INDEX IF NOT EXISTS idx_user_crafts_user ON public.user_crafts(user_id);

-- Drop Config (global drop rate settings)
CREATE TABLE IF NOT EXISTS public.drop_config (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  config_key text NOT NULL UNIQUE,
  config_value jsonb NOT NULL,
  description text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT drop_config_pkey PRIMARY KEY (id)
);

-- Seed default drop config
INSERT INTO public.drop_config (config_key, config_value, description) VALUES
('exercise_drop_rate', '{"base_chance": 0.30, "rarity_weights": {"common": 60, "uncommon": 25, "rare": 12, "epic": 3}}', 'Chance of item drop on exercise completion (score >= 75%). Rarity weights for which item drops.'),
('milestone_chests', '{"session_complete": "common", "streak_7": "uncommon", "streak_30": "rare", "challenge_win_top3": "uncommon", "pet_game": "common"}', 'Which chest type to award for each milestone type.'),
('exercise_chest_drop_rate', '{"base_chance": 0.25, "rarity_weights": {"common": 60, "uncommon": 25, "rare": 12, "epic": 2, "legendary": 1}}', 'Chance of chest drop on exercise completion (score >= 75%). Rarity weights determine chest type.')
ON CONFLICT (config_key) DO NOTHING;

-- ====================================
-- RPC FUNCTIONS FOR INVENTORY SYSTEM
-- ====================================

-- Function: Roll for item drop on exercise completion
CREATE OR REPLACE FUNCTION roll_exercise_drop(p_user_id uuid, p_exercise_id uuid, p_score integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  config_record record;
  base_chance float;
  rarity_weights jsonb;
  total_weight integer;
  roll float;
  rarity_roll float;
  selected_rarity text;
  cumulative_weight integer;
  rarity_key text;
  rarity_value integer;
  selected_item record;
  included_items jsonb;
  has_include_filter boolean;
BEGIN
  -- No drop if score below 75%
  IF p_score < 75 THEN
    RETURN json_build_object('dropped', false);
  END IF;

  -- Get drop config
  SELECT config_value INTO config_record
  FROM drop_config
  WHERE config_key = 'exercise_drop_rate';

  IF config_record IS NULL THEN
    RETURN json_build_object('dropped', false);
  END IF;

  base_chance := (config_record.config_value->>'base_chance')::float;
  rarity_weights := config_record.config_value->'rarity_weights';
  included_items := COALESCE(config_record.config_value->'included_items', '[]'::jsonb);
  has_include_filter := jsonb_array_length(included_items) > 0;

  -- Roll for drop
  roll := random();
  IF roll > base_chance THEN
    RETURN json_build_object('dropped', false);
  END IF;

  -- Calculate total weight
  total_weight := 0;
  FOR rarity_key, rarity_value IN SELECT * FROM jsonb_each_text(rarity_weights)
  LOOP
    total_weight := total_weight + rarity_value::integer;
  END LOOP;

  -- Roll for rarity
  rarity_roll := random() * total_weight;
  cumulative_weight := 0;
  selected_rarity := 'common';

  FOR rarity_key, rarity_value IN SELECT * FROM jsonb_each_text(rarity_weights)
  LOOP
    cumulative_weight := cumulative_weight + rarity_value::integer;
    IF rarity_roll <= cumulative_weight THEN
      selected_rarity := rarity_key;
      EXIT;
    END IF;
  END LOOP;

  -- Pick a random active item of that rarity (filtered by included_items if set)
  SELECT * INTO selected_item
  FROM collectible_items
  WHERE is_active = true AND rarity = selected_rarity
    AND (NOT has_include_filter OR (included_items ? id::text))
  ORDER BY random()
  LIMIT 1;

  IF selected_item IS NULL THEN
    -- Fallback to any active item (filtered by included_items if set)
    SELECT * INTO selected_item
    FROM collectible_items
    WHERE is_active = true
      AND (NOT has_include_filter OR (included_items ? id::text))
    ORDER BY random()
    LIMIT 1;
  END IF;

  IF selected_item IS NULL THEN
    RETURN json_build_object('dropped', false);
  END IF;

  -- Add to user inventory
  INSERT INTO user_inventory (user_id, user_name, item_id, item_name, quantity)
  VALUES (p_user_id, (SELECT full_name FROM users WHERE id = p_user_id), selected_item.id, selected_item.name, 1)
  ON CONFLICT (user_id, item_id)
  DO UPDATE SET quantity = user_inventory.quantity + 1, updated_at = now();

  RETURN json_build_object(
    'dropped', true,
    'item', json_build_object(
      'id', selected_item.id,
      'name', selected_item.name,
      'image_url', selected_item.image_url,
      'rarity', selected_item.rarity,
      'item_type', selected_item.item_type,
      'set_name', selected_item.set_name
    )
  );
END;
$$;

-- Function: Open a chest
CREATE OR REPLACE FUNCTION open_chest(p_user_id uuid, p_user_chest_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chest_record record;
  user_chest_record record;
  loot_entry jsonb;
  guaranteed_entry jsonb;
  total_weight integer;
  roll float;
  cumulative_weight integer;
  selected_item_id uuid;
  drop_qty integer;
  received_items jsonb := '[]'::jsonb;
  i integer;
  reward_type text;
  shop_item_record record;
BEGIN
  -- Verify ownership and unopened status
  SELECT uc.*, c.loot_table, c.guaranteed_items, c.items_per_open, c.name as chest_name
  INTO user_chest_record
  FROM user_chests uc
  JOIN chests c ON uc.chest_id = c.id
  WHERE uc.id = p_user_chest_id AND uc.user_id = p_user_id AND uc.opened_at IS NULL;

  IF user_chest_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Chest not found or already opened');
  END IF;

  -- Process guaranteed items
  IF user_chest_record.guaranteed_items IS NOT NULL AND jsonb_array_length(user_chest_record.guaranteed_items) > 0 THEN
    FOR guaranteed_entry IN SELECT * FROM jsonb_array_elements(user_chest_record.guaranteed_items)
    LOOP
      reward_type := COALESCE(guaranteed_entry->>'reward_type', 'item');
      drop_qty := COALESCE((guaranteed_entry->>'quantity')::integer, 1);

      IF reward_type = 'xp' THEN
        UPDATE users SET xp = xp + drop_qty WHERE id = p_user_id;
        received_items := received_items || jsonb_build_object(
          'reward_type', 'xp', 'quantity', drop_qty, 'source', 'guaranteed',
          'name', drop_qty || ' XP', 'rarity', 'epic', 'item_type', 'xp', 'image_url', ''
        );
      ELSIF reward_type = 'gems' THEN
        UPDATE users SET gems = gems + drop_qty WHERE id = p_user_id;
        received_items := received_items || jsonb_build_object(
          'reward_type', 'gems', 'quantity', drop_qty, 'source', 'guaranteed',
          'name', drop_qty || ' Gems', 'rarity', 'rare', 'item_type', 'gems', 'image_url', ''
        );
      ELSIF reward_type = 'shop_item' THEN
        selected_item_id := (guaranteed_entry->>'shop_item_id')::uuid;
        SELECT * INTO shop_item_record FROM shop_items WHERE id = selected_item_id;
        IF shop_item_record IS NOT NULL THEN
          INSERT INTO user_purchases (user_id, item_id)
          VALUES (p_user_id, selected_item_id)
          ON CONFLICT (user_id, item_id) DO NOTHING;
          received_items := received_items || jsonb_build_object(
            'reward_type', 'shop_item', 'shop_item_id', selected_item_id, 'quantity', 1, 'source', 'guaranteed',
            'name', shop_item_record.name, 'rarity', 'legendary', 'item_type', 'shop_item',
            'image_url', COALESCE(shop_item_record.image_url, '')
          );
        END IF;
      ELSE
        -- Default: inventory item
        selected_item_id := (guaranteed_entry->>'item_id')::uuid;
        INSERT INTO user_inventory (user_id, user_name, item_id, item_name, quantity)
        VALUES (p_user_id, (SELECT full_name FROM users WHERE id = p_user_id), selected_item_id, (SELECT name FROM collectible_items WHERE id = selected_item_id), drop_qty)
        ON CONFLICT (user_id, item_id)
        DO UPDATE SET quantity = user_inventory.quantity + drop_qty, updated_at = now();
        received_items := received_items || jsonb_build_object('item_id', selected_item_id, 'quantity', drop_qty, 'source', 'guaranteed', 'reward_type', 'item');
      END IF;
    END LOOP;
  END IF;

  -- Process random loot draws
  IF user_chest_record.loot_table IS NOT NULL AND jsonb_array_length(user_chest_record.loot_table) > 0 THEN
    -- Calculate total weight
    total_weight := 0;
    FOR loot_entry IN SELECT * FROM jsonb_array_elements(user_chest_record.loot_table)
    LOOP
      total_weight := total_weight + COALESCE((loot_entry->>'weight')::integer, 1);
    END LOOP;

    -- Draw items
    FOR i IN 1..user_chest_record.items_per_open
    LOOP
      roll := random() * total_weight;
      cumulative_weight := 0;

      FOR loot_entry IN SELECT * FROM jsonb_array_elements(user_chest_record.loot_table)
      LOOP
        cumulative_weight := cumulative_weight + COALESCE((loot_entry->>'weight')::integer, 1);
        IF roll <= cumulative_weight THEN
          reward_type := COALESCE(loot_entry->>'reward_type', 'item');
          drop_qty := COALESCE((loot_entry->>'min_qty')::integer, 1);
          IF (loot_entry->>'max_qty') IS NOT NULL THEN
            drop_qty := drop_qty + floor(random() * ((loot_entry->>'max_qty')::integer - drop_qty + 1))::integer;
          END IF;

          IF reward_type = 'xp' THEN
            UPDATE users SET xp = xp + drop_qty WHERE id = p_user_id;
            received_items := received_items || jsonb_build_object(
              'reward_type', 'xp', 'quantity', drop_qty, 'source', 'random',
              'name', drop_qty || ' XP', 'rarity', 'epic', 'item_type', 'xp', 'image_url', ''
            );
          ELSIF reward_type = 'gems' THEN
            UPDATE users SET gems = gems + drop_qty WHERE id = p_user_id;
            received_items := received_items || jsonb_build_object(
              'reward_type', 'gems', 'quantity', drop_qty, 'source', 'random',
              'name', drop_qty || ' Gems', 'rarity', 'rare', 'item_type', 'gems', 'image_url', ''
            );
          ELSIF reward_type = 'shop_item' THEN
            selected_item_id := (loot_entry->>'shop_item_id')::uuid;
            SELECT * INTO shop_item_record FROM shop_items WHERE id = selected_item_id;
            IF shop_item_record IS NOT NULL THEN
              INSERT INTO user_purchases (user_id, item_id)
              VALUES (p_user_id, selected_item_id)
              ON CONFLICT (user_id, item_id) DO NOTHING;
              received_items := received_items || jsonb_build_object(
                'reward_type', 'shop_item', 'shop_item_id', selected_item_id, 'quantity', 1, 'source', 'random',
                'name', shop_item_record.name, 'rarity', 'legendary', 'item_type', 'shop_item',
                'image_url', COALESCE(shop_item_record.image_url, '')
              );
            END IF;
          ELSE
            -- Default: inventory item
            selected_item_id := (loot_entry->>'item_id')::uuid;
            INSERT INTO user_inventory (user_id, user_name, item_id, item_name, quantity)
            VALUES (p_user_id, (SELECT full_name FROM users WHERE id = p_user_id), selected_item_id, (SELECT name FROM collectible_items WHERE id = selected_item_id), drop_qty)
            ON CONFLICT (user_id, item_id)
            DO UPDATE SET quantity = user_inventory.quantity + drop_qty, updated_at = now();
            received_items := received_items || jsonb_build_object('item_id', selected_item_id, 'quantity', drop_qty, 'source', 'random', 'reward_type', 'item');
          END IF;

          EXIT;
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  -- Mark chest as opened
  UPDATE user_chests
  SET opened_at = now(), items_received = received_items
  WHERE id = p_user_chest_id;

  -- Return received items with details
  -- For inventory items, join with collectible_items; for other types, use embedded fields
  RETURN json_build_object(
    'success', true,
    'chest_name', user_chest_record.chest_name,
    'items', (
      SELECT json_agg(
        CASE
          WHEN ri->>'reward_type' IN ('xp', 'gems', 'shop_item') THEN
            json_build_object(
              'item_id', COALESCE(ri->>'item_id', ri->>'shop_item_id'),
              'quantity', (ri->>'quantity')::integer,
              'source', ri->>'source',
              'name', ri->>'name',
              'image_url', ri->>'image_url',
              'rarity', ri->>'rarity',
              'item_type', ri->>'item_type',
              'reward_type', ri->>'reward_type'
            )
          ELSE
            json_build_object(
              'item_id', ri->>'item_id',
              'quantity', (ri->>'quantity')::integer,
              'source', ri->>'source',
              'name', ci.name,
              'image_url', ci.image_url,
              'rarity', ci.rarity,
              'item_type', ci.item_type,
              'reward_type', 'item'
            )
        END
      )
      FROM jsonb_array_elements(received_items) ri
      LEFT JOIN collectible_items ci ON ci.id = (ri->>'item_id')::uuid
        AND COALESCE(ri->>'reward_type', 'item') = 'item'
    )
  );
END;
$$;

-- Function: Craft a recipe (with success rate - on failure lose 1 ingredient, common first)
CREATE OR REPLACE FUNCTION craft_recipe(p_user_id uuid, p_recipe_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipe_record record;
  ingredient jsonb;
  ingredient_item_id uuid;
  ingredient_qty integer;
  user_qty integer;
  crafts_count integer;
  result_item_name text;
  roll_result float;
  craft_success boolean;
  lost_item_record record;
  rarity_order text[] := ARRAY['common', 'uncommon', 'rare', 'epic', 'legendary'];
  r text;
  found_item boolean := false;
BEGIN
  -- Get recipe
  SELECT * INTO recipe_record
  FROM recipes
  WHERE id = p_recipe_id AND is_active = true;

  IF recipe_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Recipe not found or inactive');
  END IF;

  -- Check max crafts limit
  IF recipe_record.max_crafts_per_user IS NOT NULL THEN
    SELECT COUNT(*) INTO crafts_count
    FROM user_crafts
    WHERE user_id = p_user_id AND recipe_id = p_recipe_id;

    IF crafts_count >= recipe_record.max_crafts_per_user THEN
      RETURN json_build_object('success', false, 'error', 'Maximum crafts reached for this recipe');
    END IF;
  END IF;

  -- Verify all ingredients
  FOR ingredient IN SELECT * FROM jsonb_array_elements(recipe_record.ingredients)
  LOOP
    ingredient_item_id := (ingredient->>'item_id')::uuid;
    ingredient_qty := (ingredient->>'quantity')::integer;

    SELECT COALESCE(quantity, 0) INTO user_qty
    FROM user_inventory
    WHERE user_id = p_user_id AND item_id = ingredient_item_id;

    IF user_qty < ingredient_qty THEN
      RETURN json_build_object('success', false, 'error', 'Not enough ingredients');
    END IF;
  END LOOP;

  -- Roll for success (success_rate is 0-100, default 100)
  roll_result := random() * 100;
  craft_success := roll_result < COALESCE(recipe_record.success_rate, 100);

  IF NOT craft_success THEN
    -- FAILURE: Lose 1 item from ingredients, prioritizing common → uncommon → rare → epic → legendary
    -- Find the lowest rarity ingredient to lose
    FOREACH r IN ARRAY rarity_order
    LOOP
      IF found_item THEN EXIT; END IF;

      FOR ingredient IN SELECT * FROM jsonb_array_elements(recipe_record.ingredients)
      LOOP
        ingredient_item_id := (ingredient->>'item_id')::uuid;

        SELECT ci.* INTO lost_item_record
        FROM collectible_items ci
        WHERE ci.id = ingredient_item_id AND ci.rarity = r;

        IF lost_item_record IS NOT NULL THEN
          -- Found the lowest rarity item, deduct 1
          UPDATE user_inventory
          SET quantity = quantity - 1, updated_at = now()
          WHERE user_id = p_user_id AND item_id = ingredient_item_id;

          found_item := true;
          EXIT;
        END IF;
      END LOOP;
    END LOOP;

    -- Log failed craft attempt
    INSERT INTO user_crafts (user_id, recipe_id, result_data)
    VALUES (p_user_id, p_recipe_id, json_build_object(
      'success', false,
      'lost_item_id', lost_item_record.id,
      'lost_item_name', lost_item_record.name
    )::jsonb);

    RETURN json_build_object(
      'success', false,
      'craft_failed', true,
      'lost_item', json_build_object(
        'id', lost_item_record.id,
        'name', lost_item_record.name,
        'image_url', lost_item_record.image_url,
        'rarity', lost_item_record.rarity
      )
    );
  END IF;

  -- SUCCESS: Deduct all ingredients
  FOR ingredient IN SELECT * FROM jsonb_array_elements(recipe_record.ingredients)
  LOOP
    ingredient_item_id := (ingredient->>'item_id')::uuid;
    ingredient_qty := (ingredient->>'quantity')::integer;

    UPDATE user_inventory
    SET quantity = quantity - ingredient_qty, updated_at = now()
    WHERE user_id = p_user_id AND item_id = ingredient_item_id;
  END LOOP;

  -- Award result
  IF recipe_record.result_type = 'cosmetic' AND recipe_record.result_shop_item_id IS NOT NULL THEN
    INSERT INTO user_purchases (user_id, item_id)
    VALUES (p_user_id, recipe_record.result_shop_item_id)
    ON CONFLICT (user_id, item_id) DO NOTHING;
  ELSIF recipe_record.result_type = 'xp' AND recipe_record.result_xp > 0 THEN
    UPDATE users SET xp = xp + recipe_record.result_xp WHERE id = p_user_id;
  ELSIF recipe_record.result_type = 'gems' AND recipe_record.result_gems > 0 THEN
    UPDATE users SET gems = gems + recipe_record.result_gems WHERE id = p_user_id;
  ELSIF recipe_record.result_type = 'item' AND recipe_record.result_item_id IS NOT NULL THEN
    INSERT INTO user_inventory (user_id, user_name, item_id, item_name, quantity)
    VALUES (p_user_id, (SELECT full_name FROM users WHERE id = p_user_id), recipe_record.result_item_id, (SELECT name FROM collectible_items WHERE id = recipe_record.result_item_id), COALESCE(recipe_record.result_quantity, 1))
    ON CONFLICT (user_id, item_id)
    DO UPDATE SET quantity = user_inventory.quantity + COALESCE(recipe_record.result_quantity, 1), updated_at = now();
  END IF;

  -- Look up result item name if applicable
  IF recipe_record.result_item_id IS NOT NULL THEN
    SELECT ci.name INTO result_item_name
    FROM collectible_items ci WHERE ci.id = recipe_record.result_item_id;
  END IF;

  -- Log successful craft
  INSERT INTO user_crafts (user_id, recipe_id, result_data)
  VALUES (p_user_id, p_recipe_id, json_build_object(
    'success', true,
    'result_type', recipe_record.result_type,
    'result_xp', recipe_record.result_xp,
    'result_gems', recipe_record.result_gems,
    'result_shop_item_id', recipe_record.result_shop_item_id,
    'result_item_id', recipe_record.result_item_id
  )::jsonb);

  RETURN json_build_object(
    'success', true,
    'result_type', recipe_record.result_type,
    'result_name', recipe_record.name,
    'result_image_url', recipe_record.result_image_url,
    'result_xp', recipe_record.result_xp,
    'result_gems', recipe_record.result_gems,
    'result_item_id', recipe_record.result_item_id,
    'result_item_name', result_item_name
  );
END;
$$;

-- Function: Award a milestone chest
CREATE OR REPLACE FUNCTION award_milestone_chest(p_user_id uuid, p_milestone_type text, p_source_ref text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  config_record record;
  milestone_chests jsonb;
  chest_type_name text;
  chest_record record;
  daily_limit int;
  today_count int;
BEGIN
  -- Check daily limit for pet_game chests
  IF p_milestone_type = 'pet_game' THEN
    SELECT COALESCE(setting_value::int, 0) INTO daily_limit
    FROM site_settings
    WHERE setting_key = 'chest_daily_limit';

    IF daily_limit > 0 THEN
      SELECT COUNT(*) INTO today_count
      FROM user_chests
      WHERE user_id = p_user_id
        AND source = 'pet_game'
        AND created_at >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh';

      IF today_count >= daily_limit THEN
        RETURN json_build_object('success', false, 'error', 'Daily chest limit reached');
      END IF;
    END IF;
  END IF;

  -- Get milestone chest config
  SELECT config_value INTO config_record
  FROM drop_config
  WHERE config_key = 'milestone_chests';

  IF config_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No milestone chest config found');
  END IF;

  milestone_chests := config_record.config_value;
  chest_type_name := milestone_chests->>p_milestone_type;

  IF chest_type_name IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No chest configured for this milestone');
  END IF;

  -- Find an active chest of that type
  SELECT * INTO chest_record
  FROM chests
  WHERE chest_type = chest_type_name AND is_active = true
  ORDER BY random()
  LIMIT 1;

  IF chest_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No active chest found for type: ' || chest_type_name);
  END IF;

  -- Award the chest
  INSERT INTO user_chests (user_id, chest_id, source, source_ref)
  VALUES (p_user_id, chest_record.id, p_milestone_type, p_source_ref);

  RETURN json_build_object(
    'success', true,
    'chest_id', chest_record.id,
    'chest_name', chest_record.name,
    'chest_image_url', chest_record.image_url,
    'source', p_milestone_type
  );
END;
$$;

-- Function: Award chest on exercise completion (only for courses with chest_enabled = true)
-- Chest rarity is based on score: 75-79 common, 80-89 uncommon, 90-100 rare
CREATE OR REPLACE FUNCTION award_exercise_chest(p_user_id uuid, p_exercise_id uuid, p_score integer DEFAULT 75)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course record;
  v_chest record;
  v_existing_chest uuid;
  v_chest_type text;
  v_config record;
  v_base_chance float;
  v_rarity_weights jsonb;
  v_roll float;
  v_rarity_roll float;
  v_total_weight integer;
  v_cumulative_weight integer;
  v_rarity_key text;
  v_rarity_value integer;
BEGIN
  -- No drop if score below 75%
  IF p_score < 75 THEN
    RETURN json_build_object('success', false, 'reason', 'score_too_low');
  END IF;

  -- Find the course for this exercise via exercise_assignments -> session -> unit -> course
  SELECT c.id AS course_id, c.chest_enabled
  INTO v_course
  FROM exercise_assignments ea
  JOIN sessions s ON s.id = ea.session_id
  JOIN units u ON u.id = s.unit_id
  JOIN courses c ON c.id = u.course_id
  WHERE ea.exercise_id = p_exercise_id
  LIMIT 1;

  IF v_course IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'exercise_not_found');
  END IF;

  -- Check if course has chest drops enabled
  IF NOT v_course.chest_enabled THEN
    RETURN json_build_object('success', false, 'reason', 'chest_not_enabled');
  END IF;

  -- Check if user already received a chest for this exercise
  SELECT id INTO v_existing_chest
  FROM user_chests
  WHERE user_id = p_user_id
    AND source = 'exercise_complete'
    AND source_ref = p_exercise_id::text;

  IF v_existing_chest IS NOT NULL THEN
    RETURN json_build_object('success', false, 'reason', 'already_awarded');
  END IF;

  -- Get chest drop config
  SELECT config_value INTO v_config
  FROM drop_config
  WHERE config_key = 'exercise_chest_drop_rate';

  IF v_config IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'no_chest_drop_config');
  END IF;

  v_base_chance := (v_config.config_value->>'base_chance')::float;
  v_rarity_weights := v_config.config_value->'rarity_weights';

  -- Roll for drop chance
  v_roll := random();
  IF v_roll > v_base_chance THEN
    RETURN json_build_object('success', false, 'reason', 'no_drop');
  END IF;

  -- Calculate total weight
  v_total_weight := 0;
  FOR v_rarity_key, v_rarity_value IN SELECT * FROM jsonb_each_text(v_rarity_weights)
  LOOP
    v_total_weight := v_total_weight + v_rarity_value::integer;
  END LOOP;

  -- Roll for rarity
  v_rarity_roll := random() * v_total_weight;
  v_cumulative_weight := 0;
  v_chest_type := 'common';

  FOR v_rarity_key, v_rarity_value IN SELECT * FROM jsonb_each_text(v_rarity_weights)
  LOOP
    v_cumulative_weight := v_cumulative_weight + v_rarity_value::integer;
    IF v_rarity_roll <= v_cumulative_weight THEN
      v_chest_type := v_rarity_key;
      EXIT;
    END IF;
  END LOOP;

  -- Find an active chest of the determined rarity
  SELECT * INTO v_chest
  FROM chests
  WHERE chest_type = v_chest_type AND is_active = true
  ORDER BY random()
  LIMIT 1;

  IF v_chest IS NULL THEN
    -- Fallback to common if no chest of rolled rarity
    SELECT * INTO v_chest
    FROM chests
    WHERE is_active = true
    ORDER BY random()
    LIMIT 1;

    IF v_chest IS NULL THEN
      RETURN json_build_object('success', false, 'reason', 'no_active_chest');
    END IF;
  END IF;

  -- Award the chest
  INSERT INTO user_chests (user_id, chest_id, source, source_ref)
  VALUES (p_user_id, v_chest.id, 'exercise_complete', p_exercise_id::text);

  RETURN json_build_object(
    'success', true,
    'chest_id', v_chest.id,
    'chest_name', v_chest.name,
    'chest_image_url', v_chest.image_url,
    'chest_type', v_chest_type
  );
END;
$$;

-- ====================================
-- NOTIFICATION SYSTEM
-- ====================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  type text NOT NULL CHECK (type IN (
    'achievement_earned', 'level_up', 'streak_milestone',
    'daily_challenge_result', 'admin_announcement',
    'giftcode_redeemed', 'chest_received', 'item_drop',
    'competition_winner'
  )),
  title text NOT NULL,
  message text NOT NULL,
  icon text,
  data jsonb DEFAULT '{}'::jsonb,
  is_read boolean DEFAULT false,
  cohort_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT notifications_cohort_id_fkey FOREIGN KEY (cohort_id) REFERENCES public.cohorts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_broadcast ON public.notifications(created_at DESC) WHERE user_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_cohort ON public.notifications(cohort_id, created_at DESC) WHERE cohort_id IS NOT NULL;

-- Tracks read status for broadcast/cohort notifications per user
CREATE TABLE IF NOT EXISTS public.notification_reads (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  notification_id uuid NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notification_reads_pkey PRIMARY KEY (id),
  CONSTRAINT notification_reads_unique UNIQUE (notification_id, user_id),
  CONSTRAINT notification_reads_notification_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE CASCADE,
  CONSTRAINT notification_reads_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON public.notification_reads(user_id);

-- ====================================
-- GIFTCODE SYSTEM
-- ====================================

CREATE TABLE IF NOT EXISTS public.giftcodes (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  code text NOT NULL UNIQUE,
  description text,
  rewards jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_redemptions integer,
  current_redemptions integer DEFAULT 0,
  is_single_use boolean DEFAULT false,
  expires_at timestamp with time zone,
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT giftcodes_pkey PRIMARY KEY (id),
  CONSTRAINT giftcodes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_giftcodes_code ON public.giftcodes(code);
CREATE INDEX IF NOT EXISTS idx_giftcodes_active ON public.giftcodes(is_active, expires_at);

CREATE TABLE IF NOT EXISTS public.giftcode_redemptions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  giftcode_id uuid NOT NULL,
  user_id uuid NOT NULL,
  redeemed_at timestamp with time zone DEFAULT now(),
  rewards_granted jsonb,
  CONSTRAINT giftcode_redemptions_pkey PRIMARY KEY (id),
  CONSTRAINT giftcode_redemptions_unique UNIQUE (giftcode_id, user_id),
  CONSTRAINT giftcode_redemptions_giftcode_fkey FOREIGN KEY (giftcode_id) REFERENCES public.giftcodes(id) ON DELETE CASCADE,
  CONSTRAINT giftcode_redemptions_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_giftcode_redemptions_user ON public.giftcode_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_giftcode_redemptions_giftcode ON public.giftcode_redemptions(giftcode_id);

-- ====================================
-- RPC: Redeem Giftcode
-- ====================================
CREATE OR REPLACE FUNCTION redeem_giftcode(p_user_id uuid, p_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_giftcode record;
  v_reward_item jsonb;
  v_total_xp integer := 0;
  v_total_gems integer := 0;
BEGIN
  SELECT * INTO v_giftcode
  FROM giftcodes
  WHERE UPPER(code) = UPPER(p_code) AND is_active = true;

  IF v_giftcode IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Mã không hợp lệ hoặc đã hết hạn');
  END IF;

  IF v_giftcode.expires_at IS NOT NULL AND v_giftcode.expires_at < NOW() THEN
    RETURN json_build_object('success', false, 'error', 'Mã đã hết hạn');
  END IF;

  IF v_giftcode.is_single_use AND v_giftcode.current_redemptions >= 1 THEN
    RETURN json_build_object('success', false, 'error', 'Mã đã được sử dụng');
  END IF;

  IF v_giftcode.max_redemptions IS NOT NULL AND v_giftcode.current_redemptions >= v_giftcode.max_redemptions THEN
    RETURN json_build_object('success', false, 'error', 'Mã đã hết lượt sử dụng');
  END IF;

  IF EXISTS (SELECT 1 FROM giftcode_redemptions WHERE giftcode_id = v_giftcode.id AND user_id = p_user_id) THEN
    RETURN json_build_object('success', false, 'error', 'Bạn đã sử dụng mã này rồi');
  END IF;

  -- Award XP and gems
  v_total_xp := COALESCE((v_giftcode.rewards->>'xp')::integer, 0);
  v_total_gems := COALESCE((v_giftcode.rewards->>'gems')::integer, 0);

  IF v_total_xp > 0 OR v_total_gems > 0 THEN
    UPDATE users SET xp = xp + v_total_xp, gems = gems + v_total_gems WHERE id = p_user_id;
  END IF;

  -- Award items
  IF v_giftcode.rewards->'items' IS NOT NULL THEN
    FOR v_reward_item IN SELECT * FROM jsonb_array_elements(v_giftcode.rewards->'items')
    LOOP
      INSERT INTO user_inventory (user_id, user_name, item_id, item_name, quantity)
      VALUES (
        p_user_id,
        (SELECT full_name FROM users WHERE id = p_user_id),
        (v_reward_item->>'item_id')::uuid,
        (SELECT name FROM collectible_items WHERE id = (v_reward_item->>'item_id')::uuid),
        COALESCE((v_reward_item->>'quantity')::integer, 1)
      )
      ON CONFLICT (user_id, item_id)
      DO UPDATE SET quantity = user_inventory.quantity + COALESCE((v_reward_item->>'quantity')::integer, 1), updated_at = now();
    END LOOP;
  END IF;

  -- Award chests
  IF v_giftcode.rewards->'chests' IS NOT NULL THEN
    FOR v_reward_item IN SELECT * FROM jsonb_array_elements(v_giftcode.rewards->'chests')
    LOOP
      INSERT INTO user_chests (user_id, chest_id, source, source_ref)
      VALUES (p_user_id, (v_reward_item->>'chest_id')::uuid, 'giftcode', v_giftcode.code);
    END LOOP;
  END IF;

  -- Award pets
  IF v_giftcode.rewards->'pets' IS NOT NULL THEN
    FOR v_reward_item IN SELECT * FROM jsonb_array_elements(v_giftcode.rewards->'pets')
    LOOP
      INSERT INTO user_pets (user_id, pet_id)
      VALUES (p_user_id, (v_reward_item->>'pet_id')::uuid)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  -- Award cosmetics (shop items)
  IF v_giftcode.rewards->'cosmetics' IS NOT NULL THEN
    FOR v_reward_item IN SELECT * FROM jsonb_array_elements(v_giftcode.rewards->'cosmetics')
    LOOP
      INSERT INTO user_purchases (user_id, item_id)
      VALUES (p_user_id, (v_reward_item->>'shop_item_id')::uuid)
      ON CONFLICT (user_id, item_id) DO NOTHING;
    END LOOP;
  END IF;

  -- Record redemption
  INSERT INTO giftcode_redemptions (giftcode_id, user_id, rewards_granted)
  VALUES (v_giftcode.id, p_user_id, v_giftcode.rewards);

  UPDATE giftcodes SET current_redemptions = current_redemptions + 1, updated_at = now() WHERE id = v_giftcode.id;

  IF v_giftcode.is_single_use THEN
    UPDATE giftcodes SET is_active = false, updated_at = now() WHERE id = v_giftcode.id;
  END IF;

  -- Create notification for the user
  INSERT INTO notifications (user_id, type, title, message, icon, data)
  VALUES (
    p_user_id,
    'giftcode_redeemed',
    'Nhập mã thành công!',
    'Bạn đã nhận phần thưởng từ mã ' || v_giftcode.code,
    'Gift',
    json_build_object('code', v_giftcode.code, 'rewards', v_giftcode.rewards)::jsonb
  );

  RETURN json_build_object(
    'success', true,
    'rewards', v_giftcode.rewards,
    'code', v_giftcode.code,
    'description', v_giftcode.description
  );
END;
$$;

-- Function: Award competition items to a user (bypasses RLS)
CREATE OR REPLACE FUNCTION award_competition_items(
  p_user_id uuid,
  p_item_ids text[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_id uuid;
  v_item_name text;
  v_user_name text;
BEGIN
  SELECT full_name INTO v_user_name FROM users WHERE id = p_user_id;

  FOREACH v_item_id IN ARRAY p_item_ids::uuid[]
  LOOP
    SELECT name INTO v_item_name FROM collectible_items WHERE id = v_item_id;

    INSERT INTO user_inventory (user_id, user_name, item_id, item_name, quantity)
    VALUES (p_user_id, v_user_name, v_item_id, v_item_name, 1)
    ON CONFLICT (user_id, item_id)
    DO UPDATE SET quantity = user_inventory.quantity + 1, updated_at = now();
  END LOOP;

  RETURN json_build_object('success', true);
END;
$$;

-- Function: Award winners for a single challenge (admin trigger)
CREATE OR REPLACE FUNCTION award_single_challenge_winners(p_challenge_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  challenge_rec record;
  top1_user_id uuid;
  top2_user_id uuid;
  top3_user_id uuid;
  top1_xp integer;
  top1_gems integer;
  top2_xp integer;
  top2_gems integer;
  top3_xp integer;
  top3_gems integer;
  results json[];
BEGIN
  -- Get the challenge
  SELECT id, difficulty_level, top1_achievement_id, top2_achievement_id, top3_achievement_id, winners_awarded, is_locked
  INTO challenge_rec
  FROM daily_challenges
  WHERE id = p_challenge_id AND is_active = true;

  IF challenge_rec IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Challenge not found or inactive');
  END IF;

  IF challenge_rec.winners_awarded = true THEN
    RETURN json_build_object('success', false, 'error', 'Winners already awarded for this challenge');
  END IF;

  -- Get top 1 user
  SELECT user_id INTO top1_user_id
  FROM daily_challenge_participations
  WHERE challenge_id = challenge_rec.id AND score >= 75
  ORDER BY score DESC, time_spent ASC
  LIMIT 1;

  -- Get top 2 user (excluding top 1)
  SELECT user_id INTO top2_user_id
  FROM daily_challenge_participations
  WHERE challenge_id = challenge_rec.id
    AND score >= 75
    AND user_id != COALESCE(top1_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ORDER BY score DESC, time_spent ASC
  LIMIT 1;

  -- Get top 3 user (excluding top 1 and top 2)
  SELECT user_id INTO top3_user_id
  FROM daily_challenge_participations
  WHERE challenge_id = challenge_rec.id
    AND score >= 75
    AND user_id != COALESCE(top1_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND user_id != COALESCE(top2_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ORDER BY score DESC, time_spent ASC
  LIMIT 1;

  -- Award top 1
  IF top1_user_id IS NOT NULL AND challenge_rec.top1_achievement_id IS NOT NULL THEN
    -- Get achievement rewards
    SELECT COALESCE(xp_reward, 0), COALESCE(gem_reward, 0)
    INTO top1_xp, top1_gems
    FROM achievements
    WHERE id = challenge_rec.top1_achievement_id;

    -- Insert achievement record
    INSERT INTO user_achievements (user_id, achievement_id, earned_at, claimed_at, xp_claimed)
    VALUES (top1_user_id, challenge_rec.top1_achievement_id, NOW(), NOW(), top1_xp);

    -- Award XP and gems
    UPDATE users
    SET xp = xp + top1_xp,
        gems = gems + top1_gems
    WHERE id = top1_user_id;

    results := array_append(results, json_build_object('level', challenge_rec.difficulty_level, 'rank', 1, 'user_id', top1_user_id, 'xp', top1_xp, 'gems', top1_gems));
  END IF;

  -- Award top 2
  IF top2_user_id IS NOT NULL AND challenge_rec.top2_achievement_id IS NOT NULL THEN
    -- Get achievement rewards
    SELECT COALESCE(xp_reward, 0), COALESCE(gem_reward, 0)
    INTO top2_xp, top2_gems
    FROM achievements
    WHERE id = challenge_rec.top2_achievement_id;

    -- Insert achievement record
    INSERT INTO user_achievements (user_id, achievement_id, earned_at, claimed_at, xp_claimed)
    VALUES (top2_user_id, challenge_rec.top2_achievement_id, NOW(), NOW(), top2_xp);

    -- Award XP and gems
    UPDATE users
    SET xp = xp + top2_xp,
        gems = gems + top2_gems
    WHERE id = top2_user_id;

    results := array_append(results, json_build_object('level', challenge_rec.difficulty_level, 'rank', 2, 'user_id', top2_user_id, 'xp', top2_xp, 'gems', top2_gems));
  END IF;

  -- Award top 3
  IF top3_user_id IS NOT NULL AND challenge_rec.top3_achievement_id IS NOT NULL THEN
    -- Get achievement rewards
    SELECT COALESCE(xp_reward, 0), COALESCE(gem_reward, 0)
    INTO top3_xp, top3_gems
    FROM achievements
    WHERE id = challenge_rec.top3_achievement_id;

    -- Insert achievement record
    INSERT INTO user_achievements (user_id, achievement_id, earned_at, claimed_at, xp_claimed)
    VALUES (top3_user_id, challenge_rec.top3_achievement_id, NOW(), NOW(), top3_xp);

    -- Award XP and gems
    UPDATE users
    SET xp = xp + top3_xp,
        gems = gems + top3_gems
    WHERE id = top3_user_id;

    results := array_append(results, json_build_object('level', challenge_rec.difficulty_level, 'rank', 3, 'user_id', top3_user_id, 'xp', top3_xp, 'gems', top3_gems));
  END IF;

  -- Mark challenge as awarded AND locked
  UPDATE daily_challenges
  SET winners_awarded = true,
      is_locked = true
  WHERE id = p_challenge_id;

  RETURN json_build_object('success', true, 'awarded', results);
END;
$$;

-- ============================================================
-- lesson_info: One row per lesson (course + date)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lesson_info (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  course_id uuid NOT NULL,
  session_date date NOT NULL,
  lesson_name text,
  lesson_mode text,
  lesson_tags text,
  skill text,
  feedback text,
  recorded_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT lesson_info_pkey PRIMARY KEY (id),
  CONSTRAINT lesson_info_unique UNIQUE (course_id, session_date),
  CONSTRAINT lesson_info_course_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE,
  CONSTRAINT lesson_info_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lesson_info_course_date
  ON public.lesson_info(course_id, session_date DESC);

-- ============================================================
-- lesson_records: One row per student per lesson
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lesson_records (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  lesson_info_id uuid NOT NULL,
  student_id uuid NOT NULL,
  attendance_status text DEFAULT 'present',
  participation_level text DEFAULT 'medium',
  homework_status text,
  homework_notes text,
  homework_photo_url text,
  homework_score integer DEFAULT NULL,
  performance_rating text,
  star_flag text DEFAULT '',
  engagement_level text DEFAULT 'medium',
  photo_url text,
  notes text,
  recorded_by uuid,
  recorded_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT lesson_records_pkey PRIMARY KEY (id),
  CONSTRAINT lesson_records_unique UNIQUE (lesson_info_id, student_id),
  CONSTRAINT lesson_records_lesson_fkey FOREIGN KEY (lesson_info_id) REFERENCES public.lesson_info(id) ON DELETE CASCADE,
  CONSTRAINT lesson_records_student_fkey FOREIGN KEY (student_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT lesson_records_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lesson_records_lesson_info
  ON public.lesson_records(lesson_info_id);

CREATE INDEX IF NOT EXISTS idx_lesson_records_student
  ON public.lesson_records(student_id);

-- ============================================================
-- test_attempts: tracks each student's test submission (linked to session)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.test_attempts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  session_id uuid NOT NULL,
  user_id uuid NOT NULL,
  score integer CHECK (score >= 0 AND score <= 100),
  passed boolean,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  time_used_seconds integer,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'timed_out')),
  draft_answers jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT test_attempts_pkey PRIMARY KEY (id),
  CONSTRAINT test_attempts_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id),
  CONSTRAINT test_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

-- ============================================================
-- test_question_attempts: individual question tracking within a test attempt
-- ============================================================
CREATE TABLE IF NOT EXISTS public.test_question_attempts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  test_attempt_id uuid NOT NULL,
  exercise_id uuid NOT NULL,
  question_index integer NOT NULL DEFAULT 0,
  exercise_type text,
  selected_answer jsonb,
  correct_answer jsonb,
  is_correct boolean NOT NULL,
  teacher_override boolean DEFAULT false,
  teacher_is_correct boolean,
  teacher_note text,
  overridden_by uuid,
  overridden_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT test_question_attempts_pkey PRIMARY KEY (id),
  CONSTRAINT test_question_attempts_attempt_id_fkey FOREIGN KEY (test_attempt_id) REFERENCES public.test_attempts(id) ON DELETE CASCADE,
  CONSTRAINT test_question_attempts_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id),
  CONSTRAINT test_question_attempts_overridden_by_fkey FOREIGN KEY (overridden_by) REFERENCES public.users(id) ON DELETE SET NULL
);

-- ============================================================
-- add_xp_batch: Award XP to multiple students (SECURITY DEFINER bypasses RLS)
-- Called by teacher after saving lesson records
-- Formula: bonus x (performance + homework - 15), -15 if late, 0 if absent
-- performance: ok=30, good=60, wow=90 | homework: ok=15, good=30, wow=45
-- ============================================================
CREATE OR REPLACE FUNCTION add_xp_batch(updates jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(updates)
  LOOP
    UPDATE users
    SET xp = COALESCE(xp, 0) + (item->>'xp')::int,
        updated_at = now()
    WHERE id = (item->>'student_id')::uuid;
  END LOOP;
END;
$$;

-- ============================================================
-- Training Scores (pet mini-game results)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.training_scores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  game_type text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  played_at timestamptz DEFAULT now()
);
CREATE INDEX idx_training_scores_user_game ON training_scores(user_id, game_type, played_at);

-- ============================================================
-- Award weekly Word Scramble champion (cron: every Monday 00:05 VN time)
-- ============================================================
CREATE OR REPLACE FUNCTION award_weekly_scramble_champion()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  week_start_date timestamptz;
  week_end_date timestamptz;
  champion_user_id uuid;
  champion_score integer;
  gem_prize integer := 1;
BEGIN
  -- Last week: Monday 00:00 to Sunday 23:59:59 (Vietnam time, converted to UTC)
  week_end_date := (date_trunc('day', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh');
  week_start_date := week_end_date - INTERVAL '7 days';

  -- Find the user with the highest best score last week
  SELECT user_id, MAX(score) AS best_score
  INTO champion_user_id, champion_score
  FROM training_scores
  WHERE game_type = 'scramble'
    AND played_at >= week_start_date
    AND played_at < week_end_date
  GROUP BY user_id
  ORDER BY best_score DESC
  LIMIT 1;

  IF champion_user_id IS NULL THEN
    RETURN json_build_object('status', 'no_players', 'week_start', week_start_date);
  END IF;

  -- Check if already awarded for this week
  IF EXISTS(
    SELECT 1 FROM notifications
    WHERE type = 'competition_winner'
      AND data->>'competition' = 'weekly_scramble'
      AND created_at >= week_start_date AND created_at < week_end_date + INTERVAL '1 day'
  ) THEN
    RETURN json_build_object('status', 'already_awarded', 'week_start', week_start_date);
  END IF;

  -- Award gem to champion
  UPDATE users
  SET gems = COALESCE(gems, 0) + gem_prize,
      updated_at = NOW()
  WHERE id = champion_user_id;

  -- Notify champion
  INSERT INTO notifications (user_id, type, title, message, icon, data)
  VALUES (champion_user_id, 'competition_winner', 'Vô địch Word Scramble tuần!',
    'Chúc mừng! Bạn đạt điểm cao nhất tuần (' || champion_score || ' điểm). +' || gem_prize || ' gems',
    'Trophy', json_build_object('competition', 'weekly_scramble', 'score', champion_score, 'gems', gem_prize)::jsonb);

  RETURN json_build_object(
    'status', 'awarded',
    'user_id', champion_user_id,
    'score', champion_score,
    'gems_awarded', gem_prize,
    'week_start', week_start_date,
    'week_end', week_end_date
  );
END;
$$;

-- Schedule: SELECT cron.schedule('award-weekly-scramble', '5 17 * * 0', 'SELECT award_weekly_scramble_champion()');
-- (17:05 UTC = 00:05 Monday VN time)

-- ============================================================
-- Award weekly XP top 3 (cron: every Monday 00:10 VN time)
-- Finds the top 3 users who earned the most XP last week (exercises + chests)
-- and awards them achievement rewards from 'weekly_xp_leader', 'weekly_xp_leader_2', 'weekly_xp_leader_3'
-- ============================================================
CREATE OR REPLACE FUNCTION award_weekly_xp_champion()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  week_start timestamptz;
  week_end timestamptz;
  rec RECORD;
  reward RECORD;
  awarded json[] := ARRAY[]::json[];
  cur_rank integer := 0;
  rank_title text;
  rank_message text;
  v_user_name text;
  v_item_name text;
BEGIN
  -- Last week boundaries (Vietnam time)
  week_end := (date_trunc('day', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh');
  week_start := week_end - INTERVAL '7 days';

  -- Check if already awarded for this week (check rank 1 config)
  IF EXISTS(
    SELECT 1 FROM user_achievements ua
    JOIN leaderboard_rewards lr ON lr.achievement_id = ua.achievement_id
    WHERE lr.timeframe = 'weekly' AND lr.rank = 1
      AND ua.earned_at >= week_end AND ua.earned_at < week_end + INTERVAL '1 day'
  ) THEN
    RETURN json_build_object('status', 'already_awarded', 'week_start', week_start);
  END IF;

  -- Calculate XP from exercises (with score bonuses) + chest rewards, get top 10
  FOR rec IN
    WITH exercise_xp AS (
      SELECT up.user_id,
        SUM(
          CASE
            WHEN up.max_score > 0 AND (up.score::float / up.max_score) >= 0.95 THEN ROUND(COALESCE(e.xp_reward, 10) * 1.5)
            WHEN up.max_score > 0 AND (up.score::float / up.max_score) >= 0.90 THEN ROUND(COALESCE(e.xp_reward, 10) * 1.3)
            ELSE COALESCE(e.xp_reward, 10)
          END
        ) AS total_xp
      FROM user_progress up
      LEFT JOIN exercises e ON e.id = up.exercise_id
      WHERE up.status = 'completed'
        AND up.completed_at >= week_start
        AND up.completed_at < week_end
      GROUP BY up.user_id
    ),
    chest_xp AS (
      SELECT user_id, SUM(xp_awarded) AS total_xp
      FROM session_reward_claims
      WHERE xp_awarded > 0
        AND claimed_at >= week_start
        AND claimed_at < week_end
      GROUP BY user_id
    ),
    combined AS (
      SELECT COALESCE(ex.user_id, ch.user_id) AS user_id,
             COALESCE(ex.total_xp, 0) + COALESCE(ch.total_xp, 0) AS total_xp
      FROM exercise_xp ex
      FULL OUTER JOIN chest_xp ch ON ex.user_id = ch.user_id
    )
    SELECT c.user_id, c.total_xp
    FROM combined c
    JOIN users u ON u.id = c.user_id AND u.role = 'user'
    ORDER BY c.total_xp DESC
    LIMIT 10
  LOOP
    cur_rank := cur_rank + 1;

    -- Get reward config for this rank
    SELECT lr.*, a.xp_reward AS ach_xp, a.gem_reward AS ach_gems
    INTO reward
    FROM leaderboard_rewards lr
    LEFT JOIN achievements a ON a.id = lr.achievement_id
    WHERE lr.timeframe = 'weekly' AND lr.rank = cur_rank AND lr.is_active = true;

    -- Skip if no reward configured for this rank
    IF reward IS NULL THEN
      CONTINUE;
    END IF;

    -- Build notification text
    rank_title := CASE cur_rank
      WHEN 1 THEN 'Vô địch XP tuần!'
      WHEN 2 THEN 'Top 2 XP tuần!'
      WHEN 3 THEN 'Top 3 XP tuần!'
      ELSE 'Top ' || cur_rank || ' XP tuần!'
    END;
    rank_message := CASE cur_rank
      WHEN 1 THEN 'Bạn đạt nhiều XP nhất tuần'
      ELSE 'Bạn đạt Top ' || cur_rank || ' XP tuần'
    END;

    -- Record achievement (top 1-3 with badges)
    IF reward.achievement_id IS NOT NULL THEN
      INSERT INTO user_achievements (user_id, achievement_id, earned_at, claimed_at, xp_claimed)
      VALUES (rec.user_id, reward.achievement_id, NOW(), NOW(), reward.xp_reward);
    END IF;

    -- Award XP and gems
    UPDATE users
    SET xp = xp + reward.xp_reward,
        gems = gems + reward.gem_reward,
        updated_at = NOW()
    WHERE id = rec.user_id;

    -- Award item if configured
    IF reward.item_id IS NOT NULL THEN
      SELECT full_name INTO v_user_name FROM users WHERE id = rec.user_id;
      SELECT name INTO v_item_name FROM collectible_items WHERE id = reward.item_id;

      INSERT INTO user_inventory (user_id, user_name, item_id, item_name, quantity)
      VALUES (rec.user_id, v_user_name, reward.item_id, v_item_name, reward.item_quantity)
      ON CONFLICT (user_id, item_id)
      DO UPDATE SET quantity = user_inventory.quantity + reward.item_quantity, updated_at = now();
    END IF;

    -- Award chest if configured
    IF reward.chest_id IS NOT NULL THEN
      INSERT INTO user_chests (user_id, chest_id, source, source_ref)
      VALUES (rec.user_id, reward.chest_id, 'weekly_leaderboard', 'rank_' || cur_rank);
    END IF;

    -- Notify winner
    INSERT INTO notifications (user_id, type, title, message, icon, data)
    VALUES (rec.user_id, 'competition_winner', rank_title,
      'Chúc mừng! ' || rank_message || ' (' || rec.total_xp || ' XP). +' || reward.xp_reward || ' XP' ||
        CASE WHEN reward.gem_reward > 0 THEN ', +' || reward.gem_reward || ' gems' ELSE '' END ||
        CASE WHEN v_item_name IS NOT NULL THEN ', +' || reward.item_quantity || ' ' || v_item_name ELSE '' END,
      'Trophy', json_build_object('competition', 'weekly_xp', 'weekly_xp', rec.total_xp, 'xp_awarded', reward.xp_reward, 'gems_awarded', reward.gem_reward, 'rank', cur_rank)::jsonb);

    awarded := awarded || json_build_object('rank', cur_rank, 'user_id', rec.user_id, 'weekly_xp', rec.total_xp, 'xp_awarded', reward.xp_reward, 'gems_awarded', reward.gem_reward);
    v_item_name := NULL;
  END LOOP;

  IF cur_rank = 0 THEN
    RETURN json_build_object('status', 'no_activity', 'week_start', week_start);
  END IF;

  RETURN json_build_object(
    'status', 'awarded',
    'winners', array_to_json(awarded),
    'week_start', week_start,
    'week_end', week_end
  );
END;
$$;

-- Schedule: SELECT cron.schedule('award-weekly-xp-champion', '10 17 * * 0', 'SELECT award_weekly_xp_champion()');
-- (17:10 UTC = 00:10 Monday VN time)

-- ============================================================
-- Leaderboard Rewards Config Table
-- Configurable rewards per rank for weekly/monthly leaderboards
-- ============================================================
CREATE TABLE IF NOT EXISTS public.leaderboard_rewards (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  timeframe text NOT NULL CHECK (timeframe IN ('weekly', 'monthly')),
  rank integer NOT NULL CHECK (rank >= 1 AND rank <= 10),
  xp_reward integer NOT NULL DEFAULT 0,
  gem_reward integer NOT NULL DEFAULT 0,
  item_id uuid,
  item_quantity integer NOT NULL DEFAULT 1,
  chest_id uuid,
  achievement_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT leaderboard_rewards_pkey PRIMARY KEY (id),
  CONSTRAINT leaderboard_rewards_timeframe_rank_key UNIQUE (timeframe, rank),
  CONSTRAINT leaderboard_rewards_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.collectible_items(id),
  CONSTRAINT leaderboard_rewards_chest_id_fkey FOREIGN KEY (chest_id) REFERENCES public.chests(id),
  CONSTRAINT leaderboard_rewards_achievement_id_fkey FOREIGN KEY (achievement_id) REFERENCES public.achievements(id)
);

-- ============================================================
-- Award monthly XP top 3 (cron: 1st of each month 00:10 VN time)
-- Same logic but for the previous month, awards top 3
-- ============================================================
CREATE OR REPLACE FUNCTION award_monthly_xp_champion()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  month_start timestamptz;
  month_end timestamptz;
  rec RECORD;
  reward RECORD;
  awarded json[] := ARRAY[]::json[];
  cur_rank integer := 0;
  rank_title text;
  rank_message text;
  v_user_name text;
  v_item_name text;
BEGIN
  -- Last month boundaries (Vietnam time)
  month_end := (date_trunc('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh');
  month_start := (date_trunc('month', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') - INTERVAL '1 month') AT TIME ZONE 'Asia/Ho_Chi_Minh';

  -- Check if already awarded for this month
  IF EXISTS(
    SELECT 1 FROM user_achievements ua
    JOIN leaderboard_rewards lr ON lr.achievement_id = ua.achievement_id
    WHERE lr.timeframe = 'monthly' AND lr.rank = 1
      AND ua.earned_at >= month_end AND ua.earned_at < month_end + INTERVAL '1 month'
  ) THEN
    RETURN json_build_object('status', 'already_awarded', 'month_start', month_start);
  END IF;

  -- Calculate XP from exercises (with score bonuses) + chest rewards, get top 10
  FOR rec IN
    WITH exercise_xp AS (
      SELECT up.user_id,
        SUM(
          CASE
            WHEN up.max_score > 0 AND (up.score::float / up.max_score) >= 0.95 THEN ROUND(COALESCE(e.xp_reward, 10) * 1.5)
            WHEN up.max_score > 0 AND (up.score::float / up.max_score) >= 0.90 THEN ROUND(COALESCE(e.xp_reward, 10) * 1.3)
            ELSE COALESCE(e.xp_reward, 10)
          END
        ) AS total_xp
      FROM user_progress up
      LEFT JOIN exercises e ON e.id = up.exercise_id
      WHERE up.status = 'completed'
        AND up.completed_at >= month_start
        AND up.completed_at < month_end
      GROUP BY up.user_id
    ),
    chest_xp AS (
      SELECT user_id, SUM(xp_awarded) AS total_xp
      FROM session_reward_claims
      WHERE xp_awarded > 0
        AND claimed_at >= month_start
        AND claimed_at < month_end
      GROUP BY user_id
    ),
    combined AS (
      SELECT COALESCE(ex.user_id, ch.user_id) AS user_id,
             COALESCE(ex.total_xp, 0) + COALESCE(ch.total_xp, 0) AS total_xp
      FROM exercise_xp ex
      FULL OUTER JOIN chest_xp ch ON ex.user_id = ch.user_id
    )
    SELECT c.user_id, c.total_xp
    FROM combined c
    JOIN users u ON u.id = c.user_id AND u.role = 'user'
    ORDER BY c.total_xp DESC
    LIMIT 10
  LOOP
    cur_rank := cur_rank + 1;

    -- Get reward config for this rank
    SELECT lr.*, a.xp_reward AS ach_xp, a.gem_reward AS ach_gems
    INTO reward
    FROM leaderboard_rewards lr
    LEFT JOIN achievements a ON a.id = lr.achievement_id
    WHERE lr.timeframe = 'monthly' AND lr.rank = cur_rank AND lr.is_active = true;

    -- Skip if no reward configured for this rank
    IF reward IS NULL THEN
      CONTINUE;
    END IF;

    -- Build notification text
    rank_title := CASE cur_rank
      WHEN 1 THEN 'Vô địch XP tháng!'
      WHEN 2 THEN 'Top 2 XP tháng!'
      WHEN 3 THEN 'Top 3 XP tháng!'
      ELSE 'Top ' || cur_rank || ' XP tháng!'
    END;
    rank_message := CASE cur_rank
      WHEN 1 THEN 'Bạn đạt nhiều XP nhất tháng'
      ELSE 'Bạn đạt Top ' || cur_rank || ' XP tháng'
    END;

    -- Record achievement (top 1-3 with badges)
    IF reward.achievement_id IS NOT NULL THEN
      INSERT INTO user_achievements (user_id, achievement_id, earned_at, claimed_at, xp_claimed)
      VALUES (rec.user_id, reward.achievement_id, NOW(), NOW(), reward.xp_reward);
    END IF;

    -- Award XP and gems
    UPDATE users
    SET xp = xp + reward.xp_reward,
        gems = gems + reward.gem_reward,
        updated_at = NOW()
    WHERE id = rec.user_id;

    -- Award item if configured
    IF reward.item_id IS NOT NULL THEN
      SELECT full_name INTO v_user_name FROM users WHERE id = rec.user_id;
      SELECT name INTO v_item_name FROM collectible_items WHERE id = reward.item_id;

      INSERT INTO user_inventory (user_id, user_name, item_id, item_name, quantity)
      VALUES (rec.user_id, v_user_name, reward.item_id, v_item_name, reward.item_quantity)
      ON CONFLICT (user_id, item_id)
      DO UPDATE SET quantity = user_inventory.quantity + reward.item_quantity, updated_at = now();
    END IF;

    -- Award chest if configured
    IF reward.chest_id IS NOT NULL THEN
      INSERT INTO user_chests (user_id, chest_id, source, source_ref)
      VALUES (rec.user_id, reward.chest_id, 'monthly_leaderboard', 'rank_' || cur_rank);
    END IF;

    -- Notify winner
    INSERT INTO notifications (user_id, type, title, message, icon, data)
    VALUES (rec.user_id, 'competition_winner', rank_title,
      'Chúc mừng! ' || rank_message || ' (' || rec.total_xp || ' XP). +' || reward.xp_reward || ' XP' ||
        CASE WHEN reward.gem_reward > 0 THEN ', +' || reward.gem_reward || ' gems' ELSE '' END ||
        CASE WHEN v_item_name IS NOT NULL THEN ', +' || reward.item_quantity || ' ' || v_item_name ELSE '' END,
      'Crown', json_build_object('competition', 'monthly_xp', 'monthly_xp', rec.total_xp, 'xp_awarded', reward.xp_reward, 'gems_awarded', reward.gem_reward, 'rank', cur_rank)::jsonb);

    awarded := awarded || json_build_object('rank', cur_rank, 'user_id', rec.user_id, 'monthly_xp', rec.total_xp, 'xp_awarded', reward.xp_reward, 'gems_awarded', reward.gem_reward);
    v_item_name := NULL;
  END LOOP;

  IF cur_rank = 0 THEN
    RETURN json_build_object('status', 'no_activity', 'month_start', month_start);
  END IF;

  RETURN json_build_object(
    'status', 'awarded',
    'winners', array_to_json(awarded),
    'month_start', month_start,
    'month_end', month_end
  );
END;
$$;

-- Schedule: SELECT cron.schedule('award-monthly-xp-champion', '10 17 1 * *', 'SELECT award_monthly_xp_champion()');
-- (17:10 UTC on 1st = 00:10 on 1st VN time)

-- ============================================================
-- Student weakness analysis by exercise tags
-- Returns per-student per-tag accuracy for a given course
-- ============================================================
CREATE OR REPLACE FUNCTION get_student_weakness_by_course(p_course_id uuid)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  avatar_url text,
  tag text,
  total_questions bigint,
  correct bigint,
  accuracy numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
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
  WHERE un.course_id = p_course_id
    AND e.tags IS NOT NULL
    AND array_length(e.tags, 1) > 0
  GROUP BY qa.user_id, u.full_name, u.avatar_url, unnest(e.tags)
  ORDER BY qa.user_id, accuracy ASC;
$$;

-- ============================================================
-- AVATAR UPLOADS - User-submitted avatars with admin approval
-- ============================================================
CREATE TABLE IF NOT EXISTS avatar_uploads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reject_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_avatar_uploads_user_id ON avatar_uploads(user_id);
CREATE INDEX idx_avatar_uploads_status ON avatar_uploads(status);

ALTER TABLE avatar_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own avatar uploads"
  ON avatar_uploads FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all avatar uploads"
  ON avatar_uploads FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can upload avatars"
  ON avatar_uploads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update avatar uploads"
  ON avatar_uploads FOR UPDATE
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can delete own pending uploads"
  ON avatar_uploads FOR DELETE
  USING (auth.uid() = user_id AND status = 'pending');

-- ============================================================
-- MISSIONS SYSTEM - Gunny-style Daily/Weekly/Special Missions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.missions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  icon text DEFAULT 'target',
  mission_type text NOT NULL CHECK (mission_type IN ('daily', 'weekly', 'special')),
  goal_type text NOT NULL CHECK (goal_type IN (
    'complete_exercises', 'score_high', 'earn_xp', 'play_games',
    'win_pvp', 'win_quickmatch', 'daily_challenge', 'login_streak', 'complete_session',
    'open_chests', 'collect_items', 'all_green_lesson',
    'blast_words', 'whack_moles', 'scramble_words',
    'type_words', 'match_pairs', 'pronounce_words',
    'earn_3_stars', 'catch_fish', 'complete_all_missions'
  )),
  goal_value integer NOT NULL DEFAULT 1,
  reward_xp integer DEFAULT 0,
  reward_gems integer DEFAULT 0,
  reward_item_id uuid REFERENCES public.collectible_items(id),
  reward_item_quantity integer DEFAULT 1,
  is_active boolean DEFAULT true,
  start_date date,
  end_date date,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_missions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  progress integer DEFAULT 0,
  status text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'claimed')),
  period_start date NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, mission_id, period_start)
);

CREATE INDEX idx_user_missions_user ON user_missions(user_id, status);
CREATE INDEX idx_user_missions_period ON user_missions(user_id, period_start);
CREATE INDEX idx_missions_type ON missions(mission_type, is_active);

ALTER TABLE missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_missions ENABLE ROW LEVEL SECURITY;

-- Missions: everyone can read
CREATE POLICY "Missions are viewable by all authenticated users"
ON missions FOR SELECT TO authenticated USING (true);

-- Missions: admins can insert/update/delete
CREATE POLICY "Admins can insert missions"
ON missions FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update missions"
ON missions FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete missions"
ON missions FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- User missions: users can only manage their own
CREATE POLICY "Users can view own missions"
ON user_missions FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own missions"
ON user_missions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own missions"
ON user_missions FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- Mission RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_missions(p_user_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  today date;
  week_start date;
  result json;
BEGIN
  today := (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  week_start := today - (EXTRACT(ISODOW FROM today)::int - 1);

  INSERT INTO user_missions (user_id, mission_id, progress, status, period_start)
  SELECT p_user_id, m.id, 0, 'active', today
  FROM missions m WHERE m.is_active = true AND m.mission_type = 'daily'
  ON CONFLICT (user_id, mission_id, period_start) DO NOTHING;

  INSERT INTO user_missions (user_id, mission_id, progress, status, period_start)
  SELECT p_user_id, m.id, 0, 'active', week_start
  FROM missions m WHERE m.is_active = true AND m.mission_type = 'weekly'
  ON CONFLICT (user_id, mission_id, period_start) DO NOTHING;

  INSERT INTO user_missions (user_id, mission_id, progress, status, period_start)
  SELECT p_user_id, m.id, 0, 'active', COALESCE(m.start_date, today)
  FROM missions m
  WHERE m.is_active = true AND m.mission_type = 'special'
    AND (m.start_date IS NULL OR m.start_date <= today)
    AND (m.end_date IS NULL OR m.end_date >= today)
  ON CONFLICT (user_id, mission_id, period_start) DO NOTHING;

  SELECT json_build_object(
    'daily', COALESCE((
      SELECT json_agg(row_to_json(d) ORDER BY d.sort_order) FROM (
        SELECT m.id AS mission_id, m.title, m.description, m.icon,
               m.mission_type, m.goal_type, m.goal_value,
               m.reward_xp, m.reward_gems, m.reward_item_id, m.reward_item_quantity,
               ci.name AS reward_item_name, ci.image_url AS reward_item_image,
               ch.name AS reward_chest_name, ch.image_url AS reward_chest_image,
               m.reward_chest_id,
               m.sort_order,
               um.id AS user_mission_id,
               CASE WHEN m.goal_type = 'complete_all_missions' THEN (
                 SELECT COUNT(*) FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
                 WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
                   AND m2.mission_type = 'daily' AND m2.goal_type != 'complete_all_missions'
                   AND m2.is_active = true AND um2.period_start = today
               ) ELSE um.progress END AS progress,
               CASE WHEN m.goal_type = 'complete_all_missions' THEN
                 CASE WHEN (
                   SELECT COUNT(*) FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
                   WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
                     AND m2.mission_type = 'daily' AND m2.goal_type != 'complete_all_missions'
                     AND m2.is_active = true AND um2.period_start = today
                 ) >= m.goal_value AND um.status = 'active' THEN 'completed' ELSE um.status END
               ELSE um.status END AS status
        FROM missions m
        JOIN user_missions um ON um.mission_id = m.id AND um.user_id = p_user_id
        LEFT JOIN collectible_items ci ON ci.id = m.reward_item_id
        LEFT JOIN chests ch ON ch.id = m.reward_chest_id
        WHERE m.is_active = true AND m.mission_type = 'daily' AND um.period_start = today
      ) d
    ), '[]'::json),
    'weekly', COALESCE((
      SELECT json_agg(row_to_json(w) ORDER BY w.sort_order) FROM (
        SELECT m.id AS mission_id, m.title, m.description, m.icon,
               m.mission_type, m.goal_type, m.goal_value,
               m.reward_xp, m.reward_gems, m.reward_item_id, m.reward_item_quantity,
               ci.name AS reward_item_name, ci.image_url AS reward_item_image,
               ch.name AS reward_chest_name, ch.image_url AS reward_chest_image,
               m.reward_chest_id,
               m.sort_order,
               um.id AS user_mission_id,
               CASE WHEN m.goal_type = 'complete_all_missions' THEN (
                 SELECT COUNT(*) FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
                 WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
                   AND m2.mission_type = 'weekly' AND m2.goal_type != 'complete_all_missions'
                   AND m2.is_active = true AND um2.period_start = week_start
               ) ELSE um.progress END AS progress,
               CASE WHEN m.goal_type = 'complete_all_missions' THEN
                 CASE WHEN (
                   SELECT COUNT(*) FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
                   WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
                     AND m2.mission_type = 'weekly' AND m2.goal_type != 'complete_all_missions'
                     AND m2.is_active = true AND um2.period_start = week_start
                 ) >= m.goal_value AND um.status = 'active' THEN 'completed' ELSE um.status END
               ELSE um.status END AS status
        FROM missions m
        JOIN user_missions um ON um.mission_id = m.id AND um.user_id = p_user_id
        LEFT JOIN collectible_items ci ON ci.id = m.reward_item_id
        LEFT JOIN chests ch ON ch.id = m.reward_chest_id
        WHERE m.is_active = true AND m.mission_type = 'weekly' AND um.period_start = week_start
      ) w
    ), '[]'::json),
    'special', COALESCE((
      SELECT json_agg(row_to_json(s) ORDER BY s.sort_order) FROM (
        SELECT m.id AS mission_id, m.title, m.description, m.icon,
               m.mission_type, m.goal_type, m.goal_value,
               m.reward_xp, m.reward_gems, m.reward_item_id, m.reward_item_quantity,
               ci.name AS reward_item_name, ci.image_url AS reward_item_image,
               ch.name AS reward_chest_name, ch.image_url AS reward_chest_image,
               m.reward_chest_id,
               m.sort_order,
               m.start_date, m.end_date,
               um.id AS user_mission_id,
               CASE WHEN m.goal_type = 'complete_all_missions' THEN (
                 SELECT COUNT(*) FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
                 WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
                   AND m2.mission_type = 'special' AND m2.goal_type != 'complete_all_missions'
                   AND m2.is_active = true AND um2.period_start = COALESCE(m2.start_date, today)
               ) ELSE um.progress END AS progress,
               CASE WHEN m.goal_type = 'complete_all_missions' THEN
                 CASE WHEN (
                   SELECT COUNT(*) FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
                   WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
                     AND m2.mission_type = 'special' AND m2.goal_type != 'complete_all_missions'
                     AND m2.is_active = true AND um2.period_start = COALESCE(m2.start_date, today)
                 ) >= m.goal_value AND um.status = 'active' THEN 'completed' ELSE um.status END
               ELSE um.status END AS status
        FROM missions m
        JOIN user_missions um ON um.mission_id = m.id AND um.user_id = p_user_id
        LEFT JOIN collectible_items ci ON ci.id = m.reward_item_id
        LEFT JOIN chests ch ON ch.id = m.reward_chest_id
        WHERE m.is_active = true AND m.mission_type = 'special'
          AND (m.start_date IS NULL OR m.start_date <= today)
          AND (m.end_date IS NULL OR m.end_date >= today)
          AND um.period_start = COALESCE(m.start_date, today)
      ) s
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION update_mission_progress(
  p_user_id uuid, p_goal_type text, p_increment integer DEFAULT 1
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  today date;
  week_start date;
  updated_count integer := 0;
BEGIN
  today := (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  week_start := today - (EXTRACT(ISODOW FROM today)::int - 1);

  -- Ensure user_missions rows exist (student may not have logged in yet)
  INSERT INTO user_missions (user_id, mission_id, progress, status, period_start)
  SELECT p_user_id, m.id, 0, 'active', today
  FROM missions m WHERE m.is_active = true AND m.mission_type = 'daily'
  ON CONFLICT (user_id, mission_id, period_start) DO NOTHING;

  INSERT INTO user_missions (user_id, mission_id, progress, status, period_start)
  SELECT p_user_id, m.id, 0, 'active', week_start
  FROM missions m WHERE m.is_active = true AND m.mission_type = 'weekly'
  ON CONFLICT (user_id, mission_id, period_start) DO NOTHING;

  INSERT INTO user_missions (user_id, mission_id, progress, status, period_start)
  SELECT p_user_id, m.id, 0, 'active', COALESCE(m.start_date, today)
  FROM missions m
  WHERE m.is_active = true AND m.mission_type = 'special'
    AND (m.start_date IS NULL OR m.start_date <= today)
    AND (m.end_date IS NULL OR m.end_date >= today)
  ON CONFLICT (user_id, mission_id, period_start) DO NOTHING;

  UPDATE user_missions um
  SET progress = LEAST(um.progress + p_increment, m.goal_value),
      status = CASE
        WHEN LEAST(um.progress + p_increment, m.goal_value) >= m.goal_value AND um.status = 'active'
        THEN 'completed' ELSE um.status END,
      updated_at = NOW()
  FROM missions m
  WHERE um.mission_id = m.id AND um.user_id = p_user_id AND um.status = 'active'
    AND m.goal_type = p_goal_type AND m.is_active = true
    AND (
      (m.mission_type = 'daily' AND um.period_start = today)
      OR (m.mission_type = 'weekly' AND um.period_start = week_start)
      OR (m.mission_type = 'special' AND um.period_start = COALESCE(m.start_date, today)
          AND (m.end_date IS NULL OR m.end_date >= today))
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN json_build_object('success', true, 'updated_count', updated_count);
END;
$$;

CREATE OR REPLACE FUNCTION claim_mission_reward(p_user_id uuid, p_user_mission_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mission_id uuid; v_status text; v_reward_xp integer; v_reward_gems integer;
  v_mission_title text; v_reward_item_id uuid; v_reward_item_qty integer;
  v_reward_chest_id uuid;
  v_item_name text; v_user_name text; v_mission_type text; v_goal_type text;
  today date; week_start date;
BEGIN
  today := (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  week_start := today - (EXTRACT(ISODOW FROM today)::int - 1);

  SELECT um.status, m.id, m.reward_xp, m.reward_gems, m.title,
         m.reward_item_id, m.reward_item_quantity, m.reward_chest_id,
         m.mission_type, m.goal_type
  INTO v_status, v_mission_id, v_reward_xp, v_reward_gems, v_mission_title,
       v_reward_item_id, v_reward_item_qty, v_reward_chest_id,
       v_mission_type, v_goal_type
  FROM user_missions um JOIN missions m ON m.id = um.mission_id
  WHERE um.id = p_user_mission_id AND um.user_id = p_user_id;

  IF v_mission_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Mission not found');
  END IF;

  -- For complete_all_missions bonus: check dynamically if all other missions in the same type are claimed
  IF v_goal_type = 'complete_all_missions' AND v_status = 'active' THEN
    DECLARE
      v_completed_count integer;
      v_goal integer;
      v_period_start date;
    BEGIN
      SELECT goal_value INTO v_goal FROM missions WHERE id = v_mission_id;
      SELECT period_start INTO v_period_start FROM user_missions WHERE id = p_user_mission_id;

      IF v_mission_type = 'daily' THEN
        SELECT COUNT(*) INTO v_completed_count
        FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
        WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
          AND m2.mission_type = 'daily' AND m2.goal_type != 'complete_all_missions'
          AND m2.is_active = true AND um2.period_start = v_period_start;
      ELSIF v_mission_type = 'weekly' THEN
        SELECT COUNT(*) INTO v_completed_count
        FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
        WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
          AND m2.mission_type = 'weekly' AND m2.goal_type != 'complete_all_missions'
          AND m2.is_active = true AND um2.period_start = v_period_start;
      ELSIF v_mission_type = 'special' THEN
        SELECT COUNT(*) INTO v_completed_count
        FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
        WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
          AND m2.mission_type = 'special' AND m2.goal_type != 'complete_all_missions'
          AND m2.is_active = true AND um2.period_start = COALESCE(m2.start_date, today);
      END IF;

      IF v_completed_count >= v_goal THEN
        UPDATE user_missions SET status = 'completed' WHERE id = p_user_mission_id;
        v_status := 'completed';
      END IF;
    END;
  END IF;

  IF v_status != 'completed' THEN
    RETURN json_build_object('success', false, 'error', 'Mission not completed yet');
  END IF;

  UPDATE user_missions SET status = 'claimed', updated_at = NOW() WHERE id = p_user_mission_id;

  IF v_reward_xp > 0 THEN
    UPDATE users SET xp = COALESCE(xp, 0) + v_reward_xp, updated_at = NOW() WHERE id = p_user_id;
  END IF;
  IF v_reward_gems > 0 THEN
    UPDATE users SET gems = COALESCE(gems, 0) + v_reward_gems, updated_at = NOW() WHERE id = p_user_id;
  END IF;

  -- Award item reward
  IF v_reward_item_id IS NOT NULL THEN
    SELECT name INTO v_item_name FROM collectible_items WHERE id = v_reward_item_id;
    SELECT full_name INTO v_user_name FROM users WHERE id = p_user_id;

    INSERT INTO user_inventory (user_id, user_name, item_id, item_name, quantity)
    VALUES (p_user_id, v_user_name, v_reward_item_id, v_item_name, COALESCE(v_reward_item_qty, 1))
    ON CONFLICT (user_id, item_id) DO UPDATE
    SET quantity = user_inventory.quantity + COALESCE(v_reward_item_qty, 1), updated_at = NOW();
  END IF;

  -- Award chest reward
  IF v_reward_chest_id IS NOT NULL THEN
    INSERT INTO user_chests (user_id, chest_id, source, source_ref)
    VALUES (p_user_id, v_reward_chest_id, 'mission', v_mission_id::text);
  END IF;

  INSERT INTO notifications (user_id, type, title, message, icon, data)
  VALUES (p_user_id, 'mission_reward', 'Mission Complete!',
    'You completed "' || v_mission_title || '"! ' ||
      CASE WHEN v_reward_xp > 0 THEN '+' || v_reward_xp || ' XP ' ELSE '' END ||
      CASE WHEN v_reward_gems > 0 THEN '+' || v_reward_gems || ' Gems ' ELSE '' END ||
      CASE WHEN v_reward_item_id IS NOT NULL THEN '+' || COALESCE(v_reward_item_qty, 1) || ' ' || COALESCE(v_item_name, 'Item') ELSE '' END,
    'trophy',
    json_build_object('xp', v_reward_xp, 'gems', v_reward_gems, 'mission_title', v_mission_title,
      'item_id', v_reward_item_id, 'item_name', v_item_name, 'item_quantity', v_reward_item_qty));

  RETURN json_build_object('success', true, 'xp_earned', v_reward_xp, 'gems_earned', v_reward_gems,
    'mission_title', v_mission_title, 'item_id', v_reward_item_id, 'item_name', v_item_name, 'item_quantity', v_reward_item_qty);
END;
$$;

CREATE OR REPLACE FUNCTION claim_all_mission_rewards(p_user_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  total_xp integer := 0; total_gems integer := 0; claimed_count integer := 0;
  items_granted integer := 0; chests_granted integer := 0;
  rec RECORD; v_user_name text; v_item_name text;
  today date; week_start date;
BEGIN
  today := (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  week_start := today - (EXTRACT(ISODOW FROM today)::int - 1);
  SELECT name INTO v_user_name FROM users WHERE id = p_user_id;

  -- Auto-complete eligible bonus missions before claiming
  FOR rec IN
    SELECT um.id AS user_mission_id, m.mission_type, m.goal_value, um.period_start
    FROM user_missions um JOIN missions m ON m.id = um.mission_id
    WHERE um.user_id = p_user_id AND um.status = 'active'
      AND m.goal_type = 'complete_all_missions' AND m.is_active = true
  LOOP
    DECLARE
      v_done integer;
    BEGIN
      IF rec.mission_type = 'daily' THEN
        SELECT COUNT(*) INTO v_done FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
        WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
          AND m2.mission_type = 'daily' AND m2.goal_type != 'complete_all_missions'
          AND m2.is_active = true AND um2.period_start = rec.period_start;
      ELSIF rec.mission_type = 'weekly' THEN
        SELECT COUNT(*) INTO v_done FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
        WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
          AND m2.mission_type = 'weekly' AND m2.goal_type != 'complete_all_missions'
          AND m2.is_active = true AND um2.period_start = rec.period_start;
      ELSIF rec.mission_type = 'special' THEN
        SELECT COUNT(*) INTO v_done FROM user_missions um2 JOIN missions m2 ON m2.id = um2.mission_id
        WHERE um2.user_id = p_user_id AND um2.status = 'claimed'
          AND m2.mission_type = 'special' AND m2.goal_type != 'complete_all_missions'
          AND m2.is_active = true AND um2.period_start = COALESCE(m2.start_date, today);
      END IF;
      IF v_done >= rec.goal_value THEN
        UPDATE user_missions SET status = 'completed' WHERE id = rec.user_mission_id;
      END IF;
    END;
  END LOOP;

  FOR rec IN
    SELECT um.id AS user_mission_id, m.reward_xp, m.reward_gems, m.title,
           m.reward_item_id, m.reward_item_quantity, m.reward_chest_id,
           m.mission_type, m.goal_type, m.id AS mission_id
    FROM user_missions um JOIN missions m ON m.id = um.mission_id
    WHERE um.user_id = p_user_id AND um.status = 'completed'
  LOOP
    UPDATE user_missions SET status = 'claimed', updated_at = NOW() WHERE id = rec.user_mission_id;
    total_xp := total_xp + COALESCE(rec.reward_xp, 0);
    total_gems := total_gems + COALESCE(rec.reward_gems, 0);
    claimed_count := claimed_count + 1;

    -- Grant item reward
    IF rec.reward_item_id IS NOT NULL THEN
      SELECT name INTO v_item_name FROM collectible_items WHERE id = rec.reward_item_id;
      INSERT INTO user_inventory (user_id, user_name, item_id, item_name, quantity)
      VALUES (p_user_id, v_user_name, rec.reward_item_id, v_item_name, COALESCE(rec.reward_item_quantity, 1))
      ON CONFLICT (user_id, item_id) DO UPDATE
      SET quantity = user_inventory.quantity + COALESCE(rec.reward_item_quantity, 1), updated_at = NOW();
      items_granted := items_granted + 1;
    END IF;

    -- Grant chest reward
    IF rec.reward_chest_id IS NOT NULL THEN
      INSERT INTO user_chests (user_id, chest_id, source, source_ref)
      VALUES (p_user_id, rec.reward_chest_id, 'mission', rec.mission_id::text);
      chests_granted := chests_granted + 1;
    END IF;

  END LOOP;

  IF claimed_count > 0 THEN
    UPDATE users SET xp = COALESCE(xp, 0) + total_xp, gems = COALESCE(gems, 0) + total_gems, updated_at = NOW()
    WHERE id = p_user_id;

    INSERT INTO notifications (user_id, type, title, message, icon, data)
    VALUES (p_user_id, 'mission_reward', 'Missions Claimed!',
      'You claimed ' || claimed_count || ' missions! +' || total_xp || ' XP, +' || total_gems || ' Gems' ||
        CASE WHEN items_granted > 0 THEN ', +' || items_granted || ' items' ELSE '' END,
      'trophy', json_build_object('xp', total_xp, 'gems', total_gems, 'count', claimed_count, 'items_granted', items_granted));
  END IF;

  RETURN json_build_object('success', true, 'claimed_count', claimed_count, 'total_xp', total_xp, 'total_gems', total_gems, 'items_granted', items_granted);
END;
$$;

-- Sample missions data
INSERT INTO missions (title, description, icon, mission_type, goal_type, goal_value, reward_xp, reward_gems, sort_order) VALUES
('Chiến binh chăm chỉ', 'Hoàn thành 3 bài tập', 'book-open', 'daily', 'complete_exercises', 3, 30, 0, 1),
('Ngôi sao sáng', 'Đạt 90%+ trong 2 bài tập', 'star', 'daily', 'score_high', 2, 40, 1, 2),
('Huấn luyện viên', 'Chơi 2 trò chơi pet', 'gamepad-2', 'daily', 'play_games', 2, 20, 0, 3),
('Thử thách hàng ngày', 'Tham gia Daily Challenge', 'trophy', 'daily', 'daily_challenge', 1, 25, 1, 4),
('Học giả tuần này', 'Hoàn thành 15 bài tập trong tuần', 'graduation-cap', 'weekly', 'complete_exercises', 15, 150, 5, 1),
('Đấu sĩ PvP', 'Thắng 3 trận PvP trong tuần', 'swords', 'weekly', 'win_pvp', 3, 100, 5, 2),
('Streak Master', 'Duy trì streak 5 ngày', 'flame', 'weekly', 'login_streak', 5, 120, 3, 3),
('Game thủ', 'Chơi 10 trò chơi pet trong tuần', 'joystick', 'weekly', 'play_games', 10, 80, 3, 4),
('Siêu điểm', 'Đạt 90%+ trong 8 bài tập', 'medal', 'weekly', 'score_high', 8, 100, 5, 5),
('Thợ săn kho báu', 'Mở 3 rương trong tuần', 'package-open', 'weekly', 'open_chests', 3, 60, 2, 6),
('Huyền thoại XP', 'Kiếm 500 XP', 'zap', 'special', 'earn_xp', 500, 200, 10, 1),
('Nhà sưu tập', 'Thu thập 5 vật phẩm', 'gem', 'special', 'collect_items', 5, 100, 8, 2);

-- =============================================
-- LIVE BATTLE SYSTEM
-- =============================================

CREATE TABLE public.live_battle_sessions (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  course_id uuid NOT NULL REFERENCES public.courses(id),
  teacher_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'setup' CHECK (status IN ('setup','active','finished')),
  team_a_name text DEFAULT 'Team Alpha',
  team_b_name text DEFAULT 'Team Beta',
  team_a_score integer DEFAULT 0,
  team_b_score integer DEFAULT 0,
  winner_team text CHECK (winner_team IN ('a','b','draw')),
  xp_winner integer DEFAULT 30,
  xp_loser integer DEFAULT 10,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT live_battle_sessions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.live_battle_participants (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  session_id uuid NOT NULL REFERENCES public.live_battle_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_pet_id uuid REFERENCES public.user_pets(id),
  team text NOT NULL CHECK (team IN ('a','b')),
  individual_score integer DEFAULT 0,
  xp_awarded integer DEFAULT 0,
  CONSTRAINT live_battle_participants_pkey PRIMARY KEY (id),
  CONSTRAINT live_battle_participants_unique UNIQUE (session_id, user_id)
);

-- Guest access tables
CREATE TABLE public.guest_visitors (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT guest_visitors_pkey PRIMARY KEY (id)
);

CREATE TABLE public.guest_attempts (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  guest_id uuid NOT NULL REFERENCES public.guest_visitors(id),
  session_id uuid NOT NULL REFERENCES public.sessions(id),
  score integer DEFAULT 0,
  total_correct integer DEFAULT 0,
  total_questions integer DEFAULT 0,
  time_used_seconds integer DEFAULT 0,
  timed_out boolean DEFAULT false,
  answers jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT guest_attempts_pkey PRIMARY KEY (id)
);

-- Guest access RLS policies
ALTER TABLE public.guest_visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous insert on guest_visitors"
  ON public.guest_visitors FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anonymous insert on guest_attempts"
  ON public.guest_attempts FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow authenticated read on guest_visitors"
  ON public.guest_visitors FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated read on guest_attempts"
  ON public.guest_attempts FOR SELECT TO authenticated USING (true);

-- Anon read access for guest/demo mode
CREATE POLICY "Allow anonymous read on sessions"
  ON public.sessions FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anonymous read on exercises"
  ON public.exercises FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anonymous read on exercise_assignments"
  ON public.exercise_assignments FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anonymous read on courses"
  ON public.courses FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anonymous read on units"
  ON public.units FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anonymous read on site_settings"
  ON public.site_settings FOR SELECT TO anon USING (true);

-- ============================================================
-- WILD AREA LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wild_area_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  pet_id uuid REFERENCES public.pets(id) ON DELETE SET NULL,
  pet_name text,
  pet_rarity text,
  ball_item_id uuid REFERENCES public.collectible_items(id) ON DELETE SET NULL,
  ball_name text,
  action text NOT NULL CHECK (action IN ('encounter', 'catch_success', 'catch_fail')),
  is_duplicate boolean DEFAULT false,
  refund_xp integer DEFAULT 0,
  catch_rate integer,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wild_area_logs_user_id ON public.wild_area_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_wild_area_logs_created_at ON public.wild_area_logs(created_at DESC);

ALTER TABLE public.wild_area_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all wild area logs"
  ON public.wild_area_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users can read all wild area logs"
  ON public.wild_area_logs FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service can insert wild area logs"
  ON public.wild_area_logs FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- REPORTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'other',
  subject text NOT NULL,
  message text NOT NULL,
  screenshot_url text,
  status text NOT NULL DEFAULT 'pending',
  admin_reply text,
  replied_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  replied_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create reports"
  ON reports FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own reports"
  ON reports FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all reports"
  ON reports FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update reports"
  ON reports FOR UPDATE
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete reports"
  ON reports FOR DELETE
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- STUDENT REPORTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id uuid REFERENCES courses(id) ON DELETE CASCADE NOT NULL,
  student_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  report_data jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- TOURNAMENTS (Bracket / Elimination)
-- ============================================================
CREATE TABLE public.tournaments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  bracket_size integer NOT NULL CHECK (bracket_size IN (4, 8, 16, 32, 64)),
  game_type text NOT NULL DEFAULT 'wordtype' CHECK (game_type IN ('wordtype', 'scramble', 'matchgame', 'whackmole', 'astroblast', 'flappy', 'sayitright', 'quizrush')),
  current_round integer NOT NULL DEFAULT 1,
  total_rounds integer NOT NULL,
  created_by uuid NOT NULL,
  winner_id uuid,
  round_rewards jsonb DEFAULT '{}',
  entry_fee integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tournaments_pkey PRIMARY KEY (id),
  CONSTRAINT tournaments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id),
  CONSTRAINT tournaments_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES public.users(id)
);

CREATE TABLE public.tournament_participants (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  tournament_id uuid NOT NULL,
  user_id uuid NOT NULL,
  seed integer NOT NULL,
  eliminated_in_round integer,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tournament_participants_pkey PRIMARY KEY (id),
  CONSTRAINT tournament_participants_tournament_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE,
  CONSTRAINT tournament_participants_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT tournament_participants_unique UNIQUE (tournament_id, user_id),
  CONSTRAINT tournament_participants_seed_unique UNIQUE (tournament_id, seed)
);

CREATE TABLE public.tournament_matches (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  tournament_id uuid NOT NULL,
  round integer NOT NULL,
  match_position integer NOT NULL,
  player1_id uuid,
  player2_id uuid,
  player1_score integer,
  player2_score integer,
  winner_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'completed')),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tournament_matches_pkey PRIMARY KEY (id),
  CONSTRAINT tournament_matches_tournament_fkey FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE,
  CONSTRAINT tournament_matches_player1_fkey FOREIGN KEY (player1_id) REFERENCES public.users(id),
  CONSTRAINT tournament_matches_player2_fkey FOREIGN KEY (player2_id) REFERENCES public.users(id),
  CONSTRAINT tournament_matches_winner_fkey FOREIGN KEY (winner_id) REFERENCES public.users(id),
  CONSTRAINT tournament_matches_round_pos_unique UNIQUE (tournament_id, round, match_position)
);

CREATE INDEX idx_tournament_participants_user ON public.tournament_participants(user_id);
CREATE INDEX idx_tournament_matches_tournament ON public.tournament_matches(tournament_id, round);

