# Tasks

## Reference skills and docs

- **`docs/invites.md`** — RPC signatures, anti-enumeration contract, policy semantics.
- **`docs/ui.md`** — TopBar styling, button-pair order, empty-state patterns.
- **`docs/data-model.md`** — `lists.created_by` vs `list_members.created_by` distinction; trigger stamps `deleted_by` on soft-delete.
- **`docs/frontend-layout.md`** — lib tier rules (`invite/` domain), mock placement, route-test `+` filename rule.
- **`docs/testing.md`** — Vitest patterns, Playwright spec structure.
- **`design/cairn-invite-screens.jsx`** — visual spec for InboxBanner, InvitesInboxScreen, InvitePickerScreen.
- **`design/cairn-screens.jsx`** — MembersScreen reference (~lines 1035–1060).
- **`.claude/skills/writing-tasks.md`** — typed-routes toolchain-coupling escape.

---

## Phase 1 — Invitations state module (inbox + actions)

### [x] 1.1 Extend invitations.svelte.ts with inbox channel and action functions

**Created:** 2026-05-28T18:50:57Z
**Completed:** 2026-05-28T19:41:22Z

**Why:** The `invitations.svelte.ts` module (introduced in 0802) currently carries only the `sent` / `pendingInviteFor` / `cancelInvitation` surface. Every screen in this plan — banner, inbox, picker — needs the inbox channel and the send/accept/decline actions. Landing them first means later tasks can import a tested, stable API.

**Prerequisites:** `web/src/lib/invite/state/invitations.svelte.ts` exists from 0802 with `sent`, `loadSent`, `pendingInviteFor`, `cancelInvitation`. `web/src/lib/invite/state/__mocks__/invitations.svelte.ts` exists. `web/src/lib/shared/http/postgrest.ts` exports `pgGet`, `pgPost`, `ApiError`. `web/src/lib/shared/state/profile.svelte` exports `profile.uid`. `web/src/lib/privacy/state/relationships.svelte.ts` exports `addCircleById` (needed by postAcceptPrompts consumers — not by the module itself, but the mock must expose it so component tests can verify "Add to circle" calls it).

**Decisions:**
- **`InboxEntry` type:** `{ id: string; listId: string; listName: string; inviterUid: string; inviterName: string; inviterAvatarVersion: number; createdAt: string }`. Exported so component tests can construct fixtures.
- **`loadInbox` URL:** `GET /invitations?target_user_id=eq.${me}&select=id,list_id,created_by,created_at,lists(name),profiles!created_by(display_name,avatar_version)`. The `profiles!created_by` hint disambiguates the FK from `invitations.created_by` to `profiles`.
- **`acceptInvitation(id)` shape:** reads the inbox entry *before* calling the RPC so the inviter identity and list ID survive the hard-delete. Calls `POST /rpc/accept_invitation { p_invitation_id: id }`. On RPC failure, rethrows with a generic `Error("Couldn't accept invite")` — callers should show a toast. Removes the entry from `invitations.inbox`. Adds `{ inviterUid, inviterName }` to `invitations.postAcceptPrompts`. Returns `{ inviterUid, inviterName, listId }` so the caller can navigate.
- **`sendInvitation` error mapping:** catches `ApiError`; maps `(code 'P0001', message 'self-invite')` → rethrows `Error("You can't invite yourself.")`; maps `(code 'P0001', message 'already a member')` → rethrows `Error("They're already on this list.")`; all other errors, or a `null` return from the RPC (the documented silent-decline signal when block/policy checks fail — see `docs/invites.md` `send_invitation` sketch; this is the normal path, not an unexpected state) → rethrows `Error("Couldn't send invite")`. Typed e-mail never in any error string.
- **`postAcceptPrompts`:** `SvelteSet<{ inviterUid: string; inviterName: string }>` exported as part of the top-level `invitations` state object. `SvelteSet` is imported from `svelte/reactivity`. Its entries are removed one-by-one as the user dismisses or acts.
- **Mock update:** the `__mocks__/invitations.svelte.ts` gains stub entries for every new export — `inbox: InboxEntry[]` on the state object, `loadInbox = vi.fn()`, `sendInvitation = vi.fn()`, `acceptInvitation = vi.fn()`, `declineInvitation = vi.fn()`, `postAcceptPrompts` as a `SvelteSet`.

**Files:**
- `web/src/lib/invite/state/invitations.svelte.ts` (modify)
- `web/src/lib/invite/state/__mocks__/invitations.svelte.ts` (modify)
- `web/src/lib/invite/state/invitations.test.ts` (modify — add tests for new functions)

**Steps:**
1. RED — In `invitations.test.ts`, add `describe` blocks for:
   - `loadInbox`: calls `pgGet` with the correct URL, populates `invitations.inbox` with mapped `InboxEntry` objects (test one row, check all five fields).
   - `acceptInvitation`: reads inviter from inbox before RPC, calls `pgPost('/rpc/accept_invitation', { p_invitation_id: id })`, removes entry from inbox, adds entry to `postAcceptPrompts`, returns `{ inviterUid, inviterName, listId }`.
   - `declineInvitation`: calls `pgPost('/rpc/decline_invitation', { p_invitation_id: id })`, removes entry from inbox.
   - `sendInvitation` with `{ userId }`: calls `pgPost('/rpc/send_invitation', { p_list_id, p_user_id })`.
   - `sendInvitation` with `{ email }`: calls `pgPost` with `p_email`.
   - `sendInvitation` error mapping: `P0001 / self-invite` → `"You can't invite yourself."`; `P0001 / already a member` → `"They're already on this list."`; other ApiError or null return → `"Couldn't send invite"`.
   - `acceptInvitation` error path: when RPC throws, rethrows with `Error("Couldn't accept invite")` without modifying inbox or `postAcceptPrompts`.
   Run `cd web && pnpm test -- invitations` and confirm all new tests fail (functions don't exist yet).
2. GREEN — In `invitations.svelte.ts`:
   - Import `SvelteSet` from `svelte/reactivity`.
   - Add `InboxEntry` type export.
   - Extend the `invitations` state object with `inbox: InboxEntry[]` (initial `[]`) and `postAcceptPrompts: SvelteSet<{ inviterUid: string; inviterName: string }>` (initial `new SvelteSet()`).
   - Add `loadInbox`, `acceptInvitation`, `declineInvitation`, `sendInvitation` function exports per Decisions above.
3. GREEN — Update `__mocks__/invitations.svelte.ts` with all new exports (stubs).
4. GREEN — Re-run `cd web && pnpm test -- invitations` and confirm green.

**Verify:** `cd web && pnpm test -- invitations` · `pnpm check`

---

## Phase 2 — InvitesBanner + post-accept prompt + ListsScreen wiring

### [ ] 2.1 Create InvitesBanner and wire into ListsScreen

**Created:** 2026-05-28T18:50:57Z
**Completed:**

**Why:** The ListsScreen needs a banner that shows pending invites. Three states driven by `invitations.inbox.length`: nothing (0), single-invite card with Decline/Accept (1), collapsed count-row with chevron (2+). Landing the component and wiring first gives the inbox and picker screens a visible entry point to test against.

**Prerequisites:** Task 1.1 complete — `invitations.inbox`, `acceptInvitation`, `declineInvitation` all exported and mocked.

**Decisions:**
- **Component location:** `web/src/lib/invite/components/InvitesBanner.svelte`. The `invite/` domain now has components; create the `components/` and `__mocks__/` directories if they don't exist.
- **Props:** none — the component reads directly from `invitations.inbox` (reactive) and calls `loadInbox()` on mount so the inbox is populated when the ListsScreen first renders. Use `$effect(() => { void loadInbox(); })` in the component script.
- **Single-invite state (design ref: `InboxBanner` with `count === 1`):**
  - Container: `margin: 8px 18px 14px`, `padding: 14px`, `background: var(--paper-alt)`, `border: 1px solid var(--rule)`, `border-radius: 12px`.
  - Inner row: 28 px `<Avatar>`, copy "*{inviterName}* invited you to *{listName}*" (inviterName in bold, "invited you to" in `var(--stone)`, listName in bold).
  - Button pair below: "Decline" (flex 1, border `var(--rule)`, `var(--stone)` text) | "Accept" (flex 1, `var(--sage)` background, white text).
  - Decline: calls `declineInvitation(entry.id)`.
  - Accept: calls `acceptInvitation(entry.id)` → on resolve, `goto(resolve('/lists/<listId>'))`. The post-accept prompt is shown by the layout (R5), not here.
- **Multi-invite state (design ref: `InboxBanner` with `count > 1`):**
  - Same container styling. Ink-bg circle badge with count (`width: 32px; height: 32px; border-radius: 99px; background: var(--ink); color: var(--paper); font-size: 12px; font-weight: 700`), "{N} pending invites" text, `chevron-right` icon. Whole row is a `<button>` navigating to `/settings/invites`.
  - **Typed-routes escape:** `/settings/invites` route does not exist until Phase 3. Use `goto('/settings/invites')` (bare string, no `resolve()`) in this task to avoid the TypeScript typed-routes error. The bare string is blocked by the `svelte/no-navigation-without-resolve` ESLint rule, so add `// eslint-disable-next-line svelte/no-navigation-without-resolve` on the line immediately before the `goto('/settings/invites')` call. Add `// TODO task 3.1: remove disable, upgrade to goto(resolve('/settings/invites'))` on the same line as the `goto`. Task 3.1 removes the disable comment and upgrades to `goto(resolve('/settings/invites'))` in the same commit that creates the route.
- **`data-test` attributes:** `invites-banner` on the root container; `invites-banner-decline`, `invites-banner-accept` on the buttons; `invites-banner-multi` on the collapsed row.
- **Mock stub:** `web/src/lib/invite/components/__mocks__/InvitesBanner.svelte` renders `<div data-test="invites-banner-stub"></div>`.
- **ListsScreen wiring:** import `InvitesBanner` and render it between the AppTopBar and the list content (before the `{#if lists.loading}` block). Mock it in `ListsScreen.test.ts`.
- **ListsScreen.test.ts updates:** mock `$lib/invite/components/InvitesBanner.svelte` (stub renders `invites-banner-stub`). Add tests:
  - Banner stub is present in the DOM (confirms import and mount).
  - No test for banner state transitions in ListsScreen.test.ts — that's InvitesBanner.test.ts's job; ListsScreen just asserts the stub is mounted.

**Files:**
- `web/src/lib/invite/components/InvitesBanner.svelte` (create)
- `web/src/lib/invite/components/__mocks__/InvitesBanner.svelte` (create)
- `web/src/lib/invite/components/InvitesBanner.test.ts` (create)
- `web/src/lib/list/components/ListsScreen.svelte` (modify — add InvitesBanner)
- `web/src/lib/list/components/ListsScreen.test.ts` (modify — mock + mount assertion)

**Steps:**
1. RED — Create `InvitesBanner.test.ts` with tests:
   - (a) renders nothing when `invitations.inbox` is empty.
   - (b) renders single-invite card with inviter name and list name when inbox has 1 entry.
   - (c) "Decline" button calls `declineInvitation`.
   - (d) "Accept" button calls `acceptInvitation` and then `goto`.
   - (d2) when `acceptInvitation` rejects, does not call `goto`.
   - (e) multi-invite collapsed row renders when inbox has 2+ entries with correct count.
   - (f) multi-invite row navigates to `/settings/invites` on click.
   - (g) `loadInbox` is called on mount.
   Run `cd web && pnpm test -- InvitesBanner` and confirm red.
2. GREEN — Create `InvitesBanner.svelte` and its mock. Implement the three states per Decisions. Run `cd web && pnpm test -- InvitesBanner` and confirm green.
3. Modify `ListsScreen.svelte` to import and mount `<InvitesBanner>` above the list/empty-state content.
4. Update `ListsScreen.test.ts` — add `vi.mock('$lib/invite/components/InvitesBanner.svelte')` and assert the stub is present.
5. Run `cd web && pnpm test -- ListsScreen` and confirm green.

**Verify:** `cd web && pnpm lint` · `pnpm check` · `pnpm test -- InvitesBanner` · `pnpm test -- ListsScreen`

### [ ] 2.2 Create PostAcceptPromptSheet and wire into app layout

**Created:** 2026-05-28T18:50:57Z
**Completed:**

**Why:** After accepting an invite, the user navigates to the list. The post-accept circle prompt must appear on whatever screen they land on — a global overlay in `(app)/+layout.svelte` is the only way to ensure it shows regardless of the target route.

**Prerequisites:** Task 1.1 complete — `invitations.postAcceptPrompts` exported and mocked. Task 2.1 complete — `acceptInvitation` is the live function that populates the set.

**Decisions:**
- **Component:** `web/src/lib/invite/components/PostAcceptPromptSheet.svelte`. Reads `invitations.postAcceptPrompts`; takes the first entry (via iterator) as the displayed prompt. Uses the existing `<Sheet>` primitive. Copy: *"You accepted {Name}'s invite. Add {Name} to your circle?"* Left button: "Not now" → removes entry from set (calls `invitations.postAcceptPrompts.delete(entry)`). Right button: "Add to circle" → calls `addCircleById(entry.inviterUid)` then removes entry. Uses `<ButtonPair>` for button layout.
- **`data-test` attributes:** `post-accept-prompt` on the Sheet; `post-accept-not-now`; `post-accept-add-to-circle`.
- **Mock:** `web/src/lib/invite/components/__mocks__/PostAcceptPromptSheet.svelte` renders `<div data-test="post-accept-prompt-stub"></div>`.
- **Layout wiring:** `(app)/+layout.svelte` imports `PostAcceptPromptSheet` and `invitations` from their modules. Renders `{#if invitations.postAcceptPrompts.size > 0}<PostAcceptPromptSheet />{/if}` after `{@render children()}`.
- **Layout test:** create `web/src/routes/(app)/layout.test.ts` (no `+` prefix — route-test filename rule). Mock `$lib/invite/components/PostAcceptPromptSheet.svelte` and `$lib/invite/state/invitations.svelte`. Assertions:
  - (a) prompt stub not rendered when `postAcceptPrompts` is empty.
  - (b) prompt stub rendered when one entry is in `postAcceptPrompts`.
  The prompt's internal behaviour (Not now / Add to circle) is tested in `PostAcceptPromptSheet.test.ts`, not the layout test.

**Files:**
- `web/src/lib/invite/components/PostAcceptPromptSheet.svelte` (create)
- `web/src/lib/invite/components/__mocks__/PostAcceptPromptSheet.svelte` (create)
- `web/src/lib/invite/components/PostAcceptPromptSheet.test.ts` (create)
- `web/src/routes/(app)/+layout.svelte` (modify — mount PostAcceptPromptSheet)
- `web/src/routes/(app)/layout.test.ts` (create)

**Steps:**
1. RED — Create `PostAcceptPromptSheet.test.ts` with tests:
   - (a) renders prompt copy with inviter name.
   - (b) "Not now" removes entry from `postAcceptPrompts`.
   - (c) "Add to circle" calls `addCircleById` with inviterUid then removes entry.
   Create `layout.test.ts` with tests (a) and (b) from Decisions.
   Run `cd web && pnpm test -- PostAcceptPromptSheet` and confirm red.
2. GREEN — Create `PostAcceptPromptSheet.svelte` and its mock. Modify `(app)/+layout.svelte`.
3. Run `cd web && pnpm test -- PostAcceptPromptSheet` · `pnpm test -- "routes/(app)/layout"` and confirm green.

**Verify:** `cd web && pnpm lint` · `pnpm check` · `pnpm test -- PostAcceptPromptSheet` · `pnpm test -- "routes/(app)/layout"`

---

## Phase 3 — /settings/invites route + InvitesInboxScreen + SettingsScreen swap

### [ ] 3.1 Create InvitesInboxScreen and activate SettingsScreen Invites row

**Created:** 2026-05-28T18:50:57Z
**Completed:**

**Why:** The SettingsScreen Invites row is currently a non-interactive `<div>` — a placeholder that 0801 left until this route exists. Creating the route and screen together, and swapping the div to a real nav button in the same commit, avoids a typed-routes failure where `goto(resolve('/settings/invites'))` would be rejected until the route file exists.

**Prerequisites:** Task 1.1 complete — `invitations.inbox` and `declineInvitation` / `acceptInvitation` mocked. Task 2.1 complete — `InvitesBanner` mounted in ListsScreen (so tests there stay green).

**Decisions:**
- **Route file:** `web/src/routes/(app)/settings/invites/+page.svelte`. Minimal: `<script lang="ts"> import InvitesInboxScreen from '$lib/invite/components/InvitesInboxScreen.svelte'; </script> <InvitesInboxScreen />`. No `.ts` loader needed — the screen fetches inbox on mount.
- **`InvitesInboxScreen.svelte` (design ref: `InvitesInboxScreen`):**
  - TopBar: title "Invites", subtitle `${invitations.inbox.length} pending` (reactive).
  - Intro paragraph: *"People who've invited you to their lists. Accept to join, or decline to clear."* (`font-size: 12.5px`, `color: var(--stone)`, padding `14px 18px 6px`).
  - Calls `loadInbox()` on mount (`$effect`).
  - Per-row: 36 px Avatar; inviter name + " invited you to" grey label; list name bold (15 px, `var(--ink)`); timestamp via `timeAgo(entry.createdAt)` (11 px monospace `var(--stone-lt)`); Decline / Accept pill buttons.
  - Accept: calls `acceptInvitation(id)` → on resolve, `goto(resolve('/lists/<listId>'))` using the `listId` from the return value.
  - Decline: calls `declineInvitation(id)`.
  - `data-test` per row: `inbox-row-{id}`. Buttons: `inbox-decline-{id}`, `inbox-accept-{id}`.
- **SettingsScreen Invites row swap (in same task):**
  - Replace `<div class="nav-row" data-test="settings-invites" style="cursor: default;">` with `<button class="nav-row" data-test="settings-invites" onclick={() => goto(resolve('/settings/invites'))}`.
  - Also upgrade the bare `goto('/settings/invites')` call in `InvitesBanner.svelte` (added in task 2.1 with a TODO comment) to `goto(resolve('/settings/invites'))` — the route now exists so `svelte-check` will accept it.
  - Add `<span class="nav-row-count">{invitations.inbox.length}</span>` after the `nav-row-text` span, rendered only when `invitations.inbox.length > 0`. Style: `font-size: 12px; color: var(--stone); font-weight: 600; font-family: monospace; margin-right: 4px;`.
  - Change the sub-line: `{invitations.inbox.length > 0 ? invitations.inbox.length + ' pending' : 'No pending invites'}`.
  - Add `<Icon name="chevron-right" size={18} />` at end of the button (now that it's interactive).
  - Import `invitations` from `$lib/invite/state/invitations.svelte`.
- **SettingsScreen.test.ts updates:**
  - Add `vi.mock('$lib/invite/state/invitations.svelte')` (uses the mock from Phase 1).
  - Replace test `(j-4)` ("Invites row is a `<div>`") → assert `getByDataTest('settings-invites').tagName` is `'BUTTON'`.
  - Replace test `(j-5)` ("no chevron-right") → assert clicking the row calls `goto` with the resolved `/settings/invites` path.
  - Add test `(j-5b)`: when `invitations.inbox.length` is 3, sub-line contains "3 pending".
  - Add test `(j-5c)`: when `invitations.inbox.length` is 0, sub-line contains "No pending invites".

**Design reference:** `design/cairn-screens.jsx` `SettingsScreen` (canonical, line 1084+) for the Invites row count badge. Do not use `SettingsScreenV2_LEGACY` in `cairn-invite-screens.jsx` — it is marked deprecated and shows an e-mail address in the profile chip.

**Files:**
- `web/src/routes/(app)/settings/invites/+page.svelte` (create)
- `web/src/lib/invite/components/InvitesInboxScreen.svelte` (create)
- `web/src/lib/invite/components/__mocks__/InvitesInboxScreen.svelte` (create)
- `web/src/lib/invite/components/InvitesInboxScreen.test.ts` (create)
- `web/src/lib/settings/components/SettingsScreen.svelte` (modify — swap Invites row)
- `web/src/lib/settings/components/SettingsScreen.test.ts` (modify — update j-4/j-5)
- `web/src/lib/invite/components/InvitesBanner.svelte` (modify — upgrade bare-string `goto` to `goto(resolve('/settings/invites'))`)

**Steps:**
1. RED — Create `InvitesInboxScreen.test.ts` with tests:
   - (a) intro paragraph text present.
   - (b) row renders inviter name and list name.
   - (c) Decline button calls `declineInvitation`.
   - (d) Accept button calls `acceptInvitation` and then `goto`.
   - (d2) when `acceptInvitation` rejects, does not call `goto`.
   Update `SettingsScreen.test.ts` — update j-4 and j-5, add j-5b and j-5c.
   Run `cd web && pnpm test -- InvitesInboxScreen` and confirm red; `pnpm test -- SettingsScreen` and confirm red on the updated j-4/j-5.
2. GREEN — Create route file `settings/invites/+page.svelte`, `InvitesInboxScreen.svelte`, and its mock. Modify `SettingsScreen.svelte` per Decisions.
3. Run `cd web && pnpm test -- InvitesInboxScreen` · `pnpm test -- SettingsScreen` and confirm green.

**Verify:** `cd web && pnpm lint` · `pnpm check` · `pnpm test -- InvitesInboxScreen` · `pnpm test -- SettingsScreen`

---

## Phase 4 — InvitePickerSheet

### [ ] 4.1 Create InvitePickerSheet

**Created:** 2026-05-28T18:50:57Z
**Completed:**

**Why:** The picker is an independent component — it doesn't need the Members screen to exist before it can be built and tested. Landing it now means Phase 5 (MembersScreen) can import a tested component.

**Prerequisites:** Task 1.1 complete — `sendInvitation` mocked. `relationships.svelte.ts` mock exports `relationships.circle`. `lists.svelte.ts` state accessible.

**Decisions:**
- **Props:** `listId: string`, `onclose: () => void`.
- **Already-members fetch:** on mount, fetch `GET /list_members?list_id=eq.{listId}&deleted_at=is.null&select=user_id` and store as a `Set<string>` (`currentMemberIds`). This fetch is awaited before rendering the sections.
- **Circle section:** filter `relationships.circle` entries where `otherUserId` not in `currentMemberIds` and not equal to `profile.uid`. Sub-line "In your circle". Invite button calls `sendInvitation(listId, { userId: m.otherUserId })`.
- **Co-members section:** collect `user_id` from all `lists.items.flatMap(l => l.list_members)`, deduplicate, subtract `profile.uid`, subtract `currentMemberIds`, subtract circle-member IDs. Sub-line: "On {N} of your other lists" where N is the count of shared lists. Sort by N descending. Row data: `{ userId, displayName, avatarVersion, sharedCount }`. Needs profile info — piggyback off `list_members.profiles` embedded in `lists.items` (already fetched). Invite button calls `sendInvitation(listId, { userId })`.
- **By-email section (sticky bottom):** `<input type="email">` with placeholder "friend@example.net". Send button calls `sendInvitation(listId, { email: typedEmail })`. On success: clear input, show toast "Invite sent". On error: show toast with `err.message`. The typed e-mail is never part of any displayed string.
- **Toast mechanism:** use the existing `<Snackbar>` component (or an inline `showToast` approach). Look at how `PrivacyScreen.svelte` uses `Snackbar` for the cascade note — follow the same pattern. Import `Snackbar` from `$lib/shared/components/Snackbar.svelte`.
- **Success feedback for tap-to-invite rows:** show a per-row check mark (`Icon name="check"`, `var(--sage)`) that replaces the "Invite" button after a successful call. A local `$state` Set of invited user IDs tracks which rows have been sent.
- **Empty sections:** omit the section label and rows if the filtered list is empty.
- **Design ref:** `design/cairn-invite-screens.jsx` `InvitePickerScreen`. Sheet header has drag handle + title "Add someone" + subtitle "Tap to invite, or type an e-mail below". Section labels: "YOUR CIRCLE", "PEOPLE YOU SHARE OTHER LISTS WITH", "BY E-MAIL".
- **Mock:** `web/src/lib/invite/components/__mocks__/InvitePickerSheet.svelte` renders `<div data-test="invite-picker-stub"></div>`.
- **`data-test` attributes:** `invite-picker-circle-row-{userId}`, `invite-picker-invite-{userId}`, `invite-picker-email-input`, `invite-picker-email-send`.

**Files:**
- `web/src/lib/invite/components/InvitePickerSheet.svelte` (create)
- `web/src/lib/invite/components/__mocks__/InvitePickerSheet.svelte` (create)
- `web/src/lib/invite/components/InvitePickerSheet.test.ts` (create)
- `web/src/lib/list/state/lists.svelte` (read-only dependency — not modified; imported for `lists.items` in the co-members computation)

**Steps:**
1. RED — Create `InvitePickerSheet.test.ts` with tests:
   - (a) circle section renders one row when `relationships.circle` has a non-member.
   - (b) circle section omits a user who is already a member of the target list.
   - (c) Invite button in circle section calls `sendInvitation` with `{ userId }`.
   - (c2) after a successful Invite click, the Invite button is replaced by a check-mark icon for that row.
   - (d) co-members section excludes circle members.
   - (e) by-email Send button calls `sendInvitation` with `{ email }`.
   Run `cd web && pnpm test -- InvitePickerSheet` and confirm red.
2. GREEN — Create `InvitePickerSheet.svelte` and its mock per Decisions.
3. Run `cd web && pnpm test -- InvitePickerSheet` and confirm green.

**Verify:** `cd web && pnpm lint` · `pnpm check` · `pnpm test -- InvitePickerSheet`

---

## Phase 5 — /lists/[list_id]/members route + MembersScreen

### [ ] 5.1 Create MembersScreen and route

**Created:** 2026-05-28T18:50:57Z
**Completed:**

**Why:** The Members screen is where ProfileSheet and InvitePickerSheet are surfaced from in the live app. Landing the route now also unblocks Phase 6 (ListOverflowSheet Manage members row, which navigates here).

**Prerequisites:** Task 4.1 complete — `InvitePickerSheet` exists and is mocked. `ProfileSheet` exists from 0802. `pendingInviteFor` and `loadSent` available from the invitations module.

**Decisions:**
- **Route file:** `web/src/routes/(app)/lists/[list_id]/members/+page.svelte`. Reads `page.params.list_id`, passes to `<MembersScreen listId={page.params.list_id} />`. Import `page` from `$app/state`.
- **`MembersScreen.svelte` fetch (on mount):**
  `GET /list_members?list_id=eq.{listId}&deleted_at=is.null&select=user_id,created_at,lists(created_by,name),profiles!user_id(display_name,avatar_version)`.
  The `lists(created_by,name)` embed returns the same value on every row (the list's creator and name); read it from `rows[0].lists` once for the TopBar subtitle and `createdBy` comparison.
- **Sub-line logic (use `lists.created_by`, not `list_members.created_by`):**
  ```
  if member.user_id === profile.uid && lists.created_by === profile.uid → "You · created the list"
  if member.user_id === profile.uid                                      → "Joined {timeAgo(created_at)}"
  if member.user_id === lists.created_by                                 → "Created the list"
  else                                                                   → "Joined {timeAgo(created_at)}"
  ```
- **ProfileSheet:** rendered when a non-self row is tapped. Pass `pendingInvitationId={pendingInviteFor(listId, member.user_id)}`. Calls `loadSent()` on mount so `pendingInviteFor` has data.
- **"Add member" bottom button:** fixed at the bottom of the screen; opens `<InvitePickerSheet listId={listId}>` as a sheet overlay.
- **TopBar:** title "Members", subtitle = list name (from `rows[0].lists.name`).
- **Section label:** `{rows.length} people on this list` (singular "person" when 1).
- **`data-test` attributes:** `members-screen`, `member-row-{userId}`, `members-add`.
- **Mock:** `web/src/lib/list/components/__mocks__/MembersScreen.svelte` renders `<div data-test="members-screen-stub"></div>`.

**Files:**
- `web/src/routes/(app)/lists/[list_id]/members/+page.svelte` (create)
- `web/src/lib/list/components/MembersScreen.svelte` (create)
- `web/src/lib/list/components/__mocks__/MembersScreen.svelte` (create)
- `web/src/lib/list/components/MembersScreen.test.ts` (create)

**Steps:**
1. RED — Create `MembersScreen.test.ts` with tests:
   - (a) section label shows member count ("N people on this list").
   - (a2) section label shows "1 person on this list" (singular) when there is exactly 1 member.
   - (b) creator's own row shows "You · created the list" (member.user_id === profile.uid AND lists.created_by === profile.uid).
   - (b2) own row where the user is NOT the creator shows "Joined {timeAgo}" (member.user_id === profile.uid AND lists.created_by !== profile.uid).
   - (c) non-creator non-self row shows "Joined …" (timeAgo).
   - (d) row with `user_id === lists.created_by` (non-self) shows "Created the list".
   - (e) tapping a non-self row opens ProfileSheet (stub visible).
   - (f) "Add member" button opens InvitePickerSheet (stub visible).
   Run `cd web && pnpm test -- MembersScreen` and confirm red.
2. GREEN — Create route file `lists/[list_id]/members/+page.svelte` and `MembersScreen.svelte` per Decisions. Add mock.
3. Run `cd web && pnpm test -- MembersScreen` and confirm green.

**Verify:** `cd web && pnpm lint` · `pnpm check` · `pnpm test -- MembersScreen`

---

## Phase 6 — ListOverflowSheet extensions

### [ ] 6.1 Add Manage members and Leave list rows to ListOverflowSheet

**Created:** 2026-05-28T18:50:57Z
**Completed:**

**Why:** Completes the six-row overflow shape specified in R10. The Manage members row navigates to `/lists/{listId}/members` — that route exists now (Phase 5), so the typed-routes pass is satisfied.

**Prerequisites:** Task 5.1 complete — `/lists/[list_id]/members` route exists. `profile.uid` available from `$lib/shared/state/profile.svelte`.

**Decisions:**
- **Row order (6 rows):** 1. Rename list · 2. Edit description · 3. Manage members · 4. View bin · 5. Leave list · 6. Delete list.
- **Manage members:** `<button class="row" data-test="list-overflow-manage-members" onclick={() => { goto(resolve('/lists/<listId>/members')); onclose(); }>`. Icon `users`, label "Manage members".
- **Leave list confirmation:** inline confirmation block (not a separate Sheet). When tapped, replaces the "Leave list" button with a confirm block: copy *"Leave {listName}? You'll have to be re-invited to rejoin."* + `<ButtonPair>`: left "Cancel" (restores the button), right "Leave" (`data-test="list-overflow-leave-confirm"`). On confirm: `PATCH /list_members?list_id=eq.{listId}&user_id=eq.{profile.uid}` with body `{ deleted_at: new Date().toISOString() }` (no `deleted_by` — trigger handles it). On success: `goto(resolve('/lists'))` then `onclose()`.
- **`ListOverflowSheet` props:** `listId` already exists. Add nothing new — navigation uses `listId` directly and leave-list uses `profile.uid` from the profile store.
- **`ListOverflowSheet.test.ts` updates:**
  - Update test `(b)` — now asserts six rows: "Rename list", "Edit description", "Manage members", "View bin", "Leave list", "Delete list".
  - Add test `(h)`: "Manage members" navigates to `/lists/list-1/members`.
  - Add test `(i)`: "Leave list" tapped → confirm block appears.
  - Add test `(j)`: confirm "Leave" calls pgPatch with `{ deleted_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) }` (ISO timestamp) and then navigates to `/lists`.
  - Add `vi.mock('$lib/shared/http/postgrest')`, `vi.mock('$lib/shared/state/profile.svelte')`, `vi.mock('$app/navigation')`, and `vi.mock('$app/paths')` at the top if not already present.

**Files:**
- `web/src/lib/list/components/ListOverflowSheet.svelte` (modify)
- `web/src/lib/list/components/ListOverflowSheet.test.ts` (modify)

**Steps:**
1. RED — Update `ListOverflowSheet.test.ts` with tests (b-updated), (h), (i), (j). Run `cd web && pnpm test -- ListOverflowSheet` and confirm the updated test (b) and new tests fail.
2. GREEN — Modify `ListOverflowSheet.svelte`: insert the Manage members row after "Edit description", insert the Leave list row (with inline confirm state) before "Delete list".
3. Run `cd web && pnpm test -- ListOverflowSheet` and confirm green.

**Verify:** `cd web && pnpm lint` · `pnpm check` · `pnpm test -- ListOverflowSheet`

---

## Phase 7 — Playwright e2e specs

### [ ] 7.1 Write Playwright specs for invite, block, and privacy flows

**Created:** 2026-05-28T18:50:57Z
**Completed:**

**Why:** Step 8 ships the first invite/block/privacy Playwright coverage. The specs cannot run in this environment (Playwright is not installed), but writing them now means they're ready for manual verification at deploy time and for CI once the environment is set up.

**Prerequisites:** All Phases 1–6 complete — routes, components, and state module are in place.

**Decisions:**
- Follow the pattern of `web/e2e/items.spec.ts`: `test.describe.serial`, unique per-run emails (`alice+invites-${runId}@example.test`), magic-link via `waitForMagicLink`.
- **`invites.spec.ts`:** Alice signs in, creates a list, opens the picker (via Members screen → Add member), sends invite to Bob by e-mail. Bob signs in (new page), sees single-invite banner, accepts, lands on the list, post-accept prompt appears, Bob taps "Add to circle". Navigate back; banner is gone.
- **`block.spec.ts`:** Alice and Bob share a list (seeded by Alice inviting Bob in beforeAll). Alice opens Bob's ProfileSheet from Members screen, blocks Bob (confirms). New Bob page: Bob opens picker on another list, types Alice's e-mail, taps Send — toast "Couldn't send invite" appears (no Alice e-mail echoed).
- **`privacy.spec.ts`:** Alice has a pending invite from Bob (Bob invites Alice in beforeAll). Alice navigates to Settings → Privacy, changes policy to "Nobody". Banner on ListsScreen disappears. Settings → Invites row shows "No pending invites".
- All three specs use `data-test` selectors consistent with the components built in Phases 2–6.
- Report in Notes that the specs were written but not run in this environment.

**Files:**
- `web/e2e/invites.spec.ts` (create)
- `web/e2e/block.spec.ts` (create)
- `web/e2e/privacy.spec.ts` (create)

**Steps:**
1. Create `web/e2e/invites.spec.ts` — full `test.describe.serial` block per Decisions.
2. Create `web/e2e/block.spec.ts`.
3. Create `web/e2e/privacy.spec.ts`.
4. Run `cd web && pnpm check` (Playwright spec files are TypeScript — the type-check must pass even if the tests don't run). Confirm no TS errors.

**Verify:** `cd web && pnpm lint` · `pnpm check` (Playwright specs typecheck; tests not run — reported as untested per project convention)

---

## Phase 8 — Implementation order update

### [ ] 8.1 Update plans/0000_implementation_order.md step 8 parenthetical

**Created:** 2026-05-28T18:50:57Z
**Completed:**

**Why:** The step 8 parenthetical currently lists the overflow rows from a pre-0803 draft. Now that all six rows are shipped, update it to match the actual order.

**Prerequisites:** Task 6.1 complete — six-row order confirmed.

**Decisions:**
- Change the step 8 parenthetical's overflow row list from the current wording to: "Rename / Edit description / Manage members / View bin / Leave list / Delete list".
- The step 8 checkbox remains `[ ]` — it flips to `[x]` in task 4.1 of `0800_invites_circles_ui` after the merge.

**Files:**
- `plans/0000_implementation_order.md` (modify)

**Steps:**
1. Open `plans/0000_implementation_order.md`, locate the step 8 bullet, update the overflow row parenthetical to list all six rows in order.
2. Run `cd web && pnpm lint` (no code changes — just confirming nothing broke).

**Verify:** `git diff plans/0000_implementation_order.md` shows only the parenthetical edit. `cd web && pnpm lint`
