# Exercise Bank access

Apply `migrations/202610300001_exercise_bank_access.sql` to the target Supabase
database using the SQL Editor or your migration workflow **before deploying the
updated application**. The migration is transactional and can be applied again.
It does not grant access to any existing teacher.

Open **Admin → Exercise Bank → Access**, choose a teacher, select a permission,
and save:

- **No access**: the teacher cannot browse or read bank exercises.
- **Entire Exercise Bank**: all bank folders and unfiled bank exercises.
- **Selected folders**: selected folders and all their descendants, including
  subfolders created later. Parent folders appear for navigation only.

For example, grant A the entire bank, leave B with no access, and grant C only the
folders they should use. Administrators always retain full access. A teacher with
an empty selected-folder list has no access.

Permissions also apply to the assignment and Live Battle pickers and direct
exercise reads. An exercise already assigned to a class is still hidden from a
teacher if it is outside their granted bank scope. Existing reports omit those
exercise records. Students can read bank exercises assigned to courses in which
they have an active enrollment, as well as active Daily Challenges published for
today or earlier in Vietnam time. Active guest-course exercises remain public.
Non-bank exercise reads retain their existing policies.

The migration enables RLS on exercises, exercise folders, users, and daily
challenges. It adds
restrictive policies so older broad read policies cannot override bank scopes,
and guards user role changes to prevent teachers from changing their own role
to bypass access checks. Existing write policies remain necessary for authoring;
bank grants do not add teacher editing privileges. Daily Challenge publishing
remains admin-only so students cannot grant themselves access by creating a
challenge. Admins manage grants through
an atomic RPC; clients cannot write the permission tables directly.

Run the isolated checks with:

```sh
npm run test:exercise-bank-access
npm run build
```

Database tests use local PGlite fixtures and the actual migration. They never
connect to a Supabase project. After applying the migration, verify with separate
admin, full-access teacher, denied teacher, folder-scoped teacher, and enrolled
student accounts in the target environment.
