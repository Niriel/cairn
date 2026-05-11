-- fk_set_default.sql — locks in the seven attribution FKs that use
-- `ON DELETE SET DEFAULT` with the tombstone UUID as DEFAULT
-- (lists.{created_by,deleted_by}, items.{created_by,modified_by,
-- deleted_by}, list_members.{created_by,deleted_by}).
--
-- The whole mechanism is load-bearing for `delete_account()`:
-- without `SET DEFAULT` repointing attribution to the tombstone,
-- deleting a user leaves every row that ever attributed to them
-- as a dangling FK. Each leg gets one assertion so a regression
-- in any single one surfaces independently.
--
-- ## Seed shape notes (see TASKS.md → B.2 → Decisions)
--
-- * **`list_members` legs**: cross-actor seed mandatory. The row
--   under test must have `user_id <> alice` (we use Bob), because
--   the `list_members.user_id` CASCADE on auth.users delete runs
--   *before* `SET DEFAULT` on the attribution legs — Alice-creates-
--   her-own-membership would silently vanish via cascade and the
--   assertion would read 0 rows. The fixture already creates Bob's
--   row under Alice's claims, so created_by leg is pre-seeded.
-- * **Three `deleted_by` legs**: row must already have
--   `deleted_by = alice_uid` *before* the test deletes Alice — the
--   ELSE branch of the attribution trigger only fills `deleted_by`
--   when `deleted_at` transitions null→non-null. So soft-delete the
--   row first under Alice's claims so the trigger fills it.
-- * **`items.modified_by` leg**: `modified_by = alice_uid` (not
--   Bob's). The cascade for `items.modified_by` only fires on
--   rows where `modified_by = the-deleted-user` at cascade-start;
--   cross-user seed would leave that cascade with no candidate row.
--   (Cross-user shape is the *other* property — "cascade for
--   created_by leaves modified_by alone when modified_by points at
--   a non-deleted user" — and lives in `triggers_set_attribution.sql`.)
--
-- Tombstone literal kept inline rather than a CTE constant to keep
-- each assertion self-explanatory in pg_prove output.

BEGIN;

SELECT plan(7);

\i /db/tests/fixtures/list_shared_alice_bob.sql

-- The fixture set claims to Alice and inserted: shared list
-- 11111111-… (created_by = Alice via trigger), Alice's own
-- list_members row, Bob's list_members row (created_by = Alice).
-- That covers two seed legs already: `lists.created_by` and
-- `list_members.created_by` (Bob's row).

-- Items: Alice creates one live, one soft-deleted.
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

-- Soft-delete the shared list itself so lists.deleted_by lands at
-- Alice. The trigger picks `deleted_by = public.uid()` on the
-- null→non-null transition.
UPDATE public.lists
SET deleted_at = now()
WHERE id = '11111111-1111-1111-1111-111111111111';

-- Soft-remove Bob's membership so list_members.deleted_by lands
-- at Alice for Bob's row.
UPDATE public.list_members
SET deleted_at = now()
WHERE
  list_id = '11111111-1111-1111-1111-111111111111'
  AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- All seven candidate rows now have Alice in the relevant
-- attribution column. Pull the trigger.
DELETE FROM auth.users
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- 1. lists.created_by --------------------------------------------
SELECT is(
  (
    SELECT created_by FROM public.lists
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  '00000000-0000-0000-0000-000000000000'::uuid,
  'lists.created_by SET DEFAULT repoints to tombstone after creator delete'
);

-- 2. lists.deleted_by --------------------------------------------
SELECT is(
  (
    SELECT deleted_by FROM public.lists
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  '00000000-0000-0000-0000-000000000000'::uuid,
  'lists.deleted_by SET DEFAULT repoints to tombstone after deleter delete'
);

-- 3. items.created_by --------------------------------------------
SELECT is(
  (
    SELECT created_by FROM public.items
    WHERE id = '33333333-3333-3333-3333-333333333333'
  ),
  '00000000-0000-0000-0000-000000000000'::uuid,
  'items.created_by SET DEFAULT repoints to tombstone after creator delete'
);

-- 4. items.modified_by -------------------------------------------
SELECT is(
  (
    SELECT modified_by FROM public.items
    WHERE id = '33333333-3333-3333-3333-333333333333'
  ),
  '00000000-0000-0000-0000-000000000000'::uuid,
  'items.modified_by SET DEFAULT repoints to tombstone after modifier delete'
);

-- 5. items.deleted_by --------------------------------------------
SELECT is(
  (
    SELECT deleted_by FROM public.items
    WHERE id = '44444444-4444-4444-4444-444444444444'
  ),
  '00000000-0000-0000-0000-000000000000'::uuid,
  'items.deleted_by SET DEFAULT repoints to tombstone after deleter delete'
);

-- 6. list_members.created_by -------------------------------------
-- Bob's row (cross-actor): user_id is Bob, created_by was Alice.
SELECT is(
  (
    SELECT created_by FROM public.list_members
    WHERE
      list_id = '11111111-1111-1111-1111-111111111111'
      AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  '00000000-0000-0000-0000-000000000000'::uuid,
  'list_members.created_by SET DEFAULT repoints to tombstone '
  '(cross-actor seed: Bob''s row, Alice was creator)'
);

-- 7. list_members.deleted_by -------------------------------------
-- Same row: deleted_by was Alice via the soft-remove above.
SELECT is(
  (
    SELECT deleted_by FROM public.list_members
    WHERE
      list_id = '11111111-1111-1111-1111-111111111111'
      AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  '00000000-0000-0000-0000-000000000000'::uuid,
  'list_members.deleted_by SET DEFAULT repoints to tombstone '
  '(cross-actor seed: Bob''s row, Alice was the kicker)'
);

SELECT finish();

ROLLBACK;
