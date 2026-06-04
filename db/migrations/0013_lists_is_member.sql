-- 0013_lists_is_member.sql — computed column gating the Lists
--   collection to lists the caller is actually a member of.
--
-- Background: migration 0012 extended lists_select so an invitee
-- with a pending user-keyed invitation can SELECT the list row — the
-- invite banner embeds lists(name) and needs the real row, not null.
-- A SELECT policy is all-or-nothing per row, so that same readability
-- also leaks invited-but-unaccepted lists into the /lists collection
-- query, where they render as broken empty cards (0 items, no members,
-- because the invitee can't see the list's items or member rows).
--
-- The fix can't live in RLS (the row must stay readable for the
-- banner). It lives in a computed column instead: lists_is_member
-- exposes "is the caller a live member of this list?" so the client
-- can filter the collection with &lists_is_member=is.true while the
-- banner's invitations→lists(name) embed is unaffected. This mirrors
-- the lists_item_count computed-column pattern from migration 0005 and
-- delegates to the existing is_list_member() (SECURITY DEFINER, so it
-- reads list_members without tripping RLS).

CREATE FUNCTION public.lists_is_member(l public.lists)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT public.is_list_member(l.id)
$$;

GRANT EXECUTE ON FUNCTION public.lists_is_member(public.lists) TO authenticated;
