-- 0005_list_metadata.sql — list metadata infrastructure:
--   1. FK from list_members.user_id to public.profiles so PostgREST
--      can embed profiles in the lists response.
--   2. Computed-column function lists_item_count for PostgREST v12
--      to expose a live item count on the lists resource.

-- FK: enables PostgREST to embed profiles from list_members
ALTER TABLE public.list_members
ADD CONSTRAINT fk_list_members_profile
FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE;

-- Computed column: item count for the lists PostgREST resource
CREATE FUNCTION public.lists_item_count(l public.lists)
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM public.items
  WHERE list_id = l.id
    AND deleted_at IS NULL
$$;

GRANT EXECUTE ON FUNCTION public.lists_item_count(public.lists) TO authenticated;
