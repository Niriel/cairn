-- grants.sql — locks in the entire GRANT matrix from
-- docs/data-model.md and REQUIREMENTS.md R15. RLS without a
-- matching GRANT silently returns empty via PostgREST (Risk #6),
-- so every omission needs a load-bearing negative assertion in
-- addition to the positive grants.
--
-- 91 assertions, four groups:
--
-- A. Positive table/verb matrix for `authenticated` (21) — every
--    granted (table, verb). user_settings UPDATE is column-level
--    (invite_policy yes, recovery_email no — the recovery lockdown).
-- B. Other `authenticated` positives (18) — view SELECTs, function
--    EXECUTEs (including the new public_list_view RPC), and the
--    invitations table + invite RPCs.
-- C. Load-bearing INSERT negatives (4) — `lists`, `list_members`,
--    `profiles`, `user_settings` all close direct-INSERT footguns
--    at the GRANT layer (orphan-list, consent-bypass, trigger-only).
-- D. Anon coverage (48) — the *one* thing `anon` may touch is
--    EXECUTE on public_list_view (the sole public read path); every
--    other (table/view, verb) and every other function is locked,
--    per the doc's "anonymous users touch nothing else" rule.
--    Includes the items_ranked / items_deleted / lists_deleted view
--    no-SELECT negatives, and closes the smoke-script gap left when
--    `/profiles` got dropped from `scripts/smoke.sh` in A.3.
--
-- Each assertion uses Postgres's built-in `has_table_privilege` /
-- `has_function_privilege` (boolean-returning, 3-arg) wrapped in
-- pgTAP's `ok()`. pgTAP doesn't ship a 4-arg description wrapper
-- for these; the wrap is the canonical pattern.

BEGIN;

SELECT plan(91);

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

-- user_settings: SELECT (table-wide) + UPDATE narrowed to the
-- freely-editable column only. 0021 revoked the table-wide UPDATE so a
-- signed-in user cannot PATCH `recovery_email` directly, bypassing the
-- verify-before-effect flow — `recovery_email` is writable only by the
-- confirm_recovery_email RPC (SECURITY DEFINER, runs as owner).
-- `has_table_privilege(...,'UPDATE')` ignores column grants, so it now
-- reports false; the column-level reality is asserted with
-- `has_column_privilege`.
SELECT ok(
  has_table_privilege('authenticated', 'public.user_settings', 'SELECT'),
  'authenticated has SELECT on public.user_settings'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.user_settings', 'UPDATE'),
  'authenticated has NO table-wide UPDATE on public.user_settings '
  '(narrowed to a column grant so recovery_email is not directly writable)'
);
SELECT ok(
  has_column_privilege(
    'authenticated', 'public.user_settings', 'invite_policy', 'UPDATE'
  ),
  'authenticated has column-level UPDATE on user_settings.invite_policy'
);
SELECT ok(
  NOT has_column_privilege(
    'authenticated', 'public.user_settings', 'recovery_email', 'UPDATE'
  ),
  'authenticated has NO column-level UPDATE on user_settings.recovery_email '
  '(load-bearing: the verify-before-effect lockdown)'
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
    'authenticated', 'public.add_circle_by_username(text)', 'EXECUTE'
  ),
  'authenticated has EXECUTE on public.add_circle_by_username(text)'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.add_circle_by_id(uuid)', 'EXECUTE'
  ),
  'authenticated has EXECUTE on public.add_circle_by_id(uuid)'
);

-- invitations table + the three invite RPCs (added by 0009).
SELECT ok(
  has_table_privilege('authenticated', 'public.invitations', 'SELECT'),
  'authenticated has SELECT on public.invitations'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.invitations', 'DELETE'),
  'authenticated has DELETE on public.invitations'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.send_invitation(uuid, text, uuid)',
    'EXECUTE'
  ),
  'authenticated has EXECUTE on public.send_invitation(uuid, text, uuid)'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.accept_invitation(uuid)', 'EXECUTE'
  ),
  'authenticated has EXECUTE on public.accept_invitation(uuid)'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.decline_invitation(uuid)', 'EXECUTE'
  ),
  'authenticated has EXECUTE on public.decline_invitation(uuid)'
);

-- public_list_view is granted to authenticated too (a signed-in user
-- can read the same public snapshot; added by 0015).
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.public_list_view(uuid)', 'EXECUTE'
  ),
  'authenticated has EXECUTE on public.public_list_view(uuid)'
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
-- D. Anon coverage: one positive (the sole public RPC) + negatives
-- ===================================================================

-- The *only* thing anon may touch: EXECUTE on public_list_view
-- (added by 0015). Everything below this is a negative.
SELECT ok(
  has_function_privilege(
    'anon', 'public.public_list_view(uuid)', 'EXECUTE'
  ),
  'anon HAS EXECUTE on public.public_list_view(uuid) '
  '(the sole anonymous read path)'
);

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

-- views ×3 — anon reads nothing through the views either. items_ranked
-- is security_invoker (would yield zero rows for anon anyway), and the
-- two _deleted views run as owner, so a stray SELECT grant would be an
-- outright leak. The public read path is the RPC alone, never a view.
SELECT ok(
  NOT has_table_privilege('anon', 'public.items_ranked', 'SELECT'),
  'anon has no SELECT on view items_ranked'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.items_deleted', 'SELECT'),
  'anon has no SELECT on view items_deleted'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.lists_deleted', 'SELECT'),
  'anon has no SELECT on view lists_deleted'
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
    'anon', 'public.add_circle_by_username(text)', 'EXECUTE'
  ),
  'anon has no EXECUTE on public.add_circle_by_username(text)'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.add_circle_by_id(uuid)', 'EXECUTE'
  ),
  'anon has no EXECUTE on public.add_circle_by_id(uuid)'
);

-- invitations ×4 + 3 RPC EXECUTE negatives for anon.
SELECT ok(
  NOT has_table_privilege('anon', 'public.invitations', 'SELECT'),
  'anon has no SELECT on invitations'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.invitations', 'INSERT'),
  'anon has no INSERT on invitations'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.invitations', 'UPDATE'),
  'anon has no UPDATE on invitations'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.invitations', 'DELETE'),
  'anon has no DELETE on invitations'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.send_invitation(uuid, text, uuid)', 'EXECUTE'
  ),
  'anon has no EXECUTE on public.send_invitation(uuid, text, uuid)'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.accept_invitation(uuid)', 'EXECUTE'
  ),
  'anon has no EXECUTE on public.accept_invitation(uuid)'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.decline_invitation(uuid)', 'EXECUTE'
  ),
  'anon has no EXECUTE on public.decline_invitation(uuid)'
);

SELECT finish();

ROLLBACK;
