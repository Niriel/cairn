-- 0022_add_by_username.sql — swaps the invite/circle add-key from
-- e-mail to the public username, and retires the (never-built)
-- email-keyed invitation path.
--
-- Mirrors docs/invites.md → "The send_invitation function (sketch)",
-- "invitations", and "Why both paths may raise on an unknown username".
-- The public identity is the username (profiles.username, unique on
-- lower(username) since 0019); resolving it against public.profiles
-- replaces the old auth.users e-mail lookup. A username miss is public,
-- so it raises 'no such user' rather than folding into the silent-fail
-- path. Single BEGIN; … COMMIT; so a mid-migration abort leaves no
-- half-applied state.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. send_invitation — re-keyed on p_username.
-- ---------------------------------------------------------------------
-- CREATE OR REPLACE cannot rename a parameter (p_email → p_username),
-- so DROP + CREATE. The type signature (uuid, text, uuid) is unchanged.
-- search_path drops `auth`: the target now resolves against
-- public.profiles, not auth.users.
DROP FUNCTION public.send_invitation(uuid, text, uuid);

CREATE FUNCTION public.send_invitation(
  p_list_id uuid,
  p_username text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Step 2: resolve target. p_user_id wins when both are given (the
  -- tap-invite path passes it directly). A p_username miss raises
  -- 'no such user' — username existence is public, so the miss is told
  -- truthfully rather than folded into the silent-fail path. target is
  -- non-NULL past this point, so no email-keyed branches remain.
  IF p_user_id IS NOT NULL THEN
    target := p_user_id;
  ELSIF p_username IS NOT NULL THEN
    SELECT id INTO target FROM public.profiles
    WHERE lower(username) = lower(p_username);
    IF target IS NULL THEN
      RAISE EXCEPTION 'no such user';
    END IF;
  ELSE
    RAISE EXCEPTION 'must provide p_username or p_user_id';
  END IF;

  -- Step 3: self-invite.
  IF target = inviter THEN
    RAISE EXCEPTION 'self-invite';
  END IF;

  -- Step 4: existing live membership (a soft-deleted member is treated
  -- as a non-member and may be re-invited).
  IF EXISTS (
    SELECT 1 FROM public.list_members
    WHERE list_id = p_list_id
      AND user_id = target
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'already a member';
  END IF;

  -- Step 5: existing invite — short-circuit and return the pending
  -- row's id (idempotent re-send).
  SELECT id INTO invitation_id FROM public.invitations
  WHERE list_id = p_list_id AND target_user_id = target;
  IF invitation_id IS NOT NULL THEN
    RETURN invitation_id;
  END IF;

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

  -- Step 8: INSERT with TOCTOU recovery — a concurrent session that
  -- inserts the same (list, target) pair between step 5 and step 8
  -- trips the unique index; recover by re-selecting the winner.
  BEGIN
    INSERT INTO public.invitations (list_id, created_by, target_user_id)
    VALUES (p_list_id, inviter, target)
    RETURNING id INTO invitation_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO invitation_id FROM public.invitations
    WHERE list_id = p_list_id AND target_user_id = target;
  END;

  RETURN invitation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.send_invitation(uuid, text, uuid)
FROM public;
GRANT EXECUTE ON FUNCTION public.send_invitation(uuid, text, uuid)
TO authenticated;

-- ---------------------------------------------------------------------
-- 2. invitations — retire the email-keyed path.
-- ---------------------------------------------------------------------
-- The add-key is now the public username, which only exists for
-- registered accounts, so every invite resolves to a real user:
-- target_user_id is NOT NULL and target_email is gone. The email-keyed
-- path was never built (no mail send, nothing converted a target_email
-- row at signup), so there is nothing to migrate — but defensively drop
-- any inert email-keyed rows before the NOT NULL so the migration is
-- safe on a live database.
DELETE FROM public.invitations
WHERE target_user_id IS NULL;

DROP INDEX IF EXISTS public.invitations_target_email_uniq;

-- Dropping the column also drops the multi-column CHECK
-- (target_user_id IS NOT NULL OR target_email IS NOT NULL) that
-- references it — Postgres auto-drops table constraints involving a
-- dropped column.
ALTER TABLE public.invitations DROP COLUMN target_email;

ALTER TABLE public.invitations
ALTER COLUMN target_user_id SET NOT NULL;

-- ---------------------------------------------------------------------
-- 3. add_circle_by_username — mutual circle-add re-keyed on username.
-- ---------------------------------------------------------------------
-- Replaces add_circle_by_email: the manual circle-add now keys on the
-- public username (resolved against public.profiles), not e-mail. The
-- mutual two-row outcome and the "block always wins" ON CONFLICT … DO
-- UPDATE … WHERE status <> 'blocked' upsert are copied verbatim
-- (docs/circles.md → "The username-add path"). Raises 'no such user'
-- on an unknown handle (truthful — usernames are public) and 'cannot
-- add yourself' on self. CREATE OR REPLACE cannot rename the parameter,
-- so DROP + CREATE; search_path drops `auth` since the lookup is now
-- against public.profiles rather than auth.users.
DROP FUNCTION public.add_circle_by_email(text);

CREATE FUNCTION public.add_circle_by_username(p_username text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me     uuid := public.uid();
  target uuid;
BEGIN
  SELECT id INTO target FROM public.profiles
  WHERE lower(username) = lower(p_username);
  IF target IS NULL THEN
    RAISE EXCEPTION 'no such user';
  END IF;
  IF target = me THEN
    RAISE EXCEPTION 'cannot add yourself';
  END IF;

  -- Always: caller -> target, unless the caller has target blocked (in
  -- which case the existing blocked row is preserved).
  INSERT INTO public.relationships (user_id, other_user_id, status)
  VALUES (me, target, 'circle')
  ON CONFLICT (user_id, other_user_id) DO UPDATE
  SET status = 'circle'
  WHERE public.relationships.status <> 'blocked';

  -- Mutual: target -> caller, unless target has the caller blocked
  -- (block-skips-mutual). If target already has the caller in their
  -- circle, the upsert keeps status = 'circle'.
  INSERT INTO public.relationships (user_id, other_user_id, status)
  VALUES (target, me, 'circle')
  ON CONFLICT (user_id, other_user_id) DO UPDATE
  SET status = 'circle'
  WHERE public.relationships.status <> 'blocked';
END;
$$;

REVOKE ALL ON FUNCTION public.add_circle_by_username(text) FROM public;
GRANT EXECUTE ON FUNCTION public.add_circle_by_username(text)
TO authenticated;

COMMIT;
