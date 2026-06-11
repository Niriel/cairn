-- 0014_delete_account.sql — the `public.delete_account()` RPC, the
-- only sanctioned account-deletion path.
--
-- User-initiated deletion is exposed as a single SECURITY DEFINER
-- function the web app calls via PostgREST RPC. Doing the work
-- server-side in one transaction keeps it atomic and lets the
-- caller's own JWT trigger a delete from auth.users without holding
-- DELETE privileges on that table directly. PostgREST exposes no
-- DELETE on auth.users (it lives in the `auth` schema, not
-- `public`), so this function — with the policy baked into its body,
-- not RLS — is the entire account-deletion surface.
--
-- Teardown, in order (see docs/account-deletion.md "The
-- delete_account function" + "What gets deleted, anonymized, or
-- kept"):
--   1. Guards: NULL uid → 28000 'not authenticated'; tombstone uid →
--      28000 'cannot delete the tombstone user'. Mirrors create_list.
--   2. Hard-delete lists where the caller was the only remaining live
--      member. Their items/votes/member rows cascade.
--   3. Delete the caller's auth.users row, which cascades personal
--      data (profiles, user_settings, votes, the caller's own
--      list_members) and SET-DEFAULTs shared attribution
--      (lists/items/list_members created_by/modified_by/deleted_by)
--      to the tombstone user.
--
-- Order is load-bearing: the sole-member query reads list_members,
-- which the auth.users delete would cascade away. Computing it first
-- is what distinguishes a sole-member list (hard-delete) from a
-- shared one (anonymize attribution, keep the list).
--
-- Single BEGIN; … COMMIT; transaction so a mid-migration abort leaves
-- no half-applied state (matches 0010_invite_cascades.sql).

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid := public.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF uid = '00000000-0000-0000-0000-000000000000' THEN
    RAISE EXCEPTION 'cannot delete the tombstone user'
    USING errcode = '28000';
  END IF;

  -- Hard-delete lists where the deleted user was the only remaining
  -- live member. Items, member rows, and votes cascade with the list.
  DELETE FROM public.lists AS l
  WHERE NOT EXISTS (
    SELECT 1 FROM public.list_members AS lm
    WHERE
      lm.list_id = l.id
      AND lm.deleted_at IS NULL
      AND lm.user_id <> uid
  );

  -- Delete the auth row. Cascades:
  --   profiles       → cascade
  --   user_settings  → cascade
  --   votes          → cascade
  --   list_members   → cascade (where user_id = uid)
  --   created_by / modified_by / deleted_by → set default (tombstone)
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_account() FROM public;
GRANT EXECUTE ON FUNCTION public.delete_account() TO authenticated;

COMMIT;
