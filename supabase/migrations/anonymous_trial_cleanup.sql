-- Anonymous trial accounts (supabase.auth.signInAnonymously) are real auth users and
-- accumulate real progress/XP/pet rows. Most never convert to a real account, so they
-- must be garbage-collected or they pile up forever. This deletes anonymous auth users
-- older than 30 days; the FK cascades on public.users(id) clean up their progress, pets,
-- inventory, etc. A handful of tables (tournaments/class_wars ownership) use NO ACTION,
-- so a stale trial user who happened to create one of those would block their own
-- deletion - caught and skipped per-row rather than aborting the whole run.
CREATE OR REPLACE FUNCTION public.delete_stale_anonymous_users()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  stale_user RECORD;
BEGIN
  FOR stale_user IN
    SELECT id FROM auth.users
    WHERE is_anonymous = true AND created_at < now() - interval '30 days'
  LOOP
    BEGIN
      DELETE FROM auth.users WHERE id = stale_user.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Skipped stale anonymous user %: %', stale_user.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_stale_anonymous_users() FROM PUBLIC;

SELECT cron.schedule(
  'delete-stale-anonymous-users',
  '0 3 * * *', -- daily at 03:00 UTC
  $$SELECT public.delete_stale_anonymous_users();$$
);
