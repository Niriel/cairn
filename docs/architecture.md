# Architecture

This document describes the technical architecture of Cairn: what runs where, why each piece was chosen, and how the components fit together. It is the load-bearing design document — `data-model.md`, `development.md`, and `deployment.md` all build on the choices made here.

## Goals and non-goals

Cairn is a small app for small groups. The architecture reflects that. The driving constraints, in roughly the order they shaped decisions:

1. **Privacy.** No data passes through Google, Amazon, Microsoft, or any other hyperscaler. No third-party analytics, no third-party crash reporting by default, no third-party push service. The data lives on infrastructure we control, in the EU.
2. **Low recurring cost.** Target is under €15/month all-in, including the host, backups, and domain. The architecture should make sense for a hobby project that might never have more than a few dozen users.
3. **Boring, well-understood components.** Postgres, Docker, a reverse proxy. Nothing exotic. The interesting parts of Cairn should be the product, not the plumbing.
4. **Dev/prod parity.** The same containers run on a developer's laptop and on the production server. There is no "works on my machine" gap.
5. **Distribute by URL, not by store.** Friends should be able to use Cairn by visiting a link. No App Store review, no Play Store account, no developer fees, no sideloading drama on iOS. This shapes the choice to ship as a Progressive Web App.

Explicit non-goals:

- **Horizontal scale.** A single small VPS is the entire backend. If Cairn ever needs more than that, the architecture will need rethinking — and that's fine.
- **Offline-first as a v1 requirement.** The app degrades gracefully offline (read-only — see "Offline behaviour" below), but conflict-free merging of concurrent offline edits is not in the initial design.
- **Push notifications.** Excluded deliberately, on privacy grounds, not deferred — see "Considered and rejected" below.
- **Native mobile apps.** Cairn does not ship to the App Store or Play Store. The PWA is the product.

## The stack at a glance

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (any modern browser, mobile or desktop)            │
│  Cairn runs as a SvelteKit-built static bundle, installable │
│  to the home screen as a Progressive Web App.               │
└─────────────────────────────────────────────────────────────┘
                          │  HTTPS
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Hetzner VPS (Germany, ~€5/month)                           │
│                                                             │
│  ┌─────────────┐                                            │
│  │   Caddy     │  ← reverse proxy, automatic Let's Encrypt, │
│  └──────┬──────┘    path-prefix routing, cookie/JWT shim    │
│         │                                                   │
│    ┌────┼─────────┬───────────┐                             │
│    ▼    ▼         ▼           ▼                             │
│  ┌────┐ ┌──────┐ ┌────────┐ ┌────────┐                      │
│  │web │ │GoTrue│ │PostgREST│ │avatars │                     │
│  └────┘ └──┬───┘ └────┬───┘ └───┬────┘                      │
│           │           │         │ (resize + RPC bump)       │
│           └─────┬─────┘─────────┘                           │
│                 ▼                                           │
│  ┌──────────────────┐                                       │
│  │   PostgreSQL     │  ← schema + row-level security        │
│  └──────────────────┘                                       │
│                                                             │
│  All six services run as containers via Docker Compose.     │
└─────────────────────────────────────────────────────────────┘
                          │  nightly
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  Hetzner Storage Box (encrypted backups via Restic)         │
└─────────────────────────────────────────────────────────────┘
```

A single domain. Caddy routes by path:

- `cairn.<domain>/` → the `web` container (the static SvelteKit bundle)
- `cairn.<domain>/api/*` → PostgREST
- `cairn.<domain>/auth/*` → GoTrue (with the cookie shim — see below)
- `cairn.<domain>/avatars/*.webp` (`GET`) → static files on disk at `/srv/cairn/avatars/`, served directly by Caddy with long cache headers
- `cairn.<domain>/avatars` (`POST`) and `cairn.<domain>/avatars/me` (`DELETE`) → the `avatars` sidecar container (image resize + RPC bump — see `avatars.md` for the full endpoint list)

One origin for everything means no CORS plumbing and a clean cookie story.

## Component choices

### Host: Hetzner Cloud VPS

A single CX22 instance (2 vCPU, 4 GB RAM, 40 GB disk, ~€4/month) in a German data center. Hetzner is independent, EU-based, and not part of any hyperscaler ecosystem. Their pricing is famously generous per euro.

The whole stack — database, API, auth, reverse proxy, web bundle — runs on this one box. There is no clustering, no managed services, no orchestration platform. For a small group of users, this is sufficient by a wide margin and keeps the operational surface small.

If the box fills up or struggles, the upgrade path is to resize it in the Hetzner console; this is a straightforward operation that doesn't change anything else in the architecture.

### Container runtime: Docker + Docker Compose

Everything on the VPS runs as a Docker container, orchestrated by a single `docker-compose.yml`. This gives us:

- A reproducible deployment that matches local development byte-for-byte.
- Trivial upgrades (change a version tag, `docker compose pull && up -d`).
- Clean separation between services, even though they share one host.
- Service definitions that can be read end-to-end in one file.

We do not use Kubernetes, Nomad, or any orchestrator. They solve problems we don't have.

### Database: PostgreSQL

Postgres is the system of record for everything: users, lists, items, votes. Beyond storing data, Postgres is also where the _authorization logic_ lives, via row-level security policies. This is a deliberate concentration: there is one place that knows who can see what, and it's the same place the data lives. Authorization can't be bypassed by a buggy API layer because the API layer doesn't enforce it — the database does.

Postgres was chosen over alternatives (SQLite, CouchDB, a document store) because:

- Row-level security is a first-class, well-tested feature.
- The data model is naturally relational (lists ↔ members ↔ items ↔ votes).
- It pairs cleanly with PostgREST, which removes the need to write a custom backend.
- It is the most portable database in the world. If we ever leave this stack, the data comes with us trivially.

### API layer: PostgREST

PostgREST is a small binary that introspects a Postgres schema and exposes it as a REST API. Tables become endpoints, views become endpoints, stored procedures become RPC calls. JWT bearer tokens are decoded and the embedded user identity is set as a Postgres session variable, which the row-level security policies use to filter results.

The consequence: **we do not write a backend.** The "backend" of Cairn is the schema, the policies, and a handful of views. Adding a new feature usually means adding a column or a policy, not a route handler.

Trade-offs we accept:

- The API shape is dictated by the schema. We can shape it with views and functions, but we don't have arbitrary control.
- Some operations that would be a single backend endpoint become two round trips from the client.
- PostgREST is less flexible than a hand-written API for unusual workflows.

For Cairn's CRUD-and-vote model, these trade-offs are favorable. If a feature ever genuinely needs a custom endpoint, we can add a tiny service alongside PostgREST without disturbing the rest.

### Image processing: the avatar sidecar

One feature does need a custom endpoint: profile pictures. The bytes shouldn't live in the database (every `select * from profiles` would transfer them), an S3-style blob store violates the no-hyperscalers stance and adds more moving parts than it saves, and `plpython3u` image decoding inside Postgres is the wrong place to handle untrusted bytes. So Cairn ships a **tiny sidecar HTTP service** that does exactly three things: receive a multipart upload, validate + resize it to 256×256 WebP, write the file to `/srv/cairn/avatars/{uid}.webp` (atomic rename), and call `bump_avatar_version()` on PostgREST. The bytes are served directly by Caddy as static files with long cache headers; the database holds only an `int` cache-buster (`profiles.avatar_version`).

The sidecar is single-purpose, stateless, and small enough to write in any language (Go, Python, or Node — the open question is the team's preference, not the architecture). It runs as a normal container in the same `docker-compose.yml`, with read-write access to the avatar directory; Caddy's container mounts the same directory read-only. The shape is well-trodden (GitLab, Mastodon, every self-hosted forum since 2003). See `docs/avatars.md` for the schema delta, the RPCs, the file lifecycle, and the orphan-sweep cron.

### Authentication: GoTrue + email magic links

GoTrue is the auth service originally built for Supabase, runnable standalone. It handles signup, login, password reset, and JWT issuance. We configure it for **email magic links only**: the user enters their email, receives a one-time login link, clicks it, and the app receives a signed JWT. No passwords are ever stored or transmitted by us.

Magic links were chosen over alternatives because:

- They avoid storing a password hash, which removes a class of breach risk.
- They avoid "Sign in with Google/Apple/Facebook," which conflicts with the privacy stance.
- They're familiar to users and don't require any extra app on the user's phone.
- They work identically in every browser.

The cost: users need access to their email to log in on a new device. For a low-frequency app like Cairn, this is acceptable. The session cookie is long-lived enough on a known browser that this is a once-per-device event.

For sending the magic-link emails in production, we use a transactional email provider — likely [Postmark](https://postmarkapp.com/) or an EU equivalent. In local development, [Mailpit](https://github.com/axllent/mailpit) catches outgoing mail in a fake inbox.

### JWT storage: HttpOnly cookie via a Caddy shim

The JWT GoTrue issues at the end of a successful magic-link flow has to live somewhere on the user's device. The two real options are `localStorage` (JavaScript-readable) and an `HttpOnly` cookie (not JavaScript-readable, automatically attached to every same-origin request by the browser). The cookie is dramatically safer: a bug in our own code or a compromised dependency that lets an attacker run JavaScript in the page can read `localStorage` and exfiltrate the token, but cannot read or send an `HttpOnly` cookie.

GoTrue itself returns the JWT in a JSON body, not as a cookie. We close that gap with a small piece of Caddy configuration on the auth path:

- The browser hits `cairn.<domain>/auth/...` to perform a login or token-exchange flow.
- Caddy proxies the request to GoTrue, gets back the JSON response containing the access token.
- A short response handler in Caddy reads the token out of the response body and re-emits it as a `Set-Cookie: cairn_session=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/` header before forwarding the (now-token-stripped) body to the browser.
- For all subsequent API calls, Caddy reads the cookie on the way _in_, attaches it as `Authorization: Bearer <jwt>` to the proxied request, and PostgREST sees the same shape it always does.

The cookie is the source of truth for "am I signed in" after the magic-link round trip — every subsequent fetch authenticates implicitly via the cookie. Logout is a single `DELETE /auth/session` that clears the cookie. The web app's JavaScript briefly reads the access and refresh tokens from `window.location.hash` during the callback page's mount (see the _Security trade-off_ note below), but holds nothing thereafter.

#### Security trade-off: the callback page reads tokens from the URL hash

GoTrue's `/verify` endpoint (which validates the email-clicked token) sets the session cookie on its own origin, not on `cairn.<domain>`. To get `cairn_session` planted on the right origin, the standard Supabase magic-link flow has GoTrue redirect after `/verify` with the access and refresh tokens in the URL hash fragment of `/auth/callback`; the callback page exchanges the refresh token through the proxy (which plants the cookie on the way back) and immediately `history.replaceState`s the hash away. For the few hundred milliseconds the callback page is mounted, `window.location.hash` holds JS-readable tokens.

The residual risk is XSS-on-the-callback-page during that window: an attacker with JS execution on the callback page specifically could read the hash before `replaceState` runs. The trade is accepted because:

- Any XSS in the app's broader surface area already permits authenticated session abuse via the cookie — the attacker can't take the cookie home but can issue arbitrary requests as long as they have JS execution. Eliminating the hash exposure removes only the _exfiltration_ class of attack, not the broader XSS-driven session-abuse class.
- Every public Supabase example (`@supabase/supabase-js`, every tutorial, every starter kit) uses this exact flow. Keeping a stronger cookie-only contract would require bespoke email-template plumbing that exceeds the security delta's value for Cairn's data-sensitivity tier (a collaborative ranked-lists app, not payments or healthcare).
- The alternative — having GoTrue's email template hand-roll a link directly at `${SITE_URL}/auth/callback?token=…&type=magiclink` so the page can verify server-side without ever touching the token in JS — was the first design attempt. Empirically, `supabase/gotrue:v2.158.1`'s `/magiclink` endpoint does not honour `MAILER_URLPATHS_MAGICLINK` regardless of body shape, so steering the link required custom `MAILER_TEMPLATES_*` plumbing that exceeded the security delta's value. See _Considered and rejected_ below.

A future stronger contract (no JS exposure at all) remains tractable if a new requirement justifies it. The current relaxation is a deliberate choice, not a deferred problem.

Both halves of this shim must be **narrowed**, not blanket. On the way _in_, Caddy attaches `Authorization: Bearer <jwt>` only to the authenticated GoTrue endpoints (today: `/auth/user`). The anonymous-callable endpoints (`/auth/magiclink`, `/auth/verify`, `/auth/token`) must **not** receive a bearer — they accept anonymous callers, and forwarding a signed-in user's JWT to a magic-link request hands a private credential to an endpoint that didn't need it. On the way _out_, the JSON-sniffing cookie-plant must fire only on the deliberate-login endpoints (`/auth/verify`, `/auth/token`); a 2xx response from `/auth/signup` (or a future endpoint that also returns `access_token`, like refresh-token rotation or OAuth callbacks) must **not** plant a session cookie unless explicitly added to the allowed set. In Step 3's flow, the _active_ cookie-plant path is `/auth/token` (the refresh-token exchange the callback page issues after reading the URL hash); `/auth/verify` stays in the allowed set as defence-in-depth so a future flow that needs server-side token verification can use it without re-widening the narrow. The dev-side Vite proxy already enforces both narrowings via the shared `web/src/lib/shared/model/auth-paths.ts` helper; the Caddy production analogue must match, and adding a new GoTrue endpoint to either narrow is a deliberate edit, not an implicit consequence of a 2xx response shape.

Caddy is the right home for this shim because the proxy is already where the trust boundary sits, and the rule is short enough to live in the Caddyfile alongside the routing — an in-Caddy Go module is the long-term convergence target. The interim prototype, however, *does* run a small Node `auth-proxy` sidecar for the response-side half of the shim (the cookie-plant + token-strip): it lets us reuse the already-tested dev-proxy logic verbatim and keep zero drift from the canonical narrowing lists in `web/src/lib/shared/model/auth-paths.ts` (a copy of that file is guarded deep-equal against the original in the sidecar's tests). The stock cookie→bearer direction stays in the Caddyfile; only the JSON-sniffing response handler lives in the sidecar. See `deployment.md` for the concrete configuration.

### Reverse proxy: Caddy

Caddy sits in front of every backend service. Its job is to:

- Terminate TLS, with certificates obtained automatically from Let's Encrypt.
- Route by path on the single `cairn.<domain>` origin: `/` to the web bundle, `/api/*` to PostgREST, `/auth/*` to GoTrue.
- Implement the cookie/JWT shim described above.
- Set baseline security headers (HSTS, content-type sniffing off, referrer policy).

Caddy was chosen over nginx because its zero-config TLS is genuinely zero-config, the Caddyfile syntax is dramatically simpler than nginx for this use case, and the response-handler/cookie shim is expressible in a few lines instead of a Lua module.

CORS is not configured because there are no cross-origin requests — the web app, the API, and the auth service all live on `cairn.<domain>`.

### Web app: SvelteKit, compiled static, served as a PWA

A single SvelteKit project, built with the static adapter, produces a folder of HTML/JS/CSS files. That folder is what the `web` container serves (with a tiny nginx or `caddy file_server`).

SvelteKit was chosen over Next.js (React) and SolidStart for the combination of:

- **Lean output.** The bundle is small. First load on a phone over cellular is fast.
- **Excellent developer experience.** File-system routing, built-in stores, very little ceremony.
- **No server required.** SvelteKit can do server-side rendering when we want it, but we don't — the app lives behind login, there's nothing to SEO, and the static-site mode is genuinely static. The `web` container is a glorified file server.

It was chosen over Flutter Web because Flutter Web ships a large runtime, renders to canvas (which has accessibility tradeoffs), and would not feel like a web page even when running in a browser. For a list-shaped app, a real web framework is the right tool.

It was chosen over a Flutter mobile app + native shells because the App Store / Play Store path conflicts with goal #5: distribute by URL. The cost of getting Cairn onto a friend's phone via a store — Apple developer account ($99/year), review queue, signing keys, separate build pipelines — defeats the whole intent. The PWA gets the app onto any device by visiting a URL.

### PWA: install, offline, and chrome

A web app becomes a PWA by adding two things:

- A **manifest** (`/manifest.webmanifest`) that declares the app's name, icon, theme color, and start URL. Browsers read this when offering "Install app" or "Add to Home Screen."
- A **service worker** that intercepts network requests and decides whether to serve them from a cache. This is what gives a PWA its app-like behaviour: instant launch (the app shell is cached), and graceful behaviour when the network is unreachable.

Cairn's service worker uses two cache strategies:

- **App shell:** cache-first. The HTML, JS, CSS, fonts, and icon files are cached on first install and served from the cache forever, with background updates checked on each launch. The app launches instantly even with no network.
- **API GET responses:** stale-while-revalidate, scoped to the lists overview and the most-recently-viewed list's items. When the user opens Cairn offline, they see their lists and the items from the last list they looked at. Tapping into a list they haven't opened recently shows a clean _"No connection"_ state, not stale data and not a crash.

API writes (vote, edit, add item, delete) are not queued offline in v1. The relevant control disables itself when offline; the user sees that nothing happens because there's no network. Full offline-first edit-and-sync is a possible future direction (see "Considered and rejected").

#### PWA on iOS

Worth flagging the rough edges, since one of Cairn's stated goals is to be friction-free for iOS users:

- **Install path.** No "Install app" banner. Users tap the Safari share icon and choose _Add to Home Screen_. The first-launch UI links to a one-paragraph explainer with a screenshot for users who haven't done this before.
- **Storage durability.** WebKit may evict a PWA's IndexedDB and cache after ~7 days of non-use. Cairn is server-backed, so this is a "re-sync on next open" annoyance, not data loss.
- **No biometric auth API.** The cookie session is what keeps users logged in; the cookie expiry is set generously enough that re-auth is rare on a known device.
- **No background sync.** A change to a list while the app is closed is only seen when the user re-opens it. This is consistent with "no push" anyway.

These are not blockers — they're the cost of staying off the App Store, which we accept. They do shape what we promise users, so they're documented here rather than discovered later.

### Backups: Restic to Hetzner Storage Box

Restic is a well-regarded backup tool: deduplicating, encrypted, incremental. A nightly cron job dumps the Postgres database, encrypts the dump with Restic, and pushes it to a Hetzner Storage Box (a separate cheap product, ~€4/month for 1 TB). The Storage Box lives in a different Hetzner data center, so it survives the loss of the VPS.

Encryption keys are not stored on the VPS — they are kept by the operator (us) and entered manually at restore time. This means a compromise of the VPS does not give the attacker our backups.

Backup retention: 7 daily, 4 weekly, 12 monthly snapshots, pruned automatically by Restic.

## Request flow

A typical "show me my lists" request, from a logged-in user with the session cookie:

1. The browser sends `GET https://cairn.<domain>/api/lists`. The browser automatically attaches `Cookie: cairn_session=...`.
2. Caddy terminates TLS. The path matches the `/api/*` route.
3. Caddy reads the `cairn_session` cookie and rewrites the request as `GET /lists` to PostgREST with `Authorization: Bearer <jwt>`.
4. PostgREST verifies the JWT signature and runs `SET LOCAL request.jwt.claims = '<jwt-claims-json>'` on the Postgres connection (the JSON-object GUC, set per-request, contains every claim including `sub`). PostgREST v10 removed the per-claim `request.jwt.claim.<name>` GUCs; we run v12, so the JSON-object form is what `public.uid()` reads from.
5. Postgres executes `SELECT * FROM lists`. The row-level security policy on `lists` filters the result to only those where the user is a member.
6. PostgREST serializes the result as JSON, Caddy passes it back, the SvelteKit app renders it.

A login request:

1. User enters email in the web app.
2. App sends `POST https://cairn.<domain>/auth/magiclink?redirect_to=${encodeURIComponent(origin + '/auth/callback')}` with body `{email}`. `redirect_to` rides in the query string because in `supabase/gotrue:v2.158.1` the JSON body's `redirect_to` field is silently dropped by Go's `encoding/json` (the `MagicLinkParams` struct has no `RedirectTo` field; GoTrue reads `redirect_to` only from the header, query string, or form-encoded body). (`/auth/otp` is a GoTrue alias for the same handler; we standardise on `/auth/magiclink` because that is the name the public Supabase SDK and tutorials use.)
3. GoTrue generates a one-time token and emails a link of the shape `https://cairn.<domain>/auth/verify?token=…&type=magiclink&redirect_to=…/auth/callback`.
4. User taps the link, which opens GoTrue's `/auth/verify` endpoint (in production, fronted by Caddy; in dev, directly on `localhost:9999`). GoTrue validates the token.
5. GoTrue issues a 302 to `https://cairn.<domain>/auth/callback#access_token=…&refresh_token=…&type=magiclink` — the tokens travel in the URL hash fragment, which the browser does not include in the redirect request to the new URL.
6. The browser lands on `/auth/callback`. The SvelteKit page captures `window.location.hash`, immediately calls `history.replaceState` to strip it from the URL, then POSTs `https://cairn.<domain>/auth/token?grant_type=refresh_token` with `{refresh_token}` through Caddy to GoTrue. GoTrue returns a fresh access token + user payload in JSON.
7. The `auth-proxy` sidecar (Caddy routes `/auth/*` to it) extracts the new access token from the JSON body, sets it as the `cairn_session` HttpOnly cookie, and **strips `access_token` and `refresh_token` from the body** before forwarding it to the browser (matching the "now-token-stripped body" contract pinned in the "JWT storage" section above). The callback page sees a 2xx with the `user` payload — no token fields — and calls SvelteKit's `goto('/', { replaceState: true })` to land the user in the app, signed in.
8. Every subsequent request is authenticated via the cookie. JavaScript holds nothing — the brief in-callback exposure is bounded by step 6's `replaceState` (see _Security trade-off_ under "JWT storage" above).

## Local development parity

The same `docker-compose.yml` runs on a developer's laptop, with these changes:

- **Caddy runs in the dev compose for avatar static serving** (host port 8080); all other backend services are reached directly on `localhost` ports. TLS is meaningless on loopback.
- **The web app is run via `pnpm dev`**, not from the production static bundle, so HMR works. The dev server proxies `/api` and `/auth` to the local backend ports.
- **Mailpit replaces the production SMTP provider**, catching magic-link emails in a local web UI.
- **The cookie shim is approximated** in the SvelteKit dev server's proxy config — the dev experience matches production closely enough to debug auth flows without surprises.

Postgres, PostgREST, and GoTrue are bit-identical to production. The schema, policies, and seed data are managed by migration files committed to the repo, so a fresh checkout reproduces the exact production state.

This is covered in detail in `development.md`.

## Client-side storage and the consent question

Cairn stores a small, fixed inventory of things on the user's device. Each one is **strictly necessary for the service the user explicitly requested**, which is the exemption that excuses us from the cookie-banner requirement under **ePrivacy Directive Art. 5(3)** (Germany: **TDDDG §25**, formerly TTDSG). What's there, why each entry qualifies, and the rule before adding new ones:

| What                                                    | Where                                                                                                                                                                                  | Set by                                                                                                       | Why it's strictly necessary                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cairn_session` cookie                                  | `HttpOnly`, `Secure` (production only — dev uses HTTP localhost, see `development.md`), `SameSite=Lax`, `Path=/`, ~7-day Max-Age (raised to ~30-day when refresh-token rotation lands) | Caddy in production / the Vite dev proxy locally on successful magic-link callback (see "JWT storage" above) | The auth JWT. Without it the user is signed out; the service literally cannot be delivered. EDPB Guidelines 2/2023 treat auth/session cookies as the canonical "strictly necessary" example.                                                                                                |
| `cairn.theme` (`'system' \| 'light' \| 'dark'`)         | `localStorage`                                                                                                                                                                         | The Appearance section of Settings, when the user changes it                                                 | A functional preference the user _themselves_ sets. Both EDPB guidelines and German TDDDG treat user-set preferences as exempt. Art. 5(3) covers _any_ storage on terminal equipment — `localStorage` falls under it the same way cookies do; the medium doesn't change the legal analysis. |
| `cairn.font_size` (`'xs' \| 's' \| 'm' \| 'l' \| 'xl'`) | `localStorage`                                                                                                                                                                         | Same as theme                                                                                                | Same as theme.                                                                                                                                                                                                                                                                              |
| App shell + recently-viewed list data                   | Service worker `Cache` (lands in step 11 / PWA)                                                                                                                                        | First load and stale-while-revalidate on visit                                                               | The app is a PWA. The cache is what makes it launch instantly and survive a flaky connection — i.e., what the user requested when they installed it. No personal-data collection; just a copy of bytes the server already sent the same user.                                               |

Note on the `cairn_session` cookie: during the magic-link callback, the JWT and refresh token also transit `window.location.hash` for the few hundred milliseconds before the page strips the hash and exchanges the refresh token through the proxy. That window is a JavaScript-visible store under Art. 5(3) the same way the cookie itself is — strictly necessary for the user-requested service (signing in) and excused from consent on the same grounds. See _Security trade-off_ in the "JWT storage" section above for the threat-model framing.

That's the entire client-side inventory. Specifically: **no analytics cookies, no third-party scripts, no fingerprinting, no advertising IDs, no telemetry, no IndexedDB** beyond what the service worker uses internally. The server-side side of this picture is in `logging.md`.

### The rule before adding anything new

Each new client-side store must qualify under one of two narrow gates:

1. **Strictly necessary for the user-requested service.** The store is required for the app to function for the user who deliberately opened it. Examples that would clearly qualify: a CSRF token, a draft-recovery cache that survives an accidental tab close, a per-list scroll position that survives back-navigation.
2. **A functional preference the user themselves sets.** A new toggle in Settings (Appearance / Privacy / etc.) that the user explicitly changes. If the user doesn't actively set it, it doesn't qualify — a thing that just appears because they opened the app is not a "preference set by the user."

Anything not covered by one of these — analytics (even self-hosted, even first-party, in most DPA opinions), A/B-test buckets, persistent identifiers for non-functional purposes, third-party embeds that drop their own cookies — requires a real consent UI before the storage happens, with refuse-as-easy-as-accept and granular categories. That is a meaningful engineering surface (deferred storage, consent persistence, a way to revisit the choice from Settings), not a banner-template drop-in. The simpler answer is to keep the inventory above tight.

### Why no banner is the right call

Cookie banners exist to obtain consent for storage that wouldn't otherwise be lawful. We don't have any such storage. A banner that says _"we use one auth cookie, OK?"_ is worse than nothing — it trains users to click through consent UI, it adds friction at the moment a first-time user decides whether to trust the app, and it implies (to a reader who knows the law) that we have something to hide.

The legal duty we _do_ owe the user is **disclosure**, not consent. The privacy policy (`design/cairn-legal-screens.jsx` → Privacy Policy; built as the canonical screen in step 12) enumerates the four entries above in plain language, and the docs above are the engineering-side source of truth for the same list.

If a future DPA opinion narrows the strictly-necessary exemption such that user-set `localStorage` preferences need consent, the response is a minimal one-screen consent UI gating only the `localStorage` writes — the auth cookie stays exempt under any plausible reading, and the SW cache is exempt as long as it's bytes the server already sent the same authenticated user.

## Considered and rejected

A short record of paths we deliberately did not take, and why. Useful for future-us when we wonder why the architecture looks the way it does.

**Firebase / Firestore.** Backend-as-a-service is the path of least resistance, but Firebase is owned by Google. Excluded on privacy grounds.

**Supabase (hosted).** Same software as our self-hosted PostgREST + GoTrue + Postgres setup, but their managed offering runs on AWS. Excluded on the no-hyperscalers constraint. The open-source software is what we actually use, just on Hetzner.

**Native iOS + Android apps via Flutter (or anything else).** Would give the best per-platform fit but conflicts with the "distribute by URL" goal. Apple's developer fee, the App Store review process, and the difficulty of sideloading on iOS mean a native app is _harder_, not easier, to put on a friend's phone than a web link. The PWA route gets us 90% of the user experience without any of that friction.

**Flutter Web.** Considered as a way to keep one codebase across web and a possible later native app. Rejected because Flutter Web ships a large runtime, renders to canvas (with accessibility caveats), and produces a noticeably non-native-feeling web experience. Building directly with a real web framework is leaner.

**Push notifications via Web Push (or anything else).** Web Push works on Android always and on iOS for installed PWAs. Rejected on privacy grounds: even self-hosted Web Push relies on browser vendor push services (Mozilla, Apple, Google) as the delivery layer, which we don't trust. The decision is deliberate, not deferred. Cairn syncs when opened.

**JWT in `localStorage`.** Simpler. Vulnerable to XSS exfiltration. Rejected — see "JWT storage" above.

**Direct-to-callback magic-link email template.** The first attempt at Cairn's magic-link flow tried to steer GoTrue's email so the `<a href>` pointed directly at `${SITE_URL}/auth/callback?token=…&type=magiclink` — bypassing GoTrue's own `/verify` 302 and the hash-fragment redirect, and keeping the access/refresh tokens out of JavaScript entirely. The plan was to set `GOTRUE_MAILER_URLPATHS_MAGICLINK=/auth/callback` and rely on GoTrue's documented template behaviour. Empirically, `supabase/gotrue:v2.158.1`'s `/magiclink` endpoint does not honour that env var: the email's link routes through GoTrue's own `/verify` regardless of body shape or `redirect_to` value, with the access/refresh tokens delivered to the callback via URL hash fragment. The remaining path to the original design — a custom HTML template via `GOTRUE_MAILER_TEMPLATES_MAGICLINK` with the link hand-rolled to use `{{ .TokenHash }}` — buys the elimination of a few hundred milliseconds of JS-visible token exposure at the cost of template plumbing that breaks on every GoTrue mailer-template variable rename. Rejected in favour of the standard hash-fragment flow `@supabase/supabase-js` uses, with the trade-off documented under "JWT storage" above. Revisit if Cairn ever enters a data-sensitivity tier (payments, healthcare) where the residual exfiltration window becomes load-bearing.

**Multiple subdomains for API and auth.** The earlier draft used `cairn-api.<domain>` and `cairn-auth.<domain>`. Rejected for the simpler single-origin layout: less DNS, no CORS, and the cookie shim becomes trivial because everything is same-origin.

**CRDT on object storage (Automerge or Yjs + S3-compatible storage).** A more purist version of Cairn that would have no central API at all — just blob storage and client-side merging. Genuinely appealing for offline-first behaviour and minimal server cost. Rejected for v1 because it's substantially more engineering for a benefit (offline editing) that isn't a core requirement of a list-sharing app. The architecture remains compatible with adding an offline cache layer later if needed.

**Self-host Sign in with Google / Apple.** Users like the convenience. Rejected because tying every login to a Google or Apple identity defeats the privacy stance and creates an external dependency for something we can do ourselves with magic links.

**Kubernetes / Nomad / any orchestrator.** Over-engineering for a single VPS hosting a single app. Docker Compose is exactly the right size of tool.

**Tailwind / utility-class CSS frameworks.** The 13-token CSS-variable table (`design/cairn-ui.jsx:3-33`) is small enough not to need one, and plain scoped `<style>` blocks consuming `var(--…)` keep the production bundle minimal — no purge-step config to maintain, no Tailwind runtime to ship. Rejected as more machinery than the styling surface warrants; if the design system ever outgrows hand-written CSS, revisit then.

## Open questions and future work

These are not v1 problems but are worth flagging:

- **Multi-device session management.** A user with several browsers / devices currently has independent session cookies. Revoking a session from a lost device is not yet designed.
- **Soft-delete garbage collection.** v1 ships a per-list trash and a per-user list trash (see `ui.md`); deletions are recoverable forever and never hard-delete from the UI. At Cairn's scale that's free, but a server-side job to permanently remove items soft-deleted longer than N days is worth keeping in mind.
- **Export.** Users should be able to export their data. Postgres makes this trivial server-side; the UX needs designing.
- **Multi-tenancy of the VPS.** The host is intended as personal infrastructure that may run other small apps over time. The container layout should keep services namespaced cleanly so a future app doesn't accidentally collide with Cairn.
- **Offline-first edits.** Currently we cache reads only. Queueing offline edits and reconciling on reconnect is a substantial feature with substantial complexity (conflict policy, undo of failed sync, etc.); worth a real design pass when it matters.
