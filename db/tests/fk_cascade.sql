-- fk_cascade.sql — locks in the seven CASCADE FK legs from
-- docs/data-model.md's table blocks. One assertion per leg so a
-- regression in any single one surfaces independently.
--
-- The (a)–(d) legs are tested by deleting from `auth.users`
-- directly under the test session (cairn-superuser owns the
-- bootstrap-stub `auth.users`, so a plain DELETE works without
-- delete_account()). The (e)–(g) legs are tested by DELETE on
-- `lists` or `items`.
--
-- The user_settings leg (b) is load-bearing for delete_account():
-- without the cascade, deleting an account leaves an orphan
-- settings row in a table whose RLS would never let anyone read
-- it again — invisible cruft accumulating forever.

BEGIN;

SELECT plan(7);

\i /db/tests/fixtures/list_shared_alice_bob.sql

-- Seed a vote so leg (d) and leg (g) have a row to observe. Use
-- Carol so vote-cascade tests don't tangle with Alice's
-- list-creator role. Carol isn't a member of the shared list, but
-- cairn-as-test-session bypasses RLS, and the FK only requires
-- the item and user to exist.
INSERT INTO public.items (id, list_id, name) VALUES
(
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'A movie'
);

INSERT INTO public.votes (item_id, user_id, value) VALUES
(
  '33333333-3333-3333-3333-333333333333',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  1
);

-- (a) profiles.id cascades on auth.users delete -------------------
-- tg_profile_on_signup created profile rows for Alice/Bob/Carol
-- when the users fixture inserted them.
DELETE FROM auth.users
WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

SELECT is(
  (
    SELECT count(*)::int FROM public.profiles
    WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  ),
  0,
  'profiles.id CASCADE deletes Carol''s profile row'
);

-- (b) user_settings.id cascades on auth.users delete -------------
-- The same DELETE above also removed Carol's user_settings row.
SELECT is(
  (
    SELECT count(*)::int FROM public.user_settings
    WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  ),
  0,
  'user_settings.id CASCADE deletes Carol''s settings row '
  '(load-bearing for delete_account)'
);

-- (d) votes.user_id cascades on auth.users delete ----------------
-- Carol's vote row should have vanished with Carol. Tested ahead
-- of (c) because (c) requires a separate user (Bob) and the same
-- cascade fired for Carol already covers (d).
SELECT is(
  (
    SELECT count(*)::int FROM public.votes
    WHERE user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  ),
  0,
  'votes.user_id CASCADE deletes Carol''s vote row'
);

-- (c) list_members.user_id cascades on auth.users delete ---------
-- Bob is on the shared list. Deleting Bob should drop his row.
DELETE FROM auth.users
WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

SELECT is(
  (
    SELECT count(*)::int FROM public.list_members
    WHERE user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  0,
  'list_members.user_id CASCADE deletes Bob''s membership row'
);

-- (f) list_members.list_id cascades on lists delete --------------
-- Deleting the shared list should drop Alice's remaining
-- membership row.
DELETE FROM public.lists
WHERE id = '11111111-1111-1111-1111-111111111111';

SELECT is(
  (
    SELECT count(*)::int FROM public.list_members
    WHERE list_id = '11111111-1111-1111-1111-111111111111'
  ),
  0,
  'list_members.list_id CASCADE deletes the shared list''s members'
);

-- (e) items.list_id cascades on lists delete ---------------------
-- The same DELETE above also took the items belonging to that
-- list — confirm.
SELECT is(
  (
    SELECT count(*)::int FROM public.items
    WHERE list_id = '11111111-1111-1111-1111-111111111111'
  ),
  0,
  'items.list_id CASCADE deletes items in the deleted list'
);

-- (g) votes.item_id cascades on items delete ---------------------
-- Re-seed a fresh item-and-vote pair (the previous ones are gone
-- via cascade above), then delete the item.
INSERT INTO public.lists (id, name) VALUES
('44444444-4444-4444-4444-444444444444', 'Refill list');

INSERT INTO public.list_members (list_id, user_id) VALUES
(
  '44444444-4444-4444-4444-444444444444',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);

INSERT INTO public.items (id, list_id, name) VALUES
(
  '55555555-5555-5555-5555-555555555555',
  '44444444-4444-4444-4444-444444444444',
  'Another movie'
);

INSERT INTO public.votes (item_id, user_id, value) VALUES
(
  '55555555-5555-5555-5555-555555555555',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  2
);

DELETE FROM public.items
WHERE id = '55555555-5555-5555-5555-555555555555';

SELECT is(
  (
    SELECT count(*)::int FROM public.votes
    WHERE item_id = '55555555-5555-5555-5555-555555555555'
  ),
  0,
  'votes.item_id CASCADE deletes votes when the item is hard-deleted'
);

SELECT finish();

ROLLBACK;
