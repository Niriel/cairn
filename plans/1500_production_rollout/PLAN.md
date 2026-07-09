# Plan: Production rollout (alpha scope)

Create the production deployment artifacts and stand the current Cairn
build up at `https://cairn.lynnscape.eu` so it can be shown to people now,
ahead of the remaining build steps. This is the first slice of step 15;
operational hardening and the steps 10–14 features are deliberately left
for later phases.

## Context

Cairn's build is at step 9 of `plans/0000_implementation_order.md`
(steps 1–9 merged). The user wants the alpha live now. The
infrastructure is already provisioned (this session's `deploy-prep` work,
since archived off-repo): a hardened Hetzner CX23 (Ubuntu 24.04, Docker),
`cairn.lynnscape.eu` resolving to it (A + AAAA), and a Gandi sender mailbox
`no-reply@lynnscape.eu` with SPF/DKIM auto-configured.

The dev stack (`docker-compose.yml`) is complete and runs Postgres,
PostgREST (`postgrest/postgrest:v12.2.3`), GoTrue (`supabase/gotrue:v2.158.1`),
the avatar sidecar (`sidecar/`, Node, `:3001`), a dev-only `static` nginx
(GoTrue template host) and `mailpit`, and Caddy (avatars only). Three
production files described in `docs/deployment.md` do **not** exist yet:
`web/Dockerfile`, `docker-compose.prod.yml`, `caddy/Caddyfile.prod`.

The hard part is the cookie/JWT shim (HttpOnly `cairn_session` ↔ `Bearer`,
`docs/architecture.md` "JWT storage"). It exists today only as dev logic
in `web/vite.config.ts` (a Connect proxy that buffers GoTrue responses,
JSON-parses, plants the cookie, strips tokens) keyed off
`web/src/lib/shared/model/auth-paths.ts`, and as **pseudocode** in
`docs/deployment.md`. No production implementation exists. Caddy cannot do
JSON-body mutation with stock directives, so the shim needs a real home.

## Decisions

**Cookie shim → Node auth-proxy sidecar (interim), not a Caddy module.**
Three options were weighed: (A) a custom Caddy Go module built via xcaddy
— matches `architecture.md`'s stated intent ("Caddy is the right home…
we do not introduce a separate Node service to handle auth") but is a
from-scratch reimplementation of buffering + JSON-rewrite + cookie-plant,
re-typing the narrowing lists (drift risk) into a custom Caddy image that
must track Caddy releases; (B) stock Caddy `handle_response` + a
replace-response plugin — rejected because stock/plugin Caddy cannot lift
a JSON field into a `Set-Cookie` and strip body fields reliably; (C) a
tiny Node auth-proxy sidecar between Caddy and GoTrue that reuses the
_exact_ tested dev logic and the shared `auth-paths.ts`. We pick **(C)**
for the alpha: lowest correctness risk, zero dev/prod drift by reusing
the single narrowing module, and it leans on a Node-sidecar pattern the
stack already runs in prod (the avatar `sidecar/`, which `architecture.md`
itself blesses). This _does_ deviate from the doc's "no separate Node
service for auth" line; the deviation is recorded explicitly in
`docs/architecture.md`/`deployment.md`, honours the contract the doc
actually cares about (JS never holds the JWT), and names option (A) as the
long-term convergence target once the behaviour is proven (R2, R3).

**Open signup, but env-driven and safe-by-default.** The user
chose open signup so a URL is all a guest needs (the production spec's
`DISABLE_SIGNUP=true` creates a chicken-and-egg: a brand-new person can't
self-bootstrap a magic link). To avoid baking an unsafe value into the
committed file, the compose reads `GOTRUE_DISABLE_SIGNUP=${DISABLE_SIGNUP:-true}`
— the file defaults safe; only the un-committed on-box `.env.prod` opens it
with `DISABLE_SIGNUP=false`. `MAILER_AUTOCONFIRM=false` stays; magic-link
signup still works (the link confirms). Flipping back to invite-only is one
`.env.prod` edit (R5; tracked in the production-hardening phase).

**Magic-link template fetched over the internal network.** GoTrue fetches
templates by HTTP at send time and silently falls back to its OTP-bearing
default if the fetch fails (`docs/gotrue-templates.md`). The relative-path
form would resolve to the public HTTPS URL and thus depend on the TLS cert
already being issued — a first-email trap. We instead set the full
**internal** URL `http://web/gotrue/templates/magic_link.html` (the web
container serves `static/` → `build/gotrue/...`), which is up regardless of
cert state (R6).

**Safe-by-default compose layering: the base publishes no host ports.**
Docker Compose _concatenates_ `ports` lists (and merges `depends_on` maps)
across `-f` files — verified empirically — so a prod override cannot remove
a base port with `ports: []` (it's a silent no-op) and cannot drop a base
`depends_on` entry. Relying on that would leave Postgres, PostgREST, and
GoTrue published on `0.0.0.0` in prod; ufw is no help either, because
Docker's publish rules sit in the `nat`/`DOCKER` chains and bypass ufw's
`INPUT` filter. Rather than fight the merge with `!override`/`!reset` tags
(which leave the _unsafe_ state as the default if one is mistyped or
forgotten on a future service), we restructure into three files so the safe
state is the default:

- **`docker-compose.yml`** — prod-safe base: the services common to dev and
  prod (postgres, postgrest, gotrue, sidecar, caddy) with **no** published
  host ports, and `gotrue.depends_on: [postgres]` only.
- **`docker-compose.override.yml`** — auto-loaded in dev: the dev published
  ports (`5432/3000/9999`, mailpit `8025/1025`, caddy `8080:80`), the
  `static` + `mailpit` services, the dev GoTrue env (mailpit SMTP,
  `MAILER_AUTOCONFIRM=true`, `localhost` SITE_URL/ALLOW_LIST/API_EXTERNAL_URL,
  the `http://static/...` template URL, `DISABLE_SIGNUP=false`), gotrue's
  `mailpit`/`static` dependencies, and the dev `caddy/Caddyfile` mount.
- **`docker-compose.prod.yml`** — prod only: Caddy `80:80`/`443:443` +
  `Caddyfile.prod`, the loopback `127.0.0.1:5432:5432` Postgres publish, the
  `web` + `auth-proxy` services, and the prod GoTrue env.

Dev stays a bare `docker compose up` (auto-loads the override → byte-for-byte
today's stack); the deploy command is unchanged
(`-f docker-compose.yml -f docker-compose.prod.yml` skips the dev override).
Forget the prod file and you get _nothing_ exposed, not a public database.
No `!override`/`!reset` tags are needed and the `depends_on` merge footgun
disappears (R1, R8).

**caddy `file_server` for the web runtime, named `avatars` volume.** The web
runtime stage uses `caddy:2.9.1-alpine` `file_server` with a one-line SPA
`try_files` fallback (same image family, no extra base to patch). Avatars
stay on the existing named `avatars` Docker volume (no host-dir permission
fuss; Caddy mounts it RO; `volumes` merge by container target, so each
overlay's Caddyfile mount cleanly replaces the base's). `scripts/migrate.sh`
runs unmodified — it sources `.env` and shells out to host
`psql -h localhost`; on the box we symlink `.env → .env.prod`, and the
loopback Postgres publish above lets the script work without exposing
Postgres to the internet (R8).

**Minimal imprint now, full legal later.** `0000` flags the German
Impressum as a _public-launch_ blocker. For an unadvertised early
alpha the risk is far lower, but a one-page operator/contact stub is
cheap insurance if the URL leaks. The full step-14 surface (Privacy, Terms,
OSS attributions, …) is out of scope (R9).

## Architecture

### New files

- **`auth-proxy/`** — Node sidecar (mirrors `sidecar/` layout): `Dockerfile`,
  `package.json`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`,
  `src/server.ts`, `src/index.ts` (the shim), `src/lib/auth-paths.ts`
  (drift-guarded copy of the canonical file), `test/*.test.ts`.
- **`web/Dockerfile`** — two-stage build (Node 20 + pnpm → static bundle)
  then `caddy:2.9.1-alpine` `file_server` on `:80`.
- **`web/.dockerignore`** — excludes `.env*`, `node_modules`, `build`,
  `.svelte-kit`, `e2e`, `test-results`.
- **`docker-compose.override.yml`** — auto-loaded dev overlay holding every
  dev-only thing moved out of the base (published ports, `static`/`mailpit`,
  dev GoTrue env + deps, dev Caddyfile mount).
- **`docker-compose.prod.yml`** — production overrides layered over the
  prod-safe base (Caddy `80/443`, loopback Postgres, `web` + `auth-proxy`,
  prod GoTrue env).
- **`caddy/Caddyfile.prod`** — real (non-pseudocode) routing + shim wiring
  - ACME TLS.
- **`.env.prod.example`** — committed secret/config template.
- **`web/src/routes/imprint/+page.svelte`** (+ `page.test.ts`) — minimal
  imprint stub. (Exact route dir confirmed against existing `web/src/routes/`
  at task time.)

### Modified files

- **`docker-compose.yml`** — strip the published host ports and dev-only
  bits into the new `docker-compose.override.yml`, leaving a prod-safe base
  (no ports; `gotrue.depends_on: [postgres]`).
- **`docs/deployment.md`** — replace pseudocode with pointers to the real
  files; fix `avatars:8080`→`sidecar:3001`; correct the "migrate.sh uses
  .env.prod automatically" claim; note the loopback publish.
- **`docs/architecture.md`** — record the auth-proxy interim shim and the
  Go-module convergence target.
- **`docs/gotrue-templates.md`** — note the prod internal-URL form.
- **`scripts/check.sh`** — lint + test both Node sidecars: wire in the new
  `auth-proxy` package, and add the lint step the existing `sidecar/` never
  had (it was install + test only).
- **`sidecar/`** — retrofit ESLint (`eslint.config.js` + `lint` script +
  eslint devDeps) so the two Node sidecars share one quality bar.
- Web entry points (login footer / Settings) — add the discreet imprint
  link.

### Request flow (prod)

```
Browser ─HTTPS→ Caddy(:443, ACME) ─┬ /api/*        → postgrest:3000  (cookie→bearer, stock Caddy)
                                    ├ /auth/{magiclink,verify,token,user,session}
                                    │                → auth-proxy:3002 → gotrue:9999  (shim)
                                    ├ /auth/{login,check,callback} → web:80  (SvelteKit routes)
                                    ├ GET /avatars/*.webp → file_server (avatars vol, RO)
                                    ├ POST/DELETE /avatars* → sidecar:3001 (cookie→bearer)
                                    └ everything else (incl /gotrue/templates/*) → web:80
```

## Phase structure

TDD ordering: the two phases with real logic (auth-proxy, imprint) put RED
before GREEN within their tasks. The infra-file phases (Dockerfile,
compose, Caddyfile, env) are verified by build/`docker compose config`
checks rather than unit tests. Phase 0 lands the doc reconciliation first.

0. **Phase 0 — reconcile docs.** Fix `docs/deployment.md` pseudocode +
   errors, add the auth-proxy interim note to `docs/architecture.md`, and
   the internal-URL note to `docs/gotrue-templates.md`, so downstream
   phases (and future plans) don't reference a stale spec. (R2, R5, R6, R8)
1. **Phase 1 — auth-proxy sidecar.** Port the dev shim into a Node sidecar
   reusing `auth-paths.ts`; tests for cookie-plant/bearer narrowing, token
   strip, logout, `Secure` gating, and the drift guard. (R2, R3)
2. **Phase 2 — web container.** `web/Dockerfile` + `.dockerignore`;
   prod-mode build that drops dev-login; verify the bundle grep. (R4)
3. **Phase 3 — compose restructure + production compose.** First make
   `docker-compose.yml` prod-safe (no published ports; `gotrue.depends_on:
[postgres]`) and move every dev-only thing into a new auto-loaded
   `docker-compose.override.yml`, verifying the dev stack is unchanged
   (Task 3.1). Then add `docker-compose.prod.yml` with the loopback Postgres
   publish, Caddy `80/443`, prod GoTrue env, and the `web` + `auth-proxy`
   services (Task 3.2). The Compose merge-concatenation footgun is designed
   out, not patched. (R1, R5, R8)
4. **Phase 4 — production Caddyfile.** `caddy/Caddyfile.prod` with ACME
   TLS, security headers, the explicit `/auth/*` allow-list routing, and
   the stock cookie→bearer for `/api` + `/avatars`. (R1, R2)
5. **Phase 5 — secrets template.** `.env.prod.example`. (R7)
6. **Phase 6 — imprint stub.** Minimal imprint route + discreet link +
   tests. (R9)
7. **Phase 7 — CI wiring.** Wire both Node sidecars into `scripts/check.sh`
   — the new `auth-proxy`, and the lint step the existing `sidecar/` was
   missing (retrofit its ESLint config so both share one bar). (R10)
8. **Phase 8 — deploy + smoke test.** The on-box sequence and end-to-end
   verification. Operational, executed with the user. (R6, R8, R10)

A later **production-hardening** phase (appended as the alpha matures)
covers the deferred work: Restic backups + Storage Box, and the
auth-proxy → Caddy-module convergence. Open signup stays on by default;
locking it down is an option, not a planned step. Not written now.

## Reference docs and skills

- **`docs/deployment.md`** — the canonical deploy spec (pseudocode this
  plan turns into real files; pre-deploy auth checklist).
- **`docs/architecture.md`** — the shim contract and the stance this plan
  deviates from (interim).
- **`docs/gotrue-templates.md`** — how GoTrue loads the magic-link template.
- **`docs/testing.md`** — three test layers (auth-proxy → Vitest-style Node
  tests; imprint → Vitest + Playwright touch).
- **`web/vite.config.ts`, `web/src/lib/shared/model/auth-paths.ts`** — the
  dev shim and the narrowing source of truth to reuse.
- **`sidecar/Dockerfile`** — template for the auth-proxy and web Dockerfiles.

## Open questions

- **Imprint contact fields.** The stub needs real operator name/address/
  e-mail. Default: ship with clearly-marked placeholders and have the user
  fill them before the URL is shared (a deploy gate, not a code blocker).
- **`auth-proxy` shared-module strategy.** Copy-with-guard-test (chosen for
  the simpler build context) vs. repo-root build context importing the
  canonical file. Default: copy-with-guard; revisit if the guard proves
  fragile.
