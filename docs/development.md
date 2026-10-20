# Development

This document is the practical guide to working on Cairn from a developer's laptop. It assumes you've read `architecture.md` (so you know what the pieces are) and `data-model.md` (so you know what the schema looks like). The goal is that a fresh checkout, plus the steps in this document, gets you to a running stack you can develop against in under fifteen minutes.

The design principle behind everything here is **dev/prod parity**: the containers running on your laptop are bit-identical to the ones running in production. The only differences are the things that have to be different — TLS, the mail provider, and TLS-termination. Caddy runs in dev compose for avatar static serving (port 8080); for `/api` and `/auth` the SvelteKit dev server proxies directly to PostgREST and GoTrue and handles the JWT cookie shim.

## Prerequisites

Three things on your machine:

1. **Docker.** Docker Desktop on macOS or Windows; Docker Engine on Linux. Recent enough to support Compose v2 (`docker compose` as a subcommand). Anything from the last couple of years is fine.
2. **Node.js (LTS, 20 or 22) and `pnpm`.** `pnpm` is the package manager the SvelteKit project uses; `npm install -g pnpm` works if your distribution doesn't ship it. `pnpm` is preferred over `npm` for its faster, content-addressed install behaviour, but `npm` works at a pinch.
3. **A code editor.** VS Code with the official Svelte extension is the path of least resistance. Anything else with LSP support works equally well.

You do not need a local Postgres install, a local PostgREST install, an Android emulator, or Xcode. Cairn is a web app; everything runs in containers and a browser.

## Repository layout

```
cairn/
├── docker-compose.yml      ← the dev stack
├── .env.example            ← template for local secrets
├── .editorconfig           ← editor defaults (indent, EOL)
├── .sqlfluff               ← SQL lint config
├── cspell.json             ← spell-check dictionary
├── lefthook.yml            ← pre-commit hook runner
├── docs/                   ← living specification (start at docs/README.md)
├── design/                 ← visual references and design tokens (JSX, not shipped)
├── plans/                  ← per-step implementation plans
│   ├── 0000_implementation_order.md   ← master roadmap; tick boxes as steps land
│   └── NNNN_<slug>/                   ← each step is PLAN.md + REQUIREMENTS.md + TASKS.md
├── scripts/                ← dev / CI shell entrypoints (migrate.sh, check.sh, …)
├── db/
│   ├── Dockerfile          ← Postgres image with pgTAP preinstalled
│   ├── migrations/         ← versioned SQL, applied in numeric order
│   ├── seed/dev_seed.sql   ← no-op until step 3 — see "Seed data" below
│   ├── test-bootstrap.sql  ← bootstraps a fresh test DB before pgTAP runs
│   └── tests/              ← pgTAP suites (RLS, triggers, views, constraints)
├── web/                    ← the SvelteKit project
│   ├── .env.example        ← template for VITE_* (copy to .env, which is gitignored)
│   ├── e2e/                ← Playwright suites
│   └── src/lib/            ← see docs/frontend-layout.md for the tier split
│       ├── basic/          ← presentational primitives (Button, Icon, Sheet, …)
│       ├── shared/         ← cross-feature components, state, styles
│       └── test/           ← Vitest helpers and MSW handlers
├── sidecar/                ← avatar upload / delete sidecar (Node + Express)
└── caddy/                  ← Caddyfile for dev (avatar static serving + sidecar proxy)
```

The `docker-compose.yml` at the root defines the backend (Postgres, PostgREST, GoTrue, Mailpit, the avatar sidecar, and Caddy). The web app is _not_ in compose during development — you run it directly via `pnpm dev` for fast HMR. The deployment compose file (`docker-compose.prod.yml`) layers on the production-only services including a `web` container; see `deployment.md`.

## First-time setup

```bash
git clone <repo-url> cairn
cd cairn

# Backend env
cp .env.example .env

# Bring up the backend
docker compose up -d

# Apply migrations
./scripts/migrate.sh

# (Optional) load the dev seed data
./scripts/seed.sh

# Web app
cd web
pnpm install
pnpm dev
```

That's it. After this you have:

- Postgres listening on `localhost:5432`
- PostgREST on `localhost:3000`
- GoTrue on `localhost:9999`
- Mailpit on `localhost:8025` (web UI) and `localhost:1025` (SMTP)
- Caddy on `localhost:8080` — static avatar serving (`GET /avatars/*`) and write proxy (`POST`/`DELETE /avatars`) to the sidecar; this is the avatar endpoint the browser uses
- Avatar sidecar on `sidecar:3001` (compose-internal only) — Caddy proxies to it; not reachable from the host
- The SvelteKit dev server on `localhost:5173`, proxying `/api` to PostgREST and `/auth` to GoTrue.

Open `http://localhost:5173` and you're in.

Verify the backend with:

```bash
curl http://localhost:3000/
# → PostgREST's OpenAPI description, JSON

curl http://localhost:9999/health
# → {"name":"GoTrue","version":"...","description":"..."}
```

## The development stack

The `docker-compose.yml` defines six backend services. A trimmed sketch:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: cairn
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: cairn
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  postgrest:
    image: postgrest/postgrest:v12
    environment:
      PGRST_DB_URI: postgres://authenticator:${AUTHENTICATOR_PASSWORD}@postgres/cairn
      PGRST_JWT_SECRET: ${JWT_SECRET}
      PGRST_DB_ANON_ROLE: anon
    ports:
      - "3000:3000"
    depends_on: [postgres]

  gotrue:
    image: supabase/gotrue:v2.158.1
    environment:
      # Note: GoTrue reads API_EXTERNAL_URL without the GOTRUE_ prefix
      # (envconfig quirk). Every other key uses the prefix.
      API_EXTERNAL_URL: http://localhost:9999
      GOTRUE_DB_DRIVER: postgres
      GOTRUE_DB_DATABASE_URL: postgres://gotrue:${GOTRUE_PASSWORD}@postgres/cairn?search_path=auth
      GOTRUE_JWT_SECRET: ${JWT_SECRET}
      GOTRUE_SMTP_HOST: mailpit
      GOTRUE_SMTP_PORT: 1025
      GOTRUE_SITE_URL: http://localhost:5173
      GOTRUE_DISABLE_SIGNUP: "false"
      GOTRUE_MAILER_AUTOCONFIRM: "true" # skip e-mail confirmation (on in prod too)
    ports:
      - "9999:9999"
    depends_on: [postgres, mailpit]

  mailpit:
    image: axllent/mailpit
    ports:
      - "8025:8025" # web UI
      - "1025:1025" # SMTP

  sidecar:
    build: ./sidecar
    environment:
      GOTRUE_JWT_SECRET: ${JWT_SECRET}
      POSTGREST_URL: http://postgrest:3000
      AVATARS_DIR: /srv/cairn/avatars
      PORT: "3001"
    ports:
      - "3001:3001"
    volumes:
      - avatars:/srv/cairn/avatars
    depends_on:
      postgrest:
        condition: service_healthy

  caddy:
    image: caddy:2.9.1
    ports:
      - "8080:80"
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - avatars:/srv/cairn/avatars:ro
```

A few things worth knowing about this:

- **The `JWT_SECRET` is shared** between PostgREST and GoTrue. GoTrue signs JWTs with it; PostgREST verifies signatures with it. They have to match. In dev it's a random string in `.env`; in production it's a stronger random string in a secrets file.
- **Postgres roles**: `cairn` is the superuser used for migrations (created by Postgres from `POSTGRES_USER`); the rest are created by the migrations. `authenticator` is what PostgREST connects as — it has no rights of its own and `SET ROLE`s to `anon` or `authenticated` per request based on the JWT. `anon` and `authenticated` are no-login group roles that RLS policies reference. `gotrue` is what GoTrue connects as; it owns the `auth` schema. There is also a no-login `postgres` stub role: recent supabase/gotrue migrations hardcode `GRANT ... TO postgres` against their auth tables, so the role has to exist even though our superuser is named `cairn`.
- **`GOTRUE_MAILER_AUTOCONFIRM: "true"`** makes signup skip the e-mail-confirmation step, and it is on in **both** dev and prod. It is load-bearing, not just a convenience: the auth-proxy's `/auth/register` flow authenticates against the non-deliverable `<uid>@cairn.internal` identity, so a confirmation e-mail could never be delivered and clicked — the account has to be immediately usable. E-mail verification instead happens later and optionally, when a user proves a _recovery_ address (see `architecture.md` → "Password recovery is Cairn-orchestrated").
- **`GOTRUE_SITE_URL: http://localhost:5173`** is the SvelteKit dev server — GoTrue's notion of the app origin. Caddy's _cookie shim_ is not in the loop locally — it is approximated by the SvelteKit dev server's API proxy (see below). Caddy itself does run in the dev compose for avatar static serving (port 8080).

## The SvelteKit dev server and the cookie shim

In production, Caddy translates between the JavaScript-side `cairn_session` cookie and the `Authorization: Bearer …` header that PostgREST expects. In development, the SvelteKit dev server (Vite) does the same translation in its proxy config:

```ts
// web/vite.config.ts (sketch)
export default defineConfig({
	server: {
		proxy: {
			"/api": {
				target: "http://localhost:3000",
				rewrite: (p) => p.replace(/^\/api/, ""),
				configure: (proxy) => {
					proxy.on("proxyReq", (proxyReq, req) => {
						const cookie = req.headers.cookie ?? "";
						const m = cookie.match(/cairn_session=([^;]+)/);
						if (m) proxyReq.setHeader("Authorization", `Bearer ${m[1]}`);
					});
				},
			},
		},
	},
	// /auth/* is not proxied: dev middlewares mirror each auth-proxy BFF
	// handler (sign-in, register, refresh, sign-out, recovery), calling GoTrue
	// server-side and planting the cookies themselves. Any other /auth/* path
	// gets a 404, as in production; the SPA's own /auth pages fall through to
	// SvelteKit.
});
```

The exact code lives in the repo. The point is: **the dev experience matches production at the boundary the web app sees** — same paths, same cookie behaviour, same `/api` and `/auth` URLs. You shouldn't be able to tell whether you're hitting Caddy or Vite from inside the SvelteKit code.

## Migrations

Schema changes are managed as numbered SQL files in `db/migrations/`. They run in order and they're idempotent (each one starts with `BEGIN`, ends with `COMMIT`, and uses `IF NOT EXISTS` where appropriate so partial runs don't poison the database).

There's no fancy migration framework — `./scripts/migrate.sh` is a small shell script that:

1. Reads which migrations have already been applied from a `_migrations` table.
2. Applies any new ones in order via `psql`.
3. Records each one as applied.
4. Issues `NOTIFY pgrst, 'reload schema'` so the running PostgREST container reloads its in-memory schema cache without a container bounce. PostgREST otherwise serves the pre-migration schema until it's restarted, which is a sharp surprise the first time you `curl /<new_table>` and get a 404.

Adding a new migration is "create the next-numbered file, write the SQL, run the script." If we ever need branching, rollbacks, or schema diffing, we'll bring in [sqitch](https://sqitch.org/) or similar.

One non-obvious thing the migrations do: **pre-create the `auth` schema and hand ownership to the `gotrue` role** before GoTrue first connects. GoTrue's DSN sets `search_path=auth` and its first action is `CREATE TABLE schema_migrations`, which fails with "no schema has been selected to create in" if the schema doesn't already exist. Don't "simplify" this back out — the standard "let GoTrue create its own schema" advice doesn't apply when `search_path` is set in the DSN.

A second non-obvious thing: **`migrate.sh` waits for GoTrue to create `auth.users` before applying any migration numbered `0004` or later**, because those migrations reference `auth.users` (FKs, triggers) and would fail against a database where GoTrue hasn't yet completed its own startup migrations. The wait is bounded by the `MIGRATE_AUTH_USERS_TIMEOUT` env var (default 60 s, override only for slow CI or a cold VPS). If `migrate.sh` hangs at `==> waiting for gotrue to create auth.users` for longer than that, bump the var or check `docker compose logs gotrue` — most often it's a misconfigured GoTrue connection string. The wait is _not_ applied to `0001`–`0003`, which create the `gotrue` role itself; an unconditional wait would deadlock on a fresh `docker compose up -d`.

To start over with a clean database:

```bash
docker compose down -v       # the -v removes the postgres volume
docker compose up -d
./scripts/migrate.sh
./scripts/seed.sh
```

This is fast — the whole rebuild takes a few seconds. Don't be precious about doing it.

## Seed data

`./scripts/seed.sh` first waits for GoTrue to be reachable, then POSTs `/signup` to GoTrue for Alice/Bob/Carol (emails `alice@example.test`, `bob@example.test`, `carol@example.test`; password `cairn-dev` for all three). `tg_profile_on_signup` synchronously creates the matching `profiles` and `user_settings` rows inside each signup transaction. The script then runs `db/seed/dev_seed.sql`, which `UPDATE`s the three profiles' `display_name` from the trigger's default (the provisional username) to `Alice`, `Bob`, `Carol`. The whole flow is idempotent: GoTrue's 422 "User already registered" is treated as success on rerun, and the SQL `UPDATE`s are naturally idempotent.

We deliberately don't `INSERT` directly into `auth.users` — GoTrue's schema has version-dependent NOT NULL columns that a bare insert can't satisfy reliably, and any row we hand-craft would be one GoTrue refuses to authenticate against. The signup-then-UPDATE shape lets each side do what it's good at.

**Production posture (step 13, `1500_production_rollout` — now shipped).** The dev password `cairn-dev` is committed in `db/seed/dev_seed.sql` and `scripts/seed.sh`, and `POST /auth/signup` is open in dev (`GOTRUE_DISABLE_SIGNUP="false"`, `GOTRUE_MAILER_AUTOCONFIRM="true"`). Both are intentional and contained to localhost: no production rollout path runs `./scripts/seed.sh`, so the committed credential never reaches a prod instance. Production runs **open** signup as a deliberate alpha posture: the prod `.env` sets `DISABLE_SIGNUP=false` (so GoTrue's `GOTRUE_DISABLE_SIGNUP` resolves to `false`) and `GOTRUE_MAILER_AUTOCONFIRM=true`, which the auth-proxy's `/auth/register` flow needs to obtain an immediately-usable token set. `GOTRUE_DISABLE_SIGNUP` remains the operator's hard switch, and the per-IP register throttle bounds mass signup from a single source. The raw GoTrue password grant is reachable only through the rate-limited BFF (see `docs/deployment.md` → "Auth surface: pre-deploy checklist"), so an open signup endpoint is not an open credential-stuffing surface. `docs/invites.md` governs invite _acceptance_, not signup-openness — it is not the basis for an invite-only signup gate.

Anti-enumeration lives in the recovery flow, not the sign-in screen. A username is _public_ (it's the `@handle`), so the sign-in screen has no account-existence secret to protect — but the private **recovery e-mail** does. A signed-out password reset is requested by **username**, and the BFF returns a **constant response** regardless of whether the account exists or has a recovery address on file, mailing a reset code only when both are true (the discipline established in `plans/0302_signin_anti_enumeration/`). The banned-user sign-in contract in `docs/admin.md` → _"What the web app shows when a banned user tries to sign in"_ is the same idea at the credential layer: a banned account's sign-in attempt is indistinguishable from a wrong-password one. Dev's `GOTRUE_DISABLE_SIGNUP="false"` doesn't change these surfaces; the contracts are verified by the route-mocks in `web/e2e/` rather than by GoTrue itself.

**Dev cookie-plant narrowing.** The Vite dev proxy mirrors production's `auth-proxy` BFF: it plants the dual session cookie only on the deliberate sign-in / registration exchanges (`/auth/signin`, `/auth/register`), and a 2xx from any other endpoint does **not** plant a cookie. Both the dev proxy and the production BFF enforce the same narrowing via the shared lists in `web/src/lib/shared/model/auth-paths.ts`; adding a new GoTrue endpoint to the narrow is a deliberate edit, not an implicit consequence of a 2xx response shape.

## The web app

```bash
cd web
pnpm install
pnpm dev
```

Vite serves the app on `http://localhost:5173` with HMR. Edit a `.svelte` file, save, the page updates without losing state. The same applies to changes in `src/lib/` and the route files.

The app reads its API and auth URLs from `import.meta.env.VITE_*`:

```bash
# web/.env (gitignored; copy from .env.example)
VITE_API_BASE=/api
VITE_AUTH_BASE=/auth
```

`VITE_API_BASE` and `VITE_AUTH_BASE` are paths, not full URLs — same in dev and prod, because Caddy and Vite both serve the API at `/api` and the auth service at `/auth` on the same origin as the app.

To sign in locally, use the seed accounts on the sign-in screen — see "Signing in during development" below.

### Building for production locally

```bash
pnpm build
pnpm preview
```

`pnpm build` runs the static adapter and produces a `web/build/` directory containing the deployable bundle (HTML, JS, CSS, the manifest, the service worker). `pnpm preview` serves it on `localhost:4173` so you can verify the production build before pushing.

### Gating dev-only UI so it doesn't ship to prod

Svelte compiles `{#if condition} … {/if}` to runtime logic — even when `condition` is statically `false` after Vite's `import.meta.env.DEV` replacement, the minifier cannot prove the branch is dead across the component boundary. The template strings, the closures, and any modules imported only for that branch all survive into the prod bundle.

This matters whenever you add UI that should be **physically absent** in prod, not just hidden — a debug panel, a fixture-seeding button, anything that embeds a dev-only secret or endpoint. Use the literal-conditional dynamic-import pattern below so the dead module drops from the prod graph entirely.

**Don't do this:**

```svelte
<script lang="ts">
  import { devOnlyHelper } from './dev-only-helper';
  const isDev = import.meta.env.DEV;
</script>

{#if isDev}
  <!-- This DOM, the import above, and any string literals all ship to prod. -->
  <DevPanel />
{/if}
```

**Do this instead:**

```svelte
<script lang="ts">
  import type { Component } from 'svelte';

  let DevPanel: Component | null = $state(null);
  if (import.meta.env.DEV) {
    // Literal-conditional dynamic import: Vite folds the `if` to `false` in
    // prod, the `import()` becomes dead code, and the whole module
    // (`./DevPanel.svelte` plus everything it transitively imports) drops
    // from the prod graph.
    void import('./DevPanel.svelte').then((m) => (DevPanel = m.default));
  }
</script>

{#if DevPanel}
  <DevPanel />
{/if}
```

The dynamic-import pattern moves the gate from runtime to build time. Verify with `pnpm build` followed by grep against `web/build/_app/immutable/` — any string that should be dev-only should not appear.

Note also that `import.meta.env.VITE_*` references are **inlined at build time as string literals**. A dev-only env var (say a `VITE_DEBUG_*` flag) that is set in the shell when `pnpm build` runs will bake its value into the JS bundle, dead-code-eliminated or not. Keep dev env vars in `.env.local` or `.env.development` (which Vite only loads in dev mode), never in `.env` or `.env.production`.

### The service worker in development

The service worker is **disabled by default in `pnpm dev`** because constant cache invalidation during development is more annoying than the offline behaviour is useful. To test it, run `pnpm preview` after `pnpm build`, which serves the production bundle including the worker.

When you do test offline behaviour:

- Open the page once (the worker installs).
- Close the browser dev tools, open the _Application_ tab in dev tools, and check the _Offline_ checkbox.
- Reload — the app shell loads from the cache; cached `/api` GETs serve recent data; uncached routes show the _"No connection"_ state.

## Signing in during development

Sign-in is **username + password** (see `architecture.md` → "Authentication: GoTrue + username and password"). Locally, use the seed accounts created by `./scripts/seed.sh`: on the sign-in screen enter `alice`, `bob`, or `carol` with the dev password `cairn-dev`. The Vite dev proxy mirrors production's `auth-proxy` BFF — it resolves the username to the account's stable `<uid>@cairn.internal` identity, runs GoTrue's password grant server-side, and plants the dual session cookie — so you land on `/` signed in, exactly as in production.

The dev cookies are set without the `Secure` attribute because localhost is HTTP; production's cookies are `Secure` and `__Host-`-prefixed. This divergence is intentional.

To exercise **password recovery** locally, no real e-mail is sent — Mailpit (`http://localhost:8025`) catches the recovery and reset-code e-mails the BFF sends. Set a recovery address from Settings (the BFF mails a confirmation code), then drive forgot-password to receive a reset code; see `architecture.md` → "Password recovery is Cairn-orchestrated".

## Common tasks

A grab bag of things you'll do often:

**Look at the database.** Either use `psql` from inside the container —

```bash
docker compose exec postgres psql -U cairn -d cairn
```

— or connect with a GUI client (TablePlus, DBeaver, Postico) to `localhost:5432` with the credentials in `.env`.

**Hit the API directly.** PostgREST is plain HTTP+JSON. You need a JWT for anything beyond the OpenAPI doc — grab one from GoTrue's password grant using a seed user. The seed accounts authenticate under the stable identity `<uid>@cairn.internal` (`alice@example.test` no longer exists at GoTrue once the seed has adopted it), so resolve the username to its uid first (`resolve_username` is anon-callable):

```bash
curl -s -X POST 'http://localhost:3000/rpc/resolve_username' \
  -H 'Content-Type: application/json' \
  -d '{"p_username":"alice"}'
# → [{"id":"<uid>","username":"alice"}]

curl -X POST 'http://localhost:9999/token?grant_type=password' \
  -H 'Content-Type: application/json' \
  -d '{"email":"<uid>@cairn.internal","password":"cairn-dev"}'
```

The `access_token` in the response body is the JWT. Pass it as `Authorization: Bearer <jwt>` to PostgREST:

```bash
curl -H "Authorization: Bearer <jwt>" http://localhost:3000/lists
```

The unauthenticated PostgREST surface is at the OpenAPI root, `http://localhost:3000/`.

**Watch the logs.**

```bash
docker compose logs -f postgrest gotrue
```

PostgREST's logs show every query it issues to Postgres, which is invaluable for debugging policies. GoTrue's logs show the auth flow.

**Reset everything.** Already covered above, but worth repeating because you'll do it often:

```bash
docker compose down -v && docker compose up -d && ./scripts/migrate.sh && ./scripts/seed.sh
```

**Run a one-off SQL query against the running database.**

```bash
docker compose exec postgres psql -U cairn -d cairn -c "SELECT count(*) FROM items;"
```

## Testing

Cairn tests in three layers — pgTAP for the database, Vitest for unit and component tests, Playwright for end-to-end. Schema and RLS policies are the heart of Cairn's security model, so the pgTAP suite is the load-bearing one.

The full reference for what each layer is for, where the tests live, and how to run them is in **[`testing.md`](testing.md)**. The short version of the local commands:

```bash
./scripts/test-db.sh           # pgTAP
cd web
pnpm test                      # Vitest (one-shot)
pnpm test:watch                # Vitest (watch mode — the usual local loop)
pnpm test:e2e                  # Playwright (needs the backend up)
```

## Code quality checks

Linting, formatting, and type checking are documented in **[`quality.md`](quality.md)** — what each tool is, why we picked it, and how it's wired up. The short version:

```bash
cd web
pnpm check                     # type check (svelte-check)
pnpm lint                      # eslint
pnpm format:check              # prettier
sqlfluff lint db/              # SQL lint
shellcheck scripts/*.sh        # shell lint
```

Or run everything CI runs, in one shot:

```bash
./scripts/check.sh
```

A pre-commit hook (lefthook) runs the right subset of these on staged files automatically; install it once with `lefthook install`. See `quality.md` for the full configuration.

## Troubleshooting

**`docker compose up` says a port is already in use.** Something else on your machine is using 5432, 3000, 9999, 8025, 1025, or 5173. Either stop it or change the port mapping (and update the env files accordingly).

**PostgREST returns "JWT expired" immediately.** Your machine clock is wrong, or the JWT was issued for a different secret. Restart the stack and log in again.

**The cookie isn't being set in dev.** Vite's proxy is the cookie shim locally; if the response-side translation isn't running, check `vite.config.ts`. A common cause: GoTrue returned a non-200 response, so the response handler short-circuited. Look at GoTrue's logs.

**A migration failed and now nothing works.** Reset the database (the four-command sequence above). Migrations should be idempotent and re-runnable, but if you've gotten into a wedged state, the cost of starting over is approximately zero.

**RLS is blocking a query that I think it shouldn't.** Look at PostgREST's logs for the actual SQL it ran, then run that same SQL manually as the `authenticated` role with the right `request.jwt.claims` set. The bug is almost always in the policy, not the API call.

```sql
set role authenticated;
set local request.jwt.claims = '{"sub":"<a-known-user-uuid>"}';
select * from lists;
reset role;
```

`public.uid()` reads the `sub` field out of the `request.jwt.claims` JSON object — that's the GUC PostgREST sets per request in v10+. Older snippets that set `request.jwt.claim.sub` (singular, no JSON) won't work; that per-claim form was removed in PostgREST v10 and we run v12.

This is the single most useful debugging trick for this stack. Learn it.

## What you should _not_ do during development

- **Don't connect the dev app to the production API.** The `.env` files keep these separate; don't override them casually. Production data is real users' data.
- **Don't commit `.env`.** It's gitignored. The `.env.example` is the committed template.
- **Don't bypass migrations by editing the schema directly in the running container.** Anything not captured in a migration file is invisible to your collaborators and to production. If you find yourself reaching for `ALTER TABLE` in `psql`, stop, write a migration, and run it.
- **Don't disable RLS to make a query work.** The query is wrong, or the policy is wrong. Disabling RLS while you debug is fine; shipping that disablement is a security incident.
- **Don't put the JWT into `localStorage` from the web app.** The whole point of the cookie shim is that JavaScript never holds the token. If you need the token for an experiment, get it from `document.cookie` _only_ in dev (where it's deliberately not HttpOnly) — and remove the experiment before commit.
- **Don't gate dev-only UI behind a runtime `{#if}` over an env-derived boolean.** Svelte emits `{#if}` as runtime logic, so the template and its closures still ship to prod even when the branch is unreachable. Use a literal `if (import.meta.env.DEV)` dynamic import instead, so the dead module drops from the prod graph entirely. See "Gating dev-only UI so it doesn't ship to prod" above.
