-- constraints_lists.sql — locks in the CHECK constraints on
-- `public.lists` from docs/data-model.md → `lists`:
--   * name        text not null check (length(name) between 1 and 200)
--   * description text check (description is null
--                            or length(description) <= 2000)
--
-- Coverage:
--   - name length 1 (lower bound) and 200 (upper bound) accepted
--   - name length 201 rejected with SQLSTATE 23514
--   - empty name rejected with SQLSTATE 23514
--   - description length 2000 (upper bound) accepted
--   - description length 2001 rejected with SQLSTATE 23514
--   - **NULL description accepted** — load-bearing companion that
--     locks in the `description IS NULL OR …` half of the CHECK.
--     Without this assertion, a regression that drops the `IS NULL OR`
--     branch would silently make `description` effectively NOT NULL
--     and pass the rest of this row green.
--
-- JWT claims must be set before any INSERT into `public.lists` —
-- `tg_set_attribution_lists` writes `new.created_by := public.uid()`,
-- and a NULL there fails the column's NOT NULL constraint instead of
-- the CHECK we're exercising. The fixture's claim is reused here.
-- INSERTs run as the test session's `cairn` superuser (table omits
-- the INSERT grant); RLS coverage lives in rls_lists.sql.

BEGIN;

SELECT plan(7);

\i /db/tests/fixtures/users_alice_bob_carol.sql

-- `set_config(name, value, is_local := TRUE)` is the function form
-- of `SET LOCAL`; the SET-statement form trips sqlfluff's postgres
-- parser on dotted parameter names like `request.jwt.claims`.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);

-- name length 1 (lower bound) accepted ----------------------------
SELECT lives_ok(
  $$INSERT INTO public.lists (name) VALUES ('x')$$,
  'name length 1 accepted'
);

-- name length 200 (upper bound) accepted --------------------------
SELECT lives_ok(
  $$INSERT INTO public.lists (name) VALUES (repeat('a', 200))$$,
  'name length 200 accepted'
);

-- name length 201 rejected ----------------------------------------
SELECT throws_ok(
  $$INSERT INTO public.lists (name) VALUES (repeat('a', 201))$$,
  '23514',
  NULL,
  'name length 201 rejected with SQLSTATE 23514'
);

-- empty name rejected ---------------------------------------------
SELECT throws_ok(
  $$INSERT INTO public.lists (name) VALUES ('')$$,
  '23514',
  NULL,
  'empty name rejected with SQLSTATE 23514'
);

-- NULL description accepted (load-bearing) ------------------------
SELECT lives_ok(
  $$INSERT INTO public.lists (name, description)
    VALUES ('with null description', NULL)$$,
  'NULL description accepted (locks in `description IS NULL OR …`)'
);

-- description length 2000 (upper bound) accepted ------------------
SELECT lives_ok(
  $$INSERT INTO public.lists (name, description)
    VALUES ('with 2000-char description', repeat('a', 2000))$$,
  'description length 2000 accepted'
);

-- description length 2001 rejected --------------------------------
SELECT throws_ok(
  $$INSERT INTO public.lists (name, description)
    VALUES ('with 2001-char description', repeat('a', 2001))$$,
  '23514',
  NULL,
  'description length 2001 rejected with SQLSTATE 23514'
);

SELECT finish();

ROLLBACK;
