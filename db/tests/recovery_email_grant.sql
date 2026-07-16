-- recovery_email_grant.sql — locks in the column-level UPDATE lockdown on
-- `user_settings` that makes verify-before-effect real.
--
-- Verification of a recovery e-mail is only a real boundary if a signed-in
-- user cannot `PATCH /user_settings` to set `recovery_email` directly,
-- bypassing the send-then-confirm flow. The table-wide
-- `GRANT SELECT, UPDATE ON user_settings TO authenticated` permitted exactly
-- that, so 0021 narrows the UPDATE grant to the freely-editable column
-- (`invite_policy`) only. `recovery_email` is then writable solely by the
-- `confirm_recovery_email` RPC (Task 1.2, SECURITY DEFINER, runs as owner).
-- The owner can still SELECT their own `recovery_email` for display.
--
-- 3 assertions:
--   1. Positive — Alice can UPDATE `invite_policy` on her own row (the
--      column grant survived; the owner-only UPDATE policy still allows it).
--   2. Negative — Alice's UPDATE of `recovery_email` on her own row is
--      rejected at the GRANT layer (no column privilege, SQLSTATE 42501) —
--      the load-bearing lockdown.
--   3. Positive — Alice can still SELECT her own `recovery_email`.

BEGIN;

SELECT plan(3);

\i /db/tests/fixtures/users_alice_bob_carol.sql

-- The fixture inserted Alice into auth.users; the tg_profile_on_signup
-- trigger created her user_settings row.

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

-- 1. Positive: the freely-editable column is still writable by its owner.
UPDATE public.user_settings
SET invite_policy = 'nobody'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (
    SELECT invite_policy FROM public.user_settings
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'nobody',
  'recovery-email lockdown positive: Alice can still UPDATE invite_policy'
);

-- 2. Negative: a direct write to recovery_email is denied at the GRANT
-- layer — authenticated holds no column-level UPDATE on it, so the
-- statement raises 42501 before RLS is even consulted.
SELECT throws_ok(
  $$UPDATE public.user_settings
    SET recovery_email = 'me@example.test'
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  '42501',
  NULL,
  'recovery-email lockdown negative: direct UPDATE of recovery_email '
  'raises 42501 (only confirm_recovery_email may write it)'
);

-- 3. Positive: the owner can still read their own recovery_email (SELECT
-- is untouched; owner-only RLS still scopes the rows).
SELECT is(
  (
    SELECT recovery_email FROM public.user_settings
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  NULL,
  'recovery-email lockdown: Alice can still SELECT her own recovery_email'
);

SELECT finish();

ROLLBACK;
