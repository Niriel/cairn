# Plan: Semantic HTML + global typography + `<EmptyState>`

0902 completes the step-9 CSS refactor started in 0901. Where 0901 extracted
form primitives (`<Button>`, `<TextInput>`, `<Textarea>`, `<Label>`), 0902
attacks the structural and typographic scaffolding: it lifts recurring
typography into global semantic-tag rules, migrates div-heavy screens and
sheets to proper `<header>` / `<h1>` / `<h2>` / `<ul>` / `<li>` markup, and
collapses the repeated empty-state blocks across six screens into a single
`<EmptyState>` component.

## Context

After 0901, the screen inventory uses proper form primitives everywhere, but
the surrounding markup is still div-soup. Most screens repeat the same
structural idioms — a `.header` div with a `.title` and optional `.subtitle`,
a `.section-label` div above each list group, a `.rows` div containing `.row`
divs — and apply the same typography (11.5 px uppercase stone for section
labels, 14–15 px weight-600 ink for member names) via per-file scoped classes.
When one file tweaks a value, the others drift. The empty-state visual appears
in four screens with copy-pasted CSS blocks (identical `.empty-circle`,
`.empty-heading`, `.empty-body` rules). This plan is the cleanup pass that
removes the duplication.

The motivation for doing the typography lift before the semantic sweep is
coupling: once `<div class="section-label">` becomes `<h2>`, removing the
per-file `.section-label` CSS rules is safe only when the global `h2` rule
already covers the same values. Doing the global rules first means the sweep
and the per-file cleanup can happen in the same task without a gap where
heading typography goes unstyled.

## Decisions

**No `<Icon>` `color` prop.** `Icon.svelte` already uses
`stroke="currentColor"`, which inherits from the CSS `color` of any ancestor.
Callers that need a specific colour wrap the icon in any element with the
desired `color` value. Unlike `CairnGlyph` (whose SVG fill does not inherit
from CSS `color`), Icon needs no explicit prop. The `.row-icon` wrapper in
`TrashScreen` and any similar spans are left as-is; they are harmless and
self-documenting.

**Global `h1` rule for TopBar screen titles (R1).** There is exactly one
`<h1>` per screen: the TopBar title. The TopBar's `.centre` div becomes
`<h1 class="centre">` (task 3.10), and the font declarations move out of the
scoped `.centre` CSS into the global `h1` rule: Newsreader Variable, 22 px,
weight 500, `letter-spacing: -0.01em`, `color: var(--ink)`. This is the only
heading value that is truly canonical across every screen.

**Sheet titles use `<h2>` with a scoped override, not `<h1>` (R1, R3).**
A bottom sheet is a section with a `<header>` containing its title. The title
element is `<h2>` — consistent with the sheet being a section subordinate to
the current screen. The global `h2` rule (11.5 px stone uppercase) is overridden
by a scoped `header h2 { font-size: 17px; font-weight: 600; color: var(--ink);
margin: 0; }` rule within each sheet component. Section labels inside the same
sheet are also `<h2>` (inheriting the global rule at 11.5 px) — they appear
after the header in the DOM and are styled by the global rule, not the scoped
`header h2` override.

**h2 global rule for section labels (R1).** The section-label shape is
consistent: 11.5 px, `var(--stone)`, weight 600, `letter-spacing: 0.06em`,
`text-transform: uppercase`. The one truly global structural reset is
`ul, ol { list-style: none; margin: 0; padding: 0 }` — Cairn lists are flex
scaffolds, not bulleted.

**h3 global rule for row names (R1, R3).** The `.name` element (primary label
of a list row) currently drifts between 14 px and 15.5 px across files — an
accidental inconsistency, not an intentional design choice. A global `h3` rule
at 15 px, weight 600, `var(--ink)` normalises the lot. Two files intentionally
deviate and keep scoped `h3` overrides: `ListsScreen` (17 px — the list name
is the hero element of its row) and `ProfileSheet` (18 px — the display name
at the top of the sheet acts as a section subheading). Every other `div.name`
becomes `<h3 class="name">` and inherits the global value.

**h2 padding stays local (R1).** The global `h2` rule carries only the font
properties, not padding. Padding on section labels varies by context (18 px
horizontal in MembersScreen, 4 px in InvitePickerSheet) and must stay as
scoped CSS within each component. After the sweep, the per-file scoped rule is
`h2 { padding: …px …px …px; }` — the typography is inherited from the global
rule, only the spacing is local.

**`div.section-label → h2 class="section-label"` during sweep, class removed
in cleanup (R1, R3).** When converting `div.section-label` to `h2` in Phase 3,
the `.section-label` class is kept on the element so that any existing Vitest
assertions querying it still pass. The class (and its per-file CSS rule) is
removed in the Phase 5 cleanup after the global `h2` rule is already in place.
PrivacyScreen's `.section-label` CSS already uses `font-size: 11.5px` —
identical to the global value — so no font-size override needs to be kept; it
follows the same cleanup path as every other file.

**`EmptyState` disc: `icon` prop or `iconContent` snippet (R2).** The `icon:
IconName` prop handles the common case (a Lucide icon). `iconContent?: Snippet`
handles disc content outside the icon system — specifically `ListsScreen`, whose
disc holds the `<CairnGlyph>` brand mark. When `iconContent` is provided it
takes priority; `icon` is ignored. Both are optional so callers can supply
whichever applies without TypeScript requiring the other.

**`EmptyState` CTA API: `ctaLabel` + `onCta` props, not a slot (R2).** A slot
would require the caller to manage the Button import and props, which defeats
the point of a shared component. Two optional props (`ctaLabel?: string`,
`onCta?: () => void`) are simpler: when both are supplied the component renders
a `<Button variant="rect" tone="ink" size="md" leadingIcon="plus">`; when
absent, no CTA is rendered. `tone="ink"` (dark background) matches the
existing call-site style in `ItemsScreen` and the empty-state spec in
`docs/ui.md` ("CTA button: `background: var(--ink)`"). The
without-CTA case (TrashScreen and BlockedScreen have a disc + heading and no
CTA) is handled by making `title`, `body`, `ctaLabel`, and `onCta` all
optional — EmptyState renders what it receives.

**One empty-state look everywhere — no `simple` variant (R2).** An earlier
draft gave `EmptyState` a `variant: 'illustrated' | 'simple'` prop, where
`simple` was a dashed inline box used only by `BlockedScreen`. That
reintroduced the very inconsistency this plan exists to remove — one screen
rendering an empty state unlike every other. `EmptyState` is therefore
single-shape: the illustrated disc + heading (+ optional body + optional CTA).
`BlockedScreen` uses it like every other screen (task 4.4). `docs/ui.md` was
updated in lockstep to document one empty-state pattern, not two.

**`EmptyState` in `shared/components/` (R2).** Per `docs/frontend-layout.md`
tier rules, `basic/` holds framework-agnostic UI primitives (Button, TextInput,
etc.) and `shared/` holds application-level components that appear across
multiple domains. An empty-state with an icon disc and serif heading is
application-shaped, not framework-shaped. `EmptyState.svelte` goes in
`web/src/lib/shared/components/`.

**Semantic sweep: keep class names on new semantic elements (R3, R4).** The
sweep changes the element type (`div` → `ul`, `div` → `li`, `div` → `header`)
but keeps the class name on the element. This means Vitest selectors like
`querySelector('.row')` continue to find `li.row` without assertion rewrites.
Class names are removed only in the Phase 6 cleanup for classes whose styling
has been fully absorbed by the global rule (`.section-label` on `h2` once the
global `h2` rule is live) or by the EmptyState component (`.empty-circle`,
`.empty-heading`, `.empty-body` on migrated screens).

**InvitePickerSheet as canonical case (R3).** It has the most transformations
in one file: `div.header → header`, two `div.section-label → h2`, two
`div.rows → ul`, multiple `div.row → li`, `div.name → span`. Doing it first
with a thorough task block establishes the playbook every subsequent task
follows.

**Phase ordering: typography → EmptyState → semantic sweep → empty-state
migration → cleanup.** Typography rules land first (before any div → h2
migration) so the global `h2` rule already covers the new elements. EmptyState
lands before the migration tasks so call sites can use it immediately. The
empty-state migration tasks come after the semantic sweep so each screen's
markup is already semantic before EmptyState replaces the empty block — one
concern per commit, no interleaved diffs.

## Architecture

### New files

- **`web/src/lib/shared/components/EmptyState.svelte`** — the single
  illustrated empty-state component; props: `icon?`, `iconContent?`,
  `iconSize?`, `title?`, `body?`, `ctaLabel?`, `onCta?`, `data-test?`.
- **`web/src/lib/shared/components/EmptyState.test.ts`** — Vitest tests.

### Modified files

- **`web/src/lib/shared/styles/typography.css`** — gains `h2` font rule +
  `ul, ol` reset.
- **`web/src/lib/invite/components/InvitePickerSheet.svelte`** — canonical
  semantic sweep (header, h2 ×2, ul ×2, li).
- **`web/src/lib/invite/components/InvitePickerSheet.test.ts`** — selector
  updates.
- **`web/src/lib/list/components/ListOverflowSheet.svelte`** — `div.header →
  header`, `div.rows → ul`, Button rows into `<li>`.
- **`web/src/lib/list/components/ListOverflowSheet.test.ts`** — selector
  updates.
- **`web/src/lib/avatar/components/AvatarSourceSheet.svelte`** — `div.header →
  header`.
- **`web/src/lib/avatar/components/AvatarSourceSheet.test.ts`** — selector
  updates if any.
- **`web/src/lib/list/components/MembersScreen.svelte`** — `div.section-label
  → h2`, `div.rows → ul`, `div.row → li`, `div.name → span`.
- **`web/src/lib/list/components/MembersScreen.test.ts`** — selector updates.
- **`web/src/lib/item/components/ItemsScreen.svelte`** — `div.rows → ul`,
  `div.row → li`.
- **`web/src/lib/item/components/ItemsScreen.test.ts`** — selector updates.
- **`web/src/lib/list/components/ListsScreen.svelte`** — `div.row → li`;
  empty-state block → `<EmptyState>`.
- **`web/src/lib/list/components/ListsScreen.test.ts`** — selector updates.
- **`web/src/lib/invite/components/InvitesInboxScreen.svelte`** — `div.row →
  li`; empty-state block → `<EmptyState>`.
- **`web/src/lib/invite/components/InvitesInboxScreen.test.ts`** — selector
  updates.
- **`web/src/lib/invite/components/InvitesBanner.svelte`** — `div.row → li` if
  the row is in a list context; confirm no `div.section-label` or `div.rows`.
- **`web/src/lib/invite/components/InvitesBanner.test.ts`** — selector updates.
- **`web/src/lib/item/components/TrashScreen.svelte`** — `div.rows → ul`,
  `div.row → li`; empty-state block → `<EmptyState>`.
- **`web/src/lib/item/components/TrashScreen.test.ts`** — selector updates.
- **`web/src/lib/list/components/DeletedListsScreen.svelte`** — `div.rows →
  ul`, `div.row → li`; empty-state block → `<EmptyState>`.
- **`web/src/lib/list/components/DeletedListsScreen.test.ts`** — selector
  updates.
- **`web/src/lib/privacy/components/CircleScreen.svelte`** — `div.row-text →
  span.row-text` (or confirm already semantic); no ul/li changes expected.
- **`web/src/lib/privacy/components/CircleScreen.test.ts`** — if needed.
- **`web/src/lib/privacy/components/BlockedScreen.svelte`** — already uses
  `<ul>` / `<li>`; dashed-box empty-state block → `<EmptyState>` (illustrated,
  no CTA — same look as every other screen).
- **`web/src/lib/privacy/components/BlockedScreen.test.ts`** — selector
  updates if any.
- **`web/src/lib/item/components/AddEditItemSheet.svelte`** — `div.sub → p`
  or `span`.
- **`web/src/lib/item/components/AddEditItemSheet.test.ts`** — selector
  updates if any.
- **`web/src/lib/settings/components/SettingsScreen.svelte`** — confirm
  semantic state; Phase 5 cleanup removes redundant local CSS.
- **`web/src/lib/privacy/components/PrivacyScreen.svelte`** — already uses
  `<h2 class="section-label">`; Phase 5 cleanup removes local `.section-label`
  font rule and class (see Decisions).
- **`web/src/lib/profile/components/ProfileSheet.svelte`** — confirm no
  outstanding div patterns.
- **`web/src/lib/privacy/components/CircleExplainerSheet.svelte`** — confirm.
- **`web/src/lib/list/components/CreateListSheet.svelte`** — confirm.
- **`web/src/lib/shared/components/TopBar.svelte`** — `.centre div` → `<h1
  class="centre">`; remove `font-family`, `font-size`, `font-weight`,
  `letter-spacing` from the scoped `.centre` CSS (now covered by the global
  `h1` rule); keep `flex: 1`, `min-width: 0`, `line-height: 1.1`.
- **`web/src/lib/shared/components/TopBar.test.ts`** — selector updates if
  any assertions reference `.centre` directly.

## Phase structure

1. **Phase 1 — Typography lift.** Add the global `h2` font rule and `ul, ol`
   reset to `typography.css`. No markup changes yet — this phase just puts the
   global rules in place so the sweep tasks in Phase 2 can safely remove
   per-file CSS while the elements are already covered (R1).

2. **Phase 2 — `<EmptyState>` extraction.** Write `EmptyState.svelte` and its
   Vitest test. The single illustrated shape (disc + optional heading / body /
   CTA) is exercised before the migration tasks in Phase 3 start calling the
   new component (R2). RED step: write the test first; GREEN step: implement
   the component.

3. **Phase 3 — Semantic HTML sweep.** One task per file or small group. Each
   task: change element types, keep class names on the new elements, update the
   matching `.test.ts` file, run `pnpm lint · pnpm check · pnpm test` (R3,
   R4). InvitePickerSheet is the canonical first task.

4. **Phase 4 — Empty-state migration.** One task per screen, using the
   `<EmptyState>` component from Phase 2. After each migration the per-screen
   `.empty-circle`, `.empty-heading`, `.empty-body` CSS rules are removed (R2).

5. **Phase 5 — Cleanup and final check.** Remove the now-redundant
   `.section-label` class from `h2` elements across the migrated files, delete
   the per-file `.section-label` CSS rules (leaving the global `h2` rule as the
   sole source), and run `./scripts/check.sh` to confirm the full toolchain is
   green (R1, R3). Visual sweep against the design canvas for every touched
   screen.

## Reference docs and skills

- **`docs/frontend-layout.md`** — tier rules (`basic/` vs `shared/`), filename
  conventions (no `+` prefix on test files next to routes).
- **`docs/ui.md`** — empty-state pattern spec (single illustrated pattern) and
  button-pair conventions.
- **`docs/testing.md`** — three test layers; Vitest for component behaviour,
  Playwright for e2e regression.
- **`docs/quality.md`** — lint / format / type-check toolchain.
- **`design/Cairn - Design Canvas.html`** — visual reference for the
  no-regression contract.

## Open questions

None — all design choices are resolved above.
