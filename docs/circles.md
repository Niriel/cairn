# Circles

A circle is one of those features that's tempting to misunderstand because the word _circle_ — like _friend_, _follow_, or _contact_ — drags in baggage from social networks where these things are mutual, public, or both. In Cairn it's none of that. This document fixes the model in one place so the docs and the app can refer back to it.

## What a circle is

> **Your circle is a private list of people you'll let invite you to lists, when your privacy is set to _Your circle_.**

That's the whole feature. It is:

- **Inbound only.** It governs invitations _coming to you_. It does not affect your ability to invite anyone — for that, see "the other person's circle" below.
- **Yours alone.** Each user manages their own circle. Bob's circle is Bob's; Alice doesn't see who's in it. Cairn doesn't have a notion of _mutual_ circles, even when (by coincidence or by the username-add path) two people happen to have each other in theirs.
- **Invisible to the people in it.** When Alice adds Bob to her circle, Bob is not notified, and Bob never sees that he's in Alice's circle. Surfacing it would turn a private permission setting into a quasi-social signal — exactly the kind of social-network behaviour Cairn is trying to avoid.
- **Conditional.** It only matters when your invite policy is set to **Your circle**. Under the default policy (**Everybody**), the circle exists but does nothing — anyone with a Cairn account can invite you. Under **Nobody**, the circle does nothing — no one can.

## What a circle is not

- **Not a friends list.** Friendship is mutual and the other person typically knows. A circle is one-way and silent.
- **Not a follow.** Following implies subscribing to someone's content. There is nothing to subscribe to in Cairn — no feed, no posts, no activity stream. Putting Bob in your circle does not show you anything new about Bob.
- **Not a permission for the other person.** Adding Bob to _your_ circle does not give Bob any new capability. It gives **you** the capability to _receive_ invites from Bob (when your policy is `circle`).
- **Not visible to anyone but you.** Cairn never renders "Bob has Alice in his circle" anywhere — not on a profile screen, not in a list members view, not on the circle-management screen. The data isn't even returned by RLS.

## The two circles in any interaction

A confusing thing about circles is that _both people's_ circles can matter in a single invite, but they govern different things. Spell it out:

When Alice tries to invite Bob to a list:

- **Bob's circle** is what gets checked. If Bob's policy is **Your circle**, Cairn looks at Bob's circle and asks, _"is Alice on it?"_ If yes, the invite goes through. If no, the invite is silently rejected. Alice gets a generic _"Couldn't send invite"_ message either way.
- **Alice's circle** is irrelevant to whether the invite reaches Bob.

When Bob tries to invite Alice to a list:

- **Alice's circle** is what gets checked.
- **Bob's circle** is irrelevant.

The mnemonic: _the recipient's circle gates the invite._ Yours gates incoming, theirs gates outgoing.

## Why so quiet?

Cairn deliberately doesn't notify either side when a circle membership changes. Three reasons:

1. **The recipient's experience doesn't change.** Being in Alice's circle gives Bob no new capabilities, no new content, no new state to react to. He doesn't gain access to anything; he simply becomes someone Alice's account is willing to receive invites from. There's nothing for him to confirm, decline, or even acknowledge.
2. **Surfacing it would turn it social.** If we told Bob "Alice added you to her circle," he might infer something about Alice's intent toward him, feel obligated to reciprocate, or treat it as a status. None of that is the goal. The circle is a private spam filter, not a relationship marker.
3. **Notifications are reserved for things that need a response.** A new invite needs a response (accept or decline). A circle change does not. Cairn's bias is toward fewer interruptions; we hold the line.

## The username-add path

There's exactly one way both people end up in each other's circles: the **add by username** path on the circle-management screen. The public identity is the `@username`; it, not e-mail, is the add-key.

When Alice types Bob's `@username` and confirms, the server (in a single transaction) resolves the handle against `public.profiles` and then:

1. Adds Bob to Alice's circle.
2. Adds Alice to Bob's circle, _unless_ Bob has Alice on his blocklist (in which case step 2 is silently skipped).

If the handle resolves to no account, the server raises `'no such user'` and the field says _"No one on Cairn has that username"_ — a truthful, distinct error, because usernames are public (see `invites.md` → "Why both paths may raise on an unknown username"). There is no unregistered-user branch; a handle with no account is simply a miss.

This is the symmetric default. The reasoning: if Alice is willing to type Bob's username and explicitly add him as someone she'd accept invites from, she's also implicitly trusting him enough that _he should be willing to accept invites from her_ — and we save Bob the friction of doing the same dance from his side. The symmetric outcome makes the common case (Alice and Bob are friends and both want collaboration) work in one tap, not two.

The exception (Bob has Alice blocked) is the one case where Bob's intent dominates. The block is the strongest signal in the system; it always wins. Alice still gets a generic success toast — we don't tell her about Bob's block — but Bob's side stays untouched.

This is also why the circle-management screen never says _"add me to their circle"_ or _"send a circle request"_. There's no request, no negotiation, no notification. You add by username; the server handles both directions silently; nobody is asked anything.

## Removing yourself, leaving, etc.

There is no way to remove yourself _from someone else's circle_. Two reasons:

1. **You don't gain anything by leaving.** Being in Bob's circle gives Bob no power over you. The only thing it does is make it possible for _you_ to invite Bob (if his policy is `circle`). Removing yourself takes away your own capability, not Bob's.
2. **You don't even know you're in it.** Cairn never tells Bob who has him in their circle. Building a "leave their circle" affordance would require surfacing the membership to Bob first, which we explicitly don't want to do.

If you want to make sure someone can never invite you, **block them**. That's the action. The block is one-directional from the blocker's perspective, decisive, and overrides every circle setting on either side.

## In the app

Two surfaces touch the circle directly:

- **Settings → Privacy → Your circle.** Manage your circle: see who's on it, remove anyone, add by username. Single section — _"People in your circle"_ — never any "people who have you in theirs." A _"What is a circle?"_ link at the top opens an in-app explainer (the first paragraph of this doc, near enough). The link stays visible even when the list is non-empty; circles are subtle enough that returning users may want to re-check.
- **Settings → Privacy → Who can invite you.** The three-way policy: Everybody / Your circle / Nobody. The circle only _does_ anything when this is set to **Your circle**.

Two surfaces _use_ the circle indirectly:

- **The invite picker** (members screen → add member). The first section of the picker shows people in _your_ circle who aren't already on the list — these are people you can invite in one tap. (Whether they receive the invite still depends on _their_ policy and whether _you_ are on _their_ circle, but the picker doesn't show you that — it shows you everyone you might plausibly want to invite, and lets the server enforce the policy.)
- **The block list.** Blocking someone overwrites their row's `status` to `blocked` if you previously had them in your circle (or inserts a fresh `blocked` row if you didn't). Unblocking deletes the row outright — your prior circle state is _not_ restored across a block/unblock cycle, by design. Their side of the relationship (whether they have _you_ in _their_ circle) is untouched either way.

## In the data model

`relationships(user_id, other_user_id, status, …)` — one row per directional pair, where `status` is either `'circle'` or `'blocked'`. _"`user_id`'s view of `other_user_id`."_ The same table holds both the circle and the blocklist; absence of a row means neither. RLS:

```sql
create policy relationships_select on public.relationships
  for select using (user_id = public.uid());
create policy relationships_insert on public.relationships
  for insert with check (user_id = public.uid());
create policy relationships_update on public.relationships
  for update using (user_id = public.uid())
  with check (user_id = public.uid());
create policy relationships_delete on public.relationships
  for delete using (user_id = public.uid());
```

Only the owner of the row can read, change, or remove it. The `other_user_id` does not get to see anything. The username-add path writes a row in the _other_ direction via a `security definer` function (`add_circle_by_username`), bypassing RLS as needed but performing the block-check first. The one-sided tap-add path goes through the `add_circle_by_id` RPC — a thin `security definer` function that performs the same `ON CONFLICT DO UPDATE WHERE status <> 'blocked'` upsert, so trying to circle-add a user you have blocked leaves the blocked row unchanged. See `data-model.md` and `invites.md` for the function bodies.

Blocking someone who's already in your circle overwrites the row's `status` from `circle` to `blocked`; unblocking deletes the row. The prior `circle` state is **not** restored across a block/unblock cycle — re-adding requires a deliberate action. Earlier drafts of this doc described "unblock restores the prior state"; collapsing the previous separate `circle_members` and `blocks` tables into one `relationships` row-per-pair makes the simpler "absence = neither" semantic worth more than preserving that low-frequency edge case.

## Why a circle and not just a blocklist?

A reasonable alternative would be: skip circles entirely; everyone is `everybody` by default; if Bob spams you, you block him. We didn't pick this for two reasons:

1. **Asymmetric defaults are valuable.** Some users want to be invitable-by-default (Alice, who's recommending books to her four book-club friends and isn't worried about strangers). Others want to be invitable-only-by-people-they-know (Bob, who has a public-ish display name and doesn't want randos pulling him into "best gym shoes 2026"). The circle exists so Bob can flip a switch and stop worrying. Without it, the only options would be "exposed to everyone" or "invitable by no one."
2. **The mutual-by-default username-add is a real shortcut.** When Alice adds Bob's username, both sides are populated in one operation. This is the path we expect most circles to be built through, and it makes setup cheap. A pure blocklist model has no equivalent — there's no proactive way to say _"these are people I trust"_ in advance.

The circle is not a feature we expect every user to interact with. Most users will leave their policy at **Everybody** and never look at the circle screen. The circle is a tool for the ~20% of users who want a quieter experience, and the symmetric username-add makes it cheap to set up when they decide to.

## Summary

- A circle is **your private inbound allowlist**, used only when your policy is **Your circle**.
- Circles are **one-directional and invisible** to the people in them.
- The **username-add path** is the only way both sides become populated in one step.
- **Block, not "leave their circle"**, is the way to stop someone inviting you.
- Most users will never need to think about this. The ones who do will do it from Settings → Privacy.
