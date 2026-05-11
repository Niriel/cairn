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
│  │web │ │GoTrue│ │PostgREST│ │…       │                     │
│  └────┘ └──┬───┘ └────┬───┘                                 │
│           │           │                                     │
│           └─────┬─────┘                                     │
│                 ▼                                           │
│  ┌──────────────────┐                                       │
│  │   PostgreSQL     │  ← schema + row-level security        │
│  └──────────────────┘                                       │
│                                                             │
│  All five services run as containers via Docker Compose.    │
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

Postgres is the system of record for everything: users, lists, items, votes. Beyond storing data, Postgres is also where the *authorization logic* lives, via row-level security policies. This is a deliberate concentration: there is one place that knows who can see what, and it's the same place the data lives. Authorization can't be bypassed by a buggy API layer because the API layer doesn't enforce it — the database does.

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
- For all subsequent API calls, Caddy reads the cookie on the way *in*, attaches it as `Authorization: Bearer <jwt>` to the proxied request, and PostgREST sees the same shape it always does.

The web app never touches the JWT. It performs the magic-link round trip, after which it is implicitly authenticated for every fetch via the cookie. Logout is a single `DELETE /auth/session` that clears the cookie.

Caddy is the right home for this shim because the proxy is already where the trust boundary sits, and the rule is short enough to live in the Caddyfile alongside the routing. We do not introduce a separate Node service to handle auth. See `deployment.md` for the concrete configuration.

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
- **API GET responses:** stale-while-revalidate, scoped to the lists overview and the most-recently-viewed list's items. When the user opens Cairn offline, they see their lists and the items from the last list they looked at. Tapping into a list they haven't opened recently shows a clean *"No connection"* state, not stale data and not a crash.

API writes (vote, edit, add item, delete) are not queued offline in v1. The relevant control disables itself when offline; the user sees that nothing happens because there's no network. Full offline-first edit-and-sync is a possible future direction (see "Considered and rejected").

#### PWA on iOS

Worth flagging the rough edges, since one of Cairn's stated goals is to be friction-free for iOS users:

- **Install path.** No "Install app" banner. Users tap the Safari share icon and choose *Add to Home Screen*. The first-launch UI links to a one-paragraph explainer with a screenshot for users who haven't done this before.
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
2. App sends `POST https://cairn.<domain>/auth/magiclink` with the email.
3. GoTrue generates a token and emails it via the configured SMTP provider.
4. User taps the link, which opens `https://cairn.<domain>/auth/callback?token=...` in their browser.
5. Caddy proxies to GoTrue, which verifies the token and returns a JWT in JSON.
6. Caddy's response handler extracts the JWT, sets it as the `cairn_session` HttpOnly cookie, and serves a short HTML page that redirects into the app.
7. Every subsequent request is authenticated via the cookie. The web app's JavaScript never sees the token.

## Local development parity

The same `docker-compose.yml` runs on a developer's laptop, with these changes:

- **Caddy is omitted on the laptop**; backend services are reached directly on `localhost` ports. TLS is meaningless on loopback.
- **The web app is run via `pnpm dev`**, not from the production static bundle, so HMR works. The dev server proxies `/api` and `/auth` to the local backend ports.
- **Mailpit replaces the production SMTP provider**, catching magic-link emails in a local web UI.
- **The cookie shim is approximated** in the SvelteKit dev server's proxy config — the dev experience matches production closely enough to debug auth flows without surprises.

Postgres, PostgREST, and GoTrue are bit-identical to production. The schema, policies, and seed data are managed by migration files committed to the repo, so a fresh checkout reproduces the exact production state.

This is covered in detail in `development.md`.

## Considered and rejected

A short record of paths we deliberately did not take, and why. Useful for future-us when we wonder why the architecture looks the way it does.

**Firebase / Firestore.** Backend-as-a-service is the path of least resistance, but Firebase is owned by Google. Excluded on privacy grounds.

**Supabase (hosted).** Same software as our self-hosted PostgREST + GoTrue + Postgres setup, but their managed offering runs on AWS. Excluded on the no-hyperscalers constraint. The open-source software is what we actually use, just on Hetzner.

**Native iOS + Android apps via Flutter (or anything else).** Would give the best per-platform fit but conflicts with the "distribute by URL" goal. Apple's developer fee, the App Store review process, and the difficulty of sideloading on iOS mean a native app is *harder*, not easier, to put on a friend's phone than a web link. The PWA route gets us 90% of the user experience without any of that friction.

**Flutter Web.** Considered as a way to keep one codebase across web and a possible later native app. Rejected because Flutter Web ships a large runtime, renders to canvas (with accessibility caveats), and produces a noticeably non-native-feeling web experience. Building directly with a real web framework is leaner.

**Push notifications via Web Push (or anything else).** Web Push works on Android always and on iOS for installed PWAs. Rejected on privacy grounds: even self-hosted Web Push relies on browser vendor push services (Mozilla, Apple, Google) as the delivery layer, which we don't trust. The decision is deliberate, not deferred. Cairn syncs when opened.

**JWT in `localStorage`.** Simpler. Vulnerable to XSS exfiltration. Rejected — see "JWT storage" above.

**Multiple subdomains for API and auth.** The earlier draft used `cairn-api.<domain>` and `cairn-auth.<domain>`. Rejected for the simpler single-origin layout: less DNS, no CORS, and the cookie shim becomes trivial because everything is same-origin.

**CRDT on object storage (Automerge or Yjs + S3-compatible storage).** A more purist version of Cairn that would have no central API at all — just blob storage and client-side merging. Genuinely appealing for offline-first behaviour and minimal server cost. Rejected for v1 because it's substantially more engineering for a benefit (offline editing) that isn't a core requirement of a list-sharing app. The architecture remains compatible with adding an offline cache layer later if needed.

**Self-host Sign in with Google / Apple.** Users like the convenience. Rejected because tying every login to a Google or Apple identity defeats the privacy stance and creates an external dependency for something we can do ourselves with magic links.

**Kubernetes / Nomad / any orchestrator.** Over-engineering for a single VPS hosting a single app. Docker Compose is exactly the right size of tool.

## Open questions and future work

These are not v1 problems but are worth flagging:

- **Multi-device session management.** A user with several browsers / devices currently has independent session cookies. Revoking a session from a lost device is not yet designed.
- **Soft-delete garbage collection.** v1 ships a per-list trash and a per-user list trash (see `ui.md`); deletions are recoverable forever and never hard-delete from the UI. At Cairn's scale that's free, but a server-side job to permanently remove items soft-deleted longer than N days is worth keeping in mind.
- **Export.** Users should be able to export their data. Postgres makes this trivial server-side; the UX needs designing.
- **Multi-tenancy of the VPS.** The host is intended as personal infrastructure that may run other small apps over time. The container layout should keep services namespaced cleanly so a future app doesn't accidentally collide with Cairn.
- **Offline-first edits.** Currently we cache reads only. Queueing offline edits and reconciling on reconnect is a substantial feature with substantial complexity (conflict policy, undo of failed sync, etc.); worth a real design pass when it matters.
