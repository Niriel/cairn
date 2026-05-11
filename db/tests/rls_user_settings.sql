-- rls_user_settings.sql — locks in `user_settings_select` and
-- `user_settings_update`, both gated `using (id = public.uid())`.
-- Owner-only across the board: privacy is structural (see
-- `docs/data-model.md` → "user_settings").
--
-- 6 assertions:
--   1. SELECT positive (Alice sees her own row).
--   2. SELECT negative (Alice cannot see Bob's row) —
--      **load-bearing**: this is what distinguishes
--      user_settings from profiles. Without (2), a regression
--      that copies `profiles_select`'s `using (true)` to
--      `user_settings_select` would silently make every
--      user's invite_policy world-readable and still pass
--      (1).
--   3. GRANT-layer unauth negative (anon SELECT → 42501).
--   4. Policy-layer unauth negative (authenticated, claims unset
--      → count(0)).
--   5. UPDATE own positive (Alice flips her own invite_policy).
--   6. UPDATE other negative (Alice cannot flip Bob's
--      invite_policy).

BEGIN;

SELECT plan(6);

\i /db/tests/fixtures/users_alice_bob_carol.sql

-- The fixture inserted Alice/Bob/Carol into auth.users; the
-- `tg_profile_on_signup` trigger created their user_settings
-- rows with default invite_policy = 'everybody'.

-- 1. SELECT positive: Alice sees her own row.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT is(
  (
    SELECT count(*)::int FROM public.user_settings
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  1,
  'user_settings SELECT positive: Alice sees her own row'
);

-- 2. SELECT negative: Alice does NOT see Bob's row.
SELECT is(
  (
    SELECT count(*)::int FROM public.user_settings
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  0,
  'user_settings SELECT negative: Alice cannot see Bob''s row '
  '(load-bearing: distinguishes user_settings from profiles)'
);

-- 3. GRANT-layer unauth negative.
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT * FROM public.user_settings LIMIT 1$$,
  '42501',
  NULL,
  'user_settings GRANT-layer denial: anon SELECT raises 42501'
);

-- 4. Policy-layer unauth negative.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '', TRUE);
SELECT is(
  (SELECT count(*)::int FROM public.user_settings),
  0,
  'user_settings policy-layer denial: authenticated + no claims '
  'sees 0 rows'
);

-- 5. UPDATE own positive: Alice flips invite_policy.
RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
UPDATE public.user_settings
SET invite_policy = 'circle'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (
    SELECT invite_policy FROM public.user_settings
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'circle',
  'user_settings UPDATE positive: Alice flips her own invite_policy'
);

-- 6. UPDATE other negative: Alice cannot flip Bob's. RLS makes
-- the WHERE clause match zero rows under Alice's claims;
-- Bob's row stays at the trigger's default.
UPDATE public.user_settings
SET invite_policy = 'nobody'
WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
-- Need to drop to cairn to read Bob's row (RLS would hide it
-- from Alice). RESET ROLE returns the session to cairn (which
-- bypasses RLS as superuser/owner).
RESET ROLE;
SELECT is(
  (
    SELECT invite_policy FROM public.user_settings
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  'everybody',
  'user_settings UPDATE negative: Alice cannot flip Bob''s invite_policy'
);

SELECT finish();

ROLLBACK;
