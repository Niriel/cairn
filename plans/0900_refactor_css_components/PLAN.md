# Plan: Refactoring pass — repeating CSS into components

Step 9 of the master plan — the audit-driven CSS cleanup that turns
the recurring shapes accumulated across steps 4–8 into proper
primitives. This plan is an **orchestration plan** in the `0N00`
mould: `0900_refactor_css_components` lands no implementation
itself; it cuts and merges two sub-branches (`0901`, `0902`) that
each carry a coherent slice of the refactor.

## Context

After step 8 the web app has the full product surface for v1: lists,
items, votes, settings, avatars, soft-delete, invites, circles,
blocks, and members. Every screen reaches for the same handful of
shapes — and reaches *past* the existing primitives every time
because `<Button>` covers only the filled-rectangle role and there
is no `<TextInput>` / `<Textarea>` / `<Label>` at all. The result is
a slow drift: each screen copy-pastes a slightly different shape of
the same idea, and visual consistency is enforced by `git grep`
rather than by code.

The audits across `web/src/lib/**/components/*.svelte` and
`web/src/routes/**/*.svelte` confirm four areas worth consolidating.
The numbers below are from the planning-time audit.

- **Buttons.** `Button.svelte` covers only filled-rect
  `primary`/`ghost`/`destructive` shapes. Every other shape is a
  raw `<button>`: ~25 distinct call sites, ~6 recurring CSS shapes
  (filled-rect, outlined-pill, ghost-text + tone variants,
  full-width row, icon-only).
- **Inputs.** No shared input primitive at all. ~11 raw `<input>` /
  `<textarea>` sites repeat the same
  `padding: 12px 14px; border: 1px solid var(--rule);
  border-radius: 12px; font-size: 16px; …` block, each with its own
  label / hint / error scaffold.
- **Icon colour wrappers.** `Icon.svelte` strokes with
  `currentColor` and has no `color` prop. The audit found one
  purely-cosmetic wrapper (`.row-icon` in `TrashScreen`) and three
  layout-bearing ones (`.icon-wrap` in `DeleteItemSheet`,
  `.icon-disc` in `LoginCheck`, the spin wrapper in `RefreshButton`)
  that carry real layout and stay.
- **Semantic HTML scaffolding.** `<div class="section-label">`,
  `<div class="rows">`, `<div class="row">`, `<div class="name">`,
  `<div class="sub">` recur across 7+ files instead of `<h2>`,
  `<ul>`, `<li>`, `<header>`. `InvitePickerSheet.svelte` is the
  canonical case. Per-screen CSS re-implements typography that
  should live once at the top level keyed off semantic tags. The
  same sweep extracts an `<EmptyState>` for the dashed-circle empty
  pattern duplicated across 5 screens.

The master plan places this step deliberately between invites UI
(step 8) and account deletion (step 10): the screen inventory is
stable enough by step 8 to see which CSS blocks are genuinely
recurring versus one-offs, and doing the consolidation before
steps 10–14 add more screens means those later screens are built
on the consolidated primitives rather than retrofitting them.

## Decisions

**Orchestration in two sub-plans, not four and not a single
branch.** The natural cleavage line is *form primitives* (buttons
and inputs are both form-shape primitives, both live under
`basic/components/`, and their migration touches roughly the same
screens) versus *icon colour + semantic HTML* (which both pull in
the same screen files because both edits are about how the screen
markup reads). Four sub-plans would be too granular — the
form-primitive halves can't ship cleanly without each other, and
the icon `color` prop change is one prop on one file. One branch
would be too coarse — the migration spans ~30 files in each half,
and reviewing the form-primitive shape together with the
semantic-HTML sweep would conflate two different review concerns
(API design vs. markup cleanup). Two sub-branches is the chosen
balance. (Decided in the planning AskUserQuestion pass.)

**`<TextInput>` + `<Textarea>` + `<Label>`, not a compound
`<Field>` wrapper.** Three small primitives composed at call sites
gives a minimal API surface and matches how raw inputs are wired
today. A compound `<Field label hint error>` wrapper was considered
and rejected: it would own the input-label-error rail as a unit,
which is convenient at the call site but stretches one component
to do three jobs (typography, layout, validation surface). The
chosen shape keeps each primitive single-purpose; hint / error text
is a plain `<p class="hint">` styled by a global rule (R6). (Decided
in the planning AskUserQuestion pass.)

**Typography lifts to global rules keyed off semantic tags, not to
new shared components.** The recurring `.section-label`, `.name`,
`.nav-row-title`, etc. typography is repeated across 7+ files with
slight drift between them. Lifting them to `h2`, `h3` rules in
`typography.css` means the tag itself carries the style; the
semantic-HTML refactor (R12) then gets the type-correct rendering
for free. Two alternatives were considered: (a) keep typography in
classes, just add semantic tags — safer, but the duplication
stays, and (b) introduce typography-bearing components
(`<SectionLabel/>`, `<SheetHeader/>`) — heavier abstraction for
small typography rules. The global-rules approach has the lowest
abstraction overhead and uses HTML semantics for what they're for.
(Decided in the planning AskUserQuestion pass.)

**The `.name` class is overloaded — resolve per call site, not by
forcing one global definition.** Today `.name` is 14 px in
member-list contexts and 17 px in list-title contexts. Forcing one
global value would either shrink the list-title (regression) or
swell the member-name (regression). The plan accepts the audit
finding and resolves per file: 17 px list-title → `<h3>` (or a
scoped `.list-title` class); 14 px member-name → `<span>` with
contextual typography from the parent. Same rule applies to any
class whose effective typography drifts between files.

**Layout-bearing icon wrappers stay.** `.icon-wrap` in
`DeleteItemSheet` (40 × 40 disc with `--ember-bg`), `.icon-disc` in
`LoginCheck` (84 × 84 disc with `--sage-bg`), the spin wrapper in
`RefreshButton`. These are not purely cosmetic — they carry sizing,
background, border-radius, and (in `RefreshButton`'s case) an
animation hook that has to live on a wrapper, not on the icon
itself. Removing them in the name of "no more wrappers" would lose
layout. Only the pure-colour wrappers go (R10).

**One-off shapes stay inline.** The audit catches four
single-occurrence shapes — VoteControl thumb, Accordion header
toggle, `(see more)` expander, Snackbar `.action`. Minting a
`<Button>` variant for any of them would explode the API for one
caller. Per the master plan rule, they remain raw `<button>`
elements.

**`<EmptyState>` lives in `shared/`, not `basic/`.** The empty
state carries application styling (the dashed icon disc, the body
copy typography, the optional CTA) that is Cairn-specific, not
framework-primitive. Per `docs/frontend-layout.md` tier rules,
`basic/` is for primitives that could move to another app
unchanged; `shared/` is for application-shaped primitives. The
empty state is the latter.

**No Phase 0 doc reconciliation expected.** The refactor does not
alter any documented contract. `docs/frontend-layout.md` already
names `typography.css` as the home for type rules and the
tier-split already accommodates the new primitives.
`docs/ui.md` does not pin the typography of any of the surfaces
being changed. If the 0902 sweep surfaces a real divergence, it
lands a Phase 0 on `0902` itself rather than back-patching this
plan.

**British / US English split.** Per CLAUDE.md. Anything a user
reads on screen is British (the copy that is being moved around,
not changed); identifiers, classes, props stay US (`color`,
`destructive`, `placeholder`). No change here — the refactor
shuffles markup, not copy.

## Architecture

### Branches

```
main
 └─ 0900_refactor_css_components       ← this plan's branch
     ├─ 0901_form_primitives            ← merges back into 0900
     └─ 0902_icon_semantic_html         ← merges back into 0900
```

### New plan directories (created by this plan's tasks)

- **`plans/0901_form_primitives/`** — `<Button>` variant + tone +
  size + leadingIcon, the three new input primitives
  (`<TextInput>`, `<Textarea>`, `<Label>`), and the migration sweep
  across every raw `<button>` / `<input>` / `<textarea>` call site
  listed in REQUIREMENTS R7–R8.
- **`plans/0902_icon_semantic_html/`** — `Icon` `color` prop +
  removal of pure-colour wrappers, global typography rules keyed
  off semantic tags in `typography.css`, the semantic-HTML refactor
  across `InvitePickerSheet` (canonical) and every other div-heavy
  screen / sheet, and the extraction of `<EmptyState>`.

### New files

- **`web/src/lib/basic/components/TextInput.svelte`** (lands in
  0901) — single-line text input primitive.
- **`web/src/lib/basic/components/TextInput.test.ts`** (0901) —
  Vitest coverage.
- **`web/src/lib/basic/components/Textarea.svelte`** (0901) —
  multi-line text input primitive.
- **`web/src/lib/basic/components/Textarea.test.ts`** (0901).
- **`web/src/lib/basic/components/Label.svelte`** (0901) — form
  label primitive.
- **`web/src/lib/basic/components/Label.test.ts`** (0901).
- **`web/src/lib/shared/components/EmptyState.svelte`** (0902) —
  shared empty-state composite.
- **`web/src/lib/shared/components/EmptyState.test.ts`** (0902).

### Modified files (existing primitives)

- **`web/src/lib/basic/components/Button.svelte`** (0901) — extend
  with variant / tone / size / leadingIcon. Existing call sites
  that pass no props keep working visually identically.
- **`web/src/lib/basic/components/Button.test.ts`** (0901) — cover
  every new variant × tone × size combination at least once.
- **`web/src/lib/basic/components/Icon.svelte`** (0902) — add
  `color?: string` prop, defaulting to `'currentColor'`.
- **`web/src/lib/basic/components/Icon.test.ts`** (0902) — cover
  the `color` prop.
- **`web/src/lib/shared/styles/typography.css`** (0902) — lift
  recurring typography to rules keyed off semantic tags (`h1`,
  `h2`, `h3`, `section`, `ul`, `li`, `header`, plus `.hint` and
  `.hint-error`).

### Modified files (migration targets)

Roughly 30 screens / sheets are touched across the two sub-plans.
The complete enumeration lives in each sub-plan's `TASKS.md`;
representative paths:

- **0901 — button migration**: `AddEditItemSheet.svelte`,
  `CreateListSheet.svelte`, `RenameListSheet.svelte`,
  `DeleteItemSheet.svelte`, `EditDescriptionSheet.svelte`,
  `AvatarSourceSheet.svelte`, `ListOverflowSheet.svelte`,
  `ProfileSheet.svelte`, `CircleScreen.svelte`,
  `InvitePickerSheet.svelte`, `ItemsScreen.svelte`,
  `ListsScreen.svelte`, `InvitesInboxScreen.svelte`,
  `TrashScreen.svelte`, `SettingsScreen.svelte`,
  `PrivacyScreen.svelte`, profile page `+page.svelte`.
- **0901 — input migration**: `LoginRequest.svelte`,
  `RenameListSheet.svelte`, `CreateListSheet.svelte`,
  `AddEditItemSheet.svelte`, `EditDescriptionSheet.svelte`,
  `InvitePickerSheet.svelte`, `CircleScreen.svelte`, profile page
  `+page.svelte`.
- **0902 — semantic-HTML migration**: `InvitePickerSheet.svelte`
  (canonical), `MembersScreen.svelte`, `ListsScreen.svelte`,
  `ItemsScreen.svelte`, `InvitesInboxScreen.svelte`,
  `CircleScreen.svelte`, `BlockedScreen.svelte`,
  `SettingsScreen.svelte`, `PrivacyScreen.svelte`,
  `ProfileSheet.svelte`, `AddEditItemSheet.svelte`,
  `CircleExplainerSheet.svelte`, `CreateListSheet.svelte`,
  `TopBar.svelte` (confirm only).
- **0902 — icon-colour migration**: `TrashScreen.svelte`
  (canonical), plus any others surfaced during the sweep.
- **0902 — `<hr>` separator sweep**: The app uses `border-bottom`
  on row elements (buttons, list items, sheet rows) as separators
  throughout. These should be `<hr>` elements — the separator
  belongs to the document flow, not the element's box. The global
  `hr` reset rule (`border: none; border-top: 1px solid var(--rule);
  margin: 0`) was added in 0901. The 0902 sweep replaces every
  remaining `border-bottom`-as-separator with an explicit `<hr>`
  and removes the now-dead CSS rules.

The corresponding `.test.ts` for every migrated component is
expected to keep passing without assertion edits other than the
mechanical renames the markup change forces (e.g. an assertion
that searched for a `<div class="row">` becomes one that searches
for `<li>`). The 0901 and 0902 task lists call this out task by
task per `CLAUDE.md` "Tests out of sync".

### No DB migration

This is a web-only refactor. No `db/` files change.

### Cross-cutting Svelte conventions

Per `docs/frontend-layout.md`:

- New primitives in `basic/components/` follow the existing
  filename conventions (PascalCase `.svelte`, sibling `.test.ts`,
  `__mocks__/` if needed).
- The migration must not introduce SvelteKit `resolve()` calls,
  env-var reads, or route-id strings the type checker hasn't seen
  before — every consumer in the migration sweep references a
  primitive that's been added to `basic/components/` earlier in the
  same sub-plan.

### Primitives reused (not rebuilt)

- `web/src/lib/basic/components/Icon.svelte` (extended in 0902, not
  replaced).
- `web/src/lib/basic/components/IconButton.svelte` (used as-is —
  the icon-only role stays distinct from `<Button>`).
- `web/src/lib/basic/components/RefreshButton.svelte`,
  `MoreButton.svelte`, `Fab.svelte` (unchanged).
- `web/src/lib/basic/components/Sheet.svelte`,
  `Accordion.svelte`, `ButtonPair.svelte`,
  `Snackbar.svelte` (unchanged primitives; the snackbar `.action`
  button is one of the carve-outs).
- `web/src/lib/shared/components/AppTopBar.svelte`,
  `Avatar.svelte`, `NavRow.svelte` (if present — surface only;
  internals may be touched by the semantic refactor).

## Phase structure

Two implementation phases plus a wrap-up.

**Phase 1 — 0901 (form primitives + migration).** Cut
`0901_form_primitives` from `0900_refactor_css_components`. Run
`/write-plan` to create its three plan files. The sub-plan opens
with a short exploration phase that locks down the final
prop-name choices for `<Button>` and the three new input
primitives (this is the one piece of API design the audit
deliberately left for the sub-plan to refine). The implementation
phases then ship `<Button>` extensions, `<TextInput>`,
`<Textarea>`, `<Label>` with co-located Vitest tests, followed by
the button-migration sweep and the input-migration sweep across
every call site in REQUIREMENTS R7–R8. The contract is that
existing component tests continue passing without assertion
edits; the sub-plan's TASKS.md flags any exceptions
(e.g. `LoginRequest.test.ts` assertions on the email input may
need a selector update). Verify with `./scripts/check.sh` —
including `pnpm lint`, per the `feedback_run_lint` memory. Merge
back via `--no-ff`. Satisfies R1–R8 and the migration coverage
half of R14.

**Phase 2 — 0902 (icon colour prop + semantic HTML +
`<EmptyState>`).** Cut `0902_icon_semantic_html` from the updated
`0900_refactor_css_components` (post-0901 merge). Run
`/write-plan` to create its three plan files. The sub-plan ships
the `Icon` `color` prop and removes the pure-colour wrappers
first (small, isolated, low risk); then lifts the global
typography rules to `typography.css`; then performs the
semantic-HTML sweep starting with `InvitePickerSheet` as the
canonical case and rolling through the rest. The `<EmptyState>`
extraction lands as a discrete task with its own Vitest test, and
each migrated empty state becomes a call to `<EmptyState>`. Visual
sweep against the design canvas at the end. Verify with
`./scripts/check.sh --e2e` — the e2e suite catches any tap-target
regressions the markup change might introduce. Merge back via
`--no-ff`. Satisfies R9–R13 and the no-regression half of R14.

**Phase 3 — Wrap up.** On `0900_refactor_css_components`, run
`./scripts/check.sh --e2e` end-to-end across the full merged
state. Update `plans/0000_implementation_order.md`: tick step 9's
checkbox. Commit `chore(plan): tick step 9 in implementation
order`. Merge `0900_refactor_css_components` into `main` via
`--no-ff`.

**Toolchain-coupling sweep.** The one consumer → producer edge in
this plan is the migration phases consuming the new primitives.
Both sub-plans land their primitives in earlier tasks within the
same branch before the migration sweep tasks begin, so the type
checker only ever sees a valid combination. `<EmptyState>` is
introduced in 0902 and consumed by 0902's own screen sweep — no
cross-branch ordering. No SvelteKit `resolve()` calls reach
not-yet-created routes (the refactor doesn't add or move routes).
No new env-vars or typed-routes interactions.

## Reference docs and skills

- **`docs/frontend-layout.md`** — tier split (`basic/`,
  `shared/`, per-domain), filename conventions, the
  `typography.css` placement.
- **`docs/ui.md`** — button-pair convention (right is committal),
  empty-state pattern, TopBar styling. The refactor keeps every
  user-visible convention; the doc is the reference for "no
  regression."
- **`docs/testing.md`** — three test layers; Vitest for the
  primitives, Playwright e2e to catch visible regressions.
- **`docs/quality.md`** — lint / format / type-check toolchain
  and the documented toolchain-coupling escape patterns.
- **`design/Cairn - Design Canvas.html`** and the supporting
  `design/*.jsx` files — visual spec for every screen. The 0902
  sub-plan's final visual sweep uses this as the reference.
- **`.claude/skills/writing-requirements.md`**,
  **`.claude/skills/writing-plan.md`**,
  **`.claude/skills/writing-tasks.md`** — format rules for each
  sub-plan's three files.

## Open questions

- **`<EmptyState>` API: slot or `ctaLabel + onCta` prop pair?** The
  audit shows every empty state has the same structure (icon disc
  → heading → body → optional CTA), but the CTA copy and
  click-handler vary per call site. A slot is more flexible; a
  prop pair is more uniform. Defer to 0902's exploration phase —
  pick whichever produces cleaner call sites.
- **Should we rename `tone="neutral"` to `tone="ink"` to match the
  existing token vocabulary (`--ink`, `--accent`, `--ember`,
  `--sage`)?** The audit-time vocabulary in this plan uses
  semantic role names; the existing codebase uses token names.
  No `--neutral` token exists today; the existing convention is
  token-name vocabulary throughout (`VoteControl` returns
  `var(--sage) / var(--ember)`, button classes are named
  `.primary / .ghost / .destructive` from a token-role mix).
  `tone="ink"` is therefore the path of least resistance — but
  the question stays open in case 0901's exploration finds a
  reason to prefer the semantic name. Defer to 0901's exploration
  phase; either is fine as long as it's consistent across the
  sub-plan.
- **Does any migrated screen inherit a non-default focus order
  from the markup change (e.g. `<li>` containing a `<button>` is
  focusable differently than a bare `<div>` with a click
  handler)?** Expected answer: no — none of the current divs have
  `tabindex` or focus-handling logic, and the Playwright e2e
  suite would catch a regression. Sub-plan reviewers spot-check
  the keyboard-traversal paths through the migrated sheets just
  in case.
