# Requirements: Username identity

Move Cairn's user identity and sign-in from e-mail to a public, unique
**username** plus a **password**, demoting e-mail to an optional recovery
address that is never required and never shown. E-mail-as-login is confusing
(it doubles as the private contact field and the public "add this person"
key), and it forces every user to hand over an e-mail address we have said we
don't actually want. A chosen username is a cleaner public identity and makes
"add someone" a public, unambiguous act. The work also **rebuilds the session
model** the credential rides on — the cookie today holds a long-lived,
non-revocable access JWT, which is the wrong foundation under a brute-forceable
password — into a revocable, rotating session behind a small auth BFF (R14–R19;
see PLAN.md "Design revision"). This is an **orchestration plan**: its
requirements are the step-20 contract; each is refined and implemented by a
sub-plan (`plans/2001_*` … `plans/2006_*`), and the matching sub-plan number is
noted in each requirement.

## R1. A public username is the user's identity (→ 2001, 2005)

Every account has a `username`: a short, public, human-chosen handle stored on
`public.profiles` (`profiles.username`, `NOT NULL`). It is composed only of the
characters `a`–`z`, `A`–`Z`, and `0`–`9` (no spaces, punctuation, or
non-ASCII), with a sensible length bound (decided in 2001). It is world-readable
to the same extent the existing `profiles_select` policy already allows
(authenticated callers can read any profile), and for signed-out public-list
readers wherever a display name is already shown. The username is the stable
key that "add this person" and disambiguation rely on.

## R2. Username uniqueness is case-insensitive (→ 2001)

No two live accounts may hold the same username when compared
case-insensitively. `LaraCroft` and `Laracroft` are the same username and
cannot coexist; whichever is taken blocks the other. Uniqueness is enforced at
the database on `lower(username)` (a unique index or equivalent), so the
guarantee holds regardless of which client or RPC writes the value. The stored
value preserves the casing the user typed (display is `LaraCroft`); only
comparison folds case.

## R3. Sign-in is by username + password (→ 2003)

A user signs in by entering their username and password. E-mail is **not**
accepted as a sign-in identifier. On success a session is established via the
auth BFF (R15): the browser holds nothing but the `cairn_session` HttpOnly
cookie, and JavaScript never sees a token — the HttpOnly / no-token-in-JS
contract from `docs/architecture.md` "JWT storage" survives. What that cookie
_carries_, and how the session is refreshed and revoked, is redefined by the
session-security work (R14): it is no longer a long-lived access JWT. The route
guard and the PostgREST cookie→bearer attachment for `/api` are unchanged; what
changes is the credential that opens a session **and** the session model behind
the cookie.

## R4. E-mail is optional and recovery-only (→ 2001, 2004)

E-mail is never required to register, sign in, or use Cairn. When a user
chooses to provide one, it is stored solely so they can recover a lost
password (R9), and only after they prove they own it (R13). It remains private
under the `docs/invites.md` contract: never
rendered in the UI, never returned by a PostgREST base-table query, never used
as an "add this person" key. An account with no e-mail is fully functional
except that it cannot self-serve a password reset (operator reset is the
fallback — see Open questions in `PLAN.md`).

## R5. Username is changeable at any time (→ 2001, 2003)

A user may change their username whenever they like, to any value that is free
under R2's case-insensitive rule and valid under R1's character rule. A
`set_username` RPC performs the change atomically and rejects a taken or
invalid name with a distinguishable error the UI can surface. Changing a
username does not break sign-in, sessions, attribution, or membership — those
hang off the immutable user id, not the username. Under the revised identity
model (R16) the change touches **only** `profiles.username`: the GoTrue login
identity is a stable, username-independent token, so a rename can never alter
the credential the user signs in with. (2001 shipped `set_username` rewriting a
synthetic `auth.users.email`; 2003 revises that body away — see R16.)

## R6. Username disambiguates display names (→ 2005)

Display names are not unique and the UI currently shows them bare, so two
"Alex"es are indistinguishable. Wherever a person is shown — profile sheet,
members screen, vote attribution, invite picker, and item created/modified
attribution — the username is available to disambiguate, rendered as
`@username`. The profile sheet shows it prominently; list rows show it at least
on demand. Exact placement per screen is decided in 2004 against the design
canvas, but no screen may leave two identical display names unresolvable.

## R7. Registration creates an account from username + password (→ 2003)

New accounts are created with a username and a password (and, optionally, a
recovery e-mail). The username is validated (R1) and reserved (R2) at creation.
Whether registration stays invite-gated as today, and how the first account is
created under the new credential, is settled in 2001/2002 against
`docs/invites.md` — but the credential collected is username + password, not an
e-mail.

## R8. E-mail sign-in is retired (→ 2003, 2006)

The e-mail magic-link request screen, the "check your inbox" / OTP code-entry
screen, and the magic-link callback path are removed as sign-in surfaces once
the migration (R11) is complete. This **replaces** rather than supplements
e-mail login: the work supersedes the login surface delivered by
`plans/0302_signin_anti_enumeration` and `plans/1700_email_otp`, and reverses
the "**email magic links only** … No passwords are ever stored or transmitted"
decision recorded in `docs/architecture.md`. Those plan directories remain as
historical record; this requirement supersedes their runtime surface, it does
not edit them.

## R9. Password recovery uses the optional e-mail (→ 2004)

A user who provided a recovery e-mail can request a password reset; the reset
link/code is sent to that address and lets them set a new password, after which
they sign in normally (R3). The request step must not reveal whether a given
username or e-mail corresponds to an account, beyond what is already public
(usernames are public; the _existence of a recovery e-mail_ is not). A user
with no recovery e-mail on file cannot self-serve here.

## R10. People are added by username, not e-mail (→ 2005)

Adding a person to a list or a circle is keyed by username. `send_invitation`
and the circle-add RPC accept a username and resolve it to a user id;
`add_circle_by_email` and the e-mail branch of `send_invitation` are replaced.
The invite-picker and circle screens drop their e-mail text fields and gain a
username field. Because usernames are public, an "no such username" response is
permitted to be truthful (unlike the e-mail anti-enumeration stance), but the
existing block / invite-policy / self-invite checks in `docs/invites.md` still
apply unchanged.

## R11. Existing alpha accounts migrate without data loss (→ 2006)

The live alpha at `cairn.lynnscape.eu` already has e-mail/magic-link accounts
with no username and no password. The migration derives each account's initial
username from its current display name — folded to `a-zA-Z0-9`, and
collision-suffixed (e.g. a numeric suffix) so the result satisfies R1 and R2 —
moves each account onto the stable GoTrue identity (R16), and gives each
existing user an initial-password path via the recovery flow (R9), since every
existing account has an e-mail on file. Existing sessions move onto the
revocable session model (R14) as they re-authenticate. No lists, items, votes,
memberships, circles, or invitations are lost. After migration the e-mail
sign-in surface is removed (R8).

## R12. The specification docs are reconciled before code lands (→ 2001)

Because this reverses a load-bearing architecture decision, the affected
specs are corrected as the plan's Phase 0, before implementation:
`docs/architecture.md` (the "Authentication" section, the magic-link flow
steps, and the "Considered and rejected" entries), `docs/data-model.md`
(`profiles.username`, case-fold uniqueness, recovery-e-mail home, the
`set_username` RPC), `docs/invites.md` and `docs/circles.md` (add-by-username
replacing add-by-e-mail), and `docs/open-questions.md` (record/clear the
identity question). Downstream sub-plans reference the corrected docs, not the
stale ones.

## R13. A recovery e-mail is verified before it takes effect (→ 2004)

Setting or changing the recovery e-mail requires the user to prove they own the
new address: Cairn sends a confirmation (a link or a code) to it, and the
address becomes the account's active recovery e-mail only after that
confirmation succeeds. An unverified or pending address is never treated as a
usable recovery target (R9), so a typo — or a hostile attempt to point recovery
at someone else's inbox — cannot silently take effect. Addresses already
confirmed by the historical magic-link flow are treated as proven at migration
time (R11); verification applies to every set or change made under the new
model.

## R14. The session is revocable and short-lived, not a long-lived bearer JWT (→ 2002)

Today `cairn_session` **is** the GoTrue access JWT, with a ~7-day lifetime, and
the refresh token is discarded by the shim (`auth-proxy/src/index.ts` deletes
`refresh_token` from the body before forwarding). For a password-protected
account two consequences are unacceptable: the cookie value is a bearer valid
for its full lifetime to anyone who captures it, and there is no server-side
session record — so "sign out everywhere", killing sessions on a compromise,
and forcing re-auth after a password change are all impossible.

The cookie must instead carry a **rotating, revocable** session/refresh token;
**access tokens are short-lived** (single-digit minutes) and minted
server-side from it on demand, never the durable cookie value. Refresh uses
**rotation with reuse detection**: each refresh issues a new token and
invalidates the old one, and replay of an already-rotated token revokes the
whole token family as a theft signal. This is the single largest security
delta in step 20 and is independent of usernames — the gap exists in
production today. It changes _what the cookie holds and how it is refreshed_,
not whether JavaScript can read it: the HttpOnly contract (R3) holds.

## R15. The browser talks to a Cairn-shaped auth BFF, not GoTrue's wire protocol (→ 2002, 2003)

The `auth-proxy` grows from a transparent cookie/JWT shim into a small
**backend-for-frontend**: it exposes a Cairn-shaped API — `/auth/register`,
`/auth/signin`, `/auth/signout`, `/auth/refresh`, taking and returning Cairn's
own shapes — and owns all GoTrue translation behind it. The browser never
computes a synthetic e-mail, never selects a `grant_type`, and never sees a
token: it sends a username + password (or nothing, for signout/refresh) and
receives a cookie plus a tokenless result. This shrinks the client's attack
surface and gives one server-side place to enforce the session model (R14),
CSRF (R17), rate-limiting (R18), and uniform anti-enumeration. It deliberately
reverses 2001's "keep the proxy a dumb, identity-agnostic shim" stance: the
proxy must grow to perform revocable refresh server-side regardless (R14), so
the username→id resolver (R16) and the Cairn-shaped surface ride that growth at
no extra structural cost. The BFF stays the **only** server-side component in
the auth path — the SvelteKit app is `adapter-static` with no server at
runtime, so there is no alternative host for this logic.

## R16. GoTrue identity is a stable token; username is resolved at the BFF (→ 2003; supersedes 2001's synthetic-e-mail mechanism)

2001 made the GoTrue identity a **synthetic e-mail derived from the username**
(`lower(username)@users.cairn.invalid`), so a rename had to atomically rewrite
`auth.users.email` and a domain constant had to stay byte-identical between SQL
and any client (a drift hazard). The revised design gives each account a
**stable, immutable GoTrue identity that does not encode the username** (e.g. a
uid-derived `<uid>@cairn.internal`, set once at account creation) and has the
BFF **resolve a typed username to its user id** via the `lower(username)`
unique index on every sign-in. Consequences: `set_username` (R5) touches only
`profiles.username` — it no longer writes `auth.users.email`, so the
synthetic-e-mail invariant, the atomic-rewrite hazard, and the SQL↔client drift
guard all disappear; and a rename can never break the login credential. This
**revises 2001 forward, not back**: the `username` column, the case-fold
uniqueness, the `recovery_email` home, and `set_username`'s signature and
guards all survive — only the e-mail-rewrite body and the synthetic-e-mail
invariant are removed.

## R17. The session cookie is hardened and CSRF is defended explicitly (→ 2002)

The session cookie uses the **`__Host-` prefix** (`__Host-cairn_session`),
which forces `Secure` + `Path=/` + no `Domain` and closes subdomain
cookie-injection. `SameSite` stays `Lax` (not `Strict`, so following a link
into Cairn keeps the user signed in; `Lax` already withholds the cookie on
cross-site state-changing requests). On top of `SameSite`, state-changing auth
requests carry an **explicit CSRF defence** the BFF validates — a required
custom header or a double-submit token a cross-origin attacker cannot set — so
the design does not lean on `SameSite` alone.

## R18. Sign-in is rate-limited against brute force (→ 2002)

Username + password is a brute-forceable credential in a way magic-link was
not, so the BFF throttles repeated sign-in failures **per account and per
source IP** (backoff or temporary lockout). Sign-in failures keep a constant
shape — a wrong password and an unknown username return the same error, so the
response does not reveal _which_ factor failed (usernames are public per R1, so
this is hygiene, not an enumeration boundary). This supersedes the prior "no
rate-limiting beyond GoTrue defaults" non-requirement, which no longer holds
once passwords are the credential.

## R19. The session-model and identity-mechanism docs are reconciled (→ 2002, 2003)

The session-security redesign reverses claims this step's own 2001 sub-step
recorded, so the affected specs are corrected as the relevant sub-step's
Phase 0, before its code lands (as R12 did for the identity claims).
`docs/architecture.md` "JWT storage" / "Authentication" must stop describing
`cairn_session` as the access JWT with a ~7-day (→ ~30-day) lifetime and the
refresh token as discarded, and instead describe the revocable rotating
session, the short-lived server-held access token, the BFF surface, and the
`__Host-` + CSRF posture. The "Considered and rejected" synthetic-e-mail entry
that 2001 added (`architecture.md` ≈ line 327) is corrected to record the
stable-identity + BFF-resolver design and why it superseded the synthetic
e-mail. `docs/data-model.md`'s `set_username` / synthetic-domain notes are
updated to the profiles-only change and the stable identity. Narrative claims
land first; DDL/behaviour doc edits ride with their migration.

## Non-requirements (explicitly excluded)

- **Keeping e-mail magic-link as a secondary sign-in.** Explicitly replaced,
  not supplemented (R8) — the user chose "replace". Coexistence was considered
  and rejected: with e-mail optional, magic-link can't be a universal path.
- **OAuth / "Sign in with Google/Apple".** Already rejected in
  `docs/architecture.md` → "Considered and rejected"; unaffected here.
- **Gating general account use behind e-mail confirmation.** Recovery-e-mail
  _ownership_ is verified on set/change (R13), but there is no
  e-mail-confirmation gate on registering or using Cairn — accounts work with no
  e-mail at all (R4).
- **Username history, reserved-name registry, or anti-impersonation beyond
  uniqueness.** A freed username (R5) may be claimed by anyone; no squatting
  protection, no "@admin"-style reserved list in this step.
- **Elaborate password-strength policy / breach-list checks.** A sane minimum
  length is fine; a composition policy or a breached-password check is a
  hardening follow-up, not a gate. (Brute-force _rate-limiting_ is **no longer**
  excluded — it is now required by R18, because passwords make the account
  brute-forceable in a way magic-link was not.)
- **MFA / second factor, passkeys / WebAuthn, step-up auth.** A single
  password factor is the credential for this step. Adding a second factor or a
  WebAuthn path is a future hardening track, deliberately out of scope —
  calibrated to a small private alpha.
- **Device fingerprinting, anomaly detection, or per-device session naming.**
  The revocable session model (R14) gives "sign out everywhere" and
  compromise-kill; richer per-device session management and behavioural
  anomaly detection are not built here.
- **Replacing GoTrue.** The identity continues to ride the existing
  Postgres + PostgREST + GoTrue stack. How username+password maps onto GoTrue
  is a mechanism decision — a **stable, uid-derived GoTrue identity resolved at
  the BFF** (R16), revising 2001's synthetic-e-mail spike forward — not a stack
  change.
