# Tasks

This sub-plan (2004) is cut from `2000_username_identity` and merges back `--no-ff`.
It builds on 2001 (the `recovery_email` column + `resolve_username`), 2002 (the auth
BFF + revocable session), and 2003 (the stable `<uid>@cairn.internal` identity +
username sign-in screen). Cairn orchestrates the whole recovery flow because GoTrue's
built-in `/recover` would mail the non-deliverable internal identity.

## Reference skills and docs

- **`.claude/skills/writing-tasks.md`** — task format; route-test filenames drop the
  `+`; cross-task toolchain coupling.
- **`docs/data-model.md`** — `user_settings` / `recovery_email`; the `SECURITY DEFINER`
  RPC + `REVOKE/GRANT` idiom; soft-delete and timestamp conventions.
- **`docs/testing.md`** — three test layers; pgTAP positive **and** negative for every
  policy/grant; Playwright is machine-conditional (this laptop can't run it).
- **`docs/architecture.md`** — BFF surface, cookie/JWT model, the recovery design.
- **`docs/logging.md`** — never log an e-mail address, code, or token (hashes only).
- **`docs/ui.md`** + **`design/cairn-screens.jsx`** — TopBar, button-pair order, form
  primitives, empty-state; recovery-screen layout.
- **`docs/quality.md`** — prettier runs in the pre-commit hook (`pnpm lint` is
  ESLint-only); the SvelteKit not-yet-created-route escape.
- **`plans/0302_signin_anti_enumeration/`** — the constant-shape request pattern.

## Phase 0 — reconcile docs

### [x] 0.1 Reconcile the recovery / session-model docs

**Created:** 2026-06-17T19:02:51Z
**Completed:** 2026-06-18T07:55:01Z

**Why:** Cairn's docs are canonical for downstream steps; the recovery design reverses
or fills in claims the docs make, so the narrative corrections land first (the parent
step's R19 discipline) before any code references a stale spec.

**Prerequisites:** None.

**Decisions:**

- **`docs/architecture.md`** — describe Cairn-orchestrated recovery: GoTrue's built-in
  `/recover` is unusable because the identity is the non-deliverable
  `<uid>@cairn.internal`, so the BFF sends a 6-digit code to the on-file
  `recovery_email` and a token-gated pgcrypto DB function sets the password (no GoTrue
  admin key); the BFF gains SMTP and a scoped DB role. Resolve the standing
  "operator-assisted reset" open question → **deferred** (no self-serve path for an
  account with no verified recovery e-mail; operator reset is a later `admin`-schema
  concern).
- **`docs/data-model.md`** — `recovery_email` is the **active, verified** address
  (pending lives in the token record, not here); a `recovery_tokens` record; the
  column-level `UPDATE` grant that blocks direct writes; the verify/reset RPCs. Keep
  DDL-precise wording light here — the exact shapes land with the Phase-1 migration.
- **`docs/deployment.md`** — the `auth-proxy` service now needs `SMTP_*` env and the
  scoped-role credential; add to the pre-deploy auth checklist. Flag prod-facing.
- **`docs/logging.md`** — confirm (or add a line) that recovery addresses, codes, and
  tokens never appear in logs. Add that the **new password** in a reset necessarily
  reaches the DB as the `reset_password` RPC argument (R6's pgcrypto design — see Task
  1.3), so Postgres statement logging must stay **off** (it is by default) and the BFF
  must never log the reset request body.
- **`docs/account-deletion.md`** — add a row to the "What gets deleted, anonymized, or
  kept" table for the new `auth_private.recovery_tokens` record: **Hard deleted**,
  reason "Personal data (recovery-e-mail snapshot + code hash); cascades from
  `auth.users` via the `ON DELETE CASCADE` FK." The active `user_settings.recovery_email`
  is already covered by the `user_settings` row.
- **`docs/open-questions.md`** — clear the recovery-mechanism question and record the
  operator-reset deferral.

**Files:**

- `docs/architecture.md` (modify)
- `docs/data-model.md` (modify)
- `docs/deployment.md` (modify)
- `docs/logging.md` (modify)
- `docs/account-deletion.md` (modify)
- `docs/open-questions.md` (modify)

**Steps:**

1. Edit the six docs per Decisions. User-facing prose stays British English; keep
   code identifiers (`recovery_email`, env var names) US English.
2. Re-read each edit against `REQUIREMENTS.md` so the docs and the requirements agree.

**Verify:** Prettier clean on the edited docs (run `pnpm --dir web exec prettier
--write` on them — the pre-commit hook enforces this); manual review that the six docs
agree with `REQUIREMENTS.md`.

## Phase 1 — database

### [x] 1.1 Lock direct writes to `recovery_email` (column-level grant) + pgTAP

**Created:** 2026-06-17T19:02:51Z
**Completed:** 2026-06-18T08:03:57Z

**Why:** R13's verify-before-effect is only real if a signed-in user cannot
`PATCH /user_settings` to set `recovery_email` directly, bypassing verification. Today
`GRANT SELECT, UPDATE ON user_settings TO authenticated` permits exactly that.

**Prerequisites:** None (first migration of this sub-plan). The
`user_settings` table and its owner-only RLS exist (`db/migrations/0004_domain_schema.sql:95,631`);
`recovery_email` exists (`db/migrations/0019_username_identity.sql:152`).

**Decisions:**

- Replace the table-wide `UPDATE` grant with a **column-level** one:
  `GRANT UPDATE (invite_policy) ON public.user_settings TO authenticated`. Keep
  `GRANT SELECT` (owner-only RLS still restricts rows) so the owner can read their own
  `recovery_email` for display. `recovery_email` is now writable only by the confirm
  RPC (Task 1.2, `SECURITY DEFINER`, runs as owner).
- New migration `db/migrations/0021_password_recovery.sql`, single `BEGIN; … COMMIT;`
  (matches 0019/0020). This task adds only the grant change; the table + RPCs append in
  1.2/1.3.
- pgTAP fixtures: `db/tests/fixtures/users_alice_bob_carol.sql` (Alice
  `aaaa…`, Bob `bbbb…`). Tests `SET LOCAL ROLE authenticated` + set
  `request.jwt.claims` to the acting user, the same shape as `db/tests/rls_user_settings.sql`.
- **Two existing tests lock in the old table-wide grant and must be updated in this same
  task, or the suite goes red** (verified):
  - `db/tests/grants.sql:54-55` asserts `has_table_privilege('authenticated',
'public.user_settings', 'UPDATE')` is **true**. Under a column-only grant this flips
    to **false** (`has_table_privilege` ignores column grants), so the assertion fails.
    Rework it to assert the new reality: `authenticated` has **no** table-level UPDATE,
    `has_column_privilege('authenticated','public.user_settings','invite_policy','UPDATE')`
    is true, and `has_column_privilege(…,'recovery_email','UPDATE')` is false. Adjust the
    `plan(N)` count for any net change in assertions.
  - `db/tests/recovery_email.sql:44-55` (the 2001 test) does a direct
    `UPDATE … SET recovery_email` as `authenticated` (assertion 2) — now rejected with
    `42501`. Rework it: assert the direct write is now **blocked** (the new boundary),
    and seed the positive "owner can have a recovery e-mail" state via the
    `confirm_recovery_email` RPC (Task 1.2) rather than a direct write. (Until 1.2 lands
    the RPC, narrow this to the block-only negative; complete the positive in 1.2.)

**Files:**

- `db/migrations/0021_password_recovery.sql` (create)
- `db/tests/recovery_email_grant.sql` (create)
- `db/tests/grants.sql` (modify — re-assert the column-level grant matrix; see Decisions)
- `db/tests/recovery_email.sql` (modify — assertion 2 now proves the direct write is
  blocked; see Decisions)
- `docs/data-model.md` (modify — document the column-level `UPDATE` grant lockdown on
  `user_settings` as it lands, per R10)

**Steps:**

1. RED — Create `db/tests/recovery_email_grant.sql` with `plan(N)`: (a) positive —
   Alice can `UPDATE user_settings SET invite_policy=…` on her own row; (b) negative —
   Alice's `UPDATE user_settings SET recovery_email=…` on her own row is **rejected**
   (insufficient column privilege, SQLSTATE `42501`); (c) Alice can still `SELECT` her
   own `recovery_email`.
2. RED — Update `db/tests/grants.sql` and `db/tests/recovery_email.sql` per Decisions so
   they expect the column-level lockdown (both currently assert the old table-wide
   grant, so they are the load-bearing "this used to be allowed" cases).
3. RED — `./scripts/test-db.sh`; confirm the new and reworked negatives report red
   because the write is _not_ yet blocked.
4. GREEN — In `0021_password_recovery.sql`, `REVOKE UPDATE ON public.user_settings
FROM authenticated;` then `GRANT UPDATE (invite_policy) ON public.user_settings TO
authenticated;`. Leave `SELECT` intact.
5. GREEN — `./scripts/test-db.sh`; confirm green (including `grants.sql` and
   `recovery_email.sql`).

**Verify:** `./scripts/test-db.sh`

### [x] 1.2 `recovery_tokens` record, scoped role, and the verify-flow RPCs + pgTAP

**Created:** 2026-06-17T19:02:51Z
**Completed:** 2026-06-18T09:13:22Z

**Notes:**

- **Concrete values the task left open:** send caps are **per-address 3, per-account
  5** within a **1-hour** window; a refused send raises the custom SQLSTATE **`CA429`**
  (the BFF maps it to HTTP 429). The verification token expiry is 1 hour. These are
  inlined as named `constant`s in `request_recovery_email_verification`.
- **pgTAP TAP-stream hygiene:** `confirm_recovery_email` returns `text`, so a bare
  `SELECT confirm_recovery_email(...)` used as setup prints its result row and corrupts
  the TAP stream (phantom test / out-of-sequence). Non-asserted RPC setup calls are run
  via `PERFORM` inside a `DO` block so they emit nothing — the same discard idiom
  `invitations.sql` uses (capturing into a temp table). Asserted calls go through
  `is()`/`lives_ok()`/`throws_ok()` as normal.
- 27 new assertions; full suite 733 green. The return-status contract correction agreed
  earlier is implemented as specified (commit on persistable outcomes, raise only for
  `28000` guards).

**Why:** Setting/changing a recovery e-mail must prove ownership (R13): send a code,
store it pending, activate only on confirm. This adds the token record, the scoped BFF
role the reset flow (1.3) will use, and the two authenticated verify RPCs.

**Prerequisites:** Task 1.1 (the `0021` migration exists; the grant lockdown is in).

**Decisions:**

- **`recovery_tokens`** lives in a **dedicated, non-PostgREST-exposed schema
  `auth_private`** — `CREATE SCHEMA IF NOT EXISTS auth_private;` then
  `REVOKE ALL ON SCHEMA auth_private FROM public, authenticated, anon;` (the
  `admin`-schema lockdown precedent, `db/migrations/0017_admin.sql:57`). PostgREST only
  serves `public` (`PGRST_DB_SCHEMAS: public`, `docker-compose.yml:22`), so a table in
  `auth_private` is **unreachable through the API by construction** — the stronger
  boundary for the recovery-e-mail snapshots + code hashes than `public` + RLS. The
  `SECURITY DEFINER` RPCs stay in `public` (so PostgREST can call them) and reference the
  table by its **fully-qualified name `auth_private.recovery_tokens`** (their tight
  `SET search_path` is not widened); they run as the table's owner (superuser `cairn`),
  which reaches `auth_private` regardless of grants. Keep `ENABLE ROW LEVEL SECURITY`
  with **no policy** (deny-all) as belt-and-suspenders so the data is doubly protected
  even if the schema lockdown were ever loosened. Columns: `id uuid PK default
gen_random_uuid()`, `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE
CASCADE`, `purpose text NOT NULL CHECK (purpose IN ('verify_recovery_email',
'reset_password'))`, `email text NOT NULL` (the address the code was sent to —
  pending address for verify, on-file snapshot for reset), `code_hash text NOT NULL`
  (SHA-256 hex of the code; never the plaintext), `expires_at timestamptz NOT NULL`,
  `consumed_at timestamptz`, `attempts int NOT NULL DEFAULT 0`, `created_at timestamptz
NOT NULL DEFAULT now()`. Index `(user_id, purpose, created_at)` (serves both the
  per-account verify-send cap and the newest-token lookup) and `(email, created_at)`
  (the per-address throttle).
- **Scoped role** `cairn_auth_bff` — `CREATE ROLE cairn_auth_bff NOLOGIN;` (idempotent
  `DO` block — roles are cluster-global and survive `test-db.sh`'s per-run
  `DROP DATABASE`, so the guard is load-bearing). In prod the BFF assumes it via a
  pre-minted role JWT and `authenticator` must be able to `SET ROLE` to it; wrap
  `GRANT cairn_auth_bff TO authenticator;` in a `DO` block **guarded on `authenticator`
  existence so the migration is safe in any cluster**. (Note: the pgTAP test DB **does**
  have `authenticator` — `db/migrations/0001_init.sql:21-26` creates it from
  `cairn.authenticator_password` during the migration run that `test-db.sh` performs —
  so the GRANT actually executes under test; the guard is for robustness, not because
  the role is absent.) 1.2 only creates the role; the reset RPCs it gets granted land
  in 1.3. **Also `GRANT USAGE ON SCHEMA public TO cairn_auth_bff;`** — schema USAGE gates
  every object privilege inside, so without it the role cannot reach the `public` reset
  RPCs even with EXECUTE (`0001_init.sql:38` grants the same USAGE to `anon`/`authenticated`
  by convention). This is **not** caught by the 1.3 `has_function_privilege` grant
  assertion (which ignores schema USAGE), so a missing USAGE would pass pgTAP and only
  fail at runtime as "permission denied for schema public" — hence it is explicit here.
  The role gets **no** grant on `auth_private` (the definer RPCs reach it as owner).
- **Verify RPCs** (both `SECURITY DEFINER`, `SET search_path = public`, the
  `REVOKE ALL … FROM public` + `GRANT EXECUTE … TO authenticated` idiom and the
  `uid()`/tombstone guards from `db/migrations/0020_username_auth.sql:24-73`):
  - `request_recovery_email_verification(p_email text, p_code_hash text) RETURNS void`
    — validate basic e-mail shape; enforce **both** the DB-backed per-address send cap
    (recent rows for `p_email`) **and** a per-account send cap (recent
    `verify_recovery_email` rows for `uid()`), so one signed-in account cannot spray
    verification codes across many distinct addresses (mail-bombing); insert a
    `verify_recovery_email` token (`email=p_email`, `code_hash=p_code_hash`,
    `expires_at=now()+interval '1 hour'`). The BFF passes a hash, not the plaintext
    code (keeps the code out of DB query logs).
  - `confirm_recovery_email(p_code_hash text) RETURNS text` — returns a status string
    (`'ok'` | `'invalid'` | `'locked'`) that the BFF maps to HTTP (R3 lets the Settings
    UI surface the failure). **Return-not-raise is load-bearing, not a style choice:**
    PostgREST runs each RPC in its own transaction and rolls back on a raised error, so a
    wrong-code path that `RAISE`d would roll back its _own_ `attempts` bump — the
    submission-attempt cap would never persist and the brute-force defence (R8) would be
    a no-op (verified: an `UPDATE … +1` followed by `RAISE` in the same function leaves
    the counter at its prior value). So every outcome that must persist a side effect
    _commits_ by returning a status; only errors with nothing to persist (`uid()` NULL /
    tombstone) still `RAISE 28000`. Body: select the caller's newest unconsumed,
    unexpired `verify_recovery_email` token **`FOR UPDATE`** (serialising concurrent
    guesses so the `attempts` check can't be raced past); if none, return `'invalid'`.
    **Before comparing the hash, if `attempts >= 5`**, mark the token consumed and return
    `'locked'` (the submission-attempt cap — treat an over-cap token as spent so a 10^6
    code space cannot be brute-forced; load-bearing R8, not the send caps above). On a
    `code_hash` match set `user_settings.recovery_email = token.email`,
    `consumed_at = now()`, return `'ok'`. On a miss do `UPDATE … attempts = attempts + 1`
    and return `'invalid'` (the bump commits — that is the whole point). The plaintext
    code never reaches the DB — only the hash does (log hygiene); note a SHA-256 of a
    6-digit code has ~no preimage resistance, so the hash is **not** at-rest secrecy
    (that comes from `auth_private` being unreachable), and the comment should say so.
- The pgTAP stub already carries the columns these touch; `recovery_email` write goes
  through the owner via `SECURITY DEFINER`, so it is unaffected by 1.1's grant.

**Files:**

- `db/migrations/0021_password_recovery.sql` (modify — append table, role, verify RPCs)
- `db/tests/recovery_verify.sql` (create)
- `docs/data-model.md` (modify — document the `recovery_tokens` shape, the deny-all RLS,
  and the verify RPCs as they land, per R10's "DDL-precise specifics ride with their
  migration")

**Steps:**

1. RED — Create `db/tests/recovery_verify.sql` with `plan(N)`: (a) positive — after
   `request_recovery_email_verification` + `confirm_recovery_email` with the matching
   hash, `confirm_recovery_email` returns `'ok'`, the caller's `recovery_email` equals
   the submitted address, and the token is consumed; (b) negative — a wrong `code_hash`
   returns `'invalid'`, does not set `recovery_email`, and **bumps `attempts`** (assert
   the increment persisted — the return-not-raise property); (c) negative — an expired
   token returns `'invalid'` and does not set `recovery_email`; (d) negative — a consumed
   token cannot be reused (returns `'invalid'`); (e) one caller cannot confirm another
   caller's pending token (returns `'invalid'`); (f) grant assertion — `cairn_auth_bff`
   exists and `authenticated` has EXECUTE on both verify RPCs while `anon` does not; (g)
   negative — neither `authenticated` nor `anon` has `USAGE` on schema `auth_private`
   (`has_schema_privilege(...,'auth_private','USAGE')` is false), so
   `auth_private.recovery_tokens` is unreachable by them — plus the deny-all RLS as
   belt-and-suspenders; (h) negative — the per-account verify-send cap rejects an
   over-limit send for the same caller (raises — nothing to persist on a refused send);
   (i) negative — the **submission-attempt cap persists across calls** (the property the
   return-not-raise shape exists to guarantee): 5 wrong `confirm_recovery_email` calls
   each return `'invalid'` and the durable `attempts` count reaches 5 (a raising design
   would leave it at 0); a 6th call with the **correct** hash returns `'locked'` and
   `recovery_email` is not set.
2. RED — `./scripts/test-db.sh`; confirm red (table/role/RPCs absent).
3. GREEN — Append the `auth_private` schema, the `auth_private.recovery_tokens` table,
   the `cairn_auth_bff` role (+ its `USAGE ON SCHEMA public` grant), and the two verify
   RPCs to `0021_password_recovery.sql` per Decisions.
4. GREEN — `./scripts/test-db.sh`; confirm green.

**Verify:** `./scripts/test-db.sh`

### [x] 1.3 Reset-flow RPCs (`request_password_reset`, `reset_password`) + pgTAP

**Created:** 2026-06-17T19:02:51Z
**Completed:** 2026-06-18T09:33:49Z

**Why:** The signed-out reset (R4, R6): resolve a username to its on-file recovery
address, mint a reset token, and — on a valid code — set a new password via pgcrypto
without any GoTrue admin credential. Both RPCs are reachable only by the scoped role
(R7), keeping the private address off the anon surface and the password write off the
public surface.

**Prerequisites:** Task 1.2 (`recovery_tokens`, the `cairn_auth_bff` role). pgcrypto
is enabled (`db/migrations/0001_init.sql:9`); `resolve_username` exists
(`db/migrations/0020_username_auth.sql:142`).

**Decisions:**

- `request_password_reset(p_username text, p_code_hash text) RETURNS text` —
  `SECURITY DEFINER`. Resolve `p_username` → uid via the `lower(username)` index; read
  that account's `recovery_email`; if non-NULL, enforce the per-address send cap, insert
  an `auth_private.recovery_tokens` row with `purpose = 'reset_password'`
  (`email = recovery_email`, `code_hash = p_code_hash`,
  `expires_at = now()+interval '1 hour'`), and **return the address** so the BFF knows
  where to send; if the username is unknown or has no `recovery_email`, return NULL.
  (Returning the address is safe **only** because the RPC is granted to the scoped role,
  not anon — see grant below.) Reference the token table by its fully-qualified name
  `auth_private.recovery_tokens` (Task 1.2's private schema; do not widen `search_path`).
- `reset_password(p_username text, p_code_hash text, p_new_password text) RETURNS text`
  — `SECURITY DEFINER`, `SET search_path = public, auth`, returning the same status
  string as `confirm_recovery_email` (`'ok'` | `'invalid'` | `'locked'`) for the same
  return-not-raise reason (a raised wrong-code path would roll back its own `attempts`
  bump, defeating R8). Resolve username → uid; select the newest unconsumed, unexpired
  `auth_private.recovery_tokens` row with `purpose = 'reset_password'` for that uid
  **`FOR UPDATE`** (fully-qualified — do not widen `search_path`); if none, return
  `'invalid'`. **Before comparing the hash, if `attempts >= 5`**, mark the token consumed
  and return `'locked'` (the same submission-attempt cap as `confirm_recovery_email`,
  load-bearing for R8 on this password-setting path). On a `code_hash` match, enforce the **8-character** password
  minimum length (this is the authoritative re-check — the same value the BFF enforces as
  `MIN_PASSWORD_LENGTH = 8` in `auth-proxy/src/index.ts`; the figure `8` is duplicated
  across **five** sites — this DB RPC, the BFF register flow + reset endpoint (2.3,
  `index.ts`), and the dev Vite proxy's register + reset handlers
  (`web/vite.config.ts:305` and the new one in 2.3) — with no shared const across the
  web/auth-proxy boundary, so all five must be kept in lockstep by hand) and set
  `auth.users.encrypted_password = crypt(p_new_password, gen_salt('bf'))`, then
  `consumed_at = now()`, and return `'ok'`. A correct code but a too-short password is
  the one match-path error with nothing to persist — `RAISE 23514` (the token is **not**
  consumed, so the user can retry with a longer password). On a hash miss do
  `UPDATE … attempts = attempts + 1` and return `'invalid'` (the bump commits). Mints
  **no** session. Writing `auth.users` via `SECURITY DEFINER` follows the
  `adopt_stable_identity` precedent (`db/migrations/0020_username_auth.sql:75-116`).
  Note: `p_new_password` arrives in plaintext as an RPC argument (unavoidable — the
  pgcrypto `crypt()` must run in the DB per R6), so it crosses the PostgREST→Postgres
  boundary; Postgres statement logging must stay **off** (default) and the BFF must never
  log the reset body (see Task 0.1's `docs/logging.md` edit).
- **Grants:** `REVOKE ALL … FROM public` then `GRANT EXECUTE … TO cairn_auth_bff` for
  **both** RPCs — **not** to `anon` or `authenticated`. This is the load-bearing
  boundary for R5/R7.
- pgTAP runs in a DB with no GoTrue, so it cannot prove GoTrue _accepts_ the bcrypt
  hash — it proves the column changes to a valid `crypt()` value. The end-to-end proof
  is the Phase-4 canary; reference that in a comment.

**Files:**

- `db/migrations/0021_password_recovery.sql` (modify — append reset RPCs + grants)
- `db/tests/recovery_reset.sql` (create)
- `docs/data-model.md` (modify — document the verify/reset RPCs + their
  `cairn_auth_bff`-only grants as they land, per R10)

**Steps:**

1. RED — Create `db/tests/recovery_reset.sql` with `plan(N)`: (a) positive — for a user
   with a verified `recovery_email`, `request_password_reset` returns that address and
   creates a token; (b) `request_password_reset` returns NULL for an unknown username
   and for a user with no `recovery_email` (no token created); (c) positive —
   `reset_password` with the matching hash returns `'ok'`, changes `encrypted_password`
   to a value that verifies against `crypt(new_pw, encrypted_password)`, and consumes the
   token; (d) negative — a wrong/expired/consumed code returns `'invalid'` and does not
   change the password; (e) negative — a correct code with a too-short password raises
   `23514` and leaves the token **unconsumed** (the user can retry); (f) grant assertion
   — `cairn_auth_bff` has EXECUTE on both RPCs while `anon` and `authenticated` do
   **not**; (g) negative — the **submission-attempt cap persists across calls**: 5 wrong
   `reset_password` calls each return `'invalid'` and the durable `attempts` count reaches
   5, then a 6th call with the **correct** code returns `'locked'` and `encrypted_password`
   is unchanged.
2. RED — `./scripts/test-db.sh`; confirm red.
3. GREEN — Append the two reset RPCs and their `cairn_auth_bff`-only grants to
   `0021_password_recovery.sql`.
4. GREEN — `./scripts/test-db.sh`; confirm green.

**Verify:** `./scripts/test-db.sh`

### [ ] 1.4 `clear_recovery_email` RPC + pgTAP

**Created:** 2026-06-18T10:08:17Z
**Completed:**

**Why:** R3's set/change flow has a counterpart the design always assumed — a user
removing their recovery e-mail (the **Remove** affordance in Settings, Task 3.2; the
"Recovery-e-mail removal" open question in `PLAN.md`). But Task 1.1 narrowed the
`authenticated` UPDATE grant on `user_settings` to `invite_policy` only, so a signed-in
user **cannot** null `recovery_email` directly through PostgREST, and the only existing
writer (`confirm_recovery_email`) only ever _sets_ a verified address. Removal therefore
needs its own authenticated, owner-scoped writer — the DB half the removal endpoint
(Task 2.2) calls. This was flagged in `PLAN.md` → Open questions ("Recovery-e-mail
removal … a dedicated authenticated BFF endpoint … rather than re-opening the column
grant. Settled in Phase 2"); the DB function it depends on lands here in Phase 1, where
the other recovery RPCs live and get their pgTAP coverage.

**Prerequisites:** Task 1.1 (the column-level grant lockdown is in; `0021` exists). The
`uid()`/tombstone guard idiom (`0020`) and the `recovery_email` column
(`0019_username_identity.sql:152`) exist.

**Decisions:**

- `clear_recovery_email() RETURNS void` — `SECURITY DEFINER`, `SET search_path = public`,
  the `REVOKE EXECUTE … FROM public` + `GRANT EXECUTE … TO authenticated` idiom and the
  `uid()` / tombstone guards from `confirm_recovery_email` (`0021`). Body: a single
  `UPDATE public.user_settings SET recovery_email = NULL WHERE id = uid()`. Removing
  one's **own** recovery address needs no verification — it only ever _reduces_ what an
  account can do (it drops that account's self-serve reset path, which is the user's
  choice), so unlike setting it (which must prove ownership, R1/R3) there is nothing to
  confirm. The function derives the target row from `uid()`, never a parameter, so a
  caller can only clear their **own** address — the same own-row discipline as the
  verify RPCs.
- **Idempotent + harmless on a no-op:** clearing when already NULL is a successful no-op
  (the `UPDATE` simply matches no non-NULL state to change). The BFF removal endpoint
  (Task 2.2) can call it unconditionally.
- **Pending verify tokens are deliberately left to expire**, not deleted here: they live
  in `auth_private`, are unreachable, single-use, and expire in an hour, and a user who
  removes their address is not mid-verification in any normal flow. Keeping the RPC a
  single-column write matches the "simplest thing that works" principle; if a stale
  pending-confirm-after-remove race ever matters it is a separate, later concern.
- Appended to `db/migrations/0021_password_recovery.sql` (same single `BEGIN; … COMMIT;`),
  after `confirm_recovery_email` and before the reset RPCs is fine — ordering within the
  transaction is immaterial as no function calls another at definition time.

**Files:**

- `db/migrations/0021_password_recovery.sql` (modify — append the `clear_recovery_email`
  RPC + its grant)
- `db/tests/recovery_verify.sql` (modify — add the clear-flow assertions alongside the
  existing verify-flow ones; bump `plan(N)`) **or** a sibling `recovery_clear.sql`
  (create) if cleaner — implementer's choice, but keep the fixture/role pattern identical
- `docs/data-model.md` (modify — document `clear_recovery_email` in the RPC list and note
  that `recovery_email` is now written by the confirm RPC (set) and the clear RPC (null),
  per R10's "DDL-precise specifics ride with their migration")

**Steps:**

1. RED — Add pgTAP assertions: (a) positive — a signed-in user with a verified
   `recovery_email` calls `clear_recovery_email()` and their `recovery_email` becomes
   NULL; (b) positive — calling it when already NULL is a successful no-op; (c) one caller
   cannot clear another caller's address (it only ever touches `uid()`'s own row — assert
   a second user's address is untouched); (d) grant — `authenticated` has EXECUTE, `anon`
   does not; (e) the guards raise `28000` for the tombstone caller.
2. RED — `./scripts/test-db.sh`; confirm red (function absent).
3. GREEN — Append `clear_recovery_email` + grant to `0021_password_recovery.sql` per
   Decisions.
4. GREEN — `./scripts/test-db.sh`; confirm green.

**Verify:** `./scripts/test-db.sh`

## Phase 2 — BFF + dev proxy

### [x] 2.1 SMTP mailer, scoped-role client, and code helpers in the BFF

**Created:** 2026-06-17T19:02:51Z
**Completed:** 2026-06-18T09:47:55Z

**Notes:**

- nodemailer ships no bundled types, so `@types/nodemailer` was added to
  `devDependencies` alongside the `nodemailer` runtime dep (the task only
  mentioned the runtime dep). Without it the `nodemailer.createTransport` call
  is untyped `any` and the type-aware ESLint rules red.
- `mail.ts` separates pure body builders (`verifyEmailMessage` /
  `resetPasswordMessage`) from the send functions, and uses a `setMailTransport`
  injection seam (a minimal `MailTransport` interface) so tests record messages
  without touching SMTP — nodemailer has no env-stub equivalent to the
  `POSTGREST_URL`/`GOTRUE_URL` pattern the other libs lean on.
- `recovery.ts` returns discriminated results (`ResetRequestResult` /
  `ResetResult`) that surface `throttled` (CA429) and `too_short` (23514) so the
  Phase-2.3 endpoints can map them; the verify-flow RPCs are reached with the
  user bearer (Task 2.2), not this scoped-role client.

**Why:** The BFF must deliver recovery mail (GoTrue can't reach the real address) and
call the scoped reset RPCs. This lands the shared plumbing the recovery endpoints
(2.2, 2.3) build on.

**Prerequisites:** Tasks 1.2/1.3 (the RPCs and the `cairn_auth_bff` role exist).

**Decisions:**

- **`auth-proxy/src/lib/mail.ts`** — a thin nodemailer wrapper reading the same
  `SMTP_*` env GoTrue uses (`SMTP_HOST/PORT/USER/PASS/FROM`); dev points at Mailpit.
  Plus the two mail bodies (verify, reset): British-English copy, "e-mail" hyphenated,
  a 6-digit code (no link), "ignore this if you didn't ask." Add `nodemailer` to
  `auth-proxy/package.json` (the BFF currently depends only on `express`).
- **`auth-proxy/src/lib/recovery.ts`** — `generateCode()` (crypto-random 6 digits),
  `hashCode(code)` (SHA-256 hex, so only the hash crosses to the DB), and a scoped-role
  PostgREST client that attaches the pre-minted `cairn_auth_bff` role JWT (env, e.g.
  `AUTH_BFF_DB_JWT`) and calls `request_password_reset` / `reset_password`. Reuse the
  per-request `postgrestUrl()` pattern from `auth-proxy/src/lib/profiles.ts`.
- **Never log** the address, code, token, or JWT (`docs/logging.md`).

**Files:**

- `auth-proxy/src/lib/mail.ts` (create)
- `auth-proxy/src/lib/recovery.ts` (create)
- `auth-proxy/package.json` (modify — add nodemailer)
- `auth-proxy/test/recovery-lib.test.ts` (create)

**Steps:**

1. RED — Create `auth-proxy/test/recovery-lib.test.ts`: `generateCode` returns 6
   digits; `hashCode` is deterministic SHA-256 hex and never returns the input; the
   scoped client sends the role JWT and posts the expected RPC body (stub the fetch);
   `mail.ts` builds a message to the right address with the code and no token/secret
   (stub the transport — assert no plaintext code is logged).
2. RED — `cd auth-proxy && pnpm test`; confirm red.
3. GREEN — Implement `mail.ts` and `recovery.ts`; add nodemailer.
4. GREEN — `cd auth-proxy && pnpm test`; confirm green.

**Verify:** `cd auth-proxy && pnpm test && pnpm lint`

### [ ] 2.2 Recovery-e-mail set + confirm endpoints (authenticated)

**Created:** 2026-06-17T19:02:51Z
**Completed:**

**Why:** The authenticated half of R3: a signed-in user sets a candidate recovery
e-mail and confirms ownership with the emailed code.

**Prerequisites:** Task 2.1 (mailer + helpers); Task 1.2 (verify RPCs); Task 1.4
(`clear_recovery_email` — the DB writer the removal branch calls). The CSRF header
(`X-Cairn-Auth`), the cookie→bearer model, and the auth-path lockstep all exist from
2002/2003.

**Decisions:**

- Two CSRF-protected, **authenticated** endpoints (the BFF attaches the user's access
  bearer, as for `set_username`): `POST /auth/recovery-email` `{email}` → generate code,
  `request_recovery_email_verification(email, hash)` [user bearer], SMTP the code to
  `email`, `200`. `POST /auth/recovery-email/confirm` `{code}` →
  `confirm_recovery_email(hash)` [user bearer], which **returns a status string**
  (`'ok'` | `'invalid'` | `'locked'`) — the BFF reads that value (the RPC commits its
  `attempts` bump rather than raising, so there is no SQLSTATE to catch) and replies
  `200` on `'ok'`, else a `4xx` the UI maps to "that code is incorrect or expired"
  (`'invalid'`) or "too many attempts — request a new code" (`'locked'`). Removal is `POST /auth/recovery-email` with
  `{remove:true}` (**POST, not `DELETE`** — pinned here so the prod Caddy POST-only
  matcher in Task 2.4 and the `postJson`-based `removeRecoveryEmail()` client in Task 3.1
  all agree). The removal branch calls the **`clear_recovery_email` RPC** (Task 1.4) with
  the **user bearer** — the column is write-locked to `authenticated` (Task 1.1), so the
  null goes through that owner-scoped `SECURITY DEFINER` writer, **not** by re-opening the
  column grant. No code/mail is involved (removing one's own address needs no
  verification); reply `200`.
- **Where the endpoint paths live:** these BFF endpoints are matched as **local path
  consts in `index.ts`** (exactly like the existing `SIGNIN_PATH` / `REGISTER_PATH`),
  and added to `index.ts`'s local `CSRF_PROTECTED_PATHS`. **Match the recovery-email
  endpoints by exact path equality** (`originalUrl.split('?')[0] === PATH`, as the dev
  middlewares already do), **not** `isSegmentMatch`: the latter prefix-matches, so a
  handler keyed on `/auth/recovery-email` would also swallow `/auth/recovery-email/confirm`
  (and route the confirm body to the set handler). Equivalently, if `isSegmentMatch` is
  reused, the `/auth/recovery-email/confirm` check must come **before** the bare
  `/auth/recovery-email` check. (Adding both to `CSRF_PROTECTED_PATHS` via `isSegmentMatch`
  is fine — there the prefix-match correctly protects both.) They do **not** go into the
  shared `auth-paths.ts` lists — those carry route-guard / cookie-plant / bearer-attach
  semantics that don't apply to these authenticated endpoints, and they are not page
  routes. **Add no new exported const to `auth-paths.ts`**: `auth-paths-drift.test.ts`
  pins the exact set of six export names (`auth-paths-drift.test.ts:51-58`), so a new
  const would fail the anchor. (The only `auth-paths.ts` edit in this whole plan is the
  two public _page_ routes in Task 3.3.)
- **Dev mirror:** mirror the handlers in the dev Vite proxy `web/vite.config.ts` as
  local path checks (like the existing `'/auth/signin'` middleware), including the SMTP
  send to Mailpit at `localhost:1025`. `auth-proxy/test/auth-paths-drift.test.ts` must
  stay green (it will, since neither `auth-paths.ts` copy changes here).
- Apply the per-address send cap (the verify RPC enforces it) and surface a generic
  "too many requests" if exceeded.

**Files:**

- `auth-proxy/src/index.ts` (modify — mount the endpoints as local path consts + add to
  `CSRF_PROTECTED_PATHS`)
- `web/vite.config.ts` (modify — dev proxy mirror as local path checks)
- `auth-proxy/test/recovery-email.test.ts` (create)

**Steps:**

1. RED — Create `auth-proxy/test/recovery-email.test.ts` (stub GoTrue/PostgREST/SMTP,
   mirror `auth-proxy/test/register.test.ts` style): set sends the code and calls the
   verify RPC with the user bearer; confirm calls `confirm_recovery_email`; missing CSRF
   → 403 with no upstream call; remove clears the address; success/throttle shapes.
2. RED — `cd auth-proxy && pnpm test`; confirm red.
3. GREEN — Implement the endpoints in `index.ts` (local path consts + `CSRF_PROTECTED_PATHS`)
   and mirror the handlers in `vite.config.ts`. Do **not** edit `auth-paths.ts`.
4. GREEN — `cd auth-proxy && pnpm test` (incl. the drift test); confirm green.

**Verify:** `cd auth-proxy && pnpm test && pnpm lint`

### [ ] 2.3 Forgot-password + reset-password endpoints (signed-out, scoped role)

**Created:** 2026-06-17T19:02:51Z
**Completed:**

**Why:** The signed-out half (R4, R5, R6, R7, R8): request a reset by username (code to
the on-file address only, constant response), then set a new password from the code —
both via the scoped role, neither revealing account/recovery existence.

**Prerequisites:** Task 2.1 (scoped-role client + mailer); Task 1.3 (reset RPCs). The
in-memory `RateLimiter` and `constantShapeFailure` exist
(`auth-proxy/src/lib/rate-limit.ts`).

**Decisions:**

- `POST /auth/forgot-password` `{username}` (CSRF, no session): per-IP throttle (reuse
  the existing limiter); generate code; then **emit the constant `200` first and run the
  lookup-and-send entirely after responding** — fire-and-forget
  `request_password_reset(username, hash)` via the **scoped role** → address or NULL,
  and only if an address came back, SMTP the code there. The `200` must **not** await
  the RPC: a hit does an extra per-address-cap check + token INSERT (and the send),
  while a miss returns fast, so awaiting the RPC before responding would make the
  response measurably slower for accounts that _have_ a recovery e-mail — a timing
  oracle R5 forbids. The requirement is **timing parity**, not just an identical body:
  neither the lookup nor the send sits on the response's critical path.
- `POST /auth/reset-password` `{username, code, new_password}` (CSRF, no session):
  per-IP throttle; `reset_password(username, hash, new_password)` via the scoped role.
  The RPC **returns a status string** (`'ok'` | `'invalid'` | `'locked'`); the BFF
  replies `200` on `'ok'` and **collapses `'invalid'` and `'locked'` to one generic
  "invalid or expired code"** (R5/R8 — the signed-out path reveals less than the
  authenticated confirm path). A raised `23514` (correct code, too-short password) maps
  to the same minimum-length error the register flow returns. No cookies are planted —
  the user signs in afterwards (R6).
- Enforce the same password minimum length the register flow uses, for fast feedback
  (the RPC re-checks authoritatively).
- **Where the endpoint paths live (as in 2.2):** the forgot/reset BFF endpoints are
  matched as **local path consts in `index.ts`** (like `SIGNIN_PATH`) and added to its
  local `CSRF_PROTECTED_PATHS`; mirror them in `web/vite.config.ts` as local path
  checks. They do **not** join the shared `auth-paths.ts` lists and introduce **no new
  exported const** (the drift-test anchor). The _web page_ routes
  `/auth/forgot-password` + `/auth/reset-password` are added to `PUBLIC_AUTH_PATHS` +
  `SIGNED_IN_REDIRECT_PATHS` in **Task 3.3**, when those route pages exist — not here
  (in Phase 2 the pages don't exist yet, so adding them now would point the dev proxy's
  `bypass` at a missing route).

**Files:**

- `auth-proxy/src/index.ts` (modify — local path consts + `CSRF_PROTECTED_PATHS`)
- `web/vite.config.ts` (modify — dev proxy mirror as local path checks)
- `auth-proxy/test/forgot-reset.test.ts` (create)

**Steps:**

1. RED — Create `auth-proxy/test/forgot-reset.test.ts` (stub PostgREST/SMTP): a
   match sends a code to the returned address and responds 200; a NULL result sends
   nothing but **still** responds an identical 200 (assert byte-identical body/status);
   the 200 is emitted **without awaiting the lookup** (a stubbed `request_password_reset`
   that never resolves still yields a prompt 200 — proves the lookup/send are off the
   response path, R5 timing parity); missing CSRF → 403; per-IP throttle → 429; reset
   with a valid code calls `reset_password` and plants **no** cookie; reset with a bad
   code → generic error.
2. RED — `cd auth-proxy && pnpm test`; confirm red.
3. GREEN — Implement the endpoints in `index.ts` (local path consts + `CSRF_PROTECTED_PATHS`)
   and mirror the handlers in `vite.config.ts`. Do **not** edit `auth-paths.ts`.
4. GREEN — `cd auth-proxy && pnpm test` (incl. drift); confirm green.

**Verify:** `cd auth-proxy && pnpm test && pnpm lint`

### [ ] 2.4 Wire the recovery endpoints into prod + dev infrastructure

**Created:** 2026-06-17T19:40:24Z
**Completed:**

**Why:** The recovery feature is dead in production unless (a) Caddy routes the new
endpoints to the auth-proxy, (b) the auth-proxy container actually receives its SMTP
config and the scoped-role credential, and (c) the scoped-role JWT exists at all.
Without this task the unit tests (2.1–2.3) pass on stubs while dev, the e2e canary
(4.1), and prod all fail to reach the scoped RPCs or send mail. (Prod-facing — see
CLAUDE.md "We are going live".)

**Prerequisites:** Tasks 2.1–2.3 (the endpoints, mailer, and scoped-role client exist).

**Decisions:**

- **Caddy (prod routing).** `caddy/Caddyfile.prod` routes only an explicit allow-list of
  `/auth/*` to `auth-proxy:3002`; everything else falls through to the SPA
  (`handle { reverse_proxy web:80 }`). Add the four new POST endpoints
  (`/auth/recovery-email*`, `/auth/recovery-email/confirm*`, `/auth/forgot-password*`,
  `/auth/reset-password*`) to the `@auth_credentials` matcher (`caddy/Caddyfile.prod:59-64`),
  keeping its **POST** method gate so the page GETs for `/auth/forgot-password` /
  `/auth/reset-password` still reach the SPA. Use the same `X-Real-IP` upstream header
  rationale as the existing credential block. Confirm the remove path is modelled as
  **POST `{remove:true}`** (chosen in 2.2), not `DELETE`, so the POST-only matcher
  covers it.
- **Prod compose env.** The `auth-proxy` service in `docker-compose.prod.yml:57-66`
  today gets only `GOTRUE_URL`, `POSTGREST_URL`, `PORT`, `COOKIE_SECURE`. Add the
  `SMTP_HOST/PORT/USER/PASS/FROM` env (the same vars already fed to the `gotrue`
  service) and the scoped-role credential `AUTH_BFF_DB_JWT`. Add `AUTH_BFF_DB_JWT` to
  `.env.prod.example` with a comment on how it is minted.
- **Scoped-role JWT provisioning.** `cairn_auth_bff` needs a long-lived JWT carrying
  `{"role":"cairn_auth_bff"}` signed with the GoTrue `JWT_SECRET` (the standard
  PostgREST service-role pattern; include a far-future `exp`). Settle the minting
  mechanism: a small documented one-shot (e.g. `scripts/mint-bff-jwt.sh` or a documented
  `node -e` snippet reading `JWT_SECRET`) — **not** generated on every BFF boot, so it
  can be rotated independently. This JWT is a high-value secret (it is a reset-takeover
  primitive per the corrected R7): never logged, env-only, rotatable.
- **Dev wiring.** The dev Vite proxy (`web/vite.config.ts`) calls PostgREST directly
  and must present the same scoped-role JWT for the forgot/reset RPCs (they are granted
  only to `cairn_auth_bff`, so anon fails). Provide a dev `AUTH_BFF_DB_JWT` (signed with
  the dev `JWT_SECRET`) via `.env`, and read it in the dev recovery handlers. Without it
  the e2e canary (4.1) cannot complete a reset.
- **Docs.** This is the wiring that Task 0.1's `docs/deployment.md` edit describes;
  cross-check that the documented env + pre-deploy checklist items match what this task
  actually adds.

**Files:**

- `caddy/Caddyfile.prod` (modify)
- `docker-compose.prod.yml` (modify) · `.env.prod.example` (modify)
- `web/vite.config.ts` (modify — read the dev scoped-role JWT) · `.env.example` (modify)
- `scripts/mint-bff-jwt.sh` (create, or document the snippet in `docs/deployment.md`)

**Steps:**

1. Add the four POST endpoints to the `@auth_credentials` matcher in
   `caddy/Caddyfile.prod`.
2. Add `SMTP_*` + `AUTH_BFF_DB_JWT` to the `auth-proxy` service env in
   `docker-compose.prod.yml`; add `AUTH_BFF_DB_JWT` to `.env.prod.example` /
   `.env.example` with the minting comment.
3. Settle + implement the JWT minting (script or documented snippet); wire the dev JWT
   into `web/vite.config.ts`'s recovery handlers.
4. Cross-check against Task 0.1's `docs/deployment.md` edits (env list + pre-deploy
   checklist).

**Verify:** `cd auth-proxy && pnpm test && pnpm lint` (the wiring itself has no unit
test; the end-to-end proof is the Phase-4 canary on the work box) · manual review that
the prod Caddy + compose changes match `docs/deployment.md`.

## Phase 3 — web

### [ ] 3.1 Auth-client functions + `user_settings` recovery-e-mail read

**Created:** 2026-06-17T19:02:51Z
**Completed:**

**Why:** The screens (3.2, 3.3) need typed client calls to the new BFF endpoints, and
Settings needs to read the current recovery e-mail (writes go through the BFF, since
the column is now read-only via PostgREST).

**Prerequisites:** Phase 2 (the endpoints exist). The auth client patterns live in
`web/src/lib/auth/model/auth-client.ts` (the `postJson` helper, `X-Cairn-Auth` header,
`HttpError`); user-settings state in `web/src/lib/privacy/state/user-settings.svelte.ts`
(`pgGet`/`pgPatch`).

**Decisions:**

- Add to `auth-client.ts`: `setRecoveryEmail(email)`, `confirmRecoveryEmail(code)`,
  `removeRecoveryEmail()`, `requestPasswordReset(username)`,
  `resetPassword(username, code, newPassword)` — each `postJson` to its endpoint with
  the CSRF header, throwing `HttpError` on non-2xx, **uniformly** (no special-cased
  function). In particular `requestPasswordReset` throws like the existing
  `sendMagicLink`; the anti-enumeration swallow is **not** in the client — the
  ForgotPassword screen (3.3) catches and ignores any error (mirroring
  `LoginRequest.svelte:53`'s `sendMagicLink(email).catch(() => {})`). The BFF's constant
  `200` plus that screen-level swallow give the identical-outcome behaviour (R5), with
  the client staying consistent with the rest of `auth-client.ts`.
- In `user-settings.svelte.ts`: read `recovery_email` via `pgGet` into state; do **not**
  add a `pgPatch` writer for it (writes go through the BFF). Keep `invite_policy` as is.

**Files:**

- `web/src/lib/auth/model/auth-client.ts` (modify)
- `web/src/lib/auth/model/auth-client.test.ts` (modify/create)
- `web/src/lib/privacy/state/user-settings.svelte.ts` (modify)
- `web/src/lib/privacy/state/user-settings.test.ts` (modify, if present)

**Steps:**

1. RED — Add tests: each client function posts to the right path with the CSRF header
   and the expected body, returns on 2xx, throws `HttpError` on non-2xx (mock fetch) —
   including `requestPasswordReset`, which throws like the others (the swallow is the
   ForgotPassword screen's job, tested in 3.3). `user_settings` read surfaces
   `recovery_email`.
2. RED — `cd web && pnpm test`; confirm red.
3. GREEN — Implement the functions and the read.
4. GREEN — `cd web && pnpm test`; confirm green.

**Verify:** `cd web && pnpm test && pnpm lint && pnpm check`

### [ ] 3.2 Settings recovery-e-mail capture + confirm UI

**Created:** 2026-06-17T19:02:51Z
**Completed:**

**Why:** R3's user-facing surface: set/change a recovery e-mail and confirm it with the
emailed code, from Settings.

**Prerequisites:** Task 3.1 (`setRecoveryEmail`, `confirmRecoveryEmail`,
`removeRecoveryEmail`, the `recovery_email` read). Settings screen at
`web/src/lib/settings/components/SettingsScreen.svelte`, routed `/settings`.

**Decisions (layout spec — `design/cairn-screens.jsx` + `docs/ui.md`):**

- **Entry point in Settings:** a row under the **Account** area (NOT the existing
  "Recovery" section — that label is deleted-lists/trash; do not reuse it). Section
  label → global `h2`; rows follow the existing Settings row pattern.
- **No recovery e-mail set:** a single full-width add affordance — label "Add recovery
  e-mail", leading `plus` icon; helper text below (`.caption`/`var(--stone)`): "Store a
  recovery e-mail to reset your password if you forget it. You'll need to verify it
  first."
- **Set + verified:** show the address (read from state) with **Change** (left) and
  **Remove** (right) — button-pair order per `docs/ui.md` (right = committal). Remove
  tone destructive (`var(--ember)`).
- **Field + code step:** reuse `TextInput`/`Button`/`Label` from
  `web/src/lib/basic/components`. The e-mail field uses `type="email"`,
  `inputmode="email"`. After submit, show a "check your inbox" code-entry step
  (template: `LoginCheck.svelte`) — heading via serif global, the address bolded in the
  body, a 6-digit code input (`inputmode="numeric"`, `maxlength=6`, `.mono`), and a
  primary "Verify and save" button. Inline error (`var(--ember)`) on a bad code; the
  pending state is client-held (no persistent badge — see non-requirements).
- Layout/structure from the JSX; **colour + type from tokens/globals only**, never hex.

**Files:**

- `web/src/lib/settings/components/RecoveryEmailRow.svelte` (create)
- `web/src/lib/settings/components/RecoveryEmailVerify.svelte` (create)
- `web/src/lib/settings/components/SettingsScreen.svelte` (modify — mount the row)
- `web/src/lib/settings/components/RecoveryEmailRow.test.ts` (create)
- `web/src/lib/settings/components/RecoveryEmailVerify.test.ts` (create)

**Steps:**

1. RED — Component tests (user-visible behaviour): empty state shows "Add"; set state
   shows the address + Change/Remove; submitting an address calls `setRecoveryEmail` and
   advances to the code step; a correct code calls `confirmRecoveryEmail` and shows the
   active address; a bad code shows the inline error; Remove calls `removeRecoveryEmail`.
2. RED — `cd web && pnpm test`; confirm red.
3. GREEN — Build the components per the layout spec; mount the row in `SettingsScreen`.
4. GREEN — `cd web && pnpm test`; confirm green.

**Verify:** `cd web && pnpm test && pnpm lint && pnpm check`

### [ ] 3.3 Forgot-password + reset-password screens, routes, and guard

**Created:** 2026-06-17T19:02:51Z
**Completed:**

**Why:** R4/R5's signed-out surface: request a reset by username (anti-enumeration
constant screen) and set a new password from the code, then sign in.

**Prerequisites:** Task 3.1 (`requestPasswordReset`, `resetPassword`). Sign-in screen

- route exist (`web/src/lib/auth/components/SignIn.svelte`, `/auth/signin`); the route
  guard reads `PUBLIC_AUTH_PATHS` + `SIGNED_IN_REDIRECT_PATHS` from
  `web/src/lib/shared/model/auth-paths.ts` (`web/src/routes/+layout.svelte`); the
  anti-enumeration "swallow errors, same screen" pattern is in
  `web/src/lib/auth/components/LoginRequest.svelte:53`.

**Decisions (layout spec — `design/cairn-screens.jsx` + `docs/ui.md`):**

- **`/auth/forgot-password`** (template: `LoginRequest`): centred column, Cairn glyph +
  serif heading, a single **username** field, a primary "Send reset code" button, and
  helper text. On submit, mirror `LoginRequest`: call `requestPasswordReset(username)`,
  swallow any error, and **always** advance to the reset screen (R5) — no inline error,
  no snackbar for the public path. Carry the username forward in a small client store
  (a `pending-reset.svelte.ts`, mirroring `web/src/lib/auth/state/pending-login.svelte.ts`).
- **`/auth/reset-password`** (template: `LoginCheck` + a password field): heading "Set a
  new password"; a **username** field (pre-filled from the `pending-reset` store when
  present, but always shown and editable), a 6-digit code input (`inputmode="numeric"`,
  `maxlength=6`, `.mono`), and a new-password field (`type="password"`); a primary
  "Reset password" button. The username field is load-bearing for UX: the reset code
  arrives by e-mail and is often opened on a **different device or tab** (or after a
  reload that wipes the in-memory store), so the screen must not depend on the pending
  username — `reset_password` already takes the username as a parameter. Only fall back
  to `/auth/forgot-password` if the user submits with no username at all. On success,
  route to `/auth/signin` (no auto-login, R6); on a bad code show an inline error
  (`var(--ember)`); transient → snackbar.
- Add a **"Forgot password?"** text link to `SignIn.svelte` → `/auth/forgot-password`.
- Add both routes to `PUBLIC_AUTH_PATHS` **and** `SIGNED_IN_REDIRECT_PATHS` in
  `auth-paths.ts` — **append to the existing arrays in both copies** (web's canonical
  file and the `auth-proxy` verbatim copy), adding **no new exported const**, so the
  `auth-paths-drift.test.ts` name anchor (`:51-58`) stays green. This is the **only**
  `auth-paths.ts` edit in the whole plan (the BFF recovery endpoints in Phase 2 are
  local consts in `index.ts`, not shared entries). The screens navigate to these
  routes, so create the route pages in this same task (per `writing-tasks.md` cross-task
  coupling) to satisfy `resolve()`/`svelte-check`. Route-colocated tests drop the `+`
  (`page.test.ts`).

**Files:**

- `web/src/lib/auth/components/ForgotPassword.svelte` (create) · `web/src/routes/auth/forgot-password/+page.svelte` (create)
- `web/src/lib/auth/components/ResetPassword.svelte` (create) · `web/src/routes/auth/reset-password/+page.svelte` (create)
- `web/src/lib/auth/state/pending-reset.svelte.ts` (create)
- `web/src/lib/auth/components/SignIn.svelte` (modify — add the link)
- `web/src/lib/shared/model/auth-paths.ts` (modify) · `auth-proxy/src/lib/auth-paths.ts` (modify — keep drift green)
- `web/src/lib/auth/components/ForgotPassword.test.ts` · `web/src/lib/auth/components/ResetPassword.test.ts` (create)

**Steps:**

1. RED — Component tests: ForgotPassword calls `requestPasswordReset`, **swallows** any
   thrown `HttpError`, and advances to the reset screen on **every** outcome (success,
   4xx, 5xx) with no error UI (mirror `LoginRequest.test.ts` cases); stores the
   username. ResetPassword pre-fills the username from the `pending-reset` store when
   present, **and still submits when reached with no pending username** (the
   cross-device / reloaded case — username typed in); calls `resetPassword` and routes
   to `/auth/signin` on success; shows an inline error on a bad code; falls back to
   `/auth/forgot-password` only when submitted with no username at all.
2. RED — `cd web && pnpm test`; confirm red.
3. GREEN — Build the screens, the route pages, the pending-reset store, the SignIn
   link, and the `auth-paths.ts` additions (both copies). Add the route IDs to the guard
   lists.
4. GREEN — `cd web && pnpm test && pnpm check`; confirm green (svelte-check validates
   the new route IDs and the drift between auth-path copies).

**Verify:** `cd web && pnpm test && pnpm lint && pnpm check`

## Phase 4 — e2e canary

### [ ] 4.1 End-to-end recovery canary (Playwright)

**Created:** 2026-06-17T19:02:51Z
**Completed:**

**Why:** The one test that proves the whole flow and pins the load-bearing coupling:
that a password written by the pgcrypto RPC (R6) is actually accepted by GoTrue
v2.158.1's password grant. pgTAP cannot prove this (its DB has no GoTrue).

**Prerequisites:** Phases 1–3 merged into the working stack. The Mailpit helper
`web/e2e/helpers/mailpit.ts` (`waitForMagicLink`, code extraction) and the auth e2e
patterns (`web/e2e/auth.spec.ts`) exist.

**Decisions:**

- Single spec exercising: register a fresh account → set a recovery e-mail in Settings
  → read the verify code from Mailpit → confirm → sign out → forgot-password by username
  → read the reset code from Mailpit → reset → **sign in with the new password
  succeeds** and **the old password fails**. Extend the Mailpit helper if the verify/
  reset mails need a code-by-recipient lookup (they carry a 6-digit code like the
  existing OTP mail).
- Also assert the anti-enumeration surface at the e2e level: forgot-password for an
  unknown username shows the identical "check your inbox" screen and no mail arrives.
- **Machine-conditional:** this laptop cannot run Playwright (`docs/testing.md`); author
  the spec here and run it on the work box (chromium + firefox; not webkit). Do not fake
  a pass — if it can't run, say so in the task Notes.

**Files:**

- `web/e2e/password-recovery.spec.ts` (create)
- `web/e2e/helpers/mailpit.ts` (modify, if a new extractor is needed)

**Steps:**

1. Write the spec per Decisions, reusing `mailpit.ts` and the `auth.spec.ts` sign-in
   helpers.
2. On the work box: `cd web && pnpm test:e2e` (or `pnpm exec playwright test
password-recovery.spec.ts`) on chromium + firefox; confirm green.

**Verify:** `cd web && pnpm exec playwright test e2e/password-recovery.spec.ts` (work
box only) · `./scripts/check.sh` for the rest of the gauntlet.
