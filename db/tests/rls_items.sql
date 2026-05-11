-- rls_items.sql — locks in the `items_*` policies and the
-- no-DELETE GRANT-layer + policy-layer closures.
--
-- 9 assertions:
--   1. SELECT positive (member sees an item in their list).
--   2. SELECT negative (non-member sees nothing).
--   3. SELECT negative (soft-deleted item hidden through the
--      base table — the trash view `items_deleted` is the only
--      path).
--   4. INSERT positive (member adds an item to their list).
--   5. INSERT negative (non-member's INSERT raises 42501 — the
--      `items_insert` WITH CHECK fails on `is_list_member`).
--   6. UPDATE positive (member edits any item in their list).
--   7. UPDATE negative (outsider's UPDATE matches 0 rows).
--   8. DELETE GRANT-layer denial (42501).
--   9. DELETE policy-layer denial (with GRANT, no DELETE policy
--      makes WHERE match zero rows; the row survives).
--
-- INSERT has a real GRANT for `authenticated`, so the policy
-- layer is the one that matters and is tested via the non-
-- member case. DELETE, like `lists`, has no GRANT for
-- `authenticated`; we exercise both layers separately.

BEGIN;

SELECT plan(9);

\i /db/tests/fixtures/list_shared_alice_bob.sql

-- Two items in list 1111. The fixture set JWT claims to Alice
-- and ran as cairn, so the attribution trigger stamped both
-- with `created_by = modified_by = alice`.
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
  'To be soft-deleted'
);

-- ===================================================================
-- SELECT positives / negatives
-- ===================================================================

-- 1. Member (Alice) sees a live item.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT is(
  (
    SELECT count(*)::int FROM public.items
    WHERE id = '33333333-3333-3333-3333-333333333333'
  ),
  1,
  'items SELECT positive: member (Alice) sees a live item'
);

-- 2. Non-member (Carol) sees nothing.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}',
  TRUE
);
SELECT is(
  (
    SELECT count(*)::int FROM public.items
    WHERE id = '33333333-3333-3333-3333-333333333333'
  ),
  0,
  'items SELECT negative: non-member (Carol) sees nothing'
);

-- 3. Soft-deleted item hidden through the base table. Switch to
-- Alice (member), soft-delete item 4444, then SELECT — the
-- `items_select` `deleted_at IS NULL` clause must hide it.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
UPDATE public.items
SET deleted_at = now()
WHERE id = '44444444-4444-4444-4444-444444444444';
SELECT is(
  (
    SELECT count(*)::int FROM public.items
    WHERE id = '44444444-4444-4444-4444-444444444444'
  ),
  0,
  'items SELECT negative: soft-deleted item hidden from base table '
  '(member reaches it only through the items_deleted trash view)'
);

-- ===================================================================
-- INSERT positive / negative
-- ===================================================================

-- 4. INSERT positive: Alice (member) adds an item.
INSERT INTO public.items (id, list_id, name) VALUES
(
  '55555555-5555-5555-5555-555555555555',
  '11111111-1111-1111-1111-111111111111',
  'Alice''s new item'
);
SELECT is(
  (
    SELECT count(*)::int FROM public.items
    WHERE id = '55555555-5555-5555-5555-555555555555'
  ),
  1,
  'items INSERT positive: member (Alice) adds an item to her list'
);

-- 5. INSERT negative: Carol (non-member) tries to add. The
-- attribution trigger stamps created_by = carol; the
-- `items_insert` WITH CHECK then fails on `is_list_member`.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}',
  TRUE
);
SELECT throws_ok(
  $$INSERT INTO public.items (list_id, name) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Carol''s sneaky item')$$,
  '42501',
  NULL,
  'items INSERT negative: non-member raises 42501 '
  '(WITH CHECK fails on is_list_member)'
);

-- ===================================================================
-- UPDATE positive / negative
-- ===================================================================

-- 6. UPDATE positive: Alice (member) edits any item.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
UPDATE public.items
SET name = 'Live item, renamed by Alice'
WHERE id = '33333333-3333-3333-3333-333333333333';
SELECT is(
  (
    SELECT name FROM public.items
    WHERE id = '33333333-3333-3333-3333-333333333333'
  ),
  'Live item, renamed by Alice',
  'items UPDATE positive: member edits an item in her list'
);

-- 7. UPDATE negative: Carol (non-member). USING fails; 0 rows
-- affected; item's name unchanged.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}',
  TRUE
);
UPDATE public.items
SET name = 'Hijacked by Carol'
WHERE id = '33333333-3333-3333-3333-333333333333';
RESET ROLE;
SELECT is(
  (
    SELECT name FROM public.items
    WHERE id = '33333333-3333-3333-3333-333333333333'
  ),
  'Live item, renamed by Alice',
  'items UPDATE negative: non-member (Carol) cannot edit'
);

-- ===================================================================
-- DELETE denials per defence layer
-- ===================================================================

-- 8. GRANT-layer denial. authenticated has no DELETE grant on items.
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$DELETE FROM public.items
    WHERE id = '33333333-3333-3333-3333-333333333333'$$,
  '42501',
  NULL,
  'items DELETE GRANT-layer denial: authenticated raises 42501'
);

-- 9. Policy-layer denial. GRANT DELETE inside the txn, then
-- attempt; with no DELETE policy, RLS makes WHERE match zero
-- rows. Read the row count back under cairn.
RESET ROLE;
GRANT DELETE ON public.items TO authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
DELETE FROM public.items
WHERE id = '33333333-3333-3333-3333-333333333333';
RESET ROLE;
SELECT is(
  (
    SELECT count(*)::int FROM public.items
    WHERE id = '33333333-3333-3333-3333-333333333333'
  ),
  1,
  'items DELETE policy-layer denial: row survives despite GRANT '
  '(no DELETE policy = default deny)'
);

SELECT finish();

ROLLBACK;
