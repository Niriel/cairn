# Tasks

## Reference skills and docs

- **`docs/architecture.md`** — §"PWA: install, offline, and chrome": manifest
  fields, the two cache strategies (app-shell cache-first; API GET
  stale-while-revalidate scoped to lists overview + most-recently-viewed list),
  no-offline-writes, iOS caveats, client-storage privacy stance.
- **`docs/deployment.md`** — §"Service-worker considerations" (stale-shell +
  exact update copy); Caddy routing / `nosniff` MIME constraint.
- **`docs/ui.md`** — §"Viewport, safe areas, and browser chrome" (`display:
  standalone`, safe areas); §"Navigation and back" (in-app back is the only
  path in iOS standalone).
- **`docs/development.md`** — §"The service worker in development" (SW off in
  `pnpm dev`; test via `pnpm build && pnpm preview`).
- **`docs/testing.md`** — the pre-existing PWA acceptance criteria; three-layer
  split (Vitest / Playwright; no pgTAP here).
- **`docs/frontend-layout.md`** — the `basic/`/`shared/`/per-domain tiers,
  `__mocks__/` placement, and the rule that route-colocated tests drop the `+`
  (`page.test.ts`, not `+page.test.ts`).

## Phase 0 — doc reconciliation

### [x] 0.1 Record the two new client-side stores in the storage inventory

**Created:** 2026-07-23T08:09:56Z
**Completed:** 2026-07-23T08:27:31Z

**Why:** This plan adds two new device-side stores —
`localStorage['cairn.user']` (Task 4.2) and
`localStorage['cairn.install_hint_dismissed']` (Task 5.1). The client-side
storage inventory in `docs/architecture.md` is explicitly framed as exhaustive
("That's the entire client-side inventory") and is load-bearing for Cairn's
cookie-banner exemption (ePrivacy Art. 5(3) / TDDDG §25). Adding stores without
listing them silently breaks that contract, and the doc mandates a "rule before
adding anything new". Land the doc edit first so downstream phases don't
introduce undocumented storage.

**Prerequisites:** None.

**Decisions:**

- In `docs/architecture.md`'s "Client-side storage and the consent question"
  table (the rows currently ending at `cairn.font_size` / the SW `Cache`), add
  two rows:
  - **`cairn.user` (`{id, username}`)** — `localStorage`; set by the session
    store on sign-in / successful boot, cleared on sign-out. Qualifies under
    gate 1 (**strictly necessary for the user-requested service**): it is what
    lets a signed-in user who cold-boots offline stay signed in and see cached
    content instead of being pinned on the boot screen (R6). Both fields are
    non-private — `username` is public (step-20 identity model), `id` is the
    caller's own uid; no e-mail or `docs/invites.md`-protected field is stored.
  - **`cairn.install_hint_dismissed` (`'1'`)** — `localStorage`; set when the
    user dismisses the first-launch install hint. Qualifies under gate 2 (**a
    functional preference the user themselves sets**): the user actively
    dismisses the hint, and the flag suppresses it thereafter.
- Keep the existing prose "That's the entire client-side inventory …" accurate
  by ensuring the two rows are inside the table it summarises.

**Reference:** `docs/architecture.md` §"Client-side storage and the consent
question" and §"The rule before adding anything new".

**Files:**

- `docs/architecture.md` (modify)

**Steps:**

1. GREEN — Add the two table rows per Decisions; re-read the surrounding prose
   to confirm it still reads as exhaustive and correct.

**Verify:** `cd web && pnpm lint` (docs-only change; no code/tests touched)

**Notes:**

- **Side edit (within the step's "confirm surrounding prose still reads
  correctly" mandate):** the "Why no banner" prose said the privacy policy
  "enumerates **the four entries above**". With two rows added the table no
  longer holds four logical entries, so I changed it to "enumerates **the
  entries above**" to keep the doc internally consistent. Rows placed among the
  `localStorage` entries (after `cairn.font_size`, before the SW `Cache` row) and
  padded to the table's existing column widths (57/220/124/285).
- **Doc/code divergence to flag (out of scope here):** that same sentence claims
  the privacy-policy **screen** (`design/cairn-legal-screens.jsx` → Privacy
  Policy; built as the canonical screen in **step 12**, now ticked done)
  enumerates the same list and is kept in sync with this table. That screen was
  authored against the pre-PWA inventory, so it does **not** yet mention
  `cairn.user` or `cairn.install_hint_dismissed`. Bringing the built privacy-
  policy screen into sync is a code change to a different plan's surface, not a
  docs edit — flagging rather than silently touching it. The two stores don't
  land in code until Tasks 4.2 / 5.1, so there's no live under-disclosure yet,
  but the screen should be updated before/with those tasks ship to prod.
- `pnpm lint` is `eslint .` and doesn't cover the root `docs/` tree; verified
  the table stays aligned by hand (all edited rows measure 57/220/124/285
  between pipes). No prettier hook covers root `docs/` either (lefthook +
  `check.sh` prettier are both scoped to `web/`).

## Phase 1 — Config + registration skeleton

### [x] 1.1 Minimal service worker + register:false config

**Created:** 2026-07-23T07:52:02Z
**Completed:** 2026-07-23T08:32:46Z

**Why:** Establish the compiled-and-installed service worker that precaches the
app shell so the app launches offline (R3), and stop SvelteKit from
auto-registering it so we can own the update lifecycle in Task 1.2 (R7, R10).

**Prerequisites:** None.

**Decisions:**

- In `web/svelte.config.js`, add `kit: { …, serviceWorker: { register: false } }`.
  `register:false` disables SvelteKit's *auto-registration* only; `adapter-static`
  still **compiles** `src/service-worker.ts` to `build/service-worker.js` at
  scope `/`.
- `service-worker.ts` type setup (svelte-check gotcha): start the file with
  `/// <reference types="@sveltejs/kit" />` and treat `self` as
  `ServiceWorkerGlobalScope` (e.g.
  `const sw = self as unknown as ServiceWorkerGlobalScope`). Import
  `build`, `files`, `version` from `$service-worker` (only resolvable inside the
  worker).
- **install**: `caches.open('cairn-shell-' + version)` → `cache.addAll(['/',
  ...build, ...files])`. `'/'` caches the SPA fallback `index.html` (it is NOT in
  `build`/`prerendered`). Do **not** call `skipWaiting()` here — a waiting worker
  is what Task 1.2's prompt surfaces.
- **activate**: delete every cache whose name is not the current shell/api cache
  for `version`; then `sw.clients.claim()`.
- **message**: on `event.data?.type === 'SKIP_WAITING'` → `sw.skipWaiting()`.
- **fetch**: minimal for now — only handle `request.mode === 'navigate'`
  (answer from cached `'/'`, network fallback) and same-origin precached assets
  (cache-first); everything else falls through to the network. The full `/api`
  SWR router lands in Phase 3.
- The worker is unit-untestable (SW globals aren't in happy-dom); it is verified
  by `pnpm build` (it compiles + is emitted) and manual `pnpm preview` offline.

**Reference:** `docs/development.md` §"The service worker in development" for why
it must be inert in `pnpm dev` (registration is gated in Task 1.2).

**Files:**

- `web/svelte.config.js` (modify)
- `web/src/service-worker.ts` (create)

**Steps:**

1. GREEN — Add `serviceWorker: { register: false }` to `svelte.config.js`.
2. GREEN — Create `src/service-worker.ts` with the reference-types header,
   install/activate/message/minimal-fetch handlers per Decisions.
3. GREEN — Run `cd web && pnpm build` and confirm
   `build/service-worker.js` is emitted with no type errors, then
   `pnpm preview` and confirm (dev tools → Application) the SW installs and a
   reload with the Offline box ticked still renders the app shell.

**Verify:** `cd web && pnpm build` · `cd web && pnpm check` · `cd web && pnpm lint`

**Notes:**

- **Side work (eslint config):** SvelteKit's generated `.svelte-kit/tsconfig.json`
  deliberately *excludes* `src/service-worker.ts` from the app's typed project
  (the worker needs the WebWorker lib, not DOM). ESLint's `projectService` then
  fails to lint it (`was not found by the project service`). Added a dedicated
  `disableTypeChecked` override for `src/service-worker.ts` in `eslint.config.js`,
  mirroring the existing "not part of the app's typed graph" tooling override.
  svelte-check still type-checks the worker separately (it passes with 0 errors).
- Offline verification: `pnpm build` emits `build/service-worker.js`; `pnpm check`
  is clean; `pnpm preview` serves `/service-worker.js` as `text/javascript` (200)
  and `/` returns the SPA shell. The interactive dev-tools "tick Offline, reload,
  shell renders" check needs a real browser and was not run headlessly.

### [x] 1.2 `swUpdate` store + `UpdateSnackbar`, wired into the root layout

**Created:** 2026-07-23T07:52:02Z
**Completed:** 2026-07-23T08:41:09Z

**Why:** Register the service worker manually (non-dev only), detect a waiting
new version, and surface the dismissable *"A new version is available —
refresh"* affordance the docs require (R7, R10).

**Prerequisites:** Task 1.1 (`service-worker.ts` exists to register;
`register:false` set).

**Decisions:**

- New domain `pwa/` under `src/lib/` (`docs/frontend-layout.md`). Create
  `src/lib/pwa/state/service-worker.svelte.ts` exporting a `swUpdate` runes
  store: `available` (boolean), `register()`, `applyUpdate()`.
- `register()` no-ops unless `import.meta.env.DEV === false`,
  `'serviceWorker' in navigator`, and (belt-and-braces) not already controlled
  in a way that should skip. It calls
  `navigator.serviceWorker.register('/service-worker.js')` (string URL — no
  import, so no route/type coupling), then wires `updatefound` →
  new worker `statechange` → when `installed` **and** `navigator.serviceWorker.controller`
  exists (i.e. an update, not first install), set `available = true`. Also check
  `registration.waiting` immediately for the already-waiting case.
- `applyUpdate()` posts `{type:'SKIP_WAITING'}` to the waiting worker and reloads
  once on the `controllerchange` event (guard against double reload).
- `UpdateSnackbar.svelte` wraps the existing `Snackbar` (`actionLabel` +
  `onaction`) with the **exact** copy `A new version is available — refresh`,
  `actionLabel="Refresh"`, `onaction={() => swUpdate.applyUpdate()}`. Non-modal.
  British English; em dash as shown.
- **`Snackbar` does not support manual dismissal today** and force-closes via a
  hard-coded 6 s `setTimeout(onclose, 6000)` — right for the undo snackbar,
  wrong for a release prompt that must stay until the user acts or dismisses.
  So extend `Snackbar.svelte` with (a) an opt-out of the auto-timeout (e.g. a
  `persistent?: boolean` prop that skips the `setTimeout` `$effect`) and (b) an
  explicit dismiss affordance (a close control that calls `onclose`).
  `UpdateSnackbar` passes `persistent` and relies on the dismiss control; the
  undo snackbar keeps today's timed, control-less behaviour by default (both
  new props default to the current behaviour so existing call sites are
  unaffected). On dismiss the prompt just hides — the waiting worker stays and
  auto-applies on next launch (R7).
- Add `__mocks__/service-worker.svelte.ts` and
  `__mocks__/UpdateSnackbar.svelte` per the tier's mock convention.
- In `src/routes/+layout.svelte`, call `swUpdate.register()` in `onMount`, and
  render `{#if swUpdate.available}<UpdateSnackbar />{/if}`.

**Reference:** `docs/deployment.md` §"Service-worker considerations" for the
exact copy and the non-modal/auto-apply-next-launch behaviour.

**Files:**

- `web/src/lib/pwa/state/service-worker.svelte.ts` (create)
- `web/src/lib/pwa/state/service-worker.test.ts` (create)
- `web/src/lib/pwa/state/__mocks__/service-worker.svelte.ts` (create)
- `web/src/lib/pwa/components/UpdateSnackbar.svelte` (create)
- `web/src/lib/pwa/components/UpdateSnackbar.test.ts` (create)
- `web/src/lib/pwa/components/__mocks__/UpdateSnackbar.svelte` (create)
- `web/src/lib/shared/components/Snackbar.svelte` (modify — `persistent` opt-out + dismiss control)
- `web/src/lib/shared/components/Snackbar.test.ts` (modify — assert default timed behaviour is unchanged; `persistent` skips the timeout and exposes a dismiss control)
- `web/src/routes/+layout.svelte` (modify)

**Steps:**

1. RED — Write `service-worker.test.ts` mocking `navigator.serviceWorker`
   (`register` returns a fake registration; drive `updatefound`/`statechange`):
   assert `register()` is a no-op in dev; that an installed new worker with an
   existing controller sets `available = true`; that a first install
   (no controller) does not; that `applyUpdate()` posts `SKIP_WAITING`.
2. RED — Extend `Snackbar.test.ts`: default (no `persistent`) still auto-closes
   on the timer with no dismiss control (unchanged); with `persistent` it does
   **not** auto-close and renders a dismiss control that calls `onclose`.
3. RED — Write `UpdateSnackbar.test.ts`: renders the exact copy and a "Refresh"
   action; clicking it calls `swUpdate.applyUpdate` (mock the store); is
   persistent (does not auto-dismiss) and exposes a dismiss control.
4. RED — Run `cd web && pnpm test service-worker UpdateSnackbar Snackbar` and confirm red.
5. GREEN — Extend `Snackbar.svelte` (`persistent` opt-out + dismiss control,
   both defaulting to current behaviour); implement the store, its mock,
   `UpdateSnackbar` + its mock.
6. GREEN — Wire `register()` + `<UpdateSnackbar>` into `+layout.svelte`.
7. GREEN — Re-run the tests and `pnpm check`; confirm green.

**Verify:** `cd web && pnpm test service-worker UpdateSnackbar Snackbar` · `cd web && pnpm lint` · `cd web && pnpm check`

**Notes:**

- The `swUpdate` store's `register`/`applyUpdate` are written as
  function-valued **arrow properties** (not method shorthand) so ESLint's
  `@typescript-eslint/unbound-method` rule doesn't fire where the mocked store
  is referenced in `UpdateSnackbar.test.ts`. Neither uses `this`, so the shape
  is semantically identical — this is the clean fix, not a rule bend.
- Dismiss control: reused the existing `IconButton` with the `x` icon and
  `aria-label="Dismiss"`; dropped an initial `class="dismiss"` because
  `IconButton` spreads `...rest` onto its `<button>`, which would clobber its
  own `icon-btn` class. Its built-in tap-target styling is sufficient.

## Phase 2 — Manifest, icons, chrome

### [x] 2.1 Cairn icon set + favicon from the glyph

**Created:** 2026-07-23T07:52:02Z
**Completed:** 2026-07-27T07:49:10Z

**Why:** Ship branded install icons and replace the default orange Svelte-logo
favicon, so the installed app carries the Cairn mark (R2).

**Prerequisites:** None (the glyph geometry already exists in
`src/lib/shared/components/CairnGlyph.svelte`).

**Decisions:**

- Author `web/static/icons/icon.svg` — the `CairnGlyph` shapes centred on an
  **opaque** `--paper`-coloured square field. Use **computed sRGB hex literals**
  for both the field and the glyph, not `var(--paper)` / `var(--accent)`: a
  standalone SVG rasterized by `sharp` (and a favicon `<link>`) has no
  app-stylesheet context, and `CairnGlyph` itself fills with `currentColor`, so
  a CSS var would render black/empty. Compute the `--paper` hex (see Task 2.2)
  for the field and the `--accent` hex from `tokens.css` for the glyph — the
  same sanctioned static-asset exception the manifest hex uses. This single
  master is the source for every PNG.
- `web/scripts/generate-icons.mjs` uses `sharp` (add as a **devDependency**) to
  rasterize `icon.svg` into: `icon-192.png`, `icon-512.png`,
  `icon-512-maskable.png` (glyph inset to ~80% so Android's maskable safe-zone
  doesn't clip it, opaque field), and `apple-touch-icon-180.png` (opaque, **no
  alpha** — iOS composites transparency onto black). Add a `"gen:icons":
  "node scripts/generate-icons.mjs"` script to `package.json`.
- Commit the generated PNGs under `web/static/icons/` (reproducible from the
  script; not generated at Docker-build time).
- Replace `web/src/lib/assets/favicon.svg` with the Cairn glyph, using the same
  computed hex literals for glyph + field (not CSS vars / `currentColor`, which
  render black as a favicon). Keep the `import favicon` usage in
  `+layout.svelte:8` / the `<link rel="icon">` at `+layout.svelte:72-74`
  working.

**Files:**

- `web/static/icons/icon.svg` (create)
- `web/static/icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon-180.png` (create)
- `web/scripts/generate-icons.mjs` (create)
- `web/src/lib/assets/favicon.svg` (modify)
- `web/package.json` (modify — `sharp` devDep + `gen:icons` script)

**Steps:**

1. GREEN — Add `sharp` devDep (`cd web && pnpm add -D sharp`), author
   `icon.svg`, write `generate-icons.mjs`.
2. GREEN — Run `cd web && pnpm gen:icons`; confirm the four PNGs exist at the
   expected sizes (spot-check with an image viewer that the maskable variant has
   padding and apple-touch has no alpha).
3. GREEN — Replace `favicon.svg` with the Cairn glyph; confirm the app still
   builds and the tab icon is the cairn.

**Verify:** `cd web && pnpm gen:icons` · `cd web && pnpm build` · `cd web && pnpm lint`

**Notes:**

- **Exact hex differs from the plan's approximations — flag for Task 2.2.** The
  plan quotes the token conversions as light `--paper` ≈ `#F7F4EE` / dark ≈
  `#24211E` with an explicit "verify the exact conversion" caveat. Converting the
  oklch tokens through the canonical CSS Color 4 matrices (validated against the
  fixed points: `oklch(100% 0 0)`→`#ffffff`, `oklch(0% 0 0)`→`#000000`,
  `oklch(50% 0 0)`→`#636363`) gives the real values browsers render:
  - light `--paper` `oklch(98% 0.012 85)` → **`#fcf8f0`** (not `#F7F4EE`)
  - light `--accent` `oklch(45% 0.07 70)` → **`#6e4e27`**
  - dark `--paper` `oklch(20% 0.012 70)` → **`#1a1510`** (not `#24211E`)
  Used `#fcf8f0` (field) + `#6e4e27` (glyph) in `icon.svg` / `favicon.svg`.
  **Task 2.2 hard-codes `#F7F4EE`/`#24211E` in the manifest and the `app.html`
  `theme-color` metas** — those should use `#fcf8f0`/`#1a1510` instead so the
  installed app's chrome/background matches the icon field. (The manifest test in
  2.2 only asserts `#`-hex, so it won't catch the mismatch — the value must be
  corrected by hand.)
- **Side edit (eslint):** `scripts/**/*.{js,mjs}` isn't in the app's typed
  project, so ESLint's `projectService` errored on `generate-icons.mjs` (same
  class as Task 1.1's `service-worker.ts`). Added it to the existing "Node
  tooling, not the app's typed graph" `disableTypeChecked` override, plus a
  scoped `no-console: 'off'` override (placed after the general rules block so
  last-match-wins applies) since a codegen CLI logging what it wrote to stdout is
  legitimate.
- **SVG comment gotcha:** librsvg (via `sharp`) and strict XML parsers reject
  `--` inside `<!-- -->` comments, so the icon comments say "light paper token"
  rather than "`--paper`". SVGs are not Prettier-managed (no parser), same as the
  prior `favicon.svg`.
- Verified generated PNGs: all four opaque (`hasAlpha=false`, 3 channels) at
  192/512/512/180; the maskable glyph bbox is ~189px vs the base's ~237px
  (the expected 0.8× inset), well inside Android's 80% safe zone. The
  "tab icon renders as the cairn" visual check needs a real browser and was not
  run headlessly.

### [x] 2.2 Manifest, `app.html` chrome, and MIME

**Created:** 2026-07-23T07:52:02Z
**Completed:** 2026-07-27T08:08:25Z

**Why:** Declare the installable manifest and the standalone/theme-color chrome
so browsers offer install and the installed app has correct colours and no
browser chrome (R1, R9).

**Prerequisites:** Task 2.1 (icon files exist to reference).

**Decisions:**

- Compute the sRGB hex of the `--paper` token from
  `src/lib/shared/styles/tokens.css` (light ≈ `#F7F4EE`, dark ≈ `#24211E`;
  verify the exact conversion). Use the light value for the manifest.
- `web/static/manifest.webmanifest`: `name: "Cairn"`, `short_name: "Cairn"`,
  `start_url: "/"`, `scope: "/"`, `id: "/"`, `display: "standalone"`,
  `background_color` + `theme_color` = light `--paper` hex, and an `icons` array
  referencing `/icons/icon-192.png` and `/icons/icon-512.png` (`purpose: "any"`)
  plus `/icons/icon-512-maskable.png` (`purpose: "maskable"`), each with correct
  `sizes`/`type`.
- `web/src/app.html` additions in `<head>`: `<link rel="manifest"
  href="/manifest.webmanifest">`; `<link rel="apple-touch-icon"
  href="/icons/apple-touch-icon-180.png">`; a `theme-color` **media pair**
  (`<meta name="theme-color" media="(prefers-color-scheme: light)" content="#F7F4EE">`
  and the dark counterpart `#24211E`); `<meta name="apple-mobile-web-app-capable"
  content="yes">`, `<meta name="apple-mobile-web-app-status-bar-style"
  content="default">`, `<meta name="mobile-web-app-capable" content="yes">`.
  Leave `viewport-fit=cover` untouched (already present, R9).
- MIME: the web container serves static files (see `web/Dockerfile` / its
  serving config). Recent Caddy already maps `.webmanifest` →
  `application/manifest+json`; confirm this and only add an explicit mapping if
  the served content-type is wrong (required under `X-Content-Type-Options:
  nosniff`, `docs/deployment.md`).

**Reference:** `docs/architecture.md` §"PWA" for the manifest field list;
`docs/deployment.md` for the `nosniff`/MIME constraint.

**Files:**

- `web/static/manifest.webmanifest` (create)
- `web/src/app.html` (modify)
- `web/src/lib/pwa/model/manifest.test.ts` (create)
- `web/Dockerfile` or its serving config (modify — only if MIME is wrong)

**Steps:**

1. RED — Write `manifest.test.ts` (Node/Vitest, `fs.readFileSync`): parse
   `static/manifest.webmanifest` as JSON and assert `display === 'standalone'`,
   `start_url === '/'`, `scope === '/'`, a maskable icon is present, and
   `theme_color`/`background_color` are `#`-hex; read `src/app.html` and assert
   it contains the manifest `<link>` and both `theme-color` media metas.
2. RED — Run `cd web && pnpm test manifest` and confirm red.
3. GREEN — Author the manifest and edit `app.html` per Decisions.
4. GREEN — Re-run the test; run `pnpm build && pnpm preview` and confirm (dev
   tools → Application → Manifest) it parses with no warnings and the install
   affordance appears in a Chromium browser.

**Verify:** `cd web && pnpm test manifest` · `cd web && pnpm lint` · `cd web && pnpm check`

**Notes:**

- **Used the corrected hexes flagged in Task 2.1, not the plan's approximations.**
  Manifest `theme_color`/`background_color` and both `app.html` `theme-color`
  metas use **`#fcf8f0`** (light `--paper`) / **`#1a1510`** (dark `--paper`) — the
  exact CSS Color 4 conversions of the oklch tokens — rather than the plan's
  `#F7F4EE`/`#24211E` placeholders. This keeps the installed chrome matching the
  icon field from 2.1. The manifest test asserts `#`-hex shape only (as the plan
  intended), so it passes either way; the value choice is deliberate.
- **MIME confirmed correct — no Dockerfile/Caddyfile change.** Replicated the web
  container's serving config (`caddy:2.9.1-alpine` + the Dockerfile's
  `file_server` Caddyfile) in a throwaway container and curled the manifest:
  `Content-Type: application/manifest+json` out of the box. The task's "only add
  an explicit mapping if the served content-type is wrong" condition is not
  triggered, so the web container's serving config is untouched. (The edge
  `nosniff` header lives in `caddy/Caddyfile.prod`; the correct upstream type
  means it's satisfied.)
- **Test typing:** `JSON.parse` returns `any`, which trips
  `@typescript-eslint/no-unsafe-member-access` under `recommendedTypeChecked`.
  Cast the parsed manifest to a local `Manifest` type in the test rather than
  disabling the rule.
- The interactive "Application → Manifest parses with no warnings / install
  affordance appears" check needs a real Chromium and was not run headlessly.
  Verified instead that `pnpm build` emits `build/manifest.webmanifest` +
  `build/icons/*` and that `build/index.html` carries the manifest `<link>`.

## Phase 3 — App-shell fetch routing + SWR

### [x] 3.1 `sw-cache` classification + epoch-purge helpers (pure)

**Created:** 2026-07-23T07:52:02Z
**Completed:** 2026-07-27T08:17:17Z

**Why:** The service worker's `/api` routing decisions must be unit-testable,
but a worker can't be mounted in happy-dom — so the URL classification and the
purge-on-list-change decision live in a pure module (R4).

**Prerequisites:** None.

**Decisions:**

- `src/lib/pwa/model/sw-cache.ts`, no Svelte/runes. Export:
  - `classifyApiRequest(url: URL)`: `/api/lists` **without** an `id` param →
    `'overview'`; `/api/lists` **with** `id=eq.<uuid>` → `{kind:'list-scoped',
    listId}`; `/api/items_ranked` with `list_id=eq.<uuid>` →
    `{kind:'list-scoped', listId, isEntry:true}` (the reliable "entering a list"
    marker — `fetchItems` issues this request first); `/api/votes` →
    `{kind:'list-scoped', listId: null}` (belongs to whatever list is current);
    anything else under `/api` (or non-`/api`) → `null`.
  - versioned cache-name builders `shellCache(version)` / `apiCache(version)`.
  - `shouldPurgeForEntry(storedEpoch, listId)` → boolean (true when a
    `list-scoped` entry arrives for a different `listId` than the stored epoch).
  - a `MRU_SENTINEL_KEY` constant (`/__cairn_mru`) and a **purge predicate**
    `shouldKeepOnPurge(url: URL, incomingListId)` (or the equivalent
    "keys to delete" helper) that preserves: overview requests, the sentinel,
    **and any entry whose URL already carries `incomingListId`** (via
    `id=eq.<listId>` or `list_id=eq.<listId>`). Only unattributable entries
    (`/api/votes`, which has no listId, and the prior list's rows) are deleted.
    This carve-out prevents the entry-purge from wiping a list-meta response
    (`/api/lists?id=eq.<listId>` from `ItemsScreen.reloadMeta()`) that raced
    ahead of the `items_ranked` entry marker — otherwise the list
    name/description would be blank offline (verified: `reloadMeta` is a
    separate GET from `fetchItems`, so its arrival order is not guaranteed).
- URL shapes are verified against `src/lib/**`: overview at
  `list/state/lists.svelte.ts:82-93` (`order=modified_at.desc`, plus
  `lists_is_member=is.true` & `deleted_at=is.null`, no `id`); items at
  `item/model/item.ts:52-55` (`items_ranked?list_id=eq.<uuid>`); votes at
  `item.ts:60-62` (`votes?item_id=in.(…)`, no `list_id`); meta at
  `ItemsScreen.svelte:57-60` (`lists?id=eq.<uuid>`). Note a second
  `lists?id=eq.<uuid>&select=name` exists in `item-trash.ts:40` — it also
  classifies `list-scoped` for the same `listId`, which is harmless (it caches
  into the same list's bucket). Confirm these before finalizing the matchers.

**Files:**

- `web/src/lib/pwa/model/sw-cache.ts` (create)
- `web/src/lib/pwa/model/sw-cache.test.ts` (create)

**Steps:**

1. RED — Write `sw-cache.test.ts` covering: overview vs list-meta vs
   items-entry vs votes vs unclassified classification; that an `items_ranked`
   entry for a new `listId` triggers purge and the same `listId` does not; that
   the purge preserves the overview requests, the sentinel, **and** entries
   carrying the incoming `listId` (a `lists?id=eq.<newListId>` meta entry
   survives), while deleting `/api/votes` and the prior list's entries.
2. RED — Run `cd web && pnpm test sw-cache` and confirm red.
3. GREEN — Implement `sw-cache.ts`.
4. GREEN — Re-run; confirm green.

**Verify:** `cd web && pnpm test sw-cache` · `cd web && pnpm lint` · `cd web && pnpm check`

**Notes:**

- **URL shapes confirmed against current source** (line numbers had drifted from
  the plan's citations, but the shapes match): overview
  `/lists?select=...&order=modified_at.desc` (no `id` param) at
  `list/state/lists.svelte.ts`; items entry
  `/items_ranked?list_id=eq.<uuid>&select=...` at `item/model/item.ts`; votes
  `/votes?item_id=in.(…)` (no `list_id`) same file; meta `/lists?id=eq.<uuid>&…`
  at `ItemsScreen.svelte` (`reloadMeta`); and the second meta
  `/lists?id=eq.<uuid>&select=name` at `item-trash.ts` (`fetchListName`) — the
  latter classifies `list-scoped` for the same `listId`, harmless as the plan
  predicted. The SW sees these under the `/api` prefix
  (`postgrest.ts`: `API_BASE = VITE_API_BASE ?? '/api'`), which the matchers key
  on.
- Drove `shouldKeepOnPurge` off `classifyApiRequest` (single source of truth for
  listId extraction) rather than re-parsing the query, with the sentinel check
  first (the sentinel path isn't under `/api`, so classify would return null and
  wrongly drop it). Also exported `SHELL_CACHE_PREFIX` / `API_CACHE_PREFIX`
  constants so Task 4.2's sign-out purge can filter by the `cairn-api-` prefix
  without hard-coding the string.

### [x] 3.2 Service-worker `/api` SWR fetch router

**Created:** 2026-07-23T07:52:02Z
**Completed:** 2026-07-27T08:37:49Z

**Why:** Give the app read-only offline access to the lists overview and the
most-recently-viewed list, with a clean "No connection" for un-opened lists
(R4), by fleshing out the fetch router to use the Task 3.1 helpers.

**Prerequisites:** Task 1.1 (minimal SW), Task 3.1 (`sw-cache` helpers).

**Decisions:**

- Extend `service-worker.ts`'s `fetch` handler (GET + same-origin only; non-GET
  / cross-origin → `return` untouched so writes hit the network and fail
  naturally offline, R5):
  1. `request.mode === 'navigate'` → cached `'/'` first, network fallback, then
     cached `'/'`.
  2. URL in the shell precache → cache-first.
  3. `classifyApiRequest` non-null → **stale-while-revalidate** into
     `apiCache(version)`: `const cached = await cache.match(req)`; fire
     `fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); }).catch(() => {})`
     (the `.catch` swallows the offline background-refresh reject so it is not
     an unhandled rejection); return `cached ?? await fetchPromise`. On the
     `isEntry` request, read the stored MRU epoch and, if the `listId` differs,
     delete every `apiCache` entry **except** the overview requests, the
     `MRU_SENTINEL_KEY`, **and entries whose URL already carries the incoming
     `listId`** (via the Task 3.1 purge predicate — this keeps a
     `lists?id=eq.<listId>` meta entry that raced ahead of `items_ranked`, so
     the list name/description still renders offline), then write the new epoch
     to the sentinel. On a network failure with **no** cached response, return
     `new Response(JSON.stringify({code:'offline'}), {status:503,
     headers:{'content-type':'application/json'}})` so `postgrest.ts` throws a
     clean `ApiError` rather than a raw reject.
  4. `/auth/*`, `/avatars/*`, and unclassified `/api` GETs → network
     passthrough (never cached).
- **Extend `activate`'s keep-set** (Task 1.1 wrote a minimal version that knew
  only the shell cache) to preserve **both** `shellCache(version)` **and**
  `apiCache(version)`, deleting only caches outside that set — otherwise a
  same-version `activate` deletes the API cache the router just began
  populating. Import both builders from `sw-cache.ts`.
- Store the MRU epoch as a synthetic `Response` at `MRU_SENTINEL_KEY` inside the
  api cache so it survives SW restarts.
- Still no `skipWaiting()` on install (the update prompt owns activation).

**Reference:** `docs/architecture.md` §"PWA" — the two cache strategies and the
"not stale data, not a crash" contract.

**Files:**

- `web/src/service-worker.ts` (modify)

**Steps:**

1. GREEN — Implement the fetch router per Decisions, importing from
   `$lib/pwa/model/sw-cache` (the classification/purge logic is already
   unit-tested in Task 3.1; the worker wiring is verified by build + Phase 6
   e2e).
2. GREEN — `cd web && pnpm build && pnpm preview`; sign in, open list A, tick
   Offline, reload → list A's items still render; open a **different**,
   un-opened list → it shows an empty/error state (wired to "No connection" in
   Phase 4).

**Verify:** `cd web && pnpm build` · `cd web && pnpm check` · `cd web && pnpm lint`

**Notes:**

- **Background revalidate uses `event.waitUntil(revalidate)`** (a small
  refinement over the plan's "fire the promise" wording, same intent): without
  it the SW can be terminated after `respondWith(cached)` resolves but before the
  background `cache.put` completes, so the revalidated response would be lost.
  The `.catch(() => undefined)` still swallows the offline reject as the plan
  requires; the no-cache path `await`s the same promise and returns
  `offlineResponse()` (503 `{code:'offline'}`) on failure.
- **Shell cache-first is now gated on `SHELL_PATHS.has(url.pathname)`** (a Set of
  `['/', ...build, ...files]`), where Task 1.1's minimal worker did cache-first
  for *all* same-origin GETs. Necessary now that `/api` is SWR and `/auth` /
  `/avatars` reads must pass through uncached — an ungated cache-first would have
  swallowed them.
- **Manual offline check not run headlessly.** Verified instead that `pnpm build`
  emits `build/service-worker.js` (7.25 kB) with the `sw-cache` helpers inlined
  (`classifyApiRequest` routing, `cairn-api-*`/`cairn-shell-*` names,
  `__cairn_mru`, the `{code:'offline'}` 503), and that `pnpm check` (0 errors) /
  `pnpm lint` (0) are clean. The interactive "tick Offline, reload, list A
  renders; un-opened list shows the offline branch" check needs a real browser
  and is covered by the Phase 6 e2e (`offline-read.spec.ts`).

## Phase 4 — Offline session + "No connection"

### [x] 4.1 `network` online/offline store

**Created:** 2026-07-23T07:52:02Z
**Completed:** 2026-07-27T08:47:06Z

**Why:** A single reactive source of truth for connectivity that the session
boot, the ItemsScreen empty state, and the write controls all read (R4, R5, R6).

**Prerequisites:** None.

**Decisions:**

- `src/lib/shared/state/network.svelte.ts` exports a `network` runes store with
  a reactive `online` boolean, initialised from `navigator.onLine` and updated
  by `window` `online`/`offline` listeners. Guard all `window`/`navigator`
  access for SSR/test safety (this is an SPA but tests run in happy-dom).
- Add `__mocks__/network.svelte.ts` so consumers' component tests can force
  `online` true/false.

**Files:**

- `web/src/lib/shared/state/network.svelte.ts` (create)
- `web/src/lib/shared/state/network.test.ts` (create)
- `web/src/lib/shared/state/__mocks__/network.svelte.ts` (create)

**Steps:**

1. RED — Write `network.test.ts`: initial value tracks `navigator.onLine`;
   dispatching `offline`/`online` events flips `network.online`.
2. RED — Run `cd web && pnpm test network` and confirm red.
3. GREEN — Implement the store + mock.
4. GREEN — Re-run; confirm green.

**Verify:** `cd web && pnpm test network` · `cd web && pnpm lint` · `cd web && pnpm check`

### [x] 4.2 Offline-optimistic session boot

**Created:** 2026-07-23T07:52:02Z
**Completed:** 2026-07-27T09:00:01Z

**Why:** A signed-in user who reloads offline is currently pinned on the boot
screen forever (a transient `refresh()` leaves status `unknown`). Persist the
last-known user and adopt it optimistically when offline so cached content
renders (R6); and purge the SW API cache on sign-out / account-switch so the
next account on the device is never served the previous one's cached data
(R11).

**Prerequisites:** Task 4.1 (`network` store, or read `navigator.onLine`
directly in the store module to avoid a cycle — decide during implementation);
Task 3.1 (`sw-cache.ts` exports the `apiCache`-name prefix used by the purge).

**Decisions:**

- In `src/lib/shared/state/session.svelte.ts`: on `setSignedIn` and on a
  successful boot (`result.status === 'ok'`), persist `{id, username}` to
  `localStorage['cairn.user']`; clear it in `signOut` and `onUnauthorized`.
  Both fields are non-private (`username` is public per the step-20 model, `id`
  is the caller's own uid) — do **not** persist any e-mail or other
  `docs/invites.md`-protected field.
- **Purge the SW API cache on sign-out and account-switch (R11).** The
  lists-overview request URL is byte-identical across accounts, so SWR would
  otherwise serve one account's cached overview to the next on the same device.
  In `signOut` and `onUnauthorized`, after clearing `cairn.user`, delete every
  `cairn-api-*` cache: `if ('caches' in globalThis) { const ks = await
  caches.keys(); await Promise.all(ks.filter(k => k.startsWith('cairn-api-'))
  .map(k => caches.delete(k))); }` (guarded, best-effort — a failure must not
  block sign-out). As a second guard, in `bootSession` when `result.status ===
  'ok'` and the returned `user.id` differs from the persisted `cairn.user.id`,
  run the same purge before adopting the new session. Leave the shell cache
  intact (user-independent). `caches` is reachable from the window, so no SW
  `postMessage` round-trip is needed. Use the `apiCache`-name prefix from
  `$lib/pwa/model/sw-cache` (Task 3.1) rather than hard-coding the string.
- In `bootSession`, after `refresh()`: keep the existing `ok`→signed-in,
  `revoked`→signed-out branches. Add: if `result.status === 'transient'` **and**
  `navigator.onLine === false` **and** a valid persisted `cairn.user` exists,
  set `session.current = { status: 'signed-in', user }`. Otherwise `transient`
  still leaves status `unknown` (unchanged invariant: a transient online blip
  never signs out and never optimistically adopts).
- Guard `localStorage` access (wrap in try/catch as `app.html` already does).

**Reference:** the existing `refresh()`/`bootSession()` contract at
`session.svelte.ts:58-125` — do not change the three-way `RefreshResult`
semantics.

**Files:**

- `web/src/lib/shared/state/session.svelte.ts` (modify)
- `web/src/lib/shared/state/session.test.ts` (modify)

**Steps:**

1. RED — Add session tests: boot with `refresh()` → `transient`, offline, and a
   persisted user → status becomes `signed-in`; the same transient while
   **online** → stays `unknown`; `onUnauthorized`/`signOut` clear
   `cairn.user`; a successful boot persists it. Cache-purge (R11): with a mocked
   `caches` (`keys()` returning e.g. `['cairn-shell-x','cairn-api-x','other']`),
   `signOut`/`onUnauthorized` delete only the `cairn-api-*` entries and leave
   the shell cache; a boot whose `ok` user `id` differs from the persisted
   `cairn.user.id` purges the API cache before adopting; a same-`id` boot does
   not purge.
2. RED — Run `cd web && pnpm test session` and confirm red.
3. GREEN — Implement persistence, the offline-optimistic branch, and the
   guarded API-cache purge.
4. GREEN — Re-run; confirm green.

**Verify:** `cd web && pnpm test session` · `cd web && pnpm lint` · `cd web && pnpm check`

**Notes:**

- **Tier-rule conflict resolved by promoting the prefix to `shared/` (user
  decision).** The task said to import the api-cache prefix from
  `$lib/pwa/model/sw-cache`, but `shared/state/session.svelte.ts` importing a
  per-domain (`pwa/`) module violates `docs/frontend-layout.md`'s one-way tier
  rule (shared/ may import basic/ but not a per-domain folder) — the file's own
  header documents avoiding exactly that. Per the doc's prescribed resolution
  ("promote the shared thing to shared/"), created
  `src/lib/shared/model/cache-names.ts` exporting `SHELL_CACHE_PREFIX` /
  `API_CACHE_PREFIX`; `pwa/model/sw-cache.ts` now imports them from there
  (pwa→shared, allowed) and `session.svelte.ts` imports `API_CACHE_PREFIX` from
  there (shared→shared, allowed). This deviates from the task's literal Files
  list (adds the shared module) and lightly touches Task 3.1's completed
  `sw-cache.ts` (prefix constants moved out, no behaviour change — its 13 tests
  still pass). No dedicated test for the two-constant module; `sw-cache.test.ts`
  already asserts the composed names (`shellCache('abc') === 'cairn-shell-abc'`).
- **Deviation (gap fix): a `revoked` boot now clears `cairn.user`.** The task
  listed clear-points as `signOut` / `onUnauthorized` only, but an authoritative
  `revoked` boot that left a stale persisted user would let a *subsequent*
  offline transient boot optimistically resurrect the now-revoked session. Added
  `clearPersistedUser()` to the revoked branch to close that. (A revoked boot is
  always online — offline can't reach the server for a 401 — so this only affects
  the next boot; no cache purge added there since the account-switch guard covers
  the next sign-in.)
- **`onUnauthorized` stays synchronous.** It returns `void` (a 401 handler calls
  it), so the cache purge is fired `void purgeApiCaches()` (best-effort,
  non-blocking) rather than awaited; `signOut` (already async) awaits it. The
  offline-optimistic branch reads `navigator.onLine` directly (guarded) rather
  than importing the `network` store, matching the task's literal condition and
  avoiding coupling boot to the reactive store.
- **Account-switch purge re-checks the guard after its `await`.** The ok-branch
  purge introduces a suspension point, so it re-checks `session.current.status
  !== 'unknown'` after the await to preserve the existing race invariant (a
  deliberate `signOut`/`setSignedIn` during the purge wins).

### [x] 4.3 `NoConnectionState` + ItemsScreen offline branch

**Created:** 2026-07-23T07:52:02Z
**Completed:** 2026-07-27T09:09:52Z

**Why:** An un-opened list opened offline must show a clean "No connection"
state, not stale data or a crash (R4).

**Prerequisites:** Task 3.2 (offline `/api` returns a clean 503 error), Task 4.1
(`network` store).

**Decisions:**

- `src/lib/shared/components/NoConnectionState.svelte` wraps the existing
  `EmptyState` with `icon="slash"` and title **"No connection"** (reuse the copy
  already at `src/routes/(app)/profile/+page.svelte:110` for consistency);
  British English body copy (e.g. "Cairn couldn't reach the network. Reconnect
  and try again.").
- In `src/lib/item/components/ItemsScreen.svelte`: when the items query failed
  (error present), there are no cached rows, and `!network.online`, render
  `<NoConnectionState>` instead of the generic error/empty state.
- Add `__mocks__/NoConnectionState.svelte`.

**Files:**

- `web/src/lib/shared/components/NoConnectionState.svelte` (create)
- `web/src/lib/shared/components/NoConnectionState.test.ts` (create)
- `web/src/lib/shared/components/__mocks__/NoConnectionState.svelte` (create)
- `web/src/lib/item/components/ItemsScreen.svelte` (modify)
- `web/src/lib/item/components/ItemsScreen.test.ts` (modify)

**Steps:**

1. RED — Write `NoConnectionState.test.ts` (renders the title + copy). Add an
   `ItemsScreen.test.ts` case: error + no rows + `network.online === false`
   (mock the store) → the No-connection state renders; online error → the
   existing error state renders (unchanged).
2. RED — Run `cd web && pnpm test NoConnectionState ItemsScreen` and confirm red.
3. GREEN — Implement the component + mock and the ItemsScreen branch.
4. GREEN — Re-run; confirm green.

**Verify:** `cd web && pnpm test NoConnectionState ItemsScreen` · `cd web && pnpm lint` · `cd web && pnpm check`

**Notes:**

- **The stable `data-test` hook Task 6.2 needs is already in place.**
  `NoConnectionState` renders `data-test="no-connection"` by default (overridable
  via prop), so 6.2's "add a `data-test` attribute to NoConnectionState" is
  already satisfied — 6.2 can assert on `[data-test="no-connection"]` directly.
- ItemsScreen branch condition is `items.error && items.rows.length === 0 &&
  !network.online`, placed **before** the "Nothing here yet" empty state so an
  offline failed load shows No-connection; online failures (and genuinely empty
  lists) fall through to the existing empty state unchanged. The `items.error`
  gate ensures a genuinely-empty cached list offline still reads "Nothing here
  yet", not "No connection".

### [x] 4.4 Disable the FAB and vote control offline

**Created:** 2026-07-23T07:52:02Z
**Completed:** 2026-07-27T09:34:10Z

**Why:** Writes aren't queued offline; the two most-tapped write affordances
must visibly disable so a tap doesn't silently do nothing (R5).

**Prerequisites:** Task 4.1 (`network` store).

**Decisions:**

- Drive a disabled state from `network.online` on the add/create `Fab`
  (`src/lib/basic/components/Fab.svelte`) and the vote control (find the
  component — likely `src/lib/item/components/VoteControl.svelte` or similar;
  confirm by grep). Prefer a `disabled` prop passed by the screen over the
  component reading the store itself, to keep `basic/` tier-pure
  (`docs/frontend-layout.md`: `basic/` should not depend on `shared/state`) —
  the screen reads `network.online` and passes `disabled`.
- Disabled controls set `aria-disabled`/`disabled` and fire no request.

**Files:**

- `web/src/lib/basic/components/Fab.svelte` (modify — add/confirm a `disabled` prop)
- `web/src/lib/basic/components/Fab.test.ts` (modify)
- the vote-control component + its test (modify)
- the screens that mount them (e.g. `ItemsScreen.svelte`, the Lists screen) (modify — pass `disabled={!network.online}`)

**Steps:**

1. RED — Add tests: `Fab` renders disabled and fires no `onclick` when
   `disabled`; the vote control is non-interactive when disabled; the screen
   passes `disabled` when `network.online === false` (mock the store).
2. RED — Run the relevant `cd web && pnpm test …` and confirm red.
3. GREEN — Add the `disabled` prop plumbing and the screen wiring.
4. GREEN — Re-run; confirm green.

**Verify:** `cd web && pnpm test Fab Vote ItemsScreen` · `cd web && pnpm lint` · `cd web && pnpm check`

**Notes:**

- **`VoteControl` needed no component change — it already had a working
  `disabled` prop** (gates the thumb handler, dims via opacity, sets
  `aria-disabled`). Only added a test case for it and wired
  `disabled={!network.online}` from `ItemsScreen`. The vote control lives inside
  the open accordion panel, so its screen test opens a row first.
- **`Fab` already forwarded `disabled` implicitly** through its `{...rest}`
  spread (the real `Fab.test.ts` disabled case passed before any change). Made it
  explicit (`disabled` destructured + `{disabled}` on the button) and added a
  `button:disabled` dim style (opacity 0.4, no shadow, default cursor) so the
  offline state reads as disabled, not just inert.
- **Screen tests assert through the mocks**, so both the `Fab` mock and the
  `VoteControl` mock were extended to surface `disabled` (Fab → native
  `disabled`; VoteControl → `data-disabled` attribute). The VoteControl mock's
  `Props` lists only `disabled` — declaring the unused `value`/`onchange` tripped
  `svelte/no-unused-props`; Svelte drops extra props a component doesn't declare,
  so the screen still passes them harmlessly.
- **Self-inflicted bug caught + fixed:** wired `network.online` into
  `ListsScreen`'s Fab but initially forgot to add `import { network }` to
  `ListsScreen.svelte` (added it only to the test) — 18 ListsScreen tests failed
  with an unhandled ReferenceError until the component import was added.
- Ran the full suite (810 pass) since this touched a `basic/` primitive and two
  shared mocks.

## Phase 5 — Install affordance

### [x] 5.1 `install` store

**Created:** 2026-07-23T07:52:02Z
**Completed:** 2026-07-27T09:46:48Z

**Why:** Capture the browser's `beforeinstallprompt`, know whether we're already
standalone / on iOS, and remember a dismissed hint — the shared state behind the
install UI (R8).

**Prerequisites:** None.

**Decisions:**

- `src/lib/pwa/state/install.svelte.ts` exports an `install` store:
  `canPrompt` (a captured `beforeinstallprompt` event is held),
  `isStandalone` (`matchMedia('(display-mode: standalone)').matches ||
  navigator.standalone === true`), `isIos` (UA sniff for iPhone/iPad/iPod +
  not already Chrome-on-iOS quirks), `hintDismissed`
  (`localStorage['cairn.install_hint_dismissed']`), `promptInstall()` (calls the
  captured event's `prompt()`), and `dismissHint()`.
- A module-level `window.addEventListener('beforeinstallprompt', …)` that
  `preventDefault()`s and stashes the event; and an `appinstalled` listener that
  clears `canPrompt`. Guard `window`/`navigator`/`localStorage` for test safety.
- Add `__mocks__/install.svelte.ts`.

**Files:**

- `web/src/lib/pwa/state/install.svelte.ts` (create)
- `web/src/lib/pwa/state/install.test.ts` (create)
- `web/src/lib/pwa/state/__mocks__/install.svelte.ts` (create)

**Steps:**

1. RED — Write `install.test.ts`: dispatching `beforeinstallprompt` sets
   `canPrompt` and `promptInstall()` calls the event's `prompt`; `dismissHint()`
   sets `hintDismissed` and persists it; `isStandalone` reflects a mocked
   `matchMedia`.
2. RED — Run `cd web && pnpm test install` and confirm red.
3. GREEN — Implement the store + mock.
4. GREEN — Re-run; confirm green.

**Verify:** `cd web && pnpm test install` · `cd web && pnpm lint` · `cd web && pnpm check`

**Notes:**

- `isStandalone` and `isIos` are live getters rather than values computed once
  at import: both are cheap, and reading them on demand avoids a stale answer
  if the module loads before the launch context settles.
- `isIos` also matches iPadOS in desktop mode (`Macintosh` UA plus
  `maxTouchPoints > 1`), which the task's "iPhone/iPad/iPod sniff" wording
  didn't cover but which would otherwise leave iPad users with no affordance.
- `promptInstall()` consumes the captured event (a `beforeinstallprompt` is
  single-use), so `canPrompt` flips false after prompting.

### [x] 5.2 `InstallExplainerSheet` + `InstallHint`

**Created:** 2026-07-23T07:52:02Z
**Completed:** 2026-07-27T10:03:39Z

**Why:** iOS has no install prompt and needs an "Add to Home Screen" explainer;
a dismissible first-launch hint points new users at installation (R8).

**Prerequisites:** Task 5.1 (`install` store).

**Decisions:**

- `src/lib/pwa/components/InstallExplainerSheet.svelte` builds on the existing
  `Sheet.svelte`: a one-paragraph explainer — tap the Safari share icon, then
  *Add to Home Screen* — with a placeholder image slot for the share-sheet
  screenshot (real asset captured during implementation, committed under
  `static/install/`). British English; "e-mail" hyphenation not relevant here.
- `src/lib/pwa/components/InstallHint.svelte`: shown only when
  `!install.isStandalone && !install.hintDismissed` (and, on non-iOS,
  `install.canPrompt`); a primary "Install" affordance (prompts via
  `install.promptInstall()` where available, else opens the explainer sheet on
  iOS) and a dismiss that calls `install.dismissHint()`. Note it does **not**
  reuse `WelcomeBanner`'s mechanism: `WelcomeBanner` has no dismiss control and
  self-clears purely on `profile.displayName === 'New user'`; `InstallHint`
  carries its own `dismissHint()` + `localStorage['cairn.install_hint_dismissed']`
  (Task 5.1). The single-banner-at-a-time coordination lives in Task 5.3.
- Add `__mocks__/InstallExplainerSheet.svelte` and `__mocks__/InstallHint.svelte`.
  Follow the overlay back-stack convention (`docs/ui.md` §"Navigation and back"):
  the sheet pushes a history state on open and closes on `popstate`, like the
  other sheet primitives.

**Files:**

- `web/src/lib/pwa/components/InstallExplainerSheet.svelte` (create)
- `web/src/lib/pwa/components/InstallExplainerSheet.test.ts` (create)
- `web/src/lib/pwa/components/InstallHint.svelte` (create)
- `web/src/lib/pwa/components/InstallHint.test.ts` (create)
- `web/src/lib/pwa/components/__mocks__/InstallExplainerSheet.svelte` (create)
- `web/src/lib/pwa/components/__mocks__/InstallHint.svelte` (create)

**Steps:**

1. RED — Tests: the sheet renders the explainer copy; `InstallHint` is hidden
   when standalone or dismissed, visible otherwise; its "Install" action calls
   `promptInstall` when `canPrompt`, else opens the sheet on iOS; dismiss calls
   `dismissHint` (mock the `install` store).
2. RED — Run `cd web && pnpm test InstallHint InstallExplainerSheet` and confirm red.
3. GREEN — Implement both components + mocks.
4. GREEN — Re-run; confirm green.

**Verify:** `cd web && pnpm test InstallHint InstallExplainerSheet` · `cd web && pnpm lint` · `cd web && pnpm check`

**Notes:**

- **Deviation — no screenshot.** The task called for a placeholder image slot
  under `static/install/` with the real iOS share-sheet screenshot captured
  during implementation. No iOS device is reachable from this environment, and
  committing a fabricated or broken-link image is worse than none, so the sheet
  instead renders the two steps as an icon-led ordered list (share glyph → plus
  glyph). If a real screenshot is wanted later it drops in above the list.
- **Side work** — added a `share` path to `src/lib/basic/model/icon-paths.ts`
  (Lucide, same source as the rest) because the explainer has to point at
  Safari's Share button by its glyph. It's the first icon not present in
  `design/cairn-ui.jsx`; noted inline.
- **Deviation — store shape.** Task 5.1 shipped `install` with readonly
  getters; consumer tests need to drive `canPrompt`/`isStandalone`/`isIos`, and
  `svelte-check` rejected assignment through the real module's type. Reshaped
  `install` into a mutable `$state` object matching the network store (and its
  own `__mocks__` stand-in). `isStandalone`/`isIos` are consequently computed
  once at import rather than read live — both are fixed for a page's lifetime
  in practice.
- `InstallHint` takes no props: the single-banner coordination for Task 5.3 is
  left to a `{#if}` in `ListsScreen`, the first of the two options that task
  offers, so nothing unused ships here.

### [x] 5.3 "Install Cairn" Settings row + mount the hint on Lists

**Created:** 2026-07-23T07:52:02Z
**Completed:** 2026-07-27T10:21:10Z

**Why:** Give installation a consistent home (a Settings row) and a first-launch
nudge on the Lists screen (R8).

**Prerequisites:** Task 5.1 (`install` store), Task 5.2 (hint + sheet).

**Decisions:**

- In `src/lib/settings/components/SettingsScreen.svelte`, add a `NavRow`
  "Install Cairn" shown only when `!install.isStandalone`: tapping it calls
  `install.promptInstall()` where `canPrompt`, else opens the
  `InstallExplainerSheet` (iOS). Place it per the Settings layout conventions
  (`docs/ui.md`).
- Mount `<InstallHint />` in `src/lib/list/components/ListsScreen.svelte`,
  where `<WelcomeBanner />` is already rendered (verified: import + render in
  `ListsScreen.svelte`). Ensure only one banner shows at a time: `InstallHint`
  **yields while the welcome banner is showing**, and the welcome banner shows
  exactly when `profile.displayName === 'New user'` (its only gate — it has no
  localStorage/dismiss). So hide `InstallHint` while
  `profile.displayName === 'New user'` — either gate it in `ListsScreen`
  (`{#if profile.displayName !== 'New user'}<InstallHint />{/if}`) or pass that
  as a `suppressed` prop. This is a component, not a route file, so the
  colocated test is `ListsScreen.test.ts` (no `+`-route filename concern).
- Existing `e2e/welcome.spec.ts` exercises the Lists screen; a headless
  Chromium run typically won't fire `beforeinstallprompt` (so `InstallHint`
  stays hidden), but confirm the welcome spec still passes after mounting the
  hint.

**Files:**

- `web/src/lib/settings/components/SettingsScreen.svelte` (modify)
- `web/src/lib/settings/components/SettingsScreen.test.ts` (modify)
- `web/src/lib/list/components/ListsScreen.svelte` (modify — mount `InstallHint`, gate on the welcome predicate)
- `web/src/lib/list/components/ListsScreen.test.ts` (modify)

**Steps:**

1. RED — Tests: the Settings "Install Cairn" row is hidden when standalone and,
   when shown, calls `promptInstall`/opens the sheet appropriately; `ListsScreen`
   renders `<InstallHint>` when `profile.displayName !== 'New user'` and
   suppresses it while `profile.displayName === 'New user'` (the welcome-banner
   gate) — mock the `install` store and the profile state.
2. RED — Run the relevant `cd web && pnpm test …` and confirm red.
3. GREEN — Add the row + the `ListsScreen` mount gated on the welcome predicate.
4. GREEN — Re-run; confirm green.

**Verify:** `cd web && pnpm test SettingsScreen ListsScreen` · `cd web && pnpm lint` · `cd web && pnpm check`

**Notes:**

- **User correction — the explainer was Safari-only.** The Settings row is
  gated on `!isStandalone` as this task specifies, but its fallback opens the
  explainer sheet, and that sheet (Task 5.2) was written entirely in
  Safari/share-sheet terms. On a browser that neither prompts nor is iOS —
  desktop Firefox, say — the row would have told the user to tap a Share icon
  they don't have. The user spotted this mid-task. Fixed by branching the sheet
  on `install.isIos`: the iOS share-sheet steps as before, otherwise a generic
  "open your browser's menu and look for Install or Add to Home screen" that
  names no browser. `InstallHint` was already safe — it only shows when
  `canPrompt || isIos`.
- **Doc divergence, resolved here.** `docs/ui.md` §Settings enumerates the
  screen's navigation rows and had no install row. Added an **App → Install
  Cairn** bullet describing the visibility gate and the prompt/explainer split.
- The hint is mounted in `ListsScreen` behind
  `{#if profile.displayName !== 'New user'}` — the first of the two options
  this task offered — so `InstallHint` keeps no props and the
  one-banner-at-a-time rule lives next to the banner it defers to.
- Placed the row in a new **App** section between Text size and Privacy & data:
  installing is device-local, like the theme and text-size preferences above it.
- `e2e/welcome.spec.ts` still passes on chromium after the mount.

## Phase 6 — E2E + preview harness

### [x] 6.1 Preview-server harness (shared auth/proxy factory) + PWA Playwright config

**Created:** 2026-07-23T07:52:02Z
**Completed:** 2026-07-27T10:39:40Z

**Why:** The service worker is off in `pnpm dev`, so the PWA e2e must run against
`pnpm build && pnpm preview` — but `vite preview` currently has no dev
auth-shim/`/api` proxy, so the specs can't sign in or fetch. Make preview
prod-like without regressing the dev path (R3, R4, R1).

**Prerequisites:** None (independent infra), but lands before Task 6.2 which
depends on it.

**Decisions:**

- **Non-destructive** refactor of `web/vite.config.ts`. Note the two pieces
  live in **different** places today (verified), so this is not a single
  factory:
  - **The `/auth/*` dev handlers** are `server.middlewares.use(...)` chains
    inside the `cairn-auth-shim` plugin's `configureServer(server)` hook.
    Extract them into a middleware-installer the dev `configureServer` and a
    new `configurePreviewServer(server)` both call (the preview server also
    exposes `server.middlewares`), byte-identical for dev.
  - **The `/api` + `/avatars` cookie→bearer proxies** are under the top-level
    `server.proxy` config key (each with a `configure`/`proxyReq` hook reading
    the access cookie), **not** in `configureServer`. Lift the proxy-config
    object into a shared constant referenced by both `server.proxy` (dev) and a
    new `preview.proxy` block (same shape) so `pnpm preview` reaches
    `/api`/`/auth`/`/avatars`.
  The existing `configureServer` / `server.proxy` behaviour stays unchanged —
  the current e2e (which run on `pnpm dev`) are the regression guard.
  The module-level helpers already factored out (`readBearerFromCookie`,
  `handleDevSignin/Refresh/…`, `ACCESS_COOKIE_NAME`, `POSTGREST_DEV_URL`) are
  reused as-is.
- `web/playwright.pwa.config.ts`: `webServer.command = 'pnpm build && pnpm
  preview'`, `url` = the preview port (4173), `reuseExistingServer` non-CI;
  **Chromium project only** (WebKit can't run on the dev machines — known Fedora
  limitation; iOS specifics are verified manually). Backend containers up
  separately, as `playwright.config.ts` already documents.
- `package.json`: add `"test:e2e:pwa": "playwright test -c playwright.pwa.config.ts"`.

**Files:**

- `web/vite.config.ts` (modify)
- `web/playwright.pwa.config.ts` (create)
- `web/package.json` (modify — `test:e2e:pwa` script)

**Steps:**

1. GREEN — Extract the middleware-installer (called from `configureServer` +
   `configurePreviewServer`) and the shared proxy-config object (referenced by
   `server.proxy` + a new `preview.proxy`).
2. GREEN — Confirm the **existing** e2e still pass on `pnpm dev`
   (`cd web && pnpm test:e2e --project=chromium`) — the dev path must be
   unchanged.
3. GREEN — Add `playwright.pwa.config.ts` + the script; confirm
   `cd web && pnpm build && pnpm preview` serves the app and a manual request to
   `/api` / `/auth` is proxied.

**Verify:** `cd web && pnpm build` · `cd web && pnpm test:e2e --project=chromium` · `cd web && pnpm check`

**Notes:**

- **Side work — `testMatch`/`testIgnore` split.** Both configs point at
  `./e2e`, so without a filter `playwright.pwa.config.ts` would run all 51
  existing specs against `preview`, and `pnpm test:e2e` would run Task 6.2's
  service-worker specs against `pnpm dev`, where the worker is inert and they
  can only fail. The PWA config therefore takes
  `testMatch: ['offline-read.spec.ts', 'pwa-install.spec.ts']` and
  `playwright.config.ts` gains the mirror `testIgnore` — an edit to a file this
  task didn't list, but the two configs have to agree.
- **Preview verified by hand**, since Task 6.2's specs don't exist yet: against
  `pnpm build && pnpm preview`, `/` and `/service-worker.js` are 200,
  `/manifest.webmanifest` is 200 `application/manifest+json`, a POST to
  `/auth/signin` without the CSRF header is 403 and with it resolves against
  PostgREST (401 for an unknown user), `/auth/token?grant_type=password` is
  still locked down to 403, and a full register → authenticated
  `GET /api/lists` round trip works with the planted cookie. That last one
  exercises both halves of the refactor at once (middleware installer + shared
  proxy).
- The dev path is unchanged: all 51 chromium e2e pass on `pnpm dev` after the
  refactor.
- The manual probes left one throwaway account in the dev database, the same
  residue every e2e run leaves.

### [ ] 6.2 Offline-read + install-path Playwright specs

**Created:** 2026-07-23T07:52:02Z
**Completed:**

**Why:** Satisfy the pre-existing PWA acceptance criteria in `docs/testing.md`
("Offline read"; "PWA install path — manifest served, SW registers, app shell
loads on reload-while-offline") (R1, R3, R4).

**Prerequisites:** Task 6.1 (preview harness), and Phases 1–5 landed.

**Decisions:**

- `e2e/offline-read.spec.ts`: sign in (reuse `e2e/helpers/auth.ts`); open list A
  and see its items; `await context.setOffline(true)`; reload → list A's items
  **and its name/description** still render from cache (the name assertion
  guards the incoming-list-preserving purge from Task 3.1/3.2 — a regression
  would blank the title); navigate to a **different**, not-previously-opened
  list → the No-connection state (`data-test` hook on `NoConnectionState`) shows
  — not stale rows, not a hang.
- `e2e/pwa-install.spec.ts`: `GET /manifest.webmanifest` returns 200 with
  content-type `application/manifest+json`; after load,
  `navigator.serviceWorker.controller` becomes non-null; reload with
  `context.setOffline(true)` still renders the app shell.
- Add a stable `data-test` attribute to `NoConnectionState` (and confirm items
  rows have one) so the specs assert on hooks, not copy.

**Reference:** `docs/testing.md` for the acceptance-criteria wording; existing
specs under `web/e2e/` for the auth-helper and `data-test` conventions.

**Files:**

- `web/e2e/offline-read.spec.ts` (create)
- `web/e2e/pwa-install.spec.ts` (create)
- `web/src/lib/shared/components/NoConnectionState.svelte` (modify — add `data-test`, if not already)

**Steps:**

1. RED — Write both specs.
2. RED — Run `cd web && pnpm test:e2e:pwa` (backend containers up) and confirm
   they fail for the right reason before any missing wiring is added (they
   should largely pass if Phases 1–5 are complete; treat a genuine failure as a
   gap to fix in the owning phase, not to paper over here).
3. GREEN — Add any missing `data-test` hooks; confirm both specs pass under
   Chromium.

**Verify:** `cd web && pnpm test:e2e:pwa` · `cd web && pnpm lint` · `cd web && pnpm check`
