-- invitations_delete.sql — locks in the invitations_delete RLS policy
-- (created_by = uid()) and the DELETE grant added by migration 0011.
--
-- Uses no_plan() so adding a scenario later is a one-line change.
--
-- Cross-scenario cleanup: RESET ROLE + DELETE + re-INSERT the test row.

BEGIN;

SELECT no_plan();

\i /db/tests/fixtures/users_alice_bob_carol.sql
\i /db/tests/fixtures/list_solo_alice.sql

-- ===================================================================
-- Seed helper: insert the test invitation and capture its id.
-- ===================================================================

CREATE TEMPORARY TABLE _del_inv (id uuid);
GRANT ALL ON _del_inv TO authenticated;

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
DELETE FROM public.list_members
WHERE NOT (
  list_id = '22222222-2222-2222-2222-222222222222'
  AND user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
WITH ins AS (
  INSERT INTO public.invitations (list_id, created_by, target_user_id, target_email)
  VALUES (
    '22222222-2222-2222-2222-222222222222',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    NULL
  )
  RETURNING id
)

INSERT INTO _del_inv (id) SELECT id FROM ins;

-- ===================================================================
-- A. Positive: inviter (Alice) can delete her own invitation.
-- ===================================================================

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;

DELETE FROM public.invitations
WHERE id = (SELECT id FROM _del_inv);

RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public.invitations),
  0,
  'A1: Alice (inviter) can delete her own invitation'
);

-- ===================================================================
-- B. Negative: invitee (Bob) cannot delete Alice's invitation.
-- ===================================================================

RESET ROLE;
TRUNCATE _del_inv;
WITH ins AS (
  INSERT INTO public.invitations (list_id, created_by, target_user_id, target_email)
  VALUES (
    '22222222-2222-2222-2222-222222222222',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    NULL
  )
  RETURNING id
)

INSERT INTO _del_inv (id) SELECT id FROM ins;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);
SET LOCAL ROLE authenticated;

DELETE FROM public.invitations
WHERE id = (SELECT id FROM _del_inv);

RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public.invitations),
  1,
  'B1: Bob (invitee) cannot delete Alice''s invitation — row still present'
);

-- ===================================================================
-- C. Negative: outsider (Carol) cannot delete Alice's invitation.
-- ===================================================================

RESET ROLE;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}',
  TRUE
);
SET LOCAL ROLE authenticated;

DELETE FROM public.invitations
WHERE id = (SELECT id FROM _del_inv);

RESET ROLE;

SELECT is(
  (SELECT count(*)::int FROM public.invitations),
  1,
  'C1: Carol (outsider) cannot delete Alice''s invitation — row still present'
);

SELECT finish();

ROLLBACK;
