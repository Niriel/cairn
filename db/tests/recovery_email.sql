-- recovery_email.sql — locks in `user_settings.recovery_email`: the
-- private, optional, owner-only home for the recovery e-mail address.
--
-- E-mail's only remaining job after the username reversal is recovering a
-- lost password. This column is its home. There is no new RLS policy and
-- no format CHECK here — the table's existing owner-only policies
-- (`user_settings_select`/`_update using (id = public.uid())`) make the
-- column structurally private, honouring the `docs/invites.md` "e-mail is
-- never shown" contract.
--
-- As of 0021 the column is **write-locked through PostgREST**: the
-- table-wide UPDATE grant is narrowed to `invite_policy`, so a signed-in
-- user cannot set `recovery_email` directly — it is written only by the
-- `confirm_recovery_email` RPC after the emailed code is confirmed
-- (verify-before-effect). The positive "owner has a verified recovery
-- e-mail" state is therefore proven through that RPC in recovery_verify.sql
-- (Task 1.2), not by a direct write here.
--
-- 3 assertions:
--   1. Defaults NULL on a freshly seeded settings row.
--   2. A direct UPDATE of `recovery_email` by the owner is now blocked at
--      the GRANT layer (SQLSTATE 42501) — the lockdown boundary.
--   3. A different authenticated user cannot read the owner's value
--      (the row is invisible under `user_settings_select`) — the
--      privacy negative case.

BEGIN;

SELECT plan(3);

\i /db/tests/fixtures/users_alice_bob_carol.sql

-- The fixture inserted Alice/Bob/Carol into auth.users; the
-- `tg_profile_on_signup` trigger created their user_settings rows.

-- 1. Default NULL: Alice's freshly seeded row carries no recovery e-mail.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT is(
  (
    SELECT recovery_email FROM public.user_settings
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  NULL,
  'recovery_email defaults NULL on a freshly seeded settings row'
);

-- 2. Direct-write lockdown: Alice cannot set recovery_email directly. The
-- narrowed column grant (0021) gives authenticated UPDATE only on
-- invite_policy, so this statement is denied at the GRANT layer (42501)
-- before RLS is consulted. The verified-address path is confirm_recovery_email.
SELECT throws_ok(
  $$UPDATE public.user_settings
    SET recovery_email = 'me@example.test'
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  '42501',
  NULL,
  'recovery_email direct write is blocked: only confirm_recovery_email '
  'may set it (verify-before-effect)'
);

-- 3. Privacy negative: Bob cannot read Alice's recovery e-mail — her row
-- is invisible to him under the owner-only `user_settings_select`, so the
-- SELECT returns no row at all.
RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT is(
  (
    SELECT count(*)::int FROM public.user_settings
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  0,
  'recovery_email privacy negative: Bob cannot see Alice''s settings row'
);

SELECT finish();

ROLLBACK;
