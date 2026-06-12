-- admin_inspect.sql — locks in admin.inspect_user: the read-only
-- "user says X is broken" lens (docs/admin.md § inspect_user). It is
-- the only RPC that takes no reason and writes no audit row, and the
-- only path cairn_readonly has to auth.users data — so its `auth`
-- sub-document must be an ALLOWLIST of non-secret columns, never a
-- to_jsonb(u) minus named secrets.
--
-- The secret test is deliberately non-vacuous: the bootstrap stub now
-- carries GoTrue's credential/recovery-token columns, so we seed Alice
-- with sentinel values in every one of them and assert each is ABSENT
-- from inspect_user(alice)->'auth' while an allowed column (email) is
-- present and correct. A denylist-style body that forgot a column would
-- leak the sentinel and fail here.
--
-- 18 assertions:
--   Executability + shape (Alice has 1 membership, 0 items, 0 votes):
--     1. inspect_user runs for cairn_admin (inherits cairn_readonly).
--     2. profile->>'display_name' is the signup default 'New user'.
--     3. memberships array length is 1.
--     4. item_count is 0.
--     5. vote_count is 0.
--     6. auth->>'email' is present and correct (allowlisted column).
--   Secret-stripping (allowlist), one per credential/token column:
--     7-13. auth omits encrypted_password, recovery_token,
--           confirmation_token, email_change_token_new,
--           email_change_token_current, reauthentication_token,
--           phone_change_token.
--   No-audit + denials:
--    14. inspect_user writes zero admin.actions rows.
--    15. authenticated → 42501 at the GRANT layer.
--    16. cairn_readonly HAS EXECUTE on inspect_user.
--    17. authenticated has NO EXECUTE.
--    18. anon has NO EXECUTE.

BEGIN;

SELECT plan(18);

\i /db/tests/fixtures/list_shared_alice_bob.sql

-- Seed sentinel secrets on Alice so the allowlist test is non-vacuous.
UPDATE auth.users SET
  encrypted_password = 'SENTINEL-encrypted-password',
  recovery_token = 'SENTINEL-recovery-token',
  confirmation_token = 'SENTINEL-confirmation-token',
  email_change_token_new = 'SENTINEL-email-change-new',
  email_change_token_current = 'SENTINEL-email-change-current',
  reauthentication_token = 'SENTINEL-reauthentication-token',
  phone_change_token = 'SENTINEL-phone-change-token'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- 1. The intended caller path: cairn_admin reaches it via cairn_readonly.
SET LOCAL ROLE cairn_admin;
SELECT lives_ok(
  $$SELECT admin.inspect_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  'inspect_user runs for cairn_admin (inherits cairn_readonly)'
);
RESET ROLE;

-- Capture the document once (as the test superuser) for content checks.
CREATE TEMP TABLE _doc AS
SELECT admin.inspect_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') AS j;

-- 2-5. Shape.
SELECT is(
  (SELECT j -> 'profile' ->> 'display_name' FROM _doc),
  'New user',
  'inspect_user returns the profile display_name'
);
SELECT is(
  (SELECT jsonb_array_length(j -> 'memberships') FROM _doc),
  1,
  'inspect_user lists the one live membership (the shared list)'
);
SELECT is(
  (SELECT (j ->> 'item_count')::int FROM _doc),
  0,
  'inspect_user reports item_count = 0'
);
SELECT is(
  (SELECT (j ->> 'vote_count')::int FROM _doc),
  0,
  'inspect_user reports vote_count = 0'
);

-- 6. An allowlisted column is present and correct.
SELECT is(
  (SELECT j -> 'auth' ->> 'email' FROM _doc),
  'alice@test',
  'inspect_user auth carries the allowlisted email'
);

-- 7-13. Every credential/recovery-token column is absent by
-- construction. jsonb_exists tests key presence directly, so a leak of
-- the seeded sentinel value (a denylist body that forgot a column)
-- fails here.
SELECT ok(
  (SELECT NOT jsonb_exists(j -> 'auth', 'encrypted_password') FROM _doc),
  'inspect_user auth omits encrypted_password'
);
SELECT ok(
  (SELECT NOT jsonb_exists(j -> 'auth', 'recovery_token') FROM _doc),
  'inspect_user auth omits recovery_token'
);
SELECT ok(
  (SELECT NOT jsonb_exists(j -> 'auth', 'confirmation_token') FROM _doc),
  'inspect_user auth omits confirmation_token'
);
SELECT ok(
  (SELECT NOT jsonb_exists(j -> 'auth', 'email_change_token_new') FROM _doc),
  'inspect_user auth omits email_change_token_new'
);
SELECT ok(
  (SELECT NOT jsonb_exists(j -> 'auth', 'email_change_token_current') FROM _doc),
  'inspect_user auth omits email_change_token_current'
);
SELECT ok(
  (SELECT NOT jsonb_exists(j -> 'auth', 'reauthentication_token') FROM _doc),
  'inspect_user auth omits reauthentication_token'
);
SELECT ok(
  (SELECT NOT jsonb_exists(j -> 'auth', 'phone_change_token') FROM _doc),
  'inspect_user auth omits phone_change_token'
);

-- 14. Read-only: no audit row is ever written.
SELECT is(
  (SELECT count(*)::int FROM admin.actions),
  0,
  'inspect_user writes no admin.actions row'
);

-- 15. GRANT-layer denial for the PostgREST-facing role.
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT admin.inspect_user('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  '42501',
  NULL,
  'inspect_user denies authenticated at the GRANT layer (42501)'
);
RESET ROLE;

-- 16-18. Grant matrix: readonly may inspect; the API roles may not.
SELECT ok(
  has_function_privilege(
    'cairn_readonly', 'admin.inspect_user(uuid)', 'EXECUTE'
  ),
  'cairn_readonly HAS EXECUTE on inspect_user'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated', 'admin.inspect_user(uuid)', 'EXECUTE'
  ),
  'authenticated has NO EXECUTE on inspect_user'
);
SELECT ok(
  NOT has_function_privilege('anon', 'admin.inspect_user(uuid)', 'EXECUTE'),
  'anon has NO EXECUTE on inspect_user'
);

SELECT finish();

ROLLBACK;
