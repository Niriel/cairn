-- infra_auth_stub.sql — infrastructure check for the test database.
--
-- Verifies that the stubbed `auth.users`, `public.uid()`, the tombstone
-- row, and the absolute-path fixture include all behave as the rest of
-- the pgTAP suite expects. Two of the four assertions are gated: in
-- Phase A (before migration 0004) `public.uid()` and the tombstone row
-- don't exist yet, so the run is `1..4` with skip/fail; once 0004 lands
-- (Phase C) all four pass.

BEGIN;

SELECT plan(4);

-- Late-bound shim: referencing public.uid() directly in a CASE branch
-- can fail at parse time when the function doesn't exist. Wrapping the
-- call in plpgsql defers resolution and lets us swallow the
-- undefined_function error in Phase A.
CREATE FUNCTION pg_temp.uid_or_zero() RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
    RETURN public.uid();
EXCEPTION WHEN undefined_function THEN
    RETURN NULL;
END;
$$;

-- Set a JWT claim so that, once public.uid() exists, it has a value to
-- read. Harmless in Phase A.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);

-- 1. Stubbed auth schema is in place.
SELECT has_table('auth', 'users', 'auth.users exists');

-- 2. public.uid() returns the JWT-claim UUID — gated until 0004 lands.
SELECT CASE WHEN EXISTS (
  SELECT 1 FROM pg_proc
  WHERE
    proname = 'uid'
    AND pronamespace = 'public'::regnamespace
) THEN is(
  pg_temp.uid_or_zero(),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'public.uid() returns the JWT sub claim'
) ELSE skip('public.uid() not defined yet (pre-0004)', 1) END;

-- 3. The tombstone row exists in auth.users.
SELECT ok(
  EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = '00000000-0000-0000-0000-000000000000'
  ),
  'tombstone row exists in auth.users'
);

-- 4. The fixture include works end-to-end (absolute-path convention).
\i /db/tests/fixtures/users_alice_bob_carol.sql

SELECT ok(
  EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'fixture include loaded Alice'
);

SELECT * FROM finish(); --noqa: AM04

ROLLBACK;
