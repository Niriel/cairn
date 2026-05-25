# Plan: Avatars (profile pictures)

Step 5 of the master plan — profile pictures. Steps 1–4 are merged; the
`<Avatar>` component renders initials only. This plan adds real photos and the
Edit Profile screen, closing the loop started in step 4's Settings screen.

## Context

The stack after step 4:
- **DB:** `profiles` has `display_name` but no `avatar_version`. The `<Avatar>`
  component branches on `display_name` for initials — there is no photo path.
- **Settings screen:** shows a profile chip (avatar + display name) but the
  chip is not tappable. The "Edit profile" destination does not exist yet.
- **Caddy:** serves the SvelteKit PWA only; no `/avatars/*` route.
- **Docker Compose:** Postgres, PostgREST, GoTrue, Caddy, Mailpit — no sidecar.

Three things must land before any later step can reference a photo:
1. The `avatar_version` column and its RPCs (`bump_avatar_version`,
   `clear_avatar`, `set_display_name`).
2. The upload sidecar that writes the file and calls PostgREST.
3. The web app's `<Avatar>` photo branch and the Edit Profile UI.

Each layer is independently testable and deployable, so this plan is an
orchestration plan: three sub-branches merged into `0500_avatars` before
`0500_avatars` merges to `main`. This matches the `0400_mvp_product` pattern
(see `plans/0400_mvp_product/PLAN.md`).

**Why display name editing lands here (R12).** Step 4 explicitly deferred
display name editing. But step 5 introduces the Edit Profile screen, which has
a **Save** button. Shipping a Save button that silently ignores the display name
field is broken UX. The RPC (`set_display_name`) is trivial and belongs in the
same migration as the other avatar RPCs; wiring it into the Save action is one
extra call in the frontend task.

## Decisions

**Orchestration via sub-branches, not a single large branch.** The three layers
(DB, sidecar, frontend) have distinct test surfaces (pgTAP, sidecar integration,
Playwright) and different reviewers' mental models. Splitting keeps each PR
focused. `0500_avatars` itself contains no implementation — only the plan files
and the merge commits.

**Node/TypeScript sidecar.** Go and Python were the other candidates. Node wins
because: (a) no new language in the stack — the maintainer already knows
TypeScript; (b) `sharp` (libvips bindings) is the fastest Node image-processing
library and is well-maintained; (c) a single `sidecar/` directory with its own
`package.json` adds one service to `docker-compose.yml` without a new language
runtime download. The sidecar runs in the same compose network as PostgREST, so
`POST /rpc/bump_avatar_version` is an internal HTTP call with no extra exposure.

**8 MB body cap + 4096² decoded-bounds check are both required (R5).** These
are two independent gates doing different jobs. The 8 MB cap is the cheap
front-line filter — it bounds network workload before any image library decodes
bytes. The 4096² cap is the load-bearing security check — a small file can
decode to a huge pixel buffer (image bombs). Both are enforced before resize;
whichever fires first wins, and the error messages to the client are generic
enough not to reveal which gate caught the request.

**Atomic rename on write (R5).** The sidecar writes to a temp file in the same
directory and renames it into place. This means Caddy never serves a partial
file, and a sidecar crash mid-write leaves an invisible orphan (no row points
at it) rather than a corrupted file.

**The file, not the row, is deleted on remove (R10).** `clear_avatar()` resets
the row immediately (fast, atomic). `DELETE /avatars/me` on the sidecar is
best-effort and fires after — if it fails the row's `avatar_version = 0` is
already the source of truth and the orphan sweeper handles the file. This keeps
the UX snappy (no waiting for the sidecar after the row update) and makes the
row the authoritative source.

**`set_display_name` as a security-definer RPC (R12).** A direct `PATCH
/profiles` via PostgREST would work — `profiles_update` already gates writes to
the caller's own row — but a named RPC lets us enforce the trim + non-empty +
max-length constraints in SQL without client-side validation being the only
gate. Consistent with the other avatar RPCs in the same migration.

**`tg_set_modified_at` rebind requires DROP + CREATE.** Adding `avatar_version`
to the trigger's `OF (cols)` clause cannot be done with `ALTER TRIGGER` —
Postgres does not support altering the `BEFORE UPDATE OF` column list. The
migration must `DROP TRIGGER t20_set_modified_at ON public.profiles` and
recreate it as `BEFORE UPDATE OF display_name, avatar_version ON public.profiles`.
The 0501 sub-plan must include this pattern in its migration task steps.

**Orphan sweeper connects directly to Postgres via `psql`.** The sweeper runs
on the VPS host and does not go through PostgREST (which would require a valid
JWT). It connects as the `cairn` role using `psql $DATABASE_URL`. The
`DATABASE_URL` env var must be documented in `crontab.example`. No JWT or
sidecar involvement.

## Architecture

### New directories

- **`sidecar/`** — Node/TypeScript upload sidecar. Own `package.json`,
  `tsconfig.json`, `Dockerfile`. Dependencies: `express`, `sharp`, `multer`,
  `jose` (GoTrue JWT verification).

### New files — DB

- **`db/migrations/0007_avatars.sql`** — `ALTER TABLE profiles ADD COLUMN
  avatar_version`, `bump_avatar_version()`, `clear_avatar()`,
  `set_display_name()`, trigger rebind (see Decisions).
- **`db/tests/avatars.sql`** — pgTAP for R1–R4 and R12.

### New files — sidecar

- **`sidecar/src/index.ts`** — Express app, three routes (R5).
- **`sidecar/Dockerfile`** — multi-stage build: compile TypeScript, copy
  `dist/` into a slim Node image.
- **`sidecar/package.json`** / **`sidecar/tsconfig.json`** — project config.

### Modified files — DB tests

- **`db/tests/schema_shape.sql`** — add `has_column` for `profiles.avatar_version`
  and `has_function` assertions for the three new RPCs.
- **`db/tests/grants.sql`** — add `EXECUTE` grant coverage for `bump_avatar_version`,
  `clear_avatar`, `set_display_name`.
- **`db/tests/triggers_modified_at.sql`** — add assertion: bumping `avatar_version`
  advances `profiles.modified_at`.

### Modified files — infra

- **`docker-compose.yml`** — add `sidecar` service; add named `avatars` volume
  mounted read-write in sidecar, read-only in Caddy.
- **`caddy/Caddyfile`** — two distinct matchers are needed on the `/avatars`
  prefix: (1) a method matcher for `POST` and `DELETE` that reverse-proxies to
  the sidecar (e.g. `@sidecar_writes { method POST DELETE; path /avatars* }`
  → `reverse_proxy sidecar:3001`), and (2) `handle_path /avatars/*` for `GET`
  static serving with `Cache-Control: public, max-age=31536000, immutable`.
  A single `handle_path` block cannot serve both roles (R5, R6).

### Modified files — web app

- **`web/src/lib/shared/components/Avatar.svelte`** — add photo branch (R7).
  Adding `uid` and `avatar_version` props changes the component's signature;
  all three existing callers (`ItemsScreen.svelte`, `ListsScreen.svelte`,
  `SettingsScreen.svelte`) and the test + mock (`Avatar.test.ts`,
  `__mocks__/Avatar.svelte`) must be updated in the same task.
- **`web/src/lib/shared/state/profile.svelte.ts`** — fetch `avatar_version`
  alongside `display_name` (R7).
- **`web/src/routes/(app)/settings/+page.svelte`** — make profile chip tappable,
  navigate to Edit Profile (R8).
- **`web/src/routes/(app)/profile/+page.svelte`** (create) — Edit Profile
  screen (R8, R9, R10, R12).
- **`web/src/lib/avatar/components/AvatarSourceSheet.svelte`** (create) — source
  picker sheet, under the new `avatar/` domain directory (R9).
- **`web/src/lib/avatar/components/AvatarCropScreen.svelte`** (create) — crop step,
  under the new `avatar/` domain directory (R9).
- **`web/e2e/avatar.spec.ts`** (create) — Playwright: upload, replace, remove
  happy paths (R7–R10).

### New files — ops

- **`scripts/sweep-avatars.sh`** — orphan sweep script called by cron (R11).
- **`crontab.example`** (or equivalent) — nightly sweep entry.

### Data flow

```
Browser
  │ POST /avatars (multipart, bearer token)
  ▼
Caddy (reverse-proxy to sidecar on :3001)
  ▼
Sidecar
  ├── verify bearer token → GoTrue /user
  ├── validate magic bytes, size, bounds
  ├── sharp: resize → 256×256 WebP
  ├── atomic rename → /srv/cairn/avatars/{uid}.webp
  └── POST /rpc/bump_avatar_version → PostgREST
          ▼
        Postgres (UPDATE profiles SET avatar_version = avatar_version + 1)

Browser (reads new avatar_version from Profile store)
  └── <img src="/avatars/{uid}.webp?v=N"> → Caddy (static, Cache-Control: immutable)
```

## Phase structure

1. **Phase 1 — 0501: Avatar DB.** Create branch `0501_avatar_db` from
   `0500_avatars`. Write its detailed plan, implement the migration and pgTAP
   tests (R1–R4, R12 DB half), verify with `./scripts/check.sh`, merge back.

2. **Phase 2 — 0502: Avatar sidecar + Caddy.** Create branch
   `0502_avatar_sidecar` from the updated `0500_avatars`. Write its detailed
   plan, implement the Node sidecar + Docker Compose + Caddy config (R5, R6),
   verify with `./scripts/check.sh`, merge back.

3. **Phase 3 — 0503: Avatar frontend.** Create branch `0503_avatar_frontend`
   from the updated `0500_avatars`. Write its detailed plan, implement the
   `<Avatar>` photo branch, Edit Profile screen, source sheet, crop step,
   upload states, remove flow, orphan sweeper (R7–R12 UI half), verify with
   `./scripts/check.sh --e2e`, merge back. **Toolchain ordering constraint:**
   the 0503 sub-plan's first task must create the `(app)/profile/+page.svelte`
   stub before any task adds `goto('/profile')` to `settings/+page.svelte`;
   SvelteKit's `resolve()` rejects unknown route IDs at type-check time. See
   `docs/quality.md` "Navigating to a not-yet-created SvelteKit route" for
   the documented escape if reordering isn't practical.

4. **Phase 4 — Wrap up.** Run `./scripts/check.sh --e2e` on `0500_avatars`.
   Tick step 5's checkbox in `plans/0000_implementation_order.md`. Merge
   `0500_avatars` into `main` with `--no-ff`.

## Reference docs and skills

- **`docs/avatars.md`** — authoritative spec for storage decisions, sidecar
  routes, cache-busting URL pattern, file lifecycle, orphan sweeper.
- **`docs/data-model.md`** — schema conventions (column ordering, trigger
  extension pattern, security-definer RPC shape).
- **`docs/ui.md`** — TopBar conventions, button order, back-stack pattern.
- **`docs/testing.md`** — three test layers; pgTAP for RLS/triggers, Vitest
  for components, Playwright for flows.
- **`design/cairn-avatar-screens.jsx`** — visual spec for Edit Profile,
  AvatarSourceSheet, AvatarCropScreen, five upload states.
- **`.claude/skills/write-plan.md`** — sub-branch plan format.
- **`.claude/skills/writing-tasks.md`** — task format each sub-plan must follow.
