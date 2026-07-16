# Plan: Alpha migration + retire e-mail login

Sub-step 2006 of the username-identity orchestration (step 20): migrate the live
alpha's existing accounts onto username + password + stable identity, then remove
the e-mail sign-in surface. It runs last because it depends on the sign-in,
recovery, and stable-identity machinery the earlier sub-steps built, and it is
the only prod-facing migration sub-step.

## Context

The live alpha at `cairn.lynnscape.eu` is two accounts created under the old
e-mail/magic-link model. Each currently has: a real address in
`auth.users.email` (the magic-link delivery target), a provisional username
`u<first-29-hex-of-uid>` written by the 0019 backfill (valid but unmemorable),
`user_settings.recovery_email = NULL`, and no `encrypted_password`. Everything
that matters — lists, items, votes, memberships, circles, invitations,
attribution — hangs off the immutable `auth.users.id`, not off e-mail, so the
migration can rewrite the identity e-mail and the username freely without
touching user data.

The whole `2000_username_identity` branch merges to `main` in one deploy (parent
Task 6.2), so 2002's revocable-session cookie rename and this migration land
together. At that deploy every old magic-link access-JWT cookie is invalidated
(the 2002 forced-re-auth transition), so each existing user must sign in afresh —
and since the migration gives them a username but no password, their first
sign-in goes through forgot-password to set an initial password. The operator
knows both users personally and tells each their derived username; no in-app
banner is warranted for two accounts (`docs/deployment.md`).

Several earlier sub-steps left magic-link mechanics standing "pending removal in a
later step" — the architecture-doc "Request flow" walkthrough, the dev magic-link
flow, the `/auth/{login,check,callback}` screens, the BFF's `/auth/verify` and
`/auth/token` refresh-grant pass-throughs, and the prod GoTrue mailer knobs. This
is that later step (parent R8).

## Decisions

**A bespoke ordered backfill, not `adopt_stable_identity()`.** The obvious reuse
— call the existing `adopt_stable_identity()` per account — does not work. Its
guard (`db/migrations/0020_username_auth.sql:111-114`) is `WHERE ... AND (email
IS NULL OR email LIKE '%@cairn.internal')`, written precisely so a legacy real
address can't be clobbered; on a live-alpha account (real address) it is a no-op.
The migration therefore does the identity rewrite itself, wrapped in a strict
order per account: (1) copy the real `auth.users.email` into
`user_settings.recovery_email`; (2) derive and set the username; (3) rewrite
`auth.users.email` to `<uid>@cairn.internal`. Capturing the recovery address
before overwriting the identity e-mail (R2 before R3) is load-bearing — reverse
the order and the real address is gone.

**Grandfathering is a plain write, because "proven" has no flag.** 2004
deliberately modelled a proven recovery address structurally: a pending address
lives only in an `auth_private.recovery_tokens` row until confirmed, and
`confirm_recovery_email` is the only thing that writes `user_settings.recovery_email`
— so `recovery_email IS NOT NULL` *means* "proven" (`docs/data-model.md:116`).
That makes grandfathering trivial: the migration, running as owner, writes the
historical address straight into `recovery_email`. No token, no code, no
re-verification (R13). The `authenticated`-role column lockdown from 0021 doesn't
apply to the owner.

**Username derivation: fold, fallback, numeric-suffix.** `display_name` is
arbitrary free text (1–100 chars, no DB char constraint), so folding to
`[A-Za-z0-9]` can yield fewer than three valid characters (an all-emoji or
all-CJK name). A pure `IMMUTABLE` helper `public.username_from_display_name(text)`
folds and applies the `user` fallback and the 30-char cap; the backfill loop
resolves collisions with a numeric suffix checked against `lower(username)`.
Deriving from the display name (rather than leaving the `u<hex>` provisional)
gives each user a recognisable handle they'll actually recognise when the
operator tells them to reset their password; they can rename later.

**Idempotent by construction.** Eligibility is `id <> tombstone AND email IS NOT
NULL AND email NOT LIKE '%@cairn.internal'`. After the first pass every migrated
account is on `@cairn.internal` and drops out of the set, so re-applying the
migration is a no-op. This also means it's a no-op on dev/test databases at apply
time (they hold only the tombstone, `email = NULL`, when migrations run — seed
data lands afterwards), which is why the backfill is exposed as a callable,
tested function rather than only inline DML (see next).

**A tested function, not opaque inline DML.** A data migration that runs against
an empty database can't be observed by pgTAP afterward. So the backfill lives in
an idempotent, owner-only `public.backfill_legacy_identity()` (SECURITY DEFINER,
`REVOKE EXECUTE ... FROM public`, granted to no role — reached only as owner) that
the migration invokes once and the pgTAP test invokes after seeding prod-shaped
rows. The pure `username_from_display_name` helper is unit-tested on its own. Both
functions are harmless to leave in the schema (idempotent, owner-only); a future
cleanup migration may drop `backfill_legacy_identity` once prod has run, but this
step keeps it.

**Delete the dev-login shortcut, don't re-home it.** `DevShortcuts.svelte` is
currently hosted only by `LoginRequest.svelte`, which this step deletes. Rather
than move it under `SignIn.svelte`, it is removed entirely (parent decision this
session). Verified safe: the Playwright suite signs in through the real
`/auth/register` + `/auth/signin` helpers (`web/e2e/helpers/auth.ts`), nothing in
config or CI reads `VITE_DEV_LOGIN_*`, and local development uses the same real
screens.

**Defer the operator password reset.** Both live accounts get a grandfathered
recovery e-mail, so self-serve recovery covers everyone. No `admin.reset_password`
is added; the stance "no recovery e-mail ⇒ no recovery, by the user's conscious
choice" is recorded in `docs/open-questions.md` (consistent with parent R4/R9).

## Architecture

The migration is DB-layer; the surface removal spans web, the BFF, the shared
model, and the compose overlays. Test layers: pgTAP (`db/tests/`) for the
backfill; Vitest (`web/src/**/*.test.ts`, `auth-proxy/test/`) for the surface
removal; the Playwright suite (`web/e2e/`) is the integration check that sign-in
still works with the magic-link screens gone. The magic-link Playwright tests
themselves (`web/e2e/auth.spec.ts`) retire with the surface (Task 2.1) so the
`--e2e` gauntlet doesn't drive the deleted `/auth/login`.

### New files

- **`db/migrations/0023_alpha_migration.sql`** — the `username_from_display_name`
  helper, the idempotent `backfill_legacy_identity()` function, and the single
  invocation. Next free migration number (highest today is `0022`).
- **`db/tests/alpha_migration.sql`** — pgTAP for the fold helper (unit cases) and
  the backfill (grandfather, stable identity, derivation, collision-suffix,
  tombstone-skip, idempotency, control account untouched).

### Modified files

- **`web/src/lib/shared/model/auth-paths.ts`** and
  **`auth-proxy/src/lib/auth-paths.ts`** — remove the magic-link path entries, in
  lockstep (drift test): the `PUBLIC_AUTH_PATHS`/`SIGNED_IN_REDIRECT_PATHS` entries
  in Task 3.1, and the whole `COOKIE_PLANT_PATHS`/`BEARER_AUTH_PATHS` consts in
  Task 3.2 — which, in the same commit, also trims `auth-paths-drift.test.ts`'s
  name anchor and deletes the matching `auth-paths.test.ts` blocks, since both
  consts are defined here (not in `index.ts`) and imported by `index.ts` and the
  dev Vite proxy.
- **`web/src/lib/auth/model/auth-client.ts`** — remove `sendMagicLink`,
  `verifyOtp`, `exchangeRefreshToken` (+ `__mocks__`).
- **`web/e2e/auth.spec.ts`**, **`web/e2e/helpers/mailpit.ts`** — prune the three
  magic-link tests + the `signInViaMagicLink` helper and `waitForMagicLink`
  (Task 2.1); keep the retained `revocable session` / `username + password`
  describes and the recovery-mail helpers.
- **`auth-proxy/src/index.ts`**, **`web/vite.config.ts`** — retire the magic-link
  pass-throughs and dev proxy branches; update `auth-proxy/src/lib/csrf.ts`.
- **`web/src/vite-env.d.ts`**, **`web/.env.example`** — drop the
  `VITE_DEV_LOGIN_*` declarations/lines.
- **`docker-compose.prod.yml`**, **`docker-compose.override.yml`**,
  **`docker-compose.yml`** (base — the `GOTRUE_MAILER_OTP_LENGTH` line), and
  **`caddy/Caddyfile.prod`** (prune the `@gotrue` magic-link matcher) — remove the
  magic-link GoTrue knobs, template mount, and prod auth routing; keep the
  password-grant knobs. `magic_link.html` is the only GoTrue template shipped, and
  none remains after it is deleted (recovery mail is BFF-sent). The dev
  `static` nginx service (and `gotrue`'s `depends_on: static`) existed only to
  serve that template, so it is removed with it.
- **Docs** (Phase 0): `docs/architecture.md`, `docs/development.md`,
  `docs/deployment.md` (incl. the post-deploy migrated-account sign-in smoke
  check), `docs/admin.md`, `docs/README.md`, `docs/testing.md`,
  `docs/logging.md`, `docs/gotrue-templates.md`, `docs/email-html.md`,
  `docs/account-deletion.md`, `docs/ui.md`, `docs/quality.md`,
  `docs/open-questions.md`.

### Deleted files

- `web/src/routes/auth/login/`, `web/src/routes/auth/check/` (incl.
  `LoginCheckStub.svelte`), `web/src/routes/auth/callback/`.
- `web/src/lib/auth/components/LoginRequest.svelte`, `LoginCheck.svelte` (+ tests).
- `web/src/lib/auth/state/pending-login.svelte.ts` (+ mock + test).
- `web/src/lib/auth/components/DevShortcuts.svelte` (+ test),
  `web/src/lib/auth/model/dev-shortcut.ts` (+ test).
- `web/static/gotrue/templates/magic_link.html`.

### Per-account backfill (ordered)

```
for each account where id <> tombstone
                   and email is not null
                   and email not like '%@cairn.internal'   (ORDER BY id — deterministic)
  1. user_settings.recovery_email := auth.users.email        -- grandfather (R2)
  2. profiles.username := derive(display_name), suffixed unique   -- (R1)
  3. auth.users.email := id || '@cairn.internal'             -- stable identity (R3)
```

## Phase structure

TDD ordering: the DB phase writes its pgTAP (RED) before the migration (GREEN);
the removal phases update the affected unit tests alongside the deletions and
lean on the type-checker/linter plus a grep-for-dangling-references as the signal.

0. **Phase 0 — reconcile docs (R10).** Correct every doc that still presents
   e-mail/magic-link sign-in as live, and record the operator-reset-deferred
   stance. Lands first so downstream references aren't stale.
1. **Phase 1 — backfill migration + tests (R1–R5).** The fold helper, the
   idempotent backfill function, its single invocation, and the pgTAP that seeds
   prod-shaped rows and asserts the full transform. RED before GREEN.
2. **Phase 2 — remove the web magic-link surface + dev-login (R6, R7).** Delete
   the routes, components, state, and auth-client functions; delete the dev-login
   shortcut; retarget any redirects to `/auth/signin`; update/remove the affected
   Vitest.
3. **Phase 3 — prune shared auth-paths + retire the BFF magic-link surface (R8).**
   Task 3.1 drops the `PUBLIC`/`SIGNED_IN` magic-link entries from both
   `auth-paths.ts` copies; Task 3.2 drops the `COOKIE_PLANT_PATHS`/
   `BEARER_AUTH_PATHS` consts — a one-commit lockstep edit across both copies, the
   drift-test anchor, `auth-paths.test.ts`, and every consumer (`index.ts` + the
   dev Vite proxy). GoTrue's server-side `/token` use stays; only the
   client-facing pass-throughs retire (the `grant_type=password` lockdown is kept
   as defence-in-depth).
4. **Phase 4 — reconcile GoTrue config, prod auth routing + retire the template
   (R9).** Remove the magic-link mailer knobs from the compose files (incl.
   `GOTRUE_MAILER_OTP_LENGTH` from the base `docker-compose.yml`), prune the prod
   `caddy/Caddyfile.prod` `@gotrue` matcher, and delete the magic-link template
   (the only GoTrue template shipped), and remove the now-purposeless dev
   `static` nginx service; keep the password-grant knobs and the
   operator-controlled `DISABLE_SIGNUP` knob. Final `--e2e` gauntlet.

## Reference docs and skills

- **`docs/data-model.md`** — `profiles.username`, `user_settings.recovery_email`,
  the "proven == not null" recovery contract, the RPC catalogue.
- **`docs/deployment.md`** — prod vs dev compose, the `auth-proxy` service, the
  pre-deploy auth checklist, and the 2002 forced-re-auth transition to reuse.
- **`docs/architecture.md`** — the Authentication / JWT-storage sections and the
  magic-link "Request flow" walkthrough being retired.
- **`docs/testing.md`** — the three test layers; pgTAP positive + negative rule.
- **`db/migrations/0019_username_identity.sql`** (provisional-username backfill,
  CHECK, index), **`0020_username_auth.sql`** (`adopt_stable_identity`,
  `set_username`, `normalize_username`), **`0021_password_recovery.sql`**
  (`reset_password`, the `recovery_email` lockdown) — the code this builds on.
- **`db/tests/adopt_stable_identity.sql`** — the closest pgTAP precedent (it
  already exercises real-email-survives vs `@cairn.internal`); model on it.

## Open questions

- **Fate of `/auth/user` bearer-attach.** It backs the magic-link cookie-plant
  user-enrichment. Confirm the retained session-restore / `/auth/refresh` path
  doesn't rely on it before removing (Phase 3); if it does, keep it. Default:
  remove once confirmed magic-link-only.
- **Whether to `DROP backfill_legacy_identity()` after prod runs.** Default: keep
  it (idempotent, owner-only, harmless); drop in a later cleanup migration if the
  schema surface is ever tidied.
