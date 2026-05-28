-- 0010_invite_cascades.sql — adds two server-side enforcement
-- triggers that close the gaps left by 0009_invitations.sql:
--
--   * tg_apply_invite_policy_cascade (R7) — bound as
--     t40_apply_invite_policy_cascade. AFTER UPDATE OF
--     invite_policy on user_settings, hard-deletes pending
--     invitations to the user whose target_user_id no longer
--     matches the new policy. The send_invitation RPC checks
--     policy at INSERT time but doesn't sweep already-pending
--     rows when a user tightens their setting; this trigger
--     closes that gap.
--
--   * tg_enforce_fifo_cap_invitations (R8) — bound as
--     t30_enforce_fifo_cap (BEFORE INSERT, task 1.2). Caps a
--     user's inbox at 20 pending user-keyed invitations by
--     evicting the oldest row when a 21st arrives. Email-keyed
--     rows (target_user_id IS NULL) are uncapped.
--
-- Single BEGIN; … COMMIT; transaction so a mid-migration abort
-- leaves no half-applied state (matches 0009_invitations.sql).

BEGIN;

-- ---------------------------------------------------------------------
-- 1. tg_apply_invite_policy_cascade — AFTER UPDATE OF invite_policy
--    on user_settings.
-- ---------------------------------------------------------------------
-- SECURITY DEFINER because the DELETE targets invitations whose
-- created_by is some OTHER user; the caller's RLS view of
-- invitations is owner-or-target, which would hide those rows.
-- Same posture as tg_block_declines_invitations in
-- 0009_invitations.sql.
CREATE OR REPLACE FUNCTION public.tg_apply_invite_policy_cascade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF new.invite_policy = 'nobody' THEN
    DELETE FROM public.invitations WHERE target_user_id = new.id;
  ELSIF new.invite_policy = 'circle' THEN
    DELETE FROM public.invitations
    WHERE target_user_id = new.id
      AND NOT EXISTS (
        SELECT 1 FROM public.relationships
        WHERE user_id = new.id
          AND other_user_id = invitations.created_by
          AND status = 'circle'
      );
  END IF;
  -- 'everybody' branch: no-op.
  RETURN new;
END;
$$;

-- WHEN gate skips no-change updates (same-value SET); without it,
-- the body would run on every UPDATE OF invite_policy regardless of
-- whether the value actually changed.
CREATE TRIGGER t40_apply_invite_policy_cascade
AFTER UPDATE OF invite_policy ON public.user_settings
FOR EACH ROW
WHEN (new.invite_policy IS DISTINCT FROM old.invite_policy)
EXECUTE FUNCTION public.tg_apply_invite_policy_cascade();

COMMIT;
