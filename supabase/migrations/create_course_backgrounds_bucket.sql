-- Storage bucket for the background images of courses and units.
-- Without it, uploading a background fails with "StorageApiError: Bucket not found".
-- Images are public so students can see them; only admins and teachers can change them.
INSERT INTO storage.buckets (id, name, public)
VALUES ('course-backgrounds', 'course-backgrounds', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Course backgrounds are public" ON storage.objects;

CREATE POLICY "Course backgrounds are public" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'course-backgrounds');

-- Uploads use upsert, which needs insert and update, so one policy covers every write.
DROP POLICY IF EXISTS "Staff manage course backgrounds" ON storage.objects;

CREATE POLICY "Staff manage course backgrounds" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'course-backgrounds'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role IN ('admin', 'teacher')
    )
  )
  WITH CHECK (
    bucket_id = 'course-backgrounds'
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid() AND users.role IN ('admin', 'teacher')
    )
  );
