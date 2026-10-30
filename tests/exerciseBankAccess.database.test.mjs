// This fixture database is isolated; it never connects to the application's DB.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const id = (prefix, number) => `${prefix}0000000-0000-0000-0000-${String(number).padStart(12, '0')}`
const users = { admin: id(1, 1), full: id(1, 2), denied: id(1, 3), limited: id(1, 4), student: id(1, 5) }
const folders = { root: id(2, 1), granted: id(2, 2), child: id(2, 3), sibling: id(2, 4), other: id(2, 5) }
const exercises = {
  root: id(3, 1), granted: id(3, 2), child: id(3, 3), guest: id(3, 4), loose: id(3, 5), nonbank: id(3, 6),
  daily: id(3, 7), futureDaily: id(3, 8), inactiveDaily: id(3, 9),
}

test('Exercise Bank migration enforces grants against permissive legacy policies', async (t) => {
  const db = new PGlite()
  await db.exec(`
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.role', true), '');
    $$;
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
    CREATE TABLE public.users (id uuid PRIMARY KEY, email text NOT NULL, role text DEFAULT 'user');
    CREATE TABLE public.exercise_folders (id uuid PRIMARY KEY, name text, parent_folder_id uuid REFERENCES public.exercise_folders(id));
    CREATE TABLE public.exercises (id uuid PRIMARY KEY, title text, folder_id uuid REFERENCES public.exercise_folders(id), session_id uuid, is_in_bank boolean DEFAULT false);
    CREATE TABLE public.courses (id uuid PRIMARY KEY, allow_guest_access boolean DEFAULT false, is_active boolean DEFAULT true);
    CREATE TABLE public.units (id uuid PRIMARY KEY, course_id uuid REFERENCES public.courses(id), is_active boolean DEFAULT true);
    CREATE TABLE public.sessions (id uuid PRIMARY KEY, unit_id uuid REFERENCES public.units(id), is_active boolean DEFAULT true);
    CREATE TABLE public.exercise_assignments (exercise_id uuid REFERENCES public.exercises(id), session_id uuid REFERENCES public.sessions(id));
    CREATE TABLE public.course_enrollments (course_id uuid REFERENCES public.courses(id), student_id uuid REFERENCES public.users(id), is_active boolean DEFAULT true);
    CREATE TABLE public.daily_challenges (id uuid PRIMARY KEY, exercise_id uuid REFERENCES public.exercises(id), challenge_date date NOT NULL, is_active boolean DEFAULT true);
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role;
    CREATE POLICY legacy_exercise_read ON public.exercises FOR SELECT USING (true);
    CREATE POLICY legacy_folder_read ON public.exercise_folders FOR SELECT USING (auth.role() = 'authenticated');
    CREATE POLICY legacy_users_read ON public.users FOR SELECT USING (true);
    CREATE POLICY legacy_users_update ON public.users FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
    CREATE POLICY legacy_users_insert ON public.users FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
    CREATE POLICY legacy_challenges_all ON public.daily_challenges FOR ALL TO authenticated USING (true) WITH CHECK (true);
    -- Simulate an installation with existing teacher authoring permissions;
    -- the migration must narrow these, never introduce new write grants.
    CREATE POLICY legacy_staff_exercise_write ON public.exercises FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('teacher', 'admin')))
      WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('teacher', 'admin')));
    CREATE POLICY legacy_staff_folder_write ON public.exercise_folders FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('teacher', 'admin')))
      WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('teacher', 'admin')));
    INSERT INTO public.users VALUES
      ('${users.admin}', 'admin@example.test', 'admin'),
      ('${users.full}', 'a@example.test', 'teacher'),
      ('${users.denied}', 'b@example.test', 'teacher'),
      ('${users.limited}', 'c@example.test', 'teacher'),
      ('${users.student}', 'student@example.test', 'user');
    INSERT INTO public.exercise_folders VALUES
      ('${folders.root}', 'Root', NULL),
      ('${folders.granted}', 'Granted', '${folders.root}'),
      ('${folders.child}', 'Child', '${folders.granted}'),
      ('${folders.sibling}', 'Sibling', '${folders.root}'),
      ('${folders.other}', 'Other', NULL);
    INSERT INTO public.courses VALUES ('${id(4, 1)}', false, true), ('${id(4, 2)}', true, true);
    INSERT INTO public.units VALUES ('${id(5, 1)}', '${id(4, 1)}', true), ('${id(5, 2)}', '${id(4, 2)}', true);
    INSERT INTO public.sessions VALUES ('${id(6, 1)}', '${id(5, 1)}', true), ('${id(6, 2)}', '${id(5, 2)}', true);
    INSERT INTO public.exercises VALUES
      ('${exercises.root}', 'Root exercise', '${folders.root}', NULL, true),
      ('${exercises.granted}', 'Granted exercise', '${folders.granted}', NULL, true),
      ('${exercises.child}', 'Child exercise', '${folders.child}', NULL, true),
      ('${exercises.guest}', 'Guest exercise', '${folders.sibling}', NULL, true),
      ('${exercises.loose}', 'Unfiled exercise', NULL, NULL, true),
      ('${exercises.nonbank}', 'Non-bank exercise', NULL, NULL, false),
      ('${exercises.daily}', 'Published daily exercise', '${folders.other}', NULL, true),
      ('${exercises.futureDaily}', 'Future daily exercise', '${folders.other}', NULL, true),
      ('${exercises.inactiveDaily}', 'Inactive daily exercise', '${folders.other}', NULL, true);
    INSERT INTO public.exercise_assignments VALUES ('${exercises.root}', '${id(6, 1)}'), ('${exercises.guest}', '${id(6, 2)}');
    INSERT INTO public.course_enrollments VALUES ('${id(4, 1)}', '${users.student}', true);
  `)
  const migration = await readFile(new URL('../supabase/migrations/202610300001_exercise_bank_access.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  // Re-applying must preserve existing grants and remain valid.
  await db.exec(migration)

  const as = async (name) => {
    await db.exec('RESET ROLE')
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false)", [users[name] || '', name === 'anon' ? 'anon' : 'authenticated'])
    await db.exec(`SET ROLE ${name === 'anon' ? 'anon' : 'authenticated'}`)
  }
  const visible = async (table) => (await db.query(`SELECT id FROM public.${table} ORDER BY id`)).rows.map(row => row.id)
  const access = async () => (await db.query('SELECT public.get_my_exercise_bank_access() AS access')).rows[0].access
  const grant = async (user, mode, selected = []) => db.query('SELECT public.set_exercise_bank_access($1::uuid, $2::text, $3::uuid[])', [users[user], mode, selected])
  const denied = async (sql, params = [], pattern = /permission|administrator|row-level security/i) => {
    await assert.rejects(db.query(sql, params), pattern)
  }

  await t.test('default deny and no self-service grants', async () => {
    await as('denied')
    assert.deepEqual(await access(), { mode: 'none', folder_ids: [] })
    assert.deepEqual(await visible('exercise_folders'), [])
    assert.deepEqual(await visible('exercises'), [exercises.nonbank])
    await assert.rejects(grant('denied', 'full'), /administrator/i)
    await denied('INSERT INTO public.exercise_bank_access(user_id,access_mode) VALUES ($1, $2)', [users.denied, 'full'])
    await denied('UPDATE public.users SET role = $1 WHERE id = $2', ['admin', users.denied])
    await denied('UPDATE public.users SET role = $1 WHERE id = $2', ['user', users.denied])
    await denied('INSERT INTO public.users(id,email,role) VALUES ($1,$2,$3)', [users.denied, 'b@example.test', 'admin'])
    assert.equal((await db.query('DELETE FROM public.users WHERE id = $1 RETURNING id', [users.denied])).rows.length, 0)
  })

  await t.test('admin assigns full or folder grants atomically', async () => {
    await as('admin')
    assert.deepEqual(await access(), { mode: 'full', folder_ids: [] })
    await grant('full', 'full')
    await grant('limited', 'folders', [folders.granted, folders.granted])
    assert.equal((await db.query('SELECT * FROM public.exercise_bank_access')).rows.length, 2)
    await assert.rejects(grant('limited', 'folders', [id(2, 99)]), /no longer exist/i)
    await assert.rejects(grant('limited', 'folders', [null]), /cannot contain null/i)
    await assert.rejects(grant('student', 'full'), /only.*teacher/i)
    await assert.rejects(grant('limited', 'invalid'), /invalid/i)
    assert.deepEqual(await visible('exercises'), Object.values(exercises).sort())
    await db.exec('RESET ROLE')
    await db.exec(migration)
    await as('admin')
    assert.equal((await db.query('SELECT * FROM public.exercise_bank_access')).rows.length, 2)
  })

  await t.test('full scope includes rootless exercises', async () => {
    await as('full')
    assert.deepEqual(await access(), { mode: 'full', folder_ids: [] })
    assert.deepEqual(await visible('exercises'), Object.values(exercises).sort())
    assert.deepEqual(await visible('exercise_folders'), Object.values(folders).sort())
    await db.query("INSERT INTO public.exercise_folders(id,name,parent_folder_id) VALUES ($1,'New root',NULL)", [id(2, 97)])
    await db.query('DELETE FROM public.exercise_folders WHERE id = $1', [id(2, 97)])
  })

  await t.test('folder scope inherits descendants and shows navigation-only ancestors', async () => {
    await as('limited')
    assert.deepEqual(await access(), { mode: 'folders', folder_ids: [folders.granted] })
    assert.deepEqual(await visible('exercise_folders'), [folders.root, folders.granted, folders.child])
    assert.deepEqual(await visible('exercises'), [exercises.granted, exercises.child, exercises.nonbank])
    assert.equal((await db.query('SELECT * FROM public.exercises WHERE id = $1', [exercises.root])).rows.length, 0)
    assert.equal((await db.query('SELECT * FROM public.exercises WHERE id = $1', [exercises.guest])).rows.length, 0)
  })

  await t.test('teacher writes cannot escape the granted subtree', async () => {
    await as('limited')
    assert.equal((await db.query("UPDATE public.exercises SET title = 'Allowed edit' WHERE id = $1 RETURNING id", [exercises.granted])).rows.length, 1)
    assert.equal((await db.query("UPDATE public.exercises SET title = 'Forbidden edit' WHERE id = $1 RETURNING id", [exercises.root])).rows.length, 0)
    await denied('UPDATE public.exercises SET folder_id = $1 WHERE id = $2', [folders.sibling, exercises.granted])
    await denied("INSERT INTO public.exercises(id,title,folder_id,is_in_bank) VALUES ($1,'Forbidden insert',$2,true)", [id(3, 99), folders.sibling])
    assert.equal((await db.query("UPDATE public.exercise_folders SET name = 'Forbidden ancestor edit' WHERE id = $1 RETURNING id", [folders.root])).rows.length, 0)
    assert.equal((await db.query("UPDATE public.exercise_folders SET name = 'Allowed root edit' WHERE id = $1 RETURNING id", [folders.granted])).rows.length, 1)
    await denied('UPDATE public.exercise_folders SET parent_folder_id = $1 WHERE id = $2', [folders.other, folders.granted])
    await denied('UPDATE public.exercise_folders SET parent_folder_id = $1 WHERE id = $2', [folders.sibling, folders.child])
    await denied("INSERT INTO public.exercise_folders(id,name,parent_folder_id) VALUES ($1,'Forbidden child',$2)", [id(2, 99), folders.sibling])
    await db.query("INSERT INTO public.exercise_folders(id,name,parent_folder_id) VALUES ($1,'Allowed child',$2)", [id(2, 98), folders.granted])
    await db.query('DELETE FROM public.exercise_folders WHERE id = $1', [id(2, 98)])
  })

  await t.test('students and visitors keep only intended course access', async () => {
    await as('student')
    assert.deepEqual(await visible('exercises'), [exercises.root, exercises.guest, exercises.nonbank])
    await as('anon')
    assert.deepEqual(await visible('exercises'), [exercises.guest, exercises.nonbank])
    assert.deepEqual(await visible('exercise_folders'), [])
    await denied('SELECT public.set_exercise_bank_access($1,$2)', [users.denied, 'full'])
    await as('admin')
    await db.query('UPDATE public.course_enrollments SET is_active = false WHERE student_id = $1', [users.student])
    await db.query('UPDATE public.sessions SET is_active = false WHERE id = $1', [id(6, 2)])
    await as('student')
    assert.deepEqual(await visible('exercises'), [exercises.nonbank])
    await as('anon')
    assert.deepEqual(await visible('exercises'), [exercises.nonbank])
  })

  await t.test('published daily challenges work without opening the bank or draft challenges', async () => {
    await as('admin')
    await db.query(`INSERT INTO public.daily_challenges(id,exercise_id,challenge_date,is_active) VALUES
      ($1,$2,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,true),
      ($3,$4,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 1,true),
      ($5,$6,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,false),
      ($7,$8,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1,true)`,
    [id(7, 1), exercises.daily, id(7, 2), exercises.futureDaily, id(7, 3), exercises.inactiveDaily, id(7, 4), exercises.loose])
    await as('student')
    assert.deepEqual(await visible('exercises'), [exercises.loose, exercises.nonbank, exercises.daily])
    assert.deepEqual(await visible('daily_challenges'), [id(7, 1), id(7, 4)])
    assert.equal((await db.query('SELECT * FROM public.exercises WHERE id = $1', [exercises.futureDaily])).rows.length, 0)
    assert.equal((await db.query('SELECT * FROM public.exercises WHERE id = $1', [exercises.inactiveDaily])).rows.length, 0)
    await denied(`INSERT INTO public.daily_challenges(id,exercise_id,challenge_date,is_active)
      VALUES ($1,$2,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,true)`, [id(7, 99), exercises.inactiveDaily])
    assert.equal((await db.query('UPDATE public.daily_challenges SET exercise_id = $1 WHERE id = $2 RETURNING id', [exercises.futureDaily, id(7, 1)])).rows.length, 0)
    assert.equal((await db.query('DELETE FROM public.daily_challenges WHERE id = $1 RETURNING id', [id(7, 1)])).rows.length, 0)
    await as('denied')
    assert.deepEqual(await visible('exercises'), [exercises.nonbank])
    await as('limited')
    assert.deepEqual(await visible('exercises'), [exercises.granted, exercises.child, exercises.nonbank])
    await as('anon')
    assert.deepEqual(await visible('exercises'), [exercises.nonbank])
    await as('admin')
    await db.exec('DELETE FROM public.daily_challenges')
  })

  await t.test('empty grants and revocation take effect immediately', async () => {
    await as('admin')
    await grant('limited', 'folders', [])
    await as('limited')
    assert.deepEqual(await access(), { mode: 'folders', folder_ids: [] })
    assert.deepEqual(await visible('exercises'), [exercises.nonbank])
    await as('admin')
    await grant('full', 'none')
    await as('full')
    assert.deepEqual(await access(), { mode: 'none', folder_ids: [] })
    assert.deepEqual(await visible('exercises'), [exercises.nonbank])
  })

  await t.test('admin and service processes can still manage roles', async () => {
    await as('admin')
    await db.query('UPDATE public.users SET role = $1 WHERE id = $2', ['admin', users.denied])
    await db.query('UPDATE public.users SET role = $1 WHERE id = $2', ['teacher', users.denied])
    await db.exec('RESET ROLE')
    await db.query("SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claim.role', 'service_role', false)")
    await db.exec('SET ROLE service_role')
    await db.query('UPDATE public.users SET role = $1 WHERE id = $2', ['user', users.denied])
    await db.query('UPDATE public.users SET role = $1 WHERE id = $2', ['teacher', users.denied])
    assert.equal((await db.query('SELECT role FROM public.users WHERE id = $1', [users.denied])).rows[0].role, 'teacher')
  })
  await db.close()
})
