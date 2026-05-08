# Plan 0010 — DB foundation (step 1 of `plans/0000_implementation_order.md`)

## Context

The walking-skeleton DB only has a smoke `public.profiles` table
(`db/migrations/0001_init.sql:49`). Step 1 of the master plan replaces
it with the real Tier 1+2 schema from `docs/data-model.md`: `profiles`,
`lists`, `list_members`, `items`, `votes`; the `is_list_member()`
helper; the `items_ranked` / `items_deleted` / `lists_deleted` views;
all triggers; all RLS policies; and the **tombstone user** + `on
delete set default` FK semantics from `docs/account-deletion.md` (the
master plan calls these out explicitly so we don't ALTER FKs in
step 8). Tier 3 (circles, blocks, invitations) is deferred to step 6.

Why now: every later step depends on this. Auth/HTTP (step 3) needs
real `profiles`; the MVP product surface (step 4) needs lists/items/
votes; soft-delete UX (step 5) needs the trash views; account deletion
(step 8) needs the FK semantics already baked in.

The user wants **TDD with red phases first**. Concretely: write all the
failing pgTAP test files (red), then write the migration to make them
pass (green). Per-table red→green cycles fight Postgres's transactional
DDL and the FK graph (`is_list_member()` references `list_members`,
which is referenced by every policy on every other table). The right
granularity unit for TDD here is the **pgTAP file**, not the migration
file.

## Approach

One migration `db/migrations/0004_domain_schema.sql` — top-to-bottom,
no churn, no half-applied intermediate state. TDD shows up as a set
of small pgTAP files written *before* the migration.

The hard prerequisite: `auth.users` is owned by GoTrue in production
(`docs/data-model.md:17`) and does not exist in `cairn_test` because
`scripts/test-db.sh` doesn't run GoTrue. Solution: a tiny test
bootstrap (`db/test-bootstrap.sql`) that creates a *minimal* stub of
`auth.users` (just the columns our FKs and triggers touch), applied by
`test-db.sh` between `CREATE DATABASE` and the migration loop. The
migration itself stays honest about who owns `auth.users`. The file
sits in `db/`, **not** `db/tests/`, because `pg_prove --ext .sql ...
/db/tests` enumerates every `.sql` at the top of that directory; a
bootstrap file with no `plan(N)` would either fail with "no plan
declared" or trip a parse error and red the whole suite. Keeping it
one level up keeps it out of pg_prove's scan while leaving it inside
the `./db:/db` volume mount the container sees.

A `uid()` helper is *not* shipped by GoTrue itself — Supabase's
hosted helpers ship one in `public.uid()`, but we run vanilla GoTrue
*and* deliberately put our helper in a Cairn-owned schema rather
than GoTrue's `auth` schema, so a future GoTrue release can't
clobber us. Migration `0004` creates `public.uid()` (sibling to
`public.is_list_member()`): a `language sql stable` function that
reads the `sub` claim out of `request.jwt.claims`. PostgREST v10+
sets that GUC per-request as a JSON object containing every claim
(the per-claim `request.jwt.claim.<name>` GUCs were removed in v10;
we run v12.2.3 per `docker-compose.yml:21`). Function body, exactly
as written:

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
the function result, and Postgres errors at create time. Every
policy, RPC, and trigger function in this migration calls
`public.uid()`; tests `SET LOCAL request.jwt.claims =
'{"sub":"<uuid>"}'` to simulate.

## Files

### New files

- **`db/migrations/0004_domain_schema.sql`** — single migration,
  ordered. The entire file is wrapped in `BEGIN; … COMMIT;` (same
  pattern as `0001_init.sql` etc.; see "Existing patterns to
  reuse"). Together with the smoke-profiles guard in step 1 and
  the `_migrations` ledger, this gives "all-or-nothing applied,
  exactly once" — a mid-migration failure rolls back cleanly and
  re-running falls into the unsupported path described in step 1.
  Steps:
  1. Drop the smoke `profiles` table — but only if the schema is
     still pre-0004. Wrap in a `DO $$ … END$$` block: if
     `to_regclass('public.user_settings') IS NULL` (the cheapest
     unambiguous "post-0004 schema not yet in place" sentinel),
     issue `DROP TABLE public.profiles CASCADE`; otherwise no-op.
     **Don't gate on the absence of `theme` from `profiles`** —
     under the privacy split (step 4b) the new `profiles` table
     also lacks `theme`, so a column-shape predicate can't
     distinguish smoke-profiles from new-profiles and would
     irreversibly drop real data on a hand-run. The guard's only
     job is to prevent that DROP; it is **not** a back door to
     making `0004` idempotent — re-running after a ledger reset
     is unsupported (step 5+'s `CREATE TABLE` statements error
     on the second run anyway; recovery is `docker compose down
     -v && up -d && ./scripts/migrate.sh && ./scripts/seed.sh`,
     per `docs/development.md`'s "start over"). Inline comment
     in the migration spells this out for the next reader.
  2. `CREATE FUNCTION public.uid() RETURNS uuid LANGUAGE sql STABLE
     SET search_path = public AS $$ SELECT
     ((NULLIF(current_setting('request.jwt.claims', true), ''))::jsonb
     ->> 'sub')::uuid; $$;` — body verbatim per the Approach
     section. Lives in `public` (Cairn-owned), not `auth`
     (GoTrue-owned), so a GoTrue upgrade can't clobber it. The
     per-claim GUCs were removed in PostgREST v10; we read the
     modern `request.jwt.claims` JSON GUC instead.
  3. Tombstone insert into `auth.users` (id =
     `'00000000-0000-0000-0000-000000000000'`, email = NULL). Idempotent
     via `ON CONFLICT (id) DO NOTHING` so reapplication is safe.
  4. `CREATE TABLE public.profiles` (matching the `profiles` table
     block in `docs/data-model.md`, **including the `ALTER TABLE …
     ENABLE ROW LEVEL SECURITY` statement that follows the `CREATE
     TABLE` block in the doc** — see step 12). Columns:
     `id`, `display_name`, `created_at`, `modified_at`. All
     personal preferences (`theme`, `font_size`, `invite_policy`)
     live in `user_settings` — see step 4b. `id` FK to
     `auth.users(id) ON DELETE CASCADE`. Insert tombstone profile
     row immediately after, literal: `INSERT INTO public.profiles
     (id, display_name) VALUES
     ('00000000-0000-0000-0000-000000000000', 'Deleted user') ON
     CONFLICT (id) DO NOTHING;`. `'Deleted user'` is the canonical
     literal per `docs/account-deletion.md`'s tombstone snippet —
     the `tg_profile_on_signup` trigger uses the fixed placeholder
     `'New user'` for real accounts but skips the tombstone, so
     this is the only place the `'Deleted user'` string appears at
     insert time. The tombstone deliberately gets a `profiles` row
     but **no `user_settings` row** (see step 4b): nobody is ever
     the owner of the tombstone, so a settings row would have no
     reader.
  4b. `CREATE TABLE public.user_settings` (matching the
      `user_settings` table block in `docs/data-model.md`,
      **including the `ALTER TABLE … ENABLE ROW LEVEL SECURITY` statement that follows the `CREATE TABLE` block in the doc**).
      Columns: `id` (PK + FK to `auth.users(id) ON DELETE
      CASCADE`), `theme`, `font_size`, `invite_policy`,
      `created_at`, `modified_at` — the three preference columns
      with their CHECK enums and defaults (`'system'`, `'m'`,
      `'everybody'`) per the doc, plus the standardized timestamp
      pair every table now ships with. The split from `profiles`
      is structural privacy: `profiles_select` is world-readable
      to `authenticated`, so anything in `profiles` is visible to
      every authenticated user; `user_settings` has a single
      owner-only policy (`using (id = public.uid())`, see step
      13) so every column here is private by virtue of the table
      it lives in. No tombstone row inserted into `user_settings`
      — the tombstone has no JWT, no caller, and under owner-only
      RLS its settings row would be unreadable anyway. The
      tombstone-skip in `tg_profile_on_signup` (step 10) covers
      both tables uniformly.
  5. `CREATE TABLE public.lists` (matching the `lists` table block
     in `docs/data-model.md`, **including the `ALTER TABLE … ENABLE
     ROW LEVEL SECURITY` statement that follows the `CREATE TABLE`
     block in the doc**) with attribution columns having
     `DEFAULT '00000000-…'` and `REFERENCES auth.users(id) ON
     DELETE SET DEFAULT`. Plus the partial index
     `lists_not_deleted_idx`.
  6. `CREATE TABLE public.list_members` (matching the
     `list_members` table block, **including the `ALTER TABLE …
     ENABLE ROW LEVEL SECURITY` statement that follows the `CREATE
     TABLE` block in the doc**). Columns, in order: `list_id`,
     `user_id`, `added_by`, `deleted_by`, `created_at`,
     `modified_at`, `deleted_at` — payload first, attribution
     next, timestamps last per `data-model.md`'s "Timestamp
     columns are the last columns of every table" principle.
     `list_id`/`user_id` cascade; `added_by`/`deleted_by` `set
     default`. The timestamp column is `created_at` (renamed
     from the earlier `added_at` shape) to match the
     standardized convention every table now follows; `added_by`
     keeps its verb-form name as the partner of `deleted_by`.
  7. `CREATE TABLE public.items` (matching the `items` table
     block, **including the `ALTER TABLE … ENABLE ROW LEVEL SECURITY` statement that follows the `CREATE TABLE` block in the doc**).
     Same attribution pattern as `lists`. Plus
     `items_list_active_idx`.
  8. `CREATE TABLE public.votes` (matching the `votes` table
     block, **including the `ALTER TABLE … ENABLE ROW LEVEL SECURITY` statement that follows the `CREATE TABLE` block in the doc**).
     Columns: `item_id`, `user_id`, `value`, `created_at`,
     `modified_at`. Both FKs cascade; check `value BETWEEN -3 AND
     3 AND value <> 0`. No soft-delete. Timestamp columns are
     `created_at` (renamed from the earlier `voted_at` shape — its
     "first vote" semantic now belongs to `created_at`, frozen by
     `tg_set_timestamps` on every UPDATE) and `modified_at`
     (bumped by `tg_set_modified_at OF (value)` whenever the vote
     value changes — its "most recent change" semantic).
  9. `CREATE FUNCTION public.is_list_member(target_list uuid)`
     exactly per the `is_list_member` function definition in
     `docs/data-model.md` (`stable security definer set
     search_path = public`).
  10. Trigger functions and bindings (in `public`). The migration
      runs exactly once via the `_migrations` ledger — re-applying
      after a manual psql edit is unsupported (rebuild the DB via
      `docker compose down -v && up -d && migrate && seed`,
      per `docs/development.md`). The smoke-profiles guard in
      step 1 protects only the irreversible DROP — not the
      `CREATE TABLE` statements below it, which will fail on a
      second run regardless. Don't read the guard as a hint that
      `0004` is re-runnable; it isn't. Trigger
      *bindings* use a numeric prefix (`t10_*`, `t20_*`, `t30_*`)
      so future additions don't silently shift firing order:
      `BEFORE INSERT/UPDATE` triggers fire alphabetically by name
      on each row. Function names stay un-prefixed (`tg_*`).
      Only one trigger is `SECURITY DEFINER` —
      `tg_profile_on_signup` — and only because the
      `auth.users` INSERT happens under the `gotrue` role, not
      `authenticated`, and neither `public.profiles` nor
      `public.user_settings` has an INSERT policy or INSERT grant,
      so the cross-schema, cross-table writes genuinely need to
      escalate. List-creation goes through the `create_list()` RPC
      instead (see step 11), which keeps every cross-table
      privileged write in this schema as an explicit RPC rather
      than a hidden trigger. The two `BEFORE` triggers that only
      mutate `NEW` are `SECURITY INVOKER` (the default).
      - `tg_profile_on_signup()` (`LANGUAGE plpgsql SECURITY
        DEFINER SET search_path = public`) — `AFTER INSERT
        ON auth.users`, bound as `tg_profile_on_signup` (no
        numeric prefix — the AFTER-INSERT bucket on `auth.users`
        has no co-firing trigger, and the `t05_*`/`t10_*`/`t20_*`
        prefix convention applies only to BEFORE bindings on
        `public.*` tables where multiple triggers may share the
        bucket). Inserts **two** rows for the new auth user:
        a `public.profiles` row with `display_name = 'New user'`
        (the fixed placeholder), and a `public.user_settings` row
        with all-default columns (`theme = 'system'`, `font_size
        = 'm'`, `invite_policy = 'everybody'` — i.e., bare
        `INSERT INTO public.user_settings (id) VALUES (NEW.id)`,
        the column DEFAULTS provide the rest). Both inserts use
        `ON CONFLICT (id) DO NOTHING` for safety. Both are skipped
        when `new.id = tombstone` so the manual tombstone-profile
        insert in step 4 isn't double-handled and the tombstone
        deliberately *doesn't* get a `user_settings` row (per the
        rationale in step 4b). The trigger does **not** read
        `new.email` — see Risk #10 for the leak rationale.
        `plpgsql`, not `sql`, because the body branches on
        `new.id` and runs two INSERTs. `search_path = public` (not
        `public, auth`): the body only references `public.profiles`,
        `public.user_settings`, and trigger-NEW; NEW is a built-in
        trigger record not subject to search_path resolution, so
        no `auth` entry is needed. Tighter search_path matches
        the SECURITY-DEFINER hardening pattern called out in
        Risk #5.
      - `tg_set_timestamps()` (`LANGUAGE plpgsql`, invoker) —
        the universal timestamp guard. `BEFORE INSERT OR UPDATE`,
        bound on every table that has `created_at` and
        `modified_at` (`profiles`, `user_settings`, `lists`,
        `list_members`, `items`, `votes`) with prefix
        `t05_set_timestamps` so it fires before
        `t10_set_attribution_*` and `t20_set_modified_at_*`.
        On `INSERT`: `NEW.created_at := NEW.modified_at :=
        now()` unconditionally, overriding any client-supplied
        value. On `UPDATE`: *both* `NEW.created_at :=
        OLD.created_at` *and* `NEW.modified_at :=
        OLD.modified_at`, freezing the pair against direct
        PATCH backdating. `t05` does not bump `modified_at`
        on UPDATE — `t20_set_modified_at` (gated by `OF
        (cols)`) does, and only when one of its content
        columns is in the SET list. When `OF` doesn't match
        (a client PATCH that only sets `modified_at` itself,
        or a cascade SET DEFAULT that only touches attribution
        columns), `t20` doesn't fire and the freeze holds —
        same "never trust client-sent attribution" rule,
        lifted to the timestamps, and the cascade-skip half
        of Risk #12.b stays intact. `plpgsql` because the
        body branches on `TG_OP`. Replaces the earlier
        per-table `tg_set_voted_at`.
      - `tg_set_modified_at()` (`LANGUAGE plpgsql`, invoker) —
        `BEFORE UPDATE OF` non-attribution columns, sets
        `new.modified_at = now()`. One function, bound per-table
        with a per-table `OF (cols)` clause: `profiles` (`OF
        display_name`), `user_settings` (`OF theme, font_size,
        invite_policy`), `lists` (`OF name, description,
        deleted_at`), `list_members` (`OF deleted_at`), `items`
        (`OF list_id, name, notes, deleted_at`), `votes` (`OF
        value`). `plpgsql` because trigger functions that mutate
        `NEW` can't be `sql`. The column-restricted `OF` clause
        is the simpler half of the Risk #12 cascade fix (see
        Risk #12.b for the rationale); tables without attribution
        columns use the same `OF` pattern for uniformity.
      - `tg_set_attribution_lists()`,
        `tg_set_attribution_items()`,
        `tg_set_attribution_list_members()` (all invoker, all
        `LANGUAGE plpgsql`) — three per-table functions rather
        than one branching on `TG_TABLE_NAME`. Each is `BEFORE
        INSERT OR UPDATE` on its own table, bound with the
        prefix `t10_set_attribution_*` so it fires *after* the
        `t05_set_timestamps` trigger above (which already owns
        `created_at` / `modified_at` uniformly across every
        table) and *before* `t20_set_modified_at_*`. These
        triggers therefore handle attribution columns only —
        `created_by` / `added_by` / `modified_by` / `deleted_by`
        — and never touch the timestamp columns. Behaviour:
        - **items** (the only table with `modified_by`): on INSERT
          set `created_by = modified_by = public.uid()` AND
          `deleted_by = NULL` (overriding any client value). On
          UPDATE, `created_by` gets the simple tombstone-gated
          anti-spoof freeze (`IF NEW.created_by IS DISTINCT FROM
          '00000000-…' THEN NEW.created_by := OLD.created_by;
          END IF;`), and `modified_by` gets a content-aware
          two-branch rule — see Risk #12 for *why* the naive
          single-gate fails on `modified_by` (Bob-edited-Alice's-
          item cascade) and why the body has to look like this:
            ```
            IF (NEW.list_id, NEW.name, NEW.notes, NEW.deleted_at)
                 IS DISTINCT FROM
               (OLD.list_id, OLD.name, OLD.notes, OLD.deleted_at)
            THEN
              -- client-driven content edit (or soft-delete /
              -- restore): stamp modified_by with the caller.
              NEW.modified_by := public.uid();
            ELSIF NEW.modified_by IS DISTINCT FROM
                  OLD.modified_by
              AND NEW.modified_by IS DISTINCT FROM
                  '00000000-0000-0000-0000-000000000000'
            THEN
              -- direct PATCH spoof of modified_by: freeze.
              -- Tombstone gate lets the SET DEFAULT cascade
              -- for items.modified_by itself pass through.
              NEW.modified_by := OLD.modified_by;
            END IF;
            -- else: cascade for items.created_by /
            -- items.deleted_by (or any UPDATE that touched
            -- nothing relevant) — leave NEW.modified_by alone.
            ```
          **Maintenance contract.** The tuple `(NEW.list_id,
          NEW.name, NEW.notes, NEW.deleted_at)` enumerates every
          payload column on `items` as of `0004` — plus the
          soft-delete flag `deleted_at`, which is the gate that
          stamps `modified_by` on a soft-delete or restore.
          (`deleted_at` is technically a timestamp but
          functionally a user-mutable flag, so it belongs in
          this tuple even though `created_at` and `modified_at`
          do not.) A future migration that adds a content
          column (`priority`, `category`, anything
          user-editable) must extend the tuple in lockstep, or
          edits to the new column will silently no-op
          `modified_by`. The migration MUST carry an inline
          comment immediately above this trigger function
          spelling out the contract: "this tuple is every
          user-mutable column on `items` (payload + the
          soft-delete flag), excluding attribution columns and
          the `created_at`/`modified_at` pair; if you add a
          column in that category, extend this tuple at the
          same time." Same rule for any future
          attribution-bearing table that ships with
          `modified_by`. Doc-side mirror in
          `docs/data-model.md`'s "Triggers" section.
        - **lists** (no `modified_by`): on INSERT set
          `created_by = public.uid()` AND `deleted_by = NULL`;
          on UPDATE the same simple tombstone-gated freeze on
          `created_by` as items uses (`IF NEW.created_by IS
          DISTINCT FROM '00000000-…' THEN NEW.created_by :=
          OLD.created_by; END IF;`). See Risk #12 for the
          cascade-passthrough rationale and the per-rule-keying
          requirement. Plus the deleted_by transition rules.
        - **list_members** (no `modified_by`, uses `added_by`
          instead of `created_by`): on INSERT set
          `added_by = public.uid()` AND `deleted_by = NULL`;
          on UPDATE, `IF NEW.added_by IS DISTINCT FROM
          '00000000-…' THEN NEW.added_by := OLD.added_by; END
          IF;` (same anti-spoofing rationale on the equivalent
          column, same cascade-passthrough gate per Risk #12,
          same per-rule keying). Plus the deleted_by transition
          rules.
        - **deleted_by transition rules** (all three tables):
          - if `OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT
            NULL` (soft-delete transition), set `deleted_by =
            public.uid()`;
          - if `OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS
            NULL` (restore transition), set `deleted_by = NULL`.
            Without this branch, restored rows leave `deleted_by`
            pointing at whoever previously soft-deleted them,
            forcing every client to remember to send `deleted_by:
            null` alongside `deleted_at: null` (and silently
            corrupting attribution if they don't).
          The INSERT-time `deleted_by := NULL` is load-bearing:
          the column DEFAULT is the tombstone UUID (so `ON
          DELETE SET DEFAULT` on the FK has somewhere to land
          when an account is deleted), and Postgres applies that
          DEFAULT on `INSERT`-without-value too. Without the
          trigger override, every freshly inserted *live* row
          would silently read as "deleted by the tombstone
          user" — see Risk #11.
        Three small functions are easier to read and test than one
        with column-shape branching, and a future
        attribution-bearing table just gets its own function in
        the same shape.
      - `tg_freeze_list_members_pk()` (`LANGUAGE plpgsql`, invoker)
        — `BEFORE UPDATE ON public.list_members`, bound as
        `t01_freeze_list_members_pk` so it fires before every other
        BEFORE-UPDATE trigger on the table. Body, verbatim:
        `IF NEW.list_id IS DISTINCT FROM OLD.list_id
           OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
           RAISE EXCEPTION 'list_members PK columns are immutable';
         END IF; RETURN NEW;`. Closes the consent-bypass the
        `list_members_update` policy's `WITH CHECK (… OR user_id =
        public.uid())` clause otherwise leaves open: without this
        trigger, a live member of list A could `PATCH
        /list_members?list_id=eq.<A>&user_id=eq.<self>` with body
        `{"list_id": "<B>"}` to self-add to any list whose UUID
        they can obtain (the `WITH CHECK` self-row branch passes;
        the FK on `list_id` only requires list B to exist).
        Symmetric vector via `user_id` mutation lets a member
        rewrite a row to point at a third party. Both vectors
        bypass the structural consent closure that step 11's
        `create_list` and step 6's `accept_invitation` are
        supposed to make the only sanctioned membership-write
        paths. The `t01_*` prefix is deliberate: short-circuiting
        before `t05_set_timestamps` / `t10_set_attribution_*` /
        `t20_set_modified_at` keeps the rejection cheap and the
        `\d list_members` output ordered consistently with the
        canonical "freeze, then derive, then bump" reading. See
        Risk #13 for the full rationale and the symmetry note
        with the `votes` PK accepted trade-off.
  11. `CREATE FUNCTION public.create_list(p_name text,
      p_description text default null) returns public.lists`
      `language plpgsql security definer set search_path =
      public`. Body, in order: (1) `if public.uid() is null
      then raise exception 'not authenticated' using errcode =
      '28000'; end if;` — defence-in-depth against a future
      GRANT-matrix regression (mirrors `delete_account()`'s
      pattern at `docs/account-deletion.md:88-91`); (2)
      `if public.uid() = '00000000-0000-0000-0000-000000000000'
      then raise exception 'cannot act as the tombstone user'
      using errcode = '28000'; end if;` — symmetric guard
      against a tombstone-`sub` JWT leak (mirrors
      `account-deletion.md:92-94`); (3) insert into `lists`
      (`created_by` gets filled by `tg_set_attribution_lists`);
      (4) insert the matching `list_members(list_id, user_id)`
      row for the creator; (5) return the new `lists` row. The
      RPC is the only sanctioned create path. Direct `POST
      /lists` and direct `POST /list_members` are both closed
      off by construction: step 13 omits the `lists_insert`
      and `list_members_insert` policies, step 15 omits both
      INSERT grants. Without that closure a direct `POST
      /lists` would succeed under a permissive policy but skip
      the matching `list_members` row, leaving an orphan list
      invisible to its creator; and a direct `POST
      /list_members` would let any member silently add any
      authenticated user to a list without consent (closed
      structurally rather than by policy because Tier 3's
      `accept_invitation` is the consent-respecting path that
      lands in step 6, and we don't want a permissive direct-
      INSERT shape sitting in production in the meantime). The
      `security definer` attribute on `create_list` is what
      lets steps (3) and (4) succeed despite the missing grants
      — the RPC executes as the `cairn` owner and bypasses both
      the GRANT and RLS layers. Reads still use the existing
      `GET /lists` and `GET /list_members` paths against the
      live policies.
  12. (no-op step — the `ALTER TABLE … ENABLE ROW LEVEL SECURITY`
      statement is issued immediately after each `CREATE TABLE`
      (steps 4, 4b, 5–8) per the table blocks in
      `docs/data-model.md`. Issuing the ALTER right after CREATE
      means tables are RLS-on the moment they exist; if the
      migration aborts mid-file there's no half-enabled window
      where a created table sits with RLS off. The step number is
      preserved so downstream references to "step 13" / "step 14"
      / "step 15" elsewhere in this plan stay accurate.)
  13. All RLS policies, exactly per the "Row-level security
      policies" section of `docs/data-model.md`. Four notes:
      (a) `list_members_update` uses
      `WITH CHECK (public.is_list_member(list_id) OR user_id =
      public.uid())` per the doc. The `or user_id = public.uid()`
      clause is load-bearing for self-removal: the moment a user
      sets `deleted_at` on their own membership row,
      `is_list_member()` starts returning false for them on that
      list (it filters on `deleted_at is null`), so a pure
      `is_list_member(list_id)` check would reject the very
      update that performs the removal. The doc has settled on
      this form and the `rls_list_members.sql` self-removal
      assertion is the regression guard, not the discovery
      mechanism. (b) The doc has no `lists_insert` policy —
      direct `POST /lists` is denied by RLS (no permissive
      INSERT policy) and by the absence of an INSERT grant;
      list creation goes through `create_list()` (step 11) only.
      (c) The doc has no `list_members_insert` policy either —
      direct `POST /list_members` is denied by the same two-
      layer pattern (no permissive INSERT policy, no INSERT
      grant in step 15.a). Membership writes go through
      `create_list()` (the creator's row, step 11) and Tier 3's
      `accept_invitation` (step 6's plan). The flat-permissions
      kick-and-restore semantics live in `list_members_update`,
      not in INSERT — and the kicked user is naturally barred
      from self-restoration because the `using` clause
      (`is_list_member(list_id)`) hides their own soft-removed
      row from PATCH. (d) `user_settings` ships with **only**
      `user_settings_select` and `user_settings_update`, both
      gated on `id = public.uid()` — owner-only across the
      board. No INSERT policy and no INSERT grant: settings
      rows are created exclusively by `tg_profile_on_signup`
      (step 10), same shape as `profiles`. No DELETE policy:
      settings rows go away only via cascade from `auth.users`
      when the account is deleted (step 8's `delete_account`
      RPC).
  14. Three views, with deliberately asymmetric
      `security_invoker` settings so soft-deleted rows are
      **never** readable through base-table queries:
      - `items_ranked` (matching the `items_ranked` view
        definition in `docs/data-model.md`):
        `WITH (security_invoker = true)`. Inherits the caller's
        RLS, so the `items_select` policy's `deleted_at IS NULL`
        clause hides soft-deleted items automatically. The view
        body's `where i.deleted_at is null` is defensive
        redundancy.
      - `items_deleted` and `lists_deleted` (both matching their
        view definitions in `docs/data-model.md`): both
        `WITH (security_invoker = false)`. They run as the view
        owner (`cairn`, table-owner exempt from RLS) so they can
        read soft-deleted rows the policies hide. To compensate
        for the bypassed RLS, each view body adds `and
        public.is_list_member(<list-id>)` to its WHERE — this
        becomes the *only* authorization gate for the trash, and
        is therefore covered by a load-bearing negative pgTAP
        test on each view (non-member sees zero rows).
      The asymmetry is the whole point: the base tables and live
      view never expose soft-deleted content; the trash views
      explicitly elevate to read it, with their own membership
      check as the gate.
  15. Grants. Two parts.
      (a) Table grants: `GRANT SELECT, UPDATE ON public.profiles
      TO authenticated; GRANT SELECT, UPDATE ON public.user_settings
      TO authenticated; GRANT SELECT, UPDATE ON
      public.list_members TO authenticated; GRANT SELECT, INSERT,
      UPDATE ON public.items TO authenticated; GRANT SELECT,
      UPDATE ON public.lists TO authenticated; GRANT SELECT,
      INSERT, UPDATE, DELETE ON public.votes TO authenticated;
      GRANT SELECT ON public.{items_ranked, items_deleted,
      lists_deleted} TO authenticated;`. Four deliberate
      omissions: `public.profiles` does **not** get `INSERT` —
      profile rows are created exclusively by the
      `tg_profile_on_signup` `SECURITY DEFINER` trigger when GoTrue
      inserts into `auth.users`, and there is no `profiles_insert`
      policy, so a grant would be dead weight at best and
      misleading surface at worst. `public.user_settings` follows
      the same pattern for the same reason — the same trigger
      creates the row, no INSERT policy, no INSERT grant.
      `public.lists` does **not** get `INSERT` either — list
      creation is RPC-only (step 11). `public.list_members` does
      **not** get `INSERT` either — membership writes are RPC-
      only too (`create_list` for the creator's row in step 11;
      `accept_invitation` for invitees in step 6's plan), so a
      direct `POST /list_members` can't silently add a
      non-consenting user to a list. **Critical**: RLS without
      `GRANT` leaves PostgREST silently empty.
      (b) Function grants — for every function in this migration
      (`public.uid()`, `public.is_list_member(uuid)`,
      `public.create_list(text, text)`), first
      `REVOKE EXECUTE … FROM PUBLIC` and *then*
      `GRANT EXECUTE … TO authenticated`. Postgres grants
      `EXECUTE` to `PUBLIC` on every new function by default; the
      revoke-first-then-grant pattern means that if a future
      `security definer` function added to this schema has a
      sensitive body, it doesn't inherit an unsafe default. Same
      shape Supabase uses on every `security definer` helper.

- **`db/test-bootstrap.sql`** — applied by `test-db.sh` *before*
  any migration runs, against a fresh `cairn_test`. **Lives in
  `db/`, not `db/tests/`**: `pg_prove` is invoked against
  `/db/tests` with `--ext .sql`, so anything `.sql` at the top of
  that directory becomes a test file. A bootstrap file with no
  `plan(N)` would either fail with "no plan declared" or trip a
  parse error and red the whole suite — keeping it one level up
  keeps it out of pg_prove's scan while staying inside the
  `./db:/db` volume mount. **Fully self-contained**: at the point
  it runs neither the `authenticated` role nor the `auth` schema
  exists yet (those are created by `0001_init.sql` and
  `0002_auth_schema.sql` respectively), so bootstrap creates them
  itself, idempotently, before stubbing `auth.users`. Concretely:
  1. `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE
     rolname = 'authenticated') THEN CREATE ROLE authenticated
     NOLOGIN; END IF; END$$;` — duplicates `0001_init.sql`'s role
     creation under the same `IF NOT EXISTS` guard so that a
     subsequent `0001` re-run is a no-op. **Repeat the same
     `DO $$ … END$$` block for `anon`** so tests can also
     `SET LOCAL ROLE anon` to exercise unauthenticated negative
     paths at runtime (e.g., `rls_profiles.sql`'s `throws_ok`
     anon assertion). Both roles need to *exist* before any test
     can switch into them; the `cairn` superuser can `SET LOCAL
     ROLE` to either without explicit role-membership grants
     (superusers bypass the membership check), so no `GRANT … TO
     cairn` is needed — see Risk #2 for the misconception this
     resolves.
  2. `CREATE SCHEMA IF NOT EXISTS auth;` — same shape as
     `0002_auth_schema.sql`, minus the `AUTHORIZATION gotrue`
     clause (the `gotrue` role doesn't exist in tests and would
     itself be created by `0001`; ownership doesn't matter in the
     test path because GoTrue never runs there).
  3. `CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, role
     text DEFAULT 'authenticated', created_at timestamptz DEFAULT
     now());` — the minimal stub.
  Top-of-file comment links to the "auth.users is owned by GoTrue"
  paragraph in `docs/data-model.md` and notes that GoTrue's real
  schema has many more columns we deliberately don't stub. The
  comment also includes a **rule + checklist** spelling out exactly
  which columns of `auth.users` the migration touches (FKs to `id`;
  trigger reads of `email`); the rule is "if a future migration
  references a new `auth.users` column in any FK or trigger, it must
  be added to this stub at the same time, or the test suite silently
  masks a divergence from the real GoTrue schema." End-to-end
  verification against the real schema lands in step 3 when GoTrue
  is wired and Mailpit-driven signup runs through the full path
  (`plans/0000_implementation_order.md` step 3); bootstrap.sql is the
  unit-level stub, not the integration check.

- **`db/tests/fixtures/users_alice_bob_carol.sql`** — three
  `auth.users` rows with stable UUIDs (`aaaa…`, `bbbb…`, `cccc…`) and
  emails `alice@test`, `bob@test`, `carol@test`. The
  `tg_profile_on_signup` trigger creates the `profiles` rows
  automatically (once migration 0004 is in place; in Phase A it just
  populates `auth.users`). No attributed inserts here, so no
  `request.jwt.claims` setup needed. Loaded with `\i
  /db/tests/fixtures/users_alice_bob_carol.sql` (absolute path — see
  the fixture-path convention below).

- **`db/tests/fixtures/list_shared_alice_bob.sql`** — extends the users
  fixture with one list created by Alice with Bob as a second member;
  Carol is non-member. Used by most RLS tests. Per the fixture
  self-include convention below, this file opens with `\i
  /db/tests/fixtures/users_alice_bob_carol.sql` so a calling test
  only needs to `\i` this one fixture. After the include — because
  `lists` and `list_members` are attribution-bearing tables — the
  fixture sets `SET LOCAL request.jwt.claims =
  '{"sub":"aaaa..."}';` so the BEFORE-INSERT trigger has a
  `public.uid()` to read; creates the list via
  `public.create_list('Shared list')` (which inserts the matching
  `list_members` row for Alice in the same RPC); then `INSERT INTO
  public.list_members (list_id, user_id) VALUES (..., '<bob-uuid>')`
  — the `tg_set_attribution_list_members` trigger fills `added_by`
  with Alice's uid from the GUC. The fixture is loaded with `\i`
  before any `SET LOCAL ROLE`, so the direct INSERT runs as the
  test session's `cairn` superuser — that bypass is what lets
  the row land despite the no-INSERT-grant from step 15.a (same
  pattern `triggers_set_attribution.sql` calls out for its
  lists-leg INSERTs). In production, a multi-member list shape
  comes from `accept_invitation` (step 6); the fixture stands in
  for that until the RPC lands.

- **`db/tests/fixtures/list_solo_alice.sql`** — list with Alice as the
  only member. Used for "delete list when user is the only member" and
  for tests that need a private list. Same self-include opener as
  `list_shared_alice_bob.sql` (`\i
  /db/tests/fixtures/users_alice_bob_carol.sql` first), then the same
  `SET LOCAL request.jwt.claims` block; creates the list via
  `public.create_list(...)` and stops there.

**Fixture-path convention.** Every `\i fixtures/...` include in this
plan and in `docs/testing.md`'s worked example uses an *absolute*
path: `\i /db/tests/fixtures/<name>.sql`. `pg_prove` is invoked as
`docker compose exec -T postgres pg_prove --ext .sql ... /db/tests`,
which inherits the container's WORKDIR (`/`), so a relative `\i
fixtures/...` resolves to `/fixtures/...` and fails. Absolute paths
match the read-only volume mount in `docker-compose.yml` (`./db:/db`)
and are robust to invocation cwd.

**Fixture self-include convention.** List fixtures
(`list_shared_alice_bob.sql`, `list_solo_alice.sql`) `\i` the users
fixture (`users_alice_bob_carol.sql`) as their first non-comment
statement, so a test that needs a list only has to `\i` the most
specific fixture it needs. Without this rule, every test would have
to include both fixtures explicitly, and forgetting the users `\i`
would surface as opaque FK-violation errors against `auth.users`
the moment the list fixture's `create_list` call hits the
`tg_set_attribution_lists` trigger. Re-including the users fixture
is safe: every INSERT in `users_alice_bob_carol.sql` uses `ON
CONFLICT (id) DO NOTHING`, so a test that loads the list fixture
alongside another that already loaded users (rare, but possible if
a test composes several list fixtures) is a no-op on the second
pass rather than a duplicate-key error.

**Fixtures must not contain their own `BEGIN;`/`COMMIT;`.** Each
test file opens its own `BEGIN ... ROLLBACK` (per
`docs/testing.md:103`), and `\i` runs the included file inline in
that same transaction. A fixture that opens its own transaction
either commits independently (persisting rows across tests and
breaking isolation) or — worse — issues a `COMMIT` that silently
ends the test's transaction mid-file, after which subsequent
asserts run outside any transaction and leave their writes in the
DB. Keep fixture bodies as bare DDL/DML; rely on the calling
test's `ROLLBACK` to clean up.

**Fixture name-as-stable-handle convention.** List fixtures create
lists via `public.create_list(...)`, whose `id` is `gen_random_uuid()`
— so fixture-created list IDs are *not* deterministic across runs.
Fixtures expose their lists by **name** instead: `'Shared list'` for
`list_shared_alice_bob.sql`, `'Solo list'` for `list_solo_alice.sql`.
Tests that need the id look it up:
`(SELECT id FROM public.lists WHERE name = 'Shared list')`. Names are
unique across the fixture set (each fixture creates exactly one list,
under a different name), so a test that loads several list fixtures —
e.g., `rls_list_members.sql`'s PK-freeze assertion, which needs both
the shared list's id and the solo list's id at once — can capture
both via name lookup without coordinating UUIDs. The same handle-by-
name pattern works for items once they're seeded by a future fixture.

**Fixture attribution-context convention.** Any fixture that INSERTs
into an attribution-bearing table (`lists`, `items`, `list_members`)
must set `request.jwt.claims` *before* the INSERT, because the
`tg_set_attribution_*` BEFORE-INSERT triggers read `public.uid()` and
write `created_by` / `added_by`; with no claims, `public.uid()`
returns NULL, the trigger sets the column to NULL, and the INSERT
fails the `NOT NULL` constraint. The pattern, used at the top of
every attributed fixture and at the top of any test step that
INSERTs directly:

```sql
SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}';
```

`SET LOCAL` scopes the GUC to the current transaction, so the
surrounding `BEGIN ... ROLLBACK` in every test file resets it
automatically. Subsequent `SET LOCAL request.jwt.claims = ...` calls
in the same transaction overwrite it (e.g., when a test switches from
"act as Alice" to "act as Bob" mid-file). Tests that go through
`public.create_list()` for the lists row don't escape the rule —
`create_list` reads `public.uid()` for `created_by` and the matching
`list_members.user_id`, so the GUC must be set before the call.

- **pgTAP test files** (~23, listed below). Every RLS file has at
  least one positive and one negative case per `CLAUDE.md` "every
  policy, positive AND negative". Every file wraps in `BEGIN ... ROLLBACK`
  per `docs/testing.md:103`.

  | File | What it proves |
  |---|---|
  | `infra_auth_stub.sql` | (1) bootstrap created `auth.users` (`has_table('auth','users')`); (2) gated `public.uid()` returns the JWT-claim UUID; (3) tombstone row exists in `auth.users` (id = `'00000000-…'`); (4) the fixture include works (`\i /db/tests/fixtures/users_alice_bob_carol.sql`, assert Alice's row). Assertion (2) is gated so the file parses cleanly in Phase A (where `public.uid()` doesn't exist yet) and is *skipped* rather than failed. The canonical gate body, the `pg_temp` shim fallback, and the Phase A skip-counter probe step all live in **Order of execution → Phase A** — that section is the single home for the gate spec; this row points there rather than restating it. In Phase A, (1) and (4) pass, (3) fails, (2) is skipped; in Phase C, all four pass. |
  | `schema_shape.sql` | `has_table` for each new table + `has_column` for every column of profiles (`id`, `display_name`, `created_at`, `modified_at`), user_settings (`id`, `theme`, `font_size`, `invite_policy`, `created_at`, `modified_at`), lists (no `modified_by`), list_members (`created_at` not `added_at`, plus `modified_at`), items, votes (`created_at` not `voted_at`, plus `modified_at`) — cheap regression net for accidental column drops or adds. |
  | `fk_set_default.sql` | For each of the 7 attribution FKs (lists.{created_by,deleted_by}, items.{created_by,modified_by,deleted_by}, list_members.{added_by,deleted_by}): delete the user from `auth.users` directly under the test session (the `cairn` superuser owns the bootstrap-stub `auth.users`, so direct DELETE works without `delete_account()`), assert the column equals the tombstone UUID. `delete_account()` itself is out of scope for step 1 — it lands in step 8. **Seed shape for the two `list_members` legs**: the row under test must have `user_id <> deleted_user` — e.g., Bob's membership row added by Alice, with the test then deleting Alice. The `user_id` CASCADE from `auth.users` runs *before* `SET DEFAULT` on `added_by`/`deleted_by`, so the obvious first attempt (Alice creates her own membership via `create_list()`, delete Alice) silently wipes the row before the assertion can read it. Cross-actor seeding (`added_by` = deleted user, `user_id` = surviving user) is the only shape that exposes the SET DEFAULT semantic. **Seed shape for the three `deleted_by` legs** (`lists.deleted_by`, `items.deleted_by`, `list_members.deleted_by`): the row under test must have `deleted_by = alice_uid` *before* the test deletes Alice. For each leg, soft-delete the row first under Alice's claims (e.g. `SET LOCAL request.jwt.claims = '{"sub":"<alice>"}'; UPDATE lists SET deleted_at = now() WHERE id = '<seeded-list>'`) — the `tg_set_attribution_*` deleted_at-transition rule fills `deleted_by` with `public.uid()` automatically. Without this precondition, `deleted_by IS NULL` on a live row, the SET DEFAULT cascade has no FK reference to repoint, and the assertion fails for reasons unrelated to the cascade (NULL ≠ tombstone). **Seed shape for the `items.modified_by` leg**: the row under test must have `modified_by = alice_uid`, *not* a different user — i.e. seed by inserting an item under Alice's claims and don't have any other user re-edit it (or have Alice re-edit her own item). The cascade for `items.modified_by` is computed against rows where `modified_by = alice` at cascade-start; if the seed has `modified_by = bob` and `created_by = alice`, the modified_by cascade has no candidate row, only the created_by cascade fires, and the modified_by assertion fails for reasons unrelated to the cascade itself — that "cascade-for-other-column doesn't spuriously rewrite modified_by" property is the load-bearing assertion in `triggers_set_attribution.sql`, not this one. Loadbearing for account-deletion. |
  | `fk_cascade.sql` | Seven CASCADE legs declared in `docs/data-model.md`'s table blocks, one assertion each so a regression in any single one surfaces independently: (a) `profiles.id` cascades on `auth.users` delete; (b) `user_settings.id` cascades on `auth.users` delete; (c) `list_members.user_id` cascades on `auth.users` delete; (d) `votes.user_id` cascades on `auth.users` delete; (e) `items.list_id` cascades on `lists` delete; (f) `list_members.list_id` cascades on `lists` delete; (g) `votes.item_id` cascades on `items` delete. (a)–(d) are tested by deleting the target row from `auth.users` directly under the test session (cairn owns the bootstrap-stub `auth.users`). (e)/(f) are tested by `DELETE FROM public.lists` (bypassing the no-DELETE-policy via cairn-superuser); (g) by `DELETE FROM public.items`. The user_settings leg is load-bearing for `delete_account()` (step 8): without the cascade, deleting an account leaves an orphan settings row in a table whose RLS policy would never let anyone read it again — invisible cruft accumulating forever. |
  | `constraints_user_settings.sql` | theme/font_size/invite_policy enum CHECK constraints reject bad values. All three enums live on `user_settings` per the doc (the structural-privacy split — see step 4b of the migration ordering); `profiles` has no CHECK constraints to test (`display_name` is unconstrained text in v1, `id` is FK-bound, `created_at` is timestamptz with default), so there is no `constraints_profiles.sql` file. |
  | `constraints_lists.sql` | name length 1..200; description ≤2000; reject empty name. |
  | `constraints_items.sql` | name length 1..500; reject empty name. |
  | `constraints_votes.sql` | value in [-3,3]; value <> 0; PK uniqueness; "no vote" = no row; **`created_at` unchanged by re-vote** — INSERT a vote with value = +1, capture its `created_at`, then `INSERT … ON CONFLICT (item_id, user_id) DO UPDATE SET value = -2` (the merge-duplicates path PostgREST takes for the `POST /votes` re-vote flow per `data-model.md:558`), and assert `created_at` matches the original capture. Load-bearing for the doc's "first vote" semantic that the renamed column now carries; without this assertion a future migration could quietly add `created_at = excluded.created_at` to the conflict-merge or drop the `tg_set_timestamps` UPDATE-side freeze and silently flip the column to "most recent vote", breaking any later UI surface that reads `created_at` as "when did Alice first weigh in on this." **Plus 1 load-bearing assertion that `modified_at` *is* bumped by re-vote** — same merge-duplicates dance, but assert the post-update `modified_at` is within a few seconds of `now()` and strictly greater than the captured original. This proves the trigger pair works as designed: `tg_set_timestamps` freezes `created_at`, `tg_set_modified_at OF (value)` bumps `modified_at`. The generic timestamp-trigger behaviour (INSERT-time client-override defeated; UPDATE-time freeze of `created_at` against direct PATCH backdating) is covered uniformly across every table by `triggers_set_timestamps.sql`, not duplicated here. |
  | `triggers_profile_on_signup.sql` | INSERT a *fresh* (non-fixture) `auth.users` row with `id = 'dddddddd-…'` and assert: (1) `public.profiles` now has that id with `display_name = 'New user'` (fixed placeholder; see Risk #10 for why the trigger doesn't read `new.email`); (2) `public.user_settings` now has that id with the three default preference values — load-bearing for the privacy split (without this, a regression that drops the user_settings INSERT leaves fresh users with no settings row and the Settings screen 404s on first PATCH). Fresh UUID is deliberate so the assertions describe the *test's* trigger invocation, not Alice/Bob/Carol's earlier one from the fixture. (3) `prosecdef = true` for `tg_profile_on_signup` in `pg_proc` (a direct catalog probe; reproducing the gotrue-role INSERT path in tests would require role-granting overhead for one assertion). (4) Tombstone insert is idempotent. (5) Tombstone profile row exists with `display_name = 'Deleted user'` (load-bearing for the `account-deletion.md` contract). (6) **Skip-branch for `profiles`**: `DELETE FROM auth.users WHERE id = '00000000-…'` (cascades both rows away), re-INSERT the auth row, assert `public.profiles` has zero rows for that id — proves the trigger took the `new.id = tombstone` branch and didn't insert a `'New user'` row that `ON CONFLICT DO NOTHING` then masked. (7) **Skip-branch for `user_settings`**: same dance, assert zero `public.user_settings` rows for the tombstone id. Without (7), a regression that drops *only* the user_settings tombstone-skip would silently start creating tombstone settings rows (no migration-inserted row exists for `ON CONFLICT` to suppress against, since step 4b deliberately doesn't insert one). Whole dance runs inside the test's `BEGIN ... ROLLBACK`. |
  | `rpc_create_list.sql` | Calling `create_list('My list')` under `SET LOCAL ROLE authenticated`: returns a `lists` row; the `lists` row has `created_by = public.uid()`; exactly one matching `list_members` row exists with `user_id = creator` and `added_by = creator`; under `SET LOCAL ROLE anon`, the call raises `permission denied for function create_list` (verified via `throws_ok`) — the function GRANT excludes anon, so the call is rejected before the body runs; **plus 1 load-bearing assertion for the body's `public.uid() IS NULL` guard** — under `SET LOCAL ROLE authenticated` with `request.jwt.claims` deliberately *not set* (so `public.uid()` returns NULL), `throws_ok` that the call raises SQLSTATE `28000` with errmsg `'not authenticated'`. This exercises the in-body guard separately from the GRANT-layer denial: a future grant slip that re-exposes EXECUTE to anon would still trip the guard, but only this assertion proves the guard exists. **Plus 1 load-bearing assertion for the body's tombstone-UID guard** — under `SET LOCAL ROLE authenticated` with `request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000"}'`, `throws_ok` that the call raises SQLSTATE `28000` with errmsg `'cannot act as the tombstone user'`. Same defence-in-depth shape as the NULL guard, on the second guard line: the only way to prove this branch exists is to drive `public.uid()` to the tombstone literal and observe the reject. |
  | `triggers_modified_at.sql` | One bump-on-real-content-change assertion per table — `tg_set_modified_at` is bound on every table now, with a per-table `OF (cols)` clause, so each binding is its own potential regression: (1) UPDATE `lists.name` bumps `modified_at`; (2) UPDATE `items.name` bumps; (3) UPDATE `profiles.display_name` bumps; (4) UPDATE `user_settings.theme` bumps; (5) UPDATE `list_members.deleted_at` (soft-remove) bumps; (6) UPDATE `votes.value` bumps. (The INSERT-time "modified_at = created_at = now()" property belongs to `tg_set_timestamps` and is covered by `triggers_set_timestamps.sql`'s six INSERT-override assertions — duplicating it here would muddy this file's purpose, which is `tg_set_modified_at`'s per-table bindings.) **Three load-bearing cascade-skip assertions, one per attribution-bearing table** — `ON DELETE SET DEFAULT` cascade leaves `modified_at` unchanged on (7) `lists`, (8) `items`, (9) `list_members`. For each: capture the table's `modified_at` for an Alice-attributed row, `DELETE FROM auth.users WHERE id = '<alice>'` (which fires the cascade UPDATE on the relevant attribution column), assert the post-cascade `modified_at` exactly equals the captured value. Load-bearing for Risk #12 (b): without the column-restricted `BEFORE UPDATE OF` declaration on each binding, the trigger fires on cascade and silently rewrites `modified_at` on every row the deleted user ever touched. One assertion per table is needed because each binding has its own per-table `OF (cols)` list — a regression that drops the `OF` clause from one binding wouldn't be caught by another's assertion. |
  | `triggers_set_timestamps.sql` | Covers the universal `tg_set_timestamps` BEFORE INSERT OR UPDATE trigger across every table that has `created_at` and `modified_at` (profiles, user_settings, lists, list_members, items, votes). For every such table, three assertions: (a) **INSERT-override** — INSERT a row with both timestamps deliberately backdated to `'2020-01-01'` and assert both stored values are within `interval '5 seconds'` of `now()`; (b) **UPDATE-freeze `created_at`** — seed, capture, then PATCH-style UPDATE with `created_at = '2020-01-01'`, assert the stored value matches the capture; (c) **UPDATE-freeze `modified_at`** — same shape, with *only* `modified_at = '2030-01-01'` in the SET list (no other columns; deliberately not in any per-table `tg_set_modified_at` `OF` list, so `t20` doesn't fire and `t05`'s freeze is the only thing standing). Without (c), a member could `PATCH /lists?id=eq.<x>` with `{"modified_at": "2030-01-01"}` and silently distort every "last modified" surface. Per-table coverage matters: a regression that drops the binding on, say, `votes` would surface as that table's assertions failing while the others stayed green. Lists-leg and items-leg INSERTs run as `cairn` (bypasses the no-INSERT-grant from step 15.a — see `triggers_set_attribution.sql`'s "Role context" note), with `request.jwt.claims` set to Alice; the other four legs can run as `cairn` or `authenticated`. |
  | `triggers_set_attribution.sql` | The attribution-bearing tables (lists, items, list_members) × the rules that apply per column. Underlying rationale lives in **Risk #11** (DEFAULT-traps) and **Risk #12** (cascade-aware gating, content-detection branch); this file triangulates every rule. Per-table-applicable: (i) **INSERT client-override** — `created_by`/`added_by` from a client-supplied UUID is overwritten with `public.uid()`. (ii) **INSERT `deleted_by := NULL`** — INSERT with `deleted_by = bob_uid` (a real, non-tombstone, FK-valid UUID; an unknown UUID would be FK-rejected before the trigger fires) and assert `deleted_by IS NULL`. (iii) **UPDATE-time attribution-lock** — under Bob's claims, attempt to PATCH the per-row "this user did it" column to Bob; assert it stays Alice. The `data-model.md:538` "prevents spoofing" claim is true for INSERT today; this assertion makes it true for UPDATE too. (iv) **deleted_by set on `deleted_at` null→non-null**. (v) **deleted_by NOT set when `deleted_at` unchanged**. (vi) **deleted_by cleared on `deleted_at` non-null→null restore**. Items-only: (vii) **INSERT `modified_by := public.uid()`**. (viii) **UPDATE-time content-edit stamps `modified_by`** — under Bob's claims, edit Alice's item's `name`, assert `modified_by = Bob`. (ix) **UPDATE-time `modified_by` anti-spoof freeze** — under Bob's claims, PATCH `modified_by = bob` with no content change, assert `modified_by` stays Alice. (x) **cascade for `items.created_by` leaves `items.modified_by` unchanged when `modified_by` points at a non-deleted user** — the load-bearing assertion for Risk #12's content-aware gate: seed `(created_by=Alice, modified_by=Bob)` (Alice creates, Bob edits), `DELETE FROM auth.users WHERE id = '<alice>'`, assert post-cascade `modified_by = Bob` *and* `created_by = '00000000-…'`. Without the gate, the trigger rewrites Bob → Alice during cascade, leaving a dangling FK once Alice's auth row is gone. **Role context**: lists-leg and list_members-leg INSERTs run as `cairn` superuser (both tables omit the INSERT grant from step 15.a; without the cairn bypass the test would hit the GRANT denial and never reach the trigger). Items can run as `cairn` or `authenticated`; pick `cairn` uniformly. Grant-layer denials are covered separately in `grants.sql`, `rls_lists.sql`, and `rls_list_members.sql`. |
  | `rls_profiles.sql` | SELECT positive (Alice sees Bob), SELECT positive (Bob sees Alice); **load-bearing unauthenticated negatives, one per defence layer**: (a) `throws_ok` under `SET LOCAL ROLE anon` that `SELECT FROM profiles` raises SQLSTATE `42501` (the GRANT-layer denial — anon has no SELECT grant in step 15.a); (b) `is(count, 0)` under `SET LOCAL ROLE authenticated` with `request.jwt.claims` deliberately *not set* — exercises the `profiles_select` policy itself, which reduces to `public.uid() IS NOT NULL` (NULL for an authenticated session with no JWT claims) and returns zero rows. Together the pair proves an unauthenticated read is denied at *both* layers — RLS without GRANT silently returns empty, GRANT without RLS would expose every profile, so testing each in isolation is the only way to catch a regression that drops one. UPDATE own succeeds; UPDATE other fails. |
  | `rls_user_settings.sql` | The structural-privacy table — every assertion exercises the `id = public.uid()` rule from a different angle. SELECT positive (Alice's claims → Alice sees her own row); **SELECT negative (Alice's claims → Alice cannot see Bob's row)** — the load-bearing assertion that distinguishes `user_settings` from `profiles`: same shape of test as `profiles_select` but the *opposite* expected outcome (Alice sees nothing, not Bob's row), proving the owner-only policy actually filters by id rather than just letting any authenticated caller through. Two unauthenticated negatives, one per defence layer (same shape as `rls_profiles.sql`): (a) `throws_ok` under `SET LOCAL ROLE anon` that `SELECT FROM user_settings` raises SQLSTATE `42501` (anon has no SELECT grant in step 15.a — see `grants.sql` for the matrix lock-in); (b) `is(count, 0)` under `SET LOCAL ROLE authenticated` with `request.jwt.claims` deliberately *not set` — the policy reduces to `id = NULL` which is never true, so zero rows. UPDATE own positive (Alice patches her own `theme`); UPDATE other negative (Alice attempts to patch Bob's `theme` — `with check (id = public.uid())` rejects). Together these six assertions form the regression net for the structural privacy that the `profiles` ↔ `user_settings` split is *for*. |
  | `rls_lists.sql` | SELECT positive (member sees), SELECT negative (non-member doesn't), SELECT negative (soft-deleted list hidden even from members through the base table — the only read path is `lists_deleted`); **load-bearing INSERT-denied assertions, one per defence layer** (the create path goes through `create_list()` only — see `rpc_create_list.sql` — and `public.lists` deliberately has no INSERT grant *and* no INSERT policy): (a) `throws_ok` under `SET LOCAL ROLE authenticated` that `INSERT INTO public.lists` raises SQLSTATE `42501` (the GRANT-layer denial — step 15.a's matrix omits INSERT for `lists`); (b) inside the same `BEGIN ... ROLLBACK`, `GRANT INSERT ON public.lists TO authenticated` (rolled back at file end), then under `SET LOCAL ROLE authenticated` with Alice's claims, assert that `INSERT INTO public.lists` raises a row-level-security policy violation (`throws_ok` on SQLSTATE `42501` with `new row violates row-level security policy`) — the policy-layer denial, since step 13's matrix omits a `lists_insert` policy. **Don't try to run leg (b) as `cairn`**: cairn is both the cluster superuser and the table owner, and Postgres exempts both from RLS unless `FORCE ROW LEVEL SECURITY` is set (it isn't), so the INSERT would silently succeed. Same anon/authenticated split shape as `rls_profiles.sql`, per the convention in `docs/testing.md` § "Database tests"; without splitting, a future change that adds an INSERT grant *or* an INSERT policy would silently re-open the orphan-list footgun while still passing a single combined check. **Plus 2 load-bearing DELETE-denied assertions, one per defence layer** — symmetric closure of "no hard-delete via API," which the doc enforces by omitting both a `lists_delete` policy and a DELETE grant: (c) `throws_ok` under `SET LOCAL ROLE authenticated` that `DELETE FROM public.lists` raises SQLSTATE `42501` (GRANT-layer denial); (d) inside the same `BEGIN ... ROLLBACK`, `GRANT DELETE ON public.lists TO authenticated` (rolled back), then under `SET LOCAL ROLE authenticated` with Alice's claims, `throws_ok` that `DELETE FROM public.lists` raises a row-level-security policy violation — the policy-layer denial, since step 13's matrix omits a `lists_delete` policy. Same "don't run leg (d) as `cairn`" caveat as (b). Without these, a future change that adds a DELETE grant *or* a permissive `lists_delete` policy would silently re-open hard-delete on shared content while still passing the rest of the suite. UPDATE positive (member can rename), UPDATE negative (non-member can't). |
  | `rls_list_members.sql` | SELECT positive/negative. **Load-bearing INSERT-denied assertions, one per defence layer** (the create path goes through `create_list()` and step 6's `accept_invitation` only — `public.list_members` deliberately has no INSERT grant *and* no INSERT policy, so direct `POST /list_members` can't silently add a non-consenting user): (a) `throws_ok` under `SET LOCAL ROLE authenticated` that `INSERT INTO public.list_members` raises SQLSTATE `42501` (the GRANT-layer denial — step 15.a's matrix omits INSERT for `list_members`); (b) inside the same `BEGIN ... ROLLBACK`, `GRANT INSERT ON public.list_members TO authenticated` (rolled back at file end), then under `SET LOCAL ROLE authenticated` with Alice's claims, assert `INSERT INTO public.list_members` raises a row-level-security policy violation (`throws_ok` on SQLSTATE `42501` with `new row violates row-level security policy`) — the policy-layer denial, since step 13's matrix omits a `list_members_insert` policy. **Don't try to run leg (b) as `cairn`**: cairn is both the cluster superuser and the table owner and is exempt from RLS unless `FORCE ROW LEVEL SECURITY` is set (it isn't), so the INSERT would silently succeed. Same defence-in-depth shape as `rls_lists.sql`: without splitting, a future change that adds either an INSERT grant or an INSERT policy would silently re-open the consent gap while still passing a single combined check. UPDATE positive (self soft-removes — see Risk #1); UPDATE positive (member kicks another member — soft-removes their row, the deliberate flat-permissions feature; see `data-model.md`'s `list_members` prose); UPDATE positive (member restores another member's soft-removed row — the symmetric counterpart of kick); UPDATE negative (outsider — non-member — can't update any row). **Plus 1 load-bearing UPDATE-negative for the kicked-user self-restore footgun**: under Bob's claims after Alice has kicked Bob, assert `UPDATE public.list_members SET deleted_at = NULL WHERE list_id = '<list>' AND user_id = '<bob>'` returns zero affected rows (the `using` clause `is_list_member(list_id)` is false for kicked Bob, so his soft-removed row is invisible to him for PATCH). Without this assertion, a kick would be trivially undone by the kicked user, defeating its purpose; the `using`-clause filter is what gives kick teeth, and a future refactor that broadens it would silently neutralize the feature. **Plus 2 load-bearing UPDATE-negatives for the `tg_freeze_list_members_pk` trigger** (the consent-closure guard added in step 10): (a) under Alice's claims (a live member of the shared list), `throws_ok` that `UPDATE public.list_members SET list_id = '<list_solo_alice's list_id>' WHERE list_id = '<shared-list>' AND user_id = '<alice>'` raises SQLSTATE `P0001` with errmsg `'list_members PK columns are immutable'`; (b) same shape under Alice's claims for the symmetric `SET user_id = '<carol>'` mutation (rewriting an existing row's user_id to point at a third party). The Alice-as-member shape is deliberate: the `list_members_update` policy lets her PATCH her own self-row's `list_id` — `is_list_member(list_id)` passes via OLD-membership in the shared list, and `WITH CHECK` passes via the `or user_id = public.uid()` self-row branch — so the trigger is the only thing standing between her and a self-add to any list whose UUID she can obtain (concretely: `list_solo_alice.sql` is loaded too, giving her a known second list_id she's already in, but the same vector applies to any UUID she can guess or copy). Running these assertions as `cairn` superuser would still fire the freeze (triggers are not bypassed by superusers the way RLS is), but it would skip the policy layer — the assertion we want to lock in is "the policy lets the row through and only the freeze catches it," which is only exercised under `authenticated`. Without (a), a member can self-add to any list; without (b), a member can graft a non-member onto a list. Both bypass the structural consent closure that step 11's `create_list` and step 6's `accept_invitation` are the only sanctioned membership-write paths for. See Risk #13 for the full rationale. |
  | `rls_items.sql` | SELECT positive (member sees), SELECT negative (non-member doesn't), SELECT negative (soft-deleted item hidden even from members through the base table — the only read path is `items_deleted`); INSERT positive; INSERT negative (non-member); UPDATE positive (any member edits); UPDATE negative (outsider); **plus 2 load-bearing DELETE-denied assertions, one per defence layer** (symmetric to `rls_lists.sql`'s DELETE-denied legs — the doc closes "no hard-delete via API" on items by omitting both a `items_delete` policy and a DELETE grant): (a) `throws_ok` under `SET LOCAL ROLE authenticated` that `DELETE FROM public.items` raises SQLSTATE `42501` (GRANT-layer denial — step 15.a's matrix omits DELETE for `items`); (b) inside the same `BEGIN ... ROLLBACK`, `GRANT DELETE ON public.items TO authenticated` (rolled back), then under `SET LOCAL ROLE authenticated` with Alice's claims, `throws_ok` that `DELETE FROM public.items` raises a row-level-security policy violation — the policy-layer denial, since step 13's matrix omits an `items_delete` policy. Same "don't run leg (b) as `cairn`" caveat as `rls_lists.sql`'s. Without these, a future change that adds a DELETE grant *or* a permissive `items_delete` policy would silently re-open hard-delete on shared content. |
  | `rls_votes.sql` | SELECT positive (member sees vote on a live item), SELECT negative (non-member sees nothing); **SELECT positive (member sees vote on a *soft-deleted* item)** — load-bearing companion to the trailing parenthetical on this row, locking in the doc's deliberate decision to leave `votes_select` unfiltered on `items.deleted_at` (`docs/data-model.md:447-451`). Seed: Alice votes +2 on an item, then a member soft-deletes the item (`PATCH /items` with `deleted_at`); under Bob's claims, assert the vote row is still visible through `GET /votes` (and through the equivalent direct `SELECT FROM public.votes`). Without this assertion, a regression that copy-pasted `votes_insert`'s `i.deleted_at IS NULL` filter into `votes_select` would silently strip historical-vote visibility from the trash UI without lighting up any other test red. INSERT positive; INSERT negative (user_id ≠ public.uid()); INSERT negative (non-member); **INSERT negative (member, but item is soft-deleted)** — the `votes_insert` policy filters its `exists` subquery on `is_list_member(i.list_id) and i.deleted_at is null`, so a vote on a trashed item is rejected by the policy even from a member; load-bearing because the `score` for an item resurfaces the moment it's restored, and an unfiltered policy would let votes accumulate on trash and silently change the post-restore ordering. UPDATE own positive; UPDATE other negative; **UPDATE negative (member, but item is soft-deleted)** — same shape as the INSERT negative, against `votes_update`'s mirrored filter; without it, a member could keep changing their vote on a trashed item. DELETE own positive; DELETE other negative. (`votes_select` deliberately stays unfiltered — historical votes on a deleted item remain visible per the doc's "members can see all votes" rule, and the new SELECT-positive-on-soft-deleted-item assertion above is what locks that intent in.) |
  | `views_items_ranked.sql` | score = sum; positive/negative/total voters counts; soft-deleted items excluded; no-votes item has score=0; view inherits RLS (non-member sees nothing). |
  | `views_items_deleted.sql` | only soft-deleted rows visible to a member; `deleted_at`/`deleted_by` exposed; live items absent; **non-member sees zero rows through the view** — the load-bearing test that the explicit `is_list_member()` filter is the only authorization gate (since the view runs `security_invoker = false` and bypasses RLS); **soft-removed (former) member sees zero rows through the view** — load-bearing companion that locks in `is_list_member()`'s `deleted_at IS NULL` clause (per `docs/data-model.md:307` "a member who has soft-removed themselves can no longer restore items in a list they've left"); without this, a regression that drops the membership-deleted-at filter would silently re-expose every list's trash to every ex-member. |
  | `views_lists_deleted.sql` | only soft-deleted lists visible to a current member; live lists absent; **non-member sees zero rows through the view** — same load-bearing assertion as `views_items_deleted.sql`; **soft-removed (former) member sees zero rows through the view** — same load-bearing companion as `views_items_deleted.sql`, locking in the "current member only" semantic per `docs/data-model.md:328`. |
  | `grants.sql` | `has_table_privilege('authenticated', …)` for the step 15.a matrix — every (table, verb) granted to authenticated asserted positive, plus **load-bearing INSERT negatives** for `public.lists` (closes the orphan-list footgun), `public.list_members` (closes the consent-bypass footgun — a future grant slip that re-added INSERT to authenticated would silently let any member add any user to a list without going through `accept_invitation`), `public.profiles`, and `public.user_settings` (locks in that profile and settings rows are trigger-only — a future grant slip that added INSERT to authenticated would silently let clients race the trigger and create stub rows with arbitrary defaults). `has_table_privilege` SELECT positives on the three views; `has_function_privilege` EXECUTE positives on `public.{uid, is_list_member, create_list}` for authenticated; **load-bearing EXECUTE negative for anon on `create_list`** (mirrors the `rpc_create_list.sql` `throws_ok`). **Anon-coverage negatives** that lock in the doc's "Anonymous users have no access to any table" rule — `has_table_privilege('anon', …, …)` returns `false` for every (new-table, verb) and `has_function_privilege('anon', …, 'EXECUTE')` is `false` for `public.is_list_member(uuid)` and `public.uid()` (the latter included for symmetry with the other two helpers — step 15.b's `REVOKE EXECUTE … FROM PUBLIC` covers all three, and a future grant slip that re-exposed any one of them would otherwise slip past the regression net). Without the anon coverage, the GRANT matrix only mechanically pins authenticated; a future migration that grants any verb to anon (or re-grants `EXECUTE` to `PUBLIC`) would silently widen the surface. Closes Risk #6 — RLS without GRANT silently returns empty, and the smoke check no longer hits `/profiles` so it can't catch a missing grant. |

  The whole suite runs in well under a second.

### Modified files

- **`scripts/test-db.sh`** — two edits, both Phase A:
  1. Between line 26 (`CREATE DATABASE`) and the migration loop at
     line 30, add a step that runs `db/test-bootstrap.sql` against
     `cairn_test`. Keep `set -euo pipefail` so a bootstrap failure
     aborts the run. The path is `db/test-bootstrap.sql` (not
     `db/tests/bootstrap.sql`) — see the bootstrap file's entry
     above for why it sits outside `db/tests/`.
  2. Immediately before the `pg_prove` invocation (line 43–44),
     add a guard that fails fast if any top-level
     `db/tests/*.sql` lacks a `plan(` call. The script already
     has `shopt -s nullglob` in effect, which means a literal
     `grep -L 'plan(' db/tests/*.sql` would expand to
     `grep -L 'plan('` if the directory is ever empty — and
     `grep` with no file arguments reads from stdin and hangs
     the script forever. Capture into an array first and bail
     loudly if it's empty:
     ```bash
     files=(db/tests/*.sql)
     if [ ${#files[@]} -eq 0 ]; then
       echo "no test files in db/tests" >&2
       exit 1
     fi
     if missing=$(grep -L 'plan(' "${files[@]}") && [ -n "$missing" ]; then
       echo "test files missing plan(N) declaration:" >&2
       echo "$missing" >&2
       exit 1
     fi
     ```
     The bootstrap file is already kept out of `db/tests/` by
     convention; this check enforces the convention rather than
     relying on it. A fixture or scratch file dropped into
     `db/tests/` without a `plan(N)` would otherwise red the
     suite with a confusing pg_prove error ("no plan declared")
     rather than this scoped failure.

- **`scripts/migrate.sh`** — **Phase C**, in the same commit as
  the `0004` migration that motivates the changes (and the
  `.env.example` entry below). Don't land in Phase A: the new
  poll waits for `auth.users` to exist before applying any
  migration numbered `0004` or later, and a Phase A
  `./scripts/migrate.sh` would block on the poll forever
  because no migration creates `auth.users` until `0004` itself
  ships in Phase C. Wrap the migration loop with a bounded
  `auth.users`-presence poll, fired *only* when about to apply a
  migration whose number is `0004` or later. Why gated, not
  unconditional in front of the loop: GoTrue cannot create
  `auth.users` until the `gotrue` role exists, and the `gotrue`
  role is itself created by `0001_init.sql` (with the `postgres`
  stub coming from `0003`). An unconditional poll in front of the
  loop would deadlock on a fresh `docker compose up -d` — the poll
  would wait for `auth.users`, which is waiting for GoTrue, which
  is waiting for the loop the poll itself is gating. Gating on
  filename keeps `0001`–`0003` running unconditionally (so GoTrue
  becomes able to start), and only then waits for GoTrue's first
  successful connection before `0004` (and any future migration
  that references `auth.users`) lands. The poll caps at 60
  iterations (~60 s) by default, **overridable via the
  `MIGRATE_AUTH_USERS_TIMEOUT` env var** for slow-CI or
  cold-VPS debugging — so a misconfigured GoTrue doesn't hang
  the script forever; it exits non-zero with a hint to check
  `docker compose logs gotrue`. Inside the existing
  `for f in db/migrations/*.sql; do` loop, immediately after the
  `applied=$(...)` skip-if-already-applied check and before
  `echo "applying $name"`:

  ```bash
  prefix="${name%%_*}"
  if [ "$((10#$prefix))" -ge 4 ]; then
    # Migrations from 0004 onward reference auth.users; wait for
    # GoTrue to have run its own startup migration. Skipped for
    # 0001-0003 (they create the gotrue role itself — without
    # those, GoTrue can't even connect).
    echo "==> waiting for gotrue to create auth.users"
    timeout="${MIGRATE_AUTH_USERS_TIMEOUT:-60}"
    for i in $(seq 1 "$timeout"); do
      if "${PSQL[@]}" -tAc \
          "SELECT to_regclass('auth.users') IS NOT NULL" \
          | grep -q '^t$'; then
        break
      fi
      if [ "$i" -eq "$timeout" ]; then
        echo "auth.users still missing after ${timeout}s — is GoTrue running?" >&2
        echo "  check: docker compose logs gotrue" >&2
        exit 1
      fi
      sleep 1
    done
  fi
  ```

  Once `auth.users` exists the poll's first check returns true, so
  the per-migration cost after the first wait is one round-trip to
  Postgres — negligible. The `10#$prefix` arithmetic forces base-10
  parsing so a leading zero (`0010`) doesn't get mistaken for octal.
  The test path (`scripts/test-db.sh`) doesn't need this — it stubs
  `auth.users` via `bootstrap.sql` before migrations run.

  **Also**, after the `for f in db/migrations/*.sql; do ... done` loop
  ends and before the final `echo "migrations up to date"`, append a
  PostgREST schema-cache reload:

  ```bash
  "${PSQL[@]}" -c "NOTIFY pgrst, 'reload schema'" >/dev/null
  ```

  PostgREST caches the schema at startup; without the notify, a
  fresh `0004` lands but `curl http://localhost:3000/<new_table>`
  returns a 404 until the container is bounced. PostgREST v10+
  listens for the `pgrst` channel and reloads on receipt — one
  statement, near-zero cost, and it makes every future migration
  visible to the API immediately. The doc-side bullet already
  lives at `docs/development.md:204` (added when this trap was
  first noticed); this change just brings the code into line
  with what the doc has been promising — no further doc edit
  needed for this point.

- **`db/seed/dev_seed.sql`** — gut it. The current "insert two
  smoke profiles" rows can't survive once `profiles.id` is an FK to
  `auth.users(id)`, and we deliberately do *not* insert into
  `auth.users` directly: GoTrue's real schema has version-dependent
  NOT NULL columns (`instance_id`, metadata, etc.) that a bare
  two-column insert won't satisfy, and any row we hand-craft would
  be one GoTrue refuses to authenticate against. So this plan
  reduces `dev_seed.sql` to a top-of-file comment explaining that
  real seed users (Alice/Bob) land in step 3 of
  `plans/0000_implementation_order.md` once GoTrue and the dev
  magic-link shortcut are wired up; until then, the dev DB starts
  empty and developers create their own user via Mailpit. Cross-link
  to `docs/testing.md:65-68` so it's clear this file is not the
  authoritative test fixture.

- **`docs/development.md`** — three edits, all Phase A, in the
  same commit as the `dev_seed.sql` gut so the doc and code
  never disagree on disk:

  1. Rewrite the "Seed data" section (lines 221–225 today) to
     match the gutted `dev_seed.sql`. The current text describes
     Alice/Bob/Carol seed users and a `VITE_DEV_LOGIN_SHORTCUT`-
     gated dev login, neither of which exists once Phase A guts
     the seed; leaving the doc as-is would describe a feature
     that's gone for the duration of steps 1 through 3 (when
     GoTrue + the magic-link flow + real seed users land
     together). New text: one short paragraph saying the dev
     DB starts empty until step 3, that developers create their
     own account via Mailpit, and that the
     `VITE_DEV_LOGIN_SHORTCUT` paragraph will return alongside
     step 3's plan.

  2. Replace the "Hit the API directly" snippet (lines 295–306
     today, the `curl … alice@example.test … password` GoTrue
     token-fetch example). It depends on the same seed users
     Phase A removes: the email/password GoTrue login route
     would 400 against an empty `auth.users` between Phase A
     and step 3. New text: a one-line note saying the dev-token
     shortcut returns alongside step 3's GoTrue + magic-link
     wiring, and that until then the API is reachable via the
     manual `psql` path above and via PostgREST's anon OpenAPI
     root. Same justification as edit (1): don't leave the doc
     describing a feature that's gone for the duration of
     steps 1 through 3.

  3. *(no edit — the `MIGRATE_AUTH_USERS_TIMEOUT` paragraph
     already lives at `docs/development.md:210`, added by the
     prior reconciliation pass. Kept as a numbered entry so the
     timeline stays auditable; same shape as the schema-cache
     reload's "no further doc edit needed" disclaimer above.)*

- **`.env.example`** — add a commented entry for the new
  `MIGRATE_AUTH_USERS_TIMEOUT` knob (default 60s, override only
  for slow CI / cold VPS), so the var surface is discoverable
  in the canonical place rather than buried in `migrate.sh`.
  Single line, e.g. `# MIGRATE_AUTH_USERS_TIMEOUT=60   # bump
  if your machine is slow to start GoTrue`. **Phase C**, in the
  same commit as the `migrate.sh` changes that introduce the
  variable — the env knob and its consumer ship together so a
  Phase A or B reader doesn't see a documented variable that
  nothing reads yet.

- **`db/tests/smoke.sql`** — delete (superseded by `infra_auth_stub.sql`).

- **`scripts/smoke.sh`** — drop the `/profiles` block entirely.
  After this migration, anon has no `SELECT` grant on
  `public.profiles` (the new grant matrix is `authenticated`-only),
  so PostgREST returns 401 *before* RLS even runs — the previously
  proposed "accept empty array" relaxation can't help when the
  response isn't an array. Removing the block also keeps the smoke
  honest about anon's surface area: anon should see *nothing* under
  the new model, and the smoke shouldn't pretend otherwise. The
  remaining smoke checks (PostgREST OpenAPI root, GoTrue `/health`,
  Mailpit UI, optional SvelteKit dev server) still prove the
  service mesh is up. Step 3 reintroduces an authenticated probe
  via the magic-link flow.

  **Schema-reachability is deliberately deferred.** Removing the
  `/profiles` block leaves a gap: `curl http://localhost:3000/`
  proves PostgREST is *responding*, but its OpenAPI doc is
  rendered for the requesting role, and an anon request to the
  root produces a doc with no `paths` for our new tables (anon
  has no operations on them). The OpenAPI body therefore can't
  cheaply confirm PostgREST has introspected the post-0004
  schema. We accept this gap until step 3 wires up the magic-
  link flow and lands an authenticated smoke probe (`GET
  /lists` as Alice → 200 with her empty array). Until then, the
  schema-up check is the manual `psql -c "\dt public.*"` step
  in *Verification* below — explicit, one-off, and good enough
  given step 3 is next on the roadmap. Document this in the
  smoke script itself with a comment near the deleted block so
  the next reader doesn't re-add a broken probe.

- **`plans/0000_implementation_order.md`** — once this plan is
  executed and merged, tick the step 1 checkbox.

### Files to leave alone

- `db/migrations/0001_init.sql`, `0002_auth_schema.sql`,
  `0003_postgres_role.sql` — already-applied; new work goes in `0004`.
- `db/Dockerfile` — pgTAP image already wired.
- `scripts/check.sh` — already runs `test-db.sh`.

## Risks & gotchas

1. **`list_members_update` self-removal.** `is_list_member()` returns
   false for a member after they soft-remove themselves
   (`deleted_at` set), so a `WITH CHECK (is_list_member(list_id))`
   would reject the very update that removes them. The form the
   doc has settled on — `WITH CHECK (public.is_list_member(list_id)
   OR user_id = public.uid())` — handles this; see
   `docs/data-model.md:436` for the policy and line 445 for the
   rationale. The self-removal assertion in `rls_list_members.sql`
   is the regression guard, not the discovery mechanism — step 13
   ships the doc's form directly.

2. **`SET LOCAL ROLE` from a superuser session needs no explicit
   GRANT.** Earlier drafts of this plan added `GRANT authenticated,
   anon TO cairn` in `bootstrap.sql` on the assumption that the
   target role had to be granted to the session user before `SET
   LOCAL ROLE` would succeed. That rule applies only to *non-
   superuser* sessions. `cairn` is the Postgres superuser per
   `docker-compose.yml`'s `POSTGRES_USER: cairn`, and superusers
   bypass the role-membership check on `SET LOCAL ROLE` — the
   target role only has to *exist*. `bootstrap.sql` therefore
   creates the `authenticated` and `anon` roles (idempotent
   `DO $$ … END$$` blocks, mirroring `0001_init.sql`) but does
   not grant them to anyone. If a future test uses a non-
   superuser connection (e.g., `authenticator`-via-PostgREST in
   an integration probe), reintroduce the grant *to that role
   only*, with the rationale spelled out at the call site.

3. **Trigger order matters, and the plan now relies on it.**
   Postgres fires triggers in the same BEFORE/AFTER bucket
   alphabetically by *binding* name, so the migration uses
   four numeric prefixes — `t01_*`, `t05_*`, `t10_*`, `t20_*` —
   to lock the order. Three of those orderings are
   load-bearing, not just defensive:
   - `t01_freeze_list_members_pk` short-circuits before
     `t05_set_timestamps` / `t10_set_attribution_list_members`
     / `t20_set_modified_at_list_members`, so a PK-mutation
     UPDATE rejects without burning per-row freeze/derive
     work and without fattening the `RAISE EXCEPTION` stack
     trace with downstream NOTICEs (see Risk #13).
   - `t05_set_timestamps` runs before `t20_set_modified_at_*`
     so its UPDATE-side `NEW.modified_at := OLD.modified_at`
     freeze is in place before `t20`'s `now()` overwrite —
     and `t20`'s `OF (cols)` clause is what decides whether
     `t05`'s freeze stays or gets overwritten on this
     particular UPDATE. The `t05` → `t20` ordering is the
     mechanism by which "client PATCH of `modified_at` only
     is frozen" and "real content edit bumps `modified_at`"
     coexist in the same trigger pair (see step 10's
     `tg_set_timestamps` bullet and the cascade-skip half of
     Risk #12.b).
   - `t10_set_attribution_*` runs after `t05` and before
     `t20`, so it sees the frozen timestamps and runs ahead
     of the `modified_at` decision; today this doesn't change
     attribution behaviour, but it keeps the
     "freeze → derive → bump" reading order consistent in
     `\d <table>` output and is robust against a future
     attribution rule that would care about timestamp state.
   `tg_profile_on_signup` is `AFTER INSERT ON auth.users` and
   has no co-firing trigger in that bucket, so it stays
   un-prefixed (the prefix convention applies only to
   BEFORE bindings on `public.*` tables where multiple
   triggers may share the bucket). List-creation membership
   is no longer a trigger; it's the `create_list()` RPC, so
   there's no AFTER-INSERT-on-`lists` ordering concern.

4. **Policy + trigger interaction on `items_insert`.** Trigger sets
   `created_by = public.uid()` *before* policy `WITH CHECK` evaluates
   `public.uid() = created_by`. So a client INSERT with `created_by =
   bob_uuid` while authenticated as Alice ends up with Alice's UUID
   stored — exactly per `docs/data-model.md:482`. Tested in
   `triggers_set_attribution.sql`. (The same interaction would have
   applied to `lists_insert` and `list_members_insert`, but neither
   table has an INSERT policy any more — list creation goes through
   `create_list()` only, and membership writes go through
   `create_list()` + step 6's `accept_invitation`.)

5. **`security definer` + `search_path`.** `is_list_member()` is
   `SECURITY DEFINER` — `SET search_path = public` defeats schema-
   shadowing privilege escalation, and the defense is genuinely
   load-bearing there (the function runs as its `cairn`-superuser
   owner, so a shadowed `public.list_members` lookup would let a
   caller exfiltrate membership rows they shouldn't see).
   `public.uid()` is `SECURITY INVOKER` (default), so a schema-
   shadowing attack against it can't elevate privilege — the
   `SET search_path = public` clause on it is hygiene rather than
   a security boundary, kept for symmetry with `is_list_member()`
   and to keep both helper definitions structurally identical.
   `tg_profile_on_signup()` is the third `SECURITY DEFINER` body
   in the migration and gets the same treatment for the same
   load-bearing reason. See `docs/data-model.md:316`.

6. **GRANTs are mandatory.** RLS without `GRANT` produces a silent
   empty result via PostgREST. Easy to forget; covered in step 15
   of the migration ordering. The canonical verification at this
   plan's scope is `grants.sql` (positive matrix plus load-bearing
   negatives for the omissions — see the test row for the breakdown).
   The smoke script previously hit `/profiles` to exercise the
   matrix end-to-end, but this plan removes that probe (anon has no
   SELECT grant on `profiles` after `0004` and would get a 401
   anyway), so until step 3 wires the magic-link flow and an
   authenticated `/lists` probe, `grants.sql` is the only
   mechanical check that the matrix is correct.

7. **`votes` has no soft-delete.** Hard delete only
   (`docs/data-model.md:177`). No `deleted_at` column, no `*_deleted`
   view. Don't accidentally add one for "consistency."

8. **Soft-deleted rows are unreachable except through the trash
   views.** `lists_select` and `items_select` keep their `and
   deleted_at IS NULL` filter, so a direct `GET /lists` or
   `GET /items` (and `items_ranked`, which inherits the caller's
   RLS via `security_invoker = true`) cannot return soft-deleted
   rows — to anyone, member or not. The only read path for
   soft-deleted rows is the trash views, which run
   `security_invoker = false` (so they bypass RLS as the owner)
   and gate access with an explicit `public.is_list_member(<list>)`
   in the view body. This is the principled "no leak of deleted
   content" choice: the base table API surface contains *only* live
   data; the trash is an explicit, separately-authorized read.
   Two consequences worth knowing: (a) the load-bearing test for
   the trash views' authorization is the negative
   `non-member sees zero rows` assertion in
   `views_items_deleted.sql` and `views_lists_deleted.sql` —
   without it, a future refactor that drops the
   `is_list_member()` filter would silently expose every list's
   trash to every authenticated user; (b) restore from trash
   still goes through `PATCH /items` / `PATCH /lists`, gated by
   the live `*_update` policy — and `*_update` checks
   `is_list_member()` against `list_members.deleted_at IS NULL`,
   which means a soft-removed member can no longer restore items
   in a list they've left, even if they had access to the trash
   when their membership was live. That's the desired behaviour.

9. **Tombstone insert idempotency.** `ON CONFLICT (id) DO NOTHING`
   on both the `auth.users` and `profiles` inserts — protects
   against re-running on a non-empty test DB and against the
   `profile_on_signup` trigger racing the manual profile insert.
   The two-column `(id, email)` form is the minimum viable insert
   against the pinned `supabase/gotrue:v2.158.1` schema; the
   columns it relies on, the test-stub parity, and the
   GoTrue-upgrade caveat live in
   `docs/account-deletion.md` → "auth.users columns the tombstone
   insert depends on" — a future GoTrue image bump must re-validate
   the insert against the new schema, or both this migration and
   the step-8 `delete_account()` RPC will silently break.

10. **`display_name` placeholder must not be derived from
    email.** Cairn's privacy contract is that email is private
    and never shown in the UI; the email's local part is often
    the user's real name. The on-signup trigger therefore sets
    `display_name = 'New user'` rather than reading
    `new.email` — rendering an email-derived value as
    `display_name` would leak email content through every UI
    surface that shows the placeholder during the brief window
    before the user sets their own name on first launch. The
    first-launch screen detects the placeholder and forces a
    "What should we call you?" prompt before any other action.

11. **`deleted_by` DEFAULT-trap on INSERT.** The seven attribution
    FKs all use `ON DELETE SET DEFAULT` with the column DEFAULT
    set to the tombstone UUID — that's how account deletion
    repoints attribution at once (per `account-deletion.md`'s
    "Schema changes" list). Postgres applies the column DEFAULT
    on `INSERT`-without-value *too*, which is fine for
    `created_by`/`modified_by`/`added_by` (the trigger overwrites
    with `public.uid()` anyway), but is *wrong* for `deleted_by`:
    a freshly inserted live row must have `deleted_by IS NULL`,
    not the tombstone, because the row hasn't been deleted yet.
    The `tg_set_attribution_*` BEFORE-INSERT branch sets
    `NEW.deleted_by := NULL` unconditionally — written that way,
    not "if the client didn't send a value," because we
    deliberately ignore client-sent attribution everywhere.
    Without the override every fresh live row would silently
    render as "deleted by Deleted user." Test coverage in
    `triggers_set_attribution.sql` (load-bearing INSERT
    assertions, one per attribution-bearing table).

12. **`ON DELETE SET DEFAULT` cascade fires user-defined BEFORE
    UPDATE triggers — and the attribution-freeze must let it
    pass.** Postgres implements `ON DELETE SET DEFAULT` as an
    internal `UPDATE <referencing-table> SET <fk-col> = DEFAULT
    WHERE <fk-col> = <deleted-id>`, executed via SPI through
    the standard executor — which fires user-defined BEFORE
    UPDATE triggers normally. Without a gate, the
    `tg_set_attribution_*` UPDATE branch's `NEW.<col> :=
    OLD.<col>` reverts the cascade's transition (NEW = tombstone
    → reverted to OLD = the about-to-be-deleted UUID), the
    cascade UPDATE becomes a no-op, `RI_FKey_check_upd` skips
    its FK re-check because the columns didn't change, and the
    referenced `auth.users` row is then deleted — leaving every
    `created_by` / `modified_by` / `added_by` previously
    attributed to the deleted user as a dangling FK reference
    instead of repointed to the tombstone. `delete_account()`
    (step 8) would *appear* to succeed and silently leak
    corruption into the schema. The same trap applies to the
    items trigger's `NEW.modified_by := public.uid()` line
    (during cascade `public.uid()` resolves to the user being
    deleted, with the same dangling-FK outcome). Two-part fix,
    both halves of which live in the trigger functions in step
    10:

    a. **Attribution trigger — gate the `created_by` /
       `added_by` freeze on tombstone transition; gate the
       items `modified_by` rules on content-change
       detection.** For `created_by` (lists, items) and
       `added_by` (list_members), the freeze is wrapped in
       `IF NEW.<col> IS DISTINCT FROM
       '00000000-0000-0000-0000-000000000000' THEN
       NEW.<col> := OLD.<col>; END IF`. The cascade always
       sets NEW to the tombstone, so the gate lets the
       transition through; client UPDATEs that send a
       non-tombstone value still get reverted. For items
       `modified_by` the per-column tombstone gate is
       insufficient on its own — the Bob-edited-Alice's-item
       cascade case rewrites `modified_by` to the deletion
       subject and leaves a dangling FK after the parent
       DELETE. Fix: a content-aware gate (the modified_by
       rules fire only when an actual content column
       changed) plus a separate tombstone-gated freeze for
       direct PATCH spoofs of `modified_by` itself. Full body
       lives in step 10's items bullet. Two design choices
       worth recording: (i) the simpler `created_by` gate
       admits a client PATCH of `created_by = '00000000-…'`
       (vandalism, not privilege escalation — the user can
       already self-tombstone via account deletion); (ii) the
       `BEFORE UPDATE OF (cols)` trick used for `tg_set_
       modified_at` (b) doesn't work here because the
       attribution freeze needs to fire on attribution-only
       UPDATEs.

    b. **Modified-at trigger (use `BEFORE UPDATE OF
       <non-attribution-cols>`).** The simpler half. Cascade
       SET DEFAULT only touches attribution columns, so a
       column-restricted `OF` clause means the trigger never
       fires during cascade — `modified_at` stays at its real
       "last content change" value instead of getting bumped on
       every list/item the deleted user ever touched. (Listed
       per-table in step 10.) Without this, an active user's
       account deletion silently rewrites `modified_at` on
       every row they ever created/modified, breaking any UI
       surface that reads it as "when did the content last
       change."

    Test coverage: `fk_set_default.sql` (positive proof for
    gate (a)), `triggers_set_attribution.sql` (UPDATE-time
    attribution-lock + items `modified_by` content-aware gate,
    both branches), `triggers_modified_at.sql` (cascade-skip
    for gate (b)). Per-assertion rationale lives in each row of
    the test table — this risk is the *why*, the test rows are
    the *what*. A regression that drops either half lights up
    the matching row red.

13. **`list_members` PK is mutable-by-policy and must be frozen
    by trigger.** The `list_members_update` policy uses
    `WITH CHECK (public.is_list_member(list_id) OR user_id =
    public.uid())`. The `or user_id = public.uid()` clause is
    load-bearing for self-removal (Risk #1) — a member's own
    soft-deleted row no longer satisfies `is_list_member()`, so
    the alternate self-row gate is what lets the soft-removal
    update commit. The same clause has a less-obvious second
    effect: it lets a member PATCH *any* column of their own
    row — including the PK columns. A live member of list A
    can `PATCH /list_members?list_id=eq.<A>&user_id=eq.<self>`
    with body `{"list_id": "<B>"}` and Postgres will accept the
    UPDATE: the `using` clause checks `is_list_member(list_id)`
    against the OLD row (member of A → true), the `with check`
    is satisfied via the self-row branch, and the FK on
    `list_id` only requires list B to exist. Net: self-add to
    any list whose UUID the caller can obtain (shared
    screenshots, leaked URLs, accidental copy-paste), bypassing
    the structural consent closure that step 11's `create_list`
    and step 6's `accept_invitation` are supposed to make the
    only sanctioned membership-write paths. The symmetric
    vector via `user_id` mutation lets a member rewrite a row
    to point at a third party. Closure: a tiny
    `tg_freeze_list_members_pk` trigger (step 10), bound as
    `t01_*` so it short-circuits before timestamps,
    attribution, and `modified_at` work runs. Asymmetry with
    Accepted trade-offs' note on `votes` PK mutability is
    deliberate: the `votes` shape is a vote-move between lists
    the caller is *already* a member of (the policy itself
    pins the new list to one with membership), so the worst
    impact is a vote moving without a `modified_at` bump —
    bounded enough to defer. The `list_members` shape is a
    membership self-add to a list the caller is *not* a
    member of, which is privilege escalation and has to land
    here. Test coverage: the two `throws_ok` assertions in
    `rls_list_members.sql` (one per PK column).

## Existing patterns to reuse

There's not much in this repo yet (it's pre-production), but:

- `BEGIN; … COMMIT;` migration wrapping (`db/migrations/0001_init.sql:7,
  68`).
- `DO $$ … END$$;` idempotent guards
  (`db/migrations/0001_init.sql:13-33`).
- `IF NOT EXISTS` on `CREATE TABLE` for re-runnability
  (`db/migrations/0001_init.sql:43, 49`).
- `.sqlfluff` style: postgres dialect, 2-space indent, UPPERCASE
  keywords, lowercase identifiers, max 100 chars
  (`/.sqlfluff:1-5`). Run `sqlfluff lint db/` before claiming green;
  lefthook also enforces on commit.

## Order of execution (TDD)

1. **Phase A — bootstrap + infra check.** Add `db/test-bootstrap.sql`
   (top-level under `db/`, not under `db/tests/`, so pg_prove won't
   enumerate it as a test) and patch `scripts/test-db.sh` to apply it. Add the
   `db/tests/fixtures/users_alice_bob_carol.sql` fixture (the
   simplest of the three new fixtures; the other two land in
   Phase B). Write `infra_auth_stub.sql` (4 assertions). All
   fixture includes are absolute paths (`\i
   /db/tests/fixtures/...`) per the fixture-path convention in
   "Files → New files". The `public.uid()` assertion is gated by
   a `DO $$ ... END$$` block that uses `EXECUTE 'SELECT
   public.uid()' INTO v;` inside the THEN branch (full snippet
   in the `infra_auth_stub.sql` row of the test table); the
   dynamic-SQL form is required because a plain `SELECT CASE
   WHEN has_function(…) THEN is(public.uid(), …) ELSE skip(…)
   END;` would error at parse time with `function public.uid()
   does not exist` (Postgres resolves both CASE branches during
   analysis to derive the result type). The `EXECUTE` defers
   parsing to runtime so the file short-circuits cleanly in
   Phase A (where `0004` hasn't shipped yet) instead of aborting
   with a parse error. **Also gut `db/seed/dev_seed.sql` to its top-of-file
   comment now** (final shape is described in "Modified files"):
   the existing seed inserts `display_name` only into
   `public.profiles`, and once `0004` lands in Phase C the
   `id`-with-no-DEFAULT FK to `auth.users(id)` would make any
   `./scripts/seed.sh` run between Phase C and Phase D fail with
   a NOT NULL violation. Doing it in Phase A removes the
   foot-gun for the duration of Phases B and C at zero cost.
   **And in the same step, delete the `/profiles` block from
   `scripts/smoke.sh`** (final shape, including the
   schema-reachability gap note, is described in "Modified
   files"). Once `dev_seed.sql` is gutted, the dev DB has zero
   profile rows, and the existing `/profiles` smoke check
   expects `n >= 1`; pinning this edit to Phase A keeps
   `./scripts/smoke.sh` and `./scripts/check.sh` from reding
   for *unrelated* reasons (stale seed, removed `/profiles`
   block) across Phases A–D — the intentional pgTAP reds in
   Phases A–B remain, and `check.sh` only goes truly green in
   Phase D. Run `./scripts/test-db.sh`. Expect: the `auth.users`
   assertion passes; the `pg_proc`-gated `public.uid()`
   assertion is *skipped* (not failed); the tombstone assertion
   fails; the fixture-include assertion passes. The skipped
   assertion is the marker that the gate works; the failures are
   the marker that the migration genuinely hasn't run yet.
   **Pin the skip-counter idiom before Phase B.** The
   `DO $$ … PERFORM skip(why, n); … END$$` form is unusual
   pgTAP and may not advance the counter. Verify pg_prove
   reports `1..4` (not `1..3`) and that the skip line carries
   the expected reason. If the count is `1..3`, do **not**
   proceed to Phase B — switch to the `pg_temp` shim form:
   create `pg_temp.uid_or_zero()` (a plpgsql wrapper that
   `RETURN public.uid()` with `EXCEPTION WHEN
   undefined_function THEN RETURN NULL`) at the top of
   `infra_auth_stub.sql` and lift assertion (2) to the
   statement-level `SELECT CASE WHEN EXISTS (… pg_proc …)
   THEN is(pg_temp.uid_or_zero(), …) ELSE skip(…) END;` form
   — both branches statement-level pgTAP, parse-safe in Phase
   A, well-exercised counter behaviour. Whichever form lands,
   update the `infra_auth_stub.sql` row in the test table to
   match.

2. **Phase B — bulk red.** Add the remaining two fixture files
   (`list_shared_alice_bob.sql` and `list_solo_alice.sql`; the
   `users_alice_bob_carol.sql` fixture landed in Phase A as the
   fixture-path probe). They will reference tables that don't
   exist yet — that's fine, fixtures load inside the test
   transaction and fail loudly per file. Write the remaining
   test files (Phase A wrote `infra_auth_stub.sql`; the test
   table in **Files → New files** lists the full set). Run
   `./scripts/test-db.sh` — nearly every assertion fails. **This
   is the spec, in executable form.** A small handful of
   "absence-of-post-0004-structure" assertions pass vacuously
   against the 0001 schema rather than failing red — e.g.,
   `triggers_profile_on_signup.sql`'s skip-branch step ("re-INSERT
   tombstone, assert `count(*) FROM profiles WHERE id = tombstone`
   = 0") is true coincidentally because the smoke `profiles` table
   has no FK cascade and never had a tombstone row. That's
   expected; the load-bearing red signal in Phase B is the
   failures of the *positive* assertions (FK cascades that don't
   cascade, attribution overrides that don't override, trigger
   functions that don't exist) — not 100% red across the board.

3. **Phase C — green.** Write
   `db/migrations/0004_domain_schema.sql` top-to-bottom. Run
   `./scripts/test-db.sh` and iterate. The cycle is fast (under a
   second per run); aim for green in one or two passes.

4. **Phase D — clean up.** Delete `db/tests/smoke.sql`
   (`dev_seed.sql` was already gutted in Phase A — see above).
   Run `./scripts/check.sh` (full gauntlet — sqlfluff,
   shellcheck, shfmt, vitest, pg_prove, prettier, svelte-check).
   Tick step 1 in `plans/0000_implementation_order.md`.

## Verification

Local:

- `./scripts/test-db.sh` — pgTAP suite, all green.
- `./scripts/check.sh` — full gauntlet (sqlfluff lint included).
- `docker compose up -d`, `./scripts/migrate.sh`, `./scripts/seed.sh`
  to rebuild the dev DB. `./scripts/smoke.sh` to confirm the
  service mesh is up (PostgREST OpenAPI root, GoTrue health,
  Mailpit) — anon has no SELECT grant on the new `profiles`, so
  the smoke no longer probes schema reachability via `/profiles`;
  the manual `\dt`/`\dv`/`\df` step below is the schema-up check.
- Manual psql: `psql -U cairn -d cairn -c "\dt public.*"` shows the
  six tables (profiles, user_settings, lists, list_members, items,
  votes); `\dv public.*` shows the three views; `\df public.*`
  shows `is_list_member` and `uid` (both live in `public`, not
  `auth`).
- Manual API check: `curl -i http://localhost:3000/profiles` (anon)
  → `HTTP/1.1 401` (no SELECT grant for anon; PostgREST short-
  circuits before RLS), not an empty array. With a fake-jwt cookie
  for Alice → her profile visible. (The anon path matters because
  the magic-link flow in step 3 will hit `/rpc/...` as anon — the
  401 here is *not* a regression, it's the new contract.)

What this plan does *not* cover, by design:

- The `delete_account()` RPC and account-deletion UI — step 8.
- Tier 3 *invite-flow tables* — `circle_members`, `blocks`,
  `invitations` — land in step 6. The `invite_policy` *column*
  ships now on `user_settings` (per the `profiles` ↔
  `user_settings` split in step 4b — owner-only RLS makes
  `invite_policy` structurally private from day one). Step 6
  reads it from `user_settings` rather than `profiles`, which is
  what closes the original privacy concern that drove the split:
  `profiles_select` is world-readable, so anything privacy-
  sensitive *cannot* live there. The split is the durable answer.
- Web-side profile/list/item code — steps 2–4.

Accepted trade-offs (considered, intentional, not bugs):

- **Two files share the "smoke" name** in this plan:
  `db/tests/smoke.sql` (the pgTAP smoke file deleted in Phase D,
  superseded by `infra_auth_stub.sql`) and `scripts/smoke.sh`
  (the shell-script smoke check, which loses its `/profiles`
  block in Phase A and otherwise stays). Different directories,
  different roles; the plan only deletes the former. Recorded
  here so the executor doesn't reach for the wrong file.
- **`votes` PK columns are mutable-by-policy.** `votes_update`
  checks `user_id = public.uid()` and the items-existence /
  membership predicate, but does not pin `(item_id, user_id)`
  to their pre-update values. A determined client could
  `PATCH /votes?item_id=eq.X&user_id=eq.<self>` with body
  `{"item_id": "Y"}` to "move" their vote to another item in
  another list they're a member of, as long as `(Y, self)`
  doesn't collide with an existing PK. RLS policies cannot
  reference `OLD`, so the cleanest closure is a small
  `tg_freeze_votes_pk` BEFORE UPDATE trigger raising on
  `NEW.item_id IS DISTINCT FROM OLD.item_id OR NEW.user_id IS
  DISTINCT FROM OLD.user_id`. We accept the gap in this plan —
  the surface is narrow (a deliberate API misuse, not a
  user-clickable path), the practical impact is bounded (a
  member can already cast and retract any vote on any item in
  a list they're in, so the "move" is reachable in two
  requests anyway), and the trigger plus its assertion fit
  more naturally into a future "schema invariants" pass.
  Tracked here so it doesn't get lost. **Asymmetry with the
  `list_members` PK closure is deliberate** — see Risk #13.
  The `list_members` shape is privilege escalation (self-add
  to a list the caller is not a member of) and ships its
  freeze in this plan; the `votes` shape is a bounded
  vote-move between lists the caller is *already* a member
  of, so deferring is safe.
- **Canonical-anchor convention.** Cascade-skip /
  content-detection / DEFAULT-trap rationale lives canonically
  in **Risks #11 and #12**, the per-table trigger spec in
  **step 10**, and per-file assertion rationale in the **test
  table rows**. Each spot is the *single* place to read or edit
  that rule; everywhere else points back. If a future edit
  finds itself wanting to add a third restatement of the same
  rule, edit the canonical anchor instead and add a one-line
  pointer at the new site.

## After this lands

`db/migrations/0004_domain_schema.sql` is **frozen** once merged.
Schema evolution from this point onward ships as additive,
forward-only migrations: `0005_…`, `0006_…`, etc. — never as
edits to `0004`. There is no down-migration; `scripts/migrate.sh`
is forward-only and gated by the `_migrations` ledger. The dev DB
is rebuildable end-to-end via `docker compose down -v && up -d &&
./scripts/migrate.sh && ./scripts/seed.sh`, which is the closest
thing we have to a "reset to a known state" — use that, not edits
to past migrations.
