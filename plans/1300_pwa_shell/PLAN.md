# Plan: PWA shell

Add the Progressive Web App machinery Cairn has always claimed but never
shipped — manifest, branded icons, install affordance, and a service worker for
instant offline launch and read-only offline reads. This is master-plan step 13
(`plans/0000_implementation_order.md`); it makes the live alpha at
`cairn.lynnscape.eu` actually installable and offline-tolerant.

## Context

Cairn is a pure client-rendered SvelteKit SPA on `@sveltejs/adapter-static`
with `fallback: 'index.html'` (`web/svelte.config.js`); the root loader sets
`ssr = false; prerender = false` (`web/src/routes/+layout.ts`). There is no PWA
infrastructure anywhere: `web/static/` holds only `robots.txt`, `app.html` has
no manifest/theme-color/icon links, there is no `service-worker.ts`, and
`web/src/lib/assets/favicon.svg` is still the default orange Svelte logo. The
only brand vector is the inline `CairnGlyph.svelte` (24×24, four shapes).

The target is fully specified by the docs and does **not** require any doc
reconciliation — the plan implements them:

- `docs/architecture.md` §"PWA: install, offline, and chrome" — the manifest,
  the two cache strategies (app shell cache-first; API GET
  stale-while-revalidate scoped to the lists overview + most-recently-viewed
  list), "no offline writes in v1", and the iOS install caveats.
- `docs/deployment.md` §"Service-worker considerations" — the stale-shell
  gotcha and the exact update-prompt copy; Caddy routing (manifest/SW/icons all
  fall under "everything else → web", SW scope `/` unobstructed, `nosniff`
  requires correct MIME types).
- `docs/ui.md` §"Viewport, safe areas, and browser chrome" — `display:
  standalone`, safe-area handling, and the in-app back arrow being the only
  back path in iOS standalone.
- `docs/development.md` §"The service worker in development" — SW off in `pnpm
  dev`, tested via `pnpm build && pnpm preview`.

Reusable primitives already exist: `Snackbar.svelte` (`actionLabel` +
`onaction`), `EmptyState.svelte`, `WelcomeBanner.svelte` (self-clearing hint
pattern), `Sheet.svelte`, `NavRow.svelte`, `Fab.svelte`
(`src/lib/basic/components/`). The copy *"No connection"* already appears at
`src/routes/(app)/profile/+page.svelte:110`.

Two non-obvious findings shaped the design, both verified in code:

1. **Offline cold-boot pins the boot screen.** `bootSession()` calls
   `refresh()`, which on a network failure returns `transient`, leaving
   `session.current.status === 'unknown'`
   (`src/lib/shared/state/session.svelte.ts:100-125`) — and the root layout
   shows the boot screen while status is `unknown`. So "reload offline → see
   cached items" is impossible without an offline-session fallback (R6).
2. **`vite preview` has no dev proxy/auth shim.** The cookie→bearer shim and
   `/api` proxy live in `vite.config.ts` as dev-only `configureServer`
   middleware. The SW is off in `pnpm dev`, so the offline e2e must run against
   `pnpm preview` — which currently can't reach `/api` or `/auth`. That gap is
   real infra work (Phase 6).

## Decisions

**Native SvelteKit service worker, no new dependency.** Use
`src/service-worker.ts` + the `$service-worker` module (`build`, `files`,
`version`) rather than `vite-plugin-pwa` / Workbox (R3, R4). The two cache
strategies here are bespoke — URL-classified stale-while-revalidate with a
purge-on-list-change — which is *more* awkward to express through Workbox's
`registerRoute` matchers than to write directly, and a self-hosted app that
prizes a lean bundle (`docs/architecture.md`) shouldn't add a build dependency
for it. `adapter-static` compiles `service-worker.ts` to `build/service-worker.js`
at scope `/` regardless of SPA-fallback mode; `kit.serviceWorker.register`
controls only *auto-registration*, so we set it `false` and register manually
to own the update lifecycle (R7).

**App-shell precache = `['/', ...build, ...files]`; navigations cache-first
from `'/'`.** Because the app is a pure SPA, the shell HTML is the `'/'`
fallback and is **not** in `$service-worker`'s `build`/`prerendered` (nothing
is prerendered). The SW must cache a request to `'/'` explicitly on install and
answer every `request.mode === 'navigate'` from it (R3). Network-first
navigation was rejected — it defeats "instant launch offline" and reintroduces
a spinner on flaky networks; the stale-shell risk it would avoid is instead
handled by the R7 update prompt.

**API SWR is URL-classified with a single "current-list epoch".** The SW
classifies each `/api` GET by URL and keeps only the lists-overview response
(always) and everything belonging to the most-recently-requested `list_id`;
entering a different list purges the previous list's cached items/votes/meta
(R4). A plain size-N LRU over individual URLs was rejected: the `/api/votes`
URL keys on item-id lists, not `list_id`, so an LRU can't attribute a votes
entry to a list — but purging on the `items_ranked` entry request (which
`fetchItems` always issues first) wipes the prior list's votes too, so the
epoch approach sidesteps it. This is what makes an un-opened list uncached
offline → clean "No connection", with no unbounded growth.

The purge on entry is **incoming-list-preserving**: it deletes every API
entry *except* the overview requests, the MRU sentinel, **and** any entry
whose URL already carries the incoming `list_id`/`id` (the list-meta GET
`/api/lists?id=eq.<listId>` from `ItemsScreen.reloadMeta()` and the
`items_ranked` GET itself). Without this carve-out, a `reloadMeta` response
that landed *before* the `items_ranked` entry marker would be purged and
never re-fetched, so the list name/description would be blank offline even
though the items render. Only entries with no attributable list (`/api/votes`
and the prior list's rows) are actually deleted and then re-cached fresh.

**Sign-out / account-switch purge the API cache (R11).** The API cache is
per-device, not per-user — the lists-overview URL is byte-identical across
accounts, so SWR would serve one account's cached overview to the next on the
same device. `signOut`/`onUnauthorized` therefore delete every `cairn-api-*`
cache (Cache Storage is reachable from the window, no SW round-trip needed),
and a cold boot whose refreshed `id` differs from the persisted
`cairn.user.id` purges before rendering. The app-shell cache is
user-independent and left intact. This is why the persisted-user clear in
`signOut` alone is not enough.

**Optimistic offline session, persisted last-known user.** Persist
`{id, username}` to `localStorage['cairn.user']` on sign-in / boot-success;
clear it in `signOut` / `onUnauthorized` (alongside the API-cache purge, R11).
In `bootSession`, when `refresh()` is `transient` **and**
`navigator.onLine === false` **and** a persisted user exists, adopt
`signed-in` optimistically (R6). This preserves the existing invariant
"transient never signs out" and reserves `signed-out` for an authoritative
401. Caching `/auth/refresh` in the SW was rejected — auth must be
network-only; a cached 200 refresh would be a security and correctness
hazard. `cairn.user` and `cairn.install_hint_dismissed` are new client-side
stores, so Phase 0 records them in the `docs/architecture.md` client-storage
inventory (which is framed as exhaustive) before the code that writes them
lands.

**Update prompt reuses `Snackbar` — but `Snackbar` needs a dismiss + no
auto-timeout for this case.** Manual registration in the root `+layout.svelte`
(guarded to non-dev) detects a waiting worker; a `Snackbar` shows the exact
copy *"A new version is available — refresh"*, action **Refresh** →
`postMessage({type:'SKIP_WAITING'})` → reload on `controllerchange` (R7).
Auto-`skipWaiting()` on detect was rejected — it reloads the user mid-task;
the doc wants a dismissable non-modal affordance. Note that today's
`Snackbar.svelte` has **no dismiss control** and force-closes via a hard-coded
6 s `setTimeout` — appropriate for the undo snackbar, wrong for a
release prompt that must persist until the user acts or explicitly dismisses.
So `Snackbar` gains an opt-out of the auto-timeout plus an explicit dismiss
affordance (used by `UpdateSnackbar`); dismissing hides it and the update
auto-applies on next launch regardless (R7).

**Pure SW logic extracted for Vitest.** A service worker can't be mounted in
happy-dom, so URL classification and the purge decision live in a plain
`src/lib/pwa/model/sw-cache.ts` (no Svelte, no runes) that both the SW and
Vitest import; `service-worker.ts` is thin wiring. This satisfies Cairn's
"Vitest for new lib" rule without trying to unit-test the worker itself.

**Install UX: full-but-lean, from existing primitives (R8).** Capture
`beforeinstallprompt`; one "Install Cairn" `NavRow` in Settings (prompts where
the event fired, else opens the iOS explainer `Sheet`); plus a dismissible
first-launch `InstallHint` on the Lists screen, hidden when standalone or
dismissed. `InstallHint` carries its **own** dismiss + `localStorage`
persistence (`cairn.install_hint_dismissed`) — it is *not* modelled on
`WelcomeBanner`, which has no dismiss control and self-clears purely on
`profile.displayName === 'New user'`. The two coexist on the Lists screen but
only one shows at a time: `InstallHint` hides while
`profile.displayName === 'New user'` (the exact WelcomeBanner gate), so the
welcome banner wins for a brand-new user. A dedicated route was rejected as
heavier than the existing banner/sheet/row primitives. Relying on the browser
banner alone was rejected — it leaves iOS with no guidance (the documented
gap) and no consistent re-entry point.

**Offline write-disabling: lean subset now (R5).** A small `network` store
(`navigator.onLine` + online/offline events) gates the two most-tapped write
paths — the add/create `Fab` and the vote control. The remaining write sheets
already roll back their optimistic update on the caught error, so they degrade
acceptably; disabling all ~12 write components is documented as a follow-up to
keep this step "simplest thing that works".

**Icons from `CairnGlyph`, rasterized by a committed script.** Author one
master `static/icons/icon.svg` (glyph on an opaque `--paper` field); a
committed `scripts/generate-icons.mjs` using `sharp` as a **devDependency**
emits the PNGs, which are committed under `static/icons/` (R2). Rasterizing in
the Docker image was rejected — non-reproducible from git and adds a heavy
native dep to the production build. Committed PNGs are diffable and keep the
image lean. Because `icon.svg` and the replacement `favicon.svg` are
standalone files with no app-stylesheet context (rasterized by `sharp`; used
as `<link rel="icon">`), their colours must be **computed sRGB hex literals**,
not `var(--paper)` / `var(--accent)` — `CairnGlyph` fills with `currentColor`,
which would render black in these contexts. This is the same sanctioned
static-asset exception the manifest hex already uses.

**Manifest colours as committed sRGB hex, theme-color as a media pair.** The
tokens are OKLCH but older manifest parsers reject non-hex `theme_color`, so
compute hex once from `tokens.css` (light `--paper` ≈ `#F7F4EE`, dark ≈
`#24211E`; confirm during implementation) (R1). The manifest carries the single
light value; a `<meta name="theme-color" media="(prefers-color-scheme: …)">`
pair covers **system** light/dark. It does **not** track a manual in-app theme
override — the media query follows the OS, and no effect rewrites the meta
(there is none today). That mismatch is a cosmetic status-bar-tint edge on
installed-standalone only, scoped out as a Non-requirement rather than wiring a
`preferences.svelte.ts` effect + test for a chrome nicety.

## Architecture

Three test layers apply (`docs/testing.md`): Vitest (`web/src/**/*.test.ts`)
for the new lib modules and components; Playwright (`web/e2e/`) for the two
user-visible flows; no pgTAP (this step touches no schema, RLS, trigger, or
view).

### New files (all under `web/`)

- **`src/service-worker.ts`** — the worker: install-precache the shell,
  activate cleanup, fetch router (nav → shell cache-first; scoped `/api` GET →
  SWR; else passthrough), `SKIP_WAITING` handler. Thin wiring over `sw-cache`.
- **`src/lib/pwa/model/sw-cache.ts`** (+ `sw-cache.test.ts`) — pure helpers:
  `classifyApiRequest(url)` → `'overview' | {kind:'list-scoped', listId,
  isEntry?} | null`, versioned cache-name builders, epoch-purge decision.
- **`src/lib/pwa/state/service-worker.svelte.ts`** (+ test + `__mocks__/`) —
  `swUpdate` runes store: `register()` (non-dev), waiting-worker detection,
  `applyUpdate()`.
- **`src/lib/pwa/state/install.svelte.ts`** (+ test + `__mocks__/`) — `install`
  store: capture `beforeinstallprompt`, `isStandalone`, `isIos`,
  `promptInstall()`, hint-dismiss persistence.
- **`src/lib/pwa/components/UpdateSnackbar.svelte`** (+ test + `__mocks__/`) —
  wraps `Snackbar` with the R7 copy + Refresh action.
- **`src/lib/pwa/components/InstallHint.svelte`** (+ test + `__mocks__/`) —
  first-launch dismissible banner.
- **`src/lib/pwa/components/InstallExplainerSheet.svelte`** (+ test +
  `__mocks__/`) — iOS "Add to Home Screen" explainer (Sheet-based).
- **`src/lib/shared/state/network.svelte.ts`** (+ test + `__mocks__/`) —
  `network` store: `online` from `navigator.onLine` + listeners.
- **`src/lib/shared/components/NoConnectionState.svelte`** (+ test +
  `__mocks__/`) — wraps `EmptyState` (`icon="slash"`, title "No connection").
- **`static/manifest.webmanifest`** — the manifest (R1).
- **`static/icons/icon.svg`** + committed PNGs (192, 512, 512-maskable,
  apple-touch-180) (R2).
- **`scripts/generate-icons.mjs`** — reproducible `sharp` rasterizer.
- **`e2e/offline-read.spec.ts`**, **`e2e/pwa-install.spec.ts`** — R3/R4/R1
  acceptance (`docs/testing.md` "Offline read" + "PWA install path").
- **`playwright.pwa.config.ts`** — `webServer` = `pnpm build && pnpm preview`,
  Chromium project.

### Modified files (all under `web/`)

- **`svelte.config.js`** — `kit.serviceWorker = { register: false }`.
- **`src/app.html`** — `<link rel="manifest">`, `theme-color` media pair,
  `apple-touch-icon`, `apple-mobile-web-app-capable`/`-status-bar-style`,
  `mobile-web-app-capable` (R1, R9).
- **`src/routes/+layout.svelte`** — `swUpdate.register()` in `onMount` (non-dev);
  render `<UpdateSnackbar>`; use the new Cairn favicon.
- **`src/lib/shared/components/Snackbar.svelte`** (+ test) — add an opt-out of
  the 6 s auto-timeout and an explicit dismiss affordance, so `UpdateSnackbar`
  can persist a release prompt (R7); the undo snackbar keeps today's timed
  behaviour by default.
- **`docs/architecture.md`** (Phase 0) — add `cairn.user` and
  `cairn.install_hint_dismissed` to the client-side storage inventory table.
- **`src/lib/assets/favicon.svg`** — Cairn glyph, not the Svelte logo (R2).
- **`src/lib/shared/state/session.svelte.ts`** (+ test) — persist/clear
  `cairn.user`; offline-optimistic boot adoption (R6).
- **`src/lib/item/components/ItemsScreen.svelte`** (+ test) —
  `<NoConnectionState>` branch (R4); disable the add-item control offline (R5).
- **`src/lib/basic/components/Fab.svelte`** + the vote-control component
  (+ tests) — disabled while `!network.online` (R5).
- **Lists screen** (`src/routes/(app)/lists/+page.svelte` or `ListsScreen`) —
  mount `<InstallHint>` alongside `WelcomeBanner` (R8).
- **`src/lib/settings/components/SettingsScreen.svelte`** (+ test) — "Install
  Cairn" `NavRow` (R8).
- **`vite.config.ts`** — non-destructive refactor with **two** shareable
  pieces (they live in different places today, so this is not one factory):
  (a) the `/auth/*` dev handlers, currently `server.middlewares.use(...)`
  chains inside the `cairn-auth-shim` plugin's `configureServer` hook —
  reusable from `configurePreviewServer`, which also exposes
  `server.middlewares`; and (b) the `/api` + `/avatars` cookie→bearer proxies,
  currently under the top-level `server.proxy` config key (not in
  `configureServer`) — reusable via the separate `preview.proxy` config key
  (same `configure`/`proxyReq` shape). The existing `configureServer`/`server.proxy`
  paths stay byte-identical (the current e2e are the regression guard) (Phase 6).
- **`package.json`** — `sharp` devDependency; `gen:icons` + `test:e2e:pwa`
  scripts.
- **`web/Dockerfile`** (or its serving config) — ensure `.webmanifest` is
  served as `application/manifest+json` under `nosniff` (R1).

### Service-worker fetch router (concrete)

URL shapes (all under `/api`): overview `GET /api/lists?…order=modified_at.desc`
(no `id`); items `GET /api/items_ranked?list_id=eq.<uuid>&…`; votes
`GET /api/votes?item_id=in.(…)`; meta `GET /api/lists?id=eq.<uuid>&…`.

```
fetch (GET, same-origin only; non-GET / cross-origin → untouched so writes hit
       the network and fail naturally offline):
  1. navigate            → caches.match('/') ?? network ?? cached '/'
  2. in shell precache   → cache-first
  3. classifyApiRequest:
       'overview'        → SWR, always retained
       list-scoped entry → if listId ≠ stored epoch: purge every API entry
                           except overview + epoch sentinel + entries whose URL
                           already carries this listId (id=eq./list_id=eq.);
                           record new epoch; then SWR
       list-scoped other → SWR into the current-list bucket
       (no cache + net fail) → synthetic 503 {code:'offline'} JSON so
                               postgrest.ts throws a clean ApiError
  4. else (/auth, /avatars, unclassified /api) → passthrough

activate keep-set = { shellCache(version), apiCache(version) }  # both, or a
                     same-version activate would delete the API cache
```

## Phase structure

TDD ordering: within each task the Vitest/Playwright RED steps precede the
implementation that greens them (same commit).

0. **Phase 0 — doc reconciliation.** The plan adds two new client-side stores
   (`localStorage['cairn.user']`, `localStorage['cairn.install_hint_dismissed']`),
   but `docs/architecture.md`'s client-side storage inventory is framed as
   exhaustive and is load-bearing for the cookie-banner exemption. Append both
   rows to the table with their qualifying gate before the code that writes
   them lands. Doc-only, no tests.
1. **Phase 1 — Config + registration skeleton.** `svelte.config.js`
   (`register:false`); a minimal `service-worker.ts` that only precaches the
   shell and cleans up on activate; the `swUpdate` store + `UpdateSnackbar`
   (unit-tested by mocking `navigator.serviceWorker`); wire `register()` +
   `<UpdateSnackbar>` into the root layout. Gate on `import.meta.env.DEV` so the
   SW stays inert in dev (R10). Manual check: `pnpm build && pnpm preview`
   installs the SW and the shell loads offline (R3, R7).
2. **Phase 2 — Manifest, icons, chrome.** Author `icon.svg`; add `sharp` +
   `generate-icons.mjs`; commit PNGs; write `manifest.webmanifest` with computed
   hex; edit `app.html`; replace `favicon.svg`; ensure `.webmanifest` MIME. A
   smoke test asserts the manifest link + theme-color metas render (R1, R2, R9).
3. **Phase 3 — App-shell fetch routing + SWR.** `sw-cache.ts` + its Vitest suite
   (classification + epoch-purge) first; then flesh out the `service-worker.ts`
   fetch router to use them (R3, R4).
4. **Phase 4 — Offline session + "No connection".** `network` store first
   (its consumers depend on it); then `session.svelte.ts` offline-optimistic
   adoption (+ session tests); `NoConnectionState`; the ItemsScreen offline
   branch; disable `Fab` + vote control offline (R4, R5, R6).
5. **Phase 5 — Install affordance.** `install` store first; then `InstallHint`,
   `InstallExplainerSheet`, the Settings `NavRow`; mount the hint on Lists (R8).
6. **Phase 6 — E2E + preview harness.** The non-destructive `vite.config.ts`
   factory + `playwright.pwa.config.ts`; `offline-read.spec.ts` and
   `pwa-install.spec.ts` (R3, R4, R1), run under Chromium.

## Reference docs and skills

- **`docs/architecture.md`** — §"PWA: install, offline, and chrome" is the
  primary spec: manifest fields, the two cache strategies, no-offline-writes,
  iOS caveats, and the client-storage privacy stance.
- **`docs/deployment.md`** — §"Service-worker considerations" (stale-shell +
  exact update copy) and the Caddy routing / `nosniff` MIME constraint.
- **`docs/ui.md`** — §"Viewport, safe areas, and browser chrome" (`display:
  standalone`, safe areas) and §"Navigation and back" (in-app back is the only
  path in iOS standalone).
- **`docs/development.md`** — §"The service worker in development" (SW off in
  dev; test via `pnpm preview`).
- **`docs/testing.md`** — the pre-existing PWA acceptance criteria the e2e must
  satisfy; the three-layer split.
- **`docs/frontend-layout.md`** — the `basic/` / `shared/` / per-domain tier
  split and filename rules (`__mocks__/`, route tests drop the `+`); the new
  `pwa/` domain lives beside the others.

## Open questions

- **Exact manifest hex** — compute from `tokens.css` at implementation; default
  estimates `#F7F4EE` (light `--paper`) / `#24211E` (dark). Not a blocker.
- **iOS explainer screenshot** — ship the explainer copy now with a placeholder
  image slot; capture the real Safari share-sheet screenshot during
  implementation and commit under `static/install/`. Not a blocker.
- **Preview auth-factory fiddliness (Phase 6)** — if `configurePreviewServer`
  proves awkward, fall back to running the two PWA specs against the Dockerized
  stack behind Caddy (documented like the existing "backend containers up
  separately" note in `playwright.config.ts`). Preferred path is the factory so
  the PWA specs run with the team's existing containers-up + pnpm workflow.
- **WebKit** — the two PWA specs run under Chromium only; WebKit cannot run on
  the dev machines (known Fedora limitation), so iOS-Safari PWA specifics (the
  Add-to-Home-Screen path, ~7-day cache eviction) are verified manually on a
  real device before launch, not in CI here.
