-- 0012_invite_visibility.sql — tests for the three changes in
-- migration 0012:
--   (a) FK invitations.created_by → public.profiles
--   (b) FKs relationships.{user_id, other_user_id} → public.profiles
--   (c) lists_select invitee disjunct
--
-- Coverage:
--    1. invitations.created_by FK exists
--    2. invitations insert with valid profile created_by succeeds
--    3. invitations insert fails 23503 when created_by has no
--       profiles row
--    4. relationships.user_id FK exists
--    5. relationships.other_user_id FK exists
--    6. relationships insert with both endpoints in profiles succeeds
--    7. relationships insert fails 23503 when other_user_id has no
--       profiles row
--    8. lists SELECT positive: pending invitee sees the list
--    9. lists SELECT negative: uninvited stranger sees nothing
--   10. lists SELECT negative: invitee loses visibility after invite
--       delete
--   11. lists SELECT negative: invitee cannot see soft-deleted list
--
-- Same fk_ok() limitation as 0006_items_profiles_fk.sql — multiple
-- FKs per column — so constraint names are looked up directly.

BEGIN;

SELECT plan(11);

\i /db/tests/fixtures/list_shared_alice_bob.sql

-- ============================================================
-- (a) invitations.created_by → profiles
-- ============================================================

-- 1. FK exists.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint AS c
    INNER JOIN pg_class AS reftbl ON c.confrelid = reftbl.oid
    INNER JOIN pg_namespace AS refns ON reftbl.relnamespace = refns.oid
    WHERE
      c.conname = 'invitations_created_by_profiles_fk'
      AND c.contype = 'f'
      AND refns.nspname = 'public'
      AND reftbl.relname = 'profiles'
  ),
  'invitations.created_by FK to profiles'
);

-- 2. Positive insert. invitations has no attribution trigger, so
-- created_by must be supplied explicitly.
SELECT lives_ok(
  $$INSERT INTO public.invitations (list_id, created_by, target_email)
    VALUES (
      '11111111-1111-1111-1111-111111111111',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'someone@test')$$,
  'invitation insert with known profile created_by succeeds'
);

-- 3. Negative insert: created_by exists in auth.users but not
-- profiles. Insert a fresh user (tg_profile_on_signup auto-creates
-- the profiles row), delete the profiles row, leaving auth.users
-- intact. Subsequent invitation insert passes the auth.users FK
-- but fails on the new profiles FK.
DO $$
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'profileless@test')
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM public.profiles
  WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
END;
$$;

SELECT throws_ok(
  $$INSERT INTO public.invitations (list_id, created_by, target_email)
    VALUES (
      '11111111-1111-1111-1111-111111111111',
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      'another@test')$$,
  '23503',
  NULL,
  'invitation insert fails FK violation when created_by has no profiles row'
);

-- ============================================================
-- (b) relationships → profiles
-- ============================================================

-- 4. FK user_id → profiles.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint AS c
    INNER JOIN pg_class AS reftbl ON c.confrelid = reftbl.oid
    INNER JOIN pg_namespace AS refns ON reftbl.relnamespace = refns.oid
    WHERE
      c.conname = 'relationships_user_id_profiles_fk'
      AND c.contype = 'f'
      AND refns.nspname = 'public'
      AND reftbl.relname = 'profiles'
  ),
  'relationships.user_id FK to profiles'
);

-- 5. FK other_user_id → profiles.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint AS c
    INNER JOIN pg_class AS reftbl ON c.confrelid = reftbl.oid
    INNER JOIN pg_namespace AS refns ON reftbl.relnamespace = refns.oid
    WHERE
      c.conname = 'relationships_other_user_id_profiles_fk'
      AND c.contype = 'f'
      AND refns.nspname = 'public'
      AND reftbl.relname = 'profiles'
  ),
  'relationships.other_user_id FK to profiles'
);

-- 6. Positive insert: both endpoints in profiles.
SELECT lives_ok(
  $$INSERT INTO public.relationships (user_id, other_user_id, status)
    VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'circle')$$,
  'relationships insert with both endpoints in profiles succeeds'
);

-- 7. Negative insert: other_user_id has no profiles row (Dave was
-- profile-deleted above).
SELECT throws_ok(
  $$INSERT INTO public.relationships (user_id, other_user_id, status)
    VALUES (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      'circle')$$,
  '23503',
  NULL,
  'relationships insert fails FK violation when other_user_id has no profiles row'
);

-- ============================================================
-- (c) lists_select invitee disjunct
-- ============================================================

-- Clean the test invitation from assertion 2 so the lists policy
-- assertions below start from a known state.
DELETE FROM public.invitations
WHERE list_id = '11111111-1111-1111-1111-111111111111';

-- Alice (member) invites Carol (non-member) to the shared list.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT set_config(
  'cairn.test_invitation_id',
  public.send_invitation(
    '11111111-1111-1111-1111-111111111111',
    NULL,
    'cccccccc-cccc-cccc-cccc-cccccccccccc'
  )::text,
  TRUE
);

RESET ROLE;

-- 8. Carol now sees the list through the invitee disjunct.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT is(
  (
    SELECT count(*)::int FROM public.lists
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  1,
  'lists SELECT positive: pending invitee (Carol) sees the list'
);

RESET ROLE;

-- 9. A second stranger with no invite still sees nothing.
INSERT INTO auth.users (id, email) VALUES
('dddddddd-dddd-dddd-dddd-dddddddddddd', 'dave@test')
ON CONFLICT (id) DO NOTHING;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT is(
  (
    SELECT count(*)::int FROM public.lists
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  0,
  'lists SELECT negative: uninvited stranger (Dave) sees nothing'
);

RESET ROLE;

-- 10. Delete Carol's invitation; she loses visibility.
DELETE FROM public.invitations
WHERE id = current_setting('cairn.test_invitation_id')::uuid;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT is(
  (
    SELECT count(*)::int FROM public.lists
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  0,
  'lists SELECT negative: invitee loses visibility after invite delete'
);

RESET ROLE;

-- 11. Soft-deleted list stays hidden from a fresh invitee.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT public.send_invitation(
  '11111111-1111-1111-1111-111111111111',
  NULL,
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);

UPDATE public.lists
SET deleted_at = now(), deleted_by = public.uid()
WHERE id = '11111111-1111-1111-1111-111111111111';

RESET ROLE;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc"}',
  TRUE
);
SET LOCAL ROLE authenticated;
SELECT is(
  (
    SELECT count(*)::int FROM public.lists
    WHERE id = '11111111-1111-1111-1111-111111111111'
  ),
  0,
  'lists SELECT negative: invitee cannot see soft-deleted list'
);

SELECT finish();

ROLLBACK;
