# Invites & circles

This document covers everything around how Cairn users find each other, share lists, and control who can reach them: the **circle** model, the invitation flow, the blocklist, the three-way invite policy, and the schema and UI that support all of it.

It builds on `data-model.md` (the existing tables) and `account-deletion.md` (the anonymize-don't-cascade rule). Read those first if you haven't.

## The shape of the problem

Cairn is a small private app for groups of friends. Two real needs:

1. **Easy invites for people you already collaborate with.** If Alice and Bob already share a movie list and a books list, asking her to retype `bob@protonmail.com` every time she makes a third list is friction. She wants Bob in two taps.
2. **Honest control over who can reach you.** Some people want lists for themselves only. Some want to be the one doing the inviting, never the receiving. Some want everyone they've previously trusted to be able to add them to things, but no one else. The defaults shouldn't enforce a single social posture.

The design has to make the easy case fast without making the restrictive case awkward.

## Why "circle," not "friend"

The word in this feature has to describe _people you'll accept contact from_ — not a mutual social bond. The set is heterogeneous: a close friend, an old colleague, the author of a book you've corresponded with, the organizer of a meeting. None of those people are _friends_ in the everyday sense, but each of them might reasonably reach out, and you might reasonably want to be reachable by them.

"Friend" carries the mutual-graph connotation; "contacts" reads as an address book; "trusted senders" sounds like a spam filter. **Circle** is the word: something _you_ draw around yourself. It's directionally honest (no claim about whether the other person has drawn one back), it absorbs the variety above without miscategorizing anyone, and it sits naturally next to _list_, _cairn_, _member_ in the product vocabulary.

> Alice adding Bob to her circle means _"Alice is willing to receive invites from Bob."_

That's the whole semantics.

## The two ways into someone's circle

**Tap-add (one-sided).** When Alice taps Bob's profile (anywhere he appears — a member of another list, a sender of an invite she received, etc.) and chooses _"Add to circle,"_ Bob goes onto Alice's circle. Bob is not added to Alice's circle in return; Bob is not notified. Tap-add is the low-friction path and produces a low-commitment, one-sided outcome.

**Username-add (mutual).** When Alice types Bob's `@username` in the manual add flow (Settings → Privacy → Your circle → Add by username), the server creates _two_ circle rows: Alice → Bob and Bob → Alice. Either can remove the other later, unilaterally. The reasoning: deliberately typing someone's username is a signal of trust _and_ a higher-friction action. If Alice went to the trouble, she's vouching for Bob, and it would feel one-sided and weird if Bob then had to separately add Alice back just to be able to invite her.

Username-add is also the only way to add someone you don't already share a list with, so it's the natural place where mutuality is established.

**Bob is not notified about being added to Alice's circle**, in either path. The principle is general: _only notify when the user's experience actually changes._ Being in Alice's circle changes nothing for Bob day-to-day; it only governs what happens if/when he tries to invite Alice to something later. There's nothing for Bob to do, decide, or react to. So we don't surface it.

And Bob never sees who has him in their circle — in either direction. Alice's circle is Alice's private permission setting on herself; the people listed in it haven't _agreed_ to anything social, they're just on her allowlist. Surfacing that to them would turn a private setting into a quasi-social signal, which is the opposite of what we want. Each user sees and manages only their own circle.

### Username-add when Bob has blocked Alice

The mutual-by-default has one asymmetry: a block beats it. If Alice username-adds Bob, but Bob has Alice on his blocklist, the **add succeeds on Alice's side** (Bob goes onto Alice's circle — Alice asked for that, and we don't tell her about Bob's block) **but the auto-add to Bob's circle is silently skipped**. The outcome is asymmetric: Alice has Bob in her circle; Bob does not have Alice in his. This preserves Bob's intent (he chose to block Alice; that decision is decisive) without leaking the existence of the block to Alice.

This means the _only_ state where the username-add is asymmetric is "Bob has blocked Alice." Every other case produces the symmetric two-row outcome.

## The profile screen

The profile screen is the action hub for everything you can do _to_ another user. Reachable from anywhere a user appears (members of a list, inbox row sender, attribution avatar on an item).

It shows:

- Display name
- Avatar
- (Nothing else — no bio, no email, no list of shared lists, no member-since. Privacy by minimalism.)

And, depending on current state, some subset of these actions:

- **Add to circle** _(or)_ **Remove from circle** — if the viewer has them in their circle
- **Block** _(or)_ **Unblock** — always available unless self
- **Cancel pending invite** — if there's a pending invite to a shared list (only visible to the inviter)

The profile screen never shows whether _the other person_ has you in their circle. That's their private setting on themselves; not your business. (See `circles.md`.)

Tapping your _own_ profile (your avatar in a list members screen, etc.) bounces to Settings — there is no "my profile" screen in v1; profile is a screen for looking at _others_.

Email addresses are **never** shown on the profile screen, or anywhere else a user is rendered. Alice and Bob can collaborate on lists, exchange invites, be in each other's circles, and never see each other's email — only display name, avatar, and `@username`. E-mail is **no longer the auth identifier**: the public identity is the **username** (shown as `@username` alongside the display name and avatar), and e-mail is demoted to an optional, private recovery address. E-mail is not social information and is never an add-key.

The public add-key is the **username**. Both add paths — the invite flow (`send_invitation`) and the circle add (`add_circle_by_username`) — resolve a typed `@username` against `public.profiles`. There is no unregistered-user branch: usernames only exist for registered accounts, so a username that doesn't resolve is a plain miss. Because usernames are public, a miss can be told truthfully (see "What blocked invites look like" and the anti-enumeration note below) — the anti-enumeration concern that once justified swallowing every failure was an artefact of e-mail, which was private.

## The three-way invite policy

Stored on `user_settings.invite_policy`. Three values:

- **`everybody`** _(default for new accounts)_. Anyone with a Cairn account can invite this user to a list.
- **`circle`**. Only users in this person's circle can invite them. Invites from anyone else fail with the generic "Couldn't send invite" message (see "What blocked invites look like" below).
- **`nobody`**. No invites accepted. The user is opting out of being added to anything; they can still create their own lists and invite others. Their existing lists are unaffected.

The default is `everybody` because Cairn is meant to be a low-friction collaboration tool for small groups; a more restrictive default would make first-time onboarding feel like a permission system. Users who want tighter control change one setting; users who don't want to think about it get a sensible default.

### Existing pending invites when policy changes

When a user changes `invite_policy` from `everybody` to `circle` or `nobody`, **existing pending invites in their inbox are auto-declined**. The inbox empties (or shrinks to just invites from current circle members, if changing to `circle`). The decline is silent (the senders are not notified — see "What blocked invites look like").

### "Block always wins"

With the combined `relationships` table (`status` is either `'circle'` or `'blocked'`, never both), 'block always wins' manifests in two places: (1) in `send_invitation`, the block check (step 6 above) tests for a row with `status = 'blocked'` _before_ the policy check; (2) in `add_circle_by_id` and `add_circle_by_username`, the `ON CONFLICT DO UPDATE WHERE status <> 'blocked'` clause silently skips the circle-add if a blocked row already exists, leaving the blocked row unchanged. Either path preserves the block.

The block is the strongest possible signal and overrides every other path. Blocking someone who was already in your circle overwrites the `relationships` row's `status` from `circle` to `blocked` (the row stays, just changes status). Unblocking deletes the row — the prior `circle` state is _not_ restored automatically. If you want them back in your circle, re-add them deliberately. The simpler "absence = neither" semantic is worth more than preserving the prior state across a block/unblock cycle.

## Blocks

A separate per-user list, distinct from circles. Adding someone to your blocklist:

- Prevents them from inviting you to any list (regardless of your `invite_policy`).
- Auto-declines any pending invite from them currently in your inbox.
- Skips the auto-add to your circle when they username-add you (see above).
- Does **not** remove them from lists you both currently belong to. Cairn is a collaboration tool, not a social network — kicking Alice out of a list because Bob blocked her would be hostile to the _list_, which other people are using too. The block governs _new_ contact, not retroactive removal.
- Is invisible to the blocked party. Bob doesn't get a notification; future invite attempts simply fail with the same generic error any blocked invite produces.

Reachable from any profile screen, and from Settings → Privacy → Blocked.

## Invitations — the data flow

An invitation is a pending offer of list membership. It has three terminal states: **accepted** (a `list_members` row is created and the invitation is deleted), **declined** (the invitation is hard-deleted; nothing else changes), or **expired** (server-side cleanup, not a v1 feature).

### What `invite_policy` and blocks check, in order

When Alice taps "Invite Bob" (whether by username, by tapping a circle member, or by tapping a co-member of another list), the server runs this sequence:

1. **Inviter-membership check.** If the caller is not a live member of the list: raise — cannot invite to a list you're not on. (`send_invitation` is `SECURITY DEFINER` and bypasses RLS, so this must be an explicit guard.)
2. **Resolve target.** Look up `p_username` in `public.profiles` (or use `p_user_id` directly). Raise `'no such user'` on a miss — usernames are public, so a miss is a truthful, distinct error, not something to hide. Every invitation therefore resolves to a real account before any policy or block check runs.
3. **Self-check.** If the invitee resolves to Alice herself: clear error, _"You're already on this list"_ or _"You can't invite yourself."_ (No privacy concern; honesty wins.)
4. **Existing membership.** If Bob is already a _live_ member of this list: no-op; Alice sees _"Bob is already on this list."_ A previously-removed (soft-deleted) membership row is treated as non-membership.
5. **Existing pending invitation.** If Bob already has a pending invite to this list from anyone: no-op; Alice sees a generic success message.
6. **Block check.** If Bob has Alice on his blocklist: invite fails with the generic error.
7. **Policy check.** If Bob's `invite_policy` is `nobody`: invite fails. If `circle`: check whether Alice is in Bob's circle; if not, fail. If `everybody`: pass.
8. **Success.** Insert an `invitations` row.

### What blocked invites look like to the sender

In every blocked case, Alice sees the same message: **"Couldn't send invite."** No detail about why. The same message covers:

- Bob has `invite_policy = nobody`.
- Bob has `invite_policy = circle` and Alice isn't in his circle.
- Bob has Alice on his blocklist.

A username that doesn't resolve is **not** in this bucket. It surfaces as a distinct, truthful error — _"No one on Cairn has that username"_ — raised by the target-resolution step before any policy or block check. Usernames are public, so telling Alice the handle is unknown leaks nothing; it's ordinary "check the spelling" feedback. What stays merged behind the generic string is only what's genuinely private: Bob's invite policy, his circle membership, and his blocklist.

The legal/ethical reasoning, briefly:

- **Privacy of Bob's settings.** Bob's invite preference and his blocklist are personal data. Telling Alice _"Bob is not accepting invites"_ leaks the existence of his preference. That's a minor leak but a real one under GDPR's data-minimization principle. (Confirming Bob's _account_ exists is no longer a concern — a resolvable `@username` already confirms that, publicly and by design.)
- **Honesty to Alice.** A user-hostile pattern is to silently swallow Alice's invite while showing her _"sent!"_ The action genuinely failed; we say so.
- **Anti-enumeration of settings.** If the generic error distinguished _"Bob blocked you"_ from _"Bob accepts everyone,"_ an attacker could probe Bob's private preferences. It doesn't — every policy/block failure is the same string.

The combination — _"Couldn't send invite"_ with no detail on the private failures — satisfies all three. Note the scope has narrowed since e-mail was the add-key: back then a distinct "no such user" would have let an attacker enumerate _who has an account_, so existence had to be hidden too. Under usernames that's moot — existence is public — so only the private outcomes (policy, circle, block) stay merged. This still matches how Signal and most privacy-conscious products handle delivery failures.

The carve-outs that surface a clear, distinct error are **inviting yourself** (no privacy at stake) and **an unknown username** (existence is public). Everything private stays behind the generic string.

Note that Alice cannot type Bob's `@username` into the invite flow and learn from the error whether Bob has blocked her, what his policy is, etc. — every _private_ failure is the same string. Whether the username exists is a different matter: that's public, so a bad handle gets the honest _"No one on Cairn has that username."_

## Inviting by username vs by circle vs by co-member

All three paths produce the same `invitations` row at the end. The difference is the picker UI in front of them.

### Invite picker — three sections

A bottom sheet opened from the list members screen. It has three sections, top to bottom:

1. **Your circle** — people in Alice's circle, excluding existing members of the current list. Tap-to-invite.
2. **Co-members of your other lists** — live co-members on Alice's other lists, deduplicated, excluding circle members already shown above and existing members of the current list. Tap-to-invite.
3. **By username** — a text field at the bottom. Submit resolves the typed `@username` and sends the invite (see below).

Sections 1 and 2 show display name + avatar + `@username`. **No emails.** A tap is a single action: it sends the invite. The row shows a brief check-mark on success or the generic error toast on failure.

Sections 1 and 2 exist because username-only invites for people you already collaborate with would be friction; the circle and co-member sections remove it. Section 3 is the fallback for reaching someone who isn't in either — you just need their handle.

### Username path

The fallback for reaching anyone by their public handle. Alice types or pastes a `@username`; the server resolves it against `public.profiles`:

- **Match found.** Same path as picking from the list — the invitation goes through the policy/block checks above and lands in the matched user's inbox.
- **No match.** The RPC raises `'no such user'` and the field shows _"No one on Cairn has that username"_ — a distinct, truthful error, because usernames are public. Nothing is created; there is no unregistered-user branch. (Cairn does not send e-mail on the invite path and never did — e-mail was only ever an identifier, and a handle with no account simply has nowhere to deliver an invite.)

## Inbox — receiving invites

A pending invite to Bob shows up in two places:

1. **A row at the top of the Lists screen** — _"Alice invited you to Stuff to read"_ with **Accept** and **Decline** affordances inline. If multiple invites are pending, the row says _"3 pending invites"_ and tapping it opens the full inbox.
2. **The full inbox** — Settings → Invites (or by tapping the badge above), with one row per pending invite showing the inviter's display name, the list name, and Accept / Decline.

**Accept** creates a `list_members` row, deletes the invitation, and navigates Bob into the list immediately. He's a full member from that moment on.

**Decline** hard-deletes the invitation. Alice is not notified. The next time Alice opens the members screen of that list, Bob simply isn't there and there's no pending row for him; she can re-invite if she wants.

After accepting, Bob optionally gets a one-time prompt: _"You accepted Alice's invite. Add Alice to your circle?"_ Dismissible. If he taps yes, Alice goes into Bob's circle (one-sided — Alice is not notified). This is the organic circle-growth path that powers most of the social graph.

## Pending-invite cap

A user has a soft cap of **20 pending invites** at any one time. Reaching the cap doesn't block the inviter — the oldest pending invite to that user is auto-declined to make room (FIFO). 20 is tunable; the right number is "high enough that no normal user ever notices."

The cap applies per invitee (`target_user_id`). Every invitation is user-keyed — there is no unregistered-address surface to exempt now that the add-key is the username and `invitations` has no `target_email` column.

**Policy-change cascade (deferred).** When a user changes `invite_policy` from `everybody` to `circle` or `nobody`, existing non-matching pending invites should be auto-declined. This behaviour is documented above but its DB-level enforcement is deferred to step 8; the step-7 DB layer leaves it to the client or a future trigger.

## Schema additions

Two new tables — `relationships` and `invitations`. The `invite_policy` column itself is **not** added here — it lives on `user_settings` from day one (see `data-model.md` → "Why `profiles` and `user_settings` are split"), where owner-only RLS makes it structurally private. Both tables inherit Cairn's existing conventions: UUIDs, timestamps, RLS, and the cascade rules from `account-deletion.md`.

### `user_settings.invite_policy`

Already shipped in plan 0010 alongside the rest of `user_settings`; reproduced here for reference:

```sql
-- in the user_settings table block, see data-model.md
invite_policy text not null default 'everybody'
                check (invite_policy in ('everybody', 'circle', 'nobody'))
```

The column lives on `user_settings` rather than `profiles` because `profiles_select` is world-readable to authenticated callers — `invite_policy` belongs in the owner-only table for the structural-privacy reason explained in `data-model.md`'s "Why `profiles` and `user_settings` are split" section. `user_settings_select` reduces to `id = public.uid()`, so `invite_policy` is structurally private: only the user themselves can read their own setting. RPCs that need to read another user's `invite_policy` (the policy/block check below) are `security definer` and read it as the function owner; that's the only path another user's setting becomes visible.

### `relationships`

```sql
create table public.relationships (
  user_id       uuid not null references auth.users(id) on delete cascade,
  other_user_id uuid not null references auth.users(id) on delete cascade,
  status        text not null
                  check (status in ('circle', 'blocked')),
  created_at    timestamptz not null default now(),
  modified_at   timestamptz not null default now(),
  primary key (user_id, other_user_id),
  check (user_id <> other_user_id)
);

alter table public.relationships enable row level security;
```

`(user_id, other_user_id)` is directional — _"user_id's view of other_user_id."_ A symmetric circle relationship (the username-add case) is two rows, one in each direction; the schema doesn't enforce symmetry. A single pair is either in the circle or blocked, never both — `status` is mutually exclusive. The column is named `other_user_id` (not `member_id`) because _member_ is reserved for `list_members`; uniformity inside the schema beats cross-table puns.

Blocking someone who was already in your circle overwrites the row's `status` from `circle` to `blocked` (a `PATCH` on the existing row, or an `INSERT … ON CONFLICT DO UPDATE`). Unblocking _deletes_ the row outright — the prior `circle` state is **not** restored across a block/unblock cycle. If you want them in your circle again, you re-add deliberately. This is a small departure from "unblock returns you to the prior state" that earlier drafts of this doc described; collapsing the two tables into one row-per-pair makes the simpler "absence = neither" semantic worth more than preserving a low-frequency edge case.

`on delete cascade` on both FKs: if either side deletes their account, the row is hard-deleted. This is correct under the anonymize-don't-cascade rule because the relationship itself is purely personal data — there's no shared state to preserve.

### `invitations`

```sql
create table public.invitations (
  id             uuid primary key default gen_random_uuid(),
  list_id        uuid not null references public.lists(id) on delete cascade,
  created_by     uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  modified_at    timestamptz not null default now()
);

alter table public.invitations enable row level security;

create unique index invitations_target_user_uniq
  on public.invitations (list_id, target_user_id);
```

Every invitation is keyed to a registered account: the add-key is the public username, which only exists for real accounts, so `target_user_id` is `NOT NULL` and there is no `target_email` column, no either-or check constraint, and no separate email-keyed unique index. (Earlier drafts carried an email-keyed branch for not-yet-registered invitees; that path was never built and is retired here — see "Username path" above.)

The column names follow the schema-wide rule: `created_by` for "who created the row" (uniform with `lists`, `items`, `list_members`); `target_*` for "who the row is _for_" (the invitee). Earlier drafts used `inviter_id` / `invitee_*` for self-documenting role names; the table name already carries that context, so the generic forms are clearer in aggregate. **Note**: `invitations.created_by` uses `on delete cascade` rather than `on delete set default` — invitations are pending state with no audit value once the inviter is gone, unlike `lists.created_by` / `items.created_by` which point to shared content. Same column name, different FK action; the action follows from the table's role, not from the column name.

The "blocked always wins" rule is enforced at the application level inside the invite RPCs — `send_invitation` checks for a `relationships` row with `status = 'blocked'` _before_ consulting `invite_policy` or circle membership.

## RLS and stored procedures

```sql
-- relationships: visible only to the owner of the row.
create policy relationships_select on public.relationships
  for select using (user_id = public.uid());
-- (the *other_user* does NOT get to see whether someone has them in
-- their circle or has blocked them — it's the owner's private setting
-- on themselves.)

create policy relationships_insert on public.relationships
  for insert with check (user_id = public.uid());
create policy relationships_update on public.relationships
  for update using (user_id = public.uid())
  with check (user_id = public.uid());
create policy relationships_delete on public.relationships
  for delete using (user_id = public.uid());
-- (only the owner can change or remove rows in their own relationships.)

-- invitations: visible to both inviter (created_by) and invitee (target_user_id)
create policy invitations_select on public.invitations
  for select using (created_by = public.uid() or target_user_id = public.uid());
```

The `relationships_update` policy lets a user flip a row's `status` (e.g., from `circle` to `blocked`) without the round-trip of delete-then-insert. Both `using` and `with check` are gated on `user_id = public.uid()`.

Insert and delete on `invitations`, and the username-add path for `relationships` (which writes a row in _the other user's_ direction), go through stored procedures: `send_invitation`, `accept_invitation`, `decline_invitation`, `add_circle_by_username`, `add_circle_by_id`. These run as `security definer` functions because they need privileges to read other users' `invite_policy` and `relationships` rows for the policy/block checks, and to write the symmetric `relationships` row on the other user's behalf during username-add. The web app calls them via PostgREST RPCs; it doesn't touch the tables directly for these operations.

The one exception is the inviter's own _cancel pending invite_ action, which is a direct `DELETE /invitations?id=eq.<uuid>` gated by the `invitations_delete` policy (`USING (created_by = public.uid())`); accept and decline by the invitee still go through the `accept_invitation` / `decline_invitation` RPCs.

The pattern matches `delete_account` from `account-deletion.md`: when the logic involves cross-user state, it lives in a function, not in a policy.

## The `add_circle_by_username` function (sketch)

```sql
create or replace function public.add_circle_by_username(p_username text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  me     uuid := public.uid();
  target uuid;
begin
  select id into target from public.profiles where lower(username) = lower(p_username);
  if target is null then
    raise exception 'no such user';   -- username-add only works on existing users
  end if;
  if target = me then
    raise exception 'cannot add yourself';
  end if;

  -- Always: Alice -> Bob, but only if Alice hasn't blocked Bob (in which
  -- case the existing 'blocked' row stands; Alice has to unblock first).
  insert into public.relationships (user_id, other_user_id, status)
  values (me, target, 'circle')
  on conflict (user_id, other_user_id) do update
    set status = 'circle'
    where public.relationships.status <> 'blocked';

  -- Mutual: Bob -> Alice, but only if Bob hasn't blocked Alice.
  -- If Bob already has Alice in his circle, the upsert is a no-op.
  insert into public.relationships (user_id, other_user_id, status)
  values (target, me, 'circle')
  on conflict (user_id, other_user_id) do update
    set status = 'circle'
    where public.relationships.status <> 'blocked';
end;
$$;
```

The `ON CONFLICT … DO UPDATE … WHERE status <> 'blocked'` shape is what enforces "block always wins" at write time: an existing `blocked` row is preserved, while an existing `circle` row stays `circle` (the no-op merge keeps `modified_at` honest if the trigger uses `OF (status)`).

**Why both paths may raise on an unknown username.** Both `send_invitation` and `add_circle_by_username` resolve a typed `@username` and raise `'no such user'` on a miss — the trade-off that once split them has collapsed. It only ever existed because the add-key was an e-mail, which is _private_: telling a caller "no such e-mail" would have let them enumerate who has an account, so `send_invitation` (reachable from every invite field, the obvious enumeration surface) had to swallow that outcome behind the generic string, while `add_circle_by_email` — buried in Settings and acting on an address the caller already knew — was allowed the helpful signal. A username is _public_: a resolvable `@username` confirms an account by design, so there is nothing to enumerate and both paths can be truthful about existence. What stays merged behind the generic string in `send_invitation` is only the genuinely private outcomes — policy, circle membership, and block. And `add_circle_by_username` still runs the same anti-enumeration pattern for the block itself: if the target exists and has blocked the caller, the caller's row is created and the symmetric row is silently skipped, with no way for the caller to tell that a block exists.

## The `add_circle_by_id` function (sketch)

```sql
create or replace function public.add_circle_by_id(p_user_id uuid)
returns void
language plpgsql security definer
set search_path = public, auth
as $$
declare
  me     uuid := public.uid();
  target uuid;
begin
  if p_user_id = me then
    raise exception 'cannot add yourself';
  end if;

  -- Explicit existence check (matches add_circle_by_username), so a stale
  -- profile id surfaces as 'no such user' rather than the cryptic raw
  -- FK 23503 the upsert would otherwise produce.
  select id into target from auth.users where id = p_user_id;
  if target is null then
    raise exception 'no such user';
  end if;

  -- One-sided: Alice -> Bob only. Bob is not notified and does not
  -- gain Alice in his circle. If Alice has already blocked Bob, the
  -- existing 'blocked' row is preserved unchanged.
  insert into public.relationships (user_id, other_user_id, status)
  values (me, p_user_id, 'circle')
  on conflict (user_id, other_user_id) do update
    set status = 'circle'
    where public.relationships.status <> 'blocked';
end;
$$;
```

## The `send_invitation` function (sketch)

```sql
create or replace function public.send_invitation(
  p_list_id  uuid,
  p_username text default null,
  p_user_id  uuid default null
)
returns uuid    -- invitation id, or null on silent fail
language plpgsql security definer
set search_path = public
as $$
declare
  inviter       uuid := public.uid();
  target        uuid;
  policy        text;
  in_circle     boolean;
  invitation_id uuid;
begin
  -- Step 1: raise if caller is not a live member of p_list_id
  --   (inviter-membership check — see check sequence above; elided here).

  -- Resolve target (username or user_id). A username miss is public, so
  -- it raises 'no such user' rather than folding into the silent-fail path.
  if p_user_id is not null then
    target := p_user_id;
  elsif p_username is not null then
    select id into target from public.profiles where lower(username) = lower(p_username);
    if target is null then
      raise exception 'no such user';
    end if;
  else
    raise exception 'must provide either p_username or p_user_id';
  end if;

  if target = inviter then
    raise exception 'self-invite';
  end if;

  -- (existing-membership and existing-invite checks elided)

  -- Block check
  if exists (select 1 from public.relationships
             where user_id = target
               and other_user_id = inviter
               and status = 'blocked') then
    return null;
  end if;
  -- Policy check
  select invite_policy into policy from public.user_settings where id = target;
  if policy = 'nobody' then return null; end if;
  if policy = 'circle' then
    select exists (select 1 from public.relationships
                   where user_id = target
                     and other_user_id = inviter
                     and status = 'circle')
      into in_circle;
    if not in_circle then return null; end if;
  end if;

  insert into public.invitations (list_id, created_by, target_user_id)
  values (p_list_id, inviter, target)
  returning id into invitation_id;

  return invitation_id;
end;
$$;
```

Returns `null` on a silent (private) fail, raises `'no such user'` on an unknown username, and returns a uuid on success. The web app interprets `null` as "couldn't send" and shows the generic toast; it surfaces `'no such user'` as the distinct _"No one on Cairn has that username"_ message.

## The `accept_invitation` function (sketch)

```sql
create or replace function public.accept_invitation(p_invitation_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  inv public.invitations%rowtype;
begin
  select * into inv from public.invitations where id = p_invitation_id;
  if not found then
    raise exception 'invitation not found';
  end if;

  -- IS DISTINCT FROM, not <>, keeps the guard null-safe even though
  -- target_user_id is NOT NULL.
  if inv.target_user_id is distinct from public.uid() then
    raise exception 'not your invitation';
  end if;

  -- Restore soft-deleted membership or create fresh; handles concurrent accepts.
  -- created_by is stamped by tg_set_attribution_list_members: public.uid() on
  -- fresh INSERT, preserved on restore via tombstone-gated freeze.
  insert into public.list_members (list_id, user_id)
  values (inv.list_id, public.uid())
  on conflict (list_id, user_id) do update
    set deleted_at = null, deleted_by = null;

  -- Hard-delete the invitation.
  delete from public.invitations where id = p_invitation_id;
end;
$$;
```

## The `decline_invitation` function (sketch)

```sql
create or replace function public.decline_invitation(p_invitation_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  inv public.invitations%rowtype;
begin
  select * into inv from public.invitations where id = p_invitation_id;
  if not found then
    raise exception 'invitation not found';
  end if;

  -- IS DISTINCT FROM, not <>, keeps the guard null-safe even though
  -- target_user_id is NOT NULL.
  if inv.target_user_id is distinct from public.uid() then
    raise exception 'not your invitation';
  end if;

  delete from public.invitations where id = p_invitation_id;
end;
$$;
```

## Cascade behavior on account deletion

When Alice deletes her account:

| Table                                                                                   | What happens | Why                                                                              |
| --------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------- |
| `relationships` (rows where she's `user_id` _or_ `other_user_id`, regardless of status) | Hard cascade | Personal allowlist / blocklist data on both sides; nothing of value to preserve. |
| `invitations` (rows where she's `created_by` _or_ `target_user_id`)                     | Hard cascade | Pending state; no audit value once she's gone.                                   |

All cascades happen automatically via the `on delete cascade` clauses set when each table was created. The `delete_account` function from `account-deletion.md` doesn't need to do anything special.

## Open questions / future work

- **Push notification on invite arrival.** Bob wouldn't see Alice's invite until he opens the app. Cairn doesn't have push in v1; when push lands, invites are an obvious candidate for it.
- **Invite expiry.** Pending invites currently live forever. A 90-day server-side expiry would keep inboxes tidy; not a v1 problem.
- **Bulk invite.** Inviting 5 people to a new list at once. Currently the picker is one-at-a-time. Multi-select is a small UI change once the data flow is solid.
- **Spam reporting.** We deliberately omitted "report as spam" affordances on decline. If unwanted invites become a real problem at scale (unlikely for a small private app), this is the obvious lever.
- **Show shared lists on profile?** Currently the profile screen shows only display name + avatar. We considered listing "Lists you both belong to" but kept profile minimal in v1. Reconsider once we have real users.
