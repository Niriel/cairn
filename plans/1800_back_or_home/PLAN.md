# Plan: TopBar back-or-home button

Make the TopBar back control fall back to a Home button when Cairn is opened
directly onto a deep route with no in-app history, instead of calling
`history.back()` into the void. Tracks TODO #8 — a live-alpha papercut that
strands anyone who bookmarks or reopens a deep URL.

## Context

`web/src/lib/shared/components/TopBar.svelte:32` renders the default back
control as an inline button whose `onclick` is `() => history.back()`. Every
screen that uses TopBar without overriding the `left` slot inherits this —
imprint, the bin screen, the items screen, and all `AppTopBar` consumers
(profile, settings, export, invites, …). The lists/home screen is the one
exception: `ListsScreen.svelte:47` passes `showBack={false}`.

When the document is cold-loaded straight onto a deep route — a PWA tab
restored onto a list, or a pasted/bookmarked `/lists/<uuid>` — there is no
prior in-app history entry, so `history.back()` either does nothing (stranding
the user) or steps out to whatever preceded Cairn in that tab. `history.length`
cannot tell these apart: it counts unrelated same-tab entries. The reliable
signal is whether the app itself has navigated since load — an "in-app
referrer" — which SvelteKit surfaces through `afterNavigate` (its `from` is
`null` only on the initial `enter`).

The home destination already exists: `web/src/routes/+page.svelte` redirects to
`/lists` via `goto(resolve('/lists'))`, and that's the natural Home target.
There is no existing in-app-history signal to reuse — the closest module,
`web/src/lib/shared/state/back-stack.svelte.ts`, tracks per-panel popstate
guards, not page-level navigation — so a small new state module is warranted.

## Decisions

**Track an "in-app referrer" via `afterNavigate`, not `history.length`.**
`history.length` is unreliable (R2): a bookmarked URL opened in a tab that
previously showed other sites reports `length > 1`, yet `history.back()` walks
out of the app. SvelteKit's `afterNavigate` callback receives a `navigation`
object whose `from` is `null` only on the first `enter` and set on every
subsequent link/goto/popstate. A boolean that flips true the first time `from`
is non-null is exactly the "is there an in-app page behind us" signal, and once
true it stays true — going back is then always safe.

**A dedicated reactive state module, seeded from the root layout.** The flag
lives in `nav-history.svelte.ts` as a `$state` boolean behind a `navHistory`
accessor object (same shape as the existing `session.current`), with a
`recordInAppNavigation()` setter and a `_resetForTesting()` reset (mirroring
`back-stack.svelte.ts`). `afterNavigate` must run during component
initialisation, so it's registered at the top of `+layout.svelte`'s script (the
always-mounted root), not in `onMount` — the layout calls
`recordInAppNavigation()` whenever `nav.from` is set. Keeping the state in its
own module (rather than inline in the layout) lets TopBar/BackOrHome read it
without prop-drilling and lets Vitest reset it between tests.

**Extract a `BackOrHome` component rather than branching inline in TopBar.**
The mode logic (icon swap, label swap, behaviour swap) is self-contained and
benefits from its own Vitest file; pulling it into
`shared/components/BackOrHome.svelte` keeps TopBar declarative — it just renders
`<BackOrHome />` in the `showBack` branch. The new component wraps the existing
`IconButton` (`$lib/basic/components/IconButton.svelte`), which also retires the
one inline `.icon-btn` block in TopBar (a small, incidental nudge toward TODO
#7 — not its scope, see Non-requirements). The component keeps
`data-test="topbar-back"` in both modes (R3) so the existing TopBar test and any
e2e touch keep addressing it unchanged.

**Home destination is fixed to `/lists`.** Matches `+page.svelte` and avoids a
needless prop. Navigated via `goto(resolve('/lists'))` so it goes through
SvelteKit routing (and `resolve` keeps `svelte/no-navigation-without-resolve`
happy — `/lists` is an existing route, so no toolchain-coupling trap here).

## Architecture

### New files

- **`web/src/lib/shared/state/nav-history.svelte.ts`** — reactive `navHistory`
  accessor (`get hasInApp()`), `recordInAppNavigation()`, `_resetForTesting()`.
- **`web/src/lib/shared/state/nav-history.test.ts`** — unit test for the flag
  lifecycle.
- **`web/src/lib/shared/components/BackOrHome.svelte`** — the back-or-home
  control; reads `navHistory`, swaps icon/label/behaviour.
- **`web/src/lib/shared/components/BackOrHome.test.ts`** — both modes.

### Modified files

- **`web/src/lib/basic/model/icon-paths.ts`** — add the `home` icon path to
  `ICON_PATHS` (new `IconName` member).
- **`web/src/routes/+layout.svelte`** — register `afterNavigate` to seed the
  in-app-history flag.
- **`web/src/lib/shared/components/TopBar.svelte`** — replace the inline back
  `<button>` with `<BackOrHome />`; remove the now-dead `.icon-btn` CSS block.
- **`web/src/lib/shared/components/TopBar.test.ts`** — update test (b) so the
  in-app path is exercised under the new nav-aware behaviour.
- **`web/e2e/`** — a cold-load Playwright touch (deep URL → Home affordance →
  `/lists`).

Data flow:

```
afterNavigate(nav.from != null)  ──►  recordInAppNavigation()  ──►  navHistory.hasInApp = true
        (in +layout.svelte)                (nav-history module)              │
                                                                            ▼
                                                          BackOrHome reads navHistory.hasInApp
                                                          ├─ true  → chevron-left, history.back()
                                                          └─ false → home,        goto('/lists')
```

Test layers (per `docs/testing.md`): all changes are web-only — Vitest for the
state module, `BackOrHome`, and TopBar; Playwright for the cold-load flow. No
DB/pgTAP layer is touched.

## Phase structure

TDD throughout: each unit's RED (failing test) precedes its GREEN
(implementation) within the same task/commit.

1. **Phase 1 — in-app-history signal.** Add the `home` icon, then the
   `nav-history` state module with its test, then wire `afterNavigate` into the
   root layout. (R2; supplies R1's input.)
2. **Phase 2 — the control and wiring.** Build `BackOrHome` with its test
   (both modes, icon/label/behaviour swap), swap it into TopBar, update the
   TopBar test, and remove the dead `.icon-btn` CSS. (R1, R3, R4.)
3. **Phase 3 — e2e and close-out.** Add the cold-load Playwright touch, run the
   full check, and tick TODO #8.

## Reference docs and skills

- **`docs/ui.md`** — TopBar styling and fixed-element conventions; confirm the
  control still fits the bar chrome.
- **`docs/testing.md`** — three test layers; this work uses Vitest + Playwright.
- **`docs/frontend-layout.md`** — `src/lib/` tier split and filename rules
  (`shared/` vs `basic/`; colocated `*.test.ts`).
- **`.claude/skills/writing-tasks.md`** — RED-before-GREEN, self-contained
  tasks.

## Open questions

- **Signed-out Home target.** A signed-out visitor cold-loading `/imprint` and
  pressing Home goes to `/lists`, which the layout redirect bounces to
  `/auth/login`. That's acceptable (Home = "the app's front door"); revisit
  only if it reads oddly in review.
