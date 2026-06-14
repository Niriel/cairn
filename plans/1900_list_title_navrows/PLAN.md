# Plan: List-title nav-rows on the Lists screen

Make each list title on the Lists screen render as the shared `NavRow`
(full-width tap target + trailing chevron) and move the per-list "More" button
into the extra-info block beneath the title. The current title is a bare text
`<Button>` with no chevron — it acts like a nav-row but doesn't look like one,
which reads as plain text rather than a "go here" affordance.

## Context

`web/src/lib/list/components/ListsScreen.svelte` renders each list as an
`<li class="row">` with three stacked parts:

1. `.row-top` — a flex row: the title `<Button variant="text" tone="ink">`
   (label = `<span class="name row-title">{item.name}</span>` + optional public
   globe, navigates to `/lists/{id}`) and, inline to its right, a `MoreButton`
   that opens the overflow sheet. `.row-top` carries a dashed `border-bottom`.
2. `.desc` — the toggleable description button (see-more/see-less via
   `expandedIds` / `truncatedIds` / `descTextEls` / `toggleDesc`) or a
   "(no description)" placeholder.
3. `.meta .fine` — item count · `timeAgo(modified_at)` · member avatars.

Adjacent list rows are separated only by the global `.rows .row { border-bottom }`
rule in `web/src/lib/shared/styles/surfaces.css`; the dashed line is a
*within-row* separator on `.row-top`.

The shared `NavRow` (`web/src/lib/shared/components/NavRow.svelte`) is the
project's standard navigation row: a `.nav-row` div wrapping a full-width
`<Button variant="text">` that renders `lead()` → `.nav-row-text` (title +
optional sub) → optional `trailing()` → always a `chevron-right` icon. Today
`lead` is a **required** snippet, and every caller (`SettingsScreen`,
`PrivacyScreen`) passes one.

**Relationship to the design mockup.** The design canvas
(`design/cairn-screens.jsx:404-446`, ListsScreen) shows each list as a single
flex row — leading icon · text column (name / description / meta) · one trailing
chevron centred against the *whole* column — with **no per-list ⋮ button** and
**no dashed within-row rule**. This plan deliberately departs from that mockup
on three counts, and the departures are driven by `docs/ui.md` and the existing
implementation rather than the JSX:

- The chevron sits beside the **title only** (inside the title `NavRow`), not
  against the whole row, because `docs/ui.md` ("Lists screen") splits the row
  into two tap targets — *tap the name → navigate*, *tap the description →
  expand* — so the name and the description cannot share one button. The title
  becomes the nav-row; the description stays a sibling toggle below it.
- The per-list **⋮ "More" button** (R4) and the **dashed in-row rule** (R5)
  exist in the current implementation (and the ⋮ is mandated by `docs/ui.md`
  "Bin & undo") but are absent from the mockup, so their placement is a
  plan-chosen answer the design is silent on — not a value read from the JSX.

The leading icon the mockup shows is seed-only (lists have no icon field — see
the R-level non-requirement).

## Decisions

**Reuse `NavRow`; make `lead` optional rather than restyle a bare Button.**
The user wants the title to be a real nav-row for visual consistency with the
rest of the app, not a hand-styled lookalike that can drift. The blocker is
that `NavRow.lead` is required and lists have no icon. The fix is a one-line
contract relaxation: `lead?: Snippet` guarded by `{#if lead}`. All existing
callers pass `lead`, so this is backward-compatible (R2). A bare-Button
lookalike was considered and rejected: it would duplicate the chevron/tap
styling and risk diverging from `NavRow` over time.

**Title nav-row holds only the name; description/metadata/More live below it.**
A `NavRow` is a single full-width tap-target button. The description is itself
an interactive toggle button and the metadata contains avatars — neither can be
nested inside the nav-row's button (invalid HTML, and they're separate tap
targets). So the nav-row wraps just the title, and the description + metadata +
More button sit in a sibling `.extra` block beneath it.

**Public marker goes in `trailing`, not in the title.** `NavRow.title` is a
plain string, so the globe can't sit mid-title. The `trailing` snippet renders
it just before the chevron (R3). This is a minor visual shift (globe near the
chevron rather than hugging the name) and is consistent with how `SettingsScreen`
uses `trailing` for badges. Reworking `NavRow` to take a title *snippet* was
considered and rejected as out of scope.

**Reconcile nav-row padding by zeroing `.row` padding.** `NavRow`'s inner
`Button` is `variant="text" size="md"`, which carries `padding: 0.75rem 1.125rem`
(`Button.svelte` `.text.size-md`). If the `<li class="row">` also kept its
`0.875rem 1.125rem` padding, the title text would be indented twice as far as
the description below it. So `.row` drops to `padding: 0`; the nav-row's own
button padding provides the title's top/left inset, and the `.extra` block gets
matching horizontal padding (`1.125rem`) plus a bottom inset so the description
and metadata align under the title and the inter-row rhythm is preserved (R1).

**More button is absolutely positioned in `.extra`.** Pinning it top-end with
`position: absolute` (inside a `position: relative` `.extra`) keeps it visually
at the top-right without reserving a flex column that would squeeze the
description and metadata. `.extra` gets enough `padding-right` that the
ellipsizing description never runs under the button (R4). The trade-off: that
right inset also gutters the metadata line and every line of an *expanded*
(multi-line) description, not just the first line under the button — accepted,
confirmed in the visual verify.

**Long list names wrap; the chevron stays pinned to the top.** Dropping `.name`
loses its `white-space: normal; overflow-wrap: anywhere;`, so the wrap rule
moves onto `NavRow`'s `.nav-row-title` (see Modified files). But `NavRow`'s inner
`<Button>` inherits `align-items: center` (`Button.svelte`), so a wrapped
multi-line title would centre the trailing globe and the `chevron-right` against
its midpoint — contradicting `docs/ui.md` "Row navigation pattern", which
requires `align-items: flex-start` exactly so the chevron tracks the top of a
multi-line name. So the `NavRow` button also gets `align-items: flex-start`. This
is harmless to single-line labels (top == centre) but does shift the lead
icon / trailing Badge / chevron on the two-line title+sub Settings/Privacy rows
from centre to top — verify those still read well, and scope the rule to the
lead-less case if they regress.

**The dashed rule goes full-bleed.** Separately, moving
the dashed rule from `.row-top`'s `border-bottom` (inset by `.row`'s old
padding) to `.extra`'s `border-top` with `.row { padding: 0 }` makes it
full-bleed — accepted, and consistent with the full-bleed solid per-row divider.

## Architecture

Front-end only; no DB / RLS / API changes. All three test layers are not in
play — only Vitest (component) and a Playwright touch (existing e2e already
covers the navigation flow).

### Modified files

- **`web/src/lib/shared/components/NavRow.svelte`** — make `lead` optional
  (`lead?: Snippet`, guard the render with `{#if lead}`). Also give
  `.nav-row-title` `white-space: normal; overflow-wrap: anywhere;` so a long
  list name wraps instead of inheriting the Button base `nowrap` and
  overflowing into the chevron (harmless to the short Settings/Privacy labels),
  and add `align-items: flex-start` to the nav-row button so the chevron stays
  at the top of a wrapped multi-line title (per `docs/ui.md` "Row navigation
  pattern") rather than centring against it.
- **`web/src/lib/shared/components/NavRow.test.ts`** — add a case asserting the
  row renders (title + chevron, no leading slot) when `lead` is omitted.
- **`web/src/lib/list/components/ListsScreen.svelte`** — replace the title
  `<Button>` + inline `MoreButton` with a `NavRow` (title = name, `trailing` =
  public marker, `onclick` = navigate) followed by a sibling `.extra` block
  holding the absolutely-positioned `MoreButton`, the description block, and the
  metadata; reconcile CSS (zero `.row` padding, new `.extra` rule carrying the
  retained dashed `border-top`, `.more` positioning); remove the now-dead
  `.row-top` rule.
- **`web/src/lib/list/components/ListsScreen.test.ts`** — confirm the preserved
  selectors (`list-nav-`, `list-overflow-`, `list-desc-`, `list-public-marker-`,
  item-count text) still pass; adjust if the DOM-move breaks a query; **and**
  add a case asserting each row now renders a `.nav-row` (the new affordance is
  the feature, so it gets a regression-guarding test — `NavRow`/`Button`/`Icon`
  are not mocked in this file, so the real `.nav-row` wrapper renders).

### Row structure, before → after

```
before:  <li.row>                          after:  <li.row>            (padding:0)
           <div.row-top>  (dashed border)            <NavRow>          name + trailing globe + chevron
             <Button> name + globe                   <div.extra>       (relative; dashed border-top)
             <MoreButton>                               <MoreButton>    (absolute, top-end)
           <button.desc> / <div.no-desc>               <button.desc> / <div.no-desc>
           <div.meta>                                   <div.meta>
```

## Phase structure

TDD ordering: the `NavRow` contract change ships RED-before-GREEN with its own
test; the Lists-screen change is verified against the existing (preserved)
selector tests, with a visual/manual check for the layout that unit tests can't
assert (absolute positioning, alignment, ellipsis clearance).

0. **Phase 0 — doc reconciliation.** Moving the public-list globe into the
   nav-row `trailing` slot puts it at the right edge next to the chevron, which
   contradicts `docs/ui.md`'s statement that the globe "sits immediately after
   the list name." Update that bullet before the code lands, so the spec
   matches what ships (R3). Doc-only; no code.
1. **Phase 1 — make `NavRow.lead` optional.** Add a failing Vitest case for a
   lead-less `NavRow`, then relax the prop type and guard the render (R2).
2. **Phase 2 — restructure the Lists-screen row.** Swap the title Button for a
   `NavRow`, move the `MoreButton` into a new `.extra` block pinned top-end,
   retain the dashed in-row rule, and reconcile padding so the title aligns with
   the description. Verify the preserved `data-test` hooks still pass and
   manually confirm the layout (R1, R3, R4, R5, R6).

## Reference docs and skills

- **`docs/ui.md`** — "Where CSS lives: layout local, visual global" and nav-row
  band conventions; layout stays in the component's scoped `<style>`.
- **`docs/frontend-layout.md`** — `src/lib/` tier split and filename rules.
- **`design/cairn-screens.jsx`** (ListsScreen) — layout reference: each list is
  a nav-row-shaped row with a trailing chevron; leading icon is seed-only.
- **`.claude/skills/writing-tasks.md`** — Vitest tests assert user-visible
  behaviour, not internals.

## Open questions

None. Lead-icon (none) and dashed-rule (kept) were both resolved with the user
during planning.
