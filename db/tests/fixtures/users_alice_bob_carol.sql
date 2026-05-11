-- users_alice_bob_carol.sql — canonical three-user fixture for pgTAP tests.
--
-- Insert Alice/Bob/Carol into auth.users with stable UUIDs so tests can
-- reference them by literal. Each row uses ON CONFLICT (id) DO NOTHING, so
-- re-including the fixture inside the same transaction is a no-op.
--
-- Include convention: use an ABSOLUTE path from test files, e.g.
--   \i /db/tests/fixtures/users_alice_bob_carol.sql
-- pg_prove runs with the container WORKDIR `/`, and the host `./db` is
-- mounted at `/db`, so a relative `\i fixtures/…` would resolve to
-- `/fixtures/…` and fail. Absolute paths are robust to invocation cwd.
--
-- This file deliberately has no BEGIN;/COMMIT; — each test file owns its
-- own transaction (see docs/testing.md → "Database tests (pgTAP)").

INSERT INTO auth.users (id, email) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'alice@test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'bob@test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email) VALUES
('cccccccc-cccc-cccc-cccc-cccccccccccc', 'carol@test')
ON CONFLICT (id) DO NOTHING;
