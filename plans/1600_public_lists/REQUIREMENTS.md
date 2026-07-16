# Requirements: Public, read-only, shareable lists

A list member can flag a list **public**, producing a link that **anyone**
(no account, no invite) can open to a **read-only** view of the list and its
ranked items. This exists because users want to share finished lists with
people outside Cairn by sending a URL, without granting edit access or exposing
who the members are. Public is the first deliberate opening of the `anon`
surface — until now `anon` has had zero access and all reads are gated by
`public.is_list_member()` (RLS is the security boundary; see
`docs/data-model.md`).

## R1. Lists carry an `is_public` flag, private by default

`public.lists` gains a column `is_public boolean NOT NULL DEFAULT false`.
Existing lists and all newly created lists are private until explicitly
published. No extra index is added: the only public read path is a point
lookup on the primary key (`id = p_id`), already served by the PK index — a
partial index `(id) WHERE is_public` would never be chosen by the planner and
supports no other query (discovery/browse is a non-requirement).

## R2. Any member may toggle a list's public flag; non-members may not

Any live member of a list (`public.is_list_member(id)`) may set `is_public`
true or false — consistent with Cairn's flat membership model (no per-list
roles). This rides the existing `lists_update` RLS policy and the existing
`GRANT UPDATE ON public.lists TO authenticated`; **no new write policy or grant
is introduced**. A non-member's attempt to change `is_public` (or any other
column) is rejected by `lists_update`, exactly as today. The negative case is
load-bearing and must be tested.

## R3. A single `SECURITY DEFINER` RPC is the _only_ anonymous read path

Anonymous read access is provided exclusively by one function:

```sql
CREATE FUNCTION public.public_list_view(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$ ... $$;
REVOKE EXECUTE ON FUNCTION public.public_list_view(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.public_list_view(uuid) TO anon, authenticated;
```

`anon` receives **no** table, view, or other-function grant. It cannot
`SELECT` `lists`, `items`, `items_ranked`, `list_members`, `profiles`, or
`votes`, and cannot call any other RPC. This negative boundary is the core
security requirement and must be tested directly as the `anon` role. A direct
table-grant approach is explicitly rejected (see R7 / Non-requirements).

## R4. The RPC returns a curated payload that hides members, votes, and attribution

For a public, non-deleted list, `public_list_view(p_id)` returns a JSON object:

```json
{ "id": "...", "name": "...", "description": "...",
  "items": [ { "id": "...", "name": "...", "notes": "...", "score": <int> } ] }
```

Items are ordered by `score DESC, created_at ASC` (the ranking is the point of
the list). Soft-deleted items are excluded. The payload **must not** contain
member identities (`list_members`/`profiles`), per-user votes, `created_by`,
`modified_by`, or any other attribution field. The function computes `score`
via `items_ranked` under its definer privileges; because `anon` itself has no
access to the underlying tables, nothing leaks beyond these chosen fields.

## R5. Non-public, soft-deleted, and unknown ids reveal nothing

`public_list_view(p_id)` returns SQL `NULL` (PostgREST → `null`) when the id is
not a live public list — i.e. the list does not exist, is soft-deleted, or has
`is_public = false`. The anonymous page renders a single generic
"list not available" state for all of these, so a caller cannot distinguish
"private list exists" from "no such list". The negative cases (private,
soft-deleted) must be tested as `anon`.

## R6. The public page is read-only and reachable while signed-out

A route `/p/<list_id>` renders the curated payload as a read-only screen:
item names, notes, and ranked order only. It exposes **no** vote controls,
add-item affordance, overflow/edit menu, member avatars, or attribution. It is
reachable by a signed-out visitor — `/p` is added to the signed-out allowlist
(`PUBLIC_CONTENT_PATHS` in `web/src/lib/shared/model/public-paths.ts`) so the
`+layout.svelte` guard does not bounce the visitor to `/auth/login`. The
auth-flow allowlist `auth-paths.ts` (mirrored into the auth-proxy and
drift-guarded) is **not** touched. A signed-in visitor opening the same URL
sees the same read-only page (the RPC is granted to `authenticated` too).

## R7. Public lists announce themselves in member-facing views, but not on the public page

Wherever a **member** sees a list, a public list is visibly marked as public —
an icon after the list name in both the list-collection row and the list-detail
TopBar title, with an accessible label ("Public list"). This makes it
immediately obvious to members that a list has been published. The icon is
**not** shown on the `/p/<list_id>` anonymous page, where being public is
self-evident. The marker uses the shared `Icon.svelte` and is coloured via CSS
on a wrapping container — no colour prop is passed to `Icon.svelte`.

## R8. Publishing surfaces a copyable public link

When a list is public, its overflow menu offers a "Copy public link" action
that copies `<origin>/p/<list_id>` and gives visible confirmation (a transient
"Copied" feedback), per the copy-link affordance this plan defines in `docs/ui.md`
(Phase 0). This is Cairn's first copy-to-clipboard affordance — there is no
pre-existing convention to inherit. The publish/unpublish action sits with the
list's management actions and above the destructive (Leave/Delete) actions, per
the button-order rule in `docs/ui.md`.

## Non-requirements (explicitly excluded)

- **Direct `anon` table/view grants** — rejected because `items_ranked` is
  `security_invoker` (yields nothing for `anon`) and a definer view would leak
  every list's scores; the curated RPC (R3) is the chosen boundary.
- **Per-list roles / read-only members** — out of scope; membership stays flat
  (R2). Public is the only read-only tier.
- **Discovery / public directory** — public lists are unlisted; access is by
  link only. No browse/search of public lists.
- **Per-link tokens or revocable share links** — the list `id` (a random uuid)
  _is_ the link; unpublishing revokes access. Rotatable tokens are a possible
  future refinement, not part of this work.
- **Exposing the publisher or any member on the public page** — deliberately
  excluded to honour the privacy contract (`docs/invites.md`,
  `docs/circles.md`): sharing a list must not out who is on it.
- **Public commenting / voting by anonymous visitors** — the page is strictly
  read-only.
