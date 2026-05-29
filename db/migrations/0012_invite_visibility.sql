-- 0012_invite_visibility.sql — make the invite-recipient and circle
--   UIs work by giving PostgREST the relationships it needs to resolve
--   embedded resources, and by letting an invitee read the row of a
--   list they have a pending invitation for.
--
-- Three independent changes, grouped because they were all uncovered
-- on the first end-to-end exercise of the invite-recipient flow and
-- none of them are useful in isolation:
--
--   1. invitations.created_by → public.profiles secondary FK so
--      `/invitations?...&select=...,profiles!created_by(...)` resolves
--      (the existing FK is to auth.users; PostgREST's schema cache
--      needs the FK to point at the embedded table).
--
--   2. relationships.{user_id,other_user_id} → public.profiles
--      secondary FKs for the equivalent embed on the circle/blocked
--      relationships query. Both columns get the FK so future embeds
--      via either side work uniformly.
--
--   3. lists_select policy extended with an invitee disjunct: an
--      invitee with a pending user-keyed invitation can SELECT the
--      list row (so the banner / inbox embed of lists(name) returns
--      the actual row instead of null). Email-keyed pending rows
--      (target_user_id IS NULL) are deliberately excluded — the
--      matching auth.users id is stamped at sign-up; until then
--      there is no caller uid to match. The
--      `deleted_at IS NULL OR deleted_by = public.uid()` half of the
--      original predicate is preserved so soft-deleted lists stay
--      hidden from invitees.
--
-- Pattern (1) and (2) mirror the same secondary-FK trick used for
-- items / votes / list_members (migrations 0005, 0006).

ALTER TABLE public.invitations
ADD CONSTRAINT invitations_created_by_profiles_fk
FOREIGN KEY (created_by) REFERENCES public.profiles (id) ON DELETE CASCADE;

ALTER TABLE public.relationships
ADD CONSTRAINT relationships_user_id_profiles_fk
FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE,
ADD CONSTRAINT relationships_other_user_id_profiles_fk
FOREIGN KEY (other_user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

DROP POLICY lists_select ON public.lists;

CREATE POLICY lists_select ON public.lists
FOR SELECT USING (
  (
    public.is_list_member(id)
    OR EXISTS (
      SELECT 1 FROM public.invitations
      WHERE
        invitations.list_id = lists.id
        AND invitations.target_user_id = public.uid()
    )
  )
  AND (deleted_at IS NULL OR deleted_by = public.uid())
);
