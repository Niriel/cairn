# Requirements: Invites + circles + blocks: UI layer

Step 8 of the master plan, and the orchestration parent for the three
sub-plans that build the UI on top of step 7's `relationships` and
`invitations` tables. This step turns the Tier-3 DB layer into screens
and sheets — Privacy, Circle, Blocked, the circle explainer, the
invites inbox + lists-screen banner, the invite picker, the profile
sheet, the Members screen — and adds two small DB additions that
`docs/invites.md` explicitly defers to step 8. No new RPCs; the five
shipped in step 7 carry the load.

## R1. Privacy settings screen

A reachable route at `/settings/privacy`, opened from a new **Privacy**
NavRow in Settings → People. Three sections:

1. **Who can invite you to lists** — a radio-style segmented control
   with three options (`everybody` / `circle` / `nobody`) bound to the
   caller's `user_settings.invite_policy`. Selecting an option PATCHes
   `user_settings`. While `circle` is selected, a small _"What's a
   circle?"_ link is visible; tapping it opens the circle explainer
   sheet (R4).
2. **People** — two NavRows: _Your circle_ (sub-line _"People you'll
   let invite you"_, count badge, navigates to R2) and _Blocked_
   (sub-line _"People who can never invite you"_, count badge,
   navigates to R3). Sub-line copy is verbatim from
   `design/cairn-invite-screens.jsx` `PrivacyScreen`.
3. **Privacy note** — the literal copy _"Your e-mail address is never
   shown to other people on Cairn — only your display name and
   avatar."_

Option copy is exactly as shipped in `design/cairn-invite-screens.jsx`
`PrivacyScreen`: _"Everybody"_ / _"Anyone with a Cairn account"_;
_"Your circle"_ / _"Only people in your circle"_; _"Nobody"_ / _"You
can still create lists and invite others"_.

**Cascade feedback.** After a successful PATCH of `invite_policy` to a
tighter value (`everybody → circle`, `everybody → nobody`,
`circle → nobody`), the screen refreshes `invitations.svelte.ts.inbox`
and computes `removed = prevCount - newCount`. When `removed > 0`,
the screen surfaces an inline note immediately below the segmented
control: _"{removed} pending invites have been declined to match your
new setting."_ (singular form _"1 pending invite has been declined…"_
when `removed == 1`). When `removed == 0` the note is suppressed.
Mirrors `docs/ui.md` § "Privacy screen" line 251 and gives the
server-side R11 cascade trigger a visible footprint.

## R2. Circle screen

A reachable route at `/settings/circles`, opened from the _Your circle_
NavRow on the Privacy screen. Layout, top to bottom:

- A short intro paragraph and a _"What's this?"_ link to the explainer
  (R4). Copy: *"When your privacy is set to *Your circle*, these are
  the only people who can invite you to a list."*
- A section labelled _"People in your circle · {N}"_ listing every
  user the caller has `status = 'circle'` for, each with an
  avatar, display name, an added-on date sub-line in the form
  _"added {DD MMM}"_ (e.g. _"added 12 Apr"_) when the row's
  `created_at` falls in the current calendar year, falling back to
  the full _"added {DD MMM YYYY}"_ form (per `docs/ui.md` "Dates")
  for older rows, and a **Remove** button.
  Remove deletes the `relationships` row outright (per
  `docs/invites.md`: unblock and remove-from-circle are both
  delete-the-row; there is no "set to neither" intermediate state).
- An **Add by e-mail** form, rendered as a dashed-border card per
  `design/cairn-invite-screens.jsx:384-407`: a mail-icon prefix, an
  e-mail input field, and a primary **Add** button (literal label —
  not "Submit" or "Send"). Below the input, a helper paragraph in
  stone text: _"They'll be added to your circle. If they have you
  blocked, the add still succeeds on your side — but their side stays
  untouched."_ Submit calls `add_circle_by_email`. On success the new
  member appears in the list. On the `'no such user'` raise, the form
  shows _"This e-mail isn't on Cairn — invite them to a list instead."_
  (the explicitly-helpful copy that `docs/invites.md` approves for
  this RPC because it's two levels deep in settings, not a public
  enumeration surface).

## R3. Blocked screen

A reachable route at `/settings/blocked`, opened from the _Blocked_
NavRow on the Privacy screen. Description text: _"People you've
blocked. They can't invite you to any list, regardless of your other
privacy settings."_ Each row shows the blocked user's avatar, display
name, a _"blocked {DD MMM}"_ sub-line (same compact format as R2's
Circle row, with the same current-year carve-out: _"blocked 12 Apr"_
when the relationship's `created_at` is in the current calendar year,
_"blocked 12 Apr 2025"_ for older rows), and an **Unblock** button.
Unblock deletes the `relationships` row (the prior `'circle'` state is
**not** restored — see `docs/invites.md` "Block always wins"). Empty
state: dashed-border card with a slash icon and _"You haven't blocked
anyone."_ This screen has **no add-by-something field** — new blocks
originate from the profile sheet (R5), never from this screen.

## R4. Circle explainer sheet

A bottom-sheet modal reachable from Privacy (R1) and Circle (R2). Title
_"What is a circle?"_. Body is the four-point explanation from
`design/cairn-invite-screens.jsx` `CircleExplainerSheet`:

1. _It's yours alone._
2. _It only governs invites coming to you._
3. _Adding by e-mail is two-way._
4. _To stop someone inviting you: block them._

A privacy note at the bottom (_"Cairn will never tell anyone whose
circle they're in. The list above is yours; you're the only one who
sees it."_) and a single **Got it** button to dismiss. The sheet uses
the existing `Sheet.svelte` primitive so system-back closes it via the
back-stack pattern.

## R5. Profile sheet

A bottom-sheet component `<ProfileSheet>` that opens on tapping any
other user — list-row member avatars, inbox row inviters, picker rows,
member-screen rows. Renders **only** avatar (large) and display name
(no e-mail, no shared-lists list, no bio — `docs/invites.md` "the
profile screen" is the spec). A coloured badge displays current
relationship status: _"IN YOUR CIRCLE"_ (sage) when in circle,
_"BLOCKED"_ (ember) when blocked, no badge otherwise. Two ActionRows,
state-driven:

- **Circle action.** Visible only when not blocked. "Add to your
  circle" _(with sub "Lets you accept invites from them")_ if not in
  circle → calls `add_circle_by_id`. "Remove from your circle" if in
  circle → `DELETE /relationships?user_id=eq.{me}&other_user_id=eq.{them}`.
- **Block action.** "Block {Name}" if not blocked → opens a confirm
  prompt _"Block {Name}? They won't be able to invite you to any
  list."_ → on confirm, `POST /relationships` (or PATCH the existing
  circle row if one exists) setting `status = 'blocked'`. "Unblock"
  if blocked → `DELETE /relationships?…`.
- **Cancel pending invite.** Visible only when the caller has a
  pending invite they sent to this user on a list they share → `DELETE
/invitations?id=eq.{id}`. Quiet, no confirmation, no notification to
  the invitee (per docs).

Tapping one's own avatar bounces to `/settings` (per `docs/invites.md`
§ "The profile screen" and `docs/ui.md` § "Profile screen (sheet)" —
the profile sheet is a screen for looking at _others_; the user's
own hub is Settings, from which Edit profile is one tap away). The
short-circuit happens in the tap handler before the sheet opens. The
sheet must never call any RPC that doesn't exist; block and unblock
are direct table writes gated by step 7's `relationships_*` policies.

## R6. Invites banner on Lists screen

A row rendered inside the Lists screen's scroll container, between
the AppTopBar and the _Your lists_ `SectionLabel` (per
`design/cairn-invite-screens.jsx:127`). The banner scrolls with the
list rows, not the viewport — it is **not** `position: fixed`. Three
states:

- **0 pending** — not rendered.
- **1 pending** — _"{Inviter} invited you to **{List name}**"_ with
  inline **Decline** (muted) and **Accept** (sage) buttons. Accept
  routes to the list; Decline silently dismisses.
- **2+ pending** — _"{N} pending invites"_ with chevron; tap opens
  the Invites inbox (R7).

The banner reflects state from the same reactive
`invitations.svelte.ts` module the inbox (R7) uses; an accept or
decline anywhere in the app updates the banner without a manual
refresh.

## R7. Invites inbox

A reachable route at `/settings/invites`, opened from a new **Invites**
NavRow in Settings → People (count badge when pending) and from the
multi-invite banner state (R6). Header subtitle: _"{N} pending"_.
Description: _"People who've invited you to their lists. Accept to
join, or decline to clear."_ Each row: inviter's avatar + name, "invited
you to" connector, list name, a relative timestamp, and `[Decline]
[Accept]` buttons (right is committal).

**Accept** calls `accept_invitation`, navigates to the list, and
shows a one-time-per-session **post-accept circle prompt**: _"You
accepted {Inviter}'s invite. Add {Inviter} to your circle?"_ with
`[Not now] [Add to circle]`. Confirming calls `add_circle_by_id`. The
"one-time" gating is session-scoped (in-memory SvelteSet of inviter
UIDs), not persisted to `user_settings`.

**Inviter capture is the client's responsibility.** `accept_invitation`
hard-deletes the `invitations` row inside the same transaction (see
`db/migrations/0009_invitations.sql:253-258`), so after the RPC
returns there is no row to look up — and the inbox row the user
tapped is also removed from the in-memory list. The
`invitations.svelte.ts.acceptInvitation(id)` action therefore reads
`{inviterUid, inviterName}` from the inbox entry **before** calling
the RPC, stashes it in the SvelteSet payload, and uses it both to
populate the prompt copy and to issue `add_circle_by_id(inviterUid)`
when the user taps _Add to circle_. The banner-state Accept path
(R6, single-pending) follows the same capture-then-call sequence.

**Decline** calls `decline_invitation`. The row disappears silently.
No confirmation, no inviter notification.

Empty state: _"No pending invites."_

## R8. Invite picker sheet

A bottom-sheet `<InvitePickerSheet>` opened from the Members screen's
_Add member_ button (R9). Title _"Add someone"_, subtitle _"Tap to
invite, or type an e-mail below"_. Three sections, top to bottom:

1. **Your circle** — the caller's circle members, excluding current
   list members. Each row: avatar + display name + **Invite** button.
   Tap calls `send_invitation(p_list_id, p_user_id := …)`.
2. **People you share other lists with** — co-members from the
   caller's other lists, deduplicated and excluding section 1 and
   current list members. Same row shape.
3. **By e-mail** — text field at the bottom with **Send**. Submit
   calls `send_invitation(p_list_id, p_email := …)`.

In every path: a `null` return from `send_invitation` shows a generic
**"Couldn't send invite"** toast. The typed email is **never echoed
back** in error messages (anti-enumeration contract from
`docs/invites.md` — same posture as the magic-link UI from 0302).
Successful sends show a per-row check mark plus a generic _"Invite
sent"_ toast. Sections 1 and 2 show **no e-mail addresses** anywhere
on rows.

## R9. Members screen

A reachable route at `/lists/[list_id]/members`, opened from the new
_Manage members_ row in the list overflow menu (R10). Header title
_"Members"_ with the list name as subtitle. Section label
_"{N} people on this list"_. Member rows: avatar + display name + a
sub-line. The sub-line distinguishes _the user who created the list_
from _everyone else who joined later_; the discriminator is
`lists.created_by = list_members.user_id` (i.e. _"this row's user is
the user that created the list itself"_). Concretely: _"You · created
the list"_ when the row is the caller's own **and**
`lists.created_by = uid()`; _"Created the list"_ for any other row
whose `lists.created_by = list_members.user_id`; and the relative
_"Joined {timeAgo}"_ (e.g. _"Joined 3 days ago"_, using
`$lib/shared/model/time-ago` on `list_members.created_at`) for
everyone else, **including** the caller's own row when they joined
via accept rather than create.

**Why not `list_members.created_by`?** `tg_set_attribution_list_members`
stamps `created_by = public.uid()` on every `list_members` insert —
including the row that `accept_invitation` inserts for the invitee
(the RPC is `SECURITY DEFINER`, but `public.uid()` still resolves to
the JWT caller). So `list_members.created_by = list_members.user_id`
holds for every row, and a rule keyed on that column can't
discriminate. `lists.created_by` (set on the original `create_list`
insert) is the column that actually carries _"who created the list"_.
Members-screen queries therefore need to fetch `lists.created_by`
alongside the `list_members` rows (a single embedded select via
PostgREST's `?select=…,lists(created_by)` is enough).

**The sub-line deliberately does not name an inviter.** Surfacing
the join date is the closest faithful rendering of the data we keep
about a non-creator member — `accept_invitation` doesn't preserve
the inviter UID on the new `list_members` row, and the `invitations`
row is hard-deleted in the same transaction (see
`db/migrations/0009_invitations.sql:253-258`). The "Added by Alice" copy in
`design/cairn-screens.jsx:1039-1040` is a design-canvas drift from
the schema; treat the join-date sub-line as the canonical spec for
step 8. (A later step may re-add inviter attribution by widening
`accept_invitation` to write `inv.created_by` into `list_members`,
but that is out of scope here; see Non-requirements.) Tapping a
non-self row opens `<ProfileSheet>` for that user (R5). At the
bottom, an **Add member** dashed-border button opens the invite
picker (R8).

## R10. List overflow extensions

Update `web/src/lib/list/components/ListOverflowSheet.svelte` to six
rows in this order:

1. Rename list (existing)
2. Edit description (existing)
3. **Manage members** (new) — navigates to `/lists/[list_id]/members`
4. View bin (existing — copy unchanged)
5. **Leave list** (new) — confirmation prompt _"Leave {List}? You'll
   have to be re-invited to rejoin."_ → PATCH the caller's own
   `list_members` row setting `deleted_at = now()`, per
   `docs/data-model.md` line 655 (self-leave is permitted by step 1's
   existing RLS). The `tg_set_attribution_list_members` soft-delete
   branch stamps `deleted_by = public.uid()` automatically (see
   `docs/data-model.md:634`), so the PATCH body sends `deleted_at`
   alone. On success, navigate back to `/lists`.
6. Delete list (existing, ember tone)

The Lists-overview parenthetical in
`plans/0000_implementation_order.md` ("rename/edit/leave/delete/view-trash")
is updated as part of the wrap-up phase to reflect the six-row reality.

**Known design-canvas drift.** `design/cairn-screens.jsx:991-1009`
renders the overflow sheet with a _seventh_ row, _"Invite a friend"_,
between _Edit description_ and _Manage members_. Step 8 deliberately
omits it: invitation flow now lives behind _Manage members_ → invite
picker (R8, R9), so a top-level _Invite a friend_ row would be a
second path to the same destination. Treat the six-row order above
as the canonical spec; the design canvas should be revised in a
future design pass to drop the dangling row.

## R11. Policy-change cascade trigger

A `BEFORE UPDATE OF invite_policy ON user_settings` trigger (or AFTER;
the lookup must see the _new_ policy, so AFTER is fine) that
hard-deletes non-matching pending invitations whenever the caller's
policy tightens:

- `new.invite_policy = 'nobody'` →
  `DELETE FROM invitations WHERE target_user_id = new.id`
- `new.invite_policy = 'circle'` →
  `DELETE FROM invitations WHERE target_user_id = new.id AND NOT EXISTS (SELECT 1 FROM relationships WHERE user_id = new.id AND other_user_id = invitations.created_by AND status = 'circle')`
- `new.invite_policy = 'everybody'` → no-op

Loosening the policy never resurrects previously-declined invitations
— the cascade is one-way. pgTAP covers all three transitions positive
and negative (including a "no resurrection" assertion for the loosen
path).

## R12. 20-invite FIFO cap trigger

A `BEFORE INSERT ON invitations FOR EACH ROW` trigger, gated
`WHEN (new.target_user_id IS NOT NULL)`, that — when 20 or more
pending rows for the same `target_user_id` already exist before the
insert (i.e. the insert about to land would be the 21st) — hard-deletes
the oldest (by `created_at`) so the new row can land at a steady-state
count of 20. The trigger body is therefore `IF (SELECT count(*) FROM
invitations WHERE target_user_id = new.target_user_id) >= 20 THEN
DELETE ... ORDER BY created_at LIMIT 1`. Cap is per-target (per
registered Cairn user), not global.

**`target_email`-only invitations are deliberately uncapped.** An
email-keyed pending row exists only because the addressee doesn't yet
have a Cairn account; the row is converted to a `target_user_id`
invitation at sign-up (see `docs/invites.md` § "Email path"). Capping
the email-keyed surface would let an attacker who knows a real e-mail
address evict already-pending sign-up nudges for that address by
flooding adjacent typos. Once the addressee signs up, the
`target_user_id` cap takes over for the converted row. The doc edit
that records this carve-out lands in the Phase 0 of PLAN.md.

pgTAP asserts: the 1st through 20th `target_user_id` inserts all
succeed and leave the count climbing from 1 to 20 (no eviction); the
21st `target_user_id` insert succeeds with the oldest pending row
for that target now gone (steady-state count stays at 20); an
unrelated target's pending invites are untouched; and a 21st
`target_email`-only insert to the same address is **not** capped.

## R13. Anti-enumeration UX contract

Every `send_invitation` failure surfaces the literal toast **"Couldn't
send invite"** — same string for block, policy rejection, unregistered
email, malformed email, unknown user id. The typed email is **never
echoed** in any error string. Two carve-outs:

- **Self-invite.** Surfaces as **"You can't invite yourself."** No
  privacy at stake (the user already knows their own e-mail), and a
  generic toast here would be user-hostile.
- **Already a member.** The shipped RPC
  (`db/migrations/0009_invitations.sql:131-138`) raises
  `'already a member'` when the resolved target is a live member of
  the list. Surfaces as **"They're already on this list."**
  `docs/invites.md` step 4 explicitly calls for a clear error here,
  and there's no enumeration risk: the caller is themselves a list
  member (step 1 of the RPC's check sequence enforces this), so the
  membership of the typed-in address is already visible to them on
  the Members screen.

`invitations.svelte.ts.sendInvitation` maps the RPC's two `RAISE`
codes to these strings and everything else to the generic toast.
This mirrors the magic-link anti-enumeration posture shipped in 0302
and is the same shape `docs/invites.md` calls "one screen, multiple
backend outcomes, indistinguishable to the user."

## R14. Settings _People_ section

`web/src/lib/settings/components/SettingsScreen.svelte` grows a new
section labelled _People_ with two NavRows: **Invites** (badge
showing pending count when > 0; sub-line _"{N} pending"_ when
non-zero, _"No pending invites"_ when zero) and **Privacy** (sub-line
_"Who can invite you · circle · blocked"_). The People section sits
directly below the profile chip, **above** _Appearance_ — matching
`design/cairn-screens.jsx:1135-1143`, where Settings reads
_Profile chip → People → Appearance → Text size → Privacy & data →
Recovery → …_.

## R15. State and HTTP plumbing

Two new reactive Svelte modules carry the cross-screen state, both in
the `.svelte.ts` runes-aware form:

- `web/src/lib/privacy/state/relationships.svelte.ts` — `circle`,
  `blocked`, `loadRelationships()`, `addCircleByEmail(email)`,
  `addCircleById(id)`, `removeFromCircle(id)`, `block(id)`, `unblock(id)`.
- `web/src/lib/invite/state/invitations.svelte.ts` — `inbox`,
  `loadInbox()`, `sendInvitation(payload)`, `acceptInvitation(id)`,
  `declineInvitation(id)`, `cancelInvitation(id)`, plus a `sent`
  collection populated by `loadSent()` and a derived helper
  `pendingInviteFor(listId, userId): string | null` that returns the
  invitation id (or `null`) for a pending invite the caller sent on
  the given list to the given user. `loadSent()` issues a single
  `GET /invitations?created_by=eq.<my-uid>` (per `docs/data-model.md`
  § "What the app sees"). The helper is what `<ProfileSheet>` consumes
  to decide whether to render the _Cancel pending invite_ row (R5),
  and what the Members screen calls into when it opens the sheet for
  a specific list-member. Consumers call `loadSent()` once at mount
  and read `pendingInviteFor(...)` reactively from there.

Both modules use the existing `pgGet`/`pgPost`/`pgPatch`/`pgDelete`
wrappers from `web/src/lib/shared/http/postgrest.ts`. No new HTTP
primitives.

## R16. Test coverage

Per `CLAUDE.md` "Tests and quality (non-negotiable)":

- Every new component under `web/src/lib/` ships with a Vitest test
  asserting user-visible behaviour.
- Every new user-visible flow ships with a Playwright e2e spec under
  `web/e2e/` — at minimum `invites.spec.ts` (send → accept), `block.spec.ts`
  (block from profile → blocked invite fails generically), and
  `privacy.spec.ts` (tighten policy → cascade empties inbox).
- The two new DB triggers (R11, R12) ship with full pgTAP coverage in
  `db/tests/invite_cascades.sql`, both positive and negative cases.

## Non-requirements (explicitly excluded)

- **New RPCs.** All UI calls use the five RPCs from step 7 plus direct
  table reads/writes already permitted by step 7's RLS. The only
  schema additions are the two triggers in R11 and R12.
- **Push notifications on invite arrival.** Documented as v1.x in
  `docs/invites.md` "Open questions".
- **Invite expiry (90-day server cleanup).** Same.
- **Bulk multi-select in the picker.** Same.
- **"Lists you both belong to" panel on the profile sheet.** Profile
  stays minimal in v1 per `docs/invites.md` "The profile screen".
- **Magic-link e-mail to unregistered invitees.** The step-7 DB layer
  already accepts email-keyed `invitations` rows; _sending_ the
  invitation-signup e-mail is wired alongside step 14's prod rollout
  and the GoTrue template work.
- **Empty-list cleanup when the last member leaves.** Out of scope;
  may become a follow-up refinement if it matters.
- **Persisting the "seen post-accept circle prompt" flag.** The prompt
  is session-scoped; a re-signed-in user may see it again. No
  `user_settings.has_seen_circle_prompt` column.
- **DB constraint preventing direct `PATCH /relationships` from
  flipping `blocked → circle`.** The "unblock = delete the row" rule
  is a UI convention enforced in 0801 (the UI offers Unblock as
  delete, not as a status flip). The DB permits both directions per
  step 7's non-requirement note.
- **Inviter attribution on `list_members`.** The Members screen
  sub-line (R9) renders join date rather than _"Added by Alice"_
  because `accept_invitation` does not preserve the inviter UID on
  the new `list_members` row. Re-adding inviter attribution would
  require either widening `accept_invitation` to write
  `inv.created_by` into `list_members.created_by` (and loosening the
  trigger's spoof-guard gate to accept the function-driven write) or
  adding an `invited_by` column. Both are real options, but neither
  belongs in step 8 — step 8's scope is the UI on top of the step-7
  schema, not a schema extension. The design canvas's _"Added by
  Alice"_ copy is recorded here as a known drift, to be revisited
  when (and if) a later plan chooses one of the two paths.
