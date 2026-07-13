-- invite_cascades.sql — locks in the two policy/cap triggers added
-- by 0010_invite_cascades.sql:
--   * t40_apply_invite_policy_cascade — AFTER UPDATE OF
--     invite_policy on user_settings; hard-deletes pending
--     invitations to the user that no longer match the new policy.
--   * t30_enforce_fifo_cap — BEFORE INSERT on invitations; evicts
--     the oldest pending row when a 21st arrives for the same
--     target_user_id. (Migration 0022 retired the email-keyed path,
--     so every invitation now carries a non-NULL target_user_id and
--     the trigger's WHEN gate is always satisfied.)
--
-- See plans/0801_privacy_circle_blocked/TASKS.md tasks 1.1 / 1.2 for
-- the per-assertion rationale.
--
-- Cross-scenario cleanup convention. Each scenario mutates
-- public.invitations, public.relationships, and public.user_settings,
-- and the file-end ROLLBACK only gives cross-file isolation. So
-- between every scenario we RESET ROLE and re-state the world as
-- superuser:
--   1. DELETE FROM public.invitations;
--   2. DELETE FROM public.relationships;
--   3. UPDATE public.user_settings SET invite_policy = 'everybody'
--      WHERE id IN (alice, bob, carol);
-- The acting identity is set per-scenario via set_config on
-- request.jwt.claims; RESET ROLE does NOT clear GUCs.

BEGIN;

SELECT plan(9);

\i /db/tests/fixtures/users_alice_bob_carol.sql
\i /db/tests/fixtures/list_solo_alice.sql

-- A second list so two different inviters can both have a pending
-- invitation targeting Bob (invitations_target_user_uniq is on
-- (list_id, target_user_id), so each (inviter, target) pair needs
-- its own list).
INSERT INTO public.lists (id, name) VALUES
('33333333-3333-3333-3333-333333333333', 'Second list')
ON CONFLICT (id) DO NOTHING;

-- ===================================================================
-- A. tighten 'everybody' -> 'nobody' hard-deletes all of the
-- target's pending invitations.
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );

-- Two pending invites to Bob — one from Alice, one from Carol.
INSERT INTO public.invitations
(list_id, created_by, target_user_id) VALUES
(
  '22222222-2222-2222-2222-222222222222',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);

-- Carol isn't a member of the list but the table accepts the row;
-- list-membership is only checked inside send_invitation.
INSERT INTO public.invitations
(list_id, created_by, target_user_id) VALUES
(
  '33333333-3333-3333-3333-333333333333',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);

-- Bob tightens to 'nobody'.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);
SET LOCAL ROLE authenticated;
UPDATE public.user_settings SET invite_policy = 'nobody'
WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

RESET ROLE;

-- A1: both pending invitations to Bob are gone.
SELECT is(
  (
    SELECT count(*)::int FROM public.invitations
    WHERE target_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  0,
  'A1: tighten everybody->nobody hard-deletes all of Bob''s pending invites'
);

-- ===================================================================
-- B. tighten 'everybody' -> 'circle' keeps pending invitations from
-- in-circle inviters and hard-deletes the rest.
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );

-- Bob has Alice in his circle (Bob's view of Alice).
INSERT INTO public.relationships (user_id, other_user_id, status) VALUES
(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'circle'
);

-- Two pending invites to Bob: one from Alice (in circle), one from
-- Carol (not in circle).
INSERT INTO public.invitations
(list_id, created_by, target_user_id) VALUES
(
  '22222222-2222-2222-2222-222222222222',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);

INSERT INTO public.invitations
(list_id, created_by, target_user_id) VALUES
(
  '33333333-3333-3333-3333-333333333333',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);

-- Bob tightens to 'circle'.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);
SET LOCAL ROLE authenticated;
UPDATE public.user_settings SET invite_policy = 'circle'
WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

RESET ROLE;

-- B1: Alice's invite kept (she's in Bob's circle); Carol's deleted.
SELECT is(
  (
    SELECT array_agg(created_by ORDER BY created_by)
    FROM public.invitations
    WHERE target_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid],
  'B1: tighten everybody->circle keeps in-circle invites, deletes others'
);

-- ===================================================================
-- C. tighten 'circle' -> 'nobody' hard-deletes the remaining in-
-- circle invites too. Continues from B's surviving row.
-- ===================================================================

-- B left Bob at policy='circle' with one pending invite from Alice.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);
SET LOCAL ROLE authenticated;
UPDATE public.user_settings SET invite_policy = 'nobody'
WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

RESET ROLE;

-- C1: Alice's invite is now also gone.
SELECT is(
  (
    SELECT count(*)::int FROM public.invitations
    WHERE target_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  0,
  'C1: tighten circle->nobody deletes remaining in-circle invites'
);

-- ===================================================================
-- D. loosen 'nobody' -> 'everybody' does NOT resurrect previously
-- cascaded invitations.
-- ===================================================================

-- C left Bob at policy='nobody' with no pending invites.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);
SET LOCAL ROLE authenticated;
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

RESET ROLE;

-- D1: still zero — hard delete is one-way.
SELECT is(
  (
    SELECT count(*)::int FROM public.invitations
    WHERE target_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  0,
  'D1: loosen nobody->everybody does NOT resurrect cascaded invitations'
);

-- ===================================================================
-- E. WHEN gate — updating invite_policy to the same value it
-- already has does NOT fire the cascade body.
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );

-- Park Bob at 'nobody' so the cascade body, if it ran, would
-- DELETE any invitation targeting Bob.
UPDATE public.user_settings SET invite_policy = 'nobody'
WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- Now seed a pending invite to Bob as superuser (bypassing the RPC
-- and its policy check).
INSERT INTO public.invitations
(list_id, created_by, target_user_id) VALUES
(
  '22222222-2222-2222-2222-222222222222',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);

-- No-op UPDATE: set invite_policy to its current value 'nobody'.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"}',
  TRUE
);
SET LOCAL ROLE authenticated;
UPDATE public.user_settings SET invite_policy = 'nobody'
WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

RESET ROLE;

-- E1: the invitation survives — the WHEN clause kept the body from
-- running.
SELECT is(
  (
    SELECT count(*)::int FROM public.invitations
    WHERE target_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  ),
  1,
  'E1: same-value invite_policy update does NOT fire cascade body'
);

-- ===================================================================
-- F. FIFO cap — 20 user-keyed pending invitations to one target fill
-- the inbox to a steady state of 20; the 21st insert evicts the
-- oldest by created_at.
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;
DELETE FROM public.relationships;
UPDATE public.user_settings SET invite_policy = 'everybody'
WHERE
  id IN (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  );

-- 22 lists with deterministically-ordered UUIDs so each
-- (list_id, target_user_id) pair is unique while the test still
-- maintains a stable handle on "the row from insert #1".
INSERT INTO public.lists (id, name)
SELECT
  ('40000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'cap-list-' || n::text
FROM generate_series(1, 22) AS n
ON CONFLICT (id) DO NOTHING;

-- An unrelated pending invitation to Carol, used by scenario G to
-- assert the 21st insert to Bob doesn't touch other targets.
INSERT INTO public.invitations
(list_id, created_by, target_user_id) VALUES
(
  '40000000-0000-0000-0000-000000000022',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);

-- 20 invitations to Bob from Alice across 20 distinct lists. Insert
-- one row at a time so each row gets its own clock_timestamp() from
-- t05_set_timestamps and the created_at ordering is stable.
DO $$
DECLARE
  n int;
BEGIN
  FOR n IN 1..20 LOOP
    INSERT INTO public.invitations
    (list_id, created_by, target_user_id) VALUES
    (
      ('40000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    );
  END LOOP;
END;
$$;

-- F1: after 20 inserts targeting Bob, count = 20 and the row from
-- insert #1 (list `…000000000001`) is still present — no eviction
-- has fired yet.
SELECT results_eq(
  $$SELECT count(*)::int,
           bool_or(list_id = '40000000-0000-0000-0000-000000000001'::uuid)
    FROM public.invitations
    WHERE target_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  $$VALUES (20, true)$$,
  'F1: 20 inserts targeting Bob fill the inbox to 20 with no eviction'
);

-- 21st insert to Bob — should trigger eviction of the oldest row.
INSERT INTO public.invitations
(list_id, created_by, target_user_id) VALUES
(
  '40000000-0000-0000-0000-000000000021',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);

-- F2: steady-state count is 20 and the row from insert #1 is gone.
SELECT results_eq(
  $$SELECT count(*)::int,
           bool_or(list_id = '40000000-0000-0000-0000-000000000001'::uuid)
    FROM public.invitations
    WHERE target_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  $$VALUES (20, false)$$,
  'F2: 21st insert evicts the oldest pending invite to Bob'
);

-- G1: Carol's pending invite is untouched by Bob's 21st insert.
SELECT is(
  (
    SELECT count(*)::int FROM public.invitations
    WHERE target_user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  ),
  1,
  'G1: 21st insert to Bob does NOT touch an unrelated target''s invites'
);

-- ===================================================================
-- I. Cap subject is target_user_id, not (created_by, target_user_id) —
-- two invites from the same inviter to the same target on different
-- lists count as two distinct invitations for the cap.
-- ===================================================================

RESET ROLE;
DELETE FROM public.invitations;

INSERT INTO public.invitations
(list_id, created_by, target_user_id) VALUES
(
  '40000000-0000-0000-0000-000000000001',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);

INSERT INTO public.invitations
(list_id, created_by, target_user_id) VALUES
(
  '40000000-0000-0000-0000-000000000002',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
);

-- I1: both rows count toward Bob's tally — the cap is per
-- target_user_id, not per (created_by, target_user_id) pair.
SELECT is(
  (
    SELECT count(*)::int FROM public.invitations
    WHERE
      target_user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      AND created_by = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  ),
  2,
  'I1: same (inviter, target) on two lists counted as 2 (cap is per target)'
);

SELECT finish();

ROLLBACK;
