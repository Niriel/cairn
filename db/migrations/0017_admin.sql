-- 0017_admin.sql — the `admin` schema, its three least-privilege
-- roles, the privileges they need, and the `admin.actions` audit
-- table. The schema and table are the foundation every admin RPC
-- (ban/unban/delete/moderate/purge/inspect) is built on in later
-- migrations; see docs/admin.md.
--
-- Authorization model (docs/admin.md "The admin schema and Postgres
-- roles"):
--   * cairn_admin_owner — owns the schema, the audit table, and (in
--     later migrations) every admin RPC. NOLOGIN; SECURITY DEFINER
--     functions execute with its privileges. BYPASSRLS plus explicit
--     public-table grants because the RPCs run with no JWT in scope
--     (public.uid() is NULL), so the public.* RLS policies would
--     otherwise deny every read/write the RPC bodies need.
--   * cairn_admin — the membership marker operators SET ROLE to. Holds
--     EXECUTE on the RPCs (granted later) and USAGE on the schema.
--   * cairn_readonly — read-only inspection. cairn_admin inherits it.
--
-- The admin schema is never added to PGRST_DB_SCHEMAS, so PostgREST
-- cannot reach any of this — that structural unreachability is the
-- primary defence; the role/grant separation here is the second wall.
--
-- admin.actions deliberately has NO row-level security: enabling RLS
-- with no policy default-denies, so cairn_readonly's SELECT would
-- return zero rows and break `cairn-admin log` in production (where the
-- operator is a non-superuser role; dev/test masks it via the cairn
-- superuser). Reads are restricted by the SELECT-only grant; the table
-- is kept append-only by withholding UPDATE/DELETE.
--
-- Single BEGIN; … COMMIT; transaction so a mid-migration abort leaves
-- no half-applied state (matches 0014_delete_account.sql).

BEGIN;

-- Roles, created idempotently (mirrors 0001_init.sql).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cairn_admin_owner') THEN
    CREATE ROLE cairn_admin_owner NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cairn_admin') THEN
    CREATE ROLE cairn_admin NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cairn_readonly') THEN
    CREATE ROLE cairn_readonly NOLOGIN;
  END IF;
END$$;

-- admin implies readonly.
GRANT cairn_readonly TO cairn_admin;

-- The schema, owned by the owner role; reachable only by the operator
-- roles. The cairn_readonly USAGE grant is load-bearing: schema USAGE
-- gates every object privilege inside, so without it a standalone
-- readonly operator could reach neither admin.actions nor inspect_user.
CREATE SCHEMA IF NOT EXISTS admin AUTHORIZATION cairn_admin_owner;
REVOKE ALL ON SCHEMA admin FROM public, authenticated, anon;
GRANT USAGE ON SCHEMA admin TO cairn_admin;
GRANT USAGE ON SCHEMA admin TO cairn_readonly;

-- Owner privileges on auth.users (owned by GoTrue, not us). Per-column
-- UPDATE means the owner can flip the ban field but never rewrite an
-- email or password hash. DELETE is broad but unavoidable for erasure;
-- only admin.delete_account_as calls it.
GRANT SELECT, UPDATE (banned_until), DELETE ON auth.users TO cairn_admin_owner;

-- Owner privileges on the public tables the moderate/purge/delete/
-- inspect RPCs touch. BYPASSRLS lets the owner past the policies; these
-- grants are the matching object privileges.
GRANT SELECT, UPDATE, DELETE ON public.items, public.lists TO cairn_admin_owner;
GRANT SELECT ON
public.list_members, public.profiles, public.user_settings, public.votes
TO cairn_admin_owner;

-- The audit table. Columns exactly per docs/admin.md "The admin.actions
-- audit table".
CREATE TABLE admin.actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- actor = session_user (operator login role); effective = current_user
  -- (cairn_admin_owner under SECURITY DEFINER); action = 'ban_user' etc.
  actor text NOT NULL,
  effective text NOT NULL,
  action text NOT NULL, --noqa: RF04
  target uuid,                  -- the affected user/item/list, when applicable
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 2000),
  payload jsonb,                -- pre-state snapshot, for partial undo
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Owned by the owner role so the SECURITY DEFINER RPCs can INSERT.
ALTER TABLE admin.actions OWNER TO cairn_admin_owner;

-- Read-only for cairn_readonly; no privilege at all for the
-- PostgREST-facing roles. NO RLS (see header) — append-only is the
-- withheld UPDATE/DELETE, reads are the SELECT-only grant.
GRANT SELECT ON admin.actions TO cairn_readonly;
REVOKE ALL ON admin.actions FROM authenticated, anon, public;

COMMIT;
