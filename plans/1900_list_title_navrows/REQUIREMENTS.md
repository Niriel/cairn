# Requirements: List-title nav-rows on the Lists screen

On the Lists screen, each list's name is a tappable link to the list's items
screen but renders as plain text — it behaves like a navigation row without
looking like one. This work makes each list title look and behave like the
shared `NavRow` (full-width tap target with a trailing chevron) and relocates
the per-list "More" (overflow) button into the extra-info block beneath the
title. Pure front-end UI; no schema, RLS, or API surface changes.

## R1. List title renders as a nav-row

Each list row's title is rendered with the shared
`NavRow` component (`web/src/lib/shared/components/NavRow.svelte`): a
full-width tap target whose label is the list name, with the standard trailing
`chevron-right` affordance. Tapping it navigates to that list's items screen
(`/lists/{id}`) exactly as before. The title text aligns horizontally with the
description and metadata beneath it (no double indent from the nav-row's own
inner padding). A long list name **wraps** onto multiple lines as it does today
rather than overflowing or being clipped: `NavRow`'s title must carry
`white-space: normal; overflow-wrap: anywhere;` so the wrap behaviour the
bare-Button title had (via `.name`) is preserved once `.name` is dropped. (The
title otherwise inherits the `<Button>` base `white-space: nowrap`, which has no
ellipsis — a long name would overflow into the chevron.)

## R2. `NavRow`'s leading visual is optional

`NavRow` accepts rows with **no** leading visual. Its `lead` prop becomes
optional (`lead?: Snippet`); when omitted, the row renders title (+ optional
sub / trailing) + chevron with no leading slot. Existing callers that pass a
`lead` (Settings, Privacy screens) are unaffected. The Lists-screen title
passes no `lead` (lists have no icon in the data model).

## R3. Public-list marker stays on the title row

For a public list, the muted globe marker remains on the title row, rendered
via `NavRow`'s `trailing` snippet (it sits just before the chevron rather than
immediately after the name, because `NavRow.title` is a plain string). It keeps
its accessible "Public list" label and its `data-test="list-public-marker-{id}"`
hook.

## R4. "More" button moves under the title, top-end of the extra-info

The per-list overflow ("More", vertical-ellipsis) button moves off the title
line and into the extra-info block (description + metadata) beneath the title,
pinned to that block's **top-end** (top-right). It keeps its behaviour (opens
the list overflow sheet), its `aria-label="List options"`, and its
`data-test="list-overflow-{id}"` hook. The description text must still truncate
with an ellipsis and must not run underneath the button.

## R5. Dashed in-row rule retained

The dashed rule that currently separates the title from the description within
a row is retained, now sitting between the title nav-row and the extra-info
block beneath it. The solid per-list divider between adjacent rows is also
retained.

## R6. Existing behaviour and test hooks preserved

The description see-more/see-less toggle, the "(no description)" placeholder,
the metadata line (item count · relative modified time · member avatars), the
FAB, the create/overflow sheets and the undo snackbar all keep their current
behaviour. The `data-test` selectors `list-row-{id}`, `list-nav-{id}`,
`list-public-marker-{id}`, `list-desc-{id}`, and `list-overflow-{id}` are all
preserved (none renamed); they may move to a different DOM ancestor but remain
present and queryable.

## Non-requirements (explicitly excluded)

- **Per-list leading icons.** The design mockup shows a leading icon per row,
  but lists have no icon field in the data model; adding one is out of scope.
- **Changing `NavRow` to accept a title snippet.** Keeping `title` a string
  means the public marker lives in `trailing`; reworking the component's title
  API to allow inline markup is out of scope.
- **Touching the overflow sheet contents.** `ListOverflowSheet`'s options and
  behaviour are unchanged — only the button that opens it moves.
- **Backend/schema/RLS changes.** This is a front-end-only layout change.
