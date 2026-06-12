-- admin_grants.sql — locks in the privilege boundary around the
-- `admin` schema and `admin.actions` introduced by 0017_admin.sql.
--
-- The admin schema is reachable only by the operator roles, never by
-- the PostgREST-facing roles. The structural defence is that `admin`
-- isn't on PGRST_DB_SCHEMAS, but the GRANT layer is the second wall:
-- `authenticated`/`anon` must have no USAGE on the schema and no
-- privilege on its objects. Within the operator roles, `cairn_readonly`
-- must be able to *reach* the schema (USAGE) and read `admin.actions`
-- (SELECT) without being able to mutate it (no UPDATE/DELETE), and
-- `cairn_admin` must inherit `cairn_readonly`.
--
-- 9 assertions:
--   PostgREST-facing roles locked out:
--     1. authenticated has NO USAGE on schema admin.
--     2. anon          has NO USAGE on schema admin.
--     3. authenticated has NO SELECT on admin.actions.
--     4. anon          has NO SELECT on admin.actions.
--   Operator roles reach the schema:
--     5. cairn_admin    HAS USAGE on schema admin.
--     6. cairn_readonly HAS USAGE on schema admin (load-bearing — a
--        standalone readonly operator is unusable without it).
--   Append-only read access for cairn_readonly:
--     7. cairn_readonly HAS SELECT on admin.actions.
--     8. cairn_readonly has NO UPDATE and NO DELETE on admin.actions.
--   Role inheritance:
--     9. cairn_admin inherits cairn_readonly.

BEGIN;

SELECT plan(9);

-- 1–2. The PostgREST-facing roles cannot even reach the schema.
SELECT ok(
  NOT has_schema_privilege('authenticated', 'admin', 'USAGE'),
  'authenticated has NO USAGE on schema admin'
);
SELECT ok(
  NOT has_schema_privilege('anon', 'admin', 'USAGE'),
  'anon has NO USAGE on schema admin'
);

-- 3–4. …and no privilege on the audit table itself.
SELECT ok(
  NOT has_table_privilege('authenticated', 'admin.actions', 'SELECT'),
  'authenticated has NO SELECT on admin.actions'
);
SELECT ok(
  NOT has_table_privilege('anon', 'admin.actions', 'SELECT'),
  'anon has NO SELECT on admin.actions'
);

-- 5–6. The operator roles can reach the schema. The cairn_readonly
-- USAGE grant is load-bearing: schema USAGE gates every object
-- privilege inside, so without it a standalone readonly operator can
-- touch neither inspect_user nor admin.actions.
SELECT ok(
  has_schema_privilege('cairn_admin', 'admin', 'USAGE'),
  'cairn_admin HAS USAGE on schema admin'
);
SELECT ok(
  has_schema_privilege('cairn_readonly', 'admin', 'USAGE'),
  'cairn_readonly HAS USAGE on schema admin (load-bearing)'
);

-- 7–8. cairn_readonly reads admin.actions but cannot mutate it: the
-- SELECT-only grant plus withheld UPDATE/DELETE is the append-only
-- guarantee.
SELECT ok(
  has_table_privilege('cairn_readonly', 'admin.actions', 'SELECT'),
  'cairn_readonly HAS SELECT on admin.actions'
);
SELECT ok(
  NOT has_table_privilege('cairn_readonly', 'admin.actions', 'UPDATE')
  AND NOT has_table_privilege('cairn_readonly', 'admin.actions', 'DELETE'),
  'cairn_readonly has NO UPDATE/DELETE on admin.actions (append-only)'
);

-- 9. admin implies readonly.
SELECT ok(
  pg_has_role('cairn_admin', 'cairn_readonly', 'USAGE'),
  'cairn_admin inherits cairn_readonly'
);

SELECT finish();

ROLLBACK;
