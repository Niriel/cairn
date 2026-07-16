# Plan: Admin tools (schema, audit table, RPCs, CLI)

Build Cairn's operator admin surface — a PostgREST-invisible `admin` schema,
an `admin.actions` audit table, eight `security definer` RPCs, and an SSH-only
bash CLI — so the live alpha has a banhammer and an audit trail from day one.
Implements step 11 of `plans/0000_implementation_order.md`.

## Context

Cairn runs as a live alpha at `https://cairn.lynnscape.eu` (single Hetzner VPS,
Docker Compose, Postgres as the authorization root). Authorization is
concentrated in RLS policies in `public.*`; PostgREST connects as a
low-privilege `authenticated` role with no bypass paths. Today the operator has
no sanctioned way to ban a bad actor, act on a GDPR erasure request, take down
a complained-about item, or inspect a stuck account — and no audit trail if
they did.

`docs/admin.md` specifies the whole design in detail, down to RPC bodies. The
headline rule is _admin is a runbook, not a feature_: no admin UI, no admin JWT
claim, no admin bundle on user devices. Admin work happens from psql on the VPS
through `security definer` RPCs in a separate `admin` schema PostgREST cannot
see, with required reasons logged to `admin.actions`. One trust boundary (SSH),
one authorization mechanism (Postgres role membership), one audit trail.

This plan grounds that spec in the real codebase. The user-initiated deletion
path already shipped in step 10 (`db/migrations/0014_delete_account.sql`); the
admin erasure RPC mirrors it exactly. The pgTAP harness, fixtures, and the
`auth.users` stub already exist. The migration slots in after the highest
current migration (`0016`) as `0017_admin.sql`. There are no web-app changes.

Seven things in `docs/admin.md` are wrong or under-specified and are reconciled
in Phase 0 before any code lands (Cairn's docs are canonical for downstream
steps; a silent divergence compounds).

## Decisions

**The CLI is bash, not Python (reverses the doc).** `docs/admin.md` and the
step-11 master-plan line both say "Python". The clinching reason against it is
operational: the CLI runs _on the VPS over SSH_, and the VPS has **no Python
installed** — a Python CLI would force a runtime onto the production box just
to run one admin script. Bash is already there, matches every existing operator
script (`scripts/list-users.sh` is the same `… exec … psql` wrapper shape), and
rides the existing ShellCheck + shfmt gauntlet, avoiding the repo's first
Python toolchain (ruff/CI). The doc itself calls the CLI "authorization theatre
at the OS layer … could be replaced by typing the same `SET ROLE` and `SELECT`
lines into psql by hand", so nothing of value is lost. The only cost is that
two-level subcommand dispatch (`item moderate <uuid>`) is clunkier than
`argparse` — handled with a `case` dispatch. (R8; Phase 0 doc fix.)

**`effective` records `cairn_admin_owner`, not `cairn_admin` (corrects the
doc).** `docs/admin.md` says the `effective` audit column "should always be
`cairn_admin`." That is impossible: inside a `security definer` function,
`current_user` is the function _owner_, never the caller's `SET ROLE` value.
The faithful implementation records `cairn_admin_owner`; the sanity check still
holds — writes always run as the admin owner, and any other value flags an
unexpected path. There is no built-in to recover the caller's `SET ROLE` role
from inside a definer function, and `actor = session_user` already captures the
operator's login identity (which `SET ROLE` and `security definer` both leave
untouched). (R4; Phase 0 doc fix; tests assert `effective = 'cairn_admin_owner'`.)

**`cairn_admin_owner` is `BYPASSRLS` with explicit public-table grants (the doc
under-specifies).** The doc spells out only the `auth.users` grants. But the
moderation/erasure RPCs read and write `public.items`/`public.lists` while
running with no JWT — `public.uid()` is `NULL`, so every `public.*` RLS policy
denies them. The dedicated, non-login owner role therefore needs `BYPASSRLS`
_and_ the specific table grants the RPC bodies exercise (R2). Putting
`BYPASSRLS` on the isolated owner — rather than adding `or is_admin()` to every
public policy — is exactly the bet `docs/admin.md` § "Why no admin UI" makes:
the admin story lives at a layer the user-facing policies never learn about.
(R2; Phase 0 doc fix adds a sentence to the roles section.)

**RPCs return `void`; the CLI reads pre-state back from the audit row.** Keeping
the doc's `returns void` signatures (rather than returning the new
`admin.actions.id`) means the operator's personal role needs _no_ direct grants
on the target tables: the destructive RPCs already snapshot pre-state into
`payload`, which `cairn_readonly` can `SELECT`. The CLI prints pre-state from
`payload`, the deterministic post-condition from the action's semantics, and
the `admin.actions.id` it reads back in the same transaction. (R5, R8.)

**`delete_account_as` is a structural mirror of `delete_account()`.** It copies
the body of `db/migrations/0014_delete_account.sql:36-72` verbatim except: the
target is an argument instead of `public.uid()`; the tombstone/`no such user`
guards raise the doc's messages; and it logs `email_at_time` to `payload`. The
load-bearing ordering is preserved — the sole-member list hard-delete is
computed _before_ `DELETE FROM auth.users`, because the auth delete cascades
the `list_members` rows the query reads. **The sole-member query is
`delete_account()`'s exact `NOT EXISTS (live member <> target)` form, not the
doc's `EXISTS (target is a member) AND NOT EXISTS (other live member)` variant**
— the two diverge on an orphaned list (zero live members), so only the verbatim
form makes "identical end-state" literally true. `docs/admin.md`'s
`delete_account_as` body is corrected to drop the `EXISTS` clause (Phase 0 doc
fix). A pgTAP test asserts the two paths produce identical end-state (R5).

**`inspect_user` uses a column allowlist, not a secret denylist (corrects the
doc).** `docs/admin.md` built the `auth` sub-document as `to_jsonb(u)` minus
four named secrets. GoTrue's `auth.users` carries more credential/recovery
tokens than those four (`email_change_token_current`, `reauthentication_token`,
`phone_change_token`, …), and a denylist silently re-leaks every column a future
image adds. Since `cairn_readonly` has no other path to `auth.users`, that is a
leak to the very role meant to inspect _without_ seeing credentials. The
faithful implementation builds `auth` from an explicit safe set (`id`, `email`,
`email_confirmed_at`, `last_sign_in_at`, `banned_until`, `created_at`), so new
columns are excluded by default. The test seeds sentinel secret values into a
widened stub and asserts they're absent while `email` is present — otherwise the
assertion is vacuous against the bare stub. (R7; Phase 0 doc fix.)

**`admin.actions` has no RLS — grants are the boundary (corrects the doc).**
`docs/admin.md`'s body enabled row-level security on `admin.actions` with no
policies, while its own prose bullet says "No RLS." The SQL is the bug:
enabling RLS with no policy default-denies, so `cairn_readonly`'s `SELECT`
returns **zero rows** — `cairn-admin log` and the CLI's read-back-the-audit-row
step both come back empty in production (the operator connects as a
non-superuser role, so RLS is not bypassed; dev/test masks it because
everything runs as the `cairn` superuser). The fix is to _not_ enable RLS: the
table is already unreachable from PostgREST (no `USAGE` on schema `admin` for
`authenticated`/`anon`), reads are restricted by the `SELECT`-only grant to
`cairn_readonly`, and append-only is enforced by withholding `UPDATE`/`DELETE`.
A pgTAP test reads the table **as `cairn_readonly`** so the zero-rows
regression can't ship green. (R3; Phase 0 doc fix.)

**`moderate_*` sets the request claim to the tombstone, not `deleted_by`
directly (corrects the doc).** The doc's `moderate_item`/`moderate_list`
bodies do `UPDATE … SET deleted_at = clock_timestamp(), deleted_by =
'0000…'`. But the `BEFORE UPDATE` attribution trigger
(`tg_set_attribution_items`/`_lists`, `0004_domain_schema.sql:369-370`)
intercepts the live→deleted transition and hard-sets `deleted_by :=
public.uid()` — which, with no JWT in an admin RPC, is NULL. The directly-set
tombstone is discarded, contradicting R5, the doc's "attributed to the
tombstone," and the `ui.md` "Deleted by Deleted user" rendering. The faithful
implementation sets `request.jwt.claims` to the tombstone `sub` via
`set_config(…, true)` before the `UPDATE`, so the trigger stamps the tombstone
through the normal attribution path (the `deleted_by =` clause is dropped). The
`delete_account_as` hard-delete path is unaffected — it does no soft-delete
UPDATE. (R5; Phase 0 doc fix; Task 3.2.)

**Extend the test bootstrap's `auth.users` stub.** `db/test-bootstrap.sql`
stubs `auth.users` with only `id, email, created_at`, and carries an explicit
RULE (`:16-19`) that any migration referencing a new `auth.users` column must
extend the stub. The ban RPCs reference `banned_until` and the migration grants
`UPDATE (banned_until)`, so the stub gains `banned_until timestamptz` — without
it, `0017` fails to apply against `cairn_test`. The stub also gains the columns
`inspect_user`'s allowlist reads (`email_confirmed_at`, `last_sign_in_at`
timestamptz) **and** the credential/token columns the secret-stripping test
seeds with sentinels (`encrypted_password`, `recovery_token`,
`confirmation_token`, `email_change_token_new`, `email_change_token_current`,
`reauthentication_token`, `phone_change_token` — all `text`): without those, the
"secret keys are absent" assertion is vacuous because the columns never existed
(R7). (The `cairn_admin*` roles need no bootstrap entry: the migration creates
them and `scripts/test-db.sh` applies all migrations before `pg_prove`.)

## Architecture

### New files

- **`db/migrations/0017_admin.sql`** — the `admin` schema, three roles, the
  `admin.actions` table, and all eight RPCs with their grants. Single
  `BEGIN; … COMMIT;`.
- **`scripts/cairn-admin`** — bash operator CLI (no `.sh` extension).
- **`db/tests/admin_grants.sql`** — structural + per-role grant matrix (R1, R2).
- **`db/tests/admin_actions_audit.sql`** — reason CHECK, atomic logging,
  guard-failure-writes-nothing (R3, R4, R6).
- **`db/tests/admin_ban.sql`** — `ban_user`/`unban_user` (R5, R6).
- **`db/tests/admin_delete_account_as.sql`** — same-end-state-as-`delete_account()`
  (R5, R6).
- **`db/tests/admin_moderate_purge.sql`** — item/list moderate + purge,
  soft-delete visibility via `*_deleted` views, cascades (R5).
- **`db/tests/admin_inspect.sql`** — JSON shape, secret-stripping, no audit row
  (R5, R7).

### Modified files

- **`db/test-bootstrap.sql`** — add `banned_until timestamptz`, the
  `inspect_user` allowlist columns (`email_confirmed_at`, `last_sign_in_at`),
  and the credential/token columns the secret-stripping test seeds
  (`encrypted_password`, `recovery_token`, `confirmation_token`,
  `email_change_token_new`, `email_change_token_current`,
  `reauthentication_token`, `phone_change_token`) to the stub `auth.users`;
  update the column-checklist comment.
- **`scripts/check.sh`** — lint `scripts/cairn-admin` (shellcheck + shfmt).
- **`lefthook.yml`** — pre-commit shellcheck/shfmt entries for
  `scripts/cairn-admin`.
- **`docs/admin.md`** — Phase 0 doc fixes (CLI → bash; `effective` value;
  `cairn_admin_owner` BYPASSRLS + public-table grants; `inspect_user` column
  allowlist; `delete_account_as` body's verbatim `NOT EXISTS` list-deletion
  form; **remove the `enable row level security` on `admin.actions`**;
  **`moderate_*` set the request claim to the tombstone before the UPDATE**).
- **`plans/0000_implementation_order.md`** — Phase 0: step-11 `0006_admin.sql`
  → `0017_admin.sql`, "(Python; …)" → "(bash; …)". (Box ticked at merge.)

### Role / privilege graph

```
operator login role  --(GRANT cairn_admin, ideally WITH INHERIT FALSE)-->  cairn_admin
cairn_admin          --(GRANT cairn_readonly)-->  cairn_readonly
                     --(USAGE admin; EXECUTE 7 write RPCs)
cairn_readonly       --(USAGE admin; EXECUTE inspect_user; SELECT admin.actions)
cairn_admin_owner    NOLOGIN BYPASSRLS; owns admin schema/table/RPCs;
                     SELECT/UPDATE(banned_until)/DELETE auth.users;
                     SELECT/UPDATE/DELETE public.items, public.lists;
                     SELECT public.list_members/profiles/user_settings/votes
authenticated, anon  --(nothing on admin: no USAGE, no EXECUTE, no SELECT)
```

The two escalations: operator → `cairn_admin` is the human-visible `SET ROLE`
(shows in `pg_stat_activity`); `cairn_admin` → `cairn_admin_owner` is the
`security definer` clause (in-database, invisible to the operator).

## Phase structure

TDD ordering: within each DB phase, the pgTAP test (RED) is written and run-red
before the migration change that greens it; both live in the same task (a
commit boundary). The migration is built incrementally across tasks but is one
file — later tasks append to `0017_admin.sql`.

0. **Phase 0 — reconcile docs.** Apply the seven doc fixes to `docs/admin.md`
   (CLI→bash; `effective` value; `cairn_admin_owner` BYPASSRLS + public-table
   grants; `inspect_user` allowlist; the `delete_account_as` body's verbatim
   `NOT EXISTS` list-deletion form; **remove `enable row level security` on
   `admin.actions`**; **`moderate_*` set the request claim to the tombstone
   before the UPDATE**) and the master-plan line _before_ code, so downstream
   steps don't reference a stale spec. (Decisions above; R4, R2, R8, R7, R5,
   R3.)
1. **Phase 1 — schema, roles, audit table.** Extend the bootstrap stub; create
   the `admin` schema, the three roles, the grants, and `admin.actions` with its
   RLS + grants. Tests: the grant matrix (R1, R2) and the reason CHECK +
   append-only posture (R3).
2. **Phase 2 — ban / unban / inspect.** The non-cascading RPCs.
   `ban_user`/`unban_user` (R5, R6) and `inspect_user` (R5, R7), each with its
   pgTAP file, including the `authenticated → 42501` negative and the
   guard-failure-writes-no-audit-row case (R4, R6).
3. **Phase 3 — delete / moderate / purge.** The cascading RPCs.
   `delete_account_as` with the same-end-state-as-`delete_account()` assertion
   (R5), and `moderate_item`/`purge_item`/`moderate_list`/`purge_list` with
   soft-delete-visibility and cascade checks (R5).
4. **Phase 4 — the `cairn-admin` bash CLI.** The script (R8, R9), plus the
   `scripts/check.sh` + `lefthook.yml` lint wiring (R10). Verified manually
   against the dev stack.

## Reference docs and skills

- **`docs/admin.md`** — the canonical design; RPC bodies, role rationale, CLI
  shape, operator workflow, the "what admin must not do" rules.
- **`docs/account-deletion.md`** — the `delete_account()` semantics
  `delete_account_as` mirrors; tombstone + FK `on delete set default` model.
- **`docs/data-model.md`** — schema, RLS, the `*_deleted` views, `is_list_member`.
- **`docs/testing.md`** — three test layers; why pgTAP is load-bearing for RLS.
- **`docs/quality.md`** — ShellCheck/shfmt/SQLFluff config the new files must pass.
- **`db/migrations/0014_delete_account.sql`** — verbatim source for `delete_account_as`.
- **`scripts/list-users.sh`** — the bash psql-wrapper pattern the CLI follows.
- **`db/tests/rpc_delete_account.sql`, `grants.sql`** — the pgTAP patterns
  (role-switch, `throws_ok`, grant-matrix) the admin tests reuse.

## Open questions

- **Operator login-role provisioning on the VPS** (personal role + `GRANT
cairn_admin`, ideally `WITH INHERIT FALSE`). Out of scope for this plan
  (deployment step); default — capture it as a follow-up note in
  `docs/deployment.md` when the CLI is first used in prod. Local verification
  connects as the `cairn` superuser, which can `SET ROLE cairn_admin` directly.

## Production precondition

`0017_admin.sql` must be applied **by a superuser**: it creates a `BYPASSRLS`
role (only a superuser may set that attribute) and `GRANT`s on `auth.users`
(owned by the `gotrue` role, not us). Dev and test apply migrations as the
`cairn` role, which is a superuser (it `DROP`/`CREATE`s databases in
`scripts/test-db.sh`), so both succeed. Confirm the production migration role is
likewise a superuser before applying `0017`; if it isn't, the migration aborts
on the `CREATE ROLE … BYPASSRLS` or the `auth.users` grant. (Surfaced by the
`/concerns` audit; almost certainly already true, but load-bearing for the live
box.)
