-- 0003_postgres_role.sql — create a stub `postgres` role for GoTrue.
-- Recent supabase/gotrue migrations hardcode `GRANT ... TO postgres` on
-- their auth tables. Our superuser is `cairn` (POSTGRES_USER), so the
-- role doesn't exist and that migration fails. Creating it as a no-login
-- stub satisfies the grants without exposing a new login surface.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    CREATE ROLE postgres NOLOGIN;
  END IF;
END$$;

COMMIT;
