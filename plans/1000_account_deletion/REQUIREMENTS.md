# Requirements: Account deletion

Cairn lets a signed-in user permanently delete their own account from
Settings. This exists because account deletion is a right, not a feature
(GDPR erasure): the user's personal data (e-mail, profile, votes, settings,
memberships) is hard-deleted, while items and lists they contributed to
*shared* workspaces stay — with their attribution repointed to the tombstone
"Deleted user" so co-members aren't robbed of their working material. The
model is *anonymize, don't cascade*, specified in `docs/account-deletion.md`.

Most of the supporting schema already shipped in step 1 (the tombstone user,
the `ON DELETE SET DEFAULT` attribution FKs, the `ON DELETE CASCADE` personal
FKs) and the tombstone *display* already works in the UI (`Avatar.svelte`,
`ItemsScreen.svelte`). This plan adds the deletion path itself: the RPC and
its test, and the Settings flow that calls it.

## R1. `public.delete_account()` RPC deletes the caller's own account

A `SECURITY DEFINER` function `public.delete_account()` (returns `void`,
`language plpgsql`, `SET search_path = public, auth`) permanently deletes the
account of the authenticated caller and no one else. The caller's UUID is
read from the request JWT via `public.uid()`; the function never accepts a
target-user argument. Body, per `docs/account-deletion.md`:

```sql
-- 1. Hard-delete lists where the caller was the only remaining live member
--    (their items, members, and votes cascade).
DELETE FROM public.lists l
WHERE NOT EXISTS (
  SELECT 1 FROM public.list_members lm
  WHERE lm.list_id = l.id
    AND lm.deleted_at IS NULL
    AND lm.user_id <> uid
);
-- 2. Delete the auth row; FKs do the rest:
--    profiles / user_settings / votes / list_members(user_id) → CASCADE
--    created_by / modified_by / deleted_by → SET DEFAULT (tombstone)
DELETE FROM auth.users WHERE id = uid;
```

Step order is load-bearing: the sole-member-list delete must run *before*
the `auth.users` delete, because the membership cascade clears the rows the
`NOT EXISTS` check reads.

## R2. The RPC refuses unauthenticated and tombstone callers

Before doing any work, `delete_account()` guards:

- If `public.uid()` IS NULL → `RAISE EXCEPTION 'not authenticated' USING
  errcode = '28000'`.
- If `public.uid() = '00000000-0000-0000-0000-000000000000'` → `RAISE
  EXCEPTION 'cannot delete the tombstone user' USING errcode = '28000'`.

The `28000` errcode matches the idiom already used by `public.create_list()`
in `0004_domain_schema.sql` (the doc's snippet omits an errcode; we set it
for consistency).

## R3. The RPC is reachable only by the `authenticated` role

`REVOKE ALL ON FUNCTION public.delete_account() FROM public;` then `GRANT
EXECUTE ON FUNCTION public.delete_account() TO authenticated;`. The `anon`
role must be denied at the GRANT layer (PostgREST surfaces this as `42501`).
There is no RLS or `DELETE` grant on `auth.users` for end users — the
function is the *only* sanctioned deletion path, and its `SECURITY DEFINER`
elevation is scoped to a body that targets only `public.uid()`.

## R4. Deletion anonymizes shared content and cascades personal data

After a successful `delete_account()` by user U (verified by pgTAP, positive
*and* negative):

- A list where U was the only remaining live member is **gone**, along with
  its items and votes.
- A list with at least one other live member **survives**; U's
  `list_members` row for it is gone (cascade), U's votes on its items are
  gone (cascade), and any `created_by`/`modified_by`/`deleted_by` on
  surviving rows that pointed at U now point at the tombstone UUID.
- An attribution column pointing at a *different, non-deleted* user is
  **unchanged** (the cascade only repoints FKs that referenced U — this
  guards against an order-dependent regression).
- U's `profiles` and `user_settings` rows are gone (cascade).
- The **tombstone** `profiles` row (`00000000-…`) is untouched and still
  present.

## R5. Settings exposes a destructive "Delete account" entry

The Settings → Account section gains a "Delete account" row below "Sign out"
(left-of-pair = backward/destructive ordering is preserved). The row renders
in the destructive tone (`var(--ember)`) with a `trash` lead icon and a
`data-test="delete-account"` hook, and navigates to a dedicated full-screen
route. To support this, the shared `NavRow` component gains an optional
`tone` prop (`'ink' | 'destructive'`, default `'ink'`) that colours the lead
icon and title; no hard-coded hex — the destructive colour is `var(--ember)`.

## R6. The Delete-account screen explains the consequences in plain British English

A full-screen page (not a sheet) at `(app)/settings/delete-account`,
rendered by a screen component. It states, in plain language and British
spelling, three things in order, matching `docs/account-deletion.md` →
"What the user sees":

- **What's permanently removed** — their e-mail (hyphenated), profile, and
  votes.
- **What stays on shared lists** — items they added, with their name
  changing to "Deleted user".
- **What's deleted with them** — lists where they were the only remaining
  member.

Plus a "This can't be undone." line. User-facing pronouns are they/them.
Copy avoids euphemism ("permanently removed", not "deactivated").

## R7. A typed "delete" gate arms the destructive button

The destructive "Delete my account" button is disabled until the user types
`delete` (case-sensitive, trimmed) into a confirmation field. This is a
deliberate friction gate so no one deletes by accidental tap. The button
uses the destructive tone; while the deletion request is in flight it is
disabled to prevent double-submit.

## R8. The "Want a copy of your data first?" panel is present but stubbed disabled

The screen shows the data-export courtesy panel from the design ("Want a
copy of your data first?") for layout fidelity, but — because data export
(step 12) is not yet built — its Download action is rendered **disabled**
(e.g. a "coming soon" affordance) and links nowhere. It carries a
`TODO(step-12)` to wire it to the export hub once that lands. The panel is
non-blocking either way: a user can delete without exporting.

## R9. On confirm, the app runs the documented teardown sequence

When the armed button is pressed, the web app performs, in order, matching
`docs/account-deletion.md` → "API surface":

1. `POST /rpc/delete_account` with an empty body, via the PostgREST wrapper.
2. On success, a best-effort fire-and-forget `DELETE /avatars/me` to the
   avatar sidecar (errors swallowed; the nightly orphan-sweep is the
   backstop).
3. Clears the session cookie via `DELETE /auth/session` (the same call
   `signOut()` makes).
4. Shows the post-deletion confirmation (R10).

If the RPC itself errors, the app shows the error inline, leaves the user
signed in, and does **not** run steps 2–4.

## R10. Post-deletion confirmation, then back to sign-in

On success the screen swaps to a confirmation view ("Your account has been
deleted.") with a single "Back to sign in" action. This view renders inline
within the delete screen while the session store is still `signed-in`, so
the root auth guard does not bounce the user mid-flow; pressing "Back to
sign in" calls the existing `signOut()`, which flips the store to
`signed-out` and lets the guard redirect to `/auth/login`. No new public
route is added (no change to `auth-paths.ts` or `public-paths.ts`).

## R11. The delete flow has Vitest and Playwright coverage

- **Vitest** (component): the delete screen disables the button until
  `delete` is typed; a confirmed press calls `POST /rpc/delete_account`; RPC
  success shows the confirmation view; RPC error keeps the form and shows
  the message; the export Download button is disabled. Plus: the Settings
  "Delete account" row is present and navigates.
- **Playwright** (e2e): a throwaway user signs in, deletes their account via
  the typed gate, lands on the confirmation view, and is bounced to
  `/auth/login`.

## R12. Docs reconciled to reality

`docs/account-deletion.md` → "Future work" currently asserts "Export before
delete — **done**." That is false (export is step 12, unbuilt). The bullet
is corrected to state that export is a later step and that the delete
screen's export panel is stubbed disabled until then. The rest of the doc
remains the source of truth.

## Non-requirements (explicitly excluded)

- **Data export itself (step 12).** The export RPC, routes, and hub screen
  are out of scope; this plan only stubs the courtesy panel disabled.
- **Grace period / account-level undo.** Deletion is immediate and
  irreversible by design (`docs/account-deletion.md` → "Future work"); no
  soft-delete-then-purge window.
- **Tombstone attribution display.** Already shipped — `Avatar.svelte`
  renders the gray disc for `TOMBSTONE_UID` and `ItemsScreen.svelte` applies
  the `.tombstone` style. Not re-implemented here.
- **Schema/FK changes.** The tombstone user and all attribution/personal FKs
  already exist from `0004_domain_schema.sql`; no ALTERs and no per-row
  UPDATE pass are needed or wanted.
- **Admin-initiated deletion (`delete_account_as`).** That belongs to step
  11 (admin), not here.
- **Test-bootstrap changes.** `db/test-bootstrap.sql`'s `auth.users` stub
  already covers the columns this migration touches.
