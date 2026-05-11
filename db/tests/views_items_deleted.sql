-- views_items_deleted.sql — locks in the per-list trash view that
-- the trash UI reads (`GET /items_deleted?list_id=eq.<uuid>
-- &order=deleted_at.desc`).
--
-- Critical detail: the view runs `security_invoker = false` —
-- which **bypasses RLS**. Its only authorisation gate is the
-- explicit `is_list_member()` filter in the view body. The
-- non-member and soft-removed-member assertions are therefore
-- the only thing standing between a future refactor and
-- re-exposure of every list's trash to every authenticated user.
--
-- 14 assertions:
--   1. Only soft-deleted rows visible to a current member.
--   2. Live items are absent from the view.
--   3. Non-member sees zero rows — load-bearing (`is_list_member`
--      filter is the sole gate).
--   4. Soft-removed (former) member sees zero rows — load-
--      bearing companion that locks in `is_list_member()`'s
--      `deleted_at IS NULL` clause on the membership row.
--   5–14. Column-shape pinning via `has_column`. `schema_shape.sql`
--      only asserts the view exists; without column pinning a
--      future refactor dropping a column from the view body
--      wouldn't red anywhere.

BEGIN;

SELECT plan(14);

\i /db/tests/fixtures/list_shared_alice_bob.sql

-- Two items: 3333 live, 4444 soft-deleted.
INSERT INTO public.items (id, list_id, name) VALUES
(
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'Live item'
);
INSERT INTO public.items (id, list_id, name) VALUES
(
  '44444444-4444-4444-4444-444444444444',
  '11111111-1111-1111-1111-111111111111',
  'Soft-deleted item'
);
UPDATE public.items
SET deleted_at = now()
WHERE id = '44444444-4444-4444-4444-444444444444';

-- ===================================================================
-- Functional tests under authenticated + Alice (member).
-- ===================================================================
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

-- 1. Only soft-deleted rows visible to a current member.
SELECT is(
  (
    SELECT count(*)::int FROM public.items_deleted
    WHERE id = '44444444-4444-4444-4444-444444444444'
  ),
  1,
  'items_deleted: current member sees the soft-deleted item'
);

-- 2. Live items are absent.
SELECT is(
  (
    SELECT count(*)::int FROM public.items_deleted
    WHERE id = '33333333-3333-3333-3333-333333333333'
  ),
  0,
  'items_deleted: live items absent (filter `deleted_at IS NOT NULL`)'
);

-- 3. Non-member sees zero rows. The view's explicit
-- is_list_member() filter is the only gate (security_invoker =
-- false bypasses RLS).
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}',
  TRUE
);
SELECT is(
  (
    SELECT count(*)::int FROM public.items_deleted
    WHERE list_id = '11111111-1111-1111-1111-111111111111'
  ),
  0,
  'items_deleted: non-member (Carol) sees zero rows '
  '(load-bearing — is_list_member is the only auth gate)'
);

-- 4. Soft-removed (former) member sees zero rows. Kick Bob from
-- 1111 under Alice's claims, then read under Bob — his
-- is_list_member() check fails because his row's deleted_at is
-- non-null.
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
    SELECT count(*)::int FROM public.items_deleted
    WHERE list_id = '11111111-1111-1111-1111-111111111111'
  ),
  0,
  'items_deleted: soft-removed member (Bob) sees zero rows '
  '(load-bearing — locks in is_list_member()''s deleted_at filter)'
);

-- ===================================================================
-- 5–14. Column-shape pinning. has_column doesn't need data, runs
-- as cairn (RESET ROLE) for catalog-only checks.
-- ===================================================================
RESET ROLE;

SELECT has_column('public', 'items_deleted', 'id', 'items_deleted.id');
SELECT has_column(
  'public', 'items_deleted', 'list_id', 'items_deleted.list_id'
);
SELECT has_column(
  'public', 'items_deleted', 'name', 'items_deleted.name'
);
SELECT has_column(
  'public', 'items_deleted', 'notes', 'items_deleted.notes'
);
SELECT has_column(
  'public', 'items_deleted', 'created_by', 'items_deleted.created_by'
);
SELECT has_column(
  'public', 'items_deleted', 'modified_by', 'items_deleted.modified_by'
);
SELECT has_column(
  'public', 'items_deleted', 'deleted_by', 'items_deleted.deleted_by'
);
SELECT has_column(
  'public', 'items_deleted', 'created_at', 'items_deleted.created_at'
);
SELECT has_column(
  'public', 'items_deleted', 'modified_at', 'items_deleted.modified_at'
);
SELECT has_column(
  'public', 'items_deleted', 'deleted_at', 'items_deleted.deleted_at'
);

SELECT finish();

ROLLBACK;
