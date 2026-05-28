-- 0008_relationships.sql — adds the `relationships` table (the
-- combined circle + block table; status is either 'circle' or
-- 'blocked', never both), its four RLS policies, the PK-freeze
-- trigger that closes the consent-bypass `t01_*` slot, the t05
-- timestamp guard and t20 modified_at bump, the GRANT matrix, and
-- the two circle RPCs (add_circle_by_email — mutual; and
-- add_circle_by_id — one-sided).
--
-- Mirrors docs/invites.md → "relationships", "RLS and stored
-- procedures", "The add_circle_by_email function", "The
-- add_circle_by_id function". Single BEGIN; … COMMIT;
-- transaction so a mid-migration abort leaves no half-applied
-- state.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. relationships table.
-- ---------------------------------------------------------------------
-- (user_id, other_user_id) is directional — "user_id's view of
-- other_user_id." Symmetric circle is two rows; the schema does
-- not enforce symmetry. `status` is mutually exclusive (a pair is
-- either circle or blocked, never both). `ON DELETE CASCADE` on
-- both FKs: relationships are purely personal data; nothing
-- shared to preserve when either side deletes their account
-- (`docs/invites.md` → "Cascade behaviour on account deletion").
CREATE TABLE public.relationships (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  other_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('circle', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  modified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, other_user_id),
  CHECK (user_id <> other_user_id)
);

ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.relationships
TO authenticated;

-- ---------------------------------------------------------------------
-- 2. tg_freeze_relationships_pk — mirrors tg_freeze_list_members_pk.
-- ---------------------------------------------------------------------
-- The relationships PK is (user_id, other_user_id). The RLS
-- policies' WITH CHECK on UPDATE only requires user_id =
-- public.uid(); without this freeze, a row owner could PATCH
-- `other_user_id` to point at a third user, silently rewriting
-- "who I have in my circle" without any UI for it. Closes that
-- consent-bypass at the t01_* slot so the freeze short-circuits
-- before t05 / t20 do any per-row work.
CREATE OR REPLACE FUNCTION public.tg_freeze_relationships_pk()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF new.user_id IS DISTINCT FROM old.user_id
    OR new.other_user_id IS DISTINCT FROM old.other_user_id THEN
    RAISE EXCEPTION 'relationships PK columns are immutable';
  END IF;
  RETURN new;
END;
$$;

-- ---------------------------------------------------------------------
-- 3. Trigger bindings.
-- ---------------------------------------------------------------------
-- t01_* — freeze, runs first.
CREATE TRIGGER t01_freeze_relationships_pk
BEFORE UPDATE ON public.relationships
FOR EACH ROW EXECUTE FUNCTION public.tg_freeze_relationships_pk();

-- t05_* — universal timestamp guard (set on INSERT, freeze on UPDATE).
CREATE TRIGGER t05_set_timestamps
BEFORE INSERT OR UPDATE ON public.relationships
FOR EACH ROW EXECUTE FUNCTION public.tg_set_timestamps();

-- t20_* — modified_at bump on status change only. No attribution
-- columns on this table, so a narrow OF list is the whole defence
-- against gratuitous bumps.
CREATE TRIGGER t20_set_modified_at
BEFORE UPDATE OF status ON public.relationships
FOR EACH ROW EXECUTE FUNCTION public.tg_set_modified_at();

-- ---------------------------------------------------------------------
-- 4. RLS policies — exactly per docs/invites.md.
-- ---------------------------------------------------------------------
-- Visible only to the owner; the *other* user does NOT get to see
-- whether someone has them in their circle or has blocked them.
-- A user's circle is their private setting on themselves.
CREATE POLICY relationships_select ON public.relationships
FOR SELECT USING (user_id = public.uid());

CREATE POLICY relationships_insert ON public.relationships
FOR INSERT WITH CHECK (user_id = public.uid());

CREATE POLICY relationships_update ON public.relationships
FOR UPDATE USING (user_id = public.uid())
WITH CHECK (user_id = public.uid());

CREATE POLICY relationships_delete ON public.relationships
FOR DELETE USING (user_id = public.uid());

-- ---------------------------------------------------------------------
-- 5. add_circle_by_email — mutual two-row outcome (block beats it).
-- ---------------------------------------------------------------------
-- `SECURITY DEFINER` because the symmetric Bob -> Alice row writes
-- in *the other user's* direction (`user_id = target`), which
-- relationships_insert's WITH CHECK would otherwise forbid.
-- `search_path = public, auth` so the auth.users lookup is
-- unambiguous regardless of caller search_path. Raises on
-- not-found and self-add — see docs/invites.md → "Why
-- add_circle_by_email is allowed to raise on an unregistered
-- address" for why this RPC is *not* anti-enumeration-silent.
-- "Block always wins" enforced by the ON CONFLICT … DO UPDATE …
-- WHERE status <> 'blocked' clause on each upsert: an existing
-- blocked row matches the conflict target but fails the WHERE,
-- so the UPDATE is silently skipped.
CREATE OR REPLACE FUNCTION public.add_circle_by_email(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  me     uuid := public.uid();
  target uuid;
BEGIN
  SELECT id INTO target FROM auth.users WHERE lower(email) = lower(p_email);
  IF target IS NULL THEN
    RAISE EXCEPTION 'no such user';
  END IF;
  IF target = me THEN
    RAISE EXCEPTION 'cannot add yourself';
  END IF;

  -- Always: Alice -> Bob, unless Alice has Bob blocked (in which
  -- case the existing blocked row is preserved).
  INSERT INTO public.relationships (user_id, other_user_id, status)
  VALUES (me, target, 'circle')
  ON CONFLICT (user_id, other_user_id) DO UPDATE
  SET status = 'circle'
  WHERE public.relationships.status <> 'blocked';

  -- Mutual: Bob -> Alice, unless Bob has Alice blocked (block-
  -- skips-mutual). If Bob already has Alice in his circle, the
  -- upsert keeps status = 'circle'.
  INSERT INTO public.relationships (user_id, other_user_id, status)
  VALUES (target, me, 'circle')
  ON CONFLICT (user_id, other_user_id) DO UPDATE
  SET status = 'circle'
  WHERE public.relationships.status <> 'blocked';
END;
$$;

REVOKE ALL ON FUNCTION public.add_circle_by_email(text) FROM public;
GRANT EXECUTE ON FUNCTION public.add_circle_by_email(text) TO authenticated;

-- ---------------------------------------------------------------------
-- 6. add_circle_by_id — one-sided tap-add (caller's block preserved).
-- ---------------------------------------------------------------------
-- Tap-add path: writes only the caller's own row. Includes an
-- explicit existence check against auth.users so a stale profile
-- id surfaces as `no such user` (P0001) rather than the raw FK
-- 23503 the upsert would otherwise produce. SECURITY DEFINER is
-- not strictly required for the write itself (the caller's own
-- row satisfies the insert policy), but matches add_circle_by_email
-- so both RPCs sit at the same privilege tier — and the explicit
-- auth.users SELECT does want to bypass any future RLS on that
-- table.
CREATE OR REPLACE FUNCTION public.add_circle_by_id(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  me     uuid := public.uid();
  target uuid;
BEGIN
  IF p_user_id = me THEN
    RAISE EXCEPTION 'cannot add yourself';
  END IF;

  SELECT id INTO target FROM auth.users WHERE id = p_user_id;
  IF target IS NULL THEN
    RAISE EXCEPTION 'no such user';
  END IF;

  INSERT INTO public.relationships (user_id, other_user_id, status)
  VALUES (me, p_user_id, 'circle')
  ON CONFLICT (user_id, other_user_id) DO UPDATE
  SET status = 'circle'
  WHERE public.relationships.status <> 'blocked';
END;
$$;

REVOKE ALL ON FUNCTION public.add_circle_by_id(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.add_circle_by_id(uuid) TO authenticated;

COMMIT;
