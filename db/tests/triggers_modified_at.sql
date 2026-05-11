-- triggers_modified_at.sql — locks in `tg_set_modified_at`'s
-- "bump on real content change" semantic and the load-bearing
-- *non-bump* paths it must avoid.
--
-- The trigger is bound `BEFORE UPDATE OF (cols)` per table. The
-- column-restricted `OF` clause is deliberate: `ON DELETE SET
-- DEFAULT` cascades fire BEFORE UPDATE triggers, but the cascade
-- only touches attribution columns, so `OF (non-attribution-cols)`
-- means t20 never fires during cascade — `modified_at` stays at
-- its real "last content change" value rather than getting bumped
-- on every row the deleted user ever touched.
--
-- 10 assertions:
--   1–6: bump on the canonical content change per table (one
--        column from each table's OF list).
--   7–9: cascade-skip per attribution-bearing table (load-bearing
--        for Risk #12.b).
--   10:  non-OF positive — UPDATE a column outside the OF list,
--        assert modified_at unchanged. Catches a future migration
--        that accidentally adds an attribution column to the OF
--        list of t20.
--
-- The bump assertions use `cmp_ok(... '>', ...)`. `now()` is
-- transaction-constant, so for these to pass in Phase C the
-- implementation of `tg_set_modified_at` must use
-- `clock_timestamp()` (or `statement_timestamp()`), not bare
-- `now()`. Same constraint flagged in B.1's Notes for
-- constraints_votes.sql's re-vote dance.

BEGIN;

SELECT plan(10);

\i /db/tests/fixtures/list_shared_alice_bob.sql

-- Seed an item and a vote so the items / votes bump tests have
-- rows to work with. Both go in list 1111 (the shared list) so
-- alice can be the modified_by stamp.
INSERT INTO public.items (id, list_id, name) VALUES
(
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'A movie'
);

INSERT INTO public.votes (item_id, user_id, value) VALUES
(
  '33333333-3333-3333-3333-333333333333',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  1
);

-- ===================================================================
-- 1–6: bump on content change (one assertion per table)
-- ===================================================================

-- 1. lists.name -----------------------------------------------------
CREATE TEMPORARY TABLE _b_lists AS
SELECT modified_at FROM public.lists
WHERE id = '11111111-1111-1111-1111-111111111111';

UPDATE public.lists
SET name = 'Shared list renamed'
WHERE id = '11111111-1111-1111-1111-111111111111';

SELECT cmp_ok(
  (
    SELECT modified_at FROM public.lists
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  '>',
  (SELECT b.modified_at FROM _b_lists AS b),
  'lists: UPDATE name bumps modified_at'
);

-- 2. items.name ------------------------------------------------------
CREATE TEMPORARY TABLE _b_items AS
SELECT modified_at FROM public.items
WHERE id = '33333333-3333-3333-3333-333333333333';

UPDATE public.items
SET name = 'A movie, renamed'
WHERE id = '33333333-3333-3333-3333-333333333333';

SELECT cmp_ok(
  (
    SELECT modified_at FROM public.items
    WHERE id = '33333333-3333-3333-3333-333333333333'
  ),
  '>',
  (SELECT b.modified_at FROM _b_items AS b),
  'items: UPDATE name bumps modified_at'
);

-- 3. profiles.display_name ------------------------------------------
CREATE TEMPORARY TABLE _b_profiles AS
SELECT modified_at FROM public.profiles
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

UPDATE public.profiles
SET display_name = 'Alice the Renamed'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT cmp_ok(
  (
    SELECT modified_at FROM public.profiles
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  '>',
  (SELECT b.modified_at FROM _b_profiles AS b),
  'profiles: UPDATE display_name bumps modified_at'
);

-- 4. user_settings.invite_policy ------------------------------------
CREATE TEMPORARY TABLE _b_user_settings AS
SELECT modified_at FROM public.user_settings
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

UPDATE public.user_settings
SET invite_policy = 'circle'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT cmp_ok(
  (
    SELECT modified_at FROM public.user_settings
    WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  '>',
  (SELECT b.modified_at FROM _b_user_settings AS b),
  'user_settings: UPDATE invite_policy bumps modified_at'
);

-- 5. list_members.deleted_at (soft-remove Bob) ----------------------
CREATE TEMPORARY TABLE _b_list_members AS
SELECT modified_at FROM public.list_members
WHERE
  list_id = '11111111-1111-1111-1111-111111111111'
  AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

UPDATE public.list_members
SET deleted_at = now()
WHERE
  list_id = '11111111-1111-1111-1111-111111111111'
  AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

SELECT cmp_ok(
  (
    SELECT modified_at FROM public.list_members
    WHERE
      list_id = '11111111-1111-1111-1111-111111111111'
      AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  '>',
  (SELECT b.modified_at FROM _b_list_members AS b),
  'list_members: UPDATE deleted_at bumps modified_at'
);

-- 6. votes.value ----------------------------------------------------
CREATE TEMPORARY TABLE _b_votes AS
SELECT modified_at FROM public.votes
WHERE
  item_id = '33333333-3333-3333-3333-333333333333'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

UPDATE public.votes
SET value = -1
WHERE
  item_id = '33333333-3333-3333-3333-333333333333'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT cmp_ok(
  (
    SELECT modified_at FROM public.votes
    WHERE
      item_id = '33333333-3333-3333-3333-333333333333'
      AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  '>',
  (SELECT b.modified_at FROM _b_votes AS b),
  'votes: UPDATE value bumps modified_at'
);

-- ===================================================================
-- 7–9: cascade-skip (load-bearing for Risk #12.b)
-- ===================================================================
-- Re-capture modified_at on Alice-attributed rows that will
-- survive the cascade. The lists row (created_by = alice) and
-- items row (created_by = modified_by = alice) survive; the
-- list_members row under test is Bob's row (alice in
-- created_by AND deleted_by after step 5 soft-removed Bob under
-- her claims).

CREATE TEMPORARY TABLE _c_lists AS
SELECT modified_at FROM public.lists
WHERE id = '11111111-1111-1111-1111-111111111111';

CREATE TEMPORARY TABLE _c_items AS
SELECT modified_at FROM public.items
WHERE id = '33333333-3333-3333-3333-333333333333';

CREATE TEMPORARY TABLE _c_list_members AS
SELECT modified_at FROM public.list_members
WHERE
  list_id = '11111111-1111-1111-1111-111111111111'
  AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

DELETE FROM auth.users
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- 7. lists: SET DEFAULT on created_by leaves modified_at unchanged.
-- The cascade UPDATE only touches created_by; t20's OF list is
-- (name, description, deleted_at), so t20 never fires.
SELECT is(
  (
    SELECT modified_at FROM public.lists
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  (SELECT c.modified_at FROM _c_lists AS c),
  'lists cascade-skip: SET DEFAULT on created_by leaves modified_at unchanged'
);

-- 8. items: SET DEFAULT on created_by AND modified_by AND
-- (eventually) deleted_by, each via a separate cascade UPDATE.
-- t20's OF list is (list_id, name, notes, deleted_at); none of
-- the cascades touch those columns, so t20 never fires.
SELECT is(
  (
    SELECT modified_at FROM public.items
    WHERE id = '33333333-3333-3333-3333-333333333333'
  ),
  (SELECT c.modified_at FROM _c_items AS c),
  'items cascade-skip: SET DEFAULT on created_by/modified_by/'
  'deleted_by leaves modified_at unchanged'
);

-- 9. list_members (Bob's row): SET DEFAULT on created_by AND
-- deleted_by, each via a separate cascade UPDATE. t20's OF list
-- is (deleted_at); neither cascade touches it, so t20 never fires.
SELECT is(
  (
    SELECT modified_at FROM public.list_members
    WHERE
      list_id = '11111111-1111-1111-1111-111111111111'
      AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  (SELECT c.modified_at FROM _c_list_members AS c),
  'list_members cascade-skip: SET DEFAULT on created_by/deleted_by '
  'leaves modified_at unchanged (Bob''s row, cross-actor seed)'
);

-- ===================================================================
-- 10: non-OF positive — UPDATE an attribution column directly,
-- assert modified_at unchanged. Locks in the OF-clause
-- restriction. If a future migration accidentally adds an
-- attribution column to t20's OF list, this assertion reds.
-- ===================================================================
CREATE TEMPORARY TABLE _c_non_of AS
SELECT modified_at FROM public.lists
WHERE id = '11111111-1111-1111-1111-111111111111';

-- Attempt to UPDATE created_by directly. The attribution-freeze
-- (t10) reverts the value, and t20 doesn't fire because
-- `created_by` isn't in the lists OF list (name, description,
-- deleted_at). Either way modified_at stays at the captured
-- value; only an OF-list regression would make it bump.
UPDATE public.lists
SET created_by = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
WHERE id = '11111111-1111-1111-1111-111111111111';

SELECT is(
  (
    SELECT modified_at FROM public.lists
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  (SELECT c.modified_at FROM _c_non_of AS c),
  'lists non-OF positive: UPDATE of created_by does not fire t20 '
  '(modified_at unchanged)'
);

SELECT finish();

ROLLBACK;
