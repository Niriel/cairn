# Requirements: Form primitives — buttons + inputs

Sub-step 9.1 of the master plan (Phase 1 of
`plans/0900_refactor_css_components/`). Extends `<Button>` with a
variant + tone + size + leadingIcon prop surface, mints three new
input primitives (`<TextInput>`, `<Textarea>`, `<Label>`), and
migrates every raw `<button>` / `<input>` / `<textarea>` call site
listed in the parent plan to the new shapes. Drops the `.hint` /
`.hint-error` paragraph rule into `typography.css` alongside the
input migration so migrated hint paragraphs render styled from day
one. No user-visible behaviour change, with the two deliberate
exceptions called out in R14.

## R1. `<Button>` gains variant + tone + size + leadingIcon

`web/src/lib/basic/components/Button.svelte` extends with:

- `variant: 'rect' | 'pill' | 'text'` — `rect` is the current
  filled-rectangle shape (today's default); `pill` is the outlined,
  capsule-shaped shape (replaces today's ad-hoc `.restore`,
  `.pill-btn.ink`, `.panel-btn`); `text` is the ghost-text shape
  (replaces today's `.whats-this`, `.add-btn`, `.invite-btn`,
  `.action`).
- `tone: 'primary' | <neutral-name> | 'destructive'` — picks the
  colour mapping. `primary` → `--accent`; the neutral tone →
  `--ink` / `--rule`; `destructive` → `--ember`. **The neutral
  tone's name is `'neutral'` or `'ink'`** — decided in the
  exploration task (Task 1.1) and applied consistently across every
  call site in the sub-plan. The parent plan's `0900` Open Questions
  section flags `'ink'` as the path of least resistance because the
  existing token vocabulary is token-name (`--ink`, `--accent`,
  `--ember`); the exploration is free to pick either as long as it
  is consistent.
- `size: 'sm' | 'md'` — derives padding and font-size. `md` is the
  current default (~12 px vertical, 16 px horizontal, 16 px text);
  `sm` is the row-level / inline-link size (~7 px vertical, 12 px
  horizontal, 12.5–13 px text).
- `leadingIcon?: IconName` — optional icon at the start of the
  label, with a fixed 8 px gap and `currentColor` stroke. Mirrors
  the gap-8 pattern repeated in `.empty-cta`, `.pill-btn`, the
  panel buttons, and the leave-list confirm row.

Existing props (`disabled`, `type`, `onclick`, `children`,
`data-test`, `aria-pressed`) carry forward unchanged. The default
prop combination (no props passed) renders the current
filled-rectangle primary shape pixel-for-pixel so existing call
sites stay visually identical.

The defaults are explicit: `variant='rect'`, `tone='primary'` (or
the chosen neutral-tone name if 0901's exploration picks `'rect'` +
neutral as the literal historical default — exploration records
the chosen default in PLAN.md Decisions), `size='md'`,
`leadingIcon=undefined`. This requirement does not pick the
defaults; it pins down that the unspecified call must reproduce
today's appearance and that the choice is made in Task 1.1 and
recorded in the sub-plan PLAN.md.

The legacy `variant: 'primary' | 'ghost' | 'destructive'` prop is
replaced by the new `variant × tone` axes. No call site in the
codebase currently passes `variant="ghost"`, so removing that name
is a no-op at the migration sites; the rewrite of
`Button.test.ts:27–34` (which currently asserts on the
`destructive` class) lands in Task 2.1.

## R2. `<TextInput>` primitive

A new `web/src/lib/basic/components/TextInput.svelte` wraps a
single-line `<input>` element. Owns the canonical input block —
`padding: 12px 14px; border: 1px solid var(--rule);
border-radius: 12px; background: var(--paper); color: var(--ink);
font: inherit; font-size: 16px; width: 100%; box-sizing:
border-box` — plus the `:focus { border-color: var(--ink); outline:
none }` state and `::placeholder { color: var(--stone) }`.

Props (final names locked in Task 1.1, shape fixed here):

- `value` with `bind:value` two-way binding.
- `type?: 'text' | 'email'` (default `'text'`). No `'password'`,
  `'number'`, `'date'` — none are needed in the current screen
  inventory.
- `id?`, `name?`, `placeholder?`, `disabled?`, `required?`,
  `autocomplete?`, `inputmode?`, `data-test?`.
- Standard event forwarding (`oninput`, `onchange`, `onblur`,
  `onkeydown`).

No variants. The one historical variant the audit found
(`LoginRequest`'s `background: var(--paper-alt)` and uniform
`14px` padding) folds into the canonical shape; this is the
deliberate user-visible change called out in R7. The exploration
task is free to reverse this and mint `<TextInput variant="alt">`
instead if it finds a strong reason, but the default decision is
fold-in.

## R3. `<Textarea>` primitive

A new `web/src/lib/basic/components/Textarea.svelte` wraps a
`<textarea>` element. Same CSS block as `<TextInput>` plus
`resize: none` and a configurable `min-height` / `rows` via prop.

The `AddEditItemSheet` notes textarea is the one outlier — it
renders in the Newsreader serif at 14 px (editorial copy feel).
This stays as a per-call-site CSS override on the rendered
`<textarea>` (e.g. via a `class` prop or a scoped `:global()`
selector inside the sheet), **not** a new variant on `<Textarea>`
— the shape only appears once.

Props mirror `<TextInput>` where applicable (`value` with
`bind:value`, `id?`, `name?`, `placeholder?`, `disabled?`,
`required?`, `data-test?`, event forwarding). Adds
`rows?: number` and `minHeight?: string` (CSS length); the
exploration task picks the exact name set.

## R4. `<Label>` primitive

A new `web/src/lib/basic/components/Label.svelte` renders a
`<label>` element with the recurring label typography (12 px,
`var(--stone)`, weight 500). An `uppercase` boolean prop renders
the `AddEditItemSheet` field-label shape (uppercase, weight 600).

Props:

- `for?: string` — optional. When supplied, the rendered element
  carries `for={for}`. When omitted, no `for` attribute is
  emitted (use this shape when the `<Label>` wraps its input
  instead of pointing at one by id). This matches `<TextInput>`'s
  `id?` being optional — the two APIs compose either way.
- `uppercase?: boolean` — see above.
- `children` (snippet) — the label text.
- `data-test?: string`.

The `· optional` suffix span on the notes label stays inline at
the call site — it's one occurrence and minting a prop for it
would be overkill.

## R5. `.hint` and `.hint-error` global rule lands in `typography.css`

`web/src/lib/shared/styles/typography.css` gains two paragraph
rules:

- `.hint` — 13 px, `var(--stone)`, no margin-top, small
  margin-bottom matching the input rail spacing in the existing
  sheets.
- `.hint-error` — same metrics, colour `var(--ember)`. Applied
  alongside `.hint` (i.e. `<p class="hint hint-error">`).

This rule lands in **0901**, not 0902 — the input-migration sweep
in this sub-plan starts writing hint paragraphs against this
selector immediately, so the rule must exist before any input
migration task runs. (The rest of the typography lift — `h1`,
`h2`, `h3`, semantic-tag rules — is 0902's concern and is
explicitly not in scope here.)

The CSS rule lift task lands first inside the input-migration
phase so the dependency ordering is obvious to the executor.

## R6. Raw `<button>` call sites migrate to `<Button>`

Every raw `<button>` listed in the parent plan's REQUIREMENTS R7
(`plans/0900_refactor_css_components/REQUIREMENTS.md:139–166`)
migrates to `<Button>` (or stays as `<IconButton>` where the shape
is icon-only — `<IconButton>` is unchanged in this sub-plan per
the parent plan's R2). Task 1.1's exploration table maps every
call site to a `variant × tone × size` cell and that table is the
authoritative reference for the migration tasks.

Migration is grouped by domain — one task per screen / sheet
family — so the diff in each commit stays reviewable:

- Item-related sheets (`AddEditItemSheet`, `DeleteItemSheet`).
- List-related sheets (`CreateListSheet`, `RenameListSheet`,
  `EditDescriptionSheet`, `ListOverflowSheet`).
- Invite / circle UI (`InvitePickerSheet`, `CircleScreen`,
  `InvitesBanner`, `BlockedScreen`).
- Profile (`ProfileSheet`,
  `web/src/routes/(app)/profile/+page.svelte`,
  `AvatarSourceSheet`).
- Settings / Privacy (`SettingsScreen`, `PrivacyScreen` — the
  segmented-control and chooser-grid carve-outs stay raw).
- Screen-level CTAs (`ItemsScreen`, `ListsScreen`,
  `InvitesInboxScreen`, `TrashScreen`).
- Auth (`LoginRequest` submit button).

Carve-outs (from the parent plan's R7) stay as raw `<button>`
elements and are explicitly skipped in the migration tasks:
`VoteControl.svelte` thumb, `Accordion.svelte` header,
the `(see more) / (see less)` expander in `ListsScreen.svelte`,
the `Snackbar.svelte` `.action` button **and the
`UndoSnackbar.svelte` `.action` button** (both live inside their
own snackbar primitive and are not used elsewhere),
the segmented-control buttons in `PrivacyScreen.svelte`
(`.option`, `.whats-a-circle`), and the chooser-grid buttons in
`SettingsScreen.svelte` (`.size-option`, `.theme-option`).

## R7. Raw `<input>` and `<textarea>` call sites migrate to the new primitives

Every raw `<input>` / `<textarea>` listed in the parent plan's
REQUIREMENTS R8 migrates to `<Label>` + `<TextInput>` or
`<Label>` + `<Textarea>`. Migration is grouped by domain — one
task per screen / sheet family:

- Auth (`LoginRequest.svelte` email input).
- List sheets (`RenameListSheet.svelte` name,
  `CreateListSheet.svelte` name + description,
  `EditDescriptionSheet.svelte` description).
- Item sheet (`AddEditItemSheet.svelte` name + notes — the notes
  textarea carries the per-call serif / 14 px override per R3).
- Invite / circle (`InvitePickerSheet.svelte` email row,
  `CircleScreen.svelte` add-by-email card).
- Profile (`web/src/routes/(app)/profile/+page.svelte`
  display-name input at line 191).

Carve-outs (from the parent plan's R8): hidden
`<input type="file">` triggers in `AvatarSourceSheet.svelte` and
the `<canvas>` in `AvatarCropScreen.svelte` are not text inputs
and stay as-is.

The `LoginRequest` email input is the **one deliberate cosmetic
exception** (per R14 below): its `var(--paper-alt)` background
and uniform `14px` padding both fold into the canonical
`<TextInput>` shape (`var(--paper)` background, `12px 14px`
padding). The exploration task may reverse this to a
`<TextInput variant="alt">` if it finds a strong reason; default
is fold-in.

## R8. Co-located Vitest tests for every new primitive

Every new `.svelte` primitive ships with a matching `.test.ts` in
the same directory per `CLAUDE.md` "Tests and quality
(non-negotiable)" and `docs/testing.md`. Coverage per primitive:

- `Button.test.ts` — at least one assertion per new
  `variant × tone × size` combination plus a `leadingIcon`
  rendering check. Existing assertions (`disabled`, `type`,
  `onclick`, `aria-pressed`, `data-test`) keep passing; the
  legacy `classList.contains('destructive')` assertion at
  `Button.test.ts:27–34` rewrites to an equivalent assertion
  under the new API (either a tone-class check or a `data-test`-
  based assertion — the rewrite is part of Task 2.1).
- `TextInput.test.ts` — renders an `<input>` of the right `type`,
  `bind:value` round-trip works, `disabled` is honoured, events
  forward (`oninput`, `onchange`, `onblur`, `onkeydown`),
  placeholder renders, optional `id`/`name`/`autocomplete`/
  `inputmode`/`data-test` pass through.
- `Textarea.test.ts` — same shape as `TextInput.test.ts`, plus
  `rows` / `minHeight` honoured and `resize: none` rendered
  (assertion on the rendered style or class, not on the CSS
  string).
- `Label.test.ts` — renders a `<label>`, `for` attribute appears
  iff `for` prop is set, `uppercase` prop toggles the
  field-label shape (class or style assertion), `data-test`
  passes through, slot/children render.

Tests assert user-visible behaviour, not CSS strings. The
internal CSS values are a visual review concern, not a unit-test
concern.

## R9. Existing tests update in the same commit as the source change

Per `CLAUDE.md` "Tests out of sync", every migration task lists
the matching `.test.ts` file(s) in its Files list and updates
assertions in the same commit as the source change. Assertions
stay semantically equivalent — selector-level rewrites are
allowed and expected (a query for `.btn-submit` becomes a query
against rendered text, role, or `data-test`).

The known case to flag explicitly:
`web/src/lib/basic/components/Button.test.ts:27–34` currently
asserts `classList.contains('destructive')`. Under the new
`variant × tone` API this becomes either a `tone` class check or
a `data-test`-based assertion. Task 2.1 (the `<Button>`
extension) owns this rewrite.

If a per-screen migration task surfaces a Vitest assertion that
queries for a now-removed class (e.g. `LoginRequest.test.ts`
querying for the `var(--paper-alt)` background), the task
rewrites it to the equivalent assertion against the new
`<TextInput>` shape. The expected rewrites are listed in the
migration tasks' Decisions sections.

## R10. No user-visible behaviour change beyond two deliberate exceptions

Every existing Vitest component test and the auth happy-path
Playwright e2e (`web/e2e/auth.spec.ts`) must keep passing.
Selector-level rewrites are allowed (per R9). Copy stays
identical; tap targets stay where they were; focus order is
unchanged.

The deliberate user-visible changes are:

1. `LoginRequest`'s email input loses its `var(--paper-alt)`
   background and uniform `14px` padding; it harmonises to the
   canonical `<TextInput>` shape (`var(--paper)` background,
   `12px 14px` padding). Per R7, the exploration task may reverse
   this by minting `<TextInput variant="alt">` — default is
   fold-in.
2. **Primary-tone colour reconciliation.** Today's call sites for
   the recurring filled-rect "primary" button drift between
   `var(--accent)` (`EditDescriptionSheet.svelte:.btn-save`,
   `RenameListSheet.svelte:.btn-save`, `CreateListSheet.svelte`
   submit) and `var(--ink)` (`AddEditItemSheet.svelte:.btn-submit`,
   `ItemsScreen.svelte:.empty-cta`, `ListsScreen.svelte:.empty-cta`).
   Task 1.1 picks one colour per mapped cell and records the
   chosen reconciliation in PLAN.md Decisions; every site that
   moves to a different colour is part of this deliberate change.
   The default reconciliation is:
   - Filled-rect sheet submits (`.btn-save`, `.btn-submit`) map to
     `tone="primary"` (`--accent`). `.btn-submit` shifts from
     `--ink` to `--accent`.
   - The illustrated empty-state CTA (`.empty-cta`) maps to the
     neutral/ink tone (`--ink`) per `docs/ui.md` "Empty-state
     copy and style" (illustrated variant pins
     `background: var(--ink); color: var(--paper)`).
   Exploration may overturn either default with rationale; the
   final reconciliation table is the source of truth for Phase 3
   mappings.
3. **`.panel-btn` shape decision.** Today's `.panel-btn`
   (`ItemsScreen.svelte:514`) is `border-radius: 10px` — a rounded
   rectangle, not the "outlined, capsule-shaped" pill that R1
   describes. Task 1.1 picks one of (a) reshape to a true pill
   (silent re-shape acknowledged here as deliberate), (b) keep as
   raw `<button>` (one-off carve-out per the master plan rule),
   or (c) mint a fourth `<Button>` variant (e.g. `rect-outline`).
   Whichever Task 1.1 picks is recorded in PLAN.md Decisions.
4. **`name-input` border colour decision.** The display-name input
   on `web/src/routes/(app)/profile/+page.svelte:323` is
   `border: 1px solid var(--ink)`; canonical `<TextInput>` is
   `border: 1px solid var(--rule)`. Task 1.1 picks one of (a) fold
   to `--rule` (canonical, silent change acknowledged here as
   deliberate), (b) change the canonical border to `--ink`, or
   (c) mint a `<TextInput variant="…">` for the profile case.
5. The mechanical selector renames driven by the markup change
   (class names → component-rendered DOM, `data-test`-based
   queries) are not user-visible but are visible to tests.
   Flagged for full disclosure.

Beyond these, the contract is that 0901 is invisible to the
product. The parent plan's task 1.1 Verify line specifies a
manual walkthrough of the touched flows (sign in, create list,
rename, edit description, add item, edit notes, invite by
e-mail, add to circle by e-mail) — every form should look and
behave identically to pre-refactor *except* at the locations
named above.

## R11. Tier convention — primitives live in `basic/`

Per `docs/frontend-layout.md` tier rules and the parent plan's
R15: the new primitives live in
`web/src/lib/basic/components/`. `Button.svelte` extends in
place. `TextInput.svelte`, `Textarea.svelte`, `Label.svelte` are
new files. Each ships with its co-located `.test.ts` in the same
directory. No new dependencies on `shared/` or any per-domain
folder.

## Non-requirements (explicitly excluded)

- **`<EmptyState>` extraction.** Lives in 0902, not 0901.
- **Global typography rules keyed off semantic tags** (`h1`,
  `h2`, `h3`, `ul`, etc.). The `.hint` / `.hint-error` paragraph
  rules from R5 are the only typography rule landing in 0901;
  everything else in the parent plan's R11 lands in 0902.
- **Semantic-HTML sweep.** `<div class="header">` → `<header>`,
  `<div class="rows">` → `<ul>`, etc. is 0902's concern.
- **`<Icon>` `color` prop and pure-colour wrapper removal.**
  Lands in 0902.
- **Renaming `<IconButton>`, `<RefreshButton>`, `<MoreButton>`,
  or `<Fab>`.** These already cover their roles cleanly per the
  parent plan's R2 — not touched.
- **A compound `<Field>` wrapper.** Rejected at the parent-plan
  level; three small primitives composed at call sites is the
  chosen shape.
- **Variants for one-off shapes.** The carve-outs listed in R6
  (VoteControl thumb, Accordion header, `(see more)` expander,
  Snackbar `.action`, segmented-control, chooser-grid) stay as
  raw `<button>` elements per the master plan rule "if a shape
  only appears once, keep it inline."
- **Migrating file inputs or the avatar crop canvas.** The
  hidden `<input type="file">` triggers in `AvatarSourceSheet`
  and the `<canvas>` in `AvatarCropScreen` are not text inputs
  and have no visible surface to consolidate.
- **`<input type="password">`, `<input type="number">`,
  `<input type="date">`, etc.** Cairn's current screen inventory
  has none; `<TextInput>` deliberately exposes only `'text'` and
  `'email'`. Adding types as future screens need them is a
  follow-up.
- **Doc edits.** No `docs/*.md` change is expected. The parent
  plan's audit found no doc divergence in the form-primitives
  half. If a migration task surfaces a real divergence,
  `/work` flags it to the user per its skill — `/write-plan`
  resolves it.
- **The 0900 wrap-up.** Running `./scripts/check.sh` on
  `0900_refactor_css_components` after merge and the
  `git merge --no-ff` itself happen in a future `/work`
  invocation on `0900_refactor_css_components` (task 1.1 of the
  parent plan), not inside this sub-plan.
