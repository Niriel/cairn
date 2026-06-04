# Requirements: Semantic HTML + global visual system (homogenisation)

0902 is the second and final sub-step of the step-9 CSS refactor. Its remit
**widened mid-plan** (see PLAN.md → "Scope change") from a narrow
typography-and-empty-state cleanup to a full homogenisation pass: the screen
inventory was prototyped by copy-pasting CSS out of the `design/` JSX, which
left every component carrying its own near-duplicate visual rules (fonts,
colors, borders, backgrounds, badges, cards). Those values have drifted —
member names at 14/15/15.5/17/18 px, sheet titles at 17/18/19/24/25.6 px,
section labels in two units (11.5 px vs 0.75 rem), the same row border and
the same dashed empty-state box re-declared in a dozen files.

The end state: **scoped component CSS holds layout only; every visual decision
(color, background, border-color, font, spacing-of-type) has exactly one home
in global CSS**, reached by a semantic tag or a global class. This is the
"layout local, visual global" convention now recorded in
`docs/ui.md` → "Where CSS lives". Convergence is deliberate: where two screens
disagree on an accidental value, they converge on one global value — this plan
**does** change some pixels on screen, by design. (This reverses the original
"no user-visible behaviour changes / match the original" framing; see PLAN.md.)

## R1. Unit policy — rem default, em for local scaling, px for hairlines

All sizes move to the policy in `docs/ui.md` → "Units":

- **`rem`** for `font-size` and type-coupled spacing/sizing. This is what makes
  the Settings font-size control (it scales root `font-size` via
  `--font-size-scale`) actually take effect — px values silently ignore it,
  which is why the control is currently dead.
- **`em`** for a sub-element that should track its **local** font-size, not the
  global scale — e.g. an icon next to a text label sizes in `em` so it grows
  with that label; likewise inline icon↔label gaps.
- **`px`** only for what must not scale: hairline borders (`1px solid`),
  shadow offsets, genuinely fixed structural measures.

The rem-vs-px split between domains (privacy/circle/blocked were authored in
rem; everything else in px) is eliminated — everything normalises to rem.

## R2. Global type scale keyed off tags + role classes

`web/src/lib/shared/styles/typography.css` holds one rule per type role. No
component re-declares a `font-family`, `font-size`, `font-weight`,
`letter-spacing`, `text-transform`, `line-height`, or text `color`. Roles
(canonical rem values; see PLAN.md → "Type scale" for the px→rem table and the
per-selector mapping):

- **`h1`** — screen title (TopBar). Newsreader serif, 1.375 rem, 500,
  −0.01em, `--ink`, margin 0.
- **`h2`** — section **title**. 0.8125 rem, 600, `--ink-soft`, **normal
  case**, `margin: 0`. **Not uppercase.** Uppercase + `0.06em` tracking is the
  *form-label* look and lives only on the `<Label>` primitive — the two roles
  were conflated under the word "label", and this requirement separates them: a
  section title is a small heading, a form label is the upper-cased field
  caption. Dropping uppercase from section titles is a deliberate, app-wide
  visual change (the JSX prototyped them upper-cased, but type is not lifted
  from the JSX). Padding stays scoped (it is layout). CircleScreen's
  `.section-header` (0.75 rem / 0.04em, uppercase) converges onto this.
  SettingsScreen's `.preview-label` is a *form* sub-label, **not** a section
  title — it uses `<Label>`, not `h2` (see R5 / task 5.10), so it is **not**
  absorbed here.
- **`h3`** — standard row / primary label. 0.9375 rem, 600, `--ink`, margin 0.
  Normalises the 14/15/15.5 px spread. The same rule is also exposed as a
  `.row-title` **class** (`h3, .row-title { … }`) for row names that must sit
  **inside** an interactive control, where a heading tag is invalid HTML — see
  R5.
- **`.t-hero`** — empty-state and explainer-sheet hero. Newsreader serif,
  1.5 rem, 500, −0.01em, `--ink`. (EmptyState's heading uses this role.)
- **`.t-sheet`** — bottom-sheet title (applied to the sheet header `<h2>`,
  overriding the global section-label `h2`). Newsreader serif, 1.125 rem, 500,
  `--ink`. Converges the 17/18/19 px sheet titles; InvitePicker's title moves
  from sans to serif (deliberate).
- **`.list-title`** — the list-row hero name (ListsScreen). Newsreader serif,
  1.0625 rem, 600, −0.005em, `--ink`, line-height 1.3.
- **`.identity-name`** — a person's name as a sheet hero (ProfileSheet).
  1.125 rem, 600, `--ink`.
- **`.body`** — body paragraph. 0.875 rem, `--ink-soft`, line-height 1.5.
- **`.caption`** — subtitle / metadata / attribution / row-sub. 0.75 rem,
  `--stone`, line-height 1.5. Converges the 11–12 px / 0.72–0.75 rem
  secondary-text cluster.
- **`.mono`** — numeric / monospace runs (vote values, counts, "when"
  timestamps). `'JetBrains Mono', ui-monospace, monospace`; pairs with
  `.caption` for size where small.

Two larger names are intentional roles (`.list-title`, `.identity-name`), not
drift; everything else collapses to `h3`.

## R3. Global surface rules — borders, backgrounds, cards, list dividers

A new `web/src/lib/shared/styles/surfaces.css` (imported alongside
`typography.css`) owns the repeated structural-visual patterns. No component
re-declares these borders/backgrounds:

- **List dividers.** `.rows` carries the top rule; each `.rows .row` carries a
  bottom rule (`1px solid var(--rule)`). The per-file `.row.first { border-top }`
  / `.row:last-child { border-bottom: none }` hacks are removed. **All list
  containers use `class="rows"`** so this one rule covers every list — the
  variant names `.list` (ListsScreen, InvitesInboxScreen), `.circle-list`
  (CircleScreen), and `.blocked-list` (BlockedScreen) are renamed to `.rows`
  (their layout-specific scoped rules move to a `.rows` selector or a co-class).
  This supersedes the parent plan's decision
  (`plans/0900_refactor_css_components/PLAN.md` → "`<hr>` separator sweep") to
  convert every `border-bottom`-as-separator into an explicit `<hr>`: that
  predates the concrete `<ul>`/`<li>` migration, and an `<hr>` is invalid as a
  direct child of a `<ul>` (a border on each `<li class="row">` is the right
  idiom for data rows). `<hr>` survives only where it separates a *menu of
  actions* rather than data rows — `ListOverflowSheet`'s action list, wrapped as
  `<li role="separator"><hr /></li>` (task 5.2). That action menu therefore does
  **not** carry the global `.rows` class — it is `<hr>`-separated, not the
  per-row-border data-list model, and keeping `.rows` would add the container
  top-divider it doesn't want (directly under its header's existing
  `border-bottom`). It keeps a distinct layout class (`.menu`); see task 5.2.
- **`.card`** — `1px solid var(--rule)`, `border-radius: 0.75rem`,
  `background: var(--paper)`. **`.card-alt`** — same with
  `background: var(--paper-alt)`. **`.card-dashed`** — `1px dashed var(--stone-lt)`,
  same radius, `background: var(--paper-alt)`. Radii converge to `0.75rem`
  (was 0.75 rem / 12 px / 0.875 rem).
- **`.surface-alt`** — `background: var(--paper-alt)` for raised regions with
  no border (e.g. the invite picker's e-mail section, an open item row, a
  selected option).
- **`.sheet-handle`** — the drag handle repeated in three sheets:
  `width: 2.25rem; height: 0.25rem; border-radius: 99px; background: var(--stone-lt)`.

## R4. Global control rules — badges; shared `<Button>` for pills

`web/src/lib/shared/styles/controls.css` (imported alongside the others) owns
badge looks; raw duplicated buttons are replaced by the existing `<Button>`:

- **Badges.** `.badge` base (inline-flex, centred, `border-radius: 99px`),
  with tone variants: `.badge-ink` (bg `--ink`, color `--paper`),
  `.badge-soft` (bg `--paper-alt`, `1px solid var(--rule)`, color `--stone`),
  and score variants `.badge-score.positive` (`color: var(--sage); background:
  var(--sage-bg)`) / `.badge-score.negative` (`color: var(--ember); background:
  var(--ember-bg)`). The score badge keeps both its tinted background **and** a
  text colour (matching today's `ItemsScreen` look); its radius converges from
  the current 6 px to the `.badge` pill (`99px`) — a deliberate change. Covers
  the count badge (InvitesBanner), the privacy badge (PrivacyScreen), and the
  aggregate score badge (ItemsScreen). (The ProfileSheet circle/blocked label is
  **not** a badge — it is a centred text label; see R5 carve-outs / task 5.9.)
- **Error toast.** `TrashScreen` and `DeletedListsScreen` carry a byte-identical
  persistent `.error` toast (ember text, paper background, `1px solid
  var(--ember)`, radius, shell-aware fixed positioning). It is globalised as a
  single `.toast-error` class in `controls.css` (visual **and** the shared
  fixed-position pattern, since it is a self-contained transient surface), and
  both screens apply it, deleting their duplicated scoped rule. It stays a
  plain `{#if error}` element — **not** migrated to `<Snackbar>`, whose 6 s
  auto-dismiss would change the persistent-error behaviour.
- **Pill buttons.** `InvitesInboxScreen` and `InvitesBanner` hand-roll
  `.btn-accept` / `.btn-decline` with their own padding, radius, font, and
  color. These are replaced by `<Button variant="pill">`, deleting the
  hand-rolled button CSS. `<Button>` today exposes tones `primary | ink |
  destructive`, none of which render the **filled sage** Accept button the
  design specifies (`background: var(--sage); color: #fff` — see
  `design/cairn-invite-screens.jsx` and `docs/ui.md` → "Accept (sage)").
  `<Button>` therefore gains a minimal new **`sage` tone** that renders
  **filled** in the `pill` variant (sage background, paper/white text); the
  `pill` variant stays outlined for every other tone. Accept →
  `<Button variant="pill" tone="sage">` (filled); Decline →
  `<Button variant="pill" tone="ink">` (outlined). Decline's current
  muted-stone outline converges onto the outlined `ink` pill — a deliberate
  homogenisation change. This is a minimal extension of the existing
  primitive, not a new component.

## R5. Semantic HTML sweep

Div scaffolding becomes semantic across every in-scope file. The mappings:

- **Sectioning.** A "section label" is the *title of a group of content*
  ("Your circle", "Appearance", "Who can invite you to lists"), so each such
  group becomes a `<section>` whose heading is that title. The element rules:
  - The section title → `<h2>` (global `h2` type). A `<div class="section-label">`
    / `<div class="section-header">` becomes the section's `<h2>`.
  - **No trivial headers.** A `<section>` whose only introductory content is its
    title keeps a bare `<h2>` as its first child — do **not** wrap a lone `<h2>`
    in a `<header>`. Promote to `<header>` only when the section's intro carries
    *more than the title* (a subtitle, a count, a trailing action) — this is the
    sheet-header case below.
  - **Trailing notes → `<footer>`.** Closing/explanatory content at the foot of
    a section (e.g. PrivacyScreen's `cascade-note` "3 pending invites have been
    declined…", a "What's this?" link) becomes a `<footer>` inside the
    `<section>`.
  - A single, unlabelled list on a screen needs no `<section>` wrapper (a
    `<section>` should have a heading); only labelled content groups are
    sectioned.
- `<div class="header">` → `<header>` — the sheet/screen header where the title
  *does* travel with companions: the sheet title `<h2 class="t-sheet">` + an
  optional `<p class="caption">` subtitle.
- `<div class="rows">` → `<ul class="rows">`; `<div class="row">` →
  `<li class="row">` (or `<button class="row">` where the row is itself the
  tap target).
- `<div class="name">` → `<h3 class="name">` **only where the name is not
  nested inside an interactive control**. Where the row's whole body is the tap
  target (a `<button class="row">` / `<button class="row-tap">` / a row-nav
  `<Button variant="text">`), the name stays a **`<span>`** carrying the role
  class — `<span class="name row-title">` for a plain row name, or
  `<span class="name list-title">` for the ListsScreen hero name — **never an
  `<h3>`**. A heading is flow content, invalid as a `<button>` descendant, it is
  subsumed into the button's accessible name rather than exposed to
  heading-navigation, and the linter (`svelte/flat/recommended`) won't catch it.
  This matches the parent plan (`0900` R12), which kept member-names as `<span>`.
  The two hero names use `.list-title` / `.identity-name`.
- `<div class="sub">` / `.subtitle` / `.meta` → `<p>` in a header context,
  `<span>` in a list-row context, each carrying `.caption`.

Carve-outs documented in the task blocks (e.g. InvitesBanner's `.row` is a
layout div, not a list item). The InvitePicker e-mail "By e-mail" caption is
both the e-mail `<section>`'s intro **and** the label for its one input, so it
uses the existing `<Label>` primitive (`<Label for="…">By e-mail</Label>`,
which renders the upper-cased form-label look as a real `<label>` — the correct
look here, since this caption *is* the label for the e-mail input) rather than a
`<div class="section-label">` — no global `.section-label` class is introduced.

## R6. One empty-state look, migrated everywhere

The shared `<EmptyState>` (already extracted, task 2.1) is the single
empty-state home; its visual CSS legitimately lives in the component and uses
the `.t-hero` / `.body` roles. The six screens with bespoke empty-state markup
(ListsScreen, ItemsScreen, InvitesInboxScreen, DeletedListsScreen, TrashScreen,
BlockedScreen) migrate to it, deleting their copy-pasted `.empty*` CSS.
BlockedScreen's one-off dashed-box empty state is unified onto the same look
(a deliberate visual change; `docs/ui.md` documents one pattern).

## R7. Acceptance: scoped CSS is layout-only

After the sweep, a scoped `<style>` block in any in-scope `.svelte` file
contains no `font-family`, `font-size`, `font-weight`, `letter-spacing`,
`text-transform`, `line-height`, text `color`, `background` (other than the
value-less layout resets `background: none` / `transparent` on un-styled
buttons), or `border*-color` declaration — those all live in the global sheets.
A grep guard in the final task enforces this. The guard is scoped to the
**swept in-scope files only**, not all of `web/src/lib` — the untouched
primitives in `basic/` (`Button`, `TextInput`, `Textarea`, `Sheet`, `Snackbar`,
`Accordion`, `VoteControl`, …) and the untouched `shared/` components
(`Avatar`, `AppTopBar`, `NavRow`, …) legitimately carry visual CSS and are not
in scope. The documented exceptions among the swept files: EmptyState's own
visual rules; single-instance TopBar/sheet/undo-snackbar chrome; the
serif-italic `.notes` / tombstone editorial type; kept cosmetic icon-colour
wrappers (e.g. TrashScreen `.row-icon { color: var(--stone) }`, left as-is per
the parent plan's reconsidered R10); and genuinely-dynamic state `color`
one-liners — each annotated inline with why.

## R8. Existing tests pass (with selector-level rewrites)

Every Vitest component test passes. Selector rewrites are expected and allowed
(`div.row` → `li.row` or `getByRole('listitem')`; `div.section-label` → `h2`).
Each sweep task lists its `.test.ts` and updates assertions broken by
element-type changes. The Playwright suite is the regression net; no new e2e
specs are added.

## R9. No `<hr>` — separators are CSS borders everywhere

**Supersedes R3's carve-out** that kept `<hr>` for the `ListOverflowSheet`
action menu. A separator between sibling rows — data rows or action rows — is
presentational, not semantic: an `<hr>` carries no document meaning the reader
needs, and it is invalid as a direct child of a `<ul>`, which is exactly why the
existing `ListOverflowSheet` markup hides each one inside
`<li role="separator" aria-hidden="true"><hr /></li>` purely to stay valid.
That wrapper is a hack dressing a stylistic line as structure.

Every `<hr>` is removed: the five in `ListOverflowSheet.svelte` (lines 98, 111,
124, 137, 174) and the bare one in `PrivacyScreen.svelte` (line 137). Dividers
become a CSS border between adjacent siblings (`1px solid var(--rule)`),
matching the `.rows .row` data-list idiom R3 already established — e.g.
`.menu > li + li { border-top: 1px solid var(--rule) }` for the action menu,
and the `nav-row + nav-row` border owned by `<NavRow>` (R11) for the privacy
nav divider. The separator `<li role="separator">` elements and the scoped
`.menu hr` rule are deleted. Once no `<hr>` remains in `web/src`, the now-dead
global `hr` reset rule in `reset.css` is removed. The visual result is identical
(the same hairline in the same place). This also corrects the master plan
(`plans/0000_implementation_order.md` step 9, bullet 4), which still prescribes
the opposite (`<hr>` sweep) — reconciled in this plan's doc task.

## R10. `.row` and `.field` layout blocks consolidated into global utilities

The flex row block — `display: flex; align-items: center; gap: 0.75rem;
padding: 0.875rem 1.125rem` — is copy-pasted across `DeletedListsScreen`,
`TrashScreen`, `BlockedScreen`, `CircleScreen`, and `MembersScreen`; the
form-field wrapper — `display: flex; flex-direction: column; gap: 0.5rem` —
across ~9 sheets/forms (`AddEditItemSheet`, `CreateListSheet`,
`EditDescriptionSheet`, `RenameListSheet`, `LoginRequest`, `CircleScreen`,
`ProfileSheet`, the profile route, and the InvitePicker e-mail row). Both are
pure layout, so they don't violate R7 — but they are exactly the copy-paste
step 9 exists to kill.

A single global `.row` base and `.field` utility land in `surfaces.css`. Each
call site keeps only its genuine *deltas* as scoped overrides (e.g.
`TrashScreen`'s tighter `gap: 0.625rem` + extra left padding + `min-height`;
`MembersScreen`'s button-reset variant). Only declarations identical across ≥2
files are lifted; a genuinely one-off block stays inline (the master-plan
guardrail: minimise repetition without exploding the API).

## R11. `<NavRow>` shared component extracted

**Supersedes the Non-requirement** that deferred this to a separate plan. The
nav-row shape — a leading `<Icon size={20}>`, a title/subtitle text column
(`.nav-row-title.row-title` + `.nav-row-sub.caption`), an optional trailing
badge/count, and a trailing `chevron-right` icon, all wrapped in a
`<Button variant="text" tone="ink" size="md">` — repeats verbatim across
`SettingsScreen` (Invites, Privacy, …), `PrivacyScreen` (Your circle, Blocked),
and `InvitesInboxScreen`.

Extract `web/src/lib/shared/components/NavRow.svelte` (the `shared/` tier — an
app-styled primitive like `<EmptyState>`, not a `basic/` framework primitive).
Props: `icon: IconName`, `title: string`, `sub?: string`, `onclick?` **or**
`href?` (navigation), `data-test?`, and a `trailing?` snippet for the
badge/count slot (rendered between the text column and the chevron). The chevron
is always rendered. The component wraps the existing `<Button>` so the tap
target, focus, and look are unchanged; it owns the `.nav-row-*` layout that is
currently duplicated and the inter-row divider border
(`nav-row + nav-row { border-top: 1px solid var(--rule) }`), which re-homes the
`PrivacyScreen` divider R9 strips. Co-located `NavRow.test.ts` covers behaviour
(renders title/sub, fires `onclick`, exposes the trailing slot, accessible name
from the title). The three screens migrate to `<NavRow>` and delete their
duplicated nav-row CSS.

## Non-requirements (explicitly excluded)

- **New shared components beyond `<EmptyState>` and `<NavRow>`.** This plan
  globalises CSS and reuses the *existing* `<Button>`; beyond the `<NavRow>`
  extraction added in R11, it does **not** extract `<Badge>`, `<Card>`, or
  `<Toast>` Svelte components. Those are follow-up plans. (Replacing raw
  `<button>`s with the existing `<Button>` is reuse, not new extraction, and is
  in scope per R4. The `sage` filled-pill tone added to `<Button>` per R4 is an
  extension of the existing primitive, not a new component.)
- **`<Icon>` `color` prop** — `Icon` uses `stroke="currentColor"`; callers set
  `color` on an ancestor. No prop added. Icon *sizing* in `em` (R1) is applied
  where a task calls for it, but a wholesale Icon-component change to em-based
  sizing is out of scope.
- **Reworking the vote control, segmented control, or theme/size pickers'
  bespoke chrome** beyond moving their colors/borders/fonts to global. The
  radio-dot, theme-option, and size-option structural CSS (sizing, grid) stays
  scoped as layout.
- **New e2e tests** — existing Playwright suite is the net.
- **CircleScreen no-circle empty state** — adding one is a design change, not a
  refactor (unchanged from original).
- **Strict heading-level hierarchy inside sheets.** Every section label is
  uniformly an `<h2>` (carrying the global section-label look), and a sheet
  title is also an `<h2 class="t-sheet">`, so a sheet's title and the section
  labels it contains sit at the same heading level. This flatness is accepted:
  demoting in-sheet section labels to `<h3>` would give them the row-name look,
  not the section-label look, breaking the one-role-per-tag design; the
  `<section>` wrappers (R5) provide the structural grouping, and the HTML5
  outline algorithm browsers/AT actually use never relied on heading-level
  nesting within sectioning roots. Deliberately not pursued here.
