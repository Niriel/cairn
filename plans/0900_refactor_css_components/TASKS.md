# Tasks

## Reference skills and docs

- **`.claude/skills/write-plan.md`** — how to create a sub-plan
  directory (branch, number, slug, three files).
- **`plans/0900_refactor_css_components/REQUIREMENTS.md`** — full
  step-9 requirements (R1–R15).
- **`plans/0900_refactor_css_components/PLAN.md`** — design
  rationale, decisions, branch graph.
- **`docs/frontend-layout.md`** — tier rules (`basic/`,
  `shared/`, per-domain) and the `typography.css` placement.
- **`docs/ui.md`** — button-pair convention, empty-state pattern,
  the user-visible behaviours the refactor must not break.
- **`docs/testing.md`** — three test layers; Vitest for the new
  primitives, Playwright e2e to catch visible regressions.
- **`docs/quality.md`** — lint / format / type-check toolchain;
  toolchain-coupling escape patterns.
- **`design/Cairn - Design Canvas.html`** and the
  `design/*.jsx` files — visual reference for the no-regression
  contract.

---

## Phase 1 — 0901: Form primitives (buttons + inputs)

### [ ] 1.1 Plan and implement sub-step 0901 (Button extensions + TextInput / Textarea / Label + migration)

**Created:** 2026-05-29T13:00:09Z
**Completed:**

**Why:** Form primitives are the larger of the two refactor halves
— ~25 raw `<button>` sites and ~11 raw `<input>` / `<textarea>`
sites, all sharing the same form-shape primitive home in
`web/src/lib/basic/components/`. They land first because the
button migration touches the same sheets the semantic-HTML pass
will touch in 0902, and doing the button migration first means
0902's sweep is markup-only (no API design happening in the same
commits as semantic restructuring). It also surfaces any
prop-shape disagreements before they propagate across 30 files.

**Prerequisites:** None — `0900_refactor_css_components` is cut
from `main` and the merged step-8 product surface is the audit
baseline.

**Decisions:**
- Sub-branch is cut from `0900_refactor_css_components`, not from
  `main`.
- Scope (from REQUIREMENTS.md):
  - R1: `<Button>` extends with `variant: 'rect' | 'pill' | 'text'`,
    `tone: 'primary' | 'neutral' | 'destructive'` (open: see PLAN
    open question on the `'neutral'` vs `'ink'` naming — resolve
    in the sub-plan's exploration phase), `size: 'sm' | 'md'`, and
    `leadingIcon?: IconName`. Existing call sites that pass no
    props remain visually identical.
  - R2: `<IconButton>` is **not** collapsed into `<Button>` — its
    icon-only call sites do not migrate.
  - R3: `<TextInput>` primitive with `bind:value`, `type?: 'text'
    | 'email'`, and the standard `id`/`name`/`placeholder`/
    `disabled`/`required`/`autocomplete`/`inputmode`/`data-test`
    props. Owns the canonical input CSS block
    (`padding: 12px 14px; border: 1px solid var(--rule);
    border-radius: 12px; background: var(--paper);
    color: var(--ink); font: inherit; font-size: 16px;
    width: 100%; box-sizing: border-box`) and the focus /
    placeholder states.
  - R4: `<Textarea>` primitive — same CSS as `<TextInput>` plus
    `resize: none` and a configurable `min-height` / `rows`. The
    `AddEditItemSheet` notes case (serif, 14 px) is preserved as
    a per-call CSS override on the rendered `<textarea>`, **not**
    a new variant.
  - R5: `<Label>` primitive — renders `<label for={id}>` with the
    recurring label typography. An `uppercase` boolean prop
    renders the `AddEditItemSheet` field-label shape.
  - R6: Hint / error text below an input stays plain
    `<p class="hint">` / `<p class="hint hint-error">`. **The
    `.hint` / `.hint-error` CSS rule lands in 0901** (in
    `typography.css`) alongside the input migration so the
    migrated hint paragraphs render styled from day one — see
    REQUIREMENTS R6. The rest of R11's typography lift (h1,
    h2, h3, etc.) still happens in 0902.
  - R7: every raw `<button>` listed in the REQUIREMENTS R7 table
    migrates to `<Button>` (or `<IconButton>` where the shape is
    icon-only). Carve-outs (VoteControl thumb, Accordion header,
    `(see more)` expander, Snackbar `.action`) stay as raw
    `<button>` elements per the master plan rule.
  - R8: every raw `<input>` / `<textarea>` listed in
    REQUIREMENTS R8 migrates to `<TextInput>`, `<Textarea>`, and
    `<Label>`. The `web/src/routes/(app)/profile/+page.svelte`
    `<input id="display-name" class="name-input">` (line 191) is
    the one routes-tree input in scope; the rest live under
    `web/src/lib/.../components/`.
  - Additional raw `<button>` call sites listed in REQUIREMENTS
    R7 (`.send-btn`, the second `.invite-btn`, `.unblock-btn`,
    `.remove-btn`, `.multi-row`, `.row-nav`, and the
    `.confirm-*` / `.row-delete` confirmation buttons in
    `ListOverflowSheet`) migrate to `<Button>`. The exploration
    phase classifies each into a `variant × tone × size` cell
    and records the mapping in PLAN.md Decisions.
  - Carve-outs added in REQUIREMENTS R7 (segmented-control and
    chooser-grid buttons in `PrivacyScreen` and `SettingsScreen`)
    stay raw and are explicitly skipped.
- Order inside the sub-plan: (a) a short **exploration phase** that
  locks down the final prop-name choices and the precise CSS values
  by reading the current `Button.svelte` and a representative raw
  button + raw input; the exploration ends by writing the chosen
  API surface and CSS values into the sub-plan's PLAN.md Decisions
  section. (b) `<Button>` extension + Vitest tests for every new
  variant × tone × size combination at least once. (c) `<TextInput>`,
  `<Textarea>`, `<Label>` each as its own task with co-located
  Vitest test (renders the right tag, `bind:value` round-trip,
  `disabled` honoured, events forwarded). (d) Button migration sweep
  — one task per screen / sheet domain (item, list, invite, profile,
  settings, auth, avatar) so the diffs stay reviewable. (e) Input
  migration sweep — same per-domain breakdown.
- **Existing tests must update in the same task as the source
  change** per CLAUDE.md "Tests out of sync". The contract from
  REQUIREMENTS R14 (now widened) is that the assertions stay
  semantically equivalent; selector-level rewrites are expected
  (a query that searched for a `.btn-submit` class becomes a
  query against the rendered text or role). Each migration task
  in the sub-plan calls out the matching `.test.ts` file in its
  **Files** list. The known case to flag explicitly:
  `web/src/lib/basic/components/Button.test.ts:27–34` currently
  asserts `classList.contains('destructive')`; under the new
  `variant × tone` API this becomes either a `tone` class check
  or a `data-test`-based assertion. The Button-extension task in
  0901 owns this rewrite.
- The migration **must not** change user-visible behaviour, copy,
  or tap targets. The `LoginRequest` email input is the one
  cosmetic exception called out in REQUIREMENTS R14: its
  `var(--paper-alt)` background and uniform `14px` padding both
  fold into the canonical `<TextInput>` shape (`var(--paper)`
  background, `12px 14px` padding). If 0901's exploration phase
  decides preserving the variant is worth a `<TextInput
  variant="alt">` prop, the reconciliation is reversed; record
  the call in PLAN.md Decisions. The sub-plan's Vitest update for
  `LoginRequest.test.ts` may need to adjust an assertion if it
  queries for the old background specifically; otherwise existing
  assertions hold.

**Steps:**
1. `git checkout -b 0901_form_primitives 0900_refactor_css_components`
2. Invoke `/write-plan` to create `plans/0901_form_primitives/`
   with its three files. The plan must include: (a) the exploration
   phase that locks down `<Button>` props and the input CSS values,
   (b) the four primitive-extension/creation tasks (`<Button>`,
   `<TextInput>`, `<Textarea>`, `<Label>`) each with a co-located
   Vitest test, (c) per-domain button-migration tasks listing
   every affected `.svelte` and `.test.ts` file, (d) per-domain
   input-migration tasks, (e) a final smoke task that runs
   `pnpm lint` + `pnpm test` + the e2e auth happy path
   (`auth.spec.ts`) to catch any focus / submit / form-binding
   regression on the touched flows.
3. Implement the sub-plan task by task.
4. Run `./scripts/check.sh` — must be green. Per the
   `feedback_run_lint` memory, this includes `pnpm lint`
   explicitly (svelte-check is not ESLint and
   `no-floating-promises` only fires under lint).
5. `git checkout 0900_refactor_css_components && git merge --no-ff
   0901_form_primitives`

**Verify:** `./scripts/check.sh` green on
`0900_refactor_css_components` after merge. Manual walkthrough of
the touched flows: sign in via `LoginRequest`, create a list,
rename it, edit its description, add an item, edit the item's
notes, open the invite picker and submit an e-mail invite, open
the circle screen and submit an add-by-e-mail, open Settings →
Privacy → toggle the segmented control — every form should look
and behave identically to pre-refactor. Run a quick visual diff
against the design canvas for the sheet-action button pairs and
the empty-state CTAs.

---

## Phase 2 — 0902: Icon colour prop + semantic HTML + `<EmptyState>`

### [ ] 2.1 Plan and implement sub-step 0902 (Icon `color` prop + global typography + semantic-HTML sweep + `<EmptyState>`)

**Created:** 2026-05-29T13:00:09Z
**Completed:**

**Why:** Completes the step-9 cleanup — `Icon` gains the `color`
prop the audit calls for, the pure-colour wrapper spans go away,
the recurring typography lifts to global rules keyed off semantic
tags, the div-heavy markup turns into proper `<header>` / `<h1>` /
`<h2>` / `<ul>` / `<li>` structures across every screen and sheet,
and the duplicated empty-state visual collapses into a single
`<EmptyState>` component. The result is a screen inventory built
on semantic HTML with one source of truth for typography — which
is what makes the post-step-9 plans (account deletion, admin,
export, PWA, legal) cheap to add without retrofitting consistency.

**Prerequisites:** Task 1.1 merged — `0900_refactor_css_components`
contains the migrated form primitives. The semantic-HTML sweep is
markup-only on top of the migrated buttons / inputs; sequencing
0902 after 0901 means each sheet only changes once per concern
(button shape in 0901, markup shape in 0902).

**Decisions:**
- Sub-branch is cut from the updated `0900_refactor_css_components`
  (post-0901 merge).
- Scope (from REQUIREMENTS.md):
  - R9: `<Icon>` gains `color?: string`, defaulting to
    `'currentColor'`. The SVG `stroke` reads from the prop.
    Precedent: `CairnGlyph.svelte` already has this exact shape.
  - R10: every purely-cosmetic icon-colour wrapper (e.g.
    `.row-icon` in `TrashScreen.svelte`) is removed; the colour
    moves to `<Icon color="var(--…)" />`. Layout-bearing wrappers
    (`.icon-wrap` in `DeleteItemSheet.svelte`, `.icon-disc` in
    `LoginCheck.svelte`, the spin wrapper in
    `RefreshButton.svelte`) **stay** — they carry sizing /
    background / animation, not just colour.
  - R11: `web/src/lib/shared/styles/typography.css` gains rules
    keyed off semantic tags (`h1`, `h2`, `h3`, `section`, `ul` /
    `ol`, plus `.hint` and `.hint-error` for the input hint /
    error rail from R6). Exact values are reconciled from the
    duplicated `.section-label` / `.name` / `.sub` /
    `.nav-row-title` / `.empty-heading` class rules — the
    sub-plan's first task records the chosen values in its
    PLAN.md Decisions section before the migration sweep starts.
    The `.name`-class overload is resolved per call site: 17 px
    list-title → `<h3>` (or a scoped `.list-title`); 14 px
    member-name → `<span>` with parent-driven typography.
  - R12: the semantic-HTML sweep — `<div class="header">` →
    `<header>` (with `<h1>` + `<p>`); `<div class="section-label">`
    → `<h2>`; `<div class="rows">` → `<ul>`; `<div class="row">` →
    `<li>` (containing the button or link that was inside the div
    before); `<div class="name">` → `<h3>` (17 px case) or
    `<span>` (14 px case); `<div class="sub">` / `.subtitle` /
    `.nav-row-sub` → `<p>` (in a header) or `<span>` (in a row).
    Start with `InvitePickerSheet.svelte` as the canonical case;
    then `MembersScreen.svelte`, `ListsScreen.svelte`,
    `ItemsScreen.svelte`, `InvitesInboxScreen.svelte`,
    `CircleScreen.svelte`, `BlockedScreen.svelte`,
    `SettingsScreen.svelte`, `PrivacyScreen.svelte`,
    `ProfileSheet.svelte`, `AddEditItemSheet.svelte`,
    `CircleExplainerSheet.svelte`, `CreateListSheet.svelte`,
    and `TopBar.svelte` (confirm-only — it already uses
    `<header>`).
  - R13: extract `<EmptyState>` at
    `web/src/lib/shared/components/EmptyState.svelte` (per the
    PLAN tier-rule decision — empty-state is an application
    primitive, not framework-primitive). Props per REQUIREMENTS
    R13: `variant: 'illustrated' | 'simple'` (default
    `'illustrated'`), `icon`, optional `title` (required when
    illustrated, omitted when simple), `body`, and an optional
    CTA slot **or** `ctaLabel + onCta` pair (sub-plan's
    exploration phase picks one — applies only to the
    illustrated variant). Co-located Vitest test covers both
    variants. The audited inventory:
    - *Illustrated* — `ListsScreen.svelte`, `ItemsScreen.svelte`,
      `InvitesInboxScreen.svelte`, `DeletedListsScreen.svelte`.
    - *Simple* — `BlockedScreen.svelte` (the existing dashed-box
      empty state at line 27–87).
    - `CircleScreen` does **not** have an empty state — the
      earlier inventory claim was wrong; out of scope.
  - R14: existing component tests pass without assertion edits.
    Selector-level renames are allowed (a Vitest assertion that
    searched for `.row` becomes one that uses `getByRole('listitem')`).
    Each migration task lists the matching `.test.ts` file in its
    Files list per CLAUDE.md "Tests out of sync".
- **Order matters inside the sub-plan**: (a) `<Icon>` `color` prop +
  Icon.test.ts update + the single canonical wrapper removal in
  `TrashScreen.svelte` — small, isolated, low risk; surfaces any
  hidden Icon-rendering coupling early. (b) lift typography rules
  to `typography.css` — write the rules, then confirm the existing
  duplicated class rules in screens still cascade correctly (don't
  remove them yet; the per-screen sweep does that). (c)
  `<EmptyState>` extraction + Vitest test — primitive-first.
  (d) `InvitePickerSheet.svelte` semantic refactor (canonical
  case). (e) the rest of the screen / sheet sweep, one task per
  file. (f) cleanup task that removes the now-dead duplicated
  typography classes per screen.
- The `.hint` / `.hint-error` rule that R6 left to 0902 lands
  with the typography lift (task b).
- **Visual sweep against the design canvas** before merging.
  Compare every touched screen / sheet against
  `design/Cairn - Design Canvas.html` at the design canvas's
  default zoom; no pixel-level regression. Pay specific attention
  to: heading sizes, section-label letter-spacing, row spacing,
  empty-state vertical rhythm, sheet-header padding.

**Steps:**
1. `git checkout -b 0902_icon_semantic_html 0900_refactor_css_components`
2. Invoke `/write-plan` to create `plans/0902_icon_semantic_html/`
   with its three files. The plan must include: (a) the Icon
   `color` prop task + the `TrashScreen` wrapper removal in the
   same commit, (b) the typography-rules lift task with the
   chosen values written into the sub-plan's PLAN.md Decisions
   section, (c) the `<EmptyState>` extraction task with the
   chosen CTA API recorded in Decisions, (d) `InvitePickerSheet`
   as the first semantic refactor (one task), (e) the rest of
   the per-screen / per-sheet semantic refactors (one task
   each), (f) the empty-state migration tasks (one per screen),
   (g) the cleanup task that removes the now-dead duplicated
   typography class rules per screen and the visual-canvas-sweep
   gate before declaring done.
3. Implement the sub-plan task by task.
4. Run `./scripts/check.sh --e2e` — must be green. The e2e suite
   catches any tap-target / focus / keyboard-traversal regression
   the markup change might introduce.
5. `git checkout 0900_refactor_css_components && git merge --no-ff
   0902_icon_semantic_html`

**Verify:** `./scripts/check.sh --e2e` green on
`0900_refactor_css_components` after merge. Open every screen
listed in REQUIREMENTS R12 in the dev server and visually compare
against `design/Cairn - Design Canvas.html` — no regression.
`git grep -l "row-icon"` returns no results (R10 sweep complete).
`git grep -l "class=\"section-label\""` returns no results (R11 +
R12 sweep complete, the rule is now keyed off `<h2>`).
Keyboard-traversal spot check: tab through the Invite picker
sheet and the Members screen; focus order matches pre-refactor.

---

## Phase 3 — Wrap up

### [ ] 3.1 Final verification and merge to main

**Created:** 2026-05-29T13:00:09Z
**Completed:**

**Why:** Confirms the full step-9 refactor is coherent end-to-end —
both sub-branches merged, every test layer green, no visual
regression against the design canvas — before it lands on `main`
and unlocks step 10 (account deletion).

**Prerequisites:** Tasks 1.1 and 2.1 both merged into
`0900_refactor_css_components`.

**Decisions:**
- Run `./scripts/check.sh --e2e` to exercise unit + type-check +
  ESLint + e2e layers on the fully merged state. The e2e suite is
  the strongest signal of "no behaviour change" — if every
  Playwright happy path still passes without assertion edits, the
  REQUIREMENTS R14 contract holds.
- Tick step 9's checkbox in `plans/0000_implementation_order.md`
  as part of this commit. The wrap-up commit only flips
  `9. [ ]` → `9. [x]`; no other doc updates expected.
- If the merged state surfaces a real `docs/*.md` divergence (e.g.
  a UI convention the doc described that the refactor inadvertently
  changed), file a small follow-up plan rather than wedging the
  doc edit into the wrap-up commit.

**Files:**
- `plans/0000_implementation_order.md` (modify)

**Steps:**
1. On `0900_refactor_css_components`, run
   `./scripts/check.sh --e2e` — must be green.
2. Edit `plans/0000_implementation_order.md`: change `9. [ ]` to
   `9. [x]`.
3. Commit: `chore(plan): tick step 9 in implementation order`.
4. `git checkout main && git merge --no-ff 0900_refactor_css_components`

**Verify:** `./scripts/check.sh --e2e` green on `main`. The three
new input primitives (`<TextInput>`, `<Textarea>`, `<Label>`) and
the new `<EmptyState>` are reachable from
`web/src/lib/basic/components/` and
`web/src/lib/shared/components/` respectively; `<Button>` accepts
the new variant / tone / size / leadingIcon props; `<Icon>` accepts
`color`; `web/src/lib/shared/styles/typography.css` carries the
semantic-tag rules; and `git grep` for the migrated class names
(`.row-icon`, `.empty-cta`, `.section-label`, `.panel-btn`,
`.restore` as class definitions rather than carve-out call sites)
returns either no results or only the carve-outs listed in
REQUIREMENTS R7.
