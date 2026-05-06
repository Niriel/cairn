-- 0001_init.sql — walking-skeleton schema.
-- Creates the Postgres roles PostgREST/GoTrue need, a migrations ledger,
-- and one trivial public-readable table to prove the API path works.
-- The real domain schema (lists, items, votes, circles, ...) lands in a
-- later migration — see docs/data-model.md.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Roles. `cairn` is the superuser (created by Postgres itself from
-- POSTGRES_USER). The rest are created here.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    EXECUTE format(
      'CREATE ROLE authenticator LOGIN PASSWORD %L NOINHERIT',
      current_setting('cairn.authenticator_password', true)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gotrue') THEN
    EXECUTE format(
      'CREATE ROLE gotrue LOGIN PASSWORD %L',
      current_setting('cairn.gotrue_password', true)
    );
  END IF;
END$$;

GRANT anon, authenticated TO authenticator;

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- The auth schema is owned by GoTrue, which creates and migrates it on
-- first connection. We just have to let the gotrue role create it.
GRANT CREATE ON DATABASE cairn TO gotrue;

CREATE TABLE IF NOT EXISTS public._migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- Smoke table: replaced wholesale when the real schema lands.
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.profiles TO anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_read_all'
  ) THEN
    CREATE POLICY profiles_read_all ON public.profiles FOR SELECT USING (true);
  END IF;
END$$;

COMMIT;
