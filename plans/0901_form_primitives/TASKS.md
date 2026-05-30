# Tasks

## Reference skills and docs

- **`plans/0900_refactor_css_components/PLAN.md`** — parent
  orchestration plan; cross-cutting decisions and branch graph.
- **`plans/0900_refactor_css_components/REQUIREMENTS.md`** —
  R1–R8 (form-primitives contracts), R14 (no-regression
  contract), R15 (tier convention).
- **`plans/0901_form_primitives/REQUIREMENTS.md`** — this
  sub-plan's R1–R11.
- **`plans/0901_form_primitives/PLAN.md`** — Decisions section is
  amended by Task 1.1 to record the locked-down API choices;
  every Phase 2–4 task reads its Decisions from the amended
  PLAN.md.
- **`docs/frontend-layout.md`** — tier rules and filename
  conventions (PascalCase `.svelte`, sibling `.test.ts`,
  no `+` on route-level test filenames).
- **`docs/ui.md`** — button-pair convention (right is committal),
  the user-visible behaviours the migration must not break.
- **`docs/testing.md`** — three test layers; Vitest for the
  primitives, Playwright e2e auth happy path as final smoke.
- **`docs/quality.md`** — lint / format / type-check toolchain.
- **`design/Cairn - Design Canvas.html`** and the `design/*.jsx`
  files — visual reference for the no-regression contract.

## Phase 1 — Exploration

### [x] 1.1 Lock down API decisions and record them in PLAN.md

**Created:** 2026-05-29T13:21:24Z
**Completed:** 2026-05-29T16:53:11Z

**Why:** Five API-shape decisions are deliberately deferred from
the parent plan to this sub-plan's first task: the `<Button>`
`tone` name (`'neutral'` vs `'ink'`), the exact unspecified-call
defaults, the CSS values per `variant × tone × size` cell, the
input primitives' final prop surfaces (including the
`AddEditItemSheet` notes override mechanism and the `<Textarea>`
`rows`/`minHeight` shape), and the `LoginRequest` `paper-alt`
fold-vs-mint question. Resolving them up front in a single
exploration task — with the existing code in front of the
executor — produces decisions the rest of the sub-plan can build
on without re-litigating.

**Prerequisites:** None — the sub-branch is cut from
`0900_refactor_css_components`, the working tree is clean, and
this is the first task.

**Decisions:**
- Read first, then propose: open
  `web/src/lib/basic/components/Button.svelte` (69 lines) and
  `Button.test.ts` (47 lines) for the current shape, plus one
  representative raw `<button>` from each of the recurring
  shapes in the parent plan's R7 table (e.g.
  `AddEditItemSheet.svelte` for a `.btn-submit`,
  `InvitePickerSheet.svelte` for `.send-btn` and `.invite-btn`,
  `ItemsScreen.svelte` for `.panel-btn.destructive` and
  `.empty-cta`, `TrashScreen.svelte` for `.restore`, the
  profile route `+page.svelte` for `.pill-btn.ink` /
  `.pill-btn.ember`, `SettingsScreen.svelte` for `.nav-row` and
  `.profile-chip`).
- Read one representative raw `<input>` (`LoginRequest.svelte`
  email row) and one representative raw `<textarea>`
  (`AddEditItemSheet.svelte` notes — the per-call serif/14 px
  override is on this one).
- The exploration **amends this sub-plan's PLAN.md Decisions
  section** with the locked-down values. Every later task reads
  its decisions from the amended PLAN.md.
- Defaults coming in:
  - `tone="ink"` (parent plan's `0900` Open Questions flags this
    as the path of least resistance given the token vocabulary).
  - `<Button>` no-props default: `variant='rect'`,
    `tone='primary'`, `size='md'`, `leadingIcon=undefined`.
  - `LoginRequest` paper-alt: fold into canonical (no `variant`).
  - `AddEditItemSheet` notes override: scoped `:global()`
    selector inside the sheet's `<style>` block.
  - `<Textarea>`: expose both `rows` and `minHeight`, mutually
    exclusive; collapse to `rows` only if the audit shows no
    call site uses raw `min-height`.
  - Exploration is free to overturn any default with rationale.
- Per-button classification table: every raw `<button>` in the
  parent plan's R7 table (plus the additional R7 buttons
  enumerated in the same section) maps to a single
  `variant × tone × size` cell. The table goes into the amended
  PLAN.md as a sub-section under Decisions; every Phase 3
  migration task references it.
- **Primary-tone colour reconciliation table.** Today's call
  sites for the recurring filled-rect "primary" button drift
  between `var(--accent)` (`.btn-save` in
  `EditDescriptionSheet`/`RenameListSheet`, `CreateListSheet`
  submit) and `var(--ink)` (`.btn-submit` in `AddEditItemSheet`,
  `.empty-cta` in `ItemsScreen`/`ListsScreen`). The amended
  PLAN.md records one canonical colour per mapped cell; sites
  that flip colour are deliberate exceptions under R10. Default
  reconciliation per R10:
  - filled-rect sheet submits → `tone="primary"` (`--accent`);
    `AddEditItemSheet.btn-submit` shifts from `--ink` to
    `--accent`.
  - `.empty-cta` (illustrated empty state) → neutral/ink tone
    (`--ink`) per `docs/ui.md` "Empty-state copy and style".
- **`.panel-btn` shape decision (per R10 #3).** The exploration
  picks one of (a) reshape to a true pill (silent re-shape,
  documented in R10), (b) keep raw `<button>` (one-off carve-out),
  or (c) mint a fourth `<Button>` variant. Record the choice and
  rationale in PLAN.md Decisions before any Phase 3 task runs.
- **`name-input` border decision (per R10 #4).** The exploration
  picks one of (a) fold to `--rule` (canonical), (b) change
  canonical `<TextInput>` border to `--ink`, or (c) mint a
  `<TextInput>` variant. Record the choice in Decisions.
- **Tone-class vs `data-tone` assertion shape.** Task 2.1's RED
  step (and every Phase 3 migration test rewrite) asserts tone
  the same way. The exploration picks one of:
  - `<Button>` renders the tone as a class (e.g. `tone-primary`,
    `tone-destructive`); tests use
    `expect(button).toHaveClass('tone-destructive')`.
  - `<Button>` renders the tone as `data-tone={tone}`; tests use
    `expect(button.dataset.tone).toBe('destructive')`.
  Record the choice in PLAN.md Decisions. Class-based is the
  default — it composes with the existing
  `class:primary={…}` pattern and keeps tests grep-able.
- **Carve-out reminder.** The exploration confirms `UndoSnackbar`
  `.action` button (alongside `Snackbar.action`) stays raw — both
  are single-occurrence snackbar internals (parent plan R7).
- The amendment is a documentation edit — no code changes in
  this task. The commit message for this task is
  `chore(plan): record 0901 API decisions in PLAN.md`.

**Reference:** Parent plan
`plans/0900_refactor_css_components/PLAN.md` "Open questions"
section (lines 354–382) for the rationale behind each deferred
question.

**Files:**
- `plans/0901_form_primitives/PLAN.md` (modify — amend
  Decisions section)

**Steps:**
1. Read `web/src/lib/basic/components/Button.svelte` and
   `Button.test.ts` end-to-end. Note the current prop shape,
   the CSS values per existing variant, and the assertion at
   `Button.test.ts:27–34` that will be rewritten in Task 2.1.
2. Read one representative file for each recurring raw-`<button>`
   shape in the parent plan's R7 table. For each, note the CSS
   block (padding, border, background, colour, font-size) so the
   `variant × tone × size` cell can be pinned.
3. Read `LoginRequest.svelte` and `AddEditItemSheet.svelte` to
   pin the input CSS shapes and the notes override mechanism.
4. Decide every Open Question in PLAN.md "Open questions"
   section. For each, write the decision (default or
   alternative) and a one-sentence rationale into PLAN.md
   Decisions.
5. Write the per-button classification table into PLAN.md
   Decisions as a sub-section "Button migration table". Columns:
   *Today's class*, *File*, *variant*, *tone*, *size*,
   *leadingIcon*. Rows: every raw `<button>` from the parent
   plan's R7 table (including the additional R7 buttons listed
   below the main table).
6. Write the canonical CSS values per `variant × tone × size`
   cell into PLAN.md Decisions as a sub-section "Button CSS
   values". Pull values from the representative call sites read
   in steps 1–2; reconcile drift to the audit-anchored shape.
7. Write the final prop surfaces for `<TextInput>`, `<Textarea>`,
   `<Label>` into PLAN.md Decisions as a sub-section "Input
   primitive prop surfaces". Pin names, types, defaults, event
   forwarding.
8. Write the "Primary-tone colour reconciliation table" and the
   "Tone-render shape" pick into Decisions per the bullets above.
   Document the `.panel-btn` shape decision and the `.name-input`
   border decision under R10's deliberate-exceptions list — copy
   into PLAN.md Decisions whichever option is chosen.
9. Commit `chore(plan): record 0901 API decisions in PLAN.md`.

**Verify:** `pnpm check` (sanity — no source files changed; check
runs clean). Reviewer can confirm Decisions section is amended
with the four sub-sections (Open Questions resolutions, Button
migration table, Button CSS values, Input primitive prop
surfaces) and that every decision either confirms the default or
records a clearly-rationalised alternative.

## Phase 2 — Primitives

### [x] 2.1 Extend `<Button>` with variant + tone + size + leadingIcon

**Created:** 2026-05-29T13:21:24Z
**Completed:** 2026-05-29T17:28:33Z

**Why:** Every Phase 3 migration task consumes the new `<Button>`
API. Landing the extension (and its test rewrite) first means the
type checker and Vitest run clean against every migration commit.

**Prerequisites:** Task 1.1 — Decisions section amended with the
final `<Button>` prop names, defaults, and CSS values per
`variant × tone × size` cell.

**Decisions:**
- Prop shape per amended PLAN.md (defaults: `variant='rect'`,
  `tone='primary'` per the locked-down values from Task 1.1).
- The no-props-passed call must render today's filled-rectangle
  primary shape pixel-for-pixel — the existing call sites
  (`AddEditItemSheet` submit, `CreateListSheet` create, etc.)
  rely on this. Vitest covers the visual identity via a
  rendering-snapshot assertion or an explicit class/style check;
  exact assertion choice driven by what's reachable from
  `@testing-library/svelte`.
- `Button.test.ts:27–34` currently asserts
  `classList.contains('destructive')`. Rewrite to an equivalent
  assertion under the new API — preferred shape is a `data-test`
  or tone-class check (e.g. `expect(button).toHaveClass('tone-
  destructive')` if tone renders as a class, or
  `expect(button.dataset.tone).toBe('destructive')` if it
  renders as a data attribute). The exact shape is recorded in
  PLAN.md Decisions's "Button CSS values" sub-section.
- New assertions: at least one per `variant × tone × size` cell
  (3 × 3 × 2 = 18 combinations; cover them with parameterised
  tests or grouped `describe` blocks) plus a `leadingIcon`
  rendering check (Icon name renders inside the button with the
  8 px gap).
- `<IconButton>` is **not** touched. Its icon-only role stays
  distinct per the parent plan's R2.
- Per `CLAUDE.md` "Tests and quality (non-negotiable)": every
  primitive ships with a co-located `.test.ts` — extending
  `Button.test.ts` in the same commit satisfies the rule.

**Reference:** Amended PLAN.md "Decisions" section sub-sections
"Button migration table" and "Button CSS values".

**Files:**
- `web/src/lib/basic/components/Button.svelte` (modify)
- `web/src/lib/basic/components/Button.test.ts` (modify)

**Steps:**
1. RED — Extend `Button.test.ts` with: (a) the rewritten
   `destructive` assertion (replaces the current
   `classList.contains('destructive')` at lines 27–34); (b)
   one assertion per `variant × tone × size` combination; (c)
   a `leadingIcon` rendering check (asserts the named Icon
   renders inside the rendered `<button>` with the expected
   gap class or data attribute).
2. RED — Run `pnpm test --run web/src/lib/basic/components/
   Button.test.ts` and confirm the new assertions fail (the
   new props don't exist yet) and the rewritten assertion
   fails (the old class isn't applied that way under the new
   API).
3. GREEN — Extend `Button.svelte` with `variant`, `tone`,
   `size`, `leadingIcon` props per the amended PLAN.md
   Decisions. Map each `variant × tone × size` cell to its CSS
   per the "Button CSS values" sub-section. Render the
   `leadingIcon` inside the button with the 8 px gap before
   the children slot.
4. GREEN — Run `pnpm test --run web/src/lib/basic/components/
   Button.test.ts` and confirm green.
5. GREEN — Run `pnpm check` and confirm svelte-check is clean
   on the modified files.
6. Commit `feat(button): extend with variant, tone, size,
   leadingIcon`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [x] 2.2 Create `<TextInput>` primitive

**Created:** 2026-05-29T13:21:24Z
**Completed:** 2026-05-29T17:57:40Z

**Why:** Single-line text input primitive consumed by Phase 4
input-migration tasks. Lands before any migration task touches
it.

**Prerequisites:** Task 1.1 — Decisions section amended with the
final `<TextInput>` prop surface.

**Decisions:**
- Prop shape per amended PLAN.md (canonical: `value` with
  `bind:value`, `type?: 'text' | 'email'` default `'text'`,
  `id?`, `name?`, `placeholder?`, `disabled?`, `required?`,
  `autocomplete?`, `inputmode?`, `data-test?`, plus event
  forwarding `oninput`, `onchange`, `onblur`, `onkeydown`).
- CSS block (canonical): `padding: 12px 14px; border: 1px solid
  var(--rule); border-radius: 12px; background: var(--paper);
  color: var(--ink); font: inherit; font-size: 16px; width:
  100%; box-sizing: border-box`. Focus state: `border-color:
  var(--ink); outline: none`. Placeholder: `color:
  var(--stone)`.
- **No variants** — the `LoginRequest` `paper-alt` fold-in per
  R7 + R10 is the default; the exploration task may have
  reversed this and added `variant="alt"` — read the amended
  Decisions before implementing.
- Vitest coverage per REQUIREMENTS R8: renders an `<input>` of
  the right `type`; `bind:value` round-trip works; `disabled`
  honoured; each event forwards once (`oninput`, `onchange`,
  `onblur`, `onkeydown`); placeholder renders; optional props
  (`id`, `name`, `autocomplete`, `inputmode`, `data-test`)
  pass through to the rendered `<input>`. No assertions on the
  CSS string itself — visual review is a different concern.
- File lives in `web/src/lib/basic/components/` per parent plan
  R15 and `docs/frontend-layout.md` tier rules.

**Reference:** Amended PLAN.md "Input primitive prop surfaces"
sub-section.

**Files:**
- `web/src/lib/basic/components/TextInput.svelte` (create)
- `web/src/lib/basic/components/TextInput.test.ts` (create)

**Steps:**
1. RED — Create `TextInput.test.ts` covering the assertions in
   Decisions. Use `@testing-library/svelte` patterns matching
   the existing `Button.test.ts` style.
2. RED — Run `pnpm test --run web/src/lib/basic/components/
   TextInput.test.ts` and confirm every assertion fails (the
   file doesn't exist yet).
3. GREEN — Create `TextInput.svelte` with the prop shape and
   CSS block per Decisions.
4. GREEN — Run `pnpm test --run web/src/lib/basic/components/
   TextInput.test.ts` and confirm green.
5. GREEN — Run `pnpm check` and confirm svelte-check is clean.
6. Commit `feat(text-input): add primitive with bind:value and
   event forwarding`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [x] 2.3 Create `<Textarea>` primitive

**Created:** 2026-05-29T13:21:24Z
**Completed:** 2026-05-29T19:58:55Z

**Why:** Multi-line text input primitive consumed by Phase 4
input-migration tasks (CreateListSheet description,
EditDescriptionSheet, AddEditItemSheet notes).

**Prerequisites:** Task 2.2 — `<TextInput>` exists (mostly shared
prop shape, easier to mirror).

**Decisions:**
- Prop shape per amended PLAN.md: same prop set as `<TextInput>`
  where applicable, plus `rows?: number` and/or `minHeight?:
  string`. Exploration task pins which of these is exposed.
- CSS block: same as `<TextInput>` plus `resize: none` and the
  configured min-height / rows. No other variants.
- The `AddEditItemSheet` notes serif/14 px override is **not** a
  variant on this primitive — it stays as a per-call CSS
  override on the rendered `<textarea>` (mechanism per amended
  PLAN.md "Open questions" resolution: scoped `:global()`
  selector by default, or `class` prop if the exploration task
  picked that shape).
- Vitest coverage per REQUIREMENTS R8: same shape as
  `<TextInput>` plus `rows` / `minHeight` honoured (assert the
  rendered `<textarea>` has the expected `rows` attribute or
  computed style) and `resize: none` rendered (assertion on
  the rendered style or class).

**Reference:** Amended PLAN.md "Input primitive prop surfaces"
sub-section.

**Files:**
- `web/src/lib/basic/components/Textarea.svelte` (create)
- `web/src/lib/basic/components/Textarea.test.ts` (create)

**Steps:**
1. RED — Create `Textarea.test.ts` mirroring
   `TextInput.test.ts` plus the `rows` / `minHeight` and
   `resize: none` assertions.
2. RED — Run `pnpm test --run web/src/lib/basic/components/
   Textarea.test.ts` and confirm failure.
3. GREEN — Create `Textarea.svelte` with the prop shape and
   CSS per Decisions.
4. GREEN — Re-run the test and confirm green.
5. GREEN — Run `pnpm check`.
6. Commit `feat(textarea): add primitive with rows/minHeight
   props`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [x] 2.4 Create `<Label>` primitive

**Created:** 2026-05-29T13:21:24Z
**Completed:** 2026-05-29T20:10:16Z

**Notes:** Dropped the `uppercase` prop entirely — all labels use one
canonical style (12px, stone, weight 600, letter-spacing 0.06em,
uppercase). The plan's two-style design was superseded by the user's
direction that the distinction isn't needed.

**Why:** Form label primitive consumed by Phase 4 input-
migration tasks. Composes either by `for`-id pointer or by
wrapping its input.

**Prerequisites:** None — `<Label>` is independent of
`<TextInput>` / `<Textarea>`; the composition happens at the
migration call site.

**Decisions:**
- Prop shape per amended PLAN.md: `for?: string` (optional;
  emits `for` attribute iff set), `uppercase?: boolean`
  (default `false`; toggles the field-label shape from
  `AddEditItemSheet`), `children` (snippet — the label text),
  `data-test?: string`.
- Default typography: 12 px, `var(--stone)`, weight 500. With
  `uppercase=true`: uppercase, weight 600, letter-spacing 0.06
  em (matches the `AddEditItemSheet` field labels).
- Vitest coverage per REQUIREMENTS R8: renders a `<label>`;
  `for` attribute appears iff `for` prop is set; `uppercase`
  prop toggles the field-label shape (class or style
  assertion); `data-test` passes through; slot/children
  render.

**Reference:** Amended PLAN.md "Input primitive prop surfaces"
sub-section.

**Files:**
- `web/src/lib/basic/components/Label.svelte` (create)
- `web/src/lib/basic/components/Label.test.ts` (create)

**Steps:**
1. RED — Create `Label.test.ts` covering the four assertions in
   Decisions.
2. RED — Run `pnpm test --run web/src/lib/basic/components/
   Label.test.ts` and confirm failure.
3. GREEN — Create `Label.svelte` with the prop shape and
   typography per Decisions.
4. GREEN — Re-run the test and confirm green.
5. GREEN — Run `pnpm check`.
6. Commit `feat(label): add primitive with uppercase variant`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

## Phase 3 — Button migration sweep

### [x] 3.1 Migrate item sheets to `<Button>`

**Created:** 2026-05-29T13:21:24Z
**Completed:** 2026-05-29T20:20:34Z

**Why:** Item-related sheets (`AddEditItemSheet`,
`DeleteItemSheet`) are the natural first migration target — both
are leaf sheets with a small button set and clear `variant ×
tone × size` mappings from the table.

**Prerequisites:** Task 2.1 — `<Button>` extension landed.

**Decisions:**
- Mappings from amended PLAN.md "Button migration table":
  - `AddEditItemSheet.svelte`: `.btn-cancel` →
    `<Button variant="rect" tone="<neutral>" size="md">`;
    `.btn-submit` → `<Button variant="rect" tone="primary"
    size="md">`. (Exact neutral-tone name per amended
    Decisions.)
  - `DeleteItemSheet.svelte`: `.btn-cancel` → as above;
    `.btn-delete` → `<Button variant="rect" tone="destructive"
    size="md">`.
- Carve-outs in these files: none — every raw `<button>` in
  scope migrates.
- Test rewrites: any assertion in `AddEditItemSheet.test.ts`
  or `DeleteItemSheet.test.ts` that queries for a class
  (`.btn-cancel`, `.btn-submit`, `.btn-delete`) rewrites to a
  role/text/`data-test`-based query. Assertions stay
  semantically equivalent per REQUIREMENTS R9.
- The button-pair convention (right is forward/committal, left
  is backward/destructive) is preserved per `docs/ui.md`. The
  refactor shuffles markup, not order.

**Reference:** Amended PLAN.md "Button migration table" rows for
`AddEditItemSheet` and `DeleteItemSheet`.

**Files:**
- `web/src/lib/item/components/AddEditItemSheet.svelte` (modify)
- `web/src/lib/item/components/AddEditItemSheet.test.ts` (modify)
- `web/src/lib/item/components/__mocks__/AddEditItemSheet.svelte`
  (modify only if the mock surfaces a `data-test` or markup hook
  that the migration changes)
- `web/src/lib/item/components/DeleteItemSheet.svelte` (modify)
- `web/src/lib/item/components/DeleteItemSheet.test.ts` (modify)
- `web/src/lib/item/components/__mocks__/DeleteItemSheet.svelte`
  (modify only if the mock surfaces a hook the migration changes)

**Steps:**
1. Open each `.svelte` file. Replace every raw `<button class="
   btn-...">` with the mapped `<Button ...>`. Preserve
   `onclick`, `type`, `disabled`, `aria-pressed`, `data-test`
   attributes.
2. Drop the now-dead button CSS rules from each file's
   `<style>` block — they're owned by `<Button>` now.
3. Open each `.test.ts` file. Rewrite any class-based queries
   to role/text/`data-test`-based queries. Run the test, watch
   it pass (or fix the assertion until it does).
4. Run `pnpm test --run web/src/lib/item/components/` and
   confirm green on the touched files.
5. Run `pnpm check` and confirm clean.
6. Commit `refactor(items): migrate item-sheet buttons to
   <Button>`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test --run web/
src/lib/item/components/`

### [x] 3.2 Migrate list-related sheets to `<Button>`

**Created:** 2026-05-29T13:21:24Z
**Completed:** 2026-05-29T20:31:49Z

**Notes:** `ListOverflowSheet` row buttons (`<button class="row">`) had no outer
wrapper, so the row layout CSS (border-bottom, padding, gap) couldn't be
preserved with Svelte scoped selectors alone. Added a `<div class="rows">`
wrapper and migrated the CSS to `.rows :global(button)`. The `<div>` will be
converted to `<ul>` in task 0902.

**Why:** List-related sheets (`CreateListSheet`,
`RenameListSheet`, `EditDescriptionSheet`, `ListOverflowSheet`)
share the same sheet-header button shape and benefit from a
single migration commit.

**Prerequisites:** Task 2.1 — `<Button>` extension landed.

**Decisions:**
- Mappings from amended PLAN.md "Button migration table":
  - `CreateListSheet.svelte`: header buttons (cancel + create)
    → `<Button variant="rect" tone="<neutral|primary>"
    size="md">`.
  - `RenameListSheet.svelte`: same.
  - `EditDescriptionSheet.svelte`: same.
  - `ListOverflowSheet.svelte`: `.row` actions →
    `<Button variant="text" tone="<neutral>" size="md">`
    inside the existing markup (Phase 2 — semantic-HTML — moves
    these into `<li>` in 0902, not here). The confirm-state
    buttons (`.confirm-cancel`, `.confirm-leave`,
    `.row-delete`) → mapped per the amended table; expected
    shape `<Button variant="rect" tone="<neutral|destructive>"
    size="<sm|md>">`.
- Carve-outs in these files: none.
- Test rewrites: same shape as Task 3.1 — class-based queries
  become role/text/`data-test`-based.

**Reference:** Amended PLAN.md "Button migration table" rows for
list-related sheets.

**Files:**
- `web/src/lib/list/components/CreateListSheet.svelte` (modify)
- `web/src/lib/list/components/CreateListSheet.test.ts` (modify)
- `web/src/lib/list/components/RenameListSheet.svelte` (modify)
- `web/src/lib/list/components/RenameListSheet.test.ts` (modify)
- `web/src/lib/list/components/EditDescriptionSheet.svelte`
  (modify)
- `web/src/lib/list/components/EditDescriptionSheet.test.ts`
  (modify)
- `web/src/lib/list/components/ListOverflowSheet.svelte` (modify)
- `web/src/lib/list/components/ListOverflowSheet.test.ts`
  (modify)
- `web/src/lib/list/components/__mocks__/*.svelte` (modify only
  the mocks whose source's markup hooks change — check
  `__mocks__/` after editing each source for matching files)

**Steps:**
1. For each `.svelte` file: replace raw `<button>` with the
   mapped `<Button>`. Preserve attribute pass-through.
2. Drop dead button CSS from each file's `<style>` block.
3. For each `.test.ts` file: rewrite class-based queries.
4. Run `pnpm test --run web/src/lib/list/components/` and
   confirm green.
5. Run `pnpm check`.
6. Commit `refactor(lists): migrate list-sheet buttons to
   <Button>`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test --run web/
src/lib/list/components/`

### [x] 3.3 Migrate invite / circle UI buttons to `<Button>`

**Created:** 2026-05-29T13:21:24Z
**Completed:** 2026-05-29T20:40:27Z

**Notes:**
- `InvitesBanner` single-invite `.btn-decline` and `.btn-accept` are not in the
  migration table and were left as raw buttons.
- `CircleScreen` `.add-btn` and `.whats-this` are not in the migration table and
  were left as raw buttons.
- `Button.svelte` fix: added `justify-content: flex-start` to the `.text` variant
  — the user flagged that text-variant row buttons were centre-aligned, which is
  wrong for full-width nav rows.

**Why:** Invite / circle UI carries the densest button mix —
sheet-header buttons, full-row actions, inline-link buttons,
and confirmation actions all in one domain.

**Prerequisites:** Task 2.1 — `<Button>` extension landed.

**Decisions:**
- Mappings per amended PLAN.md "Button migration table":
  - `InvitePickerSheet.svelte`: `.send-btn` (inline e-mail
    submit) → mapped per table; `.invite-btn` (second shape,
    distinct from inline-link) → mapped per table; `.row`
    actions → `<Button variant="text" tone="ink" size="md">`.
  - `CircleScreen.svelte`: `.remove-btn` → mapped per table.
  - `InvitesBanner.svelte`: `.multi-row` (full-row tap target)
    → mapped per table.
  - `BlockedScreen.svelte`: `.unblock-btn` → mapped per table.
  - `PostAcceptPromptSheet.svelte`: "Not now" (left) →
    `<Button variant="rect" tone="ink" size="md">`; "Add to
    circle" (right) → `<Button variant="rect" tone="primary"
    size="md">`. Both are bare unstyled `<button>` inside
    `<ButtonPair>` snippets — no class names, no CSS to drop.
  - `CircleExplainerSheet.svelte`: "Got it" → `<Button
    variant="rect" tone="ink" size="md">`. Drop the scoped
    `button` rule from the file's `<style>` block.
- Carve-outs: none in these files (the `EmptyState` for
  `BlockedScreen` stays as raw markup in this sub-plan — its
  refactor to `<EmptyState>` is 0902's concern).
  **Note:** the `UndoSnackbar.svelte` `.action` button (in
  `web/src/lib/shared/components/`) is also a carve-out per
  REQUIREMENTS R6 alongside `Snackbar.svelte` `.action` — neither
  is touched in this task or anywhere else in the sub-plan.
- Test rewrites: class-based queries become role/text/
  `data-test`-based.

**Reference:** Amended PLAN.md "Button migration table" rows for
invite/circle files.

**Files:**
- `web/src/lib/invite/components/InvitePickerSheet.svelte`
  (modify)
- `web/src/lib/invite/components/InvitePickerSheet.test.ts`
  (modify)
- `web/src/lib/invite/components/InvitesBanner.svelte` (modify)
- `web/src/lib/invite/components/InvitesBanner.test.ts` (modify)
- `web/src/lib/invite/components/PostAcceptPromptSheet.svelte`
  (modify)
- `web/src/lib/invite/components/PostAcceptPromptSheet.test.ts`
  (modify)
- `web/src/lib/privacy/components/CircleScreen.svelte` (modify)
- `web/src/lib/privacy/components/CircleScreen.test.ts` (modify)
- `web/src/lib/privacy/components/BlockedScreen.svelte` (modify)
- `web/src/lib/privacy/components/BlockedScreen.test.ts` (modify)
- `web/src/lib/privacy/components/CircleExplainerSheet.svelte`
  (modify)
- `web/src/lib/privacy/components/CircleExplainerSheet.test.ts`
  (modify)
- `web/src/lib/invite/components/__mocks__/*.svelte` and
  `web/src/lib/privacy/components/__mocks__/*.svelte` — modify
  only the mocks whose source's markup hooks change; check the
  `__mocks__/` directories after editing each source.

**Steps:**
1. For each `.svelte` file: replace raw `<button>` with the
   mapped `<Button>`. Preserve attribute pass-through.
2. Drop dead button CSS from each file's `<style>` block.
3. For each `.test.ts` file: rewrite class-based queries.
4. Run `pnpm test --run` against the touched directories.
5. Run `pnpm check`.
6. Commit `refactor(invites): migrate invite/circle buttons to
   <Button>`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [x] 3.4 Migrate profile + avatar buttons to `<Button>`

**Created:** 2026-05-29T13:21:24Z
**Completed:** 2026-05-29T21:05:06Z

**Why:** Profile / avatar surfaces include the profile route
page's pill buttons, the profile sheet's full-row actions, and
the avatar-source sheet's row actions — all natural neighbours.

**Prerequisites:** Task 2.1 — `<Button>` extension landed.

**Decisions:**
- Mappings per amended PLAN.md "Button migration table":
  - `ProfileSheet.svelte`: `.row` actions →
    `<Button variant="text" tone="<neutral>" size="md">`.
  - `web/src/routes/(app)/profile/+page.svelte`:
    `.pill-btn.ink` →
    `<Button variant="pill" tone="<neutral>" size="sm"
    leadingIcon="…">`; `.pill-btn.ember` →
    `<Button variant="pill" tone="destructive" size="sm"
    leadingIcon="…">`. Other raw buttons on the page (if any)
    per the amended table.
  - `AvatarSourceSheet.svelte`: `.row` actions → as above.
- Carve-outs: hidden `<input type="file">` triggers in
  `AvatarSourceSheet` stay (not buttons). The `<canvas>` in
  `AvatarCropScreen` is not in scope (not a button or input).
- Test rewrites: class-based queries become role/text/
  `data-test`-based. The route-level test for the profile
  page (if present) is `page.test.ts` — no `+` prefix per
  `docs/frontend-layout.md` "Filename conventions".

**Reference:** Amended PLAN.md "Button migration table" rows for
profile / avatar files.

**Files:**
- `web/src/lib/profile/components/ProfileSheet.svelte` (modify)
- `web/src/lib/profile/components/ProfileSheet.test.ts` (modify)
- `web/src/lib/profile/components/__mocks__/ProfileSheet.svelte`
  (modify only if the mock surfaces a hook the migration changes)
- `web/src/routes/(app)/profile/+page.svelte` (modify)
- `web/src/routes/(app)/profile/page.test.ts` (modify if
  exists — otherwise no test file to update for this route)
- `web/src/lib/avatar/components/AvatarSourceSheet.svelte`
  (modify)
- `web/src/lib/avatar/components/AvatarSourceSheet.test.ts`
  (modify)
- `web/src/lib/avatar/components/__mocks__/*.svelte` (modify only
  the mocks whose source's markup hooks change)

**Notes:**
- `ProfileSheet` action rows had border+border-radius decorating each card row. Preserved with `.action-card` wrapper divs (border, radius, overflow:hidden) and a `.actions` container (margin-top: 18px, flex column, gap: 8px); dropped the old `.action-row` / `.action-row:first-of-type` / `.block-action` CSS.
- Block action button uses `tone="destructive"` (not `tone="ink"`) to preserve the ember colour — the migration table lists a single `.row actions` → `ink` row but the block action is clearly destructive and a visual regression without it.
- `AvatarSourceSheet` cancel row loses its muted stone colour (was `.cancel { color: var(--stone) }`) — migration table says `text | ink | md` for all rows.
- `profile/+page.svelte` `.upload-action-btn` had `margin-top: 28px`; preserved via `style="margin-top: 28px"` passed through Button's `{...rest}` spread. Added `style?: string` to Button's Props type to avoid svelte-check errors.
- No test rewrites needed — all tests already used `data-test` / text queries, no class-based queries.

**Steps:**
1. For each `.svelte` file: replace raw `<button>` with the
   mapped `<Button>`. Preserve attribute pass-through.
2. Drop dead button CSS from each file's `<style>` block.
3. For each `.test.ts` file: rewrite class-based queries. If
   `page.test.ts` doesn't exist for the profile route, no test
   update needed (the route's coverage is via
   `web/e2e/auth.spec.ts` which runs in Task 5.1).
4. Run `pnpm test --run` against the touched directories.
5. Run `pnpm check`.
6. Commit `refactor(profile): migrate profile/avatar buttons
   to <Button>`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [x] 3.5 Migrate settings / privacy nav-row + profile-chip buttons to `<Button>`

**Created:** 2026-05-29T13:21:24Z
**Completed:** 2026-05-29T21:23:04Z

**Notes:**
- Updated `__mocks__/Button.svelte` Props type to match the current API (`variant: 'rect'|'pill'|'text'|'link'`, `tone`, `size`, `leadingIcon`) — the mock was still using the pre-2.1 `'primary'|'ghost'|'destructive'` variant type.
- `SettingsScreen` `.profile-chip` loses its `padding: 16px 18px` (now `12px 18px` from text|md). Slightly less vertical breathing room around the 44px avatar.
- `SettingsScreen` `.nav-row > :global(svg:last-of-type)` chevron-right colour rule (`var(--stone-lt)`) is dropped — no clean way to scope it once `.nav-row` class is gone from the button element. Chevron inherits `var(--ink)` from the Button.
- `PrivacyScreen` `.nav-row` borders (top on first child, bottom on each row) preserved via `.nav-rows :global(button.text)` and `.nav-rows :global(button.text:first-child)` — higher specificity than Button's own `.text { border: none }` rule.
- `PrivacyScreen` nav-row padding changes from `0.875rem` (14px all sides) to `12px 18px` (Button text|md default).
- No test rewrites required — all existing tests already used `data-test` / text queries.

**Why:** Settings / Privacy nav rows are full-width tap-target
rows that migrate to `<Button variant="text" tone="<neutral>"
size="md">`. The segmented-control and chooser-grid buttons in
the same files are carve-outs and stay raw.

**Prerequisites:** Task 2.1 — `<Button>` extension landed.

**Decisions:**
- Mappings per amended PLAN.md "Button migration table":
  - `SettingsScreen.svelte`: `.nav-row` rows → `<Button
    variant="text" tone="<neutral>" size="md">`. `.profile-
    chip` (the link to the profile route) → mapped per table.
  - `PrivacyScreen.svelte`: `.nav-row` rows → as above.
- Carve-outs (stay raw `<button>`):
  - `SettingsScreen.svelte`: `.size-option`, `.theme-option`
    (chooser-grid buttons — grid-tile shape, not a row).
  - `PrivacyScreen.svelte`: `.option`, `.whats-a-circle`
    (segmented-control buttons — segmented-control is its own
    pattern, not a Button variant).
- Test rewrites: class-based queries → role/text/`data-test`.
- The `<li>` semantic-HTML wrapping of `.nav-row` is 0902's
  concern; this task only swaps the inner `<button>` for
  `<Button>` and leaves the surrounding markup alone.

**Reference:** Amended PLAN.md "Button migration table" rows for
`SettingsScreen` and `PrivacyScreen`.

**Files:**
- `web/src/lib/settings/components/SettingsScreen.svelte`
  (modify)
- `web/src/lib/settings/components/SettingsScreen.test.ts`
  (modify)
- `web/src/lib/privacy/components/PrivacyScreen.svelte` (modify)
- `web/src/lib/privacy/components/PrivacyScreen.test.ts` (modify)
- `web/src/lib/privacy/components/__mocks__/*.svelte` (modify
  only if the privacy mocks surface a hook the migration changes)

**Steps:**
1. For each `.svelte` file: replace the listed raw `<button>`
   with the mapped `<Button>`. Leave the carve-outs alone
   (segmented-control and chooser-grid stay raw).
2. Drop dead button CSS from each file's `<style>` block — but
   keep the CSS for the carve-out buttons.
3. For each `.test.ts` file: rewrite class-based queries.
4. Run `pnpm test --run web/src/lib/settings/components/
   web/src/lib/privacy/components/`.
5. Run `pnpm check`.
6. Commit `refactor(settings): migrate nav-row + profile-chip
   buttons to <Button>`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [x] 3.6 Migrate screen-level CTAs to `<Button>`

**Created:** 2026-05-29T13:21:24Z
**Completed:** 2026-05-29T21:44:21Z

**Notes:**
- `InvitesInboxScreen` has no `.empty-cta` or `.nav-row` buttons — the empty state is illustration + text only, and the invite-row accept/decline buttons are carve-outs from task 3.3. Nothing to migrate in that file.
- Added `style?: string` to Button.svelte's Props type (needed for `flex: 1` on panel buttons and `flex: 1; min-width: 0; padding: 0` on the row-nav — both rely on the style passing through `{...rest}` without svelte-check errors).
- `ItemsScreen` panel buttons use `style="flex: 1"` to preserve equal-width layout inside `.panel-actions { display: flex; gap: 8px }`.
- `ListsScreen` row-nav uses `style="flex: 1; min-width: 0; padding: 0"` to preserve flex-grow behaviour and suppress Button's default `padding: 12px 18px` (row padding comes from the `.row` container).
- No test rewrites needed — all existing tests use `data-test` queries.

**Why:** Screen-level CTAs — `.panel-btn` and `.empty-cta` on
items/lists/invites-inbox screens, plus `.restore` on trash —
share the pill/rect+leadingIcon shapes that are the strongest
test of the new `<Button>` API.

**Prerequisites:** Task 2.1 — `<Button>` extension landed.

**Decisions:**
- Mappings per amended PLAN.md "Button migration table":
  - `ItemsScreen.svelte`: `.panel-btn` → mapped per the
    `.panel-btn` shape decision recorded in Task 1.1 (R10 #3 —
    options were reshape to pill, carve-out, or new variant);
    `.panel-btn.destructive` follows the same decision with the
    destructive tone; `.empty-cta` → `<Button variant="rect"
    tone="<ink>" size="md" leadingIcon="…">` (illustrated
    empty-state CTA pins to `--ink` per `docs/ui.md`
    "Empty-state copy and style"; this is R10's primary-tone
    reconciliation — the `--ink` mapping is the deliberate
    choice, not `tone="primary"`).
  - `ListsScreen.svelte`: `.empty-cta` → as above
    (`tone="<ink>"`); `.row-nav` (list-row navigation) →
    mapped per table.
  - `InvitesInboxScreen.svelte`: `.empty-cta` → as above; the
    `.nav-row` (if any) → `<Button variant="text"
    tone="<neutral>" size="md">`.
  - `TrashScreen.svelte`: `.restore` → `<Button variant="pill"
    tone="ink" size="sm">`. **Note:** `TrashScreen` lives
    in `web/src/lib/item/components/`, not `list/components/`.
  - `DeletedListsScreen.svelte`: `.restore` → `<Button
    variant="pill" tone="ink" size="sm">`. Same shape as
    `TrashScreen`. Lives in `web/src/lib/list/components/`.
- Carve-outs: the `(see more) / (see less)` expander in
  `ListsScreen.svelte` stays raw. The `.row-icon` colour
  wrapper in `TrashScreen` is 0902's concern (not touched
  here).
- Test rewrites: class-based queries → role/text/`data-test`.

**Reference:** Amended PLAN.md "Button migration table" rows for
screen-level CTAs.

**Files:**
- `web/src/lib/item/components/ItemsScreen.svelte` (modify)
- `web/src/lib/item/components/ItemsScreen.test.ts` (modify)
- `web/src/lib/list/components/ListsScreen.svelte` (modify)
- `web/src/lib/list/components/ListsScreen.test.ts` (modify)
- `web/src/lib/invite/components/InvitesInboxScreen.svelte`
  (modify)
- `web/src/lib/invite/components/InvitesInboxScreen.test.ts`
  (modify)
- `web/src/lib/item/components/TrashScreen.svelte` (modify) —
  `TrashScreen` is in `item/`, not `list/`.
- `web/src/lib/item/components/TrashScreen.test.ts` (modify if
  present; otherwise add coverage)
- `web/src/lib/list/components/DeletedListsScreen.svelte`
  (modify)
- `web/src/lib/list/components/DeletedListsScreen.test.ts`
  (modify)
- `web/src/lib/item/components/__mocks__/*.svelte`,
  `web/src/lib/list/components/__mocks__/*.svelte`,
  `web/src/lib/invite/components/__mocks__/*.svelte` — modify
  only the mocks whose source's markup hooks change.

**Steps:**
1. For each `.svelte` file: replace listed raw `<button>` with
   mapped `<Button>`. Leave the `(see more)` expander alone.
2. Drop dead button CSS from each file's `<style>` block —
   keep the `(see more)` expander's CSS.
3. For each `.test.ts` file: rewrite class-based queries.
4. Run `pnpm test --run` against the touched directories.
5. Run `pnpm check`.
6. Commit `refactor(screens): migrate screen-level CTAs to
   <Button>`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [x] 3.7 Migrate `LoginRequest` submit button to `<Button>`

**Created:** 2026-05-29T13:21:24Z
**Completed:** 2026-05-29T21:47:49Z

**Why:** Auth flow buttons — `LoginRequest` submit and
`LoginCheck` resend — are the last raw `<button>` elements
in the auth domain. Migrating them before the input migration
(Task 4.2) keeps the button-vs-input separation in the parent
plan.

**Prerequisites:** Task 2.1 — `<Button>` extension landed.

**Decisions:**
- Mapping per amended PLAN.md "Button migration table":
  `LoginRequest.svelte` submit button → `<Button variant="rect"
  tone="primary" size="md">`. (Already partially migrated
  in Task 2.1 side work — `variant="primary"` was updated to
  `variant="rect" tone="primary"`. Confirm the CSS block is
  dropped in this task.)
- `LoginCheck.svelte` `.resend` ("Send again") → `<Button
  variant="text" tone="primary" size="sm">`. The current
  `.resend` rule (`background: none; border: none; color:
  var(--accent)`) maps cleanly to `text / primary / sm`.
  Drop the `.resend` CSS rule from the file's `<style>` block.
- The email input is **not** migrated here — that's Task 4.2.
- Test rewrites: any assertion in `LoginRequest.test.ts` or
  `LoginCheck.test.ts` that queries by class becomes a
  role/text/`data-test`-based query.

**Reference:** Amended PLAN.md "Button migration table" rows for
`LoginRequest` and `LoginCheck`.

**Files:**
- `web/src/lib/auth/components/LoginRequest.svelte` (modify)
- `web/src/lib/auth/components/LoginRequest.test.ts` (modify)
- `web/src/lib/auth/components/LoginCheck.svelte` (modify)
- `web/src/lib/auth/components/LoginCheck.test.ts` (modify)

**Steps:**
1. In `LoginRequest.svelte`: confirm `variant="rect"
   tone="primary"` is in place (done in Task 2.1); drop any
   remaining button CSS from the `<style>` block that is now
   owned by `<Button>`.
2. In `LoginCheck.svelte`: replace the raw `.resend` `<button>`
   with `<Button variant="text" tone="primary" size="sm">`.
   Preserve `type="button"`, `disabled`, `data-test`, `onclick`.
   Drop the `.resend` CSS rule.
3. Update `LoginRequest.test.ts` and `LoginCheck.test.ts` if
   they query buttons by class.
4. Run `pnpm test --run web/src/lib/auth/components/`.
5. Run `pnpm check`.
6. Commit `refactor(auth): migrate auth buttons to <Button>`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

## Phase 4 — Input migration sweep + hint CSS

### [x] 4.1 Lift `.hint` / `.hint-error` rule into `typography.css`

**Created:** 2026-05-29T13:21:24Z
**Completed:** 2026-05-30T05:52:35Z

**Why:** Migrated `<TextInput>` and `<Textarea>` call sites emit
`<p class="hint">` and `<p class="hint hint-error">` paragraphs
for hint and error text. The CSS rule must exist before any
input-migration task runs so those paragraphs render styled
from day one (REQUIREMENTS R5).

**Prerequisites:** None — the CSS file already exists; this
task appends two rules.

**Decisions:**
- Append to
  `web/src/lib/shared/styles/typography.css`:
  - `.hint` — 13 px, `var(--stone)`, no margin-top, small
    margin-bottom matching the input rail spacing observed in
    existing sheets (exact value from the exploration task's
    audit of the current ad-hoc rules — recorded in amended
    PLAN.md if non-trivial; otherwise default 6 px).
  - `.hint-error` — applied alongside `.hint`, overrides
    `color: var(--ember)`.
- No other typography lifts in this task — the broader
  `h1`/`h2`/`h3`/`section`/`ul`/`header` lift is 0902's
  concern (parent plan R11).
- No test file for this — CSS-only edits don't get a Vitest
  test of their own (visual review covers them).

**Reference:** Parent plan REQUIREMENTS R6 and this sub-plan's
REQUIREMENTS R5.

**Files:**
- `web/src/lib/shared/styles/typography.css` (modify)

**Steps:**
1. Open the file. Append the `.hint` and `.hint-error` rules
   per Decisions at the end of the file (preserve existing
   font imports and `--font-size-scale` root rule).
2. Run `pnpm check` and confirm clean.
3. Commit `feat(css): add .hint / .hint-error paragraph rule
   for input rail`.

**Verify:** `pnpm lint` · `pnpm check`

### [ ] 4.2 Migrate `LoginRequest` email input to `<TextInput>`

**Created:** 2026-05-29T13:21:24Z
**Completed:**

**Why:** Auth flow's email input is the canonical input
migration — the one deliberate user-visible cosmetic change
(loses `var(--paper-alt)` background, folds to canonical) per
REQUIREMENTS R10 lives here.

**Prerequisites:** Tasks 2.2 (`<TextInput>` exists), 2.4
(`<Label>` exists), 4.1 (hint CSS rule lands).

**Decisions:**
- Replace the raw email `<input>` with `<Label>` + `<TextInput
  type="email">`. If the amended PLAN.md kept the `paper-alt`
  default (fold in), no variant prop on `<TextInput>` — the
  canonical shape applies. If the amended PLAN.md reversed
  the default and minted `variant="alt"`, pass that variant
  here.
- **Reconcile the existing `.hint` and `.inline-error` markup
  before lifting the rule.** Today's `LoginRequest.svelte:96–99`
  carries a `<div class="hint">` *below the submit button* (a
  centred disclaimer, 12 px, italic-style copy) and a separate
  `<div class="inline-error">` at line 81 *between input and
  submit*. Neither matches the input-rail "hint paragraph below
  the input" shape R5 introduces. To avoid the new `.hint` rule
  from Task 4.1 clobbering the existing disclaimer markup with
  different typography, **rename the existing
  `<div class="hint">` to a local class (e.g. `<div
  class="disclaimer">`) and the `<div class="inline-error">`
  stays untouched** (it's a single-occurrence error surface,
  not the input-rail error contract). Update the scoped
  `.hint` rule in this file's `<style>` block to target
  `.disclaimer` instead. The global `.hint` selector then
  applies only to new `<p class="hint">` paragraphs that
  Task 4.2 emits below the new `<TextInput>` if any.
- The error paragraph (if any new one is introduced below the
  input) uses `<p class="hint hint-error">` styled by
  Task 4.1's rule.
- Test rewrites: any `LoginRequest.test.ts` assertion that
  queries the `<input>` by class becomes a role/text/
  `data-test`-based query. If the test asserts on the
  `var(--paper-alt)` background specifically, drop that
  assertion (it's the deliberate cosmetic change per R10);
  document the drop in the task's Notes when complete. Existing
  `getByDataTest('login-email')` / `getByDataTest('login-submit')`
  assertions survive unchanged (`<TextInput>` and `<Button>`
  both forward `data-test` via `...rest`).
- The submit button was migrated in Task 3.7 — leave it alone
  here.

**Reference:** Sub-plan REQUIREMENTS R7, R10. Parent plan
REQUIREMENTS R8, R14.

**Files:**
- `web/src/lib/auth/components/LoginRequest.svelte` (modify)
- `web/src/lib/auth/components/LoginRequest.test.ts` (modify)

**Steps:**
1. Rename the existing `<div class="hint">` disclaimer at
   `LoginRequest.svelte:96–99` to `<div class="disclaimer">`
   and rename the scoped `.hint` rule in this file's `<style>`
   block to `.disclaimer` so the global `.hint` rule (Task 4.1)
   doesn't restyle it. Leave the `<div class="inline-error">`
   markup at line 81–83 alone — it's a one-off error surface
   not part of the input-rail contract.
2. Replace the raw `<input type="email">` with `<Label>` +
   `<TextInput type="email">`. Preserve `bind:value`,
   `placeholder`, `autocomplete`, `inputmode`, `required`,
   `data-test`, and event-handler wiring.
3. Drop the dead input CSS from the file's `<style>` block
   (including the `var(--paper-alt)` background and `14px`
   padding rules if present).
4. Update `LoginRequest.test.ts` per Decisions.
5. Run `pnpm test --run web/src/lib/auth/components/
   LoginRequest.test.ts`.
6. Run `pnpm check`.
7. Commit `refactor(auth): migrate LoginRequest email input to
   <TextInput>`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 4.3 Migrate list-related sheet inputs to `<TextInput>` / `<Textarea>`

**Created:** 2026-05-29T13:21:24Z
**Completed:**

**Why:** List-related sheets (`RenameListSheet`,
`CreateListSheet`, `EditDescriptionSheet`) share the name +
description input shape and benefit from a single migration
commit.

**Prerequisites:** Tasks 2.2 (`<TextInput>`), 2.3
(`<Textarea>`), 2.4 (`<Label>`), 4.1 (hint CSS).

**Decisions:**
- Mappings:
  - `RenameListSheet.svelte`: name `<input>` → `<Label>` +
    `<TextInput>`.
  - `CreateListSheet.svelte`: name `<input>` → `<Label>` +
    `<TextInput>`; description `<textarea>` → `<Label>` +
    `<Textarea>`.
  - `EditDescriptionSheet.svelte`: description `<textarea>` →
    `<Label>` + `<Textarea>`.
- Test rewrites: class-based queries → role/text/`data-test`-
  based. If a test asserts on the input CSS string directly,
  drop the assertion (the primitives own that styling).
- Hint / error paragraphs (if any) change to `<p class="hint">`
  / `<p class="hint hint-error">`.

**Reference:** Sub-plan REQUIREMENTS R7.

**Files:**
- `web/src/lib/list/components/RenameListSheet.svelte` (modify)
- `web/src/lib/list/components/RenameListSheet.test.ts` (modify)
- `web/src/lib/list/components/CreateListSheet.svelte` (modify)
- `web/src/lib/list/components/CreateListSheet.test.ts` (modify)
- `web/src/lib/list/components/EditDescriptionSheet.svelte`
  (modify)
- `web/src/lib/list/components/EditDescriptionSheet.test.ts`
  (modify)
- `web/src/lib/list/components/__mocks__/*.svelte` (modify only
  the mocks whose source's markup hooks change)

**Steps:**
1. For each `.svelte` file: replace raw `<input>` / `<textarea>`
   with `<Label>` + `<TextInput>` / `<Textarea>`. Preserve
   `bind:value`, attributes, event handlers.
2. Drop dead input CSS from each file's `<style>` block.
3. For each `.test.ts` file: rewrite class-based queries.
4. Run `pnpm test --run web/src/lib/list/components/`.
5. Run `pnpm check`.
6. Commit `refactor(lists): migrate list-sheet inputs to
   <TextInput> / <Textarea>`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test --run web/
src/lib/list/components/`

### [ ] 4.4 Migrate `AddEditItemSheet` name + notes to `<TextInput>` / `<Textarea>`

**Created:** 2026-05-29T13:21:24Z
**Completed:**

**Why:** `AddEditItemSheet` carries the one outlier —
the notes textarea renders in the Newsreader serif at 14 px.
This task migrates both the name input and the notes textarea,
preserving the serif/14 px override as a per-call CSS rule on
the rendered `<textarea>` (not a `<Textarea>` variant).

**Prerequisites:** Tasks 2.2 (`<TextInput>`), 2.3 (`<Textarea>`),
2.4 (`<Label>`), 4.1 (hint CSS).

**Decisions:**
- Mappings:
  - Name `<input>` → `<Label>` + `<TextInput>`. Standard
    shape.
  - Notes `<textarea>` → `<Label>` + `<Textarea>` with the
    per-call serif / 14 px override. Override mechanism per
    amended PLAN.md "Open questions" resolution: scoped
    `:global()` selector inside the sheet's `<style>` block by
    default, or a `class` prop on `<Textarea>` if the
    exploration task picked that shape.
  - Notes label may carry the `· optional` suffix span inline
    at the call site per REQUIREMENTS R4 — that's not a
    `<Label>` prop.
- Test rewrites: as in earlier input-migration tasks.

**Reference:** Sub-plan REQUIREMENTS R3, R7. Amended PLAN.md
"Open questions" resolution for the notes override mechanism.

**Files:**
- `web/src/lib/item/components/AddEditItemSheet.svelte` (modify)
- `web/src/lib/item/components/AddEditItemSheet.test.ts` (modify)
- `web/src/lib/item/components/__mocks__/AddEditItemSheet.svelte`
  (modify only if the mock surfaces a markup hook the migration
  changes)

**Steps:**
1. Replace the name `<input>` with `<Label>` + `<TextInput>`.
2. Replace the notes `<textarea>` with `<Label>` + `<Textarea>`.
   Apply the per-call serif/14 px override per the amended
   PLAN.md resolution.
3. Drop dead input CSS from the file's `<style>` block —
   except the serif/14 px rule for the notes textarea, which
   is still per-call.
4. Update `AddEditItemSheet.test.ts` per Decisions.
5. Run `pnpm test --run web/src/lib/item/components/
   AddEditItemSheet.test.ts`.
6. Run `pnpm check`.
7. Commit `refactor(items): migrate AddEditItemSheet inputs to
   <TextInput> / <Textarea>`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 4.5 Migrate `InvitePickerSheet` and `CircleScreen` email inputs to `<TextInput>`

**Created:** 2026-05-29T13:21:24Z
**Completed:**

**Why:** Both screens accept an e-mail address — invite picker
inline-with-submit, circle add-by-email card. Both migrate to
`<TextInput type="email">` consuming the input shape.

**Prerequisites:** Tasks 2.2 (`<TextInput>`), 2.4 (`<Label>`),
4.1 (hint CSS), 3.3 (the `InvitePickerSheet` submit button
already migrated).

**Decisions:**
- Mappings:
  - `InvitePickerSheet.svelte`: email row `<input>` →
    `<TextInput type="email">` inline with the submit button
    that was migrated in Task 3.3. No `<Label>` for this one
    (the picker uses placeholder + section-label header, not
    a per-input label).
  - `CircleScreen.svelte`: add-by-email `<input>` inside the
    dashed-border card → `<Label>` + `<TextInput type="email">`
    inside the existing card markup.
- Hint / error paragraphs change to `<p class="hint">` /
  `<p class="hint hint-error">`.
- Test rewrites: as in earlier input-migration tasks.

**Reference:** Sub-plan REQUIREMENTS R7.

**Files:**
- `web/src/lib/invite/components/InvitePickerSheet.svelte`
  (modify)
- `web/src/lib/invite/components/InvitePickerSheet.test.ts`
  (modify)
- `web/src/lib/privacy/components/CircleScreen.svelte` (modify)
- `web/src/lib/privacy/components/CircleScreen.test.ts` (modify)
- `web/src/lib/invite/components/__mocks__/*.svelte`,
  `web/src/lib/privacy/components/__mocks__/CircleScreen.svelte`
  (modify only if the mocks surface markup hooks the migration
  changes)

**Steps:**
1. Replace the `InvitePickerSheet` email `<input>` with
   `<TextInput type="email">` inline with the already-migrated
   submit button. Preserve `bind:value`, placeholder,
   autocomplete, data-test.
2. Replace the `CircleScreen` add-by-email `<input>` with
   `<Label>` + `<TextInput type="email">` inside the dashed-
   border card. Preserve attributes.
3. Drop dead input CSS from both files' `<style>` blocks.
4. Update both `.test.ts` files per Decisions.
5. Run `pnpm test --run` against the two touched directories.
6. Run `pnpm check`.
7. Commit `refactor(invites): migrate email inputs to
   <TextInput>`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 4.6 Migrate profile display-name input to `<TextInput>`

**Created:** 2026-05-29T13:21:24Z
**Completed:**

**Why:** The display-name input on the profile route
(`<input id="display-name" class="name-input" …>` at line 191
of `web/src/routes/(app)/profile/+page.svelte`) is the one
routes-tree input in scope. Last input migration before the
final smoke.

**Prerequisites:** Tasks 2.2 (`<TextInput>`), 2.4 (`<Label>`),
4.1 (hint CSS).

**Decisions:**
- Replace the raw display-name `<input>` with `<Label>` +
  `<TextInput>`. Preserve `bind:value`, the `id="display-
  name"`, `name`, `autocomplete`, `data-test`, and any event
  handlers.
- **R10 #4 — border-colour reconciliation.** The existing
  `.name-input` (`profile/+page.svelte:323`) is
  `border: 1px solid var(--ink)`; the canonical `<TextInput>`
  is `border: 1px solid var(--rule)`. Task 1.1 records which
  default the exploration picks (fold to `--rule`, change
  canonical to `--ink`, or mint a variant). Apply whichever
  decision is in PLAN.md Decisions; the default is fold to
  `--rule` and the migration is the deliberate exception
  acknowledged in R10.
- The route-level test (if present) is `page.test.ts` (no
  `+` prefix per `docs/frontend-layout.md` filename
  conventions). If `page.test.ts` doesn't exist for this
  route, no test update needed here — the auth e2e in Task
  5.1 exercises sign-in but not the profile display-name
  flow; manual walkthrough in the parent task 1.1's Verify
  line covers it.
- Drop the `.name-input` class CSS from the file's `<style>`
  block — `<TextInput>` owns it now (subject to the R10 #4
  decision above).

**Reference:** Sub-plan REQUIREMENTS R7. Parent plan
REQUIREMENTS R8.

**Files:**
- `web/src/routes/(app)/profile/+page.svelte` (modify)
- `web/src/routes/(app)/profile/page.test.ts` (modify if
  present)

**Steps:**
1. Replace the display-name `<input>` at line 191 with
   `<Label for="display-name">` + `<TextInput
   id="display-name">`. Preserve all other attributes and
   handlers.
2. Drop the `.name-input` CSS from the file's `<style>` block.
3. If `page.test.ts` exists for this route, update any class-
   based query in it.
4. Run `pnpm test --run web/src/routes/(app)/profile/` if a
   test file exists; otherwise skip.
5. Run `pnpm check`.
6. Commit `refactor(profile): migrate display-name input to
   <TextInput>`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

## Phase 5 — Wrap up

### [ ] 5.1 Final smoke — lint + Vitest + auth e2e happy path

**Created:** 2026-05-29T13:21:24Z
**Completed:**

**Why:** Cross-cutting confirmation that every primitive
extension, every migration commit, and the hint-CSS lift are
mutually consistent. The auth e2e happy path is the strongest
cross-cutting signal because it exercises the migrated
`LoginRequest` submit button + email input together — the
canonical mix of new primitives.

**Prerequisites:** Tasks 1.1 through 4.6 all `[x]`.

**Decisions:**
- Run `./scripts/check.sh` for the full gauntlet — sqlfluff,
  shellcheck, shfmt, vitest, pg_prove, prettier, svelte-check,
  and per the `feedback_run_lint` memory **`pnpm lint`
  explicitly** (svelte-check is not ESLint;
  `no-floating-promises` only fires under lint).
- Run the auth happy path Playwright spec
  (`web/e2e/auth.spec.ts`) — not the full e2e suite. The
  semantic-HTML sweep in 0902 is the one that needs full e2e
  coverage (tap targets and focus order across many screens);
  0901 is API + same-shape replacements, and the auth spec
  catches the cross-cutting form-binding regression risk.
- If `./scripts/check.sh` fails, fix at the source (don't
  weaken a lint rule or skip an assertion); re-run until green.
- If the auth e2e fails, diagnose the regression. The most
  likely cause is a `bind:value` or event-forwarding gap on
  the new `<TextInput>` or `<Button>` — fix the primitive,
  re-run the relevant Phase-2 Vitest, then re-run the e2e.
- The parent plan's task 1.1 Verify line lists a manual
  walkthrough of the touched flows (sign in, create list,
  rename, edit description, add item, edit notes, invite by
  e-mail, add to circle by e-mail) — that walkthrough happens
  inside the parent `/work` invocation on
  `0900_refactor_css_components`, after this sub-plan merges
  back. Not in scope here.
- No git operations in this task — the merge of
  `0901_form_primitives` back into `0900_refactor_css_
  components` happens in the parent task's `/work` invocation
  (per parent plan task 1.1 steps 4–5).

**Reference:** Parent plan task 1.1 Verify line.

**Files:**
- (none — this is a verification task)

**Steps:**
1. Run `./scripts/check.sh` and confirm green.
2. Run the auth e2e:
   `cd web && pnpm exec playwright test e2e/auth.spec.ts`.
   Confirm green.
3. Report the result. If green, mark the task `[x]` with the
   completed timestamp. If red, diagnose and fix at the
   source.

**Verify:** `./scripts/check.sh` · `cd web && pnpm exec
playwright test e2e/auth.spec.ts`
