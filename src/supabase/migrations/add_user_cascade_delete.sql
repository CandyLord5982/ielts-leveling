-- Migration: Add ON DELETE CASCADE / SET NULL to all foreign keys referencing users
-- Dynamically finds ALL FK constraints pointing to users(id) or auth.users(id)
-- and replaces them with CASCADE or SET NULL.

-- ============================================================
-- 1. users.id -> auth.users(id) CASCADE
-- ============================================================
DO $$ DECLARE r record; BEGIN
  FOR r IN
    SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
    WHERE nsp.nspname = 'public' AND rel.relname = 'users' AND att.attname = 'id' AND con.contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', r.conname);
  END LOOP;
  ALTER TABLE public.users ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
END $$;

-- ============================================================
-- 2. Auto-update ALL foreign keys referencing public.users(id)
--    - "reference" columns (created_by, teacher_id, assigned_by, recorded_by,
--      overridden_by, reviewed_by, replied_by) -> SET NULL (+ drop NOT NULL)
--    - Everything else (user_id, student_id, etc.) -> CASCADE
-- ============================================================
DO $$
DECLARE
  r record;
  v_action text;
  v_ref_schema text;
  v_ref_table text;
  -- Columns that should SET NULL instead of CASCADE
  set_null_columns text[] := ARRAY[
    'created_by', 'teacher_id', 'assigned_by', 'recorded_by',
    'overridden_by', 'reviewed_by', 'replied_by', 'assigned_student_id'
  ];
BEGIN
  -- Find ALL FK constraints across all public tables that reference users(id) or auth.users(id)
  FOR r IN
    SELECT
      nsp.nspname AS src_schema,
      rel.relname AS src_table,
      att.attname AS src_column,
      con.conname AS constraint_name,
      ref_nsp.nspname AS ref_schema,
      ref_rel.relname AS ref_table,
      con.confdeltype AS current_action,
      att.attnotnull AS is_notnull
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_class ref_rel ON ref_rel.oid = con.confrelid
    JOIN pg_namespace ref_nsp ON ref_nsp.oid = ref_rel.relnamespace
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
    WHERE con.contype = 'f'
      AND ref_rel.relname = 'users'
      AND ref_nsp.nspname IN ('public', 'auth')
      AND nsp.nspname = 'public'
      AND NOT (rel.relname = 'users' AND att.attname = 'id')  -- skip the one we already did
  LOOP
    -- Decide CASCADE or SET NULL
    IF r.src_column = ANY(set_null_columns) THEN
      v_action := 'SET NULL';
      -- Drop NOT NULL if needed so SET NULL can work
      IF r.is_notnull THEN
        EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I DROP NOT NULL',
          r.src_schema, r.src_table, r.src_column);
      END IF;
    ELSE
      v_action := 'CASCADE';
    END IF;

    -- Skip if already has the correct action
    -- confdeltype: a=no action, r=restrict, c=cascade, n=set null, d=set default
    IF (v_action = 'CASCADE' AND r.current_action = 'c')
       OR (v_action = 'SET NULL' AND r.current_action = 'n') THEN
      CONTINUE;
    END IF;

    v_ref_schema := r.ref_schema;
    v_ref_table := r.ref_table;

    -- Drop old constraint
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',
      r.src_schema, r.src_table, r.constraint_name);

    -- Add new constraint
    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I.%I(id) ON DELETE %s',
      r.src_schema, r.src_table,
      r.src_table || '_' || r.src_column || '_fkey',
      r.src_column,
      v_ref_schema, v_ref_table,
      v_action
    );

    RAISE NOTICE 'Updated %.% -> ON DELETE %', r.src_table, r.src_column, v_action;
  END LOOP;
END $$;
