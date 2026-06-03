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
- **`h2`** — section label. 0.72 rem, 600, 0.06em, uppercase, `--stone`.
  Padding stays scoped (it is layout). CircleScreen's `.section-header`
  (0.75 rem / 0.04em) and SettingsScreen's `.preview-label` (11 px) converge
  onto this.
- **`h3`** — standard row / primary label. 0.9375 rem, 600, `--ink`, margin 0.
  Normalises the 14/15/15.5 px spread.
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
  / `.row:last-child { border-bottom: none }` hacks are removed.
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
  and score variants `.badge-score.positive` (`--sage`) /
  `.badge-score.negative` (`--ember`). Covers the count badge (InvitesBanner),
  the privacy badge (PrivacyScreen), and the aggregate score badge (ItemsScreen).
- **Pill buttons.** `InvitesInboxScreen` and `InvitesBanner` hand-roll
  `.btn-accept` / `.btn-decline` with their own padding, radius, font, and
  color. These are replaced by the existing
  `<Button variant="pill" tone="sage|…">` primitive (already used by
  InvitePickerSheet), deleting the hand-rolled button CSS. No new button
  component is created — only reuse of the existing one.

## R5. Semantic HTML sweep

Div scaffolding becomes semantic across every in-scope file (mappings as in
the original plan, still in force):

- `<div class="header">` → `<header>` (containing the sheet title `<h2 class="t-sheet">`
  + an optional `<p class="caption">` subtitle).
- `<div class="section-label">` / `<div class="section-header">` → `<h2>`.
- `<div class="rows">` → `<ul class="rows">`; `<div class="row">` →
  `<li class="row">` (or `<button class="row">` where the row is itself the
  tap target).
- `<div class="name">` → `<h3 class="name">` in row contexts (the two hero
  names use `.list-title` / `.identity-name`).
- `<div class="sub">` / `.subtitle` / `.meta` → `<p>` in a header context,
  `<span>` in a list-row context, each carrying `.caption`.

Carve-outs documented in the task blocks (e.g. InvitesBanner's `.row` is a
layout div, not a list item; the InvitePicker e-mail `<label>` stays a label).

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
`text-transform`, `line-height`, text `color`, `background`, or
`border*-color` declaration — those all live in the global sheets. A grep
guard in the final task enforces this, listing the few documented exceptions
(EmptyState's own visual rules; Snackbar/Sheet/Button primitive internals;
state-dependent `color` that is genuinely dynamic, if any — each annotated).

## R8. Existing tests pass (with selector-level rewrites)

Every Vitest component test passes. Selector rewrites are expected and allowed
(`div.row` → `li.row` or `getByRole('listitem')`; `div.section-label` → `h2`).
Each sweep task lists its `.test.ts` and updates assertions broken by
element-type changes. The Playwright suite is the regression net; no new e2e
specs are added.

## Non-requirements (explicitly excluded)

- **New shared components beyond `<EmptyState>`.** This plan globalises CSS and
  reuses the *existing* `<Button>`; it does **not** extract `<NavRow>`,
  `<Badge>`, `<Card>`, or `<Toast>` Svelte components. Those are follow-up
  plans. (Replacing raw `<button>`s with the existing `<Button>` is reuse, not
  new extraction, and is in scope per R4.)
- **`<NavRow>` extraction** — `SettingsScreen` / `PrivacyScreen` nav rows and
  `PrivacyScreen` `div.nav-rows` keep their structure; only their visual CSS
  moves to global. The component extraction is a separate plan.
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
