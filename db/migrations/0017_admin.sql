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
-- only admin.delete_account_as calls it. USAGE on the auth schema is
-- required first — without it the table grants are unreachable, because
-- cairn_admin_owner is a deliberately limited role (unlike delete_account,
-- whose definer is the privileged migration-runner role).
GRANT USAGE ON SCHEMA auth TO cairn_admin_owner;
GRANT SELECT, UPDATE (banned_until), DELETE ON auth.users TO cairn_admin_owner;

-- Owner privileges on the public tables the moderate/purge/delete/
-- inspect RPCs touch. BYPASSRLS lets the owner past the policies; these
-- grants are the matching object privileges.
GRANT SELECT, UPDATE, DELETE ON public.items, public.lists TO cairn_admin_owner;
GRANT SELECT ON
public.list_members, public.profiles, public.user_settings, public.votes
TO cairn_admin_owner;

-- moderate_item/moderate_list set request.jwt.claims to the tombstone and
-- let the BEFORE UPDATE attribution trigger stamp deleted_by; that trigger
-- calls public.uid(), so the owner role needs EXECUTE on it.
GRANT EXECUTE ON FUNCTION public.uid() TO cairn_admin_owner;

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

-- ── admin.ban_user / admin.unban_user ──────────────────────────────
-- The audited banhammer over auth.users.banned_until (docs/admin.md
-- § ban_user/unban_user). Guard order is load-bearing: reject the
-- tombstone, reject a missing user, THEN write the audit row, THEN
-- perform the UPDATE — so a rejected target never writes an audit row.
-- payload snapshots the prior banned_until for a partial undo.
CREATE OR REPLACE FUNCTION admin.ban_user(p_target uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = admin, public, auth
AS $$
DECLARE prev_banned_until timestamptz;
BEGIN
  IF p_target = '00000000-0000-0000-0000-000000000000' THEN
    RAISE EXCEPTION 'cannot ban the tombstone user';
  END IF;

  SELECT banned_until INTO prev_banned_until FROM auth.users WHERE id = p_target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such user';
  END IF;

  INSERT INTO admin.actions (actor, effective, action, target, reason, payload)
  VALUES (
    session_user, current_user, 'ban_user', p_target, p_reason,
    jsonb_build_object('banned_until', prev_banned_until)
  );

  UPDATE auth.users SET banned_until = 'infinity' WHERE id = p_target;
END;
$$;

CREATE OR REPLACE FUNCTION admin.unban_user(p_target uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = admin, public, auth
AS $$
DECLARE prev_banned_until timestamptz;
BEGIN
  IF p_target = '00000000-0000-0000-0000-000000000000' THEN
    RAISE EXCEPTION 'cannot unban the tombstone user';
  END IF;

  SELECT banned_until INTO prev_banned_until FROM auth.users WHERE id = p_target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such user';
  END IF;

  INSERT INTO admin.actions (actor, effective, action, target, reason, payload)
  VALUES (
    session_user, current_user, 'unban_user', p_target, p_reason,
    jsonb_build_object('banned_until', prev_banned_until)
  );

  UPDATE auth.users SET banned_until = NULL WHERE id = p_target;
END;
$$;

ALTER FUNCTION admin.ban_user(uuid, text) OWNER TO cairn_admin_owner;
ALTER FUNCTION admin.unban_user(uuid, text) OWNER TO cairn_admin_owner;
REVOKE ALL ON FUNCTION admin.ban_user(uuid, text) FROM public;
REVOKE ALL ON FUNCTION admin.unban_user(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION admin.ban_user(uuid, text) TO cairn_admin;
GRANT EXECUTE ON FUNCTION admin.unban_user(uuid, text) TO cairn_admin;

-- ── admin.inspect_user ─────────────────────────────────────────────
-- Read-only "user says X is broken" inspection (docs/admin.md
-- § inspect_user). The only RPC that takes no reason and writes no
-- audit row; granted to cairn_readonly (cairn_admin reaches it via
-- inheritance). The asymmetry — reads unlogged, writes always logged —
-- is the protection.
--
-- The `auth` sub-document is an ALLOWLIST of non-secret columns, not a
-- to_jsonb(u) minus named secrets. Every credential/recovery token is
-- excluded by construction, so a future GoTrue column can never silently
-- leak through to cairn_readonly, the one role with no other path to
-- auth.users data.
CREATE OR REPLACE FUNCTION admin.inspect_user(p_target uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = admin, public, auth
AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'auth', (
      SELECT jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'email_confirmed_at', u.email_confirmed_at,
        'last_sign_in_at', u.last_sign_in_at,
        'banned_until', u.banned_until,
        'created_at', u.created_at
      )
      FROM auth.users u WHERE u.id = p_target
    ),
    'profile', (
      SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = p_target
    ),
    'user_settings', (
      SELECT to_jsonb(s) FROM public.user_settings s WHERE s.id = p_target
    ),
    'memberships', (
      SELECT jsonb_agg(lm) FROM public.list_members lm
      WHERE lm.user_id = p_target AND lm.deleted_at IS NULL
    ),
    'item_count', (
      SELECT count(*) FROM public.items
      WHERE created_by = p_target AND deleted_at IS NULL
    ),
    'vote_count', (
      SELECT count(*) FROM public.votes WHERE user_id = p_target
    )
  ) INTO result;
  RETURN result;
END;
$$;

ALTER FUNCTION admin.inspect_user(uuid) OWNER TO cairn_admin_owner;
REVOKE ALL ON FUNCTION admin.inspect_user(uuid) FROM public;
GRANT EXECUTE ON FUNCTION admin.inspect_user(uuid) TO cairn_readonly;

-- ── admin.delete_account_as ────────────────────────────────────────
-- The operator's GDPR-erasure pathway (docs/admin.md § delete_account_as).
-- The body is public.delete_account() (0014) verbatim except: the target
-- is p_target, not public.uid(); the guards raise without the 28000
-- not-authenticated case (there is no caller identity here); and one
-- audit row is written BEFORE the deletes. payload records only the
-- email_at_time — the audit log is not a recovery channel for the
-- personal data just erased.
--
-- Order is load-bearing: compute the sole-member list hard-delete BEFORE
-- the auth.users delete, which cascades the list_members rows the query
-- reads. The `NOT EXISTS (live member <> p_target)` form is verbatim
-- from delete_account() — using the identical form (not an additionally
-- scoped variant) is exactly what makes the two paths reach the same
-- end-state on every list, including orphaned (zero-live-member) ones.
CREATE OR REPLACE FUNCTION admin.delete_account_as(p_target uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = admin, public, auth
AS $$
DECLARE email_at_time text;
BEGIN
  IF p_target = '00000000-0000-0000-0000-000000000000' THEN
    RAISE EXCEPTION 'cannot delete the tombstone user';
  END IF;

  SELECT email INTO email_at_time FROM auth.users WHERE id = p_target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such user';
  END IF;

  INSERT INTO admin.actions (actor, effective, action, target, reason, payload)
  VALUES (
    session_user, current_user, 'delete_account_as', p_target, p_reason,
    jsonb_build_object('email_at_time', email_at_time)
  );

  -- Hard-delete lists where the target was the only remaining live
  -- member. Items, member rows, and votes cascade with the list.
  DELETE FROM public.lists AS l
  WHERE NOT EXISTS (
    SELECT 1 FROM public.list_members AS lm
    WHERE
      lm.list_id = l.id
      AND lm.deleted_at IS NULL
      AND lm.user_id <> p_target
  );

  -- Delete the auth row. Cascades personal data (profiles, user_settings,
  -- votes, the target's own list_members) and SET-DEFAULTs shared
  -- attribution (created_by/modified_by/deleted_by) to the tombstone.
  DELETE FROM auth.users WHERE id = p_target;
END;
$$;

ALTER FUNCTION admin.delete_account_as(uuid, text) OWNER TO cairn_admin_owner;
REVOKE ALL ON FUNCTION admin.delete_account_as(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION admin.delete_account_as(uuid, text) TO cairn_admin;

-- ── Takedown levers: moderate_* (soft) / purge_* (hard) ────────────
-- (docs/admin.md § moderate/purge). Each snapshots the pre-state into
-- the audit payload and inserts the audit row BEFORE mutating, so an
-- empty reason aborts the whole action at the admin.actions CHECK.
--
-- moderate_* attributes the soft-delete to the tombstone. The BEFORE
-- UPDATE attribution trigger (tg_set_attribution_items/_lists) derives
-- deleted_by from public.uid() on the live→deleted transition, and an
-- admin RPC has no JWT — so a deleted_by set directly in the UPDATE
-- would be overwritten with NULL. We set request.jwt.claims to the
-- tombstone sub first and let the trigger stamp deleted_by through the
-- normal path. purge_* is a plain DELETE; cascades do the rest.
CREATE OR REPLACE FUNCTION admin.moderate_item(p_target uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE snap jsonb;
BEGIN
  SELECT to_jsonb(i) INTO snap FROM public.items i WHERE id = p_target;
  IF snap IS NULL THEN
    RAISE EXCEPTION 'no such item';
  END IF;

  INSERT INTO admin.actions (actor, effective, action, target, reason, payload)
  VALUES (session_user, current_user, 'moderate_item', p_target, p_reason, snap);

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000000000')::text,
    TRUE
  );

  UPDATE public.items
  SET deleted_at = clock_timestamp()
  WHERE id = p_target AND deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION admin.purge_item(p_target uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE snap jsonb;
BEGIN
  SELECT to_jsonb(i) INTO snap FROM public.items i WHERE id = p_target;
  IF snap IS NULL THEN
    RAISE EXCEPTION 'no such item';
  END IF;

  INSERT INTO admin.actions (actor, effective, action, target, reason, payload)
  VALUES (session_user, current_user, 'purge_item', p_target, p_reason, snap);

  DELETE FROM public.items WHERE id = p_target;
END;
$$;

CREATE OR REPLACE FUNCTION admin.moderate_list(p_target uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE snap jsonb;
BEGIN
  SELECT to_jsonb(l) INTO snap FROM public.lists l WHERE id = p_target;
  IF snap IS NULL THEN
    RAISE EXCEPTION 'no such list';
  END IF;

  INSERT INTO admin.actions (actor, effective, action, target, reason, payload)
  VALUES (session_user, current_user, 'moderate_list', p_target, p_reason, snap);

  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-0000-0000-000000000000')::text,
    TRUE
  );

  UPDATE public.lists
  SET deleted_at = clock_timestamp()
  WHERE id = p_target AND deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION admin.purge_list(p_target uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE snap jsonb;
BEGIN
  SELECT to_jsonb(l) INTO snap FROM public.lists l WHERE id = p_target;
  IF snap IS NULL THEN
    RAISE EXCEPTION 'no such list';
  END IF;

  INSERT INTO admin.actions (actor, effective, action, target, reason, payload)
  VALUES (session_user, current_user, 'purge_list', p_target, p_reason, snap);

  DELETE FROM public.lists WHERE id = p_target;
END;
$$;

ALTER FUNCTION admin.moderate_item(uuid, text) OWNER TO cairn_admin_owner;
ALTER FUNCTION admin.purge_item(uuid, text) OWNER TO cairn_admin_owner;
ALTER FUNCTION admin.moderate_list(uuid, text) OWNER TO cairn_admin_owner;
ALTER FUNCTION admin.purge_list(uuid, text) OWNER TO cairn_admin_owner;
REVOKE ALL ON FUNCTION admin.moderate_item(uuid, text) FROM public;
REVOKE ALL ON FUNCTION admin.purge_item(uuid, text) FROM public;
REVOKE ALL ON FUNCTION admin.moderate_list(uuid, text) FROM public;
REVOKE ALL ON FUNCTION admin.purge_list(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION admin.moderate_item(uuid, text) TO cairn_admin;
GRANT EXECUTE ON FUNCTION admin.purge_item(uuid, text) TO cairn_admin;
GRANT EXECUTE ON FUNCTION admin.moderate_list(uuid, text) TO cairn_admin;
GRANT EXECUTE ON FUNCTION admin.purge_list(uuid, text) TO cairn_admin;

COMMIT;
