-- admin_ban.sql — locks in admin.ban_user / admin.unban_user: the
-- audited banhammer over auth.users.banned_until (docs/admin.md
-- § ban_user/unban_user).
--
-- These are the simplest write RPCs, so they pin the audit-and-guard
-- pattern every later admin RPC reuses: reject the tombstone, reject a
-- missing user, then write the audit row, then perform the action — so
-- a rejected target never writes an audit row. The audit row records
-- the operator's login role in `actor` and the definer owner in
-- `effective`, and snapshots the prior banned_until in `payload`.
--
-- 21 assertions:
--   ban_user happy path (as cairn_admin):
--     1. Bob's banned_until becomes 'infinity'.
--     2. Exactly one ban_user audit row targets Bob.
--     3. That row's effective = 'cairn_admin_owner' (definer owner).
--     4. That row's actor = session_user (the operator login role).
--     5. payload snapshots the prior banned_until (was NULL).
--   unban_user happy path:
--     6. Bob's banned_until is cleared to NULL.
--     7. Exactly one unban_user audit row targets Bob.
--     8. payload snapshots the prior banned_until ('infinity').
--   Guards / denials:
--     9. ban_user(tombstone) throws 'cannot ban the tombstone user'.
--    10. ban_user(missing uuid) throws 'no such user'.
--    11. …and writes no audit row for that target.
--    12. authenticated → 42501 at the GRANT layer (body never runs).
--    13. …and writes no audit row for that target.
--   Grant matrix (ban_user AND unban_user):
--    14-15. cairn_admin    HAS EXECUTE on both.
--    16-17. authenticated has NO EXECUTE on either.
--    18-19. anon          has NO EXECUTE on either.
--    20-21. cairn_readonly has NO EXECUTE on either (the read-only role
--           cannot escalate to a write RPC; its only EXECUTE grant is
--           inspect_user).

BEGIN;

SELECT plan(21);

\i /db/tests/fixtures/users_alice_bob_carol.sql

-- ── ban_user happy path ────────────────────────────────────────────
SET LOCAL ROLE cairn_admin;
SELECT admin.ban_user(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'harassment, ticket 4'
);
RESET ROLE;

SELECT is(
  (
    SELECT banned_until FROM auth.users
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  'infinity'::timestamptz,
  'ban_user sets Bob banned_until = infinity'
);
SELECT is(
  (
    SELECT count(*)::int FROM admin.actions
    WHERE
      action = 'ban_user'
      AND target = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  1,
  'ban_user writes exactly one audit row for Bob'
);
SELECT is(
  (
    SELECT effective FROM admin.actions
    WHERE
      action = 'ban_user'
      AND target = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  'cairn_admin_owner',
  'ban_user audit row records effective = cairn_admin_owner'
);
SELECT is(
  (
    SELECT actor FROM admin.actions
    WHERE
      action = 'ban_user'
      AND target = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  session_user::text,
  'ban_user audit row records actor = the operator login role'
);
SELECT ok(
  (
    SELECT payload ? 'banned_until' AND payload ->> 'banned_until' IS NULL
    FROM admin.actions
    WHERE
      action = 'ban_user'
      AND target = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  'ban_user payload snapshots the prior banned_until (was NULL)'
);

-- ── unban_user happy path ──────────────────────────────────────────
SET LOCAL ROLE cairn_admin;
SELECT admin.unban_user(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'appeal granted, ticket 5'
);
RESET ROLE;

SELECT is(
  (
    SELECT banned_until FROM auth.users
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  NULL::timestamptz,
  'unban_user clears Bob banned_until to NULL'
);
SELECT is(
  (
    SELECT count(*)::int FROM admin.actions
    WHERE
      action = 'unban_user'
      AND target = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  1,
  'unban_user writes exactly one audit row for Bob'
);
SELECT is(
  (
    SELECT payload ->> 'banned_until' FROM admin.actions
    WHERE
      action = 'unban_user'
      AND target = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  'infinity',
  'unban_user payload snapshots the prior banned_until (infinity)'
);

-- ── Guards / denials ───────────────────────────────────────────────
SET LOCAL ROLE cairn_admin;
SELECT throws_ok(
  $$SELECT admin.ban_user(
      '00000000-0000-0000-0000-000000000000', 'should be rejected'
    )$$,
  'P0001',
  'cannot ban the tombstone user',
  'ban_user rejects the tombstone target'
);
SELECT throws_ok(
  $$SELECT admin.ban_user(
      '99999999-9999-9999-9999-999999999999', 'should be rejected'
    )$$,
  'P0001',
  'no such user',
  'ban_user throws on a non-existent target'
);
RESET ROLE;
SELECT is(
  (
    SELECT count(*)::int FROM admin.actions
    WHERE target = '99999999-9999-9999-9999-999999999999'
  ),
  0,
  'ban_user writes no audit row for a rejected non-existent target'
);

-- GRANT-layer denial: authenticated never reaches the body.
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT admin.ban_user(
      'cccccccc-cccc-cccc-cccc-cccccccccccc', 'should be denied'
    )$$,
  '42501',
  NULL,
  'ban_user denies authenticated at the GRANT layer (42501)'
);
RESET ROLE;
SELECT is(
  (
    SELECT count(*)::int FROM admin.actions
    WHERE target = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  ),
  0,
  'a GRANT-denied ban_user writes no audit row'
);

-- ── Grant matrix: ban_user AND unban_user ──────────────────────────
SELECT ok(
  has_function_privilege(
    'cairn_admin', 'admin.ban_user(uuid, text)', 'EXECUTE'
  ),
  'cairn_admin HAS EXECUTE on ban_user'
);
SELECT ok(
  has_function_privilege(
    'cairn_admin', 'admin.unban_user(uuid, text)', 'EXECUTE'
  ),
  'cairn_admin HAS EXECUTE on unban_user'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated', 'admin.ban_user(uuid, text)', 'EXECUTE'
  ),
  'authenticated has NO EXECUTE on ban_user'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated', 'admin.unban_user(uuid, text)', 'EXECUTE'
  ),
  'authenticated has NO EXECUTE on unban_user'
);
SELECT ok(
  NOT has_function_privilege('anon', 'admin.ban_user(uuid, text)', 'EXECUTE'),
  'anon has NO EXECUTE on ban_user'
);
SELECT ok(
  NOT has_function_privilege('anon', 'admin.unban_user(uuid, text)', 'EXECUTE'),
  'anon has NO EXECUTE on unban_user'
);
SELECT ok(
  NOT has_function_privilege(
    'cairn_readonly', 'admin.ban_user(uuid, text)', 'EXECUTE'
  ),
  'cairn_readonly has NO EXECUTE on ban_user (no write escalation)'
);
SELECT ok(
  NOT has_function_privilege(
    'cairn_readonly', 'admin.unban_user(uuid, text)', 'EXECUTE'
  ),
  'cairn_readonly has NO EXECUTE on unban_user (no write escalation)'
);

SELECT finish();

ROLLBACK;
