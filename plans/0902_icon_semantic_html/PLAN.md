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
| `h2` | serif 1.125rem/500/`--ink-soft`/**normal case**/margin 0 | all `.section-label`, CircleScreen `.section-header` (0.75rem→1.125rem, **drops uppercase**). **Not** Settings `.preview-label` (that's a form sub-label → `<Label>`, not h2). |
| `h3` (also `.row-title` class) | 1rem/600/`--ink`/margin 0 | `.name` at 14/15/15.5px, `.display-name`, `.nav-row-title`, `.list-name` (inbox), `.item-name` (15.5→15), Trash `.name` (weight 500→600). Use the `<h3>` tag for names **not** inside a control; the `.row-title` **class** (same rule) for names inside a tap-target button. |
| `.t-hero` | serif 1.5rem/500/−0.01em/`--ink` | `.empty-heading` (×4, 22–24→24), CircleExplainer `h2` (25.6→24) |
| `.t-sheet` | section `h2` + `--ink` (colour-only override; inherits serif 1.125rem/500) | InvitePicker `.title` (17 sans→serif), ListOverflow `.list-name` (18), AvatarSource `.title` (18), AddEditItem `.title` (19) |
| `.list-title` | serif 1.0625rem/600/−0.005em/`--ink`/lh 1.3 | ListsScreen `.name` |
| `.identity-name` | 1.125rem/600/`--ink` | ProfileSheet `.name` |
| `.body` | 1rem/`--ink-soft`/lh 1.5 | `.empty-body`, ListsScreen `.desc`, Items `.notes`(*serif italic kept via extra scoped rule*), various 13.5–14px body |
| `.caption` | 1rem/`--stone`/lh 1.5 (set apart by colour, not size) | `.sub`, `.subtitle`, `.row-inviter`, `.nav-row-sub`, `.option-sub`, `.cascade-note`, ListOverflow `.meta`, etc. |
| `.fine` | 0.8rem/`--stone`/lh 1.5 (the one tier below the 1rem floor) | Items `.attribution` + `.member-vote`, ListsScreen `.meta` line, timestamps (`.when`). Genuinely-secondary metadata that reads fine small. |
| `.mono` | JetBrains Mono | **numerics only** — vote values, the score `<Badge>`, counts. **Not** dates: `.when` / circle-blocked `.sub` drop mono (R14). |

**Uppercase belongs to form labels, not section titles.** The upper-cased,
`0.06em`-tracked, small-stone look is the *form-label* treatment (the `<Label>`
primitive — "NAME", "NOTES", "E-MAIL ADDRESS"). It bled onto section *titles*
because both were called "labels" and the global `h2` copied the look. This
plan separates them: `<Label>` keeps uppercase; the section-title `h2` becomes
a normal-case serif heading (1.125rem/500/`--ink-soft`, margin 0). This is a
deliberate app-wide change — every section title de-upper-cases — and it is the
real fix for the `<h2 class="t-sheet">` / `<h2 class="t-hero">` over-spill (a
sheet/hero title on an `<h2>` no longer inherits any uppercase/tracking to
fight, because the tag rule no longer sets them).

Judgement calls flagged for review: collapsing the whole 11–12 px secondary
cluster onto one `.caption` (0.75 rem); making all sheet titles serif;
`.notes` (item notes) keeps a scoped `font-family: serif; font-style: italic`
on top of `.body` because the serif-italic is an intentional editorial look,
not drift — that scoped rule is an allowed exception (it is a *type* rule, but
a deliberate one with no global role; alternatively add a `.prose` role —
decide in review).

### Surfaces → `surfaces.css` (R3)

`.rows`/`.rows .row` divider model (top rule on the list, bottom rule on each
row) replaces per-file first/last border hacks. Every list container is renamed
to `class="rows"` (`.list`, `.circle-list`, `.blocked-list` included) so this
single rule covers them all. This supersedes the parent plan's "convert
`border-bottom`-as-separator to `<hr>`" decision
(`plans/0900_refactor_css_components/PLAN.md`): that predates the `<ul>`/`<li>`
migration, and `<hr>` is invalid as a direct child of `<ul>`, so a border on
each `<li class="row">` is the correct idiom for data rows. `<hr>` is kept only
for ListOverflowSheet's *action menu* (wrapped in `<li role="separator">`), not
for data lists. `.card` / `.card-alt` / `.card-dashed` (radius converges to
0.75 rem). `.surface-alt` for raised backgrounds. `.sheet-handle` for the three
sheet handles (width converges 36/40 px → 2.25 rem).

### Controls → `controls.css` (R4)

`.badge` + tone/score variants, plus `.toast-error` (the persistent error toast
duplicated byte-for-byte in TrashScreen / DeletedListsScreen — globalised whole,
visual + shared fixed positioning; kept as a plain `{#if error}` element, not
migrated to `<Snackbar>` whose auto-dismiss would change behaviour). Pill
buttons in InvitesInboxScreen / InvitesBanner are replaced by
`<Button variant="pill">` — the hand-rolled `.btn-*` CSS is deleted, not
globalised. `<Button>`'s tones today
(`primary | ink | destructive`) cannot render the design's **filled sage**
Accept button, so `<Button>` gains one minimal new tone — `sage` — that renders
*filled* in the pill variant (sage background, paper text); all other pill
tones stay outlined. Accept → `tone="sage"` (filled), Decline → `tone="ink"`
(outlined; its muted-stone outline converges onto ink, a deliberate change).
This extends the existing primitive rather than minting a new component
(reversing the earlier "reuse only, no Button change" framing — the design
demands the filled affirmative shape).

### Single-instance chrome

The rule's enemy is duplication/drift, so *repeated* visual patterns are
mandatory-global. Genuinely single-instance chrome that is visual but unique
(TopBar's `background`/`border-bottom`; the Sheet backdrop) may stay scoped —
but its **type** still moves out (TopBar's title → global `h1`). The sheet
handle repeats three times, so it goes global.

### Semantic HTML + EmptyState (R5, R6)

The sweep goes further than the original header/h2/ul/li/h3/p mapping: a
"section label" is the *title of a content group*, so each labelled group
becomes a `<section>` with that title as its `<h2>`. The structure is
deliberately minimal — a lone title stays a bare `<h2>` (no `<header>` wrapper
around a single heading); a `<header>` appears only where the intro carries more
than the title (the sheet headers: title + subtitle); and a `<footer>` holds
trailing notes (PrivacyScreen's cascade-note, "What's this?" links). A single
unlabelled list is not sectioned (a `<section>` should have a heading). The
InvitePicker "By e-mail" caption is both the e-mail section's intro and the
label for its one input, so it reuses the 0901 `<Label>` primitive (which
renders the upper-cased form-label look as a real `<label>` — correct here,
since the caption *is* the input's label) — this dissolves the "floating
section-label class" problem without minting a global `.section-label` class. The cross-screen `<section>`/`<header>`/`<footer>` convention is recorded
in `docs/ui.md` by Phase 0 so later screens inherit it. Empty states migrate to
the shared `<EmptyState>`, which is the legitimate home for the empty-state
visual and uses the `.t-hero`/`.body` roles. BlockedScreen unifies onto the one
look (deliberate change). **Row names stay phrasing inside a control.** Where
the row's whole body is the tap target (Members' `<button class="row">`, Items'
`<button class="row-tap">`, Lists' row-nav `<Button variant="text">`), the name
is a `<span>` carrying the role class (`.row-title`, or `.list-title` for the
Lists hero), **not** an `<h3>` — a heading is invalid as a `<button>`
descendant, is folded into the button's accessible name rather than exposed to
AT heading-navigation, and the linter won't catch it. `<h3>` is used only for
row names not nested in a control (Inbox / Trash / Deleted-lists rows, whose
action button is a sibling). This matches the parent plan's `0900` R12.

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
`DeleteItemSheet`, `DeletedListsScreen`, `CreateListSheet`, `CircleScreen`,
`BlockedScreen`, `PrivacyScreen`, `CircleExplainerSheet`, `SettingsScreen`,
`ProfileSheet`, `TopBar`, `EmptyState` (rem conversion). Each loses its scoped
visual CSS,
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
   `EmptyState` to rem and the new roles; extend `<Button>` with the `sage`
   filled-pill tone the Accept button needs (task 3.5). Foundation for every
   sweep.
4. **Phase 4 — Shared chrome + Button reuse.** Sheet handle → global; TopBar
   title → `<h1>` (its wrapper `<div>` kept as layout, renamed `.centre` →
   `.middle`, subtitle as a sibling `<p>`); replace InvitesInbox/InvitesBanner
   hand-rolled pills with `<Button>`.
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
7. **Phase 7 — separators, row/field, NavRow (R9–R11).** [appended after
   Phase 6 shipped — see "Scope change 2" below.] Reconcile the master plan +
   `docs/ui.md` to the borders-not-`<hr>` decision; remove every `<hr>`
   (`ListOverflowSheet` action menu, `PrivacyScreen` divider) in favour of CSS
   borders and drop the dead `hr` reset; lift the duplicated flex-line
   (`.media`) / `.field` layout blocks to global utilities in `surfaces.css`;
   extract a `<NavRow>` shared component and migrate Settings/Privacy onto it.
8. **Phase 8 — components + fixes: `<Badge>`, `<InviteCard>`, date prose, avatar
   alignment (R12–R15).** [appended — see "Scope change 3" below.] Reconcile docs
   (mono = numerics, dates are caption prose; record the new components); extract
   `<Badge>` and migrate the four badge sites + the Settings invites count;
   extract `<InviteCard>` and migrate the inbox rows + the single-invite banner
   (one avatar size, banner gains the date); drop `.mono` from the circle/blocked
   date labels; fix the avatar baseline misalignment (photos rendering higher
   than initials) with `vertical-align: middle`.

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

## Scope change 2 — separators, row/field, NavRow (Phase 7, R9–R11)

Appended after Phase 6 shipped, while reviewing what step 9 forgot. Three
threads, all on-theme for "kill the copy-paste, one home per pattern":

- **Separators (R9).** The master plan's step-9 bullet 4 said "replace
  `border-bottom`-as-separator with `<hr>`." R3 already half-reversed this for
  data rows (a border per `<li class="row">`, since `<hr>` is invalid in a
  `<ul>`) but **kept `<hr>` for the `ListOverflowSheet` action menu**. On
  reflection that carve-out is wrong too: a divider is presentational, not
  semantic, and the surviving `<li role="separator"><hr/></li>` is a validity
  hack. Decision (with the user): remove `<hr>` entirely, use CSS borders
  everywhere, and delete the dead global `hr` reset. The master plan and
  `docs/ui.md` are reconciled to record this (Phase 7's first, doc task — the
  Phase 0 pattern applied to appended work).

- **`.media` / `.field` (R10).** R7 made scoped CSS layout-only, but two *layout*
  blocks are still copy-pasted across many files. The horizontal flex line is a
  media object (Sullivan, 2010); `class="row"` conflates it with the list-item /
  divider unit — they coincide in simple rows but split apart in expandable ones
  (Items / Lists / InvitesInbox put the flex line on a child, not the `<li>`).
  So `.row` stays the divider unit and a new **lean** `.media`
  (`display: flex; align-items: center` + `gap`, nothing else) carries the flex
  line, applied to every flex line (the simple `<li>`s and the expandable rows'
  inner lines alike); the `.media-*` namespace is reserved for future variants.
  `.field` lands likewise. Keep only genuine per-file deltas scoped, and **never**
  put the flex-line layout on the global `.row` (it would flex the expandable
  outer wrappers and break them).

- **`<NavRow>` (R11).** 0902 deliberately deferred this ("separate plan") and
  only globalised the nav-row *visual* CSS, leaving the nav-row *structure*
  duplicated across Settings/Privacy (InvitesInbox renders data rows, not
  nav-rows — it is not a consumer). We now pull the extraction
  in: a `shared/` `<NavRow>` wrapping the existing `<Button>`, owning the
  nav-row layout and the inter-row border (which re-homes the `PrivacyScreen`
  `<hr>` R9 removes); a shared global `.nav-rows` container class draws the
  full-bleed band, applied to **every** nav-row group (Settings' included, so
  they match Privacy's grouped-list look). Mirrors `<EmptyState>`'s tier and
  test placement.

Separator swaps are the same hairline in the same place, with one deliberate
addition: SettingsScreen's grouped nav-rows (People: Invites / Privacy) gain the
inter-row hairline they lack today, so every nav-row group reads alike — that is
the homogenisation goal, not a regression. `<NavRow>` otherwise preserves the
existing tap target and look. Doc reconciliation lands first so downstream steps
don't read the stale `<hr>` prescription.

## Scope change 3 — `<Badge>`, `<InviteCard>`, date prose (Phase 8, R12–R14)

Appended after Phase 7 — three more dedup/homogenise threads the original plan
deferred or missed:

- **`<Badge>` (R12).** R4 globalised the badge *CSS* but listed a `<Badge>`
  *component* as a Non-requirement. Pulled in now: a `basic/` `<Badge>` (tones
  `ink` / `soft` / `score`±) wrapping the existing `.badge*` classes, adopted at
  all four badge sites — and the SettingsScreen invites count, today plain mono
  text, is promoted to an `ink` badge. Tone semantics: `ink` = attention /
  notification count, `soft` = informational count, `score` = the sage/ember
  aggregate.

- **`<InviteCard>` (R13).** The single-invitation presentation is hand-rolled
  twice (inbox rows + the single-invite banner) and has drifted — different
  avatar sizes and, oddly, no date on the banner. One `invite/` `<InviteCard>`
  (avatar + inviter line + date + Accept/Decline) serves both; the banner gains
  the date and both converge on a 36px avatar. It is presentational — accept /
  decline data logic stays in each consumer.

- **Date prose (R14).** `timeAgo`/date labels are prose, but `.mono` is applied
  to a date at only two of seven sites. Dates drop `.mono` (→ `.caption` /
  `.fine`); `.mono` is reserved for numerics (vote values, score, counts). No
  `.date` class — `.caption` / `.fine` already cover secondary metadata.

- **Avatar alignment (R15).** A live bug surfaced while reviewing: on the Lists
  screen the overlapping member avatars are misaligned — photos render higher
  than initials, because `Avatar` is `inline-flex` with no `vertical-align` and
  the photo/initials baselines differ in the inline stack. Fixed at the root with
  `vertical-align: middle` on the shared avatar style (a no-op where the avatar
  is a flex child, so the other screens are untouched).

All on-theme for step 9 (kill duplication, one home per pattern); R15 is a small
companion bug fix. Doc reconciliation lands first (Phase 8's first task).
