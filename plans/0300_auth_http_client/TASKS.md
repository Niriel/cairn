# Tasks

## Reference skills and docs

- **`.claude/skills/writing-tests.md`** — `data-test` via `render.ts`; hybrid `__mocks__/`; runes-idiom mocks; no shared `beforeEach`; MSW at the network layer. Fires whenever a `*.test.ts` is being edited.
- **`.claude/skills/writing-tasks.md`** — TDD ordering and self-contained tasks (this file's format).
- **`docs/architecture.md`** — auth flow (`:122-150`), request flow (`:212-232`), client-side storage table (`:248-258`).
- **`docs/ui.md`** — back-stack rules (`:137-153`) — the callback page MUST use `goto(..., { replaceState: true })`.
- **`docs/frontend-layout.md`** — `shared/` cannot import from `auth/` (line 41-43); session store and PostgREST wrapper therefore live in `shared/`.
- **`docs/data-model.md`** — `tg_profile_on_signup` body (`:620`) and why `display_name` starts at `'New user'`.
- **`docs/testing.md`** — three-layer pyramid; auth journey is the Playwright auth happy-path (`:179`).
- **`design/cairn-screens.jsx`** — `LoginRequest` (lines 120-174) and `LoginCheck` (lines 177-212).
- **`web/src/lib/test/render.ts`** — the `getByDataTest` / `queryByDataTest` / `getAllByDataTest` helpers every component test imports.

## Phase 1 — Backend wiring (GoTrue + seed + Vite proxy)

Phase 1 lands the infrastructure that the rest of the plan plugs into: GoTrue env edits, seed flow, Vite proxy split, logout middleware. After this phase, an ad-hoc `curl` against `/auth/otp` and `/auth/verify` through the dev server works end-to-end (cookie planted), and `./scripts/seed.sh` is idempotent. No UI yet.

### [x] 1.1 Add `GOTRUE_MAILER_URLPATHS_MAGICLINK` and bump `GOTRUE_JWT_EXP` in `docker-compose.yml`

**Created:** 2026-05-13T12:11:12Z
**Completed:** 2026-05-18T07:56:19Z

**Why:** GoTrue's default mailer URL path is `/auth/v1/verify`, which 404s through our proxy. The magic-link email's `<a href>` must point at the SvelteKit `/auth/callback` route this plan introduces. Separately, the default 1-hour JWT expiry is too short for the cookie Max-Age to be useful; bumping to 7 days (`604800` seconds) keeps dev sessions alive across a day's work and is what `docs/architecture.md`'s cookie inventory commits to.

**Prerequisites:** None.

**Decisions:**
- Add `GOTRUE_MAILER_URLPATHS_MAGICLINK: /auth/callback` to the `gotrue` service environment in `docker-compose.yml` (around line 36-60).
- Add (or modify) `GOTRUE_JWT_EXP: "604800"` (note the quotes — GoTrue's envconfig wants the string form for numeric values). The existing setting at `:48` is `GOTRUE_JWT_EXP: "3600"` — change in place.
- Restart GoTrue: `docker compose up -d gotrue --force-recreate`.
- Verify the link URL by triggering a manual magic-link POST after Phase 1.4 completes — for now, the env edit is the unit of work.

**Files:**
- `docker-compose.yml` (modify)

**Steps:**
1. GREEN — Edit `docker-compose.yml`: change `GOTRUE_JWT_EXP` from `"3600"` to `"604800"`; add `GOTRUE_MAILER_URLPATHS_MAGICLINK: /auth/callback`.
2. GREEN — `docker compose up -d gotrue --force-recreate`. Wait ~3s.
3. GREEN — Confirm with `docker inspect $(docker compose ps -q gotrue) --format '{{range .Config.Env}}{{println .}}{{end}}'` and visually verify the two env vars carry the new values. (Avoid `docker compose exec gotrue env | grep …` — the `supabase/gotrue` image is a minimal base and may not include `grep` in PATH; the host-side `docker inspect` reads from the daemon's container config and doesn't depend on the container's userland.)

**Verify:** `docker inspect $(docker compose ps -q gotrue) --format '{{range .Config.Env}}{{println .}}{{end}}'` shows `GOTRUE_JWT_EXP=604800` and `GOTRUE_MAILER_URLPATHS_MAGICLINK=/auth/callback` in the output.

### [x] 1.2 Drive seed signups against GoTrue from `scripts/seed.sh`

**Created:** 2026-05-13T12:11:12Z
**Completed:** 2026-05-18T08:09:20Z

**Why:** The dev login shortcut and Step 4 dogfooding both need Alice/Bob/Carol to exist as real `auth.users` rows. We deliberately can't insert into `auth.users` directly (`db/seed/dev_seed.sql:9-13` documents why). Driving signups through GoTrue's HTTP endpoint lets it satisfy its own NOT NULL columns, and `tg_profile_on_signup` synchronously creates the matching `profiles` + `user_settings` rows.

**Prerequisites:** Task 1.1 (the JWT exp bump is unrelated, but the new mailer path means signups must hit the alternate endpoint that doesn't email — `/signup` with autoconfirm, not `/magiclink`).

**Decisions:**
- Three seed users, emails `alice@example.test`, `bob@example.test`, `carol@example.test`. Password for all: `cairn-dev`. The choice of `.test` TLD is deliberate (reserved by RFC 2606, will never collide with a real domain).
- The seed script polls `curl -sf http://localhost:9999/health` (or `/settings`) until 200 before issuing signups — GoTrue takes a moment to come up after `docker compose up -d`.
- Each `POST /signup` is issued via `curl`; HTTP 200 or 201 → created, 422 → already-registered, anything else → fail loudly.
- `GOTRUE_MAILER_AUTOCONFIRM: "true"` is already set (`docker-compose.yml:51` area). So `/signup` does NOT send a confirmation email, keeping Mailpit clean.
- The seed runs the SQL UPDATE step (Task 1.3) immediately after the signup loop, in the same `seed.sh` invocation. That step is a separate task only because the SQL changes live in `dev_seed.sql`.

**Reference:** `docs/development.md` for the dev-shortcut narrative the seed must satisfy.

**Files:**
- `scripts/seed.sh` (modify)

**Steps:**
1. RED — From the repo root, run `./scripts/seed.sh`. Confirm it currently runs the `psql -f db/seed/dev_seed.sql` line and does nothing else.
2. GREEN — Add a `wait_for_gotrue` block to `scripts/seed.sh` that polls `curl -sf http://localhost:9999/health` with a 30s timeout. Fail loudly on timeout.
3. GREEN — Add a signup loop. Define three `email|name` pairs; for each, POST to `http://localhost:9999/signup` with `{"email":"…","password":"cairn-dev"}` (JSON body, `Content-Type: application/json`). Branch on the HTTP status code: 200/201 print "created", 422 print "exists", anything else exits non-zero.
4. GREEN — Keep the existing `psql -f db/seed/dev_seed.sql` line; it runs after the signup loop.
5. GREEN — Run `./scripts/seed.sh` twice. First run prints three "created"; second run prints three "exists". Both exit 0.
6. GREEN — Confirm `docker compose exec postgres psql -U cairn -d cairn -c "SELECT email FROM auth.users ORDER BY email"` lists the three test emails (plus any pre-existing rows).

**Verify:** `./scripts/seed.sh` (exits 0) · re-run `./scripts/seed.sh` (still exits 0, prints "exists" lines) · `docker compose exec postgres psql -U cairn -d cairn -c "SELECT count(*) FROM auth.users WHERE email LIKE '%@example.test'"` (returns 3).

### [x] 1.3 Rewrite `db/seed/dev_seed.sql` to UPDATE `display_name` for the three seed users

**Created:** 2026-05-13T12:11:12Z
**Completed:** 2026-05-18T08:16:14Z

**Notes:**
- The exact `UPDATE … WHERE id = (SELECT id FROM auth.users WHERE email = '…')` snippet in the task's step 2 trips sqlfluff's `LT14 keyword_newline` rule (inner `WHERE` shares a line with the subquery's `SELECT … FROM`). Auto-fixed by `sqlfluff fix` — the subquery is now wrapped onto its own lines. Semantically identical.

**Why:** `tg_profile_on_signup` seeds every signup with `display_name = 'New user'`. The dev shortcut and Step 4 dogfooding need the three seed users to render as Alice/Bob/Carol. We can't override the trigger output at signup time (its body is fixed and intentional — see `docs/data-model.md:620` for why), so the seed updates the three rows after the fact.

**Prerequisites:** Task 1.2 (signups must have run so the rows exist).

**Decisions:**
- The UPDATE statements key on `auth.users.email` (the join column) and write to `public.profiles.display_name`. Each statement targets exactly one row; if the matching auth user is missing, the UPDATE is a no-op (0 rows affected), which is the right idempotent behaviour.
- The seed runs as the `cairn` superuser (`scripts/seed.sh:14`), so RLS doesn't apply — the UPDATEs go through directly.
- The committed dev password `cairn-dev` is mentioned in a comment so anyone reading the file knows the GoTrue side without leaving the file.

**Reference:** `db/migrations/0004_domain_schema.sql:272` for the trigger that seeds `display_name = 'New user'`.

**Files:**
- `db/seed/dev_seed.sql` (modify)

**Steps:**
1. RED — `docker compose exec postgres psql -U cairn -d cairn -c "SELECT display_name FROM public.profiles WHERE id IN (SELECT id FROM auth.users WHERE email LIKE '%@example.test')"`. All three show `New user` — that's the placeholder the trigger writes.
2. GREEN — Replace the body of `db/seed/dev_seed.sql` (currently a comment block) with three idempotent `UPDATE` statements:
   ```sql
   UPDATE public.profiles
   SET display_name = 'Alice'
   WHERE id = (SELECT id FROM auth.users WHERE email = 'alice@example.test');
   ```
   Repeat for Bob and Carol with their emails.
3. GREEN — Keep the file's comment header explaining the dev-only nature; replace the "intentionally empty" paragraph with one that explains the signup-then-UPDATE design and notes the dev password `cairn-dev`.
4. GREEN — `./scripts/seed.sh`. Confirm exit 0.
5. GREEN — Re-run the SELECT from step 1; the three rows now show `Alice`, `Bob`, `Carol`.

**Verify:** `docker compose exec postgres psql -U cairn -d cairn -c "SELECT email, display_name FROM auth.users JOIN public.profiles ON auth.users.id = public.profiles.id WHERE email LIKE '%@example.test' ORDER BY email"` returns the three users with their proper names.

### [x] 1.4 Land segment-anchored auth-path predicates and split the Vite `/auth` proxy

**Created:** 2026-05-13T12:11:12Z
**Completed:** 2026-05-18T08:27:55Z

**Notes:**
- Pre-existing shfmt failure on `scripts/seed.sh` (case-indent under `-ci`) surfaces when running `./scripts/check.sh` — committed in 1.2 (`c75910c`). Out of scope for this task; flagging for the user to address (trivially fixable with `shfmt -w -i 2 -ci -bn scripts/seed.sh`).
- Empirical reality differs slightly from the Decisions text: today's `supabase/gotrue:v2.158.1` *does* emit its own `sb-access-token`/`sb-refresh-token` cookies on `/auth/signup` and `/auth/token` (the Decision called this "latent"). With `appendHeader('set-cookie', ...)` these upstream cookies are now forwarded to the browser instead of being clobbered by `setHeader`. Functionally inert in dev because GoTrue marks them `Secure` and browsers reject `Secure` cookies over `http://localhost`; and `HttpOnly` keeps them out of JS. Not a regression — the previous `setHeader` silently dropped them — but worth knowing for prod (Caddy is the prod cookie-translator anyway, so this path doesn't run there).

**Why:** The magic-link email's `<a href>` points at `http://localhost:5173/auth/callback?token=...` (Task 1.1). Today's `/auth` proxy in `web/vite.config.ts` forwards every `/auth/*` request to GoTrue, so the browser hitting `/auth/callback` would 404. The fix is to let SvelteKit serve the page routes (`/auth/login`, `/auth/check`, `/auth/callback`) and forward only the GoTrue API paths. Three subtly-different path predicates have to coexist inside `vite.config.ts` — public-page bypass, bearer-attach narrowing, and (Task 1.5) DELETE-session matching — and the segment-anchoring story is exactly the kind of thing a drive-by edit can weaken to a bare `startsWith` without anyone noticing. Pulling the predicate into a pure-TS helper with colocated tests pins the semantics in CI, not in a curl smoke (and lets Task 1.5 reuse the same predicate).

**Prerequisites:** Task 1.1 (the new mailer URL path is the reason we need the bypass at all).

**Decisions:**
- Create `web/src/lib/shared/model/auth-paths.ts` exporting:
  ```ts
  export const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/check', '/auth/callback'] as const;
  export const SIGNED_IN_REDIRECT_PATHS = ['/auth/login', '/auth/check'] as const;
  export const BEARER_AUTH_PATHS = ['/auth/user'] as const;
  export const COOKIE_PLANT_PATHS = ['/auth/verify', '/auth/token'] as const;
  export const LOGOUT_PATHS = ['/auth/session'] as const;
  export function isSegmentMatch(url: string | undefined, paths: readonly string[]): boolean;
  ```
  `isSegmentMatch` strips the query string then returns true iff `url`'s path is exactly one of `paths` or starts with one followed by `/`. The exported consts are the single home for the path lists — R7 (route guard, Task 4.1: PUBLIC + SIGNED_IN_REDIRECT), Task 1.4 (proxy bypass + bearer narrow + cookie-plant narrow), and Task 1.5 (DELETE matcher via LOGOUT_PATHS) all import from this module instead of redefining the strings inline. One source of truth across every call site — adding a new public auth path tomorrow is exactly one file edit.
- `SIGNED_IN_REDIRECT_PATHS` is the subset of `PUBLIC_AUTH_PATHS` that Task 4.1's route guard redirects a signed-in user *away* from (back to `/`). It deliberately excludes `/auth/callback` because that page owns its own post-exchange `goto('/')` (R3), and racing two redirects is messier than letting that one win. Pinning the list here (alongside the other auth-path constants) means a future fourth public path can't accidentally inherit signed-in-redirect behaviour without an explicit edit.
- `COOKIE_PLANT_PATHS` is the new gate on the existing JSON sniffer's `set-cookie` block. Today the shim plants `cairn_session` on **any** 2xx `/auth/*` response with `access_token` — which silently includes `POST /auth/signup`. With `GOTRUE_DISABLE_SIGNUP="false"` and `GOTRUE_MAILER_AUTOCONFIRM="true"` in dev (`docker-compose.yml:46,51`), an anonymous signup through the Vite proxy plants a session cookie for the brand-new account — a full sign-in. The blast radius is localhost-only, but the contract is wider than the shim's intent. Narrowing to `/auth/verify` and `/auth/token` pins it to deliberate-login endpoints. A future GoTrue endpoint that also returns `access_token` (refresh-token rotation, OAuth callbacks) must be added to `COOKIE_PLANT_PATHS` explicitly. (R10)
- `web/vite.config.ts` imports both consts and the predicate via a relative path (`./src/lib/shared/model/auth-paths`). Vite evaluates the config in a Node-TS environment, so the import resolves at config-load time without changes to tsconfig.
- **Type-augment Node's `IncomingMessage` instead of `(req as any)`.** The `cairnOriginalUrl` stamp is read at four sites (the stamp itself, the `proxyReq` bearer narrow, the `proxyRes` cookie-plant narrow, and the Task 1.5 DELETE shim). Reading via `req.cairnOriginalUrl` is one typo away from a silent `undefined` (`cairnOriginalURL`, `cairn_original_url`) that falls through to the rewritten `req.url` and breaks the narrowing without any test catching it. Add a module augmentation in `vite.config.ts` at the top of the file:
  ```ts
  declare module 'node:http' {
    interface IncomingMessage {
      cairnOriginalUrl?: string;
    }
  }
  ```
  All four call sites then read/write `req.cairnOriginalUrl` with full type safety; the predicate signature in `auth-paths.ts` already accepts `string | undefined`, so the optional fall-through composes naturally.
- **`req.url` is mutated by Vite's `rewrite` *before* the proxy events fire** — by the time `proxyReq` / `proxyRes` run, `req.url` is the GoTrue-facing `/user`, `/verify`, `/token?…` form, not the original `/auth/...`. The narrowing predicates need the original URL to match against `PUBLIC_AUTH_PATHS` / `BEARER_AUTH_PATHS` / `COOKIE_PLANT_PATHS` (which are all `/auth/...`-shaped, since they're shared with R7's route guard and the `bypass` callback). The fix is to register a tiny **pre-proxy middleware** via a Vite plugin's `configureServer` hook that stamps `req.cairnOriginalUrl = req.url` for every request whose path starts with `/auth/`. The `proxyReq` and `proxyRes` handlers then consume `req.cairnOriginalUrl ?? req.url` (the fallback covers a defensive case where the plugin wasn't loaded). The `bypass(req)` callback continues to read `req.url` directly because Vite invokes `bypass` *before* the rewrite — the stamped field is unnecessary there. The plugin lives as a tiny object literal in `vite.config.ts` (`{ name: 'cairn-auth-shim', enforce: 'pre', configureServer(server) { server.middlewares.use((req, _res, next) => { if (req.url?.startsWith('/auth/') || req.url === '/auth') req.cairnOriginalUrl = req.url; next(); }); } }`) and the same plugin will host the Task 1.5 `DELETE /auth/session` middleware — one plugin owns all the dev-only auth shims. **The actual mechanism that makes the middleware run before Vite's internal proxy is the fact that `configureServer` registers the middleware synchronously and does not return a function.** Per Vite's docs: a `configureServer` hook that returns a function defers the function until after the internal middlewares are installed; one that registers middlewares synchronously (no `return`, or a non-function return) installs them before the internals. The plugin shape above doesn't return anything from `configureServer`, so `server.middlewares.use(...)` lands in the chain before Vite's proxy middleware — which is what gives us the pre-rewrite URL. `enforce: 'pre'` and placement before `sveltekit()` in the `plugins: [...]` array are belt-and-braces for ordering relative to *other user plugins* (in case SvelteKit ever registers its own pre-proxy middleware in a future version): keep both as defensive depth, but the load-bearing piece is the no-return-function shape of the hook. Add a one-line comment at the call site (`// no return from configureServer → middleware installs before Vite's internal proxy; see auth-paths.ts and Task 1.4 Decisions`) so a reviewer who "refactors" by extracting the body into a returned function notices what they're breaking.
- The `/auth` proxy entry's `bypass(req)` returns `req.url` when `isSegmentMatch(req.url, PUBLIC_AUTH_PATHS)`, `undefined` otherwise. When `bypass` returns a string, Vite short-circuits the proxy entirely — the rule's `rewrite: (p) => p.replace(/^\/auth/, '')` is **not applied** on the bypass branch. SvelteKit therefore sees the original `/auth/callback?token=…`, which is what its router expects. (A future "fix" that strips `/auth` here would 404 the page routes — leave the rewrite alone.)
- A new `proxyReq` handler on `/auth` (mirroring the one on `/api`, `web/vite.config.ts:27-32`) guards `isSegmentMatch(req.cairnOriginalUrl ?? req.url, BEARER_AUTH_PATHS)`; on a match, reads the cookie via the existing `readBearerFromCookie` helper and sets `Authorization: Bearer <jwt>` when present and not already set. Without this, `GET /auth/user` (the session-store boot in Task 2.2) would 401 on every reload because Vite forwards the cookie but GoTrue ignores cookies. The narrowing prevents an unrelated `POST /auth/otp` (a signed-in user sending a magic link to a different address) from carrying a stale bearer to an anonymous-callable endpoint. The Caddy prod analogue does the same per `docs/architecture.md:146`.
- Modify the existing `selfHandleResponse: true` + `proxyRes` JSON-sniffing block (`web/vite.config.ts:39-67`) to gate the **cookie-planting branch** (the `if (typeof json?.access_token === 'string')` body) on `isSegmentMatch(req.cairnOriginalUrl ?? req.url, COOKIE_PLANT_PATHS)`. The outer JSON parse and header forwarding stay unchanged for all `/auth/*` requests — only the `set-cookie` emission is narrowed. Without this gate, `POST /auth/signup` (open in dev) inadvertently plants a session cookie for the brand-new account. To do this, the `proxy.on('proxyRes', ...)` handler must capture `req` from its closure (rebind the callback as `(proxyRes, req, res) => { ... }`) so the stamped `cairnOriginalUrl` is in scope inside the response handler.
- **Bump the cookie `Max-Age` fallback to match `GOTRUE_JWT_EXP`.** The existing shim writes `Max-Age=${json.expires_in ?? 3600}` (`web/vite.config.ts:57`). After Task 1.1 bumps `GOTRUE_JWT_EXP` to `604800` (7 days), GoTrue's verify/token responses carry `expires_in: 604800`, so the cookie matches the JWT in the normal case. The stale `?? 3600` fallback would silently downgrade the cookie's lifetime by 168× if a future GoTrue response ever omits the field, forcing hourly re-sign-in with no visible cause. Change the fallback to `604800` so it tracks the JWT lifetime, and add an inline comment at the site: `// fallback tracks GOTRUE_JWT_EXP — keep in sync if the env var changes` so a future contributor who edits one side touches the other.
- **Strip `access_token` and `refresh_token` from the JSON body before forwarding it to the page.** After the cookie-plant branch runs (or doesn't), and before `res.end(body)`, inspect the parsed JSON: if either `json.access_token` or `json.refresh_token` is present, `delete` both fields, re-`JSON.stringify` the modified object, and `res.end` with the new buffer instead of the original. The strip is **unconditional across `/auth/*` 200 JSON responses** — independent of the `COOKIE_PLANT_PATHS` gate above, but still inside the existing `(ct.includes('application/json') && proxyRes.statusCode === 200)` outer guard that the existing shim already enforces at `web/vite.config.ts:51` (errors and non-JSON bodies aren't parsed, so there's nothing to strip there in the first place). The `200`-only gate matches R10's narrowed prose — widening to other 2xx statuses (201/202 from a future GoTrue fork) is a deliberate edit to both this Decisions block and R10, not an implicit consequence of the strip running on a different code path. The cookie-plant is path-narrowed because we only log the user IN on deliberate endpoints; the token-strip is universal across paths because the JS layer has no legitimate use for either token, full stop (the cookie is the source of truth, and refresh-token rotation is deferred per Non-requirements). `docs/architecture.md:145` already commits to "forwarding the (now-token-stripped) body" and `:233` to "the web app's JavaScript never sees the token"; without the strip in `proxyRes`, every successful `/auth/verify` or `/auth/token` round-trip parks the JWT *and* the refresh token in JS memory for the lifetime of the page's `await response.json()` parse — a doc/code divergence the proxy is the right home to close. When rewriting the body, the existing `for (const [k, v] of Object.entries(proxyRes.headers)) ...` loop must skip `content-length` (case-insensitive) so Node recomputes the header from the new buffer in `res.end(body)`; without this, a Content-Length-respecting client truncates the JSON to the original length. R12's Non-requirements explicitly defer unit-testing `vite.config.ts`, so the strip is verified by the new smoke step below (positive case on `/auth/token`, with the cookie planted and the body fields absent) and end-to-end by Task 5.2's Playwright spec via the cookie-works invariant.
- **Use `res.appendHeader('set-cookie', cookie)` for the cookie plant, not `setHeader`.** The existing shim's `res.setHeader('set-cookie', cookie)` (`web/vite.config.ts:58`) runs *after* the `for (const [k, v] of Object.entries(proxyRes.headers))` loop has already copied every upstream header — including any `Set-Cookie` GoTrue itself emitted — into the response. `setHeader` **replaces**, so any GoTrue-set cookies are silently dropped before the page sees them. Today's `supabase/gotrue:v2.158.1` doesn't set its own cookies on `/auth/verify` or `/auth/token`, so this is latent, but the same header-hygiene block that drops `content-length` is the right home to close the neighbour gap. Switch the line to `res.appendHeader('set-cookie', cookie)` (Node 16.17+; Vite's Node target supports it). Add an inline comment: `// append — preserves any upstream Set-Cookie the header-copy loop already forwarded`.
- Do NOT touch the `/api` proxy entry — only `/auth` changes.

**Reference:** `.claude/skills/writing-tests.md` for the colocated `.test.ts` convention.

**Files:**
- `web/src/lib/shared/model/auth-paths.ts` (create)
- `web/src/lib/shared/model/auth-paths.test.ts` (create)
- `web/vite.config.ts` (modify)

**Steps:**
1. RED — Create `auth-paths.test.ts` covering every predicate's segment-anchoring contract:
   - `isSegmentMatch('/auth/login', PUBLIC_AUTH_PATHS)` → true.
   - `isSegmentMatch('/auth/login/', PUBLIC_AUTH_PATHS)` → true.
   - `isSegmentMatch('/auth/login?email=x', PUBLIC_AUTH_PATHS)` → true.
   - `isSegmentMatch('/auth/callback?token=x&type=magiclink', PUBLIC_AUTH_PATHS)` → true.
   - `isSegmentMatch('/auth/check', PUBLIC_AUTH_PATHS)` → true.
   - `isSegmentMatch('/auth/loginx', PUBLIC_AUTH_PATHS)` → **false** (the adversarial sibling-prefix case that a bare `startsWith` would falsely accept).
   - `isSegmentMatch('/auth/otp', PUBLIC_AUTH_PATHS)` → false.
   - `isSegmentMatch('/auth/login', SIGNED_IN_REDIRECT_PATHS)` → true.
   - `isSegmentMatch('/auth/check', SIGNED_IN_REDIRECT_PATHS)` → true.
   - `isSegmentMatch('/auth/callback', SIGNED_IN_REDIRECT_PATHS)` → **false** (deliberate exclusion — the callback page owns its own `goto('/')` per R3 / Task 3.4, and the guard must let it render). This case is the regression guard against a future drive-by that "completes" the list by adding `/auth/callback` and silently breaks the callback flow.
   - `isSegmentMatch('/auth/user', BEARER_AUTH_PATHS)` → true.
   - `isSegmentMatch('/auth/user?id=x', BEARER_AUTH_PATHS)` → true.
   - `isSegmentMatch('/auth/userx', BEARER_AUTH_PATHS)` → **false**.
   - `isSegmentMatch('/auth/otp', BEARER_AUTH_PATHS)` → false.
   - `isSegmentMatch('/auth/verify', COOKIE_PLANT_PATHS)` → true.
   - `isSegmentMatch('/auth/token', COOKIE_PLANT_PATHS)` → true.
   - `isSegmentMatch('/auth/token?grant_type=password', COOKIE_PLANT_PATHS)` → true.
   - `isSegmentMatch('/auth/signup', COOKIE_PLANT_PATHS)` → **false** (the adversarial case — a 2xx signup response carries `access_token` but must not plant the cookie).
   - `isSegmentMatch('/auth/verifyx', COOKIE_PLANT_PATHS)` → false.
   - `isSegmentMatch('/auth/session', LOGOUT_PATHS)` → true.
   - `isSegmentMatch('/auth/sessions', LOGOUT_PATHS)` → **false** (the adversarial sibling-prefix case for Task 1.5's DELETE middleware).
   - `isSegmentMatch(undefined, PUBLIC_AUTH_PATHS)` → false.
2. RED — `pnpm test auth-paths.test`. All red.
3. GREEN — Create `auth-paths.ts` per Decisions.
4. GREEN — `pnpm test auth-paths.test`. All green.
5. Baseline (manual smoke) — With the dev server running, `curl -i http://localhost:5173/auth/callback?token=test`. Today the proxy forwards to GoTrue's `/callback` which 404s. Goal: after step 7, the same curl returns a SvelteKit response (probably a 404 from SvelteKit's router until Phase 3 adds the route — that's fine, not a GoTrue error). Labeled "Baseline" rather than "RED" because there is no new test file failing here — this is a "before" snapshot the GREEN step turns into a pass, not a TDD-RED in the sense the rest of the plan uses.
6. Baseline (manual smoke) — With the dev server running and the cookie planted from a prior login, `curl -i --cookie 'cairn_session=<jwt>' http://localhost:5173/auth/user`. Today (no bearer attach) GoTrue returns 401 because it ignores cookies. Goal: after step 7, the same curl returns 200 with the user payload. Same labeling rationale as step 5.
7. GREEN — Edit `web/vite.config.ts`:
   - Declare the `IncomingMessage` augmentation per Decisions (`declare module 'node:http' { interface IncomingMessage { cairnOriginalUrl?: string; } }`) at the top of `vite.config.ts`, immediately after the imports.
   - Import `PUBLIC_AUTH_PATHS`, `BEARER_AUTH_PATHS`, `COOKIE_PLANT_PATHS`, `isSegmentMatch` from `./src/lib/shared/model/auth-paths`. (`SIGNED_IN_REDIRECT_PATHS` and `LOGOUT_PATHS` are consumed by Tasks 4.1 and 1.5; they're declared in `auth-paths.ts` now but `vite.config.ts` doesn't need them yet.)
   - Add a small Vite plugin named `cairn-auth-shim` with `enforce: 'pre'` and a `configureServer(server)` hook that registers a pre-middleware **synchronously** (the load-bearing knob — see Decisions): `server.middlewares.use((req, _res, next) => { if (req.url?.startsWith('/auth/') || req.url === '/auth') req.cairnOriginalUrl = req.url; next(); })`. Do **not** wrap the body in `return () => { ... }` — a returned function would defer the middleware until after Vite's internal proxy, which is exactly the inverse of what we need. `enforce: 'pre'` and placement before `sveltekit()` in the `plugins: [...]` array are belt-and-braces for ordering among user plugins; add the inline comment `// no return from configureServer → installs before Vite's internal proxy; see auth-paths.ts and Task 1.4 Decisions` at the call site so the contract is visible.
   - Add the `bypass` callback to the `/auth` proxy entry using `isSegmentMatch(req.url, PUBLIC_AUTH_PATHS)`. (`bypass` runs before `rewrite`, so `req.url` is the original `/auth/...` here — no need for the stamped field.)
   - Add the narrowed `proxyReq` cookie → `Authorization: Bearer` handler gated on `isSegmentMatch(req.cairnOriginalUrl ?? req.url, BEARER_AUTH_PATHS)`.
   - Gate the existing JSON-sniffer's `set-cookie` emission on `isSegmentMatch(req.cairnOriginalUrl ?? req.url, COOKIE_PLANT_PATHS)` — rebind the `proxyRes` handler signature to include `req` so the stamped field is in closure scope. In the same edit, change `res.setHeader('set-cookie', cookie)` (`web/vite.config.ts:58`) to `res.appendHeader('set-cookie', cookie)` so the planted cookie composes with any upstream `Set-Cookie` already forwarded by the header-copy loop instead of clobbering it. Add an inline comment at the call site: `// append — preserves any upstream Set-Cookie the header-copy loop already forwarded`.
   - In the same `set-cookie` block, change the `Max-Age=${json.expires_in ?? 3600}` fallback to `Max-Age=${json.expires_in ?? 604800}` so the fallback tracks `GOTRUE_JWT_EXP`. Add an inline comment: `// fallback tracks GOTRUE_JWT_EXP — keep in sync if the env var changes`.
   - Add a body-strip step in the same `proxyRes` handler, *after* the cookie-plant branch and *before* `res.end(body)`: if `typeof json?.access_token === 'string'` or `typeof json?.refresh_token === 'string'`, `delete json.access_token; delete json.refresh_token;` and replace `body` with `Buffer.from(JSON.stringify(json))`. Also edit the header-forwarding loop to skip `content-length` (case-insensitive: `if (k.toLowerCase() === 'content-length') continue;`) so Node recomputes the header from the modified buffer when `res.end(body)` runs. Add an inline comment: `// strip tokens unconditionally — JS has no use for them; cookie is the source of truth (docs/architecture.md:145, :233)`.
   - Add a one-line comment near each call site explaining what `auth-paths.ts` owns and why `cairnOriginalUrl` is consulted (rewrite mutates `req.url`), so a future contributor reaches for the helper instead of inlining a regex and doesn't "simplify" the stamped field back out.
8. GREEN — Restart `pnpm dev`. Re-run the bearer-attach smoke from step 6; SvelteKit now serves the bypass-bound `/auth/callback` (the curl from step 5), and `curl -i --cookie 'cairn_session=<jwt>' http://localhost:5173/auth/user` returns 200 with the user payload. If `/auth/user` still 401s, the most likely cause is that `configureServer` is returning a function (which defers middleware installation past Vite's proxy) — double-check the hook body registers via `server.middlewares.use(...)` synchronously with no `return`. The bearer-attach assertion in step 6 is the load-bearing acceptance test for this concern.
9. GREEN — Sanity check that GoTrue API calls still work: `curl -X POST http://localhost:5173/auth/otp -H 'Content-Type: application/json' -d '{"email":"alice@example.test","create_user":true}' -i` returns 200; a fresh Mailpit message appears at `http://localhost:8025`. (The "bearer is not attached to `/auth/otp`" contract is covered structurally by the helper-module tests in step 1 — no need to chase `docker compose logs gotrue` for an absent header that GoTrue may not log at default verbosity anyway.)
10. GREEN — Cookie-plant narrow smoke: `curl -X POST http://localhost:5173/auth/signup -H 'Content-Type: application/json' -d '{"email":"smoketest@example.test","password":"cairn-dev"}' -i`. Response: 200, but **no** `Set-Cookie: cairn_session=` in the headers — `/auth/signup` is not in `COOKIE_PLANT_PATHS`. Compare with `curl -X POST http://localhost:5173/auth/token?grant_type=password -H 'Content-Type: application/json' -d '{"email":"alice@example.test","password":"cairn-dev"}' -i` which **does** plant the cookie — this is the positive case that catches the original-URL regression: if the narrow accidentally checks the rewritten `req.url` (`/token` not in `['/auth/verify', '/auth/token']`), the cookie won't plant and dev-shortcut sign-in is broken. (Cleanup: `docker compose exec postgres psql -U cairn -d cairn -c "DELETE FROM auth.users WHERE email = 'smoketest@example.test'"` if you want the row gone.)
11. GREEN — Token-strip smoke: pipe the `/auth/token` response body from step 10 through `jq` (or just inspect the JSON after the headers): the body should contain `user`, `token_type`, `expires_in` (and any other non-secret fields GoTrue emits), but **must not** contain `access_token` or `refresh_token` keys. Concretely: `curl -s -X POST http://localhost:5173/auth/token?grant_type=password -H 'Content-Type: application/json' -d '{"email":"alice@example.test","password":"cairn-dev"}' | jq 'has("access_token"), has("refresh_token"), has("user")'` prints `false`, `false`, `true`. Symmetric check on the signup path: `curl -s -X POST http://localhost:5173/auth/signup -H 'Content-Type: application/json' -d '{"email":"smoketest2@example.test","password":"cairn-dev"}' | jq 'has("access_token"), has("refresh_token")'` prints `false`, `false` (the strip is unconditional, not gated on `COOKIE_PLANT_PATHS`). If either field is still present, the strip didn't fire — most likely the `delete` didn't land before `res.end(body)` or the `content-length` header wasn't dropped from the forwarded headers and the rewritten body was truncated. (Cleanup: `docker compose exec postgres psql -U cairn -d cairn -c "DELETE FROM auth.users WHERE email = 'smoketest2@example.test'"` if you want the row gone.)

**Verify:** `cd web && pnpm test auth-paths.test --run` (all green) · `curl -i http://localhost:5173/auth/callback` (SvelteKit response, not GoTrue) · `curl -X POST http://localhost:5173/auth/otp -H 'Content-Type: application/json' -d '{"email":"alice@example.test","create_user":true}' -i` (200, Mailpit message visible at `http://localhost:8025`) · with a real JWT cookie, `curl -i --cookie 'cairn_session=<jwt>' http://localhost:5173/auth/user` returns 200 with the user payload (this is the bearer-attach acceptance test — if it 401s, `cairnOriginalUrl` isn't being captured before the rewrite) · `curl -X POST http://localhost:5173/auth/token?grant_type=password -H 'Content-Type: application/json' -d '{"email":"alice@example.test","password":"cairn-dev"}' -i` returns 200 **with** `Set-Cookie: cairn_session=…` (cookie-plant acceptance test on the rewritten path) · `curl -X POST http://localhost:5173/auth/signup -H 'Content-Type: application/json' -d '{"email":"smoketest@example.test","password":"cairn-dev"}' -i` returns 200 **with no** `Set-Cookie: cairn_session=` header (cookie-plant narrow excludes signup) · `curl -s -X POST http://localhost:5173/auth/token?grant_type=password -H 'Content-Type: application/json' -d '{"email":"alice@example.test","password":"cairn-dev"}' | jq 'has("access_token"), has("refresh_token")'` prints `false`, `false` (token-strip acceptance test).

### [x] 1.5 Add the `DELETE /auth/session` middleware to Vite's dev server

**Created:** 2026-05-13T12:11:12Z
**Completed:** 2026-05-18T08:33:35Z

**Why:** `docs/architecture.md:148` commits to `DELETE /auth/session` as the sign-out endpoint. It's not a GoTrue endpoint — it's Cairn's own — so it doesn't belong in the proxy response handler. In production Caddy implements it; in dev the Vite server is the analogue. The route needs to exist before Phase 2 ships the session store's `signOut()`.

**Prerequisites:** Task 1.4 (the `/auth` proxy entry exists in its split form; the middleware lives alongside it).

**Decisions:**
- Extend the `cairn-auth-shim` plugin landed in Task 1.4 (already host of the pre-proxy `cairnOriginalUrl` middleware) with a second `configureServer(server)` middleware registration. One plugin owns all the dev-only auth shims. Both middlewares run before Vite's built-in proxy middleware, which is what we want — the DELETE short-circuit prevents the request from being forwarded to GoTrue.
- **Register the middleware at root, not at a mount path.** Use `server.middlewares.use(handler)` with **no path argument**, and do the matching inside the handler. Connect (which Vite's middleware stack is) strips the mount path from `req.url` when a path argument is supplied — `server.middlewares.use('/auth/session', handler)` would leave `req.url === '/'` inside the handler, with `req.originalUrl` carrying the full path. Calling `isSegmentMatch(req.url, LOGOUT_PATHS)` against `'/'` always returns false, and the DELETE silently never matches. Mounting at root keeps `req.url` as the full request path, mirroring the `cairnOriginalUrl` plugin's pattern from Task 1.4 — one `req.url` story across both shims.
- Inside the handler: gate on `isSegmentMatch(req.url, LOGOUT_PATHS)` (imported from `$lib/shared/model/auth-paths`; `LOGOUT_PATHS = ['/auth/session'] as const` was added in Task 1.4's Decisions). On a mismatch, call `next()` and forward through the proxy. Then check `req.method === 'DELETE'`, set `Set-Cookie: cairn_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`, write a 204, and end. Non-DELETE requests against `/auth/session` call `next()` and fall through to the proxy (returning whatever GoTrue would — typically a 404, since GoTrue doesn't own this endpoint). The segment-anchoring rejects `/auth/sessions` and `/auth/session/foo` as the test in Task 1.4 pins.
- Do NOT also fire `POST /logout` to GoTrue. That's the optional best-effort step deferred per PLAN.md's open question — refresh-token rotation is out of scope, so server-side invalidation has no teeth in Step 3.

**Files:**
- `web/vite.config.ts` (modify)

**Steps:**
1. Baseline (manual smoke) — `curl -X DELETE -i http://localhost:5173/auth/session -H 'Cookie: cairn_session=anything'`. Today this is forwarded to GoTrue and 404s. Goal: after step 2, the same curl returns 204 with the cookie-clearing `Set-Cookie`. Labeled "Baseline" rather than "RED" because there is no new test file failing here — same convention as Task 1.4's steps 5–6.
2. GREEN — In `web/vite.config.ts`, extend the existing `cairn-auth-shim` plugin (landed in Task 1.4) — inside its `configureServer(server)` hook, add a second `server.middlewares.use(handler)` call (no path argument — see Decisions for why mounting at a path would silently break the segment-anchored match). The handler first gates on `isSegmentMatch(req.url, LOGOUT_PATHS)`, then on `req.method === 'DELETE'`; on the positive case it sets the cookie-clearing `Set-Cookie` header and responds 204, otherwise it calls `next()`.
3. GREEN — Re-run the curl from step 1. Returns 204 with `Set-Cookie: cairn_session=; … Max-Age=0` in the response headers.

**Verify:** `curl -X DELETE -i http://localhost:5173/auth/session` (204, Set-Cookie clearing) · `curl -X GET -i http://localhost:5173/auth/session` (still goes to GoTrue or 404, whichever — the middleware only handles DELETE).

## Phase 2 — Session store + PostgREST wrapper

Phase 2 lands the two cross-cutting modules in `shared/` that the rest of the app depends on: the session store and the thin PostgREST wrapper. They're paired because the wrapper calls into the store on 401.

### [ ] 2.1 Populate `web/src/lib/test/handlers.ts` with default MSW handlers

**Created:** 2026-05-13T12:11:12Z
**Completed:**

**Why:** `vitest.setup.ts:6` sets `onUnhandledRequest: 'error'`. The session store's boot will call `GET /auth/user` from every component test once Task 2.2 lands, so without default handlers, every unrelated test breaks. Default-handler-first prevents the cascade.

**Prerequisites:** None.

**Decisions:**
- Use MSW v2 `http.*` handlers. URLs use the wildcard origin pattern `*/auth/user` (etc.) so MSW v2's node adapter matches regardless of the origin happy-dom resolves the relative `fetch('/auth/user')` against. A purely relative URL string can silently fail to match under node + happy-dom; the `*/path` pattern is MSW's documented cross-origin form and is robust to setup drift.
- Defaults represent the "logged out / fresh start" state so unrelated tests don't accidentally render an authed view:
  - `http.get('*/auth/user', () => new HttpResponse(null, { status: 401 }))`
  - `http.post('*/auth/otp', () => HttpResponse.json({}))` (the magic-link request returns an empty body in GoTrue)
  - `http.post('*/auth/verify', () => HttpResponse.json({ token_type: 'bearer', expires_in: 604800, user: { id: '11111111-1111-1111-1111-111111111111', email: 'dev@example.test' } }))` — **no `access_token`, no `refresh_token`**: the MSW layer intercepts at the page's fetch boundary, which in production is *after* the Vite proxy strips both fields per R10. Mirroring the post-strip shape here keeps the fixture honest; a future regression that taught the auth-client to read `access_token` from the body would still fail under this default rather than silently working in tests but breaking in production.
  - `http.post('*/auth/token', () => HttpResponse.json({ token_type: 'bearer', expires_in: 604800, user: { id: '11111111-1111-1111-1111-111111111111', email: 'dev@example.test' } }))` — same post-strip shape as `/auth/verify` because `/auth/token` is the other cookie-plant endpoint (R10 / `COOKIE_PLANT_PATHS`) and the strip is unconditional across `/auth/*`. Without this default, any test that indirectly triggers `devPasswordSignIn` (Step 4 integration tests, future Settings flows) blows up under `onUnhandledRequest: 'error'` with no obvious cause.
  - `http.delete('*/auth/session', () => new HttpResponse(null, { status: 204 }))`
- Per-test `server.use(...)` overrides for 4xx / 5xx cases.

**Reference:** `.claude/skills/writing-tests.md` for MSW conventions.

**Files:**
- `web/src/lib/test/handlers.ts` (modify)

**Steps:**
1. GREEN — Replace the empty array with the five handlers above (`/auth/user`, `/auth/otp`, `/auth/verify`, `/auth/token`, `/auth/session`). Import `http` and `HttpResponse` from `msw`.
2. GREEN — `cd web && pnpm test --run` to confirm the existing test suite still passes (none of the existing tests hit `/auth/*`, but the addition shouldn't break anything).

**Verify:** `cd web && pnpm test --run` (green) · `cd web && pnpm lint` (green).

### [ ] 2.2 Land the session store (`shared/state/session.svelte.ts`) with tests

**Created:** 2026-05-13T12:11:12Z
**Completed:**

**Why:** The route guard, the PostgREST wrapper, and every later sign-out / sign-in surface read `session.status` reactively. The store sits in `shared/state/` (not `auth/`) because `shared/` cannot import from per-domain folders per `docs/frontend-layout.md:41-43`.

**Prerequisites:** Task 2.1 (default `GET /auth/user` and `DELETE /auth/session` handlers).

**Decisions:**
- Exported runes state with a **proper discriminated union**, exposed via a **boxed `current` property** so TypeScript narrowing carries across `status` → `user` reads. A two-getter shape (`session.status`, `session.user`) does NOT narrow — each `get` is an independent property access; TS cannot use a check on `session.status` to infer `session.user`'s narrower type. The boxed form does:
  ```ts
  export type AuthUser = { id: string; email: string };
  export type Session =
    | { status: 'unknown' }
    | { status: 'signed-out' }
    | { status: 'signed-in'; user: AuthUser };

  // The exported `session` is a $state proxy whose .current field
  // IS the discriminated union. Mutators replace .current wholesale.
  export const session = $state<{ current: Session }>({
    current: { status: 'unknown' }
  });

  // Internal helper — mutators below replace session.current atomically:
  function set(next: Session) { session.current = next; }
  ```
  Consumers (route guard, postgrest wrapper, callback page, LoginRequest) read `session.current.status` and, after a `status === 'signed-in'` check, `session.current.user` is fully narrowed to `AuthUser` (no `?.`, no `!`). Mutating `session.current.status` and `session.current.user` separately is **forbidden** — the intermediate state would be an impossible variant; always assign a whole new `Session` object via the wholesale `session.current = …` swap.
  The `__mocks__/session.svelte.ts` mock mirrors the same `{ current: Session }` shape — and **is itself a `$state` proxy**, not a plain JS object. `pending-login.svelte.ts` registers a module-scoped `$effect.root` that reads `session.current.status` from this very import; if the mock were a plain object, the `$effect` would never re-fire when a consumer test reassigns `session.current = { status: 'signed-in', ... }` and the auto-clear behaviour (R14) could not be tested through the mock. A `$state` proxy is still write-through (tests can synchronously assign `session.current = ...` between renders), it just additionally notifies subscribers. The same `await tick()` + same-value-coalescing rules from `.claude/skills/writing-tests.md` apply — see the mock surface spelled out below.
- Exported functions:
  - `bootSession()` — `await fetch(${import.meta.env.VITE_AUTH_BASE ?? '/auth'}/user, { credentials: 'same-origin' })`; on 2xx assigns `session.current = { status: 'signed-in', user }`; on 401 assigns `session.current = { status: 'signed-out' }`. Other statuses default to `signed-out` and log. **Both** branches only write when `session.current.status === 'unknown'` — symmetric guards, so any deliberate entrypoint (`signOut`, `setSignedIn`, `onUnauthorized`) that fired while boot was in flight wins. Asymmetry (guard 2xx but let 401 overwrite) is the foreseeable bug R4 explicitly forbids: it protects the signOut-vs-boot race but breaks the callback's `setSignedIn`-vs-boot-401 race. **Concurrent calls share one fetch.** A module-scoped `let bootPromise: Promise<void> | null = null;` caches the in-flight promise: the first call sets it, every concurrent call returns it, and the `finally` clears it so a later boot after a `signOut` can fire again. Without this, the layout's `onMount` boot and the callback page's `await bootSession()` (R3) fire two parallel `GET /auth/user` requests; state convergence still works via the symmetric write guards, but the second fetch is wasted traffic and the callback's `await` no longer truthfully "awaits the boot already in flight". The prefix is read from `VITE_AUTH_BASE` so the same env-var that pins `auth-client.ts`'s URLs (Task 3.1) pins this one too — the session store is in `shared/state/` and cannot import from `auth/model/`, but it can and should match the contract via the env var. Tests pin the prefix the same way Task 3.1 does (`vi.stubEnv('VITE_AUTH_BASE', '/auth')` in `beforeAll`, `vi.unstubAllEnvs()` in `afterAll`).
  - `signOut()` — if `session.current.status === 'signed-out'`, no-op. Otherwise (including the `unknown` state where boot has not yet resolved) assign `session.current = { status: 'signed-out' }` **unconditionally** using `try/finally`: fire `fetch('/auth/session', { method: 'DELETE', credentials: 'same-origin' })` as best-effort, but write the `signed-out` variant in `finally` even if the DELETE rejects. Explicit user intent is authoritative; a network failure must not leave the user stuck in `signed-in` with an unhandled rejection. A slow `bootSession` that resolves after the DELETE doesn't overwrite the resulting `signed-out` because boot's branches check `status === 'unknown'` before writing.
  - `setSignedIn(user: AuthUser)` — synchronous; assigns `session.current = { status: 'signed-in', user }` from `unknown` or `signed-out` only. A call while already `signed-in` is a no-op (the live cookie is the source of truth, and step 3 has no path that would update the user payload on an existing session — refresh-token rotation is explicitly deferred). Does no HTTP. Used by R3 (callback, Task 3.4) and R8 (dev shortcut, Task 3.2) after a successful exchange: by the time those paths run, `bootSession()` has already resolved (typically to `signed-out`, since the cookie wasn't set at first paint), so boot's only-from-`unknown` guard would otherwise refuse to write `signed-in` on a same-tab login. `setSignedIn` is the deliberate-action entrypoint that bypasses the boot guard without weakening it (the guard is still needed for the signOut-before-boot race).
  - `onUnauthorized()` — assigns `session.current = { status: 'signed-out' }` from **any** state that isn't already `signed-out` (collapses both `signed-in` and `unknown`). Called by the PostgREST wrapper on 401 (Task 2.3). Synchronous; does no HTTP itself.
- The store is a module singleton — there's exactly one `session` per page load. Tests reset it via `signOut()` or by re-importing in isolation (Vitest's `vi.resetModules()` is overkill — direct state writes via `signOut()` are fine).
- The mock at `__mocks__/session.svelte.ts` exposes the same shape but with no boot fetch and no real HTTP — it's a controllable stand-in for tests that need a specific status. **Note for an executor reaching for the existing peer mock as a template**: the sibling file at `web/src/lib/shared/state/__mocks__/preferences.svelte.ts:5-8` is a plain non-reactive JS object — DO NOT copy that shape forward here. This mock must be a `$state`-backed proxy because `pending-login.svelte.ts`'s module-scoped `$effect.root` (Task 3.2) reads `session.current.status` through this very mock and won't re-fire on a plain-object mutation. A green-but-wrong "auto-clear" test (the effect never re-runs, the email stays set, the test happens to read it before the assertion would catch the missing clear) is the failure mode this note exists to prevent. Exact mock surface:
  - `session = $state<{ current: Session }>({ current: { status: 'unknown' } })` — a `$state` proxy whose `current` field is the discriminated union, mirroring the real module's boxed shape so `if (session.current.status === 'signed-in') session.current.user` narrows in TS. The `$state` proxy is write-through (tests can synchronously assign `session.current = { status: 'signed-in', user: {...} }` between renders) **and** reactive (subscribers like `pending-login.svelte.ts`'s `$effect.root` re-fire when the assignment changes the value).
  - `bootSession = vi.fn(async () => {})` — no-op spy; tests that need to assert against it import the mock and read `vi.mocked(bootSession).mock.calls`.
  - `signOut = vi.fn(async () => { session.current = { status: 'signed-out' }; })` — spy that also writes the post-condition so consumer code observing the state transition sees the expected result.
  - `setSignedIn = vi.fn((user: AuthUser) => { session.current = { status: 'signed-in', user }; })` — spy that also writes the post-condition for the same reason.
  - `onUnauthorized = vi.fn(() => { session.current = { status: 'signed-out' }; })` — spy that also writes the post-condition.
  Tests can either let the spies' default implementations drive state, or override per-test with `vi.mocked(setSignedIn).mockImplementation(...)`. The mock file's top-level body resets `session.current = { status: 'unknown' }` only at module-load; per-test resets belong in `beforeEach` via direct assignment (then `await tick()` per the `writing-tests` skill so any reset-driven `$effect` flushes before the test runs). The real module's behaviour is exercised exclusively in `session.test.ts`.

**Reference:** `.claude/skills/writing-tests.md` for the runes-idiom mock pattern.

**Files:**
- `web/src/lib/shared/state/session.svelte.ts` (create)
- `web/src/lib/shared/state/session.test.ts` (create)
- `web/src/lib/shared/state/__mocks__/session.svelte.ts` (create)

**Steps:**
1. RED — Create `session.test.ts` with the following cases. The file pins `VITE_AUTH_BASE` in `beforeAll` (`vi.stubEnv('VITE_AUTH_BASE', '/auth')`) and unstubs in `afterAll`, matching Task 2.3 and Task 3.1's pattern so `bootSession`'s URL prefix is asserted independently of any contributor `.env`:
   - boot transitions `unknown → signed-in` when `/auth/user` returns 200 with a user payload.
   - boot transitions `unknown → signed-out` when `/auth/user` returns 401.
   - **boot transitions `unknown → signed-out` on other failure modes** — a 500 response, a 503, and a network error (`HttpResponse.error()`) all collapse to `signed-out` without throwing. Don't pin the exact log text in tests (a `console.error` of best-effort shape is fine; brittle text assertions are not). The default-to-`signed-out` behaviour is R4's contract — without this case, a future refactor that silently swallowed non-401 failures into `unknown` would leave the boot wedged and the route guard stuck on the block-render boot screen.
   - `signOut()` calls `DELETE /auth/session` and transitions to `signed-out`.
   - `signOut()` is a no-op when already `signed-out` (no DELETE fires — assert via `server.use` recording).
   - `signOut()` while `unknown` fires the DELETE and ends in `signed-out`; a `bootSession()` resolution arriving afterwards does **not** overwrite it back to `signed-in`. (Race the two; assert final state is `signed-out`.)
   - `signOut()` transitions to `signed-out` even when the DELETE rejects with a network error (override the handler with `HttpResponse.error()` for that test; assert the function does not throw and final status is `signed-out`).
   - `onUnauthorized()` transitions `signed-in → signed-out` without any HTTP call.
   - `onUnauthorized()` transitions `unknown → signed-out` without any HTTP call (any state that isn't already `signed-out` collapses).
   - `setSignedIn({ id, email })` transitions `signed-out → signed-in` with that user, without an HTTP call.
   - `setSignedIn({ id, email })` transitions `unknown → signed-in` with that user (no HTTP, no race with a pending boot — the boot guard already protects the opposite direction).
   - **Race**: `setSignedIn({ id, email })` is called while `unknown`; a `bootSession()` call resolves with **401** afterwards. Final state is `signed-in` with the supplied user — the 401 branch must NOT overwrite. (Drives the boot-401 guard symmetric to the boot-2xx guard. Without this guard, the callback flow is broken: see R4's "asymmetric guards" explanation.) Implementation: start `bootSession()` (do **not** await), synchronously call `setSignedIn(user)` before MSW resolves the handler, then `await` the boot promise and assert status is still `signed-in`. The natural fetch-resolution ordering carries the test — no explicit microtask juggling is needed.
   - **Race**: `setSignedIn({ id, email })` is called while `unknown`; a `bootSession()` call resolves with **200** + a different user afterwards. Final state is the user passed to `setSignedIn` (not boot's user) — symmetric guard, same reasoning. Same implementation shape as the 401-race test above.
   - **`setSignedIn` while already `signed-in` is a no-op**: pre-stage `signed-in` with user `U1` via a first `setSignedIn(U1)`, then call `setSignedIn(U2)` with a *different* user payload (`{ id: 'u2-…', email: 'other@example.test' }`). Assert `session.current.user.id === U1.id` and `session.current.user.email === U1.email` — the second call did not overwrite. R4's contract: "a call while already `signed-in` is a no-op (the live cookie is the source of truth, and step 3 has no path that would update the user payload on an existing session — refresh-token rotation is explicitly deferred)." A future refresh-token regression that bypassed the no-op guard (silently swapping the user field) would be caught here.
   - **Concurrent `bootSession()` calls share one fetch**: install an MSW handler counter (`let calls = 0; server.use(http.get('*/auth/user', () => { calls++; return new HttpResponse(null, { status: 401 }); }))`). Call `bootSession()` twice without awaiting in between, then `await Promise.all([...])` both. Assert `calls === 1` and `session.current.status === 'signed-out'`. Pins the module-scoped `bootPromise` cache — without it, the callback page's `await bootSession()` (R3 / Task 3.4) would fire a second redundant `GET /auth/user` alongside the layout's boot. After the boot resolves, a fresh call (e.g. after a later `signOut()`) must be able to fetch again — assert this by calling `signOut()` then `bootSession()` and observing `calls === 2` (the promise cache cleared in `finally`).
2. RED — Run `pnpm test session.test` and confirm the suite is red (module doesn't exist yet).
3. GREEN — Create `session.svelte.ts` with the runes store and the four exported functions.
4. GREEN — Create `__mocks__/session.svelte.ts` mirroring the exact mock surface listed in Decisions: a **`$state`-backed** `session` proxy (the file's `.svelte.ts` extension makes runes legal here) plus `bootSession`, `signOut`, `setSignedIn`, `onUnauthorized` as `vi.fn` spies whose default implementations write the matching post-condition into `session.current`. Type-only imports of `AuthUser` / `Session` from `../session.svelte` are fine because Vitest substitutes the mock at runtime, not at type-check time.
5. GREEN — Run `pnpm test session.test`. All green.

**Verify:** `cd web && pnpm test session.test --run` (green) · `cd web && pnpm check` (no TS errors).

### [ ] 2.3 Land the PostgREST wrapper (`shared/http/postgrest.ts`) with tests

**Created:** 2026-05-13T12:11:12Z
**Completed:**

**Why:** Step 4 needs a typed `fetch`-shaped helper to talk to PostgREST. Cairn's "simplest thing that works" stance and the small surface area (no need for `@supabase/postgrest-js`) mean a ~40-line wrapper handles it. The wrapper also bridges the 401 case into the session store so an expired session reflects in the UI within a tick.

**Prerequisites:** Task 2.2 (the wrapper imports `session.onUnauthorized`).

**Decisions:**
- Module exports:
  ```ts
  export class AuthError extends Error { /* thrown on 401 */ }
  export class ApiError extends Error {
    code?: string; details?: string; hint?: string;
    /* thrown on other 4xx/5xx, carries PostgREST's error shape */
  }
  export async function pgGet<T>(path: string, init?: RequestInit): Promise<T>;
  export async function pgPost<T>(path: string, body: unknown, init?: RequestInit): Promise<T>;
  export async function pgPatch<T>(path: string, body: unknown, init?: RequestInit): Promise<T>;
  export async function pgDelete(path: string, init?: RequestInit): Promise<void>;
  ```
- All four helpers prefix `import.meta.env.VITE_API_BASE` (default `/api`). They set `Accept: application/json` and (where applicable) `Content-Type: application/json`. `credentials: 'same-origin'`. **Tests must pin `VITE_API_BASE` explicitly** via `vi.stubEnv('VITE_API_BASE', '/api')` in a top-level `beforeAll` (paired with `vi.unstubAllEnvs()` in `afterAll`) — otherwise the suite reads whatever the contributor's `web/.env` happens to set and a stray override silently breaks the URL-prefix assertion below.
- On `response.status === 401`: call `session.onUnauthorized()`, then `throw new AuthError(...)`.
- On other non-2xx: parse the response body as JSON if Content-Type is JSON; populate `ApiError.code/message/details/hint` from PostgREST's standard error shape (`{code, message, details, hint}`); fall back to `{message: '<status text>'}` for non-JSON errors. Throw.
- On 2xx without JSON body (e.g. 204): return `undefined as T`.
- A small `Accept: application/vnd.pgrst.object+json` helper convention: callers requesting a single row pass that header via `init?.headers`; the wrapper passes it through without coercion.

**Reference:** PostgREST error shape — `docs/data-model.md` if relevant, or PostgREST official docs.

**Files:**
- `web/src/lib/shared/http/postgrest.ts` (create)
- `web/src/lib/shared/http/postgrest.test.ts` (create)

**Steps:**
1. RED — Create `postgrest.test.ts` with `vi.stubEnv('VITE_API_BASE', '/api')` in `beforeAll` and `vi.unstubAllEnvs()` in `afterAll`, then the following tests:
   - GET parses JSON body and returns it.
   - `pgGet('/lists')` issues the request to `/api/lists` — pin the `VITE_API_BASE` prefix by asserting on the absolute URL MSW sees (use the `*/api/lists` handler pattern and `request.url` inside the handler, or an absolute-URL MSW matcher). The `beforeAll` stub pins the prefix to `/api` regardless of `.env` contents; a regression that drops the prefix would otherwise pass the other tests.
   - `pgPost('/lists', { name: 'x' })` issues a POST to `/api/lists` with `Content-Type: application/json` and a JSON-serialised body (assert via the MSW handler's `await request.json()`). Smokes the verb wire-up; a regression that drops `pgPost` or its body serialisation is caught here.
   - `pgPatch('/lists?id=eq.1', { name: 'y' })` issues a PATCH to `/api/lists?id=eq.1` with a JSON body (same shape of assertion as the `pgPost` case). Mirror smoke for the update verb.
   - `pgDelete('/lists?id=eq.1')` issues a DELETE to `/api/lists?id=eq.1` and resolves to `undefined` on a 204 response. The empty-body case is the failure mode most likely to silently regress.
   - 401 calls `session.onUnauthorized` (mocked) and throws `AuthError`.
   - 4xx with PostgREST shape throws `ApiError` carrying `code/details/hint`.
   - `Accept: application/vnd.pgrst.object+json` is passed through to the request init (assert via MSW's `request.headers.get(...)`).
   - 204 returns `undefined`.
2. RED — Run `pnpm test postgrest.test`. All red.
3. GREEN — Implement `postgrest.ts` per Decisions. Use `vi.mock('$lib/shared/state/session.svelte')` to substitute the mock from Task 2.2 — the test asserts that `onUnauthorized` was called via the mock's spy.
4. GREEN — Run `pnpm test postgrest.test`. All green.

**Verify:** `cd web && pnpm test postgrest.test --run` (green) · `cd web && pnpm check` (no TS errors).

## Phase 3 — Auth screens and routes

Phase 3 builds the three auth components and the three SvelteKit routes that mount them. The auth client (Task 3.1) lands first because every component imports from it. Tests-first per component; the routes are thin shells around their components.

### [ ] 3.1 Land the auth client (`auth/model/auth-client.ts`) with tests

**Created:** 2026-05-13T12:11:12Z
**Completed:**

**Why:** A single module collects the four GoTrue calls the auth screens make: `sendMagicLink`, `verifyToken`, `devPasswordSignIn`, `logout`. Centralizing keeps fetch shape consistent and gives the screens one mock surface. Lands at the head of Phase 3 because every subsequent task in the phase imports from it.

**Prerequisites:** Task 2.1 (default MSW handlers).

**Decisions:**
- Lives at `web/src/lib/auth/model/auth-client.ts`. Plain TS, no reactivity — it's `model/`, not `state/`.
- Functions:
  ```ts
  type AuthUser = { id: string; email: string };
  sendMagicLink(email: string): Promise<void>;
  // POST /auth/otp with {email, create_user: true}.
  verifyToken(args: { token: string; type: 'magiclink' }): Promise<{ user: AuthUser }>;
  // POST /auth/verify with the args; shim plants the cookie on 200.
  // Returns the user parsed from the response body so the caller can
  // pass it to session.setSignedIn (R3 / Task 3.4).
  devPasswordSignIn(email: string, password: string): Promise<{ user: AuthUser }>;
  // POST /auth/token?grant_type=password with {email, password}.
  // Password is mandatory — no default value — so the plaintext
  // string does not get baked into the production bundle. The caller
  // (LoginRequest's dev-button handler, Task 3.2c) reads it from
  // `import.meta.env.VITE_DEV_LOGIN_PASSWORD` and passes it
  // explicitly. Returns the user parsed from the response body so
  // the caller can pass it to session.setSignedIn (R8 / Task 3.2c).
  logout(): Promise<void>;
  // DELETE /auth/session — middleware clears the cookie.
  ```
- All four use `fetch` with `credentials: 'same-origin'`, `Content-Type: application/json`, and the proxy-prefixed paths. URLs are constructed by prefixing `import.meta.env.VITE_AUTH_BASE` (default `/auth`) to the GoTrue endpoint (`/otp`, `/verify`, `/token`, `/session`). **Tests must pin `VITE_AUTH_BASE` explicitly** via `vi.stubEnv('VITE_AUTH_BASE', '/auth')` in a top-level `beforeAll` (paired with `vi.unstubAllEnvs()` in `afterAll`) — same rationale as Task 2.3's `VITE_API_BASE` pinning, so a contributor `.env` drift can't silently shift the asserted URLs.
- Errors: throw `Error` with the GoTrue error message on non-2xx. The screens' MSW tests assert the specific shapes; the runtime caller catches and routes (inline error vs snackbar).
- `verifyToken` and `devPasswordSignIn` **must guard the 2xx body** before resolving: if the parsed JSON is missing `user.id` or `user.email` (or is not an object), throw the same `Error` shape used for non-2xx. Without the guard, a malformed-but-200 response from a future GoTrue version would produce a resolved promise with `user: undefined`, and the callback (Task 3.4) would call `setSignedIn(undefined)` — an impossible variant under R4. The guard is one runtime narrow per function; it makes the TS-pinned return type honest.
- The endpoint URL for the magic-link request is `/auth/otp` — pinned in `docs/architecture.md` (request-flow section) and `docs/development.md` (magic-link flow). `/auth/magiclink` is a GoTrue alias for the same handler and may be dropped in a future image; the docs and this client use the canonical `/otp` form. Both `verifyToken` and `devPasswordSignIn` import `AuthUser` from the session store (`$lib/shared/state/session.svelte`) so the user type is owned in exactly one place and consumers don't have to re-declare the shape.
- A colocated **`__mocks__/auth-client.ts`** ships in this task because `LoginRequest.test.ts` (Task 3.2c, dev-shortcut path) mocks it to assert call ordering on the spies (`setPendingLogin` before `goto`, the explicit `cairn-dev` password argument on `devPasswordSignIn`) — that contract is more naturally driven through `vi.mocked(...)` than through the network layer. The callback test (Task 3.4) deliberately does **not** mock this module: it runs the real `verifyToken` against MSW handler overrides on `/auth/verify`, mirroring Task 2.3's MSW-based shape for `postgrest.test.ts`. So this mock is single-consumer; per `.claude/skills/writing-tests.md`, a colocated mock is required when ≥2 tests share it, but the single-consumer case is still served here because Task 3.2c's mock surface is non-trivial (four functions × per-case override) and lifting the factory out of the test file keeps the per-case overrides readable. The mock exposes the four functions as `vi.fn()` with sensible default resolutions: `sendMagicLink` resolves; `verifyToken` resolves with `{ user: { id: '11111111-…', email: 'dev@example.test' } }` (matching the canonical seed user in `handlers.ts` from Task 2.1); `devPasswordSignIn` resolves with the same shape; `logout` resolves. Task 3.2c's test uses `vi.mock('$lib/auth/model/auth-client')` (bare; no factory) and overrides per-test via `vi.mocked(...).mockResolvedValueOnce(...)` or `.mockRejectedValueOnce(...)`.

**Reference:** `docs/architecture.md` "Request flow" section for the login-request narrative.

**Files:**
- `web/src/lib/auth/model/auth-client.ts` (create)
- `web/src/lib/auth/model/auth-client.test.ts` (create)
- `web/src/lib/auth/model/__mocks__/auth-client.ts` (create)

**Steps:**
1. RED — Create `auth-client.test.ts` with `vi.stubEnv('VITE_AUTH_BASE', '/auth')` in `beforeAll` and `vi.unstubAllEnvs()` in `afterAll`, then:
   - `sendMagicLink('alice@…')` POSTs `/auth/otp` with the right body.
   - `verifyToken({token: 'x', type: 'magiclink'})` POSTs `/auth/verify` and returns `{ user }` parsed from the 200 response body.
   - `verifyToken` throws when the 200 response body is missing `user.id` or `user.email` (override the MSW handler with `HttpResponse.json({ access_token: 'x' })` — no `user` field — and assert the function rejects rather than resolving with `{ user: undefined }`).
   - `devPasswordSignIn('alice@…', 'cairn-dev')` POSTs `/auth/token?grant_type=password` with the explicit password and returns `{ user }` parsed from the 200 response body. (No default-value branch — the password is a mandatory argument; the test passes the seed string explicitly.)
   - `devPasswordSignIn` throws when the 200 body is missing `user.id`/`user.email` (mirror the `verifyToken` malformed-200 test for the same reason).
   - `logout()` issues `DELETE /auth/session`.
   - Each function throws on non-2xx.
2. RED — `pnpm test auth-client.test`. Red.
3. GREEN — Implement `auth-client.ts` per Decisions (env-prefixed URLs, malformed-200 guard inside `verifyToken` and `devPasswordSignIn`).
4. GREEN — Create `__mocks__/auth-client.ts` exposing the four functions as `vi.fn()` with the default resolutions listed in Decisions.
5. GREEN — `pnpm test auth-client.test`. Green.

**Verify:** `cd web && pnpm test auth-client.test --run` (green) · `cd web && pnpm check` (green).

### [ ] 3.2 Land the `pending-login` state module with tests and mock

**Created:** 2026-05-13T12:11:12Z
**Completed:**

**Why:** R14's in-memory `pendingLogin` store carries the email between `LoginRequest` (Task 3.2c) and the `/auth/check` route (Task 3.5). Lands ahead of LoginRequest because the screen's submit handler imports `setPendingLogin`. Auto-clears on `signed-in` transition so a same-tab direct-visit to `/auth/check` after sign-in falls back to `/auth/login` (the email's purpose has been served). The store is a single property + two helpers — small enough to own its own task, but its `$effect.root` against the real `session` module is subtle enough to warrant a focused test file.

**Prerequisites:** Task 2.2 (the real `session` module — the auto-clear test uses it directly, not the mock).

**Decisions:**
- Lives at `web/src/lib/auth/state/pending-login.svelte.ts`. Exports:
  ```ts
  export const pendingLogin: { email: string | null };
  export function setPendingLogin(email: string): void;
  export function clearPendingLogin(): void;
  ```
  Backed by `let _pending = $state<{ email: string | null }>({ email: null })`; the exported `pendingLogin` is the proxy. `setPendingLogin` writes `_pending.email = email`; `clearPendingLogin` writes `_pending.email = null`. No HTTP, no `localStorage`, no `sessionStorage`, no `history.state`. The store is module-scoped so a hard reload of any page wipes it (R14's "feature, not a regression").
- **Auto-clear on `signed-in` (R14).** `pending-login.svelte.ts` imports `session` from `$lib/shared/state/session.svelte` (import direction is fine — `auth/state/` may consume `shared/state/`) and runs a module-scoped `$effect.root` that watches `session.current.status`. When it transitions into `signed-in`, the root assigns `_pending.email = null`. The store deliberately does **not** auto-clear on transitions to `signed-out` — a boot-driven 401 happens during the magic-link flow itself (the user typed an email and is now on `/auth/check`), and clearing then would wipe a flow-in-progress.
- **Tests use the real `session` module, not the mock.** `vi.mock(path)` is file-scope hoisted (`.claude/skills/writing-tests.md`); the file can't toggle real vs. mock between cases. Since the auto-clear effect reads `session.current.status` via the real reactivity graph, the test imports the real module and drives transitions through `setSignedIn` / `signOut` / `onUnauthorized` — same entrypoints any consumer would use. The non-network entrypoints (`setSignedIn`, `signOut`, `onUnauthorized`) don't fire HTTP, so MSW is not exercised here. **The "no auto-clear on signed-out" case (step 1 case 5) is the one exception that cannot be driven through public entrypoints alone** — there is intentionally no `setUnknown()` mutator on the session (no real flow ever transitions a resolved session back to `unknown`), so that case must directly assign `session.current = { status: 'unknown' }` via the proxy as its first line, before setting `pendingLogin.email`. The plan-wide invariant "mutate `session.current` wholesale, never property-by-property" still holds — assign a whole new `Session` object.
- **`beforeEach` reset is a deliberate extension of the `writing-tests.md` harness-lifecycle exception, not the exception itself.** The skill's narrow exception covers `vitest.setup.ts`'s RTL `cleanup()` and MSW `server.resetHandlers()`. Resetting `pendingLogin.email` and `session.current` in a per-file `beforeEach` is real module-singleton state, not harness state. The cleaner-but-rejected alternatives are (a) inline the resets at the top of each test (verbose, repeats four lines per test, and an easy thing to forget in case 6 someone adds later); (b) `vi.resetModules()` per test (re-evaluates the `$effect.root`, which silently changes test semantics — the effect would run twice on case 4's `setSignedIn`, once at re-import and once on the assignment, and tick-flushing semantics get confused). Per-file `beforeEach` for these two specific real-module resets is the least-bad path; flag it explicitly here so a future reviewer doesn't mistake it for casual skill-bending. **The reset uses direct proxy assignment (`session.current = { status: 'signed-out' }` and `_pending.email = null` via `clearPendingLogin()`), not `signOut()`.** `signOut()` fires a best-effort `DELETE /auth/session` (R5) — using it as a reset would pay an MSW round-trip per test for state the test could mutate synchronously, and would couple every test in the file to a network code path that has nothing to do with the auto-clear contract under test. The direct assignment is the same wholesale-replace pattern case 5 already uses for the `unknown` setup, kept consistent across all five cases.
- **`__mocks__/pending-login.svelte.ts`** is the surface other tests (LoginRequest, the `/auth/check` route) use to assert calls without dragging the `$effect.root` through their test trees. It exposes:
  - `pendingLogin: { email: string | null }` — a `$state`-backed proxy so consumer-mounted reads stay reactive in tests that re-render. Initial `email: null`.
  - `setPendingLogin = vi.fn((email: string) => { pendingLogin.email = email; })` — spy that also writes the post-condition.
  - `clearPendingLogin = vi.fn(() => { pendingLogin.email = null; })` — spy that also writes the post-condition.
  No `$effect.root` in the mock — auto-clear is exercised exclusively in `pending-login.test.ts` against the real module.

**Reference:** `.claude/skills/writing-tests.md` — runes-idiom mocks; the `vi.mock` file-scope hoisting rule that motivates "real module, drive via entrypoints" here.

**Files:**
- `web/src/lib/auth/state/pending-login.svelte.ts` (create)
- `web/src/lib/auth/state/pending-login.test.ts` (create)
- `web/src/lib/auth/state/__mocks__/pending-login.svelte.ts` (create)

**Steps:**
1. RED — Create `pending-login.test.ts` with five cases. The file imports both `pendingLogin`, `setPendingLogin`, `clearPendingLogin` from the real module **and** `session`, `setSignedIn`, `onUnauthorized` from the real `$lib/shared/state/session.svelte` (the test does not need to import `signOut` — see below). No `vi.mock` calls; the real reactivity graph is what makes the `$effect.root` fire. `beforeEach` resets state via `clearPendingLogin()` followed by a direct proxy assignment `session.current = { status: 'signed-out' }`, then `await tick()` so any reset-driven `$effect` flushes before the test runs. This is the same wholesale-replace pattern case 5 uses for the `unknown` setup; calling `signOut()` here is rejected per Decisions because it would fire a best-effort `DELETE /auth/session` (R5) on every test for state the test could mutate synchronously. The direct assignment is the harness-lifecycle exception in `.claude/skills/writing-tests.md` extended to real module-singleton state, called out in Decisions. Cases:
   - `pendingLogin.email` starts as `null`.
   - `setPendingLogin('alice@example.test')` makes `pendingLogin.email === 'alice@example.test'`.
   - `clearPendingLogin()` resets `pendingLogin.email` to `null`.
   - **Auto-clear on `signed-in` transition** — `setPendingLogin('alice@example.test')`, then **assert `pendingLogin.email === 'alice@example.test'`** (the pre-condition; pins that the clear-to-null in the next assertion came from the `$effect.root`, not from a missed setup step or a state leak). Then `setSignedIn({ id: 'u1', email: 'alice@example.test' })` (a deliberate-action entrypoint that writes `session.current = { status: 'signed-in', user }`), then `await tick()`, then assert `pendingLogin.email === null`. The real `$effect.root` ran because the real `session.current` is a `$state` proxy. **If `tick()` ever stops flushing module-scoped effects under a future Svelte/Vitest upgrade, swap to `import { flushSync } from 'svelte'` and call `flushSync()` instead of `await tick()` — `$effect.root` lives outside any component tree, and `flushSync` is the documented escape hatch for that case.**
   - **No auto-clear on `signed-out` transition** — start from `unknown` (the boot's pre-resolution state). Because there is no public `setUnknown()` entrypoint (no real flow transitions a resolved session back to `unknown`), this case begins with a direct proxy assignment: `session.current = { status: 'unknown' }`, then `await tick()` to let the `$effect.root` observe the reset. Then `setPendingLogin('alice@example.test')`, then `onUnauthorized()` (collapses `unknown` → `signed-out`), `await tick()`, and assert `pendingLogin.email === 'alice@example.test'` is **unchanged**. The flow-in-progress invariant from R14. The direct assignment is justified in the Decisions block — it is the deliberate, narrow exception to "drive transitions through public entrypoints".
2. RED — `pnpm test pending-login.test`. All red.
3. GREEN — Create `pending-login.svelte.ts` with the `$state`-backed proxy and the two mutator functions per Decisions. The module-scoped `$effect.root` watches `session.current.status` and writes `_pending.email = null` only on the transition into `signed-in`. Use `$effect.root(() => { $effect(() => { if (session.current.status === 'signed-in') _pending.email = null; }); })`; the inner `$effect` re-runs whenever the proxy notifies and the body is naturally idempotent.
4. GREEN — Create `__mocks__/pending-login.svelte.ts` per Decisions: `$state`-backed `pendingLogin` proxy plus `vi.fn()` spies for `setPendingLogin` and `clearPendingLogin` whose default implementations write the matching value into `pendingLogin.email`. No `$effect.root` in the mock.
5. GREEN — `pnpm test pending-login.test`. All green.

**Verify:** `cd web && pnpm test pending-login.test --run` (green) · `cd web && pnpm check` (green).

<!-- The lettered sub-task IDs 3.2 / 3.2b / 3.2c are a deliberate
deviation from `.claude/skills/writing-tasks.md`'s strict `N.M`
convention. Reason: this trio was added after the rest of Phase 3 was
already numbered (3.3 = LoginCheck, 3.4 = callback, 3.5 = routes), and
the lettered suffixes preserve those downstream IDs without renumbering
3.3 → 3.5 / 3.4 → 3.6 / 3.5 → 3.7. The convention says "Numbers are
stable; do not renumber" — so when extending a phase mid-plan, letter
suffixes are the cheap way to honour that rule. Future phases should
keep to plain `N.M`. -->

### [ ] 3.2b Land the `dev-shortcut` predicate module with tests and mock

**Created:** 2026-05-13T12:11:12Z
**Completed:**

**Why:** R8's dev login shortcut is gated by a single belt-and-braces predicate (`import.meta.env.DEV && import.meta.env.VITE_DEV_LOGIN_SHORTCUT === 'true'`). Pulling the gate into its own module gives `LoginRequest.test.ts` (Task 3.2c) a mockable surface so the dev-buttons-visible / dev-buttons-absent cases can toggle without poking `import.meta.env` directly.

**Prerequisites:** None.

**Decisions:**
- Lives at `web/src/lib/auth/model/dev-shortcut.ts`. Body:
  ```ts
  export function isDevLoginShortcutEnabled(): boolean {
    if (!import.meta.env.DEV) return false;
    return import.meta.env.VITE_DEV_LOGIN_SHORTCUT === 'true';
  }
  ```
  The `import.meta.env.DEV` check is defence-in-depth — in a production build Vite constant-folds `DEV` to `false` and Rollup tree-shakes the rest of the function, so even the env var check disappears. The env-var read is the **runtime opt-in** developers can flip in `.env` without rebuilding.
- Tests **don't** try to stub `import.meta.env.DEV` — Vitest 4.x's `vi.stubEnv('MODE', …)` may not re-derive `DEV`/`PROD` (they're Vite-computed booleans, sometimes sealed at config-load time), so a "dev shortcut absent" assertion that relies on flipping `DEV` would silently always pass. Tests stub the **env var** the predicate reads (`VITE_DEV_LOGIN_SHORTCUT`); the `DEV` belt-and-braces stays as untested production-build hygiene.
- **No colocated `__mocks__/dev-shortcut.ts`.** The only consumer is Task 3.2c's `LoginRequest.test.ts`; per `.claude/skills/writing-tests.md`, a `__mocks__/` file is required only when ≥2 tests would otherwise duplicate an inline factory. Task 3.2c inlines `vi.mock('$lib/auth/model/dev-shortcut', () => ({ isDevLoginShortcutEnabled: vi.fn(() => false) }))` and overrides per-case with `vi.mocked(isDevLoginShortcutEnabled).mockReturnValue(true)`. Mirrors the LoginRequest and LoginCheck decisions (also single-consumer, also no mock).

**Files:**
- `web/src/lib/auth/model/dev-shortcut.ts` (create)
- `web/src/lib/auth/model/dev-shortcut.test.ts` (create)

**Steps:**
1. RED — Create `dev-shortcut.test.ts` with two cases that mock `import.meta.env` via `vi.stubEnv('VITE_DEV_LOGIN_SHORTCUT', …)`: `isDevLoginShortcutEnabled()` returns `true` when the env var is `'true'`; returns `false` when the env var is absent or any other value. Use `vi.unstubAllEnvs()` in `afterEach`. (Tests don't try to flip `import.meta.env.DEV` — see Decisions.)
2. RED — `pnpm test dev-shortcut.test`. All red.
3. GREEN — Create `dev-shortcut.ts` per Decisions.
4. GREEN — `pnpm test dev-shortcut.test`. All green.

**Verify:** `cd web && pnpm test dev-shortcut.test --run` (green) · `cd web && pnpm check` (green).

### [ ] 3.2c Land `LoginRequest.svelte` with tests and mock

**Created:** 2026-05-13T12:11:12Z
**Completed:**

**Why:** The first user-facing auth surface (R1). Reads the visual target from `design/cairn-screens.jsx:120-174`.

**Prerequisites:** Tasks 2.1–2.3 (handlers, session, wrapper), Task 3.1 (auth client), Task 3.2 (pending-login), Task 3.2b (dev-shortcut).

**Decisions:**
- Lives at `web/src/lib/auth/components/LoginRequest.svelte`. Imports `Button` from `$lib/basic/components/Button.svelte`, `CairnGlyph` from `$lib/shared/components/CairnGlyph.svelte`, and `Snackbar` from `$lib/shared/components/Snackbar.svelte`.
- Renders the centered glyph, the "Cairn" wordmark, the italic tagline, an email input (`<input type="email" required>` with `data-test="login-email"`), and a primary "Send me a magic link" button (`data-test="login-submit"`).
- Submit disabled until the email is a syntactically valid address. Validity via the browser's `input.validity.valid`.
- **Submit is also disabled while a previous submit is in flight.** A local `let sending = $state(false)` is set to `true` immediately before the `await sendMagicLink(email)` and back to `false` in a `finally`. The primary submit button binds `disabled={!emailValid || sending}`. The dev-shortcut buttons share the same `sending` gate (they reuse the same `disabled={sending || …}` binding). Without this, a slow-connection user double-clicks and spawns multiple `POST /auth/otp` calls — duplicate magic-link emails race GoTrue's per-address rate limit and race each other (the user clicks an already-invalidated earlier link, lands on the callback's error state). One-line state plus the binding is cheap; the failure mode without it is a confusing 4xx with no obvious cause. Mirrors the resend-debounce contract Task 3.3 pins for `LoginCheck`.
- On submit: calls `sendMagicLink(email)` from `$lib/auth/model/auth-client.ts` (Task 3.1).
- 2xx → call `setPendingLogin(email)` from `$lib/auth/state/pending-login.svelte` (Task 3.2), **then** `goto('/auth/check')`. Call order is load-bearing: the store write must happen before the navigation so the check route mounts with `pendingLogin.email` already populated. The goto target is a **bare** `/auth/check` — no query string, ever — because R14 / the privacy decision in `PLAN.md` (Decisions, "Pass the pending email…") forbids the email from entering the URL. A future drive-by edit that adds `?email=` here is the regression this task's tests must catch.
- 4xx → render an inline error under the field with `data-test="login-error"`. Does not navigate; does **not** call `setPendingLogin` (the store stays at its previous value, typically `null` on first visit).
- 5xx / network error → flip a local `errorSnack = $state(false)` to `true` and render the `Snackbar` with a generic message and `data-test="login-snackbar"`. The Snackbar is mounted locally inside this component (there's no global Snackbar in `+layout` today); the parent owns `open` and `onclose` as the controlled-component contract requires. Does not call `setPendingLogin`.
- The dev login shortcut renders three secondary buttons under the field — `data-test="dev-login-alice"`, `…-bob`, `…-carol` — when the `isDevLoginShortcutEnabled()` predicate from Task 3.2b returns true. Each button awaits `devPasswordSignIn(<email>, import.meta.env.VITE_DEV_LOGIN_PASSWORD)` from the auth client, then calls `session.setSignedIn(user)` with the resolved user. Reading the password from the env var (rather than passing a hard-coded literal) means a production build (where `isDevLoginShortcutEnabled()` is `false`) has no plaintext credential in the bundle even when Rollup keeps the function reachable — **provided the prod build env does not set `VITE_DEV_LOGIN_PASSWORD`**. Vite statically replaces `import.meta.env.VITE_*` before Rollup tree-shakes, so a stray prod-env entry would inline the `cairn-dev` literal even when the call site is dead. The step-13 forward-note in `docs/development.md` carries this rule alongside `GOTRUE_DISABLE_SIGNUP=true`; pinning it here in the Decisions so a future contributor reading just this task sees the gate. The handler does **not** call `goto` itself — the route guard's signed-in-on-public-path redirect (R7 / Task 4.1) sees `/auth/login` is in `SIGNED_IN_REDIRECT_PATHS` and navigates to `/` with `replaceState: true`. Two reasons to let the layout carry the navigation: (a) only one redirect path to reason about, no race between an explicit `goto('/')` here and the layout's `goto('/', { replaceState: true })` competing in the same microtask flush; (b) the dev-shortcut handler stays narrowly focused on "complete the password grant + flip the session state" without owning navigation policy. The trade-off is a tighter coupling to the layout's redirect — if a future change to the guard breaks the signed-in-on-public-path branch, the dev shortcut breaks with it, and the dev-shortcut tests don't directly assert the user lands on `/`. The `+layout.test.ts` case "signed-in on `/auth/login` redirects to `/` with `replaceState: true`" (R7, Task 4.1) is the load-bearing test that this dev-shortcut implicitly depends on; the dev-shortcut test asserts only that `setSignedIn` was called with the resolved user. The callback page (R3 / Task 3.4) is different because `/auth/callback` is *excluded* from `SIGNED_IN_REDIRECT_PATHS`, so the callback owns its `goto('/', { replaceState: true })` explicitly.
- The component imports `isDevLoginShortcutEnabled` from `$lib/auth/model/dev-shortcut` and reads it once at component init to gate the dev buttons.
- **Dev-shortcut failures surface through the same Snackbar as the magic-link 5xx branch.** If `devPasswordSignIn` rejects (GoTrue 4xx because `VITE_DEV_LOGIN_PASSWORD` was empty or stale, network failure, or any other non-2xx), the handler flips the same `errorSnack = $state(false)` local that the magic-link 5xx branch flips and renders the same `data-test="login-snackbar"` instance with the same generic message. Without this, the dev shortcut button silently does nothing on rejection — the handler awaits a rejected promise, no UI changes, and the developer hitting the failure has no signal to investigate. Reusing the magic-link Snackbar surface (rather than adding a second one) keeps the per-component error vocabulary to one element and one `data-test`.
- **Generic Snackbar message is pinned to a fixed string** so a designer-side reviewer doesn't have to invent it and so test assertions on the snackbar text don't churn. The message rendered in both the magic-link 5xx branch and the dev-shortcut rejection branch is the literal: `Couldn't reach the server. Try again.` (no trailing period inside punctuation; no exclamation; matching the tone of the rest of the auth surface).
- **No colocated `__mocks__/LoginRequest.svelte`.** Per `.claude/skills/writing-tests.md`, a `__mocks__/` file earns its keep only when ≥2 tests would otherwise duplicate an inline factory. The login route (`/auth/login/+page.svelte`, Task 3.5) is a thin shell with no test, and `+layout.test.ts` (Task 4.1) uses a stub child snippet rather than mounting the real route children — there is no consumer to justify the mock. If a future task adds a second consumer of `LoginRequest`, this is the moment to create the mock; not before.

**Reference:** `design/cairn-screens.jsx:120-174` for the visual layout (re-implement idiomatically; do not port React verbatim).

**Files:**
- `web/src/lib/auth/components/LoginRequest.svelte` (create)
- `web/src/lib/auth/components/LoginRequest.test.ts` (create)
- `web/.env.example` (modify — append `VITE_DEV_LOGIN_PASSWORD=cairn-dev` so a fresh checkout's dev shortcut works out of the box; keep the value in sync with R9's seed password)

**Steps:**
1. RED — Create `LoginRequest.test.ts` with the cases from R12. The test mocks `$lib/auth/model/auth-client` (Task 3.1's colocated mock), `$lib/auth/state/pending-login.svelte` (Task 3.2's colocated mock), `$lib/shared/state/session.svelte` (Task 2.2's colocated mock), `$lib/auth/model/dev-shortcut` (inline `vi.mock('$lib/auth/model/dev-shortcut', () => ({ isDevLoginShortcutEnabled: vi.fn(() => false) }))` — no colocated mock, single consumer per Task 3.2b Decisions), and `$app/navigation` (inline `vi.mock('$app/navigation', () => ({ goto: vi.fn() }))`). Pins `VITE_DEV_LOGIN_PASSWORD` via `vi.stubEnv('VITE_DEV_LOGIN_PASSWORD', 'cairn-dev')` in `beforeAll` (paired with `vi.unstubAllEnvs()` in `afterAll`) so the dev-shortcut handler reads a known value rather than whatever the contributor's `.env` happens to set. Cases:
   - disabled-until-valid email submit.
   - **submit disabled while a previous call is in flight, AND the shared gate disables all dev-shortcut buttons too** — override the auth-client mock so `sendMagicLink` returns a manually-controlled promise (`let resolveSend!: () => void; vi.mocked(sendMagicLink).mockImplementationOnce(() => new Promise(r => { resolveSend = r; }))`). Render with `vi.mocked(isDevLoginShortcutEnabled).mockReturnValue(true)` so the dev buttons are present in this case (different from the default which mocks it to `false`). Type a valid email, click `login-submit`, then attempt a second click before resolving. Assert the submit button has `disabled` set after the first click and `vi.mocked(sendMagicLink)` was called exactly once. **Also assert `dev-login-alice`, `dev-login-bob`, and `dev-login-carol` all have `disabled` set** — R1 specifies a single shared `sending` $state across the magic-link submit and all three dev-shortcut buttons. A regression where each button has its own gate (clicking the magic-link submit leaves the dev buttons clickable) would let an itchy user spawn parallel `/auth/token` calls during a slow magic-link request, exactly the failure mode R1's shared-gate contract exists to prevent. Then call `resolveSend()`, `await tick()`, and assert `login-submit` plus all three dev buttons are enabled again.
   - valid submit calls `sendMagicLink` and writes `pendingLogin.email` (assert via the mock spy) **before** navigating to a bare `/auth/check` — assert call order with `expect(vi.mocked(setPendingLogin).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(goto).mock.invocationCallOrder[0])` (Vitest exposes invocation order via `mock.invocationCallOrder`; `toHaveBeenCalledBefore` is a `jest-extended` matcher and is not installed) and assert the goto argument is exactly the string `'/auth/check'` (no `?email=`, no `?` at all — `expect(goto).toHaveBeenCalledWith('/auth/check')`).
   - 4xx renders the inline error, does **not** navigate, and does **not** call `setPendingLogin`.
   - 5xx opens the Snackbar (`data-test="login-snackbar"`) and likewise does **not** call `setPendingLogin`. `Snackbar.svelte:18-22` schedules a real `setTimeout(onclose, 6000)` whenever `open` is true; the test **MUST** wrap this case in `vi.useFakeTimers()` before render and `vi.useRealTimers()` after, so the 6-second timer cannot fire on a torn-down component or leak into the next test. The test asserts the Snackbar is present immediately after the failing submit settles (no need to advance the fake clock — the assertion is on the `open` paint, not the auto-dismiss); fake timers are required for cleanup determinism, not for the assertion itself.
   - Dev shortcut buttons appear when `isDevLoginShortcutEnabled` is mocked to return `true` (via `vi.mocked(isDevLoginShortcutEnabled).mockReturnValue(true)`). Pin **all three** by `data-test`: assert `queryByDataTest('dev-login-alice')`, `queryByDataTest('dev-login-bob')`, `queryByDataTest('dev-login-carol')` are each non-null. A regression that drops Bob (or adds Dave) would pass a "buttons appear" check that only counted; the per-name assertion catches it.
   - Dev shortcut buttons absent when the mock returns `false` (the default) — assert each of the three `data-test`s queries to `null`.
   - Dev shortcut click awaits the password-grant helper and calls `session.setSignedIn` with the resolved user — assert call order via `vi.mocked(...)` spies. Also assert `devPasswordSignIn` was invoked with the stubbed password as the second argument (`expect(vi.mocked(devPasswordSignIn)).toHaveBeenCalledWith('alice@example.test', 'cairn-dev')`) so a regression that reintroduced a hard-coded default (or read from the wrong env var) is caught. The handler does **not** call `goto`: assert `expect(vi.mocked(goto)).not.toHaveBeenCalled()` (the layout's signed-in-on-public-path redirect, exercised in `+layout.test.ts`, is what carries the navigation in production; here we only verify the dev-shortcut's contribution to that contract is `setSignedIn`).
   - **Dev shortcut button is disabled while the previous click is in flight, AND the shared gate disables the other dev buttons and the magic-link submit too.** Mirror of the magic-link submit's in-flight test, but driven from `dev-login-alice`: override the auth-client mock so `devPasswordSignIn` returns a manually-controlled promise (`let resolveSignin!: (v: { user: AuthUser }) => void; vi.mocked(devPasswordSignIn).mockImplementationOnce(() => new Promise(r => { resolveSignin = r; }))`). Render with `vi.mocked(isDevLoginShortcutEnabled).mockReturnValue(true)`. Click `dev-login-alice`, then attempt a second click before resolving. Assert `dev-login-alice` has `disabled` set after the first click and that `vi.mocked(devPasswordSignIn)` was called exactly once. **Also assert `dev-login-bob`, `dev-login-carol`, and `login-submit` all have `disabled` set** — same shared-`sending` contract R1 spells out (single $state across the four affordances). Without this cross-button assertion, a regression that gives each button its own gate ships an itchy-double-click bug where clicking Alice still lets Bob and the magic-link submit fire and spawns parallel `/auth/token` or `/auth/otp` calls. Then call `resolveSignin({ user: { id: '…', email: 'alice@example.test' } })`, `await tick()`, and assert all four affordances are enabled again.
   - **Dev shortcut rejection renders the same Snackbar as the magic-link 5xx branch.** Override the auth-client mock so `devPasswordSignIn` rejects (`vi.mocked(devPasswordSignIn).mockRejectedValueOnce(new Error('boom'))`). Wrap in `vi.useFakeTimers()` (same reason as the magic-link 5xx case — the Snackbar's auto-dismiss `setTimeout` must not leak). Click `dev-login-alice`, await the microtask, assert `getByDataTest('login-snackbar')` renders with text `"Couldn't reach the server. Try again."` and assert `vi.mocked(setSignedIn)` was **not** called. Without this case, a regression where the dev-shortcut click swallows the rejection silently leaves the developer hitting the failure with no UI signal.
   - **No-TopBar regression guard** — assert `container.querySelector('header') === null` after render (`LoginRequest`'s design at `design/cairn-screens.jsx:120-174` is a flat screen with no top chrome; the same structural check `LoginCheck.test.ts` uses, applied here so a future contributor who adds `<TopBar>` to either screen is caught by paired guards rather than one).
2. RED — Run `pnpm test LoginRequest.test`. Several red tests.
3. GREEN — Create `LoginRequest.svelte` implementing the screen with `data-test` attributes per Decisions. Use scoped `<style>` consuming the design tokens (paper, ink, stone, rule, accent). Import `setPendingLogin` from `$lib/auth/state/pending-login.svelte` and call it on 2xx before `goto`. Import `isDevLoginShortcutEnabled` from `$lib/auth/model/dev-shortcut` and read it once at component init to gate the dev buttons.
4. GREEN — Append `VITE_DEV_LOGIN_PASSWORD=cairn-dev` to `web/.env.example` (matches the seed password set in Task 1.2). No mock file — see Decisions.
5. GREEN — Re-run `pnpm test LoginRequest.test`. Green.

**Verify:** `cd web && pnpm test LoginRequest.test --run` (green) · `cd web && pnpm check` (green).

### [ ] 3.3 Land `LoginCheck.svelte` with tests and mock

**Created:** 2026-05-13T12:11:12Z
**Completed:**

**Why:** The "we sent you a link" screen (R2). Visual target at `design/cairn-screens.jsx:177-212`.

**Prerequisites:** Task 3.1 (the `sendMagicLink` helper that "Send again" reuses).

**Decisions:**
- Lives at `web/src/lib/auth/components/LoginCheck.svelte`. Props: `email: string`. The component reads `email` from props — it has no knowledge of where the value comes from. Task 3.5's `/auth/check/+page.svelte` reads `pendingLogin.email` (R14) from the auth-state store and passes it through; the email **never** comes from the URL.
- Renders the green check-mail icon disc, the "Check your inbox" heading (`data-test="login-check-heading"`), the body with the email in bold (`data-test="login-check-email"`), and a "Send again" affordance (`data-test="login-check-resend"`).
- On "Send again": calls `sendMagicLink(email)` again. **Render a small inline confirmation** ("Sent again." with `data-test="login-check-resend-confirmation"`) after the call resolves successfully; the confirmation auto-clears after 3 seconds. Without visible feedback, an itchy user clicks the affordance, sees the brief disabled state pass, and has no signal that a second email actually fired — they're left wondering whether to click again or check their inbox. The 3-second auto-clear is short enough to not clutter the screen but long enough to register; pair with the in-flight `disabled` state below so the round-trip reads as "clicked → disabled → confirmed → cleared".
- **Debounce while in flight.** A local `let sending = $state(false)` is set to `true` immediately before the `await sendMagicLink(email)` and set back to `false` in a `finally`. The "Send again" affordance is disabled (button `disabled={sending}`) while `sending` is true. Without this, an itchy user can fire multiple `POST /auth/otp` in rapid succession, generating multiple magic-link emails that race against GoTrue's per-address rate limit and against each other (the user may click an already-invalidated link from an earlier message). One-line state plus `disabled` binding is cheap; the failure mode without it is a 4xx on the callback page with no obvious cause.
- **No TopBar.** `design/cairn-screens.jsx:177-212` renders LoginCheck as a flat screen — centered icon disc, heading, body, inline accent-coloured "Send again" — with no top chrome. The back affordance is whatever the browser / OS provides (system back, gesture back, browser back); these all call `history.back()` and return the user to `/auth/login` because LoginRequest → LoginCheck was a normal `goto()` that pushed a history entry. Adding a TopBar would diverge from the design without earning anything; if a future iteration wants in-app navigation chrome here it can be added then. The regression test asserts there is no `<header>` element in the rendered DOM (`container.querySelector('header')` is null) — `TopBar.svelte:20` only applies `data-test="topbar"` when the caller passes one, so a `data-test`-based check would silently miss a TopBar re-added without that attribute. The structural `<header>` check is tight.
- "Send again" renders as accent-coloured inline text (a `<button>` element under the hood for keyboard / accessibility, styled to match the design's inline appearance — not the `Button` primitive's pill shape).
- **No colocated `__mocks__/LoginCheck.svelte`.** Per `.claude/skills/writing-tests.md`, a `__mocks__/` file earns its keep only when ≥2 tests would otherwise duplicate an inline factory. The only consumer is Task 3.5's `auth/check/+page.test.ts`; that test inlines `vi.mock('$lib/auth/components/LoginCheck.svelte', factory)` with a small stub. Mirrors the decision Task 3.2c makes for LoginRequest (also single-consumer, also no mock).

**Reference:** `design/cairn-screens.jsx:177-212` for the visual layout.

**Files:**
- `web/src/lib/auth/components/LoginCheck.svelte` (create)
- `web/src/lib/auth/components/LoginCheck.test.ts` (create)

**Steps:**
1. RED — Create `LoginCheck.test.ts`:
   - Renders the heading and the email from the `email` prop.
   - "Send again" calls `sendMagicLink(email)`.
   - **"Send again" is disabled while the previous call is in flight.** Override the auth-client mock so `sendMagicLink` returns a manually-controlled promise (`let resolveSend!: () => void; vi.mocked(sendMagicLink).mockImplementationOnce(() => new Promise(r => { resolveSend = r; }))`). Click "Send again", then attempt to click it a second time before resolving the promise. Assert the button has `disabled` set after the first click, and assert `vi.mocked(sendMagicLink)` was called exactly once. Then call `resolveSend()`, `await tick()`, and assert the button is enabled again.
   - **"Sent again." confirmation appears after a successful resend and auto-clears.** Wrap the test in `vi.useFakeTimers()` (the auto-clear schedules a `setTimeout`). Click "Send again", `await tick()` so the resolved-promise branch runs, assert `getByDataTest('login-check-resend-confirmation')` renders with text "Sent again.". Advance `vi.advanceTimersByTime(3001)`, `await tick()`, assert `queryByDataTest('login-check-resend-confirmation')` is `null`. Restore real timers in the test's cleanup. Without this case, a regression that drops the confirmation (or never schedules its clear) ships silently — the user gets no signal that the resend actually fired.
   - The component renders no TopBar — assert `container.querySelector('header')` is null (structural check; tighter than a `data-test`-based one because `TopBar.svelte` only emits `data-test="topbar"` when the caller passes that prop). A future contributor who re-adds `<TopBar>` — with or without a `data-test` — is caught by this regression guard.
2. RED — `pnpm test LoginCheck.test`. Red.
3. GREEN — Create `LoginCheck.svelte` per Decisions.
4. GREEN — `pnpm test LoginCheck.test`. Green.

**Verify:** `cd web && pnpm test LoginCheck.test --run` (green) · `cd web && pnpm check` (green).

### [ ] 3.4 Land the callback page (`web/src/routes/auth/callback/+page.svelte`) with tests

**Created:** 2026-05-13T12:11:12Z
**Completed:**

**Why:** The user lands here from the magic-link email; the page completes the exchange and redirects (R3). The route is the third public path the route guard (Task 4.1) allows.

**Prerequisites:** Task 3.1 (the `verifyToken` helper).

**Decisions:**
- Lives at `web/src/routes/auth/callback/+page.svelte`. No standalone component — the route file is the screen.
- **Signed-in short-circuit at the top of `onMount`.** Before reading the query string, `await bootSession()` so the session has resolved, then check `session.current.status === 'signed-in'` — if true, call `goto('/', { replaceState: true })` and return without touching `verifyToken`. R3's carve-out: a user who already has a valid session and clicks an old magic link from email shouldn't see the error state after GoTrue rejects the stale token; they should land at `/`. The `await` is load-bearing — `+layout.svelte`'s own `onMount` fires `bootSession()` asynchronously, and the callback page's `onMount` typically runs while `session.current.status` is still `unknown`; reading the status without awaiting boot would miss the signed-in case and fall through to `verifyToken` with a stale token. `bootSession()` itself is naturally idempotent (its 2xx and 401 branches both only write when `status === 'unknown'`, per R4), so awaiting a boot that's already mid-flight from the layout converges safely. The route guard (R7 / Task 4.1) deliberately excludes `/auth/callback` from its signed-in→`/` redirect (so first-visit verification can complete), which is why this short-circuit lives here, not in the guard.
- On mount (after the signed-in short-circuit): read `token` and `type` from `page.url.searchParams` (`import { page } from '$app/state'` — the Svelte 5 / SvelteKit 2 runes-aware API, not the legacy `$app/stores` prefix-store `$page`. The whole plan standardises on `$app/state`). The page renders the error state without calling `/auth/verify` when:
  - `token` is missing or empty, **or**
  - `type` is anything other than the literal string `'magiclink'`.
  The runtime check on `type` is load-bearing because `verifyToken`'s TS signature pins `type: 'magiclink'` (Task 3.1) — a `URLSearchParams` value is a free-form string, so the route owns the narrowing before calling. R3 requires this ("On error (token expired, network failure, or a non-magic-link `type`)").
- Call `verifyToken({ token, type: 'magiclink' })` from `$lib/auth/model/auth-client.ts` once the narrowing succeeds. The function resolves to `{ user }` parsed from the verify response (Task 3.1).
- On 2xx: the Vite shim has planted the cookie. **Call `session.setSignedIn(user)` (Task 2.2) first**, **then** `goto('/', { replaceState: true })`. Call order is load-bearing — `bootSession()` has already resolved to `signed-out` by the time this page mounts (no cookie at first paint), so without `setSignedIn` the route guard sees `signed-out` after the goto and bounces the user back to `/auth/login`. `replaceState` is load-bearing per `docs/ui.md:148` so back doesn't return to the single-use callback URL.
- On 4xx/5xx: render an inline error with a "Back to sign in" link (`data-test="callback-error-back"`) that navigates to `/auth/login`.
- Loading state while the POST is in flight: render "Verifying…" with `data-test="callback-loading"`.
- The route file colocated test is `+page.test.ts` in the same directory.

**Reference:** `docs/ui.md:148` for the `replaceState` rule.

**Files:**
- `web/src/routes/auth/callback/+page.svelte` (create)
- `web/src/routes/auth/callback/+page.test.ts` (create)
- `web/src/lib/test/app-state-mock.svelte.ts` (create — shared `$state`-backed `$app/state` mock; reused by Task 3.5 and Task 4.1)

**Steps:**
1. RED — Create `app-state-mock.svelte.ts` first: a `.svelte.ts` file exporting a runes-backed `page` proxy so tests can reassign `page.url` mid-test and have the change propagate through `$derived` / `$effect`. Body: `let _url = $state(new URL('http://localhost/')); export const page = { get url() { return _url; }, set url(v: URL) { _url = v; } };`. The same file is reused by Tasks 3.5 and 4.1 — declaring it here (the first task that needs `$app/state` driven) prevents three test files reinventing it inconsistently.
2. RED — Create `+page.test.ts`. Mock `$app/state` via `vi.mock('$app/state', async () => await import('$lib/test/app-state-mock.svelte'))` so the test can assign `page.url = new URL('http://localhost/auth/callback?token=…&type=magiclink')` before render. Cases:
   - Renders the loading state on mount.
   - POSTs `/auth/verify` with `{token, type: 'magiclink'}` via MSW assertion.
   - On 200, calls `session.setSignedIn(user)` with the user from the verify response, **then** `goto('/', { replaceState: true })` — mock `$app/navigation`'s `goto` via an inline `vi.mock('$app/navigation', () => ({ goto: vi.fn() }))` factory (SvelteKit virtual modules have no source file to colocate a `__mocks__/` next to), and mock the session module via its colocated `__mocks__/session.svelte.ts` (Task 2.2). Assert call order via `expect(vi.mocked(setSignedIn).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(goto).mock.invocationCallOrder[0])` — Vitest exposes invocation order via `mock.invocationCallOrder`; `toHaveBeenCalledBefore` is a `jest-extended` matcher and is not installed.
   - On 401, renders the error state with the "Back to sign in" affordance and does **not** call `setSignedIn` or `goto`.
   - On 5xx (override the MSW handler with a `503` response) and on network failure (override with `HttpResponse.error()`), renders the error state with the "Back to sign in" affordance and does **not** call `setSignedIn` or `goto`. R3 explicitly contracts the "token expired, network failure, or non-magic-link type" envelope as one recoverable error path; pinning both the 5xx and the rejected-fetch cases protects against a regression that swallows the rejection into a silent loading state.
   - On missing `token` query param, renders the error state immediately without calling `/auth/verify`.
   - On `type` other than `'magiclink'` (e.g. `type=recovery`), renders the error state immediately without calling `/auth/verify`.
   - When `session.current.status === 'signed-in'` at mount (set via the colocated session mock before render), the route calls `goto('/', { replaceState: true })` and does **not** call `/auth/verify` at all — install a spied MSW handler (`const verifyHandler = vi.fn(() => HttpResponse.json({ access_token: 'x', user: { id: '…', email: '…' } })); server.use(http.post('*/auth/verify', verifyHandler));`), then assert `expect(verifyHandler).not.toHaveBeenCalled()` and `expect(goto).toHaveBeenCalledWith('/', { replaceState: true })`. This is R3's signed-in short-circuit, protecting against an already-authenticated user landing on the error state after clicking an old magic link. The MSW-based counter is the consistent shape here: `auth-client` is the real module in this test (per Task 3.1 Decisions), so a `vi.mocked(verifyToken)` spy isn't available — the network layer is the only place to observe whether the call happened.
   - **Boot-race short-circuit**: when `session.current.status === 'unknown'` at mount and `bootSession()` resolves to `signed-in` before the route's first read of the status (the realistic timing in production — the layout's `bootSession()` is in flight when the callback page mounts), the route still short-circuits: `/auth/verify` is **not** called and `goto('/', { replaceState: true })` fires. Because `$lib/shared/state/session.svelte` is `vi.mock`ed at file scope, the auto-mock's `bootSession` is a no-op `vi.fn(async () => {})` — driving the race through MSW would never fire. Drive the race directly through the session mock: set `session.current = { status: 'unknown' }` before render, then override the mocked boot via `vi.mocked(bootSession).mockImplementationOnce(async () => { await tick(); session.current = { status: 'signed-in', user: { id: '11111111-…', email: 'dev@example.test' } }; });` (the `await tick()` makes the resolve cross a microtask so the callback's `await bootSession()` actually pauses), render the callback page, `await tick()`. Install the same spied MSW handler on `/auth/verify` as in the previous case, then assert `expect(verifyHandler).not.toHaveBeenCalled()` and `expect(goto).toHaveBeenCalledWith('/', { replaceState: true })`. Without the `await bootSession()` in the route's mount, this case falls through to `/auth/verify` — the regression guard against the foreseeable bug.
3. RED — `pnpm test auth/callback`. Red.
4. GREEN — Create `+page.svelte` per Decisions.
5. GREEN — `pnpm test auth/callback`. Green.

**Verify:** `cd web && pnpm test auth/callback --run` (green).

### [ ] 3.5 Land the login route (`/auth/login`) and the check route (`/auth/check`)

**Created:** 2026-05-13T12:11:12Z
**Completed:**

**Why:** The thin SvelteKit routes that mount the screens. The split (component vs route) is the convention: routes are the URL-binding shell, components are the reusable UI. `/auth/check` additionally owns the **store-to-prop translation** for the `pendingLogin` email (R14) and the **fallback redirect** when the store is empty — that's enough logic to deserve a dedicated test file.

**Prerequisites:** Tasks 3.1, 3.2 (pending-login state module), 3.2c (LoginRequest screen), 3.3 (LoginCheck screen).

**Decisions:**
- `web/src/routes/auth/login/+page.svelte` — imports `LoginRequest` and renders it. No additional state. No test file — too thin to be worth re-testing.
- `web/src/routes/auth/check/+page.svelte` — imports `pendingLogin` from `$lib/auth/state/pending-login.svelte`. Reads `pendingLogin.email` (a string or `null`). Branches:
  - `email !== null` → renders `<LoginCheck {email} />` (passes the value as the prop).
  - `email === null` → calls `goto('/auth/login', { replaceState: true })` from `$app/navigation` and renders nothing (an `{#if}` over the email keeps the DOM empty while the redirect is in flight). `replaceState: true` so a back-press from `/auth/login` doesn't bounce the user back to the empty `/auth/check`.
- The route file does **not** read `page.url.searchParams` — R14's privacy contract forbids the email in the URL. A direct visit to `/auth/check?email=alice@example.test` is treated the same as a direct visit to bare `/auth/check`: the store is empty, the route redirects. The query param is silently dropped, not read. The Playwright spec (Task 5.2) asserts the URL stays bare on the happy path.
- Co-located test at `web/src/routes/auth/check/+page.test.ts` mocks `$lib/auth/state/pending-login.svelte` (the `__mocks__/pending-login.svelte.ts` mock from Task 3.2) so the test can drive `pendingLogin.email`, mocks `$app/navigation` to capture `goto` calls, and mocks `$app/state` via the shared `$state`-backed helper `web/src/lib/test/app-state-mock.svelte.ts` (landed in Task 3.4) so the third case can assign `page.url = new URL('http://localhost/auth/check?email=alice@example.test')` and assert the route ignores the query string. `LoginCheck` is mocked **inline** via `vi.mock('$lib/auth/components/LoginCheck.svelte', () => ({ default: <small stub component that renders the received `email` prop under a `data-test` attribute the assertion can query> }))` — there is no colocated `__mocks__/LoginCheck.svelte` (single consumer, per `.claude/skills/writing-tests.md`'s ≥2-consumer rule, mirroring the LoginRequest decision).

**Files:**
- `web/src/routes/auth/login/+page.svelte` (create)
- `web/src/routes/auth/check/+page.svelte` (create)
- `web/src/routes/auth/check/+page.test.ts` (create)

**Steps:**
1. RED — Create `auth/check/+page.test.ts` with three cases:
   - `pendingLogin.email = 'alice@example.test'` before render → renders `LoginCheck` with `email="alice@example.test"` as the prop (assert by mocking `LoginCheck` and inspecting the props the mock received, or by querying for the mock's `data-test` if it forwards the email).
   - `pendingLogin.email = null` before render → calls `goto('/auth/login', { replaceState: true })` on mount and does **not** render `LoginCheck` (assert via `queryByDataTest` returning null for any `LoginCheck` data-test).
   - Visiting `/auth/check?email=alice@example.test` directly: the route does **not** read the query string. Simulate by setting the mock `$app/state` `page.url` to `new URL('http://localhost/auth/check?email=alice@example.test')` and leaving `pendingLogin.email = null`. Assert: redirect fires, no email is read from the URL. (This is the regression guard against a future "convenience" patch that re-introduces URL reading.)
2. RED — `pnpm test auth/check`. All red.
3. GREEN — Create both route files per Decisions.
4. GREEN — `pnpm test auth/check`. All green.
5. GREEN — `pnpm dev` and manually navigate to `http://localhost:5173/auth/login`. Confirm the screen renders. Submit a test email and confirm navigation to a **bare** `/auth/check` (no query string), and that the address shows up in the body.

**Verify:** `cd web && pnpm test auth/check --run` (green) · `cd web && pnpm dev` (then manually verify the two routes render and the `/auth/check` URL stays bare after submitting) · `cd web && pnpm check` (green).

## Phase 4 — Layout integration: route guard + Sign Out

Phase 4 wires the session store into `+layout.svelte`, adds the route guard, and drops a temporary Sign Out button on the placeholder `/` page so the E2E spec has something to click.

### [ ] 4.1 Boot the session and gate render on `+layout.svelte`

**Created:** 2026-05-13T12:11:12Z
**Completed:**

**Why:** The route guard depends on a resolved session state. Block-render on `unknown` prevents the authed-content-flash described in PLAN.md's Decisions. Once Phase 4 ships, an unauthenticated visit to `/` redirects to `/auth/login`.

**Prerequisites:** Task 2.2 (session store), Tasks 3.1, 3.2, 3.2b, 3.2c, 3.3, 3.4, 3.5 (auth screens exist so the redirect goes somewhere real).

**Decisions:**
- Import `session` and `bootSession` from `$lib/shared/state/session.svelte`.
- Import `PUBLIC_AUTH_PATHS`, `SIGNED_IN_REDIRECT_PATHS`, and `isSegmentMatch` from `$lib/shared/model/auth-paths` (the helpers landed in Task 1.4). **Do NOT redefine any path list or the matching predicate inline.** Task 1.4's module is the single home for segment-anchored auth-path matching across the proxy bypass, the bearer-attach narrow, the cookie-plant narrow, the DELETE matcher, and this guard; an inline `startsWith` or an inline `['/auth/login', '/auth/check']` here would silently drift from the other sites. A future fourth public auth path is one edit in `auth-paths.ts` plus its colocated test — the layout picks it up by re-import.
- In `+layout.svelte`'s `<script>`: call `bootSession()` on mount via `onMount`. (`$effect.pre` would also work but introduces SSR-vs-CSR semantic differences that aren't load-bearing here; `onMount` is the simpler choice and matches what the snippet below assumes.)
- The block-render gate is wider than just `unknown` — it also covers `signed-out`-on-a-private-path. Without that widening, the `$effect` redirect fires *after* the next paint, briefly mounting the private route's children (R7). Wrap the existing `{@render children()}` in:
  ```svelte
  <script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { session, bootSession } from '$lib/shared/state/session.svelte';
    import {
      PUBLIC_AUTH_PATHS,
      SIGNED_IN_REDIRECT_PATHS,
      isSegmentMatch
    } from '$lib/shared/model/auth-paths';
    import CairnWordmark from '$lib/shared/components/CairnWordmark.svelte';

    const blocked = $derived(
      session.current.status === 'unknown' ||
      (session.current.status === 'signed-out' &&
        !isSegmentMatch(page.url.pathname, PUBLIC_AUTH_PATHS)) ||
      (session.current.status === 'signed-in' &&
        isSegmentMatch(page.url.pathname, SIGNED_IN_REDIRECT_PATHS))
    );

    onMount(() => { bootSession(); });

    $effect(() => {
      if (session.current.status === 'signed-out') {
        if (isSegmentMatch(page.url.pathname, PUBLIC_AUTH_PATHS)) return;
        goto('/auth/login', { replaceState: true });
        return;
      }
      if (session.current.status === 'signed-in') {
        if (isSegmentMatch(page.url.pathname, SIGNED_IN_REDIRECT_PATHS)) {
          goto('/', { replaceState: true });
        }
      }
    });
  </script>

  {#if blocked}
    <div data-test="boot-screen" class="boot-screen">
      <CairnWordmark size={48} />
    </div>
  {:else}
    {@render children()}
  {/if}
  ```
  The boot screen is **inline markup**, not a separate `BootScreen.svelte` component — at ~3 lines it doesn't earn its own file, and inlining keeps the layout self-contained. The `data-test="boot-screen"` attribute is what the colocated test queries to assert the block-render gate is active. The wrapper `<div>` carries the centering style; the existing `CairnWordmark` component is imported from `$lib/shared/components/CairnWordmark.svelte`.
- The boxed-state access path is `session.current.status` (not `session.status`) per Task 2.2's narrowing-preserving design. Same for `isSegmentMatch(page.url.pathname, PUBLIC_AUTH_PATHS)` — `page.url.pathname` is already query-stripped, so the helper composes cleanly.
- The colocated test `+layout.test.ts` asserts the guard cases listed in R12. The test owns its own mocks for both SvelteKit modules:
  - `vi.mock('$app/navigation', () => ({ goto: vi.fn() }))` — gives each test a `goto` spy it can assert on via `expect(goto).toHaveBeenCalledWith('/auth/login', { replaceState: true })`.
  - `vi.mock('$app/state', ...)` — `$app/state` has no source file in `web/src/` to colocate a `__mocks__/` next to (it's a SvelteKit virtual module), so reuse the `.svelte.ts` mock file at `web/src/lib/test/app-state-mock.svelte.ts` landed in Task 3.4 (body: `let _url = $state(new URL('http://localhost/')); export const page = { get url() { return _url; }, set url(v: URL) { _url = v; } }`), then inline `vi.mock('$app/state', async () => await import('$lib/test/app-state-mock.svelte'))`. The runes-backed `_url` makes `page.url` reactive — mid-test assignments (`page.url = new URL('http://localhost/some-path')`) re-fire the layout's `$derived` and `$effect`, which is load-bearing for the new "signed-in on public path → redirect to `/`" case and any future case that needs to observe behaviour across a path change without remounting. Each test (or `beforeEach` for harness-lifecycle resets) sets `page.url` to a fresh URL before rendering; the `$state` proxy guarantees the layout sees the assignment.
  - `vi.mock('$lib/shared/state/session.svelte')` — picks up the runes-idiom mock from `__mocks__/session.svelte.ts` (Task 2.2). Each test sets `session.current = { status: 'unknown' | 'signed-in' | 'signed-out', user? }` before rendering.
  - `auth-paths.ts` is **not** mocked — the test uses the real predicate so a regression that weakens it (e.g. a future drive-by edit changing `isSegmentMatch` to a `startsWith`) fails both the auth-paths tests AND this layout's `/auth/loginx` case.
  - All three mocks are `vi.mock()` at file scope so they hoist; the *values* they expose are mutated per-test, not the mocks themselves (per `.claude/skills/writing-tests.md` — no shared `beforeEach` for mock state, but a `beforeEach` for harness-lifecycle resets like `vi.mocked(goto).mockClear()` is fine).
- **Children-snippet stub pattern via `createRawSnippet`.** `+layout.svelte` consumes `children: Snippet` (Svelte 5). Snippets are runtime values produced by the compiler from `{#snippet ...}` blocks, but Svelte exports `createRawSnippet` for constructing one as a plain JS value — and the existing project tests already do this (see `web/src/lib/shared/components/Accordion.test.ts:11`, `web/src/lib/shared/components/TopBar.test.ts:13`, `web/src/lib/shared/components/ButtonPair.test.ts:9`, `web/src/lib/basic/components/Sheet.test.ts:12`, `web/src/lib/basic/components/Fab.test.ts:10`). The test for this task uses the same convention: `import { createRawSnippet } from 'svelte'`, then pass `children: createRawSnippet(() => ({ render: () => '<div data-test="layout-children"></div>' }))` directly to `render(Layout, { children, ... })`. The cases that assert "children render" query `getByDataTest('layout-children')`; the cases that assert "children do NOT render" use `queryByDataTest('layout-children')` and expect `null`. No separate harness `.svelte` file — the codebase has settled on `createRawSnippet` for snippet stubs and this test inherits that convention.

**Reference:** `docs/ui.md:148` for the `replaceState` rule (which applies to the redirect to `/auth/login` as well — back from `/auth/login` shouldn't bounce back into the protected route).

**Files:**
- `web/src/routes/+layout.svelte` (modify)
- `web/src/routes/+layout.test.ts` (create — uses `createRawSnippet` from `svelte` to pass a stub `children` snippet directly to `render(Layout, ...)`, per the project convention spelled out in Decisions)
- `web/src/lib/test/app-state-mock.svelte.ts` (reuse — `$state`-backed `$app/state` mock landed in Task 3.4)

**Steps:**
1. RED — Create `+layout.test.ts` with the cases below (one assertion family per case):
   - **`bootSession()` is called on mount** — render the layout with `session.current = { status: 'unknown' }`, then `await tick()` so `onMount` fires and the call lands before the assertion (consistent with the other reactive cases in this step; without the await the assertion races the mount). Assert `expect(vi.mocked(bootSession)).toHaveBeenCalledTimes(1)`. The session mock's default `bootSession = vi.fn(async () => {})` is a no-op spy (Task 2.2), so this case isolates the "did the layout actually call it" wire check from any state-transition behaviour. Without this case, a refactor that drops the `onMount(() => { bootSession(); })` would leave the layout stuck on the boot screen in production while every other guard-behaviour test below stays green (because those tests pre-set `session.current` directly via the mock).
   - Boot screen renders when `session.current.status === 'unknown'` — assert `queryByDataTest('boot-screen')` is non-null and `queryByDataTest('layout-children')` (a `data-test` injected by a stub child snippet for these tests) is `null`.
   - Children render when `signed-in`.
   - Redirect to `/auth/login` for `signed-out` on a private path **and** the private path's children do **not** render (the block-render gate keeps the DOM clean — assert via `queryByDataTest` returning `null` for a `data-test` the test injects via a stub child).
   - No redirect, no boot screen, children DO render for `signed-out` on each of the three public paths (`/auth/login`, `/auth/check`, `/auth/callback`).
   - **Redirect for `signed-out` on `/auth/loginx`** — a sibling-prefix path that a naive `startsWith('/auth/login')` would treat as public; the shared segment-anchored predicate must reject it. (Duplicates Task 1.4's auth-paths test, deliberately, so a refactor that decouples the layout from `auth-paths.ts` is caught at *both* sites.)
   - **`signed-in` on `/auth/login` redirects to `/` with `replaceState: true`** (R7 — signed-in users should not see stale login screens). Same case for `/auth/check`. Assert `expect(goto).toHaveBeenCalledWith('/', { replaceState: true })`.
   - **`signed-in` on `/auth/login` shows the boot screen, not the login children, before the redirect lands** — assert `queryByDataTest('boot-screen')` is non-null **and** the stub child's `data-test` is `null` at the same paint. This pins the third branch of the `blocked` $derived (signed-in on a `SIGNED_IN_REDIRECT_PATHS` path block-renders, mirroring the signed-out-on-private widening). Without that branch the user briefly sees the LoginRequest screen between `setSignedIn` flipping the state and the `$effect` firing `goto`. Same case for `/auth/check`.
   - **`signed-in` on `/auth/callback` does NOT redirect from the guard** — the callback page owns its own `goto('/')` per R3; the guard letting it render unimpeded keeps the two redirects from racing. Assert `expect(goto).not.toHaveBeenCalled()` (and children render).
   - Children render when `signed-in` on a **private** path (no boot screen, no redirect).
   - **`$app/state` mock reactivity guard** — render the layout once with `page.url = new URL('http://localhost/auth/login')` and `session.current = { status: 'signed-out' }` (a public path → no redirect expected); `await tick()`; assert `goto` was not called. Then reassign `page.url = new URL('http://localhost/private')` (a private path), `await tick()`, and assert `goto('/auth/login', { replaceState: true })` fired. This pins that the `$state`-backed `_url` in `app-state-mock.svelte.ts` actually drives the layout's `$derived` and `$effect` re-evaluation — without this case, a future regression where the mock degrades to a plain non-reactive object would silently pass every other case in the suite (each test renders with a fixed URL).
   Use the three mocks described in Decisions. The real `isSegmentMatch` from `auth-paths.ts` is imported (not mocked) so the segment-anchoring contract is enforced end-to-end.
2. RED — `pnpm test +layout.test`. All red.
3. GREEN — Modify `+layout.svelte` per Decisions. **Keep the existing favicon import, the three token CSS imports (`tokens.css`, `reset.css`, `typography.css`), and the `import '$lib/shared/state/preferences.svelte';` side-effect import** — the snippet in Decisions only shows the new auth-related additions, not a full replacement of the script block. The `preferences.svelte` side-effect installs the theme + font-size `$effect.root` (`web/src/lib/shared/state/preferences.svelte.ts:32-42`); dropping it silently breaks the theme system with no test failure because the colocated layout test mocks `$lib/shared/state/session.svelte` and never asserts the preferences module ran.
4. GREEN — `pnpm test +layout.test`. All green.

**Verify:** `cd web && pnpm test +layout --run` (green) · `cd web && pnpm dev` and visit `/` in a fresh browser tab: redirected to `/auth/login` (manual).

### [ ] 4.2 Add a temporary Sign Out button to `+page.svelte`

**Created:** 2026-05-13T12:11:12Z
**Completed:**

**Why:** The Playwright E2E needs a UI affordance to click for sign-out. The "real" Sign Out lives in Settings (Step 4 builds Settings); for now, a small temporary button on the placeholder `/` page is the minimum.

**Prerequisites:** Task 4.1 (signed-in users land here).

**Decisions:**
- The placeholder `/` page currently renders a `CairnWordmark` plus two paragraphs of stale step-2 onboarding prose ("Pre-alpha. The web UI lands in step 2…", smoke-test commands). Step 2 has shipped, and the prose contradicts the very roadmap it cites; the page must not be the first authenticated screen a signed-in user lands on. Replace the two paragraphs with a single line ("Signed in. Lists land in step 4.") and add the Sign Out button below the wordmark. Step 4 replaces this `+page.svelte` entirely with the Lists screen, so the minimal form here is the right scope.
- Pass `variant="ghost"` to the `Button` primitive for "Sign out" (`data-test="signout"`). Sign-out is technically destructive but the design treats it as a secondary action in Settings (where it'll live in Step 4); ghost matches that. Avoid `primary` (it would visually dominate the otherwise-empty placeholder page) and avoid `destructive` (the design reserves the red variant for irreversible content deletion — sign-out is reversible by signing back in).
- On click: `await signOut()` from the session store. The route guard then redirects to `/auth/login`.
- Tag the button visually as temporary (a code comment, not UI text) so whoever writes Step 4 knows to move it. The Step 4 Settings implementation inherits the same `data-test="signout"` and `variant="ghost"` so the Task 5.2 Playwright selector keeps working across the move.

**Files:**
- `web/src/routes/+page.svelte` (modify)
- `web/src/routes/+page.test.ts` (create)

**Steps:**
1. RED — Create `+page.test.ts` mocking `$lib/shared/state/session.svelte` (the colocated `__mocks__` from Task 2.2). Two cases: (a) `queryByDataTest('signout')` returns a non-null `<button>`, (b) clicking the button calls `vi.mocked(signOut)` exactly once. The data-test contract is the load-bearing piece for Task 5.2's Playwright spec, which selects on the same `data-test="signout"` — Step 4 will move the button to Settings but is required to inherit the same `data-test` so the spec keeps working.
2. RED — `pnpm test +page.test`. All red.
3. GREEN — Replace the two stale `<p>` paragraphs with the single "Signed in. Lists land in step 4." line. Add the Sign Out button and the onclick handler below the wordmark. Use the `Button` primitive from `$lib/basic/` with `variant="ghost"` and `data-test="signout"`.
4. GREEN — `pnpm test +page.test`. All green.
5. GREEN — Manual: sign in via the dev shortcut, click Sign Out, confirm redirect to `/auth/login` and that the cookie is gone (Application → Cookies in devtools — HttpOnly means `document.cookie` would never list it anyway).

**Verify:** `cd web && pnpm test +page --run` (green) · `cd web && pnpm dev`, manual sign-in via dev shortcut, click Sign out → redirected to `/auth/login` · `cd web && pnpm check` (green).

## Phase 5 — End-to-end coverage

Phase 5 ships the single Playwright spec for the magic-link happy path. This is the only place the full backend stack (GoTrue, Mailpit, the proxy, the SvelteKit dev server) is exercised together.

### [ ] 5.1 Land the Mailpit helper at `web/e2e/helpers/mailpit.ts`

**Created:** 2026-05-13T12:11:12Z
**Completed:**

**Why:** The auth spec needs a way to read magic-link emails out of Mailpit. Mailpit's two-step API (list, then fetch body) plus the URL extraction belongs in a shared helper, not inlined in the spec.

**Prerequisites:** Phase 1 complete (so Mailpit is set up and GoTrue actually delivers links to it).

**Decisions:**
- Export a single function:
  ```ts
  export async function waitForMagicLink(email: string, timeoutMs = 10_000): Promise<string>;
  ```
- Polls `GET http://localhost:8025/api/v1/messages` every 200ms for a message addressed to `email` (case-insensitive). When found, fetches `GET http://localhost:8025/api/v1/message/{ID}` for the body. Regex-extracts the `href` of the magic-link `<a>` from the HTML body. HTML-decodes `&amp;` to `&` before returning.
- Throws on timeout with a helpful message.
- Does not delete messages — parallel tests rely on filtering by `To` address. The spec uses unique `alice+${testId}@example.test` emails per test to avoid races.
- **Buildup note (forward-looking, no Step 3 action):** because the helper doesn't delete messages and each Playwright run signs up a fresh `alice+${testId}@example.test` user, both Mailpit's message store and `auth.users` (plus the `profiles` + `user_settings` rows `tg_profile_on_signup` creates synchronously) accumulate across runs. The polling regex stays correct, but a long iteration session leaves hundreds of stray rows. The reset path is the existing `docker compose down -v && docker compose up -d && ./scripts/migrate.sh && ./scripts/seed.sh` documented in `docs/development.md:309`. If the accumulation ever becomes a noticeable pain (slow polls, RLS-test fixture pollution), a tiny `pnpm test:e2e:reset` helper is a reasonable later refinement. No change needed in Step 3.

**Files:**
- `web/e2e/helpers/mailpit.ts` (create)

**Steps:**
1. GREEN — Implement the helper. No tests for it directly — its correctness is exercised by Task 5.2's E2E spec.

**Verify:** Task 5.2's E2E run is the verification.

### [ ] 5.2 Land the auth happy-path spec at `web/e2e/auth.spec.ts`

**Created:** 2026-05-13T12:11:12Z
**Completed:**

**Why:** This is the single E2E that proves the full stack works end-to-end: Vite proxy, GoTrue, Mailpit, cookie shim, session store, route guard. `docs/testing.md:179` lists this exact spec.

**Prerequisites:** All previous tasks.

**Decisions:**
- One spec file with two `test(...)` blocks:
  - **Magic-link happy path.** Visit `/`. Asserts redirect to `/auth/login`. Fills the email field with `alice+${test.info().testId}@example.test`. Clicks Submit. Asserts navigation to a **bare** `/auth/check` — specifically `await expect(page).toHaveURL(/\/auth\/check$/)` so the regex anchors the end and a future drift that appends `?email=…` fails the assertion (R14 / privacy decision). Calls `waitForMagicLink` from the helper. `page.goto(link)`. Asserts the URL is now `/` and the `cairn_session` cookie is present in `context.cookies()`. Clicks the Sign Out button (`page.locator('[data-test="signout"]')` — same selector Task 4.2 stamps on the placeholder button, which Step 4's Settings will inherit so this spec keeps working across the move). Asserts redirect back to `/auth/login` and the cookie is gone.
  - **Dev shortcut path.** Visit `/auth/login`. Probe for the dev-shortcut button via `const hasShortcut = (await page.locator('[data-test="dev-login-alice"]').count()) > 0; test.skip(!hasShortcut, 'dev shortcut not present in this build');` — this is the load-bearing skip mechanism (it honours what the build actually shipped, regardless of how `VITE_DEV_LOGIN_SHORTCUT` was set). Do NOT skip on a `process.env.VITE_DEV_LOGIN_SHORTCUT` check from the runner side: `VITE_*` env vars are Vite build-time replacements baked into the JS bundle the browser runs, so the runner's view of `process.env` can diverge from what's in the bundle. If the locator probe finds the buttons: click `dev-login-alice`. Asserts navigation to `/` and the cookie is set.
- Both tests are independent — no `test.describe.serial`.
- The Playwright `webServer` block (`web/playwright.config.ts:30-35`) auto-starts the dev server; the backend (`docker compose up -d`) is assumed running per `docs/testing.md:206-211`.

**Reference:** `docs/testing.md:171-227` for the Playwright layer conventions.

**Files:**
- `web/e2e/auth.spec.ts` (create)

**Steps:**
1. GREEN — Implement the spec.
2. GREEN — Run `cd web && pnpm test:e2e --project=chromium auth`. Confirm both tests pass.
3. GREEN — Run `cd web && pnpm test:e2e auth` (all three browsers). Confirm all six tests pass.

**Verify:** `cd web && pnpm test:e2e auth` (six green tests across chromium/firefox/webkit) · `./scripts/check.sh` (full green).
