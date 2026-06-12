# TODO

1. [ ] **API query hygiene: omit user_id when RLS already scopes the row** —
   PostgREST queries that operate on rows the RLS policy already restricts to
   the current user should not repeat `user_id=eq.<me>` (or equivalent) in the
   query string. RLS is the enforcement layer; duplicating its conditions in
   application code blurs the boundary and creates a maintenance coupling.
   Concrete case already fixed: `DELETE /votes?item_id=eq.<uuid>`. Audit sweep:
   when building new API calls, check whether the targeted rows are already
   scoped by an `authenticated`-role policy keyed on `public.uid()`. Only
   include identity filters where they add information RLS doesn't already
   enforce (e.g. `PATCH /profiles?id=eq.<my-uid>` is fine — PostgREST needs
   the PK to address the right row, not as a security gate).

2. [ ] **Audit inline object types in model files** — scan `src/lib/*/model/*.ts`
   for anonymous inline shapes on exported types (e.g. `{ user_id: string; display_name: string; value: number }[]`)
   and consider extracting them as named exported types. Named types are easier
   to follow at call sites and can be imported by tests and components without
   repeating the shape. Do on a quiet branch; no behaviour change needed.

3. [ ] **No type erasure (`as unknown as T`)** — double-cast expressions are a
   code smell that silences the type-checker rather than fixing it. Prefer:
   (a) an explicit intermediate `unknown` variable with narrowing, (b) accessing
   a typed property directly on the cast expression (e.g.
   `((await res.json()) as { version: number }).version`), or (c) a type guard.
   If a double-cast is genuinely the only option, it needs a comment explaining
   why — and a reviewer should push back.

4. [ ] **Cron script to hard-delete dormant unverified users** — bots and drive-by
   visitors may submit an e-mail address but never click the magic link. These
   accounts accumulate in GoTrue's `auth.users` table and in `public.profiles`,
   holding an e-mail address we have no reason to keep. A nightly script should
   hard-delete users who: (a) never confirmed their e-mail (`email_confirmed_at IS
   NULL`), or (b) confirmed but never created a list or item and last signed in
   more than N days ago (exact threshold TBD — 30 days is a reasonable starting
   point). Deletion must be a hard-delete (`DELETE`, not soft-delete) to purge the
   e-mail address from the database entirely. Cascade rules must cover
   `public.profiles` and any other tables that reference `auth.users.id`. Model
   after `scripts/sweep-avatars.sh`: pure shell + psql, `DATABASE_URL` env var,
   ShellCheck + shfmt clean, with a matching entry in `crontab.example`.

6. [ ] **Migrate inline `icon-btn` buttons to `IconButton` / `MoreButton`** —
   several files duplicate the `.icon-btn` CSS block instead of using the
   `IconButton` (and `MoreButton`) components introduced in step 0601. Refactor
   after 0601 merges; no behaviour change needed.
   - `TopBar.svelte:28` — back-chevron button (highest leverage: every screen)
   - `profile/+page.svelte:140` — back button in the TopBar slot
   - `profile/+page.svelte:227` — disabled pencil icon (avatar, not yet implemented)
   - `profile/+page.svelte:231` — pencil icon to enter edit mode
   - `AvatarCropScreen.svelte:145` — cancel button during avatar crop
   - `ListsScreen.svelte:47` — Settings gear (covered by task 4.1 of plan 0601)
   - `ItemsScreen.svelte:71` — `⋮` button in TopBar (covered by task 4.2 of plan 0601)

7. [ ] **Centre edit sheets vertically instead of pinning them to the bottom**
   — on phones, the on-screen keyboard covers the bottom of the viewport, so
   any bottom-anchored sheet with a focusable text field ends up hidden behind
   the keyboard the moment the input focuses. Affected sheets:
   - `RenameListSheet` (single-field)
   - `EditDescriptionSheet` (single-field)
   - `AddEditItemSheet` (two-field — add and edit item)
   - `CreateListSheet` (two-field, and visually inconsistent with the others —
     fold its styling into the same treatment while we're here)
   Either centre these sheets vertically when an input is focused, or use
   `visualViewport` to keep them above the keyboard. Whatever the approach,
   apply it uniformly to every sheet that contains a focusable text field.

8. [ ] **Show "set your name" banner when display name is "New User"** — when a
   user's `display_name` is `"New User"` (the GoTrue default for unverified
   accounts), show a dismissable banner — similar in style to the pending-invite
   banner — prompting them to set a display name and linking to the Profile
   screen. The banner should appear on the main lists screen and disappear once
   the name is changed.

9. [ ] **Replace the interim `auth-proxy` Node sidecar with the in-Caddy shim**
   — the production cookie↔JWT shim currently runs as a standalone Node service
   (`auth-proxy/`, added in plan 1500), which ports the dev Vite-proxy logic
   (`web/vite.config.ts`) into a long-running process. This is deliberately
   interim and feels hacky: it's a *second* Node service whose only job is auth
   translation, and `docs/architecture.md` ("JWT storage") explicitly states the
   shim should live *inside Caddy* with no separate Node auth service. The
   convergence target is a small custom Caddy Go module (or a Caddy-native
   equivalent) that plants the HttpOnly `cairn_session` cookie on
   `/auth/verify`/`/auth/token`, strips tokens from the response body, and
   attaches the bearer on `/auth/user` — folding `auth-proxy`'s responsibilities
   into the reverse proxy that already routes `/auth/*`. When that lands: delete
   the `auth-proxy/` package, drop its service from `docker-compose.prod.yml`,
   remove its `/auth/*` route in `caddy/Caddyfile.prod`, and reconcile
   `docs/architecture.md` back to the no-Node-auth-service stance. Keep the
   shared `auth-paths.ts` as the single source of truth for the narrowing lists
   regardless of where the shim runs.

5. [ ] **Font size setting must scale the whole app, not just the container
   width** — the Settings font-size preference (XS/S/M/L/XL, stored in
   `localStorage`) currently only affects `--app-max-w`. All pixel values in
   the design JSX are specified at Medium; the full app — type sizes, padding,
   row heights, icon sizes, spacing — should scale proportionally when the
   user changes the setting. The mechanism is a single scale factor on the
   root `font-size` with all sizes expressed in `rem` (per `docs/ui.md`
   "Appearance"). Exceptions: the FAB and chrome icon-buttons (back arrow,
   gear) stay at a fixed size regardless of font scale. This is a
   cross-cutting change touching every screen and is out of scope until all
   screens are built.

10. [ ] **pgTAP coverage for invitation cascade on account deletion** — the
    `invitations` table cascades on both `created_by` and `target_user_id`
    (`ON DELETE CASCADE` → `auth.users`), so deleting an account hard-deletes
    every pending invite the user sent *and* received. This behaviour is
    guaranteed by the FK constraints and documented (`docs/invites.md`,
    `docs/data-model.md`), but no pgTAP test pins it: the deletion tests
    (`db/tests/rpc_delete_account.sql`, `db/tests/admin_delete_account_as.sql`)
    cover lists, items, votes, and memberships but never seed an invitation,
    and `db/tests/invite_cascades.sql` only exercises invite-policy triggers.
    Add assertions to both deletion tests (or a dedicated test) that seed
    pending invites in both directions and confirm they're gone after
    `public.delete_account()` and `admin.delete_account_as()`. RLS/cascade is
    the security boundary — an untested cascade is an unverified claim.

11. [ ] **Reclaim orphaned lists when the last member leaves** — leaving a list
    soft-deletes only the membership row (`PATCH /list_members?...{deleted_at}`
    in `web/src/lib/list/components/ListOverflowSheet.svelte:87`); nothing
    touches the list itself. When the last live member leaves, the list row
    persists with zero live members: invisible to everyone via RLS
    (`is_list_member()` returns false for all), but never reclaimed. This is
    asymmetric with account deletion, which *does* hard-delete sole-member
    lists (`db/migrations/0014_delete_account.sql:53-62`). `docs/account-deletion.md`
    even calls "a list with no live members" an implied dead state that
    deletion gives "an explicit cleanup point" — leaving gets none. Decide the
    intended semantic (likely: hard-delete the list and cascade its items/votes
    when the last live membership is soft-deleted, mirroring the deletion path)
    and enforce it — a trigger on `list_members` soft-delete, or fold the leave
    flow into an RPC that checks for remaining live members. Ships with pgTAP
    coverage for the last-member-leaves case.

12. [ ] **Back button dead-ends on cold loads with empty history** — the TopBar
    Back button calls `history.back()` unconditionally
    (`web/src/lib/shared/components/TopBar.svelte:32`). When Cairn is opened
    directly onto a deep route — a reopened browser restoring a list tab, or a
    pasted/bookmarked URL like `/lists/<uuid>` — there is no prior in-app
    history entry, so `history.back()` does nothing and the user is stranded.
    Fix: when the back-history is empty (no in-app referrer), navigate to the
    home/lists screen instead of `history.back()`. Consider swapping the
    chevron-left icon for a `home` icon (lucide has one) in that case, so the
    affordance matches the destination. Applies anywhere TopBar shows the
    default back button.

13. [ ] **Review the "adding by e-mail is two-way" claim in the circles
    explanation** — `docs/circles.md` states that adding someone by e-mail is
    two-way. This isn't clear and may be wrong: the circle model is meant to be
    one-directional and invisible to the other side (see CLAUDE.md
    conventions). Re-read the claim, confirm what the intended behaviour
    actually is, and either correct the copy or clarify the wording so it
    doesn't contradict the one-directional model.

14. [ ] **Don't use "avatar" in user-facing copy — say "profile picture"** —
    "avatar" reads as very 2010. It's fine in authorial prose (docs, comments,
    code identifiers), but user-facing text should say "profile picture"
    instead. Sweep rendered UI strings for "avatar"/"Avatar" and replace with
    "profile picture" (sentence-cased appropriately). Leave code identifiers,
    filenames, component names (e.g. `AvatarCropScreen`), and `docs/` prose
    alone — this is about what the user reads on screen only.

16. [ ] **Also send a one-time code (OTP) alongside the magic link** — the
    sign-in / sign-up e-mail currently carries only a magic link, which forces
    the user to continue on whatever device opens the e-mail. That's
    inconvenient: a desktop user will probably receive the e-mail on their
    phone, then has to either switch devices or forward the link. Send a
    short one-time code in the same e-mail, and turn the "we've sent you an
    e-mail" screen into one with an **input box for the OTP** — so the user
    can finish authenticating on the device they started on, regardless of
    where they read the e-mail. (GoTrue already supports e-mail OTP; this is
    about wiring the code into the e-mail template and adding the
    code-entry/verify step to the sent-email screen.)

15. [ ] **Trim the Settings screen — drop the text-size preview, revisit
    ordering** — `SettingsScreen.svelte` is getting long and the section order
    reads oddly (Profile, People, Appearance, Text size, Privacy & data,
    Recovery, Account). Remove the text-size **preview card** (the
    `.size-preview` block with the "Bringing Up Baby" sample) — the segmented
    A-size control already shows the effect live, so the preview is redundant
    bulk. While there, reconsider the section ordering so related groups sit
    together (e.g. Appearance + Text size as one visual cluster, the
    data/account cluster at the bottom). Keep the `data-test` hooks the tests
    rely on. Also rename the **"Appearance"** section heading to **"Colour
    theme"** (British spelling) — it only controls the light/dark theme, so
    the broader "Appearance" label overpromises.
