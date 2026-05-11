# Requirements: DB foundation (Tier 1+2 schema, RLS, triggers)

Replace the walking-skeleton's smoke `public.profiles` table
(`db/migrations/0001_init.sql:50`) with the real Tier 1+2 schema from
`docs/data-model.md`: profiles, user_settings, lists, list_members,
items, votes; the helpers and views; all triggers; all RLS policies;
and the tombstone-user / `ON DELETE SET DEFAULT` FK semantics from
`docs/account-deletion.md` (so we never ALTER FKs in step 8). Tier 3
(`relationships`, `invitations`) is deferred to step 6. Every later
step depends on this — auth/HTTP (step 3) needs real `profiles`; MVP
(step 4) needs lists/items/votes; soft-delete UX (step 5) needs the
trash views; account deletion (step 8) needs the FK semantics
pre-baked.

## R1. Single transactional migration

The schema lands as one migration `db/migrations/0004_domain_schema.sql`,
top-to-bottom, wrapped in `BEGIN; … COMMIT;`. Applied exactly once via
the `_migrations` ledger; mid-migration failure rolls back cleanly.
Re-applying after a manual psql edit is **not supported** — recovery is
`docker compose down -v && up -d && migrate && seed` per
`docs/development.md`.

## R2. Identity helper `public.uid()`

`public.uid()` returns the authenticated caller's UUID by reading
`request.jwt.claims.sub` (the per-request JSON GUC PostgREST v10+
sets) and casting to `uuid`. Returns NULL when the GUC is empty.

Lives in `public` (Cairn-owned), not `auth` (GoTrue-owned), so a
future GoTrue release can't clobber it. Body, exactly:

```sql
CREATE FUNCTION public.uid() RETURNS uuid
  LANGUAGE sql STABLE
  SET search_path = public
AS $$
  SELECT (
    (NULLIF(current_setting('request.jwt.claims', true), ''))::jsonb
    ->> 'sub'
  )::uuid;
$$;
```

The parenthesisation is load-bearing: `::` binds tighter than `->>`,
so without the inner parens the cast attaches to `'sub'` instead of
the `jsonb` extraction.

## R3. Tier 1+2 tables match `docs/data-model.md`

Six tables: `profiles`, `user_settings`, `lists`, `list_members`,
`items`, `votes`. Each matches the column order, types, defaults,
constraints, and indexes documented in `docs/data-model.md`. Every
`CREATE TABLE` is immediately followed by `ALTER TABLE … ENABLE ROW
LEVEL SECURITY` (within the same transaction) so there is never a
half-enabled window where a created table sits with RLS off.

Timestamp columns (`created_at`, `modified_at`, `deleted_at`) are the
last columns of every table per the doc's principle. Attribution
columns (`created_by`, `modified_by`, `deleted_by`) sit between
payload and timestamps.

## R4. Privacy split: `profiles` vs `user_settings`

`profiles` is world-readable to `authenticated` (anything in it is
visible to every authenticated user). `user_settings` is owner-only
(`id = public.uid()` on every policy) and ships with no INSERT or
DELETE policy. The split is **structural privacy**, not policy-driven:
fields that must stay private (today: `invite_policy`; tomorrow: any
private-and-follow-the-user field) live in `user_settings` *because of
the table they live in*, not because of policy reasoning.

## R5. Soft-delete model

`lists`, `list_members`, `items` carry `deleted_at` and `deleted_by`.
`votes` are **hard-delete only** — no `deleted_at`, no `deleted_by`,
no `votes_deleted` view (`docs/data-model.md:177`). Soft-deleted rows
are unreachable through base-table queries (the `*_select` policies
filter on `deleted_at IS NULL`); the only read path is the trash views
(R6).

## R6. Three views with deliberately asymmetric `security_invoker`

- `items_ranked` — `WITH (security_invoker = true)`. Inherits the
  caller's RLS, so `items_select`'s `deleted_at IS NULL` filter
  hides soft-deleted items automatically. Defensive `where
  i.deleted_at is null` in the body too.
- `items_deleted`, `lists_deleted` — both `WITH (security_invoker =
  false)`. They run as the view owner (`cairn`, exempt from RLS) so
  they can read soft-deleted rows the policies hide. Each view body
  adds `and public.is_list_member(<list-id>)` to its `WHERE` —
  this is the **only** authorization gate for the trash, and is
  therefore covered by load-bearing negative pgTAP tests
  (non-member sees zero rows; soft-removed member sees zero rows).

The asymmetry is the point: the base tables and live view never expose
soft-deleted content; the trash views explicitly elevate to read it,
with their own membership check as the gate.

## R7. Attribution columns are trigger-derived; client values are ignored

`created_by`, `modified_by`, `deleted_by` are filled by the
`tg_set_attribution_*` BEFORE INSERT/UPDATE triggers from
`public.uid()`. Any client-supplied value for these columns is
overridden — INSERT and UPDATE alike. On INSERT, `deleted_by` is set
unconditionally to NULL (never trust the client; never lean on the
column DEFAULT, which is the tombstone for cascade purposes — see R8).

## R8. `ON DELETE SET DEFAULT` cascade for attribution FKs

The seven attribution FKs (`lists.created_by`, `lists.deleted_by`,
`items.created_by`, `items.modified_by`, `items.deleted_by`,
`list_members.created_by`, `list_members.deleted_by`) all use `ON
DELETE SET DEFAULT` with the column DEFAULT set to the tombstone UUID.
When account deletion (step 8) deletes an `auth.users` row, Postgres
internally fires `UPDATE <table> SET <fk-col> = DEFAULT WHERE
<fk-col> = <deleted-id>`, which executes through the standard
executor and **fires user-defined BEFORE UPDATE triggers normally**.

The attribution triggers must let this transition through. The
`created_by` / `deleted_by` freezes are gated on
`NEW.<col> IS DISTINCT FROM '00000000-…'` — the cascade always sets
NEW to the tombstone, so the gate lets it through; client UPDATEs
sending a non-tombstone value still get reverted.

## R9. `modified_at` cascade-skip

`modified_at` retains its "last content change" value when only
attribution columns change (whether via cascade or direct attribution
PATCH). Implemented by binding `tg_set_modified_at` as `BEFORE UPDATE
OF <non-attribution-cols>` per table, with a per-table `OF (cols)`
list spelled out in PLAN.md. Without this, `modified_at` would be
silently rewritten on every row a deleted user ever touched.

## R10. `items.modified_by` content-aware gate

Stamping rules for `items.modified_by`:

- **INSERT:** trigger sets `modified_by := public.uid()` (override
  client value).
- **UPDATE with content change** (any of `list_id`, `name`, `notes`,
  `deleted_at` differ between OLD and NEW): trigger sets `modified_by
  := public.uid()` — stamps the editor.
- **UPDATE without content change but with direct PATCH of
  `modified_by`:** tombstone-gated freeze restores
  `OLD.modified_by` (anti-spoof; the gate lets the cascade-to-
  tombstone transition pass).
- **UPDATE driven by cascade on a different column** (e.g.
  `items.created_by` cascade leg) and `modified_by` points at a
  non-deleted user: trigger does nothing — `modified_by` stays.

The naive single-gate version fails the
"Bob-edited-Alice's-item, Alice's account is deleted" cascade case;
the content-aware gate is what closes it.

## R11. `tg_profile_on_signup`

`AFTER INSERT ON auth.users` trigger inserts both:

- a `public.profiles` row with `display_name = 'New user'` (fixed
  placeholder; see R17 for why not derived from email);
- a `public.user_settings` row with `invite_policy = 'everybody'`
  written **explicitly** (not relying on the column DEFAULT — see
  PLAN.md Decisions for why explicit is load-bearing).

`SECURITY DEFINER SET search_path = public` because the auth.users
INSERT happens under the `gotrue` role, not `authenticated`, and
neither `profiles` nor `user_settings` has an INSERT policy or
INSERT grant; the cross-schema, cross-table writes need to escalate.
Both inserts use `ON CONFLICT (id) DO NOTHING`. Both are skipped
when `new.id = '00000000-…'` (the tombstone), so the manual
tombstone-profile insert isn't double-handled and the tombstone
deliberately doesn't get a `user_settings` row.

## R12. List creation is RPC-only

`public.create_list(p_name text, p_description text default null)
returns public.lists`, `language plpgsql security definer set
search_path = public`. Body in order: (1) reject if `public.uid() IS
NULL` (errcode `28000`, `'not authenticated'`); (2) reject if
`public.uid() = '00000000-…'` (errcode `28000`, `'cannot act as the
tombstone user'`); (3) insert into `lists`; (4) insert the matching
`list_members(list_id, user_id)` row for the creator; (5) return the
new `lists` row.

This is the **only** sanctioned create path. Direct `POST /lists` and
direct `POST /list_members` are denied at both the GRANT layer
(R15: no INSERT grant) and the policy layer (R14: no INSERT policy).
The `security definer` attribute on `create_list` is what lets the
underlying writes succeed despite the missing grants.

## R13. `list_members` PK is frozen by trigger

`tg_freeze_list_members_pk` raises `'list_members PK columns are
immutable'` when an UPDATE attempts to change `list_id` or `user_id`.
Bound as `t01_freeze_list_members_pk` (BEFORE UPDATE) so it
short-circuits before the timestamp/attribution/modified_at triggers.

This closes the consent-bypass that the
`list_members_update WITH CHECK (… OR user_id = public.uid())`
clause otherwise leaves: a live member of list A could PATCH their
own row's `list_id` to list B (self-add) or `user_id` to a third
party (graft) — the policy lets it through, only the freeze catches
it.

## R14. RLS policies match `docs/data-model.md`

Every RLS policy ships exactly per the doc's "Row-level security
policies" section. Highlights:

- `list_members_update` uses `WITH CHECK
  (public.is_list_member(list_id) OR user_id = public.uid())` — the
  `OR user_id = …` clause is load-bearing for self-removal (the
  moment a user sets `deleted_at` on their own membership row,
  `is_list_member()` returns false).
- No `lists_insert`, `list_members_insert`, `profiles_insert`, or
  `user_settings_insert` policies — creation is RPC-only / trigger-
  only.
- No `lists_delete` or `items_delete` policies — no hard-delete via
  API; soft-delete is the only path.
- `user_settings` ships only `user_settings_select` and
  `user_settings_update`, both gated on `id = public.uid()` —
  owner-only across the board.

## R15. GRANT matrix matches `docs/data-model.md`

Tables granted to `authenticated`:

- `profiles` — SELECT, UPDATE (no INSERT — trigger-only; no DELETE
  — cascade-only).
- `user_settings` — SELECT, UPDATE (same shape as profiles).
- `lists` — SELECT, UPDATE (no INSERT — RPC-only; no DELETE — soft-
  delete only).
- `list_members` — SELECT, UPDATE (no INSERT — RPC-only).
- `items` — SELECT, INSERT, UPDATE (no DELETE — soft-delete only).
- `votes` — SELECT, INSERT, UPDATE, DELETE (hard-delete model).

Views granted to `authenticated`: SELECT on `items_ranked`,
`items_deleted`, `lists_deleted`.

Functions: for every function in the migration (`public.uid()`,
`public.is_list_member(uuid)`, `public.create_list(text, text)`),
first `REVOKE EXECUTE FROM PUBLIC` and then `GRANT EXECUTE TO
authenticated`. Anonymous users have **no access** to any table or
function.

RLS without GRANT silently returns empty via PostgREST — every
omission above is therefore tested with a load-bearing negative
assertion.

## R16. Tombstone seeding

The migration seeds a tombstone `auth.users` row (`id =
'00000000-0000-0000-0000-000000000000'`, `email = NULL`) and a
matching `profiles` row (`display_name = 'Deleted user'` — the
canonical literal from `docs/account-deletion.md`'s tombstone
snippet). Both inserts are idempotent via `ON CONFLICT (id) DO
NOTHING`. **No `user_settings` row** for the tombstone — the
tombstone has no JWT, no caller, and under owner-only RLS its
settings row would be unreadable anyway.

## R17. `display_name` placeholder must not be derived from email

Cairn's privacy contract is that email is private and never shown in
the UI; the email's local part is often the user's real name.
`tg_profile_on_signup` therefore sets `display_name = 'New user'`
(fixed placeholder), never `new.email`. The first-launch screen
detects the placeholder and forces a "What should we call you?"
prompt before any other action.

## R18. `votes` timestamp semantics

- `created_at` = "first vote" — frozen on UPDATE by
  `tg_set_timestamps`.
- `modified_at` = "last vote change" — bumped by
  `tg_set_modified_at OF (value)`.
- The `POST /votes` re-vote flow that PostgREST translates to
  `INSERT … ON CONFLICT (item_id, user_id) DO UPDATE SET value = …`
  preserves `created_at` and bumps `modified_at`.

## R19. Test bootstrap stubs `auth.users` for the test path

`db/test-bootstrap.sql` is applied by `scripts/test-db.sh` between
`CREATE DATABASE` and the migration loop. It creates the `auth`
schema, the `authenticated` and `anon` roles (via idempotent `DO $$
… END$$` blocks mirroring `0001_init.sql`), and a minimal stub of
`auth.users` (just the columns FKs and triggers touch — `id`,
`email`, `created_at`).

The file lives in `db/`, **not** `db/tests/`, because `pg_prove
--ext .sql` enumerates everything `.sql` at the top of `db/tests/`
as a test file — a bootstrap with no `plan(N)` would red the whole
suite. Top-of-file comment links to `docs/data-model.md`'s
"auth.users is owned by GoTrue" paragraph and includes a checklist
of which `auth.users` columns are stubbed (rule: any future
migration referencing a new `auth.users` column must extend the
stub at the same time).

## R20. Migrate / test scripts updated for the new schema

`scripts/test-db.sh`:
- Applies `db/test-bootstrap.sql` against `cairn_test` before the
  migration loop.
- Asserts every top-level `db/tests/*.sql` declares `SELECT plan(N)`
  before invoking `pg_prove`. Fails fast with a scoped error
  message if any file is missing the declaration (a fixture or
  scratch file dropped into `db/tests/` would otherwise red the
  suite with an opaque "no plan declared" pg_prove error).

`scripts/migrate.sh`:
- Inside the migration loop, **only for migrations numbered ≥
  0004**, polls until `auth.users` exists (created by GoTrue's
  startup migration) before applying. Cap configurable via
  `MIGRATE_AUTH_USERS_TIMEOUT` env var (default 60s); exits non-zero
  with a hint to check `docker compose logs gotrue` on timeout.
- After the loop ends, issues `NOTIFY pgrst, 'reload schema'` so
  PostgREST picks up the new schema without a container bounce.

## R21. pgTAP coverage — every policy, positive AND negative

Per `CLAUDE.md` and `docs/testing.md`: every RLS policy added or
modified ships with a pgTAP test in `db/tests/`, exercising both the
positive case (allowed users can do X) and the negative case (others
cannot). The full file inventory and per-file assertion specs live
in PLAN.md → Architecture → "Test files" and TASKS.md → Phase B.

## R22. Test fixtures

Three fixtures under `db/tests/fixtures/`:

- `users_alice_bob_carol.sql` — three `auth.users` rows with stable
  literal UUIDs (`aaaa…`, `bbbb…`, `cccc…`).
- `list_shared_alice_bob.sql` — a list with stable literal UUID
  `'11111111-1111-1111-1111-111111111111'`, named `'Shared list'`,
  with Alice and Bob as members (Carol non-member). Direct
  `INSERT INTO public.lists (id, name) VALUES (…)` then a two-row
  `INSERT INTO public.list_members (list_id, user_id) VALUES …`,
  both running as the test session's `cairn` superuser (the
  fixture loads before any `SET LOCAL ROLE`). Self-includes the
  users fixture.
- `list_solo_alice.sql` — a list with stable literal UUID
  `'22222222-2222-2222-2222-222222222222'`, named `'Solo list'`,
  with Alice as the only member. Same direct-INSERT shape.
  Self-includes the users fixture.

Conventions (see PLAN.md → Architecture → "Fixture conventions" for
full rationale):

- **Absolute paths** for `\i` (`/db/tests/fixtures/<name>.sql`) so
  the include is robust to invocation cwd.
- **Self-include dependencies** (`list_*.sql` fixtures `\i` the
  users fixture as their first non-comment statement; safe to
  re-include because the users INSERTs use `ON CONFLICT DO
  NOTHING`).
- **No `BEGIN;`/`COMMIT;` inside fixtures** (each test file owns
  its own `BEGIN ... ROLLBACK`).
- **Stable UUID literals** — every fixture row uses a literal UUID,
  never `gen_random_uuid()` (matches `docs/testing.md:262`'s
  fixture-stability rule). List fixtures override the
  `lists.id default gen_random_uuid()` by passing `id` explicitly
  in the INSERT — safe because the fixture runs as cairn. Convention
  by table: users `aaaa…`/`bbbb…`/`cccc…`, lists `1111…`/`2222…`,
  items `3333…`/`4444…`/… as needed in per-test setup.
- **Direct INSERT, not RPC** — list fixtures INSERT into `lists` and
  `list_members` directly under cairn rather than calling
  `public.create_list()`. The RPC is covered separately by
  `rpc_create_list.sql`; fixtures should be minimal, deterministic,
  and stupid. The `tg_set_attribution_*` BEFORE-INSERT triggers
  still fire and stamp `created_by` from the JWT claim, matching
  what `create_list` would have produced.
- **Attribution context** — any fixture that INSERTs into an
  attribution-bearing table sets `request.jwt.claims` first, before
  the INSERT, because the `tg_set_attribution_*` BEFORE-INSERT
  triggers read `public.uid()` and write `created_by`.

## R23. Phase A non-test cleanup

Before any test files reference the post-0004 schema:

- **`db/seed/dev_seed.sql`** is gutted to a top-of-file comment
  explaining that real seed users land in step 3 (when GoTrue +
  the magic-link shortcut wire up). The current "insert two smoke
  profiles" rows can't survive once `profiles.id` is an FK to
  `auth.users(id)`.
- **`docs/development.md`** — "Seed data" and "Hit the API
  directly" sections rewritten to match (no Alice/Bob seed users,
  no `VITE_DEV_LOGIN_SHORTCUT` paragraph, no GoTrue token-fetch
  example) until step 3 brings them back.
- **`scripts/smoke.sh`** — `/profiles` block removed (anon has no
  SELECT grant on the new `profiles`, so the probe would 401
  before RLS even runs). Comment near the deleted block records
  the schema-reachability gap and points at the manual
  `\dt`/`\dv`/`\df` step until step 3 lands an authenticated
  probe.
- **`.env.example`** — commented entry for `MIGRATE_AUTH_USERS_TIMEOUT`
  (default 60s).

## R24. After this plan lands

`db/migrations/0004_domain_schema.sql` is **frozen** — schema
evolution from this point ships as additive forward-only migrations
(`0005_…`, `0006_…`, …), never as edits to `0004`. There is no
down-migration. The dev DB is rebuildable end-to-end via `docker
compose down -v && up -d && ./scripts/migrate.sh && ./scripts/seed.sh`
— the closest thing to a "reset to a known state."

Tick the step 1 checkbox in `plans/0000_implementation_order.md`
once this plan is merged.

## R25. `public.is_items_list_member(uuid)` helper for `votes_select`

A sibling helper to `public.is_list_member`, with the same shape
(`language sql stable security definer set search_path = public`).
Body:

```sql
CREATE OR REPLACE FUNCTION public.is_items_list_member(target_item uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id = target_item
      AND public.is_list_member(i.list_id)
  );
$$;
```

`votes_select`'s body is `for select using (public.is_items_list_member(
item_id))`. The helper is genuinely load-bearing, not a stylistic
wrapper: an inline `EXISTS (SELECT 1 FROM public.items …)` in the
policy body would be subject to `items_select`'s `deleted_at IS NULL`
filter (Postgres applies RLS recursively to subqueries within policy
bodies), and historical votes on a soft-deleted item would silently
disappear — contradicting the "members can see all votes including
historical ones on soft-deleted items" rule the policy is meant to
encode (the trash UI's "deleted by Alice — at the time, +2 from Bob,
-1 from Carol" rendering depends on it).

`votes_insert` and `votes_update` deliberately do **not** use the
helper — those policies *want* the recursive `items.deleted_at`
filter, since casting or changing a vote on a soft-deleted item is
what they're closing off. `is_items_list_member` is therefore a
read-side helper only.

`REVOKE EXECUTE … FROM PUBLIC` then `GRANT EXECUTE … TO authenticated`
applies, same as the other two functions per R15. Tested in
`schema_shape.sql` (signature) and `grants.sql` (positive for
authenticated, negative for anon).

## Non-requirements (explicitly excluded)

- **`delete_account()` RPC and account-deletion UI** — step 8.
  This plan only bakes in the FK semantics (`ON DELETE SET DEFAULT`,
  tombstone seeding) so step 8 doesn't have to ALTER FKs.
- **Tier 3 invite-flow tables** — `relationships` (the merged
  circle/blocklist; one row per directed pair, with `status` enum
  `'circle' | 'blocked'`) and `invitations` land in step 6. The
  `invite_policy` *column* ships now on `user_settings` (per the
  privacy split), and step 6 reads it from there.
- **Web-side profile/list/item code** — steps 2–4.
- **Real seed users** — step 3 brings back Alice/Bob seed users
  and the `VITE_DEV_LOGIN_SHORTCUT` flow once GoTrue + magic-link
  are wired.
- **Schema-reachability automated check in smoke** — deferred to
  step 3 when an authenticated probe (`GET /lists` as Alice → 200
  with empty array) lands. Until then, the schema-up check is a
  manual `psql -c "\dt public.*"` step.
- **`votes` PK freeze** — `votes_update` accepts vote-move between
  lists the caller is already a member of (`PATCH
  /votes?item_id=eq.X&user_id=eq.<self>` with body `{"item_id":
  "Y"}`). The surface is narrow (deliberate API misuse, not a
  user-clickable path) and bounded (a member can already cast and
  retract any vote in two requests). Asymmetry with the
  `list_members` PK freeze is deliberate: `list_members` is
  privilege escalation (self-add to a list the caller isn't in);
  `votes` is bounded vote-move within already-permitted lists.
  Tracked here so it isn't lost; ships in a future "schema
  invariants" pass.
- **`tg_set_attribution_items` tuple-drift regression test.** The
  content-detection tuple (`NEW.list_id, NEW.name, NEW.notes,
  NEW.deleted_at`) must be extended in lockstep with any future
  payload column added to `items`, or edits to the new column
  silently no-op `modified_by`. The maintenance contract lives as a
  comment on the trigger function and a mirror in
  `docs/data-model.md`'s Triggers section; a regression test would
  add one assertion per future column with no immediate value.
- **`tg_set_timestamps` `OF` clause.** Deliberately no `OF` — the
  freeze must reach all UPDATE shapes regardless of which other
  columns the request touches. The per-row plpgsql cost is one
  extra trigger invocation on every UPDATE on six tables, plus the
  same on every cascade UPDATE during account deletion. Acceptable
  at Cairn's scale.
- **Two files share the "smoke" name.** `db/tests/smoke.sql` (the
  pgTAP smoke file deleted in Phase D, superseded by
  `infra_auth_stub.sql`) and `scripts/smoke.sh` (the shell-script
  smoke check, which loses its `/profiles` block in Phase A and
  otherwise stays). Different directories, different roles. Recorded
  here so the executor doesn't reach for the wrong file.
