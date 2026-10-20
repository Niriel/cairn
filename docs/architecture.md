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
│  — planned, not yet in place (master-plan step 21)          │
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

### Authentication: GoTrue + username and password

GoTrue is the auth service originally built for Supabase, runnable standalone. It handles signup, login, password reset, and JWT issuance. The user signs in with a **username and password**. The username is Cairn's public identity — shown as `@username` next to a display name and avatar — but it is **not** what GoTrue keys on. GoTrue's login identifier is a **stable, uid-derived address** `<uid>@cairn.internal` (where `uid` is the account's `auth.users.id`, equal to `profiles.id`), set **once at account creation and never rewritten** on rename. The `.internal` TLD is non-resolvable — never deliverable, never usable as an add-key, never shown to anyone.

The username becomes a credential at the **BFF**, not in the address: on every sign-in the `auth-proxy` resolves the typed username to a user id via the `lower(username)` unique index, then authenticates the GoTrue password grant against that account's `<uid>@cairn.internal`. A rename touches only `profiles.username`; it never changes the login identifier, so the credential can never break on a rename and there is no synthetic address to keep in sync. GoTrue never sees a real e-mail as the login identifier.

E-mail is demoted to an **optional recovery address**. It is stored separately in `user_settings.recovery_email` (private, owner-only), is never required to use Cairn, and is never displayed. Its only job is recovering a lost password.

The trade we accept by keying on username + password:

- GoTrue **does store a password hash**. We take that risk knowingly in exchange for an identity the user can carry and a credential they control, with no forced e-mail address.
- A public username is a deliberate piece of social surface (it's how people add each other), unlike an e-mail, which must stay private. Keeping the two separate is the point — see _Considered and rejected_ below.
- We still avoid "Sign in with Google/Apple/Facebook," which conflicts with the privacy stance.
- The flow works identically in every browser and needs no extra app on the user's phone.

The cost: a user who sets no recovery e-mail and forgets their password has no self-serve way back in. That is by design at this scale; an operator-assisted reset is a later `admin`-schema concern, deliberately deferred (see _Considered and rejected_).

E-mail still has a production role as **recovery and verification mail** (password reset, recovery-address confirmation). For sending that mail in production we use a transactional e-mail provider — likely [Postmark](https://postmarkapp.com/) or an EU equivalent. In local development, [Mailpit](https://github.com/axllent/mailpit) catches outgoing mail in a fake inbox.

#### Password recovery is Cairn-orchestrated, not GoTrue's `/recover`

Because the GoTrue login identifier is the non-deliverable `<uid>@cairn.internal`, GoTrue's built-in `/recover` endpoint cannot reach the user — it would mail the internal address, which is never deliverable. So Cairn owns the whole recovery flow at the BFF, and GoTrue's own recovery surface goes unused.

Setting a recovery address is a **send-then-confirm** flow: a signed-in user submits a candidate address, the BFF mails a 6-digit code to it, and only a correct code activates the address in `user_settings.recovery_email`. A pending (unconfirmed) address is never stored there — it lives in a recovery-token record until confirmed — so `recovery_email IS NOT NULL` means exactly "has a proven, usable recovery address." Direct PostgREST writes to `recovery_email` are blocked (the column-level `UPDATE` grant; see `docs/data-model.md`); only the confirm RPC, running as owner, writes it.

A signed-out reset is requested by **username** (never by a supplied address): the BFF resolves the username to the account, mails a 6-digit reset code **only to that account's on-file `recovery_email`**, and the browser receives a constant response regardless of whether the account or a recovery address exists (the anti-enumeration discipline of `plans/0302_signin_anti_enumeration`). Completing the reset sets the password through a **token-gated `SECURITY DEFINER` database function that writes `auth.users.encrypted_password` via pgcrypto** (`crypt(p_new_password, gen_salt('bf'))`) — the same house pattern as `adopt_stable_identity` — so the BFF holds **no GoTrue admin/service-role key**. The reset mints no session; the user signs in normally afterwards.

This gives the BFF two new capabilities it did not have: **SMTP** (the same configuration GoTrue uses — Mailpit in dev, the configured provider in prod), and a **scoped, low-privilege database role** that the two reset RPCs (the username→address lookup that mints the token, and the password-set) are granted to — neither `anon` nor `authenticated` can call them. That keeps the private recovery address off the anonymously-reachable PostgREST surface and the password write off the public surface. The verify-flow RPCs, by contrast, run under the user's own session and are granted to `authenticated`.

### JWT storage: a revocable, rotating session behind a cookie-shaping BFF

The tokens GoTrue issues at the end of a successful sign-in have to live somewhere on the user's device. The two real options are `localStorage` (JavaScript-readable) and `HttpOnly` cookies (not JavaScript-readable, automatically attached to every same-origin request by the browser). Cookies are dramatically safer: a bug in our own code or a compromised dependency that lets an attacker run JavaScript in the page can read `localStorage` and exfiltrate a token, but cannot read or send an `HttpOnly` cookie.

We store the session in **two** `HttpOnly` cookies, both planted and read by a small Cairn-shaped **BFF** (the `auth-proxy` sidecar) that owns the GoTrue translation:

- **The durable cookie** (`__Host-cairn_session` in production, `cairn_session` in dev) holds a **rotating, revocable refresh token** with a ~30-day _idle_ `Max-Age` — every use slides the horizon forward, so an active user stays signed in indefinitely while an abandoned session ages out. This cookie is the real session lifetime and the thing a sign-out revokes.
- **The access cookie** (`__Host-cairn_access` in production, `cairn_access` in dev) holds the BFF-minted **access JWT**, short-lived (single-digit minutes). This is the credential Caddy (prod) / the Vite proxy (dev) read on the way _in_ and attach as `Authorization: Bearer <jwt>` to `/api` calls — **not** the durable cookie, which GoTrue's API would reject as a refresh token.

GoTrue itself returns both tokens in a JSON body, not as cookies. The BFF closes that gap:

- On every session-establish (the username + password sign-in and registration exchanges, and `/auth/refresh`), the BFF reads the access token and refresh token out of GoTrue's JSON response and plants **both** cookies, stripping the tokens from the body before forwarding it to the browser.
- The access cookie expires before the durable one. When the access JWT goes stale, `/api` returns `401 jwt expired`; the web client silently `POST`s `/auth/refresh`, and the BFF exchanges the durable refresh token for a fresh access JWT, **rotating** the refresh token in the same step and re-planting both cookies. GoTrue's refresh-token **rotation with reuse detection** means each refresh issues a fresh token and invalidates its predecessor, and a replayed already-used token is **rejected** (`invalid_grant` / "Invalid Refresh Token: Already Used"). Note the limit, confirmed by spike against `supabase/gotrue:v2.158.1`: reuse detection is **detection-only** — rejecting the stale token does **not** automatically revoke the rest of the session family, so a stolen-and-replayed refresh token is refused but the legitimate session keeps working. Theft is therefore detectable, not self-healing; the kill-switch for a suspected compromise is **`POST /auth/signout?scope=global`** ("sign out everywhere"), which _does_ revoke all of the user's sessions server-side. True automatic theft→family-revoke would need a thin custom session table in the BFF; it is deliberately deferred (see `TODO.md` → "Auth & production infrastructure").
- Sign-out is a `POST /auth/signout` that revokes the refresh token **server-side** at GoTrue (not just a local cookie clear), and `POST /auth/signout?scope=global` ("sign out everywhere") revokes _all_ of the user's sessions — the kill-switch for a suspected compromise.

The durable cookie is the source of truth for "am I signed in"; the access cookie is a short-lived bearer derived from it. Both are hardened with the `__Host-` prefix in production (which forces `Secure`, `Path=/`, and no `Domain`, closing subdomain cookie-injection), and `SameSite=Lax`. On top of `SameSite`, every state-changing Cairn-shaped `/auth/*` request must carry an explicit CSRF header (`X-Cairn-Auth`) that a cross-origin attacker cannot set without a preflight the BFF won't grant. **The web app's JavaScript never holds a token:** credentials are POSTed to the BFF, which runs the GoTrue exchange server-side and plants both cookies before stripping the tokens from the response body. Nothing sensitive transits the URL or `window.location.hash`.

The response-side cookie-plant must be **narrowed**, not blanket. The JSON-sniffing cookie-plant fires only on the deliberate sign-in / registration endpoints (`/auth/signin`, `/auth/register`); a 2xx response from any other endpoint must **not** plant a session cookie unless it is explicitly added to the allowed set. The dev-side Vite proxy and the production `auth-proxy` BFF share the narrowing lists in `web/src/lib/shared/model/auth-paths.ts`, so both enforce the same set; adding a new GoTrue endpoint to the narrow is a deliberate edit, not an implicit consequence of a 2xx response shape.

Caddy is the right home for this shim because the proxy is already where the trust boundary sits, and the rule is short enough to live in the Caddyfile alongside the routing — an in-Caddy Go module is the long-term convergence target. The interim prototype, however, _does_ run a small Node `auth-proxy` sidecar for the response-side half of the shim (the cookie-plant + token-strip): it lets us reuse the already-tested dev-proxy logic verbatim and keep zero drift from the canonical narrowing lists in `web/src/lib/shared/model/auth-paths.ts` (a copy of that file is guarded deep-equal against the original in the sidecar's tests). The stock cookie→bearer direction stays in the Caddyfile; only the JSON-sniffing response handler lives in the sidecar. See `deployment.md` for the concrete configuration.

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

> **Not yet in place.** Planned as master-plan step 21 (`plans/2100_backups/`); no off-site backups exist today, and the privacy policy says so (see `legal.md` → claims table). The design below is the plan, not a description of the live box.

Restic is a well-regarded backup tool: deduplicating, encrypted, incremental. A nightly cron job dumps the Postgres database, encrypts the dump with Restic, and pushes it to a Hetzner Storage Box (a separate cheap product, ~€4/month for 1 TB). The Storage Box lives in a different Hetzner data center, so it survives the loss of the VPS.

Encryption keys are not stored on the VPS — they are kept by the operator (us) and entered manually at restore time. This means a compromise of the VPS does not give the attacker our backups.

Backup retention: 7 daily, 4 weekly, 12 monthly snapshots, pruned automatically by Restic.

## Request flow

A typical "show me my lists" request, from a logged-in user with the session cookie:

1. The browser sends `GET https://cairn.<domain>/api/lists`. The browser automatically attaches both session cookies, including `Cookie: cairn_access=...`.
2. Caddy terminates TLS. The path matches the `/api/*` route.
3. Caddy reads the short-lived `cairn_access` cookie (the access JWT — _not_ the durable `cairn_session` refresh-token cookie) and rewrites the request as `GET /lists` to PostgREST with `Authorization: Bearer <jwt>`. If the access JWT has expired, PostgREST answers `401 jwt expired` and the web client silently refreshes (see "JWT storage" above) before retrying.
4. PostgREST verifies the JWT signature and runs `SET LOCAL request.jwt.claims = '<jwt-claims-json>'` on the Postgres connection (the JSON-object GUC, set per-request, contains every claim including `sub`). PostgREST v10 removed the per-claim `request.jwt.claim.<name>` GUCs; we run v12, so the JSON-object form is what `public.uid()` reads from.
5. Postgres executes `SELECT * FROM lists`. The row-level security policy on `lists` filters the result to only those where the user is a member.
6. PostgREST serializes the result as JSON, Caddy passes it back, the SvelteKit app renders it.

A signed-out reader of a public list follows the same `/api/*` path with no cookie, so PostgREST runs as `anon`. `anon` has exactly one read-only RPC — `POST /api/rpc/public_list_view` with `{p_id}` — and no other table, view, or RPC access; everything else stays closed (see `data-model.md` → "Public read access"). This needs no Caddy, compose, or auth-proxy change: it's a database grant, and the cookieless request simply lands on the `anon` role PostgREST already uses.

A sign-in request:

1. User enters their **username** and **password** on the sign-in screen.
2. App sends `POST https://cairn.<domain>/auth/signin` with body `{username, password}` and the `X-Cairn-Auth` CSRF header. Caddy routes `/auth/*` to the `auth-proxy` BFF.
3. The BFF resolves the typed username to a user id via the `lower(username)` unique index, then runs GoTrue's password grant (`POST /token?grant_type=password`) **server-side** against that account's stable `<uid>@cairn.internal` identity. GoTrue verifies the password hash and returns a fresh access token + refresh token + user payload in JSON. (The public GoTrue password grant is not reachable directly — a direct `POST /auth/token?grant_type=password` is rejected `403`; `/auth/signin` is the only password-grant path, behind the CSRF gate and the per-IP / per-account rate limiter.)
4. The BFF extracts **both** tokens from the JSON body, plants the **dual cookie** — the rotating refresh token in the durable `cairn_session` cookie and the access JWT in the short-lived `cairn_access` cookie — and **strips `access_token` and `refresh_token` from the body** before forwarding it to the browser (matching the "now-token-stripped body" contract pinned in the "JWT storage" section above). The web app sees a 2xx with the `user` payload — no token fields — and navigates into the app, signed in.
5. Every subsequent request is authenticated via the access cookie; when its short-lived JWT expires, the client silently `POST`s `/auth/refresh` to mint a new one and rotate the refresh token. JavaScript never holds a token at any point.

Registration (`POST /auth/register`) follows the same shape: the BFF creates the account under a stable `<uid>@cairn.internal` identity, obtains the token set, and plants the dual cookie the same way.

## Local development parity

The same `docker-compose.yml` runs on a developer's laptop, with these changes:

- **Caddy runs in the dev compose for avatar static serving** (host port 8080); all other backend services are reached directly on `localhost` ports. TLS is meaningless on loopback.
- **The web app is run via `pnpm dev`**, not from the production static bundle, so HMR works. The dev server proxies `/api` and `/auth` to the local backend ports.
- **Mailpit replaces the production SMTP provider**, catching the BFF's recovery and password-reset e-mails in a local web UI.
- **The cookie shim is approximated** in the SvelteKit dev server's proxy config — the dev experience matches production closely enough to debug auth flows without surprises.

Postgres, PostgREST, and GoTrue are bit-identical to production. The schema, policies, and seed data are managed by migration files committed to the repo, so a fresh checkout reproduces the exact production state.

This is covered in detail in `development.md`.

## Client-side storage and the consent question

Cairn stores a small, fixed inventory of things on the user's device. Each one is **strictly necessary for the service the user explicitly requested**, which is the exemption that excuses us from the cookie-banner requirement under **ePrivacy Directive Art. 5(3)** (in the Netherlands, where Cairn's operator is established: **Telecommunicatiewet art. 11.7a**; see `legal.md` → "Jurisdiction"). What's there, why each entry qualifies, and the rule before adding new ones:

| What                                                    | Where                                                                                                                                                                                                                      | Set by                                                                                                                     | Why it's strictly necessary                                                                                                                                                                                                                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cairn_session` cookie (durable)                        | `HttpOnly`, `Secure` (production only — dev uses HTTP localhost, see `development.md`), `SameSite=Lax`, `Path=/`, ~30-day _idle_ Max-Age (slides forward on use; revocable server-side). `__Host-`-prefixed in production. | The auth-proxy BFF in production / the Vite dev proxy locally, on a session-establish or refresh (see "JWT storage" above) | The rotating refresh token. Without it the user is signed out; the service literally cannot be delivered. EDPB Guidelines 2/2023 treat auth/session cookies as the canonical "strictly necessary" example.                                                                      |
| `cairn_access` cookie (short-lived)                     | `HttpOnly`, `Secure` (production only), `SameSite=Lax`, `Path=/`, ~5-min Max-Age. `__Host-`-prefixed in production.                                                                                                        | Same as the durable cookie — planted alongside it                                                                          | The short-lived access JWT the proxy attaches as the `/api` bearer. Derived from the durable cookie on demand; strictly necessary for the same reason.                                                                                                                          |
| `cairn.theme` (`'system' \| 'light' \| 'dark'`)         | `localStorage`                                                                                                                                                                                                             | The Appearance section of Settings, when the user changes it                                                               | A functional preference the user _themselves_ sets. EDPB guidelines treat user-set preferences as exempt. Art. 5(3) covers _any_ storage on terminal equipment — `localStorage` falls under it the same way cookies do; the medium doesn't change the legal analysis.           |
| `cairn.font_size` (`'xs' \| 's' \| 'm' \| 'l' \| 'xl'`) | `localStorage`                                                                                                                                                                                                             | Same as theme                                                                                                              | Same as theme.                                                                                                                                                                                                                                                                  |
| `cairn.user` (`{id, username}`)                         | `localStorage`                                                                                                                                                                                                             | The session store — on sign-in / successful boot; cleared on sign-out and session revocation                               | Strictly necessary for the user-requested service: lets a signed-in user who cold-boots offline stay signed in and see cached content instead of being pinned on the boot screen. Both fields are non-private (`username` public, `id` the caller's own uid); no e-mail stored. |
| `cairn.install_hint_dismissed` (`'1'`)                  | `localStorage`                                                                                                                                                                                                             | Set when the user dismisses the first-launch install hint                                                                  | A functional preference the user _themselves_ sets: the user actively dismisses the hint and this flag suppresses it thereafter. Same exemption as the other user-set preferences above.                                                                                        |
| App shell + recently-viewed list data                   | Service worker `Cache` (lands in step 11 / PWA)                                                                                                                                                                            | First load and stale-while-revalidate on visit                                                                             | The app is a PWA. The cache is what makes it launch instantly and survive a flaky connection — i.e., what the user requested when they installed it. No personal-data collection; just a copy of bytes the server already sent the same user.                                   |

That's the entire client-side inventory. Specifically: **no analytics cookies, no third-party scripts, no fingerprinting, no advertising IDs, no telemetry, no IndexedDB** beyond what the service worker uses internally. The server-side side of this picture is in `logging.md`.

### The rule before adding anything new

Each new client-side store must qualify under one of two narrow gates:

1. **Strictly necessary for the user-requested service.** The store is required for the app to function for the user who deliberately opened it. Examples that would clearly qualify: a CSRF token, a draft-recovery cache that survives an accidental tab close, a per-list scroll position that survives back-navigation.
2. **A functional preference the user themselves sets.** A new toggle in Settings (Appearance / Privacy / etc.) that the user explicitly changes. If the user doesn't actively set it, it doesn't qualify — a thing that just appears because they opened the app is not a "preference set by the user."

Anything not covered by one of these — analytics (even self-hosted, even first-party, in most DPA opinions), A/B-test buckets, persistent identifiers for non-functional purposes, third-party embeds that drop their own cookies — requires a real consent UI before the storage happens, with refuse-as-easy-as-accept and granular categories. That is a meaningful engineering surface (deferred storage, consent persistence, a way to revisit the choice from Settings), not a banner-template drop-in. The simpler answer is to keep the inventory above tight.

### Why no banner is the right call

Cookie banners exist to obtain consent for storage that wouldn't otherwise be lawful. We don't have any such storage. A banner that says _"we use one auth cookie, OK?"_ is worse than nothing — it trains users to click through consent UI, it adds friction at the moment a first-time user decides whether to trust the app, and it implies (to a reader who knows the law) that we have something to hide.

The legal duty we _do_ owe the user is **disclosure**, not consent. The privacy policy (`/about/privacy`, built in step 14 from `design/cairn-legal-screens.jsx` → Privacy Policy) enumerates the entries above in plain language, and the docs above are the engineering-side source of truth for the same list.

If a future DPA opinion narrows the strictly-necessary exemption such that user-set `localStorage` preferences need consent, the response is a minimal one-screen consent UI gating only the `localStorage` writes — the auth cookie stays exempt under any plausible reading, and the SW cache is exempt as long as it's bytes the server already sent the same authenticated user.

## Considered and rejected

A short record of paths we deliberately did not take, and why. Useful for future-us when we wonder why the architecture looks the way it does.

**Firebase / Firestore.** Backend-as-a-service is the path of least resistance, but Firebase is owned by Google. Excluded on privacy grounds.

**Supabase (hosted).** Same software as our self-hosted PostgREST + GoTrue + Postgres setup, but their managed offering runs on AWS. Excluded on the no-hyperscalers constraint. The open-source software is what we actually use, just on Hetzner.

**Native iOS + Android apps via Flutter (or anything else).** Would give the best per-platform fit but conflicts with the "distribute by URL" goal. Apple's developer fee, the App Store review process, and the difficulty of sideloading on iOS mean a native app is _harder_, not easier, to put on a friend's phone than a web link. The PWA route gets us 90% of the user experience without any of that friction.

**Flutter Web.** Considered as a way to keep one codebase across web and a possible later native app. Rejected because Flutter Web ships a large runtime, renders to canvas (with accessibility caveats), and produces a noticeably non-native-feeling web experience. Building directly with a real web framework is leaner.

**Push notifications via Web Push (or anything else).** Web Push works on Android always and on iOS for installed PWAs. Rejected on privacy grounds: even self-hosted Web Push relies on browser vendor push services (Mozilla, Apple, Google) as the delivery layer, which we don't trust. The decision is deliberate, not deferred. Cairn syncs when opened.

**JWT in `localStorage`.** Simpler. Vulnerable to XSS exfiltration. Rejected — see "JWT storage" above.

**Multiple subdomains for API and auth.** Serving the API and auth on `cairn-api.<domain>` and `cairn-auth.<domain>` is rejected for the simpler single-origin layout: less DNS, no CORS, and the cookie shim becomes trivial because everything is same-origin.

**CRDT on object storage (Automerge or Yjs + S3-compatible storage).** A more purist version of Cairn that would have no central API at all — just blob storage and client-side merging. Genuinely appealing for offline-first behaviour and minimal server cost. Rejected for v1 because it's substantially more engineering for a benefit (offline editing) that isn't a core requirement of a list-sharing app. The architecture remains compatible with adding an offline cache layer later if needed.

**Self-host Sign in with Google / Apple.** Users like the convenience. Rejected because tying every login to a Google or Apple identity defeats the privacy stance and creates an external dependency for something we can do ourselves with username + password.

**Magic-link-only authentication.** Using an e-mail magic link as the sole sign-in path — with the e-mail address doubling as both the auth identifier and the public lookup key for adding people — is rejected because one address doing double duty is confusing and coercive: it forces every user to surface a private contact detail as their public handle, and makes "add by e-mail" the only social primitive. Splitting the two — a public **username** as identity, an optional private **recovery e-mail** — is cleaner: the handle is meant to be seen, the e-mail is meant to stay private, and nobody is forced to have an e-mail at all. Username works as a GoTrue credential via a **server-side username→id resolver at the BFF** over a **stable, uid-derived GoTrue identity** (`<uid>@cairn.internal`, set once at account creation): the `auth-proxy` resolves the typed username to a user id on each sign-in and runs the password grant against that account's stable address.

Encoding the username into a **synthetic deterministic e-mail** (`lower(username)@users.cairn.invalid`, computed by the client/RPC and rewritten by `set_username` on every rename) is the obvious alternative to a resolver, and is rejected. The resolver is not free, but it is cheaper where it counts: the BFF must map username → _something_ to authenticate regardless (the password grant needs a GoTrue identifier), so the resolver **is** the unavoidable work, and once it exists the address no longer has to encode the username. Decoupling the identity from the handle avoids two hazards the synthetic scheme carries: the **atomic-rewrite hazard** (a rename would have to rewrite `auth.users.email` in lockstep with `profiles.username`, so a rename could break the credential) and the **SQL↔client domain-drift guard** (the synthetic-domain constant would have to match byte-for-byte across the client, the RPC, and the migration). A stable identity set once at creation has neither: a rename touches only `profiles.username`, and there is no shared constant to drift. The one thing the resolver costs — the proxy has to understand "username → id" — is work the BFF does anyway, and recovery is a custom flow either way.

**Kubernetes / Nomad / any orchestrator.** Over-engineering for a single VPS hosting a single app. Docker Compose is exactly the right size of tool.

**Tailwind / utility-class CSS frameworks.** The 13-token CSS-variable table (`design/cairn-ui.jsx:3-33`) is small enough not to need one, and plain scoped `<style>` blocks consuming `var(--…)` keep the production bundle minimal — no purge-step config to maintain, no Tailwind runtime to ship. Rejected as more machinery than the styling surface warrants; if the design system ever outgrows hand-written CSS, revisit then.

## Open questions and future work

These are not v1 problems but are worth flagging:

- **Operator-assisted reset for accounts with no recovery e-mail.** _Deferred._ The self-serve recovery mechanism is now built (Cairn-orchestrated send-then-confirm + token-gated pgcrypto reset; see _Authentication_ above). Since e-mail is optional, a user who never proved a recovery address and then forgets their password still has no self-serve way back in — by design. An operator-assisted reset via an `admin`-schema RPC is the eventual fallback, deliberately deferred until someone actually locks themselves out rather than built speculatively now.
- **Multi-device session management.** A user with several browsers / devices currently has independent session cookies. Revoking a session from a lost device is not yet designed.
- **Soft-delete garbage collection.** v1 ships a per-list trash and a per-user list trash (see `ui.md`); deletions are recoverable forever and never hard-delete from the UI. At Cairn's scale that's free, but a server-side job to permanently remove items soft-deleted longer than N days is worth keeping in mind.
- **Export.** Users should be able to export their data. Postgres makes this trivial server-side; the UX needs designing.
- **Multi-tenancy of the VPS.** The host is intended as personal infrastructure that may run other small apps over time. The container layout should keep services namespaced cleanly so a future app doesn't accidentally collide with Cairn.
- **Offline-first edits.** Currently we cache reads only. Queueing offline edits and reconciling on reconnect is a substantial feature with substantial complexity (conflict policy, undo of failed sync, etc.); worth a real design pass when it matters.
