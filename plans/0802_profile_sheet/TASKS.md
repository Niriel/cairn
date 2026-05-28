# Tasks

## Reference skills and docs

- **`docs/ui.md`** — Profile screen (sheet) section: action table, block
  confirmation copy ("Block {Name}? They won't be able to invite you to any
  list."), own-avatar bounce to /settings.
- **`docs/invites.md`** — § "RLS and stored procedures": invitations_delete
  carve-out wording; anti-enumeration posture.
- **`docs/data-model.md`** — § "What the app sees": `DELETE /invitations?id=eq.<uuid>` endpoint.
- **`docs/frontend-layout.md`** — per-domain folder rules, mock placement.
- **`docs/testing.md`** — positive + negative RLS case requirement for every
  new policy.
- **`design/cairn-invite-screens.jsx`** — `ProfileSheet` function: drag handle
  (40×4 px, `border-radius: 99px`, `var(--stone-lt)`), avatar 68 px,
  display name 18 px / weight 600, badge 12 px / mono / weight 600 (`var(--sage)`
  for circle, `var(--ember)` for blocked), action rows gap 8 px / margin-top 18 px.

---

## Phase 0 — Doc reconciliation

### [x] 0.1 Update `docs/frontend-layout.md` — add `profile/` and correct `invites/` → `invite/`

**Created:** 2026-05-28T00:00:00Z
**Completed:** 2026-05-28T00:00:00Z

**Why:** PLAN.md's Decisions section incorrectly stated that `profile/` was
already listed in `docs/frontend-layout.md`. The doc only had `auth/`, `list/`,
`avatar/`, `settings/`, `invites/`, `circles/`. It also used the plural
`invites/` while all step-8 plans use the singular `invite/`. Correcting now so
Phase 3's new `profile/` folder has an accurate reference.

**Files:**
- `docs/frontend-layout.md` (modify)

**Steps:**
1. In `docs/frontend-layout.md` "Where things live", update the per-domain
   folder bullet: change `invites/` → `invite/` and add `profile/` to the list.

**Notes:**
- Applied during `/concerns` review on 2026-05-28 before Phase 1 execution.

---

## Phase 1 — DB: `invitations_delete` policy + grant

### [x] 1.1 Add `invitations_delete` RLS policy, DELETE grant, and pgTAP coverage

**Created:** 2026-05-28T17:27:36Z
**Completed:** 2026-05-28T17:59:46Z

**Why:** The profile sheet's *Cancel pending invite* action is a direct
`DELETE /invitations?id=eq.<uuid>`. Migration 0009 granted only `SELECT` on
`public.invitations` to `authenticated` and left `INSERT`/`DELETE` to RPCs.
This migration adds the `invitations_delete` policy and the `DELETE` grant;
without both, PostgREST silently returns an empty result rather than an error
when the caller tries to cancel.

**Prerequisites:** `db/migrations/0010_invite_cascades.sql` exists (the last
migration before this one). The pgTAP fixtures (`users_alice_bob_carol.sql`,
`list_solo_alice.sql`) are already used by neighbouring test files.

**Decisions:**
- Policy name: `invitations_delete`. Body:
  `CREATE POLICY invitations_delete ON public.invitations FOR DELETE USING (created_by = public.uid())`.
- Grant: `GRANT DELETE ON public.invitations TO authenticated`.
- Both go in a new file `db/migrations/0011_invitations_delete.sql`.
- The pgTAP test file is `db/tests/invitations_delete.sql`. Use `no_plan()`
  (consistent with `invitations.sql`) so adding a scenario later is a
  one-line change.
- `db/tests/grants.sql` currently has `plan(83)`. Add one positive assertion:
  `authenticated has DELETE on public.invitations` in the invitations block
  (after the `SELECT` assertion at line ~196). The anon negative
  (`anon has no DELETE on invitations`) already exists at line ~446 from
  migration 0009 — do **not** add a duplicate. Update `plan(83)` → `plan(84)`.
- `db/tests/schema_shape.sql` does not currently assert the existence of
  policies by name (it uses `has_table`, `has_column`, `has_function`). No
  policy count to update there. Do not add a new assertion to `schema_shape.sql`
  unless there is already a policy-existence check pattern to follow; if none
  exists, skip the `schema_shape.sql` change entirely.

**Reference:** `docs/testing.md` — "pgTAP: positive and negative cases for
every new policy." `docs/invites.md` § "RLS and stored procedures" already
documents this carve-out (landed in task 0.1).

**Files:**
- `db/migrations/0011_invitations_delete.sql` (create)
- `db/tests/invitations_delete.sql` (create)
- `db/tests/grants.sql` (modify — add 1 assertion, bump plan count 83 → 84)

**Steps:**
1. RED — Create `db/tests/invitations_delete.sql` with `no_plan()`:
   - Load `\i /db/tests/fixtures/users_alice_bob_carol.sql` and
     `\i /db/tests/fixtures/list_solo_alice.sql`.
   - Scenario A (positive): As Alice (inviter), `DELETE FROM public.invitations
     WHERE id = <invite-id>` succeeds — assert the row is gone.
   - Scenario B (negative): As Bob (invitee on the same row), the delete
     returns no rows (RLS hides the row from Bob's perspective) — assert the
     row still exists after the attempted delete.
   - Scenario C (negative): As Carol (outsider), same result as Bob —
     assert row still exists.
   - Each scenario resets state between runs (DELETE + re-INSERT of the test
     invite, RESET ROLE, set JWT GUC per fixture pattern from
     `db/tests/invitations.sql`).
2. RED — Add the one new `grants.sql` assertion (positive: `authenticated has
   DELETE on public.invitations`) and update `plan(83)` → `plan(84)`. The
   anon negative already exists — do not add a duplicate.
3. RED — Run `./scripts/test-db.sh` and confirm the new test file reports
   failures (policy does not exist yet). The `grants.sql` count change will
   also fail until the migration runs.
4. GREEN — Create `db/migrations/0011_invitations_delete.sql`:
   ```sql
   -- 0011_invitations_delete.sql — inviter self-cancel RLS policy
   CREATE POLICY invitations_delete ON public.invitations
     FOR DELETE USING (created_by = public.uid());

   GRANT DELETE ON public.invitations TO authenticated;
   ```
5. GREEN — Run `./scripts/test-db.sh` and confirm all assertions pass.

**Verify:** `./scripts/test-db.sh` green.

---

## Phase 2 — State: `invitations.svelte.ts` sent shape

### [x] 2.1 Create `invitations.svelte.ts` with sent slice and Vitest

**Created:** 2026-05-28T17:27:36Z
**Completed:** 2026-05-28T18:10:34Z

**Why:** The profile sheet's *Cancel pending invite* row needs to know the
pending invitation id for a given `(listId, userId)` pair (derived from the
caller's sent invitations) and needs a function to cancel it. This module
provides both. Creating the file here (rather than in 0803) lets the
ProfileSheet Vitest tests import a real mock rather than a stub defined inline.

**Prerequisites:** None on the web side. The `invitations_delete` RLS policy
from task 1.1 must exist in the DB for the `cancelInvitation` function to work
at runtime, but Vitest mocks the HTTP layer so it doesn't affect the test.

**Decisions:**
- File path: `web/src/lib/invite/state/invitations.svelte.ts`.
  `invite/` is the per-domain folder for the invite feature
  (`docs/frontend-layout.md` §"Per-domain folders").
- The state object uses `$state`:
  ```ts
  export const invitations = $state<{
    sent: SentEntry[];
  }>({ sent: [] });
  ```
  where `SentEntry = { id: string; listId: string; targetUserId: string | null;
  targetEmail: string | null; createdAt: string }`. Define `SentEntry` inline
  in the same file (no separate `model/` file needed for one type at this
  stage).
- `loadSent()` calls `pgGet<SentEntry[]>('/invitations?created_by=eq.<uid>')`.
- `pendingInviteFor(listId, userId)` scans `invitations.sent` and returns
  the first matching entry's `id` where `entry.listId === listId && entry.targetUserId === userId`.
- `cancelInvitation(id)` calls `pgDelete('/invitations?id=eq.<id>')` then
  filters `invitations.sent` in place.
- The mock at `__mocks__/invitations.svelte.ts` mirrors the pattern in
  `privacy/state/__mocks__/relationships.svelte.ts`: `$state` object with
  empty defaults + `vi.fn()` stubs for every async export.
- 0803 will extend this file by appending `inbox`, `loadInbox`,
  `sendInvitation`, `acceptInvitation`, `declineInvitation`. The mock will
  need to be updated in 0803 as well.

**Files:**
- `web/src/lib/invite/state/invitations.svelte.ts` (create)
- `web/src/lib/invite/state/invitations.test.ts` (create)
- `web/src/lib/invite/state/__mocks__/invitations.svelte.ts` (create)

**Steps:**
1. RED — Create `web/src/lib/invite/state/invitations.test.ts`:
   ```
   vi.mock('$lib/shared/http/postgrest')
   vi.mock('$lib/shared/state/profile.svelte')
   ```
   In `beforeEach`, import the mock module and set `profile.uid` to a test UUID
   (e.g. `'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'`) — same pattern as
   `relationships.test.ts`. This ensures `loadSent` constructs the correct URL.
   Tests:
   - (a) `pendingInviteFor` returns `null` when `invitations.sent` is empty.
   - (b) `pendingInviteFor` returns the matching id when `invitations.sent`
     has an entry with the given `listId` + `targetUserId`.
   - (c) `pendingInviteFor` returns `null` when no entry matches the given pair.
   - (d) `loadSent` calls `pgGet` with the correct URL and populates
     `invitations.sent`.
   - (e) `cancelInvitation` calls `pgDelete` with the correct URL and removes
     the matching entry from `invitations.sent`.
2. RED — Run `pnpm test` and confirm the new test file fails (module doesn't
   exist yet — import error).
3. GREEN — Create `web/src/lib/invite/state/invitations.svelte.ts` per
   Decisions.
4. GREEN — Run `pnpm test` and confirm the new tests pass.
5. Create `web/src/lib/invite/state/__mocks__/invitations.svelte.ts` with
   `$state` defaults and `vi.fn()` stubs for `loadSent`, `pendingInviteFor`,
   and `cancelInvitation`.

**Verify:** `pnpm lint && pnpm check && pnpm test`

---

## Phase 3 — Component: `<ProfileSheet>`

### [x] 3.1 Create `ProfileSheet.svelte` with Vitest coverage for all state variants

**Created:** 2026-05-28T17:27:36Z
**Completed:** 2026-05-28T18:23:56Z

**Notes:**
- The `mockImplementation` override for `resolve` in `beforeEach` was removed: `$app/paths`'s `resolve` has a strict union return type, so `(path: string) => path` fails type-check. The factory mock `vi.fn((path: string) => path)` suffices, and `resolve` wasn't needed as an import in assertions.
- `x-circle` icon not yet in `icon-paths.ts`; used `x` for the cancel-invite row instead (close enough visually).

**Why:** The profile sheet is the central per-user interaction surface for
step 8. Landing it as a stand-alone tested component means 0803 can drop it
into the Members screen, inbox rows, and picker rows without bundling component
design with flow wiring. Vitest covers all state variants (stranger, in-circle,
blocked, with-pending-invite, own-avatar bounce) so the sheet ships verified
even without a live mount point.

**Prerequisites:** Task 2.1 (invitations.svelte.ts module and mock exist).
`$lib/privacy/state/relationships.svelte` mock already exists from 0801.
`$lib/basic/components/Sheet.svelte` and `$lib/shared/components/Avatar.svelte`
exist. `$lib/shared/components/ButtonPair.svelte` exists (used for the Block
confirmation button pair).

**Decisions:**
- The sheet is always `open` when mounted. The caller mounts/unmounts it;
  `open` is hardwired to `true` so the `<Sheet>` component never hides it while
  mounted.
- Own-avatar short-circuit: a `$derived isSelf = userId === profile.uid` drives
  a `$effect` that calls `goto(resolve('/settings'))` + `onclose()` when true.
  This runs synchronously on the first microtask after mount, so no action rows
  or badge are ever rendered for the own-uid case.
- State classification (`isInCircle`, `isBlocked`) is derived from
  `relationships.circle` and `relationships.blocked`. If `relationships` is not
  yet loaded, the sheet renders no rows (avoids a flash of the wrong state).
- Block confirmation is inline state: `let confirmBlockOpen = $state(false)`.
  When `confirmBlockOpen` is true, a `<ButtonPair>` renders using its
  **snippet props** (`left` / `right`) — `ButtonPair` does not take string
  label props. Pass a Cancel `<button>` (sets `confirmBlockOpen = false`) as
  the `left` snippet, and a Block `<button data-test="block-confirm-block">`
  (calls `block(userId)` then `onclose()`) as the `right` snippet. Confirming
  calls `block(userId)` then `onclose()`.
- Action rows are `<button>` elements with card-border styling (per design JSX):
  `border: 1px solid var(--rule); border-radius: 12px; padding: 14px`. Each row
  has a leading icon + label (+ optional subtitle) layout. Icons per row:
  Add to circle → `user-plus`; Remove from circle → `user-check`;
  Block → `slash` (in `var(--ember)`); Unblock → `shield`;
  Cancel pending invite → no icon specified in design (pick a suitable one,
  e.g. `x-circle`). The "Add to your circle" row has a subtitle line:
  `'Lets you accept invites from them'`. Not a shared component — implemented
  inline in ProfileSheet.svelte.
- `data-test` attributes: `profile-sheet` on the outer sheet container,
  `add-to-circle`, `remove-from-circle`, `block`, `unblock`, `cancel-invite`
  on each action button, `state-badge` on the badge element,
  `block-confirm` on the confirmation prompt container.
- The check mark icon for the in-circle badge and the block confirmation use
  design tokens (`var(--sage)`, `var(--ember)`) not hardcoded colours.

**Reference:** `design/cairn-invite-screens.jsx` `ProfileSheet` function for
exact pixel values. `docs/ui.md` §"Profile screen (sheet)" for action table and
block confirmation copy. `docs/ui.md` §"Button order in pairs" — Block is the
committal (right) button in the pair.

**Files:**
- `web/src/lib/profile/components/ProfileSheet.svelte` (create)
- `web/src/lib/profile/components/ProfileSheet.test.ts` (create)

**Steps:**
1. RED — Create `web/src/lib/profile/components/ProfileSheet.test.ts`:
   ```
   vi.mock('$lib/basic/components/Sheet.svelte')
   vi.mock('$lib/shared/components/Avatar.svelte')
   vi.mock('$lib/shared/components/ButtonPair.svelte')
   vi.mock('$lib/shared/state/profile.svelte')
   vi.mock('$lib/privacy/state/relationships.svelte')
   vi.mock('$lib/invite/state/invitations.svelte')
   vi.mock('$app/navigation')
   vi.mock('$app/paths')
   ```
   Test scenarios — set `relationships.loaded = true` before each unless
   stated:
   - **(a) Stranger state.** `circle = []`, `blocked = []`, no
     `pendingInvitationId`. Assert: `add-to-circle` and `block` buttons
     render; `remove-from-circle`, `unblock`, `cancel-invite` absent;
     `state-badge` absent.
   - **(b) In-circle state.** `circle = [{ otherUserId: userId, … }]`.
     Assert: `remove-from-circle` and `block` render; `add-to-circle` absent;
     `state-badge` text is `'IN YOUR CIRCLE'`.
   - **(c) Blocked state.** `blocked = [{ otherUserId: userId, … }]`.
     Assert: `unblock` renders; `add-to-circle`, `remove-from-circle`, `block`
     absent; `state-badge` text is `'BLOCKED'`.
   - **(d) With pending invite.** Stranger state + `pendingInvitationId='inv-1'`.
     Assert: `cancel-invite` button renders alongside `add-to-circle` and `block`.
   - **(e) Own avatar.** Before rendering: import `resolve` from the
     `$app/paths` mock and configure it — `vi.mocked(resolve).mockReturnValue('/settings')`.
     Set `profile.uid = userId`. After `render(...)`, call `await tick()`
     (from `'svelte'`) to flush the `$effect` before asserting.
     Assert: `goto` is called with `'/settings'` and `onclose` prop callback
     is invoked.
   - **(f) Add to circle calls addCircleById.** Stranger state; click
     `add-to-circle`; assert `addCircleById` called with `userId`.
   - **(g) Remove from circle calls removeFromCircle.** In-circle state; click
     `remove-from-circle`; assert `removeFromCircle` called with `userId`.
   - **(h) Unblock calls unblock.** Blocked state; click `unblock`; assert
     `unblock` called with `userId`.
   - **(i) Block: confirm prompt appears on click, calls block on confirm.**
     Stranger state; click `block`; assert `block-confirm` visible; click
     `data-test="block-confirm-block"` button; assert `block` called with
     `userId`.
   - **(j) Cancel invite calls cancelInvitation and closes.** With-pending-invite
     state; click `cancel-invite`; assert `cancelInvitation` called with
     `'inv-1'` and `onclose` prop callback was invoked (R4 requires both).
   - **(k) Relationships not loaded: no action rows.** `relationships.loaded =
     false`; assert `add-to-circle`, `remove-from-circle`, `block`, `unblock`
     all absent.
2. RED — Run `pnpm test` and confirm the new test file fails (component
   doesn't exist yet).
3. GREEN — Create `web/src/lib/profile/components/ProfileSheet.svelte` per
   Decisions and design spec. Wire up all imports, derive relationship state,
   implement the own-avatar `$effect`, render drag handle / avatar / name /
   badge / action rows / block confirmation.
4. GREEN — Run `pnpm test` and confirm all eleven test cases pass.

**Verify:** `pnpm lint && pnpm check && pnpm test`

---

## Phase 4 — Final check

### [ ] 4.1 Full-gauntlet verify on `0802_profile_sheet` branch

**Created:** 2026-05-28T17:27:36Z
**Completed:**

**Why:** Confirms that all three phases compose cleanly — DB migration + web
state + component — before merging back to `0800_invites_circles_ui`.

**Prerequisites:** Tasks 1.1, 2.1, 3.1 all complete and their individual
Verify lines green.

**Decisions:**
- No `--e2e` flag here; Playwright specs are not in scope for 0802.
- After `./scripts/check.sh` is green, merge back:
  `git checkout 0800_invites_circles_ui && git merge --no-ff 0802_profile_sheet`

**Files:** none

**Steps:**
1. On `0802_profile_sheet`, run `./scripts/check.sh`.
2. Confirm green.
3. `git checkout 0800_invites_circles_ui && git merge --no-ff 0802_profile_sheet`.
4. Re-run `./scripts/check.sh` on `0800_invites_circles_ui` and confirm green.

**Verify:** `./scripts/check.sh` green on `0800_invites_circles_ui` after merge.
