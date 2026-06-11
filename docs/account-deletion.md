# Account deletion

Cairn lets users permanently delete their account. This document covers the model, the schema changes that support it, the server-side function that performs it, and the user-facing flow.

The headline rule: **anonymize, don't cascade**. Deleting an account removes the user's personal data — email, profile, votes — but does *not* remove the items and lists they contributed to shared workspaces. Other members of those lists keep working with the content; the deleted user's name is replaced with a tombstone.

This is the same pattern GitHub, Slack, Discord, and most collaborative tools use, for the same reason: once Alice has added "Bringing Up Baby" to a list she shares with Bob and Carol, that item is partly Bob's and Carol's working material. Removing it when Alice leaves would be hostile to them, and isn't required by GDPR's right to erasure — anonymization satisfies the law as long as the data can no longer be linked back to the natural person.

## What gets deleted, anonymized, or kept

| Data | What happens | Why |
|---|---|---|
| `auth.users` row (email, hashed credentials) | Hard deleted | Personal data; the whole point of the deletion |
| `profiles` row (display_name) | Hard deleted | Personal data; cascades from `auth.users` |
| `user_settings` row (invite_policy) | Hard deleted | Personal preferences; cascades from `auth.users`. Lives in a separate table from `profiles` so owner-only RLS makes every column structurally private — see `data-model.md` "Why `profiles` and `user_settings` are split". (Theme and font size are device-local, in `localStorage`, not in this table — see `ui.md`.) |
| `votes` rows | Hard deleted | A vote *is* a personal opinion. Score recomputes automatically; other members' votes are unaffected. |
| `list_members` rows for the deleted user | Hard deleted | Membership is personal; with no membership row, the user no longer appears anywhere |
| `relationships` rows (either side, regardless of `status`) | Hard deleted | Personal allowlist / blocklist data; nothing of value to preserve. See `invites.md`. |
| `invitations` rows (sender via `created_by` or recipient via `target_user_id`) | Hard deleted | Pending state; no audit value once the user is gone. |
| `items.created_by` / `items.modified_by` / `items.deleted_by` pointing at the user | Repointed to the tombstone user | The item itself is shared content; its existence is not personal data |
| `lists.created_by` / `lists.deleted_by` pointing at the user | Repointed to the tombstone user | Same |
| `list_members.created_by` / `list_members.deleted_by` pointing at the user | Repointed to the tombstone user | Same |
| Lists where the user was the *only* remaining member | Hard deleted, with their items | No one is harmed by removing them, and they were effectively private |
| `/srv/cairn/avatars/{uid}.webp` file on disk | Hard deleted by the avatar sidecar after the auth-row cascade | Personal data; the `profiles` cascade drops the `avatar_version` row, and the web app makes a best-effort `DELETE /avatars/me` to the sidecar. Orphan-swept on a nightly cron if the sidecar call fails. See `avatars.md`. |

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

### `auth.users` columns the tombstone insert depends on

The two-column `(id, email)` form above is deliberately minimal. It works against `supabase/gotrue:v2.158.1` (the version pinned in `docker-compose.yml`) because every other column GoTrue declares either has a server-side default, accepts NULL, or is filled in by GoTrue's own startup migrations *before* our migration runs (`scripts/migrate.sh` waits for `auth.users` to exist before applying any migration numbered `0004` or later, so by the time the tombstone insert lands, GoTrue's column defaults are in place). The columns the rest of the schema depends on are tiny:

- `id uuid primary key` — the FK target for every `created_by` / `modified_by` / `deleted_by` / `user_id` column in `public.*`.
- `email text` — required to exist because GoTrue stores the signup address there and the magic-link delivery reads it. The migration writes only the tombstone's `null` value into this column; the schema deliberately does **not** read it elsewhere. The on-signup trigger creates `profiles` rows with the fixed placeholder `'New user'` rather than deriving from the email's local part, because the local part is frequently the user's real name and rendering it back as `display_name` would leak email content.

Test parity: `db/test-bootstrap.sql` stubs `auth.users` with exactly `(id, email, role, created_at)`. The first two are what the migration needs; `role` and `created_at` are carried because GoTrue and PostgREST both reference `role` for JWT-claim defaulting and `created_at` is universal enough to be cheap. Anything beyond those four is deliberately *not* stubbed, so the test path can't paper over a divergence — it has the same surface area as the migration.

**Caveat for future GoTrue upgrades.** Bumping the `supabase/gotrue` image is the moment this contract can break. Any new GoTrue version that adds a column to `auth.users` declared `NOT NULL` *without* a default will turn the bare `insert into auth.users (id, email)` above into a runtime failure on the first apply of a fresh DB — and the test path won't catch it because `test-bootstrap.sql` doesn't run GoTrue's migrations. A second, quieter failure mode also lives here: our `tg_profile_on_signup` AFTER INSERT trigger is attached to `auth.users` from the first migration that touches it, and a future GoTrue release that DROPs and recreates the table (rather than ALTERing in place) would silently take our trigger with it — new signups would land in `auth.users` but no `profiles` or `user_settings` row would ever be created, surfacing hours or days later as 404s on every fresh user's first profile read. Whoever bumps the image: check the GoTrue CHANGELOG for `auth.users` schema changes, run `\d auth.users` against a freshly-started container, confirm `tg_profile_on_signup` still appears in `select tgname from pg_trigger where tgrelid = 'auth.users'::regclass`, and either extend this insert (and its companion in `test-bootstrap.sql`) or add the new column to the stub — and re-attach the trigger if it has gone missing — before merging the bump.

Why a sentinel UUID rather than `null`?

- Every consumer of `created_by` already expects a UUID and renders an avatar + display name from it. One row covers every consumer at once with no `coalesce(display_name, 'Deleted')` sprinkled across queries.
- Foreign keys stay `NOT NULL`, which preserves a useful invariant: every item and list has *some* attribution, even if anonymized.
- Joins to `profiles` don't need outer-join logic. The tombstone profile renders as a gray avatar with the text "Deleted user" — see `ui.md` for the visual.

The tombstone user has no email, no password, cannot log in, and is not a member of any list. RLS policies treat it like any other UUID — but since it has zero memberships and no JWT can ever claim its `sub`, it never sees anything.

## Schema changes

There are no ALTERs needed: the table blocks in `data-model.md` already declare the seven attribution FKs with `on delete set default` and a `default` of the tombstone UUID, baked in from the first migration. The `default` is what `on delete set default` repoints attribution to when the referenced `auth.users` row is deleted, so deleting a user's auth row anonymizes every list, item, and membership they touched in one cascade — no per-row UPDATE pass.

`profiles.avatar_version` (shipped in `0005_avatars.sql` alongside the avatar sidecar — see `avatars.md`) needs no special handling here either. The `profiles` row cascades from `auth.users` and the integer goes with it; the *file* at `/srv/cairn/avatars/{uid}.webp` is the only piece of personal data the cascade doesn't reach, and the web app's post-RPC `DELETE /avatars/me` call to the sidecar handles it (best-effort; the nightly orphan-sweep covers the failure case).

The seven columns:

- `lists.created_by`, `lists.deleted_by`
- `items.created_by`, `items.modified_by`, `items.deleted_by`
- `list_members.created_by`, `list_members.deleted_by`

`list_members.user_id` and `votes.{item_id, user_id}` keep `on delete cascade` instead — those are records of a personal action by the user, and cascade is the desired semantics. `profiles.id` keeps `on delete cascade` from `auth.users` for the same reason: when the user goes, their profile goes with them.

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
  --   profiles       → cascade
  --   user_settings  → cascade
  --   votes          → cascade
  --   list_members   → cascade (where user_id = uid)
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
2. On 204, call `DELETE /avatars/me` on the avatar sidecar to unlink the user's avatar file. Best-effort: ignore the response. The orphan-sweep cron (see `avatars.md`) reclaims the file if this call fails or never reaches the sidecar.
3. Call `DELETE /auth/session` to clear the `cairn_session` cookie, then show the "Account deleted" confirmation screen.
4. On any error from the RPC itself, show the error and leave the user logged in.

The app should *not* try to clean up local caches first — the API call is the source of truth, and any local state is discarded on logout anyway. The sidecar call is the only side-effect the RPC's atomic transaction can't perform itself, and it's intentionally fire-and-forget.

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

- **Export before delete — step 12, not yet built.** See `data-export.md` for the planned format, the `export_my_data()` RPC, and the in-screen integration: the Delete account screen carries a small non-blocking *"Want a copy first?"* panel above the destructive button, intended to link to the Data export hub (screen E5 in `design/cairn-export-screens.jsx`). Until export lands (step 12), that panel is present but its Download action is disabled ("coming soon"). Export and delete are independent flows — neither blocks the other; the panel is a courtesy.
- **Grace period.** Some products soft-delete the account for 30 days before hard-deleting, so a regretful user can recover. Cairn does not — the trash already exists for items and lists; an account-level undo adds complexity for a rare case. Re-evaluate if we ever see a user request it.
- **Tombstone hygiene.** Over years, the tombstone user accumulates attribution for content from many deleted users. That's fine — they're indistinguishable to other members anyway, and the tombstone has no privacy impact. No cleanup needed.
