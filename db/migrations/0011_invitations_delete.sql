-- 0011_invitations_delete.sql — inviter self-cancel RLS policy
CREATE POLICY invitations_delete ON public.invitations
FOR DELETE USING (created_by = public.uid());

GRANT DELETE ON public.invitations TO authenticated;
