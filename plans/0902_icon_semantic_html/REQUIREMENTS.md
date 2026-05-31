# Requirements: Semantic HTML + global typography + `<EmptyState>`

0902 is the second and final sub-step of the step-9 CSS refactor. It lifts
recurring typography into global rules keyed off semantic tags, replaces
div-heavy scaffolding with semantic HTML across every screen and sheet, and
extracts a single `<EmptyState>` component from four near-identical
copy-pasted empty-state blocks. The result is a screen inventory built on
semantic HTML with one source of truth for typography — which is what makes
subsequent plans (account deletion, admin, PWA, legal) cheap to add without
retrofitting consistency. No user-visible behaviour changes.

## R1. Global typography rules keyed off semantic tags

`web/src/lib/shared/styles/typography.css` gains the following rules. Exact
values are reconciled during the Phase 2 exploration task (see PLAN.md
Decisions), which reads the existing per-file CSS and records the chosen values
before any rule is written.

- **`h1`** — screen title: Newsreader Variable serif, 22 px, weight 500,
  `letter-spacing: -0.01em`, `color: var(--ink)`, `margin: 0`. There is
  exactly one `<h1>` per screen: the TopBar title. Sheet titles use `<h2>`
  (see R3) and override the global `h2` rule via a scoped `header h2` rule.
- **`h2`** — section label: 11.5 px, `var(--stone)`, weight 600,
  `letter-spacing: 0.06em`, `text-transform: uppercase`. Replaces the
  per-file `.section-label` rule. Padding stays as scoped CSS within each
  component (it varies by context).
- **`ul`, `ol`** — `list-style: none; margin: 0; padding: 0`. Cairn lists
  are flex / grid scaffolds, not bulleted.
- **`h3`** — row name / primary label: 15 px, `var(--ink)`, weight 600,
  `margin: 0`. Normalises the 14–15.5 px drift across `InvitePickerSheet`,
  `MembersScreen`, `TrashScreen`, `DeletedListsScreen`, etc. Two intentional
  scoped overrides remain: `ListsScreen` list name at 17 px (the list title is
  the hero of its row) and `ProfileSheet` display name at 18 px (hero display
  at the top of the sheet).

## R2. `<EmptyState>` extracted

A new `web/src/lib/shared/components/EmptyState.svelte` encapsulates the one
empty-state shape used across the whole app. There is **no `variant` prop** —
a single illustrated look everywhere is a deliberate consistency choice
(`docs/ui.md` documents one empty-state pattern, not two). A 96 × 96 px circle
disc (`--paper-alt` background, dashed `--stone-lt` border) contains the icon,
followed by an optional serif heading, an optional body paragraph, and an
optional CTA button. Every screen supplies only the parts it needs. Props:

- `icon?: IconName` — icon name, rendered inside the disc. Optional when
  `iconContent` is supplied.
- `iconContent?: Snippet` — Svelte snippet rendered inside the disc in place of
  `<Icon>`. Use this for disc content outside the icon system (e.g. a
  `<CairnGlyph>`). Takes priority over `icon` when both are supplied.
- `iconSize?: number` — icon size in pixels, default `32`. Use `44` for
  screens whose original markup used a larger icon (TrashScreen,
  DeletedListsScreen). Ignored when `iconContent` is supplied.
- `title?: string` — heading copy. Omitted renders no heading.
- `body?: string` — body paragraph copy. Omitted renders no body (TrashScreen,
  DeletedListsScreen, BlockedScreen have a heading but no body).
- `ctaLabel?: string` and `onCta?: () => void` — when both are supplied, a
  `<Button variant="rect" tone="ink" size="md" leadingIcon="plus">` CTA
  is rendered below the body. When either is omitted, no CTA is rendered. Uses
  `tone="ink"` (dark background) to match the existing screens' CTA style and
  the empty-state spec in `docs/ui.md` ("CTA button: `background: var(--ink)`").

`data-test` is forwarded to the outermost element.

A co-located `EmptyState.test.ts` covers the component with Vitest: renders
with required props, the disc is present, `<Icon>` renders from `icon`,
`iconContent` overrides `icon`, heading / body render when supplied, CTA fires
`onCta`, and the CTA is absent unless both `ctaLabel` and `onCta` are supplied.

## R3. Semantic HTML sweep

The 0902 sub-plan replaces div scaffolding with semantic tags across the
file list below. The recurring mappings are:

- `<div class="header">` → `<header>` (containing `<h2>` for the sheet title
  + `<p>` for the subtitle). The sheet title `<h2>` overrides the global `h2`
  section-label rule via a scoped `header h2 { font-size: 17px; … }` rule.
- `<div class="section-label">` → `<h2 class="section-label">` during Phase
  3; the `.section-label` class is removed from the element (and the per-file
  CSS deleted) in the Phase 5 cleanup once the global `h2` rule covers it.
- `<div class="rows">` → `<ul class="rows">`.
- `<div class="row">` → `<li class="row">` (containing whatever interactive
  element is appropriate).
- `<div class="name">` → `<h3 class="name">` in all row contexts. The global
  `h3` rule (15 px) normalises the 14–15.5 px spread. `ListsScreen` and
  `ProfileSheet` keep scoped `h3` overrides for their intentionally larger
  sizes (17 px and 18 px respectively).
- `<div class="sub">` / `.subtitle` → `<p class="sub">` in a header context;
  `<span class="sub">` in an `<li>` context.

Files in scope (one task per file or small group where changes are minimal):

- `InvitePickerSheet.svelte` — canonical case.
- `ListOverflowSheet.svelte`, `AvatarSourceSheet.svelte` — each has a
  `div.header`; `ListOverflowSheet` also has `div.rows` with `<Button>`
  children (the rows become `<ul>` with each `<Button>` in an `<li>`).
- `MembersScreen.svelte` — `div.section-label`, `div.rows`, `div.row`,
  `div.name`.
- `ItemsScreen.svelte` — `div.rows`, `div.row`.
- `ListsScreen.svelte` — `div.row` per list entry.
- `InvitesInboxScreen.svelte`, `InvitesBanner.svelte` — `div.row` patterns.
- `TrashScreen.svelte`, `DeletedListsScreen.svelte` — `div.rows`, `div.row`.
- `CircleScreen.svelte`, `BlockedScreen.svelte`, `AddEditItemSheet.svelte` —
  small targeted changes (`div.row-text`, `div.sub`).
- `SettingsScreen.svelte`, `PrivacyScreen.svelte` — already use `<h2>` for
  section labels; Phase 6 cleanup removes the now-redundant `.section-label`
  class from the element and the local CSS rule.
- `ProfileSheet.svelte`, `CircleExplainerSheet.svelte`, `CreateListSheet.svelte`,
  `TopBar.svelte` — confirm no outstanding `div.header` / `div.rows` /
  `div.row` / `div.section-label` patterns remain.

## R4. Existing tests pass (with selector-level rewrites)

Every existing Vitest component test must pass. Selector-level rewrites are
expected and allowed — e.g. a query that searched for `div.row` can become
`li.row` or `getByRole('listitem')`; a query that searched for
`div.section-label` becomes `h2`. Semantically, the assertions must be
equivalent to the original. Each migration task in Phase 4 lists the
corresponding `.test.ts` file in its **Files** list and updates any assertions
that break due to the element-type change.

Playwright e2e: the existing suite is the regression net. No new e2e tests
are added in this plan.

## Non-requirements (explicitly excluded)

- **`<Icon>` `color` prop** — `Icon.svelte` already uses `stroke="currentColor"`,
  which inherits from the surrounding CSS `color`. Callers that need a specific
  colour wrap the icon in any container element (a `<span>`, an `<li>`, etc.)
  with the desired `color` value. No prop is needed; adding one would duplicate
  a mechanism CSS already provides for free.
- **Cosmetic icon-colour wrapper removal** — `.row-icon` in `TrashScreen` and
  any similar one-off wrappers are left as-is; they are self-documenting and
  harmless.
- **`CircleScreen` empty state** — when the circle is empty the always-present
  add-card is the only thing on screen; adding a no-circle empty-state is a
  screen design change, not a refactor.
- **`<NavRow>` component extraction** — `SettingsScreen` and `PrivacyScreen`
  share a nav-row shape but extracting it is a separate plan.
- **PrivacyScreen `div.nav-rows` and SettingsScreen nav-button groups** —
  `PrivacyScreen` has `<div class="nav-rows">` containing `<Button>` children;
  `SettingsScreen` uses `<section>` (already semantic) with direct `<Button>`
  children. Wrapping these in `<ul>/<li>` is the `<NavRow>` extraction plan's
  remit, not this semantic-HTML sweep. Task 3.9 confirms both files have no
  outstanding `div.rows`/`div.row`/`div.header` patterns, and notes the
  `div.nav-rows` deferral explicitly.
- **`<h3>` global rule** — member-name spans drift between 14 px and 15 px
  across files; no single canonical value exists. The semantic `<h3>` tag lands
  for accessibility; per-component scoped CSS targeting `h3` stays.
- **New e2e tests** — the existing Playwright suite is the regression net;
  adding new specs is a separate concern.
- **PrivacyScreen `section-label` font-size reconciliation** — PrivacyScreen's
  `.section-label` CSS rule already uses `font-size: 11.5px`, identical to the
  global `h2` value. No font-size override is needed or kept; PrivacyScreen
  follows the same Phase 5 cleanup as all other files (class removed, font
  properties removed, padding moved to a bare `h2` selector).
