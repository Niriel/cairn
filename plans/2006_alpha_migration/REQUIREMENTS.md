# Requirements: Alpha migration + retire e-mail login

Move the live alpha's existing e-mail/magic-link accounts onto the
username + password + stable-identity model with no data loss, then remove the
e-mail sign-in surface. This is sub-step 2006 of the username-identity
orchestration (step 20) and the only prod-facing migration sub-step: the live
alpha (`cairn.lynnscape.eu`, two accounts) still holds accounts with a real
e-mail in `auth.users.email`, an unmemorable provisional username (`u<hex>` from
the 0019 backfill), and no password. It refines parent requirements R8 (retire
e-mail sign-in), R11 (migrate the alpha), R13 (grandfather already-proven
recovery e-mails), and R16 (stable GoTrue identity).

## R1. Existing accounts get a display-name-derived username

The migration replaces each existing account's provisional username (matching
`^u[0-9a-f]{29}$`) with one derived from its `profiles.display_name`: fold the
display name to `[A-Za-z0-9]` (drop every other character), and if the fold
yields fewer than three characters use the literal base `user`. The result is
made unique under the case-insensitive rule by appending a numeric suffix
(`Alex`, `Alex2`, `Alex3`, …), checked against `lower(username)` across all
profiles, truncating the base so `base || suffix` stays within 30 characters.
Every derived username satisfies `^[A-Za-z0-9]{3,30}$` and is unique on
`lower(username)`. A migrated user may still change it later via `set_username`.

## R2. The pre-migration e-mail is grandfathered as a proven recovery address

Before the account's identity e-mail is rewritten, the real address currently in
`auth.users.email` is copied into `user_settings.recovery_email`. Because the
recovery model has no separate "verified" flag — `recovery_email IS NOT NULL`
*is* the proven-address contract (see `db/migrations/0021_password_recovery.sql`
and `docs/data-model.md`) — this direct write grandfathers the historical
address as proven without a confirmation token or code (R13: addresses already
confirmed by the magic-link flow are treated as proven at migration; the
verify-on-set gate applies only to changes made under the new model). The write
runs as the migration owner, which is the only writer permitted past the
`authenticated`-role column lockdown on `recovery_email`.

## R3. Existing accounts move onto the stable `<uid>@cairn.internal` identity

After the recovery e-mail is captured, the migration rewrites
`auth.users.email` to `<uid>@cairn.internal` (the same stable, uid-derived
identity that new accounts adopt via `adopt_stable_identity`), so sign-in
resolves the typed username to the uid and authenticates the password grant
against this fixed address. The existing `adopt_stable_identity()` RPC cannot be
reused for this: its guard `WHERE ... AND (email IS NULL OR email LIKE
'%@cairn.internal')` deliberately refuses to overwrite a real address, so it is
a no-op on a live-alpha account. The migration therefore performs the rewrite
itself, and the ordering is load-bearing — the recovery e-mail (R2) must be
captured *before* the identity e-mail is overwritten, or the real address is
lost.

## R4. The backfill is idempotent, skips the tombstone, and loses no data

The backfill acts only on accounts where `id <> '00000000-0000-0000-0000-000000000000'`
(the tombstone), `email IS NOT NULL`, and `email NOT LIKE '%@cairn.internal'`.
After the first run every migrated account is on `@cairn.internal`, so the
predicate excludes it and a re-run is a no-op — the migration is safe to apply
more than once. The tombstone (`email = NULL`, `display_name = 'Deleted user'`)
is never touched. No list, item, vote, membership, circle, or invitation is
altered — all of those hang off the immutable `auth.users.id`, which the
migration never changes.

## R5. Initial passwords come only from self-serve recovery; no operator reset

The migration sets no password. Each existing account, once it has a resolvable
username (R1) and a grandfathered recovery e-mail (R2), sets its first password
through the existing self-serve recovery flow: forgot-password → code mailed to
the recovery address → `reset_password` (which does an unconditional
`SET encrypted_password = crypt(...)` and so works for a never-had-a-password
account) → sign in. No `admin.reset_password` or other operator-reset primitive
is added in this step. Cairn's deliberate stance — recorded in
`docs/open-questions.md` — is that an account with no recovery e-mail that
forgets its password is unrecoverable, a conscious privacy-versus-convenience
choice by the user (consistent with parent R4/R9).

## R6. The e-mail/magic-link web sign-in surface is removed

The magic-link request screen, the "check your inbox" / OTP code-entry screen,
and the magic-link callback are removed as sign-in surfaces: the
`web/src/routes/auth/{login,check,callback}/` routes, the `LoginRequest`,
`LoginCheck`, and `LoginCheckStub` components, the `pending-login` state carrier,
and the `sendMagicLink` / `verifyOtp` / `exchangeRefreshToken` functions in
`auth-client.ts` (with their mocks and tests) are deleted. No retained code
navigates to `/auth/login` or `/auth/check`; session-expiry and route-guard
redirects target `/auth/signin`. The username sign-in, registration, and
recovery screens shipped by 2003/2004 are the sole auth surface and are
untouched.

## R7. The dev-login shortcut is removed entirely

The developer sign-in shortcut is deleted rather than re-homed: `DevShortcuts.svelte`,
`web/src/lib/auth/model/dev-shortcut.ts` (`isDevLoginShortcutEnabled`), their
tests, the `VITE_DEV_LOGIN_SHORTCUT` / `VITE_DEV_LOGIN_PASSWORD` declarations in
`web/src/vite-env.d.ts`, and the two lines in `web/.env.example` all go. This is
safe: the e2e suite authenticates through the real `/auth/register` and
`/auth/signin` flows (`web/e2e/helpers/auth.ts`), and no config or CI path
depends on the shortcut. Local development signs in through the same real
register/sign-in screens as everyone else.

## R8. The BFF and shared auth-paths drop the magic-link surface, keep the rest

The `auth-proxy` BFF and the two mirrored `auth-paths.ts` lists retire the
magic-link-only surface: `/auth/login`, `/auth/check`, `/auth/callback` leave
`PUBLIC_AUTH_PATHS`; `/auth/login`, `/auth/check` leave `SIGNED_IN_REDIRECT_PATHS`;
and the magic-link pass-throughs — `/auth/verify`, the `/auth/token`
refresh-grant cookie-plant, `/auth/magiclink`, the `/auth/user` bearer-attach,
and the `csrf.ts` magic-link CSRF exemption — are removed once each is confirmed
to serve only magic-link. The two `auth-paths.ts` copies
(`web/src/lib/shared/model/` and `auth-proxy/src/lib/`) change in lockstep so
`auth-paths-drift.test.ts` stays green. The retained Cairn-shaped surface
(`/auth/signin`, `/auth/register`, `/auth/signout`, `/auth/refresh`, and the
recovery endpoints) is preserved; in particular the BFF's own `/auth/refresh`
calls GoTrue's `/token` server-side and does not depend on the `/auth/token`
pass-through.

## R9. Prod and dev GoTrue config and the prod Caddy auth routing are reconciled

The magic-link-only GoTrue configuration is removed from the compose files:
`GOTRUE_MAILER_URLPATHS_*`, `GOTRUE_MAILER_TEMPLATES_MAGIC_LINK`, and the whole
`GOTRUE_URI_ALLOW_LIST` line (its sole prod entry is the retired `/auth/callback`)
from `docker-compose.prod.yml`; `GOTRUE_MAILER_OTP_LENGTH` from the prod-safe base
`docker-compose.yml` (where it actually lives — not the prod overlay); and
`GOTRUE_MAILER_TEMPLATES_MAGIC_LINK` plus the dev magic-link template mount from
`docker-compose.override.yml`, along with the `web/static/gotrue/templates/magic_link.html`
template itself — the *only* GoTrue template Cairn ships. The prod
`caddy/Caddyfile.prod` `@gotrue` matcher is pruned to drop the retired
`/auth/magiclink* /auth/verify* /auth/token* /auth/user*` (keeping `/auth/signout*`
and `/auth/refresh*`). The configuration that the username password grant depends
on is kept: `GOTRUE_EXTERNAL_EMAIL_ENABLED=true`, `GOTRUE_MAILER_AUTOCONFIRM=true`, the
`GOTRUE_DISABLE_SIGNUP` knob (operator-controlled — `"${DISABLE_SIGNUP:-true}"`
in prod, default closed; `"false"` in the dev override — invites gate
list/circle membership, not account creation, and self-serve password reset
does not depend on it), and the recovery-flow SMTP relay and
`AUTH_BFF_DB_JWT` scoped-role credential. No GoTrue e-mail template remains after
`magic_link.html` is deleted; the recovery/reset code mail is sent by the BFF
itself (`auth-proxy/src/lib/mail.ts`), not a GoTrue template, so it is unaffected.

## R10. The specification docs are reconciled before/with the code

The docs that still describe e-mail/magic-link sign-in as a live surface are
corrected as Phase 0, so downstream references are not left stale (the R12/R19
pattern from earlier sub-steps): `docs/architecture.md` (remove the magic-link
"Request flow" walkthrough and the legacy-flow-pending-removal notes; update the
"Considered and rejected" entries), `docs/development.md` (drop the magic-link
dev flow and dev-login-shortcut mentions), `docs/deployment.md` (update the
pre-deploy auth checklist and document the 2006 migration operator runbook and
the single forced-re-auth transition), `docs/admin.md` (restate the banned-user
sign-in contract for username + password), and the residual magic-link phrasing
in `docs/README.md`, `docs/testing.md`, `docs/logging.md`,
`docs/gotrue-templates.md`, `docs/email-html.md`, `docs/account-deletion.md`,
`docs/ui.md` (retire the magic-link `/auth/callback` history-replace convention),
and `docs/quality.md` (the not-yet-created-route workaround's `/auth/check`
example). `docs/deployment.md` also gains a post-deploy migrated-account sign-in
smoke check. `docs/open-questions.md` records the operator-reset-deferred stance (R5).

## Non-requirements (explicitly excluded)

- **An operator / admin password-reset RPC.** Deferred (R5). No current account
  needs it (both have a grandfathered recovery e-mail), and an account-takeover
  primitive is built deliberately later if ever, not bolted onto this migration.
- **Re-verifying grandfathered recovery e-mails.** Addresses confirmed by the
  historical magic-link flow are proven at migration time (R13); the
  verify-on-set gate applies only to changes made under the new model.
- **An in-app migration banner or maintenance page.** The alpha is two accounts;
  the operator communicates each derived username and the "set your password"
  step directly. The single forced re-auth reuses the 2002 revocable-session
  transition mechanism (`docs/deployment.md`).
- **Keeping magic-link as a secondary sign-in.** Retired outright, not
  supplemented — settled at the step-20 level (parent R8).
- **Bespoke live-migration tooling.** The backfill is a plain numbered SQL
  migration applied by `scripts/migrate.sh`; no separate runner, dry-run
  harness, or data-export step is added.
- **Username history or reserved-name protection for the derived handles.** A
  derived username is an ordinary username the user can change; no squatting or
  reserved-list machinery (excluded at the step-20 level).
