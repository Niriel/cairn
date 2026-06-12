-- 0018_data_export.sql — the `public.export_my_data()` RPC, the
-- caller-facing data layer for GDPR portability (docs/data-export.md).
--
-- A single SECURITY DEFINER function returns the caller's whole
-- per-user document as JSONB; the web layer is just packaging (HTML
-- render + ZIP) on top. The body is modelled on admin.inspect_user
-- (0017): a top-level jsonb_build_object of nested subqueries. Two
-- design rules carry the privacy guarantee:
--
--   * The `user` sub-document is an ALLOWLIST of non-secret columns,
--     never to_jsonb(u). A future GoTrue credential column can never
--     silently leak — it simply isn't named here. Same discipline as
--     inspect_user's `auth` sub-document.
--   * No e-mail but the caller's own. Co-members render by display
--     name only; invitations carry the other party as a display name
--     where one exists. invitations.target_email is excluded outright
--     — on an email-keyed sent invite it is the invitee's address, not
--     the caller's (email is private; see docs/invites.md).
--
-- Scoping (docs/data-export.md § "What's included"):
--   * lists = lists with a LIVE list_members row for the caller, live
--     AND trashed alike (no filter on lists.deleted_at) — the trash is
--     still the user's data.
--   * items = all items on those lists, live AND soft-deleted.
--   * all_votes (Option B, decided 2026-06-12) = every vote on an item
--     the caller added, by display name. For items the caller did NOT
--     add, the key is omitted entirely (not an empty array).
--   * circle/blocked from the caller's own relationships rows.
--   * invitations the caller sent / received.
--
-- Guards mirror delete_account() (0014): NULL uid → 28000; tombstone
-- uid → 28000. Single BEGIN; … COMMIT; so a mid-migration abort leaves
-- no half-applied state.

BEGIN;

CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth
AS $$
DECLARE
  uid uuid := public.uid();
  result jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING errcode = '28000';
  END IF;
  IF uid = '00000000-0000-0000-0000-000000000000' THEN
    RAISE EXCEPTION 'cannot export the tombstone user'
    USING errcode = '28000';
  END IF;

  SELECT jsonb_build_object(
    'exported_at', to_jsonb(now()),
    'schema_version', 1,
    'user', (
      -- Allowlist: id, email, display_name, signed_up_at,
      -- invite_policy, has_avatar. Never to_jsonb(u).
      SELECT jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'display_name', p.display_name,
        'signed_up_at', u.created_at,
        'invite_policy', s.invite_policy,
        'has_avatar', p.avatar_version > 0
      )
      FROM auth.users AS u
      JOIN public.profiles AS p ON p.id = u.id
      LEFT JOIN public.user_settings AS s ON s.id = u.id
      WHERE u.id = uid
    ),
    'lists', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', l.id,
            'name', l.name,
            'description', l.description,
            'created_at', l.created_at,
            'deleted_at', l.deleted_at,
            'members', coalesce(
              (
                SELECT jsonb_agg(
                  jsonb_build_object('id', mp.id, 'display_name', mp.display_name)
                )
                FROM public.list_members AS lm2
                JOIN public.profiles AS mp ON mp.id = lm2.user_id
                WHERE lm2.list_id = l.id AND lm2.deleted_at IS NULL
              ),
              '[]'::jsonb
            ),
            'items', coalesce(
              (
                SELECT jsonb_agg(
                  -- Base item shape; all_votes is merged in below only
                  -- when the caller added the item (Option B).
                  jsonb_build_object(
                    'id', it.id,
                    'name', it.name,
                    'notes', it.notes,
                    'created_by', jsonb_build_object(
                      'id', cp.id, 'display_name', cp.display_name
                    ),
                    'created_at', it.created_at,
                    'deleted_at', it.deleted_at,
                    'your_vote', (
                      SELECT v.value FROM public.votes AS v
                      WHERE v.item_id = it.id AND v.user_id = uid
                    )
                  )
                  || CASE WHEN it.created_by = uid THEN jsonb_build_object(
                    'all_votes', coalesce(
                      (
                        SELECT jsonb_agg(
                          jsonb_build_object(
                            'user_display_name', vp.display_name,
                            'value', av.value
                          )
                        )
                        FROM public.votes AS av
                        JOIN public.profiles AS vp ON vp.id = av.user_id
                        WHERE av.item_id = it.id
                      ),
                      '[]'::jsonb
                    )
                  ) ELSE '{}'::jsonb END
                )
                FROM public.items AS it
                JOIN public.profiles AS cp ON cp.id = it.created_by
                WHERE it.list_id = l.id
              ),
              '[]'::jsonb
            )
          )
        )
        FROM public.lists AS l
        WHERE EXISTS (
          SELECT 1 FROM public.list_members AS lm
          WHERE
            lm.list_id = l.id
            AND lm.user_id = uid
            AND lm.deleted_at IS NULL
        )
      ),
      '[]'::jsonb
    ),
    'circle', coalesce(
      (
        SELECT jsonb_agg(jsonb_build_object('display_name', op.display_name))
        FROM public.relationships AS r
        JOIN public.profiles AS op ON op.id = r.other_user_id
        WHERE r.user_id = uid AND r.status = 'circle'
      ),
      '[]'::jsonb
    ),
    'blocked', coalesce(
      (
        SELECT jsonb_agg(jsonb_build_object('display_name', op.display_name))
        FROM public.relationships AS r
        JOIN public.profiles AS op ON op.id = r.other_user_id
        WHERE r.user_id = uid AND r.status = 'blocked'
      ),
      '[]'::jsonb
    ),
    'invitations_sent', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'list_id', i.list_id,
            'list_name', il.name,
            'created_at', i.created_at
          )
          -- invitee display name only where a claiming user exists;
          -- target_email is never exposed (it is the invitee's e-mail).
          || CASE WHEN tp.id IS NOT NULL THEN jsonb_build_object(
            'invitee_display_name', tp.display_name
          ) ELSE '{}'::jsonb END
        )
        FROM public.invitations AS i
        JOIN public.lists AS il ON il.id = i.list_id
        LEFT JOIN public.profiles AS tp ON tp.id = i.target_user_id
        WHERE i.created_by = uid
      ),
      '[]'::jsonb
    ),
    'invitations_received', coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'list_id', i.list_id,
            'list_name', il.name,
            'created_at', i.created_at,
            'inviter_display_name', ip.display_name
          )
        )
        FROM public.invitations AS i
        JOIN public.lists AS il ON il.id = i.list_id
        JOIN public.profiles AS ip ON ip.id = i.created_by
        WHERE i.target_user_id = uid
      ),
      '[]'::jsonb
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.export_my_data() FROM public;
GRANT EXECUTE ON FUNCTION public.export_my_data() TO authenticated;

COMMIT;
