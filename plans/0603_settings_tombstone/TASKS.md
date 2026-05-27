# Tasks

## Reference skills and docs

- **`.claude/skills/writing-tasks.md`** — self-contained briefing format; RED-before-GREEN within each task.
- **`docs/frontend-layout.md` → "Domain folder shape"** — `model/` is for non-reactive pure TS; `shared/` is the right tier for cross-domain code.
- **`docs/ui.md` → "Settings"** and **"Account deletion screen"** — canonical Settings section list and the tombstone gray-disc + muted-italic visual.
- **`docs/data-model.md`** lines 118, 146, 175, 620, 631–638 — confirms `'00000000-0000-0000-0000-000000000000'` is the tombstone UUID and explains the per-rule trigger freeze that blocks *non-tombstone* PATCHes (the gate deliberately lets `created_by = '00000000-…'` through; see `REQUIREMENTS.md` → Non-requirements → "Playwright tombstone e2e").
- **`design/cairn-screens.jsx`** — `SettingsScreen` (lines 1084–1247, Recovery section at 1219–1224); `ItemsScreenTombstone` (lines 1502–1575, italic attribution at 1552–1556).
- **`plans/0600_soft_delete_ux/REQUIREMENTS.md`** R9, R10, R11 — the parent contracts this sub-plan refines.

## Phase 1 — Settings Recovery row

### [x] 1.1 Add Recovery → Deleted lists nav row to `SettingsScreen.svelte`

**Created:** 2026-05-27T10:49:39Z
**Completed:** 2026-05-27T11:50:52Z

**Notes:** Icons use `currentColor` (`Icon.svelte` line 18), so the
trailing chevron's `var(--stone-lt)` colour required a small extra CSS
rule (`.nav-row > :global(svg:last-of-type) { color: var(--stone-lt); }`)
not enumerated in the task's Decisions block. The leading icon inherits
`var(--stone)` from `.nav-row { color: var(--stone) }`.

**Why:** The deleted-lists screen at `/(app)/settings/deleted-lists/`
already exists (shipped in 0602), but nothing in the live UI links to
it — a user can only reach it by typing the URL. Parent R9 promises a
Recovery section in Settings; this task delivers it. Lands first
because it's independent of the tombstone work and gives a reviewer a
reachable recovery flow as soon as this task lands.

**Prerequisites:** None — `/(app)/settings/deleted-lists/+page.svelte`
already exists (from 0602). `goto(resolve('/settings/deleted-lists'))`
will type-check.

**Decisions:**
- Add a new `<section class="preference-group">` between the existing
  Text-size section and the Sign-out section. The existing
  `.preference-group h2` rule already produces the
  uppercase-small-caps section header, so the new section reuses it
  with `<h2>Recovery</h2>`.
- The nav row is a `<button>` (not `<a>`) so its `onclick` matches
  the existing profile-chip pattern in the same file. Inline the
  styles — do **not** extract a `NavRow` component (see PLAN.md
  Decisions). Step 7/8 will add multiple nav rows and is the right
  moment to extract.
- **Visual divergence from `design/cairn-screens.jsx:1219-1224` is
  intentional and temporary.** The design renders the Recovery row
  via the `NavRow` helper (`design/cairn-invite-screens.jsx:19-45`)
  as a bordered card (1px solid `var(--rule)`, `border-radius: 12px`,
  `padding: 14px 14px`, `margin-bottom: 10px`, icon 18, title 14).
  The inlined Recovery row landed here uses the flat profile-chip
  shape (no border, `padding: 12px 18px`, icon 20, title 15) because
  extracting a real `NavRow` component is deferred to step 7/8 when
  the Invites / Privacy / About / Account NavRows land together. The
  Recovery row will look like the odd-one-out until that refactor —
  accept the visual mismatch deliberately rather than re-styling it
  twice.
- Row layout (diverges from `design/cairn-screens.jsx:1219–1224` per
  the "Visual divergence" bullet above — values listed here are the
  ones to implement):
  - Leading `Icon name="trash-2" size={20}` in `var(--stone)`.
  - Title `"Deleted lists"` — 15 px, weight 600, `var(--ink)`.
  - Subtitle `"Restore lists you've deleted"` — 12 px, `var(--stone)`,
    `margin-top: 2px`.
  - Trailing `Icon name="chevron-right" size={18}` in `var(--stone-lt)`.
  - Padding: `12px 18px`; full-width transparent background; no
    border-bottom (sections separate themselves by the section
    header's `padding-top`).
- `data-test="settings-deleted-lists"` on the button.
- Navigation: `goto(resolve('/settings/deleted-lists'))` — both
  `goto` and `resolve` are already imported at the top of the file.
- Use British English in user-visible copy: subtitle is "Restore
  lists you've deleted" — already British; no apostrophe traps.
- **Drop `margin-top: auto` from `.signout-section`.** The existing
  rule (`SettingsScreen.svelte:287`) pushes Sign-out to the bottom of
  the flex column. With Recovery inserted between Text-size and
  Sign-out, that float would leave Recovery orphaned at the top with
  a tall empty gap above the floating Sign-out — visually inconsistent
  with `design/cairn-screens.jsx:1219-1244`, where Recovery, About, and
  Account/Sign-out all sit in continuous natural flow. Removing the
  `margin-top: auto` puts Sign-out back in natural flow directly below
  Recovery, matching the design's stacking. Keep the `padding: 0 18px
  24px` rule unchanged so the bottom breathing room before the screen edge is preserved.
  (The 24px is static padding, not `env(safe-area-inset-bottom)` —
  proper safe-area treatment for the bottom of Settings is out of
  scope here.)

**Files:**
- `web/src/lib/settings/components/SettingsScreen.svelte` (modify)
- `web/src/lib/settings/components/SettingsScreen.test.ts` (modify)

**Steps:**
1. RED — In `SettingsScreen.test.ts`, add two new tests inside the
   existing `describe('SettingsScreen', () => { … })` block:
   - `(j) Recovery row renders` — queryByDataTest('settings-deleted-lists')
     is not null; its text content includes "Deleted lists".
   - `(k) clicking Recovery row navigates to /settings/deleted-lists` —
     after `await fireEvent.click(getByDataTest('settings-deleted-lists'))`,
     `vi.mocked(goto)` is called once with `vi.mocked(resolve)('/settings/deleted-lists')`.
     Use the same pattern as the existing test `(i) clicking profile chip
     navigates to /profile`.
2. RED — Run `cd web && pnpm test -- SettingsScreen` and confirm the
   two new tests fail (the row doesn't exist yet).
3. GREEN — In `SettingsScreen.svelte`, after the existing
   `<section class="preference-group">` for Text size and before
   `<section class="signout-section">`, add the Recovery section
   with the layout described in Decisions. Add the matching CSS
   rules (`.nav-row`, `.nav-row-text`, `.nav-row-title`,
   `.nav-row-sub`, etc. — name as fits the file's existing style).
   In the same diff, remove `margin-top: auto;` from the
   `.signout-section` CSS rule (`SettingsScreen.svelte:287`) — see
   Decisions for why.
4. GREEN — Re-run `cd web && pnpm test -- SettingsScreen` and
   confirm green.
5. Run `cd web && pnpm lint` and `cd web && pnpm check` — both must
   be green (lint catches floating promises; check catches the
   route-id form in `resolve()`).

**Verify:** `cd web && pnpm lint` · `cd web && pnpm check` · `cd web && pnpm test -- SettingsScreen`

---

## Phase 2 — Tombstone visuals

### [x] 2.1 Create `TOMBSTONE_UID` constant and add tombstone branch to `Avatar.svelte`

**Created:** 2026-05-27T10:49:39Z
**Completed:** 2026-05-27T11:58:43Z

**Why:** Parent R10 requires `<Avatar uid={TOMBSTONE_UID}>` to render
a flat gray disc with no initials. The constant is the shared
dependency for this task and for task 2.2 (`ItemsScreen.svelte`
attribution); creating it here, in the same commit as its first
consumer, keeps the unit small while preventing the literal UUID from
proliferating across the codebase.

**Prerequisites:** None.

**Decisions:**
- Create `web/src/lib/shared/model/constants.ts` with exactly one
  export:
  ```ts
  export const TOMBSTONE_UID = '00000000-0000-0000-0000-000000000000';
  ```
  No JSDoc, no other constants. Future shared constants can live in
  the same file; for now `TOMBSTONE_UID` is the only one.
- No standalone test for `constants.ts` — it's a single string
  literal; the consumers' tests (this task's Avatar tests + task
  2.2's ItemsScreen tests) cover it.
- `Avatar.svelte` branch order in the template must be
  **tombstone → photo → initials**. Implement as:
  ```svelte
  {#if isTombstone}
    <span data-test={rest['data-test']} data-tombstone="true" style="{sharedStyle} background: oklch(78% 0.01 80);"></span>
  {:else if showPhoto}
    …existing img branch…
  {:else}
    …existing initials branch…
  {/if}
  ```
  Where `const isTombstone = $derived(uid === TOMBSTONE_UID);`. The
  tombstone span has no text content (no initials) and no `data-hue`
  attribute (no hue to record). It keeps the same `sharedStyle`
  (display, alignment, border-radius, width, height) so sizing stays
  consistent.
- The CSS colour `oklch(78% 0.01 80)` matches the design's
  `SEED_USERS.ghost.tone` (`design/cairn-data.jsx:10`) and parent
  R10. Inline it as a `style="…"` attribute (the existing branches
  inline their styles the same way).
- Branch ordering matters even if `avatar_version = 0` on the seeded
  tombstone today — a future fixture (or a bug elsewhere) passing
  `avatarVersion > 0` together with `TOMBSTONE_UID` must still render
  the gray disc, not a photo.

**Reference:** `docs/frontend-layout.md` "Domain folder shape" —
`model/` is non-reactive pure TS; `shared/` is the right tier for
cross-domain code.

**Files:**
- `web/src/lib/shared/model/constants.ts` (create)
- `web/src/lib/shared/components/Avatar.svelte` (modify)
- `web/src/lib/shared/components/Avatar.test.ts` (modify)

**Steps:**
1. RED — In `Avatar.test.ts`, add three tests inside the existing
   `describe('Avatar', () => { … })` block:
   - `(i) tombstone uid renders empty gray disc` — render with
     `uid: '00000000-0000-0000-0000-000000000000', displayName: 'Anything'`;
     assert the rendered element has `data-tombstone="true"`,
     `textContent` is empty, and `querySelector('img')` is `null`.
   - `(j) tombstone takes precedence over positive avatarVersion` —
     render with `uid: '00000000-0000-0000-0000-000000000000', displayName:
     'Anything', avatarVersion: 5`; assert `querySelector('img')` is
     null and `data-tombstone="true"` is set.
   - `(k) tombstone takes precedence over non-empty displayName` —
     render with `uid: '00000000-0000-0000-0000-000000000000', displayName:
     'Alice'`; assert `container.textContent?.trim()` is empty (no
     initials).
   Use the literal UUID string in the tests (don't import
   `TOMBSTONE_UID` — the tests verify the *contract* of the literal
   value, not the constant module).
2. RED — Run `cd web && pnpm test -- Avatar` and confirm the three
   new tests fail (the tombstone branch doesn't exist yet).
3. GREEN — Create `web/src/lib/shared/model/constants.ts` with the
   single export from Decisions.
4. GREEN — In `Avatar.svelte`:
   - Add `import { TOMBSTONE_UID } from '$lib/shared/model/constants';`
     at the top of the existing `<script lang="ts">` block (lines
     1-38 today — the block exists but has no `import` statements yet;
     do *not* add a second `<script>` block).
   - Add `const isTombstone = $derived(uid === TOMBSTONE_UID);` next
     to the existing `$derived` declarations.
   - Convert the existing `{#if showPhoto}…{:else}…{/if}` into a flat
     three-branch chain `{#if isTombstone}…{:else if showPhoto}…{:else}…{/if}`
     per the template snippet in Decisions. Keep the photo and
     initials branches byte-identical; only the outer chain shape
     changes.
5. GREEN — Re-run `cd web && pnpm test -- Avatar` and confirm green
   (the three new tests pass, the existing eight tests still pass).
6. Run `cd web && pnpm lint` and `cd web && pnpm check` — both must
   be green.

**Verify:** `cd web && pnpm lint` · `cd web && pnpm check` · `cd web && pnpm test -- Avatar`

---

### [ ] 2.2 Add tombstone attribution styling to `ItemsScreen.svelte`

**Created:** 2026-05-27T10:49:39Z
**Completed:**

**Why:** Parent R11 requires the Items accordion's "Added by …" /
"Last edited by …" attribution to render the attributor's name in
muted italic when the underlying UID is the tombstone. The PostgREST
join already returns `display_name = 'Deleted user'` for the
tombstone row (seeded by the migration), so this task is purely
visual — toggle a CSS class on the existing `<strong>` based on the
already-present `created_by` / `modified_by` UID.

**Prerequisites:** Task 2.1 (creates `web/src/lib/shared/model/constants.ts`
exporting `TOMBSTONE_UID`).

**Decisions:**
- Detect tombstone status in the template via Svelte's `class:` shorthand,
  not via derived script state. The relevant `<strong>` elements live
  inside the `{#each items.rows as item}` block at
  `web/src/lib/item/components/ItemsScreen.svelte:147–153`. Change:
  ```svelte
  <strong class:tombstone={item.created_by === TOMBSTONE_UID}>
    {item.created_by_name}
  </strong>
  ```
  and the same shape on `item.modified_by_name` with `item.modified_by`.
  Two short additions, no new derived state, no new types.
- The `Item` type already exposes both `created_by: string` and
  `modified_by: string` (see
  `web/src/lib/item/model/item.ts:8–9`), so the comparison is
  type-safe.
- New CSS rule:
  ```css
  .attribution strong.tombstone {
    font-style: italic;
    font-weight: normal;
    color: var(--stone-lt);
    font-family: 'Newsreader Variable', Georgia, serif;
  }
  ```
  The override of `font-weight: normal` is intentional — the existing
  `.attribution strong { font-weight: 600 }` would otherwise win, and
  the design (`design/cairn-screens.jsx:1552–1556`) renders the name
  in regular weight. The serif stack is inlined (not `var(--serif)`)
  because the project has no `--serif` CSS token; the same literal
  stack is used by `.notes` higher in this file and by `reset.css:16`.
- Import: add `import { TOMBSTONE_UID } from '$lib/shared/model/constants';`
  to the script block at the top of the file.
- The two `<strong>` checks are **independent** — an item can have a
  live creator and a tombstone editor (or vice versa) after the
  `on delete set default` cascade touches one column but not the
  other (the trigger gates in `db/migrations/0004_domain_schema.sql`
  are per-column). The test below covers this.
- The `data-test` attribute strategy: add
  `data-test="attribution-creator-{item.id}"` on the
  `created_by_name` `<strong>` and
  `data-test="attribution-editor-{item.id}"` on the
  `modified_by_name` `<strong>` so the tests can target each
  independently. The existing tests don't read these elements, so
  this addition is non-breaking.

**Files:**
- `web/src/lib/item/components/ItemsScreen.svelte` (modify)
- `web/src/lib/item/components/ItemsScreen.test.ts` (modify)

**Steps:**
1. RED — In `ItemsScreen.test.ts`, add two new tests inside the
   existing `describe('ItemsScreen', () => { … })` block. Both tests
   need an item open in the accordion. The existing fixtures
   (`ITEM_1`, `ITEM_2`) use `created_by: 'user-1'`; build new
   fixtures with `created_by` set to the tombstone UUID. Continue the
   existing `(new-*)` label series (the file already has `(new-a)`):
   - `(new-b) tombstone created_by renders italic class on creator name` —
     set `items.rows = [{ ...ITEM_1, created_by: '00000000-0000-0000-0000-000000000000', created_by_name: 'Deleted user' }]`,
     render the screen, click `row-item-1` to open the accordion,
     and assert
     `getByDataTest('attribution-creator-item-1').classList.contains('tombstone')`
     is `true`.
   - `(new-c) live creator + tombstone editor renders italic on editor only` —
     set `items.rows = [{ ...ITEM_1, created_by: 'user-1', created_by_name: 'Alice', modified_by: '00000000-0000-0000-0000-000000000000', modified_by_name: 'Deleted user', modified_at: '2026-02-01T00:00:00Z' }]`
     (note `modified_at` advanced so the existing `wasEdited` guard
     in `fetchItems` would have set `modified_by_name` — here we set
     it directly because the test fixture bypasses `fetchItems`).
     Open the row, then assert:
     `getByDataTest('attribution-creator-item-1').classList.contains('tombstone')`
     is `false` *and*
     `getByDataTest('attribution-editor-item-1').classList.contains('tombstone')`
     is `true`.
   Use the literal UUID in the fixtures (don't import
   `TOMBSTONE_UID` — the tests pin down the value).
2. RED — Run `cd web && pnpm test -- ItemsScreen` and confirm the
   two new tests fail (the `data-test` attributes don't exist yet,
   so `getByDataTest` throws).
3. GREEN — In `ItemsScreen.svelte`:
   - Add `import { TOMBSTONE_UID } from '$lib/shared/model/constants';`
     to the script block (alongside the existing imports).
   - Replace the existing `<strong>{item.created_by_name}</strong>`
     with:
     ```svelte
     <strong
       data-test="attribution-creator-{item.id}"
       class:tombstone={item.created_by === TOMBSTONE_UID}
     >{item.created_by_name}</strong>
     ```
     and the corresponding `<strong>{item.modified_by_name}</strong>`
     with the `editor` variant on `item.modified_by`.
   - In the `<style>` block, append the
     `.attribution strong.tombstone` rule from Decisions.
4. GREEN — Re-run `cd web && pnpm test -- ItemsScreen` and confirm
   green (the two new tests pass; the existing tests still pass).
5. Run `cd web && pnpm lint` and `cd web && pnpm check` — both must
   be green.
6. Final sweep: `./scripts/check.sh` (or the equivalent web-only
   subset if the DB stack isn't up). The full gauntlet catches
   anything cross-layer the per-component test misses.

**Verify:** `cd web && pnpm lint` · `cd web && pnpm check` · `cd web && pnpm test -- ItemsScreen` · `./scripts/check.sh`
