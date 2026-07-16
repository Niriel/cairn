# Tasks

This is an **orchestration plan**: each phase below creates a sub-branch off
`2000_username_identity`, runs `/write-plan` to author its three files,
implements it, and merges it back with `--no-ff`. No implementation code is
written directly on this branch — see `plans/0400_mvp_product/TASKS.md` for the
worked example this mirrors.

> **Revised after 2001 merged.** Phases 2–6 were reshaped around the
> session-security + auth-BFF design (see `PLAN.md` "Design revision" and
> `REQUIREMENTS.md` R14–R19). Phase 1 (2001) is frozen historical record — its
> synthetic-e-mail mechanism is revised _forward_ by Phase 3 (2003), not
> reverted.

## Reference skills and docs

- **`.claude/commands/write-plan.md`** — how to create a sub-plan directory
  (branch, number, slug, three files); the orchestration numbering convention.
- **`plans/2000_username_identity/REQUIREMENTS.md`** — the step-20 contract
  (R1–R19); each sub-plan refines a subset, noted per requirement.
- **`plans/2000_username_identity/PLAN.md`** — decomposition rationale and the
  cross-cutting decisions (replace-not-coexist, case-fold uniqueness, the
  session-security + auth-BFF revision, migrate-from-display-name).
- **`docs/architecture.md`**, **`docs/data-model.md`**, **`docs/invites.md`** —
  the specs reconciled by 2001's Phase 0 (identity claims) and by 2002/2003's
  Phase 0 (session model + identity mechanism, R19); the contracts every later
  sub-plan must preserve.
- **`docs/deployment.md`** — prod vs dev compose and the `auth-proxy` service;
  the BFF (2002), the credential swap (2003), and the migration (2006) are
  prod-facing.
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

**Notes:**

- Merged. The synthetic-e-mail mechanism this sub-step chose (and the
  "keep the proxy a dumb shim" stance it leaned on) is **superseded** by the
  session-security + auth-BFF revision — see `PLAN.md` "Design revision" and
  R16. The revision is forward, not a revert: the `username` column, case-fold
  uniqueness, `recovery_email`, and `set_username`'s signature/guards all stay;
  only the synthetic-e-mail rewrite body and its invariant are removed (in 2003).

## Phase 2 — 2002: session-security foundation + auth BFF

### [x] 2.1 Plan and implement sub-step 2002 (revocable sessions, auth BFF, cookie hardening, rate-limiting)

**Created:** 2026-06-15T17:24:58Z
**Completed:** 2026-06-17T08:16:43Z

**Notes:** Implemented in `plans/2002_session_security/` (all 5 phases complete)
and merged here `--no-ff`. The session model landed as **detection-only** reuse
(GoTrue v2.158.1 rejects a replayed rotated token but does **not** family-revoke
on reuse — confirmed by the Phase-1 spike), so theft is logged/rejected rather
than auto-revoking the family; the manual kill-switch is
`/auth/signout?scope=global`. A thin custom session table for real
theft→family-revoke is deferred (recorded in `docs/architecture.md` "JWT storage"

- `TODO.md`). Verify: `./scripts/check.sh` green on the merged parent; auth e2e
  (`auth.spec.ts`) green on chromium+firefox. **WebKit is not run** on this box
  (missing system libs — accepted; see `docs/testing.md`), and the pre-existing
  `public-list.spec.ts` clipboard test is an environmental flake — neither is a
  2002 regression.

**Why:** Examining "what's in the cookie" for step 20 surfaced that
`cairn_session` is a long-lived (~7-day), non-revocable access JWT and the
refresh token is discarded (`auth-proxy/src/index.ts:145-157`) — the wrong
session foundation once the credential becomes a brute-forceable password. This
is the single largest security delta in the step, exists in prod today
independent of usernames, and must land **first** so the username surfaces build
on a secure BFF (R14, R15, R17, R18).

**Prerequisites:** Task 1.1 merged. No username UI depends on this, and this
depends on no later sub-step — it can ship on its own.

**Decisions:**

- Sub-branch cut from `2000_username_identity` (post-2001 merge):
  `git checkout -b 2002_session_security 2000_username_identity`.
- **Revocable, rotating session (R14):** the cookie carries a rotating
  refresh/session token, not a long-lived access JWT; access tokens become
  short-lived (single-digit minutes) and server-held, minted on demand; refresh
  uses rotation with reuse detection (replay of a rotated token revokes the
  token family). Decide where the server-side session state lives — GoTrue's own
  refresh rotation where it suffices, a thin session table only if "sign out
  everywhere" / compromise-kill needs more (PLAN.md Open questions).
- **Grow `auth-proxy` into a Cairn-shaped BFF (R15):** define the surface
  (`/auth/signout`, `/auth/refresh`, and the internals `/auth/register` +
  `/auth/signin` that 2003 fills in), with the browser never seeing tokens or
  grant types. Keep the **current** credential working through the BFF so this
  ships independently. The dev Vite proxy (`web/vite.config.ts`) and the shared
  `web/src/lib/shared/model/auth-paths.ts` lists move in lockstep (mind the
  deep-equal drift test).
- **Cookie hardening + CSRF (R17):** `__Host-cairn_session` prefix (forces
  Secure + Path=/ + no Domain); `SameSite=Lax`; an explicit CSRF header /
  double-submit check on state-changing requests, not `SameSite` alone.
- **Sign-in rate-limiting (R18):** per-account and per-IP throttling/backoff;
  constant-shape sign-in failures.
- **Prod-facing — flag per CLAUDE.md "We are going live":** this changes the
  live `auth-proxy`, the cookie, and possibly GoTrue config. Decide how existing
  long-lived magic-link cookies are handled (force one re-auth vs age-out;
  PLAN.md Open questions).
- **Phase 0 (R19):** correct `docs/architecture.md` "JWT storage" /
  "Authentication" — stop describing `cairn_session` as the ~7-day access JWT
  with the refresh token discarded; describe the revocable rotating session,
  short-lived server-held access token, BFF surface, and `__Host-` + CSRF
  posture.
- **Tests:** `auth-proxy/` unit tests for the refresh/rotation/CSRF/rate-limit
  logic (extend the `auth-paths`-style suite); Playwright against the real stack
  for sign-in → refresh → revoke / "sign out everywhere".

**Reference:** `docs/architecture.md` ("JWT storage", "Authentication", the
cookie-shim contract); `docs/deployment.md` (the `auth-proxy` service, prod vs
dev compose, the pre-deploy auth checklist); `auth-proxy/src/index.ts` and
`web/vite.config.ts` (the shim to grow); `docs/logging.md` (no tokens/e-mail in
logs).

**Steps:**

1. `git checkout -b 2002_session_security 2000_username_identity`
2. Invoke `/write-plan` to create `plans/2002_session_security/` with its three
   files (including the Phase-0 R19 doc reconciliation).
3. Implement the sub-plan task by task, RED before GREEN.
4. Run `./scripts/check.sh --e2e` (prod-facing auth flow) — must be green.
5. `git checkout 2000_username_identity && git merge --no-ff 2002_session_security`

**Verify:** `./scripts/check.sh --e2e` green on `2000_username_identity` after merge.

## Phase 3 — 2003: username + password sign-in

### [x] 3.1 Plan and implement sub-step 2003 (stable identity + resolver, `set_username` revise-forward, register/sign-in)

**Created:** 2026-06-15T17:24:58Z
**Completed:** 2026-06-17T17:45:34Z

**Notes:** Sub-plan `plans/2003_username_auth/` planned and implemented task by
task (RED before GREEN), then merged `--no-ff` into `2000_username_identity`.

- **Gauntlet green on the merged branch** (`./scripts/check.sh`, exit 0). **E2E was
  not run** — this machine (the laptop) has no Playwright browsers installed, per the
  standing machine-conditional rule; the password-credential e2e was authored and
  is covered by the sub-plan's own Playwright touch, to be run on the work box.
- **One pre-existing test bug fixed during the merge gauntlet:** `auth-proxy`'s
  `password-grant-lockdown.test.ts` only stubbed GoTrue, but the `/auth/token`
  forward became a username-enrichment (PostgREST) path when session-restore
  responses started carrying the username — so the `refresh_token` forward hung on
  the prod PostgREST host and timed out. Added a PostgREST stub (mirroring
  `enrich.test.ts`); the code was correct, the test just lacked the stub. It slipped
  through because the pre-push hook skips `auth-proxy` vitest unless auth-proxy
  files are in the push.

**Why:** Turns the new identity into a usable sign-in on top of 2002's secure
BFF: register and sign-in by username + password, and the DB/identity
revise-forward that drops 2001's synthetic-e-mail fragility (R3, R5, R7, R16).

**Prerequisites:** Tasks 1.1 and 2.1 merged — `username`/`set_username` exist,
and the BFF + revocable session model exist on `2000_username_identity`.

**Decisions:**

- Sub-branch cut from the updated `2000_username_identity`:
  `git checkout -b 2003_username_auth 2000_username_identity`.
- **Stable GoTrue identity + resolver (R16):** give each account a stable,
  immutable, uid-derived GoTrue identity (leaning `<uid>@cairn.internal`, set
  once at creation); the BFF resolves a typed username → user id via the
  `lower(username)` unique index on sign-in. Confirm GoTrue accepts the stable
  identity through the password grant against the real stack (the end-to-end
  check 2001 deferred).
- **`set_username` revise-forward (R5, R16):** a new migration simplifies
  `set_username` to update **only** `profiles.username` — drop the
  `auth.users.email` rewrite, the synthetic-e-mail invariant, and the
  SQL↔client domain drift guard. Revise pgTAP: `set_username` no longer touches
  `auth.users`; the rename can't break the credential. (New requirement + new
  task here, not an edit to 2001's frozen tasks.)
- **BFF endpoints + screens (R3, R7):** `/auth/register` + `/auth/signin` filled
  in on the BFF; `web/src/lib/auth/model/auth-client.ts` calls them in Cairn's
  shapes (no GoTrue protocol, no synthetic e-mail computed client-side); new
  register + sign-in screens replace `LoginRequest.svelte` / `LoginCheck.svelte`
  as the primary path; `web/src/lib/shared/state/session.svelte.ts` `AuthUser`
  carries `username` and drops the e-mail-as-identity assumption (note
  `assertAuthUser` currently _requires_ `email`).
- Whether registration stays invite-gated, and how an invited user bootstraps a
  username+password account, is settled here against `docs/invites.md`.
- **Phase 0 (R19):** correct `docs/data-model.md`'s `set_username` /
  synthetic-domain notes to the profiles-only change and the stable identity;
  finish the `architecture.md` identity-mechanism correction (stable identity +
  BFF resolver supersedes the synthetic e-mail) if 2002 left it to here.
- **UI layout step (per CLAUDE.md):** before writing the screen tasks, read the
  register/sign-in JSX in `design/cairn-screens.jsx` and record the layout spec
  (structure, proportions, copy) and the token/global rule for colour+type.
- **Tests:** pgTAP for the simplified `set_username`; Vitest for the auth-client
  - screens (user-visible behaviour); Playwright for register → sign-in and a
    username-change-then-sign-in path against the real stack.

**Reference:** `docs/data-model.md` (`set_username`, the synthetic-domain note
to replace); `docs/frontend-layout.md` (lib tier split, filename rules);
`docs/ui.md` (TopBar, button-pair order, form-primitive conventions);
`design/cairn-screens.jsx` (register/sign-in layout).

**Steps:**

1. `git checkout -b 2003_username_auth 2000_username_identity`
2. Invoke `/write-plan` to create `plans/2003_username_auth/` with its three
   files (Phase-0 R19 doc edits; the `set_username` revise-forward as its own
   requirement + task).
3. Implement the sub-plan task by task, RED before GREEN.
4. Run `./scripts/check.sh --e2e` (user-visible flow + prod-facing identity) — must be green.
5. `git checkout 2000_username_identity && git merge --no-ff 2003_username_auth`

**Verify:** `./scripts/check.sh --e2e` green on `2000_username_identity` after merge.

## Phase 4 — 2004: password recovery

### [x] 4.1 Plan and implement sub-step 2004 (recovery-e-mail capture + verify, forgot-password reset)

**Created:** 2026-06-15T17:24:58Z
**Completed:** 2026-07-09T09:24:00Z

**Notes:** Sub-plan `plans/2004_password_recovery/` planned and implemented task
by task (RED before GREEN), then merged `--no-ff` into `2000_username_identity`.

- Landed the column-level lockdown on `user_settings.recovery_email` (writes only
  via the scoped `cairn_auth_bff` role), the `recovery_tokens` record + verify-flow
  RPCs, the signed-out `request_password_reset` / `reset_password` RPCs, and
  `clear_recovery_email` — all with positive + negative pgTAP
  (`recovery_email_grant`, `recovery_verify`, `recovery_reset`, `grants`).
- BFF grew an SMTP mailer + code helpers + scoped-role client, authenticated
  set/confirm/remove recovery-e-mail endpoints, and signed-out forgot/reset
  endpoints; wired into prod + dev infra (`docker-compose*.yml`, `vite.config.ts`,
  `auth-paths`, `mint-bff-jwt.sh`) with auth-proxy vitest coverage.
- Web: auth-client recovery functions, Settings recovery-e-mail capture + confirm
  UI (`RecoveryEmailRow` / `RecoveryEmailVerify`), and signed-out
  forgot/reset-password screens + routes, with Vitest.
- **Verify:** `./scripts/check.sh` green on the merged parent (exit 0). Recovery
  Playwright canary (`password-recovery.spec.ts`, 6 tests) green on
  **chromium + firefox**; **WebKit not run** on this box (missing system libs —
  standing machine-conditional rule, see `docs/testing.md`).

**Why:** E-mail's only remaining job is recovering a lost password (R4, R9).
This sub-step adds the recovery-e-mail capture, the verify-before-effect gate
(R13), the "forgot password" request, and the reset flow — through the BFF.

**Prerequisites:** Tasks 1.1 merged (recovery-e-mail home), 2.1 merged (BFF),
and 3.1 merged (a sign-in screen to return to after reset).

**Decisions:**

- Sub-branch cut from the updated `2000_username_identity`:
  `git checkout -b 2004_password_recovery 2000_username_identity`.
- Recovery-e-mail capture in Settings (`user_settings.recovery_email`, shipped
  by 2001); never shown elsewhere, never an add-key (R4).
- Setting or changing the recovery e-mail requires proving ownership (R13): send
  a confirmation (link or code) to the new address; it becomes the active
  recovery target only after confirmation succeeds. An unverified/pending
  address never backs a reset. Addresses already confirmed by the old magic-link
  flow are grandfathered as proven (handled in 2006).
- Request step must not reveal whether a username/e-mail maps to an account
  beyond what is already public (R9): identical response for found/not-found,
  matching the anti-enumeration discipline from
  `plans/0302_signin_anti_enumeration`.
- Reset sets a new password through the BFF (R15), then the user signs in
  normally (R3). Recovery resolves by username + e-mail ownership, not e-mail
  alone (recovery e-mail is **not** unique — a user may run two accounts on one
  e-mail; recorded in 2001's TASKS Notes).
- **Tests:** Vitest for the screens + request/reset client; Playwright for the
  request → reset → sign-in path **and** the set/change → verify recovery-e-mail
  path (Mailpit catches both mails in dev).

**Reference:** `docs/architecture.md` (the BFF surface; SMTP / recovery mail);
`docs/logging.md` (no e-mail in logs); `design/cairn-screens.jsx` (recovery /
settings layout — record the layout spec before writing screen tasks).

**Steps:**

1. `git checkout -b 2004_password_recovery 2000_username_identity`
2. Invoke `/write-plan` to create `plans/2004_password_recovery/`.
3. Implement task by task, RED before GREEN.
4. Run `./scripts/check.sh --e2e` — must be green.
5. `git checkout 2000_username_identity && git merge --no-ff 2004_password_recovery`

**Verify:** `./scripts/check.sh --e2e` green on `2000_username_identity` after merge.

## Phase 5 — 2005: add-by-username + disambiguation

### [x] 5.1 Plan and implement sub-step 2005 (add people by username; show @username)

**Created:** 2026-06-15T17:24:58Z
**Completed:** 2026-07-13T13:48:09Z

**Notes:** Sub-plan `plans/2005_add_by_username/` planned and implemented task by
task (Phase 0 doc reconciliation → DB migration `0022` → RPC wrappers + username
fields → `@username` rendering → Playwright), then merged `--no-ff` into
`2000_username_identity` (merge commit `7b62ca5`).

- DB: `send_invitation` and `add_circle_by_username` resolve a public username to
  a user id (the e-mail RPCs / `invitations.target_email` retired); a "no such
  username" miss is truthful while block/policy outcomes stay behind the generic
  string. A shared `normalize_username` peels a leading `@` across all five
  resolvers. `@username` renders on the profile sheet (prominent), members, vote
  - item attribution, and circle + invite-picker rows via a new
    `.identity-handle` role.
- **Absorbed a follow-up e2e-suite repair (`plans/2010_e2e_username_auth/`, merged
  into 2005 first, commit `c669971`).** Running the full suite surfaced that seven
  specs still used the retired magic-link login (broken since 2003's
  `/auth/signin` redirect) plus a latent `block.spec.ts` list-capture bug and a
  `password-recovery` stable-address throttle; all fixed. Not part of the 2005
  contract, but it's what actually got `check.sh --e2e` to green.
- **Verify:** the non-e2e gauntlet is green on the merged parent (`./scripts/check.sh`
  passes; it also ran as the earlier stages of `check.sh --e2e`). The e2e suite is
  **108/108 on chromium + firefox**. **WebKit is not run** on this box — `check.sh
--e2e` invokes all three projects and WebKit fails at `browserType.launch`
  ("Host system is missing dependencies to run browsers"), the standing
  machine-conditional rule (`docs/testing.md`; same note as 2002/2003/2004). The
  23 webkit failures are launch failures, not regressions.

**Why:** Replaces the confusing add-by-e-mail surface with add-by-username and
makes usernames visible so non-unique display names are always resolvable
(R6, R10). Independent of the session work — builds only on 2001's column.

**Prerequisites:** Task 1.1 merged (`username` column exists). Orthogonal to
2002–2004; may proceed in parallel with 2004 once 2003 is in.

**Decisions:**

- Sub-branch cut from the updated `2000_username_identity`:
  `git checkout -b 2005_add_by_username 2000_username_identity`.
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
`design/*.jsx` for `@username` placement (record the layout spec before writing
screen tasks).

**Steps:**

1. `git checkout -b 2005_add_by_username 2000_username_identity`
2. Invoke `/write-plan` to create `plans/2005_add_by_username/`.
3. Implement task by task, RED before GREEN.
4. Run `./scripts/check.sh --e2e` — must be green.
5. `git checkout 2000_username_identity && git merge --no-ff 2005_add_by_username`

**Verify:** `./scripts/check.sh --e2e` green on `2000_username_identity` after merge.

## Phase 6 — 2006: migrate the alpha + retire e-mail login, then close the step

### [x] 6.1 Plan and implement sub-step 2006 (backfill usernames, stable-identity + initial-password, remove e-mail sign-in)

**Created:** 2026-06-15T17:24:58Z
**Completed:** 2026-07-16T11:04:01Z

**Why:** The live alpha has e-mail/magic-link accounts with no username, no
password, and on the old non-revocable session model; they must move to the new
model without data loss before the e-mail sign-in surface is removed (R8, R11).
The only prod-facing migration sub-step.

**Prerequisites:** Tasks 2.1, 3.1, and 4.1 merged — the BFF + revocable
sessions, username sign-in + stable identity, and recovery all exist on
`2000_username_identity`. (2005 need not block this, but landing it first avoids
a second prod migration window.)

**Decisions:**

- Sub-branch cut from the updated `2000_username_identity`:
  `git checkout -b 2006_alpha_migration 2000_username_identity`.
- Migration derives each existing account's username from its `display_name`,
  folded to `a-zA-Z0-9` and collision-suffixed to satisfy R1/R2; idempotent and
  reversible-by-inspection. pgTAP on the backfill (every live profile ends with
  a valid, unique username; no collisions; tombstone user skipped).
- Move each existing account onto the **stable GoTrue identity** (R16) — set the
  uid-derived identity that 2003 defined — and give an initial-password path via
  the recovery flow (2004). Every existing account has an e-mail on file already
  confirmed by the historical magic-link flow, so it is grandfathered as a proven
  recovery address (R13) and is not re-verified.
- Existing long-lived magic-link cookies are the exact non-revocable artefact
  being retired: force a single re-auth onto the revocable model (R14) rather
  than letting them age out (confirm in PLAN.md Open questions). Document the
  operator steps / user-facing message in `docs/deployment.md` if a one-time
  announcement or transition window is needed.
- Remove the e-mail sign-in surface (magic-link request/check/callback) and
  reconcile remaining references to `plans/0302`/`plans/1700` and the
  architecture-doc retirement _mechanics_ left intact by 2001. Confirm prod
  GoTrue config (password grant reachable; signup posture per `docs/invites.md`).
- Flag prod-affecting changes per CLAUDE.md "We are going live": the migration,
  GoTrue config, and the public sign-in surface all change here.

**Reference:** `docs/deployment.md` (prod vs dev compose, `auth-proxy`, the
pre-deploy auth checklist); `docs/admin.md` (operator password reset for
no-recovery-e-mail accounts, if added).

**Steps:**

1. `git checkout -b 2006_alpha_migration 2000_username_identity`
2. Invoke `/write-plan` to create `plans/2006_alpha_migration/`.
3. Implement task by task, RED before GREEN; rehearse the backfill against a
   seeded copy of prod-shaped data.
4. Run `./scripts/check.sh --e2e` — must be green.
5. `git checkout 2000_username_identity && git merge --no-ff 2006_alpha_migration`

**Verify:** `./scripts/check.sh --e2e` green on `2000_username_identity` after merge.

**Notes:**

- Implemented as the 7-task `plans/2006_alpha_migration/` sub-plan (merged here
  `--no-ff`); see its per-task Notes for detail. Its Verify was green on the
  sub-branch: full non-e2e gauntlet passed and `pnpm test:e2e --project=chromium
  --project=firefox` was 102/102 (**WebKit not run — can't launch on this box**,
  the standing `docs/testing.md` rule). The merge into `2000` is strictly
  fast-forward-equivalent (2006 was cut from 2000 with no divergence), so the
  merged tree is byte-identical to that verified sub-branch tree; the gauntlet is
  re-run once on `main` in 6.2 rather than twice over an identical tree.
- **Two carry-forward findings** surfaced during 2006, out of that sub-plan's
  magic-link scope (flagged for a follow-up, not blockers):
  1. `scripts/cairn-admin` resolves targets by `auth.users.email`, which migration
     `0023` rewrites to `<uid>@cairn.internal` (the real address moves to
     `user_settings.recovery_email`) — so email→uid resolution won't find a migrated
     account. The CLI should resolve by **username**. Worth fixing before the alpha
     migration is operated.
  2. `docs/admin.md` "Existing sessions for a banned user" still says
     `GOTRUE_JWT_EXP` is one hour and that Caddy refreshes the cookie — both
     superseded by the 2002 revocable-session model (single-digit-minute access
     JWT; the BFF refreshes).

### [x] 6.2 Tick the step-20 box and merge the orchestration branch to main

**Created:** 2026-06-15T17:24:58Z
**Completed:** 2026-07-16T11:05:45Z

**Why:** With all sub-branches (2001–2006) merged, step 20 is done; record it and
land the orchestration branch.

**Prerequisites:** Tasks 1.1–6.1 all merged into `2000_username_identity`.

**Decisions:**

- Tick the step-20 checkbox (and its sub-bullets) in
  `plans/0000_implementation_order.md`. If that file lists the old 2001–2005
  decomposition, reconcile it to the 2001–2006 shape while ticking.
- Merge `2000_username_identity` into `main` with `--no-ff` so the branch
  grouping is visible on the commit tree.

**Files:**

- `plans/0000_implementation_order.md` (modify)

**Steps:**

1. Edit `plans/0000_implementation_order.md`: flip step 20 and its 2001–2006
   sub-bullets from `[ ]` to `[x]`.
2. Commit on `2000_username_identity` (`chore(plan): tick step 20 …`).
3. `git checkout main && git merge --no-ff 2000_username_identity`
4. Run `./scripts/check.sh --e2e` on `main` — must be green.

**Verify:** `./scripts/check.sh --e2e` green on `main`; step 20 reads `[x]`.
