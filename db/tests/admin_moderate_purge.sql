-- admin_moderate_purge.sql — locks in the four takedown levers
-- (docs/admin.md § moderate/purge): moderate_item, purge_item,
-- moderate_list, purge_list.
--
-- moderate_* is the soft, recoverable lever: it soft-deletes the row
-- attributed to the tombstone user, so it leaves the live list but
-- stays visible to members through the items_deleted / lists_deleted
-- trash views. The attribution is the load-bearing subtlety: the
-- BEFORE UPDATE attribution trigger derives deleted_by from public.uid()
-- on the live→deleted transition, and an admin RPC carries no JWT — so
-- the body sets request.jwt.claims to the tombstone sub *before* the
-- UPDATE and lets the trigger stamp deleted_by, rather than setting
-- deleted_by directly (which the trigger would overwrite with NULL).
--
-- purge_* is the hard, irrecoverable lever: a plain DELETE that cascades
-- through votes / items / list_members / invitations.
--
-- Every one of the four snapshots the pre-state into the audit payload
-- and inserts the audit row before mutating, so an empty reason aborts
-- the whole action at the admin.actions CHECK.
--
-- 25 assertions:
--   moderate_item (item on the shared list):
--     1. deleted_at becomes non-null.
--     2. deleted_by is the tombstone (trigger-stamped via the claim).
--     3. a member (Alice) still sees it through items_deleted.
--     4. the audit payload snapshots the pre-state row.
--   purge_item:
--     5. the row is hard-deleted.
--     6. its votes cascade away.
--   moderate_list:
--     7. deleted_at becomes non-null.
--     8. deleted_by is the tombstone.
--     9. a member sees it through lists_deleted.
--   purge_list:
--    10. the list is hard-deleted.
--    11. its items cascade away.
--    12. its votes cascade away.
--    13. its list_members cascade away.
--   Guards:
--    14. moderate_item on a missing id throws 'no such item'.
--    15. moderate_list on a missing id throws 'no such list'.
--    16. an empty reason throws 23514…
--    17. …and leaves the target unchanged.
--   Grant matrix (one positive + one all-roles negative per function):
--    18-25. cairn_admin HAS EXECUTE; authenticated/anon/cairn_readonly
--           have NO EXECUTE, for each of the four functions.

BEGIN;

SELECT plan(25);

-- Shared list 11111111 (Alice + Bob), claim left = Alice.
\i /db/tests/fixtures/list_shared_alice_bob.sql

-- Seed items + votes (the fixture seeds no items). Claim is Alice, so
-- the attribution trigger stamps created_by = Alice.
INSERT INTO public.items (id, list_id, name)
VALUES (
  'a0000001-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111', 'Item to moderate'
);
INSERT INTO public.votes (item_id, user_id, value)
VALUES (
  'a0000001-0000-0000-0000-000000000000',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1
);
INSERT INTO public.items (id, list_id, name)
VALUES (
  'a0000002-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111', 'Item to purge'
);
INSERT INTO public.votes (item_id, user_id, value)
VALUES (
  'a0000002-0000-0000-0000-000000000000',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2
);
INSERT INTO public.items (id, list_id, name)
VALUES (
  'a0000003-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111', 'Item for empty-reason test'
);

-- A list to moderate (Alice member).
INSERT INTO public.lists (id, name)
VALUES ('d0000001-0000-0000-0000-000000000000', 'List to moderate');
INSERT INTO public.list_members (list_id, user_id)
VALUES (
  'd0000001-0000-0000-0000-000000000000',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);

-- A list to purge, with a member, an item, and a vote to cascade.
INSERT INTO public.lists (id, name)
VALUES ('d0000002-0000-0000-0000-000000000000', 'List to purge');
INSERT INTO public.list_members (list_id, user_id)
VALUES (
  'd0000002-0000-0000-0000-000000000000',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
INSERT INTO public.items (id, list_id, name)
VALUES (
  'd0000003-0000-0000-0000-000000000000',
  'd0000002-0000-0000-0000-000000000000', 'Item on purged list'
);
INSERT INTO public.votes (item_id, user_id, value)
VALUES (
  'd0000003-0000-0000-0000-000000000000',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 3
);

-- ── Mutations, all as cairn_admin ──────────────────────────────────
SET LOCAL ROLE cairn_admin;
SELECT admin.moderate_item(
  'a0000001-0000-0000-0000-000000000000', 'complaint, pending review'
);
SELECT admin.purge_item(
  'a0000002-0000-0000-0000-000000000000', 'DMCA takedown 2026-12'
);
SELECT admin.moderate_list(
  'd0000001-0000-0000-0000-000000000000', 'complaint, pending review'
);
SELECT admin.purge_list(
  'd0000002-0000-0000-0000-000000000000', 'DMCA takedown 2026-13'
);

-- Guards (throws_ok rolls back each failed sub-statement).
SELECT throws_ok(
  $$SELECT admin.moderate_item(
      '99999999-9999-9999-9999-999999999999', 'nothing here'
    )$$,
  'P0001', 'no such item', 'moderate_item throws on a missing item'
);
SELECT throws_ok(
  $$SELECT admin.moderate_list(
      '88888888-8888-8888-8888-888888888888', 'nothing here'
    )$$,
  'P0001', 'no such list', 'moderate_list throws on a missing list'
);
SELECT throws_ok(
  $$SELECT admin.moderate_item(
      'a0000003-0000-0000-0000-000000000000', ''
    )$$,
  '23514', NULL,
  'moderate_item with an empty reason violates the admin.actions CHECK'
);
RESET ROLE;

-- ── moderate_item assertions ───────────────────────────────────────
SELECT isnt(
  (
    SELECT deleted_at FROM public.items
    WHERE id = 'a0000001-0000-0000-0000-000000000000'
  ),
  NULL, 'moderate_item soft-deletes the item (deleted_at set)'
);
SELECT is(
  (
    SELECT deleted_by FROM public.items
    WHERE id = 'a0000001-0000-0000-0000-000000000000'
  ),
  '00000000-0000-0000-0000-000000000000'::uuid,
  'moderate_item attributes the soft-delete to the tombstone'
);
SELECT is(
  (
    SELECT payload ->> 'id' FROM admin.actions
    WHERE
      action = 'moderate_item'
      AND target = 'a0000001-0000-0000-0000-000000000000'
  ),
  'a0000001-0000-0000-0000-000000000000',
  'moderate_item snapshots the pre-state row in the audit payload'
);

-- A member still sees the moderated item through the trash view.
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', TRUE
);
SELECT is(
  (
    SELECT count(*)::int FROM public.items_deleted
    WHERE id = 'a0000001-0000-0000-0000-000000000000'
  ),
  1, 'a member sees the moderated item through items_deleted'
);
RESET ROLE;

-- ── purge_item assertions ──────────────────────────────────────────
SELECT is(
  (
    SELECT count(*)::int FROM public.items
    WHERE id = 'a0000002-0000-0000-0000-000000000000'
  ),
  0, 'purge_item hard-deletes the item'
);
SELECT is(
  (
    SELECT count(*)::int FROM public.votes
    WHERE item_id = 'a0000002-0000-0000-0000-000000000000'
  ),
  0, 'purge_item cascades its votes away'
);

-- ── moderate_list assertions ───────────────────────────────────────
SELECT isnt(
  (
    SELECT deleted_at FROM public.lists
    WHERE id = 'd0000001-0000-0000-0000-000000000000'
  ),
  NULL, 'moderate_list soft-deletes the list (deleted_at set)'
);
SELECT is(
  (
    SELECT deleted_by FROM public.lists
    WHERE id = 'd0000001-0000-0000-0000-000000000000'
  ),
  '00000000-0000-0000-0000-000000000000'::uuid,
  'moderate_list attributes the soft-delete to the tombstone'
);
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', TRUE
);
SELECT is(
  (
    SELECT count(*)::int FROM public.lists_deleted
    WHERE id = 'd0000001-0000-0000-0000-000000000000'
  ),
  1, 'a member sees the moderated list through lists_deleted'
);
RESET ROLE;

-- ── purge_list assertions ──────────────────────────────────────────
SELECT is(
  (
    SELECT count(*)::int FROM public.lists
    WHERE id = 'd0000002-0000-0000-0000-000000000000'
  ),
  0, 'purge_list hard-deletes the list'
);
SELECT is(
  (
    SELECT count(*)::int FROM public.items
    WHERE id = 'd0000003-0000-0000-0000-000000000000'
  ),
  0, 'purge_list cascades its items away'
);
SELECT is(
  (
    SELECT count(*)::int FROM public.votes
    WHERE item_id = 'd0000003-0000-0000-0000-000000000000'
  ),
  0, 'purge_list cascades its votes away'
);
SELECT is(
  (
    SELECT count(*)::int FROM public.list_members
    WHERE list_id = 'd0000002-0000-0000-0000-000000000000'
  ),
  0, 'purge_list cascades its list_members away'
);

-- ── Empty-reason leaves the target unchanged ───────────────────────
SELECT is(
  (
    SELECT deleted_at FROM public.items
    WHERE id = 'a0000003-0000-0000-0000-000000000000'
  ),
  NULL, 'an aborted empty-reason moderate_item leaves the item live'
);

-- ── Grant matrix ───────────────────────────────────────────────────
SELECT ok(
  has_function_privilege(
    'cairn_admin', 'admin.moderate_item(uuid, text)', 'EXECUTE'
  ),
  'cairn_admin HAS EXECUTE on moderate_item'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated', 'admin.moderate_item(uuid, text)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon', 'admin.moderate_item(uuid, text)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'cairn_readonly', 'admin.moderate_item(uuid, text)', 'EXECUTE'
  ),
  'authenticated/anon/cairn_readonly have NO EXECUTE on moderate_item'
);
SELECT ok(
  has_function_privilege(
    'cairn_admin', 'admin.purge_item(uuid, text)', 'EXECUTE'
  ),
  'cairn_admin HAS EXECUTE on purge_item'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated', 'admin.purge_item(uuid, text)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon', 'admin.purge_item(uuid, text)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'cairn_readonly', 'admin.purge_item(uuid, text)', 'EXECUTE'
  ),
  'authenticated/anon/cairn_readonly have NO EXECUTE on purge_item'
);
SELECT ok(
  has_function_privilege(
    'cairn_admin', 'admin.moderate_list(uuid, text)', 'EXECUTE'
  ),
  'cairn_admin HAS EXECUTE on moderate_list'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated', 'admin.moderate_list(uuid, text)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon', 'admin.moderate_list(uuid, text)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'cairn_readonly', 'admin.moderate_list(uuid, text)', 'EXECUTE'
  ),
  'authenticated/anon/cairn_readonly have NO EXECUTE on moderate_list'
);
SELECT ok(
  has_function_privilege(
    'cairn_admin', 'admin.purge_list(uuid, text)', 'EXECUTE'
  ),
  'cairn_admin HAS EXECUTE on purge_list'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated', 'admin.purge_list(uuid, text)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'anon', 'admin.purge_list(uuid, text)', 'EXECUTE'
  )
  AND NOT has_function_privilege(
    'cairn_readonly', 'admin.purge_list(uuid, text)', 'EXECUTE'
  ),
  'authenticated/anon/cairn_readonly have NO EXECUTE on purge_list'
);

SELECT finish();

ROLLBACK;
