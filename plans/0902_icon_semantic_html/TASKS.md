# Tasks

## Reference skills and docs

- **`docs/ui.md`** — "Where CSS lives: layout local, visual global", "Units:
  rem / em / px", the empty-state pattern, the TopBar spec.
- **`PLAN.md` (this directory)** — the canonical **Type scale**, **Surfaces**,
  and **Controls** tables. Sweep tasks reference these instead of repeating the
  role values inline.
- **`docs/frontend-layout.md`** — tier rules (`basic/` vs `shared/`); test
  files next to SvelteKit route files omit the `+` prefix.
- **`docs/testing.md`** — Vitest for component behaviour.
- **`docs/quality.md`** — lint / format / type-check toolchain.
- **`design/Cairn - Design Canvas.html`** — **layout** reference for the visual
  sweep; colors/type are intentionally homogenised, not matched to the JSX.

### Standing rules for every Phase 5 sweep task

1. **Semantic first.** Apply the R5 element-type mappings. Keep the class name
   on the new element through the sweep so test selectors keep working; dead
   classes are removed in Phase 6.
2. **Strip scoped visual.** Delete every `font-*`, `letter-spacing`,
   `text-transform`, `line-height`, text `color`, `background`, and
   `border*-color` declaration from the scoped `<style>`, replacing it by the
   global role/class from PLAN.md (a tag, or a class added to the markup).
3. **Units.** Convert remaining (layout) values to rem; use em for
   icon-beside-label sizing/gaps; leave hairline `1px` borders and shadows in
   px.
4. **Empty state.** If the file has a bespoke empty-state block, migrate it to
   `<EmptyState>` and delete the `.empty*` CSS.
5. **Tests.** Update the `.test.ts` for element-type/selector changes; keep
   assertions behaviourally equivalent.
6. **Verify:** `pnpm lint` · `pnpm check` · `pnpm test`.

---

## Phase 0 — Reconcile docs

### [ ] 0.1 Finish the `docs/ui.md` rem + role reconciliation

**Created:** 2026-06-03T00:00:00Z
**Completed:**

**Why:** `docs/ui.md` gained the two governing conventions ("Where CSS lives",
"Units") during planning, but several of its concrete specs still quote px
(TopBar title "22 px"; empty-state heading "24 px", body "14 px"; the
CSS-convention examples). Once `typography.css` is rem with named roles, the
doc and the code must agree, or the next UI plan references stale px.

**Prerequisites:** none (doc-only).

**Decisions:**
- Convert the canonical pixel specs in `docs/ui.md` to rem with the px value in
  parentheses for orientation, e.g. "1.375 rem (22 px)". Touch: the TopBar spec
  ("Newsreader serif, 22 px, …"), the empty-state spec (96 × 96 disc — px stays
  for the fixed disc; heading 1.5 rem (24 px); body 0.875 rem (14 px)), and any
  other quoted type size.
- Add a short "Type roles" list to the "Where CSS lives" area naming the global
  roles (`h1`, `h2`, `h3`, `.t-hero`, `.t-sheet`, `.list-title`,
  `.identity-name`, `.body`, `.caption`, `.mono`) so the doc names the source
  of truth that `typography.css` implements.
- Disc dimensions (96 px) and hairline borders stay px per the Units rule.

**Files:**
- `docs/ui.md` (modify)

**Steps:**
1. Update the TopBar visual spec and the empty-state spec to rem (px in
   parentheses).
2. Add the "Type roles" list under the CSS-conventions section.
3. No code or tests in this task. `pnpm lint`/`pnpm check` not required for a
   markdown-only change, but run `pnpm exec prettier --check docs/ui.md` if
   markdown is in the Prettier glob.

**Verify:** `pnpm exec prettier --check "docs/ui.md"` (or note if md is outside
the Prettier config).

---

## Phase 1 — Typography lift

### [x] 1.1 Add global `h2` and `ul / ol` rules to `typography.css`

**Created:** 2026-05-30T08:24:10Z
**Completed:** 2026-05-31T03:13:59Z

**Note (added in rewrite):** This task shipped the global `h1/h2/h3/ul/ol`
rules in **px**. Phase 3 re-opens `typography.css` to convert those values to
rem and add the wider role set (`.t-hero`, `.t-sheet`, `.list-title`,
`.identity-name`, `.body`, `.caption`, `.mono`). The task below is preserved as
historical record; do not re-execute it.

**Why:** Every `div.section-label → h2` migration is safe only when the global
`h2` rule already covers the typography, so the per-file `.section-label` CSS
can be removed without a styling gap. Similarly `div.rows → ul` relies on `ul`
having no browser-default padding/margin/bullets.

**Files:** `web/src/lib/shared/styles/typography.css` (modified — added global
`h1`, `h2`, `h3`, and `ul, ol` reset).

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test` (all green at completion).

---

## Phase 2 — `<EmptyState>` extraction

### [x] 2.1 Extract `<EmptyState>` and write Vitest tests

**Created:** 2026-05-30T08:24:10Z
**Completed:** 2026-05-31T08:14:28Z

**Why:** Six screens each render an empty-state block, most copy-pasting the
same illustrated markup. Extracting a single single-shape `<EmptyState>`
(disc + optional heading/body/CTA, props `icon` / `iconContent` / `iconSize` /
`title` / `body` / `ctaLabel` / `onCta` / `data-test`) unifies them and makes
each Phase 5 empty-state migration a small replace.

**Files:** `web/src/lib/shared/components/EmptyState.svelte` (created),
`web/src/lib/shared/components/EmptyState.test.ts` (created).

**Note (added in rewrite):** Phase 3 converts EmptyState's scoped visual CSS to
rem and the `.t-hero` / `.body` roles. Its visual CSS legitimately lives in the
component (it is the empty-state home) — an allowed exception to the
layout-only rule.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test` (all green at completion).

---

## Phase 3 — Global visual system

### [ ] 3.1 Rewrite `typography.css` in rem with the full role set

**Created:** 2026-06-03T00:00:00Z
**Completed:**

**Why:** This is the single source of truth for every type role. All Phase 5
sweeps delete scoped type and rely on these rules, so they must exist and be
correct first. Converting to rem is what makes the Settings font-size control
work (R1).

**Prerequisites:** Task 0.1 (doc names the roles).

**Decisions:**
- Convert the existing `h1`/`h2`/`h3` rules to rem: `h1` 1.375rem, `h2`
  0.72rem, `h3` 0.9375rem (values + other props per PLAN.md → Type scale).
  Keep the `ul, ol` reset.
- Add the new role classes from PLAN.md → Type scale: `.t-hero`, `.t-sheet`,
  `.list-title`, `.identity-name`, `.body`, `.caption`, `.mono`. Exact values
  in the PLAN table.
- `.t-sheet` must override the global section-label `h2` when applied to a
  sheet header's `<h2 class="t-sheet">` — class selector beats tag selector, so
  no `!important` needed.
- Do **not** add a bare global `p` rule (would clobber component paragraphs);
  body text opts in via `.body` / `.caption`.
- Keep `.hint`, `.disclaimer`, `.explainer` as-is for now (they are existing
  global text helpers); note any overlap with `.caption` in Notes for a later
  pass — do not merge in this task.

**Files:**
- `web/src/lib/shared/styles/typography.css` (modify)

**Steps:**
1. Rewrite the heading rules in rem and append the new role classes per the
   PLAN table.
2. `pnpm lint` (Prettier on CSS) · `pnpm check`.
3. `pnpm test` — no markup changed yet, so all existing tests stay green.
   (Visual values change, but Vitest asserts behaviour, not pixels.)

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 3.2 Create `surfaces.css` and wire global imports

**Created:** 2026-06-03T00:00:00Z
**Completed:**

**Why:** The row-divider, card, raised-surface, and sheet-handle looks are
re-declared across ~10 files. Centralising them lets every sweep delete its
copy and add a class instead (R3).

**Prerequisites:** Task 3.1.

**Decisions:**
- Create `web/src/lib/shared/styles/surfaces.css` with: the `.rows` /
  `.rows .row` divider model, `.card`, `.card-alt`, `.card-dashed`,
  `.surface-alt`, `.sheet-handle` — values per PLAN.md → Surfaces. Radii
  converge to `0.75rem`; hairline borders stay `1px`.
- Find the global-CSS import site (where `typography.css` and `tokens.css` are
  imported — check `web/src/routes/+layout.svelte` and any `app.css`). Import
  `surfaces.css` there, after `tokens.css` and `typography.css`.

**Files:**
- `web/src/lib/shared/styles/surfaces.css` (create)
- the global import site (modify) — likely `web/src/routes/+layout.svelte`

**Steps:**
1. Write `surfaces.css` per the PLAN table.
2. Add the import at the global site (confirm the existing pattern first).
3. `pnpm lint` · `pnpm check` · `pnpm test` (no markup uses the classes yet;
   all green).

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 3.3 Create `controls.css` (badges) and wire its import

**Created:** 2026-06-03T00:00:00Z
**Completed:**

**Why:** Count, status, and score badges are re-declared in InvitesBanner,
PrivacyScreen, and ItemsScreen. One set of badge rules removes the drift (R4).

**Prerequisites:** Task 3.2 (import pattern established).

**Decisions:**
- Create `web/src/lib/shared/styles/controls.css` with `.badge` base and
  `.badge-ink`, `.badge-soft`, `.badge-score` (+`.positive`/`.negative`) per
  PLAN.md → Controls. Import alongside `surfaces.css`.
- Pill buttons are **not** styled here — they become `<Button>` in Phase 4.

**Files:**
- `web/src/lib/shared/styles/controls.css` (create)
- the global import site (modify)

**Steps:**
1. Write `controls.css`; add the import.
2. `pnpm lint` · `pnpm check` · `pnpm test`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 3.4 Convert `EmptyState` to rem and the global roles

**Created:** 2026-06-03T00:00:00Z
**Completed:**

**Why:** EmptyState shipped in px (22–24 px heading, 14 px body). To match the
homogenised scale it uses the `.t-hero` and `.body` roles (or rem values
identical to them) and converts spacing to rem (R1, R6).

**Prerequisites:** Task 3.1.

**Decisions:**
- The heading uses `.t-hero` (serif 1.5rem/500) and the body uses `.body`
  (0.875rem/`--ink-soft`/1.5) — either by adding the classes to the markup or
  by matching the rem values in the scoped block. Prefer adding the classes so
  there is one source of truth; the disc dimensions (96 px) and dashed border
  stay (disc is fixed; border is a hairline). Convert the disc `margin-bottom`,
  body `max-width`, and paddings to rem.
- EmptyState's remaining visual CSS (the disc) is an allowed exception per R7 —
  it is the empty-state home.

**Files:**
- `web/src/lib/shared/components/EmptyState.svelte` (modify)
- `web/src/lib/shared/components/EmptyState.test.ts` (modify if selectors
  reference removed classes — unlikely; tests assert behaviour)

**Steps:**
1. Apply `.t-hero` / `.body` to the heading/body; convert spacing to rem.
2. `pnpm lint` · `pnpm check` · `pnpm test`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

---

## Phase 4 — Shared chrome + `<Button>` reuse

### [ ] 4.1 TopBar — `<h1>` title, trim scoped type

**Created:** 2026-06-03T00:00:00Z
**Completed:**

**Why:** TopBar's `.centre` div carries the only canonical page title and its
type duplicates the global `h1`. Making it `<h1>` and deleting the scoped font
properties is the cleanest single instance of the whole plan. TopBar is fully
handled here and not revisited in Phase 5.

**Prerequisites:** Task 3.1 (global `h1` in rem).

**Decisions:**
- `<div class="centre">` → `<h1 class="centre">`. Remove `font-family`,
  `font-size`, `font-weight`, `letter-spacing`, and `line-height` from the
  scoped `.centre` rule (now covered by global `h1`; `line-height: 1.1` — keep
  only if it differs from the global and is intentional, otherwise drop). Keep
  `flex: 1; min-width: 0`.
- `.sub` → `<p class="sub caption">` if it is a `<div>`; move its type to
  `.caption` (0.75rem/`--stone`) and keep only layout (`margin-top`) scoped.
  Convert `margin-top` to rem.
- TopBar's `header` `background: var(--paper)` and `border-bottom: 1px solid
  var(--rule)` are single-instance app chrome — they may stay scoped (R "single
  instance chrome"). Convert the `padding`/`gap`/`min-height` to rem where they
  are not safe-area `env()` calc.

**Files:**
- `web/src/lib/shared/components/TopBar.svelte` (modify)
- `web/src/lib/shared/components/TopBar.test.ts` (modify if it queries
  `.centre` as a div)

**Steps:**
1. Apply the element + CSS changes above.
2. Update `TopBar.test.ts` selectors if needed.
3. `pnpm lint` · `pnpm check` · `pnpm test`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 4.2 Replace hand-rolled pills with `<Button>` (InvitesInboxScreen + InvitesBanner)

**Created:** 2026-06-03T00:00:00Z
**Completed:**

**Why:** Both files hand-roll `.btn-accept` / `.btn-decline` (diverging
13/13.5 px, own radius/colors) while InvitePickerSheet already uses the shared
`<Button variant="pill">`. Reusing `<Button>` deletes the duplicated button CSS
(R4). The rest of these two files' sweep is task 5.6.

**Prerequisites:** Task 3.1. Read `Button.svelte` to confirm the `variant`,
`tone`, and `size` props and the available pill tones.

**Decisions:**
- Replace each `<button class="btn-accept">Accept</button>` with
  `<Button variant="pill" tone="sage" …>` and each
  `<button class="btn-decline">Decline</button>` with a muted pill tone
  (confirm the tone name in `Button.svelte`; "Decline" is the backward/less
  committal action and goes left per the button-pair rule). Preserve all
  `data-test`, `onclick`, and disabled wiring.
- Delete the `.btn-accept` / `.btn-decline` scoped CSS. Keep `.buttons`
  (layout: flex/gap) and convert its gap to rem.
- If `<Button>` cannot express a needed tone, stop and flag rather than
  re-adding bespoke CSS.

**Files:**
- `web/src/lib/invite/components/InvitesInboxScreen.svelte` (modify)
- `web/src/lib/invite/components/InvitesInboxScreen.test.ts` (modify if button
  selectors change)
- `web/src/lib/invite/components/InvitesBanner.svelte` (modify)
- `web/src/lib/invite/components/InvitesBanner.test.ts` (modify if needed)

**Steps:**
1. Swap the buttons in both files; delete the `.btn-*` CSS.
2. Update tests (the buttons likely keyed by `data-test`, so minimal).
3. `pnpm lint` · `pnpm check` · `pnpm test`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

---

## Phase 5 — Per-component sweeps

Each task follows the **Standing rules** at the top of this file. Per-file
**Decisions** below only call out what is specific or surprising.

### [ ] 5.1 InvitePickerSheet — canonical sweep

**Created:** 2026-06-03T00:00:00Z
**Completed:**

**Why:** Fullest set of transformations in one file (header, two section
labels, two list groups, name + sub, an e-mail form). Establishes the playbook
and proves the global roles/classes compose with a real component.

**Prerequisites:** Phase 3 complete.

**Decisions:**
- `<div class="header">` → `<header>`; `.title` div → `<h2 class="title t-sheet">`;
  `.subtitle` div → `<p class="subtitle caption">`. (A `<header>` + `<h2>` was
  already partly started in the working tree — finish it.)
- The two `<div class="section-label">` → `<h2 class="section-label">`
  (global `h2`; drop the scoped font props, keep padding as layout, in rem).
- `<div class="rows">` → `<ul class="rows">`; `<div class="row">` →
  `<li class="row">`; rely on the global `.rows`/`.rows .row` divider — delete
  the scoped `border-top`/`:last-child border-bottom`.
- `<div class="name">` → `<h3 class="name">` (drop scoped 14 px → global 15px).
- `<div class="sub">` → `<span class="sub caption">`.
- `.email-section` → keep as layout; its `background: var(--paper-alt)` becomes
  the `.surface-alt` class on the element; `border-top` uses the global rule or
  stays as a hairline (keep `1px` px). The `<label class="section-label
  email-label">` stays a `<label>` (form-label carve-out) — give it the global
  `h2` look by keeping `class="section-label"` (tag is label, so it needs the
  class for the look; document that this label intentionally keeps the class).
- `.invited` check uses `color: var(--sage)` — that is a state color on an
  icon wrapper; move it to a tiny global helper or keep as an annotated
  exception (decide and note).

**Files:**
- `web/src/lib/invite/components/InvitePickerSheet.svelte` (modify)
- `web/src/lib/invite/components/InvitePickerSheet.test.ts` (modify)

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 5.2 ListOverflowSheet + AvatarSourceSheet

**Created:** 2026-06-03T00:00:00Z
**Completed:**

**Why:** Both have a `<div class="header">` → `<header>` with a serif title
→ `.t-sheet`, and `ListOverflowSheet` has a `<div class="rows">` of `<Button>`
items → `<ul>` with each `<Button>` wrapped in `<li>`. Both have a sheet
handle → global `.sheet-handle`.

**Prerequisites:** Phase 3; task 5.1 (playbook).

**Decisions:**
- ListOverflowSheet: `.list-name` div → `<h2 class="t-sheet">`; `.meta` div →
  `<p class="caption">`; `.label` (button row label) drops scoped font (15px →
  it is a row label; use `h3` semantics only if it is a heading, else keep as
  plain text styled by `.body` — it is a menu item label, use `.body`). `<hr>`
  between groups inside `<ul>` is invalid as a direct `<ul>` child — wrap:
  `<li role="separator" aria-hidden="true"><hr /></li>`; add a layout rule to
  zero its list padding. Handle div → `.sheet-handle` (delete scoped handle
  CSS).
- AvatarSourceSheet: `.header` → `<header>`; `.title` → `<h2 class="t-sheet">`;
  `.subtitle` (already `explainer subtitle`) → `<p class="subtitle caption">`
  (drop the now-redundant explainer if `.caption` covers it — keep `.explainer`
  only if its value differs; note the choice). Handle → `.sheet-handle`.
  `.divider` hairline stays px.

**Files:**
- `web/src/lib/list/components/ListOverflowSheet.svelte` (+ `.test.ts`)
- `web/src/lib/avatar/components/AvatarSourceSheet.svelte` (+ `.test.ts`)

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 5.3 MembersScreen

**Created:** 2026-06-03T00:00:00Z
**Completed:**

**Why:** Full suite: section label, rows, row (a `<button>`), avatar + name +
sub + action. `.name` matches `h3` already (good convergence check).

**Prerequisites:** Phase 3; task 5.1.

**Decisions:**
- `<div class="section-label">` → `<h2 class="section-label">` (padding only,
  rem). `<div class="rows">` → `<ul class="rows">`. Each `<button class="row">`
  → `<li class="row"><button …></li>` **or** keep `<button class="row">` as the
  list item if the row is the whole tap target — if so, use a `<li>` wrapper to
  stay valid inside `<ul>`. The row's `background: transparent` / `border:
  none` button-reset stays as layout-ish reset (it is not a visual look, it is
  un-styling a button) — keep but convert to the minimum. Divider via global
  `.rows .row`.
- `<div class="name">` → `<h3 class="name">` (delete scoped 15px). `<div
  class="sub">` → `<span class="sub caption">` (12px → 0.75rem global).

**Files:**
- `web/src/lib/list/components/MembersScreen.svelte` (+ `.test.ts`)

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 5.4 ItemsScreen

**Created:** 2026-06-03T00:00:00Z
**Completed:**

**Why:** `div.rows` → `ul`, `div.row` → `li`; row-inner stays a layout div. Has
the score badge (→ `.badge-score`), the notes block (serif-italic — exception),
member-vote mono values (→ `.mono`), attribution (→ `.caption`), and an
empty-state with a CTA.

**Prerequisites:** Phase 3; task 5.1.

**Decisions:**
- `.row` → `<li class="row">`; `class:open` moves to the `<li>`; `.row.open`
  background → `.surface-alt` toggled, or a scoped layout-free state class that
  only sets background via the global token (this is a *state* background —
  acceptable as a scoped one-liner referencing the token, annotate). `row-inner`
  stays a div.
- `.item-name` → `<h3>` (15.5px → 15px global; the `.row.open .item-name`
  weight bump 600 is a state — keep as a scoped state rule on the tag, annotate,
  or accept default). `.score-badge` → `.badge .badge-score` (+ positive/
  negative); delete its scoped color/bg/radius/font. `.notes` → `.body` plus a
  scoped `font-family: …serif; font-style: italic` (annotated exception, see
  PLAN open question). `.member-vote` → `.caption`; `.mv-val` → `.mono` (+
  positive/negative state color). `.attribution` → `.caption`; the tombstone
  span keeps its scoped italic serif (annotated exception).
- Empty state → `<EmptyState icon="feather" title=… body=… ctaLabel=… onCta=…>`
  (read current copy). Delete `.empty*` CSS.
- The undo `.undo-snackbar` is ItemsScreen-specific chrome; convert its type to
  `.caption`/rem, keep positioning layout; its `background: var(--ink); color:
  var(--paper)` is a single-instance toast — annotate as exception or migrate to
  `<Snackbar>` if trivial (do not force a component extraction).

**Files:**
- `web/src/lib/item/components/ItemsScreen.svelte` (+ `.test.ts`)

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 5.5 ListsScreen

**Created:** 2026-06-03T00:00:00Z
**Completed:**

**Why:** `div.row` per list, with a `.row-top` (name + overflow) and an
expandable `.desc`. The list name is the hero → `.list-title`. Has the
illustrated empty-state with a `<CairnGlyph>` disc + CTA.

**Prerequisites:** Phase 3; task 5.1.

**Decisions:**
- `<div class="list">` → `<ul class="list">`; each `<div class="row">` →
  `<li class="row">` (keep `class:last`). `.row-top`, `.desc`, `.desc-text`
  stay layout divs/buttons.
- `<span class="name">` (inside the nav button) → `<h3 class="name list-title">`
  — `.list-title` carries the serif 1.0625rem/600 look; delete the scoped font
  block. `.desc` → `.body` (13.5px → 0.875rem) with the no-desc italic/`--stone`
  kept as a scoped state (annotate) or a `.caption` swap. `.see-toggle` and
  `.meta` → `.caption`; `.dot` color → keep as a one-liner referencing
  `--stone-lt` (tiny, annotate) or fold into `.caption` context.
- Empty state → `<EmptyState>` with the `iconContent` snippet holding
  `<CairnGlyph size={44} color="var(--stone)" />`, plus `ctaLabel`/`onCta`
  (read current copy). Delete `.empty*` CSS.

**Files:**
- `web/src/lib/list/components/ListsScreen.svelte` (+ `.test.ts`)

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 5.6 InvitesInboxScreen + InvitesBanner

**Created:** 2026-06-03T00:00:00Z
**Completed:**

**Why:** Finish the two invite components whose pills were swapped in task 4.2:
semantic markup, type → roles, empty state. `InvitesBanner.row` is a carve-out
(layout div, not a list item).

**Prerequisites:** Phase 3; tasks 4.2, 5.1.

**Decisions:**
- InvitesInboxScreen: `<div class="list">` → `<ul class="list">`; `<div
  class="row">` → `<li class="row">` (inner `.row-top`/`.row-info` stay divs).
  `.list-name` → `<h3>`; `.row-inviter` → `.caption`; `.inviter-name` weight via
  a scoped state or `<strong>`; `.when` → `.caption .mono`. Divider via global
  `.rows`/`.list` rule (rename selector or add the divider to `.list`). Empty
  state → `<EmptyState icon="inbox" title="No pending invites" body=…>` (reword
  the `<br/>` body into one sentence). Delete `.empty*` and `.loading` color
  (→ `.caption`).
- InvitesBanner: `.banner` → use `.card-alt` (delete its scoped bg/border/
  radius; keep margin/padding layout in rem). `.row` stays a `<div>` (carve-out:
  action buttons are its sibling, not inside it). `.copy` → `.body`; `.bold`/
  `.grey` → `<strong>` / `.caption` or scoped state. `.count-badge` → `.badge
  .badge-ink`; `.multi-text` → `<h3>`.

**Files:**
- `web/src/lib/invite/components/InvitesInboxScreen.svelte` (+ `.test.ts`)
- `web/src/lib/invite/components/InvitesBanner.svelte` (+ `.test.ts`)

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 5.7 TrashScreen + DeletedListsScreen

**Created:** 2026-06-03T00:00:00Z
**Completed:**

**Why:** Same `div.rows` + `div.row` pattern (icon + text + restore button),
the same `.error` toast (identical in both), and heading-only empty states.

**Prerequisites:** Phase 3; task 5.1.

**Decisions:**
- `<div class="rows">` → `<ul class="rows">`; `<div class="row">` →
  `<li class="row">` (`class:first` moves to `<li>`; the global divider
  replaces the `.row.first border-top`). `.name` → `<h3>` (15.5px/500 and 15px
  → global 15px/600). `.attribution` → `<span class="caption">`. TrashScreen's
  `.row-icon` color wrapper stays (cosmetic, allowed). `.loading` color →
  `.caption`.
- The `.error` toast is identical in both → migrate both to `<Snackbar>` (it
  exists and is already used elsewhere) OR add a global `.toast-error` to
  `controls.css` and apply it; pick one and note it. Do not leave the scoped
  `color`/`background`/`border-color`.
- Empty states → `<EmptyState icon="trash-2" title=… iconSize={44}>` (no body,
  no CTA) and `<EmptyState icon="trash-2" title="No deleted lists." iconSize={44}>`.
  Delete `.empty*` CSS.

**Files:**
- `web/src/lib/item/components/TrashScreen.svelte` (+ `.test.ts`)
- `web/src/lib/list/components/DeletedListsScreen.svelte` (+ `.test.ts`)

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 5.8 CircleScreen + BlockedScreen

**Created:** 2026-06-03T00:00:00Z
**Completed:**

**Why:** Both authored in **rem** but with their own divergent values
(0.72/0.78/0.9375 rem) and a dashed-box pattern. They converge onto the global
roles and `.card-dashed`. BlockedScreen's one-off empty state unifies onto
`<EmptyState>`.

**Prerequisites:** Phase 3; task 5.1.

**Decisions:**
- Both: `<div class="section-header">` → `<h2>` (drop the diverging 0.75rem/
  0.04em; global `h2` is 0.72rem/0.06em). `.display-name` (span) → `<h3>`. `.sub`
  → `.caption .mono` (it is a monospace count/since line; if `--stone-lt` vs
  `--stone` matters it is drift → use `.caption`). `.row`/`.row:first-child`
  dividers → global `.rows`/`.circle-list`/`.blocked-list` rule (the lists are
  already `<ul>`; add the divider to the existing list class or rename to
  `.rows`). `.description`/`.intro-text`/`.whats-this` → `.caption` / `.body` as
  fits.
- CircleScreen `.add-card` → `.card-dashed` (delete scoped border/bg/radius;
  keep margin/padding layout in rem).
- BlockedScreen `.empty-state` (dashed box) → `<EmptyState icon="slash"
  title="You haven't blocked anyone." iconSize={44}>` (no body/CTA). Delete
  `.empty-state` + `.empty-state p` CSS. This is the deliberate unification.

**Files:**
- `web/src/lib/privacy/components/CircleScreen.svelte` (+ `.test.ts`)
- `web/src/lib/privacy/components/BlockedScreen.svelte` (+ `.test.ts`)

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 5.9 AddEditItemSheet + CreateListSheet + CircleExplainerSheet + ProfileSheet

**Created:** 2026-06-03T00:00:00Z
**Completed:**

**Why:** Four sheets. Titles → `.t-sheet`/`.t-hero`; ProfileSheet name →
`.identity-name`; handles → `.sheet-handle`; the explainer hero converges to
`.t-hero`.

**Prerequisites:** Phase 3; task 5.1.

**Decisions:**
- AddEditItemSheet: `.title` (19px serif) → `<h2 class="t-sheet">`; `.sub` →
  `<p class="caption">`; `.cancel-btn` font/colour → minimal reset (keep layout);
  `.notes-field textarea` serif is an editorial exception (annotate). `.optional`
  label override (weight/transform/colour) → keep minimal or a small global
  helper; note.
- CreateListSheet: title comes from the `<Sheet>`; only `form`/`.field` layout
  here — convert `gap` to rem; nothing visual to strip. Likely a confirm-only
  task.
- CircleExplainerSheet: scoped `h2` (25.6px) → `<h2 class="t-hero">`; `p` →
  `.body`; `.point-title` → `<h3>` or `.caption`-bold; `.point-body` →
  `.caption`; `.privacy-footer` → `.card-alt` (delete bg/radius; keep padding
  layout). It uses bare `h2`/`p` element selectors in scope — replace with
  classes so global roles apply.
- ProfileSheet: `.name` → `<h2 class="identity-name">` (or `<p class="identity-name">`
  per current element; keep centred via a layout rule). `.badge` → `.badge`
  (+ a mono caption); the `.badge.circle`/`.badge.blocked` state colours
  (`--sage`/`--ember`) → `.badge-score`-style variants or annotated state
  one-liners. `.handle` → `.sheet-handle`. `.action-card` → `.card`. `.subtitle`
  opacity → `.caption`.

**Files:**
- `web/src/lib/item/components/AddEditItemSheet.svelte` (+ `.test.ts`)
- `web/src/lib/list/components/CreateListSheet.svelte` (+ `.test.ts` if any)
- `web/src/lib/privacy/components/CircleExplainerSheet.svelte` (+ `.test.ts` if any)
- `web/src/lib/profile/components/ProfileSheet.svelte` (+ `.test.ts`)

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 5.10 SettingsScreen + PrivacyScreen

**Created:** 2026-06-03T00:00:00Z
**Completed:**

**Why:** Both already use `<h2>` for section labels (good); the work is to strip
their many scoped type/border/background rules onto global roles + `.card` /
`.surface-alt` / `.badge`, normalise rem, and leave the bespoke control chrome
(theme/size pickers, segmented radio) as scoped **layout** only.

**Prerequisites:** Phase 3; task 5.1.

**Decisions:**
- SettingsScreen: `.preference-group h2` → drop the duplicated font props (global
  `h2`), keep padding (rem). `.display-name` / `.nav-row-title` → `<h3>`.
  `.nav-row-sub` / `.preview-sub` → `.caption`; `.preview-label` (11px) → global
  `h2` (converge). `.nav-row-count` → `.caption .mono`. `.theme-option` /
  `.size-card` / `.size-preview` / `.size-option`: move border/bg/colour/font to
  `.card` / `.surface-alt` + state classes; keep grid/sizing/padding as scoped
  layout (rem). The selected-state colour swaps stay as scoped state rules
  referencing tokens (annotate) — they are genuine state, not drift.
  `.skeleton-*` shimmer backgrounds are layout/animation chrome — keep.
- PrivacyScreen: `.section-label` `<h2>` already matches — drop font props, keep
  padding (rem). `.option-title` → `<h3>`; `.option-sub`/`.cascade-note`/
  `.nav-row-sub` → `.caption`. `.segmented-control` / `.nav-rows` borders →
  global rule or `.card`. `.option.selected` bg → `.surface-alt` state. `.badge`
  → `.badge .badge-soft`. `.radio-dot` / `.dot-fill` keep sizing/border as
  scoped layout (they are control chrome) but move their colour to tokens via a
  state class (annotate). `div.nav-rows` keeps its structure (NavRow extraction
  is a separate plan — Non-requirement); only its visual moves out.

**Files:**
- `web/src/lib/settings/components/SettingsScreen.svelte` (+ `.test.ts` if any)
- `web/src/lib/privacy/components/PrivacyScreen.svelte` (+ `.test.ts` if any)

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

---

## Phase 6 — Cleanup, layout-only guard, full check

### [ ] 6.1 Remove dead classes, enforce layout-only, full check + visual sweep

**Created:** 2026-06-03T00:00:00Z
**Completed:**

**Why:** After the sweeps, classes kept only to preserve test selectors
(`.section-label` on `<h2>`, etc.) and any now-empty scoped rules are dead. This
task removes them, then enforces the plan's acceptance criterion (R7) with a
grep guard, runs the full toolchain, and does the visual canvas sweep.

**Prerequisites:** All Phase 3–5 tasks complete.

**Decisions:**
- Remove `class="section-label"` from `<h2>` elements where the class is no
  longer needed by a test or a layout rule; delete empty scoped rules. The
  InvitePicker e-mail `<label>` keeps `class="section-label"` (it is a `<label>`,
  not an `<h2>`, so it needs the class to get the global look) — documented
  carve-out.
- **Layout-only guard.** Run a grep over in-scope `.svelte` `<style>` blocks for
  visual declarations and confirm only documented exceptions remain:
  ```
  git grep -nE '(font-family|font-size|font-weight|letter-spacing|text-transform|line-height|^\s*color:|background:|border[a-z-]*:\s*[^;]*var\(--(ink|stone|sage|ember|paper|rule|accent)' -- 'web/src/lib/**/*.svelte'
  ```
  (Refine the pattern as needed.) Every hit must be an annotated exception:
  EmptyState's disc; the serif-italic `.notes`/tombstone; single-instance
  toast/TopBar chrome; genuine state-colour one-liners. Each exception carries an
  inline comment naming why.
- Confirm `1px` hairline borders and `env()`/shadow values are the only
  remaining px in scoped blocks (Units rule).

**Files:**
- All Phase 5 files (modify) + a short exceptions list captured in this task's
  Notes.

**Steps:**
1. Remove dead classes and empty rules across the migrated files.
2. Run the grep guard; resolve or annotate every hit.
3. `./scripts/check.sh` — must be green. If user-visible flows changed
   materially, also `./scripts/check.sh --e2e`.
4. Open `design/Cairn - Design Canvas.html` and compare every touched screen
   for **layout/proportion** (not colour/type, which are intentionally
   homogenised): row spacing, sheet-header padding, empty-state rhythm, card
   radii, button pairs.

**Verify:** `./scripts/check.sh`
