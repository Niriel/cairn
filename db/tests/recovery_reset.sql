-- recovery_reset.sql — the signed-out reset flow: request_password_reset
-- (resolve a username to its on-file recovery_email, mint a reset token, return
-- the address so the BFF knows where to send) and reset_password (set a new
-- password via pgcrypto on the right code, with no GoTrue admin credential).
--
-- Both RPCs are reachable ONLY by the scoped role cairn_auth_bff, never anon or
-- authenticated — that is the load-bearing R5/R7 boundary: the private on-file
-- address stays off the anon surface and the password write stays off the public
-- surface. Tests act as cairn_auth_bff (SET LOCAL ROLE) to exercise the RPCs and
-- as the cairn superuser (RESET ROLE) to seed recovery_email / inspect the token
-- and the encrypted_password column.
--
-- reset_password returns a status string ('ok' | 'invalid' | 'locked') for the
-- same return-not-raise reason as confirm_recovery_email: PostgREST rolls back a
-- raised error, so a wrong-code path that RAISEd would roll back its own
-- `attempts` bump and the brute-force defence (R8) would be a no-op. Assertion
-- (g) proves the `attempts` counter accumulates across calls (a raising design
-- leaves it at 0). The one match-path error with nothing to persist — a correct
-- code but a too-short password — still raises 23514 and leaves the token
-- UNCONSUMED so the user can retry with a longer password.
--
-- pgTAP runs in a DB with no GoTrue, so it cannot prove GoTrue *accepts* the
-- bcrypt hash — it proves the column changes to a valid crypt() value. The
-- end-to-end proof (GoTrue's password grant accepts the written hash) is the
-- Phase-4 Playwright canary.

BEGIN;

SELECT plan(24);

\i /db/tests/fixtures/users_alice_bob_carol.sql

-- Known usernames so the tests read cleanly (the fixture's auto-generated
-- u<uuid> handles are unwieldy). resolve via lower(username), as the RPC does.
UPDATE public.profiles SET username = 'alice'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
UPDATE public.profiles SET username = 'bob'
WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- Alice has a verified recovery e-mail; Bob has none.
UPDATE public.user_settings SET recovery_email = 'alice@example.test'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- ===================================================================
-- (a) Positive: request_password_reset returns the on-file address and
--     creates a reset_password token.
-- ===================================================================
RESET ROLE;
DELETE FROM auth_private.recovery_tokens;
SET LOCAL ROLE cairn_auth_bff;
SELECT is(
  public.request_password_reset('alice', 'hash-correct'),
  'alice@example.test',
  'request_password_reset returns the on-file recovery e-mail'
);
RESET ROLE;
SELECT is(
  (
    SELECT count(*)::int FROM auth_private.recovery_tokens
    WHERE
      user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND purpose = 'reset_password'
  ),
  1,
  'request_password_reset creates a reset_password token'
);

-- ===================================================================
-- (b) request_password_reset returns NULL for an unknown username and for a
--     user with no recovery_email, and creates no token in either case.
-- ===================================================================
RESET ROLE;
DELETE FROM auth_private.recovery_tokens;
SET LOCAL ROLE cairn_auth_bff;
SELECT is(
  public.request_password_reset('nosuchuser', 'h'),
  NULL,
  'request_password_reset returns NULL for an unknown username'
);
SELECT is(
  public.request_password_reset('bob', 'h'),
  NULL,
  'request_password_reset returns NULL for a user with no recovery_email'
);
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM auth_private.recovery_tokens),
  0,
  'no token is created for an unknown username or a missing recovery_email'
);

-- ===================================================================
-- (c) Positive: reset_password with the matching hash returns 'ok', sets a
--     valid bcrypt password, and consumes the token.
-- ===================================================================
RESET ROLE;
DELETE FROM auth_private.recovery_tokens;
UPDATE auth.users SET encrypted_password = NULL
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET LOCAL ROLE cairn_auth_bff;
DO $$
BEGIN
  PERFORM public.request_password_reset('alice', 'hash-correct');
END$$;
SELECT is(
  public.reset_password('alice', 'hash-correct', 'newpassword123'),
  'ok',
  'reset_password returns ok for the matching hash'
);
RESET ROLE;
SELECT ok(
  (
    SELECT encrypted_password = crypt('newpassword123', encrypted_password)
    FROM auth.users
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'reset_password sets an encrypted_password that verifies the new password'
);
SELECT is(
  (
    SELECT count(*)::int FROM auth_private.recovery_tokens
    WHERE
      user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND consumed_at IS NOT NULL
  ),
  1,
  'reset_password consumes the token on success'
);

-- ===================================================================
-- (d) A wrong / expired / consumed code returns 'invalid' and does not change
--     the password.
-- ===================================================================
-- Wrong code.
RESET ROLE;
DELETE FROM auth_private.recovery_tokens;
UPDATE auth.users SET encrypted_password = 'unchanged'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET LOCAL ROLE cairn_auth_bff;
DO $$
BEGIN
  PERFORM public.request_password_reset('alice', 'hash-correct');
END$$;
SELECT is(
  public.reset_password('alice', 'hash-wrong', 'newpassword123'),
  'invalid',
  'reset_password returns invalid for a wrong code'
);
RESET ROLE;
SELECT is(
  (
    SELECT encrypted_password FROM auth.users
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'unchanged',
  'a wrong code does not change the password'
);

-- Expired token.
RESET ROLE;
DELETE FROM auth_private.recovery_tokens;
SET LOCAL ROLE cairn_auth_bff;
DO $$
BEGIN
  PERFORM public.request_password_reset('alice', 'hash-correct');
END$$;
RESET ROLE;
UPDATE auth_private.recovery_tokens
SET expires_at = now() - interval '1 minute'
WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET LOCAL ROLE cairn_auth_bff;
SELECT is(
  public.reset_password('alice', 'hash-correct', 'newpassword123'),
  'invalid',
  'reset_password returns invalid for an expired token (even with the right hash)'
);

-- Consumed token.
RESET ROLE;
DELETE FROM auth_private.recovery_tokens;
SET LOCAL ROLE cairn_auth_bff;
DO $$
BEGIN
  PERFORM public.request_password_reset('alice', 'hash-correct');
  PERFORM public.reset_password('alice', 'hash-correct', 'newpassword123');
END$$;
SELECT is(
  public.reset_password('alice', 'hash-correct', 'newpassword123'),
  'invalid',
  'a consumed token cannot be reused (returns invalid)'
);

-- ===================================================================
-- (e) A correct code with a too-short password raises 23514 and leaves the
--     token UNCONSUMED (the user can retry with a longer password).
-- ===================================================================
RESET ROLE;
DELETE FROM auth_private.recovery_tokens;
SET LOCAL ROLE cairn_auth_bff;
DO $$
BEGIN
  PERFORM public.request_password_reset('alice', 'hash-correct');
END$$;
SELECT throws_ok(
  $$SELECT public.reset_password('alice', 'hash-correct', 'short')$$,
  '23514',
  NULL,
  'a correct code with a too-short password raises 23514'
);
RESET ROLE;
SELECT is(
  (
    SELECT count(*)::int FROM auth_private.recovery_tokens
    WHERE
      user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND consumed_at IS NULL
  ),
  1,
  'a too-short password leaves the token unconsumed (the user can retry)'
);

-- ===================================================================
-- (f) Grant assertions: cairn_auth_bff may EXECUTE both reset RPCs; anon and
--     authenticated may not (the load-bearing R5/R7 boundary).
-- ===================================================================
RESET ROLE;
SELECT ok(
  has_function_privilege(
    'cairn_auth_bff', 'public.request_password_reset(text, text)', 'EXECUTE'
  ),
  'cairn_auth_bff has EXECUTE on request_password_reset'
);
SELECT ok(
  has_function_privilege(
    'cairn_auth_bff', 'public.reset_password(text, text, text)', 'EXECUTE'
  ),
  'cairn_auth_bff has EXECUTE on reset_password'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.request_password_reset(text, text)', 'EXECUTE'
  ),
  'anon has NO EXECUTE on request_password_reset'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.reset_password(text, text, text)', 'EXECUTE'
  ),
  'anon has NO EXECUTE on reset_password'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated', 'public.request_password_reset(text, text)', 'EXECUTE'
  ),
  'authenticated has NO EXECUTE on request_password_reset'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated', 'public.reset_password(text, text, text)', 'EXECUTE'
  ),
  'authenticated has NO EXECUTE on reset_password'
);

-- ===================================================================
-- (g) The submission-attempt cap PERSISTS across calls. Five wrong
--     reset_password calls accumulate `attempts` to 5; a 6th call with the
--     CORRECT code is locked out and never changes the password. This is the
--     property the return-not-raise contract exists to guarantee.
-- ===================================================================
RESET ROLE;
DELETE FROM auth_private.recovery_tokens;
UPDATE auth.users SET encrypted_password = 'unchanged'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET LOCAL ROLE cairn_auth_bff;
-- One request, then four wrong resets (the 5th wrong is the asserted one).
DO $$
BEGIN
  PERFORM public.request_password_reset('alice', 'hash-correct');
  PERFORM public.reset_password('alice', 'hash-wrong', 'newpassword123');
  PERFORM public.reset_password('alice', 'hash-wrong', 'newpassword123');
  PERFORM public.reset_password('alice', 'hash-wrong', 'newpassword123');
  PERFORM public.reset_password('alice', 'hash-wrong', 'newpassword123');
END$$;
SELECT is(
  public.reset_password('alice', 'hash-wrong', 'newpassword123'),
  'invalid',
  'the 5th wrong reset still returns invalid'
);
RESET ROLE;
SELECT is(
  (
    SELECT attempts FROM auth_private.recovery_tokens
    WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    ORDER BY created_at DESC LIMIT 1
  ),
  5,
  'five wrong resets accumulate attempts to 5 (the bumps persisted)'
);
SET LOCAL ROLE cairn_auth_bff;
SELECT is(
  public.reset_password('alice', 'hash-correct', 'newpassword123'),
  'locked',
  'a 6th reset with the CORRECT code is locked out by the attempt cap'
);
RESET ROLE;
SELECT is(
  (
    SELECT encrypted_password FROM auth.users
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'unchanged',
  'the locked-out token never changes the password'
);

SELECT finish();

ROLLBACK;
