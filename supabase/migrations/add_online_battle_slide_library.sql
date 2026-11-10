-- Online Battle: "My slides" - teachers reuse and delete PDFs they uploaded before.
--
-- Slides live in the exercise-files bucket under online-battle/<teacher user id>/.
-- The original file name (as on the teacher's computer) is kept in the file's
-- user_metadata.original_name; files uploaded before this have only a date.
--
-- Ownership comes from storage itself (owner_id = who uploaded the file), not from the
-- folder name, so the list also picks up older uploads in other online-battle/ folders.
--
-- Run after add_online_battle_slides.sql. Safe to run again.

BEGIN;

-- ---------------------------------------------------------------------------
-- The calling teacher's slide files, newest first.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.online_battle_my_slides()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_staff(v_uid) THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'path', o.name,
             'original_name', o.user_metadata->>'original_name',
             'created_at', o.created_at,
             'size', (o.metadata->>'size')::bigint
           ) ORDER BY o.created_at DESC), '[]'::jsonb)
    FROM storage.objects o
    WHERE o.bucket_id = 'exercise-files'
      AND o.name LIKE 'online-battle/%'
      AND o.owner_id = v_uid::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.online_battle_my_slides() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.online_battle_my_slides() TO authenticated;

-- ---------------------------------------------------------------------------
-- Teachers may delete their own slide files (and nothing else in the bucket).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Teachers delete own online battle slides" ON storage.objects;
CREATE POLICY "Teachers delete own online battle slides" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'exercise-files'
    AND name LIKE 'online-battle/%'
    AND owner_id = auth.uid()::text
    AND public.is_staff(auth.uid())
  );

COMMIT;
