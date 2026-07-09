# Tasks

## Reference skills and docs

- **`docs/account-deletion.md`** — canonical model, function body, API
  surface, and user-facing copy. Source of truth for every task here.
- **`docs/ui.md`** — full-screen-vs-sheet, destructive rows, button-pair
  order, delete-account visual treatment.
- **`docs/testing.md`** — three test layers; pgTAP needs positive _and_
  negative cases for the new RPC.
- **`docs/quality.md`** — "Navigating to a not-yet-created SvelteKit route"
  escape pattern (relevant to the Settings row → delete route coupling).
- **`design/cairn-screens.jsx`** (`DeleteAccountScreen` ~1369–1499, Account
  section ~1233–1244) — layout/copy/ordering reference **only**; build with
  existing primitives + tokens, do not port the JSX.

## Phase 0 — reconcile docs

### [x] 0.1 Correct the false "Export before delete — done" claim

**Created:** 2026-06-11T12:57:18Z
**Completed:** 2026-06-11T13:02:11Z

**Why:** `docs/account-deletion.md` → "Future work" asserts export is
"done". Export is step 12 and unbuilt; leaving the claim makes downstream
plans reference a stale spec, and this plan stubs the export panel disabled
precisely because export doesn't exist yet.

**Prerequisites:** None.

**Decisions:**

- Reword the "Export before delete — done." bullet to state that export is a
  later step (step 12) and that the delete screen's "Want a copy first?"
  panel is present but its Download action is disabled until export lands.
- Keep the rest of the doc unchanged — it remains the source of truth for
  the model, the function body, and the copy.

**Files:**

- `docs/account-deletion.md` (modify)

**Steps:**

1. Edit the "Future work" section's first bullet (currently "**Export before
   delete — done.**") to describe the real state: export is step 12; the
   delete screen carries the courtesy panel but its action is disabled
   ("coming soon") until step 12 wires it to the export hub.

**Verify:** `git diff docs/account-deletion.md` reads correctly · no code
touched, so no test run needed.

## Phase 1 — DB: the delete_account() RPC

### [x] 1.1 Add `delete_account()` RPC migration + pgTAP (positive & negative)

**Created:** 2026-06-11T12:57:18Z
**Completed:** 2026-06-11T13:08:31Z

**Why:** This is the only sanctioned account-deletion path. It must delete
the caller's own account (sole-member lists hard-deleted; personal data
cascaded; shared attribution repointed to the tombstone) and refuse
unauthenticated, tombstone, and `anon` callers. RLS/grants are the security
boundary — an untested policy is an unverified claim.

**Prerequisites:** None at runtime — the tombstone user and all
attribution/personal FKs already exist from
`db/migrations/0004_domain_schema.sql`. `db/test-bootstrap.sql`'s
`auth.users` stub already covers the needed columns; do **not** modify it.

**Decisions:**

- Function: `public.delete_account() RETURNS void LANGUAGE plpgsql SECURITY
DEFINER SET search_path = public, auth`. Body verbatim shape from
  `docs/account-deletion.md` → "The `delete_account` function".
- **Guards first** (match `create_list()`'s idiom): `uid := public.uid()`;
  if `NULL` → `RAISE EXCEPTION 'not authenticated' USING errcode = '28000'`;
  if `uid = '00000000-0000-0000-0000-000000000000'` → `RAISE EXCEPTION
'cannot delete the tombstone user' USING errcode = '28000'`.
- **Order is load-bearing:** delete sole-member lists _first_
  (`DELETE FROM public.lists l WHERE NOT EXISTS (SELECT 1 FROM
public.list_members lm WHERE lm.list_id = l.id AND lm.deleted_at IS NULL
AND lm.user_id <> uid)`), _then_ `DELETE FROM auth.users WHERE id = uid`.
  Deleting the auth row first would empty `list_members` via cascade and
  mis-classify shared lists.
- Grants: `REVOKE ALL ON FUNCTION public.delete_account() FROM public;` then
  `GRANT EXECUTE ON FUNCTION public.delete_account() TO authenticated;`.
- Migration number is the next free one: `0014`. Wrap in `BEGIN; … COMMIT;`.
- Test idioms (from `db/tests/rpc_create_list.sql` + `fk_set_default.sql`):
  set the caller via `set_config('request.jwt.claims', '{"sub":"…"}', TRUE)`
  and `SET LOCAL ROLE authenticated`; reuse fixtures
  `db/tests/fixtures/users_alice_bob_carol.sql` and
  `list_shared_alice_bob.sql`; assert with `is`/`throws_ok`/`lives_ok`; wrap
  in `BEGIN … ROLLBACK`; declare `plan(N)` and call `finish()`.

**Reference:** `docs/account-deletion.md` (function body + "What gets
deleted, anonymized, or kept" table); `db/tests/fk_set_default.sql` for the
set-default assertion pattern and the cross-actor seeding caveat
(membership `user_id` cascade fires before `created_by` set-default).

**Files:**

- `db/tests/rpc_delete_account.sql` (create)
- `db/migrations/0014_delete_account.sql` (create)

**Steps:**

1. RED — Write `db/tests/rpc_delete_account.sql`. Positive (Alice deletes):
   her sole-member list + its items/votes are gone; a shared list with Bob
   survives; Alice's membership + votes on it are gone; a surviving item's
   `created_by` that pointed at Alice is now the tombstone UUID; her
   `profiles` and `user_settings` rows are gone; the tombstone `profiles`
   row still exists. Cross-actor: an item whose `modified_by` pointed at a
   _different, non-deleted_ user is unchanged. Negative: `anon` →
   `throws_ok(…, '42501', …)`; empty JWT claims → `throws_ok(…, '28000',
'not authenticated')`; tombstone-`sub` claim → `throws_ok(…, '28000',
'cannot delete the tombstone user')`.
2. RED — `./scripts/test-db.sh`; confirm the new file is red (function
   absent).
3. GREEN — Write `db/migrations/0014_delete_account.sql` per Decisions.
4. GREEN — `./scripts/test-db.sh`; confirm green.

**Verify:** `./scripts/test-db.sh`

## Phase 2 — Settings entry + NavRow destructive tone

### [x] 2.1 Add a `tone` prop to `NavRow`

**Created:** 2026-06-11T12:57:18Z
**Completed:** 2026-06-11T13:15:16Z

**Why:** The Settings "Delete account" row must render red (destructive),
but `NavRow` currently hard-codes its inner `Button` to `tone="ink"`. A
shared prop is cleaner than forking a destructive row component.

**Prerequisites:** None.

**Decisions:**

- Add optional prop `tone?: 'ink' | 'destructive'` (default `'ink'`) to
  `NavRow` and forward it to the inner `Button` (which already supports
  `tone="destructive"`).
- When `destructive`, the lead icon and title render in `var(--ember)` — use
  the token, never a hex. If `Button`'s `variant="text"` doesn't already
  colour by tone, add the minimal CSS rule so it does (no global disable).
- Component tests assert user-visible behaviour: a destructive `NavRow`
  exposes the destructive styling hook / colour; the default stays ink.

**Reference:** `web/src/lib/shared/components/NavRow.svelte`,
`web/src/lib/basic/components/Button.svelte`.

**Files:**

- `web/src/lib/shared/components/NavRow.svelte` (modify)
- `web/src/lib/shared/components/NavRow.test.ts` (create or modify — colocate
  next to the component)

**Steps:**

1. RED — Add/extend a Vitest asserting a `NavRow` rendered with
   `tone="destructive"` carries the destructive treatment (e.g. the inner
   Button receives `tone="destructive"` / the destructive class is present),
   and that the default render is ink. Run `pnpm test`; confirm red.
2. GREEN — Add the `tone` prop and forward it; add the `var(--ember)` rule
   if needed. Run `pnpm test`; confirm green.

**Verify:** `pnpm test` · `pnpm check` · `pnpm lint`

**Notes:** Side work — the shared Button test mock
(`web/src/lib/basic/components/__mocks__/Button.svelte`) strips all props,
so the forwarded `tone` was invisible to the test. Added `data-tone={rest.tone}`
to the mock's `<button>` so the forwarding is observable; harmless to other
suites (none assert on it). The `.row-title` global role pins `color: --ink`,
so the title needed an explicit `.nav-row.destructive .nav-row-title { color:
var(--ember); }` override — the lead/chevron icons already inherit `--ember`
from the Button via `currentColor`.

### [x] 2.2 Add the "Delete account" row to Settings + route stub

**Created:** 2026-06-11T12:57:18Z
**Completed:** 2026-06-11T13:22:36Z

**Why:** Settings → Account must expose the entry point to the delete flow,
below "Sign out" (left-of-pair = backward/destructive ordering). The row
navigates to a dedicated full-screen route.

**Prerequisites:** Task 2.1 (`NavRow` `tone` prop). The destructive row's
target route is created here as a minimal stub so `resolve()` /
`svelte-check` accept the navigation — Phase 3 fills the screen in. (See
`docs/quality.md` → "Navigating to a not-yet-created SvelteKit route" if you
prefer the per-line escape instead; the stub is the cleaner option here.)

**Decisions:**

- New row in the Account section of
  `web/src/lib/settings/components/SettingsScreen.svelte`, _below_ the
  existing "Sign out" `NavRow`:
  ```svelte
  <NavRow title="Delete account" data-test="delete-account" tone="destructive"
          onclick={() => goto(resolve('/settings/delete-account'))}>
    {#snippet lead()}<Icon name="trash" size={20} />{/snippet}
  </NavRow>
  ```
  (use the same `goto`/`resolve` imports the file already uses).
- Create the route `web/src/routes/(app)/settings/delete-account/+page.svelte`
  and a **stub** `web/src/lib/account/components/DeleteAccountScreen.svelte`
  (just `AppTopBar` with back arrow + a "Delete account" heading) so the
  route resolves and `pnpm check` passes. Phase 3 builds out the screen.
- Route-level colocated test files drop the `+` — not relevant here (no test
  next to `+page.svelte`); the screen's Vitest lands in Phase 3.

**Reference:** `web/src/lib/settings/components/SettingsScreen.svelte`
(Account section ~lines 154–160), `web/src/lib/shared/components/AppTopBar.svelte`.

**Files:**

- `web/src/lib/settings/components/SettingsScreen.svelte` (modify)
- `web/src/lib/settings/components/SettingsScreen.test.ts` (modify)
- `web/src/routes/(app)/settings/delete-account/+page.svelte` (create)
- `web/src/lib/account/components/DeleteAccountScreen.svelte` (create — stub)

**Steps:**

1. RED — Extend `SettingsScreen.test.ts`: assert `delete-account` row is
   present and clicking it calls `goto` with the delete-account route (mock
   `$app/navigation`, mirroring the existing `signout` test). Run
   `pnpm test`; confirm red.
2. GREEN — Add the row to `SettingsScreen.svelte`; create the route file and
   the stub `DeleteAccountScreen.svelte`. Run `pnpm test`; confirm green.
3. GREEN — Run `pnpm check` to confirm the route resolves under
   `svelte-check` (catches the not-yet-created-route trap in-task).

**Verify:** `pnpm test` · `pnpm check` · `pnpm lint`

**Notes:** User reminder (invocation arg) — every NavRow under "Account"
should have a top and bottom rule, like under People or Recovery. Satisfied
by placing the new row inside the existing Account `.nav-rows` band below
"Sign out": the global `.nav-rows` rule (`surfaces.css:77`) draws a rule above
the first row and below the last, plus a divider between adjacent rows, so each
of the two rows is now bounded top and bottom — matching the two-row People
band. No new CSS needed.

## Phase 3 — Delete-account screen + teardown

### [x] 3.1 Build the full delete-account screen, teardown, and confirmation

**Created:** 2026-06-11T12:57:18Z
**Completed:** 2026-06-11T13:46:57Z

**Why:** This is the screen the user reads before deleting and the code that
performs the documented teardown. It must explain consequences in plain
British English, gate the destructive button behind a typed `delete`, run
the RPC → sidecar → session-cookie sequence, and show an inline confirmation
that hands off to sign-out.

**Prerequisites:** Task 1.1 (`delete_account()` RPC exists), Task 2.2 (route

- stub screen exist). Existing helpers to reuse:
  `pgPost`/error types in `web/src/lib/shared/http/postgrest.ts`; `signOut()`
  and `AUTH_BASE` in `web/src/lib/shared/state/session.svelte.ts`; the
  fire-and-forget `fetch('/avatars/me', { method: 'DELETE' }).catch(() => {})`
  pattern from `web/src/routes/(app)/profile/+page.svelte` (`removeAvatar`);
  `Button`, `AppTopBar`, and the `$lib/test/render` + `$lib/test/handlers`
  MSW setup.

**Decisions:**

- Build out `web/src/lib/account/components/DeleteAccountScreen.svelte`
  (replacing the Phase 2 stub). Full-screen page, `AppTopBar` with back
  arrow (back uses `history.back()` per the back-stack convention), title
  "Delete account". Layout/copy/ordering from the JSX
  (`DeleteAccountScreen` ~1369–1499) but implemented with existing
  primitives + global type roles + tokens — do **not** port the JSX colours
  or inline styles.
- **Copy (R6)**, plain British English, they/them, "e-mail" hyphenated, in
  order: hero question + short italic subtitle; then three labelled blocks —
  _what's permanently removed_ (e-mail, profile, votes), _what stays on
  shared lists_ (items they added, name → "Deleted user"), _what's deleted
  with them_ (sole-member lists); then a "This can't be undone." line.
- **Export panel (R8):** render the "Want a copy of your data first?" card
  with its Download button **disabled** ("coming soon"); add a
  `TODO(step-12)` to wire it to the export hub. Non-blocking.
- **Typed gate (R7):** a text input; the destructive "Delete my account"
  `Button` (`tone="destructive"`) stays `disabled` until the trimmed value
  `=== 'delete'`, and is also disabled while the request is in flight.
- **Teardown (R9), on confirm, in order:** (1) `pgPost('/rpc/delete_account',
{})`; on success → (2) `void fetch('/avatars/me', { method: 'DELETE'
}).catch(() => {})`; (3) clear the cookie via `fetch(`${AUTH_BASE}/session`,
{ method: 'DELETE', credentials: 'same-origin' })`; (4) show the
  confirmation view. On RPC error: show the message inline, stay signed in,
  skip steps 2–4.
- **Confirmation (R10):** swap to an inline view ("Your account has been
  deleted.") with one "Back to sign in" `Button` that calls the existing
  `signOut()` (which flips the session store to `signed-out`; the root guard
  in `web/src/routes/+layout.svelte` then redirects to `/auth/login`). Do
  **not** add a public route — leave `auth-paths.ts` / `public-paths.ts`
  untouched.
- Add an MSW handler `http.post('*/rpc/delete_account', …)` (204/empty) to
  `web/src/lib/test/handlers.ts`; reuse/confirm `*/avatars/me` and
  `*/auth/session` handlers exist.

**Reference:** `docs/account-deletion.md` → "API surface" (the exact
sequence) and "What the user sees" (copy); `docs/ui.md` for the destructive
button + full-screen treatment; `web/src/routes/(app)/profile/+page.svelte`
for the avatar-delete call shape.

**Files:**

- `web/src/lib/account/components/DeleteAccountScreen.svelte` (modify —
  replace stub)
- `web/src/lib/account/components/DeleteAccountScreen.test.ts` (create)
- `web/src/lib/test/handlers.ts` (modify)

**Steps:**

1. RED — Write `DeleteAccountScreen.test.ts`: (a) the destructive button is
   disabled until `delete` is typed; (b) a confirmed press calls
   `POST /rpc/delete_account`; (c) on success the confirmation view renders;
   (d) on RPC error the form stays and the error shows; (e) the export
   Download button is disabled. Run `pnpm test`; confirm red.
2. GREEN — Implement the screen per Decisions; add the
   `*/rpc/delete_account` MSW handler. Run `pnpm test`; confirm green.

**Verify:** `pnpm test` · `pnpm check` · `pnpm lint`

**Notes:**

- **Side work:** `AUTH_BASE` in `session.svelte.ts` was module-private; exported
  it (the task's Prerequisites named it as a helper to reuse). No behaviour change.
- **User corrections (copy):** the three consequence blocks address the user
  directly, so they're second person ("Your e-mail… every vote you've cast",
  "Items you added…", "Lists where you were the only remaining member") — _not_
  they/them. The they/them convention is for third parties, not second-person
  address. Block-3 heading is "What's deleted with **your account**" — you delete
  the account, not the user.
- Confirmation copy is account-framed too: "Your account has been deleted."

## Phase 4 — e2e and roadmap tick

### [x] 4.1 Playwright happy path for account deletion

**Created:** 2026-06-11T12:57:18Z
**Completed:** 2026-06-11T13:52:50Z

**Why:** Account deletion is a user-visible, destructive, auth-touching flow;
per the project rules it gets a Playwright touch before the PR.

**Prerequisites:** Tasks 1.1, 2.1, 2.2, 3.1 (full flow exists end to end).

**Decisions:**

- Model on `web/e2e/items.spec.ts` + the Mailpit magic-link helper
  (`web/e2e/helpers/mailpit.ts`): sign in a throwaway, unique-per-run user,
  go to Settings → Delete account, type `delete`, press the destructive
  button, assert the confirmation view appears and pressing "Back to sign
  in" lands on `/auth/login`.
- Use `data-test` selectors (`delete-account`, the typed input, the confirm
  button, the confirmation view, "Back to sign in"). Add any missing
  `data-test` hooks to the screen as part of this task.

**Reference:** `web/e2e/items.spec.ts`, `web/e2e/helpers/mailpit.ts`.

**Files:**

- `web/e2e/delete-account.spec.ts` (create)
- `web/src/lib/account/components/DeleteAccountScreen.svelte` (modify — only
  if extra `data-test` hooks are needed)

**Steps:**

1. RED — Write the spec per Decisions. Run `cd web && pnpm test:e2e` (or
   `./scripts/check.sh --e2e`); confirm it fails for the right reason if any
   hook is missing.
2. GREEN — Add any missing `data-test` hooks; re-run e2e; confirm green.

**Verify:** `./scripts/check.sh --e2e`

**Notes:**

- No `data-test` hooks were missing — the Phase 3 screen already carried every
  selector (`delete-account`, `delete-account-input`, `-confirm`, `-done`,
  `-signout`), so `DeleteAccountScreen.svelte` was not touched. The spec is the
  only new file.
- **Environment limit on the verifier:** WebKit can't launch in this sandbox
  (missing system libs — `libicu74`, `libjpeg-turbo8`, `gstreamer1.0-libav`),
  so the full `./scripts/check.sh --e2e` can't run all three browsers here. The
  new spec was run directly and **passes on Chromium + Firefox (8/8)** against
  the live dev stack (login → Settings → Delete account → typed gate → confirm
  → confirmation view → "Back to sign in" → `/auth/login`). Prettier + ESLint
  clean. WebKit needs verifying on a machine with the browser deps installed.

### [x] 4.2 Tick step 10 in the implementation order

**Created:** 2026-06-11T12:57:18Z
**Completed:** 2026-06-11T13:55:02Z

**Why:** The master roadmap tracks which steps have shipped; tick step 10
once the plan is merged.

**Prerequisites:** All prior tasks merged; `./scripts/check.sh` and
`./scripts/check.sh --e2e` green.

**Decisions:**

- Flip step 10's checkbox from `[ ]` to `[x]` in
  `plans/0000_implementation_order.md`. Do this as the final commit (or at
  merge time) per the project convention.

**Files:**

- `plans/0000_implementation_order.md` (modify)

**Steps:**

1. Change step 10 to `[x]`.

**Verify:** `git diff plans/0000_implementation_order.md`

**Notes:** Ticked at the user's request while still on the
`1000_account_deletion` branch (not yet merged to `main`). Two prerequisites
are therefore only partially met and remain the user's call at merge time:
(1) the branch isn't merged yet; (2) `./scripts/check.sh --e2e` was green on
Chromium + Firefox but WebKit couldn't launch in this environment (missing
browser system libs — see task 4.1 notes). Per the plan convention the tick is
"the final commit (or at merge time)"; if the merge slips, the box is already
flipped and matches the merged state.
