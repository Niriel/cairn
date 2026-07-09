# Plan: Invite flow UI (0803)

Sub-plan 3 of the step-8 orchestration. After 0801 (privacy settings + relationships state module) and 0802 (profile sheet + `invitations_delete` RLS), this plan wires the invite loop end-to-end: users can send invites, receive them, accept or decline, and manage list membership.

## Context

After 0801 and 0802 merge into `0800_invites_circles_ui`, the branch carries:

- `web/src/lib/privacy/state/relationships.svelte.ts` — circle, blocked, loadRelationships, addCircleById, block, unblock.
- `web/src/lib/profile/components/ProfileSheet.svelte` — state-driven action sheet.
- `web/src/lib/invite/state/invitations.svelte.ts` — `sent`, `loadSent`, `pendingInviteFor`, `cancelInvitation`.
- `web/src/lib/settings/components/SettingsScreen.svelte` — People section with a non-interactive `<div>` Invites row (placeholder until this plan activates it).

What's missing: the inbox channel on `invitations.svelte.ts`, the `InvitesBanner` component, the Invites inbox screen and route, the invite picker sheet, the Members screen and route, the Manage members / Leave list rows on the overflow, and the Playwright e2e specs.

The `send_invitation`, `accept_invitation`, and `decline_invitation` RPCs landed in step 7 (0702). The `invitations_delete` RLS policy landed in 0802. The DB layer is complete; this plan is web-only.

## Decisions

**Extend the existing module, don't split it.** The `invitations.svelte.ts` module already exists with the `sent` / `pendingInviteFor` surface (0802). Adding the inbox, send, accept, and decline channels to the same file keeps the reactive state co-located — the banner, inbox screen, and picker all read from one place. The alternative (separate `inbox.svelte.ts`) would require callers to subscribe to two modules and keep them in sync after an accept/decline.

**Inviter captured before the RPC.** `accept_invitation` hard-deletes the invitation row inside the same transaction, so the client cannot fetch the inviter after the call returns. `acceptInvitation` reads `{ inviterUid, inviterName }` from the inbox entry _before_ calling the RPC, adds the pair to `postAcceptPrompts`, and returns it for navigation. Both the banner's Accept path and the inbox screen's Accept path drive this through the same function (R2).

**Post-accept prompt in `(app)/+layout.svelte`.** The prompt must appear regardless of which screen the user lands on after accepting (ItemsScreen when navigating into the list). The `(app)/+layout.svelte` is the natural host — it wraps all authenticated routes and currently renders only `{@render children()}`. Adding a `PostAcceptPromptSheet` there keeps the overlay logic out of individual screen components.

**`sendInvitation` error mapping in the state module.** The picker component passes `err.message` directly to the toast; the anti-enumeration contract (typed e-mail never echoed, generic message for unknown failures) is enforced in `sendInvitation`. This means the picker doesn't need to know which errors are carve-outs and which aren't.

**SettingsScreen Invites row swap in the same commit as the route.** `svelte-check`'s typed-routes pass rejects `goto(resolve('/settings/invites'))` until the route file exists. The swap from `<div>` to `<button onclick={() => goto(...)}` must happen in Phase 3 alongside the route creation — not before, not after. The existing tests `(j-4)` and `(j-5)` flip to the new shape in the same commit.

**Manage members row in the same phase as the route it links to.** The typed-routes pass also rejects `goto(resolve('/lists/<id>/members'))` until the route file exists. Phase 5 creates the route and Phase 6 adds the overflow row, so the row's navigation call is always valid when the type checker sees it.

**co-members computed client-side from `lists.items`.** No new DB view or endpoint. The `lists.items` state already carries `list_members` for each list; deduplicating across all lists and filtering against circle members and already-on-this-list members is a handful of `Set` operations. The alternative (a bespoke PostgREST query or a new view) would add a round-trip and a DB migration for a feature that's essentially a client-side join.

**Leave list: client sends only `deleted_at`.** The trigger `tg_set_attribution_list_members` stamps `deleted_by = public.uid()` on soft-delete (per `docs/data-model.md`). The client PATCH body is `{ deleted_at: 'now()' }` only — sending `deleted_by` explicitly would be redundant and would need a GRANT that the client shouldn't have.

**Playwright specs written but not run.** Playwright cannot execute in the current environment. The specs follow the pattern of `items.spec.ts` (unique per-run emails, `.serial` describe blocks, Mailpit magic-link helper). They're written and committed so they're ready for manual verification at deploy time.

## Architecture

### New files

- **`web/src/lib/invite/components/InvitesBanner.svelte`** — banner for the Lists screen (3 states).
- **`web/src/lib/invite/components/__mocks__/InvitesBanner.svelte`** — stub for ListsScreen tests.
- **`web/src/lib/invite/components/PostAcceptPromptSheet.svelte`** — overlay mounted in app layout.
- **`web/src/lib/invite/components/__mocks__/PostAcceptPromptSheet.svelte`** — stub.
- **`web/src/lib/invite/components/InvitesInboxScreen.svelte`** — inbox screen component.
- **`web/src/lib/invite/components/__mocks__/InvitesInboxScreen.svelte`** — stub.
- **`web/src/lib/invite/components/InvitePickerSheet.svelte`** — three-section picker sheet.
- **`web/src/lib/invite/components/__mocks__/InvitePickerSheet.svelte`** — stub.
- **`web/src/routes/(app)/settings/invites/+page.svelte`** — mounts InvitesInboxScreen.
- **`web/src/routes/(app)/lists/[list_id]/members/+page.svelte`** — mounts MembersScreen.
- **`web/src/lib/list/components/MembersScreen.svelte`** — members list with ProfileSheet + picker.
- **`web/src/lib/list/components/__mocks__/MembersScreen.svelte`** — stub.
- **`web/src/routes/(app)/layout.test.ts`** — tests for `(app)/+layout.svelte` post-accept overlay.
- **`web/e2e/invites.spec.ts`** — Playwright invite happy-path spec.
- **`web/e2e/block.spec.ts`** — Playwright block-blocks-invite spec.
- **`web/e2e/privacy.spec.ts`** — Playwright policy-cascade spec.

### Modified files

- **`web/src/lib/invite/state/invitations.svelte.ts`** — adds InboxEntry type, inbox state, loadInbox, sendInvitation, acceptInvitation, declineInvitation, postAcceptPrompts SvelteSet.
- **`web/src/lib/invite/state/__mocks__/invitations.svelte.ts`** — adds stubs for all new exports.
- **`web/src/lib/invite/state/invitations.test.ts`** — adds tests for new functions.
- **`web/src/routes/(app)/+layout.svelte`** — mounts PostAcceptPromptSheet when postAcceptPrompts.size > 0.
- **`web/src/lib/list/components/ListsScreen.svelte`** — mounts InvitesBanner.
- **`web/src/lib/list/components/ListsScreen.test.ts`** — adds banner-state assertions.
- **`web/src/lib/settings/components/SettingsScreen.svelte`** — swaps Invites row div → button, adds count badge.
- **`web/src/lib/settings/components/SettingsScreen.test.ts`** — updates j-4/j-5 assertions.
- **`web/src/lib/list/components/ListOverflowSheet.svelte`** — adds Manage members + Leave list rows (6 total).
- **`web/src/lib/list/components/ListOverflowSheet.test.ts`** — updates row-count and adds new row assertions.
- **`plans/0000_implementation_order.md`** — updates step 8 overflow-rows parenthetical.

### Module dependency graph

```
invitations.svelte.ts (inbox + actions)
  ↑ reads                   ↑ reads
InvitesBanner.svelte    InvitesInboxScreen.svelte   InvitePickerSheet.svelte
  ↓ mounts                  ↓ opens
ListsScreen.svelte      (app)/+layout.svelte        MembersScreen.svelte
                          PostAcceptPromptSheet           ↑ opens
                                                  ListOverflowSheet.svelte
                                                    (Manage members row)
```

## Phase structure

1. **Phase 1 — invitations state module (inbox + actions).** Extends the existing `invitations.svelte.ts` with `InboxEntry`, `inbox`, `loadInbox`, `sendInvitation`, `acceptInvitation`, `declineInvitation`, and `postAcceptPrompts`. Updates mock and Vitest tests. RED-before-GREEN.

2. **Phase 2 — InvitesBanner + post-accept prompt + ListsScreen wiring.** Creates `InvitesBanner.svelte` and `PostAcceptPromptSheet.svelte`. Wires the banner into `ListsScreen.svelte` and the prompt into `(app)/+layout.svelte`. Adds `(app)/layout.test.ts`. Updates `ListsScreen.test.ts`. Vitest for InvitesBanner and PostAcceptPromptSheet. RED-before-GREEN.

3. **Phase 3 — /settings/invites route + InvitesInboxScreen + SettingsScreen swap.** Creates the route file, `InvitesInboxScreen.svelte`, and simultaneously swaps the Settings Invites row from `<div>` to `<button>` (typed-routes coupling). Updates `SettingsScreen.test.ts`. Vitest for InvitesInboxScreen. RED-before-GREEN.

4. **Phase 4 — InvitePickerSheet.** Creates `InvitePickerSheet.svelte` with circle / co-members / by-email sections. Vitest. RED-before-GREEN. No route coupling yet (the Members screen that opens it lands next).

5. **Phase 5 — /lists/[list_id]/members route + MembersScreen.** Creates the route file and `MembersScreen.svelte`. Wires in `ProfileSheet` and `InvitePickerSheet`. Vitest for MembersScreen. RED-before-GREEN.

6. **Phase 6 — ListOverflowSheet extensions.** Adds Manage members (navigates to members route created in Phase 5) and Leave list rows. Updates `ListOverflowSheet.test.ts`. RED-before-GREEN.

7. **Phase 7 — Playwright e2e specs.** Writes `invites.spec.ts`, `block.spec.ts`, `privacy.spec.ts`. No run in this environment — committed as written, reported as unrunnable.

8. **Phase 8 — 0000_implementation_order.md update.** Edits the step 8 overflow parenthetical to list all six rows.

## Reference docs and skills

- **`docs/invites.md`** — RPC signatures, anti-enumeration posture, invite policy semantics.
- **`docs/ui.md`** — TopBar styling, button-pair order, empty-state dashed-card pattern.
- **`docs/circles.md`** — circle model semantics (one-directional, invisible to other side).
- **`docs/data-model.md`** — `list_members` trigger (tg_set_attribution_list_members stamps deleted_by automatically), `lists.created_by` vs `list_members.created_by` distinction.
- **`docs/testing.md`** — Vitest component test patterns; Playwright spec structure.
- **`docs/frontend-layout.md`** — lib tier rules, mock placement, filename conventions.
- **`design/cairn-invite-screens.jsx`** — visual spec for InboxBanner, InvitesInboxScreen, InvitePickerScreen, SettingsScreenV2_LEGACY.
- **`design/cairn-screens.jsx`** — MembersScreen reference (lines ~1035–1060).
- **`.claude/skills/writing-tasks.md`** — toolchain-coupling escape patterns (typed-routes).
