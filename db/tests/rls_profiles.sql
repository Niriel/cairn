-- rls_profiles.sql — locks in `profiles_select` (world-readable
-- to authenticated callers; see `docs/data-model.md` →
-- "profiles") and `profiles_update` (own-row-only).
--
-- 6 assertions:
--   1. SELECT positive (Alice sees Bob's profile).
--   2. SELECT positive (Bob sees Alice's profile).
--   3. GRANT-layer unauth negative (anon SELECT → 42501).
--   4. Policy-layer unauth negative (authenticated, claims unset
--      → count(0)).
--   5. UPDATE own positive (Alice patches her own display_name).
--   6. UPDATE other negative (Alice cannot patch Bob's row).
--
-- (3) and (4) are the **per-defence-layer** split: without (3),
-- a future GRANT SELECT TO anon would re-expose every profile;
-- without (4), a future permissive `using (true)` policy would
-- do the same. Both layers have to be tested separately because
-- a regression in either one alone would still pass the other
-- assertion silently.

BEGIN;

SELECT plan(6);

\i /db/tests/fixtures/users_alice_bob_carol.sql

-- The fixture inserted Alice/Bob/Carol into auth.users; the
-- `tg_profile_on_signup` AFTER-INSERT trigger created profile
-- rows for each with display_name = the provisional username.

-- 1. SELECT positive: Alice sees Bob's profile.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT is(
  (
    SELECT count(*)::int FROM public.profiles
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  1,
  'profiles SELECT positive: Alice sees Bob (world-readable)'
);

-- 2. SELECT positive: Bob sees Alice's profile.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);
SELECT is(
  (
    SELECT count(*)::int FROM public.profiles
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  1,
  'profiles SELECT positive: Bob sees Alice (world-readable)'
);

-- 3. GRANT-layer unauth negative: anon → SQLSTATE 42501.
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT * FROM public.profiles LIMIT 1$$,
  '42501',
  NULL,
  'profiles GRANT-layer denial: anon SELECT raises 42501'
);

-- 4. Policy-layer unauth negative: authenticated with NO claims
-- set → `public.uid()` returns NULL → no row matches
-- `profiles_select`'s using clause → count = 0. This exercises
-- the policy itself, not the GRANT.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '', TRUE);
SELECT is(
  (SELECT count(*)::int FROM public.profiles),
  0,
  'profiles policy-layer denial: authenticated + no claims sees 0 rows'
);

-- 5. UPDATE own positive: Alice patches her own display_name.
RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
UPDATE public.profiles
SET display_name = 'Alice the Updater'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (
    SELECT display_name FROM public.profiles
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'Alice the Updater',
  'profiles UPDATE positive: Alice patches her own display_name'
);

-- 6. UPDATE other negative: Alice tries to patch Bob's row.
-- The UPDATE syntax succeeds but RLS makes WHERE match zero
-- rows for her — Bob's display_name stays at the trigger's
-- default (their provisional username). Assert by reading Bob's row.
UPDATE public.profiles
SET display_name = 'Bob, edited by Alice'
WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SELECT is(
  (
    SELECT display_name FROM public.profiles
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  'u' || repeat('b', 29),
  'profiles UPDATE negative: Alice cannot patch Bob''s display_name'
);

SELECT finish();

ROLLBACK;
