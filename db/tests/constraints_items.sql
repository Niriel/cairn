-- constraints_items.sql — locks in the CHECK constraints on
-- `public.items` from docs/data-model.md → `items`:
--   * name text not null check (length(name) between 1 and 500)
--
-- Coverage:
--   - name length 1 (lower bound) and 500 (upper bound) accepted
--   - name length 501 rejected with SQLSTATE 23514
--   - empty name rejected with SQLSTATE 23514
--
-- The 500-char ceiling is wider than `lists.name`'s 200 because item
-- names are routinely long-form ("Pirates of the Caribbean: Dead
-- Man's Chest (2006)") while list titles are short.
--
-- The `notes` column has no length constraint and isn't tested here.
--
-- INSERTs use the solo-list fixture (Alice owns `22222222-…`) so
-- there is a valid `list_id` for the FK. JWT claims are set by the
-- fixture to Alice so `tg_set_attribution_items` can stamp
-- `created_by`/`modified_by` without tripping the NOT NULL. Runs
-- under cairn (table omits the INSERT grant); RLS coverage lives in
-- rls_items.sql.

BEGIN;

SELECT plan(4);

\i /db/tests/fixtures/list_solo_alice.sql

-- name length 1 (lower bound) accepted ----------------------------
SELECT lives_ok(
  $$INSERT INTO public.items (list_id, name) VALUES
    ('22222222-2222-2222-2222-222222222222', 'x')$$,
  'name length 1 accepted'
);

-- name length 500 (upper bound) accepted --------------------------
SELECT lives_ok(
  $$INSERT INTO public.items (list_id, name) VALUES
    ('22222222-2222-2222-2222-222222222222', repeat('a', 500))$$,
  'name length 500 accepted'
);

-- name length 501 rejected ----------------------------------------
SELECT throws_ok(
  $$INSERT INTO public.items (list_id, name) VALUES
    ('22222222-2222-2222-2222-222222222222', repeat('a', 501))$$,
  '23514',
  NULL,
  'name length 501 rejected with SQLSTATE 23514'
);

-- empty name rejected ---------------------------------------------
SELECT throws_ok(
  $$INSERT INTO public.items (list_id, name) VALUES
    ('22222222-2222-2222-2222-222222222222', '')$$,
  '23514',
  NULL,
  'empty name rejected with SQLSTATE 23514'
);

SELECT finish();

ROLLBACK;
