-- RLS lockdown: 34 public tables had RLS disabled, so any holder of the public
-- anon key could read/write them regardless of policies (e.g. a guest account
-- created a course via the admin panel). This enables RLS everywhere and adds
-- the missing policies.
--
-- Scope of this pass:
--   * Writes are locked to the right role (admin / staff / row owner).
--   * Reads stay as open as before for logged-in users (many student-facing
--     pages read other users' rows: leaderboard, profiles, recent activity,
--     PvP). Tightening reads is a separate pass.
--   * Anonymous (not signed in) access is limited to what the login/register
--     pages need.
--
-- Depends on public.is_admin(uuid) from fix_users_privilege_escalation.sql.

BEGIN;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_staff(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = uid AND role IN ('admin', 'teacher')
  );
$$;

REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Reference / catalog tables: everyone signed in reads, admins write
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'achievements', 'pets', 'pet_bonuses', 'shop_items', 'leaderboard_rewards',
    'daily_challenges', 'tournaments'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "lockdown_read" ON public.%I', t);
    EXECUTE format('CREATE POLICY "lockdown_read" ON public.%I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS "lockdown_admin_write" ON public.%I', t);
    EXECUTE format('CREATE POLICY "lockdown_admin_write" ON public.%I FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()))', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Courses: admin-only writes (CourseManagement.jsx is the only writer).
-- Register page lists active courses before sign-in, so anon may read those.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.courses;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.courses;
DROP POLICY IF EXISTS "lockdown_admin_write" ON public.courses;
CREATE POLICY "lockdown_admin_write" ON public.courses
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "lockdown_anon_read_active" ON public.courses;
CREATE POLICY "lockdown_anon_read_active" ON public.courses
  FOR SELECT TO anon
  USING (is_active = true);

-- ---------------------------------------------------------------------------
-- Course content: teachers edit units/sessions/assignments from the study
-- pages and exercises/folders via the shared exercise bank, so staff write.
-- Existing "readable by authenticated users" SELECT policies cover reads.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'units', 'sessions', 'exercises', 'exercise_folders', 'exercise_assignments'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "lockdown_staff_write" ON public.%I', t);
    EXECUTE format('CREATE POLICY "lockdown_staff_write" ON public.%I FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()))', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Per-user rows written by the student's own client; staff may also manage
-- them (teacher reports edit progress/attempts). Reads stay open to signed-in
-- users for now.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user_progress', 'question_attempts', 'user_achievements', 'user_pets',
    'training_scores', 'daily_challenge_participations', 'daily_challenge_attempts',
    'pet_interactions'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "lockdown_read" ON public.%I', t);
    EXECUTE format('CREATE POLICY "lockdown_read" ON public.%I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('DROP POLICY IF EXISTS "lockdown_own_write" ON public.%I', t);
    EXECUTE format('CREATE POLICY "lockdown_own_write" ON public.%I FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t);
    EXECUTE format('DROP POLICY IF EXISTS "lockdown_staff_write" ON public.%I', t);
    EXECUTE format('CREATE POLICY "lockdown_staff_write" ON public.%I FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()))', t);
  END LOOP;
END $$;

-- Purchases: Shop.jsx inserts the buyer's own row; admins grant items.
DROP POLICY IF EXISTS "lockdown_own_insert" ON public.user_purchases;
CREATE POLICY "lockdown_own_insert" ON public.user_purchases
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Enrollments: new users enroll themselves at signup (useAuth.jsx), but only
-- into a course offered on the register page.
DROP POLICY IF EXISTS "lockdown_read" ON public.course_enrollments;
CREATE POLICY "lockdown_read" ON public.course_enrollments
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "lockdown_self_enroll" ON public.course_enrollments;
CREATE POLICY "lockdown_self_enroll" ON public.course_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.site_settings s
      WHERE s.setting_key = 'register_course_ids'
        AND s.setting_value::jsonb ? course_id::text
    )
  );

-- Teacher-authored student reports; students may read their own.
DROP POLICY IF EXISTS "lockdown_staff_write" ON public.student_reports;
CREATE POLICY "lockdown_staff_write" ON public.student_reports
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));
DROP POLICY IF EXISTS "lockdown_own_read" ON public.student_reports;
CREATE POLICY "lockdown_own_read" ON public.student_reports
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Games: PvP and tournaments are updated from players' browsers
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "lockdown_read" ON public.pvp_challenges;
CREATE POLICY "lockdown_read" ON public.pvp_challenges
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "lockdown_challenger_insert" ON public.pvp_challenges;
CREATE POLICY "lockdown_challenger_insert" ON public.pvp_challenges
  FOR INSERT TO authenticated
  WITH CHECK (challenger_id = auth.uid());
DROP POLICY IF EXISTS "lockdown_participant_update" ON public.pvp_challenges;
CREATE POLICY "lockdown_participant_update" ON public.pvp_challenges
  FOR UPDATE TO authenticated
  USING (auth.uid() IN (challenger_id, opponent_id))
  WITH CHECK (auth.uid() IN (challenger_id, opponent_id));

DROP POLICY IF EXISTS "lockdown_own_insert" ON public.pvp_matchmaking;
CREATE POLICY "lockdown_own_insert" ON public.pvp_matchmaking
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "lockdown_read" ON public.tournament_participants;
CREATE POLICY "lockdown_read" ON public.tournament_participants
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "lockdown_own_register" ON public.tournament_participants;
CREATE POLICY "lockdown_own_register" ON public.tournament_participants
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "lockdown_admin_write" ON public.tournament_participants;
CREATE POLICY "lockdown_admin_write" ON public.tournament_participants
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "lockdown_read" ON public.tournament_matches;
CREATE POLICY "lockdown_read" ON public.tournament_matches
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "lockdown_admin_write" ON public.tournament_matches;
CREATE POLICY "lockdown_admin_write" ON public.tournament_matches
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
-- PetDisplay.jsx syncs a player's best training score into their own match.
DROP POLICY IF EXISTS "lockdown_player_update" ON public.tournament_matches;
CREATE POLICY "lockdown_player_update" ON public.tournament_matches
  FOR UPDATE TO authenticated
  USING (auth.uid() IN (player1_id, player2_id))
  WITH CHECK (auth.uid() IN (player1_id, player2_id));

-- ---------------------------------------------------------------------------
-- Tables that already had RLS on but with wide-open policies
-- ---------------------------------------------------------------------------
-- Anyone could insert any notification, incl. user_id NULL broadcasts that
-- show to every user. Users may only notify themselves; admins keep their
-- existing ALL policy. service_role bypasses RLS, so it needs no policy.
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "lockdown_self_notify" ON public.notifications;
CREATE POLICY "lockdown_self_notify" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Every gift code was readable by everyone. Redemption goes through the
-- SECURITY DEFINER redeem_giftcode() RPC, so only admins need to read codes.
DROP POLICY IF EXISTS "Anyone can read active giftcodes" ON public.giftcodes;

-- ---------------------------------------------------------------------------
-- Turn RLS on. Tables whose existing policies were already correct
-- (cohorts, cohort_members, course_teachers, site_settings, student_levels,
-- test_attempts) just need this.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'achievements', 'cohort_members', 'cohorts', 'course_enrollments',
    'course_teachers', 'courses', 'daily_challenge_attempts',
    'daily_challenge_participations', 'daily_challenges', 'exercise_assignments',
    'exercise_folders', 'exercises', 'leaderboard_rewards', 'pet_bonuses',
    'pet_interactions', 'pets', 'pvp_challenges', 'pvp_matchmaking',
    'question_attempts', 'sessions', 'shop_items', 'site_settings',
    'student_levels', 'student_reports', 'test_attempts', 'tournament_matches',
    'tournament_participants', 'tournaments', 'training_scores', 'units',
    'user_achievements', 'user_pets', 'user_progress', 'user_purchases'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

COMMIT;
