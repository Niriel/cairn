# Requirements: Production rollout (alpha scope)

Stand the current Cairn build (steps 1–9) up on the provisioned Hetzner
box at `https://cairn.lynnscape.eu` so people can use it as a live alpha.
This creates the production deployment artifacts that
step 15 of `plans/0000_implementation_order.md` calls for, but at reduced
scope: later-step features (account deletion, admin, data export, PWA, the
full legal surface) and operational hardening (backups) are explicitly
deferred. The `0000` step-15 checkbox stays
unticked until that remaining work lands.

## R1. Caddy fronts everything with automatic TLS on a single origin

A production Caddy config (`caddy/Caddyfile.prod`) serves
`cairn.lynnscape.eu` over HTTPS using a certificate obtained and renewed
automatically from Let's Encrypt (ACME) — no manually-installed cert. The
cert persists across container restarts (a `caddy_data` volume). Caddy is
the only public entry point: in the production composition no other
service publishes a host port. The base `docker-compose.yml` publishes
none, and the prod override adds only Caddy's `80`/`443` plus a
loopback-only `127.0.0.1:5432:5432` Postgres publish for migration (see
R8); Postgres, PostgREST, GoTrue, the web container, the avatar sidecar,
and the auth-proxy are reachable only on the internal Docker network. (A
prod override cannot _remove_ a port the base publishes — Compose
concatenates `ports` lists across files, so `ports: []` is a silent no-op;
the base must publish nothing rather than rely on the override to
unexpose.) Routing is path-based on the single origin (no CORS, no
extra subdomains): `/api/*` → PostgREST, the GoTrue auth endpoints →
auth-proxy, `GET /avatars/*.webp` → static files, `POST/DELETE /avatars*`
→ sidecar, and everything else (including the SvelteKit client routes
`/auth/login`, `/auth/check`, `/auth/callback`) → the web container.
Baseline security headers (HSTS, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer`) are set.

## R2. The cookie/JWT shim preserves the "no JWT in JS" contract in prod

In production the HttpOnly `cairn_session` cookie ↔ `Authorization:
Bearer` translation behaves identically to development. On the request
side, the bearer is attached from the cookie for `/api/*` always and for
GoTrue endpoints only on the narrow allow-list `BEARER_AUTH_PATHS`
(`/auth/user`); the anonymous endpoints (`/auth/magiclink`,
`/auth/verify`, `/auth/token`) never receive a bearer. On the response
side, only on `200` responses from `COOKIE_PLANT_PATHS` (`/auth/verify`,
`/auth/token`) is `access_token` lifted from the JSON body into a
`Set-Cookie: cairn_session=<jwt>; HttpOnly; Secure; SameSite=Lax;
Path=/; Max-Age=<expires_in>` header, with `access_token` and
`refresh_token` stripped from the forwarded body. `DELETE /auth/session`
clears the cookie and returns `204`. The browser's JavaScript never holds
the JWT beyond the documented callback-hash window. `Secure` is present
in production (HTTPS) and absent in dev (HTTP localhost).

## R3. The shim is implemented once, shared between dev and prod

The production shim reuses the exact logic and the single narrowing
source of truth `web/src/lib/shared/model/auth-paths.ts` that the dev
Vite proxy uses, so the two cannot silently diverge. Any copy of the
narrowing lists used by the production shim is guarded by a test that
fails if it drifts from the canonical file.

## R4. The web container ships no dev-login code or secrets

The production web image is the static SvelteKit bundle built in
production mode. The dev-login shortcut module (`DevShortcuts.svelte`)
and its transitive imports are absent from the prod bundle (the
`import.meta.env.DEV` dynamic-import gate folds to dead code), and no
`VITE_DEV_LOGIN_*` value is inlined. A grep of `web/build/_app/immutable/`
for `cairn-dev` and the seed emails (`alice@example.test`) returns
nothing. The build cannot pick up a developer's `web/.env`.

## R5. Production GoTrue is configured for the real origin and sender

GoTrue runs with `GOTRUE_SITE_URL=https://cairn.lynnscape.eu`,
`GOTRUE_URI_ALLOW_LIST=https://cairn.lynnscape.eu/auth/callback`,
`API_EXTERNAL_URL=https://cairn.lynnscape.eu/auth`, and
`GOTRUE_MAILER_AUTOCONFIRM=false`. SMTP is the Gandi mailbox
(`mail.gandi.net:587` STARTTLS, user/from `no-reply@lynnscape.eu`). The
signup posture is env-driven: the committed compose defaults to the safe
`GOTRUE_DISABLE_SIGNUP=true`, and only the on-box `.env.prod` may relax it
(the alpha sets it `false` for open signup).

## R6. The magic-link email is link-only and actually delivered

The production magic-link email uses Cairn's custom link-only template
(no six-digit OTP token) and is sent from `no-reply@lynnscape.eu` with
working SPF/DKIM. The template is fetched reliably at send time via an
origin that is up before any email is sent — i.e. the fetch does not
depend on the public TLS cert already being issued (use the internal
service URL `http://web/gotrue/templates/magic_link.html`). A received
email contains the sign-in link and no `\b\d{6}\b` code.

## R7. Production secrets live only on the box, with a committed template

The real `.env.prod` is created on the VPS and never committed. A
committed `.env.prod.example` enumerates every variable
(`POSTGRES_PASSWORD`, `AUTHENTICATOR_PASSWORD`, `GOTRUE_PASSWORD`,
`JWT_SECRET`, `DOMAIN`, `SMTP_*`, `DISABLE_SIGNUP`, optional
`MIGRATE_AUTH_USERS_TIMEOUT`) with generation guidance (`openssl rand
-hex 32`). `JWT_SECRET` is identical for GoTrue (signing) and PostgREST
(verifying). No `VITE_*` variables appear (build-time, dev-only).

## R8. Migrations apply cleanly against the production database

The existing `scripts/migrate.sh` applies `db/migrations/*.sql` against
the production Postgres using the production secret values, without
editing the script. This requires Postgres reachable on `localhost:5432`
from the host (a loopback-only `127.0.0.1:5432:5432` publish, not
internet-exposed), `psql` available on the host, and the `auth.users`
poll (migrations 0004+) satisfied within
`MIGRATE_AUTH_USERS_TIMEOUT`. The first user to sign up is genuinely the
first user (no production seed data).

## R9. A minimal imprint page exists and is reachable

The app serves a minimal imprint/contact page carrying the operator's
name, postal address, and a contact e-mail (the German DDG §5 minimum),
reachable by a discreet link (login-screen footer and/or Settings). It is
a stub, not the full step-14 legal hub. The fields hold real operator
details (not placeholders) before the URL is shown to anyone. User-facing
copy is British English.

## R10. The alpha deploy is reproducible and verified end-to-end

The deploy follows a documented sequence (clone → `.env.prod` →
`up -d --build` → migrate → smoke test). Before deploy, `./scripts/check.sh`
(extended to lint and test both Node sidecars — the new `auth-proxy` and the
existing avatar `sidecar`, which was previously unlinted — so a shim
regression or `auth-paths.ts` drift fails the gate) is green. The smoke test confirms: valid TLS cert; a real e-mail produces
a link-only magic link from `no-reply@lynnscape.eu`; clicking it lands the
user signed in; create a list, add an item, vote; upload an avatar; and a
two-account invite/circle flow works.

## Non-requirements (explicitly excluded)

- **Restic backups + Hetzner Storage Box** — no Storage Box purchased and
  no real data yet; a manual `pg_dump` around the alpha suffices. Deferred
  to the production-hardening phase.
- **Full legal/About surface (step 14)** — only the minimal R9 imprint
  stub ships now; Privacy/Terms/OSS-attribution/etc. are step 14.
- **Account deletion (10), admin (11), data export (12), PWA shell (13)** —
  unbuilt; the alpha ships without them.
- **Invite-only enforcement** — signup is deliberately open (R5) so real
  users can sign themselves up. The compose's `DISABLE_SIGNUP=true` default
  is only a fail-closed guard for a missing variable; an in-app invite-only
  posture is available as a future option, not a planned launch gate.
- **Custom Caddy Go module for the shim** — the architecture's long-term
  home for the shim; the auth-proxy sidecar is the deliberate interim
  (see PLAN Decisions).
- **Ticking step 15 in `0000`** — this is an alpha subset; the box
  stays unticked until the deferred production work lands.
