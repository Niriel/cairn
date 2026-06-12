-- admin_actions_audit.sql — locks in the shape and read-model of the
-- `admin.actions` audit table introduced by 0017_admin.sql.
--
-- The table is the single audit trail for every destructive admin RPC.
-- Three properties are load-bearing and tested here:
--   * The required-reason CHECK (1..2000 chars) rejects an empty or
--     over-long reason — the database-layer wall behind the CLI's
--     --reason refusal.
--   * The table is owned by cairn_admin_owner, so the SECURITY DEFINER
--     RPCs (which run as that owner) can INSERT into it.
--   * cairn_readonly can actually SEE rows. RLS is deliberately NOT
--     enabled: an empty-policy default-deny would return zero rows to
--     cairn_readonly and break `cairn-admin log` in production, where
--     the operator is a non-superuser role. Append-only is enforced by
--     withholding UPDATE/DELETE, not by RLS.
--
-- 7 assertions:
--   1. reason = '' (length 0)        → 23514 check_violation.
--   2. reason of length 2001         → 23514 check_violation.
--   3. reason of length 1            → accepted (lives_ok).
--   4. reason of length 2000         → accepted (lives_ok).
--   5. admin.actions is owned by cairn_admin_owner.
--   6. cairn_readonly SELECT sees >= 1 row (fails if RLS is enabled).
--   7. cairn_readonly has NO UPDATE/DELETE on admin.actions.

BEGIN;

SELECT plan(7);

-- 1. Empty reason violates the length CHECK.
SELECT throws_ok(
  $$INSERT INTO admin.actions (actor, effective, action, reason)
    VALUES ('op', 'cairn_admin_owner', 'ban_user', '')$$,
  '23514',
  NULL,
  'admin.actions: empty reason rejected by CHECK (23514)'
);

-- 2. Over-long reason (2001 chars) violates the same CHECK.
SELECT throws_ok(
  format(
    $$INSERT INTO admin.actions (actor, effective, action, reason)
      VALUES ('op', 'cairn_admin_owner', 'ban_user', %L)$$,
    repeat('a', 2001)
  ),
  '23514',
  NULL,
  'admin.actions: 2001-char reason rejected by CHECK (23514)'
);

-- 3. A 1-char reason is at the lower bound and accepted.
SELECT lives_ok(
  $$INSERT INTO admin.actions (actor, effective, action, reason)
    VALUES ('op', 'cairn_admin_owner', 'ban_user', 'x')$$,
  'admin.actions: 1-char reason accepted'
);

-- 4. A 2000-char reason is at the upper bound and accepted.
SELECT lives_ok(
  format(
    $$INSERT INTO admin.actions (actor, effective, action, reason)
      VALUES ('op', 'cairn_admin_owner', 'ban_user', %L)$$,
    repeat('a', 2000)
  ),
  'admin.actions: 2000-char reason accepted'
);

-- 5. Owned by cairn_admin_owner so the SECURITY DEFINER RPCs can INSERT.
SELECT is(
  (
    SELECT pg_get_userbyid(relowner) FROM pg_class
    WHERE oid = 'admin.actions'::regclass
  ),
  'cairn_admin_owner',
  'admin.actions is owned by cairn_admin_owner'
);

-- 6. Read-visibility for cairn_readonly. Steps 3–4 already inserted
-- rows in this transaction; switching into the readonly role must still
-- see them. If RLS were ever enabled with no policy, this count would
-- be zero and the assertion would fail — exactly the regression guard.
SET LOCAL ROLE cairn_readonly;
SELECT ok(
  (SELECT count(*) FROM admin.actions) >= 1,
  'cairn_readonly can SELECT rows from admin.actions (RLS not enabled)'
);
RESET ROLE;

-- 7. …but cannot mutate them: append-only by withheld grants.
SELECT ok(
  NOT has_table_privilege('cairn_readonly', 'admin.actions', 'UPDATE')
  AND NOT has_table_privilege('cairn_readonly', 'admin.actions', 'DELETE'),
  'cairn_readonly has NO UPDATE/DELETE on admin.actions (append-only)'
);

SELECT finish();

ROLLBACK;
