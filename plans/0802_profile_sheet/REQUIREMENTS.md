# Requirements: Profile sheet + cancel-invite RLS

Sub-step 0802 of the step-8 invite/circles UI layer. Adds the
`invitations_delete` RLS policy that lets an inviter cancel their own
pending invite directly, the `invitations.svelte.ts` module (sent-invites
shape only; inbox/send/accept/decline land in 0803), and the `<ProfileSheet>`
bottom-sheet component that drives all per-user relationship actions from a
single, reusable surface.

## R1. `invitations_delete` RLS policy

A `FOR DELETE` policy named `invitations_delete` on `public.invitations` with
`USING (created_by = public.uid())` restricts direct deletes to the row's
creator. An invitee cannot delete a row they received; an outsider cannot
delete any row they cannot even see. The policy is the DB-level gate for the
_Cancel pending invite_ action in the profile sheet.

## R2. DELETE grant on `invitations`

`GRANT DELETE ON public.invitations TO authenticated` must accompany the
policy. Without the grant, PostgREST silently returns an empty result for a
DELETE even when the policy would permit it (PostgREST interprets a missing
grant as "no rows affected," not an error).

## R3. `invitations.svelte.ts` sent-invites shape

A new file at `web/src/lib/invite/state/invitations.svelte.ts` exposes:

- `invitations` — reactive `$state` object with a `sent: SentEntry[]`
  collection (entries: `{ id, listId, targetUserId | null, targetEmail | null,
createdAt }`).
- `loadSent()` — async function; `GET /invitations?created_by=eq.<my-uid>`,
  populates `invitations.sent`.
- `pendingInviteFor(listId: string, userId: string): string | null` — pure
  helper; scans `invitations.sent` and returns the pending invitation `id` for
  the given `(listId, userId)` pair, or `null` if none.
- `cancelInvitation(id: string): Promise<void>` — `DELETE /invitations?id=eq.<id>`,
  removes the matching entry from `invitations.sent` on success.

The file is introduced here with these four exports. 0803 will append
`inbox`, `loadInbox`, `sendInvitation`, `acceptInvitation`, and
`declineInvitation` to the same file in a later sub-plan.

## R4. `<ProfileSheet>` component

A bottom-sheet component at `web/src/lib/profile/components/ProfileSheet.svelte`
with props:

```ts
type Props = {
	userId: string;
	displayName: string;
	avatarVersion: number;
	pendingInvitationId?: string | null;
	onclose: () => void;
};
```

The sheet is always `open` when mounted (the caller mounts/unmounts it; it
does not manage its own open state). It renders:

1. A drag handle (40×4 px, `border-radius: 99px`, `background: var(--stone-lt)`,
   centred, 16 px bottom margin).
2. A 68 px `<Avatar>` (centred).
3. Display name at 18 px, weight 600 (centred).
4. A state badge below the name, shown only when applicable:
   - `IN YOUR CIRCLE` — 12 px, mono font, weight 600, `color: var(--sage)`.
   - `BLOCKED` — same style, `color: var(--ember)`.
   - No badge for a stranger.
5. A vertical stack of action rows (gap 8 px, margin-top 18 px). Which rows
   render depends on the viewer's current relationship to `userId` (derived
   from `relationships.circle` / `relationships.blocked`):

| Row                     | Shown when                                    |
| ----------------------- | --------------------------------------------- |
| Add to your circle      | `userId` not in `circle` and not `blocked`    |
| Remove from your circle | `userId` is in `circle`                       |
| Block `{displayName}`   | `userId` not blocked (always, unless blocked) |
| Unblock                 | `userId` is blocked                           |
| Cancel pending invite   | `pendingInvitationId` is non-null             |

Action semantics:

- **Add to your circle** — quiet; calls `addCircleById(userId)`.
- **Remove from your circle** — quiet; calls `removeFromCircle(userId)`.
- **Unblock** — quiet; calls `unblock(userId)`.
- **Block** — opens an inline confirmation prompt: _"Block {displayName}? They
  won't be able to invite you to any list."_ with `[Cancel]` / `[Block]` button
  pair (Block on the right — committal per button-pair convention). Confirmed
  Block calls `block(userId)`.
- **Cancel pending invite** — quiet; calls `cancelInvitation(pendingInvitationId)`,
  then `onclose()`.

## R5. Own-avatar short-circuit

When `userId === profile.uid` (the viewer taps their own avatar), `<ProfileSheet>`
detects the match in a `$derived` and immediately calls `goto(resolve('/settings'))`
plus `onclose()`. No action rows or badge are rendered in this case. This
keeps the profile sheet as a "looking at someone else" surface and directs
the user to Settings for their own profile.

## Non-requirements (explicitly excluded)

- **Live consumer in 0802** — ProfileSheet has no live mount point in this
  sub-plan. The first user-reachable tap lands in 0803's Members screen. Vitest
  covers all state variants here so the component ships tested.
- **`inbox` / `loadInbox` / `sendInvitation` / `acceptInvitation` /
  `declineInvitation`** — these are part of the `invitations.svelte.ts`
  module but are deferred to 0803's R15 task. The file is authored here
  so 0803 can extend it.
- **`ProfileSheet` mock stub** — 0803 will create
  `__mocks__/ProfileSheet.svelte` when it needs to mock the sheet in its own
  Vitest tests. No need to pre-create the stub in this plan.
- **Shared-lists section in profile sheet** — `docs/invites.md` "privacy by
  minimalism" explicitly omits shared lists from the sheet. Not in scope.
- **Confirmation on Unblock / Remove from circle** — these are quiet actions.
  The design JSX shows no Unblock confirmation state. Only Block has the inline
  confirmation prompt. An earlier version of `docs/ui.md` had this wrong; 0800's
  Phase 0 already corrected it — no action needed here.
- **`has_policy` assertion in `schema_shape.sql`** — `schema_shape.sql`'s
  role is structural shape (tables, columns, functions); no existing policies
  are checked there by name. The `invitations_delete.sql` behavior test
  covers policy existence implicitly: if the policy is missing the positive
  case (inviter can delete own row) fails. Adding a `has_policy` check for
  only this one policy while the ~10 existing policies go unchecked would be
  inconsistent; a full sweep is out of scope here.
