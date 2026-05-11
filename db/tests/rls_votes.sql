-- rls_votes.sql — locks in the `votes_*` policies, including the
-- load-bearing soft-deleted-item visibility property that hangs
-- on the `public.is_items_list_member` SECURITY DEFINER helper
-- (Risk #14: an inline EXISTS would inherit `items_select`'s
-- `deleted_at IS NULL` filter via Postgres's recursive RLS, and
-- historical votes on soft-deleted items would silently
-- disappear from the trash UI).
--
-- 12 assertions:
--   1. SELECT positive (member sees vote on a *live* item).
--   2. SELECT negative (non-member sees nothing).
--   3. SELECT positive (member sees vote on a *soft-deleted*
--      item) — load-bearing for Risk #14.
--   4. INSERT positive (member casts own vote on a live item).
--   5. INSERT negative (user_id ≠ public.uid()) — votes_insert's
--      `user_id = public.uid()` clause.
--   6. INSERT negative (non-member) — `is_list_member` fails.
--   7. INSERT negative (member but item is soft-deleted) —
--      `i.deleted_at IS NULL` mirror in votes_insert.
--   8. UPDATE own positive (member changes their own vote).
--   9. UPDATE other negative (cannot change another user's vote).
--  10. UPDATE negative (member, item soft-deleted) — mirror of (7).
--  11. DELETE own positive (retract own vote).
--  12. DELETE other negative (cannot retract another user's vote).

BEGIN;

SELECT plan(12);

\i /db/tests/fixtures/list_shared_alice_bob.sql

-- Three items: 3333 live, 4444 will be soft-deleted, 5555 live
-- and used as a fresh INSERT target.
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

INSERT INTO public.items (id, list_id, name) VALUES
(
  '55555555-5555-5555-5555-555555555555',
  '11111111-1111-1111-1111-111111111111',
  'Fresh INSERT target'
);

-- Seed votes (no attribution trigger on votes, so JWT claims
-- aren't load-bearing for the INSERTs — user_id is the actual
-- vote owner). All under cairn so RLS is bypassed for setup.
INSERT INTO public.votes (item_id, user_id, value) VALUES
(
  '33333333-3333-3333-3333-333333333333',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  1
);
INSERT INTO public.votes (item_id, user_id, value) VALUES
(
  '33333333-3333-3333-3333-333333333333',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  -1
);
INSERT INTO public.votes (item_id, user_id, value) VALUES
(
  '44444444-4444-4444-4444-444444444444',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  2
);

-- Now soft-delete item 4444 so the recursive-RLS scenario is in
-- place (Bob's vote on 4444 must remain visible to Alice).
UPDATE public.items
SET deleted_at = now()
WHERE id = '44444444-4444-4444-4444-444444444444';

-- ===================================================================
-- SELECT positives / negatives
-- ===================================================================

-- 1. Member sees vote on a live item.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT is(
  (
    SELECT count(*)::int FROM public.votes
    WHERE
      item_id = '33333333-3333-3333-3333-333333333333'
      AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  1,
  'votes SELECT positive: Alice (member) sees her vote on a live item'
);

-- 2. Non-member sees nothing.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}',
  TRUE
);
SELECT is(
  (
    SELECT count(*)::int FROM public.votes
    WHERE item_id = '33333333-3333-3333-3333-333333333333'
  ),
  0,
  'votes SELECT negative: non-member (Carol) sees nothing'
);

-- 3. **Load-bearing**: Alice sees Bob's vote on the soft-deleted
-- item 4444. This works only because `votes_select` calls
-- `public.is_items_list_member` (SECURITY DEFINER), which
-- bypasses `items_select`'s recursive `deleted_at IS NULL`
-- filter. An inline EXISTS in the policy would silently fail
-- this assertion. (Risk #14.)
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SELECT is(
  (
    SELECT count(*)::int FROM public.votes
    WHERE
      item_id = '44444444-4444-4444-4444-444444444444'
      AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  1,
  'votes SELECT positive: member sees vote on a SOFT-DELETED item '
  '(load-bearing — Risk #14)'
);

-- ===================================================================
-- INSERT positive / negatives
-- ===================================================================

-- 4. INSERT positive: Alice casts her own vote on item 5555.
INSERT INTO public.votes (item_id, user_id, value) VALUES
(
  '55555555-5555-5555-5555-555555555555',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  3
);
SELECT is(
  (
    SELECT count(*)::int FROM public.votes
    WHERE
      item_id = '55555555-5555-5555-5555-555555555555'
      AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  1,
  'votes INSERT positive: member casts their own vote on a live item'
);

-- 5. INSERT negative: user_id ≠ public.uid(). Alice tries to
-- INSERT a vote with user_id = Bob.
SELECT throws_ok(
  $$INSERT INTO public.votes (item_id, user_id, value) VALUES
    ('55555555-5555-5555-5555-555555555555',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1)$$,
  '42501',
  NULL,
  'votes INSERT negative: user_id != public.uid() raises 42501'
);

-- 6. INSERT negative: non-member Carol. is_list_member fails in
-- the WITH CHECK.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}',
  TRUE
);
SELECT throws_ok(
  $$INSERT INTO public.votes (item_id, user_id, value) VALUES
    ('55555555-5555-5555-5555-555555555555',
     'cccccccc-cccc-cccc-cccc-cccccccccccc', 1)$$,
  '42501',
  NULL,
  'votes INSERT negative: non-member raises 42501 '
  '(is_list_member fails)'
);

-- 7. INSERT negative: member, but item is soft-deleted. The
-- `i.deleted_at IS NULL` clause in votes_insert WITH CHECK
-- catches this. Switch back to Alice (member).
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SELECT throws_ok(
  $$INSERT INTO public.votes (item_id, user_id, value) VALUES
    ('44444444-4444-4444-4444-444444444444',
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1)$$,
  '42501',
  NULL,
  'votes INSERT negative: member cannot vote on a soft-deleted item'
);

-- ===================================================================
-- UPDATE positive / negatives
-- ===================================================================

-- 8. UPDATE own positive: Alice changes her vote on item 3333.
UPDATE public.votes
SET value = -2
WHERE
  item_id = '33333333-3333-3333-3333-333333333333'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (
    SELECT value FROM public.votes
    WHERE
      item_id = '33333333-3333-3333-3333-333333333333'
      AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  -2::smallint,
  'votes UPDATE positive: member updates their own vote'
);

-- 9. UPDATE other negative: Alice tries to flip Bob's vote on
-- the live item. USING `user_id = public.uid()` fails for Bob's
-- row under Alice; 0 rows affected.
UPDATE public.votes
SET value = 3
WHERE
  item_id = '33333333-3333-3333-3333-333333333333'
  AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
RESET ROLE;
SELECT is(
  (
    SELECT value FROM public.votes
    WHERE
      item_id = '33333333-3333-3333-3333-333333333333'
      AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  -1::smallint,
  'votes UPDATE negative: cannot change another user''s vote'
);

-- 10. UPDATE negative: member's own vote on a soft-deleted item.
-- votes_update USING checks `i.deleted_at IS NULL` for the
-- referenced item; 4444 is soft-deleted → 0 rows affected.
-- Bob's vote on 4444 stays at its seeded value of 2.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);
SET LOCAL ROLE authenticated;
UPDATE public.votes
SET value = -3
WHERE
  item_id = '44444444-4444-4444-4444-444444444444'
  AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
RESET ROLE;
SELECT is(
  (
    SELECT value FROM public.votes
    WHERE
      item_id = '44444444-4444-4444-4444-444444444444'
      AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  2::smallint,
  'votes UPDATE negative: member cannot update their own vote on a '
  'soft-deleted item'
);

-- ===================================================================
-- DELETE positive / negative
-- ===================================================================

-- 11. DELETE own positive: Alice retracts her vote on item 3333.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
DELETE FROM public.votes
WHERE
  item_id = '33333333-3333-3333-3333-333333333333'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
RESET ROLE;
SELECT is(
  (
    SELECT count(*)::int FROM public.votes
    WHERE
      item_id = '33333333-3333-3333-3333-333333333333'
      AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  0,
  'votes DELETE positive: member retracts their own vote'
);

-- 12. DELETE other negative: Alice tries to retract Bob's vote.
-- votes_delete USING `user_id = public.uid()` fails; 0 rows.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
DELETE FROM public.votes
WHERE
  item_id = '33333333-3333-3333-3333-333333333333'
  AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
RESET ROLE;
SELECT is(
  (
    SELECT count(*)::int FROM public.votes
    WHERE
      item_id = '33333333-3333-3333-3333-333333333333'
      AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  1,
  'votes DELETE negative: cannot retract another user''s vote'
);

SELECT finish();

ROLLBACK;
