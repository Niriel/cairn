# Requirements: Privacy + Circle + Blocked screens + invite-policy and FIFO triggers

The first sub-plan of step 8: the settings-side surfaces that let a
user shape who can invite them (Privacy), curate their circle (Circle),
and curate their blocks (Blocked), plus the two DB triggers that
`docs/invites.md` defers to step 8 — policy-change cascade (R7) and
20-invite FIFO cap (R8). These are the screens a user reaches first
when deciding their invite posture, and they introduce the
`relationships.svelte.ts` state module that 0802 (`<ProfileSheet>`)
and 0803 (invite picker) both consume. Cuts no in-app dependency on
the inbox or picker surfaces that land in 0803 — the cascade-feedback
note's inbox count is fetched inline rather than introducing
`invitations.svelte.ts` early (see R1).

## R1. Privacy settings screen

The screen reads and writes the caller's `invite_policy` via a new
`web/src/lib/privacy/state/user-settings.svelte.ts` reactive module
(see R10 below) rather than calling PostgREST directly — keeping the
HTTP boundary in one place and giving the cascade-feedback note a
single coherent fetch shape. The module exposes `invitePolicy`
(reactive), `loadUserSettings()`, and
`setInvitePolicy(value): Promise<{prevCount, newCount}>` that wraps
the count fetch / PATCH / count fetch sequence specified below.

A reachable route at `/settings/privacy`, opened from a new **Privacy**
NavRow in the Settings _People_ section (R5). Three sections:

1. **Who can invite you to lists** — a radio-style segmented control
   with three options (`everybody` / `circle` / `nobody`) bound to the
   caller's `user_settings.invite_policy`. Selecting an option PATCHes
   `user_settings`. While `circle` is selected, a small _"What's a
   circle?"_ link is visible; tapping it opens the circle explainer
   sheet (R4). Option copy is verbatim from
   `design/cairn-invite-screens.jsx` `PrivacyScreen`:
   _"Everybody"_ / _"Anyone with a Cairn account"_;
   _"Your circle"_ / _"Only people in your circle"_;
   _"Nobody"_ / _"You can still create lists and invite others"_.
2. **People** — two NavRows: _Your circle_ (sub-line _"People you'll
   let invite you"_, count badge, navigates to R2) and _Blocked_
   (sub-line _"People who can never invite you"_, count badge,
   navigates to R3). Counts are read from the `relationships.svelte.ts`
   module (R6).
3. **Privacy note** — the literal copy _"Your e-mail address is never
   shown to other people on Cairn — only your display name and
   avatar."_

**Loading state.** Until `userSettings.loaded === true`, the
segmented control renders with no option visually selected
(indeterminate — neither radio dot filled) and the three options
are non-interactive; the _"What's a circle?"_ link is hidden. Once
`loaded === true`, the matching option highlights per
`invitePolicy` and the control accepts taps. Same gate for the two
NavRows in section 2: until `relationships.loaded === true`, the
count badges are hidden (not rendered as `0`, which would mislead
the user into thinking they have an empty circle / blocked list).

**Failure handling.** If `setInvitePolicy(next)` rejects, the
screen catches the error, reverts the segmented-control selection
to its pre-tap value, and shows a generic _"Couldn't update
privacy setting"_ snackbar via the existing `Snackbar` primitive.
The cascade-feedback note (below) is not rendered on failure.

**Cascade-feedback note.** After a successful PATCH of `invite_policy`
to a tighter value (`everybody → circle`, `everybody → nobody`,
`circle → nobody`), the screen issues a count-only fetch
(`GET /invitations?target_user_id=eq.<me>&select=id` is sufficient;
PostgREST `Prefer: count=exact` on a `HEAD` request also works) both
_before_ the PATCH (`prevCount`) and _after_ it (`newCount`),
computes `removed = prevCount - newCount`, and renders an inline note
immediately below the segmented control: _"{removed} pending invites
have been declined to match your new setting."_ (singular form
_"1 pending invite has been declined to match your new setting."_
when `removed == 1`). The note is suppressed when `removed == 0` or
when the PATCH is a loosen (`circle → everybody`, `nobody → circle`,
`nobody → everybody`) — loosen never resurrects invites, so the
count never drops on a loosen. Mirrors `docs/ui.md` § "Privacy
screen" and gives the server-side R7 cascade trigger a visible
footprint. The inline-fetch shape (rather than reading from a state
module) is a deliberate scope cut: introducing `invitations.svelte.ts`
piecemeal would mean 0801 owns the inbox half and 0803 extends it;
deferring the file entirely to 0803 (where the inbox UI lives) keeps
the module's introduction co-located with its primary consumer.

## R2. Circle screen

A reachable route at `/settings/circles`, opened from the _Your circle_
NavRow on the Privacy screen. Until `relationships.loaded === true`,
the section label _"People in your circle · {N}"_ and its list are
not rendered (the screen shows only the intro paragraph and the
add-by-email card during load — no flash of an empty-list state).
Layout, top to bottom:

- A short intro paragraph and a _"What's this?"_ link to the explainer
  (R4). Copy: *"When your privacy is set to *Your circle*, these are
  the only people who can invite you to a list."*
- A section labelled _"People in your circle · {N}"_ listing every
  user the caller has `status = 'circle'` for, each with an avatar,
  display name, an added-on date sub-line in the form _"added {DD MMM}"_
  (e.g. _"added 12 Apr"_) when the row's `created_at` falls in the
  current calendar year, falling back to the full _"added {DD MMM YYYY}"_
  form (per `docs/ui.md` "Dates") for older rows, and a **Remove**
  button. Remove deletes the `relationships` row outright (per
  `docs/invites.md`: unblock and remove-from-circle are both
  delete-the-row; there is no "set to neither" intermediate state).
  No confirmation prompt — per `docs/ui.md` § "Circle screen" the
  Remove action is quiet, mirroring _Add to circle_.
- An **Add by e-mail** form, rendered as a dashed-border card per
  `design/cairn-invite-screens.jsx:384-407`: a mail-icon prefix, an
  e-mail input field, and a primary **Add** button (literal label —
  not "Submit" or "Send"). Below the input, a helper paragraph in
  stone text: _"They'll be added to your circle. If they have you
  blocked, the add still succeeds on your side — but their side stays
  untouched."_ Submit calls `add_circle_by_email`. Three outcomes:
  - **Success** — the new member appears in the list, the input is
    cleared.
  - **`'no such user'` raise** — the form shows the inline error
    _"This e-mail isn't on Cairn — invite them to a list instead."_
    (the explicitly-helpful copy that `docs/invites.md` approves for
    this RPC because it's two levels deep in settings, not a public
    enumeration surface).
  - **`'cannot add yourself'` raise** — the form shows the inline
    error _"That's your own e-mail address."_ Honest carve-out
    parallel to `send_invitation`'s `'self-invite'` (the address
    is the caller's own, so there's no privacy at stake).

## R3. Blocked screen

A reachable route at `/settings/blocked`, opened from the _Blocked_
NavRow on the Privacy screen. The dashed-border empty-state card
renders only when `relationships.loaded === true &&
relationships.blocked.length === 0`; while `loaded === false` the
screen shows the description text alone (no empty card, no list)
to avoid a flash of _"You haven't blocked anyone."_ before the
fetch resolves. Description text: _"People you've
blocked. They can't invite you to any list, regardless of your other
privacy settings."_ Each row shows the blocked user's avatar, display
name, a _"blocked {DD MMM}"_ sub-line (same compact format as R2's
Circle row, with the same current-year carve-out: _"blocked 12 Apr"_
when the relationship's `created_at` is in the current calendar year,
_"blocked 12 Apr 2025"_ for older rows), and an **Unblock** button.
Unblock deletes the `relationships` row (the prior `'circle'` state
is **not** restored — see `docs/invites.md` "Block always wins").
Empty state: dashed-border card with a slash icon and _"You haven't
blocked anyone."_ This screen has **no add-by-something field** — new
blocks originate from the profile sheet (0802's R5), never from this
screen.

## R4. Circle explainer sheet

A bottom-sheet modal `<CircleExplainerSheet>` reachable from Privacy
(R1) and Circle (R2). Title _"What is a circle?"_. A lead-in
paragraph directly under the title:

> Your circle is a private list of people you'll let invite you to
> lists, when your privacy is set to _Your circle_.

Then the four-point explanation (verbatim copy from
`design/cairn-invite-screens.jsx:857–871`'s `ExplainerPoint` calls);
each point has a bold title and a body paragraph:

1. **_It's yours alone._** Bob doesn't see whether they're in your
   circle. You don't see whose circle you're in. Each person manages
   their own.
2. **_It only governs invites coming to you._** It does not affect
   your ability to invite anyone. If Bob's policy is also _Your
   circle_, what matters for inviting Bob is whether _you_ are in
   _their_ circle — not the other way around.
3. **_Adding by e-mail is two-way._** If you add Bob's e-mail here,
   you go on their circle too — unless they've blocked you, in
   which case only your side is updated. Either of you can remove
   the other at any time.
4. **_To stop someone inviting you: block them._** The block always
   wins — it overrides every circle and policy on either side.

A privacy note at the bottom (_"Cairn will never tell anyone whose
circle they're in. The list above is yours; you're the only one who
sees it."_) and a single **Got it** button to dismiss. The sheet uses
the existing `Sheet.svelte` primitive so system-back closes it via
the back-stack pattern.

## R5. Settings _People_ section scaffolding

`web/src/lib/settings/components/SettingsScreen.svelte` grows a new
section labelled _People_ with two rows, placed **above** the
Appearance section (directly below the profile chip — matching
`design/cairn-screens.jsx:1135-1143`):

1. **Invites** — rendered as a **non-interactive `<div>`** styled to
   match the existing `.nav-row` blocks. No `<button>`, no `<a>`, no
   `onclick`, no `href`. `cursor: default`. Sub-line is the literal
   placeholder _"No pending invites"_. No badge. The non-interactive
   shape is deliberate: 0803 swaps this `<div>` for a real
   `<button class="nav-row" onclick={goto(resolve('/settings/invites'))}>`
   in the same commit that ships the `/settings/invites` route file,
   so `svelte-check`'s typed-routes pass only ever sees a valid
   combination.
2. **Privacy** — rendered as a live `<button class="nav-row">` that
   navigates to `/settings/privacy` via `goto(resolve('/settings/privacy'))`.
   Sub-line: _"Who can invite you · circle · blocked"_.

`SettingsScreen.test.ts` is updated in the same task to assert the
new section's placement (between profile chip and Appearance), the
two rows' presence and copy, the Invites row's non-interactive shape
(no `<button>`, no `<a>`), and the Privacy row's navigation target.

## R6. Relationships state module

A reactive Svelte module
`web/src/lib/privacy/state/relationships.svelte.ts` exposes:

- `circle: CircleEntry[]` — reactive array of `{ otherUserId,
displayName, avatarVersion, createdAt }` for rows with
  `status = 'circle'`.
- `blocked: BlockedEntry[]` — same shape, for rows with
  `status = 'blocked'`.
- `loadRelationships(): Promise<void>` — fetches
  `GET /relationships?user_id=eq.<my-uid>&select=other_user_id,status,created_at,profiles!other_user_id(display_name,avatar_version)`
  and populates both arrays.
- `addCircleByEmail(email: string): Promise<{ok: true} | {ok: false, reason: 'no-such-user' | 'self' | 'unknown'}>` —
  calls `POST /rpc/add_circle_by_email` and either appends to
  `circle` or maps the RPC's raises. Match each on
  `(err.code === 'P0001' && err.message === '<exact text>')`
  rather than message-only so a future SQL reword forces the
  client to update in lockstep:
  - `'no such user'` → `{ok: false, reason: 'no-such-user'}`
    (anti-enumeration carve-out approved at
    `docs/invites.md` § "Why `add_circle_by_email` is allowed to
    raise on an unregistered address").
  - `'cannot add yourself'` → `{ok: false, reason: 'self'}` —
    self-add isn't a privacy concern (the address is the
    caller's own), so honesty wins, parallel to the
    `'self-invite'` carve-out on `send_invitation`.
  - Anything else → `{ok: false, reason: 'unknown'}`.
- `addCircleById(otherUserId: string): Promise<void>` — calls
  `POST /rpc/add_circle_by_id` and appends to `circle` on success.
  On failure (the RPC can `raise 'no such user'` or `raise 'cannot
add yourself'` — see `docs/invites.md` § "The `add_circle_by_id`
  function") the method **re-throws the `ApiError`**; the caller
  can branch on `err.code === 'P0001'` and `err.message`. Mirrors
  the raise-shape `addCircleByEmail` already maps, but without the
  discriminated-union wrapper because the only callers in this
  sub-plan are the state module's own consumers downstream (0802's
  `<ProfileSheet>` and 0803's post-accept circle prompt).
- `removeFromCircle(otherUserId: string): Promise<void>` —
  `DELETE /relationships?user_id=eq.<me>&other_user_id=eq.<them>` and
  removes from `circle`.
- `block(otherUserId: string): Promise<void>` — upserts a `blocked`
  row via `POST /relationships` with `Prefer:
resolution=merge-duplicates`; on success, removes the user from
  `circle` (if present — the row's status flipped server-side) and
  appends to `blocked`.
- `unblock(otherUserId: string): Promise<void>` —
  `DELETE /relationships?user_id=eq.<me>&other_user_id=eq.<them>` and
  removes from `blocked`. Prior `'circle'` state is **not** restored
  (per `docs/invites.md` "Block always wins"); the row stays gone.

All methods use the existing `pgGet`/`pgPost`/`pgPatch`/`pgDelete`
wrappers from `web/src/lib/shared/http/postgrest.ts`. No new HTTP
primitives. The module re-fetches via `loadRelationships()` rather
than maintaining cross-screen consistency by hand — every screen
calls `loadRelationships()` on mount.

## R10. User-settings state module

A reactive Svelte module
`web/src/lib/privacy/state/user-settings.svelte.ts` exposes:

- `invitePolicy: 'everybody' | 'circle' | 'nobody' | null` —
  reactive copy of the caller's `user_settings.invite_policy`;
  `null` until `loadUserSettings()` resolves.
- `loaded: boolean` — `true` after the first successful
  `loadUserSettings()`.
- `loadUserSettings(): Promise<void>` — fetches
  `GET /user_settings?id=eq.<my-uid>&select=invite_policy` and
  populates `invitePolicy`. RLS scopes the result to the caller's
  own row.
- `setInvitePolicy(next): Promise<{ prevCount: number, newCount: number, tightened: boolean }>` —
  performs the three-step sequence the cascade-feedback note
  (R1) needs:
  1. Fetches the current inbox count via
     `pgGet('/invitations?target_user_id=eq.<my-uid>&select=id').length`.
  2. PATCHes
     `/user_settings?id=eq.<my-uid>` with `{ invite_policy: next }`.
  3. Fetches the inbox count a second time, post-cascade.
     Returns the two counts plus a `tightened` boolean computed from
     the ordinal `{ everybody: 0, circle: 1, nobody: 2 }`
     (`tightened = newOrd > oldOrd`). PrivacyScreen reads the result
     shape directly to render (or suppress) the feedback note. The
     module itself is unaware of the message copy; only the call shape
     lives here.

  **On failure** (any of the three HTTP calls reject), the method
  **re-throws the underlying `ApiError`** without mutating
  `invitePolicy`, leaving the reactive field at its pre-call value
  so PrivacyScreen can revert any optimistic UI and surface a
  generic _"Couldn't update privacy setting"_ snackbar (see R1).

The module re-uses `pgGet` / `pgPatch` from
`web/src/lib/shared/http/postgrest.ts` and is mocked by sibling
consumers via `web/src/lib/privacy/state/__mocks__/user-settings.svelte.ts`
(same pattern as `relationships.svelte.ts` in R6).

The pre-existing `web/src/lib/shared/state/profile.svelte.ts`
deliberately does _not_ grow an `invitePolicy` field — `profile.*`
holds cross-user-renderable identity (uid / displayName /
avatarVersion), while `invitePolicy` lives on the owner-only
`user_settings` table. Mixing the two state shapes would muddle the
public/private split that `docs/data-model.md` § "Why `profiles` and
`user_settings` are split" makes structural.

## R7. Policy-change cascade trigger

An `AFTER UPDATE OF invite_policy ON user_settings FOR EACH ROW WHEN
(new.invite_policy IS DISTINCT FROM old.invite_policy)` trigger
`t40_apply_invite_policy_cascade` that hard-deletes non-matching
pending invitations whenever the caller's policy tightens:

- `new.invite_policy = 'nobody'` →
  `DELETE FROM invitations WHERE target_user_id = new.id`
- `new.invite_policy = 'circle'` →
  `DELETE FROM invitations WHERE target_user_id = new.id AND NOT
EXISTS (SELECT 1 FROM relationships WHERE user_id = new.id AND
other_user_id = invitations.created_by AND status = 'circle')`
- `new.invite_policy = 'everybody'` → no-op (explicit `RETURN NEW;`)

Function body is `LANGUAGE plpgsql SECURITY DEFINER SET search_path =
public`. Loosening the policy never resurrects previously-declined
invitations — the cascade is one-way. The `t40_*` slot matches the
documented AFTER-trigger slot in `docs/data-model.md` § "Triggers",
parallel to `t40_block_declines_invitations` on `relationships`
(`db/migrations/0009_invitations.sql:322`). Coexists with the
existing `t20_set_modified_at` BEFORE-UPDATE trigger on the same
column (`db/migrations/0004_domain_schema.sql:558-560`) — `t20_*`
fires first (BEFORE), then the UPDATE lands, then `t40_*` fires
(AFTER) and reads `new.invite_policy`.

pgTAP covers all three transitions positive and negative, including
a "no resurrection" assertion for the loosen path.

## R8. 20-invite FIFO cap trigger

A `BEFORE INSERT ON invitations FOR EACH ROW WHEN
(new.target_user_id IS NOT NULL)` trigger `t30_enforce_fifo_cap`
that — when 20 or more pending rows for the same `target_user_id`
already exist before the insert (i.e. the insert about to land would
be the 21st) — hard-deletes the oldest (by `created_at`) so the new
row can land at a steady-state count of 20:

```sql
IF (SELECT count(*) FROM invitations WHERE target_user_id =
new.target_user_id) >= 20 THEN
  DELETE FROM invitations WHERE id = (
    SELECT id FROM invitations WHERE target_user_id =
    new.target_user_id ORDER BY created_at LIMIT 1);
END IF;
```

The 20th insert is therefore **uncapped** (count goes 19 → 20, no
eviction); the 21st insert evicts the oldest. Cap is per-target (per
registered Cairn user), not global. Function body is `LANGUAGE
plpgsql SECURITY DEFINER SET search_path = public`. The `t30_*` slot
is the reserved future-BEFORE slot per `docs/data-model.md:618`;
`t10_*` is reserved for per-table attribution triggers and is not
reused here.

**`target_email`-only invitations are deliberately uncapped.** The
`WHEN (new.target_user_id IS NOT NULL)` gate exempts them. An
email-keyed pending row exists only because the addressee doesn't
yet have a Cairn account; the row is converted to a `target_user_id`
invitation at sign-up (see `docs/invites.md` § "Email path").
Capping the email-keyed surface would let an attacker who knows a
real e-mail address evict already-pending sign-up nudges for that
address by flooding adjacent typos. Once the addressee signs up, the
`target_user_id` cap takes over for the converted row. The doc edit
that records this carve-out already landed in the parent plan's
Phase 0 (`docs/invites.md` § "Pending-invite cap").

pgTAP asserts: the 1st through 20th `target_user_id` inserts all
succeed and leave the count climbing from 1 to 20 (no eviction); the
21st `target_user_id` insert succeeds with the oldest pending row
for that target now gone (steady-state count stays at 20); an
unrelated target's pending invites are untouched; and a 21st
`target_email`-only insert to the same address is **not** capped.

## R9. Test coverage

Per `CLAUDE.md` "Tests and quality (non-negotiable)":

- The two new DB triggers (R7, R8) ship with full pgTAP coverage in
  `db/tests/invite_cascades.sql`, both positive and negative cases.
- `db/tests/schema_shape.sql` is extended with row-count assertions
  for the two new triggers (one extra row on `user_settings`, one
  extra row on `invitations`).
- Every new Svelte component (`PrivacyScreen`, `CircleScreen`,
  `BlockedScreen`, `CircleExplainerSheet`) ships with a co-located
  Vitest test under the same directory asserting user-visible
  behaviour (option selection, navigation, error copy, empty state).
- `relationships.svelte.ts` ships with a Vitest test exercising
  every method and the empty/populated edge cases.
- The three new SvelteKit routes (`/settings/privacy`,
  `/settings/circles`, `/settings/blocked`) ship with co-located
  `page.test.ts` smoke tests (no `+` prefix per
  `docs/frontend-layout.md` "Filename conventions") that assert the
  matching component renders.
- `SettingsScreen.test.ts` is updated in the same task that ships
  the _People_ section (R5).
- No new Playwright e2e specs land in this sub-plan — they land in
  0803 alongside the invite-flow surfaces that complete the user
  journey. The pgTAP + Vitest layers cover the surfaces this sub-plan
  ships.

## Non-requirements (explicitly excluded)

- **`invitations.svelte.ts` state module.** Deferred to 0803, where
  the inbox UI that consumes it lands. The 0801 Privacy screen's
  cascade-feedback note uses an inline `GET /invitations?…&select=id`
  count fetch rather than a state module subscription — single-use,
  no cross-screen reactivity needed.
- **`<ProfileSheet>` component.** Lands in 0802. The Circle and
  Blocked screen rows do not tap-open a profile sheet in this
  sub-plan; the Remove and Unblock buttons are the only per-row
  actions. (A later sub-plan or follow-up may wire the row tap to
  open `<ProfileSheet>` for read-only viewing, but it's not
  required by this plan.)
- **Inbox count badge on the Settings → Invites row.** The row is
  scaffolded with the placeholder sub-line _"No pending invites"_
  and no badge; 0803's R14 task swaps the row to a live NavRow
  with the inbox count.
- **A `block_user` RPC.** Step 7's `relationships_insert` /
  `relationships_update` / `relationships_delete` policies are
  already gated on `user_id = public.uid()`, which is exactly the
  block/unblock semantics. The state module's `block` and
  `unblock` are direct table writes.
- **Persisting a "seen circle explainer" flag.** The explainer
  opens on every tap of the link; that's fine — the link is opt-in
  and the sheet dismisses quickly.
- **A confirmation prompt on Remove (Circle) or Unblock (Blocked).**
  Both are quiet per the parent plan's Phase 0 doc reconciliation
  (`docs/ui.md` § "Circle screen" no longer specifies a
  Remove-confirmation). Block (on `<ProfileSheet>`, landing in 0802) is the only confirm-prompted action on the circle/blocked
  surface.
