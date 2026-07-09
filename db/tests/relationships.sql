-- relationships.sql — locks in the relationships table's four RLS
-- policies, the two circle RPCs (add_circle_by_username,
-- add_circle_by_id), the PK-freeze trigger
-- (tg_freeze_relationships_pk), and the created_at-freeze half of
-- tg_set_timestamps for this table.
--
-- 28 assertions, A–L. See PLAN.md / TASKS.md (plan
-- 0701_relationships) for the per-assertion rationale.
--
-- Cross-scenario cleanup convention: each numbered scenario below
-- mutates public.relationships, and the file-end ROLLBACK only
-- gives us cross-file isolation. So between every scenario, we
-- RESET ROLE and `DELETE FROM public.relationships;` as superuser
-- (running it under RLS claims would leave the symmetric row
-- behind). The cleanup line is placed at the start of every
-- scenario's setup, not the end of the previous one, so the
-- executor cannot accidentally skip it.

BEGIN;

SELECT plan(28);

\i /db/tests/fixtures/users_alice_bob_carol.sql

-- Known public handles for the username-add path (mirrors
-- resolve_username.sql); overwrites the provisional signup handles.
UPDATE public.profiles SET username = 'AliceHandle'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
UPDATE public.profiles SET username = 'BobHandle'
WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
UPDATE public.profiles SET username = 'CarolHandle'
WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- ===================================================================
-- A. RLS positive (4) — Alice acting on her own (Alice, Bob) row.
-- ===================================================================

-- Setup A: clean state, set Alice's claims, authenticated.
RESET ROLE;
DELETE FROM public.relationships;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

-- A1: Alice can insert (Alice, Bob, 'circle').
SELECT lives_ok(
  $$INSERT INTO public.relationships (user_id, other_user_id, status)
    VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'circle'
    )$$,
  'A1: Alice can INSERT her own (Alice, Bob, circle) row'
);

-- A2: Alice sees her own row.
SELECT is(
  (SELECT count(*)::int FROM public.relationships),
  1,
  'A2: Alice SELECTs her own row (count = 1)'
);

-- A3: Alice can flip status to 'blocked'.
UPDATE public.relationships
SET status = 'blocked'
WHERE
  user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND other_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

SELECT is(
  (
    SELECT status FROM public.relationships
    WHERE
      user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND other_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  'blocked',
  'A3: Alice can UPDATE her row from circle to blocked'
);

-- A4: Alice can DELETE her own row.
DELETE FROM public.relationships
WHERE
  user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND other_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

SELECT is(
  (SELECT count(*)::int FROM public.relationships),
  0,
  'A4: Alice can DELETE her own row (count = 0)'
);

-- ===================================================================
-- B. RLS negative (4) — Bob acting on Alice's (Alice, Bob) row.
-- ===================================================================

-- Setup B: clean state; seed (Alice, Bob, 'circle') as superuser;
-- switch to Bob.
RESET ROLE;
DELETE FROM public.relationships;
INSERT INTO public.relationships (user_id, other_user_id, status) VALUES
(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'circle'
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);
SET LOCAL ROLE authenticated;

-- B1: Bob cannot SELECT Alice's row (even though other_user_id = Bob).
SELECT is(
  (SELECT count(*)::int FROM public.relationships),
  0,
  'B1: Bob cannot SELECT a row whose user_id is Alice'
);

-- B2: Bob cannot INSERT a row with user_id = Alice (policy WITH CHECK).
SELECT throws_ok(
  $$INSERT INTO public.relationships (user_id, other_user_id, status)
    VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
      'circle'
    )$$,
  '42501',
  NULL,
  'B2: Bob INSERT with user_id = Alice raises 42501'
);

-- B3: Bob's UPDATE of Alice's row matches 0 rows (USING denies).
WITH updated AS (
  UPDATE public.relationships
  SET status = 'blocked'
  WHERE
    user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND other_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  RETURNING 1
)

SELECT is(
  (SELECT count(*)::int FROM updated),
  0,
  'B3: Bob UPDATE of Alice''s row matches 0 rows'
);

-- B4: Bob's DELETE of Alice's row matches 0 rows.
WITH deleted AS (
  DELETE FROM public.relationships
  WHERE
    user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND other_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  RETURNING 1
)

SELECT is(
  (SELECT count(*)::int FROM deleted),
  0,
  'B4: Bob DELETE of Alice''s row matches 0 rows'
);

-- ===================================================================
-- C. add_circle_by_username — mutual outcome (3).
-- ===================================================================

RESET ROLE;
DELETE FROM public.relationships;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT public.add_circle_by_username('BobHandle');

RESET ROLE;

-- C1: Alice -> Bob row exists with status = 'circle'.
SELECT is(
  (
    SELECT count(*)::int FROM public.relationships
    WHERE
      user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND other_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND status = 'circle'
  ),
  1,
  'C1: add_circle_by_username creates Alice -> Bob circle row'
);

-- C2: Bob -> Alice row exists with status = 'circle' (mutual).
SELECT is(
  (
    SELECT count(*)::int FROM public.relationships
    WHERE
      user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND other_user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND status = 'circle'
  ),
  1,
  'C2: add_circle_by_username creates symmetric Bob -> Alice circle row'
);

-- C3: idempotent re-call leaves both rows with status = 'circle'.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT public.add_circle_by_username('BobHandle');

RESET ROLE;
SELECT is(
  (
    SELECT count(*)::int FROM public.relationships
    WHERE status = 'circle'
  ),
  2,
  'C3: idempotent re-call leaves both rows with status = circle'
);

-- ===================================================================
-- D. add_circle_by_username — block-skips-mutual (2).
-- Bob has Alice blocked; Alice username-adds Bob. Alice gets Bob in
-- her circle; Bob's blocked-Alice row is preserved unchanged.
-- ===================================================================

RESET ROLE;
DELETE FROM public.relationships;
INSERT INTO public.relationships (user_id, other_user_id, status) VALUES
(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'blocked'
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT public.add_circle_by_username('BobHandle');

RESET ROLE;

-- D1: Alice -> Bob row is circle (Alice's side succeeded).
SELECT is(
  (
    SELECT status FROM public.relationships
    WHERE
      user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND other_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  'circle',
  'D1: Alice -> Bob created as circle even though Bob has Alice blocked'
);

-- D2: Bob -> Alice row still blocked (Bob's block preserved).
SELECT is(
  (
    SELECT status FROM public.relationships
    WHERE
      user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND other_user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'blocked',
  'D2: Bob -> Alice block survives Alice''s username-add (block always wins)'
);

-- ===================================================================
-- E. add_circle_by_username — caller-has-target-blocked (2).
-- Alice has Bob blocked already. Bob has no row for Alice. Alice
-- username-adds Bob: her own blocked-Bob row is preserved (the WHERE
-- clause skips the update); Bob's side is created fresh.
-- ===================================================================

RESET ROLE;
DELETE FROM public.relationships;
INSERT INTO public.relationships (user_id, other_user_id, status) VALUES
(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'blocked'
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT public.add_circle_by_username('BobHandle');

RESET ROLE;

-- E1: Alice -> Bob still blocked (caller's own block stands).
SELECT is(
  (
    SELECT status FROM public.relationships
    WHERE
      user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND other_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  'blocked',
  'E1: Alice''s own blocked-Bob row not overwritten by add_circle_by_username'
);

-- E2: Bob -> Alice was created fresh as 'circle' (Bob has no block).
SELECT is(
  (
    SELECT status FROM public.relationships
    WHERE
      user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND other_user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'circle',
  'E2: Bob -> Alice created as circle (Bob had no block of Alice)'
);

-- ===================================================================
-- F. add_circle_by_username — both sides blocked (2).
-- Both blocked rows pre-exist. add_circle_by_username is a no-op on
-- both sides.
-- ===================================================================

RESET ROLE;
DELETE FROM public.relationships;
INSERT INTO public.relationships (user_id, other_user_id, status) VALUES
(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'blocked'
);
INSERT INTO public.relationships (user_id, other_user_id, status) VALUES
(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'blocked'
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT public.add_circle_by_username('BobHandle');

RESET ROLE;

-- F1: Alice -> Bob still blocked.
SELECT is(
  (
    SELECT status FROM public.relationships
    WHERE
      user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND other_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  'blocked',
  'F1: both-blocked: Alice -> Bob block preserved'
);

-- F2: Bob -> Alice still blocked.
SELECT is(
  (
    SELECT status FROM public.relationships
    WHERE
      user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND other_user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  'blocked',
  'F2: both-blocked: Bob -> Alice block preserved'
);

-- ===================================================================
-- G. add_circle_by_username — error cases (2).
-- ===================================================================

RESET ROLE;
DELETE FROM public.relationships;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

-- G1: self-add raises (P0001).
SELECT throws_ok(
  $$SELECT public.add_circle_by_username('AliceHandle')$$,
  'P0001',
  NULL,
  'G1: add_circle_by_username of own username raises P0001'
);

-- G2: nonexistent username raises (P0001).
SELECT throws_ok(
  $$SELECT public.add_circle_by_username('ghost')$$,
  'P0001',
  NULL,
  'G2: add_circle_by_username on unregistered username raises P0001'
);

-- ===================================================================
-- H. add_circle_by_id — one-sided (2).
-- ===================================================================

RESET ROLE;
DELETE FROM public.relationships;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT public.add_circle_by_id('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

RESET ROLE;

-- H1: Alice -> Bob row exists with status = 'circle'.
SELECT is(
  (
    SELECT status FROM public.relationships
    WHERE
      user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND other_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  'circle',
  'H1: add_circle_by_id creates Alice -> Bob circle row'
);

-- H2: no symmetric Bob -> Alice row exists (one-sided).
SELECT is(
  (
    SELECT count(*)::int FROM public.relationships
    WHERE
      user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND other_user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  0,
  'H2: add_circle_by_id does NOT create symmetric row (one-sided)'
);

-- ===================================================================
-- I. add_circle_by_id — caller's blocked row preserved (1).
-- ===================================================================

RESET ROLE;
DELETE FROM public.relationships;
INSERT INTO public.relationships (user_id, other_user_id, status) VALUES
(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'blocked'
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT public.add_circle_by_id('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

RESET ROLE;

-- I1: Alice -> Bob still blocked (the upsert's WHERE skipped it).
SELECT is(
  (
    SELECT status FROM public.relationships
    WHERE
      user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND other_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  'blocked',
  'I1: add_circle_by_id preserves caller''s existing blocked row'
);

-- ===================================================================
-- J. add_circle_by_id — error cases (3).
-- ===================================================================

RESET ROLE;
DELETE FROM public.relationships;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

-- J1: self-add raises (P0001).
SELECT throws_ok(
  $$SELECT public.add_circle_by_id(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
  )$$,
  'P0001',
  NULL,
  'J1: add_circle_by_id of own uuid raises P0001'
);

-- J2: nonexistent UUID raises (P0001).
SELECT throws_ok(
  $$SELECT public.add_circle_by_id(
    '99999999-9999-9999-9999-999999999999'::uuid
  )$$,
  'P0001',
  NULL,
  'J2: add_circle_by_id on unknown uuid raises P0001'
);

-- J3: idempotent re-call doesn't error; status stays 'circle'.
-- The ON CONFLICT DO UPDATE WHERE status <> 'blocked' clause does
-- match an existing 'circle' row and runs the UPDATE (so
-- modified_at advances) — but the assertion locks status only.
SELECT public.add_circle_by_id('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
SELECT public.add_circle_by_id('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

RESET ROLE;
SELECT is(
  (
    SELECT status FROM public.relationships
    WHERE
      user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND other_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  'circle',
  'J3: add_circle_by_id repeat call keeps status = circle (idempotent)'
);

-- ===================================================================
-- K. tg_set_timestamps freezes created_at across an UPDATE (1).
-- ===================================================================

RESET ROLE;
DELETE FROM public.relationships;
INSERT INTO public.relationships (user_id, other_user_id, status) VALUES
(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'circle'
);
CREATE TEMPORARY TABLE _k_created AS
SELECT created_at FROM public.relationships
WHERE
  user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND other_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

UPDATE public.relationships
SET status = 'blocked'
WHERE
  user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND other_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

RESET ROLE;
SELECT is(
  (
    SELECT created_at FROM public.relationships
    WHERE
      user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND other_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  (SELECT k.created_at FROM _k_created AS k),
  'K1: tg_set_timestamps freezes created_at across UPDATE on relationships'
);

-- ===================================================================
-- L. tg_freeze_relationships_pk rejects PK mutation (2).
-- The freeze trigger fires before t05/t20; runs under Alice (the
-- row owner) so RLS USING admits the row first, then the freeze
-- short-circuits with P0001.
-- ===================================================================

RESET ROLE;
DELETE FROM public.relationships;
INSERT INTO public.relationships (user_id, other_user_id, status) VALUES
(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'circle'
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

-- L1: changing other_user_id raises P0001.
SELECT throws_ok(
  $$UPDATE public.relationships
    SET other_user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    WHERE
      user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND other_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'P0001',
  NULL,
  'L1: tg_freeze_relationships_pk rejects mutation of other_user_id'
);

-- L2: changing user_id raises P0001.
SELECT throws_ok(
  $$UPDATE public.relationships
    SET user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    WHERE
      user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND other_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'P0001',
  NULL,
  'L2: tg_freeze_relationships_pk rejects mutation of user_id'
);

SELECT finish();

ROLLBACK;
