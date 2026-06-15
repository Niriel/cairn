# Plan: Username identity

Step 20 of the master plan — move identity and sign-in from e-mail to a public
username + password, with e-mail demoted to optional recovery. This is an
**orchestration plan**: rather than implementing directly, its phases create
and execute five sub-plans, each on its own branch cut from
`2000_username_identity`, merged back before the step merges to `main`.

## Context

Cairn is a live alpha at `cairn.lynnscape.eu`. Today the entire identity model
hangs off e-mail: GoTrue authenticates by `auth.users.email` via magic links
plus the six-digit OTP that `plans/1700_email_otp` added; the session
`AuthUser` carries `{id, email}`; and "add this person" is keyed by e-mail
(`send_invitation(p_email)`, `add_circle_by_email`), looking the address up in
`auth.users`. `docs/architecture.md` states the auth model as "**email magic
links only** … No passwords are ever stored or transmitted by us," and lists
passwords-avoided as a *benefit* under "Considered and rejected".

That model has two problems the user wants gone. First, e-mail is both the
private contact field *and* the public add-key, which is the source of the
"add by e-mail is confusing" complaint and a privacy smell. Second, it forces
every user to provide an e-mail address Cairn doesn't actually want. The fix is
a public, unique, user-chosen **username** as the identity and add-key, a
**password** for sign-in, and e-mail demoted to an optional recovery address
(never required, never shown — the `docs/invites.md` privacy contract holds).

The data model is favourable: identity, attribution, membership, circles, and
invitations all hang off the immutable `auth.users.id` (uuid), not off e-mail.
`profiles.display_name` already exists (mutable, not unique); `username` is a
sibling field on the same table. The cookie/JWT shim, route guard, RLS, and
PostgREST bearer attachment are all identity-agnostic and survive unchanged —
only the credential that opens a session, and the key used to add people,
change. The hard part is the GoTrue mechanism (see Decisions) and migrating the
live alpha's existing e-mail accounts (R11).

## Decisions

**Orchestration via sub-branches, not one big branch.** Step 20 spans a DB
schema change, the auth HTTP surface, two reworked sharing screens, a new
recovery flow, and a live-data migration that reverses a published doc
decision. Landing it in one PR would make review and bisection painful. Each
sub-step (2001–2005) gets its own branch cut from `2000_username_identity`, its
own `/write-plan`, its own PR merged back with `--no-ff`, and is verified
independently. `plans/0400_mvp_product/` is the worked example of this pattern.

**Replace e-mail sign-in, don't supplement it (R8).** The user chose to retire
e-mail login outright. Coexistence was considered and rejected: once e-mail is
optional (R4), a magic-link path can only ever serve the subset of users who
supplied an address, so it can't be the universal sign-in — keeping it would
mean maintaining two login surfaces for no universal benefit. This means the
plan deliberately supersedes the runtime surface of
`plans/0302_signin_anti_enumeration` and the just-shipped
`plans/1700_email_otp`, and reverses the architecture-doc decision — handled as
Phase 0 doc reconciliation (R12), not as a silent contradiction.

**Case-insensitive uniqueness, case-preserving storage (R1, R2).** Usernames
are `a-zA-Z0-9` only and unique on `lower(username)`, so `LaraCroft` blocks
`Laracroft`, while the stored value keeps the user's casing for display. A
unique index on `lower(username)` (or a `citext`-typed column) is the
enforcement point — it must live at the DB so no RPC or client can bypass it.
The character restriction (no spaces/punctuation/Unicode) keeps usernames
unambiguous in `@handle` rendering and in any future URL use, and sidesteps
confusable-Unicode impersonation without a normalization regime.

**How username+password rides GoTrue is a 2001 spike — leaning synthetic
e-mail.** GoTrue authenticates by e-mail and has no username concept, so
something must bridge username → GoTrue identity. The leaning default: derive a
**synthetic, deterministic GoTrue e-mail from the username**
(`lower(username)@<internal-domain>`), so the client computes it locally and
uses GoTrue's existing password grant (`POST /auth/token?grant_type=password`)
with no server-side lookup and no privacy leak; the optional *real* recovery
e-mail lives separately (e.g. `user_settings.recovery_email`) and recovery is a
custom flow (R9). A username change (R5) rewrites the synthetic
`auth.users.email` inside the `set_username` definer RPC — consistent with the
existing `tg_profile_on_signup` trigger and the admin RPCs that already write
`auth.users`. The alternative — keeping a stable uid-derived identity plus a
server-side username→identity resolver in `auth-proxy` — buys native GoTrue
recovery at the cost of widening the auth-proxy trust surface. 2001 decides;
this plan does not lock it in.

**Migrate by deriving usernames from display names (R11).** Existing alpha
accounts get an initial username folded from their current `display_name` to
`a-zA-Z0-9` and collision-suffixed to satisfy R1/R2, and an initial password
set via the recovery flow (R9) since every existing account has an e-mail. This
avoids a hard "everyone re-registers" reset and loses no data. It runs last
(2005), after the new surface exists, and is the only prod-facing sub-step.

**Recovery e-mail is verified on set/change (R13).** A recovery address only
becomes usable after the user proves ownership via a confirmation sent to it, so
a typo or a hostile redirect can't silently capture someone's password-reset
channel. Under the synthetic-e-mail lean the recovery address lives outside
GoTrue's identity (`user_settings.recovery_email`), so this is a custom verify
step in 2003 (send link/code → confirm → activate); if 2001's spike instead
keeps a real e-mail on `auth.users`, GoTrue's native e-mail-change confirmation
can back it. Addresses already confirmed by the historical magic-link flow are
grandfathered as proven at migration (R11) — verification gates only set/change
under the new model.

**The 2000 plan is deliberately thin.** Per-sub-step requirements, architecture,
and file inventories live in their own plan directories (`plans/2001_*/` …
`plans/2005_*/`). This plan documents the decomposition, the cross-cutting
decisions above, and the merge/verification checklist.

## Architecture

This plan creates no source files directly. Each sub-plan creates its own files
and ships its own tests across the three layers (`db/tests/` pgTAP for the
schema/RLS/RPC work in 2001/2004/2005; `web/src/**/*.test.ts` Vitest and
`web/e2e/` Playwright for the UI work in 2002/2003/2004). The cross-cutting
touch-points each sub-plan will work against:

- **`db/migrations/`** — a new migration adds `profiles.username`, the
  `lower(username)` unique index, the char CHECK, and the `set_username` RPC;
  later migrations replace `add_circle_by_email` / the e-mail branch of
  `send_invitation` with username-keyed forms and add the migration backfill.
- **`web/src/lib/auth/`** — `auth-client.ts`, `LoginRequest.svelte`,
  `LoginCheck.svelte`, the callback route, and `session.svelte.ts` (`AuthUser`
  gains `username`, loses the e-mail-as-identity assumption).
- **`web/src/lib/invite/` and `web/src/lib/privacy/`** — `InvitePickerSheet`
  and `CircleScreen` swap e-mail fields for username fields; the profile sheet,
  members screen, and vote attribution render `@username`.
- **`docs/`** — Phase 0 reconciliation of `architecture.md`, `data-model.md`,
  `invites.md`, `circles.md`, `open-questions.md` (R12).

### New plan directories (created by this plan's tasks)

- **`plans/2001_username_identity_db/`** — Phase-0 doc reconciliation, the
  GoTrue-mechanism spike, `profiles.username` + case-fold uniqueness +
  `set_username` RPC + recovery-e-mail home, pgTAP.
- **`plans/2002_username_auth_ui/`** — registration + sign-in screens
  (username + password), `session` carries username, auth-client password
  register/sign-in, retire the magic-link request/check/callback as the primary
  path.
- **`plans/2003_password_recovery/`** — "forgot password" request + reset
  screens, recovery-e-mail capture in settings, send/reset wiring.
- **`plans/2004_add_by_username/`** — username-keyed invite/circle RPCs and UI,
  `@username` disambiguation across profile/members/votes/attribution.
- **`plans/2005_alpha_migration/`** — backfill usernames from display names,
  initial-password path for existing users, remove the e-mail sign-in surface.

### Branches

```
main
 └─ 2000_username_identity            ← this plan's branch (base for sub-steps)
     ├─ 2001_username_identity_db     ← merges back into 2000_username_identity
     ├─ 2002_username_auth_ui         ← merges back
     ├─ 2003_password_recovery        ← merges back
     ├─ 2004_add_by_username          ← merges back
     └─ 2005_alpha_migration          ← merges back (prod-facing; last)
```

## Phase structure

Sub-step order is load-bearing — each later sub-step builds on the surface the
earlier ones establish.

1. **Phase 1 — 2001: identity model + doc reconciliation.** Must land first:
   it reconciles the docs (R12) so the rest reference a correct spec, decides
   the GoTrue mechanism (spike), and adds the `username` column, case-fold
   uniqueness, and `set_username` RPC that everything else depends on. pgTAP
   (positive + negative) for uniqueness, case-folding, the char constraint, and
   mutability.
2. **Phase 2 — 2002: registration + sign-in UI.** Builds on 2001's schema and
   mechanism. New screens, `session` carries username, password register/
   sign-in in the auth client. The old magic-link path stays reachable only as
   far as 2005 needs it for migration.
3. **Phase 3 — 2003: password recovery.** Builds on 2001 (recovery-e-mail home)
   and 2002 (sign-in to return to). Includes verifying the recovery e-mail on
   set/change (R13) before it can back a reset. Can proceed in parallel with
   2004 once 2002 is in.
4. **Phase 4 — 2004: add-by-username + disambiguation.** Builds on 2001's
   username column. Swaps the invite/circle RPCs and screens, adds `@username`
   rendering. pgTAP for the new RPCs (positive + negative, preserving the
   block / invite-policy / self-invite checks).
5. **Phase 5 — 2005: migrate the alpha + retire e-mail login.** Last, and the
   only prod-facing sub-step: backfill usernames, give existing users an
   initial-password path, then remove the e-mail sign-in surface. After it
   merges, tick the step-20 box in `plans/0000_implementation_order.md` and
   merge `2000_username_identity` to `main` with `--no-ff`.

Each sub-plan puts its RED (failing tests) before GREEN (implementation) per
`docs/testing.md`; the orchestration tasks below only sequence the sub-branches.

## Reference docs and skills

- **`.claude/commands/write-plan.md`** — how to create each sub-plan directory
  (branch, number, slug, three files); the orchestration numbering convention.
- **`plans/0400_mvp_product/`** — the worked orchestration-plan example this
  one mirrors (sub-branches cut from the orchestration branch, merged with
  `--no-ff`).
- **`docs/architecture.md`** — the "Authentication" section and "Considered and
  rejected" entries that R12/Phase 0 reverses; the cookie-shim contract that
  survives unchanged.
- **`docs/data-model.md`** — `profiles` / `user_settings` split; where
  `username` and the recovery e-mail belong; the `set_username` RPC shape.
- **`docs/invites.md`** — the block / invite-policy / self-invite checks that
  must survive the e-mail→username swap; the e-mail privacy contract.
- **`docs/testing.md`** — the three test layers each sub-plan ships against.

## Open questions

- **GoTrue mechanism (synthetic e-mail vs. server-side resolver).** Decided by
  the 2001 spike. Default: synthetic deterministic e-mail derived from the
  username, with the real recovery e-mail stored separately. Documented in the
  Decisions section above.
- **Does registration stay invite-only, and how is the first account created
  under username+password?** Cairn is invite-only per `docs/invites.md`, and
  magic-link signup currently creates the account on first link click. 2001/2002
  settle how an invited person bootstraps a username+password account. Default:
  preserve the current join model, swapping only the credential.
- **Recovery e-mail storage location.** `user_settings.recovery_email` (private,
  owner-only) is the leaning home; confirm against `docs/data-model.md`'s
  `profiles`/`user_settings` split in 2001.
- **Accounts with no recovery e-mail that forget their password.** No
  self-serve path exists by design (R9). Default: operator reset via an admin
  RPC (`docs/admin.md`); confirm whether step 20 adds one or defers it.
- **Whether to keep the magic-link callback route as dead code post-migration.**
  Default: remove it in 2005 with the rest of the e-mail sign-in surface.
