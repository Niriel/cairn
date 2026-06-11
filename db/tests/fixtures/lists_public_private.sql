-- lists_public_private.sql — fixture for the public-list read path.
--
-- Creates two lists owned by Alice (Bob a co-member of both):
--   * `0a000000-…0001` — PUBLIC (`is_public = true`), holding two live
--     voted items and one soft-deleted item.
--   * `0a000000-…0002` — PRIVATE (`is_public = false`), one live item.
--
-- Pairs with users_alice_bob_carol.sql (included below). Use the
-- ABSOLUTE include path from test files —
--   \i /db/tests/fixtures/lists_public_private.sql
-- (see users_alice_bob_carol.sql for the cwd rationale).
--
-- No BEGIN;/COMMIT; — each test owns its transaction (see
-- docs/testing.md). INSERTs run as the test session's `cairn`
-- superuser (no SET LOCAL ROLE here), which bypasses the missing
-- INSERT grants; the `tg_set_attribution_*` BEFORE-INSERT triggers
-- still stamp `created_by` from the JWT claim set below (Alice).

\i /db/tests/fixtures/users_alice_bob_carol.sql

-- `set_config(name, value, is_local := TRUE)` is the function form of
-- `SET LOCAL`; the statement form trips sqlfluff on the dotted name.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);

-- Public list + private list.
INSERT INTO public.lists (id, name, description, is_public) VALUES
(
  '0a000000-0000-0000-0000-000000000001',
  'Public picks',
  'A list anyone with the link can read.',
  TRUE
),
(
  '0a000000-0000-0000-0000-000000000002',
  'Private picks',
  NULL,
  FALSE
)
ON CONFLICT (id) DO NOTHING;

-- Alice and Bob are members of both lists.
INSERT INTO public.list_members (list_id, user_id) VALUES
('0a000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
('0a000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
('0a000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
('0a000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT (list_id, user_id) DO NOTHING;

-- Public-list items:
--   0b…0001 'Top pick'   — alice +3, bob +1 → score 4 (highest).
--   0b…0002 'Runner up'  — alice +1            → score 1.
--   0b…0003 'Trashed'    — soft-deleted, must NOT appear in the payload.
INSERT INTO public.items (id, list_id, name, notes) VALUES
(
  '0b000000-0000-0000-0000-000000000001',
  '0a000000-0000-0000-0000-000000000001',
  'Top pick',
  'The clear favourite.'
),
(
  '0b000000-0000-0000-0000-000000000002',
  '0a000000-0000-0000-0000-000000000001',
  'Runner up',
  NULL
),
(
  '0b000000-0000-0000-0000-000000000003',
  '0a000000-0000-0000-0000-000000000001',
  'Trashed',
  NULL
)
ON CONFLICT (id) DO NOTHING;

UPDATE public.items
SET deleted_at = now()
WHERE id = '0b000000-0000-0000-0000-000000000003';

-- Private-list item (live).
INSERT INTO public.items (id, list_id, name, notes) VALUES
(
  '0b000000-0000-0000-0000-000000000004',
  '0a000000-0000-0000-0000-000000000002',
  'Secret item',
  NULL
)
ON CONFLICT (id) DO NOTHING;

-- Votes on the public-list items (votes carry no attribution trigger;
-- user_id is the voter directly).
INSERT INTO public.votes (item_id, user_id, value) VALUES
('0b000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 3),
('0b000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1),
('0b000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1)
ON CONFLICT (item_id, user_id) DO NOTHING;
