-- rls_list_members.sql — locks in `list_members_select`,
-- `list_members_update`, the no-INSERT-grant + no-INSERT-policy
-- footgun closures, and the two PK-immutability `throws_ok`
-- assertions for `tg_freeze_list_members_pk` (Risk #13).
--
-- 11 assertions:
--   1. SELECT positive (member sees the membership row).
--   2. SELECT negative (non-member sees nothing).
--   3. INSERT GRANT-layer denial (42501).
--   4. INSERT policy-layer denial (with grant, no INSERT policy
--      raises 42501).
--   5. UPDATE positive (Alice kicks Bob — soft-removes another
--      member's row).
--   6. UPDATE positive (Alice restores Bob's soft-removed row).
--   7. UPDATE positive (Bob soft-removes himself, exercising the
--      `OR user_id = public.uid()` self-row branch of WITH CHECK
--      that survives the `is_list_member` going false post-update).
--   8. UPDATE negative — **kicked-user self-restore footgun**:
--      after self-soft-removing, Bob fails the `is_list_member`
--      check in the USING clause, so his subsequent self-restore
--      UPDATE matches 0 rows (the row stays soft-removed).
--   9. UPDATE negative (outsider Carol's UPDATE matches 0 rows).
--   10. Freeze trigger raises P0001 on `SET list_id = …` —
--       load-bearing for Risk #13's consent-closure guard; the
--       policy itself would let the self-row PATCH through, only
--       the freeze catches it. Runs under Alice (live member of
--       both lists), never `cairn` — cairn-as-owner bypasses
--       RLS, masking the "policy lets through" half.
--   11. Freeze trigger raises P0001 on `SET user_id = …` —
--       symmetric closure of the non-member graft vector.
--
-- Includes the solo-list fixture so we have a second list to
-- target in the SET list_id freeze test (Alice is a member of
-- both 1111 and 2222 after both fixtures load).

BEGIN;

SELECT plan(11);

\i /db/tests/fixtures/list_shared_alice_bob.sql
\i /db/tests/fixtures/list_solo_alice.sql

-- ===================================================================
-- SELECT positive / negative
-- ===================================================================

-- 1. Alice (member) sees both list_members rows for list 1111.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT is(
  (
    SELECT count(*)::int FROM public.list_members
    WHERE list_id = '11111111-1111-1111-1111-111111111111'
  ),
  2,
  'list_members SELECT positive: Alice (member) sees her + Bob''s row'
);

-- 2. Carol (non-member) sees nothing for list 1111.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}',
  TRUE
);
SELECT is(
  (
    SELECT count(*)::int FROM public.list_members
    WHERE list_id = '11111111-1111-1111-1111-111111111111'
  ),
  0,
  'list_members SELECT negative: Carol (non-member) sees nothing'
);

-- ===================================================================
-- INSERT denials per defence layer
-- ===================================================================

-- 3. GRANT-layer denial.
SELECT throws_ok(
  $$INSERT INTO public.list_members (list_id, user_id) VALUES
    ('11111111-1111-1111-1111-111111111111',
     'cccccccc-cccc-cccc-cccc-cccccccccccc')$$,
  '42501',
  NULL,
  'list_members INSERT GRANT-layer denial: authenticated raises 42501'
);

-- 4. Policy-layer denial. GRANT INSERT inside the txn, then
-- attempt under authenticated + Alice's claims. No INSERT
-- policy → 42501 "new row violates row-level security policy".
RESET ROLE;
GRANT INSERT ON public.list_members TO authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.list_members (list_id, user_id) VALUES
    ('11111111-1111-1111-1111-111111111111',
     'cccccccc-cccc-cccc-cccc-cccccccccccc')$$,
  '42501',
  NULL,
  'list_members INSERT policy-layer denial: with grant, RLS '
  'still raises 42501'
);

-- ===================================================================
-- UPDATE positives / negatives
-- ===================================================================

-- 5. Alice kicks Bob (soft-removes another member's row).
-- Alice is member of 1111; USING passes. WITH CHECK passes
-- because Alice is still a member after the update (her own
-- row is unaffected).
UPDATE public.list_members
SET deleted_at = now()
WHERE
  list_id = '11111111-1111-1111-1111-111111111111'
  AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SELECT isnt(
  (
    SELECT deleted_at FROM public.list_members
    WHERE
      list_id = '11111111-1111-1111-1111-111111111111'
      AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  NULL,
  'list_members UPDATE positive: Alice soft-removes Bob '
  '(kick another member)'
);

-- 6. Alice restores Bob's soft-removed row.
UPDATE public.list_members
SET deleted_at = NULL
WHERE
  list_id = '11111111-1111-1111-1111-111111111111'
  AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SELECT is(
  (
    SELECT deleted_at FROM public.list_members
    WHERE
      list_id = '11111111-1111-1111-1111-111111111111'
      AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  NULL,
  'list_members UPDATE positive: Alice restores Bob''s row'
);

-- 7. Bob self-soft-removes. USING: is_list_member(bob, 1111) =
-- true (still a member at start). WITH CHECK on the new row:
-- is_list_member(bob, 1111) is false post-update, but the
-- OR user_id = public.uid() self-row branch passes.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);
UPDATE public.list_members
SET deleted_at = now()
WHERE
  list_id = '11111111-1111-1111-1111-111111111111'
  AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SELECT isnt(
  (
    SELECT deleted_at FROM public.list_members
    WHERE
      list_id = '11111111-1111-1111-1111-111111111111'
      AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  NULL,
  'list_members UPDATE positive: Bob soft-removes himself '
  '(self-row WITH CHECK branch)'
);

-- 8. Kicked-user self-restore footgun. Bob is now soft-removed;
-- is_list_member returns false, so the USING clause hides his
-- own row from his UPDATE. The UPDATE matches zero rows; his
-- row stays soft-removed.
UPDATE public.list_members
SET deleted_at = NULL
WHERE
  list_id = '11111111-1111-1111-1111-111111111111'
  AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
RESET ROLE;
SELECT isnt(
  (
    SELECT deleted_at FROM public.list_members
    WHERE
      list_id = '11111111-1111-1111-1111-111111111111'
      AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  NULL,
  'list_members UPDATE negative: kicked Bob cannot self-restore '
  '(USING fails — load-bearing footgun closure)'
);

-- 9. UPDATE negative: outsider Carol. USING fails for Carol on
-- any list_members row of list 1111. Re-restore Bob first as
-- Alice so we have a known target state.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
UPDATE public.list_members
SET deleted_at = NULL
WHERE
  list_id = '11111111-1111-1111-1111-111111111111'
  AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}',
  TRUE
);
UPDATE public.list_members
SET deleted_at = now()
WHERE
  list_id = '11111111-1111-1111-1111-111111111111'
  AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
RESET ROLE;
SELECT is(
  (
    SELECT deleted_at FROM public.list_members
    WHERE
      list_id = '11111111-1111-1111-1111-111111111111'
      AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  NULL,
  'list_members UPDATE negative: non-member (Carol) cannot kick '
  'a member'
);

-- ===================================================================
-- 10–11. tg_freeze_list_members_pk — PK columns must throw on
-- UPDATE, even when the policy would let the self-row PATCH
-- through (Risk #13).
-- ===================================================================

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

-- 10. SET list_id (self-add to a different list).
SELECT throws_ok(
  $$UPDATE public.list_members
    SET list_id = '22222222-2222-2222-2222-222222222222'
    WHERE list_id = '11111111-1111-1111-1111-111111111111'
      AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'P0001',
  'list_members PK columns are immutable',
  'list_members freeze: SET list_id raises P0001 even when policy '
  'admits the self-row PATCH'
);

-- 11. SET user_id (graft another user onto a list).
SELECT throws_ok(
  $$UPDATE public.list_members
    SET user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    WHERE list_id = '11111111-1111-1111-1111-111111111111'
      AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'P0001',
  'list_members PK columns are immutable',
  'list_members freeze: SET user_id raises P0001 (graft vector closed)'
);

SELECT finish();

ROLLBACK;
