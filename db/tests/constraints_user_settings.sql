-- constraints_user_settings.sql — locks in the `invite_policy` CHECK
-- constraint shape from docs/data-model.md → `user_settings`.
--
-- `invite_policy` is the three-way switch governing who can invite a
-- user to a list (everybody / circle / nobody — see docs/invites.md).
-- The schema enforces the enum via a CHECK constraint; this file
-- pins both halves: the three accepted values and the SQLSTATE
-- 23514 (`check_violation`) raised on anything else.
--
-- `profiles` deliberately has no companion file: it has no CHECK
-- constraints to exercise in v1 (see PLAN.md → Architecture →
-- Test files).
--
-- Strategy: rely on `tg_profile_on_signup` having created Alice's
-- user_settings row with the default `'everybody'` when the fixture
-- inserted Alice into auth.users; UPDATE that row with each value
-- under test. Runs under the test session's `cairn` superuser, which
-- bypasses RLS (RLS coverage lives in rls_user_settings.sql).

BEGIN;

SELECT plan(6);

\i /db/tests/fixtures/users_alice_bob_carol.sql

-- Accepted values --------------------------------------------------
SELECT lives_ok(
  $$UPDATE public.user_settings SET invite_policy = 'everybody'
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'invite_policy accepts ''everybody'''
);

SELECT lives_ok(
  $$UPDATE public.user_settings SET invite_policy = 'circle'
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'invite_policy accepts ''circle'''
);

SELECT lives_ok(
  $$UPDATE public.user_settings SET invite_policy = 'nobody'
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'invite_policy accepts ''nobody'''
);

-- Rejected values — SQLSTATE 23514 is `check_violation`.
SELECT throws_ok(
  $$UPDATE public.user_settings SET invite_policy = 'public'
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  '23514',
  NULL,
  'invite_policy rejects ''public'' with SQLSTATE 23514'
);

SELECT throws_ok(
  $$UPDATE public.user_settings SET invite_policy = ''
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  '23514',
  NULL,
  'invite_policy rejects empty string with SQLSTATE 23514'
);

SELECT throws_ok(
  $$UPDATE public.user_settings SET invite_policy = 'anything-else'
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  '23514',
  NULL,
  'invite_policy rejects arbitrary text with SQLSTATE 23514'
);

SELECT finish();

ROLLBACK;
