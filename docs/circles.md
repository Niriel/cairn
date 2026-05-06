# Circles

A circle is one of those features that's tempting to misunderstand because the word *circle* — like *friend*, *follow*, or *contact* — drags in baggage from social networks where these things are mutual, public, or both. In Cairn it's none of that. This document fixes the model in one place so the docs and the app can refer back to it.

## What a circle is

> **Your circle is a private list of people you'll let invite you to lists, when your privacy is set to *Your circle*.**

That's the whole feature. It is:

- **Inbound only.** It governs invitations *coming to you*. It does not affect your ability to invite anyone — for that, see "the other person's circle" below.
- **Yours alone.** Each user manages their own circle. Bob's circle is Bob's; Alice doesn't see who's in it. Cairn doesn't have a notion of *mutual* circles, even when (by coincidence or by the email-add path) two people happen to have each other in theirs.
- **Invisible to the people in it.** When Alice adds Bob to her circle, Bob is not notified, and Bob never sees that he's in Alice's circle. Surfacing it would turn a private permission setting into a quasi-social signal — exactly the kind of social-network behaviour Cairn is trying to avoid.
- **Conditional.** It only matters when your invite policy is set to **Your circle**. Under the default policy (**Everybody**), the circle exists but does nothing — anyone with a Cairn account can invite you. Under **Nobody**, the circle does nothing — no one can.

## What a circle is not

- **Not a friends list.** Friendship is mutual and the other person typically knows. A circle is one-way and silent.
- **Not a follow.** Following implies subscribing to someone's content. There is nothing to subscribe to in Cairn — no feed, no posts, no activity stream. Putting Bob in your circle does not show you anything new about Bob.
- **Not a permission for the other person.** Adding Bob to *your* circle does not give Bob any new capability. It gives **you** the capability to *receive* invites from Bob (when your policy is `circle`).
- **Not visible to anyone but you.** Cairn never renders "Bob has Alice in his circle" anywhere — not on a profile screen, not in a list members view, not on the circle-management screen. The data isn't even returned by RLS.

## The two circles in any interaction

A confusing thing about circles is that *both people's* circles can matter in a single invite, but they govern different things. Spell it out:

When Alice tries to invite Bob to a list:

- **Bob's circle** is what gets checked. If Bob's policy is **Your circle**, Cairn looks at Bob's circle and asks, *"is Alice on it?"* If yes, the invite goes through. If no, the invite is silently rejected. Alice gets a generic *"Couldn't send invite"* message either way.
- **Alice's circle** is irrelevant to whether the invite reaches Bob.

When Bob tries to invite Alice to a list:

- **Alice's circle** is what gets checked.
- **Bob's circle** is irrelevant.

The mnemonic: *the recipient's circle gates the invite.* Yours gates incoming, theirs gates outgoing.

## Why so quiet?

Cairn deliberately doesn't notify either side when a circle membership changes. Three reasons:

1. **The recipient's experience doesn't change.** Being in Alice's circle gives Bob no new capabilities, no new content, no new state to react to. He doesn't gain access to anything; he simply becomes someone Alice's account is willing to receive invites from. There's nothing for him to confirm, decline, or even acknowledge.
2. **Surfacing it would turn it social.** If we told Bob "Alice added you to her circle," he might infer something about Alice's intent toward him, feel obligated to reciprocate, or treat it as a status. None of that is the goal. The circle is a private spam filter, not a relationship marker.
3. **Notifications are reserved for things that need a response.** A new invite needs a response (accept or decline). A circle change does not. Cairn's bias is toward fewer interruptions; we hold the line.

## The email-add path

There's exactly one way both people end up in each other's circles: the **add by email** path on the circle-management screen.

When Alice types `bob@example.net` and confirms, the server (in a single transaction):

1. Adds Bob to Alice's circle.
2. Adds Alice to Bob's circle, *unless* Bob has Alice on his blocklist (in which case step 2 is silently skipped).

This is the symmetric default. The reasoning: if Alice is willing to type Bob's email and explicitly add him as someone she'd accept invites from, she's also implicitly trusting him enough that *he should be willing to accept invites from her* — and we save Bob the friction of doing the same dance from his side. The symmetric outcome makes the common case (Alice and Bob are friends and both want collaboration) work in one tap, not two.

The exception (Bob has Alice blocked) is the one case where Bob's intent dominates. The block is the strongest signal in the system; it always wins. Alice still gets a generic success toast — we don't tell her about Bob's block — but Bob's side stays untouched.

This is also why the circle-management screen never says *"add me to their circle"* or *"send a circle request"*. There's no request, no negotiation, no notification. You add by email; the server handles both directions silently; nobody is asked anything.

## Removing yourself, leaving, etc.

There is no way to remove yourself *from someone else's circle*. Two reasons:

1. **You don't gain anything by leaving.** Being in Bob's circle gives Bob no power over you. The only thing it does is make it possible for *you* to invite Bob (if his policy is `circle`). Removing yourself takes away your own capability, not Bob's.
2. **You don't even know you're in it.** Cairn never tells Bob who has him in their circle. Building a "leave their circle" affordance would require surfacing the membership to Bob first, which we explicitly don't want to do.

If you want to make sure someone can never invite you, **block them**. That's the action. The block is one-directional from the blocker's perspective, decisive, and overrides every circle setting on either side.

## In the app

Two surfaces touch the circle directly:

- **Settings → Privacy → Your circle.** Manage your circle: see who's on it, remove anyone, add by email. Single section — *"People in your circle"* — never any "people who have you in theirs." A *"What is a circle?"* link at the top opens an in-app explainer (the first paragraph of this doc, near enough). The link stays visible even when the list is non-empty; circles are subtle enough that returning users may want to re-check.
- **Settings → Privacy → Who can invite you.** The three-way policy: Everybody / Your circle / Nobody. The circle only *does* anything when this is set to **Your circle**.

Two surfaces *use* the circle indirectly:

- **The invite picker** (members screen → add member). The first section of the picker shows people in *your* circle who aren't already on the list — these are people you can invite in one tap. (Whether they receive the invite still depends on *their* policy and whether *you* are on *their* circle, but the picker doesn't show you that — it shows you everyone you might plausibly want to invite, and lets the server enforce the policy.)
- **The block list.** Blocking someone doesn't remove them from any circle (yours or theirs); it just adds a row to your blocklist that the invite-check consults first. Unblocking restores the prior state without any reconciliation needed.

## In the data model

`circle_members(user_id, member_id, added_at)` — one row per directional membership. *"`user_id` has `member_id` on their circle."* RLS:

```sql
create policy circle_select on public.circle_members
  for select using (user_id = auth.uid());
create policy circle_insert on public.circle_members
  for insert with check (user_id = auth.uid());
create policy circle_delete on public.circle_members
  for delete using (user_id = auth.uid());
```

Only the owner of the circle can read or write rows in it. The `member_id` does not get to see them. The email-add path writes a row in the *other* direction via a `security definer` function (`add_circle_by_email`), bypassing RLS as needed but performing the block-check first. See `data-model.md` and `invites.md` for the function bodies.

## Why a circle and not just a blocklist?

A reasonable alternative would be: skip circles entirely; everyone is `everybody` by default; if Bob spams you, you block him. We didn't pick this for two reasons:

1. **Asymmetric defaults are valuable.** Some users want to be invitable-by-default (Alice, who's recommending books to her four book-club friends and isn't worried about strangers). Others want to be invitable-only-by-people-they-know (Bob, who has a public-ish display name and doesn't want randos pulling him into "best gym shoes 2026"). The circle exists so Bob can flip a switch and stop worrying. Without it, the only options would be "exposed to everyone" or "invitable by no one."
2. **The mutual-by-default email-add is a real shortcut.** When Alice adds Bob's email, both sides are populated in one operation. This is the path we expect most circles to be built through, and it makes setup cheap. A pure blocklist model has no equivalent — there's no proactive way to say *"these are people I trust"* in advance.

The circle is not a feature we expect every user to interact with. Most users will leave their policy at **Everybody** and never look at the circle screen. The circle is a tool for the ~20% of users who want a quieter experience, and the symmetric email-add makes it cheap to set up when they decide to.

## Summary

- A circle is **your private inbound allowlist**, used only when your policy is **Your circle**.
- Circles are **one-directional and invisible** to the people in them.
- The **email-add path** is the only way both sides become populated in one step.
- **Block, not "leave their circle"**, is the way to stop someone inviting you.
- Most users will never need to think about this. The ones who do will do it from Settings → Privacy.
