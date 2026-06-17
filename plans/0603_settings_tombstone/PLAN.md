# Plan: Settings Recovery section and tombstone visuals

Closes step 6 (parent: `plans/0600_soft_delete_ux/`). Three small,
mostly orthogonal UI changes that share a common dependency on a new
shared constant. Lands after 0601 (list overflow) and 0602 (trash
screens).

## Context

Steps 0601 and 0602 created the destination (`/(app)/settings/deleted-lists/`)
and the item-trash route, but nothing in the live UI links to the
deleted-lists screen yet — a user can only reach it by typing the URL.
Adding the Recovery row in Settings is the discovery surface the
parent plan's R9 promised (`plans/0600_soft_delete_ux/REQUIREMENTS.md`).

The tombstone visual work is the "what happens after a user deletes
their account" half of step 6, even though step 9 actually ships
account deletion. The DB already has the tombstone row seeded
(`db/migrations/0004_domain_schema.sql`) and every attribution FK
already cascades to it on `auth.users` delete; the only gap is the
UI's reaction. Landing it in step 6 means step 9 will Just Work
visually when the delete-account flow ships — no second sweep through
`Avatar.svelte` or `ItemsScreen.svelte`.

The three changes share one prerequisite: a JS-side constant for the
tombstone UUID. Embedding the literal `'00000000-…'` in two
components would be the kind of duplication that drifts later.
Promoting it to `shared/model/constants.ts` keeps both consumers on
the same value and gives any future consumer (tombstone branches in
the trash screens, the deleted-account screen) a single import to
reach for.

## Decisions

**`constants.ts` placement.** `web/src/lib/shared/model/` is the right
home: it's cross-domain (`Avatar` is in `shared/`, `ItemsScreen` is in
`item/`, both reach the same constant). The alternative — putting the
constant on the `Avatar` component module itself and re-importing it
into `ItemsScreen` — would create a cross-domain import from `item/`
into `shared/components/`, which is allowed (`item/` may import from
`shared/`) but couples the value to a UI component's lifetime. A
non-Svelte `.ts` module under `shared/model/` is purpose-built for
exactly this (`docs/frontend-layout.md` → "Domain folder shape": "no
Svelte imports, no runes — this is the layer that other layers can
freely import without dragging the reactivity system in").

**Branch order in `Avatar.svelte`: tombstone first.** Currently
`Avatar.svelte` branches `photo (avatarVersion > 0 && uid.length > 0)`
→ `initials`. Adding tombstone as the _first_ branch (`uid ===
TOMBSTONE_UID`) means a caller can't accidentally render a tombstone
photo by passing a positive `avatarVersion` together with the
tombstone UUID. The tombstone row in `profiles` has
`avatar_version = 0` today, but defending against future drift (or
test fixtures) is cheap — a single ordered `{#if … :else if … :else}`
chain.

**In-template detection in `ItemsScreen.svelte`.** R4's italic
attribution rule is a per-item, per-column CSS branch. Two
implementations were considered: (a) compute boolean flags in the
script (`const creatorIsTombstone = item.created_by === TOMBSTONE_UID`),
(b) check directly in the template via Svelte's `class:foo={…}`
shorthand. Option (b) wins because the `each` block already iterates
items in the template, and adding two short `class:tombstone={item.…
=== TOMBSTONE_UID}` expressions on the existing `<strong>` elements
is the minimum diff. No script-block additions, no derived state, no
new types. The CSS class `.tombstone` is the only new style rule.

**No new `NavRow` component.** `design/cairn-screens.jsx` uses a
`NavRow` helper everywhere a Settings row appears, but the current
Svelte `SettingsScreen.svelte` does not yet have one — every Settings
section in the file is bespoke (theme grid, font-size card, sign-out
button). Extracting `NavRow` is a separate refactor that step 7's
invites/privacy/about rows will pressure-test; doing it now for a
single row is premature. The Recovery row is implemented inline with
the same `data-test`-tagged `<button>` shape that the profile chip
already uses.

**No tombstone visual in trash screens.** Parent R7's deleted-lists
row and parent R5's item-trash row both render `deleted by <name>`
text. The italic-attribution rule (parent R11) is scoped to the Items
accordion. The trash screens render the literal `display_name`
(`"Deleted user"` for the tombstone) in the standard
`var(--stone-lt)` colour — same as any other name. Holding the line
here keeps the visual contract simple: italic-serif means "this user
no longer exists" _in the Items accordion specifically_ — the
recovery surfaces themselves carry no such per-row affordance.

**E2E deferred to parent Phase 4.** `tg_set_attribution_items`
freezes `created_by` against client PATCHes, so a tombstone-attributed
item cannot be produced through the PostgREST path Playwright drives.
The only Playwright-friendly approach is psql-side seeding from the
e2e harness, which is outside this sub-plan's scope. Vitest covers
the unit behaviour: the constant, the Avatar branch, the
italic-class toggling, and the Recovery row's `goto` wiring.

## Architecture

### New files

- **`web/src/lib/shared/model/constants.ts`** — single export
  `TOMBSTONE_UID`. No tests of its own; consumers' tests cover it.

### Modified files

- **`web/src/lib/shared/components/Avatar.svelte`** — add tombstone
  branch first in the render order. Import `TOMBSTONE_UID` from
  `$lib/shared/model/constants`.
- **`web/src/lib/shared/components/Avatar.test.ts`** — add three new
  tests covering the tombstone branch (empty disc; precedence over
  photo; precedence over initials).
- **`web/src/lib/settings/components/SettingsScreen.svelte`** — add
  a new `<section class="preference-group nav-section">` (or similar)
  between the Text-size section and the Sign-out section. One nav row
  with icon `trash-2`, title "Deleted lists", subtitle "Restore lists
  you've deleted", trailing `chevron-right`. `goto(resolve('/settings/deleted-lists'))`
  on click.
- **`web/src/lib/settings/components/SettingsScreen.test.ts`** — add
  two new tests: (a) the Recovery row renders, (b) tapping it calls
  `goto` with the resolved path.
- **`web/src/lib/item/components/ItemsScreen.svelte`** — import
  `TOMBSTONE_UID`; add `class:tombstone={item.created_by ===
TOMBSTONE_UID}` to the existing `<strong>{item.created_by_name}</strong>`,
  same for `modified_by`/`modified_by_name`. Add a `.attribution
strong.tombstone` CSS rule. No script changes beyond the import.
- **`web/src/lib/item/components/ItemsScreen.test.ts`** — add two
  new tests: (a) tombstone `created_by` triggers italic styling on
  the creator name, (b) live creator + tombstone editor triggers
  italic on the editor only.

### Import graph

```
ItemsScreen.svelte  ─┐
                     ├──► shared/model/constants.ts  (TOMBSTONE_UID)
Avatar.svelte       ─┘
```

The constants file has zero imports (it's a single `export const`),
so creating it is risk-free.

## Phase structure

The three changes are independent at the file level but share one
dependency: `constants.ts` must exist before any task that imports
from it can type-check. The simplest ordering is to create the
constant in the same task as its first consumer, then chain the rest.

1. **Phase 1 — Settings Recovery row (R1).** Independent of the
   constant. Adds the nav row to `SettingsScreen.svelte` and its
   tests. Lands first because it's the user-discoverable change that
   makes the deleted-lists screen reachable from the live UI; landing
   it first means a reviewer pulling the branch mid-way through
   implementation can already exercise the recovery flow end-to-end.

2. **Phase 2 — Tombstone visuals (R2–R4).** Three tasks:
   - **2.1** Create `constants.ts` + add Avatar tombstone branch +
     test (R2 + R3 in one commit — the constant has exactly one
     consumer at this point, so colocating them is a clean unit).
   - **2.2** Add tombstone attribution styling in
     `ItemsScreen.svelte` + test (R4). Consumes the constant
     created in 2.1.

   RED-before-GREEN within each task: write the new tests first,
   confirm red, then add the implementation. The existing
   `Avatar.test.ts` and `ItemsScreen.test.ts` files already cover
   the unchanged branches and must still pass — `vi.restoreAllMocks`
   in `afterEach` keeps the new tests isolated.

## Reference docs and skills

- **`.claude/skills/writing-tasks.md`** — self-contained briefings;
  RED-before-GREEN ordering; route-test filename rule (not used in
  this sub-plan since no route files are added).
- **`docs/ui.md` → "Settings"** (line 157) and **"Account deletion
  screen"** (line 211) — canonical Settings layout and the
  tombstone's visual treatment.
- **`docs/data-model.md` → tombstone insert and trigger gates**
  (lines 118–177, 620, 631–638) — confirms the
  `'00000000-0000-0000-0000-000000000000'` UUID is the sentinel and
  why the freeze blocks PATCH-based tombstoning.
- **`docs/frontend-layout.md` → "Domain folder shape"** — confirms
  `shared/model/` is the right home for a pure-TS constant
  consumed by multiple components.
- **`design/cairn-screens.jsx`** — `SettingsScreen` (lines
  1084–1247) for the Recovery section visual; `ItemsScreenTombstone`
  (lines 1502–1575) for the italic attribution visual.
- **`plans/0600_soft_delete_ux/REQUIREMENTS.md`** R9, R10, R11 — the
  parent contracts this sub-plan refines.
