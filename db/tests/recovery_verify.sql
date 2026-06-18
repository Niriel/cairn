-- recovery_verify.sql — the authenticated verify flow that proves ownership
-- of a recovery e-mail before it takes effect: request_recovery_email_verification
-- (send a code) and confirm_recovery_email (activate on the right code).
--
-- The load-bearing design point under test is the return-not-raise contract on
-- confirm_recovery_email. PostgREST runs each RPC in its own transaction and
-- rolls back on a raised error, so a wrong-code path that RAISEd would roll back
-- its own `attempts` bump — the submission-attempt cap would never persist and
-- the brute-force defence against a 10^6 code space would be a no-op. So
-- confirm_recovery_email RETURNS text ('ok' | 'invalid' | 'locked') and *commits*
-- every outcome that must persist a side effect; assertion (i) proves the
-- `attempts` counter actually accumulates across calls (a raising design leaves
-- it at 0). Only errors with nothing to persist (unauthenticated / tombstone)
-- still raise.
--
-- The token record lives in the non-PostgREST-exposed `auth_private` schema, so
-- tests reach it as the cairn superuser (RESET ROLE) to set up expiry / read the
-- counter, and act through the RPCs as `authenticated`. Side-effecting setup
-- calls go through `PERFORM` in a DO block so their result rows don't pollute
-- the TAP stream (the repo idiom for RPC setup). Each section first clears
-- `auth_private.recovery_tokens` so the per-account / per-address send caps
-- don't bleed across sections that share a transaction.
--
-- Send caps: per-address 3, per-account 5, within a 1-hour window. A refused
-- send raises the custom SQLSTATE CA429 (the BFF maps it to HTTP 429) — raising
-- is correct there because nothing is persisted on a rejected send.

BEGIN;

SELECT plan(27);

\i /db/tests/fixtures/users_alice_bob_carol.sql

-- The fixture inserted Alice/Bob/Carol into auth.users; tg_profile_on_signup
-- created their user_settings rows.

-- ===================================================================
-- (a) Positive: request + confirm with the matching hash activates the
--     address and consumes the token.
-- ===================================================================
RESET ROLE;
DELETE FROM auth_private.recovery_tokens;
SELECT set_config(
  'request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', TRUE
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.request_recovery_email_verification(
      'alice@example.test', 'hash-correct'
    )$$,
  'request_recovery_email_verification accepts a first send'
);
SELECT is(
  public.confirm_recovery_email('hash-correct'),
  'ok',
  'confirm_recovery_email returns ok for the matching hash'
);
SELECT is(
  (
    SELECT recovery_email FROM public.user_settings
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'alice@example.test',
  'confirm activates the verified address in user_settings.recovery_email'
);
RESET ROLE;
SELECT is(
  (
    SELECT count(*)::int FROM auth_private.recovery_tokens
    WHERE
      user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND consumed_at IS NOT NULL
  ),
  1,
  'confirm consumes the token on success'
);

-- ===================================================================
-- (b) Wrong code returns 'invalid', does NOT set recovery_email, and the
--     `attempts` bump PERSISTS (the return-not-raise property).
-- ===================================================================
RESET ROLE;
DELETE FROM auth_private.recovery_tokens;
UPDATE public.user_settings SET recovery_email = NULL
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT set_config(
  'request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', TRUE
);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM public.request_recovery_email_verification(
    'alice@example.test', 'hash-correct'
  );
END$$;

SELECT is(
  public.confirm_recovery_email('hash-wrong'),
  'invalid',
  'confirm returns invalid for a wrong hash'
);
SELECT is(
  (
    SELECT recovery_email FROM public.user_settings
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  NULL,
  'a wrong hash does not set recovery_email'
);
RESET ROLE;
SELECT is(
  (
    SELECT attempts FROM auth_private.recovery_tokens
    WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    ORDER BY created_at DESC LIMIT 1
  ),
  1,
  'a wrong hash bumps attempts and the bump persists (commit, not rollback)'
);

-- ===================================================================
-- (c) An expired token returns 'invalid' and does not set recovery_email.
-- ===================================================================
RESET ROLE;
DELETE FROM auth_private.recovery_tokens;
SELECT set_config(
  'request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', TRUE
);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM public.request_recovery_email_verification(
    'alice@example.test', 'hash-correct'
  );
END$$;
-- Push the token's expiry into the past (now() is the transaction start).
RESET ROLE;
UPDATE auth_private.recovery_tokens
SET expires_at = now() - interval '1 minute'
WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT set_config(
  'request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', TRUE
);
SET LOCAL ROLE authenticated;
SELECT is(
  public.confirm_recovery_email('hash-correct'),
  'invalid',
  'confirm returns invalid for an expired token (even with the right hash)'
);

-- ===================================================================
-- (d) A consumed token cannot be reused.
-- ===================================================================
RESET ROLE;
DELETE FROM auth_private.recovery_tokens;
UPDATE public.user_settings SET recovery_email = NULL
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT set_config(
  'request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', TRUE
);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM public.request_recovery_email_verification(
    'alice@example.test', 'hash-correct'
  );
  PERFORM public.confirm_recovery_email('hash-correct');  -- consumes it
END$$;
SELECT is(
  public.confirm_recovery_email('hash-correct'),
  'invalid',
  'a consumed token cannot be reused (returns invalid)'
);

-- ===================================================================
-- (e) One caller cannot confirm another caller's pending token.
-- ===================================================================
RESET ROLE;
DELETE FROM auth_private.recovery_tokens;
-- Alice requests a verification.
SELECT set_config(
  'request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', TRUE
);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM public.request_recovery_email_verification(
    'alice@example.test', 'hash-correct'
  );
END$$;
-- Bob tries to confirm it.
RESET ROLE;
SELECT set_config(
  'request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}', TRUE
);
SET LOCAL ROLE authenticated;
SELECT is(
  public.confirm_recovery_email('hash-correct'),
  'invalid',
  'a caller cannot confirm another caller''s pending token'
);

-- ===================================================================
-- (f) Grant assertions: the scoped role exists; authenticated may EXECUTE
--     both verify RPCs; anon may not.
-- ===================================================================
RESET ROLE;
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'cairn_auth_bff'
  ),
  'the scoped role cairn_auth_bff exists'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.request_recovery_email_verification(text, text)',
    'EXECUTE'
  ),
  'authenticated has EXECUTE on request_recovery_email_verification'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.confirm_recovery_email(text)', 'EXECUTE'
  ),
  'authenticated has EXECUTE on confirm_recovery_email'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.request_recovery_email_verification(text, text)',
    'EXECUTE'
  ),
  'anon has NO EXECUTE on request_recovery_email_verification'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.confirm_recovery_email(text)', 'EXECUTE'
  ),
  'anon has NO EXECUTE on confirm_recovery_email'
);

-- ===================================================================
-- (g) auth_private is unreachable by the API roles, and recovery_tokens is
--     deny-all RLS as belt-and-suspenders.
-- ===================================================================
SELECT ok(
  NOT has_schema_privilege('authenticated', 'auth_private', 'USAGE'),
  'authenticated has NO USAGE on schema auth_private'
);
SELECT ok(
  NOT has_schema_privilege('anon', 'auth_private', 'USAGE'),
  'anon has NO USAGE on schema auth_private'
);
SELECT ok(
  (
    SELECT relrowsecurity FROM pg_class
    WHERE oid = 'auth_private.recovery_tokens'::regclass
  ),
  'row-level security is enabled on auth_private.recovery_tokens'
);
SELECT is(
  (
    SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'auth_private' AND tablename = 'recovery_tokens'
  ),
  0,
  'recovery_tokens has no policy (deny-all) — belt-and-suspenders'
);

-- ===================================================================
-- (h) Send caps. Per-address cap is 3; per-account cap is 5.
-- ===================================================================
-- Per-address: a 4th send to the SAME address is refused.
RESET ROLE;
DELETE FROM auth_private.recovery_tokens;
SELECT set_config(
  'request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', TRUE
);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM public.request_recovery_email_verification('same@example.test', 'h');
  PERFORM public.request_recovery_email_verification('same@example.test', 'h');
END$$;
SELECT lives_ok(
  $$SELECT public.request_recovery_email_verification('same@example.test', 'h')$$,
  'the 3rd send to one address is allowed (per-address cap is 3)'
);
SELECT throws_ok(
  $$SELECT public.request_recovery_email_verification('same@example.test', 'h')$$,
  'CA429',
  NULL,
  'the 4th send to one address is refused (per-address cap)'
);

-- Per-account: a 6th send across DISTINCT addresses is refused even though no
-- single address exceeds the per-address cap.
RESET ROLE;
DELETE FROM auth_private.recovery_tokens;
SELECT set_config(
  'request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', TRUE
);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM public.request_recovery_email_verification('d1@example.test', 'h');
  PERFORM public.request_recovery_email_verification('d2@example.test', 'h');
  PERFORM public.request_recovery_email_verification('d3@example.test', 'h');
  PERFORM public.request_recovery_email_verification('d4@example.test', 'h');
END$$;
SELECT lives_ok(
  $$SELECT public.request_recovery_email_verification('d5@example.test', 'h')$$,
  'the 5th send across distinct addresses is allowed (per-account cap is 5)'
);
SELECT throws_ok(
  $$SELECT public.request_recovery_email_verification('d6@example.test', 'h')$$,
  'CA429',
  NULL,
  'the 6th send is refused by the per-account cap (anti mail-bombing)'
);

-- ===================================================================
-- (i) The submission-attempt cap PERSISTS across calls. Five wrong confirms
--     accumulate `attempts` to 5; a 6th call with the CORRECT hash is locked
--     out and never sets recovery_email. This is the property the
--     return-not-raise contract exists to guarantee.
-- ===================================================================
RESET ROLE;
DELETE FROM auth_private.recovery_tokens;
UPDATE public.user_settings SET recovery_email = NULL
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT set_config(
  'request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', TRUE
);
SET LOCAL ROLE authenticated;
-- One send, then four wrong confirms (the 5th wrong is the asserted one).
DO $$
BEGIN
  PERFORM public.request_recovery_email_verification(
    'alice@example.test', 'hash-correct'
  );
  PERFORM public.confirm_recovery_email('hash-wrong');
  PERFORM public.confirm_recovery_email('hash-wrong');
  PERFORM public.confirm_recovery_email('hash-wrong');
  PERFORM public.confirm_recovery_email('hash-wrong');
END$$;
SELECT is(
  public.confirm_recovery_email('hash-wrong'),
  'invalid',
  'the 5th wrong confirm still returns invalid'
);
RESET ROLE;
SELECT is(
  (
    SELECT attempts FROM auth_private.recovery_tokens
    WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    ORDER BY created_at DESC LIMIT 1
  ),
  5,
  'five wrong confirms accumulate attempts to 5 (the bumps persisted)'
);
SELECT set_config(
  'request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', TRUE
);
SET LOCAL ROLE authenticated;
SELECT is(
  public.confirm_recovery_email('hash-correct'),
  'locked',
  'a 6th confirm with the CORRECT hash is locked out by the attempt cap'
);
SELECT is(
  (
    SELECT recovery_email FROM public.user_settings
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  NULL,
  'the locked-out token never sets recovery_email'
);

SELECT finish();

ROLLBACK;
