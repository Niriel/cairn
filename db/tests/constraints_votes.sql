-- constraints_votes.sql — locks in the constraint and timestamp
-- semantics of `public.votes` from docs/data-model.md → `votes`:
--   * value smallint not null check (value between -3 and 3 and value <> 0)
--   * primary key (item_id, user_id)
--
-- "No vote" is represented by the absence of a row (the UI's neutral
-- `=` state) — never by a stored zero. The CHECK rejects zero so the
-- absence-of-row invariant is structural, not a client-side promise.
--
-- Coverage:
--   - value = -3 and value = 3 (range bounds) accepted
--   - value = -4 and value = 4 (out of range) rejected (23514)
--   - value = 0 rejected (23514) — "no vote" = no row, locked in
--   - duplicate (item_id, user_id) rejected (23505) — one row per pair
--   - `created_at` unchanged by re-vote — load-bearing for the
--     doc's "first vote" semantic; the PostgREST re-vote flow is
--     `INSERT … ON CONFLICT … DO UPDATE`, which exercises both
--     `tg_set_timestamps` (freezes `created_at` on UPDATE) and
--     `tg_set_modified_at` (bumps `modified_at` on a value change).
--   - `modified_at` strictly greater than the captured original
--     after re-vote — locks in the bump half of the merge-duplicates
--     contract. The generic timestamp-trigger behaviour across all
--     tables lives in `triggers_set_timestamps.sql`, not duplicated
--     here.
--
-- Runs under the test session's `cairn` superuser; RLS coverage
-- lives in rls_votes.sql.

BEGIN;

SELECT plan(8);

\i /db/tests/fixtures/list_solo_alice.sql

-- Items don't yet exist as a fixture (none of the other Phase B
-- tests need a multi-item shape), so seed a single item directly.
INSERT INTO public.items (id, list_id, name) VALUES (
  '33333333-3333-3333-3333-333333333333',
  '22222222-2222-2222-2222-222222222222',
  'A movie'
);

-- Range bounds: -3 and 3 accepted ---------------------------------
SELECT lives_ok(
  $$INSERT INTO public.votes (item_id, user_id, value) VALUES
    ('33333333-3333-3333-3333-333333333333',
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     -3)$$,
  'value = -3 (lower bound) accepted'
);

SELECT lives_ok(
  $$INSERT INTO public.votes (item_id, user_id, value) VALUES
    ('33333333-3333-3333-3333-333333333333',
     'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
     3)$$,
  'value = 3 (upper bound) accepted'
);

-- Out of range: -4 and 4 rejected ---------------------------------
SELECT throws_ok(
  $$INSERT INTO public.votes (item_id, user_id, value) VALUES
    ('33333333-3333-3333-3333-333333333333',
     'cccccccc-cccc-cccc-cccc-cccccccccccc',
     -4)$$,
  '23514',
  NULL,
  'value = -4 rejected with SQLSTATE 23514'
);

SELECT throws_ok(
  $$INSERT INTO public.votes (item_id, user_id, value) VALUES
    ('33333333-3333-3333-3333-333333333333',
     'cccccccc-cccc-cccc-cccc-cccccccccccc',
     4)$$,
  '23514',
  NULL,
  'value = 4 rejected with SQLSTATE 23514'
);

-- "No vote" = no row: zero rejected -------------------------------
SELECT throws_ok(
  $$INSERT INTO public.votes (item_id, user_id, value) VALUES
    ('33333333-3333-3333-3333-333333333333',
     'cccccccc-cccc-cccc-cccc-cccccccccccc',
     0)$$,
  '23514',
  NULL,
  'value = 0 rejected with SQLSTATE 23514 (no-vote = no row)'
);

-- PK uniqueness: (item_id, user_id) is one row per pair. Alice
-- already has a row (value = -3 from the lives_ok above), so a
-- second plain INSERT with the same pair must raise unique_violation.
SELECT throws_ok(
  $$INSERT INTO public.votes (item_id, user_id, value) VALUES
    ('33333333-3333-3333-3333-333333333333',
     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
     2)$$,
  '23505',
  NULL,
  'duplicate (item_id, user_id) rejected with SQLSTATE 23505'
);

-- Re-vote semantics. Insert Carol's initial vote, capture its
-- timestamps into a temp table, then merge-duplicates re-vote and
-- compare. Temp tables are session-scoped but DDL is transactional,
-- so the surrounding ROLLBACK takes the table with it.
INSERT INTO public.votes (item_id, user_id, value) VALUES (
  '33333333-3333-3333-3333-333333333333',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  1
);

CREATE TEMPORARY TABLE _vote_capture AS
SELECT
  v.created_at,
  v.modified_at
FROM public.votes AS v
WHERE
  v.item_id = '33333333-3333-3333-3333-333333333333'
  AND v.user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

INSERT INTO public.votes (item_id, user_id, value) VALUES (
  '33333333-3333-3333-3333-333333333333',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  -2
)
ON CONFLICT (item_id, user_id) DO UPDATE SET value = excluded.value;

SELECT is(
  (
    SELECT v.created_at FROM public.votes AS v
    WHERE
      v.item_id = '33333333-3333-3333-3333-333333333333'
      AND v.user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  ),
  (SELECT c.created_at FROM _vote_capture AS c),
  'created_at unchanged by re-vote'
);

SELECT ok(
  (
    SELECT v.modified_at FROM public.votes AS v
    WHERE
      v.item_id = '33333333-3333-3333-3333-333333333333'
      AND v.user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  )
  > (SELECT c.modified_at FROM _vote_capture AS c),
  'modified_at strictly greater than captured original after re-vote'
);

SELECT finish();

ROLLBACK;
