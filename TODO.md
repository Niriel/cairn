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
