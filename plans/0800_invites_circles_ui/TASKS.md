# Tasks

## Reference skills and docs

- **`.claude/skills/write-plan.md`** — how to create a sub-plan
  directory (branch, number, slug, three files).
- **`plans/0800_invites_circles_ui/REQUIREMENTS.md`** — full step-8
  requirements (R1–R16).
- **`plans/0800_invites_circles_ui/PLAN.md`** — design rationale,
  decisions, branch graph.
- **`docs/invites.md`** — canonical UX spec for the invite flow,
  profile screen, anti-enumeration posture, policy-cascade deferral.
- **`docs/circles.md`** — circle model semantics.
- **`docs/ui.md`** — TopBar / sheet / button-pair / empty-state
  conventions.
- **`docs/frontend-layout.md`** — tier rules and filename traps.
- **`docs/data-model.md`** — self-leave PATCH endpoint, trigger
  conventions.
- **`docs/testing.md`** — pgTAP / Vitest / Playwright layers.
- **`design/cairn-invite-screens.jsx`** — visual spec for every
  step-8 screen.
- **`design/cairn-screens.jsx`** — Members screen + ListMenu refs.

---

## Phase 0 — Doc reconciliation

### [ ] 0.1 Reconcile `docs/invites.md`, `docs/data-model.md`, and `docs/ui.md` with step-8 decisions

**Created:** 2026-05-28T12:02:33Z
**Completed:**

**Why:** Four step-8 design choices are at odds with the current
docs: (a) the R12 FIFO cap deliberately exempts `target_email`-only
invitations, but `docs/invites.md` § "Pending-invite cap" doesn't
record the carve-out; (b) the profile-sheet *Cancel pending invite*
action is a direct `DELETE /invitations?…` (gated by the new
`invitations_delete` policy that 0802 ships), but `docs/invites.md`
§ "RLS and stored procedures" currently asserts that *all* deletes on
`invitations` go through RPCs; (c) two pieces of `docs/ui.md` block
/ circle copy still use gendered "Bob" / "He" pronouns, which
CLAUDE.md "User-facing text uses they / them / their" forbids; (d)
`docs/ui.md` § "Circle screen" specifies a confirmation prompt on
the *Remove* action that contradicts both the design canvas (no
confirm shown) and the plan's R2 (no confirm specified) — the
intended posture is quiet for both add and remove, with confirmation
only on block/unblock. Landing the doc edits on
`0800_invites_circles_ui` itself — before the sub-branches are cut —
means each sub-plan author finds the docs already in the shape the
plan assumes, and the pgTAP tests in 0802 have a doc to point to.

**Prerequisites:** None — this is the first task on the branch and
operates only on prose.

**Decisions:**
- The migration that creates `invitations_delete` and its pgTAP land
  in 0802, not here. Phase 0 is doc-only.
- All three edits cite the rationale already worked out in PLAN.md
  § "Phase structure" → Phase 0 — copy the wording verbatim so the
  doc reads as a coherent paragraph, not as a graft.

**Files:**
- `docs/invites.md` (modify — two paragraphs)
- `docs/data-model.md` (modify — one bullet under "What the app sees")
- `docs/ui.md` (modify — two copy strings)

**Steps:**
1. In `docs/invites.md` § "Pending-invite cap", append a sentence to
   the paragraph that ends *"20 is tunable; the right number is
   'high enough that no normal user ever notices.'"*:
   > The cap applies to `target_user_id`-keyed pending invitations
   > only; `target_email`-only rows (addressed to not-yet-registered
   > users) are uncapped and convert to user-keyed rows at sign-up.
   > Capping the email-keyed surface would let an attacker who knows
   > an e-mail address evict that address's already-pending sign-up
   > nudges by flooding adjacent typos.
2. In `docs/invites.md` § "RLS and stored procedures", append to the
   paragraph that starts *"Insert and delete on `invitations`, …"*:
   > The one exception is the inviter's own *cancel pending invite*
   > action, which is a direct `DELETE /invitations?id=eq.<uuid>`
   > gated by the `invitations_delete` policy
   > (`USING (created_by = public.uid())`); accept and decline by
   > the invitee still go through the `accept_invitation` /
   > `decline_invitation` RPCs.
3. In `docs/data-model.md` § "What the app sees", add a new bullet
   directly below the `GET /invitations?created_by=eq.<my-uid>` line:
   > - `DELETE /invitations?id=eq.<uuid>` — cancel a pending invite
   >   you created (inviter only; the `invitations_delete` RLS policy
   >   scopes the delete to your own rows). Lands alongside the
   >   profile-sheet *Cancel pending invite* action in step 8.
4. In `docs/ui.md` § "Circle screen", drop the
   *"(with confirmation: 'Stop accepting invites from Bob?')"*
   parenthetical from the Remove action description so the line
   reads *"Each row: avatar, display name, a small action affordance
   to remove."* The intended posture mirrors *Add to circle* (also
   quiet) — block / unblock remain the only confirm-prompted
   actions on the circle / blocked surface.
5. In `docs/ui.md` § "Profile screen (sheet)", rewrite the
   confirmation example to use they/them and a placeholder rather
   than the gendered *"Block Bob? He won't be able to invite you to
   any list."* Replacement:
   > Block and Unblock prompt for confirmation (*"Block {Name}?
   > They won't be able to invite you to any list."*).
6. Commit: `docs(invites): record email-cap carve-out, inviter-self DELETE, and circle UX reconciliation`.

**Verify:** `git diff main -- docs/` shows only the five paragraph
edits above (two in `docs/invites.md`, one in `docs/data-model.md`,
two in `docs/ui.md`). `./scripts/check.sh` is unaffected (no code or
migration changes). The next reader of `docs/invites.md`
§ "Pending-invite cap" sees the carve-out without having to dig
into the trigger source; the next reader of `docs/ui.md` § "Circle
screen" finds the Remove copy aligned with the design canvas and
the plan; the two block-confirmation lines no longer carry gendered
demo-character pronouns.

---

## Phase 1 — 0801: Privacy, Circle, Blocked + DB triggers

### [x] 1.1 Plan and implement sub-step 0801 (privacy + circle + blocked + cascade & FIFO triggers)

**Created:** 2026-05-28T12:02:33Z
**Completed:** 2026-05-28T17:15:51Z

**Why:** The settings-side surfaces are the natural foundation of the
step-8 UI — they introduce the `relationships.svelte.ts` state module
that 0802 and 0803 both reuse, they land the two DB triggers
`docs/invites.md` defers to step 8 (policy-change cascade and
20-invite FIFO cap), and they're the screens a user reaches first when
deciding their invite posture. Landing this slice first means 0802 and
0803 can import a tested state module rather than building it
piecemeal.

**Prerequisites:** None — `0800_invites_circles_ui` is cut from
`main`, step 7 (`0700_invites_circles_db`) is merged, and the step-7
RPCs are callable.

**Decisions:**
- Sub-branch is cut from `0800_invites_circles_ui`, not from `main`.
- Scope (from REQUIREMENTS.md):
  - R1: Privacy screen at `/settings/privacy` — segmented control
    bound to `user_settings.invite_policy`, "What's a circle?" link
    visible when `circle` selected, NavRows to Circle and Blocked,
    privacy note. Exact copy in `design/cairn-invite-screens.jsx`
    `PrivacyScreen`.
  - R2: Circle screen at `/settings/circles` — intro paragraph + link
    to explainer, list of circle members (avatar, name, "added {date}"
    sub-line, Remove button), add-by-e-mail dashed-border form, helpful
    error copy on `'no such user'` raise.
  - R3: Blocked screen at `/settings/blocked` — description, list with
    Unblock per row (delete the row outright; prior 'circle' state is
    not restored), empty-state dashed card with the literal *"You
    haven't blocked anyone."*
  - R4: Circle explainer sheet — bottom sheet with title *"What is a
    circle?"*, four explainer points (verbatim copy from
    `CircleExplainerSheet` in `design/cairn-invite-screens.jsx`), a
    privacy footer, and a **Got it** dismiss button. Reachable from
    both Privacy (when `circle` selected) and Circle screens.
  - R11: policy-cascade trigger on `user_settings` — tighten to
    `nobody` deletes all pending invites to the caller; tighten to
    `circle` deletes only non-circle pending invites; loosen is a
    no-op (does not resurrect).
  - R12: 20-invite FIFO cap trigger on `invitations` — per-target,
    not global.
  - R14 (partial): SettingsScreen *People* section — adds the
    **Privacy** NavRow (live, navigates to `/settings/privacy`). Also
    scaffolds the **Invites** row as a **non-interactive `<div>`**
    (no `<button>`/`<a>`, no `onclick`, `cursor: default`) styled to
    match the live NavRow, with the placeholder sub-line *"No pending
    invites"* and no badge. The non-interactive shape avoids a
    `svelte-check` failure: rendering it as a real NavRow with
    `href="/settings/invites"` would fail typed-routes validation
    until 0803 creates that route. 0803's R14-completion task swaps
    the `<div>` for `<NavRow href="/settings/invites">` in the same
    commit that ships the route file. The *People* section sits
    **above** Appearance, matching `design/cairn-screens.jsx:1135-1143`
    and R14.
  - R15 (relationships half): the
    `relationships.svelte.ts` state module with `circle`, `blocked`,
    `loadRelationships()`, `addCircleByEmail`, `addCircleById`,
    `removeFromCircle`, `block`, `unblock`.
- DB work in `db/migrations/0010_invite_cascades.sql`:
  - Trigger function `tg_apply_invite_policy_cascade` —
    `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`,
    fires `AFTER UPDATE OF invite_policy ON user_settings FOR EACH
    ROW WHEN (new.invite_policy IS DISTINCT FROM old.invite_policy)`.
    Body branches on `new.invite_policy`:
    - `'nobody'` → `DELETE FROM invitations WHERE target_user_id =
      new.id`
    - `'circle'` → `DELETE FROM invitations WHERE target_user_id =
      new.id AND NOT EXISTS (SELECT 1 FROM relationships WHERE
      user_id = new.id AND other_user_id = invitations.created_by
      AND status = 'circle')`
    - `'everybody'` → no-op (explicit `RETURN NEW;`)
  - Trigger function `tg_enforce_fifo_cap_invitations` —
    `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`,
    fires `BEFORE INSERT ON invitations FOR EACH ROW WHEN
    (new.target_user_id IS NOT NULL)`. Body: if **20 or more
    pending rows already exist** for the same `target_user_id`
    *before* this insert (i.e. the new row would be the 21st),
    delete the oldest by `created_at` so the insert lands at a
    steady-state count of 20. Concretely:
    `IF (SELECT count(*) FROM invitations WHERE target_user_id =
    new.target_user_id) >= 20 THEN DELETE FROM invitations WHERE
    id = (SELECT id FROM invitations WHERE target_user_id =
    new.target_user_id ORDER BY created_at LIMIT 1); END IF`.
    The 20th insert is therefore **uncapped** (count goes
    19 → 20, no eviction); the 21st insert evicts the oldest.
    The `WHEN` gate deliberately exempts `target_email`-only rows;
    the rationale and the doc edit that records it land in Phase 0
    (Task 0.1) and in REQUIREMENTS.md R12.
  - Bind matching the `t<NN>_` slot convention from
    `docs/data-model.md` § "Triggers": **`t40_apply_invite_policy_cascade`**
    on `user_settings` (AFTER UPDATE — `t40_*` is the documented
    AFTER-trigger slot, parallel to `t40_block_declines_invitations`
    on `relationships`) and **`t30_enforce_fifo_cap`** on
    `invitations` (BEFORE INSERT — `t30_*` is the reserved
    future-BEFORE slot per `docs/data-model.md:618`; `t10_*` is the
    per-table attribution slot and shouldn't be reused for a
    non-attribution BEFORE trigger).
- pgTAP in `db/tests/invite_cascades.sql`:
  - Policy-tighten to `nobody` declines all → row gone.
  - Policy-tighten to `circle` keeps in-circle invites; declines
    non-circle invites.
  - Policy-loosen from `circle` to `everybody` does not resurrect
    previously-declined invites.
  - 1st through 20th `target_user_id` inserts all succeed and the
    count climbs from 1 to 20 with no eviction (assert the oldest
    row from insert #1 is still present after insert #20).
  - 21st `target_user_id` insert succeeds at a steady-state count
    of 20, and the row that was oldest before the 21st insert is
    gone (assert by `created_at` ordering, not by remembered id).
  - An unrelated target's pending invites are untouched by the
    21st insert.
  - A 21st `target_email`-only insert to the same address is **not**
    capped — asserts the email-keyed carve-out.
  - Both triggers update `schema_shape.sql` counts.
- The Privacy screen (R1) renders the **cascade-feedback note**
  *"{N} pending invites have been declined to match your new
  setting."* (singular form when `N == 1`) inline below the
  segmented control after a successful PATCH that tightens the
  policy. The screen reads `prevCount` from
  `invitations.svelte.ts.inbox.length` before the PATCH, calls
  `loadInbox()` after, and computes `removed = prevCount -
  newCount`. The note is suppressed when `removed == 0`. Mirrors
  `docs/ui.md` § "Privacy screen" line 251 and gives the R11
  server-side cascade trigger a visible footprint. The Vitest test
  asserts the note appears with the correct count and singular/plural
  form after a tighten PATCH, and does not appear on a loosen.
- Vitest tests for every new component asserting user-visible
  behaviour (selection of the segmented control updates `invite_policy`;
  add-by-email shows the helpful error on `'no such user'`; unblock
  removes the row from the list).
- Settings *People* section scaffolding lands here so 0803 only has
  to wire the live count badge on the Invites row. The Invites row
  is rendered as a **non-interactive `<div>`** (not a `NavRow`)
  until 0803 ships the `/settings/invites` route — rendering it as
  a NavRow with `href="/settings/invites"` would fail
  `svelte-check`'s typed-routes pass. The *People* section sits
  **above** Appearance (between the profile chip and Appearance) —
  matching `design/cairn-screens.jsx:1135-1143`.
- **`SettingsScreen.test.ts` must be updated in the same task** that
  adds the *People* section. The existing test asserts the screen's
  current layout (profile chip → Appearance → Text size → Recovery
  → Account); adding a new section between profile chip and
  Appearance changes the section order and adds two new NavRows
  whose presence and copy the test should now assert (Privacy
  navigates to `/settings/privacy`; the Invites row is rendered as
  a non-interactive element with the placeholder sub-line). Per
  CLAUDE.md "Tests out of sync", the source change and the test
  update ship together.

**Steps:**
1. `git checkout -b 0801_privacy_circle_blocked 0800_invites_circles_ui`
2. Invoke `/write-plan` to create `plans/0801_privacy_circle_blocked/`
   with its three files. The plan must include: (a) a phase for the
   DB migration + pgTAP (red-before-green), (b) a phase for
   `relationships.svelte.ts` + its Vitest tests, (c) a phase per
   screen (Privacy, Circle, Blocked, ExplainerSheet) each with
   component + Vitest test in the same task, (d) a phase for the
   Settings *People* section scaffolding.
3. Implement the sub-plan task by task.
4. Run `./scripts/check.sh` — must be green (no `--e2e` here; 0803
   adds the Playwright specs).
5. `git checkout 0800_invites_circles_ui && git merge --no-ff
   0801_privacy_circle_blocked`

**Verify:** `./scripts/check.sh` green on `0800_invites_circles_ui`
after merge. `\df tg_apply_invite_policy_cascade` and
`\df tg_enforce_fifo_cap_invitations` each return one row in psql;
`\d+ public.user_settings` shows the `t40_apply_invite_policy_cascade`
binding and `\d+ public.invitations` shows the `t30_enforce_fifo_cap`
binding.
Manual walkthrough: sign in as `alice@example.test`, navigate to
Settings → Privacy, switch policy through all three values, navigate
to Circle, add a seed user by e-mail, remove them, navigate to
Blocked (empty), tap the *What's a circle?* link from Privacy and
from Circle (both open the same sheet).

---

## Phase 2 — 0802: Profile sheet + cancel-invite RLS

### [ ] 2.1 Plan and implement sub-step 0802 (profile sheet + state-driven actions)

**Created:** 2026-05-28T12:02:33Z
**Completed:**

**Why:** The profile sheet is a shared primitive — it opens from
member avatars (already on the lists overview today), from inbox row
inviters (0803), from picker rows (0803), and from members screen
rows (0803). Landing it as a stand-alone deliverable means 0803's
flow surfaces can drop it in without bundling component design and
flow wiring together. The same sub-plan also adds the small
`invitations_delete` RLS policy + DELETE grant that the sheet's
*Cancel pending invite* action depends on; flagged by step 7 as
"step 8 will add it."

**Prerequisites:** Task 1.1 merged — `0800_invites_circles_ui`
contains the `relationships.svelte.ts` state module that the profile
sheet uses to compute its in-circle / blocked badge and to call
add/remove/block/unblock.

**Decisions:**
- Sub-branch is cut from the updated `0800_invites_circles_ui`
  (post-0801 merge).
- Scope (from REQUIREMENTS.md):
  - R5: `<ProfileSheet>` component at
    `web/src/lib/profile/components/ProfileSheet.svelte`. Props:
    `userId`, `displayName`, `avatarVersion`, `pendingInvitationId`
    (optional, when the caller has a pending invite to this user
    on a list they share), `onclose`. Renders the avatar (68px),
    display name (no e-mail, no shared-lists list), a state badge
    (sage *"IN YOUR CIRCLE"* / ember *"BLOCKED"* / no badge), and
    the action rows per state.
  - Tap on the caller's own avatar bounces to `/settings` (per
    `docs/invites.md:62` and `docs/ui.md:296` — the profile sheet is
    for looking at *others*; the user's own hub is Settings, from
    which Edit profile is one tap away). Short-circuit on `userId ===
    profile.uid` in the tap handler before opening the sheet.
  - Block path opens a confirmation prompt before writing. Unblock,
    Add to circle, Remove from circle are quiet (no confirm). Cancel
    pending invite is quiet.
  - Block uses an upsert — `pgPost('/relationships', {user_id: me,
    other_user_id: them, status: 'blocked'}, {headers: {Prefer:
    'resolution=merge-duplicates'}})` if the exploration phase
    confirms PostgREST merge-duplicates fires the `relationships_update`
    policy correctly; otherwise fall back to a check-then-PATCH from
    `relationships.svelte.ts`. Record the choice in the sub-plan's
    Decisions.
  - Extend `invitations.svelte.ts` (started in R15) with the **sent
    invitations** channel that the *Cancel pending invite* row
    needs — a `sent` reactive collection + `loadSent()` method
    (`GET /invitations?created_by=eq.<my-uid>`) and a derived
    helper `pendingInviteFor(listId, userId): string | null` that
    returns the pending invitation id (or `null`) for the given
    list/user pair. The ProfileSheet's parent (the Members screen
    in 0803, when it lands) calls `loadSent()` on mount and passes
    `pendingInviteFor(listId, member.user_id)` into the sheet as
    `pendingInvitationId`. **`invitations.svelte.ts` itself is
    introduced in 0803's R15 task**; 0802's contribution is the
    `sent` / `loadSent` / `pendingInviteFor` shape — keep the
    module in `web/src/lib/invite/state/` as planned, and split
    the file edits across the two sub-plans so the 0802
    Vitest tests for ProfileSheet can mock `pendingInviteFor`
    directly.
- **The sheet ships without an in-app consumer in 0802.** Earlier
  drafts wired the sheet into the Lists-overview member-avatars
  stack to avoid dead code; on reflection, the 16 px overlapping
  avatars on the Lists overview are a poor touch target, conflict
  with the list row's primary tap target (navigate into the list),
  and open a profile sheet on a screen whose purpose is choosing a
  list, not interacting with people. The Members screen (R9) is
  the natural consumer and ships in 0803. Vitest covers each state
  variant (stranger, in-circle, blocked, with-pending-invite,
  own-avatar bounce) so the primitive lands tested even without a
  live mount point.
- DB migration `db/migrations/0011_invitations_delete.sql`:
  - `CREATE POLICY invitations_delete ON public.invitations FOR
    DELETE USING (created_by = public.uid())`
  - `GRANT DELETE ON public.invitations TO authenticated`
  - pgTAP positive (inviter can delete own row) + negative (invitee
    cannot delete; outsider cannot select-and-delete).
  - The doc reconciliation for this policy (the carve-out in
    `docs/invites.md` § "RLS and stored procedures" and the new
    endpoint line in `docs/data-model.md` § "What the app sees")
    already landed in Phase 0 (Task 0.1); this sub-plan ships only
    the migration + pgTAP and does not re-edit the docs.
- Vitest tests for every state variant of the sheet: stranger
  (Add to circle + Block), in-circle (Remove + Block), blocked
  (Unblock only — Add to circle hidden), with-pending-invite
  (Cancel pending row visible).
- Update `schema_shape.sql` (new policy) and `grants.sql` (DELETE
  grant) plan counts.

**Steps:**
1. `git checkout -b 0802_profile_sheet 0800_invites_circles_ui`
2. Invoke `/write-plan` to create `plans/0802_profile_sheet/` with
   its three files. The plan must include: (a) the
   `invitations_delete` migration + pgTAP, (b) `<ProfileSheet>` and
   each state variant with co-located Vitest tests (stranger,
   in-circle, blocked, with-pending-invite, own-avatar bounce —
   tests assert the rendered action rows and the click-handler
   calls), (c) the `sent` / `loadSent()` / `pendingInviteFor()`
   shape on the `invitations.svelte.ts` module (with Vitest
   covering an empty `sent` returning `null` from
   `pendingInviteFor`, and a populated `sent` returning the
   matching invitation id).
3. Implement the sub-plan task by task.
4. Run `./scripts/check.sh` — must be green.
5. `git checkout 0800_invites_circles_ui && git merge --no-ff
   0802_profile_sheet`

**Verify:** `./scripts/check.sh` green on `0800_invites_circles_ui`
after merge. `\dp invitations` in psql shows the new `DELETE` grant.
The sheet has no live mount point yet — 0803's Members screen is
where the first user-reachable tap lands; verify here only via the
Vitest suite (instantiate `<ProfileSheet>` in each state and assert
the action rows render as specified).

---

## Phase 3 — 0803: Invite flow, members, overflow

### [ ] 3.1 Plan and implement sub-step 0803 (invites banner + inbox + picker + members + overflow rows)

**Created:** 2026-05-28T12:02:33Z
**Completed:**

**Why:** Completes the step-8 UI loop — sending invites, receiving
them, accepting/declining, and the affordances around list membership
(Members screen, Manage members + Leave list overflow rows). These
surfaces all share the `invitations.svelte.ts` state module and
several copy strings; splitting them further would mean landing the
picker without a way to open it, or the Members screen without a
button to invite from. End-to-end Playwright coverage lands here.

**Prerequisites:** Tasks 1.1 and 2.1 merged — `0800_invites_circles_ui`
contains the `relationships.svelte.ts` state module (the picker's
*Your circle* section needs it) and the `<ProfileSheet>` component
(the inbox-row inviter, picker rows, and members rows all open it).

**Decisions:**
- Sub-branch is cut from the updated `0800_invites_circles_ui`
  (post-0802 merge).
- Scope (from REQUIREMENTS.md):
  - R6: `<InvitesBanner>` at the top of
    `web/src/lib/list/components/ListsScreen.svelte`. Three states:
    not rendered (0), single-invite row (1, inline Decline / Accept),
    multi-invite row (2+, chevron, taps to `/settings/invites`).
  - R7: `/settings/invites` route + `<InvitesInboxScreen>`. Header
    *"Invites"* with subtitle *"{N} pending"*; row layout per
    `design/cairn-invite-screens.jsx` `InvitesInboxScreen`. Accept
    navigates to the list and shows the **post-accept circle
    prompt** *"You accepted {Inviter}'s invite. Add {Inviter} to
    your circle?"* with `[Not now] [Add to circle]`. Prompt is
    session-scoped (in-memory SvelteSet of inviter UIDs).
  - **Inviter capture before `accept_invitation`.** The RPC
    hard-deletes the `invitations` row inside the same transaction
    (`db/migrations/0009_invitations.sql:253-258`), so the client
    cannot look up the inviter after the call returns.
    `invitations.svelte.ts.acceptInvitation(id)` therefore reads
    `{inviterUid, inviterName}` from the inbox entry **before**
    invoking the RPC, holds the pair in the SvelteSet payload, and
    uses it both to render the prompt copy and to call
    `add_circle_by_id(inviterUid)` if the user taps *Add to circle*.
    The banner's single-pending Accept path (R6) follows the same
    capture-then-call sequence — drive both surfaces through the
    same `acceptInvitation` action so the inviter capture lives in
    one place.
  - R8: `<InvitePickerSheet>`. Three sections (circle / co-members /
    by-e-mail). Tap-to-invite calls
    `send_invitation(p_list_id, p_user_id := …)`. E-mail submit
    calls `send_invitation(p_list_id, p_email := …)`. **Every
    `null` return surfaces the literal toast *"Couldn't send
    invite"*** — block, policy reject, unregistered, unknown user.
    The typed e-mail is never echoed back. Success shows a per-row
    check mark plus a *"Invite sent"* toast.
  - R9: `/lists/[list_id]/members` route + `<MembersScreen>`. Header
    *"Members"* with list name as subtitle. Section label *"{N}
    people on this list"*. Member rows: avatar + name + sub-line.
    The discriminator for the sub-line is the **`lists.created_by`**
    column (the user who created the list itself), **not**
    `list_members.created_by` — the attribution trigger stamps
    `list_members.created_by = public.uid()` on every insert,
    including the invitee's row from `accept_invitation`, so a rule
    keyed on `list_members.created_by` would tag every member as a
    creator. Fetch `lists.created_by` alongside the members list
    via PostgREST's embedded select:
    `GET /list_members?list_id=eq.<id>&deleted_at=is.null&select=*,lists(created_by),profiles(display_name,avatar_version)`.
    Sub-line copy:
    - *"You · created the list"* — caller's own row when
      `lists.created_by = uid()`.
    - *"Created the list"* — any non-caller row whose
      `lists.created_by = list_members.user_id`.
    - *"Joined {timeAgo(list_member.created_at)}"* (using
      `$lib/shared/model/time-ago`) — everyone else, including the
      caller's own row when they joined via accept rather than
      create.
    **The sub-line does not name an inviter** — the schema doesn't
    preserve that link (see REQUIREMENTS R9 for the full rationale
    and the Non-requirement that records why widening
    `accept_invitation` is out of scope). The design canvas's *"Added
    by Alice"* copy at `design/cairn-screens.jsx:1039-1040` is
    superseded by this rule. Tapping non-self row opens
    `<ProfileSheet>` (with `pendingInvitationId` populated from
    `invitations.svelte.ts.pendingInviteFor(listId, member.user_id)`
    so the *Cancel pending invite* row shows iff the caller has a
    pending invite outstanding to that member on this list). Bottom
    button *"Add member"* opens `<InvitePickerSheet>`.
  - R10: `ListOverflowSheet.svelte` extensions — new **Manage
    members** row (navigates to `/lists/[list_id]/members`) and new
    **Leave list** row (confirmation prompt → PATCH the caller's own
    `list_members` row with body `{deleted_at: 'now()'}` only — the
    soft-delete branch of `tg_set_attribution_list_members` stamps
    `deleted_by = public.uid()` automatically (see
    `docs/data-model.md:634`), so the client does not send
    `deleted_by` — then navigate `/lists`). Six rows total in the
    documented order.
  - R13 (anti-enumeration): every `send_invitation` failure surfaces
    *"Couldn't send invite"* except for two clear-error carve-outs.
    Self-invite (RPC raises `'self-invite'`) surfaces *"You can't
    invite yourself."* Already-a-member (RPC raises
    `'already a member'`, see
    `db/migrations/0009_invitations.sql:131-138`) surfaces
    *"They're already on this list."* No e-mail is echoed in any
    error string. `invitations.svelte.ts.sendInvitation` maps the
    two `PostgrestError.message` strings to the carve-out toasts
    and everything else to the generic one.
  - R14 (Invites NavRow live badge + activation): SettingsScreen's
    *People* section Invites row, which 0801 scaffolded as a
    non-interactive `<div>`, is swapped to a real `<NavRow
    href="/settings/invites">` in the same commit that ships the
    `/settings/invites/+page.svelte` route file — so `svelte-check`
    only ever sees a valid combination. The row now shows *"{N}
    pending"* sub-line when non-zero (with a count badge) and *"No
    pending invites"* when zero.
  - R15 (invitations half): `invitations.svelte.ts` state module —
    `inbox`, `loadInbox`, `sendInvitation`, `acceptInvitation`,
    `declineInvitation`, `cancelInvitation`, plus the session-scoped
    SvelteSet for the post-accept-prompt one-shot logic. The
    `sent` collection + `loadSent()` + `pendingInviteFor()` helpers
    are co-introduced here in the same file — 0802 already specifies
    their shape so the ProfileSheet can mock them in Vitest, but
    the live implementation and its tests land alongside the rest
    of the invitations module in this sub-plan.
- Lists banner data: subscribe to the same `invitations.svelte.ts`
  module so accept/decline anywhere in the app updates the banner.
- Co-members section is computed client-side from the
  existing `lists.svelte.ts` state plus a single
  `/list_members?...&deleted_at=is.null` query, deduplicated and
  excluding circle members + current-list members. No new DB views.
- Leave-list PATCH is a direct `pgPatch('/list_members?list_id=eq.{id}&user_id=eq.{me}',
  {deleted_at: 'now()', deleted_by: '{me}'})` per
  `docs/data-model.md` line 655. Step 1's RLS already permits
  self-soft-delete.
- Update the `plans/0000_implementation_order.md` parenthetical for
  step 8 to reflect six overflow rows in their shipped order. The
  edit lands in this sub-plan, not the wrap-up phase, so the doc and
  the code change together.
- **Existing component tests must be updated in the same task** as
  the matching source change, per CLAUDE.md "Tests out of sync":
  - `ListsScreen.test.ts` — when the banner is added: assert the
    three banner states (not rendered at 0 pending; single-pending
    row with Decline/Accept; 2+ collapsed row with chevron) and the
    invites-state subscription updates the banner reactively after
    an accept/decline.
  - `ListOverflowSheet.test.ts` — when the two new rows ship: assert
    the six rows render in the documented order (Rename, Edit
    description, Manage members, View bin, Leave list, Delete list),
    that *Manage members* navigates to `/lists/[list_id]/members`,
    and that *Leave list* opens a confirm prompt before issuing the
    PATCH.
  - `SettingsScreen.test.ts` — when the Invites NavRow is swapped
    from the non-interactive `<div>` to a real `<NavRow
    href="/settings/invites">`: assert the row now navigates and
    that the count badge renders the inbox count from the
    `invitations.svelte.ts` module.
- Playwright e2e under `web/e2e/`:
  - `invites.spec.ts` — Alice sends invite to Bob via picker; Bob
    signs in, sees banner, accepts, lands in list; post-accept
    prompt offers to add Alice to circle.
  - `block.spec.ts` — Alice blocks Bob from his profile sheet
    (reached from Members screen); Bob's subsequent invite back to
    Alice surfaces the generic *"Couldn't send invite"*.
  - `privacy.spec.ts` — Alice changes policy to `nobody`; her inbox
    empties immediately (the 0801 cascade trigger fires); banner
    disappears.

**Steps:**
1. `git checkout -b 0803_invite_flow 0800_invites_circles_ui`
2. Invoke `/write-plan` to create `plans/0803_invite_flow/` with its
   three files. The plan must include phases for: (a)
   `invitations.svelte.ts` + Vitest, (b) `<InvitesBanner>` + Vitest
   + wired into `ListsScreen.svelte`, (c) `/settings/invites` route +
   `<InvitesInboxScreen>` + Vitest, including the post-accept circle
   prompt and the SettingsScreen Invites count badge, (d)
   `<InvitePickerSheet>` + Vitest, (e) `/lists/[list_id]/members` +
   `<MembersScreen>` + Vitest, (f) `ListOverflowSheet` extensions +
   Vitest, (g) Playwright `invites.spec.ts`, `block.spec.ts`,
   `privacy.spec.ts`, (h) the
   `plans/0000_implementation_order.md` parenthetical update.
3. Implement the sub-plan task by task.
4. Run `./scripts/check.sh --e2e` — must be green (e2e specs land in
   this sub-plan).
5. `git checkout 0800_invites_circles_ui && git merge --no-ff
   0803_invite_flow`

**Verify:** `./scripts/check.sh --e2e` green on
`0800_invites_circles_ui` after merge. Manual walkthrough:
sign in as `alice@example.test`, navigate to a list → Manage members
→ Add member → picker shows Bob in *People you share other lists
with* (or in *Your circle* if you've added him via 0801); tap Invite;
sign in as Bob; see banner *"Alice invited you to {List}"*; tap
Accept; post-accept prompt offers *"Add Alice to your circle?"*;
back to Alice; Settings → Privacy → switch to `nobody`; verify
Alice's banner disappears (cascade fired).

---

## Phase 4 — Wrap up

### [ ] 4.1 Final verification and merge to main

**Created:** 2026-05-28T12:02:33Z
**Completed:**

**Why:** Confirms the full step-8 UI layer is coherent end-to-end —
all three sub-branches merged, every test layer green, the
implementation-order box tickable — before it lands on `main`.

**Prerequisites:** Tasks 1.1, 2.1, and 3.1 all merged into
`0800_invites_circles_ui`.

**Decisions:**
- Run `./scripts/check.sh --e2e` to exercise both the unit / type-check
  layers and the Playwright invite/block/privacy flows. Step 8 ships
  the first e2e specs for invites; this is the verification gate.
- Tick step 8's checkbox in `plans/0000_implementation_order.md` as
  part of this commit. The overflow parenthetical was already updated
  in 0803; this commit only flips `8. [ ]` → `8. [x]`.
- No other doc updates expected. If the merged state diverges from
  `docs/invites.md` (e.g. a doc claim turned out wrong), file a small
  follow-up plan rather than wedging the doc edit into the wrap-up
  commit.

**Files:**
- `plans/0000_implementation_order.md` (modify)

**Steps:**
1. On `0800_invites_circles_ui`, run `./scripts/check.sh --e2e` —
   must be green.
2. Edit `plans/0000_implementation_order.md`: change `8. [ ]` to
   `8. [x]`.
3. Commit: `chore(plan): tick step 8 in implementation order`.
4. `git checkout main && git merge --no-ff 0800_invites_circles_ui`

**Verify:** `./scripts/check.sh --e2e` green on `main`. The five
RPCs from step 7 plus the two new triggers from 0801 plus the new
`invitations_delete` policy from 0802 are all callable / exercised
end-to-end by the Playwright specs.
