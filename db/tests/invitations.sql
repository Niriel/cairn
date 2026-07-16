-- invitations.sql — locks in the invitations table, the
-- invitations_select RLS policy, the three invite RPCs
-- (send_invitation, accept_invitation, decline_invitation), and
-- the t40_block_declines_invitations AFTER trigger on
-- relationships.
--
-- Uses no_plan() rather than plan(N) so adding or splitting a
-- scenario later is a one-line change; what matters is that every
-- assertion below passes, not that we hit a specific count.
--
-- Cross-scenario cleanup convention. Each scenario below mutates
-- public.invitations, public.relationships, public.list_members,
-- and/or public.user_settings, and the file-end ROLLBACK only
-- gives us cross-file isolation. So between every scenario we
-- RESET ROLE and re-state the world as superuser:
--   1. DELETE FROM public.invitations;
--   2. DELETE FROM public.relationships;
--   3. DELETE FROM public.list_members WHERE NOT (list_id = '22…'
--      AND user_id = 'aaaa…');  -- keep Alice's solo-list seat.
--   4. UPDATE public.user_settings SET invite_policy = 'everybody'
--      WHERE id IN (alice, bob, carol);
-- Then re-set the JWT claim for the scenario's acting identity —
-- RESET ROLE does NOT clear GUCs, and a fixture's set_config sticks.

BEGIN;

SELECT no_plan();

\i /db/tests/fixtures/users_alice_bob_carol.sql
\i /db/tests/fixtures/list_solo_alice.sql

-- Give Alice, Bob, and Carol known public handles so send_invitation's
-- username resolution has something to resolve (mirrors resolve_username.sql).
-- The provisional handles seeded by tg_profile_on_signup are overwritten here.
UPDATE public.profiles SET username = 'AliceHandle'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
UPDATE public.profiles SET username = 'BobHandle'
WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
UPDATE public.profiles SET username = 'CarolHandle'
WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- ===================================================================
-- A. invitations_select RLS (3) — inviter and invitee can see;
-- outsider cannot.
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );

INSERT INTO public.invitations
(list_id, created_by, target_user_id)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);

-- A1: Alice (inviter) sees the row.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM public.invitations),
  1,
  'A1: Alice (inviter) sees her sent invitation'
);

-- A2: Bob (invitee) sees the row.
RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM public.invitations),
  1,
  'A2: Bob (invitee) sees an invitation addressed to him'
);

-- A3: Carol (outsider) sees nothing.
RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM public.invitations),
  0,
  'A3: Carol (outsider) does not see the invitation'
);

-- ===================================================================
-- B. send_invitation — happy path + idempotency (3).
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

CREATE TEMPORARY TABLE _b_ids (id1 uuid, id2 uuid);
GRANT ALL ON _b_ids TO authenticated;
INSERT INTO _b_ids (id1) SELECT public.send_invitation(
  '22222222-2222-2222-2222-222222222222',
  p_username := 'BobHandle'
);

-- B1: returns non-null uuid.
SELECT ok(
  (SELECT id1 IS NOT NULL FROM _b_ids),
  'B1: send_invitation(Alice -> BobHandle on list_alice) returns non-null'
);

-- B2: an invitations row exists with the expected shape.
RESET ROLE;
SELECT is(
  (
    SELECT count(*)::int FROM public.invitations
    WHERE
      created_by = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND target_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND list_id = '22222222-2222-2222-2222-222222222222'
  ),
  1,
  'B2: invitations row exists with (Alice, Bob, list_alice)'
);

-- B3: idempotency — re-call returns the same uuid (step 5 short-circuit).
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
UPDATE _b_ids SET id2 = public.send_invitation(
  '22222222-2222-2222-2222-222222222222',
  p_username := 'BobHandle'
);
SELECT is(
  (SELECT id1 FROM _b_ids),
  (SELECT id2 FROM _b_ids),
  'B3: re-call returns the same uuid (idempotent)'
);

-- B4: a pasted '@' sigil resolves the same as the bare handle — the
-- public identity is shown/copied as '@BobHandle', but stored as
-- 'BobHandle', so send_invitation must peel the leading '@'.
RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT public.send_invitation(
  '22222222-2222-2222-2222-222222222222',
  p_username := '@BobHandle'
);

RESET ROLE;
SELECT is(
  (
    SELECT count(*)::int FROM public.invitations
    WHERE
      created_by = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      AND target_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND list_id = '22222222-2222-2222-2222-222222222222'
  ),
  1,
  'B4: send_invitation peels a leading @ (''@BobHandle'' resolves to Bob)'
);


-- ===================================================================
-- C. send_invitation — inviter-membership check (1).
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );

-- Set claims to Carol so the list-membership insert's
-- tg_set_attribution_lists trigger stamps created_by = Carol.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}',
  TRUE
);
INSERT INTO public.lists (id, name) VALUES
('33333333-3333-3333-3333-333333333333', 'Carol''s list')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.list_members (list_id, user_id) VALUES
(
  '33333333-3333-3333-3333-333333333333',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
)
ON CONFLICT (list_id, user_id) DO NOTHING;

-- Now switch to Alice, who is NOT a member of Carol's list.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.send_invitation(
    '33333333-3333-3333-3333-333333333333',
    p_user_id := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  )$$,
  'P0001',
  NULL,
  'C1: non-member inviter raises P0001'
);

-- ===================================================================
-- D. send_invitation — self-invite (1).
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.send_invitation(
    '22222222-2222-2222-2222-222222222222',
    p_user_id := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  )$$,
  'P0001',
  NULL,
  'D1: self-invite raises P0001'
);

-- ===================================================================
-- E. send_invitation — neither p_username nor p_user_id given (1).
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.send_invitation(
    '22222222-2222-2222-2222-222222222222',
    p_username := NULL,
    p_user_id := NULL
  )$$,
  'P0001',
  NULL,
  'E1: missing both p_username and p_user_id raises P0001'
);

-- ===================================================================
-- F. send_invitation — p_user_id is a non-existent UUID (1).
-- The FK on invitations.target_user_id -> auth.users fires; we pin
-- SQLSTATE 23503. Do NOT use the tombstone UUID — that's a valid
-- auth.users row.
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.send_invitation(
    '22222222-2222-2222-2222-222222222222',
    p_user_id := 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid
  )$$,
  '23503',
  NULL,
  'F1: non-existent p_user_id raises 23503 (FK violation)'
);

-- ===================================================================
-- G. send_invitation — existing live membership (1).
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );

-- Seed: Bob is already a live member of list_alice.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
INSERT INTO public.list_members (list_id, user_id) VALUES
(
  '22222222-2222-2222-2222-222222222222',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
)
ON CONFLICT (list_id, user_id) DO NOTHING;

SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.send_invitation(
    '22222222-2222-2222-2222-222222222222',
    p_username := 'BobHandle'
  )$$,
  'P0001',
  NULL,
  'G1: target is already a live list member -> P0001'
);

-- ===================================================================
-- H. send_invitation — soft-deleted membership treated as non-member (2).
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );

-- Seed: Bob in list_alice, then soft-delete.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
INSERT INTO public.list_members (list_id, user_id) VALUES
(
  '22222222-2222-2222-2222-222222222222',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
)
ON CONFLICT (list_id, user_id) DO NOTHING;
UPDATE public.list_members SET deleted_at = now()
WHERE
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

SET LOCAL ROLE authenticated;

CREATE TEMPORARY TABLE _h_ids (id1 uuid);
GRANT ALL ON _h_ids TO authenticated;
INSERT INTO _h_ids (id1) SELECT public.send_invitation(
  '22222222-2222-2222-2222-222222222222',
  p_user_id := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);

-- H1: returns non-null uuid.
SELECT ok(
  (SELECT id1 IS NOT NULL FROM _h_ids),
  'H1: soft-deleted member can be re-invited (returns non-null)'
);

-- H2: row exists.
RESET ROLE;
SELECT is(
  (
    SELECT count(*)::int FROM public.invitations
    WHERE
      list_id = '22222222-2222-2222-2222-222222222222'
      AND target_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  1,
  'H2: invitations row exists for (list_alice, Bob)'
);


-- ===================================================================
-- I. send_invitation — block check (1).
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );

-- Seed: Bob has Alice blocked.
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

SELECT is(
  (
    SELECT public.send_invitation(
      '22222222-2222-2222-2222-222222222222',
      p_username := 'BobHandle'
    )
  ),
  NULL,
  'I1: blocked target -> send_invitation returns NULL (silent)'
);

-- ===================================================================
-- J. send_invitation — invite_policy = 'nobody' (1).
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );

UPDATE public.user_settings SET invite_policy = 'nobody'
WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT public.send_invitation(
      '22222222-2222-2222-2222-222222222222',
      p_username := 'BobHandle'
    )
  ),
  NULL,
  'J1: invite_policy=nobody -> send_invitation returns NULL (silent)'
);

-- ===================================================================
-- K. send_invitation — invite_policy = 'circle', not in circle (1).
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );

UPDATE public.user_settings SET invite_policy = 'circle'
WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT public.send_invitation(
      '22222222-2222-2222-2222-222222222222',
      p_username := 'BobHandle'
    )
  ),
  NULL,
  'K1: invite_policy=circle and Alice not in Bob''s circle -> NULL'
);

-- ===================================================================
-- L. send_invitation — invite_policy = 'circle', in circle (1).
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );

UPDATE public.user_settings SET invite_policy = 'circle'
WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
INSERT INTO public.relationships (user_id, other_user_id, status) VALUES
(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'circle'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT ok(
  (
    SELECT public.send_invitation(
      '22222222-2222-2222-2222-222222222222',
      p_username := 'BobHandle'
    ) IS NOT NULL
  ),
  'L1: invite_policy=circle and Alice in Bob''s circle -> non-null'
);

-- ===================================================================
-- M. send_invitation — truthful miss on an unknown username (1).
-- A username that resolves to no profile raises P0001 'no such user',
-- distinct from the silent NULL returns of block/policy — username
-- existence is public, so the miss is told truthfully.
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.send_invitation(
    '22222222-2222-2222-2222-222222222222',
    p_username := 'ghost'
  )$$,
  'P0001',
  'no such user',
  'M1: unknown username raises P0001 ''no such user'' (truthful miss)'
);


-- ===================================================================
-- N. send_invitation — both p_username and p_user_id non-null, p_user_id wins (1).
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT ok(
  (
    SELECT public.send_invitation(
      '22222222-2222-2222-2222-222222222222',
      p_username := 'CarolHandle',
      p_user_id := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    ) IS NOT NULL
  ),
  'N1: when both args given, returns a uuid'
);

RESET ROLE;
SELECT is(
  (
    SELECT count(*)::int FROM public.invitations
    WHERE
      list_id = '22222222-2222-2222-2222-222222222222'
      AND target_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  1,
  'N2: p_user_id wins — target resolves to Bob, not CarolHandle'
);

-- ===================================================================
-- O. send_invitation — step-5 short-circuit on pre-existing invitation (2).
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );

CREATE TEMPORARY TABLE _o_ids (pre uuid, post uuid);
GRANT ALL ON _o_ids TO authenticated;
WITH ins AS (
  INSERT INTO public.invitations
  (list_id, created_by, target_user_id)
  VALUES (
    '22222222-2222-2222-2222-222222222222',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  )
  RETURNING id
)

INSERT INTO _o_ids (pre) SELECT id FROM ins;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

UPDATE _o_ids SET post = public.send_invitation(
  '22222222-2222-2222-2222-222222222222',
  p_username := 'BobHandle'
);

-- O1: same uuid as pre-inserted (step-5 short-circuit).
SELECT is(
  (SELECT pre FROM _o_ids),
  (SELECT post FROM _o_ids),
  'O1: RPC returns the pre-existing invitation''s id'
);

-- O2: only one row exists.
RESET ROLE;
SELECT is(
  (
    SELECT count(*)::int FROM public.invitations
    WHERE
      list_id = '22222222-2222-2222-2222-222222222222'
      AND target_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  1,
  'O2: still only one invitations row for (list_alice, Bob)'
);


-- ===================================================================
-- P. accept_invitation — happy path (3).
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );

CREATE TEMPORARY TABLE _p_inv (id uuid);
GRANT ALL ON _p_inv TO authenticated;
WITH ins AS (
  INSERT INTO public.invitations
  (list_id, created_by, target_user_id)
  VALUES (
    '22222222-2222-2222-2222-222222222222',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  )
  RETURNING id
)

INSERT INTO _p_inv (id) SELECT id FROM ins;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);
SET LOCAL ROLE authenticated;

-- P1: lives_ok on the accept.
SELECT lives_ok(
  $$SELECT public.accept_invitation((SELECT id FROM _p_inv))$$,
  'P1: Bob accepting his own invitation lives'
);

RESET ROLE;

-- P2: list_members row exists with created_by = Bob, deleted_at IS NULL.
SELECT is(
  (
    SELECT count(*)::int FROM public.list_members
    WHERE
      list_id = '22222222-2222-2222-2222-222222222222'
      AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND created_by = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND deleted_at IS NULL
  ),
  1,
  'P2: list_members row exists with created_by = Bob, deleted_at NULL'
);

-- P3: invitation row gone.
SELECT is(
  (SELECT count(*)::int FROM public.invitations),
  0,
  'P3: invitation row is hard-deleted'
);


-- ===================================================================
-- Q. accept_invitation — restores soft-deleted membership (3).
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
INSERT INTO public.list_members (list_id, user_id) VALUES
(
  '22222222-2222-2222-2222-222222222222',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
)
ON CONFLICT (list_id, user_id) DO NOTHING;
UPDATE public.list_members SET deleted_at = now()
WHERE
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

CREATE TEMPORARY TABLE _q_inv (id uuid);
GRANT ALL ON _q_inv TO authenticated;
WITH ins AS (
  INSERT INTO public.invitations
  (list_id, created_by, target_user_id)
  VALUES (
    '22222222-2222-2222-2222-222222222222',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  )
  RETURNING id
)

INSERT INTO _q_inv (id) SELECT id FROM ins;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.accept_invitation((SELECT id FROM _q_inv))$$,
  'Q1: Bob accepting after prior soft-delete lives'
);

RESET ROLE;

-- Q2: list_members row deleted_at IS NULL AND deleted_by IS NULL.
SELECT is(
  (
    SELECT count(*)::int FROM public.list_members
    WHERE
      list_id = '22222222-2222-2222-2222-222222222222'
      AND user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND deleted_at IS NULL
      AND deleted_by IS NULL
  ),
  1,
  'Q2: soft-deleted membership restored (deleted_at/by both NULL)'
);

-- Q3: invitation row gone.
SELECT is(
  (SELECT count(*)::int FROM public.invitations),
  0,
  'Q3: invitation row is hard-deleted after restore'
);


-- ===================================================================
-- R. accept_invitation — wrong caller (1).
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );

CREATE TEMPORARY TABLE _r_inv (id uuid);
GRANT ALL ON _r_inv TO authenticated;
WITH ins AS (
  INSERT INTO public.invitations
  (list_id, created_by, target_user_id)
  VALUES (
    '22222222-2222-2222-2222-222222222222',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  )
  RETURNING id
)

INSERT INTO _r_inv (id) SELECT id FROM ins;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.accept_invitation((SELECT id FROM _r_inv))$$,
  'P0001',
  NULL,
  'R1: Carol accepting Bob''s invitation raises P0001'
);


-- ===================================================================
-- S. accept_invitation — not found (1).
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.accept_invitation(
    'ffffffff-ffff-ffff-ffff-fffffffffffe'::uuid
  )$$,
  'P0001',
  NULL,
  'S1: accept_invitation of nonexistent id raises P0001'
);

-- ===================================================================
-- U. decline_invitation — happy path (1).
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );

CREATE TEMPORARY TABLE _u_inv (id uuid);
GRANT ALL ON _u_inv TO authenticated;
WITH ins AS (
  INSERT INTO public.invitations
  (list_id, created_by, target_user_id)
  VALUES (
    '22222222-2222-2222-2222-222222222222',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  )
  RETURNING id
)

INSERT INTO _u_inv (id) SELECT id FROM ins;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);
SET LOCAL ROLE authenticated;

SELECT public.decline_invitation((SELECT id FROM _u_inv));

RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public.invitations),
  0,
  'U1: decline_invitation hard-deletes the row'
);


-- ===================================================================
-- V. decline_invitation — error cases (4).
-- ===================================================================

-- V1: wrong caller (Carol).
RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );

CREATE TEMPORARY TABLE _v_inv (id uuid);
GRANT ALL ON _v_inv TO authenticated;
WITH ins AS (
  INSERT INTO public.invitations
  (list_id, created_by, target_user_id)
  VALUES (
    '22222222-2222-2222-2222-222222222222',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  )
  RETURNING id
)

INSERT INTO _v_inv (id) SELECT id FROM ins;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.decline_invitation((SELECT id FROM _v_inv))$$,
  'P0001',
  NULL,
  'V1: Carol declining Bob''s invite raises P0001'
);

-- V2: inviter trying to decline her own invite.
RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.decline_invitation((SELECT id FROM _v_inv))$$,
  'P0001',
  NULL,
  'V2: inviter Alice declining her own sent invite raises P0001'
);

-- V3: not found.
RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.decline_invitation(
    'ffffffff-ffff-ffff-ffff-fffffffffffe'::uuid
  )$$,
  'P0001',
  NULL,
  'V3: decline of nonexistent id raises P0001'
);


-- ===================================================================
-- W. block auto-decline — INSERT path (2).
-- Alice inserts (Alice, Bob, 'blocked') -> t40 trigger should delete
-- the pending Bob -> Alice invite, but leave Bob -> Carol alone.
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );

-- Seed both invitations (Bob -> Alice, Bob -> Carol) directly.
INSERT INTO public.invitations
(list_id, created_by, target_user_id)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
INSERT INTO public.invitations
(list_id, created_by, target_user_id)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
INSERT INTO public.relationships (user_id, other_user_id, status) VALUES
(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'blocked'
);

RESET ROLE;

-- W1: Bob -> Alice invite is gone.
SELECT is(
  (
    SELECT count(*)::int FROM public.invitations
    WHERE
      created_by = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND target_user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  0,
  'W1: t40 trigger auto-declined Bob -> Alice invite on INSERT'
);

-- W2: Bob -> Carol invite still present (scope).
SELECT is(
  (
    SELECT count(*)::int FROM public.invitations
    WHERE
      created_by = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND target_user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  ),
  1,
  'W2: Bob -> Carol invite NOT deleted (scope guard)'
);

-- ===================================================================
-- X. block auto-decline — UPDATE path (1).
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
INSERT INTO public.relationships (user_id, other_user_id, status) VALUES
(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'circle'
);

RESET ROLE;
INSERT INTO public.invitations
(list_id, created_by, target_user_id)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
UPDATE public.relationships SET status = 'blocked'
WHERE
  user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND other_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

RESET ROLE;

SELECT is(
  (
    SELECT count(*)::int FROM public.invitations
    WHERE
      created_by = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND target_user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  0,
  'X1: t40 trigger auto-declined Bob -> Alice invite on UPDATE to blocked'
);

-- ===================================================================
-- Y. block auto-decline — status = 'circle' is a no-op (2).
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
INSERT INTO public.relationships (user_id, other_user_id, status) VALUES
(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'circle'
);

RESET ROLE;
INSERT INTO public.invitations
(list_id, created_by, target_user_id)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);

-- Y1: pending invite still present after the INSERT-of-circle row above.
SELECT is(
  (
    SELECT count(*)::int FROM public.invitations
    WHERE
      created_by = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND target_user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  1,
  'Y1: t40 trigger is a no-op on INSERT with status = circle'
);

-- Y2: same-value UPDATE OF status fires trigger; still no-op.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
UPDATE public.relationships SET status = 'circle'
WHERE
  user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND other_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

RESET ROLE;
SELECT is(
  (
    SELECT count(*)::int FROM public.invitations
    WHERE
      created_by = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND target_user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  1,
  'Y2: t40 trigger is a no-op on UPDATE OF status with status = circle'
);

SELECT finish();

ROLLBACK;
