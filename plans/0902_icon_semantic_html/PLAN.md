# Plan: Semantic HTML + global visual system (homogenisation)

0902 completes the step-9 CSS refactor started in 0901. 0901 extracted the
form primitives (`<Button>`, `<TextInput>`, `<Textarea>`, `<Label>`). 0902
attacks the structural and visual scaffolding: it makes the markup semantic
(`<header>` / `<h1>`–`<h3>` / `<ul>` / `<li>`), and lifts **all** visual
styling — type, color, borders, backgrounds, badges — into global CSS so each
component's scoped `<style>` is layout-only.

## Scope change (read this first)

This plan was originally written conservatively: "lift recurring typography
into globals, migrate a handful of div patterns, no user-visible behaviour
changes, match the original look per page." During execution the user
re-scoped it. The screen inventory's CSS is **slop** — copy-pasted out of the
`design/` JSX during prototyping, drifting per-file ever since. The real goal
is to remove that slop layer wholesale: one source of truth per visual role,
in global CSS, with scoped blocks reduced to layout. Convergence of drifted
values is the point, so **this plan deliberately changes some pixels on
screen.** The governing rule now lives in `docs/ui.md`:

- "Where CSS lives: layout local, visual global"
- "Units: rem for the type scale, em for local scaling, px for hairlines"

Tasks 1.1 (typography lift) and 2.1 (`<EmptyState>` extraction) shipped under
the original framing and are compatible; they remain as Phases 1–2. The new
work is Phases 3 onward. Phase 3 *re-opens* `typography.css` (1.1 wrote px
values; they convert to rem and the role set expands) — this supersedes 1.1's
output rather than editing the completed task.

## Context

After 0901, screens use proper form primitives but the surrounding markup is
div-soup, and each component re-declares its own fonts/colors/borders. The
inventory (gathered for this rewrite) found, among others:

- **Names** at 14 px (InvitePicker), 15 px (Members, DeletedLists), 15.5 px
  (Items, Trash), 17 px (Lists), 18 px (Profile) — mostly accidental drift.
- **Sheet titles** at 17/18/19 px, some serif some sans; **hero headings** at
  24 px (empty states) and 25.6 px (explainer sheet).
- **Section labels** as `h2` (11.5 px) in some files, `.section-header`
  (0.75 rem, 0.04em) in others.
- **Row dividers** (`1px solid var(--rule)` + first/last hacks) re-declared in
  ~8 files; the **dashed empty-state disc** duplicated in 4; **pill buttons**
  hand-rolled in 2 (while InvitePicker uses the real `<Button>`).
- A **px/rem split**: privacy/circle/blocked authored in rem, the rest in px —
  and the rem ones diverge too (0.72/0.75/0.78/0.84/0.9375 rem).

## Decisions

### Unit policy (R1)

rem is the default (activates the dead Settings font-size control); em for
sub-elements that must track their local font-size (icon beside a label); px
only for hairlines/shadows/fixed measures. px→rem at base 16: 11.5→0.72,
12→0.75, 13.5→0.84, 14→0.875, 15→0.9375, 17→1.0625, 18→1.125, 22→1.375,
24→1.5.

### Type scale → `typography.css` (R2)

One rule per role; no component re-declares type. Mapping of current selectors
onto roles:

| Role | Value | Absorbs (current → converged) |
|------|-------|-------------------------------|
| `h1` | serif 1.375rem/500/−0.01em/`--ink` | TopBar `.centre` |
| `h2` | 0.72rem/600/0.06em/uppercase/`--stone` | all `.section-label`, CircleScreen `.section-header` (0.75rem→0.72rem, 0.04em→0.06em), Settings `.preview-label` (11px) |
| `h3` | 0.9375rem/600/`--ink` | `.name` at 14/15/15.5px, `.display-name`, `.nav-row-title`, `.list-name` (inbox), `.item-name` (15.5→15), Trash `.name` (weight 500→600) |
| `.t-hero` | serif 1.5rem/500/−0.01em/`--ink` | `.empty-heading` (×4, 22–24→24), CircleExplainer `h2` (25.6→24) |
| `.t-sheet` | serif 1.125rem/500/`--ink` | InvitePicker `.title` (17 sans→serif), ListOverflow `.list-name` (18), AvatarSource `.title` (18), AddEditItem `.title` (19) |
| `.list-title` | serif 1.0625rem/600/−0.005em/`--ink`/lh 1.3 | ListsScreen `.name` |
| `.identity-name` | 1.125rem/600/`--ink` | ProfileSheet `.name` |
| `.body` | 0.875rem/`--ink-soft`/lh 1.5 | `.empty-body`, ListsScreen `.desc`, Items `.notes`(*serif italic kept via extra scoped rule*), various 13.5–14px body |
| `.caption` | 0.75rem/`--stone`/lh 1.5 | `.sub`, `.subtitle`, `.meta`, `.attribution`, `.row-inviter`, `.nav-row-sub`, `.option-sub`, `.cascade-note`, `.when`, ListOverflow `.meta`, etc. (11–12px / 0.72–0.78rem cluster) |
| `.mono` | JetBrains Mono | vote values, `.score-badge` text, `.nav-row-count`, `.when`, circle/blocked `.sub` |

Judgement calls flagged for review: collapsing the whole 11–12 px secondary
cluster onto one `.caption` (0.75 rem); making all sheet titles serif;
`.notes` (item notes) keeps a scoped `font-family: serif; font-style: italic`
on top of `.body` because the serif-italic is an intentional editorial look,
not drift — that scoped rule is an allowed exception (it is a *type* rule, but
a deliberate one with no global role; alternatively add a `.prose` role —
decide in review).

### Surfaces → `surfaces.css` (R3)

`.rows`/`.rows .row` divider model (top rule on the list, bottom rule on each
row) replaces per-file first/last border hacks. `.card` / `.card-alt` /
`.card-dashed` (radius converges to 0.75 rem). `.surface-alt` for raised
backgrounds. `.sheet-handle` for the three sheet handles (width converges
36/40 px → 2.25 rem).

### Controls → `controls.css` (R4)

`.badge` + tone/score variants. Pill buttons in InvitesInboxScreen /
InvitesBanner are replaced by the existing `<Button variant="pill">` — the
hand-rolled `.btn-*` CSS is deleted, not globalised.

### Single-instance chrome

The rule's enemy is duplication/drift, so *repeated* visual patterns are
mandatory-global. Genuinely single-instance chrome that is visual but unique
(TopBar's `background`/`border-bottom`; the Sheet backdrop) may stay scoped —
but its **type** still moves out (TopBar `.centre` → global `h1`). The sheet
handle repeats three times, so it goes global.

### Semantic HTML + EmptyState (R5, R6)

Mappings unchanged from the original (header/h2/ul/li/h3/p-or-span). Empty
states migrate to the shared `<EmptyState>`, which is the legitimate home for
the empty-state visual and uses the `.t-hero`/`.body` roles. BlockedScreen
unifies onto the one look (deliberate change).

### Acceptance (R7)

The final task greps every in-scope `.svelte` for visual declarations inside
`<style>` and confirms only documented exceptions remain. This is the
machine-checkable definition of "scoped = layout-only".

## Architecture

### New / reopened global stylesheets

- **`typography.css`** (reopened) — rewritten in rem with the full role set
  above. Imported already by the app entry.
- **`surfaces.css`** (new) — list dividers, cards, raised surfaces, sheet
  handle. Imported alongside `typography.css`.
- **`controls.css`** (new) — badge looks. Imported alongside.

Find the existing global-CSS import site (where `typography.css`/`tokens.css`
are pulled in — `+layout.svelte` or `app.css`/entry) and add the two new
sheets there.

### Modified components

Every file in the R5 list: `InvitePickerSheet`, `InvitesInboxScreen`,
`InvitesBanner`, `ListOverflowSheet`, `MembersScreen`, `ListsScreen`,
`AvatarSourceSheet`, `ItemsScreen`, `TrashScreen`, `AddEditItemSheet`,
`DeletedListsScreen`, `CreateListSheet`, `CircleScreen`, `BlockedScreen`,
`PrivacyScreen`, `CircleExplainerSheet`, `SettingsScreen`, `ProfileSheet`,
`TopBar`, `EmptyState` (rem conversion). Each loses its scoped visual CSS,
converts remaining layout to rem/em, goes semantic, and (where applicable)
migrates its empty state and adopts `<Button>`.

## Phase structure

0. **Phase 0 — reconcile docs.** `docs/ui.md` already gained the two
   conventions ("Where CSS lives", "Units") and had its px specs partly
   touched during the discussion. Phase 0 finishes the doc: convert the
   TopBar/empty-state/CSS-convention pixel specs that are now canonical to rem,
   and note the type roles so the doc and `typography.css` agree.
1. **Phase 1 — Typography lift.** [shipped] Global `h1/h2/h3/ul/ol` (px).
2. **Phase 2 — `<EmptyState>` extraction.** [shipped].
3. **Phase 3 — Global visual system.** Rewrite `typography.css` in rem + full
   role set; create `surfaces.css` and `controls.css`; wire imports; convert
   `EmptyState` to rem and the new roles. Foundation for every sweep.
4. **Phase 4 — Shared chrome + Button reuse.** Sheet handle → global; TopBar
   `.centre` → `<h1>`; replace InvitesInbox/InvitesBanner hand-rolled pills
   with `<Button>`.
5. **Phase 5 — Per-component sweeps.** One task per file/group: semantic HTML,
   strip scoped visual (adopt global roles/classes), convert layout to rem/em,
   migrate empty state if present. InvitePickerSheet is the canonical first
   task. Order: 5.1 InvitePickerSheet · 5.2 ListOverflowSheet + AvatarSourceSheet
   · 5.3 MembersScreen · 5.4 ItemsScreen · 5.5 ListsScreen · 5.6
   InvitesInboxScreen + InvitesBanner · 5.7 TrashScreen + DeletedListsScreen ·
   5.8 CircleScreen + BlockedScreen · 5.9 AddEditItemSheet + CreateListSheet +
   CircleExplainerSheet + ProfileSheet · 5.10 SettingsScreen + PrivacyScreen.
6. **Phase 6 — Cleanup + guard + check.** Remove dead classes; the
   layout-only grep guard (R7); `./scripts/check.sh`; visual canvas sweep of
   every touched screen against `design/` (judging layout/proportion, since
   colors/type are now intentionally homogenised, not matched to the JSX).

## Reference docs and skills

- `docs/ui.md` — "Where CSS lives", "Units", empty-state pattern, TopBar spec.
- `docs/frontend-layout.md` — tier rules; test files next to routes omit `+`.
- `docs/testing.md` — Vitest for behaviour; Playwright regression net.
- `docs/quality.md` — lint/format/type-check toolchain.
- `design/cairn-screens.jsx` / `cairn-ui.jsx` — **layout** reference only;
  colors/type come from tokens + global CSS (per the updated `CLAUDE.md`).

## Open questions

- Final value tuning (the `.caption` collapse; serif sheet titles;
  `.notes` serif-italic as exception vs a `.prose` role) — resolved in review
  of this plan / Phase 3.
