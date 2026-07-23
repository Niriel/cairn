# Requirements: PWA shell

Make Cairn a real installable Progressive Web App: a web manifest,
Cairn-branded icons, an install affordance, and a service worker that gives
instant offline launch plus read-only offline access to the lists overview and
the most-recently-viewed list. Cairn has always *called itself* a PWA
(`docs/README.md`, `docs/architecture.md`) but ships none of the machinery —
no manifest, no icons (the favicon is still the default orange Svelte logo), no
service worker, no install prompt. This step delivers the behaviour
`docs/architecture.md` §"PWA: install, offline, and chrome" already promises.
Offline *writes* and conflict resolution are explicitly out of scope for v1.

## R1. A valid web manifest is served and the app is installable

The app serves `/manifest.webmanifest` (content-type `application/manifest+json`)
declaring `name`, `short_name`, an `icons` array, `theme_color`,
`background_color`, `start_url: "/"`, `scope: "/"`, `id: "/"`, and
`display: "standalone"`. `web/src/app.html` links it via
`<link rel="manifest" href="/manifest.webmanifest">`. With this present and the
service worker registered (R3), Chrome/Edge/Brave offer "Install app" and iOS
Safari's "Add to Home Screen" produces a standalone launcher. `theme_color` /
`background_color` are concrete sRGB hex values derived from the app's `--paper`
token (the OKLCH tokens can't go in the manifest directly).

## R2. Cairn-branded icons replace the default Svelte logo

A branded icon set exists and is referenced by the manifest and `app.html`:
`icon-192.png`, `icon-512.png`, a maskable `icon-512-maskable.png` (with a
~10% safe-zone so Android's mask doesn't clip the mark), and an opaque
`apple-touch-icon-180.png` (no alpha — iOS composites onto black otherwise). The
favicon (`web/src/lib/assets/favicon.svg`) is the Cairn mark, not the Svelte
logo. All are derived from the existing `CairnGlyph.svelte` geometry rendered on
an opaque `--paper` field, so the installed icon matches the in-app brand.

## R3. The app shell launches instantly and works offline (cache-first)

After a first online visit, a service worker precaches the app shell — the
fallback `index.html`, and every hashed build asset and static file the shell
references (JS, CSS, fonts, icons). A subsequent load with **no network**
renders the app shell rather than the browser's error page: any
navigation request is answered from the cached shell. The shell is served
cache-first (instant launch), with new versions picked up per R7.

## R4. Read-only offline access, scoped to the lists overview + most-recently-viewed list

While offline, the user sees, from cache: (a) their lists overview, and (b) the
items of the list they most recently opened. A list they have **not** recently
opened, opened while offline, shows a clean *"No connection"* state — **not**
stale data from a previous session and **not** a crash or infinite spinner.

Concretely, API `GET` responses are cached stale-while-revalidate but the cache
is scoped: the lists-overview response is always retained, and only the
most-recently-requested list's items/votes/meta are retained — opening a
different list purges the previous list's cached rows. This is what makes an
un-opened list uncached (→ "No connection") rather than showing stale data.
Only the caller's own data is cached, in the browser's Cache Storage — bytes the
server already sent this same user; no new data is collected or exposed
(`docs/architecture.md` client-side-storage table).

## R5. Writes are never queued offline; the primary write controls reflect it

Offline edits are not queued or synced in v1. The two most-tapped write
affordances — the add/create FAB and the vote control — are **disabled** while
offline (positive: online → enabled and functional; negative: offline →
visibly disabled, no request fired). Remaining write actions (edit, delete,
rename, description, list/member management, invites) are permitted to fail
their network call and roll back their optimistic update rather than being
individually gated; they must not corrupt local state on an offline failure.

## R6. A signed-in user stays signed in across an offline reload

A user with a valid session who reloads (or cold-launches the installed app)
while offline stays signed in and sees cached content (R3, R4), rather than
being pinned on the boot screen or bounced to sign-in. A transient or offline
boot must **never** sign the user out; only an authoritative `401` from
`/auth/refresh` is a sign-out. To survive an offline cold boot the app persists
the last-known `{id, username}` locally (both non-private — `username` is public
per the step-20 identity model, `id` is the user's own uid; no e-mail or other
`docs/invites.md`-protected field is stored) and adopts it optimistically only
when offline and a prior session existed.

## R7. A new release surfaces a dismissable "refresh" prompt

When the service worker has fetched a new app version that is waiting to
activate, the app shows a **non-modal, dismissable** affordance with the exact
copy *"A new version is available — refresh"* and a **Refresh** action that
activates the waiting worker and reloads to it. If dismissed, the update
auto-applies on the next launch regardless. The user is never blocked mid-task
by an automatic reload.

## R8. One install affordance, correct per platform

A single **"Install Cairn"** entry (a row in Settings) drives installation: on
browsers that fire `beforeinstallprompt` (Android/desktop Chromium) it triggers
the captured native prompt; on iOS (no prompt) it opens a one-paragraph *"Add
to Home Screen"* explainer. A dismissible first-launch hint on the Lists screen
points a new user at it (and yields to the existing `WelcomeBanner` so only one
banner shows at a time). All install UI is hidden when the app is already
running standalone (`display-mode: standalone` / iOS `navigator.standalone`) or
after the hint has been dismissed.

## R9. Standalone display is declared and does not break the layout

`display: standalone` is declared in the manifest and the iOS
`apple-mobile-web-app-*` metas are set, so the installed app fills the window
with no browser chrome. The existing safe-area handling (`viewport-fit=cover` +
`env(safe-area-inset-*)`) and the in-app back arrow (the only back path in iOS
standalone, per `docs/ui.md` §"Navigation and back") continue to work — this
step must not regress them.

## R10. The service worker is inert in development

The service worker is **not** registered under `pnpm dev` (constant cache
invalidation during development is disruptive and hides fresh changes); it is
registered only in the built/previewed app. Testing offline behaviour is done
via `pnpm build && pnpm preview`, per `docs/development.md` §"The service worker
in development".

## R11. Sign-out and account-switch purge the cached API data

The service-worker API cache (the lists overview + most-recently-viewed
list) is per-device, not per-user: the lists-overview request URL is
identical for every account, so a cached response is keyed the same for all
of them. On sign-out (`signOut` / an authoritative `onUnauthorized`) the app
must purge the cached API data so the next account signed in on the same
device cannot be served the previous account's cached lists overview or items
(even transiently, via stale-while-revalidate). As a second guard, a cold
boot whose refreshed user `id` differs from the persisted `cairn.user.id`
purges the API cache before rendering. The app-shell cache (user-independent
HTML/JS/CSS/icons) is **not** purged. This closes a cross-account leak that
matters because one person may run several accounts on one device
(`docs/architecture.md` client-storage stance; the recovery-e-mail-not-unique
model).

## Non-requirements (explicitly excluded)

- **Offline writes / queue-and-sync / conflict resolution** — explicitly
  deferred by `docs/architecture.md`; the architecture stays compatible with
  adding it later, but v1 caches reads only.
- **Disabling every write control offline** — only the FAB and vote control are
  gated (R5); a full sweep of all ~12 write components is a scoped follow-up.
- **Precaching avatars** — `/avatars/*` stays network-only; offline they fall
  back to the initials disc the `Avatar` component already renders.
- **Per-device iOS splash-screen images** — no hand-authored
  `apple-touch-startup-image` matrix; rely on iOS's auto-generated splash from
  `background_color` + name + icon.
- **Push notifications / background sync** — rejected in
  `docs/architecture.md`; no permission surface is added.
- **Web share-target / app shortcuts / desktop window customization** — beyond
  the plain installable manifest, no extra manifest capabilities in v1.
- **A `vite-plugin-pwa` / Workbox dependency** — the native SvelteKit service
  worker covers the bespoke caching without adding a build dependency.
- **Status-bar tint tracking a manual (in-app) theme override** — the
  `theme-color` meta pair keys off `prefers-color-scheme` (the OS setting)
  only. A user who forces dark-in-app on a light-OS device gets a status-bar
  tint that follows the OS, not their override. This is a cosmetic mismatch
  visible only on the installed-standalone status bar; wiring an effect to
  rewrite the `theme-color` meta on manual override is deferred. Revisit if it
  proves jarring in practice.
