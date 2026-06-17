# Requirements: Password recovery

Give e-mail its one remaining job — recovering a lost password — without
re-coupling it to identity. A signed-out user resets their password via a code
sent to a recovery e-mail they have **proven they own**, all orchestrated by the
auth BFF. This sub-step (2004 of the username-identity step) refines the parent
plan's R4, R9, and R13. The defining constraint: 2003 made each account's GoTrue
identity the non-deliverable `<uid>@cairn.internal`, so GoTrue's built-in
`/recover` cannot deliver mail to the real address — Cairn owns the whole flow.

## R1. The recovery e-mail is verified before it takes effect

`public.user_settings.recovery_email` holds **only an address whose ownership has
been proven** — the account's active recovery target. Setting or changing it sends
a confirmation code to the new address, and the address becomes active **only after
that code is confirmed**. A pending (unconfirmed) address is never stored in
`recovery_email`; it lives transiently in the recovery-token record until confirmed,
so `recovery_email IS NOT NULL` is exactly "has a proven, usable recovery address."
A typo or a hostile attempt to point recovery at someone else's inbox cannot silently
take effect.

## R2. The recovery e-mail cannot be written except through the verified path

A signed-in user may read their own `recovery_email` but **cannot write it directly**
through PostgREST. The table's `UPDATE` grant to `authenticated` is narrowed to the
columns that remain freely editable (`invite_policy`); `recovery_email` is written
only by the confirm RPC (R3). Positive: a user can still update their `invite_policy`.
Negative: a `PATCH /user_settings` that sets `recovery_email` is rejected at the
database. This is the enforcement point for R1 — without it, verification is
advisory.

## R3. Setting or changing the recovery e-mail is a send-then-confirm flow

An authenticated user submits a candidate recovery e-mail; Cairn sends a 6-digit code
to it and records a pending verification. The user enters the code; on a correct,
unexpired, unconsumed code the address becomes the account's active `recovery_email`
(R1) and the token is consumed. A wrong, expired, or already-used code is rejected
with a distinguishable error the UI can surface (the user is acting on their own
account, so there is no enumeration concern here).

## R4. Forgot-password is requested by username; the code goes only to the on-file address

A signed-out user requests a reset by entering their **username** (only). Cairn
resolves the username to the account and sends a 6-digit reset code **only to that
account's on-file, verified `recovery_email`** — never to any address supplied in the
request. Username is unique, so it unambiguously identifies the account even though a
recovery address may back several accounts. An account with no verified recovery
e-mail receives no code and has no self-serve path (see Non-requirements).

## R5. The reset request does not reveal whether an account or recovery e-mail exists

The browser receives an identical, constant response for every forgot-password
request — username unknown, username known but no recovery e-mail, or a code actually
sent. Nothing about account existence beyond the already-public username, and nothing
about the existence of a recovery e-mail, is revealed (parent R9; mirrors the
anti-enumeration discipline of `plans/0302_signin_anti_enumeration`). Response timing
must not distinguish the cases (do the send after responding, or otherwise decouple
it).

## R6. Reset sets a new password via a token-gated database function, with no GoTrue admin credential

Completing a reset sets the account's password by a `SECURITY DEFINER` function,
gated by a valid reset token, that writes `auth.users.encrypted_password` using
pgcrypto (`crypt(p_new_password, gen_salt('bf'))`). The BFF holds **no GoTrue
admin/service-role key**; the function is the password-setting authority, mirroring
the house pattern of writing `auth.users` via `SECURITY DEFINER`
(`adopt_stable_identity`, `admin.ban_user`). A new password must satisfy the same
minimum length the BFF enforces at registration. After a successful reset the user is
**not** auto-logged-in — they sign in normally (parent R3). The reset writes the
password and consumes the token; it mints no session.

## R7. The forgot-password lookup and password-set are reachable only by a scoped BFF role

The two reset RPCs — the lookup that reads the on-file address and mints the token,
and the password-set — are granted **only** to a dedicated, low-privilege database
role the BFF assumes; they are granted to neither `anon` nor `authenticated`. This
keeps the private recovery address off the anonymously-reachable PostgREST surface
(so R5 holds even against direct `/api` calls) and keeps the `auth.users` password
write off the public surface. Because the BFF both triggers the code send and
performs the password-set, a leak of this role's credential **is** a reset-takeover
primitive: an attacker holding it can mint a reset token and redeem it without the
emailed code (the code is a second factor only against an attacker who lacks the
BFF's database position, not against one who holds this very credential). It is
nonetheless preferred over a GoTrue admin/service-role key, which would grant
**strictly more** — reading every user, banning, deleting, and rewriting identities —
so the scoped role is the smaller blast radius, not a zero one. The credential is
therefore treated as a high-value secret: never logged (R9), held only in
secrets/env, and rotatable. The verify-flow RPCs (R3), by contrast, run under the
user's own session and are granted to `authenticated`.

## R8. Recovery codes are single-use, time-limited, hashed, and rate-limited

Verification and reset codes are 6-digit numeric, stored **hashed** (never in
plaintext) with a short expiry, and are single-use (consumed on success). Mail sends
are rate-limited per source IP (the BFF's in-memory limiter) **and** per target
address (a database-backed counter that survives a BFF restart), on both the
verify-send and the reset-send. Code-submission attempts are bounded so a 6-digit code
cannot be brute-forced. A constant-shape failure is returned where revealing the
specific cause would aid an attacker.

## R9. The BFF delivers recovery mail; no address or code is ever logged

The BFF sends recovery mail over SMTP, reusing the same SMTP configuration GoTrue
uses (dev → Mailpit; prod → the configured provider). Mail is British-English copy
("e-mail" hyphenated, "they/them"), carries a code (not a deep link), and tells the
recipient to ignore it if they did not request it. Per `docs/logging.md`, no e-mail
address, no code, and no token ever appears in a log line — at most a hash, consistent
with the existing logging discipline.

## R10. The session-model / recovery docs are reconciled before code lands

Following the parent's R19 discipline, the affected specs are corrected first:
`docs/architecture.md` (Cairn-orchestrated recovery; the BFF gains SMTP and a scoped
DB role; pgcrypto password-set; the operator-reset open question resolved),
`docs/data-model.md` (`recovery_email` as the active/verified address, the
recovery-token record, the column-level grant, the verify/reset RPCs),
`docs/deployment.md` (auth-proxy SMTP env + the scoped-role credential; pre-deploy
checklist), `docs/logging.md` (recovery addresses/codes never logged — confirm or add
a line), and `docs/open-questions.md` (clear the recovery mechanism and the
operator-reset question). Narrative corrections land in Phase 0; DDL/behaviour
specifics ride with their migration.

## Non-requirements (explicitly excluded)

- **Operator / admin password reset for accounts with no recovery e-mail.** By design
  there is no self-serve path for an account that never proved a recovery address; an
  `admin`-schema operator reset is a later concern, not built here. (Every existing
  alpha account has e-mail and is grandfathered in 2006; only a brand-new account that
  registered without a recovery e-mail can lock itself out.)
- **Add-by-username and `@username` rendering.** That is 2005; recovery only consumes
  the existing `username`/`resolve_username` surface.
- **The alpha migration, grandfathering already-confirmed addresses, moving onto the
  stable identity, and removing the magic-link / e-mail-OTP sign-in surface.** All 2006. 2004 must not delete the legacy magic-link templates or routes, nor backfill
  `recovery_email`.
- **Deep-link reset (magic link).** A 6-digit code entered on a Cairn screen is used
  instead — the stack already uses OTP codes and the deep-link plumbing is retired in 2006.
- **Auto-login after a reset.** The user signs in normally afterwards (R6).
- **A persistent "pending verification" indicator in Settings.** The pending state is
  transient and client-held during the set-then-confirm flow; an abandoned
  verification simply leaves the previous active address unchanged.
- **Password-strength policy beyond a minimum length.** A composition policy or
  breached-password check is a separate hardening track (matches the parent step's
  non-requirements).
