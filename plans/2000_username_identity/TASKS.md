# Tasks

This is an **orchestration plan**: each phase below creates a sub-branch off
`2000_username_identity`, runs `/write-plan` to author its three files,
implements it, and merges it back with `--no-ff`. No implementation code is
written directly on this branch — see `plans/0400_mvp_product/TASKS.md` for the
worked example this mirrors.

## Reference skills and docs

- **`.claude/commands/write-plan.md`** — how to create a sub-plan directory
  (branch, number, slug, three files); the orchestration numbering convention.
- **`plans/2000_username_identity/REQUIREMENTS.md`** — the step-20 contract
  (R1–R13); each sub-plan refines a subset, noted per requirement.
- **`plans/2000_username_identity/PLAN.md`** — decomposition rationale and the
  cross-cutting decisions (replace-not-coexist, case-fold uniqueness, the
  GoTrue-mechanism lean, migrate-from-display-name).
- **`docs/architecture.md`**, **`docs/data-model.md`**, **`docs/invites.md`** —
  the specs Phase 0 of sub-step 2001 reconciles, and the contracts every later
  sub-plan must preserve.
- **`docs/testing.md`** — the three test layers each sub-plan ships against.

## Phase 1 — 2001: identity model + doc reconciliation

### [x] 1.1 Plan and implement sub-step 2001 (username schema, GoTrue mechanism, doc reconciliation)

**Created:** 2026-06-15T12:08:20Z
**Completed:** 2026-06-15T16:03:20Z

**Why:** Everything downstream depends on a correct spec and on the `username`
column existing. This sub-step reconciles the docs (R12) so later sub-plans
reference corrected specs, settles how username+password rides GoTrue (the
spike), and lands `profiles.username` with case-fold uniqueness and the
`set_username` RPC (R1, R2, R5).

**Prerequisites:** `2000_username_identity` branch exists and is checked out.

**Decisions:**
- Sub-branch is cut from `2000_username_identity`, not from `main`.
- The sub-plan's **Phase 0** reconciles `docs/architecture.md` (Authentication
  section, magic-link flow steps, "Considered and rejected"),
  `docs/data-model.md` (`profiles.username`, `lower(username)` uniqueness,
  recovery-e-mail home, `set_username`), `docs/invites.md` + `docs/circles.md`
  (add-by-username), and `docs/open-questions.md` — before any code.
- Resolve the GoTrue mechanism spike. Leaning default per PLAN.md: synthetic
  deterministic e-mail derived from the username, real recovery e-mail stored
  separately; `set_username` rewrites the synthetic `auth.users.email`
  atomically.
- Schema: `username` `NOT NULL`, `a-zA-Z0-9` CHECK, unique on `lower(username)`
  (index or `citext`); `set_username` RPC rejecting taken/invalid names
  distinguishably. pgTAP covers uniqueness, case-folding (`LaraCroft` vs
  `Laracroft`), the char constraint, and mutability — positive **and** negative.

**Reference:** `.claude/commands/write-plan.md` (sub-plan creation);
`docs/testing.md` (pgTAP is load-bearing; RLS/constraints get positive and
negative cases).

**Steps:**
1. `git checkout -b 2001_username_identity_db 2000_username_identity`
2. Invoke `/write-plan` to create `plans/2001_username_identity_db/` with its
   REQUIREMENTS.md, PLAN.md (including the Phase-0 doc reconciliation and the
   mechanism-spike decision), and TASKS.md.
3. Implement the sub-plan task by task (via `/work` or manually), RED before
   GREEN.
4. Run `./scripts/check.sh` (schema + tests) — must be green.
5. `git checkout 2000_username_identity && git merge --no-ff 2001_username_identity_db`

**Verify:** `./scripts/check.sh` green on `2000_username_identity` after merge.

## Phase 2 — 2002: registration + sign-in UI

### [ ] 2.1 Plan and implement sub-step 2002 (username + password registration and sign-in)

**Created:** 2026-06-15T12:08:20Z
**Completed:**

**Why:** Turns the new identity into a usable sign-in: register and sign-in
screens by username + password, replacing the magic-link request/check/callback
path as the primary surface (R3, R7, R8).

**Prerequisites:** Task 1.1 merged — `username`, the GoTrue mechanism, and
`set_username` exist on `2000_username_identity`.

**Decisions:**
- Sub-branch cut from the updated `2000_username_identity` (post-2001 merge).
- `web/src/lib/shared/state/session.svelte.ts`: `AuthUser` carries `username`;
  drop the e-mail-as-identity assumption. `web/src/lib/auth/model/auth-client.ts`
  gains password register + sign-in using the 2001 mechanism.
- New register + sign-in screens replace `LoginRequest.svelte` /
  `LoginCheck.svelte` as the primary path; the magic-link callback stays
  reachable only as far as 2005's migration needs it.
- Whether registration stays invite-gated (and how an invited user bootstraps a
  username+password account) is settled here against `docs/invites.md`.
- Tests: Vitest for the auth-client + screens (assert user-visible behaviour),
  Playwright for the register → sign-in happy path.

**Reference:** `docs/frontend-layout.md` (lib tier split, filename rules);
`docs/ui.md` (TopBar, button-pair order, form-primitive conventions).

**Steps:**
1. `git checkout -b 2002_username_auth_ui 2000_username_identity`
2. Invoke `/write-plan` to create `plans/2002_username_auth_ui/` with its three
   files.
3. Implement the sub-plan task by task, RED before GREEN.
4. Run `./scripts/check.sh --e2e` (user-visible flow) — must be green.
5. `git checkout 2000_username_identity && git merge --no-ff 2002_username_auth_ui`

**Verify:** `./scripts/check.sh --e2e` green on `2000_username_identity` after merge.

## Phase 3 — 2003: password recovery

### [ ] 3.1 Plan and implement sub-step 2003 (password recovery via optional e-mail)

**Created:** 2026-06-15T12:08:20Z
**Completed:**

**Why:** E-mail's only remaining job is recovering a lost password (R4, R9).
This sub-step adds the recovery-e-mail capture, the "forgot password" request,
and the reset flow.

**Prerequisites:** Task 1.1 merged (recovery-e-mail home + mechanism) and Task
2.1 merged (a sign-in screen to return to after reset).

**Decisions:**
- Sub-branch cut from the updated `2000_username_identity`.
- Recovery-e-mail capture in Settings (leaning `user_settings.recovery_email`,
  confirmed in 2001); never shown elsewhere, never an add-key (R4).
- Setting or changing the recovery e-mail requires proving ownership (R13):
  send a confirmation (link or code) to the new address; it becomes the active
  recovery target only after confirmation succeeds. An unverified/pending
  address never backs a reset. Addresses already confirmed by the old
  magic-link flow are grandfathered as proven (handled in 2005).
- Request step must not reveal whether a username/e-mail maps to an account
  beyond what is already public (R9): identical response for found/not-found,
  matching the existing anti-enumeration discipline from
  `plans/0302_signin_anti_enumeration`.
- Reset sets a new GoTrue password via the 2001 mechanism, then the user signs
  in normally (R3).
- Tests: Vitest for the screens + request/reset client; Playwright for the
  request → reset → sign-in path **and** the set/change → verify recovery-e-mail
  path (Mailpit catches both mails in dev).

**Reference:** `docs/architecture.md` (cookie-plant paths; the shim is unchanged
for the post-reset sign-in); `docs/logging.md` (no e-mail in logs).

**Steps:**
1. `git checkout -b 2003_password_recovery 2000_username_identity`
2. Invoke `/write-plan` to create `plans/2003_password_recovery/`.
3. Implement task by task, RED before GREEN.
4. Run `./scripts/check.sh --e2e` — must be green.
5. `git checkout 2000_username_identity && git merge --no-ff 2003_password_recovery`

**Verify:** `./scripts/check.sh --e2e` green on `2000_username_identity` after merge.

## Phase 4 — 2004: add-by-username + disambiguation

### [ ] 4.1 Plan and implement sub-step 2004 (add people by username; show @username)

**Created:** 2026-06-15T12:08:20Z
**Completed:**

**Why:** Replaces the confusing add-by-e-mail surface with add-by-username and
makes usernames visible so non-unique display names are always resolvable
(R6, R10).

**Prerequisites:** Task 1.1 merged (`username` column exists).

**Decisions:**
- Sub-branch cut from the updated `2000_username_identity`.
- DB: `send_invitation` and the circle-add RPC accept a username and resolve it
  to a user id; `add_circle_by_email` and the e-mail branch of `send_invitation`
  are replaced. The block / invite-policy / self-invite checks in
  `docs/invites.md` survive unchanged. Because usernames are public, a "no such
  username" response may be truthful (unlike e-mail). pgTAP positive + negative
  for each new RPC.
- UI: `InvitePickerSheet` and `CircleScreen` drop e-mail fields, gain a username
  field; `@username` renders on the profile sheet (prominent), members screen,
  vote attribution, and item created/modified attribution. Exact per-screen
  placement decided against the design canvas in this sub-plan.
- Tests: pgTAP for the RPCs; Vitest for the screens; Playwright for an
  add-by-username invite happy path.

**Reference:** `docs/invites.md` (the checks to preserve); `docs/circles.md`
(one-directional, invisible-to-the-other-side); the design canvas / relevant
`design/*.jsx` for `@username` placement.

**Steps:**
1. `git checkout -b 2004_add_by_username 2000_username_identity`
2. Invoke `/write-plan` to create `plans/2004_add_by_username/`.
3. Implement task by task, RED before GREEN.
4. Run `./scripts/check.sh --e2e` — must be green.
5. `git checkout 2000_username_identity && git merge --no-ff 2004_add_by_username`

**Verify:** `./scripts/check.sh --e2e` green on `2000_username_identity` after merge.

## Phase 5 — 2005: migrate the alpha + retire e-mail login, then close the step

### [ ] 5.1 Plan and implement sub-step 2005 (backfill usernames, initial-password path, remove e-mail sign-in)

**Created:** 2026-06-15T12:08:20Z
**Completed:**

**Why:** The live alpha has e-mail/magic-link accounts with no username or
password; they must move to the new model without data loss before the e-mail
sign-in surface is removed (R8, R11). This is the only prod-facing sub-step.

**Prerequisites:** Tasks 2.1, 3.1, and 4.1 merged — the username sign-in,
recovery, and add-by-username surfaces all exist on `2000_username_identity`.

**Decisions:**
- Sub-branch cut from the updated `2000_username_identity`.
- Migration derives each existing account's username from its `display_name`,
  folded to `a-zA-Z0-9` and collision-suffixed to satisfy R1/R2; idempotent and
  reversible-by-inspection. pgTAP on the backfill (every live profile ends with
  a valid, unique username; no collisions; tombstone user skipped).
- Initial-password path for existing users via the recovery flow (2003) — every
  existing account has an e-mail on file, already confirmed by the historical
  magic-link flow, so it is grandfathered as a proven recovery address (R13) and
  is not re-verified. Document the operator steps and the user-facing message in
  `docs/deployment.md` if a one-time announcement or a transition window for the
  old magic-link path is needed.
- Remove the e-mail sign-in surface (magic-link request/check/callback) and
  reconcile any remaining references to `plans/0302`/`plans/1700`. Confirm the
  prod GoTrue config (password grant reachable for real accounts; signup posture
  per `docs/invites.md`).
- Flag prod-affecting changes per CLAUDE.md "We are going live": auth shim,
  GoTrue config, and the public sign-in surface all change here.

**Reference:** `docs/deployment.md` (prod vs dev compose, auth-proxy, the
pre-deploy auth checklist); `docs/admin.md` (operator password reset for
no-recovery-e-mail accounts, if added).

**Steps:**
1. `git checkout -b 2005_alpha_migration 2000_username_identity`
2. Invoke `/write-plan` to create `plans/2005_alpha_migration/`.
3. Implement task by task, RED before GREEN; rehearse the backfill against a
   seeded copy of prod-shaped data.
4. Run `./scripts/check.sh --e2e` — must be green.
5. `git checkout 2000_username_identity && git merge --no-ff 2005_alpha_migration`

**Verify:** `./scripts/check.sh --e2e` green on `2000_username_identity` after merge.

### [ ] 5.2 Tick the step-20 box and merge the orchestration branch to main

**Created:** 2026-06-15T12:08:20Z
**Completed:**

**Why:** With all five sub-branches merged, step 20 is done; record it and land
the orchestration branch.

**Prerequisites:** Tasks 1.1–5.1 all merged into `2000_username_identity`.

**Decisions:**
- Tick the step-20 checkbox (and its five sub-bullets) in
  `plans/0000_implementation_order.md`.
- Merge `2000_username_identity` into `main` with `--no-ff` so the branch
  grouping is visible on the commit tree.

**Files:**
- `plans/0000_implementation_order.md` (modify)

**Steps:**
1. Edit `plans/0000_implementation_order.md`: flip step 20 and its 2001–2005
   sub-bullets from `[ ]` to `[x]`.
2. Commit on `2000_username_identity` (`chore(plan): tick step 20 …`).
3. `git checkout main && git merge --no-ff 2000_username_identity`
4. Run `./scripts/check.sh --e2e` on `main` — must be green.

**Verify:** `./scripts/check.sh --e2e` green on `main`; step 20 reads `[x]`.
