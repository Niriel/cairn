# Tasks

## Reference skills and docs

- **`docs/deployment.md`** — canonical deploy spec; the Caddyfile/compose
  pseudocode this plan turns into real files; the pre-deploy auth checklist.
- **`docs/architecture.md`** — the cookie/JWT shim contract ("JWT storage")
  and the "no separate Node service for auth" stance this plan deviates from.
- **`docs/gotrue-templates.md`** — how GoTrue fetches the magic-link template.
- **`docs/testing.md`** — three test layers; auth-proxy is Node/Vitest,
  imprint is Vitest + a Playwright touch.
- **`.claude/skills/writing-tasks.md`** — route-level test files drop the
  `+` (e.g. `page.test.ts`); run `pnpm check` on route-shaped tasks.

Canonical references reused throughout:
- `web/vite.config.ts` — the dev shim logic to port (lines ~30–176).
- `web/src/lib/shared/model/auth-paths.ts` — the narrowing source of truth
  (`PUBLIC_AUTH_PATHS`, `SIGNED_IN_REDIRECT_PATHS`, `BEARER_AUTH_PATHS`,
  `COOKIE_PLANT_PATHS`, `LOGOUT_PATHS` — five exports; the proxy uses the
  last three).
- `sidecar/Dockerfile`, `sidecar/package.json` — template for the new
  `auth-proxy/` package and `web/Dockerfile`.

## Phase 0 — reconcile docs

### [x] 0.1 Reconcile the deployment docs with the real prototype shape

**Created:** 2026-06-10T11:38:29Z
**Completed:** 2026-06-10T12:27:55Z

**Why:** `docs/deployment.md` currently shows the Caddyfile and compose as
pseudocode with two factual errors, and `docs/architecture.md` asserts a
shim design (in-Caddy, no Node auth service) that this plan deliberately
does not follow for the prototype. Cairn's docs are canonical for
downstream plans; landing the doc edits first stops later work referencing
a stale spec.

**Prerequisites:** None.

**Decisions:**
- The production shim is an **interim Node `auth-proxy` sidecar** that
  reuses the dev shim logic and the shared `auth-paths.ts`; the custom
  Caddy Go module remains the long-term target. Record this — don't
  silently contradict the doc.
- Fix `deployment.md`'s pseudocode errors: the avatar sidecar is
  `sidecar:3001`, not `avatars:8080`; and `scripts/migrate.sh` sources
  `.env` (not `.env.prod`) and needs Postgres reachable on
  `localhost:5432` (a loopback-only publish) + host `psql`.
- Note in `docs/gotrue-templates.md` that production should use the
  **internal** URL `http://web/gotrue/templates/magic_link.html` (not the
  relative form) so the template fetch doesn't depend on the TLS cert.

**Files:**
- `docs/deployment.md` (modify)
- `docs/architecture.md` (modify)
- `docs/gotrue-templates.md` (modify)

**Steps:**
1. In `docs/architecture.md`, reconcile the two sentences the auth-proxy
   makes false — don't just append a note:
   - The "JWT storage" section currently ends "Caddy is the right home for
     this shim … **We do not introduce a separate Node service to handle
     auth.**" Qualify it: the interim prototype *does* run a Node `auth-proxy`
     sidecar (rationale: reuse of the tested dev logic + zero drift via the
     shared `auth-paths.ts`); the in-Caddy Go module remains the convergence
     target.
   - The request-flow narrative (step 7, the "JWT → cookie" hop) attributes
     the cookie-plant + token-strip to "**Caddy's response handler on
     `/auth/*`**". Change the actor to the `auth-proxy` sidecar (Caddy just
     routes `/auth/*` to it); the contract — JS never sees the JWT, body
     arrives token-stripped — is unchanged.
2. In `docs/deployment.md`: replace the Caddyfile/compose pseudocode blocks
   with a pointer to the now-real `caddy/Caddyfile.prod` and
   `docker-compose.prod.yml` (kept in sync by this plan); fix
   `avatars:8080`→`sidecar:3001`; correct the "migrate.sh uses .env.prod
   automatically" line to describe the `.env`-sourcing reality + the
   loopback publish + host `psql` need; record the auth-proxy in the
   service list.
3. In `docs/gotrue-templates.md` "Production" section, replace the
   relative-path guidance with the internal-URL form and the rationale
   (avoids the cert-not-yet-issued OTP-fallback trap). While there, fix the
   stale line that says the production compose is "step 14's responsibility"
   — it's step 15 (this production-rollout plan), and the file now exists.

**Verify:** `git diff --stat docs/` (prose-only doc edits; cspell here is
editor-only, not a CI gate — confirm no editor squiggles on new terms)

## Phase 1 — auth-proxy sidecar (the cookie/JWT shim)

### [x] 1.1 Scaffold the `auth-proxy` package with a drift-guarded narrowing copy

**Created:** 2026-06-10T11:38:29Z
**Completed:** 2026-06-10T12:38:04Z

**Why:** The production shim is a new Node sidecar. Standing up its package
skeleton and the shared-narrowing copy (with a guard so it can't drift from
the canonical `auth-paths.ts`) is the foundation the shim logic builds on.

**Prerequisites:** None.

**Decisions:**
- Mirror `sidecar/`'s layout and `Dockerfile` style (multi-stage
  `node:20-alpine`, `corepack enable`, `pnpm install --frozen-lockfile`,
  `pnpm build` → `dist/`, runtime `CMD ["node","dist/server.js"]`).
  Listen on `PORT` (default `3002`).
- **Real lint, not a mirror.** `sidecar/` is currently *unlinted* (no
  eslint config, no `lint` script — an oversight), so there's nothing to
  copy. Give `auth-proxy` a flat `eslint.config.js` + a `lint` script
  (`eslint .`) + the eslint / typescript-eslint devDeps, modelled on
  `web/eslint.config.js`. Enable typed rules incl. `no-floating-promises` —
  load-bearing here, since the shim is async proxying and a dropped promise
  is exactly the bug class `pnpm lint` (not `pnpm check`) catches. The
  `sidecar/` lint gap is closed in the same pass — see Task 7.1.
- The narrowing lists must be the *same* as the web app's. Copy
  `web/src/lib/shared/model/auth-paths.ts` to
  `auth-proxy/src/lib/auth-paths.ts` and add a Vitest guard that imports
  both and asserts **every** exported array is deep-equal — currently five
  (`PUBLIC_AUTH_PATHS`, `SIGNED_IN_REDIRECT_PATHS`, `BEARER_AUTH_PATHS`,
  `COOKIE_PLANT_PATHS`, `LOGOUT_PATHS`); iterate the module's exports rather
  than hardcoding a count, so a *new* array added to the canonical file is
  caught too. (The proxy only reads three —
  `BEARER`/`COOKIE_PLANT`/`LOGOUT` — but copying the file verbatim and
  guarding all exports is simpler and more robust than maintaining a curated
  subset. Copy + guard chosen over a repo-root build context for the simpler
  Docker context.)
- Add a `/healthz` route returning 200 (for the compose healthcheck),
  copied from `sidecar/`.

**Files:**
- `auth-proxy/package.json` (create — incl. `lint` + `build`/`test` scripts)
- `auth-proxy/tsconfig.json` (create)
- `auth-proxy/eslint.config.js` (create — modelled on `web/eslint.config.js`)
- `auth-proxy/vitest.config.ts` (create)
- `auth-proxy/Dockerfile` (create)
- `auth-proxy/src/server.ts` (create)
- `auth-proxy/src/lib/auth-paths.ts` (create — copy of canonical)
- `auth-proxy/test/auth-paths-drift.test.ts` (create)
- `auth-proxy/pnpm-lock.yaml` (create — generated by the scaffolding `pnpm
  install`; commit it, as the Dockerfile + `check.sh` use `--frozen-lockfile`)

**Steps:**
1. RED — Write `auth-proxy/test/auth-paths-drift.test.ts` importing the
   canonical `../../web/src/lib/shared/model/auth-paths.ts` and the local
   `../src/lib/auth-paths.ts`, asserting **every** exported array is
   `toEqual` (iterate the module's array exports — don't hardcode the
   count). (If cross-package TS resolution is awkward in vitest, read
   both files with `fs` and compare the normalized export blocks instead.)
2. RED — Scaffold `package.json` (with `lint`/`build`/`test` scripts +
   eslint devDeps), `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`
   (mirroring `sidecar/`'s layout, plus the lint config `sidecar/` lacks);
   `cd auth-proxy && pnpm install`; run `pnpm test` and confirm it's red
   because `src/lib/auth-paths.ts` doesn't exist yet.
3. GREEN — Copy the canonical `auth-paths.ts` to
   `auth-proxy/src/lib/auth-paths.ts` (with a header comment naming the
   canonical source and the guard test). Add `src/server.ts` (`app.listen`)
   and a `/healthz` route. Re-run `pnpm test`; the drift guard is green.

**Verify:** `cd auth-proxy && pnpm install && pnpm test` · `pnpm lint`

**Notes:**
- **Drift guard uses the fs-text fallback**, not a cross-package import. The
  guard reads both files with `fs` and diffs the parsed `export const NAME =
  [...]` array declarations — this avoids cross-package TS resolution in both
  vitest *and* the typed ESLint config (importing the out-of-project canonical
  file would have tripped `no-floating-promises`'s `projectService`). It still
  catches a new/removed/changed array in either file; an anchor assertion pins
  the known five names so an empty-vs-empty parse can't masquerade as agreement.
- **Toolchain pinned to web's versions, not sidecar's** (eslint 10,
  typescript-eslint 8, typescript 6, vitest 4) since the eslint config is
  modelled on `web/eslint.config.js` and needs the typed-rules stack. `express`
  / `supertest` match sidecar.
- **Split `tsconfig.json` (lint/typecheck, `noEmit`, includes `test/`) from
  `tsconfig.build.json`** (emits `dist/`, `src/` only) so `projectService` lints
  the tests while `pnpm build` ships only runtime code.
- **Added `test/healthz.test.ts`** (not in the Files list) to exercise the
  `/healthz` route and justify the `supertest` devDep; mirrors `sidecar/`.
- **One justified `eslint-disable-next-line no-console`** on the startup banner
  in `server.ts` (same log `sidecar/` emits; sidecar is just unlinted today).
- Deferred to Task 1.2 as planned: `src/index.ts` currently only mounts
  `/healthz` — the shim middleware lands next.

### [x] 1.2 Implement the shim logic and its contract tests

**Created:** 2026-06-10T11:38:29Z
**Completed:** 2026-06-10T12:57:03Z

**Why:** This is the load-bearing piece — the production translation
between the HttpOnly `cairn_session` cookie and GoTrue's bearer/JSON, which
keeps the JWT out of the browser's JavaScript. It must behave identically
to the dev Vite proxy.

**Prerequisites:** Task 1.1 (package + `auth-paths.ts` copy + drift guard).

**Decisions:** Port `web/vite.config.ts` (~lines 30–176) into
`auth-proxy/src/index.ts`. Contract:
- **Request side:** strip any client-supplied `Authorization`. If the
  original path matches `BEARER_AUTH_PATHS` (`/auth/user`) and a
  `cairn_session` cookie is present, set `Authorization: Bearer <jwt>`.
  Anonymous endpoints (`/auth/magiclink`, `/auth/verify`, `/auth/token`)
  get **no** bearer. Strip `Accept-Encoding` upstream so GoTrue returns
  identity JSON (no gzip to parse — the top correctness pitfall). Forward
  the full `/auth/...` path for matching; strip the `/auth` prefix when
  calling `gotrue:9999` (mirror the dev `rewrite`).
- **Response side:** buffer the full GoTrue body. On `status === 200` and
  JSON content-type, if `access_token` is a string **and** the path
  matches `COOKIE_PLANT_PATHS` (`/auth/verify`, `/auth/token`),
  `appendHeader('set-cookie', 'cairn_session=<jwt>; Path=/; HttpOnly;
  SameSite=Lax; Max-Age=<json.expires_in ?? COOKIE_MAX_AGE>')` plus
  `Secure` iff `COOKIE_SECURE==='true'`. Always delete `access_token`/
  `refresh_token` from the body; drop upstream `Content-Length`/
  `Transfer-Encoding` and let Node recompute.
- **Redirects (prod-only path — the easy regression):** the GoTrue client
  must **not** follow redirects. In prod the magic-link email link is
  `{API_EXTERNAL_URL}/verify?…`, so clicking it routes
  `GET /auth/verify` → this proxy → GoTrue's `/verify`, which answers with a
  **302** carrying the tokens in the URL fragment; the browser must receive
  that 302 so it can land on `/auth/callback#…`. In *dev* the email link
  hits GoTrue's port directly and never traverses the shim, so the Vite
  proxy never exercises this — but `http-proxy` happens not to follow
  redirects, so the behaviour is correct there by accident. Replicate it
  deliberately: use raw `http.request` (no follow) or `fetch(…, {redirect:
  'manual'})`; pass 3xx through verbatim with `Location` intact and **no**
  body rewrite (the cookie-plant only fires on `200` JSON, so a 302 is
  untouched anyway).
- **Logout:** `DELETE` on `LOGOUT_PATHS` (`/auth/session`) → clear cookie
  (`Max-Age=0`, same attrs incl. `Secure` when prod) and `204`.
- Config via env: `GOTRUE_URL` (default `http://gotrue:9999`), `PORT`
  (3002), `COOKIE_SECURE`, `COOKIE_MAX_AGE` (default `604800`).

**Reference:** `docs/architecture.md` "JWT storage" for the narrowing
rationale and the `Secure`-prod-only rule.

**Files:**
- `auth-proxy/src/index.ts` (create)
- `auth-proxy/test/shim.test.ts` (create)

**Steps:**
1. RED — Write `auth-proxy/test/shim.test.ts` (stub GoTrue with a local
   HTTP server or a mock) asserting: (a) cookie planted only on
   `COOKIE_PLANT_PATHS`, not on `/auth/magiclink`; (b) `access_token`/
   `refresh_token` stripped from the forwarded body; (c) bearer attached
   only on `BEARER_AUTH_PATHS`, never on anonymous endpoints; (d) a
   client-supplied `Authorization` to `/auth/magiclink` is dropped;
   (e) `DELETE /auth/session` → 204 + clearing cookie; (f) `Secure`
   present iff `COOKIE_SECURE==='true'`; (g) a stubbed GoTrue `GET /verify`
   returning a `302` with a `Location` is forwarded **unfollowed** — the
   client sees the `302` and the `Location` verbatim, no body rewrite, no
   cookie planted. Run `pnpm test` — red.
2. GREEN — Implement `src/index.ts` per Decisions; wire it into
   `src/server.ts`. Re-run `pnpm test` — green.

**Verify:** `cd auth-proxy && pnpm test` · `pnpm lint`

**Notes:**
- **Implemented with global `fetch` + `redirect: 'manual'`** (the decision's
  fetch option, not raw `http.request`). undici auto-decompresses, so dropping
  `Accept-Encoding` upstream + stripping `content-encoding`/`content-length` on
  the way out yields identity JSON to parse. `getSetCookie()` is used to
  re-emit multiple upstream `Set-Cookie` headers individually (the comma-joining
  `Headers.forEach` would corrupt them).
- **`express.raw({ type: () => true })` mounted at `/auth`** buffers the request
  body for verbatim forwarding; mounting at `/auth` keeps `req.originalUrl` (the
  `/auth/...` shape the narrowing lists match) while `req.url` is already
  `/auth`-stripped for the upstream call — mirrors the dev `rewrite`. The shim
  lives in `src/index.ts`; `src/server.ts` was already wired to it in Task 1.1.
- **Side work — `tsconfig.build.json` needed an explicit `rootDir: "src"`.**
  Under TypeScript 6, `tsc` errored (TS5011) and emitted to `dist/src/…`, which
  would have broken the Dockerfile's `CMD ["node","dist/server.js"]`. Fixed so
  the build emits `dist/server.js`. Verified `pnpm build` produces the right
  layout (this is the prod-image path, beyond the task's stated Verify).
- **Type-safety fixes (no rule disables):** request body converted via
  `Uint8Array.from` to satisfy fetch's `BodyInit` typing; `expires_in` narrowed
  to `number` before stringifying (`no-base-to-string`); in the test, `res.body`
  and the `set-cookie` array are read through typed/`unknown`-narrowed locals,
  and a `capturedAuthHeader()` helper sidesteps TS narrowing `lastReq` to `null`
  after the mid-test reset.
- **`/auth/login|check|callback` are not handled here** — by design the prod
  Caddyfile (Task 4.1) only routes the GoTrue endpoints to this proxy and lets
  the SvelteKit client routes fall through to `web`, so the dev proxy's
  `PUBLIC_AUTH_PATHS` bypass has no analogue in the sidecar.
- cspell flagged a placeholder token in the test (editor-only, not a CI gate);
  renamed to a dotted `xxx.yyy.zzz` to keep the editor clean.

## Phase 2 — web container

### [x] 2.1 Add `web/Dockerfile` + `.dockerignore` (prod build drops dev-login)

**Created:** 2026-06-10T11:38:29Z
**Completed:** 2026-06-10T13:05:14Z

**Why:** The prod stack expects `build: ./web` — a container serving the
static SvelteKit bundle. It must build in production mode so the dev-login
shortcut and any `VITE_DEV_LOGIN_*` literal are absent from the shipped JS.

**Prerequisites:** None (independent of Phase 1).

**Decisions:**
- Two-stage, mirroring `sidecar/Dockerfile`: build stage `node:20-alpine`
  + `corepack enable` + `pnpm install --frozen-lockfile` + `pnpm build`
  (adapter-static → `/app/build`, includes
  `build/gotrue/templates/magic_link.html`); runtime stage
  `caddy:2.9.1-alpine` serving `/srv` on `:80` with a one-line SPA fallback
  (`try_files {path} /index.html`, `file_server`, `encode gzip`).
- `ENV NODE_ENV=production` before `pnpm build` so `import.meta.env.DEV`
  folds to `false` and the `DevShortcuts.svelte` dynamic import becomes
  dead code (plan 0301). Do not set any `VITE_DEV_LOGIN_*` in the build
  stage.
- New `web/.dockerignore` excludes `.env`, `.env.*`, `node_modules`,
  `build`, `.svelte-kit`, `e2e`, `test-results` so a developer's populated
  `web/.env` can never enter the build context.

**Reference:** `docs/deployment.md` "Auth surface: pre-deploy checklist"
(the bundle-grep watch).

**Files:**
- `web/Dockerfile` (create)
- `web/.dockerignore` (create)

**Steps:**
1. GREEN — Write `web/.dockerignore` and `web/Dockerfile` per Decisions.
2. Verify the prod build is clean: `docker build -t cairn-web-test web/`
   (or `cd web && NODE_ENV=production pnpm build`), then
   `grep -r -e cairn-dev -e alice@example.test web/build/_app/immutable/`
   returns **nothing**. Confirm `web/build/gotrue/templates/magic_link.html`
   exists in the fresh build.

**Verify:** `docker build -t cairn-web-test web/` ·
`grep -rL cairn-dev web/build/_app/immutable >/dev/null; ! grep -rq -e cairn-dev -e alice@example.test web/build/_app/immutable/`

## Phase 3 — compose restructure + production compose

### [x] 3.1 Restructure compose: prod-safe base + auto-loaded dev override

**Created:** 2026-06-10T13:55:00Z
**Completed:** 2026-06-10T13:09:21Z

**Notes:** Merged dev config is identical to the pre-refactor baseline
except for the *order* of caddy's two volume mounts (`avatars` now lists
before `Caddyfile` because the base mount precedes the override's) — both
mounts present, distinct targets, no behavioural change. Compose merges
`volumes` by appending across `-f` files, so this ordering can't be made
byte-identical without moving the Caddyfile mount back into the base, which
would defeat the split.

**Why:** Docker Compose **concatenates** `ports` lists (and merges
`depends_on` maps) across `-f` files, so a prod override *cannot* unexpose a
service by setting `ports: []` — it's a silent no-op, and Postgres,
PostgREST, and GoTrue would stay published on `0.0.0.0` in prod (ufw doesn't
contain Docker-published ports — they bypass its `INPUT` filter). Rather than
fight the merge with `!override`/`!reset` tags (which leave the *unsafe*
state as the default if mistyped or forgotten on a future service), make the
base publish **nothing** and move every dev-only bit into an auto-loaded dev
override. Then the safe state is the default, the deploy command is
unchanged, and the `depends_on` merge problem disappears.

**Prerequisites:** None (independent of Phases 1–2; pure compose refactor).

**Decisions:**
- **`docker-compose.yml` becomes the prod-safe base.** Remove **every**
  published `ports:` mapping (postgres `5432:5432`, postgrest `3000:3000`,
  gotrue `9999:9999`, caddy `8080:80`, mailpit `8025`/`1025`) — containers
  reach each other by service name on the internal network, so no `ports`
  (and no `expose`) is needed. Set `gotrue.depends_on` to `{postgres:
  {condition: service_healthy}}` **only** (drop `mailpit`/`static`). Remove
  the dev-only GoTrue env keys (`GOTRUE_SITE_URL`, `GOTRUE_URI_ALLOW_LIST`,
  `API_EXTERNAL_URL`, `GOTRUE_DISABLE_SIGNUP`, `GOTRUE_MAILER_AUTOCONFIRM`,
  `GOTRUE_SMTP_*`, `GOTRUE_MAILER_TEMPLATES_MAGIC_LINK`) — they're set per
  environment in the overlays; keep the common keys (`GOTRUE_API_HOST/PORT`,
  `GOTRUE_DB_*`, `GOTRUE_JWT_*`, `GOTRUE_EXTERNAL_EMAIL_ENABLED`,
  `GOTRUE_JWT_DEFAULT_GROUP_NAME`). Remove the `static` and `mailpit` service
  definitions and the dev `caddy` Caddyfile mount from the base; leave caddy
  with just `image` + the `avatars:/srv/cairn/avatars:ro` volume (its
  Caddyfile + ports come from each overlay — `volumes` merge by target, so
  the mount replaces cleanly).
- **New `docker-compose.override.yml` (auto-loaded in dev) restores today's
  dev stack exactly.** It re-adds: the published ports (`postgres
  5432:5432`, `postgrest 3000:3000`, `gotrue 9999:9999`, `caddy 8080:80`);
  the `static` (nginx, mounts `./web/static`) and `mailpit` (`8025`/`1025`)
  services; gotrue's dev env (`GOTRUE_SITE_URL=http://localhost:5173`,
  `GOTRUE_URI_ALLOW_LIST=http://localhost:5173`,
  `API_EXTERNAL_URL=http://localhost:9999`, `GOTRUE_DISABLE_SIGNUP=false`,
  `GOTRUE_MAILER_AUTOCONFIRM=true`, `GOTRUE_SMTP_HOST=mailpit`,
  `GOTRUE_SMTP_PORT=1025`, `GOTRUE_SMTP_ADMIN_EMAIL=dev@cairn.local`,
  `GOTRUE_SMTP_SENDER_NAME=Cairn`,
  `GOTRUE_MAILER_TEMPLATES_MAGIC_LINK=http://static/gotrue/templates/magic_link.html`);
  gotrue's dev `depends_on` (adds `mailpit`/`static` — merges onto the base's
  `postgres`); and the dev `caddy` mount `./caddy/Caddyfile:/etc/caddy/Caddyfile:ro`.
  This is a pure move — copy the removed values here verbatim.
- Dev is unchanged: a bare `docker compose up` auto-loads
  `docker-compose.override.yml`. Prod (Task 3.2) is invoked with explicit
  `-f docker-compose.yml -f docker-compose.prod.yml`, which does **not**
  auto-load the override.

**Reference:** `docker-compose.yml` (the file being split — move values, don't
re-derive them).

**Files:**
- `docker-compose.yml` (modify — strip dev-only bits + all published ports)
- `docker-compose.override.yml` (create — the dev overlay)

**Steps:**
1. Capture the current merged dev config as a baseline:
   `POSTGRES_PASSWORD=x AUTHENTICATOR_PASSWORD=x GOTRUE_PASSWORD=x JWT_SECRET=x
   docker compose config > /tmp/dev-before.yml`.
2. GREEN — Move the dev-only bits out of `docker-compose.yml` into
   `docker-compose.override.yml` per Decisions.
3. Confirm dev is byte-for-byte unchanged: re-run `docker compose config`
   (bare, auto-loads the override) and diff against `/tmp/dev-before.yml` —
   expect no meaningful difference (services, ports, env all present).
4. Confirm the **base alone** is safe: `docker compose -f docker-compose.yml
   config` shows **no** `published:` ports on any service, no `static`/`mailpit`,
   and `gotrue.depends_on` is `postgres` only.

**Verify:** `POSTGRES_PASSWORD=x AUTHENTICATOR_PASSWORD=x GOTRUE_PASSWORD=x JWT_SECRET=x docker compose config >/dev/null` (dev still valid) · `docker compose -f docker-compose.yml config 2>/dev/null | grep -c 'published:'` returns `0`

### [ ] 3.2 Add `docker-compose.prod.yml`

**Created:** 2026-06-10T13:55:00Z
**Completed:**

**Why:** With the base now publishing nothing (Task 3.1), the prod override
adds only what production needs: Caddy's public ports + prod Caddyfile, a
loopback Postgres publish for `migrate.sh`, the `web` and `auth-proxy`
services, and the prod GoTrue config. No `!override`/`!reset` tags and no
`profiles` gymnastics are required, because the dev-only services and ports
live in `docker-compose.override.yml`, which prod never loads.

**Prerequisites:** Task 3.1 (prod-safe base + dev override), Task 1.1/1.2
(`auth-proxy` exists), Task 2.1 (`web` Dockerfile exists).

**Decisions:**
- `restart: unless-stopped` throughout. No `ports:` keys on internal
  services (the base already publishes none — nothing to clear).
- **postgres:** `ports: ["127.0.0.1:5432:5432"]` (loopback-only) so
  `migrate.sh` reaches `localhost:5432`. This is the *only* published port
  besides Caddy's, and it's bound to loopback so it isn't internet-reachable
  even though Docker bypasses ufw.
- **gotrue env (prod):** `GOTRUE_SITE_URL=https://cairn.${DOMAIN}`,
  `GOTRUE_URI_ALLOW_LIST=https://cairn.${DOMAIN}/auth/callback`,
  `API_EXTERNAL_URL=https://cairn.${DOMAIN}/auth`,
  `GOTRUE_DISABLE_SIGNUP=${DISABLE_SIGNUP:-true}` (safe default; `.env.prod`
  opens it), `GOTRUE_MAILER_AUTOCONFIRM=false`, SMTP from `.env.prod`,
  `GOTRUE_MAILER_TEMPLATES_MAGIC_LINK=http://web/gotrue/templates/magic_link.html`
  (internal URL — avoids the cert-not-issued OTP fallback). No `depends_on`
  override is needed: the base's `gotrue.depends_on` is already `[postgres]`.
- **auth-proxy:** `build: ./auth-proxy`, env `GOTRUE_URL=http://gotrue:9999`,
  `PORT=3002`, `COOKIE_SECURE=true`, `COOKIE_MAX_AGE=604800`; healthcheck on
  `/healthz`; `depends_on: [gotrue]`.
- **web:** `build: ./web`, `depends_on: [postgrest]`. (GoTrue fetches its
  template from `http://web/...` at send time; the deploy smoke test confirms
  reachability before the first email, Task 8.1.)
- **sidecar:** keep the name `sidecar` and port `3001` (the named `avatars`
  volume stays).
- **caddy:** `ports: ["80:80","443:443"]`, mount `./caddy/Caddyfile.prod`
  RO, the `avatars` volume RO, `caddy_data`/`caddy_config` volumes, env
  `DOMAIN`.

**Files:**
- `docker-compose.prod.yml` (create)

**Steps:**
1. GREEN — Write `docker-compose.prod.yml` per Decisions.
2. Validate the merged prod config and that no dev-only thing leaks in:
   `DOMAIN=lynnscape.eu DISABLE_SIGNUP=false JWT_SECRET=x POSTGRES_PASSWORD=x
   AUTHENTICATOR_PASSWORD=x GOTRUE_PASSWORD=x SMTP_HOST=x SMTP_PORT=587
   SMTP_USER=x SMTP_PASS=x SMTP_FROM=x docker compose -f docker-compose.yml
   -f docker-compose.prod.yml config` — confirm `static`/`mailpit` are
   absent, the only `published:` ports are caddy `80`/`443` and postgres
   `127.0.0.1:5432`, gotrue env is the prod set, and `web`/`auth-proxy` are
   present.

**Verify:** `DOMAIN=lynnscape.eu DISABLE_SIGNUP=false JWT_SECRET=x POSTGRES_PASSWORD=x AUTHENTICATOR_PASSWORD=x GOTRUE_PASSWORD=x SMTP_HOST=x SMTP_PORT=587 SMTP_USER=x SMTP_PASS=x SMTP_FROM=x docker compose -f docker-compose.yml -f docker-compose.prod.yml config >/dev/null`

## Phase 4 — production Caddyfile

### [ ] 4.1 Add `caddy/Caddyfile.prod`

**Created:** 2026-06-10T11:38:29Z
**Completed:**

**Why:** The production reverse proxy: automatic TLS, security headers, and
the path routing + the stock cookie→bearer halves of the shim. The
auth-proxy handles the response-side cookie plant; Caddy just routes to it.

**Prerequisites:** Task 3.2 (service names defined: `web`, `postgrest`,
`gotrue`, `sidecar`, `auth-proxy`).

**Decisions:**
- **Prefix-stripping is asymmetric — pin it explicitly.** `/api/*` uses
  `handle_path` (strips `/api`, because PostgREST expects the bare path,
  mirroring the dev Vite `rewrite`). `/auth/*` and `/avatars*` use plain
  `reverse_proxy` with **no** strip: the auth-proxy matches against
  `/auth/…`-shaped lists (`BEARER_AUTH_PATHS=/auth/user`,
  `COOKIE_PLANT_PATHS=/auth/{verify,token}`) and strips `/auth` itself before
  calling GoTrue — if Caddy strips it first, `isSegmentMatch` sees `/verify`
  and silently fails (cookie-plant + bearer-narrowing break, the subtlest
  prod-only failure); the sidecar routes on the `/avatars` prefix, so that
  must survive too. (The doc's old pseudocode used `handle_path /auth/*` —
  do **not** copy that.)
- Site `cairn.{$DOMAIN}` (real hostname, not `:80`) so Caddy gets a
  Let's Encrypt cert via ACME automatically; cert persists in `caddy_data`.
- Headers: HSTS (`max-age=31536000; includeSubDomains`),
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`;
  `encode gzip`.
- `/api/*` → `postgrest:3000` with the stock cookie→bearer translation
  (`header_regexp Cookie cairn_session=([^;]+)` → `request_header
  Authorization "Bearer {http.regexp.1}"`).
- `/auth/*` routing must be an **explicit allow-list** of the GoTrue
  endpoints (`/auth/magiclink* /auth/verify* /auth/token* /auth/user*
  /auth/session*`) → `reverse_proxy auth-proxy:3002`, so the SvelteKit
  client routes `/auth/login|check|callback` fall through to `web`. A
  blanket `handle_path /auth/*` would break the callback page — the
  subtlest prod-only failure.
- `GET /avatars/*.webp` → `file_server` (avatars volume, `Cache-Control:
  public, max-age=31536000, immutable`); `POST/DELETE /avatars*` →
  `sidecar:3001` with the same cookie→bearer translation.
- Everything else (incl. `/gotrue/templates/*`) → `web:80`.

**Files:**
- `caddy/Caddyfile.prod` (create)

**Steps:**
1. GREEN — Write `caddy/Caddyfile.prod` per Decisions.
2. Validate syntax without issuing a cert:
   `docker run --rm -e DOMAIN=lynnscape.eu -v
   "$PWD/caddy/Caddyfile.prod:/etc/caddy/Caddyfile:ro" caddy:2.9.1 caddy
   validate --config /etc/caddy/Caddyfile`.

**Verify:** `docker run --rm -e DOMAIN=lynnscape.eu -v "$PWD/caddy/Caddyfile.prod:/etc/caddy/Caddyfile:ro" caddy:2.9.1 caddy validate --config /etc/caddy/Caddyfile`

## Phase 5 — secrets template

### [ ] 5.1 Add `.env.prod.example`

**Created:** 2026-06-10T11:38:29Z
**Completed:**

**Why:** The real `.env.prod` is created on the VPS and never committed; a
committed template documents every variable and how to generate secrets,
so the deploy is reproducible and nothing is forgotten.

**Prerequisites:** Task 3.2 (the prod compose defines which vars are read).

**Decisions:** Enumerate every variable the prod compose + `migrate.sh`
read, with a header note to generate secrets via `openssl rand -hex 32`
and store `.env.prod` in a password manager. Keys: `POSTGRES_PASSWORD`,
`AUTHENTICATOR_PASSWORD`, `GOTRUE_PASSWORD`, `JWT_SECRET` (≥32 bytes,
identical for GoTrue + PostgREST), `DOMAIN=lynnscape.eu`,
`SMTP_HOST=mail.gandi.net`, `SMTP_PORT=587`,
`SMTP_USER=no-reply@lynnscape.eu`, `SMTP_PASS=`,
`SMTP_FROM=no-reply@lynnscape.eu`, `DISABLE_SIGNUP=false` (with a comment:
prototype-only; flip to `true`/remove before public launch), and a
commented `# MIGRATE_AUTH_USERS_TIMEOUT=120`. No `VITE_*` vars.
- **`.gitignore` must be widened or the template can't be committed.** The
  current rules are `.env` / `.env.*` / `!.env.example`. `.env.prod.example`
  matches `.env.*`, and the negation un-ignores **only** the exact file
  `.env.example` — so `.env.prod.example` stays ignored, and `git add`
  silently skips it (no error). Broaden the negation to `!.env*.example` so
  any `.env.<x>.example` template is committable.

**Files:**
- `.env.prod.example` (create)
- `.gitignore` (modify — broaden the example-file negation)

**Steps:**
1. GREEN — In `.gitignore`, replace `!.env.example` with `!.env*.example`.
2. GREEN — Write `.env.prod.example` per Decisions.
3. Confirm the real secret file is still ignored but the template is now
   tracked: `git check-ignore .env.prod` exits `0` (ignored), while
   `git check-ignore .env.prod.example` exits `1` (not ignored), and
   `git status` shows `.env.prod.example` as a new untracked file.

**Verify:** `git check-ignore .env.prod && ! git check-ignore .env.prod.example`

## Phase 6 — imprint stub

### [ ] 6.1 Add a minimal imprint route, a discreet link, and tests

**Created:** 2026-06-10T11:38:29Z
**Completed:**

**Why:** A closed prototype on a publicly-resolvable domain warrants a
minimal operator/contact page (German DDG §5 minimum) as cheap insurance if
the URL leaks. Not the full step-14 legal surface.

**Prerequisites:** None.

**Decisions:**
- First inspect `web/src/routes/` and follow the existing routing
  convention (route groups, layout); add an imprint route accordingly
  (likely `web/src/routes/imprint/+page.svelte`). Build with existing
  layout primitives (top-bar/back per `docs/ui.md`).
- Content: operator name, postal address, contact e-mail — shipped as
  **clearly-marked placeholders** the operator replaces with real details
  before showing the URL (a deploy gate, R9). British English copy.
- Add a discreet link to the imprint from the login-screen footer and/or
  Settings (follow whichever pattern the app already uses for secondary
  links). Watch cross-task toolchain coupling: navigate with SvelteKit's
  `resolve()`/route-id form, not a bare string, so `svelte-check` and
  `svelte/no-navigation-without-resolve` stay green.
- Route-level test drops the `+`: `web/src/routes/imprint/page.test.ts`.
  Include `pnpm check` in Verify to catch the `+page.test.ts` trap.

**Reference:** `docs/frontend-layout.md` "Filename conventions";
`docs/ui.md` for TopBar/back patterns.

**Files:**
- `web/src/routes/imprint/+page.svelte` (create — confirm path vs routing convention)
- `web/src/routes/imprint/page.test.ts` (create)
- Login footer / Settings component (modify — add the link)

**Steps:**
1. RED — Write `page.test.ts` asserting the imprint renders the operator
   name, address, and a contact e-mail line. Run `pnpm test` — red.
2. GREEN — Create the `+page.svelte` per Decisions; re-run `pnpm test` —
   green.
3. GREEN — Add the discreet imprint link; add a Playwright touch in
   `web/e2e/` (route loads, shows the contact line).

**Verify:** `cd web && pnpm test` · `pnpm check` · `pnpm lint` ·
`pnpm test:e2e` (imprint touch)

## Phase 7 — CI wiring

### [ ] 7.1 Lint both Node sidecars and wire them into `scripts/check.sh`

**Created:** 2026-06-10T13:55:00Z
**Completed:**

**Why:** The new `auth-proxy` package has its own lint/test that must run in
the project-wide quality gate so a shim regression (or an `auth-paths.ts`
drift) fails `check.sh`. **Note the existing reality:** `check.sh` runs the
`sidecar/` package with install + test **only — no lint** (sidecar has no
ESLint config or `lint` script). That was an oversight; close it in the same
pass so both Node sidecars share one bar, rather than adding a gate to
`auth-proxy` alone.

**Prerequisites:** Task 1.1/1.2 (`auth-proxy` package exists with its
`eslint.config.js`, `lint` script, and tests).

**Decisions:**
- Read `scripts/check.sh` first: today it does `cd web && pnpm lint`, then
  later `cd sidecar && pnpm install --frozen-lockfile` + `cd sidecar &&
  pnpm test`. There is **no** sidecar lint to "mirror".
- Retrofit `sidecar/` with lint: add `eslint.config.js` + a `lint` script
  (`eslint .`) + the eslint / typescript-eslint devDeps (model on
  `web/eslint.config.js` / the new `auth-proxy/eslint.config.js`), then fix
  any issues the first `pnpm lint` surfaces in the existing sidecar source
  until it's clean (no rule disables to force it through).
- Wire both packages into `check.sh`: add a `cd sidecar && pnpm lint` step,
  and an `auth-proxy` block doing install (frozen) + **format:check** + lint +
  test, keeping the ordering and `ok`/`fail` output style consistent with the
  existing blocks.
- **`auth-proxy` already has Prettier** (its own `.prettierrc` mirroring
  `web/`'s, plus `format`/`format:check` scripts — added when the package was
  scaffolded). Run `cd auth-proxy && pnpm format:check` in the `check.sh`
  block so CI enforces formatting, not just the `prettier-auth-proxy`
  pre-commit hook. (`sidecar/` has no Prettier config, so there's no sidecar
  `format:check` to add here — its retrofit in this task is ESLint only.)

**Files:**
- `scripts/check.sh` (modify)
- `sidecar/eslint.config.js` (create)
- `sidecar/package.json` (modify — add `lint` script + eslint devDeps)
- `sidecar/src/*.ts` (modify — only if `pnpm lint` reports issues)

**Steps:**
1. GREEN — Add ESLint to `sidecar/` (config + `lint` script + devDeps);
   `cd sidecar && pnpm install && pnpm lint`; fix any reported issues until
   green.
2. GREEN — In `scripts/check.sh`, add `cd sidecar && pnpm lint` and an
   `auth-proxy` install/format:check/lint/test block alongside the existing
   sidecar block.
3. Run `./scripts/check.sh` and confirm it now lints **and** tests both
   `sidecar` and `auth-proxy` and is green end-to-end.

**Verify:** `./scripts/check.sh`

## Phase 8 — deploy + smoke test

### [ ] 8.1 Deploy to the box and verify the prototype end-to-end

**Created:** 2026-06-10T11:38:29Z
**Completed:**

**Why:** The point of the plan — get the prototype live at
`https://cairn.lynnscape.eu` and prove the full sign-in → use path works
with real e-mail and TLS. Operational; run with the user.

**Prerequisites:** Tasks 1–7 merged (all artifacts exist and CI is green).

**Decisions:**
- Deploy sequence on the box (user `cairn`, repo at `/home/cairn/cairn`):
  ```bash
  git clone <repo> /home/cairn/cairn && cd /home/cairn/cairn
  cp .env.prod.example .env.prod && $EDITOR .env.prod   # real secrets; DISABLE_SIGNUP=false
  ln -s .env.prod .env                                   # migrate.sh sources .env
  sudo apt install -y postgresql-client                  # migrate.sh uses host psql
  docker compose -f docker-compose.yml -f docker-compose.prod.yml \
    --env-file .env.prod up -d --build
  ./scripts/migrate.sh                                   # uses .env → .env.prod
  ```
- Ordering hazards: `migrate.sh` needs `localhost:5432` (loopback publish,
  Task 3.1) + host `psql`; bump `MIGRATE_AUTH_USERS_TIMEOUT=120` on the cold
  box; ACME needs `:80` + DNS (both already true); don't send the first
  magic link until Caddy has a valid cert — but the internal template URL
  means the email is link-only regardless.
- Fill the imprint's real operator details before sharing the URL.

**Files:** None (operational; no repo changes).

**Steps:**
1. Run the deploy sequence above.
2. Confirm TLS: `https://cairn.lynnscape.eu` loads with a valid Let's
   Encrypt cert (`docker compose logs caddy` shows successful ACME).
3. Confirm the template is reachable internally:
   `docker compose exec gotrue wget -qO-
   http://web/gotrue/templates/magic_link.html`.
4. Sign in with a real e-mail → the magic-link email arrives from
   `no-reply@lynnscape.eu`, contains the link, and has **no** six-digit
   code. Click it → land signed in.
5. Create a list → add an item → vote (±1/±3 clamp). Upload an avatar.
6. With a second account, exercise the invite/circle flow end-to-end.

**Verify:** `https://cairn.lynnscape.eu` reachable with valid TLS · a real
magic-link sign-in completes · create/vote/avatar/invite all work · no
six-digit code in the email
