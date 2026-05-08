# Account deletion

Cairn lets users permanently delete their account. This document covers the model, the schema changes that support it, the server-side function that performs it, and the user-facing flow.

The headline rule: **anonymize, don't cascade**. Deleting an account removes the user's personal data — email, profile, votes — but does *not* remove the items and lists they contributed to shared workspaces. Other members of those lists keep working with the content; the deleted user's name is replaced with a tombstone.

This is the same pattern GitHub, Slack, Discord, and most collaborative tools use, for the same reason: once Alice has added "Bringing Up Baby" to a list she shares with Bob and Carol, that item is partly Bob's and Carol's working material. Removing it when Alice leaves would be hostile to them, and isn't required by GDPR's right to erasure — anonymization satisfies the law as long as the data can no longer be linked back to the natural person.

## What gets deleted, anonymized, or kept

| Data | What happens | Why |
|---|---|---|
| `auth.users` row (email, hashed credentials) | Hard deleted | Personal data; the whole point of the deletion |
| `profiles` row (display_name, theme, font_size, invite_policy) | Hard deleted | Personal data; cascades from `auth.users` |
| `votes` rows | Hard deleted | A vote *is* a personal opinion. Score recomputes automatically; other members' votes are unaffected. |
| `list_members` rows for the deleted user | Hard deleted | Membership is personal; with no membership row, the user no longer appears anywhere |
| `circle_members` rows (either side) | Hard deleted | Personal allowlist data; nothing of value to preserve. See `invites.md`. |
| `blocks` rows (either side) | Hard deleted | Same — personal data, no shared value. |
| `invitations` rows (sender or recipient) | Hard deleted | Pending state; no audit value once the user is gone. |
| `items.created_by` / `items.modified_by` / `items.deleted_by` pointing at the user | Repointed to the tombstone user | The item itself is shared content; its existence is not personal data |
| `lists.created_by` / `lists.modified_by` / `lists.deleted_by` pointing at the user | Repointed to the tombstone user | Same |
| `list_members.added_by` / `list_members.deleted_by` pointing at the user | Repointed to the tombstone user | Same |
| Lists where the user was the *only* remaining member | Hard deleted, with their items | No one is harmed by removing them, and they were effectively private |

A "list with no live members" was already an implied dead state in the schema — this gives it an explicit cleanup point.

## The tombstone user

A single sentinel row in `auth.users` represents every deleted account, uniformly. Items, lists, and memberships that used to be attributed to a real user point to this row instead.

```sql
-- Inserted by migration, never deleted.
insert into auth.users (id, email)
values ('00000000-0000-0000-0000-000000000000', null)
on conflict (id) do nothing;

insert into public.profiles (id, display_name)
values ('00000000-0000-0000-0000-000000000000', 'Deleted user')
on conflict (id) do nothing;
```

Both inserts use `on conflict (id) do nothing`. The migration is run exactly once via the `_migrations` ledger, but the idempotency belongs in the SQL anyway: it protects against a re-applied migration on a non-empty test DB and against the `tg_profile_on_signup` trigger racing the manual profile insert (the trigger handles the tombstone case by skipping `new.id = '00000000-…'`, but the conflict guard is correct defence-in-depth).

Why a sentinel UUID rather than `null`?

- Every consumer of `created_by` already expects a UUID and renders an avatar + display name from it. One row covers every consumer at once with no `coalesce(display_name, 'Deleted')` sprinkled across queries.
- Foreign keys stay `NOT NULL`, which preserves a useful invariant: every item and list has *some* attribution, even if anonymized.
- Joins to `profiles` don't need outer-join logic. The tombstone profile renders as a gray avatar with the text "Deleted user" — see `ui.md` for the visual.

The tombstone user has no email, no password, cannot log in, and is not a member of any list. RLS policies treat it like any other UUID — but since it has zero memberships and no JWT can ever claim its `sub`, it never sees anything.

## Schema changes

The original schema (`data-model.md`) declares `created_by` etc. as `not null references auth.users(id)` with no `on delete` action — meaning a `DELETE FROM auth.users` would fail with a foreign-key violation. Account deletion is the one place where we *do* delete from `auth.users`, so the FKs need an action. We use `on delete set default` and set the default to the tombstone UUID.

```sql
-- Repeat for: lists.created_by, lists.modified_by, lists.deleted_by,
--             items.created_by, items.modified_by, items.deleted_by,
--             list_members.added_by, list_members.deleted_by.

alter table public.lists
  alter column created_by set default '00000000-0000-0000-0000-000000000000',
  drop constraint lists_created_by_fkey,
  add  constraint lists_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set default;
```

`votes` and `list_members` keep their existing `on delete cascade` — those are the two places we *do* want hard cascade, because both are records of a personal action by the user.

`profiles` keeps `on delete cascade` from `auth.users` — when the user goes, their profile goes with them.

## The `delete_account` function

User-initiated deletion is exposed as a single Postgres function the web app calls via PostgREST RPC. Doing the work server-side in one transaction keeps it atomic and lets us run it as `security definer` so the user's own JWT can trigger a delete from `auth.users` without holding `DELETE` privileges on that table directly.

```sql
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := public.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if uid = '00000000-0000-0000-0000-000000000000' then
    raise exception 'cannot delete the tombstone user';
  end if;

  -- Hard-delete lists where the deleted user was the only remaining member.
  -- Their items cascade; their other members rows cascade; their votes cascade.
  delete from public.lists l
  where not exists (
    select 1 from public.list_members lm
    where lm.list_id = l.id
      and lm.deleted_at is null
      and lm.user_id <> uid
  );

  -- Delete the auth row. Cascades:
  --   profiles      → cascade
  --   votes         → cascade
  --   list_members  → cascade (where user_id = uid)
  --   created_by / modified_by / etc. → set default (tombstone)
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_account() from public;
grant  execute on function public.delete_account() to authenticated;
```

A few notes:

- **Order matters.** Lists-where-only-this-user is computed *before* the delete on `auth.users`, because membership cascades clear out the `list_members` rows we need for that query.
- **The function is the only sanctioned path.** PostgREST does not expose `DELETE /auth.users` to authenticated clients (that table is in the `auth` schema, not `public`). The function is what the API surface offers; the policy is in the function body, not in RLS.
- **It runs as the user.** The `security definer` bit elevates privileges *for the duration of the function body* — but the body's first act is to read `public.uid()` from the caller's JWT and use it as the deletion target. There is no way to delete someone else's account through this function.
- **No undo.** Once committed, the data is gone. The user-facing flow makes this very clear before calling.

## API surface

```
POST /rpc/delete_account
Authorization: Bearer <user JWT>
```

Empty body, empty success response (HTTP 204). The web app should:

1. Call this endpoint.
2. On 204, call `DELETE /auth/session` to clear the `cairn_session` cookie, then show the "Account deleted" confirmation screen.
3. On any error, show the error and leave the user logged in.

The app should *not* try to clean up local caches first — the API call is the source of truth, and any local state is discarded on logout anyway.

## What the user sees

The **Delete account** flow lives in Settings → Account, below Sign out. See `ui.md` for the full visual treatment; the high-level shape is:

1. **Settings.** A red "Delete account" row with a chevron.
2. **Delete account screen.** A full-screen page (not a sheet — this isn't a quick action) explaining exactly what happens, in plain language. The page lists, in order:
   - What's permanently removed (email, profile, votes).
   - What stays on shared lists (items they added, with attribution changing to "Deleted user").
   - What's deleted along with them (lists only they used).
   - That this can't be undone.
3. A required typed confirmation: the user types `delete` to enable the destructive button. (Lower bar than "type your full email" — but high enough that no one taps through by accident.)
4. **Confirmation.** A simple screen confirming the account is gone, with a button back to the sign-in screen.

The copy avoids legalese and avoids euphemism. We say "permanently removed," not "deactivated"; we say "items you added on shared lists stay," not "your contributions are preserved." The user is making a real decision; the copy treats them like an adult.

## What we tell users in advance

Cairn's onboarding doesn't currently surface this as a feature. It shouldn't need to — account deletion is a right, not a feature. The Settings entry is enough. If we ever publish a privacy policy (we should), it should reference this document's behavior in plain terms: what's deleted, what's anonymized, what's kept.

## Future work

- **Export before delete.** Right now the user has no way to take their data with them before deleting. A "Download my data" button on the Delete account screen, producing a JSON dump of every list they were on with their own contributions highlighted, would be a kindness. It's not v1.
- **Grace period.** Some products soft-delete the account for 30 days before hard-deleting, so a regretful user can recover. Cairn does not — the trash already exists for items and lists; an account-level undo adds complexity for a rare case. Re-evaluate if we ever see a user request it.
- **Tombstone hygiene.** Over years, the tombstone user accumulates attribution for content from many deleted users. That's fine — they're indistinguishable to other members anyway, and the tombstone has no privacy impact. No cleanup needed.
