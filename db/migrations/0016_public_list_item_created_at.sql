-- 0016_public_list_item_created_at.sql — add item age to the public view.
--
-- The public read-only screen shows how long ago each item was added
-- (a relative "2 weeks ago" line), so the curated payload now carries
-- each item's `created_at`. A date says *when*, not *who* — it is not
-- attribution, so this does not reopen the no-members/no-attribution
-- boundary the view was built around.
--
-- CREATE OR REPLACE preserves the existing EXECUTE grants (anon +
-- authenticated) and the SECURITY DEFINER / search_path settings, so
-- no re-grant is needed. The only change is the extra item key.

CREATE OR REPLACE FUNCTION public.public_list_view(p_id uuid)
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
            'score', r.score,
            'created_at', r.created_at
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
