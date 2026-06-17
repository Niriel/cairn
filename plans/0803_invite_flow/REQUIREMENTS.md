# Requirements: Invite flow UI (0803)

Sub-plan 3 of the step-8 orchestration (`0800_invites_circles_ui`). Completes the invite loop: the `invitations.svelte.ts` state module, the InvitesBanner on the Lists screen, the Invites inbox, the invite picker sheet, the Members screen, and two new overflow rows (Manage members, Leave list). Also ships the three Playwright e2e specs for the invite/block/privacy flows. Tasks 1.1 and 2.1 of `0800_invites_circles_ui` must already be merged — this plan depends on `relationships.svelte.ts` (0801) and `<ProfileSheet>` (0802).

## R1. Invitations state module — inbox channel

Extend `web/src/lib/invite/state/invitations.svelte.ts` (which already carries `sent`, `loadSent`, `pendingInviteFor`, and `cancelInvitation` from 0802) with the inbox channel. New exports:

- `InboxEntry` type: `{ id: string; listId: string; listName: string; inviterUid: string; inviterName: string; inviterAvatarVersion: number; createdAt: string }`.
- `invitations.inbox: InboxEntry[]` — reactive array of pending invitations targeting the current user.
- `loadInbox(): Promise<void>` — fetches `GET /invitations?target_user_id=eq.<me>&select=id,list_id,created_by,created_at,lists(name),profiles!created_by(display_name,avatar_version)` and maps the rows into `InboxEntry` objects.

The module already exists; this task _adds_ to it without touching the `sent` surface.

## R2. Invitations state module — send/accept/decline/prompt

Add the remaining actions to `invitations.svelte.ts`:

- `sendInvitation(listId: string, opts: { userId: string } | { email: string }): Promise<void>` — calls `POST /rpc/send_invitation` with `p_list_id` and either `p_user_id` or `p_email`. Maps `ApiError` raises:
  - `err.code === 'P0001' && err.message === 'self-invite'` → rethrows `Error("You can't invite yourself.")`.
  - `err.code === 'P0001' && err.message === 'already a member'` → rethrows `Error("They're already on this list.")`.
  - Any other error, or a `null` return from the RPC (the documented silent-decline signal — see `docs/invites.md` `send_invitation` sketch) → rethrows `Error("Couldn't send invite")`.
    The typed e-mail is never included in any error string.

- `acceptInvitation(id: string): Promise<{ inviterUid: string; inviterName: string; listId: string }>` — reads the inbox entry _before_ calling the RPC (so the inviter identity and list ID are available after the hard-delete), calls `POST /rpc/accept_invitation { p_invitation_id: id }`, removes the entry from `invitations.inbox`, adds `{ inviterUid, inviterName }` to `invitations.postAcceptPrompts`, and returns `{ inviterUid, inviterName, listId }` so the caller can navigate to the list and the layout can show the post-accept prompt.

- `declineInvitation(id: string): Promise<void>` — calls `POST /rpc/decline_invitation { p_invitation_id: id }` and removes the entry from `invitations.inbox`.

- `invitations.postAcceptPrompts: SvelteSet<{ inviterUid: string; inviterName: string }>` — session-scoped set of pending post-accept circle prompts. Cleared entry by entry as the user dismisses or acts on each. Survives navigation (app-lifetime state); resets only on sign-out or hard reload.

The mock at `web/src/lib/invite/state/__mocks__/invitations.svelte.ts` is updated to expose all new exports as `vi.fn()` stubs.

## R3. InvitesBanner component

`web/src/lib/invite/components/InvitesBanner.svelte` — three states driven by `invitations.inbox.length`:

- **0 pending:** component renders nothing (no DOM output).
- **1 pending:** card with avatar (28 px), "_{InviterName}_ invited you to _{ListName}_" copy, and a pill-button pair — "Decline" (left, stone border) and "Accept" (right, sage fill). Decline calls `declineInvitation(id)`. Accept calls `acceptInvitation(id)` then navigates to the list. Inviter identity is captured inside `acceptInvitation` before the RPC (R2); the banner's Accept handler uses the returned `{ inviterUid, inviterName }` only to navigate (`goto(resolve('/lists/<listId>'))`) — post-accept prompt display is handled by the layout (R5).
- **2+ pending:** collapsed row with a filled ink-bg count badge, "{N} pending invites", and a chevron-right; tapping navigates to `/settings/invites`.

Design reference: `design/cairn-invite-screens.jsx` `InboxBanner`. A `__mocks__/InvitesBanner.svelte` stub lives at the same level.

## R4. InvitesBanner wired into ListsScreen

`web/src/lib/list/components/ListsScreen.svelte` mounts `<InvitesBanner>` between the AppTopBar and the list rows (or empty state). The component subscribes to `invitations.inbox` reactively. `ListsScreen.test.ts` is updated in the same commit: assert the three banner states (not rendered at 0 pending; single-pending row with Decline/Accept; 2+ collapsed row with chevron), and that accepting from the single-invite banner calls `acceptInvitation` and navigates to the list.

## R5. Post-accept circle prompt overlay

`web/src/lib/invite/components/PostAcceptPromptSheet.svelte` — bottom sheet rendered by `web/src/routes/(app)/+layout.svelte` whenever `invitations.postAcceptPrompts.size > 0`. Shows the first prompt in the set: copy _"You accepted {Name}'s invite. Add {Name} to your circle?"_, left button "Not now", right button "Add to circle". "Not now" removes the entry from the set. "Add to circle" calls `addCircleById(inviterUid)` then removes the entry. After removal the layout re-checks the set — if another prompt is waiting it shows immediately; if the set is empty the sheet unmounts.

A `__mocks__/PostAcceptPromptSheet.svelte` stub is added alongside. The `(app)/+layout.svelte` test at `web/src/routes/(app)/layout.test.ts` asserts: prompt is not rendered when `postAcceptPrompts` is empty; prompt renders with correct copy when one entry is in the set; "Not now" removes the entry; "Add to circle" calls `addCircleById` and removes the entry.

## R6. /settings/invites route + InvitesInboxScreen

Route at `web/src/routes/(app)/settings/invites/+page.svelte` mounts `<InvitesInboxScreen>`.

`web/src/lib/invite/components/InvitesInboxScreen.svelte` — TopBar title "Invites" with subtitle "{N} pending". Intro paragraph: _"People who've invited you to their lists. Accept to join, or decline to clear."_ Per-row layout: avatar (36 px), inviter name + "invited you to" grey label, list name bold below, timestamp (monospace, `timeAgo`), Decline / Accept pill buttons. Accept follows the same inviter-capture sequence as the banner (R3); navigates to the list after accepting. Decline calls `declineInvitation`.

Design reference: `design/cairn-invite-screens.jsx` `InvitesInboxScreen`. A `__mocks__/InvitesInboxScreen.svelte` stub is added.

Vitest asserts: intro paragraph text; per-row inviter name and list name; Decline calls `declineInvitation`; Accept calls `acceptInvitation` and navigates to the list.

## R7. SettingsScreen Invites row — activation and count badge

The non-interactive `<div data-test="settings-invites">` scaffolded by 0801 is replaced with a real `<button class="nav-row">` (styled identically) **in the same commit** that ships the `/settings/invites/+page.svelte` route, so `svelte-check`'s typed-routes pass never sees an invalid `href`. The row now shows:

- Sub-line: _"{N} pending"_ when `invitations.inbox.length > 0`; _"No pending invites"_ when zero.
- A count badge (a small number to the right of the nav-row-text, monospace) when inbox is non-zero. Design reference: `design/cairn-screens.jsx` `SettingsScreen` (canonical, line 1084+) — note that `SettingsScreenV2_LEGACY` in `cairn-invite-screens.jsx` is deprecated.
- Clicking navigates to `/settings/invites`.

`SettingsScreen.test.ts` is updated in the same commit: replace tests `(j-4)` ("Invites row is a `<div>`") and `(j-5)` ("no chevron-right") with:

- `(j-4)` Invites row is a `<button>` navigating to `/settings/invites` when inbox is non-empty.
- `(j-5)` Invites row shows _"{N} pending"_ sub-line when `invitations.inbox.length` is non-zero.
- `(j-6′)` Invites row shows _"No pending invites"_ sub-line when inbox is empty.

The existing tests `(j-1)` through `(j-3)` and `(j-6)` onwards that remain valid stay unchanged; only the tag-type and chevron assertions flip to the new shape.

## R8. InvitePickerSheet

`web/src/lib/invite/components/InvitePickerSheet.svelte` — bottom sheet that opens when the user taps "Add member" from the Members screen (R9). Props: `listId: string`, `onclose: () => void`.

Sections (in order):

1. **Your circle** — members from `relationships.circle` who are not already on this list. Each row: 32 px avatar, display name, "In your circle" sub-line, "Invite" button. Tapping calls `sendInvitation(listId, { userId: m.otherUserId })`. On success: per-row check mark + _"Invite sent"_ toast. On error: toast with `err.message` (which is one of the three carve-out strings from R2, or "Couldn't send invite").
2. **People you share other lists with** — co-members computed client-side from `lists.items` (deduplicated union of all `list_members.user_id` across all lists), excluding: current user, circle members, and already-members of the target list. "On {N} of your other lists" sub-line. Same invite/success/error behaviour.
3. **By e-mail** (sticky bottom panel) — mail icon, italic placeholder, "Send" button. On submit: calls `sendInvitation(listId, { email: typedEmail })`, never echoes the typed address in any error, clears the field on success.

The "already-members of the target list" set is fetched on mount: `GET /list_members?list_id=eq.{listId}&deleted_at=is.null&select=user_id`.

Empty sections are omitted (no section label or rows if the section would be empty). A `__mocks__/InvitePickerSheet.svelte` stub is added.

Vitest: circle-section rows render; co-members section excludes circle members; tapping Invite in circle section calls `sendInvitation`; by-email Send calls `sendInvitation` with `{ email }`.

## R9. /lists/[list_id]/members route + MembersScreen

Route at `web/src/routes/(app)/lists/[list_id]/members/+page.svelte` reads `list_id` from params and passes it to `<MembersScreen>`.

`web/src/lib/list/components/MembersScreen.svelte` — props: `listId: string`. TopBar title "Members" with list name as subtitle. Fetches on mount:

```
GET /list_members?list_id=eq.{listId}&deleted_at=is.null
  &select=user_id,created_at,lists(created_by,name),profiles!user_id(display_name,avatar_version)
```

Section label: _"{N} people on this list"_. Per-member row: 32 px avatar, display name, sub-line determined by `lists.created_by`:

- `lists.created_by === profile.uid && member.user_id === profile.uid` → _"You · created the list"_
- `lists.created_by !== profile.uid && member.user_id === profile.uid` → _"Joined {timeAgo(created_at)}"_
- `lists.created_by === member.user_id` → _"Created the list"_
- everyone else → _"Joined {timeAgo(created_at)}"_

Tapping a non-self row opens `<ProfileSheet>` with `pendingInvitationId={pendingInviteFor(listId, member.user_id)}`. Bottom button _"Add member"_ opens `<InvitePickerSheet listId={listId}>`.

The `lists.created_by` discriminator (not `list_members.created_by`) is the canonical rule — `list_members.created_by` is always the attribution-trigger value (the inviter), never the member. A mock stub at `__mocks__/MembersScreen.svelte` is added.

Vitest: section label shows count; sub-line "You · created the list" for the creator; "Joined …" for non-creator members; tapping a non-self row opens ProfileSheet; "Add member" button opens InvitePickerSheet.

## R10. ListOverflowSheet extensions

`web/src/lib/list/components/ListOverflowSheet.svelte` gains two rows, making six total in this order:

1. Rename list (existing)
2. Edit description (existing)
3. **Manage members** (new) — `data-test="list-overflow-manage-members"`, navigates to `/lists/{listId}/members` via `goto(resolve('/lists/<listId>/members'))`.
4. View bin (existing)
5. **Leave list** (new) — `data-test="list-overflow-leave"`, opens an inline confirmation block ("Leave _{listName}_? You'll have to be re-invited to rejoin." — left "Cancel", right "Leave"). On confirm: `PATCH /list_members?list_id=eq.{listId}&user_id=eq.{me}` with body `{ deleted_at: new Date().toISOString() }` (the trigger `tg_set_attribution_list_members` stamps `deleted_by` automatically; the client does not send it), then `goto(resolve('/lists'))` and `onclose()`.
6. Delete list (existing)

`ListOverflowSheet.test.ts` is updated in the same commit: replace the existing row-count assertion with six rows in the documented order; add assertions for Manage members navigating and Leave list confirmation flow.

## R11. Playwright e2e specs

Three specs under `web/e2e/`, each using unique per-run emails so they can run in parallel:

- **`invites.spec.ts`** — Alice signs in, creates a list, opens the picker, sends invite to Bob by e-mail; Bob signs in, sees InvitesBanner (single-pending), accepts; lands on the list; post-accept prompt appears offering to add Alice to circle; Bob taps "Add to circle"; navigates back to Lists; banner is gone.
- **`block.spec.ts`** — Alice and Bob share a list; Alice opens Bob's ProfileSheet from the Members screen; taps Block, confirms; Bob signs in, opens the picker on another list, tries to invite Alice — generic "Couldn't send invite" toast appears.
- **`privacy.spec.ts`** — Alice signs in, has a pending invite from Bob (seeded); changes policy to "Nobody" in Privacy screen; inbox count drops to 0 immediately (cascade trigger fires); banner disappears; Invites row in Settings shows "No pending invites".

Playwright can't run in this environment. The spec files are written and committed; their runability is reported as untested per project convention.

## R12. plans/0000_implementation_order.md parenthetical update

Update the step 8 parenthetical in `plans/0000_implementation_order.md` to list all six overflow rows in their shipped order: "Rename / Edit description / Manage members / View bin / Leave list / Delete list". The box remains `[ ]` (it flips to `[x]` in task 4.1 of `0800_invites_circles_ui` after this sub-plan is merged).

## Non-requirements (explicitly excluded)

- **Showing the inviter's e-mail in any UI string** — anti-enumeration posture; the invite picker accepts an e-mail as input but never echoes it in error or success copy.
- **"Added by {name}" sub-line on MembersScreen** — the schema does not preserve the inviter-of-record on `list_members`; the trigger stamps `list_members.created_by = public.uid()` (the invitee at accept time, not the inviter). The design canvas shows "Added by Alice" but the task spec supersedes it with the `lists.created_by` rule.
- **Widening `accept_invitation` to record the inviter** — would require a schema change and a migration; deferred post-v1. Recorded in task 3.1 of `0800_invites_circles_ui` as an explicit Non-requirement.
- **Running Playwright specs in CI before merge** — Playwright cannot run in this environment. Specs are written and reviewed; green runs are verified manually by the operator at deploy time (step 14).
- **Real-time inbox push** — inbox is fetched on mount and after each action; no WebSocket or PostgREST LISTEN/NOTIFY subscription in v1.
- **Picker showing users with no display name** — tombstoned users are excluded by the existing `profiles` view; no special handling needed here.
