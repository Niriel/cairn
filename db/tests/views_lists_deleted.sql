-- views_lists_deleted.sql — locks in the per-user list trash view
-- (`GET /lists_deleted`) reachable from Settings.
--
-- Same security shape as `items_deleted`: the view runs
-- `security_invoker = false` (bypasses RLS) and gates itself with
-- an explicit `is_list_member()` filter in the body. The
-- non-member and soft-removed-member assertions are the only
-- thing standing between a future refactor and re-exposure of
-- every list's trash header to every authenticated user.
--
-- 12 assertions:
--   1. Only soft-deleted lists visible to a current member.
--   2. Live lists absent.
--   3. Non-member sees zero rows — load-bearing.
--   4. Soft-removed (former) member sees zero rows — load-
--      bearing.
--   5–12. Column-shape pinning.

BEGIN;

SELECT plan(12);

\i /db/tests/fixtures/list_shared_alice_bob.sql

-- Add a live list (6666) where Alice is a member, so the
-- "live list absent" assertion is testing the deleted_at filter
-- in the view body rather than a membership miss. The shared
-- list 1111 from the fixture is the one we'll soft-delete.
INSERT INTO public.lists (id, name) VALUES
('66666666-6666-6666-6666-666666666666', 'Live list (control)');
INSERT INTO public.list_members (list_id, user_id) VALUES
(
  '66666666-6666-6666-6666-666666666666',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);

-- Soft-delete the shared list 1111 (under cairn — RLS bypassed;
-- the trigger fills deleted_by = alice from the JWT claim set
-- by the fixture).
UPDATE public.lists
SET deleted_at = now()
WHERE id = '11111111-1111-1111-1111-111111111111';

-- ===================================================================
-- Functional tests under authenticated + Alice (member of both).
-- ===================================================================
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

-- 1. Alice (current member of 1111) sees the soft-deleted list.
SELECT is(
  (
    SELECT count(*)::int FROM public.lists_deleted
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  1,
  'lists_deleted: current member sees the soft-deleted list'
);

-- 2. Live list 6666 is absent. View body's `deleted_at IS NOT
-- NULL` filter.
SELECT is(
  (
    SELECT count(*)::int FROM public.lists_deleted
    WHERE id = '66666666-6666-6666-6666-666666666666'
  ),
  0,
  'lists_deleted: live lists absent (filter `deleted_at IS NOT NULL`)'
);

-- 3. Non-member (Carol) sees zero rows. is_list_member filter
-- is the only auth gate — security_invoker = false bypasses RLS.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}',
  TRUE
);
SELECT is(
  (SELECT count(*)::int FROM public.lists_deleted),
  0,
  'lists_deleted: non-member (Carol) sees zero rows '
  '(load-bearing — is_list_member is the only auth gate)'
);

-- 4. Soft-removed (former) member sees zero rows. Switch back
-- to Alice, kick Bob from 1111, then read under Bob —
-- is_list_member fails because Bob's membership row's
-- deleted_at is now non-null.
RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
UPDATE public.list_members
SET deleted_at = now()
WHERE
  list_id = '11111111-1111-1111-1111-111111111111'
  AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);
SELECT is(
  (
    SELECT count(*)::int FROM public.lists_deleted
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  0,
  'lists_deleted: soft-removed member (Bob) sees zero rows '
  '(load-bearing — locks in is_list_member()''s deleted_at filter)'
);

-- ===================================================================
-- 5–12. Column-shape pinning. Catalog-only — runs as cairn.
-- ===================================================================
RESET ROLE;

SELECT has_column('public', 'lists_deleted', 'id', 'lists_deleted.id');
SELECT has_column(
  'public', 'lists_deleted', 'name', 'lists_deleted.name'
);
SELECT has_column(
  'public', 'lists_deleted', 'description', 'lists_deleted.description'
);
SELECT has_column(
  'public', 'lists_deleted', 'created_by', 'lists_deleted.created_by'
);
SELECT has_column(
  'public', 'lists_deleted', 'deleted_by', 'lists_deleted.deleted_by'
);
SELECT has_column(
  'public', 'lists_deleted', 'created_at', 'lists_deleted.created_at'
);
SELECT has_column(
  'public', 'lists_deleted', 'modified_at', 'lists_deleted.modified_at'
);
SELECT has_column(
  'public', 'lists_deleted', 'deleted_at', 'lists_deleted.deleted_at'
);

SELECT finish();

ROLLBACK;
