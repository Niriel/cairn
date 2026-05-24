-- list_metadata.sql — tests for the list metadata infrastructure
-- added by migration 0005:
--   (a) lists_item_count() returns correct count for a list with items
--   (b) lists_item_count() excludes soft-deleted items
--   (c) FK constraint fk_list_members_profile exists on list_members

BEGIN;

SELECT plan(3);

\i /db/tests/fixtures/list_solo_alice.sql

-- Seed two non-deleted items on Alice's solo list.
INSERT INTO public.items (id, list_id, name) VALUES
(
  'a0000000-0000-0000-0000-000000000001',
  '22222222-2222-2222-2222-222222222222',
  'First item'
),
(
  'a0000000-0000-0000-0000-000000000002',
  '22222222-2222-2222-2222-222222222222',
  'Second item'
);

-- (a) count returns 2 for a list with two active items ---------------
SELECT is(
  (
    SELECT public.lists_item_count(l) -- noqa: RF03
    FROM public.lists AS l
    WHERE l.id = '22222222-2222-2222-2222-222222222222' -- noqa: RF03
  ),
  2::bigint,
  'lists_item_count returns 2 for a list with two active items'
);

-- (b) soft-delete one item; count should drop to 1 ------------------
UPDATE public.items
SET deleted_at = now()
WHERE id = 'a0000000-0000-0000-0000-000000000001';

SELECT is(
  (
    SELECT public.lists_item_count(l) -- noqa: RF03
    FROM public.lists AS l
    WHERE l.id = '22222222-2222-2222-2222-222222222222' -- noqa: RF03
  ),
  1::bigint,
  'lists_item_count excludes soft-deleted items'
);

-- (c) FK constraint from list_members.user_id to profiles.id exists -
SELECT fk_ok(
  'public', 'list_members', 'user_id',
  'public', 'profiles', 'id',
  'list_members.user_id has FK to public.profiles.id'
);

SELECT finish();

ROLLBACK;
