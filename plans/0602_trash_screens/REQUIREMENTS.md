# Requirements: Trash recovery screens

The second slice of step 6 (soft-delete UX). Builds the two surfaces a user
reaches to recover something they've soft-deleted: the per-list **item trash**
at `/(app)/lists/[list_id]/trash/`, and the account-level **deleted lists**
trash at `/(app)/settings/deleted-lists/`. Both views are read-only with a
single **Restore** action per row. They sit between 0601 (which created the
overflow sheet and the route stub for the item trash) and 0603 (which wires
the Settings nav row to the deleted-lists route), so this sub-plan must land
the deleted-lists route before 0603 references it.

These requirements restate R5–R8 of `plans/0600_soft_delete_ux/REQUIREMENTS.md`
with the specifics this sub-plan must pin down — wire format for fetches,
attribution name strategy, empty state copy, and what "no snackbar on restore"
means in practice.

## R1. Item trash screen route + screen component

A SvelteKit route at `web/src/routes/(app)/lists/[list_id]/trash/+page.svelte`
exists and renders a `<TrashScreen listId={params.list_id} />` component (from
`web/src/lib/item/components/TrashScreen.svelte`). The route file is filled in
from the empty stub that 0601 created — the existing file is overwritten, not
recreated. `+page.svelte` itself is a thin wrapper of the same shape as the
existing `/(app)/lists/[list_id]/+page.svelte`; all logic lives in the screen
component.

The screen fetches `GET /items_deleted?list_id=eq.<uuid>&order=deleted_at.desc`
on mount and renders each row per R3. TopBar: title `"Trash"`, `sub` =
the list's name (fetched separately via
`GET /lists?id=eq.<uuid>&select=name`, using the **default array form** —
not PostgREST's single-object accept header, which would return HTTP 406
(`PGRST116`) on a stale `list_id`. The screen reads `rows[0]?.name ?? null`
and treats the result as the optional `sub`). If the list-name fetch fails
or returns no row, `sub` stays empty (deliberate — the rows themselves
carry list context; a stale `list_id` is rare enough in practice that a
specialised fallback isn't worth inventing in v1). Back arrow uses the
default `TopBar` back-button — i.e. `history.back()` — landing the user on
the Items screen they came from.

Below the TopBar, a description line:
_"Items you delete from this list land here. Tap Restore to bring one back."_
with `font-size: 12.5px; color: var(--stone); line-height: 1.5; padding:
14px 18px 6px` (lifted from `design/cairn-screens.jsx` `TrashScreen` lines
1274–1278).

## R2. Deleted-lists screen route + screen component

A SvelteKit route at
`web/src/routes/(app)/settings/deleted-lists/+page.svelte` exists and renders
a `<DeletedListsScreen />` component (from
`web/src/lib/list/components/DeletedListsScreen.svelte`). The route is created
in this sub-plan; 0603 will wire the Settings nav row that targets it (this is
the toolchain-coupling reason the route must land here, not in 0603).

The screen fetches `GET /lists_deleted?order=deleted_at.desc` on mount and
renders each row per R4. TopBar: title `"Deleted lists"`, default back arrow
(`history.back()` returns the user to Settings).

## R3. Item trash row visual + restore action

Each row in the item trash screen (visual spec from
`design/cairn-screens.jsx` `TrashScreen` lines 1280–1308):

- Leading `rotate-ccw` icon, 16 px, `var(--stone-lt)`.
- Item name: 14.5 px, `font-weight: 600`, `color: var(--stone)`,
  `text-decoration: line-through; text-decoration-color: var(--stone-lt);
text-decoration-thickness: 1px`.
- Attribution line below the name: `"deleted by <display_name> · <when>"`,
  11.5 px, `var(--stone-lt)`, `margin-top: 2px`. `<when>` is formatted
  by `timeAgo(deleted_at)` per `docs/ui.md` → "Dates" (relative until
  30 days, absolute "1 May 2026" beyond).
- Trailing **Restore** button: outlined pill, `padding: 7px 12px; border:
1px solid var(--ink); border-radius: 999px; background: transparent;
color: var(--ink); font-size: 12.5px; font-weight: 600`.
- Row: `display: flex; align-items: center; gap: 12px; padding: 14px 18px`;
  bottom border `1px solid var(--rule)` on every row; top border on the
  first row only.

Tapping **Restore** sends `PATCH /items?id=eq.<uuid>` with
`{deleted_at: null}` and on 2xx removes the row from local state (the row
disappears in place — no animation required by step 6). On failure, surface
a generic error message (text: _"Couldn't restore — try again."_) in an
error region at the bottom of the screen for ~4 seconds, mirroring the
shape of `items.error` handling in `items.svelte.ts`. No success snackbar
on restore — the disappearing row is the success signal.

## R4. Deleted-list row visual + restore action

Each row in the deleted-lists screen:

- List name: 15 px, `font-weight: 600`, `color: var(--ink)`.
- Attribution line: `"deleted by <display_name> · <when>"`, 12 px,
  `color: var(--stone)`, `margin-top: 2px`. `<when>` uses
  `timeAgo(deleted_at)` per `docs/ui.md` → "Dates".
- Trailing **Restore** pill, same outlined shape as R3.
- Row: same `padding: 14px 18px`, bottom border `1px solid var(--rule)`.

Tapping **Restore** sends `PATCH /lists?id=eq.<uuid>` with `{deleted_at:
null}`; the row disappears on success. The restored list **does not**
re-appear on the Lists screen until the next `loadLists()` fires (e.g.
when the user navigates back). The deleted-lists screen does not call
`refreshLists()` — that would be coupling the trash screen to the lists
state for no user-visible gain in this slice. On failure, the same generic
error region pattern as R3.

## R5. Attribution `display_name` via client-side batch lookup

`items.deleted_by` and `lists.deleted_by` FK to `auth.users(id)` (the auth
schema), not to `public.profiles(id)` — verified at
`db/migrations/0004_domain_schema.sql:126,180`. Migration 0006 added profile
FKs only for `items.created_by`, `items.modified_by`, and `votes.user_id`;
`deleted_by` was deliberately left out. Consequently PostgREST does not
auto-embed `profiles!deleted_by(display_name)` from the `items_deleted` or
`lists_deleted` views — the embedding returns empty/silently no-ops.

The screens therefore resolve `deleted_by` UUIDs via a **second batched
request**: after fetching the trash rows, gather the unique set of
`deleted_by` UUIDs and fetch `GET /profiles?id=in.(<uuid-list>)&select=id,
display_name`. Build a `Map<uuid, displayName>` and join client-side.
Rows whose `deleted_by` is the tombstone UUID get the literal display name
`"Deleted user"` (already the tombstone profile's stored name; will fall
through naturally if the tombstone row is included in the fetch). If the
profiles fetch fails, fall back to rendering `"Unknown"` for every name —
the trash list itself still loads.

Deduplication is mandatory: the same `deleted_by` UUID often appears on
many rows. Fetch each UUID at most once per page load. Cache lives in
module-local component state, not in a global store — a fresh page visit
re-fetches, which is fine for this volume.

## R6. Empty states and loading states

Item trash empty state (no soft-deleted items in this list): a centred
block under the description line containing `<Icon name="trash-2" size=44
color="var(--stone-lt)" />` and the text _"Nothing in the trash."_ styled
to match the existing `.empty-heading` rule in `ItemsScreen.svelte`
(Newsreader serif, 22 px, `font-weight: 500`, `color: var(--ink)`). The
copy is one line — no secondary body text and no CTA.

Deleted-lists empty state: same shape, text _"No deleted lists."_.

Loading state: a centred _"Loading…"_ in `var(--stone)` (matching the
existing `data-test="lists-loading"` pattern in `ListsScreen.svelte`).
Each screen exposes `data-test="trash-loading"` and
`data-test="deleted-lists-loading"` for its respective loading slot, and
`data-test="trash-empty"` / `data-test="deleted-lists-empty"` for the
empty slots. Both screens expose row-level `data-test` attributes
(`trash-row-<item_id>`, `deleted-list-row-<list_id>`) to support Vitest
assertions.

## Non-requirements (explicitly excluded)

- **Hard-delete from trash.** Step 6 does not expose an "Empty trash"
  action; per `docs/ui.md` → "Trash & undo", hard delete is not a v1 UI
  action.
- **Snackbar on restore.** Restore is a deliberate, self-evident action
  — the row disappears in place. No success snackbar, no "Restored 'X'"
  banner.
- **Re-sorting the Lists screen on list restore.** The Lists screen is
  reloaded on its own next visit; the trash screen does not push state
  back to `lists.svelte.ts`.
- **Real-time updates of trash contents.** No polling, no
  subscriptions, no refresh-after-delete-from-another-tab — the trash
  list is the snapshot at page open.
- **Wiring the Settings Recovery nav row.** That belongs to 0603. This
  sub-plan creates the destination route only.
- **Tombstone Avatar branch and tombstone attribution italic styling.**
  That belongs to 0603 (R10–R11 of the parent plan). Trash rows do
  _not_ render avatars; the deleted-by attribution is plain text only.
- **Adding a `profiles` FK for `deleted_by`.** Adding a migration to
  mirror 0006 for `deleted_by` would unlock PostgREST embedding here.
  Out of scope: the batch-lookup approach is task-2.1-decided in the
  parent plan, ships with simpler RLS surface area, and the cost is one
  extra round-trip per page load — well below the threshold that would
  motivate a schema change in step 6.
- **E2E tests for the trash and restore flows.** Playwright cannot run
  on this development machine (per the standing project memory); E2E
  coverage is deferred to Phase 4 of the parent plan, which is the
  pre-merge `./scripts/check.sh --e2e` gate. Vitest screen tests cover
  the per-component behaviour here.
