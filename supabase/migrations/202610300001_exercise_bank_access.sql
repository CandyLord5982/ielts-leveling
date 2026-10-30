-- Apply before deploying the Exercise Bank permissions UI.
-- Teachers have no bank access until an admin explicitly grants it.
-- Grants cover the selected folder and all its descendants. Ancestors are
-- navigation-only. Bank exercises outside a teacher's scope are also hidden
-- from course reports. Students see bank exercises assigned to enrolled courses;
-- signed-out visitors see those assigned to an explicitly public guest course.
-- Published active Daily Challenges also remain available to students.
-- Non-bank exercise reads keep their existing policies.
BEGIN;

CREATE TABLE IF NOT EXISTS public.exercise_bank_access (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  access_mode text NOT NULL CHECK (access_mode IN ('full', 'folders')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exercise_bank_folder_access (
  user_id uuid NOT NULL REFERENCES public.exercise_bank_access(user_id) ON DELETE CASCADE,
  folder_id uuid NOT NULL REFERENCES public.exercise_folders(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, folder_id)
);

ALTER TABLE public.exercise_bank_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_bank_folder_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_challenges ENABLE ROW LEVEL SECURITY;

-- Always read the authoritative database role, never editable JWT metadata.
CREATE OR REPLACE FUNCTION public.exercise_bank_caller_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE((SELECT u.role FROM public.users AS u WHERE u.id = auth.uid()), '');
$$;

-- Self-profile updates must not let a teacher promote themselves or remove the
-- teacher role to bypass the bank restrictions. Auth hooks still create users.
CREATE OR REPLACE FUNCTION public.guard_exercise_bank_user_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND COALESCE(NEW.role, 'user') = 'user')
     OR (TG_OP = 'UPDATE' AND NEW.role IS NOT DISTINCT FROM OLD.role) THEN
    RETURN NEW;
  END IF;
  IF auth.role() = 'service_role'
     OR (auth.role() IS NULL AND session_user IN ('postgres', 'supabase_admin'))
     OR public.exercise_bank_caller_role() = 'admin' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Only an administrator can change user roles' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS guard_exercise_bank_user_role ON public.users;
CREATE TRIGGER guard_exercise_bank_user_role
  BEFORE INSERT OR UPDATE OF role ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_exercise_bank_user_role();

DROP POLICY IF EXISTS exercise_bank_admin_manage_users ON public.users;
CREATE POLICY exercise_bank_admin_manage_users ON public.users
  FOR ALL TO authenticated
  USING (public.exercise_bank_caller_role() = 'admin')
  WITH CHECK (public.exercise_bank_caller_role() = 'admin');

-- A published challenge is an explicit student-facing assignment, not a bank
-- browsing grant. Only admins may publish/change challenge exercise references.
DROP POLICY IF EXISTS exercise_bank_daily_challenge_read ON public.daily_challenges;
CREATE POLICY exercise_bank_daily_challenge_read ON public.daily_challenges
  FOR SELECT TO authenticated
  USING (is_active = true AND challenge_date <= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
DROP POLICY IF EXISTS exercise_bank_daily_challenge_admin ON public.daily_challenges;
CREATE POLICY exercise_bank_daily_challenge_admin ON public.daily_challenges
  FOR ALL TO authenticated
  USING (public.exercise_bank_caller_role() = 'admin')
  WITH CHECK (public.exercise_bank_caller_role() = 'admin');
DROP POLICY IF EXISTS exercise_bank_daily_challenge_read_scope ON public.daily_challenges;
CREATE POLICY exercise_bank_daily_challenge_read_scope ON public.daily_challenges AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (public.exercise_bank_caller_role() = 'admin'
    OR (is_active = true AND challenge_date <= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date));
DROP POLICY IF EXISTS exercise_bank_daily_challenge_insert_scope ON public.daily_challenges;
CREATE POLICY exercise_bank_daily_challenge_insert_scope ON public.daily_challenges AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (public.exercise_bank_caller_role() = 'admin');
DROP POLICY IF EXISTS exercise_bank_daily_challenge_update_scope ON public.daily_challenges;
CREATE POLICY exercise_bank_daily_challenge_update_scope ON public.daily_challenges AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (public.exercise_bank_caller_role() = 'admin')
  WITH CHECK (public.exercise_bank_caller_role() = 'admin');
DROP POLICY IF EXISTS exercise_bank_daily_challenge_delete_scope ON public.daily_challenges;
CREATE POLICY exercise_bank_daily_challenge_delete_scope ON public.daily_challenges AS RESTRICTIVE
  FOR DELETE TO authenticated USING (public.exercise_bank_caller_role() = 'admin');

CREATE OR REPLACE FUNCTION public.can_access_exercise_bank_folder(
  target_folder_id uuid,
  include_ancestors boolean DEFAULT false
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  caller_mode text;
BEGIN
  IF public.exercise_bank_caller_role() = 'admin' THEN RETURN true; END IF;
  IF public.exercise_bank_caller_role() <> 'teacher' THEN RETURN false; END IF;
  SELECT a.access_mode INTO caller_mode
  FROM public.exercise_bank_access AS a WHERE a.user_id = auth.uid();
  IF caller_mode = 'full' THEN RETURN true; END IF;
  IF caller_mode IS DISTINCT FROM 'folders' OR target_folder_id IS NULL THEN RETURN false; END IF;

  -- UNION (rather than UNION ALL) also terminates malformed cyclic trees.
  IF EXISTS (
    WITH RECURSIVE path AS (
      SELECT f.id, f.parent_folder_id FROM public.exercise_folders AS f WHERE f.id = target_folder_id
      UNION
      SELECT p.id, p.parent_folder_id FROM public.exercise_folders AS p
      JOIN path AS child ON p.id = child.parent_folder_id
    )
    SELECT 1 FROM path JOIN public.exercise_bank_folder_access AS g ON g.folder_id = path.id
    WHERE g.user_id = auth.uid()
  ) THEN RETURN true; END IF;

  IF include_ancestors THEN
    RETURN EXISTS (
      WITH RECURSIVE ancestors AS (
        SELECT f.id, f.parent_folder_id FROM public.exercise_folders AS f
        JOIN public.exercise_bank_folder_access AS g ON g.folder_id = f.id
        WHERE g.user_id = auth.uid()
        UNION
        SELECT p.id, p.parent_folder_id FROM public.exercise_folders AS p
        JOIN ancestors AS child ON p.id = child.parent_folder_id
      )
      SELECT 1 FROM ancestors WHERE id = target_folder_id
    );
  END IF;
  RETURN false;
END;
$$;

-- A granted root can be renamed even when its parent is navigation-only.
-- Children may be created/moved only underneath a writable parent.
CREATE OR REPLACE FUNCTION public.can_write_exercise_bank_folder(
  target_folder_id uuid,
  target_parent_folder_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.can_access_exercise_bank_folder(target_parent_folder_id, false)
    OR EXISTS (
      SELECT 1 FROM public.exercise_bank_access AS a
      JOIN public.exercise_bank_folder_access AS g ON g.user_id = a.user_id
      JOIN public.exercise_folders AS f ON f.id = g.folder_id
      WHERE a.user_id = auth.uid() AND a.access_mode = 'folders' AND g.folder_id = target_folder_id
        AND f.parent_folder_id IS NOT DISTINCT FROM target_parent_folder_id
    );
$$;

CREATE OR REPLACE FUNCTION public.get_my_exercise_bank_access()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  caller_mode text;
  granted_ids jsonb;
BEGIN
  IF public.exercise_bank_caller_role() = 'admin' THEN
    RETURN jsonb_build_object('mode', 'full', 'folder_ids', '[]'::jsonb);
  END IF;
  IF public.exercise_bank_caller_role() <> 'teacher' THEN
    RETURN jsonb_build_object('mode', 'none', 'folder_ids', '[]'::jsonb);
  END IF;
  SELECT a.access_mode INTO caller_mode FROM public.exercise_bank_access AS a WHERE a.user_id = auth.uid();
  SELECT COALESCE(jsonb_agg(g.folder_id ORDER BY g.folder_id), '[]'::jsonb) INTO granted_ids
  FROM public.exercise_bank_folder_access AS g WHERE g.user_id = auth.uid();
  RETURN jsonb_build_object('mode', COALESCE(caller_mode, 'none'), 'folder_ids', granted_ids);
END;
$$;

-- Public guest-course content is intentionally shareable. Registered students
-- may read exercises assigned to their active enrollments or published daily
-- challenges without bank grants. Future/inactive daily challenges do not grant
-- access. The date boundary matches get_user_daily_challenge().
-- SECURITY DEFINER avoids policy recursion through exercises/assignments.
CREATE OR REPLACE FUNCTION public.can_read_assigned_bank_exercise(
  target_exercise_id uuid,
  target_session_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH exercise_sessions AS (
    SELECT target_session_id AS id WHERE target_session_id IS NOT NULL
    UNION
    SELECT a.session_id FROM public.exercise_assignments AS a WHERE a.exercise_id = target_exercise_id
  )
  SELECT EXISTS (
    SELECT 1 FROM exercise_sessions AS es
    JOIN public.sessions AS s ON s.id = es.id
    JOIN public.units AS u ON u.id = s.unit_id
    JOIN public.courses AS c ON c.id = u.course_id
    WHERE (c.allow_guest_access = true AND c.is_active = true AND u.is_active = true AND s.is_active = true)
      OR (public.exercise_bank_caller_role() = 'user' AND EXISTS (
        SELECT 1 FROM public.course_enrollments AS ce
        WHERE ce.course_id = c.id AND ce.student_id = auth.uid() AND ce.is_active = true
      ))
  ) OR (public.exercise_bank_caller_role() = 'user' AND EXISTS (
    SELECT 1 FROM public.daily_challenges AS dc
    WHERE dc.exercise_id = target_exercise_id AND dc.is_active = true
      AND dc.challenge_date <= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
  ));
$$;

CREATE OR REPLACE FUNCTION public.set_exercise_bank_access(
  target_user_id uuid,
  requested_mode text,
  requested_folder_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  target_role text;
  distinct_folder_ids uuid[];
BEGIN
  IF public.exercise_bank_caller_role() <> 'admin' THEN
    RAISE EXCEPTION 'Only an administrator can manage Exercise Bank access' USING ERRCODE = '42501';
  END IF;
  IF requested_mode IS NULL OR requested_mode NOT IN ('none', 'full', 'folders') THEN
    RAISE EXCEPTION 'Invalid Exercise Bank access mode' USING ERRCODE = '22023';
  END IF;
  -- Serialize changes for the same teacher, including the first ever grant.
  SELECT u.role INTO target_role FROM public.users AS u WHERE u.id = target_user_id FOR UPDATE;
  IF target_role IS DISTINCT FROM 'teacher' THEN
    RAISE EXCEPTION 'Exercise Bank access can only be assigned to a teacher' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT folder_id), '{}'::uuid[]) INTO distinct_folder_ids
  FROM unnest(COALESCE(requested_folder_ids, '{}'::uuid[])) AS selected(folder_id);
  IF requested_mode = 'folders' THEN
    IF array_position(distinct_folder_ids, NULL) IS NOT NULL THEN
      RAISE EXCEPTION 'Selected folder IDs cannot contain null' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM unnest(distinct_folder_ids) AS selected(folder_id)
      WHERE NOT EXISTS (SELECT 1 FROM public.exercise_folders AS f WHERE f.id = selected.folder_id)
    ) THEN
      RAISE EXCEPTION 'One or more selected folders no longer exist' USING ERRCODE = '22023';
    END IF;
  END IF;

  DELETE FROM public.exercise_bank_access AS a WHERE a.user_id = target_user_id;
  IF requested_mode <> 'none' THEN
    INSERT INTO public.exercise_bank_access (user_id, access_mode) VALUES (target_user_id, requested_mode);
    IF requested_mode = 'folders' THEN
      INSERT INTO public.exercise_bank_folder_access (user_id, folder_id)
      SELECT target_user_id, folder_id FROM unnest(distinct_folder_ids) AS selected(folder_id);
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON public.exercise_bank_access, public.exercise_bank_folder_access FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.exercise_bank_access, public.exercise_bank_folder_access TO authenticated;
GRANT ALL ON public.exercise_bank_access, public.exercise_bank_folder_access TO service_role;

DROP POLICY IF EXISTS exercise_bank_access_read ON public.exercise_bank_access;
CREATE POLICY exercise_bank_access_read ON public.exercise_bank_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.exercise_bank_caller_role() = 'admin');
DROP POLICY IF EXISTS exercise_bank_folder_access_read ON public.exercise_bank_folder_access;
CREATE POLICY exercise_bank_folder_access_read ON public.exercise_bank_folder_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.exercise_bank_caller_role() = 'admin');

-- RESTRICTIVE is essential: the existing broad permissive SELECT policies
-- otherwise OR together and would bypass these per-teacher grants.
DROP POLICY IF EXISTS exercise_bank_teacher_scope ON public.exercises;
DROP POLICY IF EXISTS exercise_bank_read_scope ON public.exercises;
CREATE POLICY exercise_bank_read_scope ON public.exercises AS RESTRICTIVE
  FOR SELECT TO authenticated, anon
  USING (NOT COALESCE(is_in_bank, false)
    OR public.exercise_bank_caller_role() = 'admin'
    OR (public.exercise_bank_caller_role() = 'teacher' AND public.can_access_exercise_bank_folder(folder_id, false))
    OR (public.exercise_bank_caller_role() <> 'teacher' AND public.can_read_assigned_bank_exercise(id, session_id)));

DROP POLICY IF EXISTS exercise_bank_teacher_insert_scope ON public.exercises;
CREATE POLICY exercise_bank_teacher_insert_scope ON public.exercises AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (public.exercise_bank_caller_role() <> 'teacher' OR NOT COALESCE(is_in_bank, false)
    OR public.can_access_exercise_bank_folder(folder_id, false));

DROP POLICY IF EXISTS exercise_bank_teacher_update_scope ON public.exercises;
CREATE POLICY exercise_bank_teacher_update_scope ON public.exercises AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (public.exercise_bank_caller_role() <> 'teacher' OR NOT COALESCE(is_in_bank, false)
    OR public.can_access_exercise_bank_folder(folder_id, false))
  WITH CHECK (public.exercise_bank_caller_role() <> 'teacher' OR NOT COALESCE(is_in_bank, false)
    OR public.can_access_exercise_bank_folder(folder_id, false));

DROP POLICY IF EXISTS exercise_bank_teacher_delete_scope ON public.exercises;
CREATE POLICY exercise_bank_teacher_delete_scope ON public.exercises AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (public.exercise_bank_caller_role() <> 'teacher' OR NOT COALESCE(is_in_bank, false)
    OR public.can_access_exercise_bank_folder(folder_id, false));

DROP POLICY IF EXISTS exercise_bank_teacher_folder_read ON public.exercise_folders;
CREATE POLICY exercise_bank_teacher_folder_read ON public.exercise_folders AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (public.exercise_bank_caller_role() <> 'teacher' OR public.can_access_exercise_bank_folder(id, true));

DROP POLICY IF EXISTS exercise_bank_teacher_folder_insert ON public.exercise_folders;
CREATE POLICY exercise_bank_teacher_folder_insert ON public.exercise_folders AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (public.exercise_bank_caller_role() <> 'teacher'
    OR public.can_write_exercise_bank_folder(id, parent_folder_id));

DROP POLICY IF EXISTS exercise_bank_teacher_folder_update ON public.exercise_folders;
CREATE POLICY exercise_bank_teacher_folder_update ON public.exercise_folders AS RESTRICTIVE
  FOR UPDATE TO authenticated
  USING (public.exercise_bank_caller_role() <> 'teacher' OR public.can_access_exercise_bank_folder(id, false))
  WITH CHECK (public.exercise_bank_caller_role() <> 'teacher'
    OR public.can_write_exercise_bank_folder(id, parent_folder_id));

DROP POLICY IF EXISTS exercise_bank_teacher_folder_delete ON public.exercise_folders;
CREATE POLICY exercise_bank_teacher_folder_delete ON public.exercise_folders AS RESTRICTIVE
  FOR DELETE TO authenticated
  USING (public.exercise_bank_caller_role() <> 'teacher' OR public.can_access_exercise_bank_folder(id, false));

-- Grant only the helpers needed by policies and the two application RPCs.
-- Helpers always use the actual caller's auth.uid(), never a supplied user ID.
REVOKE ALL ON FUNCTION public.exercise_bank_caller_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_exercise_bank_user_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_access_exercise_bank_folder(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_write_exercise_bank_folder(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_exercise_bank_access() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_exercise_bank_access(uuid, text, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_read_assigned_bank_exercise(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exercise_bank_caller_role() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_access_exercise_bank_folder(uuid, boolean) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.can_write_exercise_bank_folder(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_exercise_bank_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_exercise_bank_access(uuid, text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_assigned_bank_exercise(uuid, uuid) TO authenticated, anon;

COMMIT;
