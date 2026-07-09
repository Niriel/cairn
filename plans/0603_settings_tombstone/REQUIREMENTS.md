# Requirements: Settings Recovery section and tombstone visuals

Final sub-step of the soft-delete UX (parent: `plans/0600_soft_delete_ux/`).
The list overflow sheet, item trash, and account-trash screens already
landed in 0601 and 0602. This sub-plan closes step 6 by making the
account-trash screen discoverable from Settings and by giving the
deleted-user tombstone its visual treatment wherever it appears: a gray
`<Avatar>` disc and muted-italic attribution in the Items accordion.

## R1. Settings Recovery section

The Settings screen gains a **Recovery** section between the existing
Text-size section and Sign-out section, with the same uppercase
small-caps header style as the other sections (the existing
`.preference-group h2` rule covers it).

The section contains one row: icon `trash-2`, title **Deleted lists**,
subtitle "Restore lists you've deleted", trailing `chevron-right`.
Tapping the row navigates to `/(app)/settings/deleted-lists/` (the
route already exists from 0602) via `goto(resolve('/settings/deleted-lists'))`.

The row carries `data-test="settings-deleted-lists"` so Vitest can
assert it renders and that tapping it calls `goto` with the resolved
path. Visual reference: `design/cairn-screens.jsx` `SettingsScreen`
lines 1219–1224.

## R2. `TOMBSTONE_UID` constant in `shared/model`

A new module `web/src/lib/shared/model/constants.ts` exports a single
named constant:

```ts
export const TOMBSTONE_UID = "00000000-0000-0000-0000-000000000000";
```

The value matches the sentinel UUID used as the `default` for every
attribution FK in `db/migrations/0004_domain_schema.sql` (`created_by`,
`modified_by`, `deleted_by`) and as the seeded `auth.users` /
`profiles` row that `on delete set default` cascades land on. No other
value is acceptable; the literal lives in exactly one place so the
schema constant and the UI constant cannot drift.

The constant is consumed by `Avatar.svelte` (R3) and
`ItemsScreen.svelte` (R4). No tests of `constants.ts` itself — it's a
single string literal; the consumers' tests cover it.

## R3. `Avatar` tombstone branch

The `<Avatar>` component (`web/src/lib/shared/components/Avatar.svelte`)
gains a third render branch: when `uid === TOMBSTONE_UID`, render a
plain gray disc with `background: oklch(78% 0.01 80)`, no initials
text and no `<img>`, regardless of `displayName` or `avatarVersion`.

Branch precedence in the template is **tombstone → photo → initials**:
the tombstone check must come first so a caller cannot accidentally
flip the disc to a photo by passing a positive `avatarVersion` for the
tombstone UUID. The tombstone span carries `data-test` (when supplied
by the caller) and a `data-tombstone` attribute for test selection;
no `data-hue` attribute (there's no hue to record). Width, height,
and border-radius use the same `sharedStyle` template as the other
branches.

Existing tests for the photo and initials branches must continue to
pass unchanged. New tests cover: (a) tombstone UID renders an empty
gray disc, (b) tombstone takes precedence over a positive
`avatarVersion`, (c) tombstone takes precedence over a non-empty
`displayName`.

## R4. Tombstone attribution styling in the Items accordion

In `web/src/lib/item/components/ItemsScreen.svelte`'s open-accordion
`.attribution` block, when an item's `created_by === TOMBSTONE_UID`,
the inner `<strong>` wrapping `created_by_name` renders in muted
italic instead of the existing `color: var(--ink-soft); font-weight:
600` treatment. Specifically: `font-style: italic; font-weight:
normal; color: var(--stone-lt); font-family: 'Newsreader Variable',
Georgia, serif`. (The serif stack is inlined, matching the existing
`.notes` rule in `ItemsScreen.svelte` and `reset.css` — there is no
`--serif` CSS token in the project.)

The same rule applies independently to `modified_by`: when
`modified_by === TOMBSTONE_UID`, the `<strong>` wrapping
`modified_by_name` gets the same muted-italic treatment. The two
checks are independent — an item can have a live creator and a
tombstone editor (or vice versa) once the cascade has landed on one
column but not the other.

The italic span is implemented by toggling a CSS class
(`tombstone`) on the existing `<strong>`. No structural change to
the markup. The displayed name remains whatever the PostgREST join
returns from `profiles.display_name` (`"Deleted user"` for the
tombstone row, seeded by the migration).

Visual reference: `design/cairn-screens.jsx` `ItemsScreenTombstone`
lines 1543–1556.

## Non-requirements (explicitly excluded)

- **Tombstone styling in trash screens.** The item-trash screen and
  the deleted-lists screen show `deleted by <name>` text without
  italic styling. The parent R11 limits the italic-attribution rule
  to the Items accordion; trash rows render the literal display name
  ("Deleted user" for the tombstone) in the standard
  `var(--stone-lt)` colour. Revisit when (or if) those screens get
  a redesign.
- **Tombstone Avatar in member-vote rows.** Avatars do appear in the
  per-item member-vote chips, but a member who voted can't be the
  tombstone — votes are deleted on account deletion. The Avatar
  branch from R3 still renders correctly if a future code path ever
  passes the tombstone UUID, but no current call site exercises it.
- **Recovery → Deleted account.** Account deletion is a step-9
  feature (`plans/0000_implementation_order.md`); the Recovery
  section in step 6 contains only "Deleted lists".
- **Playwright tombstone e2e.** Deferred to the parent plan's Phase 4
  verification step (`plans/0600_soft_delete_ux/TASKS.md` task 4.1).
  This sub-plan's coverage is Vitest-only. (Note: Playwright cannot
  run on this development machine per the Cairn Playwright memory,
  which is the practical reason for deferral. A common misreading is
  that the `tg_set_attribution_items` trigger blocks tombstone
  PATCHes — it does not. `docs/data-model.md:632, 636` explicitly
  documents that the freeze gate is `if new.created_by is distinct
from '00000000-…'`, so a client _can_ deliberately PATCH
  `created_by = '00000000-…'` and the tombstone UID will stick — the
  doc calls this "vandalism, not privilege escalation". A future
  Playwright spec could seed via PATCH.)
- **Centralising the tombstone UUID in the DB schema.** The schema
  still embeds the literal `'00000000-…'` in multiple places (column
  defaults, the trigger gates, the seed insert). Pulling it into a
  Postgres helper is an orthogonal cleanup; this sub-plan only adds
  the JS-side constant.
