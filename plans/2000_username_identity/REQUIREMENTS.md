# Requirements: Username identity

Move Cairn's user identity and sign-in from e-mail to a public, unique
**username** plus a **password**, demoting e-mail to an optional recovery
address that is never required and never shown. E-mail-as-login is confusing
(it doubles as the private contact field and the public "add this person"
key), and it forces every user to hand over an e-mail address we have said we
don't actually want. A chosen username is a cleaner public identity and makes
"add someone" a public, unambiguous act. This is an **orchestration plan**: its
requirements are the step-20 contract; each is refined and implemented by a
sub-plan (`plans/2001_*` … `plans/2005_*`), and the matching sub-plan number is
noted in each requirement.

## R1. A public username is the user's identity (→ 2001, 2004)

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

## R3. Sign-in is by username + password (→ 2002)

A user signs in by entering their username and password. E-mail is **not**
accepted as a sign-in identifier. On success the session is established exactly
as today — the `cairn_session` HttpOnly cookie planted by the shim
(`auth-proxy` in prod, the Vite proxy in dev), tokens stripped from the response
body, JavaScript holding nothing thereafter. The cookie/JWT contract, route
guard, and PostgREST bearer attachment are unchanged; only the credential that
opens a session changes.

## R4. E-mail is optional and recovery-only (→ 2001, 2003)

E-mail is never required to register, sign in, or use Cairn. When a user
chooses to provide one, it is stored solely so they can recover a lost
password (R9), and only after they prove they own it (R13). It remains private
under the `docs/invites.md` contract: never
rendered in the UI, never returned by a PostgREST base-table query, never used
as an "add this person" key. An account with no e-mail is fully functional
except that it cannot self-serve a password reset (operator reset is the
fallback — see Open questions in `PLAN.md`).

## R5. Username is changeable at any time (→ 2001)

A user may change their username whenever they like, to any value that is free
under R2's case-insensitive rule and valid under R1's character rule. A
`set_username` RPC performs the change atomically and rejects a taken or
invalid name with a distinguishable error the UI can surface. Changing a
username does not break sign-in, sessions, attribution, or membership — those
hang off the immutable user id, not the username.

## R6. Username disambiguates display names (→ 2004)

Display names are not unique and the UI currently shows them bare, so two
"Alex"es are indistinguishable. Wherever a person is shown — profile sheet,
members screen, vote attribution, invite picker, and item created/modified
attribution — the username is available to disambiguate, rendered as
`@username`. The profile sheet shows it prominently; list rows show it at least
on demand. Exact placement per screen is decided in 2004 against the design
canvas, but no screen may leave two identical display names unresolvable.

## R7. Registration creates an account from username + password (→ 2002)

New accounts are created with a username and a password (and, optionally, a
recovery e-mail). The username is validated (R1) and reserved (R2) at creation.
Whether registration stays invite-gated as today, and how the first account is
created under the new credential, is settled in 2001/2002 against
`docs/invites.md` — but the credential collected is username + password, not an
e-mail.

## R8. E-mail sign-in is retired (→ 2002, 2005)

The e-mail magic-link request screen, the "check your inbox" / OTP code-entry
screen, and the magic-link callback path are removed as sign-in surfaces once
the migration (R11) is complete. This **replaces** rather than supplements
e-mail login: the work supersedes the login surface delivered by
`plans/0302_signin_anti_enumeration` and `plans/1700_email_otp`, and reverses
the "**email magic links only** … No passwords are ever stored or transmitted"
decision recorded in `docs/architecture.md`. Those plan directories remain as
historical record; this requirement supersedes their runtime surface, it does
not edit them.

## R9. Password recovery uses the optional e-mail (→ 2003)

A user who provided a recovery e-mail can request a password reset; the reset
link/code is sent to that address and lets them set a new password, after which
they sign in normally (R3). The request step must not reveal whether a given
username or e-mail corresponds to an account, beyond what is already public
(usernames are public; the *existence of a recovery e-mail* is not). A user
with no recovery e-mail on file cannot self-serve here.

## R10. People are added by username, not e-mail (→ 2004)

Adding a person to a list or a circle is keyed by username. `send_invitation`
and the circle-add RPC accept a username and resolve it to a user id;
`add_circle_by_email` and the e-mail branch of `send_invitation` are replaced.
The invite-picker and circle screens drop their e-mail text fields and gain a
username field. Because usernames are public, an "no such username" response is
permitted to be truthful (unlike the e-mail anti-enumeration stance), but the
existing block / invite-policy / self-invite checks in `docs/invites.md` still
apply unchanged.

## R11. Existing alpha accounts migrate without data loss (→ 2005)

The live alpha at `cairn.lynnscape.eu` already has e-mail/magic-link accounts
with no username and no password. The migration derives each account's initial
username from its current display name — folded to `a-zA-Z0-9`, and
collision-suffixed (e.g. a numeric suffix) so the result satisfies R1 and R2 —
and gives each existing user an initial-password path via the recovery flow
(R9), since every existing account has an e-mail on file. No lists, items,
votes, memberships, circles, or invitations are lost. After migration the
e-mail sign-in surface is removed (R8).

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

## R13. A recovery e-mail is verified before it takes effect (→ 2003)

Setting or changing the recovery e-mail requires the user to prove they own the
new address: Cairn sends a confirmation (a link or a code) to it, and the
address becomes the account's active recovery e-mail only after that
confirmation succeeds. An unverified or pending address is never treated as a
usable recovery target (R9), so a typo — or a hostile attempt to point recovery
at someone else's inbox — cannot silently take effect. Addresses already
confirmed by the historical magic-link flow are treated as proven at migration
time (R11); verification applies to every set or change made under the new
model.

## Non-requirements (explicitly excluded)

- **Keeping e-mail magic-link as a secondary sign-in.** Explicitly replaced,
  not supplemented (R8) — the user chose "replace". Coexistence was considered
  and rejected: with e-mail optional, magic-link can't be a universal path.
- **OAuth / "Sign in with Google/Apple".** Already rejected in
  `docs/architecture.md` → "Considered and rejected"; unaffected here.
- **Gating general account use behind e-mail confirmation.** Recovery-e-mail
  *ownership* is verified on set/change (R13), but there is no
  e-mail-confirmation gate on registering or using Cairn — accounts work with no
  e-mail at all (R4).
- **Username history, reserved-name registry, or anti-impersonation beyond
  uniqueness.** A freed username (R5) may be claimed by anyone; no squatting
  protection, no "@admin"-style reserved list in this step.
- **Password-strength policy / brute-force rate-limiting beyond GoTrue
  defaults.** Worth a hardening follow-up; not a gate for this step.
- **Replacing GoTrue.** The identity continues to ride the existing
  Postgres + PostgREST + GoTrue stack; how username+password maps onto GoTrue
  is a mechanism decision (2001 spike), not a stack change.
