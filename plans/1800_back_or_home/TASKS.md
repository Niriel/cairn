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

### [x] 1.2 Add the `nav-history` in-app-navigation state module

> **Superseded by task 3.1** (design revision, 2026-10-20).

**Created:** 2026-06-12T15:24:00Z
**Completed:** 2026-06-12T15:31:01Z

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

1. RED — Write `nav-history.test.ts`: (a) `navHistory.hasInApp` is `false`
   initially; (b) after `recordInAppNavigation()` it is `true`; (c) after
   `_resetForTesting()` it is `false` again. Use `beforeEach(_resetForTesting)`.
2. RED — `cd web && pnpm test nav-history` → red (module doesn't exist).
3. GREEN — Create `nav-history.svelte.ts` per Decisions.
4. GREEN — Re-run → green.

**Verify:** `cd web && pnpm test nav-history` · `pnpm check`

### [x] 1.3 Seed the in-app-history flag from the root layout

> **Superseded by task 3.1** (design revision, 2026-10-20).

**Created:** 2026-06-12T15:24:00Z
**Completed:** 2026-06-12T15:33:02Z

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

### [x] 2.1 Add the `BackOrHome` control component

**Created:** 2026-06-12T15:24:00Z
**Completed:** 2026-06-12T15:37:43Z

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

1. RED — Write `BackOrHome.test.ts`. Mock navigation:
   `vi.mock('$app/navigation', () => ({ goto: vi.fn(() => Promise.resolve()) }))`.
   `beforeEach` → `_resetForTesting()` from the nav-history module. Cases:
   (a) **in-app history** — call `recordInAppNavigation()` first, render,
   assert the rendered icon is `chevron-left` and `aria-label="Back"`; click
   `topbar-back` → `history.back` spy called once, `goto` not called.
   (b) **cold load** — no record, render, assert icon `home` and
   `aria-label="Home"`; click → `goto` called with the resolved `/lists`,
   `history.back` not called. (Assert on the `<path d>` or a wrapper attribute
   to distinguish icons, however the existing icon tests do it.)
2. RED — `cd web && pnpm test BackOrHome` → red.
3. GREEN — Create `BackOrHome.svelte` per Decisions.
4. GREEN — Re-run → green.

**Verify:** `cd web && pnpm test BackOrHome` · `pnpm check`

### [x] 2.2 Swap `BackOrHome` into TopBar and drop the dead CSS

**Created:** 2026-06-12T15:24:00Z
**Completed:** 2026-06-12T15:45:29Z

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

**Notes:**

- Chose to render the real `BackOrHome` in `TopBar.test.ts` (mocking
  `$app/navigation` + `$app/paths`, resetting nav-history in `beforeEach`)
  rather than a `__mocks__` stub — keeps test (b) honestly exercising the
  back path. No `__mocks__/BackOrHome.svelte` was created.
- Side work: two consumer tests broke because the back control now routes
  through `BackOrHome`. (1) `src/routes/layout.test.ts` mocked
  `$app/navigation` without `afterNavigate` (now called by the layout) —
  added `afterNavigate: vi.fn()` to its mock. (2)
  `ItemsScreen.test.ts` (e) asserted `history.back()`, but with no in-app
  history the control now takes the home-fallback path — added
  `recordInAppNavigation()` before the click and `_resetForTesting`
  (aliased `_resetNavHistory`) to its `afterEach`. Full suite green (727).
- **OPEN BUG — not yet root-caused (deferred to a Playwright-capable box).**
  Manual test on the live dev app: cold-loading a deep route
  (`/lists/<uuid>` typed/pasted into the address bar) still shows the
  `chevron-left` and back does nothing — i.e. the pre-change behaviour. Unit
  tests pass, so the component logic is sound; the live app disagrees. The
  symptom exactly matches the old code, so leading hypotheses, in order:
  (1) **PWA service worker serving a stale bundle** — Cairn registers a
  service worker; unregister it / hard-reload / clear cache and retry first.
  (2) dev server didn't hot-reload the `+layout.svelte` change — restart it.
  (3) an unexpected early navigation with `nav.from` set is flipping
  `hasInApp` true on load — instrument with a `console.log(nav.type, nav.from)`
  in the layout's `afterNavigate` on a cold load to confirm `from` is null on
  `enter`. Could not reproduce on this box (no headless browser / Playwright).
  Resolve before Task 3.1 and the TODO tick.
- **Resolved (2026-10-20):** none of the three hypotheses. Cairn is
  client-only, so SvelteKit's first-load `enter` navigation carries a non-null
  `from` (`url: null`) and the flag flipped on every cold load. Superseded by
  the Phase 3 design revision; see `PLAN.md`.

## Phase 3 — design revision: ask the browser

Background, root cause, and rejected alternatives: `PLAN.md` → "Design revision
(2026-10-20): ask the browser". Tasks 1.2 and 1.3 are superseded by 3.1; their
code is replaced, not kept.

### [x] 3.1 Mirror `navigation.canGoBack` instead of tracking an in-app flag

**Created:** 2026-10-20T18:10:00Z
**Completed:** 2026-10-20T18:40:00Z

**Why:** The `afterNavigate` flag flips on every cold load in client-only mode,
and even fixed it stays true after back-then-back. The browser's
`navigation.canGoBack` answers the real question (is the entry behind us a
Cairn page?) exactly.

**Prerequisites:** Phase 2 (BackOrHome wired into TopBar).

**Decisions:**

- `nav-history.svelte.ts` exports `navHistory = $state({ canGoBack })`, seeded
  from `navigation.canGoBack` and refreshed on the `currententrychange` event.
  Same shape as `network.svelte.ts`: an eagerly imported module, guarded for
  environments without the API (`false` there, so the control shows Home).
- The Navigation API is reached through a narrow local type
  (`EventTarget & { readonly canGoBack: boolean }`) on `globalThis`, so the
  module doesn't depend on the TypeScript DOM lib's coverage of it.
- `recordInAppNavigation()`, `_resetForTesting()` and the root layout's
  `afterNavigate` hook are deleted; `layout.test.ts` returns to `main`'s
  `$app/navigation` mock.
- Consumers' tests (BackOrHome, TopBar, ItemsScreen) mock the module through a
  new `__mocks__/nav-history.svelte.ts`, a `$state` proxy they flip directly,
  like the `network` mock. More than one test mocks it, so it's a `__mocks__`
  file, not an inline factory (`docs/frontend-layout.md` → "Mocks").
- The module's own test installs a fake `navigation` (an `EventTarget` with a
  mutable `canGoBack`) with `vi.stubGlobal` and re-imports the module with
  `vi.resetModules()`, since the module reads the API at import.

**Files:**

- `web/src/lib/shared/state/nav-history.svelte.ts` (rewrite)
- `web/src/lib/shared/state/__mocks__/nav-history.svelte.ts` (create)
- `web/src/lib/shared/state/nav-history.test.ts` (rewrite)
- `web/src/routes/+layout.svelte`, `web/src/routes/layout.test.ts` (revert the
  Phase 1 hook)
- `web/src/lib/shared/components/BackOrHome.svelte` and `BackOrHome.test.ts`,
  `TopBar.test.ts`, `web/src/lib/item/components/ItemsScreen.test.ts` (modify)

**Steps:**

1. RED — Rewrite `nav-history.test.ts`: (a) mirrors the initial
   `canGoBack`; (b) follows a `currententrychange`; (c) is `false` when the
   API is missing.
2. GREEN — Rewrite `nav-history.svelte.ts`; add the mock.
3. RED/GREEN — Point BackOrHome at `navHistory.canGoBack`; its test covers both
   modes plus a live flip from Home to Back. Update TopBar (b) and ItemsScreen
   (e) to set `navHistory.canGoBack = true` through the mock.
4. Remove the layout hook and its mock entry.

**Verify:** `cd web && pnpm test` · `pnpm check` · `pnpm lint`

**Notes:**

- Done as specified. `BackOrHome.test.ts` gained (c), a live flip from Home to
  Back through the mock, and types its `history.back` spy as
  `MockInstance<typeof history.back>` like `back-stack.test.ts` (lint rejects
  `ReturnType<typeof vi.spyOn>` as `any`).
- `+layout.svelte` and `layout.test.ts` are byte-identical to `main` again.
- Full Vitest suite green (953 tests); `pnpm check` and `pnpm lint` clean.

### [x] 3.2 Build `BackOrHome` on `IconButton`'s `icon` prop

**Created:** 2026-10-20T18:10:00Z
**Completed:** 2026-10-20T18:45:00Z

**Why:** Since June, `IconButton` takes an `icon` prop and renders the standard
`ICON_SIZE` glyph itself; BackOrHome still hand-renders an `Icon` at a
hard-coded 22.

**Prerequisites:** 3.1.

**Decisions:** Pass `icon={canGoBack ? 'chevron-left' : 'home'}`; drop the
child `Icon` and its import.

**Files:** `web/src/lib/shared/components/BackOrHome.svelte`

**Steps:**

1. GREEN — Switch to the `icon` prop; BackOrHome's icon-path assertions keep
   passing unchanged.

**Verify:** `cd web && pnpm test BackOrHome` · `pnpm check`

**Notes:** Done as specified; icon-path assertions unchanged and green.

### [x] 3.3 Record the cold-entry rule in `docs/ui.md`

**Created:** 2026-10-20T18:10:00Z
**Completed:** 2026-10-20T18:50:00Z

**Why:** "Navigation and back" says the in-app **←** always calls
`history.back()`. That is no longer true when back would leave Cairn, and the
iOS-installed-PWA note there (the **←** is the only back path) is exactly the
case this fixes.

**Prerequisites:** 3.1.

**Decisions:** Amend the "Route changes push history" bullet and add one bullet:
when the entry behind is not a Cairn page (`navigation.canGoBack` is false),
the **←** becomes a **Home** button to `/lists`. System back is left native.

**Files:** `docs/ui.md`

**Steps:**

1. Edit the section; keep it short.

**Verify:** `cd web && pnpm exec prettier --check ../docs/ui.md`

**Notes:** Done as specified: one clause on the route-changes bullet, one new
bullet after "The Lists screen is the back-stack root".

## Phase 4 — e2e and close-out

### [x] 4.1 Playwright touch: cold load and back-then-back

**Created:** 2026-06-12T15:24:00Z (revised 2026-10-20)
**Completed:** 2026-10-20T19:00:00Z

**Why:** The cold-load path is exactly what unit tests can't exercise: it
depends on real session history, which is why the June version passed its
unit tests and failed live. A Playwright touch drives the real browser.

**Prerequisites:** Phase 3.

**Decisions:**

- **Cold load, as reported:** register, create a list, then open its URL in a
  **new page** of the same context (signed in, fresh history). Expect
  `topbar-back` with `aria-label="Home"`; click it; expect `/lists`.
- **Back-then-back:** cold-load `/settings` in a new page (Home), open a
  sub-screen from a Settings row (Back), press it (back on `/settings`), and
  expect Home again, then `/lists` on click.
- Machine-conditional: Playwright runs only on a capable box (chromium +
  firefox, not webkit). If this box can't run it, say so explicitly; never
  claim a pass.

**Files:** `web/e2e/back-or-home.spec.ts` (create)

**Steps:**

1. Write the spec.
2. Attempt `cd web && pnpm test:e2e back-or-home`; report the real result.

**Verify:** `cd web && pnpm test:e2e back-or-home` (capable box only)

**Notes:**

- **Spec written, not run (no pass claimed).** `web/e2e/back-or-home.spec.ts`
  covers both cases; `playwright test --list` enumerates its 6 tests (2 × 3
  projects), so it compiles, and ESLint and Prettier are clean.
- Attempted `playwright test back-or-home --project=chromium` on the laptop:
  the launch fails with "Executable doesn't exist" (browsers never installed),
  so no assertion executed. Run it on a Playwright-capable box.
- `afterAll` closes the context with `context?.close()`: without the guard, a
  failed `beforeAll` surfaced as a `TypeError` that masked the real error.

### [ ] 4.2 Run the full check, tick TODO #8, restore step 1800 in the roadmap

**Created:** 2026-06-12T15:24:00Z (revised 2026-10-20)
**Completed:**

**Why:** Close the loop and record the item as shipped.

**Prerequisites:** All prior tasks.

**Decisions:**

- Run `./scripts/check.sh` (`--e2e` only on a Playwright-capable box; say so if
  it can't run).
- Tick TODO #8 (`[ ]` → `[x]`).
- `plans/0000_implementation_order.md` says "no `1800`"; add the step in the
  out-of-band section and tick it when merged.

**Files:** `TODO.md`, `plans/0000_implementation_order.md`

**Steps:**

1. GREEN — `./scripts/check.sh`; fix any fallout.
2. GREEN — Tick TODO #8; update the roadmap.

**Verify:** `./scripts/check.sh`
