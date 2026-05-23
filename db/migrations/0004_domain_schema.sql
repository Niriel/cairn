-- 0004_domain_schema.sql — Tier 1+2 domain schema (profiles,
-- user_settings, lists, list_members, items, votes), plus the
-- read-side helpers, attribution / timestamp / freeze triggers,
-- the three views, the create_list RPC, and the GRANT matrix.
--
-- Mirrors docs/data-model.md (canonical) and is exercised by the
-- pgTAP suite under db/tests/. Body order matches PLAN.md →
-- Architecture → New files → 0004_domain_schema.sql. Each CREATE
-- TABLE is immediately followed by ALTER TABLE … ENABLE ROW LEVEL
-- SECURITY, so a mid-migration abort leaves no half-enabled window.
--
-- Replaces the walking-skeleton public.profiles table from
-- 0001_init.sql: gated DROP keyed on `to_regclass('public.user_settings')
-- IS NULL` (the cheapest unambiguous "post-0004 schema not yet in
-- place" sentinel — see PLAN.md Decisions).

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Drop the smoke `profiles` table.
-- ---------------------------------------------------------------------
-- Gate on user_settings absence: a column-shape predicate against
-- profiles would be wrong (the new profiles is shape-compatible
-- with the smoke profiles for any straightforward predicate, and
-- a wrong gate would irreversibly drop real data). The guard's
-- only job is to prevent the irreversible DROP on a re-run; it is
-- *not* a back door to making 0004 re-runnable — the CREATE TABLE
-- statements below will fail on a second run regardless.
DO $$
BEGIN
  IF to_regclass('public.user_settings') IS NULL THEN
    DROP TABLE IF EXISTS public.profiles;
  END IF;
END$$;

-- ---------------------------------------------------------------------
-- 2. public.uid() — JWT sub-claim helper.
-- ---------------------------------------------------------------------
-- Reads PostgREST v10+'s `request.jwt.claims` JSON GUC; the per-
-- claim `request.jwt.claim.<name>` GUCs were removed in v10. Lives
-- in `public` rather than `auth` so a future GoTrue release can't
-- clobber it. `SECURITY INVOKER` (default) — schema-shadowing this
-- function can't elevate privilege; `SET search_path = public` is
-- hygiene kept for structural symmetry with the membership helper.
CREATE FUNCTION public.uid() RETURNS uuid
LANGUAGE sql STABLE
SET search_path = public
AS $$
SELECT (
  (nullif(current_setting('request.jwt.claims', TRUE), ''))::jsonb ->> 'sub'
)::uuid;
$$;

-- ---------------------------------------------------------------------
-- 3. Tombstone auth.users row — the sentinel every soft-delete /
--    account-deletion attribution repoints to.
-- ---------------------------------------------------------------------
-- Inserted *before* tg_profile_on_signup is attached, so there is
-- no recursive trigger fire here. The two-column (id, email) shape
-- is the minimum that works against pinned supabase/gotrue v2.158.1
-- — see docs/account-deletion.md "auth.users columns the tombstone
-- insert depends on" for the rationale and the upgrade caveat.
INSERT INTO auth.users (id, email) VALUES
('00000000-0000-0000-0000-000000000000', NULL)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. profiles + tombstone profile row.
-- ---------------------------------------------------------------------
-- Cross-user identity. World-readable to authenticated callers per
-- profiles_select below; email stays in auth.users and is never
-- exposed via PostgREST. Anything private-and-personal goes in
-- user_settings (below), not here.
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  modified_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

INSERT INTO public.profiles (id, display_name) VALUES
('00000000-0000-0000-0000-000000000000', 'Deleted user')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4b. user_settings — owner-only personal preferences.
-- ---------------------------------------------------------------------
-- Structural privacy: one owner-only policy means every column
-- here is private by virtue of the table it lives in. No
-- tombstone settings row: no caller can ever claim the tombstone
-- UUID, so it would have no reader. invite_policy is the only
-- column today; tomorrow's private-and-follow-the-user fields go
-- here too.
CREATE TABLE public.user_settings (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  invite_policy text NOT NULL DEFAULT 'everybody'
  CHECK (invite_policy IN ('everybody', 'circle', 'nobody')),
  created_at timestamptz NOT NULL DEFAULT now(),
  modified_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 5. lists.
-- ---------------------------------------------------------------------
-- created_by / deleted_by use ON DELETE SET DEFAULT with the
-- column DEFAULT set to the tombstone UUID — that's how account
-- deletion repoints attribution at once (see Risk #11 in PLAN.md
-- for why deleted_by needs a trigger override on INSERT). No
-- modified_by — list-level edits are rare and the audit value is
-- low; per-item modified_by covers attribution where it matters.
CREATE TABLE public.lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- `name` is a non-reserved Postgres keyword and is fine unquoted; the
  -- linter's strict policy flags it anyway. The canonical schema uses
  -- the bare identifier across docs, tests, and the API — renaming or
  -- double-quoting would cascade invasively for zero behavioural gain.
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200), --noqa: RF04
  description text CHECK (description IS NULL OR length(description) <= 2000),
  created_by uuid NOT NULL
  DEFAULT '00000000-0000-0000-0000-000000000000'
  REFERENCES auth.users (id) ON DELETE SET DEFAULT,
  deleted_by uuid
  DEFAULT '00000000-0000-0000-0000-000000000000'
  REFERENCES auth.users (id) ON DELETE SET DEFAULT,
  created_at timestamptz NOT NULL DEFAULT now(),
  modified_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;

CREATE INDEX lists_not_deleted_idx ON public.lists (id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- 6. list_members — the join table that determines membership.
-- ---------------------------------------------------------------------
-- list_id / user_id are CASCADE (membership is personal); the
-- created_by / deleted_by attribution FKs are SET DEFAULT to the
-- tombstone (same anonymize-don't-cascade pattern as lists.created_by).
-- PK is mutable-by-policy and frozen by t01_freeze_list_members_pk
-- below; see Risk #13.
CREATE TABLE public.list_members (
  list_id uuid NOT NULL REFERENCES public.lists (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_by uuid NOT NULL
  DEFAULT '00000000-0000-0000-0000-000000000000'
  REFERENCES auth.users (id) ON DELETE SET DEFAULT,
  deleted_by uuid
  DEFAULT '00000000-0000-0000-0000-000000000000'
  REFERENCES auth.users (id) ON DELETE SET DEFAULT,
  created_at timestamptz NOT NULL DEFAULT now(),
  modified_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (list_id, user_id)
);
ALTER TABLE public.list_members ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 7. items.
-- ---------------------------------------------------------------------
-- Three attribution FKs (created_by, modified_by, deleted_by) all
-- SET DEFAULT to the tombstone. The (list_id, created_at) partial
-- index where deleted_at IS NULL is what items_ranked's per-list
-- query reads against.
CREATE TABLE public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.lists (id) ON DELETE CASCADE,
  -- `name` keyword-as-identifier — same rationale as on lists.name above.
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 500), --noqa: RF04
  notes text,
  created_by uuid NOT NULL
  DEFAULT '00000000-0000-0000-0000-000000000000'
  REFERENCES auth.users (id) ON DELETE SET DEFAULT,
  modified_by uuid NOT NULL
  DEFAULT '00000000-0000-0000-0000-000000000000'
  REFERENCES auth.users (id) ON DELETE SET DEFAULT,
  deleted_by uuid
  DEFAULT '00000000-0000-0000-0000-000000000000'
  REFERENCES auth.users (id) ON DELETE SET DEFAULT,
  created_at timestamptz NOT NULL DEFAULT now(),
  modified_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

CREATE INDEX items_list_active_idx
ON public.items (list_id, created_at)
WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- 8. votes — hard-delete model. No deleted_at, no `*_deleted` view.
-- ---------------------------------------------------------------------
CREATE TABLE public.votes (
  item_id uuid NOT NULL REFERENCES public.items (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- `value` keyword-as-identifier — same rationale as lists.name.
  value smallint NOT NULL CHECK (value BETWEEN -3 AND 3 AND value <> 0), --noqa: RF04
  created_at timestamptz NOT NULL DEFAULT now(),
  modified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 9. is_list_member(uuid) — used by most policies.
-- ---------------------------------------------------------------------
-- SECURITY DEFINER lets this read list_members without itself
-- being subject to RLS (otherwise it would chicken-and-egg).
-- SET search_path = public defeats schema-shadowing privilege
-- escalation: the function runs as its cairn-superuser owner, so
-- a shadowed public.list_members would let a caller exfiltrate
-- membership rows. The filter on `deleted_at IS NULL` is what
-- makes a soft-removed member fall out of membership (load-
-- bearing for the trash views' "former member sees nothing" rule).
CREATE OR REPLACE FUNCTION public.is_list_member(target_list uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT EXISTS (
  SELECT 1
  FROM public.list_members
  WHERE list_id = target_list
    AND user_id = public.uid()
    AND deleted_at IS NULL
);
$$;

-- ---------------------------------------------------------------------
-- 9b. is_items_list_member(uuid) — for votes_select only.
-- ---------------------------------------------------------------------
-- The `security definer` here is load-bearing, not stylistic
-- (Risk #14): votes_select needs to see historical votes on
-- soft-deleted items (the trash UI's "at the time, +2 from Bob,
-- -1 from Carol" rendering). An inline `EXISTS (SELECT 1 FROM
-- public.items …)` in the policy body would be filtered by
-- items_select's `deleted_at IS NULL` (Postgres applies RLS
-- recursively to subqueries within policy bodies). Wrapping the
-- items lookup in a SECURITY DEFINER helper bypasses the
-- recursion. votes_insert / votes_update deliberately keep their
-- inline subqueries — they *want* the recursive deleted_at filter.
CREATE OR REPLACE FUNCTION public.is_items_list_member(target_item uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT EXISTS (
  SELECT 1 FROM public.items AS i
  WHERE i.id = target_item
    AND public.is_list_member(i.list_id)
);
$$;

-- ---------------------------------------------------------------------
-- 10. Trigger functions (un-prefixed) and bindings (prefixed).
-- ---------------------------------------------------------------------

-- tg_profile_on_signup ------------------------------------------------
-- The only SECURITY DEFINER trigger in the schema: auth.users is
-- inserted into by the gotrue role (not authenticated), and
-- neither profiles nor user_settings has an INSERT policy or
-- INSERT grant, so the cross-schema writes need to escalate.
-- Skips on `new.id = tombstone` so the manually-seeded tombstone
-- profile isn't double-handled and the tombstone deliberately
-- doesn't get a user_settings row. Uses `ON CONFLICT (id) DO
-- NOTHING` for defence-in-depth.
CREATE OR REPLACE FUNCTION public.tg_profile_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new.id = '00000000-0000-0000-0000-000000000000' THEN
    RETURN new;
  END IF;
  INSERT INTO public.profiles (id, display_name)
  VALUES (new.id, 'New user')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_settings (id, invite_policy)
  VALUES (new.id, 'everybody')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- Binding stays un-prefixed: AFTER INSERT on auth.users, no
-- co-firing trigger in the bucket. Risk #15: a future
-- supabase/gotrue image bump that handles a schema change by
-- `DROP TABLE auth.users; CREATE TABLE auth.users …` silently
-- takes this trigger with it. See docs/account-deletion.md
-- "Caveat for future GoTrue upgrades" for the post-bump checklist.
CREATE TRIGGER tg_profile_on_signup
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.tg_profile_on_signup();

-- tg_set_timestamps ----------------------------------------------------
-- Universal timestamp guard. INSERT: forces both timestamps to
-- clock_timestamp(), overriding any client value. UPDATE: freezes
-- both via NEW := OLD, so a PATCH body can never pin a client
-- timestamp. `clock_timestamp()` rather than `now()` so per-call
-- monotonicity holds inside a single transaction (the t05 → t20
-- ordering needs strict-greater on modified_at for re-vote and
-- bump assertions).
CREATE OR REPLACE FUNCTION public.tg_set_timestamps()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF tg_op = 'INSERT' THEN
    new.created_at := clock_timestamp();
    new.modified_at := clock_timestamp();
  ELSIF tg_op = 'UPDATE' THEN
    new.created_at := old.created_at;
    new.modified_at := old.modified_at;
  END IF;
  RETURN new;
END;
$$;

-- tg_set_modified_at ---------------------------------------------------
-- Sole job: stamp modified_at when one of the OF-listed
-- non-attribution columns appears in the SET list. The OF clause
-- is the cascade-skip mechanism for Risk #12.b — ON DELETE SET
-- DEFAULT cascades only touch attribution columns, so the trigger
-- never fires during cascade and modified_at retains its "last
-- content change" value.
CREATE OR REPLACE FUNCTION public.tg_set_modified_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.modified_at := clock_timestamp();
  RETURN new;
END;
$$;

-- tg_set_attribution_lists --------------------------------------------
-- INSERT: created_by := public.uid(), deleted_by := NULL (the
-- forced NULL is load-bearing — the column DEFAULT is the
-- tombstone for cascade purposes, so without this override every
-- live row would silently render as "deleted by Deleted user";
-- Risk #11).
-- UPDATE: per-rule tombstone gates so cascade SET DEFAULT
-- transitions pass through unmodified while client-side spoofs
-- are still reverted (Risk #12.a).
CREATE OR REPLACE FUNCTION public.tg_set_attribution_lists()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF tg_op = 'INSERT' THEN
    new.created_by := public.uid();
    new.deleted_by := NULL;
    RETURN new;
  END IF;

  -- created_by freeze, tombstone-gated.
  IF new.created_by IS DISTINCT FROM '00000000-0000-0000-0000-000000000000' THEN
    new.created_by := old.created_by;
  END IF;

  -- deleted_at transition decides deleted_by.
  IF old.deleted_at IS NULL AND new.deleted_at IS NOT NULL THEN
    new.deleted_by := public.uid();
  ELSIF old.deleted_at IS NOT NULL AND new.deleted_at IS NULL THEN
    new.deleted_by := NULL;
  ELSE
    -- deleted_at unchanged or re-stamped — anti-spoof freeze,
    -- tombstone-gated so the cascade-to-tombstone transition
    -- on `deleted_by` is allowed through.
    IF new.deleted_by IS DISTINCT FROM '00000000-0000-0000-0000-000000000000'
    THEN
      new.deleted_by := old.deleted_by;
    END IF;
  END IF;

  RETURN new;
END;
$$;

-- tg_set_attribution_list_members -------------------------------------
-- Same shape as tg_set_attribution_lists (list_members has no
-- modified_by). Kept as a separate function rather than a shared
-- one with TG_TABLE_NAME branching: easier to read, easier to
-- test, future fourth attribution-bearing table just gets its
-- own function in the same shape.
CREATE OR REPLACE FUNCTION public.tg_set_attribution_list_members()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF tg_op = 'INSERT' THEN
    new.created_by := public.uid();
    new.deleted_by := NULL;
    RETURN new;
  END IF;

  IF new.created_by IS DISTINCT FROM '00000000-0000-0000-0000-000000000000' THEN
    new.created_by := old.created_by;
  END IF;

  IF old.deleted_at IS NULL AND new.deleted_at IS NOT NULL THEN
    new.deleted_by := public.uid();
  ELSIF old.deleted_at IS NOT NULL AND new.deleted_at IS NULL THEN
    new.deleted_by := NULL;
  ELSE
    IF new.deleted_by IS DISTINCT FROM '00000000-0000-0000-0000-000000000000'
    THEN
      new.deleted_by := old.deleted_by;
    END IF;
  END IF;

  RETURN new;
END;
$$;

-- tg_set_attribution_items --------------------------------------------
-- MAINTENANCE CONTRACT for the content-detection tuple:
-- `(new.list_id, new.name, new.notes, new.deleted_at)` is part of
-- the gate that closes the ON DELETE SET DEFAULT dangling-FK trap
-- (Risk #12). A future migration that adds a user-mutable payload
-- column (priority, category, label, …) MUST extend this tuple in
-- lockstep, or edits to the new column will silently no-op
-- modified_by rather than stamping the editor — the schema-shape
-- test won't catch this. Same rule applies to any future
-- attribution-bearing table that ships with modified_by. The
-- tuple is always "every user-mutable column — payload plus the
-- soft-delete flag — excluding attribution columns and the
-- created_at/modified_at pair." See docs/data-model.md
-- "Maintenance contract for tg_set_attribution_items".
CREATE OR REPLACE FUNCTION public.tg_set_attribution_items()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF tg_op = 'INSERT' THEN
    new.created_by := public.uid();
    new.modified_by := public.uid();
    new.deleted_by := NULL;
    RETURN new;
  END IF;

  -- created_by freeze, tombstone-gated.
  IF new.created_by IS DISTINCT FROM '00000000-0000-0000-0000-000000000000' THEN
    new.created_by := old.created_by;
  END IF;

  -- Content-aware modified_by: real content edit stamps the
  -- editor; an attribution-only / cascade UPDATE preserves
  -- modified_by via the tombstone-gated freeze on the ELSE branch.
  IF (new.list_id, new.name, new.notes, new.deleted_at)
    IS DISTINCT FROM (old.list_id, old.name, old.notes, old.deleted_at)
  THEN
    new.modified_by := public.uid();
  ELSE
    IF new.modified_by
      IS DISTINCT FROM '00000000-0000-0000-0000-000000000000'
    THEN
      new.modified_by := old.modified_by;
    END IF;
  END IF;

  -- deleted_at transition decides deleted_by.
  IF old.deleted_at IS NULL AND new.deleted_at IS NOT NULL THEN
    new.deleted_by := public.uid();
  ELSIF old.deleted_at IS NOT NULL AND new.deleted_at IS NULL THEN
    new.deleted_by := NULL;
  ELSE
    IF new.deleted_by IS DISTINCT FROM '00000000-0000-0000-0000-000000000000'
    THEN
      new.deleted_by := old.deleted_by;
    END IF;
  END IF;

  RETURN new;
END;
$$;

-- tg_freeze_list_members_pk -------------------------------------------
-- Closes the consent-bypass that list_members_update's `… OR
-- user_id = public.uid()` clause otherwise leaves open: a member
-- could PATCH their own row's list_id (self-add) or user_id
-- (graft another user) and the policy would let it through (Risk
-- #13). Bound t01_* so it short-circuits before t05 / t10 / t20
-- — no per-row freeze/derive work is wasted on a rejected UPDATE.
CREATE OR REPLACE FUNCTION public.tg_freeze_list_members_pk()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF new.list_id IS DISTINCT FROM old.list_id
    OR new.user_id IS DISTINCT FROM old.user_id THEN
    RAISE EXCEPTION 'list_members PK columns are immutable';
  END IF;
  RETURN new;
END;
$$;

-- Trigger bindings (prefixed) ----------------------------------------
-- t01_* — freeze, runs first.
CREATE TRIGGER t01_freeze_list_members_pk
BEFORE UPDATE ON public.list_members
FOR EACH ROW EXECUTE FUNCTION public.tg_freeze_list_members_pk();

-- t05_* — universal timestamp guard on every timestamped table.
-- Same binding name across tables is fine: trigger names are
-- unique only within a table.
CREATE TRIGGER t05_set_timestamps
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_set_timestamps();

CREATE TRIGGER t05_set_timestamps
BEFORE INSERT OR UPDATE ON public.user_settings
FOR EACH ROW EXECUTE FUNCTION public.tg_set_timestamps();

CREATE TRIGGER t05_set_timestamps
BEFORE INSERT OR UPDATE ON public.lists
FOR EACH ROW EXECUTE FUNCTION public.tg_set_timestamps();

CREATE TRIGGER t05_set_timestamps
BEFORE INSERT OR UPDATE ON public.list_members
FOR EACH ROW EXECUTE FUNCTION public.tg_set_timestamps();

CREATE TRIGGER t05_set_timestamps
BEFORE INSERT OR UPDATE ON public.items
FOR EACH ROW EXECUTE FUNCTION public.tg_set_timestamps();

CREATE TRIGGER t05_set_timestamps
BEFORE INSERT OR UPDATE ON public.votes
FOR EACH ROW EXECUTE FUNCTION public.tg_set_timestamps();

-- t10_* — per-table attribution.
CREATE TRIGGER t10_set_attribution_lists
BEFORE INSERT OR UPDATE ON public.lists
FOR EACH ROW EXECUTE FUNCTION public.tg_set_attribution_lists();

CREATE TRIGGER t10_set_attribution_list_members
BEFORE INSERT OR UPDATE ON public.list_members
FOR EACH ROW EXECUTE FUNCTION public.tg_set_attribution_list_members();

CREATE TRIGGER t10_set_attribution_items
BEFORE INSERT OR UPDATE ON public.items
FOR EACH ROW EXECUTE FUNCTION public.tg_set_attribution_items();

-- t20_* — modified_at bump, gated by OF (non-attribution-cols) so
-- ON DELETE SET DEFAULT cascades (which only touch attribution
-- columns) never fire it.
CREATE TRIGGER t20_set_modified_at
BEFORE UPDATE OF display_name ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_set_modified_at();

CREATE TRIGGER t20_set_modified_at
BEFORE UPDATE OF invite_policy ON public.user_settings
FOR EACH ROW EXECUTE FUNCTION public.tg_set_modified_at();

CREATE TRIGGER t20_set_modified_at
BEFORE UPDATE OF name, description, deleted_at ON public.lists
FOR EACH ROW EXECUTE FUNCTION public.tg_set_modified_at();

CREATE TRIGGER t20_set_modified_at
BEFORE UPDATE OF deleted_at ON public.list_members
FOR EACH ROW EXECUTE FUNCTION public.tg_set_modified_at();

CREATE TRIGGER t20_set_modified_at
BEFORE UPDATE OF list_id, name, notes, deleted_at ON public.items
FOR EACH ROW EXECUTE FUNCTION public.tg_set_modified_at();

CREATE TRIGGER t20_set_modified_at
BEFORE UPDATE OF value ON public.votes
FOR EACH ROW EXECUTE FUNCTION public.tg_set_modified_at();

-- ---------------------------------------------------------------------
-- 11. create_list — the sole sanctioned list-creation path.
-- ---------------------------------------------------------------------
-- Direct POST /lists and direct POST /list_members are closed off
-- (no INSERT grant, no INSERT policy). SECURITY DEFINER lets the
-- underlying writes succeed despite the missing grants. The two
-- in-body guards (uid()-NULL, tombstone-UID) are defence-in-depth
-- on top of the GRANT-layer denial; both raise SQLSTATE 28000.
CREATE OR REPLACE FUNCTION public.create_list(
  name text,
  description text DEFAULT NULL
)
RETURNS public.lists
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := public.uid();
  new_list public.lists;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF uid = '00000000-0000-0000-0000-000000000000' THEN
    RAISE EXCEPTION 'cannot act as the tombstone user'
    USING errcode = '28000';
  END IF;
  INSERT INTO public.lists (name, description)
  VALUES (name, description)
  RETURNING * INTO new_list;
  INSERT INTO public.list_members (list_id, user_id)
  VALUES (new_list.id, uid);
  RETURN new_list;
END;
$$;

-- 12. (Reserved step — `ALTER TABLE … ENABLE ROW LEVEL SECURITY` is
--     issued immediately after each CREATE TABLE above, not here.
--     Step number preserved for stable cross-references.)

-- ---------------------------------------------------------------------
-- 13. RLS policies — exactly per docs/data-model.md.
-- ---------------------------------------------------------------------

-- profiles ---------------------------------------------------------
CREATE POLICY profiles_select ON public.profiles
FOR SELECT USING (public.uid() IS NOT NULL);

CREATE POLICY profiles_update ON public.profiles
FOR UPDATE USING (id = public.uid())
WITH CHECK (id = public.uid());

-- user_settings ----------------------------------------------------
CREATE POLICY user_settings_select ON public.user_settings
FOR SELECT USING (id = public.uid());

CREATE POLICY user_settings_update ON public.user_settings
FOR UPDATE USING (id = public.uid())
WITH CHECK (id = public.uid());

-- lists ------------------------------------------------------------
-- The composite `(deleted_at IS NULL OR deleted_by = public.uid())`
-- disjunct is load-bearing in two halves (see R26 / Risk #16): the
-- `deleted_at IS NULL` half hides soft-deleted rows from non-deleter
-- members' base-table reads (and from items_ranked, which inherits
-- this RLS via security_invoker = TRUE); the `OR deleted_by =
-- public.uid()` half admits the deleter's own transition through
-- the WITH-CHECK-on-new-row that Postgres applies to UPDATEs when
-- the caller has SELECT privilege — without it, every PATCH-based
-- soft-delete UPDATE would be rejected. Cascade-driven repointing
-- of `deleted_by` to the tombstone drops abandoned soft-deletes
-- back to "trash-view only" for everyone (no live caller's uid()
-- is ever the tombstone). Soft-deleted lists remain reachable for
-- non-deleter members through the lists_deleted view, which has
-- its own explicit membership check.
CREATE POLICY lists_select ON public.lists
FOR SELECT USING (
  public.is_list_member(id)
  AND (deleted_at IS NULL OR deleted_by = public.uid())
);

CREATE POLICY lists_update ON public.lists
FOR UPDATE USING (public.is_list_member(id))
WITH CHECK (public.is_list_member(id));

-- No lists_insert (RPC-only via create_list). No lists_delete
-- (soft-delete only).

-- list_members -----------------------------------------------------
-- The `OR user_id = public.uid()` disjunct on list_members_select
-- is the symmetric closure to list_members_update's WITH CHECK
-- (see R26 / Risk #16): Postgres applies SELECT policies as WITH
-- CHECK on the new row of an UPDATE when the caller has SELECT
-- privilege, so a `select using (is_list_member(list_id))` that
-- only admitted live members would reject every self-soft-removal
-- (the new row makes the caller a non-member). The self-row
-- disjunct admits the transition through. The read-visibility
-- side-effect — a kicked user can SELECT their own kicked row —
-- is intentional; it's how the UI surfaces "you were removed."
CREATE POLICY list_members_select ON public.list_members
FOR SELECT USING (
  public.is_list_member(list_id) OR user_id = public.uid()
);

-- The same `OR user_id = public.uid()` disjunct on the WITH CHECK
-- is load-bearing for self-removal (a member's own soft-deleted
-- row no longer satisfies is_list_member()). The freeze trigger
-- t01_freeze_list_members_pk is what closes the PK-mutation
-- escalation that this same clause would otherwise leave open.
CREATE POLICY list_members_update ON public.list_members
FOR UPDATE USING (public.is_list_member(list_id))
WITH CHECK (public.is_list_member(list_id) OR user_id = public.uid());

-- No list_members_insert (RPC-only via create_list / step 6's
-- accept_invitation).

-- items ------------------------------------------------------------
-- Same composite disjunct shape as lists_select (R26 / Risk #16):
-- the `deleted_at IS NULL` half hides soft-deleted items from
-- non-deleter members' base-table reads; the `OR deleted_by =
-- public.uid()` half admits the deleter's own row through the
-- WITH-CHECK-on-new-row that would otherwise reject the
-- PATCH-based soft-delete UPDATE. items_ranked's view body
-- carries `WHERE i.deleted_at IS NULL` to keep the deleter's
-- own soft-deletes out of the live feed too.
CREATE POLICY items_select ON public.items
FOR SELECT USING (
  public.is_list_member(list_id)
  AND (deleted_at IS NULL OR deleted_by = public.uid())
);

CREATE POLICY items_insert ON public.items
FOR INSERT WITH CHECK (
  public.is_list_member(list_id) AND created_by = public.uid()
);

CREATE POLICY items_update ON public.items
FOR UPDATE USING (public.is_list_member(list_id))
WITH CHECK (public.is_list_member(list_id));

-- No items_delete (soft-delete only).

-- votes ------------------------------------------------------------
-- votes_select uses the SECURITY DEFINER helper to bypass
-- items_select's recursive `deleted_at IS NULL` filter — that's
-- what lets the trash UI render historical votes on soft-deleted
-- items (Risk #14). votes_insert / votes_update keep their inline
-- subqueries because they *want* the recursive filter (no voting
-- on soft-deleted items).
CREATE POLICY votes_select ON public.votes
FOR SELECT USING (public.is_items_list_member(item_id));

CREATE POLICY votes_insert ON public.votes
FOR INSERT WITH CHECK (
  user_id = public.uid()
  AND EXISTS (
    SELECT 1 FROM public.items AS i
    WHERE
      -- Outer reference to the votes row being checked. Explicitly
      -- qualified as `public.votes.item_id` so the SQL linter's
      -- RF03 auto-fix doesn't rewrite it to `i.item_id` (which is
      -- nonsense — items has no `item_id` column).
      i.id = public.votes.item_id
      AND i.deleted_at IS NULL
      AND public.is_list_member(i.list_id)
  )
);

CREATE POLICY votes_update ON public.votes
FOR UPDATE USING (
  user_id = public.uid()
  AND EXISTS (
    SELECT 1 FROM public.items AS i
    WHERE
      i.id = public.votes.item_id
      AND i.deleted_at IS NULL
      AND public.is_list_member(i.list_id)
  )
)
WITH CHECK (
  user_id = public.uid()
  AND EXISTS (
    SELECT 1 FROM public.items AS i
    WHERE
      i.id = public.votes.item_id
      AND i.deleted_at IS NULL
      AND public.is_list_member(i.list_id)
  )
);

CREATE POLICY votes_delete ON public.votes
FOR DELETE USING (user_id = public.uid());

-- ---------------------------------------------------------------------
-- 14. Views.
-- ---------------------------------------------------------------------

-- items_ranked: live aggregation, inherits caller's RLS via
-- security_invoker = TRUE. The `WHERE i.deleted_at IS NULL` in
-- the body is load-bearing under the items_select policy that
-- admits the deleter's own soft-deletes through the base table
-- (R26): without it, items_ranked would surface the deleter's
-- own soft-deletes in the live feed.
CREATE VIEW public.items_ranked
WITH (security_invoker = TRUE) AS
SELECT
  i.id,
  i.list_id,
  i.name,
  i.notes,
  i.created_by,
  i.modified_by,
  coalesce(sum(v.value), 0)::int AS score,
  coalesce(count(v.value) FILTER (WHERE v.value > 0), 0)::int
    AS positive_voters,
  coalesce(count(v.value) FILTER (WHERE v.value < 0), 0)::int
    AS negative_voters,
  coalesce(count(v.value), 0)::int AS total_voters,
  i.created_at,
  i.modified_at
FROM public.items AS i
LEFT JOIN public.votes AS v ON i.id = v.item_id
WHERE i.deleted_at IS NULL
GROUP BY i.id;

-- items_deleted: trash view. `security_invoker = FALSE` runs the
-- view as cairn (owner, exempt from RLS) so it can read soft-
-- deleted rows that items_select hides; the explicit
-- public.is_list_member(i.list_id) clause in the body is the
-- *only* authorization gate (Risk #8). The asymmetry vs
-- items_ranked is the whole point of having both views.
CREATE VIEW public.items_deleted
WITH (security_invoker = FALSE) AS
SELECT
  i.id,
  i.list_id,
  i.name,
  i.notes,
  i.created_by,
  i.modified_by,
  i.deleted_by,
  i.created_at,
  i.modified_at,
  i.deleted_at
FROM public.items AS i
WHERE
  i.deleted_at IS NOT NULL
  AND public.is_list_member(i.list_id);

-- lists_deleted: per-user list trash, same pattern as
-- items_deleted. A former member (soft-removed) fails
-- is_list_member()'s `deleted_at IS NULL` clause and sees nothing.
CREATE VIEW public.lists_deleted
WITH (security_invoker = FALSE) AS
SELECT
  l.id,
  l.name,
  l.description,
  l.created_by,
  l.deleted_by,
  l.created_at,
  l.modified_at,
  l.deleted_at
FROM public.lists AS l
WHERE
  l.deleted_at IS NOT NULL
  AND public.is_list_member(l.id);

-- ---------------------------------------------------------------------
-- 15. Grants. RLS without GRANT silently returns empty via
--     PostgREST (Risk #6); every omission below is asserted in
--     grants.sql as a load-bearing negative.
-- ---------------------------------------------------------------------

-- Tables: per docs/data-model.md and R15.
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, UPDATE ON public.user_settings TO authenticated;
GRANT SELECT, UPDATE ON public.lists TO authenticated;
GRANT SELECT, UPDATE ON public.list_members TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.votes TO authenticated;

-- Views.
GRANT SELECT ON public.items_ranked TO authenticated;
GRANT SELECT ON public.items_deleted TO authenticated;
GRANT SELECT ON public.lists_deleted TO authenticated;

-- Functions: REVOKE EXECUTE FROM PUBLIC first (Postgres defaults
-- to EXECUTE granted to PUBLIC on new functions), then GRANT to
-- authenticated. Anon has no EXECUTE on anything.
REVOKE EXECUTE ON FUNCTION public.uid() FROM public;
GRANT EXECUTE ON FUNCTION public.uid() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_list_member(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_list_member(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_items_list_member(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_items_list_member(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_list(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_list(text, text) TO authenticated;

COMMIT;
