-- Fixes a privilege-escalation hole: the only UPDATE policy on public.users
-- ("Enable update for users based on id") checks WHOSE row is being updated
-- (auth.uid() = id), not WHICH columns change. Any authenticated user could
-- open devtools and run:
--   supabase.from('users').update({ role: 'admin' }).eq('id', <their own id>)
-- and the database would accept it. Same hole let a banned user flip their
-- own is_banned flag back off.
--
-- Side effect this also fixes: admin-only client calls that update OTHER
-- users' rows (role changes, bans, gifted xp/gems, real_name edits in
-- UserManagement.jsx / ClassWarSetupModal.jsx) were being silently rejected
-- by RLS, since no policy ever allowed auth.uid() != id. This adds a proper
-- admin policy so those actually work.
--
-- Note: xp/gems/level/current_level/streak_count are NOT locked down here -
-- they're written directly by normal gameplay code as self-updates
-- (useProgress.jsx, useProgressWithLevels.jsx, useAchievements.jsx, usePet.jsx)
-- and are not routed through RPCs, so protecting them would break the game
-- loop. They remain self-writable and thus still spoofable client-side; that
-- is a separate, larger fix (moving those writes to SECURITY DEFINER RPCs
-- like increment_user_currency) and out of scope here.

-- Admin check as SECURITY DEFINER so it can read `role` without being
-- blocked by the very same users-table RLS it's used to enforce.
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = uid AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;

-- Column-level protection: role/is_banned can only change via an update
-- performed by someone who is already an admin. RLS policies can't express
-- "same row, but only these columns may differ," so this is enforced with a
-- trigger instead - it silently keeps the old value for non-admin callers
-- rather than erroring, so it doesn't break unrelated field updates bundled
-- in the same call (e.g. updateProfile() patching several columns at once).
CREATE OR REPLACE FUNCTION public.protect_privileged_user_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    NEW.role := OLD.role;
    NEW.is_banned := OLD.is_banned;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_privileged_user_columns ON public.users;
CREATE TRIGGER protect_privileged_user_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_privileged_user_columns();

-- Lets admins update OTHER users' rows (role changes, bans, currency gifts,
-- real name edits) through the normal client. Coexists with the existing
-- "Enable update for users based on id" policy - Postgres ORs permissive
-- policies together, so a user's own-row updates still work unchanged.
DROP POLICY IF EXISTS "Admins can update any user" ON public.users;
CREATE POLICY "Admins can update any user"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
