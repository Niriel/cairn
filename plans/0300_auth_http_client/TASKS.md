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

## Phase 0 — Reconcile docs

These land first so every later task references the post-edit narrative. Each edit is small and self-contained.

### [ ] 0.1 Reconcile `docs/development.md` to the new seed + dev-shortcut flow

**Created:** 2026-05-13T12:11:12Z
**Completed:**

**Why:** The doc currently says "the dev seed is intentionally empty until step 3" (line 225) and "the dev login shortcut returns in step 3" (line 249). This plan IS step 3 — those forward-references resolve now. Without the edit, downstream tasks reference a stale doc.

**Prerequisites:** None.

**Decisions:**
- (Line numbers below are how the file reads *today*; once the first
  edit lands, subsequent line numbers shift. Each edit is anchored
  by a quoted phrase from the paragraph, not by line number alone.)
- Replace the paragraph in the "Seed data" section that begins
  *"The dev database starts empty. `db/seed/dev_seed.sql` is
  intentionally a no-op"* (around line 225) with the new flow:
  `./scripts/seed.sh` first waits for GoTrue, then POSTs `/signup`
  for Alice/Bob/Carol with the dev password `cairn-dev`, then runs
  `db/seed/dev_seed.sql` which `UPDATE`s the three display names.
  Idempotent on rerun.
- Restore the `VITE_DEV_LOGIN_SHORTCUT` paragraph in "The web app"
  section — replace the line that begins *"`VITE_DEV_LOGIN_SHORTCUT`
  returns to this file alongside step 3's plan"* (around line 249)
  with a paragraph stating that the env var enables three buttons
  on the login screen that call GoTrue's password grant directly.
  The committed dev password is `cairn-dev`.
- Replace the "Hit the API directly" paragraph in "Common tasks"
  that begins *"PostgREST is plain HTTP+JSON. You need a JWT…"*
  (around line 295) with a working example: `curl -X POST
  http://localhost:9999/token?grant_type=password -H 'Content-Type:
  application/json' -d '{"email":"alice@example.test","password":
  "cairn-dev"}'` returns a JWT you can pass as
  `Authorization: Bearer …`.
- Add a one-sentence note inside "The magic-link flow in
  development" (the section beginning *"Cairn uses email magic
  links for real authentication."*) — the dev cookie has no
  `Secure` attribute because localhost is HTTP; production's Caddy-
  set cookie does. This divergence is intentional.
- In the same "Seed data" section, after the new
  signup-then-UPDATE narrative paragraph, add a short
  **forward-note** for step 13's production-rollout owner: when
  the production GoTrue compose file lands, it MUST set
  `GOTRUE_MAILER_AUTOCONFIRM=false` and
  `GOTRUE_DISABLE_SIGNUP=true` so the committed dev password
  `cairn-dev` cannot be used against a prod instance, and so
  that `POST /auth/signup` (which is open in dev — both directly
  to GoTrue and through the Vite proxy) cannot be used to create
  unsolicited accounts in production. The dev exposure is
  contained to localhost — the production gap is closed
  structurally by `GOTRUE_DISABLE_SIGNUP=true`, not by any code
  in the web app. (Cairn is invite-only per `docs/invites.md`,
  so signup-disabled in prod is already the right default.)
- Add a one-paragraph dev-surface note in the same section
  explaining how the cookie-plant shim is scoped: the Vite proxy
  only plants `cairn_session` on responses from
  `COOKIE_PLANT_PATHS` (currently `/auth/verify` and
  `/auth/token`, defined in `web/src/lib/shared/model/auth-paths.ts`).
  `POST /auth/signup` through the proxy returns the GoTrue body
  including `access_token` but **does not** plant the cookie —
  a deliberate narrowing landed in Task 1.4 to keep the dev
  cookie-plant contract tight. A contributor adding a new
  GoTrue login endpoint must extend `COOKIE_PLANT_PATHS`
  explicitly.
- Do NOT edit the cookie inventory table in `docs/architecture.md`
  in this task — that one's Task 0.2.

**Files:**
- `docs/development.md` (modify)

**Steps:**
1. Edit the three paragraphs above in `docs/development.md`. Each edit is a contained replacement; no renumbering, no section restructuring.
2. Read the edited file end-to-end to confirm flow.
3. `git diff docs/development.md` — sanity check.

**Verify:** `git diff --stat docs/development.md` (one file) · `grep -nE 'cairn-dev' docs/development.md` (finds the password) · `grep -nE 'VITE_DEV_LOGIN_SHORTCUT' docs/development.md` (paragraph restored).

### [ ] 0.2 Reconcile `docs/architecture.md` to the 7-day JWT and verified flow

**Created:** 2026-05-13T12:11:12Z
**Completed:**

**Why:** Line 252 aspirationally documents "~30-day Max-Age" for `cairn_session`, but Step 3 deliberately defers refresh-token rotation and sets `GOTRUE_JWT_EXP` to 7 days. The cookie's Max-Age tracks `expires_in`, so the implemented value is 7 days, not 30. The doc must match the code or downstream readers will be confused.

**Prerequisites:** None.

**Decisions:**
- In the "Client-side storage and the consent question" table,
  find the row whose first cell begins with `cairn_session` cookie
  and edit two cells:
  - In the **flags** cell, change `~30-day Max-Age` to
    `~7-day Max-Age (raised to ~30-day when refresh-token rotation
    lands)`; soften the bare `Secure` flag to `Secure` (production
    only — dev uses HTTP localhost, see `docs/development.md`)
    so a reader of the cookie inventory isn't surprised to find
    the dev cookie without `Secure`.
  - In the **"Set by"** cell, change `Caddy on successful
    magic-link callback` to `Caddy in production / the Vite dev
    proxy locally on successful magic-link callback` so the dev
    counterpart is documented in the same place as the prod one.
  Keep the rest of the row (the "what it stores" cell, the EDPB
  citation) intact.
- **Pin the magic-link endpoint to `/auth/otp`** across the docs.
  GoTrue 2.158.1 routes both `/magiclink` and `/otp` to the same
  handler today, but `/otp` is the canonical v2 endpoint name —
  `/magiclink` is an alias that may be dropped in a future image
  bump. The plan's MSW handlers (Task 2.1), auth-client implementation
  (Task 3.1), and Vite-proxy smoke commands (Task 1.4) all reference
  `/auth/otp`; the docs need to match. Concretely:
  - `docs/architecture.md:226` — replace `POST https://cairn.<domain>/auth/magiclink`
    with `POST https://cairn.<domain>/auth/otp` (preserve the rest
    of the bullet). Add a short parenthetical the first time the
    name appears that `/auth/magiclink` is a current GoTrue alias
    for the same handler.
  - `docs/development.md:277` (or wherever the "App POSTs to
    `/auth/magiclink`" line lives in the post-Task-0.1 file) —
    replace `/auth/magiclink` with `/auth/otp`.
- In the "Request flow" section, verify the rest of the "A login
  request" numbered list matches what we'll implement: magic-link
  URL `http://localhost:5173/auth/callback?token=...&type=magiclink`,
  the Vite proxy's shim plants the cookie from the JSON
  `access_token`. No edit needed if the prose already covers this;
  otherwise tighten the sentence about the callback URL.
- Do NOT add a "refresh-token rotation will land in a later step"
  paragraph anywhere — the cookie-table edit carries the message.
- Background context (no extra edit required): the cookie's
  `Max-Age` is set by the Vite shim from `expires_in` in the
  GoTrue JSON body (`web/vite.config.ts:57`), and GoTrue derives
  `expires_in` from `GOTRUE_JWT_EXP`. So Task 1.1's bump of
  `GOTRUE_JWT_EXP` to `"604800"` is what makes the cookie's
  `Max-Age` 7 days, which is what this row now documents. A future
  contributor adjusting either side of that chain should
  understand the link before editing.

**Files:**
- `docs/architecture.md` (modify)
- `docs/development.md` (modify — single-line endpoint rename, separate from Task 0.1's other edits to the same file)

**Steps:**
1. Edit `docs/architecture.md:252` as above (cookie table row).
2. Edit `docs/architecture.md:226` to rename `/auth/magiclink` → `/auth/otp` per Decisions.
3. Edit the matching line in `docs/development.md` (search for `/auth/magiclink`).
4. Re-read `docs/architecture.md:212-232` and confirm the request-flow narrative matches what Phase 1–4 will implement. Tighten only if necessary.
5. `git diff docs/architecture.md docs/development.md` — sanity check.

**Verify:** `grep -nE '7-day Max-Age' docs/architecture.md` (finds the new line) · `grep -nE '30-day Max-Age' docs/architecture.md` (returns nothing, or only the parenthetical about future work) · `grep -nE '/auth/magiclink' docs/architecture.md docs/development.md` (returns nothing, or only the one-line "alias" parenthetical).

## Phase 1 — Backend wiring (GoTrue + seed + Vite proxy)

Phase 1 lands the infrastructure that the rest of the plan plugs into: GoTrue env edits, seed flow, Vite proxy split, logout middleware. After this phase, an ad-hoc `curl` against `/auth/otp` and `/auth/verify` through the dev server works end-to-end (cookie planted), and `./scripts/seed.sh` is idempotent. No UI yet.

### [ ] 1.1 Add `GOTRUE_MAILER_URLPATHS_MAGICLINK` and bump `GOTRUE_JWT_EXP` in `docker-compose.yml`

**Created:** 2026-05-13T12:11:12Z
**Completed:**

**Why:** GoTrue's default mailer URL path is `/auth/v1/verify`, which 404s through our proxy. The magic-link email's `<a href>` must point at the SvelteKit `/auth/callback` route this plan introduces. Separately, the default 1-hour JWT expiry is too short for the cookie Max-Age to be useful; bumping to 7 days (`604800` seconds) keeps dev sessions alive across a day's work and is what `docs/architecture.md:252` (post-Phase 0) commits to.

**Prerequisites:** Phase 0 edits merged.

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
3. GREEN — Confirm with `docker compose exec gotrue env | grep -E 'JWT_EXP|MAILER_URLPATHS'`.

**Verify:** `docker compose exec gotrue env | grep GOTRUE_JWT_EXP` shows `604800` · `docker compose exec gotrue env | grep MAILER_URLPATHS_MAGICLINK` shows `/auth/callback`.

### [ ] 1.2 Drive seed signups against GoTrue from `scripts/seed.sh`

**Created:** 2026-05-13T12:11:12Z
**Completed:**

**Why:** The dev login shortcut and Step 4 dogfooding both need Alice/Bob/Carol to exist as real `auth.users` rows. We deliberately can't insert into `auth.users` directly (`db/seed/dev_seed.sql:9-13` documents why). Driving signups through GoTrue's HTTP endpoint lets it satisfy its own NOT NULL columns, and `tg_profile_on_signup` synchronously creates the matching `profiles` + `user_settings` rows.

**Prerequisites:** Task 1.1 (the JWT exp bump is unrelated, but the new mailer path means signups must hit the alternate endpoint that doesn't email — `/signup` with autoconfirm, not `/magiclink`).

**Decisions:**
- Three seed users, emails `alice@example.test`, `bob@example.test`, `carol@example.test`. Password for all: `cairn-dev`. The choice of `.test` TLD is deliberate (reserved by RFC 2606, will never collide with a real domain).
- The seed script polls `curl -sf http://localhost:9999/health` (or `/settings`) until 200 before issuing signups — GoTrue takes a moment to come up after `docker compose up -d`.
- Each `POST /signup` is issued via `curl`; HTTP 200 or 201 → created, 422 → already-registered, anything else → fail loudly.
- `GOTRUE_MAILER_AUTOCONFIRM: "true"` is already set (`docker-compose.yml:51` area). So `/signup` does NOT send a confirmation email, keeping Mailpit clean.
- The seed runs the SQL UPDATE step (Task 1.3) immediately after the signup loop, in the same `seed.sh` invocation. That step is a separate task only because the SQL changes live in `dev_seed.sql`.

**Reference:** `docs/development.md` (post-Phase 0) for the dev-shortcut narrative the seed must satisfy.

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

### [ ] 1.3 Rewrite `db/seed/dev_seed.sql` to UPDATE `display_name` for the three seed users

**Created:** 2026-05-13T12:11:12Z
**Completed:**

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

### [ ] 1.4 Land segment-anchored auth-path predicates and split the Vite `/auth` proxy

**Created:** 2026-05-13T12:11:12Z
**Completed:**

**Why:** The magic-link email's `<a href>` points at `http://localhost:5173/auth/callback?token=...` (Task 1.1). Today's `/auth` proxy in `web/vite.config.ts` forwards every `/auth/*` request to GoTrue, so the browser hitting `/auth/callback` would 404. The fix is to let SvelteKit serve the page routes (`/auth/login`, `/auth/check`, `/auth/callback`) and forward only the GoTrue API paths. Three subtly-different path predicates have to coexist inside `vite.config.ts` — public-page bypass, bearer-attach narrowing, and (Task 1.5) DELETE-session matching — and the segment-anchoring story is exactly the kind of thing a drive-by edit can weaken to a bare `startsWith` without anyone noticing. Pulling the predicate into a pure-TS helper with colocated tests pins the semantics in CI, not in a curl smoke (and lets Task 1.5 reuse the same predicate).

**Prerequisites:** Task 1.1 (the new mailer URL path is the reason we need the bypass at all).

**Decisions:**
- Create `web/src/lib/shared/model/auth-paths.ts` exporting:
  ```ts
  export const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/check', '/auth/callback'] as const;
  export const BEARER_AUTH_PATHS = ['/auth/user'] as const;
  export const COOKIE_PLANT_PATHS = ['/auth/verify', '/auth/token'] as const;
  export function isSegmentMatch(url: string | undefined, paths: readonly string[]): boolean;
  ```
  `isSegmentMatch` strips the query string then returns true iff `url`'s path is exactly one of `paths` or starts with one followed by `/`. The exported consts are the single home for the path lists — R7 (route guard, Task 4.1), Task 1.4 (proxy bypass + bearer narrow + cookie-plant narrow), and Task 1.5 (DELETE matcher) all import from this module instead of redefining the strings inline. One source of truth across the five call sites.
- `COOKIE_PLANT_PATHS` is the new gate on the existing JSON sniffer's `set-cookie` block. Today the shim plants `cairn_session` on **any** 2xx `/auth/*` response with `access_token` — which silently includes `POST /auth/signup`. With `GOTRUE_DISABLE_SIGNUP="false"` and `GOTRUE_MAILER_AUTOCONFIRM="true"` in dev (`docker-compose.yml:46,51`), an anonymous signup through the Vite proxy plants a session cookie for the brand-new account — a full sign-in. The blast radius is localhost-only, but the contract is wider than the shim's intent. Narrowing to `/auth/verify` and `/auth/token` pins it to deliberate-login endpoints. A future GoTrue endpoint that also returns `access_token` (refresh-token rotation, OAuth callbacks) must be added to `COOKIE_PLANT_PATHS` explicitly. (R10)
- `web/vite.config.ts` imports both consts and the predicate via a relative path (`./src/lib/shared/model/auth-paths`). Vite evaluates the config in a Node-TS environment, so the import resolves at config-load time without changes to tsconfig.
- **`req.url` is mutated by Vite's `rewrite` *before* the proxy events fire** — by the time `proxyReq` / `proxyRes` run, `req.url` is the GoTrue-facing `/user`, `/verify`, `/token?…` form, not the original `/auth/...`. The narrowing predicates need the original URL to match against `PUBLIC_AUTH_PATHS` / `BEARER_AUTH_PATHS` / `COOKIE_PLANT_PATHS` (which are all `/auth/...`-shaped, since they're shared with R7's route guard and the `bypass` callback). The fix is to register a tiny **pre-proxy middleware** via a Vite plugin's `configureServer` hook that stamps `(req as any).cairnOriginalUrl = req.url` for every request whose path starts with `/auth/` — running *before* Vite's built-in proxy middleware, so the stamped value is the pre-rewrite URL. The `proxyReq` and `proxyRes` handlers then consume `(req as any).cairnOriginalUrl ?? req.url` (the fallback covers a defensive case where the plugin wasn't loaded). The `bypass(req)` callback continues to read `req.url` directly because Vite invokes `bypass` *before* the rewrite — the stamped field is unnecessary there. The plugin lives as a tiny object literal in `vite.config.ts` (`{ name: 'cairn-auth-shim', configureServer(server) { server.middlewares.use((req, _res, next) => { if (req.url?.startsWith('/auth/') || req.url === '/auth') (req as any).cairnOriginalUrl = req.url; next(); }); } }`) and the same plugin will host the Task 1.5 `DELETE /auth/session` middleware — one plugin owns all the dev-only auth shims.
- The `/auth` proxy entry's `bypass(req)` returns `req.url` when `isSegmentMatch(req.url, PUBLIC_AUTH_PATHS)`, `undefined` otherwise. When `bypass` returns a string, Vite short-circuits the proxy entirely — the rule's `rewrite: (p) => p.replace(/^\/auth/, '')` is **not applied** on the bypass branch. SvelteKit therefore sees the original `/auth/callback?token=…`, which is what its router expects. (A future "fix" that strips `/auth` here would 404 the page routes — leave the rewrite alone.)
- A new `proxyReq` handler on `/auth` (mirroring the one on `/api`, `web/vite.config.ts:27-32`) guards `isSegmentMatch((req as any).cairnOriginalUrl ?? req.url, BEARER_AUTH_PATHS)`; on a match, reads the cookie via the existing `readBearerFromCookie` helper and sets `Authorization: Bearer <jwt>` when present and not already set. Without this, `GET /auth/user` (the session-store boot in Task 2.2) would 401 on every reload because Vite forwards the cookie but GoTrue ignores cookies. The narrowing prevents an unrelated `POST /auth/otp` (a signed-in user sending a magic link to a different address) from carrying a stale bearer to an anonymous-callable endpoint. The Caddy prod analogue does the same per `docs/architecture.md:146`.
- Modify the existing `selfHandleResponse: true` + `proxyRes` JSON-sniffing block (`web/vite.config.ts:40-67`) to gate the **cookie-planting branch** (the `if (typeof json?.access_token === 'string')` body) on `isSegmentMatch((req as any).cairnOriginalUrl ?? req.url, COOKIE_PLANT_PATHS)`. The outer JSON parse and header forwarding stay unchanged for all `/auth/*` requests — only the `set-cookie` emission is narrowed. Without this gate, `POST /auth/signup` (open in dev) inadvertently plants a session cookie for the brand-new account. To do this, the `proxy.on('proxyRes', ...)` handler must capture `req` from its closure (rebind the callback as `(proxyRes, req, res) => { ... }`) so the stamped `cairnOriginalUrl` is in scope inside the response handler.
- Do NOT touch the `/api` proxy entry — only `/auth` changes.

**Reference:** `.claude/skills/writing-tests.md` for the colocated `.test.ts` convention.

**Files:**
- `web/src/lib/shared/model/auth-paths.ts` (create)
- `web/src/lib/shared/model/auth-paths.test.ts` (create)
- `web/vite.config.ts` (modify)

**Steps:**
1. RED — Create `auth-paths.test.ts` covering both predicates' segment-anchoring contract:
   - `isSegmentMatch('/auth/login', PUBLIC_AUTH_PATHS)` → true.
   - `isSegmentMatch('/auth/login/', PUBLIC_AUTH_PATHS)` → true.
   - `isSegmentMatch('/auth/login?email=x', PUBLIC_AUTH_PATHS)` → true.
   - `isSegmentMatch('/auth/callback?token=x&type=magiclink', PUBLIC_AUTH_PATHS)` → true.
   - `isSegmentMatch('/auth/check', PUBLIC_AUTH_PATHS)` → true.
   - `isSegmentMatch('/auth/loginx', PUBLIC_AUTH_PATHS)` → **false** (the adversarial sibling-prefix case that a bare `startsWith` would falsely accept).
   - `isSegmentMatch('/auth/otp', PUBLIC_AUTH_PATHS)` → false.
   - `isSegmentMatch('/auth/user', BEARER_AUTH_PATHS)` → true.
   - `isSegmentMatch('/auth/user?id=x', BEARER_AUTH_PATHS)` → true.
   - `isSegmentMatch('/auth/userx', BEARER_AUTH_PATHS)` → **false**.
   - `isSegmentMatch('/auth/otp', BEARER_AUTH_PATHS)` → false.
   - `isSegmentMatch('/auth/verify', COOKIE_PLANT_PATHS)` → true.
   - `isSegmentMatch('/auth/token', COOKIE_PLANT_PATHS)` → true.
   - `isSegmentMatch('/auth/token?grant_type=password', COOKIE_PLANT_PATHS)` → true.
   - `isSegmentMatch('/auth/signup', COOKIE_PLANT_PATHS)` → **false** (the adversarial case — a 2xx signup response carries `access_token` but must not plant the cookie).
   - `isSegmentMatch('/auth/verifyx', COOKIE_PLANT_PATHS)` → false.
   - `isSegmentMatch(undefined, PUBLIC_AUTH_PATHS)` → false.
2. RED — `pnpm test auth-paths.test`. Seventeen red.
3. GREEN — Create `auth-paths.ts` per Decisions.
4. GREEN — `pnpm test auth-paths.test`. Seventeen green.
5. RED (manual smoke) — With the dev server running, `curl -i http://localhost:5173/auth/callback?token=test`. Today the proxy forwards to GoTrue's `/callback` which 404s. Goal: after step 6, the same curl returns a SvelteKit response (probably a 404 from SvelteKit's router until Phase 3 adds the route — that's fine, not a GoTrue error).
6. RED (manual smoke, baseline) — With the dev server running and the cookie planted from a prior login, `curl -i --cookie 'cairn_session=<jwt>' http://localhost:5173/auth/user`. Today (no bearer attach) GoTrue returns 401 because it ignores cookies. Goal: after step 7, the same curl returns 200 with the user payload.
7. GREEN — Edit `web/vite.config.ts`:
   - Import `PUBLIC_AUTH_PATHS`, `BEARER_AUTH_PATHS`, `COOKIE_PLANT_PATHS`, `isSegmentMatch` from `./src/lib/shared/model/auth-paths`.
   - Add a small Vite plugin in `plugins: [...]` named `cairn-auth-shim` with a `configureServer(server)` hook that registers a pre-middleware: `server.middlewares.use((req, _res, next) => { if (req.url?.startsWith('/auth/') || req.url === '/auth') (req as any).cairnOriginalUrl = req.url; next(); })`. The `configureServer` hook's default registration order runs the middleware *before* Vite's built-in proxy middleware, so `cairnOriginalUrl` captures the pre-rewrite URL.
   - Add the `bypass` callback to the `/auth` proxy entry using `isSegmentMatch(req.url, PUBLIC_AUTH_PATHS)`. (`bypass` runs before `rewrite`, so `req.url` is the original `/auth/...` here — no need for the stamped field.)
   - Add the narrowed `proxyReq` cookie → `Authorization: Bearer` handler gated on `isSegmentMatch((req as any).cairnOriginalUrl ?? req.url, BEARER_AUTH_PATHS)`.
   - Gate the existing JSON-sniffer's `set-cookie` emission on `isSegmentMatch((req as any).cairnOriginalUrl ?? req.url, COOKIE_PLANT_PATHS)` — rebind the `proxyRes` handler signature to include `req` so the stamped field is in closure scope.
   - Add a one-line comment near each call site explaining what `auth-paths.ts` owns and why `cairnOriginalUrl` is consulted (rewrite mutates `req.url`), so a future contributor reaches for the helper instead of inlining a regex and doesn't "simplify" the stamped field back out.
8. GREEN — Restart `pnpm dev`. Re-run the bearer-attach smoke from step 6; SvelteKit now serves the bypass-bound `/auth/callback` (the curl from step 5), and `curl -i --cookie 'cairn_session=<jwt>' http://localhost:5173/auth/user` returns 200 with the user payload. If `/auth/user` still 401s, the most likely cause is that the `configureServer` middleware ran *after* the proxy — flip the plugin to `enforce: 'pre'` or move the middleware registration into `server.middlewares.use(0, …)` ordering; the bearer-attach assertion in step 6 is the load-bearing acceptance test for this concern.
9. GREEN — Sanity check that GoTrue API calls still work: `curl -X POST http://localhost:5173/auth/otp -H 'Content-Type: application/json' -d '{"email":"alice@example.test","create_user":true}' -i` returns 200; a fresh Mailpit message appears at `http://localhost:8025`. (The "bearer is not attached to `/auth/otp`" contract is covered structurally by the helper-module tests in step 1 — no need to chase `docker compose logs gotrue` for an absent header that GoTrue may not log at default verbosity anyway.)
10. GREEN — Cookie-plant narrow smoke: `curl -X POST http://localhost:5173/auth/signup -H 'Content-Type: application/json' -d '{"email":"smoketest@example.test","password":"cairn-dev"}' -i`. Response: 200 with the GoTrue body (including `access_token`), but **no** `Set-Cookie: cairn_session=` in the headers — `/auth/signup` is not in `COOKIE_PLANT_PATHS`. Compare with `curl -X POST http://localhost:5173/auth/token?grant_type=password -H 'Content-Type: application/json' -d '{"email":"alice@example.test","password":"cairn-dev"}' -i` which **does** plant the cookie — this is the positive case that catches the original-URL regression: if the narrow accidentally checks the rewritten `req.url` (`/token` not in `['/auth/verify', '/auth/token']`), the cookie won't plant and dev-shortcut sign-in is broken. (Cleanup: `docker compose exec postgres psql -U cairn -d cairn -c "DELETE FROM auth.users WHERE email = 'smoketest@example.test'"` if you want the row gone.)

**Verify:** `cd web && pnpm test auth-paths.test --run` (seventeen green) · `curl -i http://localhost:5173/auth/callback` (SvelteKit response, not GoTrue) · `curl -X POST http://localhost:5173/auth/otp -H 'Content-Type: application/json' -d '{"email":"alice@example.test","create_user":true}' -i` (200, Mailpit message visible at `http://localhost:8025`) · with a real JWT cookie, `curl -i --cookie 'cairn_session=<jwt>' http://localhost:5173/auth/user` returns 200 with the user payload (this is the bearer-attach acceptance test — if it 401s, `cairnOriginalUrl` isn't being captured before the rewrite) · `curl -X POST http://localhost:5173/auth/token?grant_type=password -H 'Content-Type: application/json' -d '{"email":"alice@example.test","password":"cairn-dev"}' -i` returns 200 **with** `Set-Cookie: cairn_session=…` (cookie-plant acceptance test on the rewritten path) · `curl -X POST http://localhost:5173/auth/signup -H 'Content-Type: application/json' -d '{"email":"smoketest@example.test","password":"cairn-dev"}' -i` returns 200 **with no** `Set-Cookie: cairn_session=` header (cookie-plant narrow excludes signup).

### [ ] 1.5 Add the `DELETE /auth/session` middleware to Vite's dev server

**Created:** 2026-05-13T12:11:12Z
**Completed:**

**Why:** `docs/architecture.md:148` commits to `DELETE /auth/session` as the sign-out endpoint. It's not a GoTrue endpoint — it's Cairn's own — so it doesn't belong in the proxy response handler. In production Caddy implements it; in dev the Vite server is the analogue. The route needs to exist before Phase 2 ships the session store's `signOut()`.

**Prerequisites:** Task 1.4 (the `/auth` proxy entry exists in its split form; the middleware lives alongside it).

**Decisions:**
- Extend the `cairn-auth-shim` plugin landed in Task 1.4 (already host of the pre-proxy `cairnOriginalUrl` middleware) with a second `configureServer(server)` middleware registration: `server.middlewares.use('/auth/session', handler)`. One plugin owns all the dev-only auth shims. Both middlewares run before Vite's built-in proxy middleware, which is what we want — the DELETE short-circuit prevents the request from being forwarded to GoTrue.
- The DELETE handler first **guards on exact path** — Connect's middleware matcher is prefix-based, so without an explicit check `/auth/sessions` (or any future `/auth/session/*` sub-path) would also enter this handler. Use `isSegmentMatch(req.url, ['/auth/session'])` from `./src/lib/shared/model/auth-paths` (the helper landed in Task 1.4) — one place owns segment-anchoring across the proxy bypass, the bearer attach, the cookie-plant narrow, and this DELETE matcher. `req.url` is fine here (no rewrite applied yet — this middleware runs *before* Vite's proxy). On a mismatch, call `next()` and forward through the proxy. Then check `req.method === 'DELETE'`, set `Set-Cookie: cairn_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`, write a 204, and end. Anything else calls `next()`.
- Do NOT also fire `POST /logout` to GoTrue. That's the optional best-effort step deferred per PLAN.md's open question — refresh-token rotation is out of scope, so server-side invalidation has no teeth in Step 3.

**Files:**
- `web/vite.config.ts` (modify)

**Steps:**
1. RED — `curl -X DELETE -i http://localhost:5173/auth/session -H 'Cookie: cairn_session=anything'`. Today this is forwarded to GoTrue and 404s.
2. GREEN — In `web/vite.config.ts`, extend the existing `cairn-auth-shim` plugin (landed in Task 1.4) — inside its `configureServer(server)` hook, add a second `server.middlewares.use('/auth/session', handler)` call. The handler responds 204 + cookie-clearing header on DELETE, calls `next()` otherwise.
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
  - `http.post('*/auth/verify', () => HttpResponse.json({ access_token: 'fake.jwt.value', token_type: 'bearer', expires_in: 604800, refresh_token: 'fake.refresh.value', user: { id: '11111111-1111-1111-1111-111111111111', email: 'dev@example.test' } }))`
  - `http.delete('*/auth/session', () => new HttpResponse(null, { status: 204 }))`
- Per-test `server.use(...)` overrides for 4xx / 5xx cases.

**Reference:** `.claude/skills/writing-tests.md` for MSW conventions.

**Files:**
- `web/src/lib/test/handlers.ts` (modify)

**Steps:**
1. GREEN — Replace the empty array with the four handlers above. Import `http` and `HttpResponse` from `msw`.
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
  - `bootSession()` — `await fetch(${import.meta.env.VITE_AUTH_BASE ?? '/auth'}/user, { credentials: 'same-origin' })`; on 2xx assigns `session.current = { status: 'signed-in', user }`; on 401 assigns `session.current = { status: 'signed-out' }`. Other statuses default to `signed-out` and log. **Both** branches only write when `session.current.status === 'unknown'` — symmetric guards, so any deliberate entrypoint (`signOut`, `setSignedIn`, `onUnauthorized`) that fired while boot was in flight wins. Asymmetry (guard 2xx but let 401 overwrite) is the foreseeable bug R4 explicitly forbids: it protects the signOut-vs-boot race but breaks the callback's `setSignedIn`-vs-boot-401 race. The prefix is read from `VITE_AUTH_BASE` so the same env-var that pins `auth-client.ts`'s URLs (Task 3.1) pins this one too — the session store is in `shared/state/` and cannot import from `auth/model/`, but it can and should match the contract via the env var. Tests pin the prefix the same way Task 3.1 does (`vi.stubEnv('VITE_AUTH_BASE', '/auth')` in `beforeAll`, `vi.unstubAllEnvs()` in `afterAll`).
  - `signOut()` — if `session.current.status === 'signed-out'`, no-op. Otherwise (including the `unknown` state where boot has not yet resolved) assign `session.current = { status: 'signed-out' }` **unconditionally** using `try/finally`: fire `fetch('/auth/session', { method: 'DELETE', credentials: 'same-origin' })` as best-effort, but write the `signed-out` variant in `finally` even if the DELETE rejects. Explicit user intent is authoritative; a network failure must not leave the user stuck in `signed-in` with an unhandled rejection. A slow `bootSession` that resolves after the DELETE doesn't overwrite the resulting `signed-out` because boot's branches check `status === 'unknown'` before writing.
  - `setSignedIn(user: AuthUser)` — synchronous; assigns `session.current = { status: 'signed-in', user }` from `unknown` or `signed-out` only. A call while already `signed-in` is a no-op (the live cookie is the source of truth, and step 3 has no path that would update the user payload on an existing session — refresh-token rotation is explicitly deferred). Does no HTTP. Used by R3 (callback, Task 3.4) and R8 (dev shortcut, Task 3.2) after a successful exchange: by the time those paths run, `bootSession()` has already resolved (typically to `signed-out`, since the cookie wasn't set at first paint), so boot's only-from-`unknown` guard would otherwise refuse to write `signed-in` on a same-tab login. `setSignedIn` is the deliberate-action entrypoint that bypasses the boot guard without weakening it (the guard is still needed for the signOut-before-boot race).
  - `onUnauthorized()` — assigns `session.current = { status: 'signed-out' }` from **any** state that isn't already `signed-out` (collapses both `signed-in` and `unknown`). Called by the PostgREST wrapper on 401 (Task 2.3). Synchronous; does no HTTP itself.
- The store is a module singleton — there's exactly one `session` per page load. Tests reset it via `signOut()` or by re-importing in isolation (Vitest's `vi.resetModules()` is overkill — direct state writes via `signOut()` are fine).
- The mock at `__mocks__/session.svelte.ts` exposes the same shape but with no boot fetch and no real HTTP — it's a controllable stand-in for tests that need a specific status. Exact mock surface:
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
1. RED — Create `session.test.ts` with thirteen tests. The file pins `VITE_AUTH_BASE` in `beforeAll` (`vi.stubEnv('VITE_AUTH_BASE', '/auth')`) and unstubs in `afterAll`, matching Task 2.3 and Task 3.1's pattern so `bootSession`'s URL prefix is asserted independently of any contributor `.env`:
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
2. RED — Run `pnpm test session.test` and confirm thirteen failing tests (module doesn't exist yet).
3. GREEN — Create `session.svelte.ts` with the runes store and the four exported functions.
4. GREEN — Create `__mocks__/session.svelte.ts` mirroring the exact mock surface listed in Decisions: a **`$state`-backed** `session` proxy (the file's `.svelte.ts` extension makes runes legal here) plus `bootSession`, `signOut`, `setSignedIn`, `onUnauthorized` as `vi.fn` spies whose default implementations write the matching post-condition into `session.current`. Type-only imports of `AuthUser` / `Session` from `../session.svelte` are fine because Vitest substitutes the mock at runtime, not at type-check time.
5. GREEN — Run `pnpm test session.test`. Thirteen green.

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
   - 401 calls `session.onUnauthorized` (mocked) and throws `AuthError`.
   - 4xx with PostgREST shape throws `ApiError` carrying `code/details/hint`.
   - `Accept: application/vnd.pgrst.object+json` is passed through to the request init (assert via MSW's `request.headers.get(...)`).
   - 204 returns `undefined`.
2. RED — Run `pnpm test postgrest.test`. Six red.
3. GREEN — Implement `postgrest.ts` per Decisions. Use `vi.mock('$lib/shared/state/session.svelte')` to substitute the mock from Task 2.2 — the test asserts that `onUnauthorized` was called via the mock's spy.
4. GREEN — Run `pnpm test postgrest.test`. Six green.

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
  devPasswordSignIn(email: string, password?: string): Promise<{ user: AuthUser }>;
  // POST /auth/token?grant_type=password with {email, password}.
  // Default password = 'cairn-dev'. Returns the user parsed from the
  // response body so the caller can pass it to session.setSignedIn
  // (R8 / Task 3.2).
  logout(): Promise<void>;
  // DELETE /auth/session — middleware clears the cookie.
  ```
- All four use `fetch` with `credentials: 'same-origin'`, `Content-Type: application/json`, and the proxy-prefixed paths. URLs are constructed by prefixing `import.meta.env.VITE_AUTH_BASE` (default `/auth`) to the GoTrue endpoint (`/otp`, `/verify`, `/token`, `/session`). **Tests must pin `VITE_AUTH_BASE` explicitly** via `vi.stubEnv('VITE_AUTH_BASE', '/auth')` in a top-level `beforeAll` (paired with `vi.unstubAllEnvs()` in `afterAll`) — same rationale as Task 2.3's `VITE_API_BASE` pinning, so a contributor `.env` drift can't silently shift the asserted URLs.
- Errors: throw `Error` with the GoTrue error message on non-2xx. The screens' MSW tests assert the specific shapes; the runtime caller catches and routes (inline error vs snackbar).
- `verifyToken` and `devPasswordSignIn` **must guard the 2xx body** before resolving: if the parsed JSON is missing `user.id` or `user.email` (or is not an object), throw the same `Error` shape used for non-2xx. Without the guard, a malformed-but-200 response from a future GoTrue version would produce a resolved promise with `user: undefined`, and the callback (Task 3.4) would call `setSignedIn(undefined)` — an impossible variant under R4. The guard is one runtime narrow per function; it makes the TS-pinned return type honest.
- The endpoint URL for the magic-link request is `/auth/otp` — pinned in Phase 0 (Task 0.2). Both `verifyToken` and `devPasswordSignIn` import `AuthUser` from the session store (`$lib/shared/state/session.svelte`) so the user type is owned in exactly one place and consumers don't have to re-declare the shape.
- A colocated **`__mocks__/auth-client.ts`** ships in this task because both `LoginRequest.test.ts` (Task 3.2, dev-shortcut path) and `auth/callback/+page.test.ts` (Task 3.4, verifyToken path) mock it. Per `.claude/skills/writing-tests.md`, sources mocked from more than one test get a colocated mock to avoid factory-drift between files. The mock exposes the four functions as `vi.fn()` with sensible default resolutions: `sendMagicLink` resolves; `verifyToken` resolves with `{ user: { id: '11111111-…', email: 'dev@example.test' } }` (matching the canonical seed user in `handlers.ts` from Task 2.1); `devPasswordSignIn` resolves with the same shape; `logout` resolves. Tests `vi.mock('$lib/auth/model/auth-client')` (bare; no factory) and override per-test via `vi.mocked(...).mockResolvedValueOnce(...)` or `.mockRejectedValueOnce(...)`.

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
   - `devPasswordSignIn('alice@…')` POSTs `/auth/token?grant_type=password` with `password: 'cairn-dev'` by default and returns `{ user }` parsed from the 200 response body.
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
- **Tests use the real `session` module, not the mock.** `vi.mock(path)` is file-scope hoisted (`.claude/skills/writing-tests.md`); the file can't toggle real vs. mock between cases. Since the auto-clear effect reads `session.current.status` via the real reactivity graph, the test imports the real module and drives transitions through `setSignedIn` / `signOut` / `onUnauthorized` — same entrypoints any consumer would use. The non-network entrypoints (`setSignedIn`, `signOut`, `onUnauthorized`) don't fire HTTP, so MSW is not exercised here.
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
1. RED — Create `pending-login.test.ts` with five cases. The file imports both `pendingLogin`, `setPendingLogin`, `clearPendingLogin` from the real module **and** `session`, `setSignedIn`, `signOut`, `onUnauthorized` from the real `$lib/shared/state/session.svelte`. No `vi.mock` calls; the real reactivity graph is what makes the `$effect.root` fire. `beforeEach` resets state via `clearPendingLogin()` + `signOut()` (the harness-lifecycle exception in `.claude/skills/writing-tests.md` permits this) followed by `await tick()` so any reset-driven `$effect` flushes before the test runs. Cases:
   - `pendingLogin.email` starts as `null`.
   - `setPendingLogin('alice@example.test')` makes `pendingLogin.email === 'alice@example.test'`.
   - `clearPendingLogin()` resets `pendingLogin.email` to `null`.
   - **Auto-clear on `signed-in` transition** — `setPendingLogin('alice@example.test')`, then `setSignedIn({ id: 'u1', email: 'alice@example.test' })` (a deliberate-action entrypoint that writes `session.current = { status: 'signed-in', user }`), then `await tick()`, then assert `pendingLogin.email === null`. The real `$effect.root` ran because the real `session.current` is a `$state` proxy.
   - **No auto-clear on `signed-out` transition** — start from `unknown` (the boot's pre-resolution state), `setPendingLogin('alice@example.test')`, then `onUnauthorized()` (collapses to `signed-out`), `await tick()`, assert `pendingLogin.email === 'alice@example.test'` is **unchanged**. The flow-in-progress invariant from R14.
2. RED — `pnpm test pending-login.test`. Five red.
3. GREEN — Create `pending-login.svelte.ts` with the `$state`-backed proxy and the two mutator functions per Decisions. The module-scoped `$effect.root` watches `session.current.status` and writes `_pending.email = null` only on the transition into `signed-in`. Use `$effect.root(() => { $effect(() => { if (session.current.status === 'signed-in') _pending.email = null; }); })`; the inner `$effect` re-runs whenever the proxy notifies and the body is naturally idempotent.
4. GREEN — Create `__mocks__/pending-login.svelte.ts` per Decisions: `$state`-backed `pendingLogin` proxy plus `vi.fn()` spies for `setPendingLogin` and `clearPendingLogin` whose default implementations write the matching value into `pendingLogin.email`. No `$effect.root` in the mock.
5. GREEN — `pnpm test pending-login.test`. Five green.

**Verify:** `cd web && pnpm test pending-login.test --run` (green) · `cd web && pnpm check` (green).

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
- Tests **don't** try to stub `import.meta.env.DEV` — Vitest 4.x's `vi.stubEnv('MODE', …)` may not re-derive `DEV`/`PROD` (they're Vite-computed booleans, sometimes sealed at config-load time), so a "dev shortcut absent" assertion that relies on flipping `DEV` would silently always pass. Tests stub the **env var** the predicate reads (`VITE_DEV_LOGIN_SHORTCUT`); the `DEV` belt-and-braces stays as untested production-build hygiene. The `__mocks__/dev-shortcut.ts` lets consumer tests (Task 3.2c) toggle the predicate without touching `import.meta.env` at all.

**Files:**
- `web/src/lib/auth/model/dev-shortcut.ts` (create)
- `web/src/lib/auth/model/dev-shortcut.test.ts` (create)
- `web/src/lib/auth/model/__mocks__/dev-shortcut.ts` (create)

**Steps:**
1. RED — Create `dev-shortcut.test.ts` with two cases that mock `import.meta.env` via `vi.stubEnv('VITE_DEV_LOGIN_SHORTCUT', …)`: `isDevLoginShortcutEnabled()` returns `true` when the env var is `'true'`; returns `false` when the env var is absent or any other value. Use `vi.unstubAllEnvs()` in `afterEach`. (Tests don't try to flip `import.meta.env.DEV` — see Decisions.)
2. RED — `pnpm test dev-shortcut.test`. Two red.
3. GREEN — Create `dev-shortcut.ts` per Decisions.
4. GREEN — Create `__mocks__/dev-shortcut.ts` exposing `isDevLoginShortcutEnabled = vi.fn(() => false)` so consumer tests can toggle.
5. GREEN — `pnpm test dev-shortcut.test`. Two green.

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
- On submit: calls `sendMagicLink(email)` from `$lib/auth/model/auth-client.ts` (Task 3.1).
- 2xx → call `setPendingLogin(email)` from `$lib/auth/state/pending-login.svelte` (Task 3.2), **then** `goto('/auth/check')`. Call order is load-bearing: the store write must happen before the navigation so the check route mounts with `pendingLogin.email` already populated. The goto target is a **bare** `/auth/check` — no query string, ever — because R14 / the privacy decision in `PLAN.md` (Decisions, "Pass the pending email…") forbids the email from entering the URL. A future drive-by edit that adds `?email=` here is the regression this task's tests must catch.
- 4xx → render an inline error under the field with `data-test="login-error"`. Does not navigate; does **not** call `setPendingLogin` (the store stays at its previous value, typically `null` on first visit).
- 5xx / network error → flip a local `errorSnack = $state(false)` to `true` and render the `Snackbar` with a generic message and `data-test="login-snackbar"`. The Snackbar is mounted locally inside this component (there's no global Snackbar in `+layout` today); the parent owns `open` and `onclose` as the controlled-component contract requires. Does not call `setPendingLogin`.
- The dev login shortcut renders three secondary buttons under the field — `data-test="dev-login-alice"`, `…-bob`, `…-carol` — when the `isDevLoginShortcutEnabled()` predicate from Task 3.2b returns true. Each button awaits `devPasswordSignIn(<email>)` from the auth client, then calls `session.setSignedIn(user)` with the resolved user, **then** navigates to `/`. Call order is load-bearing — without the `setSignedIn` call (or with it happening *after* the navigate), the route guard sees `signed-out` on the redirect and bounces the user back to `/auth/login`.
- The component imports `isDevLoginShortcutEnabled` from `$lib/auth/model/dev-shortcut` and reads it once at component init to gate the dev buttons.
- Mock file at `__mocks__/LoginRequest.svelte` follows the runes idiom (per `.claude/skills/writing-tests.md`): `let { children, ...rest } = $props(); {@render children?.()}`.

**Reference:** `design/cairn-screens.jsx:120-174` for the visual layout (re-implement idiomatically; do not port React verbatim).

**Files:**
- `web/src/lib/auth/components/LoginRequest.svelte` (create)
- `web/src/lib/auth/components/LoginRequest.test.ts` (create)
- `web/src/lib/auth/components/__mocks__/LoginRequest.svelte` (create)

**Steps:**
1. RED — Create `LoginRequest.test.ts` with the cases from R12. The test mocks `$lib/auth/model/auth-client` (Task 3.1's colocated mock), `$lib/auth/state/pending-login.svelte` (Task 3.2's colocated mock), `$lib/shared/state/session.svelte` (Task 2.2's colocated mock), `$lib/auth/model/dev-shortcut` (Task 3.2b's colocated mock), and `$app/navigation` (inline `vi.mock('$app/navigation', () => ({ goto: vi.fn() }))`). Cases:
   - disabled-until-valid email submit.
   - valid submit calls `sendMagicLink` and writes `pendingLogin.email` (assert via the mock spy) **before** navigating to a bare `/auth/check` — assert call order with `expect(vi.mocked(setPendingLogin).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(goto).mock.invocationCallOrder[0])` (Vitest exposes invocation order via `mock.invocationCallOrder`; `toHaveBeenCalledBefore` is a `jest-extended` matcher and is not installed) and assert the goto argument is exactly the string `'/auth/check'` (no `?email=`, no `?` at all — `expect(goto).toHaveBeenCalledWith('/auth/check')`).
   - 4xx renders the inline error, does **not** navigate, and does **not** call `setPendingLogin`.
   - 5xx opens the Snackbar (`data-test="login-snackbar"`) and likewise does **not** call `setPendingLogin`. The test asserts presence *immediately* after the failing submit settles; it does **not** await the Snackbar's 6 s auto-dismiss timer (`Snackbar.svelte:18-22` schedules a real `setTimeout(onclose, 6000)` whenever `open` is true). If the executor needs deterministic teardown they should scope `vi.useFakeTimers()` to that test — never let the test run-time pass 6 s real-time.
   - Dev shortcut buttons appear when `isDevLoginShortcutEnabled` is mocked to return `true` (via `vi.mocked(isDevLoginShortcutEnabled).mockReturnValue(true)`).
   - Dev shortcut buttons absent when the mock returns `false` (the default).
   - Dev shortcut click awaits the password-grant helper, calls `session.setSignedIn` with the resolved user, *then* `goto('/')` — assert all three in call order via `vi.mocked(...)` spies.
   - **No-TopBar regression guard** — assert `container.querySelector('header') === null` after render (`LoginRequest`'s design at `design/cairn-screens.jsx:120-174` is a flat screen with no top chrome; the same structural check `LoginCheck.test.ts` uses, applied here so a future contributor who adds `<TopBar>` to either screen is caught by paired guards rather than one).
2. RED — Run `pnpm test LoginRequest.test`. Several red tests.
3. GREEN — Create `LoginRequest.svelte` implementing the screen with `data-test` attributes per Decisions. Use scoped `<style>` consuming the design tokens (paper, ink, stone, rule, accent). Import `setPendingLogin` from `$lib/auth/state/pending-login.svelte` and call it on 2xx before `goto`. Import `isDevLoginShortcutEnabled` from `$lib/auth/model/dev-shortcut` and read it once at component init to gate the dev buttons.
4. GREEN — Create the mock at `__mocks__/LoginRequest.svelte`.
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
- On "Send again": calls `sendMagicLink(email)` again. Optional: render a small confirmation message ("sent again at HH:MM") on success. Minimum bar: the call fires; UI feedback is nice-to-have, not gated.
- **No TopBar.** `design/cairn-screens.jsx:177-212` renders LoginCheck as a flat screen — centered icon disc, heading, body, inline accent-coloured "Send again" — with no top chrome. The back affordance is whatever the browser / OS provides (system back, gesture back, browser back); these all call `history.back()` and return the user to `/auth/login` because LoginRequest → LoginCheck was a normal `goto()` that pushed a history entry. Adding a TopBar would diverge from the design without earning anything; if a future iteration wants in-app navigation chrome here it can be added then. The regression test asserts there is no `<header>` element in the rendered DOM (`container.querySelector('header')` is null) — `TopBar.svelte:20` only applies `data-test="topbar"` when the caller passes one, so a `data-test`-based check would silently miss a TopBar re-added without that attribute. The structural `<header>` check is tight.
- "Send again" renders as accent-coloured inline text (a `<button>` element under the hood for keyboard / accessibility, styled to match the design's inline appearance — not the `Button` primitive's pill shape).
- Mock follows the runes-idiom convention.

**Reference:** `design/cairn-screens.jsx:177-212` for the visual layout.

**Files:**
- `web/src/lib/auth/components/LoginCheck.svelte` (create)
- `web/src/lib/auth/components/LoginCheck.test.ts` (create)
- `web/src/lib/auth/components/__mocks__/LoginCheck.svelte` (create)

**Steps:**
1. RED — Create `LoginCheck.test.ts`:
   - Renders the heading and the email from the `email` prop.
   - "Send again" calls `sendMagicLink(email)`.
   - The component renders no TopBar — assert `container.querySelector('header')` is null (structural check; tighter than a `data-test`-based one because `TopBar.svelte` only emits `data-test="topbar"` when the caller passes that prop). A future contributor who re-adds `<TopBar>` — with or without a `data-test` — is caught by this regression guard.
2. RED — `pnpm test LoginCheck.test`. Red.
3. GREEN — Create `LoginCheck.svelte` per Decisions.
4. GREEN — Create the mock.
5. GREEN — `pnpm test LoginCheck.test`. Green.

**Verify:** `cd web && pnpm test LoginCheck.test --run` (green) · `cd web && pnpm check` (green).

### [ ] 3.4 Land the callback page (`web/src/routes/auth/callback/+page.svelte`) with tests

**Created:** 2026-05-13T12:11:12Z
**Completed:**

**Why:** The user lands here from the magic-link email; the page completes the exchange and redirects (R3). The route is the third public path the route guard (Task 4.1) allows.

**Prerequisites:** Task 3.1 (the `verifyToken` helper).

**Decisions:**
- Lives at `web/src/routes/auth/callback/+page.svelte`. No standalone component — the route file is the screen.
- On mount: read `token` and `type` from `page.url.searchParams` (`import { page } from '$app/state'` — the Svelte 5 / SvelteKit 2 runes-aware API, not the legacy `$app/stores` prefix-store `$page`. The whole plan standardises on `$app/state`). The page renders the error state without calling `/auth/verify` when:
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

**Steps:**
1. RED — Create `+page.test.ts`:
   - Renders the loading state on mount.
   - POSTs `/auth/verify` with `{token, type: 'magiclink'}` via MSW assertion.
   - On 200, calls `session.setSignedIn(user)` with the user from the verify response, **then** `goto('/', { replaceState: true })` — mock `$app/navigation`'s `goto` via an inline `vi.mock('$app/navigation', () => ({ goto: vi.fn() }))` factory (SvelteKit virtual modules have no source file to colocate a `__mocks__/` next to), and mock the session module via its colocated `__mocks__/session.svelte.ts` (Task 2.2). Assert call order via `expect(vi.mocked(setSignedIn).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(goto).mock.invocationCallOrder[0])` — Vitest exposes invocation order via `mock.invocationCallOrder`; `toHaveBeenCalledBefore` is a `jest-extended` matcher and is not installed.
   - On 401, renders the error state with the "Back to sign in" affordance and does **not** call `setSignedIn` or `goto`.
   - On missing `token` query param, renders the error state immediately without calling `/auth/verify`.
   - On `type` other than `'magiclink'` (e.g. `type=recovery`), renders the error state immediately without calling `/auth/verify`.
2. RED — `pnpm test auth/callback`. Red.
3. GREEN — Create `+page.svelte` per Decisions.
4. GREEN — `pnpm test auth/callback`. Green.

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
- Co-located test at `web/src/routes/auth/check/+page.test.ts` mocks `$lib/auth/state/pending-login.svelte` (the `__mocks__/pending-login.svelte.ts` mock from Task 3.2) so the test can drive `pendingLogin.email`, and mocks `$app/navigation` to capture `goto` calls. The mock for `$lib/auth/components/LoginCheck.svelte` (Task 3.3's `__mocks__/LoginCheck.svelte`) is also used so the test isn't entangled with `LoginCheck`'s internals.

**Files:**
- `web/src/routes/auth/login/+page.svelte` (create)
- `web/src/routes/auth/check/+page.svelte` (create)
- `web/src/routes/auth/check/+page.test.ts` (create)

**Steps:**
1. RED — Create `auth/check/+page.test.ts` with three cases:
   - `pendingLogin.email = 'alice@example.test'` before render → renders `LoginCheck` with `email="alice@example.test"` as the prop (assert by mocking `LoginCheck` and inspecting the props the mock received, or by querying for the mock's `data-test` if it forwards the email).
   - `pendingLogin.email = null` before render → calls `goto('/auth/login', { replaceState: true })` on mount and does **not** render `LoginCheck` (assert via `queryByDataTest` returning null for any `LoginCheck` data-test).
   - Visiting `/auth/check?email=alice@example.test` directly: the route does **not** read the query string. Simulate by setting the mock `$app/state` `page.url` to `new URL('http://localhost/auth/check?email=alice@example.test')` and leaving `pendingLogin.email = null`. Assert: redirect fires, no email is read from the URL. (This is the regression guard against a future "convenience" patch that re-introduces URL reading.)
2. RED — `pnpm test auth/check`. Three red.
3. GREEN — Create both route files per Decisions.
4. GREEN — `pnpm test auth/check`. Three green.
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
- Import `PUBLIC_AUTH_PATHS` and `isSegmentMatch` from `$lib/shared/model/auth-paths` (the helper landed in Task 1.4). **Do NOT redefine the path list or the matching predicate inline.** Task 1.4's helper is the single home for segment-anchored auth-path matching across the proxy bypass, the bearer-attach narrow, the DELETE matcher, and this guard; an inline `startsWith` here would silently drift from the other three sites.
- In `+layout.svelte`'s `<script>`: call `bootSession()` on mount via `onMount`. (`$effect.pre` would also work but introduces SSR-vs-CSR semantic differences that aren't load-bearing here; `onMount` is the simpler choice and matches what the snippet below assumes.)
- The block-render gate is wider than just `unknown` — it also covers `signed-out`-on-a-private-path. Without that widening, the `$effect` redirect fires *after* the next paint, briefly mounting the private route's children (R7). Wrap the existing `{@render children()}` in:
  ```svelte
  <script lang="ts">
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { page } from '$app/state';
    import { session, bootSession } from '$lib/shared/state/session.svelte';
    import { PUBLIC_AUTH_PATHS, isSegmentMatch } from '$lib/shared/model/auth-paths';
    import CairnWordmark from '$lib/shared/components/CairnWordmark.svelte';

    const blocked = $derived(
      session.current.status === 'unknown' ||
      (session.current.status === 'signed-out' &&
        !isSegmentMatch(page.url.pathname, PUBLIC_AUTH_PATHS))
    );

    onMount(() => { bootSession(); });

    // Public paths the signed-in user should be redirected AWAY from.
    // `/auth/callback` is deliberately excluded — the callback page
    // owns its own post-exchange goto('/'), and racing two redirects
    // is messier than letting that one win.
    const SIGNED_IN_REDIRECT_PATHS = ['/auth/login', '/auth/check'] as const;

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
  - `vi.mock('$app/state', ...)` — `$app/state` has no source file in `web/src/` to colocate a `__mocks__/` next to (it's a SvelteKit virtual module), so use a `.svelte.ts` mock file at `web/src/lib/test/app-state-mock.svelte.ts` containing `let _url = $state(new URL('http://localhost/')); export const page = { get url() { return _url; }, set url(v: URL) { _url = v; } }`, then inline `vi.mock('$app/state', async () => await import('$lib/test/app-state-mock.svelte'))`. The runes-backed `_url` makes `page.url` reactive — mid-test assignments (`page.url = new URL('http://localhost/some-path')`) re-fire the layout's `$derived` and `$effect`, which is load-bearing for the new "signed-in on public path → redirect to `/`" case and any future case that needs to observe behaviour across a path change without remounting. Each test (or `beforeEach` for harness-lifecycle resets) sets `page.url` to a fresh URL before rendering; the `$state` proxy guarantees the layout sees the assignment.
  - `vi.mock('$lib/shared/state/session.svelte')` — picks up the runes-idiom mock from `__mocks__/session.svelte.ts` (Task 2.2). Each test sets `session.current = { status: 'unknown' | 'signed-in' | 'signed-out', user? }` before rendering.
  - `auth-paths.ts` is **not** mocked — the test uses the real predicate so a regression that weakens it (e.g. a future drive-by edit changing `isSegmentMatch` to a `startsWith`) fails both the auth-paths tests AND this layout's `/auth/loginx` case.
  - All three mocks are `vi.mock()` at file scope so they hoist; the *values* they expose are mutated per-test, not the mocks themselves (per `.claude/skills/writing-tests.md` — no shared `beforeEach` for mock state, but a `beforeEach` for harness-lifecycle resets like `vi.mocked(goto).mockClear()` is fine).

**Reference:** `docs/ui.md:148` for the `replaceState` rule (which applies to the redirect to `/auth/login` as well — back from `/auth/login` shouldn't bounce back into the protected route).

**Files:**
- `web/src/routes/+layout.svelte` (modify)
- `web/src/routes/+layout.test.ts` (create)
- `web/src/lib/test/app-state-mock.svelte.ts` (create — `$state`-backed `$app/state` mock; see Decisions)

**Steps:**
1. RED — Create `+layout.test.ts` with the cases below (one assertion family per case; the count was six in the original draft and is seven with the signed-in-public redirect added under R7):
   - Boot screen renders when `session.current.status === 'unknown'` — assert `queryByDataTest('boot-screen')` is non-null and `queryByDataTest('layout-children')` (a `data-test` injected by a stub child snippet for these tests) is `null`.
   - Children render when `signed-in`.
   - Redirect to `/auth/login` for `signed-out` on a private path **and** the private path's children do **not** render (the block-render gate keeps the DOM clean — assert via `queryByDataTest` returning `null` for a `data-test` the test injects via a stub child).
   - No redirect, no boot screen, children DO render for `signed-out` on each of the three public paths (`/auth/login`, `/auth/check`, `/auth/callback`).
   - **Redirect for `signed-out` on `/auth/loginx`** — a sibling-prefix path that a naive `startsWith('/auth/login')` would treat as public; the shared segment-anchored predicate must reject it. (Duplicates Task 1.4's auth-paths test, deliberately, so a refactor that decouples the layout from `auth-paths.ts` is caught at *both* sites.)
   - **`signed-in` on `/auth/login` redirects to `/` with `replaceState: true`** (R7 — signed-in users should not see stale login screens). Same case for `/auth/check`. Assert `expect(goto).toHaveBeenCalledWith('/', { replaceState: true })`.
   - **`signed-in` on `/auth/callback` does NOT redirect from the guard** — the callback page owns its own `goto('/')` per R3; the guard letting it render unimpeded keeps the two redirects from racing. Assert `expect(goto).not.toHaveBeenCalled()` (and children render).
   - Children render when `signed-in` on a **private** path (no boot screen, no redirect).
   Use the three mocks described in Decisions. The real `isSegmentMatch` from `auth-paths.ts` is imported (not mocked) so the segment-anchoring contract is enforced end-to-end.
2. RED — `pnpm test +layout.test`. Seven red.
3. GREEN — Modify `+layout.svelte` per Decisions. Keep the existing token CSS imports.
4. GREEN — `pnpm test +layout.test`. Seven green.

**Verify:** `cd web && pnpm test +layout --run` (green) · `cd web && pnpm dev` and visit `/` in a fresh browser tab: redirected to `/auth/login` (manual).

### [ ] 4.2 Add a temporary Sign Out button to `+page.svelte`

**Created:** 2026-05-13T12:11:12Z
**Completed:**

**Why:** The Playwright E2E needs a UI affordance to click for sign-out. The "real" Sign Out lives in Settings (Step 4 builds Settings); for now, a small temporary button on the placeholder `/` page is the minimum.

**Prerequisites:** Task 4.1 (signed-in users land here).

**Decisions:**
- The placeholder `/` page currently renders a `CairnWordmark` and nothing else. Add a small button labelled "Sign out" (`data-test="signout"`) below it.
- On click: `await signOut()` from the session store. The route guard then redirects to `/auth/login`.
- Tag the button visually as temporary (a code comment, not UI text) so whoever writes Step 4 knows to move it.

**Files:**
- `web/src/routes/+page.svelte` (modify)

**Steps:**
1. GREEN — Add the Sign Out button and the onclick handler. Use the `Button` primitive from `$lib/basic/`.
2. GREEN — Manual: sign in via the dev shortcut, click Sign Out, confirm redirect to `/auth/login` and that the cookie is gone (`document.cookie` from devtools should not list `cairn_session` — actually it never would because HttpOnly, but Application → Cookies in devtools shows it).

**Verify:** `cd web && pnpm dev`, manual sign-in via dev shortcut, click Sign out → redirected to `/auth/login` · `cd web && pnpm check` (green).

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
  - **Magic-link happy path.** Visit `/`. Asserts redirect to `/auth/login`. Fills the email field with `alice+${test.info().testId}@example.test`. Clicks Submit. Asserts navigation to a **bare** `/auth/check` — specifically `await expect(page).toHaveURL(/\/auth\/check$/)` so the regex anchors the end and a future drift that appends `?email=…` fails the assertion (R14 / privacy decision). Calls `waitForMagicLink` from the helper. `page.goto(link)`. Asserts the URL is now `/` and the `cairn_session` cookie is present in `context.cookies()`. Clicks "Sign out". Asserts redirect back to `/auth/login` and the cookie is gone.
  - **Dev shortcut path.** Visit `/auth/login`. Clicks the "Alice" dev shortcut button. Asserts navigation to `/` and the cookie is set. (Skipped if `VITE_DEV_LOGIN_SHORTCUT` is not `'true'` in the dev `.env`.)
- Both tests are independent — no `test.describe.serial`.
- The Playwright `webServer` block (`web/playwright.config.ts:33-37`) auto-starts the dev server; the backend (`docker compose up -d`) is assumed running per `docs/testing.md:206-211`.

**Reference:** `docs/testing.md:171-227` for the Playwright layer conventions.

**Files:**
- `web/e2e/auth.spec.ts` (create)

**Steps:**
1. GREEN — Implement the spec.
2. GREEN — Run `cd web && pnpm test:e2e --project=chromium auth`. Confirm both tests pass.
3. GREEN — Run `cd web && pnpm test:e2e auth` (all three browsers). Confirm all six tests pass.

**Verify:** `cd web && pnpm test:e2e auth` (six green tests across chromium/firefox/webkit) · `./scripts/check.sh` (full green).
