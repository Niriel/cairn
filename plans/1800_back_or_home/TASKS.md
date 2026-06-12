# Tasks

## Reference skills and docs

- **`docs/testing.md`** — three test layers; this plan uses Vitest
  (`web/src/**/*.test.ts`) and Playwright (`web/e2e/`), no pgTAP.
- **`docs/frontend-layout.md`** — `src/lib/` tier split (`basic/` vs
  `shared/`), filename rules, colocated `*.test.ts` placement.
- **`docs/ui.md`** — TopBar chrome and fixed-element conventions.
- **`.claude/skills/writing-tasks.md`** — RED-before-GREEN within a task.

Memory: Playwright is machine-conditional — runnable only on the work box
(chromium + firefox, not webkit), never on the laptop; never fake a pass.
`pnpm lint` is ESLint-only — run `prettier --write` on changed files before
committing (the pre-commit hook runs Prettier and will block otherwise).

## Phase 1 — in-app-history signal

### [x] 1.1 Add the `home` icon to the icon registry

**Created:** 2026-06-12T15:24:00Z
**Completed:** 2026-06-12T15:29:27Z

**Why:** The home-mode back control (Task 2.1) renders a `home` icon, which is
not yet in the registry. `IconName` is a closed union derived from
`ICON_PATHS`, so the name must exist before any component can reference it.

**Prerequisites:** None.

**Decisions:**
- The registry (`ICON_PATHS`) is a hand-maintained subset of lucide paths;
  add `home` as a new key. Use the classic lucide home path:
  `'home': 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10'`.
- `IconName` is `keyof typeof ICON_PATHS`, so adding the key is all that's
  needed — no separate type edit.

**Files:**
- `web/src/lib/basic/model/icon-paths.ts` (modify)

**Steps:**
1. GREEN — Add the `home` entry to the `ICON_PATHS` object literal (alphabetic
   neighbours are loose in this file; place it sensibly, e.g. near the other
   nav icons). No test of its own — it's a data row exercised by Task 2.1's
   `BackOrHome` test.

**Verify:** `cd web && pnpm check`

### [ ] 1.2 Add the `nav-history` in-app-navigation state module

**Created:** 2026-06-12T15:24:00Z
**Completed:**

**Why:** The back-or-home control needs to know whether the app has navigated
since cold load ("in-app history"). `history.length` can't tell that apart from
unrelated same-tab entries, so we track our own boolean fed by SvelteKit's
`afterNavigate`. A dedicated module lets the control read it without
prop-drilling and lets tests reset it.

**Prerequisites:** None.

**Decisions:**
- Mirror the shape of existing state modules: a `$state` boolean behind a
  reactive accessor object `navHistory` with a `get hasInApp()` getter (same
  pattern as `session.current` in `session.svelte.ts`).
- Export `recordInAppNavigation()` — sets the flag true, idempotent.
- Export `_resetForTesting()` — resets to false, matching the convention in
  `web/src/lib/shared/state/back-stack.svelte.ts`.
- File is `.svelte.ts` so `$state` runes work.

**Files:**
- `web/src/lib/shared/state/nav-history.svelte.ts` (create)
- `web/src/lib/shared/state/nav-history.test.ts` (create)

**Steps:**
1. RED   — Write `nav-history.test.ts`: (a) `navHistory.hasInApp` is `false`
   initially; (b) after `recordInAppNavigation()` it is `true`; (c) after
   `_resetForTesting()` it is `false` again. Use `beforeEach(_resetForTesting)`.
2. RED   — `cd web && pnpm test nav-history` → red (module doesn't exist).
3. GREEN — Create `nav-history.svelte.ts` per Decisions.
4. GREEN — Re-run → green.

**Verify:** `cd web && pnpm test nav-history` · `pnpm check`

### [ ] 1.3 Seed the in-app-history flag from the root layout

**Created:** 2026-06-12T15:24:00Z
**Completed:**

**Why:** The flag from Task 1.2 must be set whenever a real in-app navigation
happens. The root layout is the one component mounted for the whole session, so
it owns the `afterNavigate` registration.

**Prerequisites:** Task 1.2 (`recordInAppNavigation` exists).

**Decisions:**
- `afterNavigate` must be called during component initialisation — register it
  at the top level of `+layout.svelte`'s `<script>`, **not** inside `onMount`.
- Call `recordInAppNavigation()` only when `nav.from` is set: `from` is `null`
  on the initial `enter` and non-null on every later link/goto/popstate, so
  this flips the flag the first time the user actually moves within the app.
- Import `afterNavigate` from `$app/navigation` (alongside the existing `goto`
  import).

**Files:**
- `web/src/routes/+layout.svelte` (modify)

**Steps:**
1. GREEN — Add `afterNavigate` to the `$app/navigation` import and register
   `afterNavigate((nav) => { if (nav.from) recordInAppNavigation(); })` at the
   top of the script. Import `recordInAppNavigation` from
   `$lib/shared/state/nav-history.svelte`.

**Verify:** `cd web && pnpm check` · `pnpm lint`

## Phase 2 — the control and wiring

### [ ] 2.1 Add the `BackOrHome` control component

**Created:** 2026-06-12T15:24:00Z
**Completed:**

**Why:** TopBar's back button must become a Home button when there's no in-app
history. Extracting the mode logic into its own component keeps TopBar
declarative and gives the swap behaviour a focused test.

**Prerequisites:** Task 1.1 (`home` icon), Task 1.2 (`navHistory`).

**Decisions:**
- Two modes, selected by `const atRoot = $derived(!navHistory.hasInApp)`:
  - `atRoot` false (in-app history present): `chevron-left` icon,
    `aria-label="Back"`, click → `history.back()`.
  - `atRoot` true (cold load): `home` icon, `aria-label="Home"`, click →
    `void goto(resolve('/lists'))`.
- Wrap the existing `IconButton` (`$lib/basic/components/IconButton.svelte`),
  passing `onclick`, `aria-label`, and `data-test="topbar-back"` (stable
  selector across both modes — R3). `IconButton` spreads rest props onto its
  `<button>`, so these pass through. Icon `size={22}` (matches the old inline
  button).
- Import `goto` from `$app/navigation`, `resolve` from `$app/paths`, `Icon`
  from `$lib/basic/components/Icon.svelte`.
- `/lists` is an existing route, so `resolve('/lists')` type-checks — no
  not-yet-created-route toolchain trap.

**Reference:** `ListsScreen.test.ts:20` for the `vi.mock('$app/navigation', …)`
pattern; `IconButton.svelte` for the props it forwards.

**Files:**
- `web/src/lib/shared/components/BackOrHome.svelte` (create)
- `web/src/lib/shared/components/BackOrHome.test.ts` (create)

**Steps:**
1. RED   — Write `BackOrHome.test.ts`. Mock navigation:
   `vi.mock('$app/navigation', () => ({ goto: vi.fn(() => Promise.resolve()) }))`.
   `beforeEach` → `_resetForTesting()` from the nav-history module. Cases:
   (a) **in-app history** — call `recordInAppNavigation()` first, render,
   assert the rendered icon is `chevron-left` and `aria-label="Back"`; click
   `topbar-back` → `history.back` spy called once, `goto` not called.
   (b) **cold load** — no record, render, assert icon `home` and
   `aria-label="Home"`; click → `goto` called with the resolved `/lists`,
   `history.back` not called. (Assert on the `<path d>` or a wrapper attribute
   to distinguish icons, however the existing icon tests do it.)
2. RED   — `cd web && pnpm test BackOrHome` → red.
3. GREEN — Create `BackOrHome.svelte` per Decisions.
4. GREEN — Re-run → green.

**Verify:** `cd web && pnpm test BackOrHome` · `pnpm check`

### [ ] 2.2 Swap `BackOrHome` into TopBar and drop the dead CSS

**Created:** 2026-06-12T15:24:00Z
**Completed:**

**Why:** Route TopBar's default back control through the new component so every
screen gets the home fallback (R4), and remove the now-unused inline button and
its CSS.

**Prerequisites:** Task 2.1 (`BackOrHome` exists).

**Decisions:**
- In `TopBar.svelte`, replace the `{:else if showBack}` inline
  `<button class="icon-btn" onclick={() => history.back()} data-test="topbar-back">…</button>`
  (and its `<Icon name="chevron-left" …>`) with `<BackOrHome />`.
- The `.icon-btn` CSS block (the bar-action-button rule) loses its only
  consumer — remove it. The direct `Icon` import in TopBar may become unused;
  drop it if so (let `pnpm lint` confirm).
- TopBar test (b) currently asserts a bare `history.back()`; under the new
  nav-aware control the back path only fires when in-app history exists. Update
  it: `_resetForTesting()` in `beforeEach`, call `recordInAppNavigation()` in
  test (b) before clicking so it exercises the back path. Icon-swap detail is
  already covered by Task 2.1, so TopBar's test needn't re-assert it.
- TopBar's existing tests mock `Button`; check whether `BackOrHome`'s
  `$app/navigation`/`$app/paths` imports need mocking too in TopBar.test, or
  whether a `__mocks__/BackOrHome.svelte` (like the existing
  `__mocks__/MoreButton.svelte`) is the cleaner isolation. Prefer the
  `__mocks__` stub if wiring real navigation into TopBar.test proves noisy.

**Files:**
- `web/src/lib/shared/components/TopBar.svelte` (modify)
- `web/src/lib/shared/components/TopBar.test.ts` (modify)
- `web/src/lib/shared/components/__mocks__/BackOrHome.svelte` (create — only if
  chosen for test isolation)

**Steps:**
1. GREEN — Edit `TopBar.svelte`: import `BackOrHome`, render it in the
   `showBack` branch, delete the inline button and the `.icon-btn` CSS, drop
   any now-unused `Icon` import.
2. RED/GREEN — Update `TopBar.test.ts` per Decisions so test (b) sets in-app
   history before clicking; if isolating via `__mocks__/BackOrHome.svelte`,
   create that stub (model on `__mocks__/MoreButton.svelte`).
3. GREEN — `cd web && pnpm test TopBar` → green.

**Verify:** `cd web && pnpm test` · `pnpm check` · `pnpm lint`

## Phase 3 — e2e and close-out

### [ ] 3.1 Playwright cold-load touch

**Created:** 2026-06-12T15:24:00Z
**Completed:**

**Why:** The whole point of the change is the cold-load path, which unit tests
simulate but don't exercise through real routing. A Playwright touch confirms a
deep-URL cold load yields the Home affordance and lands on `/lists`.

**Prerequisites:** Tasks 1.3, 2.2 (behaviour wired end-to-end).

**Decisions:**
- Open a fresh context/page directly at a deep authenticated route (a list
  detail URL), so there is no prior in-app navigation — this is the cold load.
- Assert the TopBar control shows the Home affordance (e.g.
  `aria-label="Home"`) and that clicking `topbar-back` navigates to `/lists`.
- Model on the existing authenticated e2e setup (`web/e2e/items.spec.ts` and
  its auth fixtures). Keep it a small touch, not an exhaustive matrix.
- Machine-conditional: run only on the work box (chromium + firefox). If on a
  box that can't run Playwright, say so explicitly — do not claim a pass.

**Files:**
- `web/e2e/` — new spec (e.g. `back-or-home.spec.ts`) or a case added to an
  existing navigation spec, whichever fits the suite's structure.

**Steps:**
1. RED   — Write the spec: cold-load a list-detail URL, expect the Home
   affordance, click it, expect URL `/lists`.
2. GREEN — Confirm it passes against the running stack (the behaviour from
   Phases 1–2 should already satisfy it): `cd web && pnpm test:e2e`.

**Verify:** `cd web && pnpm test:e2e` (work box only)

### [ ] 3.2 Run full check and tick TODO #8

**Created:** 2026-06-12T15:24:00Z
**Completed:**

**Why:** Close the loop: confirm every layer is green and record the item as
shipped, matching the convention used for the just-shipped item #10.

**Prerequisites:** All prior tasks.

**Decisions:**
- This is a user-visible flow change, so run `./scripts/check.sh --e2e` (or the
  per-layer commands) before opening the PR. If e2e can't run on this box, say
  so.
- TODO #8 is the "Back button dead-ends on cold loads with empty history" item;
  flip its `[ ]` to `[x]` (item #10 already shows the format).

**Files:**
- `TODO.md` (modify)

**Steps:**
1. GREEN — Run `./scripts/check.sh` (add `--e2e` on a Playwright-capable box).
   Fix any fallout.
2. GREEN — Tick item #8 in `TODO.md` (`[ ]` → `[x]`).

**Verify:** `./scripts/check.sh --e2e`
