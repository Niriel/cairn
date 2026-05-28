-- 0009_invitations.sql — adds the `invitations` table, its
-- `invitations_select` RLS policy, the three invite RPCs
-- (send_invitation, accept_invitation, decline_invitation), and
-- the t40_block_declines_invitations AFTER trigger on
-- public.relationships that auto-declines pending invites from a
-- newly-blocked user.
--
-- Mirrors docs/invites.md → "invitations", "RLS and stored
-- procedures", "The send_invitation function (sketch)", "The
-- accept_invitation function (sketch)", "The decline_invitation
-- function (sketch)". Single BEGIN; … COMMIT; transaction so a
-- mid-migration abort leaves no half-applied state.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. invitations table.
-- ---------------------------------------------------------------------
-- (created_by, target_user_id) FK to auth.users uses ON DELETE
-- CASCADE — invitations are pending state with no audit value
-- once either side is gone (docs/invites.md → "Cascade behaviour
-- on account deletion"). list_id FK to lists also cascades:
-- deleting a list deletes any pending invites for it.
CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL
  REFERENCES public.lists (id) ON DELETE CASCADE,
  created_by uuid NOT NULL
  REFERENCES auth.users (id) ON DELETE CASCADE,
  target_user_id uuid
  REFERENCES auth.users (id) ON DELETE CASCADE,
  target_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  modified_at timestamptz NOT NULL DEFAULT now(),
  CHECK (target_user_id IS NOT NULL OR target_email IS NOT NULL)
);

-- One pending user-keyed invite per (list, target). Partial so the
-- email-keyed shape (target_user_id IS NULL) lives under its own
-- unique index.
CREATE UNIQUE INDEX invitations_target_user_uniq
ON public.invitations (list_id, target_user_id)
WHERE target_user_id IS NOT NULL;

-- One pending email-keyed invite per (list, lowered email). Case-
-- folded so 'Alice@x' and 'alice@x' are the same pending invite.
CREATE UNIQUE INDEX invitations_target_email_uniq
ON public.invitations (list_id, lower(target_email))
WHERE target_email IS NOT NULL AND target_user_id IS NULL;

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- SELECT only; INSERT/DELETE happen via the RPCs below. No UPDATE
-- grant either — invitations have no mutable payload (v1).
GRANT SELECT ON public.invitations TO authenticated;

-- t05_* — universal timestamp guard (set on INSERT, freeze on UPDATE).
-- No tg_set_modified_at binding: invitations has no mutable payload
-- columns; the timestamp guard alone is enough.
CREATE TRIGGER t05_set_timestamps
BEFORE INSERT OR UPDATE ON public.invitations
FOR EACH ROW EXECUTE FUNCTION public.tg_set_timestamps();

-- ---------------------------------------------------------------------
-- 2. RLS policy: visible to both inviter (created_by) and invitee
--    (target_user_id). Email-keyed rows are only visible to the
--    inviter until the invite is claimed.
-- ---------------------------------------------------------------------
CREATE POLICY invitations_select ON public.invitations
FOR SELECT USING (
  created_by = public.uid() OR target_user_id = public.uid()
);

-- ---------------------------------------------------------------------
-- 3. send_invitation — the only path to INSERT into invitations.
-- ---------------------------------------------------------------------
-- SECURITY DEFINER because the policy/block checks read other
-- users' user_settings.invite_policy and relationships rows,
-- which owner-only RLS would otherwise hide. `search_path =
-- public, auth` so the auth.users email lookup is unambiguous.
--
-- The 8-step check sequence from docs/invites.md:
--   1. Inviter-membership   → raise P0001
--   2. Resolve target       → raise P0001 if neither arg given
--   3. Self-invite          → raise P0001
--   4. Existing live member → raise P0001
--   5. Existing invite      → return existing id (idempotent)
--   6. Block check          → return NULL (silent)
--   7. Policy check         → return NULL (silent)
--   8. INSERT (with TOCTOU recovery via EXCEPTION WHEN unique_violation)
CREATE OR REPLACE FUNCTION public.send_invitation(
  p_list_id uuid,
  p_email text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  inviter       uuid := public.uid();
  target        uuid;
  policy        text;
  in_circle     boolean;
  invitation_id uuid;
BEGIN
  -- Step 1: inviter must be a live member of the list.
  IF NOT public.is_list_member(p_list_id) THEN
    RAISE EXCEPTION 'not a list member';
  END IF;

  -- Step 2: resolve target.
  IF p_user_id IS NOT NULL THEN
    target := p_user_id;
  ELSIF p_email IS NOT NULL THEN
    SELECT id INTO target FROM auth.users
    WHERE lower(email) = lower(p_email);
  ELSE
    RAISE EXCEPTION 'must provide p_email or p_user_id';
  END IF;

  -- Step 3: self-invite.
  IF target = inviter THEN
    RAISE EXCEPTION 'self-invite';
  END IF;

  -- Step 4: existing live membership (deleted_at IS NULL — a
  -- soft-deleted member is treated as non-member and may be
  -- re-invited).
  IF target IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.list_members
    WHERE list_id = p_list_id
      AND user_id = target
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'already a member';
  END IF;

  -- Step 5: existing invite — short-circuit and return the
  -- pending row's id (idempotent re-send).
  IF target IS NOT NULL THEN
    SELECT id INTO invitation_id FROM public.invitations
    WHERE list_id = p_list_id AND target_user_id = target;
  ELSE
    SELECT id INTO invitation_id FROM public.invitations
    WHERE list_id = p_list_id
      AND target_user_id IS NULL
      AND lower(target_email) = lower(p_email);
  END IF;
  IF invitation_id IS NOT NULL THEN
    RETURN invitation_id;
  END IF;

  -- Steps 6 & 7 only run when target is a known user — unregistered
  -- email targets skip block/policy checks (they have no settings or
  -- relationships rows yet).
  IF target IS NOT NULL THEN
    -- Step 6: block check ("block always wins" — checked before policy).
    IF EXISTS (
      SELECT 1 FROM public.relationships
      WHERE user_id = target
        AND other_user_id = inviter
        AND status = 'blocked'
    ) THEN
      RETURN NULL;
    END IF;

    -- Step 7: policy check.
    SELECT invite_policy INTO policy FROM public.user_settings
    WHERE id = target;
    IF policy = 'nobody' THEN
      RETURN NULL;
    END IF;
    IF policy = 'circle' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.relationships
        WHERE user_id = target
          AND other_user_id = inviter
          AND status = 'circle'
      ) INTO in_circle;
      IF NOT in_circle THEN
        RETURN NULL;
      END IF;
    END IF;
  END IF;

  -- Step 8: INSERT with TOCTOU recovery — a concurrent session that
  -- inserts the same (list, target) pair between step 5 and step 8
  -- trips the unique index; recover by re-selecting the winner.
  BEGIN
    INSERT INTO public.invitations
    (list_id, created_by, target_user_id, target_email)
    VALUES (
      p_list_id, inviter, target,
      CASE WHEN target IS NULL THEN p_email END
    )
    RETURNING id INTO invitation_id;
  EXCEPTION WHEN unique_violation THEN
    IF target IS NOT NULL THEN
      SELECT id INTO invitation_id FROM public.invitations
      WHERE list_id = p_list_id AND target_user_id = target;
    ELSE
      SELECT id INTO invitation_id FROM public.invitations
      WHERE list_id = p_list_id
        AND target_user_id IS NULL
        AND lower(target_email) = lower(p_email);
    END IF;
  END;

  RETURN invitation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.send_invitation(uuid, text, uuid)
FROM public;
GRANT EXECUTE ON FUNCTION public.send_invitation(uuid, text, uuid)
TO authenticated;

-- ---------------------------------------------------------------------
-- 4. accept_invitation — claim a pending invite.
-- ---------------------------------------------------------------------
-- SECURITY DEFINER because the invitee isn't a member of the list
-- yet, so the INSERT into list_members needs to bypass the absence
-- of a direct INSERT grant. `IS DISTINCT FROM` (not `<>`) makes a
-- NULL target_user_id (email-keyed row) correctly raise.
-- created_by on the list_members INSERT is stamped by
-- tg_set_attribution_list_members (public.uid() on fresh INSERT,
-- preserved on restore via the tombstone-gated freeze in
-- 0004_domain_schema.sql), so we deliberately pass only
-- (list_id, user_id).
CREATE OR REPLACE FUNCTION public.accept_invitation(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.invitations%rowtype;
BEGIN
  SELECT * INTO inv FROM public.invitations WHERE id = p_invitation_id;
  IF NOT found THEN
    RAISE EXCEPTION 'invitation not found';
  END IF;

  IF inv.target_user_id IS DISTINCT FROM public.uid() THEN
    RAISE EXCEPTION 'not your invitation';
  END IF;

  -- Restore soft-deleted membership or create fresh; the ON
  -- CONFLICT clause is what handles a concurrent accept by the
  -- same user in two sessions.
  INSERT INTO public.list_members (list_id, user_id)
  VALUES (inv.list_id, public.uid())
  ON CONFLICT (list_id, user_id) DO UPDATE
  SET deleted_at = NULL, deleted_by = NULL;

  DELETE FROM public.invitations WHERE id = p_invitation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_invitation(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 5. decline_invitation — hard-delete a pending invite addressed to
-- the caller. Mirrors accept_invitation's IS DISTINCT FROM guard.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decline_invitation(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.invitations%rowtype;
BEGIN
  SELECT * INTO inv FROM public.invitations WHERE id = p_invitation_id;
  IF NOT found THEN
    RAISE EXCEPTION 'invitation not found';
  END IF;

  IF inv.target_user_id IS DISTINCT FROM public.uid() THEN
    RAISE EXCEPTION 'not your invitation';
  END IF;

  DELETE FROM public.invitations WHERE id = p_invitation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.decline_invitation(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.decline_invitation(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 6. tg_block_declines_invitations — AFTER trigger on relationships
-- that hard-deletes any pending invites from a newly-blocked user.
-- ---------------------------------------------------------------------
-- The first AFTER trigger in the schema, so it gets the t40_*
-- prefix (the lowest free slot above t01/t05/t10/t20). SECURITY
-- DEFINER because the DELETE acts on the OTHER user's invitation
-- row (created_by = new.other_user_id, not the caller), which
-- invitations_select's owner-or-target gate would otherwise hide.
CREATE OR REPLACE FUNCTION public.tg_block_declines_invitations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new.status = 'blocked' THEN
    DELETE FROM public.invitations
    WHERE created_by = new.other_user_id
      AND target_user_id = new.user_id;
  END IF;
  RETURN new;
END;
$$;

-- AFTER INSERT OR UPDATE OF status — fires when the user_id row's
-- view of other_user_id transitions to blocked, whether via fresh
-- insert (no prior row) or status change (was 'circle').
CREATE TRIGGER t40_block_declines_invitations
AFTER INSERT OR UPDATE OF status ON public.relationships
FOR EACH ROW EXECUTE FUNCTION public.tg_block_declines_invitations();

COMMIT;
