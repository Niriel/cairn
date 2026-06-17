# Plan: Password recovery

Sub-step 2004 of the username-identity step. Gives e-mail its one remaining job —
recovering a lost password (parent R9) with verify-before-effect (parent R13) — built
on the auth BFF (2002) and the username sign-in screen to return to (2003). Cairn
orchestrates the whole flow because 2003's stable identity makes GoTrue's built-in
recovery undeliverable.

## Context

After 2001–2003 merged: every account's GoTrue login identity is the stable,
non-deliverable `auth.users.email = '<uid>@cairn.internal'` (set by
`adopt_stable_identity()`, `db/migrations/0020_username_auth.sql:94`); sign-in is
username + password through the BFF (`auth-proxy/`); and the real recovery address
lives in `public.user_settings.recovery_email` — nullable, **not unique**, owner-only
RLS (`db/migrations/0019_username_identity.sql:152`, table `0004_domain_schema.sql:95`,
RLS `:631`).

Two facts shape every decision here. First, **GoTrue cannot deliver the recovery
mail**: its `/recover` mails `auth.users.email`, which is the internal address, so the
reset mail would go nowhere. Second, the web app is `adapter-static` — there is **no
SvelteKit server at runtime** — so all server-side recovery logic lives in the BFF,
mirrored by the dev Vite proxy (`web/vite.config.ts`), with the shared auth-path lists
kept in lockstep and guarded by `auth-proxy/test/auth-paths-drift.test.ts`. The BFF
today holds no PostgREST credential at all (its `resolve_username` call runs with no
Authorization header — `auth-proxy/src/lib/profiles.ts:19`) and no GoTrue admin key.

The recovery flow therefore needs the BFF to gain two new capabilities — sending mail
and a narrow privileged database read — and a database migration that adds a token
record, locks down direct writes to `recovery_email`, and adds the verify/reset RPCs.
pgcrypto is already enabled (`db/migrations/0001_init.sql:9`) and the pgTAP stub
already carries `auth.users.encrypted_password` (`db/test-bootstrap.sql:75`).

## Decisions

**Cairn orchestrates recovery end-to-end (confirmed with the user).** The alternative
— revisiting 2003's stable identity so GoTrue's `/recover` could be reused — was
rejected: it would re-couple login to the real e-mail and break the optional,
non-unique, private, mutable-username properties the stable identity bought. The cost
of keeping the stable identity is that 2004 builds the send + token + password-set
machinery itself; that cost is paid here.

**Password is set by a pgcrypto `SECURITY DEFINER` function, not a GoTrue admin key
(R6).** A token-gated function writes `auth.users.encrypted_password = crypt(pw,
gen_salt('bf'))`. This keeps everything in the Postgres/PostgREST/BFF triad and adds
no GoTrue service-role key (which would make the BFF an account-takeover primitive if
compromised). It mirrors the established house pattern of writing `auth.users` via
`SECURITY DEFINER` (`adopt_stable_identity`, `admin.ban_user`). The genuine cost is a
coupling to GoTrue v2.158.1's password storage; this is **pinned by an end-to-end
canary** (register → reset → sign in with the new password, old password fails) so a
GoTrue upgrade that changed the storage would fail loudly. bcrypt hashes are
self-describing, so the pgcrypto cost factor need not match GoTrue's for verification
to succeed.

**Request by username, code to the on-file address only (R4, R5).** Mailing a working
reset code to a requester-supplied address is account takeover, so the code goes only
to the address already proven on the account. Username is unique, so it identifies the
account with no e-mail needed and sidesteps the one-inbox-many-accounts ambiguity. The
browser sees a constant `200` whether or not anything was sent, so neither account nor
recovery-e-mail existence leaks.

**A scoped BFF database role, not anon, for the reset RPCs (R7).** The forgot-password
lookup must read the private on-file address to know where to send — and on a
no-server frontend, anything the BFF could learn via anon, a direct `/api` caller
could learn too, leaking recovery-address existence. So the lookup and the
password-set are granted to a dedicated low-privilege role the BFF assumes (a
pre-minted, long-lived role JWT held by the BFF, the standard PostgREST pattern), and
to neither `anon` nor `authenticated`. Worst case if that credential leaks: an
attacker can probe recovery pairs, trigger reset mail, **and reset passwords** —
since the BFF both sends the code and performs the set, the leaked credential can
mint a token and redeem it without the emailed code, so this is a reset-takeover
primitive, not "no takeover." That property is unachievable while one credential both
triggers the send and performs the set (the BFF must learn the plaintext code to mail
it). The scoped role is still the right call: a GoTrue admin/service-role key would
grant strictly more (read-all, ban, delete, identity rewrite), so this is the smaller
blast radius. The credential is treated as a high-value secret (never logged, in
secrets/env, rotatable) and the whole role is flagged as prod-facing.

**6-digit codes, single-use, hashed, rate-limited (R8).** Codes (not deep links)
match the stack's existing OTP and the e2e Mailpit helper, and avoid building
deep-link plumbing that 2006 tears out. They are stored hashed with a short expiry,
consumed on success, and protected by per-IP (in-memory) + per-target-address
(DB-backed) send throttles plus a submission-attempt cap, so a 10^6 code space is not
brute-forceable.

**`recovery_email` holds only the verified address; pending lives in the token
record.** This makes `recovery_email IS NOT NULL` mean "verified" with no extra
column, keeps the previously-active address intact while a change is pending, and
satisfies R1 structurally. Direct PostgREST writes are blocked by a column-level
`UPDATE` grant (R2) — the load-bearing enforcement point. The token record itself
lives in a private, non-PostgREST-exposed `auth_private` schema (reached only by the
`SECURITY DEFINER` RPCs as owner), so the pending address and code hashes never sit on
the API surface at all — the `admin`-schema lockdown posture, stronger than `public` +
deny-all RLS for the same data.

**The BFF gains SMTP (R9).** Unavoidable: GoTrue can't deliver and the web app has no
server. A small mailer (nodemailer — the BFF currently depends only on `express`)
reuses GoTrue's `SMTP_*` config; dev/e2e send to Mailpit. No address, code, or token
is ever logged.

## Architecture

Tests span all three layers: `db/tests/` pgTAP for the schema/RLS/RPC/grant work,
`auth-proxy/test/` unit tests for the BFF endpoints, `web/src/**/*.test.ts` Vitest for
client + screens, and one `web/e2e/` Playwright canary for the end-to-end proof.

### New files

- **`db/migrations/0021_password_recovery.sql`** — column-level grant lockdown on
  `user_settings`; the `recovery_tokens` record (in a dedicated, non-PostgREST-exposed
  `auth_private` schema); the scoped BFF role; the verify RPCs
  (`request_recovery_email_verification`, `confirm_recovery_email`) and reset RPCs
  (`request_password_reset`, `reset_password`).
- **`db/tests/recovery_email_grant.sql`** — positive `invite_policy` update still
  works; negative direct `recovery_email` write blocked.
- **`db/tests/recovery_verify.sql`**, **`db/tests/recovery_reset.sql`** — verify/reset
  RPC positive + negative, scoped-role grant assertions, password-actually-changes.
- **`auth-proxy/src/lib/mail.ts`** — SMTP mailer (nodemailer) + the recovery/verify
  mail bodies.
- **`auth-proxy/src/lib/recovery.ts`** — the scoped-role PostgREST client and code
  generation/hashing helpers.
- **`auth-proxy/test/recovery-email.test.ts`**, **`auth-proxy/test/forgot-reset.test.ts`**
  — endpoint unit tests, stubbing GoTrue/PostgREST/SMTP.
- **`web/src/lib/auth/components/ForgotPassword.svelte`**,
  **`web/src/lib/auth/components/ResetPassword.svelte`** (+ their `routes/auth/*`
  pages and `.test.ts`) — the signed-out request + reset screens.
- **`web/src/lib/settings/components/RecoveryEmail*.svelte`** (+ `.test.ts`) — the
  Settings capture + confirm UI (exact filenames per `docs/frontend-layout.md`).
- **`web/e2e/password-recovery.spec.ts`** — the canary.

### Modified files

- **`auth-proxy/src/index.ts`** — mount `/auth/recovery-email`,
  `/auth/recovery-email/confirm`, `/auth/forgot-password`, `/auth/reset-password`;
  wire rate-limiting and the scoped-role client.
- **`web/src/lib/shared/model/auth-paths.ts`** + **`auth-proxy/src/lib/auth-paths.ts`**
  (drift-guarded copy) + **`web/vite.config.ts`** (dev proxy mirror, incl. the SMTP
  send to Mailpit) — the four new paths, in lockstep.
- **`web/src/lib/auth/model/auth-client.ts`** — `setRecoveryEmail`,
  `confirmRecoveryEmail`, `requestPasswordReset`, `resetPassword`.
- **`web/src/lib/privacy/state/user-settings.svelte.ts`** — read `recovery_email` via
  `pgGet`; writes go through the BFF, not `pgPatch`.
- **`web/src/routes/+layout.svelte`** — add the two new public routes to
  `PUBLIC_AUTH_PATHS` + `SIGNED_IN_REDIRECT_PATHS`.
- **`web/src/lib/settings/components/SettingsScreen.svelte`** — entry point to the
  recovery-e-mail UI (placed under Account / a Sign-in section — the existing
  "Recovery" section is deleted-lists, do not reuse that label).
- **`caddy/Caddyfile.prod`** — add the four new POST endpoints to the auth-proxy
  allow-list (`@auth_credentials`); without this, prod routes them to the SPA, not the
  BFF, and the feature is dead in production.
- **`docker-compose.prod.yml`** (+ `.env.prod.example`) — auth-proxy `SMTP_*` env and
  the scoped-role credential (`AUTH_BFF_DB_JWT`).
- **`web/vite.config.ts`** (+ `.env.example`) and a JWT-minting helper
  (`scripts/mint-bff-jwt.sh` or a documented snippet) — the dev scoped-role JWT so the
  dev proxy and the e2e canary can reach the `cairn_auth_bff`-only reset RPCs.
- **`docs/architecture.md`**, **`docs/data-model.md`**, **`docs/deployment.md`**,
  **`docs/logging.md`**, **`docs/open-questions.md`** — Phase 0 reconciliation.

### Flow sketch

```
Set recovery e-mail (authenticated):
  browser → POST /auth/recovery-email {email}
    BFF: gen code → request_recovery_email_verification(email, code) [user bearer]
       → SMTP code to {email} → 200
  browser → POST /auth/recovery-email/confirm {code}
    BFF: confirm_recovery_email(code) [user bearer] → user_settings.recovery_email := email

Forgot password (signed-out):
  browser → POST /auth/forgot-password {username}
    BFF: per-IP throttle; gen code; respond constant 200 FIRST, then off the
         response path: request_password_reset(username, code) [scoped role]
         → on-file address | NULL; if address: SMTP code there
         (lookup+send never on the response path — R5 timing parity)
  browser → POST /auth/reset-password {username, code, new_password}
    BFF: per-IP throttle → reset_password(username, code, new_password) [scoped role]
       → crypt() into auth.users.encrypted_password; consume token; no session
  browser → sign in normally
```

## Phase structure

TDD ordering throughout: every task writes its tests (RED) before the implementation
that greens them (GREEN), in the same commit unit.

0. **Phase 0 — reconcile docs.** Land the narrative corrections in
   `architecture.md` / `data-model.md` / `deployment.md` / `logging.md` /
   `open-questions.md` (R10) before code. DDL-precise descriptions in `data-model.md`
   ride with the Phase-1 migration.
1. **Phase 1 — database.** The grant lockdown (R2), the token record + scoped role
   (R7, R8), and the verify (R3) and reset (R6) RPCs, each with pgTAP positive +
   negative. RLS/grants are the security boundary, so the negative cases (direct
   `recovery_email` write blocked; anon cannot call the reset RPCs) are load-bearing.
2. **Phase 2 — BFF + dev proxy + infra wiring.** SMTP mailer and scoped-role client
   (R9, R7); the authenticated recovery-e-mail endpoints (R3); the signed-out
   forgot/reset endpoints with rate-limiting and constant-shape (R4, R5, R8). auth-paths
   + drift test + Vite proxy move in lockstep; unit tests stub GoTrue/PostgREST/SMTP.
   The phase closes by wiring the endpoints into prod (Caddy allow-list, auth-proxy
   `SMTP_*` + scoped-role env) and dev (the scoped-role JWT the dev proxy and e2e canary
   need) — prod-facing.
3. **Phase 3 — web.** Client functions and `user_settings` wiring; the Settings
   capture + confirm UI; the forgot-password + reset-password screens with routes and
   guard updates; Vitest asserting user-visible behaviour, including the
   anti-enumeration constant screen (R5).
4. **Phase 4 — e2e canary.** One Playwright path proving register → set+verify
   recovery e-mail → forgot → reset → sign-in works end to end and pins the pgcrypto ↔
   GoTrue coupling (R6). Authored here; **run on the work box** (this laptop cannot run
   Playwright — see `docs/testing.md`).

## Reference docs and skills

- **`docs/architecture.md`** — the BFF surface, JWT/cookie model, the recovery design
  this sub-step lands (R10).
- **`docs/data-model.md`** — `user_settings` / `recovery_email`; the RPC + grant
  conventions; where the token record and verify/reset RPCs are documented.
- **`docs/deployment.md`** — prod vs dev compose, the `auth-proxy` service, SMTP,
  pre-deploy auth checklist; the SMTP + scoped-role additions are prod-facing.
- **`docs/logging.md`** — no e-mail/code/token in logs (R9).
- **`docs/testing.md`** — the three layers; Playwright is machine-conditional.
- **`docs/ui.md`** + **`design/cairn-screens.jsx`** — TopBar, button-pair order, form
  primitives, empty-state; the layout spec for the recovery screens (recorded in the
  UI task blocks).
- **`plans/0302_signin_anti_enumeration/`** — the constant-shape pattern to mirror for
  the forgot-password request (R5).

## Open questions

- **Exact scoped-role mechanism (role + pre-minted JWT vs. a BFF-shared-secret header
  the RPC checks via `request.headers`).** Default: a NOLOGIN role `cairn_auth_bff`
  granted the two reset RPCs, with `authenticator` allowed to assume it in prod and the
  `GRANT … TO authenticator` guarded so the pgTAP test DB (which has no `authenticator`)
  still applies the migration. Settled in Phase 1/2.
- **Where the code is hashed (BFF vs. RPC).** Default: the BFF generates the code and
  passes only its hash to the RPC, so the plaintext code never enters a database query
  (defence against statement logging); the DB stores and compares the hash. Settled in
  Phase 1.
- **Verify-flow throttle keying.** The verify-send is authenticated, so a per-account
  bound exists naturally; the per-target-address cap is what stops "type victim@x,
  hammer resend." Default: apply the same DB-backed per-address cap as the reset-send.
- **Recovery-e-mail removal.** Clearing `recovery_email` (set to NULL) needs no
  verification; default is a dedicated authenticated BFF endpoint (or a confirm-RPC
  overload) rather than re-opening the column grant. Settled in Phase 2.
