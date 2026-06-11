-- 0015_public_lists.sql — opt-in public (unlisted) lists.
--
-- Adds the `is_public` flag to lists and a single SECURITY DEFINER
-- RPC, `public_list_view`, which is the *entire* anonymous surface:
-- `anon` gets EXECUTE on this one function and nothing else — no new
-- table or view grant. See docs/data-model.md → "Public read access".
--
-- The flag's write path reuses the existing authorisation: any member
-- may toggle it through `lists_update` (`is_list_member(id)`), so there
-- is no new policy or grant for the toggle (asserted in public_lists.sql
-- and grants.sql).
--
-- No extra index: the only public read is a point lookup on the PK
-- (`l.id = p_id`), already served by the primary-key index. A partial
-- `(id) WHERE is_public` index would never be chosen and supports no
-- other query — discovery/browse is a non-requirement.

ALTER TABLE public.lists
ADD COLUMN is_public boolean NOT NULL DEFAULT FALSE;

-- public_list_view: curated, read-only snapshot of one public list.
--
-- SECURITY DEFINER + `security_invoker = TRUE` on items_ranked means
-- the view runs as this function's owner (cairn, exempt from RLS), so
-- the aggregate yields real scores even though `anon` can read nothing
-- itself. The payload is curated by construction: no members, no
-- votes/tallies, no attribution. A list that is private, soft-deleted,
-- or unknown matches no row, so the SQL function returns NULL — that
-- NULL is the R5 boundary (all three cases are indistinguishable).
CREATE FUNCTION public.public_list_view(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', l.id,
    'name', l.name,
    'description', l.description,
    'items', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'name', r.name,
            'notes', r.notes,
            'score', r.score
          )
          ORDER BY r.score DESC, r.created_at ASC
        )
        FROM public.items_ranked AS r
        WHERE r.list_id = l.id
      ),
      '[]'::jsonb
    )
  )
  FROM public.lists AS l
  WHERE l.id = p_id AND l.is_public AND l.deleted_at IS NULL;
$$;

-- The function is the one and only thing anon may touch. REVOKE from
-- PUBLIC first (functions grant EXECUTE to PUBLIC by default), then
-- grant explicitly to anon and authenticated.
REVOKE EXECUTE ON FUNCTION public.public_list_view(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.public_list_view(uuid) TO anon, authenticated;
