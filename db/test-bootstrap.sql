-- db/test-bootstrap.sql — stubs for the pgTAP test database.
--
-- The pgTAP suite runs against a throwaway `cairn_test` database that never
-- has GoTrue connected to it, so the `auth` schema and the `authenticated` /
-- `anon` roles that GoTrue + 0001_init.sql normally provide are missing.
-- Migrations and tests both reference `auth.users` (FKs, fixtures,
-- attribution triggers), so we stub the bare minimum here, between
-- `CREATE DATABASE cairn_test` and the migration loop in
-- `scripts/test-db.sh`.
--
-- See docs/data-model.md → "auth.users is owned by GoTrue" for the
-- production picture. In production, GoTrue owns the `auth` schema and
-- creates / migrates `auth.users`; we never touch it from our migrations.
-- In the test DB there is no GoTrue, so we fake just enough of it.
--
-- RULE: any future migration that references a new `auth.users` column must
-- extend the stub below at the same time. Otherwise the test suite silently
-- masks a divergence between our schema's expectations and the real GoTrue
-- schema.
--
-- auth.users column checklist (stub just the columns our FKs and
-- triggers touch — not a full mirror of GoTrue's real schema):
--   id          uuid        PRIMARY KEY
--   email       text
--   created_at  timestamptz DEFAULT now()
--
-- This file is intentionally outside `db/tests/` because `pg_prove --ext
-- .sql /db/tests` enumerates every `.sql` there as a test file; a bootstrap
-- with no `SELECT plan(N)` would red the whole suite.

BEGIN;

-- Idempotent role creation (mirrors the shape used in 0001_init.sql). The
-- test DB has no `authenticator` role and no GoTrue; we only need the two
-- end roles that tests will `SET LOCAL ROLE` to.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END$$;

-- No `AUTHORIZATION gotrue` — the `gotrue` role doesn't exist in the test
-- DB, and ownership doesn't matter when GoTrue never runs against it.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
