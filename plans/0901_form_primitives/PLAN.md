# Plan: Form primitives — buttons + inputs

Sub-step 9.1 of the master plan (Phase 1 of
`plans/0900_refactor_css_components/`). Extends `<Button>`, mints
three new input primitives (`<TextInput>`, `<Textarea>`,
`<Label>`), lifts the `.hint` / `.hint-error` paragraph rule to
`typography.css`, and migrates every raw `<button>` / `<input>` /
`<textarea>` call site in the parent plan's R7–R8 to the new
shapes. No user-visible behaviour change beyond the two deliberate
exceptions called out in R10.

## Context

The parent plan
(`plans/0900_refactor_css_components/PLAN.md`) is an orchestration
plan that cuts the step-9 CSS-refactor into two sub-branches.
This sub-plan is the first half — the form-primitives sweep. The
audit numbers from the parent plan: ~25 raw `<button>` call
sites across ~6 recurring shapes, ~11 raw `<input>` / `<textarea>`
call sites all repeating the same CSS block, and no shared input
primitive at all.

The form-primitives half lands first because (a) the button
migration touches the same sheets the semantic-HTML sweep in 0902
will touch, and doing the button migration first means 0902's
sweep is markup-only (no API design happening in the same commits
as semantic restructuring); (b) running the button + input
migration together surfaces any prop-shape disagreements before
they propagate across 30 files.

The parent plan's R1–R8 specify the contracts; this sub-plan's
REQUIREMENTS.md mirrors them with sub-plan-local renumbering
(R1–R11) and pins down the exploration-task hand-off explicitly.

## Decisions

**Exploration phase as the first task, not pre-resolved here.**
The parent plan deliberately defers three API-shape questions to
0901: (a) `tone` naming (`'neutral'` vs `'ink'`), (b) exact
defaults for the unspecified `<Button>` call, and (c) whether
`LoginRequest`'s `var(--paper-alt)` background folds into the
canonical `<TextInput>` shape or mints a `variant="alt"`. The
right home for those decisions is a single exploration task at
the top of the sub-plan that reads the existing
`Button.svelte` plus a representative raw button and raw input,
proposes the API surface, and writes the chosen values into this
PLAN.md's Decisions section before any implementation task runs.
Pre-resolving them in `/write-plan` (e.g. via `AskUserQuestion`)
would short-circuit the audit-reading the exploration is
specifically structured to do. **The exploration task amends
this PLAN.md** — that is the expected output, and the
implementation tasks reference the amended decisions, not the
draft below.

**Sub-plan groups migration by domain, one task per
screen-or-sheet family.** Six button-migration tasks and five
input-migration tasks (plus the hint-CSS lift as the first input
task). Smaller granularity (one task per `.svelte` file) would
explode the task count for little reviewer benefit; larger
granularity (all button migration in one task) would make the
diff hard to review. Domain-grouped tasks keep each commit to
1–4 files and let a reviewer hold the whole context in mind.

**Button migration sweep runs before input migration sweep.**
Two reasons: (a) the `Button.test.ts:27–34`
`classList.contains('destructive')` rewrite lands inside the
`<Button>` extension task (2.1) and the button-migration sweep
exercises the new API end-to-end before the input primitives
join the picture; (b) several files touched by both sweeps
(`AddEditItemSheet`, `CreateListSheet`, `RenameListSheet`,
`EditDescriptionSheet`, `InvitePickerSheet`, `CircleScreen`,
`LoginRequest`, the profile route) get two distinct commits —
one for the button shape change and one for the input shape
change — which keeps the per-commit blast radius small. The
ordering also matches the parent plan's task 1.1 Decisions
section: "(d) Button migration sweep ... (e) Input migration
sweep — same per-domain breakdown."

**The `.hint` / `.hint-error` CSS rule lands as the first task
of the input-migration phase, not at the end of the primitives
phase.** This is a scheduling choice for executor clarity: the
hint paragraphs first appear in the migrated `<TextInput>` /
`<Textarea>` sheets, so locating the CSS lift immediately before
the input migration starts makes the dependency edge obvious. It
also keeps Phase 2 (primitives) about minting new components
only, not about side-effecting the global stylesheet.

**The `AddEditItemSheet` notes textarea's serif / 14 px shape is
a per-call CSS override, not a `<Textarea>` variant.** Per the
parent plan's R3: the shape only appears once. Adding a variant
to a primitive for one caller would explode the API. The
override lands on the rendered `<textarea>` element either via
a `class` prop on `<Textarea>` (if the exploration task picks
that shape) or via a scoped `:global()` selector inside the
sheet's `<style>` block. Exploration records the chosen
mechanism.

**Each migration task lists the matching `.test.ts` in its
Files list and updates assertions in the same commit.** Per
`CLAUDE.md` "Tests out of sync". This is non-negotiable: a
commit that leaves a test querying a removed class is a broken
commit. The migration tasks call out the rewrites expected
(e.g. a class-based query becomes a `data-test` or role-based
query) in their Decisions sections.

**Three small primitives, no `<Field>` wrapper.** Decided at the
parent-plan level; restated here for completeness. Hint / error
text is a plain `<p class="hint">` / `<p class="hint hint-error">`
at the call site, styled by the global rule from R5.

**No new `tokens.css` or `reset.css` edits.** The primitives
reuse the existing tokens (`--ink`, `--accent`, `--ember`,
`--rule`, `--paper`, `--stone`). No new token name is needed.
The parent plan's R15 confirms.

---

*The sub-sections below are added by Task 1.1 after reading the
existing code. They supersede any draft values in the sections
above and are the authoritative reference for Phases 2–4.*

### Open questions — resolved

- **`tone` name: `"ink"`** (not `"neutral"`). Token vocabulary
  has `--ink`, `--accent`, `--ember`, `--sage`; no `--neutral`
  token exists. Using `"ink"` keeps prop names consistent with
  the existing token conventions.

- **`<Button>` defaults: `variant='rect'`, `tone='primary'`,
  `size='md'`, `leadingIcon=undefined`.** The no-props-passed
  call renders today's filled-rectangle primary shape
  (`background: var(--accent); color: var(--paper)`) unchanged.

- **`LoginRequest` paper-alt: fold into canonical.** The
  `background: var(--paper-alt)` and uniform `14px` padding in
  the current email input fold into the canonical `<TextInput>`
  shape (`background: var(--paper); padding: 12px 14px`). This
  is deliberate cosmetic exception #1 per R10. No
  `<TextInput variant="alt">` is minted.

- **Notes override mechanism: scoped `:global()` selector.**
  The `AddEditItemSheet` notes textarea's Newsreader-serif /
  14 px shape stays as a per-call CSS override implemented via a
  `:global()` selector scoped to the sheet's `<style>` block,
  targeting the rendered `<textarea>` by its `id` attribute.
  No `class` prop is added to `<Textarea>`.

- **`<Textarea>` sizing: expose both `rows` and `minHeight`.**
  All three current textarea call sites use CSS `min-height`
  (88 px in `AddEditItemSheet`; `4rem` in `CreateListSheet` and
  `EditDescriptionSheet`). Both `rows?: number` and
  `minHeight?: string` are exposed, mutually exclusive; callers
  pass one or the other.

- **Tone-render shape: class-based with `tone-` prefix.**
  `<Button>` renders the tone as a CSS class on the `<button>`
  element using `class:tone-{name}` (e.g.
  `class:tone-destructive={tone === 'destructive'}`). Tests
  assert: `expect(button).toHaveClass('tone-destructive')`.
  This composes with the existing `class:primary={…}` pattern
  and keeps tests grep-able. Similarly, `variant` renders as a
  plain class (`class:rect`, `class:pill`, `class:text`) and
  `size` as `class:sm` / `class:md`.

- **`.panel-btn` shape: option (a) — reshape to true pill.**
  `ItemsScreen`'s `.panel-btn` (border-radius: 10px, border:
  rule) maps to `<Button variant="pill" tone="ink" size="sm">`
  with leadingIcon. Deliberate visual changes: border-radius
  10 px → 999 px; border-color `--rule` → `--ink` (edit button).
  Both are part of R10's deliberate exception list. See R10 #3
  in the amended table below.

- **`name-input` border: option (a) — fold to `--rule`.**
  The profile display-name input's `border: 1px solid var(--ink)`
  folds into the canonical `<TextInput>` border
  (`1px solid var(--rule)`). Deliberate cosmetic change per
  R10 #4.

### Primary-tone colour reconciliation table

| Call site | Old bg | New tone | New bg |
|-----------|--------|----------|--------|
| `AddEditItemSheet.btn-submit` | `--ink` | `tone="primary"` | `--accent` |
| `EditDescriptionSheet.btn-save` | `--accent` | `tone="primary"` | `--accent` (no change) |
| `RenameListSheet.btn-save` | `--accent` | `tone="primary"` | `--accent` (no change) |
| `CreateListSheet` submit | `--accent` | `tone="primary"` | `--accent` (no change) |
| `ItemsScreen.empty-cta` | `--ink` | `tone="ink"` | `--ink` (no change) |
| `ListsScreen.empty-cta` | `--ink` | `tone="ink"` | `--ink` (no change) |
| `InvitesInboxScreen.empty-cta` | `--ink` | `tone="ink"` | `--ink` (no change) |
| `InvitePickerSheet.send-btn` | `--ink` | `tone="ink"` | `--ink` (no change) |

**`tone="ink"` on `variant="rect"` = `background: var(--ink);
color: var(--paper); border: none`.** This is the filled-dark
style documented in `docs/ui.md` "Illustrated empty state"
("`background: var(--ink); color: var(--paper)`").

**Additional R10 deliberate changes:**

- **R10 #5 — Cancel-button fill change.** `.btn-cancel` and
  similar "backward" rect buttons shift from outlined
  (paper bg, rule border, ink text) to filled-dark
  (`background: var(--ink); color: var(--paper)`), because
  `tone="ink"` on `variant="rect"` is the filled-ink shape.
  The button-pair distinction post-migration: Cancel (dark) vs
  Submit (accent) — two distinct colours. The outlined look was
  inconsistent with the `tone="ink"` semantics.

- **R10 #3 — `.panel-btn` pill reshape.** Border-radius
  10 px → 999 px; edit-button border-color `--rule` → `--ink`.

- **R10 #4 — `.name-input` border fold.** Profile display-name
  input border `--ink` → `--rule` (canonical `<TextInput>`).

### Button migration table

| Today's class | File | variant | tone | size | leadingIcon |
|---|---|---|---|---|---|
| `.btn-cancel` | `AddEditItemSheet`, `EditDescriptionSheet`, `DeleteItemSheet`, `ListOverflowSheet` (confirm-cancel) | `rect` | `ink` | `md` | — |
| `.btn-submit` | `AddEditItemSheet` | `rect` | `primary` | `md` | — |
| `.btn-save` | `EditDescriptionSheet`, `RenameListSheet` | `rect` | `primary` | `md` | — |
| `.btn-delete` | `DeleteItemSheet` | `rect` | `destructive` | `md` | — |
| `.confirm-leave` | `ListOverflowSheet` | `rect` | `destructive` | `sm` | — |
| submit (`type="submit"`) | `CreateListSheet` | `rect` | `primary` | `md` | — |
| cancel (`type="button"`) | `CreateListSheet` | `rect` | `ink` | `md` | — |
| `.row` (Rename, EditDesc, ManageMembers, ViewBin) | `ListOverflowSheet` | `text` | `ink` | `md` | — |
| `.row-delete` (Delete list) | `ListOverflowSheet` | `text` | `destructive` | `md` | — |
| `.row` (Leave list) | `ListOverflowSheet` | `text` | `ink` | `md` | — |
| `.invite-btn` (pill, circle rows) | `InvitePickerSheet` | `pill` | `ink` | `sm` | — |
| `.send-btn` | `InvitePickerSheet` | `rect` | `ink` | `md` | — |
| `.remove-btn` | `CircleScreen` | `pill` | `destructive` | `sm` | — |
| `.multi-row` | `InvitesBanner` | `text` | `ink` | `md` | — |
| `.unblock-btn` | `BlockedScreen` | `pill` | `ink` | `sm` | — |
| `.row` actions | `ProfileSheet` | `text` | `ink` | `md` | — |
| `.row` actions | `AvatarSourceSheet` | `text` | `ink` | `md` | — |
| `.pill-btn.ink` | profile `+page.svelte` | `pill` | `ink` | `sm` | `pencil` |
| `.pill-btn.ember` | profile `+page.svelte` | `pill` | `destructive` | `sm` | — |
| `.save-btn` | profile `+page.svelte` (TopBar) | `rect` | `ink` | `sm` | — |
| `.upload-action-btn` | profile `+page.svelte` | `rect` | `ink` | `md` | — |
| `.profile-chip` | `SettingsScreen` | `text` | `ink` | `md` | — |
| `.nav-row` | `SettingsScreen`, `PrivacyScreen`, `InvitesInboxScreen` | `text` | `ink` | `md` | — |
| `.panel-btn` (Edit) | `ItemsScreen` | `pill` | `ink` | `sm` | `pencil` |
| `.panel-btn.destructive` (Delete) | `ItemsScreen` | `pill` | `destructive` | `sm` | `trash` |
| `.empty-cta` | `ItemsScreen`, `ListsScreen`, `InvitesInboxScreen` | `rect` | `ink` | `md` | `plus` |
| `.row-nav` (list-row navigation) | `ListsScreen` | `text` | `ink` | `md` | — |
| `.restore` | `TrashScreen` | `pill` | `ink` | `sm` | — |
| `.restore` | `DeletedListsScreen` | `pill` | `ink` | `sm` | — |
| "Not now" (left) | `PostAcceptPromptSheet` | `rect` | `ink` | `md` | — |
| "Add to circle" (right) | `PostAcceptPromptSheet` | `rect` | `primary` | `md` | — |
| "Got it" | `CircleExplainerSheet` | `rect` | `ink` | `md` | — |
| `.resend` | `LoginCheck` | `text` | `primary` | `sm` | — |

**Carve-outs (stay raw `<button>`):** `VoteControl.svelte` thumb;
`Accordion.svelte` header; `(see more)/(see less)` expander in
`ListsScreen`; `Snackbar.svelte` `.action`; `UndoSnackbar.svelte`
`.action`; `PrivacyScreen` `.option` / `.whats-a-circle`;
`SettingsScreen` `.size-option` / `.theme-option`; profile
`.icon-btn` (×, back-arrow — icon-only, stays raw).

### Button CSS values per `variant × tone × size`

Base styles apply to all `<button>` renders regardless of
variant/tone:
```css
button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  line-height: 1;
  white-space: nowrap;
}
```

**`variant="rect"`** (filled rectangle):

| tone | background | color | border | border-radius |
|---|---|---|---|---|
| `primary` | `var(--accent)` | `var(--paper)` | none | 12 px |
| `ink` | `var(--ink)` | `var(--paper)` | none | 12 px |
| `destructive` | `var(--ember)` | `var(--paper)` | none | 12 px |

Size padding / font-size:
- `md`: `padding: 12px 20px; font-size: 15px`
- `sm`: `padding: 8px 14px; font-size: 13px`

**`variant="pill"`** (outlined capsule):

| tone | background | color | border |
|---|---|---|---|
| `primary` | transparent | `var(--accent)` | `1px solid var(--accent)` |
| `ink` | transparent | `var(--ink)` | `1px solid var(--ink)` |
| `destructive` | transparent | `var(--ember)` | `1px solid var(--rule)` |

`border-radius: 999px` for all pill tones. Size:
- `sm`: `padding: 7px 14px; font-size: 12.5px; gap: 6px`
- `md`: `padding: 10px 18px; font-size: 14px; gap: 6px`

**`variant="text"`** (ghost row / inline-link):

| tone | color | background | border |
|---|---|---|---|
| `primary` | `var(--accent)` | transparent | none |
| `ink` | `var(--ink)` | transparent | none |
| `destructive` | `var(--ember)` | transparent | none |

Size:
- `md`: `padding: 12px 18px; width: 100%; font-size: 15px; font-weight: 500; text-align: left; gap: 12px`
- `sm`: `padding: 4px 8px; font-size: 13px; gap: 6px` (inline-link)

**`leadingIcon`:** Renders an `<Icon name={leadingIcon} size={iconSize}>` before
the children slot with `gap: 8px` (icon is 14 px for `sm`,
16 px for `md`). No icon when `leadingIcon` is undefined.

**Focus / disabled states (all variants):**
- `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }`
- `:disabled { opacity: 0.5; cursor: default }`

### Input primitive prop surfaces

**`<TextInput>`**
```ts
type Props = {
  value: string;
  type?: 'text' | 'email';    // default 'text'
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  autocomplete?: string;
  inputmode?: string;
  'data-test'?: string;
  oninput?: (e: Event) => void;
  onchange?: (e: Event) => void;
  onblur?: (e: FocusEvent) => void;
  onkeydown?: (e: KeyboardEvent) => void;
};
```
CSS block:
```css
input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--rule);
  border-radius: 12px;
  background: var(--paper);
  color: var(--ink);
  font: inherit;
  font-size: 16px;
  box-sizing: border-box;
}
input:focus { outline: none; border-color: var(--ink); }
input::placeholder { color: var(--stone); }
```

**`<Textarea>`**
Same props as `<TextInput>` minus `type` and `inputmode`, plus:
```ts
  rows?: number;
  minHeight?: string;   // CSS length, e.g. '88px' or '4rem'
```
CSS block: same as `<TextInput>` plus `resize: none`.
`minHeight` renders as `min-height: {minHeight}` on the
`<textarea>`; `rows` renders as the `rows` attribute (if both
are passed, `minHeight` wins and `rows` is ignored — document
this in a type-narrowing overload comment).

**`<Label>`**
```ts
type Props = {
  for?: string;
  uppercase?: boolean;   // default false
  children: Snippet;
  'data-test'?: string;
};
```
CSS:
```css
label { font-size: 12px; color: var(--stone); font-weight: 500; }
label.uppercase {
  font-size: 12px; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase;
}
```

## Architecture

### Branches

```
main
 └─ 0900_refactor_css_components
     └─ 0901_form_primitives          ← this sub-plan's branch
```

This sub-plan's branch is already cut from
`0900_refactor_css_components` and checked out. It merges back
into `0900_refactor_css_components` via `--no-ff` once every
task is `[x]` and the final smoke task passes — that merge is
done by `/work` on the parent task (`1.1` in
`plans/0900_refactor_css_components/TASKS.md`), not inside this
sub-plan.

### New files

- **`web/src/lib/basic/components/TextInput.svelte`** — single-
  line text input primitive (Task 3.1).
- **`web/src/lib/basic/components/TextInput.test.ts`** — Vitest
  coverage (Task 3.1).
- **`web/src/lib/basic/components/Textarea.svelte`** — multi-
  line text input primitive (Task 3.2).
- **`web/src/lib/basic/components/Textarea.test.ts`** (Task
  3.2).
- **`web/src/lib/basic/components/Label.svelte`** — form label
  primitive (Task 3.3).
- **`web/src/lib/basic/components/Label.test.ts`** (Task 3.3).

### Modified files (primitives + global CSS)

- **`web/src/lib/basic/components/Button.svelte`** — extend with
  `variant: 'rect'|'pill'|'text'`, `tone: 'primary'|<neutral-
  name>|'destructive'`, `size: 'sm'|'md'`, `leadingIcon?:
  IconName` (Task 2.1). Default prop combination reproduces
  today's filled-rectangle shape pixel-for-pixel.
- **`web/src/lib/basic/components/Button.test.ts`** — add
  assertions for every new `variant × tone × size` combination
  plus `leadingIcon` rendering; rewrite the
  `classList.contains('destructive')` assertion at lines 27–34
  to an equivalent assertion under the new API (Task 2.1).
- **`web/src/lib/shared/styles/typography.css`** — append
  `.hint` (13 px, `var(--stone)`) and `.hint-error` (same
  metrics, `var(--ember)`) paragraph rules (Task 4.1). No other
  edits to this file in 0901 — the broader typography lift is
  0902's concern.

### Modified files (button migration sweep — Phase 3)

Each task in Phase 3 modifies a domain-grouped set of `.svelte`
files and updates the matching co-located `.test.ts`:

- **Item sheets (Task 3.1)** — `AddEditItemSheet.svelte` and its
  test, `DeleteItemSheet.svelte` and its test.
- **List sheets (Task 3.2)** — `CreateListSheet.svelte` (+ test),
  `RenameListSheet.svelte` (+ test),
  `EditDescriptionSheet.svelte` (+ test),
  `ListOverflowSheet.svelte` (+ test). The confirm-state buttons
  (`.confirm-cancel`, `.confirm-leave`, `.row-delete`) in
  `ListOverflowSheet` are part of this sweep.
- **Invite / circle UI (Task 3.3)** —
  `InvitePickerSheet.svelte` (+ test, includes `.send-btn` and
  the second `.invite-btn`), `CircleScreen.svelte` (+ test,
  includes `.remove-btn`), `InvitesBanner.svelte` (+ test,
  includes `.multi-row`), `BlockedScreen.svelte` (+ test,
  includes `.unblock-btn`).
- **Profile (Task 3.4)** — `ProfileSheet.svelte` (+ test,
  `.row` actions), `web/src/routes/(app)/profile/+page.svelte`
  (+ `page.test.ts` if present; the `.pill-btn.ink` /
  `.pill-btn.ember` buttons), `AvatarSourceSheet.svelte`
  (+ test, the `.row` actions; the hidden `<input type="file">`
  triggers are carve-outs and stay).
- **Settings / Privacy (Task 3.5)** — `SettingsScreen.svelte`
  (+ test, the `.nav-row` and `.profile-chip` rows;
  `.size-option` / `.theme-option` chooser-grid buttons are
  carve-outs and stay raw), `PrivacyScreen.svelte` (+ test,
  the `.nav-row` rows; `.option` / `.whats-a-circle` segmented-
  control buttons are carve-outs and stay raw).
- **Screen-level CTAs (Task 3.6)** — `ItemsScreen.svelte`
  (+ test, `.panel-btn` × `.destructive` and `.empty-cta`),
  `ListsScreen.svelte` (+ test, `.empty-cta` and `.row-nav`;
  the `(see more) / (see less)` expander is a carve-out and
  stays), `InvitesInboxScreen.svelte` (+ test, `.empty-cta`
  and `.nav-row` if present), `TrashScreen.svelte` (+ test,
  `.restore`).
- **Auth (Task 3.7)** — `LoginRequest.svelte` (+ test) — the
  submit button only; the email input is part of Task 4.2.

### Modified files (input migration sweep — Phase 4)

Cairn's per-domain folders are **singular** — `item/`, `list/`,
`invite/`, `auth/`, `profile/`, `privacy/`. `CircleScreen`,
`BlockedScreen`, and `PrivacyScreen` all live in
`web/src/lib/privacy/components/`. `TrashScreen.svelte` lives in
`web/src/lib/item/components/` (not `list/`). The lists below
reflect the on-disk layout.

- **Hint CSS lift (Task 4.1)** —
  `web/src/lib/shared/styles/typography.css` (modify; the only
  Phase 4 task that doesn't touch a `.svelte`).
- **Auth (Task 4.2)** —
  `web/src/lib/auth/components/LoginRequest.svelte` (+ test) —
  email input → `<Label>` + `<TextInput type="email">`. **This is
  one of the deliberate user-visible cosmetic changes (per R10)**:
  the `var(--paper-alt)` background and uniform `14px` padding
  fold into the canonical shape unless the exploration task
  reverses by minting `<TextInput variant="alt">`.
- **List sheets (Task 4.3)** —
  `web/src/lib/list/components/RenameListSheet.svelte`
  (+ test, name → `<TextInput>`),
  `web/src/lib/list/components/CreateListSheet.svelte`
  (+ test, name → `<TextInput>` + description → `<Textarea>`),
  `web/src/lib/list/components/EditDescriptionSheet.svelte`
  (+ test, description → `<Textarea>`).
- **Item sheet (Task 4.4)** —
  `web/src/lib/item/components/AddEditItemSheet.svelte`
  (+ test) — name → `<Label>` + `<TextInput>`, notes →
  `<Label>` + `<Textarea>` with the per-call serif / 14 px
  override.
- **Invite / circle (Task 4.5)** —
  `web/src/lib/invite/components/InvitePickerSheet.svelte`
  (+ test, email row → `<TextInput type="email">` inline with the
  submit button already migrated in Task 3.3),
  `web/src/lib/privacy/components/CircleScreen.svelte` (+ test,
  add-by-email card → `<Label>` + `<TextInput type="email">`
  inside the dashed-border card).
- **Profile (Task 4.6)** —
  `web/src/routes/(app)/profile/+page.svelte`
  (+ `page.test.ts` if present) —
  `<input id="display-name" class="name-input">` → `<Label>` +
  `<TextInput>`. Per R10, the migration changes the input border
  from `--ink` to `--rule` (or whatever Task 1.1 records as the
  reconciled canonical).

### Test-file conventions

- New primitives' tests are PascalCase `.test.ts` co-located
  with the `.svelte` per `docs/frontend-layout.md` filename
  rules.
- Route-level tests under `web/src/routes/(app)/profile/` use
  `page.test.ts` (no `+` prefix) per `docs/frontend-layout.md`
  "Filename conventions" — a `+page.test.ts` would fail
  `svelte-kit sync`.
- Existing component tests update in the same commit as the
  source change per `CLAUDE.md` "Tests out of sync"; assertions
  stay semantically equivalent.

### No DB migration, no doc edit

This sub-plan is web-only. No `db/` files change. No `docs/*.md`
file is expected to change — the parent plan's audit found no
doc divergence in the form-primitives half. If a migration task
surfaces a real divergence, `/work` flags it to the user.

### Toolchain coupling

- The primitives (`<Button>` extension, `<TextInput>`,
  `<Textarea>`, `<Label>`) all ship in Phase 2 before any
  migration task runs in Phase 3 or 4, so the type checker
  never sees a migration site referencing a not-yet-created
  primitive.
- The `.hint` / `.hint-error` CSS rule (Task 4.1) lands before
  Tasks 4.2–4.6 because those tasks emit
  `<p class="hint">` paragraphs that need the rule to render.
- The new primitives are pure components — no SvelteKit
  `resolve()` calls, no env-var reads, no route-id strings, no
  new `vite-env.d.ts` entries. No `docs/quality.md` toolchain-
  coupling escape patterns are needed.

### Primitives reused (not rebuilt)

- `web/src/lib/basic/components/Icon.svelte` (unchanged here;
  extended in 0902).
- `web/src/lib/basic/components/IconButton.svelte`,
  `RefreshButton.svelte`, `MoreButton.svelte`, `Fab.svelte`
  (unchanged per parent plan R2).
- `web/src/lib/basic/components/Sheet.svelte`,
  `Accordion.svelte`, `ButtonPair.svelte`, `Snackbar.svelte`
  (unchanged primitives; the snackbar `.action` is a carve-out).

## Phase structure

Four implementation phases plus a wrap-up smoke task. RED-
before-GREEN is per task — the new primitives in Phase 2 each
write their Vitest test first (RED) then implement (GREEN); the
migration tasks in Phases 3 and 4 update the matching `.test.ts`
in the same commit as the source change.

**Phase 1 — Exploration (1 task).** Read the existing
`Button.svelte`, a representative raw button, and a
representative raw input. Lock down: (a) the `<Button>` prop
names (especially `tone="neutral"` vs `tone="ink"`), (b) the
exact defaults for the no-props-passed `<Button>` call so it
reproduces today's appearance, (c) the precise CSS values for
each `variant × tone × size` cell, (d) the `<TextInput>` /
`<Textarea>` / `<Label>` final prop surfaces and the
`AddEditItemSheet` notes override mechanism, (e) the per-button-
call-site classification table mapping every raw `<button>` to
its `variant × tone × size` cell, (f) the `LoginRequest`
`paper-alt` question. Write all of this into this PLAN.md's
Decisions section before any implementation task runs.

**Phase 2 — Primitives (4 tasks).** `<Button>` extension first
(2.1) — it's the only modify-in-place primitive and its test
rewrite at lines 27–34 is part of the task. Then `<TextInput>`
(2.2), `<Textarea>` (2.3), `<Label>` (2.4) each as their own
task with co-located Vitest test. Each task is RED → GREEN: write
the test asserting the desired behaviour, watch it fail, write
the implementation, watch it pass.

**Phase 3 — Button migration sweep (7 tasks).** One task per
domain. Each task touches the listed `.svelte` files plus their
co-located `.test.ts`. Order is mechanical (item sheets, list
sheets, invite/circle UI, profile, settings/privacy, screen-
level CTAs, auth) and reflects no functional dependency — the
executor is free to reorder if a task is blocked, but keeping
the order eases reviewer scan. The carve-outs from R6 are
explicitly skipped and called out in each task's Decisions.

**Phase 4 — Input migration sweep + hint CSS (6 tasks).** Task
4.1 is the `.hint` / `.hint-error` lift to `typography.css`;
Tasks 4.2–4.6 are the per-domain input migrations. The hint
CSS task lands first so the migrated `<p class="hint">`
paragraphs render styled from day one (R5).

**Phase 5 — Wrap up (1 task).** Run `./scripts/check.sh` (full
gauntlet — includes `pnpm lint`, `pnpm check`, Vitest, plus the
DB layers we don't touch but which run anyway) plus the auth
happy-path Playwright spec (`web/e2e/auth.spec.ts`). The full
e2e suite is not required here — that's `0902`'s concern
because the semantic-HTML sweep there is the one that could
affect focus order and tap targets across many screens. The
auth e2e is the strongest cross-cutting signal for 0901 because
it exercises the migrated `LoginRequest` submit button + email
input together.

## Reference docs and skills

- **`plans/0900_refactor_css_components/PLAN.md`** — parent
  orchestration plan, audit findings, branch graph,
  cross-cutting decisions.
- **`plans/0900_refactor_css_components/REQUIREMENTS.md`** —
  R1–R8 (form-primitives contracts), R14 (no-regression
  contract), R15 (tier convention).
- **`docs/frontend-layout.md`** — tier split (`basic/`,
  `shared/`, per-domain), filename conventions (PascalCase
  `.svelte`, sibling `.test.ts`, no `+` prefix on route-level
  test names).
- **`docs/ui.md`** — button-pair convention (right is
  committal), empty-state pattern, TopBar styling. The migration
  preserves every user-visible convention.
- **`docs/testing.md`** — three test layers; Vitest for the
  primitives, Playwright e2e auth happy path as the final smoke.
- **`docs/quality.md`** — lint / format / type-check toolchain;
  the `feedback_run_lint` memory's `pnpm lint` reminder is
  why Task 5.1's Verify line spells out `pnpm lint`.
- **`design/Cairn - Design Canvas.html`** — visual reference
  for the no-regression contract. The exploration task uses it
  to anchor the CSS values for each `variant × tone × size`
  cell.
- **`.claude/skills/writing-tasks.md`** — task-block format for
  this file's siblings.

## Open questions

These are deliberately handed to the exploration task (Task
1.1). Each has a default answer so implementation isn't blocked;
the exploration task either confirms the default or records the
alternative in this PLAN.md's Decisions section before Phase 2
starts.

- **`tone="neutral"` vs `tone="ink"`.** Parent plan's `0900`
  Open Questions flags `tone="ink"` as the path of least
  resistance because the existing token vocabulary is
  token-name (`--ink`, `--accent`, `--ember`, `--sage`) and
  `--neutral` does not exist. **Default:** `tone="ink"`.
  Exploration is free to pick `tone="neutral"` if it finds a
  semantic-naming reason that outweighs consistency with the
  token vocabulary.
- **`LoginRequest` `var(--paper-alt)` background.** Default:
  fold into the canonical `<TextInput>` shape (loses
  `paper-alt` background, harmonises padding to `12px 14px`).
  Exploration may reverse by minting
  `<TextInput variant="alt">` if it judges the historical
  shape worth preserving.
- **`<Button>` defaults for the unspecified call.** Default:
  `variant='rect'`, `tone='primary'`, `size='md'`,
  `leadingIcon=undefined` — reproducing today's filled-
  rectangle primary shape. Exploration locks down whether the
  `tone` default is `'primary'` or the neutral-tone name,
  depending on which current call sites pass nothing and what
  they render today.
- **`AddEditItemSheet` notes serif override mechanism.**
  Default: a scoped `:global()` selector inside the sheet's
  `<style>` block targeting the rendered `<textarea>`.
  Exploration may instead pick a `class` prop on `<Textarea>`
  if it judges the prop more discoverable. Either way the
  serif / 14 px shape stays per-call, not a primitive variant.
- **`<Textarea>` `rows` vs `minHeight` prop shape.** Default:
  expose both, mark them mutually exclusive in the doc-comment
  (caller passes one or the other). Exploration may collapse
  to just `rows` if every current call site uses `rows` alone;
  the audit at write time hasn't checked.
