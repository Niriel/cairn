# Requirements: Admin tools (schema, audit table, RPCs, CLI)

Cairn is a live alpha but the operator has no banhammer and no audit trail.
This work builds the entire admin surface — an `admin` Postgres schema
PostgREST cannot see, an `admin.actions` audit table, eight `security definer`
RPCs, and an SSH-only operator CLI — so the operator can ban / unban /
moderate / purge / inspect / erase from the VPS, with every destructive action
recorded. Admin is a runbook, not a feature: there are **no web-app changes**.
Implements step 11 of `plans/0000_implementation_order.md`; the design is
specified in `docs/admin.md`.

## R1. The `admin` schema is structurally unreachable from PostgREST

All admin objects (the audit table and every RPC) live in a schema named
`admin`. `PGRST_DB_SCHEMAS` stays `public` (no `admin`) in every environment,
so PostgREST exposes none of it. This structural unreachability is the
*primary* defence; the per-role grants in R2 are the secondary defence. A
`GET`/`POST` to PostgREST for any admin RPC (e.g. `…/rpc/ban_user`) must 404.

## R2. Three non-login roles enforce least privilege

The migration creates three `NOLOGIN` roles:

- `cairn_admin_owner` — owns the `admin` schema, the `admin.actions` table, and
  every admin RPC. The `security definer` RPCs execute with its privileges. It
  is `BYPASSRLS` (the RPCs run with no JWT, so `public.uid()` is `NULL` and
  every `public.*` RLS policy would otherwise deny their reads/writes) and
  holds exactly the table privileges the RPC bodies exercise: `SELECT,
  UPDATE (banned_until), DELETE` on `auth.users`; `SELECT, UPDATE, DELETE` on
  `public.items` and `public.lists`; `SELECT` on `public.list_members`,
  `public.profiles`, `public.user_settings`, `public.votes`.
- `cairn_admin` — the membership marker operators' personal login roles are
  granted. Holds `USAGE` on schema `admin` and `EXECUTE` on the seven write
  RPCs; `cairn_readonly` is granted to it (admin implies readonly).
- `cairn_readonly` — `USAGE` on schema `admin`, `EXECUTE` on `inspect_user`,
  and `SELECT` on `admin.actions`; nothing else. The `USAGE` grant is
  load-bearing: without it a standalone read-only operator (one whose login
  role is granted only `cairn_readonly`) could not reach `inspect_user` or
  `admin.actions` at all, since `USAGE` on the schema is a prerequisite for
  every object privilege inside it. `cairn_admin` reaches the same objects via
  its own `USAGE` grant plus inheritance of `cairn_readonly`.

`authenticated` and `anon` have **no** `USAGE` on schema `admin`, **no**
`EXECUTE` on any admin RPC, and **no** `SELECT` on `admin.actions`. Both the
positive grants and these negative ones are pgTAP-asserted — and the `EXECUTE`
negative is asserted for **each** of the eight RPCs (not a single representative
one), paired with the positive `EXECUTE` grants (`cairn_admin` on the seven
write RPCs, `cairn_readonly` on `inspect_user`) and the `cairn_readonly`
schema-`USAGE` positive.

## R3. `admin.actions` is an append-only audit table with a required reason

```sql
admin.actions (
  id          uuid primary key default gen_random_uuid(),
  actor       text not null,        -- session_user: the operator's login role
  effective   text not null,        -- current_user inside the RPC
  action      text not null,        -- 'ban_user', 'moderate_item', …
  target      uuid,                 -- affected user/item/list, when applicable
  reason      text not null check (length(reason) between 1 and 2000),
  payload     jsonb,                -- pre-state snapshot
  created_at  timestamptz not null default clock_timestamp()
)
```

Row-level security is **not** enabled on `admin.actions`. `cairn_readonly`
has `SELECT`; `authenticated`/`anon`/`public` have nothing — and neither has
`USAGE` on schema `admin`, so the table is unreachable from PostgREST without
RLS. Enabling RLS here would be a footgun, not a defence: with no policy it
default-denies, so `cairn_readonly`'s `SELECT` would return **zero rows**,
silently breaking `cairn-admin log` and the CLI's read-back-the-audit-row
step (in production the operator connects as a non-superuser role, so RLS is
not bypassed). The read restriction is the `SELECT`-only grant; the
append-only property is enforced by granting **no** `UPDATE`/`DELETE` to any
operator role — the table is corrected by appending, never editing. The
`reason` CHECK is the load-bearing wall: a write with an empty (or
>2000-char) reason is rejected at the database regardless of caller. A pgTAP
test must read `admin.actions` **as `cairn_readonly`** (not as the test
superuser) so the zero-rows regression cannot ship green.

## R4. Every destructive RPC requires a non-empty reason and logs atomically

The seven write RPCs each take `p_reason text` as a required argument and, in
the **same transaction** and **before** the destructive statement, insert one
row into `admin.actions` with `actor = session_user`, `effective =
current_user`, the action name, the target, the reason, and a pre-state
`payload`. Either both the audit row and the action commit, or neither does. A
guard failure that aborts before the insert (see R6) leaves no audit row.

`effective` records `current_user`, which under `security definer` execution
is the function owner `cairn_admin_owner` (not the caller's `SET ROLE` value —
`current_user` inside a definer function is always the owner). The sanity
check this supports: writes always run as the admin owner; any other value
means an unexpected execution path. (This corrects `docs/admin.md`, which
claimed `effective` "should always be `cairn_admin`".)

## R5. The eight RPCs behave as specified in `docs/admin.md`

- `ban_user(target, reason)` → sets `auth.users.banned_until = 'infinity'`;
  `payload` snapshots the prior `banned_until`.
- `unban_user(target, reason)` → sets `banned_until = NULL`; `payload`
  snapshots the prior value.
- `delete_account_as(target, reason)` → **identical end-state to the
  user-initiated `public.delete_account()`** (`db/migrations/0014`): hard-delete
  lists where the target was the only remaining live member (computed *before*
  the auth delete), then `DELETE FROM auth.users` so personal data cascades and
  attribution repoints to the tombstone. `payload` records only
  `email_at_time` (not the full account — the audit log is not a recovery
  channel for just-erased personal data). **To make "identical" literal, the
  sole-member list-deletion query is `delete_account()`'s exact
  `NOT EXISTS (live member <> target)` form (substituting `p_target` for
  `uid`), not the doc's `EXISTS (target is a member) AND NOT EXISTS (other live
  member)` variant** — the two diverge on an orphaned list (zero live members,
  reachable once the last member soft-deletes their `list_members` row), which
  `delete_account()` sweeps up but the scoped form leaves behind. Mirroring the
  shipped query verbatim is the only way the end-states match in *all* cases,
  not just the tested ones.
- `moderate_item(target, reason)` → soft-delete the item
  (`deleted_at = clock_timestamp()`, `deleted_by` = tombstone); recoverable by
  list members through `items_deleted` + the trash UI. `payload` = the row
  before soft-delete. **`deleted_by` cannot be set directly in the `UPDATE`:**
  the `BEFORE UPDATE` attribution trigger (`tg_set_attribution_items`) derives
  `deleted_by` from `public.uid()` on the live→deleted transition, and an admin
  RPC carries no JWT, so a directly-set value is overwritten with NULL. The RPC
  therefore sets `request.jwt.claims` to the tombstone `sub` before the `UPDATE`
  (`perform set_config('request.jwt.claims', …, true)`) and lets the trigger
  stamp the tombstone through the normal path. `moderate_list` does the same.
- `purge_item(target, reason)` → hard-delete the item; votes cascade.
  `payload` = the row snapshot (the only remaining record it existed).
- `moderate_list(target, reason)` → soft-delete the list; recoverable via
  `lists_deleted`. `purge_list(target, reason)` → hard-delete the list;
  cascades through `items`, `votes`, `list_members`, `invitations`.
- `inspect_user(target)` → `stable`, **no reason, no audit row**; returns one
  JSONB document (`auth` minus credential/recovery columns, `profile`,
  `user_settings`, `memberships`, `item_count`, `vote_count`). The only RPC
  granted to `cairn_readonly` rather than `cairn_admin`.

## R6. The tombstone and non-existent targets are rejected

`ban_user`, `delete_account_as` (and by extension the CLI) raise on
`p_target = '00000000-0000-0000-0000-000000000000'` ("cannot … the tombstone
user") and on a `p_target` that resolves to no `auth.users` row ("no such
user"). These guards run before the audit insert, so a rejected call writes no
audit row (R4).

## R7. `inspect_user` never exposes credential or recovery secrets

The `auth` sub-document is built from an explicit **allowlist** of non-secret
columns (`id`, `email`, `email_confirmed_at`, `last_sign_in_at`, `banned_until`,
`created_at`), **not** a `to_jsonb(u)` with known secrets subtracted. A denylist
is the wrong shape: GoTrue's `auth.users` carries more credential/recovery
tokens than the obvious four (`encrypted_password`, `recovery_token`,
`confirmation_token`, `email_change_token_new`, **and also**
`email_change_token_current`, `reauthentication_token`, `phone_change_token`,
…), and every image bump that adds one would silently re-leak it. Since
`cairn_readonly` has no direct `SELECT` on `auth.users`, `inspect_user` is the
*only* path that role has to auth data, so a leak there is a leak to a role that
must inspect without seeing credentials. Building the document from a safe set
means a new GoTrue column is excluded by default. The function is `stable` and
writes no audit row — read-only inspection must stay cheap enough that the
operator never skips it.

**The secret-stripping must be tested non-vacuously.** Asserting "key X is
absent" against the current bootstrap stub (`id, email, created_at` only) passes
even if every strip were removed, because the columns were never present. The
test must therefore exercise a stub that *contains* the secret columns seeded
with sentinel values, and assert both that those keys are **absent** from the
`auth` sub-document and that an allowed non-secret column (e.g. `email`) is
**present** — so the assertion can actually fail if the allowlist regresses.

## R8. The `cairn-admin` CLI is a bash psql-wrapper with guard rails

A bash script at `scripts/cairn-admin` (no extension), `set -euo pipefail`,
following the `scripts/list-users.sh` pattern. Subcommands:

```
cairn-admin inspect <email>
cairn-admin ban     <email> --reason "..."
cairn-admin unban   <email> --reason "..."
cairn-admin delete  <email> --reason "..."
cairn-admin item    moderate|purge <uuid> --reason "..."
cairn-admin list    moderate|purge <uuid> --reason "..."
cairn-admin log     [--actor <login>] [--since <interval>] [--target <uuid>]
```

It: resolves emails to UUIDs via `SELECT id FROM auth.users WHERE
lower(email)=lower(:'email')`; sources connection vars + `CAIRN_ADMIN_EMAIL`
from `~/.cairn-admin.env`; issues `SET ROLE cairn_admin;` before invoking any
RPC; refuses any destructive subcommand without `--reason` or with a reason
shorter than 8 characters (a fast pre-check — the DB CHECK in R3 is the real
wall); passes `reason`/`target` as libpq `-v` variables (`:'reason'`) so reason
text cannot inject SQL; prints the affected pre-state (from the just-written
`admin.actions.payload`), the deterministic post-condition, and the generated
`admin.actions.id`.

## R9. Self-target destructive actions require a verbatim confirmation

When a destructive subcommand's resolved target email equals
`CAIRN_ADMIN_EMAIL`, the CLI requires a literal typed string (`DELETE MY OWN
ACCOUNT` / `BAN MY OWN ACCOUNT`) before proceeding; other targets get a `[y/N]`
prompt. The verbatim-string guard applies to the two account-destructive,
email-targeted subcommands — `delete` and `ban` — only: `unban` is not
destructive, so self-targeting it falls through to the normal `[y/N]`; and
`item`/`list` take UUID targets that can never equal `CAIRN_ADMIN_EMAIL`, so
they have no self-target concept at all. This guard lives at the CLI, not the
database (the database has no operator-to-Cairn-account mapping, and
self-deletion is a legitimate way to test the erasure path — see
`docs/admin.md` § "Self-target confirmation"). The audit row is written either
way.

## R10. The CLI is covered by the existing shell lint gauntlet

`scripts/cairn-admin` has no `.sh` extension, so the existing globs miss it
*unevenly* — and the fix differs per tool:

- **`scripts/check.sh` shellcheck** (`shellcheck scripts/*.sh`) — a literal glob;
  **misses** `cairn-admin`. Add the path explicitly.
- **`scripts/check.sh` shfmt** (`shfmt -d -i 2 -ci -bn scripts/`) — a *directory*
  walk, which shfmt resolves by shebang and **already covers** the
  extension-less `cairn-admin` (it has `#!/usr/bin/env bash`). No change strictly
  needed; an explicit path is harmless redundancy.
- **`lefthook.yml`** — both the `shellcheck` and `shfmt` pre-commit commands use
  `glob: 'scripts/**/*.sh'`, a literal glob that **misses** `cairn-admin`. Add
  dedicated commands with `glob: 'scripts/cairn-admin'`.

After these edits the repo's first extension-less script is not an unlinted hole.

## Non-requirements (explicitly excluded)

- **An admin UI / admin web app / JWT admin claim.** Rejected in `docs/admin.md`
  § "Why no admin UI"; admin is operator-over-SSH only.
- **A Python CLI.** The production VPS has no Python; a runtime would be a heavy
  dependency just to run one script. Bash is already present and linted. This
  reverses the "Python" wording in `docs/admin.md` and the step-11 master-plan
  line (Phase 0 doc fix).
- **A DB-level guard against self-ban / self-delete.** Deliberately a CLI
  concern only (R9); a DB guard needs an operator-mapping table that rots and
  blocks the legitimate erasure-path test. See `docs/admin.md` § "What admin
  must not do".
- **Avatar-file cleanup in `delete_account_as`.** The RPC stays a pure DB
  transaction; the avatar file is removed by the operator's separate
  `curl -X DELETE …` step or the nightly orphan-sweep (`docs/avatars.md`).
- **Operator login-role provisioning.** Creating each operator's personal
  Postgres login role and granting it `cairn_admin` is a deployment step
  (documented, out of band), not part of this migration, which creates only the
  non-login `cairn_admin*` roles.
- **Immediate session kill on ban.** A banned user's existing JWT remains valid
  until expiry (≤1h, `GOTRUE_JWT_EXP`); hard expiry is a v2 problem
  (`docs/admin.md` § "Existing sessions").
- **Bash unit tests / a new test harness.** No bash test framework exists in
  the repo (`migrate.sh` et al. are untested); the CLI's guards are verified
  manually and its real defence (the `reason` CHECK and role grants) is
  pgTAP-covered.
