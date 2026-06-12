-- admin_delete_account_as.sql — locks in admin.delete_account_as, the
-- operator's GDPR-erasure pathway (docs/admin.md § delete_account_as).
--
-- The load-bearing property: delete_account_as must produce the EXACT
-- same end-state as the user-initiated public.delete_account() (0014),
-- so the operator path and the self-service path can never diverge.
-- The test builds two parallel worlds — World A erased via the admin
-- RPC (target Bob), World B erased via the user RPC (Carol erasing
-- herself) — each with the identical shape (solo list, shared list,
-- orphaned list, items, votes), and asserts both reach the same shape.
--
-- The orphaned-list case is the reason the body uses delete_account()'s
-- verbatim `NOT EXISTS (live member <> target)` form rather than the
-- doc's original `EXISTS (member = target) AND NOT EXISTS (other)`
-- variant: a list whose only member soft-deleted their membership has
-- zero live members, so the verbatim form hard-deletes it while the old
-- variant (target is not a *live* member) would have left it. Both paths
-- must clean it up identically.
--
-- 26 assertions:
--   World A — admin.delete_account_as(Bob):
--     1. Bob's auth.users row is gone.
--     2. Bob's profiles row is gone (cascade).
--     3. Bob's solo list is hard-deleted.
--     4. …its item is gone (cascade).
--     5. The shared Alice+Bob list survives.
--     6. Bob's item on the shared list survives, created_by repointed
--        to the tombstone (attribution anonymised, not cascaded).
--     7. Bob's votes are gone (cascade).
--     8. Bob's orphaned list (zero live members) is hard-deleted.
--   World B — public.delete_account() as Carol (mirror shape):
--     9-16. The same eight, for Carol.
--   Audit + guards:
--    17. Exactly one delete_account_as audit row targets Bob.
--    18. Its payload records email_at_time (and nothing else personal).
--    19. Tombstone target throws.
--    20. Non-existent target throws 'no such user'.
--    21. …and writes no audit row.
--    22. authenticated → 42501 at the GRANT layer.
--   Grant matrix:
--    23. cairn_admin    HAS EXECUTE.
--    24. authenticated has NO EXECUTE.
--    25. anon          has NO EXECUTE.
--    26. cairn_readonly has NO EXECUTE (no write escalation).

BEGIN;

SELECT plan(26);

-- Users + the shared Alice+Bob list (11111111), claim left = Alice.
\i /db/tests/fixtures/list_shared_alice_bob.sql

-- ── Seed World A (Bob) ─────────────────────────────────────────────
SELECT set_config(
  'request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}', TRUE
);

-- Bob's solo list, with an item and Bob's vote on it.
INSERT INTO public.lists (id, name)
VALUES ('b0000001-0000-0000-0000-000000000000', 'Bob solo');
INSERT INTO public.list_members (list_id, user_id)
VALUES (
  'b0000001-0000-0000-0000-000000000000',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);
INSERT INTO public.items (id, list_id, name)
VALUES (
  'b0000002-0000-0000-0000-000000000000',
  'b0000001-0000-0000-0000-000000000000', 'Bob solo item'
);
INSERT INTO public.votes (item_id, user_id, value)
VALUES (
  'b0000002-0000-0000-0000-000000000000',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1
);

-- Bob's item on the shared list + his vote on it (attribution to anonymise).
INSERT INTO public.items (id, list_id, name)
VALUES (
  'b0000003-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111', 'Bob shared item'
);
INSERT INTO public.votes (item_id, user_id, value)
VALUES (
  'b0000003-0000-0000-0000-000000000000',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2
);

-- Bob's orphaned list: he is the only member, but his membership is
-- soft-deleted, so the list has zero live members.
INSERT INTO public.lists (id, name)
VALUES ('b0000004-0000-0000-0000-000000000000', 'Bob orphan');
INSERT INTO public.list_members (list_id, user_id, deleted_at)
VALUES (
  'b0000004-0000-0000-0000-000000000000',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', clock_timestamp()
);

-- ── Seed World B (Carol), mirror shape ─────────────────────────────
-- Carol's solo list + item + vote.
SELECT set_config(
  'request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}', TRUE
);
INSERT INTO public.lists (id, name)
VALUES ('c0000001-0000-0000-0000-000000000000', 'Carol solo');
INSERT INTO public.list_members (list_id, user_id)
VALUES (
  'c0000001-0000-0000-0000-000000000000',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);
INSERT INTO public.items (id, list_id, name)
VALUES (
  'c0000002-0000-0000-0000-000000000000',
  'c0000001-0000-0000-0000-000000000000', 'Carol solo item'
);
INSERT INTO public.votes (item_id, user_id, value)
VALUES (
  'c0000002-0000-0000-0000-000000000000',
  'cccccccc-cccc-cccc-cccc-cccccccccccc', 1
);

-- Shared Alice+Carol list (created by Alice), Carol's item + vote.
SELECT set_config(
  'request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}', TRUE
);
INSERT INTO public.lists (id, name)
VALUES ('c0000005-0000-0000-0000-000000000000', 'Alice Carol shared');
INSERT INTO public.list_members (list_id, user_id)
VALUES (
  'c0000005-0000-0000-0000-000000000000',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
SELECT set_config(
  'request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}', TRUE
);
INSERT INTO public.list_members (list_id, user_id)
VALUES (
  'c0000005-0000-0000-0000-000000000000',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);
INSERT INTO public.items (id, list_id, name)
VALUES (
  'c0000003-0000-0000-0000-000000000000',
  'c0000005-0000-0000-0000-000000000000', 'Carol shared item'
);
INSERT INTO public.votes (item_id, user_id, value)
VALUES (
  'c0000003-0000-0000-0000-000000000000',
  'cccccccc-cccc-cccc-cccc-cccccccccccc', 2
);

-- Carol's orphaned list (zero live members).
INSERT INTO public.lists (id, name)
VALUES ('c0000004-0000-0000-0000-000000000000', 'Carol orphan');
INSERT INTO public.list_members (list_id, user_id, deleted_at)
VALUES (
  'c0000004-0000-0000-0000-000000000000',
  'cccccccc-cccc-cccc-cccc-cccccccccccc', clock_timestamp()
);

-- ── Erase World A via the admin RPC ────────────────────────────────
SET LOCAL ROLE cairn_admin;
SELECT admin.delete_account_as(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'GDPR erasure test, ticket 9'
);
RESET ROLE;

-- ── Erase World B via the user RPC (Carol erases herself) ──────────
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims', '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}', TRUE
);
SELECT public.delete_account();
RESET ROLE;

-- ── World A assertions ─────────────────────────────────────────────
SELECT is(
  (
    SELECT count(*)::int FROM auth.users
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  0, 'delete_account_as: Bob auth.users row gone'
);
SELECT is(
  (
    SELECT count(*)::int FROM public.profiles
    WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  0, 'delete_account_as: Bob profiles row gone (cascade)'
);
SELECT is(
  (
    SELECT count(*)::int FROM public.lists
    WHERE id = 'b0000001-0000-0000-0000-000000000000'
  ),
  0, 'delete_account_as: Bob solo list hard-deleted'
);
SELECT is(
  (
    SELECT count(*)::int FROM public.items
    WHERE id = 'b0000002-0000-0000-0000-000000000000'
  ),
  0, 'delete_account_as: Bob solo item gone (cascade)'
);
SELECT is(
  (
    SELECT count(*)::int FROM public.lists
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  1, 'delete_account_as: shared Alice+Bob list survives'
);
SELECT is(
  (
    SELECT created_by FROM public.items
    WHERE id = 'b0000003-0000-0000-0000-000000000000'
  ),
  '00000000-0000-0000-0000-000000000000'::uuid,
  'delete_account_as: Bob shared item kept, created_by → tombstone'
);
SELECT is(
  (
    SELECT count(*)::int FROM public.votes
    WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  0, 'delete_account_as: Bob votes gone (cascade)'
);
SELECT is(
  (
    SELECT count(*)::int FROM public.lists
    WHERE id = 'b0000004-0000-0000-0000-000000000000'
  ),
  0, 'delete_account_as: Bob orphaned list hard-deleted (verbatim NOT EXISTS)'
);

-- ── World B assertions (mirror shape) ──────────────────────────────
SELECT is(
  (
    SELECT count(*)::int FROM auth.users
    WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  ),
  0, 'delete_account: Carol auth.users row gone'
);
SELECT is(
  (
    SELECT count(*)::int FROM public.profiles
    WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  ),
  0, 'delete_account: Carol profiles row gone (cascade)'
);
SELECT is(
  (
    SELECT count(*)::int FROM public.lists
    WHERE id = 'c0000001-0000-0000-0000-000000000000'
  ),
  0, 'delete_account: Carol solo list hard-deleted'
);
SELECT is(
  (
    SELECT count(*)::int FROM public.items
    WHERE id = 'c0000002-0000-0000-0000-000000000000'
  ),
  0, 'delete_account: Carol solo item gone (cascade)'
);
SELECT is(
  (
    SELECT count(*)::int FROM public.lists
    WHERE id = 'c0000005-0000-0000-0000-000000000000'
  ),
  1, 'delete_account: shared Alice+Carol list survives'
);
SELECT is(
  (
    SELECT created_by FROM public.items
    WHERE id = 'c0000003-0000-0000-0000-000000000000'
  ),
  '00000000-0000-0000-0000-000000000000'::uuid,
  'delete_account: Carol shared item kept, created_by → tombstone'
);
SELECT is(
  (
    SELECT count(*)::int FROM public.votes
    WHERE user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  ),
  0, 'delete_account: Carol votes gone (cascade)'
);
SELECT is(
  (
    SELECT count(*)::int FROM public.lists
    WHERE id = 'c0000004-0000-0000-0000-000000000000'
  ),
  0, 'delete_account: Carol orphaned list hard-deleted (same end-state)'
);

-- ── Audit + guards ─────────────────────────────────────────────────
SELECT is(
  (
    SELECT count(*)::int FROM admin.actions
    WHERE
      action = 'delete_account_as'
      AND target = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  1, 'delete_account_as writes exactly one audit row for Bob'
);
SELECT is(
  (
    SELECT payload ->> 'email_at_time' FROM admin.actions
    WHERE
      action = 'delete_account_as'
      AND target = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  'bob@test',
  'delete_account_as payload records email_at_time'
);

SET LOCAL ROLE cairn_admin;
SELECT throws_ok(
  $$SELECT admin.delete_account_as(
      '00000000-0000-0000-0000-000000000000', 'should be rejected'
    )$$,
  'P0001', 'cannot delete the tombstone user',
  'delete_account_as rejects the tombstone target'
);
SELECT throws_ok(
  $$SELECT admin.delete_account_as(
      '99999999-9999-9999-9999-999999999999', 'should be rejected'
    )$$,
  'P0001', 'no such user',
  'delete_account_as throws on a non-existent target'
);
RESET ROLE;
SELECT is(
  (
    SELECT count(*)::int FROM admin.actions
    WHERE target = '99999999-9999-9999-9999-999999999999'
  ),
  0, 'delete_account_as writes no audit row for a rejected target'
);

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT admin.delete_account_as(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'should be denied'
    )$$,
  '42501', NULL,
  'delete_account_as denies authenticated at the GRANT layer (42501)'
);
RESET ROLE;

-- ── Grant matrix ───────────────────────────────────────────────────
SELECT ok(
  has_function_privilege(
    'cairn_admin', 'admin.delete_account_as(uuid, text)', 'EXECUTE'
  ),
  'cairn_admin HAS EXECUTE on delete_account_as'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated', 'admin.delete_account_as(uuid, text)', 'EXECUTE'
  ),
  'authenticated has NO EXECUTE on delete_account_as'
);
SELECT ok(
  NOT has_function_privilege(
    'anon', 'admin.delete_account_as(uuid, text)', 'EXECUTE'
  ),
  'anon has NO EXECUTE on delete_account_as'
);
SELECT ok(
  NOT has_function_privilege(
    'cairn_readonly', 'admin.delete_account_as(uuid, text)', 'EXECUTE'
  ),
  'cairn_readonly has NO EXECUTE on delete_account_as (no write escalation)'
);

SELECT finish();

ROLLBACK;
