# Requirements: add-by-username + `@username` disambiguation (2005)

Sub-step 2005 of the `2000_username_identity` orchestration plan. It makes the
public **username** the key for adding people (replacing the e-mail add-key) and
renders `@username` wherever a person is shown so non-unique display names are
always resolvable. This refines the parent contract's **R6** (username
disambiguates display names) and **R10** (people are added by username, not
e-mail); the requirements below are the sub-step-local restatement. It builds
only on 2001's `profiles.username` column and 2003's `resolve_username` +
open-registration posture, and is independent of the session work (2002–2004).

## R1. Adding a person is keyed by username

`send_invitation` and the manual circle-add RPC accept a **username** and resolve
it to a user id at the database. The e-mail branch of `send_invitation`
(`p_email`) and `add_circle_by_email` are replaced by username-keyed forms:

```sql
send_invitation(p_list_id uuid, p_username text DEFAULT NULL, p_user_id uuid DEFAULT NULL) RETURNS uuid
add_circle_by_username(p_username text) RETURNS void
```

Both resolve inline against the case-fold unique index —
`SELECT id FROM public.profiles WHERE lower(username) = lower(p_username)` —
mirroring how they inline the `auth.users` e-mail lookup today. Resolution
happens **before** any policy/block/self logic, so those checks are unchanged
(R2). Because a function's input-parameter name cannot be changed with
`CREATE OR REPLACE`, the migration `DROP`s the old functions and `CREATE`s the
new ones, re-granting `EXECUTE` to `authenticated` only (`REVOKE ALL FROM public`).

## R2. The block / invite-policy / self-invite checks survive unchanged

Every check in `docs/invites.md`'s send-invitation sequence continues to hold,
keyed on the resolved target id: inviter-must-be-a-live-member, self-invite,
existing-live-membership, existing-pending-invite, the "block always wins" check
(a `relationships` row with `status = 'blocked'` from target→inviter), and the
three-way `user_settings.invite_policy` check (`nobody`/`circle`/`everybody`).
The mutual circle-add's "block always wins" `ON CONFLICT … DO UPDATE … WHERE
status <> 'blocked'` upsert is preserved verbatim (R4). No check is relaxed by
the swap; only the input key changes from e-mail to username.

## R3. A nonexistent username is truthful; private-setting failures stay generic

Because usernames are public (the register screen already reveals taken handles
and `resolve_username` is `anon`-callable), a typed username that resolves to no
account is answered **truthfully and distinguishably**: `send_invitation` raises
a `'no such user'` exception (SQLSTATE `P0001`) — the UI shows "No such username"
— and `add_circle_by_username` does the same (as its predecessor did).

Failures that would leak the target's **private settings** stay generic, exactly
as `docs/invites.md` "What blocked invites look like" requires: a block, an
`invite_policy` of `nobody`, and an `invite_policy` of `circle` where the inviter
isn't in the target's circle all make `send_invitation` return `NULL`, which the
UI surfaces as the single generic "Couldn't send invite". A successful send
returns the new invitation uuid → "Invite sent". These three outcomes are
distinct at the client: uuid → sent, `NULL` → couldn't, `P0001` → no such
username. Distinguishing sent from couldn't leaks nothing beyond username
existence (already public) — it merges block and policy into one bucket, as
today.

## R4. Mutual circle-add is preserved

`add_circle_by_username` reproduces `add_circle_by_email`'s mutual outcome: it
writes **both** directed `relationships` rows — caller→target and target→caller,
each an upsert skipped when a `'blocked'` row already stands on that side. This
is the whole purpose of the manual circle-add path (`docs/circles.md`: "the only
way both sides become populated in one step"). The one-sided tap-add path
(`add_circle_by_id`) is untouched and remains one row only. Both raise on a
self-add (`'cannot add yourself'`).

## R5. The id-keyed paths are unchanged

`send_invitation(p_user_id)` (tap-to-invite from the picker's circle / co-member
sections), `add_circle_by_id` (one-sided tap-add from the profile sheet),
`accept_invitation`, and `decline_invitation` all key on a uuid and are not
modified. When both `p_username` and `p_user_id` are passed to `send_invitation`,
`p_user_id` wins (as `p_email`/`p_user_id` did today).

## R6. The unregistered-e-mail identifier is retired and `target_email` is removed

The old "By e-mail" field was only an **identifier** for a person not already
surfaced via circle/co-members — it never sent mail (no magic-link/SMTP call
exists on the invite path) and nothing ever converted a stored `target_email`
row into a real invite at signup. That inert path is removed: `send_invitation`
loses its `p_email`/`target IS NULL` branch entirely, so every invite resolves to
a real registered user or raises (R3). The `invitations.target_email` column, its
partial unique index `invitations_target_email_uniq`, and the "at least one key"
CHECK are dropped, and `invitations.target_user_id` becomes `NOT NULL`. New
people join by self-registering (registration is open since 2003), then are added
by username. `export_my_data()` (which already *excludes* `target_email`) must
still compile against the dropped column.

## R7. `@username` renders on every disambiguation surface

Wherever a person is shown, their username renders as `@username` so two
identical display names are always resolvable:

- **Profile sheet** — **prominently**, on its own line directly under the display
  name and above the circle/blocked state chip.
- **Members screen** — a secondary line in each member row.
- **Vote attribution** — beside each voter in the vote chips.
- **Item created/modified attribution** — after the bolded name in the "Added by
  … / Last edited by …" line.
- **Invite picker** — on the tappable circle and co-member rows.
- **Circle-management screen** — on each circle member row.

All render through a single global visual treatment (a new `.identity-handle`
role in the global CSS), referencing a design token for colour, never a hex.
`@username` is never shown for the deleted-user tombstone (it has a provisional
handle and renders as "Deleted user" today; the handle line is suppressed for it).

## R8. The user can see their own `@username`

Because there is no self-profile screen (tapping your own avatar bounces to
Settings, per `docs/invites.md`), the user's own `@username` is shown in Settings
under the profile chip, read from the session `AuthUser.username` (already
populated by 2003). This is so a user can learn their handle to share it — it is
distinct from R7's disambiguation purpose.

## R9. The invite-picker and circle screens collect a username, not an e-mail

`InvitePickerSheet`'s bottom "By e-mail" section and `CircleScreen`'s dashed "Add
by e-mail" card drop their e-mail text fields (and the `type=email` /
`inputmode=email` / `autocomplete=email` attributes) and become username fields
with username-appropriate label, placeholder (`@username`), and helper copy. The
invite picker surfaces the three R3 outcomes; the circle screen maps
`'no-such-user'` → "No such username" and `'self'` → "That's your own username"
inline, keeping its generic snackbar for unknown failures.

## R10. The specification docs are reconciled

Both `docs/invites.md` (line 66) and `docs/circles.md` (line 49) carry a 2001
forward-note deferring the add-by-e-mail→username mechanics to "step 20"; 2005
resolves them. `docs/invites.md` and `docs/circles.md` are rewritten from
e-mail-add to username-add, including the mutual outcome and the send-invitation
check sequence. The "What blocked invites look like" list moves "doesn't exist"
out of the generic bucket (now truthful per R3). Critically, the "Email path"
prose (`docs/invites.md:155-159`) describes a magic-link-signup + convert-at-
signup flow that **was never implemented** — it is reconciled to reality (e-mail
was only an identifier; there was no outbound mail), not ported to username. The
pending-invite-cap `target_email` carve-out (`:174-178`) is updated as moot.
`docs/ui.md` gains the "By username" fields and the `.identity-handle` role;
`docs/data-model.md`'s profiles-read note gains `username`, and its RPC-list
wording for the swapped functions rides with the migration.

## Non-requirements (explicitly excluded)

- **Inbox-inviter `@username`.** Parent R6 enumerates the disambiguation
  surfaces and the invites inbox is not among them; the inbox shows the inviter's
  display name, and adding a handle there can follow later if it proves
  confusing. (2005 still removes the dead `target_email` field from the inbox
  store, since the column is gone.)
- **Inviting a person who has no account.** Retired outright (R6) — it was inert,
  and open self-registration replaces it. No new "invite a stranger to sign up"
  channel is built here.
- **Add-by-username autocomplete / availability pre-check in the field.** The
  field is submit-then-resolve; no live "username exists" lookup as you type. A
  `resolve_username`-backed typeahead is a later polish, not a gate.
- **Changing the tap-add / id-keyed paths.** `add_circle_by_id`,
  `send_invitation(p_user_id)`, accept/decline are unchanged (R5).
- **Physically dropping other e-mail surfaces.** Retiring the magic-link/OTP
  sign-in surface and the live-alpha migration are 2006's job; 2005 touches only
  the invite/circle add-key and `invitations.target_email`.
- **A `citext` migration for usernames.** Uniqueness stays on the existing
  `lower(username)` expression index (2001's decision); not revisited.
