-- 0025_public_list_alphabetical.sql — public list items in name order.
--
-- Items are now ordered alphabetically everywhere (oldest first among
-- same-named items); votes change the score, never the position. The
-- public page re-sorts with the same browser comparator as the members'
-- screen, so this ORDER BY is a sensible first pass for API consumers.
--
-- CREATE OR REPLACE preserves the existing EXECUTE grants (anon +
-- authenticated) and the SECURITY DEFINER / search_path settings, so
-- no re-grant is needed. The only change is the item ORDER BY.

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
          ORDER BY r.name ASC, r.created_at ASC
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
