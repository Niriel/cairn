-- list_shared_alice_bob.sql — canonical shared-list fixture.
--
-- Creates list `11111111-…` with Alice and Bob as members. Pairs with
-- users_alice_bob_carol.sql (self-included below) so a test that only
-- needs the list shape can `\i` this single fixture and get the users
-- for free.
--
-- Include convention: use the ABSOLUTE path from test files —
--   \i /db/tests/fixtures/list_shared_alice_bob.sql
-- See users_alice_bob_carol.sql for the rationale.
--
-- This file deliberately has no BEGIN;/COMMIT; — each test file owns
-- its own transaction (see docs/testing.md → "Database tests (pgTAP)").
-- The SET LOCAL request.jwt.claims call below is scoped to the
-- including test's transaction; re-include is safe.
--
-- Direct INSERT (not the create_list RPC) is deliberate: fixtures are
-- minimal and deterministic, and rpc_create_list.sql covers the RPC
-- separately. The INSERTs run as the test session's `cairn` superuser
-- (no SET LOCAL ROLE in this file), which bypasses the no-INSERT-grant
-- on both tables; the `tg_set_attribution_*` BEFORE-INSERT triggers
-- still fire under cairn and stamp `created_by` from the JWT claim
-- below (Alice).

\i /db/tests/fixtures/users_alice_bob_carol.sql

-- `set_config(name, value, is_local := TRUE)` is the function form
-- of `SET LOCAL`; the SET-statement form trips sqlfluff's postgres
-- parser on dotted parameter names like `request.jwt.claims`.
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}',
  TRUE
);

INSERT INTO public.lists (id, name) VALUES
('11111111-1111-1111-1111-111111111111', 'Shared list')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.list_members (list_id, user_id) VALUES
('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
ON CONFLICT (list_id, user_id) DO NOTHING;

INSERT INTO public.list_members (list_id, user_id) VALUES
('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT (list_id, user_id) DO NOTHING;
