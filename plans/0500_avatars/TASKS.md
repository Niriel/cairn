# Tasks

## Reference skills and docs

- **`.claude/skills/write-plan.md`** — how to create a sub-plan directory (branch, number, slug, three files).
- **`plans/0500_avatars/REQUIREMENTS.md`** — full step-5 requirements (R1–R12); each sub-plan refines a subset.
- **`docs/avatars.md`** — authoritative spec: sidecar routes, storage decisions, cache-busting, orphan sweeper.
- **`docs/data-model.md`** — schema conventions (column ordering, security-definer RPC shape, trigger extension).
- **`docs/testing.md`** — three test layers; pgTAP for DB, Vitest for components, Playwright for flows.
- **`design/cairn-avatar-screens.jsx`** — visual spec for every screen and state in the frontend sub-plan.

---

## Phase 1 — 0501: Avatar DB

### [ ] 1.1 Plan and implement sub-step 0501 (avatar migration + pgTAP)

**Created:** 2026-05-24T00:00:00Z
**Completed:**

**Why:** The DB contract must be settled before the sidecar or the frontend
can be built against it. Landing the migration first means sub-plans 0502 and
0503 can call `bump_avatar_version` and `clear_avatar` without waiting.

**Prerequisites:** `0500_avatars` branch exists and is checked out.

**Decisions:**
- Sub-branch is cut from `0500_avatars`, not from `main`.
- Scope: `db/migrations/0007_avatars.sql` (column + three RPCs + trigger
  rebind — DROP + CREATE) and `db/tests/avatars.sql` (pgTAP, R1–R4 and
  R12 DB half), plus updates to `db/tests/schema_shape.sql`,
  `db/tests/grants.sql`, and `db/tests/triggers_modified_at.sql`.
- No frontend or sidecar work in this sub-branch.
- `set_display_name` RPC lives in this migration alongside the avatar RPCs —
  the Edit Profile screen (0503) needs it and the migration is the right home.

**Steps:**
1. `git checkout -b 0501_avatar_db 0500_avatars`
2. Invoke `/write-plan` to create `plans/0501_avatar_db/` with its
   REQUIREMENTS.md, PLAN.md, and TASKS.md.
3. Implement the sub-plan task by task (via `/work` or manually).
4. Run `./scripts/check.sh` — must be green.
5. `git checkout 0500_avatars && git merge --no-ff 0501_avatar_db`

**Verify:** `./scripts/check.sh` green on `0500_avatars` after merge.

---

## Phase 2 — 0502: Avatar sidecar + Caddy

### [ ] 2.1 Plan and implement sub-step 0502 (Node sidecar + Caddy static block)

**Created:** 2026-05-24T00:00:00Z
**Completed:**

**Why:** The sidecar is the write path for all avatar uploads. It must exist
before the frontend can wire up the upload flow. This is also where the Docker
Compose and Caddy changes land, so the serve path is in place for 0503's
Playwright tests.

**Prerequisites:** Task 1.1 merged — `0500_avatars` contains the migration and
RPCs the sidecar calls (`bump_avatar_version`).

**Decisions:**
- Sub-branch cut from the updated `0500_avatars` (post-0501 merge).
- Scope: `sidecar/` Node/TypeScript service (R5), `docker-compose.yml` sidecar
  service entry + named `avatars` volume, `caddy/Caddyfile` `/avatars/*` block
  (R6). No web-app UI changes.
- Sidecar language: TypeScript + `express` + `sharp` + `jose` for JWT verification.
- Three routes: `POST /avatars`, `DELETE /avatars/me`, `GET /healthz`.
- The 0502 sub-plan **must** include automated tests for the three
  security-critical validation gates — (a) a file whose extension says JPEG
  but whose magic bytes are not JPEG, (b) a valid small JPEG that decodes to
  > 4096×4096 pixels (image bomb), and (c) a body exceeding 8 MB. A minimal
  integration-test script (e.g. `sidecar/test/validate.test.ts` run via
  `pnpm test` inside `sidecar/`, called from `./scripts/check.sh`) is the
  preferred form. These gates are the load-bearing security surface; manual
  `curl` alone is not a repeatable regression guard.
- `jose` JWT verification requires the GoTrue JWT secret; the 0502 sub-plan
  must document the sidecar env var (e.g. `GOTRUE_JWT_SECRET`) in
  `docker-compose.yml` and note how it is sourced. The sidecar also needs a
  `POSTGREST_URL` env var (e.g. `http://postgrest:3000`) to call
  `/rpc/bump_avatar_version`; document it alongside `GOTRUE_JWT_SECRET`.
- **Security — validate `uid` before file path construction.** The `uid` is
  extracted from the verified JWT `sub` claim, but the 0502 sub-plan must
  include an explicit UUID-format check (e.g. `/^[0-9a-f-]{36}$/i`) before
  any file path is constructed. Reject with 400 if the claim fails the check.
  Defence in depth — GoTrue signs the JWT but the sidecar should not trust
  claim values for filesystem operations without validation.
- **Temp file must live inside the avatars volume directory.** Write the temp
  file to `{avatarsDir}/{uid}.webp.tmp` — same directory, same Docker volume
  — so `rename()` is within one filesystem and is atomic. Do **not** use
  `os.tmpdir()` or any path outside the volume; a cross-filesystem rename
  fails with EXDEV and the "atomic" property is lost.

**Steps:**
1. `git checkout -b 0502_avatar_sidecar 0500_avatars`
2. Invoke `/write-plan` to create `plans/0502_avatar_sidecar/` with its three files.
3. Implement the sub-plan task by task.
4. Run `./scripts/check.sh` — must be green.
5. `git checkout 0500_avatars && git merge --no-ff 0502_avatar_sidecar`

**Verify:** `./scripts/check.sh` green on `0500_avatars` after merge. Sidecar
is reachable at `GET /healthz` in the running dev stack.

---

## Phase 3 — 0503: Avatar frontend

### [ ] 3.1 Plan and implement sub-step 0503 (Avatar component + Edit Profile screens)

**Created:** 2026-05-24T00:00:00Z
**Completed:**

**Why:** The frontend is the heaviest sub-step — it spans the Avatar photo
branch, the Edit Profile screen, source sheet, crop step, five upload states,
the remove flow, and the orphan sweeper. It depends on both the DB (0501) and
the sidecar (0502) being in place.

**Prerequisites:** Tasks 1.1 and 2.1 merged — `0500_avatars` contains the
migration RPCs and the running sidecar + Caddy serve path.

**Decisions:**
- Sub-branch cut from the updated `0500_avatars` (post-0502 merge).
- Scope covers R7–R12 (UI half): `<Avatar>` photo branch, `profile.svelte.ts`
  update, Settings profile chip navigation, Edit Profile screen, AvatarSourceSheet,
  AvatarCropScreen, five upload states, remove flow, `set_display_name` wiring,
  orphan sweeper script, Playwright e2e.
- Before writing tasks, read `design/cairn-avatar-screens.jsx` and
  `docs/ui.md` — the visual spec is in the JSX and the layout conventions are
  in the doc. Record font sizes, padding, and colours in the sub-plan's tasks.
- **Component paths.** The existing profile store to modify is
  `web/src/lib/shared/state/profile.svelte.ts` (not `domain/profile/`). New
  avatar-specific components (`AvatarSourceSheet`, `AvatarCropScreen`) go in
  `web/src/lib/avatar/components/` per `docs/frontend-layout.md` (create the
  `avatar/` domain directory).
- **Avatar prop change — update all callers.** `Avatar.svelte` gains `uid` and
  `avatar_version` props. The 0503 sub-plan must include all five affected
  files in the relevant task's Files list:
  `web/src/lib/item/components/ItemsScreen.svelte`,
  `web/src/lib/list/components/ListsScreen.svelte`,
  `web/src/lib/settings/components/SettingsScreen.svelte`,
  `web/src/lib/shared/components/Avatar.test.ts`,
  `web/src/lib/shared/components/__mocks__/Avatar.svelte`.
  The RED step writes the updated component test before the GREEN step changes
  the component signature.
- **Toolchain ordering constraint.** The first task of the 0503 sub-plan must
  create a minimal `web/src/routes/(app)/profile/+page.svelte` stub **before**
  any task adds `goto('/profile')` to `settings/+page.svelte`. SvelteKit's
  `resolve()` will reject the unknown route ID at type-check time otherwise. See
  `docs/quality.md` → "Navigating to a not-yet-created SvelteKit route" for the
  escape hatch if reordering is not practical.
- **UploadingState back arrow must be disabled during active upload.** R9 says
  "The TopBar back arrow is **disabled** during active upload." The
  `UploadingState` JSX renders the same back-arrow `<IconBtn>` for every `kind`
  without a disabled state (the mockup is static). R9 is authoritative: when
  `kind === 'uploading'`, render the back-arrow button as `disabled` with
  `pointer-events: none`. For `success` and error states (`too-big`,
  `wrong-format`, `network`) the back arrow navigates normally. The 0503 sub-plan
  must record this in its task's Decisions so the executor doesn't use the JSX
  as the sole reference.
- **Pinch-zoom crop — decide on implementation before writing tasks.** R9
  requires drag and pinch-zoom in `AvatarCropScreen`. The 0503 sub-plan must
  choose one of: (a) native `pointermove` / `wheel` / `touchstart` inline
  implementation (preferred if achievable in ~80 lines); (b) `@use-gesture/vanilla`
  added to `web/package.json`. The choice must appear in the relevant task's
  Decisions so the executor doesn't make a dependency decision ad hoc mid-task.

**Steps:**
1. `git checkout -b 0503_avatar_frontend 0500_avatars`
2. Invoke `/write-plan` to create `plans/0503_avatar_frontend/` with its three files.
3. Implement the sub-plan task by task.
4. Run `./scripts/check.sh --e2e` — must be green.
5. `git checkout 0500_avatars && git merge --no-ff 0503_avatar_frontend`

**Verify:** `./scripts/check.sh --e2e` green on `0500_avatars` after merge.
Upload, replace, and remove flows work in the browser against the dev stack.

---

## Phase 4 — Wrap up

### [ ] 4.1 Final verification and merge to main

**Created:** 2026-05-24T00:00:00Z
**Completed:**

**Why:** Confirms the full step-5 feature works end-to-end on the integration
branch before it lands on `main`.

**Prerequisites:** Tasks 1.1, 2.1, 3.1 all merged into `0500_avatars`.

**Decisions:**
- Run the full E2E suite before merging — the avatar upload and remove flows
  must pass alongside the step-4 flows (lists, items, settings, sign out).
- Tick step 5's checkbox in `plans/0000_implementation_order.md` as part of
  the merge commit.
- Also close the "Sidecar implementation language" open question: delete its
  bullet from `docs/open-questions.md` and add a one-line note in
  `docs/avatars.md` § Open questions recording the Node choice.

**Steps:**
1. On `0500_avatars`, run `./scripts/check.sh --e2e` — must be green.
2. Edit `docs/open-questions.md`: delete the "Sidecar implementation language"
   bullet under Avatars.
3. Edit `docs/avatars.md` § Open questions: replace the open question with a
   one-liner noting Node was chosen (e.g. "Sidecar is TypeScript/Node —
   chosen 2026-05 for stack consistency; see `plans/0500_avatars/PLAN.md`").
4. Edit `docs/avatars.md` § "Schema delta": replace `0005_avatars.sql` with
   `0007_avatars.sql` (the migration numbering settled after the doc was
   written; `0007` is the correct slot given the migrations that landed in
   steps 1–4).
5. Edit `docs/data-model.md` § "What the app sees": add
   `POST /rpc/set_display_name` to the RPC list (body `{new_name}`) and
   annotate the existing `PATCH /profiles?id=eq.<my-uid>` line to note that
   display name is now written via the RPC (which enforces trim + length),
   not via direct PATCH.
6. Edit `plans/0000_implementation_order.md`: change `5. [ ]` to `5. [x]`.
7. Edit `plans/0000_implementation_order.md` step 5 description: replace
   `0005_avatars.sql` with `0007_avatars.sql`.
8. Edit `plans/0000_implementation_order.md` step 5 description: replace
   "Go / Python / Node — see `docs/open-questions.md`" with
   "TypeScript/Node (decided 2026-05; see `plans/0500_avatars/PLAN.md`)".
7. Commit: `chore(plan): tick step 5 in implementation order`.
8. `git checkout main && git merge --no-ff 0500_avatars`

**Verify:** `./scripts/check.sh --e2e` green on `main`. Avatar upload, replace,
and remove flows work in the browser.
