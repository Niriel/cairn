-- grants.sql — locks in the entire GRANT matrix from
-- docs/data-model.md and REQUIREMENTS.md R15. RLS without a
-- matching GRANT silently returns empty via PostgREST (Risk #6),
-- so every omission needs a load-bearing negative assertion in
-- addition to the positive grants.
--
-- 60 assertions, four groups:
--
-- A. Positive matrix for `authenticated` (15) — every (table,
--    verb) explicitly granted.
-- B. View SELECT positives (3) and function EXECUTE positives
--    (3+7) for `authenticated`.
-- C. Load-bearing INSERT negatives (4) — `lists`, `list_members`,
--    `profiles`, `user_settings` all close direct-INSERT footguns
--    at the GRANT layer (orphan-list, consent-bypass, trigger-only).
-- D. Anon-coverage negatives (31) — every (table, verb) and every
--    function lock in the doc's "anonymous users have no access"
--    rule. Closes the smoke-script gap left when `/profiles` got
--    dropped from `scripts/smoke.sh` in A.3.
--
-- Each assertion uses Postgres's built-in `has_table_privilege` /
-- `has_function_privilege` (boolean-returning, 3-arg) wrapped in
-- pgTAP's `ok()`. pgTAP doesn't ship a 4-arg description wrapper
-- for these; the wrap is the canonical pattern.

BEGIN;

SELECT plan(72);

-- ===================================================================
-- A. Positive matrix for `authenticated`
-- ===================================================================

-- profiles: SELECT, UPDATE (no INSERT trigger-only; no DELETE)
SELECT ok(
  has_table_privilege('authenticated', 'public.profiles', 'SELECT'),
  'authenticated has SELECT on public.profiles'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
  'authenticated has UPDATE on public.profiles'
);

-- user_settings: SELECT, UPDATE
SELECT ok(
  has_table_privilege('authenticated', 'public.user_settings', 'SELECT'),
  'authenticated has SELECT on public.user_settings'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.user_settings', 'UPDATE'),
  'authenticated has UPDATE on public.user_settings'
);

-- lists: SELECT, UPDATE (no INSERT — RPC-only; no DELETE — soft-only)
SELECT ok(
  has_table_privilege('authenticated', 'public.lists', 'SELECT'),
  'authenticated has SELECT on public.lists'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.lists', 'UPDATE'),
  'authenticated has UPDATE on public.lists'
);

-- list_members: SELECT, UPDATE (no INSERT — RPC-only)
SELECT ok(
  has_table_privilege('authenticated', 'public.list_members', 'SELECT'),
  'authenticated has SELECT on public.list_members'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.list_members', 'UPDATE'),
  'authenticated has UPDATE on public.list_members'
);

-- items: SELECT, INSERT, UPDATE (no DELETE — soft-only)
SELECT ok(
  has_table_privilege('authenticated', 'public.items', 'SELECT'),
  'authenticated has SELECT on public.items'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.items', 'INSERT'),
  'authenticated has INSERT on public.items'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.items', 'UPDATE'),
  'authenticated has UPDATE on public.items'
);

-- votes: SELECT, INSERT, UPDATE, DELETE (hard-delete model)
SELECT ok(
  has_table_privilege('authenticated', 'public.votes', 'SELECT'),
  'authenticated has SELECT on public.votes'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.votes', 'INSERT'),
  'authenticated has INSERT on public.votes'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.votes', 'UPDATE'),
  'authenticated has UPDATE on public.votes'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.votes', 'DELETE'),
  'authenticated has DELETE on public.votes'
);

-- relationships: SELECT, INSERT, UPDATE, DELETE
SELECT ok(
  has_table_privilege('authenticated', 'public.relationships', 'SELECT'),
  'authenticated has SELECT on public.relationships'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.relationships', 'INSERT'),
  'authenticated has INSERT on public.relationships'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.relationships', 'UPDATE'),
  'authenticated has UPDATE on public.relationships'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.relationships', 'DELETE'),
  'authenticated has DELETE on public.relationships'
);

-- ===================================================================
-- B. Views (SELECT) + Functions (EXECUTE) positive for authenticated
-- ===================================================================

SELECT ok(
  has_table_privilege('authenticated', 'public.items_ranked', 'SELECT'),
  'authenticated has SELECT on view items_ranked'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.items_deleted', 'SELECT'),
  'authenticated has SELECT on view items_deleted'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.lists_deleted', 'SELECT'),
  'authenticated has SELECT on view lists_deleted'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.uid()', 'EXECUTE'),
  'authenticated has EXECUTE on public.uid()'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.is_list_member(uuid)', 'EXECUTE'
  ),
  'authenticated has EXECUTE on public.is_list_member(uuid)'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.is_items_list_member(uuid)', 'EXECUTE'
  ),
  'authenticated has EXECUTE on public.is_items_list_member(uuid)'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.create_list(text, text)', 'EXECUTE'
  ),
  'authenticated has EXECUTE on public.create_list(text, text)'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.bump_avatar_version()', 'EXECUTE'
  ),
  'authenticated has EXECUTE on public.bump_avatar_version()'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.clear_avatar()', 'EXECUTE'
  ),
  'authenticated has EXECUTE on public.clear_avatar()'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.set_display_name(text)', 'EXECUTE'
  ),
  'authenticated has EXECUTE on public.set_display_name(text)'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.add_circle_by_email(text)', 'EXECUTE'
  ),
  'authenticated has EXECUTE on public.add_circle_by_email(text)'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.add_circle_by_id(uuid)', 'EXECUTE'
  ),
  'authenticated has EXECUTE on public.add_circle_by_id(uuid)'
);

-- ===================================================================
-- C. Load-bearing INSERT negatives for `authenticated`
-- ===================================================================

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.lists', 'INSERT'),
  'authenticated has NO INSERT on public.lists (RPC-only via create_list)'
);
SELECT ok(
  NOT has_table_privilege(
    'authenticated', 'public.list_members', 'INSERT'
  ),
  'authenticated has NO INSERT on public.list_members '
  '(RPC-only via create_list / accept_invitation)'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.profiles', 'INSERT'),
  'authenticated has NO INSERT on public.profiles '
  '(trigger-only via tg_profile_on_signup)'
);
SELECT ok(
  NOT has_table_privilege(
    'authenticated', 'public.user_settings', 'INSERT'
  ),
  'authenticated has NO INSERT on public.user_settings (trigger-only)'
);

-- ===================================================================
-- D. Anon-coverage negatives
-- ===================================================================

-- profiles ×4
SELECT ok(
  NOT has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'anon has no SELECT on profiles'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.profiles', 'INSERT'),
  'anon has no INSERT on profiles'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.profiles', 'UPDATE'),
  'anon has no UPDATE on profiles'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.profiles', 'DELETE'),
  'anon has no DELETE on profiles'
);

-- user_settings ×4
SELECT ok(
  NOT has_table_privilege('anon', 'public.user_settings', 'SELECT'),
  'anon has no SELECT on user_settings'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.user_settings', 'INSERT'),
  'anon has no INSERT on user_settings'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.user_settings', 'UPDATE'),
  'anon has no UPDATE on user_settings'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.user_settings', 'DELETE'),
  'anon has no DELETE on user_settings'
);

-- lists ×4
SELECT ok(
  NOT has_table_privilege('anon', 'public.lists', 'SELECT'),
  'anon has no SELECT on lists'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.lists', 'INSERT'),
  'anon has no INSERT on lists'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.lists', 'UPDATE'),
  'anon has no UPDATE on lists'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.lists', 'DELETE'),
  'anon has no DELETE on lists'
);

-- list_members ×4
SELECT ok(
  NOT has_table_privilege('anon', 'public.list_members', 'SELECT'),
  'anon has no SELECT on list_members'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.list_members', 'INSERT'),
  'anon has no INSERT on list_members'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.list_members', 'UPDATE'),
  'anon has no UPDATE on list_members'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.list_members', 'DELETE'),
  'anon has no DELETE on list_members'
);

-- items ×4
SELECT ok(
  NOT has_table_privilege('anon', 'public.items', 'SELECT'),
  'anon has no SELECT on items'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.items', 'INSERT'),
  'anon has no INSERT on items'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.items', 'UPDATE'),
  'anon has no UPDATE on items'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.items', 'DELETE'),
  'anon has no DELETE on items'
);

-- votes ×4
SELECT ok(
  NOT has_table_privilege('anon', 'public.votes', 'SELECT'),
  'anon has no SELECT on votes'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.votes', 'INSERT'),
  'anon has no INSERT on votes'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.votes', 'UPDATE'),
  'anon has no UPDATE on votes'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.votes', 'DELETE'),
  'anon has no DELETE on votes'
);

-- relationships ×4
SELECT ok(
  NOT has_table_privilege('anon', 'public.relationships', 'SELECT'),
  'anon has no SELECT on relationships'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.relationships', 'INSERT'),
  'anon has no INSERT on relationships'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.relationships', 'UPDATE'),
  'anon has no UPDATE on relationships'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.relationships', 'DELETE'),
  'anon has no DELETE on relationships'
);

-- Function EXECUTE negatives for anon.
SELECT ok(
  NOT has_function_privilege('anon', 'public.uid()', 'EXECUTE'),
  'anon has no EXECUTE on public.uid()'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.is_list_member(uuid)', 'EXECUTE'
  ),
  'anon has no EXECUTE on public.is_list_member(uuid)'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.is_items_list_member(uuid)', 'EXECUTE'
  ),
  'anon has no EXECUTE on public.is_items_list_member(uuid)'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.create_list(text, text)', 'EXECUTE'
  ),
  'anon has no EXECUTE on public.create_list(text, text) '
  '(load-bearing: closes the RPC GRANT layer)'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.bump_avatar_version()', 'EXECUTE'
  ),
  'anon has no EXECUTE on public.bump_avatar_version()'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.clear_avatar()', 'EXECUTE'
  ),
  'anon has no EXECUTE on public.clear_avatar()'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.set_display_name(text)', 'EXECUTE'
  ),
  'anon has no EXECUTE on public.set_display_name(text)'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.add_circle_by_email(text)', 'EXECUTE'
  ),
  'anon has no EXECUTE on public.add_circle_by_email(text)'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.add_circle_by_id(uuid)', 'EXECUTE'
  ),
  'anon has no EXECUTE on public.add_circle_by_id(uuid)'
);

SELECT finish();

ROLLBACK;
