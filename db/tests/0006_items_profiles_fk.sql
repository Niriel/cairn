-- 0006_items_profiles_fk.sql — tests for the FK constraints added in
-- migration 0006 that enable PostgREST embedded resource joins from
-- items.created_by, items.modified_by, and votes.user_id to profiles.
--
-- Coverage:
--   (a) FK items.created_by → public.profiles.id exists
--   (b) FK items.modified_by → public.profiles.id exists
--   (c) FK votes.user_id → public.profiles.id exists
--   (d) positive: inserting an item with a created_by UUID that exists
--       in profiles succeeds
--   (e) negative: inserting an item whose JWT-stamped created_by UUID
--       exists in auth.users but NOT in profiles raises SQLSTATE 23503

BEGIN;

SELECT plan(5);

\i /db/tests/fixtures/list_solo_alice.sql

-- (a) FK items.created_by → profiles --------------------------------
-- Cannot use fk_ok() here: items.created_by has two FK constraints
-- (one to auth.users, one to public.profiles). fk_ok() queries
-- pg_all_foreign_keys by source column only — no filter on the
-- referenced table — so with multiple FKs it picks one arbitrarily
-- and the assertion becomes a coin flip. Direct pg_constraint lookup
-- by constraint name is unambiguous.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint AS c
    INNER JOIN pg_class AS reftbl ON c.confrelid = reftbl.oid
    INNER JOIN pg_namespace AS refns ON reftbl.relnamespace = refns.oid
    WHERE
      c.conname = 'items_created_by_profiles_fk'
      AND c.contype = 'f'
      AND refns.nspname = 'public'
      AND reftbl.relname = 'profiles'
  ),
  'items.created_by FK to profiles'
);

-- (b) FK items.modified_by → profiles --------------------------------
-- Same fk_ok() limitation as (a) — two FKs on the column.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint AS c
    INNER JOIN pg_class AS reftbl ON c.confrelid = reftbl.oid
    INNER JOIN pg_namespace AS refns ON reftbl.relnamespace = refns.oid
    WHERE
      c.conname = 'items_modified_by_profiles_fk'
      AND c.contype = 'f'
      AND refns.nspname = 'public'
      AND reftbl.relname = 'profiles'
  ),
  'items.modified_by FK to profiles'
);

-- (c) FK votes.user_id → profiles ------------------------------------
-- Same fk_ok() limitation — votes.user_id also has two FKs.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint AS c
    INNER JOIN pg_class AS reftbl ON c.confrelid = reftbl.oid
    INNER JOIN pg_namespace AS refns ON reftbl.relnamespace = refns.oid
    WHERE
      c.conname = 'votes_user_id_profiles_fk'
      AND c.contype = 'f'
      AND refns.nspname = 'public'
      AND reftbl.relname = 'profiles'
  ),
  'votes.user_id FK to profiles'
);

-- (d) positive: item with valid profile created_by succeeds ----------
-- JWT claims are already set to Alice by the fixture.
SELECT lives_ok(
  $$INSERT INTO public.items (list_id, name) VALUES
    ('22222222-2222-2222-2222-222222222222', 'Valid item')$$,
  'item insert with known profile created_by succeeds'
);

-- (e) negative: item whose JWT-stamped created_by has no profiles row -
-- Insert a fresh user into auth.users (tg_profile_on_signup auto-creates
-- the profiles row), then immediately delete their profiles row, leaving
-- the auth.users row intact. The subsequent item insert at the cairn role
-- with that UUID as jwt sub will pass the auth.users FK but fail on the
-- new profiles FK.
DO $$
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'profileless@test')
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM public.profiles
  WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"}',
  TRUE
);

SELECT throws_ok(
  $$INSERT INTO public.items (list_id, name) VALUES
    ('22222222-2222-2222-2222-222222222222', 'Profileless item')$$,
  '23503',
  NULL,
  'item insert fails FK violation when created_by has no profiles row'
);

SELECT finish();

ROLLBACK;
