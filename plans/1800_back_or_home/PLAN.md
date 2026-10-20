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

## Design revision (2026-10-20): ask the browser

The first two decisions below (an `afterNavigate` flag seeded from the root
layout) shipped in Phases 1–2 and **did not work**. The branch then sat unmerged
from June to October; it was rebased onto `main` and reworked in Phase 3.

- **Why the flag never flipped correctly.** Cairn is client-only
  (`ssr = false` in `src/routes/+layout.ts`). In that mode SvelteKit (2.59) runs
  the first load through `navigate({ type: 'enter' })`, whose `from` is an object
  with `url: null`, never `null` itself. `if (nav.from)` was therefore true on
  every cold load. The flag flipped immediately, and a cold deep load still
  showed the chevron with a dead `history.back()`. That is the "open bug" in
  task 2.2's notes; the service-worker hypothesis was wrong. The unit tests
  passed because they simulated `from: null`.
- **Why fixing the check would not have been enough.** "Once true it stays
  true" is wrong. Cold-load a list, open a sub-screen, press back (now on the
  list), press back again: the flag is still true, `history.back()` runs, and
  the user walks out of Cairn. The control needs to know whether the entry
  **directly behind the current one** is a Cairn page, re-evaluated after
  every history change.
- **The decision: read `navigation.canGoBack`.** The browser's Navigation API
  answers exactly that question. `canGoBack` is true only when the previous
  entry in this tab's session history is same-origin. It is exact for cold
  loads, back-then-back, `replaceState` redirects, shallow `pushState` guards,
  and reloads (the browser keeps the entries). `nav-history.svelte.ts` mirrors
  `navigation.canGoBack` into `$state`, refreshed on the API's
  `currententrychange` event, in the same shape as `network.svelte.ts`.
  The `afterNavigate` hook in the root layout is removed. The API is Baseline
  since January 2026. A browser without it reports `false`, so the control
  shows Home: always safe, never stranding.

Rejected alternatives (recorded so later passes don't reopen them):

- **The `afterNavigate` flag, fixed to check `nav.type !== 'enter'`.** It still
  walks out of the app on back-then-back (above).
- **An app-side depth counter** (reset on `enter`, +1 per link/goto, +`delta` on
  popstate). `afterNavigate` doesn't say whether a `goto` replaced the
  current entry, so redirects over-count, and a reload resets it. The app would
  be guessing at what the browser already knows.
- **SvelteKit's history index** (`history.state['sveltekit:history']`). Exact,
  but a private key that could break silently on an upgrade.
- **"Up" to a per-route parent instead of `history.back()`**, Android-style.
  The arrow would disagree with system back (against `docs/ui.md` → "Navigation
  and back"), and pushing the parent grows history with duplicates.
- **A synthetic back stack** (on a cold deep load, replace the entry with the
  parent and push the deep route back). It fakes entries the user never
  visited, and Chrome's history-manipulation intervention skips entries
  added without a user gesture, so system back would still leave the app.

## Decisions

**[Superseded by the design revision above.] Track an "in-app referrer" via
`afterNavigate`, not `history.length`.**
`history.length` is unreliable (R2): a bookmarked URL opened in a tab that
previously showed other sites reports `length > 1`, yet `history.back()` walks
out of the app. SvelteKit's `afterNavigate` callback receives a `navigation`
object whose `from` is `null` only on the first `enter` and set on every
subsequent link/goto/popstate. A boolean that flips true the first time `from`
is non-null is exactly the "is there an in-app page behind us" signal, and once
true it stays true — going back is then always safe.

**[Superseded by the design revision above: the module now mirrors
`navigation.canGoBack` and nothing seeds it.] A dedicated reactive state
module, seeded from the root layout.** The flag
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

- **`web/src/lib/shared/state/nav-history.svelte.ts`** — `navHistory`, a
  `$state` mirror of `navigation.canGoBack` refreshed on `currententrychange`
  (`false` without the Navigation API).
- **`web/src/lib/shared/state/__mocks__/nav-history.svelte.ts`** — controllable
  stand-in for the consumer tests (BackOrHome, TopBar, ItemsScreen).
- **`web/src/lib/shared/state/nav-history.test.ts`** — unit test against a fake
  `navigation` object: initial value, change event, missing API.
- **`web/src/lib/shared/components/BackOrHome.svelte`** — the back-or-home
  control; reads `navHistory`, swaps icon/label/behaviour.
- **`web/src/lib/shared/components/BackOrHome.test.ts`** — both modes.

### Modified files

- **`web/src/lib/basic/model/icon-paths.ts`** — add the `home` icon path to
  `ICON_PATHS` (new `IconName` member).
- **`web/src/routes/+layout.svelte`** — unchanged from `main` after Phase 3
  (Phase 1's `afterNavigate` hook is removed again).
- **`docs/ui.md`** — "Navigation and back" gains the cold-entry rule.
- **`web/src/lib/shared/components/TopBar.svelte`** — replace the inline back
  `<button>` with `<BackOrHome />`; remove the now-dead `.icon-btn` CSS block.
- **`web/src/lib/shared/components/TopBar.test.ts`** — update test (b) so the
  in-app path is exercised under the new nav-aware behaviour.
- **`web/e2e/`** — a cold-load Playwright touch (deep URL → Home affordance →
  `/lists`).

Data flow:

```
browser: navigation.canGoBack  ──(currententrychange)──►  navHistory.canGoBack
                                                                  │
                                                                  ▼
                                               BackOrHome reads navHistory.canGoBack
                                               ├─ true  → chevron-left "Back", history.back()
                                               └─ false → home "Home",         goto('/lists')
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
3. **Phase 3 — design revision.** Replace the flag with the
   `navigation.canGoBack` mirror and its mock, drop the layout hook, move
   `BackOrHome` onto `IconButton`'s `icon` prop, and record the cold-entry rule
   in `docs/ui.md`. (R1, R2.)
4. **Phase 4 — e2e and close-out.** Add the Playwright touch (cold load, and
   back-then-back), run the full check, tick TODO #8, and restore step 1800 in
   the roadmap.

## Reference docs and skills

- **`docs/ui.md`** — TopBar styling and fixed-element conventions; confirm the
  control still fits the bar chrome.
- **`docs/testing.md`** — three test layers; this work uses Vitest + Playwright.
- **`docs/frontend-layout.md`** — `src/lib/` tier split and filename rules
  (`shared/` vs `basic/`; colocated `*.test.ts`).
- **`.claude/skills/writing-tasks.md`** — RED-before-GREEN, self-contained
  tasks.

## Open questions

- **Signed-out Home target.** A signed-out visitor cold-loading `/about/imprint`
  and pressing Home goes to `/lists`, which the layout redirect bounces to
  `/auth/signin`. That's acceptable (Home = "the app's front door"); revisit
  only if it reads oddly in review.
