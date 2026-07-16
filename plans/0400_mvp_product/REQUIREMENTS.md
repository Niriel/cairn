# Requirements: MVP product surface (single-user happy path)

Step 4 of the master plan. The DB schema (lists, items, votes, RLS), design
tokens, component primitives, and auth layer are in place. This step builds
the product surface a solo user needs to create lists, rank items with votes,
and control their appearance settings — giving us something real to dogfood
before sharing (step 7) is added.

This plan is an orchestration plan: its tasks are about creating and
executing four sub-plans (0401, 0402, 0403, 0404), each of which carries its own
detailed REQUIREMENTS/PLAN/TASKS. Requirements here describe the overall
step-4 contract; the sub-plans refine them.

## R1. Avatar component — initials-disc fallback

A `Avatar.svelte` component renders a circular disc with the user's initials
derived from their `display_name`. It takes a `displayName` string, derives
one or two initials (first letter of first word, first letter of last word if
present), and chooses a deterministic hue based on the name so the same
person always gets the same colour. The photo branch (`avatar_version > 0`)
is explicitly excluded — it belongs to step 5.

## R2. Profile state

A reactive store fetches the current user's `display_name` from
`GET /profiles?id=eq.<uid>&select=display_name` on boot. It is used by the
Settings screen and by item attribution. It does not expose the user's email
address anywhere in the UI (privacy contract from `docs/invites.md`).

## R3. Settings screen

A Settings screen at `/(app)/settings/` shows:

- A profile chip at the top: `Avatar` + `display_name` (no tap-through yet — profile editing is a later step).
- An Appearance section wired to the existing `preferences.svelte.ts` store: Theme selector (Light / Dark / System) and Font size selector (XS / S / M / L / XL).
- A Sign Out action at the bottom (moved from the current placeholder home route).

Theme and font-size changes apply immediately and persist across sessions via
`localStorage` (keys `cairn.theme` and `cairn.font_size` already used by the
existing store). No `user_settings` DB row is involved.

## R4. Authenticated route layout

An `/(app)/+layout.svelte` route group guards every product screen: if the
session is absent on mount, it redirects to `/auth/login`. The current
placeholder `/+page.svelte` becomes a redirect to `/lists` for authenticated
users.

## R5. `create_list` RPC

A `security definer` RPC `create_list(name text, description text DEFAULT NULL)`
atomically inserts one row into `lists` and one row into `list_members` (the
caller as the first and only member). Direct `POST /lists` is not used because
the member row must be created in the same transaction. The RPC is covered by
pgTAP (positive case: list and member row appear; negative case: unauthenticated
callers are rejected).

## R6. Lists screen

A Lists screen at `/(app)/lists/` shows the authenticated user's lists
(filtered by RLS via `GET /lists`), ordered by `modified_at DESC`. Each row
shows the list name and a truncated description. Tapping the description
expands it inline (using the existing `Accordion` primitive). Tapping the list
name navigates to the Items screen for that list. A `Fab` opens a create-list
sheet (name + optional description). An empty state is shown when the user has
no lists.

## R7. Items screen

An Items screen at `/(app)/lists/[list_id]/` fetches `items_ranked` for the
given list (ordered by `score DESC, created_at ASC`). Each row shows the item
name on the left and a `VoteControl` on the right. Tapping the row body (not
the vote buttons) opens an accordion panel — only one panel is open at a time.
The panel shows: notes, an attribution line ("Added by … on … / Last edited
by … on …"), per-member votes (single user for step 4), and Edit / Delete
buttons. A `Fab` opens an add-item sheet. An empty state is shown when the
list has no items.

## R8. Vote control

A `VoteControl` component shows a [−] indicator [+] row. Each tap nudges the
current user's vote by ±1, clamped to [−3, +3]. When a nudge would produce 0,
the vote is retracted (`DELETE /votes`). Otherwise the vote is upserted via
`POST /votes` with `Prefer: resolution=merge-duplicates`. The indicator
reflects the current user's own vote (not the aggregate), e.g. `−3`, `−2`,
… , `−1`, `·` (neutral / no vote), `+1`, … , `+3`.

## R9. Add / edit item

A `Fab` on the Items screen opens a create-item sheet: name (required) + notes
(optional). A `POST /items` creates the item. The Edit button inside an
accordion opens a pre-filled edit sheet; a `PATCH /items?id=eq.<uuid>` updates
it. Both use the existing `Sheet` primitive.

## R10. Soft-delete item with undo

The Delete button in an item's accordion soft-deletes the item via
`PATCH /items?id=eq.<uuid>` setting `deleted_at = now()`. A `Snackbar` with an
Undo action appears; if the user taps Undo within the window, the item is
restored via `PATCH` setting `deleted_at = null`. If the snackbar times out,
the item stays soft-deleted (not visible in `items_ranked`). Full trash UI is
deferred to step 6.

## Non-requirements (explicitly excluded)

- **Photo avatars** — `profiles.avatar_version` column doesn't exist yet; step 5 adds it and the photo branch of `Avatar`.
- **Sharing / list members** — step 4 is single-user only; the per-member votes panel in the accordion will show only the current user. Multi-user flows land in steps 7–8.
- **Trash / recovery UI** — items soft-deleted here are accessible via the `items_deleted` view but the UI to surface them is step 6.
- **Display name editing / profile settings** — the profile chip in Settings has no tap-through; editing `display_name` is a later step.
- **List rename / delete / overflow menu** — list-level management gestures (rename, delete, view trash) are part of step 6's soft-delete UX surface.
- **`user_settings` DB writes** — theme and font size are device-local (`localStorage`); no DB column is read or written here.
