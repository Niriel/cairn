# Invites & circles

This document covers everything around how Cairn users find each other, share lists, and control who can reach them: the **circle** model, the invitation flow, the blocklist, the three-way invite policy, and the schema and UI that support all of it.

It builds on `data-model.md` (the existing tables) and `account-deletion.md` (the anonymize-don't-cascade rule). Read those first if you haven't.

## The shape of the problem

Cairn is a small private app for groups of friends. Two real needs:

1. **Easy invites for people you already collaborate with.** If Alice and Bob already share a movie list and a books list, asking her to retype `bob@protonmail.com` every time she makes a third list is friction. She wants Bob in two taps.
2. **Honest control over who can reach you.** Some people want lists for themselves only. Some want to be the one doing the inviting, never the receiving. Some want everyone they've previously trusted to be able to add them to things, but no one else. The defaults shouldn't enforce a single social posture.

The design has to make the easy case fast without making the restrictive case awkward.

## Why "circle," not "friend"

The word in this feature has to describe *people you'll accept contact from* — not a mutual social bond. The set is heterogeneous: a close friend, an old colleague, the author of a book you've corresponded with, the organizer of a meeting. None of those people are *friends* in the everyday sense, but each of them might reasonably reach out, and you might reasonably want to be reachable by them.

"Friend" carries the mutual-graph connotation; "contacts" reads as an address book; "trusted senders" sounds like a spam filter. **Circle** is the word: something *you* draw around yourself. It's directionally honest (no claim about whether the other person has drawn one back), it absorbs the variety above without miscategorizing anyone, and it sits naturally next to *list*, *cairn*, *member* in the product vocabulary.

> Alice adding Bob to her circle means *"Alice is willing to receive invites from Bob."*

That's the whole semantics.

## The two ways into someone's circle

**Tap-add (one-sided).** When Alice taps Bob's profile (anywhere he appears — a member of another list, a sender of an invite she received, etc.) and chooses *"Add to circle,"* Bob goes onto Alice's circle. Bob is not added to Alice's circle in return; Bob is not notified. Tap-add is the low-friction path and produces a low-commitment, one-sided outcome.

**Email-add (mutual).** When Alice types `bob@protonmail.com` in the manual add flow (Settings → Privacy → Your circle → Add by email), the server creates *two* circle rows: Alice → Bob and Bob → Alice. Either can remove the other later, unilaterally. The reasoning: typing someone's email is a strong signal of trust *and* a much higher-friction action. If Alice went to the trouble, she's vouching for Bob, and it would feel one-sided and weird if Bob then had to separately add Alice back just to be able to invite her.

Email-add is also the only way to add someone you don't already share a list with, so it's the natural place where mutuality is established.

**Bob is not notified about being added to Alice's circle**, in either path. The principle is general: *only notify when the user's experience actually changes.* Being in Alice's circle changes nothing for Bob day-to-day; it only governs what happens if/when he tries to invite Alice to something later. There's nothing for Bob to do, decide, or react to. So we don't surface it.

And Bob never sees who has him in their circle — in either direction. Alice's circle is Alice's private permission setting on herself; the people listed in it haven't *agreed* to anything social, they're just on her allowlist. Surfacing that to them would turn a private setting into a quasi-social signal, which is the opposite of what we want. Each user sees and manages only their own circle.

### Email-add when Bob has blocked Alice

The mutual-by-default has one asymmetry: a block beats it. If Alice email-adds Bob, but Bob has Alice on his blocklist, the **add succeeds on Alice's side** (Bob goes onto Alice's circle — Alice asked for that, and we don't tell her about Bob's block) **but the auto-add to Bob's circle is silently skipped**. The outcome is asymmetric: Alice has Bob in her circle; Bob does not have Alice in his. This preserves Bob's intent (he chose to block Alice; that decision is decisive) without leaking the existence of the block to Alice.

This means the *only* state where the email-add is asymmetric is "Bob has blocked Alice." Every other case produces the symmetric two-row outcome.

## The profile screen

The profile screen is the action hub for everything you can do *to* another user. Reachable from anywhere a user appears (members of a list, inbox row sender, attribution avatar on an item).

It shows:

- Display name
- Avatar
- (Nothing else — no bio, no email, no list of shared lists, no member-since. Privacy by minimalism.)

And, depending on current state, some subset of these actions:

- **Add to circle** *(or)* **Remove from circle** — if the viewer has them in their circle
- **Block** *(or)* **Unblock** — always available unless self
- **Cancel pending invite** — if there's a pending invite to a shared list (only visible to the inviter)

The profile screen never shows whether *the other person* has you in their circle. That's their private setting on themselves; not your business. (See `circles.md`.)

Tapping your *own* profile (your avatar in a list members screen, etc.) bounces to Settings — there is no "my profile" screen in v1; profile is a screen for looking at *others*.

Email addresses are **never** shown on the profile screen, or anywhere else a user is rendered. Alice and Bob can collaborate on lists, exchange invites, be in each other's circles, and never see each other's email — only display name and avatar. Email is the auth identifier and the lookup key for unregistered invites; it's not social information.

## The three-way invite policy

Stored on `user_settings.invite_policy`. Three values:

- **`everybody`** *(default for new accounts)*. Anyone with a Cairn account can invite this user to a list.
- **`circle`**. Only users in this person's circle can invite them. Invites from anyone else fail with the generic "Couldn't send invite" message (see "What blocked invites look like" below).
- **`nobody`**. No invites accepted. The user is opting out of being added to anything; they can still create their own lists and invite others. Their existing lists are unaffected.

The default is `everybody` because Cairn is meant to be a low-friction collaboration tool for small groups; a more restrictive default would make first-time onboarding feel like a permission system. Users who want tighter control change one setting; users who don't want to think about it get a sensible default.

### Existing pending invites when policy changes

When a user changes `invite_policy` from `everybody` to `circle` or `nobody`, **existing pending invites in their inbox are auto-declined**. The inbox empties (or shrinks to just invites from current circle members, if changing to `circle`). The decline is silent (the senders are not notified — see "What blocked invites look like").

### "Block always wins"

The blocklist is checked *after* the policy. So:

- Even if Alice's policy is `everybody`, she can still individually block Bob, and his invites fail.
- Even if Alice's policy is `circle` and Bob is in her circle, if Alice has *also* blocked Bob (an unusual but valid state), Bob's invites fail.

The block is the strongest possible signal and overrides every other path. Blocking someone who was already in your circle overwrites the `relationships` row's `status` from `circle` to `blocked` (the row stays, just changes status). Unblocking deletes the row — the prior `circle` state is *not* restored automatically. If you want them back in your circle, re-add them deliberately. The simpler "absence = neither" semantic is worth more than preserving the prior state across a block/unblock cycle.

## Blocks

A separate per-user list, distinct from circles. Adding someone to your blocklist:

- Prevents them from inviting you to any list (regardless of your `invite_policy`).
- Auto-declines any pending invite from them currently in your inbox.
- Skips the auto-add to your circle when they email-add you (see above).
- Does **not** remove them from lists you both currently belong to. Cairn is a collaboration tool, not a social network — kicking Alice out of a list because Bob blocked her would be hostile to the *list*, which other people are using too. The block governs *new* contact, not retroactive removal.
- Is invisible to the blocked party. Bob doesn't get a notification; future invite attempts simply fail with the same generic error any blocked invite produces.

Reachable from any profile screen, and from Settings → Privacy → Blocked.

## Invitations — the data flow

An invitation is a pending offer of list membership. It has three terminal states: **accepted** (a `list_members` row is created and the invitation is deleted), **declined** (the invitation is hard-deleted; nothing else changes), or **expired** (server-side cleanup, not a v1 feature).

### What `invite_policy` and blocks check, in order

When Alice taps "Invite Bob" (whether by email, by tapping a circle member, or by tapping a co-member of another list), the server runs this sequence:

1. **Self-check.** If the invitee resolves to Alice herself: clear error, *"You're already on this list"* or *"You can't invite yourself."* (No privacy concern; honesty wins.)
2. **Existing membership.** If Bob is already a member of this list (live or soft-deleted): no-op for live; un-deletes the membership for soft-deleted, and Alice sees *"Bob is already on this list"* or *"Bob is back on this list."*
3. **Existing pending invitation.** If Bob already has a pending invite to this list from anyone: no-op; Alice sees a generic success message.
4. **Block check.** If Bob has Alice on his blocklist: invite fails with the generic error.
5. **Policy check.** If Bob's `invite_policy` is `nobody`: invite fails. If `circle`: check whether Alice is in Bob's circle; if not, fail. If `everybody`: pass.
6. **Existence check.** If `bob@example.com` doesn't resolve to a Cairn account: pass (the invite goes to the email-link path; see below).
7. **Success.** Insert an `invitations` row.

### What blocked invites look like to the sender

In every blocked case, Alice sees the same message: **"Couldn't send invite."** No detail about why. The same message covers:

- Bob doesn't exist as a Cairn user.
- Bob has `invite_policy = nobody`.
- Bob has `invite_policy = circle` and Alice isn't in his circle.
- Bob has Alice on his blocklist.

The legal/ethical reasoning, briefly:

- **Privacy of Bob's settings.** Bob's invite preference and his blocklist are personal data. Telling Alice *"Bob is not accepting invites"* leaks the existence of his preference and confirms his account exists. Both are minor leaks but real ones under GDPR's data-minimization principle.
- **Honesty to Alice.** A user-hostile pattern is to silently swallow Alice's invite while showing her *"sent!"* The action genuinely failed; we say so.
- **Anti-enumeration.** If errors distinguished *"Bob doesn't exist"* from *"Bob blocked you"* from *"Bob accepts everyone,"* an attacker could probe the user database.

The combination — *"Couldn't send invite"* with no detail — satisfies all three. This matches how Signal and most privacy-conscious products handle delivery failures.

The single carve-out is **inviting yourself**, which surfaces a clear error: there's no privacy at stake.

Note that Alice cannot type Bob's email into the invite flow and learn from the error whether Bob exists, has blocked her, etc. — every failure is the same string. **Email is also never echoed back in any UI.** If Alice mistypes `bob@protonmial.com`, the error is *"Couldn't send invite"* — same as every other failure. (We considered echoing the typo back to help her notice it; we decided against it, on the grounds that the same error must be shown for every failure regardless of whether the email was malformed, real-but-unregistered, real-but-blocked, etc. The email she typed is on her screen; she can read it from there.)

## Inviting by email vs by circle vs by co-member

All three paths produce the same `invitations` row at the end. The difference is the picker UI in front of them.

### Invite picker — three sections

A bottom sheet opened from the list members screen. It has three sections, top to bottom:

1. **Your circle** — people in Alice's circle, excluding existing members of the current list. Tap-to-invite.
2. **Co-members of your other lists** — live co-members on Alice's other lists, deduplicated, excluding circle members already shown above and existing members of the current list. Tap-to-invite.
3. **By email** — a text field at the bottom. Submit sends to the magic-link path (see below).

Sections 1 and 2 show display name + avatar only. **No emails.** A tap is a single action: it sends the invite. The row shows a brief check-mark on success or the generic error toast on failure.

This is the path the docs previously didn't cover — email-only invites for people you already collaborate with is friction. The circle and co-member sections remove it.

### Email path

The fallback for everyone, including unregistered users. Alice types or pastes an email; the server looks it up in `auth.users`:

- **Match found.** Same path as picking from the list — invitation goes through the policy/block checks above and lands in the matched user's inbox.
- **No match.** The server creates an invitation tied to the *email* (not a user_id, since there is none yet). It also triggers a magic-link email: *"Alice invited you to her list 'Stuff to read' on Cairn. Tap to sign up and accept."* When the recipient signs up via that link, their new `auth.users` row is checked for any email-keyed pending invitations; matches are converted to user-keyed invitations and the inbox shows them on first sign-in.

## Inbox — receiving invites

A pending invite to Bob shows up in two places:

1. **A row at the top of the Lists screen** — *"Alice invited you to Stuff to read"* with **Accept** and **Decline** affordances inline. If multiple invites are pending, the row says *"3 pending invites"* and tapping it opens the full inbox.
2. **The full inbox** — Settings → Invites (or by tapping the badge above), with one row per pending invite showing the inviter's display name, the list name, and Accept / Decline.

**Accept** creates a `list_members` row, deletes the invitation, and navigates Bob into the list immediately. He's a full member from that moment on.

**Decline** hard-deletes the invitation. Alice is not notified. The next time Alice opens the members screen of that list, Bob simply isn't there and there's no pending row for him; she can re-invite if she wants.

After accepting, Bob optionally gets a one-time prompt: *"You accepted Alice's invite. Add Alice to your circle?"* Dismissible. If he taps yes, Alice goes into Bob's circle (one-sided — Alice is not notified). This is the organic circle-growth path that powers most of the social graph.

## Pending-invite cap

A user has a soft cap of **20 pending invites** at any one time. Reaching the cap doesn't block the inviter — the oldest pending invite to that user is auto-declined to make room (FIFO). 20 is tunable; the right number is "high enough that no normal user ever notices."

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

`(user_id, other_user_id)` is directional — *"user_id's view of other_user_id."* A symmetric circle relationship (the email-add case) is two rows, one in each direction; the schema doesn't enforce symmetry. A single pair is either in the circle or blocked, never both — `status` is mutually exclusive. The column is named `other_user_id` (not `member_id`) because *member* is reserved for `list_members`; uniformity inside the schema beats cross-table puns.

Blocking someone who was already in your circle overwrites the row's `status` from `circle` to `blocked` (a `PATCH` on the existing row, or an `INSERT … ON CONFLICT DO UPDATE`). Unblocking *deletes* the row outright — the prior `circle` state is **not** restored across a block/unblock cycle. If you want them in your circle again, you re-add deliberately. This is a small departure from "unblock returns you to the prior state" that earlier drafts of this doc described; collapsing the two tables into one row-per-pair makes the simpler "absence = neither" semantic worth more than preserving a low-frequency edge case.

`on delete cascade` on both FKs: if either side deletes their account, the row is hard-deleted. This is correct under the anonymize-don't-cascade rule because the relationship itself is purely personal data — there's no shared state to preserve.

### `invitations`

```sql
create table public.invitations (
  id             uuid primary key default gen_random_uuid(),
  list_id        uuid not null references public.lists(id) on delete cascade,
  created_by     uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid          references auth.users(id) on delete cascade,
  target_email   text,
  created_at     timestamptz not null default now(),
  modified_at    timestamptz not null default now(),
  check (target_user_id is not null or target_email is not null)
);

alter table public.invitations enable row level security;

create unique index invitations_target_user_uniq
  on public.invitations (list_id, target_user_id)
  where target_user_id is not null;

create unique index invitations_target_email_uniq
  on public.invitations (list_id, lower(target_email))
  where target_email is not null and target_user_id is null;
```

The column names follow the schema-wide rule: `created_by` for "who created the row" (uniform with `lists`, `items`, `list_members`); `target_*` for "who the row is *for*" (the invitee). Earlier drafts used `inviter_id` / `invitee_*` for self-documenting role names; the table name already carries that context, so the generic forms are clearer in aggregate. **Note**: `invitations.created_by` uses `on delete cascade` rather than `on delete set default` — invitations are pending state with no audit value once the inviter is gone, unlike `lists.created_by` / `items.created_by` which point to shared content. Same column name, different FK action; the action follows from the table's role, not from the column name.

The "blocked always wins" rule is enforced at the application level inside the invite RPCs — `send_invitation` checks for a `relationships` row with `status = 'blocked'` *before* consulting `invite_policy` or circle membership.

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

Insert and delete on `invitations`, and the email-add path for `relationships` (which writes a row in *the other user's* direction), go through stored procedures: `send_invitation`, `accept_invitation`, `decline_invitation`, `add_circle_by_email`, `add_circle_by_id`. These run as `security definer` functions because they need privileges to read other users' `invite_policy` and `relationships` rows for the policy/block checks, and to write the symmetric `relationships` row on the other user's behalf during email-add. The web app calls them via PostgREST RPCs; it doesn't touch the tables directly for these operations.

The pattern matches `delete_account` from `account-deletion.md`: when the logic involves cross-user state, it lives in a function, not in a policy.

## The `add_circle_by_email` function (sketch)

```sql
create or replace function public.add_circle_by_email(p_email text)
returns void
language plpgsql security definer
set search_path = public, auth
as $$
declare
  me     uuid := public.uid();
  target uuid;
begin
  select id into target from auth.users where lower(email) = lower(p_email);
  if target is null then
    raise exception 'no such user';   -- email-add only works on existing users
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

The `ON CONFLICT … DO UPDATE … WHERE status <> 'blocked'` shape is what enforces "block always wins" at write time: an existing `blocked` row is preserved, while an existing `circle` row stays `circle` (the no-op merge keeps `modified_at` honest if the trigger uses `OF (status)`). The `tap_add` (one-sided) path is a direct insert from the client — no stored procedure needed, since Alice is only writing her own row and the standard RLS policy permits it; the same `ON CONFLICT` shape applies if she taps a user she has already blocked (the block stands).

## The `send_invitation` function (sketch)

```sql
create or replace function public.send_invitation(
  p_list_id uuid,
  p_email   text default null,
  p_user_id uuid default null
)
returns uuid    -- invitation id, or null on silent fail
language plpgsql security definer
set search_path = public, auth
as $$
declare
  inviter uuid := public.uid();
  target  uuid;
  policy  text;
  in_circle boolean;
begin
  -- Resolve target (email or user_id)
  if p_user_id is not null then
    target := p_user_id;
  elsif p_email is not null then
    select id into target from auth.users where lower(email) = lower(p_email);
  else
    raise exception 'must provide either p_email or p_user_id';
  end if;

  if target = inviter then
    raise exception 'self-invite';
  end if;

  -- (existing-membership and existing-invite checks elided)

  if target is not null then
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
  end if;

  insert into public.invitations (list_id, created_by, target_user_id, target_email)
  values (p_list_id, inviter, target,
          case when target is null then p_email else null end)
  returning id into invitation_id;

  return invitation_id;
end;
$$;
```

Returns `null` on silent fail, a uuid on success. The web app interprets `null` as "couldn't send" and shows the generic toast.

## Cascade behavior on account deletion

When Alice deletes her account:

| Table | What happens | Why |
|---|---|---|
| `relationships` (rows where she's `user_id` *or* `other_user_id`, regardless of status) | Hard cascade | Personal allowlist / blocklist data on both sides; nothing of value to preserve. |
| `invitations` (rows where she's `created_by` *or* `target_user_id`) | Hard cascade | Pending state; no audit value once she's gone. |

All cascades happen automatically via the `on delete cascade` clauses set when each table was created. The `delete_account` function from `account-deletion.md` doesn't need to do anything special.

## Open questions / future work

- **Push notification on invite arrival.** Bob wouldn't see Alice's invite until he opens the app. Cairn doesn't have push in v1; when push lands, invites are an obvious candidate for it.
- **Invite expiry.** Pending invites currently live forever. A 90-day server-side expiry would keep inboxes tidy; not a v1 problem.
- **Bulk invite.** Inviting 5 people to a new list at once. Currently the picker is one-at-a-time. Multi-select is a small UI change once the data flow is solid.
- **Spam reporting.** We deliberately omitted "report as spam" affordances on decline. If unwanted invites become a real problem at scale (unlikely for a small private app), this is the obvious lever.
- **Show shared lists on profile?** Currently the profile screen shows only display name + avatar. We considered listing "Lists you both belong to" but kept profile minimal in v1. Reconsider once we have real users.
