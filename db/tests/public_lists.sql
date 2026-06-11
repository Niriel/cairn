-- public_lists.sql — locks in the anonymous read path for public
-- lists: the `public.public_list_view(uuid)` SECURITY DEFINER RPC,
-- which is the *only* thing `anon` may touch.
--
-- The RPC returns a curated jsonb snapshot — id/name/description plus
-- a score-ranked `items` array (id/name/notes/score) — and SQL NULL
-- for any list that is private, soft-deleted, or unknown. The NULL is
-- the security boundary: private, deleted, and missing all collapse to
-- the same indistinguishable result. The payload carries no members,
-- no votes/tallies, and no attribution by construction.
--
-- All assertions run as the `anon` role with empty JWT claims, so the
-- EXECUTE grant and the SECURITY DEFINER score read are both exercised
-- the way a signed-out request actually hits them.
--
-- The member-toggle write path reuses the existing lists_update
-- policy (`is_list_member(id)`) — no new policy or grant — so a member
-- may flip is_public and a non-member's UPDATE matches zero rows.
--
-- 16 assertions:
--   1.  public list returns a non-null object.
--   2.  name is exposed.
--   3.  description is exposed.
--   4.  items length = 2 (the soft-deleted item is excluded).
--   5.  items[0] is the top-scored item (name).
--   6.  items[0].score is present and correct (4 — definer reads
--       items_ranked despite anon's own RLS).
--   7.  items[1] is the runner-up (score-desc ordering).
--   8.  items[1].score correct (1).
--   9.  no top-level `created_by` key (no attribution).
--   10. no item-level `created_by` key (no attribution).
--   11. no item-level `positive_voters` key (no vote tallies).
--   12. a PRIVATE list returns NULL.
--   13. an UNKNOWN uuid returns NULL.
--   14. a SOFT-DELETED public list returns NULL.
--   15. a member may publish a list (UPDATE SET is_public lands).
--   16. a non-member's publish UPDATE matches zero rows.

BEGIN;

SELECT plan(16);

\i /db/tests/fixtures/lists_public_private.sql

-- ===================================================================
-- Become `anon` with empty claims — exactly the signed-out shape.
-- ===================================================================
SELECT set_config('request.jwt.claims', '', TRUE);
SET LOCAL ROLE anon;

-- 1. Public list resolves to a non-null object.
SELECT isnt(
  public.public_list_view('0a000000-0000-0000-0000-000000000001'),
  NULL,
  'public_list_view: public list returns a non-null object'
);

-- 2. name.
SELECT is(
  public.public_list_view('0a000000-0000-0000-0000-000000000001') ->> 'name',
  'Public picks',
  'public_list_view: exposes the list name'
);

-- 3. description.
SELECT is(
  public.public_list_view('0a000000-0000-0000-0000-000000000001')
  ->> 'description',
  'A list anyone with the link can read.',
  'public_list_view: exposes the list description'
);

-- 4. items length = 2 — the soft-deleted item (0b…0003) is absent.
SELECT is(
  jsonb_array_length(
    public.public_list_view('0a000000-0000-0000-0000-000000000001')
    -> 'items'
  ),
  2,
  'public_list_view: soft-deleted items are excluded (2 of 3 remain)'
);

-- 5. items[0] is the top-scored item.
SELECT is(
  public.public_list_view('0a000000-0000-0000-0000-000000000001')
  -> 'items' -> 0 ->> 'name',
  'Top pick',
  'public_list_view: items ordered by score desc (Top pick first)'
);

-- 6. items[0].score present and correct (alice +3 + bob +1 = 4).
SELECT is(
  (
    public.public_list_view('0a000000-0000-0000-0000-000000000001')
    -> 'items' -> 0 ->> 'score'
  )::int,
  4,
  'public_list_view: score is present and read from items_ranked (4)'
);

-- 7. items[1] is the runner-up (score-desc ordering holds).
SELECT is(
  public.public_list_view('0a000000-0000-0000-0000-000000000001')
  -> 'items' -> 1 ->> 'name',
  'Runner up',
  'public_list_view: second item is the runner-up'
);

-- 8. items[1].score = 1.
SELECT is(
  (
    public.public_list_view('0a000000-0000-0000-0000-000000000001')
    -> 'items' -> 1 ->> 'score'
  )::int,
  1,
  'public_list_view: runner-up score correct (1)'
);

-- 9. No top-level attribution key.
SELECT ok(
  NOT (
    public.public_list_view('0a000000-0000-0000-0000-000000000001')
    ? 'created_by'
  ),
  'public_list_view: payload carries no top-level created_by'
);

-- 10. No item-level attribution key.
SELECT ok(
  NOT (
    public.public_list_view('0a000000-0000-0000-0000-000000000001')
    -> 'items' -> 0 ? 'created_by'
  ),
  'public_list_view: items carry no created_by'
);

-- 11. No item-level vote-tally key.
SELECT ok(
  NOT (
    public.public_list_view('0a000000-0000-0000-0000-000000000001')
    -> 'items' -> 0 ? 'positive_voters'
  ),
  'public_list_view: items carry no vote tallies'
);

-- 12. A private list is indistinguishable from missing → NULL.
SELECT is(
  public.public_list_view('0a000000-0000-0000-0000-000000000002'),
  NULL,
  'public_list_view: a private list returns NULL'
);

-- 13. An unknown uuid → NULL.
SELECT is(
  public.public_list_view('0c000000-0000-0000-0000-0000000000ff'),
  NULL,
  'public_list_view: an unknown id returns NULL'
);

-- 14. A soft-deleted public list → NULL. Drop back to the session
-- superuser to soft-delete (anon cannot write), then re-assert as anon.
RESET ROLE;
UPDATE public.lists
SET deleted_at = now()
WHERE id = '0a000000-0000-0000-0000-000000000001';
SET LOCAL ROLE anon;

SELECT is(
  public.public_list_view('0a000000-0000-0000-0000-000000000001'),
  NULL,
  'public_list_view: a soft-deleted public list returns NULL'
);

-- ===================================================================
-- Member-toggle write path. The private list 0a…0002 starts
-- is_public = false; Alice is a member, Carol is not. No new policy
-- backs this — lists_update (`is_list_member(id)`) is the gate.
-- ===================================================================

-- 15. Member (Alice) publishes the private list. Read the stored
-- value back under the session superuser (RESET ROLE bypasses RLS) so
-- the assertion sees the real row, not an RLS-filtered view.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
UPDATE public.lists
SET is_public = TRUE
WHERE id = '0a000000-0000-0000-0000-000000000002';
RESET ROLE;
SELECT is(
  (
    SELECT is_public FROM public.lists
    WHERE id = '0a000000-0000-0000-0000-000000000002'
  ),
  TRUE,
  'lists is_public toggle: member (Alice) can publish'
);

-- 16. Non-member (Carol) cannot. Her UPDATE matches zero rows
-- (lists_update hides the row), so is_public stays TRUE.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}',
  TRUE
);
SET LOCAL ROLE authenticated;
UPDATE public.lists
SET is_public = FALSE
WHERE id = '0a000000-0000-0000-0000-000000000002';
RESET ROLE;
SELECT is(
  (
    SELECT is_public FROM public.lists
    WHERE id = '0a000000-0000-0000-0000-000000000002'
  ),
  TRUE,
  'lists is_public toggle: non-member (Carol) UPDATE matches zero rows'
);

SELECT finish();

ROLLBACK;
