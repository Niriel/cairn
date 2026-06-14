# Tasks

## Reference skills and docs

- **`docs/ui.md`** — "Where CSS lives: layout local, visual global"; keep
  layout in the component's scoped `<style>`, visual rules global.
- **`design/cairn-screens.jsx`** (ListsScreen) — layout reference: each list is
  a nav-row-shaped row with a trailing chevron (leading icon is seed-only).
- **`.claude/skills/writing-tasks.md`** — component tests assert user-visible
  behaviour, not internals.
- **Web verify commands:** `cd web && pnpm check` (svelte-check) ·
  `pnpm test` (Vitest) · `pnpm test:e2e` (Playwright — work box only;
  unrunnable on the laptop). Run `pnpm prettier --write <files>` before
  committing — the pre-commit hook runs Prettier and `pnpm lint` is ESLint-only.

## Phase 0 — doc reconciliation

### [x] 0.1 Update `docs/ui.md` for the new public-marker placement

**Created:** 2026-06-14T22:10:00Z
**Completed:** 2026-06-14T20:22:23Z

**Why:** `docs/ui.md` ("Public lists" → "Public marker (members only)") says the
Lists-screen globe "sits immediately after the list name." This plan renders it
in `NavRow`'s `trailing` slot, which — because `.nav-row-text` is `flex: 1` —
puts the globe at the right edge next to the chevron, not hugging the name (R3).
Reconcile the doc before the code lands so spec and implementation agree.

**Prerequisites:** None.

**Decisions:**
- Edit only the **Lists-screen row** bullet under "Public marker (members
  only)". Leave the Items-screen-TopBar bullet and the rest of the section
  unchanged.
- New wording describes the placement accurately: the globe renders in the
  nav-row's trailing slot, immediately **before the trailing chevron** (the
  row's right edge), keeping its visually-hidden _"Public list"_ label. Note it
  is a deliberate consequence of keeping `NavRow.title` a plain string (the
  globe can't sit mid-title).
- British English in any user-facing phrasing; this is spec prose, so plain
  description is fine.

**Files:**
- `docs/ui.md` (modify — the "Public marker (members only)" Lists-screen bullet)

**Steps:**
1. In `docs/ui.md`, replace the Lists-screen bullet
   ("**Lists-screen row:** the globe sits immediately after the list name…")
   with wording that places the globe in the nav-row trailing slot, just before
   the chevron at the row's right edge, retaining the visually-hidden
   _"Public list"_ label, and noting this follows from `NavRow.title` being a
   plain string.
2. Leave the Items-screen-TopBar bullet unchanged.

**Verify:** Re-read the edited bullet — it should match the placement the Phase 2
markup produces (globe in `trailing`, before the chevron), with no remaining
"immediately after the list name" wording.

## Phase 1 — make `NavRow.lead` optional

### [x] 1.1 Allow `NavRow` to render without a leading visual

**Created:** 2026-06-14T19:52:25Z
**Completed:** 2026-06-14T20:26:31Z

**Why:** The Lists-screen title will use `NavRow` but has no leading icon
(lists have no icon field). `NavRow.lead` is currently a required snippet, so a
lead-less row won't type-check or render.

**Prerequisites:** None.

**Decisions:**
- Change the prop type `lead: Snippet` → `lead?: Snippet`.
- Guard the render: replace the unconditional `{@render lead()}` with
  `{#if lead}{@render lead()}{/if}`.
- Backward-compatible: existing callers (`SettingsScreen.svelte`,
  `PrivacyScreen.svelte`) always pass `lead`, so they are unaffected.
- The component keeps rendering the title (`.nav-row-title.row-title`), optional
  sub, optional trailing, and the always-present `chevron-right` icon.

**Files:**
- `web/src/lib/shared/components/NavRow.svelte` (modify)
- `web/src/lib/shared/components/NavRow.test.ts` (modify)

**Steps:**
1. RED — In `NavRow.test.ts`, add a case: render `NavRow` with `title` and an
   `onclick` but **no** `lead` snippet; assert rendering does not throw, the
   title text is present (`.nav-row-title`), and the `chevron-right` icon renders
   (the mocked `Icon` emits `<span data-test="chevron-right">`, so query
   `[data-test="chevron-right"]`). Run
   `cd web && pnpm test src/lib/shared/components/NavRow.test.ts` and confirm it
   fails (today `lead` is required — `{@render lead()}` throws when `lead` is
   undefined, so the render throws before any assertion).
2. GREEN — In `NavRow.svelte`, change `lead: Snippet` to `lead?: Snippet` in the
   `Props` type and wrap the render in `{#if lead}{@render lead()}{/if}`.
3. GREEN — Re-run the test; confirm green. Run `pnpm check` to confirm existing
   `NavRow` callers still type-check.

**Verify:** `cd web && pnpm test src/lib/shared/components/NavRow.test.ts` · `pnpm check`

## Phase 2 — restructure the Lists-screen row

### [x] 2.1 Render the list title as a nav-row and move the More button below it

**Created:** 2026-06-14T19:52:25Z
**Completed:** 2026-06-14T20:38:12Z

**Why:** Each list title is a bare text button with no chevron — it behaves
like a nav-row but doesn't look like one. Render it as the shared `NavRow`
(full-width tap target + trailing chevron) and relocate the per-list "More"
button into the extra-info block beneath the title, pinned top-end.

**Prerequisites:** Task 1.1 (`NavRow` accepts no `lead`).

**Decisions:**
- **Markup.** In `web/src/lib/list/components/ListsScreen.svelte`, inside each
  `<li class="row" data-test="list-row-{item.id}">`, replace the current
  `.row-top` (title `<Button>` + inline `MoreButton`) with:
  - A `NavRow` with `title={item.name}`, `data-test="list-nav-{item.id}"`,
    `onclick={() => void goto(resolve(`/lists/${item.id}`))}`, and **no** `lead`.
    For the public marker, **always declare** the `trailing` snippet and guard
    its *body* — do **not** wrap the `{#snippet}` declaration in `{#if}`, which
    in Svelte 5 makes it a local snippet that never reaches `NavRow`. Pattern
    (mirrors `PrivacyScreen.svelte`, which guards its trailing Badge the same
    way):
    `{#snippet trailing()}{#if item.is_public}<span class="public-marker" data-test="list-public-marker-{item.id}"><Icon name="globe" size={14} /><span class="sr-only">Public list</span></span>{/if}{/snippet}`.
    `NavRow`'s `{#if trailing}` then renders an empty (harmless) trailing slot on
    private rows; test (k) still passes because the inner `{#if item.is_public}`
    is false, so `list-public-marker-{id}` isn't emitted. `NavRow` forwards
    `data-test` to its inner button and always renders the trailing
    `chevron-right`.
  - A sibling `<div class="extra">` containing, in order: the `MoreButton`
    (`size={18}`, `aria-label="List options"`,
    `data-test="list-overflow-{item.id}"`,
    `onclick={() => (overflowList = item)}`, `style="color: var(--stone)"`),
    then the existing description block (the toggleable `<button class="desc">`
    with `data-test="list-desc-{item.id}"`, or the `.desc.no-desc` placeholder),
    then the existing `<div class="meta fine">` (item count · `timeAgo` ·
    avatars). Keep `toggleDesc` / `expandedIds` / `truncatedIds` / `descTextEls`
    wiring unchanged.
  - The `MoreButton` must be a **sibling** of `NavRow`, never nested inside it
    (the nav-row is a full-width button; nested buttons are invalid HTML).
- **Public marker placement.** The globe now renders in `trailing`, so it sits
  just before the chevron rather than immediately after the name. This is the
  accepted trade-off of keeping `NavRow.title` a plain string.
- **CSS — padding reconciliation.** `NavRow`'s inner button is
  `variant="text" size="md"` → `padding: 0.75rem 1.125rem` (see
  `Button.svelte` `.text.size-md`). To stop the title being indented twice as
  far as the description, set `.row { padding: 0; }` (drop the current
  `0.875rem 1.125rem`). The nav-row's button padding supplies the title's
  top/left inset.
- **CSS — `.extra`.** New rule: `position: relative;` and the single resolved
  padding `padding: 0.5rem 2.5rem 0.875rem 1.125rem;` — i.e. top `0.5rem`, right
  `2.5rem`, bottom `0.875rem`, left `1.125rem`. The left `1.125rem` aligns
  description/meta with the title text; the bottom restores inter-row breathing
  room; the wide right `2.5rem` lets the ellipsizing description and the metadata
  clear the absolutely-positioned More button. **Accepted trade-off:** that
  right inset also gutters the metadata line and every line of an *expanded*
  (multi-line) description, not just the first line under the button — eyeball it
  in the verify step. **Avoid a doubled top gap:** `.desc` currently carries
  `margin-top: 0.5rem`, which would stack with this rule's `padding-top: 0.5rem`
  (→ 1rem below the dashed rule, vs the old ~0.5rem). Since `.desc` is the first
  in-flow child of `.extra` (the `.more` span is `position: absolute`), **drop
  `.desc`'s `margin-top`** (let `.extra`'s `padding-top` own that gap). Add the
  **retained** dashed rule here:
  `border-top: 1px dashed var(--rule);` (moved from the old `.row-top`). Note the
  rule is now **full-bleed** (edge-to-edge) rather than inset as before, because
  `.row` drops to `padding: 0` — this is accepted and consistent with the
  full-bleed solid per-row divider; do not re-inset it.
- **CSS — `.more`.** Wrap the `MoreButton` in `<span class="more">…</span>` and
  position **the span** top-end: `position: absolute; top: 0.375rem;
  right: 0.375rem;`. Do **not** pass `class="more"` to `MoreButton` directly:
  it spreads `{...rest}` into `IconButton`, which renders
  `<button class="icon-btn" {...rest}>`, and a forwarded `class` (Svelte's
  last-wins spread) would clobber `icon-btn` and drop its `padding: 4px`. Keep
  `style="color: var(--stone)"` on the `MoreButton` itself. Add `z-index: 1`
  only if a click-reliability issue appears.
- **CSS — cleanup.** Remove the `.row-top` rule (the old dashed-border line) and
  the `.media` class on that wrapper. Drop `.name`'s `flex:1`/`min-width:0`
  styling if `.name` is no longer used once the title is `NavRow.title`. Keep
  `.public-marker`, `.sr-only`, `.see-toggle`, `.meta`, `.dot`, `.avatars`
  unchanged, and keep `.desc*` unchanged **except** for dropping `.desc`'s
  `margin-top` (see the `.extra` rule above — its `padding-top` now owns that
  gap). Per-list dividers come from the global
  `.rows .row { border-bottom }` (`surfaces.css`) and need no change.
- **CSS — title wrap + chevron alignment (edit `NavRow.svelte`).** Dropping
  `.name` removes its `white-space: normal; overflow-wrap: anywhere;`, so the
  title would inherit the `<Button>` base `white-space: nowrap` (no ellipsis) and
  a long list name would overflow into the chevron. Add `white-space: normal;
  overflow-wrap: anywhere;` to `.nav-row-title` in `NavRow.svelte` so long names
  wrap as they do today — harmless to the short fixed Settings/Privacy labels.
  **Also** add `align-items: flex-start` to the nav-row button (it inherits
  `align-items: center` from `Button.svelte`): without it, a wrapped multi-line
  title centres the trailing globe and the `chevron-right` against its midpoint,
  contradicting `docs/ui.md` "Row navigation pattern" (chevron pinned to the top
  of a multi-line name). `flex-start` is a no-op for single-line labels (top ==
  centre) but **does** shift the lead icon / trailing Badge / chevron on the
  two-line title+sub Settings/Privacy rows from centre to top — confirm in the
  verify step those still read well, and scope the rule to the lead-less case if
  they regress. Both rules must live in `NavRow.svelte` (scoped styles in
  `ListsScreen.svelte` cannot reach NavRow's internals), hence `NavRow.svelte` is
  in this task's Files.
- **Test — assert the nav-row affordance.** The new chevron/nav-row *is* the
  feature, so add a `ListsScreen.test.ts` case asserting each row renders a
  `.nav-row` wrapper (e.g. `getByDataTest('list-row-'+id).querySelector('.nav-row')`
  is non-null). `NavRow`/`Button`/`Icon` are **not** mocked in this file, so the
  real `.nav-row` div renders. This fails before the markup swap (no nav-row
  today) and passes after — a genuine RED→GREEN guard for R1.
- **Exact padding values may need a small visual tweak** — confirm against the
  running app in the verify step.
- **Preserved `data-test` (none renamed):** `list-row-{id}` on `<li>`,
  `list-nav-{id}` on the nav-row's button, `list-public-marker-{id}` on the
  trailing globe, `list-desc-{id}` on the description block (now inside
  `.extra`), `list-overflow-{id}` on the More button (now inside `.extra`).

**Reference:** `docs/ui.md` "Where CSS lives" — layout stays in the scoped
`<style>`; `design/cairn-screens.jsx` ListsScreen for the row shape.

**Files:**
- `web/src/lib/list/components/ListsScreen.svelte` (modify)
- `web/src/lib/shared/components/NavRow.svelte` (modify — add the `.nav-row-title`
  wrap rule)
- `web/src/lib/list/components/ListsScreen.test.ts` (modify — add the `.nav-row`
  assertion; also adjust if the DOM-move breaks a query)

**Steps:**
1. RED — Run `cd web && pnpm test src/lib/list/components/ListsScreen.test.ts`
   first to capture the current green baseline (the selectors must keep passing
   after the change). These existing cases are the regression guard: click
   `list-nav-{id}` → `goto('/lists/'+id)`; click `list-desc-{id}` toggles
   `.expanded`; `list-public-marker-{id}` presence for public lists;
   `list-overflow-{id}` click opens the sheet; row text contains "N items".
2. RED — Add a new case to `ListsScreen.test.ts` asserting each row renders the
   nav-row affordance: `getByDataTest('list-row-'+id).querySelector('.nav-row')`
   is non-null (`NavRow`/`Button`/`Icon` are not mocked here, so the real
   `.nav-row` wrapper renders). Run the file and confirm this new case **fails**
   today (no `.nav-row` is rendered yet).
3. GREEN — Edit `ListsScreen.svelte` markup per Decisions (NavRow + `.extra`
   block with the relocated `MoreButton`, description, meta).
4. GREEN — Edit the `<style>` block per Decisions (zero `.row` padding, add
   `.extra` with the full-bleed dashed `border-top`, wrap `MoreButton` in
   `<span class="more">` and position the span, remove `.row-top`/`.media`, drop
   dead `.name` rules).
5. GREEN — In `NavRow.svelte`, add `white-space: normal; overflow-wrap: anywhere;`
   to `.nav-row-title` so long list names wrap instead of overflowing the chevron
   (the wrap behaviour `.name` used to provide), and add `align-items: flex-start`
   to the nav-row button so the chevron/globe pin to the top of a wrapped
   multi-line name rather than centring against it (per `docs/ui.md` "Row
   navigation pattern").
6. GREEN — Re-run the Lists-screen Vitest file; the new `.nav-row` case and all
   preserved-selector cases pass. Adjust an existing case only if the DOM-move
   legitimately broke a query (e.g. a `closest`/ancestor assumption) — do not
   weaken behavioural assertions.
7. GREEN — `pnpm check` and `pnpm prettier --write` on the changed Svelte files
   (`ListsScreen.svelte`, `NavRow.svelte`) and the test.
8. VERIFY (manual, `pnpm dev`): each list shows name + trailing chevron as a
   nav-row; the dashed rule sits between title and extra-info; the More button
   is pinned top-end of the extra-info; a long description ellipsizes without
   running under the More button; a long list **name** wraps onto multiple lines
   (rather than overflowing into the chevron) **with the chevron and globe
   pinned to the top of the wrapped name, not centred against it**; the gap
   below the dashed rule looks right (no doubled spacing from a stray `.desc`
   margin-top); the expanded-description right gutter (from `.extra`'s
   `padding-right`) looks acceptable; tapping the title navigates, tapping the
   description toggles see-more/less, tapping More opens the overflow sheet;
   title text aligns horizontally with the description below it. **Also check the
   Settings and Privacy screens** — their two-line (title+sub) nav-rows still
   read well after the `align-items: flex-start` change (lead icon / trailing
   Badge / chevron now top-aligned); if they regress, scope the rule to the
   lead-less case.
9. VERIFY (e2e, work box only): `cd web && pnpm test:e2e items.spec.ts public-list.spec.ts invites.spec.ts`
   — navigation via `list-nav-` rows and row counts still work. Playwright is
   unrunnable on the laptop; if so, say so explicitly rather than claim a
   pass.

**Verify:** `cd web && pnpm test src/lib/list/components/ListsScreen.test.ts` · `pnpm check` · `pnpm test:e2e items.spec.ts` (work box only)

**Notes:**
- **Side work:** removed the now-unused `Button` import from
  `ListsScreen.svelte` — the title button is now the `NavRow`'s inner button,
  so the direct `Button` import was dead and would have failed ESLint.
- **Implementation detail:** the `align-items: flex-start` rule on the nav-row
  button had to be written as `.nav-row :global(button) { … }` in
  `NavRow.svelte`, because the `<button>` element belongs to `Button.svelte`'s
  scope, not `NavRow`'s — a plain scoped `button` selector wouldn't match it.
  Scoped under `.nav-row` so it only affects NavRow's button.
- **E2e not run:** `pnpm test:e2e` is unrunnable in this environment —
  Playwright reports "does not support chromium on ubuntu26.04-x64" and
  `playwright install chromium firefox` fails, so no browser is available
  (consistent with the machine-conditional Playwright note). Vitest
  (`ListsScreen.test.ts` + `NavRow.test.ts`, 31 passing), `pnpm check`
  (0 errors), and `pnpm lint` (clean) all pass. Manual visual verification
  (Step 8, `pnpm dev`) and the e2e step (Step 9) were not performed here and
  should be run on a box with a working browser before merge.
