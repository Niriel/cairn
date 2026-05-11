-- rls_lists.sql — locks in the `lists_*` policies and the no-
-- INSERT / no-DELETE GRANTs from docs/data-model.md.
--
-- 9 assertions:
--   1. SELECT positive (member sees their list).
--   2. SELECT negative (non-member doesn't).
--   3. SELECT negative (soft-deleted list hidden through the base
--      table — the trash view `lists_deleted` is the only path).
--   4. INSERT GRANT-layer denial (authenticated has no INSERT
--      grant; 42501 raised before any trigger fires).
--   5. INSERT policy-layer denial (with INSERT temporarily
--      granted inside the txn, the no-INSERT-policy default-deny
--      still raises 42501 "new row violates row-level security
--      policy").
--   6. DELETE GRANT-layer denial (no DELETE grant; 42501).
--   7. DELETE policy-layer denial (with DELETE temporarily
--      granted, the no-DELETE-policy default makes WHERE match
--      zero rows; the row survives — asserted via post-attempt
--      count).
--   8. UPDATE positive (member can rename their list).
--   9. UPDATE negative (non-member's UPDATE matches zero rows).
--
-- Per-defence-layer split rationale: a future regression that
-- adds an INSERT/DELETE grant *or* a permissive policy would
-- silently re-open the orphan-list / no-hard-delete-via-API
-- footguns; only splitting the two layers catches each
-- independently.
--
-- The policy-layer legs (5) and (7) intentionally run under
-- `authenticated`, never `cairn` — cairn is superuser + table
-- owner and bypasses RLS unless `FORCE ROW LEVEL SECURITY` is
-- set (it isn't).

BEGIN;

SELECT plan(9);

\i /db/tests/fixtures/list_shared_alice_bob.sql

-- =========================================================
-- SELECT positives / negatives
-- =========================================================

-- 1. Member sees their list (Alice on list 1111).
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT is(
  (
    SELECT count(*)::int FROM public.lists
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  1,
  'lists SELECT positive: member (Alice) sees the shared list'
);

-- 2. Non-member doesn't see it (Carol).
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}',
  TRUE
);
SELECT is(
  (
    SELECT count(*)::int FROM public.lists
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  0,
  'lists SELECT negative: non-member (Carol) sees nothing'
);

-- 3. Soft-deleted list hidden through the base table. Switch
-- back to Alice (member, can UPDATE). Soft-delete the list,
-- then assert it's invisible to her via the base lists table.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
UPDATE public.lists
SET deleted_at = now()
WHERE id = '11111111-1111-1111-1111-111111111111';
SELECT is(
  (
    SELECT count(*)::int FROM public.lists
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  0,
  'lists SELECT negative: soft-deleted list hidden from base table '
  '(member sees it only through the lists_deleted trash view)'
);

-- =========================================================
-- INSERT denials per defence layer
-- =========================================================

-- 4. GRANT-layer denial. `authenticated` has no INSERT grant on
-- lists — Postgres raises 42501 before any trigger fires.
SELECT throws_ok(
  $$INSERT INTO public.lists (name) VALUES ('GRANT-attempt')$$,
  '42501',
  NULL,
  'lists INSERT GRANT-layer denial: authenticated raises 42501'
);

-- 5. Policy-layer denial. GRANT INSERT inside the txn (rolled
-- back at end), then attempt the INSERT under authenticated +
-- Alice's claims. The no-INSERT-policy default-deny raises
-- 42501 "new row violates row-level security policy".
RESET ROLE;
GRANT INSERT ON public.lists TO authenticated;
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.lists (name) VALUES ('policy-attempt')$$,
  '42501',
  NULL,
  'lists INSERT policy-layer denial: with grant, RLS still raises 42501'
);

-- =========================================================
-- DELETE denials per defence layer
-- =========================================================

-- 6. GRANT-layer denial. authenticated has no DELETE grant.
-- (Soft-delete from earlier persists into this assertion — RLS
-- still hides the row by id, but the GRANT check fires before
-- RLS even gets a row, so any DELETE statement is rejected.)
SELECT throws_ok(
  $$DELETE FROM public.lists WHERE id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  NULL,
  'lists DELETE GRANT-layer denial: authenticated raises 42501'
);

-- 7. Policy-layer denial. GRANT DELETE inside txn, attempt
-- DELETE. There's no DELETE policy, so RLS's default-deny makes
-- WHERE match zero rows — the statement succeeds but affects
-- nothing; assert by reading the row count under cairn.
RESET ROLE;
GRANT DELETE ON public.lists TO authenticated;
SET LOCAL ROLE authenticated;
DELETE FROM public.lists
WHERE id = '11111111-1111-1111-1111-111111111111';
RESET ROLE;
SELECT is(
  (
    SELECT count(*)::int FROM public.lists
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  1,
  'lists DELETE policy-layer denial: row survives with GRANT '
  '(no DELETE policy = default deny, 0 rows affected)'
);

-- =========================================================
-- UPDATE positive / negative
-- =========================================================

-- 8. UPDATE positive: member (Alice) can rename. Restore the
-- soft-delete from step 3 first so the UPDATE is on a live row
-- and exercises lists_update's deleted_at filter.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
UPDATE public.lists
SET deleted_at = NULL
WHERE id = '11111111-1111-1111-1111-111111111111';
UPDATE public.lists
SET name = 'Renamed by Alice'
WHERE id = '11111111-1111-1111-1111-111111111111';
SELECT is(
  (
    SELECT name FROM public.lists
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  'Renamed by Alice',
  'lists UPDATE positive: member (Alice) renames the shared list'
);

-- 9. UPDATE negative: non-member (Carol). RLS hides the row;
-- the UPDATE matches 0 rows; the row's name stays.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}',
  TRUE
);
UPDATE public.lists
SET name = 'Hijacked by Carol'
WHERE id = '11111111-1111-1111-1111-111111111111';
RESET ROLE;
SELECT is(
  (
    SELECT name FROM public.lists
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  'Renamed by Alice',
  'lists UPDATE negative: non-member (Carol) cannot rename'
);

SELECT finish();

ROLLBACK;
