-- export_my_data.sql — locks in public.export_my_data(), the
-- GDPR-portability RPC that returns the caller's whole per-user
-- document as JSONB (docs/data-export.md § "data.json shape" and
-- § "How the export is produced").
--
-- Two properties carry the privacy guarantee and get the most
-- coverage:
--   * The `user` sub-document is an ALLOWLIST, not to_jsonb(u) minus
--     secrets — so we seed Alice with sentinel values in every
--     credential/recovery-token column (copied from admin_inspect.sql)
--     and assert each key is ABSENT. A denylist body that forgot a
--     column would leak the sentinel and fail here.
--   * No e-mail but the caller's own appears anywhere in the document
--     — co-members render by display name only, and the email-keyed
--     invite's target_email (the invitee's e-mail, not the caller's)
--     is excluded. We assert the document text never contains a
--     co-member's or invitee's e-mail.
--
-- Scoping is exercised with deliberately awkward fixtures: a trashed
-- list the caller is still a member of (carries through), a
-- soft-deleted item (carries through), and a list the caller is NOT a
-- member of (excluded). Vote scope is Option B: every vote on an item
-- the caller added is included, by display name.
--
-- 32 assertions — see the inline section headers.

BEGIN;

SELECT plan(32);

-- Shared list 11111111 (Alice + Bob) and the three-user fixture.
-- Claims are left set to Alice by the fixture.
\i /db/tests/fixtures/list_shared_alice_bob.sql

-- Distinct display names so the display-name assertions are
-- non-vacuous (the signup default is the shared placeholder 'New user').
UPDATE public.profiles SET display_name = 'Alice'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
UPDATE public.profiles SET display_name = 'Bob'
WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
UPDATE public.profiles SET display_name = 'Carol'
WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- Sentinel secrets on Alice so the allowlist test is non-vacuous.
UPDATE auth.users SET
  encrypted_password = 'SENTINEL-encrypted-password',
  recovery_token = 'SENTINEL-recovery-token',
  confirmation_token = 'SENTINEL-confirmation-token',
  email_change_token_new = 'SENTINEL-email-change-new',
  email_change_token_current = 'SENTINEL-email-change-current',
  reauthentication_token = 'SENTINEL-reauthentication-token',
  phone_change_token = 'SENTINEL-phone-change-token'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- Content seeded as the test-session superuser (RLS-bypassing). The
-- attribution triggers still stamp created_by from the JWT claim
-- (Alice), so both items below are created_by Alice.

-- A live item on the shared list (the one the vote / Option-B
-- assertions read).
INSERT INTO public.items (id, list_id, name) VALUES
(
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'Movie A'
);

-- A soft-deleted item on the shared list — proves soft-deleted items
-- carry through.
INSERT INTO public.items (id, list_id, name, deleted_at) VALUES
(
  '44444444-4444-4444-4444-444444444444',
  '11111111-1111-1111-1111-111111111111',
  'Movie B (trashed)',
  now()
);

-- Alice and Bob both vote on Alice's live item. Option B means Bob's
-- vote appears in the export because the item is Alice's.
INSERT INTO public.votes (item_id, user_id, value) VALUES
('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2),
('33333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 3);

-- Alice's circle and blocklist.
INSERT INTO public.relationships (user_id, other_user_id, status) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'circle'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'blocked');

-- A list Alice is NOT a member of (Bob only) — must be excluded. Also
-- the home for the received invite below.
INSERT INTO public.lists (id, name) VALUES
('88888888-8888-8888-8888-888888888888', 'Bob''s books')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.list_members (list_id, user_id) VALUES
('88888888-8888-8888-8888-888888888888', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT (list_id, user_id) DO NOTHING;

-- A trashed list Alice IS a live member of — must carry through with a
-- non-null deleted_at.
INSERT INTO public.lists (id, name, deleted_at) VALUES
('99999999-9999-9999-9999-999999999999', 'Old list', now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.list_members (list_id, user_id) VALUES
('99999999-9999-9999-9999-999999999999', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
ON CONFLICT (list_id, user_id) DO NOTHING;

-- Invitations: a user-keyed sent invite (Alice → Carol), a received
-- invite (Bob → Alice), and an email-keyed sent invite (Alice →
-- dave@test, no claiming user) to exercise the target_email exclusion.
INSERT INTO public.invitations (list_id, created_by, target_user_id) VALUES
(
  '11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'cccccccc-cccc-cccc-cccc-cccccccccccc'
);
INSERT INTO public.invitations (list_id, created_by, target_user_id) VALUES
(
  '88888888-8888-8888-8888-888888888888',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
);
INSERT INTO public.invitations (list_id, created_by, target_email) VALUES
(
  '11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'dave@test'
);

-- Capture the document once (claims still = Alice; the function is
-- SECURITY DEFINER so the role does not matter for content).
CREATE TEMP TABLE _doc AS
SELECT public.export_my_data() AS j;

-- ── (a) user allowlist: shape ──────────────────────────────────────
SELECT is(
  (SELECT j -> 'user' ->> 'email' FROM _doc),
  'alice@test',
  'export: user carries the caller''s own email'
);
SELECT is(
  (SELECT j -> 'user' ->> 'display_name' FROM _doc),
  'Alice',
  'export: user carries the caller''s display_name'
);
SELECT is(
  (SELECT j -> 'user' ->> 'has_avatar' FROM _doc),
  'false',
  'export: has_avatar is false when avatar_version is 0'
);
SELECT is(
  (SELECT (j ->> 'schema_version')::int FROM _doc),
  1,
  'export: schema_version is 1'
);

-- ── (b) user allowlist: every credential/token column is absent ────
SELECT ok(
  (SELECT NOT jsonb_exists(j -> 'user', 'encrypted_password') FROM _doc),
  'export: user omits encrypted_password'
);
SELECT ok(
  (SELECT NOT jsonb_exists(j -> 'user', 'recovery_token') FROM _doc),
  'export: user omits recovery_token'
);
SELECT ok(
  (SELECT NOT jsonb_exists(j -> 'user', 'confirmation_token') FROM _doc),
  'export: user omits confirmation_token'
);
SELECT ok(
  (SELECT NOT jsonb_exists(j -> 'user', 'email_change_token_new') FROM _doc),
  'export: user omits email_change_token_new'
);
SELECT ok(
  (SELECT NOT jsonb_exists(j -> 'user', 'email_change_token_current') FROM _doc),
  'export: user omits email_change_token_current'
);
SELECT ok(
  (SELECT NOT jsonb_exists(j -> 'user', 'reauthentication_token') FROM _doc),
  'export: user omits reauthentication_token'
);
SELECT ok(
  (SELECT NOT jsonb_exists(j -> 'user', 'phone_change_token') FROM _doc),
  'export: user omits phone_change_token'
);

-- ── (c) list/item scoping ──────────────────────────────────────────
-- Set-returning unnests carry an explicit column alias (`AS l (elem)`)
-- so every reference is qualified (`l.elem`), satisfying the linter's
-- reference-qualification rule under the two-source FROM (_doc + SRF).
SELECT is(
  (
    SELECT count(*)::int
    FROM _doc, jsonb_array_elements(_doc.j -> 'lists') AS l (elem)
    WHERE l.elem ->> 'id' = '11111111-1111-1111-1111-111111111111'
  ),
  1,
  'export: the shared list the caller belongs to appears'
);
SELECT ok(
  (
    SELECT (l.elem ->> 'deleted_at') IS NOT NULL
    FROM _doc, jsonb_array_elements(_doc.j -> 'lists') AS l (elem)
    WHERE l.elem ->> 'id' = '99999999-9999-9999-9999-999999999999'
  ),
  'export: a trashed list the caller belongs to carries through with deleted_at'
);
SELECT is(
  (
    SELECT count(*)::int
    FROM _doc, jsonb_array_elements(_doc.j -> 'lists') AS l (elem)
    WHERE l.elem ->> 'id' = '88888888-8888-8888-8888-888888888888'
  ),
  0,
  'export: a list the caller is not a member of is excluded'
);
SELECT ok(
  (
    SELECT (item.elem ->> 'deleted_at') IS NOT NULL
    FROM
      _doc,
      jsonb_array_elements(_doc.j -> 'lists') AS l (elem),
      jsonb_array_elements(l.elem -> 'items') AS item (elem)
    WHERE
      l.elem ->> 'id' = '11111111-1111-1111-1111-111111111111'
      AND item.elem ->> 'id' = '44444444-4444-4444-4444-444444444444'
  ),
  'export: a soft-deleted item carries through with deleted_at'
);

-- ── (d) vote scope (Option B) + your_vote ──────────────────────────
SELECT is(
  (
    SELECT count(*)::int
    FROM
      _doc,
      jsonb_array_elements(_doc.j -> 'lists') AS l (elem),
      jsonb_array_elements(l.elem -> 'items') AS item (elem),
      jsonb_array_elements(item.elem -> 'all_votes') AS av (elem)
    WHERE
      l.elem ->> 'id' = '11111111-1111-1111-1111-111111111111'
      AND item.elem ->> 'id' = '33333333-3333-3333-3333-333333333333'
      AND av.elem ->> 'user_display_name' = 'Bob'
  ),
  1,
  'export: Option B — all_votes on the caller''s item includes Bob by display name'
);
SELECT is(
  (
    SELECT item.elem ->> 'your_vote'
    FROM
      _doc,
      jsonb_array_elements(_doc.j -> 'lists') AS l (elem),
      jsonb_array_elements(l.elem -> 'items') AS item (elem)
    WHERE
      l.elem ->> 'id' = '11111111-1111-1111-1111-111111111111'
      AND item.elem ->> 'id' = '33333333-3333-3333-3333-333333333333'
  ),
  '2',
  'export: your_vote is the caller''s own vote value'
);

-- ── (e) circle / blocked / invitations content ─────────────────────
SELECT is(
  (
    SELECT count(*)::int
    FROM _doc, jsonb_array_elements(_doc.j -> 'circle') AS c (elem)
    WHERE c.elem ->> 'display_name' = 'Carol'
  ),
  1,
  'export: circle contains Carol by display name'
);
SELECT is(
  (
    SELECT count(*)::int
    FROM _doc, jsonb_array_elements(_doc.j -> 'blocked') AS b (elem)
    WHERE b.elem ->> 'display_name' = 'Bob'
  ),
  1,
  'export: blocked contains Bob by display name'
);
SELECT cmp_ok(
  (SELECT jsonb_array_length(_doc.j -> 'invitations_sent') FROM _doc),
  '>',
  0,
  'export: invitations_sent is non-empty'
);
SELECT is(
  (
    SELECT count(*)::int
    FROM _doc, jsonb_array_elements(_doc.j -> 'invitations_received') AS r (elem)
    WHERE r.elem ->> 'inviter_display_name' = 'Bob'
  ),
  1,
  'export: invitations_received renders the inviter (Bob) by display name'
);

-- ── (f) no foreign e-mail leaks; email-keyed invite by list name ───
SELECT ok(
  (SELECT _doc.j::text NOT LIKE '%bob@test%' FROM _doc),
  'export: no co-member e-mail (bob@test) appears anywhere in the document'
);
SELECT ok(
  (SELECT _doc.j::text NOT LIKE '%carol@test%' FROM _doc),
  'export: no co-member e-mail (carol@test) appears anywhere in the document'
);
SELECT ok(
  (SELECT _doc.j::text NOT LIKE '%dave@test%' FROM _doc),
  'export: the email-keyed invite''s target_email (dave@test) is excluded'
);
SELECT is(
  (
    SELECT count(*)::int
    FROM _doc, jsonb_array_elements(_doc.j -> 'invitations_sent') AS s (elem)
    WHERE NOT (s.elem ? 'invitee_display_name')
  ),
  1,
  'export: the unclaimed email-keyed sent invite renders without an invitee name'
);
SELECT ok(
  (
    SELECT bool_and(NOT (s.elem ? 'status'))
    FROM _doc, jsonb_array_elements(_doc.j -> 'invitations_sent') AS s (elem)
  ),
  'export: no invitations_sent entry carries a status key'
);
SELECT ok(
  (
    SELECT bool_and(s.elem ? 'list_name')
    FROM _doc, jsonb_array_elements(_doc.j -> 'invitations_sent') AS s (elem)
  ),
  'export: every invitations_sent entry renders by list_name'
);

-- ── (g) in-body guards ─────────────────────────────────────────────
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '', TRUE);
SELECT throws_ok(
  $$SELECT public.export_my_data()$$,
  '28000',
  'not authenticated',
  'export: claims unset → 28000 ''not authenticated'''
);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000000"}',
  TRUE
);
SELECT throws_ok(
  $$SELECT public.export_my_data()$$,
  '28000',
  'cannot export the tombstone user',
  'export: claims = tombstone → 28000 ''cannot export the tombstone user'''
);
RESET ROLE;

-- ── (h) grant matrix ───────────────────────────────────────────────
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.export_my_data()', 'EXECUTE'
  ),
  'export: authenticated HAS EXECUTE'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.export_my_data()', 'EXECUTE'),
  'export: anon has NO EXECUTE'
);
SELECT ok(
  NOT has_function_privilege('public', 'public.export_my_data()', 'EXECUTE'),
  'export: public has NO EXECUTE'
);

SELECT finish();

ROLLBACK;
