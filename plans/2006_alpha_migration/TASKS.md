# Tasks

## Reference skills and docs

- **`docs/data-model.md`** — `profiles.username`, `user_settings.recovery_email`,
  the "proven == `recovery_email IS NOT NULL`" recovery contract, RPC catalogue.
- **`docs/deployment.md`** — prod vs dev compose, the `auth-proxy` service, the
  pre-deploy auth checklist, and the 2002 forced-re-auth transition to reuse.
- **`docs/architecture.md`** — the Authentication / JWT-storage sections and the
  magic-link "Request flow" walkthrough being retired.
- **`docs/testing.md`** — pgTAP is load-bearing; positive **and** negative cases.
- **`db/migrations/0019_username_identity.sql`**, **`0020_username_auth.sql`**,
  **`0021_password_recovery.sql`** — the provisional-username backfill,
  `adopt_stable_identity` / `set_username` / `normalize_username`, and the
  `reset_password` + `recovery_email` lockdown this builds on.
- **`db/tests/adopt_stable_identity.sql`** — closest pgTAP precedent (real-email
  survives vs `@cairn.internal`); model the new test on it.

## Phase 0 — reconcile docs

### [x] 0.1 Reconcile the auth/identity specification docs to the username-only surface

**Created:** 2026-07-16T07:35:41Z
**Completed:** 2026-07-16T09:25:13Z

**Why:** Several docs still present e-mail/magic-link sign-in as a live surface,
left "pending removal in a later step" by earlier sub-steps. This is that step;
the docs must land the retirement before/with the code so downstream references
aren't stale (the same Phase-0 discipline earlier sub-steps used).

**Prerequisites:** None. Doc-only; lands first.

**Decisions:**

- Magic-link sign-in is removed outright (not supplemented). Whether new
  registration is open is operator-controlled via `DISABLE_SIGNUP`
  (`GOTRUE_DISABLE_SIGNUP: "${DISABLE_SIGNUP:-true}"` in prod — default closed;
  dev override hard-codes `"false"`); invites gate list/circle membership, not
  account creation, and the migration's self-serve password reset does not
  depend on signup being open. The password grant depends on
  `GOTRUE_EXTERNAL_EMAIL_ENABLED` + `GOTRUE_MAILER_AUTOCONFIRM` staying on;
  recovery mail stays.
- The dev-login shortcut is being removed entirely (Task 2.2), so its doc
  mentions go too.
- Record the operator-reset stance: **no recovery e-mail ⇒ no recovery**, a
  conscious user choice — not an added `admin.reset_password`.

**Files:**

- `docs/architecture.md` (modify) — remove the magic-link "Request flow"
  walkthrough (≈`:248-272`) and the legacy-flow-pending-removal notes (≈`:139,:141`);
  update the "Considered and rejected" entries (≈`:336,:344`) to reflect the
  retired surface.
- `docs/development.md` (modify) — drop "The magic-link flow in development"
  (≈`:347-358`) and the dev-login-shortcut mention (≈`:281`); the 0302
  anti-enumeration note (≈`:257`) is restated against username sign-in.
- `docs/deployment.md` (modify) — update the pre-deploy auth checklist (remove
  the `VITE_DEV_LOGIN_PASSWORD` item; keep the password-grant-BFF-only and the
  recovery SMTP + `AUTH_BFF_DB_JWT` items). For signup, do **not** assert a flat
  `DISABLE_SIGNUP=false`: prod is `GOTRUE_DISABLE_SIGNUP: "${DISABLE_SIGNUP:-true}"`
  (`docker-compose.prod.yml:35`) — operator-controlled, default closed — so
  phrase it as "signup is operator-controlled via `DISABLE_SIGNUP`; the password
  grant does not depend on it". Add the 2006 migration operator runbook (apply
  `0023`, tell each user their derived username, they set a password via
  forgot-password) and note the single forced re-auth reuses the 2002 transition
  (≈`:334-342`). Add a **post-deploy smoke step**: after applying `0023`, confirm
  one migrated account completes forgot-password → `reset_password` → sign-in —
  the only end-to-end check of the in-place identity rewrite (pgTAP proves the
  transform; the e2e suite exercises only fresh accounts, so the migrated-account
  path is otherwise unverified). Also reconcile the dev-services description
  (≈`:109`): the `static` nginx service is removed in Task 4.1 (it existed only
  to serve the magic-link template to GoTrue), so drop it from the list of
  dev-only pieces.
- `docs/admin.md` (modify) — restate the banned-user sign-in contract for
  username + password (currently phrased around "request a magic link"); note no
  operator password-reset RPC is added.
- `docs/README.md` (modify) — GoTrue is no longer "email magic-link auth".
- `docs/testing.md` (modify) — the "Auth happy path" line (≈`:196`) is username +
  password, not magic-link.
- `docs/logging.md` (modify) — replace magic-link-send log examples.
- `docs/gotrue-templates.md` (modify/retire) — the magic-link template is the
  *only* GoTrue template Cairn ships, so with it retired this doc describes a
  fully-removed mechanism (the magic-link template + the `/auth/check` OTP
  code-entry screen). Rewrite it to record that GoTrue custom templates are no
  longer used, or retire the doc. There is no GoTrue recovery template to "keep".
- `docs/email-html.md` (modify) — scope it to the BFF-sent recovery/reset code
  mail (`auth-proxy/src/lib/mail.ts`), which genuinely stays; drop any
  magic-link-template framing.
- `docs/account-deletion.md` (modify) — the `auth.users.email` note (≈`:51`) that
  "the magic-link delivery reads it" is now historical (the column holds the
  stable `@cairn.internal` identity or a recovery target).
- `docs/ui.md` (modify) — retire the magic-link callback UI convention (≈`:151`,
  "the auth callback URL replaces history … `/auth/callback?token=…`"), now that
  the callback screen is deleted (Task 2.1).
- `docs/quality.md` (modify) — the "not-yet-created SvelteKit route" workaround
  (≈`:44-53`) uses the now-deleted `/auth/check` as its running example; re-anchor
  it to a surviving route or flag it explicitly as a historical illustration.
- `docs/open-questions.md` (modify) — record the operator-reset-deferred stance.

**Steps:**

1. Edit each doc above, removing/rewriting the magic-link-as-live passages and
   keeping the historical framing where a doc records "considered and rejected".
2. Grep to confirm no doc still describes e-mail/magic-link as a *current*
   sign-in path: `grep -rn "magic.link\|/auth/login\|/auth/check\|/auth/callback\|OTP" docs/`
   — every remaining hit is intentionally historical.
3. Confirm the operator-reset stance is recorded in `docs/open-questions.md`.

**Verify:** manual review + `grep -rn "magic.link\|/auth/login\|/auth/callback" docs/`
shows only intentional historical mentions.

**Notes:**

- **User directive mid-task — no change-history narrative.** The user asked that
  the docs read as if written correctly on the first try: no "we used to do X /
  now removed / reversed / earlier draft" prose. This overrode the task's
  "keep the historical framing" phrasing for _implementation archaeology_ (a
  present-tense "considered and rejected" _rationale_ is still fine). Applied
  throughout: deleted the "Direct-to-callback magic-link email template" rejected
  entry in `architecture.md` entirely; reframed the "Magic-link-only
  authentication" and synthetic-e-mail and subdomains rejected entries and the
  "trade we accept" list to present tense; reframed `deployment.md` checklist
  item 1. Saved as feedback memory `docs-no-change-history`.
- **`gotrue-templates.md` retired (deleted), not stubbed.** Cairn ships no GoTrue
  custom templates, so a "no longer used" stub would itself be change-history; a
  first-try doc set omits the file. Its only referrer (`email-html.md` Reference
  section) was repointed to `auth-proxy/src/lib/mail.ts` (the BFF recovery/reset
  mail) and `deployment.md` SMTP wiring.
- **Scope wider than the listed line-hints.** The task's per-doc `≈:NN` hints were
  representative, not exhaustive; the Verify grep requires _every_ magic-link /
  callback mention to be historical/rationale. So I also reconciled the
  `architecture.md` "JWT storage" section, removed the "Security trade-off: the
  callback page reads tokens from the URL hash" subsection (the callback is
  deleted; username+password never puts tokens in the URL), the client-storage
  hash note, and the shim-narrowing paragraph; and the `development.md` dev
  cookie-plant note.
- **Stale claims corrected against ground truth (where they intersected the
  magic-link text):** `GOTRUE_MAILER_AUTOCONFIRM` is `"true"` in prod
  (`docker-compose.prod.yml:45`), not `false` as `development.md`/`deployment.md`
  claimed; corrected both. `logging.md`'s operator lookup
  `select id from auth.users where email = ?` breaks post-`0023` (that column
  becomes `<uid>@cairn.internal`) — changed to resolve by username via
  `profiles`.
- **Pre-existing drift I did NOT rewrite (out of this task's magic-link scope —
  flagging for a possible follow-up / `/concerns`):**
  1. `admin.md` "Existing sessions for a banned user" (§ ~160–165) still says
     `GOTRUE_JWT_EXP` is **one hour** and that **Caddy** refreshes the cookie —
     both superseded by the 2002 revocable-session model (single-digit-minute
     access JWT; the BFF, not Caddy, refreshes). I only fixed the one adjacent
     "within an hour" mention I was already editing for magic-link.
  2. `deployment.md` "Forced re-auth on the revocable-session deploy" (§ ~330–338)
     is a 2002-transition runbook with some change-history phrasing ("the pre-2002
     `cairn_session` held an access JWT"). Left as a legitimate deploy-transition
     note.
  3. **`cairn-admin` CLI resolves targets by `auth.users.email`** (`admin.md`
     § "The `cairn-admin` CLI" and the workflow examples use
     `alice@example.com`). After `0023`, `auth.users.email` is
     `<uid>@cairn.internal` and the real address lives in
     `user_settings.recovery_email`, so email→uid resolution will not find a
     migrated account. This is a **code** change (`scripts/cairn-admin`), outside
     this doc-only task, but it's a real migration consequence — the CLI should
     resolve by **username** (or recovery_email). Worth a task before the alpha
     migration is operated.

## Phase 1 — backfill migration + tests

### [x] 1.1 Add the username-fold helper, the idempotent backfill, and its pgTAP

**Created:** 2026-07-16T07:35:41Z
**Completed:** 2026-07-16T09:37:50Z

**Why:** The two live-alpha accounts hold a real e-mail, an unmemorable
provisional username (`u<hex>`), and no password. They must move to the stable
identity with a display-name-derived username and a grandfathered recovery
e-mail, with no data loss and safe re-application.

**Prerequisites:** None (builds on the merged 0019–0021 migrations).

**Decisions:**

- `adopt_stable_identity()` **cannot** be reused: its guard `(email IS NULL OR
  email LIKE '%@cairn.internal')` refuses to touch a real address
  (`0020:111-114`). The backfill does the rewrite itself.
- **Ordered, per account** (skip tombstone `00000000-…`, `email IS NOT NULL`,
  `email NOT LIKE '%@cairn.internal'`, `ORDER BY id` for determinism):
  1. `UPDATE user_settings SET recovery_email = auth.users.email` — grandfather.
     "Proven" == `recovery_email IS NOT NULL`, no flag, so this direct write is
     the grandfathering (R13). Owner bypasses the `authenticated` column lockdown.
     UPDATE-only is safe: the signup trigger guarantees a `user_settings` row for
     every non-tombstone account. **Belt-and-braces against silent data loss:**
     verify the UPDATE actually touched a row (`GET DIAGNOSTICS … ROW_COUNT`, or
     `INSERT … ON CONFLICT (id) DO UPDATE`) and `RAISE` if it did not — the
     identity rewrite (step 3) must never run for an account whose recovery
     address wasn't captured (reversing the order, or a missing row, loses the
     only real address irrecoverably).
  2. Derive username: `base := public.username_from_display_name(display_name)`;
     if `lower(base)` is taken, append a numeric suffix
     (`substr(base,1,30-length(n::text)) || n`) for `n = 2,3,…` until free.
  3. `UPDATE auth.users SET email = id || '@cairn.internal'` — stable identity.
  - Order is load-bearing: grandfather **before** overwriting the identity e-mail.
- **`username_from_display_name(text)`** — pure `IMMUTABLE`: fold via
  `regexp_replace(coalesce(p,''),'[^A-Za-z0-9]','','g')`; if `length >= 3` return
  `substr(folded,1,30)`, else the literal `'user'`. Always
  `^[A-Za-z0-9]{3,30}$`-valid.
- **`backfill_legacy_identity()`** — `RETURNS integer` (count migrated),
  `SECURITY DEFINER`, `SET search_path = public, auth`. Both functions
  `REVOKE EXECUTE ... FROM public` and are granted to no role (owner-only; reached
  as owner by the migration and by pg_prove, which runs as the DB owner).
- Idempotent: after the first run migrated accounts are on `@cairn.internal` and
  fall out of the eligibility set. At apply time on dev/test the only row is the
  tombstone (`email = NULL`), so it's a no-op there — hence the tested function.
- Single `BEGIN;…COMMIT;` migration that ends with `SELECT public.backfill_legacy_identity();`.

**Reference:** `db/tests/adopt_stable_identity.sql` for the fixture + role idiom;
`db/tests/fixtures/users_alice_bob_carol.sql` (alice@test/bob@test/carol@test,
provisional usernames, `user_settings` rows — the ideal prod-shaped seed).

**Files:**

- `db/migrations/0023_alpha_migration.sql` (create)
- `db/tests/alpha_migration.sql` (create)

**Steps:**

1. RED — Create `db/tests/alpha_migration.sql` (`BEGIN; … plan(N); …
   finish(); ROLLBACK;`, absolute fixture include `\i /db/tests/fixtures/users_alice_bob_carol.sql`):
   - **Fold helper:** `'Lara Croft'→'LaraCroft'`, `'Lara-Croft!'→'LaraCroft'`,
     `'🎉🎉'→'user'`, `'ab'→'user'`, `repeat('a',40)→repeat('a',30)`,
     `'MixedCase'→'MixedCase'` (casing preserved).
   - **Backfill:** set `display_name` to `'Lara Croft'` (alice), `'Lara-Croft'`
     (bob — folds identically → collision), `'Solo'` (carol); insert a control
     account `dddddddd-…` already on `…@cairn.internal` with username
     `'ControlName'`. Assert `backfill_legacy_identity() = 3`; alice →
     `recovery_email='alice@test'`, `username='LaraCroft'`,
     `auth.users.email='aaaaaaaa-…@cairn.internal'`; bob →
     `username='LaraCroft2'`, `recovery_email='bob@test'`; carol →
     `username='Solo'`; control untouched (username + identity unchanged);
     tombstone untouched (`auth.users.email` still NULL); re-run returns `0` and
     alice's username is unchanged (idempotency).
   - **Grant denial (security boundary):** under `SET LOCAL ROLE anon` and again
     under `authenticated`, both `backfill_legacy_identity()` and
     `username_from_display_name('x')` raise `42501` — they are owner-only
     (`REVOKE EXECUTE … FROM public`, granted to no role). Model on
     `db/tests/adopt_stable_identity.sql:90-99`. An owner-only function that
     mass-rewrites `auth.users.email` / `recovery_email` needs the negative case,
     not just the positive transform (docs/testing.md).
   - **Data-loss guard (negative):** the grandfather step's `ROW_COUNT`/`RAISE`
     guard must be exercised, not just asserted in prose. *After* the happy-path
     and idempotency assertions (so alice/bob/carol are already on
     `@cairn.internal` and excluded), seed one fresh eligible account
     (`eeeeeeee-…`, a real `email`, provisional username — the signup trigger
     gives it a `user_settings` row), then `DELETE FROM public.user_settings
     WHERE id = 'eeeeeeee-…'` to simulate the missing row. Assert
     `backfill_legacy_identity()` raises (`throws_ok`, `P0001`; savepoint-safe,
     so the call rolls back whole) and that `eeeeeeee-…`'s `auth.users.email` is
     still the real address — the identity rewrite must abort rather than lose
     the only real address. Without this the guard the Decisions call
     "belt-and-braces against silent data loss" is untested defensive code.
2. RED — `./scripts/test-db.sh` reports the new file red (functions don't exist).
3. GREEN — Create `db/migrations/0023_alpha_migration.sql` with the two functions
   (grants/revokes per Decisions) and the single invocation; single
   `BEGIN;…COMMIT;`.
4. GREEN — `./scripts/test-db.sh` green.

**Verify:** `./scripts/test-db.sh`

**Notes:**

- **Collision check excludes the account being migrated** (`AND id <> r.id`),
  a small hardening beyond the Decisions' literal "if `lower(base)` is taken":
  the migrating account still holds its provisional `u<hex>` handle at the point
  of the check, so this changes no observed behaviour, but it makes the loop
  robust against the pathological case where a display name folds to the
  account's own current handle.
- `auth.users.email` is written as `r.id::text || '@cairn.internal'` — `uuid ||
  text` has no implicit cast, so the explicit `::text` is required.
- Verified green with `./scripts/test-db.sh` (51 files, 800 tests, PASS) and
  lint-clean with `sqlfluff lint` on both new files.

## Phase 2 — remove the web magic-link surface and dev-login

### [x] 2.1 Remove the e-mail/magic-link web sign-in surface

**Created:** 2026-07-16T07:35:41Z
**Completed:** 2026-07-16T10:10:01Z

**Why:** Username + password (2003) is the sole sign-in path; the magic-link
request/check/callback screens and their client functions are dead surface to
retire (R6/R8).

**Prerequisites:** Task 0.1 (docs reconciled). The username sign-in/register
screens already exist (2003).

**Decisions:**

- Delete routes `web/src/routes/auth/{login,check,callback}/`; components
  `LoginRequest.svelte`, `LoginCheck.svelte`, `check/LoginCheckStub.svelte`; state
  `web/src/lib/auth/state/pending-login.svelte.ts` (+ `__mocks__` + test); and
  `sendMagicLink` / `verifyOtp` / `exchangeRefreshToken` from
  `web/src/lib/auth/model/auth-client.ts` (+ their `__mocks__`) and the tests
  that exercise only those.
- Any retained redirect that pointed at `/auth/login` or `/auth/check` now
  targets `/auth/signin` (grep to find them; e.g. route guard / session-expiry).
  Note the `+layout.svelte` guard already targets `/auth/signin`
  (`goto(resolve('/auth/signin'))`), so this may find nothing to retarget.
- Leave `DevShortcuts.svelte` for Task 2.2 (it's orphaned once `LoginRequest` is
  gone, but self-consistent with its own test until then).
- **Prune the magic-link e2e layer here too.** `web/e2e/auth.spec.ts` holds
  three magic-link tests — `magic-link happy path and sign-out` (`:68`),
  `code-entry happy path…` (`:122`), `magic-link non-2xx still lands on
  /auth/check…` (`:153`) — plus the local `signInViaMagicLink` helper (`:36`)
  and the `waitForMagicLink` import (`:6`); all drive the now-deleted
  `/auth/login`, so they must go or Task 4.1's `--e2e` gauntlet fails. **Keep**
  the retained `revocable session` (`:174`) and `username + password
  credential` (`:285`) `describe` blocks — they use the username helpers and
  are untouched. `waitForMagicLink` (`web/e2e/helpers/mailpit.ts:29`) is used
  only by these magic-link tests, so drop it; keep `waitForRecoveryCode` /
  `expectNoRecoveryMail` (used by `password-recovery.spec.ts`).
- **Expected stale-comment hit:** `ForgotPassword.svelte:26` has a comment
  ("Mirrors `LoginRequest`'s `sendMagicLink(...).catch(…)`") naming code this
  task deletes. It's a comment (no build break), but the step-3 grep will
  surface it — reword it, don't leave it dangling.

**Files:**

- Delete: the routes/components/state/tests above.
- `web/src/lib/auth/model/auth-client.ts` (modify) + its `__mocks__` (modify).
- `web/src/lib/auth/model/auth-client.test.ts` (modify) — remove the
  `sendMagicLink` / `exchangeRefreshToken` / `verifyOtp` `describe` blocks
  (`:32`, `:68`, `:183`); the file is **modified, not deleted** — it also covers
  the retained `signIn` / `register` / recovery calls.
- Any file redirecting to `/auth/login` or `/auth/check` (modify → `/auth/signin`).
- `web/e2e/auth.spec.ts` (modify) — remove the three magic-link tests, the
  `signInViaMagicLink` helper, and the `waitForMagicLink` import; keep the
  `revocable session` and `username + password credential` describes.
- `web/e2e/helpers/mailpit.ts` (modify) — drop `waitForMagicLink`; keep
  `waitForRecoveryCode` / `expectNoRecoveryMail`.
- `web/src/lib/auth/components/ForgotPassword.svelte` (modify) — reword the
  `sendMagicLink` comment at `:26`.

**Steps:**

1. RED/prep — `grep -rn "auth/login\|auth/check\|auth/callback\|sendMagicLink\|verifyOtp\|exchangeRefreshToken\|pending-login" web/src web/e2e` to enumerate every reference; anything outside the deleted files gets retargeted or removed.
2. GREEN — Delete the routes, components, state, and the three auth-client
   functions (+ mocks + their dedicated tests); retarget surviving redirects to
   `/auth/signin`; prune the magic-link tests + helper from `web/e2e/auth.spec.ts`
   and `waitForMagicLink` from `web/e2e/helpers/mailpit.ts`; reword the
   `ForgotPassword.svelte:26` comment.
3. GREEN — Re-grep (`web/src` **and** `web/e2e`) to confirm no dangling
   reference remains in retained code.

**Verify:** `pnpm -C web lint` · `pnpm -C web check` · `pnpm -C web test`
(all green: eslint clean, prettier clean, svelte-check 0 errors, vitest 104 files / 778 tests.)

**Notes:**

- **Retargeted a retained e2e test off the deleted magic-link helper.** The task
  assumed the `revocable session` describe was "untouched," but its
  `silent refresh on access-token expiry` test signed in via `signInViaMagicLink`
  (the helper this task deletes). Rewrote that one line to `register(page,
  uniqueUsername('refresh'), …)` — any signed-in session exercises the refresh
  path, so the sign-in route is irrelevant to what it proves.
- **Stale-comment cleanups beyond the named `ForgotPassword.svelte:26`.** Deleting
  the routes/state/functions orphaned comments in retained files; reworded them to
  keep retained code clean: `+layout.svelte` (removed the `/auth/callback` case-3
  note; dropped the `LoginRequest` padding example), `DeleteAccountScreen.svelte`
  and `public-paths.ts` (`/auth/login` → `/auth/signin`), `pending-reset.svelte.ts`
  (dropped "Mirrors pending-login.svelte.ts"), the session mock (**repointed** the
  `$state`-proxy rationale from the deleted `pending-login` to the surviving
  `profile.svelte.ts`/`lists.svelte.ts`, which still register session-reading
  effects — the proxy shape is still needed), and the e2e `auth.spec.ts` /
  `mailpit.ts` / `helpers/auth.ts` headers.
- **Removed the dead `/auth/magiclink` MSW handler** (`handlers.ts`) — its only
  callers were the deleted magic-link tests. **Left `/auth/verify` + `/auth/token`
  default handlers** (and the `COOKIE_PLANT_PATHS` comment) for Task 3.2, which
  owns `handlers.ts` — but note both are now **dead** (their web callers
  `verifyOtp`/`exchangeRefreshToken` are gone here), so 3.2's "comment only"
  `handlers.ts` scope should expand to remove them.
- **Left `auth-paths.ts`, `auth-paths.test.ts`, `layout.test.ts` untouched** — Task
  3.1 owns pruning the `/auth/{login,check,callback}` entries and the guard test in
  lockstep. The step-3 grep still shows those hits by design; they are the only
  remaining ones.
- **Unrelated working-tree change flagged:** `web/vite.config.ts` carries a change I
  did **not** author (an em-dash → semicolon in the reset-mail copy string,
  `resetMailBody`). Left as-is and excluded from this task — commit it separately.

### [x] 2.2 Drop the dev-login shortcut entirely

**Created:** 2026-07-16T07:35:41Z
**Completed:** 2026-07-16T10:19:37Z

**Why:** The dev-login shortcut was hosted only by the now-deleted
`LoginRequest.svelte`; per the parent decision it is removed rather than re-homed
in `SignIn.svelte` (R7). Verified safe — the e2e suite signs in via the real
`/auth/register` + `/auth/signin` helpers (`web/e2e/helpers/auth.ts`); no config
or CI reads `VITE_DEV_LOGIN_*`.

**Prerequisites:** Task 2.1 (`LoginRequest.svelte` deleted).

**Decisions:**

- Delete `DevShortcuts.svelte` (+ `DevShortcuts.test.ts`), `dev-shortcut.ts`
  (+ `dev-shortcut.test.ts`); remove the `VITE_DEV_LOGIN_SHORTCUT` /
  `VITE_DEV_LOGIN_PASSWORD` declarations from `web/src/vite-env.d.ts` and the two
  lines from `web/.env.example`. Do not add a shortcut to `SignIn.svelte`.

**Files:**

- Delete: `web/src/lib/auth/components/DevShortcuts.svelte` (+ test),
  `web/src/lib/auth/model/dev-shortcut.ts` (+ test).
- `web/src/vite-env.d.ts` (modify), `web/.env.example` (modify).

**Steps:**

1. GREEN — Delete the two components/models and their tests.
2. GREEN — Remove the two `VITE_DEV_LOGIN_*` decls from `vite-env.d.ts` and the
   two lines from `web/.env.example`.
3. GREEN — `grep -rn "DevShortcut\|dev-shortcut\|VITE_DEV_LOGIN" web` returns
   nothing.

**Verify:** `pnpm -C web lint` · `pnpm -C web check` · `pnpm -C web test`
(all green: eslint clean, prettier clean, svelte-check 0 errors, vitest 102 files / 767 tests.)

**Notes:**

- **Two comment rewords beyond the named Files, required by the step-3 grep.**
  `web/src/lib/auth/model/__mocks__/auth-client.ts` named `DevShortcuts` in its
  header (a 2.1 edit) — trimmed to `(SignIn, Register)`. `web/Dockerfile`'s
  build-stage comment explained the prod build folding the dev-login shortcut to
  dead code with no `VITE_DEV_LOGIN_*` literal — reworded to keep only the
  still-valid "build in production mode; NODE_ENV after install" rationale. Both
  named the removed symbols, so the grep would not have come back clean otherwise.
- No shortcut was added to `SignIn.svelte`, per the decision.

## Phase 3 — prune shared auth-paths and retire BFF pass-throughs

### [ ] 3.1 Prune the magic-link entries from both `auth-paths.ts` copies

**Created:** 2026-07-16T07:35:41Z
**Completed:**

**Why:** The shared path lists still route `/auth/{login,check,callback}` as
public/redirect auth paths. With the screens gone (Task 2.1) those entries are
dead and must leave both mirrored copies in lockstep (R8).

**Prerequisites:** Task 2.1 (routes removed).

**Decisions:**

- Remove `/auth/login`, `/auth/check`, `/auth/callback` from `PUBLIC_AUTH_PATHS`
  and `/auth/login`, `/auth/check` from `SIGNED_IN_REDIRECT_PATHS` in **both**
  `web/src/lib/shared/model/auth-paths.ts` and `auth-proxy/src/lib/auth-paths.ts`
  — they must stay byte-identical or `auth-paths-drift.test.ts` fails.
- Update `web/src/lib/shared/model/auth-paths.test.ts` and any auth-proxy path
  test that asserts the old contents.

**Files:**

- `web/src/lib/shared/model/auth-paths.ts` (modify)
- `auth-proxy/src/lib/auth-paths.ts` (modify)
- `web/src/lib/shared/model/auth-paths.test.ts` (modify)
- `web/src/routes/layout.test.ts` (modify) — the route-guard test drives the
  guard against `/auth/login`, `/auth/check`, `/auth/callback` as public /
  signed-in-redirect paths (the `test.each` arrays at `:74`, `:115`, `:126` and
  the `setUrl('/auth/login')` case at `:158`). Pruning those from the two lists
  flips the guard's behaviour, so this file **must** be trimmed in the same task
  or `pnpm -C web test` (this task's own Verify) goes red. Drop the pruned paths
  from the `test.each` arrays and remove the now-dead `/auth/callback` case (i).
- `auth-proxy/test/auth-paths-drift.test.ts` (verify green; modify only if it
  pins the old set)

**Steps:**

1. RED — Update the path-list tests to expect the pruned arrays, and trim
   `web/src/routes/layout.test.ts` to the surviving auth paths (see Files).
2. GREEN — Edit both `auth-paths.ts` copies identically.
3. GREEN — `pnpm -C web test` and `pnpm -C auth-proxy test` green (drift test
   included).

**Verify:** `pnpm -C web test` · `pnpm -C auth-proxy test` · `pnpm -C web check`

### [ ] 3.2 Retire the BFF magic-link pass-throughs

**Created:** 2026-07-16T07:35:41Z
**Completed:**

**Why:** The BFF's generic pass-through still serves magic-link mechanics —
`/auth/verify`, the `/auth/token` refresh-grant cookie-plant, `/auth/magiclink`,
the `/auth/user` bearer-attach, and the `csrf.ts` magic-link exemption. With the
magic-link surface gone these are dead paths to remove (R8), keeping the
Cairn-shaped surface intact.

**Prerequisites:** Task 2.1 (web callback removed), Task 3.1 (path lists pruned).

**Decisions:**

- **`COOKIE_PLANT_PATHS` and `BEARER_AUTH_PATHS` are defined in the shared
  `auth-paths.ts` (both copies), not in `index.ts`.** Removing them is a lockstep
  edit across `web/src/lib/shared/model/auth-paths.ts:31,33` and its verbatim copy
  `auth-proxy/src/lib/auth-paths.ts:33,35` (or `auth-paths-drift.test.ts` fails),
  and it must land **in this one task** with every consumer — `index.ts` and
  `web/vite.config.ts` *import* the consts, so deleting the definitions in a
  separate commit breaks the build. Touch, in one commit: both `auth-paths.ts`
  copies (drop both consts + the auth-proxy copy's module-doc line that names
  them), `auth-paths-drift.test.ts:38-47` (trim the name anchor to the four
  survivors — `PUBLIC_AUTH_PATHS`, `SIGNED_IN_REDIRECT_PATHS`, `LOGOUT_PATHS`,
  `CSRF_HEADER`), `auth-paths.test.ts:56-94` (delete the `BEARER_AUTH_PATHS` and
  `COOKIE_PLANT_PATHS` `describe` blocks), `index.ts` (imports `:7-8` + the
  bearer-attach branch `:269-274` + the cookie-plant branch `:340-355`), and
  `web/vite.config.ts` (imports `:10-11` + the `:928` bearer branch + the `:965`
  plant branch).
- The magic-link paths have **no dedicated handler** — `/auth/verify`,
  `/auth/token`, `/auth/magiclink`, `/auth/user` are served by the generic GoTrue
  pass-through. The concrete artifacts to remove are (a) their membership in
  `COOKIE_PLANT_PATHS`/`BEARER_AUTH_PATHS` (above), and (b) the now-stale
  magic-link **comments** — the `csrf.ts` block (`csrf.ts:13-18`) **plus** the
  four references in `index.ts` that describe the pass-throughs as live: the
  handler-block header (`:39-60`), the `TOKEN_PATH` note (`:97-100`), the
  CSRF-exception note (`:110-112`), and the lockdown rationale (`:253-254`) —
  reframed as defence-in-depth / historical. `requireCsrf` and the lockdown code
  itself are unchanged. **Keep** the `grant_type=password` lockdown block (`index.ts:250-258`,
  mirrored `web/vite.config.ts:868-874`) as defence-in-depth: it guarantees the
  public GoTrue password grant stays unreachable (the only password-grant path is
  the rate-limited `/auth/signin`) regardless of Caddy routing, and costs nothing.
- **Do NOT touch GoTrue's server-side `/token` use.** `passwordGrant` and `refresh`
  (`auth-proxy/src/lib/session.ts`; dev `web/vite.config.ts:111,167,250`) call
  GoTrue's `/token` **server-side** — that is the retained sign-in/refresh, not a
  pass-through. Only the *client-facing* `/auth/token` surface retires (Caddy stops
  routing it in Task 4.1; the deleted `exchangeRefreshToken` was its only caller).
- **`/auth/user` bearer-attach:** confirmed magic-link-only — session restore goes
  through `/auth/refresh`, and `enrichUser` reads the username from PostgREST, not
  `/auth/user`. So remove it. (If a later reading finds it backs the retained
  restore path, keep `BEARER_AUTH_PATHS` — verify first.)
- Keep `/auth/signin|register|signout|refresh` and the recovery endpoints
  untouched. `cookies.ts` is unchanged (`plantSession`/`clearSession`/
  `readAccessCookie`/`readSessionCookie` are all retained).

**Files:**

- `web/src/lib/shared/model/auth-paths.ts` (modify — drop `COOKIE_PLANT_PATHS`,
  `BEARER_AUTH_PATHS`) and `auth-proxy/src/lib/auth-paths.ts` (modify — identical,
  lockstep)
- `auth-proxy/test/auth-paths-drift.test.ts` (modify — trim the name anchor) and
  `web/src/lib/shared/model/auth-paths.test.ts` (modify — delete the two
  `describe` blocks)
- `auth-proxy/src/index.ts` (modify — imports + bearer/plant branches),
  `auth-proxy/src/lib/csrf.ts` (modify — comment only)
- `web/vite.config.ts` (modify — imports + bearer/plant branches)
- `auth-proxy/test/shim.test.ts`, `auth-proxy/test/enrich.test.ts`,
  `auth-proxy/test/password-grant-lockdown.test.ts` (modify — the cookie-plant /
  bearer-attach and magic-link pass-through expectations; `csrf.test.ts` only if
  it pins the removed exemption text)
- `web/src/lib/test/handlers.ts` (modify — comment only) — `:14` names
  `COOKIE_PLANT_PATHS` in a comment; reword it once the const is gone. Not a
  build break, but an expected hit when grepping for dangling references.

**Steps:**

1. RED — Update the tests to expect the retired behaviour:
   `auth-paths-drift.test.ts` anchor trimmed to the four survivors;
   `auth-paths.test.ts` `BEARER_AUTH_PATHS`/`COOKIE_PLANT_PATHS` blocks removed;
   auth-proxy index tests expecting `/auth/verify` + `/auth/token` no longer plant
   cookies and `/auth/user` no longer bearer-attaches.
2. GREEN — Drop both consts from the two `auth-paths.ts` copies (lockstep) and
   remove every consumer in the same commit: `index.ts` (imports + bearer branch +
   plant branch), `web/vite.config.ts` (imports + both branches), and reframe the
   stale magic-link comments in both `csrf.ts` and `index.ts` (see Decisions).
   Keep the `grant_type=password` lockdown, the retained Cairn-shaped endpoints,
   and the recovery endpoints.
3. GREEN — `pnpm -C auth-proxy test` (drift + index), `pnpm -C web test`
   (auth-paths), and `pnpm -C web check` green.

**Verify:** `pnpm -C auth-proxy lint` · `pnpm -C auth-proxy test` · `pnpm -C web test` · `pnpm -C web check`

## Phase 4 — reconcile GoTrue config and retire the template

### [ ] 4.1 Reconcile the compose GoTrue config and retire the magic-link template

**Created:** 2026-07-16T07:35:41Z
**Completed:**

**Why:** With magic-link retired, the prod/dev GoTrue mailer knobs and the
magic-link e-mail template are dead config; the password-grant knobs and open
signup must stay (R9). This is prod-facing.

**Prerequisites:** Tasks 2.1–3.2 (the surface is gone). Task 0.1
(`docs/deployment.md` runbook updated).

**Decisions:**

- Remove from `docker-compose.prod.yml`: `GOTRUE_MAILER_URLPATHS_*`,
  `GOTRUE_MAILER_TEMPLATES_MAGIC_LINK`, and the whole `GOTRUE_URI_ALLOW_LIST` line
  — its sole prod entry is the retired `https://cairn.${DOMAIN}/auth/callback`, so
  drop the line entirely (don't leave it empty).
- Remove `GOTRUE_MAILER_OTP_LENGTH` from the **prod-safe base `docker-compose.yml`**
  — it lives at `docker-compose.yml:56`, NOT in the prod overlay. It is OTP/
  magic-link-era; the Cairn recovery code is generated by the BFF, not GoTrue.
- Remove from `docker-compose.override.yml`: `GOTRUE_MAILER_TEMPLATES_MAGIC_LINK`
  (`:27`). Its serving path is **not a volume mount** — it's a whole dev-only
  `static` nginx service (`:36-39`, `image: nginx:alpine`, mounts `./web/static`)
  plus `gotrue`'s `depends_on: static` (`:33`). That service exists **only** to
  serve the magic-link template to GoTrue (dev avatars go through Caddy on
  `localhost:8080`, not `static`), so with the template gone it is dead infra
  GoTrue would still wait on — **remove the `static` service and the
  `gotrue.depends_on.static` edge too** (`docs/deployment.md:109`'s dev-services
  list is reconciled in Task 0.1 to match). Leave the override's
  `GOTRUE_URI_ALLOW_LIST: http://localhost:5173` (a dev origin, not a callback)
  and `GOTRUE_MAILER_AUTOCONFIRM: "true"`.
- Prune the prod Caddy `@gotrue` matcher (`caddy/Caddyfile.prod:38`) to drop
  `/auth/magiclink* /auth/verify* /auth/token* /auth/user*`, keeping
  `/auth/signout* /auth/refresh*`; fix the now-stale comments (`:33-37`, `:90-91`)
  describing the magic-link fall-through and the `/gotrue/templates/*` route.
- **Keep:** `GOTRUE_EXTERNAL_EMAIL_ENABLED=true`, `GOTRUE_MAILER_AUTOCONFIRM=true`
  (both load-bearing for the password grant against `<uid>@cairn.internal`), the
  operator-controlled `GOTRUE_DISABLE_SIGNUP` knob (`"${DISABLE_SIGNUP:-true}"`
  in prod — don't hard-code it), and the recovery SMTP relay + `AUTH_BFF_DB_JWT`.
- Delete `web/static/gotrue/templates/magic_link.html` — the **only** GoTrue
  template Cairn ships. There is no GoTrue recovery template to keep: the
  recovery/reset code mail is sent by the BFF itself (`auth-proxy/src/lib/mail.ts`).
  Deleting `magic_link.html` empties `web/static/gotrue/templates/`, so the Caddy
  `/gotrue/templates/*` route becomes vestigial (harmless to leave; the pruned
  `@gotrue` matcher above is the load-bearing change).
- This is the last sub-task, so its Verify runs the full `--e2e` gauntlet — auth
  e2e must pass with the magic-link screens gone (chromium + firefox; **WebKit is
  not run on this box** — standing machine-conditional rule, `docs/testing.md`).

**Files:**

- `docker-compose.prod.yml` (modify), `docker-compose.override.yml` (modify),
  `docker-compose.yml` (modify — base; the `GOTRUE_MAILER_OTP_LENGTH` line)
- `caddy/Caddyfile.prod` (modify — prune the `@gotrue` matcher + stale comments)
- Delete: `web/static/gotrue/templates/magic_link.html`
- `docker-compose.override.yml` (modify) — also remove the now-purposeless
  `static` nginx service and `gotrue`'s `depends_on: static`

**Steps:**

1. GREEN — Remove the magic-link mailer knobs from `docker-compose.prod.yml`
   (`GOTRUE_MAILER_URLPATHS_*`, `GOTRUE_MAILER_TEMPLATES_MAGIC_LINK`, the whole
   `GOTRUE_URI_ALLOW_LIST` line) and `GOTRUE_MAILER_OTP_LENGTH` from the base
   `docker-compose.yml`; from `docker-compose.override.yml` remove
   `GOTRUE_MAILER_TEMPLATES_MAGIC_LINK`, the `static` nginx service, and
   `gotrue`'s `depends_on: static`; delete
   `web/static/gotrue/templates/magic_link.html`. Leave the password-grant knobs.
2. GREEN — Prune `caddy/Caddyfile.prod`'s `@gotrue` matcher to
   `/auth/signout* /auth/refresh*` and fix its stale magic-link/template comments.
3. GREEN — `grep -rn "magic_link\|MAILER_URLPATHS\|OTP_LENGTH\|MAGIC_LINK\|/auth/callback" docker-compose*.yml web/static/gotrue`
   and `grep -rn "magiclink\|/auth/verify\|/auth/user" caddy/Caddyfile.prod`
   return nothing (the templates dir is now empty).
4. GREEN — Run the full gauntlet including e2e.

**Verify:** `./scripts/check.sh --e2e`
