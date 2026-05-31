# Tasks

## Reference skills and docs

- **`docs/frontend-layout.md`** — tier rules (`basic/` vs `shared/`); test
  files next to SvelteKit route files must omit the `+` prefix.
- **`docs/ui.md`** — empty-state pattern spec (one illustrated pattern, used
  on every screen).
- **`docs/testing.md`** — Vitest for component behaviour.
- **`docs/quality.md`** — lint / format / type-check toolchain.
- **`design/Cairn - Design Canvas.html`** — visual reference for the
  no-regression contract; open in a browser.

---

## Phase 1 — Typography lift

### [x] 1.1 Add global `h2` and `ul / ol` rules to `typography.css`

**Created:** 2026-05-30T08:24:10Z
**Completed:** 2026-05-31T03:13:59Z

**Why:** Every `div.section-label → h2` migration in Phase 3 is safe only
when the global `h2` rule already covers the typography, so the per-file
`.section-label` CSS can be removed in the same task without a styling gap.
Similarly, every `div.rows → ul` and `div.row → li` migration relies on `ul`
having no browser-default padding, margin, or list-style bullets. Lifting
these rules first means Phase 3 tasks are purely structural — no typography
decisions left to make mid-sweep.

**Prerequisites:** 0901 merged into `0900_refactor_css_components`, which is
the base of this branch (`0902_icon_semantic_html`).

**Decisions:**
- `h2` rule carries **only font properties**, not padding. Padding on section
  labels varies by context (18 px horizontal in MembersScreen, 4 px in
  InvitePickerSheet) and must stay as scoped CSS within each component.
  After the Phase 3 sweep, the per-file scoped block is `h2 { padding: …; }`
  — just the spacing, inheriting font from the global rule.
- The canonical values come from the consistent `.section-label` definitions
  across `MembersScreen.svelte` and `InvitePickerSheet.svelte`:
  `font-size: 11.5px; color: var(--stone); font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase`.
- `ul, ol` reset: `list-style: none; margin: 0; padding: 0`. Cairn lists are
  flex/grid scaffolds; browser bullets and indentation are always overridden
  anyway — one global rule beats per-component repetition.
- No global `h1` or `h3` rule — sheet titles and member-name spans vary too
  much across files for a single value to add clarity. Semantic `<h1>` and
  `<h3>` tags land in Phase 3 for accessibility; per-component scoped CSS
  targeting those tags stays.

**Files:**
- `web/src/lib/shared/styles/typography.css` (modify)

**Steps:**
1. Open `web/src/lib/shared/styles/typography.css`. It currently has the font
   imports, the `--font-size-scale` root rule, `.hint` / `.hint-error`,
   `.disclaimer`, and `.explainer`.
2. Append after the existing rules:

   ```css
   /* Screen titles — the TopBar <h1> is the one canonical page-level heading.
      Font declarations move here from TopBar's scoped .centre CSS in task 3.10. */
   h1 {
     font-family: 'Newsreader Variable', Georgia, serif;
     font-size: 22px;
     font-weight: 500;
     letter-spacing: -0.01em;
     color: var(--ink);
     margin: 0;
   }

   /* Section labels — replaces per-file .section-label rules once
      div.section-label elements are migrated to <h2> in Phase 3.
      Sheet titles also use <h2> but override this via a scoped
      header h2 { font-size: 17px; … } rule within each sheet component. */
   h2 {
     font-size: 11.5px;
     color: var(--stone);
     font-weight: 600;
     letter-spacing: 0.06em;
     text-transform: uppercase;
   }

   /* Row names — normalises the 14–15.5 px drift across files.
      ListsScreen (17 px) and ProfileSheet (18 px) keep scoped overrides. */
   h3 {
     font-size: 15px;
     font-weight: 600;
     color: var(--ink);
     margin: 0;
   }

   /* Cairn lists are flex/grid scaffolds, not bulleted content. */
   ul,
   ol {
     list-style: none;
     margin: 0;
     padding: 0;
   }
   ```

3. Run `pnpm lint` to confirm Prettier is happy with the CSS formatting.
4. Run `pnpm check` to confirm no type errors (this file has none, but
   svelte-check runs the global CSS through its pipeline).
5. Run `pnpm test` and confirm all existing tests pass. At this point no
   markup has changed, so tests must be green unchanged.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

---

## Phase 2 — `<EmptyState>` extraction

### [x] 2.1 Extract `<EmptyState>` and write Vitest tests

**Created:** 2026-05-30T08:24:10Z
**Completed:** 2026-05-31T08:14:28Z

**Why:** Six screens (`ListsScreen`, `ItemsScreen`, `InvitesInboxScreen`,
`DeletedListsScreen`, `TrashScreen`, `BlockedScreen`) each render an
empty-state block — most copy-paste the same illustrated markup
(`.empty-circle` icon disc + `.empty-heading` serif title + `.empty-body`
paragraph + optional CTA button), and `BlockedScreen` had drifted to a
one-off dashed-box look. Extracting a single `<EmptyState>` before the
migration tasks unifies all six on one look and makes each screen's Phase 4
task a three-line replace — no per-screen design decisions.

**Prerequisites:** Task 1.1 (global `h2` and `ul/ol` rules in place).

**Decisions:**
- **Location:** `web/src/lib/shared/components/` — empty-state is an
  application-level component (used across multiple domains: list, item,
  invite, privacy), not a `basic/` framework primitive.
- **CTA API:** two optional props `ctaLabel?: string` and `onCta?: () => void`.
  When both are supplied, renders a `<Button variant="rect" tone="ink"
  size="md" leadingIcon="plus">`. `tone="ink"` (dark background) matches both
  the existing `ItemsScreen` CTA style and the empty-state spec in `docs/ui.md`
  ("CTA button: `background: var(--ink)`"). When either prop is absent, no CTA
  is rendered. This is simpler than a slot (callers don't manage the Button
  import) and more explicit than a single `cta?: { label; onclick }` object.
- **No `variant` prop — one look everywhere.** An earlier draft had
  `variant: 'illustrated' | 'simple'`, where `simple` was a dashed inline box
  used only by `BlockedScreen`. That reintroduced the inconsistency this plan
  removes. The component is single-shape (illustrated); `BlockedScreen` uses it
  like every other screen (task 4.4), and `docs/ui.md` documents one pattern.
- **Props:**
  - `icon?: IconName` — rendered inside the disc. Optional when `iconContent`
    is supplied.
  - `iconContent?: Snippet` — Svelte 5 snippet rendered inside the disc in
    place of `<Icon>`. Use for disc content outside the icon system (e.g.
    `<CairnGlyph>` in `ListsScreen`). Takes priority over `icon`.
  - `iconSize?: number` — size passed to `<Icon>`. Default `32`. Pass `44`
    for screens whose original markup used a larger icon (TrashScreen,
    DeletedListsScreen — see Phase 4 tasks). Ignored when `iconContent` is
    supplied.
  - `title?: string` — heading; optional for future flexibility (all current
    illustrated call sites supply a title).
  - `body?: string` — paragraph below the heading. Optional; TrashScreen and
    DeletedListsScreen have no body paragraph.
  - `ctaLabel?: string`, `onCta?: () => void` — see CTA API above.
  - `data-test?: string` — forwarded to the outermost element.
- **Illustrated CSS** (matches values across all four illustrated screens):
  - Outer wrapper: `display: flex; flex-direction: column; align-items: center;
    justify-content: center; padding: 40px 36px; text-align: center`.
  - Circle disc: `width: 96px; height: 96px; border-radius: 99px;
    background: var(--paper-alt); border: 1px dashed var(--stone-lt);
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 24px`.
  - Heading: `font-family: 'Newsreader Variable', Georgia, serif; font-size:
    24px; font-weight: 500; letter-spacing: -0.01em; color: var(--ink);
    margin-bottom: 10px`.
  - Body: `font-size: 14px; color: var(--ink-soft); line-height: 1.5;
    margin: 0 0 28px; max-width: 280px`.

**Reference:** `docs/ui.md` → empty-state pattern for the canonical two-variant
spec.

**Files:**
- `web/src/lib/shared/components/EmptyState.svelte` (create)
- `web/src/lib/shared/components/EmptyState.test.ts` (create)

**Steps:**
1. RED — Create `EmptyState.test.ts`. Import and render `EmptyState` with
   Vitest. Assertions to include: outermost element has `data-test`; the disc
   element is present; `<Icon>` renders when `icon` is supplied; disc renders
   snippet content when `iconContent` is supplied (and `icon` is ignored);
   heading text renders when `title` is supplied; body text renders when `body`
   is supplied; CTA button renders when both `ctaLabel` and `onCta` are
   supplied; clicking CTA fires `onCta`; CTA is absent when `ctaLabel` / `onCta`
   are omitted; CTA is absent when only `ctaLabel` is supplied (no `onCta`); CTA
   is absent when only `onCta` is supplied (no `ctaLabel`).
2. RED — Run `pnpm test` and confirm the new tests fail (component doesn't
   exist yet).
3. GREEN — Create `EmptyState.svelte`. Import `type Snippet` from `'svelte'`,
   `Button` from `$lib/basic/components/Button.svelte`, and `Icon` from
   `$lib/basic/components/Icon.svelte`. In the disc, use
   `{#if iconContent}{@render iconContent()}{:else if icon}<Icon name={icon}
   size={iconSize} />{/if}`, then render the heading, body, and CTA each behind
   its own `{#if}` guard. Apply the CSS values from Decisions.
4. GREEN — Run `pnpm test` and confirm all tests pass.
5. Run `pnpm lint` · `pnpm check` to confirm no lint or type errors.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

---

## Phase 3 — Semantic HTML sweep

For every task in this phase: the class name stays on the new semantic element
during this phase (e.g. `<h2 class="section-label">`, `<ul class="rows">`,
`<li class="row">`). The class and its per-file CSS are removed only in Phase 5
cleanup after the global rules are confirmed live. This keeps existing
test selectors like `querySelector('.row')` working through the sweep.

The recurring element-type mappings for this phase:

| Old                              | New                              |
|----------------------------------|----------------------------------|
| `<div class="header">`           | `<header>`                       |
| title inside header              | `<h1>` (scoped CSS on `h1`)      |
| subtitle inside header           | `<p>` (scoped CSS on `p`)        |
| `<div class="section-label">`    | `<h2 class="section-label">`     |
| `<div class="rows">`             | `<ul class="rows">`              |
| `<div class="row">`              | `<li class="row">`               |
| `<div class="name">` (14–15 px)  | `<span class="name">`            |
| `<div class="name">` (17 px)     | `<h3 class="name">`              |
| `<div class="sub">` in header    | `<p class="sub">`                |
| `<div class="sub">` in list row  | `<span class="sub">`             |

### [ ] 3.1 InvitePickerSheet — canonical semantic refactor

**Created:** 2026-05-30T08:24:10Z
**Completed:**

**Why:** InvitePickerSheet has the fullest set of transformations (header, two
section-label h2s, two ul/li groups, name + sub spans), making it the best
canonical case to establish the playbook. Doing it first also tests that the
Phase 1 global `h2` and `ul` rules are compatible with a real component's
scoped CSS before applying the same changes across a dozen other files.

**Prerequisites:** Tasks 1.1 and 2.1 complete.

**Decisions:**
- `<div class="header">` → `<header>`. The `.title` div inside becomes
  `<h2 class="title">` with a scoped `header h2 { font-size: 17px;
  font-weight: 600; color: var(--ink); margin: 0; }` rule. This overrides the
  global `h2` section-label rule (11.5 px stone uppercase) specifically within
  the sheet header. The `.subtitle` div becomes `<p class="subtitle">`.
- The two `<div class="section-label">` divs → `<h2 class="section-label">`.
  The per-file `.section-label` CSS rule stays for now (padding only — the
  font properties are already covered by the global `h2` rule after task 1.1).
  Actually: remove the font properties from the per-file rule, leaving only
  the padding. Confirm visually the result matches the original.
- The two `<div class="rows">` → `<ul class="rows">`.
- Each `<div class="row">` → `<li class="row">`.
- `<div class="name">` → `<h3 class="name">` (display name in invite rows).
  The global `h3` rule (15 px) normalises from 14 px; no scoped override needed.
- `<div class="sub">` inside list rows → `<span class="sub">`.
- The `<label class="section-label email-label">` at the bottom of the sheet
  is a carve-out (it's already a `<label>` element — correct semantics for a
  form label). Leave it as-is.

**Files:**
- `web/src/lib/invite/components/InvitePickerSheet.svelte` (modify)
- `web/src/lib/invite/components/InvitePickerSheet.test.ts` (modify)

**Steps:**
1. Read `InvitePickerSheet.svelte` fully to map every div that changes.
2. Apply the element-type changes from Decisions. Keep class names on the new
   elements. Update scoped CSS: trim the `.section-label` rule to padding only
   (the font properties are now global).
3. Read `InvitePickerSheet.test.ts` and update any assertions that fail due to
   element-type changes (e.g. `querySelector('div.section-label')` →
   `querySelector('h2.section-label')`; `div.row` → `li.row`).
4. Run `pnpm lint` · `pnpm check` · `pnpm test`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 3.2 ListOverflowSheet + AvatarSourceSheet

**Created:** 2026-05-30T08:24:10Z
**Completed:**

**Why:** Both sheets have a `<div class="header">` that becomes `<header>`.
`ListOverflowSheet` also has a `<div class="rows">` whose children are
`<Button>` elements — the rows become `<ul>` with each `<Button>` wrapped in
an `<li>`. Grouping these two small files keeps the diff reviewable.

**Prerequisites:** Task 3.1 (canonical case established).

**Decisions:**
- `ListOverflowSheet`: `<div class="header">` → `<header>`. The `.list-name`
  div inside → `<h2 class="list-name">` with a scoped `header h2 { font-size:
  17px; font-weight: 600; color: var(--ink); margin: 0; }` rule (overrides
  the global `h2` section-label style within the sheet header).
  The `.meta` div → `<p class="meta">`. The `<div class="rows">` → `<ul
  class="rows">`. Each `<Button>` child moves into `<li>`: `<li><Button …>
  …</Button></li>`. The `<hr>` elements between button groups are **not** valid
  direct children of `<ul>` in HTML5 — wrap each one:
  `<li role="separator" aria-hidden="true"><hr /></li>`. Update `.rows` scoped CSS
  if the selector needs to target `ul.rows`; add a rule to strip list styling
  from separator rows (e.g. `.rows li[role="separator"] { padding: 0; }`).
- `AvatarSourceSheet`: `<div class="header">` → `<header>`. The `.title` div
  → `<h2>` with a scoped `header h2 { font-size: 17px; … }` rule. The
  `.subtitle` div → `<p class="subtitle">` (it already has class
  `explainer subtitle`; keep both classes on `<p>`).

**Files:**
- `web/src/lib/list/components/ListOverflowSheet.svelte` (modify)
- `web/src/lib/list/components/ListOverflowSheet.test.ts` (modify)
- `web/src/lib/avatar/components/AvatarSourceSheet.svelte` (modify)
- `web/src/lib/avatar/components/AvatarSourceSheet.test.ts` (modify)

**Steps:**
1. Apply `ListOverflowSheet` changes from Decisions. Wrap each `<Button>` child
   in an `<li>`. Update test assertions for element-type changes.
2. Apply `AvatarSourceSheet` changes. Update test assertions if any.
3. Run `pnpm lint` · `pnpm check` · `pnpm test`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 3.3 MembersScreen

**Created:** 2026-05-30T08:24:10Z
**Completed:**

**Why:** MembersScreen has the full div-to-semantic suite: one section-label,
one rows group, multiple row divs with avatar + name + sub text + action
button. The `.name` div is the member name → `<h3 class="name">` (global
`h3` rule at 15 px, already matching; remove the scoped font-size declaration).

**Prerequisites:** Task 3.1 (canonical case established).

**Decisions:**
- `<div class="section-label">` → `<h2 class="section-label">`. Trim the
  per-file `.section-label` CSS to padding only.
- `<div class="rows">` → `<ul class="rows">`.
- Each `<div class="row">` → `<li class="row">`.
- `<div class="name">` → `<h3 class="name">`. Remove the scoped
  `.name { font-size: 15px; }` rule — the global `h3` rule covers it.

**Files:**
- `web/src/lib/list/components/MembersScreen.svelte` (modify)
- `web/src/lib/list/components/MembersScreen.test.ts` (modify)

**Steps:**
1. Apply all element-type changes from Decisions.
2. Update `MembersScreen.test.ts` for any element-type changes.
3. Run `pnpm lint` · `pnpm check` · `pnpm test`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 3.4 ItemsScreen

**Created:** 2026-05-30T08:24:10Z
**Completed:**

**Why:** ItemsScreen has `div.rows` → `ul` and multiple `div.row` → `li`. The
rows are complex (each `<li>` contains a vote control, a text block, and an
expand/collapse — the inner `div.row-inner` stays as a div since it's a layout
container, not a list row).

**Prerequisites:** Task 3.1.

**Decisions:**
- `<div class="rows">` → `<ul class="rows">`.
- `<div class="row">` → `<li class="row">`. The `class:open={…}` binding moves
  to the `<li>`.
- `<div class="row-inner">` stays as `<div>` — it's a layout container inside
  the list item, not a list row itself.
- No section-label or header divs in this file.

**Files:**
- `web/src/lib/item/components/ItemsScreen.svelte` (modify)
- `web/src/lib/item/components/ItemsScreen.test.ts` (modify)

**Steps:**
1. Apply element-type changes.
2. Update test assertions for `div.row → li.row`.
3. Run `pnpm lint` · `pnpm check` · `pnpm test`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 3.5 ListsScreen

**Created:** 2026-05-30T08:24:10Z
**Completed:**

**Why:** ListsScreen has `div.row` per list entry. The row structure is more
complex than a simple `<li>` containing a button — there is a `div.row-top`
(name + overflow button) and optionally a `div.desc` expander below it. The
`div.row` itself becomes `<li class="row">` containing the existing inner
divs unchanged.

**Decisions:**
- The outer `{#each}` div changes: `<div class="row" class:last=…>` →
  `<li class="row" class:last=…>`. The `div.row-top` and `div.desc` inside
  stay as divs (layout containers, not list rows).
- Wrap the `{#each}` block in `<ul class="list">` replacing the existing
  `<div class="list">`.
- `<span class="name">` inside the Button → `<h3 class="name">`. The list
  name is the hero element of each row; keep the scoped
  `h3.name { font-size: 17px; }` rule (intentional override of the global
  15 px). Remove other duplicate font properties from the scoped rule if they
  match the global `h3` (weight 600, color `var(--ink)`, margin 0).

**Files:**
- `web/src/lib/list/components/ListsScreen.svelte` (modify)
- `web/src/lib/list/components/ListsScreen.test.ts` (modify)

**Steps:**
1. Apply element-type changes.
2. Update scoped CSS: `.list { … }` and `.row { … }` selectors still work on
   `ul.list` and `li.row` since the class names are preserved.
3. Update test assertions if any reference `div.row`.
4. Run `pnpm lint` · `pnpm check` · `pnpm test`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 3.6 InvitesInboxScreen + InvitesBanner

**Created:** 2026-05-30T08:24:10Z
**Completed:**

**Why:** `InvitesInboxScreen` has `div.row` entries inside an `{#if}` block.
`InvitesBanner` has a single `div.row` that is a full-width tap target.
Grouping them keeps the diff small — both are `div.row → li` changes in the
invite domain.

**Prerequisites:** Task 3.1.

**Decisions:**
- `InvitesInboxScreen`: The rows live inside `<div class="list">` (not
  `div.rows`). Change `<div class="list">` → `<ul class="list">` and each
  `<div class="row">` → `<li class="row">`. Inner layout containers
  (`div.row-top`, `div.row-info`, `div.row-inviter`, `div.buttons`) stay
  as divs.
- `InvitesBanner`: The single-invite variant has the structure
  `div.banner > div.row (avatar + copy) + div.buttons (Accept / Decline)`.
  The `.row` here is a **layout div** (avatar + copy text), not a list item —
  the action buttons are a sibling of `.row`, not inside it. Wrapping only
  `.row` in `<li>` would produce a broken `<ul><li/></ul><div.buttons>`
  structure. **Carve-out: leave `div.row` as `<div class="row">` in
  `InvitesBanner`.** The multi-invite variant (whole-row `<Button>`) has no
  `div.row` at all and needs no change.

**Files:**
- `web/src/lib/invite/components/InvitesInboxScreen.svelte` (modify)
- `web/src/lib/invite/components/InvitesInboxScreen.test.ts` (modify)
- `web/src/lib/invite/components/InvitesBanner.svelte` (modify or confirm)
- `web/src/lib/invite/components/InvitesBanner.test.ts` (modify or confirm)

**Steps:**
1. Read both files and map the exact div patterns.
2. Apply element-type changes per Decisions. For `InvitesBanner`, if the
   carve-out holds (`.row` is a layout div, not a list item), no changes are
   needed — record that in Notes after the task.
3. Update test assertions for `InvitesInboxScreen`. Update `InvitesBanner`
   tests only if any assertions broke.
4. Run `pnpm lint` · `pnpm check` · `pnpm test`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 3.7 TrashScreen + DeletedListsScreen

**Created:** 2026-05-30T08:24:10Z
**Completed:**

**Why:** Both screens have the same `div.rows` + `div.row` pattern (row = icon
span + text + restore/undelete button) and the same empty-state markup (to be
migrated to `<EmptyState>` in Phase 4). Grouping them is efficient.

**Prerequisites:** Task 3.1.

**Decisions:**
- `<div class="rows">` → `<ul class="rows">`.
- `<div class="row">` → `<li class="row">`. The `class:first={…}` binding
  moves to the `<li>`.
- `.meta` and `.attribution` inner divs/spans stay as-is (layout/text
  containers, not list rows).
- `<span class="name">` (or `<div class="name">` if present) → `<h3
  class="name">`. The global `h3` rule (15 px) normalises from TrashScreen's
  15.5 px and DeletedListsScreen's 15 px. Remove the scoped `.name { font-size:
  … }` rule; weight, color, and margin are covered by the global rule.
- The `.row-icon` span in `TrashScreen` stays as-is (cosmetic icon-colour
  wrapper, deliberately kept per Non-requirements).
- Empty-state markup (`div.empty`, `div.empty-circle`, `div.empty-heading`)
  is NOT changed in this task — Phase 4 handles it.

**Files:**
- `web/src/lib/item/components/TrashScreen.svelte` (modify)
- `web/src/lib/item/components/TrashScreen.test.ts` (modify)
- `web/src/lib/list/components/DeletedListsScreen.svelte` (modify)
- `web/src/lib/list/components/DeletedListsScreen.test.ts` (modify)

**Steps:**
1. Apply `div.rows → ul`, `div.row → li` changes to both files.
2. Update test assertions for both.
3. Run `pnpm lint` · `pnpm check` · `pnpm test`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 3.8 CircleScreen + BlockedScreen + AddEditItemSheet

**Created:** 2026-05-30T08:24:10Z
**Completed:**

**Why:** Small targeted changes across three files that don't fit a larger
group. `CircleScreen` has a `div.row-text` layout container (not a list row —
confirm it's already inside an `<li>` from a prior migration, otherwise it
stays as-is). `BlockedScreen` already uses `<ul>` / `<li>` — confirm no
remaining div patterns. `AddEditItemSheet` has a `<div class="sub">in
{listName}</div>` inside the sheet header area.

**Prerequisites:** Task 3.1.

**Decisions:**
- `CircleScreen`: Read the file first. If `div.row-text` is a layout container
  inside an existing `<li>`, it stays as a div (it's not a list item). If the
  outer rows are still divs, apply `div.rows → ul` / `div.row → li` before
  confirming `div.row-text`.
- `BlockedScreen`: already uses `<ul class="blocked-list">` / `<li class="row">`.
  Confirm no outstanding `div.rows` or `div.row` patterns. If clean, this
  step is just a read-and-confirm.
- `AddEditItemSheet`: `<div class="sub">` → `<p class="sub">` (it's a
  subtitle-style paragraph below the sheet title, a `<p>` is semantically
  correct).

**Files:**
- `web/src/lib/privacy/components/CircleScreen.svelte` (modify or confirm)
- `web/src/lib/privacy/components/CircleScreen.test.ts` (modify if needed)
- `web/src/lib/privacy/components/BlockedScreen.svelte` (confirm)
- `web/src/lib/item/components/AddEditItemSheet.svelte` (modify)
- `web/src/lib/item/components/AddEditItemSheet.test.ts` (modify if needed)

**Steps:**
1. Read each file, map any remaining div patterns, and apply the changes from
   Decisions.
2. Update any affected test assertions.
3. Run `pnpm lint` · `pnpm check` · `pnpm test`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 3.9 SettingsScreen + PrivacyScreen

**Created:** 2026-05-30T08:24:10Z
**Completed:**

**Why:** Both screens already use `<h2 class="section-label">` (migrated during
0901 or pre-existing). The task here is to confirm no other div patterns
remain and to trim the per-file `.section-label` CSS to padding only, leaving
the font properties to the global `h2` rule from task 1.1.

**Prerequisites:** Task 1.1 (global `h2` rule live) and task 3.1 (canonical
pattern established).

**Decisions:**
- **SettingsScreen**: Already uses bare `<h2>` (no `.section-label` class).
  The `.preference-group h2` scoped CSS rule duplicates the five font properties
  that the global `h2` rule now covers (`font-size`, `font-weight`,
  `text-transform`, `letter-spacing`, `color`). Trim the rule to only
  `padding: 22px 18px 8px; margin: 0;` — the font properties are now global.
  Confirm no outstanding `div.rows`, `div.row`, or `div.header` patterns.
- **PrivacyScreen**: Open the scoped `.section-label` CSS rule and remove all
  font properties now covered by the global `h2` rule (`font-size`, `color`,
  `font-weight`, `letter-spacing`, `text-transform`) — PrivacyScreen's rule
  already uses 11.5 px, identical to the global value, so no override is needed.
  Keep only the padding and `margin: 0` declarations. Confirm no outstanding
  `div.rows`, `div.row`, or `div.header` patterns.
- **PrivacyScreen `div.nav-rows`**: Contains two `<Button>` nav items. This
  pattern is deferred to the `<NavRow>` extraction plan per Non-requirements.
  Leave `div.nav-rows` as-is; confirm it is a `<div class="nav-rows">` (not
  `div.rows`) and record in Notes that it is intentionally deferred.

**Files:**
- `web/src/lib/settings/components/SettingsScreen.svelte` (modify)
- `web/src/lib/privacy/components/PrivacyScreen.svelte` (modify)

**Steps:**
1. Read both files. Trim `.section-label` CSS per Decisions.
2. Confirm no other div patterns need changing.
3. Run `pnpm lint` · `pnpm check` · `pnpm test`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 3.10 ProfileSheet + CircleExplainerSheet + CreateListSheet + TopBar

**Created:** 2026-05-30T08:24:10Z
**Completed:**

**Why:** These four files are in the R3 scope but may have few or no remaining
div patterns after 0901. Read each one, apply any outstanding changes, and
confirm the file is clean. `TopBar` already uses `<header>` — confirm it keys
cleanly off the global `h2` and `ul` rules with no regression.

**Prerequisites:** Tasks 1.1 and 3.1.

**Decisions:**
- Read each file fully before changing anything.
- Apply `div.header → header`, `div.section-label → h2`, `div.rows → ul`,
  `div.row → li` where found.
- If a file is already clean (no div scaffolding patterns), record that
  explicitly in Notes after the task.
- **TopBar:** `TopBar.svelte` uses `<header>` already. Change the `.centre`
  `<div>` to `<h1 class="centre">`. Remove `font-family`, `font-size`,
  `font-weight`, and `letter-spacing` from the scoped `.centre` CSS — those
  are now covered by the global `h1` rule added in task 1.1. Keep `flex: 1`,
  `min-width: 0`, and `line-height: 1.1` in `.centre`. Any sheet in scope that
  has a `<div class="header">` with a title element uses `<h2>` for the title
  (not `<h1>`) per the playbook from tasks 3.1 and 3.2.
- **ProfileSheet `.name`:** the display name at the top of the sheet (18 px)
  is the primary identity element of the sheet. Change `<div class="name">`
  to `<h3 class="name">` and keep the scoped `h3.name { font-size: 18px; }`
  override (intentional departure from the global 15 px).

**Files:**
- `web/src/lib/profile/components/ProfileSheet.svelte` (modify or confirm)
- `web/src/lib/privacy/components/CircleExplainerSheet.svelte` (modify or
  confirm)
- `web/src/lib/list/components/CreateListSheet.svelte` (modify or confirm)
- `web/src/lib/shared/components/TopBar.svelte` (modify)
- `web/src/lib/shared/components/TopBar.test.ts` (modify if needed)
- Corresponding `.test.ts` files for the sheets (modify if needed)

**Steps:**
1. Read each file and map any div patterns.
2. Apply changes per Decisions. For TopBar specifically: change `.centre div`
   to `<h1 class="centre">` and trim the scoped CSS per Decisions.
3. Update test assertions if needed.
4. Run `pnpm lint` · `pnpm check` · `pnpm test`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

---

## Phase 4 — Empty-state migrations

After each migration task the per-screen `.empty`, `.empty-circle`,
`.empty-heading`, `.empty-body` CSS rules are removed (they are now inside
the `EmptyState` component). Keep `data-test` attributes on the outermost
element by passing them via the `data-test` prop on `<EmptyState>`.

### [ ] 4.1 ListsScreen + ItemsScreen — illustrated with CTA

**Created:** 2026-05-30T08:24:10Z
**Completed:**

**Why:** Both screens have an illustrated empty-state with a CTA button
(`leadingIcon="plus"`). Migrating them together confirms the `ctaLabel` +
`onCta` API and the `iconContent` snippet API both work end-to-end.

**Prerequisites:** Task 2.1 (`EmptyState` component exists with `iconContent`
snippet prop).

**Decisions:**
- `ListsScreen` empty-state: the disc contains `<CairnGlyph size={44}
  color="var(--stone)">`, not an `<Icon>`. Pass it via the `iconContent`
  snippet prop:
  ```svelte
  <EmptyState
    title="Start your first cairn"
    body="…"
    ctaLabel="Create a list"
    onCta={…}
    data-test="lists-empty"
  >
    {#snippet iconContent()}
      <CairnGlyph size={44} color="var(--stone)" />
    {/snippet}
  </EmptyState>
  ```
  Read the current markup to confirm the exact `body` and `ctaLabel` text.
  Remove the per-screen `.empty`, `.empty-circle`, `.empty-heading`,
  `.empty-body`, and empty-state CTA styles.
- `ItemsScreen` empty-state: `icon="feather"`, `title="Nothing here yet"`.
  Read the current markup to confirm the exact `body` and `ctaLabel` text.
  Migrate to `<EmptyState icon="feather" title="Nothing here yet" body="…"
  ctaLabel="…" onCta={…} data-test="items-empty">`. Remove per-screen
  empty-state CSS rules.

**Files:**
- `web/src/lib/list/components/ListsScreen.svelte` (modify)
- `web/src/lib/list/components/ListsScreen.test.ts` (modify if needed)
- `web/src/lib/item/components/ItemsScreen.svelte` (modify)
- `web/src/lib/item/components/ItemsScreen.test.ts` (modify if needed)

**Steps:**
1. Read `ListsScreen.svelte` empty-state block. Replace with `<EmptyState>`
   using `iconContent` snippet per Decisions. Remove per-screen empty-state
   CSS rules. Update `ListsScreen.test.ts` if assertions reference old classes.
2. Read `ItemsScreen.svelte` empty-state block. Replace with `<EmptyState>`
   per Decisions. Remove per-screen empty-state CSS rules. Update
   `ItemsScreen.test.ts` if assertions reference old classes.
3. Run `pnpm lint` · `pnpm check` · `pnpm test`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 4.2 InvitesInboxScreen + DeletedListsScreen — illustrated

**Created:** 2026-05-30T08:24:10Z
**Completed:**

**Why:** Both have the illustrated variant. `InvitesInboxScreen` likely has no
CTA (pending invites are passive — you act on them from the list, not an
empty-state CTA). `DeletedListsScreen` has no CTA either (deleted lists are
surfaced; restore is per-row). Confirm the markup and migrate.

**Prerequisites:** Task 2.1.

**Decisions:**
- `InvitesInboxScreen`: replace with `<EmptyState icon="inbox" title="No
  pending invites" body="When someone invites you to their list, it'll appear
  here." data-test="inbox-empty">` (no CTA). The existing markup has an HTML
  `<br />` in the body text — the string prop cannot hold HTML markup, so
  reword to a single sentence as shown above (the component's `max-width:
  280px` and `line-height: 1.5` wrap the text naturally). Icon size: default
  `32` — no `iconSize` prop needed.
- `DeletedListsScreen`: replace with `<EmptyState icon="trash-2" title="No
  deleted lists." data-test="deleted-lists-empty" iconSize={44}>` (no
  `body` — the current markup has only a heading, no body paragraph).
  Icon size is `44` to match the original markup
  (`<Icon name="trash-2" size={44} />`).
- Remove per-screen empty-state CSS rules after each migration.

**Files:**
- `web/src/lib/invite/components/InvitesInboxScreen.svelte` (modify)
- `web/src/lib/invite/components/InvitesInboxScreen.test.ts` (modify if
  needed)
- `web/src/lib/list/components/DeletedListsScreen.svelte` (modify)
- `web/src/lib/list/components/DeletedListsScreen.test.ts` (modify if needed)

**Steps:**
1. Read both files' empty-state blocks, confirm icon names and copy.
2. Replace with `<EmptyState …>`. Remove per-screen empty-state CSS.
3. Update test assertions if needed.
4. Run `pnpm lint` · `pnpm check` · `pnpm test`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 4.3 TrashScreen — illustrated without body or CTA

**Created:** 2026-05-30T08:24:10Z
**Completed:**

**Why:** TrashScreen has an illustrated empty-state with no body paragraph and
no CTA (the disc + heading only). This confirms the `body?` and `ctaLabel?`
optional props work — the component renders cleanly without them.

**Prerequisites:** Task 2.1.

**Decisions:**
- Replace with `<EmptyState icon="trash-2" title="Nothing in the bin."
  data-test="trash-empty" iconSize={44}>` (no `body`, no `ctaLabel`, no
  `onCta`). Icon size is `44` to match the original markup
  (`<Icon name="trash-2" size={44} />`).
- Remove per-screen `.empty`, `.empty-circle`, `.empty-heading` CSS.

**Files:**
- `web/src/lib/item/components/TrashScreen.svelte` (modify)
- `web/src/lib/item/components/TrashScreen.test.ts` (modify if needed)

**Steps:**
1. Replace the empty-state block with `<EmptyState …>`. Remove CSS rules.
2. Update test assertions if needed.
3. Run `pnpm lint` · `pnpm check` · `pnpm test`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 4.4 BlockedScreen — unify on the illustrated empty state

**Created:** 2026-05-30T08:24:10Z
**Completed:**

**Why:** `BlockedScreen` had drifted to a one-off dashed-box empty state —
the single screen looking unlike every other. Unifying it on `<EmptyState>`
(disc + heading, no body, no CTA — the same shape as TrashScreen and
DeletedListsScreen) is the whole point of this plan: one empty-state look
everywhere. This is a deliberate visual change to BlockedScreen, not a
like-for-like port; `docs/ui.md` was updated to document the single pattern.

**Prerequisites:** Task 2.1.

**Decisions:**
- Replace the `<div class="empty-state">` block with `<EmptyState icon="slash"
  title="You haven't blocked anyone." data-test="blocked-empty"
  iconSize={44}>` (no `body`, no CTA — matches the heading-only TrashScreen /
  DeletedListsScreen call sites; `iconSize={44}` matches their disc icon).
  The copy moves from the body paragraph to the serif `title`.
- Remove `.empty-state` and `.empty-state p` scoped CSS.

**Files:**
- `web/src/lib/privacy/components/BlockedScreen.svelte` (modify)
- `web/src/lib/privacy/components/BlockedScreen.test.ts` (modify if needed)

**Steps:**
1. Replace the empty-state block. Remove the scoped CSS rules.
2. Update test assertions if needed.
3. Run `pnpm lint` · `pnpm check` · `pnpm test`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

---

## Phase 5 — Cleanup and final check

### [ ] 5.1 Remove dead `.section-label` CSS, visual sweep, full check

**Created:** 2026-05-30T08:24:10Z
**Completed:**

**Why:** After Phase 3 trimmed the `.section-label` CSS in each file to
padding-only, the class itself is redundant on `<h2>` elements — the global
`h2` rule covers the font properties and the padding is now on the bare `h2`
scoped selector. This task removes the class from the markup and the
remaining per-file CSS rule in every file where it's safe to do so, then runs
the full toolchain and performs the visual canvas sweep.

**Prerequisites:** All Phase 3 and Phase 4 tasks complete.

**Decisions:**
- For each file migrated in Phase 3 that has `<h2 class="section-label">`:
  remove `class="section-label"` from the element, and delete the per-file
  `.section-label { padding: … }` scoped CSS rule. The global `h2` rule
  covers font; add a bare scoped `h2 { padding: … }` rule in its place if
  padding differs from zero.
- **No exception for PrivacyScreen:** PrivacyScreen's `.section-label` rule
  already uses `font-size: 11.5px` — the same as the global value. Remove
  `class="section-label"` from the `<h2>` element and delete the per-file
  `.section-label` rule, leaving a bare `h2 { padding: …; margin: 0; }` scoped
  rule, exactly like every other migrated file.
- `git grep -n 'class="section-label"'` must return only the `InvitePickerSheet`
  email-row `<label>` (carve-out) after this task.
- `git grep -n '\.section-label'` in CSS context must return only the one
  remaining scoped rule: InvitePickerSheet's `label.section-label.email-label`
  styling.

**Files:**
- All files with `<h2 class="section-label">` from Phase 3 (modify).

**Steps:**
1. Run `git grep -n 'class="section-label"'` to list every remaining instance.
2. For each instance (excluding the PrivacyScreen and InvitePickerSheet
   carve-outs): remove `class="section-label"` from the `<h2>` element; update
   the scoped CSS to use a bare `h2 { padding: … }` selector.
3. Run `git grep -n '\.section-label'` in CSS context and confirm only
   the expected two scoped rules remain.
4. Run `./scripts/check.sh` — must be green.
5. Open `design/Cairn - Design Canvas.html` in a browser and visually compare
   every screen and sheet touched in Phases 3 and 4 against the design canvas.
   Pay attention to: section-label typography (11.5 px, uppercase, stone),
   row spacing, sheet-header padding, empty-state vertical rhythm, and
   button pairs in sheets.

**Verify:** `./scripts/check.sh`
