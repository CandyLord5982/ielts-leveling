-- Admin "Storage" tab: lets admins browse, upload, rename and delete files in every
-- bucket from inside the app, instead of opening the Supabase dashboard.
--
-- Before this, admins could only list some buckets, could not see the bucket list at
-- all, and could not upload to inventory-assets, pet-assets, real-image, shop-assets or
-- ui-assets. These rules apply to admins only (public.is_admin). Rules for students and
-- teachers are unchanged.
--
-- Safe to run again.

BEGIN;

DROP POLICY IF EXISTS "Admins list all buckets" ON storage.buckets;
CREATE POLICY "Admins list all buckets" ON storage.buckets
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins read all files" ON storage.objects;
CREATE POLICY "Admins read all files" ON storage.objects
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins upload to all buckets" ON storage.objects;
CREATE POLICY "Admins upload to all buckets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- Needed for "replace file" (upsert) and for rename/move
DROP POLICY IF EXISTS "Admins update all files" ON storage.objects;
CREATE POLICY "Admins update all files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins delete all files" ON storage.objects;
CREATE POLICY "Admins delete all files" ON storage.objects
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

COMMIT;
