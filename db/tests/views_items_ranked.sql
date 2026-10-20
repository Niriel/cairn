-- views_items_ranked.sql — locks in the per-list ranked view the
-- web app's main UI surface queries (`GET /items_ranked?list_id=
-- eq.<uuid>&order=name.asc,created_at.asc`).
--
-- The view is `security_invoker = true`, so RLS inheritance from
-- `items_select` + `votes_select` is the authorisation gate; the
-- view body itself only does the aggregation and a defensive
-- `WHERE i.deleted_at IS NULL` (the items_select policy filters
-- the same column, so the WHERE is belt-and-braces).
--
-- 7 assertions:
--   1. score = sum of vote values (alice +3, bob -1 → 2).
--   2. positive_voters count (1 — only Alice).
--   3. negative_voters count (1 — only Bob).
--   4. total_voters count (2).
--   5. no-votes item has score = 0 (LEFT JOIN + coalesce).
--   6. soft-deleted item absent (defence-in-depth filter).
--   7. non-member sees nothing (RLS inheritance via security_invoker).

BEGIN;

SELECT plan(7);

\i /db/tests/fixtures/list_shared_alice_bob.sql

-- Three items in the shared list:
--   3333 — live, will receive votes from alice (+3) and bob (-1).
--   4444 — live, no votes.
--   5555 — soft-deleted.
INSERT INTO public.items (id, list_id, name) VALUES
(
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'With votes'
);
INSERT INTO public.items (id, list_id, name) VALUES
(
  '44444444-4444-4444-4444-444444444444',
  '11111111-1111-1111-1111-111111111111',
  'No votes'
);
INSERT INTO public.items (id, list_id, name) VALUES
(
  '55555555-5555-5555-5555-555555555555',
  '11111111-1111-1111-1111-111111111111',
  'Soft-deleted'
);

UPDATE public.items
SET deleted_at = now()
WHERE id = '55555555-5555-5555-5555-555555555555';

-- Votes on 3333 (votes have no attribution trigger; user_id is
-- the vote owner directly).
INSERT INTO public.votes (item_id, user_id, value) VALUES
(
  '33333333-3333-3333-3333-333333333333',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  3
);
INSERT INTO public.votes (item_id, user_id, value) VALUES
(
  '33333333-3333-3333-3333-333333333333',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  -1
);

-- ===================================================================
-- Read the view as authenticated + Alice's claims so RLS
-- inheritance is actually exercised (cairn would bypass and the
-- non-member negative below would silently pass for the wrong
-- reason).
-- ===================================================================
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

-- 1. score = +3 + -1 = 2.
SELECT is(
  (
    SELECT score FROM public.items_ranked
    WHERE id = '33333333-3333-3333-3333-333333333333'
  ),
  2,
  'items_ranked: score = sum of vote values (alice +3 + bob -1)'
);

-- 2. positive_voters = 1 (Alice).
SELECT is(
  (
    SELECT positive_voters FROM public.items_ranked
    WHERE id = '33333333-3333-3333-3333-333333333333'
  ),
  1,
  'items_ranked: positive_voters counts only value > 0 (Alice)'
);

-- 3. negative_voters = 1 (Bob).
SELECT is(
  (
    SELECT negative_voters FROM public.items_ranked
    WHERE id = '33333333-3333-3333-3333-333333333333'
  ),
  1,
  'items_ranked: negative_voters counts only value < 0 (Bob)'
);

-- 4. total_voters = 2.
SELECT is(
  (
    SELECT total_voters FROM public.items_ranked
    WHERE id = '33333333-3333-3333-3333-333333333333'
  ),
  2,
  'items_ranked: total_voters counts both ±'
);

-- 5. no-votes item: LEFT JOIN + coalesce(..., 0) yields score 0.
SELECT is(
  (
    SELECT score FROM public.items_ranked
    WHERE id = '44444444-4444-4444-4444-444444444444'
  ),
  0,
  'items_ranked: no-votes item has score = 0 (LEFT JOIN + coalesce)'
);

-- 6. Soft-deleted item is absent from the view. items_select's
-- `deleted_at IS NULL` clause and the view body's matching WHERE
-- both contribute; either alone would suffice.
SELECT is(
  (
    SELECT count(*)::int FROM public.items_ranked
    WHERE id = '55555555-5555-5555-5555-555555555555'
  ),
  0,
  'items_ranked: soft-deleted item is hidden from the view'
);

-- 7. Non-member sees nothing. Switch to Carol (not a member of
-- 1111). RLS on items via security_invoker = true filters every
-- row out before aggregation.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}',
  TRUE
);
SELECT is(
  (
    SELECT count(*)::int FROM public.items_ranked
    WHERE list_id = '11111111-1111-1111-1111-111111111111'
  ),
  0,
  'items_ranked: non-member (Carol) sees nothing '
  '(security_invoker = true)'
);

SELECT finish();

ROLLBACK;
