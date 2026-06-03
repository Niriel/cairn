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
   classes are removed in Phase 6. **Sectioning:** wrap each labelled content
   group in `<section>` with its title as a bare `<h2>` (no `<header>` around a
   lone heading); use `<header>` only where the intro carries more than the
   title (sheet title + subtitle), and `<footer>` for trailing notes
   (cascade-note, "What's this?" link). A single unlabelled list is not
   sectioned. Where a section label both titles a group *and* labels a single
   input (the InvitePicker "By e-mail" caption), use the `<Label>` primitive.
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

### [x] 0.1 Finish the `docs/ui.md` rem + role reconciliation

**Created:** 2026-06-03T00:00:00Z
**Completed:** 2026-06-03T09:45:35Z

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
  roles (`h1`, `h2`, `h3` (+ `.row-title`), `.t-hero`, `.t-sheet`,
  `.list-title`, `.identity-name`, `.body`, `.caption`, `.mono`) so the doc
  names the source of truth that `typography.css` implements.
- **Record the label/title split.** Note that the upper-cased, `0.06em`-tracked
  small-stone treatment is the **form-label** look (the `<Label>` primitive)
  and that **section titles (`h2`) are normal-case** (a small heading,
  0.8125rem/600/`--ink-soft`) — they are *not* upper-cased. The two were
  conflated under the word "label"; the doc must state the section-title look
  so later screens don't re-introduce uppercase section headers.
- **Reconcile the Decline affordance.** `docs/ui.md` describes the invite
  affordance as "Accept (sage) and Decline (muted)" in both the "Inbox row on
  the Lists screen" and "Invites inbox screen" sections. Task 4.2 converges
  Decline onto the outlined `ink` pill (0901 collapsed `neutral`→`ink`, so
  there is no muted tone to keep). Update the wording in both sections to match
  (e.g. "Accept (filled sage) and Decline (outlined)") so the doc and the
  shipped look agree.
- Add a short **"Semantic structure"** convention under the CSS-conventions
  section so later screens inherit it: a labelled content group is a
  `<section>` with its title as a bare `<h2>`; `<header>` is used only when the
  section intro carries more than the title (sheet title + subtitle); `<footer>`
  holds trailing notes; a single unlabelled list is not sectioned. Note the
  TopBar middle slot stays a layout `<div>` holding the `<h1>` title and an
  optional `<p>` subtitle as siblings.
- Disc dimensions (96 px) and hairline borders stay px per the Units rule.

**Files:**
- `docs/ui.md` (modify)

**Steps:**
1. Update the TopBar visual spec and the empty-state spec to rem (px in
   parentheses).
2. Add the "Type roles" list under the CSS-conventions section, and the
   label/title split note (uppercase = form labels via `<Label>`; section
   titles are normal-case small headings).
3. Add the "Semantic structure" (`<section>` / `<header>` / `<footer>`)
   convention under the CSS-conventions section.
4. Update the Decline wording in the "Inbox row" and "Invites inbox screen"
   sections to match the converged outlined-ink pill (no longer "muted").
5. No code or tests in this task. `pnpm lint`/`pnpm check` not required for a
   markdown-only change, but run `pnpm exec prettier --check docs/ui.md` if
   markdown is in the Prettier glob.

**Verify:** `pnpm exec prettier --check "docs/ui.md"` (or note if md is outside
the Prettier config).

**Notes:** `docs/` is outside the Prettier-managed scope — there is no root
`package.json` or `.prettierrc`; the config lives in `web/` and `web`'s
`format` script (`prettier --write .`) only covers `web/`. Running
`prettier --check` against `docs/ui.md` reports warnings, but the diff is
entirely in **untouched** sections (an `*emphasis*` → `_emphasis_` on the
`em`-units line, and the indentation of the `.row-nav` CSS code block). None of
the four edited regions introduce new style issues, so the pre-existing
formatting was left as-is rather than reformatting unrelated content.

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

### [x] 3.1 Rewrite `typography.css` in rem with the full role set

**Created:** 2026-06-03T00:00:00Z
**Completed:** 2026-06-03T09:49:32Z

**Why:** This is the single source of truth for every type role. All Phase 5
sweeps delete scoped type and rely on these rules, so they must exist and be
correct first. Converting to rem is what makes the Settings font-size control
work (R1).

**Prerequisites:** Task 0.1 (doc names the roles).

**Decisions:**
- Convert the existing `h1`/`h2`/`h3` rules to rem: `h1` 1.375rem, `h2`
  0.8125rem, `h3` 0.9375rem (values + other props per PLAN.md → Type scale).
  Keep the `ul, ol` reset.
- **`h2` is a normal-case section title, not a form label.** Rewrite it as
  0.8125rem / 600 / `--ink-soft` / **`text-transform: none`** / `letter-spacing:
  normal` / **`margin: 0`**. Do **not** carry over the old `text-transform:
  uppercase` + `0.06em` tracking — that is the form-label look and lives only on
  the `<Label>` primitive (`basic/components/Label.svelte`, unchanged). Adding
  `margin: 0` matches `h1`/`h3` and stops bare-`<h2>` section titles from
  picking up the browser-default heading margins once their scoped margin resets
  are stripped. (This de-upper-cases every section title app-wide — deliberate.)
- Write the `h3` row-name rule as **`h3, .row-title { … }`** (one rule, two
  selectors): the `<h3>` tag for row names *not* inside a control, and the
  `.row-title` **class** for row names that must sit inside a tap-target button
  (where a heading tag is invalid HTML — see tasks 5.3/5.4). Same values
  (0.9375rem/600/`--ink`/margin 0).
- Add the new role classes from PLAN.md → Type scale: `.t-hero`, `.t-sheet`,
  `.list-title`, `.identity-name`, `.body`, `.caption`, `.mono`. Exact values
  in the PLAN table.
- **Pin the font-family stacks** (the PLAN table abbreviates them as "serif" /
  "JetBrains Mono"): the serif roles (`h1`, `.t-hero`, `.t-sheet`,
  `.list-title`) use `'Newsreader Variable', Georgia, serif` — the *variable*
  family that is actually `@import`-ed (not bare `'Newsreader'`, which several
  out-of-scope files have drifted to); `.mono` uses `'JetBrains Mono',
  ui-monospace, monospace`, matching the existing VoteControl/ItemsScreen usage.
- `.t-sheet` (and `.t-hero` on `CircleExplainerSheet`'s `<h2>`) override the
  global `h2` when applied to a sheet header's `<h2 class="t-sheet">` — class
  beats tag for the properties the class declares (font-family/size/weight/
  colour), so no `!important` needed. Crucially, because `h2` is now normal-case
  with normal tracking (above), there is **no** `text-transform`/`letter-spacing`
  left on the tag for these classes to leak from — the earlier risk of a sheet
  title rendering UPPERCASE is removed at the root. (`.t-hero` still sets its own
  `-0.01em`; `.t-sheet` inherits normal tracking, which is correct for it.)
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

**Notes:** `.hint` (13px/`--stone`), `.disclaimer` (12px/`--stone`), and
`.explainer` (13px/`--stone`) overlap meaningfully with the new `.caption`
(0.75rem/`--stone`/lh 1.5) — same colour, near-identical size, all muted
secondary copy. Left as-is per the task decision; flagged here as a candidate
for a later collapse (they differ today only in px-vs-rem and per-helper margin
defaults, which a future pass could fold into `.caption` + layout-local
margins). `pnpm lint` runs ESLint only in this repo's `lint` script (Prettier
is a separate `format:check`); ran `prettier --check` on `typography.css`
explicitly — clean. Pre-existing cSpell editor warnings on the `@import`
`wght.css` lines (1–2) are untouched and unrelated.

### [x] 3.2 Create `surfaces.css` and wire global imports

**Created:** 2026-06-03T00:00:00Z
**Completed:** 2026-06-03T10:00:26Z

**Why:** The row-divider, card, raised-surface, and sheet-handle looks are
re-declared across ~10 files. Centralising them lets every sweep delete its
copy and add a class instead (R3).

**Prerequisites:** Task 3.1.

**Decisions:**
- Create `web/src/lib/shared/styles/surfaces.css` with: the `.rows` /
  `.rows .row` divider model, `.card`, `.card-alt`, `.card-dashed`,
  `.surface-alt`, `.sheet-handle` — values per PLAN.md → Surfaces. Radii
  converge to `0.75rem`; hairline borders stay `1px`.
- The divider is keyed off `.rows` only; **every list container is renamed to
  `class="rows"` in its Phase 5 sweep** (`.list`, `.circle-list`,
  `.blocked-list` included), so this one rule covers them all. (This supersedes
  the parent plan's `border-bottom`→`<hr>` decision — see R3.) `<hr>` is kept
  only for ListOverflowSheet's action menu (task 5.2), not for data lists.
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

**Notes:** PLAN → Surfaces gives only the convergence targets (card radius
0.75rem, handle width 2.25rem); the remaining values were read off the existing
declarations — `.rows .row` divider is `1px solid var(--rule)` (MembersScreen /
ListsScreen), the sheet handle is `4px` tall / `99px` (pill) radius /
`var(--stone-lt)` / `margin: 0 auto 14px` (AvatarSourceSheet, ListOverflowSheet,
identical), `.card-alt` tint is `var(--paper-alt)` + `1px solid var(--rule)`
(InvitesBanner), `.card-dashed` is `var(--paper-alt)` + `1px dashed
var(--stone-lt)` (ListsScreen). The handle keeps its `margin: 0 auto 14px`
(centring + body gap) in the class so the per-file `.handle` rule deletes
wholesale in Phase 5. **User correction:** dropped the "converges 36/40px →"
style narration from the comments — comments describe what a surface *is*, not
the drift being left behind.

### [x] 3.3 Create `controls.css` (badges) and wire its import

**Created:** 2026-06-03T00:00:00Z
**Completed:** 2026-06-03T10:15:57Z

**Why:** Count, status, and score badges are re-declared in InvitesBanner,
PrivacyScreen, and ItemsScreen. One set of badge rules removes the drift (R4).

**Prerequisites:** Task 3.2 (import pattern established).

**Decisions:**
- Create `web/src/lib/shared/styles/controls.css` with `.badge` base and
  `.badge-ink`, `.badge-soft`, `.badge-score` (+`.positive`/`.negative`) per
  PLAN.md → Controls. `.badge-score.positive` = `color: var(--sage); background:
  var(--sage-bg)`, `.negative` = the ember pair; the base supplies the pill
  radius. Import alongside `surfaces.css`.
- **`.badge-score` is tonal only — it does not set the font.** The aggregate
  score is monospace; that font is the `.mono` role's job (PLAN type scale lists
  "`.score-badge` text" under `.mono`). So the ItemsScreen element carries
  `class="badge badge-score mono positive|negative"` (task 5.4) — `.badge-score`
  must not silently drop the monospace by omitting it.
- **The global `.badge` is an inline-flex pill — keep it off ProfileSheet's
  circle/blocked label.** That label (`<span class="badge circle">` today) is
  centred block text, not a pill. Task 5.9 strips its `badge` class and renders
  it as `.caption .mono`; nothing in this task should make it match the global
  pill.
- Also add `.toast-error` — the persistent error toast duplicated byte-for-byte
  in `TrashScreen` / `DeletedListsScreen`. Include both the visual (color
  `--ember`, background `--paper`, `1px solid var(--ember)`, `border-radius:
  0.75rem`, `text-align: center`, font-size in rem) **and** the shared
  fixed-position pattern (`position: fixed`; the shell-aware
  `left/right: max(0px, calc(50% - var(--app-max-w) / 2 + 0.75rem))`;
  `bottom: calc(env(safe-area-inset-bottom) + 18px)`; `z-index: 200`) since it
  is a self-contained transient surface.
- Pill buttons are **not** styled here — they become `<Button>` in Phase 4.

**Files:**
- `web/src/lib/shared/styles/controls.css` (create)
- the global import site (modify)

**Steps:**
1. Write `controls.css`; add the import.
2. `pnpm lint` · `pnpm check` · `pnpm test`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

**Notes:** Converged badge values off the existing declarations: `.badge` base
is the inline-flex pill (`min-width`/`height: 1.25rem`, `font-size: 0.75rem`,
weight 600, radius 99px) from PrivacyScreen's count badge; `.badge-ink` is
InvitesBanner's dark count (ink/paper); `.badge-soft` is the muted outlined
count (paper-alt + rule). Two deliberate convergences flow from "base supplies
the pill radius": the score badge (was `6px` radius) and InvitesBanner's count
(was a `32px` disc) both become the 1.25rem pill. Used the bare `--sage-bg` /
`--ember-bg` tokens (they exist in `tokens.css`), dropping the old hex fallbacks
the scoped rules carried. `.toast-error` converts to rem (`0.75rem` shell
offset, `0.875rem` type, `0.75rem` radius) but keeps the `+ 18px` safe-area
bottom offset per the task. No markup uses the classes yet — wired in Phase 5.

### [x] 3.4 Convert `EmptyState` to rem and the global roles

**Created:** 2026-06-03T00:00:00Z
**Completed:** 2026-06-03T10:26:57Z

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

**Notes:** Kept the `.empty-heading` / `.empty-body` layout classes on the
markup (now `class="empty-heading t-hero"` / `class="empty-body body"`) rather
than removing them — `EmptyState.test.ts` selects on those class names, and
they now carry only local spacing (margins, `max-width`). Type lives entirely
on the `.t-hero` / `.body` roles. Spacing converted to rem (`2.5rem 2.25rem`
padding, `1.5rem` disc gap, `0.625rem` heading gap, `1.75rem` body gap,
`17.5rem` max-width); the 96px disc and hairline dashed border stay px.

### [ ] 3.5 Add a `sage` filled-pill tone to `<Button>`

**Created:** 2026-06-03T00:00:00Z
**Completed:**

**Why:** Task 4.2 replaces the hand-rolled Accept/Decline pills with `<Button>`,
but the design renders **Accept as a filled sage button** (`background:
var(--sage); color: #fff` — `design/cairn-invite-screens.jsx`, `docs/ui.md` →
"Accept (sage)"). `<Button>` today exposes tones `primary | ink | destructive`
(`Button.svelte`), and its `pill` variant is outlined-only — none of which can
produce a filled sage pill. This task adds the one missing tone so 4.2 can use
it instead of stalling on the absent tone.

**Prerequisites:** None (Button already exists from 0901). Read `Button.svelte`
to match the existing `Variant`/`Tone`/`Size` structure and the `class:tone-*`
binding pattern.

**Decisions:**
- Add `'sage'` to the `Tone` union and a matching `class:tone-sage={tone ===
  'sage'}` binding on the `<button>`.
- The `pill` variant renders the `sage` tone **filled**, unlike every other
  pill tone (which stay outlined): `.pill.tone-sage { background: var(--sage);
  color: var(--paper); border: none }`. The filled-only-for-sage asymmetry is
  intentional — sage is the single affirmative "go" action.
- For completeness add the rect and text analogues so the tone is fully
  defined: `.rect.tone-sage { background: var(--sage); color: var(--paper) }`
  and `.text.tone-sage { color: var(--sage) }`. (Only the pill is consumed by
  this plan, but a half-defined tone is a smell.)
- Use `var(--paper)` for the foreground, not a literal `#fff`, so it tracks the
  theme (the hand-rolled pill's `#fff` was a token-bypass).

**Reference:** `Button.svelte` for the variant/tone class pattern;
`docs/ui.md` → "Invites inbox screen" for the Accept-is-sage contract.

**Files:**
- `web/src/lib/basic/components/Button.svelte` (modify)
- `web/src/lib/basic/components/Button.test.ts` (modify)

**Steps:**
1. RED — In `Button.test.ts`, add a case rendering `<Button variant="pill"
   tone="sage">` and assert it carries the `tone-sage` (and `pill`) class.
   Confirm it fails (tone not yet in the union / no class emitted).
2. GREEN — Add `'sage'` to `Tone`, the `class:tone-sage` binding, and the
   three tone rules above. Re-run and confirm green.
3. `pnpm lint` · `pnpm check` · `pnpm test`.

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

---

## Phase 4 — Shared chrome + `<Button>` reuse

### [ ] 4.1 TopBar — `<h1>` title, trim scoped type

**Created:** 2026-06-03T00:00:00Z
**Completed:**

**Why:** TopBar's title is the only canonical page-level heading and its type
duplicates the global `h1`. Promoting it to `<h1>` and deleting the scoped font
properties is the cleanest single instance of the whole plan. TopBar is fully
handled here and not revisited in Phase 5.

**Prerequisites:** Task 3.1 (global `h1` in rem).

**Decisions:**
- The middle slot currently wraps **both** the title (`{@render children()}`)
  and the optional `.sub`, inside one `<div class="centre">`
  (`TopBar.svelte:33-36`). Do **not** turn that wrapper into the `<h1>` — that
  would nest the subtitle `<p>` inside the heading, which is invalid (an `<h1>`
  cannot contain a `<p>`). Instead keep the wrapper as a layout `<div>` and put
  the title and subtitle as **siblings** inside it:
  ```svelte
  <div class="middle">
    <h1>{@render children()}</h1>
    {#if sub}<p class="sub caption">{sub}</p>{/if}
  </div>
  ```
- **Rename the class `centre` → `middle`** (the `left` / `middle` / `right`
  triad). Class names are code, so they take US spelling — and `middle` reads
  better than `center`, which implies the slot is centring something. Update
  the scoped rule, the markup, and the stale `.centre` mention in
  `typography.css` (the comment at the `h1` rule, which also references a
  non-existent "task 3.10").
- On the new `<h1>`: it inherits the global `h1` type — add no scoped font
  properties. `line-height: 1.1` from the old `.centre` rule may move onto the
  scoped `h1`/`.middle` layout only if it is intentional and differs from the
  global; otherwise drop it.
- `.middle` keeps only layout: `flex: 1; min-width: 0`.
- `.sub` (the `<div>` → `<p class="sub caption">`): move its type to `.caption`
  (0.75rem/`--stone`); keep only layout (`margin-top`) scoped, converted to rem.
- TopBar's `header` `background: var(--paper)` and `border-bottom: 1px solid
  var(--rule)` are single-instance app chrome — they may stay scoped (R "single
  instance chrome"). Convert the `padding`/`gap`/`min-height` to rem where they
  are not safe-area `env()` calc.

**Files:**
- `web/src/lib/shared/components/TopBar.svelte` (modify)
- `web/src/lib/shared/styles/typography.css` (modify — drop the stale `.centre`
  comment reference)
- `web/src/lib/shared/components/TopBar.test.ts` (modify if it queries
  `.centre` — a grep shows it does not today, so likely no change)

**Steps:**
1. Apply the element + CSS changes above (sibling `<h1>` + `<p>`, class rename,
   scoped-type removal).
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

**Prerequisites:** Task 3.5 (`<Button>` has the `sage` filled-pill tone). Read
`Button.svelte` to confirm the `variant`, `tone`, and `size` props.

**Decisions:**
- Replace each `<button class="btn-accept">Accept</button>` with
  `<Button variant="pill" tone="sage" size="sm" …>` (filled sage, matching the
  design) and each `<button class="btn-decline">Decline</button>` with
  `<Button variant="pill" tone="ink" size="sm" …>` (outlined). "Decline" is the
  backward/less-committal action and goes left per the button-pair rule.
  Preserve all `data-test`, `onclick`, and disabled wiring.
- Decline's current muted-stone outline converges onto the outlined `ink` pill
  — a deliberate homogenisation change (the parent plan collapsed `neutral` →
  `ink`, so there is no separate muted tone, and reintroducing one is out of
  scope).
- Delete the `.btn-accept` / `.btn-decline` scoped CSS. Keep `.buttons`
  (layout: flex/gap) and convert its gap to rem. Both buttons today are
  full-width (`flex: 1`); preserve that via the layout wrapper (e.g. `.buttons
  > :global(button) { flex: 1 }`) since `<Button>` is inline-flex by default.

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
- **Section structure.** This sheet has three content groups — "Your circle",
  "People you share other lists with", and the by-e-mail field. Wrap each in a
  `<section>`. The first two are lone-title groups: `<div class="section-label">`
  → a bare `<h2 class="section-label">` (global `h2`; drop the scoped font
  props, keep padding as layout, in rem) followed by its `<ul>` — **no**
  `<header>`. The e-mail group is handled below.
- `<div class="rows">` → `<ul class="rows">`; `<div class="row">` →
  `<li class="row">`; rely on the global `.rows`/`.rows .row` divider — delete
  the scoped `border-top`/`:last-child border-bottom`.
- `<div class="name">` → `<h3 class="name">` (drop scoped 14 px → global 15px).
  These rows are **not** tap targets (the Invite control is the action), so the
  name is genuinely not inside a control — `<h3>` is valid here.
- `<div class="sub">` → `<span class="sub caption">`.
- **Unify the two "Invite" buttons.** The circle rows already use
  `<Button variant="pill" tone="ink" size="sm">`, but the co-member rows still
  hand-roll a raw `<button class="invite-btn">` (no scoped CSS — renders as a
  default browser button; 0901 migrated only the circle row, leaving this one).
  Swap it to the same `<Button variant="pill" tone="ink" size="sm">` so both
  "Invite" buttons match; preserve its `data-test` and `onclick`. Delete any
  `.invite-btn` rule (there is none today).
- `.email-section` → a `<section>` kept as layout; its
  `background: var(--paper-alt)` becomes the `.surface-alt` class on the
  element; `border-top` stays a hairline (`1px` px). Its "By e-mail" caption is
  both the section's intro **and** the label for the one e-mail input, so
  replace `<label class="section-label email-label" for="…">` with the
  `<Label for="invite-picker-email-input">By e-mail</Label>` primitive
  (`$lib/basic/components/Label.svelte` — it already renders the section-label
  look as a real `<label>`). Delete the `.email-label` scoped rule. **No global
  `.section-label` class is introduced.**
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
  plain text styled by `.body` — it is a menu item label, use `.body`).
  **The `<div class="rows">` becomes `<ul class="menu">`, NOT `<ul class="rows">`.**
  This is an `<hr>`-separated *action menu*, not the per-row-border data-list
  model, so it must not carry the global `.rows` class (which would add a
  container `border-top` directly under the header's `border-bottom`). Move the
  existing `.rows :global(button)` layout rule onto `.menu :global(button)`, and
  update any test selector querying `.rows` here. `<hr>` between items inside a
  `<ul>` is invalid as a direct `<ul>` child — wrap:
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
- Wrap the labelled members group in a `<section>` whose bare `<h2>` is its
  title (no `<header>` — lone title). `<div class="section-label">` →
  `<h2 class="section-label">` (padding only, rem). `<div class="rows">` →
  `<ul class="rows">`. Each `<button class="row">`
  → `<li class="row"><button …></li>` **or** keep `<button class="row">` as the
  list item if the row is the whole tap target — if so, use a `<li>` wrapper to
  stay valid inside `<ul>`. The row's `background: transparent` / `border:
  none` button-reset stays as layout-ish reset (it is not a visual look, it is
  un-styling a button) — keep but convert to the minimum. Divider via global
  `.rows .row`.
- `<div class="name">` → `<span class="name row-title">` (delete scoped 15px;
  the `.row-title` class carries the h3 row-name look). **Not an `<h3>`** — the
  name sits inside the row's tap-target `<button>`, where a heading is invalid
  HTML and would be folded into the button's accessible name. `<div
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
- `.item-name` (a `<span>` inside the `<button class="row-tap">`) →
  `<span class="item-name row-title">` (15.5px → 15px global via `.row-title`).
  **Keep it a `<span>`, not an `<h3>`** — it sits inside the row's tap-target
  button, where a heading is invalid HTML. The `.row.open .item-name` weight
  bump 600 is a state — keep as a scoped state rule on the class, annotate, or
  accept default. `.score-badge` → `<span class="badge badge-score mono">` (+
  positive/negative); delete its scoped color/bg/radius/font. The `.mono` class
  is **required** — `.badge-score` is tonal only and would otherwise drop the
  monospace the score has today (PLAN type scale puts the score-badge font under
  `.mono`). `.badge-score.positive` sets `color: var(--sage); background:
  var(--sage-bg)` and `.negative` the ember pair; the badge takes the `.badge`
  base's pill radius (99px), converging the current 6px — a deliberate change. `.notes` → `.body` plus a
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
- `<div class="list">` → `<ul class="rows">` (rename `.list` → `.rows` so the
  global `.rows`/`.rows .row` divider applies; move any `.list`-specific layout
  onto `.rows` and update test selectors that query `.list`); each
  `<div class="row">` → `<li class="row">` (keep `class:last`). `.row-top`,
  `.desc`, `.desc-text` stay layout divs/buttons.
- `<span class="name">` (inside the row-nav `<Button variant="text">`) **stays a
  `<span class="name list-title">`** — `.list-title` carries the serif
  1.0625rem/600 look; delete the scoped font block. Do **not** promote it to an
  `<h3>`: it lives inside the nav button (the row's tap target), where a heading
  is invalid HTML and would be folded into the button's accessible name. The
  class, not the tag, carries the hero look. `.desc` → `.body` (13.5px → 0.875rem) with the no-desc italic/`--stone`
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
- InvitesInboxScreen: `<div class="list">` → `<ul class="rows">` (rename
  `.list` → `.rows` so the global `.rows`/`.rows .row` divider applies; update
  test selectors querying `.list`); `<div class="row">` → `<li class="row">`
  (inner `.row-top`/`.row-info` stay divs). `.list-name` → `<h3>`; `.row-inviter`
  → `.caption`; `.inviter-name` weight via a scoped state or `<strong>`; `.when`
  → `.caption .mono`. Drop the per-file `.row.first`/`.row` border hacks (global
  divider). Empty
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
- The `.error` toast is byte-identical in both → apply the global
  `.toast-error` class created in task 3.3 (`<div class="toast-error">`) and
  delete the scoped `.error` rule from both files. Keep it a plain
  `{#if …error}` element — do **not** migrate to `<Snackbar>` (its 6 s
  auto-dismiss + `open`/`onclose` wiring would change the persistent-error
  behaviour). No scoped `color`/`background`/`border-color`/positioning left
  behind.
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
- **Section structure.** CircleScreen has one labelled group: wrap "People in
  your circle · {count}" + its `<ul>` in a `<section>` whose `<div
  class="section-header">` → a bare `<h2>` (the count is inline in the title, so
  it stays a lone heading — no `<header>`; drop the diverging 0.75rem/0.04em →
  global `h2` 0.72rem/0.06em). The `.intro` block (explainer + "What's this?")
  is *screen* intro under the TopBar, not a section header — keep it a layout
  `<div>`. The `.add-card` is an unlabelled add form (its own `<Label>`), not a
  section — keep it a block. **BlockedScreen has no section label** — its
  `.description` is screen intro and its `.blocked-list` is a single unlabelled
  list, so it gets **no** `<section>` wrapper.
- Both: `.display-name` (span) → `<h3>`. `.sub` → `.caption .mono` (it is a
  monospace count/since line; if `--stone-lt` vs `--stone` matters it is drift →
  use `.caption`). Rename `.circle-list` / `.blocked-list` → `class="rows"` so
  the global `.rows`/`.rows .row` divider applies; drop the per-file
  `.row:first-child border-top` / `.row border-bottom` hacks; update test
  selectors querying `.circle-list` / `.blocked-list`. `.description` /
  `.intro-text` → `.caption` / `.body`; the `.whats-this` link stays a
  `<Button variant="link">`.
- CircleScreen `.add-card` → `.card-dashed` (delete scoped border/bg/radius;
  keep margin/padding layout in rem).
- BlockedScreen `.empty-state` (dashed box) → `<EmptyState icon="slash"
  title="You haven't blocked anyone." iconSize={44}>` (no body/CTA). Delete
  `.empty-state` + `.empty-state p` CSS. This is the deliberate unification.

**Files:**
- `web/src/lib/privacy/components/CircleScreen.svelte` (+ `.test.ts`)
- `web/src/lib/privacy/components/BlockedScreen.svelte` (+ `.test.ts`)

**Verify:** `pnpm lint` · `pnpm check` · `pnpm test`

### [ ] 5.9 AddEditItemSheet + DeleteItemSheet + CreateListSheet + CircleExplainerSheet + ProfileSheet

**Created:** 2026-06-03T00:00:00Z
**Completed:**

**Why:** Five sheets. Titles → `.t-sheet`/`.t-hero`; ProfileSheet name →
`.identity-name`; handles → `.sheet-handle`; the explainer hero converges to
`.t-hero`.

**Prerequisites:** Phase 3; task 5.1.

**Decisions:**
- AddEditItemSheet: `.title` (19px serif) → `<h2 class="t-sheet">`; `.sub` →
  `<p class="caption">`; `.cancel-btn` font/colour → minimal reset (keep layout);
  `.notes-field textarea` serif is an editorial exception (annotate). `.optional`
  label override (weight/transform/colour) → keep minimal or a small global
  helper; note.
- DeleteItemSheet: `.heading` (19px serif) → `<h2 class="t-sheet">` (converges
  19→18px); `.body` (13px explanatory copy) → `<p class="body">`. The
  `.icon-wrap` (40×40 ember disc: `background: var(--ember-bg)`,
  `color: var(--ember)`, `border-radius`) is a **layout-bearing** wrapper, not a
  pure-colour one — it stays as an annotated exception (per the parent plan's
  "layout-bearing icon wrappers stay" non-requirement). `.content` / `.text` /
  `.actions` stay layout; convert px gaps/margins to rem. The Cancel/Delete
  buttons are already `<Button>` (no change). No empty state.
- CreateListSheet: title comes from the `<Sheet>`; only `form`/`.field` layout
  here — convert `gap` to rem; nothing visual to strip. Likely a confirm-only
  task.
- CircleExplainerSheet: scoped `h2` (25.6px) → `<h2 class="t-hero">`; `p` →
  `.body`; `.point-title` → `<h3>` or `.caption`-bold; `.point-body` →
  `.caption`; `.privacy-footer` → `.card-alt` (delete bg/radius; keep padding
  layout). It uses bare `h2`/`p` element selectors in scope — replace with
  classes so global roles apply.
- ProfileSheet: `.name` → `<h2 class="identity-name">` (or `<p class="identity-name">`
  per current element; keep centred via a layout rule). The `.badge.circle` /
  `.badge.blocked` element is **not** a pill — it is a centred, monospace
  sage/ember **text label** under the name (`display: block`, no bg/border/
  radius). Do **not** map it to `.badge` / `.badge-score` (the `.badge` base is
  `inline-flex` + `border-radius: 99px`, which would turn it into an inline pill
  and break its centring). **Drop the `badge` class
  name from this element** (it would otherwise match the new global `.badge`
  inline-flex pill from task 3.3 and break the centred-text look). Render it as
  `<span class="circle">` / `<span class="blocked">` carrying `.caption .mono`
  with `text-align: center` as scoped layout, and the sage/ember `color` as an
  annotated scoped state one-liner (`.circle { color: var(--sage) }` / `.blocked
  { color: var(--ember) }`). The test keys on `data-test="state-badge"`, so keep
  that attribute. `.handle` → `.sheet-handle`. `.action-card` → `.card`.
  `.subtitle` opacity → `.caption`.

**Files:**
- `web/src/lib/item/components/AddEditItemSheet.svelte` (+ `.test.ts`)
- `web/src/lib/item/components/DeleteItemSheet.svelte` (+ `.test.ts`)
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
- **Section structure (both).** Each `.preference-group` (Settings: People,
  Appearance, Text size, Recovery, Account) and each Privacy group (Who can
  invite you, People) is a labelled content group → wrap it in a `<section>`
  with its title as a bare `<h2>` (lone titles, no `<header>`). PrivacyScreen's
  `.cascade-note` ("N pending invites have been declined…") is trailing
  explanatory content at the foot of the invite-policy section → put it in a
  `<footer>` inside that `<section>`.
- SettingsScreen: `.preference-group h2` → drop the duplicated font props (global
  `h2`), keep padding (rem). `.display-name` / `.nav-row-title` → `<h3>`.
  `.nav-row-sub` / `.preview-sub` → `.caption`. `.nav-row-count` →
  `.caption .mono`. `.preview-label` ("Preview", 11px) is a **sub-label inside**
  the Text-size section, not a section title — do **not** make it an `<h2>` (that
  would imply a nested section). Render it with the same small-label look via the
  `<Label>` primitive (no `for`), consistent with the e-mail-caption resolution;
  if that reads wrong, fall back to a `.caption`. `.theme-option` / `.size-card`
  / `.size-preview` / `.size-option`: move border/bg/colour/font to `.card` /
  `.surface-alt` + state classes; keep grid/sizing/padding as scoped layout
  (rem). The selected-state colour swaps stay as scoped state rules referencing
  tokens (annotate) — they are genuine state, not drift. `.skeleton-*` shimmer
  backgrounds are layout/animation chrome — keep.
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
  longer needed by a test or a layout rule; delete empty scoped rules. (No
  global `.section-label` class exists — section titles get their look from the
  `h2` tag; the one e-mail caption that is a form label uses the `<Label>`
  primitive, not a kept `.section-label` class. Confirm no stray
  `class="section-label"` survives on a non-`<h2>` element.)
- **Layout-only guard.** Scope the grep to **only the `.svelte` files this
  branch touched** — *not* all of `web/src/lib`, which includes untouched
  primitives (`basic/Button`, `TextInput`, `Textarea`, `Sheet`, `Snackbar`,
  `Accordion`, `VoteControl`, …) and untouched `shared/` components (`Avatar`,
  `AppTopBar`, `NavRow`, …) that legitimately carry visual CSS and have no
  annotation. Drive it off the branch diff so the set is exactly the swept files:
  ```
  git diff --name-only main...HEAD -- 'web/src/lib/**/*.svelte' \
    | xargs grep -nE '(font-family|font-size|font-weight|letter-spacing|text-transform|line-height):|(color|background|border[a-z-]*-color):[^;]*var\(--(ink|ink-soft|stone|stone-lt|sage|sage-bg|ember|ember-bg|paper|paper-alt|rule|accent)\)'
  ```
  The type props (`font-*`, `letter-spacing`, `text-transform`, `line-height`)
  always match; `color`/`background`/`border-*-color` match **only** when the
  value references a visual token — so value-less layout resets
  (`background: none` / `transparent`, `color: inherit`) are correctly *not*
  flagged. Every remaining hit must be an annotated exception:
  EmptyState's disc; the serif-italic `.notes`/tombstone editorial type;
  single-instance TopBar / sheet / undo-snackbar chrome; the persistent
  `.toast-error` (globalised); kept cosmetic icon-colour wrappers
  (`TrashScreen .row-icon { color: var(--stone) }`, left per the reconsidered
  parent R10); and genuinely-dynamic state-colour one-liners (the open-row
  weight/background, ProfileSheet `.circle`/`.blocked`, vote `.positive`/
  `.negative`). Each exception carries an inline comment naming why.
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
