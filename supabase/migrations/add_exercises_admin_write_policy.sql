-- Allow admins to insert/update/delete exercises (previously only SELECT policies existed,
-- so inserts failed with "new row violates row-level security policy for table exercises").
DROP POLICY IF EXISTS "Admins can manage exercises" ON public.exercises;

CREATE POLICY "Admins can manage exercises" ON public.exercises
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND users.role = 'admin'::text
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid() AND users.role = 'admin'::text
  ));
