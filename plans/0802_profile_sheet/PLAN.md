# Plan: Profile sheet + cancel-invite RLS

Sub-step 0802 of the step-8 invite/circles UI. Ships the `invitations_delete`
RLS policy, the sent-invites slice of `invitations.svelte.ts`, and the
`<ProfileSheet>` component. All three are prerequisites for 0803's Members
screen and invite flow.

## Context

Task 1.1 of the parent plan (0801) shipped `relationships.svelte.ts` with
`circle`, `blocked`, `addCircleById`, `removeFromCircle`, `block`, and
`unblock`. The profile sheet needs these to compute its action-row set and
to dispatch mutations.

Two gaps remain before the sheet can be wired into a real screen:

1. **DB gap.** Migration 0009 closed direct `INSERT`/`DELETE` on `invitations`
   to application code — the `invitations_select` policy lets callers read
   their own rows but there is no `FOR DELETE` policy and no `DELETE` grant.
   The sheet's *Cancel pending invite* action needs both.

2. **State gap.** The `invitations.svelte.ts` module doesn't exist yet. The
   sheet needs to know which pending invitation id corresponds to a given
   `(listId, userId)` pair, and it needs a `cancelInvitation` action.

3. **Component gap.** No shared `<ProfileSheet>` component exists. The Members
   screen (0803) and inbox rows (0803) both need it; landing it here means
   0803 can import a tested primitive rather than building sheet design and flow
   wiring together.

## Decisions

**No live consumer in 0802.** The sheet ships with Vitest coverage only.
Earlier drafts considered wiring the sheet into the Lists-overview member-avatar
stack to avoid dead code. On reflection, those 16 px overlapping avatars are a
poor touch target and conflict with the list row's primary tap target (navigate
into the list). The Members screen (0803) is the natural consumer. A sheet that
is fully tested but not yet mounted in any route is less risky than one bundled
with flow wiring.

**`cancelInvitation` lands in 0802 alongside `loadSent`.** The function is a
simple direct `DELETE /invitations?id=eq.<id>` — it belongs next to the
`sent` collection it mutates. Splitting it into 0803 would require the
ProfileSheet's Vitest tests to mock an import that doesn't exist yet, or to
stub the cancel path with a no-op. Landing it here keeps the module's first
version internally consistent.

**Block uses the existing `block()` function from `relationships.svelte.ts`.**
That function already issues `POST /relationships` with
`Prefer: resolution=merge-duplicates`. The exploration in the parent task's
Decisions confirmed this works correctly under the `relationships_update`
policy. No further investigation needed; ProfileSheet simply imports and calls
it.

**Own-avatar short-circuit lives inside ProfileSheet, not in callers.** The
parent task says the short-circuit happens "in the tap handler before opening
the sheet," but placing the guard inside the component (as a `$derived` that
triggers `goto` + `onclose` on mount if `userId === profile.uid`) centralises
the invariant and makes it testable in `ProfileSheet.test.ts` without a
separate wrapper. Callers still have the option of short-circuiting before
mounting for a marginally faster UX (avoid mounting at all), but are not
required to.

**`invitations.svelte.ts` is introduced here, extended in 0803.** The file
lives at `web/src/lib/invite/state/invitations.svelte.ts` and starts with
four exports: `invitations` state object, `loadSent`, `pendingInviteFor`, and
`cancelInvitation`. 0803 extends the same file with the inbox side. The mock
at `__mocks__/invitations.svelte.ts` covers both sides so 0803's tests can
import it unchanged.

**`profile/` is a new per-domain folder.** Per `docs/frontend-layout.md`, per-
domain folders under `web/src/lib/` each own one slice of the product. The
profile sheet is cross-domain — it is opened from the Members screen (list
domain), the inbox (invite domain), and anywhere a user avatar appears.
Placing it in `profile/` rather than `list/`, `invite/`, or `shared/` keeps
the tier rule clean: it does not belong in `basic/` (it has Cairn-specific
knowledge), it does not belong in `shared/` (it is too feature-specific), and
it does not belong in any one domain folder (multiple domains need it). A new
`profile/` per-domain folder is the correct answer. Phase 0 adds it to
`docs/frontend-layout.md`'s example list (along with correcting `invites/` →
`invite/` in the same line).

## Architecture

### New files

- **`db/migrations/0011_invitations_delete.sql`** — `CREATE POLICY
  invitations_delete` + `GRANT DELETE ON invitations TO authenticated`.
- **`db/tests/invitations_delete.sql`** — pgTAP for the new policy: positive
  (inviter can delete own row) and negative (invitee and outsider cannot).
- **`web/src/lib/invite/state/invitations.svelte.ts`** — sent-invites slice:
  `invitations` state, `loadSent`, `pendingInviteFor`, `cancelInvitation`.
- **`web/src/lib/invite/state/invitations.test.ts`** — Vitest for the sent
  slice.
- **`web/src/lib/invite/state/__mocks__/invitations.svelte.ts`** — vi.fn()
  stubs for all four exports.
- **`web/src/lib/profile/components/ProfileSheet.svelte`** — the sheet
  component (five state variants, block confirmation inline).
- **`web/src/lib/profile/components/ProfileSheet.test.ts`** — Vitest for all
  five state variants plus action assertions.

### Modified files

- **`db/tests/grants.sql`** — add one assertion (authenticated has DELETE on
  invitations) and update `plan(N)` count. (The anon-no-DELETE assertion
  already exists from migration 0009; do not add a duplicate.)

### Module dependency graph

```
ProfileSheet.svelte
  ├─ $lib/basic/components/Sheet.svelte
  ├─ $lib/shared/components/Avatar.svelte
  ├─ $lib/shared/components/ButtonPair.svelte  (block confirm)
  ├─ $lib/shared/state/profile.svelte          (own-uid check)
  ├─ $lib/privacy/state/relationships.svelte   (circle/blocked, add/remove/block/unblock)
  └─ $lib/invite/state/invitations.svelte      (cancelInvitation)
```

## Phase structure

0. **Phase 0 — Doc reconciliation.** Add `profile/` and correct `invites/` →
   `invite/` in `docs/frontend-layout.md`'s per-domain folder example list.
   Applied during `/concerns` review before Phase 1 executes (task 0.1 already
   done).

1. **Phase 1 — DB migration + pgTAP.** Write `0011_invitations_delete.sql`
   and `db/tests/invitations_delete.sql` (TDD: test file red, then migration
   green). Also bump the plan counts in `grants.sql` and `schema_shape.sql`
   so the existing assertions continue to pass. Verify with
   `./scripts/test-db.sh`.

2. **Phase 2 — `invitations.svelte.ts` sent shape.** Create the module and
   its Vitest tests (TDD: tests red, then implementation green). Also create
   the mock. Verify with `pnpm lint && pnpm check && pnpm test`.

3. **Phase 3 — `<ProfileSheet>` component.** Create the component and its
   Vitest tests (TDD: tests red, then component green). Five test scenarios:
   stranger, in-circle, blocked, with-pending-invite, own-avatar bounce.
   Verify with `pnpm lint && pnpm check && pnpm test`.

All three phases must pass `./scripts/check.sh` at the end.

## Reference docs and skills

- **`docs/ui.md`** — Profile screen (sheet) section: action-row table, block
  confirmation copy, own-avatar bounce behaviour.
- **`docs/invites.md`** — "RLS and stored procedures" section: invitations_delete
  carve-out, anti-enumeration posture.
- **`docs/data-model.md`** — "What the app sees": `DELETE /invitations` endpoint.
- **`docs/frontend-layout.md`** — per-domain folder rules, `profile/` placement.
- **`docs/testing.md`** — three test layers; positive + negative RLS cases.
- **`design/cairn-invite-screens.jsx`** — `ProfileSheet` function: drag handle
  dimensions, avatar size, badge colours, action row layout.
