# Requirements: Refactoring pass — repeating CSS into components

Step 9 of the master plan, and the orchestration parent for the two
sub-plans that consolidate the recurring CSS blocks that accumulated
across steps 4–8. The same handful of shapes (outlined-pill buttons,
chip-shaped panel actions, empty-state CTAs, `.row-icon`
colour-wrapper spans, ad-hoc `<div class="…">` scaffolding for
header / section / heading / list, and — added in this plan —
identically-styled `<input>` / `<textarea>` blocks) keep getting
copy-pasted across screens because the existing primitives don't
cover them. Visual consistency lives in `git grep`, not in code;
one screen tweaks a colour and the others drift. This plan is the
audit-driven cleanup. No user-visible behaviour change.

## R1. `<Button>` covers the recurring filled-rect, outlined-pill, and ghost-text shapes

`web/src/lib/basic/components/Button.svelte` gains a variant +
tone + size + leading-icon prop surface that covers every recurring
text-button shape from the audit (the master plan's hypothesis:
filled-rect, outlined-pill, ghost-text — icon-only stays in
`<IconButton>`). The exact prop names are decided inside 0901 with a
short exploration phase, but the shape is roughly:

- `variant: 'rect' | 'pill' | 'text'` — `rect` is the current
  filled-rectangle shape (today's default); `pill` is the outlined,
  capsule-shaped shape (`.restore`, `.pill-btn.ink`); `text` is the
  ghost-text shape (`.whats-this`, `.add-btn`, `.invite-btn`,
  `.action`).
- `tone: 'primary' | 'neutral' | 'destructive'` — picks the colour
  mapping. `primary` → `--accent`; `neutral` → `--ink` / `--rule`;
  `destructive` → `--ember`. Replaces the legacy `'primary' | 'ghost'
| 'destructive'` variant set; the new defaults match the current
  primary-rect shape so existing call sites that pass no props keep
  working visually identically.
- `size: 'sm' | 'md'` — derives padding and font-size. `md` is the
  current default (~12 px vertical, 16 px horizontal, 16 px text);
  `sm` is the row-level / inline-link size (~7 px vertical, 12 px
  horizontal, 12.5–13 px text).
- `leadingIcon?: IconName` — optional icon at the start of the
  label, with a fixed 8 px gap and `currentColor` stroke. Mirrors
  the `gap: 8 px; icon + label` pattern repeated in `.empty-cta`,
  `.pill-btn`, the panel buttons, and the leave-list confirm row.

Existing props (`disabled`, `type`, `onclick`, `children`,
`data-test`, `aria-pressed`) carry forward unchanged.

## R2. `<IconButton>` keeps the icon-only role

`web/src/lib/basic/components/IconButton.svelte` covers icon-only
buttons (close ×, more ⋯, refresh, TopBar nav). It is **not**
collapsed into `<Button>`; the audit shows the icon-only role is
distinct (no label, square-ish hit target, used in dense places
like the top bar). Existing call sites do not migrate.

## R3. `<TextInput>` primitive

A new `web/src/lib/basic/components/TextInput.svelte` wraps a
single-line `<input>` element. Owns the standard input block —
`padding: 12px 14px; border: 1px solid var(--rule);
border-radius: 12px; background: var(--paper); color: var(--ink);
font: inherit; font-size: 16px; width: 100%; box-sizing:
border-box` — and the `:focus { border-color: var(--ink); outline:
none }` state, plus `::placeholder { color: var(--stone) }`.

Props (final names decided in 0901's exploration phase, shape
fixed):

- `value` with `bind:value` two-way binding.
- `type?: 'text' | 'email'` (default `'text'`). No support for
  `'password'`, `'number'`, `'date'`, etc. — none are needed in the
  current screen inventory.
- `id?`, `name?`, `placeholder?`, `disabled?`, `required?`,
  `autocomplete?`, `inputmode?`, `data-test?`.
- Standard event forwarding (`oninput`, `onchange`, `onblur`, `onkeydown`).

Variants are **not** introduced — every existing input shape across
`LoginRequest`, `RenameListSheet`, `CreateListSheet`,
`AddEditItemSheet` (name field), `EditDescriptionSheet`,
`InvitePickerSheet`, `CircleScreen`, profile page (display name)
shares the same CSS block. The one variant the audit found
(`LoginRequest`'s `background: var(--paper-alt)`) folds into the
common shape; `paper-alt` was a one-off and is dropped.

## R4. `<Textarea>` primitive

A new `web/src/lib/basic/components/Textarea.svelte` wraps a
`<textarea>` element. Same CSS block as `TextInput` plus `resize:
none` and a configurable `min-height` (or `rows`) via prop. Used by
`CreateListSheet` description, `AddEditItemSheet` notes,
`EditDescriptionSheet`.

The `AddEditItemSheet` notes textarea is the one outlier — it
renders in the Newsreader serif at 14 px (editorial copy feel). This
stays as a per-call-site CSS override on the rendered `<textarea>`
(e.g. via a `class` prop or a `:global()` selector scoped to the
sheet), **not** a new variant on `Textarea` — the shape only
appears once.

## R5. `<Label>` primitive

A new `web/src/lib/basic/components/Label.svelte` renders a
`<label>` element with the recurring label typography (12 px,
`var(--stone)`, weight 500). An `uppercase` boolean prop renders
the `AddEditItemSheet` field-label shape (uppercase, weight 600).

Props:

- `for?: string` — optional. When supplied, the rendered element
  carries `for={for}`. When omitted, no `for` attribute is
  emitted (use this shape when the `<Label>` wraps its input
  instead of pointing at one by id). This matches `<TextInput>`'s
  `id?` being optional (R3) — the two APIs compose either way.
- `uppercase?: boolean` — see above.
- `children` (snippet) — the label text.
- `data-test?: string`.

The `· optional` suffix span on the notes label stays inline at the
call site — it's one occurrence.

## R6. Hint and error text use a single global rule

Hint / error paragraphs below an input stay plain `<p class="hint">`
and `<p class="hint hint-error">` markup. The styling lands once in
the global stylesheet (per R11), keyed off the `.hint` class. No
new component for this — the audit showed it as a one-line span of
typography, not worth a primitive. The CSS rule itself ships in
**0901** alongside the input migration so the migrated hint
paragraphs render styled from day one — see PLAN.md _Decisions_
for the rationale. Other typography rules in R11 continue to land
in 0902.

## R7. Raw `<button>` usages migrate to `<Button>` (with carve-outs)

The 0901 sub-plan migrates every raw `<button>` listed below to use
the new `<Button>` surface (or `<IconButton>` where the shape is
icon-only). Each row maps to a `variant` × `tone` × `size`
combination.

| Today                                                                                                                                   | New shape                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------- |
| `.btn-cancel`, `.btn-submit`, `.btn-save`, `.btn-delete` in sheet headers                                                               | `Button variant="rect" tone={primary                                                                                                                                                      | neutral                                 | destructive}` size="md" |
| `.row` actions in `AvatarSourceSheet`, `ListOverflowSheet`, `ProfileSheet`, `CircleScreen`, `InvitePickerSheet` (full-width sheet rows) | Likely `Button variant="text" tone="neutral" size="md"` inside an `<li>` (per R11); decide in 0901                                                                                        |
| `.empty-cta` in `ItemsScreen`, `ListsScreen`, `InvitesInboxScreen`                                                                      | `Button variant="rect" tone="primary" size="md" leadingIcon="…"`                                                                                                                          |
| `.panel-btn`, `.panel-btn.destructive` in `ItemsScreen`                                                                                 | `Button variant="pill" tone={neutral                                                                                                                                                      | destructive} size="sm" leadingIcon="…"` |
| `.restore` in `TrashScreen`                                                                                                             | `Button variant="pill" tone="neutral" size="sm"`                                                                                                                                          |
| `.pill-btn.ink`, `.pill-btn.ember` on the profile page                                                                                  | `Button variant="pill" tone={neutral                                                                                                                                                      | destructive} size="sm" leadingIcon="…"` |
| `.add-btn`, `.invite-btn`, `.whats-this` (inline accent links)                                                                          | `Button variant="text" tone="primary" size="sm"`                                                                                                                                          |
| `.nav-row`, `.profile-chip` in `SettingsScreen`, `InvitesInboxScreen`, `PrivacyScreen`                                                  | Stay as full-width tap-target rows, but the markup moves to `<li>` containing a `Button variant="text" tone="neutral" size="md"` (or a `<NavRow>` if one is extracted — sub-plan decides) |

**Additional raw `<button>` call sites surfaced by the audit**
that also migrate to the new `<Button>` surface (the 0901
sub-plan classifies each into a `variant × tone × size` cell
during its exploration phase):

- `.send-btn` in `InvitePickerSheet.svelte` (inline e-mail submit
  next to the picker input).
- `.invite-btn` in `InvitePickerSheet.svelte` — the second shape,
  distinct from the inline-link `.invite-btn` listed above.
- `.unblock-btn` in `BlockedScreen.svelte`.
- `.remove-btn` in `CircleScreen.svelte`.
- `.multi-row` in `InvitesBanner.svelte` (full-row tap target).
- `.row-nav` in `ListsScreen.svelte` (list-row navigation; not
  the same as the generic `.row` action).
- `.confirm-cancel`, `.confirm-leave`, `.row-delete` in
  `ListOverflowSheet.svelte` (confirmation-state buttons).

Carve-outs (these stay as raw `<button>` elements — they're one-offs
and minting a `<Button>` variant for them would explode the API):

- `VoteControl.svelte` thumb (36 × 36 fixed, opacity / cursor logic
  unique to the vote control).
- `Accordion.svelte` header (chevron rotation, hit area covers the
  whole row including content the button doesn't visually own).
- `(see more) / (see less)` expander on list descriptions in
  `ListsScreen.svelte`.
- `Snackbar.svelte` `.action` button (lives inside the snackbar
  primitive and is not used anywhere else).
- Segmented-control buttons (`PrivacyScreen.svelte` `.option`,
  `.whats-a-circle`) — segmented control is its own pattern.
- Chooser-grid buttons (`SettingsScreen.svelte` `.size-option`,
  `.theme-option`) — grid-tile shape, not a button row.

## R8. Raw `<input>` and `<textarea>` usages migrate to the new primitives

The 0901 sub-plan migrates every raw `<input>` / `<textarea>` to
the new primitives:

- `LoginRequest.svelte` — email input → `<Label>` + `<TextInput
type="email">`.
- `RenameListSheet.svelte`, `CreateListSheet.svelte` (name),
  `AddEditItemSheet.svelte` (name),
  `web/src/routes/(app)/profile/+page.svelte` (display name input
  at line 191, `<input id="display-name" class="name-input" …>`) —
  → `<Label>` + `<TextInput>`.
- `CreateListSheet.svelte` (description),
  `EditDescriptionSheet.svelte`, `AddEditItemSheet.svelte` (notes)
  — → `<Label>` + `<Textarea>` (the notes case carries a per-call
  serif/14 px override per R4).
- `InvitePickerSheet.svelte` (email row) — → `<TextInput
type="email">` inline with its submit button.
- `CircleScreen.svelte` (add-by-email) — → `<Label>` + `<TextInput
type="email">` inside the dashed-border card.

Carve-outs: file inputs (the hidden `<input type="file">` triggers
in `AvatarSourceSheet`) and the `<canvas>` in `AvatarCropScreen` are
not text inputs and stay as-is.

## R9. `<Icon>` accepts a `color` prop

`web/src/lib/basic/components/Icon.svelte` gains a `color?: string`
prop, defaulting to `'currentColor'`. When set, the SVG `stroke` is
`color`; when unset, the inheritance behaviour every existing call
site relies on is preserved. Precedent: `CairnGlyph.svelte` already
has this exact prop shape — same idiom, no new pattern.

## R10. Purely-cosmetic icon-colour wrappers are removed

Every `<span class="…">` whose **only** job is to set
`color: var(--…)` around an `<Icon>` is removed; the colour moves
to the `Icon`'s `color` prop. Concretely, the audit identifies
`.row-icon` in `TrashScreen.svelte` as the canonical case. Any
others discovered during the sweep are removed the same way.

Layout-bearing wrappers (those that carry sizing, background,
border-radius, or an animation hook) are **explicitly kept** — see
the non-requirements section for the list.

## R11. Global typography rules are keyed off semantic tags

`web/src/lib/shared/styles/typography.css` (the file that today only
declares the font imports and the `--font-size-scale` root rule)
gains rules keyed off semantic tags. The exact values are taken from
the existing duplicated `.section-label` / `.name` / `.sub` /
`.nav-row-title` / `.empty-heading` class rules and reconciled into
a single source of truth. Approximate shape:

- `h1` — sheet / screen title (~22–24 px, weight 500,
  letter-spacing −0.01 em, `var(--ink)`). Matches the existing
  ad-hoc `.title` / `.empty-heading` typography.
- `h2` — section label (11.5 px, uppercase, `var(--stone)`,
  letter-spacing 0.06 em, weight 600). Replaces `.section-label`.
- `h3` — row / nav-row heading (14–15 px, weight 600,
  `var(--ink)`). Replaces `.nav-row-title` and the recurring
  `.name` class **in its 14 px form**.
- `section` — sensible default flow (no implicit padding); per-screen
  layout still local.
- `ul`, `ol` — `list-style: none; margin: 0; padding: 0`. Cairn
  lists are flex / grid scaffolds, not bulleted.
- `header`, `footer` — no global positioning; per-component layout.
- `.hint`, `.hint-error` — paragraph below an input (13 px,
  `var(--stone)` for `.hint`, `var(--ember)` for `.hint-error`).
  See R6.

**The `.name` class is overloaded today**, and the audit found
the drift is wider than originally claimed:

| File:line                       | Font size | Role               |
| ------------------------------- | --------- | ------------------ |
| `InvitePickerSheet.svelte:266`  | 14 px     | member-name        |
| `MembersScreen.svelte:196`      | 15 px     | member-name        |
| `DeletedListsScreen.svelte:131` | 15 px     | deleted-list title |
| `TrashScreen.svelte:157`        | 15.5 px   | deleted-item title |
| `ListsScreen.svelte:262`        | 17 px     | list title         |
| `ProfileSheet.svelte:173`       | 18 px     | profile name       |

(`CircleScreen` does **not** apply `class="name"` — it uses
`.display-name` instead; the earlier inventory was wrong.)

The 17 px list-title case maps to `<h3>` with the role-specific
scale, or to a local `.list-title` class scoped to `ListsScreen`.
The other five cases keep a per-file local class (or use unstyled
`<span>` where parent-driven typography is enough); 0902 resolves
each one in the per-file semantic-HTML task and records the
chosen shape in that task's Decisions section. Same rule applies
to any other class whose effective typography drifts between
files.

## R12. Div-heavy components migrate to semantic HTML

The 0902 sub-plan replaces ad-hoc `<div class="…">` scaffolding with
semantic tags across every screen / sheet under
`web/src/lib/**/components/`. Concretely, the recurring mappings are:

- `<div class="header">` (containing a title and optional subtitle)
  → `<header>` with `<h1>` + `<p>`.
- `<div class="section-label">` → `<h2>`.
- `<div class="rows">` (a column of list rows) → `<ul>`.
- `<div class="row">` (a single list row) → `<li>` containing
  whatever interactive element is appropriate (button or link).
- `<div class="name">` → `<h3>` for the 17 px list-title case;
  `<span>` (typography from the parent `<li>` or `<header>`) for
  the 14 px member-name case.
- `<div class="sub">`, `.subtitle`, `.nav-row-sub` → `<p>` (in a
  header) or `<span>` (in an `<li>`) — typography from the global
  rules or a small local class.

Canonical case: `InvitePickerSheet.svelte`. Every other div-heavy
file follows the same playbook. The 0902 sub-plan enumerates the
full file list and sequences the sweep.

`TopBar.svelte` already uses `<header>` — the sub-plan confirms it
keys cleanly off the global rules with no regression.

## R13. `<EmptyState>` extracted

`docs/ui.md` documents two empty-state patterns: **illustrated**
(`<div class="empty-circle">` icon disc + `.empty-heading` title

- `.empty-body` paragraph + optional `.empty-cta` button) and
  **simple** (dashed-border box, single icon, single muted
  paragraph, no CTA). The audit found:

* _Illustrated_: `ListsScreen.svelte`, `ItemsScreen.svelte`,
  `InvitesInboxScreen.svelte`, `DeletedListsScreen.svelte`.
* _Simple_: `BlockedScreen.svelte:27–87` (dashed `--stone-lt`
  border, `--paper-alt` background, one icon, one paragraph).

`CircleScreen` does **not** have an empty state — when the
circle is empty, the `<ul>` is simply not rendered and the
always-present `.add-card` is the only thing on the screen.
Adding a no-circle-yet empty state is a screen design change,
not a CSS refactor; it's out of scope here (file a follow-up
plan if wanted).

The 0902 sub-plan extracts a small `<EmptyState>` component
under `web/src/lib/shared/components/` (per the tier rules in
`docs/frontend-layout.md` — empty-state is a shared application
primitive, not a `basic/` framework primitive). It has **one
shape, no `variant` prop** — a single illustrated empty state
(disc + optional heading / body / CTA) used on every screen, so
no screen drifts to a one-off look. Props:

- `icon?: IconName` — icon rendered inside the `empty-circle`
  disc (or `iconContent?: Snippet` for non-Icon disc content
  such as `<CairnGlyph>`).
- `title?: string` — heading copy; omitted renders no heading.
- `body?: string` — paragraph copy; omitted renders no body.
- `ctaLabel?: string`, `onCta?: () => void` — when both are
  supplied, an `<Button>` CTA is rendered below the body.

Each migrated screen replaces its inlined empty-state markup
with `<EmptyState …>`. `BlockedScreen`, which had drifted to a
one-off dashed box, is brought onto the same illustrated look
(heading-only, no CTA) — see 0902 task 4.4.

## R14. No user-visible behaviour change (with two deliberate exceptions)

Every existing Vitest component test and Playwright e2e spec must
keep passing with **assertions semantically equivalent to the
original**. Selector-level rewrites are allowed and expected —
e.g. an assertion that searched for `<div class="row">` becomes
one that searches for `<li>` or uses `getByRole('listitem')`; an
assertion that searched for `Button` with `classList.contains(
'destructive')` becomes one that checks the rendered `<button>`
exposes the destructive tone (via `data-test`, role, or a still-
present class — the sub-plan picks). The known case is
`web/src/lib/basic/components/Button.test.ts:33`, which asserts
on the `.destructive` class today; the 0901 sub-plan rewrites it
to an equivalent assertion against the new `variant × tone` API
and lists it explicitly in the migration task's **Files**.

Copy stays identical; tap targets stay where they were; focus
order is unchanged. The 0902 sub-plan may add one or two narrow
new tests asserting heading-hierarchy correctness (e.g.
_"section labels render as `<h2>`"_) but **must not** widen the
scope of existing tests to cover the refactor itself.

**Two deliberate user-visible changes** (acknowledged here so
the e2e visual sweep doesn't surprise anyone):

1. `LoginRequest`'s email input loses its `var(--paper-alt)`
   background and uniform `14px` padding; it harmonises to the
   canonical `<TextInput>` shape (`var(--paper)` background,
   `12px 14px` padding). The audit treated this as a one-off
   drift to fold in, not a designed variant. If a reviewer
   prefers preserving it, the right shape is to mint a
   `<TextInput variant="alt">` instead — the sub-plan decides
   in its exploration phase.
2. The mechanical-rename selector changes above (class names
   → roles / `data-test` / new classes) are not user-visible
   but are visible to tests; flagged here for full disclosure.

Beyond these two, the contract is that the refactor is
invisible to the product.

## R15. Reference docs and tier conventions

The new primitives live in
`web/src/lib/basic/components/` (`Button.svelte` extends in place;
`TextInput.svelte`, `Textarea.svelte`, `Label.svelte` are new
files) — per `docs/frontend-layout.md`'s tier rules,
framework-agnostic primitives belong in `basic/`. `<EmptyState>`
lives in `web/src/lib/shared/components/` because it carries
application styling (the icon disc, the empty-state body copy
typography) rather than being a pure primitive.

Global rules live in `web/src/lib/shared/styles/typography.css`
(`docs/frontend-layout.md` line 94, 106). Tokens stay in
`tokens.css` and the reset stays in `reset.css` — no token edits or
reset edits are expected.

Every new `.svelte` primitive ships with a matching `.test.ts` in
the same directory (Vitest), per `docs/testing.md` and
`CLAUDE.md` "Tests and quality (non-negotiable)".

## Non-requirements (explicitly excluded)

- **Renaming `<IconButton>`, `<RefreshButton>`, `<MoreButton>`, or
  `<Fab>`.** These already cover their roles cleanly; touching them
  is out of scope.
- **A compound `<Field>` input wrapper.** Three small primitives
  (`<TextInput>` + `<Textarea>` + `<Label>`) composed at call sites
  is the chosen shape; an opinionated wrapper that owns
  label + input + hint together is rejected as too much API surface
  for too little gain (decided in the planning AskUserQuestion pass).
- **Variants for one-off shapes.** VoteControl thumb, Accordion
  header toggle, the `(see more) / (see less)` description
  expander, and the Snackbar `.action` button stay as raw
  `<button>` elements per the master plan rule _"if a shape only
  appears once, keep it inline"_.
- **Removing layout-bearing icon wrappers.** `.icon-wrap` in
  `DeleteItemSheet.svelte` (40 × 40 disc with `--ember-bg`),
  `.icon-disc` in `LoginCheck.svelte` (84 × 84 disc with
  `--sage-bg`), and the spin-animation `.icon-wrap` in
  `RefreshButton.svelte` all carry sizing / background /
  animation, not just colour. They stay.
- **A primitive for file inputs or the avatar crop canvas.** The
  hidden `<input type="file">` triggers in `AvatarSourceSheet` have
  no visible surface to consolidate; the `<canvas>` in
  `AvatarCropScreen` is a custom control, not a text input.
- **`<input type="password">`, `<input type="number">`,
  `<input type="date">`, etc.** Cairn's current screen inventory
  has none; `<TextInput>` deliberately exposes only `'text'` and
  `'email'`. Adding types as future screens need them is a
  follow-up.
- **New screens, new features, design changes.** This is a
  CSS-and-semantics pass only. Any divergence the audit surfaced
  from the design canvas is recorded but not re-litigated here.
- **Doc edits.** No `docs/*.md` change is expected. The refactor
  does not alter any documented contract; `docs/frontend-layout.md`
  already names `typography.css` as the home for type rules, and
  `docs/ui.md` does not pin the typography of any of the surfaces
  being changed. If the 0902 sub-plan's sweep surfaces a real doc
  divergence, it lands a Phase 0 doc-reconciliation phase on
  `0902` itself.
- **Migrating `<input type="file">` open-pickers or canvas
  pointer-event handlers.** Same reason as the file-input
  carve-out.
- **Widening Vitest assertions to cover new primitives' internal
  CSS.** The primitives' tests cover behaviour (renders the right
  tag, fires the right events, respects `disabled`); CSS
  correctness is a visual review against the design canvas, not a
  unit-test concern.
- **`<Icon>` `color` prop (R9 — reconsidered in 0902).** The 0902
  sub-plan's sweep confirmed that `stroke="currentColor"` (already
  in place) handles every colour-setting need via CSS inheritance.
  Adding a `color` prop would duplicate a mechanism CSS already
  provides for free. Callers that need a specific colour wrap the
  icon in any element with the desired `color` value — no prop
  needed. See 0902 REQUIREMENTS Non-requirements.
- **Cosmetic icon-colour wrapper removal (R10 — reconsidered in 0902).**
  Without the `color` prop (R9 above reconsidered), there is no
  dedicated prop destination for the colour that `.row-icon`
  currently holds. The `.row-icon` span in `TrashScreen.svelte` is
  harmless and self-documenting; it is left as-is. See 0902
  REQUIREMENTS Non-requirements.
