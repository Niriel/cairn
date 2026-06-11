# Plan: Account deletion

Implements step 10 of `plans/0000_implementation_order.md`. A signed-in user
can permanently delete their account from Settings; personal data is
hard-deleted while shared content is anonymized to the tombstone user. This
exists because deletion is a GDPR right; the model and copy are specified in
`docs/account-deletion.md`.

## Context

The heavy lifting for account deletion landed in step 1. As of this branch:

- The **tombstone user** (`auth.users` + `profiles`, UUID
  `00000000-0000-0000-0000-000000000000`) is seeded in
  `db/migrations/0004_domain_schema.sql`, and `tg_profile_on_signup` already
  skips it.
- All seven attribution FKs (`lists.created_by/deleted_by`,
  `items.created_by/modified_by/deleted_by`,
  `list_members.created_by/deleted_by`) declare `ON DELETE SET DEFAULT` with
  the tombstone UUID as their default; `votes.*`, `list_members.user_id`,
  and `profiles.id` declare `ON DELETE CASCADE`. So deleting a user's
  `auth.users` row anonymizes shared attribution and cascades personal data
  in one statement — **no ALTERs, no per-row UPDATE pass** (confirmed by the
  existing `db/tests/fk_set_default.sql`).
- The tombstone **display** already works: `Avatar.svelte` renders a flat
  gray disc when `uid === TOMBSTONE_UID`
  (`web/src/lib/shared/model/constants.ts`), and `ItemsScreen.svelte`
  applies a `.tombstone` class (italic serif, `var(--stone-lt)`) to
  deleted-user attribution names. There is a Vitest case for it already.

What's missing is the deletion path itself: there is no `delete_account()`
RPC, no Settings entry, no delete screen, and the web app never calls the
sidecar/​session teardown that deletion requires.

This is a live-production step (`cairn.lynnscape.eu`): the delete flow
touches the auth surface (the `DELETE /auth/session` cookie shim runs
in-Caddy/​auth-proxy in prod) and the avatar sidecar. The teardown sequence
is therefore copied verbatim from existing, prod-tested call sites rather
than reinvented.

## Decisions

**Errcode `28000` on the guards.** `docs/account-deletion.md`'s function
snippet raises bare exceptions, but the sibling RPC `public.create_list()`
(`0004_domain_schema.sql`) raises its "not authenticated" / "cannot act as
the tombstone user" guards `USING errcode = '28000'`. We match that idiom so
the API surface is consistent and the negative pgTAP assertions can target a
stable SQLSTATE rather than a message string. (R2)

**Sole-member delete before auth-row delete.** The order in the function
body is not cosmetic: `list_members(user_id) ON DELETE CASCADE` fires when
`auth.users` is deleted, so if we deleted the auth row first, the
`NOT EXISTS (… other live member …)` probe would see an emptied
`list_members` and mis-classify shared lists as sole-member. The
sole-member sweep therefore runs first. (R1)

**Lean on the FKs; add nothing.** No migration ALTERs and no UPDATE pass to
repoint attribution — `ON DELETE SET DEFAULT` already does it atomically
inside the single `DELETE FROM auth.users`. The migration is purely the
function + grants. (Non-requirement: schema changes.)

**Inline confirmation, reuse `signOut()` — no new public route.** The root
guard (`web/src/routes/+layout.svelte`) bounces any `signed-out` user off
non-public paths to `/auth/login`. A dedicated `/account-deleted` route
would have to be whitelisted in `public-paths.ts` (and the auth-proxy mirror
is drift-guarded), which is more surface than the feature warrants. Instead
the delete screen renders its post-success confirmation **inline** while the
session store is still `signed-in` (the cookie is already cleared, so it's
inert), and the "Back to sign in" button calls the existing
`signOut()` to flip the store and let the guard redirect. (R10)

**Stub the export panel disabled.** Data export is step 12, unbuilt. The
"Want a copy of your data first?" panel is part of the designed layout, so
we render it but disable its Download action and leave a `TODO(step-12)`.
This was the user's explicit call over omitting it or linking a stub route.
(R8)

**`NavRow` gains a `tone` prop rather than a bespoke row.** The Settings
"Delete account" entry is a normal nav row that happens to be red. Rather
than fork a `DestructiveNavRow`, add an optional `tone: 'ink' |
'destructive'` to the existing `NavRow` and forward it to the inner
`Button` (which already supports `tone="destructive"`). Colour comes from
`var(--ember)`, never a literal. (R5)

**Tombstone display is out of scope.** It already works and is tested; this
plan does not touch `Avatar.svelte` or `ItemsScreen.svelte`. (Non-requirement.)

## Architecture

### New files

- **`db/migrations/0014_delete_account.sql`** — the `delete_account()`
  `SECURITY DEFINER` RPC plus its `REVOKE`/`GRANT`. Single `BEGIN; … COMMIT;`.
- **`db/tests/rpc_delete_account.sql`** — pgTAP: positive (cascade /
  set-default / sole-member), cross-actor, and negative (anon / unauth /
  tombstone) cases.
- **`web/src/routes/(app)/settings/delete-account/+page.svelte`** — thin
  route that renders the screen component.
- **`web/src/lib/account/components/DeleteAccountScreen.svelte`** — the
  full-screen delete flow (new `account` feature folder).
- **`web/src/lib/account/components/DeleteAccountScreen.test.ts`** — Vitest
  for the screen.
- **`web/e2e/delete-account.spec.ts`** — Playwright happy path.

### Modified files

- **`web/src/lib/shared/components/NavRow.svelte`** — add optional
  `tone: 'ink' | 'destructive'` prop, forwarded to `Button`; destructive
  colours lead icon + title with `var(--ember)`.
- **`web/src/lib/settings/components/SettingsScreen.svelte`** — add the
  "Delete account" row in the Account section below "Sign out".
- **`web/src/lib/settings/components/SettingsScreen.test.ts`** — assert the
  new row is present and navigates.
- **`web/src/lib/test/handlers.ts`** — add an MSW handler for
  `POST */rpc/delete_account` (the `*/avatars/me` and `*/auth/session`
  shapes already exist or follow existing handlers).
- **`docs/account-deletion.md`** — correct the "Future work" → "Export
  before delete — done" bullet (Phase 0).
- **`plans/0000_implementation_order.md`** — tick step 10 (final task,
  after merge).

### Teardown sequence (R9), copied from existing call sites

```
button(armed) ──▶ pgPost('/rpc/delete_account', {})        [postgrest.ts]
                      │ success
                      ├─▶ fetch('/avatars/me',{method:'DELETE'}).catch(()=>{})   [as in profile/+page.svelte removeAvatar()]
                      ├─▶ fetch(`${AUTH_BASE}/session`,{method:'DELETE'})         [as in session.svelte.ts signOut()]
                      └─▶ show confirmation view (store still 'signed-in')
                              └─ "Back to sign in" ──▶ signOut() ──▶ guard redirects to /auth/login
                   │ error
                   └─▶ show error inline, stay signed in, no teardown
```

## Phase structure

TDD ordering throughout: each task writes its failing test (RED) before the
implementation that greens it; the pgTAP test and the migration ship in the
same commit, as do each web component and its Vitest.

0. **Phase 0 — reconcile docs.** Correct the false "Export before delete —
   done" claim in `docs/account-deletion.md` so downstream steps don't
   reference a stale spec. Lands first, on its own commit. (R12)
1. **Phase 1 — DB: the RPC.** Add `db/tests/rpc_delete_account.sql` (RED)
   covering R1/R2/R3/R4 positive + negative, then
   `db/migrations/0014_delete_account.sql` (GREEN). Verify with
   `./scripts/test-db.sh`. (R1–R4)
2. **Phase 2 — Settings entry + NavRow tone.** Extend `NavRow` with the
   `tone` prop (RED Vitest on the destructive styling/forwarding), then add
   the "Delete account" row to `SettingsScreen` (RED row-present/navigates
   test, GREEN row). Navigation targets a route the next phase creates — see
   the toolchain-coupling note below. (R5)
3. **Phase 3 — Delete screen + teardown.** Build
   `DeleteAccountScreen.svelte` and its route: the explanatory copy (R6),
   the typed gate (R7), the disabled export panel (R8), the teardown
   sequence (R9), and the inline confirmation (R10), with Vitest (RED before
   GREEN) and the MSW handler. (R6–R10)
4. **Phase 4 — e2e + tick.** Playwright happy path (R11), then tick step 10
   in `plans/0000_implementation_order.md`.

**Toolchain coupling.** Phase 2's row navigates to
`/settings/delete-account`, a route Phase 3 creates. SvelteKit's `resolve()`
rejects unknown route IDs and `svelte-check` will balk. To keep producers
before consumers, **reorder so the route file exists first**: create the
`(app)/settings/delete-account/+page.svelte` route (even as a minimal
render-the-screen stub) at the start of Phase 3, or fold a one-line route
stub into Phase 2's Files list. Phase 2's tasks call this out and include
`pnpm check` in Verify so the coupling is caught in-task, not in CI. See
`docs/quality.md` → "Navigating to a not-yet-created SvelteKit route".

## Reference docs and skills

- **`docs/account-deletion.md`** — the canonical model, the function body,
  the API surface, and the user-facing copy. Source of truth for R1–R10.
- **`docs/ui.md`** — full-screen-vs-sheet, destructive rows, button-pair
  order, the delete-account visual treatment, and the tombstone styling.
- **`docs/testing.md`** — the three test layers; pgTAP positive+negative
  rule for the new RPC.
- **`docs/quality.md`** — the not-yet-created-route escape pattern for the
  Phase 2/3 coupling.
- **`design/cairn-screens.jsx`** (`DeleteAccountScreen` ~1369–1499, Account
  section ~1233–1244) — layout/copy/ordering reference **only**; implement
  with existing primitives and tokens, do not port the JSX.

## Open questions

None. The one decision that needed the user (export panel handling) is
resolved: stub it disabled (R8).
