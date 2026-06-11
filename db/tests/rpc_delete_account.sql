-- rpc_delete_account.sql — locks in the `public.delete_account()`
-- RPC's happy path (the full documented teardown) plus its two
-- in-body guards and the GRANT-layer denial for anon.
--
-- `delete_account` is the *only* sanctioned account-deletion path
-- (PostgREST exposes no DELETE on auth.users). The body, run as
-- SECURITY DEFINER, hard-deletes the caller's sole-member lists,
-- then deletes their auth.users row — which cascades personal data
-- (profiles, user_settings, votes, the caller's own list_members)
-- and SET-DEFAULTs shared attribution to the tombstone user. See
-- docs/account-deletion.md "What gets deleted, anonymized, or kept".
--
-- 13 assertions:
--   Positive (Alice deletes herself):
--     1. Her sole-member list is hard-deleted.
--     2. That list's item is gone (cascade).
--     3. The shared list with Bob survives.
--     4. Alice's membership on the shared list is gone (cascade).
--     5. Alice's votes are gone (cascade).
--     6. A surviving item whose created_by was Alice now points at
--        the tombstone (SET DEFAULT).
--     7. Cross-actor: a surviving item whose modified_by pointed at
--        Bob (a different, non-deleted user) is unchanged.
--     8. Alice's profiles row is gone (cascade).
--     9. Alice's user_settings row is gone (cascade).
--    10. The tombstone profiles row still exists.
--   Negative:
--    11. Anon → SQLSTATE 42501 (GRANT-layer denial; body never runs).
--    12. Authenticated, claims unset → 28000 'not authenticated'.
--    13. Authenticated, claims = tombstone → 28000 'cannot delete
--        the tombstone user'.
--
-- Each defence layer is exercised separately so a regression that
-- removes the function GRANT *or* a body guard surfaces independently.

BEGIN;

SELECT plan(13);

-- Shared list 11111111 (Alice + Bob) and the three-user fixture.
\i /db/tests/fixtures/list_shared_alice_bob.sql
-- Solo list 22222222 (Alice only). Re-includes the users fixture
-- (idempotent) and re-sets Alice's claims.
\i /db/tests/fixtures/list_solo_alice.sql

-- Claims are Alice (set by the last fixture). Seed content as the
-- test-session superuser (RLS-bypassing); the attribution triggers
-- still stamp created_by/modified_by from the JWT claim.

-- Item on the solo list — should vanish with the list.
INSERT INTO public.items (id, list_id, name) VALUES
(
  '55555555-5555-5555-5555-555555555555',
  '22222222-2222-2222-2222-222222222222',
  'Solo item'
);

-- Item on the shared list, created_by = Alice — survives, attribution
-- repoints to the tombstone.
INSERT INTO public.items (id, list_id, name) VALUES
(
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'Alice item on shared list'
);

-- Item on the shared list whose modified_by will be Bob (cross-actor).
INSERT INTO public.items (id, list_id, name) VALUES
(
  '66666666-6666-6666-6666-666666666666',
  '11111111-1111-1111-1111-111111111111',
  'Item later edited by Bob'
);

-- Alice votes on her shared-list item; Bob votes on it too. Alice's
-- vote must cascade away; Bob's is irrelevant to the assertions but
-- proves the cascade is scoped to the deleted user.
INSERT INTO public.votes (item_id, user_id, value) VALUES
('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2),
('33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1);

-- Switch claims to Bob and make a real content edit so the items
-- attribution trigger stamps modified_by = Bob. created_by stays
-- Alice (frozen by the created_by-freeze branch).
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);
UPDATE public.items
SET notes = 'edited by bob'
WHERE id = '66666666-6666-6666-6666-666666666666';

-- Pull the trigger: Alice deletes her own account. Drop superuser
-- bypass so the GRANT EXECUTE to `authenticated` is exercised; the
-- function's SECURITY DEFINER attribute re-elevates inside the body.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT public.delete_account();

-- Read table state back as the superuser so assertions see the true
-- rows regardless of RLS.
RESET ROLE;

-- 1. Sole-member list hard-deleted.
SELECT is(
  (
    SELECT count(*)::int FROM public.lists
    WHERE id = '22222222-2222-2222-2222-222222222222'
  ),
  0,
  'delete_account: sole-member list is hard-deleted'
);

-- 2. Its item cascaded away.
SELECT is(
  (
    SELECT count(*)::int FROM public.items
    WHERE id = '55555555-5555-5555-5555-555555555555'
  ),
  0,
  'delete_account: sole-member list''s item cascades away'
);

-- 3. Shared list survives (Bob is still a live member).
SELECT is(
  (
    SELECT count(*)::int FROM public.lists
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  1,
  'delete_account: shared list with another member survives'
);

-- 4. Alice's membership on the shared list cascaded away.
SELECT is(
  (
    SELECT count(*)::int FROM public.list_members
    WHERE
      list_id = '11111111-1111-1111-1111-111111111111'
      AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  0,
  'delete_account: deleted user''s membership cascades away'
);

-- 5. Alice's votes cascaded away.
SELECT is(
  (
    SELECT count(*)::int FROM public.votes
    WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  0,
  'delete_account: deleted user''s votes cascade away'
);

-- 6. Surviving item's created_by repoints to the tombstone.
SELECT is(
  (
    SELECT created_by FROM public.items
    WHERE id = '33333333-3333-3333-3333-333333333333'
  ),
  '00000000-0000-0000-0000-000000000000'::uuid,
  'delete_account: surviving item''s created_by repoints to tombstone'
);

-- 7. Cross-actor: an item whose modified_by pointed at Bob (a
-- different, non-deleted user) is unchanged.
SELECT is(
  (
    SELECT modified_by FROM public.items
    WHERE id = '66666666-6666-6666-6666-666666666666'
  ),
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  'delete_account: modified_by pointing at a non-deleted user is left alone'
);

-- 8. Alice's profiles row cascaded away.
SELECT is(
  (
    SELECT count(*)::int FROM public.profiles
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  0,
  'delete_account: deleted user''s profiles row cascades away'
);

-- 9. Alice's user_settings row cascaded away.
SELECT is(
  (
    SELECT count(*)::int FROM public.user_settings
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  0,
  'delete_account: deleted user''s user_settings row cascades away'
);

-- 10. The tombstone profiles row still exists.
SELECT is(
  (
    SELECT count(*)::int FROM public.profiles
    WHERE id = '00000000-0000-0000-0000-000000000000'
  ),
  1,
  'delete_account: tombstone profiles row is preserved'
);

-- 11. GRANT-layer denial under anon. EXECUTE is granted to
-- `authenticated` only; anon never reaches the body.
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT public.delete_account()$$,
  '42501',
  NULL,
  'delete_account: anon denied at the GRANT layer (SQLSTATE 42501)'
);

-- 12. In-body `public.uid() IS NULL` guard. Authenticated with
-- claims unset → uid() is NULL → 28000 'not authenticated'.
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '', TRUE);
SELECT throws_ok(
  $$SELECT public.delete_account()$$,
  '28000',
  'not authenticated',
  'delete_account: in-body uid()-NULL guard raises 28000 ''not authenticated'''
);

-- 13. In-body tombstone guard. Claims = the tombstone UUID → 28000
-- 'cannot delete the tombstone user'.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000000"}',
  TRUE
);
SELECT throws_ok(
  $$SELECT public.delete_account()$$,
  '28000',
  'cannot delete the tombstone user',
  'delete_account: in-body tombstone guard raises 28000 '
  '''cannot delete the tombstone user'''
);

SELECT finish();

ROLLBACK;
